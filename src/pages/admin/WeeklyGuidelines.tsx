import React, { useMemo, useState } from "react";
import { AlertTriangle, BookOpenCheck, CheckCircle2, ChevronDown, Circle } from "lucide-react";
import { Card } from "@/components/ui";
import type { Draft } from "@/pages/admin/weeklyShared";

/**
 * Writing guidelines for The SecureGraph Weekly, beside the editor.
 *
 * The Weekly is written to be found: by search engines, and by AI assistants
 * that quote it when someone asks about security in Nigeria and Africa. The
 * checks measure what the draft itself shows; the rules below them cover what
 * no check can see (sources, honesty, what happens after publishing). Checks
 * advise and never block a save or a publish.
 */

/** The blog shows a post's title as "<title> · The SecureGraph Weekly". */
const TITLE_SUFFIX = " · The SecureGraph Weekly";
/** Google shows about this many characters of a title. */
const TITLE_LIMIT = 60;
const STANDFIRST_MIN = 70;
const STANDFIRST_MAX = 160;
const OPENING_WORDS = 150;

type State = "ok" | "warn" | "todo";
interface Check {
  id: string;
  label: string;
  state: State;
  detail: string;
}

const LINK = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)|(?:^|\s)(https?:\/\/\S+)/g;

function linksIn(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(LINK)) out.push(m[1] || m[2]);
  return out;
}

