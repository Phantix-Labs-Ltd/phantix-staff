import React, { useState } from "react";
import { BarChart3, DollarSign, RefreshCw, AlertTriangle, CreditCard, Ticket, Copy, XCircle, CheckCircle2, ToggleLeft, ToggleRight } from "lucide-react";
import { PageHeader, Card, CardHeader, CollapsibleCard, StatCard, TableSkeleton, Modal, Tabs, EmptyState } from "@/components/ui";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE, API_BASE } from "@/lib/api";
import { formatNaira, timeAgo, cx } from "@/lib/utils";
import type { BillingSettings, PricingPreview } from "@/lib/types";
import {
  type CreditMeteringMap,
  formatAiNgn,
  formatCredits,
  FX_NGN_PER_USD,
} from "@/lib/billingMetering";

interface GatewayStatus { configured: boolean; test_mode: boolean; public_key_prefix: string; secret_key_configured: boolean; callback_url: string; environment: string; }
interface CouponItem { id: number; label: string; code: string; duration_days: number; max_redemptions: number | null; redemption_count: number; remaining_redemptions: number | null; is_active: boolean; notes: string | null; created_at: string; }
interface RedemptionItem { id: number; organization_id: number; coupon_id: number; code_snapshot: string; redeemed_at: string; access_ends_at: string; status: string; }

const demoBilling: BillingSettings = {
  monthly_price_ngn: 9900,
  yearly_price_ngn: 99000,
  currency: "NGN",
  first_month_discount_percent: 50,
  yearly_month_equivalent: 10,
  plan_prices_ngn: { free: 0, starter: 9900, growth: 19900, enterprise: null },
  tiers: [
    { key: "free", list_price_ngn: 0, yearly_price_ngn: null, sales_motion: "self_serve" },
    { key: "starter", list_price_ngn: 9900, yearly_price_ngn: 99000, sales_motion: "self_serve" },
    { key: "growth", list_price_ngn: 19900, yearly_price_ngn: 199000, sales_motion: "self_serve" },
    { key: "enterprise", list_price_ngn: null, yearly_price_ngn: null, sales_motion: "quote" },
  ],
  is_active: true,
  updated_at: "2026-07-01T00:00:00Z",
};
const demoPricing: PricingPreview = {
  monthly: 9900,
  yearly: 99000,
  yearly_monthly_eq: 8250,
  savings_percent: 17,
  monthly_list_price_ngn: 9900,
  yearly_price_ngn: 99000,
  yearly_savings_vs_12_months_ngn: 19800,
  first_month_discount_percent: 50,
  plan_prices_ngn: { free: 0, starter: 9900, growth: 19900, enterprise: null },
};
const demoGateway: GatewayStatus = { configured: true, test_mode: true, public_key_prefix: "pk_test_abc...", secret_key_configured: true, callback_url: "https://platform.phantixlabs.com/billing/callback", environment: "staging" };
const demoCoupons: CouponItem[] = [{ id: 1, label: "Design Partners", code: "BETA-7F3K-9Q2M", duration_days: 31, max_redemptions: 1, redemption_count: 0, remaining_redemptions: 1, is_active: true, notes: "Q3 partners", created_at: new Date().toISOString() }];
const demoRedemptions: RedemptionItem[] = [{ id: 1, organization_id: 24, coupon_id: 1, code_snapshot: "BETA-7F3K-9Q2M", redeemed_at: "2026-07-28T10:00:00Z", access_ends_at: "2026-08-28T10:00:00Z", status: "active" }];
const demoMetering: CreditMeteringMap = {
  currency: "NGN",
  fx: { ngn_per_usd: FX_NGN_PER_USD },
  credit_ngn: 1.5,
  credit_usd: 0.001,
  plan_ai_ngn_mo: { free: 0, starter: 7500, growth: 30000 },
  plan_ai_usd_mo: { free: 0, starter: 5, growth: 20 },
  plan_credits_mo: { free: 0, starter: 5000, growth: 20000, enterprise: "custom" },
  clusters: { economy_security: ["deepseek", "zai", "glm-4-flash"], economy_general: ["qwen-turbo"] },
  ngn_per_1m_tokens: { "deepseek-v4-flash": 315, "glm-4-flash": 150, "qwen-turbo": 225, "gpt-4o": 7500 },
  usd_per_1m_tokens: { "deepseek-v4-flash": 0.21, "glm-4-flash": 0.1 },
  multipliers_vs_deepseek_flash: { "deepseek-v4-flash": 1, "glm-4-flash": 0.48, "qwen-turbo": 0.71, "gpt-4o": 23.81 },
  security_providers: {
    primary: "deepseek",
    primary_model: "deepseek-v4-flash",
    fallback: "zhipu",
    fallback_model: "glm-4-flash",
    user_choice: false,
    note: "Pentest, AGI, and security agents use DeepSeek only; Z.AI GLM Flash is automatic fallback.",
  },
  metering_note: "1 credit = ₦1.50 of LLM spend (FX ₦1,500/USD). Starter ≈ ₦7,500/mo; Growth ≈ ₦30,000/mo.",
};

