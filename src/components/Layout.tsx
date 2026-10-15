import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import PageErrorBoundary from "@/components/PageErrorBoundary";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard, Shield, Building2, MessageSquare, MessageSquareWarning, Server, Brain,
  Users, FileCheck, Wrench, Search, Activity, LogOut,
  Zap, Globe, AlertTriangle, ScanLine, BarChart3, RefreshCw,
  Crosshair, Radio, FileText, TerminalSquare, Radar, BookOpen, FlaskConical,
  ScrollText, Mail, Layers, Inbox, Sparkles, FileCode2, ChevronRight, Newspaper,
  BellRing, ListOrdered, Grip, LayoutGrid, PanelLeftClose, PanelLeftOpen, UserRound,
  Plus, FolderOpen, Settings2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { APP_URL, PLATFORM_URL } from "@/lib/links";
import { cx } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AGI_ENABLED } from "@/lib/api";
import { BrandMark, BrandWordmark } from "@/components/BrandLogo";
import { useSidebarCollapsed } from "@/lib/useSidebarCollapsed";
import { useDismiss } from "@/lib/useDismiss";
import CommandPalette, { type PaletteItem } from "@/components/CommandPalette";
import { StaffMoreSheet, StaffTabBar, useStaffTitle } from "@/components/StaffMobileShell";
import { useTableCards } from "@/lib/useTableCards";

type NavLeafItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  superadminOnly?: boolean;
  contributorOnly?: boolean;
  editorOnly?: boolean;
  agiOnly?: boolean;
  external?: boolean;
  // Open in the same tab (keeps sessionStorage, e.g. the API Reference page
  // needs the staff token). Use instead of `external` for token-bearing pages.
  sameTab?: boolean;
};
type Roles = { isAdmin: boolean; isEditor: boolean; isSuperadmin: boolean; isContributor: boolean; isAgiAdmin: boolean };

/** One sidebar group: only its icon and name show until it is opened, then it
 *  drops down its pages. A group with a single visible page is that page's link. */
type NavGroupDef = {
  label: string;
  icon: React.ReactNode;
  role: "all" | "admin" | "superadmin" | "contributor" | "editor";
  items: NavLeafItem[];
};

