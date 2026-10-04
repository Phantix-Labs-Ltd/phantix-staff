import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, Plus, Megaphone, RefreshCw, ExternalLink } from "lucide-react";
import { PageHeader, Card, CardHeader, CollapsibleCard, Modal, StatusBadge, EmptyState, Spinner, PageHeaderSkeleton, CardListSkeleton } from "@/components/ui";
import { api, DEMO_MODE } from "@/lib/api";
import { useStore } from "@/lib/store";
import { timeAgo, cx } from "@/lib/utils";

type Program = {
  id: number;
  name: string;
  slug: string;
  description?: string;
  status?: string;
  maxMembers?: number;
  max_members?: number;
  /** New sign-ups still to join automatically (0 = applications only). */
  autoEnrollRemaining?: number;
};

type Member = {
  memberId: number;
  organizationId: number;
  status: string;
  contactEmail?: string;
  enrolledAt?: string;
  notes?: string;
  org?: { id?: number; name?: string; slug?: string; isActive?: boolean; setupCompleted?: boolean };
  health?: { errors24h?: number; lastLogAt?: string | null; openTickets?: number; failing?: boolean };
  lastRating?: { score?: number; nps?: number | null; area?: string; createdAt?: string } | null;
};

type Board = {
  program: Program;
  seats?: { used?: number; max?: number };
  failingOrgs?: number;
  averageScore?: number | null;
  ratingCount?: number;
  members: Member[];
};

type Update = {
  id: number;
  title: string;
  body_md?: string;
  bodyMd?: string;
  severity: string;
  version_label?: string;
  versionLabel?: string;
  published_at?: string;
  publishedAt?: string;
};

type Rating = {
  id?: number;
  score: number;
  nps?: number | null;
  area?: string;
  comment?: string;
  what_broke?: string;
  whatBroke?: string;
  created_at?: string;
  createdAt?: string;
  organization_id?: number;
  organizationId?: number;
};

function asList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const k of ["items", "programs", "updates", "ratings", "members", "value", "data"]) {
      if (Array.isArray(o[k])) return o[k] as T[];
    }
  }
  return [];
}

function normalizeProgram(p: any): Program {
  return {
    id: Number(p?.id ?? 0),
    name: String(p?.name ?? "Program"),
    slug: String(p?.slug ?? ""),
    description: p?.description != null ? String(p.description) : undefined,
    status: p?.status != null ? String(p.status) : undefined,
    maxMembers: Number(p?.maxMembers ?? p?.max_members ?? 20),
    max_members: Number(p?.max_members ?? p?.maxMembers ?? 20),
    autoEnrollRemaining: Number(p?.autoEnrollRemaining ?? p?.auto_enroll_remaining ?? 0),
  };
}

function normalizeMember(m: any): Member {
  const org = m?.org && typeof m.org === "object" ? m.org : null;
  const health = m?.health && typeof m.health === "object" ? m.health : {};
  const last = m?.lastRating ?? m?.last_rating ?? null;
  return {
    memberId: Number(m?.memberId ?? m?.member_id ?? m?.id ?? 0),
    organizationId: Number(m?.organizationId ?? m?.organization_id ?? org?.id ?? 0),
    status: String(m?.status ?? "active"),
    contactEmail: m?.contactEmail ?? m?.contact_email ?? undefined,
    enrolledAt: m?.enrolledAt ?? m?.enrolled_at ?? undefined,
    notes: m?.notes != null ? String(m.notes) : undefined,
    org: org
      ? {
          id: org.id != null ? Number(org.id) : undefined,
          name: org.name != null ? String(org.name) : undefined,
          slug: org.slug != null ? String(org.slug) : undefined,
          isActive: org.isActive ?? org.is_active,
          setupCompleted: org.setupCompleted ?? org.setup_completed,
        }
      : undefined,
    health: {
      errors24h: Number(health.errors24h ?? health.errors_24h ?? 0),
      lastLogAt: health.lastLogAt ?? health.last_log_at ?? null,
      openTickets: Number(health.openTickets ?? health.open_tickets ?? 0),
      failing: Boolean(health.failing),
    },
    lastRating: last
      ? {
          score: Number(last.score ?? 0),
          nps: last.nps != null ? Number(last.nps) : null,
          area: last.area != null ? String(last.area) : undefined,
          createdAt: last.createdAt ?? last.created_at,
        }
      : null,
  };
}

