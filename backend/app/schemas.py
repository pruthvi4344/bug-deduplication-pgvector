from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field

class BugCreate(BaseModel):
    external_id: str | None = None
    summary: str = Field(min_length=1)
    description: str = ''
    product: str | None = None
    component: str | None = None
    resolution_status: str = 'UNRESOLVED'
    operating_system: str | None = None
    architecture: str | None = None
    reported_at: datetime | None = None

class BugOut(BugCreate):
    id: int
    created_at: datetime
    model_config = {'from_attributes': True}

class SearchRequest(BaseModel):
    query: str = Field(min_length=2)
    k: int = Field(10, ge=1, le=100)
    product: str | None = None
    component: str | None = None
    exclude_id: int | None = None
    index_type: str = 'hnsw'

class SearchResult(BaseModel):
    bug: BugOut
    similarity: float

class QueryPlanOut(BaseModel):
    index_type: str
    planning_time_ms: float | None = None
    execution_time_ms: float | None = None
    indexes_used: list[str]
    plan_nodes: list[str]
    raw_plan: dict[str, Any]

class BenchmarkRequest(BaseModel):
    sample_size: int = Field(20, ge=2, le=500)
    k: int = Field(10, ge=1, le=50)
    index_type: str = 'hnsw'

class BenchmarkOut(BaseModel):
    id: int
    index_type: str
    k: int
    queries_evaluated: int
    recall_at_1: float
    recall_at_5: float
    recall_at_10: float
    average_latency_ms: float
    p95_latency_ms: float
    created_at: datetime
    model_config = {'from_attributes': True}
