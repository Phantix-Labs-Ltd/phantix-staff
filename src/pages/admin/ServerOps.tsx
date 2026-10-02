import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Cpu, HardDrive, Database, Activity, RefreshCw, Play, Loader2, Server,
  Gauge, Boxes, Layers, Clock, Wifi, WifiOff, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { PageHeader, Card, CardHeader, CollapsibleCard, StatCard, TableSkeleton, StatusBadge, ProgressBar } from "@/components/ui";
import { PrometheusMetrics } from "@/components/PrometheusMetrics";
import { useResource } from "@/lib/useResource";
import { useSmartPoll } from "@/lib/usePolling";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE } from "@/lib/api";
import { cx, timeAgo } from "@/lib/utils";

type ServerOverview = {
  health: string;
  healthScore: number;
  version: string;
  environment: string;
  timestamp: string;
  process: { pid: number; rss_mb: number; cpu_percent: number; threads: number; uptime_seconds: number };
  related_processes: { pid: number; role: string; rss_mb: number; cmdline: string }[];
  resources: {
    cpu_count_logical: number;
    cpu_percent: number;
    load_avg: number[];
    memory: { total_mb: number; used_percent: number; used_mb: number; free_mb: number };
    disk: { used_percent: number; used_gb: number; total_gb: number };
  };
  database_pool: { size: number; checkedin: number; checkedout: number; overflow: number };
  security_db_pools: Record<string, unknown>;
  asyncio: { running_loop: boolean; tasks: number };
  gc: Record<string, unknown>;
  tool_locks: { total: number; active: number; note?: string };
  celery: { available: boolean; worker_count: number; active_tasks: number };
  config_snapshot: Record<string, unknown>;
  recommendations: { severity: string; title: string; detail: string }[];
  optimize_actions: string[];
};

const demoServer: ServerOverview = {
  health: "healthy",
  healthScore: 100,
  version: "4.3.2",
  environment: "staging",
  timestamp: new Date().toISOString(),
  process: { pid: 74368, rss_mb: 313, cpu_percent: 2.1, threads: 42, uptime_seconds: 487200 },
  related_processes: [
    { pid: 74368, role: "api_server", rss_mb: 313, cmdline: "uvicorn app.main:app" },
    { pid: 74371, role: "celery_worker", rss_mb: 59, cmdline: "celery worker -Q scans,vapt,alerts" },
    { pid: 74376, role: "celery_beat", rss_mb: 57, cmdline: "celery beat -S redbeat.RedBeatScheduler" },
  ],
  resources: {
    cpu_count_logical: 8,
    cpu_percent: 12,
    load_avg: [0.4, 0.5, 0.6],
    memory: { total_mb: 11882, used_percent: 18, used_mb: 2139, free_mb: 9743 },
    disk: { used_percent: 5, used_gb: 22, total_gb: 440 },
  },
  database_pool: { size: 30, checkedin: 28, checkedout: 2, overflow: 0 },
  security_db_pools: { ready: true },
  asyncio: { running_loop: true, tasks: 11 },
  gc: { gen0: 120, gen1: 31, gen2: 4 },
  tool_locks: { total: 3, active: 1, note: "redis-backed" },
  celery: { available: true, worker_count: 5, active_tasks: 3 },
  config_snapshot: { db_pool_size: 30, rate_limit_enabled: true },
  recommendations: [{ severity: "info", title: "No critical issues", detail: "Runtime looks healthy." }],
  optimize_actions: ["gc_collect", "dispose_db_pool", "clear_idle_tool_locks", "process_pending_alerts", "all"],
};

const EMPTY: ServerOverview = {
  health: "unknown",
  healthScore: 0,
  version: "",
  environment: "",
  timestamp: "",
  process: { pid: 0, rss_mb: 0, cpu_percent: 0, threads: 0, uptime_seconds: 0 },
  related_processes: [],
  resources: { cpu_count_logical: 0, cpu_percent: 0, load_avg: [], memory: { total_mb: 0, used_percent: 0, used_mb: 0, free_mb: 0 }, disk: { used_percent: 0, used_gb: 0, total_gb: 0 } },
  database_pool: { size: 0, checkedin: 0, checkedout: 0, overflow: 0 },
  security_db_pools: {},
  asyncio: { running_loop: false, tasks: 0 },
  gc: {},
  tool_locks: { total: 0, active: 0 },
  celery: { available: false, worker_count: 0, active_tasks: 0 },
  config_snapshot: {},
  recommendations: [],
  optimize_actions: ["gc_collect", "dispose_db_pool", "clear_idle_tool_locks", "all"],
};

