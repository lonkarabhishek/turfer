import type { Turf } from "../../types/turf";
import { getMinimumPrice } from "../utils/prices";
import { pricesAreForSport } from "../utils/cardSport";
import { compareTopRated } from "../utils/ranking";
import { haversineKm, type Coords } from "../utils/location";

/**
 * The turf listing's search, sport chips, sorts and paging: one module for
 * the server render of /turfs (its first FIRST_PAGE cards), GET
 * /api/turfs/list (every later batch) and the client (URL params, batch
 * sizes, exact nearest-first). The page and the route rank the same rows
 * (getCardTurfs, top-rated order) with rankTurfs, so a batch continues the
 * server's first page exactly. Relative imports only, so `npm run
 * test:list` compiles it on its own.
 *
 * Until 28 Oct the page shipped every turf in scope to the browser (all of
 * India was 4.7 MB of HTML) and filtered there, 48 cards at a time.
 */

// Order by frequency in the current DB — Football (166) and Box
// Cricket (103) dominate, so they're first. Box Cricket was missing
// entirely from the old list, hiding 103 venues behind an unclickable
// chip. Cricket Nets is a subset of Cricket for filtering purposes
// (the substring match already picks it up under "Cricket").
export const SPORT_CHIPS = [
  "Football",
  "Box Cricket",
  "Cricket",
  "Badminton",
  "Volleyball",
  "Yoga",
  "Pickleball",
  "Basketball",
  "Tennis",
] as const;

export const SORTS = ["rating", "nearby", "reviews", "price-low", "price-high"] as const;
export type SortOption = (typeof SORTS)[number];

/** Cards in the server's first view, and the first batch of a new search, sport or sort. */
export const FIRST_PAGE = 10;
/** Most cards one request returns; also the largest batch one tap asks for. */
export const MAX_LIMIT = 80;
/** No list is this long (3,600 turfs in all of India on 28 Oct); an offset past it is a bad link. */
export const MAX_OFFSET = 20_000;
/** Search text is cut to this many characters (as the box always did). */
export const MAX_Q = 120;
/** "N within 5 km" on the Near me button. */
export const NEAR_KM = 5;
/**
 * Farthest a location can be from its rounded point (roundCoords): half the
 * diagonal of a 0.01 degree cell, 0.79 km at the equator and less elsewhere.
 */
export const ROUND_SLACK_KM = 0.8;

export type ListFilters = {
  /** Trimmed, at most MAX_Q characters; "" for none. */
  q: string;
  /** One of SPORT_CHIPS, or null for every sport. */
  sport: string | null;
  sort: SortOption;
};

export type ListQuery = ListFilters & {
  /** City id, or null for all of India. */
  city: string | null;
  /** The viewer's location rounded with roundCoord (nearby sort, distances, "within 5 km"), or null. */
  at: Coords | null;
};

export const DEFAULT_FILTERS: ListFilters = { q: "", sport: null, sort: "rating" };

/** Same shape as lib/city.ts isCity (kept here so this module has no "@/" imports). */
const CITY_RE = /^[a-z][a-z-]{1,30}$/;

export function normalizeQ(raw: string | null | undefined): string {
  return typeof raw === "string" ? raw.trim().slice(0, MAX_Q).trim() : "";
}

/** "Box Cricket" -> "box-cricket": the sport in the page URL and the route's query. */
export function sportSlug(label: string): string {
  return label.toLowerCase().replace(/\s+/g, "-");
}

/** The chip label for a slug ("box-cricket"), or null when it is not a chip. */
export function sportFromSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const s = slug.trim().toLowerCase();
  return SPORT_CHIPS.find((c) => sportSlug(c) === s) ?? null;
}

/**
 * The chips worth showing for these turfs: if Nashik has no Pickleball
 * venues, don't dangle a dead chip for a Nashik visitor. Same substring
 * rule as the filter.
 */
export function availableSports(turfs: readonly Pick<Turf, "sports">[]): string[] {
  const seen = new Set<string>();
  for (const t of turfs) for (const s of t.sports) seen.add(s.toLowerCase());
  const all = [...seen];
  return SPORT_CHIPS.filter((c) => all.some((s) => s.includes(c.toLowerCase())));
}

/** About 1.1 km: a location this coarse is shared by everyone nearby, so its answers can be cached. */
export function roundCoord(x: number): number {
  return Math.round(x * 100) / 100;
}

export function roundCoords(c: Coords): Coords {
  return { lat: roundCoord(c.lat), lng: roundCoord(c.lng) };
}

export type Ranked<T> = { turf: T; km: number | null };

