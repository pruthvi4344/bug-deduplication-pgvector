-- Drop the table if it already exists to allow clean re-runs
DROP TABLE IF EXISTS bug_reports CASCADE;

-- Create the primary operational database table for bug tracking
CREATE TABLE bug_reports (
    id SERIAL PRIMARY KEY,
    summary TEXT NOT NULL,
    resolution_status VARCHAR(20) DEFAULT 'UNRESOLVED',
    operating_system VARCHAR(50) NOT NULL,
    architecture VARCHAR(30) NOT NULL,
    component_type VARCHAR(50),
    reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description_embedding vector(384)
);



