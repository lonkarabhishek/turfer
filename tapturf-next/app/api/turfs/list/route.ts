import { NextResponse } from "next/server";
import { isFreeList, needsFree, needsTime, pageOf, parseListParams } from "@/lib/turfList/query";
import { istTime } from "@/lib/turfList/facts";
import { listInputs } from "@/lib/queries/turfList";
import { getSportBands, listWithSportBands } from "@/lib/queries/sportBands";
import { getFreeSlots } from "@/lib/queries/freeSlots";
import { freeCards } from "@/lib/availability/free";

/**
 * GET /api/turfs/list?city&ps&sport&q&f&price&surface&sort&lat&lng&ist&counts&offset&limit[&v&t]:
 * one batch of the /turfs listing (and of a city page's, `ps` for a
 * city+sport page), as card rows plus the total, for "Show more"
 * and for a new search, sport, sort or Filters choice. Same rows and the same ranking as
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
 *
 * Every batch is ranked with each turf's filter facts (the Filters sheet's
 * toggles, price cap and surface; lib/queries/listFacts.ts), and a first
 * batch asked with `counts=1` (the client asks only while the sheet is
 * open) carries the sheet's counts. "Open now" and its count are worked out
 * at `ist`, the client's India time rounded down to a quarter hour
 * (lib/turfList/facts.ts), so one CDN entry serves everyone in that quarter
 * and a list's later batches ask with its first batch's time; a batch with
 * neither "Open now" nor counts has no time in its URL, and its entry is
 * shared all day. A request that needs the time and does not send it gets
 * the server's, kept a minute at most.
 *
 * "Free hours marked" (f=free) and the sheet's counts (one of them is its
 * count) read the turfs whose owners' free hours show now from the one
 * cached reader (lib/queries/freeSlots.ts: all of India, a minute at a
 * time per instance); no other batch reads it. A free list's items carry
 * their next free times, worked out now, and the CDN keeps it a minute
 * (FREE_HEADERS), as the turf page's own free slots. When the free hours
 * can't be read, a free list is 503 (never "none marked" when we could
 * not tell), and the counts leave its number out.
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
// "Free hours marked" on: a minute, and a minute more stale (the availability routes' timers).
const FREE_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60", "X-Robots-Tag": "noindex" };

export async function GET(req: Request) {
  const parsed = parseListParams(new URL(req.url).searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: BAD_HEADERS });
  const { offset, limit, counts } = parsed.req;
  const { seen } = parsed;
  // The time "Open now" needs and the request did not name: the server's, and the answer kept a minute at most.
  const ownTime = !parsed.req.query.ist && needsTime(parsed.req.query, offset, counts);
  const query = ownTime ? { ...parsed.req.query, ist: istTime(new Date()) } : parsed.req.query;
  // A sport chip or a sport page: each row carries its venue's sport bands,
  // so the card shows (and the price sorts and cap use) only that sport's
  // price (lib/utils/cardSport.ts). Without one the rows are as before.
  // Read alongside the rows; it never throws.
  const bands = query.sport || query.pageSport ? getSportBands() : null;
  // Free hours, only for a free list or the counts: all of India's, read once a minute per instance.
  const freeList = isFreeList(query);
  const freeLoad = needsFree(query, offset, counts) ? getFreeSlots(null).catch(() => null) : null;
  try {
    const { v, stale, turfs, trending, facts } = await listInputs(query.city, { facts: true });
    const rows = bands ? listWithSportBands(turfs, await bands) : turfs;
    const freeRead = freeLoad ? await freeLoad : null;
    if (freeList && !freeRead) {
      return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } });
    }
    const now = Date.now();
    const free = freeRead ? freeCards(freeRead.rows, now) : null;
    const page = pageOf(rows, query, trending, offset, limit, v, facts, { counts, free, freeAt: new Date(now).toISOString() });
    const behind = (seen.v != null && page.v < seen.v) || (seen.t != null && page.t !== seen.t);
    return NextResponse.json(page, { headers: behind ? BEHIND_HEADERS : stale || ownTime ? STALE_HEADERS : freeList ? FREE_HEADERS : HEADERS });
  } catch (e) {
    console.error("turfs/list: no rows to answer with", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } });
  }
}
