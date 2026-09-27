import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard, Shield, Building2, MessageSquare, Server, Brain,
  Users, FileCheck, Wrench, Search, Activity, LogOut, Menu, X,
  Zap, Globe, AlertTriangle, ScanLine, BarChart3, RefreshCw,
  Crosshair, Radio, FileText, TerminalSquare, Radar, BookOpen, FlaskConical,
  ScrollText, Mail, Layers, Inbox, Sparkles, FileCode2, ChevronDown, MoreHorizontal, Newspaper,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { APP_URL } from "@/lib/links";
import { cx } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AGI_ENABLED } from "@/lib/api";
import { BrandWordmark } from "@/components/BrandLogo";

type NavLeafItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  superadminOnly?: boolean;
  contributorOnly?: boolean;
  agiOnly?: boolean;
  external?: boolean;
  // Open in the same tab (keeps sessionStorage, e.g. the API Reference page
  // needs the staff token). Use instead of `external` for token-bearing pages.
  sameTab?: boolean;
};
type NavDropdownItem = {
  type: "dropdown";
  label: string;
  icon: React.ReactNode;
  items: NavLeafItem[];
};
type NavEntry = NavLeafItem | NavDropdownItem;

const moreContributeSubItems: NavLeafItem[] = [
  { to: "/contribute/knowledge", label: "Knowledge", icon: <BookOpen size={18} />, contributorOnly: true },
  { to: "/contribute/skills", label: "Skills", icon: <Brain size={18} />, contributorOnly: true },
  { to: "/contribute/capabilities", label: "YAML packs", icon: <FileCode2 size={18} />, contributorOnly: true },
  { to: "/contribute/engines", label: "Engines", icon: <Layers size={18} />, contributorOnly: true },
  { to: "/contribute/learning", label: "Learning inbox", icon: <Inbox size={18} />, contributorOnly: true },
  { to: "/architecture", label: "Atlas", icon: <Layers size={18} />, contributorOnly: true },
];

const moreMonitorSubItems: NavLeafItem[] = [
  { to: "/scanner-tools", label: "Scanner Tools", icon: <ScanLine size={18} /> },
  { to: "/bus", label: "Event Bus", icon: <Radio size={18} /> },
  { to: "/demo-requests", label: "Demo Requests", icon: <Inbox size={18} /> },
  { to: "/api-docs.html", label: "API Reference", icon: <BookOpen size={18} />, external: true, sameTab: true },
];

const moreCatalogsSubItems: NavLeafItem[] = [
  { to: "/soc-provisioning", label: "SOC Provisioning", icon: <Shield size={18} /> },
  { to: "/discovery", label: "Discovery", icon: <Search size={18} /> },
  { to: "/experience", label: "Experience", icon: <Zap size={18} /> },
  { to: "/email-templates", label: "Email Templates", icon: <Mail size={18} /> },
  { to: "/legal-documents", label: "Legal Documents", icon: <ScrollText size={18} /> },
];

const moreOperationsSubItems: NavLeafItem[] = [
  { to: "/engine-jobs", label: "Engine Jobs", icon: <Activity size={18} />, superadminOnly: true },
  { to: "/terminal", label: "Terminal", icon: <TerminalSquare size={18} />, superadminOnly: true },
  { to: "/staff", label: "Staff Users", icon: <Users size={18} />, superadminOnly: true },
];

const navSections: {
  label: string;
  role: "all" | "admin" | "superadmin" | "contributor";
  items: NavEntry[];
}[] = [
  {
    label: "Overview",
    role: "all",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
      { to: "/clients", label: "Clients", icon: <Building2 size={18} />, adminOnly: true },
      { to: "/sandbox", label: "Sandbox", icon: <FlaskConical size={18} />, adminOnly: true },
      { to: "/support", label: "Support", icon: <MessageSquare size={18} /> },
    ],
  },
  {
    label: "Contribute",
    role: "contributor",
    items: [
      { to: "/contribute", label: "Workspace", icon: <Sparkles size={18} />, contributorOnly: true },
      { type: "dropdown", label: "More Contribute", icon: <MoreHorizontal size={18} />, items: moreContributeSubItems },
    ],
  },
  {
    label: "Monitor",
    role: "admin",
    items: [
      { to: "/logs", label: "Logs", icon: <FileText size={18} /> },
      { to: "/server", label: "Server", icon: <Server size={18} /> },
      { to: "/services", label: "Services", icon: <Activity size={18} /> },
      { to: "/analytics", label: "Analytics", icon: <BarChart3 size={18} /> },
      { to: "/architecture", label: "Architecture", icon: <Layers size={18} /> },
      { type: "dropdown", label: "More Monitor", icon: <MoreHorizontal size={18} />, items: moreMonitorSubItems },
    ],
  },
  {
    label: "Catalogs",
    role: "admin",
    items: [
      { to: "/compliance", label: "Compliance", icon: <FileCheck size={18} /> },
      { to: "/tooling", label: "Tooling", icon: <Wrench size={18} /> },
      { to: "/weekly", label: "The Weekly", icon: <Newspaper size={18} /> },
      { type: "dropdown", label: "More Catalogs", icon: <MoreHorizontal size={18} />, items: moreCatalogsSubItems },
    ],
  },
  {
    label: "Advanced",
    role: "admin",
    items: [
      { to: "/ai", label: "AI Admin", icon: <Brain size={18} /> },
      { to: "/agent-activity", label: "Agent activity", icon: <Activity size={18} /> },
      { to: "/vapt-admin", label: "VAPT Admin", icon: <Crosshair size={18} /> },
    ],
  },
  {
    label: "Autonomous Agent",
    role: "admin",
    items: [
      { to: "/agi", label: "Agent Management", icon: <Radar size={18} />, agiOnly: true },
    ],
  },
  {
    label: "Operations",
    role: "superadmin",
    items: [
      { to: "/super-logs", label: "Centralized Logs", icon: <FileText size={18} />, superadminOnly: true },
      { to: "/billing", label: "Billing", icon: <BarChart3 size={18} />, superadminOnly: true },
      { type: "dropdown", label: "More Operations", icon: <MoreHorizontal size={18} />, items: moreOperationsSubItems },
    ],
  },
];

