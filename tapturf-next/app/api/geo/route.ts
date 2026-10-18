import { NextResponse } from "next/server";
import { detectCityFromHeaders } from "@/lib/cityRouting";

// GET /api/geo -> { city: "pune" | null }
// Kept for tabs still running an old bundle. proxy.ts now detects the
// city from the same Vercel headers on the first document request and
// stores it in the tt_city cookie, so nothing new calls this.
export async function GET(req: Request) {
  return NextResponse.json(
    { city: detectCityFromHeaders((n) => req.headers.get(n)) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
