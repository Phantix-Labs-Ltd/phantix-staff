/**
 * Normalisation: snapshot counters → live state per node on the topology.
 *
 * The backend reports aggregate activity by *engine id*, *log type*, *event source* and
 * *queue name*. The map is nodes and links. This module is the join, and it is the only
 * place that knows both vocabularies — so when a new engine or queue appears, there is
 * exactly one mapping to extend.
 *
 * Tenant-free by construction: every input here is a count, a queue name or a subsystem
 * name. Nothing in this file reads a customer identifier.
 */
import type { Snapshot } from "./overwatch";

/** Engine id as the backend reports it → the unit id on the map. */
export const ENGINE_NODE: Record<string, string> = {
  scanner_engine: "eng-scanner",
  asset_engine: "eng-asset",
  vapt_engine: "eng-vapt",
  reporting_engine: "eng-reporting",
  alert_engine: "eng-alert",
  ai_engine: "eng-ai",
  risk_engine: "eng-risk",
  soc_engine: "eng-soc",
  compliance_engine: "eng-compliance",
  audit_engine: "eng-audit",
  operations_engine: "eng-ops",
  control_plane: "eng-control",
  threat_model_engine: "eng-threat",
};

/**
 * Log type → the subsystem that wrote it. `log_type` is the closest thing the long
 * format logs carry to an engine attribution, so it is what turns the log rollup into a
 * per-engine error rate. Unmapped types still rank; they just cannot be located on the
 * map, and the UI says so rather than guessing.
 */
export const LOG_TYPE_ENGINE: Record<string, string> = {
  api: "api",
  http: "api",
  scanner: "eng-scanner",
  scan: "eng-scanner",
  vapt: "eng-vapt",
  risk: "eng-risk",
  report: "eng-reporting",
  reports: "eng-reporting",
  reporting: "eng-reporting",
  alert: "eng-alert",
  alerts: "eng-alert",
  ai: "eng-ai",
  agi: "agi-runner",
  agent: "eng-ai",
  soc: "eng-soc",
  compliance: "eng-compliance",
  audit: "eng-audit",
  ops: "eng-ops",
  billing: "eng-control",
  control: "eng-control",
  threat: "eng-threat",
  asset: "eng-asset",
  assets: "eng-asset",
  worker: "worker-bus",
  celery: "worker-bus",
  integration: "worker-programme",
  integrations: "worker-programme",
  autofix: "worker-programme",
  continuous: "worker-programme",
  db: "db",
  redis: "redis",
  sandbox: "sandbox-pool",
};

/** `platform_events.source` → the process that raised it. */
export const SOURCE_NODE: Record<string, string> = {
  api: "api",
  "worker-bus": "worker-bus",
  "worker-ai": "worker-ai",
  "worker-scans": "worker-scans",
  "worker-vapt": "worker-vapt",
  "worker-alerts": "worker-alerts",
  "worker-reports": "worker-reports",
  "worker-programme": "worker-programme",
  beat: "beat",
  "alert-daemon": "alert-daemon",
  "phantix-agi-runner": "agi-runner",
  agi: "agi-runner",
};

export const queueNode = (queue: string) => `q-${queue}`;

/** A queue's consumer, as the compose stack names it. */
export const QUEUE_WORKER: Record<string, string> = {
  scans: "worker-scans",
  vapt: "worker-vapt",
  alerts: "worker-alerts",
  reports: "worker-reports",
  bus: "worker-bus",
  celery: "worker-bus",
  ai: "worker-ai",
  autofix: "worker-programme",
  continuous: "worker-programme",
  integrations: "worker-programme",
};

export type NodeLevel = "unknown" | "idle" | "active" | "busy" | "warn" | "error" | "dark";

export interface NodeState {
  level: NodeLevel;
  /** Short metric lines for the tooltip / rails. */
  metrics: string[];
  /** The last observed activity, colouring the node border on the map. */
  lastAt?: number;
}

export const LEVEL_COLOR: Record<NodeLevel, string> = {
  unknown: "#334155",
  idle: "#1f2937",
  active: "#22c55e",
  busy: "#38bdf8",
  warn: "#f59e0b",
  error: "#ef4444",
  dark: "#ef4444",
};

/**
 * Build the live state for every node the snapshot can speak to.
 *
 * Nodes that are not mentioned keep no entry, and the renderer draws them dim — which
 * is the same information as "reported" but not "handled by this payload".
 */
