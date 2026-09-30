import React, { useState } from "react";
import { Mail, Plus, RefreshCw, Pencil, Trash2, Loader2 } from "lucide-react";
import { PageHeader, Card, StatusBadge, Modal, EmptyState, TableSkeleton } from "@/components/ui";
import { api, DEMO_MODE } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { cx, timeAgo } from "@/lib/utils";

interface EmailTemplate {
  id: number;
  template_key: string;
  category: string;
  name: string;
  subject: string;
  html_body: string;
  text_body?: string | null;
  is_active: boolean;
  updated_by_staff_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

const demoTemplates: EmailTemplate[] = [
  { id: 1, template_key: "otp.login", category: "transactional", name: "Login OTP", subject: "Your SecureGraph login code", html_body: "<p>Code: {{code}}</p>", text_body: "Code: {{code}}", is_active: true, created_at: new Date().toISOString() },
  { id: 2, template_key: "alert.critical", category: "transactional", name: "Critical alert", subject: "[CRITICAL] {{title}}", html_body: "<p>{{body}}</p>", is_active: true, created_at: new Date().toISOString() },
  { id: 3, template_key: "marketing.launch", category: "marketing", name: "Launch announcement", subject: "SecureGraph is live", html_body: "<p>We're live.</p>", is_active: false, created_at: new Date().toISOString() },
];

const emptyForm = { template_key: "", category: "transactional", name: "", subject: "", html_body: "", text_body: "" };

export default function EmailTemplates() {
  const { toast } = useStore();
  const templates = useResource<EmailTemplate[]>(async () => {
    if (DEMO_MODE) return demoTemplates;
    const raw = await api.get<any>("/staff/email-templates");
    return (Array.isArray(raw) ? raw : (raw?.items ?? [])) as EmailTemplate[];
  }, []);
  const data = DEMO_MODE ? demoTemplates : templates.data;

  const [editor, setEditor] = useState<{ open: boolean; isNew: boolean; form: typeof emptyForm; id?: number }>({ open: false, isNew: true, form: emptyForm });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<EmailTemplate | null>(null);

  const openNew = () => setEditor({ open: true, isNew: true, form: { ...emptyForm } });
  const openEdit = (t: EmailTemplate) => setEditor({ open: true, isNew: false, id: t.id, form: { template_key: t.template_key, category: t.category, name: t.name, subject: t.subject, html_body: t.html_body, text_body: t.text_body ?? "" } });

  const save = async () => {
    const f = editor.form;
    if (!f.template_key.trim() || !f.name.trim() || !f.subject.trim() || !f.html_body.trim()) {
      toast("error", "Missing fields", "template_key, name, subject and html_body are required.");
      return;
    }
    setBusy(true);
    try {
      if (editor.isNew) {
        if (DEMO_MODE) { /* no-op */ }
        else await api.post("/staff/email-templates", { ...f, is_active: true });
      } else {
        if (DEMO_MODE) { /* no-op */ }
        else await api.patch(`/staff/email-templates/${editor.id}`, { ...f, is_active: true });
      }
      toast("success", editor.isNew ? "Created" : "Updated", f.template_key);
      setEditor((p) => ({ ...p, open: false }));
      templates.refresh();
    } catch (e) {
      toast("error", "Save failed", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: EmailTemplate) => {
    setBusy(true);
    try {
      if (!DEMO_MODE) await api.delete(`/staff/email-templates/${t.id}`);
      toast("success", "Deleted", t.template_key);
      setConfirmDelete(null);
      templates.refresh();
    } catch (e) {
      toast("error", "Delete failed", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (t: EmailTemplate) => {
    try {
      if (!DEMO_MODE) await api.patch(`/staff/email-templates/${t.id}`, { ...t, is_active: !t.is_active });
      toast("success", t.is_active ? "Deactivated" : "Activated", t.template_key);
      templates.refresh();
    } catch (e) {
      toast("error", "Update failed", e instanceof Error ? e.message : "");
    }
  };

  return (
    <div>
      <PageHeader
        title="Email Templates"
        description="Transactional and marketing email templates served by the platform"
        actions={<button onClick={openNew} className="btn-primary text-sm px-3 py-1.5"><Plus size={14} /> New template</button>}
      />

      <Card>
        {templates.loading && !templates.data.length ? (
          <div className="p-4"><TableSkeleton rows={6} cols={4} /></div>
        ) : data.length === 0 ? (
          <EmptyState icon={<Mail size={24} />} title="No templates" body="Create your first email template." action={<button onClick={openNew} className="btn-primary">New template</button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-phantix-700/40">
                  <th className="th">Key</th>
                  <th className="th">Category</th>
                  <th className="th">Subject</th>
                  <th className="th">Status</th>
                  <th className="th">Updated</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((t) => (
                  <tr key={t.id} className="border-b border-phantix-700/20 hover:bg-phantix-900/30">
                    <td className="td">
                      <span className="block max-w-[24rem] truncate" title={t.name}>
                        <span className="font-mono text-[13px] text-gold-300">{t.template_key}</span>
                        <span className="ml-2 text-[13px] text-slate-400">{t.name}</span>
                      </span>
                    </td>
                    <td className="td"><span className="chip text-slate-400">{t.category}</span></td>
                    <td className="td max-w-[260px] truncate text-xs text-slate-300">{t.subject}</td>
                    <td className="td">
                      <button onClick={() => void toggleActive(t)} title="Toggle active" className="focus:outline-none">
                        <StatusBadge status={t.is_active ? "active" : "inactive"} />
                      </button>
                    </td>
                    <td className="td text-xs text-slate-500">{t.updated_at ? timeAgo(t.updated_at) : "Not set"}</td>
                    <td className="td text-right">
                      <div className="inline-flex items-center gap-1">
                        <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => openEdit(t)}><Pencil size={12} /> Edit</button>
                        <button className="btn-ghost !px-2 !py-1 !text-xs text-severity-critical" onClick={() => setConfirmDelete(t)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={editor.open} onClose={() => !busy && setEditor((p) => ({ ...p, open: false }))} title={editor.isNew ? "New email template" : `Edit ${editor.form.template_key}`} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Template key</label>
              <input className="input" value={editor.form.template_key} disabled={!editor.isNew} onChange={(e) => setEditor((p) => ({ ...p, form: { ...p.form, template_key: e.target.value } }))} placeholder="otp.login" />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={editor.form.category} onChange={(e) => setEditor((p) => ({ ...p, form: { ...p.form, category: e.target.value } }))}>
                <option value="transactional">transactional</option>
                <option value="marketing">marketing</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Name</label>
            <input className="input" value={editor.form.name} onChange={(e) => setEditor((p) => ({ ...p, form: { ...p.form, name: e.target.value } }))} placeholder="Login OTP" />
          </div>
          <div>
            <label className="label">Subject</label>
            <input className="input" value={editor.form.subject} onChange={(e) => setEditor((p) => ({ ...p, form: { ...p.form, subject: e.target.value } }))} placeholder="Your SecureGraph login code" />
          </div>
          <div>
            <label className="label">HTML body</label>
            <textarea className="input !min-h-[140px] font-mono text-xs" value={editor.form.html_body} onChange={(e) => setEditor((p) => ({ ...p, form: { ...p.form, html_body: e.target.value } }))} placeholder={"<p>Your code is {{code}}</p>"} />
          </div>
          <div>
            <label className="label">Text body (optional)</label>
            <textarea className="input !min-h-[70px] text-xs" value={editor.form.text_body} onChange={(e) => setEditor((p) => ({ ...p, form: { ...p.form, text_body: e.target.value } }))} placeholder="Your code is {{code}}" />
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" disabled={busy} onClick={() => setEditor((p) => ({ ...p, open: false }))}>Cancel</button>
            <button className="btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} {editor.isNew ? "Create" : "Save changes"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} title="Delete email template?">
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Delete <span className="font-mono text-gold-300">{confirmDelete?.template_key}</span>? Emails already sent are unaffected, but future sends using this key will fail until a template is restored.
          </p>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" disabled={busy} onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn-danger" disabled={busy} onClick={() => confirmDelete && void remove(confirmDelete)}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
