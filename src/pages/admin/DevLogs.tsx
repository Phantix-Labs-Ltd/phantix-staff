import React, { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { RefreshCw, AlertTriangle, Info, AlertCircle, Bug, Plus, ChevronDown, ChevronRight, Search, FileJson2, Eye, EyeOff } from "lucide-react";
import { PageHeader, Card, TableSkeleton, EmptyState, Modal, Pagination } from "@/components/ui";
import { useResource } from "@/lib/useResource";
import { api, DEMO_MODE } from "@/lib/api";
import { useStore } from "@/lib/store";
import { timeAgo, cx } from "@/lib/utils";

type AppLog = {
  id?: number;
  organization_id: number | null;
  issue_id?: string | null;
  correlation_id?: string | null;
  level: string;
  log_type: string;
  engine?: string | null;
  category?: string | null;
  message: string;
  context?: Record<string, unknown> | null;
  actor_type?: string | null;
  actor_id?: string | null;
  request_path?: string | null;
  request_method?: string | null;
  storage_targets?: string | null;
  created_at?: string;
  source: string;
};

// Engine logType catalog (also fetched from GET /admin/logs/types when available).
const DEFAULT_LOG_TYPES = ["api", "scan", "report", "auth", "session", "http", "dual_control", "access", "ai", "alert", "worker", "exception", "crash", "lifecycle", "app", "security", "system", "audit", "bus"];

/** Rows per page — keeps the log table to a single screen instead of endless scroll. */
const PAGE_SIZE = 100;

/** ``datetime-local`` string in the browser's timezone (backend wants ISO-8601). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Quick date/time ranges for the log window. */
const QUICK_RANGES: Array<[string, number | null]> = [
  ["1h", 1],
  ["24h", 24],
  ["7d", 24 * 7],
  ["30d", 24 * 30],
  ["All", null],
];

const LOG_TYPE_LABELS: Record<string, string> = {
  api: "Engine and API integration error, user-facing message normalized",
  scan: "Scanner job or web step",
  report: "Report generate",
  auth: "Login and MFA",
  session: "Session",
  http: "Mutation and operate",
  dual_control: "Dual-control",
  access: "Named GET access",
  ai: "AI engine",
  alert: "Alert delivery",
  worker: "Worker job",
  exception: "Exception",
  crash: "Crash",
  lifecycle: "Lifecycle",
};

const demoLogs: AppLog[] = [
  { id: 1, organization_id: 11, issue_id: "ISS-11-A223C840", correlation_id: null, level: "info", log_type: "scan", engine: "scanner_engine", category: "job", message: "Scan job #18 finished with status=completed", context: { job_id: 18, status: "completed", tools: ["nmap", "nuclei"], results_written: 18, errors: [] }, created_at: new Date(Date.now() - 3600000).toISOString(), source: "platform" },
  { id: 2, organization_id: 11, issue_id: "ISS-11-A6D1EE14", correlation_id: null, level: "error", log_type: "report", engine: "reporting_engine", category: "generate", message: "Report #7 generate failed --- PDF renderer timeout", context: { report_id: 7, formats: ["pdf", "docx"], error: "renderer timeout after 600s" }, created_at: new Date(Date.now() - 7200000).toISOString(), source: "platform" },
  { id: 3, organization_id: 21, issue_id: "ISS-21-9C1BDC36", correlation_id: "67cdffc7dbeb4ed19b7bf55b84fc51a0", level: "warning", log_type: "auth", engine: null, category: "login", message: "MFA retry limit approaching for user@acme.ng", context: { email: "user@acme.ng", attempts: 4, max_attempts: 5 }, created_at: new Date(Date.now() - 86400000).toISOString(), source: "platform" },
  { id: 4, organization_id: null, issue_id: null, correlation_id: null, level: "info", log_type: "http", engine: null, category: "operate", message: "POST /api/v1/reports/tracker/ISS-21-9C1BDC36 200 42ms", context: { method: "POST", path: "/api/v1/reports/tracker/ISS-21-9C1BDC36", status: 200 }, created_at: new Date(Date.now() - 600000).toISOString(), source: "platform" },
];

const demoSummary: Record<string, unknown> = {
  scan: { info: 120, error: 3 },
  report: { info: 14, error: 1 },
  auth: { warning: 2, info: 40 },
  access: { info: 12480 },
};

function logTypeBadge(logType: string): string {
  const known: Record<string, string> = {
    api: "text-orange-300 bg-orange-400/10 border-orange-400/30",
    scan: "text-emerald-300 bg-emerald-400/10 border-emerald-400/30",
    report: "text-blue-300 bg-blue-400/10 border-blue-400/30",
    auth: "text-purple-300 bg-purple-400/10 border-purple-400/30",
    session: "text-purple-300 bg-purple-400/10 border-purple-400/30",
    http: "text-phantix-300 bg-phantix-500/10 border-phantix-500/20",
    dual_control: "text-gold-300 bg-gold-400/10 border-gold-400/30",
    access: "text-slate-500 bg-slate-400/10 border-slate-500/30",
    alert: "text-severity-medium bg-severity-medium/10 border-severity-medium/30",
    ai: "text-cyan-300 bg-cyan-400/10 border-cyan-400/30",
    exception: "text-severity-critical bg-severity-critical/10 border-severity-critical/30",
    crash: "text-severity-critical bg-severity-critical/10 border-severity-critical/30",
  };
  return known[logType] ?? "text-slate-400 bg-slate-400/10 border-slate-500/30";
}

/** Count rows by log_type × level (client-side fallback for the server summary). */
function summarizeLogs(items: AppLog[]): Record<string, Record<string, number>> {
  const summary: Record<string, Record<string, number>> = {};
  for (const log of items) {
    const type = log.log_type || "unknown";
    const level = log.level || "info";
    summary[type] = summary[type] ?? {};
    summary[type][level] = (summary[type][level] ?? 0) + 1;
  }
  return summary;
}

function SummaryStrip({ summary }: { summary?: Record<string, unknown> }) {
  if (!summary || Object.keys(summary).length === 0) return null;
  const chips: Array<[string, string, number]> = [];
  for (const [type, levels] of Object.entries(summary)) {
    if (!levels || typeof levels !== "object") continue;
    for (const [level, count] of Object.entries(levels as Record<string, unknown>)) {
      const n = Number(count);
      if (Number.isFinite(n) && n > 0) chips.push([type, level, n]);
    }
  }
  if (chips.length === 0) return null;
  const top = chips.sort((a, b) => b[2] - a[2]).slice(0, 12);
  return (
    <div className="mb-3 flex flex-wrap gap-1.5 text-[12px]">
      <span className="text-slate-500 uppercase tracking-wider font-semibold self-center">Summary:</span>
      {top.map(([type, level, count], i) => (
        <span key={`${type}-${level}`} className={cx("chip", level === "error" || level === "critical" ? "border-severity-critical/40 bg-severity-critical/10 text-severity-critical" : level === "warning" ? "border-severity-medium/40 bg-severity-medium/10 text-severity-medium" : "border-phantix-600/50 bg-phantix-800/50 text-slate-300")}>
          <span className="font-mono">{type}</span>/{level}: <strong>{count}</strong>
        </span>
      ))}
    </div>
  );
}

export default function DevLogs() {
  const { toast } = useStore();
  const { issueId } = useParams();
  const [searchParams] = useSearchParams();
  const [showWriteLog, setShowWriteLog] = useState(false);
  const [logForm, setLogForm] = useState({ level: "info", log_type: "security", engine: "operations_engine", category: "support_note", message: "", organization_id: "" });
  const [logTypeFilter, setLogTypeFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [engineFilter, setEngineFilter] = useState("");
  const [q, setQ] = useState("");
  const [showAccess, setShowAccess] = useState(false);
  const [fromTs, setFromTs] = useState("");
  const [toTs, setToTs] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [logTypes, setLogTypes] = useState<string[]>(DEFAULT_LOG_TYPES);
  const [expandedId, setExpandedId] = useState<number | string | null>(null);
  const [page, setPage] = useState(1);
  const [issueTimeline, setIssueTimeline] = useState<AppLog[] | null>(null);

  // Log type catalog from the API (support+), fallback to the static catalog.
  useEffect(() => {
    if (DEMO_MODE) return;
    api.get<any>("/admin/logs/types").then((r) => {
      const types = Array.isArray(r) ? r : r?.types ?? r?.items ?? r?.log_types ?? [];
      if (Array.isArray(types) && types.length > 0) {
        const clean = types.map((t: unknown) => String(t)).filter(Boolean);
        if (clean.length) setLogTypes(Array.from(new Set([...clean, ...DEFAULT_LOG_TYPES])));
      }
    }).catch(() => { /* catalog optional */ });
  }, []);

  const logs = useResource<{ items: AppLog[]; total: number; summary?: Record<string, unknown> }>(
    async () => {
      if (DEMO_MODE) return { items: demoLogs, total: demoLogs.length, summary: demoSummary };
      // The backend summary aggregation (include_summary=true) currently
      // returns 500, so we ask for rows only and build the type×level strip
      // client-side below. Once that endpoint is fixed this can go back to true.
      const params: Record<string, string | number | boolean> = {
        include_summary: false,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        // Poll every log type. The backend still hides noisy access GET polls
        // unless the toggle asks for the full set.
        all_types: showAccess,
      };
      if (logTypeFilter) params.log_type = logTypeFilter;
      if (levelFilter) params.level = levelFilter;
      if (orgFilter) params.organization_id = Number(orgFilter);
      if (engineFilter) params.engine = engineFilter;
      if (q.trim()) params.q = q.trim();
      if (fromTs) params.since = new Date(fromTs).toISOString();
      if (toTs) params.until = new Date(toTs).toISOString();
      return api.get<{ items: AppLog[]; total: number; summary?: Record<string, unknown> }>("/admin/logs", { params });
    },
    { items: [], total: 0, summary: undefined } as any,
    "staff-application-logs",
  );

  // Any filter change returns to the first page.
  useEffect(() => {
    setPage(1);
  }, [logTypeFilter, levelFilter, orgFilter, engineFilter, q, showAccess, fromTs, toTs]);

  // Refetch from the API (server-side filters + paging) when a filter or the
  // page changes. Skip the mount run — useResource already fetched.
  const didMount = React.useRef(false);
  const queryKey = JSON.stringify([logTypeFilter, levelFilter, orgFilter, engineFilter, q, showAccess, fromTs, toTs, page]);
  useEffect(() => {
    if (DEMO_MODE) return;
    if (!didMount.current) { didMount.current = true; return; }
    const t = window.setTimeout(() => logs.refresh(), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  // Optional live tail: re-poll the current window every 20s.
  useEffect(() => {
    if (!autoRefresh || DEMO_MODE) return;
    const t = window.setInterval(() => logs.refresh(), 20000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  const applyRange = (hours: number | null) => {
    if (hours === null) {
      setFromTs("");
      setToTs("");
      return;
    }
    const now = new Date();
    setFromTs(toLocalInput(new Date(now.getTime() - hours * 3600_000)));
    setToTs(toLocalInput(now));
  };

  const openIssue = async (issue: string) => {
    try {
      const orgQ = orgFilter ? `?organization_id=${orgFilter}` : searchParams.get("organization_id") ? `?organization_id=${searchParams.get("organization_id")}` : "";
      const raw = await api.get<any>(`/admin/logs/issues/${issue}${orgQ}`);
      const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
      setIssueTimeline(items as AppLog[]);
    } catch (e) {
      toast("error", "Issue timeline failed", e instanceof Error ? e.message : "");
    }
  };

  // Deep-link by issue_id: /logs/issues/:issueId?organization_id=
  useEffect(() => {
    if (!issueId) return;
    void openIssue(issueId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId]);

  const data = DEMO_MODE ? demoLogs : (logs.data?.items || []);

  // Prefer a server summary when one is present; otherwise derive it from the
  // rows so the summary strip keeps working without the failing aggregation.
  const clientSummary = React.useMemo(() => summarizeLogs(data), [data]);

  const filtered = data.filter((log: AppLog) => {
    if (logTypeFilter && log.log_type !== logTypeFilter) return false;
    if (levelFilter && log.level !== levelFilter) return false;
    if (orgFilter && String(log.organization_id ?? "") !== String(orgFilter)) return false;
    if (engineFilter && !String(log.engine ?? "").toLowerCase().includes(engineFilter.toLowerCase())) return false;
    if (q.trim()) {
      const hay = `${log.message} ${log.log_type} ${log.engine ?? ""} ${log.category ?? ""} ${log.issue_id ?? ""}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  const levelColor = (level: string) =>
    level === "error" || level === "critical" ? "text-severity-critical bg-severity-critical/10 border-severity-critical/30"
      : level === "warning" ? "text-severity-medium bg-severity-medium/10 border-severity-medium/30"
      : "text-phantix-300 bg-phantix-500/10 border-phantix-500/20";

  return (
    <div>
      <PageHeader
        title="Application Logs"
        description="Platform-wide diagnostics --- scans, reports, auth, mutations. Access GET polls are hidden by default."
        actions={
          <>
            <button onClick={() => setShowWriteLog(true)} className="btn-secondary text-sm px-3 py-1.5"><Plus size={14} /> Write Note</button>
            <button onClick={() => logs.refresh()} className="btn-ghost text-sm px-3 py-1.5">
              <RefreshCw size={14} className={logs.loading ? "animate-spin" : ""} />
            </button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <select className="input w-auto py-1.5 text-xs" value={logTypeFilter} onChange={e => setLogTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {logTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button
          className={cx("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors", logTypeFilter === "api" ? "border-orange-400/40 bg-orange-400/10 text-orange-300" : "border-phantix-700/50 bg-phantix-950/50 text-slate-400 hover:bg-phantix-800/60")}
          onClick={() => setLogTypeFilter(f => (f === "api" ? "" : "api"))}
          title="Engine and API integration errors. These are normalized for users. The full route and upstream detail are here."
        >
          <AlertCircle size={12} /> API errors
        </button>
        <select className="input w-auto py-1.5 text-xs" value={levelFilter} onChange={e => setLevelFilter(e.target.value)}>
          <option value="">All Levels</option>
          {["debug", "info", "warning", "error", "critical"].map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <input className="input w-24 py-1.5 text-xs" placeholder="Org ID" type="number" value={orgFilter} onChange={e => setOrgFilter(e.target.value)} />
        <input className="input w-40 py-1.5 text-xs" placeholder="Engine" value={engineFilter} onChange={e => setEngineFilter(e.target.value)} />
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input w-48 py-1.5 pl-8 text-xs" placeholder="Search message or issue" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="datetime-local"
            className="input w-auto py-1.5 text-xs"
            value={fromTs}
            max={toTs || undefined}
            onChange={e => setFromTs(e.target.value)}
            title="From (inclusive)"
          />
          <span className="text-xs text-slate-600">→</span>
          <input
            type="datetime-local"
            className="input w-auto py-1.5 text-xs"
            value={toTs}
            min={fromTs || undefined}
            onChange={e => setToTs(e.target.value)}
            title="To (inclusive)"
          />
        </div>
        <div className="flex items-center gap-1">
          {QUICK_RANGES.map(([label, hours]) => (
            <button
              key={label}
              onClick={() => applyRange(hours)}
              className="rounded-lg border border-phantix-700/50 bg-phantix-950/50 px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-phantix-800/60 hover:text-slate-200"
              title={hours === null ? "No date limit" : `Last ${label}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className={cx("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors", autoRefresh ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-phantix-700/50 bg-phantix-950/50 text-slate-400 hover:bg-phantix-800/60")}
          onClick={() => setAutoRefresh(v => !v)}
          title="Re-poll the current window every 20s"
        >
          <RefreshCw size={12} className={autoRefresh ? "animate-spin" : ""} /> Live
        </button>
        <button
          className={cx("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors", showAccess ? "border-gold-400/40 bg-gold-400/10 text-gold-300" : "border-phantix-700/50 bg-phantix-950/50 text-slate-400 hover:bg-phantix-800/60")}
          onClick={() => setShowAccess(s => !s)}
          title="Poll every log type (access GET polls included)"
        >
          {showAccess ? <Eye size={12} /> : <EyeOff size={12} />} All log types
        </button>
        {logs.data?.total !== undefined && (
          <span className="text-xs text-slate-500 ml-auto">{logs.data.total} entries</span>
        )}
      </div>

      <SummaryStrip summary={logs.data?.summary ?? clientSummary} />

      {logs.error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-severity-critical/30 bg-severity-critical/10 px-3 py-2 text-xs text-severity-critical">
          <AlertCircle size={13} /> Failed to load logs: {logs.error}
        </div>
      )}

      <Card>
        {logs.loading && !logs.data?.items?.length ? (
          <div className="p-4"><TableSkeleton rows={6} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Bug size={24} />} title="No logs" body="No diagnostic entries match current filters. Access polls are hidden unless toggled." />
        ) : (
          <div className={cx("overflow-x-auto transition-opacity", logs.loading && "opacity-50")}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-phantix-700/40">
                  <th className="th w-8" />
                  <th className="th w-32">Time</th>
                  <th className="th w-24">Log Type</th>
                  <th className="th w-20">Level</th>
                  <th className="th">Message</th>
                  <th className="th w-28">Engine</th>
                  <th className="th w-14">Org</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const id = log.id ?? `${log.issue_id}-${log.created_at ?? ""}`;
                  const expanded = expandedId === id;
                  const hasContext = !!log.context && Object.keys(log.context).length > 0;
                  const LevelIcon = log.level === "error" || log.level === "critical" ? AlertCircle : log.level === "warning" ? AlertTriangle : Info;
                  return (
                    <React.Fragment key={String(id)}>
                      <tr className={cx("border-b border-phantix-700/20 hover:bg-phantix-800/40 cursor-pointer", expanded && "bg-phantix-800/40")} onClick={() => setExpandedId(expanded ? null : (id as any))}>
                        <td className="td">
                          {hasContext
                            ? (expanded ? <ChevronDown size={13} className="text-gold-400" /> : <ChevronRight size={13} className="text-slate-500" />)
                            : null}
                        </td>
                        <td className="td text-xs text-slate-500 whitespace-nowrap">{timeAgo(log.created_at ?? null)}</td>
                        <td className="td">
                          <span className={cx("chip text-[12px]", logTypeBadge(log.log_type))} title={LOG_TYPE_LABELS[log.log_type] ?? log.log_type}>
                            {log.log_type}
                          </span>
                          {log.log_type === "access" && <span className="block text-[11px] text-slate-600">(hidden by default)</span>}
                        </td>
                        <td className="td">
                          <span className={cx("chip text-[12px] capitalize", levelColor(log.level))}>
                            <LevelIcon size={10} /> {log.level}
                          </span>
                        </td>
                        <td className="td">
                          <p className="max-w-[40rem] truncate text-sm text-slate-200" title={log.message}>
                            {log.message}
                            {log.category && <span className="ml-2 text-[12px] text-slate-500">{log.category}</span>}
                          </p>
                          {log.log_type === "api" && (() => {
                            const ctx = (log.context ?? {}) as Record<string, unknown>;
                            const route = String(ctx.route ?? log.request_path ?? "");
                            const method = String(ctx.method ?? log.request_method ?? "");
                            const detail = ctx.upstream_detail != null ? String(ctx.upstream_detail) : "";
                            const tool = ctx.tool != null ? String(ctx.tool) : "";
                            const status = ctx.status_code != null ? String(ctx.status_code) : "";
                            return (
                              <div className="mt-1.5 space-y-1 text-[12px]">
                                {tool && (
                                  <p className="text-slate-500">
                                    tool <span className="font-mono text-slate-300">{tool}</span>
                                    {status && <> · upstream HTTP <span className="font-mono text-slate-300">{status}</span></>}
                                  </p>
                                )}
                                {route && <p className="font-mono text-slate-500">{method ? `${method} ` : ""}{route}</p>}
                                {detail && <p className="overflow-auto rounded bg-phantix-950/70 px-1.5 py-1 font-mono text-slate-400">{detail}</p>}
                              </div>
                            );
                          })()}
                          {log.issue_id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); void openIssue(log.issue_id!); }}
                              className="text-[12px] font-mono text-gold-400/80 hover:text-gold-300"
                              title="Open issue timeline"
                            >
                              {log.issue_id} → timeline
                            </button>
                          )}
                          {expanded && hasContext && (
                            <div className="mt-2">
                              <p className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-slate-500">
                                <FileJson2 size={10} /> Context (structured payload)
                              </p>
                              <pre className="mt-1 overflow-auto rounded-lg border border-phantix-700/40 bg-phantix-950/70 p-2.5 text-[12px] leading-relaxed text-slate-300 max-h-64">
                                {JSON.stringify(log.context, null, 2)}
                              </pre>
                            </div>
                          )}
                        </td>
                        <td className="td text-[12px] text-slate-500">{log.engine || "---"}</td>
                        <td className="td">
                          {log.organization_id ? <span className="text-xs font-mono text-slate-400">#{log.organization_id}</span> : <span className="text-xs text-slate-600">---</span>}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={logs.data?.total ?? 0}
        onPageChange={setPage}
        itemLabel="entries"
      />

      <Modal open={issueTimeline !== null} onClose={() => setIssueTimeline(null)} title="Issue timeline" wide>
        {issueTimeline ? (
          <div className="space-y-2">
            {issueTimeline.length === 0 && <p className="text-sm text-slate-500">No events in this issue thread.</p>}
            {issueTimeline.map((e, i) => (
              <div key={i} className="rounded-lg bg-phantix-950/60 border border-phantix-700/40 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className={cx("chip text-[12px] capitalize", levelColor(e.level))}>{e.level}</span>
                  <span className={cx("chip text-[12px]", logTypeBadge(e.log_type))}>{e.log_type}</span>
                  {e.organization_id != null && <span className="font-mono">#{e.organization_id}</span>}
                  <span className="ml-auto">{timeAgo(e.created_at ?? null)}</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-200">{e.message}</p>
                {e.category && <p className="mt-0.5 text-[12px] text-slate-600">{e.category}</p>}
                {e.context && Object.keys(e.context).length > 0 && (
                  <pre className="mt-1.5 overflow-auto rounded-lg border border-phantix-700/40 bg-phantix-950/70 p-2 text-[12px] text-slate-300 max-h-48">
                    {JSON.stringify(e.context, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Loading...</p>
        )}
      </Modal>

      <Modal open={showWriteLog} onClose={() => setShowWriteLog(false)} title="Write Diagnostic Entry">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Level</label><select className="input" value={logForm.level} onChange={e => setLogForm(l => ({ ...l, level: e.target.value }))}>{["debug", "info", "warning", "error", "critical"].map(lv => <option key={lv}>{lv}</option>)}</select></div>
            <div><label className="label">Log Type</label><select className="input" value={logForm.log_type} onChange={e => setLogForm(l => ({ ...l, log_type: e.target.value }))}>{["app", "auth", "security", "system", "scan", "alert", "report", "api"].map(lt => <option key={lt}>{lt}</option>)}</select></div>
          </div>
          <div><label className="label">Organization ID (optional)</label><input className="input" type="number" value={logForm.organization_id} onChange={e => setLogForm(l => ({ ...l, organization_id: e.target.value }))} /></div>
          <div><label className="label">Message</label><textarea className="input resize-none" rows={3} value={logForm.message} onChange={e => setLogForm(l => ({ ...l, message: e.target.value }))} /></div>
          <button onClick={async () => {
            try {
              const body: any = { message: logForm.message, level: logForm.level, log_type: logForm.log_type, engine: logForm.engine, category: logForm.category };
              const orgId = logForm.organization_id ? `?organization_id=${logForm.organization_id}` : "";
              await api.post(`/admin/logs${orgId}`, body);
              toast("success", "Entry written"); setShowWriteLog(false); logs.refresh();
            } catch (e) { toast("error", e instanceof Error ? e.message : ""); }
          }} className="btn-primary w-full">Write Entry</button>
        </div>
      </Modal>
    </div>
  );
}
