// =============================================================================
// ZAMORIN CAFE ERP — NOTIFICATION EVENT STORE
//
// Central, single source of truth for notifications, matching the spec's
// core instruction: "build one central, reusable, event-driven notification
// platform," not a pile of disconnected toasts. Every business action that
// should notify someone (leave submitted, approval decided, critical cash
// variance) calls pushNotification() here — nothing pushes a popup directly.
// The bell, the Notification Centre, and the glass-frost popup queue all
// read from this one list.
// =============================================================================

import { apiGet, apiPatch } from "./apiClient.js";

let seq = 1000;

export const NOTIFICATIONS = [];

export function pushNotification(data) {
  seq += 1;
  const nid = data.id || data.notificationId || `NE-${seq}`;
  const full = {
    id: nid,
    notificationId: data.notificationId || nid,
    read: Boolean(data.read || data.status === "READ" || data.readAt),
    delivered: Boolean(data.delivered),
    createdAt: data.createdAt ? (typeof data.createdAt === 'string' ? new Date(data.createdAt).getTime() : data.createdAt) : Date.now(),
    actionRequired: Boolean(data.actionRequired || data.acknowledgementRequired),
    popupEligible: false,
    severity: data.severity || (data.priority === "CRITICAL" ? "critical" : data.priority === "HIGH" ? "high" : "info"),
    recipientRoles: data.recipientRoles || (data.recipientRole ? [data.recipientRole] : ["ALL"]),
    title: data.title || "System Notification",
    message: data.message || "",
    deepLink: data.deepLink || (data.category === "APPROVAL" ? "#approvals" : (data.category === "PROCUREMENT" ? "#procurement" : "")),
    ...data,
  };

  const existingIdx = NOTIFICATIONS.findIndex((n) => n.id === full.id);
  if (existingIdx >= 0) {
    NOTIFICATIONS[existingIdx] = { ...NOTIFICATIONS[existingIdx], ...full };
  } else {
    NOTIFICATIONS.unshift(full);
  }
  return full;
}

export async function syncNotificationsFromServer() {
  try {
    const res = await apiGet("/notifications?limit=25");
    const list = res?.data?.notifications || res?.notifications || (Array.isArray(res?.data) ? res.data : []);
    if (Array.isArray(list)) {
      list.forEach((n) => {
        pushNotification({
          id: n.notificationId || n._id,
          notificationId: n.notificationId,
          title: n.title,
          message: n.message,
          read: Boolean(n.readAt || n.status === "READ"),
          status: n.status,
          createdAt: n.createdAt,
          priority: n.priority,
          category: n.category,
          actionRequired: Boolean(n.acknowledgementRequired),
          recipientRoles: [n.recipientRole || "ALL"],
          deepLink: n.category === "APPROVAL" ? "#approvals" : (n.category === "PROCUREMENT" ? "#procurement" : ""),
        });
      });
    }
  } catch (err) {
    // Offline or network error: silent fallback to existing in-memory store
  }
}

export function forRole(role) {
  const normRole = String(role || "").toUpperCase();
  return NOTIFICATIONS.filter((n) => {
    if (!n.recipientRoles || !n.recipientRoles.length) return true;
    return n.recipientRoles.some((r) => r === "ALL" || String(r).toUpperCase() === normRole);
  });
}

export function unreadCount(role) {
  return forRole(role).filter((n) => !n.read).length;
}

export function undeliveredPopups(role) {
  return forRole(role).filter((n) => n.popupEligible && !n.delivered);
}

export async function markRead(id) {
  const n = NOTIFICATIONS.find((x) => x.id === id);
  if (n) n.read = true;
  if (id && !String(id).startsWith("NE-")) {
    try {
      await apiPatch(`/notifications/${id}/read`);
    } catch {}
  }
}

export async function markAllRead(role) {
  forRole(role).forEach((n) => (n.read = true));
  try {
    await apiPatch("/notifications/read-all");
  } catch {}
}

export function markDelivered(id) {
  const n = NOTIFICATIONS.find((x) => x.id === id);
  if (n) n.delivered = true;
}

export function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
