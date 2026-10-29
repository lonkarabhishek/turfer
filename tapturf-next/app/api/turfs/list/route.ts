import { NextResponse } from "next/server";
import { pageOf, parseListParams } from "@/lib/turfList/query";
import { listInputs } from "@/lib/queries/turfList";
import { getSportBands, listWithSportBands } from "@/lib/queries/sportBands";

/**
 * GET /api/turfs/list?city&sport&q&sort&lat&lng&offset&limit[&v&t]: one
 * batch of the /turfs listing, as card rows plus the total, for "Show more"
 * and for a new search, sport or sort. Same rows and the same ranking as
 * the page's first cards (lib/turfList/query.ts), from the process's copy
 * of the list snapshot (lib/queries/turfs.ts getCardTurfs): a route handler
 * reads Next's data cache, so a cold instance loads the parts from there
 * and never reads the turfs table or calls turf_list_part per request.
 *
 * With a sport chip, each row also carries its venue's sport bands (a
 * day-cached read, lib/queries/sportBands.ts), so a card shows only that
 * sport's price.
 *
 * Every answer is public and the same for everyone with the same query
 * string, so Vercel's CDN keeps it 5 minutes (and serves it stale for 10
 * more while it asks again): a location is rounded to about a kilometre
 * before it gets here (and here again), so nearby answers are shared too,
 * and the location is used for this one sort and never stored. `v` and
 * `t` (the list version and the trending picks of the client's cards) split
 * that cache; the answer always comes from what this process has, named in
 * the body (lib/turfList/client.ts says what the client does when it
 * moves). When that is an older version than `v` or other picks than `t`
 * (right after a purge, this process's first data-cache read is still the
 * old one), the answer is not cached at all: kept under the URL's key, it
 * would serve old rows to every page of the new version for up to 15
 * minutes. Nothing here forces a fresh read, so a made-up `v` costs no
 * database read either.
 */

const HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  "X-Robots-Tag": "noindex",
};
// An older copy of the rows (the current version could not be read): kept a minute at most.
const STALE_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=60", "X-Robots-Tag": "noindex" };
const BAD_HEADERS = { "Cache-Control": "public, max-age=300, s-maxage=3600", "X-Robots-Tag": "noindex" };
// Older than the client's cards, or ranked with other picks: for this request only.
const BEHIND_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export async function GET(req: Request) {
  const parsed = parseListParams(new URL(req.url).searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: BAD_HEADERS });
  const { query, offset, limit } = parsed.req;
  const { seen } = parsed;
  try {
    const { v, stale, turfs, trending } = await listInputs(query.city);
    // A sport chip: each row carries its venue's sport bands, so the card shows
    // (and the price sorts use) only that sport's price (lib/utils/cardSport.ts).
    // Without a chip the rows, and the answer, are as before.
    const rows = query.sport ? listWithSportBands(turfs, await getSportBands()) : turfs;
    const page = pageOf(rows, query, trending, offset, limit, v);
    const behind = (seen.v != null && page.v < seen.v) || (seen.t != null && page.t !== seen.t);
    return NextResponse.json(page, { headers: behind ? BEHIND_HEADERS : stale ? STALE_HEADERS : HEADERS });
  } catch (e) {
    console.error("turfs/list: no rows to answer with", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } });
  }
}
