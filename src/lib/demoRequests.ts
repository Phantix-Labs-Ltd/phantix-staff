// Demo-request lead queue — GET/PATCH /api/v1/admin/demo-requests.
//
// Leads are captured on the marketing site (landing `DemoRequestModal` →
// POST /api/v1/demo-requests, see landing/src/lib/demo-requests.ts). The
// backend persists the lead and emails the superadmin notify address; this
// queue is where staff triage what happened next.
//
// Contract mirrors app/engines/control_plane/api/admin/admin_demo_requests.py:
//   GET  /admin/demo-requests?status&q&limit&offset → { total, items[] }
//   PATCH /admin/demo-requests/{id}  { status, note? } → the refreshed row
// Both are gated by require_admin_staff, and `status` is constrained server-side
// to STATUSES below (anything else is a 422).
import { api } from "./api";

export const DEMO_REQUEST_STATUSES = ["new", "contacted", "converted", "closed"] as const;

export type DemoRequestStatus = (typeof DEMO_REQUEST_STATUSES)[number];

/** The backend caps `limit` at 200. */
export const DEMO_REQUEST_MAX_LIMIT = 200;

export interface DemoRequest {
  id: number;
  name: string;
  email: string;
  company: string;
  team_size: string;
  phone: string | null;
  message: string | null;
  /** Funnel position the modal was opened from, e.g. "demo-tour-complete". */
  source: string;
  path: string | null;
  referrer: string | null;
  utm: Record<string, string> | null;
  status: string;
  /** Staff-owned triage note (written through the PATCH `note` field). */
  staff_note: string | null;
  /** Set when the superadmin notification email actually went out. */
  notified_at: string | null;
  created_at: string | null;
}

export interface DemoRequestList {
  items: DemoRequest[];
  total: number;
}

export interface DemoRequestQuery {
  status?: string;
  /** Server-side search across company, email and name. */
  q?: string;
  limit?: number;
  offset?: number;
}

function str(v: unknown, fallback = ""): string {
  return v == null ? fallback : String(v);
}

function nullableStr(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s ? s : null;
}

function utmOf(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val != null && String(val)) out[k] = String(val);
  }
  return Object.keys(out).length ? out : null;
}

export function normalizeDemoRequest(raw: any): DemoRequest {
  const r = (raw ?? {}) as Record<string, any>;
  return {
    id: Number(r.id ?? 0),
    name: str(r.name),
    email: str(r.email),
    company: str(r.company),
    team_size: str(r.team_size, "Not set"),
    phone: nullableStr(r.phone),
    message: nullableStr(r.message),
    source: str(r.source, "unknown"),
    path: nullableStr(r.path),
    referrer: nullableStr(r.referrer),
    utm: utmOf(r.utm),
    status: str(r.status, "new").toLowerCase(),
    staff_note: nullableStr(r.staff_note),
    notified_at: nullableStr(r.notified_at),
    created_at: nullableStr(r.created_at),
  };
}

function queryString(query: DemoRequestQuery): string {
  const params = new URLSearchParams();
  // Only the four server-known statuses are valid filters; "all" means no filter.
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.q?.trim()) params.set("q", query.q.trim());
  params.set("limit", String(Math.min(query.limit ?? 50, DEMO_REQUEST_MAX_LIMIT)));
  if (query.offset) params.set("offset", String(query.offset));
  return params.toString();
}

/** GET /admin/demo-requests → `{ total, items }`. */
export async function listDemoRequests(query: DemoRequestQuery = {}): Promise<DemoRequestList> {
  const raw = await api.get<any>(`/admin/demo-requests?${queryString(query)}`);
  const rows: any[] = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
  const items = rows.map(normalizeDemoRequest);
  return { items, total: Number(raw?.total ?? items.length) };
}

/**
 * PATCH /admin/demo-requests/{id} — advance the lead lifecycle.
 *
 * `status` is required by the server on every call, so a note-only edit has to
 * resend the row's current status. `note` is only written when present, which
 * lets a pure status change leave an existing note untouched.
 */
export async function updateDemoRequest(
  id: number,
  body: { status: string; note?: string },
): Promise<DemoRequest> {
  return normalizeDemoRequest(await api.patch<any>(`/admin/demo-requests/${id}`, body));
}
