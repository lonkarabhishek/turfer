"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Gamepad2, Bell, User, LogOut, Inbox, Loader2, Camera, MapPin, Store, ChevronRight, AtSign } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserAvatar } from "@/components/account/UserAvatar";
import { NameWithTick } from "@/components/account/VerifiedTick";
import { PhotoSheet } from "@/components/account/PhotoSheet";
import { useCityChoice } from "@/components/city/useCityChoice";
import { labelFor, openCityPicker } from "@/lib/city";
import { MyGames, type GamesView } from "./MyGames";
import { MyRequests } from "./MyRequests";
import { NotificationsList } from "./NotificationsList";
import { ProfileSection } from "./ProfileSection";
import { NotificationsPrompt } from "./NotificationsPrompt";
import { useMeData } from "./useMeData";
import type { AppUser } from "@/types/user";

const TABS = [
  { key: "games", label: "Games", icon: Gamepad2 },
  { key: "requests", label: "Requests", icon: Inbox },
  { key: "notifications", label: "Alerts", icon: Bell },
  { key: "profile", label: "Profile", icon: User },
] as const;

type TabKey = typeof TABS[number]["key"];

/** "Good morning" by India's clock. */
function greeting(now = new Date()): string {
  const h = Number(now.toLocaleString("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }));
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * The Me tab (/dashboard): who you are on TapTurf (your picture, name,
 * username, tick and city, with numbers from your own games), then your
 * games, the requests you sent, alerts and profile settings, each with
 * its count. ?tab= picks the section, as before. Two columns on a wide
 * screen: the card stays put while the section scrolls.
 */
export function DashboardClient() {
  const { user, loading, login, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  // The tab is in the address, so a reload, a Back from Google and every return to the profile land on it.
  const asked = searchParams.get("tab");
  const initialTab: TabKey = TABS.find((t) => t.key === asked)?.key ?? "games";
  const [tab, setTab] = useState<TabKey>(initialTab);
  // A link to another tab while the dashboard is open (the phone ask, the header's Alerts) changes
  // only the address: Next keeps this page mounted, so the tab follows the address here.
  const [tabAsked, setTabAsked] = useState(asked);
  if (asked !== tabAsked) {
    setTabAsked(asked);
    const k = TABS.find((t) => t.key === asked)?.key;
    if (k) setTab(k);
  }
  const pick = (key: TabKey) => {
    setTab(key);
    router.replace(`/dashboard?tab=${key}`, { scroll: false });
  };
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

  return <Me user={user} tab={tab} pick={pick} onLogout={logout} />;
}

function Me({ user, tab, pick, onLogout }: { user: AppUser; tab: TabKey; pick: (k: TabKey) => void; onLogout: () => Promise<void> }) {
  const data = useMeData(user.id);
  // Hosted first, unless they host nothing yet and play in someone's game; their own pick wins.
  const [picked, setPicked] = useState<GamesView | null>(null);
  const view: GamesView = picked ?? (!data.loading && data.created.length === 0 && data.joined.length > 0 ? "joined" : "created");
  const setView = setPicked;
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoNote, setPhotoNote] = useState("");
  const city = useCityChoice();
  const [hello] = useState(() => greeting());

  useEffect(() => {
    if (!photoNote) return;
    const t = setTimeout(() => setPhotoNote(""), 3500);
    return () => clearTimeout(t);
  }, [photoNote]);

  const showGames = (v?: GamesView) => {
    if (v) setView(v);
    pick("games");
  };
  const logout = async () => {
    await onLogout();
    window.location.href = "/";
  };

  // Players waiting for an answer, per hosted game (the Games tab's rows say so).
  const waiting = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data.incoming) m.set(r.game_id, (m.get(r.game_id) ?? 0) + 1);
    return m;
  }, [data.incoming]);

  const counts: Record<TabKey, number | null> = {
    games: data.loading ? null : data.upcoming,
    requests: data.loading ? null : data.pending,
    notifications: data.unread,
    profile: null,
  };

  const logoutButton = (className: string) => (
    <button
      type="button"
      onClick={() => void logout()}
      className={`items-center justify-center gap-2 w-full min-h-[48px] rounded-full border border-primary-200 bg-white text-[14px] font-semibold text-primary-700 hover:border-hot-500/50 hover:text-hot-600 transition-colors focus-neon ${className}`}
    >
      <LogOut className="w-4 h-4" aria-hidden />
      Log out
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
      <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-8 lg:items-start">
        {/* ─── You ─────────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-24 space-y-3">
          <section aria-labelledby="me-name" className="relative overflow-hidden rounded-3xl bg-white shadow-elevated">
            <div className="h-20 bg-gradient-to-br from-accent-500 via-accent-600 to-accent-800" aria-hidden>
              <svg viewBox="0 0 320 80" preserveAspectRatio="none" className="w-full h-full opacity-20">
                <path d="M0 60 Q80 20 160 50 T320 30" fill="none" stroke="#fff" strokeWidth="2" />
                <circle cx="160" cy="40" r="26" fill="none" stroke="#fff" strokeWidth="2" />
                <path d="M160 0v80" stroke="#fff" strokeWidth="2" />
              </svg>
            </div>
            <div className="px-5 pb-5 -mt-12 text-center">
              <div className="relative inline-block">
                <button
                  type="button"
                  onClick={() => setPhotoOpen(true)}
                  aria-label={user.profile_image_url ? "Change your profile photo" : "Add a profile photo"}
                  className="block rounded-full focus-neon"
                >
                  <UserAvatar src={user.profile_image_url} name={user.name} size={96} eager className="ring-4 ring-white shadow-card" />
                  <span className="absolute bottom-0.5 right-0.5 grid place-items-center w-8 h-8 rounded-full bg-primary-900 text-white ring-[3px] ring-white" aria-hidden>
                    <Camera className="w-4 h-4" />
                  </span>
                </button>
              </div>
              <p className="mt-2 text-[12px] font-medium text-accent-700">{hello}</p>
              <h1 id="me-name" className="mt-0.5 font-display text-[26px] leading-tight text-primary-900 break-words">
                <NameWithTick name={user.name || "You"} ticked={user.verified === true} />
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[14px] text-primary-500">
                {user.username ? (
                  user.taggable !== false ? (
                    <Link href={`/u/${user.username}`} className="font-medium text-primary-600 hover:text-primary-900 underline-offset-2 hover:underline">
                      @{user.username}
                    </Link>
                  ) : (
                    <span className="font-medium text-primary-600">@{user.username}</span>
                  )
                ) : (
                  <Link href="/dashboard?tab=profile#username" className="inline-flex items-center gap-1 font-semibold text-accent-700">
                    <AtSign className="w-3.5 h-3.5" aria-hidden />
                    Pick a username
                  </Link>
                )}
                <span aria-hidden className="text-primary-300">·</span>
                <button
                  type="button"
                  onClick={() => openCityPicker("list")}
                  className="inline-flex items-center gap-1 min-h-[32px] font-medium text-primary-600 hover:text-primary-900"
                  aria-label={city?.kind === "city" ? `City: ${labelFor(city.city)}. Change` : "Pick your city"}
                >
                  <MapPin className="w-3.5 h-3.5 text-accent-600" aria-hidden />
                  {city?.kind === "city" ? labelFor(city.city) : "Pick your city"}
                </button>
              </div>
              {photoNote && (
                <p className="mt-2 text-[13px] font-semibold text-accent-700" role="status">
                  {photoNote}
                </p>
              )}

              {/* Real numbers from their own games; a dash until they are in. */}
              <ul className="mt-4 grid grid-cols-3 divide-x divide-primary-100 rounded-2xl bg-primary-50/70 py-3" aria-label="Your games">
                {(
                  [
                    ["Hosted", data.created.length, () => showGames("created")],
                    ["Joined", data.joined.length, () => showGames("joined")],
                    ["Upcoming", data.upcoming, () => showGames()],
                  ] as const
                ).map(([label, n, go]) => (
                  <li key={label} className="px-1">
                    <button type="button" onClick={go} className="w-full rounded-xl py-0.5 hover:bg-white/80 focus-neon">
                      <span className="block font-display text-[24px] leading-none text-primary-900 tabular-nums">{data.loading ? "–" : n}</span>
                      <span className="mt-1 block text-[12px] font-medium text-primary-500">{label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {!!data.turfs && (
            <Link
              href="/my"
              className="flex items-center gap-3 rounded-2xl border border-primary-200 bg-white px-4 py-3.5 hover:border-accent-500 transition-colors focus-neon"
            >
              <span className="grid place-items-center w-10 h-10 shrink-0 rounded-xl bg-accent-50 border border-accent-500/30">
                <Store className="w-5 h-5 text-accent-600" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-primary-900">Your turfs</span>
                <span className="block text-[13px] text-primary-500">
                  {data.turfs} {data.turfs === 1 ? "turf" : "turfs"} on myTapturf
                </span>
              </span>
              <ChevronRight className="w-5 h-5 text-primary-400" aria-hidden />
            </Link>
          )}

          {logoutButton("hidden lg:flex")}
        </aside>

        {/* ─── Your sections ───────────────────────────────────── */}
        <div className="mt-5 lg:mt-0 min-w-0">
          <NotificationsPrompt />

          {/* Four sections: a row of tiles on a phone (each count in view), pills on a wide screen. */}
          <div
            className="grid grid-cols-4 gap-1 p-1 mb-5 rounded-2xl bg-primary-100/70 sm:flex sm:gap-2 sm:p-0 sm:bg-transparent"
            role="tablist"
            aria-label="Your sections"
          >
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              const n = counts[key];
              const badge = n ? (n > 99 ? "99+" : String(n)) : null;
              const tone = active
                ? "bg-white/25 text-white"
                : key === "notifications" || (key === "requests" && data.incoming.length > 0)
                  ? "bg-hot-500 text-white"
                  : "bg-primary-200 text-primary-800";
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => pick(key)}
                  className={`relative flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 min-h-[58px] sm:min-h-[44px] px-1 sm:px-4 rounded-xl sm:rounded-full text-[12px] sm:text-[13px] font-bold whitespace-nowrap sm:border-2 transition-all focus-neon ${
                    active
                      ? "bg-accent-500 text-white sm:border-accent-500 shadow-neon"
                      : "text-primary-700 hover:bg-white/70 sm:bg-white sm:border-primary-200 sm:hover:border-accent-500"
                  }`}
                >
                  <span className="relative">
                    <Icon className="w-5 h-5 sm:w-4 sm:h-4" strokeWidth={active ? 2.5 : 2} aria-hidden />
                    {badge && (
                      <span className={`sm:hidden absolute -top-2 left-3 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] leading-[18px] text-center tabular-nums ${tone}`} aria-hidden>
                        {badge}
                      </span>
                    )}
                  </span>
                  {label}
                  {badge && (
                    <>
                      <span className={`hidden sm:inline-block min-w-[20px] h-5 px-1.5 rounded-full text-[11px] leading-5 text-center tabular-nums ${tone}`} aria-hidden>
                        {badge}
                      </span>
                      <span className="sr-only">
                        , {badge} {key === "notifications" ? "unread" : key === "requests" ? "pending" : "upcoming"}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          <div role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
            {tab === "games" && (
              <MyGames createdGames={data.created} joinedGames={data.joined} loading={data.loading} view={view} onView={setView} waiting={waiting} />
            )}
            {tab === "requests" && (
              <MyRequests
                userId={user.id}
                requests={data.requests}
                requestGames={data.requestGames}
                incoming={data.incoming}
                hosted={data.created}
                loading={data.loading}
                reloadRequests={data.reloadRequests}
              />
            )}
            {tab === "notifications" && <NotificationsList userId={user.id} onUnread={data.setUnread} />}
            {tab === "profile" && <ProfileSection user={user} onEditPhoto={() => setPhotoOpen(true)} />}
          </div>

          <div className="mt-10 lg:hidden">{logoutButton("flex")}</div>
        </div>
      </div>

      {photoOpen && <PhotoSheet user={user} onClose={() => setPhotoOpen(false)} onSaved={setPhotoNote} />}
    </div>
  );
}
