"use client";

import Link from "next/link";
import { User, Bell, Zap, RotateCw } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useState, useEffect, useRef } from "react";
import { getUnreadCount } from "@/lib/queries/notifications";
import { notify } from "@/lib/notifications/browser";
import { CityPicker } from "@/components/city/CityPicker";

export function Header() {
  const { user, loading, login } = useAuth();
  const [unread, setUnread] = useState(0);
  const prevUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) { setUnread(0); prevUnreadRef.current = null; return; }

    const poll = async () => {
      const { data: nextCount } = await getUnreadCount(user.id);
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
      setUnread(nextCount);
    };

    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [user]);

  return (
    <header className="sticky top-0 z-40 material-thin border-b border-primary-100/60">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-2 min-w-0">
        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-2 group min-w-0 flex-shrink">
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-accent-500 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 md:w-5 md:h-5 text-white" strokeWidth={2.75} />
          </div>
          <span className="text-[19px] md:text-xl font-semibold tracking-tight text-primary-900 leading-none truncate">
            Tap<span className="text-accent-500">Turf</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          <div className="mr-2">
            <CityPicker />
          </div>
          <Link href="/games" className="text-sm text-primary-500 hover:text-primary-900 px-3 py-2 rounded-full transition-colors">
            Games
          </Link>
          <Link href="/turfs" className="text-sm text-primary-500 hover:text-primary-900 px-3 py-2 rounded-full transition-colors">
            Turfs
          </Link>
          <Link href="/sport/cricket" className="text-sm text-primary-500 hover:text-primary-900 px-3 py-2 rounded-full transition-colors">
            Cricket
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
        </nav>

        {/* Mobile right side */}
        <div className="flex md:hidden items-center gap-1.5 flex-shrink-0">
          <div className="flex-shrink-0">
            <CityPicker />
          </div>
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
