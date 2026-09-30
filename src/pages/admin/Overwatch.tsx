/**
 * /overwatch — the realtime watch over the whole deployment.
 *
 * Scope is deliberately everything: all 13 engines plus every unit running on the
 * server, on one screen, so a spike can be seen in the context of what it is connected
 * to. The ranked list on the right is how the eye gets there first; the map explains
 * where that engine sits.
 *
 * It is read-only, superadmin-only, and **holds nothing**: at most a few minutes of
 * samples live in a ref, and closing the tab leaves no trace. The backend's snapshot is
 * the same shape — raw counters plus a baseline read from the logs — so nothing durable
 * exists anywhere in this path. Logs remain the record; this is a lens over them.
 */
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Gauge,
  Layers,
  ListTree,
  Pause,
  Play,
  RefreshCw,
  Server,
  Wifi,
  WifiOff,
} from "lucide-react";

import OverwatchMap from "@/components/OverwatchMap";
import { Card, CardHeader, EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { useEventTail, useOverwatch, type Ranked } from "@/lib/overwatch";
import { LEVEL_COLOR, nodeStates, type NodeLevel, type NodeState } from "@/lib/overwatchMap";
import { UNITS } from "@/lib/overwatchTopology";
import { cx } from "@/lib/utils";

const agoLabel = (ms: number | null) => {
  if (!ms) return "never";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
};

const SIGNAL_LABEL: Record<Ranked["signal"], string> = {
  errors: "errors",
  queue: "queue",
  saturation: "saturation",
  load: "load",
};

const SIGNAL_COLOR: Record<Ranked["signal"], string> = {
  errors: "#ef4444",
  queue: "#f59e0b",
  saturation: "#f0abfc",
  load: "#38bdf8",
};

export default function Overwatch() {
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { snapshot, ranked, samples, error, lastAt, refresh } = useOverwatch(15000, !paused);
  const { lines, connected } = useEventTail(!paused);

  const states = useMemo(
    () => (snapshot ? nodeStates(snapshot) : new Map<string, NodeState>()),
    [snapshot],
  );
  const highlight = useMemo(() => ranked.slice(0, 5).map((r) => r.node).filter(Boolean) as string[], [ranked]);

  const live = useMemo(() => {
    const levels: Record<NodeLevel, number> = {
      unknown: 0,
      idle: 0,
      active: 0,
      busy: 0,
      warn: 0,
      error: 0,
      dark: 0,
    };
    for (const s of states.values()) levels[s.level] += 1;
    return levels;
  }, [states]);

  const reported = states.size;
  const totalQueued = Object.values(snapshot?.counters.queues?.depths ?? {}).reduce((a, b) => a + b, 0);
  const warm = samples >= 2;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Overwatch"
        description="Realtime watch over every engine and everything deployed. Read-only, superadmin only, and it stores nothing — logs remain the record of what happened."
        actions={
          <>
            <span className={cx("chip", connected ? "text-emerald-400" : "text-slate-500")}>
              {connected ? <Wifi size={12} className="mr-1 inline" /> : <WifiOff size={12} className="mr-1 inline" />}
              {connected ? "tail live" : "tail offline"}
            </span>
            <span className="chip text-slate-400">
              {warm ? `${samples} samples` : "warming up — seed only"}
            </span>
            <span className="chip text-slate-400">poll {agoLabel(lastAt)}</span>
            <button className="btn-secondary" onClick={() => setPaused((p) => !p)}>
              {paused ? <Play size={14} className="mr-1 inline" /> : <Pause size={14} className="mr-1 inline" />}
              {paused ? "resume" : "pause"}
            </button>
            <button className="btn-secondary" onClick={refresh} disabled={paused}>
              <RefreshCw size={14} className="mr-1 inline" />
              refresh
            </button>
          </>
        }
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-severity-critical/40 bg-severity-critical/10 px-3 py-2 text-sm text-severity-critical">
          <AlertTriangle size={14} />
          {error}
          <span className="text-xs text-slate-400">
            — the watch degrades; the topology below still shows the last known state
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="units watched" value={UNITS.length} icon={<Layers size={16} />} />
        <StatCard
          label="reported live"
          value={`${reported}/${UNITS.length}`}
          icon={<Activity size={16} />}
          trendLabel="the rest are quiet or unreported, and are drawn dim"
        />
        <StatCard
          label="engines active"
          value={live.active + live.busy}
          icon={<Server size={16} />}
          trendLabel={`${live.busy} busy · ${live.warn} warning · ${live.error} error`}
          trend={live.error > 0 ? "up" : "neutral"}
        />
        <StatCard
          label="queued messages"
          value={totalQueued}
          icon={<ListTree size={16} />}
          trend={totalQueued >= 200 ? "up" : "neutral"}
          trendLabel={totalQueued >= 200 ? "a backlog is building" : "drained"}
        />
        <StatCard
          label="snapshot cost"
          value={`${snapshot?.tookMs ?? 0} ms`}
          icon={<Gauge size={16} />}
          trendLabel={snapshot ? `seed ${snapshot.seed.windowHours}h · ${snapshot.seed.errorsPerHour}/h errors` : "—"}
        />
      </div>

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[1fr_400px]">
        {/* ── the watch itself */}
        <Card className="flex min-h-[460px] flex-col overflow-hidden !p-0">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Activity size={13} className="text-emerald-400" />
              every deployed unit · boundaries are deployment units, not layout
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              {(["active", "busy", "warn", "error", "dark", "idle"] as NodeLevel[]).map((l) => (
                <span key={l} className="inline-flex items-center gap-1">
                  <i className="inline-block h-2 w-2 rounded-sm" style={{ background: LEVEL_COLOR[l] }} />
                  {l}
                  {live[l] > 0 && <b className="text-slate-300">{live[l]}</b>}
                </span>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {snapshot ? (
              <OverwatchMap
                states={states}
                highlight={highlight}
                selected={selected}
                onSelect={setSelected}
              />
            ) : (
              <EmptyState
                icon={<Activity size={22} />}
                title={error ? "Snapshot unavailable" : "Loading the deployment…"}
                body={error ? "The page keeps the last known state rather than blanking." : undefined}
              />
            )}
          </div>
        </Card>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
          {/* ── where to look first */}
          <Card>
            <CardHeader
              title="Look here first"
              subtitle={
                warm
                  ? "ranked by rate against the log baseline, then by absolute load"
                  : "warming up: no baseline yet, so this ranks on absolute load"
              }
            />
            {ranked.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-slate-500">
                Nothing is spiking. {snapshot ? `${snapshot.counters.totalActiveJobs} jobs active.` : ""}
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {ranked.slice(0, 8).map((r, i) => (
                  <li
                    key={`${r.signal}-${r.label}-${i}`}
                    className={cx(
                      "flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-white/5",
                      selected && r.node === selected && "bg-white/5",
                    )}
                    onClick={() => r.node && setSelected(r.node)}
                  >
                    <i className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: SIGNAL_COLOR[r.signal] }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium text-slate-200">{r.label}</span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-500">
                          {SIGNAL_LABEL[r.signal]}
                        </span>
                      </div>
                      <div className="truncate text-xs text-slate-400">{r.detail}</div>
                    </div>
                    {r.node && <ArrowRight size={13} className="mt-1 shrink-0 text-slate-600" />}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ── queues: depth is the honest signal, and it is exact */}
          <Card>
            <CardHeader title="Queues" subtitle="depth from Redis list lengths — no poll lag" />
            <ul className="px-3 pb-3">
              {Object.entries(snapshot?.counters.queues?.depths ?? {}).map(([q, depth]) => (
                <li key={q} className="flex items-center justify-between py-1 text-sm">
                  <span className="text-slate-300">{q}</span>
                  <span
                    className={cx(
                      "font-mono text-xs",
                      depth >= 200 ? "text-severity-critical" : depth >= 50 ? "text-amber-400" : depth > 0 ? "text-sky-400" : "text-slate-500",
                    )}
                  >
                    {depth}
                  </span>
                </li>
              ))}
              {!snapshot?.counters.queues?.names?.length && <li className="py-1 text-sm text-slate-500">no queues reported</li>}
            </ul>
          </Card>

          {/* ── the engines, as the backend counts them */}
          <Card>
            <CardHeader title="Engines" subtitle="active work per engine, cross-tenant" />
            <ul className="px-3 pb-3">
              {(snapshot?.counters.engines ?? []).map((e) => (
                <li key={e.engineId} className="flex items-center justify-between py-1 text-sm">
                  <span className="text-slate-300">{e.engineId}</span>
                  <span className="font-mono text-xs text-slate-400">
                    {e.totalActive ?? 0}
                    <span className="text-slate-600"> ({e.running ?? 0}r/{e.queued ?? 0}q)</span>
                  </span>
                </li>
              ))}
              {!snapshot?.counters.engines?.length && <li className="py-1 text-sm text-slate-500">no engine work reported</li>}
            </ul>
          </Card>

          {/* ── present but never on a request path: shown, not hidden */}
          <Card>
            <CardHeader
              title="Deployed but dark"
              subtitle="no request path reaches these — listed so the quiet parts are not mistaken for missing ones"
            />
            <ul className="space-y-1 px-3 pb-3">
              {(snapshot?.dark ?? []).map((d) => (
                <li key={d.id} className="text-xs">
                  <span className="font-mono text-severity-critical">{d.id}</span>
                  <span className="text-slate-500"> — {d.reason}</span>
                </li>
              ))}
              {!snapshot?.dark?.length && <li className="text-sm text-slate-500">none declared</li>}
            </ul>
          </Card>

          {snapshot?.notes?.length ? (
            <Card>
              <CardHeader title="Payload notes" subtitle="what the endpoint is telling us about itself" />
              <ul className="space-y-1 px-3 pb-3 text-xs text-slate-500">
                {snapshot.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
                {snapshot.counters.flows.readErrors?.length ? (
                  <li className="text-amber-400">
                    rollups degraded this cycle: {snapshot.counters.flows.readErrors.join(", ")}
                  </li>
                ) : null}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      {/* ── the tail: bounded, in memory only. This is detail, not the signal. */}
      <Card className="mt-4 flex h-[190px] shrink-0 flex-col overflow-hidden !p-0">
        <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ListTree size={13} />
            event tail
            <span className="text-slate-600">platform events + logs, last {lines.length} lines, not stored</span>
          </div>
          <StatusBadge status={connected ? "online" : "offline"} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
          {lines.length === 0 ? (
            <p className="py-4 text-center text-slate-500">
              {connected ? "waiting for events…" : "tail disconnected — the rails above are unaffected"}
            </p>
          ) : (
            lines
              .slice(-60)
              .reverse()
              .map((l, i) => (
                <div key={`${l.at}-${i}`} className="flex gap-2">
                  <span className="shrink-0 text-slate-600">{new Date(l.at).toLocaleTimeString()}</span>
                  <span
                    className={cx(
                      "shrink-0 uppercase",
                      l.severity === "error" || l.severity === "critical"
                        ? "text-severity-critical"
                        : l.severity === "warning"
                          ? "text-amber-400"
                          : "text-slate-500",
                    )}
                  >
                    {l.severity.slice(0, 4)}
                  </span>
                  <span className="shrink-0 text-slate-500">{l.source}</span>
                  <span className="truncate text-slate-300">{l.message}</span>
                </div>
              ))
          )}
        </div>
      </Card>
    </div>
  );
}
