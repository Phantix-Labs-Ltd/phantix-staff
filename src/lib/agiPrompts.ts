// Staff-side mirror of the AGI prompt engine (no backend endpoint exists yet).
// Mirrors:
//   - services/phantix-agi/main.py::_system_prompt()
//   - services/phantix-agi/tool_parse.py::TOOL_INSTRUCTIONS
//   - services/phantix-agi/prompt_guard.py::FORBIDDEN_SYSTEM_APPENDIX
//   - app/engines/ai_engine/agi/skill_prioritization.py (INTENT_SIGNALS, ranking)
//
// Used ONLY by the staff Prompts tab to preview how an objective resolves to a
// prompt that initiates a skill. Customer surfaces never render these.

import type { AgiSkill, AgiSkillPlan, AgiSkillPlanItem, AgiToolPlan, AgiToolToProvision } from "./types";

// ── Intent signals (mirror skill_prioritization.INTENT_SIGNALS) ────────────────
export interface IntentSignal {
  intent: string;
  tokens: string[];
  kinds: string[];
  tags: string[];
  idFrags: string[];
}

export const INTENT_SIGNALS: IntentSignal[] = [
  { intent: "vapt", tokens: ["vapt", "pentest", "pen test", "campaign", "assessment", "audit"], kinds: ["web", "api", "network", "exploit_verify"], tags: ["vapt", "pentest", "owasp"], idFrags: ["vapt", "campaign", "assessment"] },
  { intent: "web", tokens: ["web", "website", "http", "https", "url", "browser", "frontend", "wordpress", "cms"], kinds: ["web", "recon"], tags: ["web", "recon", "http", "owasp"], idFrags: [".web.", ".recon.", "http"] },
  { intent: "api", tokens: ["api", "rest", "graphql", "openapi", "swagger", "endpoint", "json", "grpc"], kinds: ["api", "web"], tags: ["api", "openapi", "graphql", "rest"], idFrags: [".api.", "openapi", "graphql", "swagger"] },
  { intent: "mobile", tokens: ["mobile", "android", "ios", "apk", "ipa", "frida", "dynamic", "emulator"], kinds: ["mobile"], tags: ["mobile", "android", "ios", "dynamic", "frida"], idFrags: [".mobile.", "android", "apk", "frida"] },
  { intent: "network", tokens: ["network", "port", "nmap", "cidr", "firewall", "tcp", "udp", "scan"], kinds: ["network", "recon"], tags: ["network", "port", "recon"], idFrags: [".network.", "port", "nmap"] },
  { intent: "soc", tokens: ["soc", "detection", "triage", "alert", "incident", "log", "siem"], kinds: ["soc", "general"], tags: ["soc", "triage", "detection"], idFrags: [".soc.", "triage", "detection"] },
  { intent: "auth", tokens: ["auth", "login", "password", "oauth", "sso", "mfa", "otp", "register", "signup", "credential"], kinds: ["web", "api"], tags: ["auth", "login", "registration", "oauth"], idFrags: [".auth.", "login", "oauth", "registration"] },
  { intent: "secrets", tokens: ["secret", "sensitive", "exposure", "leak", ".env", "public", "osint", "key", "token", "credential", "git"], kinds: ["web", "recon"], tags: ["sensitive", "exposure", "public", "osint", "secrets", "recon"], idFrags: ["public-sensitive", "exposure", "secret", "osint"] },
  { intent: "idor", tokens: ["idor", "object reference", "horizontal", "vertical", "authorization", "access control", "broken access"], kinds: ["web", "api"], tags: ["idor", "authz", "owasp"], idFrags: ["idor", "access-control", "authz"] },
  { intent: "exploit", tokens: ["exploit", "rce", "sqli", "xss", "verify", "payload", "cve"], kinds: ["exploit_verify", "web", "api"], tags: ["exploit", "verify", "owasp"], idFrags: [".exploit.", "verify", "injection"] },
  { intent: "enumeration", tokens: ["enumeration", "enumerate", "subdomain", "dns", "discover", "recon"], kinds: ["recon", "network"], tags: ["recon", "enumeration", "subdomain"], idFrags: [".recon.", "enumeration", "subdomain"] },
  { intent: "cloud", tokens: ["cloud", "aws", "azure", "gcp", "s3", "bucket", "kubernetes", "k8s"], kinds: ["cloud", "recon"], tags: ["cloud", "aws", "azure", "gcp"], idFrags: [".cloud.", "aws", "azure", "k8s"] },
  { intent: "compliance", tokens: ["compliance", "gdpr", "pci", "hipaa", "iso", "policy", "grc"], kinds: ["compliance", "general"], tags: ["compliance", "grc", "policy"], idFrags: ["compliance", "grc", "pci", "gdpr"] },
];

