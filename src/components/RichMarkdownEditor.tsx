import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Bold, Code, Heading2, Heading3, ImagePlus, IndentDecrease, IndentIncrease, Italic,
  Link2, List, ListOrdered, Loader2, Maximize2, Minimize2, Minus, Pilcrow, Quote, Redo2,
  Strikethrough, Table2, Trash2, Undo2,
} from "lucide-react";
import { cx } from "@/lib/utils";
import { htmlToMarkdown, markdownToHtml, readingStats } from "@/lib/markdown";

/**
 * The Weekly writing surface — a Substack-style editor.
 *
 * Writers edit the piece as a reader will see it: the contentEditable is
 * painted from the stored Markdown and serialised back on every change, so the
 * syntax never shows. Markdown is only literal at import.
 *
 * Every toolbar control is a toggle, like a normal editor: press Bold on bold
 * text and it comes off, press Heading on a heading and it returns to body.
 * The buttons light up for the format under the caret so the state is visible.
 */

export type ImageUpload = (file: File) => Promise<{ url: string; alt?: string }>;

interface Props {
  value: string;
  onChange: (value: string) => void;
  onUploadImage?: ImageUpload;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: number;
  /** Fill the parent's height and scroll the body internally, pinning the toolbar. */
  fill?: boolean;
  ariaLabel?: string;
}

const IMAGE_RE = /^image\//;
const BLOCK_TAGS = /^(p|h[1-6]|blockquote|li|div)$/;

interface ActiveState {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  link: boolean;
  ul: boolean;
  ol: boolean;
  table: boolean;
  block: string;
}

const EMPTY_ACTIVE: ActiveState = {
  bold: false, italic: false, strike: false, code: false, link: false,
  ul: false, ol: false, table: false, block: "p",
};

function elementOf(node: Node | null): HTMLElement | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
}

/** Nearest ancestor with `tag`, bounded by the editor root. */
function closestTag(node: Node | null, tag: string, root: HTMLElement): HTMLElement | null {
  let el = elementOf(node);
  while (el && el !== root) {
    if (el.tagName.toLowerCase() === tag) return el;
    el = el.parentElement;
  }
  return null;
}

/** The block element (paragraph/heading/quote/list item) holding the caret. */
function closestBlock(node: Node | null, root: HTMLElement): HTMLElement | null {
  let el = elementOf(node);
  while (el && el !== root) {
    if (BLOCK_TAGS.test(el.tagName.toLowerCase())) return el;
    el = el.parentElement;
  }
  return null;
}

