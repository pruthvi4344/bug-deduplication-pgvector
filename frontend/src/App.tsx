import React from "react";
import {
  Database,
  Search as SearchIcon,
  Info,
  Moon,
  Sun,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Network,
  Boxes,
  Target,
  Server,
  Cpu,
  Layers,
  FileJson,
  Clock,
  Zap,
  TrendingUp,
  History,
  ArrowRight,
  ChevronRight,
  Gauge,
  Menu,
  X,
  Braces,
  ListTree,
  ScanSearch,
  GitBranch,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { api } from "./api";
import type { IndexType } from "./components/ui";
import {
  Badge,
  Button,
  Card,
  Collapsible,
  EmptyState,
  Field,
  IndexBadge,
  IndexSelector,
  SectionHeading,
  SimilarityBar,
  Skeleton,
  StatCard,
  StatusPill,
  cx,
  indexLabel,
} from "./components/ui";

/* ========================================================================== */
/*  Types                                                                     */
/*                                                                             */
/*  The backend response shapes are read defensively (multiple possible key   */
/*  names) since api.ts / the FastAPI routes are not modified by this pass.  */
/*  If your backend uses different field names, adjust the `pick()` calls     */
/*  below — no other logic needs to change.                                  */
/* ========================================================================== */

type Page = "home" | "search" | "benchmark" | "about";

interface BugResult {
  id: string;
  summary: string;
  description: string;
  product: string;
  component: string;
  status: string;
  similarityPct: number;
}

interface PlanNode {
  nodeType: string;
  relation?: string;
  indexName?: string;
  actualTime?: number;
  rows?: number;
  depth: number;
}

interface QueryPlanResult {
  requestedMode: IndexType | string;
  actualIndex: string;
  planningTimeMs?: number;
  executionTimeMs?: number;
  nodes: PlanNode[];
  raw: unknown;
}

interface BenchmarkResult {
  sampleSize: number;
  k: number;
  indexType: IndexType | string;
  recallAt1?: number;
  recallAt5?: number;
  recallAt10?: number;
  avgLatencyMs?: number;
  p95LatencyMs?: number;
  raw: unknown;
}

interface BenchmarkHistoryRow {
  id: string;
  indexType: string;
  sampleSize?: number;
  k?: number;
  recallAt1?: number;
  recallAt5?: number;
  recallAt10?: number;
  avgLatencyMs?: number;
  p95LatencyMs?: number;
  timestamp?: string;
}

/* ========================================================================== */
/*  Small helpers                                                             */
/* ========================================================================== */

function pick<T = unknown>(obj: unknown, keys: string[], fallback?: T): T {
  if (obj && typeof obj === "object") {
    for (const k of keys) {
      const v = (obj as Record<string, unknown>)[k];
      if (v !== undefined && v !== null) return v as T;
    }
  }
  return fallback as T;
}

function asArray(obj: unknown, keys: string[]): unknown[] {
  if (Array.isArray(obj)) return obj;
  const found = pick<unknown>(obj, keys);
  return Array.isArray(found) ? found : [];
}

function toPercent(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(n)) return 0;
  return n <= 1 ? n * 100 : n;
}

function formatMs(value: unknown): string {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(n)) return "—";
  return n < 10 ? `${n.toFixed(2)} ms` : `${n.toFixed(1)} ms`;
}

function formatPct(value: unknown): string {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(n)) return "—";
  return `${toPercent(n).toFixed(1)}%`;
}

function normalizeBug(raw: unknown, i: number): BugResult {
  // FastAPI returns each match as { bug: {...database fields...}, similarity: number }.
  const outer = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const report = outer.bug && typeof outer.bug === "object" ? outer.bug as Record<string, unknown> : outer;
  const similarityRaw = pick<number>(outer, ["similarity", "score", "cosine_similarity", "sim"], 0);
  const distance = pick<number | undefined>(outer, ["distance", "cosine_distance"], undefined);
  const similarity = similarityRaw || (typeof distance === "number" ? 1 - distance : 0);
  return {
    id: String(pick<string | number>(report, ["id", "bug_id", "bugId", "external_id"], i + 1)),
    summary: String(pick<string>(report, ["summary", "title"], "Untitled report")),
    description: String(pick<string>(report, ["description", "desc", "details"], "")),
    product: String(pick<string>(report, ["product"], "-")),
    component: String(pick<string>(report, ["component", "component_type"], "-")),
    status: String(pick<string>(report, ["resolution_status", "status"], "UNKNOWN")),
    similarityPct: toPercent(similarity),
  };
}

