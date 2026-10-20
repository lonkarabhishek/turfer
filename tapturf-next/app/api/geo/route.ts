import { NextResponse } from "next/server";
import { detectCityFromHeaders } from "@/lib/cityRouting";

// GET /api/geo -> { city: "pune" | null }
// The city from Vercel's IP headers, without touching the cookie.
// proxy.ts detects the same way on the first document request (geo.<city>,
// an unconfirmed guess). The picker's "Detect my city again" calls this
// and then stores the answer as a confirmed pick with setCityPref, so a
// person who asked for detection is never sent back to the pick screen.
// Old bundles call it too.
export async function GET(req: Request) {
  return NextResponse.json(
    { city: detectCityFromHeaders((n) => req.headers.get(n)) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
