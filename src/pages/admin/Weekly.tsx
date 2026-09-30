import React, { useMemo, useRef, useState } from "react";
import {
  CheckCircle2, Eye, EyeOff, FileUp, Loader2, Newspaper, Pencil, Plus, RefreshCw, Search, Settings2, Star, Trash2,
} from "lucide-react";
import { Card, EmptyState, Modal, PageHeader, StatusBadge, TableSkeleton, Tabs } from "@/components/ui";
import MarkdownView from "@/components/MarkdownView";
import { api } from "@/lib/api";
import { BLOG_URL } from "@/lib/links";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { cx, timeAgo } from "@/lib/utils";

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
  status: "draft" | "published";
  published_at: string | null;
  updated_at: string | null;
}

type Issue = Record<
  "name" | "number" | "date" | "folio" | "kicker" | "deck" | "byline" | "pullQuote" | "pullCite" | "newsletterLabel" | "newsletterBlurb" | "newsletterUrl",
  string
>;

type Draft = Omit<WeeklyPost, "id" | "status" | "published_at" | "updated_at"> & { id?: number; status?: WeeklyPost["status"] };

const EMPTY: Draft = { slug: "", title: "", no: "", order: 0, date: "", kicker: "", excerpt: "", featured: false, body: "" };

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 160);

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

/**
 * The SecureGraph Weekly — the only place posts are written and published.
 * The public blog reads published posts; drafts never leave this portal.
 */
