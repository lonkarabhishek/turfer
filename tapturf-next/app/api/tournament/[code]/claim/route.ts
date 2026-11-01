import { NextResponse } from "next/server";
import { liveSigner, readLiveBody } from "@/lib/live/server";
import { PRIVATE_HEADERS } from "@/lib/account/server";
import { verifyTournamentCode } from "@/lib/tournament/codes";
import { claimTournament, tournamentKey } from "@/lib/tournament/server";
import { TOURNAMENT_SECRET_RE } from "@/lib/tournament/types";

// POST /api/tournament/<code>/claim { secret } with a sign-in (Authorization:
// Bearer) -> { kept, device }:
//   from the browser holding the tournament's secret, keep it with the
//   signed-in account (the first account stays);
//   from another device of the account it is kept with, take this
//   browser's new secret as that device's (device true), so it can manage it.
// error: login (401), forbidden (403: not this account's), other (409: kept
// with another account), gone (410), unavailable (503).

type Ctx = { params: Promise<{ code: string }> };

const STATUS: Record<string, number> = { login: 401, forbidden: 403, other: 409, gone: 410, bad: 400 };

export async function POST(req: Request, { params }: Ctx) {
  const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
  const { code } = await params;
  if (!verifyTournamentCode(code, tournamentKey())) return reply({ error: "gone" }, 410);
  const read = await readLiveBody(req, 1_000);
  const secret = "body" in read ? (read.body as { secret?: unknown } | null)?.secret : null;
  if (typeof secret !== "string" || !TOURNAMENT_SECRET_RE.test(secret)) return reply({ error: "bad" }, 400);
  const who = await liveSigner(req);
  if ("unavailable" in who) return reply({ error: "unavailable" }, 503);
  if (!("ok" in who)) return reply({ error: "login" }, 401);
  const c = await claimTournament(code, secret, who.ok.userId);
  if ("kept" in c) return reply({ kept: true, device: c.device, account: who.ok.userId });
  return reply({ error: c.error }, STATUS[c.error] ?? 503);
}
