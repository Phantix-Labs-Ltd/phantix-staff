import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Strikethrough,
} from "lucide-react";
import { cx } from "@/lib/utils";

/**
 * The Weekly writing surface — basic editing, modelled on Substack's playbook.
 *
 * Substack keeps the toolbar deliberately small: emphasis, a couple of heading
 * levels, quote, lists, a link, an image and a divider. Everything else is the
 * writer's own prose. We store Markdown, so the toolbar is a thin, dependable
 * layer over a plain textarea: every button is selection-aware, every action
 * restores the caret, and the same commands are on the usual shortcuts.
 *
 * Images are first-class: the picker, drag-and-drop and paste all funnel
 * through ``onUploadImage`` and drop the returned Markdown at the caret.
 */

export type ImageUpload = (file: File) => Promise<{ url: string; alt?: string }>;

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Uploads an image and resolves its public URL. Omit to hide the button. */
  onUploadImage?: ImageUpload;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: number;
  ariaLabel?: string;
}

const IMAGE_RE = /^image\//;

function ToolButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the textarea selection when the button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx(
        "flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors",
        "hover:bg-phantix-800 hover:text-slate-100 disabled:opacity-40 disabled:hover:bg-transparent",
        active && "bg-phantix-800 text-gold-300",
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px shrink-0 bg-phantix-700/60" aria-hidden />;

export default function MarkdownEditor({
  value,
  onChange,
  onUploadImage,
  placeholder,
  disabled,
  minHeight = 360,
  ariaLabel = "Post body",
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const savedRange = useRef<[number, number] | null>(null);

  const commit = useCallback(
    (next: string, selStart?: number, selEnd?: number) => {
      onChange(next);
      // The textarea is controlled, so restore the caret after the re-render.
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        if (selStart != null && selEnd != null) el.setSelectionRange(selStart, selEnd);
      });
    },
    [onChange],
  );

  const selection = () => {
    const el = ref.current;
    return el
      ? { s: el.selectionStart, e: el.selectionEnd, v: el.value }
      : { s: 0, e: 0, v: value };
  };

  /** Wrap or unwrap the current selection (bold, italic, code…). */
  const wrap = useCallback(
    (pre: string, post = pre, placeholder = "text") => {
      const { s, e, v } = selection();
      const chosen = v.slice(s, e);
      // Pressing the button again on wrapped text unwraps it.
      const before = v.slice(Math.max(0, s - pre.length), s);
      const after = v.slice(e, e + post.length);
      if (!chosen && before === pre && after === post) {
        const next = v.slice(0, s - pre.length) + v.slice(e + post.length);
        commit(next, s - pre.length, s - pre.length);
        return;
      }
      const body = chosen || placeholder;
      const next = v.slice(0, s) + pre + body + post + v.slice(e);
      commit(next, s + pre.length, s + pre.length + body.length);
    },
    [commit, value],
  );

  /** Add, replace or remove a line-leading marker across the selection. */
  const linePrefix = useCallback(
    (make: (i: number) => string, matches: RegExp, toggleOff = true) => {
      const { s, e, v } = selection();
      const lineStart = v.lastIndexOf("\n", s - 1) + 1;
      let lineEnd = v.indexOf("\n", e);
      if (lineEnd === -1) lineEnd = v.length;
      const lines = v.slice(lineStart, lineEnd).split("\n");
      const allMarked = lines.every((l) => matches.test(l));
      const updated = lines
        .map((line, i) =>
          allMarked && toggleOff ? line.replace(matches, "") : make(i) + line.replace(matches, ""),
        )
        .join("\n");
      const next = v.slice(0, lineStart) + updated + v.slice(lineEnd);
      commit(next, lineStart, lineStart + updated.length);
    },
    [commit, value],
  );

  const setHeading = useCallback(
    (level: 2 | 3) => {
      const marker = `${"#".repeat(level)} `;
      linePrefix(
        () => marker,
        new RegExp(`^#{${level}}\\s+`),
        false,
      );
    },
    [linePrefix],
  );

  /** Insert a block on its own lines at the caret. */
  const insertBlock = useCallback(
    (text: string) => {
      const { s, v } = selection();
      const before = v.slice(0, s);
      const after = v.slice(s);
      const lead = before && !before.endsWith("\n") ? "\n\n" : "";
      const tail = after && !after.startsWith("\n") ? "\n\n" : "";
      const snippet = `${lead}${text}${tail}`;
      commit(v.slice(0, s) + snippet + v.slice(s), s + snippet.length, s + snippet.length);
    },
    [commit, value],
  );

  const insertImage = useCallback(
    async (file: File) => {
      if (!onUploadImage || disabled) return;
      setUploading(true);
      try {
        const { url, alt } = await onUploadImage(file);
        insertBlock(`![${alt || file.name.replace(/\.[^.]+$/, "")}](${url})`);
      } catch {
        /* the host surfaces the failure (toast); keep the draft untouched */
      } finally {
        setUploading(false);
      }
    },
    [disabled, insertBlock, onUploadImage],
  );

  const openLink = () => {
    savedRange.current = [selection().s, selection().e];
    setLinkUrl("");
    setLinkOpen(true);
  };

  const applyLink = () => {
    const el = ref.current;
    const [s, e] = savedRange.current ?? [
      el?.selectionStart ?? 0,
      el?.selectionEnd ?? 0,
    ];
    const v = el?.value ?? value;
    const label = v.slice(s, e) || "link text";
    const href = linkUrl.trim() || "https://";
    const markdown = `[${label}](${href})`;
    setLinkOpen(false);
    commit(v.slice(0, s) + markdown + v.slice(e), s + 1, s + 1 + label.length);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      wrap("**");
    } else if (key === "i") {
      e.preventDefault();
      wrap("*");
    } else if (key === "k") {
      e.preventDefault();
      openLink();
    } else if (key === "`" || key === "e") {
      e.preventDefault();
      wrap("`");
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    void insertImage(file);
  };

  const stats = useMemo(() => {
    const text = value
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!?\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/[#>*_`~|[\]()-]/g, " ");
    const words = text.split(/\s+/).filter(Boolean).length;
    return { words, minutes: Math.max(1, Math.round(words / 220)) };
  }, [value]);

  return (
    <div className="overflow-hidden rounded-lg border border-phantix-700/60 bg-phantix-950/60 focus-within:border-gold-400/40">
      {/* Toolbar */}
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex flex-wrap items-center gap-0.5 border-b border-phantix-700/50 bg-phantix-900/60 px-1.5 py-1"
      >
        <ToolButton label="Bold (Ctrl/Cmd+B)" onClick={() => wrap("**")} disabled={disabled}>
          <Bold size={15} />
        </ToolButton>
        <ToolButton label="Italic (Ctrl/Cmd+I)" onClick={() => wrap("*")} disabled={disabled}>
          <Italic size={15} />
        </ToolButton>
        <ToolButton label="Strikethrough" onClick={() => wrap("~~")} disabled={disabled}>
          <Strikethrough size={15} />
        </ToolButton>
        <Divider />
        <ToolButton label="Heading" onClick={() => setHeading(2)} disabled={disabled}>
          <Heading2 size={15} />
        </ToolButton>
        <ToolButton label="Subheading" onClick={() => setHeading(3)} disabled={disabled}>
          <Heading3 size={15} />
        </ToolButton>
        <ToolButton
          label="Block quote"
          onClick={() => linePrefix(() => "> ", /^>\s*/)}
          disabled={disabled}
        >
          <Quote size={15} />
        </ToolButton>
        <Divider />
        <ToolButton
          label="Bulleted list"
          onClick={() => linePrefix(() => "- ", /^[-*+]\s+/)}
          disabled={disabled}
        >
          <List size={15} />
        </ToolButton>
        <ToolButton
          label="Numbered list"
          onClick={() => linePrefix((i) => `${i + 1}. `, /^\d+[.)]\s+/)}
          disabled={disabled}
        >
          <ListOrdered size={15} />
        </ToolButton>
        <ToolButton label="Inline code" onClick={() => wrap("`")} disabled={disabled}>
          <Code size={15} />
        </ToolButton>
        <ToolButton
          label="Divider"
          onClick={() => insertBlock("---")}
          disabled={disabled}
        >
          <Minus size={15} />
        </ToolButton>
        <Divider />
        <ToolButton label="Link (Ctrl/Cmd+K)" onClick={openLink} disabled={disabled}>
          <Link2 size={15} />
        </ToolButton>
        {onUploadImage ? (
          <ToolButton
            label={uploading ? "Uploading…" : "Add image"}
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
          </ToolButton>
        ) : null}

        <span className="ml-auto pr-1.5 text-[11px] tabular-nums text-slate-500">
          {stats.words.toLocaleString()} words · {stats.minutes} min read
        </span>
      </div>

      {/* Link popover */}
      {linkOpen ? (
        <div className="flex items-center gap-2 border-b border-phantix-700/40 bg-phantix-900/40 px-3 py-2">
          <Link2 size={14} className="shrink-0 text-slate-500" />
          <input
            autoFocus
            className="input !py-1 !text-xs"
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                setLinkOpen(false);
              }
            }}
          />
          <button type="button" className="btn-primary !py-1 !text-xs" onClick={applyLink}>
            Add link
          </button>
          <button
            type="button"
            className="btn-ghost !py-1 !text-xs"
            onClick={() => setLinkOpen(false)}
          >
            Cancel
          </button>
        </div>
      ) : null}

      <textarea
        ref={ref}
        className="block w-full resize-y border-0 bg-transparent px-5 py-4 font-sans text-[15px] leading-7 text-slate-200 outline-none placeholder:text-slate-600"
        style={{ minHeight }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDrop={(e) => {
          const file = Array.from(e.dataTransfer.files).find((f) => IMAGE_RE.test(f.type));
          if (!file) return;
          e.preventDefault();
          void insertImage(file);
        }}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.items).some((i) => i.type.startsWith("image/"))) {
            e.preventDefault();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void insertImage(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
