import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, Eye, EyeOff, FileUp, History, ImagePlus, Loader2, Pencil, Plus,
  RotateCcw, Save, Send, Trash2, Undo2, Users,
} from "lucide-react";
import { Card, Modal, PageHeader, PageSkeleton } from "@/components/ui";
import ReaderPreview from "@/components/ReaderPreview";
import RichMarkdownEditor from "@/components/RichMarkdownEditor";
import WeeklyGuidelines from "@/pages/admin/WeeklyGuidelines";
import { api, ApiError } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { timeAgo } from "@/lib/utils";
import {
  AUTOSAVE_MS,
  type BlogActivity,
  type BlogAsset,
  type BlogContributor,
  type BlogIssue,
  type BlogRevision,
  type Draft,
  EMPTY,
  type EditorPresence,
  insertFigure,
  sectionsOf,
  slugify,
  StatusChip,
  type WeeklyPost,
} from "@/pages/admin/weeklyShared";

/**
 * The Weekly — the full-page writing desk.
 *
 * Opening a draft takes over the page instead of sitting in an overlay: the
 * writing column gets the room it deserves and the URL is shareable
 * (`/weekly/:id`). Two or more staff can work on one draft, so every save
 * carries the revision it was read from, a conflicting save is resolved in
 * place, and a presence heartbeat shows who else has it open. Approvers
 * (admins) are not credited as contributors — only people who write are.
 */
