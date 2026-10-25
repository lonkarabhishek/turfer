/**
 * What the account routes answer, shared by the routes and the browser.
 * Types only.
 *
 *   GET   /api/account/me                  -> MeResponse (no account is made)
 *   POST  /api/account/me   { name?, email? } -> MeResponse (makes one; logs a phone sign-in;
 *                                              email: the optional one at a phone sign-up)
 *   PATCH /api/account/me   { name?, username?, taggable?, email?, skipEmail? } -> MeResponse
 *                                              (email: a string saves it, null removes it;
 *                                               skipEmail: true answers the ask with No thanks)
 *   GET   /api/account/username?u=<name>   -> UsernameCheckResponse
 *   GET   /api/account/username?suggest=1  -> UsernameSuggestResponse
 *   GET   /api/players/search?q=<text>     -> PlayersSearchResponse
 *
 * Every route needs `Authorization: Bearer <token>`: the Firebase ID
 * token for a phone sign-in, the Supabase access token for Google.
 * 401 { error: "sign_in" } means that token is not a valid sign-in;
 * 503 { error: "unavailable" } means try again later, never signed out.
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
  | "email";

export type MeResponse = { profile: AccountProfile; created?: boolean; fresh?: boolean; error?: AccountError; emailError?: AccountError } | { error: AccountError };

export type UsernameCheckResponse = { ok: true; username: string } | { error: AccountError };
export type UsernameSuggestResponse = { username: string | null } | { error: AccountError };

/** A profile people can tag: no ids, phone or email. */
export type PlayerHit = { u: string; name: string; photo: string | null };
export type PlayersSearchResponse = { players: PlayerHit[] } | { error: AccountError };
