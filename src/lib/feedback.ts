// Service feedback — GET/PATCH /api/v1/admin/feedback, POST /api/v1/feedback.
//
// Every backend service exposes `POST {prefix}/feedback` so an operator can
// report a failure, missing feature or bug from the surface where it happened.
// The staff portal reads them all through the admin endpoints:
//   GET   /admin/feedback?service&status&category&severity&search&limit&offset
//   GET   /admin/feedback/summary
//   PATCH /admin/feedback/{id}   { status, severity, assigned_to, admin_notes, resolution_note }
// Both admin endpoints require support/admin staff; PATCH requires admin staff.
import { api } from "./api";

export const FEEDBACK_CATEGORIES = ["bug", "missing_feature", "error", "other"] as const;
export const FEEDBACK_STATUSES = [
  "new",
  "triaged",
  "planned",
  "in_progress",
  "resolved",
  "wont_fix",
  "duplicate",
] as const;
export const FEEDBACK_SEVERITIES = ["low", "medium", "high", "critical"] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number] | string;

export interface FeedbackItem {
  id: number;
  /** Engine / deployable service the report is about (e.g. "scanner_engine"). */
  service: string;
  category: string;
  severity: string;
  status: string;
  message: string;
  context: Record<string, unknown>;
  organization_id: number | null;
  organization_name: string | null;
  submitted_by: string | null;
  submitter_role: string | null;
  assigned_to: string | null;
  admin_notes: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface FeedbackSummary {
  total: number;
  open: number;
  by_status: Record<string, number>;
  by_category: Record<string, number>;
  by_service: Record<string, number>;
}

export interface FeedbackList {
  items: FeedbackItem[];
  total: number;
  limit: number;
  offset: number;
  summary: FeedbackSummary;
}

export interface FeedbackQuery {
  service?: string;
  /** "open" is a server-side alias for the still-actionable statuses. */
  status?: string;
  category?: string;
  severity?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

const EMPTY_SUMMARY: FeedbackSummary = {
  total: 0,
  open: 0,
  by_status: {},
  by_category: {},
  by_service: {},
};

function str(v: unknown, fallback = ""): string {
  return v == null ? fallback : String(v);
}

function nullableStr(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s ? s : null;
}

function recordOf(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function numberMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(recordOf(v))) out[k] = Number(val ?? 0);
  return out;
}

export function normalizeFeedback(raw: unknown): FeedbackItem {
  const r = recordOf(raw);
  return {
    id: Number(r.id ?? 0),
    service: str(r.service, "unknown"),
    category: str(r.category, "bug").toLowerCase(),
    severity: str(r.severity, "medium").toLowerCase(),
    status: str(r.status, "new").toLowerCase(),
    message: str(r.message),
    context: recordOf(r.context),
    organization_id: r.organization_id == null ? null : Number(r.organization_id),
    organization_name: nullableStr(r.organization_name),
    submitted_by: nullableStr(r.submitted_by),
    submitter_role: nullableStr(r.submitter_role),
    assigned_to: nullableStr(r.assigned_to),
    admin_notes: nullableStr(r.admin_notes),
    resolution_note: nullableStr(r.resolution_note),
    resolved_at: nullableStr(r.resolved_at),
    created_at: nullableStr(r.created_at),
    updated_at: nullableStr(r.updated_at),
  };
}

function normalizeSummary(raw: unknown): FeedbackSummary {
  const r = recordOf(raw);
  if (!Object.keys(r).length) return EMPTY_SUMMARY;
  return {
    total: Number(r.total ?? 0),
    open: Number(r.open ?? 0),
    by_status: numberMap(r.by_status),
    by_category: numberMap(r.by_category),
    by_service: numberMap(r.by_service),
  };
}

function queryString(query: FeedbackQuery): string {
  const params = new URLSearchParams();
  if (query.service && query.service !== "all") params.set("service", query.service);
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.category && query.category !== "all") params.set("category", query.category);
  if (query.severity && query.severity !== "all") params.set("severity", query.severity);
  if (query.search?.trim()) params.set("search", query.search.trim());
  params.set("limit", String(Math.min(query.limit ?? 100, 500)));
  if (query.offset) params.set("offset", String(query.offset));
  return params.toString();
}

/** GET /admin/feedback → `{ items, total, summary }`. */
export async function listFeedback(query: FeedbackQuery = {}): Promise<FeedbackList> {
  const raw = await api.get<any>(`/admin/feedback?${queryString(query)}`);
  const rows: unknown[] = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
  const items = rows.map(normalizeFeedback);
  return {
    items,
    total: Number(raw?.total ?? items.length),
    limit: Number(raw?.limit ?? query.limit ?? 100),
    offset: Number(raw?.offset ?? query.offset ?? 0),
    summary: normalizeSummary(raw?.summary),
  };
}

/** GET /admin/feedback/summary — counts without pulling the rows.
 *  Used by the page header/dashboard; filters mirror {@link listFeedback}. */
export async function getFeedbackSummary(
  query: Pick<FeedbackQuery, "service" | "status" | "category" | "severity" | "search"> = {},
): Promise<FeedbackSummary> {
  const params = new URLSearchParams();
  if (query.service && query.service !== "all") params.set("service", query.service);
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.category && query.category !== "all") params.set("category", query.category);
  if (query.severity && query.severity !== "all") params.set("severity", query.severity);
  if (query.search?.trim()) params.set("search", query.search.trim());
  return normalizeSummary(await api.get<any>(`/admin/feedback/summary?${params.toString()}`));
}

export interface FeedbackUpdate {
  status?: string;
  severity?: string;
  assigned_to?: string;
  admin_notes?: string;
  resolution_note?: string;
}

/** PATCH /admin/feedback/{id} — triage status, owner and notes. */
export async function updateFeedback(id: number, body: FeedbackUpdate): Promise<FeedbackItem> {
  return normalizeFeedback(await api.patch<any>(`/admin/feedback/${id}`, body));
}

/** POST /feedback — submit a report. Used by the portal's own error surfaces. */
export async function submitFeedback(body: {
  service: string;
  category?: string;
  severity?: string;
  message: string;
  context?: Record<string, unknown>;
}): Promise<FeedbackItem> {
  return normalizeFeedback(await api.post<any>("/feedback", body));
}
