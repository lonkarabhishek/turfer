import { NextResponse } from "next/server";
import { getHomeData } from "@/lib/home/data";
import { askChipsFor } from "@/lib/home/select";

// GET /api/ask/chips?city=pune -> { chips: string[] }
// The Ask panel's opening suggestions for the visitor's city, built from
// the cached home snapshot (no extra queries). Unknown or missing city
// gets the all-India set, which names no place.
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("city");
  const city = raw && /^[a-z][a-z-]{1,30}$/.test(raw) ? raw : null;
  const chips = askChipsFor(await getHomeData(), city);
  return NextResponse.json(
    { chips },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=86400" } },
  );
}
