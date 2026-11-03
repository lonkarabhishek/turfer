import type { Turf } from "../../types/turf";
import { sportMinimumPrice, type CardSport } from "../utils/cardSport";
import { compareTopRated } from "../utils/ranking";
import { haversineKm, type Coords } from "../utils/location";
import { sportBySlug, turfPlaysSport } from "../sports";
import {
  FACETS,
  PRICE_STEPS,
  SURFACES,
  facetBit,
  facetMask,
  hourlyPrice,
  istParam,
  maskOf,
  parseIst,
  type Facet,
  type IstTime,
  type SurfaceKind,
  type TurfFilterFacts,
} from "./facts";

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
 *
 * The Filters sheet's toggles, price cap and surface (lib/turfList/facts.ts)
 * run here too, on the server's own facts of each turf, with a count per
 * choice on a first batch that asks for them (`counts`: the sheet is open),
 * and a city+sport page's list is that page's turfs (`pageSport`: the sport
 * page's exact labels, lib/sports.ts), ranked by rating with no trending
 * lead, as the page says.
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

/**
 * The Filters sheet's choices. Each is left out when it is the default
 * (none), here as in the URLs, so a list without them is the list it
 * always was (extrasOf reads them).
 */
export type ExtraFilters = {
  /** Toggles (FACETS), each once, in FACETS order. */
  facets?: Facet[];
  /** Listed price per hour up to this, one of PRICE_STEPS. */
  price?: number | null;
  surface?: SurfaceKind | null;
};

export type ListFilters = {
  /** Trimmed, at most MAX_Q characters; "" for none. */
  q: string;
  /** One of SPORT_CHIPS, or null for every sport. */
  sport: string | null;
  sort: SortOption;
} & ExtraFilters;

export type ListQuery = ListFilters & {
  /** City id, or null for all of India. */
  city: string | null;
  /** The viewer's location rounded with roundCoord (nearby sort, distances, "within 5 km"), or null. */
  at: Coords | null;
  /** A city+sport page's sport (lib/sports.ts slug): only that page's turfs, by its exact labels. */
  pageSport?: string | null;
  /** India time for "Open now" and its count (facts.ts istTime), or null. */
  ist?: IstTime | null;
};

export const DEFAULT_FILTERS: ListFilters = { q: "", sport: null, sort: "rating" };

/** The extras of these filters, checked and in their one order (FACETS order, known values only). */
export function extrasOf(f: ExtraFilters): { facets: Facet[]; price: number | null; surface: SurfaceKind | null } {
  const on = new Set(Array.isArray(f.facets) ? f.facets : []);
  return {
    facets: FACETS.filter((x) => on.has(x)),
    price: typeof f.price === "number" && (PRICE_STEPS as readonly number[]).includes(f.price) ? f.price : null,
    surface: f.surface && (SURFACES as readonly string[]).includes(f.surface) ? f.surface : null,
  };
}

/** `base` with these extras, each set only when it is not the default. */
export function withExtras<T extends object>(base: T, extras: ExtraFilters): T & ExtraFilters {
  const e = extrasOf(extras);
  const out = { ...base } as T & ExtraFilters;
  delete out.facets;
  delete out.price;
  delete out.surface;
  if (e.facets.length) out.facets = e.facets;
  if (e.price != null) out.price = e.price;
  if (e.surface) out.surface = e.surface;
  return out;
}

export function hasExtras(f: ExtraFilters): boolean {
  const e = extrasOf(f);
  return e.facets.length > 0 || e.price != null || e.surface != null;
}

/** "f=open,lights;p=1000;s=natural", "" without extras: part of a list's key (client.ts listKey). */
export function extrasKey(f: ExtraFilters): string {
  const e = extrasOf(f);
  const parts: string[] = [];
  if (e.facets.length) parts.push(`f=${e.facets.join(",")}`);
  if (e.price != null) parts.push(`p=${e.price}`);
  if (e.surface) parts.push(`s=${e.surface}`);
  return parts.join(";");
}

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

/** What rankTurfs reads of a query: the filters, the location, and a page's sport and the time when there are. */
export type RankQuery = Pick<ListQuery, "q" | "sport" | "sort" | "at" | "pageSport" | "ist"> & ExtraFilters;

/** Each turf's filter facts by id (lib/queries/listFacts.ts). */
export type FactsLookup = ReadonlyMap<string, TurfFilterFacts>;

/**
 * The Filters sheet's numbers for a list: how many turfs each choice
 * would show with everything else as it is (the search, the sport, the
 * other choices). A toggle that is on counts the list itself.
 */
export type ListCounts = {
  /** Per toggle: with it on as well. */
  f: Record<Facet, number>;
  /** Per price step (its ₹ as the key): every other filter, at or under it. */
  price: Record<string, number>;
  /** Every other filter, with a listed price per hour at all. */
  priced: number;
  /** Every other filter, any price. */
  anyPrice: number;
  /** Per surface: every other filter, that surface. */
  surface: Partial<Record<SurfaceKind, number>>;
  /** Every other filter, any surface. */
  anySurface: number;
};

function emptyCounts(): ListCounts {
  return {
    f: Object.fromEntries(FACETS.map((f) => [f, 0])) as Record<Facet, number>,
    price: Object.fromEntries(PRICE_STEPS.map((p) => [String(p), 0])),
    priced: 0,
    anyPrice: 0,
    surface: {},
    anySurface: 0,
  };
}

const NO_PICKS: ReadonlySet<string> = new Set();

/**
 * The trending picks that lead a list's default sort and frame its cards:
 * none on a sport page, whose copy says it is ranked by Google rating (as
 * it was before the list came to it), and whose JSON-LD ItemList is in
 * that order.
 */
function leadingPicks(query: Pick<RankQuery, "pageSport">, trendingIds: ReadonlySet<string>): ReadonlySet<string> {
  return query.pageSport ? NO_PICKS : trendingIds;
}

/** The card's sport on this list: the chip, else the page's sport (its labels), else none. */
export function listCardSport(query: Pick<RankQuery, "sport" | "pageSport">): CardSport | null {
  if (query.sport) return { chip: query.sport };
  const page = query.pageSport ? sportBySlug(query.pageSport) : undefined;
  return page ? { labels: page.labels } : null;
}

/**
 * Every turf matching the search and sport, in the chosen order, and how
 * many are within NEAR_KM of `at` (null without a location). `turfs` must
 * come in top-rated order (getCardTurfs): every sort is stable, so ties
 * keep that order, which makes a batch at any offset deterministic.
 * The rules are the ones the browser ran until 28 Oct: a search matches
 * name, address or a sport; a chip matches any sport containing it
 * ("Cricket" includes Box Cricket and Cricket Nets).
 *
 * Then the page's sport (exact labels, as the page lists them), the
 * Filters sheet's toggles (every one on must hold: facts.ts facetMask, with
 * "Open now" at `ist`), the price cap (the card's price rule, per hour:
 * hourlyPrice; a turf without a listed price is not under any cap) and the
 * surface. A turf with no facts in `facts` has none of the toggles that
 * need them. With `counts`, also the sheet's numbers (ListCounts), from
 * the same pass. The trending picks lead the default sort, except on a
 * sport page (leadingPicks).
 */
export function rankTurfs<T extends Turf>(
  turfs: readonly T[],
  query: RankQuery,
  trendingIds: ReadonlySet<string>,
  facts?: FactsLookup | null,
  opts: { counts?: boolean } = {},
): { ranked: Ranked<T>[]; near: number | null; counts: ListCounts | null } {
  const q = normalizeQ(query.q).toLowerCase();
  const sport = query.sport ? query.sport.toLowerCase() : null;
  const page = query.pageSport ? (sportBySlug(query.pageSport) ?? null) : null;
  const { facets, price: cap, surface } = extrasOf(query);
  const need = maskOf(facets);
  const at = query.ist ?? null;
  const cardSport = listCardSport(query);
  const lead = leadingPicks(query, trendingIds);
  const counts = opts.counts ? emptyCounts() : null;
  const wantPrice = cap != null || counts != null;
  const bits = FACETS.map((f) => [f, facetBit(f)] as const);
  let result: Ranked<T>[] = [];
  for (const t of turfs) {
    if (q && !(t.name.toLowerCase().includes(q) || t.address.toLowerCase().includes(q) || t.sports.some((s) => s.toLowerCase().includes(q)))) continue;
    if (sport && !t.sports.some((s) => s.toLowerCase().includes(sport))) continue;
    if (page && !turfPlaysSport(t.sports, page)) continue;
    const f = facts?.get(t.id);
    const mask = facetMask(t, f, at);
    const hourly = wantPrice ? hourlyPrice(t, cardSport) : null;
    const kind = f?.surface ?? null;
    const okFacets = (mask & need) === need;
    const okPrice = cap == null || (hourly != null && hourly <= cap);
    const okSurface = surface == null || kind === surface;
    if (counts) {
      if (okPrice && okSurface) for (const [name, bit] of bits) if ((mask & (need | bit)) === (need | bit)) counts.f[name]++;
      if (okFacets && okSurface) {
        counts.anyPrice++;
        if (hourly != null) {
          counts.priced++;
          for (const step of PRICE_STEPS) if (hourly <= step) counts.price[String(step)]++;
        }
      }
      if (okFacets && okPrice) {
        counts.anySurface++;
        if (kind) counts.surface[kind] = (counts.surface[kind] ?? 0) + 1;
      }
    }
    if (!okFacets || !okPrice || !okSurface) continue;
    result.push({ turf: t, km: distance(query.at, t) });
  }
  const sortBy = query.sort === "nearby" && !query.at ? "rating" : query.sort;
  // With a chip (or a sport page), the price the card shows orders the list
  // (cardPrice): another sport's counts as none, the sport's range from the
  // bands as it reads. Worked out once a turf.
  const prices = sortBy === "price-low" || sortBy === "price-high" ? new Map(result.map((r) => [r.turf, sportMinimumPrice(r.turf, cardSport)])) : null;
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
        const ap = prices?.get(a.turf) ?? null;
        const bp = prices?.get(b.turf) ?? null;
        if (ap == null && bp == null) return 0;
        if (ap == null) return 1;
        if (bp == null) return -1;
        return sortBy === "price-low" ? ap - bp : bp - ap;
      }
      case "reviews":
        return b.turf.total_reviews - a.turf.total_reviews;
      case "rating":
      default: {
        // The week's trending pick leads the default sort (not a sport page's: leadingPicks).
        const ta = lead.has(a.turf.id);
        const tb = lead.has(b.turf.id);
        if (ta !== tb) return ta ? -1 : 1;
        return compareTopRated(a.turf, b.turf);
      }
    }
  });
  const near = query.at ? result.filter((r) => r.km != null && r.km <= NEAR_KM).length : null;
  return { ranked: result, near, counts };
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
  /** On a first batch (offset 0) asked for with `counts` (the sheet is open), ranked with each turf's facts: the Filters sheet's numbers. Never on the server's own first cards. */
  counts?: ListCounts;
  /** The India time "Open now" was worked out at (facts.ts istParam), when it was. Later batches of the list ask with the same. */
  ist?: string;
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

