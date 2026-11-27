import { NextResponse } from "next/server";
import { verifyTournamentCode } from "@/lib/tournament/codes";
import { getTournamentActivity, tournamentKey } from "@/lib/tournament/server";
import { TOURNAMENT_CDN_FRESH_S, TOURNAMENT_CDN_STALE_S } from "@/lib/tournament/types";

// A tournament's whole log of changes (lib/tournament/activity.ts): asked
// for only when a follower taps "Show all" on a log longer than the newest
// few that ride in every poll of GET /api/tournament/<code>, and again
// only when that log has moved on. The same read the poll shares (the
// data cache, the tournament's own tag), kept by the CDN as the poll is.
//   GET -> { log, total }: every entry, oldest first.

type Ctx = { params: Promise<{ code: string }> };

const HEADERS = {
  "Cache-Control": `public, max-age=0, s-maxage=${TOURNAMENT_CDN_FRESH_S}, stale-while-revalidate=${TOURNAMENT_CDN_STALE_S}, stale-if-error=60`,
  "X-Robots-Tag": "noindex",
};
const BAD_CODE_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=86400", "X-Robots-Tag": "noindex" };
const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export async function GET(_req: Request, { params }: Ctx) {
  const { code } = await params;
  if (!verifyTournamentCode(code, tournamentKey())) return NextResponse.json({ error: "not_found" }, { status: 404, headers: BAD_CODE_HEADERS });
  const read = await getTournamentActivity(code);
  if (!read.known) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ log: read.log, total: read.log.length }, { headers: HEADERS });
}
