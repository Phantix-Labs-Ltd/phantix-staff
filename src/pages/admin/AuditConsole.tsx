import React, { useMemo, useState } from "react";
import { ClipboardCheck, FileText, FlaskConical, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { Card, CardHeader, EmptyState, Modal, PageHeader, Tabs } from "@/components/ui";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE } from "@/lib/api";
import { cx } from "@/lib/utils";
import type { ClientOrg } from "@/lib/types";

/*
 * Staff GRC audit console (FE handoff M5): Phantix GRC acting as the external
 * auditor across organizations. Backed by /admin/compliance/* (staff JWT):
 *   audit-programs (+ /seed), audit-engagements (list/create/get/patch,
 *   /readiness, /tests, /findings, /reports), audit-intelligence.
 */

type Opinion = "ready" | "ready_with_exceptions" | "not_ready" | "inconclusive";
type Program = { program_key: string; name: string; audit_type: string; framework_ids: string[]; is_active: boolean; sector?: string | null };
type Engagement = {
  id: number; organization_id: number; program_key: string | null; program_name: string | null; title: string;
  audit_type: string; status: string; criteria: string[]; period_start: string | null; period_end: string | null;
  lead_auditor_name: string | null; auditor_org: string | null; opinion: Opinion | null; readiness_score: number | null;
  next_statuses?: string[];
};
type Readiness = { controls_total: number; tested: number; effective: number; partially_effective: number; ineffective: number; not_tested: number; readiness_score: number | null; opinion: Opinion | null };

const AUDIT_TYPES = ["external", "certification", "regulatory", "readiness", "internal", "vendor", "continuous"];
const RESULTS = ["effective", "partially_effective", "ineffective", "not_tested", "na"];
const REPORT_TYPES = ["readiness", "opinion", "attestation", "regulator", "internal"];
const OPINIONS: Opinion[] = ["ready", "ready_with_exceptions", "not_ready", "inconclusive"];
const human = (v: string | null | undefined) => (v ? v.replace(/_/g, " ") : "—");
const items = <T,>(raw: unknown): T[] => (Array.isArray(raw) ? (raw as T[]) : ((raw as { items?: T[] })?.items ?? []));
const errMsg = (e: unknown, f: string) => (e instanceof Error && e.message ? e.message : f);

const OPINION_TONE: Record<Opinion, string> = {
  ready: "text-emerald-400", ready_with_exceptions: "text-amber-300", not_ready: "text-red-400", inconclusive: "text-slate-400",
};

export default function AuditConsole() {
  const [tab, setTab] = useState("engagements");
  const clients = useResource<ClientOrg[]>(async () => (DEMO_MODE ? [] : items<ClientOrg>(await api.get("/admin/clients"))), [], "audit-console-clients");
  const programs = useResource<Program[]>(async () => (DEMO_MODE ? [] : items<Program>(await api.get("/admin/compliance/audit-programs"))), [], "audit-console-programs");
  const orgName = (id: number) => clients.data.find((c) => c.id === id)?.name ?? `Org #${id}`;

  return (
    <div>
      <PageHeader title="Audits" description="Run GRC audits for client organizations as the external auditor: open engagements, test controls, raise findings and publish opinions." />
      <Tabs tabs={[{ id: "engagements", label: "Engagements" }, { id: "programs", label: "Programmes", count: programs.data.length }, { id: "intelligence", label: "Intelligence" }]} active={tab} onChange={setTab} />
      <div className="mt-5">
        {tab === "engagements" && <Engagements clients={clients.data} programs={programs.data} orgName={orgName} />}
        {tab === "programs" && <Programs state={programs} />}
        {tab === "intelligence" && <Intelligence clients={clients.data} />}
      </div>
    </div>
  );
}

// ── Engagements ──────────────────────────────────────────────────────────────