function num(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function str(v: unknown, d = ""): string {
  return v == null ? d : String(v);
}
function obj(v: unknown): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
}
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
/** Backend reports process RSS as rss_mb OR rss_kb — normalize to MB. */
function rssMb(p: Record<string, any>): number {
  if (p.rss_mb != null) return num(p.rss_mb);
  if (p.rss_kb != null) return num(p.rss_kb) / 1024;
  return num(p.rss);
}

function normalize(raw: any): ServerOverview {
  const proc = obj(raw.process);
  const res = obj(raw.resources);
  const mem = obj(res.memory);
  const disk = obj(res.disk);
  const pool = obj(raw.database_pool);
  const celery = obj(raw.celery);
  const locks = obj(raw.tool_locks);
  const asyncInfo = obj(raw.asyncio);
  const healthObj = obj(raw.health);
  const gcObj = obj(raw.gc);
  const gcCounts = obj(gcObj.counts);
  // celery.active_tasks is a worker -> count map; sum for a scalar
  const activeTasks = obj(celery.active_tasks);
  const celeryActive =
    Object.keys(activeTasks).length > 0
      ? Object.values(activeTasks).reduce((s: number, v) => s + num(v), 0)
      : num(celery.active);
  // load_avg may be an array or {1m,5m,15m} object
  let loadAvg: number[] = [];
  if (Array.isArray(res.load_avg)) loadAvg = res.load_avg.map((v: unknown) => num(v));
  else if (res.load_avg && typeof res.load_avg === "object") {
    const la = res.load_avg as Record<string, unknown>;
    loadAvg = [num(la["1m"]), num(la["5m"]), num(la["15m"])].filter((v) => v > 0);
  }
  return {
    health: str(healthObj.label ?? raw.health ?? "unknown"),
    healthScore: num(healthObj.score, num(raw.health_score)),
    version: str(raw.version),
    environment: str(raw.environment),
    timestamp: str(raw.timestamp),
    process: {
      pid: num(proc.pid),
      rss_mb: rssMb(proc),
      cpu_percent: num(proc.cpu_percent ?? proc.cpu ?? 0),
      threads: num(proc.threads ?? proc.thread_count),
      uptime_seconds: num(proc.uptime_seconds ?? proc.uptime),
    },
    related_processes: arr<any>(raw.related_processes ?? raw.processes).map((p) => ({
      pid: num(p.pid),
      role: str(p.role ?? p.name ?? "process"),
      rss_mb: rssMb(p),
      cmdline: str(p.cmdline ?? p.command),
    })),
    resources: {
      cpu_count_logical: num(res.cpu_count_logical ?? res.cpu_count),
      cpu_percent: num(res.cpu_percent ?? res.cpu_usage_percent ?? 0),
      load_avg: loadAvg,
      memory: {
        total_mb: num(mem.total_mb ?? mem.total),
        used_percent: num(mem.used_percent),
        used_mb: num(mem.used_mb ?? mem.used ?? (num(mem.available_mb) && num(mem.total_mb) ? num(mem.total_mb) - num(mem.available_mb) : 0)),
        free_mb: num(mem.free_mb ?? mem.available_mb ?? mem.free),
      },
      disk: {
        used_percent: num(disk.used_percent),
        used_gb: num(disk.used_gb ?? disk.used),
        total_gb: num(disk.total_gb ?? disk.total),
      },
    },
    database_pool: {
      size: num(pool.size),
      checkedin: num(pool.checkedin ?? pool.checked_in),
      checkedout: num(pool.checkedout ?? pool.checked_out),
      overflow: num(pool.overflow ?? pool.max_overflow),
    },
    security_db_pools: raw.security_db_pools ?? {},
    asyncio: { running_loop: Boolean(asyncInfo.running_loop), tasks: num(asyncInfo.tasks) },
    gc: { gen0: num(gcCounts.gen0), gen1: num(gcCounts.gen1), gen2: num(gcCounts.gen2), garbage: num(gcObj.garbage) },
    tool_locks: {
      total: num(locks.total ?? locks.total_locks),
      active: num(locks.active ?? locks.active_locks),
      note: str(locks.note),
    },
    celery: {
      available: Boolean(celery.available),
      worker_count: num(celery.worker_count ?? (Array.isArray(celery.workers) ? celery.workers.length : 0)),
      active_tasks: celeryActive,
    },
    config_snapshot: raw.config_snapshot ?? {},
    recommendations: arr<any>(raw.recommendations).map((r) => ({
      severity: str(r.severity, "info"),
      title: str(r.title ?? r.message),
      detail: str(r.detail ?? r.action ?? r.message),
    })),
    optimize_actions: arr<string>(raw.optimize_actions).length
      ? arr<string>(raw.optimize_actions)
      : ["gc_collect", "dispose_db_pool", "clear_idle_tool_locks", "all"],
  };
}

