# D.4.5 User Guide

**AI Bug Deduplication System using PostgreSQL pgvector**  
**Version:** 1.0 | **Course:** COMP.8157 Advanced Database Topics

## 1. Purpose and access

This application helps a bug triager find previously reported issues that are semantically similar to a new report. It does not automatically mark reports as duplicates. The recommended workflow is: import reports, search with a new bug description, inspect the ranked matches, then use the issue tracker’s normal process to make the final decision.

Start the system with `docker compose up --build`, then open `http://localhost:5173`. The navigation bar provides **Search**, **Benchmarks**, and **About**. The moon/sun icon changes visual theme; it does not alter data or search results.

## 2. Import Bugzilla reports

1. From the Home page, use **Choose File** to select a CSV file.
2. Select **Upload and embed**.
3. Wait for the confirmation message, for example, “Imported 100 bug reports.”

The import process cleans each report, generates a 384-dimensional semantic vector, and stores both source fields and vector in PostgreSQL. A CSV must contain a `summary` column. It may also include `bug_id` or `external_id`, `description`, `product`, `component` or `component_type`, `resolution_status`, `operating_system`, and `architecture`.

Example CSV:

```csv
bug_id,summary,description,product,component,resolution_status
101,Browser crashes opening preferences,The browser exits when Preferences is selected,Firefox,Preferences,UNRESOLVED
102,Preferences window causes a crash,Opening settings closes the application,Firefox,Preferences,UNRESOLVED
```

If an error appears, confirm that the file is CSV/UTF-8, every row has a non-empty summary, and external IDs are not duplicated. Correct the source data and retry. For large imports, allow time for embedding generation; this is expected because every row is passed through the language model.

## 3. Search for duplicates

1. Choose **Search** in the navigation bar.
2. Type a concise summary plus meaningful symptoms, steps, expected/actual behavior, or error messages in the description box.
3. Select the retrieval method:
   - **HNSW**: recommended general-purpose approximate search.
   - **IVFFlat**: alternative approximate index, useful for comparison.
   - **Exact**: complete cosine search; use it to evaluate quality or on smaller datasets.
4. Select **Search**.
5. Review the results table.

Each row shows the bug number, summary, description preview, product/component, resolution status, and match percentage. A higher percentage means the reports are closer in embedding space; it is not a guarantee that they are duplicates. Compare actual behavior, version, environment, and reproduction steps before making a triage decision. Values above 80% are shown in green, mid-range values in amber, and lower scores in neutral grey.

To obtain the best results, avoid vague descriptions such as “app broken.” Mention the affected feature and failure mode. Example: “Firefox crashes when the Preferences dialog is opened after update” is more useful than “Crash.”

## 4. Benchmark index quality and latency

1. Choose **Benchmarks**.
2. Select **Run HNSW benchmark**.
3. Wait until the completion message appears. A minimum of two imported reports is required.
4. Inspect the metric cards and history table.

The benchmark samples reports. For each report it compares HNSW retrieval with an exact PostgreSQL cosine-neighbour query. **Recall@1**, **Recall@5**, and **Recall@10** report the percentage of sampled queries where approximate results overlap the exact top results. Higher is better. **Average latency** is the mean request duration; **P95 latency** is the slower-end response time that 95% of queries meet or beat. Results are saved, so they remain visible after a browser refresh.

Use the API documentation at `http://localhost:8000/docs` to run a benchmark for `ivfflat` or `exact`, or to choose another sample size and K value. When comparing index types, use the same sample size and K. A faster index with materially lower recall may not be appropriate for triage.

## 5. Troubleshooting

| Problem | Action |
|---|---|
| Dashboard cannot connect | Confirm Docker is running and API health endpoint returns `status: ok`. |
| First import/search is slow | The model may be downloading/loading for the first time. Wait and retry. |
| Import fails | Check CSV headers, non-empty summary, valid UTF-8 text, and unique external IDs. |
| Benchmark says two reports are needed | Import at least two reports before running it. |
| No useful candidates | Add more diagnostic detail to the query, import more relevant historical reports, or check product/component data. |
| PostgreSQL fails to start | Ensure port 5432 is available, or change the host port mapping in `docker-compose.yml`. |

For technical deployment and database instructions, see `documentation/D4_4_Deployment.md`; for API request formats, see the built-in OpenAPI page.