const CORE_SKILL_BOOST: Record<string, number> = {
  "agi.recon.http-surface": 0.12,
  "agi.recon.public-sensitive-exposure": 0.18,
  "agi.api.openapi-probe": 0.12,
  "agi.network.port-enum-safe": 0.1,
  "agi.auth.test-user-registration": 0.1,
  "agi.mobile.dynamic-analysis": 0.14,
  "agi.mobile.android-dynamic-apk": 0.12,
  "agi.mobile.dynamic-vapt": 0.12,
  "agi.exploit.verify-with-approval": 0.08,
};

export const SANDBOX_BUILTIN_TOOLS: string[] = [
  "http_get", "dns_lookup", "nmap_top", "shell", "bg_shell", "wait_otp",
  "auth_login", "auth_register", "mailinator_generate", "mailinator_poll_otp",
  "mailinator_list", "skill_search", "skill_load", "engine_call", "opencode_contract",
  "http_probe", "active_probe", "install_package", "curl", "httpx", "nmap",
];

export const TOOL_PACKAGE_HINTS: Record<string, string> = {
  whatweb: "whatweb", nikto: "nikto", ffuf: "ffuf", gobuster: "gobuster",
  dirb: "dirb", sqlmap: "sqlmap", nuclei: "nuclei", wpscan: "wpscan",
  testssl: "testssl.sh", sslyze: "sslyze", masscan: "masscan", hydra: "hydra",
  john: "john", hashcat: "hashcat", amass: "amass", subfinder: "subfinder",
  katana: "katana", feroxbuster: "feroxbuster", wfuzz: "wfuzz", sslscan: "sslscan",
  enum4linux: "enum4linux", smbclient: "smbclient", ldapsearch: "ldap-utils",
  dig: "dnsutils", whois: "whois",
};

// ── Forbidden appendix (mirror prompt_guard.FORBIDDEN_SYSTEM_APPENDIX) ────────
export const FORBIDDEN_APPENDIX = `## HARD FORBIDDEN (non-negotiable)
- Never request, infer, or reveal host/server/platform information.
- Never access other organizations' data (even other SecureGraph clients).
- Never use direct database access; only engine-provided, same-org context.
- Never use a terminal outside the engagement container.
- Missing tools: request install in-container only; queue admin for server-wide image.`;

// ── Tool instructions (mirror tool_parse.TOOL_INSTRUCTIONS, trimmed) ──────────
export const TOOL_INSTRUCTIONS = `When you need a tool, emit exactly one agi-tool JSON call.
Tools: http_get, dns_lookup, nmap_top, shell, bg_shell, wait_otp, auth_login,
auth_register, mailinator_generate, mailinator_poll_otp, mailinator_list,
opencode_contract, skill_search, skill_load, engine_call (+ installs).

## Live product engines (preferred for org data)
ENGINE_CALL: asset_engine.assets.list | {"limit": 20}
ENGINE_CALL: risk_engine.risks.list | {}
ENGINE_CALL: scanner_engine.scans.list | {}
ENGINE_CALL: vapt_engine.campaigns.list | {}
ENGINE_CALL: soc_engine.detections.list | {}

## Skills (progressive load)
TOOL skill_search api graphql owasp authentication
TOOL skill_load agi.cyber.conducting-api-security-testing

## Missing tools → admin provision
REQUEST_TOOL: whatweb | whatweb | scanner_engine | fingerprint web tech for recon

## Job completion (required protocol)
JOB_DONE: <summary> — do not claim done while required checklist items are open.`;

// ── Intent detection ──────────────────────────────────────────────────────────
function tokenize(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z0-9.]+/g) ?? []).filter((t) => t.length >= 2));
}

