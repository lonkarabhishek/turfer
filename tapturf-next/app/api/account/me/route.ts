import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { cityNote } from "@/lib/account/city";
import { accountError, accountReply, caller } from "@/lib/account/route";
import { cleanEmail } from "@/lib/account/emails";
import { createAccountLimiter, noteCity, readSmallJson, resolveAccount, setContactEmail, setUsername, updateName } from "@/lib/account/server";
import type { AccountError, AccountProfile } from "@/lib/account/types";

// The signed-in person's own account (lib/account/types.ts has the API).
// Phone and email are read, and users rows written, only here and only
// for the verified caller.

const allowRead = createAccountLimiter(60);
const allowWrite = createAccountLimiter(20);

/** After the reply: record the person's city for the admin view (lib/account/city.ts). Never touches the sign-in. */
function noteCityLater(req: Request, userId: string) {
  try {
    const note = cityNote((n) => req.headers.get(n));
    after(() => noteCity(userId, note));
  } catch (e) {
    console.warn("account: city note skipped", e);
  }
}

export async function GET(req: Request) {
  const who = await caller(req, allowRead);
  if ("reply" in who) return who.reply;
  const r = await resolveAccount(who.id);
  if ("unavailable" in r) return accountError("unavailable");
  if ("r" in r) return accountError(r.r);
  noteCityLater(req, r.ok.id);
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
  // On every sign-in, not only when created: Google accounts are made by a database trigger first,
  // so created is never true for them.
  noteCityLater(req, r.ok.id);
  let profile = r.ok;
  let emailError: AccountError | undefined;
  // The optional email on the sign-up step (phone only). It never fails the sign-in. Left
  // empty, nothing is kept: they are asked once more later.
  if (who.id.kind === "phone" && name !== null && typeof body.email === "string" && body.email.trim()) {
    const email = cleanEmail(body.email.slice(0, 300));
    if (!email) emailError = "email";
    else {
      const e = await setContactEmail(profile.id, "save", email, "signup");
      if ("ok" in e) profile = e.ok;
      else emailError = "unavailable" in e ? "unavailable" : e.r;
    }
    if (emailError) console.warn("account: sign-up email not saved", emailError);
  }
  // Google accounts are made by the auth trigger before this call: new means made in the last 15 minutes.
  const made = Date.parse(profile.created_at);
  const fresh = r.created || (Number.isFinite(made) && Date.now() - made >= -60_000 && Date.now() - made < 15 * 60_000);
  return accountReply({ profile, created: r.created, fresh, ...(emailError ? { emailError } : {}) });
}

/** Change the name, the optional email, the username and/or the "Let others find and tag me" switch. */
export async function PATCH(req: Request) {
  const who = await caller(req, allowWrite);
  if ("reply" in who) return who.reply;
  const body = await readSmallJson(req);
  if (!body) return accountError("bad");
  const name = body.name;
  const username = body.username;
  const taggable = body.taggable;
  // A string saves it, null removes it; skipEmail: true is "No thanks" on the ask.
  const email = body.email;
  const skipEmail = body.skipEmail;
  // Where an email save came from, for the admin view: the ask, or the profile.
  const emailSource = body.emailSource === "prompt" ? "prompt" : "profile";
  if (
    (name !== undefined && typeof name !== "string") ||
    (username !== undefined && typeof username !== "string") ||
    (taggable !== undefined && typeof taggable !== "boolean") ||
    (email !== undefined && email !== null && (typeof email !== "string" || email.length > 300)) ||
    (skipEmail !== undefined && skipEmail !== true) ||
    (email !== undefined && skipEmail !== undefined) ||
    (name === undefined && username === undefined && taggable === undefined && email === undefined && skipEmail === undefined)
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

  /** Name first, then the email, then username and the switch; stops at the first refusal. */
  async function applyPatch(): Promise<AccountError | null> {
    if (typeof name === "string" && name.trim() !== profile.name) {
      const r = await updateName(profile.id, name);
      if ("unavailable" in r) return "unavailable";
      if ("r" in r) return r.r;
      profile = r.ok;
    }
    if (email !== undefined || skipEmail === true) {
      let r;
      if (skipEmail === true) r = await setContactEmail(profile.id, "skip", null, "prompt");
      else if (email === null || (typeof email === "string" && !email.trim())) r = await setContactEmail(profile.id, "remove", null, "profile");
      else {
        const clean = cleanEmail(email as string);
        if (!clean) return "email";
        r = await setContactEmail(profile.id, "save", clean, emailSource);
      }
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
