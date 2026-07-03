-- Lightweight verification records for Pruthviraj's text and embedding pipeline.
-- The vectors are intentionally simple 384-dimensional values to validate storage.

INSERT INTO bug_reports (
    summary,
    resolution_status,
    operating_system,
    architecture,
    component_type,
    description_embedding
)
VALUES
(
    'Browser crashes when opening preferences',
    'UNRESOLVED',
    'Windows',
    'x86_64',
    'Preferences',
    ('[' || rtrim(repeat('0.01000000,', 384), ',') || ']')::vector
),
(
    'Crash on preferences window after update',
    'DUPLICATE',
    'Windows',
    'x86_64',
    'Preferences',
    ('[' || rtrim(repeat('0.02000000,', 384), ',') || ']')::vector
),
(
    'Images overlap text after resizing browser window',
    'UNRESOLVED',
    'Linux',
    'x86_64',
    'Layout',
    ('[' || rtrim(repeat('0.03000000,', 384), ',') || ']')::vector
);

SELECT
    id,
    summary,
    vector_dims(description_embedding) AS embedding_dimensions
FROM bug_reports
ORDER BY id
LIMIT 3;