/**
 * One batch. With `facts` (the route) and `counts` (asked for: the sheet is
 * open), a first batch also carries the Filters sheet's counts; without
 * facts (a page's own first cards, which never read them), it carries none
 * rather than counts that would be wrong. Without `counts`, a first batch
 * needs no time ("Open now" off), so its answer is the same all day.
 */
export function pageOf<T extends Turf>(
  turfs: readonly T[],
  query: RankQuery,
  trendingIds: ReadonlySet<string>,
  offset: number,
  limit: number,
  v: number,
  facts?: FactsLookup | null,
  opts: { counts?: boolean } = {},
): ListPage<T> {
  const { ranked, near, counts } = rankTurfs(turfs, query, trendingIds, facts, { counts: !!opts.counts && offset === 0 && !!facts });
  const lead = leadingPicks(query, trendingIds);
  const items = ranked.slice(offset, offset + limit).map(({ turf }) => (lead.has(turf.id) ? { turf, hot: true as const } : { turf }));
  const page: ListPage<T> = { v, t: picksTag(lead), total: ranked.length, near, offset, items };
  if (counts) page.counts = counts;
  if (query.ist) page.ist = istParam(query.ist);
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

/** `counts`: a first batch that also carries the Filters sheet's numbers (asked while the sheet is open). */
export type ListRequest = { query: ListQuery; offset: number; limit: number; counts?: boolean };

/**
 * The route's query string, in one fixed order with defaults left out, so
 * every client asks for a batch with the same URL (one CDN entry). `v` and
 * `t`, the list version and the picks (picksTag) the client's cards came
 * from, split the CDN's cache by both: the route always answers from what
 * it has, and when that is older than `v` or other picks than `t`, it
 * answers uncached (app/api/turfs/list/route.ts), so an entry under a key
 * is never ranked from an older list or other picks than the key names.
 */
export function listSearch({ query, offset, limit, counts }: ListRequest, v?: number | null, t?: string | null): string {
  const p = new URLSearchParams();
  if (query.city) p.set("city", query.city);
  if (query.pageSport) p.set("ps", query.pageSport);
  if (query.sport) p.set("sport", sportSlug(query.sport));
  const q = normalizeQ(query.q);
  if (q) p.set("q", q);
  const extras = extrasOf(query);
  if (extras.facets.length) p.set("f", extras.facets.join(","));
  if (extras.price != null) p.set("price", String(extras.price));
  if (extras.surface) p.set("surface", extras.surface);
  if (query.sort !== "rating") p.set("sort", query.sort);
  if (query.at) {
    const at = roundCoords(query.at);
    p.set("lat", at.lat.toFixed(2));
    p.set("lng", at.lng.toFixed(2));
  }
  if (query.ist) p.set("ist", istParam(query.ist));
  if (counts) p.set("counts", "1");
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

  // The Filters sheet and a sport page: each left out of the query when not given.
  const extra: Pick<ListQuery, "pageSport" | "ist"> & ExtraFilters = {};
  const ps = p.get("ps");
  if (ps != null) {
    if (!sportBySlug(ps)) return { ok: false, error: "bad ps" };
    extra.pageSport = ps;
  }
  const fRaw = p.get("f");
  if (fRaw != null) {
    const list = fRaw.split(",");
    if (list.length > FACETS.length || !list.every((x) => (FACETS as readonly string[]).includes(x))) return { ok: false, error: "bad f" };
    const facets = extrasOf({ facets: list as Facet[] }).facets;
    if (facets.length) extra.facets = facets;
  }
  const priceRaw = p.get("price");
  if (priceRaw != null) {
    if (!(PRICE_STEPS as readonly number[]).some((x) => String(x) === priceRaw)) return { ok: false, error: "bad price" };
    extra.price = Number(priceRaw);
  }
  const surfaceRaw = p.get("surface");
  if (surfaceRaw != null) {
    if (!(SURFACES as readonly string[]).includes(surfaceRaw)) return { ok: false, error: "bad surface" };
    extra.surface = surfaceRaw as SurfaceKind;
  }
  const istRaw = p.get("ist");
  if (istRaw != null) {
    const ist = parseIst(istRaw);
    if (!ist) return { ok: false, error: "bad ist" };
    extra.ist = ist;
  }
  // The sheet's numbers: only "1", and only on a first batch (later ones never carry them).
  const countsRaw = p.get("counts");
  if (countsRaw != null && (countsRaw !== "1" || offset !== 0)) return { ok: false, error: "bad counts" };

  const req: ListRequest = { query: { city: city || null, sport, q, sort, at, ...extra }, offset, limit };
  if (countsRaw != null) req.counts = true;
  return { ok: true, req, seen: { v: vRaw == null ? null : Number(vRaw), t } };
}

/**
 * "Open now" is on, or the batch is a first one asked with the sheet's
 * counts (they count "Open now"): the answer depends on the time. Any
 * other batch is the same all day, so its CDN entry is shared.
 */
export function needsTime(query: Pick<ListQuery, "facets">, offset: number, counts = false): boolean {
  return (counts && offset === 0) || extrasOf(query).facets.includes("open");
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

/**
 * The filters in a page URL's query string. Nearby is never in the URL: it
 * needs the viewer's own location. The Filters sheet's choices are `f`
 * (toggles, comma separated), `price` and `surface`; anything unknown in
 * them is dropped, as a bad sport is.
 */
export function filtersFromSearch(search: string): ListFilters {
  const p = new URLSearchParams(search);
  const sort = p.get("sort");
  const base: ListFilters = {
    q: normalizeQ(p.get("q") || p.get("search")),
    sport: sportFromSlug(p.get("sport")),
    sort: sort && sort !== "nearby" && (SORTS as readonly string[]).includes(sort) ? (sort as SortOption) : "rating",
  };
  const surface = p.get("surface");
  return withExtras(base, {
    facets: (p.get("f") ?? "").split(",").filter(Boolean) as Facet[],
    price: p.get("price") ? Number(p.get("price")) : null,
    surface: (SURFACES as readonly string[]).includes(surface ?? "") ? (surface as SurfaceKind) : null,
  });
}

/**
 * The page URL's query string for these filters, keeping every other
 * param (utm_..., gclid) as it was. Defaults are left out, so the plain
 * list is plain /turfs. Nearby is written as the default sort. These URLs
 * are the same page (the canonical stays the plain one, and nothing links
 * them: the sheet's toggles and pills are buttons).
 */
export function searchForFilters(search: string, f: ListFilters, scope: Scope): string {
  const p = new URLSearchParams(search);
  p.delete("q");
  p.delete("search");
  const q = normalizeQ(f.q);
  if (q) p.set(textParam(scope), q);
  if (f.sport) p.set("sport", sportSlug(f.sport));
  else p.delete("sport");
  const extras = extrasOf(f);
  if (extras.facets.length) p.set("f", extras.facets.join(","));
  else p.delete("f");
  if (extras.price != null) p.set("price", String(extras.price));
  else p.delete("price");
  if (extras.surface) p.set("surface", extras.surface);
  else p.delete("surface");
  if (f.sort !== "rating" && f.sort !== "nearby") p.set("sort", f.sort);
  else p.delete("sort");
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function isDefaultFilters(f: ListFilters): boolean {
  return !normalizeQ(f.q) && !f.sport && (f.sort === "rating" || f.sort === "nearby") && !hasExtras(f);
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
