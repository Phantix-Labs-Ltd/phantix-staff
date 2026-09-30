import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3, Bot, Building2, Eye, Globe, Inbox, LifeBuoy, MousePointerClick, RefreshCw, Sparkles, Ticket, UserCog, Users,
} from "lucide-react";
import { Card, CardHeader, ErrorState, PageHeader, StatCard, StatCardSkeleton, Tabs } from "@/components/ui";
import { DemoRequestsPanel } from "@/components/DemoRequestsPanel";
import { api } from "@/lib/api";
import { cx, formatDateTime } from "@/lib/utils";

// ── Product analytics ────────────────────────────────────────────────────────
// GET /api/v1/admin/analytics/summary?days= (staff-admin gated). This is the
// "how is the product being used" plane, aggregated on demand from the platform
// DB — organizations, users, leads, support load, AI credit burn, and the
// first-party page-view traffic captured on the marketing (landing) site.
//
// The landing page views come from the cookieless `POST /api/v1/analytics/collect`
// beacons; bots are excluded server-side/
//
// The second tab closes the loop on the one lead-capture flow the marketing
// site has: demo requests triaged via GET/PATCH /api/v1/admin/demo-requests.

interface PageViews {
  views: number;
  sessions: number;
  visitors: number;
  bots: number;
  by_app: Array<{ app: string; views: number }>;
  top_paths: Array<{ path: string; views: number }>;
  top_referrers: Array<{ referrer: string; views: number }>;
}

interface AnalyticsSummary {
  window_days: number;
  generated_at: string | null;
  organizations: { total: number; active: number; verified: number };
  users: { org_users: number; staff: number };
  /** Also carries a dynamic `last_{days}d` key — read via windowCount(). */
  demo_requests: Record<string, number>;
  support: { open_tickets: number };
  growth: { coupons_redeemed: number };
  ai_credits: { entries: number; credits_consumed: number };
  /** Landing/marketing traffic. Window keys are `*_last_{days}d`. */
  page_views: PageViews;
}

const RANGES = [7, 30, 90] as const;

type Tab = "product" | "leads";

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmt(v: unknown): string {
  return n(v).toLocaleString();
}

/** The window bucket is keyed `last_{days}d`, so resolve it by shape not name. */
function windowCount(demo: Record<string, number> | undefined, days: number): number {
  if (!demo) return 0;
  const exact = demo[`last_${days}d`];
  if (exact != null) return n(exact);
  const key = Object.keys(demo).find((k) => /^last_\d+d$/.test(k));
  return key ? n(demo[key]) : 0;
}

/** Landing/marketing page views — window keys are `views_last_{days}d` etc. */
function normalizePageViews(pv: any, days: number): PageViews {
  const o = pv && typeof pv === "object" ? (pv as Record<string, any>) : {};
  const by_app = o.by_app && typeof o.by_app === "object" && !Array.isArray(o.by_app)
    ? Object.entries(o.by_app as Record<string, unknown>)
        .map(([app, v]) => ({ app, views: n(v) }))
        .sort((a, b) => b.views - a.views)
    : [];
  const top_paths = Array.isArray(o.top_paths)
    ? (o.top_paths as any[]).map((x) => ({ path: String(x?.path ?? ""), views: n(x?.views) }))
    : [];
  const top_referrers = Array.isArray(o.top_referrers)
    ? (o.top_referrers as any[]).map((x) => ({ referrer: String(x?.referrer ?? ""), views: n(x?.views) }))
    : [];
  return {
    views: n(o[`views_last_${days}d`]),
    sessions: n(o[`sessions_last_${days}d`]),
    visitors: n(o[`visitors_last_${days}d`]),
    bots: n(o[`bot_views_last_${days}d`]),
    by_app,
    top_paths,
    top_referrers,
  };
}

