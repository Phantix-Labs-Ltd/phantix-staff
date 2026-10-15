import React, { useState, useEffect } from "react";
import { FileText, RefreshCw, Wifi, WifiOff, Search, Filter, ChevronDown, ChevronRight, Bug, AlertTriangle, Info, AlertCircle, Clock, Activity, FileJson2 } from "lucide-react";
import { PageHeader, Card, CardHeader, StatCard, AnimatedNumber, TableSkeleton, EmptyState, SeverityBadge, Pagination } from "@/components/ui";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE, tokens, API_BASE } from "@/lib/api";
import { timeAgo, cx } from "@/lib/utils";

type SuperLog = { id: number; organizationId: number | null; issueId: string | null; correlationId: string | null; level: string; logType: string; engine: string | null; category: string | null; message: string; createdAt: string; source: string; context?: Record<string, unknown> | null };

const demoLogs: SuperLog[] = [
  { id: 1, organizationId: 11, issueId: "ISS-11-A223C840", correlationId: null, level: "error", logType: "scan", engine: "scanner_engine", category: "job", message: "Scan job #18 failed --- tool timeout after 600s", context: { job_id: 18, status: "failed", tools: ["nmap"], errors: ["tool timeout after 600s"] }, createdAt: new Date(Date.now() - 600000).toISOString(), source: "platform" },
  { id: 2, organizationId: 24, issueId: "ISS-24-9C1BDC36", correlationId: "67cdffc7dbeb4ed19b7bf55b84fc51a0", level: "warning", logType: "scan", engine: "scanner_engine", category: "job", message: "Scan job #6 finished with warnings --- 3 hosts unreachable", context: { job_id: 6, status: "completed", results_written: 18, errors: ["3 hosts unreachable"] }, createdAt: new Date(Date.now() - 1200000).toISOString(), source: "platform" },
  { id: 3, organizationId: null, issueId: null, correlationId: null, level: "info", logType: "http", engine: null, category: "access", message: "GET /api/v1/admin/dashboard/stats 200 42ms (staff=admin@example.com)", context: { method: "GET", path: "/api/v1/admin/dashboard/stats", status: 200 }, createdAt: new Date(Date.now() - 300000).toISOString(), source: "platform" },
  { id: 4, organizationId: 11, issueId: "ISS-11-DD8145A4", correlationId: "973e0b40f4e94c52ba06963664d4e79b", level: "critical", logType: "security", engine: "compliance_engine", category: "bootstrap", message: "Security DB schema bootstrap failed --- asyncpg driver error", context: { error: "asyncpg driver error", schema: "security" }, createdAt: new Date(Date.now() - 3600000).toISOString(), source: "platform" },
  { id: 5, organizationId: 21, issueId: "ISS-21-CA48523F", correlationId: null, level: "info", logType: "app", engine: "ai_engine", category: "prompt", message: "AI finding_explanation v2 activated for org #21", context: { engine: "ai_engine", version: "v2" }, createdAt: new Date(Date.now() - 7200000).toISOString(), source: "platform" },
];

