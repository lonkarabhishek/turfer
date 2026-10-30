"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Plus, Trophy, Clock, Users, Calendar } from "lucide-react";
import { formatDate, formatTimeSlot, getGameStatus } from "@/lib/utils/game";
import { Avatar } from "@/components/game/detail/Avatar";
import type { Game } from "@/types/game";

export type GamesView = "created" | "joined";

/**
 * "Games" tab in the dashboard.
 * Always leads with the user's UPCOMING games (soonest first) — the
 * thing they actually opened the app to check — with past games
 * collapsed underneath. The lists come from the Me tab (useMeData), so
 * its Hosted and Joined numbers and this tab agree, and each opens its
 * list. A hosted game says how many players wait for an answer; a
 * joined one shows its host.
 */
export function MyGames({
  createdGames,
  joinedGames,
  loading,
  view,
  onView: setView,
  waiting,
}: {
  createdGames: Game[];
  joinedGames: Game[];
  loading: boolean;
  view: GamesView;
  onView: (v: GamesView) => void;
  /** Pending requests per hosted game. */
  waiting: Map<string, number>;
}) {

  const games = view === "created" ? createdGames : joinedGames;

  // Split into upcoming (live + upcoming) and past.
  // Upcoming sorted by soonest kickoff, past by most-recent first.
  const { upcoming, past } = useMemo(() => {
    const up: Game[] = [];
    const pastList: Game[] = [];
    for (const g of games) {
      if (getGameStatus(g) === "expired") pastList.push(g);
      else up.push(g);
    }
    up.sort((a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`));
    pastList.sort((a, b) => `${b.date}T${b.start_time}`.localeCompare(`${a.date}T${a.start_time}`));
    return { upcoming: up, past: pastList };
  }, [games]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border border-primary-200 rounded-2xl p-4 animate-pulse bg-white">
            <div className="w-2/3 h-5 bg-primary-100 rounded mb-2" />
            <div className="w-1/3 h-4 bg-primary-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Sub-tabs (Created / Joined) — with counts */}
      <div className="flex gap-2 mb-5">
        {(["created", "joined"] as const).map((k) => {
          const active = view === k;
          const count = k === "created" ? createdGames.length : joinedGames.length;
          return (
            <button
              key={k}
              aria-pressed={active}
              onClick={() => setView(k)}
              className={`text-[13px] font-bold px-4 py-2 rounded-full border-2 transition-all focus-neon ${
                active
                  ? "bg-primary-800 text-white border-primary-800"
                  : "text-primary-700 border-primary-200 bg-white hover:border-primary-300"
              }`}
            >
              {k === "created" ? "Hosted" : "Joined"} ({count})
            </button>
          );
        })}
      </div>

      {games.length === 0 ? (
        <EmptyState view={view} />
      ) : (
        <div className="space-y-6">
          {/* ── Upcoming — the important half ── */}
          {upcoming.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-semibold text-accent-600">
                  Upcoming · {upcoming.length}
                </p>
              </div>
              <div className="space-y-3">
                {upcoming.map((g) => <GameRow key={g.id} game={g} highlight host={view === "joined"} waiting={view === "created" ? waiting.get(g.id) ?? 0 : 0} />)}
              </div>
            </section>
          )}

          {/* ── Past — collapsed, muted ── */}
          {past.length > 0 && (
            <section>
              <p className="text-[11px] font-semibold text-primary-400 mb-3">
                Past · {past.length}
              </p>
              <div className="space-y-3 opacity-80">
                {past.map((g) => <GameRow key={g.id} game={g} host={view === "joined"} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact game row — big touch target, plenty of white space. */
function GameRow({ game, highlight = false, host = false, waiting = 0 }: { game: Game; highlight?: boolean; host?: boolean; waiting?: number }) {
  const status = getGameStatus(game);
  return (
    <Link href={`/game/${game.id}`} className="block group focus-neon rounded-2xl">
      <div
        className={`relative overflow-hidden rounded-2xl border bg-white p-4 transition-all ${
          highlight
            ? "border-primary-200 hover:border-accent-500 hover:shadow-card-hover"
            : "border-primary-200 hover:border-primary-300"
        }`}
      >
        {/* Accent left bar for upcoming */}
        {highlight && (
          <div
            className={`absolute left-0 top-0 bottom-0 w-1 ${
              status === "live" ? "bg-hot-500" : "bg-accent-500"
            }`}
            aria-hidden
          />
        )}
        <div className={highlight ? "pl-2" : ""}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 bg-accent-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
                {game.sport}
              </span>
            </div>
            <span
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                status === "live"
                  ? "bg-hot-500/10 text-hot-600 border border-hot-500/40"
                  : status === "expired"
                  ? "bg-primary-100 text-primary-500"
                  : "bg-accent-50 text-accent-700 border border-accent-500/40"
              }`}
            >
              {status === "live" ? "Live now" : status === "expired" ? "Ended" : "Upcoming"}
            </span>
          </div>

          <p className="font-display text-lg text-primary-800 leading-tight truncate">
            {game.turfs?.name || game.title}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[12px] text-primary-600">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-primary-400" />
              {formatDate(game.date)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-primary-400" />
              {formatTimeSlot(game.start_time, game.end_time)}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-primary-400" />
              <span className="tabular">{game.current_players}/{game.max_players}</span>
            </span>
          </div>

          {(host || waiting > 0) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {host && (
                <span className="flex items-center gap-1.5 min-w-0 text-[12px] text-primary-600">
                  <Avatar src={game.host_profile_image_url} name={game.host_name} size={20} />
                  <span className="truncate">Hosted by {game.host_name || "a TapTurf player"}</span>
                </span>
              )}
              {waiting > 0 && (
                <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-hot-500/10 text-hot-600 text-[12px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-hot-500" aria-hidden />
                  {waiting} {waiting === 1 ? "player wants" : "players want"} to join
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ view }: { view: GamesView }) {
  return (
    <div className="text-center py-14">
      <div className="w-14 h-14 bg-accent-50 border border-accent-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Trophy className="w-6 h-6 text-accent-600" />
      </div>
      <p className="text-[15px] font-semibold text-primary-800 mb-1">
        {view === "created" ? "No games yet" : "You haven't joined a game"}
      </p>
      <p className="text-[13px] text-primary-500 mb-6">
        {view === "created" ? "Host your first game — invite the crew" : "Find one that fits your squad"}
      </p>
      <Link
        href={view === "created" ? "/game/create" : "/games"}
        className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-bold px-5 py-3 rounded-full transition-colors shadow-neon focus-neon"
      >
        <Plus className="w-4 h-4" strokeWidth={2.75} />
        {view === "created" ? "Host a game" : "Browse games"}
      </Link>
    </div>
  );
}