export default function WeeklyAdmin() {
  const { toast } = useStore();
  const posts = useResource<WeeklyPost[]>(async () => {
    const raw = await api.get<{ items: WeeklyPost[] }>("/admin/blog/posts");
    return raw?.items ?? [];
  }, []);

  const [tab, setTab] = useState<"all" | "published" | "draft">("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return posts.data.filter(
      (p) => (tab === "all" || p.status === tab) && (!needle || `${p.title} ${p.slug} ${p.excerpt}`.toLowerCase().includes(needle)),
    );
  }, [posts.data, tab, q]);
  const counts = useMemo(
    () => ({
      all: posts.data.length,
      published: posts.data.filter((p) => p.status === "published").length,
      draft: posts.data.filter((p) => p.status === "draft").length,
    }),
    [posts.data],
  );

  // ── Editor ──
  const [draft, setDraft] = useState<Draft | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "publish">("");

  const openNew = () => {
    const next = Math.max(0, ...posts.data.map((p) => p.order)) + 1;
    setDraft({ ...EMPTY, order: next, no: String(next).padStart(2, "0") });
    setSlugTouched(false);
    setPreview(false);
  };
  const openEdit = (p: WeeklyPost) => {
    setDraft({ ...p, kicker: p.kicker ?? "" });
    setSlugTouched(true);
    setPreview(false);
  };

  const save = async (publish: boolean) => {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast("error", "Add a title", "Every post needs a title.");
      return;
    }
    setBusy(publish ? "publish" : "save");
    const body = {
      title: draft.title.trim(),
      slug: (draft.slug || slugify(draft.title)).trim(),
      no: draft.no.trim() || undefined,
      order: Number(draft.order) || 0,
      date: draft.date.trim(),
      kicker: (draft.kicker ?? "").trim(),
      excerpt: draft.excerpt.trim(),
      featured: draft.featured,
      body: draft.body,
      status: publish ? "published" : draft.status ?? "draft",
    };
    try {
      if (draft.id) await api.patch(`/admin/blog/posts/${draft.id}`, body);
      else await api.post("/admin/blog/posts", body);
      toast("success", publish ? "Published" : "Saved", publish ? `“${body.title}” is live on the Weekly.` : `“${body.title}” saved.`);
      setDraft(null);
      posts.refresh();
    } catch (e) {
      toast("error", "Could not save", e instanceof Error ? e.message : "");
    } finally {
      setBusy("");
    }
  };

  const setStatus = async (p: WeeklyPost, publish: boolean) => {
    try {
      await api.post(`/admin/blog/posts/${p.id}/${publish ? "publish" : "unpublish"}`, {});
      toast("success", publish ? "Published" : "Moved to drafts", p.title);
      posts.refresh();
    } catch (e) {
      toast("error", "Could not update", e instanceof Error ? e.message : "");
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

  // ── Import ──
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [importPublish, setImportPublish] = useState(false);
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
      await api.post("/admin/blog/posts/import", { markdown: importText, filename: importName, publish: importPublish });
      toast("success", importPublish ? "Imported and published" : "Imported as a draft", importName || "Markdown post");
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

  return (
    <div>
      <PageHeader
        title="The SecureGraph Weekly"
        description="Write, edit and publish the Weekly. Posts are created only here. The public site shows what you publish, and drafts stay private."
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
          { id: "published", label: "Published", count: counts.published },
          { id: "draft", label: "Drafts", count: counts.draft },
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
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-phantix-700/40">
                  <th className="th w-14">No.</th>
                  <th className="th">Post</th>
                  <th className="th">Status</th>
                  <th className="th">Issue date</th>
                  <th className="th">Updated</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-phantix-700/20 hover:bg-phantix-900/30">
                    <td className="td font-mono text-xs text-gold-300">{p.no}</td>
                    <td className="td max-w-[420px]">
                      <p className="flex items-center gap-1.5 font-medium text-slate-100" title={p.excerpt || undefined}>
                        {p.featured && <Star size={13} className="shrink-0 fill-gold-400 text-gold-400" aria-label="Lead essay" />}
                        <span className="truncate">{p.title}</span>
                        <span className="shrink-0 truncate font-mono text-[12px] font-normal text-slate-500">/posts/{p.slug}</span>
                      </p>
                    </td>
                    <td className="td"><StatusBadge status={p.status === "published" ? "published" : "draft"} /></td>
                    <td className="td text-xs text-slate-400">{p.date || "Not set"}</td>
                    <td className="td text-xs text-slate-500">{p.updated_at ? timeAgo(p.updated_at) : "Not set"}</td>
                    <td className="td text-right">
                      <div className="inline-flex items-center gap-1">
                        <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => openEdit(p)}>
                          <Pencil size={13} /> Edit
                        </button>
                        {p.status === "published" ? (
                          <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => void setStatus(p, false)} title="Take it off the public site">
                            <EyeOff size={13} /> Unpublish
                          </button>
                        ) : (
                          <button className="btn-ghost !px-2 !py-1 !text-xs text-emerald-300" onClick={() => void setStatus(p, true)}>
                            <Eye size={13} /> Publish
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

      {/* Editor */}
      <Modal open={Boolean(draft)} onClose={() => !busy && setDraft(null)} title={draft?.id ? "Edit post" : "New post"} wide>
        {draft && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="sm:col-span-3">
                <label className="label" htmlFor="w-title">Title</label>
                <input
                  id="w-title"
                  className="input"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value, slug: slugTouched ? draft.slug : slugify(e.target.value) })}
                  placeholder="Proof Before Panic"
                />
              </div>
              <div>
                <label className="label" htmlFor="w-no">No.</label>
                <input id="w-no" className="input font-mono" value={draft.no} onChange={(e) => setDraft({ ...draft, no: e.target.value })} placeholder="01" />
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
                    onChange={(e) => { setSlugTouched(true); setDraft({ ...draft, slug: slugify(e.target.value) }); }}
                  />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="w-date">Issue date</label>
                <input id="w-date" className="input" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} placeholder="September 2026" />
              </div>
              <div>
                <label className="label" htmlFor="w-order">Order</label>
                <input id="w-order" type="number" min={0} className="input font-mono" value={draft.order} onChange={(e) => setDraft({ ...draft, order: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="label" htmlFor="w-kicker">Kicker</label>
                <input id="w-kicker" className="input" value={draft.kicker ?? ""} onChange={(e) => setDraft({ ...draft, kicker: e.target.value })} placeholder="Lead essay" />
              </div>
              <div className="sm:col-span-3">
                <label className="label" htmlFor="w-excerpt">
                  Excerpt <span className="font-normal normal-case text-slate-500">({draft.excerpt.length}/600). Shown in the contents.</span>
                </label>
                <input id="w-excerpt" className="input" maxLength={600} value={draft.excerpt} onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" className="accent-gold-400" checked={draft.featured} onChange={(e) => setDraft({ ...draft, featured: e.target.checked })} />
              Lead essay. Shown on the cover of the issue, and it replaces the current lead.
            </label>

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
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  placeholder={"The first paragraph opens with the drop cap.\n\n## A subheading\n\nBody text with **bold**, *italic*, > quotes and lists."}
                />
              )}
              <p className="mt-1 text-[12px] text-slate-500">
                Markdown only. The public site does not render raw HTML. {draft.body.length.toLocaleString()} characters.
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn-ghost" disabled={Boolean(busy)} onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn-secondary" disabled={Boolean(busy)} onClick={() => void save(false)}>
                {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : null}
                {draft.status === "published" ? "Save changes" : "Save draft"}
              </button>
              {draft.status !== "published" && (
                <button className="btn-primary" disabled={Boolean(busy)} onClick={() => void save(true)}>
                  {busy === "publish" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Save &amp; publish
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Import */}
      <Modal open={importOpen} onClose={() => !importing && setImportOpen(false)} title="Import a Markdown post" wide>
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Frontmatter sets the fields (<code className="font-mono text-gold-300">title, no, order, date, kicker, excerpt, featured</code>). A file named{" "}
            <code className="font-mono text-gold-300">05-some-title.md</code> defaults to post 05 at <code className="font-mono">/posts/some-title</code>.
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
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" className="accent-gold-400" checked={importPublish} onChange={(e) => setImportPublish(e.target.checked)} />
            Publish immediately (otherwise it lands as a draft)
          </label>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" disabled={importing} onClick={() => setImportOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={importing || !importText.trim()} onClick={() => void runImport()}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Import
            </button>
          </div>
        </div>
      </Modal>

      {/* Issue settings */}
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

      {/* Delete */}
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
