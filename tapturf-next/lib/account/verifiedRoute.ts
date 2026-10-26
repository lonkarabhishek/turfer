import { NextResponse } from "next/server";
import { parseVerifiedIds, tickedIds } from "./verified";

/**
 * GET /api/players/verified?ids=<uuid>,<uuid>,... (1 to 50, ascending, no
 * repeats) -> { verified: [<uuid>, ...] }: which of these accounts show
 * the verified tick (public.users_verified). Nothing else about anyone: no
 * names, no phone or email, never which half is missing. Public and the
 * same for everyone, so the CDN keeps each answer for a minute and a busy
 * game or turf page costs the database one small read, not one per
 * visitor. A failing read (or a database from before the tick) answers []
 * for a shorter while: no tick, never an error on the page. Relative
 * imports only (npm run test:verified).
 */

/** The database read: public.users_verified for these ids (PostgREST's answer shape). */
export type VerifiedRead = (ids: string[]) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;

export const VERIFIED_FRESH = "public, s-maxage=60, stale-while-revalidate=60";
export const VERIFIED_FAILED = "public, s-maxage=30, stale-while-revalidate=30";

export async function verifiedGet(req: Request, read: VerifiedRead, allow: (req: Request) => boolean): Promise<NextResponse> {
  if (!allow(req)) return NextResponse.json({ error: "slow" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  const ids = parseVerifiedIds(new URL(req.url).searchParams.get("ids"));
  if (!ids) return NextResponse.json({ error: "bad" }, { status: 400, headers: { "Cache-Control": "public, s-maxage=300" } });
  try {
    const { data, error } = await read(ids);
    if (error) {
      console.warn("players/verified: users_verified failed", error.code, error.message);
      return NextResponse.json({ verified: [] }, { headers: { "Cache-Control": VERIFIED_FAILED } });
    }
    // Only ids that were asked about, whatever the answer holds.
    const asked = new Set(ids);
    return NextResponse.json({ verified: tickedIds(data).filter((id) => asked.has(id)) }, { headers: { "Cache-Control": VERIFIED_FRESH } });
  } catch (e) {
    console.warn("players/verified: users_verified threw", e);
    return NextResponse.json({ verified: [] }, { headers: { "Cache-Control": VERIFIED_FAILED } });
  }
}
