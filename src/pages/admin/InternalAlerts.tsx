import React, { useEffect, useMemo, useState } from "react";
import {
  BellRing, RefreshCw, Send, Save, Loader2, X, AlertTriangle,
  Mail, ShieldCheck, TrendingUp, Pencil, Activity, CheckCircle2,
} from "lucide-react";
import {
  PageHeader, Card, CardHeader, StatusBadge, SeverityBadge, Modal,
  EmptyState, TableSkeleton, StatCard, StatGridSkeleton, ErrorState,
} from "@/components/ui";
import { api, DEMO_MODE } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { cx, timeAgo } from "@/lib/utils";

/**
 * Internal staff alert settings — superadmin only.
 *
 * Notifies the Phantix team about platform activity that needs attention
 * (support tickets, sandbox/demo applications, new orgs) and growth
 * milestones. Distinct from per-organization customer alerts. Backed by
 * /api/v1/admin/staff-alerts/* (superadmin-gated).
 */

interface AlertRoute {
  key: string;
  label: string;
  description: string;
  severity: string;
  enabled: boolean;
  is_required: boolean;
  recipients_to: string[];
  recipients_source: string;
  cc_email: string;
  bcc_email: string;
  updated_at?: string | null;
}

interface AlertSettings {
  enabled: boolean;
  send_enabled_now: boolean;
  environment: string;
  allowed_environments: string[];
  from_email: string;
  from_name: string;
  from_email_note: string;
  default_recipients: string[];
  milestone_thresholds: Record<string, number[]>;
  milestone_cross_db_enabled: boolean;
  routes: AlertRoute[];
  updated_at?: string | null;
}

interface AlertEvent {
  id: number;
  message_kind: string;
  alert_key: string;
  severity: string;
  title: string;
  body: string;
  reference?: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error?: string | null;
  recipients_to: string[];
  created_at?: string | null;
  processed_at?: string | null;
}

interface MetricRow {
  metric: string;
  label: string;
  value: number | null;
}

const EMPTY_SETTINGS: AlertSettings = {
  enabled: true,
  send_enabled_now: false,
  environment: "",
  allowed_environments: [],
  from_email: "",
  from_name: "",
  from_email_note: "",
  default_recipients: [],
  milestone_thresholds: {},
  milestone_cross_db_enabled: false,
  routes: [],
};

const demoSettings: AlertSettings = {
  enabled: true,
  send_enabled_now: false,
  environment: "development",
  allowed_environments: ["production"],
  from_email: "alert@phantixlabs.com",
  from_name: "Phantix Alerts",
  from_email_note: "Must be a verified sender on the platform SMTP relay.",
  default_recipients: [],
  milestone_thresholds: { orgs: [100, 1000, 10000], org_users: [100, 1000, 10000], scans: [100, 1000], findings: [100, 1000] },
  milestone_cross_db_enabled: false,
  routes: [
    { key: "support.ticket.created", label: "New support ticket", description: "A customer submitted a support ticket.", severity: "high", enabled: true, is_required: true, recipients_to: ["support@phantixlabs.com"], recipients_source: "route", cc_email: "", bcc_email: "" },
    { key: "demo.request.submitted", label: "Demo request", description: "A qualified lead requested a product demo.", severity: "medium", enabled: true, is_required: false, recipients_to: [], recipients_source: "none", cc_email: "", bcc_email: "" },
    { key: "milestone.reached", label: "Growth milestone", description: "The platform crossed a configured growth threshold.", severity: "info", enabled: true, is_required: true, recipients_to: [], recipients_source: "none", cc_email: "", bcc_email: "" },
  ],
};

const demoEvents: AlertEvent[] = [
  { id: 2, message_kind: "staff_alert", alert_key: "support.ticket.created", severity: "high", title: "New support ticket: Cannot export report", body: "", reference: "PHX-1002", status: "sent", attempts: 1, max_attempts: 5, recipients_to: ["support@phantixlabs.com"], created_at: new Date(Date.now() - 3 * 60 * 1000).toISOString() },
  { id: 1, message_kind: "acknowledgement", alert_key: "ack.support.ticket", severity: "info", title: "support request received: PHX-1002", body: "", reference: "PHX-1002", status: "sent", attempts: 1, max_attempts: 5, recipients_to: ["ada@acme.ng"], created_at: new Date(Date.now() - 3 * 60 * 1000).toISOString() },
];

