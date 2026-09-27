import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity, AlertTriangle, Boxes, CheckCircle2, Clock, Database, HelpCircle,
  RefreshCw, Radio, Server, ShieldCheck,
} from "lucide-react";
import {
  Card, CardHeader, CollapsibleCard, EmptyState, PageHeader, StatCard,
  StatusBadge, TableSkeleton,
} from "@/components/ui";
import { useResource } from "@/lib/useResource";
import { useSmartPoll } from "@/lib/usePolling";
import { cx, timeAgo } from "@/lib/utils";
import {
  getServicesHealth, reprobeServicesHealth, SERVICE_GROUPS, serviceLabel,
  type HealthCheck, type ServicesHealth,
} from "@/lib/health";

const EMPTY: ServicesHealth = {
  status: "unknown",
  environment: "",
  timestamp: "",
  services: {},
};

/** Colour the overall banner the same way the badges colour a single row. */
function overallCopy(status: string): { headline: string; tone: string; icon: React.ReactNode } {
  if (status === "ok") {
    return {
      headline: "All services responding",
      tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
      icon: <CheckCircle2 size={18} />,
    };
  }
  if (status === "degraded") {
    return {
      headline: "Degraded — a non-critical service needs attention",
      tone: "border-severity-medium/30 bg-severity-medium/10 text-severity-medium",
      icon: <AlertTriangle size={18} />,
    };
  }
  if (status === "error") {
    return {
      headline: "Down — a required service is not responding",
      tone: "border-severity-critical/30 bg-severity-critical/10 text-severity-critical",
      icon: <AlertTriangle size={18} />,
    };
  }
  return {
    headline: "Unknown — no health report yet",
    tone: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    icon: <HelpCircle size={18} />,
  };
}

