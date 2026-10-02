import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Loader2, ChevronDown, WifiOff, RefreshCw } from "lucide-react";
import { cx, titleCase, severityColor } from "@/lib/utils";

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const colorMap: Record<string, string> = {
    active: "text-severity-low bg-severity-low/10 border-severity-low/30",
    ready: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    // Per-service health (status_service.service_health / build_status_report).
    healthy: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    ok: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    unknown: "text-severity-medium bg-severity-medium/10 border-severity-medium/30",
    degraded: "text-severity-medium bg-severity-medium/10 border-severity-medium/30",
    warning: "text-severity-medium bg-severity-medium/10 border-severity-medium/30",
    error: "text-severity-critical bg-severity-critical/10 border-severity-critical/30",
    down: "text-severity-critical bg-severity-critical/10 border-severity-critical/30",
    unhealthy: "text-severity-critical bg-severity-critical/10 border-severity-critical/30",
    completed: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    running: "text-severity-low bg-severity-low/10 border-severity-low/30",
    queued: "text-slate-400 bg-slate-400/10 border-slate-500/30",
    pending: "text-severity-medium bg-severity-medium/10 border-severity-medium/30",
    open: "text-severity-high bg-severity-high/10 border-severity-high/30",
    failed: "text-severity-critical bg-severity-critical/10 border-severity-critical/30",
    rejected: "text-severity-critical bg-severity-critical/10 border-severity-critical/30",
    cancelled: "text-slate-400 bg-slate-400/10 border-slate-500/30",
    closed: "text-slate-400 bg-slate-400/10 border-slate-500/30",
    not_bootstrapped: "text-severity-medium bg-severity-medium/10 border-severity-medium/30",
    approved: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  };
  const cls = colorMap[status ?? ""] ?? "text-slate-400 bg-slate-400/10 border-slate-500/30";
  return (
    <span className={cx("chip capitalize", cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {titleCase(status)}
    </span>
  );
}

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  return (
    <span className={cx("chip capitalize", severityColor[severity] ?? "text-slate-400 bg-slate-400/10 border-slate-500/30", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {titleCase(severity)}
    </span>
  );
}

export function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    critical: "text-severity-critical bg-severity-critical/10 border-severity-critical/30",
    high: "text-severity-high bg-severity-high/10 border-severity-high/30",
    medium: "text-severity-medium bg-severity-medium/10 border-severity-medium/30",
    low: "text-severity-low bg-severity-low/10 border-severity-low/30",
  };
  return (
    <span className={cx("chip capitalize", colors[level] ?? "text-slate-400 bg-slate-400/10 border-slate-500/30")}>
      {titleCase(level)}
    </span>
  );
}

// Card padding steps. "md" is the default; "sm" is for one-line strips and
// callouts; "none" is for cards whose children pad themselves (tables, divided
// lists), so the padding is never applied twice.
const CARD_PAD = { none: "", sm: "px-4 py-3", md: "p-4" } as const;

