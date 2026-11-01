import { NextResponse } from "next/server";
import { verifyLiveCode } from "@/lib/live/codes";
import { liveIpHash, readLiveBody } from "@/lib/live/server";
import { verifyTournamentCode } from "@/lib/tournament/codes";
import { readOp } from "@/lib/tournament/payload";
import { createTournamentLimiter, tournamentKey, tournamentStatus, tournamentView, updateTournament } from "@/lib/tournament/server";
import type { PatchResponse } from "@/lib/tournament/types";

// One live tournament (lib/tournament/types.ts has the flow).
//   GET   -> TournamentGetResponse, what followers poll: the tournament and
//            the live scorecards of its fixtures scored live. Served by the
//            CDN and the data cache, so the database sees about one read
//            per change whatever the follower count.
//   PATCH { secret, op, ... } -> { ok, rev, view }: one change by the
//            organiser (lib/tournament/payload.ts readOp), and the
//            tournament as it is after it, so their page needs no second read.

type Ctx = { params: Promise<{ code: string }> };

const limits = createTournamentLimiter();
/** A change is a few hundred bytes; settings with a venue under 2 KB. */
const PATCH_MAX_BYTES = 20_000;
const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
// The CDN keeps a copy 3 s and serves it stale for 10 more while one request refreshes it; browsers keep nothing.
const VIEW_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=3, stale-while-revalidate=10, stale-if-error=60", "X-Robots-Tag": "noindex" };
// A code whose tag fails never becomes valid: a day. One that passes but has no tournament (its create failed): a minute.
const BAD_CODE_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=86400", "X-Robots-Tag": "noindex" };
const NONE_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=60", "X-Robots-Tag": "noindex" };

export async function GET(_req: Request, { params }: Ctx) {
  const { code } = await params;
  if (!verifyTournamentCode(code, tournamentKey())) return NextResponse.json({ error: "not_found" }, { status: 404, headers: BAD_CODE_HEADERS });
  try {
    const view = await tournamentView(code);
    if (!view) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NONE_HEADERS });
    return NextResponse.json(view, { headers: VIEW_HEADERS });
  } catch (e) {
    console.warn("tournament: read failed", code, e);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const reply = (body: PatchResponse) => NextResponse.json(body, { status: "error" in body ? tournamentStatus(body.error) : 200, headers: NO_STORE });
  const key = tournamentKey();
  if (!key) return reply({ error: "unavailable" });
  const { code } = await params;
  if (!verifyTournamentCode(code, key)) return reply({ error: "gone" });
  if (!limits.change(liveIpHash(req, key))) return reply({ error: "slow" });
  const read = await readLiveBody(req, PATCH_MAX_BYTES);
  if ("error" in read) return reply({ error: "bad", field: "body" });
  const parsed = readOp(read.body);
  if ("error" in parsed) return reply({ error: "bad", field: parsed.field });
  const { secret, op } = parsed.ok;
  // Only a live scorecard this server minted: a made-up code is refused here.
  if (op.op === "live_link" && !verifyLiveCode(op.liveCode, key)) return reply({ error: "bad", field: "liveCode" });
  const done = await updateTournament(code, secret, op);
  if ("error" in done) return reply(done);
  let view = null;
  try {
    view = await tournamentView(code);
  } catch (e) {
    console.warn("tournament: read after a change failed", code, e);
  }
  return reply({ ok: true, rev: done.rev, view });
}
