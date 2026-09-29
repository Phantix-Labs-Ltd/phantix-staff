// SECUREGRAPH AGI Management — staff portal data module.
// Mirrors app/engines/control_plane/api/admin/admin_agi.py (base /admin/agi).
// Demo-mode fallbacks so the portal is usable without a live runner.

import { api, ApiError, API_BASE, DEMO_MODE, delay } from "./api";
import type {
  AgiAction,
  AgiActivePolicy,
  AgiChatResponse,
  AgiEngagement,
  AgiFinding,
  AgiLoopBrief,
  AgiLoopItem,
  AgiPolicy,
  AgiSession,
  AgiSkill,
  AgiStatus,
  AgiToolInstallRequest,
  AgiTranscriptChunk,
  AgiEngineOp,
  AgiEngineCapability,
  AgiSessionJob,
  AgiApkAsset,
  AgiJobObjective,
  AgiSkillPlan,
  AgiSkillPlanItem,
  AgiToolToProvision,
  AgiSelectedSkillChip,
} from "./types";

/** Session start may wait on Docker provision (~120s). Do not use the default short fetch. */
export const AGI_SESSION_START_TIMEOUT_MS = 180_000;

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asStr(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  return String(v);
}

function asLoopItem(raw: unknown): AgiLoopItem {
  const o = asObj(raw);
  return {
    title: asStr(o.title),
    detail: asStr(o.detail),
    severity: asStr(o.severity),
    target: asStr(o.target),
    tool: asStr(o.tool),
    reason: asStr(o.reason),
    action: asStr(o.action),
  };
}

/** Always-safe loop brief — never throws on missing/extra keys. */
export function normalizeAgiLoop(raw: unknown): AgiLoopBrief {
  const o = asObj(raw);
  return {
    schema: asStr(o.schema, "phantix.agi.loop_brief.v1"),
    event: asStr(o.event),
    session_id: o.session_id != null ? Number(o.session_id) : undefined,
    turn: o.turn != null ? Number(o.turn) : undefined,
    turn_index: o.turn_index != null ? Number(o.turn_index) : undefined,
    max_turns: o.max_turns != null ? Number(o.max_turns) : undefined,
    phase: asStr(o.phase),
    loop_status: asStr(o.loop_status),
    job_status: asStr(o.job_status),
    active_phase: asStr(o.active_phase),
    working_on: asStr(o.working_on),
    summary: asStr(o.summary),
    found: Array.isArray(o.found) ? o.found.map(asLoopItem) : [],
    next: Array.isArray(o.next) ? o.next.map(asLoopItem) : [],
    blockers: Array.isArray(o.blockers) ? o.blockers.map(asLoopItem) : [],
    tools_this_turn: Array.isArray(o.tools_this_turn) ? o.tools_this_turn.map(String) : [],
    tools_run_total: o.tools_run_total != null ? Number(o.tools_run_total) : 0,
    findings_count: o.findings_count != null ? Number(o.findings_count) : 0,
    open_objectives: Array.isArray(o.open_objectives) ? o.open_objectives.map(String) : [],
    pending_approvals: o.pending_approvals != null ? Number(o.pending_approvals) : 0,
    open_info_requests: o.open_info_requests != null ? Number(o.open_info_requests) : 0,
    reason: asStr(o.reason),
    content: asStr(o.content),
  };
}

/** Session read — always has job + loop objects after normalize. */
export function normalizeAgiSession(raw: unknown): AgiSession {
  const o = asObj(raw);
  const meta = asObj(o.meta);
  const jobRaw = o.job != null ? o.job : {};
  const job = typeof jobRaw === "object" && jobRaw !== null ? (jobRaw as AgiSessionJob) : ({ job_status: "" } as AgiSessionJob);
  return {
    id: Number(o.id ?? 0),
    engagement_id: Number(o.engagement_id ?? 0),
    started_by_staff_id: o.started_by_staff_id == null ? null : Number(o.started_by_staff_id),
    container_id: o.container_id == null ? null : String(o.container_id),
    runner_session_id: o.runner_session_id == null ? null : String(o.runner_session_id),
    status: asStr(o.status, "unknown"),
    started_at: asStr(o.started_at, new Date().toISOString()),
    ended_at: o.ended_at == null ? null : String(o.ended_at),
    teardown_reason: o.teardown_reason == null ? null : String(o.teardown_reason),
    meta: Object.keys(meta).length ? meta : {},
    job,
    loop: normalizeAgiLoop(o.loop),
    loop_status: o.loop_status === "stopped" || o.loop_status === "running" ? o.loop_status : null,
    loop_stop_reason: o.loop_stop_reason == null ? null : String(o.loop_stop_reason),
    clarification: o.clarification != null && typeof o.clarification === "object" ? (o.clarification as Record<string, unknown>) : null,
  };
}

/** Chat envelope — never a bare string. */
export function normalizeAgiChat(raw: unknown): AgiChatResponse {
  if (typeof raw === "string") {
    return { ok: true, accepted: true, queued: false, blocked: false, reply: raw, reply_kind: "assistant", job: {}, loop: normalizeAgiLoop({}), found: [], next: [], blockers: [] };
  }
  const o = asObj(raw);
  const reply = typeof o.reply === "string" ? o.reply : typeof o.message === "string" ? o.message : typeof o.content === "string" ? o.content : "";
  return {
    schema_version: asStr(o.schema_version, "phantix.agi.chat.v1"),
    ok: o.ok !== false,
    session_id: o.session_id != null ? Number(o.session_id) : undefined,
    accepted: o.accepted !== false,
    queued: Boolean(o.queued),
    blocked: Boolean(o.blocked),
    mock: Boolean(o.mock),
    code: asStr(o.code),
    reply,
    reply_kind: asStr(o.reply_kind, "assistant"),
    findings_count: o.findings_count != null ? Number(o.findings_count) : 0,
    job: asObj(o.job),
    loop: normalizeAgiLoop(o.loop),
    found: Array.isArray(o.found) ? o.found.map(asLoopItem) : [],
    next: Array.isArray(o.next) ? o.next.map(asLoopItem) : [],
    blockers: Array.isArray(o.blockers) ? o.blockers.map(asLoopItem) : [],
    transcript_seq: o.transcript_seq == null ? null : Number(o.transcript_seq),
  };
}

/** Findings list — bare array or { findings: [] }. */
export function normalizeAgiFindings(raw: unknown): AgiFinding[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { findings?: unknown }).findings)
      ? (raw as { findings: unknown[] }).findings
      : [];
  return list.map((item, i) => {
    const o = asObj(item);
    const id = o.id ?? o.finding_id ?? `f-${i}`;
    const ev = o.evidence;
    // Structured proof (request/response/summary) is preferred when the runner
    // sent it; it is what makes each finding auditable at a glance.
    const ed = o.evidence_detail && typeof o.evidence_detail === "object" ? asObj(o.evidence_detail) : null;
    let evidence: AgiFinding["evidence"] = null;
    if (ed) {
      evidence = {
        request: asStr(ed.request),
        response: asStr(ed.response_excerpt) || asStr(ed.response),
        notes: asStr(ed.summary) || asStr(ed.notes),
        hash: asStr(ed.hash),
      };
    } else if (typeof ev === "string") evidence = ev;
    else if (ev && typeof ev === "object") {
      const e = asObj(ev);
      evidence = {
        request: asStr(e.request),
        response: asStr(e.response),
        hash: asStr(e.hash),
        notes: asStr(e.notes),
      };
    }
    return {
      id: typeof id === "number" || typeof id === "string" ? id : String(id),
      session_id: o.session_id != null ? Number(o.session_id) : undefined,
      finding_id: o.finding_id != null ? String(o.finding_id) : undefined,
      title: asStr(o.title, "Finding"),
      severity: asStr(o.severity, "info").toLowerCase(),
      evidence,
      source: o.source != null ? String(o.source) : undefined,
      tool: o.tool == null ? null : String(o.tool),
      target: o.target == null ? null : String(o.target),
      status: o.status != null ? String(o.status) : undefined,
      notes: o.notes == null ? null : String(o.notes),
      created_at: o.created_at != null ? String(o.created_at) : undefined,
      risk_id: o.risk_id == null ? null : Number(o.risk_id),
      cve: o.cve == null ? null : String(o.cve),
      category: o.category == null ? null : String(o.category),
      tags: Array.isArray(o.tags) ? o.tags.map(String) : [],
      highlight: Boolean(o.highlight),
      report_highlight: Boolean(o.report_highlight),
      business_impact: o.business_impact == null ? null : String(o.business_impact),
      impact_level: o.impact_level == null ? null : String(o.impact_level),
      impact_analysis: o.impact_analysis && typeof o.impact_analysis === "object" ? (o.impact_analysis as AgiFinding["impact_analysis"]) : null,
      authenticated: o.authenticated != null ? Boolean(o.authenticated) : undefined,
      rule_id: o.rule_id == null ? null : String(o.rule_id),
      node_id: o.node_id == null ? null : String(o.node_id),
      verification:
        o.verification && typeof o.verification === "object"
          ? {
              verdict: asStr((o.verification as Record<string, unknown>).verdict) || undefined,
              verifier: asStr((o.verification as Record<string, unknown>).verifier) || undefined,
              reason: asStr((o.verification as Record<string, unknown>).reason) || undefined,
              evidence: asStr((o.verification as Record<string, unknown>).evidence) || undefined,
              subagent: asStr((o.verification as Record<string, unknown>).subagent) || undefined,
              confidence:
                typeof (o.verification as Record<string, unknown>).confidence === "number"
                  ? ((o.verification as Record<string, unknown>).confidence as number)
                  : null,
              needs_review: Boolean((o.verification as Record<string, unknown>).needs_review),
              decided_at: asStr((o.verification as Record<string, unknown>).decided_at) || undefined,
            }
          : null,
    };
  });
}