function Engagements({ clients, programs, orgName }: { clients: ClientOrg[]; programs: Program[]; orgName: (id: number) => string }) {
  const [orgFilter, setOrgFilter] = useState("");
  const list = useResource<Engagement[]>(
    async () => (DEMO_MODE ? [] : items<Engagement>(await api.get(`/admin/compliance/audit-engagements${orgFilter ? `?organization_id=${orgFilter}` : ""}`))),
    [], `audit-console-eng-${orgFilter}`,
  );
  const [opening, setOpening] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select aria-label="Organization" className="input !w-auto" value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
          <option value="">All organizations</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn-ghost" onClick={list.refresh} aria-label="Refresh"><RefreshCw size={14} /></button>
        <button className="btn-primary ml-auto" onClick={() => setOpening(true)}><Plus size={14} /> Open engagement</button>
      </div>
      {list.error && <p className="mb-3 text-sm text-red-400">{list.error}</p>}
      {list.data.length === 0 ? (
        <Card><EmptyState icon={<ClipboardCheck size={20} />} title={list.loading ? "Loading…" : "No engagements"} body="Open one for a client to start an independent audit." /></Card>
      ) : (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="border-b border-slate-700/50 text-left text-[12px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2.5">Engagement</th><th className="px-4 py-2.5">Organization</th><th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Opinion</th><th className="px-4 py-2.5 text-right">Readiness</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/40">
                {list.data.map((e) => (
                  <tr key={e.id} className="cursor-pointer hover:bg-slate-800/40" onClick={() => setSelected(e.id)}>
                    <td className="px-4 py-3"><span className="font-medium text-white">{e.title}</span><span className="block text-xs text-slate-500">{e.program_name ?? e.program_key}</span></td>
                    <td className="px-4 py-3 text-slate-300">{orgName(e.organization_id)}</td>
                    <td className="px-4 py-3 capitalize text-slate-300">{human(e.audit_type)}</td>
                    <td className="px-4 py-3 capitalize text-slate-300">{human(e.status)}</td>
                    <td className={cx("px-4 py-3 capitalize", e.opinion ? OPINION_TONE[e.opinion] : "text-slate-500")}>{human(e.opinion)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-200">{e.readiness_score == null ? "—" : `${Math.round(e.readiness_score)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <OpenEngagementModal open={opening} clients={clients} programs={programs} onClose={() => setOpening(false)} onDone={(id) => { setOpening(false); list.refresh(); setSelected(id); }} />
      {selected != null && <EngagementPanel id={selected} orgName={orgName} onClose={() => setSelected(null)} onChanged={list.refresh} />}
    </div>
  );
}

function OpenEngagementModal({ open, clients, programs, onClose, onDone }: { open: boolean; clients: ClientOrg[]; programs: Program[]; onClose: () => void; onDone: (id: number) => void }) {
  const { toast } = useStore();
  const [f, setF] = useState({ organization_id: "", program_key: "", title: "", audit_type: "external", period_start: "", period_end: "", lead_auditor_name: "", scope_summary: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { if (open) { setF({ organization_id: "", program_key: programs[0]?.program_key ?? "", title: "", audit_type: "external", period_start: new Date().toISOString().slice(0, 10), period_end: "", lead_auditor_name: "", scope_summary: "" }); setErr(null); } }, [open, programs]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!f.organization_id) return setErr("Choose the organization.");
    if (!f.program_key) return setErr("Choose a programme.");
    if (f.period_end && f.period_start && f.period_end < f.period_start) return setErr("The period has to end on or after it starts.");
    setBusy(true); setErr(null);
    try {
      const program = programs.find((p) => p.program_key === f.program_key);
      const created = await api.post<Engagement>("/admin/compliance/audit-engagements", {
        organization_id: Number(f.organization_id), program_key: f.program_key, title: f.title.trim() || program?.name,
        audit_type: f.audit_type, criteria: program?.framework_ids, period_start: f.period_start || null, period_end: f.period_end || null,
        lead_auditor_name: f.lead_auditor_name.trim() || null, auditor_org: "staff", scope_summary: f.scope_summary.trim() || null,
      });
      toast("success", "Engagement opened");
      onDone(created.id);
    } catch (e) { setErr(errMsg(e, "Couldn't open the engagement")); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Open an engagement" wide>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="oe-org">Organization</label>
          <select id="oe-org" className="input" value={f.organization_id} onChange={(e) => setF({ ...f, organization_id: e.target.value })}>
            <option value="">Choose…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name} (#{c.id})</option>)}
          </select></div>
        <div><label className="label" htmlFor="oe-prog">Programme</label>
          <select id="oe-prog" className="input" value={f.program_key} onChange={(e) => setF({ ...f, program_key: e.target.value })}>
            {programs.filter((p) => p.is_active).map((p) => <option key={p.program_key} value={p.program_key}>{p.name}</option>)}
          </select></div>
        <div><label className="label" htmlFor="oe-title">Title</label><input id="oe-title" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Defaults to the programme name" /></div>
        <div><label className="label" htmlFor="oe-type">Audit type</label>
          <select id="oe-type" className="input" value={f.audit_type} onChange={(e) => setF({ ...f, audit_type: e.target.value })}>{AUDIT_TYPES.map((t) => <option key={t} value={t}>{human(t)}</option>)}</select></div>
        <div><label className="label" htmlFor="oe-start">Period from</label><input id="oe-start" type="date" className="input" value={f.period_start} onChange={(e) => setF({ ...f, period_start: e.target.value })} /></div>
        <div><label className="label" htmlFor="oe-end">to</label><input id="oe-end" type="date" className="input" value={f.period_end} onChange={(e) => setF({ ...f, period_end: e.target.value })} /></div>
        <div><label className="label" htmlFor="oe-lead">Lead auditor</label><input id="oe-lead" className="input" value={f.lead_auditor_name} onChange={(e) => setF({ ...f, lead_auditor_name: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="oe-scope">Scope summary</label><textarea id="oe-scope" rows={2} className="input" value={f.scope_summary} onChange={(e) => setF({ ...f, scope_summary: e.target.value })} /></div>
        {err && <p role="alert" className="text-sm text-red-400 sm:col-span-2">{err}</p>}
        <button className="btn-primary sm:col-span-2" disabled={busy}>{busy ? "Opening…" : "Open engagement"}</button>
      </form>
    </Modal>
  );
}

function EngagementPanel({ id, orgName, onClose, onChanged }: { id: number; orgName: (id: number) => string; onClose: () => void; onChanged: () => void }) {
  const { toast } = useStore();
  const eng = useResource<Engagement | null>(async () => (DEMO_MODE ? null : api.get<Engagement>(`/admin/compliance/audit-engagements/${id}`)), null, `audit-console-e-${id}`);
  const ready = useResource<Readiness | null>(async () => (DEMO_MODE ? null : api.get<Readiness>(`/admin/compliance/audit-engagements/${id}/readiness`)), null, `audit-console-r-${id}`);
  const [form, setForm] = useState<null | "test" | "finding" | "report">(null);
  const [err, setErr] = useState<string | null>(null);
  const e = eng.data;
  const refreshAll = () => { eng.refresh(); ready.refresh(); onChanged(); };

  const patch = async (body: Record<string, unknown>, done: string) => {
    setErr(null);
    try { await api.patch(`/admin/compliance/audit-engagements/${id}`, body); toast("success", done); refreshAll(); }
    catch (ex) { setErr(errMsg(ex, "Couldn't update the engagement")); }
  };

  return (
    <Modal open onClose={onClose} title={e ? e.title : "Engagement"} wide>
      {!e ? <p className="text-sm text-slate-400">{eng.error ?? "Loading…"}</p> : (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">{orgName(e.organization_id)} · {e.program_name ?? e.program_key} · <span className="capitalize">{human(e.audit_type)}</span> · {e.period_start ?? "—"} – {e.period_end ?? "—"}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Status" value={human(e.status)} />
            <Stat label="Readiness" value={ready.data?.readiness_score == null ? "Not enough tested" : `${Math.round(ready.data.readiness_score)}%`} />
            <Stat label="Opinion" value={human(ready.data?.opinion ?? e.opinion)} />
            <Stat label="Tested" value={ready.data ? `${ready.data.tested} / ${ready.data.controls_total}` : "—"} />
          </div>
          {ready.data && (
            <p className="text-xs text-slate-400">{ready.data.effective} effective · {ready.data.partially_effective} partly · {ready.data.ineffective} ineffective · {ready.data.not_tested} not tested</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {(e.next_statuses ?? []).length > 0 && (
              <select aria-label="Move to stage" className="input !w-auto" value="" onChange={(ev) => ev.target.value && void patch({ status: ev.target.value }, "Stage changed")}>
                <option value="">Move to stage…</option>{(e.next_statuses ?? []).map((s) => <option key={s} value={s}>{human(s)}</option>)}
              </select>
            )}
            <select aria-label="Set opinion" className="input !w-auto" value="" onChange={(ev) => ev.target.value && void patch({ opinion: ev.target.value }, "Opinion set")}>
              <option value="">Set opinion…</option>{OPINIONS.map((o) => <option key={o} value={o}>{human(o)}</option>)}
            </select>
            <button className="btn-secondary" onClick={() => setForm("test")}><FlaskConical size={14} /> Record test</button>
            <button className="btn-secondary" onClick={() => setForm("finding")}><ShieldAlert size={14} /> Raise finding</button>
            <button className="btn-primary" onClick={() => setForm("report")}><FileText size={14} /> Publish report</button>
          </div>
          {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
          {form && <ActionForm kind={form} e={e} onCancel={() => setForm(null)} onDone={() => { setForm(null); refreshAll(); }} />}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-slate-700/60 p-2.5"><p className="text-[11px] text-slate-500">{label}</p><p className="text-sm capitalize text-white">{value}</p></div>;
}

function ActionForm({ kind, e, onCancel, onDone }: { kind: "test" | "finding" | "report"; e: Engagement; onCancel: () => void; onDone: () => void }) {
  const { toast } = useStore();
  const [f, setF] = useState<Record<string, string>>({ framework_id: e.criteria[0] ?? "", control_id: "", test_type: "operating", result: "effective", procedure: "", sample_size: "", exception_notes: "", title: "", severity: "medium", significance: "deficiency", condition: "", recommendation: "", report_type: "opinion" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: ev.target.value });
  const base = `/admin/compliance/audit-engagements/${e.id}`;

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault(); setErr(null);
    try {
      setBusy(true);
      if (kind === "test") {
        if (!f.control_id.trim()) throw new Error("Enter the control ID.");
        await api.post(`${base}/tests`, { framework_id: f.framework_id, control_id: f.control_id.trim(), test_type: f.test_type, result: f.result, procedure: f.procedure || null, sample_size: f.sample_size ? Number(f.sample_size) : null, exception_notes: f.exception_notes || null, evidence_ids: [] });
        toast("success", "Test recorded");
      } else if (kind === "finding") {
        if (f.title.trim().length < 4) throw new Error("Give the finding a title of at least 4 characters.");
        await api.post(`${base}/findings`, { title: f.title.trim(), framework_id: f.framework_id || null, control_id: f.control_id.trim() || null, severity: f.severity, significance: f.significance, condition: f.condition || null, recommendation: f.recommendation || null });
        toast("success", "Finding raised");
      } else {
        await api.post(`${base}/reports`, { report_type: f.report_type, publish: true });
        toast("success", "Report published");
      }
      onDone();
    } catch (ex) { setErr(errMsg(ex, "That didn't save")); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader title={kind === "test" ? "Record a control test" : kind === "finding" ? "Raise a finding" : "Publish a report"} />
      <form onSubmit={submit} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {kind !== "report" && (
          <>
            <div><label className="label" htmlFor="af-fw">Framework</label><select id="af-fw" className="input" value={f.framework_id} onChange={set("framework_id")}>{e.criteria.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="label" htmlFor="af-ctl">Control ID</label><input id="af-ctl" className="input font-mono" value={f.control_id} onChange={set("control_id")} /></div>
          </>
        )}
        {kind === "test" && (
          <>
            <div><label className="label" htmlFor="af-tt">Test type</label><select id="af-tt" className="input" value={f.test_type} onChange={set("test_type")}><option value="operating">Operating</option><option value="design">Design</option></select></div>
            <div><label className="label" htmlFor="af-res">Result</label><select id="af-res" className="input" value={f.result} onChange={set("result")}>{RESULTS.map((r) => <option key={r} value={r}>{human(r)}</option>)}</select></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="af-proc">Procedure</label><textarea id="af-proc" rows={2} className="input" value={f.procedure} onChange={set("procedure")} /></div>
            <div><label className="label" htmlFor="af-ss">Sample size</label><input id="af-ss" type="number" min={0} className="input" value={f.sample_size} onChange={set("sample_size")} /></div>
            <div><label className="label" htmlFor="af-ex">Exceptions</label><input id="af-ex" className="input" value={f.exception_notes} onChange={set("exception_notes")} /></div>
          </>
        )}
        {kind === "finding" && (
          <>
            <div className="sm:col-span-2"><label className="label" htmlFor="af-title">Title</label><input id="af-title" className="input" value={f.title} onChange={set("title")} /></div>
            <div><label className="label" htmlFor="af-sev">Severity</label><select id="af-sev" className="input" value={f.severity} onChange={set("severity")}>{["critical", "high", "medium", "low"].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label className="label" htmlFor="af-sig">Significance</label><select id="af-sig" className="input" value={f.significance} onChange={set("significance")}>{["deficiency", "significant_deficiency", "material_weakness"].map((s) => <option key={s} value={s}>{human(s)}</option>)}</select></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="af-cond">Condition</label><textarea id="af-cond" rows={2} className="input" value={f.condition} onChange={set("condition")} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="af-rec">Recommendation</label><textarea id="af-rec" rows={2} className="input" value={f.recommendation} onChange={set("recommendation")} /></div>
          </>
        )}
        {kind === "report" && (
          <div><label className="label" htmlFor="af-rt">Report</label><select id="af-rt" className="input" value={f.report_type} onChange={set("report_type")}>{REPORT_TYPES.map((t) => <option key={t} value={t}>{human(t)}</option>)}</select></div>
        )}
        {err && <p role="alert" className="text-sm text-red-400 sm:col-span-2">{err}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </Card>
  );
}

// ── Programmes ───────────────────────────────────────────────────────────────

function Programs({ state }: { state: ReturnType<typeof useResource<Program[]>> }) {
  const { toast } = useStore();
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const reseed = async () => {
    setBusy(true);
    try {
      const r = await api.post<Record<string, unknown>>(`/admin/compliance/audit-programs/seed${force ? "?force=true" : ""}`, {});
      toast("success", "Programmes reloaded", Object.entries(r ?? {}).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k}: ${v}`).join(" · ") || undefined);
      state.refresh();
    } catch (e) { toast("error", "Reload failed", errMsg(e, "")); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Overwrite even if the seed version hasn't changed</label>
        <button className="btn-primary ml-auto" disabled={busy} onClick={() => void reseed()}><RefreshCw size={14} /> Reload seeds</button>
      </div>
      <Card className="!p-0">
        <ul className="divide-y divide-slate-700/40">
          {state.data.map((p) => (
            <li key={p.program_key} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-[12rem] flex-1">
                <p className="text-sm text-white">{p.name} <span className="ml-1 font-mono text-[11px] text-slate-500">{p.program_key}</span></p>
                <p className="text-xs text-slate-500">{p.framework_ids.join(" · ")}</p>
              </div>
              <span className="text-xs capitalize text-slate-400">{human(p.audit_type)}</span>
              {!p.is_active && <span className="text-xs text-slate-500">inactive</span>}
            </li>
          ))}
          {state.data.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">{state.loading ? "Loading…" : "No programmes. Reload the seeds."}</li>}
        </ul>
      </Card>
    </div>
  );
}

// ── Intelligence ─────────────────────────────────────────────────────────────

function Intelligence({ clients }: { clients: ClientOrg[] }) {
  const [org, setOrg] = useState("");
  const intel = useResource<Record<string, any> | null>(
    async () => (!org || DEMO_MODE ? null : api.get<Record<string, any>>(`/admin/compliance/audit-intelligence?organization_id=${org}`)),
    null, `audit-console-intel-${org}`,
  );
  const risks = useMemo(() => ((intel.data?.controls_at_risk as any[]) ?? []).slice(0, 15), [intel.data]);
  return (
    <div>
      <select aria-label="Organization" className="input mb-4 !w-auto" value={org} onChange={(e) => setOrg(e.target.value)}>
        <option value="">Choose an organization…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {!org ? null : !intel.data ? <p className="text-sm text-slate-400">{intel.error ?? "Loading…"}</p> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Engagements" value={String(intel.data.engagement_count ?? 0)} />
            <Stat label="Overall opinion" value={human(intel.data.overall_opinion)} />
            <Stat label="Audit findings" value={String(intel.data.findings?.total ?? 0)} />
            <Stat label="Correlated controls" value={String(intel.data.correlated_controls ?? 0)} />
          </div>
          <Card>
            <CardHeader title="Controls at risk" />
            <ul className="mt-2 divide-y divide-slate-700/40">
              {risks.map((c) => (
                <li key={`${c.framework_id}:${c.control_id}`} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="min-w-[12rem] flex-1 font-mono text-slate-200">{c.framework_id} · {c.control_id}</span>
                  <span className="text-xs text-slate-400">{(c.sources ?? []).join(", ")}</span>
                  {c.correlated && <span className="rounded border border-red-400/40 px-1.5 py-0.5 text-[11px] text-red-300">2+ sources</span>}
                </li>
              ))}
              {risks.length === 0 && <li className="py-2 text-sm text-slate-500">No controls at risk.</li>}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
