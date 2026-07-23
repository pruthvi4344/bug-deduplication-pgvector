CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS bug_reports (
 id BIGSERIAL PRIMARY KEY, external_id VARCHAR(128) UNIQUE, summary TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', cleaned_text TEXT NOT NULL,
 product VARCHAR(120), component VARCHAR(120), resolution_status VARCHAR(32) NOT NULL DEFAULT 'UNRESOLVED', operating_system VARCHAR(80), architecture VARCHAR(80), reported_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), embedding vector(384) NOT NULL
);
CREATE TABLE IF NOT EXISTS benchmark_runs (
 id BIGSERIAL PRIMARY KEY, index_type VARCHAR(16) NOT NULL CHECK(index_type IN ('exact','hnsw','ivfflat')), k INT NOT NULL CHECK(k>0), queries_evaluated INT NOT NULL,
 recall_at_1 DOUBLE PRECISION NOT NULL, recall_at_5 DOUBLE PRECISION NOT NULL, recall_at_10 DOUBLE PRECISION NOT NULL, average_latency_ms DOUBLE PRECISION NOT NULL, p95_latency_ms DOUBLE PRECISION NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS bug_reports_updated_at ON bug_reports;
CREATE TRIGGER bug_reports_updated_at BEFORE UPDATE ON bug_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
