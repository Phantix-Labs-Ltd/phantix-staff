import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileCheck, RefreshCw, FileUp, ListChecks, Loader2, Plus, Pencil, Trash2, Search, X, Link2, ShieldCheck,
} from "lucide-react";
import { PageHeader, Card, CardHeader, StatusBadge, TableSkeleton, EmptyState, Modal, Tabs } from "@/components/ui";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE } from "@/lib/api";
import { cx } from "@/lib/utils";

interface ComplianceFramework {
  id: string;
  name: string;
  version: string;
  description: string;
  control_count: number;
  category: string;
  is_active: boolean;
}

interface SourceControl {
  framework_id?: string;
  control_id?: string;
  title?: string | null;
  category?: string | null;
  risk?: string | null;
}

interface GrcQuestion {
  id: number;
  question_key: string;
  prompt: string;
  help_text?: string | null;
  category?: string | null;
  risk?: string | null;
  answer_type: string;
  framework_ids: string[];
  source_controls?: SourceControl[];
  sort_order: number;
  is_active: boolean;
  is_expert_managed: boolean;
  updated_by?: string | null;
  expert_notes?: string | null;
}

interface SourceControlDraft {
  framework_id: string;
  control_id: string;
  title: string;
}

const ALL_FRAMEWORKS = "__all__";

const demoFrameworks: ComplianceFramework[] = [
  { id: "iso27001", name: "ISO 27001", version: "2022", description: "Information security management standard", control_count: 93, category: "international", is_active: true },
  { id: "ndpr", name: "NDPR", version: "2019", description: "Nigeria Data Protection Regulation", control_count: 42, category: "national", is_active: true },
  { id: "pci_dss", name: "PCI DSS", version: "4.0", description: "Payment Card Industry Data Security Standard", control_count: 312, category: "industry", is_active: true },
  { id: "soc2", name: "SOC 2", version: "2023", description: "Service Organization Controls", control_count: 61, category: "international", is_active: true },
  { id: "gdpr", name: "GDPR", version: "2018", description: "General Data Protection Regulation", control_count: 99, category: "international", is_active: false },
];

const emptyQuestion = {
  prompt: "",
  category: "",
  risk: "medium",
  answer_type: "yes_no_partial",
  help_text: "",
  expert_notes: "",
  is_active: true,
};

function categoryFor(fw: { jurisdiction_triggers?: unknown; framework_id?: string }): string {
  const t = fw.jurisdiction_triggers as Record<string, unknown> | undefined;
  if (t && typeof t === "object") {
    if (t.country) return "national";
    if (t.region) return "international";
    if (t.industry) return "industry";
  }
  return "Not set";
}

function controlLabel(c: SourceControl): string {
  return c.control_id ? `${c.framework_id ?? ""} · ${c.control_id}`.replace(/^ · /, "") : "Not set";
}