const logTypeBadge = (t: string) => {
  const known: Record<string, string> = {
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
  return known[t] ?? "text-slate-400 bg-slate-400/10 border-slate-500/30";
};

const logTypes = ["app","auth","http","access","audit","bus","ai","security","system","dual_control","scan","alert","report","api","exception","crash","lifecycle","worker","session"];
const levels = ["debug","info","warning","error","critical"];

/** ``datetime-local`` string in the browser's timezone (backend wants ISO-8601). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const QUICK_RANGES: Array<[string, number | null]> = [
  ["1h", 1],
  ["24h", 24],
  ["7d", 24 * 7],
  ["30d", 24 * 30],
  ["All", null],
];

/** Rows per page — keeps the log table to a single screen instead of endless scroll. */
const PAGE_SIZE = 100;

export default function SuperLogs() {
  const { toast } = useStore();
  const [logTypeFilter, setLogTypeFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [fromTs, setFromTs] = useState("");
  const [toTs, setToTs] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveEvents, setLiveEvents] = useState<SuperLog[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const logs = useResource<{ items: SuperLog[]; total: number }>(
    async (signal) => {
      if (DEMO_MODE) return { items: demoLogs, total: demoLogs.length };
      const params: Record<string, string | number | boolean> = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
      if (logTypeFilter) params.log_type = logTypeFilter;
      if (levelFilter) params.level = levelFilter;
      if (orgFilter) params.organization_id = Number(orgFilter);
      if (fromTs) params.since = new Date(fromTs).toISOString();
      if (toTs) params.until = new Date(toTs).toISOString();
      return api.get<{ items: SuperLog[]; total: number }>("/admin/super/logs", { params });
    },
    {} as any,
  );

  const items = page === 1 && liveEvents.length > 0
    ? [...liveEvents, ...(logs.data?.items || [])].slice(0, PAGE_SIZE)
    : (logs.data?.items || []);

  // Any filter change returns to the first page.
  useEffect(() => {
    setPage(1);
  }, [logTypeFilter, levelFilter, orgFilter, fromTs, toTs]);

  // Refetch the REST page when a filter or the page changes (skip the mount
  // run — useResource already fetched).
  const didMount = React.useRef(false);
  const queryKey = JSON.stringify([logTypeFilter, levelFilter, orgFilter, fromTs, toTs, page]);
  useEffect(() => {
    if (DEMO_MODE) return;
    if (!didMount.current) { didMount.current = true; return; }
    const t = window.setTimeout(() => logs.refresh(), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  // SSE stream for tail (auto-reconnect with backoff)
  useEffect(() => {
    if (DEMO_MODE) { setLiveConnected(true); return; }
    const controller = new AbortController();
    let cancelled = false;
    let retryTimer: number | null = null;
    let delay = 1500;

    const connect = async () => {
      if (cancelled) return;
      try {
        const params: Record<string, string> = { poll_seconds: "5" };
        if (levelFilter) params.level = levelFilter;
        if (logTypeFilter) params.log_type = logTypeFilter;
        if (orgFilter) params.organization_id = orgFilter;
        const qs = new URLSearchParams(params).toString();
        const url = `${API_BASE}/admin/super/logs/stream?${qs}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${tokens.staff}`, Accept: "text/event-stream" }, signal: controller.signal });
        if (!res.ok || !res.body) {
          if (!cancelled) setLiveConnected(false);
          scheduleReconnect();
          return;
        }
        setLiveConnected(true);
        delay = 1500;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const chunks = buf.split("\n\n");
          buf = chunks.pop() || "";
          for (const chunk of chunks) {
            const lines = chunk.split("\n");
            let dataStr = "";
            for (const line of lines) {
              if (line.startsWith("data:")) dataStr += line.slice(5).trim();
            }
            if (!dataStr) continue;
            try {
              const evt = JSON.parse(dataStr);
              if (Array.isArray(evt.items)) setLiveEvents((prev) => [...evt.items, ...prev].slice(0, 50));
            } catch { /* ignore */ }
          }
        }
      } catch {
        if (!cancelled) {
          setLiveConnected(false);
          scheduleReconnect();
        }
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      retryTimer = window.setTimeout(() => {
        delay = Math.min(delay * 2, 30000);
        void connect();
      }, delay);
    };

    void connect();
    return () => {
      cancelled = true;
      controller.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
      setLiveConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelFilter, logTypeFilter, orgFilter]);

  return (
    <div>
      <PageHeader
        title="Centralized Logs"
        description="All-tenant application logs with SSE live tail --- scan jobs, auth, HTTP, security events"
        actions={
          <div className="flex items-center gap-2">
            <span className={cx("flex items-center gap-1.5 text-xs font-mono", liveConnected ? "text-emerald-400" : "text-slate-500")}>
              {liveConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {liveConnected ? "SSE Live" : "Polling"}
            </span>
            <button onClick={() => logs.refresh()} className="btn-ghost text-sm px-3 py-1.5">
              <RefreshCw size={14} className={logs.loading ? "animate-spin" : ""} />
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select className="input w-auto py-1.5 text-xs" value={levelFilter} onChange={e => setLevelFilter(e.target.value)}>
          <option value="">All Levels</option>
          {levels.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select className="input w-auto py-1.5 text-xs" value={logTypeFilter} onChange={e => setLogTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {logTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="input w-24 py-1.5 text-xs" placeholder="Org ID" value={orgFilter} onChange={e => setOrgFilter(e.target.value)} type="number" />
        {/* Phones: the range takes its own row and each end shares it evenly. */}
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <input
            type="datetime-local"
            className="input min-w-0 flex-1 py-1.5 text-xs sm:w-auto sm:flex-none"
            value={fromTs}
            max={toTs || undefined}
            onChange={e => setFromTs(e.target.value)}
            title="From (inclusive)"
          />
          <span className="text-xs text-slate-600">→</span>
          <input
            type="datetime-local"
            className="input min-w-0 flex-1 py-1.5 text-xs sm:w-auto sm:flex-none"
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
              onClick={() => {
                if (hours === null) {
                  setFromTs("");
                  setToTs("");
                  return;
                }
                const now = new Date();
                setFromTs(toLocalInput(new Date(now.getTime() - hours * 3600_000)));
                setToTs(toLocalInput(now));
              }}
              className="rounded-lg border border-phantix-700/50 bg-phantix-950/50 px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-phantix-800/60 hover:text-slate-200"
              title={hours === null ? "No date limit" : `Last ${label}`}
            >
              {label}
            </button>
          ))}
        </div>
        {logs.data?.total !== undefined && (
          <span className="text-xs text-slate-500 ml-2">{logs.data.total} entries</span>
        )}
      </div>

      <Card>
        {logs.loading && !logs.data ? (
          <div className="p-4"><TableSkeleton rows={6} /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Bug size={24} />} title="No logs" body="No entries match current filters" />
        ) : (
          <div className={cx("overflow-x-auto transition-opacity", logs.loading && "opacity-50")}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-phantix-700/40">
                  <th className="th w-8" />
                  <th className="th w-16">Level</th>
                  <th className="th w-24">Type</th>
                  <th className="th">Message</th>
                  <th className="th w-16">Org</th>
                  <th className="th w-12">Engine</th>
                  <th className="th w-32">Time</th>
                </tr>
              </thead>
              <tbody>
                {items.map((log) => {
                  const levelColor = log.level === "error" || log.level === "critical" ? "text-severity-critical bg-severity-critical/10 border-severity-critical/30"
                    : log.level === "warning" ? "text-severity-medium bg-severity-medium/10 border-severity-medium/30"
                    : "text-phantix-300 bg-phantix-500/10 border-phantix-500/20";
                  const LevelIcon = log.level === "error" || log.level === "critical" ? AlertCircle : log.level === "warning" ? AlertTriangle : Info;
                  const expanded = expandedId === log.id;
                  const hasContext = !!log.context && Object.keys(log.context).length > 0;
                  return (
                    <React.Fragment key={log.id}>
                      <tr className={cx("border-b border-phantix-700/20 hover:bg-phantix-800/40", log.level === "critical" && "bg-severity-critical/5", expanded && "bg-phantix-800/40")} onClick={() => setExpandedId(expanded ? null : log.id)}>
                        <td className="td cursor-pointer">
                          {hasContext
                            ? (expanded ? <ChevronDown size={13} className="text-gold-400" /> : <ChevronRight size={13} className="text-slate-500" />)
                            : null}
                        </td>
                        <td className="td">
                          <span className={cx("chip text-[12px] capitalize", levelColor)}>
                            <LevelIcon size={10} /> {log.level}
                          </span>
                        </td>
                        <td className="td">
                          <span className={cx("chip text-[12px]", logTypeBadge(log.logType))}>{log.logType}</span>
                        </td>
                        <td className="td">
                          <p className="max-w-[40rem] truncate text-sm text-slate-200" title={log.message}>
                            {log.message}
                            {log.issueId && <span className="ml-2 font-mono text-[12px] text-slate-500">{log.issueId}</span>}
                          </p>
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
                        <td className="td">
                          {log.organizationId ? <span className="text-xs font-mono text-slate-400">#{log.organizationId}</span> : <span className="text-xs text-slate-600">---</span>}
                        </td>
                        <td className="td"><span className="text-[12px] text-slate-500">{log.engine || "---"}</span></td>
                        <td className="td text-xs text-slate-500 whitespace-nowrap">{timeAgo(log.createdAt)}</td>
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
    </div>
  );
}