export function nodeStates(snapshot: Snapshot): Map<string, NodeState> {
  const out = new Map<string, NodeState>();
  const at = Date.now();
  const bump = (node: string, level: NodeLevel, metric?: string) => {
    const cur = out.get(node) ?? { level: "idle" as NodeLevel, metrics: [] };
    const order: NodeLevel[] = ["unknown", "idle", "active", "busy", "warn", "error"];
    if (order.indexOf(level) > order.indexOf(cur.level)) cur.level = level;
    if (metric) cur.metrics.push(metric);
    cur.lastAt = at;
    out.set(node, cur);
  };

  // ── engines: active work, and their error rate from the log rollup
  for (const e of snapshot.counters.engines ?? []) {
    const node = ENGINE_NODE[e.engineId];
    if (!node) continue;
    const active = e.totalActive ?? 0;
    bump(
      node,
      active > 0 ? (active >= 5 ? "busy" : "active") : "idle",
      `${active} active (${e.running ?? 0} run / ${e.queued ?? 0} queued)`,
    );
  }

  // ── queues: depth is the honest signal
  for (const [q, depth] of Object.entries(snapshot.counters.queues?.depths ?? {})) {
    const node = queueNode(q);
    const worker = QUEUE_WORKER[q];
    const level: NodeLevel = depth >= 200 ? "error" : depth >= 50 ? "warn" : depth > 0 ? "active" : "idle";
    bump(node, level, `depth ${depth}`);
    if (worker && depth > 0) bump(worker, depth >= 50 ? "warn" : "active", `${q} backlog ${depth}`);
  }

  // ── workers: celery inspects are deliberately skipped by the endpoint, so presence
  //    comes from the worker count and depth comes from the queues above
  if (snapshot.counters.celery?.available) {
    for (const w of snapshot.counters.celery.workers ?? []) {
      bump("worker-bus", "active", `online: ${w}`);
    }
  }

  // ── per-log-type error rate: the primary "look here" signal
  const flows = snapshot.counters.flows;
  for (const [logType, counts] of Object.entries(flows.byLogType ?? {})) {
    const node = LOG_TYPE_ENGINE[logType] ?? LOG_TYPE_ENGINE[logType.split(".")[0]];
    const errors = (counts.error ?? 0) + (counts.critical ?? 0);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const level: NodeLevel = errors > 0 ? "warn" : total > 0 ? "active" : "idle";
    if (node) {
      bump(node, level, errors > 0 ? `${errors} error/critical in window` : `${total} log lines`);
    } else if (errors > 0) {
      // no mapping: rank it, but do not pretend to place it
      bump(`unmapped:${logType}`, "warn", `${errors} errors (no node mapping)`);
    }
  }

  // ── platform event sources
  for (const [source, counts] of Object.entries(flows.byEventSource ?? {})) {
    const node = SOURCE_NODE[source];
    const errors = (counts.error ?? 0) + (counts.critical ?? 0);
    if (!node) continue;
    bump(node, errors > 0 ? "warn" : "active", `${Object.values(counts).reduce((a, b) => a + b, 0)} events`);
  }

  // ── pools and stores
  const pools = snapshot.counters.process.securityPools as
    | { activePools?: number; connections?: number; free?: number; maxSize?: number }
    | undefined;
  if (pools) {
    const level: NodeLevel = (pools.connections ?? 0) > 0 && (pools.free ?? 0) === 0 ? "warn" : "idle";
    bump(
      "security-db",
      level,
      `${pools.activePools ?? 0} pool(s) · ${pools.connections ?? 0} conn · ${pools.free ?? 0} free`,
    );
  }
  const dbPool = snapshot.counters.process.databasePool as
    | { checkedout?: number; size?: number; max_overflow?: number }
    | undefined;
  if (dbPool) {
    const cap = (dbPool.size ?? 0) + (dbPool.max_overflow ?? 0);
    const used = dbPool.checkedout ?? 0;
    bump("db", cap > 0 && used >= cap * 0.9 ? "warn" : "idle", `${used}/${cap} connections`);
  }

  // ── components the payload declares dark: present, and not handling anything
  for (const d of snapshot.dark ?? []) bump(d.id, "dark", d.reason);

  return out;
}

/** Where a ranked row points, so the page can highlight and scroll to it. */
export function rankedNode(ranked: { node?: string }): string | undefined {
  return ranked.node;
}
