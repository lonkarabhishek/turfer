"use client";

import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Gamepad2, Bell, User, LogOut, Inbox, Loader2, Camera, MapPin, Store, ChevronRight, AtSign, Award, Trophy } from "lucide-react";
import { useAuth, type SignedInWith } from "@/components/auth/AuthProvider";
import { UserAvatar } from "@/components/account/UserAvatar";
import { NameWithTick } from "@/components/account/VerifiedTick";
import { PhotoSheet } from "@/components/account/PhotoSheet";
import { AssignedUsernameCard } from "@/components/account/AssignedUsernameCard";
import { askUsernameEdit, useAssignedUsername } from "@/components/account/useAssignedUsername";
import { ASSIGNED_WORDS } from "@/lib/account/assigned";
import { useCityChoice } from "@/components/city/useCityChoice";
import { labelFor, openCityPicker } from "@/lib/city";
import { MyGames, type GamesView } from "./MyGames";
import { MyRequests } from "./MyRequests";
import { MyBookingRequests } from "./MyBookingRequests";
import { NotificationsList } from "./NotificationsList";
import { ProfileSection } from "./ProfileSection";
import { NotificationsPrompt } from "./NotificationsPrompt";
import { PushSwitch } from "@/components/push/PushSwitch";
import { useMeData } from "./useMeData";
import { PassportEntry } from "@/components/profile/PassportEntry";
import { turfersMeaning, turfersWord } from "@/lib/profile/turfers";
import { PassportTab } from "@/components/profile/PassportTab";
import { StreakLine } from "@/components/profile/StreakNudge";
import { StreakButton, useDismiss } from "@/components/profile/StreakChip";
import { usePlayed } from "@/components/profile/usePlayed";
import { crownMedals } from "@/lib/profile/crown";
import { streakShown } from "@/lib/profile/streak";
import type { PassportResponse } from "@/lib/profile/types";
import { ME_TABS, WIDE_ONLY, badgeText, countWord, meTab, meTabHref, type MeTabKey } from "@/lib/dashboard/tabs";
import { MedalCrown } from "./MedalCrown";
import { MyMatches } from "./MyMatches";
import { useMatches } from "./useMatches";
import type { AppUser } from "@/types/user";

// The tabs, their order and their ?tab= keys are lib/dashboard/tabs.ts; the Passport is a pill on a wide screen
// only (on a phone the card's "Your passport" opens it, so the five tiles keep one row).
const ICONS: Record<MeTabKey, typeof Gamepad2> = { games: Gamepad2, requests: Inbox, matches: Trophy, notifications: Bell, profile: User, passport: Award };
const TABS = ME_TABS.map((t) => ({ ...t, icon: ICONS[t.key] }));

type TabKey = MeTabKey;

