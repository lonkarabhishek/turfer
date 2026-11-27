import { revalidatePath } from "next/cache";
import type { NextResponse } from "next/server";
import { accountError, accountReply, caller } from "./route";
import { checkUsername, createAccountLimiter, ensureUsername, keepUsername, pickUsername, readSmallJson, resolveAccount } from "./server";
import { usernameCandidates, usernameProblem } from "./usernames";

// The username routes, for app/api/account/username (lib/account/types.ts has the answers):
//   GET  ?u=<name>   whether that username is free for the caller
//   GET  ?suggest=1  the username TapTurf gave the caller (assigned: true; given now if the account
//                    has none yet), or, on a database from before 20261128_usernames_assigned.sql,
//                    a free one made from the caller's name
//   POST { keep: true }  "Keep it": the given username becomes the caller's own, and public
// Always for the verified caller's own account, never one the browser names.
// Relative imports only (npm run test:account).

const allowRead = createAccountLimiter(120);
const allowWrite = createAccountLimiter(20);

export async function getUsername(req: Request): Promise<NextResponse> {
  const who = await caller(req, allowRead);
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
  // The name TapTurf gave this account and keeps for it. An account made after the migration is
  // given its name here, at its first signed-in request. It stays private: only "Keep it" or a
  // saved change makes a username of it.
  const mine = await ensureUsername(me.ok.id);
  // Not known right now: say so, so nobody is asked to pick a username while one is waiting for them.
  if ("unavailable" in mine) return accountError("unavailable");
  if ("assigned" in mine && mine.assigned) return accountReply({ username: mine.assigned, assigned: true });
  // A database from before the migration (or a name set aside by hand): a suggestion, as before.
  const r = await pickUsername(usernameCandidates(me.ok.name));
  if ("unavailable" in r) return accountError("unavailable");
  return accountReply({ username: r.ok });
}

/** POST { keep: true }: the caller keeps the username TapTurf gave them. Their own tap; nothing else makes it public. */
export async function postUsername(req: Request): Promise<NextResponse> {
  const who = await caller(req, allowWrite);
  if ("reply" in who) return who.reply;
  const body = await readSmallJson(req);
  if (!body || body.keep !== true || Object.keys(body).length !== 1) return accountError("bad");

  const me = await resolveAccount(who.id);
  if ("unavailable" in me) return accountError("unavailable");
  if ("r" in me) return accountError(me.r);
  // A second tap, or another device got there first: they have one, nothing to do.
  if (me.ok.username) return accountReply({ profile: me.ok });

  const r = await keepUsername(me.ok.id);
  if ("unavailable" in r) return accountError("unavailable");
  // Nothing is waiting for this account (or the database is from before the migration).
  if ("missing" in r || "r" in r) return accountError("bad");
  // Someone took it a moment ago: another one is waiting now, and nothing was made public.
  if ("moved" in r) return accountReply({ assigned: r.moved }, "taken");
  // The profile page at that address was "not found" until now, and is cached.
  if (r.ok.username) {
    try {
      revalidatePath(`/u/${r.ok.username}`);
    } catch (e) {
      console.warn("account: profile page refresh failed", e);
    }
  }
  return accountReply({ profile: r.ok });
}
