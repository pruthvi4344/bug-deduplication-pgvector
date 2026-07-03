-- Enable the pgvector extension to support high-dimensional vector data types
CREATE EXTENSION IF NOT EXISTS pgvector;

-- Verify that the extension was registered successfully
SELECT extname, extversion FROM pg_extension WHERE extname = 'pgvector';