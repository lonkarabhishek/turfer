"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlarmClock, Bell, CalendarCheck, CalendarClock, CalendarPlus, CalendarX, Check, ChevronRight, Hourglass, Info, MapPin, Store, UserCheck, UserMinus, UserPlus, XCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { quietToken } from "@/lib/account/client";
import { getUserNotifications, markAsRead, markAllAsRead } from "@/lib/queries/notifications";
import { answerTag } from "@/lib/queries/games";
import { TAG_COPY } from "@/lib/games/confirmed";
import { CLAIM_APPROVED, CLAIM_REJECTED, notificationLink } from "@/lib/my/claimNotice";
import type { Notification } from "@/types/notification";

const ICON_MAP: Record<string, typeof Bell> = {
  game_request: UserPlus,
  game_request_accepted: Check,
  game_request_declined: XCircle,
  game_venue_changed: MapPin,
  game_cancelled: XCircle,
  // 20261110_email.sql: a new day or start time, a game's reminder, a join request still waiting for the host.
  game_time_changed: CalendarClock,
  game_reminder: AlarmClock,
  game_request_waiting: Hourglass,
  // 20261117_game_confirmed.sql: a host tagged this player as confirmed; to the host, the player's answer.
  game_tagged: UserCheck,
  game_tag_yes: UserCheck,
  game_tag_no: UserMinus,
  // A turf claim TapTurf decided (20261106_owner_claims_clarity.sql admin_answer_owner_claim).
  [CLAIM_APPROVED]: Store,
  [CLAIM_REJECTED]: Info,
  // Booking requests (20261106_booking_requests.sql): to the turf, a new one and a player's cancel; to the player, the turf's answer.
  booking_request: CalendarPlus,
  booking_confirmed: CalendarCheck,
  booking_declined: CalendarX,
  booking_cancelled: CalendarX,
  booking_cancelled_by_player: CalendarX,
};

/** onUnread: how many are unread, after each load and change (the Me tab's Alerts count). */
export function NotificationsList({ userId, onUnread }: { userId: string; onUnread?: (n: number) => void }) {
  const { getToken, signedInWith } = useAuth();
  // The list is read quietly (never a sign-out); marking read uses getToken.
  const readToken = quietToken(signedInWith);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  // A tag being answered from the list, and what came back, by notification id.
  const [tagBusy, setTagBusy] = useState<string | null>(null);
  const [tagSaid, setTagSaid] = useState<Record<string, string>>({});

  // Again for another account.
  useEffect(() => {
    let alive = true;
    void getUserNotifications(readToken).then(({ data }) => {
      if (!alive) return;
      setNotifications(data);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [userId, readToken]);

  useEffect(() => {
    if (!loading) onUnread?.(notifications.filter((n) => !n.is_read).length);
  }, [notifications, loading, onUnread]);

  const handleMarkRead = async (id: string) => {
    await markAsRead(getToken, id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  // "Yes, I'm in" or "Not me" on a tag (lib/games/confirmed.ts): the answer goes, and the notification is read.
  const handleTag = async (notif: Notification, yes: boolean) => {
    const gameId = typeof notif.metadata?.gameId === "string" ? notif.metadata.gameId : null;
    if (!gameId) return;
    setTagBusy(notif.id);
    const r = await answerTag(getToken, gameId, yes);
    setTagBusy(null);
    setTagSaid((s) => ({ ...s, [notif.id]: r.text }));
    if (r.done) await handleMarkRead(notif.id);
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead(getToken);
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
          className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-bold px-5 py-3 rounded-full transition-colors shadow-neon focus-neon"
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
            className="text-[11px] font-semibold text-primary-500 hover:text-accent-600 transition-colors"
          >
            Mark all read
          </button>
        </div>
      )}

      <div className="space-y-2">
        {notifications.map((notif) => {
          const Icon = ICON_MAP[notif.type] || Bell;
          // A game's page, or for a claim decision myTapturf or the turf's page (lib/my/claimNotice.ts).
          const link = notificationLink(notif.type, notif.metadata);

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
                {link?.label && (
                  <p className="mt-1.5 inline-flex items-center gap-0.5 text-[13px] font-semibold text-accent-700">
                    {link.label}
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                  </p>
                )}
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

          // A tag still to answer: the two answers, and a link to the game (buttons can't sit inside a link).
          if (notif.type === "game_tagged" && link && (!notif.is_read || tagSaid[notif.id])) {
            return (
              <div key={notif.id} className={cardClass}>
                {inner}
                <div className="mt-3 pl-11">
                  {tagSaid[notif.id] ? (
                    <p role="status" className="text-[13px] font-semibold text-primary-800">{tagSaid[notif.id]}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={tagBusy === notif.id}
                        onClick={() => handleTag(notif, true)}
                        className="h-10 rounded-full bg-accent-600 hover:bg-accent-700 px-4 text-[14px] font-semibold text-white disabled:opacity-60"
                      >
                        {TAG_COPY.yes}
                      </button>
                      <button
                        type="button"
                        disabled={tagBusy === notif.id}
                        onClick={() => handleTag(notif, false)}
                        className="h-10 rounded-full border border-primary-300 bg-white px-4 text-[14px] font-semibold text-primary-900 hover:bg-primary-50 disabled:opacity-60"
                      >
                        {TAG_COPY.no}
                      </button>
                    </div>
                  )}
                  <Link href={link.href} className="mt-2 inline-flex min-h-9 items-center gap-0.5 text-[13px] font-semibold text-accent-700">
                    See the game
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                  </Link>
                </div>
              </div>
            );
          }

          // If the notification points somewhere (a game, a claimed turf), tap opens it.
          // Otherwise it's still tappable to mark as read.
          if (link) {
            return (
              <Link
                key={notif.id}
                href={link.href}
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
