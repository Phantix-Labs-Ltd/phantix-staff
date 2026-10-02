import React, { useState } from "react";
import { Brain, Settings, Activity, Zap, RefreshCw, Play, DollarSign, Plus, FileText, ShieldAlert, GitBranch, Loader2, Eye, Pencil, Save, X, Server } from "lucide-react";
import { PageHeader, Card, CardHeader, CollapsibleCard, StatCard, StatusBadge, TableSkeleton, EmptyState, Tabs, Modal } from "@/components/ui";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE } from "@/lib/api";
import { cx } from "@/lib/utils";

type Prompt = { id: number; prompt_key: string; version: number; is_active: boolean; system_prompt?: string; user_template?: string; allowed_evidence_keys?: string[]; changelog?: string };
type DataScope = { prompt_key: string; allowed_evidence_keys: string[]; updated_at: string };
type PromptDetail = {
  prompt_key: string;
  version: number;
  is_active: boolean;
  system_prompt: string;
  user_template: string;
  output_schema?: Record<string, unknown>;
  allowed_evidence_keys: string[];
  changelog?: string;
  updated_by?: string;
  updated_at?: string;
};

const demoAiRaw = {
  ai_enabled_platform: true,
  default_provider: "deepseek",
  providers_configured: {
    deepseek: true,
    qwen: false,
    kimi: true,
    openai: false,
  },
  deepseek_ready: true,
  ai_pentest_ready: true,
  agentrouter_ready: false,
  active_provider_hint: "deepseek",
  modes: ["economy", "balanced", "enterprise"],
  agents: ["finding_explanation", "executive_summary", "compliance_explain"],
};

const demoPrompts: Prompt[] = [
  { id: 1, prompt_key: "finding_explanation", version: 2, is_active: true, system_prompt: "Explain findings accurately using only verified evidence.", user_template: "Finding: {{title}}\nSeverity: {{severity}}" },
  { id: 2, prompt_key: "executive_summary", version: 1, is_active: true, system_prompt: "Write a concise executive summary of the report.", user_template: "Report: {{sections}}" },
  { id: 3, prompt_key: "compliance_explain", version: 3, is_active: false, system_prompt: "Explain compliance control status.", user_template: "Control: {{control_id}}" },
];
const demoSettings = { enabled: true, default_provider: "deepseek", mode: "balanced", modes: ["economy", "balanced", "enterprise"], prompts_count: 3, providers: [{ id: "deepseek", configured: true, active: true }] };

const demoCosts = [
  { organization_id: 1, year_month: "2026-07", tokens_used: 128400, cost_usd: 6.42, call_count: 84 },
  { organization_id: 11, year_month: "2026-07", tokens_used: 51200, cost_usd: 2.56, call_count: 41 },
];
const demoAudit = [
  { id: 1, organization_id: 11, agent_name: "finding_explanation", prompt_key: "finding_explanation", status: "completed", tokens_used: 2100, cost_usd: 0.11, model_provider: "deepseek", created_at: new Date().toISOString() },
  { id: 2, organization_id: 11, agent_name: "executive_summary", prompt_key: "executive_summary", status: "completed", tokens_used: 3400, cost_usd: 0.17, model_provider: "deepseek", created_at: new Date().toISOString() },
];

