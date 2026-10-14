import { marked } from "marked";

/**
 * Markdown <-> HTML for the rich editor.
 *
 * Writers edit a Substack-style rendering, not raw Markdown, but posts are
 * still stored as Markdown (the public blog renders Markdown and the backend
 * snapshots it). This module is the bridge: `markdownToHtml` paints the editor
 * from the stored body, `htmlToMarkdown` serialises the editor back on every
 * change. Imports are the only place Markdown is handled literally.
 */

marked.setOptions({ gfm: true, breaks: true });

/**
 * Neutralise raw HTML in the source before rendering. Markdown never needs a
 * literal tag, so this keeps only the HTML `marked` itself emits and stops a
 * pasted `<script>`/`<img onerror>` reaching the contentEditable.
 */
function escapeRawHtml(md: string): string {
  return md.replace(/<(?=[a-zA-Z/!?])/g, "&lt;");
}

export function markdownToHtml(md: string): string {
  const src = escapeRawHtml(md || "");
  const html = marked.parse(src, { async: false }) as string;
  return html.trim();
}

/** Inline nodes -> Markdown (bold, italic, links, code, images…). */
function inlineMd(node: Node): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? "";
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = inlineMd(el);
    switch (tag) {
      case "strong":
      case "b":
        out += `**${inner}**`;
        break;
      case "em":
      case "i":
        out += `*${inner}*`;
        break;
      case "del":
      case "s":
      case "strike":
        out += `~~${inner}~~`;
        break;
      case "code":
        out += `\`${inner.replace(/`/g, "\\`")}\``;
        break;
      case "a": {
        const href = el.getAttribute("href") ?? "";
        out += href ? `[${inner}](${href})` : inner;
        break;
      }
      case "img": {
        const alt = el.getAttribute("alt") ?? "";
        const src = el.getAttribute("src") ?? "";
        out += `![${alt}](${src})`;
        break;
      }
      case "br":
        out += "\n";
        break;
      default:
        // style-only wrappers (span, u, font, mark…) keep their text
        out += inner;
    }
  });
  return out;
}

/** A <ul>/<ol> -> Markdown, preserving one level of nesting. */function listMd(el: HTMLElement, depth = 0): string {
  const ordered = el.tagName.toLowerCase() === "ol";
  const lines: string[] = [];
  let index = 1;
  Array.from(el.children).forEach((child) => {
    if (child.tagName.toLowerCase() !== "li") return;
    const li = child.cloneNode(true) as HTMLElement;
    const nested = Array.from(li.querySelectorAll(":scope > ul, :scope > ol"));
    nested.forEach((n) => n.remove());
    const marker = ordered ? `${index}. ` : "- ";
    const text = inlineMd(li).trim().replace(/\s*\n\s*/g, " ");
    lines.push(`${"  ".repeat(depth)}${marker}${text}`);
    nested.forEach((n) => lines.push(listMd(n as HTMLElement, depth + 1)));
    index += 1;
  });
  return lines.join("\n");
}

/** A <table> -> a GFM pipe table, keeping the header row and alignment-free columns. */
function tableMd(el: HTMLElement): string {
  const table = el as HTMLTableElement;
  const rows = Array.from(table.rows);
  if (!rows.length) return "";
  const cell = (c: HTMLTableCellElement) =>
    inlineMd(c)
      .trim()
      .replace(/\|/g, "\\|")
      .replace(/\s*\n\s*/g, " ");
  const row = (r: HTMLTableRowElement) => `| ${Array.from(r.cells).map(cell).join(" | ")} |`;
  const header = rows.find((r) => r.parentElement?.tagName === "THEAD") ?? rows[0];
  const bodyRows = rows.filter((r) => r !== header);
  const width = Math.max(...rows.map((r) => r.cells.length));
  const separator = `| ${Array.from({ length: width }, () => "---").join(" | ")} |`;
  return [row(header), separator, ...bodyRows.map(row)].join("\n");
}

/** A top-level element -> Markdown block. */
function blockMd(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) {
    return `${"#".repeat(Number(tag[1]))} ${inlineMd(el).trim()}`;
  }
  switch (tag) {
    case "blockquote": {
      const inner = el.children.length
        ? Array.from(el.children)
            .map((c) => blockMd(c as HTMLElement))
            .join("\n\n")
        : inlineMd(el).trim();
      return inner
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    }
    case "pre": {
      const codeEl = el.querySelector("code");
      const lang = codeEl?.className.match(/language-([\w-]+)/)?.[1] ?? "";
      const code = (codeEl ?? el).textContent ?? "";
      return `\`\`\`${lang}\n${code.replace(/\n+$/, "")}\n\`\`\``;
    }
    case "hr":
      return "---";
    case "ul":
    case "ol":
      return listMd(el);
    case "table":
      return tableMd(el);
    case "img":
      return `![${el.getAttribute("alt") ?? ""}](${el.getAttribute("src") ?? ""})`;
    case "figure":
      return inlineMd(el).trim();
    case "div":
    case "section": {
      const blocks = Array.from(el.children)
        .map((c) => blockMd(c as HTMLElement))
        .filter((b) => b.trim());
      return blocks.join("\n\n");
    }
    default:
      return inlineMd(el).trim();
  }
}

/** The contentEditable's HTML -> Markdown, ready to store. */
export function htmlToMarkdown(html: string): string {
  if (typeof document === "undefined") return "";
  const root = document.createElement("div");
  root.innerHTML = html;
  const parts: string[] = [];
  root.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? "").trim();
      if (text) parts.push(text);
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const md = blockMd(child as HTMLElement);
    if (md.trim()) parts.push(md);
  });
  return parts
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Rough word count and reading time for the editor footer. */
export function readingStats(md: string): { words: number; minutes: number } {
  const text = (md || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#>*_`~|[\]()-]/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return { words, minutes: Math.max(1, Math.round(words / 220)) };
}
