import React, { useCallback, useEffect, useState } from "react";
import { BookOpen, Loader2, Save, Sparkles } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { loadOrgContextPack, upsertOrgContextPack, type AgiAgentGuidance } from "@/lib/agi";
import { useStore } from "@/lib/store";

// ── Seedable agent guidance ───────────────────────────────────────────────────
// The pentest agent's operator prompt, per-asset-type process flows and detection
// rules live on the org's AGI context pack (no migration). Editing them here seeds
// what the runner injects into its system prompt on the next session — no code
// change, no redeploy. Process flows override the runner's built-in per-type flow;
// detection rules tell the agent what to flag and how to classify it.

const FLOW_PLACEHOLDER = `{
  "web_app": ["recon", "discovery", "vuln", "exploit", "auth", "report"],
  "api": ["recon", "discovery", "vuln", "exploit", "report"],
  "mobile_apk": ["recon", "exploit", "report"]
}`;

const RULES_PLACEHOLDER = `[
  { "id": "no_placeholder", "name": "No placeholder findings",
    "when": "value looks like EXAMPLE or CHANGEME or test",
    "severity": "info", "note": "do not report" },
  { "id": "confirm_impact", "name": "Confirm real impact",
    "when": "a secret or auth bypass is suspected",
    "severity": "high", "note": "prove it with a live request first" }
]`;

export function AgentGuidancePanel({ orgs }: { orgs: { id: number; name: string }[] }) {
  const { toast } = useStore();
  const [orgId, setOrgId] = useState<number | null>(orgs[0]?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [promptMd, setPromptMd] = useState("");
  const [flowsText, setFlowsText] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [cardMd, setCardMd] = useState("");

  useEffect(() => {
    if (orgId == null && orgs[0]?.id) setOrgId(orgs[0].id);
  }, [orgs, orgId]);

  const load = useCallback(async () => {
    if (orgId == null) return;
    setLoading(true);
    try {
      const pack = await loadOrgContextPack(orgId);
      const g = (pack.agent_guidance ?? {}) as AgiAgentGuidance;
      setPromptMd(g.prompt_md ?? "");
      setFlowsText(
        g.process_flows && Object.keys(g.process_flows).length
          ? JSON.stringify(g.process_flows, null, 2)
          : "",
      );
      setRulesText(
        g.detection_rules && g.detection_rules.length
          ? JSON.stringify(g.detection_rules, null, 2)
          : "",
      );
      setCardMd(String(pack.card_md ?? ""));
    } catch (e) {
      toast("error", "Could not load guidance", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [orgId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (orgId == null) return;
    let process_flows: Record<string, string[]> | undefined;
    let detection_rules: AgiAgentGuidance["detection_rules"];
    try {
      process_flows = flowsText.trim() ? JSON.parse(flowsText) : undefined;
      detection_rules = rulesText.trim() ? JSON.parse(rulesText) : undefined;
    } catch {
      toast("error", "Invalid JSON", "Process flows and detection rules must be valid JSON.");
      return;
    }
    if (process_flows && (typeof process_flows !== "object" || Array.isArray(process_flows))) {
      toast("error", "Process flows must be an object", 'Shape: { "asset_type": ["phase", …] }.');
      return;
    }
    if (detection_rules && !Array.isArray(detection_rules)) {
      toast("error", "Detection rules must be an array", "Each entry: { name, when, severity, note }.");
      return;
    }
    setSaving(true);
    try {
      await upsertOrgContextPack(orgId, {
        agent_guidance: { prompt_md: promptMd, process_flows, detection_rules },
      });
      toast("success", "Guidance saved", "The pentest agent follows it on the next session.");
      await load();
    } catch (e) {
      toast("error", "Could not save guidance", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  if (!orgs.length) {
    return (
      <EmptyState
        icon={<BookOpen size={24} />}
        title="No organizations"
        body="Create an organization first, then seed the guidance its pentest agent follows."
      />
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 font-display text-sm font-semibold text-white">
            <Sparkles size={14} className="text-gold-300" /> Agent guidance
          </h3>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-slate-400">
            Seed what the pentest agent follows for one organization, with no code change. The prompt is
            added to its system prompt as operator guidance, process flows override the built-in
            per-asset-type flow, and detection rules tell it what to flag and how to classify.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={orgId ?? ""}
            onChange={(e) => setOrgId(Number(e.target.value))}
            className="input !w-auto !py-1.5 text-xs"
            aria-label="Organization"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => void save()}
            disabled={saving || loading || orgId == null}
            className="btn-primary !px-3 !py-1.5 !text-xs"
          >
            {saving ? <Loader2 size={13} className="mr-1.5 inline animate-spin" /> : <Save size={13} className="mr-1.5 inline" />}
            Save
          </button>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 size={13} className="animate-spin" /> Loading guidance…
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="guidance-prompt">Operator prompt</label>
            <textarea
              id="guidance-prompt"
              value={promptMd}
              onChange={(e) => setPromptMd(e.target.value)}
              rows={4}
              placeholder="Confirm the real impact before you report. Prefer live evidence over heuristics…"
              className="input mt-1 font-mono !text-xs leading-5"
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="label" htmlFor="guidance-flows">Process flows (JSON)</label>
              <textarea
                id="guidance-flows"
                value={flowsText}
                onChange={(e) => setFlowsText(e.target.value)}
                rows={8}
                placeholder={FLOW_PLACEHOLDER}
                className="input mt-1 font-mono !text-xs leading-5"
              />
              <p className="mt-1 text-[12px] leading-4 text-slate-500">
                Maps an asset type to the phases the agent walks. Leave empty to use the built-in
                flows.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="guidance-rules">Detection rules (JSON)</label>
              <textarea
                id="guidance-rules"
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                rows={8}
                placeholder={RULES_PLACEHOLDER}
                className="input mt-1 font-mono !text-xs leading-5"
              />
              <p className="mt-1 text-[12px] leading-4 text-slate-500">
                Each rule: <span className="font-mono">{"{ name, when, severity, note }"}</span>.
              </p>
            </div>
          </div>

          {cardMd && (
            <details className="rounded-xl border border-phantix-700/40 bg-phantix-950/50 p-3">
              <summary className="cursor-pointer text-[13px] font-semibold uppercase tracking-wide text-slate-400">
                Rendered context card
              </summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-[13px] leading-5 text-slate-400">
                {cardMd}
              </pre>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}

export default AgentGuidancePanel;