/** Prefer highlight / report_highlight first, then severity rank. */
export function sortAgiFindings(findings: AgiFinding[]): AgiFinding[] {
  const sevRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return [...findings].sort((a, b) => {
    const ha = a.highlight || a.report_highlight ? 0 : 1;
    const hb = b.highlight || b.report_highlight ? 0 : 1;
    if (ha !== hb) return ha - hb;
    return (sevRank[String(a.severity).toLowerCase()] ?? 5) - (sevRank[String(b.severity).toLowerCase()] ?? 5);
  });
}

const ACTIVE_SESSION_KEY = "phantix_staff_agi_active_session";

export function persistAgiSession(s: { id: number; engagement_id: number } | null): void {
  try {
    if (!s) localStorage.removeItem(ACTIVE_SESSION_KEY);
    else localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ id: s.id, engagement_id: s.engagement_id }));
  } catch { /* ignore */ }
}

function readPersistedAgiSession(): { id: number; engagement_id: number } | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { id?: number; engagement_id?: number };
    if (typeof p.id === "number") return { id: p.id, engagement_id: Number(p.engagement_id ?? 0) };
  } catch { /* ignore */ }
  return null;
}

function isLiveStatus(status: string): boolean {
  return status === "running" || status === "provisioning" || status === "paused";
}

// ── Demo fixtures ─────────────────────────────────────────────────────────────
const demoTx: AgiTranscriptChunk[] = [];
let demoSeq = 0;
let liveDemoSession: AgiSession | null = null;

const demoStatus: AgiStatus = {
  enabled: true,
  runner_url: "http://127.0.0.1:8095",
  runner_reachable: true,
  runner_detail: "Autonomous Agent runner is healthy",
  deepseek_only: true,
  default_image: "phantix-agi-sandbox:latest",
};

const demoPolicies: AgiPolicy[] = [
  { id: 1, version: "1.0.0", title: "Autonomous Pentest Agent Usage Agreement", is_active: true, published_at: new Date().toISOString(), created_at: new Date().toISOString() },
];

const demoActivePolicy: AgiActivePolicy = {
  id: 1,
  version: "1.0.0",
  title: "Autonomous Pentest Agent Usage Agreement",
  body_md: "# Autonomous Pentest Agent — Usage Agreement\n\nRead-only steps stream live. State-changing steps wait for your approval. Sessions destroy their containers when stopped. No host/server info, no other orgs, no direct DB access.",
  security_policy: { principles: ["scope-limited", "approval-gated", "container-isolated"] },
  is_active: true,
  published_at: new Date().toISOString(),
};

const demoEngagements: AgiEngagement[] = [
  {
    id: 11,
    organization_id: 42,
    created_by_staff_id: 1,
    name: "Acme Q3 external web",
    description: "ROE agreed 2026-08-01",
    scope_definition: {
      target_allowlist: ["203.0.113.10", "app.acme-lab.example", "https://app.acme-lab.example"],
      forbidden_actions: ["dos", "ransomware", "data_exfil_bulk"],
      rules_of_engagement: "Business hours only. Stop on PII.",
      max_session_minutes: 180,
    },
    status: "ready",
    config: { prompts: {}, tools: ["httpx", "nmap_safe", "nuclei_safe"], skills: { auto_select: true, auto_select_limit: 6 } },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    torn_down_at: null,
  },
  {
    id: 12,
    organization_id: 11,
    created_by_staff_id: 1,
    name: "Finlab internal network",
    description: "Internal posture verification",
    scope_definition: {
      target_allowlist: ["10.20.0.0/24", "staging.finlab.example"],
      forbidden_actions: ["dos"],
      rules_of_engagement: "Lab network only.",
      max_session_minutes: 60,
    },
    status: "draft",
    config: null,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    torn_down_at: null,
  },
];

const demoSessions: AgiSession[] = [
  {
    id: 101,
    engagement_id: 11,
    started_by_staff_id: 1,
    container_id: "agi-ctr-101",
    runner_session_id: "rs-101",
    status: "running",
    started_at: new Date(Date.now() - 600000).toISOString(),
    ended_at: null,
    teardown_reason: null,
    meta: { report: { report_id: 99, source: "phantix_agi" } },
  },
];

const demoActions: AgiAction[] = [
  {
    id: 501,
    session_id: 101,
    action_type: "state_changing",
    tool_name: "http_probe",
    proposed_command: "POST https://app.acme-lab.example/login -d 'username=admin&password=test'",
    rationale: "Verify default credentials on the in-scope login endpoint (lab only).",
    status: "pending_approval",
    approved_by_staff_id: null,
    decision_notes: null,
    result_summary: null,
    created_at: new Date().toISOString(),
    decided_at: null,
    executed_at: null,
  },
  {
    id: 502,
    session_id: 101,
    action_type: "tool_install",
    tool_name: "sqlmap",
    proposed_command: "apt-get install -y sqlmap",
    rationale: "Tool missing in container; installs only in this engagement container.",
    status: "pending_approval",
    approved_by_staff_id: null,
    decision_notes: null,
    result_summary: null,
    created_at: new Date().toISOString(),
    decided_at: null,
    executed_at: null,
  },
];

const demoToolInstalls: AgiToolInstallRequest[] = [
  { id: 1, session_id: 101, engagement_id: 11, organization_id: 42, tool_name: "whatweb", package_hint: "whatweb", install_command: "apt-get install -y whatweb", rationale: "fingerprint web tech for recon", skill_id: "agi.tool.whatweb", skill_id_minted: "agi.tool.whatweb", engine_id: "scanner_engine", status: "pending_admin", result_summary: null, created_at: new Date().toISOString(), decided_at: null },
  { id: 2, session_id: 101, engagement_id: 11, organization_id: 42, tool_name: "feroxbuster", package_hint: "feroxbuster", install_command: "apt-get install -y feroxbuster", rationale: "Directory brute-force tool", skill_id: "agi.learned.feroxbuster", engine_id: "scanner_engine", status: "pending_admin", result_summary: null, created_at: new Date(Date.now() - 3600000).toISOString(), decided_at: null },
];

