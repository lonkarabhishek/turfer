"use client";

import Link from "next/link";
import { User, Bell, RotateCw } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useAuth } from "@/components/auth/AuthProvider";
import { useState, useEffect, useRef } from "react";
import { getUnreadCount } from "@/lib/queries/notifications";
import { notify } from "@/lib/notifications/browser";
import { unreadWait, wakeWait } from "@/lib/notifications/unreadPoll";
import { HeaderMenu } from "@/components/layout/HeaderMenu";

export function Header() {
  const { user, loading, login } = useAuth();
  // Tagged with whose count it is, so signing out shows 0 without a reset.
  const [unreadFor, setUnreadFor] = useState<{ userId: string; n: number } | null>(null);
  const prevUnreadRef = useRef<number | null>(null);

  const userId = user?.id ?? null;
  const unread = unreadFor && unreadFor.userId === userId ? unreadFor.n : 0;

  // Unread count: on load, when the tab comes back or gets focus, then
  // every 5 min while visible, backing off when the database fails (was
  // every 30 s in every tab, hidden or not; see lib/notifications/unreadPoll.ts).
  // Keyed on the id, so a profile refresh (a new user object) does not
  // restart it with an extra check.
  useEffect(() => {
    prevUnreadRef.current = null;
    if (!userId) return;

    let alive = true;
    let busy = false;
    let lastAt = 0;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const visible = () => document.visibilityState === "visible";
    // No timer while the tab is hidden; showing it again checks.
    const schedule = (ms: number) => {
      clearTimeout(timer);
      if (alive && visible()) timer = setTimeout(poll, ms);
    };

    const poll = async () => {
      if (busy || !alive) return;
      busy = true;
      lastAt = Date.now();
      const { data: nextCount, error } = await getUnreadCount(userId).catch(() => ({ data: 0, error: "network" }));
      busy = false;
      if (!alive) return;
      if (error) {
        failures += 1;
        schedule(unreadWait(failures));
        return;
      }
      failures = 0;
      const prev = prevUnreadRef.current;
      // Only fire a browser notification when the count grew, and only
      // after the first successful load (so we don't ping on page open).
      if (prev !== null && nextCount > prev) {
        const delta = nextCount - prev;
        notify(
          delta === 1 ? "New notification" : `${delta} new notifications`,
          "Open TapTurf to see what's new",
          "tapturf-unread"
        );
      }
      prevUnreadRef.current = nextCount;
      setUnreadFor({ userId, n: nextCount });
      schedule(unreadWait(0));
    };

    const onWake = () => {
      if (!visible()) { clearTimeout(timer); return; }
      if (busy) return;
      const wait = wakeWait(Date.now(), lastAt, failures);
      if (wait === 0) poll();
      else schedule(wait);
    };

    poll();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [userId]);

  return (
    <header className="sticky top-0 z-40 material-thin border-b border-primary-100/60">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-2 min-w-0">
        {/* Logo. The artwork carries the wordmark, so no text beside it. */}
        <Link href="/" className="flex items-center group min-w-0 flex-shrink" aria-label="TapTurf home">
          <Logo height={46} priority className="md:hidden" />
          <Logo height={54} priority className="hidden md:block" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          <Link href="/games" className="text-sm text-primary-500 hover:text-primary-900 px-3 py-2 rounded-full transition-colors">
            Games
          </Link>
          <Link href="/turfs" className="text-sm text-primary-500 hover:text-primary-900 px-3 py-2 rounded-full transition-colors">
            Turfs
          </Link>
          <Link href="/turf-near-me" className="text-sm text-primary-500 hover:text-primary-900 px-3 py-2 rounded-full transition-colors">
            Near me
          </Link>
          <Link href="/sport/box-cricket" className="text-sm text-primary-500 hover:text-primary-900 px-3 py-2 rounded-full transition-colors">
            Box Cricket
          </Link>
          <Link href="/sport/football" className="text-sm text-primary-500 hover:text-primary-900 px-3 py-2 rounded-full transition-colors">
            Football
          </Link>
          <Link href="/blog" className="text-sm text-primary-500 hover:text-primary-900 px-3 py-2 rounded-full transition-colors">
            Blog
          </Link>

          {loading ? (
            <div className="ml-3 w-20 h-8 bg-primary-100 rounded-full animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-2 ml-3">
              <Link
                href="/dashboard?tab=notifications"
                className="relative p-2 rounded-full hover:bg-primary-100 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 text-primary-700" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-hot-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>

              <Link
                href="/dashboard"
                className="flex items-center gap-2 border border-primary-200 rounded-full pl-3 pr-1.5 py-1 hover:border-primary-300 hover:shadow-soft bg-white transition-all"
              >
                <span className="text-sm font-medium text-primary-800 max-w-[80px] truncate">
                  {user.name?.split(" ")[0] || "Account"}
                </span>
                {user.profile_image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={user.profile_image_url}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-accent-500 flex items-center justify-center">
                    <User className="w-4 h-4 text-white" strokeWidth={2.5} />
                  </div>
                )}
              </Link>
            </div>
          ) : (
            <button
              onClick={login}
              className="ml-3 text-sm font-semibold text-white bg-accent-500 hover:bg-accent-600 px-4 py-2 min-h-[36px] rounded-full transition-colors focus-neon"
            >
              Log in
            </button>
          )}
          <div className="ml-2">
            <HeaderMenu />
          </div>
        </nav>

        {/* Mobile right side */}
        <div className="flex md:hidden items-center gap-1.5 flex-shrink-0">
          <HeaderMenu />
          {/* Refresh — iOS PWA won't reload when you re-open the app,
              so give people a one-tap way to pull fresh data. */}
          <button
            onClick={() => window.location.reload()}
            aria-label="Refresh"
            className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full active:bg-primary-100 transition-colors"
          >
            <RotateCw className="w-[18px] h-[18px] text-accent-500" />
          </button>

          {loading ? (
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary-100 animate-pulse" />
          ) : user ? (
            <Link
              href="/dashboard?tab=notifications"
              className="flex-shrink-0 relative flex items-center justify-center w-9 h-9"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-accent-500" />
              {unread > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-1 bg-hot-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          ) : (
            <button
              onClick={login}
              className="flex-shrink-0 flex items-center justify-center h-8 px-3.5 rounded-full bg-accent-500 active:bg-accent-600 transition-colors"
            >
              <span className="text-[13px] font-semibold text-white">Log in</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
