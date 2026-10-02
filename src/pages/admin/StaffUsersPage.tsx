import React, { useState } from "react";
import { Users, Plus, RefreshCw, Shield, Pencil, KeyRound } from "lucide-react";
import { PageHeader, Card, StatusBadge, TableSkeleton, EmptyState, Modal } from "@/components/ui";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import type { StaffUserDetail } from "@/lib/types";

const demoStaff: StaffUserDetail[] = [
  { id: 1, email: "super@phantixlabs.com", full_name: "System Superadmin", role: "superadmin", is_active: true, last_login_at: new Date().toISOString(), created_at: "2026-01-01T00:00:00Z", created_by: null },
  { id: 2, email: "admin@phantixlabs.com", full_name: "Platform Admin", role: "admin", is_active: true, last_login_at: new Date(Date.now() - 86400000).toISOString(), created_at: "2026-01-15T00:00:00Z", created_by: 1 },
  { id: 3, email: "support@phantixlabs.com", full_name: "Support Lead", role: "support", is_active: true, last_login_at: new Date(Date.now() - 3600000).toISOString(), created_at: "2026-02-01T00:00:00Z", created_by: 1 },
  { id: 4, email: "support2@phantixlabs.com", full_name: "Support Agent", role: "support", is_active: true, last_login_at: new Date(Date.now() - 7200000).toISOString(), created_at: "2026-03-01T00:00:00Z", created_by: 2 },
];

