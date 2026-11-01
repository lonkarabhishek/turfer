import { NextResponse } from "next/server";
import { verifyLiveCode } from "@/lib/live/codes";
import { addLiveView, liveIpHash, liveViewerHash, liveWriteKey, readLiveBody, readLiveViews } from "@/lib/live/server";
import { createViewLimiter, isBotAgent, isPrefetch, parseViewBody, viewFromPage } from "@/lib/live/views";

// Views of one live scorecard (lib/live/views.ts says what counts).
//   POST { unique, v } -> count one view of /live/<code> from a follower's
//        browser (v: the view's random tag): { counted, views, viewers }.
//        Only JSON from this site's own page. Bots, prefetches, the same
//        view again within seconds and anything past the network's limits
//        are not counted (counted false, no counts). views null: not
//        counted right now (20261101_live_views.sql not applied, the
//        database down).
//   GET  -> { views, viewers } for the page and the scorer to show,
//        cached by the CDN and the data cache for 30 s: a count, not a
//        score, so it may lag.
// Neither is ever cached by the browser. Nothing about the viewer is
// stored: the per-instance limits key on hashes kept in memory only.

type Ctx = { params: Promise<{ code: string }> };

const limit = createViewLimiter();
/** A view body is {"unique":true}. */
const VIEW_MAX_BYTES = 200;

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const COUNT_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60", "X-Robots-Tag": "noindex" };
// Before the file is applied, or with the database down: try again soon, not every request.
const NO_COUNT_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=10", "X-Robots-Tag": "noindex" };
const NOT_FOUND_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=86400", "X-Robots-Tag": "noindex" };

const notCounted = () => NextResponse.json({ counted: false, views: null }, { headers: NO_STORE });

export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params;
  const key = liveWriteKey();
  if (!key || !verifyLiveCode(code, key)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  // The page counts only for a person in a browser, from this site's own page; say nothing more to anything else.
  if (isBotAgent(req.headers.get("user-agent")) || isPrefetch(req.headers) || !viewFromPage(req.headers, req.url)) return notCounted();
  const read = await readLiveBody(req, VIEW_MAX_BYTES);
  const body = "body" in read ? parseViewBody(read.body) : null;
  if (!body) return NextResponse.json({ error: "bad" }, { status: 400, headers: NO_STORE });
  const take = limit(liveIpHash(req, key), liveViewerHash(req, key, body.tag), code, body.unique);
  if (!take.count) return take.why === "slow" ? NextResponse.json({ error: "slow" }, { status: 429, headers: NO_STORE }) : notCounted();
  const counted = await addLiveView(code, take.unique);
  if (counted === null || counted === "none") return notCounted();
  return NextResponse.json({ counted: true, ...counted }, { headers: NO_STORE });
}

export async function GET(_req: Request, { params }: Ctx) {
  const { code } = await params;
  const key = liveWriteKey();
  if (!key || !verifyLiveCode(code, key)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NOT_FOUND_HEADERS });
  const counts = await readLiveViews(code);
  return counts ? NextResponse.json(counts, { headers: COUNT_HEADERS }) : NextResponse.json({ views: null }, { headers: NO_COUNT_HEADERS });
}
