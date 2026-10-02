import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2, Eye, EyeOff, FileUp, History, ImagePlus, Loader2, Newspaper, Pencil, Plus,
  RefreshCw, RotateCcw, Search, Send, Settings2, Star, Trash2, Undo2, X,
} from "lucide-react";
import { Card, EmptyState, Modal, PageHeader, TableSkeleton, Tabs } from "@/components/ui";
import MarkdownView from "@/components/MarkdownView";
import { api, ApiError } from "@/lib/api";
import { BLOG_URL } from "@/lib/links";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { cx, timeAgo } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────────
 * The SecureGraph Weekly — the editorial desk.
 *
 * Two or more staff work on one draft safely: every save carries the revision
 * it was read from, and a save that would overwrite someone else's is refused
 * with a conflict the editor resolves in place. Each save writes a snapshot,
 * so any earlier version can be read or restored. A post moves
 * draft -> in review -> approved -> published; editors submit, admins approve
 * and publish. Figures are uploaded and inserted per section.
 * ──────────────────────────────────────────────────────────────────────────── */

type PostStatus = "draft" | "in_review" | "approved" | "published";

interface WeeklyPost {
  id: number;
  slug: string;
  title: string;
  no: string;
  order: number;
  date: string;
  kicker: string | null;
  excerpt: string;
  featured: boolean;
  body: string;
  status: PostStatus;
  revision: number;
  published_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
}

interface BlogAsset {
  id: number;
  section: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  alt: string;
  caption: string;
  url: string;
  created_at: string | null;
}

interface BlogRevision {
  revision: number;
  title: string;
  body: string;
  status: PostStatus;
  editor_name: string | null;
  note: string | null;
  created_at: string | null;
}

interface BlogActivity {
  id: number;
  staff_name: string;
  action: string;
  detail: Record<string, unknown>;
  created_at: string | null;
}

type Issue = Record<
  "name" | "number" | "date" | "folio" | "kicker" | "deck" | "byline" | "pullQuote" | "pullCite" | "newsletterLabel" | "newsletterBlurb" | "newsletterUrl",
  string
>;

type Draft = Omit<WeeklyPost, "id" | "status" | "revision" | "published_at" | "reviewed_at" | "approved_at" | "updated_at" | "updated_by_name"> & {
  id?: number;
  status?: PostStatus;
};

const EMPTY: Draft = {
  slug: "", title: "", no: "", order: 0, date: "", kicker: "", excerpt: "", featured: false, body: "",
};

