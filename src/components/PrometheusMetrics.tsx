import React, { useMemo, useState } from "react";
import { AlertTriangle, Download, Gauge, Loader2, RefreshCw } from "lucide-react";
import { Card, CardHeader, CopyChip } from "@/components/ui";
import { api, API_BASE, ApiError } from "@/lib/api";
import { cx } from "@/lib/utils";

// ── Prometheus exposition (GET /api/v1/metrics) ──────────────────────────────
// Staff-gated scrape endpoint. Rendered on demand rather than polled: a scrape
// is a few hundred KB of text and Prometheus itself is the real consumer — this
// panel exists so staff can confirm the endpoint is live and eyeball a series
// without shelling into the box.

interface Sample {
  name: string;
  labels: string;
  value: number;
}

interface Family {
  name: string;
  help: string;
  type: string;
  samples: Sample[];
}

const SAMPLE_RE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(-?[\d.eE+]+|NaN|\+Inf|-Inf)/;

/** Minimal text-exposition parser — enough to group samples under HELP/TYPE. */
function parseExposition(text: string): Family[] {
  const families = new Map<string, Family>();
  const ensure = (name: string): Family => {
    let f = families.get(name);
    if (!f) {
      f = { name, help: "", type: "untyped", samples: [] };
      families.set(name, f);
    }
    return f;
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const meta = /^#\s+(HELP|TYPE)\s+(\S+)\s*(.*)$/.exec(line);
      if (!meta) continue;
      const family = ensure(meta[2]);
      if (meta[1] === "HELP") family.help = meta[3];
      else family.type = meta[3] || "untyped";
      continue;
    }
    const m = SAMPLE_RE.exec(line);
    if (!m) continue;
    // Bucket/sum/count suffixes belong to their parent histogram/summary family.
    const base = m[1].replace(/_(bucket|sum|count|created)$/, "");
    const family = families.has(m[1]) ? ensure(m[1]) : ensure(families.has(base) ? base : m[1]);
    family.samples.push({ name: m[1], labels: m[2] ?? "", value: Number(m[3]) });
  }

  return [...families.values()].filter((f) => f.samples.length);
}

export function PrometheusMetrics() {
  const [text, setText] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [filter, setFilter] = useState("");

  const scrapeUrl = `${API_BASE}/metrics`;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await api.fetchText("/metrics");
      setText(body);
      setFetchedAt(new Date().toLocaleTimeString());
    } catch (e) {
      const detail =
        e instanceof ApiError && e.status === 403
          ? "This account is not permitted to scrape /metrics."
          : e instanceof Error
            ? e.message
            : "Failed to scrape metrics.";
      setError(detail);
      setText(null);
    } finally {
      setLoading(false);
    }
  };

  const families = useMemo(() => (text ? parseExposition(text) : []), [text]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return families;
    return families.filter((f) => f.name.toLowerCase().includes(q) || f.help.toLowerCase().includes(q));
  }, [families, filter]);

  const saveScrape = () => {
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `phantix-metrics-${new Date().toISOString().replace(/[:.]/g, "-")}.prom`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader
        title="Prometheus metrics"
        subtitle={
          text
            ? `${families.length} metric families · scraped ${fetchedAt}`
            : "Staff-gated metrics exposition"
        }
        action={
          <div className="flex items-center gap-2">
            {text && (
              <>
                <button onClick={() => setShowRaw((v) => !v)} className="btn-ghost px-3 py-1.5 text-xs">
                  {showRaw ? "Parsed" : "Raw"}
                </button>
                <button onClick={saveScrape} className="btn-ghost px-3 py-1.5 text-xs" title="Download scrape">
                  <Download size={13} />
                </button>
              </>
            )}
            <button onClick={() => void load()} disabled={loading} className="btn-secondary px-3 py-1.5 text-xs">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {text ? "Re-scrape" : "Scrape now"}
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <Gauge size={13} className="text-gold-400" />
        <span>Point a Prometheus job at</span>
        <CopyChip value={scrapeUrl} label={scrapeUrl} />
        <span className="text-slate-500">It requires the staff bearer token, so scrape through an authenticated proxy.</span>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-md border border-severity-critical/30 bg-severity-critical/10 p-3 text-xs text-severity-critical">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {!text && !error && (
        <p className="text-xs text-slate-500">
          Not scraped yet. A scrape is a few hundred KB of text, so this panel loads only on request.
        </p>
      )}

      {text && showRaw && (
        <pre className="max-h-[420px] overflow-auto rounded-md border border-phantix-700/40 bg-phantix-950/60 p-3 font-mono text-[13px] leading-5 text-slate-400">
          {text}
        </pre>
      )}

      {text && !showRaw && (
        <div className="space-y-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter metric families"
            className="input !py-1.5 !text-xs"
            aria-label="Filter metric families"
          />
          {!visible.length ? (
            <p className="text-xs text-slate-500">No metric family matches that filter.</p>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {visible.map((f) => (
                <FamilyRow key={f.name} family={f} />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function FamilyRow({ family }: { family: Family }) {
  const [open, setOpen] = useState(false);
  const preview = family.samples.slice(0, open ? family.samples.length : 4);

  return (
    <div className="rounded-md border border-phantix-700/40 bg-phantix-950/50 p-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className="block font-mono text-xs text-gold-300">{family.name}</span>
          {family.help && <span className="mt-0.5 block text-[13px] leading-4 text-slate-500">{family.help}</span>}
        </span>
        <span className="shrink-0 chip text-[12px] lowercase">{family.type}</span>
      </button>
      <div className="mt-2 space-y-1">
        {preview.map((s, i) => (
          <div key={`${s.name}${s.labels}${i}`} className="flex items-baseline justify-between gap-3 font-mono text-[13px]">
            <span className="min-w-0 truncate text-slate-400">{s.name}{s.labels}</span>
            <span className={cx("shrink-0 tabular-nums", Number.isFinite(s.value) ? "text-slate-200" : "text-slate-500")}>
              {Number.isFinite(s.value) ? s.value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "Not set"}
            </span>
          </div>
        ))}
        {!open && family.samples.length > preview.length && (
          <button onClick={() => setOpen(true)} className="text-[13px] text-slate-500 hover:text-slate-300">
            +{family.samples.length - preview.length} more series
          </button>
        )}
      </div>
    </div>
  );
}
