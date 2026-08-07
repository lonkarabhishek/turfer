"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Gamepad2, Bell, User, LogOut, Inbox, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { MyGames } from "./MyGames";
import { MyRequests } from "./MyRequests";
import { NotificationsList } from "./NotificationsList";
import { ProfileSection } from "./ProfileSection";
import { NotificationsPrompt } from "./NotificationsPrompt";

const TABS = [
  { key: "games", label: "Games", icon: Gamepad2 },
  { key: "requests", label: "Requests", icon: Inbox },
  { key: "notifications", label: "Alerts", icon: Bell },
  { key: "profile", label: "Profile", icon: User },
] as const;

type TabKey = typeof TABS[number]["key"];

export function DashboardClient() {
  const { user, loading, login, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabKey) || "games";
  const [tab, setTab] = useState<TabKey>(initialTab);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!loading && !user && !redirectedRef.current) {
      redirectedRef.current = true;
      login();
      router.push("/games");
    }
  }, [loading, user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <Loader2 className="w-6 h-6 text-accent-500 animate-spin mx-auto mb-3" />
        <p className="text-sm text-primary-500">Loading your dashboard…</p>
      </div>
    );
  }

  const firstName = user.name?.split(" ")[0] || "there";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
      {/* ─── Greeting header — mobile-first, warm ─────────────────── */}
      <header className="mb-5">
        <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-accent-600 mb-1.5">
          // {new Date().toLocaleDateString("en-IN", { weekday: "long" })}
        </p>
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display uppercase text-3xl sm:text-5xl text-primary-800 leading-[0.92] tracking-tight">
            Hey<br className="sm:hidden" />
            <span className="text-accent-500"> {firstName}.</span>
          </h1>
          <button
            onClick={async () => {
              await logout();
              window.location.href = "/";
            }}
            className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-primary-500 hover:text-hot-600 transition-colors shrink-0 border border-primary-200 rounded-full px-3 py-1.5"
            aria-label="Log out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>

      {/* ─── Enable-notifications banner (global, not buried in a tab) */}
      <NotificationsPrompt />

      {/* ─── Tabs — pill row, always horizontally scrollable on mobile */}
      <div
        className="flex gap-2 overflow-x-auto scrollbar-hide mb-5 -mx-4 px-4 sm:mx-0 sm:px-0"
        role="tablist"
      >
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2.5 min-h-[40px] rounded-full text-[13px] font-bold uppercase tracking-wide whitespace-nowrap border-2 transition-all focus-neon ${
                active
                  ? "bg-accent-500 text-white border-accent-500 shadow-neon"
                  : "text-primary-700 bg-white border-primary-200 hover:border-accent-500"
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={active ? 2.5 : 2} />
              {label}
            </button>
          );
        })}
      </div>

      {/* ─── Tab content ────────────────────────────────────────── */}
      <div>
        {tab === "games" && <MyGames userId={user.id} />}
        {tab === "requests" && <MyRequests userId={user.id} />}
        {tab === "notifications" && <NotificationsList userId={user.id} />}
        {tab === "profile" && <ProfileSection user={user} />}
      </div>
    </div>
  );
}
