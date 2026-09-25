"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Search, SlidersHorizontal, ChevronDown, Navigation, Loader2, MapPin, X } from "lucide-react";
import { TurfCard } from "@/components/turf/TurfCard";
import type { Turf } from "@/types/turf";
import { getMinimumPrice } from "@/lib/utils/prices";
import { haversineKm, getUserLocation, type Coords } from "@/lib/utils/location";
import { getCityPref, isCity, labelFor, type CityId } from "@/lib/city";

// Order by frequency in the current DB — Football (166) and Box
// Cricket (103) dominate, so they're first. Box Cricket was missing
// entirely from the old list, hiding 103 venues behind an unclickable
// chip. Cricket Nets is a subset of Cricket for filtering purposes
// (the substring match already picks it up under "Cricket").
const SPORTS = [
  "Football",
  "Box Cricket",
  "Cricket",
  "Badminton",
  "Volleyball",
  "Yoga",
  "Pickleball",
  "Basketball",
  "Tennis",
];

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
  const [locErrorKind, setLocErrorKind] = useState<"denied" | "unavailable" | "timeout" | "other" | null>(null);

  // City scoping: the /turfs page is server-rendered with turfs from
  // both cities so search engines see everything, but visitors who
  // picked Nashik (or Pune) in the header expect this page to obey.
  // Read the pref on mount and re-read on the tapturf:city-changed
  // event dispatched by CityPicker so switching city updates the list
  // without a page reload. `showAllCities` lets a picked-city visitor
  // widen back to every city without clearing the header pill.
  const [pickedCity, setPickedCity] = useState<CityId | null>(null);
  const [showAllCities, setShowAllCities] = useState(false);
  useEffect(() => {
    const load = () => setPickedCity(getCityPref());
    load();
    const onChange = () => load();
    window.addEventListener("tapturf:city-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("tapturf:city-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  const activeCity = pickedCity && !showAllCities ? pickedCity : null;

  const handleLocate = useCallback(async () => {
    setLocating(true);
    setLocError("");
    setLocErrorKind(null);
    try {
      const coords = await getUserLocation();
      // Guard: a garbage-in position (some cordova wrappers hand back
      // non-numeric coords in edge cases) would silently corrupt every
      // sort key downstream and could crash the render. Reject early.
      if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
        throw new Error("Received invalid coordinates from the browser.");
      }
      setUserLocation(coords);
      setSortBy("nearby");
    } catch (err: unknown) {
      // Distinguish the three real geolocation error paths so the user
      // can act on the right one — the old generic message asked people
      // who'd already denied permission to "try again" pointlessly.
      const e = err as { code?: number; message?: string };
      if (e?.code === 1) {
        setLocErrorKind("denied");
        setLocError(
          "Location access is blocked. Enable it in your browser's site settings (address-bar 🔒 → Location → Allow), then reload.",
        );
      } else if (e?.code === 2) {
        setLocErrorKind("unavailable");
        setLocError("Your device couldn't determine location right now. Try again outdoors or with GPS on.");
      } else if (e?.code === 3) {
        setLocErrorKind("timeout");
        setLocError("Location request timed out. Please try again.");
      } else {
        setLocErrorKind("other");
        setLocError("Couldn't get location. Please try again.");
      }
    } finally {
      setLocating(false);
    }
  }, []);

  // Scope to picked city FIRST so distance/sort work on the visible set.
  const cityScoped = useMemo(() => {
    if (!activeCity) return turfs;
    return turfs.filter((t) => t.city === activeCity);
  }, [turfs, activeCity]);

  const turfsWithDistance = useMemo(() => {
    return cityScoped.map((t) => {
      let distanceKm: number | null = null;
      if (userLocation && Number.isFinite(t.lat) && Number.isFinite(t.lng)) {
        const d = haversineKm(userLocation, { lat: t.lat as number, lng: t.lng as number });
        // NaN → null, so sort comparators never see a poisoned value.
        distanceKm = Number.isFinite(d) ? d : null;
      }
      return { turf: t, distanceKm };
    });
  }, [cityScoped, userLocation]);

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
        case "price-low":
        case "price-high": {
          // Sort turfs without a real price to the end regardless of direction —
          // never coalesce them to 500 so they don't jumble ahead of cheap real listings.
          const ap = getMinimumPrice(a.turf);
          const bp = getMinimumPrice(b.turf);
          if (ap == null && bp == null) return 0;
          if (ap == null) return 1;
          if (bp == null) return -1;
          return sortBy === "price-low" ? ap - bp : bp - ap;
        }
        case "reviews":    return b.turf.total_reviews - a.turf.total_reviews;
        case "rating":
        default:           return b.turf.rating - a.turf.rating;
      }
    });

    return result;
  }, [turfsWithDistance, search, selectedSport, sortBy]);

  const availableSports = useMemo(() => {
    // Sport chips reflect the city-scoped turf set — if Nashik has no
    // Pickleball venues, don't dangle a dead chip for a Nashik visitor.
    const sportSet = new Set<string>();
    cityScoped.forEach((t) => t.sports.forEach((s) => sportSet.add(s)));
    return SPORTS.filter((s) =>
      Array.from(sportSet).some((ts) => ts.toLowerCase().includes(s.toLowerCase()))
    );
  }, [cityScoped]);

  // When the visitor switches city and the sport they had selected
  // isn't offered in the new city, clear it so the "0 results" empty
  // state doesn't lie about their filter.
  useEffect(() => {
    if (selectedSport && !availableSports.includes(selectedSport)) {
      setSelectedSport(null);
    }
  }, [availableSports, selectedSport]);

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

      {/* City scope banner — visible when a picked city is narrowing the
          list; lets the visitor widen back to both cities without
          clearing their header pill. */}
      {pickedCity && (
        <div className="mb-4 flex items-center gap-3 bg-white border border-primary-100 rounded-2xl px-4 py-2.5">
          <MapPin className="w-4 h-4 text-accent-600 shrink-0" />
          <p className="text-sm text-primary-700 flex-1 min-w-0">
            {showAllCities ? (
              <>Showing turfs across <span className="font-semibold">Nashik + Pune</span></>
            ) : (
              <>Showing turfs in <span className="font-semibold">{labelFor(pickedCity)}</span></>
            )}
            <span className="text-primary-400 ml-2 tabular-nums">
              {cityScoped.length} listed
            </span>
          </p>
          <button
            onClick={() => setShowAllCities((v) => !v)}
            className="text-xs font-semibold text-accent-600 hover:text-accent-700 whitespace-nowrap"
          >
            {showAllCities ? `Only ${labelFor(pickedCity)}` : "Show all cities"}
          </button>
        </div>
      )}

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
        <div className="mb-4 flex items-start gap-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          <span className="flex-1">{locError}</span>
          {locErrorKind !== "denied" && (
            <button
              onClick={handleLocate}
              disabled={locating}
              className="font-semibold text-red-700 hover:text-red-800 underline underline-offset-2 whitespace-nowrap disabled:opacity-60"
            >
              {locating ? "…" : "Retry"}
            </button>
          )}
          <button
            onClick={() => { setLocError(""); setLocErrorKind(null); }}
            aria-label="Dismiss"
            className="text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
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
