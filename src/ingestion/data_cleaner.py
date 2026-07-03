"""
Text cleansing utilities for Mozilla Bugzilla records.

This module standardizes raw bug report text before embedding generation:
- trims whitespace and normalizes line breaks
- removes HTML tags and common escaped entities
- fills missing metadata with stable defaults
- builds a single text field suitable for Sentence-BERT encoding
"""

from __future__ import annotations

import argparse
import html
import re
from pathlib import Path

import pandas as pd


DEFAULT_INPUT = Path("data/raw/mozilla_bugzilla.csv")
DEFAULT_OUTPUT = Path("data/processed/mozilla_bugzilla_clean.csv")

TEXT_COLUMNS = ("summary", "description")
REQUIRED_COLUMNS = (
    "bug_id",
    "summary",
    "description",
    "resolution_status",
    "operating_system",
    "architecture",
    "component_type",
)


def clean_text(value: object) -> str:
    """Return normalized text safe for downstream embedding models."""
    if value is None or pd.isna(value):
        return ""

    text = html.unescape(str(value))
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"https?://\S+|www\.\S+", " ", text)
    text = re.sub(r"[\r\n\t]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize_bug_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Clean a raw Bugzilla dataframe and add an embedding-ready text column."""
    missing = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    if missing:
        raise ValueError(f"Input CSV is missing required columns: {', '.join(missing)}")

    cleaned = df.copy()
    cleaned["bug_id"] = pd.to_numeric(cleaned["bug_id"], errors="coerce").astype("Int64")

    for column in TEXT_COLUMNS:
        cleaned[column] = cleaned[column].map(clean_text)

    cleaned["resolution_status"] = (
        cleaned["resolution_status"].fillna("UNRESOLVED").astype(str).str.strip().str.upper()
    )
    cleaned["operating_system"] = cleaned["operating_system"].fillna("Unknown").map(clean_text)
    cleaned["architecture"] = cleaned["architecture"].fillna("Unknown").map(clean_text)
    cleaned["component_type"] = cleaned["component_type"].fillna("General").map(clean_text)

    cleaned = cleaned.dropna(subset=["bug_id"])
    cleaned = cleaned[(cleaned["summary"] != "") | (cleaned["description"] != "")]
    cleaned["embedding_text"] = (
        cleaned["summary"].fillna("") + ". " + cleaned["description"].fillna("")
    ).map(clean_text)

    return cleaned.reset_index(drop=True)


def clean_dataset(input_path: Path = DEFAULT_INPUT, output_path: Path = DEFAULT_OUTPUT) -> Path:
    """Read a raw CSV, clean it, and write the processed CSV."""
    df = pd.read_csv(input_path)
    cleaned = normalize_bug_dataframe(df)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cleaned.to_csv(output_path, index=False)
    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Clean raw Mozilla Bugzilla CSV records.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    written_path = clean_dataset(args.input, args.output)
    print(f"Cleaned dataset written to {written_path}")
