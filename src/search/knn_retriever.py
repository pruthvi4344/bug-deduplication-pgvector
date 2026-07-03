"""
Role: Index Engineering, Access Methods, and Complex Query Execution

Low-level interface for executing raw K-Nearest Neighbor (KNN) vector
similarity queries against bug_reports.description_embedding, with no
relational filtering applied. This isolates pure ANN index performance
(IVFFlat vs HNSW) from the relational filter overhead that
hybrid_search.py adds on top.

Reuses the connection pool defined in src/utils/db_connection.py
rather than opening its own connections.
"""

import logging
from typing import Sequence

from pgvector.psycopg import register_vector

from src.utils.db_connection import get_db_connection

logger = logging.getLogger("KNN_Retriever")

EMBEDDING_DIM = 384

# Raw KNN query template -- no WHERE clause, pure vector ranking.
_RAW_KNN_QUERY = """
    SELECT id, summary, reported_at,
           description_embedding <=> %(query_vector)s AS distance
    FROM bug_reports
    ORDER BY description_embedding <=> %(query_vector)s
    LIMIT %(top_k)s;
"""


def set_ivfflat_probes(cursor, probes: int = 10) -> None:
    """
    Set the IVFFlat probe count for the current session only.
    Higher probes = more clusters searched = better recall, slower query.
    Has no effect if the planner doesn't end up choosing the IVFFlat index.
    """
    cursor.execute("SET ivfflat.probes = %s;", (probes,))


def set_hnsw_ef_search(cursor, ef_search: int = 40) -> None:
    """
    Set HNSW's dynamic candidate list size for the current session only.
    Higher ef_search = better recall, slower query. Has no effect if the
    planner doesn't end up choosing the HNSW index.
    """
    cursor.execute("SET hnsw.ef_search = %s;", (ef_search,))


def _validate_vector(query_vector: Sequence[float]) -> None:
    if len(query_vector) != EMBEDDING_DIM:
        raise ValueError(
            f"Expected a {EMBEDDING_DIM}-dimensional embedding, "
            f"got {len(query_vector)}."
        )


def knn_search(
    query_vector: Sequence[float],
    top_k: int = 5,
    index_type: str = "hnsw",
    ivfflat_probes: int = 10,
    hnsw_ef_search: int = 40,
) -> list[dict]:
    """
    Execute a raw KNN vector similarity search against bug_reports.

    Parameters
    ----------
    query_vector : Sequence[float]
        384-dim embedding to search against (produced by Nancy's
        src/embeddings/generator.py).
    top_k : int
        Number of nearest neighbors to return.
    index_type : {"ivfflat", "hnsw"}
        Which ANN tuning knob to set before querying. This sets a session
        parameter -- it does NOT force the planner to use that specific
        index. For a rigorous A/B benchmark, build one index at a time
        (see queries.sql, section 4) rather than relying on this alone.
    ivfflat_probes : int
        IVFFlat probe count, used only if index_type == "ivfflat".
    hnsw_ef_search : int
        HNSW ef_search value, used only if index_type == "hnsw".

    Returns
    -------
    list[dict]
        Each dict has keys: id, summary, reported_at, distance.
        distance is cosine distance (0 = identical, 2 = opposite).
    """
    _validate_vector(query_vector)

    with get_db_connection() as conn:
        register_vector(conn)
        with conn.cursor() as cur:
            if index_type == "ivfflat":
                set_ivfflat_probes(cur, ivfflat_probes)
            elif index_type == "hnsw":
                set_hnsw_ef_search(cur, hnsw_ef_search)
            else:
                raise ValueError("index_type must be 'ivfflat' or 'hnsw'.")

            cur.execute(
                _RAW_KNN_QUERY,
                {"query_vector": query_vector, "top_k": top_k},
            )
            columns = [desc.name for desc in cur.description]
            rows = cur.fetchall()

    results = [dict(zip(columns, row)) for row in rows]
    logger.info(
        f"knn_search returned {len(results)} results (index_type={index_type})."
    )
    return results


if __name__ == "__main__":
    # Manual smoke test. Requires a populated bug_reports table with at
    # least one row and a built index (see database/indexes.sql).
    import numpy as np

    logging.basicConfig(level=logging.INFO)

    dummy_vector = np.random.rand(EMBEDDING_DIM).tolist()
    results = knn_search(dummy_vector, top_k=5, index_type="hnsw")
    for row in results:
        print(row)