CREATE INDEX IF NOT EXISTS idx_bug_product_component ON bug_reports(product, component);
CREATE INDEX IF NOT EXISTS idx_bug_status ON bug_reports(resolution_status);
CREATE INDEX IF NOT EXISTS idx_bug_hnsw ON bug_reports USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);
-- Build only after a representative bulk import. Rebuild with a list count suited to corpus size.
CREATE INDEX IF NOT EXISTS idx_bug_ivfflat ON bug_reports USING ivfflat (embedding vector_cosine_ops) WITH (lists=100);
ANALYZE bug_reports;
