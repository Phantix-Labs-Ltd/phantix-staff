import React, { useRef } from "react";
import { motion } from "framer-motion";
import { Building2, MessageSquare, Server, Wrench, Activity, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader, StatCard, AnimatedNumber, Card, CardHeader, TableSkeleton, SkeletonCard } from "@/components/ui";
import { useResource } from "@/lib/useResource";
import { useSmartPoll } from "@/lib/usePolling";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE } from "@/lib/api";
import type { AdminDashboardStats } from "@/lib/types";

const demoStats: AdminDashboardStats = {
  total_clients: 24, active_clients: 24, inactive_clients: 0,
  total_connections: 12, healthy_connections: 8,
  open_support_tickets: 3, critical_open_tickets: 1,
  experience_services_configured: 15,
  clients_by_industry: { technology: 13, fintech: 6, healthcare: 2 },
  tickets_by_status: { open: 1, in_progress: 1, resolved: 1 },
};

export default function Dashboard() {
  const { isAdmin } = useStore();

  const stats = useResource<AdminDashboardStats>(
    async (signal) => {
      if (DEMO_MODE) return demoStats;
      return api.get<AdminDashboardStats>("/admin/dashboard/stats");
    },
    {} as any,
  );

  const s = DEMO_MODE ? demoStats : stats.data;

  // Smart polling: keep platform stats fresh; slow when tab hidden.
  // 60s foreground / 5min hidden — the initial load is handled by useResource.
  const skipFirstPoll = useRef(true);
  useSmartPoll(async () => {
    if (DEMO_MODE) return;
    if (skipFirstPoll.current) { skipFirstPoll.current = false; return; }
    stats.refresh();
  }, { intervalMs: 60000, hiddenIntervalMs: 300000 });

  return (
    <div>
      <PageHeader
        title="Staff Dashboard"
        description={isAdmin ? "Platform operations overview: clients, connections and support" : "Support operations overview"}
      />

      {stats.loading ? (
        <TableSkeleton rows={2} />
      ) : s ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCard label="Total Clients" value={<AnimatedNumber value={s.total_clients} />} icon={<Building2 size={18} />} />
          <StatCard label="Active" value={<AnimatedNumber value={s.active_clients} />} icon={<CheckCircle2 size={18} />} />
          <StatCard label="Connections" value={<>{s.healthy_connections}<span className="text-sm text-slate-500">/{s.total_connections}</span></>} icon={<Server size={18} />} />
          <StatCard label="Open Tickets" value={<AnimatedNumber value={s.open_support_tickets} />} icon={<MessageSquare size={18} />} />
        </motion.div>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Platform Health" subtitle="Connections, services, and infrastructure" />
          {s ? (
            <div className="space-y-2">
              <div className="flex justify-between rounded-lg bg-phantix-800/40 px-3 py-2 text-sm">
                <span className="text-slate-400">DB Connections</span>
                <span className="font-mono text-emerald-400">{s.healthy_connections}<span className="text-slate-500"> / {s.total_connections}</span> healthy</span>
              </div>
              <div className="flex justify-between rounded-lg bg-phantix-800/40 px-3 py-2 text-sm">
                <span className="text-slate-400">Experience Services</span>
                <span className="font-mono text-white">{s.experience_services_configured} configured</span>
              </div>
              <div className="flex justify-between rounded-lg bg-phantix-800/40 px-3 py-2 text-sm">
                <span className="text-slate-400">Active Clients</span>
                <span className="font-mono text-white">{s.active_clients}<span className="text-slate-500"> / {s.total_clients}</span></span>
              </div>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Support Overview"
            subtitle="Ticket queue and priorities"
            action={<Link to="/support" className="text-xs text-gold-400 hover:text-gold-300">View tickets</Link>}
          />
          {s ? (
            <div className="space-y-2">
              <div className="flex justify-between rounded-lg bg-phantix-800/40 px-3 py-2 text-sm">
                <span className="text-slate-400">Open Tickets</span>
                <Link to="/support" className="font-mono text-gold-400 hover:text-gold-300">{s.open_support_tickets}</Link>
              </div>
              {s.critical_open_tickets > 0 && (
                <div className="flex justify-between rounded-lg bg-severity-critical/5 border border-severity-critical/20 px-3 py-2 text-sm">
                  <span className="flex items-center gap-1 text-severity-critical"><AlertTriangle size={14} /> Critical</span>
                  <span className="font-mono text-severity-critical">{s.critical_open_tickets}</span>
                </div>
              )}
              {Object.entries(s.tickets_by_status ?? {}).length > 0 && (
                <div className="pt-2">
                  <p className="text-xs text-slate-400 mb-1.5">By Status</p>
                  {Object.entries(s.tickets_by_status ?? {}).map(([status, count]) => (
                    <div key={status} className="flex justify-between text-xs px-2 py-1">
                      <span className="text-slate-400 capitalize">{status.replace(/_/g, " ")}</span>
                      <span className="font-mono text-slate-300">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </Card>
      </div>

      {/* Audit chain integrity (§10) — intact, or an unmissable broken state. */}
      <AuditChainCard />
    </div>
  );
}

// ── Audit chain verification (staging-rollout §10) ───────────────────────────
// GET /api/v1/admin/audit/verify-chain (staff JWT). Returns one rolled-up
// platform state; the org-scoped /audit/verify-chain rejects staff tokens.
// Response shape may use intact|valid|ok|verified with
// first_bad_sequence|first_bad|broken_sequence — normalise defensively so an
// intact/broken state always renders.
type AuditVerify = {
  intact?: boolean;
  valid?: boolean;
  ok?: boolean;
  verified?: boolean;
  first_bad_sequence?: string | number | null;
  first_bad?: string | number | null;
  broken_sequence?: string | number | null;
  first_tampered_event_uid?: string | null;
  first_bad_reason?: "content" | "link" | string | null;
  content_mismatches?: number;
  link_mismatches?: number;
};

function AuditChainCard() {
  const verify = useResource<AuditVerify>(
    async () => {
      if (DEMO_MODE) return { intact: true } as AuditVerify;
      return api.get<AuditVerify>("/admin/audit/verify-chain") ?? {};
    },
    {} as AuditVerify,
    "audit-verify-chain",
  );
  const skipFirstPoll = useRef(true);
  useSmartPoll(() => {
    if (skipFirstPoll.current) { skipFirstPoll.current = false; return; }
    verify.refresh();
  }, { intervalMs: 60000, hiddenIntervalMs: 300000 });

  const d = verify.data;
  if (verify.loading && (!d || Object.keys(d).length === 0)) {
    return <SkeletonCard className="mt-6" />;
  }
  // Role/permission gaps or transient failures must not alarm the whole staff.
  if (verify.error || !d || Object.keys(d).length === 0) return null;

  const intact =
    d.intact ?? d.valid ?? d.ok ?? d.verified;
  const firstBad =
    d.first_bad_sequence ?? d.first_bad ?? d.broken_sequence ?? d.first_tampered_event_uid ?? null;
  const reason = d.first_bad_reason ?? null;

  if (intact === true) {
    return (
      <Card className="mt-6 border-emerald-400/20">
        <CardHeader
          title="Audit chain intact"
          subtitle="Hash-chained audit trail verified against the last sealed entry"
          action={
            <button type="button" onClick={verify.refresh} className="btn-ghost !px-2 !py-1 text-xs">
              <RefreshCw size={12} className="mr-1 inline" /> Recheck
            </button>
          }
        />
      </Card>
    );
  }

  if (intact === false) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mt-6 rounded-xl border-2 border-severity-critical/60 bg-severity-critical/10 p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-severity-critical text-white">
              <AlertTriangle size={19} />
            </span>
            <div>
              <p className="font-display text-base font-bold text-severity-critical">Audit chain BROKEN</p>
              <p className="mt-1 max-w-xl text-sm leading-6 text-slate-300">
                The audit trail failed hash-chain verification. Treat this as a security incident. Do not continue
                writing audit entries until it is investigated.
              </p>
              {firstBad != null && (
                <p className="mt-2 font-mono text-xs text-severity-critical">first bad sequence: {String(firstBad)}</p>
              )}
              {reason != null && (
                <p className="mt-1 max-w-xl text-xs text-slate-400">
                  {reason === "link"
                    ? "reason: linkage fork. The event is self-consistent, but it chains to a different predecessor than the row before it (typically concurrent writes)."
                    : reason === "content"
                      ? "reason: content mismatch. The stored fields of the event no longer match its hash, which can indicate tampering."
                      : `reason: ${String(reason)}`}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={verify.refresh} className="btn-primary !py-2 text-xs">
            <RefreshCw size={13} className="mr-1.5 inline" /> Re-verify
          </button>
        </div>
      </motion.div>
    );
  }

  return null;
}
