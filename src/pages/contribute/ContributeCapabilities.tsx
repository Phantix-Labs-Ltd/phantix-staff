import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileCode2, Loader2, Plus, RefreshCw, Search, Send, XCircle } from "lucide-react";
import { PageHeader, Card, CardHeader, Modal, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";

interface Pack {
  id: number;
  engine: string;
  slug: string;
  path_hint: string | null;
  status: string;
  body_yaml?: string;
  validation_errors?: string | null;
  updated_at?: string | null;
}

interface SeedPack {
  source: "seed";
  engine: string;
  slug: string;
  path_hint: string;
  category: string;
  status: string;
  body_yaml: string;
}

const STARTER_YAML = `info:
  name: example_finding
  author: contributor
  severity: medium
  description: Replace with your check description.
scan:
  steps:
    - method: GET
      path: /
response:
  checks:
    - type: status
      value: 200
`;

export default function ContributeCapabilities() {
  const { toast, isAdmin } = useStore();
  const [items, setItems] = useState<Pack[]>([]);
  const [seeded, setSeeded] = useState<SeedPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [seededLoading, setSeededLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [active, setActive] = useState<Pack | null>(null);
  const [seedView, setSeedView] = useState<SeedPack | null>(null);
  const [slug, setSlug] = useState("");
  const [bodyYaml, setBodyYaml] = useState(STARTER_YAML);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ items: Pack[] }>("/admin/contribute/yaml-packs");
      setItems(res.items ?? []);
    } catch (e) {
      toast("error", "Could not load YAML packs", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadSeeded = useCallback(async () => {
    setSeededLoading(true);
    try {
      const res = await api.get<{ items: SeedPack[] }>("/admin/contribute/yaml-packs/seeded");
      setSeeded(res.items ?? []);
    } catch (e) {
      toast("error", "Could not load seeded YAML", e instanceof Error ? e.message : undefined);
    } finally {
      setSeededLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); void loadSeeded(); }, [load, loadSeeded]);

  const categories = useMemo(
    () => Array.from(new Set(seeded.map((s) => s.category))).sort(),
    [seeded],
  );
  const filteredSeeded = useMemo(() => {
    const q = query.trim().toLowerCase();
    return seeded.filter(
      (s) =>
        (!category || s.category === category) &&
        (!q || s.slug.toLowerCase().includes(q) || s.path_hint.toLowerCase().includes(q)),
    );
  }, [seeded, category, query]);

  const openPack = async (id: number) => {
    try {
      const pack = await api.get<Pack>(`/admin/contribute/yaml-packs/${id}`);
      setActive(pack);
      setSeedView(null);
      setBodyYaml(pack.body_yaml || "");
    } catch (e) {
      toast("error", "Could not open pack", e instanceof Error ? e.message : undefined);
    }
  };

  const openSeed = (seed: SeedPack) => {
    setActive(null);
    setSeedView(seed);
    setBodyYaml(seed.body_yaml);
  };

  /** Fork a seeded engine YAML into an editable draft (does not touch the seed). */
  const forkSeed = async () => {
    if (!seedView) return;
    setBusy(true);
    try {
      const res = await api.post<{ id: number }>("/admin/contribute/yaml-packs", {
        engine: seedView.engine,
        slug: seedView.slug,
        path_hint: seedView.path_hint,
        body_yaml: bodyYaml,
      });
      toast("success", "Draft created", `${seedView.slug}. Now editable.`);
      await load();
      if (res?.id) await openPack(res.id);
    } catch (e) {
      toast("error", "Could not create draft", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!slug.trim()) return;
    setBusy(true);
    try {
      const res = await api.post<{ id: number }>("/admin/contribute/yaml-packs", {
        engine: "scanner",
        slug: slug.trim(),
        body_yaml: bodyYaml,
        path_hint: `scans/vulnerability/${slug.trim()}.yaml`,
      });
      toast("success", "YAML draft created");
      setShowCreate(false);
      setSlug("");
      setBodyYaml(STARTER_YAML);
      await load();
      if (res?.id) await openPack(res.id);
    } catch (e) {
      toast("error", "Create failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await api.patch(`/admin/contribute/yaml-packs/${active.id}`, { body_yaml: bodyYaml });
      toast("success", "Saved");
      await openPack(active.id);
      await load();
    } catch (e) {
      toast("error", "Save failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: "validate" | "submit" | "approve" | "reject") => {
    if (!active) return;
    setBusy(true);
    try {
      if (action === "validate" || action === "submit" || action === "approve") {
        await api.patch(`/admin/contribute/yaml-packs/${active.id}`, { body_yaml: bodyYaml }).catch(() => null);
      }
      const res = await api.post<Record<string, unknown>>(`/admin/contribute/yaml-packs/${active.id}/${action}`, {});
      if (action === "validate") {
        const ok = res?.ok === true;
        toast(ok ? "success" : "error", ok ? "YAML valid" : "Validation failed", Array.isArray(res?.errors) ? (res.errors as string[]).join("; ") : undefined);
      } else {
        toast("success", `Pack ${action}ed`);
      }
      await openPack(active.id);
      await load();
    } catch (e) {
      toast("error", `${action} failed`, e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Finding capabilities"
        description="The engine YAML that ships today, plus drafts: validate → submit → approve. Approved packs land in the scanner YAML overlay without a redeploy."
        actions={
          <div className="flex gap-2">
            <button type="button" className="btn-secondary text-xs !py-2" onClick={() => setShowCreate(true)}>
              <Plus size={13} /> New YAML pack
            </button>
            <button type="button" className="btn-ghost text-xs !py-2" onClick={() => { void load(); void loadSeeded(); }}>
              <RefreshCw size={13} className={cx((loading || seededLoading) && "animate-spin")} />
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Seeded engine YAML"
            subtitle={`${seeded.length} files shipped with the engines · read-only, fork to edit`}
          />
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input !py-1.5 !pl-8 text-xs"
                placeholder="Search seed YAML…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select className="input w-auto !py-1.5 text-xs" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories ({seeded.length})</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c} ({seeded.filter((s) => s.category === c).length})
                </option>
              ))}
            </select>
          </div>
          {seededLoading ? (
            <div className="flex justify-center py-10"><Spinner className="h-5 w-5" /></div>
          ) : filteredSeeded.length === 0 ? (
            <p className="text-xs text-slate-500">No seeded YAML matches.</p>
          ) : (
            <div className="max-h-[40vh] space-y-1 overflow-auto pr-1">
              {filteredSeeded.map((s) => (
                <button
                  key={s.path_hint}
                  type="button"
                  onClick={() => openSeed(s)}
                  className={cx(
                    "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left",
                    seedView?.path_hint === s.path_hint ? "border-gold-400/40 bg-gold-400/5" : "border-phantix-700/40 hover:border-gold-400/30",
                  )}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm text-slate-200">
                      <FileCode2 size={14} className="text-phantix-300" /> {s.slug}
                    </span>
                    <span className="block truncate text-[12px] text-slate-500">{s.engine} · {s.path_hint}</span>
                  </span>
                  <span className="chip text-[12px] border-phantix-600/50 text-slate-400">{s.category}</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Drafts and review" subtitle={`${items.length} draft${items.length === 1 ? "" : "s"}`} />
          {loading ? (
            <div className="flex justify-center py-6"><Spinner className="h-5 w-5" /></div>
          ) : !items.length ? (
            <p className="text-xs text-slate-500">No drafts yet. Fork a seeded YAML, or create one.</p>
          ) : (
            <div className="max-h-[40vh] space-y-2 overflow-auto pr-1">
              {items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void openPack(p.id)}
                  className={cx(
                    "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left",
                    active?.id === p.id ? "border-gold-400/40 bg-gold-400/5" : "border-phantix-700/40 hover:border-gold-400/30",
                  )}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm text-slate-200">
                      <FileCode2 size={14} className="text-gold-400" /> {p.slug}
                    </span>
                    <span className="block truncate text-[12px] text-slate-500">{p.engine}{p.path_hint ? ` · ${p.path_hint}` : ""}</span>
                  </span>
                  <span className="chip text-[12px] border-phantix-600/50 text-slate-400">{p.status}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title={active ? active.slug : seedView ? `${seedView.slug} (seeded)` : "Editor"}
          subtitle={
            active
              ? active.status
              : seedView
                ? `read-only seed · ${seedView.path_hint}`
                : "Select a seeded YAML or a draft"
          }
        />
        {!active && !seedView ? (
          <p className="text-xs text-slate-500">Open a seeded YAML to inspect/fork it, or a draft to edit and submit.</p>
        ) : (
          <div className="space-y-3">
            <textarea
              className="input min-h-[320px] font-mono text-[13px] leading-5"
              value={bodyYaml}
              onChange={(e) => setBodyYaml(e.target.value)}
              readOnly={!active && !seedView}
            />
            <div className="flex flex-wrap gap-2">
              {seedView && !active && (
                <>
                  <button type="button" className="btn-primary text-xs !py-1.5" disabled={busy} onClick={() => void forkSeed()}>
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Save as draft and edit
                  </button>
                  <span className="self-center text-[13px] text-slate-500">Forking creates an editable draft; the shipped YAML is untouched until approved.</span>
                </>
              )}
              {active && (
                <>
                  <button type="button" className="btn-secondary text-xs !py-1.5" disabled={busy} onClick={() => void save()}>Save</button>
                  <button type="button" className="btn-secondary text-xs !py-1.5" disabled={busy} onClick={() => void act("validate")}>Validate</button>
                  <button type="button" className="btn-primary text-xs !py-1.5" disabled={busy} onClick={() => void act("submit")}>
                    <Send size={12} /> Submit
                  </button>
                  {(isAdmin || active.status === "in_review") && (
                    <>
                      <button type="button" className="btn-primary text-xs !py-1.5" disabled={busy} onClick={() => void act("approve")}>
                        <CheckCircle2 size={12} /> Approve
                      </button>
                      <button type="button" className="btn-ghost text-xs !py-1.5 text-severity-critical" disabled={busy} onClick={() => void act("reject")}>
                        <XCircle size={12} /> Reject
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
            {active?.validation_errors && (
              <p className="rounded-md border border-severity-critical/30 bg-severity-critical/10 p-2 text-[13px] text-severity-critical">
                {active.validation_errors}
              </p>
            )}
          </div>
        )}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New YAML capability pack">
        <div className="space-y-3">
          <input
            className="input font-mono text-sm"
            placeholder="slug (e.g. wordpress_xmlrpc_enabled)"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <textarea
            className="input min-h-[200px] font-mono text-[13px] leading-5"
            value={bodyYaml}
            onChange={(e) => setBodyYaml(e.target.value)}
          />
          <button type="button" className="btn-primary w-full" disabled={busy || !slug.trim()} onClick={() => void create()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Save draft
          </button>
        </div>
      </Modal>
    </div>
  );
}
