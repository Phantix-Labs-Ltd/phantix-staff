import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, Plus, RefreshCw, Sparkles, Upload } from "lucide-react";
import { PageHeader, Card, CardHeader, Modal, Spinner } from "@/components/ui";
import { api, AGI_ENABLED } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";

interface SkillRow {
  id: number;
  skill_id?: string;
  version?: string;
  title?: string;
  name?: string;
  kind?: string;
  status?: string;
  source?: string;
  score?: number;
}

const SAMPLE_MD = `---
name: http-fingerprint
description: Identify stack from response headers
kind: web
---

# HTTP fingerprinting

1. GET the target root path.
2. Record Server / X-Powered-By headers.
3. Emit FINDING only with evidence.
`;

export default function ContributeSkills() {
  const { toast, isAgiAdmin } = useStore();
  const [items, setItems] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [markdown, setMarkdown] = useState(SAMPLE_MD);
  const [busy, setBusy] = useState(false);
  const [promoting, setPromoting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ items: SkillRow[] }>("/admin/contribute/skills?status=candidate&limit=50");
      setItems(res.items ?? []);
    } catch (e) {
      toast("error", "Could not load skills", e instanceof Error ? e.message : undefined);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const importMd = async () => {
    setBusy(true);
    try {
      await api.post("/admin/contribute/skills/import-md", { markdown, kind: "general" });
      toast("success", "Skill imported as candidate");
      setShowImport(false);
      await load();
    } catch (e) {
      toast("error", "Import failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const promote = async (id: number, status: "active" | "quarantined") => {
    setPromoting(id);
    try {
      await api.post(`/admin/contribute/skills/${id}/promote`, { status });
      toast("success", status === "active" ? "Skill promoted" : "Skill quarantined");
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
        title="Skills"
        description="Import SKILL.md packs and promote auto-minted candidates after review."
        actions={
          <div className="flex gap-2">
            <button type="button" className="btn-secondary text-xs !py-2" onClick={() => setShowImport(true)}>
              <Upload size={13} /> Import SKILL.md
            </button>
            <button type="button" className="btn-ghost text-xs !py-2" onClick={() => void load()}>
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            </button>
          </div>
        }
      />

      <Card>
        <CardHeader
          title="Candidates"
          subtitle="status=candidate"
          action={
            AGI_ENABLED && isAgiAdmin ? (
              <Link to="/agi" className="text-xs text-gold-300 hover:text-gold-200">Open AGI Skills →</Link>
            ) : undefined
          }
        />
        {loading ? (
          <div className="flex justify-center py-10"><Spinner className="h-5 w-5" /></div>
        ) : !items.length ? (
          <p className="text-xs text-slate-500">No candidates. Import a SKILL.md or wait for auto-mint from AGI sessions.</p>
        ) : (
          <div className="space-y-2">
            {items.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-phantix-700/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm text-slate-200">
                    <Sparkles size={14} className="text-gold-400" />
                    {s.title || s.name || s.skill_id || `Skill #${s.id}`}
                  </p>
                  <p className="font-mono text-[12px] text-slate-500">
                    {s.skill_id}{s.version ? `@${s.version}` : ""} · {s.kind || "skill"} · {s.source || "Not set"}
                    {typeof s.score === "number" ? ` · score ${s.score.toFixed(2)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="chip text-[12px] border-amber-400/30 bg-amber-400/10 text-amber-300">{s.status || "candidate"}</span>
                  <button
                    type="button"
                    className="btn-primary !px-2.5 !py-1 !text-[13px]"
                    disabled={promoting === s.id}
                    onClick={() => void promote(s.id, "active")}
                  >
                    {promoting === s.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Promote
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1 !text-[13px] text-slate-400"
                    disabled={promoting === s.id}
                    onClick={() => void promote(s.id, "quarantined")}
                  >
                    Quarantine
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import SKILL.md">
        <div className="space-y-3">
          <textarea
            className="input min-h-[260px] font-mono text-[13px] leading-5"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
          />
          <button type="button" className="btn-primary w-full" disabled={busy || markdown.trim().length < 20} onClick={() => void importMd()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Import as candidate
          </button>
          <p className={cx("text-[13px] text-slate-500")}>Requires contribute_skills. Promote requires promote_candidates or agi_admin.</p>
        </div>
      </Modal>
    </div>
  );
}
