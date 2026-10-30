import { NextResponse } from "next/server";
import { getNearTurfs } from "@/lib/queries/turfCache";
import { getSportBands, withSportBands } from "@/lib/queries/sportBands";
import { haversineKm } from "@/lib/utils/location";
import { forCard } from "@/lib/utils/cardTurf";
import { sportBySlug, turfPlaysSport } from "@/lib/sports";
import { nearestAny, nearSportParam } from "@/lib/near/courtNearMe";
import { venueHostsSport } from "@/lib/utils/gameVenue";

// Nearest turfs to a point, for /turf-near-me. Sorting happens here so
// the page doesn't ship every turf to the phone. The location is used
// for this one calculation and never stored.
//
// ?sport=badminton|pickleball|tennis (the court near-me pages): only that
// sport's venues, each with its sport bands so the card shows that sport's
// price, plus nearestAny, the nearest venue of any sport, which the finder
// saves the city from (the city /turf-near-me would save). Without it the
// answer is exactly as before.
//
// ?plays=<any sport page slug> (a host moving a game, its edit sheet):
// only venues that can take a game of that sport (venueHostsSport: a
// cricket game, box or not, either name), nearest first, plain cards.

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
  const sport = nearSportParam(searchParams.get("sport"));
  if (sport === null) return NextResponse.json({ error: "unknown sport" }, { status: 400 });
  const playsParam = searchParams.get("plays");
  const plays = playsParam ? sportBySlug(playsParam) : undefined;
  if (playsParam && !plays) return NextResponse.json({ error: "unknown sport" }, { status: 400 });

  const me = { lat, lng };
  const ranked = (await getNearTurfs())
    .filter((turf) => !plays || venueHostsSport(turf.sports, plays))
    .map((turf) => ({ turf, km: haversineKm(me, { lat: Number(turf.lat), lng: Number(turf.lng) }) }))
    .filter((r) => r.turf.lat != null && r.turf.lng != null && Number.isFinite(r.km))
    .sort((a, b) => a.km - b.km);

  if (sport) {
    const courts = ranked.filter((r) => turfPlaysSport(r.turf.sports, sport));
    const bands = await getSportBands();
    return NextResponse.json(
      {
        turfs: courts.slice(0, limit).map((r) => ({ ...withSportBands(forCard(r.turf), bands), distanceKm: r.km })),
        within5: courts.filter((r) => r.km <= 5).length,
        within10: courts.filter((r) => r.km <= 10).length,
        nearestAny: nearestAny(ranked),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json(
    {
      turfs: ranked.slice(0, limit).map((r) => ({ ...forCard(r.turf), distanceKm: r.km })),
      within5: ranked.filter((r) => r.km <= 5).length,
      within10: ranked.filter((r) => r.km <= 10).length,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
