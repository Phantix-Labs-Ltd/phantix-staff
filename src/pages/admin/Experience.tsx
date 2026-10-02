import React, { useState } from "react";
import { Zap, RefreshCw, Eye, EyeOff, ChevronDown, ChevronUp, Layers, Navigation, BookOpen, Link2, Clock, Plus, Edit3 } from "lucide-react";
import { PageHeader, Card, CardHeader, StatusBadge, TableSkeleton, EmptyState, Modal } from "@/components/ui";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE } from "@/lib/api";
import { cx, timeAgo } from "@/lib/utils";

type ExpNavItem = { id: string; label: string; path: string; icon: string };
type ExpOnboarding = { id: string; title: string; description: string | null; action: string; params: Record<string, string> };
type ExpService = {
  service_key: string; label: string; description: string;
  modules: string[]; nav: ExpNavItem[]; dashboard_widgets: string[];
  onboarding: ExpOnboarding[]; requires_connections: string[];
  is_active: boolean; sort_order: number;
  created_at: string; updated_at: string; updated_by: string;
};

export default function ExperienceAdmin() {
  const { toast } = useStore();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const resource = useResource<ExpService[]>(
    async (signal) => {
      if (DEMO_MODE) return [];
      const raw = await api.get<any>("/admin/experience-services");
      const list = Array.isArray(raw) ? raw : (raw?.items ?? []);
      return (list as any[]).map((s) => ({
        service_key: String(s.service_key ?? s.key ?? ""),
        label: String(s.label ?? s.name ?? ""),
        description: String(s.description ?? ""),
        modules: Array.isArray(s.modules) ? s.modules.map(String) : [],
        nav: Array.isArray(s.nav) ? s.nav : [],
        dashboard_widgets: Array.isArray(s.dashboard_widgets) ? s.dashboard_widgets.map(String) : [],
        onboarding: Array.isArray(s.onboarding) ? s.onboarding : [],
        requires_connections: Array.isArray(s.requires_connections) ? s.requires_connections.map(String) : [],
        is_active: s.is_active !== false,
        sort_order: Number(s.sort_order ?? 0),
        created_at: String(s.created_at ?? ""),
        updated_at: String(s.updated_at ?? ""),
        updated_by: (s.updated_by as string) ?? "",
      })) as ExpService[];
    },
    [],
  );

  const data = resource.data ?? [];
  const toggle = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  const [showCreate, setShowCreate] = useState(false);
  const [newService, setNewService] = useState({ service_key: "", label: "", description: "", modules: "", nav_json: "", sort_order: 10 });
  const [editing, setEditing] = useState<ExpService | null>(null);
  const [editForm, setEditForm] = useState({ label: "", description: "", modules: "", is_active: true, sort_order: 10 });

  const handleSeed = async () => {
    try {
      await api.post("/admin/experience-services/seed", {});
      toast("success", "Seeded", "Default services loaded");
      resource.refresh();
    } catch (e) {
      toast("error", "Seed failed", e instanceof Error ? e.message : "");
    }
  };

  const openEdit = (svc: ExpService) => {
    setEditing(svc);
    setEditForm({ label: svc.label, description: svc.description, modules: svc.modules.join(", "), is_active: svc.is_active, sort_order: svc.sort_order });
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api.patch(`/admin/experience-services/${editing.service_key}`, {
        label: editForm.label,
        description: editForm.description,
        modules: editForm.modules.split(",").map((s) => s.trim()).filter(Boolean),
        is_active: editForm.is_active,
        sort_order: Number(editForm.sort_order),
      });
      toast("success", "Service updated", editing.service_key);
      setEditing(null);
      resource.refresh();
    } catch (e) {
      toast("error", "Update failed", e instanceof Error ? e.message : "");
    }
  };

  const deactivate = async (svc: ExpService) => {
    try {
      await api.patch(`/admin/experience-services/${svc.service_key}`, { is_active: !svc.is_active });
      toast("success", svc.is_active ? "Deactivated" : "Activated", svc.service_key);
      resource.refresh();
    } catch (e) {
      toast("error", "Failed", e instanceof Error ? e.message : "");
    }
  };

  return (
    <div>
      <PageHeader
        title="Experience Services"
        description="Platform product modules --- each service defines nav, onboarding, widgets, and required connections"
        actions={
          <>
            <button onClick={() => setShowCreate(true)} className="btn-secondary text-sm px-3 py-1.5"><Plus size={14} /> New Service</button>
            <button onClick={handleSeed} className="btn-ghost text-sm px-3 py-1.5">
              <RefreshCw size={14} /> Seed Defaults
            </button>
          </>
        }
      />

      {resource.loading ? (
        <TableSkeleton rows={4} />
      ) : data.length === 0 ? (
        <EmptyState icon={<Zap size={24} />} title="No services" body="Seed defaults to populate the catalog" action={<button onClick={handleSeed} className="btn-primary">Seed Defaults</button>} />
      ) : (
        // One card with a divided row per service, not a card per service.
        <div className="card overflow-hidden divide-y divide-phantix-700/40">
          {data.sort((a, b) => a.sort_order - b.sort_order).map((svc) => {
            const open = !!expanded[svc.service_key];
            return (
              <div key={svc.service_key}>
                {/* Header */}
                <button
                  onClick={() => toggle(svc.service_key)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-phantix-800/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Zap size={16} className={svc.is_active ? "shrink-0 text-gold-400" : "shrink-0 text-slate-600"} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-100">{svc.label}</p>
                        {svc.is_active ? (
                          <span className="chip !py-0 text-[12px] text-emerald-400 bg-emerald-400/10 border-emerald-400/30"><Eye size={10} /> Active</span>
                        ) : (
                          <span className="chip !py-0 text-[12px] text-slate-400 bg-slate-400/10 border-slate-500/30"><EyeOff size={10} /> Inactive</span>
                        )}
                      </div>
                      <p className="truncate text-xs text-slate-500">{svc.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="text-[12px] font-mono text-slate-500">{svc.service_key}</span>
                    <span className="text-[12px] text-slate-600">#{svc.sort_order}</span>
                    {open ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                  </div>
                </button>

                {/* Expanded detail */}
                {open && (
                  <div className="border-t border-phantix-700/40 px-4 py-3 space-y-3 bg-phantix-900/30">
                    {/* Modules */}
                    {svc.modules.length > 0 && (
                      <div>
                        <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5"><Layers size={11} /> Modules</p>
                        <div className="flex flex-wrap gap-1">
                          {svc.modules.map((m) => (
                            <span key={m} className="chip text-[12px] text-phantix-300 bg-phantix-500/10 border-phantix-500/20">{m}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Navigation */}
                    {svc.nav.length > 0 && (
                      <div>
                        <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5"><Navigation size={11} /> Navigation</p>
                        <div className="space-y-1">
                          {svc.nav.map((n) => (
                            <div key={n.id} className="flex items-center gap-2 text-xs">
                              <span className="text-slate-600 w-16 font-mono">{n.icon}</span>
                              <span className="text-slate-300">{n.label}</span>
                              <span className="text-slate-600 font-mono">{n.path}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dashboard widgets */}
                    {svc.dashboard_widgets.length > 0 && (
                      <div>
                        <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Widgets</p>
                        <div className="flex flex-wrap gap-1">
                          {svc.dashboard_widgets.map((w) => (
                            <span key={w} className="text-[12px] text-slate-400 bg-phantix-800/60 rounded px-1.5 py-0.5">{w}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Connections */}
                    {svc.requires_connections.length > 0 && (
                      <div>
                        <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5"><Link2 size={11} /> Required Connections</p>
                        <div className="flex flex-wrap gap-1">
                          {svc.requires_connections.map((c) => (
                            <span key={c} className="chip text-[12px] text-severity-medium bg-severity-medium/10 border-severity-medium/20">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Onboarding */}
                    {svc.onboarding.length > 0 && (
                      <div>
                        <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5"><BookOpen size={11} /> Onboarding Steps</p>
                        <div className="space-y-1.5">
                          {svc.onboarding.map((step, i) => (
                            <div key={step.id} className="flex items-start gap-2 text-xs">
                              <span className="text-slate-600 font-mono w-4 shrink-0 mt-0.5">{i + 1}.</span>
                              <div>
                                <p className="text-slate-300">{step.title}</p>
                                <p className="text-slate-500">
                                  {step.action}
                                  {step.params?.path ? ` → ${step.params.path}` : ''}
                                  {step.params?.connection_purpose ? ` (${step.params.connection_purpose})` : ''}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Meta */}
                    <div className="flex items-center gap-3 text-[12px] text-slate-600 pt-1 border-t border-phantix-700/30">
                      <span className="flex items-center gap-1"><Clock size={10} /> Updated {timeAgo(svc.updated_at)}</span>
                      <span>by {svc.updated_by}</span>
                      <span>Created {new Date(svc.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex gap-1.5 pt-1">
                      <button onClick={() => openEdit(svc)} className="btn-secondary text-xs px-2 py-1"><Edit3 size={11} /> Edit</button>
                      <button onClick={() => deactivate(svc)} className="btn-ghost text-xs px-2 py-1 text-severity-medium">{svc.is_active ? "Deactivate" : "Activate"}</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing ? `Edit: ${editing.label}` : ""}>
        <div className="space-y-3">
          <div><label className="label">Label</label><input className="input" value={editForm.label} onChange={e => setEditForm(f => ({...f, label: e.target.value}))} /></div>
          <div><label className="label">Description</label><input className="input" value={editForm.description} onChange={e => setEditForm(f => ({...f, description: e.target.value}))} /></div>
          <div><label className="label">Modules (comma separated)</label><input className="input" value={editForm.modules} onChange={e => setEditForm(f => ({...f, modules: e.target.value}))} placeholder="assets,scans,findings" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Sort order</label><input className="input" type="number" value={editForm.sort_order} onChange={e => setEditForm(f => ({...f, sort_order: Number(e.target.value)}))} /></div>
            <div className="flex items-end pb-1"><label className="flex items-center gap-1.5 text-sm text-slate-300"><input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm(f => ({...f, is_active: e.target.checked}))} className="accent-gold-400" /> Active</label></div>
          </div>
          <button onClick={saveEdit} className="btn-primary w-full">Save Changes</button>
        </div>
      </Modal>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Experience Service">
        <div className="space-y-3">
          <div><label className="label">Service Key</label><input className="input font-mono" value={newService.service_key} onChange={e => setNewService(s => ({...s, service_key: e.target.value}))} placeholder="penetration_testing" /></div>
          <div><label className="label">Label</label><input className="input" value={newService.label} onChange={e => setNewService(s => ({...s, label: e.target.value}))} /></div>
          <div><label className="label">Description</label><input className="input" value={newService.description} onChange={e => setNewService(s => ({...s, description: e.target.value}))} /></div>
          <div><label className="label">Modules (comma separated)</label><input className="input" value={newService.modules} onChange={e => setNewService(s => ({...s, modules: e.target.value}))} placeholder="assets,scans,findings" /></div>
          <div><label className="label">Navigation (JSON array)</label><textarea className="input resize-none font-mono text-xs" rows={3} value={newService.nav_json} onChange={e => setNewService(s => ({...s, nav_json: e.target.value}))} placeholder='[{"id":"assets","label":"Assets","path":"/assets","icon":"server"}]' /></div>
          <button onClick={async () => {
            try {
              const body: any = { service_key: newService.service_key, label: newService.label, description: newService.description, modules: newService.modules.split(",").map(s => s.trim()).filter(Boolean), sort_order: newService.sort_order, is_active: true };
              if (newService.nav_json) body.nav = JSON.parse(newService.nav_json);
              await api.post("/admin/experience-services", body);
              toast("success", "Service created"); setShowCreate(false); resource.refresh();
            } catch(e) { toast("error", e instanceof Error ? e.message : "Invalid JSON"); }
          }} className="btn-primary w-full">Create Service</button>
        </div>
      </Modal>
    </div>
  );
}