export function Card({ children, className, hover, pad = "md" }: { children: React.ReactNode; className?: string; hover?: boolean; pad?: keyof typeof CARD_PAD }) {
  return (
    <div className={cx("card", CARD_PAD[pad], hover && "transition-all duration-300 hover:border-phantix-500/60 hover:shadow-glow-blue hover:-translate-y-0.5", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-[15px] font-semibold text-slate-100 break-words">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400 break-words">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Card whose body collapses away — for informational/reference content
 *  (static lists, ID lookups, delivery logs) that otherwise pushes the page's
 *  interactive work below the fold. */
export function CollapsibleCard({
  title,
  subtitle,
  action,
  defaultOpen = false,
  className,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cx("card p-4", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[15px] font-semibold text-slate-100 break-words">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400 break-words">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          <ChevronDown size={16} className={cx("text-slate-500 transition-transform", open && "rotate-180")} />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-[16rem]">
        <h1 className="font-display text-[24px] font-bold leading-tight tracking-tight text-white">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-400">{description}</p>}
      </div>
      {/* Header buttons run compact (~34px): they sit beside a title, not a form. */}
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2 [&>div]:flex-wrap [&_.btn-primary]:py-1.5 [&_.btn-secondary]:py-1.5 [&_.btn-ghost]:py-1.5 [&_.btn-danger]:py-1.5">{actions}</div>}
    </motion.div>
  );
}

export function StatCard({ label, value, icon, trend, trendLabel, className }: { label: string; value: React.ReactNode; icon?: React.ReactNode; trend?: "up" | "down" | "neutral"; trendLabel?: string; className?: string }) {
  return (
    <div className={cx("card px-4 py-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">{label}</p>
          <div className="font-display text-[22px] font-bold leading-tight text-white">{value}</div>
          {trendLabel && (
            <p className={cx("text-xs mt-1", trend === "up" ? "text-severity-critical" : trend === "down" ? "text-emerald-400" : "text-slate-400")}>
              {trend === "up" ? "↑" : trend === "down" ? "↓" : "---"} {trendLabel}
            </p>
          )}
        </div>
        {icon && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-phantix-800/70 text-phantix-300 [&_svg]:h-4 [&_svg]:w-4">{icon}</div>}
      </div>
    </div>
  );
}

export function AnimatedNumber({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    const start = performance.now();
    let raf: number;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{display.toLocaleString()}</>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] flex items-start justify-center bg-phantix-950/80 backdrop-blur-sm p-4 pt-12 overflow-y-auto" onClick={onClose}>
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className={cx("glass-bright w-full rounded-2xl shadow-card mb-12", wide ? "max-w-4xl" : "max-w-lg")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-phantix-700/40 px-4 py-3 sm:px-6 sm:py-4">
              <h3 className="font-display text-base font-semibold text-white">{title}</h3>
              <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-phantix-700/50 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[68vh] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-4 w-4 animate-spin", className)} />;
}

// Column widths are a fixed cycle rather than Math.random() — a random width
// recomputed on every render makes the placeholder twitch while it loads.
const SKELETON_COL_WIDTHS = ["96%", "72%", "88%", "64%", "80%"];

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="skeleton h-8 flex-1 rounded"
              style={{ maxWidth: SKELETON_COL_WIDTHS[(i + j) % SKELETON_COL_WIDTHS.length], opacity: 1 - i * 0.08 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cx("card border-phantix-700/40 bg-phantix-900/50 p-5", className)}>
      <div className="skeleton h-4 w-3/4 rounded" />
      <div className="skeleton mt-3 h-3 w-1/2 rounded" />
      <div className="skeleton mt-5 h-3 w-full rounded" />
      <div className="skeleton mt-2 h-3 w-5/6 rounded" />
    </div>
  );
}

// ── Optimistic UI / page-layout skeletons ─────────────────────────────────────
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function PageHeaderSkeleton({ actions = false }: { actions?: boolean }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="skeleton mb-2 h-5 w-48 rounded" />
        <div className="skeleton h-8 w-72 max-w-full rounded" />
        <div className="mt-3 skeleton h-3 w-96 max-w-full rounded" />
      </div>
      {actions && <div className="flex gap-2"><div className="skeleton h-9 w-28 rounded-md" /><div className="skeleton h-9 w-32 rounded-md" /></div>}
    </div>
  );
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cx("card border-phantix-700/40 bg-phantix-900/50 p-4", className)}>
      <div className="skeleton h-3 w-16 rounded" />
      <div className="mt-3 skeleton h-7 w-20 rounded" />
      <div className="mt-2 skeleton h-2.5 w-24 rounded" />
    </div>
  );
}

export function CardListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card border-phantix-700/40 bg-phantix-900/50 p-4">
          <div className="flex items-center gap-3">
            <div className="skeleton h-10 w-10 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-4 w-2/3 rounded" />
              <div className="skeleton h-3 w-1/3 rounded" />
            </div>
            <div className="skeleton h-6 w-16 shrink-0 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableCardSkeleton({ rows = 5, cols = 4, title = true }: { rows?: number; cols?: number; title?: boolean }) {
  return (
    <div className="card overflow-hidden border-phantix-700/40 bg-phantix-900/50">
      {title && (
        <div className="flex items-center justify-between border-b border-phantix-700/40 px-4 py-3">
          <div className="skeleton h-4 w-40 rounded" />
          <div className="skeleton h-6 w-16 rounded-full" />
        </div>
      )}
      <div className="space-y-0 divide-y divide-phantix-800/40 px-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="grid items-center gap-4 py-3.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }).map((__, j) => (
              <div key={j} className="skeleton h-3.5 rounded" style={{ width: j === 0 ? "82%" : "100%", opacity: 1 - i * 0.07 - j * 0.05 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SplitPaneSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <div className="xl:col-span-1"><CardListSkeleton rows={rows} /></div>
      <div className="xl:col-span-2"><DetailSkeleton /></div>
    </div>
  );
}


/** Chart panel — axis rail plus bars of uneven height, so the placeholder
 *  reads as a chart rather than as a grey rectangle. Heights are fixed (not
 *  random) so the shape does not reshuffle on every re-render. */
const CHART_BARS = [46, 72, 38, 88, 57, 94, 63, 41, 79, 52, 68, 85];
export function ChartCardSkeleton({ bars = 12, className }: { bars?: number; className?: string }) {
  return (
    <div className={cx("card border-phantix-700/40 bg-phantix-900/50 p-5", className)}>
      <div className="skeleton h-4 w-40 rounded" />
      <div className="skeleton mt-2 h-2.5 w-56 max-w-full rounded" />
      <div className="mt-6 flex h-40 items-end gap-2">
        {Array.from({ length: bars }).map((_, i) => (
          <div key={i} className="skeleton flex-1 rounded-sm" style={{ height: `${CHART_BARS[i % CHART_BARS.length]}%` }} />
        ))}
      </div>
      <div className="skeleton mt-3 h-2 w-full rounded" />
    </div>
  );
}

/** Label + input pairs — forms, filters and configuration panels. */
export function FormSkeleton({ fields = 5, className }: { fields?: number; className?: string }) {
  return (
    <div className={cx("space-y-4", className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="skeleton h-3 w-28 rounded" />
          <div className="skeleton h-9 w-full rounded-md" />
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <div className="skeleton h-9 w-28 rounded-md" />
        <div className="skeleton h-9 w-20 rounded-md" />
      </div>
    </div>
  );
}

/** Stacked label + control rows — settings and configuration screens. */
export function SettingsSkeleton({ groups = 3, rows = 3 }: { groups?: number; rows?: number }) {
  return (
    <div className="space-y-5">
      {Array.from({ length: groups }).map((_, g) => (
        <div key={g} className="card border-phantix-700/40 bg-phantix-900/50 p-5">
          <div className="skeleton h-4 w-44 rounded" />
          <div className="skeleton mt-2 h-3 w-72 max-w-full rounded" />
          <div className="mt-5 space-y-4">
            {Array.from({ length: rows }).map((__, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-40 rounded" />
                  <div className="skeleton h-2.5 w-64 max-w-full rounded" />
                </div>
                <div className="skeleton h-8 w-24 shrink-0 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Numbered step rail + active step panel — wizard / multi-stage flows. */
export function WizardSkeleton({ steps = 5 }: { steps?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
      <div className="space-y-2 lg:col-span-1">
        {Array.from({ length: steps }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-md border border-phantix-700/40 bg-phantix-900/50 p-3">
            <div className="skeleton h-7 w-7 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton h-2.5 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>
      <div className="lg:col-span-3">
        <div className="card border-phantix-700/40 bg-phantix-900/50 p-6">
          <div className="skeleton h-5 w-56 rounded" />
          <div className="skeleton mt-3 h-3 w-full max-w-lg rounded" />
          <div className="mt-6"><FormSkeleton fields={4} /></div>
        </div>
      </div>
    </div>
  );
}

/** Long-form record — title block, meta chips, then prose lines. Used for
 *  document, report-section and detail-drawer loads. */
export function DetailSkeleton({ paragraphs = 3, className }: { paragraphs?: number; className?: string }) {
  return (
    <div className={cx("card border-phantix-700/40 bg-phantix-900/50 p-6", className)}>
      <div className="skeleton h-6 w-2/3 max-w-md rounded" />
      <div className="mt-3 flex gap-2">
        <div className="skeleton h-5 w-20 rounded-md" />
        <div className="skeleton h-5 w-24 rounded-md" />
        <div className="skeleton h-5 w-16 rounded-md" />
      </div>
      <div className="mt-6 space-y-5">
        {Array.from({ length: paragraphs }).map((_, p) => (
          <div key={p} className="space-y-2.5">
            <div className="skeleton h-3.5 w-40 rounded" />
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-4/5 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatGridSkeleton({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <div className={cx("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5", className)}>
      {Array.from({ length: count }).map((_, i) => <StatCardSkeleton key={i} />)}
    </div>
  );
}

export function PageSkeleton({
  variant = "cards",
  rows = 5,
  cols = 4,
  actions = false,
  className,
}: {
  variant?: "cards" | "table" | "list" | "split" | "dashboard" | "settings" | "wizard" | "detail" | "form";
  rows?: number;
  cols?: number;
  actions?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("mx-auto max-w-[1400px]", className)}>
      <PageHeaderSkeleton actions={actions} />
      {variant === "dashboard" && (
        <>
          <StatGridSkeleton />
          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2"><ChartCardSkeleton /></div>
            <CardListSkeleton rows={4} />
          </div>
        </>
      )}
      {variant === "settings" && <SettingsSkeleton rows={rows} />}
      {variant === "wizard" && <WizardSkeleton />}
      {variant === "detail" && <DetailSkeleton />}
      {variant === "form" && (
        <div className="card border-phantix-700/40 bg-phantix-900/50 p-6"><FormSkeleton fields={rows} /></div>
      )}
      {variant === "split" && <SplitPaneSkeleton rows={rows} />}
      {variant === "table" && <TableCardSkeleton rows={rows} cols={cols} />}
      {variant === "list" && <CardListSkeleton rows={rows} />}
      {variant === "cards" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: Math.min(rows, 6) }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}
    </div>
  );
}

export function ErrorState({
  title,
  body,
  onRetry,
  icon,
  className,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex min-h-[45vh] flex-col items-center justify-center px-6 text-center", className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-severity-critical/30 bg-severity-critical/10 text-severity-critical">
        {icon ?? <WifiOff size={22} />}
      </div>
      <h3 className="font-display text-base font-semibold text-slate-200">{title ?? "Server not responding"}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-slate-400">
        {body ?? "We could not reach the SecureGraph API. Check your connection and try again. Your session stays signed in."}
      </p>
      {onRetry && (
        <button onClick={onRetry} className="btn-primary mt-5 !py-2 text-xs">
          <RefreshCw size={13} className="mr-1.5 inline" /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-phantix-800/70 text-phantix-300 [&_svg]:h-[18px] [&_svg]:w-[18px]">{icon}</div>
      <h3 className="font-display text-base font-semibold text-slate-200">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-slate-400">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: React.ReactNode; count?: number }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1 rounded-md bg-phantix-900/60 border border-phantix-700/40 p-1 w-fit">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={cx("relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", active === t.id ? "text-phantix-950" : "text-slate-400 hover:text-slate-100")}>
          {active === t.id && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-lg bg-gradient-to-b from-gold-400 to-gold-600" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
          <span className="relative flex items-center gap-1.5">
            {t.label}
            {t.count !== undefined && (
              <span className={cx("rounded-full px-1.5 py-0.5 text-[12px] font-bold", active === t.id ? "bg-phantix-950/20 text-phantix-950" : "bg-phantix-700/60 text-slate-300")}>{t.count}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  itemLabel = "entries",
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  return (
    <div className={cx("mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-phantix-700/40 bg-phantix-900/40 px-3 py-2", className)}>
      <p className="text-[13px] text-slate-500">
        {total === 0 ? `0 ${itemLabel}` : `Showing ${from}\u2013${to} of ${total.toLocaleString()} ${itemLabel}`}
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" disabled={current <= 1} onClick={() => onPageChange(Math.max(1, current - 1))} className="btn-ghost !px-2.5 !py-1 !text-[13px] disabled:opacity-40">Prev</button>
        <span className="tabular-nums text-[13px] text-slate-400">Page {current} / {totalPages}</span>
        <button type="button" disabled={current >= totalPages} onClick={() => onPageChange(Math.min(totalPages, current + 1))} className="btn-ghost !px-2.5 !py-1 !text-[13px] disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

export function ProgressBar({ value, color = "#E8B54D" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-phantix-700/50">
      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.max(0, value))}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} className="h-full rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}66` }} />
    </div>
  );
}

export function ProgressRing({ value, size = 80, stroke = 6 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value >= 70 ? "#38BDF8" : value >= 40 ? "#FACC15" : "#F43F5E";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(30, 51, 115, 0.5)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
      </svg>
      <span className="absolute font-display text-lg font-bold text-white">{Math.round(value)}</span>
    </div>
  );
}

export function CopyChip({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="group inline-flex items-center gap-2 rounded-lg border border-phantix-700/50 bg-phantix-950/60 px-3 py-1.5 font-mono text-xs text-slate-300 transition-colors hover:border-gold-400/40 hover:text-gold-300"
      title="Copy"
    >
      {label && <span className="font-sans text-[12px] uppercase tracking-wider text-slate-500">{label}</span>}
      {value}
      <span className="text-[12px] text-slate-600 group-hover:text-gold-400">{copied ? "✓ copied" : "copy"}</span>
    </button>
  );
}

// ── Collapsible ─────────────────────────────────────────────────────────────
// Smooth height-animated disclosure built on the `.wb-collapse` grid-rows
// technique. Accessible via a real <button> trigger with aria-expanded.
export function Collapsible({
  title,
  children,
  defaultOpen = true,
  open,
  onOpenChange,
  right,
  className,
  bodyClassName,
  dense = false,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  right?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  dense?: boolean;
}) {
  const [internal, setInternal] = useState(defaultOpen);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : internal;
  const toggle = () => {
    if (controlled) onOpenChange?.(!isOpen);
    else setInternal((v) => !v);
  };
  return (
    <div className={cx("min-w-0", className)}>
      <div className={cx("flex items-center gap-2", dense ? "py-0.5" : "py-1")}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          className="group flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none"
        >
          <ChevronDown
            size={dense ? 12 : 14}
            className={cx(
              "shrink-0 text-slate-500 transition-transform duration-200 group-hover:text-gold-300",
              !isOpen && "-rotate-90",
            )}
          />
          <span className="min-w-0 truncate">{title}</span>
        </button>
        {right && <div className="ml-auto flex shrink-0 items-center gap-1.5">{right}</div>}
      </div>
      <div className={cx("wb-collapse", isOpen && "open")}>
        <div className={cx("wb-collapse-inner", bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}

// ── Menu (dropdown) ─────────────────────────────────────────────────────────
// A lightweight popover menu with Escape / outside-click dismissal, designed
// for compact workbench toolbars and pane headers.
export function Menu({
  trigger,
  children,
  align = "right",
  className,
  menuClassName,
  disabled,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: "left" | "right";
  className?: string;
  menuClassName?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className={cx("relative inline-block", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cx("inline-flex outline-none", disabled && "pointer-events-none opacity-50")}
      >
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            role="menu"
            className={cx(
              "absolute z-[60] mt-1.5 min-w-[180px] overflow-hidden rounded-md border border-phantix-700/50 bg-phantix-900/95 p-1 shadow-card backdrop-blur-xl",
              align === "right" ? "right-0" : "left-0",
              menuClassName,
            )}
          >
            {typeof children === "function" ? children(close) : children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  active,
  danger,
  disabled,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
        danger
          ? "text-severity-critical hover:bg-severity-critical/10"
          : active
            ? "bg-phantix-800 text-gold-200"
            : "text-slate-300 hover:bg-phantix-800/70 hover:text-white",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {icon && <span className="shrink-0 text-slate-500">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold-400" />}
    </button>
  );
}
