import React, { useState } from "react";
import { ScrollText, RefreshCw, Search, ShieldCheck, Loader2, Database, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader, Card, CardHeader, EmptyState, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";

interface ClientOption { id: number; name: string; slug: string; is_active: boolean; setup_complete: boolean; }

type SeedKind = "playbooks" | "runbooks" | "mitre" | "bulk";

interface SeedResult {
  kind: SeedKind;
  ok: boolean;
  message: string;
}

const KIND_LABEL: Record<SeedKind, { label: string; desc: string; path: string }> = {
  playbooks: { label: "Seed playbooks", desc: "50 global IR playbooks (upsert on id)", path: "/soc/provisioning/playbooks/seed" },
  runbooks: { label: "Seed runbooks", desc: "10 global runbook templates", path: "/soc/provisioning/runbooks/seed" },
  mitre: { label: "Seed MITRE techniques", desc: "95 MITRE ATT&CK techniques", path: "/soc/provisioning/mitre/seed" },
  bulk: { label: "Seed everything", desc: "Playbooks + runbooks + MITRE in one call", path: "/soc/provisioning/bulk/seed-all" },
};

export default function SocProvisioning() {
  const { toast } = useStore();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<number | null>(null);
  const [busy, setBusy] = useState<SeedKind | null>(null);
  const [results, setResults] = useState<SeedResult[]>([]);

  const loadClients = async () => {
    setClientsLoading(true);
    try {
      const raw = await api.get<any>("/admin/clients?limit=100");
      const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
      setClients(items.map((c: any) => ({
        id: Number(c.id ?? c.organization_id),
        name: String(c.name ?? c.slug ?? "?"),
        slug: String(c.slug ?? ""),
        is_active: c.is_active !== false,
        setup_complete: Boolean(c.setup_complete),
      })));
    } catch (e) {
      toast("error", "Could not load clients", e instanceof Error ? e.message : "");
    } finally {
      setClientsLoading(false);
      setClientsLoaded(true);
    }
  };

  const filtered = clients.filter((c) =>
    c.is_active && (c.name.toLowerCase().includes(q.toLowerCase()) || c.slug.toLowerCase().includes(q.toLowerCase()))
  );

  const runSeed = async (kind: SeedKind) => {
    if (!selectedOrg) return;
    setBusy(kind);
    try {
      const res = await api.post<any>(`${KIND_LABEL[kind].path}?organization_id=${selectedOrg}`, {});
      const summary =
        kind === "bulk"
          ? `playbooks ${res.playbooks?.seeded}/${res.playbooks?.total} · runbooks ${res.runbooks?.seeded}/${res.runbooks?.total} · mitre ${res.mitre?.seeded}/${res.mitre?.total}`
          : `seeded ${res.seeded}/${res.total} (org ${res.organization_id})`;
      setResults((p) => [{ kind, ok: true, message: summary }, ...p]);
      toast("success", KIND_LABEL[kind].label, summary);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Seed failed";
      setResults((p) => [{ kind, ok: false, message: msg }, ...p]);
      toast("error", "Seed failed", msg);
    } finally {
      setBusy(null);
    }
  };

  const selected = clients.find((c) => c.id === selectedOrg);

  return (
    <div>
      <PageHeader
        title="SOC Provisioning"
        description="Seed global IR playbooks, runbooks, and the MITRE ATT&CK catalog into the security database of an organization. Staff-only authoring actions."
        actions={
          <button onClick={() => void loadClients()} disabled={clientsLoading} className="btn-ghost text-sm px-3 py-1.5">
            <RefreshCw size={14} className={cx(clientsLoading && "animate-spin")} /> Load clients
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Org picker */}
        <Card className="lg:col-span-1 self-start">
          <CardHeader title="Target organization" subtitle="Seeds write into the security database of the chosen organization" />
          {!clientsLoaded && !clientsLoading ? (
            <div className="py-6 text-center">
              <button className="btn-primary" onClick={() => void loadClients()}>
                <Database size={14} /> Load clients
              </button>
            </div>
          ) : clientsLoading && !clients.length ? (
            <div className="space-y-1">
              <div className="skeleton mb-2 h-9 w-full rounded-md" />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border border-phantix-700/40 px-3 py-2" style={{ opacity: 1 - i * 0.11 }}>
                  <div className="skeleton h-3.5 w-3.5 shrink-0 rounded" />
                  <div className="skeleton h-3 w-36 max-w-full rounded" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2 rounded-md border border-phantix-700/50 bg-phantix-950/50 px-3 py-2">
                <Search size={13} className="text-slate-500" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search orgs…" className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500" />
              </div>
              <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
                {filtered.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">No active organizations match.</p>
                ) : filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedOrg(c.id)}
                    className={cx(
                      "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      selectedOrg === c.id
                        ? "border-gold-400/50 bg-gold-400/10 text-slate-100"
                        : "border-phantix-700/40 bg-phantix-900/40 text-slate-300 hover:border-phantix-600",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block text-[12px] font-mono text-slate-500">#{c.id} · {c.slug}</span>
                    </span>
                    {c.setup_complete ? <StatusBadge status="ready" /> : <span className="chip text-slate-500">setup…</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Seed actions */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader
              title="Seed catalog"
              subtitle={selected ? `Targeting ${selected.name} (#${selected.id}). Writes are idempotent, with an upsert on the id.` : "Pick an organization first"}
              action={selected && <span className="chip border-emerald-400/30 bg-emerald-400/10 text-emerald-300"><ShieldCheck size={11} className="mr-1 inline" /> {selected.slug}</span>}
            />
            {!selected ? (
              <EmptyState icon={<Database size={28} />} title="Select an organization" body="Choose an org on the left, then run a seed below." />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(Object.keys(KIND_LABEL) as SeedKind[]).map((kind) => (
                  <div key={kind} className="flex flex-col justify-between rounded-md border border-phantix-700/40 bg-phantix-950/50 p-4">
                    <div>
                      <p className="text-sm font-medium text-slate-100">{KIND_LABEL[kind].label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{KIND_LABEL[kind].desc}</p>
                    </div>
                    <button
                      className="btn-secondary mt-4 !py-1.5 !text-xs"
                      disabled={busy !== null}
                      onClick={() => void runSeed(kind)}
                    >
                      {busy === kind ? <Loader2 size={12} className="animate-spin" /> : <ScrollText size={12} />}
                      {busy === kind ? "Running…" : kind === "bulk" ? "Run bulk seed" : "Run"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Results */}
          <Card>
            <CardHeader title="Recent seed results" subtitle="Last run per kind shows at the top" />
            {results.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No seed actions run in this session.</p>
            ) : (
              <div className="space-y-2">
                {results.map((r, i) => (
                  <div
                    key={`${r.kind}-${i}`}
                    className={cx(
                      "flex items-start gap-3 rounded-md border px-4 py-3",
                      r.ok ? "border-emerald-400/25 bg-emerald-400/5" : "border-severity-critical/30 bg-severity-critical/5",
                    )}
                  >
                    {r.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-severity-critical" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-200">{KIND_LABEL[r.kind].label}</p>
                      <p className="mt-0.5 break-words font-mono text-xs text-slate-400">{r.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
