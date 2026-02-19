import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/types/notification";

export async function getUserNotifications(userId: string, limit = 50) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return { data: (data as Notification[]) || [], error: error?.message || null };
}

export async function getUnreadCount(userId: string) {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  return { data: count ?? 0, error: error?.message || null };
}

export async function markAsRead(notificationId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId);

  return { success: !error, error: error?.message || null };
}

export async function markAllAsRead(userId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  return { success: !error, error: error?.message || null };
}

export async function createNotification(data: {
  userId: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createClient();
  const { data: notif, error } = await supabase
    .from("notifications")
    .insert([{
      user_id: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      metadata: data.metadata || {},
      is_read: false,
    }])
    .select()
    .single();

  return { data: notif as Notification | null, error: error?.message || null };
}
