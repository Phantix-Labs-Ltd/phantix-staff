import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Bug, CircleDot, Filter, Lightbulb, MessageSquareWarning,
  RefreshCw, Save, Search, Send,
} from "lucide-react";
import {
  Card, EmptyState, ErrorState, Modal, PageHeader, SeverityBadge,
  TableSkeleton,
} from "@/components/ui";
import {
  FEEDBACK_CATEGORIES, FEEDBACK_SEVERITIES, FEEDBACK_STATUSES,
  listFeedback, updateFeedback,
  type FeedbackItem, type FeedbackSummary,
} from "@/lib/feedback";
import { SERVICE_GROUPS, serviceLabel } from "@/lib/health";
import { useStore } from "@/lib/store";
import { cx, formatDateTime, timeAgo, titleCase } from "@/lib/utils";

// ── Feedback inbox ───────────────────────────────────────────────────────────
// Every backend service exposes POST {prefix}/feedback, so a bug, a missing
// feature or a crash can be reported from the surface where it happened. This
// page is the other end: one queue for the whole backend, grouped by service.
// Data: GET /api/v1/admin/feedback (+ /summary), PATCH /api/v1/admin/feedback/{id}.

const CATEGORY_TONE: Record<string, string> = {
  bug: "text-severity-critical bg-severity-critical/10 border-severity-critical/30",
  error: "text-severity-high bg-severity-high/10 border-severity-high/30",
  missing_feature: "text-gold-300 bg-gold-400/10 border-gold-400/30",
  other: "text-slate-400 bg-slate-400/10 border-slate-500/30",
};

const STATUS_TONE: Record<string, string> = {
  new: "text-gold-300 bg-gold-400/10 border-gold-400/30",
  triaged: "text-sky-300 bg-sky-400/10 border-sky-400/30",
  planned: "text-violet-300 bg-violet-400/10 border-violet-400/30",
  in_progress: "text-severity-low bg-severity-low/10 border-severity-low/30",
  resolved: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  wont_fix: "text-slate-400 bg-slate-400/10 border-slate-500/30",
  duplicate: "text-slate-400 bg-slate-400/10 border-slate-500/30",
};

function CategoryPill({ category }: { category: string }) {
  return (
    <span className={cx("chip capitalize", CATEGORY_TONE[category] ?? CATEGORY_TONE.other)}>
      {titleCase(category)}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cx("chip capitalize", STATUS_TONE[status] ?? STATUS_TONE.new)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {titleCase(status)}
    </span>
  );
}

/** Every deployable service the platform knows about, for the filter menu. */
const KNOWN_SERVICES: string[] = Array.from(
  new Set([
    ...SERVICE_GROUPS.flatMap((g) => g.services),
    "api",
    "platform_database",
    "redis",
  ]),
).sort();

const EMPTY_SUMMARY: FeedbackSummary = {
  total: 0,
  open: 0,
  by_status: {},
  by_category: {},
  by_service: {},
};

