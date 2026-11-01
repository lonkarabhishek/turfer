import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { getNearTurfs } from "@/lib/queries/turfCache";
import { enoughTrending, joinTrending, type TrendRow } from "@/lib/map/trending";

/**
 * GET /api/map/trending: /map's "Trending" view, the page fetches it only
 * when the visitor turns Trending on. The turfs most viewed in the last 24
 * hours (public.map_turf_trending: estimated from India day totals, each
 * turf above its own recent daily average, the top ten by rank; never a
 * count), each rank on its turf's map point and key, joined here to the
 * same turf list /api/map/turfs sends (lib/map/trending.ts joinTrending).
 * Fewer than five on the map is too few to call anything trending: the
 * answer is then empty, and the page says there are not enough views yet.
 *
 * The ranks come from the database at most once every 10 minutes (one
 * shared copy in Next's data cache), and the answer is the same for
 * everyone, so Vercel's CDN keeps it 10 minutes and serves it stale for 10
 * more while it asks again.
 *
 * Before 20261101_map_turf_heat.sql is applied the function is missing
 * (PGRST202): the answer is empty, kept 10 minutes, and nothing is kept in
 * the data cache, so Trending fills within minutes of the file going in.
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

const trendRows = unstable_cache(
  async (): Promise<TrendRow[]> => {
    const { data, error } = await createReadOnlyClient().rpc("map_turf_trending");
    // Thrown, so a missing function or a failed read is never kept.
    if (error) throw new TrendingUnavailable(error.code ?? "", error.message);
    return Array.isArray(data) ? (data as TrendRow[]) : [];
  },
  ["map-trending-v1"],
  { revalidate: 600 },
);

export async function GET() {
  let rows: TrendRow[];
  try {
    rows = await trendRows();
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    if (code === "PGRST202" || code === "42883") return NextResponse.json({ trending: [] }, { headers: HEADERS });
    console.error("map/trending: no ranks to answer with", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
  try {
    // Ten rows or so against the list in memory; the CDN answers nearly every request before it gets here.
    const body = JSON.stringify({ trending: enoughTrending(joinTrending(rows, await getNearTurfs())) });
    return new NextResponse(body, { headers: HEADERS });
  } catch (e) {
    console.error("map/trending: no turfs to join with", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
}
