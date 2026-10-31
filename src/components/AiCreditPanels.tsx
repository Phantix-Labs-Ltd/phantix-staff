import { useCallback, useEffect, useState } from "react";
import { Cpu, RefreshCw } from "lucide-react";
import { CollapsibleCard, EmptyState, ErrorState, TableSkeleton } from "@/components/ui";
import {
  currentMonth, fetchAiCreditsReport, formatAiNgn, formatCredits, formatUsd,
  type AiCreditsReport, type CreditMeteringMap, type ProviderUsage,
} from "@/lib/billingMetering";
import { cx } from "@/lib/utils";

// Billing → Pricing: what each provider costs in credits, and what every
// organization actually spent, by provider, from the credit ledger.

const ROLE_TONE: Record<string, string> = {
  primary: "border-emerald-400/30 bg-emerald-400/10 text-emerald-400",
  fallback: "border-sky-400/30 bg-sky-400/10 text-sky-300",
};

/** Prices per provider: USD, NGN and credits per 1M blended tokens. */
export function MeteringCard({ metering }: { metering: CreditMeteringMap }) {
  const sec = metering.security_providers;
  const fallbacks = sec?.fallback_models?.length ? sec.fallback_models : [sec?.fallback_model].filter(Boolean);
  const plan = metering.plan_credits_mo ?? {};
  return (
    <CollapsibleCard
      defaultOpen={false}
      title="AI credit metering"
      subtitle={`1 credit = ₦${metering.credit_ngn.toFixed(2)} ($${metering.credit_usd}) · Starter ${formatCredits(plan.starter)} and Growth ${formatCredits(plan.growth)} credits a month`}
    >
      <p className="mb-3 text-xs leading-5 text-slate-400">{metering.metering_note}</p>
      <p className="mb-3 text-[13px] text-slate-300">
        <span className="text-slate-500">Security work runs on </span>
        <span className="font-mono text-xs text-slate-100">{sec?.primary_model || "Not set"}</span>
        {fallbacks.length > 0 && (
          <>
            <span className="text-slate-500">, falling back to </span>
            <span className="font-mono text-xs text-slate-100">{fallbacks.join(", then ")}</span>
          </>
        )}
        <span className="text-slate-500">. Customers {sec?.user_choice ? "can" : "cannot"} pick the provider there.</span>
      </p>
      {metering.providers?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-phantix-700/40 text-left text-[13px] text-slate-300">
                <th className="th">Provider</th>
                <th className="th">Model</th>
                <th className="th text-right">USD / 1M tokens</th>
                <th className="th text-right">NGN / 1M tokens</th>
                <th className="th text-right">Credits / 1M tokens</th>
                <th className="th text-right">vs DeepSeek Flash</th>
              </tr>
            </thead>
            <tbody>
              {metering.providers.map((p) => (
                <tr key={p.model} className="border-b border-phantix-800/40">
                  <td className="td text-[13px] text-slate-200">
                    {p.provider_label}
                    {p.security_role && (
                      <span className={cx("chip ml-2 capitalize", ROLE_TONE[p.security_role])}>Security {p.security_role}</span>
                    )}
                  </td>
                  <td className="td font-mono text-xs text-slate-400">{p.model}</td>
                  <td className="td text-right font-mono text-xs text-slate-300">${p.usd_per_1m.toFixed(2)}</td>
                  <td className="td text-right font-mono text-xs text-slate-300">{formatAiNgn(p.ngn_per_1m)}</td>
                  <td className="td text-right font-mono text-xs text-gold-300">{p.credits_per_1m.toLocaleString()}</td>
                  <td className="td text-right font-mono text-xs text-slate-400">×{p.multiplier_vs_deepseek_flash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[13px] text-slate-500">The API did not return provider prices.</p>
      )}
    </CollapsibleCard>
  );
}

function share(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function ProviderChips({ rows }: { rows: ProviderUsage[] }) {
  if (!rows.length) return <span className="text-slate-500">No AI use</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {rows.map((p) => (
        <span key={p.provider} className="chip border-phantix-600/50 bg-phantix-800/60 text-slate-300">
          {p.label} <span className="font-mono text-gold-300">{p.credits.toLocaleString()}</span>
        </span>
      ))}
    </span>
  );
}

/** Credits every organization used this month, split by provider. */
export function CreditsAcrossOrgsCard() {
  const [month, setMonth] = useState(currentMonth);
  const [report, setReport] = useState<AiCreditsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchAiCreditsReport(month));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load AI credit usage.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const t = report?.totals;
  return (
    <CollapsibleCard
      defaultOpen
      title="AI credits across organizations"
      subtitle="Credits charged per provider and per organization, from the credit ledger"
      action={<Cpu size={15} className="text-gold-400" />}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[13px] text-slate-400">
          Month
          <input
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="input !w-auto !py-1.5 !text-xs"
          />
        </label>
        <button onClick={() => void load()} className="btn-ghost px-2.5 py-1.5 text-sm" title="Refresh" aria-label="Refresh AI credit usage">
          <RefreshCw size={14} className={cx(loading && "animate-spin")} />
        </button>
      </div>

      {loading && !report ? (
        <TableSkeleton rows={4} cols={5} />
      ) : error ? (
        <ErrorState body={error} onRetry={() => void load()} />
      ) : report && t ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label="Credits used" value={t.credits_used.toLocaleString()} tone="text-gold-300" />
            <Tile label="Provider cost" value={formatAiNgn(Math.round(t.ngn))} sub={formatUsd(t.usd)} />
            <Tile label="AI calls" value={t.calls.toLocaleString()} sub={`${t.tokens.toLocaleString()} tokens`} />
            <Tile label="Orgs using AI" value={t.organizations_using_ai.toLocaleString()} />
            <Tile label="Credits left (all orgs)" value={t.balance.toLocaleString()} />
          </div>

          <div>
            <p className="mb-2 text-[12px] uppercase tracking-wide text-slate-500">By provider</p>
            {report.providers.length === 0 ? (
              <p className="text-[13px] text-slate-500">No AI credits were charged in {report.month}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-phantix-700/40 text-left text-[13px] text-slate-300">
                      <th className="th">Provider</th>
                      <th className="th text-right">Credits</th>
                      <th className="th w-[22%]">Share</th>
                      <th className="th text-right">Calls</th>
                      <th className="th text-right">Tokens</th>
                      <th className="th text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.providers.map((p) => (
                      <tr key={p.provider} className="border-b border-phantix-800/40">
                        <td className="td text-[13px] text-slate-200">{p.label}</td>
                        <td className="td text-right font-mono text-xs text-gold-300">{p.credits.toLocaleString()}</td>
                        <td className="td">
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-phantix-800">
                              <span className="block h-full rounded-full bg-gold-400" style={{ width: `${share(p.credits, t.credits_used)}%` }} />
                            </span>
                            <span className="w-9 text-right font-mono text-[11px] text-slate-400">{share(p.credits, t.credits_used)}%</span>
                          </span>
                        </td>
                        <td className="td text-right font-mono text-xs text-slate-400">{p.calls.toLocaleString()}</td>
                        <td className="td text-right font-mono text-xs text-slate-400">{p.tokens ? p.tokens.toLocaleString() : "Not recorded"}</td>
                        <td className="td text-right font-mono text-xs text-slate-300">{formatUsd(p.usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-[12px] uppercase tracking-wide text-slate-500">By organization</p>
            {report.organizations.length === 0 ? (
              <EmptyState icon={<Cpu size={22} />} title="No organizations hold AI credits yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-phantix-700/40 text-left text-[13px] text-slate-300">
                      <th className="th">Organization</th>
                      <th className="th">Plan</th>
                      <th className="th text-right">Allowance this month</th>
                      <th className="th text-right">Used</th>
                      <th className="th">Providers</th>
                      <th className="th text-right">Cost</th>
                      <th className="th text-right">Credits left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.organizations.map((o) => (
                      <tr key={o.organization_id} className="border-b border-phantix-800/40 align-top">
                        <td className="td text-[13px] text-slate-200">
                          {o.name || "Unknown"} <span className="font-mono text-[11px] text-slate-500">#{o.organization_id}</span>
                        </td>
                        <td className="td text-[13px] capitalize text-slate-400">{o.plan || "Free"}</td>
                        <td className="td text-right font-mono text-xs text-slate-400">{o.allowance_granted ? o.allowance_granted.toLocaleString() : "None"}</td>
                        <td className="td text-right font-mono text-xs text-gold-300">{o.credits_used.toLocaleString()}</td>
                        <td className="td text-xs"><ProviderChips rows={o.providers} /></td>
                        <td className="td text-right font-mono text-xs text-slate-300">{formatUsd(o.usd)}</td>
                        <td
                          className="td text-right font-mono text-xs text-slate-200"
                          title={`Allowance ${o.buckets.allowance ?? 0} · allotment ${o.buckets.allotment ?? 0} · top-ups ${o.buckets.topup ?? 0}`}
                        >
                          {o.balance.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-[12px] leading-5 text-slate-500">
            Used counts the credits charged in {report.month}. A lapsed monthly allowance is not usage. Cost is the provider price of
            the tokens behind those credits; charges made before models were recorded show as "Not recorded" and are costed at
            ${report.credit_usd} a credit.
          </p>
        </div>
      ) : null}
    </CollapsibleCard>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-phantix-700/40 bg-phantix-900/40 px-3 py-2.5">
      <p className="text-[12px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx("mt-1 font-mono text-xl", tone ?? "text-slate-100")}>{value}</p>
      {sub && <p className="mt-0.5 font-mono text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}
