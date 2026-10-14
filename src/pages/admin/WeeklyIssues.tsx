import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Card, EmptyState, Modal, PageHeader, TableSkeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { timeAgo } from "@/lib/utils";
import type { BlogIssue } from "@/pages/admin/weeklyShared";

/**
 * Issues — the staff-only inventory of every issue of the Weekly.
 *
 * An issue is the unit posts are filed under. This page creates, renames and
 * retires them and shows how many posts each holds; clicking a count jumps
 * back to the inventory filtered to that issue.
 */

const STATUS_META: Record<string, string> = {
  open: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  published: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  archived: "border-phantix-600/50 bg-phantix-800/60 text-slate-400",
};

interface IssueForm {
  number: string;
  name: string;
  date: string;
  status: BlogIssue["status"];
}

const EMPTY_FORM: IssueForm = { number: "", name: "", date: "", status: "open" };

export default function WeeklyIssues() {
  const navigate = useNavigate();
  const { toast, isAdmin } = useStore();
  const issues = useResource<BlogIssue[]>(async () => {
    const raw = await api.get<{ items: BlogIssue[] }>("/admin/blog/issues");
    return raw?.items ?? [];
  }, []);

  const [form, setForm] = useState<IssueForm | null>(null);
  const [editing, setEditing] = useState<BlogIssue | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BlogIssue | null>(null);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
  };
  const openEdit = (issue: BlogIssue) => {
    setEditing(issue);
    setForm({ number: issue.number, name: issue.name, date: issue.date, status: issue.status });
  };

  const submit = async () => {
    if (!form) return;
    if (!form.number.trim() && !form.name.trim()) {
      toast("error", "Name the issue", "Give it a number such as “Issue 01”, or a name.");
      return;
    }
    setBusy(true);
    try {
      const body = {
        number: form.number.trim(),
        name: form.name.trim(),
        date: form.date.trim(),
        status: form.status,
      };
      if (editing) await api.patch(`/admin/blog/issues/${editing.id}`, body);
      else await api.post("/admin/blog/issues", body);
      toast("success", editing ? "Issue updated" : "Issue created", body.number || body.name);
      setForm(null);
      setEditing(null);
      issues.refresh();
    } catch (e) {
      toast("error", "Could not save the issue", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/admin/blog/issues/${confirmDelete.id}`);
      toast("success", "Issue deleted", `${confirmDelete.number || confirmDelete.name} · its posts are now unassigned`);
      setConfirmDelete(null);
      issues.refresh();
    } catch (e) {
      toast("error", "Could not delete the issue", e instanceof Error ? e.message : "");
    }
  };

  return (
    <div>
      <PageHeader
        title="Issues"
        description="Every issue of the Weekly. Posts are filed under one issue; deleting an issue keeps its posts and leaves them unassigned."
        actions={
          <>
            <button onClick={issues.refresh} className="btn-ghost !px-3 !py-1.5" aria-label="Refresh" title="Refresh">
              <RefreshCw size={14} />
            </button>
            <button className="btn-primary" onClick={openNew}>
              <Plus size={15} /> New issue
            </button>
          </>
        }
      />

      <Card className="!p-0 overflow-hidden">
        {issues.loading && !issues.data.length ? (
          <div className="p-4"><TableSkeleton rows={4} cols={4} /></div>
        ) : issues.data.length === 0 ? (
          <EmptyState
            icon={<FolderOpen size={24} />}
            title="No issues yet"
            body="Create an issue such as “Issue 01”, then file posts under it from the inventory."
            action={<button className="btn-primary" onClick={openNew}><Plus size={15} /> New issue</button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-phantix-700/40">
                  <th className="th">Issue</th>
                  <th className="th">Date</th>
                  <th className="th">Status</th>
                  <th className="th">Posts</th>
                  <th className="th">Updated</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {issues.data.map((i) => (
                  <tr key={i.id} className="border-b border-phantix-700/20 hover:bg-phantix-900/30">
                    <td className="td">
                      <p className="font-medium text-slate-100">{i.number || i.slug}</p>
                      {i.name ? <p className="text-xs text-slate-500">{i.name}</p> : null}
                    </td>
                    <td className="td text-xs text-slate-400">{i.date || "—"}</td>
                    <td className="td">
                      <span className={`chip ${STATUS_META[i.status] ?? STATUS_META.archived}`}>{i.status}</span>
                    </td>
                    <td className="td">
                      <button
                        className="btn-ghost !px-2 !py-1 !text-xs"
                        onClick={() => navigate(`/weekly?issue=${i.id}`)}
                      >
                        {i.post_count} {i.post_count === 1 ? "post" : "posts"}
                      </button>
                    </td>
                    <td className="td text-xs text-slate-500">{i.updated_at ? timeAgo(i.updated_at) : "—"}</td>
                    <td className="td text-right">
                      <div className="inline-flex items-center gap-1">
                        <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => openEdit(i)}>
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          className="btn-ghost !px-2 !py-1 !text-xs text-severity-critical disabled:opacity-40"
                          onClick={() => setConfirmDelete(i)}
                          disabled={!isAdmin}
                          title={isAdmin ? "Delete issue" : "Admins only"}
                        >
                          <Trash2 size={13} />
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

      {/* ── Create / edit ── */}
      <Modal
        open={Boolean(form)}
        onClose={() => !busy && (setForm(null), setEditing(null))}
        title={editing ? "Edit issue" : "New issue"}
      >
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="issue-number">Issue number</label>
                <input
                  id="issue-number"
                  className="input"
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                  placeholder="Issue 01"
                />
              </div>
              <div>
                <label className="label" htmlFor="issue-date">Date</label>
                <input
                  id="issue-date"
                  className="input"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  placeholder="September 2026"
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="issue-name">Name</label>
              <input
                id="issue-name"
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="The launch issue"
              />
            </div>
            <div>
              <label className="label" htmlFor="issue-status">Status</label>
              <select
                id="issue-status"
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as BlogIssue["status"] })}
              >
                <option value="open">Open — still being written</option>
                <option value="published">Published — live</option>
                <option value="archived">Archived — retired</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" disabled={busy} onClick={() => { setForm(null); setEditing(null); }}>
                Cancel
              </button>
              <button className="btn-primary" disabled={busy} onClick={() => void submit()}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                {editing ? "Save issue" : "Create issue"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Delete ── */}
      <Modal open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} title="Delete this issue?">
        {confirmDelete && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              “{confirmDelete.number || confirmDelete.name}” will be removed. Its{" "}
              {confirmDelete.post_count === 1 ? "1 post" : `${confirmDelete.post_count} posts`} will not be deleted —
              they stay in the inventory as unassigned drafts.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Keep it</button>
              <button className="btn-danger" onClick={() => void remove()}>
                <Trash2 size={14} /> Delete issue
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
