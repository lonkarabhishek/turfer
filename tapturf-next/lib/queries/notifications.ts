import { gameProblem, markReadCall, notificationsCall, unreadCall, type GetToken } from "@/lib/games/client";
import type { Notification } from "@/types/notification";

// The signed-in caller's own notifications, through /api/notifications
// (lib/games/server.ts): the database lets nobody read or mark anyone
// else's, and only the server's actions make them. Pass useAuth().getToken.

export async function getUserNotifications(getToken: GetToken, limit = 50) {
  const a = await notificationsCall(getToken, limit);
  const b = a.body as { notifications?: Notification[] };
  if (a.status === 200 && Array.isArray(b.notifications)) return { data: b.notifications, error: null };
  return { data: [] as Notification[], error: gameProblem(a) };
}

/**
 * How many are unread, for the header's badge. A sign-in that is gone
 * counts 0 (nothing to show); offline or failing is an error, so the
 * poll backs off.
 */
export async function getUnreadCount(getToken: GetToken) {
  const a = await unreadCall(getToken);
  const b = a.body as { unread?: number };
  if (a.status === 200 && typeof b.unread === "number") return { data: b.unread, error: null };
  if (a.status === 401) return { data: 0, error: null };
  return { data: 0, error: gameProblem(a) ?? "unavailable" };
}

export async function markAsRead(getToken: GetToken, notificationId: string) {
  const a = await markReadCall(getToken, notificationId);
  return { success: a.status === 200, error: a.status === 200 ? null : gameProblem(a) };
}

export async function markAllAsRead(getToken: GetToken) {
  const a = await markReadCall(getToken, "all");
  return { success: a.status === 200, error: a.status === 200 ? null : gameProblem(a) };
}
