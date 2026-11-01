import { NextResponse } from "next/server";
import { liveIpHash, liveViewerHash, readLiveBody } from "@/lib/live/server";
import { createViewLimiter, isBotAgent, isPrefetch, parseViewBody, viewFromPage } from "@/lib/live/views";
import { verifyTournamentCode } from "@/lib/tournament/codes";
import { addTournamentView, readTournamentViews, tournamentKey } from "@/lib/tournament/server";

// Views of one live tournament's page, counted as a live scorecard's are
// (app/api/live/[code]/views/route.ts; lib/live/views.ts says what counts).
//   POST { unique, v } -> { counted, views, viewers }: from this site's own
//        page only; bots, prefetches, a repeat within seconds and anything
//        past the network's limits are not counted.
//   GET  -> { views, viewers }, cached 30 s.
// Nothing about the viewer is stored.

type Ctx = { params: Promise<{ code: string }> };

const limit = createViewLimiter();
const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const COUNT_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60", "X-Robots-Tag": "noindex" };
const NO_COUNT_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=10", "X-Robots-Tag": "noindex" };
const NOT_FOUND_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=86400", "X-Robots-Tag": "noindex" };

const notCounted = () => NextResponse.json({ counted: false, views: null }, { headers: NO_STORE });

export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params;
  const key = tournamentKey();
  if (!key || !verifyTournamentCode(code, key)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  if (isBotAgent(req.headers.get("user-agent")) || isPrefetch(req.headers) || !viewFromPage(req.headers, req.url)) return notCounted();
  const read = await readLiveBody(req, 200);
  const body = "body" in read ? parseViewBody(read.body) : null;
  if (!body) return NextResponse.json({ error: "bad" }, { status: 400, headers: NO_STORE });
  // Keyed apart from live scorecards' views, so the two never share a count.
  const take = limit(liveIpHash(req, key), liveViewerHash(req, key, body.tag), `t:${code}`, body.unique);
  if (!take.count) return take.why === "slow" ? NextResponse.json({ error: "slow" }, { status: 429, headers: NO_STORE }) : notCounted();
  const counted = await addTournamentView(code, take.unique);
  if (counted === null || counted === "none") return notCounted();
  return NextResponse.json({ counted: true, ...counted }, { headers: NO_STORE });
}

export async function GET(_req: Request, { params }: Ctx) {
  const { code } = await params;
  const key = tournamentKey();
  if (!key || !verifyTournamentCode(code, key)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NOT_FOUND_HEADERS });
  const counts = await readTournamentViews(code);
  return counts ? NextResponse.json(counts, { headers: COUNT_HEADERS }) : NextResponse.json({ views: null }, { headers: NO_COUNT_HEADERS });
}
