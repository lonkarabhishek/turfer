/**
 * Trending by views, as it travels and as it is said: the window, a turf's
 * rank, GET /api/map/trending's answer read back without trusting it, and
 * the words for both. These lived in lib/map/trending.ts, which still
 * hands every one of them out under the same names (the map and its tests
 * import them from there); they are here on their own, importing nothing,
 * so the turf page and every list can read the same answer and say the
 * same words (lib/map/trendingClient.ts) without carrying the map's turf
 * shaping (lib/map/data.ts) in their scripts. Pure, no imports, so `npm
 * run test:list` compiles it on its own.
 */

/** The window Trending ranks over: the last 24 hours, the last 7 days or the last 30 days. */
export type TrendWindow = "24h" | "7d" | "30d";
export const TREND_WINDOWS: readonly TrendWindow[] = ["24h", "7d", "30d"];

/** Fewer trending turfs than this is not enough to call anything trending: Trending then shows none. */
export const TRENDING_MIN_TURFS = 5;
/** The top this many by views in the window (turfs with the same views share a rank). */
export const TRENDING_TOP = 10;

export function isTrendWindow(v: unknown): v is TrendWindow {
  return typeof v === "string" && (TREND_WINDOWS as readonly string[]).includes(v);
}

/** A trending turf, as sent: its pin's key, where it is (5 decimals) and its rank, 1 the most viewed. */
export type TrendWire = { k: string; y: number; x: number; r: number };

export function trendRank(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= TRENDING_TOP ? n : null;
}

/** The trending turfs, or none when there are fewer than TRENDING_MIN_TURFS: too few views to call anything trending. */
export function enoughTrending<T>(list: readonly T[]): T[] {
  return list.length >= TRENDING_MIN_TURFS ? [...list] : [];
}

/** The window the route's answer ranks over; an answer that says none is 24 hours (the route said none before it had others). */
export function parseTrendWindow(json: unknown): TrendWindow {
  const w = (json as { window?: unknown } | null)?.window;
  return isTrendWindow(w) ? w : "24h";
}

/** The route's answer, read back without trusting it: anything that is not a point with a rank is dropped, and a key seen before. */
export function parseTrending(json: unknown): TrendWire[] {
  const list = (json as { trending?: unknown } | null)?.trending;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: TrendWire[] = [];
  for (const t of list) {
    const r = trendRank(t?.r);
    if (!r || typeof t?.k !== "string" || !t.k || seen.has(t.k)) continue;
    if (typeof t.y !== "number" || typeof t.x !== "number" || Math.abs(t.y) > 90 || Math.abs(t.x) > 180) continue;
    seen.add(t.k);
    out.push({ k: t.k, y: t.y, x: t.x, r });
  }
  return out.sort((a, b) => a.r - b.r);
}

const SPAN: Record<TrendWindow, string> = { "24h": "the last 24 hours", "7d": "the last 7 days", "30d": "the last 30 days" };
const SHORT: Record<TrendWindow, string> = { "24h": "last 24 h", "7d": "last 7 days", "30d": "last 30 days" };

/** The window in words, "the last 7 days". */
export function trendSpan(w: TrendWindow): string {
  return SPAN[w];
}

/** The Trending legend on the map, "Most viewed · last 7 days". */
export function trendLegend(w: TrendWindow): string {
  return `Most viewed · ${SHORT[w]}`;
}

/** What a screen reader hears about a trending turf, after its name and price. */
export function trendWords(rank: number, w: TrendWindow = "24h"): string {
  return `trending, number ${rank} by views in ${SPAN[w]}`;
}
