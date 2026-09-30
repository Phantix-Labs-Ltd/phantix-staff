// Staff API client — config from src/lib/config.ts (no Vite env).
import { API_BASE as CONFIG_API_BASE, AGI_ENABLED as AGI_FLAG } from "./config";
import { dedupedRequest } from "./dedupe";

export const API_BASE = CONFIG_API_BASE;
export const DEMO_MODE = false;
export const AGI_ENABLED = AGI_FLAG;

/** Same-origin media URLs — rewrite absolute upstream API paths. */
export function mediaUrl(path?: string | null): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) {
    try {
      const u = new URL(path);
      if (u.pathname.startsWith("/api/")) return `${u.pathname}${u.search}`;
    } catch { /* keep */ }
    return path;
  }
  return path.startsWith("/") ? path : `/${path}`;
}

// ── Token stores ────────────────────────────────────────────────────────────
export const tokens = {
  get staff() { return sessionStorage.getItem("staff_access_token"); },
  set staff(v: string | null) { v ? sessionStorage.setItem("staff_access_token", v) : sessionStorage.removeItem("staff_access_token"); },
  get email() { return sessionStorage.getItem("staff_email"); },
  set email(v: string | null) { v ? sessionStorage.setItem("staff_email", v) : sessionStorage.removeItem("staff_email"); },
};

export function deviceId(): string {
  let id = localStorage.getItem("phantix_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("phantix_device_id", id);
  }
  return id;
}

export function emailFromToken(): string {
  try {
    const t = tokens.staff;
    if (!t) return "";
    const payload = t.split(".")[1];
    if (!payload) return "";
    const decoded = JSON.parse(atob(payload));
    return typeof decoded.sub === "string" ? decoded.sub : typeof decoded.email === "string" ? decoded.email : "";
  } catch {
    return "";
  }
}

export function roleFromToken(): string {
  try {
    const t = tokens.staff;
    if (!t) return "";
    const payload = t.split(".")[1];
    if (!payload) return "";
    const decoded = JSON.parse(atob(payload));
    return typeof decoded.role === "string" ? decoded.role : "";
  } catch {
    return "";
  }
}

function detailMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: { msg?: string }) => d?.msg ?? "validation error").join(", ");
  }
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    if (typeof d.message === "string") return d.message;
    if (typeof d.detail === "string") return d.detail;
    if (typeof d.error === "string") return d.error;
  }
  return "Request failed";
}

/**
 * What a failed request is allowed to say to the operator.
 *
 * The backend writes its detail for an engineer reading logs: it names
 * endpoints, headers (`X-Dual-Control-Session`), internal codes and doc paths.
 * That text is logged (see `logRequestFailure`) and the UI gets this instead.
 */
export function errorCopyFor(status: number): string {
  if (status === 0) return "We could not reach the server. Check your connection and try again.";
  if (status === 401) return "Your session has expired. Sign in again to continue.";
  if (status === 402) return "That needs an upgrade on your plan.";
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "That item no longer exists.";
  if (status === 408) return "The request timed out. Try again.";
  if (status === 409) return "That conflicts with the current state. Refresh and try again.";
  if (status === 429) return "Too many attempts. Wait a moment and try again.";
  if (status >= 500) return "The server could not complete that request. Try again shortly.";
  if (status >= 400) return "That request was rejected. Check the details and try again.";
  return "Something went wrong. Try again.";
}

/**
 * Keep the server's own words in the error log, where they can be triaged.
 * Server faults log as errors; client-side rejections (validation, permissions,
 * conflicts) log as warnings so they do not drown the real failures.
 */
function logRequestFailure(
  status: number,
  serverMessage: string,
  detail: unknown,
  correlationId?: string,
): void {
  const line = `[api] ${status || "network"} · ${serverMessage}`;
  const context = correlationId ? `${line} · correlation-id=${correlationId}` : line;
  const write = status >= 500 || status === 0 || status === 408 ? console.error : console.warn;
  write(context, detail);
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  /** The backend's own message: logged for triage, never shown to the operator. */
  serverMessage: string;
  /** Server correlation id (X-Correlation-ID) for support/triage. */
  correlationId?: string;
  constructor(status: number, detail: unknown, correlationId?: string) {
    const serverMessage = detailMessage(detail);
    super(errorCopyFor(status));
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.serverMessage = serverMessage;
    this.correlationId = correlationId;
    logRequestFailure(status, serverMessage, detail, correlationId);
  }
}

/**
 * Wait (seconds) carried by a 429 "too many failed attempts" response, if the
 * server put a number in the detail. No Retry-After header yet — callers should
 * fall back to a generic "try again shortly" when this returns null.
 */
export function throttleSeconds(err: unknown): number | null {
  if (!(err instanceof ApiError) || err.status !== 429) return null;
  // The wait is carried in the server's own words, which no longer reach
  // `Error.message` — read the retained copy.
  const msg = typeof err.serverMessage === "string" ? err.serverMessage : "";
  const m = msg.match(/(\d+)\s*seconds?/i);
  return m ? Math.max(1, parseInt(m[1], 10)) : null;
}

// ── Correlation ID (00-shared-auth-and-client.md §6) ────────────────────────
// Surface X-Correlation-ID on failures so support can trace a request.
let lastCorrelationId: string | null = null;

/** Capture X-Correlation-ID from any response (if present). */
function trackCorrelationId(res: Response): void {
  const id = res.headers.get("X-Correlation-ID");
  if (id) lastCorrelationId = id;
}

/** Most recent correlation id seen on any response (or null). */
export function getCorrelationId(): string | null {
  return lastCorrelationId;
}

/** Reset tracking (e.g. on logout). */
export function clearCorrelationId(): void {
  lastCorrelationId = null;
}

