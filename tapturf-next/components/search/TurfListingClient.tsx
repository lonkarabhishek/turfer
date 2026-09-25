"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Search, ChevronDown, Navigation, Loader2, X } from "lucide-react";
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
      {/* Search field, iOS style: filled, borderless. */}
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-primary-400" />
        <input
          type="search"
          placeholder="Search by name, area, or sport"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 h-11 rounded-xl bg-primary-100 text-[16px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
        />
      </div>

      {/* Sport chips: always visible, scroll sideways on phones. */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide">
        {[null, ...availableSports].map((sport) => {
          const active = selectedSport === sport;
          return (
            <button
              key={sport ?? "all"}
              onClick={() => setSelectedSport(sport && selectedSport === sport ? null : sport)}
              className={`shrink-0 h-9 px-4 rounded-full text-[14px] font-medium transition-colors ${
                active ? "bg-primary-900 text-white" : "bg-primary-100 text-primary-900 hover:bg-primary-200"
              }`}
            >
              {sport ?? "All"}
            </button>
          );
        })}
      </div>

      {/* One quiet row: count + scope on the left, location + sort on the right. */}
      <div className="mb-5 flex items-center gap-3 text-[14px]">
        <p className="text-primary-500 min-w-0 truncate">
          <span className="tabular-nums">{filtered.length}</span> turf{filtered.length !== 1 ? "s" : ""}
          {pickedCity && !showAllCities && <> in {labelFor(pickedCity)}</>}
          {pickedCity && (
            <button
              onClick={() => setShowAllCities((v) => !v)}
              className="ml-2 text-accent-600 hover:text-accent-700"
            >
              {showAllCities ? `Only ${labelFor(pickedCity)}` : "All cities"}
            </button>
          )}
        </p>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {!userLocation ? (
            <button
              onClick={handleLocate}
              disabled={locating}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-accent-600 hover:bg-accent-50 disabled:opacity-60"
            >
              {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
              {locating ? "Locating" : "Near me"}
            </button>
          ) : (
            <button
              onClick={() => { setUserLocation(null); if (sortBy === "nearby") setSortBy("rating"); }}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-full text-accent-600 hover:bg-accent-50"
              aria-label="Stop using my location"
            >
              <Navigation className="w-4 h-4 fill-current" />
              {nearbyCount > 0 ? `${nearbyCount} within 5 km` : "Near me"}
            </button>
          )}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label="Sort"
              className="appearance-none h-9 pl-3 pr-7 rounded-full bg-transparent text-primary-900 hover:bg-primary-100 cursor-pointer focus:outline-none"
            >
              {userLocation && <option value="nearby">{SORT_LABELS.nearby}</option>}
              {(Object.entries(SORT_LABELS) as [SortOption, string][])
                .filter(([k]) => k !== "nearby")
                .map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {locError && (
        <div className="mb-4 flex items-start gap-3 text-[14px] text-primary-900 bg-primary-100 rounded-xl px-4 py-3">
          <span className="flex-1">{locError}</span>
          {locErrorKind !== "denied" && (
            <button
              onClick={handleLocate}
              disabled={locating}
              className="font-medium text-accent-600 whitespace-nowrap disabled:opacity-60"
            >
              {locating ? "…" : "Retry"}
            </button>
          )}
          <button
            onClick={() => { setLocError(""); setLocErrorKind(null); }}
            aria-label="Dismiss"
            className="text-primary-400 hover:text-primary-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-8">
          {filtered.map(({ turf, distanceKm }) => (
            <TurfCard key={turf.id} turf={turf} distanceKm={distanceKm} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">🏟️</p>
          <p className="text-lg font-semibold text-primary-900">No turfs found</p>
          <p className="text-sm text-primary-400 mt-2">Try adjusting your search or filters</p>
          {(search || selectedSport) && (
            <button
              onClick={() => { setSearch(""); setSelectedSport(null); }}
              className="mt-4 text-[15px] text-accent-600 hover:text-accent-700"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
