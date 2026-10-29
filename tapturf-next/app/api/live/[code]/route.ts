import { NextResponse } from "next/server";
import { liveCodeGen, verifyLiveCode } from "@/lib/live/codes";
import { gateLiveWrite } from "@/lib/live/gate";
import { isLiveBoard, sanitizeLive } from "@/lib/live/match";
import { later } from "@/lib/account/route";
import {
  createLiveLimiter,
  getLive,
  liveHttpStatus,
  liveIpHash,
  liveLinkRunning,
  liveMatchToStore,
  liveResult,
  liveSigner,
  liveStarterKnown,
  liveTagsChecked,
  liveWriteClient,
  liveWriteKey,
  parsePutBody,
  parseStopBody,
  purgeLive,
  readLiveBody,
  recordLiveStarter,
  starterWanted,
  type LiveRow,
} from "@/lib/live/server";
import { LIVE_MAX_BODY_BYTES, type LiveError, type LiveGetResponse } from "@/lib/live/types";

// One live scorecard link (lib/live/types.ts has the whole flow).
//   GET    -> LiveGetResponse, what followers poll. Served by the CDN and
//             the data cache, so the database sees about one read per
//             write whatever the follower count.
//   PUT    { secret, match, rev } -> the scorer's latest match or board,
//             with the scorer's sign-in (lib/live/gate.ts says who may).
//   DELETE { secret } -> turn the link off. The secret alone, on purpose:
//             stopping only hides the match, only the browser that made
//             the link has the secret, and a scorer whose login lapsed
//             must still be able to take their match down.
// Write answers follow LiveError's table; none of them is cached.
//
// No `revalidate` or `dynamic` export on purpose: as a plain dynamic
// handler Next passes the Cache-Control below through untouched.

type Ctx = { params: Promise<{ code: string }> };

const limits = createLiveLimiter();
/** A stop body is {"secret": 64 hex}, under 100 bytes. */
const STOP_MAX_BYTES = 1_000;

const NO_STORE = { "Cache-Control": "no-store" };
// Vercel's CDN keeps a copy 2 s and serves it stale for 8 more while
// one request refreshes it (60 if the function fails); browsers keep
// nothing. revalidateTag clears the data cache only, so followers lag a
// write by up to this plus one poll.
const LIVE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=8, stale-if-error=60",
  "X-Robots-Tag": "noindex",
};
// Codes that fail the tag check never become valid: keep the 404 a day.
const NOT_FOUND_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=86400", "X-Robots-Tag": "noindex" };

function reply(r: "ok" | LiveError, extra: { rev?: number } = {}) {
  const body = r === "ok" ? { ok: true, ...extra } : { error: r, ...extra };
  return NextResponse.json(body, { status: liveHttpStatus(r), headers: NO_STORE });
}

export async function GET(_req: Request, { params }: Ctx) {
  const { code } = await params;
  const key = liveWriteKey();
  if (!key || !verifyLiveCode(code, key)) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NOT_FOUND_HEADERS });
  }
  let row: LiveRow | null;
  try {
    row = await getLive(code);
  } catch (e) {
    console.warn("live: read failed", code, e);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
  // sanitizeLive, never sanitizeMatch: read as cricket, a stored board would be served as an empty 0/0 scorecard.
  const body: LiveGetResponse = row
    ? { status: row.status, match: row.match == null ? null : sanitizeLive(row.match), rev: row.rev, updatedAt: row.updated_at }
    : { status: "waiting", match: null, rev: 0, updatedAt: null };
  return NextResponse.json(body, { headers: LIVE_HEADERS });
}

export async function PUT(req: Request, { params }: Ctx) {
  const key = liveWriteKey();
  if (!key) return reply("unavailable");
  const { code } = await params;
  const gen = liveCodeGen(code, key);
  if (!gen) return reply("gone");
  const ipHash = liveIpHash(req, key);
  // Before reading the body, so a looping client costs neither the
  // database nor the parse.
  const held = limits.write(code, ipHash);
  if (held) return reply(held);
  // Before the body too: a write without a sign-in reads nothing more (a verified one is cached, lib/live/gate.ts).
  const gate = await gateLiveWrite(await liveSigner(req), gen, Date.now(), { row: () => liveLinkRunning(code), starter: () => liveStarterKnown(code) });
  if ("refuse" in gate) return reply(gate.refuse);

  const read = await readLiveBody(req, LIVE_MAX_BODY_BYTES);
  if ("error" in read) return reply(read.error);
  const body = parsePutBody(read.body);
  if (!body) return reply("bad");
  // Rebuilt from a whitelist with names folded to their latest values,
  // so only what the engine makes is stored and served, and a renamed
  // player is not served under the old name, whichever client sent it.
  const store = liveMatchToStore(body.match);
  if ("error" in store) return reply(store.error);
  // Tags of people who turned tagging off are never stored; old usernames become current ones.
  const match = await liveTagsChecked(store.match);

  let data: unknown;
  try {
    const res = await liveWriteClient().rpc("live_match_put", {
      p_key: key,
      p_code: code,
      p_secret: body.secret,
      p_match: match,
      p_status: store.status,
      p_rev: body.rev,
      p_ip_hash: ipHash,
    });
    if (res.error) throw new Error(res.error.message);
    data = res.data;
  } catch (e) {
    console.warn("live: put failed", code, e);
    return reply("unavailable");
  }
  const out = (data && typeof data === "object" ? data : {}) as { r?: unknown; rev?: unknown };
  const r = liveResult(out.r);
  // unavailable here is a wrong write key or an answer we do not know;
  // busy is the site-wide cap on new links. Both are worth a look.
  if (r === "unavailable") console.warn("live: unexpected put result", code, data);
  if (r === "busy") console.warn("live: site-wide new link cap reached", code);
  const rev = Number.isSafeInteger(out.rev) ? (out.rev as number) : undefined;
  if (r === "ok") {
    purgeLive(code);
    // Who started the link, once, after the reply: a failure only leaves the admin's "Not recorded".
    const signer = gate.record;
    if (signer && starterWanted(code)) later(() => recordLiveStarter(code, signer, isLiveBoard(match) ? "board" : "cricket"));
    return reply("ok", { rev: rev ?? body.rev });
  }
  return reply(r, r === "stale" && rev !== undefined ? { rev } : {});
}

export async function DELETE(req: Request, { params }: Ctx) {
  const key = liveWriteKey();
  if (!key) return reply("unavailable");
  const { code } = await params;
  if (!verifyLiveCode(code, key)) return reply("gone");
  if (!limits.stop(liveIpHash(req, key))) return reply("slow");

  const read = await readLiveBody(req, STOP_MAX_BYTES);
  if ("error" in read) return reply(read.error);
  const body = parseStopBody(read.body);
  if (!body) return reply("bad");

  let data: unknown;
  try {
    const res = await liveWriteClient().rpc("live_match_stop", { p_key: key, p_code: code, p_secret: body.secret });
    if (res.error) throw new Error(res.error.message);
    data = res.data;
  } catch (e) {
    console.warn("live: stop failed", code, e);
    return reply("unavailable");
  }
  const r = liveResult(data);
  if (r === "unavailable") console.warn("live: unexpected stop result", code, data);
  if (r === "ok") purgeLive(code);
  return reply(r);
}
