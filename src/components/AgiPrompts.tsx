import React, { useEffect, useMemo, useState } from "react";
import { Brain, ChevronDown, ChevronRight, Plus, Search, ShieldCheck, Sparkles, Trash2, Pencil, Check, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { resolveAgiPrompts } from "@/lib/agi";
import {
  buildSkillPlan,
  buildSystemPrompt,
  detectIntents,
  FORBIDDEN_APPENDIX,
  INTENT_SIGNALS,
  rankSkills,
  resolvePromptDef,
  TOOL_INSTRUCTIONS,
  type AgiPromptDef,
  DEFAULT_PROMPTS,
  loadPromptDefs,
  savePromptDefs,
} from "@/lib/agiPrompts";
import type { AgiSkill, AgiSkillPlan } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useStore } from "@/lib/store";

const EXAMPLES = [
  "VAPT scan the public web app",
  "Enumerate subdomains and DNS of the allowlisted hosts",
  "Dynamic mobile APK Frida analysis",
  "Triage SOC detections and correlate alerts",
  "Find IDOR or broken access control on the API",
  "Recon the website for exposed secrets and .env files",
];

export default function AgiPrompts() {
  const { toast } = useStore();
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ intents: string[]; plan: AgiSkillPlan; prompt: string; matchedDef: AgiPromptDef | null } | null>(null);
  const [openBlock, setOpenBlock] = useState<string | null>("resolver");
  const [defs, setDefs] = useState<AgiPromptDef[]>(() => loadPromptDefs());
  const [editing, setEditing] = useState<AgiPromptDef | null>(null);
  const [draft, setDraft] = useState<AgiPromptDef | null>(null);

  useEffect(() => { savePromptDefs(defs); }, [defs]);

  const run = async (text?: string) => {
    const obj = (text ?? instruction).trim();
    if (!obj) return;
    setBusy(true);
    try {
      const { skills } = await resolveAgiPrompts(obj);
      const intents = detectIntents(obj);
      const ranked = rankSkills(skills as AgiSkill[], obj, intents);
      const plan = buildSkillPlan(ranked, obj, intents);
      const matchedDef = resolvePromptDef(obj, defs);
      const prompt = buildSystemPrompt({ instruction: obj, intents, plan });
      setResult({ intents, plan, prompt, matchedDef });
    } finally {
      setBusy(false);
    }
  };

  const saveDef = () => {
    if (!draft) return;
    const clean = { ...draft, key: draft.key.trim(), label: draft.label.trim(), system_prompt: draft.system_prompt.trim(), intents: draft.intents.filter(Boolean), skill_ids: draft.skill_ids.filter(Boolean) };
    if (!clean.key || !clean.label) { toast("error", "Key and label required"); return; }
    setDefs((prev) => {
      const idx = prev.findIndex((d) => d.key === clean.key);
      if (idx >= 0) { const next = [...prev]; next[idx] = clean; return next; }
      return [clean, ...prev];
    });
    setEditing(null); setDraft(null);
    toast("success", "Prompt saved");
  };

  const toggleDef = (key: string) => setDefs((prev) => prev.map((d) => (d.key === key ? { ...d, is_active: !d.is_active } : d)));
  const removeDef = (key: string) => setDefs((prev) => prev.filter((d) => d.key !== key));

  const intentsLabel = useMemo(() => result?.intents.join(" · ") ?? "", [result]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ── Left: resolver ─────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-3">
          <Card>
            <CardHeader title="Resolve an objective" subtitle="Type what a user would ask. You then see the intent detected, the skill it resolves to, and the prompt that drives execution." />
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) void run(); }}
                  placeholder="e.g. VAPT scan the public web app"
                  className="w-full rounded-lg border border-phantix-700/50 bg-phantix-950/60 py-2 pl-8 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-gold-400/40"
                />
              </div>
              <button onClick={() => void run()} disabled={busy || !instruction.trim()} className="btn-primary !px-4 !py-2 !text-xs"><Sparkles size={13} className="mr-1 inline" /> Resolve</button>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => { setInstruction(ex); void run(ex); }} className="rounded-full border border-phantix-700/40 bg-phantix-900/40 px-2.5 py-1 text-[13px] text-slate-400 transition-colors hover:border-gold-400/40 hover:text-slate-200">{ex}</button>
              ))}
            </div>
          </Card>

          {result && (
            <>
              <Card>
                <CardHeader title="Detected intent" subtitle="From objective tokens (mirrors skill_prioritization.detect_intents)." />
                <div className="flex flex-wrap gap-1.5">
                  {result.intents.map((i) => <span key={i} className="chip border-gold-400/30 bg-gold-400/10 text-[12px] text-gold-300">{i}</span>)}
                  {result.matchedDef && <span className="chip border-emerald-400/30 bg-emerald-400/10 text-[12px] text-emerald-300">prompt: {result.matchedDef.key}</span>}
                </div>
                {result.matchedDef && (
                  <p className="mt-2 break-words text-[13px] leading-4 text-slate-500">Matches prompt <span className="font-mono text-slate-300">{result.matchedDef.label}</span> → intents {result.matchedDef.intents.join(", ")} → skills {result.matchedDef.skill_ids.join(", ")}</p>
                )}
              </Card>

              <Card>
                <CardHeader title="Resolved skill plan" subtitle={result.plan.stream_message} />
                <div className="space-y-1.5">
                  {result.plan.skills.map((s) => (
                    <div key={s.skill_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-phantix-700/30 px-3 py-2">
                      <span className="w-5 shrink-0 text-right font-mono text-[13px] text-slate-600">{s.rank}</span>
                      <span className={cx("min-w-0 flex-1 truncate font-mono text-[13px]", s.role === "primary" ? "text-gold-200" : "text-slate-200")} title={s.skill_id}>{s.skill_id}</span>
                      <span className="shrink-0 text-[12px] text-slate-500">{s.kind}</span>
                      {s.efficiency != null && <span className="shrink-0 font-mono text-[12px] text-emerald-400">eff {(s.efficiency * 100).toFixed(0)}%</span>}
                      {s.objective_score != null && <span className="shrink-0 font-mono text-[12px] text-slate-500">obj {(s.objective_score * 100).toFixed(0)}%</span>}
                      <span className={cx("chip shrink-0 !text-[11px]", s.body_loaded ? "text-emerald-300" : "text-slate-500")}>{s.body_loaded ? "Full" : "Card"}</span>
                      <span className="min-w-0 break-words text-[11px] text-slate-600">{s.match_reason}</span>
                    </div>
                  ))}
                </div>
                {result.plan.tools && result.plan.tools.to_provision_count > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="text-[12px] text-amber-300">Tools to provision:</span>
                    {result.plan.tools.to_provision.map((t) => <span key={t.tool} className="chip !text-[11px]">{t.tool} ({t.package}){t.required ? " · required" : ""}</span>)}
                  </div>
                )}
              </Card>

              <Card className="!p-0 overflow-hidden">
                <div className="px-5 pt-5">
                  <CardHeader title="System prompt preview" subtitle="What the runner receives. Staff only. Users never see this." />
                </div>
                <pre className="max-h-[360px] overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words bg-phantix-950/70 p-4 font-mono text-[13px] leading-5 text-slate-300">{result.prompt}</pre>
              </Card>
            </>
          )}
        </div>

        {/* ── Right: reference (stacked dropdowns at top) ───────────────────────────── */}
        <div className="min-w-0 space-y-3">
          <Accordion id="signals" title="Intent signals" defaultOpen={false}>
            <div className="space-y-1.5">
              {INTENT_SIGNALS.map((s) => (
                <div key={s.intent} className="rounded-md border border-phantix-700/30 px-2.5 py-1.5">
                  <p className="font-mono text-[12px] text-gold-300">{s.intent}</p>
                  <p className="mt-0.5 text-[12px] text-slate-500">tokens: {s.tokens.join(", ")}</p>
                  <p className="text-[12px] text-slate-600">kinds: {s.kinds.join(", ")}</p>
                </div>
              ))}
            </div>
          </Accordion>

          <Accordion id="appendix" title="Forbidden appendix" defaultOpen={false}>
            <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-4 text-slate-400">{FORBIDDEN_APPENDIX}</pre>
          </Accordion>

          <Accordion id="tools" title="Tool instructions" defaultOpen={false}>
            <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-4 text-slate-400">{TOOL_INSTRUCTIONS}</pre>
          </Accordion>

          <p className="flex items-start gap-1.5 text-[12px] leading-4 text-slate-600">
            <ShieldCheck size={11} className="mt-0.5 shrink-0 text-gold-400" />
            Users only ever see thinking → intent restated → skill resolved → execution. These blocks and the system prompt are staff-only and never surface in agent responses.
          </p>
        </div>
      </div>

      {/* Prompt library — below resolve objective (full width) */}
      <Card>
        <CardHeader title="Prompt library" subtitle="Prompts that the objective of a user can resolve to." action={<button onClick={() => { setDraft({ key: "", label: "", system_prompt: "", user_template: "", intents: [], skill_ids: [], is_active: true }); setEditing({ key: "", label: "", system_prompt: "", user_template: "", intents: [], skill_ids: [], is_active: true }); }} className="btn-primary !px-2.5 !py-1 !text-[13px]"><Plus size={12} className="mr-1 inline" /> Add</button>} />
        {editing && (
          <div className="mb-3 space-y-2 rounded-lg border border-phantix-700/40 bg-phantix-950/50 p-3">
            <input value={draft?.label ?? ""} onChange={(e) => setDraft({ ...draft!, label: e.target.value })} placeholder="Label, for example VAPT web application" className="w-full rounded-md border border-phantix-700/50 bg-phantix-950/70 px-2 py-1.5 text-xs text-slate-200 outline-none" />
            <input value={draft?.key ?? ""} onChange={(e) => setDraft({ ...draft!, key: e.target.value })} placeholder="key (e.g. vapt_web)" className="w-full rounded-md border border-phantix-700/50 bg-phantix-950/70 px-2 py-1.5 font-mono text-xs text-slate-200 outline-none" />
            <textarea
              value={draft?.system_prompt ?? ""}
              onChange={(e) => {
                setDraft({ ...draft!, system_prompt: e.target.value });
                const el = e.currentTarget;
                el.style.height = "auto";
                const newH = Math.min(el.scrollHeight, 120);
                el.style.height = `${newH}px`;
              }}
              rows={3}
              placeholder="System prompt that guides execution"
              className="w-full resize-none rounded-md border border-phantix-700/50 bg-phantix-950/70 px-2 py-1.5 font-mono text-[13px] text-slate-200 outline-none overflow-hidden"
              style={{ minHeight: "60px", maxHeight: "120px" }}
            />
            <input value={draft?.intents.join(", ") ?? ""} onChange={(e) => setDraft({ ...draft!, intents: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="Intents (comma) e.g. vapt, web" className="w-full rounded-md border border-phantix-700/50 bg-phantix-950/70 px-2 py-1.5 text-xs text-slate-200 outline-none" />
            <input value={draft?.skill_ids.join(", ") ?? ""} onChange={(e) => setDraft({ ...draft!, skill_ids: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="Skill ids (comma) e.g. agi.web.idor-check" className="w-full rounded-md border border-phantix-700/50 bg-phantix-950/70 px-2 py-1.5 font-mono text-xs text-slate-200 outline-none" />
            <div className="flex gap-2">
              <button onClick={saveDef} className="btn-primary flex-1 !px-2 !py-1 !text-[13px]"><Check size={11} className="mr-1 inline" /> Save</button>
              <button onClick={() => { setEditing(null); setDraft(null); }} className="btn-ghost flex-1 !px-2 !py-1 !text-[13px]"><X size={11} className="mr-1 inline" /> Cancel</button>
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          {defs.map((d) => (
            <div key={d.key} className={cx("rounded-lg border px-3 py-2", d.is_active ? "border-phantix-700/40 bg-phantix-900/40" : "border-phantix-700/30 bg-phantix-950/40 opacity-60")}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold text-slate-200">{d.label}</span>
                <span className="chip !text-[11px]">{d.is_active ? "active" : "off"}</span>
                <button onClick={() => { setEditing(d); setDraft({ ...d }); }} className="text-slate-500 hover:text-slate-200" title="Edit"><Pencil size={11} /></button>
                <button onClick={() => toggleDef(d.key)} className="text-slate-500 hover:text-gold-300" title="Toggle">{d.is_active ? <X size={11} /> : <Check size={11} />}</button>
                <button onClick={() => removeDef(d.key)} className="text-slate-500 hover:text-severity-critical" title="Delete"><Trash2 size={11} /></button>
              </div>
              <p className="mt-1 line-clamp-2 break-words text-[12px] leading-4 text-slate-500">{d.system_prompt}</p>
              <p className="mt-1 break-words font-mono text-[11px] text-slate-600">{d.intents.join(", ")} → {d.skill_ids.join(", ")}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Accordion({ id, title, children, defaultOpen }: { id: string; title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <Card className="!p-0 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left">
        {open ? <ChevronDown size={13} className="text-slate-500" /> : <ChevronRight size={13} className="text-slate-500" />}
        <span className="text-[13px] font-semibold text-slate-200">{title}</span>
        <Brain size={11} className="ml-auto text-slate-600" />
      </button>
      {open && <div className="border-t border-phantix-700/30 px-3.5 py-2.5">{children}</div>}
    </Card>
  );
}
