import { revalidatePath } from "next/cache";
import { accountError, accountReply, caller } from "@/lib/account/route";
import { createAccountLimiter, readSmallJson, resolveAccount, setUsername, updateName } from "@/lib/account/server";
import type { AccountError, AccountProfile } from "@/lib/account/types";

// The signed-in person's own account (lib/account/types.ts has the API).
// Phone and email are read, and users rows written, only here and only
// for the verified caller.

const allowRead = createAccountLimiter(60);
const allowWrite = createAccountLimiter(20);

export async function GET(req: Request) {
  const who = await caller(req, allowRead);
  if ("reply" in who) return who.reply;
  const r = await resolveAccount(who.id);
  if ("unavailable" in r) return accountError("unavailable");
  if ("r" in r) return accountError(r.r);
  return accountReply({ profile: r.ok });
}

/** Sign-in: the account for this sign-in, made if there is none. Logs a phone sign-in. */
export async function POST(req: Request) {
  const who = await caller(req, allowWrite);
  if ("reply" in who) return who.reply;
  const body = await readSmallJson(req);
  if (!body) return accountError("bad");
  const name = typeof body.name === "string" ? body.name : null;
  const r = await resolveAccount(who.id, { create: true, log: true, name });
  if ("unavailable" in r) return accountError("unavailable");
  if ("r" in r) return accountError(r.r);
  return accountReply({ profile: r.ok, created: r.created });
}

/** Change the name, username and/or the "Let others find and tag me" switch. */
export async function PATCH(req: Request) {
  const who = await caller(req, allowWrite);
  if ("reply" in who) return who.reply;
  const body = await readSmallJson(req);
  if (!body) return accountError("bad");
  const name = body.name;
  const username = body.username;
  const taggable = body.taggable;
  if (
    (name !== undefined && typeof name !== "string") ||
    (username !== undefined && typeof username !== "string") ||
    (taggable !== undefined && typeof taggable !== "boolean") ||
    (name === undefined && username === undefined && taggable === undefined)
  ) {
    return accountError("bad");
  }

  const me = await resolveAccount(who.id);
  if ("unavailable" in me) return accountError("unavailable");
  if ("r" in me) return accountError(me.r);
  let profile: AccountProfile = me.ok;
  const error = await applyPatch();
  // The public profile page is cached: refresh its old and new addresses
  // whenever what it shows (name, username, the switch) changed, even when
  // a later part of the edit failed.
  const before = me.ok;
  if (profile.name !== before.name || profile.username !== before.username || profile.taggable !== before.taggable) {
    for (const u of new Set([before.username, profile.username])) {
      if (!u) continue;
      try {
        revalidatePath(`/u/${u}`);
      } catch (e) {
        console.warn("account: profile page refresh failed", e);
      }
    }
  }
  return accountReply({ profile }, error ?? undefined);

  /** Name first, then username and the switch; stops at the first refusal. */
  async function applyPatch(): Promise<AccountError | null> {
    if (typeof name === "string" && name.trim() !== profile.name) {
      const r = await updateName(profile.id, name);
      if ("unavailable" in r) return "unavailable";
      if ("r" in r) return r.r;
      profile = r.ok;
    }
    if (typeof username === "string" || typeof taggable === "boolean") {
      const next = typeof username === "string" && username.toLowerCase() !== profile.username ? username : null;
      if (next !== null || (typeof taggable === "boolean" && taggable !== profile.taggable)) {
        // No username yet and only the switch: nothing to set it on.
        if (next === null && !profile.username) return "bad";
        const r = await setUsername(profile.id, next, typeof taggable === "boolean" ? taggable : null);
        if ("unavailable" in r) return "unavailable";
        if ("r" in r) return r.r;
        profile = r.ok;
      }
    }
    return null;
  }
}
