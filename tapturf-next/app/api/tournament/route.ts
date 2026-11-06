import { NextResponse } from "next/server";
import { liveIpHash, liveSigner, readLiveBody } from "@/lib/live/server";
import { readCreate } from "@/lib/tournament/payload";
import { claimTournament, createTournament, createTournamentLimiter, purgeTournament, tournamentKey, tournamentsReady, tournamentStatus } from "@/lib/tournament/server";
import { gameTournamentCode } from "@/lib/tournament/codes";
import { isUuid } from "@/lib/games/payload";
import { canScoreGame } from "@/lib/turfSession/game.server";
import type { CreateResponse, CreateTaken } from "@/lib/tournament/types";

// Live tournaments (lib/tournament/types.ts has the flow).
//   GET  -> { ready }: whether they can be made here (the key is set and the
//           database has 20261102_live_tournaments.sql). The buttons that
//           make one ask first and say coming soon otherwise. CDN 60 s.
//   POST { secret, name, settings, teams, fixtures? } -> { code, rev, kept }:
//           a new tournament, its code minted here. No sign-in needed; with
//           one the server verifies, it is kept with that account (kept).
//           With game (a turf session started from /game/<id>): the
//           game's own code, only for its host or a player in it, signed
//           in, around its day (lib/turfSession/game.server.ts); 409
//           { error: "taken", code } when that game has one already.
// No `revalidate` or `dynamic` export: as plain dynamic handlers Next passes the Cache-Control below through.

const limits = createTournamentLimiter();
/** 300 fixtures with results are about 90 KB. */
const CREATE_MAX_BYTES = 150_000;
const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export async function GET() {
  const ready = await tournamentsReady();
  return NextResponse.json({ ready }, { headers: { "Cache-Control": `public, max-age=0, s-maxage=${ready ? 300 : 60}, stale-while-revalidate=60`, "X-Robots-Tag": "noindex" } });
}

export async function POST(req: Request) {
  const reply = (body: (CreateResponse | CreateTaken) & { kept?: boolean; field?: string }, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
  const key = tournamentKey();
  if (!key) return reply({ error: "unavailable" }, 503);
  const ip = liveIpHash(req, key);
  if (!limits.create(ip)) return reply({ error: "limit" }, 429);
  const read = await readLiveBody(req, CREATE_MAX_BYTES);
  if ("error" in read) return reply({ error: "bad", field: read.error === "too_big" ? "size" : "body" }, 400);
  const input = readCreate(read.body);
  if ("error" in input) return reply({ error: "bad", field: input.field }, 400);
  // A turf session started from a game: its own code (gameTournamentCode), for the game's host or a player in it, signed in.
  const game = (read.body as { game?: unknown } | null)?.game;
  let fixed: string | undefined;
  if (game !== undefined) {
    if (!isUuid(game)) return reply({ error: "bad", field: "game" }, 400);
    const signer = await liveSigner(req);
    if (!("ok" in signer)) return reply({ error: "unavailable" in signer ? "unavailable" : "login" }, "unavailable" in signer ? 503 : 401);
    const may = await canScoreGame(game.toLowerCase(), signer.ok.userId);
    if (may === "unavailable") return reply({ error: "unavailable" }, 503);
    if (may === "forbidden") return reply({ error: "forbidden", field: "game" }, 403);
    fixed = gameTournamentCode(game, key);
  }
  const made = await createTournament(input.ok, ip, fixed);
  if ("error" in made) return reply(fixed && made.error === "taken" ? { error: "taken", code: fixed } : made, tournamentStatus(made.error));
  // The game page may have read "none" for this code a moment ago: that copy goes.
  if (fixed) purgeTournament(fixed);
  // Signed in: kept with the account, so its other devices can manage it. A failure here only leaves it on this device.
  let kept = false;
  const who = await liveSigner(req);
  if ("ok" in who) {
    const c = await claimTournament(made.code, input.ok.secret, who.ok.userId);
    kept = "kept" in c;
  }
  return reply({ code: made.code, rev: 1, kept });
}
