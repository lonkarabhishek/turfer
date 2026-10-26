/**
 * The verified tick: a person proved both a phone number (an OTP) and an
 * email (Google), and both are still theirs. The database decides it
 * (private.user_verified, 20261027_verified_tick.sql); the public sees
 * only the boolean. This file holds the pure rules the pages share: the
 * public read's ids, where the profile card and the asks may show, and
 * how often the phone ask comes back. Browser and server alike; relative
 * imports only (npm run test:verified).
 */

/** Ids per GET /api/players/verified (the database reads at most 100 per call). */
export const VERIFIED_BATCH = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A canonical account id (lowercase uuid), or null. */
export function accountId(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const id = x.trim().toLowerCase();
  return UUID.test(id) ? id : null;
}

/**
 * The ids of a public read (?ids=a,b,c): 1 to 50 lowercase uuids in
 * ascending order with no repeats, so one set of people has one address
 * (and one CDN copy). Null for anything else.
 */
export function parseVerifiedIds(raw: string | null): string[] | null {
  if (!raw || raw.length > VERIFIED_BATCH * 37) return null;
  const ids = raw.split(",");
  if (ids.length > VERIFIED_BATCH) return null;
  for (let i = 0; i < ids.length; i++) {
    if (!UUID.test(ids[i])) return null;
    if (i > 0 && ids[i - 1] >= ids[i]) return null;
  }
  return ids;
}

/** Ids as the reads ask for them: valid only, unique, sorted, in batches of 50. */
export function verifiedBatches(ids: Iterable<string>, size = VERIFIED_BATCH): string[][] {
  const all = [...new Set([...ids].map(accountId).filter((x): x is string => !!x))].sort();
  const out: string[][] = [];
  for (let i = 0; i < all.length; i += size) out.push(all.slice(i, i + size));
  return out;
}

/** The ticked ids in a database answer (uuid[]), lowercase; [] for anything else. */
export function tickedIds(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return data.map(accountId).filter((x): x is string => !!x);
}

/** What the profile card, the owner's line and the phone ask read from the signed-in person. */
export type TickUser = {
  /** null or missing: the database has no tick yet (before the migration): nothing is shown or asked. */
  verified?: boolean | null;
  phoneProven?: boolean;
  emailProven?: boolean;
  phone?: string;
  phoneConfirmed?: boolean;
  phoneSettable?: boolean;
  googleLinkable?: boolean;
  contactEmail?: string;
};

export type TickSteps = {
  /** done; add (no number) or confirm (a number not proved yet) with an OTP. */
  phone: "done" | "add" | "confirm";
  email: "done" | "add";
  /** The one step this sign-in can do here, or null. */
  action: "phone" | "email" | null;
  /** An email typed into an earlier TapTurf (not confirmed, never counts). */
  typedEmail: boolean;
};

/**
 * Where the person stands, and whether this sign-in can finish it here.
 * Null: no card, no line, no ask (the tick is there, the database can't
 * say, or the missing step can't be done from this sign-in, e.g. a
 * Google sign-in on a phone account through its link, or an email and
 * password account).
 *
 * The phone is done when the server says it is proved, or when this
 * device signed in with that number by OTP and it opens the account (the
 * server records that check just after it answers, so the first load
 * never asks a phone user to add the number they just used).
 * A phone sign-in can add Google (google_linkable); a Google sign-in on
 * its own account can add or confirm its number (phone_settable). The
 * card shows only when every missing step is one this sign-in can do, so
 * finishing it gives the tick.
 */
export function tickSteps(u: TickUser | null | undefined, signedInWith: "phone" | "google" | null): TickSteps | null {
  if (!u || u.verified !== false || !signedInWith) return null;
  const phoneDone = u.phoneProven === true || (signedInWith === "phone" && u.phoneConfirmed === true);
  const emailDone = u.emailProven === true;
  const phoneCan = !phoneDone && signedInWith === "google" && u.phoneSettable === true;
  const emailCan = !emailDone && signedInWith === "phone" && u.googleLinkable === true;
  if ((!phoneDone && !phoneCan) || (!emailDone && !emailCan) || (phoneDone && emailDone)) return null;
  return {
    phone: phoneDone ? "done" : u.phone ? "confirm" : "add",
    email: emailDone ? "done" : "add",
    action: phoneCan ? "phone" : emailCan ? "email" : null,
    typedEmail: !emailDone && !!u.contactEmail,
  };
}

/** Where the profile sends someone to do the missing step (the owner's line on /u). */
export function tickStepHref(action: "phone" | "email"): string {
  return action === "phone" ? "/dashboard?tab=profile&add=phone" : "/dashboard?tab=profile#verify";
}

/** The Google sign-in this long ago or less: the number form needs no second trip to Google. */
export const PHONE_ASK_FRESH_S = 300;

/**
 * The phone ask after a Google sign-in, for an account whose email is
 * proved and whose number is missing or not proved. Only in the first
 * 5 minutes after signing in with Google (oauthAgeS), when the OTP form
 * needs no second Google round trip.
 */
export function phoneAskFits(u: TickUser | null | undefined, signedInWith: "phone" | "google" | null, oauthAge: number | null): boolean {
  return tickSteps(u, signedInWith)?.action === "phone" && phoneAskFresh(oauthAge);
}

/** The Google sign-in is fresh enough for the phone ask (a clock a minute behind is fine). */
export function phoneAskFresh(oauthAge: number | null): boolean {
  return oauthAge !== null && oauthAge >= -60 && oauthAge < PHONE_ASK_FRESH_S;
}

/** This device's answers to the phone ask, per account: done, or put off (when, how many times). */
export type AskedRecord = "done" | { later: number; times: number };

const LATER_MS = 7 * 86_400_000;

/** Whether the ask must wait: answered, put off twice, or put off less than a week ago. */
export function askWaits(a: AskedRecord | undefined, now: number): boolean {
  if (!a) return false;
  if (a === "done") return true;
  return a.times >= 2 || now - a.later < LATER_MS;
}

/** The record after an answer: done (the main button), or later (Not now, a tap outside, Escape). */
export function askAnswered(prev: AskedRecord | undefined, how: "done" | "later", now: number): AskedRecord {
  if (how === "done") return "done";
  return { later: now, times: (prev && prev !== "done" ? prev.times : 0) + 1 };
}

/** A stored set of answers, or {} when it is missing or not well formed. */
export function readAskedRecords(raw: string | null): Record<string, AskedRecord> {
  try {
    const v = JSON.parse(raw ?? "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, AskedRecord> = {};
    for (const [k, a] of Object.entries(v as Record<string, unknown>)) {
      if (a === "done") out[k] = "done";
      else if (a && typeof a === "object" && typeof (a as { later?: unknown }).later === "number" && typeof (a as { times?: unknown }).times === "number") {
        out[k] = { later: (a as { later: number }).later, times: (a as { times: number }).times };
      }
    }
    return out;
  } catch {
    return {};
  }
}
