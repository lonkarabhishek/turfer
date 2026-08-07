"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, Trophy, Users, Target, Calendar, Clock, MapPin,
  Plus, Search, Zap, Gamepad2, CircleDot,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getUserStats, type UserStats } from "@/lib/queries/stats";
import { getAvailableGames } from "@/lib/queries/games";
import { filterNonExpiredGames, sortGamesByDateTime, formatDate, formatTimeSlot } from "@/lib/utils/game";
import type { Game } from "@/types/game";

/**
 * Full-screen logged-in home. Personalised dashboard-y layout:
 *   greeting → next game → stats → quick actions → games happening
 *   tonight → recent games. Turfs / all-games listings live in their
 *   own tabs; this view is about *you*.
 */
export function LoggedInHome() {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [tonightGames, setTonightGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [s, allGames] = await Promise.all([
        getUserStats(user.id),
        getAvailableGames({}),
      ]);
      if (cancelled) return;
      const active = sortGamesByDateTime(filterNonExpiredGames(allGames.data ?? []));
      // Exclude games the user already has a spot in
      const inGameIds = new Set(
        [s.nextGame?.id].filter(Boolean) as string[]
      );
      const tonight = active.filter((g) => !inGameIds.has(g.id)).slice(0, 3);
      setStats(s);
      setTonightGames(tonight);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  const firstName = user.name?.split(" ")[0] || "there";
  const today = new Date();
  const dayLabel = today.toLocaleDateString("en-IN", { weekday: "long" });
  const dateLabel = today.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <div
      className="min-h-screen bg-white"
      style={{ background: "linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 45%)" }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-6 pt-6 sm:pt-10">
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

        {/* ─── Next-up hero card ─────────────────────────────── */}
        <NextGameHero stats={stats} loading={loading} />

        {/* ─── Stats row ─────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
          <StatTile icon={<Trophy className="w-4 h-4" />} value={stats?.totalGames ?? 0} label="Games" loading={loading} />
          <StatTile icon={<Users className="w-4 h-4" />} value={stats?.peopleMet ?? 0} label="Squad" loading={loading} />
          <StatTile icon={<Target className="w-4 h-4" />} value={stats?.sportsPlayed ?? 0} label="Sports" loading={loading} />
        </div>

        {/* ─── Quick actions ─────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-8">
          <QuickAction href="/game/create" icon={<Plus className="w-5 h-5" strokeWidth={2.75} />} label="Host" primary />
          <QuickAction href="/games" icon={<Gamepad2 className="w-5 h-5" strokeWidth={2.25} />} label="Games" />
          <QuickAction href="/turfs" icon={<Search className="w-5 h-5" strokeWidth={2.25} />} label="Turfs" />
        </div>

        {/* ─── Games happening tonight ───────────────────────── */}
        <TonightSection games={tonightGames} loading={loading} />

        {/* ─── Small footer link ─────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-primary-200 py-6 mt-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-[13px] font-bold uppercase tracking-wide text-accent-600 hover:text-accent-700"
          >
            Full dashboard <ArrowUpRight className="w-4 h-4" />
          </Link>
          <Link
            href="/turfs"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary-500 hover:text-primary-800"
          >
            Explore turfs
          </Link>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Next-up hero
// ────────────────────────────────────────────────────────────

function NextGameHero({ stats, loading }: { stats: UserStats | null; loading: boolean }) {
  if (loading) {
    return <div className="h-24 rounded-2xl bg-primary-100 animate-pulse mb-6" />;
  }
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

  return (
    <Link href={`/game/${g.id}`} className="block group focus-neon rounded-2xl mb-6">
      <div className="relative overflow-hidden rounded-2xl border border-accent-500/40 bg-accent-50 p-5 hover:border-accent-500 hover:shadow-card-hover transition-all">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent-500" aria-hidden />
        <div className="flex items-center justify-between mb-2">
          <span className="inline-flex items-center gap-1 bg-accent-500 text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
            <CircleDot className="w-3 h-3" />
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
// Reusable bits
// ────────────────────────────────────────────────────────────

function StatTile({ icon, value, label, loading }: { icon: React.ReactNode; value: number; label: string; loading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-white border border-primary-200 py-4 px-2">
      <span className="text-accent-600">{icon}</span>
      <span className="font-display text-2xl sm:text-3xl text-primary-800 tabular leading-none">
        {loading ? "—" : value}
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
// Tonight section
// ────────────────────────────────────────────────────────────

function TonightSection({ games, loading }: { games: Game[]; loading: boolean }) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-accent-600">
          // On the pitch right now
        </p>
        <Link href="/games" className="text-[12px] font-bold uppercase tracking-wide text-primary-500 hover:text-accent-600">
          All games
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-primary-100 animate-pulse" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50 p-4 text-center">
          <p className="text-[13px] text-primary-600">
            Nothing open near you.{" "}
            <Link href="/game/create" className="font-bold text-accent-600 hover:text-accent-700">
              Host one? →
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {games.map((g) => {
            const spotsLeft = g.max_players - g.current_players;
            return (
              <Link
                key={g.id}
                href={`/game/${g.id}`}
                className="block group focus-neon rounded-2xl"
              >
                <div className="relative overflow-hidden rounded-2xl border border-primary-200 bg-white p-4 hover:border-accent-500 hover:shadow-card-hover transition-all">
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <span className="inline-flex items-center gap-1 bg-accent-500 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
                      <Zap className="w-3 h-3" strokeWidth={2.75} />
                      {g.sport}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-accent-700 bg-accent-50 border border-accent-500/40 rounded-full px-2 py-0.5">
                      {spotsLeft} left
                    </span>
                  </div>
                  <p className="font-display uppercase text-lg text-primary-800 leading-tight tracking-wide truncate group-hover:text-accent-600 transition-colors">
                    {g.turfs?.name || g.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-primary-500">
                    <span>{formatDate(g.date)}</span>
                    <span>{formatTimeSlot(g.start_time, g.end_time)}</span>
                    <span className="ml-auto text-[11px] tabular text-primary-700 font-semibold">
                      {g.price_per_player > 0 ? `₹${g.price_per_player}` : "Free"}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
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