/** Recursively walk a Postgres EXPLAIN (FORMAT JSON) plan tree. */
function collectPlanNodes(node: unknown, depth = 0, acc: PlanNode[] = []): PlanNode[] {
  if (!node || typeof node !== "object") return acc;
  const n = node as Record<string, unknown>;
  const nodeType = pick<string>(n, ["Node Type", "node_type", "nodeType"]);
  if (nodeType) {
    acc.push({
      nodeType,
      relation: pick<string>(n, ["Relation Name", "relation_name"], undefined),
      indexName: pick<string>(n, ["Index Name", "index_name"], undefined),
      actualTime: pick<number>(n, ["Actual Total Time", "actual_total_time"], undefined),
      rows: pick<number>(n, ["Actual Rows", "actual_rows"], undefined),
      depth,
    });
  }
  const children = pick<unknown[]>(n, ["Plans", "plans", "children"], []);
  if (Array.isArray(children)) {
    for (const child of children) collectPlanNodes(child, depth + 1, acc);
  }
  return acc;
}

function normalizeQueryPlan(raw: unknown, requestedMode: IndexType | string): QueryPlanResult {
  // Backend may either return a friendly summary object, or the raw
  // Postgres `EXPLAIN (ANALYZE, FORMAT JSON)` array — handle both.
  let planRoot: unknown = raw;
  const rawField = pick<unknown>(raw, ["raw_plan", "explain", "plan", "raw"]);
  if (rawField) planRoot = rawField;

  let pgPlanArray: unknown[] | null = null;
  if (Array.isArray(planRoot)) pgPlanArray = planRoot;
  else if (Array.isArray(raw)) pgPlanArray = raw as unknown[];

  const pgTop = pgPlanArray && pgPlanArray.length > 0 ? (pgPlanArray[0] as Record<string, unknown>) : null;
  const pgPlanNode = pgTop ? pick<unknown>(pgTop, ["Plan", "plan"]) : (planRoot && typeof planRoot === "object" ? planRoot : null);

  const nodes = pgPlanNode ? collectPlanNodes(pgPlanNode) : [];

  const indexNode = nodes.find((n) => n.indexName);
  const seqNode = nodes.find((n) => /seq scan/i.test(n.nodeType));

  const actualIndex =
    String(
      pick<string>(raw, ["actual_index", "actual_index_used", "index_used", "selected_index"], "") ||
        String(asArray(raw, ["indexes_used"])[0] ?? "") ||
        (indexNode?.indexName ?? "") ||
        (seqNode ? "Sequential Scan (no index)" : "")
    ) || "Not reported";

  const planningTimeMs = pick<number>(
    raw,
    ["planning_time_ms", "planningTime", "planning_time"],
    pgTop ? pick<number>(pgTop, ["Planning Time", "planning_time"]) : undefined
  );
  const executionTimeMs = pick<number>(
    raw,
    ["execution_time_ms", "executionTime", "execution_time"],
    pgTop ? pick<number>(pgTop, ["Execution Time", "execution_time"]) : undefined
  );

  const explicitNodes = asArray(raw, ["plan_nodes", "nodes"]);
  const fallbackNodes: PlanNode[] =
    nodes.length > 0
      ? nodes
      : explicitNodes.map((n) => ({
          nodeType: typeof n === "string" ? n : String(pick<string>(n, ["node_type", "type"], "Plan node")),
          depth: 0,
        }));

  return {
    requestedMode: pick<string>(raw, ["index_type", "requested_mode", "requested_index_type", "requested_index"], requestedMode),
    actualIndex,
    planningTimeMs,
    executionTimeMs,
    nodes: fallbackNodes,
    raw,
  };
}

function normalizeBenchmark(raw: unknown, sampleSize: number, k: number, indexType: IndexType): BenchmarkResult {
  return {
    sampleSize: pick<number>(raw, ["sample_size", "sampleSize"], sampleSize),
    k: pick<number>(raw, ["k"], k),
    indexType: pick<string>(raw, ["index_type", "indexType"], indexType),
    recallAt1: pick<number>(raw, ["recall_at_1", "recall@1", "recallAt1"], undefined),
    recallAt5: pick<number>(raw, ["recall_at_5", "recall@5", "recallAt5"], undefined),
    recallAt10: pick<number>(raw, ["recall_at_10", "recall@10", "recallAt10"], undefined),
    avgLatencyMs: pick<number>(raw, ["avg_latency_ms", "average_latency_ms", "avgLatencyMs"], undefined),
    p95LatencyMs: pick<number>(raw, ["p95_latency_ms", "p95LatencyMs"], undefined),
    raw,
  };
}

