"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Plus, Trophy, Clock, Users, Calendar } from "lucide-react";
import { getUserGames, getUserJoinedGames } from "@/lib/queries/games";
import { formatDate, formatTimeSlot, getGameStatus } from "@/lib/utils/game";
import type { Game } from "@/types/game";

type View = "created" | "joined";

/**
 * "Games" tab in the dashboard.
 * Always leads with the user's UPCOMING games (soonest first) — the
 * thing they actually opened the app to check — with past games
 * collapsed underneath.
 */
export function MyGames({ userId }: { userId: string }) {
  const [createdGames, setCreatedGames] = useState<Game[]>([]);
  const [joinedGames, setJoinedGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("created");

  useEffect(() => {
    const load = async () => {
      const [created, joined] = await Promise.all([
        getUserGames(userId),
        getUserJoinedGames(userId),
      ]);
      setCreatedGames(created.data);
      setJoinedGames(joined.data);
      setLoading(false);
    };
    load();
  }, [userId]);

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
              onClick={() => setView(k)}
              className={`text-[13px] font-bold uppercase tracking-wide px-4 py-2 rounded-full border-2 transition-all focus-neon ${
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
                <p className="text-[11px] font-semibold uppercase tracking-widest text-accent-600">
                  Upcoming · {upcoming.length}
                </p>
              </div>
              <div className="space-y-3">
                {upcoming.map((g) => <GameRow key={g.id} game={g} highlight />)}
              </div>
            </section>
          )}

          {/* ── Past — collapsed, muted ── */}
          {past.length > 0 && (
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-primary-400 mb-3">
                Past · {past.length}
              </p>
              <div className="space-y-3 opacity-80">
                {past.map((g) => <GameRow key={g.id} game={g} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact game row — big touch target, plenty of white space. */
function GameRow({ game, highlight = false }: { game: Game; highlight?: boolean }) {
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
              <span className="inline-flex items-center gap-1 bg-accent-500 text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
                {game.sport}
              </span>
            </div>
            <span
              className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${
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

          <p className="font-display uppercase text-lg text-primary-800 leading-tight tracking-wide truncate">
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
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ view }: { view: View }) {
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
        className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-bold uppercase tracking-wide px-5 py-3 rounded-full transition-colors shadow-neon focus-neon"
      >
        <Plus className="w-4 h-4" strokeWidth={2.75} />
        {view === "created" ? "Host a game" : "Browse games"}
      </Link>
    </div>
  );
}
