import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen, Brain, Crosshair, Layers, Loader2, Radar, RefreshCw, Sparkles, FileCode2, Inbox,
} from "lucide-react";
import { PageHeader, Card, CardHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";

interface Overview {
  skill_candidates: number;
  pending_tool_installs: number;
  yaml_drafts: number;
  yaml_in_review: number;
  content_drafts: number;
  content_in_review: number;
  engine_learning_top: { engine_id?: string; score?: number }[];
  grants: Record<string, boolean>;
  links: { id: string; label: string; href: string; description: string; available?: boolean }[];
}

const iconFor: Record<string, React.ReactNode> = {
  atlas: <Layers size={16} />,
  skills: <Sparkles size={16} />,
  yaml: <FileCode2 size={16} />,
  knowledge: <BookOpen size={16} />,
  engines: <Brain size={16} />,
  learning: <Inbox size={16} />,
  vapt: <Crosshair size={16} />,
  agi: <Radar size={16} />,
};

export default function ContributeHome() {
  const { toast } = useStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Overview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Overview>("/admin/contribute/overview");
      setData(res);
    } catch (e) {
      toast("error", "Contribute overview unavailable", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return (
      <div>
        <PageHeader title="Contribute" description="Security research, skills, findings, and engine learning" />
        <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
      </div>
    );
  }

  const stats = [
    { label: "Skill candidates", value: data?.skill_candidates ?? 0, to: "/contribute/skills" },
    { label: "Tools pending", value: data?.pending_tool_installs ?? 0, to: "/contribute/learning" },
    { label: "YAML drafts", value: (data?.yaml_drafts ?? 0) + (data?.yaml_in_review ?? 0), to: "/contribute/capabilities" },
    { label: "Content drafts", value: (data?.content_drafts ?? 0) + (data?.content_in_review ?? 0), to: "/contribute/knowledge" },
  ];

  return (
    <div>
      <PageHeader
        title="Contribute"
        description="Start here: Atlas, handbook, skills, finding YAMLs and engine learning, without a search through the admin menus."
        actions={
          <button type="button" onClick={() => void load()} className="btn-ghost text-xs !py-2" title="Refresh">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            to={s.to}
            className="rounded-2xl border border-phantix-700/40 bg-phantix-900/50 px-4 py-3 transition-colors hover:border-gold-400/30"
          >
            <p className="text-[13px] uppercase tracking-wider text-slate-500">{s.label}</p>
            <p className="mt-1 font-display text-2xl font-bold text-white">{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Workspace" subtitle="Open a surface" />
          <div className="space-y-2">
            {(data?.links ?? []).map((l) => {
              const available = l.available !== false;
              const inner = (
                <div
                  className={cx(
                    "flex items-start gap-3 rounded-md border border-phantix-700/40 bg-phantix-950/40 px-3 py-3",
                    available ? "hover:border-gold-400/30" : "opacity-40",
                  )}
                >
                  <span className="mt-0.5 text-gold-400">{iconFor[l.id] ?? <BookOpen size={16} />}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-200">{l.label}</span>
                    <span className="block text-[13px] text-slate-500">{l.description}</span>
                  </span>
                </div>
              );
              return available ? (
                <Link key={l.id} to={l.href}>{inner}</Link>
              ) : (
                <div key={l.id} title="Not available for your grants">{inner}</div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Engine learning" subtitle="Top scored engines" />
          {!data?.engine_learning_top?.length ? (
            <p className="text-xs text-slate-500">No learning scores yet. Sessions populate this as the engines improve.</p>
          ) : (
            <ul className="space-y-2">
              {data.engine_learning_top.map((e, i) => (
                <li
                  key={`${e.engine_id}-${i}`}
                  className="flex items-center justify-between rounded-md border border-phantix-700/40 px-3 py-2 text-sm"
                >
                  <span className="font-mono text-slate-200">{e.engine_id ?? "Not set"}</span>
                  <span className="chip text-xs border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                    {typeof e.score === "number" ? e.score.toFixed(2) : "Not set"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/contribute/engines" className="mt-4 inline-flex text-xs text-gold-300 hover:text-gold-200">
            Open engines →
          </Link>
        </Card>
      </div>
    </div>
  );
}
