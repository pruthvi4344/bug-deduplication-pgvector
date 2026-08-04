import React from "react";
import { Loader2 } from "lucide-react";

/* ----------------------------------------------------------------------- */
/*  Shared low-level UI primitives for the AI Bug Deduplication dashboard  */
/*  All colors are driven by CSS custom properties defined in index.css,   */
/*  so components work identically in light and dark theme.                */
/* ----------------------------------------------------------------------- */

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* --------------------------------- Card --------------------------------- */

export function Card({
  className,
  children,
  as: Tag = "div",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { as?: keyof React.JSX.IntrinsicElements }) {
  const Component = Tag as any;
  return (
    <Component
      className={cx(
        "rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]",
        className
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}

/* -------------------------------- Button -------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  const sizes: Record<ButtonSize, string> = {
    sm: "h-8 px-3 text-xs gap-1.5",
    md: "h-10 px-4 text-sm gap-2",
    lg: "h-12 px-6 text-[15px] gap-2.5",
  };

  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-[image:var(--accent-grad)] text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_8px_20px_-8px_rgba(99,102,241,0.65)] hover:brightness-110 active:brightness-95",
    secondary:
      "bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-3)]",
    outline:
      "bg-transparent text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
    ghost: "bg-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]",
    danger: "bg-[var(--danger)] text-white hover:brightness-110",
  };

  return (
    <button
      className={cx(
        "inline-flex items-center justify-center rounded-lg font-medium tracking-[-0.01em]",
        "transition-all duration-150 ease-out select-none whitespace-nowrap",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
        "disabled:opacity-50 disabled:pointer-events-none",
        sizes[size],
        variants[variant],
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

/* --------------------------------- Badge --------------------------------- */

type BadgeVariant =
  | "hnsw"
  | "ivfflat"
  | "exact"
  | "success"
  | "error"
  | "warning"
  | "neutral"
  | "info";

export function Badge({
  variant = "neutral",
  className,
  children,
  icon,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const variants: Record<BadgeVariant, string> = {
    hnsw: "bg-[var(--hnsw-bg)] text-[var(--hnsw-fg)] border-[var(--hnsw-border)]",
    ivfflat: "bg-[var(--ivfflat-bg)] text-[var(--ivfflat-fg)] border-[var(--ivfflat-border)]",
    exact: "bg-[var(--exact-bg)] text-[var(--exact-fg)] border-[var(--exact-border)]",
    success: "bg-[var(--success-bg)] text-[var(--success-fg)] border-[var(--success-border)]",
    error: "bg-[var(--danger-bg)] text-[var(--danger-fg)] border-[var(--danger-border)]",
    warning: "bg-[var(--warning-bg)] text-[var(--warning-fg)] border-[var(--warning-border)]",
    info: "bg-[var(--info-bg)] text-[var(--info-fg)] border-[var(--info-border)]",
    neutral: "bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border)]",
  };

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        variants[variant],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/* ---------------------------- Index type chip ---------------------------- */

export type IndexType = "hnsw" | "ivfflat" | "exact";

export function indexLabel(t: IndexType | string) {
  switch (t) {
    case "hnsw":
      return "HNSW";
    case "ivfflat":
      return "IVFFlat";
    case "exact":
      return "Exact";
    default:
      return t;
  }
}

export function IndexBadge({ type }: { type: IndexType | string }) {
  const variant: BadgeVariant =
    type === "hnsw" ? "hnsw" : type === "ivfflat" ? "ivfflat" : type === "exact" ? "exact" : "neutral";
  return <Badge variant={variant}>{indexLabel(type)}</Badge>;
}

export function IndexSelector({
  value,
  onChange,
  disabled,
}: {
  value: IndexType;
  onChange: (v: IndexType) => void;
  disabled?: boolean;
}) {
  const options: { value: IndexType; label: string; hint: string }[] = [
    { value: "hnsw", label: "HNSW", hint: "Graph-based ANN" },
    { value: "ivfflat", label: "IVFFlat", hint: "Cluster-based ANN" },
    { value: "exact", label: "Exact", hint: "Brute-force cosine" },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Vector index type"
      className="grid grid-cols-3 gap-2"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cx(
              "group flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              active
                ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
                : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]",
              disabled && "opacity-50 pointer-events-none"
            )}
          >
            <span
              className={cx(
                "text-[13px] font-semibold tracking-[-0.01em]",
                active ? "text-[var(--accent-text)]" : "text-[var(--text)]"
              )}
            >
              {opt.label}
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">{opt.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ Progress bar ------------------------------ */

export function confidenceLabel(pct: number) {
  if (pct >= 90) return { label: "Very high", color: "var(--success-fg)" };
  if (pct >= 75) return { label: "High", color: "var(--cyan)" };
  if (pct >= 55) return { label: "Moderate", color: "var(--warning-fg)" };
  return { label: "Low", color: "var(--text-muted)" };
}

export function SimilarityBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const conf = confidenceLabel(pct);
  return (
    <div className="flex min-w-[140px] flex-col gap-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-mono font-medium text-[var(--text)]">{pct.toFixed(1)}%</span>
        <span className="font-medium" style={{ color: conf.color }}>
          {conf.label}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-[image:var(--accent-grad)] transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* -------------------------------- Stat card -------------------------------- */

export function StatCard({
  label,
  value,
  sublabel,
  icon,
  accent = "indigo",
}: {
  label: string;
  value: React.ReactNode;
  sublabel?: string;
  icon?: React.ReactNode;
  accent?: "indigo" | "violet" | "cyan" | "neutral";
}) {
  const accents: Record<string, string> = {
    indigo: "text-[var(--indigo)] bg-[var(--indigo-soft)]",
    violet: "text-[var(--violet)] bg-[var(--violet-soft)]",
    cyan: "text-[var(--cyan)] bg-[var(--cyan-soft)]",
    neutral: "text-[var(--text-muted)] bg-[var(--surface-2)]",
  };
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--text-muted)]">{label}</span>
        {icon && (
          <span className={cx("flex h-7 w-7 items-center justify-center rounded-md", accents[accent])}>
            {icon}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold tracking-tight text-[var(--text)]">{value}</span>
      </div>
      {sublabel && <span className="text-[11px] text-[var(--text-muted)]">{sublabel}</span>}
    </Card>
  );
}

/* -------------------------------- Empty state -------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)]/40 px-6 py-14 text-center">
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)]">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium text-[var(--text)]">{title}</p>
        {description && <p className="max-w-sm text-[13px] text-[var(--text-muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* -------------------------------- Status pill -------------------------------- */

export function StatusPill({ online = true, label }: { online?: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
      <span className="relative flex h-1.5 w-1.5">
        {online && (
          <span
            className={cx(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
              "bg-[var(--success-fg)]"
            )}
          />
        )}
        <span
          className={cx(
            "relative inline-flex h-1.5 w-1.5 rounded-full",
            online ? "bg-[var(--success-fg)]" : "bg-[var(--danger-fg)]"
          )}
        />
      </span>
      {label}
    </span>
  );
}

/* -------------------------------- Skeleton -------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-[var(--surface-3)]", className)} />;
}

/* ------------------------------- Section head ------------------------------- */

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
      <div className="space-y-1.5">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-text)]">
            {eyebrow}
          </p>
        )}
        <h2 className="text-xl font-semibold tracking-[-0.015em] text-[var(--text)]">{title}</h2>
        {description && <p className="max-w-xl text-sm text-[var(--text-muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* -------------------------------- Collapsible -------------------------------- */

export function Collapsible({
  title,
  children,
  defaultOpen = false,
  icon,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-[13px] font-medium text-[var(--text)] hover:bg-[var(--surface-3)]"
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        <span
          className={cx(
            "text-[var(--text-muted)] transition-transform duration-200",
            open && "rotate-180"
          )}
        >
          â–¾
        </span>
      </button>
      {open && <div className="border-t border-[var(--border)] p-3.5">{children}</div>}
    </div>
  );
}

/* -------------------------------- Field label -------------------------------- */

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-[12px] font-medium text-[var(--text)]">
          {label}
        </label>
        {hint && <span className="text-[11px] text-[var(--text-muted)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}