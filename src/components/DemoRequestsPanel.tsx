import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2, Inbox, Link2, Loader2, Mail, MailCheck, MailX, Phone, RefreshCw, Save, Search,
} from "lucide-react";
import { Card, CardHeader, EmptyState, ErrorState, Modal, TableSkeleton } from "@/components/ui";
import {
  DEMO_REQUEST_MAX_LIMIT,
  DEMO_REQUEST_STATUSES,
  listDemoRequests,
  updateDemoRequest,
  type DemoRequest,
} from "@/lib/demoRequests";
import { useStore } from "@/lib/store";
import { cx, formatDateTime, timeAgo, titleCase } from "@/lib/utils";

// ── Demo-request triage queue ────────────────────────────────────────────────
// The one lead-capture flow on the static marketing site lands here: landing
// /demo → DemoRequestModal → POST /api/v1/demo-requests. Staff work the queue
// through GET/PATCH /api/v1/admin/demo-requests.

const FILTERS = ["all", ...DEMO_REQUEST_STATUSES] as const;

// The shared StatusBadge has no tone for this lifecycle, and a grey "new" would
// defeat the point of the queue — an untouched lead has to stand out.
const STATUS_TONE: Record<string, string> = {
  new: "text-gold-300 bg-gold-400/10 border-gold-400/30",
  contacted: "text-sky-300 bg-sky-400/10 border-sky-400/30",
  converted: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  closed: "text-slate-400 bg-slate-400/10 border-slate-500/30",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cx("chip capitalize", STATUS_TONE[status] ?? STATUS_TONE.closed)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {titleCase(status)}
    </span>
  );
}

export function DemoRequestsPanel() {
  const { toast } = useStore();
  const [rows, setRows] = useState<DemoRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async (status: string, q: string) => {
    setLoading(true);
    setError(null);
    try {
      // Server-side filter and search — the backend does status + ILIKE over
      // company/email/name, so there is no reason to over-fetch and filter here.
      const res = await listDemoRequests({ status, q, limit: DEMO_REQUEST_MAX_LIMIT });
      setRows(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load demo requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce the search so typing does not fire a request per keystroke.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      void load(filter, search);
      return;
    }
    const t = window.setTimeout(() => void load(filter, search), 300);
    return () => window.clearTimeout(t);
  }, [filter, search, load]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
    return out;
  }, [rows]);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const applyRow = useCallback((next: DemoRequest) => {
    setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)));
  }, []);

  const setStatus = async (row: DemoRequest, status: string) => {
    applyRow({ ...row, status }); // optimistic — reverted below if the PATCH fails
    try {
      // `note` is omitted so a status change leaves any existing note intact.
      applyRow(await updateDemoRequest(row.id, { status }));
      toast("success", `${row.company || row.name} marked ${titleCase(status)}`);
    } catch (e) {
      applyRow(row);
      toast("error", "Could not update the lead", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Demo requests"
          subtitle={`${total} lead${total === 1 ? "" : "s"} captured from the marketing site · newest first`}
          action={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search company, email, name"
                  className="input w-56 !py-1.5 !pl-8 !text-xs"
                  aria-label="Search demo requests"
                />
              </div>
              <button onClick={() => void load(filter, search)} className="btn-ghost px-3 py-1.5 text-sm" title="Refresh">
                <RefreshCw size={14} className={cx(loading && "animate-spin")} />
              </button>
            </div>
          }
        />

        <div className="mb-4 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cx(
                "chip capitalize transition-colors",
                filter === f
                  ? "border-gold-400/40 bg-gold-400/10 text-gold-200"
                  : "border-phantix-700/50 text-slate-400 hover:text-slate-200",
              )}
            >
              {f === "all" ? "All" : titleCase(f)}
              {f !== "all" && counts[f] ? <span className="ml-1 font-mono text-[12px] opacity-70">{counts[f]}</span> : null}
            </button>
          ))}
        </div>

        {loading && !rows.length ? (
          <TableSkeleton rows={5} cols={6} />
        ) : error ? (
          <ErrorState
            title="Demo requests unavailable"
            body={`${error} The demo-request queue . Capture is unaffected. New leads are still being stored.`}
            onRetry={() => void load(filter, search)}
          />
        ) : !rows.length ? (
          <EmptyState
            icon={<Inbox size={26} />}
            title={search || filter !== "all" ? "No matching leads" : "No demo requests yet"}
            body={
              search || filter !== "all"
                ? "Nothing matches that filter."
                : "Requests submitted from the demo tour on the landing site appear here for triage."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-phantix-700/40">
                  <th className="th">Company</th>
                  <th className="th">Contact</th>
                  <th className="th">Team</th>
                  <th className="th">Source</th>
                  <th className="th">Received</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="cursor-pointer border-b border-phantix-800/40 hover:bg-phantix-800/35"
                  >
                    <td className="td">
                      <span className="flex items-center gap-2 font-medium text-slate-200">
                        <Building2 size={13} className="shrink-0 text-slate-500" />
                        {r.company || "Not set"}
                      </span>
                    </td>
                    <td className="td">
<span className="block max-w-[28rem] truncate" title={String(r.email ?? "")}>
                        <span className="text-slate-200">{r.name || "Not set"}</span>
                        <span className="ml-2 font-mono text-[13px] text-slate-500">{r.email}</span>
                      </span>
                    </td>
                    <td className="td text-xs text-slate-400">{r.team_size}</td>
                    <td className="td"><span className="chip text-[12px]">{r.source}</span></td>
                    <td className="td text-xs text-slate-400" title={formatDateTime(r.created_at)}>
                      {r.created_at ? timeAgo(r.created_at) : "Not set"}
                    </td>
                    <td className="td"><StatusPill status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <DemoRequestDetail
          request={selected}
          onClose={() => setSelectedId(null)}
          onSetStatus={setStatus}
          onSaved={applyRow}
        />
      )}
    </div>
  );
}

