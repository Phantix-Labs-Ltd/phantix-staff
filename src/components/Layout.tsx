import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard, Shield, Building2, MessageSquare, MessageSquareWarning, Server, Brain,
  Users, FileCheck, Wrench, Search, Activity, LogOut, Menu, X,
  Zap, Globe, AlertTriangle, ScanLine, BarChart3, RefreshCw,
  Crosshair, Radio, FileText, TerminalSquare, Radar, BookOpen, FlaskConical,
  ScrollText, Mail, Layers, Inbox, Sparkles, FileCode2, ChevronDown, Newspaper,
  BellRing,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { APP_URL } from "@/lib/links";
import { cx } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AGI_ENABLED } from "@/lib/api";
import { BrandWordmark } from "@/components/BrandLogo";
import CommandPalette, { type PaletteItem } from "@/components/CommandPalette";

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
      { to: "/contribute/capabilities", label: "YAML packs", icon: <FileCode2 size={18} />, contributorOnly: true },
      { to: "/contribute/engines", label: "Engines", icon: <Layers size={18} />, contributorOnly: true },
      { to: "/contribute/learning", label: "Learning inbox", icon: <Inbox size={18} />, contributorOnly: true },
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
      { to: "/bus", label: "Event Bus", icon: <Radio size={18} /> },
      { to: "/scanner-tools", label: "Scanner Tools", icon: <ScanLine size={18} /> },
    ],
  },
  {
    label: "Insights",
    icon: <BarChart3 size={18} />,
    role: "admin",
    items: [
      { to: "/analytics", label: "Analytics", icon: <BarChart3 size={18} /> },
      { to: "/feedback", label: "Feedback", icon: <MessageSquareWarning size={18} /> },
      { to: "/demo-requests", label: "Demo Requests", icon: <Inbox size={18} /> },
      { to: "/architecture", label: "Architecture", icon: <Layers size={18} /> },
      { to: "/api-docs.html", label: "API Reference", icon: <BookOpen size={18} />, external: true, sameTab: true },
    ],
  },
  {
    label: "Editorial",
    icon: <Newspaper size={18} />,
    role: "editor",
    items: [
      { to: "/weekly", label: "The Weekly", icon: <Newspaper size={18} /> },
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
      { to: "/soc-provisioning", label: "SOC Provisioning", icon: <Shield size={18} /> },
      { to: "/discovery", label: "Discovery", icon: <Search size={18} /> },
      { to: "/experience", label: "Experience", icon: <Zap size={18} /> },
      { to: "/email-templates", label: "Email Templates", icon: <Mail size={18} /> },
      { to: "/legal-documents", label: "Legal Documents", icon: <ScrollText size={18} /> },
    ],
  },
  {
    label: "AI and agents",
    icon: <Brain size={18} />,
    role: "admin",
    items: [
      { to: "/ai", label: "AI Admin", icon: <Brain size={18} /> },
      { to: "/agent-activity", label: "Agent activity", icon: <Activity size={18} /> },
      { to: "/vapt-admin", label: "VAPT Admin", icon: <Crosshair size={18} /> },
      { to: "/agi", label: "Agent Management", icon: <Radar size={18} />, agiOnly: true },
    ],
  },
  {
    label: "Operations",
    icon: <Radar size={18} />,
    role: "superadmin",
    items: [
      { to: "/overwatch", label: "Overwatch", icon: <Radar size={18} />, superadminOnly: true },
      { to: "/super-logs", label: "Centralized Logs", icon: <FileText size={18} />, superadminOnly: true },
      { to: "/billing", label: "Billing", icon: <BarChart3 size={18} />, superadminOnly: true },
      { to: "/internal-alerts", label: "Internal Alerts", icon: <BellRing size={18} />, superadminOnly: true },
      { to: "/engine-jobs", label: "Engine Jobs", icon: <Activity size={18} />, superadminOnly: true },
      { to: "/terminal", label: "Terminal", icon: <TerminalSquare size={18} />, superadminOnly: true },
      { to: "/staff", label: "Staff Users", icon: <Users size={18} />, superadminOnly: true },
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

function NavLeafLink({ item, onClick, mobile }: { item: NavLeafItem; onClick?: () => void; mobile?: boolean }) {
  if (item.sameTab) {
    return (
      <a key={item.to} href={item.to} className={cx("nav-item", mobile && "py-2")} onClick={onClick}>
        {item.icon}
        {item.label}
      </a>
    );
  }
  if (item.external) {
    return (
      <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer" className={cx("nav-item", mobile && "py-2")} onClick={onClick}>
        {item.icon}
        {item.label}
      </a>
    );
  }
  return (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === "/dashboard" || item.to === "/contribute"}
      onClick={onClick}
      className={({ isActive }) => cx("nav-item", mobile && "py-2", isActive && "active")}
    >
      {item.icon}
      {item.label}
    </NavLink>
  );
}

/**
 * One sidebar group. The parent keeps one group open at a time and opens the
 * group of the current route, so deep-linking still shows where you are.
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
        className={cx("nav-item w-full", mobile && "py-2", active && "text-slate-100")}
      >
        {section.icon}
        {section.label}
        <ChevronDown size={14} className={cx("ml-auto shrink-0 text-slate-500 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={listId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-[1.1rem] mt-0.5 space-y-0.5 border-l border-phantix-700/50 pl-2">
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
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
  // The role-filtered groups, shared by the sidebar, the mobile menu and search.
  const sections = useMemo(
    () => visibleNavSections({ isAdmin, isEditor, isSuperadmin, isContributor, isAgiAdmin }),
    [isAdmin, isEditor, isSuperadmin, isContributor, isAgiAdmin],
  );
  // One group open at a time; landing on a page opens the group it lives in.
  const activeGroup = useMemo(() => activeGroupLabel(sections, location.pathname), [sections, location.pathname]);
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroup);
  useEffect(() => {
    if (activeGroup) setOpenGroup(activeGroup);
  }, [activeGroup]);
  const renderNav = (mobile: boolean) =>
    sections.map((section) => (
      <NavGroup
        key={section.label}
        section={section}
        open={openGroup === section.label}
        active={activeGroup === section.label}
        onToggle={() => setOpenGroup((g) => (g === section.label ? null : section.label))}
        onNavigate={mobile ? () => setMenuOpen(false) : undefined}
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
      <aside className="hidden lg:flex w-[248px] shrink-0 flex-col border-r border-phantix-700/30 bg-[rgb(var(--surface-sidebar))]">
        <div className="flex h-16 items-center gap-3 px-5 border-b border-phantix-700/30">
          <BrandWordmark className="h-8" />
          <div>
            <p className="font-display text-sm font-bold text-white tracking-tight">Staff Portal</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5">
          {renderNav(false)}

          {/* Launch app */}
          <div className="px-3">
            <a
              href={APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="nav-item text-phantix-300"
            >
              <Globe size={18} />
              Launch App
            </a>
          </div>
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-phantix-700/30 bg-phantix-950/60 backdrop-blur-xl px-4 lg:px-6">
          <button
            className="lg:hidden rounded-lg p-2 text-slate-400 hover:bg-phantix-800/70 hover:text-white"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-2 hidden items-center gap-2 rounded-lg border border-phantix-700/60 bg-phantix-900/60 px-3 py-2 text-sm text-slate-400 transition-colors hover:border-phantix-600 hover:text-slate-200 sm:flex"
            aria-label="Search the staff console"
          >
            <Search size={15} />
            <span>Search…</span>
            <kbd className="ml-1 rounded border border-phantix-600/60 bg-phantix-850 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-500">
              {shortcutLabel}
            </kbd>
          </button>

          <div className="min-w-0 flex-1" />

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <span className={cx("chip hidden capitalize sm:inline-flex", roleBadge)}>
              {session?.role || "staff"}
            </span>
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-slate-200">{session?.fullName || session?.email}</p>
              {session?.email && <p className="text-xs text-slate-500">{session.email}</p>}
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg p-2 text-slate-400 hover:bg-phantix-800/70 hover:text-severity-critical transition-colors"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Mobile menu */}
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 top-16 z-50 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-phantix-700/30 bg-phantix-950/98 shadow-card lg:hidden"
          >
            <nav className="px-4 py-3 space-y-0.5">
              {renderNav(true)}
            </nav>
          </motion.div>
        )}

        {/* Page content */}
        <main className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          {/* The one content measure for this app: 7xl left wide staff tables
              cramped while their rows scrolled off the bottom. */}
          <div className="mx-auto w-full max-w-[1600px]">
            <Outlet />
          </div>
        </main>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-phantix-700/60 bg-phantix-950/60 px-4 py-3 text-[13px] text-slate-400 lg:px-6">
          <span>SecureGraph Staff Portal · internal admin &amp; support console · every action is audited</span>
          <span className="font-mono">API v1 · staff-only</span>
        </footer>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={paletteIndex}
        onNavigate={openPaletteItem}
      />
    </div>
  );
}
