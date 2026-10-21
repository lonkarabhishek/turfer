/**
 * A TapTurf profile tagged on a player in the Live Cricket Scorer or the
 * Live Scoreboard. Only the username travels: no user id ever reaches a
 * browser or a live link. Usernames are never given to anyone else, so a
 * username (with the server's history of old names) is a stable key.
 * Pure, relative imports only: the engines and their tests compile it on
 * their own.
 */

export type Tag = { u: string };

/** Lowercase letters, digits and underscores, 3 to 20, starting with a letter. */
export const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;

export function isTag(x: unknown): x is Tag {
  return typeof x === "object" && x !== null && !Array.isArray(x) && typeof (x as { u?: unknown }).u === "string" && USERNAME_RE.test((x as { u: string }).u);
}

/** A clean tag (only `u` kept) or null. */
export function readTag(x: unknown): Tag | null {
  return isTag(x) ? { u: x.u } : null;
}

/** Same profile, or both untagged. */
export const sameTag = (a: Tag | null | undefined, b: Tag | null | undefined): boolean => (a?.u ?? null) === (b?.u ?? null);
