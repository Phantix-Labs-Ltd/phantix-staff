/**
 * Overwatch — the data layer for the realtime watch.
 *
 * Two rules from the backend contract shape everything here:
 *
 * 1. **The backend holds nothing.** `/admin/overwatch/snapshot` returns *raw counters
 *    over a sliding window* plus a *trailing seed read from the logs*. Rates are our
 *    job: we keep a short ring of samples in a ref and diff them. Nothing is written to
 *    storage, so closing the tab leaves nothing behind. The ring is minutes, not
 *    history, and it is deliberately a ref rather than state so a re-render cannot
 *    silently turn it into a cache.
 * 2. **The payload carries no tenant data.** The ranking is therefore per *engine*,
 *    never per customer. If a field looks tenant-shaped it must not be read here.
 *
 * Warm start: the seed gives a baseline on the very first call, so the first spike
 * ratio means something before a second sample exists.
 */
import { useEffect, useRef, useState } from "react";

import { API_BASE, tokens } from "./api";
import { ENGINE_NODE, LOG_TYPE_ENGINE } from "./overwatchMap";

// ───────────────────────────────────────────────────────────────── snapshot types
export interface EngineRow {
  engineId: string;
  running?: number;
  queued?: number;
  paused?: number;
  otherActive?: number;
  totalActive?: number;
  source?: string;
  notes?: string;
}

export interface Snapshot {
  at: string;
  tookMs: number;
  counters: {
    flows: {
      windowMinutes: number;
      sinceHours: number;
      byLogType: Record<string, Record<string, number>>;
      byLogLevel: Record<string, number>;
      byEventType: Record<string, Record<string, number>>;
      byEventSeverity: Record<string, number>;
      byEventSource: Record<string, Record<string, number>>;
      errors: { error: number; critical: number };
      readErrors: string[];
    };
    engines: EngineRow[];
    totalActiveJobs: number;
    celery: {
      available: boolean;
      workerCount: number;
      workers: string[];
      activeTasksByWorker: Record<string, number>;
      reservedTasksByWorker: Record<string, number>;
      detail?: string | null;
    };
    queues: { depths: Record<string, number>; names: string[] };
    process: {
      resources?: Record<string, unknown>;
      databasePool?: Record<string, unknown>;
      securityPools?: Record<string, unknown>;
      asyncio?: Record<string, unknown>;
      toolLocks?: Record<string, unknown>;
    };
  };
  seed: {
    windowHours: number;
    byLogType: Record<string, Record<string, number>>;
    bySeverity: Record<string, number>;
    totals: Record<string, number>;
    errorsPerHour: number;
    readErrors?: string[];
  };
  dark: { id: string; kind: string; reason: string }[];
  notes: string[];
  /** SOC + CI/CD config facts (phases 0–6). Config-read only; no tenant data. */
  deployment?: {
    logRawDefault: boolean;
    logResidencyRegion: string;
    logEventTtlDays: number | null;
    logRawTtlDays: number | null;
    logBucket: string;
    cicdEnabled: boolean;
    cicdDailyScanCap: number | null;
    cicdPushProfile?: string;
    cicdDeploymentProfile?: string;
    pysigmaInstalled: boolean;
    cicdProviders: Record<string, boolean>;
  };
}