function DemoRequestDetail({
  request,
  onClose,
  onSetStatus,
  onSaved,
}: {
  request: DemoRequest;
  onClose: () => void;
  onSetStatus: (row: DemoRequest, status: string) => void | Promise<void>;
  onSaved: (row: DemoRequest) => void;
}) {
  const { toast } = useStore();
  const [note, setNote] = useState(request.staff_note ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNote(request.staff_note ?? "");
  }, [request.id, request.staff_note]);

  const saveNote = async () => {
    setSaving(true);
    try {
      // The server requires `status` on every PATCH, so a note-only edit
      // resends the status the row already has.
      onSaved(await updateDemoRequest(request.id, { status: request.status, note }));
      toast("success", "Note saved");
    } catch (e) {
      toast("error", "Could not save the note", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={request.company || request.name || "Demo request"} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {DEMO_REQUEST_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => void onSetStatus(request, s)}
              className={cx(
                "chip capitalize transition-colors",
                request.status === s
                  ? "border-gold-400/40 bg-gold-400/10 text-gold-200"
                  : "border-phantix-700/50 text-slate-400 hover:text-slate-200",
              )}
            >
              {titleCase(s)}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contact" value={request.name || "Not set"} />
          <Field
            label="Work email"
            value={
              <a href={`mailto:${request.email}`} className="inline-flex items-center gap-1.5 text-gold-300 hover:underline">
                <Mail size={12} /> {request.email}
              </a>
            }
          />
          <Field label="Team size" value={request.team_size} />
          <Field
            label="Phone"
            value={
              request.phone ? (
                <a href={`tel:${request.phone}`} className="inline-flex items-center gap-1.5 text-slate-200 hover:underline">
                  <Phone size={12} /> {request.phone}
                </a>
              ) : (
                "Not set"
              )
            }
          />
          <Field label="Received" value={formatDateTime(request.created_at)} />
          <Field
            label="Superadmin alert"
            value={
              request.notified_at ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-400">
                  <MailCheck size={12} /> Sent {timeAgo(request.notified_at)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-severity-medium" title="The lead was stored, but the notification email did not go out.">
                  <MailX size={12} /> Not sent
                </span>
              )
            }
          />
        </div>

        {request.message && (
          <div>
            <p className="label">What they want to see</p>
            <p className="mt-1 whitespace-pre-wrap rounded-lg border border-phantix-700/40 bg-phantix-950/50 p-3 text-sm leading-6 text-slate-300">
              {request.message}
            </p>
          </div>
        )}

        <div>
          <p className="label">Attribution</p>
          <div className="mt-1 space-y-1.5 rounded-lg border border-phantix-700/40 bg-phantix-950/50 p-3 font-mono text-[13px] text-slate-400">
            <p><span className="text-slate-500">source</span> {request.source}</p>
            <p><span className="text-slate-500">path</span> {request.path ?? "Not set"}</p>
            <p className="flex items-start gap-1.5">
              <Link2 size={11} className="mt-0.5 shrink-0 text-slate-500" />
              <span className="break-all">{request.referrer ?? "(direct or none)"}</span>
            </p>
            {request.utm &&
              Object.entries(request.utm).map(([k, v]) => (
                <p key={k}><span className="text-slate-500">{k}</span> {v}</p>
              ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="demo-request-note">Staff note</label>
          <textarea
            id="demo-request-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Who reached out, when the call is booked, what they need..."
            className="input mt-1 min-h-[96px] resize-y"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">Close</button>
            <button onClick={() => void saveNote()} disabled={saving} className="btn-primary px-4 py-1.5 text-sm">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save note
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-phantix-700/40 bg-phantix-950/50 p-3">
      <p className="text-[12px] uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 text-sm text-slate-200">{value}</div>
    </div>
  );
}
