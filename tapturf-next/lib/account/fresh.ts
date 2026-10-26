import { createHash } from "node:crypto";

/**
 * How recent a sign-in must be before it may add, change or remove a way
 * into an account (Google on a phone account, a number on a Google
 * account). Server only. Relative imports only, so the unit test compiles
 * it on its own (npm run test:account).
 *
 *   phone   an OTP sign-in in the last 5 minutes, read from a verified
 *           Firebase token minted at that sign-in (not refreshed later)
 *   Google  a Google sign-in in the last 10 minutes: the `amr` oauth
 *           timestamp of a Supabase access token GoTrue accepted
 */

/** An OTP sign-in in the last 5 minutes. */
export const PHONE_FRESH_S = 300;
/** The token was minted at that sign-in, not refreshed later. */
export const MINT_SLACK_S = 60;
/** A Google sign-in in the last 10 minutes. */
export const GOOGLE_FRESH_S = 600;
/** Clocks may differ this much: a sign-in "in the future" by less is fine. */
const SKEW_S = 60;

/** Phone sign-ins are Indian numbers only: "+91" and exactly 10 digits. */
export const INDIAN_E164_RE = /^\+91\d{10}$/;

/** A fresh OTP sign-in: its number, Firebase user, sign-in time, and the key that makes it count once. */
export type FreshPhone = { phone: string; sub: string; authTime: number; proofKey: string };

/** What freshPhone reads: verified Firebase claims, or the same fields of a phone identity. */
export type PhoneClaims = {
  sub: string;
  phone_number?: string | null;
  sign_in_provider?: string | null;
  auth_time?: number | null;
  iat: number;
};

/** One OTP sign-in counts once, however many tokens it mints: sha256 hex of "<Firebase uid>:<auth_time>". */
export const proofKeyOf = (sub: string, authTime: number): string => createHash("sha256").update(`${sub}:${authTime}`).digest("hex");

/** A fresh OTP phone sign-in, from verified claims (a proof) or from the Bearer's phone identity; else null. */
export function freshPhone(c: PhoneClaims | null | undefined, nowS: number): FreshPhone | null {
  if (!c || typeof c.sub !== "string" || !c.sub) return null;
  if (c.sign_in_provider !== "phone") return null;
  const t = c.auth_time;
  if (typeof t !== "number" || !Number.isSafeInteger(t)) return null;
  const age = nowS - t;
  if (!(age >= -SKEW_S && age <= PHONE_FRESH_S)) return null;
  if (typeof c.iat !== "number" || !Number.isFinite(c.iat) || Math.abs(c.iat - t) > MINT_SLACK_S) return null;
  const phone = c.phone_number ?? "";
  if (!INDIAN_E164_RE.test(phone)) return null;
  return { phone, sub: c.sub, authTime: t, proofKey: proofKeyOf(c.sub, t) };
}

/** A Google sign-in in the last 10 minutes. */
export function freshGoogle(id: { oauthAt: number }, nowS: number): boolean {
  const age = nowS - id.oauthAt;
  return Number.isFinite(age) && age >= -SKEW_S && age <= GOOGLE_FRESH_S;
}

/**
 * When the person last signed in with Google, from a Supabase access
 * token's `amr` (`{ method: "oauth", timestamp }`); null when the session
 * did not come from a Google sign-in (an email and password one). Not a
 * check of the token: only for a token GoTrue just accepted or issued. A
 * refresh keeps the timestamp.
 */
export function oauthAmrAt(accessToken: string | null | undefined): number | null {
  if (!accessToken || accessToken.length > 8_000) return null;
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  let amr: unknown;
  try {
    amr = (JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>)?.amr;
  } catch {
    return null;
  }
  if (!Array.isArray(amr)) return null;
  let at: number | null = null;
  for (const e of amr) {
    if (!e || typeof e !== "object") continue;
    const { method, timestamp } = e as { method?: unknown; timestamp?: unknown };
    if (method === "oauth" && typeof timestamp === "number" && Number.isFinite(timestamp) && (at === null || timestamp > at)) at = timestamp;
  }
  return at;
}

/** Seconds since 1970, as the tokens count. */
export const nowSeconds = () => Math.floor(Date.now() / 1000);
