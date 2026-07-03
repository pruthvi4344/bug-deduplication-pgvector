-- indexes.sql
-- Owner: Mohd Haris Mashhood
-- Role: Index Engineering, Access Methods, and Complex Query Execution
--
-- Purpose:
--   Defines the physical access methods used by this project to compare
--   IVFFlat vs HNSW approximate nearest neighbor (ANN) search strategies
--   over the `bug_reports.description_embedding` vector(384) column, and
--   the supporting B-tree indexes required for the hybrid (metadata +
--   vector) query path used in hybrid_search.py.
--
-- Assumptions:
--   - The `vector` extension (pgvector) is already enabled by
--     database/schema.sql (Jashleen's file).
--   - The `bug_reports` table already exists via database/create_tables.sql.
--   - This script is safe to re-run: every index is dropped first if it
--     exists, so re-running during benchmarking iterations won't error out.



-- 1. SUPPORTING B-TREE INDEXES (for the relational half of the hybrid query)

-- The hybrid query template (see queries.sql) filters on operating_system
-- and architecture BEFORE ranking by vector distance. Without B-tree
-- indexes on these columns, PostgreSQL falls back to a sequential scan for
-- the filter predicate, which defeats the purpose of a "hybrid" query --
-- the ANN index only helps the ORDER BY / LIMIT, not the WHERE clause.

DROP INDEX IF EXISTS idx_bug_os;
CREATE INDEX idx_bug_os
    ON bug_reports (operating_system);

DROP INDEX IF EXISTS idx_bug_arch;
CREATE INDEX idx_bug_arch
    ON bug_reports (architecture);

-- Composite index covering the two-column filter used in the reference
-- query template. A composite B-tree lets the planner satisfy both
-- predicates from a single index scan instead of intersecting two scans.
DROP INDEX IF EXISTS idx_bug_os_arch;
CREATE INDEX idx_bug_os_arch
    ON bug_reports (operating_system, architecture);

-- component_type and resolution_status are also plausible filter columns
-- for future hybrid queries (e.g. "only open bugs", "only Core component"),
-- so we index them individually as well.
DROP INDEX IF EXISTS idx_bug_component_type;
CREATE INDEX idx_bug_component_type
    ON bug_reports (component_type);

DROP INDEX IF EXISTS idx_bug_resolution_status;
CREATE INDEX idx_bug_resolution_status
    ON bug_reports (resolution_status);


-- 2. IVFFLAT INDEX (list-based / inverted-file ANN structure)

-- IVFFlat partitions the vector space into `lists` clusters (via k-means)
-- and, at query time, only probes a subset of the nearest clusters. It is
-- cheap to build but its quality depends heavily on having representative
-- data in the table BEFORE the index is built, and on the `lists` value
-- being sized relative to row count (a common heuristic is
-- lists ~= sqrt(row_count) for smaller tables, or rows/1000 for larger
-- ones). The proposal fixes lists = 200 as a starting point for the
-- Mozilla Bugzilla corpus; this is a tunable we will sweep during
-- benchmarking (Phase 4).
--
-- IMPORTANT: IVFFlat should be built AFTER bulk data load, not before.
-- Building it on an empty or near-empty table produces low-quality
-- clusters because k-means has nothing meaningful to cluster on.

DROP INDEX IF EXISTS idx_bug_ivfflat;
CREATE INDEX idx_bug_ivfflat
    ON bug_reports
    USING ivfflat (description_embedding vector_cosine_ops)
    WITH (lists = 200);

-- After building (or rebuilding) the IVFFlat index, ANALYZE must be run so
-- the planner has fresh statistics on the new index and will actually
-- choose to use it instead of falling back to a sequential scan.
ANALYZE bug_reports;

-- -----------------------------------------------------------------------------
-- 3. HNSW INDEX (graph-based ANN structure)
-- -----------------------------------------------------------------------------
-- HNSW (Hierarchical Navigable Small World) builds a multi-layer proximity
-- graph. Unlike IVFFlat, it does not require pre-existing data to build
-- good structure and it degrades more gracefully under concurrent writes,
-- but it is more expensive to build (higher memory + CPU at construction
-- time) and the index itself is larger on disk.
--
--   m               -- max number of bidirectional links per node per layer.
--                       Higher m = better recall, more memory, slower build.
--   ef_construction -- size of the dynamic candidate list used while
--                       building the graph. Higher = better graph quality,
--                       slower build time. Does NOT affect query-time recall
--                       directly; that is controlled by hnsw.ef_search
--                       (a query-time GUC, not an index build parameter).
--
-- Values below match the proposal's stated configuration and are the
-- baseline before Phase 4 parameter sweeps.

DROP INDEX IF EXISTS idx_bug_hnsw;
CREATE INDEX idx_bug_hnsw
    ON bug_reports
    USING hnsw (description_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- HNSW does not strictly require ANALYZE the way IVFFlat does (it has no
-- table-statistics-dependent clustering step), but running it keeps
-- overall planner statistics fresh after index builds.
ANALYZE bug_reports;

-- -----------------------------------------------------------------------------
-- 4. QUERY-TIME TUNING KNOBS (reference only -- NOT executed here)
-- -----------------------------------------------------------------------------
-- These are session-level parameters, not index properties. They belong in
-- knn_retriever.py / hybrid_search.py where they can be varied per
-- benchmark run. Left here as documentation of what each index type
-- exposes for tuning at query time.
--
--   IVFFlat:  SET ivfflat.probes = 10;     -- how many lists to search
--   HNSW:     SET hnsw.ef_search = 40;     -- size of dynamic candidate list
--                                             at search time (higher = more
--                                             accurate, slower)