export default function AiAdmin() {
  const { toast } = useStore();
  const [tab, setTab] = useState("overview");
  const [activating, setActivating] = useState(false);
  const [showNewPrompt, setShowNewPrompt] = useState(false);
  const [newPrompt, setNewPrompt] = useState({ prompt_key: "", system_prompt: "", user_template: "", changelog: "", activate: true });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<PromptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<"view" | "edit">("view");
  const [editForm, setEditForm] = useState({ system_prompt: "", user_template: "", allowed_evidence_keys: "", changelog: "", activate: false });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editScopeKey, setEditScopeKey] = useState<string | null>(null);
  const [scopeForm, setScopeForm] = useState("");

  const openDetail = async (key: string) => {
    setDetailKey(key);
    setDetail(null);
    setDetailTab("view");
    setDetailLoading(true);
    try {
      let res: any = null;
      if (!DEMO_MODE) {
        try { res = await api.get<any>(`/admin/ai/prompts/${key}`); }
        catch { res = { prompt_key: key }; }
      } else {
        res = demoPrompts.find((p) => p.prompt_key === key) || { prompt_key: key };
      }
      const versions: any[] = Array.isArray(res.versions) ? res.versions : [];
      const activeVersion =
        versions.find((v) => v?.is_active) ??
        versions.find((v) => Number(v?.version) === Number(res.active)) ??
        versions[0] ??
        {};
      // The detail endpoint nests prompt text under `versions[]`; older/simple
      // payloads may still put it at the top level, so accept both.
      const src: any = {
        ...res,
        ...activeVersion,
        system_prompt: res.system_prompt ?? activeVersion.system_prompt,
        user_template: res.user_template ?? activeVersion.user_template,
        allowed_evidence_keys: res.allowed_evidence_keys ?? activeVersion.allowed_evidence_keys,
      };
      const detailObj: PromptDetail = {
        prompt_key: String(src.prompt_key ?? key),
        version: Number(src.version ?? res.active_version ?? 0),
        is_active: Boolean(src.is_active ?? res.active),
        system_prompt: String(src.system_prompt ?? ""),
        user_template: String(src.user_template ?? ""),
        output_schema: src.output_schema,
        allowed_evidence_keys: Array.isArray(src.allowed_evidence_keys) ? src.allowed_evidence_keys.map(String) : [],
        changelog: String(src.changelog ?? ""),
        updated_by: (src.updated_by as string) ?? undefined,
        updated_at: (src.updated_at as string) ?? undefined,
      };
      setDetail(detailObj);
      setEditForm({
        system_prompt: detailObj.system_prompt,
        user_template: detailObj.user_template,
        allowed_evidence_keys: detailObj.allowed_evidence_keys.join(", "),
        changelog: detailObj.changelog ?? "",
        activate: false,
      });
    } catch (e) {
      toast("error", "Failed to load prompt", e instanceof Error ? e.message : "");
    } finally {
      setDetailLoading(false);
    }
  };

  const savePromptEdit = async () => {
    if (!detailKey) return;
    setSavingEdit(true);
    try {
      const body: Record<string, unknown> = {
        system_prompt: editForm.system_prompt,
        user_template: editForm.user_template || undefined,
        changelog: editForm.changelog || undefined,
      };
      if (editForm.activate) body.activate = true;
      const allowed = editForm.allowed_evidence_keys.split(",").map((s) => s.trim()).filter(Boolean);
      if (allowed.length) body.allowed_evidence_keys = allowed;
      if (!DEMO_MODE) await api.patch(`/admin/ai/prompts/${detailKey}`, body);
      toast("success", "Prompt updated", `${detailKey}. New version created.`);
      setDetailTab("view");
      setDetail(null);
      prompts.refresh();
      await openDetail(detailKey);
    } catch (e) {
      toast("error", "Update failed", e instanceof Error ? e.message : "");
    } finally {
      setSavingEdit(false);
    }
  };

  const saveScope = async (key: string) => {
    try {
      const allowed = scopeForm.split(",").map((s) => s.trim()).filter(Boolean);
      if (!DEMO_MODE) await api.put(`/admin/ai/data-scopes/${key}`, { allowed_evidence_keys: allowed, changelog: "Updated via staff portal" });
      toast("success", "Data scope updated", key);
      setEditScopeKey(null);
      scopes.refresh();
    } catch (e) {
      toast("error", "Update failed", e instanceof Error ? e.message : "");
    }
  };

  const handleActivatePrompt = async (key: string, version: number) => {
    try { await api.post(`/admin/ai/prompts/${key}/activate`, { version }); toast("success", `Prompt ${key} v${version} activated`); prompts.refresh(); }
    catch (e) { toast("error", "Activate failed", e instanceof Error ? e.message : ""); }
  };

  const handleCreatePrompt = async () => {
    if (!newPrompt.prompt_key) { toast("error", "Missing key"); return; }
    try { await api.post("/admin/ai/prompts", newPrompt); toast("success", "Prompt created"); setShowNewPrompt(false); setNewPrompt({ prompt_key: "", system_prompt: "", user_template: "", changelog: "", activate: true }); prompts.refresh(); }
    catch (e) { toast("error", "Create failed", e instanceof Error ? e.message : ""); }
  };

  const handleConsensusTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post<any>("/admin/ai/consensus/test", { evidence: { title: "Test finding", severity: "high", description: "Sample evidence for dry-run" } });
      setTestResult(typeof res === "string" ? res : JSON.stringify(res, null, 2));
      toast("success", "Consensus test complete", "Dry-run multi-model result returned");
    } catch (e) {
      toast("error", "Consensus test failed", e instanceof Error ? e.message : "");
    } finally {
      setTesting(false);
    }
  };

  const ai = useResource<any>(
    async (signal) => {
      if (DEMO_MODE) return demoAiRaw;
      return api.get<any>("/admin/ai/settings");
    },
    [],
  );

  const prompts = useResource<Prompt[]>(
    async (signal) => {
      if (DEMO_MODE) return demoPrompts;
      try {
        const res = await api.get<any>("/admin/ai/prompts");
        const raw = Array.isArray(res) ? res : (res?.items ?? []);
        return (raw as any[]).map((p) => ({ id: Number(p.id ?? 0), prompt_key: String(p.prompt_key ?? ""), version: Number(p.active_version ?? p.version ?? 0), is_active: Boolean(p.is_active ?? p.active) }));
      } catch { return []; }
    },
    [] as Prompt[],
  );

  const scopes = useResource<DataScope[]>(
    async (signal) => {
      if (DEMO_MODE) return [];
      try {
        const res = await api.get<any>("/admin/ai/data-scopes");
        const raw = Array.isArray(res) ? res : (res?.items ?? []);
        return (raw as any[]).map((d) => ({ prompt_key: String(d.prompt_key ?? ""), allowed_evidence_keys: Array.isArray(d.allowed_evidence_keys) ? d.allowed_evidence_keys : [], updated_at: String(d.updated_at ?? "") }));
      } catch { return []; }
    },
    [] as DataScope[],
  );

  const costs = useResource<any[]>(
    async (signal) => {
      if (DEMO_MODE) return demoCosts;
      try {
        const res = await api.get<any>("/admin/ai/costs");
        return (Array.isArray(res) ? res : (res?.items ?? [])) as any[];
      } catch { return []; }
    },
    [] as any[],
  );

  const audit = useResource<any[]>(
    async (signal) => {
      if (DEMO_MODE) return demoAudit;
      try {
        const res = await api.get<any>("/admin/ai/audit-logs?limit=50");
        return (Array.isArray(res) ? res : (res?.items ?? [])) as any[];
      } catch { return []; }
    },
    [] as any[],
  );

  const raw = ai.data;
  const data = raw
    ? {
        enabled: Boolean((raw as any).ai_enabled_platform ?? (raw as any).enabled ?? false),
        default_provider: String((raw as any).default_provider || (raw as any).active_provider_hint || ""),
        mode: Array.isArray((raw as any).modes) ? (raw as any).modes[0] : String((raw as any).mode || ""),
        modes: (raw as any).modes ?? [],
        prompts_count: Array.isArray((raw as any).agents) ? (raw as any).agents.length : Number((raw as any).prompts_count ?? 0),
        ai_pentest_ready: Boolean((raw as any).ai_pentest_ready ?? false),
        deepseek_ready: Boolean((raw as any).deepseek_ready ?? false),
        agentrouter_ready: Boolean((raw as any).agentrouter_ready ?? false),
        providers: (() => {
          const configured = (raw as any).providers_configured ?? (raw as any).providers ?? {};
          if (Array.isArray(configured)) return configured;
          if (!configured || typeof configured !== "object") return [];
          return Object.entries(configured as Record<string, boolean>).map(([id, conf]) => ({
            id,
            configured: Boolean(conf),
            active: id === ((raw as any).active_provider_hint || (raw as any).default_provider || "agentrouter"),
          }));
        })(),
      }
    : null;

  const handleActivate = async () => {
    setActivating(true);
    try {
      await api.post("/admin/ai/activate", {});
      toast("success", "AI activated", "Prompts seeded and providers enabled");
      ai.refresh();
    } catch (e) {
      toast("error", "Activation failed", e instanceof Error ? e.message : "");
    } finally {
      setActivating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="AI Administration"
        description="Manage AI providers, prompts, data scopes, and track usage costs"
        actions={
          <button onClick={() => { ai.refresh(); prompts.refresh(); scopes.refresh(); costs.refresh(); audit.refresh(); }} className="btn-ghost text-sm px-3 py-1.5" disabled={ai.loading}>
            <RefreshCw size={14} className={ai.loading ? "animate-spin" : ""} />
          </button>
        }
      />

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "prompts", label: "Prompts", count: (prompts.data ?? []).length },
          { id: "scopes", label: "Data Scopes", count: (scopes.data ?? []).length },
          { id: "governance", label: "Governance" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" && (
      <>
      {ai.loading ? (
        <TableSkeleton rows={3} />
      ) : !data ? (
        <EmptyState icon={<Brain size={24} />} title="AI settings unavailable" body="Could not load AI configuration. Check that the API server is running." />
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className={data.enabled ? "chip text-emerald-400 bg-emerald-400/10 border-emerald-400/30 text-sm" : "chip text-slate-400 bg-slate-400/10 border-slate-500/30 text-sm"}>
              <span className={`h-2 w-2 rounded-full ${data.enabled ? "bg-emerald-400 animate-pulse-soft" : "bg-slate-500"}`} />
              {data.enabled ? "Active" : "Inactive"}
            </div>
            <span className="text-sm text-slate-400">Default: <span className="text-white capitalize">{data.default_provider}</span></span>
            {data.ai_pentest_ready && <span className="chip text-xs text-emerald-400 bg-emerald-400/10 border-emerald-400/30">AI Pentest Ready</span>}
            <span className="text-sm text-slate-400">Mode: <span className="text-white capitalize">{data.mode}</span></span>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <CollapsibleCard defaultOpen={false} title="Providers" subtitle="Configured AI model providers">
              <div className="divide-y divide-phantix-700/40 rounded-lg bg-phantix-800/40">
                {data.providers.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <Brain size={15} className="text-phantix-400" />
                      <span className="text-sm text-slate-200 capitalize">{p.id}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.configured ? <StatusBadge status="ready" /> : <span className="chip text-xs text-slate-400 bg-slate-400/10 border-slate-500/30">Not configured</span>}
                      {p.active && <span className="chip text-xs text-emerald-400 bg-emerald-400/10 border-emerald-400/30">Active</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleCard>

            <Card>
              <CardHeader title="Actions" />
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-phantix-800/40 px-3 py-2.5">
                  <span className="text-sm text-slate-300">AI Agents</span>
                  <span className="text-sm font-mono text-white">{data.prompts_count}</span>
                </div>
                {!data.enabled && (
                  <button onClick={handleActivate} disabled={activating} className="btn-primary w-full">
                    {activating ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                    Activate AI Engine
                  </button>
                )}
                <button onClick={handleConsensusTest} disabled={testing} className="btn-secondary w-full">
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
                  Dry-run consensus test
                </button>
                {testResult && (
                  <pre className="max-h-48 overflow-auto rounded-lg bg-phantix-950/70 border border-phantix-700/40 p-3 text-[12px] font-mono text-emerald-300 whitespace-pre-wrap">{testResult}</pre>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
      </>
      )}

      {tab === "prompts" && (
        <Card>
          <CardHeader title="Prompt versions" subtitle="Immutable, versioned system prompts" action={<button onClick={() => setShowNewPrompt(true)} className="btn-secondary text-sm px-3 py-1.5"><Plus size={14} /> New Prompt</button>} />
          {prompts.loading && !(prompts.data ?? []).length ? <div className="p-4"><TableSkeleton rows={3} /></div>
          : (prompts.data ?? []).length === 0 ? <EmptyState icon={<FileText size={24} />} title="No prompts" body="Create or activate prompts" />
          : (
            <div className="space-y-1.5">
              {(prompts.data ?? []).map((p) => (
                <div key={p.id || p.prompt_key} className="flex items-center justify-between rounded-lg bg-phantix-800/40 px-3 py-2.5">
                  <button onClick={() => openDetail(p.prompt_key)} className="flex items-center gap-2 text-left hover:text-gold-300 transition-colors">
                    <FileText size={14} className="text-gold-400" />
                    <span className="text-sm font-mono text-slate-200">{p.prompt_key}</span>
                    <span className="chip text-[12px] text-slate-400 bg-slate-400/10 border-slate-500/30">v{p.version}</span>
                  </button>
                  <div className="flex items-center gap-2">
                    {p.is_active ? <StatusBadge status="active" /> : <span className="chip text-[12px] text-slate-500 bg-slate-400/10 border-slate-500/30">Inactive</span>}
                    {!p.is_active && <button onClick={() => handleActivatePrompt(p.prompt_key, p.version)} className="btn-ghost text-xs px-2 py-1">Activate</button>}
                    <button onClick={() => openDetail(p.prompt_key)} className="btn-ghost text-xs px-2 py-1"><Eye size={12} /> View</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "scopes" && (
        <Card>
          <CardHeader title="Data scopes" subtitle="Max evidence fields each prompt may see" />
          {scopes.loading && !(scopes.data ?? []).length ? (
            <div className="p-4"><TableSkeleton rows={3} /></div>
          ) : (scopes.data ?? []).length === 0 ? (
            <EmptyState icon={<ShieldAlert size={24} />} title="No data scopes" body="Configure the allowed evidence keys per prompt in the scope editor." />
          ) : (
            <div className="space-y-1.5">
              {(scopes.data ?? []).map((d) => (
                <div key={d.prompt_key} className="rounded-lg bg-phantix-800/40 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono text-slate-200">{d.prompt_key}</span>
                    <button onClick={() => { setEditScopeKey(d.prompt_key); setScopeForm(d.allowed_evidence_keys.join(", ")); }} className="btn-ghost text-xs px-2 py-1"><Pencil size={12} /> Edit</button>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {d.allowed_evidence_keys.map((k) => <span key={k} className="chip text-[12px] text-phantix-300 bg-phantix-500/10 border-phantix-500/20">{k}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "governance" && (
        <div className="space-y-4">
          <CollapsibleCard defaultOpen={false} title="Cost rollup" subtitle="Monthly token + USD spend per organization" action={<DollarSign size={15} className="text-gold-400" />}>
            {costs.loading && !(costs.data ?? []).length ? (
              <div className="p-4"><TableSkeleton rows={3} /></div>
            ) : (costs.data ?? []).length === 0 ? (
              <EmptyState icon={<DollarSign size={22} />} title="No cost data" body="Model spend appears here as calls are metered." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-phantix-700/40">
                      <th className="th">Org</th>
                      <th className="th">Month</th>
                      <th className="th">Tokens</th>
                      <th className="th">Calls</th>
                      <th className="th">Cost (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(costs.data ?? []).map((c: any, i) => (
                      <tr key={i} className="border-b border-phantix-800/40">
                        <td className="td font-mono text-xs text-gold-300">#{c.organization_id}</td>
                        <td className="td text-xs text-slate-300">{c.year_month}</td>
                        <td className="td font-mono text-xs text-slate-300">{Number(c.tokens_used ?? 0).toLocaleString()}</td>
                        <td className="td text-xs text-slate-400">{c.call_count ?? 0}</td>
                        <td className="td font-mono text-xs text-emerald-400">${Number(c.cost_usd ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleCard>
          <CollapsibleCard defaultOpen={false} title="Audit trail" subtitle="Recent AI calls: model, prompt, tokens and cost" action={<Activity size={15} className="text-phantix-300" />}>
            {audit.loading && !(audit.data ?? []).length ? (
              <div className="p-4"><TableSkeleton rows={3} /></div>
            ) : (audit.data ?? []).length === 0 ? (
              <EmptyState icon={<Activity size={22} />} title="No audit logs" body="AI audit activity appears here once prompts are served." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-phantix-700/40">
                      <th className="th">Org</th>
                      <th className="th">Agent</th>
                      <th className="th">Prompt</th>
                      <th className="th">Provider</th>
                      <th className="th">Tokens</th>
                      <th className="th">Cost</th>
                      <th className="th">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(audit.data ?? []).map((a: any, i) => (
                      <tr key={a.id ?? i} className="border-b border-phantix-800/40">
                        <td className="td font-mono text-xs text-gold-300">#{a.organization_id}</td>
                        <td className="td text-xs text-slate-200">{a.agent_name}</td>
                        <td className="td font-mono text-[13px] text-slate-400">{a.prompt_key}</td>
                        <td className="td text-xs text-slate-300">{a.model_provider}</td>
                        <td className="td font-mono text-xs text-slate-300">{Number(a.tokens_used ?? 0).toLocaleString()}</td>
                        <td className="td font-mono text-xs text-emerald-400">${Number(a.cost_usd ?? 0).toFixed(2)}</td>
                        <td className="td text-xs text-slate-500">{a.created_at ? new Date(a.created_at).toLocaleString() : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleCard>
        </div>
      )}

      <Modal open={showNewPrompt} onClose={() => setShowNewPrompt(false)} title="Create AI Prompt">
        <div className="space-y-3">
          <div><label className="label">Prompt Key</label><input className="input font-mono" value={newPrompt.prompt_key} onChange={e => setNewPrompt(p => ({...p, prompt_key: e.target.value}))} placeholder="finding_explanation" /></div>
          <div><label className="label">System Prompt</label><textarea className="input resize-none" rows={3} value={newPrompt.system_prompt} onChange={e => setNewPrompt(p => ({...p, system_prompt: e.target.value}))} /></div>
          <div><label className="label">User Template (optional)</label><textarea className="input resize-none" rows={2} value={newPrompt.user_template} onChange={e => setNewPrompt(p => ({...p, user_template: e.target.value}))} placeholder="{{finding}}" /></div>
          <div><label className="label">Changelog</label><input className="input" value={newPrompt.changelog} onChange={e => setNewPrompt(p => ({...p, changelog: e.target.value}))} /></div>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={newPrompt.activate} onChange={e => setNewPrompt(p => ({...p, activate: e.target.checked}))} className="accent-gold-400" /> Activate as default version</label>
          <button onClick={handleCreatePrompt} className="btn-primary w-full">Create Prompt</button>
        </div>
      </Modal>

      {/* Prompt detail / edit */}
      <Modal open={detailKey !== null} onClose={() => { setDetailKey(null); setDetail(null); }} title={detailKey ? `Prompt: ${detailKey}` : "Prompt"}>
        {detailLoading ? (
          <div className="p-4"><TableSkeleton rows={4} /></div>
        ) : detail ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusBadge status={detail.is_active ? "active" : "inactive"} />
              <span className="chip text-[12px] text-slate-400 bg-slate-400/10 border-slate-500/30">v{detail.version}</span>
              <div className="ml-auto flex gap-2">
                {detailTab === "view" ? (
                  <button onClick={() => setDetailTab("edit")} className="btn-secondary text-xs px-3 py-1.5"><Pencil size={12} /> Edit</button>
                ) : (
                  <>
                    <button onClick={() => setDetailTab("view")} className="btn-ghost text-xs px-3 py-1.5"><X size={12} /> Cancel</button>
                    <button onClick={savePromptEdit} disabled={savingEdit} className="btn-primary text-xs px-3 py-1.5">{savingEdit ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save version</button>
                  </>
                )}
              </div>
            </div>

            {detailTab === "view" ? (
              <>
                <div>
                  <p className="label">System prompt</p>
                  <pre className="whitespace-pre-wrap rounded-lg bg-phantix-950/70 border border-phantix-700/40 p-3 text-xs text-slate-300 max-h-52 overflow-auto">{detail.system_prompt || "Not set"}</pre>
                </div>
                {detail.user_template && (
                  <div>
                    <p className="label">User template</p>
                    <pre className="whitespace-pre-wrap rounded-lg bg-phantix-950/70 border border-phantix-700/40 p-3 text-xs text-slate-300">{detail.user_template}</pre>
                  </div>
                )}
                {detail.allowed_evidence_keys.length > 0 && (
                  <div>
                    <p className="label">Allowed evidence keys</p>
                    <div className="flex flex-wrap gap-1">{detail.allowed_evidence_keys.map((k) => <span key={k} className="chip text-[12px] text-phantix-300 bg-phantix-500/10 border-phantix-500/20">{k}</span>)}</div>
                  </div>
                )}
                {detail.output_schema && (
                  <div>
                    <p className="label">Output schema</p>
                    <pre className="whitespace-pre-wrap rounded-lg bg-phantix-950/70 border border-phantix-700/40 p-3 text-xs text-slate-300 max-h-40 overflow-auto">{JSON.stringify(detail.output_schema, null, 2)}</pre>
                  </div>
                )}
                {detail.changelog && <p className="text-xs text-slate-500">Changelog: {detail.changelog}</p>}
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="label">System prompt</p>
                  <textarea className="input resize-none" rows={6} value={editForm.system_prompt} onChange={(e) => setEditForm((f) => ({ ...f, system_prompt: e.target.value }))} />
                </div>
                <div>
                  <p className="label">User template</p>
                  <textarea className="input resize-none" rows={3} value={editForm.user_template} onChange={(e) => setEditForm((f) => ({ ...f, user_template: e.target.value }))} />
                </div>
                <div>
                  <p className="label">Allowed evidence keys (comma-separated)</p>
                  <input className="input font-mono" value={editForm.allowed_evidence_keys} onChange={(e) => setEditForm((f) => ({ ...f, allowed_evidence_keys: e.target.value }))} placeholder="finding_id, severity, cvss" />
                </div>
                <div>
                  <p className="label">Changelog</p>
                  <input className="input" value={editForm.changelog} onChange={(e) => setEditForm((f) => ({ ...f, changelog: e.target.value }))} />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={editForm.activate} onChange={(e) => setEditForm((f) => ({ ...f, activate: e.target.checked }))} className="accent-gold-400" /> Activate this new version as default</label>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {/* Data scope edit */}
      <Modal open={editScopeKey !== null} onClose={() => setEditScopeKey(null)} title={`Data scope: ${editScopeKey ?? ""}`}>
        <div className="space-y-3">
          <div>
            <p className="label">Allowed evidence keys (comma-separated)</p>
            <input className="input font-mono" value={scopeForm} onChange={(e) => setScopeForm(e.target.value)} placeholder="finding_id, severity, cvss, description" />
            <p className="mt-1 text-[13px] text-slate-500">These are the max evidence fields this prompt may receive. It cannot exceed the platform catalog.</p>
          </div>
          <button onClick={() => editScopeKey && saveScope(editScopeKey)} className="btn-primary w-full">Save data scope</button>
        </div>
      </Modal>
    </div>
  );
}
