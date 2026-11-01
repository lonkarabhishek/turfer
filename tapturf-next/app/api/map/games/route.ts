import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getOpenGamesCached } from "@/lib/queries/games.server";
import { toMapGame, type MapGame } from "@/lib/map/data";

/**
 * GET /api/map/games: every open game whose turf has a location, soonest
 * first, for /map's game pins and cards. The same rows as /games
 * (getOpenGamesCached: cardGame rows, never the host's number), cut to
 * what GameCard shows (lib/map/data.ts toMapGame).
 *
 * One shared copy in Next's data cache, read again at most once a minute
 * (the /games pages' own window), so requests never read the database
 * themselves; Vercel's CDN keeps the answer a minute too. A game a host
 * just created shows on the map within about two minutes.
 */

const HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
  "X-Robots-Tag": "noindex",
};

const mapGames = unstable_cache(
  async (): Promise<MapGame[]> => {
    const { games } = await getOpenGamesCached();
    const out: MapGame[] = [];
    for (const g of games) {
      const m = toMapGame(g);
      if (m) out.push(m);
    }
    return out;
  },
  ["map-games-v1"],
  { revalidate: 60 },
);

export async function GET() {
  try {
    return NextResponse.json({ games: await mapGames() }, { headers: HEADERS });
  } catch (e) {
    console.error("map/games: no games to answer with", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } });
  }
}
