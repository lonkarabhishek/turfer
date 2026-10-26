import type { Person } from "./people";

/**
 * The admin's view of the second ways in (20261026_account_links.sql):
 * a Google account added to a phone account from the profile, a number a
 * Google account proved with an OTP, Google sign-ins that opened no
 * account, and what could not be added (for the owner to follow up by
 * hand: nothing is ever merged). Pure; relative imports only
 * (npm run test:trend).
 */

const time = (s: unknown): number | null => {
  if (typeof s !== "string" || !s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v: unknown): string | null => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);

/* ------------------------------------------------------------------ */
/* admin_sign_in_links                                                 */
/* ------------------------------------------------------------------ */

export type SignInLinkRow = {
  user_id: string;
  google_email: string | null;
  google_linked_at: string | null;
  google_links: number | null;
  google_removed_at: string | null;
  phone_added_at: string | null;
  phone_opens: boolean | null;
};

/** What an account added from its profile. */
export type SignInLinks = {
  /** The Google account added now, if any. */
  googleEmail: string | null;
  googleLinkedAt: number | null;
  /** How many Google accounts it has added, the current one included. */
  googleLinks: number;
  /** When it last took one off (Remove). */
  googleRemovedAt: number | null;
  /** When the number on it now was proved with an OTP from the profile (a Google account's). */
  phoneAddedAt: number | null;
  /** That number opens the account with an OTP. */
  phoneOpens: boolean;
};

