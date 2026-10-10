/**
 * Overwatch live mode — the data layer for moving traffic.
 *
 * `/admin/overwatch/live` streams one record per movement across the backend: a
 * request reaching the engine that owns its route, an engine event reaching each
 * subscriber, a task entering a queue, a worker picking it up. Each record is a kind,
 * a source, a destination and a label (route template, event type or task name) —
 * no payload, no organization, no ids — so it is safe to animate on a shared screen.
 *
 * Like the snapshot, nothing is kept: the feed is a short in-memory ring, and the
 * backend only publishes while a stream like this one is open.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { API_BASE, tokens } from "./api";
import { ENGINE_NODE, QUEUE_WORKER, queueNode } from "./overwatchMap";
import { UNITS } from "./overwatchTopology";

export type FlowKind = "request" | "event" | "task" | "pickup" | "error";

export interface LiveFlow {
  /** Local sequence number, for React keys. */
  seq: number;
  t: number;
  kind: FlowKind;
  /** Raw node names as the backend sends them (`engine:vapt_engine`, `queue:scans`). */
  src: string;
  dst: string;
  /** Map unit ids, or null when the map has no unit for that name. */
  from: string | null;
  to: string | null;
  label: string;
  status?: number;
  ms?: number;
}

export const FLOW_COLOR: Record<FlowKind, string> = {
  request: "#38bdf8",
  event: "#a78bfa",
  task: "#f59e0b",
  pickup: "#22c55e",
  error: "#ef4444",
};

export const FLOW_LABEL: Record<FlowKind, string> = {
  request: "request",
  event: "bus event",
  task: "queued",
  pickup: "picked up",
  error: "error",
};

const KNOWN_UNITS = new Set(UNITS.map((u) => u.id));

/** Backend node name → map unit id (null when the map cannot place it). */
export function resolveNode(raw: string): string | null {
  const [kind, name = ""] = raw.includes(":") ? raw.split(/:(.*)/s) : [raw, ""];
  let id: string | undefined;
  if (kind === "api") id = "api";
  else if (kind === "bus") id = "engine-bus";
  else if (kind === "engine") id = ENGINE_NODE[name];
  else if (kind === "queue") id = queueNode(name);
  else if (kind === "worker-for") id = QUEUE_WORKER[name] ?? "worker-bus";
  return id && KNOWN_UNITS.has(id) ? id : null;
}

/** Readable name for the feed: the unit's label, else the raw name. */
export function nodeName(id: string | null, raw: string): string {
  if (id) return UNITS.find((u) => u.id === id)?.label ?? id;
  return raw.replace(/^engine:/, "").replace(/^queue:/, "queue ");
}

type Listener = (flow: LiveFlow) => void;

export interface LiveFeed {
  connected: boolean;
  /** Most recent first, at most `limit`. */
  feed: LiveFlow[];
  /** Flows per second over the last 10 s, by kind. */
  rates: Record<FlowKind, number>;
  /** For the map: called once per flow as it arrives. */
  subscribe: (fn: Listener) => () => void;
}

const RATE_WINDOW_MS = 10_000;
const EMPTY_RATES: Record<FlowKind, number> = { request: 0, event: 0, task: 0, pickup: 0, error: 0 };

export function useLiveFlows(enabled: boolean, limit = 80): LiveFeed {
  const [connected, setConnected] = useState(false);
  const [feed, setFeed] = useState<LiveFlow[]>([]);
  const [rates, setRates] = useState<Record<FlowKind, number>>(EMPTY_RATES);
  const listeners = useRef(new Set<Listener>());
  const pending = useRef<LiveFlow[]>([]);
  const recent = useRef<{ t: number; kind: FlowKind }[]>([]);
  const seq = useRef(0);

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  // The feed and rates re-render four times a second at most, however busy it is.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      recent.current = recent.current.filter((r) => now - r.t < RATE_WINDOW_MS);
      const next = { ...EMPTY_RATES };
      for (const r of recent.current) next[r.kind] += 1;
      for (const k of Object.keys(next) as FlowKind[]) next[k] = Math.round((next[k] / (RATE_WINDOW_MS / 1000)) * 10) / 10;
      setRates(next);
      if (pending.current.length) {
        const batch = pending.current.reverse();
        pending.current = [];
        setFeed((prev) => [...batch, ...prev].slice(0, limit));
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [enabled, limit]);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }
    let stopped = false;
    let attempt = 0;
    let controller: AbortController | null = null;

    const accept = (data: string) => {
      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(data) as Record<string, unknown>;
      } catch {
        return;
      }
      if (typeof raw.src !== "string" || typeof raw.dst !== "string") return;
      const kind = (["request", "event", "task", "pickup", "error"].includes(String(raw.kind)) ? raw.kind : "event") as FlowKind;
      const flow: LiveFlow = {
        seq: ++seq.current,
        t: typeof raw.t === "number" ? raw.t : Date.now(),
        kind,
        src: raw.src,
        dst: raw.dst,
        from: resolveNode(raw.src),
        to: resolveNode(raw.dst),
        label: String(raw.label ?? ""),
        status: typeof raw.status === "number" ? raw.status : undefined,
        ms: typeof raw.ms === "number" ? raw.ms : undefined,
      };
      recent.current.push({ t: Date.now(), kind });
      pending.current.push(flow);
      if (pending.current.length > limit) pending.current.splice(0, pending.current.length - limit);
      for (const fn of listeners.current) fn(flow);
    };

    const run = async () => {
      while (!stopped) {
        controller = new AbortController();
        try {
          const res = await fetch(`${API_BASE}/admin/overwatch/live`, {
            headers: { Authorization: `Bearer ${tokens.staff ?? ""}`, Accept: "text/event-stream" },
            signal: controller.signal,
          });
          if (!res.ok || !res.body) throw new Error(`live ${res.status}`);
          setConnected(true);
          attempt = 0;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const frames = buf.split("\n\n");
            buf = frames.pop() ?? "";
            for (const frame of frames) {
              if (frame.startsWith(":") || frame.startsWith("event:")) continue;
              const data = frame
                .split("\n")
                .filter((l) => l.startsWith("data:"))
                .map((l) => l.slice(5).trim())
                .join("");
              if (data) accept(data);
            }
          }
        } catch {
          /* reconnect below */
        }
        setConnected(false);
        if (stopped) break;
        attempt = Math.min(attempt + 1, 5);
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    };

    void run();
    return () => {
      stopped = true;
      controller?.abort();
    };
  }, [enabled, limit]);

  // Leaving live mode clears the ring: nothing outlives the mode.
  useEffect(() => {
    if (enabled) return;
    setFeed([]);
    setRates(EMPTY_RATES);
    pending.current = [];
    recent.current = [];
  }, [enabled]);

  return { connected, feed, rates, subscribe };
}