const demoSills: AgiSkill[] = [
  { id: 1, skill_id: "agi.web.http-fingerprint", version: "1.0.0", title: "HTTP fingerprinting", kind: "web", status: "active", document: { body_md: "GET / and record headers" }, skill_md: "# HTTP fingerprinting\n1. GET /", organization_id: null, parent_skill_id: null, source: "manual", score: 0.82, uses: 14, successes: 12, failures: 2, approvals: 3, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 2, skill_id: "agi.learned.sqlmap", version: "0.1.0", title: "SQLi verification (learned)", kind: "exploit_verify", status: "candidate", document: { body_md: "Run sqlmap --batch" }, skill_md: "# SQLi verification", organization_id: 42, parent_skill_id: null, source: "auto_mint", score: 0.62, uses: 2, successes: 2, failures: 0, approvals: 1, rejections: 0, source_session_id: 101, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 3, skill_id: "agi.recon.public-sensitive-exposure", version: "1.0.0", title: "Public website sensitive information crawl", kind: "recon", status: "active", document: { body_md: "Crawl public site for secrets, .env, exposed files" }, skill_md: "# Public sensitive crawl", organization_id: null, parent_skill_id: null, source: "manual", score: 0.91, uses: 42, successes: 39, failures: 3, approvals: 8, rejections: 1, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 4, skill_id: "agi.recon.subdomain-enumeration", version: "1.0.0", title: "Subdomain enumeration", kind: "recon", status: "active", document: { body_md: "Enumerate subdomains via passive + active sources" }, skill_md: "# Subdomain enumeration", organization_id: null, parent_skill_id: null, source: "manual", score: 0.88, uses: 37, successes: 33, failures: 4, approvals: 6, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 5, skill_id: "agi.recon.http-surface", version: "1.0.0", title: "HTTP surface mapping", kind: "recon", status: "active", document: { body_md: "Map HTTP endpoints, paths, and entry points" }, skill_md: "# HTTP surface", organization_id: null, parent_skill_id: null, source: "manual", score: 0.9, uses: 45, successes: 41, failures: 4, approvals: 7, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 6, skill_id: "agi.recon.dns-enumeration", version: "1.0.0", title: "DNS & zone enumeration", kind: "recon", status: "active", document: { body_md: "DNS records, AXFR, and resolver checks" }, skill_md: "# DNS enumeration", organization_id: null, parent_skill_id: null, source: "manual", score: 0.79, uses: 21, successes: 18, failures: 3, approvals: 4, rejections: 1, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 7, skill_id: "agi.soc.log-triage", version: "1.0.0", title: "Log & detection triage", kind: "soc", status: "active", document: { body_md: "Triage detections, correlate, prioritise" }, skill_md: "# SOC log triage", organization_id: null, parent_skill_id: null, source: "manual", score: 0.85, uses: 28, successes: 25, failures: 3, approvals: 5, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 8, skill_id: "agi.soc.case-investigation", version: "1.0.0", title: "Incident case investigation", kind: "soc", status: "candidate", document: { body_md: "Investigate cases with timeline and evidence" }, skill_md: "# Case investigation", organization_id: null, parent_skill_id: null, source: "auto_mint", score: 0.68, uses: 9, successes: 7, failures: 2, approvals: 2, rejections: 1, source_session_id: 104, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 9, skill_id: "agi.soc.detection-tuning", version: "1.0.0", title: "Detection rule tuning", kind: "soc", status: "active", document: { body_md: "Refine detection rules and reduce false positives" }, skill_md: "# Detection tuning", organization_id: null, parent_skill_id: null, source: "manual", score: 0.74, uses: 16, successes: 13, failures: 3, approvals: 3, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 10, skill_id: "agi.web.idor-check", version: "1.0.0", title: "IDOR / object reference check", kind: "web", status: "active", document: { body_md: "Walk object ids and test horizontal/vertical authz" }, skill_md: "# IDOR check", organization_id: null, parent_skill_id: null, source: "manual", score: 0.93, uses: 51, successes: 47, failures: 4, approvals: 10, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 11, skill_id: "agi.web.auth-bypass", version: "1.0.0", title: "Auth bypass probing", kind: "web", status: "active", document: { body_md: "Test JWT, session, and access-control bypasses" }, skill_md: "# Auth bypass", organization_id: null, parent_skill_id: null, source: "manual", score: 0.87, uses: 34, successes: 30, failures: 4, approvals: 6, rejections: 1, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 12, skill_id: "agi.web.parameter-pollution", version: "1.0.0", title: "HTTP parameter pollution", kind: "web", status: "candidate", document: { body_md: "Detect parameter pollution on API/web forms" }, skill_md: "# Parameter pollution", organization_id: null, parent_skill_id: null, source: "auto_mint", score: 0.71, uses: 11, successes: 9, failures: 2, approvals: 2, rejections: 0, source_session_id: 102, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 13, skill_id: "agi.api.graphql-introspection", version: "1.0.0", title: "GraphQL introspection & abuse", kind: "api", status: "active", document: { body_md: "Introspect GraphQL and test resolvers" }, skill_md: "# GraphQL", organization_id: null, parent_skill_id: null, source: "manual", score: 0.8, uses: 23, successes: 20, failures: 3, approvals: 4, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 14, skill_id: "agi.api.oauth-flow", version: "1.0.0", title: "OAuth flow analysis", kind: "api", status: "active", document: { body_md: "Validate OAuth grant types and redirect handling" }, skill_md: "# OAuth", organization_id: null, parent_skill_id: null, source: "manual", score: 0.76, uses: 18, successes: 15, failures: 3, approvals: 3, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 15, skill_id: "agi.api.rest-method-fuzz", version: "1.0.0", title: "REST method & verb tampering", kind: "api", status: "candidate", document: { body_md: "Fuzz HTTP verbs and content types on REST endpoints" }, skill_md: "# REST fuzz", organization_id: null, parent_skill_id: null, source: "auto_mint", score: 0.66, uses: 8, successes: 6, failures: 2, approvals: 1, rejections: 0, source_session_id: 103, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 16, skill_id: "agi.network.port-scan", version: "1.0.0", title: "Port & service discovery", kind: "network", status: "active", document: { body_md: "Nmap-based service and port discovery" }, skill_md: "# Port scan", organization_id: null, parent_skill_id: null, source: "manual", score: 0.89, uses: 40, successes: 36, failures: 4, approvals: 7, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 17, skill_id: "agi.network.smb-enumeration", version: "1.0.0", title: "SMB / NetBIOS enumeration", kind: "network", status: "active", document: { body_md: "Enumerate SMB shares, users, and null sessions" }, skill_md: "# SMB enumeration", organization_id: null, parent_skill_id: null, source: "manual", score: 0.72, uses: 12, successes: 10, failures: 2, approvals: 2, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 18, skill_id: "agi.mobile.apk-static", version: "1.0.0", title: "APK static analysis", kind: "mobile", status: "active", document: { body_md: "Manifest, secrets, and exported components" }, skill_md: "# APK static", organization_id: null, parent_skill_id: null, source: "manual", score: 0.84, uses: 26, successes: 23, failures: 3, approvals: 5, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 19, skill_id: "agi.mobile.frida-hook", version: "1.0.0", title: "Frida dynamic hooking", kind: "mobile", status: "candidate", document: { body_md: "Runtime hooking and bypass with Frida" }, skill_md: "# Frida", organization_id: null, parent_skill_id: null, source: "auto_mint", score: 0.7, uses: 10, successes: 8, failures: 2, approvals: 2, rejections: 0, source_session_id: 105, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 20, skill_id: "agi.cloud.s3-misconfig", version: "1.0.0", title: "S3 / bucket misconfiguration", kind: "cloud", status: "active", document: { body_md: "Find public buckets and misconfigurations" }, skill_md: "# S3", organization_id: null, parent_skill_id: null, source: "manual", score: 0.78, uses: 19, successes: 16, failures: 3, approvals: 3, rejections: 1, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 21, skill_id: "agi.cloud.iam-audit", version: "1.0.0", title: "Cloud IAM audit", kind: "cloud", status: "candidate", document: { body_md: "Audit roles, policies, and privilege escalation" }, skill_md: "# IAM audit", organization_id: null, parent_skill_id: null, source: "manual", score: 0.69, uses: 7, successes: 6, failures: 1, approvals: 1, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 22, skill_id: "agi.exploit_verify.command-injection", version: "1.0.0", title: "Command injection verify", kind: "exploit_verify", status: "active", document: { body_md: "Confirm OS command injection with safe payloads" }, skill_md: "# Command injection", organization_id: null, parent_skill_id: null, source: "manual", score: 0.86, uses: 31, successes: 27, failures: 4, approvals: 5, rejections: 1, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 23, skill_id: "agi.exploit_verify.ssrf", version: "1.0.0", title: "SSRF verification", kind: "exploit_verify", status: "active", document: { body_md: "Validate SSRF with controlled out-of-band checks" }, skill_md: "# SSRF", organization_id: null, parent_skill_id: null, source: "manual", score: 0.83, uses: 24, successes: 21, failures: 3, approvals: 4, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 24, skill_id: "agi.reporting.finding-writeup", version: "1.0.0", title: "Finding write-up drafting", kind: "reporting", status: "active", document: { body_md: "Draft evidence-backed finding write-ups" }, skill_md: "# Finding write-up", organization_id: null, parent_skill_id: null, source: "manual", score: 0.75, uses: 17, successes: 15, failures: 2, approvals: 3, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 25, skill_id: "agi.reporting.executive-summary", version: "1.0.0", title: "Executive summary generation", kind: "reporting", status: "active", document: { body_md: "Produce board-ready executive summaries" }, skill_md: "# Exec summary", organization_id: null, parent_skill_id: null, source: "manual", score: 0.73, uses: 13, successes: 11, failures: 2, approvals: 2, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 26, skill_id: "agi.general.recon-orchestration", version: "1.0.0", title: "General recon orchestration", kind: "general", status: "active", document: { body_md: "Fallback orchestration across recon skills" }, skill_md: "# Recon orchestration", organization_id: null, parent_skill_id: null, source: "manual", score: 0.77, uses: 20, successes: 17, failures: 3, approvals: 3, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 27, skill_id: "agi.general.scope-guard", version: "1.0.0", title: "Scope & ROE guard", kind: "general", status: "active", document: { body_md: "Enforce allowlist and forbidden actions" }, skill_md: "# Scope guard", organization_id: null, parent_skill_id: null, source: "manual", score: 0.95, uses: 60, successes: 58, failures: 2, approvals: 12, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 28, skill_id: "agi.web.csrf-checks", version: "1.0.0", title: "CSRF protection check", kind: "web", status: "candidate", document: { body_md: "Verify CSRF tokens and same-site handling" }, skill_md: "# CSRF", organization_id: null, parent_skill_id: null, source: "manual", score: 0.64, uses: 6, successes: 5, failures: 1, approvals: 1, rejections: 1, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 29, skill_id: "agi.soc.phishing-triage", version: "1.0.0", title: "Phishing email triage", kind: "soc", status: "candidate", document: { body_md: "Analyse headers, links, and payloads" }, skill_md: "# Phishing triage", organization_id: null, parent_skill_id: null, source: "auto_mint", score: 0.67, uses: 8, successes: 6, failures: 2, approvals: 2, rejections: 0, source_session_id: 106, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 30, skill_id: "agi.recon.cdn-waf-detection", version: "1.0.0", title: "CDN / WAF detection", kind: "recon", status: "active", document: { body_md: "Identify CDN and WAF fingerprints" }, skill_md: "# CDN/WAF", organization_id: null, parent_skill_id: null, source: "manual", score: 0.7, uses: 12, successes: 10, failures: 2, approvals: 2, rejections: 0, source_session_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

const demoFindings: AgiFinding[] = [
  { id: 1, session_id: 101, finding_id: "f-001", title: "Default credentials accepted on login", severity: "high", evidence: "POST /login with admin:test returned HTTP 200", source: "runner", tool: "http_probe", target: "https://app.acme-lab.example/login", status: "unverified", notes: null, created_at: new Date().toISOString(), risk_id: null },
  { id: 2, session_id: 101, finding_id: "f-002", title: "TLS version mismatch", severity: "medium", evidence: "TLSv1.0 negotiated", source: "runner", tool: "nmap_safe", target: "203.0.113.10", status: "unverified", notes: null, created_at: new Date().toISOString(), risk_id: null },
];

const demoGrants = [
  { id: 1, email: "engineer@phantix.ng", full_name: "Chidi Eze", role: "admin", agi_admin: true, is_active: true },
  { id: 2, email: "ada@phantix.ng", full_name: "Ada Okonkwo", role: "superadmin", agi_admin: true, is_active: true },
];

// ── Status ────────────────────────────────────────────────────────────────────
export async function loadAgiStatus(): Promise<AgiStatus | null> {
  if (DEMO_MODE) { await delay(250); return demoStatus; }
  try {
    const res = await api.get<AgiStatus>("/admin/agi/status");
    return res ?? null;
  } catch { return null; }
}

// ── Policies ──────────────────────────────────────────────────────────────────
export async function loadAgiPolicies(): Promise<AgiPolicy[]> {
  if (DEMO_MODE) { await delay(200); return demoPolicies; }
  const res = await api.get<AgiPolicy[]>("/admin/agi/policies");
  return Array.isArray(res) ? res : [];
}

export async function loadAgiActivePolicy(): Promise<AgiActivePolicy | null> {
  if (DEMO_MODE) { await delay(200); return demoActivePolicy; }
  try {
    return await api.get<AgiActivePolicy>("/admin/agi/policies/active");
  } catch { return null; }
}

export async function publishAgiPolicy(payload: { version: string; title: string; body_md: string; security_policy?: Record<string, unknown>; activate?: boolean }): Promise<{ id: number; version: string; title: string; is_active: boolean; message: string }> {
  if (DEMO_MODE) {
    await delay(300);
    return { id: 2, version: payload.version, title: payload.title, is_active: true, message: "Customers must re-accept when a new active version is published" };
  }
  return api.post<{ id: number; version: string; title: string; is_active: boolean; message: string }>("/admin/agi/policies", payload);
}

// ── Grants ────────────────────────────────────────────────────────────────────
export async function loadAgiGrants(): Promise<any[]> {
  if (DEMO_MODE) { await delay(250); return demoGrants; }
  // List ALL staff (admin+ accessible) so a superadmin can grant/revoke agi_admin
  // on any admin user — the /admin/agi/grants list only returns those already flagged.
  const staff = await api.get<any[]>("/staff");
  return Array.isArray(staff) ? staff : [];
}

export async function setAgiGrant(staffId: number, agiAdmin: boolean): Promise<any> {
  if (DEMO_MODE) { await delay(250); return { id: staffId, agi_admin: agiAdmin }; }
  return api.post<any>("/admin/agi/grants", { staff_id: staffId, agi_admin: agiAdmin });
}

// ── Engagements ───────────────────────────────────────────────────────────────
function repairStoredTarget(raw: string): string {
  return String(raw)
    .replace(/^(https?:)\s*\/+(?!\/)/i, "$1//")
    .replace(/^(https?:)\/(?!\/)/i, "$1//");
}

function normalizeEngagement(raw: AgiEngagement): AgiEngagement {
  const scope = raw.scope_definition ?? (raw as unknown as { scope?: AgiEngagement["scope_definition"] }).scope ?? {
    target_allowlist: [],
    forbidden_actions: [],
  };
  return {
    ...raw,
    scope_definition: {
      ...scope,
      target_allowlist: (scope.target_allowlist ?? []).map(repairStoredTarget),
      forbidden_actions: scope.forbidden_actions ?? [],
    },
    config: raw.config && Object.keys(raw.config).length > 0
      ? raw.config
      : { prompts: {}, tools: ["httpx", "nmap_safe", "nuclei_safe"], skills: { auto_select: true, auto_select_limit: 6 } },
  };
}

export async function loadAgiEngagements(): Promise<AgiEngagement[]> {
  if (DEMO_MODE) { await delay(250); return demoEngagements.map(normalizeEngagement); }
  const res = await api.get<AgiEngagement[]>("/admin/agi/engagements?limit=100");
  return (Array.isArray(res) ? res : []).map(normalizeEngagement);
}

export async function createAgiEngagement(payload: {
  organization_id: number;
  name: string;
  description?: string;
  scope: {
    target_allowlist: string[];
    forbidden_actions: string[];
    rules_of_engagement?: string;
    max_session_minutes?: number;
    target_environment?: "staging" | "production";
    production_ack?: boolean;
    mobile_apk_asset_id?: number;
  };
  config?: Record<string, unknown>;
}): Promise<AgiEngagement> {
  if (DEMO_MODE) {
    await delay(350);
    const eng: AgiEngagement = {
      id: Date.now(), organization_id: payload.organization_id, created_by_staff_id: 1,
      name: payload.name, description: payload.description ?? "",
      scope_definition: { target_allowlist: payload.scope.target_allowlist, forbidden_actions: payload.scope.forbidden_actions, rules_of_engagement: payload.scope.rules_of_engagement ?? "", max_session_minutes: payload.scope.max_session_minutes ?? 120 },
      status: "draft", config: payload.config ?? { prompts: {}, tools: ["httpx", "nmap_safe", "nuclei_safe"], skills: { auto_select: true, auto_select_limit: 6 } },
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), torn_down_at: null,
    };
    return normalizeEngagement(eng);
  }
  const created = await api.post<AgiEngagement>("/admin/agi/engagements", {
    ...payload,
    scope: {
      target_allowlist: payload.scope.target_allowlist,
      forbidden_actions: payload.scope.forbidden_actions,
      rules_of_engagement: payload.scope.rules_of_engagement ?? "",
      max_session_minutes: payload.scope.max_session_minutes,
      target_environment: payload.scope.target_environment ?? "staging",
      production_ack: payload.scope.target_environment === "production" ? (payload.scope.production_ack ?? false) : false,
      mobile_apk_asset_id: payload.scope.mobile_apk_asset_id,
    },
  });
  return normalizeEngagement(created);
}

export async function patchAgiEngagement(id: number, payload: { name?: string; description?: string; config?: Record<string, unknown>; status?: string }): Promise<AgiEngagement> {
  if (DEMO_MODE) { await delay(250); return normalizeEngagement({ ...demoEngagements[0], id, ...payload } as AgiEngagement); }
  const updated = await api.patch<AgiEngagement>(`/admin/agi/engagements/${id}`, payload);
  return normalizeEngagement(updated);
}

// ── Sessions ──────────────────────────────────────────────────────────────────
export type AgiSessionStartOpts = {
  autonomy?: "low" | "medium" | "high";
  include_org_assets?: boolean;
  credentials?: { login_url: string; username: string; password: string; label?: string; otp_mode?: string; login_style?: string };
  credential_accounts?: Array<{ login_url: string; username: string; password: string; label?: string; otp_mode?: string; login_style?: string }>;
  preapprove_lab_auth?: boolean;
  confirm_environment?: string;
  mobile_apk_asset_id?: number;
  objectives?: Record<string, unknown>;
  context_pack?: string;
};

export async function startAgiSession(
  engagementId: number,
  instruction: string,
  opts: AgiSessionStartOpts = {},
): Promise<AgiSession> {
  if (DEMO_MODE) {
    await delay(600);
    const s = normalizeAgiSession({
      id: 200,
      engagement_id: engagementId,
      started_by_staff_id: 1,
      container_id: "agi-ctr-200",
      runner_session_id: "rs-200",
      status: "running",
      started_at: new Date().toISOString(),
      ended_at: null,
      teardown_reason: null,
      meta: {},
      job: { job_status: "running" },
      loop: { working_on: "Provisioning the isolated workspace.", content: "" },
    });
    demoSeq = 0;
    demoTx.length = 0;
    liveDemoSession = s;
    persistAgiSession(s);
    return s;
  }
  const body: Record<string, unknown> = {
    instruction,
    autonomy: opts.autonomy ?? "medium",
    include_org_assets: opts.include_org_assets ?? true,
  };
  if (opts.credentials) body.credentials = opts.credentials;
  if (opts.credential_accounts?.length) body.credential_accounts = opts.credential_accounts;
  if (opts.preapprove_lab_auth != null) body.preapprove_lab_auth = opts.preapprove_lab_auth;
  if (opts.confirm_environment) body.confirm_environment = opts.confirm_environment;
  if (opts.mobile_apk_asset_id != null) body.mobile_apk_asset_id = opts.mobile_apk_asset_id;
  if (opts.objectives) body.objectives = opts.objectives;
  if (opts.context_pack) body.context_pack = opts.context_pack;
  const started = await api.post<AgiSession>(
    `/admin/agi/engagements/${engagementId}/sessions`,
    body,
    { timeoutMs: AGI_SESSION_START_TIMEOUT_MS },
  );
  const normalized = normalizeAgiSession(started);
  persistAgiSession(normalized);
  return normalized;
}

export async function getAgiSession(sessionId: number): Promise<AgiSession | null> {
  if (DEMO_MODE) {
    if (liveDemoSession && liveDemoSession.id === sessionId) return liveDemoSession;
    await delay(150);
    const s = demoSessions.find((s) => s.id === sessionId) ?? demoSessions[0] ?? null;
    return s ? normalizeAgiSession(s) : null;
  }
  try {
    const raw = await api.get<AgiSession>(`/admin/agi/sessions/${sessionId}`);
    return normalizeAgiSession(raw);
  } catch {
    return null;
  }
}

export async function loadActiveAgiSession(): Promise<AgiSession | null> {
  // F-04: the backend exposes no sessions-list route, so
  // GET /admin/agi/sessions?status=… 404s. The only reliable handle on a live
  // session is the id persisted at start time; recover it through the
  // per-session endpoint and otherwise report that there is no active session.
  const persisted = readPersistedAgiSession();
  if (persisted) {
    const s = await getAgiSession(persisted.id);
    if (s && isLiveStatus(s.status)) return s;
    persistAgiSession(null);
  }
  if (DEMO_MODE) {
    return liveDemoSession && isLiveStatus(liveDemoSession.status) ? liveDemoSession : null;
  }
  return null;
}

export async function stopAgiSession(sessionId: number): Promise<AgiSession> {
  if (DEMO_MODE) {
    await delay(350);
    if (liveDemoSession) {
      liveDemoSession = { ...liveDemoSession, status: "stopped", ended_at: new Date().toISOString(), teardown_reason: "operator_stop" };
    }
    persistAgiSession(null);
    return liveDemoSession ?? { id: sessionId, engagement_id: 11, started_by_staff_id: 1, container_id: null, runner_session_id: null, status: "stopped", started_at: new Date().toISOString(), ended_at: new Date().toISOString(), teardown_reason: "operator_stop", meta: {} };
  }
  const s = await api.post<AgiSession>(`/admin/agi/sessions/${sessionId}/stop`);
  persistAgiSession(null);
  return s;
}

/** Pause the AGI loop. Enforced runner-side: the agent stops spending immediately. */
export async function pauseAgiSession(sessionId: number): Promise<AgiSession> {
  if (DEMO_MODE) {
    await delay(150);
    return { id: sessionId, engagement_id: 11, started_by_staff_id: 1, container_id: null, runner_session_id: null, status: "paused", started_at: new Date().toISOString(), ended_at: null, teardown_reason: null, meta: {} };
  }
  return api.post<AgiSession>(`/admin/agi/sessions/${sessionId}/pause`);
}

/** Resume a paused AGI loop. */
export async function resumeAgiSession(sessionId: number): Promise<AgiSession> {
  if (DEMO_MODE) {
    await delay(150);
    return { id: sessionId, engagement_id: 11, started_by_staff_id: 1, container_id: null, runner_session_id: null, status: "running", started_at: new Date().toISOString(), ended_at: null, teardown_reason: null, meta: {} };
  }
  return api.post<AgiSession>(`/admin/agi/sessions/${sessionId}/resume`);
}

// ── Session controls (login / registration / preflight / OTP / shell / jobs) ─

export async function setAgiCredentials(
  sessionId: number,
  payload: { login_url: string; username: string; password: string; label?: string; otp_mode?: string },
): Promise<{ ok: boolean; credentials: Record<string, unknown>; runner_warning?: string }> {
  if (DEMO_MODE) { await delay(300); return { ok: true, credentials: { login_url: payload.login_url, username: payload.username, password_set: true } }; }
  return api.post<{ ok: boolean; credentials: Record<string, unknown>; runner_warning?: string }>(`/admin/agi/sessions/${sessionId}/credentials`, payload);
}

export async function setAgiRegistration(
  sessionId: number,
  payload: { register_url: string; email?: string; username?: string; password: string; label?: string; extra_fields?: Record<string, string> },
): Promise<{ ok: boolean; registration: Record<string, unknown>; runner_warning?: string }> {
  if (DEMO_MODE) { await delay(300); return { ok: true, registration: { register_url: payload.register_url, email: payload.email ?? "", username: payload.username ?? "", password_set: true } }; }
  return api.post<{ ok: boolean; registration: Record<string, unknown>; runner_warning?: string }>(`/admin/agi/sessions/${sessionId}/registration`, payload);
}

export async function getAgiPreflight(sessionId: number): Promise<{ session_id: number; preflight: any; provided_keys: string[]; info_requests: { key: string; label: string; hint?: string }[] }> {
  if (DEMO_MODE) {
    await delay(250);
    if (demoPreflightProvided) return { session_id: sessionId, preflight: { ready: true, message: "All required info provided." }, provided_keys: ["package_name", "apk_url", "roe_confirmed"], info_requests: [] };
    return {
      session_id: sessionId,
      preflight: { ready: false, missing: ["package_name", "apk_url", "roe_confirmed"], message: "Additional information required for mobile dynamic analysis." },
      provided_keys: [],
      info_requests: [
        { key: "package_name", label: "Package / bundle identifier", hint: "e.g. com.example.app" },
        { key: "apk_url", label: "APK download URL", hint: "https://…/app.apk" },
        { key: "roe_confirmed", label: "Dynamic analysis authorized (true)", hint: "Set true to confirm ROE" },
      ],
    };
  }
  return api.get<{ session_id: number; preflight: any; provided_keys: string[]; info_requests: { key: string; label: string; hint?: string }[] }>(`/admin/agi/sessions/${sessionId}/preflight`);
}

let demoPreflightProvided = false;

export async function provideAgiInfo(sessionId: number, fields: Record<string, unknown>, note = ""): Promise<{ ok: boolean; preflight: any; message?: string }> {
  if (DEMO_MODE) { await delay(300); demoPreflightProvided = true; return { ok: true, preflight: { ready: true, message: "All required info provided." } }; }
  return api.post<{ ok: boolean; preflight: any; message?: string }>(`/admin/agi/sessions/${sessionId}/info`, { fields, note });
}

export async function provideAgiOtp(sessionId: number, otp: string, jobId?: string): Promise<any> {
  if (DEMO_MODE) { await delay(250); return { ok: true, delivered: true, job_id: jobId ?? null }; }
  return api.post<any>(`/admin/agi/sessions/${sessionId}/otp`, { otp, job_id: jobId ?? undefined });
}

export async function runAgiShell(sessionId: number, command: string, background = false, waitOtp = false): Promise<any> {
  if (DEMO_MODE) { await delay(300); return { ok: true, stdout: "demo: command accepted in engagement container", background, wait_otp: waitOtp }; }
  return api.post<any>(`/admin/agi/sessions/${sessionId}/shell`, { command, background, wait_otp: waitOtp });
}

export async function listAgiJobs(sessionId: number): Promise<any[]> {
  if (DEMO_MODE) { await delay(250); return [{ job_id: "job-1", command: "wait_otp", status: "running", waiting_otp: true }]; }
  const res = await api.get<any>(`/admin/agi/sessions/${sessionId}/jobs`);
  if (Array.isArray(res)) return res;
  if (res && Array.isArray((res as any).jobs)) return (res as any).jobs;
  return [];
}

export async function agiChat(sessionId: number, message: string): Promise<AgiChatResponse> {
  if (DEMO_MODE) {
    await delay(400);
    return normalizeAgiChat({
      reply: "Understood — continuing within the approved scope.",
      queued: false,
      reply_kind: "assistant",
      loop: { working_on: "Continuing within the approved scope.", content: "Understood — continuing within the approved scope." },
    });
  }
  const raw = await api.post<unknown>(`/admin/agi/sessions/${sessionId}/chat`, { message });
  return normalizeAgiChat(raw);
}

/** Answer a mid-turn ASK_OPERATOR clarification and resume the loop. */
export async function answerAgiClarification(
  sessionId: number,
  body: { answer: string; clarification_id?: string },
): Promise<Record<string, unknown>> {
  if (DEMO_MODE) {
    await delay(300);
    return { ok: true, session_id: sessionId, clarification_id: body.clarification_id ?? "", status: "answered", resumed: true };
  }
  return api.post<Record<string, unknown>>(`/admin/agi/sessions/${sessionId}/clarify`, {
    answer: body.answer,
    clarification_id: body.clarification_id || undefined,
  });
}

export async function loadAgiTranscript(sessionId: number, afterSeq: number): Promise<AgiTranscriptChunk[]> {
  if (DEMO_MODE) {
    await delay(400);
    const lines = [
      { role: "system", content: "[engine] Engagement container provisioned\n[engine] Scope guard loaded\n[engine] allowlist = app.acme-lab.example" },
      { role: "assistant", content: "Acknowledged. I will stay **read-only** until you approve anything that changes state.\n\n**Attack plan**\n1. Recon\n2. Endpoint discovery\n3. Vuln identification\n4. Gated exploit chain" },
      { role: "tool", content: "nmap -sV -T3 --top-ports 100 app.acme-lab.example", meta: { tool: "nmap", action_class: "read" } },
      { role: "tool", content: "80/tcp open http nginx 1.24.0\n443/tcp open ssl/http nginx 1.24.0", meta: { tool: "nmap", action_class: "read" } },
      { role: "tool", content: "httpx -silent -status-code -title https://app.acme-lab.example", meta: { tool: "httpx", action_class: "read" } },
      { role: "tool", content: "HTTP 200 · title \"Acme Lab Portal\" · server nginx/1.24.0", meta: { tool: "httpx", action_class: "read" } },
      { role: "tool", content: "ffuf -u https://app.acme-lab.example/FUZZ -w common.txt -mc 200,302 -t 20", meta: { tool: "ffuf", action_class: "read" } },
      { role: "tool", content: "/login 200\n/api/v1 200\n/admin 302 → /login", meta: { tool: "ffuf", action_class: "read" } },
      { role: "tool", content: "nuclei -u https://app.acme-lab.example -severity info,low,medium,high", meta: { tool: "nuclei", action_class: "read" } },
      { role: "tool", content: "[info] outdated-jquery  CVE-2020-11022\n[low] nginx-version-disclose\n[medium] missing-security-headers", meta: { tool: "nuclei", action_class: "read" } },
      { role: "assistant", content: "Surface mapped. Queuing a single in-scope login probe for your approval." },
    ];
    const idx = demoSeq;
    if (idx < lines.length) {
      const chunk: AgiTranscriptChunk = { seq: idx + 1, role: lines[idx].role, content: lines[idx].content, meta: lines[idx].meta ?? null, created_at: new Date().toISOString() };
      demoTx.push(chunk);
      demoSeq += 1;
    }
    return demoTx.filter((t) => t.seq > afterSeq);
  }
  const res = await api.get<AgiTranscriptChunk[]>(`/admin/agi/sessions/${sessionId}/transcript?after_seq=${afterSeq}`);
  return Array.isArray(res) ? res : [];
}

// ── Actions / approvals ───────────────────────────────────────────────────────
export async function loadAgiPendingActions(sessionId: number): Promise<AgiAction[]> {
  if (DEMO_MODE) { await delay(250); return demoActions; }
  const res = await api.get<AgiAction[]>(`/admin/agi/sessions/${sessionId}/actions/pending`);
  return Array.isArray(res) ? res : [];
}

export async function decideAgiAction(actionId: number, approve: boolean, notes = "", forceSingle = true): Promise<AgiAction> {
  if (DEMO_MODE) {
    await delay(300);
    const a = demoActions.find((x) => x.id === actionId);
    if (a) { a.status = approve ? "approved" : "rejected"; a.decided_at = new Date().toISOString(); a.decision_notes = notes; }
    return a ?? { id: actionId, session_id: 0, action_type: "state_changing", tool_name: null, proposed_command: "", rationale: "", status: "rejected", approved_by_staff_id: null, decision_notes: "", result_summary: null, created_at: new Date().toISOString(), decided_at: null, executed_at: null };
  }
  return api.post<AgiAction>(`/admin/agi/actions/${actionId}/decide?force_single=${forceSingle}`, { approve, notes });
}

// ── Skills ────────────────────────────────────────────────────────────────────
export async function loadAgiSkills(): Promise<AgiSkill[]> {
  if (DEMO_MODE) { await delay(250); return demoSills; }
  const res = await api.get<AgiSkill[]>("/admin/agi/skills");
  return Array.isArray(res) ? res : [];
}

export async function upsertAgiSkill(payload: { document: Record<string, unknown>; status?: string; organization_id?: number | null }): Promise<AgiSkill> {
  if (DEMO_MODE) { await delay(300); return demoSills[0]; }
  return api.post<AgiSkill>("/admin/agi/skills", payload);
}

export async function loadAgiSkillSchema(): Promise<any | null> {
  if (DEMO_MODE) { await delay(200); return { skill_document: { type: "object" }, engagement_config: { type: "object" } }; }
  try { return await api.get<any>("/admin/agi/skills/schema"); } catch { return null; }
}

export async function resolvedAgiSkills(engagementId: number): Promise<AgiSkill[]> {
  if (DEMO_MODE) { await delay(250); return demoSills; }
  try {
    const res = await api.get<{ skills: AgiSkill[] }>(`/admin/agi/engagements/${engagementId}/skills/resolved`);
    return res?.skills ?? [];
  } catch { return []; }
}

// ── Skill library prioritization ───────────────────────────────────────────────
// The imported Anthropic pack is ~850 skills; ranking across all of them every
// engagement is wasteful. This retires the non-prioritized *imported* platform
// skills (status active → deprecated, never deleted) so only a prioritized set
// is selected/searched. Reversible via `restore: true`. `dry_run` (default)
// previews the change without writing.

export interface AgiSkillPrioritizeParams {
  keep_top?: number;
  keep_ids?: string[];
  keep_tags?: string[];
  keep_kinds?: string[];
  score_floor?: number;
  sources?: string[];
  restore?: boolean;
  dry_run?: boolean;
}

export interface AgiSkillPrioritizeResult {
  ok: boolean;
  action: "prioritize" | "restore";
  dry_run: boolean;
  sources?: string[];
  candidates?: number;
  active_before?: number;
  kept?: number;
  deprecated?: number;
  restored?: number;
  keep_top?: number;
  score_floor?: number;
  sample_deprecated?: string[];
}

export async function prioritizeAgiSkills(
  params: AgiSkillPrioritizeParams = {},
): Promise<AgiSkillPrioritizeResult> {
  if (DEMO_MODE) {
    await delay(400);
    if (params.restore) {
      return { ok: true, action: "restore", dry_run: params.dry_run ?? false, candidates: 817, restored: 181 };
    }
    return {
      ok: true,
      action: "prioritize",
      dry_run: params.dry_run ?? true,
      sources: params.sources ?? ["imported_cyber"],
      candidates: 817,
      active_before: 817,
      kept: params.keep_top ?? 150,
      deprecated: 817 - (params.keep_top ?? 150),
      keep_top: params.keep_top ?? 150,
      score_floor: params.score_floor ?? 0.6,
      sample_deprecated: ["agi.cyber.analyzing-memory-forensics", "agi.cyber.building-detection-rules-with-sigma"],
    };
  }
  return api.post<AgiSkillPrioritizeResult>("/admin/agi/skills/prioritize", {
    keep_top: 150,
    score_floor: 0.6,
    sources: ["imported_cyber"],
    dry_run: true,
    ...params,
  });
}

// ── Org context packs — including seedable agent guidance ──────────────────────
// What the pentest agent follows, per org, with no code change: free-form prompt,
// per-asset-type process-flow overrides, and detection rules. Stored on the pack
// meta and injected into the runner's system prompt at session start.

export interface AgiAgentGuidance {
  prompt_md?: string;
  process_flows?: Record<string, string[]>;
  detection_rules?: Array<{
    id?: string;
    name?: string;
    when?: string;
    severity?: string;
    note?: string;
  }>;
}

export interface AgiOrgContextPack {
  name?: string;
  organization_id?: number;
  agent_guidance?: AgiAgentGuidance;
  card_md?: string;
  [k: string]: unknown;
}

export async function loadOrgContextPack(
  organizationId: number,
  name = "default",
): Promise<AgiOrgContextPack> {
  if (DEMO_MODE) {
    await delay(260);
    return {
      name,
      organization_id: organizationId,
      agent_guidance: {
        prompt_md: "Confirm real impact before reporting. Prefer live evidence over heuristics.",
        process_flows: { web_app: ["recon", "discovery", "vuln", "exploit", "report"] },
        detection_rules: [
          { id: "no_placeholder", name: "No placeholder findings", when: "value looks like EXAMPLE/CHANGEME", severity: "info", note: "do not flag" },
        ],
      },
    };
  }
  return api.get<AgiOrgContextPack>(
    `/admin/agi/orgs/${organizationId}/context-packs/${encodeURIComponent(name)}`,
  );
}

export async function upsertOrgContextPack(
  organizationId: number,
  payload: Record<string, unknown>,
  name = "default",
): Promise<AgiOrgContextPack> {
  if (DEMO_MODE) {
    await delay(360);
    return { name, organization_id: organizationId, ...payload };
  }
  return api.put<AgiOrgContextPack>(
    `/admin/agi/orgs/${organizationId}/context-packs/${encodeURIComponent(name)}`,
    payload,
  );
}

// ── Findings ──────────────────────────────────────────────────────────────────
/**
 * A failed request throws rather than resolving to `[]`: the findings panes
 * poll this, and an empty list on a dropped connection wiped the pane until the
 * API came back. Callers keep what they last showed when this rejects.
 */
export async function loadAgiFindings(sessionId: number): Promise<AgiFinding[]> {
  if (DEMO_MODE) { await delay(250); return sortAgiFindings(normalizeAgiFindings(demoFindings)); }
  const res = await api.get<unknown>(`/admin/agi/sessions/${sessionId}/findings`);
  return sortAgiFindings(normalizeAgiFindings(res));
}

export async function promoteAgiFinding(sessionId: number, findingId: string, assetId?: number): Promise<any> {
  if (DEMO_MODE) { await delay(300); return { ok: true, risk_id: 77 }; }
  return api.post<any>(`/admin/agi/sessions/${sessionId}/findings/${findingId}/promote${assetId ? `?asset_id=${assetId}` : ""}`);
}

export async function setAgiFindingStatus(sessionId: number, findingId: string, status: string, notes = ""): Promise<any> {
  if (DEMO_MODE) { await delay(250); return { ok: true }; }
  return api.post<any>(`/admin/agi/sessions/${sessionId}/findings/${findingId}/status`, { status, notes });
}

// ── Tool installs (admin provision queue) ─────────────────────────────────────
export async function loadAgiToolInstalls(status = "pending_admin"): Promise<AgiToolInstallRequest[]> {
  if (DEMO_MODE) { await delay(250); return demoToolInstalls; }
  const res = await api.get<{ items: AgiToolInstallRequest[] }>(`/admin/agi/tool-installs?status=${status}&limit=100`);
  return res?.items ?? [];
}

export async function loadAgiEngineCatalog(): Promise<AgiEngineOp[]> {
  if (DEMO_MODE) {
    await delay(200);
    return [
      { engine_id: "asset_engine", op: "assets.list", action_class: "read", description: "List org assets" },
      { engine_id: "asset_engine", op: "intelligence.summary", action_class: "read", description: "Asset intelligence summary" },
      { engine_id: "risk_engine", op: "risks.list", action_class: "read", description: "List risks" },
      { engine_id: "scanner_engine", op: "scans.list", action_class: "read", description: "List scans" },
      { engine_id: "scanner_engine", op: "scans.start", action_class: "state_changing", description: "Start a scan on an in-scope target" },
      { engine_id: "vapt_engine", op: "findings.list", action_class: "read", description: "List campaign findings" },
      { engine_id: "reporting_engine", op: "reports.list", action_class: "read", description: "List reports" },
      { engine_id: "soc_engine", op: "detections.list", action_class: "read", description: "List detections" },
    ];
  }
  try {
    const res = await api.get<{ ok?: boolean; ops?: AgiEngineOp[] }>("/admin/agi/engines/catalog");
    return Array.isArray(res?.ops) ? res.ops : Array.isArray(res) ? (res as unknown as AgiEngineOp[]) : [];
  } catch { return []; }
}

export async function loadAgiEngineLearning(organizationId?: number): Promise<{ platform: AgiEngineCapability[]; organization: AgiEngineCapability[] }> {
  if (DEMO_MODE) {
    await delay(220);
    const platform: AgiEngineCapability[] = [
      { engine_id: "asset_engine", op: "assets.list", score: 0.82, calls: 120, tools: ["httpx", "whatweb"] },
      { engine_id: "scanner_engine", op: "scans.start", score: 0.74, calls: 48, tools: ["nmap_safe"] },
      { engine_id: "vapt_engine", op: "findings.list", score: 0.71, calls: 36, tools: [] },
      { engine_id: "risk_engine", op: "risks.list", score: 0.66, calls: 22, tools: [] },
    ];
    return { platform, organization: organizationId ? platform.map((x) => ({ ...x, score: Math.max(0.4, x.score - 0.08), organization_id: organizationId })) : [] };
  }
  const q = organizationId ? `?organization_id=${organizationId}` : "";
  try {
    const res = await api.get<{ platform?: AgiEngineCapability[]; organization?: AgiEngineCapability[] }>(`/admin/agi/engines/learning${q}`);
    return { platform: res?.platform ?? [], organization: res?.organization ?? [] };
  } catch { return { platform: [], organization: [] }; }
}

export async function loadAgiSessionJob(sessionId: number): Promise<AgiSessionJob | null> {
  if (DEMO_MODE) {
    await delay(180);
    return {
      job_status: "in_progress",
      active_phase: "discovery",
      unlocked_phases: ["recon", "discovery"],
      completed_phases: ["recon"],
      tools_run: 4,
      findings_count: 2,
      pending_approvals: 1,
      open_info_requests: 0,
      objectives: [
        { id: "recon-hosts", title: "Enumerate allowlisted hosts", status: "done", kind: "recon" },
        { id: "http-surface", title: "Map HTTP surface", status: "active", kind: "asset_coverage", covered: 2, total: 4 },
        { id: "auth-gate", title: "Propose auth verification", status: "pending", kind: "auth" },
      ],
    };
  }
  try {
    const raw = await api.get<any>(`/admin/agi/sessions/${sessionId}/job`);
    return normalizeSessionJob(raw);
  } catch { return null; }
}

function normalizeSessionJob(raw: any): AgiSessionJob | null {
  if (!raw) return null;
  // Backend GET /sessions/{id}/job returns:
  //   { ok, session_id, job_status, view: { job_status, items[], phases[], … },
  //     objectives: { items[], phases[] }, progress: {…} }
  // The FE checklist lives in view.items (objectives is a dict, not an array).
  const view = (raw.view && typeof raw.view === "object" ? raw.view : raw) ?? {};
  const items = Array.isArray(view.items) ? view.items : [];
  const objectives: AgiJobObjective[] = items.map((it: any) => {
    const cov = it?.coverage && typeof it.coverage === "object" ? it.coverage : {};
    const status = String(it?.status ?? "pending");
    return {
      id: String(it?.id ?? ""),
      title: String(it?.description ?? it?.title ?? it?.id ?? "objective"),
      status: (status === "satisfied" ? "done" : status === "waived" ? "waived" : status === "blocked" ? "blocked" : status === "active" ? "active" : "pending") as AgiJobObjective["status"],
      kind: String(it?.type ?? ""),
      covered: cov.covered != null ? Number(cov.covered) : undefined,
      total: cov.total != null ? Number(cov.total) : undefined,
      detail: String(it?.waive_reason ?? it?.note ?? ""),
      required: it?.required != null ? Boolean(it.required) : undefined,
    };
  });
  return {
    job_status: String(view.job_status ?? raw.job_status ?? "unknown"),
    active_phase: view.active_phase != null ? String(view.active_phase) : undefined,
    unlocked_phases: Array.isArray(view.unlocked_phases) ? view.unlocked_phases.map(String) : undefined,
    completed_phases: Array.isArray(view.completed_phases) ? view.completed_phases.map(String) : undefined,
    tools_run: view.tools_run != null ? Number(view.tools_run) : undefined,
    findings_count: view.findings_count != null ? Number(view.findings_count) : undefined,
    pending_approvals: view.pending_approvals != null ? Number(view.pending_approvals) : undefined,
    open_info_requests: view.open_info_requests != null ? Number(view.open_info_requests) : undefined,
    objectives,
  };
}

export async function loadAgiSessionSkillPlan(sessionId: number): Promise<{ skill_plan: AgiSkillPlan | null; tools_to_provision: AgiToolToProvision[]; selected_skills: AgiSelectedSkillChip[] }> {
  if (DEMO_MODE) {
    await delay(200);
    const plan: AgiSkillPlan = {
      objective: "Recon + HTTP surface of allowlisted hosts",
      intents: ["recon", "web"],
      primary_skill_id: "agi.recon.http-surface",
      skill_ids: ["agi.recon.http-surface", "agi.web.http-fingerprint"],
      count: 2,
      full_body_count: 1,
      stream_message: "Using skill agi.recon.http-surface (HTTP surface) [match: intents=recon,web]. Supporting: agi.web.http-fingerprint.",
      skills: [
        { rank: 1, skill_id: "agi.recon.http-surface", title: "HTTP surface mapping", kind: "recon", role: "primary", efficiency: 0.9, objective_score: 0.84, body_loaded: true, match_reason: "intents=recon,web; core_skill", tools: ["http_get", "httpx"] },
        { rank: 2, skill_id: "agi.web.http-fingerprint", title: "HTTP fingerprinting", kind: "web", role: "playbook", efficiency: 0.82, objective_score: 0.71, body_loaded: false, match_reason: "title_hits=2", tools: ["httpx"] },
      ],
      tools: {
        available: ["http_get", "shell", "nmap_top"],
        to_provision: [{ tool: "whatweb", package: "whatweb", required: true, skill_ids: ["agi.web.http-fingerprint"], engine_id: "scanner_engine", rationale: "Required by skill(s): agi.web.http-fingerprint for this engagement objective" }],
        to_provision_count: 1,
      },
    };
    return { skill_plan: plan, tools_to_provision: plan.tools?.to_provision ?? [], selected_skills: [] };
  }
  try {
    const s = await api.get<{ meta?: Record<string, unknown> }>(`/admin/agi/sessions/${sessionId}`);
    const meta = s?.meta ?? {};
    const skillPlan = (meta.skill_plan as AgiSkillPlan) ?? null;
    const toolsToProvision = Array.isArray(meta.tools_to_provision) ? (meta.tools_to_provision as AgiToolToProvision[]) : (skillPlan?.tools?.to_provision ?? []);
    const selected = Array.isArray(meta.selected_skills) ? (meta.selected_skills as AgiSelectedSkillChip[]) : [];
    return { skill_plan: skillPlan, tools_to_provision: toolsToProvision, selected_skills: selected };
  } catch {
    return { skill_plan: null, tools_to_provision: [], selected_skills: [] };
  }
}

export async function searchAgiSkills(q: string): Promise<AgiSkillPlanItem[]> {
  if (DEMO_MODE) {
    await delay(180);
    return [
      { rank: 1, skill_id: "agi.web.http-fingerprint", title: "HTTP fingerprinting", kind: "web", efficiency: 0.82, objective_score: 0.7, body_loaded: false },
      { rank: 2, skill_id: "agi.recon.http-surface", title: "HTTP surface mapping", kind: "recon", efficiency: 0.9, objective_score: 0.84, body_loaded: false },
    ];
  }
  try {
    const res = await api.get<{ skills?: AgiSkillPlanItem[] } | AgiSkillPlanItem[]>(`/admin/agi/skills/search?q=${encodeURIComponent(q)}`);
    return Array.isArray(res) ? res : (res?.skills ?? []);
  } catch { return []; }
}

export async function resolveAgiPrompts(instruction: string): Promise<{ skills: AgiSkill[] }> {
  // Return the skill pool the FE mirror ranks against. Live uses the real skill
  // library; demo uses the broad demo catalog. The mirror (agiPrompts.ts) then
  // runs detectIntents + rankSkills + buildSkillPlan entirely client-side.
  if (DEMO_MODE) { await delay(180); return { skills: demoSills }; }
  try {
    const skills = await loadAgiSkills();
    if (skills.length) return { skills };
  } catch { /* fall through */ }
  return { skills: [] };
}

export async function confirmAgiJob(sessionId: number, stop = true, notes = ""): Promise<unknown> {
  if (DEMO_MODE) { await delay(300); return { ok: true, stop }; }
  return api.post(`/admin/agi/sessions/${sessionId}/job/confirm`, { stop, notes });
}

export async function waiveAgiJobObjective(sessionId: number, objectiveId: string, reason: string): Promise<unknown> {
  if (DEMO_MODE) { await delay(250); return { ok: true }; }
  return api.post(`/admin/agi/sessions/${sessionId}/job/waive`, { objective_id: objectiveId, reason });
}

export async function trainAgiSession(sessionId: number): Promise<unknown> {
  if (DEMO_MODE) { await delay(300); return { ok: true, minted: ["agi.learned.http-login"] }; }
  return api.post(`/admin/agi/sessions/${sessionId}/train`);
}

export async function loadAgiApkAssets(orgId: number, environment: string): Promise<AgiApkAsset[]> {
  if (DEMO_MODE) {
    await delay(200);
    return environment === "staging"
      ? [{ id: 915, name: "Acme Staging 4.2.1-rc", value: "ng.acme.mobile.staging", environment: "staging" }]
      : [{ id: 110, name: "Acme Mobile 4.2.1", value: "ng.acme.mobile", environment: "production" }];
  }
  try {
    const res = await api.get<AgiApkAsset[] | { items?: AgiApkAsset[] }>(`/admin/agi/orgs/${orgId}/apk-assets?environment=${encodeURIComponent(environment)}`);
    return Array.isArray(res) ? res : res?.items ?? [];
  } catch { return []; }
}

export async function decideAgiToolInstall(requestId: number, provision: boolean, notes = ""): Promise<AgiToolInstallRequest> {
  if (DEMO_MODE) { await delay(300); return { ...demoToolInstalls[0], id: requestId, status: provision ? "provisioned" : "rejected", decided_at: new Date().toISOString() }; }
  return api.post<AgiToolInstallRequest>(`/admin/agi/tool-installs/${requestId}/decide`, { provision, notes });
}

// ── Errors ────────────────────────────────────────────────────────────────────
export function agiErrorDetail(err: unknown): { message: string; code?: string } {
  if (err instanceof ApiError) {
    const detail = err.detail as Record<string, unknown> | null;
    return {
      message: typeof detail?.message === "string" ? detail.message : err.message,
      code: typeof detail?.code === "string" ? detail.code : undefined,
    };
  }
  return { message: err instanceof Error ? err.message : "Request failed" };
}

// ── SSE terminal stream (staff) ───────────────────────────────────────────────
// GET /admin/agi/sessions/{id}/stream — proxied from the runner. Browser
// EventSource can't send our Authorization header, so use fetch + ReadableStream.
export async function streamAgiSession(
  sessionId: number,
  onEvent: (event: string, data: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/agi/sessions/${sessionId}/stream`, {
    method: "GET",
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${sessionStorage.getItem("staff_access_token") ?? ""}`,
    },
    signal,
  });
  if (!res.ok) {
    let detail: unknown = `Stream failed: ${res.status}`;
    try { detail = (await res.json()).detail ?? detail; } catch { /* non-JSON */ }
    throw new ApiError(res.status, detail);
  }
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const block of parts) {
      let event = "message";
      const dataLines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      onEvent(event, dataLines.join("\n"));
    }
  }
}
