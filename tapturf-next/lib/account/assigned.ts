import { usernameProblem } from "./usernames";

/**
 * The username TapTurf gives an account (the site owner, 27 Nov 2026:
 * "please make picking username easy. Like assign user name already, let
 * them decide if they want to keep it. Also for people who dont have
 * usernames, assign them one"), and every word the person reads about it.
 *
 * The rule that must hold: nobody becomes findable, taggable or publicly
 * visible because TapTurf gave them a username. A given username waits
 * in private.username_assigned (20261128_usernames_assigned.sql), which
 * no public page reads; it becomes a username (public.usernames) only by
 * the person's own tap, Keep it or a saved change.
 *
 * The database makes the name (private.username_from_name,
 * private.username_assign). The same rules are here so they can be read
 * and tested; both are run against lib/account/assigned.cases.json
 * (npm run test:account, scripts/sql-tests/usernames_assigned.check.mjs).
 * Pure, relative imports only.
 */

/** A base is 16 characters at most, so a number of up to four digits still fits in 20. */
export const BASE_MAX = 16;
/** A name with no usable letters gets this word and a number: turfer1, turfer2, ... */
export const FALLBACK = "turfer";
/** Words in front of a name that are not the name. */
const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "shri", "smt"]);

const trimmed = (s: string) => s.replace(/^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g, "");

/**
 * The start of a username from the name on an account, or null when the
 * name gives none (then it is the fallback word and a number).
 *
 * Only the name is used. `emails` (every address the account holds) is
 * read for one thing: a name that is the part of one of them before the
 * @ (what a Google account without a name was given) is not a name, so
 * nothing is made from it. No digit of the name is kept, so no part of a
 * phone number can come through.
 *
 * Letters only: accents are folded (NFKD), capitals lowered, and spaces,
 * tabs and . _ , / & + ( ) - separate words; everything else (digits,
 * other scripts, emoji, apostrophes) is left out. Then first_last when
 * that fits in 16, else first and the last name's initial, else the
 * first word cut at 16. Too short (under 3) or refused by the username
 * rules (a reserved word): null.
 */
export function assignedBase(name: string | null | undefined, emails: readonly (string | null | undefined)[] = []): string | null {
  const raw = trimmed(name ?? "");
  if (raw.includes("@")) return null;
  if (raw !== "") {
    for (const e of emails) {
      if (e != null && raw.toLowerCase() === trimmed(e).split("@")[0].toLowerCase()) return null;
    }
  }
  const letters = raw
    .normalize("NFKD")
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
    .replace(/[\t\n\v\f\r._,/&+()-]/g, " ")
    .replace(/[^a-z ]/g, "")
    .replace(/^ +| +$/g, "");
  if (!letters) return null;
  const words = letters.split(/ +/);
  while (words.length > 1 && TITLES.has(words[0])) words.shift();
  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : null;
  const base =
    last === null
      ? first.slice(0, BASE_MAX)
      : first.length + 1 + last.length <= BASE_MAX
        ? `${first}_${last}`
        : first.length + 2 <= BASE_MAX
          ? `${first}_${last[0]}`
          : first.slice(0, BASE_MAX);
  if (base.length < 3 || usernameProblem(base)) return null;
  return base;
}

/** The nth name to try: asha_rao, asha_rao2, asha_rao3, ...; with no base turfer1, turfer2, ... */
export function assignedCandidate(base: string | null, n: number): string {
  if (base === null) return `${FALLBACK}${n}`;
  return n === 1 ? base : `${base}${n}`;
}

/**
 * The username an account is given: the first candidate nobody has, had
 * or is waiting to choose (`taken`).
 */
