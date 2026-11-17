import { asciiDigits, venueText } from "./otherVenue";

/**
 * Already confirmed: the friends a host says are in before the game goes
 * up (the site owner, 17 Nov 2026: "give me an option to prefill people
 * who has confirmed", then "Should be able to tag them"). Three kinds,
 * all of which take a spot at once, because the host vouches for them:
 *   names   what the host typed about a friend ("Rahul"): shown on the
 *           game page only, never an account;
 *   extra   people without a name ("+2 more");
 *   tags    TapTurf players the host picked. Since 20261118_game_tags_shown.sql
 *           (the site owner, 18 Nov 2026) the page lists a tagged player
 *           at once, by name and photo, as "added by <host>" (only people
 *           with "Let others find and tag me" on can be tagged; one who
 *           turns it off later is counted, not named). "I'm in" makes
 *           them a player like any other; "Remove me" (before the start)
 *           or the host's untag frees the spot; an unanswered tag stays
 *           on the lineup through kickoff, never a player, and afterwards
 *           they can say on their Passport whether they played
 *           (lib/games/played.ts). Before that file, and for a tag made
 *           before it: hidden until "Yes, I'm in", ended at kickoff.
 * games.current_players is the host and the joined players plus all three
 * (20261117_game_confirmed.sql recounts it), so every card, list and count
 * that reads it agrees. The rules here are the database's
 * (private.game_confirmed_name_ok, private.game_confirmed_problem), run
 * against lib/games/confirmed.cases.json by npm run test:games and
 * scripts/sql-tests/game_confirmed.check.mjs. Pure; relative imports only.
 */

export const NAME_MAX = 20;
export const NAMES_MAX = 20;
export const EXTRA_MAX = 30;
export const TAGS_MAX = 20;
/** Tag notifications one host can send in a day (private.game_tag_day_max). */
export const TAGS_PER_DAY = 50;

export const CONFIRMED_KEYS = ["confirmed_names", "confirmed_extra", "confirmed_tags", "confirmed_untag"] as const;
export type ConfirmedKey = (typeof CONFIRMED_KEYS)[number];

