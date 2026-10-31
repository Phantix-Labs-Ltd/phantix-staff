import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Monitor } from "lucide-react";
import { useStore } from "@/lib/store";
import { useSmartPoll } from "@/lib/usePolling";
import { useDismiss } from "@/lib/useDismiss";
import { cx, formatDateTime, timeAgo } from "@/lib/utils";
import {
  desktopEnabled, desktopSupported, listNotifications, markAllNotificationsRead,
  markNotificationRead, setDesktopEnabled, showDesktop, type StaffNotification,
} from "@/lib/notifications";

// The header bell. Polls the staff feed; anything new since the last poll pops
// up as a toast (and as a system notification when the tab is in the
// background and desktop alerts are on). The badge is the unread count.

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-severity-critical",
  high: "bg-severity-high",
  medium: "bg-gold-400",
  low: "bg-severity-low",
  info: "bg-slate-500",
};

const BASE_TITLE = typeof document !== "undefined" ? document.title : "";

export function NotificationBell() {
  const { toast } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StaffNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [desktop, setDesktop] = useState(desktopEnabled);
  // Highest id already shown, so only genuinely new rows pop up. Null until
  // the first load: what is there when the page opens is not "new".
  const newest = useRef<number | null>(null);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));

  const go = useCallback(
    (item: StaffNotification) => {
      setOpen(false);
      if (!item.read_at) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read_at: new Date().toISOString() } : i)));
        markNotificationRead(item.id)
          .then((r) => setUnread(r.unread_count))
          .catch(() => undefined);
      }
      if (item.link) navigate(item.link);
    },
    [navigate],
  );

  const load = useCallback(async () => {
    try {
      const feed = await listNotifications(20);
      setItems(feed.items);
      setUnread(feed.unread_count);
      setLoaded(true);
      const top = feed.items[0]?.id ?? 0;
      if (newest.current !== null) {
        const fresh = feed.items.filter((i) => i.id > (newest.current ?? 0) && !i.read_at).reverse();
        for (const item of fresh.slice(-3)) {
          toast(item.severity === "high" || item.severity === "critical" ? "warning" : "info", item.title, item.reference ?? undefined);
          if (document.visibilityState !== "visible") showDesktop(item, () => go(item));
        }
      }
      newest.current = Math.max(newest.current ?? 0, top);
    } catch {
      // A failed poll keeps the last feed; the next one retries.
    }
  }, [toast, go]);

  useSmartPoll(load, { intervalMs: 20_000, hiddenIntervalMs: 30_000 });

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [unread]);

  const readAll = async () => {
    try {
      const r = await markAllNotificationsRead();
      setUnread(r.unread_count);
      const now = new Date().toISOString();
      setItems((prev) => prev.map((i) => (i.read_at ? i : { ...i, read_at: now })));
    } catch (e) {
      toast("error", "Could not mark notifications read", e instanceof Error ? e.message : undefined);
    }
  };

  const toggleDesktop = async () => {
    const next = await setDesktopEnabled(!desktop);
    setDesktop(next);
    if (!desktop && !next) {
      toast("warning", "Desktop alerts are blocked", "Allow notifications for this site in your browser settings.");
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
        className="relative inline-flex rounded-md border border-phantix-700 bg-phantix-900 p-2 text-slate-400 transition-colors hover:border-phantix-600 hover:text-white"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-severity-critical px-1 font-mono text-[10px] font-bold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="fixed inset-x-3 top-[calc(4rem+env(safe-area-inset-top))] z-50 overflow-hidden rounded-md border border-phantix-700 bg-phantix-900 shadow-card sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px]"
        >
          <div className="flex items-center justify-between border-b border-phantix-700/40 px-4 py-3">
            <p className="text-sm font-semibold text-slate-100">
              Notifications
              {unread > 0 && <span className="ml-2 font-mono text-xs text-slate-500">{unread} unread</span>}
            </p>
            <button
              type="button"
              onClick={() => void readAll()}
              disabled={unread === 0}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 hover:bg-phantix-800 hover:text-white disabled:pointer-events-none disabled:opacity-40"
            >
              <CheckCheck size={13} /> Mark all read
            </button>
          </div>

          <div className="max-h-[min(60vh,440px)] overflow-y-auto">
            {!loaded ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Nothing yet. New support tickets, data requests and other alerts show here.
              </p>
            ) : (
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => go(item)}
                      className={cx(
                        "flex w-full gap-3 border-b border-phantix-800/50 px-4 py-3 text-left transition-colors hover:bg-phantix-800/60",
                        !item.read_at && "bg-gold-400/[0.04]",
                      )}
                    >
                      <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[item.severity] ?? SEVERITY_DOT.info)} />
                      <span className="min-w-0 flex-1">
                        <span className={cx("block text-[13px] leading-5", item.read_at ? "text-slate-300" : "font-semibold text-slate-100")}>
                          {item.title}
                        </span>
                        {item.body && <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-slate-400">{item.body}</span>}
                        <span className="mt-1 block text-[11px] text-slate-500" title={formatDateTime(item.created_at)}>
                          {timeAgo(item.created_at)}
                          {item.reference && <span className="font-mono"> · {item.reference}</span>}
                        </span>
                      </span>
                      {!item.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold-400" aria-label="Unread" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {desktopSupported() && (
            <div className="flex items-center justify-between gap-3 border-t border-phantix-700/40 px-4 py-2.5">
              <span className="flex items-center gap-2 text-xs text-slate-400">
                <Monitor size={13} /> Desktop alerts when this tab is in the background
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={desktop}
                aria-label="Desktop alerts"
                onClick={() => void toggleDesktop()}
                className={cx(
                  "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
                  desktop ? "border-gold-400/60 bg-gold-400/30" : "border-phantix-600 bg-phantix-800",
                )}
              >
                <span
                  className={cx(
                    "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all",
                    desktop ? "left-[18px] bg-gold-300" : "left-0.5 bg-slate-500",
                  )}
                />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
