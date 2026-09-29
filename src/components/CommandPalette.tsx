import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, Search } from "lucide-react";
import { cx } from "@/lib/utils";

/**
 * Cmd/Ctrl+K palette for the staff console.
 *
 * The staff nav is deep (seven sections, several collapsed groups), so the
 * fastest way anywhere is a keyboard jump rather than a hunt through the
 * sidebar. The index is built by the Layout from the same role-filtered nav
 * definitions the sidebar uses, so it can never offer a page the operator
 * cannot open.
 */
export type PaletteItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  /** Sidebar section, shown as a right-aligned hint. */
  section?: string;
  /** Opens in a new tab. */
  external?: boolean;
  /** Opens in this tab (keeps the staff token, e.g. the API reference). */
  sameTab?: boolean;
};

export default function CommandPalette({
  open,
  onClose,
  items,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
  onNavigate: (item: PaletteItem) => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 40);
    return items
      .filter(
        (i) =>
          i.label.toLowerCase().includes(needle) ||
          i.to.toLowerCase().includes(needle) ||
          (i.section ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [q, items]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const hit = results[active];
        if (hit) {
          e.preventDefault();
          onNavigate(hit);
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, active, onNavigate, onClose]);

  // Keep the highlighted row inside the scroll area.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-start justify-center bg-phantix-950/70 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="glass-bright w-full max-w-xl overflow-hidden rounded-lg shadow-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <div className="flex items-center gap-3 border-b border-phantix-700/40 px-4 py-3.5">
              <Search size={16} className="shrink-0 text-slate-500" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Jump to a page…"
                aria-label="Search the staff console"
                className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              <kbd className="rounded-sm border border-phantix-600/60 bg-phantix-850 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-slate-400">
                ESC
              </kbd>
            </div>

            <div ref={listRef} className="max-h-96 overflow-y-auto p-2">
              {results.map((item, i) => (
                <button
                  key={`${item.to}::${item.label}`}
                  type="button"
                  data-idx={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    onNavigate(item);
                    onClose();
                  }}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                    i === active ? "bg-phantix-800 text-white" : "text-slate-300 hover:bg-phantix-800/70 hover:text-white",
                  )}
                >
                  <span className="shrink-0 text-gold-400">{item.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.section && (
                    <span className="hidden shrink-0 text-[12px] uppercase tracking-wider text-slate-600 sm:block">
                      {item.section}
                    </span>
                  )}
                </button>
              ))}
              {results.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-slate-500">
                  Nothing matches “{q}”.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-phantix-700/40 px-4 py-2.5 text-[12px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <CornerDownLeft size={12} /> open · ↑↓ to move
              </span>
              <span>
                {results.length} result{results.length === 1 ? "" : "s"}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