export default function StaffUsers() {
  const { toast, isSuperadmin } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newStaff, setNewStaff] = useState({ email: "", full_name: "", role: "support" });
  const [creating, setCreating] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffUserDetail | null>(null);
  const [staffForm, setStaffForm] = useState({ full_name: "", role: "support", is_active: true, password: "" });

  const staff = useResource<StaffUserDetail[]>(
    async (signal) => {
      if (DEMO_MODE) return demoStaff;
      const raw = await api.get<any>("/staff");
      const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
      return items as StaffUserDetail[];
    },
    [],
  );

  const data = DEMO_MODE ? demoStaff : (staff.data?.length ? staff.data : []);

  const handleCreate = async () => {
    if (!newStaff.email || !newStaff.full_name) { toast("error", "Required fields", "Name and email are required"); return; }
    setCreating(true);
    try {
      const res = await api.post<{ email_sent?: boolean; email_error?: string | null }>("/staff", newStaff);
      if (res?.email_sent === false) {
        toast("warning", "Staff created. Email not sent.", res.email_error || "Check SMTP configuration.");
      } else {
        toast("success", "Staff created", `Temporary password emailed to ${newStaff.email}`);
      }
      setShowCreate(false);
      setNewStaff({ email: "", full_name: "", role: "support" });
      staff.refresh();
    } catch (e) {
      toast("error", "Create failed", e instanceof Error ? e.message : "");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Staff Users"
        description="Manage internal staff accounts (superadmin only)"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => staff.refresh()} className="btn-ghost text-sm px-3 py-1.5">
              <RefreshCw size={14} />
            </button>
            {isSuperadmin && (
              <button onClick={() => setShowCreate(true)} className="btn-primary text-sm px-3 py-1.5">
                <Plus size={14} /> Add Staff
              </button>
            )}
          </div>
        }
      />

      <Card>
        {staff.loading ? (
          <div className="p-4"><TableSkeleton rows={4} cols={5} /></div>
        ) : data.length === 0 ? (
          <EmptyState icon={<Users size={24} />} title="No staff users" body="Create the first staff account" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-phantix-700/40">
                  <th className="th">Staff</th>
                  <th className="th">Role</th>
                  <th className="th">Status</th>
                  <th className="th">Last Login</th>
                  <th className="th">Created</th>
                  <th className="th w-12" />
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className="border-b border-phantix-700/20 hover:bg-phantix-800/40">
                    <td className="td">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="font-medium text-slate-100">{s.full_name}</span>
                        <span className="text-[13px] text-slate-500">{s.email}</span>
                        {s.must_change_password && (
                          <span className="chip text-[12px] text-severity-medium bg-severity-medium/10 border-severity-medium/30">
                            password change pending
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="td">
                      <span className={`chip capitalize text-xs ${
                        s.role === "superadmin" ? "text-severity-critical bg-severity-critical/10 border-severity-critical/30"
                        : s.role === "admin" ? "text-severity-high bg-severity-high/10 border-severity-high/30"
                        : s.role === "editor" ? "text-gold-300 bg-gold-400/10 border-gold-400/30"
                        : "text-severity-low bg-severity-low/10 border-severity-low/30"
                      }`}>
                        {s.role}
                      </span>
                    </td>
                    <td className="td">{s.is_active ? <StatusBadge status="active" /> : <StatusBadge status="closed" />}</td>
                    <td className="td text-xs text-slate-500">{timeAgo(s.last_login_at)}</td>
                    <td className="td text-xs text-slate-500">{new Date(s.created_at).toLocaleDateString()}</td>
                    <td className="td">
                      <button onClick={() => { setEditingStaff(s); setStaffForm({ full_name: s.full_name, role: s.role, is_active: s.is_active, password: "" }); }} className="btn-ghost p-1.5" title="Edit"><Pencil size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Staff User">
        <div className="space-y-3">
          <div>
            <label className="label">Full Name</label>
            <input className="input" value={newStaff.full_name} onChange={(e) => setNewStaff((s) => ({ ...s, full_name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={newStaff.email} onChange={(e) => setNewStaff((s) => ({ ...s, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={newStaff.role} onChange={(e) => setNewStaff((s) => ({ ...s, role: e.target.value }))}>
              <option value="support">Support</option>
              <option value="editor">Editor (Weekly)</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-phantix-800/50 border border-phantix-700/40 px-3 py-2 text-xs text-slate-400">
            <KeyRound size={14} className="mt-0.5 shrink-0 text-gold-400" />
            <span>
              The account is created with the temporary password <span className="font-mono text-gold-300">Pa$$w0rd!</span> and
              emailed to the user. They must set their own password on first sign-in.
            </span>
          </div>
          <button onClick={handleCreate} disabled={creating} className="btn-primary w-full">
            {creating && <RefreshCw size={14} className="animate-spin" />}
            Create Staff User
          </button>
        </div>
      </Modal>

      <Modal open={!!editingStaff} onClose={() => setEditingStaff(null)} title={editingStaff ? `Edit: ${editingStaff.full_name}` : ""}>
        {editingStaff && (
          <div className="space-y-3">
            <div><label className="label">Full Name</label><input className="input" value={staffForm.full_name} onChange={e => setStaffForm(f => ({...f, full_name: e.target.value}))} /></div>
            <div><label className="label">Role</label>
              <select className="input" value={staffForm.role} onChange={e => setStaffForm(f => ({...f, role: e.target.value}))}>
                <option value="support">Support</option><option value="editor">Editor (Weekly)</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option>
              </select>
            </div>
            <div><label className="label">Status</label>
              <select className="input" value={staffForm.is_active ? "true" : "false"} onChange={e => setStaffForm(f => ({...f, is_active: e.target.value === "true"}))}>
                <option value="true">Active</option><option value="false">Inactive</option>
              </select>
            </div>
            <div><label className="label">New Password (leave blank to keep)</label><input className="input" type="password" value={staffForm.password} onChange={e => setStaffForm(f => ({...f, password: e.target.value}))} /></div>
            <button onClick={async () => {
              try {
                const body: any = { full_name: staffForm.full_name, role: staffForm.role, is_active: staffForm.is_active };
                if (staffForm.password) body.password = staffForm.password;
                await api.patch(`/staff/${editingStaff.id}`, body);
                toast("success", "Staff updated"); setEditingStaff(null); staff.refresh();
              } catch(e) { toast("error", e instanceof Error ? e.message : ""); }
            }} className="btn-primary w-full">Save Changes</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