const navSections: NavGroupDef[] = [
  {
    label: "Overview",
    icon: <LayoutDashboard size={18} />,
    role: "all",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
      { to: "/search", label: "Search", icon: <Search size={18} /> },
      { to: "/clients", label: "Clients", icon: <Building2 size={18} />, adminOnly: true },
      { to: "/sandbox", label: "Sandbox", icon: <FlaskConical size={18} />, adminOnly: true },
      { to: "/waitlist", label: "Waitlist", icon: <ListOrdered size={18} />, adminOnly: true },
      { to: "/support", label: "Support", icon: <MessageSquare size={18} /> },
    ],
  },
  {
    label: "Contribute",
    icon: <Sparkles size={18} />,
    role: "contributor",
    items: [
      { to: "/contribute", label: "Workspace", icon: <Sparkles size={18} />, contributorOnly: true },
      { to: "/contribute/knowledge", label: "Knowledge", icon: <BookOpen size={18} />, contributorOnly: true },
      { to: "/contribute/skills", label: "Skills", icon: <Brain size={18} />, contributorOnly: true },
      { to: "/contribute/capabilities", label: "Capabilities", icon: <FileCode2 size={18} />, contributorOnly: true },
      { to: "/contribute/engines", label: "Engines", icon: <Layers size={18} />, contributorOnly: true },
      { to: "/contribute/learning", label: "Learnings", icon: <Inbox size={18} />, contributorOnly: true },
      { to: "/architecture", label: "Atlas", icon: <Layers size={18} />, contributorOnly: true },
    ],
  },
  {
    label: "Monitoring",
    icon: <Activity size={18} />,
    role: "admin",
    items: [
      { to: "/logs", label: "Logs", icon: <FileText size={18} /> },
      { to: "/server", label: "Server", icon: <Server size={18} /> },
      { to: "/services", label: "Services", icon: <Activity size={18} /> },
      { to: "/bus", label: "Events", icon: <Radio size={18} /> },
      { to: "/scanner-tools", label: "Scanners", icon: <ScanLine size={18} /> },
    ],
  },
  {
    label: "Insights",
    icon: <BarChart3 size={18} />,
    role: "admin",
    items: [
      { to: "/analytics", label: "Analytics", icon: <BarChart3 size={18} /> },
      { to: "/feedback", label: "Feedback", icon: <MessageSquareWarning size={18} /> },
      { to: "/demo-requests", label: "Demos", icon: <Inbox size={18} /> },
      { to: "/architecture", label: "Architecture", icon: <Layers size={18} /> },
      { to: "/api-docs.html", label: "API", icon: <BookOpen size={18} />, external: true, sameTab: true },
    ],
  },
  {
    label: "The Weekly",
    icon: <Newspaper size={18} />,
    role: "editor",
    items: [
      { to: "/weekly", label: "Posts", icon: <Newspaper size={18} /> },
      { to: "/weekly/new", label: "New post", icon: <Plus size={18} /> },
      { to: "/weekly/issues", label: "Issues", icon: <FolderOpen size={18} /> },
      { to: "/weekly/masthead", label: "Masthead", icon: <Settings2 size={18} /> },
    ],
  },
  {
    label: "Catalogs",
    icon: <FileCheck size={18} />,
    role: "admin",
    items: [
      { to: "/compliance", label: "Compliance", icon: <FileCheck size={18} /> },
      { to: "/audits", label: "Audits", icon: <FileCheck size={18} /> },
      { to: "/tooling", label: "Tooling", icon: <Wrench size={18} /> },
      { to: "/soc-provisioning", label: "Provisioning", icon: <Shield size={18} /> },
      { to: "/discovery", label: "Discovery", icon: <Search size={18} /> },
      { to: "/experience", label: "Experience", icon: <Zap size={18} /> },
      { to: "/email-templates", label: "Templates", icon: <Mail size={18} /> },
      { to: "/legal-documents", label: "Legal", icon: <ScrollText size={18} /> },
    ],
  },
  {
    label: "Agents",
    icon: <Brain size={18} />,
    role: "admin",
    items: [
      { to: "/ai", label: "AI", icon: <Brain size={18} /> },
      { to: "/agent-activity", label: "Activity", icon: <Activity size={18} /> },
      { to: "/vapt-admin", label: "VAPT", icon: <Crosshair size={18} /> },
      { to: "/agi", label: "Fleet", icon: <Radar size={18} />, agiOnly: true },
    ],
  },
  {
    label: "Operations",
    icon: <Radar size={18} />,
    role: "superadmin",
    items: [
      { to: "/overwatch", label: "Overwatch", icon: <Radar size={18} />, superadminOnly: true },
      { to: "/super-logs", label: "Superlogs", icon: <FileText size={18} />, superadminOnly: true },
      { to: "/billing", label: "Billing", icon: <BarChart3 size={18} />, superadminOnly: true },
      { to: "/internal-alerts", label: "Alerts", icon: <BellRing size={18} />, superadminOnly: true },
      { to: "/engine-jobs", label: "Jobs", icon: <Activity size={18} />, superadminOnly: true },
      { to: "/terminal", label: "Terminal", icon: <TerminalSquare size={18} />, superadminOnly: true },
      { to: "/staff", label: "Staff", icon: <Users size={18} />, superadminOnly: true },
    ],
  },
];

/** True when at least one role flag on `item` is set and satisfied by the caller's roles. */
function isItemVisible(item: NavLeafItem, roles: Roles): boolean {
  if (item.superadminOnly && !roles.isSuperadmin) return false;
  if (item.adminOnly && !roles.isAdmin) return false;
  if (item.contributorOnly && !roles.isContributor) return false;
  if (item.editorOnly && !roles.isEditor) return false;
  if (item.agiOnly && (!roles.isAgiAdmin || !AGI_ENABLED)) return false;
  return true;
}

