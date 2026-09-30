"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { GameCard } from "@/components/game/GameCard";
import { CreateGameHereButton } from "@/components/turf/CreateGameHereButton";
import { getUpcomingGamesForTurf } from "@/lib/queries/games";
import { filterNonExpiredGames, sortGamesByDateTime } from "@/lib/utils/game";
import type { Game } from "@/types/game";

/**
 * "Games at this turf" on the turf profile: upcoming open games here,
 * then the host CTA right below. Fetched client-side because the turf
 * page is cached for an hour and games come and go much faster.
 */
export function TurfGames({
  turfId,
  turfName,
  turfAddress,
}: {
  turfId: string;
  turfName: string;
  turfAddress: string;
}) {
  const [games, setGames] = useState<Game[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    getUpcomingGamesForTurf(turfId).then((rows) => {
      if (!alive) return;
      // GameCard reads the venue from game.turfs; we already know it.
      const withTurf = rows.map((g) => ({
        ...g,
        turfs: { id: turfId, name: turfName, address: turfAddress },
      }));
      setGames(sortGamesByDateTime(filterNonExpiredGames(withTurf)));
    });
    return () => {
      alive = false;
    };
  }, [turfId, turfName, turfAddress]);

  const visible = showAll ? games ?? [] : (games ?? []).slice(0, 3);

  return (
    <section className="section-divider" aria-labelledby="turf-games">
      <div className="flex items-end justify-between gap-4 mb-1">
        <h2 id="turf-games" className="text-[22px] font-bold text-primary-900 font-display">
          Games at this turf
        </h2>
        {games && games.length > 0 && (
          <span className="text-[14px] text-primary-500 shrink-0 tabular-nums">
            {games.length} upcoming
          </span>
        )}
      </div>
      <p className="text-[14px] text-primary-500 mb-5">
        Join a game that&apos;s already on, or host your own.
      </p>

      {games === null ? (
        <div className="h-28 rounded-2xl bg-primary-50 animate-pulse mb-4" />
      ) : games.length === 0 ? (
        <div className="rounded-2xl bg-primary-50 px-5 py-6 text-center mb-4">
          <div className="mx-auto mb-3 w-11 h-11 rounded-full bg-white flex items-center justify-center shadow-soft">
            <CalendarDays className="w-5 h-5 text-primary-400" />
          </div>
          <p className="text-[15px] font-semibold text-primary-900">No games scheduled here yet</p>
          <p className="mt-1 text-[14px] text-primary-500">Be the first to host one and find players.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {visible.map((g) => (
              <GameCard key={g.id} game={g} hideVenue />
            ))}
          </div>
          {games.length > 3 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mb-4 text-[15px] text-accent-600 hover:text-accent-700"
            >
              {showAll ? "Show less" : `Show all ${games.length} games`}
            </button>
          )}
        </>
      )}

      {/* Hosting sits right under the list: see what's on, then host. */}
      <CreateGameHereButton turfId={turfId} turfName={turfName} variant="inline" />
    </section>
  );
}
