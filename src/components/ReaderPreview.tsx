import React, { useMemo, useState } from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { markdownToHtml } from "@/lib/markdown";
import { cx } from "@/lib/utils";
import type { BlogContributor } from "@/pages/admin/weeklyShared";

type Device = "desktop" | "tablet" | "mobile";

const DEVICES: { id: Device; label: string; width: number | string; icon: React.ReactNode }[] = [
  { id: "desktop", label: "Desktop", width: "100%", icon: <Monitor size={14} /> },
  { id: "tablet", label: "Tablet", width: 768, icon: <Tablet size={14} /> },
  { id: "mobile", label: "Mobile", width: 390, icon: <Smartphone size={14} /> },
];

/**
 * What the reader sees, at the width they will read it.
 *
 * The preview is the same type system as the editor (`.weekly-prose`) on the
 * reader's light paper, so a writer can check line length, heading rhythm and
 * images on desktop, tablet and phone without leaving the desk.
 */
export default function ReaderPreview({
  title,
  kicker,
  excerpt,
  body,
  html,
  contributors,
  date,
}: {
  title: string;
  kicker?: string | null;
  excerpt?: string;
  body: string;
  /** Stored rendering (exact spacing); falls back to Markdown when absent. */
  html?: string;
  contributors?: BlogContributor[];
  date?: string;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const fromMarkdown = useMemo(() => markdownToHtml(body), [body]);
  const rendered = html && html.trim() ? html : fromMarkdown;
  const current = DEVICES.find((d) => d.id === device) ?? DEVICES[0];
  const names = (contributors ?? []).map((c) => c.name).filter(Boolean);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Reader preview</p>
        <div className="flex items-center gap-0.5 rounded-md border border-phantix-700 p-0.5" role="group" aria-label="Preview width">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDevice(d.id)}
              aria-pressed={device === d.id}
              className={cx(
                "flex items-center gap-1.5 rounded px-3 py-1 text-xs transition-colors",
                device === d.id ? "bg-phantix-800 text-slate-100" : "text-slate-400 hover:text-slate-200",
              )}
            >
              {d.icon}
              <span className="hidden sm:inline">{d.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center rounded-lg border border-phantix-700/60 bg-phantix-900/40 p-3 sm:p-6">
        <div
          className="weekly-paper w-full overflow-hidden rounded-md transition-[max-width] duration-300"
          style={{ maxWidth: current.width }}
        >
          <article className="px-6 py-8 sm:px-10 sm:py-12">
            {kicker ? <p className="weekly-kicker">{kicker}</p> : null}
            <h1 className="weekly-title">{title || "Untitled post"}</h1>
            {excerpt ? <p className="weekly-standfirst">{excerpt}</p> : null}
            <p className="weekly-byline">
              {names.length ? names.join(", ") : "SecureGraph editorial team"}
              {date ? ` · ${date}` : ""}
            </p>
            <div className="weekly-prose mt-8" dangerouslySetInnerHTML={{ __html: rendered }} />
          </article>
        </div>
      </div>
    </div>
  );
}
