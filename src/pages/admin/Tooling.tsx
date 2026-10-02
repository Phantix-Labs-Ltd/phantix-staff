import React, { useState } from "react";
import { Wrench, RefreshCw, DollarSign, Plus, Edit3, EyeOff, Eye, Upload, AlertTriangle } from "lucide-react";
import { PageHeader, Card, StatusBadge, Modal, TableSkeleton, EmptyState, StatGridSkeleton } from "@/components/ui";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE } from "@/lib/api";
import { formatNaira, cx } from "@/lib/utils";

type AdminTool = { id: number; tool_key: string; name: string; description: string; category: string; pricing_model: string; tier?: string; monthly_price_ngn: number; yearly_month_equivalent?: number; providability?: string; requires_platform_subscription?: boolean; is_active: boolean; is_featured: boolean; features: string[]; sort_order: number; docs_url?: string };

const tierLabels: Record<string, { label: string; color: string }> = {
  free: { label: "Free", color: "text-emerald-300 border-emerald-400/20 bg-emerald-400/10" },
  premium_included: { label: "Premium", color: "text-gold-300 border-gold-400/20 bg-gold-400/10" },
  addon_subscription: { label: "Add-on", color: "text-blue-300 border-blue-400/20 bg-blue-400/10" },
  addon_engagement: { label: "Engagement", color: "text-purple-300 border-purple-400/20 bg-purple-400/10" },
} as const;

const demoTools: AdminTool[] = [
  { id: 1, tool_key: "config_inspector", name: "Config Inspector", description: "Inspect database security rules, roles, and engine configuration", category: "scanning", pricing_model: "free", tier: "free", monthly_price_ngn: 0, is_active: true, is_featured: true, features: ["metadata_scan","role_audit","rls_policy_view"], sort_order: 10 },
  { id: 2, tool_key: "vulnerability_scanner", name: "Vulnerability Scanner", description: "Scheduled and on-demand vulnerability scanning with findings export", category: "scanning", pricing_model: "paid", tier: "premium_included", monthly_price_ngn: 2500, is_active: true, is_featured: true, features: ["scheduled_scans","severity_scoring","remediation_hints"], sort_order: 20 },
  { id: 3, tool_key: "compliance_workbench", name: "Compliance Workbench", description: "Control mapping, evidence collection, and audit readiness", category: "compliance", pricing_model: "paid", tier: "addon_subscription", monthly_price_ngn: 3000, is_active: true, is_featured: true, features: ["frameworks","evidence_locker","gap_analysis"], sort_order: 30 },
  { id: 4, tool_key: "soc_alert_console", name: "SOC Alert Console", description: "Alert triage workspace for SOC-as-a-Service and MSSP clients", category: "monitoring", pricing_model: "paid", tier: "addon_subscription", monthly_price_ngn: 5000, is_active: false, is_featured: false, features: ["alert_queue","sla_timer","escalation"], sort_order: 40 },
  { id: 5, tool_key: "caido", name: "Caido Advanced Proxy", description: "Advanced deep web/API analysis . It covers proxy history, Replay, findings and workflows. Replaces Burp as the primary advanced path.", category: "scanning", pricing_model: "paid", tier: "addon_subscription", monthly_price_ngn: 4000, is_active: true, is_featured: true, features: ["proxy_history","httpql","replay","workflows","scope_presets"], sort_order: 15, docs_url: "https://docs.phantixlabs.com/tools/caido" },
];

type Provision = { id: number; organization_id: number; tool_key: string; status: string; admin_notes: string; created_at: string };

// The backend's unfiltered catalog query (GET /admin/tooling/tools) currently
// returns 500 while a category-filtered query succeeds — a serialization
// failure on a row that does not match PlatformToolRead. Load the known
// categories in parallel and merge them so the page still works; revert to a
// single request once the backend list endpoint is fixed.
const TOOL_CATEGORIES = ["scanning", "compliance", "monitoring", "reporting", "integration", "incident"] as const;

async function loadToolCatalog(): Promise<AdminTool[]> {
  if (DEMO_MODE) return demoTools;
  const pages = await Promise.all(
    TOOL_CATEGORIES.map(async (category) => {
      try {
        return await api.get<AdminTool[]>("/admin/tooling/tools", { params: { include_inactive: true, category } });
      } catch {
        return null; // one bad category should not blank the whole catalog
      }
    }),
  );
  const loaded = pages.filter((page): page is AdminTool[] => Array.isArray(page));
  if (loaded.length === 0) throw new Error("Could not reach the tooling catalog");
  const byId = new Map<number, AdminTool>();
  for (const page of loaded) {
    for (const tool of page) byId.set(tool.id, tool);
  }
  return [...byId.values()];
}

