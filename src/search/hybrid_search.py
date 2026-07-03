"""
Role: Index Engineering, Access Methods, and Complex Query Execution

Combines relational B-tree filters (operating_system, architecture,
component_type, resolution_status) with pgvector KNN search into a
single-stage SQL query, per the hybrid query template in Section V of
the proposal.

Builds on knn_retriever.py's session-tuning helpers and Jashleen's
connection pool in src/utils/db_connection.py.
"""

import logging
from typing import Optional, Sequence

from pgvector.psycopg import register_vector

from src.utils.db_connection import get_db_connection
from src.search.knn_retriever import (
    EMBEDDING_DIM,
    set_ivfflat_probes,
    set_hnsw_ef_search,
    _validate_vector,
)

logger = logging.getLogger("Hybrid_Search")

# Whitelist of columns that may be used as equality filters. Column names
# can never be safely passed as bound parameters in psycopg (bound params
# only work for values, not identifiers), so instead we validate against
# this fixed whitelist before interpolating the column name into the SQL
# string. Values themselves are always bound parameters -- never
# interpolated directly -- so this remains injection-safe.
_ALLOWED_FILTER_COLUMNS = {
    "operating_system",
    "architecture",
    "component_type",
    "resolution_status",
}


def build_hybrid_query(filters: dict) -> str:
    """
    Build the parameterized hybrid SQL query string for the given filter
    columns. Filter values are NOT included here -- only column names,
    validated against the whitelist. Values are bound at execution time.
    """
    unknown = set(filters) - _ALLOWED_FILTER_COLUMNS
    if unknown:
        raise ValueError(
            f"Filtering on {unknown} is not supported. "
            f"Allowed columns: {_ALLOWED_FILTER_COLUMNS}"
        )

    where_clause = " AND ".join(f"{col} = %({col})s" for col in filters)
    where_sql = f"WHERE {where_clause}" if where_clause else ""

    return f"""
        SELECT id, summary, reported_at,
               description_embedding <=> %(query_vector)s AS distance
        FROM bug_reports
        {where_sql}
        ORDER BY description_embedding <=> %(query_vector)s
        LIMIT %(top_k)s;
    """


def hybrid_search(
    query_vector: Sequence[float],
    filters: Optional[dict] = None,
    top_k: int = 5,
    index_type: str = "hnsw",
    ivfflat_probes: int = 10,
    hnsw_ef_search: int = 40,
) -> list[dict]:
    """
    Run the hybrid metadata + vector similarity query (Section V template):
    apply relational equality filters first, then rank the remaining rows
    by cosine distance to query_vector.

    Parameters
    ----------
    query_vector : Sequence[float]
        384-dim embedding to search against.
    filters : dict, optional
        Column -> value equality filters, e.g.
        {"operating_system": "Linux", "architecture": "x86_64"}.
        Only columns in _ALLOWED_FILTER_COLUMNS are accepted.
        Omit or pass {} to fall back to a pure KNN search (equivalent to
        knn_retriever.knn_search).
    top_k : int
        Number of nearest neighbors to return.
    index_type : {"ivfflat", "hnsw"}
        Which ANN tuning knob to set before querying (see knn_retriever.py
        docstring for caveats on this not forcing planner index choice).
    ivfflat_probes : int
        IVFFlat probe count, used only if index_type == "ivfflat".
    hnsw_ef_search : int
        HNSW ef_search value, used only if index_type == "hnsw".

    Returns
    -------
    list[dict]
        Each dict has keys: id, summary, reported_at, distance.
    """
    filters = filters or {}
    _validate_vector(query_vector)

    query_sql = build_hybrid_query(filters)
    params = {**filters, "query_vector": query_vector, "top_k": top_k}

    with get_db_connection() as conn:
        register_vector(conn)
        with conn.cursor() as cur:
            if index_type == "ivfflat":
                set_ivfflat_probes(cur, ivfflat_probes)
            elif index_type == "hnsw":
                set_hnsw_ef_search(cur, hnsw_ef_search)
            else:
                raise ValueError("index_type must be 'ivfflat' or 'hnsw'.")

            cur.execute(query_sql, params)
            columns = [desc.name for desc in cur.description]
            rows = cur.fetchall()

    results = [dict(zip(columns, row)) for row in rows]
    logger.info(
        f"hybrid_search returned {len(results)} results "
        f"(filters={filters}, index_type={index_type})."
    )
    return results


if __name__ == "__main__":
    # Manual smoke test. Requires a populated bug_reports table with at
    # least one row matching the filter values below, plus a built index.
    import numpy as np

    logging.basicConfig(level=logging.INFO)

    dummy_vector = np.random.rand(EMBEDDING_DIM).tolist()
    results = hybrid_search(
        dummy_vector,
        filters={"operating_system": "Linux", "architecture": "x86_64"},
        top_k=5,
        index_type="hnsw",
    )
    for row in results:
        print(row)