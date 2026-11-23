import { NextResponse } from "next/server";
import { liveSigner } from "@/lib/live/server";
import { myLiveLinks } from "@/lib/matches/server";
import type { MineLinksResponse } from "@/lib/matches/links";
import { PRIVATE_HEADERS } from "@/lib/account/server";

// GET /api/live/mine -> { list }: the live links the signed-in player started
// that still show a score, for the Me tab's Matches (Authorization: Bearer, as
// every account route; the server works out the account, the browser never
// names one). Each with its score line as the follower page says it. list
// null: they can't be read right now (before 20261124_live_mine.sql too).
// For that player alone: private, never stored by a cache.

export async function GET(req: Request) {
  const who = await liveSigner(req);
  if ("unavailable" in who) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  if (!("ok" in who)) return NextResponse.json({ error: "login" }, { status: 401, headers: PRIVATE_HEADERS });
  const body: MineLinksResponse = { list: await myLiveLinks(who.ok.userId) };
  return NextResponse.json(body, { headers: PRIVATE_HEADERS });
}
