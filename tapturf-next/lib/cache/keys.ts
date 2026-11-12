// Cache keys the database queues in private.cache_dirty and /api/revalidate
// turns into purges (supabase/migrations/20261020_cache_queue.sql).
// No "@/" imports so the unit test compiles it on its own (npm run test:cache).
//
// Until 20 Oct every changed turf row posted its own webhook, and each one
// hard-expired about 990 cached pages and every turf cache. Pages rebuilt
// with the data cache bypassed and read the whole turf table again; on
// 19/20 Oct that load took the database down. Now a trigger only notes a
// key, pg_cron sends the batch once a minute, and a list change marks the
// pages stale (they keep serving while they rebuild) instead of expiring them.

import { GAMES_TAG, listPurgeTags } from "./listTags";

/** At most this many keys per request; the flush never sends more. */
export const MAX_KEYS = 1000;

/**
 * list:<city>  the lists showing that city's turfs changed (cards, counts,
 *              trending spotlight). list:all is a turf with no valid city.
 * turf:<key>   one turf page, by slug, or by id for the /turf/<id> redirect.
 * games        open games changed (every page that shows them carries the games tag).
 */
const KEY = /^(list:[a-z][a-z-]{1,30}|turf:[a-z0-9-]{1,120}|games)$/;

export type Purge = {
  /** Cities whose lists changed. */
  cities: string[];
  /** Turf page keys: each becomes /turf/<key>. */
  turfs: string[];
  games: boolean;
  /** Keys that did not match the shapes above (skipped, not retried). */
  rejected: string[];
};

/** What /api/revalidate does for one batch, in this order. */
export type PurgeCalls = {
  /** Read the new list version into the data cache first (warmTurfList): only before a list purge. */
  warm: boolean;
  /** revalidateTag(tag, "max") each: marked stale, served while they rebuild. */
  tags: string[];
  /** revalidatePath(path) each: one turf page, hard expired. */
  paths: string[];
  /** revalidatePath(route, "page") each: every page of that route, hard expired (GAME_PAGES). */
  pages: string[];
};

/**
 * The game page's route. With the games key every /game/<...> entry is
 * hard expired as well as marked stale: an entry there may be a redirect
 * (the old id link, words the game no longer has: lib/utils/gamePath.ts),
 * and a redirect rebuilt in the background behind a stale answer does not
 * get its new Location where the rebuild shares the stale answer's
 * response (`next start`: a page that became a redirect answers 308 with
 * no Location, a redirect keeps its old target). Expired, the next
 * request waits for one render (the game and its turf, two reads; nothing
 * of the page is in the data cache) and its redirect is whole. The other
 * pages with the games tag are never redirects and stay stale-while-rebuilt.
 */
export const GAME_PAGES = "/game/[id]";

/**
 * The purges for a batch (lib/cache/listTags.ts has the tags):
 * list:<city> marks that city's pages, the all-India pages and the old
 * "turf-data" readers stale, never another city's pages; games marks
 * every page that shows open games and expires the game pages
 * (GAME_PAGES); turf:<key> expires /turf/<key>.
 * A legacy per-row post (no keys array) never purges the lists (see the
 * route), and never carries games.
 */
export function purgeCalls(plan: Purge, legacy: boolean): PurgeCalls {
  const lists = legacy ? [] : listPurgeTags(plan.cities);
  const tags = plan.games ? [...lists, GAMES_TAG] : lists;
  return { warm: lists.length > 0, tags, paths: plan.turfs.map((k) => `/turf/${k}`), pages: plan.games ? [GAME_PAGES] : [] };
}

/** Sort valid keys into what to purge. Duplicates collapse. */
export function planPurge(keys: readonly unknown[]): Purge {
  const cities = new Set<string>();
  const turfs = new Set<string>();
  const rejected: string[] = [];
  let games = false;
  for (const k of keys) {
    if (typeof k !== "string" || !KEY.test(k)) {
      rejected.push(String(k).slice(0, 80));
      continue;
    }
    if (k === "games") games = true;
    else if (k.startsWith("list:")) cities.add(k.slice(5));
    else turfs.add(k.slice(5));
  }
  return { cities: [...cities], turfs: [...turfs], games, rejected };
}

