import React, { useCallback, useEffect, useState } from "react";
import { Activity, Bot, KeyRound, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { PageHeader, Card, TableCardSkeleton, EmptyState, Pagination } from "@/components/ui";
import {
  isDenied,
  loadAgentActivity,
  type AgentAction,
} from "@/lib/agentActivity";
import { cx, timeAgo, formatDateTime } from "@/lib/utils";

// ── Agent activity (staff) ───────────────────────────────────────────────────
// The agent acts as the signed-in user and never inherits authority. This is the
// cross-organization view of every action it took — including the ones it was
// refused — with the run, domain, operator intent and authorization. It exists so
// support can answer "did the agent do the right thing, within that user's
// permissions?" from the platform, not by querying a customer database.

const PAGE_SIZE = 50;

const DOMAIN_LABEL: Record<string, string> = {
  cross: "Chief",
  threat_model: "Threat modelling",
  soc: "SOC",
  grc: "GRC",
  vapt: "VAPT",
  ti: "Threat intel",
  asset: "Asset",
  code: "Code",
  verify: "Verification",
  consultant: "Consultant",
};

function domainLabel(domain?: string | null): string {
  if (!domain) return "Not set";
  return DOMAIN_LABEL[domain] ?? domain.replace(/_/g, " ");
}

export default function AgentActivityAdmin() {
  const [items, setItems] = useState<AgentAction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orgId, setOrgId] = useState("");
  const [status, setStatus] = useState("all");
  const [domain, setDomain] = useState("all");
  const [tool, setTool] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await loadAgentActivity({
        organization_id: orgId.trim() ? Number(orgId.trim()) : undefined,
        status: status === "all" ? undefined : status,
        domain: domain === "all" ? undefined : domain,
        tool: tool.trim() || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setItems(Array.isArray(res.items) ? res.items : []);
      setTotal(Number(res.total ?? 0));
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "Could not load agent activity");
    } finally {
      setLoading(false);
    }
  }, [orgId, status, domain, tool, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = window.setInterval(() => setReloadKey((k) => k + 1), 30000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => { if (reloadKey !== 0) void load(); }, [reloadKey, load]);

  const deniedCount = items.filter(isDenied).length;

  return (
    <div>
      <PageHeader
        title="Agent activity"
        description="Every action the agent took across organizations: run, domain, operator intent, authorization and outcome."
        actions={
          <button className="btn-ghost" onClick={() => void load()} title="Refresh">
            <RefreshCw size={15} className={cx(loading && "animate-spin")} />
          </button>
        }
      />

      <div className="mb-4 flex items-start gap-2.5 rounded-md border border-gold-400/25 bg-gold-400/[0.06] p-3">
        <KeyRound size={14} className="mt-0.5 shrink-0 text-gold-300" />
        <p className="text-[13px] leading-5 text-gold-100/90">
          The agent runs <span className="font-semibold">as the signed-in user</span> and can do only what that
          user's role allows. State-changing actions need a fresh, single-use authorization bound to one action on
          one run. A <span className="font-semibold">denied</span> row is a control holding. Quote it in support
          replies rather than treating it as an error.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={orgId}
          onChange={(e) => { setOrgId(e.target.value.replace(/\D/g, "")); setPage(0); }}
          placeholder="Organization id"
          className="w-40 rounded-lg border border-phantix-700/50 bg-phantix-950/70 px-3 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-gold-400/50"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0); }}
          className="rounded-lg border border-phantix-700/50 bg-phantix-950/70 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-gold-400/50"
        >
          <option value="all">All outcomes</option>
          <option value="completed">Completed</option>
          <option value="failed">Denied / failed</option>
        </select>
        <select
          value={domain}
          onChange={(e) => { setDomain(e.target.value); setPage(0); }}
          className="rounded-lg border border-phantix-700/50 bg-phantix-950/70 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-gold-400/50"
        >
          <option value="all">All domains</option>
          {Object.keys(DOMAIN_LABEL).map((d) => (
            <option key={d} value={d}>{domainLabel(d)}</option>
          ))}
        </select>
        <input
          value={tool}
          onChange={(e) => { setTool(e.target.value); setPage(0); }}
          placeholder="Tool (e.g. threat_model.generate)"
          className="w-64 rounded-lg border border-phantix-700/50 bg-phantix-950/70 px-3 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-gold-400/50"
        />
        <span className="ml-auto text-[13px] text-slate-500">
          {total.toLocaleString()} actions · {deniedCount} denied on this page
        </span>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-severity-critical/30 bg-severity-critical/10 px-4 py-3">
          <p className="text-sm text-red-300">Could not load agent activity: {error}</p>
          <button onClick={() => void load()} className="btn-ghost text-xs">Retry</button>
        </div>
      )}

      {loading && !items.length ? (
        <TableCardSkeleton rows={8} cols={7} title={false} />
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon={<Activity size={22} />}
            title="No agent actions"
            body="When an organization's agent runs, every action it takes, and every action it was refused, appears here."
          />
        </Card>
      ) : (
        <>
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">When</th>
                    <th className="th">Org</th>
                    <th className="th">Domain</th>
                    <th className="th">Action</th>
                    <th className="th">Operator intent</th>
                    <th className="th">Asked by</th>
                    <th className="th">Authorized</th>
                    <th className="th">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => {
                    const denied = isDenied(row);
                    return (
                      <React.Fragment key={row.id}>
                        <tr
                          className="h-10 cursor-pointer border-b border-phantix-800/40 hover:bg-phantix-800/35"
                          onClick={() => setOpen(open === row.id ? null : row.id)}
                        >
                          <td className="td whitespace-nowrap text-[13px] text-slate-400" title={row.created_at ? formatDateTime(row.created_at) : ""}>
                            {timeAgo(row.created_at ?? null)}
                            {row.run_id && <span className="ml-1.5 font-mono text-[11px] text-slate-600">{String(row.run_id).slice(0, 8)}</span>}
                          </td>
                          <td className="td font-mono text-[13px] text-slate-300">#{row.organization_id}</td>
                          <td className="td"><span className="chip border-phantix-700 text-slate-300">{domainLabel(row.domain)}</span></td>
                          <td className="td">
                            <p className="flex items-center gap-1.5 font-mono text-[13px] text-slate-200">
                              <Bot size={11} className="text-gold-400" />
                              {row.tool ?? "Not set"}
                            </p>
                          </td>
                          <td className="td max-w-[340px] text-[13px] text-slate-400">
                            <span className="block truncate" title={row.intent || undefined}>{row.intent || <span className="text-slate-600">Not set</span>}</span>
                          </td>
                          <td className="td">
                            {row.actor_name || row.actor_email || row.actor_user_id ? (
                              <span className="whitespace-nowrap text-[13px] text-slate-300">
                                {row.actor_name || row.actor_email || `user #${row.actor_user_id}`}
                                {row.actor_role && <span className="ml-1.5 capitalize text-slate-500">{row.actor_role}</span>}
                              </span>
                            ) : (
                              <span className="text-[13px] text-slate-600" title="A company key or service call, with no named user">org-level</span>
                            )}
                          </td>
                          <td className="td">
                            {row.authorized === true ? (
                              <span className="chip border-emerald-400/30 text-emerald-300"><KeyRound size={10} className="mr-1 inline" />authorized</span>
                            ) : row.authorized === false ? (
                              <span className="chip border-phantix-700 text-slate-500">not required or none</span>
                            ) : (
                              <span className="text-[13px] text-slate-600">Not set</span>
                            )}
                          </td>
                          <td className="td">
                            <span
                              className={cx(
                                "chip",
                                denied
                                  ? "border-severity-medium/30 bg-severity-medium/10 text-severity-medium"
                                  : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
                              )}
                              title={row.error || undefined}
                            >
                              {denied ? <XCircle size={10} className="mr-1 inline" /> : <ShieldCheck size={10} className="mr-1 inline" />}
                              {denied ? "denied" : "done"}
                            </span>
                          </td>
                        </tr>
                        {open === row.id && (
                          <tr className="border-b border-phantix-800/40 bg-phantix-900/40">
                            <td colSpan={8} className="px-4 py-3">
                              <div className="space-y-1.5">
                                {row.params && (
                                  <p className="text-[13px] text-slate-400">
                                    <span className="text-slate-600">params:</span>{" "}
                                    <span className="font-mono text-slate-300">{row.params}</span>
                                  </p>
                                )}
                                {row.error && (
                                  <p className="text-[13px] text-severity-medium">
                                    <span className="text-slate-600">reason:</span> {row.error}
                                  </p>
                                )}
                                {(row.context?.length ?? 0) > 0 && (
                                  <p className="break-all font-mono text-[12px] leading-4 text-slate-600">
                                    {(row.context ?? []).join(" · ")}
                                  </p>
                                )}
                                <p className="font-mono text-[12px] text-slate-600">
                                  evidence {row.evidence_hash?.slice(0, 16) ?? "Not set"} · response {row.response_hash?.slice(0, 16) ?? "Not set"}
                                </p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Pagination
            page={page + 1}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={(p) => setPage(Math.max(0, p - 1))}
            itemLabel="actions"
          />
        </>
      )}

      <p className="mt-5 text-xs text-slate-500">
        Agent actions live in the platform audit store (<span className="font-mono">ai_audit_logs</span>);
        sensitive parameters are redacted before the row is written.
      </p>
    </div>
  );
}
