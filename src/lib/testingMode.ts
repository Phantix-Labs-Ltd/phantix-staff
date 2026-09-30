/**
 * Testing mode (blackbox / greybox / whitebox) + engagement context for the
 * staff AGI admin. Mirrors `@phantix/sg-shared/testingMode` so the keys written
 * into the engagement `config` match the runner's ModeQuestion.satisfied_by —
 * anything filled here stops the agent asking for it mid-run.
 */

export type TestingMode = "blackbox" | "greybox" | "whitebox";

export type TestingModeDef = { id: TestingMode; label: string; short: string; description: string };

export const TESTING_MODES: TestingModeDef[] = [
  {
    id: "blackbox",
    label: "Blackbox",
    short: "External attacker",
    description:
      "No credentials, no source, no docs. The agent discovers the surface from live traffic and infers business logic from behaviour.",
  },
  {
    id: "greybox",
    label: "Greybox",
    short: "Authorized tester",
    description:
      "Test accounts + API docs + inventory. The agent skips discovery and attacks authz seams, workflows and tenant isolation.",
  },
  {
    id: "whitebox",
    label: "Whitebox",
    short: "Source-informed",
    description:
      "Source, configs and IaC. The agent reads code paths first, targets sinks, and verifies the deployed build against the reviewed code.",
  },
];

export const DEFAULT_TESTING_MODE: TestingMode = "greybox";

export type EngagementContext = {
  process_flow?: string;
  critical_workflows?: string;
  out_of_scope_behaviours?: string;
  rate_limit?: string;
  active_exploitation_authorized?: boolean;
  registration_open?: boolean;
  api_spec_urls?: string;
  tenant_model?: string;
  source_paths?: string;
  repo?: string;
  known_findings?: string;
  secrets_locations?: string;
  fix_lifecycle?: string;
  test_accounts?: string;
};

export const EMPTY_ENGAGEMENT_CONTEXT: EngagementContext = {};

export type FieldType = "text" | "textarea" | "toggle";
export type ContextField = {
  key: keyof EngagementContext;
  label: string;
  hint?: string;
  placeholder?: string;
  type: FieldType;
  modes: TestingMode[];
};

export const CONTEXT_FIELDS: ContextField[] = [
  { key: "process_flow", label: "Process flows", hint: "Login, checkout, admin and refund. How the app is meant to be used.", placeholder: "register → verify → login → checkout → admin", type: "textarea", modes: ["blackbox", "greybox", "whitebox"] },
  { key: "critical_workflows", label: "Critical workflows", hint: "The 2-3 flows that matter most.", placeholder: "payment capture, role assignment, data export", type: "text", modes: ["greybox", "whitebox"] },
  { key: "out_of_scope_behaviours", label: "Out-of-scope behaviours", hint: "Beyond the allowlist, what must not be touched.", placeholder: "no spam/emails, no data deletion, skip SSO", type: "text", modes: ["blackbox", "greybox", "whitebox"] },
  { key: "rate_limit", label: "Rate and volume ceiling", hint: "Allowed request rate and hours.", placeholder: "≤ 5 req/s, business hours only", type: "text", modes: ["blackbox", "greybox", "whitebox"] },
  { key: "active_exploitation_authorized", label: "Active exploitation authorized", hint: "May the agent deliver payloads/brute-force? Off = passive discovery only.", type: "toggle", modes: ["blackbox"] },
  { key: "registration_open", label: "Self-service registration open", hint: "May the agent create its own test accounts?", type: "toggle", modes: ["blackbox"] },
  { key: "test_accounts", label: "Test accounts (one per line)", hint: "email:password@https://app.example/login — one per role.", placeholder: "user@example.com:Passw0rd@https://app.example/login", type: "textarea", modes: ["greybox", "whitebox"] },
  { key: "api_spec_urls", label: "API spec URLs", hint: "OpenAPI/Swagger URLs, comma-separated.", placeholder: "https://app.example/openapi.json", type: "text", modes: ["greybox", "whitebox"] },
  { key: "tenant_model", label: "Tenancy model", hint: "Single/multi-tenant + one cross-tenant ID pair.", placeholder: "multi-tenant by org_id; org A 101 vs org B 202", type: "text", modes: ["greybox", "whitebox"] },
  { key: "source_paths", label: "Source and repository paths", hint: "Where the agent can read source.", placeholder: "/repos/app | gs://bucket/src.zip", type: "text", modes: ["whitebox"] },
  { key: "repo", label: "Repository", hint: "Repo URL and the DEPLOYED commit/tag.", placeholder: "https://github.com/org/app @ abc123", type: "text", modes: ["whitebox"] },
  { key: "known_findings", label: "Known and accepted risks", hint: "Already-triaged issues.", placeholder: "missing CSP accepted; /debug internal only", type: "textarea", modes: ["whitebox"] },
  { key: "secrets_locations", label: "Config and secret locations", hint: "Where config and secrets live.", placeholder: ".env.production, k8s Secrets, Terraform state", type: "text", modes: ["whitebox"] },
  { key: "fix_lifecycle", label: "Fix and deploy lifecycle", hint: "How fixes land so the PoC can be replayed.", placeholder: "PR to main, deploy within 24h", type: "text", modes: ["whitebox"] },
];

export function fieldsForMode(mode: TestingMode): ContextField[] {
  return CONTEXT_FIELDS.filter((f) => f.modes.includes(mode));
}

export function parseTestAccounts(raw?: string): Array<{ login_url: string; username: string; password: string }> {
  if (!raw) return [];
  const out: Array<{ login_url: string; username: string; password: string }> = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const at = trimmed.lastIndexOf("@");
    if (at < 0) continue;
    const login_url = trimmed.slice(at + 1).trim();
    const creds = trimmed.slice(0, at);
    const colon = creds.indexOf(":");
    if (colon < 0) continue;
    const username = creds.slice(0, colon).trim();
    const password = creds.slice(colon + 1).trim();
    if (username && password && login_url) out.push({ login_url, username, password });
  }
  return out;
}

export function buildEngagementConfig(
  mode: TestingMode,
  ctx: EngagementContext,
  base: Record<string, unknown> = {},
): Record<string, unknown> {
  const config: Record<string, unknown> = { ...base, testing_mode: mode };
  const put = (key: string, value: unknown) => {
    if (typeof value === "string" ? value.trim() : value != null && value !== "") {
      config[key] = typeof value === "string" ? value.trim() : value;
    }
  };
  put("process_flow", ctx.process_flow);
  put("critical_workflows", ctx.critical_workflows);
  put("out_of_scope_behaviours", ctx.out_of_scope_behaviours);
  put("rate_limit", ctx.rate_limit);
  put("tenant_model", ctx.tenant_model);
  put("source_paths", ctx.source_paths);
  put("repo", ctx.repo);
  put("known_findings", ctx.known_findings);
  put("secrets_locations", ctx.secrets_locations);
  put("fix_lifecycle", ctx.fix_lifecycle);
  if (ctx.active_exploitation_authorized != null) config.active_exploitation_authorized = ctx.active_exploitation_authorized;
  if (ctx.registration_open != null) config.registration_open = ctx.registration_open;
  const specs = (ctx.api_spec_urls || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (specs.length) config.api_spec_urls = specs;
  const accounts = parseTestAccounts(ctx.test_accounts);
  if (accounts.length) config.credential_accounts = accounts;
  return config;
}
