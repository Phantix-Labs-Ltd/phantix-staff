import React, { memo, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight, Bot, Check, ChevronDown, ChevronRight, Copy, Crosshair, Gauge, HelpCircle, ListChecks, Loader2, Pause, Play, Radar, Send, ShieldAlert, ShieldCheck, Terminal, User, XCircle, type LucideIcon,
} from "lucide-react";
import { marked } from "marked";
import { Tool } from "@/components/prompt-kit/tool";
import { linkify } from "@/lib/linkify";
import { normalizeAgiMarkdown } from "@/lib/agiMarkdown";
import { personaForChunk, type AgentPersona } from "@/lib/agiGraph";
import type { AgiTranscriptChunk, Severity } from "@/lib/types";
import { cx } from "@/lib/utils";

marked.setOptions({ breaks: true, gfm: true });

// Full markdown renderer for streamed orchestrator turns. Uses `marked` + the
// app's `.prose-doc` stylesheet (gold links, styled code blocks/tables/lists)
// so the agent output never leaks literal `**`/`##` markers. Memoized on the
// source so a growing streaming message only re-parses when it actually changes.
// Engine copy arrives with `○` bullets as plain text — normalize those into
// real markdown lists first so lists render with proper indentation.
const StreamMarkdown = memo(function StreamMarkdown({ source }: { source: string }) {
  const html = useMemo(
    () => (source ? (marked.parse(normalizeAgiMarkdown(source)) as string) : ""),
    [source],
  );
  return (
    <div
      className="prose-doc max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
StreamMarkdown.displayName = "StreamMarkdown";

// ── Shared live-stream primitives for the Autonomous Pentest Agent console ────
// Used by the fullscreen operator console (AgiConsole) and the compact drawer
// stream (AgiWorkspace) so both surfaces render messages, tool calls, engine
// events, and the working indicator identically.

const PERSONA_META: Record<AgentPersona, { label: string; tint: string }> = {
  orchestrator: { label: "SecureGraph Autonomous Agent", tint: "text-gold-300" },
  recon: { label: "Recon agent", tint: "text-severity-low" },
  exploit: { label: "Web exploit agent", tint: "text-severity-high" },
};

const SEV_DOT: Record<Severity, string> = {
  critical: "bg-severity-critical",
  high: "bg-severity-high",
  medium: "bg-severity-medium",
  low: "bg-severity-low",
  info: "bg-severity-info",
};

export function streamTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function StreamCaret() {
  return <span className="ml-0.5 inline-block h-3 w-[6px] animate-pulse rounded-sm bg-gold-400/70 align-middle" />;
}

export function CopyBtn({ text, className }: { text: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy message"
      title="Copy"
      onClick={(e) => {
        e.stopPropagation();
        try { void navigator.clipboard?.writeText(text); } catch { /* clipboard unavailable */ }
        setOk(true);
        window.setTimeout(() => setOk(false), 1200);
      }}
      className={cx(
        "rounded-md p-1 text-slate-500 opacity-0 transition-opacity duration-150 hover:bg-phantix-800 hover:text-slate-200 group-hover:opacity-100",
        ok && "!opacity-100 !text-emerald-400",
        className,
      )}
    >
      {ok ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

// ── Tool call / tool output ───────────────────────────────────────────────────

const CMD_RE = /^[a-z_][\w.-]*(\s+\S+)+$/i;

function prettyJson(raw: string): string | null {
  const s = raw.trim();
  if (!s.startsWith("{") && !s.startsWith("[")) return null;
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return null;
  }
}

// Friendly display names for the pentest subagent / gate tools so the stream
// reads clearly instead of showing raw tool ids.
const TOOL_LABELS: Record<string, string> = {
  recon_subagent: "Recon subagent",
  autofix_subagent: "Autofix subagent",
  verify_all: "Verify-all gate",
};

function ToolCallCard({ t, dense = false }: { t: AgiTranscriptChunk; dense?: boolean }) {
  const rawTool = typeof t.meta?.tool === "string" ? (t.meta.tool as string) : "tool";
  const toolName = TOOL_LABELS[rawTool] ?? rawTool;

  // First line that looks like a shell command becomes the "Input"; the rest is output.
  const { command, body } = useMemo(() => {
    const lines = t.content.split("\n");
    if (lines.length === 1) return { command: lines[0].trim(), body: "" };
    const first = lines[0].trim();
    const looksLikeCmd = first.length > 0 && first.length <= 200 && CMD_RE.test(first) && !first.startsWith("{");
    return { command: looksLikeCmd ? first : "", body: looksLikeCmd ? lines.slice(1).join("\n") : lines.join("\n") };
  }, [t.content]);

  const pretty = useMemo(() => (body ? prettyJson(body) : null), [body]);
  const output = pretty ?? body;

  return (
    <div className="group relative min-w-0">
      <Tool
        defaultOpen={!dense}
        toolPart={{
          type: toolName,
          state: "output-available",
          input: command ? { command } : undefined,
          output: output ? { output } : undefined,
        }}
        className={cx(
          "mt-0 border-phantix-700/40 bg-phantix-950/70",
          dense ? "[&_pre]:!max-h-32 [&_*]:!text-[13px]" : "[&_pre]:!max-h-60",
        )}
      />
      <CopyBtn text={t.content} className="absolute right-2 top-2 z-10 !opacity-0 group-hover:!opacity-100" />
    </div>
  );
}

// Split a tool chunk's content into an optional command line + the output body.
export function splitToolContent(content: string): { command: string; body: string } {
  const lines = (content ?? "").split("\n");
  if (lines.length === 1) return { command: lines[0].trim(), body: "" };
  const first = lines[0].trim();
  const looksLikeCmd = first.length > 0 && first.length <= 200 && CMD_RE.test(first) && !first.startsWith("{");
  return { command: looksLikeCmd ? first : "", body: looksLikeCmd ? lines.slice(1).join("\n") : lines.join("\n") };
}

// ── Pi mid-turn helpers (pi_subagent) ────────────────────────────────────────
// The runner delegates bounded helper tasks to a headless `pi` process. Helpers
// render as compact cards — never full bubbles — and soft-fails are warnings.

const PI_SOFT_FAIL = /pi_not_installed|pi_auth_required|pi_timeout|pi_failed|pi_spawn_failed|task_required/i;

function piMeta(t: AgiTranscriptChunk): {
  profile: string;
  task: string;
  result: string;
  resultLine: string | null;
  failed: boolean;
  error: string | null;
  message: string | null;
  latencyMs: number | null;
  tools: string | null;
} {
  const meta = (t.meta ?? {}) as Record<string, unknown>;
  const content = t.content ?? "";
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  const resultLine = lines.find((l) => /^RESULT:/i.test(l)) ?? null;
  const error = typeof meta.error === "string" && meta.error ? meta.error : content.match(/\berror=([\w-]+)/i)?.[1] ?? null;
  const failed = meta.ok === false || Boolean(error && PI_SOFT_FAIL.test(error)) || PI_SOFT_FAIL.test(content);
  const task =
    (typeof meta.task === "string" && meta.task) ||
    content.match(/task='([^']*)'/i)?.[1] ||
    content.match(/task="([^"]*)"/i)?.[1] ||
    lines.find((l) => !/^RESULT:/i.test(l) && !/^\[PI_SUBAGENT/i.test(l)) ||
    "Helper task";
  return {
    profile: (typeof meta.profile === "string" && meta.profile) || content.match(/profile=(\w+)/i)?.[1] || "helper",
    task: task.replace(/^(Task|Helper task):\s*/i, "").trim() || "Helper task",
    result: (typeof meta.result_text === "string" && meta.result_text) || (resultLine ? content : ""),
    resultLine,
    failed,
    error,
    message: (typeof meta.message === "string" && meta.message) || null,
    latencyMs: typeof meta.latency_ms === "number" ? (meta.latency_ms as number) : Number(content.match(/latency_ms=(\d+)/i)?.[1] ?? NaN) || null,
    tools: (typeof meta.tools === "string" && meta.tools) || content.match(/tools=([^\s\]]+)/i)?.[1] || null,
  };
}

function PiHelperCard({ t, dense = false, observe = false }: { t: AgiTranscriptChunk; dense?: boolean; observe?: boolean }) {
  const [open, setOpen] = useState(false);
  const p = useMemo(() => piMeta(t), [t.content]);
  const title = p.profile === "scout" ? "Pi scout" : "Pi helper";
  const accent = p.failed
    ? { ring: "border-severity-medium/40 bg-severity-medium/[0.06]", icon: "bg-severity-medium/15 text-severity-medium", Icon: ShieldAlert }
    : { ring: "border-phantix-700/40 bg-phantix-900/50", icon: "bg-phantix-800/80 text-gold-400", Icon: Bot };

  return (
    <div className={cx("group relative min-w-0 overflow-hidden rounded-md border", dense ? "max-w-full" : "max-w-[94%]", accent.ring)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cx("flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-phantix-800/40", dense ? "py-1.5" : "py-2")}
      >
        <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", dense ? "h-5 w-5" : "", accent.icon)}>
          <accent.Icon size={12} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx("flex items-center gap-1.5", dense ? "text-[13px]" : "text-xs")}>
            <span className="truncate font-semibold text-slate-200">{title}</span>
            <span className="chip shrink-0 !px-1.5 !py-0 font-mono text-[11px] uppercase text-slate-400">{p.profile}</span>
            {p.latencyMs != null && <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-500">{(p.latencyMs / 1000).toFixed(1)}s</span>}
          </span>
          <span className={cx("block truncate text-slate-400", dense ? "text-[12px]" : "wb-xs")}>
            {p.failed && p.error
              ? `Helper unavailable (${p.error}). The main agent continues.`
              : observe
                ? "Helper result attached"
                : p.task}
          </span>
        </span>
        <span className={cx("shrink-0 text-slate-500 transition-transform", open && "rotate-180")}>
          <ChevronDown size={12} />
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-phantix-700/30 px-3 py-2.5">
          {p.task && <p className={cx("leading-relaxed text-slate-300", dense ? "text-[12px]" : "wb-xs")}>{p.task}</p>}
          {p.failed && p.message && (
            <p className={cx("leading-relaxed text-severity-medium", dense ? "text-[12px]" : "wb-xs")}>{p.message}</p>
          )}
          {(p.result || p.resultLine) && (
            <pre className={cx("wb-scroll overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-phantix-700/40 bg-phantix-950/70 p-2 font-mono leading-5 text-slate-300", dense ? "text-[12px]" : "text-[13px]")}>
              {p.resultLine ?? p.result}
            </pre>
          )}
          {p.tools && (
            <p className="font-mono text-[12px] text-slate-500">tools: {p.tools}</p>
          )}
        </div>
      )}
      <CopyBtn text={t.content} className="absolute right-2 top-2 z-10 !opacity-0 group-hover:!opacity-100" />
    </div>
  );
}

// ── Grouped tool calls ───────────────────────────────────────────────────────
// Consecutive runs of the same tool collapse into one expandable card
// ("http_get × 10") so a busy pipeline doesn't spam the timeline with a card
// per invocation. Output is linkified so URLs are clickable.
export function ToolGroupCard({
  tool,
  runs,
  dense = false,
}: {
  tool: string;
  runs: AgiTranscriptChunk[];
  dense?: boolean;
}) {
  const [open, setOpen] = useState(runs.length <= 1);
  const count = runs.length;
  const totalText = useMemo(() => runs.map((r) => r.content).join("\n"), [runs]);
  // Runs with neither a command nor a body render nothing inside the card, so a
  // group of them is only a header claiming a call that was never emitted.
  const hasPayload = useMemo(
    () =>
      runs.some((r) => {
        const { command, body } = splitToolContent(r.content);
        return Boolean(command || body);
      }),
    [runs],
  );
  if (!hasPayload) return null;
  return (
    <div className="group relative min-w-0 overflow-hidden rounded-md border border-phantix-700/40 bg-phantix-950/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cx(
          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-phantix-900/60",
          dense && "px-2 py-1.5",
        )}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-phantix-800/80 text-gold-400">
          <Terminal size={11} />
        </span>
        <span className={cx("truncate font-mono font-semibold text-slate-200", dense ? "text-[13px]" : "text-xs")}>{tool}</span>
        <span className="chip shrink-0 !px-1.5 !py-0 font-mono text-[12px] text-gold-300">× {count}</span>
        <span className={cx("ml-auto shrink-0 text-slate-500 transition-transform", open && "rotate-180")}>
          <ChevronDown size={12} />
        </span>
      </button>
      {open && (
        <div className={cx("wb-scroll space-y-1.5 overflow-y-auto border-t border-phantix-700/30", dense ? "max-h-40 px-2 py-1.5" : "max-h-72 px-3 py-2")}>
          {runs.map((r, i) => {
            const { command, body } = splitToolContent(r.content);
            const output = body || command;
            return (
              <div key={i} className="rounded-lg bg-phantix-900/50 px-2.5 py-1.5">
                {command && <p className={cx("font-mono text-slate-500", dense ? "text-[12px]" : "text-[13px]")}>{linkify(command, "text-gold-300/90 break-all hover:text-gold-200")}</p>}
                {output && (
                  <p className={cx("whitespace-pre-wrap break-words font-mono leading-5 text-slate-300", dense ? "text-[12px]" : "text-[13px]")}>
                    {linkify(output)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      <CopyBtn text={totalText} className="absolute right-2 top-2 z-10 !opacity-0 group-hover:!opacity-100" />
    </div>
  );
}

// ── Agent clarification ask (ASK_OPERATOR) ───────────────────────────────────
// Renders while the backend has an open clarification (session.clarification
// status "open" / meta.kind "clarification_needed"). Optional option chips
// submit directly; free text goes through the input. The answer is POSTed to
// …/clarify as { clarification_id, answer }, which resumes the loop.
export function ClarificationAsk({
  clarification,
  onAnswer,
  busy = false,
  dense = false,
}: {
  clarification: { clarification_id: string; question: string; options?: string[]; allow_free_text?: boolean };
  onAnswer: (clarificationId: string, answer: string) => void;
  busy?: boolean;
  dense?: boolean;
}) {
  const [text, setText] = useState("");
  const submit = (answer: string) => {
    const a = answer.trim();
    if (!a || busy) return;
    onAnswer(clarification.clarification_id, a);
    setText("");
  };
  const options = clarification.options ?? [];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cx("rounded-md border border-gold-400/30 bg-gold-400/5 p-3", dense ? "max-w-full" : "max-w-[94%]")}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-gold-200">
        <HelpCircle size={13} /> Agent needs a clarification
      </p>
      <p className="mt-1.5 text-sm leading-6 text-slate-200">{linkify(clarification.question)}</p>
      {options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              disabled={busy}
              onClick={() => submit(o)}
              className="rounded-full border border-gold-400/40 bg-gold-400/10 px-2.5 py-1 text-xs font-medium text-gold-200 transition-colors hover:bg-gold-400/20 disabled:opacity-50"
            >
              {o}
            </button>
          ))}
        </div>
      )}
      {clarification.allow_free_text !== false && (
        <div className="mt-2 flex items-center gap-2">
          <input
            className="input flex-1 !py-1.5 text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && text.trim() && !busy) submit(text); }}
            placeholder="Type your answer…"
            disabled={busy}
          />
          <button className="btn-primary !px-3 !py-1.5 wb-xs" disabled={!text.trim() || busy} onClick={() => submit(text)}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Reply
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ── Inline issues strip ──────────────────────────────────────────────────────
// Lists verified/candidate findings compactly with a link out to the findings
// tracker so issues are visible in the drawer without the full console.
export function IssuesStrip({
  findings,
  href,
}: {
  findings: Array<{ title: string; severity?: string; status?: string; cve?: string; target?: string }>;
  href: string;
}) {
  if (!findings || findings.length === 0) return null;
  return (
    <div className="rounded-md border border-phantix-700/40 bg-phantix-900/50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">
          Issues found ({findings.length})
        </p>
        <a href={href} className="text-[12px] font-medium text-gold-300 underline decoration-gold-400/40 underline-offset-2 hover:text-gold-200">
          Open tracker →
        </a>
      </div>
      <div className="mt-1.5 space-y-1">
        {findings.slice(0, 8).map((f, i) => {
          const sev = (f.severity ?? "info").toLowerCase() as Severity;
          return (
            <a
              key={i}
              href={href}
              className="flex items-center gap-2 rounded-lg bg-phantix-950/50 px-2 py-1 text-xs transition-colors hover:bg-phantix-800/50"
            >
              <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", SEV_DOT[sev] ?? "bg-slate-500")} />
              <span className="min-w-0 flex-1 truncate text-slate-300">{f.title}</span>
              {f.cve && <span className="shrink-0 font-mono text-[11px] text-gold-400">{f.cve}</span>}
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ── Engine / system events ────────────────────────────────────────────────────

//: System-line chip label by event, so every line says what it actually is.
const EVENT_LABEL: Record<string, string> = {
  session_start: "session",
  info_request: "info needed",
  instruction: "operator",
  tools_to_provision: "tools",
  tool_install_request: "tools",
  tool_install_session_ok: "tools",
  skill_search: "skill",
  skill_load: "skill",
  skill_select: "skill",
  policy_block: "policy",
  loop_stop: "loop",
  job_done_accepted: "job done",
  job_done_rejected: "job open",
  job_blocked: "blocked",
  teardown: "session",
  ai_credit_spend: "credits",
  finding_dropped: "verification",
};

const EVENT_CARD: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  campaign_done: { label: "Breadth campaign", icon: Radar, tone: "text-sky-300 border-sky-400/25 bg-sky-500/5" },
  decision_review: { label: "Decision review", icon: ListChecks, tone: "text-gold-300 border-gold-400/25 bg-gold-400/5" },
  verify_all: { label: "Verification", icon: ShieldCheck, tone: "text-emerald-300 border-emerald-400/25 bg-emerald-400/5" },
  finding_dropped: { label: "Candidate dropped", icon: XCircle, tone: "text-slate-400 border-phantix-700/40 bg-phantix-900/50" },
  loop_paused: { label: "Paused", icon: Pause, tone: "text-amber-300 border-amber-400/25 bg-amber-400/5" },
  loop_resumed: { label: "Resumed", icon: Play, tone: "text-emerald-300 border-emerald-400/25 bg-emerald-400/5" },
};

function StatChip({ label, value, tone = "text-slate-200" }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-phantix-700/40 bg-phantix-950/60 px-2 py-1">
      <span className="wb-2xs uppercase tracking-wider text-slate-500">{label}</span>
      <span className={cx("wb-sm font-semibold tabular-nums", tone)}>{value}</span>
    </span>
  );
}

/** Rich card for the harness events the operator should never have to guess at. */
function SystemEventCard({ t, dense = false }: { t: AgiTranscriptChunk; dense?: boolean }) {
  const meta = (t.meta || {}) as Record<string, unknown>;
  const kind = String(meta.kind || "");
  const cfg = EVENT_CARD[kind];
  if (!cfg) return <SystemLine t={t} dense={dense} />;
  const Icon = cfg.icon;
  const time = streamTime(t.created_at);

  return (
    <div className={cx("group flex justify-start", dense ? "w-full" : "max-w-[94%]")}>
      <div className={cx("w-full rounded-lg border px-3 py-2", cfg.tone)}>
        <p className="mb-1.5 flex items-center gap-2">
          <Icon size={12} />
          <span className="wb-2xs font-semibold uppercase tracking-wider">{cfg.label}</span>
          {time && <span className="wb-2xs ml-auto tabular-nums text-slate-500">{time}</span>}
        </p>
        {kind === "decision_review" && (
          <div className="space-y-1.5">
            <p className="wb-sm text-slate-200">{t.content}</p>
            {Array.isArray(meta.unresolved) && (meta.unresolved as string[]).length > 0 && (
              <div>
                <p className="wb-2xs uppercase tracking-wider text-slate-500">Open leads</p>
                <ul className="wb-sm list-disc space-y-0.5 pl-4 text-slate-300">
                  {(meta.unresolved as string[]).slice(0, 8).map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(meta.next) && (meta.next as string[]).length > 0 && (
              <p className="wb-sm text-gold-200">Next: {(meta.next as string[]).join(", ")}</p>
            )}
          </div>
        )}
        {kind === "verify_all" && (
          <div className="flex flex-wrap gap-1.5">
            <StatChip label="checked" value={Number(meta.count || 0)} />
            <StatChip label="confirmed" value={Number(meta.verified || 0)} tone="text-emerald-300" />
            <StatChip label="dismissed" value={Number(meta.dismissed || 0)} tone="text-severity-critical" />
            <StatChip label="inconclusive" value={Number(meta.inconclusive || 0)} tone="text-amber-300" />
          </div>
        )}
        {kind === "campaign_done" && (
          <div className="flex flex-wrap gap-1.5">
            <StatChip label="assets" value={Number(meta.assets || 0)} />
            <StatChip label="findings" value={Number(meta.found || 0)} tone="text-gold-300" />
            <StatChip
              label="time"
              value={`${Number((meta.summary as Record<string, unknown> | undefined)?.elapsed || 0)}s`}
            />
            {Array.isArray((meta.summary as Record<string, unknown> | undefined)?.categories) && (
              <StatChip
                label="categories"
                value={(((meta.summary as Record<string, unknown>).categories as string[]) || []).join(", ") || "none"}
              />
            )}
          </div>
        )}
        {kind === "finding_dropped" && (
          <div className="space-y-1">
            <p className="wb-sm text-slate-300">{t.content}</p>
            <p className="wb-2xs text-slate-500">
              Dropped before recording. The evidence is kept, the noise is not.
            </p>
          </div>
        )}
        {(kind === "loop_paused" || kind === "loop_resumed") && (
          <p className="wb-sm text-slate-300">{t.content}</p>
        )}
      </div>
    </div>
  );
}

const FINDING_RE = /^(.*?)\[(critical|high|medium|low|info)\]\s*:?\s*(.*)$/i;

function SystemLine({ t, dense = false }: { t: AgiTranscriptChunk; dense?: boolean }) {
  const time = streamTime(t.created_at);
  const m = t.content.match(FINDING_RE);
  const sev = (m?.[2]?.toLowerCase() ?? null) as Severity | null;
  const isFinding = !!m && /finding/i.test(m[1] ?? "");

  if (isFinding && sev) {
    return (
      <div className="group flex justify-start">
        <div className="flex max-w-[94%] items-start gap-2 rounded-md border border-phantix-700/30 bg-phantix-900/50 px-2.5 py-1.5">
          <ShieldAlert size={12} className={cx("mt-0.5 shrink-0", sev === "critical" ? "text-severity-critical" : sev === "high" ? "text-severity-high" : sev === "medium" ? "text-severity-medium" : "text-slate-500")} />
          <p className={cx("min-w-0 font-mono leading-5 text-slate-400", dense ? "wb-xs" : "wb-sm")}>
            <span className="mr-1.5 inline-flex items-center gap-1 font-semibold capitalize">
              <span className={cx("h-1.5 w-1.5 rounded-full", SEV_DOT[sev])} />
              {sev}
            </span>
            <span className="break-words">{m[3]}</span>
            {time && <span className="wb-2xs ml-1.5 tabular-nums text-slate-600">{time}</span>}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex justify-start">
      <p className={cx("max-w-[94%] font-mono leading-5 text-slate-500", dense ? "wb-xs" : "wb-sm")}>
        <span className="wb-2xs mr-1.5 inline-flex items-center gap-1 rounded border border-phantix-700/40 bg-phantix-900/60 px-1 py-px font-sans font-semibold uppercase tracking-wider text-slate-500">
          <Radar size={8} /> {EVENT_LABEL[String((t.meta || {}).event || "")] || "engine"}
        </span>
        <span className="whitespace-pre-wrap break-words">{t.content}</span>
        {time && <span className="wb-2xs ml-1.5 tabular-nums text-slate-600">{time}</span>}
      </p>
    </div>
  );
}

// ── Message renderer ──────────────────────────────────────────────────────────

export type StreamMessageProps = {
  t: AgiTranscriptChunk;
  /** Show the streaming caret (last live chunk while the loop runs). */
  last?: boolean;
  /** Compact chrome for swimlane columns. */
  dense?: boolean;
};

export const StreamMessage = memo(function StreamMessage({ t, last = false, dense = false }: StreamMessageProps) {
  const time = streamTime(t.created_at);

  if (t.role === "tool") {
    // No response yet means nothing to show, full stop — a tool name alone (no
    // output) still isn't a real answer. Without this guard every
    // tool-call-started event with no output rendered as an empty bordered box.
    if (!t.content.trim()) return null;
    // Pi mid-turn helpers render as compact cards, not generic tool dumps.
    if (t.meta?.tool === "pi_subagent") {
      return (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex justify-start"
        >
          <PiHelperCard t={t} dense={dense} />
        </motion.div>
      );
    }
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="flex justify-start"
      >
        <div className={cx("min-w-0", dense ? "w-full" : "max-w-[94%]")}>
          <ToolCallCard t={t} dense={dense} />
        </div>
      </motion.div>
    );
  }

  // `[PI_SUBAGENT …]` observe lines are redundant with the structured helper
  // cards — collapse them so the timeline stays scannable.
  if (/^\s*\[PI_SUBAGENT\b/i.test(t.content)) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className="flex justify-start"
      >
        <PiHelperCard t={t} dense={dense} observe />
      </motion.div>
    );
  }

  if (t.role === "system") {
    // An engine row that carried no payload and no known event kind has nothing
    // to show; the card would only claim an event that arrived without data.
    if (!t.content.trim() && !EVENT_CARD[String(t.meta?.kind ?? "")]) return null;
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
        <SystemEventCard t={t} dense={dense} />
      </motion.div>
    );
  }

  if (t.role === "operator") {
    const sending = t.seq === -1;
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="group flex justify-end"
      >
        <div className={cx("min-w-0", dense ? "max-w-full" : "max-w-[85%]")}>
          <p className="wb-2xs mb-0.5 flex items-center justify-end gap-1.5 px-0.5 text-slate-500">
            {sending && (
              <span className="flex items-center gap-1 text-gold-400/80">
                <Loader2 size={9} className="animate-spin" /> sending…
              </span>
            )}
            <User size={9} className="text-gold-400/70" />
            <span className="font-semibold uppercase tracking-wider text-gold-300/80">You</span>
            {time && <span className="tabular-nums">{time}</span>}
          </p>
          <div
            className={cx(
              "wb-base rounded-md rounded-tr-sm border border-gold-400/25 bg-gold-400/12 px-3 py-2 text-gold-100 shadow-sm",
              sending && "animate-pulse",
            )}
          >
            <span className="whitespace-pre-wrap break-words">{t.content}</span>
          </div>
        </div>
      </motion.div>
    );
  }

  // assistant (default)
  const persona = PERSONA_META[personaForChunk(t)];
  // A row with nothing to say must not draw chrome: the backend opens an
  // assistant row per turn and sometimes never fills it, and each one rendered
  // as an empty bordered bubble with avatar and label.
  if (!t.content.trim()) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="group flex justify-start gap-2"
    >
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-gold-400/25 bg-gradient-to-br from-gold-400/15 to-transparent text-gold-400">
        <Bot size={12} />
      </span>
      <div className={cx("min-w-0", dense ? "max-w-full" : "max-w-[92%]")}>
        <p className="wb-2xs mb-0.5 flex items-center gap-1.5 px-0.5 text-slate-500">
          <span className={cx("font-semibold uppercase tracking-wider", persona.tint)}>{persona.label}</span>
          {time && <span className="tabular-nums">{time}</span>}
          <CopyBtn text={t.content} className="!p-0.5" />
        </p>
        <div className="wb-base rounded-md rounded-tl-sm border border-phantix-700/40 bg-phantix-800/55 px-3 py-2 text-slate-200 shadow-sm">
          <StreamMarkdown source={t.content} />
          {last && <StreamCaret />}
        </div>
      </div>
    </motion.div>
  );
});

StreamMessage.displayName = "StreamMessage";

// ── Working / typing indicator ────────────────────────────────────────────────

export function TypingIndicator({ label, tool }: { label?: string | null; tool?: string | null }) {
  const text = (label ?? "").trim();
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex items-center gap-2.5 rounded-md border border-phantix-700/40 bg-phantix-900/60 px-3 py-2"
    >
      <span className="flex shrink-0 items-center gap-1 px-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold-400"
            style={{ animationDelay: `${i * 160}ms`, animationDuration: "0.9s" }}
          />
        ))}
      </span>
      <span className="wb-sm min-w-0 flex-1 truncate text-slate-300">
        {text || "Working on the scoped assessment."}
      </span>
      {tool && <span className="chip shrink-0 !px-1.5 !py-0 wb-2xs font-mono text-gold-300">{tool}</span>}
    </motion.div>
  );
}

// ── Awaiting-authorization cue ──────────────────────────────────────────────
// Rendered inline in the stream when one or more steps are gated. Instead of a
// generic "awaiting engine output", it reveals the approval path: review and
// decide in the Human gate, or (customer side) the Authorizations queue.

export function ApprovalNotice({
  count = 1,
  stateChanging = true,
  authorizationsHref,
  dense = false,
}: {
  count?: number;
  /** State-changing steps require a second authorizer via the queue. */
  stateChanging?: boolean;
  /** Link to the authorizer approval queue (command centre: "/authorizations"). */
  authorizationsHref?: string;
  dense?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex justify-start"
    >
      <div className={cx("flex items-start gap-2.5 rounded-md border border-severity-medium/40 bg-severity-medium/10 px-3 py-2.5", dense ? "max-w-full" : "max-w-[94%]")}>
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-severity-medium/15 text-severity-medium">
          <ShieldCheck size={13} className="animate-pulse" />
        </span>
        <div className="min-w-0">
          <p className={cx("font-semibold text-amber-200", dense ? "wb-xs" : "wb-sm")}>
            Paused. Waiting for authorization{count > 1 ? ` (${count} steps)` : ""}
          </p>
          <p className={cx("mt-0.5 leading-relaxed text-slate-400", dense ? "wb-2xs" : "wb-xs")}>
            {stateChanging
              ? authorizationsHref
                ? "This state-changing step is held for dual control. Ask an authorizer to approve it in the Authorizations queue."
                : "This state-changing step is held for approval. Review and decide it in the Human gate."
              : "This step is held pending approval."}
          </p>
          {stateChanging && authorizationsHref && (
            <a
              href={authorizationsHref}
              className={cx("mt-1 inline-flex items-center gap-1 font-medium text-gold-300 underline decoration-gold-400/40 underline-offset-2 hover:text-gold-200", dense ? "wb-2xs" : "wb-xs")}
            >
              Open the Authorizations queue <ArrowRight size={11} />
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Empty stream placeholder ──────────────────────────────────────────────────

export function StreamEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-phantix-700/40 bg-phantix-900/60 text-gold-400">
        <Crosshair size={16} className="animate-pulse" />
      </span>
      <p className="wb-sm font-medium text-slate-400">{title}</p>
      {hint && <p className="wb-xs max-w-[260px] leading-relaxed text-slate-600">{hint}</p>}
    </div>
  );
}
