// Staff portal search — one query across the surfaces staff already work.
//
// There is no cross-entity search endpoint, and inventing one isn't needed: the
// admin list endpoints already accept a search term. This fans out to them in
// parallel and normalises the results into one shape the page renders grouped.
// Sources a role cannot read (e.g. /admin/clients for a support account) fail
// closed per-source: the rest of the search still returns, and the failures are
// reported so the operator knows what was not searched.
import { api } from "./api";

export type SearchKind = "client" | "ticket" | "demo_request" | "feedback" | "log";

export interface SearchHit {
  /** Unique within the result set. */
  key: string;
  kind: SearchKind;
  title: string;
  subtitle?: string;
  meta?: string;
  /** In-portal destination. */
  href: string;
  when?: string | null;
  /** A status/level/tone label rendered as a chip. */
  badge?: string;
}

export interface StaffSearchResult {
  q: string;
  hits: SearchHit[];
  counts: Record<SearchKind, number>;
  /** Sources that could not be searched (403/404/network), by kind. */
  errors: SearchKind[];
}

export const SEARCH_GROUP_LABELS: Record<SearchKind, string> = {
  client: "Clients",
  ticket: "Support tickets",
  demo_request: "Demo requests",
  feedback: "Feedback",
  log: "Log lines",
};

const EMPTY_COUNTS: Record<SearchKind, number> = {
  client: 0,
  ticket: 0,
  demo_request: 0,
  feedback: 0,
  log: 0,
};

function rows(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  const o = (raw ?? {}) as Record<string, unknown>;
  return Array.isArray(o.items) ? (o.items as any[]) : Array.isArray(o.value) ? (o.value as any[]) : [];
}

function str(v: unknown, fallback = ""): string {
  return v == null ? fallback : String(v);
}

/** Search every staff surface that offers a server-side search term. */
export async function staffSearch(query: string): Promise<StaffSearchResult> {
  const q = query.trim();
  if (q.length < 2) return { q, hits: [], counts: { ...EMPTY_COUNTS }, errors: [] };
  const needle = q.toLowerCase();
  const enc = encodeURIComponent(q);

  const [clients, demos, feedback, logs, tickets] = await Promise.allSettled([
    api.get<unknown>(`/admin/clients?q=${enc}&limit=10`),
    api.get<unknown>(`/admin/demo-requests?q=${enc}&limit=10`),
    api.get<unknown>(`/admin/feedback?search=${enc}&limit=10`),
    api.get<unknown>(`/admin/logs?q=${enc}&limit=10`),
    // Support has no server-side query; read the recent board and filter it.
    api.get<unknown>(`/admin/support/tickets?limit=200`),
  ]);

  const hits: SearchHit[] = [];
  const errors: SearchKind[] = [];

  if (clients.status === "fulfilled") {
    for (const c of rows(clients.value).slice(0, 10)) {
      hits.push({
        key: `client:${c.id}`,
        kind: "client",
        title: str(c.name, `#${c.id}`),
        subtitle: [str(c.slug), str(c.email)].filter(Boolean).join(" · ") || undefined,
        meta: [str(c.industry), str(c.country)].filter(Boolean).join(" · ") || undefined,
        href: `/clients/${c.id}`,
        when: c.created_at ?? null,
        badge: c.is_active === false ? "inactive" : "active",
      });
    }
  } else {
    errors.push("client");
  }

  if (demos.status === "fulfilled") {
    for (const d of rows(demos.value).slice(0, 10)) {
      hits.push({
        key: `demo:${d.id}`,
        kind: "demo_request",
        title: str(d.company || d.name, `#${d.id}`),
        subtitle: [str(d.name), str(d.email)].filter(Boolean).join(" · ") || undefined,
        meta: str(d.team_size) || undefined,
        href: "/demo-requests",
        when: d.created_at ?? null,
        badge: str(d.status, "new"),
      });
    }
  } else {
    errors.push("demo_request");
  }

  if (feedback.status === "fulfilled") {
    for (const f of rows(feedback.value).slice(0, 10)) {
      hits.push({
        key: `feedback:${f.id}`,
        kind: "feedback",
        title: str(f.message).slice(0, 140) || `Feedback #${f.id}`,
        subtitle: [str(f.service), str(f.submitted_by)].filter(Boolean).join(" · ") || undefined,
        meta: str(f.category) || undefined,
        href: "/feedback",
        when: f.created_at ?? null,
        badge: str(f.status, "new"),
      });
    }
  } else {
    errors.push("feedback");
  }

  if (logs.status === "fulfilled") {
    for (const l of rows(logs.value).slice(0, 10)) {
      const issue = l.issue_id ? `/logs/issues/${encodeURIComponent(String(l.issue_id))}` : "/logs";
      hits.push({
        key: `log:${l.id ?? `${l.created_at}-${l.message}`}`,
        kind: "log",
        title: str(l.message).slice(0, 160) || "(log line)",
        subtitle: [str(l.engine), str(l.log_type)].filter(Boolean).join(" · ") || undefined,
        meta: l.request_method && l.request_path ? `${l.request_method} ${l.request_path}` : undefined,
        href: issue,
        when: l.created_at ?? null,
        badge: str(l.level, "info"),
      });
    }
  } else {
    errors.push("log");
  }

  if (tickets.status === "fulfilled") {
    const matched = rows(tickets.value)
      .filter((t) =>
        [t.subject, t.organization_name, t.org_name, t.submitter_name, t.submitter_email]
          .map((v) => str(v).toLowerCase())
          .some((v) => v.includes(needle)),
      )
      .slice(0, 10);
    for (const t of matched) {
      hits.push({
        key: `ticket:${t.id}`,
        kind: "ticket",
        title: str(t.subject, `Ticket #${t.id}`),
        subtitle: [str(t.reference), str(t.organization_name || t.org_name)].filter(Boolean).join(" · ") || undefined,
        meta: str(t.submitter_name || t.created_by) || undefined,
        href: "/support",
        when: t.last_activity_at || t.created_at || null,
        badge: str(t.status, "open"),
      });
    }
  } else {
    errors.push("ticket");
  }

  const counts = { ...EMPTY_COUNTS };
  for (const hit of hits) counts[hit.kind] += 1;
  return { q, hits, counts, errors };
}
