"""
Sentence-BERT model loader for 384-dimensional bug report embeddings.
"""

from __future__ import annotations

import argparse
from functools import lru_cache
from pathlib import Path

from sentence_transformers import SentenceTransformer


MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_CACHE_DIR = Path("models/sentence-transformers")
EMBEDDING_DIMENSION = 384


def get_embedding_dimension(model: SentenceTransformer) -> int:
    """Return the model embedding dimension across SentenceTransformer versions."""
    if hasattr(model, "get_embedding_dimension"):
        return model.get_embedding_dimension()
    return model.get_sentence_embedding_dimension()


@lru_cache(maxsize=1)
def load_embedding_model(
    model_name: str = MODEL_NAME,
    cache_dir: str | Path = MODEL_CACHE_DIR,
) -> SentenceTransformer:
    """Load and cache the Sentence-BERT model locally."""
    cache_path = Path(cache_dir)
    cache_path.mkdir(parents=True, exist_ok=True)
    model = SentenceTransformer(model_name, cache_folder=str(cache_path))

    dimension = get_embedding_dimension(model)
    if dimension != EMBEDDING_DIMENSION:
        raise ValueError(
            f"Expected {EMBEDDING_DIMENSION} dimensions from {model_name}, got {dimension}."
        )

    return model


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download/cache the Sentence-BERT model.")
    parser.add_argument("--model-name", default=MODEL_NAME)
    parser.add_argument("--cache-dir", type=Path, default=MODEL_CACHE_DIR)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    loaded = load_embedding_model(args.model_name, args.cache_dir)
    print(
        "Model ready:",
        args.model_name,
        f"({get_embedding_dimension(loaded)} dimensions)",
    )
