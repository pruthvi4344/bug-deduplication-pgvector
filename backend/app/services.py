"""Core cleaning, embedding, retrieval, benchmark, and plan-inspection services."""
import html
import json
import copy
import re
import time
from functools import lru_cache
from typing import Any

import numpy as np
from sentence_transformers import SentenceTransformer
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .config import get_settings
from .models import BenchmarkRun, BugReport
from .schemas import BugCreate, QueryPlanOut, SearchRequest

def clean_text(value: str) -> str:
    """Normalize text consistently before import and search."""
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]*>|https?://\S+', ' ', html.unescape(value))).strip()

@lru_cache
def encoder() -> SentenceTransformer:
    """Load MiniLM only once per API process."""
    return SentenceTransformer(get_settings().model_name)

def embed(value: str) -> list[float]:
    """Return a normalized 384-dimensional semantic embedding."""
    return encoder().encode(clean_text(value), normalize_embeddings=True).tolist()

def _set_search_mode(db: Session, index_type: str) -> None:
    """Apply transaction-local PostgreSQL planner/index controls for a search mode."""
    if index_type not in {'exact', 'hnsw', 'ivfflat'}:
        raise ValueError('index_type must be exact, hnsw, or ivfflat')
    if index_type == 'exact':
        db.execute(text('SET LOCAL enable_indexscan=off'))
        db.execute(text('SET LOCAL enable_bitmapscan=off'))
    elif index_type == 'hnsw':
        db.execute(text('SET LOCAL hnsw.ef_search=80'))
    elif index_type == 'ivfflat':
        db.execute(text('SET LOCAL ivfflat.probes=20'))

def create_bug(db: Session, item: BugCreate) -> BugReport:
    cleaned = clean_text(f'{item.summary}. {item.description}')
    entity = BugReport(**item.model_dump(), cleaned_text=cleaned, embedding=embed(cleaned))
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return entity

def search(db: Session, request: SearchRequest):
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
    """Serialize a trusted model output for PostgreSQL CAST(... AS vector)."""
    return '[' + ','.join(f'{value:.8f}' for value in vector) + ']'

def _collect_plan_details(plan: dict[str, Any], nodes: list[str], indexes: list[str]) -> None:
    """Traverse PostgreSQL's JSON EXPLAIN plan and collect readable plan evidence."""
    node_type = plan.get('Node Type')
    if node_type:
        nodes.append(node_type)
    index_name = plan.get('Index Name')
    if index_name:
        indexes.append(index_name)
    for child in plan.get('Plans', []):
        _collect_plan_details(child, nodes, indexes)

def _redact_query_vector(plan: dict[str, Any]) -> dict[str, Any]:
    """Hide the long 384-number query vector while retaining a readable plan."""
    safe_plan = copy.deepcopy(plan)
    def visit(node: dict[str, Any]) -> None:
        order_by = node.get('Order By')
        if isinstance(order_by, str) and '::vector' in order_by:
            node['Order By'] = re.sub(r"'\[[^']+\]'::vector", "'[query vector]'::vector", order_by)
        for child in node.get('Plans', []):
            visit(child)
    visit(safe_plan)
    return safe_plan

def explain_search(db: Session, request: SearchRequest) -> QueryPlanOut:
    """Execute EXPLAIN ANALYZE for the same filtered vector query used by search."""
    _set_search_mode(db, request.index_type)
    predicates = ['1 = 1']
    parameters: dict[str, Any] = {
        'embedding': _vector_literal(embed(request.query)),
        'limit': request.k,
    }
    if request.product:
        predicates.append('product = :product')
        parameters['product'] = request.product
    if request.component:
        predicates.append('component = :component')
        parameters['component'] = request.component
    if request.exclude_id:
        predicates.append('id <> :exclude_id')
        parameters['exclude_id'] = request.exclude_id
    statement = text(f'''EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT id, summary, 1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
        FROM bug_reports
        WHERE {' AND '.join(predicates)}
        ORDER BY embedding <=> CAST(:embedding AS vector)
        LIMIT :limit''')
    result = db.execute(statement, parameters).scalar_one()
    payload = json.loads(result) if isinstance(result, str) else result
    details = payload[0]
    root = _redact_query_vector(details['Plan'])
    nodes: list[str] = []
    indexes: list[str] = []
    _collect_plan_details(root, nodes, indexes)
    return QueryPlanOut(
        index_type=request.index_type,
        planning_time_ms=details.get('Planning Time'),
        execution_time_ms=details.get('Execution Time'),
        indexes_used=list(dict.fromkeys(indexes)),
        plan_nodes=nodes,
        raw_plan=root,
    )

def run_benchmark(db: Session, sample_size: int, k: int, index_type: str) -> BenchmarkRun:
    bugs = list(db.scalars(select(BugReport).order_by(BugReport.id).limit(sample_size)))
    if len(bugs) < 2:
        raise ValueError('At least two reports are required for benchmarking')
    latency: list[float] = []
    hits = {1: 0, 5: 0, 10: 0}
    for bug in bugs:
        started = time.perf_counter()
        result = search(db, SearchRequest(query=bug.cleaned_text, k=max(k, 10), exclude_id=bug.id, index_type=index_type))
        latency.append((time.perf_counter() - started) * 1000)
        truth = db.scalars(select(BugReport.id).where(BugReport.id != bug.id).order_by(BugReport.embedding.cosine_distance(bug.embedding)).limit(10)).all()
        actual = [row[0].id for row in result]
        for n in hits:
            hits[n] += int(bool(set(truth[:n]) & set(actual[:n])))
    run = BenchmarkRun(index_type=index_type, k=k, queries_evaluated=len(bugs), recall_at_1=hits[1] / len(bugs), recall_at_5=hits[5] / len(bugs), recall_at_10=hits[10] / len(bugs), average_latency_ms=float(np.mean(latency)), p95_latency_ms=float(np.percentile(latency, 95)))
    db.add(run)
    db.commit()
    db.refresh(run)
    return run
