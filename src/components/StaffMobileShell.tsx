// Phone shell for the staff portal: below md the sidebar becomes a bottom tab
// bar (the operator's first four role-visible groups, then "More"), and "More"
// opens a bottom sheet with every page by group, the theme and sign-out.

import React, { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { ExternalLink, Globe, LogOut, Monitor, Moon, MoreHorizontal, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cx } from "@/lib/utils";

export type StaffNavItem = { to: string; label: string; icon: React.ReactNode; external?: boolean; sameTab?: boolean };
export type StaffNavSection = { label: string; icon: React.ReactNode; items: StaffNavItem[] };

const TAB_COUNT = 4;

function hit(to: string, pathname: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function activeSection(nav: StaffNavSection[], pathname: string): string | null {
  let best: { label: string; length: number } | null = null;
  for (const s of nav) for (const i of s.items) {
    if (!i.external && !i.sameTab && hit(i.to, pathname) && (!best || i.to.length > best.length)) best = { label: s.label, length: i.to.length };
  }
  return best?.label ?? null;
}

/** Title for the phone app bar: the current page's nav label. */
export function useStaffTitle(nav: StaffNavSection[]): string {
  const { pathname } = useLocation();
  let best: StaffNavItem | null = null;
  for (const s of nav) for (const i of s.items) if (!i.external && hit(i.to, pathname) && (!best || i.to.length > best.to.length)) best = i;
  return best?.label ?? "Staff Portal";
}

function tabLabel(label: string): string {
  return label.length > 11 ? label.split(/\s+/)[0] : label;
}

export function StaffTabBar({ nav, moreOpen, onMore }: { nav: StaffNavSection[]; moreOpen: boolean; onMore: () => void }) {
  const { pathname } = useLocation();
  const tabs = nav.filter((s) => s.items.some((i) => !i.external && !i.sameTab)).slice(0, TAB_COUNT);
  const current = activeSection(nav, pathname);
  const onTab = tabs.some((t) => t.label === current);
  const itemCls = "tap flex min-h-[56px] flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-medium transition-colors";
  const pill = (on: boolean) => cx("flex h-7 w-12 items-center justify-center rounded-full transition-colors", on && "bg-gold-400/15");
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-phantix-700/50 bg-[rgb(var(--surface-card)/0.97)] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
        {tabs.map((s) => {
          const first = s.items.find((i) => !i.external && !i.sameTab)!;
          const on = current === s.label && !moreOpen;
          return (
            <NavLink key={s.label} to={first.to} className={cx(itemCls, on ? "text-gold-300" : "text-slate-500")}>
              <span className={pill(on)}>{s.icon}</span>
              <span className="max-w-full truncate">{tabLabel(s.label)}</span>
            </NavLink>
          );
        })}
        <button type="button" onClick={onMore} aria-expanded={moreOpen} className={cx(itemCls, moreOpen || !onTab ? "text-gold-300" : "text-slate-500")}>
          <span className={pill(moreOpen || !onTab)}><MoreHorizontal size={21} /></span>
          More
        </button>
      </div>
    </nav>
  );
}

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun size={15} /> },
  { value: "dark", label: "Dark", icon: <Moon size={15} /> },
  { value: "system", label: "Auto", icon: <Monitor size={15} /> },
];

const ROW = "tap flex min-h-[50px] w-full items-center gap-3 px-4 text-left text-sm";

export function StaffMoreSheet({
  open,
  onClose,
  nav,
  account,
  appUrl,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  nav: StaffNavSection[];
  account: React.ReactNode;
  appUrl: string;
  onSignOut: () => void;
}) {
  const { pathname } = useLocation();
  const { mode, setTheme } = useTheme();
  // Only the grab handle drags the sheet. When the whole sheet was draggable,
  // framer-motion claimed every vertical swipe, so the list could not be
  // scrolled by touch (only by dragging the scrollbar).
  const dragControls = useDragControls();

  useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const icon = (on: boolean, node: React.ReactNode) => (
    <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", on ? "bg-gold-400/15" : "bg-phantix-800/70")}>{node}</span>
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm md:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="More"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 500) onClose(); }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-phantix-600/60 bg-[rgb(var(--surface-card))] pb-[calc(76px+env(safe-area-inset-bottom))] shadow-2xl md:hidden"
          >
            {/* Drag here to close; the rest of the sheet scrolls normally. */}
            <div
              className="sticky top-0 z-10 flex cursor-grab touch-none justify-center bg-[rgb(var(--surface-card))] pb-3 pt-3 active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <span className="h-1.5 w-10 rounded-full bg-phantix-600/80" aria-hidden="true" />
            </div>
            <div className="space-y-5 px-4">
              {account}

              {nav.map((section) => (
                <div key={section.label}>
                  <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-slate-500">{section.label}</p>
                  <div className="divide-y divide-phantix-700/40 overflow-hidden rounded-2xl border border-phantix-700/50 bg-phantix-900/60">
                    {section.items.map((item) => {
                      if (item.external || item.sameTab) {
                        return (
                          <a
                            key={item.to}
                            href={item.to}
                            {...(item.sameTab ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                            className={cx(ROW, "text-slate-200")}
                          >
                            {icon(false, item.icon)}
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            <ExternalLink size={13} className="shrink-0 text-slate-600" />
                          </a>
                        );
                      }
                      const on = hit(item.to, pathname);
                      return (
                        <NavLink key={item.to} to={item.to} className={cx(ROW, on ? "text-gold-300" : "text-slate-200")}>
                          {icon(on, item.icon)}
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div>
                <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-slate-500">Appearance</p>
                <div className="grid grid-cols-3 gap-1 rounded-xl border border-phantix-700/50 bg-phantix-900/60 p-1">
                  {THEME_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setTheme(o.value)}
                      className={cx("tap flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg text-sm transition-colors", mode === o.value ? "bg-phantix-700/70 text-white" : "text-slate-400")}
                    >
                      {o.icon} {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-phantix-700/40 overflow-hidden rounded-2xl border border-phantix-700/50 bg-phantix-900/60">
                <a href={appUrl} target="_blank" rel="noopener noreferrer" className={cx(ROW, "text-phantix-300")}>
                  <Globe size={17} /> Launch app
                </a>
                <button type="button" onClick={() => { onClose(); onSignOut(); }} className={cx(ROW, "text-severity-critical")}>
                  <LogOut size={17} /> Sign out
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