export default function ToolingAdmin() {
  const { toast } = useStore();
  const [tab, setTab] = useState<"catalog" | "provisions">("catalog");
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [showProvision, setShowProvision] = useState(false);
  const [provOrgId, setProvOrgId] = useState("");
  const [provToolKey, setProvToolKey] = useState("");
  const emptyForm = { tool_key: "", name: "", description: "", category: "scanning", pricing_model: "free" as string, monthly_price_ngn: 0, features: "", providability: "all", requires_platform_subscription: false, is_active: true, is_featured: false, sort_order: 0, docs_url: "" };
  const [form, setForm] = useState(emptyForm);
  const [provisions, setProvisions] = useState<Provision[]>([]);
  const [stats, setStats] = useState<{ total_tools: number; active_tools: number; free_tools: number; paid_tools: number; provisions: number; active_subscriptions: number } | null>(null);
  const [extraLoading, setExtraLoading] = useState(!DEMO_MODE);

  const toolsRes = useResource<AdminTool[]>(loadToolCatalog, []);
  const data = DEMO_MODE ? demoTools : (toolsRes.data ?? []);

  React.useEffect(() => {
    if (DEMO_MODE) return;
    Promise.allSettled([
      api.get<any>("/admin/tooling/provisions?limit=50").then(r => setProvisions(r?.items ?? [])),
      api.get<any>("/admin/tooling/stats").then(r => setStats(r)),
    ]).finally(() => setExtraLoading(false));
  }, []);

  const handleSeed = async () => { try { await api.post("/admin/tooling/tools/seed", {}); toast("success", "Seeded"); toolsRes.refresh(); } catch (e) { toast("error", "Seed failed"); } };
  const handleCreate = async () => {
    if (!form.tool_key || !form.name) { toast("error", "Tool key and name required"); return; }
    try {
      await api.post("/admin/tooling/tools", { ...form, pricing_model: form.pricing_model, monthly_price_ngn: form.pricing_model === "paid" ? form.monthly_price_ngn : 0, features: form.features.split(",").map(f => f.trim()).filter(Boolean) });
      toast("success", "Created"); setShowCreate(false); setForm(emptyForm); toolsRes.refresh();
    } catch (e) { toast("error", "Failed", e instanceof Error ? e.message : ""); }
  };
  const handleEdit = async () => {
    if (!editId) return;
    try { await api.patch(`/admin/tooling/tools/${editId}`, { pricing_model: form.pricing_model, monthly_price_ngn: form.pricing_model === "paid" ? form.monthly_price_ngn : 0, is_featured: form.is_featured, is_active: form.is_active }); toast("success", "Updated"); setEditId(null); toolsRes.refresh(); } catch (e) { toast("error", "Failed"); }
  };
  const handleProvision = async () => {
    if (!provOrgId || !provToolKey) return;
    try { await api.post("/admin/tooling/provisions", { organization_id: Number(provOrgId), tool_key: provToolKey, status: "provisioned", admin_notes: "Manual grant" }); toast("success", "Granted"); setShowProvision(false); setProvOrgId(""); setProvToolKey(""); refreshProvisions(); } catch (e) { toast("error", "Failed"); }
  };
  const handleSuspendProvision = async (p: Provision) => {
    const next = p.status === "provisioned" ? "suspended" : "provisioned";
    try { await api.patch(`/admin/tooling/provisions/${p.id}`, { status: next, admin_notes: p.admin_notes }); toast("success", `${next}`, `Provision ${p.id}`); refreshProvisions(); } catch (e) { toast("error", "Failed"); }
  };
  const refreshProvisions = () => {
    if (!DEMO_MODE) api.get<any>("/admin/tooling/provisions?limit=50").then(r => setProvisions(r?.items ?? [])).catch(() => {});
  };
  const handleDelete = async (id: number) => { try { await api.delete(`/admin/tooling/tools/${id}`); toast("success", "Deactivated"); toolsRes.refresh(); } catch (e) { toast("error", "Failed"); } };

  const openEdit = (t: AdminTool) => { setForm({ ...emptyForm, tool_key: t.tool_key, name: t.name, pricing_model: t.pricing_model as any, monthly_price_ngn: t.monthly_price_ngn, is_featured: t.is_featured, is_active: t.is_active }); setEditId(t.id); };

  return (
    <div>
      <PageHeader title="Tooling Marketplace" description={`${data.length} tools in catalog`} actions={<><button onClick={handleSeed} className="btn-ghost text-sm px-3 py-1.5"><RefreshCw size={14} /> Seed</button><button onClick={() => { setForm(emptyForm); setShowCreate(true); }} className="btn-primary text-sm"><Plus size={14} /> New Tool</button></>} />
      <div className="mb-4 flex gap-1.5">
        {[{ id: "catalog", label: "Catalog" }, { id: "provisions", label: "Provisions" }].map(t => <button key={t.id} onClick={() => setTab(t.id as any)} className={cx("rounded-lg px-3 py-1.5 text-xs font-medium border", tab === t.id ? "border-gold-400/40 bg-gold-400/12 text-gold-300" : "border-transparent text-slate-500 hover:text-slate-300")}>{t.label}</button>)}
      </div>

      {extraLoading && !stats && <div className="mb-4"><StatGridSkeleton count={6} /></div>}
      {stats && (
        <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="rounded-md border border-phantix-700/40 bg-phantix-950/50 p-3 text-center"><p className="font-display text-lg font-bold text-white">{stats.total_tools ?? 0}</p><p className="text-[12px] uppercase tracking-wider text-slate-600">Total tools</p></div>
          <div className="rounded-md border border-phantix-700/40 bg-phantix-950/50 p-3 text-center"><p className="font-display text-lg font-bold text-emerald-400">{stats.active_tools ?? 0}</p><p className="text-[12px] uppercase tracking-wider text-slate-600">Active</p></div>
          <div className="rounded-md border border-phantix-700/40 bg-phantix-950/50 p-3 text-center"><p className="font-display text-lg font-bold text-phantix-300">{stats.free_tools ?? 0}</p><p className="text-[12px] uppercase tracking-wider text-slate-600">Free</p></div>
          <div className="rounded-md border border-phantix-700/40 bg-phantix-950/50 p-3 text-center"><p className="font-display text-lg font-bold text-gold-400">{stats.paid_tools ?? 0}</p><p className="text-[12px] uppercase tracking-wider text-slate-600">Paid</p></div>
          <div className="rounded-md border border-phantix-700/40 bg-phantix-950/50 p-3 text-center"><p className="font-display text-lg font-bold text-phantix-300">{stats.provisions ?? 0}</p><p className="text-[12px] uppercase tracking-wider text-slate-600">Provisions</p></div>
          <div className="rounded-md border border-phantix-700/40 bg-phantix-950/50 p-3 text-center"><p className="font-display text-lg font-bold text-emerald-400">{stats.active_subscriptions ?? 0}</p><p className="text-[12px] uppercase tracking-wider text-slate-600">Active subs</p></div>
        </div>
      )}

      {tab === "catalog" && (
        toolsRes.loading ? <TableSkeleton rows={4} /> : toolsRes.error ? <EmptyState icon={<AlertTriangle size={24} />} title="Could not load catalog" body={toolsRes.error} action={<button onClick={() => toolsRes.refresh()} className="btn-primary">Retry</button>} /> : data.length === 0 ? <EmptyState icon={<Wrench size={24} />} title="No tools" action={<button onClick={handleSeed} className="btn-primary">Seed Defaults</button>} /> : (
          <div className="grid md:grid-cols-2 gap-4">
            {data.sort((a, b) => a.sort_order - b.sort_order).map(t => (
              <Card key={t.id} className={cx("", !t.is_active && "opacity-60")}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2"><Wrench size={16} className={t.is_active ? "text-phantix-400" : "text-slate-600"} /><h3 className="font-display text-sm font-semibold text-white">{t.name}</h3>{t.is_featured && <span className="chip text-[12px] text-gold-400 bg-gold-400/10 border-gold-400/20">Featured</span>}</div>
                  <StatusBadge status={t.is_active ? "active" : "closed"} />
                </div>
                <p className="text-xs text-slate-400 mb-3">{t.description}</p>
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  <span className="chip text-[12px] text-phantix-300 bg-phantix-500/10 border-phantix-500/20">{t.category}</span>
                  {(t.tier || t.pricing_model) && (
                    <span className={cx("chip text-[12px] capitalize", (tierLabels[t.tier ?? ""] ?? tierLabels[t.pricing_model])?.color ?? "text-slate-400 bg-slate-400/10 border-slate-500/30")}>
                      {(tierLabels[t.tier ?? ""] ?? tierLabels[t.pricing_model])?.label ?? t.pricing_model}
                    </span>
                  )}
                  {t.monthly_price_ngn > 0 && <span className="text-[12px] font-mono text-slate-400 flex items-center gap-0.5"><DollarSign size={10} />{formatNaira(t.monthly_price_ngn)}/mo</span>}
                </div>
                <div className="flex flex-wrap gap-1 mb-2">{(t.features ?? []).map(f => <span key={f} className="text-[12px] text-slate-500 bg-phantix-800/60 rounded px-1.5 py-0.5">{f}</span>)}</div>
                <div className="flex gap-1.5">
                  <button onClick={() => openEdit(t)} className="btn-ghost text-xs px-2 py-1"><Edit3 size={11} /> Edit</button>
                  <button onClick={() => handleDelete(t.id)} className="btn-ghost text-xs px-2 py-1 text-severity-critical"><EyeOff size={11} /> {t.is_active ? "Deactivate" : "Delete"}</button>
                  {t.is_active && <button onClick={() => { setProvToolKey(t.tool_key); setShowProvision(true); }} className="btn-ghost text-xs px-2 py-1 text-gold-400"><Upload size={11} /> Grant</button>}
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === "provisions" && (
        extraLoading && provisions.length === 0 ? <TableSkeleton rows={4} /> : provisions.length === 0 ? <EmptyState icon={<Eye size={24} />} title="No provisions" body="Grant tools to organizations via the catalog." /> : (
          <Card className="!p-0 overflow-x-auto"><table className="w-full min-w-[640px]"><thead><tr className="border-b border-phantix-700/40"><th className="th">Tool Key</th><th className="th">Org ID</th><th className="th">Status</th><th className="th">Notes</th><th className="th w-12" /></tr></thead><tbody>{provisions.map(p => <tr key={p.id} className="border-b border-phantix-800/40"><td className="td font-mono text-xs text-gold-300">{p.tool_key}</td><td className="td text-xs">#{p.organization_id}</td><td className="td"><span className={cx("chip text-[12px]", p.status === "provisioned" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-slate-500/50 bg-slate-500/10 text-slate-500")}>{p.status}</span></td><td className="td text-xs text-slate-400 max-w-[200px] truncate">{p.admin_notes || "-"}</td><td className="td"><button onClick={() => handleSuspendProvision(p)} className="btn-ghost text-xs px-2 py-1 text-severity-medium">{p.status === "provisioned" ? "Suspend" : "Re-enable"}</button></td></tr>)}</tbody></table></Card>
        )
      )}

      <Modal open={showCreate || editId !== null} onClose={() => { setShowCreate(false); setEditId(null); }} title={editId ? "Edit Tool" : "Create Tool"}>
        <div className="space-y-3">
          {!editId && <><div className="grid grid-cols-2 gap-2"><div><label className="label">Tool Key</label><input className="input" value={form.tool_key} onChange={e => setForm({...form,tool_key:e.target.value})} placeholder="my_tool" /></div><div><label className="label">Name</label><input className="input" value={form.name} onChange={e => setForm({...form,name:e.target.value})} /></div></div>
          <div><label className="label">Description</label><textarea className="input" value={form.description} onChange={e => setForm({...form,description:e.target.value})} /></div></>}
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Pricing</label><select className="input" value={form.pricing_model} onChange={e => setForm({...form,pricing_model:e.target.value as any})}><option value="free">Free</option><option value="paid">Paid</option></select></div>
            {form.pricing_model === "paid" && <div><label className="label">Price (NGN/month)</label><input className="input font-mono" type="number" value={form.monthly_price_ngn} onChange={e => setForm({...form,monthly_price_ngn:Number(e.target.value)})} /></div>}
          </div>
          {!editId && <div><label className="label">Features (comma-separated)</label><input className="input" value={form.features} onChange={e => setForm({...form,features:e.target.value})} placeholder="scan,export,alert" /></div>}
          <div className="flex items-center gap-3"><label className="flex items-center gap-1.5"><input type="checkbox" checked={form.is_featured} onChange={e => setForm({...form,is_featured:e.target.checked})} className="accent-gold-400" /> Featured</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={form.is_active} onChange={e => setForm({...form,is_active:e.target.checked})} className="accent-gold-400" /> Active</label></div>
          <button onClick={editId ? handleEdit : handleCreate} className="btn-primary w-full">{editId ? "Save Changes" : "Create Tool"}</button>
        </div>
      </Modal>

      <Modal open={showProvision} onClose={() => setShowProvision(false)} title="Grant Tool">
        <div className="space-y-3">
          <div><label className="label">Organization ID</label><input className="input font-mono" value={provOrgId} onChange={e => setProvOrgId(e.target.value)} placeholder="24" /></div>
          <div><label className="label">Tool Key</label><input className="input font-mono" value={provToolKey} onChange={e => setProvToolKey(e.target.value)} readOnly /></div>
          <button onClick={handleProvision} className="btn-primary w-full">Grant Access</button>
        </div>
      </Modal>
    </div>
  );
}
