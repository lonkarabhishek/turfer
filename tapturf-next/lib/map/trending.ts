import { mapPoint } from "./data";

/**
 * /map's "Trending" view: the turfs most viewed in the last 24 hours, 7
 * days or 30 days, the window picked by how many views the whole site has
 * (the site owner, 1 Nov: 30 days while views are few, then 7 days, then
 * 24 hours). The database picks the window and ranks the turfs
 * (public.map_turf_trending_auto, 20261102_map_trending_window.sql, by the
 * same rules and thresholds as below: the window, the estimate, the bar a
 * turf must clear, the top ten, and nothing at all under five; before that
 * file, public.map_turf_trending, 20261101_map_turf_heat.sql, 24 hours
 * only) and hands out only the window and each turf's rank, never a count;
 * GET /api/map/trending puts each rank on its turf's map point and key and
 * says the window, and the page marks those turfs' pins and cards, only
 * once the visitor turns Trending on. Pure, relative imports only, so `npm
 * run test:list` compiles it on its own.
 */

/** The window Trending ranks over: the last 24 hours, the last 7 days or the last 30 days. */
export type TrendWindow = "24h" | "7d" | "30d";
export const TREND_WINDOWS: readonly TrendWindow[] = ["24h", "7d", "30d"];

/** Trending uses 24 hours once the site's turf page views in the last 24 hours (the estimate below, every turf on the map) are this many or more. */
export const TRENDING_DAY_TOTAL = 2000;
/** Short of that, 7 days once the site's views in the last 7 days are this many or more; short of both, 30 days. */
export const TRENDING_WEEK_TOTAL = 5000;
/** A turf needs 3 views or more in the window (in 24 hours, an estimated 3) to trend. */
export const TRENDING_MIN_VIEWS = 3;
/** Fewer trending turfs than this is not enough to call anything trending: Trending then shows none. */
export const TRENDING_MIN_TURFS = 5;
/** The top this many by views in the window (turfs with the same views share a rank). */
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
 * Whether a turf trends in 24 hours: an estimate of TRENDING_MIN_VIEWS or
 * more that beats the turf's own daily average over the TRENDING_BASE_DAYS
 * before yesterday (`before`: those days' views summed), so trending means
 * rising, not just always busy.
 */
export function trends(estimate: number, before: number): boolean {
  return estimate >= TRENDING_MIN_VIEWS && estimate > before / TRENDING_BASE_DAYS;
}

/**
 * The window, by the site's views (every active turf with a map point): 24
 * hours once its 24-hour estimate reaches TRENDING_DAY_TOTAL, else 7 days
 * once its last 7 days reach TRENDING_WEEK_TOTAL, else 30 days.
 */
export function trendWindow(total24h: number, total7d: number): TrendWindow {
  if (total24h >= TRENDING_DAY_TOTAL) return "24h";
  if (total7d >= TRENDING_WEEK_TOTAL) return "7d";
  return "30d";
}

export function isTrendWindow(v: unknown): v is TrendWindow {
  return typeof v === "string" && (TREND_WINDOWS as readonly string[]).includes(v);
}

/** India days a 7- or 30-day window counts: today and the 6 (or 29) before it. */
const WINDOW_DAYS = { "7d": 7, "30d": 30 } as const;

/** A turf's views by India day, as turf_daily_views keeps them: `days[0]` today's, `days[1]` yesterday's, and so on back. */
export type TurfDays = { id: string; days: readonly number[] };

function sumDays(days: readonly number[], from: number, to: number): number {
  let n = 0;
  for (let i = from; i < Math.min(to, days.length); i++) n += days[i] || 0;
  return n;
}

/** A turf's views in the window at `at` (ms): in 24 hours the estimate, in 7 or 30 days its days in them. */
export function windowViews(days: readonly number[], w: TrendWindow, at: number): number {
  return w === "24h" ? estimate24h(days[0] || 0, days[1] || 0, at) : sumDays(days, 0, WINDOW_DAYS[w]);
}

/** Whether a turf qualifies in the window: in 24 hours it `trends` (rising); in 7 or 30 days, TRENDING_MIN_VIEWS or more in it. */
export function qualifies(days: readonly number[], w: TrendWindow, at: number): boolean {
  const n = windowViews(days, w, at);
  return w === "24h" ? trends(n, sumDays(days, 2, 2 + TRENDING_BASE_DAYS)) : n >= TRENDING_MIN_VIEWS;
}

/** What map_turf_trending_auto answers: the window and the top turfs' ranks, never a count. */
export type TrendAnswer = { window: TrendWindow; turfs: { turf_id: string; rank: number }[] };

/**
 * map_turf_trending_auto's rules (`turfs`: the active turfs with a map
 * point, at `at`, ms): the window by the site's views, then the turfs that
 * qualify in it ranked by their views in it (1 the most viewed, the same
 * views sharing a rank), the top TRENDING_TOP, and none at all when fewer
 * than TRENDING_MIN_TURFS qualify. In 24 hours that is map_turf_trending's
 * answer exactly.
 */
export function rankTrending(turfs: readonly TurfDays[], at: number): TrendAnswer {
  let day = 0;
  let week = 0;
  for (const t of turfs) {
    day += windowViews(t.days, "24h", at);
    week += windowViews(t.days, "7d", at);
  }
  const window = trendWindow(day, week);
  const hot = turfs.filter((t) => qualifies(t.days, window, at)).map((t) => ({ id: t.id, n: windowViews(t.days, window, at) }));
  if (hot.length < TRENDING_MIN_TURFS) return { window, turfs: [] };
  const ranked = hot.map((x) => ({ turf_id: x.id, rank: 1 + hot.filter((y) => y.n > x.n).length })).filter((x) => x.rank <= TRENDING_TOP);
  ranked.sort((a, b) => a.rank - b.rank || (a.turf_id < b.turf_id ? -1 : a.turf_id > b.turf_id ? 1 : 0));
  return { window, turfs: ranked };
}

/** A row as map_turf_trending returns it (and each of map_turf_trending_auto's turfs). */
export type TrendRow = { turf_id?: unknown; rank?: unknown };

/**
 * map_turf_trending_auto's answer, read without trusting it: the window
 * and each turf's id and rank, nothing else (a count, if one ever came
 * along, goes no further). Null when it is not that shape.
 */
export function readTrendingAuto(data: unknown): { window: TrendWindow; rows: TrendRow[] } | null {
  const d = data as { window?: unknown; turfs?: unknown } | null;
  if (!d || typeof d !== "object" || !isTrendWindow(d.window) || !Array.isArray(d.turfs)) return null;
  const rows: TrendRow[] = d.turfs.map((t: TrendRow | null) => ({ turf_id: t?.turf_id, rank: t?.rank }));
  return { window: d.window, rows };
}

/** An error that says the function is not there (yet): PostgREST's "no such function" (PGRST202), or Postgres's own (42883). */
export function noSuchFunction(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === "PGRST202" || code === "42883";
}

/**
 * The ranks GET /api/map/trending answers with: map_turf_trending_auto's
 * (`auto`); while it is missing (before 20261102_map_trending_window.sql),
 * map_turf_trending's (`day`), 24 hours, as before it; with neither, none,
 * 24 hours. Any other failure is thrown.
 */
export async function trendingRanks(
  auto: () => Promise<{ window: TrendWindow; rows: TrendRow[] }>,
  day: () => Promise<TrendRow[]>,
): Promise<{ window: TrendWindow; rows: TrendRow[] }> {
  try {
    return await auto();
  } catch (e) {
    if (!noSuchFunction(e)) throw e;
  }
  try {
    return { window: "24h", rows: await day() };
  } catch (e) {
    if (noSuchFunction(e)) return { window: "24h", rows: [] };
    throw e;
  }
}

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

/** The list with the trending items first, most viewed first; the rest keep their order after them. */
export function trendFirst<T>(items: readonly T[], rankOf: (t: T) => number | null | undefined): T[] {
  const ranked = items.map((item, i) => ({ item, i, r: rankOf(item) ?? Infinity }));
  ranked.sort((a, b) => a.r - b.r || a.i - b.i);
  return ranked.map((x) => x.item);
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