/** "Good morning" by India's clock. */
function greeting(now = new Date()): string {
  const h = Number(now.toLocaleString("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }));
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * The Me tab (/dashboard): who you are on TapTurf (your picture with
 * your best medals in an arc over it, name, username with your weekly
 * streak beside it, tick and city, with numbers from your own games and a
 * way into your passport), then your games, the requests you sent, your
 * matches from the free tools, alerts, profile settings and the passport,
 * each with its count. ?tab= picks the section, as before. Two columns on
 * a wide screen: the card stays put while the section scrolls. While the
 * passport is open the card's numbers are the passport's (played, Turfers,
 * medals), so no two numbers on the screen count different things.
 */
export function DashboardClient() {
  const { user, loading, login, logout, signedInWith } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  // The tab is in the address, so a reload, a Back from Google and every return to the profile land on it.
  const asked = searchParams?.get("tab") ?? null;
  const initialTab: TabKey = meTab(asked) ?? "games";
  const [tab, setTab] = useState<TabKey>(initialTab);
  // A link to another tab while the dashboard is open (the phone ask, the header's Alerts) changes
  // only the address: Next keeps this page mounted, so the tab follows the address here.
  const [tabAsked, setTabAsked] = useState(asked);
  if (asked !== tabAsked) {
    setTabAsked(asked);
    const k = meTab(asked);
    if (k) setTab(k);
  }
  // hash: a part of that section to land on ("#medals"); the section scrolls to it once it is drawn.
  const pick = (key: TabKey, hash = "") => {
    setTab(key);
    router.replace(`${meTabHref(key)}${hash}`, { scroll: false });
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

  return <Me user={user} signedInWith={signedInWith} tab={tab} pick={pick} onLogout={logout} />;
}

function Me({
  user,
  signedInWith,
  tab,
  pick,
  onLogout,
}: {
  user: AppUser;
  signedInWith: SignedInWith | null;
  tab: TabKey;
  pick: (k: TabKey, hash?: string) => void;
  onLogout: () => Promise<void>;
}) {
  const data = useMeData(user.id, signedInWith);
  // Their matches from the free tools: read here, not in the tab, so the tab's badge knows what is live.
  const matches = useMatches(user.id, tab === "matches");
  // The played summary (GET /api/me/played, shared with the passport's own read): medals, streak, Turfers.
  const played = usePlayed();
  const crown = useMemo(() => crownMedals(played?.medals ?? []), [played]);
  const streakWeeks = streakShown(played?.streak.current);
  const [streakOpen, setStreakOpen] = useState(false);
  const streakBox = useRef<HTMLDivElement>(null);
  const closeStreak = useCallback(() => setStreakOpen(false), []);
  useDismiss(streakBox, streakOpen, closeStreak);
  // All of their games first (hosted and joined together, each once); their own pick, or the card's Hosted or Joined, wins.
  const [view, setView] = useState<GamesView>("all");
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoNote, setPhotoNote] = useState("");
  const city = useCityChoice();
  // The username TapTurf gave them, until they keep it or pick another: shown to them only, never a link.
  const given = useAssignedUsername();
  const [hello] = useState(() => greeting());
  const [passport, setPassport] = useState<PassportResponse | null>(null);
  const onPassport = tab === "passport";
  // Before a first game the passport's own card says so: no row of zeros up here as well.
  const passportEmpty = !!passport && passport.passport.numbers.games === 0 && !passport.passport.medals.some((m) => m.earned);
  // part: a section of the passport to land on ("medals", "played-with", "streak"). Open already: scroll there now;
  // else the passport scrolls to the address's hash once it is drawn (PassportTab).
  const openPassport = (part?: string) => {
    pick("passport", part ? `#${part}` : "");
    requestAnimationFrame(() => {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const at = part ? document.getElementById(part) : null;
      if (at) return at.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
      // On a phone the section starts under the card: bring it up.
      const el = document.getElementById("me-panel");
      if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
    });
  };

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

  // Turf requests change on the turf's side (confirmed, declined): read them again each time the Requests tab
  // is shown (a tab tap, or an alert's link to ?tab=requests while this page stays mounted) and when the
  // phone comes back to it, so no row offers a cancel of a state that has passed. The first read is useMeData's.
  const { reloadBookings } = data;
  const lastTab = useRef(tab);
  useEffect(() => {
    const was = lastTab.current;
    lastTab.current = tab;
    if (tab !== "requests") return;
    if (was !== "requests") void reloadBookings();
    const onVisible = () => {
      if (document.visibilityState === "visible") void reloadBookings();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [tab, reloadBookings]);

  // Players waiting for an answer, per hosted game (the Games tab's rows say so).
  const waiting = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data.incoming) m.set(r.game_id, (m.get(r.game_id) ?? 0) + 1);
    return m;
  }, [data.incoming]);

  // The Requests tab waits for the players waiting on them too, so its list and count never jump.
  const requestsLoading = data.loading || data.extraLoading || data.bookingsLoading;
  const counts: Record<TabKey, number | null> = {
    games: data.loading ? null : data.upcoming,
    requests: requestsLoading ? null : data.pending,
    // Only what is live right now (a link taking updates, a match being scored on this phone), never a total.
    matches: matches.live,
    notifications: data.unread,
    profile: null,
    passport: null,
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

  // For people who run a turf; it arrives after the rest (a read of its own).
  const turfsLink = (className: string) =>
    !!data.turfs && (
      <Link
        href="/my"
        className={`items-center gap-3 rounded-2xl border border-primary-200 bg-white px-4 py-3.5 hover:border-accent-500 transition-colors focus-neon ${className}`}
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
    );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
      <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-8 lg:items-start">
        {/* ─── You ─────────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-24 space-y-3">
          <section aria-labelledby="me-name" className="relative overflow-hidden rounded-3xl bg-white shadow-elevated">
            {/* With medals the band is a little taller and they sit on it in an arc over the photo (the pitch's centre
                circle and line give way to them); with none it is the band it always was. */}
            <div className={`${crown.length ? "h-24" : "h-20"} bg-gradient-to-br from-accent-500 via-accent-600 to-accent-800`} aria-hidden>
              <svg viewBox="0 0 320 80" preserveAspectRatio="none" className="w-full h-full opacity-20">
                <path d="M0 60 Q80 20 160 50 T320 30" fill="none" stroke="#fff" strokeWidth="2" />
                {crown.length === 0 && (
                  <>
                    <circle cx="160" cy="40" r="26" fill="none" stroke="#fff" strokeWidth="2" />
                    <path d="M160 0v80" stroke="#fff" strokeWidth="2" />
                  </>
                )}
              </svg>
            </div>
            <div className="px-5 pb-5 -mt-12 text-center">
              <div className="relative inline-block">
                <MedalCrown medals={crown} onOpen={() => openPassport("medals")} />
                <button
                  type="button"
                  onClick={() => setPhotoOpen(true)}
                  aria-label={user.profile_image_url ? "Change your profile photo" : "Add a profile photo"}
                  className="relative z-10 block rounded-full focus-neon"
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
              {/* Each link a 44 px tap. The username and the streak beside it stay on one line: a long username is cut, the streak never leaves. */}
              <div ref={streakBox}>
              <div className="mt-0.5 flex flex-wrap items-center justify-center gap-x-3 text-[14px] text-primary-500">
                <span className="inline-flex max-w-full min-w-0 items-center gap-x-1">
                  {user.username ? (
                    user.taggable !== false ? (
                      <Link href={`/u/${user.username}`} className="inline-flex min-w-0 items-center min-h-[44px] font-medium text-primary-600 hover:text-primary-900 underline-offset-2 hover:underline">
                        <span className="truncate">@{user.username}</span>
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate font-medium text-primary-600">@{user.username}</span>
                    )
                  ) : given.assigned ? (
                    <span className="inline-flex min-w-0 items-center min-h-[44px] font-medium text-primary-600" title={ASSIGNED_WORDS.meLabel(given.assigned)}>
                      <span className="truncate">@{given.assigned}</span>
                      <span className="sr-only">: {ASSIGNED_WORDS.meLabel(given.assigned)}</span>
                    </span>
                  ) : given.known ? (
                    <Link href="/dashboard?tab=profile#username" className="inline-flex items-center gap-1 min-h-[44px] font-semibold text-accent-700">
                      <AtSign className="w-3.5 h-3.5" aria-hidden />
                      Pick a username
                    </Link>
                  ) : (
                    // Until the server says whether a username is waiting for them: the line keeps its height, with nothing to tap.
                    <span className="inline-block min-h-[44px]" aria-hidden />
                  )}
                  {/* The weekly streak alive now, from 2 weeks (lib/profile/streak.ts): a tap shows its words below. */}
                  {streakWeeks > 0 && (
                    <>
                      <span aria-hidden className="text-primary-300">·</span>
                      <StreakButton weeks={streakWeeks} open={streakOpen} onToggle={() => setStreakOpen((o) => !o)} controls="me-streak" />
                    </>
                  )}
                </span>
                {/* No dot before the city: on a narrow card it wraps to its own line, and its pin sets it apart. */}
                <button
                  type="button"
                  onClick={() => openCityPicker("list")}
                  className="inline-flex items-center gap-1 min-h-[44px] font-medium text-primary-600 hover:text-primary-900"
                  aria-label={city?.kind === "city" ? `City: ${labelFor(city.city)}. Change` : "Pick your city"}
                >
                  <MapPin className="w-3.5 h-3.5 text-accent-600" aria-hidden />
                  {city?.kind === "city" ? labelFor(city.city) : "Pick your city"}
                </button>
              </div>
              {/* The streak's own words, as the card that used to sit under the numbers said them; it opens the passport's streak. */}
              <div id="me-streak" hidden={!streakOpen}>
                {streakOpen && played && (
                  <button
                    type="button"
                    onClick={() => {
                      setStreakOpen(false);
                      openPassport("streak");
                    }}
                    className="mt-1 mb-1 flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 hover:border-amber-400 transition-colors focus-neon"
                  >
                    <StreakLine streak={played.streak} games={played.games} compact />
                    <ChevronRight className="w-5 h-5 shrink-0 text-amber-700" aria-hidden />
                  </button>
                )}
              </div>
              </div>
              {photoNote && (
                <p className="mt-2 text-[13px] font-semibold text-accent-700" role="status">
                  {photoNote}
                </p>
              )}
              {/* "Your username is @asha_rao": Keep it or Change, where "Pick a username" used to be the only way in.
                  Once on the page: with the Profile section open the card is at its top instead. */}
              {tab !== "profile" && (
                <AssignedUsernameCard
                  className="mt-3"
                  onChange={() => {
                    // The Profile section, with the cursor in its username box (no #username: that address lands on the card).
                    askUsernameEdit();
                    pick("profile");
                  }}
                />
              )}

              {/* Real numbers from their own games; a dash until they are in. Hosted and Joined open their
                  list; Upcoming counts both lists (each game once), so it is a number, not a link; Turfers
                  (the people they played with, the number their public profile shows) opens their Played
                  with list. With the passport open: its own played, Turfers and medals instead, under its
                  name (on a phone no tile below says which section is open). */}
              {onPassport && !passportEmpty && <p className="mt-4 -mb-2 text-[12px] font-semibold text-accent-700">Your passport</p>}
              <ul
                data-me-stats
                className={`mt-4 ${onPassport && passportEmpty ? "hidden" : "grid"} ${onPassport ? "grid-cols-3" : "grid-cols-4"} divide-x divide-primary-100 rounded-2xl bg-primary-50/70 py-3`}
                aria-label={onPassport ? "Your passport" : "Your games"}
              >
                {(onPassport
                  ? ([
                      ["Played", passport?.passport.numbers.games ?? null, null, null],
                      // The people they played with (lib/profile/turfers.ts), the same number their public profile leads with; it opens their own list below.
                      [turfersWord(passport?.played.people ?? 0), passport?.played.people ?? null, () => document.getElementById("played-with")?.scrollIntoView({ block: "start" }), turfersMeaning()],
                      ["Medals", passport ? passport.passport.medals.filter((m) => m.earned).length : null, null, null],
                    ] as const)
                  : ([
                      ["Hosted", data.loading ? null : data.created.length, () => showGames("created"), null],
                      ["Joined", data.loading ? null : data.joined.length, () => showGames("joined"), null],
                      ["Upcoming", data.loading ? null : data.upcoming, null, null],
                      [turfersWord(played?.people ?? 0), played ? played.people : null, () => openPassport("played-with"), turfersMeaning()],
                    ] as const)
                ).map(([label, n, go, meaning]) => {
                  const inner = (
                    <>
                      <span className="block font-display text-[24px] leading-none text-primary-900 tabular-nums">{n ?? "–"}</span>
                      <span className={`mt-1 block font-medium text-primary-500 ${onPassport ? "text-[12px]" : "text-[11px] min-[360px]:text-[12px]"}`}>{label}</span>
                      {meaning && <span className="sr-only">: {meaning.replace(/^[^:]+: /, "")}</span>}
                    </>
                  );
                  return (
                    <li key={label} className={onPassport ? "px-1" : "px-0.5 min-[360px]:px-1"} title={meaning ?? undefined}>
                      {go ? (
                        <button type="button" onClick={go} className="w-full rounded-xl py-0.5 hover:bg-white/80 focus-neon">
                          {inner}
                        </button>
                      ) : (
                        <div className="py-0.5">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {/* The passport's way in (not while it is open). The weekly streak is the emoji beside the username now. */}
              {!onPassport && <PassportEntry onOpen={() => openPassport()} />}
            </div>
          </section>

          {turfsLink("hidden lg:flex")}
          {logoutButton("hidden lg:flex")}
        </aside>

        {/* ─── Your sections ───────────────────────────────────── */}
        <div className="mt-5 lg:mt-0 min-w-0">
          {/* Alerts has the switch itself at its top. */}
          {tab !== "notifications" && <NotificationsPrompt />}

          {/* Six sections: a row of five tiles on a phone (each count in view; the card above opens the
              passport), pills on a wide screen, wrapping to a second line where six don't fit. */}
          <div
            className="grid grid-cols-5 gap-0.5 min-[360px]:gap-1 p-1 mb-5 rounded-2xl bg-primary-100/70 sm:flex sm:flex-wrap sm:gap-1.5 lg:gap-2 sm:p-0 sm:bg-transparent"
            role="tablist"
            aria-label="Your sections"
          >
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              const badge = badgeText(counts[key]);
              // On the green tile: solid white, so the number reads (accent-700 on white is 7:1).
              const tone = active
                ? "bg-white text-accent-700"
                : key === "notifications" || key === "matches" || (key === "requests" && data.incoming.length > 0)
                  ? "bg-hot-500 text-white"
                  : "bg-primary-200 text-primary-800";
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => pick(key)}
                  data-me-tab={key}
                  className={`relative ${WIDE_ONLY.includes(key) ? "hidden sm:flex" : "flex"} min-w-0 flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 min-h-[58px] sm:min-h-[44px] px-0 sm:px-3.5 rounded-xl sm:rounded-full text-[11px] tracking-tight min-[360px]:text-[12px] min-[360px]:tracking-normal sm:text-[13px] font-bold whitespace-nowrap sm:border-2 transition-all focus-neon ${
                    active
                      ? "bg-accent-500 text-white sm:border-accent-500 shadow-neon"
                      : "text-primary-700 hover:bg-white/70 sm:bg-white sm:border-primary-200 sm:hover:border-accent-500"
                  }`}
                >
                  {/* The icon is the phone tile's; six pills with icons don't fit the wide column, so a pill is its word. */}
                  <span className="relative sm:hidden">
                    <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} aria-hidden />
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
                        , {badge} {countWord(key)}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          <div id="me-panel" role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label} className="scroll-mt-20">
            {tab === "games" && (
              <MyGames
                createdGames={data.created}
                joinedGames={data.joined}
                loading={data.loading}
                view={view}
                onView={setView}
                waiting={waiting}
                onGamesChanged={data.reloadGames}
              />
            )}
            {tab === "requests" && (
              <MyRequests
                requests={data.requests}
                requestGames={data.requestGames}
                incoming={data.incoming}
                hosted={data.created}
                loading={requestsLoading}
                reloadRequests={data.reloadRequests}
                hideEmpty={data.bookings.length > 0}
                turfRequests={<MyBookingRequests bookings={data.bookings} reload={data.reloadBookings} />}
              />
            )}
            {tab === "matches" && <MyMatches data={matches} />}
            {tab === "notifications" && (
              <>
                <PushSwitch className="mb-5" />
                <NotificationsList userId={user.id} onUnread={data.setUnread} />
              </>
            )}
            {tab === "profile" && <ProfileSection user={user} onEditPhoto={() => setPhotoOpen(true)} />}
            {tab === "passport" && <PassportTab onLoaded={setPassport} />}
          </div>

          {/* On a phone they come last: nothing above the sections moves when Your turfs arrives, and
              the bottom space lets Log out scroll clear of the Ask button. */}
          <div className="mt-10 pb-[4.5rem] md:pb-0 space-y-3 lg:hidden">
            {turfsLink("flex")}
            {logoutButton("flex")}
          </div>
        </div>
      </div>

      {photoOpen && <PhotoSheet user={user} onClose={() => setPhotoOpen(false)} onSaved={setPhotoNote} />}
    </div>
  );
}
