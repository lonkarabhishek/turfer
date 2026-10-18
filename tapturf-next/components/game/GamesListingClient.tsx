"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Search, Plus, SlidersHorizontal, Gamepad2, Zap, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { GameCard } from "./GameCard";
import { filterNonExpiredGames } from "@/lib/utils/game";
import { useAuth } from "@/components/auth/AuthProvider";
import { CityLine } from "@/components/city/CityLine";
import { guessCityFromAddress, labelFor, type CityScope } from "@/lib/city";
import type { CityLineProps } from "@/lib/cityLine";
import type { Game } from "@/types/game";

const SPORTS = ["All", "Cricket", "Box Cricket", "Football", "Basketball", "Tennis", "Pickleball"];
const SKILL_LEVELS = ["all", "beginner", "intermediate", "advanced"];

const noop = () => () => {};

function cityLabelOf(g: Game): string | undefined {
  const c = g.turfs?.city ?? guessCityFromAddress(g.turfs?.address);
  return c ? labelFor(c) : undefined;
}

/**
 * /games: the open games the server rendered for this page (one city's,
 * or every city's), filtered in memory by sport, skill and search. No
 * fetch on load. In a city view, games elsewhere sit below under their
 * own heading.
 */
export function GamesListingClient({
  initialGames,
  otherGames,
  scope,
  line,
  ask,
}: {
  initialGames: Game[];
  otherGames: Game[];
  scope: CityScope;
  line: CityLineProps;
  /** The first-visit city ask (all-India page only). */
  ask: ReactNode;
}) {
  const { user, login } = useAuth();
  const [sport, setSport] = useState("All");
  const [skillLevel, setSkillLevel] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const cityLabel = scope.kind === "city" ? scope.label : null;

  // The HTML can be up to a minute old (ISR): after hydration, drop games
  // that kicked off since. Same list as the server's until then.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const fresh = (list: Game[]) => (hydrated ? filterNonExpiredGames(list) : list);

  // Exactly the predicates the old Supabase query applied.
  const matches = (g: Game) => {
    if (sport !== "All" && g.sport !== sport) return false;
    if (skillLevel !== "all" && g.skill_level !== skillLevel) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return [g.turfs?.name, g.turfs?.address, g.sport, g.host_name]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(q));
  };
  const filteredGames = fresh(initialGames).filter(matches);
  const filteredOthers = fresh(otherGames).filter(matches);

  const handleHostClick = (e: React.MouseEvent) => {
    if (!user) {
      e.preventDefault();
      login();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8">
      {/* Page header */}
      <div className="flex items-end justify-between mb-5 gap-3">
        <div>
          <p className="text-[11px] font-mono text-accent-600 mb-2">
            On the pitch
          </p>
          <h1 className="font-display text-3xl md:text-5xl text-primary-800 leading-[0.92] tracking-tight">
            Open games
          </h1>
          <div className="mt-1">
            <CityLine {...line} />
          </div>
          <p className="text-sm text-primary-500 max-w-md">
            Join a squad tonight, or host your own.
          </p>
        </div>
        <Link
          href={user ? "/game/create" : "#"}
          onClick={handleHostClick}
          className="hidden sm:inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-bold px-5 py-3 rounded-full shadow-neon transition-all focus-neon"
        >
          <Plus className="w-4 h-4" strokeWidth={2.75} />
          Host game
        </Link>
      </div>

      {ask}

      {/* Search bar */}
      <div className="relative mb-3">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Turf, sport, host name…"
          className="w-full pl-11 pr-14 py-3.5 min-h-[52px] bg-white border-2 border-primary-200 rounded-full text-sm text-primary-800 placeholder:text-primary-400 focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 transition-all"
        />
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full transition-colors ${
            showFilters ? "bg-accent-500 text-white shadow-neon" : "text-primary-500 hover:bg-primary-100"
          }`}
          aria-label="Toggle filters"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Sport chips */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-4 -mx-4 px-4">
        {SPORTS.map((s) => (
          <button
            key={s}
            onClick={() => setSport(s)}
            className={`flex-shrink-0 px-4 py-2 min-h-[40px] rounded-full text-xs font-bold border-2 transition-all focus-neon ${
              sport === s
                ? "bg-accent-500 text-white border-accent-500 shadow-neon"
                : "bg-white text-primary-700 border-primary-200 hover:border-accent-500"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Skill level filter */}
      {showFilters && (
        <div className="mb-4 p-4 bg-primary-50 border border-primary-200 rounded-2xl">
          <p className="text-[10px] font-semibold text-primary-500 mb-2.5">
            Skill level
          </p>
          <div className="flex gap-2 flex-wrap">
            {SKILL_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => setSkillLevel(level)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-colors ${
                  skillLevel === level
                    ? "bg-accent-500 text-white border-accent-500"
                    : "bg-white text-primary-600 border-primary-200 hover:border-accent-500"
                }`}
              >
                {level === "all" ? "Anyone" : level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {filteredGames.length === 0 ? (
        cityLabel && !searchQuery && sport === "All" && skillLevel === "all" ? (
          <div className="mt-4 rounded-2xl border border-primary-200 bg-white p-5 flex flex-wrap items-center gap-3">
            <span className="w-10 h-10 shrink-0 rounded-xl bg-accent-50 text-accent-700 inline-flex items-center justify-center">
              <Gamepad2 className="w-5 h-5" />
            </span>
            <p className="flex-1 min-w-[12rem] text-[15px] font-semibold text-primary-900">No open games in {cityLabel} yet.</p>
            <Link
              href={user ? "/game/create" : "#"}
              onClick={handleHostClick}
              className="h-11 px-5 inline-flex items-center gap-2 rounded-full bg-primary-900 hover:bg-primary-800 text-white text-[14px] font-semibold press-tight focus-neon"
            >
              <Zap className="w-4 h-4" strokeWidth={2.5} />
              Host a game
            </Link>
            {otherGames.length > 0 && (
              <a
                href="#other-city-games"
                className="basis-full inline-flex items-center gap-1 h-11 text-[14px] font-semibold text-accent-700 hover:text-accent-800 focus-neon"
              >
                {otherGames.length.toLocaleString("en-IN")} open in other cities <ArrowUpRight className="w-4 h-4" />
              </a>
            )}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-white border border-primary-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Gamepad2 className="w-7 h-7 text-primary-400" />
            </div>
            <p className="font-display text-2xl text-primary-800 mb-1">No games yet</p>
            <p className="text-sm text-primary-500 mb-8">
              {searchQuery ? "Try a different search" : "Be the first to host one."}
            </p>
            <Link
              href={user ? "/game/create" : "#"}
              onClick={handleHostClick}
              className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-bold px-6 py-3 rounded-full shadow-neon transition-all focus-neon"
            >
              <Zap className="w-4 h-4" strokeWidth={2.75} />
              Host a game
            </Link>
          </div>
        )
      ) : (
        <>
          <p className="text-[11px] font-semibold text-primary-500 mb-4 mt-4">
            {cityLabel
              ? `${filteredGames.length} open game${filteredGames.length !== 1 ? "s" : ""} in ${cityLabel}`
              : `${filteredGames.length} game${filteredGames.length !== 1 ? "s" : ""}`}{" "}
            · Sorted by kickoff
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGames.map((game) => (
              <GameCard key={game.id} game={game} cityLabel={cityLabel ? undefined : cityLabelOf(game)} />
            ))}
          </div>
        </>
      )}

      {cityLabel && filteredOthers.length > 0 && (
        <section id="other-city-games" className="mt-12" style={{ scrollMarginTop: "4.5rem" }} aria-labelledby="other-city-games-h">
          <h2 id="other-city-games-h" className="font-display text-2xl md:text-3xl text-primary-800 tracking-tight">
            Open games in other cities
          </h2>
          <p className="text-[13px] text-primary-500 mt-1 mb-4">
            {filteredOthers.length} game{filteredOthers.length !== 1 ? "s" : ""} · Sorted by kickoff
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOthers.map((game) => (
              <GameCard key={game.id} game={game} cityLabel={cityLabelOf(game)} />
            ))}
          </div>
        </section>
      )}

      {/* Mobile host CTA fallback */}
      <div className="sm:hidden mt-8 text-center">
        <Link
          href={user ? "/game/create" : "#"}
          onClick={handleHostClick}
          className="inline-flex items-center gap-2 bg-accent-500 text-white text-sm font-bold px-6 py-3 rounded-full shadow-neon"
        >
          <Plus className="w-4 h-4" strokeWidth={2.75} />
          Host game
        </Link>
      </div>
    </div>
  );
}