function formatUptime(sec: number): string {
  if (!sec || sec < 0) return "Not set";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(sec % 60)}s`;
}

const sevClass: Record<string, string> = {
  info: "text-phantix-300 border-phantix-500/30 bg-phantix-500/10",
  low: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  warning: "text-severity-medium border-severity-medium/30 bg-severity-medium/10",
  high: "text-severity-high border-severity-high/30 bg-severity-high/10",
  critical: "text-severity-critical border-severity-critical/30 bg-severity-critical/10",
};

type HealthTone = "healthy" | "warning" | "critical";

function healthTone(label: string, score: number): HealthTone {
  const value = label.toLowerCase().replace(/[_-]/g, " ");
  if (/critical|failed|down|unhealthy|offline|error/.test(value) || score < 50) return "critical";
  if (/warning|degraded|elevated|attention|unknown/.test(value) || score < 85) return "warning";
  return "healthy";
}

const healthToneClass: Record<HealthTone, string> = {
  healthy: "text-emerald-400",
  warning: "text-severity-medium",
  critical: "text-severity-critical",
};

export default function ServerOps() {
  const { toast } = useStore();
  const [optimizing, setOptimizing] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const historyRef = useRef<{ t: number; cpu: number; mem: number; pool: number }[]>([]);
  const [, forceTick] = useState(0);

  const { data: server, loading, refresh, setData } = useResource<ServerOverview>(
    async () => {
      if (DEMO_MODE) return normalize(demoServer);
      const raw = await api.get<any>("/admin/server/overview");
      return normalize(raw);
    },
    EMPTY,
  );

  const d = server && (server as any)?.related_processes ? server : EMPTY;

  // Realtime refresh via smart polling (slows when tab hidden).
  // 30s foreground / 90s hidden — keeps the dashboard live without hammering the API.
  const skipFirstPoll = useRef(true);
  useSmartPoll(async () => {
    if (DEMO_MODE) return;
    if (skipFirstPoll.current) { skipFirstPoll.current = false; return; } // initial load handled by useResource
    try {
      const raw = await api.get<any>("/admin/server/overview");
      const next = normalize(raw);
      setData(next);
      const now = Date.now();
      historyRef.current = [
        ...historyRef.current.slice(-59),
        { t: now, cpu: next.resources.cpu_percent, mem: next.resources.memory.used_percent, pool: next.database_pool.checkedout },
      ];
      setLive(true);
      forceTick((x) => x + 1);
    } catch { setLive(false); }
  }, { intervalMs: 30000, hiddenIntervalMs: 90000 });

  useEffect(() => {
    if (!DEMO_MODE && server && server.related_processes) {
      const now = Date.now();
      historyRef.current = [
        ...historyRef.current.slice(-59),
        { t: now, cpu: server.resources.cpu_percent, mem: server.resources.memory.used_percent, pool: server.database_pool.checkedout },
      ];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server]);

  const history = historyRef.current;
  const rss = d.related_processes.reduce((s, p) => s + p.rss_mb, 0);
  const memPct = d.resources.memory.used_percent;
  const cpuPct = d.resources.cpu_percent;
  const poolPct = d.database_pool.size > 0 ? (d.database_pool.checkedout / d.database_pool.size) * 100 : 0;

  const runAction = async (action: string) => {
    setOptimizing(action);
    try {
      await api.post("/admin/server/optimize", { actions: [action] });
      toast("success", `Action ${action} dispatched`);
      refresh();
    } catch (err) {
      toast("error", "Action failed");
    } finally {
      setOptimizing(null);
    }
  };

  const serverHealthTone = healthTone(d.health, d.healthScore);

  return (
    <div>
      <PageHeader
        title="Server Monitoring"
        description="Realtime runtime activity: processes, resources, pools and workers"
        actions={
          <div className="flex items-center gap-2">
            <span className={cx("flex items-center gap-1.5 text-xs font-mono", live ? "text-emerald-400" : "text-slate-500")}>
              {live ? <Wifi size={12} /> : <WifiOff size={12} />}
              {live ? "Live" : "Polling"}
            </span>
            <button onClick={refresh} className="btn-ghost text-sm px-3 py-1.5"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
          </div>
        }
      />

      {loading && !d.related_processes.length ? (
        <TableSkeleton rows={4} />
      ) : (
        <div className="space-y-4">
          {/* Health + headline stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Health"
              value={<span className={cx("flex items-center gap-1.5 capitalize", healthToneClass[serverHealthTone])}>{serverHealthTone === "healthy" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />} {d.health || "unknown"}</span>}
              icon={<Activity size={18} />}
              trend="up"
              trendLabel={`score ${d.healthScore}/100`}
            />
            <StatCard label="CPU" value={`${cpuPct}%`} icon={<Cpu size={18} />} trend={cpuPct > 85 ? "down" : "up"} trendLabel={`${d.resources.cpu_count_logical} logical cores`} />
            <StatCard label="Memory" value={`${rss} MB`} icon={<HardDrive size={18} />} trend="neutral" trendLabel={`${memPct}% of ${d.resources.memory.total_mb} MB host`} />
            <StatCard label="DB Pool" value={`${d.database_pool.checkedout}/${d.database_pool.size}`} icon={<Database size={18} />} trend="neutral" trendLabel={`${d.database_pool.checkedin} checked in`} />
          </div>

          {/* Realtime gauges: one card, three columns. The stat tiles above
              already name each resource and carry its headline number. */}
          <Card pad="sm" className="grid gap-x-6 gap-y-3 lg:grid-cols-3">
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400"><Cpu size={13} className="text-phantix-300" /> CPU usage</p>
              <ProgressBar value={cpuPct} color={cpuPct > 85 ? "#F43F5E" : cpuPct > 60 ? "#FB923C" : "#38BDF8"} />
              <div className="mt-1.5 flex justify-between text-xs text-slate-400">
                <span>Load avg</span>
                <span className="font-mono text-slate-300">{d.resources.load_avg.length ? d.resources.load_avg.map((v) => v.toFixed(2)).join(" · ") : "Not set"}</span>
              </div>
            </div>
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400"><HardDrive size={13} className="text-emerald-400" /> Memory</p>
              <ProgressBar value={memPct} color={memPct > 85 ? "#F43F5E" : memPct > 60 ? "#FB923C" : "#34D399"} />
              <div className="mt-1.5 flex justify-between text-xs text-slate-400">
                <span>{d.resources.memory.used_mb} MB used / {d.resources.memory.total_mb} MB</span>
                <span className="font-mono text-slate-300">{d.resources.disk.used_percent}% disk</span>
              </div>
            </div>
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400"><Database size={13} className="text-gold-400" /> DB pool</p>
              <ProgressBar value={poolPct} color={poolPct > 90 ? "#F43F5E" : poolPct > 70 ? "#FB923C" : "#E8B54D"} />
              <div className="mt-1.5 flex justify-between text-xs text-slate-400">
                <span>{d.database_pool.checkedin} checked in · {d.database_pool.overflow} overflow</span>
                <span className="font-mono text-slate-300">{timeAgo(d.timestamp)}</span>
              </div>
            </div>
          </Card>

          {/* History sparkline */}
          {history.length >= 2 && (
            <CollapsibleCard
              defaultOpen={false}
              title="Activity history"
              subtitle="CPU · Memory · DB pool over the last ~8 minutes"
              action={<Gauge size={15} className="text-slate-500" />}
            >
              <svg viewBox="0 0 600 120" className="w-full h-28">
                {[cpuPct, memPct, poolPct].map((_, series) => {
                  const key = series === 0 ? "cpu" : series === 1 ? "mem" : "pool";
                  const color = series === 0 ? "#38BDF8" : series === 1 ? "#34D399" : "#E8B54D";
                  const max = 100;
                  const pts = history.map((h, i) => {
                    const x = (i / Math.max(1, history.length - 1)) * 600;
                    const v = h[key as keyof typeof h] as number;
                    const y = 110 - (Math.min(max, Math.max(0, v)) / max) * 100;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  });
                  return <polyline key={key} points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />;
                })}
              </svg>
              <div className="mt-1 flex gap-4 text-[13px] text-slate-500">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" /> CPU</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Memory</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gold-400" /> DB pool</span>
              </div>
            </CollapsibleCard>
          )}

          {/* Processes */}
          <CollapsibleCard
            defaultOpen={false}
            title="Processes"
            subtitle={`${d.related_processes.length} platform processes · ${formatUptime(d.process.uptime_seconds)} uptime`}
            action={<Server size={15} className="text-phantix-300" />}
          >
            {d.related_processes.length === 0 ? (
              <p className="text-xs text-slate-500">No process data returned.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-phantix-700/40">
                      <th className="th">PID</th>
                      <th className="th">Role</th>
                      <th className="th">RSS</th>
                      <th className="th">Command</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.related_processes.map((p) => (
                      <tr key={p.pid} className="border-b border-phantix-800/40 hover:bg-phantix-800/35">
                        <td className="td font-mono text-xs text-gold-300">{p.pid}</td>
                        <td className="td"><span className="chip text-[12px] capitalize">{p.role.replace(/_/g, " ")}</span></td>
                        <td className="td font-mono text-xs text-slate-300">{p.rss_mb} MB</td>
                        <td className="td font-mono text-[13px] text-slate-400 truncate max-w-[420px]">{p.cmdline}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleCard>

          {/* Runtime panels */}
          <div className="grid lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader title="Celery workers" action={<Layers size={15} className="text-emerald-400" />} />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Available</span><StatusBadge status={d.celery.available ? "active" : "draft"} /></div>
                <div className="flex justify-between"><span className="text-slate-400">Workers</span><span className="font-mono text-white">{d.celery.worker_count}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Active tasks</span><span className="font-mono text-white">{d.celery.active_tasks}</span></div>
              </div>
            </Card>
            <Card>
              <CardHeader title="Asyncio + GC" action={<Boxes size={15} className="text-phantix-300" />} />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Event loop</span><StatusBadge status={d.asyncio.running_loop ? "active" : "draft"} /></div>
                <div className="flex justify-between"><span className="text-slate-400">Tasks</span><span className="font-mono text-white">{d.asyncio.tasks}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">GC gen0/1/2</span><span className="font-mono text-white">{num(d.gc.gen0)} / {num(d.gc.gen1)} / {num(d.gc.gen2)}</span></div>
              </div>
            </Card>
            <Card>
              <CardHeader title="Tool locks" action={<Clock size={15} className="text-gold-400" />} />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Active locks</span><span className="font-mono text-white">{d.tool_locks.active}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Total</span><span className="font-mono text-white">{d.tool_locks.total}</span></div>
                {d.tool_locks.note && <p className="text-xs text-slate-500">{d.tool_locks.note}</p>}
              </div>
            </Card>
          </div>

          {/* Recommendations */}
          <CollapsibleCard
            defaultOpen={false}
            title="Recommendations"
            subtitle="Health scoring from runtime signals"
            action={<Gauge size={15} className="text-gold-400" />}
          >
            {d.recommendations.length === 0 ? (
              <p className="text-xs text-slate-500">No recommendations.</p>
            ) : (
              <div className="space-y-2">
                {d.recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-md border border-phantix-700/40 bg-phantix-950/50 p-3 text-sm">
                    <span className={cx("chip shrink-0 text-[12px] capitalize", sevClass[r.severity] ?? sevClass.info)}>{r.severity}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-200">{r.title}</p>
                      {r.detail && <p className="mt-0.5 text-xs text-slate-400">{r.detail}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleCard>

          {/* Optimize actions */}
          <Card>
            <CardHeader title="Optimize actions" subtitle="GC, dispose DB pool, clear idle locks" action={<Activity size={15} className="text-slate-500" />} />
            <div className="flex flex-wrap gap-2">
              {d.optimize_actions.map((a) => (
                <button key={a} onClick={() => runAction(a)} disabled={optimizing === a} className="btn-secondary text-xs px-3 py-1.5">
                  {optimizing === a ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} {a.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </Card>

          {/* Prometheus exposition — the same numbers an external scraper sees */}
          <PrometheusMetrics />
        </div>
      )}
    </div>
  );
}