export default function ComplianceAdmin() {
  const { toast } = useStore();
  const [tab, setTab] = useState("frameworks");
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const frameworks = useResource<ComplianceFramework[]>(
    async () => {
      if (DEMO_MODE) return demoFrameworks;
      const raw = await api.get<any>("/admin/compliance/frameworks");
      const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
      // API returns `framework_id`; the UI keys off `id`.
      return items.map((fw: any) => ({
        id: String(fw.framework_id ?? fw.id ?? ""),
        name: String(fw.name ?? fw.framework_id ?? ""),
        version: String(fw.version ?? ""),
        description: String(fw.description ?? ""),
        control_count: Number(fw.control_count ?? 0),
        category: categoryFor(fw),
        is_active: fw.is_active !== false,
      }));
    },
    [],
  );

  const data = DEMO_MODE ? demoFrameworks : (frameworks.data ?? []);
  const frameworkName = useCallback(
    (id: string) => data.find((f) => f.id === id)?.name ?? id,
    [data],
  );

  const handleSeed = async () => {
    try {
      await api.post("/admin/compliance/seed", {});
      toast("success", "Seed complete", "Built-in frameworks + questionnaire reloaded");
      frameworks.refresh();
    } catch (e) {
      toast("error", "Seed failed", e instanceof Error ? e.message : "");
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await api.patch(`/admin/compliance/frameworks/${id}`, { is_active: !active });
      toast("success", `${active ? "Deactivated" : "Activated"}`, `Framework ${id}`);
      frameworks.refresh();
    } catch (e) {
      toast("error", "Failed", e instanceof Error ? e.message : "");
    }
  };

  const handleUpload = async (file: File) => {
    setUploadBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.postMultipart("/admin/compliance/frameworks/upload?force=true", formData);
      toast("success", "Uploaded", `Framework ${file.name} imported`);
      frameworks.refresh();
    } catch (e) {
      const st = (e as { status?: number })?.status;
      toast(
        "error",
        st === 502 || st === 503 ? "Storage unavailable" : "Upload failed",
        st === 502 || st === 503 ? "Storage unavailable. Try again." : e instanceof Error ? e.message : "",
      );
    } finally {
      setUploadBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Questionnaire ─────────────────────────────────────────────────────────
  // Reads the generic endpoint so "All frameworks" is one readable list; expert
  // edits send the full framework_ids + source_controls so a multi-framework
  // question never loses its other links.
  const [selectedFw, setSelectedFw] = useState(ALL_FRAMEWORKS);
  const [questions, setQuestions] = useState<GrcQuestion[]>([]);
  const [qLoading, setQLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyQuestion });
  const [formFrameworks, setFormFrameworks] = useState<string[]>([]);
  const [formControls, setFormControls] = useState<SourceControlDraft[]>([]);
  const [busy, setBusy] = useState(false);

  const loadQuestions = useCallback(async (fw: string) => {
    if (DEMO_MODE) {
      setQuestions([]);
      return;
    }
    setQLoading(true);
    try {
      const qs = fw && fw !== ALL_FRAMEWORKS ? `?framework_id=${encodeURIComponent(fw)}` : "";
      const raw = await api.get<any>(`/admin/compliance/questionnaire/questions${qs}`);
      setQuestions(Array.isArray(raw) ? raw : (raw?.items ?? []));
    } catch (e) {
      toast("error", "Could not load questions", e instanceof Error ? e.message : "");
      setQuestions([]);
    } finally {
      setQLoading(false);
    }
  }, [toast]);

  useEffect(() => { void loadQuestions(selectedFw); }, [selectedFw, loadQuestions]);

  const openNewQuestion = () => {
    const initialFw = selectedFw !== ALL_FRAMEWORKS && selectedFw ? [selectedFw] : (data[0] ? [data[0].id] : []);
    setEditingId(null);
    setForm({ ...emptyQuestion });
    setFormFrameworks(initialFw);
    setFormControls([]);
    setEditorOpen(true);
  };

  const openEditQuestion = (q: GrcQuestion) => {
    setEditingId(q.id);
    setForm({
      prompt: q.prompt,
      category: q.category ?? "",
      risk: q.risk ?? "medium",
      answer_type: q.answer_type || "yes_no_partial",
      help_text: q.help_text ?? "",
      expert_notes: q.expert_notes ?? "",
      is_active: q.is_active,
    });
    setFormFrameworks([...(q.framework_ids ?? [])]);
    setFormControls(
      (q.source_controls ?? []).map((c) => ({
        framework_id: String(c.framework_id ?? ""),
        control_id: String(c.control_id ?? ""),
        title: String(c.title ?? ""),
      })),
    );
    setEditorOpen(true);
  };

  const toggleFormFramework = (id: string) => {
    setFormFrameworks((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const addControl = () =>
    setFormControls((rows) => [...rows, { framework_id: formFrameworks[0] ?? "", control_id: "", title: "" }]);

  const updateControl = (i: number, patch: Partial<SourceControlDraft>) =>
    setFormControls((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const removeControl = (i: number) =>
    setFormControls((rows) => rows.filter((_, idx) => idx !== i));

  const saveQuestion = async () => {
    if (form.prompt.trim().length < 8) {
      toast("error", "Prompt too short", "At least 8 characters.");
      return;
    }
    if (!formFrameworks.length) {
      toast("error", "Pick at least one framework");
      return;
    }
    const controls = formControls
      .filter((c) => c.framework_id && c.control_id.trim())
      .map((c) => ({
        framework_id: c.framework_id,
        control_id: c.control_id.trim(),
        title: c.title.trim() || null,
      }));
    setBusy(true);
    try {
      const payload = {
        prompt: form.prompt,
        category: form.category || null,
        risk: form.risk || null,
        answer_type: form.answer_type,
        help_text: form.help_text || null,
        expert_notes: form.expert_notes || null,
        is_active: form.is_active,
        framework_ids: formFrameworks,
        source_controls: controls,
      };
      if (editingId != null) {
        await api.patch(`/admin/compliance/questionnaire/questions/${editingId}`, payload);
        toast("success", "Question updated");
      } else {
        await api.post("/admin/compliance/questionnaire/questions", payload);
        toast("success", "Question created");
      }
      setEditorOpen(false);
      await loadQuestions(selectedFw);
    } catch (e) {
      toast("error", "Save failed", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  const deactivateQuestion = async (q: GrcQuestion) => {
    try {
      await api.delete(`/admin/compliance/questionnaire/questions/${q.id}`);
      toast("success", "Question deactivated", q.question_key);
      await loadQuestions(selectedFw);
    } catch (e) {
      toast("error", "Failed", e instanceof Error ? e.message : "");
    }
  };

  const rebuild = async () => {
    try {
      const res = await api.post<any>("/admin/compliance/questionnaire/rebuild", {});
      toast("success", "Rebuilt", `Merged questionnaire regenerated${res?.created != null ? ` (+${res.created})` : ""}`);
      await loadQuestions(selectedFw);
    } catch (e) {
      toast("error", "Rebuild failed", e instanceof Error ? e.message : "");
    }
  };

  const visibleQuestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return questions;
    return questions.filter((q) =>
      [q.prompt, q.question_key, q.category ?? "", ...(q.framework_ids ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [questions, search]);

  return (
    <div>
      <PageHeader
        title="Compliance"
        description="Manage global compliance frameworks and the GRC questionnaire catalog"
        actions={
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
            />
            <button onClick={() => fileRef.current?.click()} disabled={uploadBusy} className="btn-secondary text-sm px-3 py-1.5">
              {uploadBusy ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Upload Framework
            </button>
            <button onClick={handleSeed} className="btn-ghost text-sm px-3 py-1.5">
              <RefreshCw size={14} /> Reload Seeds
            </button>
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: "frameworks", label: "Frameworks", count: data.length },
          { id: "questionnaire", label: "Questionnaire", count: questions.length || undefined },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "frameworks" && (
        <Card>
          {frameworks.loading && !frameworks.data?.length ? (
            <div className="p-4"><TableSkeleton rows={5} cols={4} /></div>
          ) : data.length === 0 ? (
            <EmptyState icon={<FileCheck size={24} />} title="No frameworks" body="Seed or upload compliance frameworks" action={<button onClick={handleSeed} className="btn-primary">Load Seeds</button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">Framework</th>
                    <th className="th">Version</th>
                    <th className="th">Controls</th>
                    <th className="th">Category</th>
                    <th className="th">Status</th>
                    <th className="th w-40" />
                  </tr>
                </thead>
                <tbody>
                  {data.map((fw, i) => (
                    <tr key={fw.id || i} className="border-b border-phantix-700/20 hover:bg-phantix-800/40 transition-colors">
                      <td className="td">
                        <span className="block max-w-[28rem] truncate" title={fw.description}>
                          <span className="font-medium text-slate-100">{fw.name}</span>
                          <span className="ml-2 text-[13px] text-slate-500">{fw.description}</span>
                        </span>
                      </td>
                      <td className="td text-sm text-slate-300">{fw.version}</td>
                      <td className="td text-sm font-mono text-slate-300">{fw.control_count}</td>
                      <td className="td"><span className="chip text-xs text-slate-400 bg-slate-400/10 border-slate-500/30">{fw.category}</span></td>
                      <td className="td">{fw.is_active ? <StatusBadge status="active" /> : <StatusBadge status="closed" />}</td>
                      <td className="td">
                        <div className="inline-flex items-center gap-1">
                          <button className="btn-ghost text-xs px-2 py-1" onClick={() => { setSelectedFw(fw.id); setTab("questionnaire"); }}>
                            Questions
                          </button>
                          <button className="btn-ghost text-xs px-2 py-1" onClick={() => handleToggle(fw.id, fw.is_active)}>
                            {fw.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "questionnaire" && (
        <Card>
          <CardHeader
            title="GRC questionnaire catalog"
            subtitle="Read and edit every question. Multi-framework and mapped controls are preserved; expert edits survive rebuilds."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    className="input w-56 !py-1.5 !pl-8 text-sm"
                    placeholder="Search prompts, keys, tags…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select className="input w-auto py-1.5 text-sm" value={selectedFw} onChange={(e) => setSelectedFw(e.target.value)}>
                  <option value={ALL_FRAMEWORKS}>All frameworks</option>
                  {data.map((fw) => <option key={fw.id} value={fw.id}>{fw.name}</option>)}
                </select>
                <button className="btn-ghost text-sm px-3 py-1.5" onClick={() => void rebuild()}>
                  <RefreshCw size={14} /> Rebuild
                </button>
                <button className="btn-primary text-sm px-3 py-1.5" onClick={openNewQuestion} disabled={!data.length}>
                  <Plus size={14} /> New question
                </button>
              </div>
            }
          />
          {qLoading ? (
            <div className="p-4"><TableSkeleton rows={6} cols={4} /></div>
          ) : visibleQuestions.length === 0 ? (
            <EmptyState
              icon={<ListChecks size={24} />}
              title={questions.length ? "No questions match" : "No questions for this selection"}
              body="Seed/rebuild from framework controls, or add an expert-curated question."
              action={<button onClick={openNewQuestion} className="btn-primary">New question</button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">Question</th>
                    <th className="th">Frameworks</th>
                    <th className="th">Mapped controls</th>
                    <th className="th">Category</th>
                    <th className="th">Risk</th>
                    <th className="th">Source</th>
                    <th className="th">Status</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleQuestions.map((q) => (
                    <tr key={q.id} className="border-b border-phantix-700/20 hover:bg-phantix-800/40 transition-colors">
                      <td className="td max-w-[380px]">
                        <span className="block truncate" title={[q.prompt, q.question_key, q.help_text].filter(Boolean).join("\n")}>
                          <span className="text-slate-100">{q.prompt}</span>
                          <span className="ml-2 font-mono text-[12px] text-slate-500">{q.question_key}</span>
                        </span>
                      </td>
                      <td className="td">
                        <div className="flex flex-wrap gap-1">
                          {(q.framework_ids ?? []).map((f) => (
                            <span key={f} className="chip border-phantix-600/40 bg-phantix-800/50 text-[12px] text-slate-300" title={frameworkName(f)}>
                              {f}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="td max-w-[220px]">
                        {q.source_controls?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {q.source_controls.map((c, i) => (
                              <span key={`${c.framework_id}-${c.control_id}-${i}`} className="chip border-gold-400/25 bg-gold-400/5 text-[12px] text-gold-200" title={c.title ?? ""}>
                                <Link2 size={9} className="mr-0.5 inline" />{controlLabel(c)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">Not set</span>
                        )}
                      </td>
                      <td className="td text-xs text-slate-400">{q.category || "Not set"}</td>
                      <td className="td text-xs capitalize text-slate-300">{q.risk || "Not set"}</td>
                      <td className="td text-xs">
                        {q.is_expert_managed
                          ? <span className="chip border-gold-400/30 bg-gold-400/10 text-gold-300">expert</span>
                          : <span className="chip text-slate-500">auto</span>}
                      </td>
                      <td className="td">{q.is_active ? <StatusBadge status="active" /> : <StatusBadge status="inactive" />}</td>
                      <td className="td text-right">
                        <div className="inline-flex items-center gap-1">
                          <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => openEditQuestion(q)}><Pencil size={12} /> Edit</button>
                          {q.is_active && (
                            <button className="btn-ghost !px-2 !py-1 !text-xs text-severity-critical" title="Deactivate" onClick={() => void deactivateQuestion(q)}>
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Modal open={editorOpen} onClose={() => !busy && setEditorOpen(false)} title={editingId ? "Edit question" : "New question"} wide>
        <div className="space-y-4">
          <div>
            <label className="label">Prompt</label>
            <textarea className="input !min-h-[90px]" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} placeholder="Do you maintain an inventory of information assets?" />
          </div>

          <div>
            <label className="label">Frameworks this question applies to</label>
            <div className="flex flex-wrap gap-1.5 rounded-md border border-phantix-700/40 bg-phantix-950/40 p-2">
              {data.map((fw) => {
                const on = formFrameworks.includes(fw.id);
                return (
                  <button
                    key={fw.id}
                    type="button"
                    onClick={() => toggleFormFramework(fw.id)}
                    className={cx(
                      "chip text-[13px] transition-colors",
                      on ? "border-gold-400/40 bg-gold-400/15 text-gold-200" : "border-phantix-600/40 text-slate-400 hover:text-slate-200",
                    )}
                    title={fw.name}
                  >
                    {on ? "✓ " : ""}{fw.id}
                  </button>
                );
              })}
              {!data.length && <span className="text-xs text-slate-500">No frameworks loaded.</span>}
            </div>
            <p className="mt-1 text-[13px] text-slate-500">Select one or more. This is preserved on save.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Category</label>
              <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="governance" />
            </div>
            <div>
              <label className="label">Risk</label>
              <select className="input" value={form.risk} onChange={(e) => setForm({ ...form, risk: e.target.value })}>
                {["low", "medium", "high", "critical"].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Answer type</label>
              <select className="input" value={form.answer_type} onChange={(e) => setForm({ ...form, answer_type: e.target.value })}>
                <option value="yes_no_partial">yes / no / partial</option>
                <option value="yes_no">yes / no</option>
                <option value="free_text">free text</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="label !mb-0">Mapped source controls</label>
              <button type="button" className="btn-ghost !px-2 !py-1 !text-xs" onClick={addControl}>
                <Plus size={12} /> Add control
              </button>
            </div>
            {formControls.length === 0 ? (
              <p className="rounded-md border border-phantix-700/40 bg-phantix-950/40 p-2 text-[13px] text-slate-500">
                No mapped controls. Add the framework/control this question evidences.
              </p>
            ) : (
              <div className="space-y-2">
                {formControls.map((row, i) => (
                  <div key={i} className="grid grid-cols-12 items-center gap-2 border-b border-phantix-700/30 pb-2 sm:border-0 sm:pb-0">
                    <select
                      className="input col-span-6 !py-1.5 text-xs sm:col-span-3"
                      value={row.framework_id}
                      onChange={(e) => updateControl(i, { framework_id: e.target.value })}
                    >
                      <option value="">framework…</option>
                      {data.map((fw) => <option key={fw.id} value={fw.id}>{fw.id}</option>)}
                    </select>
                    <input
                      className="input col-span-6 !py-1.5 text-xs sm:col-span-3"
                      placeholder="control id (e.g. NDPA-34)"
                      value={row.control_id}
                      onChange={(e) => updateControl(i, { control_id: e.target.value })}
                    />
                    <input
                      className="input col-span-10 !py-1.5 text-xs sm:col-span-5"
                      placeholder="control title (optional)"
                      value={row.title}
                      onChange={(e) => updateControl(i, { title: e.target.value })}
                    />
                    <button type="button" className="col-span-2 btn-ghost !px-1.5 !py-1 text-severity-critical sm:col-span-1" onClick={() => removeControl(i)} aria-label="Remove control">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="label">Help text (optional)</label>
            <textarea className="input !min-h-[60px]" value={form.help_text} onChange={(e) => setForm({ ...form, help_text: e.target.value })} />
          </div>
          <div>
            <label className="label">Expert notes (internal, optional)</label>
            <textarea className="input !min-h-[50px]" value={form.expert_notes} onChange={(e) => setForm({ ...form, expert_notes: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded accent-gold-400" />
            Active
          </label>
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1 text-[13px] text-slate-500">
              <ShieldCheck size={12} /> {formFrameworks.length} framework(s) · {formControls.filter((c) => c.framework_id && c.control_id).length} control(s)
            </p>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" disabled={busy} onClick={() => setEditorOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={busy} onClick={() => void saveQuestion()}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <FileCheck size={14} />} {editingId ? "Save changes" : "Create question"}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
