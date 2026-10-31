/** AI credit metering helpers — mirrors backend provider_pricing (NGN @ ₦1,500/USD).
 *
 *   GET /admin/billing/credits-metering   → CreditMeteringMap (prices per provider)
 *   GET /admin/billing/ai-credits?month   → AiCreditsReport (ledger usage across orgs)
 */
import { api } from "./api";

/** One provider's price: what 1M blended tokens cost and burn. */
export interface ProviderPriceRow {
  model: string;
  provider: string;
  provider_label: string;
  usd_per_1m: number;
  ngn_per_1m: number;
  credits_per_1m: number;
  multiplier_vs_deepseek_flash: number;
  /** "primary" / "fallback" on the fixed security chain; null otherwise. */
  security_role: string | null;
}

export interface CreditMeteringMap {
  providers?: ProviderPriceRow[];
  currency: string;
  fx: { ngn_per_usd: number; note?: string };
  credit_ngn: number;
  credit_usd: number;
  plan_ai_ngn_mo: Record<string, number>;
  plan_ai_usd_mo: Record<string, number>;
  plan_credits_mo: Record<string, number | string>;
  clusters: Record<string, string[]>;
  ngn_per_1m_tokens: Record<string, number>;
  usd_per_1m_tokens: Record<string, number>;
  multipliers_vs_deepseek_flash: Record<string, number>;
  security_providers: {
    primary: string;
    primary_model: string;
    fallback: string;
    fallback_model: string;
    fallback_models?: string[];
    user_choice: boolean;
    note?: string;
  };
  metering_note: string;
}

export interface EnterpriseAiAllowance {
  organization_id?: number;
  plan?: string | null;
  currency?: string;
  fx_ngn_per_usd?: number;
  ai_usd_mo?: number | null;
  ai_ngn_mo?: number | null;
  ai_credits_mo?: number | null;
  configured?: boolean;
  note?: string;
}

export const FX_NGN_PER_USD = 1500;

export function formatAiNgn(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "Not set";
  return `₦${Number(n).toLocaleString()}`;
}

export function formatCredits(n: number | string | null | undefined): string {
  if (n == null) return "Not set";
  if (typeof n === "string") return n;
  return n.toLocaleString();
}

// ── Usage across organizations ───────────────────────────────────────────────

export interface ProviderUsage {
  /** Provider key, "unrecorded" for charges made before models were logged. */
  provider: string;
  label: string;
  credits: number;
  tokens: number;
  calls: number;
  usd: number;
}

export interface OrganizationCredits {
  organization_id: number;
  name: string | null;
  plan: string | null;
  allowance_granted: number;
  credits_used: number;
  usd: number;
  calls: number;
  tokens: number;
  balance: number;
  buckets: Record<string, number>;
  providers: ProviderUsage[];
}

export interface AiCreditsReport {
  month: string;
  credit_usd: number;
  credit_ngn: number;
  totals: {
    credits_used: number;
    usd: number;
    ngn: number;
    calls: number;
    tokens: number;
    organizations_using_ai: number;
    balance: number;
  };
  providers: ProviderUsage[];
  organizations: OrganizationCredits[];
}

export function fetchAiCreditsReport(month: string): Promise<AiCreditsReport> {
  return api.get<AiCreditsReport>("/admin/billing/ai-credits", { params: { month } });
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatUsd(n: number): string {
  return `$${n < 1 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
}
