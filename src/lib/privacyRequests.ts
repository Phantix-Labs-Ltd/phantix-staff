// Data subject requests — account deletion, copies, corrections (NDPA §34–37).
//
// Organizations file them from Core (Privacy) and the platform Danger Zone;
// staff decide them here. Reading needs support staff, deciding needs admin.
//   GET  /admin/privacy-requests?status&request_type&search&limit&offset
//   POST /admin/privacy-requests/{id}/approve   { note }
//   POST /admin/privacy-requests/{id}/deny      { reason }   (the requester sees it)
//   POST /admin/privacy-requests/{id}/complete  { note }     (not account deletions)
//   POST /admin/privacy-requests/{id}/restore   { note }     (cancel an approved deletion)
// Approving an account deletion closes the account at once and deletes it
// `grace_days` later; every decision is emailed to the requester.
import { api } from "./api";

export const REQUEST_STATUSES = ["received", "approved", "completed", "rejected", "cancelled"] as const;
export const REQUEST_TYPES = ["erasure", "access", "portability", "rectification", "restriction", "objection"] as const;

export const STATUS_LABEL: Record<string, string> = {
  received: "Awaiting decision",
  approved: "Approved",
  completed: "Completed",
  rejected: "Denied",
  cancelled: "Deletion cancelled",
};

export const TYPE_LABEL: Record<string, string> = {
  erasure: "Delete account and data",
  access: "Copy of data",
  portability: "Portable copy of data",
  rectification: "Correct data",
  restriction: "Restrict processing",
  objection: "Object to processing",
};

export interface PrivacyRequest {
  id: number;
  reference: string;
  request_type: string;
  type_label: string;
  details: string | null;
  contact_email: string;
  status: string;
  organization_id: number | null;
  organization_name: string | null;
  /** False while an approved deletion is pending; null once the org is deleted. */
  organization_active: boolean | null;
  staff_notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
  scheduled_deletion_at: string | null;
  resolved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PrivacyRequestList {
  items: PrivacyRequest[];
  total: number;
  counts: Record<string, number>;
  grace_days: number;
}

export function listPrivacyRequests(q: { status?: string; request_type?: string; search?: string }): Promise<PrivacyRequestList> {
  const params: Record<string, string | number> = { limit: 200 };
  if (q.status && q.status !== "all") params.status = q.status;
  if (q.request_type && q.request_type !== "all") params.request_type = q.request_type;
  if (q.search?.trim()) params.search = q.search.trim();
  return api.get<PrivacyRequestList>("/admin/privacy-requests", { params });
}

export function approveRequest(id: number, note: string): Promise<PrivacyRequest> {
  return api.post<PrivacyRequest>(`/admin/privacy-requests/${id}/approve`, { note: note.trim() || null });
}

export function denyRequest(id: number, reason: string): Promise<PrivacyRequest> {
  return api.post<PrivacyRequest>(`/admin/privacy-requests/${id}/deny`, { reason: reason.trim() });
}

export function completeRequest(id: number, note: string): Promise<PrivacyRequest> {
  return api.post<PrivacyRequest>(`/admin/privacy-requests/${id}/complete`, { note: note.trim() || null });
}

export function restoreRequest(id: number, note: string): Promise<PrivacyRequest> {
  return api.post<PrivacyRequest>(`/admin/privacy-requests/${id}/restore`, { note: note.trim() || null });
}
