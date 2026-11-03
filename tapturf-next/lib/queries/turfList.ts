import { getCardTurfs } from "@/lib/queries/turfs";
import { getTrendingPicks, type TrendingPick } from "@/lib/queries/trending";
import { getListFactExtras, listFactsFrom } from "@/lib/queries/listFacts";
import type { CityId } from "@/lib/city";
import type { FactsLookup } from "@/lib/turfList/query";
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
 * database per request. With `facts` (the route), also each turf's filter
 * facts (lib/queries/listFacts.ts: the same rows, and an hourly cached
 * read of what they lack).
 */
export async function listInputs(
  city: string | null,
  opts: { facts?: boolean } = {},
): Promise<{ v: number; stale: boolean; turfs: readonly Turf[]; trending: Set<string>; facts: FactsLookup | null }> {
  const [cards, picks, extras] = await Promise.all([getCardTurfs(city), getTrendingPicks(), opts.facts ? getListFactExtras() : null]);
  const facts = opts.facts ? listFactsFrom(cards.rows, extras) : null;
  return { v: cards.v, stale: cards.stale, turfs: cards.turfs, trending: trendingFor(city, picks), facts };
}
