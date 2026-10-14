import { cx } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────────
 * The SecureGraph Weekly — shared types and small helpers used by the list
 * page (`Weekly.tsx`) and the full-page editor (`WeeklyEditor.tsx`).
 * ──────────────────────────────────────────────────────────────────────────── */

export type PostStatus = "draft" | "in_review" | "approved" | "published";

export interface WeeklyPost {
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
  body_html?: string | null;
  status: PostStatus;
  revision: number;
  published_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
  contributors?: BlogContributor[];
  issue_id?: number | null;
  issue?: BlogIssueRef | null;
}

/** The compact issue embedded in a post. */
export interface BlogIssueRef {
  id: number;
  slug: string;
  number: string;
  name: string;
  date: string;
}

/** An issue in the staff inventory. */
export interface BlogIssue {
  id: number;
  slug: string;
  number: string;
  name: string;
  date: string;
  status: "open" | "published" | "archived";
  post_count: number;
  created_at: string | null;
  updated_at: string | null;
}

/** A byline: someone who wrote or rewrote the copy (approvers are not listed). */
export interface BlogContributor {
  name: string;
  initials: string;
  edits: number;
  first_at: string | null;
  last_at: string | null;
}

/** Another editor with this draft open right now. */
export interface EditorPresence {
  staff_id: number;
  name: string;
  initials: string;
  last_seen_at: string | null;
}

export interface BlogAsset {
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

export interface BlogRevision {
  revision: number;
  title: string;
  body: string;
  status: PostStatus;
  editor_name: string | null;
  note: string | null;
  created_at: string | null;
}

export interface BlogActivity {
  id: number;
  staff_name: string;
  action: string;
  detail: Record<string, unknown>;
  created_at: string | null;
}

export type Issue = Record<
  "name" | "number" | "date" | "folio" | "kicker" | "deck" | "byline" | "pullQuote" | "pullCite" | "newsletterLabel" | "newsletterBlurb" | "newsletterUrl",
  string
>;

export type Draft = Omit<
  WeeklyPost,
  "id" | "status" | "revision" | "published_at" | "reviewed_at" | "approved_at" | "updated_at" | "updated_by_name"
> & {
  id?: number;
  status?: PostStatus;
};

export const EMPTY: Draft = {
  slug: "", title: "", no: "", order: 0, date: "", kicker: "", excerpt: "", featured: false, body: "", body_html: "",
};

export const STATUS_META: Record<PostStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "border-phantix-600/50 bg-phantix-800/60 text-slate-300" },
  in_review: { label: "In review", className: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
  approved: { label: "Approved", className: "border-gold-400/30 bg-gold-400/10 text-gold-300" },
  published: { label: "Published", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
};

export const ISSUE_FIELDS: { key: keyof Issue; label: string; long?: boolean; hint?: string }[] = [
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

export const AUTOSAVE_MS = 15_000;

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    // Truncate before the final strip: slicing to the limit can otherwise leave
    // a trailing hyphen that the API's slug pattern rejects.
    .slice(0, 160)
    .replace(/^-+|-+$/g, "");

/** H2 headings, in order. The first entry (id "") is the intro, before any H2. */
export function sectionsOf(body: string): { id: string; title: string }[] {
  const out = [{ id: "", title: "Introduction" }];
  const re = /^##\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out.push({ id: slugify(m[1]), title: m[1] });
  return out;
}

/** Insert a figure at the end of a section (or at the top for the intro). */
export function insertFigure(body: string, sectionId: string, markdown: string): string {
  const block = `${markdown}\n`;
  if (!sectionId) return `${block}\n${body}`.replace(/\n{3,}/g, "\n\n");
  const lines = body.split("\n");
  const start = lines.findIndex(
    (l) => /^##\s+/.test(l) && slugify(l.replace(/^##\s+/, "")) === sectionId,
  );
  if (start === -1) return `${body.replace(/\s*$/, "")}\n\n${block}`;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  const before = lines.slice(0, end).join("\n").replace(/\s*$/, "");
  const after = lines.slice(end).join("\n");
  return `${before}\n\n${block}${after ? `\n${after}` : ""}`.replace(/\n{3,}/g, "\n\n");
}

export function StatusChip({ status }: { status: PostStatus }) {
  const meta = STATUS_META[status];
  return <span className={cx("chip", meta.className)}>{meta.label}</span>;
}
