// Staff notifications — the bell in the header.
//
// Every staff alert (new support ticket, data request, feedback, …) lands in
// this feed as well as in the alert email, so it shows here even where mail is
// off. The feed only holds what the caller's role may see.
//   GET  /admin/notifications?limit&unread_only&after_id → { items, unread_count }
//   POST /admin/notifications/{id}/read                  → { marked, unread_count }
//   POST /admin/notifications/read-all                   → { marked, unread_count }
import { api } from "./api";

export interface StaffNotification {
  id: number;
  /** Alert catalog key, e.g. "privacy.request.submitted". */
  kind: string;
  severity: string;
  title: string;
  body: string;
  reference: string | null;
  /** Staff Portal path the notification opens. */
  link: string | null;
  created_at: string | null;
  read_at: string | null;
}

export interface NotificationFeed {
  items: StaffNotification[];
  unread_count: number;
}

export interface MarkResult {
  marked: number;
  unread_count: number;
}

export function listNotifications(limit = 20): Promise<NotificationFeed> {
  return api.get<NotificationFeed>("/admin/notifications", { params: { limit } });
}

export function markNotificationRead(id: number): Promise<MarkResult> {
  return api.post<MarkResult>(`/admin/notifications/${id}/read`);
}

export function markAllNotificationsRead(): Promise<MarkResult> {
  return api.post<MarkResult>("/admin/notifications/read-all");
}

// ── Desktop notifications ────────────────────────────────────────────────────
// While the portal is open in a background tab, new items also raise a system
// notification — only after the person turns it on from the bell.

const DESKTOP_KEY = "staff_desktop_notifications";

export function desktopSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function desktopEnabled(): boolean {
  if (!desktopSupported() || Notification.permission !== "granted") return false;
  try {
    return localStorage.getItem(DESKTOP_KEY) === "on";
  } catch {
    return false;
  }
}

export async function setDesktopEnabled(on: boolean): Promise<boolean> {
  if (!desktopSupported()) return false;
  if (on && Notification.permission !== "granted") {
    const result = await Notification.requestPermission();
    if (result !== "granted") return false;
  }
  try {
    localStorage.setItem(DESKTOP_KEY, on ? "on" : "off");
  } catch {
    /* private window: on for this page only */
  }
  return on;
}

export function showDesktop(item: StaffNotification, onClick: () => void): void {
  if (!desktopEnabled()) return;
  try {
    const n = new Notification(item.title, {
      body: item.body ? item.body.slice(0, 180) : item.reference ?? "",
      tag: `staff-notification-${item.id}`,
      icon: "/favicon.svg",
    });
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}
