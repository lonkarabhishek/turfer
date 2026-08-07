"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, Trophy, Users, Target, Calendar, Clock, MapPin,
  Plus, Search, Zap, Gamepad2, LogOut, Compass, Inbox,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getUserStats, type UserStats } from "@/lib/queries/stats";
import {
  getAvailableGames,
  getUserGames,
  getUserJoinedGames,
  getMyRequests,
} from "@/lib/queries/games";
import {
  filterNonExpiredGames,
  sortGamesByDateTime,
  formatDate,
  formatTimeSlot,
  getGameStatus,
} from "@/lib/utils/game";
import type { Game, GameRequest } from "@/types/game";

/**
 * Full self-contained logged-in home. Nothing needs a "go to dashboard"
 * click — stats, upcoming games, requests, discovery, profile all live
 * here. For a brand-new user with no history, shows a warm
 * "Start exploring" empty state instead of a wall of zeros.
 */
export function LoggedInHome() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [upcoming, setUpcoming] = useState<Game[]>([]);
  const [tonight, setTonight] = useState<Game[]>([]);
  const [requests, setRequests] = useState<GameRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [s, hosted, joined, reqs, allOpen] = await Promise.all([
        getUserStats(user.id),
        getUserGames(user.id),
        getUserJoinedGames(user.id),
        getMyRequests(user.id),
        getAvailableGames({}),
      ]);
      if (cancelled) return;

      const mine = [...(hosted.data ?? []), ...(joined.data ?? [])];
      const seen = new Set<string>();
      const upcomingMine = sortGamesByDateTime(
        filterNonExpiredGames(mine).filter((g) => {
          if (seen.has(g.id)) return false;
          seen.add(g.id);
          return true;
        })
      );

      const active = sortGamesByDateTime(filterNonExpiredGames(allOpen.data ?? []));
      const notMine = active.filter((g) => !seen.has(g.id)).slice(0, 3);

      const pending = (reqs.data ?? []).filter((r) => r.status === "pending");

      setStats(s);
      setUpcoming(upcomingMine);
      setTonight(notMine);
      setRequests(pending);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  const firstName = user.name?.split(" ")[0] || "there";
  const today = new Date();
  const dayLabel = today.toLocaleDateString("en-IN", { weekday: "long" });
  const dateLabel = today.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  const hasActivity =
    !loading && (
      (stats?.totalGames ?? 0) > 0 ||
      upcoming.length > 0 ||
      requests.length > 0
    );

  return (
    <div
      className="min-h-screen bg-white"
      style={{ background: "linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 40%)" }}
    >
      <div className="max-w-3xl mx-auto px-5 sm:px-6 pt-6 sm:pt-10">
        {/* ─── Greeting ─────────────────────────────────────── */}
        <header className="mb-6">
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-accent-600 mb-1.5">
            // {dayLabel} · {dateLabel}
          </p>
          <h1 className="font-display uppercase text-4xl sm:text-6xl text-primary-800 leading-[0.9] tracking-tight">
            Hey<br className="sm:hidden" />
            <span className="text-accent-500"> {firstName}.</span>
          </h1>
        </header>

        {/* ─── Loading skeleton ─────────────────────────────── */}
        {loading ? (
          <>
            <div className="h-28 rounded-2xl bg-primary-100 animate-pulse mb-4" />
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-2xl bg-primary-100 animate-pulse" />
              ))}
            </div>
          </>
        ) : hasActivity ? (
          <>
            {/* ─── Next up card ─────────────────────────────── */}
            <NextGameHero stats={stats} />

            {/* ─── Stats row ────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
              <StatTile icon={<Trophy className="w-4 h-4" />} value={stats?.totalGames ?? 0} label="Games" />
              <StatTile icon={<Users className="w-4 h-4" />} value={stats?.peopleMet ?? 0} label="Squad" />
              <StatTile icon={<Target className="w-4 h-4" />} value={stats?.sportsPlayed ?? 0} label="Sports" />
            </div>

            {/* ─── Quick actions ────────────────────────────── */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-8">
              <QuickAction href="/game/create" icon={<Plus className="w-5 h-5" strokeWidth={2.75} />} label="Host" primary />
              <QuickAction href="/games" icon={<Gamepad2 className="w-5 h-5" strokeWidth={2.25} />} label="Games" />
              <QuickAction href="/turfs" icon={<Search className="w-5 h-5" strokeWidth={2.25} />} label="Turfs" />
            </div>

            {/* ─── Your upcoming games ──────────────────────── */}
            {upcoming.length > 0 && (
              <Section title="Your games" caption={`${upcoming.length} scheduled`}>
                <div className="space-y-3">
                  {upcoming.slice(0, 4).map((g) => <ClassyGameCard key={g.id} game={g} owned />)}
                </div>
              </Section>
            )}

            {/* ─── Pending requests ─────────────────────────── */}
            {requests.length > 0 && (
              <Section title="Waiting on you" caption={`${requests.length} pending`} icon={<Inbox className="w-4 h-4" />}>
                <div className="space-y-2">
                  {requests.slice(0, 3).map((r) => (
                    <Link
                      key={r.id}
                      href={`/game/${r.game_id}`}
                      className="block group focus-neon rounded-2xl"
                    >
                      <div className="flex items-center justify-between rounded-2xl border border-hot-500/30 bg-white px-4 py-3 hover:border-hot-500 transition-colors">
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-primary-800 leading-tight">
                            Someone wants to join
                          </p>
                          <p className="text-[12px] text-primary-500 mt-0.5 truncate">
                            {r.note ? `"${r.note}"` : "Tap to review"}
                          </p>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-hot-500 shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
              </Section>
            )}

            {/* ─── Discover: games happening tonight ───────── */}
            <Section title="Happening near you" caption={tonight.length > 0 ? "Join in one tap" : ""} icon={<Compass className="w-4 h-4" />}>
              {tonight.length === 0 ? (
                <EmptyLine>
                  Nothing open right now.{" "}
                  <Link href="/game/create" className="font-bold text-accent-600 hover:text-accent-700">
                    Host one? →
                  </Link>
                </EmptyLine>
              ) : (
                <div className="space-y-3">
                  {tonight.map((g) => <ClassyGameCard key={g.id} game={g} />)}
                </div>
              )}
            </Section>
          </>
        ) : (
          /* ─── First-timer empty state ──────────────────── */
          <StartExploring firstName={firstName} />
        )}

        {/* ─── Profile / logout chip ────────────────────────── */}
        <div className="mt-8 mb-10 flex items-center justify-between border-t border-primary-200 pt-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-accent-500 flex items-center justify-center shrink-0">
              {user.profile_image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={user.profile_image_url} alt="" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="text-white font-bold text-sm">
                  {firstName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-primary-800 leading-none">{user.name}</p>
              <p className="text-[11px] text-primary-500 mt-0.5 truncate">{user.phone || user.email}</p>
            </div>
          </div>
          <button
            onClick={async () => { await logout(); window.location.href = "/"; }}
            className="inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wide text-primary-500 hover:text-hot-600 border border-primary-200 rounded-full px-3 py-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Section wrapper
// ────────────────────────────────────────────────────────────

function Section({ title, caption, icon, children }: { title: string; caption?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-accent-600">{icon}</span>}
          <p className="font-display uppercase text-lg text-primary-800 tracking-wide leading-none">
            {title}
          </p>
        </div>
        {caption && (
          <p className="text-[11px] font-mono uppercase tracking-widest text-primary-500">
            {caption}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50 p-4">
      <p className="text-[13px] text-primary-600 text-center">{children}</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Next-up hero
// ────────────────────────────────────────────────────────────

function NextGameHero({ stats }: { stats: UserStats | null }) {
  const g = stats?.nextGame;
  if (!g) {
    return (
      <Link href="/games" className="block group focus-neon rounded-2xl mb-6">
        <div className="rounded-2xl border-2 border-dashed border-primary-200 hover:border-accent-500 bg-primary-50 p-5 transition-colors">
          <p className="text-[11px] font-mono uppercase tracking-widest text-primary-500 mb-1">
            No games on your schedule
          </p>
          <p className="text-[15px] text-primary-800">
            <span className="font-semibold group-hover:text-accent-600 transition-colors">Find one tonight →</span>
          </p>
        </div>
      </Link>
    );
  }

  const kickoff = new Date(`${g.date}T${g.start_time}`);
  const countdown = formatCountdown(kickoff);
  const status = getGameStatus(g);

  return (
    <Link href={`/game/${g.id}`} className="block group focus-neon rounded-2xl mb-6">
      <div className="relative overflow-hidden rounded-2xl border border-accent-500/40 bg-accent-50 p-5 hover:border-accent-500 hover:shadow-card-hover transition-all">
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${status === "live" ? "bg-hot-500" : "bg-accent-500"}`} aria-hidden />
        <div className="flex items-center justify-between mb-2">
          <span className="inline-flex items-center gap-1 bg-accent-500 text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
            <Zap className="w-3 h-3" strokeWidth={2.75} />
            Next up
          </span>
          <span className="text-[12px] font-mono uppercase tracking-widest text-accent-700 font-bold tabular">
            {countdown}
          </span>
        </div>
        <p className="font-display uppercase text-2xl text-primary-800 leading-tight tracking-wide truncate">
          {g.sport} · {g.turfs?.name || g.title}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[12px] text-primary-600">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-primary-400" />
            {formatKickoff(kickoff)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-primary-400" />
            {formatTime(kickoff)}
          </span>
          {g.turfs?.address && (
            <span className="flex items-center gap-1 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-primary-400 shrink-0" />
              <span className="truncate">{g.turfs.address.split(",")[0]}</span>
            </span>
          )}
        </div>
        {stats && stats.upcomingCount > 1 && (
          <p className="text-[11px] font-mono uppercase tracking-widest text-accent-700 mt-2">
            + {stats.upcomingCount - 1} more scheduled
          </p>
        )}
      </div>
    </Link>
  );
}

// ────────────────────────────────────────────────────────────
// Classy game card (used for your games + discovery)
// ────────────────────────────────────────────────────────────

function ClassyGameCard({ game, owned = false }: { game: Game; owned?: boolean }) {
  const spotsLeft = game.max_players - game.current_players;
  const isFull = spotsLeft <= 0;
  const isTight = spotsLeft > 0 && spotsLeft <= 2;
  const kickoff = useMemo(() => new Date(`${game.date}T${game.start_time}`), [game.date, game.start_time]);
  const status = getGameStatus(game);

  return (
    <Link href={`/game/${game.id}`} className="block group focus-neon rounded-2xl">
      <article
        className={`relative overflow-hidden rounded-2xl border bg-white transition-all ${
          isFull
            ? "border-primary-200 opacity-70"
            : "border-primary-200 hover:border-accent-500 hover:shadow-card-hover"
        }`}
      >
        {/* Left accent bar — hot for live, green otherwise */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 ${
            isFull ? "bg-primary-200" : status === "live" ? "bg-hot-500" : "bg-accent-500"
          }`}
          aria-hidden
        />
        <div className="p-4 pl-5 sm:p-5 sm:pl-6">
          {/* Top row: sport + status pill */}
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 bg-accent-500 text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
                <Zap className="w-3 h-3" strokeWidth={2.75} />
                {game.sport}
              </span>
              {owned && (
                <span className="text-[10px] font-semibold uppercase tracking-widest text-primary-600 bg-primary-100 border border-primary-200 px-2 py-0.5 rounded-full">
                  Yours
                </span>
              )}
            </div>
            <span
              className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full whitespace-nowrap ${
                status === "live"
                  ? "bg-hot-500 text-white shadow-hot"
                  : isFull
                  ? "bg-primary-100 text-primary-400"
                  : isTight
                  ? "bg-hot-500/10 text-hot-600 border border-hot-500/40"
                  : "bg-accent-50 text-accent-700 border border-accent-500/40"
              }`}
            >
              {status === "live" ? "Live now" : isFull ? "Full" : `${spotsLeft} left`}
            </span>
          </div>

          {/* Turf name — big display type for that classy feel */}
          <h3 className="font-display uppercase text-xl sm:text-2xl text-primary-800 leading-tight tracking-wide truncate group-hover:text-accent-600 transition-colors">
            {game.turfs?.name || game.title}
          </h3>

          {game.turfs?.address && (
            <p className="text-[12px] text-primary-500 mt-1 flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0 text-primary-400" />
              <span className="truncate">{game.turfs.address.split(",").slice(0, 2).join(",")}</span>
            </p>
          )}

          {/* Meta row */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-[12px] text-primary-700 min-w-0">
              <span className="inline-flex items-center gap-1 font-mono tabular">
                <Calendar className="w-3.5 h-3.5 text-primary-400" />
                {formatDate(game.date)}
              </span>
              <span className="inline-flex items-center gap-1 font-mono tabular">
                <Clock className="w-3.5 h-3.5 text-primary-400" />
                {formatTimeSlot(game.start_time, game.end_time)}
              </span>
            </div>
            <span className="font-display text-lg tabular tracking-tight text-primary-800 shrink-0">
              {game.price_per_player > 0 ? `₹${game.price_per_player}` : "Free"}
            </span>
          </div>

          {/* Players fill bar */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] font-mono tabular text-primary-500 w-10 shrink-0">
              {game.current_players}/{game.max_players}
            </span>
            <div className="flex-1 h-1 bg-primary-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isFull ? "bg-primary-300" : isTight ? "bg-hot-500" : "bg-accent-500"
                }`}
                style={{ width: `${Math.min((game.current_players / game.max_players) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

// ────────────────────────────────────────────────────────────
// Reusable bits
// ────────────────────────────────────────────────────────────

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-white border border-primary-200 py-4 px-2">
      <span className="text-accent-600">{icon}</span>
      <span className="font-display text-2xl sm:text-3xl text-primary-800 tabular leading-none">
        {value}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-primary-500">
        {label}
      </span>
    </div>
  );
}

function QuickAction({ href, icon, label, primary = false }: { href: string; icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 px-2 min-h-[86px] transition-all active:scale-[0.97] focus-neon ${
        primary
          ? "bg-accent-500 hover:bg-accent-600 text-white shadow-neon"
          : "bg-white border border-primary-200 text-primary-800 hover:border-accent-500"
      }`}
    >
      <span>{icon}</span>
      <span className={`text-[12px] font-bold uppercase tracking-wide ${primary ? "text-white" : "text-primary-800"}`}>
        {label}
      </span>
    </Link>
  );
}

// ────────────────────────────────────────────────────────────
// Start exploring (new user empty state)
// ────────────────────────────────────────────────────────────

function StartExploring({ firstName }: { firstName: string }) {
  return (
    <>
      <div className="rounded-3xl border border-accent-500/30 bg-accent-50 p-6 sm:p-8 mb-6">
        <p className="text-[11px] font-mono uppercase tracking-widest text-accent-700 mb-2">
          // Fresh account
        </p>
        <h2 className="font-display uppercase text-3xl sm:text-4xl text-primary-800 leading-[0.9] tracking-tight mb-3">
          Let&apos;s find you<br />
          <span className="text-accent-600">your first game.</span>
        </h2>
        <p className="text-[14px] text-primary-700 mb-5 max-w-md">
          {firstName}, you&apos;re one tap away from your Nashik squad.
          Host a game if you already have friends, or join one to meet new players.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Link
            href="/games"
            className="inline-flex items-center justify-center gap-2 bg-primary-800 hover:bg-primary-900 text-white font-bold uppercase tracking-wide text-sm px-5 py-3 rounded-full transition-colors focus-neon"
          >
            <Gamepad2 className="w-4 h-4" strokeWidth={2.5} />
            Find a game
          </Link>
          <Link
            href="/game/create"
            className="inline-flex items-center justify-center gap-2 bg-white border border-primary-300 hover:border-primary-800 text-primary-800 font-bold uppercase tracking-wide text-sm px-5 py-3 rounded-full transition-colors focus-neon"
          >
            <Plus className="w-4 h-4" strokeWidth={2.75} />
            Host a game
          </Link>
        </div>
      </div>

      <Section title="Explore">
        <div className="grid grid-cols-2 gap-3">
          <ExploreCard href="/turfs" label="All turfs in Nashik" sublabel="49+ grounds to book" icon={<Search className="w-5 h-5" />} />
          <ExploreCard href="/sport/cricket" label="Cricket" sublabel="Box + full-pitch" icon={<Target className="w-5 h-5" />} />
          <ExploreCard href="/sport/football" label="Football" sublabel="5v5 + 7v7" icon={<Compass className="w-5 h-5" />} />
          <ExploreCard href="/games" label="Open games" sublabel="Join or watch" icon={<Zap className="w-5 h-5" />} />
        </div>
      </Section>
    </>
  );
}

function ExploreCard({ href, label, sublabel, icon }: { href: string; label: string; sublabel: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-primary-200 bg-white p-4 hover:border-accent-500 transition-colors focus-neon flex flex-col justify-between min-h-[100px]"
    >
      <span className="w-9 h-9 rounded-lg bg-accent-50 border border-accent-500/30 text-accent-600 flex items-center justify-center">
        {icon}
      </span>
      <div className="mt-3">
        <p className="text-[14px] font-bold text-primary-800 leading-tight group-hover:text-accent-600 transition-colors">
          {label}
        </p>
        <p className="text-[11px] text-primary-500 mt-0.5">{sublabel}</p>
      </div>
    </Link>
  );
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

function formatCountdown(kickoff: Date): string {
  const diffMs = kickoff.getTime() - Date.now();
  if (diffMs < 0) return "Live now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `In ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `In ${hours}h`;
  const days = Math.floor(hours / 24);
  return `In ${days}d`;
}

function formatKickoff(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dayStart.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = h % 12 || 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hh}:${m.toString().padStart(2, "0")} ${ampm}`;
}