// Letters of Latin, Arabic (Urdu) and India's scripts with their marks, the two joiners those scripts need,
// spaces, a dot, a hyphen and an apostrophe (straight or curly). No digit of any script, nothing else.
const NAME_CHARS = /^[A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u024f\u0600-\u06ff\u0900-\u0963\u0966-\u0d7f\u200c\u200d .'\u2019-]+$/;
const NAME_LETTER = /[^ .'\u2019-]/;
// "amit.in", "www.x": a link, not a name ("S.Kumar" and "A.K. Rao" are names).
const NAME_LINK = /(www\.|\.(com|net|org|io|app|gl|ly|me|info|xyz|online|site|page|link|biz|in)(?![a-z]))/i;

export type NameProblem = "missing" | "long" | "digits" | "link" | "chars";

/** What is wrong with a name as typed, or null: 1 to 20 characters once spaces are collapsed, letters, spaces and . - ' only. */
export function nameProblem(raw: unknown): NameProblem | null {
  if (typeof raw !== "string") return "missing";
  const x = venueText(raw);
  if (!x) return "missing";
  if ([...x].length > NAME_MAX) return "long";
  if (/[0-9]/.test(asciiDigits(x))) return "digits";
  if (NAME_LINK.test(x)) return "link";
  if (!NAME_CHARS.test(x) || !NAME_LETTER.test(x)) return "chars";
  return null;
}

/** The name as it is stored (spaces collapsed, trimmed), or null when it is not one. */
export function confirmedName(raw: unknown): string | null {
  return nameProblem(raw) === null ? venueText(raw as string) : null;
}

export function nameProblemText(p: NameProblem): string {
  switch (p) {
    case "missing":
      return "Type a first name or nickname.";
    case "long":
      return `Keep it to ${NAME_MAX} characters: a first name or nickname is enough.`;
    case "digits":
      return "No numbers here: the game page is public. A first name or nickname is enough.";
    case "link":
      return "No links here. A first name or nickname is enough.";
    default:
      return "Letters only: a first name or nickname.";
  }
}

const USERNAME = /^[a-z][a-z0-9_]{2,19}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One of the four keys of a create or an edit, well formed (private.game_confirmed_problem). */
export function confirmedFieldOk(key: ConfirmedKey, v: unknown): boolean {
  switch (key) {
    case "confirmed_names":
      return Array.isArray(v) && v.length <= NAMES_MAX && v.every((n) => nameProblem(n) === null);
    case "confirmed_extra":
      return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= EXTRA_MAX;
    case "confirmed_tags":
      return Array.isArray(v) && v.length <= TAGS_MAX && v.every((u) => typeof u === "string" && USERNAME.test(u));
    case "confirmed_untag":
      return Array.isArray(v) && v.length <= TAGS_MAX && v.every((u) => typeof u === "string" && UUID.test(u));
  }
}

export function hasConfirmedKeys(b: Record<string, unknown>): boolean {
  return CONFIRMED_KEYS.some((k) => k in b);
}

/** The keys as the database stores them: names collapsed, usernames once each. Run after confirmedFieldOk. */
export function confirmedOf(b: Record<string, unknown>): Partial<{ confirmed_names: string[]; confirmed_extra: number; confirmed_tags: string[]; confirmed_untag: string[] }> {
  return {
    ...(Array.isArray(b.confirmed_names) ? { confirmed_names: (b.confirmed_names as string[]).map((n) => venueText(n)) } : {}),
    ...(typeof b.confirmed_extra === "number" ? { confirmed_extra: b.confirmed_extra } : {}),
    ...(Array.isArray(b.confirmed_tags) ? { confirmed_tags: [...new Set(b.confirmed_tags as string[])] } : {}),
    ...(Array.isArray(b.confirmed_untag) ? { confirmed_untag: [...new Set((b.confirmed_untag as string[]).map((u) => u.toLowerCase()))] } : {}),
  };
}

/** What a game row says of its host's confirmed people. All none before 20261117_game_confirmed.sql (the columns are absent). */
export type Confirmed = {
  names: string[];
  /** People without a name. */
  extra: number;
  /** Tagged players who have not answered yet: counted, never named publicly. */
  tagged: number;
};

const whole = (x: unknown, max: number) => {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
};

export function confirmedIn(g: { confirmed_names?: unknown; confirmed_extra?: unknown; confirmed_tagged?: unknown } | null | undefined): Confirmed {
  const names = Array.isArray(g?.confirmed_names) ? (g.confirmed_names as unknown[]).filter((n): n is string => typeof n === "string" && !!n.trim()).slice(0, NAMES_MAX) : [];
  return { names, extra: whole(g?.confirmed_extra, EXTRA_MAX), tagged: whole(g?.confirmed_tagged, TAGS_MAX) };
}

/** How many spots the host's confirmed people take. */
export const guestCount = (c: Confirmed) => c.names.length + c.extra + c.tagged;

/** Whether the row has the columns at all (the edit sheet shows the section only then). */
export const confirmedReady = (g: object | null | undefined) => !!g && "confirmed_names" in g;

/**
 * The total a game shows ("6 of 10 going"): the host and joined players
 * plus the confirmed people. `joined` counts the host. The database keeps
 * the same number in games.current_players.
 */
export function totalIn(joined: number, c: Confirmed): number {
  return Math.max(0, Math.floor(Number(joined) || 0)) + guestCount(c);
}

/**
 * What the section can still take and how low max players can go.
 * joined: the host and the players in the game (1 for a new game);
 * tags: tagged players picked or waiting. room never goes below 0.
 */
export function confirmedLimits(i: { max: number; joined: number; names: number; extra: number; tags: number }): {
  /** Everyone in: joined + names + extra + tags. */
  total: number;
  /** More people (a name, a tag or one more without a name) that still fit. */
  room: number;
  /** The fewest max players this lineup allows (never under 2). */
  minMax: number;
  /** More people than spots. */
  over: boolean;
  canAddName: boolean;
  canAddTag: boolean;
  canAddExtra: boolean;
} {
  const total = i.joined + i.names + i.extra + i.tags;
  const room = Math.max(0, i.max - total);
  return {
    total,
    room,
    minMax: Math.max(2, total),
    over: total > i.max,
    canAddName: room > 0 && i.names < NAMES_MAX,
    canAddTag: room > 0 && i.tags < TAGS_MAX,
    canAddExtra: room > 0 && i.extra < EXTRA_MAX,
  };
}

/**
 * "+2 more": the people without a name and the tagged players who have not answered. `named`: how many of those
 * tagged players are shown by name beside it (the host's view; nobody else is ever sent who they are).
 */
export function moreChip(c: Confirmed, named = 0): string | null {
  const n = c.extra + Math.max(0, c.tagged - Math.max(0, named));
  return n > 0 ? `+${n} more` : null;
}

/** "Rahul, Amit and 2 more", for screen readers and the host's summary; null when there is nobody. */
export function confirmedLine(c: Confirmed): string | null {
  const more = c.extra + c.tagged;
  const parts = [...c.names, ...(more > 0 ? [`${more} more`] : [])];
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The words of the section, in one place for the create flow and the edit sheet. */
export const CONFIRMED_COPY = {
  title: "Already confirmed (optional)",
  hint: "Friends who are in already, from your group. They take spots, so players see how many are really left.",
  namePlaceholder: "Friend's name",
  fieldHint: "Type a first name or nickname, or pick a TapTurf player to tag.",
  add: "Add name",
  more: "More without names",
  // True before and after 20261118_game_tags_shown.sql (a tagged player shows at once only after it; the create flow can't tell which).
  publicNote: "Names show on the game page. A TapTurf player you tag gets a notification and can take themselves off.",
  full: "That fills the game. Raise max players to add more.",
  repeatNote: "Names and the count go on every game of this repeat. Tags are for the first game only.",
  lineupLabel: "Confirmed with the host",
} as const;

/**
 * The tagged player's notification and the game page's card. A shown tag (20261118_game_tags_shown.sql: they are
 * on the page already) offers "I'm in" and "Remove me"; one from before it asks "Yes, I'm in" or "Not me".
 */
export const TAG_COPY = {
  yes: "Yes, I'm in",
  no: "Not me",
  in: "I'm in",
  remove: "Remove me",
  saidYes: "You're in. See you at the game.",
  saidNo: "Done. You're off this game.",
  gone: "This tag isn't there any more.",
  closed: "This game has started or is off.",
} as const;

/** The two buttons of a tag: a shown one's, or the older question's. */
export function tagButtons(shown: boolean): { yes: string; no: string } {
  return shown ? { yes: TAG_COPY.in, no: TAG_COPY.remove } : { yes: TAG_COPY.yes, no: TAG_COPY.no };
}

/** A tagged player the game's page names: waiting, with tagging still on (public.game_tags_shown). u: their public username. */
export type ShownTag = { id: string; uid: string; name: string; photo: string | null; u: string | null };

const TAG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG_USERNAME = /^[a-z][a-z0-9_]{2,19}$/;

/** game_tags_shown's answer as the page takes it: these keys only, 20 at most, each player once. */
export function shownTagViews(x: unknown): ShownTag[] {
  const out: ShownTag[] = [];
  const seen = new Set<string>();
  for (const t of Array.isArray(x) ? x : []) {
    const o = (t ?? {}) as Record<string, unknown>;
    if (typeof o.id !== "string" || !TAG_ID.test(o.id) || typeof o.uid !== "string" || !TAG_ID.test(o.uid) || seen.has(o.uid.toLowerCase())) continue;
    seen.add(o.uid.toLowerCase());
    out.push({
      id: o.id.toLowerCase(),
      uid: o.uid.toLowerCase(),
      name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 80) : "Player",
      photo: typeof o.photo === "string" && /^https:\/\//.test(o.photo) ? o.photo : null,
      u: typeof o.u === "string" && TAG_USERNAME.test(o.u) ? o.u : null,
    });
    if (out.length >= TAGS_MAX) break;
  }
  return out;
}

/**
 * The tagged players a visitor is shown by name. `named` came with the
 * page (the server's copy, up to about a minute old after a change);
 * `tagged` is the row's own count, read now. Anyone who is a player by
 * now (said "I'm in"; `inGame`, the lineup read now) or whom this viewer
 * just saw leave (`left`: their own "Remove me") is taken out. If the
 * copy still names more people than wait, someone took themselves off
 * since it was made and it can't say who: nobody is named ("+N more")
 * until the page's copy is fresh, so a player who removed themselves is
 * gone for everyone at once.
 */
export function namedTags(i: { named: readonly ShownTag[]; tagged: number; inGame: ReadonlySet<string>; left?: ReadonlySet<string> }): ShownTag[] {
  const list = i.named.filter((t) => !i.inGame.has(t.uid) && !i.left?.has(t.uid));
  return list.length > Math.max(0, i.tagged) ? [] : list;
}

/** PostgREST's answer for a column the table doesn't have (before 20261117_game_confirmed.sql). */
export function missingConfirmedColumn(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204") && /confirmed_names/.test(error.message ?? "");
}