/** The groups this caller may see, each cut down to its visible pages (a group
 *  with none left is dropped). */
function visibleNavSections(roles: Roles): NavGroupDef[] {
  const out: NavGroupDef[] = [];
  for (const section of navSections) {
    if (section.role === "admin" && !roles.isAdmin) continue;
    if (section.role === "editor" && !roles.isEditor) continue;
    if (section.role === "superadmin" && !roles.isSuperadmin) continue;
    if (section.role === "contributor" && !roles.isContributor) continue;
    const items = section.items.filter((item) => isItemVisible(item, roles));
    if (items.length) out.push({ ...section, items });
  }
  return out;
}

/** The group holding the page at `pathname`: the longest item route that is
 *  the path itself or a parent of it, so `/contribute/skills` resolves to its
 *  own entry rather than to `/contribute`. */
function activeGroupLabel(sections: NavGroupDef[], pathname: string): string | null {
  let best: { label: string; length: number } | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      const hit = pathname === item.to || pathname.startsWith(`${item.to}/`);
      if (hit && (!best || item.to.length > best.length)) {
        best = { label: section.label, length: item.to.length };
      }
    }
  }
  return best?.label ?? null;
}

/** Whether a scroll box has content below its visible bottom edge. Rechecks on
 *  scroll and whenever the box or its content resizes (a group opening). */
function useMoreBelow(el: HTMLElement | null): boolean {
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!el) return;
    const update = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [el]);
  return more;
}

function NavLeafLink({ item, onClick, mobile }: { item: NavLeafItem; onClick?: () => void; mobile?: boolean }) {
  // In the sidebar the label hides while the rail is collapsed; the mobile menu has no rail.
  const label = mobile ? item.label : <span className="sg-hide-collapsed">{item.label}</span>;
  if (item.sameTab) {
    return (
      <a key={item.to} href={item.to} title={item.label} className={cx("nav-item", mobile && "py-2")} onClick={onClick}>
        {item.icon}
        {label}
      </a>
    );
  }
  if (item.external) {
    return (
      <a key={item.to} href={item.to} title={item.label} target="_blank" rel="noopener noreferrer" className={cx("nav-item", mobile && "py-2")} onClick={onClick}>
        {item.icon}
        {label}
      </a>
    );
  }
  return (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === "/dashboard" || item.to === "/contribute"}
      onClick={onClick}
      title={item.label}
      className={({ isActive }) => cx("nav-item", mobile && "py-2", isActive && "active")}
    >
      {item.icon}
      {label}
    </NavLink>
  );
}

/**
 * One sidebar group. Groups open and close independently, and the parent opens
 * the group of the current route, so deep-linking still shows where you are.
 */