export function detectIntents(instruction: string, allowlist?: string[]): string[] {
  const blob = (instruction || "").toLowerCase();
  const tokens = tokenize(blob);
  const allowBlob = (allowlist ?? []).join(" ").toLowerCase();
  const found: { hits: number; intent: string }[] = [];
  for (const sig of INTENT_SIGNALS) {
    let hits = 0;
    for (const t of sig.tokens) {
      if (blob.includes(t) || tokens.has(t)) hits += tokens.has(t) ? 2 : 1;
    }
    if (/(\.apk|android|ios)/.test(allowBlob) && sig.intent === "mobile") hits += 3;
    if (/(https?:\/\/|www\.)/.test(allowBlob) && sig.intent === "web") hits += 1;
    if (hits > 0) found.push({ hits, intent: sig.intent });
  }
  found.sort((a, b) => b.hits - a.hits);
  const intents = found.map((f) => f.intent);
  if (!intents.length) {
    return ["recon", "web", "network"];
  }
  return intents.slice(0, 6);
}

// ── Objective match + ranking (mirror objective_match_score / combine_rank) ──
export interface RankedSkill {
  skill: AgiSkill;
  objectiveScore: number;
  matchReason: string;
  matchedIntents: string[];
  _final: number;
}

export function rankSkills(skills: AgiSkill[], instruction: string, intents: string[]): RankedSkill[] {
  const instr = (instruction || "").toLowerCase();
  const tokens = [...tokenize(instr)].filter((t) => t.length >= 3);
  const out: RankedSkill[] = [];
  for (const s of skills) {
    const sid = s.skill_id.toLowerCase();
    const title = s.title.toLowerCase();
    const kind = (s.kind || "").toLowerCase();
    const blob = `${sid} ${title} ${kind}`;
    const titleHits = tokens.filter((t) => title.includes(t) || sid.includes(t)).length;
    const tokenHits = tokens.filter((t) => blob.includes(t)).length;

    let score = Math.min(0.45, 0.04 * tokenHits + 0.06 * titleHits);
    if (titleHits >= 2) score += 0.08;

    let intentBoost = 0;
    const matched: string[] = [];
    for (const intent of intents) {
      const sig = INTENT_SIGNALS.find((x) => x.intent === intent);
      if (!sig) continue;
      let hit = false;
      if (sig.kinds.includes(kind) || kind === intent) { intentBoost += 0.08; hit = true; }
      if (sig.idFrags.some((f) => sid.includes(f))) { intentBoost += 0.1; hit = true; }
      if (hit) matched.push(intent);
    }
    intentBoost = Math.min(0.4, intentBoost);
    score += intentBoost;

    const core = CORE_SKILL_BOOST[s.skill_id] ?? 0;
    if (core && (matched.length || !tokens.length)) score += core;

    if (tokens.length && tokenHits === 0 && !matched.length) score *= 0.25;
    score = Math.min(1, Math.max(0, score));

    // final = objective-first blend
    const hist = Math.min(1, Math.max(0, s.score || 0.5));
    const obj = score;
    const final = obj >= 0.35 ? 0.35 * hist + 0.65 * obj : obj >= 0.15 ? 0.5 * hist + 0.5 * obj : 0.7 * hist + 0.3 * obj;

    const parts: string[] = [];
    if (matched.length) parts.push(`intents=${matched.join(",")}`);
    if (titleHits) parts.push(`title_hits=${titleHits}`);
    if (tokenHits) parts.push(`tokens=${tokenHits}`);
    if (core) parts.push("core_skill");
    const reason = parts.length ? parts.join("; ") : "scope_efficiency";

    out.push({ skill: s, objectiveScore: obj, matchReason: reason, matchedIntents: matched, _final: final });
  }
  out.sort((a, b) => b._final - a._final);
  return out;
}

