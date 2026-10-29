// The reads the prerendered pages share, as functions of a Supabase client,
// so the build-data step (scripts/build-data.ts) records exactly what the
// pages would read, and the pages read the same way when they render on
// their own. No "@/" imports so the step compiles it on its own.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../supabase/paged";
import { TURF_FACT_COLUMNS, type TurfFactRow } from "../seo/turfFacts";

type Row = Record<string, unknown>;
type Answer<T> = { data: T | null; error: { message: string; code?: string } | null };

/**
 * Columns for list pages (cards, search, sort, near-me). select("*")
 * shipped descriptions, data_sources and field_confidence for 240+
 * turfs on every listing: /turfs was 3.4 MB of HTML. Detail pages
 * still use "*" via getTurfById().
 *
 * The list snapshot carries the same columns (v_cols in
 * private.build_turf_list(), 20261026_cache_list_snapshot.sql; keys.test.ts
 * checks they agree). To add a column, replace that function first: a
 * snapshot with extra columns still serves this code. A column added here
 * first makes this app read the table itself (once per list build per
 * process) until the snapshot has it.
 */
export const CARD_COLUMNS = [
  "id", "slug", "name", "address", "area", "city", "sports", "images", "cover_image",
  "rating", "total_reviews", "lat", "lng",
  "morning_price", "afternoon_price", "evening_price",
  "weekend_morning_price", "weekend_afternoon_price", "weekend_evening_price",
  "price_mentions", "price_unit", "slot_minutes", "is_covered", "has_floodlights",
  "start_time", "end_time", "is_24x7", "membership_required", "is_active",
  // Ask TapTurf filters on these; forCard() drops them before pages ship them.
  "amenities", "parking_available", "washroom_available", "changing_room_available", "has_cafeteria", "equipment_provided",
  // AI cover pass: photos judged unusable are dropped from images below.
  "image_review",
  // An owner manages it on myTapturf: the card's Claimed mark.
  "claimed",
].join(", ");

/**
 * Every active turf's card columns straight from the table, rating then id
 * (the way without a usable list snapshot). `tag` goes out as a header so a
 * build-time read is never answered from Next's fetch cache (readLiveRows in
 * lib/queries/turfs.ts).
 */
export function readCardRows(db: SupabaseClient, tag?: string | null): Promise<Row[]> {
  return fetchAllRows<Row>((from, to) => {
    const query = db.from("turfs").select(CARD_COLUMNS).eq("is_active", true).order("rating", { ascending: false }).order("id").range(from, to);
    return (tag ? query.setHeader("x-tapturf-read", tag) : query) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>;
  });
}

/** The error for a selected column the view does not have (Postgres 42703, passed on by PostgREST). */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || /column \S*\b(?:lat|lng)\b\S* does not exist/i.test(error.message ?? "");
}

/**
 * The city_turf_counts view: city, active turfs, and their median point.
 * Before 20261028_city_centroids.sql the view has no lat or lng, and
 * naming them fails the whole read: read the counts alone, so a deploy
 * ahead of the migration only loses the centroids (uncurated cities list
 * last, as before), never the city list.
 */
export async function readCityCountRows(db: SupabaseClient): Promise<Answer<Row[]>> {
  let { data, error } = await db.from("city_turf_counts").select("city, n, lat, lng");
  if (isMissingColumn(error)) ({ data, error } = await db.from("city_turf_counts").select("city, n"));
  return { data, error };
}

/** Every active turf's name, city, numbers and hours, for lib/seo/turfFacts.ts (which keeps only ids and keys). */
export function readTurfFactRows(db: SupabaseClient): Promise<TurfFactRow[]> {
  return fetchAllRows<TurfFactRow>(
    (from, to) => db.from("turfs").select(TURF_FACT_COLUMNS).eq("is_active", true).order("id").range(from, to) as unknown as PromiseLike<{ data: TurfFactRow[] | null; error: unknown }>,
  );
}

export type SitemapTurf = { id: string; slug: string | null; updated_at: string | null; city: string | null; sports: unknown };
export type SitemapGame = { id: string; updated_at: string | null; date: string | null; start_time: string | null; status: string | null };

