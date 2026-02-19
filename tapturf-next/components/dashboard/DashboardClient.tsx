"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Gamepad2, Bell, User, LogOut, Inbox } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { MyGames } from "./MyGames";
import { MyRequests } from "./MyRequests";
import { NotificationsList } from "./NotificationsList";
import { ProfileSection } from "./ProfileSection";

const TABS = [
  { key: "games", label: "My Games", icon: Gamepad2 },
  { key: "requests", label: "Requests", icon: Inbox },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "profile", label: "Profile", icon: User },
] as const;

type TabKey = typeof TABS[number]["key"];

export function DashboardClient() {
  const { user, loading, login, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabKey) || "games";
  const [tab, setTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    if (!loading && !user) {
      login();
      router.push("/games");
    }
  }, [loading, user]);

  if (loading || !user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Welcome, {user.name?.split(" ")[0] || "there"}</p>
        </div>
        <button
          onClick={async () => {
            await logout();
            router.push("/");
          }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide mb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              tab === key
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "games" && <MyGames userId={user.id} />}
      {tab === "requests" && <MyRequests userId={user.id} />}
      {tab === "notifications" && <NotificationsList userId={user.id} />}
      {tab === "profile" && <ProfileSection user={user} />}
    </div>
  );
}
