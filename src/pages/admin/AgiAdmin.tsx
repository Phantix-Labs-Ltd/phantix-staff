import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck, Activity, RefreshCw, Play, Square, Send, Plus, Loader2,
  Globe2, Crosshair, Boxes, FileText, Wrench, Users, Terminal, CheckCircle2, XCircle,
  Brain, GitBranch, ShieldAlert, Eye, X, Clock, Pencil, SlidersHorizontal, BookOpen, Search, ArrowLeft, Radar, CornerUpLeft, Sparkles,
} from "lucide-react";
import { PageHeader, Card, CardHeader, CollapsibleCard, StatCard, StatusBadge, SeverityBadge, TableSkeleton, EmptyState, Tabs, Modal } from "@/components/ui";
import { VerificationBadge } from "@/components/VerificationBadge";
import { AGI_CONTRIBUTOR_GUIDE_MD } from "@/lib/agiContributorGuide";
import { ContributorGuideView } from "@/components/ContributorGuideView";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE } from "@/lib/api";
import { cx, formatDateTime } from "@/lib/utils";
import { marked } from "marked";
import AgiConsole from "@/components/AgiConsole";
import { useChatSend } from "@/lib/useChatSend";
import {
  loadAgiStatus, loadAgiEngagements, createAgiEngagement, patchAgiEngagement, startAgiSession, stopAgiSession, loadActiveAgiSession,
  getAgiSession, agiChat, loadAgiTranscript, loadAgiPendingActions, decideAgiAction,
  loadAgiToolInstalls, decideAgiToolInstall, loadAgiGrants, setAgiGrant,
  loadAgiPolicies, loadAgiActivePolicy, publishAgiPolicy,
  loadAgiSkills, upsertAgiSkill, resolvedAgiSkills, loadAgiFindings, promoteAgiFinding, setAgiFindingStatus,
  prioritizeAgiSkills, type AgiSkillPrioritizeResult,
  setAgiCredentials, setAgiRegistration, getAgiPreflight, provideAgiInfo, provideAgiOtp, runAgiShell, listAgiJobs,
  agiErrorDetail, streamAgiSession, loadAgiEngineCatalog, loadAgiEngineLearning, loadAgiSessionJob, loadAgiApkAssets, trainAgiSession,
  loadAgiSessionSkillPlan, normalizeAgiLoop, answerAgiClarification,
  pauseAgiSession, resumeAgiSession,
  AGI_PILOT, agiHardStopRemaining, agiPilotStatusCopy, isCustomerAgiFindingVisible,
  readAgiPilotPosture,
} from "@/lib/agi";
import { EngineLearningPanel, EngineSnapshotCards, JobCoveragePanel, EngineCallList, AgiSkillPlanBanner, AgiToolsToProvisionStrip, CollapseCard } from "@/components/AgiCoevolution";
import AgiPrompts from "@/components/AgiPrompts";
import { AgentGuidancePanel } from "@/components/AgentGuidancePanel";
import { openClarificationFrom } from "@/lib/agiStreamGroup";
import type { AgiEngineCapability, AgiSessionJob, AgiSkillPlan, AgiToolPlan, AgiToolToProvision, EngineCallEvent } from "@/lib/types";
import type {
  AgiAction, AgiEngagement, AgiFinding, AgiPolicy, AgiSession, AgiSkill, AgiToolInstallRequest, AgiTranscriptChunk,
} from "@/lib/types";

// Auto-growing textarea: expands as the operator types so long allowlists,
// rules of engagement, and instructions are never cramped into a fixed box.
function AutoGrow(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { minRows = 3, className, value, style, ...rest } = props;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const min = (minRows ?? 3) * 20 + 16;
    el.style.height = `${Math.max(min, el.scrollHeight)}px`;
  }, [value, minRows]);
  return <textarea ref={ref} {...rest} value={value} className={className} style={{ resize: "vertical", overflow: "hidden", ...style }} />;
}

const DEFAULT_ENG_CONFIG: Record<string, unknown> = {
  prompts: {},
  tools: ["httpx", "nmap_safe", "nuclei_safe"],
  skills: { auto_select: true, auto_select_limit: 6 },
};

function repairTarget(raw: string): string {
  return raw
    .replace(/^(https?:)\s*\/+(?!\/)/i, "$1//")
    .replace(/^(https?:)\/(?!\/)/i, "$1//");
}

function AllowlistEditor({
  value,
  onChange,
  fieldClass,
}: {
  value: string;
  onChange: (v: string) => void;
  fieldClass: string;
}) {
  const lines = value.length === 0 ? [""] : value.split("\n");
  const setLine = (i: number, next: string) => {
    const copy = [...lines];
    copy[i] = repairTarget(next);
    onChange(copy.join("\n"));
  };
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={line}
            onChange={(e) => setLine(i, e.target.value)}
            placeholder={i === 0 ? "https://app.example.com" : "https://…"}
            className={cx(fieldClass, "font-mono text-[13px]")}
          />
          {lines.length > 1 && (
            <button type="button" onClick={() => onChange(lines.filter((_, idx) => idx !== i).join("\n"))} className="rounded-lg p-2 text-slate-500 hover:bg-phantix-800/70 hover:text-slate-200" aria-label="Remove target">
              <X size={13} />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...lines, ""].join("\n"))} className="btn-ghost !px-2 !py-1 !text-[13px]">
        <Plus size={12} className="mr-1 inline" /> Add target
      </button>
    </div>
  );
}

// ── Terminal line renderer ────────────────────────────────────────────────────
function TxLine({ t, last }: { t: AgiTranscriptChunk; last: boolean }) {
  const isTool = t.role === "tool";
  const isSystem = t.role === "system";
  const isOperator = t.role === "operator";
  return (
    <div className={cx("flex", isOperator ? "justify-end" : "justify-start")}>
      <div className={cx(
        "max-w-[92%] rounded-md px-3 py-2 text-[13px] leading-5",
        isOperator && "bg-gold-400/15 border border-gold-400/20 text-gold-100",
        !isOperator && isTool && "border border-phantix-700/40 bg-phantix-950/70 font-mono text-[13px] text-slate-300",
        !isOperator && isSystem && "font-mono text-[13px] text-slate-500",
        !isOperator && !isTool && !isSystem && "border border-phantix-700/40 bg-phantix-800/60 text-slate-200",
      )}>
        {isTool && <span className="mb-1 flex items-center gap-1.5 text-[12px] text-gold-400"><Terminal size={10} /> {String((t.meta as any)?.tool ?? "tool")}</span>}
        {isSystem && <span className="mr-1 text-[12px] text-slate-600">engine</span>}
        <span className="whitespace-pre-wrap break-words">{t.content}</span>
        {last && !isOperator && <span className="ml-0.5 inline-block h-3 w-[6px] animate-pulse rounded-sm bg-gold-400/70 align-middle" />}
      </div>
    </div>
  );
}

function mapAgiFinding(r: import("@/lib/types").AgiFinding): import("@/lib/agiGraph").AgiFinding {
  return {
    id: String(r.id ?? r.finding_id ?? Math.random()),
    title: r.title,
    severity: (String(r.severity || "info").toLowerCase() as import("@/lib/types").Severity),
    target: r.target || "",
    status: (r.status === "verified" || r.status === "promoted" ? "validated" : r.status === "dismissed" ? "rejected" : "candidate"),
    evidence: typeof r.evidence === "object" && r.evidence ? r.evidence : { notes: typeof r.evidence === "string" ? r.evidence : r.notes || "" },
    highlight: r.highlight,
    report_highlight: r.report_highlight,
    business_impact: r.business_impact || r.impact_analysis?.business_impact || undefined,
    impact_level: r.impact_level || r.impact_analysis?.impact_level || undefined,
    verification: r.verification ?? undefined,
  };
}

