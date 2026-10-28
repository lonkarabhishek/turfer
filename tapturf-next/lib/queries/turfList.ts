import { getCardTurfs } from "@/lib/queries/turfs";
import { getTrendingPicks, type TrendingPick } from "@/lib/queries/trending";
import type { CityId } from "@/lib/city";
import type { Turf } from "@/types/turf";

/** The week's trending picks that lead the default sort: the city's own, or every city's on all of India. */
export function trendingFor(city: string | null, picks: Partial<Record<CityId, TrendingPick>>): Set<string> {
  if (city) {
    const pick = picks[city];
    return new Set(pick ? [pick.turfId] : []);
  }
  return new Set(Object.values(picks).flatMap((p) => (p ? [p.turfId] : [])));
}

/**
 * What the /turfs listing ranks (lib/turfList/query.ts rankTurfs): the
 * card rows in scope, the trending picks, and the version they came from.
 * The page's first cards and every GET /api/turfs/list batch come from
 * here. Reads only the process's copy of the list snapshot and the cached
 * picks (both in Next's data cache for a route handler), never the
 * database per request.
 */
export async function listInputs(city: string | null): Promise<{ v: number; stale: boolean; turfs: readonly Turf[]; trending: Set<string> }> {
  const [cards, picks] = await Promise.all([getCardTurfs(city), getTrendingPicks()]);
  return { v: cards.v, stale: cards.stale, turfs: cards.turfs, trending: trendingFor(city, picks) };
}
