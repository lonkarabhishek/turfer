import { NextResponse } from "next/server";
import { HIT_HEADERS, MISS_HEADERS, parsePartParams } from "@/lib/cache/partRoute";
import { TURF_LIST_DB, cachedListPart } from "@/lib/queries/turfs";

// GET /api/turf-list/<db>/<v>/<i> -> part i of the turf list's version v,
// as turf_list_part returns it ({ v, n, parts, rows }), from Next's data
// cache only. lib/cache/partRoute.ts has the why: a page Vercel
// regenerates cannot read the data cache, a route handler can, so a
// regeneration asks here before it asks the database.
//
// - A hit is the same bytes for that version forever (a version's parts
//   never change, and <db> names the database), so Vercel's CDN keeps it
//   a year: after the first answer, a burst of regenerations is served by
//   the CDN, and a function call here is a data cache read, not a query.
// - A miss (not cached yet, another version, another database) is a
//   no-store 404 marked X-Turf-List: miss, and the caller reads the
//   database itself. This route never reads the database: a public URL
//   must not be a way to make it send 1 MB parts.
//
// No `revalidate` or `dynamic` export on purpose: as a plain dynamic
// handler Next passes the Cache-Control below through untouched (as for
// /api/live/<code>).

type Ctx = { params: Promise<{ db: string; v: string; i: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const at = parsePartParams(await params, TURF_LIST_DB);
  const part = at ? await cachedListPart(at.v, at.i) : null;
  if (!part) return NextResponse.json({ error: "not_cached" }, { status: 404, headers: MISS_HEADERS });
  return new NextResponse(JSON.stringify(part), { headers: HIT_HEADERS });
}
