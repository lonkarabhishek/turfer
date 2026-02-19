"use client";

import Link from "next/link";
import Image from "next/image";
import { Search, User, Bell } from "lucide-react";
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
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/images/tapturf-logo.png"
            alt="TapTurf"
            width={34}
            height={34}
            className="rounded-lg"
          />
          <span className="font-bold text-xl text-gray-900 tracking-tight">
            Tap<span className="text-primary-500">Turf</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          <Link
            href="/turfs"
            className="text-sm font-medium text-gray-600 hover:text-primary-600 px-3 py-2 rounded-full hover:bg-primary-50 transition-colors"
          >
            Find Turfs
          </Link>
          <Link
            href="/games"
            className="text-sm font-medium text-gray-600 hover:text-primary-600 px-3 py-2 rounded-full hover:bg-primary-50 transition-colors"
          >
            Games
          </Link>
          <Link
            href="/sport/football"
            className="text-sm font-medium text-gray-600 hover:text-primary-600 px-3 py-2 rounded-full hover:bg-primary-50 transition-colors"
          >
            Football
          </Link>
          <Link
            href="/sport/cricket"
            className="text-sm font-medium text-gray-600 hover:text-primary-600 px-3 py-2 rounded-full hover:bg-primary-50 transition-colors"
          >
            Cricket
          </Link>

          {/* Auth section */}
          {!loading && (
            <>
              {user ? (
                <div className="flex items-center gap-2 ml-3">
                  {/* Notifications */}
                  <Link
                    href="/dashboard?tab=notifications"
                    className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    <Bell className="w-5 h-5 text-gray-600" />
                    {unread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-accent-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </Link>

                  {/* User avatar / dashboard link */}
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2 border border-gray-200 rounded-full pl-3 pr-1.5 py-1 hover:shadow-md hover:border-primary-200 transition-all"
                  >
                    <span className="text-sm font-medium text-gray-700 max-w-[80px] truncate">
                      {user.name?.split(" ")[0] || "Account"}
                    </span>
                    {user.profile_image_url ? (
                      <img
                        src={user.profile_image_url}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                        <User className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </Link>
                </div>
              ) : (
                <button
                  onClick={login}
                  className="ml-3 text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 px-5 py-2 rounded-full transition-colors shadow-sm"
                >
                  Log in
                </button>
              )}
            </>
          )}
        </nav>

        {/* Mobile right side */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            href="/turfs"
            className="flex items-center justify-center w-10 h-10 rounded-full border border-gray-200 shadow-sm hover:shadow-md hover:border-primary-200 transition-all"
          >
            <Search className="w-4 h-4 text-gray-700" />
          </Link>

          {!loading && user && (
            <Link
              href="/dashboard?tab=notifications"
              className="relative flex items-center justify-center w-10 h-10"
            >
              <Bell className="w-5 h-5 text-gray-700" />
              {unread > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-accent-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          )}

          {!loading && !user && (
            <button
              onClick={login}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-500 hover:bg-primary-600 shadow-sm transition-colors"
            >
              <User className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
