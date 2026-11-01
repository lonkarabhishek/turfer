import { cityPoint, isCitySlug } from "../city";
import { sportFromSlug, sportSlug } from "../turfList/query";
import { haversineKm, type Coords } from "../utils/location";
import { avgPriceWords } from "./clusters";

/**
 * Where /map looks and what it lists: the view in the URL (?city=, the
 * Map button's ?b= bounds, ?show=games, ?sport=), a city's view from its
 * turfs, and what is inside the view. Pure, relative imports only, so
 * `npm run test:list` compiles it on its own.
 */

/** West, south, east, north, in degrees. */
export type Bounds = readonly [west: number, south: number, east: number, north: number];

/** All of India, the map's first view. */
export const INDIA_BOUNDS: Bounds = [68.1, 6.7, 97.4, 35.6];
/** How far the map may be moved: India and a margin, so it never drifts to an empty ocean. */
export const MAX_BOUNDS: Bounds = [55, -2, 110, 42];

export type MapShow = "turfs" | "games";

export type MapQuery = {
  /** A city id (slug-shaped, not a reserved word), or null. */
  city: string | null;
  /**
   * The view to open on, or null. Alone, it is exactly the view someone
   * left (the map's whole frame); with a city (the turf list's Map button),
   * it is that city's turfs, and the map keeps them clear of its bars.
   */
  b: Bounds | null;
  show: MapShow;
  /** A sport chip (lib/turfList/query.ts SPORT_CHIPS), or null for every sport. */
  sport: string | null;
};

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** "73.70,18.43,73.96,18.69" (4 decimals, about 10 m) or null when it is not a usable view. */
export function parseBounds(raw: string | null | undefined): Bounds | null {
  if (!raw) return null;
  const parts = raw.split(",");
  if (parts.length !== 4) return null;
  const [w, s, e, n] = parts.map((p) => (p.trim() ? Number(p) : NaN));
  if (![w, s, e, n].every(Number.isFinite)) return null;
  if (w < -180 || e > 180 || s < -85 || n > 85 || w >= e || s >= n) return null;
  // Clamped to where the map may go; a view entirely outside it is not one.
  const b: Bounds = [Math.max(w, MAX_BOUNDS[0]), Math.max(s, MAX_BOUNDS[1]), Math.min(e, MAX_BOUNDS[2]), Math.min(n, MAX_BOUNDS[3])];
  return b[0] < b[2] && b[1] < b[3] ? b : null;
}

export function boundsParam(b: Bounds): string {
  return b.map(round4).join(",");
}

export function parseMapQuery(search: string): MapQuery {
  const p = new URLSearchParams(search);
  const city = p.get("city")?.trim().toLowerCase() ?? null;
  return {
    city: city && isCitySlug(city) ? city : null,
    b: parseBounds(p.get("b")),
    show: p.get("show") === "games" ? "games" : "turfs",
    sport: sportFromSlug(p.get("sport")),
  };
}

const MAP_PARAMS = ["city", "b", "show", "sport"];

/**
 * The query string for a view: "?b=...&show=games&sport=football", or ""
 * for India, every turf. Any other param in `keep` (utm_..., gclid) stays
 * as it was.
 */
export function mapSearch(q: MapQuery, keep = ""): string {
  const p = new URLSearchParams(keep);
  for (const k of MAP_PARAMS) p.delete(k);
  if (q.city) p.set("city", q.city);
  if (q.b) p.set("b", boundsParam(q.b));
  if (q.show === "games") p.set("show", "games");
  if (q.sport) p.set("sport", sportSlug(q.sport));
  const s = p.toString().replace(/%2C/g, ",");
  return s ? `?${s}` : "";
}

/** The turf list's Map button: /map on that city (and its view, when its turfs give one), or all of India. */
export function mapHref(city: string | null, b?: Bounds | null): string {
  return `/map${mapSearch({ city, b: b ?? null, show: "turfs", sport: null })}`;
}

export function inBounds(p: { lat: number; lng: number }, b: Bounds): boolean {
  return p.lng >= b[0] && p.lng <= b[2] && p.lat >= b[1] && p.lat <= b[3];
}

/** The bounds grown by `ratio` of their size on every side. */
export function padBounds(b: Bounds, ratio: number): Bounds {
  const dx = (b[2] - b[0]) * ratio;
  const dy = (b[3] - b[1]) * ratio;
  return [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy];
}

