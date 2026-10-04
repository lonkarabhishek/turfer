import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { haversineKm } from "@/lib/utils/location";

// Nearest turfs to a point, for /turf-near-me. Sorting happens here so
// the page doesn't ship every turf to the phone. The location is used
// for this one calculation and never stored.

const allTurfs = unstable_cache(() => getAllActiveTurfs(), ["near-me-all-turfs"], { revalidate: 600 });

const MAX_LIMIT = 24;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  // Number("") is 0, so a missing param must not reach Number().
  const lat = Number(searchParams.get("lat") || NaN);
  const lng = Number(searchParams.get("lng") || NaN);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit")) || 12));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const me = { lat, lng };
  const ranked = (await allTurfs())
    .map((turf) => ({ turf, km: haversineKm(me, { lat: Number(turf.lat), lng: Number(turf.lng) }) }))
    .filter((r) => r.turf.lat != null && r.turf.lng != null && Number.isFinite(r.km))
    .sort((a, b) => a.km - b.km);

  return NextResponse.json(
    {
      turfs: ranked.slice(0, limit).map((r) => ({ ...r.turf, distanceKm: r.km })),
      within5: ranked.filter((r) => r.km <= 5).length,
      within10: ranked.filter((r) => r.km <= 10).length,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