function normalizeHistoryRow(raw: unknown, i: number): BenchmarkHistoryRow {
  return {
    id: String(pick<string | number>(raw, ["id", "run_id"], i)),
    indexType: String(pick<string>(raw, ["index_type", "indexType"], "—")),
    sampleSize: pick<number>(raw, ["sample_size", "sampleSize"], undefined),
    k: pick<number>(raw, ["k"], undefined),
    recallAt1: pick<number>(raw, ["recall_at_1", "recall@1", "recallAt1"], undefined),
    recallAt5: pick<number>(raw, ["recall_at_5", "recall@5", "recallAt5"], undefined),
    recallAt10: pick<number>(raw, ["recall_at_10", "recall@10", "recallAt10"], undefined),
    avgLatencyMs: pick<number>(raw, ["avg_latency_ms", "average_latency_ms", "avgLatencyMs"], undefined),
    p95LatencyMs: pick<number>(raw, ["p95_latency_ms", "p95LatencyMs"], undefined),
    timestamp: pick<string>(raw, ["created_at", "timestamp", "run_at"], undefined),
  };
}

/* ========================================================================== */
/*  Theme                                                                     */
/* ========================================================================== */

function useTheme() {
  const [theme, setTheme] = React.useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem("bugdedup-theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("bugdedup-theme", theme);
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

/* ========================================================================== */
/*  Hash routing (no router dependency)                                       */
/* ========================================================================== */

function usePage(): [Page, (p: Page) => void] {
  const valid: Page[] = ["home", "search", "benchmark", "about"];
  const read = (): Page => {
    const h = window.location.hash.replace("#", "") as Page;
    return valid.includes(h) ? h : "home";
  };
  const [page, setPageState] = React.useState<Page>(read);

  React.useEffect(() => {
    const onHash = () => setPageState(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setPage = (p: Page) => {
    window.location.hash = p;
    setPageState(p);
  };

  return [page, setPage];
}

/* ========================================================================== */
/*  Navigation shell                                                          */
/* ========================================================================== */

const NAV_ITEMS: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "home", label: "Home", icon: <Database className="h-[18px] w-[18px]" /> },
  { id: "search", label: "Search", icon: <SearchIcon className="h-[18px] w-[18px]" /> },
  { id: "benchmark", label: "Benchmark", icon: <Gauge className="h-[18px] w-[18px]" /> },
  { id: "about", label: "About", icon: <Info className="h-[18px] w-[18px]" /> },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[image:var(--accent-grad)] shadow-[0_4px_14px_-4px_rgba(99,102,241,0.65)]">
        <Network className="h-[18px] w-[18px] text-white" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--text)]">BugDedup</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
          pgvector engine
        </span>
      </div>
    </div>
  );
}

function Sidebar({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  const { theme, toggle } = useTheme();
  return (
    <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col justify-between border-r border-[var(--border)] bg-[var(--surface)]/60 px-3 py-4 backdrop-blur-xl lg:flex">
      <div className="flex flex-col gap-6">
        <Brand />
        <nav className="flex flex-col gap-1" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                )}
              >
                {item.icon}
                {item.label}
                {active && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" />}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-3">
        <StatusPill online label="PostgreSQL Connected" />
        <button
          onClick={toggle}
          className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          aria-label="Toggle dark mode"
        >
          <span className="flex items-center gap-2">
            {theme === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            {theme === "dark" ? "Dark mode" : "Light mode"}
          </span>
          <span
            className={cx(
              "relative h-5 w-9 shrink-0 overflow-hidden rounded-full transition-colors",
              theme === "dark" ? "bg-[var(--indigo)]" : "bg-[var(--surface-3)]"
            )}
          >
            <span
              className={cx(
                "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                theme === "dark" ? "translate-x-4" : "translate-x-0"
              )}
            />
          </span>
        </button>
      </div>
    </aside>
  );
}

function TopNav({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  const [open, setOpen] = React.useState(false);
  const { theme, toggle } = useTheme();
  return (
    <div className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-xl lg:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <Brand />
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            aria-label="Toggle dark mode"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)]"
          >
            {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle navigation menu"
            aria-expanded={open}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)]"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="flex flex-col gap-1 border-t border-[var(--border)] px-3 py-3" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setPage(item.id);
                  setOpen(false);
                }}
                className={cx(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                )}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
          <div className="mt-1 border-t border-[var(--border)] pt-3">
            <StatusPill online label="PostgreSQL Connected" />
          </div>
        </nav>
      )}
    </div>
  );
}

/* ========================================================================== */
/*  Home page                                                                 */
/* ========================================================================== */