/** At least `min` degrees each way, about the same middle. */
function atLeast(b: Bounds, min: number): Bounds {
  const [w, s, e, n] = b;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const hx = Math.max((e - w) / 2, min / 2);
  const hy = Math.max((n - s) / 2, min / 2);
  return [cx - hx, cy - hy, cx + hx, cy + hy];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Smallest view across a city's turfs, about 5 km at the least. */
const MIN_SPAN = 0.05;
/** A city with no turf placed yet: its curated centre, about 20 km across. */
const CENTRE_SPAN = 0.2;
/** A city's turfs farther than this from their middle are placed in the wrong town (Mumbai's reach, Virar to Panvel, is about 50 km). */
const CITY_REACH_KM = 60;

/**
 * The view of one city: around its turfs, with a margin, leaving out any
 * turf more than CITY_REACH_KM from the middle of them all (their median
 * point), so one misplaced turf never zooms the map out to half of India;
 * else its curated centre; else null.
 */
export function cityBounds(city: string, points: readonly { city?: string | null; lat?: number | null; lng?: number | null }[]): Bounds | null {
  const here: Coords[] = [];
  for (const p of points) {
    if (p.city !== city || typeof p.lat !== "number" || typeof p.lng !== "number") continue;
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || (p.lat === 0 && p.lng === 0)) continue;
    here.push({ lat: p.lat, lng: p.lng });
  }
  if (here.length) {
    const mid = { lat: median(here.map((p) => p.lat)), lng: median(here.map((p) => p.lng)) };
    const kept = here.filter((p) => haversineKm(mid, p) <= CITY_REACH_KM);
    const use = kept.length ? kept : [mid];
    const b: Bounds = [
      Math.min(...use.map((p) => p.lng)),
      Math.min(...use.map((p) => p.lat)),
      Math.max(...use.map((p) => p.lng)),
      Math.max(...use.map((p) => p.lat)),
    ];
    return atLeast(padBounds(b, 0.08), MIN_SPAN);
  }
  const c = cityPoint(city);
  return c ? atLeast([c.lng, c.lat, c.lng, c.lat], CENTRE_SPAN) : null;
}

/** A sport chip matches a stored sport that contains it, as the /turfs chips do ("Cricket" takes Box Cricket and Cricket Nets). */
export function matchesChip(labels: readonly string[] | null | undefined, chip: string | null): boolean {
  if (!chip) return true;
  const c = chip.toLowerCase();
  return (labels ?? []).some((l) => l.toLowerCase().includes(c));
}

/** The chips worth showing: those some item matches, in the given order. */
export function chipsFor(chips: readonly string[], items: readonly (readonly string[])[]): string[] {
  return chips.filter((chip) => items.some((labels) => matchesChip(labels, chip)));
}

/**
 * What the list shows: the items inside the view, in their own order
 * (top rated, as the turfs come), or nearest first when the viewer shared
 * their location, with the distance either way when it is known.
 */
export function inView<T>(items: readonly T[], b: Bounds, at: (t: T) => { lat: number; lng: number }, me: Coords | null): { item: T; km: number | null }[] {
  const out: { item: T; km: number | null }[] = [];
  for (const item of items) {
    const p = at(item);
    if (!inBounds(p, b)) continue;
    const km = me ? haversineKm(me, p) : NaN;
    out.push({ item, km: Number.isFinite(km) ? km : null });
  }
  if (me) out.sort((a, c) => (a.km ?? Infinity) - (c.km ?? Infinity));
  return out;
}

/** "1 turf in this area", "3,826 turfs in this area", "No games in this area". */
export function countLine(n: number, show: MapShow): string {
  const one = show === "games" ? "game" : "turf";
  if (n === 0) return `No ${one}s in this area`;
  return `${n.toLocaleString("en-IN")} ${n === 1 ? one : `${one}s`} in this area`;
}

/**
 * A count bubble's words for a screen reader: "40 turfs here. Zoom in";
 * or, for one that zooming cannot split (`places`: where each of its pins
 * is, e.g. a turf's weekly games), what a tap lists: "3 games at Turf Up",
 * "2 turfs here". A turf bubble whose turfs list prices says their average
 * (`price`: the average and how many it is over), as its tag does:
 * "406 turfs here, average ₹1,150 an hour over the 120 with a listed
 * price. Zoom in".
 */
export function bubbleLabel(n: number, show: MapShow, places: readonly string[] | null, price?: { avg: number; n: number } | null): string {
  let what = `${n.toLocaleString("en-IN")} ${show === "games" ? "games" : "turfs"}`;
  const one = places?.[0]?.trim();
  what += !places ? " here" : one && places.every((p) => p.trim() === one) ? ` at ${one}` : " here";
  if (price && price.n > 0 && price.avg > 0) {
    const avg = `${avgPriceWords(price.avg)} an hour`;
    what += price.n >= n ? `, average ${avg}` : `, average ${avg} over the ${price.n.toLocaleString("en-IN")} with a listed price`;
  }
  return places ? what : `${what}. Zoom in`;
}

/**
 * Where the viewer was on the map's own history entry (history.state), so
 * Back from a turf or game page finds the list as they left it: the view,
 * whether it came from "Near me" (then it never goes into the URL), the
 * phone sheet's stop, how many cards the list showed, how far it was
 * scrolled and the picked card. It stays on the device.
 */
export type MapSnapshot = {
  b: Bounds;
  gps: boolean;
  sheet: "peek" | "half" | "full";
  n: number;
  top: number;
  pick: string[] | null;
};

/** The snapshot kept in history.state, or null when there is none or it is not one. */
export function parseSnapshot(raw: unknown): MapSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const b = Array.isArray(r.b) && r.b.length === 4 ? parseBounds(r.b.join(",")) : null;
  if (!b) return null;
  const n = typeof r.n === "number" && Number.isFinite(r.n) ? Math.min(Math.max(Math.round(r.n), 1), 10_000) : 0;
  const top = typeof r.top === "number" && Number.isFinite(r.top) ? Math.max(0, Math.round(r.top)) : 0;
  const pick = Array.isArray(r.pick) ? r.pick.filter((k): k is string => typeof k === "string" && k.length > 0 && k.length < 100).slice(0, 200) : [];
  return {
    b,
    gps: r.gps === true,
    sheet: r.sheet === "half" || r.sheet === "full" ? r.sheet : "peek",
    n,
    top,
    pick: pick.length ? pick : null,
  };
}