// ── Skill plan builder (mirror build_skill_plan / diversify) ─────────────────
export function buildSkillPlan(ranked: RankedSkill[], instruction: string, intents: string[], limit = 8): AgiSkillPlan {
  const selected: RankedSkill[] = [];
  const seen = new Set<string>();
  const kindCounts: Record<string, number> = {};
  const add = (r: RankedSkill, force = false) => {
    const sid = r.skill.skill_id;
    if (seen.has(sid)) return false;
    const kind = r.skill.kind || "general";
    if (!force && (kindCounts[kind] ?? 0) >= 3) return false;
    selected.push(r);
    seen.add(sid);
    kindCounts[kind] = (kindCounts[kind] ?? 0) + 1;
    return true;
  };
  for (const intent of intents.slice(0, 4)) {
    if (selected.length >= limit) break;
    const match = ranked.find((r) => r.matchedIntents.includes(intent) && !seen.has(r.skill.skill_id));
    if (match) add(match, true);
  }
  for (const r of ranked) { if (selected.length >= limit) break; add(r); }

  const items: AgiSkillPlanItem[] = selected.map((r, i) => ({
    rank: i + 1,
    skill_id: r.skill.skill_id,
    title: r.skill.title,
    kind: r.skill.kind,
    efficiency: r.skill.score,
    objective_score: Number(r.objectiveScore.toFixed(4)),
    body_loaded: i === 0,
    tools: typeof r.skill.document === "object" ? (Array.isArray((r.skill.document as any)?.tools) ? ((r.skill.document as any).tools as any[]).map((t) => (typeof t === "string" ? t : t?.name ?? "")).filter(Boolean) : []) : [],
    match_reason: r.matchReason,
    matched_intents: r.matchedIntents,
    role: i === 0 ? "primary" : i === 0 ? "playbook" : "card",
  }));

  const toProvision = buildToolPlan(items);
  const primary = items[0];
  const others = items.slice(1, 6).map((x) => x.skill_id);
  let stream = `Using skill ${primary?.skill_id ?? "none"} (${primary?.title ?? "playbook"}) [match: ${primary?.match_reason ?? ""}]`;
  if (others.length) stream += `. Supporting: ${others.join(", ")}`;
  if (intents.length) stream += `. Objective intents: ${intents.join(", ")}`;

  return {
    objective: instruction.slice(0, 500),
    intents,
    skills: items,
    skill_ids: items.map((x) => x.skill_id),
    primary_skill_id: primary?.skill_id ?? null,
    count: items.length,
    full_body_count: items.filter((x) => x.body_loaded).length,
    stream_message: stream,
    tools: toProvision,
  };
}

export function buildToolPlan(items: AgiSkillPlanItem[]): AgiToolPlan {
  const needed: Record<string, AgiToolToProvision> = {};
  const available: string[] = [];
  for (const it of items) {
    for (const name of it.tools ?? []) {
      if (SANDBOX_BUILTIN_TOOLS.includes(name)) {
        if (!available.includes(name)) available.push(name);
        continue;
      }
      const key = name.toLowerCase();
      const entry = (needed[key] ??= {
        tool: key,
        package: TOOL_PACKAGE_HINTS[key] ?? key,
        required: false,
        skill_ids: [],
        engine_id: ["nmap", "masscan", "nuclei", "whatweb", "nikto", "ffuf", "gobuster"].includes(key) ? "scanner_engine" : "scanner_engine",
        rationale: "",
      });
      if (!entry.skill_ids.includes(it.skill_id)) entry.skill_ids.push(it.skill_id);
      entry.rationale = `Required by skill(s): ${entry.skill_ids.slice(0, 6).join(", ")} for this engagement objective`;
    }
  }
  const toProvision = Object.values(needed).sort((a, b) => Number(!a.required) - Number(!b.required));
  return { available, to_provision: toProvision, to_provision_count: toProvision.length };
}

