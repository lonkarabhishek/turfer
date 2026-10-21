import { accountError, accountReply, caller } from "@/lib/account/route";
import { createAccountLimiter, searchPlayers } from "@/lib/account/server";

// GET ?q=<text> -> { players: [{ u, name, photo }] }: up to 8 TapTurf
// profiles to tag on a player, by username prefix or name. Only people
// who left "Let others find and tag me" on. Signed-in callers only.

const allow = createAccountLimiter(120);

export async function GET(req: Request) {
  const who = await caller(req, allow);
  if ("reply" in who) return who.reply;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length > 30) return accountError("bad");
  if (q.replace(/^@/, "").length < 2) return accountReply({ players: [] });
  const r = await searchPlayers(q);
  if ("unavailable" in r) return accountError("unavailable");
  return accountReply({ players: r.ok });
}
