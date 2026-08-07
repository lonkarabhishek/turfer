"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Bell, Check, UserPlus, XCircle } from "lucide-react";
import { getUserNotifications, markAsRead, markAllAsRead } from "@/lib/queries/notifications";
import type { Notification } from "@/types/notification";

const ICON_MAP: Record<string, typeof Bell> = {
  game_request: UserPlus,
  game_request_accepted: Check,
  game_request_declined: XCircle,
};

/**
 * Reads a game id off a notification's metadata. Older rows stored
 * either { gameId } or { game_id }; be tolerant of both.
 */
function gameIdOf(notif: Notification): string | null {
  const meta = notif.metadata as Record<string, unknown> | null | undefined;
  if (!meta) return null;
  const v = meta.gameId ?? meta.game_id;
  return typeof v === "string" ? v : null;
}

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
          <div key={i} className="border border-primary-200 rounded-2xl p-4 animate-pulse bg-white">
            <div className="w-2/3 h-5 bg-primary-100 rounded mb-2" />
            <div className="w-full h-4 bg-primary-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="text-center py-14">
        <div className="w-14 h-14 bg-accent-50 border border-accent-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Bell className="w-6 h-6 text-accent-600" />
        </div>
        <p className="text-[15px] font-semibold text-primary-800 mb-1">All caught up</p>
        <p className="text-[13px] text-primary-500 mb-6">You&apos;ll hear from us when someone joins or accepts your game</p>
        <Link
          href="/games"
          className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-bold uppercase tracking-wide px-5 py-3 rounded-full transition-colors shadow-neon focus-neon"
        >
          Find a game
        </Link>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div>
      {unreadCount > 0 && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-[13px] font-semibold text-primary-500">
            <span className="text-accent-600">{unreadCount}</span> unread
          </p>
          <button
            onClick={handleMarkAllRead}
            className="text-[11px] font-semibold uppercase tracking-widest text-primary-500 hover:text-accent-600 transition-colors"
          >
            Mark all read
          </button>
        </div>
      )}

      <div className="space-y-2">
        {notifications.map((notif) => {
          const Icon = ICON_MAP[notif.type] || Bell;
          const gameId = gameIdOf(notif);

          const inner = (
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 p-2 rounded-full ${
                notif.is_read ? "bg-primary-100" : "bg-accent-500 shadow-neon"
              }`}>
                <Icon className={`w-4 h-4 ${notif.is_read ? "text-primary-500" : "text-white"}`} strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[14px] ${notif.is_read ? "text-primary-700" : "text-primary-800 font-semibold"}`}>
                  {notif.title}
                </p>
                <p className="text-[12px] text-primary-500 mt-0.5">{notif.message}</p>
                <p className="text-[11px] text-primary-400 mt-1 font-mono">
                  {new Date(notif.created_at).toLocaleDateString("en-IN", {
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
          );

          const cardClass = `block w-full text-left p-4 rounded-2xl border transition-colors ${
            notif.is_read
              ? "border-primary-200 bg-white hover:border-primary-300"
              : "border-accent-500/30 bg-accent-50 hover:border-accent-500"
          }`;

          // If the notification points at a game, tap opens that game.
          // Otherwise it's still tappable to mark as read.
          if (gameId) {
            return (
              <Link
                key={notif.id}
                href={`/game/${gameId}`}
                onClick={() => { if (!notif.is_read) handleMarkRead(notif.id); }}
                className={cardClass}
              >
                {inner}
              </Link>
            );
          }
          return (
            <button
              key={notif.id}
              onClick={() => !notif.is_read && handleMarkRead(notif.id)}
              className={cardClass}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}
