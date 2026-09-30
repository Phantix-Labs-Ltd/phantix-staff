import React, { useState } from "react";
import { Layers, Loader2, X, ExternalLink, Boxes, FileCode2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { PageHeader, Card, ErrorState, EmptyState, SkeletonCard } from "@/components/ui";
import { cx } from "@/lib/utils";

// ── GET /api/v1/admin/architecture (staging-rollout §1) ─────────────────────
// JSON index of every engine; each engine + the atlas have HTML artefacts that
// are fetched with the staff JWT and rendered in a sandboxed frame below.

interface ArchitectureEngine {
  id: string;
  name: string;
  version: string;
  status: string;
  description?: string;
  href: string;
  generated_at?: string;
}

interface ArchitectureIndex {
  engines: ArchitectureEngine[];
  engine_count?: number;
  atlas?: { href?: string; available?: boolean; generated_at?: string };
  diagram?: { available?: boolean; generated_at?: string };
  source?: string;
}

type DocView = { title: string; html: string } | null;

/** Engine hrefs come back absolute (/api/v1/...); the client prefixes API_BASE. */
function apiPath(href: string): string {
  return href.replace(/^\/api\/v1/, "");
}

function statusClasses(status: string): string {
  switch (status) {
    case "implemented":
    case "active":
    case "healthy":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-400";
    case "experimental":
    case "draft":
      return "border-gold-400/30 bg-gold-400/10 text-gold-300";
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  }
}

export default function Architecture() {
  const [view, setView] = useState<DocView>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  const index = useResource<ArchitectureIndex>(
    () => api.get<ArchitectureIndex>("/admin/architecture"),
    { engines: [] } as ArchitectureIndex,
    "admin-architecture",
  );

  const openDoc = async (href: string, title: string) => {
    setOpening(href);
    setDocError(null);
    try {
      // Fetched with the staff JWT (an <iframe src> cannot carry the header).
      const html = await api.fetchText(apiPath(href));
      setView({ title, html });
    } catch (err) {
      // §1: 503 artefacts tell staff the exact command to run — surface it.
      if (err instanceof ApiError && err.status === 503) {
        setDocError(`Not generated on this deployment. ${err.message}`);
      } else {
        setDocError(err instanceof Error ? err.message : "Failed to load document");
      }
    } finally {
      setOpening(null);
    }
  };

  const data = index.data;
  const engines = data?.engines ?? [];
  const atlas = data?.atlas;
  const error = index.error;
  const isLoading = index.loading && engines.length === 0;

  return (
    <div>
      <PageHeader
        title="Architecture"
        description="Engine registry + generated architecture documents"
        actions={
          atlas?.available && atlas.href ? (
            <button className="btn-primary !py-2 text-xs" onClick={() => void openDoc(atlas.href!, "Full system atlas")} disabled={opening != null}>
              {opening === atlas.href ? <Loader2 size={13} className="mr-1.5 inline animate-spin" /> : <Boxes size={13} className="mr-1.5 inline" />}
              Full atlas
            </button>
          ) : undefined
        }
      />

      {isLoading ? (
        <SkeletonCard />
      ) : error && engines.length === 0 ? (
        // JSON index may itself be a 503 when gen_architecture.py hasn't run.
        <ErrorState
          icon={<Layers size={22} />}
          title={error.includes("503") || error.includes("not generated") ? "Architecture not generated" : "Server not responding"}
          body={error}
          onRetry={index.refresh}
        />
      ) : (
        <>
          {/* Summary strip */}
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="chip border-phantix-600/50 bg-phantix-800/60 text-slate-300">
              {data?.engine_count ?? engines.length} engines
            </span>
            {atlas?.available === false && (
              <span className="chip border-gold-400/30 bg-gold-400/10 text-gold-300">Atlas not generated</span>
            )}
            {data?.source && <span className="font-mono text-[13px] text-slate-600">source: {data.source}</span>}
          </div>

          {docError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-severity-critical/30 bg-severity-critical/10 px-3 py-2.5 text-xs text-severity-critical">
              <X size={13} className="mt-0.5 shrink-0 cursor-pointer" onClick={() => setDocError(null)} />
              <span className="font-mono leading-5">{docError}</span>
            </div>
          )}

          {/* Engine grid */}
          {engines.length === 0 ? (
            <EmptyState icon={<Layers size={22} />} title="No engines registered" body="Run scripts/gen_architecture.py on the backend to generate the registry." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {engines.map((engine) => (
                <button
                  key={engine.id}
                  type="button"
                  className="card p-4 text-left transition-colors hover:border-phantix-500/60"
                  onClick={() => engine.href && void openDoc(engine.href, engine.name)}
                  disabled={opening != null}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-sm font-semibold text-white">{engine.name}</p>
                    <span className={cx("chip shrink-0 !px-2 !py-0.5 text-[12px] capitalize", statusClasses(engine.status))}>{engine.status}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-400">v{engine.version}</p>
                  {engine.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{engine.description}</p>}
                  <p className="mt-3 flex items-center gap-1 text-[13px] text-gold-400">
                    {opening === engine.href ? <Loader2 size={11} className="animate-spin" /> : <FileCode2 size={11} />}
                    Open document
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* Document panel */}
          {view && (
            <div className="mt-6 overflow-hidden rounded-xl border border-phantix-700/40 bg-white">
              <div className="flex items-center justify-between border-b border-phantix-700/20 bg-phantix-800/60 px-4 py-2.5">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-200">
                  <ExternalLink size={13} className="text-gold-400" /> {view.title}
                </p>
                <button
                  type="button"
                  onClick={() => setView(null)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-phantix-700/40 hover:text-white"
                  aria-label="Close document"
                >
                  <X size={15} />
                </button>
              </div>
              {/* Backend HTML is a self-contained document; sandbox without scripts keeps it inert. */}
              <iframe sandbox="" title={view.title} srcDoc={view.html} className="h-[70vh] w-full" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
