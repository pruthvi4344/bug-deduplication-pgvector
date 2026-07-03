-- =============================================================================
-- queries.sql
-- Role: Index Engineering, Access Methods, and Complex Query Execution
--
-- Purpose:
--   Reference SQL templates for the single-stage hybrid query described in
--   Section V of the proposal. These are the "source of truth" query
--   shapes -- src/search/knn_retriever.py and src/search/hybrid_search.py
--   build these same query shapes dynamically in Python, with bound
--   parameters instead of hardcoded literals.
--
--   Use this file directly in psql / the VS Code PostgreSQL extension for
--   manual testing and for capturing EXPLAIN plans during benchmarking.


-- 1. RAW KNN QUERY (no relational filter -- pure vector similarity)

-- Baseline query used to isolate pure ANN index performance, before adding
-- relational filter overhead. Replace the literal vector below with a real
-- 384-dim embedding when testing manually.

-- SELECT id, summary, reported_at,
--        description_embedding <=> '[0.01, 0.02, ...]'::vector AS distance
-- FROM bug_reports
-- ORDER BY description_embedding <=> '[0.01, 0.02, ...]'::vector
-- LIMIT 5;



-- 2. HYBRID QUERY (relational filter + vector similarity, single-stage)

-- This is the exact template from Section V of the proposal. PostgreSQL's
-- planner applies the B-tree filter on operating_system/architecture to
-- narrow the candidate row set, then ranks the remainder by cosine
-- distance using the vector index. Named parameters (:new_vector) shown
-- for use with psql \set or a query tool; the Python layer substitutes
-- these with psycopg-bound parameters instead.

SELECT id, summary, reported_at
FROM bug_reports
WHERE operating_system = 'Linux'
  AND architecture = 'x86_64'
ORDER BY description_embedding <=> :new_vector
LIMIT 5;



-- 3. HYBRID QUERY -- WITH EXPLAIN (ANALYZE, BUFFERS)

-- Wraps the same query in EXPLAIN ANALYZE for benchmarking. This is what
-- benchmark_runner.py (Nancy's file, in the swapped role assignment)
-- programmatically issues and parses. Run this manually in the VS Code
-- PostgreSQL extension to sanity-check index usage before wiring up the
-- automated benchmark suite.
--
-- What to look for in the output:
--   - "Index Scan using idx_bug_hnsw" or "idx_bug_ivfflat" -> the ANN
--     index is actually being used for the ORDER BY / LIMIT.
--   - "Index Scan using idx_bug_os_arch" (or a Bitmap Index Scan on it)
--     -> the B-tree filter is being used for the WHERE clause.
--   - If you instead see "Seq Scan on bug_reports", the planner decided
--     not to use an index -- often because the table is small enough
--     that a sequential scan is cheaper, or because ANALYZE hasn't been
--     run since the index was built (see indexes.sql).

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, summary, reported_at
FROM bug_reports
WHERE operating_system = 'Linux'
  AND architecture = 'x86_64'
ORDER BY description_embedding <=> :new_vector
LIMIT 5;



-- 4. FORCING A SPECIFIC ANN INDEX FOR A/B COMPARISON

-- When both idx_bug_ivfflat and idx_bug_hnsw exist simultaneously, the
-- planner will pick whichever it estimates is cheaper -- usually not what
-- you want when you're deliberately trying to benchmark one vs the other.
-- Use these session-level toggles immediately before running query #3 to
-- force a fair, isolated comparison. (These map to the same tuning knobs
-- documented at the bottom of indexes.sql.)

-- To favor IVFFlat:
--   SET enable_indexscan = on;
--   SET ivfflat.probes = 10;
--   DROP INDEX IF EXISTS idx_bug_hnsw;   -- drop the competing index, or:
--   SET enable_seqscan = off;            -- (lighter-touch alternative --
--                                            does not force IVFFlat over
--                                            HNSW specifically, only
--                                            discourages seq scans)

-- To favor HNSW:
--   SET hnsw.ef_search = 40;
--   DROP INDEX IF EXISTS idx_bug_ivfflat;

-- In practice, benchmark_runner.py should build ONE index at a time,
-- run the full benchmark suite, drop it, build the other, and re-run --
-- rather than relying on session-level hints with both indexes present.
-- That produces cleaner, more defensible comparative numbers for the
-- final report (Phase 5 / Section IV contribution #2).