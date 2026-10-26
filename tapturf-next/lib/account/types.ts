/**
 * What the account routes answer, shared by the routes and the browser.
 * Types only.
 *
 *   GET   /api/account/me                  -> MeResponse (no account is made)
 *   POST  /api/account/me   { name? }      -> MeResponse (makes one; logs a phone sign-in;
 *                                              a Google one is logged by the sign-in callback)
 *   PATCH /api/account/me   { name?, username?, taggable?, email: null?, skipEmail? } -> MeResponse
 *                                              (email: null removes a typed one, a string is 400 bad;
 *                                               skipEmail: true answers the ask with No thanks)
 *   GET   /api/account/username?u=<name>   -> UsernameCheckResponse
 *   GET   /api/account/username?suggest=1  -> UsernameSuggestResponse
 *   GET   /api/players/search?q=<text>     -> PlayersSearchResponse
 *
 * Adding Google to a phone account (Bearer: the phone sign-in's Firebase token):
 *   POST   /api/account/link/google           { then?, proof? } -> LinkStartResponse (+ the link cookie)
 *   POST   /api/account/link/google/leg       {}                -> LinkStartResponse (a new leg, + cookie)
 *   GET    /api/account/link/google                             -> LinkStatusResponse
 *   POST   /api/account/link/google/complete  {}                -> LinkCompleteResponse
 *   POST   /api/account/link/google/remove    { proof? }        -> ProfileResponse
 *   DELETE /api/account/link/google           (no Bearer; same-origin only) -> 204
 * Adding a number to a Google account (Bearer: the Supabase token of a Google sign-in in the last 10 minutes):
 *   POST   /api/account/phone                 { proof }         -> PhoneSetResponse
 *   DELETE /api/account/phone                                   -> ProfileResponse
 *
 * Every route but that DELETE needs `Authorization: Bearer <token>`: the
 * Firebase ID token for a phone sign-in, the Supabase access token for
 * Google (from a Google sign-in: an email and password session is refused).
 * 401 { error: "sign_in" } means that token is not a valid sign-in;
 * 503 { error: "unavailable" } means try again later, never signed out.
 * 403 { error: "reauth" } means the sign-in is not recent enough: a phone
 * OTP in the last 5 minutes (or a `proof`, the Firebase token of a fresh
 * OTP for the same number and Firebase user), or Google in the last 10.
 */

/** The signed-in person's own account, as only they see it. */
export type AccountProfile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  profile_image_url: string | null;
  created_at: string;
  username: string | null;
  taggable: boolean;
  /** The optional email a phone account typed (never users.email; not checked). */
  contact_email: string | null;
  /** A phone account with no email that has not answered the ask yet. */
  ask_email: boolean;
  /** May add an email at all: a phone account with no email, on a database that has the feature. */
  email_editable: boolean;
  /** The Google account added to this phone account from the profile, if any. */
  google_email: string | null;
  /** May add, change or remove a Google account (from a phone sign-in). */
  google_linkable: boolean;
  /** The number on the account opens it with an OTP. */
  phone_confirmed: boolean;
  /** Google is this account's own way in: it may add, confirm, change or remove the number. */
  phone_settable: boolean;
  /** Asked once to add Google (a phone account with no email that has not answered yet). */
  ask_google: boolean;
};

export type AccountError =
  | "sign_in"
  | "unavailable"
  | "slow"
  | "bad"
  /** No account for this sign-in yet (GET, PATCH). */
  | "new"
  /** A sign-up needs a name (POST). */
  | "name"
  /** This phone number is on a Google account it never signed in to. Reported for the owner. */
  | "conflict"
  | "reserved"
  | "taken"
  /** Three username changes in 30 days already (or five email saves in a day). */
  | "limit"
  /** Not an email address we accept. */
  | "email"
  /** This Google account is being added to a phone account right now (another device): no account here. */
  | "linking"
  /** This Google account was taken off a phone account: it opens no account until asked to make one. */
  | "replaced"
  /** Not for this account (e.g. it already has an email, or its number is how it logs in). */
  | "not_allowed"
  /** The Google account has a TapTurf account of its own that was used. */
  | "has_account"
  /** The Google account is already added to another TapTurf account. */
  | "other_account"
  /** Google did not confirm the email. */
  | "unverified"
  /** Not the same phone sign-in that started this. */
  | "mismatch"
  /** That took too long, or a newer try replaced it. */
  | "expired"
  /** That OTP was already used. */
  | "used"
  /** The OTP proof is not a valid, fresh one for this number. */
  | "proof"
  /** Sign in again first: a fresh OTP (phone) or Google in the last 10 minutes. */
  | "reauth"
  /** The OTP sign-in is too old (the database's check). */
  | "stale";

export type MeResponse =
  | { profile: AccountProfile; created?: boolean; fresh?: boolean; error?: AccountError }
  /** wasUsed (with new or name): this number opened another account lately. */
  | { error: AccountError; wasUsed?: boolean };

export type ProfileResponse = { profile: AccountProfile } | { error: AccountError };

/** A leg to start: send the browser to url. until with limit. */
export type LinkStartResponse = { url: string; expiresAt: string } | { error: AccountError; until?: string };

export type LinkState = "none" | "waiting" | "attached" | "refused" | "closed";

/**
 * Where an attempt to add Google stands, for the same phone sign-in only.
 *   attached  googleEmail can be confirmed; otherEmpty and otherMadeOn when that
 *             Google account has its own TapTurf account that was never used
 *             (it stays as it is; the Google sign-in opens this one from then on)
 *   refused   problem: has_account (otherEmpty, otherMadeOn), other_account, unverified, bad
 *   closed    outcome: linked (googleEmail), cancelled, expired, replaced, mismatch, ...
 */
export type LinkStatusResponse =
  | {
      state: LinkState;
      googleEmail?: string | null;
      problem?: string;
      otherEmpty?: boolean;
      otherMadeOn?: string;
      outcome?: string;
      expiresAt?: string;
      legsLeft?: number;
    }
  | { error: AccountError };

export type LinkCompleteResponse = { profile: AccountProfile } | { error: AccountError; otherEmpty?: boolean; otherMadeOn?: string };

/** taken: holderOpens (that number opens its account), holderEmpty, holderMadeOn. limit: until. */
export type PhoneSetResponse =
  | { profile: AccountProfile }
  | { error: AccountError; until?: string; holderOpens?: boolean; holderEmpty?: boolean; holderMadeOn?: string | null };

export type UsernameCheckResponse = { ok: true; username: string } | { error: AccountError };
export type UsernameSuggestResponse = { username: string | null } | { error: AccountError };

/** A profile people can tag: no ids, phone or email. */
export type PlayerHit = { u: string; name: string; photo: string | null };
export type PlayersSearchResponse = { players: PlayerHit[] } | { error: AccountError };
