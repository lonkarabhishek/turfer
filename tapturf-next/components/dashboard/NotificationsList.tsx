"use client";

import { useState, useEffect } from "react";
import { Bell, Check, Gamepad2, UserPlus, XCircle } from "lucide-react";
import { getUserNotifications, markAsRead, markAllAsRead } from "@/lib/queries/notifications";
import type { Notification } from "@/types/notification";

const ICON_MAP: Record<string, typeof Bell> = {
  game_request: UserPlus,
  game_request_accepted: Check,
  game_request_declined: XCircle,
};

export function NotificationsList({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, [userId]);

  const loadNotifications = async () => {
    setLoading(true);
    const { data } = await getUserNotifications(userId);
    setNotifications(data);
    setLoading(false);
  };

  const handleMarkRead = async (id: string) => {
    await markAsRead(id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead(userId);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border border-gray-200 rounded-xl p-4 animate-pulse">
            <div className="w-2/3 h-5 bg-gray-200 rounded mb-2" />
            <div className="w-full h-4 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="text-center py-12">
        <Bell className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">No notifications yet</p>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div>
      {unreadCount > 0 && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">{unreadCount} unread</p>
          <button
            onClick={handleMarkAllRead}
            className="text-xs text-gray-900 font-medium underline"
          >
            Mark all as read
          </button>
        </div>
      )}

      <div className="space-y-2">
        {notifications.map((notif) => {
          const Icon = ICON_MAP[notif.type] || Bell;
          return (
            <button
              key={notif.id}
              onClick={() => !notif.is_read && handleMarkRead(notif.id)}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                notif.is_read
                  ? "border-gray-100 bg-white"
                  : "border-gray-200 bg-gray-50 hover:bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 p-2 rounded-full ${
                  notif.is_read ? "bg-gray-100" : "bg-gray-900"
                }`}>
                  <Icon className={`w-4 h-4 ${notif.is_read ? "text-gray-500" : "text-white"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${notif.is_read ? "text-gray-700" : "text-gray-900 font-medium"}`}>
                    {notif.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{notif.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(notif.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {!notif.is_read && (
                  <div className="w-2 h-2 bg-accent-500 rounded-full mt-2 flex-shrink-0" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