export default function WeeklyEditor() {
  const { postId } = useParams<{ postId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast, isAdmin, session } = useStore();

  const issues = useResource<BlogIssue[]>(async () => {
    const raw = await api.get<{ items: BlogIssue[] }>("/admin/blog/issues");
    return raw?.items ?? [];
  }, []);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(Boolean(postId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [baseRevision, setBaseRevision] = useState(1);
  const [slugTouched, setSlugTouched] = useState(Boolean(postId));
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "submit" | "approve" | "publish" | "unpublish" | "reopen">("");
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [conflict, setConflict] = useState<number | null>(null);

  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  const revRef = useRef(1);
  revRef.current = baseRevision;
  const hydratedIdRef = useRef<number | null>(null);

  const [assets, setAssets] = useState<BlogAsset[]>([]);
  const [revisions, setRevisions] = useState<BlogRevision[]>([]);
  const [activity, setActivity] = useState<BlogActivity[]>([]);
  const [contributors, setContributors] = useState<BlogContributor[]>([]);
  const [presence, setPresence] = useState<EditorPresence[]>([]);
  const [panel, setPanel] = useState<"none" | "history" | "activity" | "figures" | "contributors">("none");
  const [figure, setFigure] = useState<{ open: boolean; section: string }>({ open: false, section: "" });
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [newIssueOpen, setNewIssueOpen] = useState(false);
  const [newIssue, setNewIssue] = useState({ number: "", name: "", date: "" });
  const [creatingIssue, setCreatingIssue] = useState(false);

  const loadExtras = useCallback(async (id: number) => {
    try {
      const [a, r, act, c] = await Promise.all([
        api.get<{ items: BlogAsset[] }>(`/admin/blog/posts/${id}/assets`),
        api.get<{ items: BlogRevision[] }>(`/admin/blog/posts/${id}/revisions`),
        api.get<{ items: BlogActivity[] }>(`/admin/blog/posts/${id}/activity`),
        api.get<{ items: BlogContributor[] }>(`/admin/blog/posts/${id}/contributors`),
      ]);
      setAssets(a?.items ?? []);
      setRevisions(r?.items ?? []);
      setActivity(act?.items ?? []);
      setContributors(c?.items ?? []);
    } catch {
      /* extras are best-effort; the editor still works without them */
    }
  }, []);

  // Load the draft. `/weekly/new` starts empty; `/weekly/:id` hydrates once, so
  // the post-save URL swap does not re-fetch and clobber local edits.
  useEffect(() => {
    if (!postId) {
      const requested = Number(searchParams.get("issue"));
      setDraft({
        ...EMPTY,
        issue_id: Number.isFinite(requested) && requested > 0 ? requested : null,
      });
      setBaseRevision(1);
      setLoading(false);
      return;
    }
    if (hydratedIdRef.current === Number(postId)) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api
      .get<WeeklyPost>(`/admin/blog/posts/${postId}`)
      .then((p) => {
        if (cancelled) return;
        hydratedIdRef.current = p.id;
        setDraft({ ...p, kicker: p.kicker ?? "" });
        setBaseRevision(p.revision);
        revRef.current = p.revision;
        setContributors(p.contributors ?? []);
        void loadExtras(p.id);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load the post");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId, loadExtras]);

  const markDirty = (next: Partial<Draft>) => {
    setDraft((cur) => (cur ? { ...cur, ...next } : cur));
    setDirty(true);
  };

  const reloadLatest = useCallback(
    async (id: number) => {
      const fresh = await api.get<WeeklyPost>(`/admin/blog/posts/${id}`);
      hydratedIdRef.current = fresh.id;
      setDraft({ ...fresh, kicker: fresh.kicker ?? "" });
      setBaseRevision(fresh.revision);
      revRef.current = fresh.revision;
      setDirty(false);
      setSavedAt(Date.now());
      setConflict(null);
      setContributors(fresh.contributors ?? []);
      toast("success", "Loaded the latest", `Now at revision ${fresh.revision}.`);
    },
    [toast],
  );

  const save = useCallback(async (): Promise<WeeklyPost | null> => {
    const d = draftRef.current;
    if (!d) return null;
    if (!d.title.trim()) {
      toast("error", "Add a title", "Every post needs a title.");
      return null;
    }
    setBusy("save");
    const body = {
      title: d.title.trim(),
      slug: (d.slug || slugify(d.title)).trim(),
      no: d.no.trim() || undefined,
      order: d.id ? Number(d.order) || 0 : Number(d.order) || undefined,
      date: d.date.trim(),
      kicker: (d.kicker ?? "").trim(),
      excerpt: d.excerpt.trim(),
      featured: d.featured,
      body: d.body,
      body_html: d.body_html ?? "",
      issue_id: d.issue_id ?? null,
      ...(d.id ? { revision: revRef.current } : {}),
    };
    try {
      const saved = d.id
        ? await api.patch<WeeklyPost>(`/admin/blog/posts/${d.id}`, body)
        : await api.post<WeeklyPost>("/admin/blog/posts", body);
      setDraft((cur) => (cur ? { ...cur, id: saved.id } : cur));
      setBaseRevision(saved.revision);
      revRef.current = saved.revision;
      setDirty(false);
      setSavedAt(Date.now());
      setConflict(null);
      if (saved.id) void loadExtras(saved.id);
      if (!d.id) {
        // Give the draft a shareable URL without reloading and losing edits.
        hydratedIdRef.current = saved.id;
        navigate(`/weekly/${saved.id}`, { replace: true });
      }
      return saved;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const detail = e.detail as { code?: string; current_revision?: number } | undefined;
        if (detail?.code === "stale_revision") {
          setConflict(detail.current_revision ?? revRef.current + 1);
          return null;
        }
      }
      toast("error", "Could not save", e instanceof Error ? e.message : "");
      return null;
    } finally {
      setBusy("");
    }
  }, [toast, loadExtras, navigate]);

  // Autosave: only a saved post with unsaved edits and no open conflict.
  useEffect(() => {
    if (!dirty || !draft?.id || conflict || busy) return;
    const t = window.setTimeout(() => void save(), AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [dirty, draft?.id, conflict, busy, save]);

  // Presence: while the editor is open, heartbeat so other editors see us, and
  // poll for theirs. Best-effort — a dropped beat never blocks writing.
  useEffect(() => {
    const id = draft?.id;
    if (!id) {
      setPresence([]);
      return;
    }
    let stopped = false;
    const beat = async () => {
      try {
        const r = await api.post<{ items: EditorPresence[] }>(`/admin/blog/posts/${id}/presence`, {});
        if (!stopped) setPresence(r?.items ?? []);
      } catch {
        /* presence is advisory */
      }
    };
    void beat();
    const timer = window.setInterval(beat, 12_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      void api.delete(`/admin/blog/posts/${id}/presence`).catch(() => {});
    };
  }, [draft?.id]);

  /** Upload an image chosen in the body editor, saving the draft first if new. */
  const uploadInlineImage = useCallback(
    async (file: File) => {
      let id = draftRef.current?.id;
      if (!id) {
        const saved = await save();
        id = saved?.id;
      }
      if (!id) throw new Error("Save the draft before adding images.");
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("post_id", String(id));
        const asset = await api.postMultipart<BlogAsset>("/admin/blog/assets", form);
        if (draftRef.current?.id === id) void loadExtras(id);
        return { url: asset.url, alt: asset.alt || asset.filename };
      } catch (e) {
        toast("error", "Could not add the image", e instanceof Error ? e.message : "");
        throw e;
      }
    },
    [save, loadExtras, toast],
  );

  const move = async (action: "submit" | "approve" | "publish" | "unpublish" | "reopen") => {
    const d = draftRef.current;
    if (!d?.id) return;
    setBusy(action);
    try {
      await api.post(`/admin/blog/posts/${d.id}/${action}`, {});
      toast("success", "Updated", `${d.title} · ${action}`);
      await reloadLatest(d.id);
    } catch (e) {
      toast("error", "Could not update", e instanceof Error ? e.message : "");
    } finally {
      setBusy("");
    }
  };

  const restore = async (revision: number) => {
    const d = draftRef.current;
    if (!d?.id) return;
    try {
      const restored = await api.post<WeeklyPost>(
        `/admin/blog/posts/${d.id}/revisions/${revision}/restore`,
        {},
      );
      setDraft({ ...restored, kicker: restored.kicker ?? "" });
      setBaseRevision(restored.revision);
      revRef.current = restored.revision;
      setConflict(null);
      setDirty(false);
      toast("success", "Restored", `Back to revision ${revision}.`);
      void loadExtras(restored.id);
    } catch (e) {
      toast("error", "Could not restore", e instanceof Error ? e.message : "");
    }
  };

  const insertAsset = (asset: BlogAsset) => {
    setDraft((cur) => {
      if (!cur) return cur;
      const alt = asset.alt || asset.filename;
      const image = `![${alt}](${asset.url})`;
      const caption = asset.caption ? `\n*${asset.caption}*` : "";
      return { ...cur, body: insertFigure(cur.body, asset.section, `${image}${caption}`) };
    });
    setDirty(true);
    setFigure({ open: false, section: "" });
    toast("success", "Figure inserted", "Added to the section. Saving shortly.");
  };

  const removeAsset = async (id: number) => {
    try {
      await api.delete(`/admin/blog/assets/${id}`);
      if (draftRef.current?.id) void loadExtras(draftRef.current.id);
    } catch (e) {
      toast("error", "Could not remove the figure", e instanceof Error ? e.message : "");
    }
  };

  const sections = useMemo(() => sectionsOf(draft?.body ?? ""), [draft?.body]);

  // ── Markdown import, into this draft ──
  const readImportFile = (file: File | undefined) => {
    if (!file) return;
    if (!/\.(md|markdown)$/i.test(file.name)) {
      toast("error", "Markdown only", "Choose a .md or .markdown file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result ?? ""));
      setImportName(file.name);
    };
    reader.readAsText(file);
  };

  const applyImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      const parsed = await api.post<{
        title: string; slug: string; no: string; order: number | null;
        kicker: string | null; excerpt: string; date: string; featured: boolean; body: string;
      }>("/admin/blog/markdown/parse", { markdown: importText, filename: importName });
      // Only overwrite fields the file actually provided.
      setDraft((cur) =>
        cur
          ? {
              ...cur,
              title: parsed.title || cur.title,
              slug: parsed.slug || cur.slug,
              no: parsed.no || cur.no,
              order: parsed.order ?? cur.order,
              kicker: parsed.kicker ?? cur.kicker,
              excerpt: parsed.excerpt || cur.excerpt,
              date: parsed.date || cur.date,
              featured: parsed.featured,
              body: parsed.body || cur.body,
              body_html: "",
            }
          : cur,
      );
      setSlugTouched(true);
      setDirty(true);
      setImportOpen(false);
      setImportText("");
      setImportName("");
      toast("success", "Imported into the editor", parsed.title || importName || "Markdown post");
    } catch (e) {
      toast("error", "Import failed", e instanceof Error ? e.message : "");
    } finally {
      setImporting(false);
    }
  };

  const createIssue = async () => {
    if (!newIssue.number.trim() && !newIssue.name.trim()) {
      toast("error", "Name the issue", "Give it a number such as “Issue 01”, or a name.");
      return;
    }
    setCreatingIssue(true);
    try {
      const created = await api.post<BlogIssue>("/admin/blog/issues", {
        number: newIssue.number.trim(),
        name: newIssue.name.trim(),
        date: newIssue.date.trim(),
      });
      issues.refresh();
      markDirty({ issue_id: created.id });
      setNewIssueOpen(false);
      setNewIssue({ number: "", name: "", date: "" });
      toast("success", "Issue created", created.number || created.name);
    } catch (e) {
      toast("error", "Could not create the issue", e instanceof Error ? e.message : "");
    } finally {
      setCreatingIssue(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (loadError || !draft) {
    return (
      <div>
        <PageHeader
          title="Post unavailable"
          description={loadError ?? "That post could not be found."}
          actions={
            <button className="btn-secondary" onClick={() => navigate("/weekly")}>
              <ArrowLeft size={15} /> All posts
            </button>
          }
        />
      </div>
    );
  }

  const isNew = !draft.id;
  const status = draft.status ?? "draft";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
      <PageHeader
        title={isNew ? "New post" : draft.title || "Untitled post"}
        description={
          isNew
            ? "Draft a new essay. It autosaves every 15 seconds; images can be dropped straight into the body."
            : `Editing revision ${baseRevision} · ${status === "published" ? "published" : "saved"} to the Weekly.`
        }
        actions={
          <>
            <button className="btn-ghost" onClick={() => navigate("/weekly")} disabled={Boolean(busy)}>
              <ArrowLeft size={15} /> All posts
            </button>
            <button className="btn-secondary" onClick={() => setImportOpen(true)} disabled={Boolean(busy)}>
              <FileUp size={15} /> Import .md
            </button>
            <button className="btn-secondary" onClick={() => setPreview((p) => !p)}>
              {preview ? <Pencil size={15} /> : <Eye size={15} />}
              {preview ? "Write" : "Preview"}
            </button>
            <button className="btn-secondary" disabled={Boolean(busy)} onClick={() => void save()}>
              {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {status === "published" ? "Save changes" : "Save draft"}
            </button>
            {status === "draft" || !draft.status ? (
              <button
                className="btn-primary"
                disabled={Boolean(busy)}
                onClick={async () => {
                  const saved = await save();
                  if (saved) await move("submit");
                }}
              >
                {busy === "submit" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Save &amp; submit
              </button>
            ) : null}
            {status === "in_review" && isAdmin ? (
              <button className="btn-primary" disabled={Boolean(busy)} onClick={() => void move("approve")}>
                {busy === "approve" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Approve
              </button>
            ) : null}
            {status === "approved" && isAdmin ? (
              <button className="btn-primary" disabled={Boolean(busy)} onClick={() => void move("publish")}>
                {busy === "publish" ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                Publish
              </button>
            ) : null}
            {status === "published" && isAdmin ? (
              <button className="btn-secondary" disabled={Boolean(busy)} onClick={() => void move("unpublish")}>
                <EyeOff size={14} /> Unpublish
              </button>
            ) : null}
            {status === "in_review" || status === "approved" ? (
              <button className="btn-ghost" disabled={Boolean(busy)} onClick={() => void move("reopen")}>
                <Undo2 size={14} /> Reopen
              </button>
            ) : null}
          </>
        }
      />
      </div>

      {/* Status + collaboration bar */}
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-phantix-700/50 bg-phantix-950/50 px-3 py-2 text-xs">
        <StatusChip status={status} />
        <span className="font-mono text-slate-500">r{baseRevision}</span>
        <span className="text-slate-500">
          {busy === "save"
            ? "Saving…"
            : dirty
              ? "Unsaved changes — autosaves every 15s"
              : savedAt
                ? `Saved ${timeAgo(new Date(savedAt).toISOString())}`
                : "No changes yet"}
        </span>
        {session?.fullName ? <span className="text-slate-600">Editing as {session.fullName}</span> : null}
        {presence.length > 0 ? (
          <span className="flex items-center gap-1.5 text-gold-300" title={presence.map((p) => p.name).join(", ")}>
            <span className="flex -space-x-1.5">
              {presence.slice(0, 4).map((p) => (
                <span
                  key={p.staff_id}
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-phantix-800 bg-gold-400/20 text-[9px] font-semibold text-gold-200"
                >
                  {p.initials}
                </span>
              ))}
            </span>
            {presence.length === 1 ? `${presence[0].name} is editing` : `${presence.length} others editing`}
          </span>
        ) : null}
      </div>

      {conflict !== null ? (
        <div className="mb-4 shrink-0 rounded-lg border border-severity-high/40 bg-severity-high/10 px-3 py-2.5 text-[13px] text-severity-high">
          <p className="font-semibold">Another editor saved a newer revision (r{conflict}).</p>
          <p className="mt-0.5 text-severity-high/80">
            Your edits are still here. Load their version to merge by hand, or overwrite it with yours.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-secondary !py-1.5 !text-xs" onClick={() => draft.id && void reloadLatest(draft.id)}>
              Load their version
            </button>
            <button
              className="btn-danger !py-1.5 !text-xs"
              onClick={() => {
                setBaseRevision(conflict);
                revRef.current = conflict;
                setConflict(null);
                void save();
              }}
            >
              Overwrite with mine
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* Writing column */}
        <div className="flex min-h-0 min-w-0 flex-col">
          <Card className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="shrink-0">
              <label className="label" htmlFor="w-title">Title</label>
              <input
                id="w-title"
                className="w-full border-0 bg-transparent font-display text-3xl font-bold leading-tight text-white outline-none placeholder:text-slate-600"
                value={draft.title}
                onChange={(e) => markDirty({
                  title: e.target.value,
                  slug: slugTouched ? draft.slug : slugify(e.target.value),
                })}
                placeholder="Proof Before Panic"
              />
            </div>
            <div className="shrink-0">
              <label className="label" htmlFor="w-excerpt">
                Standfirst <span className="font-normal normal-case text-slate-500">({draft.excerpt.length}/600)</span>
              </label>
              <textarea
                id="w-excerpt"
                className="input !min-h-[56px] !text-[15px]"
                maxLength={600}
                value={draft.excerpt}
                onChange={(e) => markDirty({ excerpt: e.target.value })}
                placeholder="One-line summary shown in the contents and under the title."
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-1.5 flex shrink-0 items-center justify-between">
                <span className="label !mb-0">Body</span>
                <span className="text-[12px] text-slate-500">
                  {preview ? "Reader preview" : "Rich text"} · {draft.body.length.toLocaleString()} characters
                </span>
              </div>
              {preview ? (
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <ReaderPreview
                    title={draft.title}
                    kicker={draft.kicker}
                    excerpt={draft.excerpt}
                    body={draft.body}
                    html={draft.body_html ?? ""}
                    contributors={contributors}
                    date={draft.date}
                  />
                </div>
              ) : (
                <RichMarkdownEditor
                  fill
                  value={draft.body}
                  html={draft.body_html ?? ""}
                  onChange={(body) => markDirty({ body })}
                  onChangeHtml={(body_html) => markDirty({ body_html })}
                  onUploadImage={uploadInlineImage}
                  placeholder={"Start writing. Use the toolbar for a heading, a quote, a list, a link or an image — or drag an image in."}
                />
              )}
            </div>
          </Card>
        </div>

        {/* Right rail: settings + collaboration panels */}
        <aside className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <WeeklyGuidelines draft={draft} />
          <Card className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Post settings</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="w-no">No.</label>
                <input id="w-no" className="input font-mono" value={draft.no} onChange={(e) => markDirty({ no: e.target.value })} placeholder="01" />
              </div>
              <div>
                <label className="label" htmlFor="w-order">Order</label>
                <input id="w-order" type="number" min={0} className="input font-mono" value={draft.order} onChange={(e) => markDirty({ order: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="w-slug">Address</label>
              <div className="flex items-center rounded-md border border-phantix-700 bg-phantix-950/60">
                <span className="pl-3 font-mono text-xs text-slate-500">/posts/</span>
                <input
                  id="w-slug"
                  className="input !border-0 !bg-transparent !pl-1 font-mono"
                  value={draft.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    markDirty({ slug: slugify(e.target.value) });
                  }}
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="w-issue">Issue</label>
              <div className="flex items-center gap-2">
                <select
                  id="w-issue"
                  className="input"
                  value={draft.issue_id ?? ""}
                  onChange={(e) => markDirty({ issue_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Unassigned</option>
                  {issues.data.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.number || i.name}{i.number && i.name ? ` — ${i.name}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary shrink-0 !px-2 !py-2"
                  onClick={() => setNewIssueOpen(true)}
                  title="Create an issue"
                  aria-label="Create an issue"
                >
                  <Plus size={14} />
                </button>
              </div>
              {issues.loading && !issues.data.length ? (
                <p className="mt-1 text-[11px] text-slate-500">Loading issues…</p>
              ) : issues.error ? (
                <p className="mt-1 text-[11px] text-severity-critical">
                  Could not load issues.{" "}
                  <button type="button" className="underline" onClick={issues.refresh}>Retry</button>
                </p>
              ) : issues.data.length === 0 ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  No issues yet —{" "}
                  <button type="button" className="text-gold-300 underline" onClick={() => setNewIssueOpen(true)}>
                    create one
                  </button>
                  .
                </p>
              ) : null}
            </div>
            <div>
              <label className="label" htmlFor="w-date">Issue date</label>
              <input id="w-date" className="input" value={draft.date} onChange={(e) => markDirty({ date: e.target.value })} placeholder="September 2026" />
            </div>
            <div>
              <label className="label" htmlFor="w-kicker">Kicker</label>
              <input id="w-kicker" className="input" value={draft.kicker ?? ""} onChange={(e) => markDirty({ kicker: e.target.value })} placeholder="Lead essay" />
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-300">
              <input type="checkbox" className="mt-1 accent-gold-400" checked={draft.featured} onChange={(e) => markDirty({ featured: e.target.checked })} />
              <span>Lead essay. Shown on the cover of the issue, and it replaces the current lead.</span>
            </label>
          </Card>

          {/* Collaboration panels */}
          <Card className="!p-0">
            <div className="flex flex-wrap items-center gap-1 border-b border-phantix-700/40 p-2">
              <button type="button" className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => setPanel(panel === "contributors" ? "none" : "contributors")} disabled={!draft.id}>
                <Users size={13} /> Contributors ({contributors.length})
              </button>
              <button type="button" className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => setPanel(panel === "figures" ? "none" : "figures")} disabled={!draft.id}>
                <ImagePlus size={13} /> Figures ({assets.length})
              </button>
              <button type="button" className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => setPanel(panel === "history" ? "none" : "history")} disabled={!draft.id}>
                <History size={13} /> History
              </button>
              <button type="button" className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => setPanel(panel === "activity" ? "none" : "activity")} disabled={!draft.id}>
                Activity
              </button>
            </div>

            <div className="p-3">
              {!draft.id ? (
                <p className="text-[13px] text-slate-500">Save the draft to start the revision history, figures and bylines.</p>
              ) : panel === "none" ? (
                <div className="space-y-2 text-[13px] text-slate-500">
                  <p className="font-semibold uppercase tracking-wider text-slate-400">In this draft</p>
                  <p>{contributors.length ? contributors.map((c) => c.name).join(", ") : "No contributors yet."}</p>
                </div>
              ) : null}

              {panel === "contributors" && draft.id ? (
                contributors.length === 0 ? (
                  <p className="text-[13px] text-slate-500">Everyone who writes or rewrites this post is listed here; the admin who approves it is not.</p>
                ) : (
                  <ul className="divide-y divide-phantix-800">
                    {contributors.map((c) => (
                      <li key={c.name} className="flex items-center gap-3 py-2 text-[13px]">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-400/15 text-[11px] font-semibold text-gold-200">
                          {c.initials}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-slate-200">{c.name}</span>
                        <span className="shrink-0 text-slate-500">{c.edits} {c.edits === 1 ? "edit" : "edits"}</span>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}

              {panel === "figures" && draft.id ? (
                <div className="space-y-3">
                  <button className="btn-secondary w-full !py-1.5 !text-xs" onClick={() => setFigure({ open: true, section: sections[0]?.id ?? "" })}>
                    <ImagePlus size={13} /> Upload a figure
                  </button>
                  {assets.length === 0 ? (
                    <p className="text-[13px] text-slate-500">No figures yet. Upload one or drop an image into the body.</p>
                  ) : (
                    <ul className="space-y-2">
                      {assets.map((a) => (
                        <li key={a.id} className="flex items-start gap-3 rounded-md border border-phantix-700/40 p-2">
                          <img src={a.url} alt={a.alt || a.filename} className="h-12 w-16 shrink-0 rounded object-cover" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] text-slate-200">{a.alt || a.filename}</span>
                            <span className="block truncate font-mono text-[11px] text-slate-500">{a.section || "introduction"}</span>
                            <span className="mt-1 flex gap-1">
                              <button className="btn-ghost !px-2 !py-0.5 !text-[11px]" onClick={() => insertAsset(a)}>Insert</button>
                              <button className="btn-ghost !px-2 !py-0.5 !text-[11px] text-severity-critical" onClick={() => void removeAsset(a.id)}>Remove</button>
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {panel === "history" && draft.id ? (
                <ul className="divide-y divide-phantix-800">
                  {revisions.map((r) => (
                    <li key={r.revision} className="flex items-center gap-2 py-2 text-[13px]">
                      <span className="font-mono text-slate-400">r{r.revision}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-300" title={r.note || r.title}>
                        {r.note || r.title}
                      </span>
                      <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => void restore(r.revision)} disabled={r.revision === baseRevision}>
                        <RotateCcw size={12} /> Restore
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {panel === "activity" && draft.id ? (
                <ul className="space-y-1.5">
                  {activity.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-[13px] text-slate-400">
                      <span className="text-slate-200">{a.staff_name}</span>
                      <span>{a.action.replace(/_/g, " ")}</span>
                      <span className="ml-auto text-slate-600">{a.created_at ? timeAgo(a.created_at) : ""}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Card>
        </aside>
      </div>

      {/* ── Import Markdown into this draft ── */}
      <Modal open={importOpen} onClose={() => !importing && setImportOpen(false)} title="Import Markdown" wide>
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Frontmatter sets the fields (<code className="font-mono text-gold-300">title, no, order, date, kicker, excerpt, featured</code>).
            The body is converted into the rich editor; a field is only overwritten when the file provides it.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={importFileRef}
              type="file"
              accept=".md,.markdown,text/markdown"
              className="hidden"
              onChange={(e) => {
                readImportFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button className="btn-secondary" onClick={() => importFileRef.current?.click()}>
              <FileUp size={15} /> Choose a .md file
            </button>
            {importName && <span className="font-mono text-xs text-slate-400">{importName}</span>}
          </div>
          <textarea
            className="input !min-h-[240px] font-mono text-[13px]"
            aria-label="Markdown to import"
            placeholder={"---\ntitle: \"A New Essay\"\nno: \"05\"\ndate: \"October 2026\"\nexcerpt: \"One-line summary.\"\n---\n\nFirst paragraph…"}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" disabled={importing} onClick={() => setImportOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={importing || !importText.trim()} onClick={() => void applyImport()}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Import into editor
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Create an issue inline ── */}
      <Modal open={newIssueOpen} onClose={() => !creatingIssue && setNewIssueOpen(false)} title="New issue">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ei-number">Issue number</label>
              <input id="ei-number" className="input" value={newIssue.number} onChange={(e) => setNewIssue({ ...newIssue, number: e.target.value })} placeholder="Issue 01" />
            </div>
            <div>
              <label className="label" htmlFor="ei-date">Date</label>
              <input id="ei-date" className="input" value={newIssue.date} onChange={(e) => setNewIssue({ ...newIssue, date: e.target.value })} placeholder="September 2026" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="ei-name">Name</label>
            <input id="ei-name" className="input" value={newIssue.name} onChange={(e) => setNewIssue({ ...newIssue, name: e.target.value })} placeholder="The launch issue" />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" disabled={creatingIssue} onClick={() => setNewIssueOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={creatingIssue} onClick={() => void createIssue()}>
              {creatingIssue ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create issue
            </button>
          </div>
        </div>
      </Modal>

      <FigureModal
        open={figure.open}
        postId={draft.id}
        sections={sections}
        initialSection={figure.section}
        onClose={() => setFigure({ open: false, section: "" })}
        onUploaded={(asset) => {
          setAssets((cur) => [...cur, asset]);
          setFigure({ open: false, section: "" });
        }}
      />
    </div>
  );
}

/* ── Figure upload modal ─────────────────────────────────────────────────────── */

function FigureModal({
  open,
  postId,
  sections,
  initialSection,
  onClose,
  onUploaded,
}: {
  open: boolean;
  postId?: number;
  sections: { id: string; title: string }[];
  initialSection: string;
  onClose: () => void;
  onUploaded: (asset: BlogAsset) => void;
}) {
  const { toast } = useStore();
  const [section, setSection] = useState(initialSection);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setSection(initialSection);
  }, [open, initialSection]);

  const upload = async (file: File) => {
    if (!postId) {
      toast("error", "Save the post first", "A draft must exist before figures can attach to it.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("post_id", String(postId));
      form.append("section", section);
      form.append("alt", alt);
      form.append("caption", caption);
      const asset = await api.postMultipart<BlogAsset>("/admin/blog/assets", form);
      onUploaded(asset);
      toast("success", "Figure uploaded", "Now insert it into the body.");
    } catch (e) {
      toast("error", "Upload failed", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Upload a figure">
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="fig-section">Section</label>
          <select id="fig-section" className="input" value={section} onChange={(e) => setSection(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id || "intro"} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="fig-alt">Alt text (for accessibility and search)</label>
          <input id="fig-alt" className="input" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="A parent domain with one unowned subdomain" />
        </div>
        <div>
          <label className="label" htmlFor="fig-caption">Caption</label>
          <input id="fig-caption" className="input" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Figure 1. Caption shown under the image." />
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} Choose image
          </button>
        </div>
        <p className="text-[12px] text-slate-500">PNG, JPEG, WebP, GIF or SVG, up to 6 MB.</p>
      </div>
    </Modal>
  );
}