type RequestOpts = {
  body?: unknown;
  params?: Record<string, string | number | boolean>;
  form?: Record<string, string>;
  /** Per-request timeout in ms (e.g. 180_000 for AGI session start). */
  timeoutMs?: number;
};

// ── 401 policy: session expiry vs. auth-realm mismatch ──────────────────────
// Only the staff realm authenticates staff JWTs: /staff/* (login + profile)
// and /admin/* (admin/support console). Role gaps inside those routers come
// back as 403, so a 401 there really does mean the staff session is gone.
//
// Other realms — e.g. the organization-user /audit/* API — refuse a staff
// token with 401 too. Treating that as expiry used to wipe the session the
// instant the dashboard's audit-chain widget loaded, signing the user out
// right after login. Scope the destructive clear to the staff realm only.
const STAFF_REALM_RE = /^\/(?:staff|admin)(?:\/|$)/;

/** True when a 401 from `path` should invalidate the stored staff session. */
function invalidatesStaffSession(path: string): boolean {
  return STAFF_REALM_RE.test(path);
}

async function request<T>(
  method: string,
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const headers: Record<string, string> = {};

  if (tokens.staff) {
    headers["Authorization"] = `Bearer ${tokens.staff}`;
  }

  let url = `${API_BASE}${path}`;
  if (opts.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(opts.params)) {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.set(key, String(value));
      }
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  let body: BodyInit | undefined;
  if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.form).toString();
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const controller = opts.timeoutMs != null ? new AbortController() : null;
  const timer = controller && opts.timeoutMs != null
    ? window.setTimeout(() => controller.abort(), opts.timeoutMs)
    : null;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body, signal: controller?.signal });
  } catch (err) {
    if (timer != null) window.clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(408, "Request timed out");
    }
    throw err;
  }
  if (timer != null) window.clearTimeout(timer);
  trackCorrelationId(res);
  if (!res.ok) {
    const correlationId = res.headers.get("X-Correlation-ID") || undefined;
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail;
    } catch { /* non-JSON */ }
    if (res.status === 401 && invalidatesStaffSession(path)) {
      tokens.staff = null;
      tokens.email = null;
    }
    // First-login password change pending: let the app route to the change screen.
    if (res.status === 403 && detail && typeof detail === "object" && "code" in detail) {
      if ((detail as { code?: string }).code === "password_change_required") {
        window.dispatchEvent(new CustomEvent("phantix:password-change-required"));
      }
    }
    // Login throttling (staging-rollout §8): failed attempts are throttled per
    // identifier — 5 failures/5 min → 429. Never present it as a wrong password.
    if (res.status === 429) {
      const throttleMsg = typeof detail === "string" ? detail : "";
      const sec = throttleMsg.match(/(\d+)\s*seconds?/i);
      window.dispatchEvent(new CustomEvent("phantix:throttled", {
        detail: { seconds: sec ? Math.max(1, parseInt(sec[1], 10)) : null },
      }));
    }
    throw new ApiError(res.status, detail, correlationId);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOpts) =>
    // Include query params in the dedupe key: two GETs to the same path with
    // different params are different requests (e.g. per-category tool loads).
    dedupedRequest("GET", path, opts?.params, () => request<T>("GET", path, opts)),
  post: <T>(path: string, body?: unknown, opts?: RequestOpts) => request<T>("POST", path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOpts) => request<T>("PUT", path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOpts) => request<T>("PATCH", path, { ...opts, body }),
  delete: <T>(path: string, opts?: RequestOpts) => request<T>("DELETE", path, opts),
  postForm: <T>(path: string, form: Record<string, string>) =>
    request<T>("POST", path, { form }),

  /** multipart/form-data (e.g. framework upload field `file`) */
  async postMultipart<T>(path: string, formData: FormData): Promise<T> {
    const headers: Record<string, string> = {};
    if (tokens.staff) headers["Authorization"] = `Bearer ${tokens.staff}`;
    headers["X-Device-Id"] = deviceId();
    const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData });
    trackCorrelationId(res);
    if (!res.ok) {
      let detail: unknown = res.statusText;
      try { detail = (await res.json()).detail; } catch { /* non-JSON */ }
      if (res.status === 401 && invalidatesStaffSession(path)) { tokens.staff = null; tokens.email = null; }
      throw new ApiError(res.status, detail, res.headers.get("X-Correlation-ID") || undefined);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  },

  async download(path: string): Promise<Blob> {
    const headers: Record<string, string> = {};
    if (tokens.staff) headers["Authorization"] = `Bearer ${tokens.staff}`;
    const res = await fetch(`${API_BASE}${path}`, { method: "GET", headers });
    trackCorrelationId(res);
    if (!res.ok) throw new ApiError(res.status, res.statusText, res.headers.get("X-Correlation-ID") || undefined);
    return res.blob();
  },

  async fetchText(path: string): Promise<string> {
    const headers: Record<string, string> = {};
    if (tokens.staff) headers["Authorization"] = `Bearer ${tokens.staff}`;
    const res = await fetch(`${API_BASE}${path}`, { method: "GET", headers });
    trackCorrelationId(res);
    if (!res.ok) {
      // Preserve the response body on failure — HTML routes (e.g. the
      // architecture artefacts) return the remedial command in the message.
      let detail: unknown = res.statusText;
      try {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const j = await res.clone().json();
          detail = (j && typeof j === "object" && "detail" in j ? (j as { detail?: unknown }).detail : j) ?? res.statusText;
        } else {
          detail = (await res.text()).slice(0, 2000);
        }
      } catch { /* keep statusText */ }
      throw new ApiError(res.status, detail, res.headers.get("X-Correlation-ID") || undefined);
    }
    return res.text();
  },
};

export const delay = (ms = 420) => new Promise((r) => setTimeout(r, ms));