export default function Feedback() {
  const { toast } = useStore();
  const [rows, setRows] = useState<FeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<FeedbackSummary>(EMPTY_SUMMARY);
  const [service, setService] = useState("all");
  const [status, setStatus] = useState("open");
  const [category, setCategory] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listFeedback({ service, status, category, severity, search, limit: 200 });
      setRows(res.items);
      setTotal(res.total);
      setSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load feedback.");
    } finally {
      setLoading(false);
    }
  }, [service, status, category, severity, search]);

  // Debounce typing so the search does not fire a request per keystroke.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      void load();
      return;
    }
    const t = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(t);
  }, [load]);

  const serviceOptions = useMemo(() => {
    const present = Object.keys(summary.by_service);
    return Array.from(new Set([...present, ...KNOWN_SERVICES])).sort();
  }, [summary.by_service]);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const applyRow = useCallback((next: FeedbackItem) => {
    setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)));
  }, []);

  const activeFilters =
    service !== "all" || status !== "open" || category !== "all" || severity !== "all" || !!search.trim();

  const pageCategories = FEEDBACK_CATEGORIES.map((c) => ({
    key: c,
    label: titleCase(c),
    count: summary.by_category[c] ?? 0,
    icon:
      c === "bug" ? <Bug size={13} /> : c === "missing_feature" ? <Lightbulb size={13} /> : c === "error" ? <AlertTriangle size={13} /> : <CircleDot size={13} />,
  }));

  return (
    <div>
      <PageHeader
        title="Feedback"
        description="Bugs, failures and feature requests reported from every backend service — triaged in one place."
        actions={
          <button onClick={() => void load()} className="btn-ghost px-3 py-1.5 text-sm" title="Refresh">
            <RefreshCw size={14} className={cx(loading && "animate-spin")} />
          </button>
        }
      />

      {/* Summary strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryTile label="Total" value={summary.total} />
        <SummaryTile label="Open" value={summary.open} tone="text-gold-300" />
        <SummaryTile label="Resolved" value={summary.by_status.resolved ?? 0} tone="text-emerald-400" />
        {pageCategories.map((c) => (
          <SummaryTile key={c.key} label={c.label} value={c.count} icon={c.icon} />
        ))}
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-phantix-700/40 p-3">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search message, service, reporter"
              className="input w-64 !py-1.5 !pl-8 !text-xs"
              aria-label="Search feedback"
            />
          </div>

          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="input !w-auto !py-1.5 !text-xs"
            aria-label="Filter by service"
          >
            <option value="all">Any service</option>
            {serviceOptions.map((s) => (
              <option key={s} value={s}>
                {serviceLabel(s)} ({summary.by_service[s] ?? 0})
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="input !w-auto !py-1.5 !text-xs"
            aria-label="Filter by status"
          >
            <option value="all">Any status</option>
            <option value="open">Open (needs attention)</option>
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)} ({summary.by_status[s] ?? 0})
              </option>
            ))}
          </select>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input !w-auto !py-1.5 !text-xs"
            aria-label="Filter by category"
          >
            <option value="all">Any category</option>
            {FEEDBACK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {titleCase(c)} ({summary.by_category[c] ?? 0})
              </option>
            ))}
          </select>

          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="input !w-auto !py-1.5 !text-xs"
            aria-label="Filter by severity"
          >
            <option value="all">Any severity</option>
            {FEEDBACK_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>

          {activeFilters && (
            <button
              className="chip border-phantix-700/50 text-slate-400 hover:text-slate-200"
              onClick={() => {
                setService("all");
                setStatus("all");
                setCategory("all");
                setSeverity("all");
                setSearch("");
              }}
            >
              <Filter size={12} className="mr-1 inline" /> Clear
            </button>
          )}

          <p className="ml-auto text-[13px] text-slate-400">
            <span className="font-mono text-slate-200">{total.toLocaleString()}</span> reports
          </p>
        </div>

        {loading && rows.length === 0 ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={5} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState body={error} onRetry={() => void load()} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<MessageSquareWarning size={22} />}
              title={activeFilters ? "No feedback matches these filters" : "No feedback yet"}
              body={
                activeFilters
                  ? "Try widening the filters — reports arrive from every service as they happen."
                  : "When a service fails or an operator asks for something missing, it lands here."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-phantix-700/40 text-left text-[13px] text-slate-300">
                  <th className="th">When</th>
                  <th className="th">Service</th>
                  <th className="th">Category</th>
                  <th className="th">Severity</th>
                  <th className="th">Message</th>
                  <th className="th">Reported by</th>
                  <th className="th">Status</th>
                  <th className="th w-16 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="h-11 cursor-pointer border-b border-phantix-800/40 transition-colors hover:bg-phantix-800/35"
                  >
                    <td className="td whitespace-nowrap text-[13px] text-slate-400" title={formatDateTime(r.created_at)}>
                      {timeAgo(r.created_at)}
                    </td>
                    <td className="td whitespace-nowrap">
                      <span className="chip border-phantix-600/50 bg-phantix-800/60 text-slate-300">{serviceLabel(r.service)}</span>
                    </td>
                    <td className="td"><CategoryPill category={r.category} /></td>
                    <td className="td"><SeverityBadge severity={r.severity} /></td>
                    <td className="td max-w-[28rem]">
                      <span className="block truncate text-slate-200" title={r.message}>{r.message}</span>
                    </td>
                    <td className="td whitespace-nowrap text-[13px] text-slate-400">
                      {r.submitter_role && <span className="mr-1.5 text-slate-500 capitalize">{r.submitter_role}</span>}
                      {r.submitted_by || "—"}
                      {r.organization_name && <span className="ml-1.5 text-slate-500">· {r.organization_name}</span>}
                    </td>
                    <td className="td"><StatusPill status={r.status} /></td>
                    <td className="td text-right">
                      <button
                        className="rounded px-2 py-0 text-[13px] font-medium text-slate-300 hover:bg-phantix-800 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(r.id);
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <FeedbackDetail
        item={selected}
        onClose={() => setSelectedId(null)}
        onSaved={(next) => {
          applyRow(next);
          toast("success", "Feedback updated", `${serviceLabel(next.service)} · ${titleCase(next.status)}`);
        }}
      />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-phantix-700/40 bg-phantix-900/40 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </p>
      <p className={cx("mt-1 font-mono text-xl", tone ?? "text-slate-100")}>{value}</p>
    </div>
  );
}

/** Detail + triage. Kept separate so the list does not re-render on each edit. */
function FeedbackDetail({
  item,
  onClose,
  onSaved,
}: {
  item: FeedbackItem | null;
  onClose: () => void;
  onSaved: (next: FeedbackItem) => void;
}) {
  const { toast } = useStore();
  const [status, setStatus] = useState("new");
  const [severity, setSeverity] = useState("medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setStatus(item.status);
    setSeverity(item.severity);
    setAssignedTo(item.assigned_to ?? "");
    setAdminNotes(item.admin_notes ?? "");
    setResolutionNote(item.resolution_note ?? "");
  }, [item?.id]);

  if (!item) return null;

  const contextEntries = Object.entries(item.context ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== "",
  );

  const save = async () => {
    setSaving(true);
    try {
      const next = await updateFeedback(item.id, {
        status,
        severity,
        assigned_to: assignedTo,
        admin_notes: adminNotes,
        resolution_note: resolutionNote,
      });
      onSaved(next);
    } catch (e) {
      toast("error", "Could not update feedback", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!item} onClose={onClose} title={`Feedback #${item.id}`} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip border-phantix-600/50 bg-phantix-800/60 text-slate-300">{serviceLabel(item.service)}</span>
          <CategoryPill category={item.category} />
          <SeverityBadge severity={item.severity} />
          <StatusPill status={item.status} />
        </div>

        <div>
          <p className="mb-1 text-[12px] uppercase tracking-wide text-slate-500">Report</p>
          <p className="whitespace-pre-wrap rounded-lg border border-phantix-700/40 bg-phantix-950/40 p-3 text-[13px] leading-6 text-slate-200">
            {item.message}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
          <Meta label="Reported by">
            {item.submitted_by || "Anonymous"}
            {item.submitter_role ? ` (${item.submitter_role})` : ""}
          </Meta>
          <Meta label="Organisation">{item.organization_name || "—"}</Meta>
          <Meta label="First seen">{formatDateTime(item.created_at)}</Meta>
          <Meta label="Last updated">{formatDateTime(item.updated_at)}</Meta>
        </div>

        {contextEntries.length > 0 && (
          <div>
            <p className="mb-1 text-[12px] uppercase tracking-wide text-slate-500">Context</p>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg border border-phantix-700/40 bg-phantix-950/40 p-3 text-[12px] sm:grid-cols-2">
              {contextEntries.map(([k, v]) => (
                <div key={k} className="flex min-w-0 gap-2">
                  <dt className="shrink-0 font-mono text-slate-500">{k}:</dt>
                  <dd className="truncate text-slate-300" title={typeof v === "string" ? v : JSON.stringify(v)}>
                    {typeof v === "string" ? v : JSON.stringify(v)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Triage */}
        <div className="rounded-xl border border-phantix-700/40 bg-phantix-900/40 p-4">
          <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-slate-200">
            <Send size={13} /> Triage
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block text-[12px] text-slate-400">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="input mt-1 !py-1.5 !text-xs">
                {FEEDBACK_STATUSES.map((s) => (
                  <option key={s} value={s}>{titleCase(s)}</option>
                ))}
              </select>
            </label>
            <label className="block text-[12px] text-slate-400">
              Severity
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="input mt-1 !py-1.5 !text-xs">
                {FEEDBACK_SEVERITIES.map((s) => (
                  <option key={s} value={s}>{titleCase(s)}</option>
                ))}
              </select>
            </label>
            <label className="block text-[12px] text-slate-400">
              Assigned to
              <input
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="engineer@phantixlabs.com"
                className="input mt-1 !py-1.5 !text-xs"
              />
            </label>
          </div>
          <label className="mt-3 block text-[12px] text-slate-400">
            Internal notes
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={2}
              className="input mt-1 !py-1.5 !text-xs"
              placeholder="What we found, links to the failing job, owner handoff…"
            />
          </label>
          <label className="mt-3 block text-[12px] text-slate-400">
            Resolution note
            <textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={2}
              className="input mt-1 !py-1.5 !text-xs"
              placeholder="What shipped / why it will not be fixed."
            />
          </label>
          <div className="mt-3 flex justify-end">
            <button className="btn-primary !py-1.5 !text-sm" onClick={() => void save()} disabled={saving}>
              <Save size={13} /> {saving ? "Saving…" : "Save triage"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-slate-500">{label}:</span>
      <span className="truncate text-slate-300">{children}</span>
    </div>
  );
}