export async function fetchSnapshot(windowMinutes = 60, seedHours = 24): Promise<Snapshot> {
  const qs = new URLSearchParams({
    window_minutes: String(windowMinutes),
    seed_hours: String(seedHours),
  });
  const res = await fetch(`${API_BASE}/admin/overwatch/snapshot?${qs}`, {
    headers: { Authorization: `Bearer ${tokens.staff ?? ""}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`overwatch snapshot ${res.status}`);
  return (await res.json()) as Snapshot;
}

// ───────────────────────────────────────────────────────────────────── spike maths
export interface Sample {
  at: number;
  /* per log_type → level counts, straight from the counter */
  logTypes: Record<string, Record<string, number>>;
  eventSources: Record<string, Record<string, number>>;
  queueDepths: Record<string, number>;
  totalActiveJobs: number;
}

export type Signal = "errors" | "queue" | "saturation" | "load";

export interface Ranked {
  /** The engine node id this row points at on the map, when we can resolve one. */
  node?: string;
  /** What we are ranking: an engine, a queue, or a subsystem. */
  label: string;
  signal: Signal;
  /** Observed rate over the interval, in events/minute. */
  ratePerMin: number;
  /** Baseline rate from the warm seed, in events/minute. Null before we have one. */
  baselinePerMin: number | null;
  /** rate / baseline. Null when there is no baseline to compare against. */
  ratio: number | null;
  detail: string;
  /** Absolute-threshold hit; used before a baseline exists, and to catch quiet spikes. */
  absolute: boolean;
}

const PER_MIN = (count: number, ms: number) => (ms > 0 ? (count * 60000) / ms : 0);

function sumLevels(counts: Record<string, number> | undefined, levels: string[]): number {
  if (!counts) return 0;
  let n = 0;
  for (const l of levels) n += counts[l] ?? 0;
  return n;
}

/** Errors per log_type from the seed, as a per-minute baseline. */
function seedBaseline(snapshot: Snapshot): Map<string, number> {
  const hours = Math.max(1, snapshot.seed.windowHours);
  const out = new Map<string, number>();
  for (const [logType, counts] of Object.entries(snapshot.seed.byLogType ?? {})) {
    const errs = sumLevels(counts, ["error", "critical"]);
    out.set(logType, errs / (hours * 60));
  }
  return out;
}

/**
 * Rank what is worth looking at, worst first.
 *
 * Pure: same inputs, same output. The caller owns the ring buffer.
 */
export function rankSpikes(
  previous: Sample | null,
  current: Sample,
  snapshot: Snapshot,
): Ranked[] {
  const out: Ranked[] = [];
  const baseline = seedBaseline(snapshot);
  const dtMs = previous ? Math.max(1, current.at - previous.at) : 0;

  // ── 1. error rate per subsystem (per log_type), the primary signal
  const types = new Set<string>([
    ...Object.keys(current.logTypes),
    ...Object.keys(previous?.logTypes ?? {}),
  ]);
  for (const logType of types) {
    const now = sumLevels(current.logTypes[logType], ["error", "critical"]);
    const before = previous ? sumLevels(previous.logTypes[logType], ["error", "critical"]) : 0;
    const delta = previous ? Math.max(0, now - before) : 0;
    const rate = previous ? PER_MIN(delta, dtMs) : 0;
    const base = baseline.get(logType) ?? null;
    const ratio = base && base > 0 ? rate / base : null;
    // before two samples exist, fall back to the seed's own rate as the observation
    const observed = previous ? rate : (base ?? 0) * 1;
    if (observed <= 0) continue;
    out.push({
      node: LOG_TYPE_ENGINE[logType],
      label: logType,
      signal: "errors",
      ratePerMin: observed,
      baselinePerMin: base,
      ratio,
      detail:
        ratio === null
          ? `${observed.toFixed(2)}/min (no baseline yet)`
          : `${observed.toFixed(2)}/min · ${ratio.toFixed(1)}× baseline`,
      absolute: observed >= 1,
    });
  }

  // ── 2. queue depth growth, and simply being deep
  const queueNames = new Set<string>([
    ...Object.keys(current.queueDepths),
    ...Object.keys(previous?.queueDepths ?? {}),
  ]);
  for (const q of queueNames) {
    const depth = current.queueDepths[q] ?? 0;
    const before = previous?.queueDepths[q] ?? depth;
    const growth = previous ? Math.max(0, depth - before) : 0;
    const growthPerMin = previous ? PER_MIN(growth, dtMs) : 0;
    if (depth <= 0 && growthPerMin <= 0) continue;
    out.push({
      node: `q-${q}`,
      label: `queue ${q}`,
      signal: "queue",
      ratePerMin: growthPerMin,
      baselinePerMin: null,
      ratio: null,
      detail:
        growthPerMin > 0
          ? `depth ${depth} · +${growthPerMin.toFixed(1)}/min`
          : `depth ${depth}, not draining`,
      absolute: depth >= 50,
    });
  }

  // ── 3. saturation: pools with nothing free, and the agent concurrency ceiling
  const pools = snapshot.counters.process.securityPools as
    | { activePools?: number; connections?: number; free?: number; maxSize?: number }
    | undefined;
  if (pools && (pools.connections ?? 0) > 0 && (pools.free ?? 0) === 0) {
    out.push({
      node: "security-db",
      label: "security DB pool",
      signal: "saturation",
      ratePerMin: 0,
      baselinePerMin: null,
      ratio: null,
      detail: `${pools.connections} connections, none free (max ${pools.maxSize ?? "?"} per session)`,
      absolute: true,
    });
  }
  const dbPool = snapshot.counters.process.databasePool as
    | { checkedout?: number; size?: number; max_overflow?: number }
    | undefined;
  if (dbPool) {
    const cap = (dbPool.size ?? 0) + (dbPool.max_overflow ?? 0);
    const used = dbPool.checkedout ?? 0;
    if (cap > 0 && used >= cap * 0.9) {
      out.push({
        node: "db",
        label: "platform DB pool",
        signal: "saturation",
        ratePerMin: 0,
        baselinePerMin: null,
        ratio: null,
        detail: `${used}/${cap} connections checked out`,
        absolute: true,
      });
    }
  }

  // ── 4. engine work load, so a busy engine is visible even with no errors
  for (const e of snapshot.counters.engines ?? []) {
    const active = e.totalActive ?? 0;
    if (active <= 0) continue;
    out.push({
      node: ENGINE_NODE[e.engineId],
      label: e.engineId,
      signal: "load",
      ratePerMin: 0,
      baselinePerMin: null,
      ratio: null,
      detail: `${active} active (${e.running ?? 0} running, ${e.queued ?? 0} queued)`,
      absolute: active >= 5,
    });
  }

  const weight = (r: Ranked) => {
    const bySignal = r.signal === "errors" ? 3 : r.signal === "queue" ? 2 : r.signal === "saturation" ? 2.5 : 1;
    return (r.ratio ?? 0) * bySignal + (r.absolute ? 1 : 0) + r.ratePerMin / 100;
  };
  return out.sort((a, b) => weight(b) - weight(a));
}

// ───────────────────────────────────────────────────────────────────────── hooks
const RING = 12; // ~3 minutes at a 15 s poll. A buffer, not history.

export interface OverwatchState {
  snapshot: Snapshot | null;
  previous: Sample | null;
  ranked: Ranked[];
  /** Samples currently held, so the UI can say "warming up" honestly. */
  samples: number;
  error: string | null;
  lastAt: number | null;
  refresh: () => void;
}

function toSample(s: Snapshot): Sample {
  return {
    at: Date.parse(s.at) || Date.now(),
    logTypes: s.counters.flows.byLogType ?? {},
    eventSources: s.counters.flows.byEventSource ?? {},
    queueDepths: s.counters.queues?.depths ?? {},
    totalActiveJobs: s.counters.totalActiveJobs ?? 0,
  };
}

/** Poll the aggregate and derive rates. Holds its ring in a ref, never in storage. */
export function useOverwatch(intervalMs = 15000, enabled = true): OverwatchState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [ranked, setRanked] = useState<Ranked[]>([]);
  const [samples, setSamples] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const ring = useRef<Sample[]>([]);
  const busy = useRef(false);
  const tick = useRef(0);

  const load = useRef(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const snap = await fetchSnapshot();
      const sample = toSample(snap);
      ring.current = [...ring.current, sample].slice(-RING);
      const prev = ring.current.length > 1 ? ring.current[ring.current.length - 2] : null;
      setSnapshot(snap);
      setRanked(rankSpikes(prev, sample, snap));
      setSamples(ring.current.length);
      setError(null);
      setLastAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "snapshot failed");
    } finally {
      busy.current = false;
    }
  });

  useEffect(() => {
    if (!enabled) return;
    void load.current();
    const id = window.setInterval(() => {
      // pause while the tab is hidden; the next tick backfills from the seed
      if (document.visibilityState === "hidden") return;
      tick.current += 1;
      void load.current();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, enabled]);

  return {
    snapshot,
    previous: ring.current.length > 1 ? ring.current[ring.current.length - 2] : null,
    ranked,
    samples,
    error,
    lastAt,
    refresh: () => void load.current(),
  };
}

export interface TailLine {
  at: number;
  severity: string;
  source: string;
  eventType?: string;
  message: string;
}

/**
 * The event tail: `/admin/super/events/stream`, bounded, in memory only.
 *
 * Uses fetch + ReadableStream rather than EventSource, because EventSource cannot
 * send an Authorization header. Reconnects with backoff; a control room that dies
 * with the first dropped stream is worse than no control room.
 */
export function useEventTail(enabled: boolean, limit = 120): { lines: TailLine[]; connected: boolean } {
  const [lines, setLines] = useState<TailLine[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let attempt = 0;
    let controller: AbortController | null = null;

    const push = (line: TailLine) =>
      setLines((prev) => [...prev, line].slice(-limit));

    const run = async () => {
      while (!stopped) {
        controller = new AbortController();
        try {
          const res = await fetch(`${API_BASE}/admin/super/events/stream?poll_seconds=3`, {
            headers: {
              Authorization: `Bearer ${tokens.staff ?? ""}`,
              Accept: "text/event-stream",
            },
            signal: controller.signal,
          });
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
          setConnected(true);
          attempt = 0;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const parts = buf.split("\n");
            buf = parts.pop() ?? "";
            let event = "message";
            for (const raw of parts) {
              const line = raw.trimEnd();
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) {
                const data = line.slice(5).trim();
                if (!data) continue;
                try {
                  const parsed = JSON.parse(data) as Record<string, unknown>;
                  if (parsed.event === "ping" || event === "ping") continue;
                  push({
                    at: Date.now(),
                    severity: String(parsed.severity ?? parsed.level ?? "info"),
                    source: String(parsed.source ?? parsed.engine ?? "-"),
                    eventType: parsed.event_type ? String(parsed.event_type) : undefined,
                    message: String(parsed.message ?? parsed.detail ?? data).slice(0, 400),
                  });
                } catch {
                  // a non-JSON frame is still worth showing, truncated
                  push({ at: Date.now(), severity: "info", source: "stream", message: data.slice(0, 200) });
                }
              }
            }
          }
        } catch {
          setConnected(false);
        }
        if (stopped) break;
        attempt = Math.min(attempt + 1, 5);
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    };

    void run();
    return () => {
      stopped = true;
      controller?.abort();
      setConnected(false);
    };
  }, [enabled, limit]);

  return { lines, connected };
}
