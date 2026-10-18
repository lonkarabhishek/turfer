import { createReadOnlyClient } from "@/lib/supabase/server";
import { CITY_IDS, type CityId } from "@/lib/city";
import type { Turf } from "@/types/turf";
import type { SpotlightTurf } from "@/components/turf/TrendingSpotlight";
import { summarisePrice } from "@/lib/utils/prices";
import { areaFor } from "@/lib/utils/area";

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
 * Never throws: a failed lookup just means no spotlight.
 */
export async function getTrendingPicks(): Promise<Partial<Record<CityId, TrendingPick>>> {
  try {
    const now = new Date().toISOString();
    const { data, error } = await createReadOnlyClient()
      .from("trending_turfs")
      .select("city, turf_id, tagline, starts_at, ends_at")
      .lte("starts_at", now)
      .gt("ends_at", now)
      .order("starts_at", { ascending: false });
    if (error || !data) return {};
    const out: Partial<Record<CityId, TrendingPick>> = {};
    for (const r of data as { city: CityId; turf_id: string; tagline: string | null; starts_at: string; ends_at: string }[]) {
      if (out[r.city]) continue;
      out[r.city] = { city: r.city, turfId: r.turf_id, tagline: r.tagline, startsAt: r.starts_at, endsAt: r.ends_at };
    }
    return out;
  } catch {
    return {};
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
      tagline: pick.tagline,
      name: t.name,
      place: areaFor(t) ?? t.address,
      rating: t.rating,
      reviews: t.total_reviews,
      photo: t.cover_image ?? t.images[0] ?? null,
      sports: t.sports,
      priceLabel: price.kind === "unknown" || price.kind === "reported_text" ? null : price.label,
    });
  }
  // Biggest city first (lib/city.ts order); a city not in that list goes last.
  const rank = new Map(CITY_IDS.map((id, i) => [id, i]));
  const last = CITY_IDS.length;
  return out.sort((a, b) => (rank.get(a.city) ?? last) - (rank.get(b.city) ?? last));
}
