import React, { useCallback, useEffect, useState } from "react";
import { ListOrdered, RefreshCw, Sparkles } from "lucide-react";
import { Card, EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/ui";
import { api, DEMO_MODE } from "@/lib/api";
import { cx, formatDateTime } from "@/lib/utils";

// ── Launch waitlist ──────────────────────────────────────────────────────────
// Work emails collected on the Platform's /waitlist while registration is
// closed (GET /api/v1/admin/waitlist). A completed Quick Scan of the email's
// domain puts the entry on the prioritized launch list: invite those first.

type Entry = {
  id: number;
  email: string;
  domain: string;
  status: "joined" | "scanning" | "prioritized" | "scan_failed" | string;
  prioritized: boolean;
  prioritized_at: string | null;
  created_at: string;
  scan_status: string | null;
  findings_count: number | null;
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  prioritized: { label: "Prioritized", cls: "text-gold-300 bg-gold-400/10 border-gold-400/30" },
  scanning: { label: "Scanning", cls: "text-sky-300 bg-sky-400/10 border-sky-400/30" },
  joined: { label: "Joined", cls: "text-slate-300 bg-slate-400/10 border-slate-500/30" },
  scan_failed: { label: "Scan failed", cls: "text-severity-medium bg-severity-medium/10 border-severity-medium/30" },
};

export default function Waitlist() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyPrioritized, setOnlyPrioritized] = useState(false);

  const load = useCallback(async () => {
    if (DEMO_MODE) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ total: number; items: Entry[] }>("/admin/waitlist?limit=500");
      setRows(Array.isArray(res?.items) ? res.items : []);
      setTotal(Number(res?.total ?? 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the waitlist");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const prioritized = rows.filter((r) => r.prioritized).length;
  const shown = onlyPrioritized ? rows.filter((r) => r.prioritized) : rows;

  return (
    <div>
      <PageHeader
        title="Waitlist"
        description="Work emails left on the Platform while registration is closed. Prioritized entries completed a Quick Scan of their domain: invite them first."
        actions={
          <button type="button" className="btn-ghost !text-xs" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={13} className={cx(loading && "animate-spin")} /> Refresh
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-slate-300">{total} on the waitlist</span>
        <span className="flex items-center gap-1.5 text-gold-300"><Sparkles size={14} /> {prioritized} prioritized</span>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={onlyPrioritized} onChange={(e) => setOnlyPrioritized(e.target.checked)} />
          Prioritized only
        </label>
      </div>

      {error ? (
        <ErrorState title="Could not load the waitlist" body={error} onRetry={() => void load()} />
      ) : loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState icon={<ListOrdered size={22} />} title="No one on the waitlist yet" body="Entries appear here once registration closes and visitors join." />
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-phantix-700/40">
                  <th className="th">Email</th>
                  <th className="th">Domain</th>
                  <th className="th">Status</th>
                  <th className="th">Quick Scan</th>
                  <th className="th">Joined</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const s = STATUS_LABEL[r.status] ?? STATUS_LABEL.joined;
                  return (
                    <tr key={r.id} className="border-b border-phantix-800/40">
                      <td className="td font-mono text-xs text-slate-200">{r.email}</td>
                      <td className="td text-sm text-slate-300">{r.domain}</td>
                      <td className="td"><span className={cx("chip", s.cls)}>{s.label}</span></td>
                      <td className="td text-xs text-slate-400">
                        {r.scan_status
                          ? `${r.scan_status}${r.findings_count != null && r.scan_status === "completed" ? ` · ${r.findings_count} finding${r.findings_count === 1 ? "" : "s"}` : ""}`
                          : "Not requested"}
                      </td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
