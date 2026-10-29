import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { activeTurfRows, markStaleRender } from "@/lib/queries/turfs";
import { CITIES, cityCopyFrom, cityInfo, isCitySlug, type CityInfo } from "@/lib/city";
import { SPORT_PAGES, turfPlaysSport } from "@/lib/sports";
import { MIN_TURFS_TO_INDEX } from "@/lib/sportCity";
import { readCityCountRows } from "@/lib/build/reads";
import { buildData } from "@/lib/build/data";

// Pure, in lib/city.ts so test:city covers them; still imported from here.
export { HOME_CITIES, pickOtherCities } from "@/lib/city";

/** A city and its active turf count. */
export type CityCountRow = CityInfo & { n: number };

/**
 * A live city: its count and its centroid, the median of its active
 * turfs (city_turf_counts lat, lng). Null when none of its turfs is inside
 * India's box, or when the view predates 20261028_city_centroids.sql.
 * lib/city.ts cityPoint prefers the curated centroid and uses this one
 * for a city that is not curated.
 */
export type LiveCity = CityCountRow & { lat: number | null; lng: number | null };

type CountsRow = { city: string; n: number; lat?: unknown; lng?: unknown };

const coord = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// One read of the city_turf_counts view (see getLiveCities); while
// building, the one the build-data step made (lib/build/data.ts).
async function readLiveCities(): Promise<LiveCity[]> {
  let data = buildData("cities");
  if (!data) {
    const res = await readCityCountRows(createReadOnlyClient());
    if (res.error || !res.data) {
      console.error("getLiveCities failed", res.error);
      throw new Error("Live cities read failed");
    }
    data = res.data;
  }
  // Slug-shaped and not reserved: a turfs.city of "blog" must never
  // become a city whose /blog link is another page.
  const rows = (data as CountsRow[]).filter((r) => isCitySlug(r.city));
  const order = new Map(CITIES.map((c, i) => [c.id, i]));
  // The view has no ORDER BY: the id breaks the last ties, so two
  // uncurated cities with the same count never swap between reads.
  return rows
    .map((r) => ({ ...cityInfo(r.city), n: r.n, lat: coord(r.lat), lng: coord(r.lng) }))
    .sort((a, b) => b.n - a.n || (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || a.id.localeCompare(b.id));
}

/**
 * Cities that actually have active turfs, from the city_turf_counts
 * view, biggest first. Curated cities keep their label and state; a
 * city the data team added that is not in lib/city.ts yet gets a
 * title-cased label, so its page, sitemap entry and picker row appear
 * without a code change. Cached for an hour.
 *
 * A failed read throws instead of returning the curated list: that
 * fallback was cached for an hour, so every city missing from it 404'd
 * and counts read 0 until the next refresh. A throw caches nothing; a
 * stale copy keeps serving, and a page with none fails its rebuild and
 * keeps its last good version.
 *
 * Once per render (React cache()): a regenerating page skips the data
 * cache, and /<city> and /c/<city> asked 3 times each (metadata, layout or
 * page, the list), so a purge's burst of rebuilds ran city_turf_counts 3
 * times per page (3,524 calls by 27 Oct, 200 ms on average, up to 2.9 s).
 * When the read fails, a warm instance serves the last list it read
 * (logged at most every 30 s) and the page is kept a minute only
 * (markStaleRender), as with the turf rows. That list can be an hour old
 * or more (the hourly entry, or an instance idle since), so isLiveCity
 * never reads "not live" from it (see there).
 */
const getLiveCitiesCached = unstable_cache(readLiveCities, ["live-cities"], { revalidate: 3600 });
let liveKept: LiveCity[] | null = null;
let liveFailLoggedAt = -Infinity;
// The answers that were liveKept served after a failed read (each its own array).
const keptAnswers = new WeakSet<LiveCity[]>();

export const getLiveCities = cache(async (): Promise<LiveCity[]> => {
  try {
    const cities = await getLiveCitiesCached();
    liveKept = cities;
    return cities;
  } catch (e) {
    if (!liveKept) throw e;
    if (Date.now() - liveFailLoggedAt >= 30_000) {
      liveFailLoggedAt = Date.now();
      console.warn("getLiveCities: read failed, serving this instance's last list", e instanceof Error ? e.message : e);
    }
    await markStaleRender();
    const kept = liveKept.slice();
    keptAnswers.add(kept);
    return kept;
  }
});

/**
 * The same list for the footer, which is on every page: its own copy,
 * cached for a day and untagged. unstable_cache lowers the revalidate of
 * every page that reads it to its own, so the footer reading the hourly
 * copy made the day-long turf pages (2.6k of them, one turf_page call per
 * refresh) refresh every hour. Tagging it "turf-data" would mark every
 * turf page stale on each list purge.
 *
 * A warm instance also keeps it in memory for an hour: a purged turf page
 * rebuilds with the data cache bypassed, and without the memo each of
 * those rebuilds re-ran the city_turf_counts query (20 Oct follow-up).
 * Throws like getLiveCities; the footer falls back for that render.
 */
const getFooterCitiesCached = unstable_cache(readLiveCities, ["live-cities-footer"], { revalidate: 86400 });
const FOOTER_MEMO_MS = 3_600_000;
let footerMemo: { at: number; cities: LiveCity[] } | null = null;
let footerPending: Promise<LiveCity[]> | null = null;

export function getFooterCities(): Promise<LiveCity[]> {
  if (footerMemo && Date.now() - footerMemo.at < FOOTER_MEMO_MS) return Promise.resolve(footerMemo.cities);
  footerPending ??= getFooterCitiesCached()
    .then((cities) => {
      footerMemo = { at: Date.now(), cities };
      return cities;
    })
    .catch((e) => {
      // An hour-old list beats the curated fallback.
      if (!footerMemo) throw e;
      return footerMemo.cities;
    })
    .finally(() => {
      footerPending = null;
    });
  return footerPending;
}

/**
 * True when the slug has active turfs. A failed read throws, and so does a
 * city missing from the instance's last list served after one: that list
 * may predate the city, and "not live" 404s the page (cached in place of a
 * good one). Throwing fails the render and the last good page stays.
 */
export async function isLiveCity(slug: string): Promise<boolean> {
  const cities = await getLiveCities();
  if (cities.some((c) => c.id === slug)) return true;
  if (keptAnswers.has(cities)) throw new Error(`Live cities read failed; ${slug} is not in this instance's last list`);
  return false;
}

export type CityCopy = ReturnType<typeof cityCopyFrom>;

/**
 * Prose from the live city list, biggest first, with the real count:
 * list "Hyderabad, Bangalore, Pune, Mumbai, Delhi & 83 more", listAnd
 * "... and 83 more cities", short "Hyderabad, Bangalore & more" for
 * <title> tags. Same shapes as CITY_LIST, CITY_LIST_AND and
 * CITY_LIST_SHORT, the static fallback, which name no count. Cached
 * with getLiveCities (1h).
 */
export async function getCityCopy(): Promise<CityCopy> {
  return cityCopyFrom((await getLiveCities()).map((c) => c.label));
}

/**
 * Cities with enough turfs for an indexable "<sport> in <city>" page,
 * per sport, biggest first: the same rule the sitemap applies, so
 * cross-links and the sitemap name the same pages. Counted from the
 * active turf rows the page already has (activeTurfRows), once per
 * snapshot version: the rows array is the same object until the version
 * moves, so the map is kept next to it.
 *
 * This was its own hourly unstable_cache read of (city, sports) for every
 * active turf. A regeneration skips the data cache, so each /<city>/<sport>
 * rebuild (the page group with the most turf list reads: 194 of the 513
 * logged on 25-26 Oct) ran those 4 statements on top of the list. Its only
 * caller is /<city>/<sport>, which reads the rows anyway, so no page gains
 * a tag or a shorter revalidate. A failed read throws, as before.
 */
const sportCityCounts = new WeakMap<object, Record<string, CityCountRow[]>>();

async function getSportCityCounts(): Promise<Record<string, CityCountRow[]>> {
  const rows = await activeTurfRows();
  const known = sportCityCounts.get(rows);
  if (known) return known;
  const out: Record<string, CityCountRow[]> = {};
  const split = (raw: unknown): string[] =>
    (Array.isArray(raw) ? raw : [])
      .flatMap((x) => (typeof x === "string" ? x.split(",") : []))
      .map((x) => x.trim())
      .filter(Boolean);
  const order = new Map(CITIES.map((c, i) => [c.id, i]));
  for (const sp of SPORT_PAGES) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const city = typeof r.city === "string" ? r.city : null;
      if (!isCitySlug(city)) continue;
      if (!turfPlaysSport(split(r.sports), sp)) continue;
      counts.set(city, (counts.get(city) ?? 0) + 1);
    }
    out[sp.slug] = [...counts.entries()]
      .filter(([, n]) => n >= MIN_TURFS_TO_INDEX)
      .map(([city, n]) => ({ ...cityInfo(city), n }))
      .sort((a, b) => b.n - a.n || (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || a.id.localeCompare(b.id));
  }
  sportCityCounts.set(rows, out);
  return out;
}

/**
 * Cities where a "<sport> in <city>" page is indexable, biggest first.
 * No centroids here: place them with cityPointsOf(await getLiveCities()).
 */
export async function getCitiesForSport(slug: string): Promise<CityCountRow[]> {
  return (await getSportCityCounts())[slug] ?? [];
}
