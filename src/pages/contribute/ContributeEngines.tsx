import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, ListChecks, RefreshCw } from "lucide-react";
import { PageHeader, Card, CardHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";

interface EngineRow {
  id: string;
  name?: string;
  version?: string | null;
  status?: string | null;
  description?: string | null;
}

interface ArchIndex {
  engines: EngineRow[];
  engine_count: number;
}

interface Checklist {
  engine_id: string;
  atlas_href: string;
  api_href: string;
  steps: string[];
}

export default function ContributeEngines() {
  const { toast } = useStore();
  const [loading, setLoading] = useState(true);
  const [arch, setArch] = useState<ArchIndex | null>(null);
  const [learning, setLearning] = useState<{ engine_id?: string; score?: number }[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [selected, setSelected] = useState<string>("scanner_engine");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, overview, checks] = await Promise.all([
        api.get<ArchIndex>("/admin/architecture").catch(() => null),
        api.get<{ engine_learning_top?: { engine_id?: string; score?: number }[] }>("/admin/contribute/overview").catch(() => null),
        api.get<{ items: Checklist[] }>("/admin/contribute/engines/checklists").catch(() => null),
      ]);
      setArch(a);
      setLearning(overview?.engine_learning_top ?? []);
      setChecklists(checks?.items ?? []);
      if (checks?.items?.[0]?.engine_id) setSelected(checks.items[0].engine_id);
    } catch (e) {
      toast("error", "Could not load engines", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const checklist = checklists.find((c) => c.engine_id === selected) || checklists.find((c) => c.engine_id === "_default");

  return (
    <div>
      <PageHeader
        title="Engines"
        description="Atlas design pages, learning scores, and how-to-extend checklists."
        actions={
          <button type="button" className="btn-ghost text-xs !py-2" onClick={() => void load()}>
            <RefreshCw size={13} className={cx(loading && "animate-spin")} />
          </button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Architecture atlas"
              subtitle={`${arch?.engine_count ?? 0} engines`}
              action={<Link to="/architecture" className="text-xs text-gold-300 hover:text-gold-200">Open Atlas →</Link>}
            />
            {!arch?.engines?.length ? (
              <p className="text-xs text-slate-500">Atlas artefacts missing. Run scripts/gen_architecture.py on deploy.</p>
            ) : (
              <div className="max-h-[45vh] space-y-1.5 overflow-auto">
                {arch.engines.map((e) => (
                  <div key={e.id} className="flex items-start gap-2 rounded-md border border-phantix-700/40 px-3 py-2">
                    <Layers size={14} className="mt-0.5 text-gold-400" />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200">{e.name || e.id}</p>
                      <p className="text-[12px] text-slate-500">{e.id}{e.version ? ` · v${e.version}` : ""} · {e.status || "Not set"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Learning scores" subtitle="Top movers" />
            {!learning.length ? (
              <p className="text-xs text-slate-500">No capability scores yet.</p>
            ) : (
              <ul className="space-y-2">
                {learning.map((e, i) => (
                  <li key={`${e.engine_id}-${i}`} className="flex items-center justify-between rounded-md border border-phantix-700/40 px-3 py-2 text-sm">
                    <span className="font-mono text-slate-200">{e.engine_id}</span>
                    <span className="chip text-xs border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                      {typeof e.score === "number" ? e.score.toFixed(2) : "Not set"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Enhance an engine" subtitle="Guided checklist" />
            <div className="mb-3 flex flex-wrap gap-2">
              {checklists.filter((c) => c.engine_id !== "_default").map((c) => (
                <button
                  key={c.engine_id}
                  type="button"
                  onClick={() => setSelected(c.engine_id)}
                  className={cx(
                    "rounded-full border px-3 py-1 text-[13px] font-semibold",
                    selected === c.engine_id
                      ? "border-gold-400/40 bg-gold-400/10 text-gold-300"
                      : "border-phantix-700/40 text-slate-400",
                  )}
                >
                  {c.engine_id}
                </button>
              ))}
            </div>
            {!checklist ? (
              <p className="text-xs text-slate-500">No checklists available.</p>
            ) : (
              <ol className="space-y-2">
                {checklist.steps.map((step, i) => (
                  <li key={step} className="flex gap-2 rounded-md border border-phantix-700/40 px-3 py-2 text-sm text-slate-300">
                    <ListChecks size={14} className="mt-0.5 shrink-0 text-gold-400" />
                    <span><span className="mr-2 text-slate-500">{i + 1}.</span>{step}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              <Link to="/contribute/capabilities" className="text-gold-300 hover:text-gold-200">YAML packs →</Link>
              <Link to="/contribute/skills" className="text-gold-300 hover:text-gold-200">Skills →</Link>
              <Link to="/contribute/learning" className="text-gold-300 hover:text-gold-200">Learning inbox →</Link>
              <Link to="/architecture" className="text-gold-300 hover:text-gold-200">Atlas →</Link>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
