import csv
import io
import logging
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session
from .config import get_settings
from .database import get_db
from .models import BenchmarkRun
from .schemas import BenchmarkOut, BenchmarkRequest, BugCreate, BugOut, QueryPlanOut, SearchRequest, SearchResult
from .services import create_bug, explain_search, run_benchmark, search

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
app = FastAPI(title='AI Bug Deduplication System', version='1.1.0')
app.add_middleware(CORSMiddleware, allow_origins=get_settings().origins, allow_credentials=True, allow_methods=['*'], allow_headers=['*'])

@app.get('/health')
def health(): return {'status': 'ok'}

@app.post('/api/bugs', response_model=BugOut, status_code=201)
def add_bug(item: BugCreate, db: Session = Depends(get_db)):
    try: return create_bug(db, item)
    except Exception as exc:
        db.rollback(); raise HTTPException(400, str(exc)) from exc

@app.post('/api/bugs/import')
async def import_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(400, 'Upload a CSV file')
    rows = csv.DictReader(io.StringIO((await file.read()).decode('utf-8-sig')))
    count = 0
    try:
        for row in rows:
            create_bug(db, BugCreate(external_id=row.get('bug_id') or row.get('external_id'), summary=row.get('summary') or '', description=row.get('description') or '', product=row.get('product'), component=row.get('component') or row.get('component_type'), resolution_status=row.get('resolution_status') or 'UNRESOLVED', operating_system=row.get('operating_system'), architecture=row.get('architecture')))
            count += 1
    except Exception as exc:
        db.rollback(); raise HTTPException(400, f'Import failed after {count} reports: {exc}') from exc
    return {'imported': count}

@app.post('/api/search', response_model=list[SearchResult])
def find_duplicates(request: SearchRequest, db: Session = Depends(get_db)):
    try: return [{'bug': bug, 'similarity': round(float(score), 5)} for bug, score in search(db, request)]
    except ValueError as exc: raise HTTPException(400, str(exc)) from exc

@app.post('/api/query-plan', response_model=QueryPlanOut)
def query_plan(request: SearchRequest, db: Session = Depends(get_db)):
    try: return explain_search(db, request)
    except ValueError as exc: raise HTTPException(400, str(exc)) from exc

@app.post('/api/benchmarks', response_model=BenchmarkOut)
def benchmark(request: BenchmarkRequest, db: Session = Depends(get_db)):
    try: return run_benchmark(db, request.sample_size, request.k, request.index_type)
    except ValueError as exc: raise HTTPException(400, str(exc)) from exc

@app.get('/api/benchmarks', response_model=list[BenchmarkOut])
def history(db: Session = Depends(get_db)):
    return db.scalars(select(BenchmarkRun).order_by(BenchmarkRun.created_at.desc()).limit(50)).all()
