"use client";

import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Search, ChevronDown, Navigation, Loader2, X, RotateCw } from "lucide-react";
import { TurfCard } from "@/components/turf/TurfCard";
import { TrendingSpotlight, type SpotlightTurf } from "@/components/turf/TrendingSpotlight";
import { getUserLocation, type Coords } from "@/lib/utils/location";
import { isCity, labelFor, type CityScope } from "@/lib/city";
import { noteInterest } from "@/lib/analytics/visitor";
import {
  DEFAULT_FILTERS,
  filtersFromSearch,
  isDefaultFilters,
  listSearch,
  nextBatch,
  normalizeQ,
  roundCoords,
  searchForFilters,
  type ListFilters,
  type ListPage,
  type SortOption,
} from "@/lib/turfList/query";
import { SAVE_KEY, addBatch, firstBatch, fromSaved, listKey, nearCount, shownCards, startState, toSaved, wantBatch, type ListState } from "@/lib/turfList/client";

const SORT_LABELS: Record<SortOption, string> = {
  nearby:      "Nearest first",
  rating:      "Top rated",
  reviews:     "Most reviewed",
  "price-low": "Price: Low to High",
  "price-high":"Price: High to Low",
};

/** How long the search box waits for the next key before it asks. */
const TYPE_MS = 250;

// Back and Forward: popstate fires before this listing mounts again, so a
// mount right after one restores the list the player left (cards and
// scroll), saved in sessionStorage when they tapped away. A fresh visit
// (the Turfs tab, a link) starts at the top with the first cards.
let popAt = -Infinity;
let firstMount = true;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    popAt = performance.now();
  });
}
function cameBack(): boolean {
  if (performance.now() - popAt < 3000) return true;
  if (!firstMount) return false;
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === "back_forward";
  } catch {
    return false;
  }
}

/**
 * Search, sport chips and sort over the turfs in scope (one city, or all
 * of India), a batch of cards at a time. The server rendered the first
 * FIRST_PAGE cards of the default list (`initial`); everything after that
 * comes from GET /api/turfs/list, ranked by the same code
 * (lib/turfList/query.ts), so the browser never gets the whole list:
 * "Show more" adds 10, then 20, 40, 80 (each tap doubles what is shown, at
 * most 80 per request), and a new search, sport or sort fetches the first
 * 10 of the new list (the old cards stay, dimmed, until they arrive; if
 * that fails they are hidden, never shown as the new list). The
 * filters live in the URL (?q= on all of India, ?search= in a city, and
 * sport, sort), so a reload, Back or a shared link shows the same list.
 * The city never changes in here; a new city is a new page.
 */
