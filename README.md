# AI Bug Deduplication System using PostgreSQL pgvector

A complete FastAPI and React application for semantic duplicate-bug discovery. It embeds Bugzilla reports with `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions), stores vectors in PostgreSQL, and retrieves nearest reports using cosine similarity.

## What it includes

- Bugzilla CSV import, text cleaning, embedding generation, and PostgreSQL storage
- Hybrid filters (`product`, `component`) plus top-K vector retrieval
- Exact, HNSW, and IVFFlat query modes
- Similarity result table, dark mode, responsive React dashboard, and import feedback
- Persisted benchmark runs: Recall@1/@5/@10, average latency, and p95 latency
- SQL schema, trigger, ANN indexes, Docker Compose, environment configuration, and unit test

## Run with Docker

```bash
docker compose up --build
```

Open `http://localhost:5173`. The API documentation is at `http://localhost:8000/docs`.

The first SentenceTransformer request downloads the model into the API container. Docker initializes PostgreSQL and pgvector from `database/production_schema.sql` and `database/production_indexes.sql` on its first start.

## Run locally

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn backend.app.main:app --reload

cd frontend
npm install
npm run dev
```

Set `DATABASE_URL` in `.env` to your local PostgreSQL connection. Before starting the API, apply `production_schema.sql`, bulk import your reports, and run `production_indexes.sql`. IVFFlat is intentionally created after data loading because its cluster training requires representative rows.

## CSV contract

Required: `summary`. Supported optional columns: `bug_id` (or `external_id`), `description`, `product`, `component` (or `component_type`), `resolution_status`, `operating_system`, and `architecture`.

## API

- `POST /api/bugs` — create and embed one report
- `POST /api/bugs/import` — CSV import and embedding
- `POST /api/search` — body: `query`, `k`, `index_type`, optional `product`, `component`, `exclude_id`
- `POST /api/benchmarks` — body: `sample_size`, `k`, `index_type`
- `GET /api/benchmarks` — recent benchmark history

## Test

```bash
pytest backend/tests
```

`database/queries.sql` and the original research pipeline under `src/` are retained for experimentation; production deployment uses the new API and `production_*.sql` scripts.
