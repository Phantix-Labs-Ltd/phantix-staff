import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Filter, RefreshCw, RotateCcw, Search, ShieldCheck, X } from "lucide-react";
import { Card, EmptyState, ErrorState, Modal, PageHeader, TableSkeleton } from "@/components/ui";
import {
  REQUEST_STATUSES, REQUEST_TYPES, STATUS_LABEL, TYPE_LABEL,
  approveRequest, completeRequest, denyRequest, listPrivacyRequests, restoreRequest,
  type PrivacyRequest,
} from "@/lib/privacyRequests";
import { useStore } from "@/lib/store";
import { cx, formatDateTime, timeAgo } from "@/lib/utils";

// ── Data requests ────────────────────────────────────────────────────────────
// Account deletion and other data subject requests from every organization.
// Staff approve or deny each one; the requester is emailed every decision.
// Approving a deletion closes the account now and deletes it after the grace
// period, during which it can still be cancelled here.

const STATUS_TONE: Record<string, string> = {
  received: "text-gold-300 bg-gold-400/10 border-gold-400/30",
  approved: "text-sky-300 bg-sky-400/10 border-sky-400/30",
  completed: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  rejected: "text-slate-400 bg-slate-400/10 border-slate-500/30",
  cancelled: "text-slate-400 bg-slate-400/10 border-slate-500/30",
};

function day(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cx("chip", STATUS_TONE[status] ?? STATUS_TONE.received)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function TypePill({ type }: { type: string }) {
  return (
    <span
      className={cx(
        "chip",
        type === "erasure"
          ? "border-severity-critical/30 bg-severity-critical/10 text-severity-critical"
          : "border-phantix-600/50 bg-phantix-800/60 text-slate-300",
      )}
    >
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}

export default function PrivacyRequests() {
  const { toast } = useStore();
  const [params] = useSearchParams();
  const [rows, setRows] = useState<PrivacyRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [graceDays, setGraceDays] = useState(30);
  const [status, setStatus] = useState("open");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState(params.get("ref") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // A notification opens this page at ?ref=DSR-…, also while it is already open.
  const ref = params.get("ref");
  useEffect(() => {
    if (ref) {
      setSearch(ref);
      setStatus("all");
    }
  }, [ref]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listPrivacyRequests({ status, request_type: type, search });
      setRows(res.items);
      setTotal(res.total);
      setCounts(res.counts);
      setGraceDays(res.grace_days);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data requests.");
    } finally {
      setLoading(false);
    }
  }, [status, type, search]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      void load();
      return;
    }
    const t = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(t);
  }, [load]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);
  const activeFilters = status !== "open" || type !== "all" || !!search.trim();

  return (
    <div>
      <PageHeader
        title="Data requests"
        description="Account deletion and other data requests from organizations. Approve or deny each one; the requester is emailed the decision."
        actions={
          <button onClick={() => void load()} className="btn-ghost px-3 py-1.5 text-sm" title="Refresh">
            <RefreshCw size={14} className={cx(loading && "animate-spin")} />
          </button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Awaiting decision" value={counts.received ?? 0} tone="text-gold-300" />
        <Tile label="Approved, in progress" value={counts.approved ?? 0} tone="text-sky-300" />
        <Tile label="Completed" value={counts.completed ?? 0} tone="text-emerald-400" />
        <Tile label="Denied or cancelled" value={(counts.rejected ?? 0) + (counts.cancelled ?? 0)} />
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-phantix-700/40 p-3">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Reference, organization, email"
              className="input w-64 !py-1.5 !pl-8 !text-xs"
              aria-label="Search data requests"
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-auto !py-1.5 !text-xs" aria-label="Filter by status">
            <option value="open">Open (awaiting decision or approved)</option>
            <option value="all">Any status</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]} ({counts[s] ?? 0})
              </option>
            ))}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className="input !w-auto !py-1.5 !text-xs" aria-label="Filter by request">
            <option value="all">Any request</option>
            {REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
          {activeFilters && (
            <button
              className="chip border-phantix-700/50 text-slate-400 hover:text-slate-200"
              onClick={() => {
                setStatus("open");
                setType("all");
                setSearch("");
              }}
            >
              <Filter size={12} className="mr-1 inline" /> Clear
            </button>
          )}
          <p className="ml-auto text-[13px] text-slate-400">
            <span className="font-mono text-slate-200">{total.toLocaleString()}</span> requests
          </p>
        </div>

        {loading && rows.length === 0 ? (
          <div className="p-4"><TableSkeleton rows={5} cols={6} /></div>
        ) : error ? (
          <div className="p-4"><ErrorState body={error} onRetry={() => void load()} /></div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<ShieldCheck size={22} />}
              title={activeFilters ? "No requests match these filters" : "No open data requests"}
              body={
                activeFilters
                  ? "Try wider filters."
                  : "When an organization asks to delete its account or for its data, the request lands here and in the bell."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-phantix-700/40 text-left text-[13px] text-slate-300">
                  <th className="th">Received</th>
                  <th className="th">Reference</th>
                  <th className="th">Organization</th>
                  <th className="th">Request</th>
                  <th className="th">Contact</th>
                  <th className="th">Status</th>
                  <th className="th w-16 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="h-11 cursor-pointer border-b border-phantix-800/40 transition-colors hover:bg-phantix-800/35"
                  >
                    <td className="td whitespace-nowrap text-[13px] text-slate-400" title={formatDateTime(r.created_at)}>
                      {timeAgo(r.created_at)}
                    </td>
                    <td className="td whitespace-nowrap font-mono text-[13px] text-slate-300">{r.reference}</td>
                    <td className="td text-[13px] text-slate-200">
                      {r.organization_name || "Unknown"}
                      {r.organization_id === null && <span className="ml-1.5 text-slate-500">(deleted)</span>}
                    </td>
                    <td className="td"><TypePill type={r.request_type} /></td>
                    <td className="td whitespace-nowrap text-[13px] text-slate-400">{r.contact_email}</td>
                    <td className="td whitespace-nowrap">
                      <StatusPill status={r.status} />
                      {r.status === "approved" && r.scheduled_deletion_at && (
                        <span className="ml-2 text-[12px] text-severity-high">Deletes {day(r.scheduled_deletion_at)}</span>
                      )}
                    </td>
                    <td className="td text-right">
                      <button
                        className="rounded px-2 py-0 text-[13px] font-medium text-slate-300 hover:bg-phantix-800 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(r.id);
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <RequestDetail
        item={selected}
        graceDays={graceDays}
        onClose={() => setSelectedId(null)}
        onDecided={(next, message) => {
          setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)));
          toast("success", message, `${next.reference} · ${next.organization_name ?? ""}`);
          void load();
        }}
      />
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-phantix-700/40 bg-phantix-900/40 px-3 py-2.5">
      <p className="text-[12px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx("mt-1 font-mono text-xl", tone ?? "text-slate-100")}>{value}</p>
    </div>
  );
}