// ── System prompt builder (mirror _system_prompt) ────────────────────────────
export function buildSystemPrompt(params: {
  instruction: string;
  intents: string[];
  plan: AgiSkillPlan;
  allowlist?: string[];
  forbidden?: string[];
  roe?: string;
  autonomy?: string;
}): string {
  const { instruction, plan, allowlist = [], forbidden = [], roe = "", autonomy = "medium" } = params;
  const skillBlock = plan.skills
    .map((s) => `### ${s.skill_id} (efficiency=${s.efficiency}, ${s.body_loaded ? "full" : "card only"})\n${s.title ?? ""}`)
    .join("\n\n") || "(no skills resolved, use general recon)";
  return [
    "You are SECUREGRAPH AGI, a security-engineering agent (OpenCode-like for pentest).",
    `MEDIUM AUTONOMY: decide recon steps per org asset yourself; auto-run reads; gate auth, registration, and exploits.`,
    `AUTONOMY=${autonomy}.`,
    "Tools run ONLY inside the engagement container, never the host terminal. No direct database access.",
    "Never claim a finding without tool evidence.",
    `ALLOWLIST: ${allowlist.slice(0, 40)}.`,
    `FORBIDDEN_ACTIONS: ${forbidden}.`,
    `ROE: ${roe || "n/a"}`,
    `## Skill plan (prioritized, use these)`,
    JSON.stringify({ objective: instruction, intents: plan.intents, skill_ids: plan.skill_ids }),
    `## Loaded skills`,
    skillBlock,
    TOOL_INSTRUCTIONS,
    FORBIDDEN_APPENDIX,
  ].join("\n");
}

// ── Admin-authored prompt definitions ────────────────────────────────────────
export interface AgiPromptDef {
  key: string;
  label: string;
  system_prompt: string;
  user_template: string;
  intents: string[];
  skill_ids: string[];
  is_active: boolean;
}

const PROMPT_STORAGE_KEY = "phantix_staff_agi_prompts";

export const DEFAULT_PROMPTS: AgiPromptDef[] = [
  {
    key: "vapt_web",
    label: "VAPT web application",
    system_prompt: "Run a scoped VAPT assessment of the allowlisted web application. Enumerate, fingerprint, identify vulnerabilities, verify with evidence, and report. State-changing steps require approval.",
    user_template: "VAPT scan the web application: {{targets}}",
    intents: ["vapt", "web"],
    skill_ids: ["agi.recon.http-surface", "agi.web.http-fingerprint", "agi.web.idor-check"],
    is_active: true,
  },
  {
    key: "recon_enumeration",
    label: "Recon and enumeration",
    system_prompt: "Passive and active enumeration of the allowlisted hosts: subdomains, DNS, ports, and services. Read-only.",
    user_template: "Enumerate the allowlisted hosts: {{targets}}",
    intents: ["enumeration", "recon"],
    skill_ids: ["agi.recon.subdomain-enumeration", "agi.network.port-scan"],
    is_active: true,
  },
  {
    key: "mobile_dynamic",
    label: "Mobile dynamic analysis",
    system_prompt: "Dynamic analysis of the selected APK: run preflight first, then hook and instrument with Frida. Requires mobile APK asset.",
    user_template: "Dynamic mobile analysis: {{targets}}",
    intents: ["mobile"],
    skill_ids: ["agi.mobile.apk-static", "agi.mobile.frida-hook"],
    is_active: true,
  },
  {
    key: "soc_triage",
    label: "SOC detection triage",
    system_prompt: "Triage detections and correlate alerts into cases. Read-only; propose any state-changing response for approval.",
    user_template: "Triage detections and investigate: {{targets}}",
    intents: ["soc"],
    skill_ids: ["agi.soc.log-triage", "agi.soc.case-investigation"],
    is_active: true,
  },
];

export function loadPromptDefs(): AgiPromptDef[] {
  try {
    const raw = localStorage.getItem(PROMPT_STORAGE_KEY);
    if (!raw) return DEFAULT_PROMPTS;
    const parsed = JSON.parse(raw) as AgiPromptDef[];
    if (Array.isArray(parsed)) return parsed;
  } catch { /* ignore */ }
  return DEFAULT_PROMPTS;
}

export function savePromptDefs(defs: AgiPromptDef[]): void {
  try { localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(defs)); } catch { /* quota */ }
}

export function resolvePromptDef(instruction: string, defs: AgiPromptDef[]): AgiPromptDef | null {
  const intents = new Set(detectIntents(instruction));
  const scored = defs
    .filter((d) => d.is_active)
    .map((d) => ({ d, hits: d.intents.filter((i) => intents.has(i)).length + (d.intents.some((i) => instruction.toLowerCase().includes(i)) ? 1 : 0) }))
    .sort((a, b) => b.hits - a.hits);
  return scored[0]?.hits ? scored[0].d : null;
}
