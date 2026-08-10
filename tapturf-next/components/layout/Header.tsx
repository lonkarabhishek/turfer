"use client";

import Link from "next/link";
import { Search, User, Bell, Zap, RotateCw } from "lucide-react";
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
    <header className="sticky top-0 z-40 bg-white border-b border-primary-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between">
        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-lg bg-accent-500 flex items-center justify-center shadow-neon group-hover:rotate-[-6deg] transition-transform">
            <Zap className="w-5 h-5 text-white" strokeWidth={2.75} />
          </div>
          <span className="font-display uppercase text-2xl text-primary-800 tracking-wide leading-none">
            Tap<span className="text-accent-500">Turf</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          <div className="mr-2">
            <CityPicker />
          </div>
          <Link href="/games" className="text-sm font-semibold uppercase tracking-wide text-primary-700 hover:text-accent-600 px-3 py-2 rounded-full transition-colors">
            Games
          </Link>
          <Link href="/turfs" className="text-sm font-semibold uppercase tracking-wide text-primary-700 hover:text-accent-600 px-3 py-2 rounded-full transition-colors">
            Turfs
          </Link>
          <Link href="/sport/cricket" className="text-sm font-semibold uppercase tracking-wide text-primary-700 hover:text-accent-600 px-3 py-2 rounded-full transition-colors">
            Cricket
          </Link>
          <Link href="/sport/football" className="text-sm font-semibold uppercase tracking-wide text-primary-700 hover:text-accent-600 px-3 py-2 rounded-full transition-colors">
            Football
          </Link>
          <Link href="/blog" className="text-sm font-semibold uppercase tracking-wide text-primary-700 hover:text-accent-600 px-3 py-2 rounded-full transition-colors">
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
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-hot-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-hot">
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
              className="ml-3 text-sm font-bold uppercase tracking-wide text-white bg-primary-800 hover:bg-primary-900 px-5 py-2 min-h-[40px] rounded-full transition-all shadow-soft focus-neon"
            >
              Log in
            </button>
          )}
        </nav>

        {/* Mobile right side */}
        <div className="flex md:hidden items-center gap-2">
          <CityPicker />
          {/* Refresh — iOS PWA won't reload when you re-open the app,
              so give people a one-tap way to pull fresh data. */}
          <button
            onClick={() => window.location.reload()}
            aria-label="Refresh"
            className="flex items-center justify-center w-9 h-9 rounded-full border border-primary-200 bg-white active:bg-primary-50 transition-all"
          >
            <RotateCw className="w-4 h-4 text-primary-700" />
          </button>
          <Link
            href="/turfs"
            className="flex items-center justify-center w-10 h-10 rounded-full border border-primary-200 bg-white active:bg-primary-50 transition-all"
            aria-label="Search turfs"
          >
            <Search className="w-4 h-4 text-primary-700" />
          </Link>

          {loading ? (
            <div className="w-10 h-10 rounded-full bg-primary-100 animate-pulse" />
          ) : user ? (
            <Link
              href="/dashboard?tab=notifications"
              className="relative flex items-center justify-center w-10 h-10"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-primary-700" />
              {unread > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-1 bg-hot-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-hot">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          ) : (
            <button
              onClick={login}
              className="flex items-center justify-center h-10 px-4 rounded-full bg-primary-800 active:bg-primary-900 shadow-soft transition-all"
            >
              <span className="text-xs font-bold uppercase tracking-wide text-white">Log in</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
