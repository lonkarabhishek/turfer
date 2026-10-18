"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronRight, Users } from "lucide-react";
import { labelFor } from "@/lib/city";
import type { HomeGame } from "@/lib/home/types";
import { useCityPref, useCitySwapCount } from "./useCityPref";

const MOBILE_PILL =
  "sm:hidden mt-3 flex h-11 items-center justify-center rounded-full border border-primary-200 text-[15px] font-semibold text-primary-900 press-tight focus-neon";

/**
 * Open games in the visitor's city, one tap each, or a single compact
 * invitation to host when there is none. Everything is shaped per city
 * on the server, so the count and the empty state are true for that
 * city. /games and /game/create are always in the server HTML.
 */
export function OpenGames({
  games,
  gamesByCity,
  total,
  totalByCity,
}: {
  games: HomeGame[];
  gamesByCity: Record<string, HomeGame[]>;
  total: number;
  totalByCity: Record<string, number>;
}) {
  const pref = useCityPref();
  const rows = pref ? (gamesByCity[pref] ?? []) : games;
  const cityTotal = pref ? (totalByCity[pref] ?? 0) : total;

  // Fade only after a user-initiated city change, never at hydration.
  const swaps = useCitySwapCount(pref);

  const label = pref ? labelFor(pref) : null;
  const subtitle =
    rows.length > 0 ? (label ? `${cityTotal.toLocaleString("en-IN")} in ${label}` : `${total.toLocaleString("en-IN")} looking for players`) : "";

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-12" aria-labelledby="open-games-h">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="open-games-h" className="font-display text-2xl md:text-3xl text-primary-800 tracking-tight">
            Open games
          </h2>
          {/* Always rendered so the heading block keeps its height across the city swap. */}
          <p className="text-[13px] text-primary-500 mt-1 tabular-nums min-h-[1.25rem]">{subtitle}</p>
        </div>
        <Link
          href="/games"
          className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-accent-600 hover:text-accent-700 whitespace-nowrap"
        >
          All games <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      <div key={pref ?? "all"} className={`min-h-[64px] ${swaps > 0 ? "animate-fade-in" : ""}`}>
        {rows.length > 0 ? (
          <ul className="mt-4 space-y-2 md:grid md:grid-cols-3 md:gap-3 md:space-y-0">
            {rows.map((g) => {
              const [wd, day, mon] = g.when.split(" ");
              const bar = g.spotsLeft === 0 ? "bg-primary-200" : g.spotsLeft <= 2 ? "bg-hot-500" : "bg-accent-500";
              return (
                <li key={g.id}>
                  <Link
                    href={`/game/${g.id}`}
                    className="card-lift press-tight relative overflow-hidden flex items-center gap-3 rounded-2xl border border-primary-200 bg-white p-3.5 pl-4 hover:border-accent-500 hover:shadow-card-hover min-h-[64px]"
                  >
                    <span aria-hidden className={`absolute left-0 inset-y-0 w-1 ${bar}`} />
                    <span className="w-14 shrink-0 text-center rounded-xl bg-accent-50 py-1.5">
                      <span className="block text-[11px] font-semibold text-accent-700">{wd}</span>
                      <span className="block text-[17px] font-display text-primary-900 leading-none">{day}</span>
                      <span className="block text-[11px] text-primary-500">{mon}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-primary-900 truncate">
                        {g.turfName ? `${g.sport} at ${g.turfName}` : g.sport}
                      </span>
                      <span className="block text-[13px] text-primary-500 truncate">
                        {g.time}
                        {g.place ? ` · ${g.place}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={`block text-[12px] font-semibold ${
                          g.spotsLeft === 0 ? "text-primary-400" : g.spotsLeft <= 2 ? "text-hot-600" : "text-primary-900"
                        }`}
                      >
                        {g.spotsLeft === 0 ? "Full" : g.spotsLeft === 1 ? "1 spot" : `${g.spotsLeft} spots`}
                      </span>
                      {g.price > 0 && (
                        <span className="block text-[12px] text-primary-500 tabular-nums">₹{g.price.toLocaleString("en-IN")}/player</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Link
            href="/game/create"
            className="card-lift press-tight focus-neon mt-4 flex items-center gap-3 rounded-2xl border border-primary-200 bg-white p-4 min-h-[64px] hover:border-accent-500 hover:shadow-card-hover"
          >
            <span className="shrink-0 w-10 h-10 rounded-xl bg-accent-50 text-accent-700 inline-flex items-center justify-center">
              <Users className="w-5 h-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-primary-900">
                {label ? `No open games in ${label} yet.` : "No open games yet. Be the one who starts it."}
              </span>
              <span className="block text-[13px] text-primary-500 mt-0.5">
                {label && total > 0
                  ? `${total.toLocaleString("en-IN")} open in other cities. Host one here, players request to join from the game page.`
                  : "Host one. Pick a turf, set a time, share the link."}
              </span>
            </span>
            <ChevronRight className="w-5 h-5 shrink-0 text-primary-400" aria-hidden />
          </Link>
        )}
      </div>

      <Link href="/games" className={MOBILE_PILL}>
        All games
      </Link>
    </section>
  );
}