function commandState(command: string): boolean {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

const isImg = (n: Node | null): n is HTMLImageElement =>
  !!n && n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === "IMG";

/** The image immediately before/after a collapsed caret, if there is one. */
function imageAdjacent(range: Range, side: "before" | "after"): HTMLImageElement | null {
  const container = range.startContainer;
  if (container.nodeType === Node.TEXT_NODE) {
    const text = container as Text;
    if (side === "before") {
      if (range.startOffset > 0) return null;
      let prev = text.previousSibling;
      while (prev && prev.nodeType === Node.TEXT_NODE && !(prev.textContent ?? "").length) {
        prev = prev.previousSibling;
      }
      return isImg(prev) ? prev : null;
    }
    if (range.startOffset < (text.textContent ?? "").length) return null;
    let next = text.nextSibling;
    while (next && next.nodeType === Node.TEXT_NODE && !(next.textContent ?? "").length) {
      next = next.nextSibling;
    }
    return isImg(next) ? next : null;
  }
  if (container.nodeType === Node.ELEMENT_NODE) {
    const parent = container as HTMLElement;
    const node = parent.childNodes[side === "before" ? range.startOffset - 1 : range.startOffset];
    return isImg(node) ? node : null;
  }
  return null;
}

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
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx(
        "flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-40",
        active
          ? "bg-gold-400/15 text-gold-300"
          : "text-slate-400 hover:bg-phantix-800 hover:text-slate-100",
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1.5 h-5 w-px shrink-0 bg-phantix-700/60" aria-hidden />;

const BLOCK_OPTIONS = [
  { value: "p", label: "Paragraph" },
  { value: "h2", label: "Heading" },
  { value: "h3", label: "Subheading" },
  { value: "blockquote", label: "Quote" },
];

export default function RichMarkdownEditor({
  value,
  onChange,
  onUploadImage,
  placeholder,
  disabled,
  minHeight = 440,
  fill = false,
  ariaLabel = "Post body",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [empty, setEmpty] = useState(!value.trim());
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [active, setActive] = useState<ActiveState>(EMPTY_ACTIVE);
  const [fullscreen, setFullscreen] = useState(false);
  const [imageSelected, setImageSelected] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [tableSize, setTableSize] = useState({ rows: 3, cols: 3 });
  const isFill = fill || fullscreen;

  // Full screen: lock the page behind the overlay and leave on Escape.
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  // Paint the editor from the stored Markdown when the value changes for a
  // reason other than typing (opening a post, an import, a conflict reload).
  // Layout effect so the first paint happens before the browser shows a frame.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === lastEmitted.current) return;
    el.innerHTML = markdownToHtml(value);
    lastEmitted.current = value;
    setEmpty(!value.trim());
    setImageSelected(false);
  }, [value]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const md = htmlToMarkdown(el.innerHTML);
    lastEmitted.current = md;
    setEmpty(!el.textContent?.trim() && !el.querySelector("img"));
    onChange(md);
  }, [onChange]);

  // A figure whose file is gone must not linger as a broken image the writer
  // cannot remove: drop it and update the stored body. `error` does not bubble,
  // so listen in the capture phase on the editor root.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onError = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "IMG") {
        target.remove();
        emit();
      }
    };
    el.addEventListener("error", onError, true);
    return () => el.removeEventListener("error", onError, true);
  }, [emit]);

  // Track the format under the caret so the toolbar can show what is on.
  useEffect(() => {
    const update = () => {
      const el = ref.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0) return;
      const anchor = sel.anchorNode;
      if (!anchor || !el.contains(anchor)) return;
      const block = closestBlock(anchor, el);
      setActive({
        bold: commandState("bold"),
        italic: commandState("italic"),
        strike: commandState("strikeThrough"),
        code: Boolean(closestTag(anchor, "code", el)),
        link: Boolean(closestTag(anchor, "a", el)),
        ul: commandState("insertUnorderedList"),
        ol: commandState("insertOrderedList"),
        table: Boolean(closestTag(anchor, "table", el)),
        block: block ? block.tagName.toLowerCase() : "p",
      });
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);

  const focus = () => {
    const el = ref.current;
    if (!el) return null;
    el.focus();
    return el;
  };

  const clearImageSelection = () => {
    ref.current?.querySelectorAll("img.weekly-img-selected").forEach((n) => {
      n.classList.remove("weekly-img-selected");
    });
    setImageSelected(false);
  };

  const deleteSelectedImage = () => {
    const el = ref.current;
    const img = el?.querySelector("img.weekly-img-selected");
    if (!el || !img) return;
    img.remove();
    setImageSelected(false);
    emit();
  };

  const currentCell = (): HTMLTableCellElement | null => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return null;
    return (closestTag(sel.anchorNode, "td", el) ??
      closestTag(sel.anchorNode, "th", el)) as HTMLTableCellElement | null;
  };

  const insertTable = () => {
    const rows = Math.max(1, Math.min(20, tableSize.rows || 1));
    const cols = Math.max(1, Math.min(8, tableSize.cols || 1));
    const head = `<tr>${Array.from({ length: cols }, (_, i) => `<th>Header ${i + 1}</th>`).join("")}</tr>`;
    const body = Array.from(
      { length: rows - 1 },
      () => `<tr>${Array.from({ length: cols }, () => "<td></td>").join("")}</tr>`,
    ).join("");
    focus();
    document.execCommand(
      "insertHTML",
      false,
      `<table><thead>${head}</thead><tbody>${body}</tbody></table><p><br></p>`,
    );
    emit();
    setTableOpen(false);
  };

  const modifyTable = (op: "addRow" | "addCol" | "delRow" | "delCol" | "delTable") => {
    const el = ref.current;
    const sel = window.getSelection();
    const table =
      el && sel ? (closestTag(sel.anchorNode, "table", el) as HTMLTableElement | null) : null;
    const cell = currentCell();
    if (!el || !table || !cell) return;
    const row = cell.parentElement as HTMLTableRowElement;
    const colIndex = Array.from(row.children).indexOf(cell);
    if (op === "addRow") {
      const isHeader = row.parentElement?.tagName === "THEAD";
      const tr = document.createElement("tr");
      for (let i = 0; i < row.children.length; i += 1) {
        tr.appendChild(document.createElement(isHeader ? "th" : "td"));
      }
      row.after(tr);
    } else if (op === "addCol") {
      Array.from(table.rows).forEach((tr) => {
        const isHeader =
          tr.parentElement?.tagName === "THEAD" || tr.children[colIndex]?.tagName === "TH";
        const newCell = document.createElement(isHeader ? "th" : "td");
        const refCell = tr.children[colIndex];
        if (refCell) refCell.after(newCell);
        else tr.appendChild(newCell);
      });
    } else if (op === "delRow") {
      row.remove();
      if (table.rows.length === 0) table.remove();
    } else if (op === "delCol") {
      if ((table.rows[0]?.children.length ?? 0) <= 1) table.remove();
      else Array.from(table.rows).forEach((tr) => tr.children[colIndex]?.remove());
    } else {
      table.remove();
    }
    emit();
  };

  const exec = (command: string, arg?: string) => {
    if (disabled) return;
    focus();
    document.execCommand(command, false, arg);
    emit();
  };

  /** Block formats toggle: a heading becomes body text when pressed again. */
  const setBlock = (tag: string) => {
    const el = ref.current;
    const sel = window.getSelection();
    const current = el && sel?.rangeCount ? closestBlock(sel.anchorNode, el) : null;
    const isOn = current?.tagName.toLowerCase() === tag && tag !== "p";
    exec("formatBlock", `<${isOn ? "p" : tag}>`);
  };

  /** Wrap the selection, or unwrap the matching ancestor (true toggle). */
  const surround = (tag: string) => {
    const el = focus();
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const wrapper = document.createElement(tag);
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
    sel.removeAllRanges();
    const next = document.createRange();
    next.selectNodeContents(wrapper);
    sel.addRange(next);
    emit();
  };

  const unwrap = (tag: string) => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const node = closestTag(sel.anchorNode, tag, el) ?? closestTag(sel.focusNode, tag, el);
    const parent = node?.parentNode;
    if (!node || !parent) return;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    parent.removeChild(node);
    parent.normalize?.();
    emit();
    focus();
  };

  const toggleCode = () => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const inCode =
      closestTag(sel.anchorNode, "code", el) ?? closestTag(sel.focusNode, "code", el);
    if (inCode) unwrap("code");
    else surround("code");
  };

  const toggleLink = () => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    if (closestTag(sel.anchorNode, "a", el)) {
      unwrap("a");
      return;
    }
    savedRange.current = sel.getRangeAt(0).cloneRange();
    setLinkUrl("");
    setLinkOpen(true);
  };

  const applyLink = () => {
    setLinkOpen(false);
    const href = linkUrl.trim();
    if (!href) return;
    const el = focus();
    const sel = window.getSelection();
    if (el && sel) {
      if (savedRange.current) {
        sel.removeAllRanges();
        sel.addRange(savedRange.current);
      }
      if (sel.isCollapsed) {
        document.execCommand("insertHTML", false, `<a href="${href}">${href}</a>`);
      } else {
        document.execCommand("createLink", false, href);
      }
      emit();
    }
    savedRange.current = null;
  };

  const insertImageFile = useCallback(
    async (file: File) => {
      if (!onUploadImage || disabled) return;
      setUploading(true);
      try {
        const { url, alt } = await onUploadImage(file);
        const safeAlt = (alt || file.name.replace(/\.[^.]+$/, "")).replace(/"/g, "&quot;");
        focus();
        document.execCommand("insertHTML", false, `<img src="${url}" alt="${safeAlt}">`);
        emit();
      } catch {
        /* the host surfaces the failure */
      } finally {
        setUploading(false);
      }
    },
    [disabled, emit, onUploadImage],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Backspace/Delete removes the selected figure, or the one the caret sits
    // against, before the browser treats it as ordinary text.
    if (e.key === "Backspace" || e.key === "Delete") {
      const el = ref.current;
      const sel = window.getSelection();
      if (el && sel && sel.rangeCount) {
        const selected = el.querySelector("img.weekly-img-selected");
        if (selected) {
          e.preventDefault();
          selected.remove();
          setImageSelected(false);
          emit();
          return;
        }
        const range = sel.getRangeAt(0);
        if (range.collapsed) {
          const img =
            e.key === "Backspace"
              ? imageAdjacent(range, "before")
              : imageAdjacent(range, "after");
          if (img) {
            e.preventDefault();
            img.remove();
            emit();
            return;
          }
        }
      }
    }
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === "z") {
      e.preventDefault();
      exec(e.shiftKey ? "redo" : "undo");
    } else if (key === "y") {
      e.preventDefault();
      exec("redo");
    } else if (key === "b") {
      e.preventDefault();
      exec("bold");
    } else if (key === "i") {
      e.preventDefault();
      exec("italic");
    } else if (key === "k") {
      e.preventDefault();
      toggleLink();
    } else if (key === "`") {
      e.preventDefault();
      toggleCode();
    }
  };

  const stats = readingStats(value);

  return (
    <div
      className={cx(
        "overflow-hidden rounded-lg border border-phantix-700/60 focus-within:border-gold-400/40",
        isFill && "flex min-h-0 flex-col",
        // Full screen is opaque: the page behind is not visible at all.
        fullscreen
          ? "fixed inset-0 z-[80] rounded-none border-0 bg-phantix-950"
          : cx("bg-phantix-950/50", fill && "h-full"),
      )}
    >
      {/* Toolbar */}
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex shrink-0 flex-wrap items-center gap-1 border-b border-phantix-700/50 bg-phantix-900/60 px-2 py-1.5"
      >
        <ToolButton label="Undo (Ctrl/Cmd+Z)" onClick={() => exec("undo")} disabled={disabled}>
          <Undo2 size={15} />
        </ToolButton>
        <ToolButton label="Redo (Ctrl/Cmd+Shift+Z)" onClick={() => exec("redo")} disabled={disabled}>
          <Redo2 size={15} />
        </ToolButton>
        <Divider />
        <select
          aria-label="Text style"
          className="mr-1 h-8 rounded-md border border-phantix-700 bg-phantix-900 px-2 text-xs text-slate-300 outline-none"
          value={BLOCK_OPTIONS.some((o) => o.value === active.block) ? active.block : "p"}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setBlock(e.target.value)}
        >
          {BLOCK_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ToolButton
          label="Bold (Ctrl/Cmd+B)"
          onClick={() => exec("bold")}
          active={active.bold}
          disabled={disabled}
        >
          <Bold size={15} />
        </ToolButton>
        <ToolButton
          label="Italic (Ctrl/Cmd+I)"
          onClick={() => exec("italic")}
          active={active.italic}
          disabled={disabled}
        >
          <Italic size={15} />
        </ToolButton>
        <ToolButton
          label="Strikethrough"
          onClick={() => exec("strikeThrough")}
          active={active.strike}
          disabled={disabled}
        >
          <Strikethrough size={15} />
        </ToolButton>
        <Divider />
        <ToolButton label="Heading" onClick={() => setBlock("h2")} active={active.block === "h2"} disabled={disabled}>
          <Heading2 size={15} />
        </ToolButton>
        <ToolButton label="Subheading" onClick={() => setBlock("h3")} active={active.block === "h3"} disabled={disabled}>
          <Heading3 size={15} />
        </ToolButton>
        <ToolButton label="Body text" onClick={() => setBlock("p")} active={active.block === "p"} disabled={disabled}>
          <Pilcrow size={15} />
        </ToolButton>
        <ToolButton label="Quote" onClick={() => setBlock("blockquote")} active={active.block === "blockquote"} disabled={disabled}>
          <Quote size={15} />
        </ToolButton>
        <Divider />
        <ToolButton
          label="Bulleted list"
          onClick={() => exec("insertUnorderedList")}
          active={active.ul}
          disabled={disabled}
        >
          <List size={15} />
        </ToolButton>
        <ToolButton
          label="Numbered list"
          onClick={() => exec("insertOrderedList")}
          active={active.ol}
          disabled={disabled}
        >
          <ListOrdered size={15} />
        </ToolButton>
        <ToolButton label="Indent" onClick={() => exec("indent")} disabled={disabled}>
          <IndentIncrease size={15} />
        </ToolButton>
        <ToolButton label="Outdent" onClick={() => exec("outdent")} disabled={disabled}>
          <IndentDecrease size={15} />
        </ToolButton>
        <ToolButton label="Inline code" onClick={toggleCode} active={active.code} disabled={disabled}>
          <Code size={15} />
        </ToolButton>
        <ToolButton label="Divider" onClick={() => exec("insertHorizontalRule")} disabled={disabled}>
          <Minus size={15} />
        </ToolButton>
        <ToolButton
          label="Insert table"
          onClick={() => setTableOpen((v) => !v)}
          active={tableOpen}
          disabled={disabled}
        >
          <Table2 size={15} />
        </ToolButton>
        {active.table ? (
          <span className="ml-1 flex items-center gap-0.5 rounded-md border border-phantix-700/60 px-1">
            {(
              [
                ["addRow", "Row +", "Add row below"],
                ["addCol", "Col +", "Add column right"],
                ["delRow", "Row −", "Delete row"],
                ["delCol", "Col −", "Delete column"],
              ] as const
            ).map(([op, text, title]) => (
              <button
                key={op}
                type="button"
                title={title}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => modifyTable(op)}
                className="rounded px-1.5 py-1 text-[11px] text-slate-400 hover:bg-phantix-800 hover:text-slate-100"
              >
                {text}
              </button>
            ))}
            <button
              type="button"
              title="Delete table"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => modifyTable("delTable")}
              className="rounded px-1.5 py-1 text-[11px] text-severity-critical hover:bg-phantix-800"
            >
              Delete
            </button>
          </span>
        ) : null}
        <Divider />
        <ToolButton
          label="Link / remove link (Ctrl/Cmd+K)"
          onClick={toggleLink}
          active={active.link}
          disabled={disabled}
        >
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
        {imageSelected ? (
          <ToolButton label="Delete figure (Backspace)" onClick={deleteSelectedImage} disabled={disabled}>
            <Trash2 size={15} className="text-severity-critical" />
          </ToolButton>
        ) : null}
        <Divider />
        <span className="ml-auto flex items-center gap-1">
          <ToolButton
            label={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
            onClick={() => setFullscreen((v) => !v)}
            active={fullscreen}
          >
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </ToolButton>
          <span className="pr-1.5 text-[11px] tabular-nums text-slate-500">
            {stats.words.toLocaleString()} words · {stats.minutes} min read
          </span>
        </span>
      </div>

      {linkOpen ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-phantix-700/40 bg-phantix-900/40 px-3 py-2">
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
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => setLinkOpen(false)}>
            Cancel
          </button>
        </div>
      ) : null}

      {tableOpen ? (
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-phantix-700/40 bg-phantix-900/40 px-3 py-2 text-xs text-slate-400">
          <Table2 size={14} className="shrink-0 text-slate-500" />
          <label className="flex items-center gap-1.5">
            Rows
            <input
              type="number"
              min={1}
              max={20}
              className="input !w-16 !py-1 !text-xs"
              value={tableSize.rows}
              onChange={(e) => setTableSize({ ...tableSize, rows: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-1.5">
            Columns
            <input
              type="number"
              min={1}
              max={8}
              className="input !w-16 !py-1 !text-xs"
              value={tableSize.cols}
              onChange={(e) => setTableSize({ ...tableSize, cols: Number(e.target.value) })}
            />
          </label>
          <button type="button" className="btn-primary !py-1 !text-xs" onClick={insertTable}>
            Insert table
          </button>
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => setTableOpen(false)}>
            Cancel
          </button>
        </div>
      ) : null}

      <div className={cx("relative", isFill && "min-h-0 flex-1")}>
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          contentEditable={!disabled}
          suppressContentEditableWarning
          spellCheck
          onInput={emit}
          onBlur={emit}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "IMG") {
              clearImageSelection();
              target.classList.add("weekly-img-selected");
              setImageSelected(true);
            } else {
              clearImageSelection();
            }
          }}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const file = Array.from(e.clipboardData.items)
              .find((i) => i.type.startsWith("image/"))
              ?.getAsFile();
            if (file) {
              e.preventDefault();
              void insertImageFile(file);
              return;
            }
            // Paste as plain text so foreign markup (web pages, docs) never
            // lands in the editor as un-renderable HTML.
            const text = e.clipboardData.getData("text/plain");
            if (text) {
              e.preventDefault();
              document.execCommand("insertText", false, text);
              emit();
            }
          }}
          onDrop={(e) => {
            const file = Array.from(e.dataTransfer.files).find((f) => IMAGE_RE.test(f.type));
            if (!file) return;
            e.preventDefault();
            void insertImageFile(file);
          }}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.items).some((i) => i.type.startsWith("image/"))) {
              e.preventDefault();
            }
          }}
          className={cx(
            "weekly-prose w-full px-6 py-5 outline-none",
            disabled && "opacity-60",
            isFill && "h-full overflow-y-auto",
          )}
          style={isFill ? undefined : { minHeight }}
        />
        {empty ? (
          <p className="pointer-events-none absolute left-6 top-5 max-w-[90%] text-[15px] leading-7 text-slate-600">
            {placeholder}
          </p>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void insertImageFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
