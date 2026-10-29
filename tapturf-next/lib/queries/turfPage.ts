import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { transformTurf } from "@/lib/queries/turfs";
import { buildData, FIRST_LIFE_S, firstLifeOf, recorded } from "@/lib/build/data";
import {
  shapeGames,
  shapePlayAgain,
  shapeReviewAspects,
  shapeReviews,
  shapeReviewStats,
  shapeSuggestions,
  trendingFor,
  turfPagePayload,
} from "@/lib/turfPage/shape";
import type { Turf } from "@/types/turf";
import type { Game } from "@/types/game";
import type { ReviewSummary, ReviewWithUser } from "@/types/review";
import type { TurfSuggestion } from "@/lib/queries/suggestions";
import type { AspectCount, PlayAgainCounts } from "@/lib/reviews/types";

export interface TurfPageData {
  turf: Turf;
  /** An owner manages this turf on myTapturf (turf_claim_status). */
  claimed: boolean;
  /** turfs.owner_id, when set: that account's reports stay out of the JSON-LD (generateTurfJsonLd). Server only. */
  managerIds: string[];
  /** Set when this turf is its city's live Most Trending Turf. */
  trending: { city: string; tagline: string | null } | null;
  reviews: ReviewWithUser[];
  reviewStats: ReviewSummary;
  /** Per part of the turf: how TapTurf players rated it in the last 12 months ([] before any). */
  reviewAspects: AspectCount[];
  /** Would play again [no, maybe, yes], last 12 months; null from an older database. */
  playAgain: PlayAgainCounts | null;
  suggestions: TurfSuggestion[];
  /** Upcoming games here, soonest first; the list drops started ones. */
  games: Game[];
  /** When this was loaded: game dates read relative to it until hydration. */
  renderedAt: number;
}

/**
 * A turf page prerendered from the build-data step's files is kept 15, 20,
 * 25 or 30 minutes (by its key, lib/build/data.ts firstLifeOf) instead of a
 * day: its answer was read minutes before go-live, and the turf purges sent
 * meanwhile reached only the old deployment. An unstable_cache entry lowers
 * the page's revalidate to its own (as markStaleRender does), only in that
 * render: the page's refresh reads the database and keeps its day. Each
 * mark has a fixed name, so its key is the same in every bundle.
 */
const FIRST_LIFE = new Map(
  FIRST_LIFE_S.map((s) => {
    const mark = async () => true;
    mark.toString = () => `turf-page-first-life-${s}`;
    return [s, unstable_cache(mark, ["turf-page-first-life-v1", String(s)], { revalidate: s })] as const;
  }),
);

async function firstLife(key: string): Promise<void> {
  try {
    await FIRST_LIFE.get(firstLifeOf(key))?.();
  } catch {
    // Only shortens the page's first life; never fails it.
  }
}

/**
 * Everything a turf page shows, in one database call (public.turf_page).
 * Until the 20 Oct outage a render made 3 calls in a row (the row by
 * slug, turf_claim_status, trending_turfs) and every view made 4 to 7
 * more from the browser; now the page is cached for a day, purged by the
 * cache queue when anything on it changes, and a view reads nothing.
 *
 * React cache() shares one call between generateMetadata and the page:
 * the RPC is a POST, which Next's fetch memoisation does not dedupe.
 * `key` is the URL segment: a slug, or an old id link.
 *
 * Returns null only when no active turf matches (the page 404s). A
 * database error or a payload without a turf throws instead, so a
 * revalidation keeps the last good page and a first render shows the
 * error page, rather than caching a 404 for a day (turfPagePayload has
 * the rule, lib/turfPage/turfPage.test.ts pins it).
 *
 * While building, the answer the build-data step recorded for this key
 * (it lists only keys it has a turf for), checked by the same rule, and
 * the page is kept 15 to 30 minutes instead of a day (firstLife).
 */
export const loadTurfPage = cache(async (key: string): Promise<TurfPageData | null> => {
  const built = recorded(buildData("turf-pages")?.pages, key);
  const data = turfPagePayload(built !== undefined ? { data: built, error: null } : await createReadOnlyClient().rpc("turf_page", { p_key: key }), key);
  if (built !== undefined) await firstLife(key);
  if (!data) return null;

  const turf = transformTurf(data.turf);
  const ownerId = (data.turf as { owner_id?: unknown }).owner_id;
  return {
    turf,
    claimed: data.claimed === true,
    managerIds: typeof ownerId === "string" && ownerId ? [ownerId] : [],
    trending: trendingFor(data.trending, turf.city),
    reviews: shapeReviews(data.reviews),
    reviewStats: shapeReviewStats(data.review_stats),
    reviewAspects: shapeReviewAspects(data.review_aspects),
    playAgain: shapePlayAgain(data.review_stats),
    suggestions: shapeSuggestions(data.suggestions),
    games: shapeGames(data.games, turf),
    renderedAt: Date.now(),
  };
});
