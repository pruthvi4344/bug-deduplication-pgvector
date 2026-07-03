"""
Generate 384-dimensional embeddings for cleaned bug report text.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
from tqdm import tqdm

from src.embeddings.model_loader import EMBEDDING_DIMENSION, load_embedding_model


DEFAULT_INPUT = Path("data/processed/mozilla_bugzilla_clean.csv")
DEFAULT_OUTPUT = Path("data/processed/mozilla_bugzilla_embeddings.jsonl")


def batched(values: list[str], batch_size: int) -> Iterable[list[str]]:
    for start in range(0, len(values), batch_size):
        yield values[start : start + batch_size]


def vector_to_pgvector(vector: Iterable[float]) -> str:
    """Format a dense vector as pgvector text input."""
    return "[" + ",".join(f"{float(value):.8f}" for value in vector) + "]"


def generate_embeddings(texts: list[str], batch_size: int = 32) -> np.ndarray:
    """Encode text into normalized 384-dimensional vectors."""
    model = load_embedding_model()
    encoded_batches: list[np.ndarray] = []

    for batch in tqdm(list(batched(texts, batch_size)), desc="Generating embeddings"):
        embeddings = model.encode(
            batch,
            batch_size=batch_size,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        encoded_batches.append(np.asarray(embeddings, dtype=np.float32))

    if not encoded_batches:
        return np.empty((0, EMBEDDING_DIMENSION), dtype=np.float32)

    return np.vstack(encoded_batches)


def write_embeddings_jsonl(df: pd.DataFrame, embeddings: np.ndarray, output_path: Path) -> Path:
    """Write records and vectors to JSONL for reproducible loading."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8") as handle:
        for row, vector in zip(df.to_dict("records"), embeddings):
            payload = {
                "bug_id": int(row["bug_id"]),
                "summary": row["summary"],
                "description": row["description"],
                "resolution_status": row["resolution_status"],
                "operating_system": row["operating_system"],
                "architecture": row["architecture"],
                "component_type": row["component_type"],
                "embedding": vector.astype(float).tolist(),
            }
            handle.write(json.dumps(payload) + "\n")

    return output_path


def insert_embeddings_into_postgres(df: pd.DataFrame, embeddings: np.ndarray) -> int:
    """Insert cleaned records and generated vectors into bug_reports."""
    from src.utils.db_connection import get_db_connection

    insert_sql = """
        INSERT INTO bug_reports (
            summary,
            resolution_status,
            operating_system,
            architecture,
            component_type,
            description_embedding
        )
        VALUES (%s, %s, %s, %s, %s, %s::vector)
        RETURNING id;
    """

    inserted = 0
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            for row, vector in zip(df.to_dict("records"), embeddings):
                cur.execute(
                    insert_sql,
                    (
                        row["summary"],
                        row["resolution_status"],
                        row["operating_system"],
                        row["architecture"],
                        row["component_type"],
                        vector_to_pgvector(vector),
                    ),
                )
                inserted += 1
        conn.commit()

    return inserted


def run(input_path: Path, output_path: Path, batch_size: int, load_db: bool) -> Path:
    df = pd.read_csv(input_path)
    if "embedding_text" not in df.columns:
        raise ValueError("Input CSV must include an embedding_text column from data_cleaner.py.")

    texts = df["embedding_text"].fillna("").astype(str).tolist()
    embeddings = generate_embeddings(texts, batch_size=batch_size)
    written_path = write_embeddings_jsonl(df, embeddings, output_path)

    if load_db:
        inserted = insert_embeddings_into_postgres(df, embeddings)
        print(f"Inserted {inserted} embedded bug reports into PostgreSQL.")

    return written_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate bug report vector embeddings.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--load-db", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    output = run(args.input, args.output, args.batch_size, args.load_db)
    print(f"Embeddings written to {output}")