export default function ServicesHealth() {
  const { data, loading, error, setData } = useResource<ServicesHealth>(
    () => getServicesHealth(),
    EMPTY,
    "admin:health:services",
  );
  const [reprobing, setReprobing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  // Keep the rows live without hammering the endpoint: the backend already
  // caches its Celery probe, so a slow poll is enough to catch a service dying.
  useSmartPoll(
    async () => {
      setData(await getServicesHealth());
    },
    { intervalMs: 30_000, paused: loading || reprobing },
  );

  const services = data.services || {};
  const entries = useMemo(() => Object.entries(services), [services]);
  const counts = useMemo(
    () => ({
      total: entries.length,
      ok: entries.filter(([, s]) => s.status === "ok").length,
      unknown: entries.filter(([, s]) => s.status === "unknown").length,
      down: entries.filter(([, s]) => s.status !== "ok" && s.status !== "unknown").length,
    }),
    [entries],
  );

  const grouped = useMemo(() => {
    const seen = new Set<string>();
    const groups = SERVICE_GROUPS.map((group) => {
      const rows = group.services
        .filter((key) => services[key])
        .map((key) => [key, services[key]] as const);
      rows.forEach(([key]) => seen.add(key));
      return { ...group, rows };
    }).filter((group) => group.rows.length > 0);
    const leftovers = entries.filter(([key]) => !seen.has(key));
    if (leftovers.length) {
      groups.push({
        title: "Other",
        blurb: "Services this build reports that the portal does not group yet.",
        services: leftovers.map(([key]) => key),
        rows: leftovers,
      });
    }
    return groups;
  }, [entries, services]);

  const agi = (data.checks?.agi_runner || {}) as HealthCheck;
  const sandboxPresent = agi.sandbox_image_present === true;
  const sandboxImage = typeof agi.default_image === "string" ? agi.default_image : "—";
  const dockerOk = agi.docker === true;
  const deepseekOk = agi.deepseek_configured === true;
  const sessions = typeof agi.sessions === "number" ? agi.sessions : null;
  const checks = useMemo(
    () => Object.values(data.checks || {}).sort((a, b) => a.name.localeCompare(b.name)),
    [data.checks],
  );

  const overall = overallCopy(data.status);

  async function handleReprobe() {
    if (reprobing) return;
    setReprobing(true);
    setProbeError(null);
    try {
      // The backend schedules the ~30s probe and answers at once, so poll until
      // it finishes rather than holding the request open past the proxy timeout.
      let next = await reprobeServicesHealth();
      setData(next);
      for (let i = 0; i < 15 && next.probing; i++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        next = await getServicesHealth();
        setData(next);
      }
    } catch (e) {
      setProbeError(e instanceof Error ? e.message : "Could not re-probe the workers.");
    } finally {
      setReprobing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Service Health"
        description="One row per deployable service — API, each worker queue set, beat, the alert daemon and the pentest runner — so a queue nobody drains cannot hide behind a healthy total."
        actions={
          <>
            <button
              onClick={handleReprobe}
              disabled={reprobing}
              className="btn-ghost text-sm px-3 py-1.5 disabled:opacity-60"
              title="Re-run the worker probe, then reload"
            >
              <RefreshCw size={14} className={cx(reprobing && "animate-spin")} />
              {reprobing ? "Probing…" : "Re-probe"}
            </button>
          </>
        }
      />

      {error && !entries.length ? (
        <Card>
          <EmptyState
            icon={<AlertTriangle size={22} />}
            title="Could not load service health"
            body={error}
          />
        </Card>
      ) : loading && !entries.length ? (
        <Card>
          <TableSkeleton rows={8} cols={3} />
        </Card>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className={cx(
              "mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3",
              overall.tone,
            )}
          >
            {overall.icon}
            <span className="text-sm font-medium">{overall.headline}</span>
            {data.probing && (
              <span className="ml-auto flex items-center gap-1.5 text-xs text-severity-medium">
                <RefreshCw size={12} className="animate-spin" />
                probing workers…
              </span>
            )}
            <span className={cx("flex items-center gap-3 text-xs text-slate-400", !data.probing && "ml-auto")}>
              {data.environment && <span className="chip">{data.environment}</span>}
              {data.timestamp && (
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {timeAgo(data.timestamp)}
                </span>
              )}
            </span>
          </motion.div>

          {probeError && (
            <div className="mb-4 rounded-lg border border-severity-critical/30 bg-severity-critical/10 px-4 py-2.5 text-sm text-severity-critical">
              {probeError}
            </div>
          )}

          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Services" value={counts.total} icon={<Server size={18} />} />
            <StatCard label="Healthy" value={counts.ok} icon={<CheckCircle2 size={18} />} />
            <StatCard label="Awaiting probe" value={counts.unknown} icon={<HelpCircle size={18} />} />
            <StatCard label="Not responding" value={counts.down} icon={<AlertTriangle size={18} />} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {grouped.map((group) => (
              <Card key={group.title} className="!p-0 overflow-hidden">
                <div className="border-b border-phantix-700/50 px-5 py-3.5">
                  <h3 className="font-display text-[15px] font-semibold text-slate-100">{group.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-400">{group.blurb}</p>
                </div>
                <div className="divide-y divide-phantix-700/40">
                  {group.rows.map(([key, svc]) => (
                    <div key={key} className="flex items-start justify-between gap-3 px-5 py-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span
                          className={cx(
                            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                            svc.status === "ok"
                              ? "bg-emerald-400"
                              : svc.status === "unknown"
                                ? "bg-severity-medium"
                                : "bg-severity-critical",
                          )}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-200">{serviceLabel(key)}</p>
                          <p className="font-mono text-[11px] text-slate-500">{key}</p>
                          {svc.detail && <p className="mt-0.5 text-xs text-slate-400">{svc.detail}</p>}
                        </div>
                      </div>
                      <StatusBadge status={svc.status} />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          <Card className="mt-4">
            <CardHeader
              title="Pentest sandbox"
              subtitle="The runner executes every tool inside this image — if it is missing, no container can spawn."
              action={
                <button onClick={handleReprobe} disabled={reprobing} className="btn-ghost text-xs px-2.5 py-1.5 disabled:opacity-60">
                  <RefreshCw size={12} className={cx(reprobing && "animate-spin")} />
                  Refresh
                </button>
              }
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SandboxFact
                label="Image present"
                value={sandboxPresent ? "Yes" : "No"}
                good={sandboxPresent}
                icon={<Boxes size={16} />}
              />
              <SandboxFact label="Image" value={sandboxImage} mono />
              <SandboxFact
                label="Docker socket"
                value={dockerOk ? "Reachable" : "Unavailable"}
                good={dockerOk}
                icon={<ShieldCheck size={16} />}
              />
              <SandboxFact
                label="Sessions"
                value={sessions === null ? "—" : String(sessions)}
                icon={<Activity size={16} />}
              />
            </div>
            {!sandboxPresent && (
              <p className="mt-3 rounded-lg border border-severity-critical/30 bg-severity-critical/10 px-3 py-2 text-xs text-severity-critical">
                The sandbox image is not on this host. The deploy stack rebuilds it and keeps a
                keeper container, so a redeploy restores it; tool calls will fail until then.
                {!deepseekOk && " The AI key also looks unconfigured, so sessions cannot start."}
              </p>
            )}
          </Card>

          <CollapsibleCard
            className="mt-4"
            title="All checks"
            subtitle={`${checks.length} probe${checks.length === 1 ? "" : "s"} behind the summary${
              data.summary?.security_schema_version
                ? ` · security schema ${data.summary.security_schema_version}`
                : ""
            }`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-phantix-700/60 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2 font-medium">Check</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Detail</th>
                    <th className="px-3 py-2 text-right font-medium">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={c.name} className="border-b border-phantix-700/30 last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-slate-300">{c.name}</span>
                        {c.optional && <span className="ml-2 text-[10px] text-slate-500">optional</span>}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">{c.detail || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-500">
                        {typeof c.latency_ms === "number" ? `${Math.round(c.latency_ms)} ms` : "—"}
                      </td>
                    </tr>
                  ))}
                  {!checks.length && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-xs text-slate-500">
                        No checks reported.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CollapsibleCard>

          <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Database size={12} />
            {data.summary?.endpoints_total
              ? `${data.summary.endpoints_total} endpoints · ${data.summary.modules_registered ?? 0} modules · ${data.summary.engines_total ?? 0} engines`
              : "Backed by GET /api/v1/admin/health/services"}
            <Radio size={12} className="ml-2" />
            Worker rows come from Celery's own active-queue inspection.
          </p>
        </>
      )}
    </div>
  );
}

function SandboxFact({
  label,
  value,
  good,
  icon,
  mono,
}: {
  label: string;
  value: string;
  good?: boolean;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg bg-phantix-800/40 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </p>
      <p
        className={cx(
          "mt-1 text-sm font-semibold",
          mono && "font-mono text-xs",
          good === undefined ? "text-slate-200" : good ? "text-emerald-400" : "text-severity-critical",
        )}
      >
        {value}
      </p>
    </div>
  );
}
