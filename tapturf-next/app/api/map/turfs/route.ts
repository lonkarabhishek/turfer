import { NextResponse } from "next/server";
import { getNearTurfs } from "@/lib/queries/turfCache";
import { getSportBands, withSportBands, type SportBandMap } from "@/lib/queries/sportBands";
import { toMapTurf, type MapTurfWire } from "@/lib/map/data";
import type { Turf } from "@/types/turf";

/**
 * GET /api/map/turfs: every active turf with a location, for /map's pins
 * and cards (lib/map/data.ts says what each carries: public listing
 * fields only, never a phone, owner or contact field), top rated first.
 *
 * Read from what this process already holds: the card rows of the list
 * snapshot (getNearTurfs, a minute in memory over the shared row store)
 * and the day-cached sport bands (never throws). No database read per
 * request. The body is built once per copy of those rows and kept, so a
 * warm instance answers from memory. Every answer is the same for
 * everyone, so Vercel's CDN keeps it 15 minutes (a turf edit shows on the
 * map within about that) and serves it stale for an hour more while it
 * asks again; a browser keeps it 10 minutes.
 */

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=600, s-maxage=900, stale-while-revalidate=3600",
  "X-Robots-Tag": "noindex",
};

let memo: { turfs: readonly Turf[]; bands: SportBandMap | null; body: string } | null = null;

export async function GET() {
  try {
    const [turfs, bands] = await Promise.all([getNearTurfs(), getSportBands()]);
    if (memo?.turfs !== turfs || memo.bands !== bands) {
      const rows: MapTurfWire[] = [];
      for (const t of turfs) {
        const w = toMapTurf(withSportBands(t, bands));
        if (w) rows.push(w);
      }
      memo = { turfs, bands, body: JSON.stringify({ turfs: rows }) };
    }
    return new NextResponse(memo.body, { headers: HEADERS });
  } catch (e) {
    console.error("map/turfs: no rows to answer with", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } });
  }
}