function normalizeBoard(raw: any, fallbackId: number): Board | null {
  if (!raw || typeof raw !== "object") return null;
  const programRaw = raw.program ?? raw;
  const program = normalizeProgram(programRaw);
  if (!program.id) program.id = fallbackId;
  const members = asList<any>(raw.members ?? raw.items).map(normalizeMember);
  const seats = raw.seats && typeof raw.seats === "object" ? raw.seats : undefined;
  return {
    program,
    seats: seats
      ? { used: Number(seats.used ?? members.length), max: Number(seats.max ?? program.maxMembers ?? 20) }
      : { used: members.length, max: program.maxMembers ?? 20 },
    failingOrgs: Number(raw.failingOrgs ?? raw.failing_orgs ?? members.filter((m) => m.health?.failing).length),
    averageScore: raw.averageScore != null ? Number(raw.averageScore) : raw.average_score != null ? Number(raw.average_score) : null,
    ratingCount: Number(raw.ratingCount ?? raw.rating_count ?? 0),
    members,
  };
}

export default function SandboxAdmin() {
  const { toast } = useStore();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState<number | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [clients, setClients] = useState<Array<{ id: number; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [formProg, setFormProg] = useState({
    name: "Public launch 20",
    slug: "public-launch-20",
    description: "Design partners on staging",
    max_members: 20,
  });
  const [autoEnroll, setAutoEnroll] = useState("20");
  const [formEnroll, setFormEnroll] = useState({ organization_id: "", contact_email: "", notes: "" });
  const [formUpdate, setFormUpdate] = useState({
    title: "",
    body_md: "",
    severity: "fix",
    version_label: "",
  });

  const refresh = useCallback(
    async (pid?: number | null, quiet = false) => {
      if (DEMO_MODE) {
        setLoading(false);
        setPrograms([]);
        setBoard(null);
        return;
      }
      if (!quiet) setLoading(true);
      try {
        const listRaw = await api.get<unknown>("/admin/sandbox/programs");
        const list = asList<any>(listRaw).map(normalizeProgram).filter((p) => p.id > 0);
        setPrograms(list);
        const id = pid ?? programId ?? list[0]?.id ?? null;
        setProgramId(id);
        if (!id) {
          setBoard(null);
          setUpdates([]);
          setRatings([]);
          return;
        }
        const [boardRaw, updatesRaw, ratingsRaw] = await Promise.all([
          api.get<unknown>(`/admin/sandbox/programs/${id}`),
          api.get<unknown>(`/admin/sandbox/programs/${id}/updates`).catch(() => []),
          api.get<unknown>(`/admin/sandbox/programs/${id}/ratings`).catch(() => []),
        ]);
        setBoard(normalizeBoard(boardRaw, id));
        setUpdates(asList<Update>(updatesRaw));
        setRatings(asList<Rating>(ratingsRaw));
      } catch (e) {
        toast("error", "Sandbox load failed", e instanceof Error ? e.message : "");
      } finally {
        setLoading(false);
      }
    },
    [programId, toast],
  );

  useEffect(() => {
    void refresh(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll board every 45s while page is open (LAUNCH_SANDBOX_FE)
  useEffect(() => {
    if (DEMO_MODE || !programId) return;
    const t = window.setInterval(() => void refresh(programId, true), 45_000);
    return () => window.clearInterval(t);
  }, [programId, refresh]);

  useEffect(() => {
    if (!enrollOpen || DEMO_MODE) return;
    void (async () => {
      try {
        const raw = await api.get<unknown>("/admin/clients", { params: { limit: 100 } });
        const items = asList<any>(raw).map((c) => ({
          id: Number(c.id ?? 0),
          name: String(c.name ?? c.legal_name ?? `Org #${c.id}`),
        }));
        setClients(items.filter((c) => c.id > 0));
      } catch {
        setClients([]);
      }
    })();
  }, [enrollOpen]);

  const createProgram = async () => {
    if (DEMO_MODE) return;
    setBusy(true);
    try {
      const p = normalizeProgram(
        await api.post("/admin/sandbox/programs", {
          name: formProg.name.trim(),
          slug: formProg.slug.trim(),
          description: formProg.description.trim() || undefined,
          max_members: formProg.max_members,
        }),
      );
      toast("success", "Program created", p.name);
      setCreateOpen(false);
      await refresh(p.id);
    } catch (e) {
      toast("error", "Create failed", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  const enroll = async () => {
    if (DEMO_MODE || !programId || !formEnroll.organization_id) return;
    setBusy(true);
    try {
      await api.post(`/admin/sandbox/programs/${programId}/members`, {
        organization_id: Number(formEnroll.organization_id),
        contact_email: formEnroll.contact_email.trim() || undefined,
        notes: formEnroll.notes.trim() || undefined,
      });
      toast("success", "Organization enrolled");
      setEnrollOpen(false);
      setFormEnroll({ organization_id: "", contact_email: "", notes: "" });
      await refresh(programId);
    } catch (e) {
      toast("error", "Enroll failed", e instanceof Error ? e.message : "Seats may be full (max 20)");
    } finally {
      setBusy(false);
    }
  };

  const postUpdate = async () => {
    if (DEMO_MODE || !programId || !formUpdate.title.trim()) return;
    setBusy(true);
    try {
      await api.post(`/admin/sandbox/programs/${programId}/updates`, {
        title: formUpdate.title.trim(),
        body_md: formUpdate.body_md,
        severity: formUpdate.severity,
        version_label: formUpdate.version_label.trim() || undefined,
      });
      toast("success", "Update published", "Testers see it on Platform + Command Centre /sandbox");
      setUpdateOpen(false);
      setFormUpdate({ title: "", body_md: "", severity: "fix", version_label: "" });
      await refresh(programId, true);
    } catch (e) {
      toast("error", "Publish failed", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  const saveAutoEnroll = async (count: number) => {
    if (DEMO_MODE || !programId) return;
    setBusy(true);
    try {
      const p = normalizeProgram(
        await api.patch(`/admin/sandbox/programs/${programId}`, { auto_enroll_remaining: count }),
      );
      toast(
        "success",
        count > 0 ? `The next ${count} sign-ups join automatically` : "Automatic joining is off",
        count > 0 ? `Seats: ${p.maxMembers}` : "New orgs can still apply",
      );
      await refresh(programId, true);
    } catch (e) {
      toast("error", "Could not save", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  const patchMember = async (memberId: number, status: string) => {
    if (DEMO_MODE || !memberId) return;
    try {
      await api.patch(`/admin/sandbox/members/${memberId}`, { status });
      toast("success", "Member updated", status);
      await refresh(programId, true);
    } catch (e) {
      toast("error", "Update failed", e instanceof Error ? e.message : "");
    }
  };

  if (DEMO_MODE) {
    return (
      <div>
        <PageHeader title="Sandbox management" description="Launch cohort · health board · live updates" />
        <EmptyState
          icon={<FlaskConical size={28} />}
          title="Live API required"
          body="Sign in with a staff JWT against the live API. Sandbox management does not run offline."
        />
      </div>
    );
  }

  if (loading && !board && programs.length === 0) {
    return (
      <div>
        <PageHeaderSkeleton actions />
        <div className="mb-4 flex flex-wrap gap-2">
          {[0, 1].map((i) => <div key={i} className="skeleton h-6 w-28 rounded-full" />)}
        </div>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card !p-4">
              <div className="skeleton h-2.5 w-20 rounded" />
              <div className="skeleton mt-2 h-6 w-16 rounded" />
            </div>
          ))}
        </div>
        <CardListSkeleton rows={4} />
      </div>
    );
  }

  const seats = board?.seats;
  const members = board?.members ?? [];
  const maxSeats = seats?.max ?? board?.program.maxMembers ?? 20;

  return (
    <div>
      <PageHeader
        title="Sandbox management"
        description="Cohort board · deploy notes · ratings"
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost !text-xs" onClick={() => void refresh(programId)}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button type="button" className="btn-secondary !text-xs" onClick={() => setCreateOpen(true)}>
              <Plus size={13} /> Program
            </button>
            <button type="button" className="btn-secondary !text-xs" disabled={!programId} onClick={() => setEnrollOpen(true)}>
              Enroll org
            </button>
            <button type="button" className="btn-primary !text-xs" disabled={!programId} onClick={() => setUpdateOpen(true)}>
              <Megaphone size={13} /> Push update
            </button>
          </div>
        }
      />

      {programs.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {programs.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => void refresh(p.id)}
              className={cx(
                "chip",
                programId === p.id ? "border-gold-400/50 bg-gold-400/15 text-gold-300" : "border-phantix-600/50 text-slate-400",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {!board ? (
        <EmptyState
          icon={<FlaskConical size={28} />}
          title="No sandbox program"
          body="Create a cohort (max_members ≤ 20) to open the design-partner board."
          action={
            <button type="button" className="btn-primary !text-xs" onClick={() => setCreateOpen(true)}>
              Create program
            </button>
          }
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="!p-4">
              <p className="text-[13px] uppercase tracking-wider text-slate-500">Seats</p>
              <p className="mt-1 font-display text-xl font-bold text-white">
                {seats?.used ?? members.length}/{maxSeats}
              </p>
            </Card>
            <Card className="!p-4">
              <p className="text-[13px] uppercase tracking-wider text-slate-500">Failing orgs</p>
              <p className="mt-1 font-display text-xl font-bold text-severity-critical">{board.failingOrgs ?? 0}</p>
            </Card>
            <Card className="!p-4">
              <p className="text-[13px] uppercase tracking-wider text-slate-500">Avg score</p>
              <p className="mt-1 font-display text-xl font-bold text-gold-300">
                {board.averageScore != null && !Number.isNaN(board.averageScore) ? board.averageScore.toFixed(1) : "Not set"}
              </p>
            </Card>
            <Card className="!p-4">
              <p className="text-[13px] uppercase tracking-wider text-slate-500">Ratings</p>
              <p className="mt-1 font-display text-xl font-bold text-white">{board.ratingCount ?? ratings.length}</p>
            </Card>
          </div>

          <Card className="mb-5 !p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100">New sign-ups join automatically</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {(board.program.autoEnrollRemaining ?? 0) > 0
                    ? `On: the next ${board.program.autoEnrollRemaining} organizations to register join this cohort as active testers.`
                    : board.program.status === "active"
                      ? "Off: organizations join only by applying or when you enroll them."
                      : "Off: the cohort is not active."}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-slate-400">
                  Next sign-ups
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="input mt-1 !w-24"
                    value={autoEnroll}
                    onChange={(e) => setAutoEnroll(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn-primary !text-xs"
                  disabled={busy || board.program.status !== "active" || !(Number(autoEnroll) >= 1 && Number(autoEnroll) <= 100)}
                  onClick={() => void saveAutoEnroll(Math.floor(Number(autoEnroll)))}
                >
                  {busy ? <Spinner className="h-4 w-4" /> : (board.program.autoEnrollRemaining ?? 0) > 0 ? "Update" : "Turn on"}
                </button>
                {(board.program.autoEnrollRemaining ?? 0) > 0 && (
                  <button type="button" className="btn-ghost !text-xs" disabled={busy} onClick={() => void saveAutoEnroll(0)}>
                    Turn off
                  </button>
                )}
              </div>
            </div>
          </Card>

          <Card className="mb-5 !p-0 overflow-hidden">
            <div className="border-b border-phantix-700/40 px-5 py-3">
              <p className="text-sm font-semibold text-slate-100">Members</p>
              <p className="text-xs text-slate-500">Red = errors24h ≥ 5 or open tickets ≥ 3 · auto-refresh 45s</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-phantix-800/50 text-[13px] text-slate-300">
                    <th className="th">Org</th>
                    <th className="th">Status</th>
                    <th className="th">Health</th>
                    <th className="th">Last rating</th>
                    <th className="th">Contact</th>
                    <th className="th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                        No members enrolled yet.
                      </td>
                    </tr>
                  ) : (
                    members.map((m) => {
                      const failing = m.health?.failing;
                      return (
                        <tr
                          key={m.memberId}
                          className={cx(
                            "border-b border-phantix-900/60",
                            failing ? "bg-severity-critical/8" : "hover:bg-phantix-900/40",
                          )}
                        >
                          <td className="td">
                            <Link
                              to={`/clients/${m.organizationId}`}
                              className="font-medium text-slate-100 hover:text-gold-300"
                            >
                              {m.org?.name ?? `Org #${m.organizationId}`}
                            </Link>
                            <p className="font-mono text-[13px] text-slate-500">{m.org?.slug}</p>
                          </td>
                          <td className="td">
                            <StatusBadge status={m.status} />
                          </td>
                          <td className="td text-xs text-slate-400">
                            err {m.health?.errors24h ?? 0} · tix {m.health?.openTickets ?? 0}
                            {failing && <span className="ml-1 text-severity-critical">failing</span>}
                            {m.organizationId > 0 && (
                              <Link
                                to={`/logs?organization_id=${m.organizationId}&level=error`}
                                className="ml-2 inline-flex items-center gap-0.5 text-gold-400 hover:text-gold-300"
                              >
                                logs <ExternalLink size={10} />
                              </Link>
                            )}
                          </td>
                          <td className="td text-xs text-slate-400">
                            {m.lastRating ? (
                              <>
                                {m.lastRating.score}/5 · {m.lastRating.area ?? "Not set"}
                              </>
                            ) : (
                              "Not set"
                            )}
                          </td>
                          <td className="td text-xs text-slate-400">{m.contactEmail ?? "Not set"}</td>
                          <td className="td">
                            <select
                              className="input !w-auto !py-1 text-xs"
                              value={m.status}
                              onChange={(e) => void patchMember(m.memberId, e.target.value)}
                            >
                              {["invited", "active", "paused", "graduated", "churned"].map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <CollapsibleCard defaultOpen={false} title="Published updates" subtitle="Shown to enrolled orgs on Platform + Command Centre /sandbox">
              <div className="space-y-2">
                {updates.map((u) => (
                  <div key={u.id} className="rounded-md border border-phantix-700/40 bg-phantix-950/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip capitalize text-[12px]">{u.severity}</span>
                      <span className="text-sm font-medium text-slate-200">{u.title}</span>
                    </div>
                    <p className="mt-1 text-[13px] text-slate-500">
                      {u.version_label ?? u.versionLabel ?? "Not set"} ·{" "}
                      {timeAgo(String(u.published_at ?? u.publishedAt ?? ""))}
                    </p>
                  </div>
                ))}
                {updates.length === 0 && <p className="text-sm text-slate-500">No updates yet.</p>}
              </div>
            </CollapsibleCard>
            <CollapsibleCard defaultOpen={false} title="Recent ratings" subtitle="From enrolled orgs">
              <div className="space-y-2">
                {ratings.map((r, i) => (
                  <div key={r.id ?? i} className="rounded-md border border-phantix-700/40 bg-phantix-950/40 p-3 text-xs">
                    <p className="font-mono text-gold-300">
                      {r.score}/5{r.nps != null ? ` · NPS ${r.nps}` : ""} · {r.area ?? "overall"}
                    </p>
                    {r.comment && <p className="mt-1 text-slate-300">{r.comment}</p>}
                    {(r.what_broke || r.whatBroke) && (
                      <p className="mt-1 text-severity-high">{r.what_broke ?? r.whatBroke}</p>
                    )}
                  </div>
                ))}
                {ratings.length === 0 && <p className="text-sm text-slate-500">No ratings yet.</p>}
              </div>
            </CollapsibleCard>
          </div>
        </>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create sandbox program">
        <div className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={formProg.name} onChange={(e) => setFormProg((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Slug</label>
            <input className="input font-mono" value={formProg.slug} onChange={(e) => setFormProg((f) => ({ ...f, slug: e.target.value }))} />
          </div>
          <div>
            <label className="label">Max members</label>
            <input
              type="number"
              min={1}
              max={20}
              className="input"
              value={formProg.max_members}
              onChange={(e) => setFormProg((f) => ({ ...f, max_members: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input min-h-[64px]" value={formProg.description} onChange={(e) => setFormProg((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => void createProgram()}>
            {busy ? <Spinner className="h-4 w-4" /> : "Create"}
          </button>
        </div>
      </Modal>

      <Modal open={enrollOpen} onClose={() => setEnrollOpen(false)} title="Enroll organization">
        <div className="space-y-3">
          <div>
            <label className="label">Organization</label>
            <select
              className="input"
              value={formEnroll.organization_id}
              onChange={(e) => setFormEnroll((f) => ({ ...f, organization_id: e.target.value }))}
            >
              <option value="">Select…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.id}: {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Contact email</label>
            <input className="input" value={formEnroll.contact_email} onChange={(e) => setFormEnroll((f) => ({ ...f, contact_email: e.target.value }))} />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={formEnroll.notes} onChange={(e) => setFormEnroll((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <button type="button" className="btn-primary w-full" disabled={busy || !formEnroll.organization_id} onClick={() => void enroll()}>
            {busy ? <Spinner className="h-4 w-4" /> : "Enroll"}
          </button>
        </div>
      </Modal>

      <Modal open={updateOpen} onClose={() => setUpdateOpen(false)} title="Push live update">
        <div className="space-y-3">
          <div>
            <label className="label">Title</label>
            <input className="input" value={formUpdate.title} onChange={(e) => setFormUpdate((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="label">Body (markdown)</label>
            <textarea className="input min-h-[100px]" value={formUpdate.body_md} onChange={(e) => setFormUpdate((f) => ({ ...f, body_md: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Severity</label>
              <select className="input" value={formUpdate.severity} onChange={(e) => setFormUpdate((f) => ({ ...f, severity: e.target.value }))}>
                <option value="info">info</option>
                <option value="fix">fix</option>
                <option value="breaking">breaking</option>
              </select>
            </div>
            <div>
              <label className="label">Version label</label>
              <input
                className="input font-mono"
                value={formUpdate.version_label}
                onChange={(e) => setFormUpdate((f) => ({ ...f, version_label: e.target.value }))}
                placeholder="2026-08-19"
              />
            </div>
          </div>
          <button type="button" className="btn-primary w-full" disabled={busy || !formUpdate.title.trim()} onClick={() => void postUpdate()}>
            {busy ? <Spinner className="h-4 w-4" /> : "Publish to testers"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
