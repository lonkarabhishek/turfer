"use client";

import { useState, useSyncExternalStore } from "react";
import { CalendarDays } from "lucide-react";
import { GameCard } from "@/components/game/GameCard";
import { CreateGameHereButton } from "@/components/turf/CreateGameHereButton";
import { filterNonExpiredGames, sortGamesByDateTime } from "@/lib/utils/game";
import type { Game } from "@/types/game";

const noop = () => () => {};

/**
 * "Games at this turf" on the turf profile: upcoming open games here,
 * then the host CTA right below. The games come with the page (turf_page)
 * instead of a browser query per view (20 Oct outage); the cache queue
 * refreshes the page when a game here is created or changes.
 */
export function TurfGames({
  turfId,
  turfName,
  initialGames,
  renderedAt,
}: {
  turfId: string;
  turfName: string;
  /** Upcoming games here from the server render, venue attached. */
  initialGames: Game[];
  /** When the server rendered them: dates read relative to it until hydration. */
  renderedAt: number;
}) {
  const [showAll, setShowAll] = useState(false);

  // The HTML can be hours old (ISR). Until hydration, render exactly what
  // the server did; after it, drop games that kicked off since and read
  // "Today" against now (lib/utils/game.ts reads both sides in IST).
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const now = hydrated ? undefined : renderedAt;
  const games = sortGamesByDateTime(filterNonExpiredGames(initialGames, now));

  const visible = showAll ? games : games.slice(0, 3);

  return (
    <section className="section-divider" aria-labelledby="turf-games">
      <div className="flex items-end justify-between gap-4 mb-1">
        <h2 id="turf-games" className="text-[22px] font-bold text-primary-900 font-display">
          Games at this turf
        </h2>
        {games.length > 0 && (
          <span className="text-[14px] text-primary-500 shrink-0 tabular-nums">
            {games.length} upcoming
          </span>
        )}
      </div>
      <p className="text-[14px] text-primary-500 mb-5">
        Join a game that&apos;s already on, or host your own.
      </p>

      {games.length === 0 ? (
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
              <GameCard key={g.id} game={g} hideVenue now={now} />
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