const STATUS_META: Record<PostStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "border-phantix-600/50 bg-phantix-800/60 text-slate-300" },
  in_review: { label: "In review", className: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
  approved: { label: "Approved", className: "border-gold-400/30 bg-gold-400/10 text-gold-300" },
  published: { label: "Published", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 160);

/** H2 headings, in order. The first entry (id "") is the intro, before any H2. */
function sectionsOf(body: string): { id: string; title: string }[] {
  const out = [{ id: "", title: "Introduction" }];
  const re = /^##\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out.push({ id: slugify(m[1]), title: m[1] });
  return out;
}

/** Insert a figure at the end of a section (or at the top for the intro). */
function insertFigure(body: string, sectionId: string, markdown: string): string {
  const block = `${markdown}\n`;
  if (!sectionId) return `${block}\n${body}`.replace(/\n{3,}/g, "\n\n");
  const lines = body.split("\n");
  const start = lines.findIndex((l) => /^##\s+/.test(l) && slugify(l.replace(/^##\s+/, "")) === sectionId);
  if (start === -1) return `${body.replace(/\s*$/, "")}\n\n${block}`;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  const before = lines.slice(0, end).join("\n").replace(/\s*$/, "");
  const after = lines.slice(end).join("\n");
  return `${before}\n\n${block}${after ? `\n${after}` : ""}`.replace(/\n{3,}/g, "\n\n");
}

const ISSUE_FIELDS: { key: keyof Issue; label: string; long?: boolean; hint?: string }[] = [
  { key: "name", label: "Publication name" },
  { key: "number", label: "Issue number", hint: "e.g. Issue 01" },
  { key: "date", label: "Issue date", hint: "e.g. September 2026" },
  { key: "folio", label: "Folio", hint: "Page numbers on the spread, e.g. 01–02" },
  { key: "kicker", label: "Kicker", hint: "The small line above the cover title" },
  { key: "deck", label: "Deck", long: true, hint: "The standfirst under the cover title" },
  { key: "byline", label: "Byline" },
  { key: "pullQuote", label: "Pull quote", long: true },
  { key: "pullCite", label: "Pull-quote citation" },
  { key: "newsletterLabel", label: "Newsletter heading" },
  { key: "newsletterBlurb", label: "Newsletter blurb", long: true },
  { key: "newsletterUrl", label: "Subscribe link" },
];

function StatusChip({ status }: { status: PostStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={cx("chip", meta.className)}>{meta.label}</span>
  );
}

const AUTOSAVE_MS = 15_000;

export default function WeeklyAdmin() {
  const { toast, isAdmin, session } = useStore();
  const role = session?.role;

  const posts = useResource<WeeklyPost[]>(async () => {
    const raw = await api.get<{ items: WeeklyPost[] }>("/admin/blog/posts");
    return raw?.items ?? [];
  }, []);

  const [tab, setTab] = useState<"all" | PostStatus>("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return posts.data.filter(
      (p) =>
        (tab === "all" || p.status === tab) &&
        (!needle || `${p.title} ${p.slug} ${p.excerpt}`.toLowerCase().includes(needle)),
    );
  }, [posts.data, tab, q]);
  const counts = useMemo(() => {
    const base = { all: posts.data.length, draft: 0, in_review: 0, approved: 0, published: 0 };
    for (const p of posts.data) base[p.status] = (base[p.status] ?? 0) + 1;
    return base;
  }, [posts.data]);

  // ── Editor ──
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseRevision, setBaseRevision] = useState(1);
  const [slugTouched, setSlugTouched] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "submit" | "approve" | "publish" | "unpublish" | "reopen">("");
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [conflict, setConflict] = useState<number | null>(null); // current remote revision
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  const revRef = useRef(1);
  revRef.current = baseRevision;

  const [assets, setAssets] = useState<BlogAsset[]>([]);
  const [revisions, setRevisions] = useState<BlogRevision[]>([]);
  const [activity, setActivity] = useState<BlogActivity[]>([]);
  const [panel, setPanel] = useState<"none" | "history" | "activity" | "figures">("none");
  const [figure, setFigure] = useState<{ open: boolean; section: string }>({ open: false, section: "" });

  const loadExtras = useCallback(async (postId: number) => {
    try {
      const [a, r, act] = await Promise.all([
        api.get<{ items: BlogAsset[] }>(`/admin/blog/posts/${postId}/assets`),
        api.get<{ items: BlogRevision[] }>(`/admin/blog/posts/${postId}/revisions`),
        api.get<{ items: BlogActivity[] }>(`/admin/blog/posts/${postId}/activity`),
      ]);
      setAssets(a?.items ?? []);
      setRevisions(r?.items ?? []);
      setActivity(act?.items ?? []);
    } catch {
      /* extras are best-effort; the editor still works without them */
    }
  }, []);

  const openNew = () => {
    const next = Math.max(0, ...posts.data.map((p) => p.order)) + 1;
    setDraft({ ...EMPTY, order: next, no: String(next).padStart(2, "0") });
    setSlugTouched(false);
    setPreview(false);
    setBaseRevision(1);
    setDirty(false);
    setSavedAt(null);
    setConflict(null);
    setPanel("none");
    setAssets([]);
    setRevisions([]);
    setActivity([]);
  };

  const openEdit = (p: WeeklyPost) => {
    setDraft({ ...p, kicker: p.kicker ?? "" });
    setSlugTouched(true);
    setPreview(false);
    setBaseRevision(p.revision);
    setDirty(false);
    setSavedAt(null);
    setConflict(null);
    setPanel("none");
    void loadExtras(p.id);
  };

  const reloadLatest = async (postId: number) => {
    const fresh = await api.get<WeeklyPost>(`/admin/blog/posts/${postId}`);
    setDraft({ ...fresh, kicker: fresh.kicker ?? "" });
    setBaseRevision(fresh.revision);
    setDirty(false);
    setSavedAt(Date.now());
    setConflict(null);
    toast("success", "Loaded the latest", `Now at revision ${fresh.revision}.`);
  };

  const save = useCallback(
    async (opts: { publish?: boolean } = {}): Promise<WeeklyPost | null> => {
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
        order: Number(d.order) || 0,
        date: d.date.trim(),
        kicker: (d.kicker ?? "").trim(),
        excerpt: d.excerpt.trim(),
        featured: d.featured,
        body: d.body,
        revision: d.id ? revRef.current : undefined,
      };
      try {
        let saved: WeeklyPost;
        if (d.id) saved = await api.patch<WeeklyPost>(`/admin/blog/posts/${d.id}`, body);
        else saved = await api.post<WeeklyPost>("/admin/blog/posts", body);
        setDraft((cur) => (cur ? { ...cur, id: saved.id } : cur));
        setBaseRevision(saved.revision);
        revRef.current = saved.revision;
        setDirty(false);
        setSavedAt(Date.now());
        setConflict(null);
        if (opts.publish) toast("success", "Saved", `“${saved.title}” saved.`);
        posts.refresh();
        if (saved.id) void loadExtras(saved.id);
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
    },
    [toast, posts, loadExtras],
  );

  // Autosave: only a saved post with unsaved edits and no open conflict.
  useEffect(() => {
    if (!dirty || !draft?.id || conflict || busy) return;
    const t = window.setTimeout(() => void save(), AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [dirty, draft?.id, conflict, busy, save, draft]);

  const move = async (p: { id: number; title: string }, action: "submit" | "approve" | "publish" | "unpublish" | "reopen") => {
    setBusy(action);
    try {
      await api.post(`/admin/blog/posts/${p.id}/${action}`, {});
      toast("success", "Updated", `${p.title} · ${action}`);
      posts.refresh();
      if (draft?.id === p.id) void reloadLatest(p.id);
    } catch (e) {
      toast("error", "Could not update", e instanceof Error ? e.message : "");
    } finally {
      setBusy("");
    }
  };

  const [confirmDelete, setConfirmDelete] = useState<WeeklyPost | null>(null);
  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/admin/blog/posts/${confirmDelete.id}`);
      toast("success", "Deleted", confirmDelete.title);
      setConfirmDelete(null);
      posts.refresh();
    } catch (e) {
      toast("error", "Could not delete", e instanceof Error ? e.message : "");
    }
  };

  const restore = async (revision: number) => {
    if (!draft?.id) return;
    try {
      const restored = await api.post<WeeklyPost>(
        `/admin/blog/posts/${draft.id}/revisions/${revision}/restore`,
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

  // ── Import ──
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const readFile = (f: File | undefined) => {
    if (!f) return;
    if (!/\.(md|markdown)$/i.test(f.name)) {
      toast("error", "Markdown only", "Choose a .md or .markdown file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result ?? ""));
      setImportName(f.name);
    };
    reader.readAsText(f);
  };
  const runImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      await api.post("/admin/blog/posts/import", { markdown: importText, filename: importName, publish: false });
      toast("success", "Imported as a draft", importName || "Markdown post");
      setImportOpen(false);
      setImportText("");
      setImportName("");
      posts.refresh();
    } catch (e) {
      toast("error", "Import failed", e instanceof Error ? e.message : "");
    } finally {
      setImporting(false);
    }
  };

  // ── Issue settings ──
  const [issue, setIssue] = useState<Issue | null>(null);
  const [issueBusy, setIssueBusy] = useState(false);
  const openIssue = async () => {
    try {
      const r = await api.get<{ issue: Issue }>("/admin/blog/issue");
      setIssue(r.issue);
    } catch (e) {
      toast("error", "Could not load issue settings", e instanceof Error ? e.message : "");
    }
  };
  const saveIssue = async () => {
    if (!issue) return;
    setIssueBusy(true);
    try {
      await api.put("/admin/blog/issue", issue);
      toast("success", "Issue settings saved", "The Weekly picks them up within a minute.");
      setIssue(null);
    } catch (e) {
      toast("error", "Could not save", e instanceof Error ? e.message : "");
    } finally {
      setIssueBusy(false);
    }
  };

  const sections = useMemo(() => sectionsOf(draft?.body ?? ""), [draft?.body]);

  return (
    <div>
      <PageHeader
        title="The SecureGraph Weekly"
        description="Write, review and publish the Weekly. Several editors can work on one draft: every save is versioned, and a conflicting save is caught. Posts go live only after an admin approves them."
        actions={
          <>
            <button onClick={posts.refresh} className="btn-ghost !px-3 !py-1.5" aria-label="Refresh posts" title="Refresh">
              <RefreshCw size={14} />
            </button>
            <a href={BLOG_URL} target="_blank" rel="noreferrer" className="btn-secondary">
              <Newspaper size={15} /> Open the Weekly
            </a>
            <button className="btn-secondary" onClick={() => void openIssue()}>
              <Settings2 size={15} /> Issue settings
            </button>
            <button className="btn-secondary" onClick={() => setImportOpen(true)}>
              <FileUp size={15} /> Import .md
            </button>
            <button className="btn-primary" onClick={openNew}>
              <Plus size={15} /> New post
            </button>
          </>
        }
      />

      <Tabs
        tabs={[
          { id: "all", label: "All posts", count: counts.all },
          { id: "draft", label: "Drafts", count: counts.draft },
          { id: "in_review", label: "In review", count: counts.in_review },
          { id: "approved", label: "Approved", count: counts.approved },
          { id: "published", label: "Published", count: counts.published },
        ]}
        active={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-phantix-700/40 p-4">
          <div className="relative w-80 max-w-full">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input !pl-10" placeholder="Search title, slug or excerpt…" aria-label="Search posts" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {posts.loading && !posts.data.length ? (
          <div className="p-4"><TableSkeleton rows={5} cols={5} /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Newspaper size={24} />}
            title={posts.data.length ? "No posts match" : "No posts yet"}
            body={posts.data.length ? "Try another search or tab." : "Start the first issue: write a post, or import a Markdown file with frontmatter."}
            action={!posts.data.length ? <button className="btn-primary" onClick={openNew}><Plus size={15} /> New post</button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-phantix-700/40">
                  <th className="th w-14">No.</th>
                  <th className="th">Post</th>
                  <th className="th">Status</th>
                  <th className="th">Rev</th>
                  <th className="th">Last edit</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-phantix-700/20 hover:bg-phantix-900/30">
                    <td className="td font-mono text-xs text-gold-300">{p.no}</td>
                    <td className="td max-w-[360px]">
                      <p className="flex items-center gap-1.5 font-medium text-slate-100" title={p.excerpt || undefined}>
                        {p.featured && <Star size={13} className="shrink-0 fill-gold-400 text-gold-400" aria-label="Lead essay" />}
                        <span className="truncate">{p.title}</span>
                        <span className="shrink-0 truncate font-mono text-[12px] font-normal text-slate-500">/posts/{p.slug}</span>
                      </p>
                    </td>
                    <td className="td"><StatusChip status={p.status} /></td>
                    <td className="td font-mono text-xs text-slate-400">r{p.revision}</td>
                    <td className="td text-xs text-slate-500">
                      {p.updated_at ? (
                        <>
                          {timeAgo(p.updated_at)}
                          {p.updated_by_name ? <span className="text-slate-600"> · {p.updated_by_name}</span> : null}
                        </>
                      ) : "Not set"}
                    </td>
                    <td className="td text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1">
                        <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => openEdit(p)}>
                          <Pencil size={13} /> Edit
                        </button>
                        {p.status === "draft" && (
                          <button className="btn-ghost !px-2 !py-1 !text-xs text-sky-300" onClick={() => void move(p, "submit")}>
                            <Send size={13} /> Submit
                          </button>
                        )}
                        {p.status === "in_review" && isAdmin && (
                          <button className="btn-ghost !px-2 !py-1 !text-xs text-gold-300" onClick={() => void move(p, "approve")}>
                            <CheckCircle2 size={13} /> Approve
                          </button>
                        )}
                        {p.status === "approved" && isAdmin && (
                          <button className="btn-ghost !px-2 !py-1 !text-xs text-emerald-300" onClick={() => void move(p, "publish")}>
                            <Eye size={13} /> Publish
                          </button>
                        )}
                        {p.status === "published" && isAdmin && (
                          <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => void move(p, "unpublish")} title="Take it off the public site">
                            <EyeOff size={13} /> Unpublish
                          </button>
                        )}
                        <button className="btn-ghost !px-2 !py-1 !text-xs text-severity-critical" onClick={() => setConfirmDelete(p)} aria-label={`Delete ${p.title}`} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Editor ── */}
      <Modal open={Boolean(draft)} onClose={() => !busy && setDraft(null)} title={draft?.id ? "Edit post" : "New post"} wide>
        {draft && (
          <div className="space-y-4">
            {/* Status + collaboration bar */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-phantix-700/50 bg-phantix-950/50 px-3 py-2 text-xs">
              <StatusChip status={draft.status ?? "draft"} />
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
              <div className="ml-auto flex items-center gap-1">
                <button type="button" className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => setPanel(panel === "figures" ? "none" : "figures")} disabled={!draft.id}>
                  <ImagePlus size={13} /> Figures ({assets.length})
                </button>
                <button type="button" className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => setPanel(panel === "history" ? "none" : "history")} disabled={!draft.id}>
                  <History size={13} /> History ({revisions.length})
                </button>
                <button type="button" className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => setPanel(panel === "activity" ? "none" : "activity")} disabled={!draft.id}>
                  Activity
                </button>
              </div>
            </div>

            {/* Conflict banner */}
            {conflict !== null && (
              <div className="rounded-lg border border-severity-high/40 bg-severity-high/10 px-3 py-2.5 text-[13px] text-severity-high">
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
                    onClick={() => { setBaseRevision(conflict); revRef.current = conflict; setConflict(null); void save(); }}
                  >
                    Overwrite with mine
                  </button>
                </div>
              </div>
            )}

            {/* Panels */}
            {panel === "figures" && (
              <div className="rounded-lg border border-phantix-700/50 bg-phantix-950/40 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Figures</p>
                  <button className="btn-secondary !py-1.5 !text-xs" onClick={() => setFigure({ open: true, section: sections[0]?.id ?? "" })}>
                    <ImagePlus size={13} /> Upload a figure
                  </button>
                </div>
                {assets.length === 0 ? (
                  <p className="mt-2 text-[13px] text-slate-500">No figures yet. Upload one and insert it into the section you choose.</p>
                ) : (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {assets.map((a) => (
                      <li key={a.id} className="flex items-start gap-3 rounded-md border border-phantix-700/40 p-2">
                        <img src={a.url} alt={a.alt || a.filename} className="h-12 w-16 shrink-0 rounded object-cover" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-slate-200">{a.alt || a.filename}</span>
                          <span className="block truncate font-mono text-[11px] text-slate-500">{a.section || "introduction"}</span>
                          <span className="mt-1 flex gap-1">
                            <button className="btn-ghost !px-2 !py-0.5 !text-[11px]" onClick={() => insertAsset(a)}>Insert</button>
                            <button
                              className="btn-ghost !px-2 !py-0.5 !text-[11px] text-severity-critical"
                              onClick={async () => { await api.delete(`/admin/blog/assets/${a.id}`); draft.id && void loadExtras(draft.id); }}
                            >
                              Remove
                            </button>
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {panel === "history" && (
              <div className="max-h-64 overflow-auto rounded-lg border border-phantix-700/50 bg-phantix-950/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Revision history</p>
                <ul className="mt-2 divide-y divide-phantix-800">
                  {revisions.map((r) => (
                    <li key={r.revision} className="flex items-center gap-3 py-2 text-[13px]">
                      <span className="font-mono text-slate-400">r{r.revision}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-300">
                        {r.note || r.title}
                        {r.editor_name ? <span className="text-slate-600"> · {r.editor_name}</span> : null}
                      </span>
                      <span className="text-slate-600">{r.created_at ? timeAgo(r.created_at) : ""}</span>
                      <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => void restore(r.revision)} disabled={r.revision === baseRevision}>
                        <RotateCcw size={12} /> Restore
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {panel === "activity" && (
              <div className="max-h-64 overflow-auto rounded-lg border border-phantix-700/50 bg-phantix-950/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Activity</p>
                <ul className="mt-2 space-y-1.5">
                  {activity.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-[13px] text-slate-400">
                      <span className="text-slate-200">{a.staff_name}</span>
                      <span>{a.action.replace(/_/g, " ")}</span>
                      <span className="ml-auto text-slate-600">{a.created_at ? timeAgo(a.created_at) : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Metadata */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="sm:col-span-3">
                <label className="label" htmlFor="w-title">Title</label>
                <input
                  id="w-title"
                  className="input"
                  value={draft.title}
                  onChange={(e) => { setDraft({ ...draft, title: e.target.value, slug: slugTouched ? draft.slug : slugify(e.target.value) }); setDirty(true); }}
                  placeholder="Proof Before Panic"
                />
              </div>
              <div>
                <label className="label" htmlFor="w-no">No.</label>
                <input id="w-no" className="input font-mono" value={draft.no} onChange={(e) => { setDraft({ ...draft, no: e.target.value }); setDirty(true); }} placeholder="01" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="w-slug">Address</label>
                <div className="flex items-center rounded-md border border-phantix-700 bg-phantix-950/60">
                  <span className="pl-3 font-mono text-xs text-slate-500">/posts/</span>
                  <input
                    id="w-slug"
                    className="input !border-0 !bg-transparent !pl-1 font-mono"
                    value={draft.slug}
                    onChange={(e) => { setSlugTouched(true); setDraft({ ...draft, slug: slugify(e.target.value) }); setDirty(true); }}
                  />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="w-date">Issue date</label>
                <input id="w-date" className="input" value={draft.date} onChange={(e) => { setDraft({ ...draft, date: e.target.value }); setDirty(true); }} placeholder="September 2026" />
              </div>
              <div>
                <label className="label" htmlFor="w-order">Order</label>
                <input id="w-order" type="number" min={0} className="input font-mono" value={draft.order} onChange={(e) => { setDraft({ ...draft, order: Number(e.target.value) }); setDirty(true); }} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="label" htmlFor="w-kicker">Kicker</label>
                <input id="w-kicker" className="input" value={draft.kicker ?? ""} onChange={(e) => { setDraft({ ...draft, kicker: e.target.value }); setDirty(true); }} placeholder="Lead essay" />
              </div>
              <div className="sm:col-span-3">
                <label className="label" htmlFor="w-excerpt">
                  Excerpt <span className="font-normal normal-case text-slate-500">({draft.excerpt.length}/600)</span>
                </label>
                <input id="w-excerpt" className="input" maxLength={600} value={draft.excerpt} onChange={(e) => { setDraft({ ...draft, excerpt: e.target.value }); setDirty(true); }} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" className="accent-gold-400" checked={draft.featured} onChange={(e) => { setDraft({ ...draft, featured: e.target.checked }); setDirty(true); }} />
              Lead essay. Shown on the cover of the issue, and it replaces the current lead.
            </label>

            {/* Body */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label !mb-0">Body (Markdown)</span>
                <div className="flex rounded-md border border-phantix-700 p-0.5" role="group" aria-label="Editor mode">
                  {(["Write", "Preview"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPreview(m === "Preview")}
                      aria-pressed={preview === (m === "Preview")}
                      className={cx("rounded px-3 py-1 text-xs", preview === (m === "Preview") ? "bg-phantix-800 text-slate-100" : "text-slate-400")}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {preview ? (
                <div className="max-h-[50vh] min-h-[280px] overflow-auto rounded-md border border-phantix-700 bg-phantix-950/60 p-4">
                  {draft.body.trim() ? <MarkdownView source={draft.body} /> : <p className="text-sm text-slate-500">Nothing to preview yet.</p>}
                </div>
              ) : (
                <textarea
                  className="input !min-h-[320px] font-mono text-[13px] leading-6"
                  value={draft.body}
                  onChange={(e) => { setDraft({ ...draft, body: e.target.value }); setDirty(true); }}
                  placeholder={"The first paragraph opens with the drop cap.\n\n## A subheading\n\nBody text with **bold**, *italic*, > quotes and lists."}
                />
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-[12px] text-slate-500">Markdown only. {draft.body.length.toLocaleString()} characters.</p>
                <span className="text-[12px] text-slate-600">Sections:</span>
                {sections.slice(1).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="chip border-phantix-700 text-[11px] text-slate-400 hover:border-gold-400/40 hover:text-gold-300"
                    onClick={() => setFigure({ open: true, section: s.id })}
                    title={`Upload a figure for “${s.title}”`}
                  >
                    <ImagePlus size={11} /> {s.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Workflow + save */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-phantix-700/40 pt-4">
              <button className="btn-ghost" disabled={Boolean(busy)} onClick={() => setDraft(null)}>Close</button>
              {(draft.status === "in_review" || draft.status === "approved") && (
                <button className="btn-secondary" disabled={Boolean(busy)} onClick={() => draft.id && void move({ id: draft.id, title: draft.title }, "reopen")}>
                  <Undo2 size={14} /> Reopen
                </button>
              )}
              <button className="btn-secondary" disabled={Boolean(busy)} onClick={() => void save()}>
                {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : null}
                {draft.status === "published" ? "Save changes" : "Save draft"}
              </button>
              {(draft.status ?? "draft") === "draft" || !draft.status ? (
                <button
                  className="btn-primary"
                  disabled={Boolean(busy) || !draft.id}
                  onClick={async () => { const saved = await save(); if (saved) await move({ id: saved.id, title: saved.title }, "submit"); }}
                >
                  {busy === "submit" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Save &amp; submit for review
                </button>
              ) : null}
              {draft.status === "in_review" && isAdmin && draft.id ? (
                <button className="btn-primary" disabled={Boolean(busy)} onClick={() => draft.id && void move({ id: draft.id, title: draft.title }, "approve")}>
                  {busy === "approve" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve
                </button>
              ) : null}
              {draft.status === "approved" && isAdmin && draft.id ? (
                <button className="btn-primary" disabled={Boolean(busy)} onClick={() => draft.id && void move({ id: draft.id, title: draft.title }, "publish")}>
                  {busy === "publish" ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Publish
                </button>
              ) : null}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Figure upload ── */}
      <FigureModal
        open={figure.open}
        postId={draft?.id}
        sections={sections}
        initialSection={figure.section}
        onClose={() => setFigure({ open: false, section: "" })}
        onUploaded={(asset) => {
          setAssets((cur) => [...cur, asset]);
          setFigure({ open: false, section: "" });
        }}
      />

      {/* ── Import ── */}
      <Modal open={importOpen} onClose={() => !importing && setImportOpen(false)} title="Import a Markdown post" wide>
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Frontmatter sets the fields (<code className="font-mono text-gold-300">title, no, order, date, kicker, excerpt, featured</code>). A file named{" "}
            <code className="font-mono text-gold-300">05-some-title.md</code> defaults to post 05 at <code className="font-mono">/posts/some-title</code>. Imports always land as a draft.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept=".md,.markdown,text/markdown" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
            <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
              <FileUp size={15} /> Choose a .md file
            </button>
            {importName && <span className="font-mono text-xs text-slate-400">{importName}</span>}
          </div>
          <textarea
            className="input !min-h-[260px] font-mono text-[13px]"
            aria-label="Markdown to import"
            placeholder={"---\ntitle: \"A New Essay\"\nno: \"05\"\ndate: \"October 2026\"\nexcerpt: \"One-line summary.\"\n---\n\nFirst paragraph…"}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" disabled={importing} onClick={() => setImportOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={importing || !importText.trim()} onClick={() => void runImport()}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Import as draft
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Issue settings ── */}
      <Modal open={Boolean(issue)} onClose={() => !issueBusy && setIssue(null)} title="Issue settings" wide>
        {issue && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">The masthead, cover copy and newsletter box every reader sees on the Weekly.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ISSUE_FIELDS.map((f) => (
                <div key={f.key} className={f.long ? "sm:col-span-2" : undefined}>
                  <label className="label" htmlFor={`issue-${f.key}`}>{f.label}</label>
                  {f.long ? (
                    <textarea id={`issue-${f.key}`} className="input !min-h-[64px]" value={issue[f.key]} onChange={(e) => setIssue({ ...issue, [f.key]: e.target.value })} />
                  ) : (
                    <input id={`issue-${f.key}`} className="input" value={issue[f.key]} onChange={(e) => setIssue({ ...issue, [f.key]: e.target.value })} />
                  )}
                  {f.hint && <p className="mt-1 text-[12px] text-slate-500">{f.hint}</p>}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" disabled={issueBusy} onClick={() => setIssue(null)}>Cancel</button>
              <button className="btn-primary" disabled={issueBusy} onClick={() => void saveIssue()}>
                {issueBusy ? <Loader2 size={14} className="animate-spin" /> : <Settings2 size={14} />} Save issue settings
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Delete ── */}
      <Modal open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} title="Delete this post?">
        {confirmDelete && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              “{confirmDelete.title}” will be removed{confirmDelete.status === "published" ? " from the public Weekly" : ""} and cannot be recovered.
              To take it offline but keep it, unpublish it instead.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Keep it</button>
              <button className="btn-danger" onClick={() => void remove()}>
                <Trash2 size={14} /> Delete post
              </button>
            </div>
          </div>
        )}
      </Modal>
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

  useEffect(() => { if (open) setSection(initialSection); }, [open, initialSection]);

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
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} Choose image
          </button>
        </div>
        <p className="flex items-center gap-1.5 text-[12px] text-slate-500">
          <X size={12} /> PNG, JPEG, WebP, GIF or SVG, up to 6 MB. Stored in your object storage.
        </p>
      </div>
    </Modal>
  );
}
