"""Core cleaning, embedding, search, and benchmark services."""
import html,re,time
from functools import lru_cache
import numpy as np
from sentence_transformers import SentenceTransformer
from sqlalchemy import select,text
from sqlalchemy.orm import Session
from .config import get_settings
from .models import BugReport,BenchmarkRun
from .schemas import BugCreate,SearchRequest
def clean_text(value:str)->str:
    return re.sub(r'\s+',' ',re.sub(r'<[^>]*>|https?://\S+',' ',html.unescape(value))).strip()
@lru_cache
def encoder()->SentenceTransformer: return SentenceTransformer(get_settings().model_name)
def embed(value:str)->list[float]: return encoder().encode(clean_text(value),normalize_embeddings=True).tolist()
def create_bug(db:Session,item:BugCreate)->BugReport:
    cleaned=clean_text(f'{item.summary}. {item.description}')
    entity=BugReport(**item.model_dump(),cleaned_text=cleaned,embedding=embed(cleaned)); db.add(entity); db.commit(); db.refresh(entity); return entity
def search(db:Session,request:SearchRequest):
    if request.index_type not in {'exact','hnsw','ivfflat'}: raise ValueError('index_type must be exact, hnsw, or ivfflat')
    if request.index_type=='exact':
        db.execute(text('SET LOCAL enable_indexscan=off')); db.execute(text('SET LOCAL enable_bitmapscan=off'))
    if request.index_type=='hnsw': db.execute(text('SET LOCAL hnsw.ef_search=80'))
    if request.index_type=='ivfflat': db.execute(text('SET LOCAL ivfflat.probes=20'))
    distance=BugReport.embedding.cosine_distance(embed(request.query)); stmt=select(BugReport,(1-distance).label('similarity'))
    if request.product: stmt=stmt.where(BugReport.product==request.product)
    if request.component: stmt=stmt.where(BugReport.component==request.component)
    if request.exclude_id: stmt=stmt.where(BugReport.id!=request.exclude_id)
    return db.execute(stmt.order_by(distance).limit(request.k)).all()
def run_benchmark(db:Session,sample_size:int,k:int,index_type:str)->BenchmarkRun:
    bugs=list(db.scalars(select(BugReport).order_by(BugReport.id).limit(sample_size)))
    if len(bugs)<2: raise ValueError('At least two reports are required for benchmarking')
    latency=[];hits={1:0,5:0,10:0}
    for bug in bugs:
        t=time.perf_counter(); result=search(db,SearchRequest(query=bug.cleaned_text,k=max(k,10),exclude_id=bug.id,index_type=index_type)); latency.append((time.perf_counter()-t)*1000)
        truth=db.scalars(select(BugReport.id).where(BugReport.id!=bug.id).order_by(BugReport.embedding.cosine_distance(bug.embedding)).limit(10)).all(); actual=[r[0].id for r in result]
        for n in hits: hits[n]+=int(bool(set(truth[:n])&set(actual[:n])))
    run=BenchmarkRun(index_type=index_type,k=k,queries_evaluated=len(bugs),recall_at_1=hits[1]/len(bugs),recall_at_5=hits[5]/len(bugs),recall_at_10=hits[10]/len(bugs),average_latency_ms=float(np.mean(latency)),p95_latency_ms=float(np.percentile(latency,95)))
    db.add(run);db.commit();db.refresh(run);return run