function NavGroup({
  section,
  open,
  active,
  onToggle,
  onNavigate,
  mobile,
}: {
  section: NavGroupDef;
  open: boolean;
  active: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  if (section.items.length === 1) {
    return <NavLeafLink item={section.items[0]} onClick={onNavigate} mobile={mobile} />;
  }
  const listId = `staff-nav-${mobile ? "m-" : ""}${section.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={listId}
        title={section.label}
        className={cx("nav-item w-full", mobile && "py-2", active && "text-slate-100")}
      >
        {section.icon}
        {mobile ? section.label : <span className="sg-hide-collapsed">{section.label}</span>}
        <ChevronRight
          size={14}
          className={cx("ml-auto shrink-0 text-slate-500 transition-transform duration-200", open && "rotate-90", !mobile && "sg-hide-collapsed")}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={listId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={cx("overflow-hidden", !mobile && "sg-hide-collapsed")}
          >
            <div className="ml-[1.1rem] my-0.5 space-y-0.5 border-l border-phantix-700/50 pl-2.5">
              {section.items.map((item) => (
                <NavLeafLink key={item.to} item={item} onClick={onNavigate} mobile={mobile} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Layout() {
  const { session, logout, isAdmin, isEditor, isSuperadmin, isAgiAdmin, isContributor } = useStore();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { collapsed, toggle: toggleSidebar } = useSidebarCollapsed();
  // The launcher and account menus close on a press outside them or on Escape.
  const [launcher, setLauncher] = useState(false);
  const launcherRef = useDismiss(launcher, () => setLauncher(false));
  const [userMenu, setUserMenu] = useState(false);
  const userMenuRef = useDismiss(userMenu, () => setUserMenu(false));
  const [navEl, setNavEl] = useState<HTMLElement | null>(null);
  const navMoreBelow = useMoreBelow(navEl);
  // Phones: bottom tab bar + "More" sheet, page title in the app bar, and data
  // tables rendered as lists.
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = React.useCallback(() => setMoreOpen(false), []);
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null);
  useTableCards(mainEl);
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
  const shortcutLabel = isMac ? "⌘K" : "Ctrl K";

  // Ctrl/⌘+K anywhere opens the palette — the nav is too deep to hunt through.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const location = useLocation();
  // `/weekly/new` and `/weekly/:id` are the full-height editor; the inventory,
  // Issues and Masthead pages scroll normally.
  const editorRoute = /^\/weekly\/(new|\d+)$/.test(location.pathname);
  // The role-filtered groups, shared by the sidebar, the mobile menu and search.
  const sections = useMemo(
    () => visibleNavSections({ isAdmin, isEditor, isSuperadmin, isContributor, isAgiAdmin }),
    [isAdmin, isEditor, isSuperadmin, isContributor, isAgiAdmin],
  );
  // Every group starts open, including groups that appear once the roles load.
  // The operator can close any of them, and landing on a page reopens the group
  // it lives in without closing the others.
  const activeGroup = useMemo(() => activeGroupLabel(sections, location.pathname), [sections, location.pathname]);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(sections.map((s) => s.label)));
  const seenGroups = useRef(new Set(sections.map((s) => s.label)));
  useEffect(() => {
    const fresh = sections.map((s) => s.label).filter((label) => !seenGroups.current.has(label));
    if (fresh.length === 0) return;
    for (const label of fresh) seenGroups.current.add(label);
    setOpenGroups((open) => new Set([...open, ...fresh]));
  }, [sections]);
  useEffect(() => {
    setLauncher(false);
    setUserMenu(false);
  }, [location.pathname]);
  useEffect(() => {
    if (activeGroup) {
      setOpenGroups((open) => (open.has(activeGroup) ? open : new Set(open).add(activeGroup)));
    }
  }, [activeGroup]);
  const renderNav = (mobile: boolean) =>
    sections.map((section) => (
      <NavGroup
        key={section.label}
        section={section}
        open={openGroups.has(section.label)}
        active={activeGroup === section.label}
        onToggle={() =>
          setOpenGroups((open) => {
            const next = new Set(open);
            if (!next.delete(section.label)) next.add(section.label);
            return next;
          })
        }
        mobile={mobile}
      />
    ));

  // The same role-filtered nav the sidebar renders, flattened for search — so
  // the palette can never offer a page this operator cannot open.
  const paletteIndex = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [];
    for (const section of sections) {
      for (const item of section.items) {
        out.push({ to: item.to, label: item.label, icon: item.icon, section: section.label, external: item.external, sameTab: item.sameTab });
      }
    }
    out.push({ to: APP_URL, label: "Launch app", icon: <Globe size={18} />, section: "Shortcuts", external: true });
    return out;
  }, [sections]);

  const openPaletteItem = (item: PaletteItem) => {
    if (item.external) {
      window.open(item.to, "_blank", "noopener,noreferrer");
      return;
    }
    if (item.sameTab) {
      window.location.assign(item.to);
      return;
    }
    navigate(item.to);
  };
  // The app-wide <MotionConfig reducedMotion="user"> (main.tsx) already zeroes
  // out framer-motion's height/opacity tweens for prefers-reduced-motion users;
  // this is a belt-and-suspenders guard so the mobile menu is explicitly (not
  // just incidentally) reduced-motion safe at the one call site that animates
  // `height` directly (Hallmark gate 27).
  const reduceMotion = useReducedMotion();
  const phoneTitle = useStaffTitle(sections);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const roleBadge =
    session?.role === "superadmin" ? "text-severity-critical bg-severity-critical/10 border-severity-critical/30"
    : session?.role === "admin" ? "text-severity-high bg-severity-high/10 border-severity-high/30"
    : session?.role === "contributor" ? "text-gold-300 bg-gold-400/10 border-gold-400/30"
    : "text-severity-low bg-severity-low/10 border-severity-low/30";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        data-collapsed={collapsed ? "" : undefined}
        className={cx(
          "sg-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-phantix-700/30 bg-[rgb(var(--surface-sidebar))] lg:flex",
          collapsed ? "w-[72px]" : "w-[248px]",
        )}
      >
        {/* Brand row: the lockup, the app label, and the collapse control on one line. */}
        <div className="flex h-16 shrink-0 items-center gap-1.5 border-b border-phantix-700/30 px-3">
          <BrandMark className="sg-show-collapsed mx-2 h-8 w-8 shrink-0" />
          <BrandWordmark className="sg-hide-collapsed h-[22px] shrink-0" />
          <span className="sg-hide-collapsed shrink-0 rounded-md border border-gold-400/30 bg-gold-400/10 px-1.5 py-1 text-[11px] font-semibold uppercase leading-none tracking-[0.04em] text-gold-300">
            Staff
          </span>
          <button
            onClick={(e) => {
              toggleSidebar();
              // The rail widens while anything in it has focus, so a mouse click
              // would hold the collapsed rail open. Keyboard users keep focus.
              if (e.detail > 0) e.currentTarget.blur();
            }}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="sg-hide-collapsed ml-auto shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-phantix-800/60 hover:text-slate-100"
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* The list fades out at the bottom edge while more of it is below. */}
        <div className="relative min-h-0 flex-1">
          <nav ref={setNavEl} className="h-full overflow-y-auto px-3 py-4">
            <div className="space-y-0.5">{renderNav(false)}</div>
          </nav>
          <div
            aria-hidden="true"
            className={cx(
              "pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[rgb(var(--surface-sidebar))] to-transparent transition-opacity duration-200",
              navMoreBelow ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
      </aside>

      {/* Main area */}
      <div className={cx("flex min-w-0 flex-1 flex-col overflow-hidden", collapsed ? "lg:ml-[72px]" : "lg:ml-[248px]")}>
        {/* Topbar */}
        <header className="flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-phantix-700/30 bg-phantix-950/60 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:px-6">
          <div className="flex shrink-0 items-center gap-2">
            {/* Launcher: open the product apps. Phones open them from the More sheet. */}
            <div ref={launcherRef} className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setLauncher((v) => !v)}
                title="Open an application"
                aria-label="Open an application"
                aria-haspopup="menu"
                aria-expanded={launcher}
                className="inline-flex rounded-md border border-phantix-700 bg-phantix-900 p-2 text-slate-400 transition-colors hover:border-phantix-600 hover:text-white"
              >
                <Grip size={16} />
              </button>
              {launcher && (
                <div className="absolute left-0 top-full z-50 mt-2 w-56 rounded-md border border-phantix-700 bg-phantix-900 p-1 shadow-card">
                  <a
                    href={APP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setLauncher(false)}
                    className="flex items-center gap-2.5 rounded px-2.5 py-2 text-sm text-slate-300 hover:bg-phantix-800"
                  >
                    <Globe size={15} /> Command Centre
                  </a>
                  <a
                    href={PLATFORM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setLauncher(false)}
                    className="flex items-center gap-2.5 rounded px-2.5 py-2 text-sm text-slate-300 hover:bg-phantix-800"
                  >
                    <LayoutGrid size={15} /> Platform
                  </a>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title={`Search (${shortcutLabel})`}
              aria-label="Search the staff console"
              className="hidden rounded-md border border-phantix-700 bg-phantix-900 p-2 text-slate-400 transition-colors hover:border-phantix-600 hover:text-white sm:inline-flex"
            >
              <Search size={16} />
            </button>
          </div>

          {/* Phone app bar: the current page. */}
          <span className="min-w-0 truncate font-display text-[17px] font-bold text-white md:hidden">{phoneTitle}</span>
          <div className="min-w-0 flex-1" />

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* Phones: theme and sign-out live in the More sheet. */}
            <span className="hidden md:contents">
              <ThemeToggle />
            </span>
            <span className={cx("chip hidden capitalize sm:inline-flex", roleBadge)}>
              {session?.role || "staff"}
            </span>
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  // Phones: the account lives in the More sheet.
                  if (window.matchMedia("(max-width: 767px)").matches) setMoreOpen(true);
                  else setUserMenu((v) => !v);
                }}
                aria-haspopup="menu"
                aria-expanded={userMenu}
                aria-label="Account"
                title={session?.fullName || session?.email || "Account"}
                className="inline-flex rounded-md border border-phantix-700 bg-phantix-900 p-2 text-slate-400 transition-colors hover:border-phantix-600 hover:text-white"
              >
                <UserRound size={16} />
              </button>
              {userMenu && (
                <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-md border border-phantix-700 bg-phantix-900 shadow-card">
                  <div className="border-b border-phantix-700/40 px-4 py-3">
                    <p className="truncate text-sm font-semibold text-slate-100">{session?.fullName || session?.email || "Staff"}</p>
                    {session?.email && <p className="truncate text-xs text-slate-500">{session.email}</p>}
                  </div>
                  <div className="p-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenu(false);
                        handleLogout();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-severity-critical hover:bg-severity-critical/10"
                    >
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main
          ref={setMainEl}
          className={cx(
            "min-w-0 flex-1 overflow-y-auto p-3 pb-[calc(88px+env(safe-area-inset-bottom))] sm:p-4 sm:pb-[calc(88px+env(safe-area-inset-bottom))] lg:p-6",
            // The editor owns its scroll: fill the viewport and scroll the body.
            editorRoute && "flex min-h-0 flex-col",
          )}
        >
          {/* The one content measure for this app: 7xl left wide staff tables
              cramped while their rows scrolled off the bottom. */}
          <div
            className={cx(
              "mx-auto w-full max-w-[1600px]",
              editorRoute && "flex min-h-0 flex-1 flex-col",
            )}
          >
            {/* A page that crashes shows a recovery card; the chrome stays. */}
            <PageErrorBoundary resetKey={location.pathname}>
              <Outlet />
            </PageErrorBoundary>
          </div>
        </main>

        <footer className="hidden shrink-0 flex-wrap items-center justify-between gap-2 border-t border-phantix-700/60 bg-phantix-950/60 px-4 py-3 text-[13px] text-slate-400 lg:flex lg:px-6">
          <span>SecureGraph Staff Portal · internal admin &amp; support console · every action is audited</span>
          <span className="font-mono">API v1 · staff-only</span>
        </footer>
      </div>

      {/* Phone shell */}
      <StaffTabBar nav={sections} moreOpen={moreOpen} onMore={() => setMoreOpen((v) => !v)} />
      <StaffMoreSheet
        open={moreOpen}
        onClose={closeMore}
        nav={sections}
        appUrl={APP_URL}
        onSignOut={handleLogout}
        account={
          <div className="flex items-center gap-3 rounded-2xl border border-phantix-700/50 bg-phantix-900/60 p-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold-400/40 bg-phantix-850 font-display text-base font-bold text-gold-300">
              {(session?.fullName || session?.email || "S").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-100">{session?.fullName || session?.email || "Staff"}</p>
              {session?.email && <p className="truncate text-xs text-slate-500">{session.email}</p>}
            </div>
            <span className={cx("chip shrink-0 capitalize", roleBadge)}>{session?.role || "staff"}</span>
          </div>
        }
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={paletteIndex}
        onNavigate={openPaletteItem}
      />
    </div>
  );
}