/** The sitemap's turfs: every active one, by id. */
export function readSitemapTurfs(db: SupabaseClient): Promise<SitemapTurf[]> {
  return fetchAllRows<SitemapTurf>((from, to) => db.from("turfs").select("id, slug, updated_at, city, sports").eq("is_active", true).order("id").range(from, to));
}

const OPEN_GAMES = ["open", "upcoming", "active"];

/** The sitemap's games: every open one. */
export function readSitemapGames(db: SupabaseClient): PromiseLike<Answer<SitemapGame[]>> {
  return db.from("games").select("id, updated_at, date, start_time, status").in("status", OPEN_GAMES);
}

export type TrendingRow = { city: string; turf_id: string; tagline: string | null; starts_at: string; ends_at: string };

/** Trending picks whose window has not closed at `now` (the live ones and those still to start), latest start first. */
export async function readTrendingRows(db: SupabaseClient, now: Date): Promise<Answer<TrendingRow[]>> {
  return db
    .from("trending_turfs")
    .select("city, turf_id, tagline, starts_at, ends_at")
    .gt("ends_at", now.toISOString())
    .order("starts_at", { ascending: false });
}

/** The pick live at `now` for each city: starts_at <= now < ends_at, the latest start winning when windows overlap. */
export function livePicks(rows: readonly TrendingRow[], now: Date): TrendingRow[] {
  const t = now.getTime();
  const seen = new Set<string>();
  const out: TrendingRow[] = [];
  for (const r of rows) {
    if (!(Date.parse(r.starts_at) <= t && t < Date.parse(r.ends_at)) || seen.has(r.city)) continue;
    seen.add(r.city);
    out.push(r);
  }
  return out;
}

export const GAME_TURF_COLUMNS = 'id, slug, name, address, city, lat, lng, "Gmap Embed link"';
/** /games' cards also show the turf's area and photos. */
export const GAME_CARD_TURF_COLUMNS = 'id, slug, name, address, area, city, lat, lng, "Gmap Embed link", cover_image, images, image_review';

/** Every open game, soonest first (/games). */
export function readAvailableGames(db: SupabaseClient): PromiseLike<Answer<Row[]>> {
  return db.from("games").select("*").in("status", OPEN_GAMES).order("date", { ascending: true });
}

/** Open games from `today` (YYYY-MM-DD, India), soonest first, at most 300 (the home and Ask). */
export function readOpenGames(db: SupabaseClient, today: string): PromiseLike<Answer<Row[]>> {
  return db.from("games").select("*").in("status", OPEN_GAMES).gte("date", today).order("date", { ascending: true }).limit(300);
}

/** The turfs of those games (fetched apart: no joins, see CLAUDE.md); `card`: with /games' area and photos. */
export function readGameTurfs(db: SupabaseClient, ids: string[], { card = false } = {}): PromiseLike<Answer<Row[]>> {
  const turfs = db.from("turfs");
  return card ? turfs.select(GAME_CARD_TURF_COLUMNS).in("id", ids) : turfs.select(GAME_TURF_COLUMNS).in("id", ids);
}

/** Today in India as a date at local midnight, since game dates are stored that way. */
export function istToday(now = new Date()): Date {
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60_000);
  ist.setHours(0, 0, 0, 0);
  return ist;
}
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Turf pages built at deploy: the most reviewed active turfs (the ones
 * people and Google open most). Every other turf page renders on its first
 * visit and is cached from then on. 0 builds none.
 */
export const PRERENDERED_TURF_PAGES = 300;

/**
 * Their URL keys (the slug, or the id for a turf without one), most
 * reviewed first (no count last), then by id: the order getTopTurfKeys
 * reads from the table, here from list rows.
 */
export function topTurfKeys(rows: readonly Row[], limit: number): string[] {
  const reviews = (r: Row) => (typeof r.total_reviews === "number" && Number.isFinite(r.total_reviews) ? r.total_reviews : null);
  return [...rows]
    .sort((a, b) => {
      const ra = reviews(a);
      const rb = reviews(b);
      if (ra !== rb) return ra === null ? 1 : rb === null ? -1 : rb - ra;
      return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
    })
    .slice(0, Math.max(0, limit))
    .map((r) => (typeof r.slug === "string" && r.slug ? r.slug : String(r.id)));
}
