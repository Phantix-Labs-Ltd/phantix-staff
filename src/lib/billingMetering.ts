/** AI credit metering helpers — mirrors backend provider_pricing (NGN @ ₦1,500/USD). */

export interface CreditMeteringMap {
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