function normalize(raw: any, days: number): AnalyticsSummary {
  const r = (raw ?? {}) as Record<string, any>;
  const obj = (v: unknown): Record<string, any> =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
  const orgs = obj(r.organizations);
  const users = obj(r.users);
  const demo = obj(r.demo_requests);
  const support = obj(r.support);
  const growth = obj(r.growth);
  const credits = obj(r.ai_credits);
  return {
    window_days: n(r.window_days) || days,
    generated_at: r.generated_at ? String(r.generated_at) : null,
    organizations: { total: n(orgs.total), active: n(orgs.active), verified: n(orgs.verified) },
    users: { org_users: n(users.org_users), staff: n(users.staff) },
    demo_requests: Object.fromEntries(Object.entries(demo).map(([k, v]) => [k, n(v)])),
    support: { open_tickets: n(support.open_tickets) },
    growth: { coupons_redeemed: n(growth.coupons_redeemed) },
    ai_credits: { entries: n(credits.entries), credits_consumed: n(credits.credits_consumed) },
    page_views: normalizePageViews(r.page_views, days),
  };
}

export default function Analytics() {
  const [tab, setTab] = useState<Tab>("product");
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(normalize(await api.get<any>(`/admin/analytics/summary?days=${range}`), range));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the analytics summary.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const pv = data?.page_views ?? { views: 0, sessions: 0, visitors: 0, bots: 0, by_app: [], top_paths: [], top_referrers: [] };
  const leadsInWindow = useMemo(() => windowCount(data?.demo_requests, days), [data, days]);
  // credits_consumed sums the negative entries, so its magnitude is the burn.
  const creditsBurned = Math.abs(n(data?.ai_credits.credits_consumed));

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Product usage across the Phantix Labs platform: tenants, users, lead flow, support load and AI credit burn. Aggregated on demand from the platform database."
        actions={tab !== "product" ? null : (
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-phantix-700/50">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setDays(r)}
                  className={cx(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    days === r ? "bg-phantix-800 text-white" : "text-slate-400 hover:bg-phantix-800/60 hover:text-slate-200",
                  )}
                >
                  {r}d
                </button>
              ))}
            </div>
            <button onClick={() => void load(days)} className="btn-ghost px-3 py-1.5 text-sm" title="Refresh">
              <RefreshCw size={14} className={cx(loading && "animate-spin")} /> Refresh
            </button>
          </div>
        )}
      />

      <Tabs
        active={tab}
        onChange={(id) => setTab(id as Tab)}
        tabs={[
          { id: "product", label: <span className="flex items-center gap-1.5"><BarChart3 size={14} /> Product</span> },
          { id: "leads", label: <span className="flex items-center gap-1.5"><Inbox size={14} /> Demo requests</span> },
        ]}
      />

      {tab === "leads" ? (
        <DemoRequestsPanel />
      ) : loading && !data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} />)}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card" style={{ opacity: 1 - i * 0.09 }}>
                <div className="skeleton h-4 w-36 rounded" />
                <div className="skeleton mt-2 h-2.5 w-48 max-w-full rounded" />
                <div className="mt-4 space-y-2.5">
                  {[0, 1, 2].map((r) => (
                    <div key={r} className="flex items-center justify-between gap-4">
                      <div className="skeleton h-3 w-40 max-w-[60%] rounded" />
                      <div className="skeleton h-3 w-12 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : error && !data ? (
        <ErrorState
          title="Analytics unavailable"
          body={`${error} Analytics requires a staff admin account.`}
          onRetry={() => void load(days)}
        />
      ) : (
        <div className="space-y-5">
          {/* Headline counters */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Organizations"
              value={fmt(data?.organizations.total)}
              icon={<Building2 size={18} />}
              trendLabel={`${fmt(data?.organizations.active)} active · ${fmt(data?.organizations.verified)} verified`}
            />
            <StatCard
              label="Org users"
              value={fmt(data?.users.org_users)}
              icon={<Users size={18} />}
              trendLabel="across all tenants"
            />
            <StatCard
              label="Demo requests"
              value={fmt(data?.demo_requests.total)}
              icon={<Inbox size={18} />}
              trendLabel={`${fmt(leadsInWindow)} in the last ${data?.window_days ?? days} days`}
            />
            <StatCard
              label="Open tickets"
              value={fmt(data?.support.open_tickets)}
              icon={<LifeBuoy size={18} />}
              trendLabel="open or pending"
            />
          </div>

          {/* Landing & marketing — first-party, cookieless page views */}
          <div className="pt-1">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-slate-400">Landing &amp; marketing</h3>
            <p className="mt-1 text-[13px] text-slate-500">
              Page views captured on the marketing site (consented, cookieless). Bots are excluded from views,
              sessions and visitors.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Landing views" value={fmt(pv.views)} icon={<Eye size={18} />} trendLabel={`last ${data?.window_days ?? days} days`} />
            <StatCard label="Unique visitors" value={fmt(pv.visitors)} icon={<Users size={18} />} trendLabel="daily-rotating hash" />
            <StatCard label="Sessions" value={fmt(pv.sessions)} icon={<MousePointerClick size={18} />} trendLabel="distinct session keys" />
            <StatCard label="Bot views" value={fmt(pv.bots)} icon={<Bot size={18} />} trendLabel="excluded from the counts above" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader title="Top landing pages" subtitle="Human page views" action={<Globe size={15} className="text-gold-400" />} />
              <TrafficRows rows={pv.top_paths.slice(0, 8).map((p) => ({ label: p.path || "/", value: p.views }))} empty="No page views captured in this window yet." />
            </Card>
            <Card>
              <CardHeader title="Traffic sources" subtitle="Referrers" action={<Globe size={15} className="text-emerald-400" />} />
              <TrafficRows rows={pv.top_referrers.slice(0, 8).map((r) => ({ label: r.referrer || "direct", value: r.views }))} empty="No referrers recorded yet." />
            </Card>
            <Card>
              <CardHeader title="By surface" subtitle="Which frontend sent the view" action={<Globe size={15} className="text-phantix-300" />} />
              <TrafficRows rows={pv.by_app.map((a) => ({ label: a.app, value: a.views }))} empty="No traffic by surface yet." />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Tenants" subtitle="Organization lifecycle" action={<Building2 size={15} className="text-gold-400" />} />
              <Rows
                rows={[
                  { label: "Total organizations", value: n(data?.organizations.total) },
                  { label: "Active", value: n(data?.organizations.active) },
                  { label: "Domain verified", value: n(data?.organizations.verified) },
                ]}
              />
            </Card>

            <Card>
              <CardHeader title="People" subtitle="Accounts on the platform" action={<UserCog size={15} className="text-phantix-300" />} />
              <Rows
                rows={[
                  { label: "Organization users", value: n(data?.users.org_users) },
                  { label: "Platform staff", value: n(data?.users.staff) },
                ]}
              />
            </Card>

            <Card>
              <CardHeader
                title="Lead funnel"
                subtitle="Captured from the landing demo tour"
                action={<Inbox size={15} className="text-emerald-400" />}
              />
              <Rows
                rows={[
                  { label: "All time", value: n(data?.demo_requests.total) },
                  { label: "Awaiting triage (new)", value: n(data?.demo_requests.new), emphasis: true },
                  { label: `Last ${data?.window_days ?? days} days`, value: leadsInWindow },
                ]}
              />
              <button
                onClick={() => setTab("leads")}
                className="mt-3 text-xs text-gold-300 transition-colors hover:text-gold-200"
              >
                Open the demo-request queue →
              </button>
            </Card>

            <Card>
              <CardHeader title="Growth and AI usage" subtitle="Coupon redemptions and credit burn" action={<Sparkles size={15} className="text-gold-400" />} />
              <Rows
                rows={[
                  { label: "Coupons redeemed", value: n(data?.growth.coupons_redeemed) },
                  { label: "AI credit entries", value: n(data?.ai_credits.entries) },
                  { label: "Credits consumed", value: creditsBurned },
                ]}
              />
            </Card>
          </div>

          <p className="flex items-center gap-2 text-[13px] text-slate-600">
            <Ticket size={11} />
            Aggregated live from the platform database. No warehouse, no third-party trackers, and no personal data beyond counts.
            {data?.generated_at && <span>· generated {formatDateTime(data.generated_at)}</span>}
          </p>
        </div>
      )}
    </div>
  );
}

function TrafficRows({ rows, empty }: { rows: Array<{ label: string; value: number }>; empty: string }) {
  if (!rows.length) return <p className="text-xs text-slate-500">{empty}</p>;
  return <Rows rows={rows} />;
}

function Rows({ rows }: { rows: Array<{ label: string; value: number; emphasis?: boolean }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className={cx("min-w-0 flex-1 truncate text-xs", r.emphasis ? "text-slate-200" : "text-slate-400")}>
            {r.label}
          </span>
          <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-phantix-800/60">
            <span
              className={cx("block h-full rounded-full", r.emphasis ? "bg-gold-400" : "bg-gold-400/50")}
              style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }}
            />
          </span>
          <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-slate-200">
            {r.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
