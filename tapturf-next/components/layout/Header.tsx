"use client";

import Link from "next/link";
import { Search, User, Bell, Zap } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useState, useEffect } from "react";
import { getUnreadCount } from "@/lib/queries/notifications";

export function Header() {
  const { user, loading, login } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) { setUnread(0); return; }
    getUnreadCount(user.id).then(({ data }) => setUnread(data));
    const interval = setInterval(() => {
      getUnreadCount(user.id).then(({ data }) => setUnread(data));
    }, 30000);
    return () => clearInterval(interval);
  }, [user]);

  return (
    <header className="sticky top-0 z-40 bg-primary-950/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Wordmark — pure type, no logo image needed for the neon rebrand */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-lg bg-accent-400 flex items-center justify-center shadow-neon group-hover:rotate-[-6deg] transition-transform">
            <Zap className="w-5 h-5 text-primary-950" strokeWidth={2.75} />
          </div>
          <span className="font-display uppercase text-2xl text-white tracking-wide leading-none">
            Tap<span className="text-accent-400">Turf</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          <Link href="/games" className="text-sm font-semibold uppercase tracking-wide text-white/70 hover:text-accent-400 px-3 py-2 rounded-full transition-colors">
            Games
          </Link>
          <Link href="/turfs" className="text-sm font-semibold uppercase tracking-wide text-white/70 hover:text-accent-400 px-3 py-2 rounded-full transition-colors">
            Turfs
          </Link>
          <Link href="/sport/cricket" className="text-sm font-semibold uppercase tracking-wide text-white/70 hover:text-accent-400 px-3 py-2 rounded-full transition-colors">
            Cricket
          </Link>
          <Link href="/sport/football" className="text-sm font-semibold uppercase tracking-wide text-white/70 hover:text-accent-400 px-3 py-2 rounded-full transition-colors">
            Football
          </Link>

          {/* Auth section */}
          {loading ? (
            <div className="ml-3 w-20 h-8 bg-white/5 rounded-full animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-2 ml-3">
              <Link
                href="/dashboard?tab=notifications"
                className="relative p-2 rounded-full hover:bg-white/5 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 text-white/80" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-hot-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-hot">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>

              <Link
                href="/dashboard"
                className="flex items-center gap-2 border border-white/15 rounded-full pl-3 pr-1.5 py-1 hover:border-accent-400/50 bg-white/5 transition-all"
              >
                <span className="text-sm font-medium text-white/90 max-w-[80px] truncate">
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
                  <div className="w-7 h-7 rounded-full bg-accent-400 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary-950" strokeWidth={2.5} />
                  </div>
                )}
              </Link>
            </div>
          ) : (
            <button
              onClick={login}
              className="ml-3 text-sm font-bold uppercase tracking-wide text-primary-950 bg-accent-400 hover:bg-accent-300 px-5 py-2 min-h-[40px] rounded-full transition-all shadow-neon focus-neon"
            >
              Log in
            </button>
          )}
        </nav>

        {/* Mobile right side */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            href="/turfs"
            className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-white/5 hover:border-accent-400/50 transition-all"
            aria-label="Search turfs"
          >
            <Search className="w-4 h-4 text-white/80" />
          </Link>

          {loading ? (
            <div className="w-10 h-10 rounded-full bg-white/5 animate-pulse" />
          ) : user ? (
            <Link
              href="/dashboard?tab=notifications"
              className="relative flex items-center justify-center w-10 h-10"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-white/80" />
              {unread > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-1 bg-hot-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-hot">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          ) : (
            <button
              onClick={login}
              className="flex items-center justify-center h-10 px-4 rounded-full bg-accent-400 hover:bg-accent-300 shadow-neon transition-all"
            >
              <span className="text-xs font-bold uppercase tracking-wide text-primary-950">Log in</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
