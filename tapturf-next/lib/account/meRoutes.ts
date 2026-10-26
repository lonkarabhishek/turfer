import { revalidatePath } from "next/cache";
import type { NextResponse } from "next/server";
import { cityNote } from "./city";
import type { Identity } from "./identity";
import { accountError, accountReply, caller, later } from "./route";
import { createAccountLimiter, noteCity, notePhoneChecked, readSmallJson, resolveAccount, setContactEmail, setUsername, updateName, type ResolveResult } from "./server";
import type { AccountError, AccountProfile } from "./types";

// The signed-in person's own account (lib/account/types.ts has the API),
// for app/api/account/me. Phone and email are read, and users rows
// written, only here and only for the verified caller. Relative imports
// only (npm run test:account).

const allowRead = createAccountLimiter(60);
const allowWrite = createAccountLimiter(20);

/** After the reply: record the person's city for the admin view (lib/account/city.ts). Never touches the sign-in. */
function noteCityLater(req: Request, userId: string) {
  try {
    const note = cityNote((n) => req.headers.get(n));
    later(() => noteCity(userId, note));
  } catch (e) {
    console.warn("account: city note skipped", e);
  }
}

/** After the reply: a phone token the server just verified is a checked number, for the admin's Verified line. */
function notePhoneLater(id: Identity, userId: string) {
  if (id.kind !== "phone") return;
  const phone = id.phone;
  later(() => notePhoneChecked(userId, phone));
}

/** A refusal; new and name also say whether the number opened another account lately. */
function refusal(r: Exclude<ResolveResult, { ok: AccountProfile } | { unavailable: true }>): NextResponse {
  return "wasUsed" in r ? accountReply({ wasUsed: r.wasUsed }, r.r) : accountError(r.r);
}

/** GET: the caller's account. Never makes one. */
export async function getMe(req: Request): Promise<NextResponse> {
  const who = await caller(req, allowRead);
  if ("reply" in who) return who.reply;
  const r = await resolveAccount(who.id);
  if ("unavailable" in r) return accountError("unavailable");
  if ("r" in r) return refusal(r);
  noteCityLater(req, r.ok.id);
  notePhoneLater(who.id, r.ok.id);
  return accountReply({ profile: r.ok });
}

/**
 * POST { name? }: sign-in, the account for this sign-in, made if there is
 * none. Logs a phone sign-in; a Google one is logged by the sign-in
 * callback, once per real Google sign-in, so app loads never count. An
 * `email` (sent by pages from before) is ignored: emails come from Google.
 */
export async function postMe(req: Request): Promise<NextResponse> {
  const who = await caller(req, allowWrite);
  if ("reply" in who) return who.reply;
  const body = await readSmallJson(req);
  if (!body) return accountError("bad");
  const name = typeof body.name === "string" ? body.name : null;
  const r = await resolveAccount(who.id, { create: true, log: who.id.kind === "phone", name });
  if ("unavailable" in r) return accountError("unavailable");
  if ("r" in r) return refusal(r);
  // On every sign-in, not only when created: a Google account is made by
  // the sign-in callback a moment before this call.
  noteCityLater(req, r.ok.id);
  notePhoneLater(who.id, r.ok.id);
  const profile = r.ok;
  // So new means made in the last 15 minutes.
  const made = Date.parse(profile.created_at);
  const fresh = r.created || (Number.isFinite(made) && Date.now() - made >= -60_000 && Date.now() - made < 15 * 60_000);
  return accountReply({ profile, created: r.created, fresh });
}

/**
 * PATCH: change the name, the username and/or the "Let others find and tag
 * me" switch; remove an email typed into an earlier TapTurf (email: null);
 * or answer the Google ask with No thanks (skipEmail: true). An email
 * string is 400 bad: an email is added only through Google.
 */
export async function patchMe(req: Request): Promise<NextResponse> {
  const who = await caller(req, allowWrite);
  if ("reply" in who) return who.reply;
  const body = await readSmallJson(req);
  if (!body) return accountError("bad");
  const name = body.name;
  const username = body.username;
  const taggable = body.taggable;
  const email = body.email;
  const skipEmail = body.skipEmail;
  if (
    (name !== undefined && typeof name !== "string") ||
    (username !== undefined && typeof username !== "string") ||
    (taggable !== undefined && typeof taggable !== "boolean") ||
    (email !== undefined && email !== null) ||
    (skipEmail !== undefined && skipEmail !== true) ||
    (email !== undefined && skipEmail !== undefined) ||
    (name === undefined && username === undefined && taggable === undefined && email === undefined && skipEmail === undefined)
  ) {
    return accountError("bad");
  }

  const me = await resolveAccount(who.id);
  if ("unavailable" in me) return accountError("unavailable");
  if ("r" in me) return refusal(me);
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

  /** Name first, then the typed email, then username and the switch; stops at the first refusal. */
  async function applyPatch(): Promise<AccountError | null> {
    if (typeof name === "string" && name.trim() !== profile.name) {
      const r = await updateName(profile.id, name);
      if ("unavailable" in r) return "unavailable";
      if ("r" in r) return r.r;
      profile = r.ok;
    }
    if (email === null || skipEmail === true) {
      const r = skipEmail === true ? await setContactEmail(profile.id, "skip", null, "prompt") : await setContactEmail(profile.id, "remove", null, "profile");
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
