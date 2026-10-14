import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2, Eye, EyeOff, FileUp, FolderOpen, Loader2, Newspaper, Pencil, Plus,
  RefreshCw, Search, Send, Trash2,
} from "lucide-react";
import { Card, EmptyState, Modal, PageHeader, TableSkeleton, Tabs } from "@/components/ui";
import { api } from "@/lib/api";
import { BLOG_URL } from "@/lib/links";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { timeAgo } from "@/lib/utils";
import {
  type BlogIssue,
  type PostStatus,
  StatusChip,
  type WeeklyPost,
} from "@/pages/admin/weeklyShared";

/**
 * The Weekly — the editorial desk and per-issue post inventory.
 *
 * Posts are grouped under issues, so the desk opens on one issue at a time
 * (or on everything, or on the loose drafts not yet assigned). Writing happens
 * on its own full page (`/weekly/new`, `/weekly/:id`); this screen is the
 * inventory: what exists, where it is in the workflow, and who last touched it.
 */
export default function WeeklyAdmin() {
  const navigate = useNavigate();
  const { toast, isAdmin } = useStore();

  const posts = useResource<WeeklyPost[]>(async () => {
    const raw = await api.get<{ items: WeeklyPost[] }>("/admin/blog/posts");
    return raw?.items ?? [];
  }, []);

  const issues = useResource<BlogIssue[]>(async () => {
    const raw = await api.get<{ items: BlogIssue[] }>("/admin/blog/issues");
    return raw?.items ?? [];
  }, []);

  const [tab, setTab] = useState<"all" | PostStatus>("all");
  const [q, setQ] = useState("");
  const [searchParams] = useSearchParams();
  const [issueFilter, setIssueFilter] = useState<"all" | "none" | number>(() => {
    const raw = searchParams.get("issue");
    if (!raw) return "all";
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : "all";
  });

  const unassigned = useMemo(() => posts.data.filter((p) => !p.issue_id).length, [posts.data]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return posts.data.filter((p) => {
      const issueOk =
        issueFilter === "all" ||
        (issueFilter === "none" ? !p.issue_id : p.issue_id === issueFilter);
      const statusOk = tab === "all" || p.status === tab;
      const searchOk =
        !needle || `${p.title} ${p.slug} ${p.excerpt}`.toLowerCase().includes(needle);
      return issueOk && statusOk && searchOk;
    });
  }, [posts.data, tab, q, issueFilter]);

  const counts = useMemo(() => {
    const base = { all: rows.length, draft: 0, in_review: 0, approved: 0, published: 0 };
    for (const p of rows) base[p.status] = (base[p.status] ?? 0) + 1;
    return base;
  }, [rows]);

  const move = async (
    p: { id: number; title: string },
    action: "submit" | "approve" | "publish" | "unpublish" | "reopen",
  ) => {
    try {
      await api.post(`/admin/blog/posts/${p.id}/${action}`, {});
      toast("success", "Updated", `${p.title} · ${action}`);
      posts.refresh();
      issues.refresh();
    } catch (e) {
      toast("error", "Could not update", e instanceof Error ? e.message : "");
    }
  };

  // ── Import ──
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<WeeklyPost | null>(null);

  const runImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      // The import lands as a draft, then opens on its own editing page.
      const created = await api.post<WeeklyPost>("/admin/blog/posts/import", {
        markdown: importText,
        filename: importName,
        publish: false,
      });
      setImportOpen(false);
      setImportText("");
      setImportName("");
      toast("success", "Imported — opening the editor", created.title);
      navigate(`/weekly/${created.id}`);
    } catch (e) {
      toast("error", "Import failed", e instanceof Error ? e.message : "");
    } finally {
      setImporting(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/admin/blog/posts/${confirmDelete.id}`);
      toast("success", "Deleted", confirmDelete.title);
      setConfirmDelete(null);
      posts.refresh();
      issues.refresh();
    } catch (e) {
      toast("error", "Could not delete", e instanceof Error ? e.message : "");
    }
  };

  return (
    <div>
      <PageHeader
        title="The Weekly"
        description="The editorial desk. Posts are filed under an issue; several editors can work on one draft, and a conflicting save is caught. Posts go live only after an admin approves them."
        actions={
          <>
            <button
              onClick={() => { posts.refresh(); issues.refresh(); }}
              className="btn-ghost !px-3 !py-1.5"
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
            <a href={BLOG_URL} target="_blank" rel="noreferrer" className="btn-secondary">
              <Newspaper size={15} /> Open the Weekly
            </a>
            <button className="btn-secondary" onClick={() => navigate("/weekly/issues")}>
              <FolderOpen size={15} /> Issues
            </button>
            <button className="btn-secondary" onClick={() => setImportOpen(true)}>
              <FileUp size={15} /> Import .md
            </button>
            <button className="btn-primary" onClick={() => navigate("/weekly/new")}>
              <Plus size={15} /> New post
            </button>
          </>
        }
      />

      {/* Issue inventory */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Issue</span>
        <button
          className={issueChip(issueFilter === "all")}
          onClick={() => setIssueFilter("all")}
        >
          All posts <span className="text-slate-500">{posts.data.length}</span>
        </button>
        {issues.data.map((i) => (
          <button
            key={i.id}
            className={issueChip(issueFilter === i.id)}
            onClick={() => setIssueFilter(i.id)}
            title={i.name || undefined}
          >
            {i.number || i.name || i.slug}
            <span className="text-slate-500">{i.post_count}</span>
          </button>
        ))}
        <button className={issueChip(issueFilter === "none")} onClick={() => setIssueFilter("none")}>
          Unassigned <span className="text-slate-500">{unassigned}</span>
        </button>
      </div>

      <Tabs
        tabs={[
          { id: "all", label: "All", count: counts.all },
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
            <input
              className="input !pl-10"
              placeholder="Search title, slug or excerpt…"
              aria-label="Search posts"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        {posts.loading && !posts.data.length ? (
          <div className="p-4"><TableSkeleton rows={5} cols={6} /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Newspaper size={24} />}
            title={posts.data.length ? "No posts match" : "No posts yet"}
            body={
              posts.data.length
                ? "Try another issue, search or tab."
                : "Start the first issue: write a post, or import a Markdown file with frontmatter."
            }
            action={
              !posts.data.length ? (
                <button className="btn-primary" onClick={() => navigate("/weekly/new")}>
                  <Plus size={15} /> New post
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="border-b border-phantix-700/40">
                  <th className="th w-14">No.</th>
                  <th className="th">Post</th>
                  <th className="th">Issue</th>
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
                    <td className="td max-w-[320px]">
                      <button
                        className="flex items-center gap-1.5 text-left font-medium text-slate-100 hover:text-gold-200"
                        title={p.excerpt || undefined}
                        onClick={() => navigate(`/weekly/${p.id}`)}
                      >
                        <span className="truncate">{p.title}</span>
                        <span className="shrink-0 truncate font-mono text-[12px] font-normal text-slate-500">
                          /posts/{p.slug}
                        </span>
                      </button>
                    </td>
                    <td className="td text-xs text-slate-400">
                      {p.issue ? (
                        <span className="rounded border border-phantix-700/50 bg-phantix-900/50 px-1.5 py-0.5 font-mono text-[11px] text-gold-200">
                          {p.issue.number || p.issue.name}
                        </span>
                      ) : (
                        <span className="text-slate-600">Unassigned</span>
                      )}
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
                        <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => navigate(`/weekly/${p.id}`)}>
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
                        <button
                          className="btn-ghost !px-2 !py-1 !text-xs text-severity-critical"
                          onClick={() => setConfirmDelete(p)}
                          aria-label={`Delete ${p.title}`}
                          title="Delete"
                        >
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

      {/* ── Import ── */}
      <Modal open={importOpen} onClose={() => !importing && setImportOpen(false)} title="Import a Markdown post" wide>
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Frontmatter sets the fields (<code className="font-mono text-gold-300">title, no, order, date, kicker, excerpt, featured</code>). A file named{" "}
            <code className="font-mono text-gold-300">05-some-title.md</code> defaults to post 05 at <code className="font-mono">/posts/some-title</code>. The import lands as a draft and opens in the editor.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".md,.markdown,text/markdown"
              className="hidden"
              id="weekly-import-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
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
                e.target.value = "";
              }}
            />
            <button className="btn-secondary" onClick={() => document.getElementById("weekly-import-file")?.click()}>
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

function issueChip(active: boolean): string {
  return [
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
    active
      ? "border-gold-400/40 bg-gold-400/10 text-gold-200"
      : "border-phantix-700/60 text-slate-400 hover:border-gold-400/30 hover:text-gold-300",
  ].join(" ");
}
