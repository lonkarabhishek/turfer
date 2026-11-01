import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { getNearTurfs } from "@/lib/queries/turfCache";
import { joinHeat, type HeatRow } from "@/lib/map/heat";

/**
 * GET /api/map/heat: /map's "Popular" layer, the page fetches it only
 * when the visitor turns the layer on. Each popular turf's level (1 to 5,
 * public.map_turf_heat: its rank by turf page views over the last 30
 * days, among the active turfs with a few views or more; never a count)
 * on its map point and key, joined here to the same turf list
 * /api/map/turfs sends (lib/map/heat.ts joinHeat).
 *
 * The levels come from the database at most once an hour (one shared copy
 * in Next's data cache), and the answer is the same for everyone, so
 * Vercel's CDN keeps it an hour and serves it stale for a day while it
 * asks again.
 *
 * Before 20261101_map_turf_heat.sql is applied the function is missing
 * (PGRST202): the answer is no points, kept 10 minutes, and the page says
 * there is not enough data yet. Nothing empty is kept in the data cache,
 * so the layer fills within minutes of the file going in.
 */

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400",
  "X-Robots-Tag": "noindex",
};
const NOT_YET = {
  "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=600",
  "X-Robots-Tag": "noindex",
};

class HeatUnavailable extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const heatRows = unstable_cache(
  async (): Promise<HeatRow[]> => {
    const { data, error } = await createReadOnlyClient().rpc("map_turf_heat");
    // Thrown, so a missing function or a failed read is never kept.
    if (error) throw new HeatUnavailable(error.code ?? "", error.message);
    return Array.isArray(data) ? (data as HeatRow[]) : [];
  },
  ["map-heat-v1"],
  { revalidate: 3600 },
);

export async function GET() {
  let rows: HeatRow[];
  try {
    rows = await heatRows();
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    if (code === "PGRST202" || code === "42883") return NextResponse.json({ heat: [] }, { headers: NOT_YET });
    console.error("map/heat: no levels to answer with", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
  try {
    // A few hundred rows against the list in memory; the CDN answers nearly every request before it gets here.
    const body = JSON.stringify({ heat: joinHeat(rows, await getNearTurfs()) });
    return new NextResponse(body, { headers: HEADERS });
  } catch (e) {
    console.error("map/heat: no turfs to join with", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
}
