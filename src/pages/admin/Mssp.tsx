import React, { useState } from "react";
import { Building2, Handshake, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { PageHeader, Card, StatusBadge, EmptyState, TableSkeleton, Modal } from "@/components/ui";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

/**
 * MSSP management — who is a managed security service provider, and how many
 * clients their plan allows.
 *
 * MSSP billing is custom, so no price lives here: only the number staff enforce at
 * client onboarding (the backend refuses a client past it) and the commercial
 * reference agreed with sales. Uses the portal's own primitives — `useResource` for
 * SWR loading, `PageHeader`/`Card`/`StatusBadge`/`EmptyState`/`TableSkeleton`/`Modal`
 * for the surface — so this page behaves like every other admin page.
 */

interface MsspClient {
  organization_id: number;
  name: string;
  slug: string;
  is_active: boolean;
  organization_type: string;
}

interface MsspRow {
  organization_id: number;
  name: string;
  slug: string;
  is_active: boolean;
  organization_type: string;
  is_group: boolean;
  max_clients: number | null;
  clients_used: number;
  clients_remaining: number | null;
  mssp_plan: string | null;
  mssp_notes: string | null;
  organization_type_set_at: string | null;
  organization_type_set_by: string | null;
  features: string[];
  clients: MsspClient[];
}

type Draft = { max_clients: string; mssp_plan: string; mssp_notes: string };

export default function Mssp() {
  const { toast } = useStore();
  const { data, loading, error, refresh } = useResource<MsspRow[]>(
    async () => (await api.get<MsspRow[]>("/staff/mssp")) ?? [],
    [],
    "admin-mssp",
  );
  const rows = data ?? [];
  const [editing, setEditing] = useState<MsspRow | null>(null);
  const [draft, setDraft] = useState<Draft>({ max_clients: "", mssp_plan: "", mssp_notes: "" });
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const openEditor = (row: MsspRow) => {
    setEditing(row);
    setDraft({
      max_clients: row.max_clients === null ? "" : String(row.max_clients),
      mssp_plan: row.mssp_plan ?? "",
      mssp_notes: row.mssp_notes ?? "",
    });
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await api.patch(`/staff/mssp/${editing.organization_id}`, {
        max_clients: draft.max_clients.trim() === "" ? null : Number(draft.max_clients),
        mssp_plan: draft.mssp_plan.trim() || null,
        mssp_notes: draft.mssp_notes.trim() || null,
      });
      toast("success", "Saved", `${editing.name} updated`);
      setEditing(null);
      refresh();
    } catch (e) {
      toast("error", "Could not save", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="MSSP management"
        description="Who is managed-service provider, how many clients their plan allows, and the sales reference. Billing stays with sales — this holds the number only."
        actions={
          <button className="btn-secondary" onClick={refresh}>
            <RefreshCw size={14} className="mr-1 inline" /> Refresh
          </button>
        }
      />

      {error && <Card className="mb-3 border-severity-critical/40 p-3 text-sm text-severity-critical">{error}</Card>}

      {loading ? (
        <Card><TableSkeleton rows={4} cols={5} /></Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Handshake size={22} />}
          title="No MSSP organizations yet"
          body="An organization becomes an MSSP when staff confirm its type. Registration can declare it; this is where it is capped and referenced."
        />
      ) : (
        <Card className="!p-0 overflow-x-auto">
          <table className="w-full min-w-[54rem] text-left text-sm">
            <thead className="border-b border-phantix-700/50 text-[12px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">MSSP</th>
                <th className="px-3 py-2.5">Clients</th>
                <th className="px-3 py-2.5">Sales reference</th>
                <th className="px-3 py-2.5">Set by</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <React.Fragment key={row.organization_id}>
                  <tr className="border-b border-phantix-800/40 last:border-0">
                    <td className="px-3 py-2.5">
                      <p className="flex items-center gap-2 font-medium text-slate-200">
                        <Building2 size={14} className="text-gold-300" />
                        {row.name}
                        <span className="text-[12px] text-slate-500">/{row.slug}</span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
                        <StatusBadge status={row.is_active ? "active" : "inactive"} />
                        <ShieldCheck size={11} />
                        {row.features.length ? row.features.join(" · ") : "no MSSP features"}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-slate-300">
                      {row.clients_used}/{row.max_clients ?? "—"}
                      {row.clients_remaining !== null && (
                        <span className="ml-1 text-[12px] text-slate-600">({row.clients_remaining} left)</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">{row.mssp_plan ?? "—"}</td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-500">
                      {row.organization_type_set_by ?? "—"}
                      {row.organization_type_set_at && <span className="ml-1 text-slate-600">{timeAgo(row.organization_type_set_at)}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button className="btn-secondary !py-1 !text-xs" onClick={() => setExpanded(expanded === row.organization_id ? null : row.organization_id)}>
                        <Users size={12} className="mr-1 inline" />
                        {row.clients.length}
                      </button>
                      <button className="btn-secondary ml-1.5 !py-1 !text-xs" onClick={() => openEditor(row)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                  {expanded === row.organization_id && (
                    <tr className="border-b border-phantix-800/40 bg-phantix-950/40">
                      <td colSpan={5} className="px-3 py-2">
                        {row.clients.length === 0 ? (
                          <p className="text-[12px] text-slate-500">No clients onboarded yet.</p>
                        ) : (
                          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-300">
                            {row.clients.map((c) => (
                              <li key={c.organization_id} className={c.is_active ? "" : "opacity-60"}>
                                {c.name} <span className="text-slate-600">/{c.slug}</span>
                                {!c.is_active && <span className="ml-1 text-red-300">deactivated</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                        {row.mssp_notes && <p className="mt-1 text-[12px] text-slate-500">{row.mssp_notes}</p>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-3 text-[12px] leading-4 text-slate-600">
        Lowering a cap below the current client count blocks new clients only. Removing MSSP status is refused while
        clients exist. Every change is audited as <code>staff.mssp.updated</code>.
      </p>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={`MSSP settings — ${editing?.name ?? ""}`}>
        <div className="space-y-3">
          <label className="block text-[12px] uppercase tracking-wide text-slate-500">
            Client cap
            <input
              type="number"
              min={0}
              max={10000}
              className="input mt-1 w-full py-2 text-sm"
              placeholder="unset — no limit enforced"
              value={draft.max_clients}
              onChange={(e) => setDraft((d) => ({ ...d, max_clients: e.target.value }))}
            />
            <span className="mt-1 block text-[11px] normal-case tracking-normal text-slate-600">
              0 closes onboarding. Unset means sales has not agreed a number yet.
            </span>
          </label>
          <label className="block text-[12px] uppercase tracking-wide text-slate-500">
            Sales reference
            <input
              className="input mt-1 w-full py-2 text-sm"
              placeholder="custom: enterprise 2026 (S-441)"
              value={draft.mssp_plan}
              onChange={(e) => setDraft((d) => ({ ...d, mssp_plan: e.target.value }))}
            />
          </label>
          <label className="block text-[12px] uppercase tracking-wide text-slate-500">
            Internal notes
            <textarea
              className="input mt-1 w-full py-2 text-sm"
              rows={3}
              value={draft.mssp_notes}
              onChange={(e) => setDraft((d) => ({ ...d, mssp_notes: e.target.value }))}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-primary" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