export function linksById(rows: readonly SignInLinkRow[]): Map<string, SignInLinks> {
  const out = new Map<string, SignInLinks>();
  for (const r of rows) {
    const uid = id(r?.user_id);
    if (!uid) continue;
    out.set(uid, {
      googleEmail: str(r.google_email),
      googleLinkedAt: time(r.google_linked_at),
      googleLinks: typeof r.google_links === "number" && r.google_links > 0 ? r.google_links : 0,
      googleRemovedAt: time(r.google_removed_at),
      phoneAddedAt: time(r.phone_added_at),
      phoneOpens: r.phone_opens === true,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* admin_google_unfinished                                             */
/* ------------------------------------------------------------------ */

export type UnfinishedState = "not_finished" | "linking" | "link_failed" | "replaced";
const STATES: readonly UnfinishedState[] = ["not_finished", "linking", "link_failed", "replaced"];

export type UnfinishedRow = {
  auth_uid: string;
  email: string | null;
  name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  state: string | null;
};

export const UNFINISHED_LABEL: Record<UnfinishedState, string> = {
  not_finished: "Didn't come back to TapTurf",
  linking: "Being added to a phone account",
  link_failed: "Tried to add it to a phone account",
  replaced: "Taken off a phone account",
};

/** One Google sign-in that opens no TapTurf account (or a Google account made but never finished). */
export type Unfinished = {
  /** The auth uid, or the account id of a row the old trigger made. */
  id: string;
  /** In the people list (an account, or a not_finished sign-in counted there). */
  inPeople: boolean;
  name: string | null;
  email: string | null;
  at: number;
  state: UnfinishedState;
};

function unfinishedRows(rows: readonly UnfinishedRow[]): (UnfinishedRow & { uid: string; at: number; st: UnfinishedState })[] {
  return rows.flatMap((r) => {
    const uid = id(r?.auth_uid);
    const at = time(r?.created_at);
    const st = STATES.find((s) => s === r?.state);
    return uid && at !== null && st ? [{ ...r, uid, at, st }] : [];
  });
}

/**
 * Google sign-ins that never came back to TapTurf, as people for the
 * sign-ups chart and list. Until 20261026_account_links.sql the auth
 * trigger made an empty account for each of them; now none is made, so
 * these keep the series meaning what it did. Their id is the auth uid
 * (no account has it).
 */
export function googleOnlyPeople(rows: readonly UnfinishedRow[]): Person[] {
  return unfinishedRows(rows)
    .filter((r) => r.st === "not_finished")
    .map((r): Person => ({
      id: r.uid,
      name: str(r.name),
      email: str(r.email),
      phone: null,
      avatar: null,
      role: null,
      verified: false,
      confirmed: { email: null, phone: false },
      joinedAt: r.at,
      rowAddedAt: null,
      imported: false,
      updatedAt: null,
      method: "google",
      username: null,
      taggable: null,
      logins: 0,
      lastLogin: null,
      loginMethods: [],
      hosted: 0,
      requests: 0,
      accepted: 0,
      joined: 0,
      reviews: 0,
      taps: 0,
      contacted: [],
      asks: 0,
      recentAsks: [],
      suggestions: 0,
      claims: [],
      lastActive: null,
      before: null,
      city: null,
      likely: null,
      contact: null,
      signInUnfinished: true,
      emailFromGoogle: !!str(r.email),
      links: null,
      noAccount: true,
    }));
}

/**
 * The same not_finished Google sign-ins as rows for the admin headline's
 * people and sign-up counts (lib/queries/admin.ts getHeadline), so its
 * tiles and the sign-ups chart count the same sign-ups: each used to be a
 * users row the auth trigger made. id is the auth uid; created_at its ISO time.
 */
export function notFinishedSignupRows(rows: readonly UnfinishedRow[]): { id: string; email: string | null; phone: null; created_at: string }[] {
  return unfinishedRows(rows)
    .filter((r) => r.st === "not_finished")
    .map((r) => ({ id: r.uid, email: str(r.email)?.toLowerCase() ?? null, phone: null, created_at: new Date(r.at).toISOString() }));
}

/**
 * One list for "Google sign-ins that didn't finish": the people the old
 * trigger made an account for (and the not_finished sign-ins counted as
 * people), plus the Google sign-ins being added to, refused by or taken
 * off a phone account. Newest first.
 */
export function unfinishedList(people: readonly Person[], rows: readonly UnfinishedRow[]): Unfinished[] {
  const out: Unfinished[] = people
    .filter((p) => p.signInUnfinished)
    .map((p) => ({ id: p.id, inPeople: true, name: p.name, email: p.email, at: p.joinedAt, state: "not_finished" as const }));
  const byId = new Map(out.map((u) => [u.id, u]));
  for (const r of unfinishedRows(rows)) {
    const known = byId.get(r.uid);
    if (known) {
      // An account the old trigger made that a link was made over and that was taken off since:
      // listed once, as what it is now (taken off a phone account), still in the people list.
      if (r.st !== "not_finished") known.state = r.st;
      continue;
    }
    const u: Unfinished = { id: r.uid, inPeople: false, name: str(r.name), email: str(r.email), at: r.at, state: r.st };
    byId.set(r.uid, u);
    out.push(u);
  }
  return out.sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/* admin_link_refusals                                                 */
/* ------------------------------------------------------------------ */

export type RefusalRow = {
  at: string | null;
  kind: string | null;
  user_id: string | null;
  other_user_id: string | null;
  other_empty: boolean | null;
  other_made_at: string | null;
};

export type RefusalKind = "has_account" | "other_account" | "phone_held" | "over_empty";
const KINDS: Record<string, RefusalKind> = {
  link_has_account: "has_account",
  link_other_account: "other_account",
  phone_held: "phone_held",
  link_over_empty: "over_empty",
};

/** A Google account or number that couldn't be added (or a Google account added over its own empty account). */
export type Refusal = { at: number; kind: RefusalKind; userId: string | null; otherUserId: string | null; otherEmpty: boolean | null; otherMadeAt: number | null };

export function refusalsOf(rows: readonly RefusalRow[]): Refusal[] {
  return rows
    .flatMap((r): Refusal[] => {
      const at = time(r?.at);
      const kind = KINDS[r?.kind ?? ""];
      if (at === null || !kind) return [];
      return [{ at, kind, userId: id(r.user_id), otherUserId: id(r.other_user_id), otherEmpty: typeof r.other_empty === "boolean" ? r.other_empty : null, otherMadeAt: time(r.other_made_at) }];
    })
    .sort((a, b) => b.at - a.at);
}

/** What happened, after the person's name ("{name} tried to add ..."). day: an India-time date, e.g. "21 Oct 2026". */
export function refusalText(r: Refusal, day: (t: number) => string): string {
  const empty = r.otherEmpty ? ` (empty, made ${r.otherMadeAt !== null ? day(r.otherMadeAt) : "earlier"})` : "";
  switch (r.kind) {
    case "has_account":
      return `tried to add a Google account that has its own TapTurf account${empty}`;
    case "other_account":
      return "tried to add a Google account already on another account";
    case "phone_held":
      return `tried to add a number that's on another account${empty}`;
    case "over_empty":
      return `added a Google account that had its own empty TapTurf account${r.otherMadeAt !== null ? ` (made ${day(r.otherMadeAt)})` : ""}. That one stays as it is; Google opens this account now.`;
  }
}
