import { agoWords, instant, stampWords } from "./when";

/**
 * Updates from the host (the site owner, 17 Nov 2026: "Instead of notes,
 * can we add updates section? ... show updates with timeframes"). The
 * note written with the game (games.description) is the first entry, at
 * games.created_at; each later update is one of games.updates
 * ({id, at, text}, 20261118_game_updates.sql),
 * posted by the host from the game page and never edited, so the times
 * stay true (the host can take one back). The limits are the database's
 * (private.game_update_max, _day_max, _chars). Pure; relative imports only
 * (npm run test:games).
 */

/** Characters in one update (the note written with a game may be 500; an update is a line or two, and 20 ride on the row). */
export const UPDATE_CHARS = 300;
/** Updates on one game. */
export const UPDATES_MAX = 20;
/** Posts on one game in a day (one taken back still counts). */
export const UPDATES_PER_DAY = 10;

export type GameUpdate = { id: string; at: string; text: string };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether the row has the column at all (posting is offered only then). */
export const updatesReady = (g: object | null | undefined) => !!g && "updates" in g;

/** A game's stored updates, as the page takes them: well formed ones only, oldest first. */
export function updatesOf(g: { updates?: unknown } | null | undefined): GameUpdate[] {
  const out: GameUpdate[] = [];
  for (const u of Array.isArray(g?.updates) ? (g.updates as unknown[]) : []) {
    const o = (u ?? {}) as Record<string, unknown>;
    if (typeof o.id !== "string" || !ID.test(o.id) || typeof o.text !== "string" || !o.text.trim() || instant(o.at) === null) continue;
    out.push({ id: o.id.toLowerCase(), at: o.at as string, text: o.text.trim().slice(0, UPDATE_CHARS) });
    if (out.length >= UPDATES_MAX) break;
  }
  return out.sort((a, b) => (instant(a.at) as number) - (instant(b.at) as number));
}

export type UpdateProblem = "missing" | "long";

/** What is wrong with an update as typed, or null: 1 to 300 characters once trimmed. */
export function updateProblem(raw: unknown): UpdateProblem | null {
  if (typeof raw !== "string" || !raw.trim()) return "missing";
  return [...raw.trim()].length > UPDATE_CHARS ? "long" : null;
}

export function updateProblemText(p: UpdateProblem): string {
  return p === "missing" ? "Write the update first." : `Keep it to ${UPDATE_CHARS} characters.`;
}

/** One line of the Updates list. */
export type UpdateEntry = {
  /** Its id in games.updates; null for the note written with the game. */
  id: string | null;
  text: string;
  /** When it was posted (ms); null when the game has no created_at to say. */
  at: number | null;
  /** The note the game went up with. */
  original: boolean;
};

/**
 * The list the page shows, newest first: every update, then the note the
 * game went up with (`note`: hostNote(), null when the host wrote none)
 * at the time the game was posted. Nothing at all gives [].
 */
export function updatesList(g: { updates?: unknown; created_at?: unknown }, note: string | null): UpdateEntry[] {
  const list: UpdateEntry[] = updatesOf(g)
    .map((u) => ({ id: u.id, text: u.text, at: instant(u.at), original: false }))
    .reverse();
  if (note && note.trim()) list.push({ id: null, text: note.trim(), at: instant(g.created_at), original: true });
  return list;
}

/** "2 h ago" and, behind it, "Mon 17 Nov, 3:40 PM" (India). Both "" when there is no time to say. */
export function updateWhen(e: Pick<UpdateEntry, "at">, now: number): { ago: string; stamp: string; iso: string } {
  if (e.at === null) return { ago: "", stamp: "", iso: "" };
  return { ago: agoWords(e.at, now), stamp: stampWords(e.at, now), iso: new Date(e.at).toISOString() };
}

/** Whether the host can post another one now, by what the row shows (the server counts the day's posts itself). */
export function canPostUpdate(g: { updates?: unknown } | null | undefined): boolean {
  return updatesReady(g) && updatesOf(g).length < UPDATES_MAX;
}

export const UPDATES_COPY = {
  title: "Updates",
  yours: "Your updates",
  post: "Post an update",
  placeholder: "Turf booked, bring a dark tee…",
  hint: "Players in the game and anyone waiting on a request get a notification. Updates show on the game page with the time.",
  posted: "Posted with the game",
  remove: "Remove",
  none: "No updates yet. Post one when something changes: the turf is booked, what to bring.",
  full: `That's ${UPDATES_MAX} updates, the most a game can have. Remove one to post another.`,
} as const;
