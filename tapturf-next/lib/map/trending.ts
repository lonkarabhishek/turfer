import { mapPoint } from "./data";

/**
 * /map's "Trending" view: the turfs most viewed in the last 24 hours. The
 * database ranks them (public.map_turf_trending, 20261101_map_turf_heat.sql,
 * by the same rules as below: the estimate, the bar a turf must clear, the
 * top ten, and nothing at all under five) and hands out only each one's
 * rank, never a count; GET /api/map/trending puts each rank on its turf's
 * map point and key, and the page marks those turfs' pins and cards, only
 * once the visitor turns Trending on. Pure, relative imports only, so `npm
 * run test:list` compiles it on its own.
 */

/** A turf needs an estimated 3 views or more in the last 24 hours to trend. */
export const TRENDING_MIN_VIEWS = 3;
/** Fewer trending turfs than this is not enough to call anything trending: Trending then shows none. */
export const TRENDING_MIN_TURFS = 5;
/** The top this many by the estimate (turfs with the same estimate share a rank). */
export const TRENDING_TOP = 10;
/** A turf's own recent daily average is over this many India days: the ones before yesterday. */
export const TRENDING_BASE_DAYS = 7;

const DAY_MS = 86_400_000;
/** India is UTC+5:30 all year. */
const INDIA_MS = 5.5 * 3_600_000;

/**
 * The share of yesterday (India's day) still inside the last 24 hours at
 * `at` (ms): 1 at India midnight, falling evenly to 0 by the next.
 */
export function yesterdayShare(at: number): number {
  const into = (((at + INDIA_MS) % DAY_MS) + DAY_MS) % DAY_MS;
  return 1 - into / DAY_MS;
}

/**
 * Views in the last 24 hours, estimated from India day totals (the views
 * table keeps one per turf per day, no hours): today's so far, which are
 * all inside the window, plus yesterday's scaled by the share of yesterday
 * still inside it. That assumes a day's views spread evenly through it. It
 * is exact at India midnight and runs on across it without a jump (today
 * becomes yesterday with all of it inside).
 */
export function estimate24h(today: number, yesterday: number, at: number): number {
  return today + yesterday * yesterdayShare(at);
}

/**
 * Whether a turf trends: an estimate of TRENDING_MIN_VIEWS or more that
 * beats the turf's own daily average over the TRENDING_BASE_DAYS before
 * yesterday (`before`: those days' views summed), so trending means rising,
 * not just always busy.
 */
export function trends(estimate: number, before: number): boolean {
  return estimate >= TRENDING_MIN_VIEWS && estimate > before / TRENDING_BASE_DAYS;
}

/** A row as map_turf_trending returns it. */
export type TrendRow = { turf_id?: unknown; rank?: unknown };

/** A trending turf, as sent: its pin's key, where it is (5 decimals) and its rank, 1 the most viewed. */
export type TrendWire = { k: string; y: number; x: number; r: number };

export function trendRank(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= TRENDING_TOP ? n : null;
}

/**
 * Each row's rank on its turf's map point, for the turfs on the map (an
 * active turf with a usable location: the map's own list), most viewed
 * first. A row for any other turf, or with no usable rank, is left out,
 * and so is a turf listed twice after its first.
 */
export function joinTrending(rows: readonly TrendRow[], turfs: readonly { id: string; slug?: string | null; lat?: unknown; lng?: unknown }[]): TrendWire[] {
  const byId = new Map(turfs.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const out: TrendWire[] = [];
  for (const row of rows) {
    const id = typeof row?.turf_id === "string" ? row.turf_id : null;
    const r = trendRank(row?.rank);
    const t = id ? byId.get(id) : undefined;
    if (!id || !r || !t || seen.has(id)) continue;
    const p = mapPoint(t);
    if (!p) continue;
    seen.add(id);
    out.push({ k: p.k, y: p.y, x: p.x, r });
  }
  return out.sort((a, b) => a.r - b.r);
}

/** The trending turfs, or none when there are fewer than TRENDING_MIN_TURFS: too few views to call anything trending. */
export function enoughTrending<T>(list: readonly T[]): T[] {
  return list.length >= TRENDING_MIN_TURFS ? [...list] : [];
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

/** The list with the trending items first, most viewed first; the rest keep their order after them. */
export function trendFirst<T>(items: readonly T[], rankOf: (t: T) => number | null | undefined): T[] {
  const ranked = items.map((item, i) => ({ item, i, r: rankOf(item) ?? Infinity }));
  ranked.sort((a, b) => a.r - b.r || a.i - b.i);
  return ranked.map((x) => x.item);
}

/** What a screen reader hears about a trending turf, after its name and price. */
export function trendWords(rank: number): string {
  return `trending, number ${rank} by views in the last 24 hours`;
}
