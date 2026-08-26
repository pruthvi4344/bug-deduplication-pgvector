"""Core cleaning, embedding, retrieval, benchmark, and plan-inspection services. This module contains essential functions for processing and analyzing bug reports. It includes utilities for text normalization, embedding generation, database queries, and benchmarking.

Functions:
- clean_text(value: str) -> str: Normalizes text consistently before import and search.
- encoder() -> SentenceTransformer: Loads MiniLM only once per API process.
- embed(value: str) -> list[float]: Returns a normalized 384-dimensional semantic embedding.
- _set_search_mode(db: Session, index_type: str) -> None: Applies transaction-local PostgreSQL planner/index controls for a search mode.
- create_bug(db: Session, item: BugCreate) -> BugReport: Creates a new bug report entry in the database.
- search(db: Session, request: SearchRequest) -> List[Tuple[BugReport, float]]: Performs a search for bug reports based on the query and returns a list of results with similarities.
- _vector_literal(vector: list[float]) -> str: Serializes a trusted model output for PostgreSQL CAST(... AS vector).

Classes:
- BenchmarkRun: Represents the results of a benchmark run, including recall metrics and latency statistics.
- BugReport: Represents a bug report entry in the database, including text, cleaned text, and embedding.
- BugCreate: A data transfer object for creating new bug report entries.
- QueryPlanOut: A data transfer object for representing the output of a query plan.
- SearchRequest: A data transfer object for representing a search request, including query, top-k results, and index type.

This module is crucial for the functionality of the bug tracking system, providing the necessary tools for processing bug reports and analyzing their similarities.
"""
import html
import json
import copy
import re
import time
from functools import lru_cache
from typing import Any, List, Tuple

import numpy as np
from sentence_transformers import SentenceTransformer
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .config import get_settings
from .models import BenchmarkRun, BugReport
from .schemas import BugCreate, QueryPlanOut, SearchRequest

def clean_text(value: str) -> str:
    """Normalize text consistently before import and search. This function removes extra spaces and strips HTML and URLs from the text. It also unescapes HTML entities."""
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]*>|https?://\S+', ' ', html.unescape(value))).strip()

@lru_cache
def encoder() -> SentenceTransformer:
    """Load MiniLM only once per API process. This function is memoized to save resources when called multiple times within the same process."""
    return SentenceTransformer(get_settings().model_name)

def embed(value: str) -> list[float]:
    """Return a normalized 384-dimensional semantic embedding. This function uses the encoder to transform the cleaned text into a semantic embedding and normalizes the embedding for consistency."""
    return encoder().encode(clean_text(value), normalize_embeddings=True).tolist()

def _set_search_mode(db: Session, index_type: str) -> None:
    """Apply transaction-local PostgreSQL planner/index controls for a search mode. This function adjusts PostgreSQL settings based on the index_type to optimize search performance."""
    if index_type not in {\'exact\', \'hnsw\', \'ivfflat\'}:
        raise ValueError('index_type must be exact, hnsw, or ivfflat')
    if index_type == \'exact\':
        db.execute(text('SET LOCAL enable_indexscan=off'))
        db.execute(text('SET LOCAL enable_bitmapscan=off'))
    elif index_type == \'hnsw\':
        db.execute(text('SET LOCAL hnsw.ef_search=80'))
    elif index_type == \'ivfflat\':
        db.execute(text('SET LOCAL ivfflat.probes=20'))

def create_bug(db: Session, item: BugCreate) -> BugReport:
    cleaned = clean_text(f'{item.summary}. {item.description}')
    entity = BugReport(**item.model_dump(), cleaned_text=cleaned, embedding=embed(cleaned))
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return entity

def search(db: Session, request: SearchRequest) -> List[Tuple[BugReport, float]]:
    _set_search_mode(db, request.index_type)
    distance = BugReport.embedding.cosine_distance(embed(request.query))
    stmt = select(BugReport, (1 - distance).label('similarity'))
    if request.product:
        stmt = stmt.where(BugReport.product == request.product)
    if request.component:
        stmt = stmt.where(BugReport.component == request.component)
    if request.exclude_id:
        stmt = stmt.where(BugReport.id != request.exclude_id)
    return db.execute(stmt.order_by(distance).limit(request.k)).all()

def _vector_literal(vector: list[float]) -> str:
    """Serialize a trusted model output for PostgreSQL CAST(... AS vector). This function converts a list of floats into a string representation of a vector that can be used in PostgreSQL queries."""
    return '[' + ','.join(f'{value:.8f}' for value in vector) + ']