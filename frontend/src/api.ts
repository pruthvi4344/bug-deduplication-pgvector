export type Result = { bug: { id: number; summary: string; description: string; product?: string; component?: string; resolution_status: string }; similarity: number };
export type Bench = { id: number; index_type: string; k: number; queries_evaluated: number; recall_at_1: number; recall_at_5: number; recall_at_10: number; average_latency_ms: number; p95_latency_ms: number; created_at: string };
export type QueryPlan = { index_type: string; planning_time_ms: number | null; execution_time_ms: number | null; indexes_used: string[]; plan_nodes: string[]; raw_plan: Record<string, unknown> };
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

  async function request<T>(
    path: string,
    init?: RequestInit
  ): Promise<T> { {
  const response = await fetch(API + path, init);
  if (!response.ok) throw new Error((await response.json().catch(() => ({ detail: response.statusText }))).detail);
  return response.json();
}
const 
const json = (
  body: object
): { method: string; headers: { 'Content-Type': string }; body: string } => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify\(body\)
  });

export const api = {
  /**
   * Perform a search query and return the results.
   * @param body - The search criteria.
   * @returns A Promise resolving to an array of Result objects.
   */
  search: (body: object) => request<Result[]>('/api/search', json(body)),

  /**
   * Retrieve a query plan for the given criteria.
   * @param body - The query criteria.
   * @returns A Promise resolving to a QueryPlan object.
   */
  queryPlan: (body: object) => request<QueryPlan>('/api/query-plan', json(body)),

  /**
   * Get the list of benchmarks.
   * @returns A Promise resolving to an array of Bench objects.
   */
  history: () => request<Bench[]>('/api/benchmarks'),

  /**
   * Create a new benchmark.
   * @param body - The benchmark data.
   * @returns A Promise resolving to a Bench object.
   */
  benchmark: (body: object) => request<Bench>('/api/benchmarks', json(body)),

  /**
   * Upload a bug report file.
   * @param file - The file to upload.
   * @returns A Promise resolving to an object with the number of imported bugs.
   */
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ imported: number }>('/api/bugs/import', { method: 'POST', body: form });
  },
}};
  search: (body: object) => request<Result[]>('/api/search', json(body)),
  queryPlan: (body: object) => request<QueryPlan>('/api/query-plan', json(body)),
  history: () => request<Bench[]>('/api/benchmarks'),
  benchmark: (body: object) => request<Bench>('/api/benchmarks', json(body)),
  upload: (file: File) => { const form = new FormData(); form.append('file', file); return request<{ imported: number }>('/api/bugs/import', { method: 'POST', body: form }); },
};