export default function BillingAdmin() {
  const { toast } = useStore();
  const [tab, setTab] = useState("pricing");
  const [showPriceChange, setShowPriceChange] = useState(false);
  const [showRenewalConfirm, setShowRenewalConfirm] = useState(false);
  const [showCouponGen, setShowCouponGen] = useState(false);
  const [tierPrices, setTierPrices] = useState({ free: "0", starter: "9900", growth: "19900", enterprise: "" });
  const [newYearlyMonthEq, setNewYearlyMonthEq] = useState("10");
  const [discountPercent, setDiscountPercent] = useState(50);
  const [isActive, setIsActive] = useState(true);
  const [couponForm, setCouponForm] = useState({ label: "", duration_days: 31, count: 5, notes: "" });
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [gateway, setGateway] = useState<GatewayStatus | null>(null);
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionItem[]>([]);
  const [metering, setMetering] = useState<CreditMeteringMap | null>(null);
  const [extraLoading, setExtraLoading] = useState(!DEMO_MODE);

  const { data: billing, loading, refresh } = useResource<BillingSettings>(async () => DEMO_MODE ? demoBilling : api.get("/admin/billing/settings"), {} as any);
  const { data: pricing } = useResource<PricingPreview>(async () => DEMO_MODE ? demoPricing : api.get("/admin/billing/pricing-preview"), {} as any);

  React.useEffect(() => {
    if (!DEMO_MODE) {
      Promise.allSettled([
        api.get<GatewayStatus>("/admin/billing/gateway").then(setGateway),
        api.get<CouponItem[] | { items: CouponItem[] }>("/admin/coupons").then((r) => setCoupons(Array.isArray(r) ? r : r.items ?? [])),
        api.get<RedemptionItem[] | { items: RedemptionItem[] }>("/admin/coupon-redemptions?limit=20").then((r) => setRedemptions(Array.isArray(r) ? r : r.items ?? [])),
        api.get<CreditMeteringMap>("/admin/billing/credits-metering").then(setMetering),
      ]).finally(() => setExtraLoading(false));
    } else {
      setGateway(demoGateway); setCoupons(demoCoupons); setRedemptions(demoRedemptions); setMetering(demoMetering);
    }
  }, []);

  const openPriceChange = () => {
    const p = billing?.plan_prices_ngn;
    setTierPrices({
      free: "0",
      starter: String(p?.starter ?? billing?.monthly_price_ngn ?? 9900),
      growth: String(p?.growth ?? 19900),
      enterprise: p?.enterprise == null ? "" : String(p.enterprise),
    });
    setNewYearlyMonthEq(String(billing?.yearly_month_equivalent ?? 10));
    setDiscountPercent(billing?.first_month_discount_percent ?? 50);
    setIsActive(billing?.is_active !== false);
    setShowPriceChange(true);
  };

  const handlePriceChange = async () => {
    const starter = Number(tierPrices.starter);
    const growth = Number(tierPrices.growth);
    if (!Number.isFinite(starter) || starter < 0 || !Number.isFinite(growth) || growth < 0) {
      toast("error", "Invalid Starter or Growth price");
      return;
    }
    const enterpriseRaw = tierPrices.enterprise.trim();
    const enterprise = enterpriseRaw === "" ? null : Number(enterpriseRaw);
    if (enterprise !== null && (!Number.isFinite(enterprise) || enterprise < 0)) {
      toast("error", "Enterprise price must be empty (quote) or ≥ 0");
      return;
    }
    try {
      await api.put("/admin/billing/settings", {
        plan_prices_ngn: { free: 0, starter, growth, enterprise },
        yearly_month_equivalent: Number(newYearlyMonthEq) || 10,
        first_month_discount_percent: discountPercent,
        is_active: isActive,
        notes: "Updated via staff portal",
      });
      toast("success", "Tier prices updated");
      setShowPriceChange(false);
      refresh();
    } catch (e) { toast("error", "Update failed", e instanceof Error ? e.message : ""); }
  };

  const formatTierPrice = (value: number | null | undefined) =>
    value == null ? "Quote" : formatNaira(value);

  const yearlySavingsPct = (() => {
    if (typeof pricing?.savings_percent === "number") return pricing.savings_percent;
    const monthly = pricing?.monthly_list_price_ngn ?? billing?.monthly_price_ngn ?? 0;
    const yearly = pricing?.yearly_price_ngn ?? billing?.yearly_price_ngn ?? 0;
    const full = monthly * 12;
    if (!full) return 0;
    return Math.round(((full - yearly) / full) * 100);
  })();

  const handleGenerateCoupons = async () => {
    try {
      const res = await api.post<{ created: CouponItem[]; message: string }>("/admin/coupons", { label: couponForm.label, duration_days: Math.min(31, couponForm.duration_days), count: Math.min(50, couponForm.count), notes: couponForm.notes });
      const created = res?.created ?? [];
      setGeneratedCodes(created.map((c) => c.code));
      toast("success", `${created.length} codes generated`);
      // Refresh list so new coupons appear immediately.
      if (!DEMO_MODE) {
        api.get<CouponItem[] | { items: CouponItem[] }>("/admin/coupons").then((r) => setCoupons(Array.isArray(r) ? r : r.items ?? [])).catch(() => {});
      } else {
        setCoupons((cs) => [...cs, ...created]);
      }
    } catch (e) { toast("error", "Failed", e instanceof Error ? e.message : ""); }
  };

  const handleDeactivateCoupon = async (id: number) => {
    try { await api.patch(`/admin/coupons/${id}`, { is_active: false, notes: "Deactivated via staff portal" }); toast("success", "Deactivated"); setCoupons(cs => cs.map(c => c.id === id ? { ...c, is_active: false } : c)); } catch (e) { toast("error", "Failed"); }
  };

  const handleRunRenewals = async () => { try { await api.post("/admin/billing/run-renewals", {}); toast("success", "Renewals triggered"); setShowRenewalConfirm(false); } catch (e) { toast("error", "Failed", e instanceof Error ? e.message : ""); } };

  return (
    <div>
      <PageHeader title="Billing Admin" description="Manage platform pricing, gateway status, coupons, and renewals" actions={<button onClick={refresh} className="btn-ghost text-sm px-3 py-1.5"><RefreshCw size={14} /></button>} />
      <Tabs tabs={[{ id: "pricing", label: "Pricing" }, { id: "gateway", label: "Gateway" }, { id: "coupons", label: `Coupons (${coupons.length})` }, { id: "redemptions", label: `Redemptions (${redemptions.length})` }]} active={tab} onChange={setTab} />

      {tab === "pricing" && (
        <div className="space-y-4">
          {loading ? <TableSkeleton rows={3} /> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Free" value={formatTierPrice(billing?.plan_prices_ngn?.free ?? 0)} icon={<DollarSign size={18} />} />
                <StatCard label="Starter /mo" value={formatTierPrice(billing?.plan_prices_ngn?.starter ?? billing?.monthly_price_ngn)} icon={<DollarSign size={18} />} />
                <StatCard label="Growth /mo" value={formatTierPrice(billing?.plan_prices_ngn?.growth)} icon={<BarChart3 size={18} />} />
                <StatCard label="Enterprise" value={formatTierPrice(billing?.plan_prices_ngn?.enterprise)} icon={<DollarSign size={18} />} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <StatCard label="Starter yearly" value={formatNaira(billing?.yearly_price_ngn || 0)} icon={<BarChart3 size={18} />} />
                <StatCard label="Yearly savings" value={`${yearlySavingsPct}%`} icon={<DollarSign size={18} />} />
                <StatCard label="1st-month discount" value={`${billing?.first_month_discount_percent ?? pricing?.first_month_discount_percent ?? 50}%`} icon={<CreditCard size={18} />} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <StatCard label="AI Starter (NGN/mo)" value={formatAiNgn(metering?.plan_ai_ngn_mo?.starter)} icon={<CreditCard size={18} />} />
                <StatCard label="AI Growth (NGN/mo)" value={formatAiNgn(metering?.plan_ai_ngn_mo?.growth)} icon={<CreditCard size={18} />} />
                <StatCard label="1 AI credit" value={metering ? `₦${metering.credit_ngn}` : "Not set"} icon={<DollarSign size={18} />} />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={openPriceChange} className="btn-secondary text-sm">Change Pricing</button>
                <button onClick={() => setShowRenewalConfirm(true)} className="btn-secondary text-sm"><RefreshCw size={14} /> Run Renewals</button>
              </div>
              {extraLoading && !metering && <TableSkeleton rows={3} />}
              {metering && (
                <CollapsibleCard defaultOpen={false} title="AI credit metering" subtitle={`FX ₦${metering.fx?.ngn_per_usd ?? FX_NGN_PER_USD}/USD · ${formatCredits(metering.plan_credits_mo?.starter)} of ${formatCredits(metering.plan_credits_mo?.growth)} credits`}>
                  <p className="text-xs text-slate-400 mb-3">{metering.metering_note}</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-slate-400">Security primary:</span> <span className="font-mono text-xs text-slate-200">{metering.security_providers?.primary_model}</span></div>
                    <div><span className="text-slate-400">Fallback:</span> <span className="font-mono text-xs text-slate-200">{metering.security_providers?.fallback_model} (Z.AI)</span></div>
                    <div><span className="text-slate-400">User choice:</span> <span className="text-slate-300">{metering.security_providers?.user_choice ? "Yes" : "No"}</span></div>
                    <div><span className="text-slate-400">DeepSeek ×1M:</span> <span className="font-mono text-xs text-slate-300">{formatAiNgn(metering.ngn_per_1m_tokens?.["deepseek-v4-flash"])}</span></div>
                    <div><span className="text-slate-400">GLM Flash ×1M:</span> <span className="font-mono text-xs text-slate-300">{formatAiNgn(metering.ngn_per_1m_tokens?.["glm-4-flash"])}</span></div>
                    <div><span className="text-slate-400">GPT-4o ×1M:</span> <span className="font-mono text-xs text-slate-300">{formatAiNgn(metering.ngn_per_1m_tokens?.["gpt-4o"])}</span></div>
                  </div>
                </CollapsibleCard>
              )}
            </>
          )}
          <Modal open={showPriceChange} onClose={() => setShowPriceChange(false)} title="Change Tier Pricing (NGN)">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Free</label><input className="input font-mono" type="number" value={0} disabled /></div>
                <div><label className="label">Starter /mo</label><input className="input font-mono" type="number" min={0} value={tierPrices.starter} onChange={e => setTierPrices({ ...tierPrices, starter: e.target.value })} /></div>
                <div><label className="label">Growth /mo</label><input className="input font-mono" type="number" min={0} value={tierPrices.growth} onChange={e => setTierPrices({ ...tierPrices, growth: e.target.value })} /></div>
                <div><label className="label">Enterprise (empty = quote)</label><input className="input font-mono" type="number" min={0} placeholder="Quote" value={tierPrices.enterprise} onChange={e => setTierPrices({ ...tierPrices, enterprise: e.target.value })} /></div>
              </div>
              <div className="flex items-center justify-between"><label className="label">First-month discount (self-serve)</label><span className="text-gold-300 font-mono">{discountPercent}%</span></div>
              <input type="range" min={0} max={100} value={discountPercent} onChange={e => setDiscountPercent(Number(e.target.value))} className="w-full accent-gold-400" />
              <div><label className="label">Yearly months equivalent</label><input className="input font-mono w-20" type="number" min={1} max={12} value={newYearlyMonthEq} onChange={e => setNewYearlyMonthEq(e.target.value)} /></div>
              <div className="flex items-center gap-2"><label className="label">Active</label><button onClick={() => setIsActive(!isActive)}>{isActive ? <ToggleRight size={20} className="text-emerald-400" /> : <ToggleLeft size={20} className="text-slate-500" />}</button><span className="text-xs text-slate-400">{isActive ? "New subscriptions allowed" : "Blocking new subscriptions"}</span></div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-severity-high/10 border border-severity-high/20 text-xs text-severity-high"><AlertTriangle size={14} />Updates the Free, Starter, Growth and Enterprise list prices for landing and checkout. Starter still drives Paystack renewals.</div>
              <button onClick={handlePriceChange} className="btn-primary w-full">Confirm</button>
            </div>
          </Modal>
        </div>
      )}

      {tab === "gateway" && (
        <div className="space-y-4">
          {gateway ? (
            <Card>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-400">Status:</span> <span className={gateway.configured ? "text-emerald-400" : "text-severity-critical"}>{gateway.configured ? "Configured" : "Not configured"}</span></div>
                <div><span className="text-slate-400">Mode:</span> <span className={cx(gateway.test_mode ? "text-amber-400" : "text-emerald-400")}>{gateway.test_mode ? " TEST KEYS" : " LIVE KEYS"}</span></div>
                <div><span className="text-slate-400">Public key:</span> <span className="font-mono text-xs text-slate-300">{gateway.public_key_prefix}</span></div>
                <div><span className="text-slate-400">Secret key:</span> <span className={gateway.secret_key_configured ? "text-emerald-400" : "text-severity-critical"}>{gateway.secret_key_configured ? "Configured" : "NOT SET"}</span></div>
                <div className="col-span-2"><span className="text-slate-400">Env:</span> <span className="font-mono text-xs text-slate-300">{gateway.environment}</span></div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-slate-400">Webhook:</span>
                <code className="text-[13px] bg-phantix-950/70 px-2 py-1 rounded font-mono text-slate-300">{gateway.callback_url || `${API_BASE}/billing/webhooks/paystack`}</code>
                <button onClick={() => { navigator.clipboard.writeText(gateway.callback_url || ""); toast("info", "Copied"); }} className="text-gold-400 text-xs"><Copy size={12} /></button>
              </div>
            </Card>
          ) : <TableSkeleton rows={3} />}
        </div>
      )}

      {tab === "coupons" && (
        <div className="space-y-4">
          <button onClick={() => setShowCouponGen(true)} className="btn-primary text-sm"><Ticket size={14} /> Generate Coupons</button>
          {extraLoading && coupons.length === 0 ? <TableSkeleton rows={3} /> : coupons.length === 0 ? <EmptyState icon={<Ticket size={24} />} title="No coupons" body="Generate beta access codes for trial access." /> : (
            <div className="space-y-2">
              {coupons.map(c => (
                <Card key={c.id}><div className="flex flex-wrap items-center gap-3"><span className={cx("chip", c.is_active ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-slate-500/50 bg-slate-500/10 text-slate-500")}>{c.is_active ? "Active" : "Inactive"}</span><span className="font-mono text-sm text-slate-200">{c.code}</span><span className="text-xs text-slate-400">{c.label}: {c.duration_days}d · {c.redemption_count}{c.max_redemptions ? ` of ${c.max_redemptions}` : ""} used</span><span className="ml-auto text-xs text-slate-500">{timeAgo(c.created_at)}</span>{c.is_active && <button onClick={() => handleDeactivateCoupon(c.id)} className="btn-ghost text-xs px-2 py-1 text-severity-critical"><XCircle size={12} /></button>}</div></Card>
              ))}
            </div>
          )}
          <Modal open={showCouponGen} onClose={() => setShowCouponGen(false)} title="Generate Coupons">
            <div className="space-y-3">
              <div><label className="label">Label</label><input className="input" value={couponForm.label} onChange={e => setCouponForm({ ...couponForm, label: e.target.value })} placeholder="Design Partners July" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Duration (days, max 31)</label><input className="input font-mono" type="number" min={1} max={31} value={couponForm.duration_days} onChange={e => setCouponForm({ ...couponForm, duration_days: Math.min(31, Number(e.target.value) || 1) })} /></div>
                <div><label className="label">Count (max 50)</label><input className="input font-mono" type="number" min={1} max={50} value={couponForm.count} onChange={e => setCouponForm({ ...couponForm, count: Math.min(50, Number(e.target.value) || 1) })} /></div>
              </div>
              <div><label className="label">Notes</label><textarea className="input" value={couponForm.notes} onChange={e => setCouponForm({ ...couponForm, notes: e.target.value })} /></div>
              <button onClick={handleGenerateCoupons} className="btn-primary w-full">Generate</button>
              {generatedCodes.length > 0 && (
                <div className="mt-3 p-3 rounded-md bg-gold-400/10 border border-gold-400/20">
                  <p className="text-xs font-semibold text-gold-300 mb-2">Copy these codes. They will not be shown again:</p>
                  {generatedCodes.map(code => <div key={code} className="flex items-center gap-2 font-mono text-xs text-white py-1"><span>{code}</span><button onClick={() => { navigator.clipboard.writeText(code); toast("info", "Copied"); }} className="text-gold-400"><Copy size={11} /></button></div>)}
                </div>
              )}
            </div>
          </Modal>
        </div>
      )}

      {tab === "redemptions" && (
        <div className="space-y-2">
          {extraLoading && redemptions.length === 0 ? <TableSkeleton rows={3} /> : redemptions.length === 0 ? <EmptyState icon={<CheckCircle2 size={24} />} title="No redemptions" body="No organizations have redeemed coupons yet." /> : (
            <Card className="!p-0 overflow-hidden"><table className="w-full"><thead><tr className="border-b border-phantix-700/40"><th className="th">Code</th><th className="th">Org ID</th><th className="th">Redeemed</th><th className="th">Expires</th><th className="th">Status</th></tr></thead><tbody>{redemptions.map(r => <tr key={r.id} className="border-b border-phantix-800/40"><td className="td font-mono text-xs text-gold-300">{r.code_snapshot}</td><td className="td text-xs">#{r.organization_id}</td><td className="td text-xs text-slate-400">{timeAgo(r.redeemed_at)}</td><td className="td text-xs text-slate-400">{timeAgo(r.access_ends_at)}</td><td className="td"><span className={cx("chip text-[12px]", r.status === "active" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-slate-500/50 bg-slate-500/10 text-slate-500")}>{r.status}</span></td></tr>)}</tbody></table></Card>
          )}
        </div>
      )}

      <Modal open={showRenewalConfirm} onClose={() => setShowRenewalConfirm(false)} title="Run Renewals">
        <div className="space-y-3"><p className="text-sm text-slate-400">This triggers the renewal job that processes due subscriptions and generates invoices.</p><button onClick={handleRunRenewals} className="btn-primary w-full">Run Now</button></div>
      </Modal>
    </div>
  );
}
