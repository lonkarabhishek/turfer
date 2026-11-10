import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { CITY_IDS, type CityId } from "@/lib/city";
import type { Turf } from "@/types/turf";
import type { SpotlightTurf } from "@/components/turf/TrendingSpotlight";
import { summarisePrice } from "@/lib/utils/prices";
import { areaFor } from "@/lib/utils/area";
import { turfPhotos } from "@/lib/utils/images";
import { livePicks, readTrendingRows } from "@/lib/build/reads";
import { buildData } from "@/lib/build/data";
import { markThinRender } from "@/lib/queries/turfs";
import { scopedRead } from "@/lib/queries/listScope";
import { cache } from "react";

/** The live "Most Trending Turf" pick for a city (server-side). */
export interface TrendingPick {
  city: CityId;
  turfId: string;
  tagline: string | null;
  startsAt: string;
  endsAt: string;
}

/**
 * Live picks for every city, keyed by city. A pick is live between
 * starts_at and ends_at; if windows overlap the latest start wins.
 * Throws on a failed read: for callers that cache the answer
 * (lib/home/data.ts), which must not store "no picks" for a failure.
 * While building, the picks the build-data step read, judged live at
 * this render, so a window that opened or closed since still counts.
 */
export async function readTrendingPicks(): Promise<Partial<Record<CityId, TrendingPick>>> {
  const now = new Date();
  let rows = buildData("trending");
  if (!rows) {
    const { data, error } = await readTrendingRows(createReadOnlyClient(), now);
    if (error || !data) throw new Error(`trending picks read failed: ${error?.message ?? "no data"}`);
    rows = data;
  }
  const out: Partial<Record<CityId, TrendingPick>> = {};
  for (const r of livePicks(rows, now)) {
    const city = r.city as CityId;
    out[city] = { city, turfId: r.turf_id, tagline: r.tagline, startsAt: r.starts_at, endsAt: r.ends_at };
  }
  return out;
}

/**
 * One shared copy for the pages that show a single city's pick: every
 * /<city> page and every /turfs variant (600 s windows both). Each used to
 * read trending_turfs on every render, one read per city page per window,
 * which grew with every city added (88 city pages and 89 /turfs variants
 * on 26 Oct); now it is one read per window. Tagged "turf-data" like the
 * home's copy (getHomeExtras in lib/home/data.ts), so a pick change or a
 * window opening or closing purges it through the cache queue (a
 * list:<city> key). Throws, so a failure is never stored. Never from turf
 * pages (a week long: this would lower their revalidate) or from inside
 * another unstable_cache (getHomeExtras reads readTrendingPicks directly).
 *
 * Only for readers that name no list scope. A scoped page (a city's pages,
 * the all-India ones, lib/queries/listScope.ts) reads the picks fresh, once
 * per render, and takes its scope's tag: its day-long timer stands, and
 * its own city's list key (queued when a pick changes or its window opens
 * or closes) or any list key for an all-India page marks it stale.
 */
const getTrendingPicksCached = unstable_cache(readTrendingPicks, ["trending-picks-v1"], {
  revalidate: 600,
  tags: ["turf-data"],
});
const freshPicks = cache(readTrendingPicks);

// The last picks this process read (page and route-handler bundles share them).
const kept = ((globalThis as typeof globalThis & { __tapturfTrendingKept?: { picks: Partial<Record<CityId, TrendingPick>> | null } }).__tapturfTrendingKept ??= { picks: null });

/** The kept picks whose window is open at `now`: a pick that ended since is never shown. */
function stillLive(picks: Partial<Record<CityId, TrendingPick>>, now: number): Partial<Record<CityId, TrendingPick>> {
  const out: Partial<Record<CityId, TrendingPick>> = {};
  for (const [city, p] of Object.entries(picks)) {
    if (p && Date.parse(p.startsAt) <= now && now < Date.parse(p.endsAt)) out[city as CityId] = p;
  }
  return out;
}

/**
 * The shared copy, but never throws. A failed lookup gives the last picks
 * this process read, those still live, else none (no spotlight); either
 * way the page is kept a minute only (markThinRender, not while
 * building), so a page without its spotlight is not kept its day
 * because of one slow read.
 */
export async function getTrendingPicks(): Promise<Partial<Record<CityId, TrendingPick>>> {
  try {
    const picks = await scopedRead(freshPicks, getTrendingPicksCached);
    kept.picks = picks;
    return picks;
  } catch {
    await markThinRender();
    return kept.picks ? stillLive(kept.picks, Date.now()) : {};
  }
}

/** The pick for one city, or null. */
export async function getTrendingPick(city: CityId): Promise<TrendingPick | null> {
  return (await getTrendingPicks())[city] ?? null;
}

/**
 * Build spotlight card data for the live picks, using turf rows the
 * page already loaded (no extra query). Picks whose turf isn't in
 * `turfs` (inactive, other city) are skipped.
 */
export function toSpotlights(
  picks: Partial<Record<CityId, TrendingPick>>,
  turfs: Turf[],
): SpotlightTurf[] {
  const byId = new Map(turfs.map((t) => [t.id, t]));
  const out: SpotlightTurf[] = [];
  for (const pick of Object.values(picks)) {
    if (!pick) continue;
    const t = byId.get(pick.turfId);
    if (!t) continue;
    const price = summarisePrice(t);
    out.push({
      city: pick.city,
      turfId: t.id,
      slug: t.slug,
      tagline: pick.tagline,
      name: t.name,
      place: areaFor(t) ?? t.address,
      rating: t.rating,
      reviews: t.total_reviews,
      // Our own copy first: Google photo links expire.
      photo: turfPhotos(t)[0] ?? null,
      sports: t.sports,
      priceLabel: price.kind === "unknown" || price.kind === "reported_text" ? null : price.label,
    });
  }
  // Biggest city first (lib/city.ts order); a city not in that list goes last.
  const rank = new Map(CITY_IDS.map((id, i) => [id, i]));
  const last = CITY_IDS.length;
  return out.sort((a, b) => (rank.get(a.city) ?? last) - (rank.get(b.city) ?? last));
}
