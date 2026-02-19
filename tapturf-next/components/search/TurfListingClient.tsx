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
      {/* Search bar — Airbnb-style rounded with shadow */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, area, or sport..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 rounded-full border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent shadow-sm placeholder:text-gray-400"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-3 rounded-full border text-sm font-medium transition-all md:hidden ${
            showFilters
              ? "border-gray-900 bg-gray-900 text-white"
              : "border-gray-300 text-gray-700 hover:border-gray-900"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Filters — Airbnb chip style */}
      <div
        className={`${showFilters ? "block" : "hidden"} md:block mb-6`}
      >
        <div className="flex items-center gap-6 flex-wrap">
          {/* Sport chips */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedSport(null)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                !selectedSport
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300 hover:border-gray-900"
              }`}
            >
              All
            </button>
            {availableSports.map((sport) => (
              <button
                key={sport}
                onClick={() =>
                  setSelectedSport(selectedSport === sport ? null : sport)
                }
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                  selectedSport === sport
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-700 border-gray-300 hover:border-gray-900"
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
              className="appearance-none text-sm font-medium border border-gray-300 rounded-full px-4 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white cursor-pointer hover:border-gray-900 transition-colors"
            >
              {Object.entries(SORT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-gray-500 mb-6">
        {filteredTurfs.length} turf{filteredTurfs.length !== 1 ? "s" : ""}{" "}
        {search || selectedSport ? "found" : "available"}
      </p>

      {/* Grid — Airbnb uses generous gap */}
      {filteredTurfs.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredTurfs.map((turf) => (
            <TurfCard key={turf.id} turf={turf} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">🏟️</p>
          <p className="text-lg font-semibold text-gray-900">No turfs found</p>
          <p className="text-sm text-gray-500 mt-2">
            Try adjusting your search or filters
          </p>
          {(search || selectedSport) && (
            <button
              onClick={() => {
                setSearch("");
                setSelectedSport(null);
              }}
              className="mt-4 text-sm font-semibold text-gray-900 underline underline-offset-4 hover:text-gray-600 transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