// ── Session terminal (live stream + transcript poll + chat + approvals) ───────
function SessionTerminal({ session, engagement, onStopped }: { session: AgiSession; engagement: AgiEngagement | null; onStopped?: () => void }) {
  const { toast } = useStore();
  const [transcript, setTranscript] = useState<AgiTranscriptChunk[]>([]);
  const afterSeqRef = useRef(0);
  const pendingOpsRef = useRef<string[]>([]);
  const [actions, setActions] = useState<AgiAction[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(session.status === "running" || session.status === "provisioning");
  const [paused, setPaused] = useState(false);
  // Loop ended but the session is still resumable — distinct from session.status.
  const [loopStopped, setLoopStopped] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [deciding, setDeciding] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const [reasoning, setReasoning] = useState("");
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [turnMetrics, setTurnMetrics] = useState({ turns: 0, promptTokens: 0, completionTokens: 0, tools: 0, wallSeconds: 0 });
  const [workingOn, setWorkingOn] = useState<string | null>(null);
  const [liveFindings, setLiveFindings] = useState<import("@/lib/agiGraph").AgiFinding[]>([]);
  const [connError, setConnError] = useState<string | null>(null);
  const [overrideDrafts, setOverrideDrafts] = useState<Record<number, string>>({});
  const [showControls, setShowControls] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ tools: true, engines: true, session: true });
  const toggleSection = useCallback((key: string) => setCollapsed((p) => ({ ...p, [key]: !p[key] })), []);
  const expandAll = useCallback(() => setCollapsed({ skills: false, coverage: false, tools: false, engines: false, session: false }), []);
  const collapseAll = useCallback(() => setCollapsed({ skills: true, coverage: true, tools: true, engines: true, session: true }), []);
  const [job, setJob] = useState<AgiSessionJob | null>(null);
  const [engineCalls, setEngineCalls] = useState<EngineCallEvent[]>([]);
  const [skillPlan, setSkillPlan] = useState<AgiSkillPlan | null>(null);
  const [toolPlan, setToolPlan] = useState<AgiToolPlan | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chatSend = useChatSend();

  useEffect(() => {
    void loadAgiSessionSkillPlan(session.id).then(({ skill_plan, tools_to_provision }) => {
      if (skill_plan) setSkillPlan(skill_plan);
      if (tools_to_provision.length > 0) {
        setToolPlan({ available: [], to_provision: tools_to_provision, to_provision_count: tools_to_provision.length });
      }
    });
  }, [session.id]);

  const poll = useCallback(async (initialSeq = 0) => {
    try {
      const chunks = await loadAgiTranscript(session.id, afterSeqRef.current);
      if (chunks.length) {
        setTranscript((prev) => {
          const pend = pendingOpsRef.current;
          let taken = 0;
          const out: AgiTranscriptChunk[] = [];
          for (const c of chunks) {
            if (c.role === "operator" && taken < pend.length && pend[taken] === c.content) {
              taken += 1;
              continue;
            }
            out.push(c);
          }
          if (taken > 0) pendingOpsRef.current = pend.slice(taken);
          if (out.length === 0) return prev;
          return [...prev, ...out];
        });
        afterSeqRef.current = Math.max(afterSeqRef.current, ...chunks.map((c) => c.seq));
        setThinking(false);
        for (const c of chunks) {
          const ev = (c.meta as { event?: string } | null)?.event;
          const pl = c.meta as Record<string, unknown> | null;
          if (ev === "session_start" || ev === "skills_selected") {
            const skills = Array.isArray(pl?.skills) ? (pl.skills as AgiSkillPlan["skills"]) : [];
            const ids = Array.isArray(pl?.skill_ids) ? (pl.skill_ids as string[]) : [];
            if (skills.length || ids.length) {
              setSkillPlan((prev) => ({
                objective: typeof pl?.objective === "string" ? pl.objective : prev?.objective,
                intents: Array.isArray(pl?.intents) ? (pl.intents as string[]) : prev?.intents ?? [],
                skills: skills.length ? skills : prev?.skills ?? [],
                skill_ids: ids.length ? ids : skills.map((s) => s.skill_id),
                primary_skill_id: typeof pl?.primary_skill_id === "string" ? pl.primary_skill_id : prev?.primary_skill_id ?? null,
                count: Number(pl?.count ?? skills.length ?? prev?.count ?? 0),
                full_body_count: typeof pl?.full_body_count === "number" ? pl.full_body_count : prev?.full_body_count,
                stream_message: typeof pl?.stream_message === "string" ? pl.stream_message : prev?.stream_message,
                tools: (pl?.tools as AgiSkillPlan["tools"]) ?? prev?.tools,
              }));
            }
          } else if (ev === "tools_to_provision") {
            const list = Array.isArray(pl?.to_provision) ? (pl.to_provision as AgiToolToProvision[]) : [];
            if (list.length) setToolPlan({ available: Array.isArray(pl?.available) ? (pl.available as string[]) : [], to_provision: list, to_provision_count: list.length });
          }
        }
      }
      if (initialSeq === 0 && chunks.length) afterSeqRef.current = Math.max(afterSeqRef.current, ...chunks.map((c) => c.seq));
    } catch { /* transient */ }
  }, [session.id]);

  useEffect(() => {
    if (!running || paused) return;
    void poll(0);
    // Consolidated polling — previously five independent intervals (2.5s /
    // 3.5s / 4s / 4s / 8s ≈ 1.6 req/s while a session runs). Now two
    // staggered loops: transcript + pending actions every 3s, job + session +
    // findings every 6s (≈0.5 req/s) so the backend rate limiter isn't hit.
    const fast = setInterval(() => {
      void poll();
      loadAgiPendingActions(session.id).then(setActions).catch(() => { /* transient */ });
    }, DEMO_MODE ? 350 : 3000);
    const slow = setInterval(() => {
      loadAgiSessionJob(session.id).then(setJob).catch(() => { /* transient */ });
      (async () => {
        try {
          const s = await getAgiSession(session.id);
          if (!s) return;
          const loop = s.loop ? normalizeAgiLoop(s.loop) : null;
          if (loop?.working_on) setWorkingOn(loop.working_on);
          if (loop?.content && loop.event === "loop_progress") {
            setTranscript((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && last.content === loop.content) return prev;
              return [...prev, { seq: afterSeqRef.current + 1, role: "assistant", content: loop.content || "", meta: { kind: "turn_brief", event: "loop_progress" }, created_at: new Date().toISOString() }];
            });
          }
          if (s.loop_status === "stopped") { setLoopStopped(s.loop_stop_reason || "stopped"); setThinking(false); }
          else if (s.loop_status === "running") setLoopStopped(null);
          if (s.status === "stopped" || s.status === "torn_down" || s.status === "failed") setRunning(false);
        } catch { /* transient */ }
      })();
      loadAgiFindings(session.id).then((rows) => {
        setLiveFindings(rows.map(mapAgiFinding));
      }).catch(() => { /* transient */ });
    }, DEMO_MODE ? 700 : 6000);
    void loadAgiSessionJob(session.id).then(setJob);
    void loadAgiFindings(session.id).then((rows) => {
      setLiveFindings(rows.map(mapAgiFinding));
    }).catch(() => {});
    return () => { clearInterval(fast); clearInterval(slow); };
  }, [running, paused, session.id, poll]);

  // SSE live stream (staff) — loop_status / loop_progress are primary progress UI
  useEffect(() => {
    if (!running || DEMO_MODE) return;
    const controller = new AbortController();
    abortRef.current = controller;
    void streamAgiSession(session.id, (event, data) => {
      if (event === "reasoning") {
        try {
          const p = JSON.parse(String(data)) as { text?: string };
          const text = typeof p?.text === "string" ? p.text : String(data);
          if (text) { setReasoning((prev) => prev + text); setReasoningOpen(true); }
        } catch { /* ignore */ }
      }
      else if (event === "turn_metrics") {
        try {
          const m = JSON.parse(String(data)) as { turn?: number; prompt_tokens?: number; completion_tokens?: number; tools_run?: number; wall_seconds?: number };
          setTurnMetrics((prev) => ({
            turns: Math.max(prev.turns, Number(m.turn ?? prev.turns)),
            promptTokens: prev.promptTokens + Number(m.prompt_tokens ?? 0),
            completionTokens: prev.completionTokens + Number(m.completion_tokens ?? 0),
            tools: prev.tools + Number(m.tools_run ?? 0),
            wallSeconds: prev.wallSeconds + Number(m.wall_seconds ?? 0),
          }));
        } catch { /* ignore */ }
      }
      else if (event === "token") setThinking(true);
      else if (event === "assistant_done") { setThinking(false); setReasoning(""); void poll(0); }
      else if (event === "action_pending") { void poll(0); }
      else if (event === "loop_status" || event === "loop_progress") {
        try {
          const loop = normalizeAgiLoop(JSON.parse(String(data)));
          setLoopStopped(null);
          if (loop.working_on) setWorkingOn(loop.working_on);
          if (event === "loop_status") { setThinking(true); setReasoning(""); }
          if (event === "loop_progress") {
            setThinking(false);
            if (loop.content) {
              setTranscript((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && last.content === loop.content) return prev;
                return [...prev, { seq: afterSeqRef.current + 1, role: "assistant", content: loop.content || "", meta: { kind: "turn_brief", event: "loop_progress" }, created_at: new Date().toISOString() }];
              });
            }
            void poll(0);
          }
        } catch { /* ignore bad frames */ }
      }
      else if (event === "skill_handoff") {
        try {
          const p = JSON.parse(String(data)) as { title?: string; reason?: string; skill_id?: string };
          setWorkingOn(`Skill ${p.title || p.skill_id || "playbook"} handed to OpenCode. ${p.reason || "contractor"}`);
        } catch { /* ignore */ }
      }
      else if (event === "engine_call") {
        try {
          const parsed = JSON.parse(String(data)) as EngineCallEvent;
          setEngineCalls((prev) => [...prev.slice(-40), parsed]);
        } catch { /* ignore */ }
      }
      else if (event === "job_progress") { void loadAgiSessionJob(session.id).then(setJob); }
      else if (event === "finding" || event === "finding_verified") { void loadAgiFindings(session.id).then((rows) => {
        setLiveFindings(rows.map(mapAgiFinding));
      }).catch(() => {}); }
      else if (event === "skills_selected" || event === "session_start") {
        try {
          const parsed = JSON.parse(String(data)) as Partial<AgiSkillPlan> & { skills?: AgiSkillPlan["skills"] };
          if (parsed?.skills || parsed?.skill_ids || parsed?.stream_message) {
            setSkillPlan((prev) => ({
              objective: parsed.objective ?? prev?.objective,
              intents: parsed.intents ?? prev?.intents ?? [],
              skills: parsed.skills ?? prev?.skills ?? [],
              skill_ids: parsed.skill_ids ?? parsed.skills?.map((s) => s.skill_id) ?? prev?.skill_ids ?? [],
              primary_skill_id: parsed.primary_skill_id ?? prev?.primary_skill_id ?? null,
              count: parsed.count ?? parsed.skills?.length ?? prev?.count ?? 0,
              full_body_count: parsed.full_body_count ?? prev?.full_body_count,
              stream_message: parsed.stream_message ?? prev?.stream_message,
              tools: parsed.tools ?? prev?.tools,
            }));
          }
        } catch { /* ignore */ }
      }
      else if (event === "tools_to_provision") {
        try {
          const parsed = JSON.parse(String(data)) as { to_provision?: AgiToolToProvision[]; available?: string[]; message?: string };
          setToolPlan({
            available: parsed.available ?? [],
            to_provision: parsed.to_provision ?? [],
            to_provision_count: parsed.to_provision?.length ?? 0,
          });
        } catch { /* ignore */ }
      }
      else if (event === "campaign_done") {
        try {
          const p = JSON.parse(String(data)) as {
            found?: number;
            assets?: number;
            summary?: { elapsed?: number; categories?: string[] };
          };
          const cats = (p.summary?.categories || []).join(", ") || "none";
          setTranscript((prev) => [
            ...prev,
            {
              seq: -2 - prev.filter((r) => r.seq < 0).length,
              role: "system",
              content:
                `Campaign complete: ${p.found ?? 0} finding(s) across ${p.assets ?? 0} asset(s) ` +
                `in ${p.summary?.elapsed ?? "?"}s. Categories: ${cats}`,
              meta: { kind: "campaign_done", event: "campaign_done", ...p },
              created_at: new Date().toISOString(),
            },
          ]);
        } catch { /* ignore */ }
      }
      else if (event === "decision_review") {
        try {
          const p = JSON.parse(String(data)) as {
            verdict?: string;
            findings?: number;
            unresolved?: string[];
            next?: string[];
            categories?: string[];
          };
          setTranscript((prev) => [
            ...prev,
            {
              seq: -2 - prev.filter((r) => r.seq < 0).length,
              role: "system",
              content:
                `Decision review. Verdict: ${p.verdict || "continue"}. ` +
                `${(p.unresolved || []).length} open lead(s); next: ` +
                `${(p.next || []).join(", ") || "none"}`,
              meta: { kind: "decision_review", event: "decision_review", ...p },
              created_at: new Date().toISOString(),
            },
          ]);
        } catch { /* ignore */ }
      }
      else if (event === "verify_all") {
        try {
          const p = JSON.parse(String(data)) as {
            count?: number;
            verified?: number;
            dismissed?: number;
            inconclusive?: number;
          };
          if (typeof p.count === "number") {
            setTranscript((prev) => [
              ...prev,
              {
                seq: -2 - prev.filter((r) => r.seq < 0).length,
                role: "system",
                content:
                  `Verification: ${p.count} finding(s): ${p.verified ?? 0} confirmed, ` +
                  `${p.dismissed ?? 0} dismissed, ${p.inconclusive ?? 0} inconclusive`,
                meta: { kind: "verify_all", event: "verify_all", ...p },
                created_at: new Date().toISOString(),
              },
            ]);
            void loadAgiFindings(session.id).then((rows) => setLiveFindings(rows.map(mapAgiFinding))).catch(() => {});
          }
        } catch { /* ignore */ }
      }
      else if (event === "finding_dropped") {
        try {
          const p = JSON.parse(String(data)) as {
            title?: string;
            verdict?: string;
            confidence?: number;
            reason?: string;
          };
          setTranscript((prev) => [
            ...prev,
            {
              seq: -2 - prev.filter((r) => r.seq < 0).length,
              role: "system",
              content:
                `Candidate dropped as a non-vulnerability. "${p.title || "candidate"}" ` +
                `(${p.verdict || p.reason || "control"}, confidence ${p.confidence ?? "?"})`,
              meta: { kind: "finding_dropped", event: "finding_dropped", ...p },
              created_at: new Date().toISOString(),
            },
          ]);
        } catch { /* ignore */ }
      }
      else if (event === "loop_paused") {
        setPaused(true);
        setThinking(false);
      }
      else if (event === "loop_resumed") {
        setPaused(false);
      }
      else if (event === "teardown") { setRunning(false); setLoopStopped(null); }
      else if (event === "loop_stop") {
        // Loop ended; keep the session alive so the operator can resume by chat.
        let reason = "stopped";
        try { reason = String((JSON.parse(String(data)) as { reason?: string })?.reason || "stopped"); } catch { /* ignore */ }
        setLoopStopped(reason);
        setThinking(false);
      }
    }, controller.signal).catch(() => { /* SSE fallback: transcript poll continues */ });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, session.id]);

  // Pause/resume must hit the runner: a local-only toggle would show "paused"
  // while the agent kept spending credits and probing.
  const togglePause = async () => {
    const next = !paused;
    setPaused(next);
    try {
      const s = next ? await pauseAgiSession(session.id) : await resumeAgiSession(session.id);
      setPaused(s.status === "paused");
      toast(
        "success",
        next ? "Agent paused" : "Agent resumed",
        next
          ? "Runner confirmed: no model tokens or shell work start while paused."
          : "The loop continues from where it stopped.",
      );
    } catch (e) {
      setPaused(!next); // never show a paused UI the runner did not confirm
      toast("error", next ? "Pause failed" : "Resume failed", agiErrorDetail(e).message);
    }
  };

  const dispatchChat = async (msg: string) => {
    if (!running || paused) return;
    setLoopStopped(null);
    setConnError(null);
    pendingOpsRef.current.push(msg);
    setTranscript((prev) => [...prev, { seq: -1, role: "operator", content: msg, meta: null, created_at: new Date().toISOString() }]);
    setThinking(true);
    try {
      const res = await agiChat(session.id, msg);
      if (res.loop?.working_on) setWorkingOn(res.loop.working_on);
      if (res.queued) {
        // Loop already in flight — show reply, do not open a second thinking state
        setThinking(false);
      }
      if (res.reply && !res.queued) {
        setTranscript((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.content === res.reply) return prev;
          return [...prev, { seq: afterSeqRef.current + 1, role: "assistant", content: res.reply || "", meta: { kind: res.reply_kind || "assistant" }, created_at: new Date().toISOString() }];
        });
      } else if (res.reply && res.queued) {
        setTranscript((prev) => [...prev, { seq: afterSeqRef.current + 1, role: "system", content: res.reply || "Queued for the next turn.", meta: { kind: "queued" }, created_at: new Date().toISOString() }]);
      }
      if (typeof res.transcript_seq === "number" && res.transcript_seq > afterSeqRef.current) {
        afterSeqRef.current = res.transcript_seq;
      }
      void poll(0);
    } catch (e) {
      setConnError(agiErrorDetail(e).message);
      toast("error", "Chat failed", agiErrorDetail(e).message);
    } finally {
      setThinking(false);
    }
  };

  const send = () => {
    const msg = input.trim();
    if (!msg || !running || paused) return;
    setInput("");
    chatSend.requestSend(msg, dispatchChat);
  };

  // ── Clarification asks (ASK_OPERATOR) ────────────────────────────────────
  const [answeredClarificationId, setAnsweredClarificationId] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);
  const openClarification = useMemo(
    () => openClarificationFrom(session, transcript, answeredClarificationId),
    [session, transcript, answeredClarificationId],
  );

  const handleAnswer = useCallback(async (clarificationId: string, answer: string) => {
    setAnswering(true);
    setThinking(false);
    try {
      await answerAgiClarification(session.id, { clarification_id: clarificationId, answer });
      setAnsweredClarificationId(clarificationId);
      toast("success", "Clarification answered", "The agent is resuming the assessment.");
      void poll();
    } catch (e) {
      toast("error", "Answer failed", agiErrorDetail(e).message);
    } finally {
      setAnswering(false);
    }
  }, [session.id, toast, poll]);

  const stop = async () => {
    setStopping(true);
    try {
      const s = await stopAgiSession(session.id);
      setRunning(false);
      setThinking(false);
      toast("success", "Session stopped", s.status === "stopped" ? "Container destroyed" : s.status);
      onStopped?.();
    } catch (e) { toast("error", "Stop failed", agiErrorDetail(e).message); }
    finally { setStopping(false); }
  };

  const decide = async (action: AgiAction, approve: boolean, overrideCmd?: string) => {
    setDeciding(action.id);
    try {
      const notes = !approve ? "" : overrideCmd && overrideCmd !== action.proposed_command ? `Override: ${overrideCmd}` : "Within ROE";
      await decideAgiAction(action.id, approve, notes, true);
      setActions((prev) => prev.filter((x) => x.id !== action.id));
      setOverrideDrafts((prev) => {
        const next = { ...prev };
        delete next[action.id];
        return next;
      });
      toast("success", approve ? "Action approved" : "Action rejected");
    } catch (e) { toast("error", "Decision failed", agiErrorDetail(e).message); }
    finally { setDeciding(null); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-phantix-700/40 bg-phantix-950/80 px-3 py-2">
        <button onClick={() => setShowControls((v) => !v)} className={cx("btn-ghost !px-2.5 !py-1.5 !text-[13px]", showControls && "text-gold-300")}><SlidersHorizontal size={12} className="mr-1 inline" /> Controls</button>
        <button onClick={() => void poll()} className="btn-ghost !px-2.5 !py-1.5 !text-[13px]"><RefreshCw size={12} /> Refresh</button>
        <button onClick={() => void trainAgiSession(session.id).then(() => toast("success", "Train queued"))} className="btn-ghost !px-2.5 !py-1.5 !text-[13px]">Train now</button>
        <button onClick={() => onStopped?.()} className="btn-ghost !px-2.5 !py-1.5 !text-[13px]" title="Back to session selection"><CornerUpLeft size={12} className="mr-1 inline" /> Sessions</button>
        <span className="ml-auto min-w-0 truncate font-mono text-[12px] text-slate-500" title={`engagement #${session.engagement_id}${session.container_id ? ` · ${session.container_id}` : ""}`}>engagement #{session.engagement_id}{session.container_id ? ` · ${session.container_id}` : ""}</span>
      </div>
      <div className="min-h-0 flex-1">
        <AgiConsole
          running={running}
          paused={paused}
          onTogglePause={() => void togglePause()}
          stopping={stopping}
          onStop={() => void stop()}
          onExit={() => onStopped?.()}
          session={session}
          engagement={engagement}
          transcript={transcript}
          actions={actions}
          actionBusy={deciding}
          onDecide={(a, ok, cmd) => void decide(a, ok, cmd)}
          thinking={thinking}
          reasoning={reasoning}
          reasoningOpen={reasoningOpen}
          onToggleReasoning={() => setReasoningOpen((v) => !v)}
          turnMetrics={turnMetrics}
          loopStopped={loopStopped}
          workingOn={workingOn}
          liveFindings={liveFindings}
          onFindingVerify={(findingId, verified) => {
            if (!session?.id) return Promise.resolve(false);
            return setAgiFindingStatus(session.id, findingId, verified ? "verified" : "dismissed").then((r) => {
              void loadAgiFindings(session.id).then((rows) => setLiveFindings(rows.map(mapAgiFinding))).catch(() => {});
              return !!r?.ok;
            });
          }}
          connError={connError}
          instruction={input}
          onInstruction={setInput}
          onSend={send}
          sendHint={chatSend.hint}
          clarification={openClarification}
          onAnswer={handleAnswer}
          policyBanner={null}
          overrideDrafts={overrideDrafts}
          onOverrideDraft={(id, cmd) => setOverrideDrafts((prev) => ({ ...prev, [id]: cmd }))}
          skillPlan={skillPlan}
          engineCalls={engineCalls}
        />
      </div>

      {showControls && (
        <div className="flex max-h-[46%] min-h-0 shrink-0 flex-col border-t border-phantix-700/40 bg-phantix-950/85">
          <div className="flex shrink-0 items-center gap-2 border-b border-phantix-700/40 px-3 py-2">
            <SlidersHorizontal size={13} className="text-gold-400" />
            <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-300">Controls</p>
            <span className="ml-auto flex items-center gap-1.5">
              <button onClick={expandAll} className="btn-ghost !px-2 !py-1 !text-[12px]">Expand all</button>
              <button onClick={collapseAll} className="btn-ghost !px-2 !py-1 !text-[12px]">Collapse all</button>
            </span>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            <AgiSkillPlanBanner plan={skillPlan} open={!collapsed.skills} onToggle={() => toggleSection("skills")} />
            <JobCoveragePanel sessionId={session.id} job={job} onRefresh={() => void loadAgiSessionJob(session.id).then(setJob)} open={!collapsed.coverage} onToggle={() => toggleSection("coverage")} />
            <AgiToolsToProvisionStrip toolPlan={toolPlan} open={!collapsed.tools} onToggle={() => toggleSection("tools")} />
            <EngineCallList events={engineCalls} open={!collapsed.engines} onToggle={() => toggleSection("engines")} />
            <CollapseCard title="Session controls" icon={<ShieldCheck size={13} className="text-slate-400" />} open={!collapsed.session} onToggle={() => toggleSection("session")}>
              <SessionControls session={session} running={running} />
            </CollapseCard>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Session controls (preflight / credentials / registration / OTP / shell / jobs) ──
function SessionControls({ session, running }: { session: AgiSession; running: boolean }) {
  const { toast } = useStore();
  const [tab, setTab] = useState<"preflight" | "auth" | "otp" | "shell">("preflight");

  // Preflight
  const [preflight, setPreflight] = useState<any>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [infoFields, setInfoFields] = useState<Record<string, string>>({});
  const [infoNote, setInfoNote] = useState("");
  const [infoSaving, setInfoSaving] = useState(false);

  // Credentials
  const [creds, setCreds] = useState({ login_url: "", username: "", password: "" });
  const [credsSaving, setCredsSaving] = useState(false);

  // Registration
  const [reg, setReg] = useState({ register_url: "", email: "", username: "", password: "" });
  const [regSaving, setRegSaving] = useState(false);

  // OTP
  const [otp, setOtp] = useState("");
  const [otpJob, setOtpJob] = useState("");
  const [otpSaving, setOtpSaving] = useState(false);

  // Shell
  const [shellCmd, setShellCmd] = useState("");
  const [shellBg, setShellBg] = useState(false);
  const [shellWaitOtp, setShellWaitOtp] = useState(false);
  const [shellOut, setShellOut] = useState("");
  const [shellSaving, setShellSaving] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  const loadPreflight = useCallback(async () => {
    setPreflightLoading(true);
    try {
      const res = await getAgiPreflight(session.id);
      setPreflight(res.preflight);
      setInfoFields((prev) => {
        const next = { ...prev };
        (res.info_requests ?? []).forEach((r: any) => { if (!(r.key in next)) next[r.key] = ""; });
        return next;
      });
    } catch (e) { toast("error", "Preflight check failed", agiErrorDetail(e).message); }
    finally { setPreflightLoading(false); }
  }, [session.id, toast]);

  useEffect(() => { void loadPreflight(); }, [loadPreflight]);

  const submitInfo = async () => {
    const fields: Record<string, unknown> = {};
    (preflight?.info_requests ?? []).forEach((r: any) => {
      const v = (infoFields[r.key] ?? "").trim();
      if (r.key === "roe_confirmed") fields[r.key] = v.toLowerCase() === "true" || v === "yes";
      else if (v) fields[r.key] = v;
    });
    setInfoSaving(true);
    try {
      await provideAgiInfo(session.id, fields, infoNote);
      toast("success", "Info provided", "Re-checking preflight readiness…");
      await loadPreflight();
      setInfoNote("");
    } catch (e) { toast("error", "Info submit failed", agiErrorDetail(e).message); }
    finally { setInfoSaving(false); }
  };

  const saveCreds = async () => {
    if (!creds.login_url || !creds.username || !creds.password) { toast("error", "Login URL, username and password are required"); return; }
    setCredsSaving(true);
    try {
      await setAgiCredentials(session.id, creds);
      toast("success", "Credentials set", "Password redacted — never logged or returned.");
      setCreds({ login_url: "", username: "", password: "" });
    } catch (e) { toast("error", "Credentials failed", agiErrorDetail(e).message); }
    finally { setCredsSaving(false); }
  };

  const saveReg = async () => {
    if (!reg.register_url || !reg.password) { toast("error", "Register URL and password are required"); return; }
    setRegSaving(true);
    try {
      await setAgiRegistration(session.id, { register_url: reg.register_url, email: reg.email, username: reg.username, password: reg.password });
      toast("success", "Registration configured", "Approve the pending auth_register action to proceed.");
      setReg({ register_url: "", email: "", username: "", password: "" });
    } catch (e) { toast("error", "Registration failed", agiErrorDetail(e).message); }
    finally { setRegSaving(false); }
  };

  const sendOtp = async () => {
    if (!otp.trim()) { toast("error", "Enter the OTP / MFA code"); return; }
    setOtpSaving(true);
    try {
      await provideAgiOtp(session.id, otp.trim(), otpJob.trim() || undefined);
      toast("success", "OTP delivered", "Background job will continue.");
      setOtp("");
      setOtpJob("");
    } catch (e) { toast("error", "OTP failed", agiErrorDetail(e).message); }
    finally { setOtpSaving(false); }
  };

  const runShell = async () => {
    if (!shellCmd.trim()) { toast("error", "Enter a shell command"); return; }
    setShellSaving(true);
    try {
      const out = await runAgiShell(session.id, shellCmd.trim(), shellBg, shellWaitOtp);
      setShellOut(typeof out === "string" ? out : JSON.stringify(out));
      if (shellWaitOtp || shellBg) toast("success", "Background job started", "Track it under Jobs.");
      setShellCmd("");
    } catch (e) { toast("error", "Shell failed", agiErrorDetail(e).message); }
    finally { setShellSaving(false); }
  };

  const loadJobs = async () => {
    setJobsLoading(true);
    try { setJobs(await listAgiJobs(session.id)); }
    catch (e) { toast("error", "Jobs failed", agiErrorDetail(e).message); }
    finally { setJobsLoading(false); }
  };

  const ready = preflight?.ready === true;
  const requests: { key: string; label: string; hint?: string }[] = preflight?.info_requests ?? [];
  const field = "input !px-3 !py-2 text-xs";

  return (
    <div className="border-t border-phantix-700/40 bg-phantix-950/70 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {(["preflight", "auth", "otp", "shell"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx("rounded-lg px-2.5 py-1.5 text-[13px] transition-colors", tab === t ? "bg-phantix-800/80 text-white" : "text-slate-500 hover:text-slate-300")}>
            {t === "preflight" ? "Preflight" : t === "auth" ? "Auth (login / register)" : t === "otp" ? "OTP" : "Shell & jobs"}
          </button>
        ))}
      </div>

      {/* Preflight */}
      {tab === "preflight" && (
        <div className="space-y-2">
          {preflightLoading ? <p className="py-2 text-center text-[13px] text-slate-500">Checking skill readiness…</p> : ready ? (
            <p className="flex items-center gap-1.5 text-[13px] text-emerald-300"><CheckCircle2 size={12} /> {preflight?.message ?? "Preflight ready — no additional info required."}</p>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-severity-medium/30 bg-severity-medium/5 px-3 py-2">
                <ShieldCheck size={13} className="text-severity-medium" />
                <p className="text-[13px] text-amber-200">Additional information required to proceed with {preflight?.missing?.length ?? requests.length} field(s).</p>
                <button onClick={() => void loadPreflight()} className="ml-auto btn-ghost !px-2 !py-1 !text-[12px]"><RefreshCw size={11} /> Re-check</button>
              </div>
              {requests.map((r) => (
                <div key={r.key}>
                  <label className="mb-0.5 block text-[12px] font-semibold uppercase tracking-wider text-slate-400">{r.label}</label>
                  <input value={infoFields[r.key] ?? ""} onChange={(e) => setInfoFields((prev) => ({ ...prev, [r.key]: e.target.value }))} placeholder={r.hint ?? r.key} className={field} />
                </div>
              ))}
              <input value={infoNote} onChange={(e) => setInfoNote(e.target.value)} placeholder="Note (optional)" className={field} />
              <button onClick={() => void submitInfo()} disabled={infoSaving} className="btn-primary w-full !py-2 !text-[13px]">{infoSaving ? <Loader2 size={12} className="mr-1 inline animate-spin" /> : <Send size={12} className="mr-1 inline" />} Provide info and re-check</button>
            </>
          )}
        </div>
      )}

      {/* Auth */}
      {tab === "auth" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-md border border-phantix-700/40 p-3">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-400">Login (authenticated testing)</p>
            <input value={creds.login_url} onChange={(e) => setCreds({ ...creds, login_url: e.target.value })} placeholder="Login URL" className={field} />
            <input value={creds.username} onChange={(e) => setCreds({ ...creds, username: e.target.value })} placeholder="Username" className={field} />
            <input type="password" value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })} placeholder="Password" className={field} />
            <button onClick={() => void saveCreds()} disabled={credsSaving} className="btn-secondary w-full !py-2 !text-[13px]">{credsSaving ? <Loader2 size={12} className="mr-1 inline animate-spin" /> : <ShieldCheck size={12} className="mr-1 inline" />} Set credentials</button>
            <p className="text-[12px] text-slate-500">Password is never returned by the API or written to transcripts.</p>
          </div>
          <div className="space-y-2 rounded-md border border-phantix-700/40 p-3">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-400">Test-user registration</p>
            <input value={reg.register_url} onChange={(e) => setReg({ ...reg, register_url: e.target.value })} placeholder="Register URL" className={field} />
            <input value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} placeholder="Email (optional)" className={field} />
            <input value={reg.username} onChange={(e) => setReg({ ...reg, username: e.target.value })} placeholder="Username (optional)" className={field} />
            <input type="password" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} placeholder="Password" className={field} />
            <button onClick={() => void saveReg()} disabled={regSaving} className="btn-secondary w-full !py-2 !text-[13px]">{regSaving ? <Loader2 size={12} className="mr-1 inline animate-spin" /> : <Users size={12} className="mr-1 inline" />} Configure registration</button>
            <p className="text-[12px] text-slate-500">Then approve the pending <span className="font-mono text-gold-300">auth_register</span> action above.</p>
          </div>
        </div>
      )}

      {/* OTP */}
      {tab === "otp" && (
        <div className="space-y-2">
          <p className="text-[13px] text-slate-400">Deliver an MFA or OTP code to a waiting background job in the container.</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <label className="mb-0.5 block text-[12px] font-semibold uppercase tracking-wider text-slate-400">OTP or MFA code</label>
              <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="e.g. 123456" className={field} />
            </div>
            <div className="flex-1">
              <label className="mb-0.5 block text-[12px] font-semibold uppercase tracking-wider text-slate-400">Job id (optional)</label>
              <input value={otpJob} onChange={(e) => setOtpJob(e.target.value)} placeholder="job id for the waiting wait_otp job" className={field} />
            </div>
            <button onClick={() => void sendOtp()} disabled={otpSaving} className="btn-primary !px-4 !py-2 !text-[13px]">{otpSaving ? <Loader2 size={12} className="mr-1 inline animate-spin" /> : <Send size={12} className="mr-1 inline" />} Deliver OTP</button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-slate-500">The code is delivered to the container job; it is not written to the transcript.</p>
            <button onClick={() => void loadJobs()} className="btn-ghost !px-2 !py-1 !text-[12px]"><RefreshCw size={11} /> Jobs</button>
          </div>
        </div>
      )}

      {/* Shell */}
      {tab === "shell" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <label className="mb-0.5 block text-[12px] font-semibold uppercase tracking-wider text-slate-400">Command (inside container)</label>
              <input value={shellCmd} onChange={(e) => setShellCmd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runShell(); }} placeholder="e.g. nmap -Pn target.example" className={field} />
            </div>
            <label className="flex items-center gap-1.5 text-[13px] text-slate-400"><input type="checkbox" checked={shellBg} onChange={(e) => setShellBg(e.target.checked)} className="accent-[rgb(var(--gold-400))]" /> Background</label>
            <label className="flex items-center gap-1.5 text-[13px] text-slate-400"><input type="checkbox" checked={shellWaitOtp} onChange={(e) => setShellWaitOtp(e.target.checked)} className="accent-[rgb(var(--gold-400))]" /> Wait for OTP</label>
            <button onClick={() => void runShell()} disabled={shellSaving || !running} className="btn-primary !px-4 !py-2 !text-[13px]">{shellSaving ? <Loader2 size={12} className="mr-1 inline animate-spin" /> : <Terminal size={12} className="mr-1 inline" />} Run</button>
          </div>
          {shellOut && <pre className="max-h-40 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all rounded-lg bg-phantix-950/80 border border-phantix-700/40 p-2.5 font-mono text-[13px] text-slate-300">{shellOut}</pre>}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Background jobs</p>
              <button onClick={() => void loadJobs()} className="btn-ghost !px-2 !py-1 !text-[12px]"><RefreshCw size={11} /> Refresh</button>
            </div>
            {jobsLoading ? <p className="text-[13px] text-slate-500">Loading jobs…</p> : jobs.length === 0 ? <p className="text-[13px] text-slate-600">No background jobs.</p> : (
              <div className="space-y-1.5">
                {jobs.map((j, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-phantix-950/60 px-2.5 py-2 text-[13px]">
                    <span className="min-w-0 break-all font-mono text-slate-300">{String(j.command ?? j.job_id ?? "job")}</span>
                    {j.waiting_otp && <span className="chip !text-[11px] border-severity-medium/30 bg-severity-medium/10 text-severity-medium">waiting OTP</span>}
                    <span className="ml-auto text-[12px] capitalize text-slate-500">{String(j.status ?? "running")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { EngagementContextFields, TestingModePicker } from "../../components/EngagementContextFields";
import {
  TESTING_MODES,
  DEFAULT_TESTING_MODE,
  EMPTY_ENGAGEMENT_CONTEXT,
  buildEngagementConfig,
  type EngagementContext,
  type TestingMode,
} from "../../lib/testingMode";

// ── Engagement create modal ───────────────────────────────────────────────────
function EngagementForm({ orgs, onCreated }: { orgs: { id: number; name: string }[]; onCreated: (e: AgiEngagement) => void }) {
  const { toast } = useStore();
  const [form, setForm] = useState({ organization_id: orgs[0]?.id ?? 0, name: "", description: "", allowlist: "", forbidden: "dos\nransomware\ndata_exfil_bulk", roe: "", max_minutes: AGI_PILOT.defaultHardStopMinutes, environment: "staging" as "staging" | "production", production_ack: false, mobile_apk_asset_id: 0 });
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<TestingMode>(DEFAULT_TESTING_MODE);
  const [ctx, setCtx] = useState<EngagementContext>(EMPTY_ENGAGEMENT_CONTEXT);
  const [apks, setApks] = useState<{ id: number; name: string; value: string }[]>([]);

  useEffect(() => {
    if (!form.organization_id) { setApks([]); return; }
    void loadAgiApkAssets(form.organization_id, form.environment).then(setApks);
  }, [form.organization_id, form.environment]);

  const create = async () => {
    const targets = form.allowlist.split(/[\n,]+/).map((s) => repairTarget(s.trim())).filter(Boolean);
    if (!form.name.trim() || targets.length === 0 || !form.organization_id) {
      toast("error", "Organization, name and at least one target are required");
      return;
    }
    if (form.environment === "production" && !form.production_ack) {
      toast("error", "Production requires acknowledgement", "Confirm you are authorized to test production targets.");
      return;
    }
    setCreating(true);
    try {
      const eng = await createAgiEngagement({
        organization_id: Number(form.organization_id),
        name: form.name.trim(),
        description: form.description.trim(),
        scope: {
          target_allowlist: targets,
          forbidden_actions: form.forbidden.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
          rules_of_engagement: form.roe.trim(),
          max_session_minutes: Number(form.max_minutes) || AGI_PILOT.defaultHardStopMinutes,
          target_environment: form.environment,
          production_ack: form.environment === "production" ? form.production_ack : false,
          mobile_apk_asset_id: form.mobile_apk_asset_id || undefined,
        },
        config: buildEngagementConfig(mode, ctx, DEFAULT_ENG_CONFIG),
      });
      toast("success", "Engagement created", eng.name);
      onCreated(eng);
    } catch (e) {
      const { message, code } = agiErrorDetail(e);
      if (code === "scope_empty") toast("error", "Scope required", "Add at least one target to the allowlist.");
      else if (code === "production_ack_required") toast("error", "Production requires acknowledgement", "Confirm you are authorized to test production targets.");
      else if (code === "apk_selection_required") toast("error", "APK required for mobile", "Pick a staging/production APK only if this is a mobile pentest.");
      else if (code === "apk_environment_mismatch") toast("error", "APK environment mismatch", "Choose an APK tagged for the selected environment.");
      else toast("error", "Create failed", message);
    } finally { setCreating(false); }
  };

  const field = "input";

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[13px] font-semibold text-slate-400">Organization</label>
        <select value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: Number(e.target.value) })} className={field}>
          <option value={0}>Select organization…</option>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} (#{o.id})</option>)}
        </select>
      </div>
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name (e.g. Acme Q3 external web)" className={field} />
      <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description / ROE reference" className={field} />
      <div>
        <label className="mb-1 block text-[13px] font-semibold text-slate-400">Target environment</label>
        <div className="flex gap-2">
          {(["staging", "production"] as const).map((env) => (
            <label key={env} className={cx("flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors", form.environment === env ? "border-gold-400/50 bg-gold-400/10 text-gold-200" : "border-phantix-700/50 bg-phantix-950/60 text-slate-300")}>
              <input type="radio" name="target_environment" checked={form.environment === env} onChange={() => setForm({ ...form, environment: env, production_ack: false })} className="accent-[rgb(var(--gold-400))]" />
              <span className="capitalize">{env}</span>
            </label>
          ))}
        </div>
        <div className="mt-2">
          <label className="mb-1 block text-[13px] font-semibold text-slate-400">Mobile APK, optional, only for mobile pentests</label>
          <select value={form.mobile_apk_asset_id} onChange={(e) => setForm({ ...form, mobile_apk_asset_id: Number(e.target.value) })} className={field}>
            <option value={0}>None — web / network only</option>
            {apks.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.value})</option>)}
          </select>
        </div>
        {form.environment === "production" && (
          <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-severity-medium/40 bg-severity-medium/10 px-3 py-2.5 text-[13px] text-slate-300">
            <input type="checkbox" checked={form.production_ack} onChange={(e) => setForm({ ...form, production_ack: e.target.checked })} className="mt-0.5 accent-[rgb(var(--severity-medium))]" />
            <span>I confirm the targets above are <strong>production</strong> and that I am authorized to test them.</span>
          </label>
        )}
      </div>
      <div>
        <label className="mb-1 block text-[13px] font-semibold text-slate-400">Target allowlist (immutable after create)</label>
        <AllowlistEditor value={form.allowlist} onChange={(allowlist) => setForm({ ...form, allowlist })} fieldClass={field} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[13px] font-semibold text-slate-400">Forbidden actions</label>
          <AutoGrow value={form.forbidden} onChange={(e) => setForm({ ...form, forbidden: e.target.value })} minRows={3} className={cx(field, "font-mono text-[13px]")} />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-semibold text-slate-400">Max session minutes</label>
          <input type="number" min={15} max={1440} value={form.max_minutes} onChange={(e) => setForm({ ...form, max_minutes: Number(e.target.value) })} className={field} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[13px] font-semibold text-slate-400">Rules of engagement</label>
        <AutoGrow value={form.roe} onChange={(e) => setForm({ ...form, roe: e.target.value })} minRows={3} placeholder="Business hours only. Stop on PII. No production DB writes." className={field} />
      </div>
      <div>
        <label className="mb-1 block text-[13px] font-semibold text-slate-400">Testing mode</label>
        <TestingModePicker value={mode} onChange={setMode} disabled={creating} />
        <p className="mt-1 text-[12px] leading-5 text-slate-500">{TESTING_MODES.find((m) => m.id === mode)?.description}</p>
      </div>
      <div>
        <label className="mb-1 block text-[13px] font-semibold text-slate-400">Engagement context. This answers the agent up front, so it does not stop to ask.</label>
        <div className="mt-1.5">
          <EngagementContextFields mode={mode} values={ctx} onChange={setCtx} disabled={creating} fieldClass={field} />
        </div>
      </div>
      <button onClick={() => void create()} disabled={creating} className="btn-primary w-full !py-2.5 !text-xs">
        {creating ? <Loader2 size={13} className="mr-1 inline animate-spin" /> : <Plus size={13} className="mr-1 inline" />} Create engagement
      </button>
    </div>
  );
}

