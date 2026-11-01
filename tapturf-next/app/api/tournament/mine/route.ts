import { NextResponse } from "next/server";
import { liveSigner } from "@/lib/live/server";
import { myTournaments } from "@/lib/tournament/server";
import { PRIVATE_HEADERS } from "@/lib/account/server";

// GET /api/tournament/mine -> { list }: the signed-in organiser's tournaments,
// for the Me tab (Authorization: Bearer, as every account route). list null:
// they can't be read right now (before 20261102_live_tournaments.sql too).

export async function GET(req: Request) {
  const who = await liveSigner(req);
  if ("unavailable" in who) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  if (!("ok" in who)) return NextResponse.json({ error: "login" }, { status: 401, headers: PRIVATE_HEADERS });
  return NextResponse.json({ list: await myTournaments(who.ok.userId) }, { headers: PRIVATE_HEADERS });
}
