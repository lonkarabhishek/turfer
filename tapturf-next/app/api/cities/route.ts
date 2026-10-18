import { NextResponse } from "next/server";
import { getLiveCities } from "@/lib/queries/cities";

// GET /api/cities -> [{ id, label, state, n }], biggest first.
// The city picker reads this so new cities appear without a deploy.

export async function GET() {
  const cities = await getLiveCities();
  return NextResponse.json(
    cities.map((c) => ({ id: c.id, label: c.label, state: c.state, n: c.n })),
    { headers: { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
