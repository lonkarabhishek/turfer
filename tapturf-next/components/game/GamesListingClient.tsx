"use client";

import { useState, useEffect } from "react";
import { Search, Plus, SlidersHorizontal, Gamepad2, Zap } from "lucide-react";
import Link from "next/link";
import { GameCard } from "./GameCard";
import { getAvailableGames } from "@/lib/queries/games";
import { filterNonExpiredGames, sortGamesByDateTime } from "@/lib/utils/game";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Game } from "@/types/game";

const SPORTS = ["All", "Cricket", "Box Cricket", "Football", "Basketball", "Tennis", "Pickleball"];
const SKILL_LEVELS = ["all", "beginner", "intermediate", "advanced"];

export function GamesListingClient() {
  const { user, login } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState("All");
  const [skillLevel, setSkillLevel] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const filters: { sport?: string; skillLevel?: string } = {};
      if (sport !== "All") filters.sport = sport;
      if (skillLevel !== "all") filters.skillLevel = skillLevel;

      const { data } = await getAvailableGames(filters);
      const active = filterNonExpiredGames(data);
      const sorted = sortGamesByDateTime(active);
      setGames(sorted);
      setLoading(false);
    };
    load();
  }, [sport, skillLevel]);

  const filteredGames = searchQuery
    ? games.filter((g) =>
        [g.turfs?.name, g.turfs?.address, g.sport, g.host_name]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : games;

  const handleHostClick = (e: React.MouseEvent) => {
    if (!user) {
      e.preventDefault();
      login();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Page header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-accent-400 mb-2">
            // On the pitch
          </p>
          <h1 className="font-display uppercase text-4xl md:text-6xl text-white leading-[0.9] tracking-tight">
            Open games
          </h1>
          <p className="text-sm text-white/50 mt-2 max-w-md">
            Join a squad tonight, or host your own.
          </p>
        </div>
        <Link
          href={user ? "/game/create" : "#"}
          onClick={handleHostClick}
          className="hidden sm:inline-flex items-center gap-2 bg-accent-400 hover:bg-accent-300 text-primary-950 text-sm font-bold uppercase tracking-wide px-5 py-3 rounded-full shadow-neon transition-all focus-neon"
        >
          <Plus className="w-4 h-4" strokeWidth={2.75} />
          Host game
        </Link>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Turf, sport, host name…"
          className="w-full pl-11 pr-14 py-3.5 min-h-[52px] bg-cream-200 border border-white/10 rounded-full text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-400/30 transition-all"
        />
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full transition-colors ${
            showFilters ? "bg-accent-400 text-primary-950 shadow-neon" : "text-white/60 hover:bg-white/10"
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
            className={`flex-shrink-0 px-4 py-2 min-h-[40px] rounded-full text-xs font-bold uppercase tracking-wide border transition-all focus-neon ${
              sport === s
                ? "bg-accent-400 text-primary-950 border-accent-400 shadow-neon"
                : "bg-white/[0.03] text-white/70 border-white/10 hover:border-accent-400/40 hover:text-white"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Skill level filter (collapsible) */}
      {showFilters && (
        <div className="mb-4 p-4 bg-cream-200 border border-white/10 rounded-2xl">
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/50 mb-2.5">
            Skill level
          </p>
          <div className="flex gap-2 flex-wrap">
            {SKILL_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => setSkillLevel(level)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border transition-colors ${
                  skillLevel === level
                    ? "bg-accent-400 text-primary-950 border-accent-400"
                    : "bg-white/[0.03] text-white/60 border-white/10 hover:border-accent-400/40"
                }`}
              >
                {level === "all" ? "Anyone" : level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="border border-white/10 rounded-2xl overflow-hidden animate-pulse bg-cream-200">
              <div className="w-1 h-full absolute bg-white/10" />
              <div className="p-5 pl-6">
                <div className="flex gap-2 mb-3">
                  <div className="w-20 h-6 bg-white/10 rounded-full" />
                  <div className="w-16 h-6 bg-white/5 rounded-full" />
                </div>
                <div className="w-3/4 h-5 bg-white/10 rounded mb-2" />
                <div className="w-1/2 h-4 bg-white/5 rounded mb-4" />
                <div className="w-full h-1.5 bg-white/5 rounded-full mb-3" />
                <div className="flex justify-between pt-3 border-t border-white/5">
                  <div className="w-24 h-5 bg-white/5 rounded" />
                  <div className="w-16 h-5 bg-white/5 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-cream-200 border border-white/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Gamepad2 className="w-7 h-7 text-white/40" />
          </div>
          <p className="font-display uppercase text-2xl text-white mb-1 tracking-wide">No games yet</p>
          <p className="text-sm text-white/50 mb-8">
            {searchQuery ? "Try a different search" : "Be the first — host one."}
          </p>
          <Link
            href={user ? "/game/create" : "#"}
            onClick={handleHostClick}
            className="inline-flex items-center gap-2 bg-accent-400 hover:bg-accent-300 text-primary-950 text-sm font-bold uppercase tracking-wide px-6 py-3 rounded-full shadow-neon transition-all focus-neon"
          >
            <Zap className="w-4 h-4" strokeWidth={2.75} />
            Host a game
          </Link>
        </div>
      ) : (
        <>
          <p className="text-[11px] font-mono uppercase tracking-widest text-white/50 mb-4 mt-6">
            {filteredGames.length} game{filteredGames.length !== 1 ? "s" : ""} · Sorted by kickoff
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGames.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </>
      )}

      {/* Mobile host CTA (sticky floating on mobile is handled by MobileNav "Host" button; this is a page-inline fallback) */}
      <div className="sm:hidden mt-8 text-center">
        <Link
          href={user ? "/game/create" : "#"}
          onClick={handleHostClick}
          className="inline-flex items-center gap-2 bg-accent-400 text-primary-950 text-sm font-bold uppercase tracking-wide px-6 py-3 rounded-full shadow-neon"
        >
          <Plus className="w-4 h-4" strokeWidth={2.75} />
          Host game
        </Link>
      </div>
    </div>
  );
}
