# D.4.4 Deployment Document

**Project:** AI Bug Deduplication System using PostgreSQL pgvector  
**Repository:** https://github.com/pruthvi4344/bug-deduplication-pgvector  
**Version:** 1.0 | **Date:** July 2026

## 1. Deployment overview

The recommended deployment uses Docker Compose. It launches PostgreSQL 16 with pgvector, a Python 3.12 FastAPI/Uvicorn service, and a React static site served by NGINX. This avoids local PostgreSQL extension installation and provides the same three-tier environment for graders and developers.

Prerequisites are Git, Docker Desktop (with Compose v2), at least 4 GB of available memory, and internet access on the first run to fetch container images and the SentenceTransformer model. The application ports are 5173 (web UI), 8000 (API/OpenAPI), and 5432 (database). In a shared or production environment, remove the public database-port mapping and use a strong non-default database password.

## 2. Deployment procedure

1. Clone the repository and enter its root directory.

   ```bash
   git clone https://github.com/pruthvi4344/bug-deduplication-pgvector.git
   cd bug-deduplication-pgvector
   ```

2. Create a local configuration file from `.env.example` if running API outside Compose. Compose already supplies its internal database URL.

   ```bash
   copy .env.example .env
   ```

3. Build and start the full application.

   ```bash
   docker compose up --build
   ```

4. Verify each component:

   | Component | Verification |
   |---|---|
   | Web dashboard | Open `http://localhost:5173` |
   | API health | Open `http://localhost:8000/health`; expected `{"status":"ok"}` |
   | API reference | Open `http://localhost:8000/docs` |
   | Database | `docker compose exec db psql -U postgres -d bugdedup -c "SELECT extname FROM pg_extension WHERE extname='vector';"` |

The database initialization scripts are mounted into `/docker-entrypoint-initdb.d`. On the first empty database creation, `production_schema.sql` creates the extension/tables/trigger and `production_indexes.sql` creates B-tree, HNSW, and IVFFlat indexes. PostgreSQL data persists in the named `postgres_data` Docker volume.

## 3. Dataset setup and index operation

The repository includes a small Bugzilla-format sample under `data/raw/mozilla_bugzilla.csv`, plus processed research artifacts. The dashboard importer accepts CSV columns `bug_id`, `summary`, `description`, `product`, `component` or `component_type`, `resolution_status`, `operating_system`, and `architecture`. `summary` is required.

For a large corpus, import data before building IVFFlat. This matters because IVFFlat cluster centroids are created from current rows. A DBA may rebuild only that index after bulk load:

```sql
DROP INDEX IF EXISTS idx_bug_ivfflat;
CREATE INDEX idx_bug_ivfflat ON bug_reports
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
ANALYZE bug_reports;
```

`lists=100`, `ivfflat.probes=20`, HNSW `m=16`, `ef_construction=64`, and HNSW `ef_search=80` are baseline settings. Benchmark results should guide tuning for the actual dataset and target latency.

## 4. Local developer deployment

To run without Docker, install Python 3.12+, PostgreSQL with the pgvector extension, and Node.js 22+. Create the database, run the two `database/production_*.sql` scripts in order, then:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.app.main:app --reload

cd frontend
npm install
npm run dev
```

Set `DATABASE_URL` in `.env` to a psycopg SQLAlchemy URL such as `postgresql+psycopg://USER:PASSWORD@localhost:5432/bugdedup`. Set `CORS_ORIGINS` to the actual dashboard origin.

## 5. Operations, recovery, and security

Check service logs with `docker compose logs -f api`, `web`, or `db`. Stop services without deleting data using `docker compose down`. Back up the database before schema upgrades:

```bash
docker compose exec -T db pg_dump -U postgres bugdedup > bugdedup-backup.sql
```

Restore through `psql` to a controlled target database. Do not commit `.env`, backups, model caches, or real credentials. A production deployment should use a secrets manager, TLS termination, restricted CORS origins, a private database network, backup rotation, API authentication, and resource monitoring. The model download occurs at its first use; pre-warming the API by executing one import/search avoids first-user delay.
