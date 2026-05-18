"use client";

import { useState, useEffect } from "react";
import { Search, Plus, SlidersHorizontal, Gamepad2 } from "lucide-react";
import Link from "next/link";
import { GameCard } from "./GameCard";
import { getAvailableGames } from "@/lib/queries/games";
import { filterNonExpiredGames, sortGamesByDateTime } from "@/lib/utils/game";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Game } from "@/types/game";

const SPORTS = ["All", "Football", "Cricket", "Box Cricket", "Basketball", "Tennis", "Pickleball"];
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-semibold text-accent-600 uppercase tracking-widest mb-1">
            Community
          </p>
          <h1 className="text-2xl font-bold text-primary-800 font-serif">Open Games</h1>
          <p className="text-sm text-primary-400 mt-0.5">Join or create a game near you</p>
        </div>
        <Link
          href={user ? "/game/create" : "#"}
          onClick={(e) => {
            if (!user) {
              e.preventDefault();
              login();
            }
          }}
          className="flex items-center gap-2 bg-primary-600 text-white text-sm font-bold px-4 py-2.5 rounded-full hover:bg-primary-700 transition-colors shadow-md shadow-primary-600/20"
        >
          <Plus className="w-4 h-4" />
          Create Game
        </Link>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-primary-300" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by turf, sport, or host..."
          className="w-full pl-10 pr-12 py-3 min-h-[44px] bg-white border border-cream-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all placeholder:text-primary-300 text-primary-700"
        />
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-colors ${
            showFilters ? "bg-primary-600 text-white" : "text-primary-400 hover:bg-cream-200"
          }`}
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
            className={`flex-shrink-0 px-4 py-2 min-h-[44px] rounded-full text-sm font-medium border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
              sport === s
                ? "bg-primary-600 text-white border-primary-600 shadow-sm"
                : "bg-white text-primary-600 border-cream-300 hover:border-primary-300 hover:bg-primary-50"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Skill level filter (collapsible) */}
      {showFilters && (
        <div className="mb-4 p-4 bg-primary-50 border border-primary-100 rounded-xl">
          <p className="text-sm font-semibold text-primary-700 mb-2 uppercase tracking-wider text-xs">Skill Level</p>
          <div className="flex gap-2 flex-wrap">
            {SKILL_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => setSkillLevel(level)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  skillLevel === level
                    ? "bg-primary-600 text-white border-primary-600"
                    : "bg-white text-primary-600 border-cream-300 hover:border-primary-300"
                }`}
              >
                {level === "all" ? "All levels" : level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="border border-cream-300 rounded-2xl overflow-hidden animate-pulse bg-white">
              <div className="h-1 bg-primary-200" />
              <div className="p-5">
                <div className="flex gap-2 mb-3">
                  <div className="w-20 h-6 bg-primary-100 rounded-full" />
                  <div className="w-16 h-6 bg-cream-200 rounded-full" />
                </div>
                <div className="w-3/4 h-5 bg-cream-200 rounded mb-2" />
                <div className="w-1/2 h-4 bg-cream-200 rounded mb-4" />
                <div className="w-full h-1.5 bg-cream-200 rounded-full mb-3" />
                <div className="flex justify-between pt-3 border-t border-cream-200">
                  <div className="w-24 h-5 bg-cream-200 rounded" />
                  <div className="w-16 h-5 bg-cream-200 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-primary-50 border border-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Gamepad2 className="w-7 h-7 text-primary-300" />
          </div>
          <p className="text-lg font-semibold text-primary-800 font-serif mb-1">No games found</p>
          <p className="text-sm text-primary-400 mb-6">
            {searchQuery ? "Try adjusting your search" : "Be the first to create a game!"}
          </p>
          <Link
            href={user ? "/game/create" : "#"}
            onClick={(e) => {
              if (!user) {
                e.preventDefault();
                login();
              }
            }}
            className="inline-flex items-center gap-2 bg-primary-600 text-white text-sm font-bold px-5 py-2.5 rounded-full hover:bg-primary-700 transition-colors shadow-md shadow-primary-600/20"
          >
            <Plus className="w-4 h-4" />
            Create a Game
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-primary-400 mb-4">
            {filteredGames.length} game{filteredGames.length !== 1 ? "s" : ""} available
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGames.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
