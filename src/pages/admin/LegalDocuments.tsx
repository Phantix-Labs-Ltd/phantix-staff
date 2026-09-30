import React, { useState } from "react";
import { FileText, RefreshCw, Pencil, RotateCcw, Loader2, ScrollText } from "lucide-react";
import { PageHeader, Card, StatusBadge, Modal, EmptyState, TableSkeleton } from "@/components/ui";
import { api, DEMO_MODE } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { timeAgo } from "@/lib/utils";

interface LegalDoc {
  doc_key: string;
  title: string;
  version: string;
  effective: string;
  summary: string;
  sections: unknown[];
  acceptance_required_copy?: string | null;
  links: unknown[];
  updated_by_staff_id?: number | null;
  updated_at?: string | null;
}

const demoLaws: LegalDoc[] = [
  { doc_key: "terms", title: "Terms of Service", version: "2026.1", effective: "2026-01-01", summary: "Platform terms of service.", sections: [], links: [], updated_at: new Date().toISOString() },
  { doc_key: "aup", title: "Acceptable Use Policy", version: "2026.1", effective: "2026-01-01", summary: "Acceptable use policy.", sections: [], links: [], updated_at: new Date().toISOString() },
];

const EDITABLE_KEYS = ["terms", "aup"];

export default function LegalDocuments() {
  const { toast } = useStore();
  const docs = useResource<LegalDoc[]>(async () => {
    if (DEMO_MODE) return demoLaws;
    const raw = await api.get<any>("/staff/legal-documents");
    return (Array.isArray(raw) ? raw : (raw?.items ?? [])) as LegalDoc[];
  }, []);
  const data = DEMO_MODE ? demoLaws : docs.data;

  const [editing, setEditing] = useState<LegalDoc | null>(null);
  const [draft, setDraft] = useState<LegalDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [sectionsText, setSectionsText] = useState("");
  const [linksText, setLinksText] = useState("");

  const openEdit = (doc: LegalDoc) => {
    setEditing(doc);
    setDraft({ ...doc });
    setSectionsText(JSON.stringify(doc.sections ?? [], null, 2));
    setLinksText(JSON.stringify(doc.links ?? [], null, 2));
  };

  const save = async () => {
    if (!draft) return;
    let sections: unknown[] = [];
    let links: unknown[] = [];
    try {
      sections = sectionsText.trim() ? JSON.parse(sectionsText) : [];
      links = linksText.trim() ? JSON.parse(linksText) : [];
    } catch {
      toast("error", "Invalid JSON", "Sections and links must be valid JSON arrays.");
      return;
    }
    if (!draft.title.trim() || !draft.version.trim()) {
      toast("error", "Missing fields", "Title and version are required.");
      return;
    }
    setBusy(true);
    try {
      if (!DEMO_MODE) {
        await api.put(`/staff/legal-documents/${draft.doc_key}`, {
          doc_key: draft.doc_key,
          title: draft.title,
          version: draft.version,
          effective: draft.effective ?? "",
          summary: draft.summary ?? "",
          sections,
          acceptance_required_copy: draft.acceptance_required_copy ?? null,
          links,
        });
      }
      toast("success", "Saved", draft.doc_key);
      setEditing(null);
      docs.refresh();
    } catch (e) {
      toast("error", "Save failed", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (doc: LegalDoc, active: boolean) => {
    try {
      if (!DEMO_MODE) await api.post(`/staff/legal-documents/${doc.doc_key}/active?active=${active}`, {});
      toast("success", active ? "Activated" : "Deactivated", doc.doc_key);
      docs.refresh();
    } catch (e) {
      toast("error", "Update failed", e instanceof Error ? e.message : "");
    }
  };

  const restore = async (doc: LegalDoc) => {
    setBusy(true);
    try {
      if (!DEMO_MODE) await api.post(`/staff/legal-documents/${doc.doc_key}/restore`, {});
      toast("success", "Restored defaults", doc.doc_key);
      docs.refresh();
    } catch (e) {
      toast("error", "Restore failed", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  const activeDoc = data.find((d) => d.doc_key === "terms");
  const showActiveToggle = (doc: LegalDoc) => EDITABLE_KEYS.includes(doc.doc_key);

  return (
    <div>
      <PageHeader
        title="Legal Documents"
        description="Manage Terms, AUP and related legal documents. Public copies serve from the active version."
        actions={
          <button onClick={docs.refresh} className="btn-ghost text-sm px-3 py-1.5"><RefreshCw size={14} /></button>
        }
      />

      <Card>
        {docs.loading && !docs.data.length ? (
          <div className="p-4"><TableSkeleton rows={5} cols={4} /></div>
        ) : data.length === 0 ? (
          <EmptyState icon={<FileText size={24} />} title="No legal documents" body="Legal documents will appear here once seeded." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-phantix-700/40">
                  <th className="th">Key</th>
                  <th className="th">Version</th>
                  <th className="th">Effective</th>
                  <th className="th">Summary</th>
                  <th className="th">Updated</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((doc) => {
                  const isCurrent = activeDoc?.doc_key === doc.doc_key;
                  return (
                    <tr key={doc.doc_key} className="border-b border-phantix-700/20 hover:bg-phantix-900/30">
                      <td className="td">
                        <span className="block max-w-[24rem] truncate" title={doc.title}>
                          <span className="font-mono text-[13px] text-gold-300">{doc.doc_key}</span>
                          <span className="ml-2 text-[13px] text-slate-400">{doc.title}</span>
                        </span>
                      </td>
                      <td className="td text-xs text-slate-300">{doc.version}</td>
                      <td className="td text-xs text-slate-500">{doc.effective || "Not set"}</td>
                      <td className="td max-w-[280px] truncate text-xs text-slate-400">{doc.summary || "Not set"}</td>
                      <td className="td text-xs text-slate-500">{doc.updated_at ? timeAgo(doc.updated_at) : "Not set"}</td>
                      <td className="td text-right">
                        <div className="inline-flex items-center gap-1">
                          {showActiveToggle(doc) && (
                            <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => void setActive(doc, !isCurrent)} title={isCurrent ? "Deactivate" : "Activate"}>
                              <StatusBadge status={isCurrent ? "active" : "inactive"} />
                            </button>
                          )}
                          {EDITABLE_KEYS.includes(doc.doc_key) ? (
                            <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => openEdit(doc)}><Pencil size={12} /> Edit</button>
                          ) : (
                            <span className="text-[12px] text-slate-600">read-only</span>
                          )}
                          <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => void restore(doc)} title="Restore factory defaults"><RotateCcw size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={Boolean(editing)} onClose={() => !busy && setEditing(null)} title={`Edit ${editing?.doc_key ?? ""}`} wide>
        {draft && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="label">Title</label>
                <input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div>
                <label className="label">Version</label>
                <input className="input" value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} placeholder="2026.1" />
              </div>
            </div>
            <div>
              <label className="label">Effective date</label>
              <input className="input" value={draft.effective ?? ""} onChange={(e) => setDraft({ ...draft, effective: e.target.value })} placeholder="2026-01-01" />
            </div>
            <div>
              <label className="label">Summary</label>
              <textarea className="input !min-h-[60px]" value={draft.summary ?? ""} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
            </div>
            <div>
              <label className="label">Sections (JSON array)</label>
              <textarea className="input !min-h-[140px] font-mono text-xs" value={sectionsText} onChange={(e) => setSectionsText(e.target.value)} />
            </div>
            <div>
              <label className="label">Acceptance-required copy (optional)</label>
              <textarea className="input !min-h-[50px]" value={draft.acceptance_required_copy ?? ""} onChange={(e) => setDraft({ ...draft, acceptance_required_copy: e.target.value })} />
            </div>
            <div>
              <label className="label">Links (JSON array)</label>
              <textarea className="input !min-h-[50px] font-mono text-xs" value={linksText} onChange={(e) => setLinksText(e.target.value)} />
            </div>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy} onClick={() => void save()}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <ScrollText size={14} />} Save document
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