export function TurfListingClient({
  initial,
  sports: availableSports,
  scope,
  spotlight,
}: {
  /** The server's first page of the default list. */
  initial: ListPage;
  /** Sport chips worth showing for this scope. */
  sports: string[];
  scope: CityScope;
  /** This week's "Most Trending Turf" for the city in view, if any. */
  spotlight: SpotlightTurf | null;
}) {
  const city = scope.kind === "city" ? scope.id : null;
  const cityLabel = scope.kind === "city" ? scope.label : null;
  const urlScope = scope.kind === "city" ? "city" : "india";

  const [filters, setFilters] = useState<ListFilters>(DEFAULT_FILTERS);
  // The box as typed; filters.q follows it TYPE_MS after the last key.
  const [search, setSearch] = useState("");
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const [locErrorKind, setLocErrorKind] = useState<"denied" | "unavailable" | "timeout" | "other" | null>(null);
  const [list, setList] = useState<ListState>(() => startState(listKey(city, DEFAULT_FILTERS, null), initial));
  // Until the URL has been read (just after hydration), nothing is fetched.
  const [ready, setReady] = useState(false);
  const [failedAt, setFailedAt] = useState<string | null>(null);
  // The saved list and where the player was, until that list is on screen.
  const restoring = useRef<{ state: ListState; y: number } | null>(null);

  const rounded = useMemo(() => (userLocation ? roundCoords(userLocation) : null), [userLocation]);
  const nearby = filters.sort === "nearby" && !!rounded;
  const wantKey = listKey(city, filters, rounded);
  const replacing = ready && list.key !== wantKey;
  // Ordered by the list's own key, so a list still on screen while the next loads keeps its order.
  const shown = useMemo(() => shownCards(list, userLocation), [list, userLocation]);
  const plan = !ready ? null : replacing ? firstBatch(nearby) : wantBatch(list, shown.length);
  // One failed attempt is not retried by itself (no loop against a failing route); Retry asks again.
  const attempt = plan ? `${wantKey}#${list.key}#${list.next}#${list.target}#${plan.offset}+${plan.limit}` : null;
  const failed = attempt != null && failedAt === attempt;
  const loading = plan != null && !failed;
  // The first batch of a new search, sport or sort failed: the cards on screen belong to another list.
  const replaceFailed = replacing && failed;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The URL's filters (or, on Back, the list the player left), once, before the first paint after hydration.
  useLayoutEffect(() => {
    const restore = () => {
      const back = cameBack();
      firstMount = false;
      let saved = null;
      if (back) {
        try {
          saved = fromSaved(window.sessionStorage.getItem(SAVE_KEY), location.pathname + location.search, city ?? "", Date.now());
        } catch {
          saved = null;
        }
      }
      if (saved && listKey(city, saved.filters, null) === saved.state.key) {
        setFilters(saved.filters);
        setSearch(saved.filters.q);
        setList(saved.state);
        restoring.current = { state: saved.state, y: saved.y };
      } else {
        const f = filtersFromSearch(location.search);
        // A sport this scope does not have would only show "No turfs found".
        if (f.sport && !availableSports.includes(f.sport)) f.sport = null;
        if (!isDefaultFilters(f)) {
          setFilters(f);
          setSearch(f.q);
        }
      }
      setReady(true);
      // The pre-paint dimming (LIST_PREPAINT_JS) hands over to `replacing`.
      document.documentElement.removeAttribute("data-tt-list");
    };
    restore();
    // Once per mount: the scope and chips are fixed for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back to where the player was, once the saved cards are on screen (the
  // browser's own restore ran while the turf page was still showing, so it
  // stopped short).
  useLayoutEffect(() => {
    const r = restoring.current;
    if (!r || r.state !== list) return;
    restoring.current = null;
    window.scrollTo(0, r.y);
  }, [list]);

  // The search box, debounced into the filters (the URL already has it: onChange).
  useEffect(() => {
    const id = window.setTimeout(() => {
      const q = normalizeQ(search);
      setFilters((f) => (f.q === q ? f : { ...f, q }));
    }, TYPE_MS);
    return () => window.clearTimeout(id);
  }, [search]);

  /**
   * The filters into the URL (replace, so Back still leaves the page),
   * only from the player's own taps and keys, never from an effect or a
   * timer: Next's replaceState takes the router to the URL it is given,
   * so a write landing after a tap on a card (typing, then a tap within the
   * debounce) would pull the player back to this list. Nearby is never
   * written (it needs the viewer's own location).
   */
  const writeUrl = (f: ListFilters) => {
    const next = searchForFilters(location.search, f, urlScope);
    if (next !== location.search) window.history.replaceState(null, "", location.pathname + next + location.hash);
  };
  /** A chip, sort or clear: applied at once, with the box's text as it stands (no wait for the debounce). */
  const change = (patch: Partial<ListFilters>, text = search) => {
    const next = { ...filters, q: normalizeQ(text), ...patch };
    setFilters(next);
    writeUrl(next);
  };

  // The batch the cards on screen are missing: the first of a new list, or the next for "Show more".
  useEffect(() => {
    if (!plan || failed || !attempt) return;
    const ctrl = new AbortController();
    const fresh = list.key !== wantKey;
    const key = wantKey;
    const query = { city, sport: filters.sport, q: filters.q, sort: nearby ? filters.sort : filters.sort === "nearby" ? "rating" : filters.sort, at: rounded };
    // The version and picks of the cards on screen, so the CDN keeps batches per both (the answer names its own).
    fetch(`/api/turfs/list?${listSearch({ query, offset: plan.offset, limit: plan.limit }, list.v, list.t)}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ListPage;
      })
      .then((page) => {
        if (ctrl.signal.aborted) return;
        setList((prev) => (fresh ? startState(key, page) : prev.key === key ? addBatch(prev, page) : prev));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setFailedAt(attempt);
      });
    return () => ctrl.abort();
    // `attempt` names everything the request depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, failed]);

  // Keep the list for Back: saved when the player taps a link (a card, the A to Z list) or leaves the page.
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    saveRef.current = () => {
      try {
        // Only a settled list: not one still loading, nor one the box has moved past (debounce pending).
        const settled = ready && !replacing && normalizeQ(search) === filters.q;
        const raw = settled ? toSaved(location.pathname + location.search, city ?? "", filters, list, window.scrollY, Date.now()) : null;
        if (raw) window.sessionStorage.setItem(SAVE_KEY, raw);
        else window.sessionStorage.removeItem(SAVE_KEY);
      } catch {
        // Storage full or blocked: Back just starts at the top.
      }
    };
  });
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.("a[href]")) saveRef.current();
    };
    const onHide = () => saveRef.current();
    document.addEventListener("click", onClick, true);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  const handleLocate = useCallback(async () => {
    const path = location.pathname;
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
      setFilters((f) => ({ ...f, sort: "nearby" }));
      // The URL follows: nearby is written as the default sort, so a sort=
      // from before goes (a reload or Back would bring it back otherwise).
      // The location can come seconds later: not once the player has left
      // the list (a late replaceState would pull them back to it). The URL
      // holds the box's latest text already (written on every key).
      if (mounted.current && location.pathname === path) {
        const next = searchForFilters(location.search, { ...filtersFromSearch(location.search), sort: "nearby" }, urlScope);
        if (next !== location.search) window.history.replaceState(null, "", location.pathname + next + location.hash);
      }
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
  }, [urlScope]);

  const spotlightPicks = useMemo(() => (spotlight ? [spotlight] : []), [spotlight]);
  const total = list.total;
  const nearbyCount = userLocation && !replacing ? nearCount(list, userLocation) ?? 0 : 0;
  // What there is to show: the total, or once the route ran out, the cards fetched
  // (a nearby list may hold more than it shows; a purge between batches may leave fewer than the total).
  const available = list.end ? list.items.length : total;
  const more = shown.length < available;
  const nextCount = Math.min(nextBatch(list.target), available - shown.length);
  // Cards still to come for "Show more" (not for a new list: its old cards stay, dimmed).
  const pendingMore = loading && !replacing ? Math.max(0, Math.min(list.target, total) - shown.length) : 0;
  const q = filters.q;

  return (
    <div>
      {/* Search field, iOS style: filled, borderless. */}
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-primary-400" />
        <input
          type="search"
          placeholder="Filter by name, area, or sport"
          value={search}
          maxLength={120}
          onChange={(e) => {
            setSearch(e.target.value);
            writeUrl({ ...filters, q: normalizeQ(e.target.value) });
          }}
          className="w-full pl-10 pr-4 h-11 rounded-xl bg-primary-100 text-[16px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
        />
      </div>

      {/* Sport chips: always visible, scroll sideways on phones. */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide">
        {[null, ...availableSports].map((sport) => {
          const active = filters.sport === sport;
          return (
            <button
              key={sport ?? "all"}
              aria-pressed={active}
              onClick={() => {
                if (sport && filters.sport !== sport) noteInterest({ sports: [sport] });
                change({ sport: sport && filters.sport === sport ? null : sport });
              }}
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
        <p className="text-primary-500 min-w-0 truncate inline-flex items-center gap-1.5" aria-live="polite">
          {replacing && loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              <span>Finding turfs</span>
            </>
          ) : replaceFailed ? (
            // Never the old list's total. Phones leave it blank (no room; the alert right below says it).
            <span className="hidden sm:inline">Couldn&apos;t load</span>
          ) : (
            <span>
              <span className="tabular-nums">{total.toLocaleString("en-IN")}</span> turf{total !== 1 ? "s" : ""}
              {cityLabel && <span className="hidden sm:inline"> in {cityLabel}</span>}
            </span>
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
              onClick={() => {
                setUserLocation(null);
                if (filters.sort === "nearby") change({ sort: "rating" });
              }}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-full text-accent-600 hover:bg-accent-50"
              aria-label="Stop using my location"
            >
              <Navigation className="w-4 h-4 fill-current" />
              {nearbyCount > 0 ? `${nearbyCount} within 5 km` : "Near me"}
            </button>
          )}
          <div className="relative">
            <select
              value={filters.sort === "nearby" && !userLocation ? "rating" : filters.sort}
              onChange={(e) => change({ sort: e.target.value as SortOption })}
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

      {/* Right under the count, where the player is looking: the cards below are another list's, so they are hidden. */}
      {replaceFailed && (
        <div role="alert" className="mb-4 flex items-center gap-3 text-[14px] text-primary-900 bg-primary-100 rounded-xl px-4 py-3">
          <span className="flex-1">Couldn&apos;t load these turfs. Check your connection.</span>
          <button
            type="button"
            onClick={() => setFailedAt(null)}
            className="inline-flex items-center gap-1.5 font-semibold text-accent-600 hover:text-accent-700 whitespace-nowrap cursor-pointer"
          >
            <RotateCw className="w-4 h-4" aria-hidden />
            Try again
          </button>
        </div>
      )}

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

      {/* This week's Most Trending Turf for the city in view. Hidden
          while searching or filtering so it doesn't fight the results. */}
      {!search && !filters.sport && (
        <TrendingSpotlight picks={spotlightPicks} className="mb-8" />
      )}

      {/* Grid */}
      <div id="tt-turf-grid" aria-busy={loading} className={`transition-opacity duration-150 ${replacing ? "opacity-45 pointer-events-none" : ""}`}>
        {replaceFailed || (cityLabel && q && total === 0 && !replacing) ? null : shown.length > 0 || pendingMore > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-8">
              {shown.map(({ item: { turf, hot }, km }, i) => (
                <TurfCard
                  key={turf.id}
                  turf={turf}
                  distanceKm={km}
                  priority={i < 2}
                  trending={hot === true}
                  cityLabel={cityLabel || !isCity(turf.city) ? undefined : labelFor(turf.city)}
                />
              ))}
              {Array.from({ length: Math.min(pendingMore, 4) }, (_, i) => (
                <CardSkeleton key={`s${i}`} />
              ))}
            </div>
            {(more || failed) && (
              <div className="mt-10 flex flex-col items-center gap-2">
                {failed ? (
                  <>
                    <p className="text-[14px] text-primary-700">Couldn&apos;t load more turfs. Check your connection.</p>
                    <button
                      type="button"
                      onClick={() => setFailedAt(null)}
                      className="press-tight h-12 px-6 inline-flex items-center gap-2 rounded-full bg-primary-900 hover:bg-primary-700 text-white text-[15px] font-semibold transition-colors cursor-pointer"
                    >
                      <RotateCw className="w-4 h-4" />
                      Try again
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    // Not `disabled`: a focused button that turns disabled drops the focus to <body>
                    // (keyboard and screen reader users would lose their place on every tap).
                    aria-disabled={loading}
                    onClick={() => {
                      if (!loading) setList((s) => ({ ...s, target: s.target + nextBatch(s.target) }));
                    }}
                    className="press-tight h-12 min-w-[200px] px-6 inline-flex items-center justify-center gap-2 rounded-full bg-primary-900 hover:bg-primary-700 aria-disabled:bg-primary-700 text-white text-[15px] font-semibold transition-colors cursor-pointer aria-disabled:cursor-wait"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                        Loading turfs
                      </>
                    ) : (
                      `Show ${nextCount.toLocaleString("en-IN")} more`
                    )}
                  </button>
                )}
                <p className="text-[13px] text-primary-500 tabular-nums" aria-live="polite">
                  Showing {shown.length.toLocaleString("en-IN")} of {available.toLocaleString("en-IN")}
                </p>
              </div>
            )}
          </>
        ) : failed ? (
          <div className="text-center py-20">
            <p className="text-lg font-semibold text-primary-900">Couldn&apos;t load turfs</p>
            <p className="text-sm text-primary-400 mt-2">Check your connection and try again.</p>
            <button onClick={() => setFailedAt(null)} className="mt-4 text-[15px] text-accent-600 hover:text-accent-700">
              Try again
            </button>
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">🏟️</p>
            <p className="text-lg font-semibold text-primary-900">No turfs found</p>
            <p className="text-sm text-primary-400 mt-2">Try adjusting your search or filters</p>
            {(search || filters.sport) && (
              <button
                onClick={() => {
                  setSearch("");
                  change({ sport: null }, "");
                }}
                className="mt-4 text-[15px] text-accent-600 hover:text-accent-700"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>
      {/* A city page searches its own turfs; offer the rest of India when that runs thin. */}
      {cityLabel && q && !replacing && total < 3 && (
        <div className="mt-8 flex flex-col items-start gap-3">
          {total === 0 && (
            <p className="text-[15px] text-primary-700">
              Nothing in {cityLabel} for &quot;{q}&quot;.
            </p>
          )}
          <button
            type="button"
            // The box as it stands (the player may have typed since these results
            // came), as a full page load: /turfs?q= is a different page only
            // because proxy.ts says so, and the client router, holding this
            // city's /turfs from a prefetch, kept showing it for a push.
            onClick={() => window.location.assign(`/turfs?q=${encodeURIComponent(normalizeQ(search) || q)}`)}
            className="h-11 px-5 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white text-[14px] font-semibold text-primary-900 press-tight focus-neon hover:border-primary-900"
          >
            <Search className="w-4 h-4" />
            Search all of India
          </button>
        </div>
      )}
    </div>
  );
}

/** A card's shape while its batch loads (TurfCard: 4:3 photo, name, one line, price). */
function CardSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="w-full aspect-[4/3] rounded-2xl bg-primary-100" />
      <div className="pt-3 px-0.5 space-y-2">
        <div className="h-4 w-3/4 rounded bg-primary-100" />
        <div className="h-3.5 w-1/2 rounded bg-primary-100" />
        <div className="h-3.5 w-1/3 rounded bg-primary-100" />
      </div>
    </div>
  );
}
