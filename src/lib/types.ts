// ── Staff Portal Types --- matches backend API docs ────────────────────────────

export type StaffRole = "superadmin" | "admin" | "support" | "contributor" | "editor";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type VerificationStatus = "auto_verified" | "manually_verified" | "unverified" | "rejected" | "false_positive";

export type ExposureLevel = "external" | "internal" | "unknown";

export type RelationshipType =
  | "domain_to_subdomain"
  | "host_to_ip"
  | "ip_to_port_service"
  | "host_to_port_service"
  | "api_to_host"
  | "parent_of"
  | "repo_to_service"
  | "database_to_application"
  | "subdomain_sibling"
  | "cloud_to_resource";

// ── Auth ─────────────────────────────────────────────────────────────────────
export interface StaffUser {
  id: number;
  email: string;
  full_name: string;
  role: StaffRole;
  is_active: boolean;
  created_at: string;
}

export interface StaffLoginResponse {
  access_token: string;
  token_type: "staff";
  staff: StaffUser;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export interface AdminDashboardStats {
  total_clients: number;
  active_clients: number;
  inactive_clients: number;
  total_connections: number;
  healthy_connections: number;
  open_support_tickets: number;
  critical_open_tickets: number;
  experience_services_configured: number;
  clients_by_industry: Record<string, number>;
  tickets_by_status: Record<string, number>;
}

// ── Clients ──────────────────────────────────────────────────────────────────
export interface ClientOrg {
  id: number;
  name: string;
  slug: string;
  email: string;
  country: string;
  industry: string;
  plan: string;
  setup_complete: boolean;
  company_verified: boolean;
  identity_verified: boolean;
  is_active: boolean;
  created_at: string;
  last_active_at: string | null;
  notes: string | null;
  flags: string[];
}

export interface ClientConnections {
  connections: {
    id: number;
    name: string;
    db_type: string;
    is_primary: boolean;
    bootstrap_status: string;
    schema_version: string | null;
    last_test_ok: boolean;
    last_test_at: string | null;
  }[];
  security_db_ready: boolean;
}

export interface ClientExperience {
  modules: {
    service_key: string;
    label: string;
    enabled: boolean;
    plan_tier: string;
  }[];
}

// ── Support ──────────────────────────────────────────────────────────────────
export interface SupportTicket {
  id: number;
  organization_id?: number;
  organization_name?: string;
  reference?: string;
  subject: string;
  category?: string;
  status: string;
  priority: string;
  org_name?: string;
  org_id?: number;
  assigned_to?: string | null;
  created_by?: string;
  created_at: string;
  updated_at?: string;
  last_activity_at?: string;
  message_count?: number;
  messages: TicketMessage[];
}

export interface TicketMessage {
  id: number;
  from: string;
  from_type: "staff" | "customer";
  body: string;
  at: string;
}

// ── Asset Intelligence ───────────────────────────────────────────────────────
export interface IntelligenceDashboard {
  organizationId?: number;
  postureScore: number;
  totals: {
    activeAssets: number;
    verified: number;
    unverified: number;
    neverScanned: number;
    highRiskAssets: number;
    externalAssets: number;
    openFindings: number;
  };
  criticalAssetsAtRisk: Array<{
    id: number;
    value: string | null;
    assetType: string | null;
    riskLevel: string | null;
    riskScore: number | null;
    openFindingsCount: number | null;
    priorityScore: number;
    exposureLevel: string | null;
    isVerified: boolean | null;
  }>;
  newlyDiscoveredUnscanned: Array<{
    id: number;
    value: string | null;
    assetType: string | null;
    firstSeenAt: string | null;
    isVerified: boolean | null;
    source: string | null;
  }>;
  generatedAt: string;
}

export interface PrioritizedAssetList {
  items: PrioritizedAssetItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface PrioritizedAssetItem {
  id: number;
  value: string | null;
  name: string | null;
  assetType: string | null;
  tags: string[];
  riskScore: number | null;
  riskLevel: string | null;
  openFindingsCount: number;
  criticalFindingsCount: number;
  highFindingsCount: number;
  lastScannedAt: string | null;
  isVerified: boolean;
  exposureLevel: string;
  criticality: string | null;
  priorityScore: number;
  relatedAssetCount: number;
}

export interface RecommendedAction {
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  reason: string;
  action_key: string;
}

export interface AssetIntelligence {
  id: number;
  value: string | null;
  name: string | null;
  assetType: string | null;
  tags: string[];
  riskScore: number | null;
  riskLevel: string | null;
  previousRiskScore: number | null;
  previousRiskLevel: string | null;
  riskScoreDelta: number | null;
  openFindingsCount: number;
  criticalFindingsCount: number;
  highFindingsCount: number;
  mediumFindingsCount: number;
  lowFindingsCount: number;
  infoFindingsCount: number;
  lastScannedAt: string | null;
  isVerified: boolean;
  verificationMethod: string | null;
  exposureLevel: string;
  criticality: string | null;
  owner: string | null;
  source: string | null;
  isActive: boolean;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  relatedAssetCount: number;
  priorityScore: number;
  intelligenceUpdatedAt: string | null;
  relatedAssets: {
    id: number;
    value: string | null;
    name: string | null;
    assetType: string | null;
    relationshipType: string | null;
    riskLevel: string | null;
    openFindingsCount: number | null;
    isVerified: boolean | null;
    confidence: number;
  }[];
  openFindings: {
    id: number;
    title: string | null;
    severity: string | null;
    tool: string | null;
    createdAt: string | null;
    verificationStatus: string | null;
    reportable: boolean | null;
  }[];
  risks: {
    id: number;
    title: string | null;
    riskScore: number | null;
    riskLevel: string | null;
    status: string | null;
    treatmentStatus: string | null;
  }[];
  recommendedActions: RecommendedAction[];
  postureSummary: string;
  whyPrioritized: string;
  summarySource: "deterministic" | "ai" | "ai_cached" | string;
}

export interface AiPostureSummary {
  assetId: number;
  postureSummary: string;
  whyPrioritized: string;
  summarySource: string;
  recommendedActions: RecommendedAction[];
}

export interface RelationshipGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootAssetId: number | null;
  depth: number;
  truncated: boolean;
  nodeCount: number;
  edgeCount: number;
}

export interface GraphNode {
  id: number;
  value: string | null;
  name: string | null;
  assetType: string | null;
  riskLevel: string | null;
  riskScore: number | null;
  openFindingsCount: number;
  isVerified: boolean;
  exposureLevel: string;
  priorityScore: number;
}

export interface GraphEdge {
  id: number;
  source: number;
  target: number;
  relationshipType: string;
  confidence: number;
}

export interface IntelligenceRefreshResponse {
  organization_id: number;
  updated: number;
  errors: number;
  total_candidates: number;
}

export interface RealtimeEvent {
  type: string;
  organizationId: number;
  eventId: string;
  ts: string;
  payload: {
    assetId?: number;
    value?: string | null;
    assetType?: string | null;
    riskScore?: number | null;
    riskLevel?: string | null;
    previousRiskScore?: number | null;
    previousRiskLevel?: string | null;
    openFindingsCount?: number | null;
    priorityScore?: number | null;
    exposureLevel?: string | null;
    findingId?: number | string | null;
    title?: string | null;
    severity?: string | null;
    tool?: string | null;
    source?: string | null;
    [key: string]: unknown;
  };
}

// ── Discovery ────────────────────────────────────────────────────────────────
export interface DiscoveryJob {
  id: number;
  job_type: string;
  status: "pending" | "queued" | "running" | "completed" | "failed";
  config: Record<string, unknown>;
  result_summary?: Record<string, unknown>;
  created_at: string;
  finished_at: string | null;
}

export interface DiscoverySettings {
  nmap_binary_path: string;
  admin_flags: string[];
  default_flags: string[];
  max_concurrent_jobs: number;
}

// ── Assets (basic CRUD) ──────────────────────────────────────────────────────
export interface Asset {
  id: number;
  asset_type: string;
  value: string;
  name: string;
  source: string;
  is_verified: boolean;
  verification_method: string | null;
  criticality: "critical" | "high" | "medium" | "low";
  environment: string;
  tags: AssetTag[];
  first_discovered_at: string;
  last_seen_at: string;
  metadata?: Record<string, unknown>;
  risk_score?: number;
  risk_level?: string;
  open_findings?: number;
  exposure?: string;
}

export interface AssetTag {
  id: number;
  name: string;
  color: string;
  description?: string;
  asset_count?: number;
}

// ── Admin Pages ──────────────────────────────────────────────────────────────
export interface ComplianceFramework {
  id: string;
  name: string;
  version: string;
  description: string;
  control_count: number;
  category: string;
  is_active: boolean;
  recommended: boolean;
}

export interface ToolItem {
  id: number;
  key: string;
  name: string;
  category: string;
  description: string;
  active: boolean;
  version: string | null;
}

export interface PlanPricesNgn {
  free?: number | null;
  starter?: number | null;
  growth?: number | null;
  enterprise?: number | null;
}

export interface BillingTierRow {
  key: string;
  list_price_ngn: number | null;
  yearly_price_ngn: number | null;
  sales_motion: string;
}

export interface BillingSettings {
  monthly_price_ngn: number;
  yearly_price_ngn: number;
  currency: string;
  first_month_discount_percent?: number;
  yearly_month_equivalent?: number;
  plan_prices_ngn?: PlanPricesNgn | null;
  tiers?: BillingTierRow[] | null;
  is_active?: boolean;
  notes?: string | null;
  updated_by?: string | null;
  updated_at: string;
}

export interface PricingPreview {
  monthly?: number;
  yearly?: number;
  yearly_monthly_eq?: number;
  savings_percent?: number;
  plan?: string;
  monthly_list_price_ngn?: number;
  yearly_price_ngn?: number;
  yearly_savings_vs_12_months_ngn?: number;
  first_month_discount_percent?: number;
  plan_prices_ngn?: PlanPricesNgn | null;
}

export interface ServerOverview {
  uptime_seconds: number;
  worker_count: number;
  active_workers: number;
  process_count: number;
  memory_mb: number;
  cpu_percent: number;
  version: string;
}

export interface AiAdminSettings {
  enabled: boolean;
  default_provider: string;
  providers: { id: string; configured: boolean; active: boolean }[];
  mode: string;
  prompts_count: number;
}

// ── SOC Monitoring ───────────────────────────────────────────────────────────
export interface SocDashboardScaffold {
  organizationId: number;
  status: "scaffold";
  generatedAt: string;
  panels: {
    id: string;
    title: string;
    source: string;
    ready: boolean;
    endpoint: string | null;
    stream?: string;
    note?: string;
  }[];
  liveSubscribers: number;
  message: string;
}

// ── Staff user (admin CRUD) ──────────────────────────────────────────────────
export interface StaffUserDetail {
  id: number;
  email: string;
  full_name: string;
  role: StaffRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  created_by: number | null;
  agi_admin?: boolean;
  must_change_password?: boolean;
}

// ── SECUREGRAPH AGI Management (staff) — admin/agi/* ──────────────────────────────
export interface AgiStatus {
  enabled: boolean;
  runner_url: string;
  runner_reachable: boolean;
  runner_detail: string;
  deepseek_only: boolean;
  default_image: string;
}

export interface AgiPolicy {
  id: number;
  version: string;
  title: string;
  is_active: boolean;
  published_at: string | null;
  created_at: string | null;
}

export interface AgiActivePolicy {
  id: number;
  version: string;
  title: string;
  body_md: string;
  security_policy: Record<string, unknown> | null;
  is_active: boolean;
  published_at: string | null;
}

export interface AgiEngagement {
  id: number;
  organization_id: number;
  created_by_staff_id: number | null;
  name: string;
  description: string | null;
  scope_definition: {
    target_allowlist: string[];
    forbidden_actions: string[];
    rules_of_engagement?: string;
    window_start?: string | null;
    window_end?: string | null;
    max_session_minutes?: number | null;
  };
  status: string;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  torn_down_at: string | null;
}

/** Loop brief (phantix.agi.loop_brief.v1) — always coerce arrays/strings. */
export interface AgiLoopItem {
  title: string;
  detail: string;
  severity: string;
  target: string;
  tool: string;
  reason: string;
  action: string;
}

export interface AgiLoopBrief {
  schema?: string;
  event?: string;
  session_id?: number;
  turn?: number;
  turn_index?: number;
  max_turns?: number;
  phase?: string;
  loop_status?: string;
  job_status?: string;
  active_phase?: string;
  working_on?: string;
  summary?: string;
  found?: AgiLoopItem[];
  next?: AgiLoopItem[];
  blockers?: AgiLoopItem[];
  tools_this_turn?: string[];
  tools_run_total?: number;
  findings_count?: number;
  open_objectives?: string[];
  pending_approvals?: number;
  open_info_requests?: number;
  reason?: string;
  content?: string;
}

export interface AgiCredentialAccountView {
  label?: string;
  app?: string;
  login_url?: string;
  username?: string;
  password_set?: boolean;
  login_style?: string;
  source?: string;
  otp_mode?: string;
}

export interface AgiSessionMetaCredentials {
  configured?: boolean;
  login_url?: string;
  username?: string;
  password_set?: boolean;
  otp_mode?: string;
  label?: string;
  login_style?: string;
  account_count?: number;
  accounts?: AgiCredentialAccountView[];
}

export interface AgiSessionMetaLabExploit {
  enabled?: boolean;
  reason?: string;
  account_labels?: string[];
  preapproved_tools?: string[];
}

export interface AgiChatResponse {
  schema_version?: string;
  ok?: boolean;
  session_id?: number;
  accepted?: boolean;
  queued?: boolean;
  blocked?: boolean;
  mock?: boolean;
  code?: string;
  reply?: string;
  reply_kind?: string;
  findings_count?: number;
  job?: Record<string, unknown>;
  loop?: AgiLoopBrief;
  found?: AgiLoopItem[];
  next?: AgiLoopItem[];
  blockers?: AgiLoopItem[];
  transcript_seq?: number | null;
}

export interface AgiSession {
  id: number;
  engagement_id: number;
  started_by_staff_id: number | null;
  container_id: string | null;
  runner_session_id: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  teardown_reason: string | null;
  meta: Record<string, unknown> | null;
  /** Present on GET/POST session; always coerce with normalizeAgiSession. */
  job?: AgiSessionJob | Record<string, unknown> | null;
  loop?: AgiLoopBrief | null;
  /** "running" | "stopped" — the loop, distinct from session.status. */
  loop_status?: "running" | "stopped" | null;
  loop_stop_reason?: string | null;
  /** Open ASK_OPERATOR clarification (cleared on answer). */
  clarification?: Record<string, unknown> | null;
}

export interface AgiTranscriptChunk {
  seq: number;
  role: string;
  content: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface AgiAction {
  id: number;
  session_id: number;
  action_type: string;
  tool_name: string | null;
  proposed_command: string;
  rationale: string | null;
  status: string;
  approved_by_staff_id: number | null;
  decision_notes: string | null;
  result_summary: string | null;
  created_at: string;
  decided_at: string | null;
  executed_at: string | null;
}

export interface AgiSkill {
  id: number;
  skill_id: string;
  version: string;
  title: string;
  kind: string;
  status: string;
  document: Record<string, unknown>;
  skill_md: string;
  organization_id: number | null;
  parent_skill_id: string | null;
  source: string;
  score: number;
  uses: number;
  successes: number;
  failures: number;
  approvals: number;
  rejections: number;
  source_session_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface AgiToolInstallRequest {
  id: number;
  session_id: number;
  engagement_id: number;
  organization_id: number;
  tool_name: string;
  package_hint: string;
  install_command: string;
  rationale: string;
  skill_id: string | null;
  skill_id_minted?: string | null;
  engine_id?: string | null;
  status: string;
  result_summary: string | null;
  admin_notes?: string | null;
  created_at: string;
  decided_at: string | null;
  installed_in_session_at?: string | null;
  provisioned_at?: string | null;
}

export type EngineActionClass = "read" | "state_changing";

export interface AgiEngineOp {
  engine_id: string;
  op: string;
  action_class: EngineActionClass;
  description: string;
  learned_tools?: string[];
}

export interface AgiEngineCapability {
  engine_id: string;
  op: string;
  score: number;
  calls: number;
  successes?: number;
  failures?: number;
  tools: string[];
  organization_id?: number | null;
}

export interface AgiJobObjective {
  id: string;
  title: string;
  status: "pending" | "active" | "done" | "waived" | "blocked";
  kind?: string;
  covered?: number;
  total?: number;
  detail?: string;
  required?: boolean;
}

export interface AgiSessionJob {
  job_status: string;
  active_phase?: string;
  unlocked_phases?: string[];
  completed_phases?: string[];
  objectives?: AgiJobObjective[];
  tools_run?: number;
  findings_count?: number;
  pending_approvals?: number;
  open_info_requests?: number;
}

export interface EngineCallEvent {
  tool: "engine_call";
  engine_id: string;
  op: string;
  ok: boolean;
  latency_ms?: number;
  requires_approval?: boolean;
  result?: unknown;
  learning?: unknown;
  message?: string;
}

export interface AgiApkAsset {
  id: number;
  name: string;
  value: string;
  environment?: string;
}

export interface AgiSkillPlanItem {
  rank: number;
  skill_id: string;
  title?: string;
  kind?: string;
  efficiency?: number;
  objective_score?: number;
  body_loaded?: boolean;
  requires_approval?: boolean;
  tools?: string[];
  match_reason?: string;
  matched_intents?: string[];
  role?: "primary" | "playbook" | "card";
}

export interface AgiToolToProvision {
  tool: string;
  package: string;
  required: boolean;
  skill_ids: string[];
  engine_id?: string;
  rationale?: string;
}

export interface AgiToolPlan {
  available: string[];
  to_provision: AgiToolToProvision[];
  to_provision_count: number;
  required_missing?: AgiToolToProvision[];
}

export interface AgiSkillPlan {
  objective?: string;
  intents: string[];
  skills: AgiSkillPlanItem[];
  skill_ids: string[];
  primary_skill_id?: string | null;
  count: number;
  full_body_count?: number;
  stream_message?: string;
  tools?: AgiToolPlan;
}

export interface AgiSelectedSkillChip {
  skill_id: string;
  version?: string;
  efficiency?: number;
  objective_score?: number;
  kind?: string;
  title?: string;
  body_loaded?: boolean;
  rank?: number;
}

export interface AgiFinding {
  id: number | string;
  session_id?: number;
  finding_id?: string;
  title: string;
  severity: string;
  evidence?: string | { request?: string; response?: string; hash?: string; notes?: string } | null;
  source?: string;
  tool?: string | null;
  target?: string | null;
  status?: string;
  notes?: string | null;
  created_at?: string;
  risk_id?: number | null;
  cve?: string | null;
  category?: string | null;
  tags?: string[];
  highlight?: boolean;
  report_highlight?: boolean;
  business_impact?: string | null;
  impact_level?: string | null;
  impact_analysis?: {
    business_impact?: string;
    technical_impact?: string;
    impact_level?: string;
    impact_score?: number;
    categories?: string[];
    blast_radius?: string;
  } | null;
  authenticated?: boolean;
  rule_id?: string | null;
  node_id?: string | null;
  verification?: {
    verdict?: string;
    verifier?: string;
    reason?: string;
    evidence?: string;
    by?: string;
    attempted_at?: string;
    decided_at?: string;
    confidence?: number | null;
    needs_review?: boolean;
    subagent?: string;
  } | null;
}