function RequestDetail({
  item,
  graceDays,
  onClose,
  onDecided,
}: {
  item: PrivacyRequest | null;
  graceDays: number;
  onClose: () => void;
  onDecided: (next: PrivacyRequest, message: string) => void;
}) {
  const { toast, isAdmin } = useStore();
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [denying, setDenying] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNote("");
    setReason("");
    setDenying(false);
    setConfirmed(false);
  }, [item?.id]);

  if (!item) return null;

  const erasure = item.request_type === "erasure";
  const deleteOn = new Date(Date.now() + graceDays * 86_400_000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const run = async (action: () => Promise<PrivacyRequest>, message: string) => {
    setBusy(true);
    try {
      onDecided(await action(), message);
    } catch (e) {
      toast("error", "Could not save the decision", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!item} onClose={onClose} title={`Data request ${item.reference}`} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <TypePill type={item.request_type} />
          <StatusPill status={item.status} />
          {item.organization_active === false && (
            <span className="chip border-severity-high/30 bg-severity-high/10 text-severity-high">Account closed</span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
          <Meta label="Organization">
            {item.organization_name || "Unknown"}
            {item.organization_id === null ? " (deleted)" : ` · #${item.organization_id}`}
          </Meta>
          <Meta label="Reply to">{item.contact_email}</Meta>
          <Meta label="Received">{formatDateTime(item.created_at)}</Meta>
          {item.decided_at && (
            <Meta label="Decided">
              {formatDateTime(item.decided_at)}
              {item.decided_by ? ` by ${item.decided_by}` : ""}
            </Meta>
          )}
          {item.scheduled_deletion_at && <Meta label="Deletes on">{day(item.scheduled_deletion_at)}</Meta>}
          {item.resolved_at && <Meta label="Closed">{formatDateTime(item.resolved_at)}</Meta>}
        </div>

        <div>
          <p className="mb-1 text-[12px] uppercase tracking-wide text-slate-500">What they asked</p>
          <p className="whitespace-pre-wrap rounded-lg border border-phantix-700/40 bg-phantix-950/40 p-3 text-[13px] leading-6 text-slate-200">
            {item.details || "No details given."}
          </p>
        </div>

        {item.staff_notes && (
          <div>
            <p className="mb-1 text-[12px] uppercase tracking-wide text-slate-500">
              {item.status === "rejected" ? "Reason given to the requester" : "Note"}
            </p>
            <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-300">{item.staff_notes}</p>
          </div>
        )}

        {!isAdmin ? (
          <p className="text-[13px] text-slate-400">An admin decides data requests.</p>
        ) : item.status === "received" ? (
          <div className="rounded-xl border border-phantix-700/40 bg-phantix-900/40 p-4">
            <p className="mb-3 text-[13px] font-semibold text-slate-200">Decision</p>
            {!denying ? (
              <>
                {erasure && (
                  <div className="mb-3 rounded-lg border border-severity-high/30 bg-severity-high/10 p-3 text-[13px] leading-6 text-slate-200">
                    Approving closes <strong>{item.organization_name}</strong> now: nobody can sign in and its API keys stop
                    working. The account and all its data are permanently deleted on <strong>{deleteOn}</strong>. Until then
                    you can cancel the deletion here.
                    <label className="mt-2 flex items-start gap-2 text-slate-300">
                      <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
                      I have checked this request came from the organization.
                    </label>
                  </div>
                )}
                <label className="block text-[12px] text-slate-400">
                  Note to the requester (optional)
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input mt-1 !py-1.5 !text-xs" />
                </label>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button className="btn-secondary !py-1.5 !text-sm" onClick={() => setDenying(true)} disabled={busy}>
                    <X size={13} /> Deny
                  </button>
                  <button
                    className="btn-primary !py-1.5 !text-sm"
                    disabled={busy || (erasure && !confirmed)}
                    onClick={() =>
                      void run(
                        () => approveRequest(item.id, note),
                        erasure ? `Account closed; deletes on ${deleteOn}` : "Request approved",
                      )
                    }
                  >
                    <Check size={13} /> {erasure ? "Approve deletion" : "Approve"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="block text-[12px] text-slate-400">
                  Reason (the requester sees this)
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    autoFocus
                    className="input mt-1 !py-1.5 !text-xs"
                  />
                </label>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button className="btn-ghost !py-1.5 !text-sm" onClick={() => setDenying(false)} disabled={busy}>
                    Back
                  </button>
                  <button
                    className="btn-danger !py-1.5 !text-sm"
                    disabled={busy || !reason.trim()}
                    onClick={() => void run(() => denyRequest(item.id, reason), "Request denied")}
                  >
                    <X size={13} /> Deny request
                  </button>
                </div>
              </>
            )}
          </div>
        ) : item.status === "approved" ? (
          <div className="rounded-xl border border-phantix-700/40 bg-phantix-900/40 p-4">
            {erasure ? (
              <>
                <p className="text-[13px] leading-6 text-slate-300">
                  The account is closed and will be deleted on <strong>{day(item.scheduled_deletion_at)}</strong>. Cancelling
                  reopens it with nothing removed and emails the requester.
                </p>
                <label className="mt-3 block text-[12px] text-slate-400">
                  Why it is cancelled (optional)
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input mt-1 !py-1.5 !text-xs" />
                </label>
                <div className="mt-3 flex justify-end">
                  <button
                    className="btn-secondary !py-1.5 !text-sm"
                    disabled={busy}
                    onClick={() => void run(() => restoreRequest(item.id, note), "Deletion cancelled; account reopened")}
                  >
                    <RotateCcw size={13} /> Cancel deletion
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[13px] leading-6 text-slate-300">
                  When the work is done, mark it completed. The requester is emailed your note.
                </p>
                <label className="mt-3 block text-[12px] text-slate-400">
                  What was done (sent to the requester)
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input mt-1 !py-1.5 !text-xs" />
                </label>
                <div className="mt-3 flex justify-end">
                  <button
                    className="btn-primary !py-1.5 !text-sm"
                    disabled={busy}
                    onClick={() => void run(() => completeRequest(item.id, note), "Request completed")}
                  >
                    <Check size={13} /> Mark completed
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-slate-500">{label}:</span>
      <span className="truncate text-slate-300">{children}</span>
    </div>
  );
}
