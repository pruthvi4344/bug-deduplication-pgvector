
# Image prompts and implementation excerpts

## Figure 1 - Logical Architecture

**Insert generated image here. Prompt:** Clean academic vector architecture diagram on white background, navy and teal colors. Show Triager User -> React TypeScript Vite Dashboard -> FastAPI REST API. Inside API show Text Cleaning, SentenceTransformer all-MiniLM-L6-v2, Search Service, Benchmark Service. Connect to PostgreSQL pgvector with bug_reports, benchmark_runs, HNSW index, IVFFlat index. Label arrows CSV import, JSON request, 384D embedding, cosine results. Landscape 16:9, readable labels.

## Figure 2 - Physical Architecture

**Insert generated image here. Prompt:** Professional Docker Compose diagram. Browser localhost connects to NGINX React frontend port 5173 and FastAPI Uvicorn port 8000. FastAPI connects through internal Docker network to PostgreSQL 16 pgvector port 5432 and persistent volume. Show GitHub repository feeding docker compose. White background, navy teal palette, academic labels.

## Figure 3 - Entity Relationship Diagram

**Insert generated image here. Prompt:** Minimal PostgreSQL ERD. Table bug_reports: id PK, external_id UNIQUE, summary, description, cleaned_text, product, component, resolution_status, operating_system, architecture, reported_at, created_at, updated_at, embedding vector 384. Table benchmark_runs: id PK, index_type, k, queries_evaluated, recall_at_1, recall_at_5, recall_at_10, average_latency_ms, p95_latency_ms, created_at. Note HNSW and IVFFlat indexes on embedding. White background, clean database notation.

## Figure 4 - Data Flow

**Insert generated image here. Prompt:** Academic flowchart with three lanes. Import: Bugzilla CSV -> Pydantic validation -> clean text remove HTML URLs whitespace -> MiniLM 384D embedding -> PostgreSQL bug_reports. Search: user query -> same cleaning and MiniLM -> SQL product component filter -> HNSW IVFFlat Exact cosine top K -> similarity table. Benchmark: sample reports -> approximate results compared to exact cosine -> Recall 1 5 10, average latency and p95 -> benchmark_runs. Landscape, white background, navy teal.

## Figure 5 - Search Interface

**Insert generated image here. Prompt:** High-fidelity desktop UI wireframe for BugVector AI. Header with Search Benchmarks About and dark mode icon. Title Duplicate search. Large textarea containing Browser crashes when opening preferences. HNSW dropdown and indigo Search button. Results table columns Bug, Product Component, Status, Similarity; rows have green 92.4 percent match badge, amber 74.8, gray 51.3. Clean white React dashboard, indigo accents, no logos.

## Figure 6 - Benchmark Interface

**Insert generated image here. Prompt:** High-fidelity desktop analytics dashboard for BugVector AI. Header and title Benchmark dashboard with Run HNSW benchmark button. Three cards: Recall at 10 92.0 percent, Average Latency 18.4 ms, P95 Latency 31.7 ms. Below table comparing HNSW IVFFlat Exact with Recall at 1 5 10 and latency. White background, indigo teal palette, academic project style.

## Implementation code excerpts

### Text cleaning and embedding service

```python
def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(
        r"<[^>]*>|https?://\S+", " ", html.unescape(value)
    )).strip()

@lru_cache
def encoder() -> SentenceTransformer:
    return SentenceTransformer(get_settings().model_name)

def embed(value: str) -> list[float]:
    return encoder().encode(clean_text(value), normalize_embeddings=True).tolist()
```

### Hybrid PostgreSQL vector search

```python
distance = BugReport.embedding.cosine_distance(embed(request.query))
stmt = select(BugReport, (1 - distance).label("similarity"))
if request.product:
    stmt = stmt.where(BugReport.product == request.product)
if request.component:
    stmt = stmt.where(BugReport.component == request.component)
if request.exclude_id:
    stmt = stmt.where(BugReport.id != request.exclude_id)
return db.execute(stmt.order_by(distance).limit(request.k)).all()
```

### Database schema excerpt

```sql
CREATE TABLE IF NOT EXISTS bug_reports (
    id BIGSERIAL PRIMARY KEY,
    external_id VARCHAR(128) UNIQUE,
    summary TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    cleaned_text TEXT NOT NULL,
    product VARCHAR(120), component VARCHAR(120),
    resolution_status VARCHAR(32) NOT NULL DEFAULT 'UNRESOLVED',
    embedding vector(384) NOT NULL
);
```

### Benchmark calculation excerpt

```python
for bug in bugs:
    result = search(db, SearchRequest(
        query=bug.cleaned_text, k=max(k, 10),
        exclude_id=bug.id, index_type=index_type
    ))
    truth = db.scalars(select(BugReport.id)
        .where(BugReport.id != bug.id)
        .order_by(BugReport.embedding.cosine_distance(bug.embedding))
        .limit(10)).all()
    for n in hits:
        hits[n] += int(bool(set(truth[:n]) & set(actual[:n])))
```

## Cover-page details to update

- Group Number: Insert your group number.
- Prepared by: Insert every group member name and program.
- Repository: https://github.com/pruthvi4344/bug-deduplication-pgvector
- Replace each **Insert generated image here** paragraph with the matching generated figure and retain the caption.
