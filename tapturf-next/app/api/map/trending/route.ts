import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { getNearTurfs } from "@/lib/queries/turfCache";
import { enoughTrending, joinTrending, readTrendingAuto, trendingRanks, type TrendRow, type TrendWindow } from "@/lib/map/trending";

/**
 * GET /api/map/trending: /map's "Trending" view, the page fetches it only
 * when the visitor turns Trending on. The turfs most viewed in the last 24
 * hours, 7 days or 30 days, the window picked by how many views the whole
 * site has (public.map_turf_trending_auto, 20261102_map_trending_window.sql:
 * 30 days while views are few, then 7, then 24 hours; never a count), each
 * rank on its turf's map point and key, joined here to the same turf list
 * /api/map/turfs sends (lib/map/trending.ts joinTrending), and the window,
 * for the page to say: { window: "24h" | "7d" | "30d", trending: [...] }.
 * Fewer than five on the map is too few to call anything trending: the
 * list is then empty, and the page says there are not enough views yet.
 *
 * The ranks come from the database at most once every 10 minutes (one
 * shared copy in Next's data cache), and the answer is the same for
 * everyone, so Vercel's CDN keeps it 10 minutes and serves it stale for 10
 * more while it asks again.
 *
 * Before 20261102_map_trending_window.sql is applied map_turf_trending_auto
 * is missing (PGRST202): that is never kept in the data cache, and the
 * ranks come from public.map_turf_trending (20261101_map_turf_heat.sql, 24
 * hours) as before, with the window "24h", kept as long as any answer, so
 * the window switches within minutes of the file going in. With neither
 * function the list is empty.
 */

/** The same lifetime for ranks and for "none yet": both are 10 minutes from changing. */
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=600",
  "X-Robots-Tag": "noindex",
};

class TrendingUnavailable extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

type Ranks = { window: TrendWindow; rows: TrendRow[] };

const autoRanks = unstable_cache(
  async (): Promise<Ranks> => {
    const { data, error } = await createReadOnlyClient().rpc("map_turf_trending_auto");
    // Thrown, so a missing function, a failed read or an answer of the wrong shape is never kept.
    if (error) throw new TrendingUnavailable(error.code ?? "", error.message);
    const ranks = readTrendingAuto(data);
    if (!ranks) throw new TrendingUnavailable("", "map_turf_trending_auto: not a window and turfs");
    return ranks;
  },
  ["map-trending-auto-v1"],
  { revalidate: 600 },
);

/** The 24-hour ranks, until map_turf_trending_auto is there. */
const dayRanks = unstable_cache(
  async (): Promise<TrendRow[]> => {
    const { data, error } = await createReadOnlyClient().rpc("map_turf_trending");
    if (error) throw new TrendingUnavailable(error.code ?? "", error.message);
    return Array.isArray(data) ? (data as TrendRow[]) : [];
  },
  ["map-trending-v1"],
  { revalidate: 600 },
);

export async function GET() {
  let ranks: Ranks;
  try {
    ranks = await trendingRanks(autoRanks, dayRanks);
  } catch (e) {
    console.error("map/trending: no ranks to answer with", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
  try {
    // Ten rows or so against the list in memory (none, no list needed); the CDN answers nearly every request before it gets here.
    const list = ranks.rows.length ? joinTrending(ranks.rows, await getNearTurfs()) : [];
    const body = JSON.stringify({ window: ranks.window, trending: enoughTrending(list) });
    return new NextResponse(body, { headers: HEADERS });
  } catch (e) {
    console.error("map/trending: no turfs to join with", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
}
