"use client";

import { useState, useMemo } from "react";
import { Search, SlidersHorizontal, ChevronDown } from "lucide-react";
import { TurfCard } from "@/components/turf/TurfCard";
import type { Turf } from "@/types/turf";
import { getMinimumPrice } from "@/lib/utils/prices";

const SPORTS = [
  "Football",
  "Cricket",
  "Basketball",
  "Badminton",
  "Tennis",
  "Pickleball",
  "Volleyball",
  "Yoga",
];

type SortOption = "rating" | "price-low" | "price-high" | "reviews";

const SORT_LABELS: Record<SortOption, string> = {
  rating: "Top rated",
  reviews: "Most reviewed",
  "price-low": "Price: Low to High",
  "price-high": "Price: High to Low",
};

export function TurfListingClient({ turfs }: { turfs: Turf[] }) {
  const [search, setSearch] = useState("");
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("rating");
  const [showFilters, setShowFilters] = useState(false);

  const filteredTurfs = useMemo(() => {
    let result = turfs;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.address.toLowerCase().includes(q) ||
          t.sports.some((s) => s.toLowerCase().includes(q))
      );
    }

    if (selectedSport) {
      const sportLower = selectedSport.toLowerCase();
      result = result.filter((t) =>
        t.sports.some((s) => s.toLowerCase().includes(sportLower))
      );
    }

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "price-low":
          return getMinimumPrice(a) - getMinimumPrice(b);
        case "price-high":
          return getMinimumPrice(b) - getMinimumPrice(a);
        case "reviews":
          return b.total_reviews - a.total_reviews;
        case "rating":
        default:
          return b.rating - a.rating;
      }
    });

    return result;
  }, [turfs, search, selectedSport, sortBy]);

  const availableSports = useMemo(() => {
    const sportSet = new Set<string>();
    turfs.forEach((t) => t.sports.forEach((s) => sportSet.add(s)));
    return SPORTS.filter((s) =>
      Array.from(sportSet).some((ts) =>
        ts.toLowerCase().includes(s.toLowerCase())
      )
    );
  }, [turfs]);

  return (
    <div>
      {/* Search bar */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-300" />
          <input
            type="text"
            placeholder="Search by name, area, or sport..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 min-h-[44px] rounded-full border border-cream-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm placeholder:text-primary-300 text-primary-700"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-3 rounded-full border text-sm font-medium transition-all md:hidden ${
            showFilters
              ? "border-primary-600 bg-primary-600 text-white"
              : "border-cream-300 bg-white text-primary-600 hover:border-primary-300"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Filters */}
      <div className={`${showFilters ? "block" : "hidden"} md:block mb-6`}>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Sport chips */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedSport(null)}
              className={`px-4 py-2 min-h-[44px] rounded-full text-sm font-medium transition-all border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
                !selectedSport
                  ? "bg-primary-600 text-white border-primary-600"
                  : "bg-white text-primary-600 border-cream-300 hover:border-primary-300 hover:bg-primary-50"
              }`}
            >
              All Sports
            </button>
            {availableSports.map((sport) => (
              <button
                key={sport}
                onClick={() =>
                  setSelectedSport(selectedSport === sport ? null : sport)
                }
                className={`px-4 py-2 min-h-[44px] rounded-full text-sm font-medium transition-all border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
                  selectedSport === sport
                    ? "bg-primary-600 text-white border-primary-600"
                    : "bg-white text-primary-600 border-cream-300 hover:border-primary-300 hover:bg-primary-50"
                }`}
              >
                {sport}
              </button>
            ))}
          </div>

          {/* Sort dropdown */}
          <div className="relative ml-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="appearance-none text-sm font-medium border border-cream-300 rounded-full px-4 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white cursor-pointer hover:border-primary-300 transition-colors text-primary-700"
            >
              {Object.entries(SORT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-primary-400 mb-6">
        {filteredTurfs.length} turf{filteredTurfs.length !== 1 ? "s" : ""}{" "}
        {search || selectedSport ? "found" : "available"}
      </p>

      {/* Grid */}
      {filteredTurfs.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredTurfs.map((turf) => (
            <TurfCard key={turf.id} turf={turf} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">🏟️</p>
          <p className="text-lg font-semibold text-primary-800 font-serif">No turfs found</p>
          <p className="text-sm text-primary-400 mt-2">
            Try adjusting your search or filters
          </p>
          {(search || selectedSport) && (
            <button
              onClick={() => {
                setSearch("");
                setSelectedSport(null);
              }}
              className="mt-4 text-sm font-semibold text-primary-600 underline underline-offset-4 hover:text-primary-400 transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