/** The first paragraph of prose: not a heading, image, quote, list or rule. */
function openingParagraph(body: string): string {
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.find((b) => !/^(#|!\[|>|[-*+]\s|\d+\.\s|---|```|<)/.test(b)) ?? "";
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

function checksFor(d: Draft): Check[] {
  const title = d.title.trim();
  const shown = title.length + TITLE_SUFFIX.length;
  const standfirst = d.excerpt.trim();
  const body = d.body ?? "";
  const links = linksIn(body);
  const productLinks = links.filter((u) => /(^|\/\/)([a-z-]+\.)?phantixlabs\.com/i.test(u));
  const sourceLinks = links.filter((u) => !/phantixlabs\.com/i.test(u));
  const opening = openingParagraph(body);
  const slug = d.slug.trim();

  const checks: Check[] = [
    {
      id: "title",
      label: "Title fits a search result",
      state: !title ? "todo" : shown <= TITLE_LIMIT ? "ok" : "warn",
      detail: !title
        ? `Google shows about ${TITLE_LIMIT} characters, and the blog adds "${TITLE_SUFFIX.trim()}" after the title.`
        : shown <= TITLE_LIMIT
          ? `${title.length} characters, so it shows in full.`
          : `${title.length} characters. With the Weekly's name added it runs to ${shown}, and Google cuts it near ${TITLE_LIMIT}. Aim for ${TITLE_LIMIT - TITLE_SUFFIX.length} or fewer.`,
    },
    {
      id: "standfirst",
      label: `Standfirst is ${STANDFIRST_MIN} to ${STANDFIRST_MAX} characters`,
      state: !standfirst ? "todo" : standfirst.length >= STANDFIRST_MIN && standfirst.length <= STANDFIRST_MAX ? "ok" : "warn",
      detail: !standfirst
        ? "The standfirst is the description search results and AI assistants show. Write one sentence that answers what the post is about."
        : standfirst.length < STANDFIRST_MIN
          ? `${standfirst.length} characters: too short to describe the post in a search result.`
          : standfirst.length > STANDFIRST_MAX
            ? `${standfirst.length} characters: search results cut it near ${STANDFIRST_MAX}.`
            : `${standfirst.length} characters.`,
    },
    {
      id: "opening",
      label: `Opening paragraph answers the question in ${OPENING_WORDS} words or fewer`,
      state: !opening ? "todo" : words(opening) <= OPENING_WORDS ? "ok" : "warn",
      detail: !opening
        ? "AI assistants quote the start of a page far more than the end. Put the answer first."
        : words(opening) <= OPENING_WORDS
          ? `${words(opening)} words. Check that it states the answer, not just the topic.`
          : `${words(opening)} words. Move the answer into the first ${OPENING_WORDS} words and the background after it.`,
    },
    {
      id: "product",
      label: "Links one SecureGraph page that proves the point",
      state: !body.trim() ? "todo" : productLinks.length ? "ok" : "warn",
      detail: productLinks.length
        ? `Links to ${productLinks[0].replace(/^https?:\/\//, "")}.`
        : "Link the product page the post supports, such as phantixlabs.com/platform/apis, with link text that says what it is.",
    },
    {
      id: "sources",
      label: "Cites outside sources",
      state: !body.trim() ? "todo" : sourceLinks.length ? "ok" : "warn",
      detail: sourceLinks.length
        ? `${sourceLinks.length} outside link${sourceLinks.length === 1 ? "" : "s"}. Every number, regulation and price claim needs one.`
        : "No outside links yet. Every number, regulation and price claim needs a link to where it comes from.",
    },
    {
      id: "address",
      label: "Address is final",
      state: !slug ? "todo" : /-(draft|copy|edited|final|v\d+|new|test)$/i.test(slug) ? "warn" : "ok",
      detail: !slug
        ? "Set the address before you publish. It can't change afterwards without breaking links."
        : /-(draft|copy|edited|final|v\d+|new|test)$/i.test(slug)
          ? `/posts/${slug} ends in a working label. Remove it before you publish.`
          : `/posts/${slug}`,
    },
  ];

  if (/\bNDPR\b/.test(body) && !/\bNDPA\b/.test(body)) {
    checks.push({
      id: "regulation",
      label: "Uses the current regulation name",
      state: "warn",
      detail: "NDPR has been replaced by the Nigeria Data Protection Act 2023 (NDPA) and NDPC's GAID 2025. Lead with those and mention NDPR once.",
    });
  }
  return checks;
}

/** The rules no check can measure. Plain statements, in the order a writer meets them. */
const RULES: { title: string; body: string }[] = [
  {
    title: "Answer first",
    body: "Each post answers one question a reader would type into Google or ask an AI assistant. State the answer in the opening paragraph, then explain.",
  },
  {
    title: "Source every claim, invent nothing",
    body: "Link the source for every statistic, regulation, price and quote. A worked example states its assumptions. Never make up a number, a quote or a customer.",
  },
  {
    title: "Write under your own account",
    body: "The byline credits whoever writes or rewrites the copy, and search engines read it as the named author. Draft and edit the post yourself. An admin who only publishes is not credited.",
  },
  {
    title: "Use the product's own words",
    body: "Say what SecureGraph does as the site says it: vulnerability assessment and penetration testing (VAPT), continuous testing, verified findings, your security data in a database you control. Don't use terms the product doesn't, such as \"EASM\".",
  },
  {
    title: "Name competitors only with a link",
    body: "Mention another company only for a fact you link to. No claims about their pricing or quality you can't show.",
  },
  {
    title: "Use current regulation names",
    body: "Write the Nigeria Data Protection Act 2023 (NDPA) and NDPC's GAID 2025. Mention NDPR once, for readers who still search for it. Link the official text.",
  },
  {
    title: "Never change a published address",
    body: "Search engines and other sites link to /posts/<address>. If it must change, ask engineering to add a redirect from the old one.",
  },
  {
    title: "Ask for a blog rebuild after publishing",
    body: "The sitemap and the page search engines read are built when the blog deploys. After you publish, ask engineering to redeploy the blog. Until then the post shows to readers but not to search engines.",
  },
];

const OPEN_KEY = "weekly-guidelines-open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

const ICON: Record<State, React.ReactNode> = {
  ok: <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-label="Passes" />,
  warn: <AlertTriangle size={15} className="mt-0.5 shrink-0 text-gold-400" aria-label="Needs attention" />,
  todo: <Circle size={15} className="mt-0.5 shrink-0 text-slate-500" aria-label="Not started" />,
};

export default function WeeklyGuidelines({ draft }: { draft: Draft }) {
  const [open, setOpen] = useState(readOpen);
  const checks = useMemo(() => checksFor(draft), [draft]);
  const passing = checks.filter((c) => c.state === "ok").length;

  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(OPEN_KEY, v ? "0" : "1");
      } catch {
        /* the panel still works; it just won't remember */
      }
      return !v;
    });
  };

  return (
    <Card className="space-y-3">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
        aria-controls="weekly-guidelines"
        onClick={toggle}
      >
        <BookOpenCheck size={15} className="text-gold-400" />
        <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Writing guidelines</span>
        <span className="text-xs text-slate-400">{passing} of {checks.length} checks pass</span>
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div id="weekly-guidelines" className="space-y-4">
          <p className="text-[13px] leading-5 text-slate-400">
            The Weekly is written to be found by search engines and quoted by AI assistants. These checks advise; they never stop you saving or publishing.
          </p>

          <ul className="space-y-2.5">
            {checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                {ICON[c.state]}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-slate-200">{c.label}</p>
                  <p className="text-[12px] leading-5 text-slate-500">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-2.5 border-t border-phantix-700/40 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Rules for every post</p>
            {RULES.map((r) => (
              <div key={r.title}>
                <p className="text-[13px] font-medium text-slate-200">{r.title}</p>
                <p className="text-[12px] leading-5 text-slate-400">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
