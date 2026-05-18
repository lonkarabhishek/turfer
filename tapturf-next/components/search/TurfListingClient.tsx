"use client";

import { useState, useMemo, useCallback } from "react";
import { Search, SlidersHorizontal, ChevronDown, Navigation, Loader2, MapPin } from "lucide-react";
import { TurfCard } from "@/components/turf/TurfCard";
import type { Turf } from "@/types/turf";
import { getMinimumPrice } from "@/lib/utils/prices";
import { haversineKm, getUserLocation, type Coords } from "@/lib/utils/location";

const SPORTS = ["Football", "Cricket", "Basketball", "Badminton", "Tennis", "Pickleball", "Volleyball", "Yoga"];

type SortOption = "nearby" | "rating" | "price-low" | "price-high" | "reviews";

const SORT_LABELS: Record<SortOption, string> = {
  nearby:      "Nearest first",
  rating:      "Top rated",
  reviews:     "Most reviewed",
  "price-low": "Price: Low to High",
  "price-high":"Price: High to Low",
};

export function TurfListingClient({ turfs }: { turfs: Turf[] }) {
  const [search, setSearch] = useState("");
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("rating");
  const [showFilters, setShowFilters] = useState(false);
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");

  const handleLocate = useCallback(async () => {
    setLocating(true);
    setLocError("");
    try {
      const coords = await getUserLocation();
      setUserLocation(coords);
      setSortBy("nearby");
    } catch {
      setLocError("Couldn't get location. Please allow access and try again.");
    } finally {
      setLocating(false);
    }
  }, []);

  const turfsWithDistance = useMemo(() => {
    return turfs.map((t) => ({
      turf: t,
      distanceKm:
        userLocation && t.lat != null && t.lng != null
          ? haversineKm(userLocation, { lat: t.lat, lng: t.lng })
          : null,
    }));
  }, [turfs, userLocation]);

  const filtered = useMemo(() => {
    let result = turfsWithDistance;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(({ turf: t }) =>
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q) ||
        t.sports.some((s) => s.toLowerCase().includes(q))
      );
    }

    if (selectedSport) {
      const sportLower = selectedSport.toLowerCase();
      result = result.filter(({ turf: t }) =>
        t.sports.some((s) => s.toLowerCase().includes(sportLower))
      );
    }

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "nearby":
          if (a.distanceKm == null && b.distanceKm == null) return b.turf.rating - a.turf.rating;
          if (a.distanceKm == null) return 1;
          if (b.distanceKm == null) return -1;
          return a.distanceKm - b.distanceKm;
        case "price-low":  return getMinimumPrice(a.turf) - getMinimumPrice(b.turf);
        case "price-high": return getMinimumPrice(b.turf) - getMinimumPrice(a.turf);
        case "reviews":    return b.turf.total_reviews - a.turf.total_reviews;
        case "rating":
        default:           return b.turf.rating - a.turf.rating;
      }
    });

    return result;
  }, [turfsWithDistance, search, selectedSport, sortBy]);

  const availableSports = useMemo(() => {
    const sportSet = new Set<string>();
    turfs.forEach((t) => t.sports.forEach((s) => sportSet.add(s)));
    return SPORTS.filter((s) =>
      Array.from(sportSet).some((ts) => ts.toLowerCase().includes(s.toLowerCase()))
    );
  }, [turfs]);

  const nearbyCount = filtered.filter(({ distanceKm }) => distanceKm != null && distanceKm <= 5).length;

  return (
    <div>
      {/* Search + filter toggle row */}
      <div className="flex gap-3 mb-4">
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
            showFilters ? "border-primary-600 bg-primary-600 text-white" : "border-cream-300 bg-white text-primary-600 hover:border-primary-300"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Location banner */}
      {!userLocation ? (
        <div className="mb-4 flex items-center gap-3 bg-primary-50 border border-primary-100 rounded-2xl px-4 py-3">
          <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center shrink-0">
            <Navigation className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary-800">Find turfs near you</p>
            <p className="text-xs text-primary-400 truncate">See distance and sort by closest</p>
          </div>
          <button
            onClick={handleLocate}
            disabled={locating}
            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 shrink-0"
          >
            {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
            {locating ? "Locating..." : "Use my location"}
          </button>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 text-xs text-primary-500 px-1">
          <MapPin className="w-3.5 h-3.5 text-primary-400" />
          <span>Showing distances from your location</span>
          {nearbyCount > 0 && (
            <span className="ml-1 bg-primary-100 text-primary-700 font-semibold px-2 py-0.5 rounded-full">
              {nearbyCount} within 5 km
            </span>
          )}
          <button
            onClick={() => { setUserLocation(null); if (sortBy === "nearby") setSortBy("rating"); }}
            className="ml-auto text-primary-400 hover:text-primary-600 underline underline-offset-2 cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      {locError && (
        <p className="mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{locError}</p>
      )}

      {/* Filters */}
      <div className={`${showFilters ? "block" : "hidden"} md:block mb-6`}>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Sport chips */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedSport(null)}
              className={`px-4 py-2 min-h-[44px] rounded-full text-sm font-medium transition-all border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
                !selectedSport ? "bg-primary-600 text-white border-primary-600" : "bg-white text-primary-600 border-cream-300 hover:border-primary-300 hover:bg-primary-50"
              }`}
            >
              All Sports
            </button>
            {availableSports.map((sport) => (
              <button
                key={sport}
                onClick={() => setSelectedSport(selectedSport === sport ? null : sport)}
                className={`px-4 py-2 min-h-[44px] rounded-full text-sm font-medium transition-all border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
                  selectedSport === sport ? "bg-primary-600 text-white border-primary-600" : "bg-white text-primary-600 border-cream-300 hover:border-primary-300 hover:bg-primary-50"
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
              {userLocation && <option value="nearby">{SORT_LABELS.nearby}</option>}
              {(Object.entries(SORT_LABELS) as [SortOption, string][])
                .filter(([k]) => k !== "nearby")
                .map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-primary-400 mb-6">
        {filtered.length} turf{filtered.length !== 1 ? "s" : ""}{" "}
        {search || selectedSport ? "found" : "available"}
        {userLocation && sortBy === "nearby" && " · sorted by distance"}
      </p>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filtered.map(({ turf, distanceKm }) => (
            <TurfCard key={turf.id} turf={turf} distanceKm={distanceKm} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">🏟️</p>
          <p className="text-lg font-semibold text-primary-800 font-serif">No turfs found</p>
          <p className="text-sm text-primary-400 mt-2">Try adjusting your search or filters</p>
          {(search || selectedSport) && (
            <button
              onClick={() => { setSearch(""); setSelectedSport(null); }}
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
