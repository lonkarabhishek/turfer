import { NextResponse } from "next/server";
import { TURF_EVENTS_FRESH_S, turfEventsNow } from "@/lib/tournament/turfEvents.server";

/**
 * GET /api/turf-events (no query string): what is on at TapTurf's turfs
 * right now, all of India in one small list, the same for everyone:
 * { turfs: [{ turf, tournaments: [...] }] } (lib/tournament/turfEvents.ts;
 * public.turf_events_now, 20261128_turf_events.sql: live tournaments that
 * are on with a listed turf as their venue, 200 turfs and 3 tournaments a
 * turf at most, never who organises them). A turf's own page reads it in
 * the browser, once per tab in 5 minutes and only when the page is idle
 * (components/turf/useTurfEvents.ts), to say what is on there; the turf
 * page itself never reads it on the server.
 *
 * One shared copy: the list comes from the database at most once a minute
 * (Next's data cache) and Vercel's CDN keeps this answer a minute, serving
 * it two more while it asks again, so a turf page view is not a database
 * read and seldom a function call.
 *
 * Before the migration is applied the function is missing: the database
 * is asked again only after a minute per instance and the answer is an
 * empty list, kept as long as any answer, so every turf page looks as it
 * always did. A read that failed for another reason is a 503 nobody keeps;
 * the page shows nothing either way.
 */

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": `public, max-age=${TURF_EVENTS_FRESH_S}, s-maxage=${TURF_EVENTS_FRESH_S}, stale-while-revalidate=120`,
  "X-Robots-Tag": "noindex",
};

export async function GET() {
  try {
    return new NextResponse(JSON.stringify({ turfs: await turfEventsNow() }), { headers: HEADERS });
  } catch (e) {
    console.error("turf-events: no list to answer with", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30", "X-Robots-Tag": "noindex" } });
  }
}