function ArchitectureDiagram() {
  const stages = [
    { icon: <FileSpreadsheet className="h-4 w-4" />, label: "Bugzilla CSV" },
    { icon: <Cpu className="h-4 w-4" />, label: "MiniLM · 384D" },
    { icon: <Layers className="h-4 w-4" />, label: "pgvector Index" },
    { icon: <Server className="h-4 w-4" />, label: "PostgreSQL" },
  ];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70 p-6 sm:p-8">
      <div className="pointer-events-none absolute inset-0 arch-grid" aria-hidden="true" />
      <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-[var(--indigo)] opacity-[0.14] blur-[90px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 left-0 h-72 w-72 rounded-full bg-[var(--cyan)] opacity-[0.12] blur-[90px]" aria-hidden="true" />

      <div className="relative flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {stages.map((s, i) => (
            <React.Fragment key={s.label}>
              <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-3.5 text-center shadow-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-text)]">
                  {s.icon}
                </span>
                <span className="text-[11px] font-medium text-[var(--text)]">{s.label}</span>
              </div>
              {i < stages.length - 1 && (
                <div className="flow-line hidden h-px w-8 shrink-0 sm:block sm:w-10" aria-hidden="true" />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-[11px] font-medium text-[var(--text-muted)]">Vector index strategy:</span>
          <IndexBadge type="hnsw" />
          <IndexBadge type="ivfflat" />
          <IndexBadge type="exact" />
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "CSV import",
      desc: "Bugzilla exports are parsed for summary, description, product, and component fields.",
      icon: <FileSpreadsheet className="h-[18px] w-[18px]" />,
    },
    {
      n: "02",
      title: "Clean text",
      desc: "Report text is normalized — whitespace, casing, and boilerplate stripped before embedding.",
      icon: <Braces className="h-[18px] w-[18px]" />,
    },
    {
      n: "03",
      title: "384D embedding",
      desc: "A MiniLM sentence-transformer encodes each report into a 384-dimensional vector.",
      icon: <Cpu className="h-[18px] w-[18px]" />,
    },
    {
      n: "04",
      title: "pgvector search",
      desc: "PostgreSQL's pgvector extension ranks duplicates by cosine similarity via HNSW, IVFFlat, or exact scan.",
      icon: <ScanSearch className="h-[18px] w-[18px]" />,
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <Card key={s.n} className="relative flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold text-[var(--text-faint)]">{s.n}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-text)]">
              {s.icon}
            </span>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[var(--text)]">{s.title}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">{s.desc}</p>
          </div>
          {i < steps.length - 1 && (
            <ArrowRight className="absolute -right-[18px] top-1/2 hidden h-4 w-4 -translate-y-1/2 text-[var(--text-faint)] sm:hidden lg:block" aria-hidden="true" />
          )}
        </Card>
      ))}
    </div>
  );
}