function distance(at: Coords | null, t: Pick<Turf, "lat" | "lng">): number | null {
  if (!at || !Number.isFinite(t.lat) || !Number.isFinite(t.lng)) return null;
  const d = haversineKm(at, { lat: t.lat as number, lng: t.lng as number });
  // NaN -> null, so sort comparators never see a poisoned value.
  return Number.isFinite(d) ? d : null;
}

/**
 * Every turf matching the search and sport, in the chosen order, and how
 * many are within NEAR_KM of `at` (null without a location). `turfs` must
 * come in top-rated order (getCardTurfs): every sort is stable, so ties
 * keep that order, which makes a batch at any offset deterministic.
 * The rules are the ones the browser ran until 28 Oct: a search matches
 * name, address or a sport; a chip matches any sport containing it
 * ("Cricket" includes Box Cricket and Cricket Nets).
 */
export function rankTurfs<T extends Turf>(
  turfs: readonly T[],
  query: Pick<ListQuery, "q" | "sport" | "sort" | "at">,
  trendingIds: ReadonlySet<string>,
): { ranked: Ranked<T>[]; near: number | null } {
  const q = normalizeQ(query.q).toLowerCase();
  const sport = query.sport ? query.sport.toLowerCase() : null;
  let result: Ranked<T>[] = [];
  for (const t of turfs) {
    if (q && !(t.name.toLowerCase().includes(q) || t.address.toLowerCase().includes(q) || t.sports.some((s) => s.toLowerCase().includes(q)))) continue;
    if (sport && !t.sports.some((s) => s.toLowerCase().includes(sport))) continue;
    result.push({ turf: t, km: distance(query.at, t) });
  }
  const sortBy = query.sort === "nearby" && !query.at ? "rating" : query.sort;
  const chip = query.sport ? { chip: query.sport } : null;
  const priceFor = (t: T) => (chip && !pricesAreForSport(t.sports, chip) ? null : getMinimumPrice(t));
  result = result.sort((a, b) => {
    switch (sortBy) {
      case "nearby":
        if (a.km == null && b.km == null) return compareTopRated(a.turf, b.turf);
        if (a.km == null) return 1;
        if (b.km == null) return -1;
        return a.km - b.km;
      case "price-low":
      case "price-high": {
        // Sort turfs without a real price to the end regardless of direction —
        // never coalesce them to 500 so they don't jumble ahead of cheap real listings.
        // With a chip, a price the card does not show (another sport's, cardPrice)
        // counts as none, so it never orders the list either.
        const ap = priceFor(a.turf);
        const bp = priceFor(b.turf);
        if (ap == null && bp == null) return 0;
        if (ap == null) return 1;
        if (bp == null) return -1;
        return sortBy === "price-low" ? ap - bp : bp - ap;
      }
      case "reviews":
        return b.turf.total_reviews - a.turf.total_reviews;
      case "rating":
      default: {
        // The week's trending pick leads the default sort.
        const ta = trendingIds.has(a.turf.id);
        const tb = trendingIds.has(b.turf.id);
        if (ta !== tb) return ta ? -1 : 1;
        return compareTopRated(a.turf, b.turf);
      }
    }
  });
  const near = query.at ? result.filter((r) => r.km != null && r.km <= NEAR_KM).length : null;
  return { ranked: result, near };
}

/** One card in a page of results. `hot`: this week's trending pick (gold frame). */
export type ListItem<T = Turf> = { turf: T; hot?: true };

export type ListPage<T = Turf> = {
  /** The list snapshot's version these rows came from (0: read from the table). */
  v: number;
  /** The trending picks that ranked these rows (picksTag): they lead the default sort and frame their cards. */
  t: string;
  /** Turfs matching the query in all. */
  total: number;
  /** Turfs within NEAR_KM of the rounded location, or null without one. */
  near: number | null;
  /**
   * With a location, on the first batch (offset 0) only: [lat, lng] of every
   * matching turf within NEAR_KM + ROUND_SLACK_KM of the rounded point, so
   * the browser counts "within 5 km" from the exact location
   * (client.ts nearCount), as the cards' distances are; `near` is counted
   * from the rounded point and can be off by a dozen. Every turf within
   * NEAR_KM of any location in the cell is in it (triangle inequality),
   * and the answer is still the same for everyone there.
   */
  nearAt?: [number, number][];
  offset: number;
  items: ListItem<T>[];
};

/**
 * A short fingerprint of the trending picks in scope, "0" for none. A pick
 * change purges the pages but does not move the list version `v` (the rows
 * are unchanged), so the route's URL carries this too (`t`): batches ranked
 * with other picks never share a CDN entry with these. FNV-1a, base 36.
 */