/**
 * turfs columns no public page renders: admin passes and provenance
 * stamps. A change to only these queues nothing. Mirrors v_ignore in
 * private.mark_turf_dirty(); keys.test.ts checks the two agree.
 */
export const IGNORE_COLUMNS: readonly string[] = [
  "updated_at", "listing_review", "listing_checked_at", "review_summary_at", "cover_reviewed_at",
  "data_sources", "field_confidence", "price_verified_at", "description_updated_at", "data_verified_at",
];

/**
 * turfs columns list pages read: CARD_COLUMNS in lib/build/reads.ts plus
 * is_active, city and slug. A change here refreshes the lists; any other
 * column (including ones added later) refreshes only the turf's own page.
 * Mirrors v_list in private.mark_turf_dirty(); keys.test.ts checks both.
 */
export const LIST_COLUMNS: readonly string[] = [
  "id", "slug", "name", "address", "area", "city", "sports", "images", "cover_image",
  "rating", "total_reviews", "lat", "lng",
  "morning_price", "afternoon_price", "evening_price",
  "weekend_morning_price", "weekend_afternoon_price", "weekend_evening_price",
  "price_mentions", "price_unit", "slot_minutes", "is_covered", "has_floodlights",
  "start_time", "end_time", "is_24x7", "membership_required", "is_active",
  "amenities", "parking_available", "washroom_available", "changing_room_available", "has_cafeteria", "equipment_provided",
  "image_review",
  "claimed",
];

const CITY = /^[a-z][a-z-]{1,30}$/;
const listKey = (city: unknown) => `list:${typeof city === "string" && CITY.test(city) ? city : "all"}`;
const turfKey = (key: unknown) => (typeof key === "string" && key ? `turf:${key.toLowerCase()}` : null);

type Row = Record<string, unknown>;

/** Columns whose values differ between two rows (JSON comparison, so jsonb arrays compare by value). */
function changedColumns(a: Row, b: Row): string[] {
  const cols = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...cols].filter((c) => JSON.stringify(a[c] ?? null) !== JSON.stringify(b[c] ?? null));
}

/**
 * Keys for one row change, by the same rules as the database triggers.
 * turfs: an UPDATE of only ignored columns queues nothing; a list column
 * on an active (or just deactivated) turf queues list:<city> (and the old
 * city); any visible change queues the turf page, plus the old slug and
 * the /turf/<id> redirect when the slug moved. An active INSERT queues
 * the lists and its page: a turf deleted and imported again under the
 * same slug would otherwise serve a 404 cached for a day (an uncached
 * page costs nothing to purge). trending_turfs: the city's lists and the
 * turf page (by id here; the trigger looks the slug up).
 */
export function keysForRow(table: string | undefined, op: string | undefined, rec: Row | null, old: Row | null): string[] {
  const keys = new Set<string>();
  const add = (k: string | null) => k && keys.add(k);
  if (table === "trending_turfs") {
    for (const r of [rec, old]) {
      if (!r) continue;
      add(listKey(r.city));
      add(turfKey(r.turf_id));
    }
    return [...keys];
  }
  if (op === "INSERT") {
    if (rec?.is_active === true) {
      add(listKey(rec.city));
      add(turfKey(rec.slug ?? rec.id));
    }
    return [...keys];
  }
  if (op === "DELETE" || !rec || !old) {
    const r = old ?? rec;
    if (!r) return [];
    if (r.is_active === true) add(listKey(r.city));
    add(turfKey(r.slug));
    add(turfKey(r.id));
    return [...keys];
  }
  const changed = changedColumns(rec, old).filter((c) => !IGNORE_COLUMNS.includes(c));
  if (changed.length === 0) return [];
  if (changed.some((c) => LIST_COLUMNS.includes(c)) && (rec.is_active === true || old.is_active === true)) {
    add(listKey(rec.city));
    if (old.city !== rec.city) add(listKey(old.city));
  }
  add(turfKey(rec.slug ?? rec.id));
  if (old.slug !== rec.slug) {
    add(turfKey(old.slug));
    add(turfKey(rec.id));
  }
  return [...keys];
}