function HomePage({ goSearch }: { goSearch: () => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [result, setResult] = React.useState<
    { status: "success" | "error"; message: string; detail?: string } | null
  >(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  const handleFile = (f: File | null) => {
    setResult(null);
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const res = await api.upload(file);
      const rows = pick<number | undefined>(res, ["rows_imported", "rows", "imported", "count"], undefined);
      const embedded = pick<number | undefined>(res, ["embedded", "embeddings_created"], undefined);
      const detailParts: string[] = [];
      if (typeof rows === "number") detailParts.push(`${rows} reports imported`);
      if (typeof embedded === "number") detailParts.push(`${embedded} embeddings generated`);
      setResult({
        status: "success",
        message: "Upload and embedding complete.",
        detail: detailParts.length ? detailParts.join(" · ") : "The dataset is ready to search.",
      });
    } catch (err) {
      setResult({
        status: "error",
        message: "Upload failed.",
        detail: err instanceof Error ? err.message : "The server rejected the request. Check the CSV format and try again.",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      {/* Hero */}
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Badge variant="info" icon={<Sparkles className="h-3 w-3" />}>
            Master's project · Database Systems
          </Badge>
          <h1 className="max-w-2xl text-3xl font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--text)] sm:text-4xl">
            Semantic bug deduplication, powered by PostgreSQL pgvector
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-[var(--text-muted)]">
            Reports are embedded into 384-dimensional vectors and matched by cosine similarity directly
            inside PostgreSQL — comparing HNSW, IVFFlat, and exact nearest-neighbor search on real query
            plans and benchmarks.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button variant="primary" size="lg" icon={<SearchIcon className="h-4 w-4" />} onClick={goSearch}>
              Run a search
            </Button>
            <Button
              variant="outline"
              size="lg"
              icon={<UploadCloud className="h-4 w-4" />}
              onClick={() => inputRef.current?.focus()}
            >
              Import a dataset
            </Button>
          </div>
        </div>

        <ArchitectureDiagram />
      </section>

      {/* How it works */}
      <section className="flex flex-col gap-4">
        <SectionHeading
          eyebrow="Pipeline"
          title="How it works"
          description="Every uploaded report follows the same four-stage path from raw CSV to an indexed vector in Postgres."
        />
        <HowItWorks />
      </section>

      {/* Upload */}
      <section className="flex flex-col gap-4" aria-labelledby="upload-heading">
        <SectionHeading
          eyebrow="Data ingestion"
          title="Import Bugzilla reports"
          description="Upload a CSV export to parse, clean, embed, and index new bug reports."
        />
        <Card className="p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={cx(
                "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                dragOver ? "border-[var(--indigo)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface-2)]/50"
              )}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)]">
                <UploadCloud className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-[var(--text)]">
                  {file ? file.name : "Drag a CSV here, or browse"}
                </p>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB · ready to import`
                    : "Bugzilla export format · .csv"}
                </p>
              </div>
              <label>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  aria-label="Choose CSV file to upload"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
                <span className="cursor-pointer rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--text)] hover:bg-[var(--surface-3)]">
                  Browse files
                </span>
              </label>
            </div>

            <div className="flex flex-col justify-between gap-4">
              <div className="space-y-2.5 text-[12.5px] text-[var(--text-muted)]">
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--success-fg)]" />
                  Parses summary, description, product &amp; component
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--success-fg)]" />
                  Generates 384D MiniLM embeddings per report
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--success-fg)]" />
                  Writes vectors into the pgvector-indexed table
                </p>
              </div>

              <Button
                variant="primary"
                icon={<UploadCloud className="h-4 w-4" />}
                loading={uploading}
                disabled={!file}
                onClick={handleUpload}
                className="w-full"
              >
                {uploading ? "Uploading & embedding…" : "Upload and embed"}
              </Button>

              {result && (
                <div
                  role="status"
                  className={cx(
                    "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[12.5px]",
                    result.status === "success"
                      ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
                      : "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
                  )}
                >
                  {result.status === "success" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div>
                    <p className="font-medium">{result.message}</p>
                    {result.detail && <p className="mt-0.5 opacity-90">{result.detail}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

/* ========================================================================== */
/*  Search page                                                               */
/* ========================================================================== */

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const variant = s.includes("open") || s.includes("new") ? "warning" : s.includes("closed") || s.includes("resolved") ? "success" : "neutral";
  return <Badge variant={variant as any}>{status}</Badge>;
}

function QueryPlanPanel({ plan }: { plan: QueryPlanResult }) {
  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <GitBranch className="h-4 w-4" />
          </span>
          <h3 className="text-[15px] font-semibold text-[var(--text)]">EXPLAIN ANALYZE result</h3>
        </div>
        <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          This panel proves which PostgreSQL execution plan and vector index were actually selected.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Requested mode</p>
          <div className="mt-1.5">
            <IndexBadge type={plan.requestedMode} />
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Index selected</p>
          <p className="mt-1.5 truncate font-mono text-[12.5px] font-medium text-[var(--text)]" title={plan.actualIndex}>
            {plan.actualIndex}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Planning time</p>
          <p className="mt-1.5 font-mono text-[12.5px] font-medium text-[var(--text)]">
            {plan.planningTimeMs !== undefined ? formatMs(plan.planningTimeMs) : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Execution time</p>
          <p className="mt-1.5 font-mono text-[12.5px] font-medium text-[var(--text)]">
            {plan.executionTimeMs !== undefined ? formatMs(plan.executionTimeMs) : "—"}
          </p>
        </div>
      </div>

      {plan.nodes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Plan nodes</p>
          <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
            {plan.nodes.map((n, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-[12.5px]"
                style={{ paddingLeft: `${n.depth * 16}px` }}
              >
                <ListTree className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
                <span className="font-mono font-medium text-[var(--text)]">{n.nodeType}</span>
                {n.indexName && (
                  <span className="truncate font-mono text-[var(--accent-text)]">via {n.indexName}</span>
                )}
                {n.relation && !n.indexName && (
                  <span className="truncate font-mono text-[var(--text-muted)]">on {n.relation}</span>
                )}
                {n.actualTime !== undefined && (
                  <span className="ml-auto shrink-0 font-mono text-[var(--text-muted)]">{formatMs(n.actualTime)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Collapsible
        title="Raw EXPLAIN ANALYZE JSON"
        icon={<FileJson className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
      >
        <pre className="max-h-80 overflow-auto rounded-md bg-[var(--code-bg)] p-3 font-mono text-[11.5px] leading-relaxed text-[var(--code-fg)]">
          {JSON.stringify(plan.raw, null, 2)}
        </pre>
      </Collapsible>
    </Card>
  );
}

function SearchPage() {
  const [query, setQuery] = React.useState("");
  const [k, setK] = React.useState(5);
  const [indexType, setIndexType] = React.useState<IndexType>("hnsw");

  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<BugResult[] | null>(null);

  const [planLoading, setPlanLoading] = React.useState(false);
  const [planError, setPlanError] = React.useState<string | null>(null);
  const [plan, setPlan] = React.useState<QueryPlanResult | null>(null);

  const canSearch = query.trim().length > 0 && !searching;

  const handleSearch = async () => {
    if (!canSearch) return;
    setSearching(true);
    setSearchError(null);
    setPlan(null);
    setPlanError(null);
    try {
      const res = await api.search({ query: query.trim(), k, index_type: indexType });
      const list = asArray(res, ["results", "data", "matches"]);
      const items = (list.length > 0 || Array.isArray(res) ? list : []).map((r, i) => normalizeBug(r, i));
      setResults(items);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed. Confirm the backend is running.");
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const handleExplain = async () => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const res = await api.queryPlan({ query: query.trim(), k, index_type: indexType });
      setPlan(normalizeQueryPlan(res, indexType));
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Could not retrieve the query plan.");
    } finally {
      setPlanLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        eyebrow="Semantic search"
        title="Find duplicate bug reports"
        description="Search runs a k-nearest-neighbor cosine similarity query against the pgvector index you select."
      />

      <Card className="flex flex-col gap-5 p-5 sm:p-6">
        <Field label="Bug description" htmlFor="query-input" hint={`${query.length} characters`}>
          <textarea
            id="query-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={5}
            placeholder="Describe the bug — steps to reproduce, error message, affected component…"
            className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-[13.5px] leading-relaxed text-[var(--text)] placeholder:text-[var(--text-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_140px]">
          <Field label="Vector index">
            <IndexSelector value={indexType} onChange={setIndexType} disabled={searching} />
          </Field>
          <Field label="Neighbors (k)" htmlFor="k-input">
            <input
              id="k-input"
              type="number"
              min={1}
              max={50}
              value={k}
              onChange={(e) => setK(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              className="h-[42px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 font-mono text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            icon={<SearchIcon className="h-4 w-4" />}
            loading={searching}
            disabled={!canSearch}
            onClick={handleSearch}
          >
            {searching ? "Searching…" : "Search"}
          </Button>
          {results && (
            <Button
              variant="secondary"
              icon={<GitBranch className="h-4 w-4" />}
              loading={planLoading}
              onClick={handleExplain}
            >
              {planLoading ? "Explaining…" : "Explain query plan"}
            </Button>
          )}
          <span className="text-[12px] text-[var(--text-muted)]">
            Query executes <span className="font-medium text-[var(--text)]">{indexLabel(indexType)}</span> · top {k}
          </span>
        </div>

        {searchError && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-3 text-[12.5px] text-[var(--danger-fg)]">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{searchError}</p>
          </div>
        )}
      </Card>

      {/* Results */}
      {results === null && !searching && (
        <EmptyState
          icon={<SearchIcon className="h-5 w-5" />}
          title="No search run yet"
          description="Describe a bug above and run a search to see semantically similar reports ranked by cosine similarity."
        />
      )}

      {searching && (
        <Card className="p-5">
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </Card>
      )}

      {results !== null && !searching && results.length === 0 && (
        <EmptyState
          icon={<SearchIcon className="h-5 w-5" />}
          title="No matches found"
          description="No reports met the similarity threshold for this index. Try a different query or increase k."
        />
      )}

      {results !== null && results.length > 0 && !searching && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
            <p className="text-[13px] font-medium text-[var(--text)]">
              {results.length} result{results.length === 1 ? "" : "s"}
            </p>
            <IndexBadge type={indexType} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-5 py-2.5 font-medium">Bug</th>
                  <th className="px-5 py-2.5 font-medium">Product / Component</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Similarity</th>
                </tr>
              </thead>
              <tbody>
                {results.map((bug) => (
                  <tr key={bug.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]/60">
                    <td className="max-w-[340px] px-5 py-3.5 align-top">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-[var(--text-faint)]">#{bug.id}</span>
                      </div>
                      <p className="mt-0.5 text-[13px] font-medium text-[var(--text)]">{bug.summary}</p>
                      {bug.description && (
                        <p className="mt-0.5 line-clamp-2 text-[12px] text-[var(--text-muted)]">{bug.description}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 align-top text-[12.5px] text-[var(--text-muted)]">
                      <p className="text-[var(--text)]">{bug.product}</p>
                      <p>{bug.component}</p>
                    </td>
                    <td className="px-5 py-3.5 align-top">
                      <StatusBadge status={bug.status} />
                    </td>
                    <td className="px-5 py-3.5 align-top">
                      <SimilarityBar value={bug.similarityPct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {planError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-3 text-[12.5px] text-[var(--danger-fg)]">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{planError}</p>
        </div>
      )}

      {plan && <QueryPlanPanel plan={plan} />}
    </div>
  );
}

/* ========================================================================== */
/*  Benchmark page                                                            */
/* ========================================================================== */

function BenchmarkPage() {
  const [sampleSize, setSampleSize] = React.useState(200);
  const [k, setK] = React.useState(10);
  const [indexType, setIndexType] = React.useState<IndexType>("hnsw");

  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<BenchmarkResult | null>(null);

  const [history, setHistory] = React.useState<BenchmarkHistoryRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [historyError, setHistoryError] = React.useState<string | null>(null);

  const loadHistory = React.useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await api.history();
      const list = asArray(res, ["history", "runs", "data"]);
      setHistory(list.map(normalizeHistoryRow));
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Could not load benchmark history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await api.benchmark({ sample_size: sampleSize, k, index_type: indexType });
      setResult(normalizeBenchmark(res, sampleSize, k, indexType));
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Benchmark run failed.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        eyebrow="Evaluation"
        title="Index benchmarks"
        description="Measure recall and latency for the selected pgvector index against exact cosine search as ground truth."
      />

      <Card className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_140px_140px]">
          <Field label="Index under test">
            <IndexSelector value={indexType} onChange={setIndexType} disabled={running} />
          </Field>
          <Field label="Sample size" htmlFor="sample-input">
            <input
              id="sample-input"
              type="number"
              min={10}
              max={5000}
              step={10}
              value={sampleSize}
              onChange={(e) => setSampleSize(Math.max(1, Number(e.target.value) || 1))}
              className="h-[42px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 font-mono text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </Field>
          <Field label="k" htmlFor="bench-k-input">
            <input
              id="bench-k-input"
              type="number"
              min={1}
              max={50}
              value={k}
              onChange={(e) => setK(Math.max(1, Number(e.target.value) || 1))}
              className="h-[42px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 font-mono text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<Zap className="h-4 w-4" />} loading={running} onClick={handleRun}>
            {running ? "Running benchmark…" : `Run ${indexLabel(indexType)} benchmark`}
          </Button>
          <span className="text-[12px] text-[var(--text-muted)]">
            {sampleSize} queries · top {k} · ground truth via exact cosine search
          </span>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-3 text-[12.5px] text-[var(--danger-fg)]">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </Card>

      {running && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {result && !running && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <IndexBadge type={result.indexType} />
            <span className="text-[12px] text-[var(--text-muted)]">
              {result.sampleSize} samples · top {result.k}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="Recall@1"
              value={formatPct(result.recallAt1)}
              icon={<Target className="h-4 w-4" />}
              accent="indigo"
            />
            <StatCard
              label="Recall@5"
              value={formatPct(result.recallAt5)}
              icon={<Target className="h-4 w-4" />}
              accent="indigo"
            />
            <StatCard
              label="Recall@10"
              value={formatPct(result.recallAt10)}
              icon={<Target className="h-4 w-4" />}
              accent="indigo"
            />
            <StatCard
              label="Avg latency"
              value={result.avgLatencyMs !== undefined ? formatMs(result.avgLatencyMs) : "—"}
              icon={<Clock className="h-4 w-4" />}
              accent="cyan"
            />
            <StatCard
              label="P95 latency"
              value={result.p95LatencyMs !== undefined ? formatMs(result.p95LatencyMs) : "—"}
              icon={<TrendingUp className="h-4 w-4" />}
              accent="violet"
            />
          </div>
        </div>
      )}

      {!result && !running && (
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="No benchmark run yet"
          description="Run a benchmark to measure recall and latency for the selected index against exact search."
        />
      )}

      {/* History */}
      <div className="flex flex-col gap-4">
        <SectionHeading
          eyebrow="Run log"
          title="Benchmark history"
          action={
            <Button variant="ghost" size="sm" icon={<History className="h-3.5 w-3.5" />} onClick={loadHistory}>
              Refresh
            </Button>
          }
        />

        {historyLoading && (
          <Card className="p-5">
            <div className="flex flex-col gap-2.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </Card>
        )}

        {historyError && !historyLoading && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-3 text-[12.5px] text-[var(--danger-fg)]">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{historyError}</p>
          </div>
        )}

        {!historyLoading && !historyError && history && history.length === 0 && (
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="No benchmark runs recorded"
            description="Run your first benchmark above — it will appear here for comparison."
          />
        )}

        {!historyLoading && !historyError && history && history.length > 0 && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                    <th className="px-5 py-2.5 font-medium">Index</th>
                    <th className="px-5 py-2.5 font-medium">Samples</th>
                    <th className="px-5 py-2.5 font-medium">k</th>
                    <th className="px-5 py-2.5 font-medium">Recall@1</th>
                    <th className="px-5 py-2.5 font-medium">Recall@5</th>
                    <th className="px-5 py-2.5 font-medium">Recall@10</th>
                    <th className="px-5 py-2.5 font-medium">Avg latency</th>
                    <th className="px-5 py-2.5 font-medium">P95 latency</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]/60">
                      <td className="px-5 py-3 align-top">
                        <IndexBadge type={row.indexType} />
                      </td>
                      <td className="px-5 py-3 align-top font-mono text-[12.5px] text-[var(--text)]">{row.sampleSize ?? "—"}</td>
                      <td className="px-5 py-3 align-top font-mono text-[12.5px] text-[var(--text)]">{row.k ?? "—"}</td>
                      <td className="px-5 py-3 align-top font-mono text-[12.5px] text-[var(--text)]">{formatPct(row.recallAt1)}</td>
                      <td className="px-5 py-3 align-top font-mono text-[12.5px] text-[var(--text)]">{formatPct(row.recallAt5)}</td>
                      <td className="px-5 py-3 align-top font-mono text-[12.5px] text-[var(--text)]">{formatPct(row.recallAt10)}</td>
                      <td className="px-5 py-3 align-top font-mono text-[12.5px] text-[var(--text)]">
                        {row.avgLatencyMs !== undefined ? formatMs(row.avgLatencyMs) : "—"}
                      </td>
                      <td className="px-5 py-3 align-top font-mono text-[12.5px] text-[var(--text)]">
                        {row.p95LatencyMs !== undefined ? formatMs(row.p95LatencyMs) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  About page                                                                */
/* ========================================================================== */

function AboutPage() {
  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        eyebrow="Reference"
        title="How the system works"
        description="A short technical overview of the embedding model and PostgreSQL vector search strategies used in this project."
      />

      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <Cpu className="h-[18px] w-[18px]" />
          </span>
          <div className="space-y-2">
            <h3 className="text-[15px] font-semibold text-[var(--text)]">MiniLM · 384-dimensional embeddings</h3>
            <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
              Each bug report's summary and description are encoded by a MiniLM sentence-transformer into a
              dense 384-dimensional vector. Reports that describe the same underlying issue — even with
              different wording — land close together in this vector space, which is what makes semantic
              duplicate detection possible where keyword search fails.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <Database className="h-[18px] w-[18px]" />
          </span>
          <div className="space-y-2">
            <h3 className="text-[15px] font-semibold text-[var(--text)]">PostgreSQL pgvector &amp; cosine similarity</h3>
            <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
              pgvector adds a native <code className="rounded bg-[var(--code-bg)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--code-fg)]">vector</code> column
              type to PostgreSQL, along with distance operators. This project ranks candidate duplicates by
              cosine similarity, computed directly inside the database with SQL — no separate vector service
              required.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--hnsw-bg)] text-[var(--hnsw-fg)]">
              <Network className="h-4 w-4" />
            </span>
            <h4 className="text-[13.5px] font-semibold text-[var(--text)]">HNSW</h4>
          </div>
          <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
            Hierarchical Navigable Small World graphs give fast, high-recall approximate nearest-neighbor
            search by traversing layered proximity graphs — the default choice for low-latency lookups at scale.
          </p>
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--ivfflat-bg)] text-[var(--ivfflat-fg)]">
              <Boxes className="h-4 w-4" />
            </span>
            <h4 className="text-[13.5px] font-semibold text-[var(--text)]">IVFFlat</h4>
          </div>
          <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
            Inverted File indexing clusters vectors into partitioned lists, then searches only the nearest
            clusters — trading some recall for a smaller, faster-to-build index than HNSW.
          </p>
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--exact-bg)] text-[var(--exact-fg)]">
              <Target className="h-4 w-4" />
            </span>
            <h4 className="text-[13.5px] font-semibold text-[var(--text)]">Exact search</h4>
          </div>
          <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
            A brute-force sequential scan computing cosine distance against every row. Guarantees perfect
            recall and serves as the ground truth for benchmarking the approximate indexes.
          </p>
        </Card>
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Root app                                                                  */
/* ========================================================================== */

export default function App() {
  const [page, setPage] = usePage();

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="app-bg pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />
      <div className="flex">
        <Sidebar page={page} setPage={setPage} />
        <div className="flex min-h-screen flex-1 flex-col">
          <TopNav page={page} setPage={setPage} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
            {page === "home" && <HomePage goSearch={() => setPage("search")} />}
            {page === "search" && <SearchPage />}
            {page === "benchmark" && <BenchmarkPage />}
            {page === "about" && <AboutPage />}
          </main>
          <footer className="border-t border-[var(--border)] px-4 py-5 text-center text-[11.5px] text-[var(--text-muted)] sm:px-6 lg:px-10">
            AI Bug Deduplication System · PostgreSQL pgvector · MiniLM embeddings
          </footer>
        </div>
      </div>
    </div>
  );
}