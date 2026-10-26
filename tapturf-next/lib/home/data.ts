import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { getLiveCities } from "@/lib/queries/cities";
import { readTrendingPicks, toSpotlights } from "@/lib/queries/trending";
import { loadOpenGames } from "@/lib/ai/games";
import { sortGamesByDateTime } from "@/lib/utils/game";
import { CITIES, cityInfo, guessCityFromAddress, isCity } from "@/lib/city";
import { SPORT_PAGES, sportPageForLabel, turfPlaysSport } from "@/lib/sports";
import { MIN_TURFS_TO_INDEX } from "@/lib/sportCity";
import { hasEnoughReviews } from "@/lib/utils/ranking";
import { summarisePrice } from "@/lib/utils/prices";
import { areaFor } from "@/lib/utils/area";
import { imageUrlForCard, turfPhotos, upsizeGoogleUserContent } from "@/lib/utils/images";
import { getSortedPosts } from "@/content/blog";
import type { Turf } from "@/types/turf";
import type { Game } from "@/types/game";
import type { HomeCityRow, HomeData, HomeGame, HomeHeroProps, HomePost, HomeStrip, HomeTile, HeroCity } from "./types";
import { formatTime12, plural } from "./format";

export const HOME_REVALIDATE = 600;
export { plural, formatTime12 };

/** Cities ranked above this ship six photo tiles; the rest ship three. */
const FULL_STRIP_CITIES = 12;
const GAMES_PER_CITY = 3;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Hosts with a smaller card-size copy: Google, Drive, and our own mirrored photos. */
function isGoogleHosted(url: string): boolean {
  return /googleusercontent\.com|drive\.google\.com|\/storage\/v1\/object\/public\/turf-photos\//i.test(url);
}

function toTile(t: Turf, cityLabel?: string): HomeTile {
  // Our own copy first: Google photo links expire, and a tile has one photo.
  const photoRaw = turfPhotos(t)[0] ?? null;
  // Cards are 236px wide on phones; 480x360 is plenty for lh3 photos
  // and imageUrlForCard handles Drive thumbnails and other hosts.
  const photo = photoRaw ? upsizeGoogleUserContent(imageUrlForCard(photoRaw), 480, 360) : null;
  const sp = t.sports.map(sportPageForLabel).find(Boolean);
  const price = summarisePrice(t);
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    place: areaFor(t) ?? t.address,
    rating: t.rating,
    reviews: t.total_reviews,
    photo,
    sport: sp?.name ?? t.sports[0] ?? null,
    // Reported prices (from review mentions) carry a "(reported)" suffix
    // that a 236px tile would truncate away, so only listed rates show.
    price: price.kind === "real" ? price.label : null,
    ...(cityLabel ? { cityLabel } : {}),
  };
}