// ── Findings panel ────────────────────────────────────────────────────────────
function FindingsPanel({ sessionId }: { sessionId: number }) {
  const { toast } = useStore();
  const findings = useResource<AgiFinding[]>(
    async () => { if (DEMO_MODE) return []; return loadAgiFindings(sessionId); },
    [] as AgiFinding[],
  );

  const act = async (f: AgiFinding, kind: "promote" | "verified" | "dismissed") => {
    const fid = String(f.finding_id ?? f.id ?? "");
    if (!fid) return;
    if (kind === "promote" && !isCustomerAgiFindingVisible(f as unknown as Record<string, unknown>)) {
      toast("warning", "Verify first", "Only confirmed/verified findings can be promoted to the risk register.");
      return;
    }
    try {
      if (kind === "promote") await promoteAgiFinding(sessionId, fid);
      else await setAgiFindingStatus(sessionId, fid, kind, kind === "verified" ? "Verified by operator" : "");
      toast("success", kind === "promote" ? "Finding promoted" : kind === "verified" ? "Finding verified" : "Finding dismissed");
      findings.refresh();
    } catch (e) { toast("error", "Action failed", agiErrorDetail(e).message); }
  };

  const evidenceText = (f: AgiFinding): string => {
    if (typeof f.evidence === "string") return f.evidence;
    if (f.evidence && typeof f.evidence === "object") {
      const n = f.evidence.notes || f.evidence.response || f.evidence.request || "";
      if (n) return n;
    }
    return f.notes || f.business_impact || "";
  };

  const evidenceParts = (f: AgiFinding): { request: string; response: string; notes: string } | null => {
    const e = f.evidence;
    if (!e || typeof e !== "object") return null;
    const request = typeof e.request === "string" ? e.request : "";
    const response = typeof e.response === "string" ? e.response : "";
    const notes = typeof e.notes === "string" ? e.notes : "";
    return request || response || notes ? { request, response, notes } : null;
  };

  const list = findings.data ?? [];
  return (
    <div className="space-y-2.5">
      {findings.loading && <TableSkeleton rows={2} />}
      {!findings.loading && list.length === 0 && <EmptyState icon={<ShieldAlert size={22} />} title="No findings yet" body="Evidence-backed findings from this session will appear here." />}
      {list.map((f) => (
        <div key={String(f.id)} className="rounded-md border border-phantix-700/40 bg-phantix-900/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={f.severity} />
            {(f.impact_level || f.impact_analysis?.impact_level) && (
              <span className="chip border-gold-400/30 bg-gold-400/10 text-[12px] text-gold-300">{f.impact_level || f.impact_analysis?.impact_level}</span>
            )}
            {(f.highlight || f.report_highlight) && (
              <span className="chip border-severity-critical/30 bg-severity-critical/10 text-[12px] text-severity-critical">highlight</span>
            )}
            <span className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-100">{f.title}</span>
            <span className="chip text-[12px] text-slate-500">{f.tool ?? f.source}</span>
            {f.risk_id && <span className="chip border-emerald-400/30 bg-emerald-400/10 text-[12px] text-emerald-300">risk #{f.risk_id}</span>}
          </div>
          {(f.business_impact || f.impact_analysis?.business_impact) && (
            <p className="mt-1.5 break-words text-xs leading-5 text-slate-300">{f.business_impact || f.impact_analysis?.business_impact}</p>
          )}
          {f.target && <p className="mt-1 break-all font-mono text-[13px] text-slate-500">{f.target}</p>}
          {f.verification && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-phantix-700/40 bg-phantix-950/50 px-2.5 py-1.5">
              <VerificationBadge verification={f.verification} />
              {f.verification.verifier && (
                <span className="font-mono text-[12px] text-slate-500">{f.verification.verifier}</span>
              )}
              {typeof f.verification.confidence === "number" && (
                <span className="text-[12px] text-slate-500">conf {f.verification.confidence.toFixed(2)}</span>
              )}
              {f.verification.needs_review && (
                <span className="chip border-severity-medium/30 bg-severity-medium/10 text-[12px] text-severity-medium">needs review</span>
              )}
              {f.verification.reason && (
                <span className="min-w-0 flex-1 break-words text-[12px] text-slate-400">{f.verification.reason}</span>
              )}
            </div>
          )}
          {(() => {
            const parts = evidenceParts(f);
            if (!parts) {
              return <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-400">{evidenceText(f)}</p>;
            }
            return (
              <div className="mt-2 space-y-2">
                {parts.notes && <p className="break-words text-xs leading-5 text-slate-400">{parts.notes}</p>}
                {parts.request && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Request</p>
                    <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-phantix-700/40 bg-phantix-950/60 p-2 font-mono text-[12px] leading-5 text-slate-300">{parts.request}</pre>
                  </div>
                )}
                {parts.response && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Response</p>
                    <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-phantix-700/40 bg-phantix-950/60 p-2 font-mono text-[12px] leading-5 text-slate-300">{parts.response}</pre>
                  </div>
                )}
              </div>
            );
          })()}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {!f.risk_id && isCustomerAgiFindingVisible(f as unknown as Record<string, unknown>) && (
              <button onClick={() => void act(f, "promote")} className="btn-secondary !px-2.5 !py-1.5 !text-[13px]"><GitBranch size={12} className="mr-1 inline" /> Promote to risk</button>
            )}
            {!f.risk_id && !isCustomerAgiFindingVisible(f as unknown as Record<string, unknown>) && (
              <span className="chip border-phantix-600/40 bg-phantix-800/50 text-[12px] text-slate-500">verify before promote</span>
            )}
            <button onClick={() => void act(f, "verified")} className="btn-ghost !px-2.5 !py-1.5 !text-[13px]"><CheckCircle2 size={12} className="mr-1 inline" /> Verify</button>
            <button onClick={() => void act(f, "dismissed")} className="btn-ghost !px-2.5 !py-1.5 !text-[13px] text-slate-500"><XCircle size={12} className="mr-1 inline" /> Dismiss</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function contextFromConfig(cfg: Record<string, unknown>): EngagementContext {
  return {
    process_flow: (cfg.process_flow as string) || "",
    critical_workflows: (cfg.critical_workflows as string) || "",
    out_of_scope_behaviours: (cfg.out_of_scope_behaviours as string) || "",
    rate_limit: (cfg.rate_limit as string) || "",
    tenant_model: (cfg.tenant_model as string) || "",
    source_paths: (cfg.source_paths as string) || "",
    repo: (cfg.repo as string) || "",
    known_findings: (cfg.known_findings as string) || "",
    secrets_locations: (cfg.secrets_locations as string) || "",
    fix_lifecycle: (cfg.fix_lifecycle as string) || "",
    active_exploitation_authorized: cfg.active_exploitation_authorized as boolean | undefined,
    registration_open: cfg.registration_open as boolean | undefined,
    api_spec_urls: Array.isArray(cfg.api_spec_urls)
      ? (cfg.api_spec_urls as string[]).join(", ")
      : (cfg.api_spec_urls as string) || "",
    test_accounts: Array.isArray(cfg.credential_accounts)
      ? (cfg.credential_accounts as Array<{ login_url: string; username: string; password: string }>)
          .map((c) => `${c.username}:${c.password}@${c.login_url}`)
          .join("\n")
      : "",
  };
}

function EngagementConfigEditor({
  engagement,
  onSaved,
}: {
  engagement: AgiEngagement;
  onSaved: (e: AgiEngagement) => void;
}) {
  const { toast } = useStore();
  const existing = (engagement.config && Object.keys(engagement.config).length > 0)
    ? engagement.config
    : DEFAULT_ENG_CONFIG;
  const [tools, setTools] = useState(() => (Array.isArray(existing.tools) ? (existing.tools as string[]).join(", ") : "httpx, nmap_safe, nuclei_safe"));
  const skills = (existing.skills && typeof existing.skills === "object") ? existing.skills as Record<string, unknown> : {};
  const [autoSelect, setAutoSelect] = useState(skills.auto_select !== false);
  const [limit, setLimit] = useState(Number(skills.auto_select_limit ?? 6));
  const [mode, setMode] = useState<TestingMode>(() => ((existing.testing_mode as TestingMode) || DEFAULT_TESTING_MODE));
  const [ctx, setCtx] = useState<EngagementContext>(() => contextFromConfig(existing as Record<string, unknown>));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const config = buildEngagementConfig(mode, ctx, {
        ...existing,
        tools: tools.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
        skills: { auto_select: autoSelect, auto_select_limit: limit },
        auto_mint_skills: existing.auto_mint_skills !== false,
        prompts: (existing.prompts && typeof existing.prompts === "object") ? existing.prompts : {},
      });
      const eng = await patchAgiEngagement(engagement.id, { config });
      toast("success", "Config saved", `${(config.tools as string[]).length} tools`);
      onSaved({ ...engagement, ...eng, config });
    } catch (e) {
      toast("error", "Config save failed", agiErrorDetail(e).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-500">Config</p>
      <div className="mt-1.5 space-y-2 rounded-lg border border-phantix-700/40 bg-phantix-950/60 p-3">
        <div>
          <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Testing mode</label>
          <TestingModePicker value={mode} onChange={setMode} disabled={saving} />
          <p className="mt-1 text-[12px] leading-5 text-slate-500">{TESTING_MODES.find((m) => m.id === mode)?.description}</p>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Engagement context. This suppresses the questions of the agent.</label>
          <EngagementContextFields
            mode={mode}
            values={ctx}
            onChange={setCtx}
            disabled={saving}
            fieldClass="w-full rounded-lg border border-phantix-700/50 bg-phantix-900/60 px-3 py-2 text-[13px] text-slate-200 outline-none focus:border-gold-400/40"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Tools</label>
          <input
            value={tools}
            onChange={(e) => setTools(e.target.value)}
            placeholder="httpx, nmap_safe, nuclei_safe"
            className="w-full rounded-lg border border-phantix-700/50 bg-phantix-900/60 px-3 py-2 font-mono text-[13px] text-slate-200 outline-none focus:border-gold-400/40"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[13px] text-slate-400">
            <input type="checkbox" checked={autoSelect} onChange={(e) => setAutoSelect(e.target.checked)} className="accent-[rgb(var(--gold-400))]" />
            Auto-select skills
          </label>
          <label className="flex items-center gap-1.5 text-[13px] text-slate-400">
            Limit
            <input type="number" min={1} max={20} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 6)} className="w-16 rounded-lg border border-phantix-700/50 bg-phantix-900/60 px-2 py-1 font-mono text-[13px] text-slate-200 outline-none" />
          </label>
          <button type="button" onClick={() => void save()} disabled={saving} className="ml-auto btn-secondary !px-2.5 !py-1 !text-[13px]">
            {saving ? <Loader2 size={11} className="mr-1 inline animate-spin" /> : <SlidersHorizontal size={11} className="mr-1 inline" />} Save config
          </button>
        </div>
      </div>
    </div>
  );
}

function SkillCard({ s, onEdit }: { s: AgiSkill; onEdit: () => void }) {
  return (
    <div className="flex flex-col rounded-md border border-phantix-700/40 bg-phantix-900/40 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 truncate font-mono text-[13px] font-semibold text-white" title={s.skill_id}>{s.skill_id}</span>
        <span className="chip border-phantix-600/40 bg-phantix-800/50 font-mono text-[11px] text-slate-400">v{s.version}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={s.status} />
        <span className="chip border-phantix-600/40 bg-phantix-800/50 text-[11px] text-slate-400">{s.kind}</span>
      </div>
      <p className="mt-2 line-clamp-2 min-h-[2em] text-[13px] leading-4 text-slate-400" title={s.title}>{s.title}</p>
      <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-2 text-[12px] text-slate-500">
        <span className="flex items-center gap-1"><Brain size={10} className="text-gold-400" /> {(s.score * 100).toFixed(0)}%</span>
        <span className="flex items-center gap-1"><Activity size={10} /> {s.uses}</span>
        <span className="flex items-center gap-1"><CheckCircle2 size={10} className="text-emerald-400" /> {s.successes}</span>
        <span className="flex items-center gap-1"><XCircle size={10} className="text-severity-critical" /> {s.failures}</span>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-phantix-700/30 pt-2">
        <button onClick={onEdit} className="btn-ghost w-full !px-2 !py-1 !text-[12px]"><Pencil size={11} className="mr-1 inline" /> Edit</button>
      </div>
    </div>
  );
}

function SkillPrioritizeModal({
  open,
  onClose,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { toast } = useStore();
  const [keepTop, setKeepTop] = useState(150);
  const [keepKinds, setKeepKinds] = useState(
    "exploit_verify,web,api,network,cloud,recon,mobile,reporting",
  );
  const [keepTags, setKeepTags] = useState(
    "penetration-testing,red-team,red-teaming,owasp,api-security,web-application-security,web-security,network-security,cloud-security,active-directory,privilege-escalation,mobile-security,container-security,supply-chain,post-exploitation,vulnerability-management,identity-access-management,access-control",
  );
  const [restore, setRestore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgiSkillPrioritizeResult | null>(null);

  const split = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

  const run = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const r = await prioritizeAgiSkills({
        dry_run: dryRun,
        restore,
        keep_top: keepTop,
        keep_kinds: split(keepKinds),
        keep_tags: split(keepTags),
      });
      setResult(r);
      toast(
        dryRun ? "info" : "success",
        dryRun ? "Preview ready" : restore ? "Skills restored" : "Skill library prioritized",
        `${r.kept ?? r.restored ?? 0} kept · ${r.deprecated ?? 0} retired`,
      );
      if (!dryRun) onApplied();
    } catch (e) {
      toast("error", "Prioritization failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Prioritize skill library" wide>
      <div className="space-y-4">
        <p className="text-[13px] leading-5 text-slate-400">
          Retire the non-prioritized imported platform skills so the agent stops ranking across
          hundreds it will never select. Skills are{" "}
          <strong className="text-slate-300">deprecated, never deleted</strong>, and restoring
          re-activates them. Only org-less imported skills are touched. Org, manual, built-in,
          mined and verification-pack skills are always kept.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="prio-top">Keep top N by track record</label>
            <input
              id="prio-top"
              type="number"
              min={0}
              value={keepTop}
              onChange={(e) => setKeepTop(Number(e.target.value))}
              className="input mt-1"
            />
          </div>
          <label className="mt-6 flex cursor-pointer items-center gap-2 text-[13px] text-slate-300">
            <input
              type="checkbox"
              checked={restore}
              onChange={(e) => setRestore(e.target.checked)}
              className="accent-[rgb(var(--gold-400))]"
            />
            Restore mode (re-activate deprecated skills)
          </label>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="prio-kinds">Always keep kinds (comma-separated)</label>
            <input
              id="prio-kinds"
              value={keepKinds}
              onChange={(e) => setKeepKinds(e.target.value)}
              className="input mt-1 font-mono !text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="prio-tags">Always keep tags (comma-separated)</label>
            <textarea
              id="prio-tags"
              value={keepTags}
              onChange={(e) => setKeepTags(e.target.value)}
              rows={3}
              className="input mt-1 font-mono !text-xs"
            />
          </div>
        </div>
        {result && (
          <div className="rounded-xl border border-phantix-700/40 bg-phantix-950/50 p-3 text-[13px] text-slate-300">
            <p className="font-medium text-slate-200">
              {result.action === "restore" ? "Restore" : "Prioritize"}{" "}
              {result.dry_run ? "preview" : "applied"}
            </p>
            <p className="mt-1 text-slate-400">
              {result.candidates ?? 0} candidates · kept {result.kept ?? "Not set"} · retired{" "}
              {result.deprecated ?? "Not set"}
              {result.restored != null ? ` · restored ${result.restored}` : ""}
            </p>
            {(result.sample_deprecated ?? []).length > 0 && (
              <p className="mt-1 font-mono text-[11px] leading-4 text-slate-500">
                e.g. {(result.sample_deprecated ?? []).slice(0, 4).join(", ")}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-xs !py-2">
            Close
          </button>
          <button onClick={() => void run(true)} disabled={busy} className="btn-secondary text-xs !py-2">
            {busy ? <Loader2 size={13} className="mr-1.5 inline animate-spin" /> : null} Preview
          </button>
          <button onClick={() => void run(false)} disabled={busy} className="btn-primary text-xs !py-2">
            {restore ? "Restore skills" : "Apply prioritization"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function AgiAdmin() {
  const { toast, isSuperadmin, isAgiAdmin } = useStore();
  const [tab, setTab] = useState("status");
  const [prioritizeOpen, setPrioritizeOpen] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedEng, setSelectedEng] = useState<AgiEngagement | null>(null);
  const [activeSession, setActiveSession] = useState<AgiSession | null>(null);
  const [sessionView, setSessionView] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [starting, setStarting] = useState(false);
  const [resolved, setResolved] = useState<AgiSkill[]>([]);
  const [skillOpen, setSkillOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<AgiSkill | null>(null);
  const [autonomy, setAutonomy] = useState<"low" | "medium" | "high">("medium");
  /** Lab/eval opt-out — allows high autonomy through the pilot clamp. */
  const [allowLabOptOut, setAllowLabOptOut] = useState(false);
  const [includeOrgAssets, setIncludeOrgAssets] = useState(true);
  const [preapproveLabAuth, setPreapproveLabAuth] = useState(false);
  const [startCreds, setStartCreds] = useState({ login_url: "", username: "", password: "" });
  const [credsOpen, setCredsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [engineOps, setEngineOps] = useState(0);
  const [engineTop, setEngineTop] = useState<AgiEngineCapability[]>([]);
  const [skillFilter, setSkillFilter] = useState<"all" | "candidate" | "active">("all");
  const [skillQuery, setSkillQuery] = useState("");
  const [skillKind, setSkillKind] = useState("all");
  const [skillSort, setSkillSort] = useState<"score" | "uses" | "name">("score");
  const [skillGroup, setSkillGroup] = useState(false);
  const [skillPage, setSkillPage] = useState(1);
  const [skillPageSize, setSkillPageSize] = useState(25);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    const s = await loadAgiStatus();
    if (!s) setStatusError("The Autonomous Agent is disabled or the runner is unreachable.");
    setStatus(s);
    setStatusLoading(false);
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  useEffect(() => {
    void Promise.all([loadAgiEngineCatalog(), loadAgiEngineLearning()]).then(([ops, learning]) => {
      setEngineOps(ops.length);
      setEngineTop([...learning.platform].sort((a, b) => b.score - a.score).slice(0, 5));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const live = await loadActiveAgiSession();
      if (cancelled || !live) return;
      setActiveSession(live);
      setSessionView(true);
      const engs = await loadAgiEngagements();
      const match = engs.find((e) => e.id === live.engagement_id);
      if (match) setSelectedEng(match);
    })();
    return () => { cancelled = true; };
  }, []);

  const engagements = useResource<AgiEngagement[]>(
    async () => loadAgiEngagements(),
    [] as AgiEngagement[],
  );

  const policies = useResource<AgiPolicy[]>(async () => loadAgiPolicies(), [] as AgiPolicy[]);
  const grants = useResource<any[]>(async () => loadAgiGrants(), [] as any[]);
  const skills = useResource<AgiSkill[]>(async () => loadAgiSkills(), [] as AgiSkill[]);
  const toolInstalls = useResource<AgiToolInstallRequest[]>(
    async () => {
      const rows = await loadAgiToolInstalls("all");
      return rows.filter((r) => ["pending_approval", "installed_in_session", "pending_admin"].includes(r.status));
    },
    [] as AgiToolInstallRequest[],
  );

  const orgs = useResource<{ id: number; name: string }[]>(
    async () => {
      if (DEMO_MODE) return [{ id: 42, name: "Acme Financial Group" }, { id: 11, name: "Finlab" }];
      try {
        const res = await api.get<any[]>("/admin/clients");
        return (Array.isArray(res) ? res : []).map((c) => ({ id: Number(c.id ?? c.organization_id ?? 0), name: String(c.name ?? c.organization_name ?? `Org #${c.id}`) }));
      } catch { return []; }
    },
    [] as { id: number; name: string }[],
  );

  // ── Skill library browsing (search · kind · status · sort · group · page) ──
  const skillKinds = useMemo(() => {
    const set = new Set<string>();
    skills.data.forEach((s) => set.add(s.kind || "general"));
    return ["all", ...[...set].sort()];
  }, [skills.data]);

  const filteredSkills = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    return skills.data
      .filter((s) => (skillFilter === "all" || s.status === skillFilter))
      .filter((s) => skillKind === "all" || s.kind === skillKind)
      .filter((s) => !q || s.skill_id.toLowerCase().includes(q) || s.title.toLowerCase().includes(q) || s.kind.toLowerCase().includes(q))
      .sort((a, b) => {
        if (skillSort === "score") return b.score - a.score;
        if (skillSort === "uses") return b.uses - a.uses;
        return a.skill_id.localeCompare(b.skill_id);
      });
  }, [skills.data, skillFilter, skillKind, skillQuery, skillSort]);

  const totalPages = Math.max(1, Math.ceil(filteredSkills.length / skillPageSize));
  const pageSkills = useMemo(() => filteredSkills.slice((skillPage - 1) * skillPageSize, skillPage * skillPageSize), [filteredSkills, skillPage, skillPageSize]);

  const groupedSkills = useMemo(() => {
    const groups = new Map<string, AgiSkill[]>();
    pageSkills.forEach((s) => {
      const k = s.kind || "general";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(s);
    });
    return [...groups.entries()];
  }, [pageSkills]);

  const start = async (eng: AgiEngagement, msg?: string) => {
    const instructionText = msg?.trim() ?? instruction.trim();
    if (!instructionText) { toast("warning", "Instruction required", "An explicit operator instruction is required to start a session."); return; }
    setStarting(true);
    try {
      toast("info", "Provisioning container…", "Docker workspace can take up to ~2 minutes.");
      const s = await startAgiSession(eng.id, instructionText, {
        autonomy,
        allowHighAutonomy: allowLabOptOut,
        include_org_assets: includeOrgAssets,
        preapprove_lab_auth: preapproveLabAuth,
        credentials: credsOpen && startCreds.login_url && startCreds.username && startCreds.password ? {
          login_url: startCreds.login_url,
          username: startCreds.username,
          password: startCreds.password,
        } : undefined,
        confirm_environment: "staging",
      });
      setActiveSession(s);
      setSessionView(true);
      setInstruction("");
      setStartCreds({ login_url: "", username: "", password: "" });
      setCredsOpen(false);
      const meta = (s.meta && typeof s.meta === "object" ? s.meta : {}) as Record<string, unknown>;
      const lab = meta.lab_exploit && typeof meta.lab_exploit === "object" ? meta.lab_exploit as { enabled?: boolean; account_labels?: string[] } : null;
      toast("success", "Session started", lab?.enabled
        ? `Session #${s.id} — lab logins provisioned (${lab.account_labels?.length ?? 0} accounts).`
        : `Session #${s.id} — streaming live from the engagement container.`);
      setResolved(await resolvedAgiSkills(eng.id));
    } catch (e) {
      const { code, message } = agiErrorDetail(e);
      if (code === "apk_selection_required") toast("error", "Mobile APK required", "Backend classified this as a mobile pentest. Uncheck include org assets, or pick a staging APK on the engagement.");
      else if (code === "forbidden_host_info") toast("error", "Policy blocked", "Host/server information is not available to AGI.");
      else if (code === "forbidden_cross_org") toast("error", "Policy blocked", "Other organizations cannot be accessed.");
      else if (code === "forbidden_direct_db") toast("error", "Policy blocked", "Direct database access is not allowed.");
      else toast("error", "Start failed", message);
    }
    finally { setStarting(false); }
  };

  const decideInstall = async (req: AgiToolInstallRequest, provision: boolean) => {
    try {
      await decideAgiToolInstall(req.id, provision, provision ? "Provisioned into sandbox image" : "Rejected by admin");
      toast("success", provision ? "Tool provisioned" : "Tool rejected", req.tool_name);
      toolInstalls.refresh();
    } catch (e) { toast("error", "Decision failed", agiErrorDetail(e).message); }
  };

  const toggleGrant = async (staff: any) => {
    try {
      await setAgiGrant(staff.id, !staff.agi_admin);
      toast("success", staff.agi_admin ? "Agent admin revoked" : "Agent admin granted", staff.email);
      grants.refresh();
    } catch (e) { toast("error", "Grant failed", agiErrorDetail(e).message); }
  };

  const selectedForSession = activeSession ? engagements.data.find((e) => e.id === activeSession.engagement_id) ?? null : selectedEng;

  // Full-screen live session view — fills the content area with a top back nav.
  if (sessionView && activeSession) {
    const posture = readAgiPilotPosture(activeSession);
    const hardStop = agiHardStopRemaining(activeSession);
    const pilotLine = agiPilotStatusCopy(activeSession);
    return (
      <div className="flex h-[calc(100vh-6.5rem)] min-h-[640px] flex-col overflow-hidden rounded-2xl border border-phantix-700/40 bg-phantix-950">
        <div className="flex shrink-0 items-center gap-3 border-b border-phantix-700/40 bg-phantix-950/80 px-4 py-2.5">
          <button onClick={() => setSessionView(false)} className="btn-ghost !px-3 !py-1.5 !text-xs"><ArrowLeft size={13} className="mr-1 inline" /> Back</button>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 text-phantix-950"><Radar size={15} /></span>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold text-white">Autonomous Pentest Agent</p>
            <p className="truncate text-[12px] text-slate-500">session #{activeSession.id} · engagement #{activeSession.engagement_id}{activeSession.container_id ? ` · ${activeSession.container_id}` : ""}</p>
          </div>
          <StatusBadge status={activeSession.status} />
          <span
            className={cx(
              "chip !px-2 !py-0.5 text-[12px]",
              posture.enabled
                ? "border-gold-400/30 bg-gold-400/10 text-gold-300"
                : "border-amber-400/30 bg-amber-400/10 text-amber-300",
            )}
            title={pilotLine}
          >
            {posture.enabled ? "pilot" : "lab"} · {posture.autonomy}
            {hardStop ? ` · ${hardStop.label}` : posture.hardStopMinutes ? ` · ${posture.hardStopMinutes}m cap` : ""}
          </span>
          <span className="ml-auto min-w-0 max-w-[220px] truncate font-mono text-[12px] text-slate-500" title={selectedForSession?.name ?? ""}>{selectedForSession?.name ?? ""}</span>
        </div>
        <div className="min-h-0 flex-1">
          <SessionTerminal session={activeSession} engagement={selectedForSession} onStopped={() => { setActiveSession(null); setSessionView(false); }} />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-hidden">
      <PageHeader
        title="SecureGraph Autonomous Agent Management"
        description="Scope engagements, run sessions, approve state-changing steps, provision tools and manage skills for the autonomous agent."
        actions={
          <button onClick={() => { loadStatus(); engagements.refresh(); toolInstalls.refresh(); skills.refresh(); }} className="btn-ghost text-sm px-3 py-1.5">
            <RefreshCw size={14} className={statusLoading ? "animate-spin" : ""} />
          </button>
        }
      />

      {!isAgiAdmin ? (
        <Card className="text-center">
          <ShieldCheck size={26} className="mx-auto text-slate-500" />
          <h2 className="mt-3 font-display text-lg font-semibold text-white">Agent Management access required</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">Only superadmins or staff granted <span className="font-mono text-gold-300">agent admin</span> can operate the Autonomous Agent. Ask a superadmin to grant access from the Grants tab.</p>
        </Card>
      ) : (
        <>
          <Tabs
            tabs={[
              { id: "status", label: "Status" },
              { id: "engagements", label: "Engagements", count: engagements.data.length },
              { id: "sessions", label: "Session", count: activeSession ? 1 : 0 },
              { id: "approvals", label: "Tool Queue", count: toolInstalls.data.length },
              { id: "engines", label: "Engines" },
              { id: "skills", label: "Skills", count: skills.data.length },
              { id: "guidance", label: "Guidance" },
              { id: "prompts", label: "Prompts" },
              { id: "policies", label: "Agreement" },
              { id: "findings", label: "Findings", count: activeSession ? 1 : 0 },
              ...(isSuperadmin ? [{ id: "grants", label: "Grants", count: grants.data.length }] : []),
              { id: "guide", label: "Contributor Guide" },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === "status" && (
            <div className="space-y-4">
              {statusLoading ? <TableSkeleton rows={3} /> : statusError && !status ? (
                <EmptyState icon={<Activity size={24} />} title="Autonomous Agent not ready" body={statusError} action={<button onClick={() => void loadStatus()} className="btn-primary !text-xs"><RefreshCw size={12} className="mr-1 inline" /> Retry</button>} />
              ) : status ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard label="Platform" value={status.enabled ? "Enabled" : "Disabled"} icon={<Activity size={18} />} />
                    <StatCard label="Runner" value={status.runner_reachable ? "Connected" : "Unreachable"} icon={<Terminal size={18} />} className={status.runner_reachable ? undefined : "border-severity-critical/40"} />
                    <StatCard label="Model" value={status.deepseek_only ? "DeepSeek only" : "Provider mesh"} icon={<Brain size={18} />} />
                    <StatCard label="Sandbox image" value={status.default_image.split(":")[0]} icon={<Boxes size={18} />} />
                  </div>
                  <EngineSnapshotCards
                    catalogCount={engineOps}
                    top={engineTop}
                    pendingTools={toolInstalls.data.length}
                    onOpenQueue={() => setTab("approvals")}
                    onOpenEngines={() => setTab("engines")}
                  />
                  <Card>
                    <CardHeader title="Runner" subtitle={status.runner_url} action={<StatusBadge status={status.runner_reachable ? "ready" : "failed"} />} />
                    <p className="break-all rounded-lg bg-phantix-950/60 p-2.5 font-mono text-[13px] leading-5 text-slate-400">{status.runner_detail || "No detail from runner."}</p>
                  </Card>
                </>
              ) : null}
            </div>
          )}

          {tab === "engagements" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={() => setShowCreate(true)} className="btn-primary !px-3.5 !py-2 !text-xs"><Plus size={13} className="mr-1 inline" /> New engagement</button>
              </div>
              {engagements.loading ? <TableSkeleton rows={4} /> : engagements.data.length === 0 ? (
                <EmptyState icon={<Crosshair size={24} />} title="No engagements" body="Create a scoped engagement to start live testing." />
              ) : (
                <div className="space-y-2.5">
                  {engagements.data.map((e) => (
                    <motion.div key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-md border border-phantix-700/40 bg-phantix-900/40 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Globe2 size={15} className="text-gold-400" />
                        <span className="text-sm font-semibold text-slate-100">{e.name}</span>
                        <StatusBadge status={e.status} />
                        <span className="chip text-[12px] text-slate-500">org #{e.organization_id}</span>
                      </div>
                      {e.description && <p className="mt-1 text-xs text-slate-400">{e.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(e.scope_definition?.target_allowlist ?? []).map((t) => (
                          <span key={t} className="chip max-w-full break-all border-phantix-600/40 bg-phantix-800/50 font-mono text-[12px] text-slate-400">{repairTarget(t)}</span>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button onClick={() => { setSelectedEng(e); setDetailOpen(true); }} className="btn-ghost !px-2.5 !py-1.5 !text-[13px]"><Eye size={12} className="mr-1 inline" /> Detail</button>
                        <button onClick={() => { setSelectedEng(e); setDetailOpen(false); setTab("sessions"); }} className="btn-secondary !px-2.5 !py-1.5 !text-[13px]"><Play size={12} className="mr-1 inline" /> Run session</button>
                        {e.scope_definition.max_session_minutes && <span className="ml-auto flex items-center gap-1 text-[12px] text-slate-500"><Clock size={10} /> {e.scope_definition.max_session_minutes} min max</span>}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "sessions" && !activeSession && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Start a session" subtitle="An explicit instruction is required — the agent only starts after you tell it what to do." />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[13px] font-semibold text-slate-400">Engagement</label>
                    <select
                      value={selectedEng?.id ?? ""}
                      onChange={(e) => setSelectedEng(engagements.data.find((x) => x.id === Number(e.target.value)) ?? null)}
                      className="input"
                    >
                      <option value="">Select engagement…</option>
                      {engagements.data.map((e) => <option key={e.id} value={e.id}>{e.name} (#{e.id})</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button onClick={() => selectedEng && void start(selectedEng)} disabled={!selectedEng || !instruction.trim() || starting} className="btn-primary w-full !px-4 !py-2 !text-xs">
                      {starting ? <Loader2 size={13} className="mr-1 inline animate-spin" /> : <Play size={13} className="mr-1 inline" />} Start session
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-[13px] font-semibold text-slate-400">Instruction</label>
                  <AutoGrow
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && selectedEng) void start(selectedEng); }}
                    minRows={3}
                    placeholder='Instruction, e.g. "Perform read-only recon of the allowlisted hosts; propose active checks for approval."'
                    className="w-full rounded-lg border border-phantix-700/50 bg-phantix-950/60 px-3 py-2 text-xs leading-6 text-slate-200 outline-none placeholder:text-slate-600 focus:border-gold-400/40"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <div>
                    <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Autonomy</label>
                    <select value={autonomy} onChange={(e) => setAutonomy(e.target.value as "low" | "medium" | "high")} className="input !w-auto !py-1.5 text-[13px]">
                      <option value="low">low, operator-driven</option>
                      <option value="medium">medium, automatic recon, gate exploit</option>
                      <option value="high" disabled={!allowLabOptOut}>high — lab opt-out only</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-1.5 pt-4 text-[13px] text-slate-400" title="Turns off lab auto-login if any non-lab host is in scope">
                    <input type="checkbox" checked={includeOrgAssets} onChange={(e) => setIncludeOrgAssets(e.target.checked)} className="accent-[rgb(var(--gold-400))]" />
                    Include all organization assets
                  </label>
                  <label className="flex items-center gap-1.5 pt-4 text-[13px] text-slate-400" title="Only honored when every allowlisted host is *.phantixvulnserver.online">
                    <input type="checkbox" checked={preapproveLabAuth} onChange={(e) => setPreapproveLabAuth(e.target.checked)} className="accent-[rgb(var(--gold-400))]" />
                    Pre-approve lab auth
                  </label>
                  <label
                    className="flex items-center gap-1.5 pt-4 text-[13px] text-amber-300/90"
                    title="Lab/eval only. Allows autonomy high through the pilot clamp; pair with engagement allow_offensive_auto / pilot_posture=false on the backend."
                  >
                    <input
                      type="checkbox"
                      checked={allowLabOptOut}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setAllowLabOptOut(on);
                        if (!on && autonomy === "high") setAutonomy("medium");
                      }}
                      className="accent-[rgb(var(--gold-400))]"
                    />
                    Lab opt-out (allow high)
                  </label>
                  <button onClick={() => setCredsOpen((v) => !v)} className={cx("pt-4 btn-ghost !px-2.5 !py-1.5 !text-[13px]", credsOpen && "text-gold-300")}>
                    <ShieldCheck size={12} className="mr-1 inline" /> Login credentials
                  </button>
                </div>
                <p className="mt-1.5 text-[12px] leading-4 text-slate-600">
                  Pilot default: autonomy ≤ medium, hard stop {AGI_PILOT.defaultHardStopMinutes}m, exploit/brute gated, promote only after verify.
                  Lab-only engagements: leave org assets off so the lab account pack can auto-provision.
                </p>
                {credsOpen && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <input value={startCreds.login_url} onChange={(e) => setStartCreds({ ...startCreds, login_url: e.target.value })} placeholder="Login URL" className="rounded-lg border border-phantix-700/50 bg-phantix-950/60 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-gold-400/40" />
                    <input value={startCreds.username} onChange={(e) => setStartCreds({ ...startCreds, username: e.target.value })} placeholder="Username" className="rounded-lg border border-phantix-700/50 bg-phantix-950/60 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-gold-400/40" />
                    <input type="password" value={startCreds.password} onChange={(e) => setStartCreds({ ...startCreds, password: e.target.value })} placeholder="Password" className="rounded-lg border border-phantix-700/50 bg-phantix-950/60 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-gold-400/40" />
                  </div>
                )}
                {resolved.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] text-slate-500">Ranked skills:</span>
                    {resolved.slice(0, 6).map((s) => <span key={s.skill_id} className="chip max-w-full break-all border-gold-400/20 bg-gold-400/5 font-mono text-[12px] text-gold-300">{s.skill_id}</span>)}
                  </div>
                )}
              </Card>

              <EmptyState icon={<Terminal size={24} />} title="No active session" body="Select an engagement, enter an instruction, and press Start. The session keeps running if you leave this page — reopen Session to continue." />
            </div>
          )}

          {tab === "sessions" && activeSession && !sessionView && (
            <Card>
              <CardHeader title="Session running" subtitle={`Session #${activeSession.id} is live on engagement #${activeSession.engagement_id}.`} action={<StatusBadge status={activeSession.status} />} />
              <button onClick={() => setSessionView(true)} className="btn-primary !px-4 !py-2 !text-xs"><Radar size={13} className="mr-1 inline" /> Open session view</button>
            </Card>
          )}

          {tab === "approvals" && (
            <div className="space-y-3">
              <Card className="mb-3">
                <p className="flex items-center gap-1.5 text-xs text-slate-400"><Wrench size={13} className="text-gold-400" /> Tools installed inside a session container are not automatically on the shared sandbox image. Rebuild <span className="font-mono text-gold-300">phantix-agi-sandbox</span> with the package, then mark it provisioned.</p>
              </Card>
              {toolInstalls.loading ? <TableSkeleton rows={3} /> : toolInstalls.data.length === 0 ? (
                <EmptyState icon={<Wrench size={24} />} title="Tool provision queue empty" body="No agent sessions requested a missing tool recently." />
              ) : (
                toolInstalls.data.map((req) => (
                  <div key={req.id} className="rounded-md border border-phantix-700/40 bg-phantix-900/40 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Wrench size={14} className="text-gold-400" />
                      <span className="break-all font-mono text-sm font-semibold text-white">{req.tool_name}</span>
                      <StatusBadge status={req.status} />
                      <span className="chip text-[12px] text-slate-500">org #{req.organization_id}</span>
                      <span className="chip max-w-full break-all font-mono text-[12px] text-gold-300">{req.engine_id ?? "scanner_engine"}</span>
                      {(req.skill_id_minted || req.skill_id) && <span className="chip max-w-full break-all font-mono text-[12px] text-slate-400">{req.skill_id_minted || req.skill_id}</span>}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">{req.rationale}</p>
                    {req.install_command && <p className="mt-1.5 break-all rounded-lg bg-phantix-950/70 px-2.5 py-1.5 font-mono text-[13px] text-slate-300">{req.install_command}</p>}
                    <p className="mt-1.5 text-[12px] text-slate-600">Session approve ≠ server provision. Confirm only after the package is in phantix-agi-sandbox.</p>
                    {req.status === "pending_admin" || req.status === "installed_in_session" ? (
                      <div className="mt-3 flex items-center gap-2">
                        <button onClick={() => void decideInstall(req, true)} className="btn-primary !px-3 !py-1.5 !text-[13px]"><CheckCircle2 size={12} className="mr-1 inline" /> Provision server-wide</button>
                        <button onClick={() => void decideInstall(req, false)} className="btn-ghost !px-3 !py-1.5 !text-[13px] text-severity-critical hover:text-severity-critical"><XCircle size={12} className="mr-1 inline" /> Reject</button>
                      </div>
                    ) : (
                      <p className="mt-2 rounded-md border border-gold-400/25 bg-gold-400/5 px-3 py-2 text-[12px] text-gold-300">
                        Waiting for the operator to approve the in-session install before this reaches the admin provision queue.
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "engines" && <EngineLearningPanel />}

          {tab === "guidance" && (
            <AgentGuidancePanel orgs={orgs.data} />
          )}

          {tab === "prompts" && <AgiPrompts />}

          {tab === "skills" && (
            <div className="space-y-3">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-phantix-700/40 bg-phantix-900/40 p-2.5">
                <div className="relative min-w-[220px] flex-1">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={skillQuery}
                    onChange={(e) => { setSkillQuery(e.target.value); setSkillPage(1); }}
                    placeholder="Search skill id, title, or kind… (e.g. idor, soc, recon)"
                    className="w-full rounded-lg border border-phantix-700/50 bg-phantix-950/60 py-1.5 pl-8 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-gold-400/40"
                  />
                </div>
                <select value={skillKind} onChange={(e) => { setSkillKind(e.target.value); setSkillPage(1); }} className="input !w-auto !py-1.5 text-xs">
                  {skillKinds.map((k) => <option key={k} value={k}>{k === "all" ? "All kinds" : k}</option>)}
                </select>
                <select value={skillSort} onChange={(e) => setSkillSort(e.target.value as typeof skillSort)} className="input !w-auto !py-1.5 text-xs">
                  <option value="score">Sort · score</option>
                  <option value="uses">Sort · uses</option>
                  <option value="name">Sort · name</option>
                </select>
                <select value={skillPageSize} onChange={(e) => { setSkillPageSize(Number(e.target.value)); setSkillPage(1); }} className="input !w-auto !py-1.5 text-xs">
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                </select>
                <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-slate-400">
                  <input type="checkbox" checked={skillGroup} onChange={(e) => { setSkillGroup(e.target.checked); setSkillPage(1); }} className="accent-[rgb(var(--gold-400))]" />
                  Group by kind
                </label>
                <div className="flex gap-1">
                  {(["all", "candidate", "active"] as const).map((f) => (
                    <button key={f} onClick={() => { setSkillFilter(f); setSkillPage(1); }} className={cx("rounded-md px-2.5 py-1 text-[13px] capitalize", skillFilter === f ? "bg-phantix-800 text-gold-200" : "text-slate-500")}>{f}</button>
                  ))}
                </div>
                <button onClick={() => setPrioritizeOpen(true)} className="btn-ghost !px-3 !py-1.5 !text-xs" title="Retire non-priority imported skills so the agent stops ranking across all of them"><Sparkles size={13} className="mr-1 inline" /> Prioritize library</button>
                <button onClick={() => { setEditingSkill(null); setSkillOpen(true); }} className="btn-primary !px-3 !py-1.5 !text-xs"><Plus size={13} className="mr-1 inline" /> New skill</button>
              </div>

              {/* Results meta */}
              <p className="text-[13px] text-slate-500">
                {filteredSkills.length} skill{filteredSkills.length === 1 ? "" : "s"}
                {skillKind !== "all" ? ` · kind: ${skillKind}` : ""}
                {skillFilter !== "all" ? ` · status: ${skillFilter}` : ""}
                {skillQuery.trim() ? ` · matching “${skillQuery.trim()}”` : ""}
              </p>

              {skills.loading ? <TableSkeleton rows={4} /> : filteredSkills.length === 0 ? (
                <EmptyState icon={<Brain size={24} />} title="No skills match" body="Try clearing the search, kind, or status filters — or create a new skill." action={<button onClick={() => { setSkillQuery(""); setSkillKind("all"); setSkillFilter("all"); }} className="btn-primary !text-xs"><RefreshCw size={12} className="mr-1 inline" /> Clear filters</button>} />
              ) : skillGroup ? (
                <div className="space-y-4">
                  {groupedSkills.map(([kind, list]) => (
                    <div key={kind}>
                      <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-gold-300">
                        {kind} <span className="text-slate-500">({list.length})</span>
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                        {list.map((s) => <SkillCard key={s.id} s={s} onEdit={() => { setEditingSkill(s); setSkillOpen(true); }} />)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                  {pageSkills.map((s) => <SkillCard key={s.id} s={s} onEdit={() => { setEditingSkill(s); setSkillOpen(true); }} />)}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-phantix-700/40 bg-phantix-900/40 px-3 py-2">
                  <p className="text-[13px] text-slate-500">Page {skillPage} of {totalPages}</p>
                  <div className="flex items-center gap-1.5">
                    <button disabled={skillPage <= 1} onClick={() => setSkillPage((p) => Math.max(1, p - 1))} className="btn-ghost !px-2.5 !py-1 !text-[13px] disabled:opacity-40">Prev</button>
                    <button disabled={skillPage >= totalPages} onClick={() => setSkillPage((p) => Math.min(totalPages, p + 1))} className="btn-ghost !px-2.5 !py-1 !text-[13px] disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "policies" && (
            <PolicyPanel toast={toast} policies={policies} />
          )}

          {tab === "findings" && (activeSession ? <FindingsPanel sessionId={activeSession.id} /> : (
            <EmptyState icon={<ShieldAlert size={24} />} title="No session selected" body="Start a session to view evidence-backed findings and promote them to the org risk register." />
          ))}

          {tab === "grants" && isSuperadmin && (
            <div className="space-y-2.5">
              <Card className="mb-3">
                <p className="flex items-center gap-1.5 text-xs text-slate-400"><Users size={13} className="text-gold-400" /> Grant or revoke <span className="font-mono text-gold-300">agent admin</span> on staff. Superadmins always have Agent Management access.</p>
              </Card>
              {grants.loading ? <TableSkeleton rows={3} /> : grants.data.length === 0 ? (
                <EmptyState icon={<Users size={24} />} title="No staff found" body="Create staff users from the Staff Users page to grant Agent Management access." />
              ) : grants.data.map((s: any) => {
                const isSuper = String(s.role).toLowerCase() === "superadmin";
                const granted = Boolean(s.agi_admin) || isSuper;
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-md border border-phantix-700/40 bg-phantix-900/40 p-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-phantix-800/70 text-slate-300">{s.full_name?.slice(0, 1) ?? "?"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-100">{s.full_name || s.email}</p>
                      <p className="text-xs text-slate-500">{s.email} · <span className="capitalize">{s.role}</span>{!s.is_active && <span className="text-severity-critical"> · inactive</span>}</p>
                    </div>
                    <StatusBadge status={granted ? "active" : "rejected"} />
                    {isSuper ? (
                      <span className="chip border-gold-400/30 bg-gold-400/10 text-[12px] text-gold-300">always</span>
                    ) : (
                      <button onClick={() => void toggleGrant(s)} disabled={!s.is_active} className={cx("!px-3 !py-1.5 !text-[13px]", s.agi_admin ? "btn-ghost" : "btn-primary")}>{s.agi_admin ? "Revoke agent admin" : "Grant agent admin"}</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === "guide" && (
            <Card className="!p-0 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-phantix-700/40 px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-phantix-800/70 text-gold-400"><BookOpen size={17} /></span>
                  <div>
                    <p className="font-display text-sm font-semibold text-white">Autonomous Agent Contributor Guide</p>
                    <p className="text-[13px] text-slate-500">Internal engineering reference — visible to agent admins only. Architecture, security model, APIs, deploy, and how to extend.</p>
                  </div>
                </div>
                <span className="chip border-gold-400/30 bg-gold-400/10 text-[12px] text-gold-300">agent admin gated</span>
              </div>
              <div className="max-h-[70vh] overflow-y-auto p-5">
                <ContributorGuideView source={AGI_CONTRIBUTOR_GUIDE_MD} />
              </div>
            </Card>
          )}
        </>
      )}

      {/* Create engagement modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create engagement" wide>
        <EngagementForm orgs={orgs.data} onCreated={(e) => { setShowCreate(false); engagements.refresh(); setSelectedEng(e); setTab("sessions"); }} />
      </Modal>

      {/* Engagement detail modal */}
      <Modal open={Boolean(detailOpen && selectedEng && !activeSession)} onClose={() => setDetailOpen(false)} title="Engagement detail" wide>
        {selectedEng && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-semibold text-white">{selectedEng.name}</h3>
              <StatusBadge status={selectedEng.status} />
              <span className="chip text-[12px] text-slate-500">org #{selectedEng.organization_id}</span>
            </div>
            {selectedEng.description && <p className="text-sm text-slate-300">{selectedEng.description}</p>}
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-500">Target allowlist</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(selectedEng.scope_definition?.target_allowlist ?? []).map((t) => <span key={t} className="chip max-w-full break-all border-phantix-600/40 bg-phantix-800/50 font-mono text-[13px] text-slate-300">{repairTarget(t)}</span>)}
              </div>
            </div>
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-500">Forbidden actions</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(selectedEng.scope_definition?.forbidden_actions ?? []).map((t) => <span key={t} className="chip border-severity-critical/30 bg-severity-critical/10 font-mono text-[13px] text-severity-critical">{t}</span>)}
              </div>
            </div>
            {selectedEng.scope_definition?.rules_of_engagement && (
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-500">Rules of engagement</p>
                <p className="mt-1.5 rounded-lg bg-phantix-950/60 p-3 text-xs leading-5 text-slate-300">{selectedEng.scope_definition.rules_of_engagement}</p>
              </div>
            )}
            <EngagementConfigEditor
              engagement={selectedEng}
              onSaved={(eng) => { setSelectedEng(eng); engagements.refresh(); }}
            />
            <div className="flex items-center justify-between border-t border-phantix-700/40 pt-3">
              <p className="text-[13px] text-slate-500">Created {formatDateTime(selectedEng.created_at)}</p>
              <button onClick={() => { setDetailOpen(false); setTab("sessions"); }} className="btn-primary !px-3 !py-1.5 !text-[13px]"><Play size={12} className="mr-1 inline" /> Run session</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Skill create/edit modal */}
      <SkillFormModal
        open={skillOpen}
        skill={editingSkill}
        onClose={() => { setSkillOpen(false); setEditingSkill(null); }}
        onSaved={() => skills.refresh()}
        toast={toast}
      />

      <SkillPrioritizeModal
        open={prioritizeOpen}
        onClose={() => setPrioritizeOpen(false)}
        onApplied={() => skills.refresh()}
      />
    </div>
  );
}

// ── Skill create / edit form (AgiSkillDocument authoring) ────────────────────
const SKILL_KINDS = ["recon", "web", "api", "network", "mobile", "cloud", "exploit_verify", "reporting", "general"];
const ACTION_CLASSES = ["read", "state_changing", "either"];
const SKILL_STATUSES = ["candidate", "active", "quarantined", "deprecated"];

function SkillFormModal({
  open,
  skill,
  onClose,
  onSaved,
  toast,
}: {
  open: boolean;
  skill: AgiSkill | null;
  onClose: () => void;
  onSaved: () => void;
  toast: (k: "success" | "error" | "info" | "warning", t: string, b?: string) => void;
}) {
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState("active");
  const [orgScope, setOrgScope] = useState("platform");
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState<Record<string, unknown> | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (skill) {
      const doc = { ...(skill.document ?? {}) };
      setStatus(skill.status);
      setOrgScope(skill.organization_id ? "org" : "platform");
      setRaw(JSON.stringify(doc, null, 2));
    } else {
      setStatus("active");
      setOrgScope("platform");
      setRaw(JSON.stringify({
        skill_id: "agi.general.example",
        version: "1.0.0",
        title: "Example playbook",
        kind: "general",
        summary: "Short summary of what this skill optimizes for.",
        action_class: "read",
        body_md: "# Purpose\n\nExplain what the playbook does.\n\n## Steps\n1. First step\n2. Second step\n\n## Evidence rules\nRecord exact command output and timestamps.\n\n## Stop conditions\nAbort on PII or production writes.",
        tools: [{ name: "httpx", action_class: "read", required: false }],
        scope_affinity: { target_kinds: ["url"], protocols: ["http", "https"], ports: [80, 443] },
        requires_approval: false,
        forbidden_overlap: [],
        tags: ["recon"],
        author: "staff",
        source: "manual",
      }, null, 2));
    }
    setParseError(null);
    setParsed(null);
  }, [open, skill]);

  const parse = () => {
    try {
      const doc = JSON.parse(raw);
      if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error("document must be a JSON object");
      setParsed(doc);
      setParseError(null);
      return true;
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Invalid JSON");
      setParsed(null);
      return false;
    }
  };

  const save = async () => {
    if (!parse()) return;
    setSaving(true);
    try {
      await upsertAgiSkill({
        document: parsed as Record<string, unknown>,
        status,
        organization_id: orgScope === "org" ? (skill?.organization_id ?? null) : null,
      });
      toast("success", skill ? "Skill updated" : "Skill created", String((parsed as any)?.skill_id ?? ""));
      onSaved();
      onClose();
    } catch (e) {
      const { message, code } = agiErrorDetail(e);
      if (code === "skill_schema") toast("error", "Invalid skill document", message.replace(/^Invalid skill document: /, ""));
      else toast("error", "Save failed", message);
    } finally {
      setSaving(false);
    }
  };

  const field = "input !px-3 !py-2 font-mono text-[13px]";

  return (
    <Modal open={open} onClose={onClose} title={skill ? `Edit skill — ${skill.skill_id}` : "Create skill"} wide>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-slate-400">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-phantix-700/50 bg-phantix-950/60 px-3 py-2 text-xs text-slate-200 outline-none focus:border-gold-400/40">
              {SKILL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-slate-400">Scope</label>
            <select value={orgScope} onChange={(e) => setOrgScope(e.target.value)} className="rounded-lg border border-phantix-700/50 bg-phantix-950/60 px-3 py-2 text-xs text-slate-200 outline-none focus:border-gold-400/40">
              <option value="platform">Platform template</option>
              <option value="org">Org-private{skill?.organization_id ? ` (#${skill.organization_id})` : ""}</option>
            </select>
          </div>
          <p className="ml-auto text-[12px] text-slate-500">Skill schema loaded for reference</p>
        </div>

        <div>
          <label className="mb-1 block text-[13px] font-semibold text-slate-400">Skill document (JSON — AgiSkillDocument)</label>
          <textarea
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setParsed(null); setParseError(null); }}
            rows={16}
            spellCheck={false}
            className={cx(field, "resize-y", parseError && "border-severity-critical/50")}
          />
          {parseError && <p className="mt-1 text-[13px] text-severity-critical">{parseError}</p>}
          {parsed && <p className="mt-1 text-[13px] text-emerald-400">Valid JSON ✓ — will be validated against the skill schema on save.</p>}
        </div>

        <p className="text-[12px] leading-4 text-slate-500">
          Required: <span className="font-mono">skill_id</span> (lowercase, <span className="font-mono">agi.&lt;kind&gt;.&lt;slug&gt;</span>), <span className="font-mono">title</span>, <span className="font-mono">body_md</span> (≥20 chars). Optional: <span className="font-mono">kind</span> (recon/web/api/network/mobile/cloud/exploit_verify/reporting/general), <span className="font-mono">action_class</span>, <span className="font-mono">tools[]</span>, <span className="font-mono">scope_affinity</span>, <span className="font-mono">requires_approval</span>, <span className="font-mono">tags</span>. Auto-mined skills use <span className="font-mono">source: "auto_mint"</span>.
        </p>

        <div className="flex items-center gap-2">
          <button onClick={() => void save()} disabled={saving || !raw.trim()} className="btn-primary flex-1 !py-2.5 !text-xs">
            {saving ? <Loader2 size={13} className="mr-1 inline animate-spin" /> : <Brain size={13} className="mr-1 inline" />} {skill ? "Save skill" : "Create skill"}
          </button>
          <button onClick={onClose} className="btn-ghost !px-4 !py-2.5 !text-xs">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Policy (agreement) panel ──────────────────────────────────────────────────
function PolicyPanel({ toast, policies }: { toast: (k: "success" | "error" | "info" | "warning", t: string, b?: string) => void; policies: ReturnType<typeof useResource<AgiPolicy[]>> }) {
  const [active, setActive] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ version: "", title: "Autonomous Agent Usage Agreement", body_md: "", activate: true });
  const [publishing, setPublishing] = useState(false);

  const loadActive = useCallback(async () => {
    const a = await loadAgiActivePolicy();
    setActive(a);
  }, []);
  useEffect(() => { void loadActive(); }, [loadActive]);

  const publish = async () => {
    if (!form.version.trim() || !form.body_md.trim()) { toast("error", "Version and body are required"); return; }
    setPublishing(true);
    try {
      const res = await publishAgiPolicy({ version: form.version.trim(), title: form.title.trim(), body_md: form.body_md.trim(), activate: form.activate });
      toast("success", "Policy published", res.message);
      setOpen(false);
      setForm({ version: "", title: "Autonomous Agent Usage Agreement", body_md: "", activate: true });
      policies.refresh();
      void loadActive();
    } catch (e) { toast("error", "Publish failed", agiErrorDetail(e).message); }
    finally { setPublishing(false); }
  };

  return (
    <div className="space-y-3">
      {active && (
        <Card>
          <CardHeader title={active.title} subtitle={`Version ${active.version} · published ${active.published_at ? formatDateTime(active.published_at) : "Not set"}`} action={<StatusBadge status="active" />} />
          <div
            className="prose-doc max-w-none max-h-72 overflow-y-auto overflow-x-hidden break-words rounded-md bg-phantix-950/60 p-4"
            dangerouslySetInnerHTML={{ __html: marked.parse(active.body_md) as string }}
          />
        </Card>
      )}
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className="btn-primary !px-3.5 !py-2 !text-xs"><Plus size={13} className="mr-1 inline" /> Publish new version</button>
      </div>
      <CollapsibleCard defaultOpen={false} title="Version history">
        <div className="space-y-2">
          {policies.loading ? <TableSkeleton rows={2} /> : (policies.data ?? []).map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-phantix-800/40 px-3 py-2.5">
              <FileText size={14} className="text-gold-400" />
              <span className="text-sm font-semibold text-slate-100">{p.title}</span>
              <span className="chip font-mono text-[12px] text-slate-400">v{p.version}</span>
              {p.is_active && <StatusBadge status="active" />}
              <span className="ml-auto text-[13px] text-slate-500">{p.published_at ? formatDateTime(p.published_at) : "draft"}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-slate-500">When a new active version is published, customers must accept again before they use the Autonomous Agent.</p>
      </CollapsibleCard>

      <Modal open={open} onClose={() => setOpen(false)} title="Publish agent usage agreement" wide>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="Version (e.g. 1.1.0)" className="rounded-lg border border-phantix-700/50 bg-phantix-950/60 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-gold-400/40" />
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="rounded-lg border border-phantix-700/50 bg-phantix-950/60 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-gold-400/40" />
          </div>
          <AutoGrow value={form.body_md} onChange={(e) => setForm({ ...form, body_md: e.target.value })} minRows={10} placeholder={"# Title\n\nMarkdown body shown in the customer accept modal…"} className="w-full rounded-lg border border-phantix-700/50 bg-phantix-950/60 px-3 py-2 font-mono text-[13px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-gold-400/40" />
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={form.activate} onChange={(e) => setForm({ ...form, activate: e.target.checked })} className="accent-[rgb(var(--gold-400))]" />
            Activate immediately (customers must re-accept)
          </label>
          <button onClick={() => void publish()} disabled={publishing} className="btn-primary w-full !py-2.5 !text-xs">{publishing ? <Loader2 size={13} className="mr-1 inline animate-spin" /> : <FileText size={13} className="mr-1 inline" />} Publish</button>
        </div>
      </Modal>
    </div>
  );
}
