import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Inbox, Loader2, RefreshCw, Sparkles, Wrench } from "lucide-react";
import { PageHeader, Card, CardHeader, Spinner } from "@/components/ui";
import { api, AGI_ENABLED } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";

interface LearningPayload {
  skill_candidates: { id: number; skill_id?: string; title?: string; kind?: string; source?: string; score?: number }[];
  pending_tools: { id?: number; tool?: string; status?: string; engine_id?: string }[];
  notes: string[];
  grants?: Record<string, boolean>;
}

export default function ContributeLearning() {
  const { toast, isAgiAdmin } = useStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LearningPayload | null>(null);
  const [promoting, setPromoting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const inbox = await api.get<LearningPayload>("/admin/contribute/learning");
      setData(inbox);
    } catch (e) {
      toast("error", "Learning inbox unavailable", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const promote = async (id: number) => {
    setPromoting(id);
    try {
      await api.post(`/admin/contribute/skills/${id}/promote`, { status: "active" });
      toast("success", "Skill promoted");
      await load();
    } catch (e) {
      toast("error", "Promote failed", e instanceof Error ? e.message : undefined);
    } finally {
      setPromoting(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Learning inbox"
        description="Auto-minted skills and tool provisions that wait for a human. Anonymized: no customer security inventory here."
        actions={
          <button type="button" className="btn-ghost text-xs !py-2" onClick={() => void load()}>
            <RefreshCw size={13} className={cx(loading && "animate-spin")} />
          </button>
        }
      />

      {loading && !data ? (
        <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Card>
              <CardHeader title="Skill candidates" subtitle={`${data?.skill_candidates?.length ?? 0} waiting`} />
              <div className="mb-3 flex items-center gap-3">
                <Sparkles className="text-gold-400" size={22} />
                <Link to="/contribute/skills" className="text-xs text-gold-300 hover:text-gold-200">Full skills workspace →</Link>
              </div>
              {!data?.skill_candidates?.length ? (
                <p className="text-xs text-slate-500">No candidates right now.</p>
              ) : (
                <div className="max-h-[40vh] space-y-2 overflow-auto">
                  {data.skill_candidates.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-phantix-700/40 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-200">{s.title || s.skill_id}</p>
                        <p className="font-mono text-[12px] text-slate-500">{s.kind} · {s.source}</p>
                      </div>
                      <button
                        type="button"
                        className="btn-primary !px-2 !py-1 !text-[13px]"
                        disabled={promoting === s.id}
                        onClick={() => void promote(s.id)}
                      >
                        {promoting === s.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Promote
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title="Tool provisions" subtitle="pending_admin" />
              <div className="mb-3 flex items-center gap-3">
                <Wrench className="text-gold-400" size={22} />
                {AGI_ENABLED && isAgiAdmin ? (
                  <Link to="/agi" className="text-xs text-gold-300 hover:text-gold-200">Open AGI tool queue →</Link>
                ) : (
                  <p className="text-[13px] text-slate-500">Requires agi_admin to provision tools.</p>
                )}
              </div>
              {!data?.pending_tools?.length ? (
                <p className="text-xs text-slate-500">No pending tool installs.</p>
              ) : (
                <div className="max-h-[40vh] space-y-2 overflow-auto">
                  {data.pending_tools.map((t, i) => (
                    <div key={t.id ?? i} className="rounded-md border border-phantix-700/40 px-3 py-2">
                      <p className="text-sm text-slate-200">{t.tool || `Request #${t.id}`}</p>
                      <p className="text-[12px] text-slate-500">{t.engine_id || "Not set"} · {t.status}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
          <Card>
            <CardHeader title="How learning works" subtitle="Continuous loop" />
            <ul className="space-y-2 text-sm text-slate-300">
              {(data?.notes ?? []).map((n) => (
                <li key={n} className="flex gap-2"><Inbox size={14} className="mt-1 shrink-0 text-gold-400" /> {n}</li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