export function toHomeGame(g: Game): HomeGame {
  const [y, m, d] = g.date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const when = Number.isNaN(dt.getTime()) ? g.date : `${WEEKDAYS[dt.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
  const sp = sportPageForLabel(g.sport ?? "");
  const address = g.turfs?.address ?? null;
  return {
    id: g.id,
    sport: sp?.name ?? titleCase(g.sport ?? "Game"),
    when,
    time: formatTime12(g.start_time),
    turfName: g.turfs?.name ?? null,
    place: address?.split(",")[0]?.trim() || null,
    city: g.turfs?.city ?? guessCityFromAddress(address),
    spotsLeft: Math.max(0, (g.max_players ?? 0) - (g.current_players ?? 0)),
    price: Number(g.price_per_player) || 0,
  };
}

const curatedIndex = (() => {
  const order = new Map(CITIES.map((c, i) => [c.id, i]));
  return (id: string) => order.get(id) ?? 999;
})();

function modeOf(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

/**
 * The home's small non-turf reads (live trending picks, open games),
 * one shared copy for the home window. Kept apart from the turf rows so
 * this entry never wraps another unstable_cache (see getHomeData), and
 * so each home render (one variant per city plus all-India) does not query
 * them again. Tagged "turf-data": a trending change or a pick's window
 * opening or closing purges it through the cache queue.
 *
 * Both reads throw on failure, so a failure is never stored: with the
 * database breaker open both used to return empty, and every home
 * variant then rendered (and cached) without spotlights or games for
 * the whole window. Now a refresh that fails keeps serving the last copy
 * (unstable_cache returns the stale value), and a first read that fails
 * fails the render, so ISR keeps the last good page.
 */
const getHomeExtras = unstable_cache(
  async () => {
    const [picks, games] = await Promise.all([readTrendingPicks(), loadOpenGames({ strict: true })]);
    return { picks, games };
  },
  ["home-extras-v1"],
  { revalidate: HOME_REVALIDATE, tags: ["turf-data"] },
);

async function buildHomeData(): Promise<HomeData> {
  const [turfs, live, { picks, games }] = await Promise.all([
    getAllActiveTurfs(),
    getLiveCities().catch(() => []),
    getHomeExtras(),
  ]);

  // One pass: group by city. Rows come back in compareTopRated order,
  // so every per-city list is already ranked.
  // Only slug-shaped ids: a stray capitalised or spaced turfs.city value
  // must never become a /{city} link that 404s.
  const byCity = new Map<string, Turf[]>();
  for (const t of turfs) {
    const id = t.city ?? guessCityFromAddress(t.address);
    if (!id || !isCity(id)) continue;
    const list = byCity.get(id);
    if (list) list.push(t);
    else byCity.set(id, [t]);
  }

  // When the live city view answered, only its cities get a link, so
  // every /{city} on the home is a page that exists.
  const liveIds = new Set(live.map((c) => c.id));
  const ids = new Set<string>(liveIds.size > 0 ? [...byCity.keys()].filter((id) => liveIds.has(id)) : byCity.keys());
  const cities = [...ids]
    .map((id) => ({ id, label: cityInfo(id).label, list: byCity.get(id) ?? [] }))
    .filter((c) => c.list.length > 0)
    .sort((a, b) => b.list.length - a.list.length || curatedIndex(a.id) - curatedIndex(b.id));

  const heroCities: Record<string, HeroCity> = {};
  const strips: HomeStrip[] = [];
  const cityRows: HomeCityRow[] = [];
  const sportsByCity: Record<string, Record<string, number>> = {};

  cities.forEach((c, rank) => {
    const { id, label, list } = c;
    const n = list.length;
    const perSport: Record<string, number> = {};
    let sportsHere = 0;
    let football = 0;
    let boxCricket = 0;
    const bySport: HeroCity["bySport"] = [];
    for (const sp of SPORT_PAGES) {
      const count = list.filter((t) => turfPlaysSport(t.sports, sp)).length;
      if (count > 0) {
        sportsHere++;
        bySport.push({ slug: sp.slug, name: sp.name, n: count });
      }
      if (sp.slug === "football") football = count;
      if (sp.slug === "box-cricket") boxCricket = count;
      if (count >= MIN_TURFS_TO_INDEX) perSport[sp.slug] = count;
    }
    if (Object.keys(perSport).length) sportsByCity[id] = perSport;

    heroCities[id] = {
      label,
      n,
      sports: sportsHere,
      area: modeOf(list.map((t) => areaFor(t))),
      core: football > 0 && boxCricket > 0,
      bySport: bySport.sort((a, b) => b.n - a.n).slice(0, 8),
    };

    const qualified = list.filter(hasEnoughReviews);
    const curated = qualified.length >= 3;
    const pool = curated ? qualified : list;
    const trendingId = picks[id]?.turfId;
    // Every strip is serialised into the client payload, so only the
    // biggest cities ship six tiles; smaller or lower-ranked ones ship three.
    const tileCount = rank < FULL_STRIP_CITIES && n >= 20 ? 6 : 3;
    strips.push({
      id,
      label,
      n,
      curated,
      tiles: pool.filter((t) => t.id !== trendingId).slice(0, tileCount).map((t) => toTile(t)),
    });

    cityRows.push({ id, label, n, top: list.slice(0, 3).map((t) => ({ id: t.id, slug: t.slug, name: t.name })) });
  });

  // "Top-rated across India": walk the national ranking, at most two
  // turfs per city, reviewed turfs first, then any turf if six aren't found.
  const nationalTiles: HomeTile[] = [];
  {
    const perCity = new Map<string, number>();
    const taken = new Set<string>();
    const cityOf = (t: Turf) => t.city ?? guessCityFromAddress(t.address);
    const pass = (needReviews: boolean) => {
      for (const t of turfs) {
        if (nationalTiles.length >= 6) return;
        const id = cityOf(t);
        if (!id || !heroCities[id] || taken.has(t.id)) continue;
        if (needReviews && !hasEnoughReviews(t)) continue;
        if ((perCity.get(id) ?? 0) >= 2) continue;
        perCity.set(id, (perCity.get(id) ?? 0) + 1);
        taken.add(t.id);
        nationalTiles.push(toTile(t, heroCities[id].label));
      }
    };
    pass(true);
    pass(false);
  }

  const sports = SPORT_PAGES.map((sp) => ({
    slug: sp.slug,
    name: sp.name,
    count: turfs.filter((t) => turfPlaysSport(t.sports, sp)).length,
  }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  const hero: HomeHeroProps = {
    total: turfs.length,
    cityCount: cities.length,
    sportCount: sports.length,
    cities: heroCities,
    topCities: cities.slice(0, 8).map((c) => ({ id: c.id, label: c.label, n: c.list.length })),
  };

  // Games shaped per city on the server: the client only picks a key,
  // so a city's count and empty state come from all of its games, not
  // from whichever happen to be soonest nationally.
  const sortedGames = sortGamesByDateTime(games).map(toHomeGame);
  const gamesByCity: Record<string, HomeGame[]> = {};
  const openGamesByCity: Record<string, number> = {};
  for (const g of sortedGames) {
    if (!g.city) continue;
    openGamesByCity[g.city] = (openGamesByCity[g.city] ?? 0) + 1;
    const list = (gamesByCity[g.city] ??= []);
    if (list.length < GAMES_PER_CITY) list.push(g);
  }

  const posts: HomePost[] = getSortedPosts()
    .slice(0, 3)
    .map((p) => ({
      slug: p.slug,
      title: p.title,
      category: p.category,
      readMinutes: p.readMinutes,
      hero: p.heroImage
        ? { url: isGoogleHosted(p.heroImage.url) ? imageUrlForCard(p.heroImage.url) : p.heroImage.url, alt: p.heroImage.alt }
        : null,
    }));

  return {
    total: turfs.length,
    cityCount: cities.length,
    sportCount: sports.length,
    pins: turfs.filter((t) => t.lat != null && t.lng != null).length,
    hero,
    strips,
    nationalTiles,
    cityRows,
    sports,
    sportsByCity,
    spotlights: toSpotlights(picks, turfs),
    games: sortedGames.slice(0, GAMES_PER_CITY),
    gamesByCity,
    openGamesTotal: sortedGames.length,
    openGamesByCity,
    posts,
  };
}

/**
 * Everything the home page shows, shaped once per render from the cached
 * turf rows, live cities and home extras: generateMetadata and the page
 * share it through React cache(). No database read on a warm cache.
 *
 * This used to be its own unstable_cache entry (home-data-v3) around
 * getAllActiveTurfs(). Next skips the cache read for an unstable_cache
 * called inside another one (unstable-cache.js, isNestedUnstableCache),
 * so every refill of the home entry read the whole turf table from the
 * database, and a failed refill built it again uncached. On 20 Oct that
 * was two more full reads per purge per instance.
 */
export const getHomeData = cache(buildHomeData);

const API_MEMO_MS = 60_000;
let apiMemo: { at: number; data: HomeData } | null = null;
let apiPending: Promise<HomeData> | null = null;

/**
 * The same data for API routes (Ask chips and follow-ups), which run
 * outside a page render and so get no React cache(): kept in memory on
 * a warm instance for a minute. Pages must use getHomeData(): a page
 * rebuilt after a purge has to read the fresh rows, not this copy.
 */
export function getHomeDataShared(): Promise<HomeData> {
  if (apiMemo && Date.now() - apiMemo.at < API_MEMO_MS) return Promise.resolve(apiMemo.data);
  apiPending ??= buildHomeData()
    .then((data) => {
      apiMemo = { at: Date.now(), data };
      return data;
    })
    .catch((e) => {
      // A minute-old answer beats a failed one.
      if (!apiMemo) throw e;
      console.error("home data: refresh failed, serving the last copy", e);
      return apiMemo.data;
    })
    .finally(() => {
      apiPending = null;
    });
  return apiPending;
}
