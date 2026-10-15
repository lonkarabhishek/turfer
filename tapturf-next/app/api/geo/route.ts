import { NextResponse } from "next/server";
import { CITIES, nearestCity, type CityId } from "@/lib/city";

// GET /api/geo -> { city: "pune" | null }
// Vercel adds the visitor's approximate location to every request as
// headers, so this costs nothing: no permission prompt, no database,
// no third-party call. The city picker uses it to set a sensible
// default the first time someone lands, and the result is never cached.

const ALIASES: Record<string, CityId> = {
  bengaluru: "bangalore",
  gurugram: "gurgaon",
  aurangabad: "sambhajinagar",
  "chhatrapati sambhajinagar": "sambhajinagar",
  ahmednagar: "ahilyanagar",
  "navi mumbai": "mumbai",
  thane: "mumbai",
  "new delhi": "delhi",
  secunderabad: "hyderabad",
  nasik: "nashik",
};

export async function GET(req: Request) {
  const h = req.headers;
  const lat = Number(h.get("x-vercel-ip-latitude"));
  const lng = Number(h.get("x-vercel-ip-longitude"));
  let city: CityId | null = null;
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0) city = nearestCity(lat, lng);
  if (!city) {
    const raw = decodeURIComponent(h.get("x-vercel-ip-city") ?? "").trim().toLowerCase();
    if (raw) city = ALIASES[raw] ?? CITIES.find((c) => c.id === raw || c.label.toLowerCase() === raw)?.id ?? null;
  }
  return NextResponse.json({ city }, { headers: { "Cache-Control": "private, no-store" } });
}
