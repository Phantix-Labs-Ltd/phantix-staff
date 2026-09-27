// Staff health contract — mirrors GET /api/v1/admin/health/services
// (operations engine). One row per deployable service so the portal can show a
// real answer to "is the worker that drains the `ai` queue actually up?" rather
// than just "the broker answered a ping".
import { api } from "./api";

export type ServiceHealth = {
  /** ok | unknown | error */
  status: string;
  detail: string;
};

export type HealthCheck = {
  name: string;
  status: string;
  detail?: string;
  latency_ms?: number;
  optional?: boolean;
  /** Check-specific extras, e.g. agi_runner's sandbox_image_present. */
  [key: string]: unknown;
};

export type ServicesSummary = {
  overall?: string;
  checks_total?: number;
  checks_ok?: number;
  checks_error?: number;
  endpoints_total?: number;
  modules_registered?: number;
  modules_missing?: number;
  engines_total?: number;
  security_schema_version?: string;
};

export type ServicesHealth = {
  /** ok | degraded | error */
  status: string;
  environment: string;
  timestamp: string;
  services: Record<string, ServiceHealth>;
  summary?: ServicesSummary;
  checks?: Record<string, HealthCheck>;
  /** True while a worker probe is still running in the background. */
  probing?: boolean;
};

/** Per-service health. Served from the background probe cache, so it is fast. */
export function getServicesHealth(): Promise<ServicesHealth> {
  return api.get<ServicesHealth>("/admin/health/services");
}

/**
 * Kick a fresh worker probe and return the cached report immediately.
 *
 * The probe shells out to `celery inspect` (~30s, longer than the proxy's
 * request timeout), so the backend schedules it and answers with
 * `probing: true` — poll {@link getServicesHealth} until the rows resolve.
 */
export function reprobeServicesHealth(): Promise<ServicesHealth> {
  return api.post<ServicesHealth>("/admin/health/services/refresh", undefined, {
    timeoutMs: 30_000,
  });
}

/** Deploy order → the groups the portal renders. */
export const SERVICE_GROUPS: { title: string; blurb: string; services: string[] }[] = [
  {
    title: "Core",
    blurb: "The API process and the state it depends on.",
    services: ["api", "platform_database", "redis"],
  },
  {
    title: "Workers",
    blurb: "One service per queue set. A missing queue means that work never runs.",
    services: [
      "worker-scans",
      "worker-vapt",
      "worker-alerts",
      "worker-reports",
      "worker-bus",
      "worker-ai",
      "worker-programme",
    ],
  },
  {
    title: "Schedulers & daemons",
    blurb: "Timed work and the alert dispatcher.",
    services: ["beat", "alert_daemon"],
  },
  {
    title: "Agents",
    blurb: "The pentest runner and its sandbox image.",
    services: ["agi_runner"],
  },
];

/** Human label for a service key the backend sent. */
export function serviceLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
