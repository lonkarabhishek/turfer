import { accountError, accountReply, caller } from "@/lib/account/route";
import { checkUsername, createAccountLimiter, pickUsername, resolveAccount } from "@/lib/account/server";
import { usernameCandidates, usernameProblem } from "@/lib/account/usernames";

// GET ?u=<name>   whether that username is free for the caller
// GET ?suggest=1  a free username made from the caller's name
// (lib/account/types.ts has the answers.)

const allow = createAccountLimiter(120);

export async function GET(req: Request) {
  const who = await caller(req, allow);
  if ("reply" in who) return who.reply;
  const params = new URL(req.url).searchParams;
  const u = params.get("u");

  // Rules first, from the same list as the database: no lookup for a name that cannot be used.
  if (u !== null) {
    const problem = usernameProblem(u);
    if (problem) return accountReply({}, problem);
  } else if (params.get("suggest") !== "1") {
    return accountError("bad");
  }

  const me = await resolveAccount(who.id);
  if ("unavailable" in me) return accountError("unavailable");
  if ("r" in me) return accountError(me.r);

  if (u !== null) {
    const r = await checkUsername(me.ok.id, u);
    if ("unavailable" in r) return accountError("unavailable");
    if ("r" in r) return accountReply({}, r.r);
    return accountReply({ ok: true, username: r.ok });
  }
  if (me.ok.username) return accountReply({ username: me.ok.username });
  const r = await pickUsername(usernameCandidates(me.ok.name));
  if ("unavailable" in r) return accountError("unavailable");
  return accountReply({ username: r.ok });
}