export function assignUsername(name: string | null | undefined, emails: readonly (string | null | undefined)[], taken: (username: string) => boolean): string | null {
  const base = assignedBase(name, emails);
  for (let n = 1; n <= 9999; n++) {
    const c = assignedCandidate(base, n);
    if (!taken(c)) return c;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The card: "Your username is @asha_rao"                              */
/* ------------------------------------------------------------------ */

/** Every word of the card, the profile's username field and the notice. */
export const ASSIGNED_WORDS = {
  title: (username: string) => `Your username is @${username}`,
  keep: "Keep it",
  change: "Change",
  /** The one plain line under the two buttons. */
  line: "Keeping it lets other players find and tag you, and gives you a public profile. You can turn that off any time in Profile.",
  notNow: "Not now",
  keeping: "Saving…",
  /** After Keep it. */
  keptTitle: (username: string) => `@${username} is yours`,
  kept: "Other players can now find and tag you, and your profile is public. Turn that off any time in Profile.",
  seeProfile: "See your public profile",
  /** Someone took the name between the offer and the tap: another one is offered. */
  moved: (username: string) => `Someone just took that one. Yours is now @${username}.`,
  offline: "Couldn't reach TapTurf. Check your connection and try again.",
  failed: "Couldn't save. Please try again.",
  signIn: "Your login ended. Please log in again.",
  /** Under the Profile section's username box while the username is still the given one. */
  fieldNote: "TapTurf gave you this one. It stays private until you keep it or change it.",
  /** Under the box once a different name is typed: saving it is the person's own choice. */
  fieldChanged: "Saving a new username makes your profile public. To keep it private, turn the switch below off first.",
  /** The Me card, where the username would be: it is shown to nobody else. */
  meLabel: (username: string) => `Your username @${username}, shown only to you until you keep it`,
} as const;

/** What a failed Keep says, by the route's error. */
export function keepError(error: string | null): string {
  if (error === "sign_in" || error === "new") return ASSIGNED_WORDS.signIn;
  if (error === "unavailable" || error === "slow") return ASSIGNED_WORDS.offline;
  return ASSIGNED_WORDS.failed;
}

/**
 * The one in-app notification each account that already existed gets
 * (written by 20261128_usernames_assigned.sql, never by the app). No
 * email, no SMS and no push to a phone go with it.
 */
export const ASSIGNED_NOTICE = {
  type: "username_assigned",
  title: "You have a TapTurf username",
  message: (username: string) => `Your TapTurf username is @${username}. Keep it or change it in Profile. It stays private until you say so.`,
  link: "/dashboard?tab=profile#username",
  linkLabel: "Open Profile",
} as const;

/* ------------------------------------------------------------------ */
/* Not now: hidden for 7 days on this device                           */
/* ------------------------------------------------------------------ */

/** localStorage: { [account id]: the time (ms) the card may show again }. Nothing else is kept. */
export const SNOOZE_KEY = "tapturf_username_card_v1";
export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const SNOOZE_KEPT = 20;

function readSnooze(raw: string | null): Record<string, number> {
  try {
    const v: unknown = JSON.parse(raw ?? "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, number> = {};
    for (const [k, t] of Object.entries(v as Record<string, unknown>)) if (typeof t === "number" && Number.isFinite(t)) out[k] = t;
    return out;
  } catch {
    return {};
  }
}

/** Whether "Not now" still hides the card for this account on this device. */
export function snoozed(raw: string | null, userId: string, now: number): boolean {
  const until = readSnooze(raw)[userId];
  // A clock set back never hides it for longer than the 7 days.
  return typeof until === "number" && now < until && until - now <= SNOOZE_MS;
}

/** What to store after "Not now": this account hidden until 7 days from now; ones that ran out are left out; 20 accounts at most. */
export function snoozeValue(raw: string | null, userId: string, now: number): string {
  const kept = Object.entries(readSnooze(raw))
    .filter(([k, until]) => k !== userId && now < until && until - now <= SNOOZE_MS)
    .sort((a, b) => a[1] - b[1])
    .slice(-(SNOOZE_KEPT - 1));
  return JSON.stringify(Object.fromEntries([...kept, [userId, now + SNOOZE_MS]]));
}