/** Split a comma/space separated field into clean, unique addresses. */
function parseList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[,;\s]+/)) {
    const v = piece.trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

function parseThresholds(raw: string): number[] {
  const seen = new Set<number>();
  for (const piece of raw.split(/[,;\s]+/)) {
    const n = Number(piece);
    if (Number.isFinite(n) && n > 0) seen.add(Math.floor(n));
  }
  return Array.from(seen).sort((a, b) => a - b);
}

export default function InternalAlerts() {
  const { toast } = useStore();

  const settings = useResource<AlertSettings>(async () => {
    if (DEMO_MODE) return demoSettings;
    return await api.get<AlertSettings>("/admin/staff-alerts/settings");
  }, EMPTY_SETTINGS, "staff-alerts-settings");

  const events = useResource<AlertEvent[]>(async () => {
    if (DEMO_MODE) return demoEvents;
    const raw = await api.get<AlertEvent[] | { items?: AlertEvent[] }>("/admin/staff-alerts/events", { params: { limit: 50 } });
    return Array.isArray(raw) ? raw : (raw.items ?? []);
  }, [], "staff-alerts-events");

  const metrics = useResource<MetricRow[]>(async () => {
    if (DEMO_MODE) return [
      { metric: "orgs", label: "Organizations", value: 128 },
      { metric: "org_users", label: "Organization users", value: 640 },
      { metric: "scans", label: "Scans", value: null },
      { metric: "findings", label: "Findings", value: null },
    ];
    const raw = await api.get<{ metrics: MetricRow[] }>("/admin/staff-alerts/metrics");
    return raw.metrics ?? [];
  }, [], "staff-alerts-metrics");

  const data: AlertSettings = settings.data
    ? { ...EMPTY_SETTINGS, ...settings.data, routes: settings.data.routes ?? [] }
    : EMPTY_SETTINGS;
  const [globalForm, setGlobalForm] = useState({ enabled: true, from_email: "", from_name: "", default_recipients: "" });
  const [thresholds, setThresholds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [routeEditor, setRouteEditor] = useState<AlertRoute | null>(null);
  const [routeForm, setRouteForm] = useState({ to: "", cc: "", bcc: "" });

  const [testOpen, setTestOpen] = useState(false);
  const [testKey, setTestKey] = useState("");
  const [testTo, setTestTo] = useState("");

  // Hydrate local, editable copies whenever the server settings (re)load.
  useEffect(() => {
    if (!settings.data) return;
    setGlobalForm({
      enabled: settings.data.enabled,
      from_email: settings.data.from_email || "",
      from_name: settings.data.from_name || "",
      default_recipients: (settings.data.default_recipients || []).join(", "),
    });
    const t: Record<string, string> = {};
    for (const [metric, values] of Object.entries(settings.data.milestone_thresholds || {})) {
      t[metric] = (values || []).join(", ");
    }
    setThresholds(t);
  }, [settings.data]);

  useEffect(() => {
    if (!testKey && data.routes.length) setTestKey(data.routes[0].key);
  }, [data.routes, testKey]);

  const configuredCount = useMemo(
    () => data.routes.filter((r) => r.enabled && r.recipients_to.length > 0).length,
    [data.routes],
  );

  const saveGlobal = async () => {
    setBusy(true);
    try {
      if (!DEMO_MODE) {
        await api.put("/admin/staff-alerts/settings", {
          enabled: globalForm.enabled,
          from_email: globalForm.from_email.trim(),
          from_name: globalForm.from_name.trim(),
          default_recipients: parseList(globalForm.default_recipients),
        });
      }
      toast("success", "Settings saved", "Sender and default recipients updated.");
      settings.refresh();
    } catch (e) {
      toast("error", "Save failed", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  const saveThresholds = async () => {
    setBusy(true);
    try {
      const payload: Record<string, number[]> = {};
      for (const [metric, raw] of Object.entries(thresholds)) payload[metric] = parseThresholds(raw);
      if (!DEMO_MODE) await api.put("/admin/staff-alerts/settings", { milestone_thresholds: payload });
      toast("success", "Thresholds saved", "Milestone thresholds updated.");
      settings.refresh();
      metrics.refresh();
    } catch (e) {
      toast("error", "Save failed", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  const openRoute = (route: AlertRoute) => {
    setRouteEditor(route);
    setRouteForm({
      to: route.recipients_to.join(", "),
      cc: route.cc_email || "",
      bcc: route.bcc_email || "",
    });
  };

  const saveRoute = async () => {
    if (!routeEditor) return;
    setBusy(true);
    try {
      if (!DEMO_MODE) {
        await api.put(`/admin/staff-alerts/routes/${encodeURIComponent(routeEditor.key)}`, {
          recipients_to: parseList(routeForm.to),
          cc_email: routeForm.cc.trim(),
          bcc_email: routeForm.bcc.trim(),
        });
      }
      toast("success", "Recipients saved", routeEditor.label);
      setRouteEditor(null);
      settings.refresh();
    } catch (e) {
      toast("error", "Save failed", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  const toggleRoute = async (route: AlertRoute) => {
    try {
      if (!DEMO_MODE) {
        await api.put(`/admin/staff-alerts/routes/${encodeURIComponent(route.key)}`, { enabled: !route.enabled });
      }
      toast("success", route.enabled ? "Alert muted" : "Alert enabled", route.label);
      settings.refresh();
    } catch (e) {
      toast("error", "Update failed", e instanceof Error ? e.message : "");
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      if (!DEMO_MODE) {
        await api.post("/admin/staff-alerts/test", {
          alert_key: testKey,
          title: "Test internal alert",
          body: "This is a test of the internal staff alert pipeline.",
          recipients_to: testTo.trim() ? parseList(testTo) : undefined,
        });
      }
      toast("success", "Test dispatched", "Check the configured recipients and the activity log.");
      setTestOpen(false);
      events.refresh();
    } catch (e) {
      toast("error", "Test failed", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  const runMilestones = async () => {
    setBusy(true);
    try {
      const result = DEMO_MODE
        ? { fired: 0 }
        : await api.post<{ fired?: number; enabled?: boolean }>("/admin/staff-alerts/milestones/check");
      toast("success", "Milestone check complete", `Fired ${result.fired ?? 0} new alert(s).`);
      metrics.refresh();
      events.refresh();
    } catch (e) {
      toast("error", "Check failed", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Internal Alerts"
        description="Team notifications for support, sandbox/demo applications, new organizations and growth milestones. Superadmin only."
        actions={
          <>
            <button onClick={() => void runMilestones()} disabled={busy} className="btn-secondary text-sm px-3 py-1.5">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />} Run milestone check
            </button>
            <button onClick={() => setTestOpen(true)} className="btn-primary text-sm px-3 py-1.5">
              <Send size={14} /> Send test
            </button>
          </>
        }
      />

      {/* Delivery status strip — the single most important fact: are these
          emails actually leaving the building right now? */}
      <div className={cx(
        "mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm",
        data.send_enabled_now
          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
          : "border-severity-medium/30 bg-severity-medium/5 text-severity-medium",
      )}>
        {data.send_enabled_now ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <span>
          {data.send_enabled_now
            ? "Delivery is live for this environment."
            : <>Not sending here. Delivery is gated to <b>{(data.allowed_environments || []).join(", ") || "production"}</b>. Use <b>Send test</b> to verify.</>}
        </span>
        <span className="ml-auto text-xs text-slate-400">
          Environment: <span className="font-mono">{data.environment || "unknown"}</span>
          {" · "}
          {configuredCount} of {data.routes.length} alert types routed
        </span>
      </div>

      {settings.error && <ErrorState body={settings.error} onRetry={settings.refresh} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Sender & defaults */}
        <Card className="lg:col-span-1">
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><Mail size={16} /> Sender &amp; defaults</span>}
            subtitle="From address and the fallback recipient list."
          />
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-300">Internal alerts enabled</span>
              <button
                type="button"
                onClick={() => setGlobalForm((p) => ({ ...p, enabled: !p.enabled }))}
                className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors", globalForm.enabled ? "bg-gold-400" : "bg-phantix-700")}
                aria-pressed={globalForm.enabled}
              >
                <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", globalForm.enabled ? "left-[22px]" : "left-0.5")} />
              </button>
            </label>
            <div>
              <label className="label">From email</label>
              <input className="input" value={globalForm.from_email} onChange={(e) => setGlobalForm((p) => ({ ...p, from_email: e.target.value }))} placeholder="alert@phantixlabs.com" />
              <p className="mt-1 text-[11px] text-slate-500">{data.from_email_note || "Must be a verified sender on the platform SMTP relay."}</p>
            </div>
            <div>
              <label className="label">From name</label>
              <input className="input" value={globalForm.from_name} onChange={(e) => setGlobalForm((p) => ({ ...p, from_name: e.target.value }))} placeholder="Phantix Alerts" />
            </div>
            <div>
              <label className="label">Default recipients</label>
              <input className="input" value={globalForm.default_recipients} onChange={(e) => setGlobalForm((p) => ({ ...p, default_recipients: e.target.value }))} placeholder="ops@phantixlabs.com, security@phantixlabs.com" />
              <p className="mt-1 text-[11px] text-slate-500">Used only when an alert type has no recipients of its own.</p>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary text-sm" disabled={busy} onClick={() => void saveGlobal()}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
              </button>
            </div>
          </div>
        </Card>

        {/* Alert types */}
        <Card className="lg:col-span-2">
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><BellRing size={16} /> Alert types</span>}
            subtitle="Toggle each alert and set who receives it. Unconfigured types are skipped."
            action={<button className="btn-ghost !px-2 !py-1 !text-xs" onClick={settings.refresh}><RefreshCw size={12} /> Refresh</button>}
          />
          {settings.loading && !data.routes.length ? (
            <TableSkeleton rows={6} cols={4} />
          ) : data.routes.length === 0 ? (
            <EmptyState icon={<BellRing size={24} />} title="No alert types" body="The catalog is empty." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">Alert</th>
                    <th className="th">Severity</th>
                    <th className="th">Recipients</th>
                    <th className="th">Status</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.routes.map((route) => (
                    <tr key={route.key} className="border-b border-phantix-700/20 hover:bg-phantix-900/30">
                      <td className="td">
                        <p className="text-sm font-medium text-slate-200">{route.label}</p>
                        <p className="mt-0.5 max-w-[30rem] text-xs text-slate-500">{route.description}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-600">{route.key}</p>
                      </td>
                      <td className="td"><SeverityBadge severity={route.severity} /></td>
                      <td className="td">
                        {route.recipients_to.length ? (
                          <div className="flex flex-wrap gap-1">
                            {route.recipients_to.slice(0, 3).map((r) => (
                              <span key={r} className="chip text-[11px] text-slate-300">{r}</span>
                            ))}
                            {route.recipients_to.length > 3 && <span className="text-xs text-slate-500">+{route.recipients_to.length - 3}</span>}
                            {route.recipients_source !== "route" && (
                              <span className="text-[11px] text-slate-500">({route.recipients_source})</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">Not configured. Skipped.</span>
                        )}
                        {(route.cc_email || route.bcc_email) && (
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {route.cc_email && <>cc: {route.cc_email} </>}
                            {route.bcc_email && <>bcc: {route.bcc_email}</>}
                          </p>
                        )}
                      </td>
                      <td className="td">
                        <button onClick={() => void toggleRoute(route)} title="Toggle alert" className="focus:outline-none">
                          <StatusBadge status={route.enabled ? "active" : "closed"} />
                        </button>
                      </td>
                      <td className="td text-right">
                        <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => openRoute(route)}>
                          <Pencil size={12} /> Recipients
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Growth milestones */}
      <Card className="mt-4">
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><TrendingUp size={16} /> Growth milestones</span>}
          subtitle="Comma-separated thresholds per metric. Alerts fire once per threshold, ever."
          action={<button className="btn-primary !px-3 !py-1.5 !text-xs" disabled={busy} onClick={() => void saveThresholds()}><Save size={12} /> Save thresholds</button>}
        />
        {metrics.loading && !metrics.data.length ? (
          <StatGridSkeleton count={4} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {metrics.data.map((m) => (
                <StatCard key={m.metric} label={m.label} value={m.value == null ? "Not set" : m.value.toLocaleString()} icon={<Activity size={16} />} />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.data.map((m) => (
                <div key={m.metric}>
                  <label className="label">{m.label} thresholds</label>
                  <input
                    className="input"
                    value={thresholds[m.metric] ?? ""}
                    onChange={(e) => setThresholds((p) => ({ ...p, [m.metric]: e.target.value }))}
                    placeholder="100, 1000, 10000"
                  />
                </div>
              ))}
            </div>
            {!data.milestone_cross_db_enabled && (
              <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck size={13} /> Scans/findings counts are disabled server-side
                (<span className="font-mono">STAFF_ALERT_MILESTONE_CROSS_DB_ENABLED</span>); orgs and users are live.
              </p>
            )}
          </>
        )}
      </Card>

      {/* Recent activity */}
      <Card className="mt-4">
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><Activity size={16} /> Recent activity</span>}
          subtitle="Every internal alert and acknowledgement, with delivery status."
          action={<button className="btn-ghost !px-2 !py-1 !text-xs" onClick={events.refresh}><RefreshCw size={12} /> Refresh</button>}
        />
        {events.loading && !events.data.length ? (
          <TableSkeleton rows={6} cols={5} />
        ) : events.data.length === 0 ? (
          <EmptyState icon={<Activity size={24} />} title="No alerts yet" body="Trigger an event or send a test to see it here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-phantix-700/40">
                  <th className="th">When</th>
                  <th className="th">Alert</th>
                  <th className="th">Reference</th>
                  <th className="th">Kind</th>
                  <th className="th">Recipients</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {events.data.map((e) => (
                  <tr key={e.id} className="border-b border-phantix-700/20 hover:bg-phantix-900/30">
                    <td className="td whitespace-nowrap text-xs text-slate-500">{e.created_at ? timeAgo(e.created_at) : "Not set"}</td>
                    <td className="td">
                      <p className="max-w-[28rem] truncate text-sm text-slate-300" title={e.title}>{e.title}</p>
                      <p className="font-mono text-[11px] text-slate-600">{e.alert_key}</p>
                    </td>
                    <td className="td font-mono text-[12px] text-gold-300">{e.reference || "Not set"}</td>
                    <td className="td"><span className="chip text-[11px] text-slate-400">{e.message_kind === "acknowledgement" ? "ack" : "alert"}</span></td>
                    <td className="td text-xs text-slate-400">{(e.recipients_to || []).join(", ") || "Not set"}</td>
                    <td className="td">
                      <StatusBadge status={e.status} />
                      {e.status === "failed" && e.last_error && (
                        <p className="mt-0.5 max-w-[18rem] truncate text-[11px] text-severity-critical/80" title={e.last_error}>{e.last_error}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recipients editor */}
      <Modal open={Boolean(routeEditor)} onClose={() => !busy && setRouteEditor(null)} title={routeEditor ? `Recipients: ${routeEditor.label}` : "Recipients"}>
        <div className="space-y-4">
          <div>
            <label className="label">To (comma-separated)</label>
            <textarea className="input !min-h-[64px] text-sm" value={routeForm.to} onChange={(e) => setRouteForm((p) => ({ ...p, to: e.target.value }))} placeholder="ops@phantixlabs.com, support@phantixlabs.com" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Cc (optional)</label>
              <input className="input" value={routeForm.cc} onChange={(e) => setRouteForm((p) => ({ ...p, cc: e.target.value }))} placeholder="manager@phantixlabs.com" />
            </div>
            <div>
              <label className="label">Bcc (optional)</label>
              <input className="input" value={routeForm.bcc} onChange={(e) => setRouteForm((p) => ({ ...p, bcc: e.target.value }))} placeholder="archive@phantixlabs.com" />
            </div>
          </div>
          <p className="text-xs text-slate-500">Leave everything blank to skip this alert type entirely.</p>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" disabled={busy} onClick={() => setRouteEditor(null)}><X size={14} /> Cancel</button>
            <button className="btn-primary" disabled={busy} onClick={() => void saveRoute()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save recipients
            </button>
          </div>
        </div>
      </Modal>

      {/* Send test */}
      <Modal open={testOpen} onClose={() => !busy && setTestOpen(false)} title="Send a test internal alert">
        <div className="space-y-4">
          <div>
            <label className="label">Alert type</label>
            <select className="input" value={testKey} onChange={(e) => setTestKey(e.target.value)}>
              {data.routes.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Override recipients (optional)</label>
            <input className="input" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@phantixlabs.com" />
            <p className="mt-1 text-[11px] text-slate-500">Blank uses the configured recipients for this alert type.</p>
          </div>
          <p className="flex items-start gap-2 text-xs text-slate-500">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /> Tests bypass the environment gate but still use the real SMTP relay and sender.
          </p>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" disabled={busy} onClick={() => setTestOpen(false)}><X size={14} /> Cancel</button>
            <button className="btn-primary" disabled={busy || !testKey} onClick={() => void sendTest()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send test
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
