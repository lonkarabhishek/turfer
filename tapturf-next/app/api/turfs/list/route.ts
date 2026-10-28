import { NextResponse } from "next/server";
import { pageOf, parseListParams } from "@/lib/turfList/query";
import { listInputs } from "@/lib/queries/turfList";

/**
 * GET /api/turfs/list?city&sport&q&sort&lat&lng&offset&limit[&v]: one
 * batch of the /turfs listing, as card rows plus the total, for "Show more"
 * and for a new search, sport or sort. Same rows and the same ranking as
 * the page's first cards (lib/turfList/query.ts), from the process's copy
 * of the list snapshot (lib/queries/turfs.ts getCardTurfs): a route handler
 * reads Next's data cache, so a cold instance loads the parts from there
 * and never reads the turfs table or calls turf_list_part per request.
 *
 * Every answer is public and the same for everyone with the same query
 * string, so Vercel's CDN keeps it 5 minutes (and serves it stale for 10
 * more while it asks again): a location is rounded to about a kilometre
 * before it gets here (and here again), so nearby answers are shared too,
 * and the location is used for this one sort and never stored. `v` (the
 * version of the client's cards) only splits that cache by version; the
 * answer always comes from the version this process has, named in the
 * body (lib/turfList/client.ts says what the client does when it moves).
 */

const HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  "X-Robots-Tag": "noindex",
};
// An older copy of the rows (the current version could not be read): kept a minute at most.
const STALE_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=60", "X-Robots-Tag": "noindex" };
const BAD_HEADERS = { "Cache-Control": "public, max-age=300, s-maxage=3600", "X-Robots-Tag": "noindex" };

export async function GET(req: Request) {
  const parsed = parseListParams(new URL(req.url).searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: BAD_HEADERS });
  const { query, offset, limit } = parsed.req;
  try {
    const { v, stale, turfs, trending } = await listInputs(query.city);
    return NextResponse.json(pageOf(turfs, query, trending, offset, limit, v), { headers: stale ? STALE_HEADERS : HEADERS });
  } catch (e) {
    console.error("turfs/list: no rows to answer with", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } });
  }
}
