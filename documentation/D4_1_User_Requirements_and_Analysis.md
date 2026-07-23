# D.4.1 User Requirements and Analysis

**Project:** AI Bug Deduplication System using PostgreSQL pgvector  
**Course:** COMP.8157 Advanced Database Topics  
**Repository:** https://github.com/pruthvi4344/bug-deduplication-pgvector  
**Version:** 1.0 | **Date:** July 2026

## 1. Introduction and scope

Software teams receive many reports describing the same underlying defect with different wording. Manual triage is slow and inconsistent; duplicate reports consume engineering time and make defect metrics unreliable. This project provides a web application that identifies semantically similar Bugzilla reports. The application cleans report text, creates a 384-dimensional Sentence-BERT embedding using `sentence-transformers/all-MiniLM-L6-v2`, persists that embedding in PostgreSQL through pgvector, and uses cosine nearest-neighbour search to retrieve likely duplicates.

The system’s primary purpose is to support triage decisions, not to automatically close reports. A human user reviews ranked candidates and their similarity scores. The project also measures the quality and latency trade-offs of PostgreSQL HNSW and IVFFlat approximate nearest-neighbour (ANN) indexes against an exact cosine-similarity baseline.

Included scope: CSV import compatible with Bugzilla fields; text normalisation; embedding generation; PostgreSQL storage; HNSW, IVFFlat, and exact search; metadata filtering; a responsive dashboard; and benchmark history. Out of scope: authentication/authorization, direct Bugzilla write-back, automatic duplicate closure, issue-tracker notifications, multilingual model tuning, and distributed multi-node database deployment.

## 2. Stakeholders and roles

| Stakeholder | Responsibilities and needs |
|---|---|
| Bug triager | Imports reports, submits a new report description, reviews ranked duplicate candidates, and makes the final duplicate decision. |
| Engineering manager | Reviews benchmark results to choose a retrieval index and monitor response time/quality. |
| Database administrator | Provisions PostgreSQL with pgvector, applies schema/index scripts, backs up data, and monitors storage/query performance. |
| ML/application developer | Maintains preprocessing, model configuration, API, user interface, and benchmark methodology. |
| Course grader | Clones/runs the repository and evaluates code, dataset, schema, and documentation. |

## 3. Functional requirements

Priorities use MoSCoW: **M** must, **S** should, **C** could.

| ID | Priority | Requirement |
|---|---:|---|
| FR-01 | M | The system shall accept a CSV containing Bugzilla-style reports and show the number successfully imported. |
| FR-02 | M | The system shall validate that each imported record contains a non-empty summary and return a useful import error for invalid data. |
| FR-03 | M | The system shall normalize HTML, URLs, escaped characters, line breaks, and excess whitespace before embedding. |
| FR-04 | M | The system shall generate a normalized 384-dimensional embedding using `all-MiniLM-L6-v2`. |
| FR-05 | M | The system shall store source fields, cleaned text, and vector embeddings in PostgreSQL pgvector. |
| FR-06 | M | The system shall return top-K candidates ranked by cosine similarity with a numerical similarity score. |
| FR-07 | M | The system shall support filtering search candidates by product and component. |
| FR-08 | M | The system shall allow exact, HNSW, and IVFFlat retrieval modes. |
| FR-09 | M | The system shall compute and store Recall@1, Recall@5, Recall@10, average latency, and p95 latency for a benchmark run. |
| FR-10 | M | The system shall display recent benchmark results in the web dashboard. |
| FR-11 | S | The system shall support dark mode and usable layouts on desktop and mobile widths. |
| FR-12 | S | The system shall provide OpenAPI documentation for all backend endpoints. |

## 4. Non-functional requirements

| ID | Requirement and target |
|---|---|
| NFR-01 Performance | A top-10 ANN search should normally complete in under one second for the project dataset; measured latency is persisted rather than assumed. |
| NFR-02 Accuracy | Approximate retrieval quality must be measured against exact PostgreSQL cosine search using Recall@K. |
| NFR-03 Data integrity | `external_id` is unique when supplied; required text/vector fields are non-null; schema uses primary keys, checks, and an update timestamp trigger. |
| NFR-04 Reliability | API errors produce HTTP 400 responses with understandable messages; database sessions roll back on write failures. |
| NFR-05 Maintainability | Python uses type hints/docstrings and separates configuration, persistence, models, schemas, services, and API entry point. |
| NFR-06 Portability | Docker Compose must launch PostgreSQL/pgvector, API, and web client with one command. |
| NFR-07 Security | Secrets are supplied through environment variables and `.env` is not committed. No credentials are displayed by the client. |
| NFR-08 Usability | Search results expose report identifier, summary, metadata, status, and a colour-coded similarity indicator. |

## 5. Acceptance criteria

| Requirement | Testable acceptance criterion |
|---|---|
| FR-01–FR-05 | Uploading a valid CSV creates reports with cleaned text and 384-dimension vectors; PostgreSQL `vector_dims(embedding)` returns 384. |
| FR-06 | A POST to `/api/search` with `k=10` returns at most ten candidates ordered from greatest similarity to least. |
| FR-07 | Supplying `product` and/or `component` returns only records matching the supplied values. |
| FR-08 | Searches with `hnsw`, `ivfflat`, and `exact` are accepted; unsupported values receive HTTP 400. |
| FR-09 | A benchmark with at least two records writes one `benchmark_runs` row containing all three recall values and latency values. |
| FR-10 | The Benchmark page loads and displays persisted runs after refresh. |
| NFR-06 | `docker compose up --build` exposes the dashboard on port 5173 and OpenAPI on port 8000. |
| NFR-07 | A clean checkout runs using `.env.example`; no actual secret is required in tracked files. |

## 6. Revision history

| Version | Date | Change | Approval |
|---|---|---|---|
| 0.1 | July 2026 | Initial requirements and scope | Project team |
| 1.0 | July 2026 | Aligned requirements with implemented FastAPI, React, pgvector, and Docker solution | Project team |
