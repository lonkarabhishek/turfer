"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Trophy, Users, Target, CircleDot, Clock, Calendar, MapPin } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getUserStats, type UserStats } from "@/lib/queries/stats";

/**
 * "Welcome back" panel — only rendered for signed-in users on home.
 * Front-and-centre reminder of their next game + a compact stat row
 * that grows over time so the app feels like it remembers them.
 */
export function HomeUserPanel() {
  const { user, loading } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!user) { setStats(null); return; }
    setFetching(true);
    getUserStats(user.id)
      .then(setStats)
      .finally(() => setFetching(false));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !user) return null;

  const firstName = user.name?.split(" ")[0] || "there";

  return (
    <section className="max-w-6xl mx-auto px-5 sm:px-6 -mt-2 pb-4">
      <div className="relative overflow-hidden rounded-3xl bg-white border border-primary-200 shadow-soft">
        {/* Left accent bar */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent-500" aria-hidden />

        <div className="p-5 sm:p-6 pl-6 sm:pl-7">
          {/* Greeting row */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-accent-600 mb-1">
                // Welcome back
              </p>
              <p className="font-display uppercase text-3xl sm:text-4xl text-primary-800 leading-none tracking-tight">
                Hey {firstName}.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="hidden sm:inline-flex items-center gap-1 text-[12px] font-bold uppercase tracking-wide text-accent-600 hover:text-accent-700"
            >
              Dashboard <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Next-game hero pill (if any) */}
          {fetching ? (
            <div className="h-14 rounded-2xl bg-primary-100 animate-pulse mb-4" />
          ) : stats?.nextGame ? (
            <NextGameCard stats={stats} />
          ) : (
            <NoUpcomingCard />
          )}

          {/* Stat row */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatTile
              icon={<Trophy className="w-4 h-4" />}
              value={stats?.totalGames ?? 0}
              label="Games"
              loading={fetching}
            />
            <StatTile
              icon={<Users className="w-4 h-4" />}
              value={stats?.peopleMet ?? 0}
              label="Squad"
              loading={fetching}
            />
            <StatTile
              icon={<Target className="w-4 h-4" />}
              value={stats?.sportsPlayed ?? 0}
              label="Sports"
              loading={fetching}
            />
          </div>

          {/* Mobile-only dashboard link */}
          <Link
            href="/dashboard"
            className="sm:hidden mt-4 flex items-center justify-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-accent-600"
          >
            View dashboard <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function NextGameCard({ stats }: { stats: UserStats }) {
  const g = stats.nextGame!;
  const kickoff = new Date(`${g.date}T${g.start_time}`);
  const countdown = formatCountdown(kickoff);

  return (
    <Link
      href={`/game/${g.id}`}
      className="block group focus-neon rounded-2xl mb-4"
    >
      <div className="relative overflow-hidden rounded-2xl border border-accent-500/30 bg-accent-50 p-4 hover:border-accent-500 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <span className="inline-flex items-center gap-1 bg-accent-500 text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
            <CircleDot className="w-3 h-3" />
            Next up
          </span>
          <span className="text-[11px] font-mono tabular uppercase tracking-widest text-accent-700 font-bold">
            {countdown}
          </span>
        </div>
        <p className="font-display uppercase text-xl text-primary-800 leading-tight tracking-wide truncate">
          {g.sport} · {g.turfs?.name || g.title}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[12px] text-primary-600">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-primary-400" />
            {formatKickoff(kickoff)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-primary-400" />
            {formatTime(kickoff)}
          </span>
          {g.turfs?.address && (
            <span className="flex items-center gap-1 min-w-0">
              <MapPin className="w-3 h-3 text-primary-400 shrink-0" />
              <span className="truncate">{g.turfs.address.split(",")[0]}</span>
            </span>
          )}
        </div>
        {stats.upcomingCount > 1 && (
          <p className="text-[11px] font-mono uppercase tracking-widest text-accent-700 mt-2">
            + {stats.upcomingCount - 1} more upcoming
          </p>
        )}
      </div>
    </Link>
  );
}

function NoUpcomingCard() {
  return (
    <Link
      href="/games"
      className="block group focus-neon rounded-2xl mb-4"
    >
      <div className="rounded-2xl border-2 border-dashed border-primary-200 hover:border-accent-500 bg-primary-50 p-4 transition-colors">
        <p className="text-[13px] text-primary-700">
          No games scheduled — <span className="font-bold text-accent-600 group-hover:text-accent-700">find one tonight →</span>
        </p>
      </div>
    </Link>
  );
}

function StatTile({
  icon,
  value,
  label,
  loading,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-primary-50 border border-primary-200 py-3 px-2">
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

// ── helpers ──────────────────────────────────────────────

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
