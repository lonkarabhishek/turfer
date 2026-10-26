import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { activeTurfRows } from "@/lib/queries/turfs";
import { CITIES, cityCopyFrom, cityInfo, isCitySlug, type CityInfo } from "@/lib/city";
import { SPORT_PAGES, turfPlaysSport } from "@/lib/sports";
import { MIN_TURFS_TO_INDEX } from "@/lib/sportCity";

export type LiveCity = CityInfo & { n: number };

// One read of the city_turf_counts view (see getLiveCities).
async function readLiveCities(): Promise<LiveCity[]> {
  const supabase = createReadOnlyClient();
  const { data, error } = await supabase.from("city_turf_counts").select("city, n");
  if (error || !data) {
    console.error("getLiveCities failed", error);
    throw new Error("Live cities read failed");
  }
  // Slug-shaped and not reserved: a turfs.city of "blog" must never
  // become a city whose /blog link is another page.
  const rows = (data as { city: string; n: number }[]).filter((r) => isCitySlug(r.city));
  const order = new Map(CITIES.map((c, i) => [c.id, i]));
  // The view has no ORDER BY: the id breaks the last ties, so two
  // uncurated cities with the same count never swap between reads.
  return rows
    .map((r) => ({ ...cityInfo(r.city), n: r.n }))
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
 */
export const getLiveCities = unstable_cache(readLiveCities, ["live-cities"], { revalidate: 3600 });

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

/** True when the slug has active turfs. */
export async function isLiveCity(slug: string): Promise<boolean> {
  return (await getLiveCities()).some((c) => c.id === slug);
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
const sportCityCounts = new WeakMap<object, Record<string, LiveCity[]>>();

async function getSportCityCounts(): Promise<Record<string, LiveCity[]>> {
  const rows = await activeTurfRows();
  const known = sportCityCounts.get(rows);
  if (known) return known;
  const out: Record<string, LiveCity[]> = {};
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

/** Cities where a "<sport> in <city>" page is indexable, biggest first. */
export async function getCitiesForSport(slug: string): Promise<LiveCity[]> {
  return (await getSportCityCounts())[slug] ?? [];
}

/**
 * Cities to cross-link from a page about one city: up to four from the
 * same state first (local relevance), then the biggest, twelve in all,
 * plus the home cities when they qualify and did not make the cut, so
 * the pages TapTurf started with keep their inbound links.
 */
export const HOME_CITIES: readonly string[] = ["nashik", "nagpur"];

export function pickOtherCities<T extends CityInfo>(cities: T[], current: string, limit = 12): T[] {
  const others = cities.filter((c) => c.id !== current);
  const state = cities.find((c) => c.id === current)?.state ?? cityInfo(current).state;
  const sameState = state === "India" ? [] : others.filter((c) => c.state === state).slice(0, 4);
  const rest = others.filter((c) => !sameState.includes(c));
  const picked = [...sameState, ...rest].slice(0, limit);
  for (const home of HOME_CITIES) {
    const c = others.find((x) => x.id === home);
    if (c && !picked.includes(c)) picked.push(c);
  }
  return picked;
}