export function picksTag(ids: Iterable<string>): string {
  const all = [...ids].sort().join(",");
  if (!all) return "0";
  let h = 0x811c9dc5;
  for (let i = 0; i < all.length; i++) {
    h ^= all.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function pageOf<T extends Turf>(
  turfs: readonly T[],
  query: Pick<ListQuery, "q" | "sport" | "sort" | "at">,
  trendingIds: ReadonlySet<string>,
  offset: number,
  limit: number,
  v: number,
): ListPage<T> {
  const { ranked, near } = rankTurfs(turfs, query, trendingIds);
  const items = ranked.slice(offset, offset + limit).map(({ turf }) => (trendingIds.has(turf.id) ? { turf, hot: true as const } : { turf }));
  const page: ListPage<T> = { v, t: picksTag(trendingIds), total: ranked.length, near, offset, items };
  if (query.at && offset === 0) {
    page.nearAt = [];
    for (const r of ranked) if (r.km != null && r.km <= NEAR_KM + ROUND_SLACK_KM) page.nearAt.push([r.turf.lat as number, r.turf.lng as number]);
  }
  return page;
}

/**
 * How many more cards one "Show more" asks for: 10 more (20 shown), 20
 * more (40), 40 more (80), 80 more (160), then 80 at a time, so each tap
 * is one request of at most MAX_LIMIT. Batches start at the same offsets
 * for everyone, which keeps them cacheable.
 */
export function nextBatch(shown: number): number {
  return Math.max(FIRST_PAGE, Math.min(shown, MAX_LIMIT));
}

/* ---------- the route's query string ---------- */

export type ListRequest = { query: ListQuery; offset: number; limit: number };

/**
 * The route's query string, in one fixed order with defaults left out, so
 * every client asks for a batch with the same URL (one CDN entry). `v` and
 * `t`, the list version and the picks (picksTag) the client's cards came
 * from, split the CDN's cache by both: the route always answers from what
 * it has, and when that is older than `v` or other picks than `t`, it
 * answers uncached (app/api/turfs/list/route.ts), so an entry under a key
 * is never ranked from an older list or other picks than the key names.
 */
export function listSearch({ query, offset, limit }: ListRequest, v?: number | null, t?: string | null): string {
  const p = new URLSearchParams();
  if (query.city) p.set("city", query.city);
  if (query.sport) p.set("sport", sportSlug(query.sport));
  const q = normalizeQ(query.q);
  if (q) p.set("q", q);
  if (query.sort !== "rating") p.set("sort", query.sort);
  if (query.at) {
    const at = roundCoords(query.at);
    p.set("lat", at.lat.toFixed(2));
    p.set("lng", at.lng.toFixed(2));
  }
  p.set("offset", String(offset));
  p.set("limit", String(limit));
  if (v != null && Number.isSafeInteger(v) && v >= 0) p.set("v", String(v));
  if (t && TAG_RE.test(t)) p.set("t", t);
  return p.toString();
}

const INT_RE = /^\d{1,9}$/;
const VERSION_RE = /^\d{1,15}$/;
const TAG_RE = /^[0-9a-z]{1,13}$/;
const NUM_RE = /^-?\d{1,3}(\.\d{1,12})?$/;

/** What the client's cards came from (`v`, `t`), or null when the URL does not say. */
export type ListSeen = { v: number | null; t: string | null };

/**
 * GET /api/turfs/list's parameters, checked and capped. A bad value is an
 * error (400) rather than a guess, except the search text (cut to MAX_Q)
 * and the limit (capped at MAX_LIMIT). The location is rounded to about a
 * kilometre here whatever the client sent.
 */
export function parseListParams(p: URLSearchParams): { ok: true; req: ListRequest; seen: ListSeen } | { ok: false; error: string } {
  const city = p.get("city") ?? "";
  if (city && !CITY_RE.test(city)) return { ok: false, error: "bad city" };

  const sportRaw = p.get("sport") ?? "";
  const sport = sportRaw ? sportFromSlug(sportRaw) : null;
  if (sportRaw && !sport) return { ok: false, error: "bad sport" };

  const qRaw = p.get("q") ?? "";
  if (qRaw.length > 1000) return { ok: false, error: "q too long" };
  const q = normalizeQ(qRaw);

  const sortRaw = p.get("sort") || "rating";
  if (!(SORTS as readonly string[]).includes(sortRaw)) return { ok: false, error: "bad sort" };
  const sort = sortRaw as SortOption;

  const latRaw = p.get("lat");
  const lngRaw = p.get("lng");
  let at: Coords | null = null;
  if (latRaw != null || lngRaw != null) {
    if (latRaw == null || lngRaw == null || !NUM_RE.test(latRaw) || !NUM_RE.test(lngRaw)) return { ok: false, error: "bad lat/lng" };
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, error: "bad lat/lng" };
    at = roundCoords({ lat, lng });
  }
  if (sort === "nearby" && !at) return { ok: false, error: "nearby needs lat and lng" };

  const offRaw = p.get("offset") ?? "0";
  if (!INT_RE.test(offRaw)) return { ok: false, error: "bad offset" };
  const offset = Number(offRaw);
  if (offset > MAX_OFFSET) return { ok: false, error: "offset too large" };

  const limRaw = p.get("limit") ?? String(FIRST_PAGE);
  if (!INT_RE.test(limRaw) || Number(limRaw) < 1) return { ok: false, error: "bad limit" };
  const limit = Math.min(MAX_LIMIT, Number(limRaw));

  const vRaw = p.get("v");
  if (vRaw != null && !VERSION_RE.test(vRaw)) return { ok: false, error: "bad v" };
  const t = p.get("t");
  if (t != null && !TAG_RE.test(t)) return { ok: false, error: "bad t" };

  return { ok: true, req: { query: { city: city || null, sport, q, sort, at }, offset, limit }, seen: { v: vRaw == null ? null : Number(vRaw), t } };
}

/* ---------- the page URL ---------- */

export type Scope = "city" | "india";

/**
 * The search box's param in the page URL. On all of India it is `q`, which
 * proxy.ts reads as "search all of India" (the home's SearchAction and the
 * city page's Search all of India button land on /turfs?q=). A city view
 * uses `search` instead: `q` there would make a reload or a shared link
 * leave the city.
 */
export function textParam(scope: Scope): "q" | "search" {
  return scope === "india" ? "q" : "search";
}

/** The filters in a page URL's query string. Nearby is never in the URL: it needs the viewer's own location. */
export function filtersFromSearch(search: string): ListFilters {
  const p = new URLSearchParams(search);
  const sort = p.get("sort");
  return {
    q: normalizeQ(p.get("q") || p.get("search")),
    sport: sportFromSlug(p.get("sport")),
    sort: sort && sort !== "nearby" && (SORTS as readonly string[]).includes(sort) ? (sort as SortOption) : "rating",
  };
}

/**
 * The page URL's query string for these filters, keeping every other
 * param (utm_..., gclid) as it was. Defaults are left out, so the plain
 * list is plain /turfs. Nearby is written as the default sort.
 */
export function searchForFilters(search: string, f: ListFilters, scope: Scope): string {
  const p = new URLSearchParams(search);
  p.delete("q");
  p.delete("search");
  const q = normalizeQ(f.q);
  if (q) p.set(textParam(scope), q);
  if (f.sport) p.set("sport", sportSlug(f.sport));
  else p.delete("sport");
  if (f.sort !== "rating" && f.sort !== "nearby") p.set("sort", f.sort);
  else p.delete("sort");
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function isDefaultFilters(f: ListFilters): boolean {
  return !normalizeQ(f.q) && !f.sport && (f.sort === "rating" || f.sort === "nearby");
}

/* ---------- exact nearest-first from rounded batches ---------- */

/**
 * Nearest first, exactly, for the viewer at `me`, from batches the route
 * ranked from `rounded` (roundCoords(me), about a kilometre off). Every
 * turf not fetched yet is at least as far from `rounded` as the last one
 * fetched, so (triangle inequality) at least that minus |me, rounded| from
 * `me`: a fetched turf closer to `me` than that bound can be shown in its
 * exact place. Returns those, nearest first by the exact distance, and
 * once every turf with coordinates is in (the route ranks the ones without
 * last), the rest in the route's order. `done`: every matching turf has
 * been fetched. Show the first n; when fewer than n are ready and not
 * done, fetch more.
 */
export function exactNearest<T extends Pick<Turf, "lat" | "lng">>(
  items: readonly T[],
  done: boolean,
  me: Coords,
  rounded: Coords,
): { item: T; km: number | null }[] {
  const slack = haversineKm(me, rounded);
  const geo: { item: T; km: number; i: number }[] = [];
  const noGeo: { item: T; km: null }[] = [];
  let last = -Infinity;
  items.forEach((item, i) => {
    const fromRounded = distance(rounded, item);
    const km = distance(me, item);
    if (fromRounded == null || km == null) {
      noGeo.push({ item, km: null });
      return;
    }
    if (fromRounded > last) last = fromRounded;
    geo.push({ item, km, i });
  });
  const allGeo = done || noGeo.length > 0;
  const bound = allGeo ? Infinity : last - (Number.isFinite(slack) ? slack : 0) - 1e-9;
  const ready = geo.filter((g) => g.km <= bound).sort((a, b) => a.km - b.km || a.i - b.i);
  const out: { item: T; km: number | null }[] = ready.map(({ item, km }) => ({ item, km }));
  return allGeo ? [...out, ...noGeo] : out;
}