/** True when at least one role flag on `item` is set and satisfied by the caller's roles. */
function isItemVisible(
  item: NavLeafItem,
  roles: { isAdmin: boolean; isSuperadmin: boolean; isContributor: boolean; isAgiAdmin: boolean },
): boolean {
  if (item.superadminOnly && !roles.isSuperadmin) return false;
  if (item.adminOnly && !roles.isAdmin) return false;
  if (item.contributorOnly && !roles.isContributor) return false;
  if (item.agiOnly && (!roles.isAgiAdmin || !AGI_ENABLED)) return false;
  return true;
}

/** Resolve a section's items to what's visible for the caller's roles, folding
 *  each dropdown down to only its visible sub-items (dropping it entirely if
 *  none remain). */
function visibleNavEntries(
  items: NavEntry[],
  roles: { isAdmin: boolean; isSuperadmin: boolean; isContributor: boolean; isAgiAdmin: boolean },
): NavEntry[] {
  const out: NavEntry[] = [];
  for (const item of items) {
    if ("type" in item && item.type === "dropdown") {
      const visibleSub = item.items.filter((sub) => isItemVisible(sub, roles));
      if (visibleSub.length) out.push({ ...item, items: visibleSub });
    } else if (isItemVisible(item as NavLeafItem, roles)) {
      out.push(item);
    }
  }
  return out;
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
      end={item.to === "/dashboard"}
      onClick={onClick}
      className={({ isActive }) => cx("nav-item", mobile && "py-2", isActive && "active")}
    >
      {item.icon}
      {item.label}
    </NavLink>
  );
}

/**
 * Collapsible nav group. Opens itself whenever the current route is inside the
 * group, so deep-linking to a sub-page still shows where you are.
 */
function NavDropdown({ label, icon, items, onNavigate, mobile }: NavDropdownItem & { onNavigate?: () => void; mobile?: boolean }) {
  const location = useLocation();
  const groupActive = items.some((i) => location.pathname === i.to);
  const [open, setOpen] = useState(groupActive);

  useEffect(() => {
    if (groupActive) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cx("nav-item w-full justify-between", mobile && "py-2", groupActive && "active")}
      >
        <span className="flex items-center gap-3">
          {icon}
          {label}
        </span>
        <ChevronDown size={14} className={cx("text-slate-500 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-7 mt-0.5 space-y-0.5 border-l border-phantix-700/50 pl-2.5">
              {items.map((sub) => (
                <NavLeafLink key={sub.to} item={sub} onClick={onNavigate} mobile={mobile} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Layout() {
  const { session, logout, isAdmin, isSuperadmin, isAgiAdmin, isContributor } = useStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
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

        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1.5">
          {navSections.map((section) => {
            if (section.role === "admin" && !isAdmin) return null;
            if (section.role === "superadmin" && !isSuperadmin) return null;
            if (section.role === "contributor" && !isContributor) return null;
            const visibleItems = visibleNavEntries(section.items, { isAdmin, isSuperadmin, isContributor, isAgiAdmin });
            if (!visibleItems.length) return null;

            return (
              <div key={section.label}>
                <p className="nav-section-label">
                  {section.label}
                </p>
                {visibleItems.map((item) => {
                  if ("type" in item && item.type === "dropdown") {
                    return <NavDropdown key={item.label} {...item} />;
                  }
                  const leaf = item as NavLeafItem;
                  return <NavLeafLink key={leaf.to} item={leaf} />;
                })}
              </div>
            );
          })}

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
            <nav className="px-4 py-3 space-y-2">
              {navSections.map((section) => {
                if (section.role === "admin" && !isAdmin) return null;
                if (section.role === "superadmin" && !isSuperadmin) return null;
                if (section.role === "contributor" && !isContributor) return null;
                const visibleItems = visibleNavEntries(section.items, { isAdmin, isSuperadmin, isContributor, isAgiAdmin });
                if (!visibleItems.length) return null;
                return (
                  <div key={section.label} className="mb-3">
                    <p className="nav-section-label">{section.label}</p>
                    {visibleItems.map((item) => {
                      if ("type" in item && item.type === "dropdown") {
                        return <NavDropdown key={item.label} {...item} onNavigate={() => setMenuOpen(false)} mobile />;
                      }
                      const leaf = item as NavLeafItem;
                      return <NavLeafLink key={leaf.to} item={leaf} onClick={() => setMenuOpen(false)} mobile />;
                    })}
                  </div>
                );
              })}
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
    </div>
  );
}
