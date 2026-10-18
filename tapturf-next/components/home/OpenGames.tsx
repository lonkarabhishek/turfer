"use client";

import Link from "next/link";
import { ArrowUpRight, Users } from "lucide-react";
import { labelFor } from "@/lib/city";
import type { HomeGame } from "@/lib/home/types";
import { useCityPref, useCitySwapCount } from "./useCityPref";

/**
 * Open games in the visitor's city, one tap each, or the invitation to
 * host when there is none. Zero games is the primary design: the empty
 * card still links /games and /game/create in the server HTML.
 */
export function OpenGames({ games, total }: { games: HomeGame[]; total: number }) {
  const pref = useCityPref();
  const inCity = pref ? games.filter((g) => g.city === pref) : games;
  const rows = inCity.slice(0, 3);

  // Fade only after a user-initiated city change, never at hydration.
  const swaps = useCitySwapCount(pref);

  const label = pref ? labelFor(pref) : null;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-12" aria-labelledby="open-games-h">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="open-games-h" className="font-display text-2xl md:text-3xl text-primary-800 tracking-tight">
            Open games
          </h2>
          {rows.length > 0 && (
            <p className="text-[13px] text-primary-500 mt-1 tabular-nums">
              {label ? `${inCity.length.toLocaleString("en-IN")} in ${label}` : `${total.toLocaleString("en-IN")} looking for players`}
            </p>
          )}
        </div>
        <Link
          href="/games"
          className="inline-flex items-center gap-1 text-sm font-semibold text-accent-600 hover:text-accent-700 whitespace-nowrap"
        >
          All games <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      <div key={pref ?? "all"} className={swaps > 0 ? "animate-fade-in" : ""}>
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
          <div className="mt-4 rounded-3xl bg-accent-50 border border-accent-200/60 p-5 md:p-7 md:flex md:items-center md:justify-between md:gap-6">
            <div className="md:flex md:items-center md:gap-5">
              <span className="w-11 h-11 rounded-xl bg-white text-accent-700 inline-flex items-center justify-center shadow-card shrink-0">
                <Users className="w-5 h-5" />
              </span>
              <div>
                <p className="mt-3 md:mt-0 text-[18px] font-semibold text-primary-900">
                  {label && total > 0 ? `No open games in ${label} yet.` : "Nothing open yet. Be the one who starts it."}
                </p>
                <p className="mt-1 text-[14px] text-primary-600 max-w-[40ch]">
                  {label && total > 0
                    ? `${total.toLocaleString("en-IN")} open in other cities. Start one here, or browse all of them.`
                    : "Pick a turf, set a time, share the link. Players request to join from the game page."}
                </p>
              </div>
            </div>
            <div className="mt-4 md:mt-0 flex flex-wrap gap-2 shrink-0">
              <Link
                href="/game/create"
                className="press-tight inline-flex items-center justify-center h-11 px-5 rounded-full bg-primary-900 hover:bg-primary-600 text-white text-[15px] font-semibold transition-colors"
              >
                Host a game
              </Link>
              <Link
                href="/games"
                className="press-tight inline-flex items-center justify-center h-11 px-5 rounded-full bg-white border border-primary-200 text-primary-900 text-[15px] font-semibold"
              >
                See all games
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
