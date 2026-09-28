import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Search as SearchIcon, ArrowRight, Loader2, AlertTriangle } from "lucide-react";
import { PageHeader, Card, CardHeader, EmptyState } from "@/components/ui";
import { staffSearch, SEARCH_GROUP_LABELS, type SearchHit, type SearchKind, type StaffSearchResult } from "@/lib/staffSearch";
import { cx, timeAgo, titleCase } from "@/lib/utils";

// ── Staff portal search ──────────────────────────────────────────────────────
// One box over the surfaces staff already work: clients, support tickets, demo
// requests, feedback and log lines. Each source is the existing admin list
// endpoint with its own search term (see lib/staffSearch.ts) — nothing new to
// keep in sync on the backend.

const GROUP_ORDER: SearchKind[] = ["client", "ticket", "demo_request", "feedback", "log"];

const EMPTY: StaffSearchResult = { q: "", hits: [], counts: { client: 0, ticket: 0, demo_request: 0, feedback: 0, log: 0 }, errors: [] };

function toneFor(hit: SearchHit): string {
  const badge = (hit.badge || "").toLowerCase();
  if (["critical", "error", "high", "open", "failed"].includes(badge)) return "text-severity-critical bg-severity-critical/10 border-severity-critical/20";
  if (["warning", "medium", "pending", "in_progress"].includes(badge)) return "text-severity-medium bg-severity-medium/10 border-severity-medium/20";
  if (["resolved", "closed", "converted", "active", "ok", "info"].includes(badge)) return "text-emerald-300 bg-emerald-400/10 border-emerald-400/20";
  return "text-slate-400 bg-slate-400/10 border-slate-500/20";
}

function HitRow({ hit }: { hit: SearchHit }) {
  return (
    <Link
      to={hit.href}
      className="group flex items-start justify-between gap-3 rounded-lg border border-phantix-700/40 bg-phantix-950/50 px-3 py-2.5 transition-colors hover:border-phantix-500/50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-200 group-hover:text-white">{hit.title}</p>
        {hit.subtitle && <p className="truncate text-[13px] text-slate-500">{hit.subtitle}</p>}
        {hit.meta && <p className="truncate font-mono text-[12px] text-slate-600">{hit.meta}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {hit.badge && <span className={cx("chip text-[12px] capitalize", toneFor(hit))}>{hit.badge}</span>}
        {hit.when && <span className="text-[12px] text-slate-600">{timeAgo(hit.when)}</span>}
        <ArrowRight size={13} className="text-slate-600 group-hover:text-slate-300" />
      </div>
    </Link>
  );
}

export default function Search() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<StaffSearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  // Debounce so typing does not fan out a request per keystroke; the request id
  // drops a slow earlier response that would otherwise overwrite a newer one.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResult(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++requestId.current;
    const t = window.setTimeout(() => {
      staffSearch(term)
        .then((res) => {
          if (id === requestId.current) setResult(res);
        })
        .catch(() => {
          if (id === requestId.current) setResult({ ...EMPTY, q: term, errors: GROUP_ORDER });
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const grouped = useMemo(() => {
    const out: { kind: SearchKind; hits: SearchHit[] }[] = [];
    for (const kind of GROUP_ORDER) {
      const hits = result.hits.filter((h) => h.kind === kind);
      if (hits.length) out.push({ kind, hits });
    }
    return out;
  }, [result.hits]);

  const total = result.hits.length;

  return (
    <div>
      <PageHeader
        title="Search"
        description="Find a client, support ticket, demo request, feedback report or log line across the portal."
      />

      <Card className="mb-5">
        <div className="relative">
          <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clients, tickets, feedback, logs…"
            aria-label="Search the staff portal"
            className="input !pl-9 !py-2.5 text-sm"
          />
          {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" />}
        </div>
        <p className="mt-2 text-[13px] text-slate-500">
          {q.trim().length < 2
            ? "Type at least two characters."
            : loading
              ? "Searching…"
              : `${total} result${total === 1 ? "" : "s"} for “${result.q}”`}
        </p>
        {result.errors.length > 0 && (
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-severity-medium">
            <AlertTriangle size={12} />
            Not searched (no access or unavailable): {result.errors.map((k) => SEARCH_GROUP_LABELS[k]).join(", ")}
          </p>
        )}
      </Card>

      {q.trim().length >= 2 && !loading && total === 0 ? (
        <Card>
          <EmptyState
            icon={<SearchIcon size={24} />}
            title="No matches"
            body={`Nothing across the sources you can read matches “${result.q}”. Try a different term.`}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ kind, hits }) => (
            <Card key={kind}>
              <CardHeader
                title={SEARCH_GROUP_LABELS[kind]}
                subtitle={`${hits.length} match${hits.length === 1 ? "" : "es"}`}
                action={<span className="chip text-[12px]">{titleCase(kind)}</span>}
              />
              <div className="space-y-1.5">
                {hits.map((hit) => (
                  <HitRow key={hit.key} hit={hit} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
