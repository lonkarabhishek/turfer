import { dayNumber, gameEndsAt, istDay } from "../profile/history";
import { clockWords, dayWords } from "./when";

/**
 * "You were tagged in these games. Did you play?" (the site owner, 17 Nov
 * 2026: "Let them retro fill in the passport ... Once confirmed add
 * them"). A host tagged a player, the player never answered, and the game
 * has been played: the Me tab's Passport asks them. Yes makes them a
 * player of that game (public.game_tag_played, 20261118_game_tags_shown.sql),
 * so Passport, the streak, stamps, medals and played-with count it, on the
 * game's own day; no takes them off its lineup. The database decides which
 * games (public.game_tags_played: over as Passport reads it, not called
 * off, the last 90 days, never answered, not a player); the same rules
 * are applied again here to what it sends. Pure; relative imports only
 * (npm run test:games).
 */

/** How far back a game is asked about (private.game_tag_ask_days). */
export const PLAYED_ASK_DAYS = 90;
/** Games listed before "Show more". */
export const PLAYED_SHOWN = 10;
const MOST = 50;

export type TaggedGame = {
  gameId: string;
  sport: string | null;
  venue: string | null;
  /** India's date, YYYY-MM-DD. */
  date: string;
  start_time: string | null;
  end_time: string | null;
  /** The host's first name. */
  host: string | null;
};

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (x: unknown, max: number): string | null => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : null);
const clock = (x: unknown): string | null => (typeof x === "string" && /^\d{1,2}:\d{2}/.test(x) ? x.slice(0, 5) : null);

/**
 * The games to ask about, newest first, each once: what game_tags_played
 * sent, kept only when the game is over (its end has passed, India time)
 * and was at most 90 days ago.
 */
export function taggedGames(rows: unknown, now: number): TaggedGame[] {
  const today = dayNumber(istDay(now));
  const seen = new Set<string>();
  const out: TaggedGame[] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const o = (r ?? {}) as Record<string, unknown>;
    const id = typeof o.game_id === "string" && ID.test(o.game_id) ? o.game_id.toLowerCase() : null;
    const date = typeof o.date === "string" ? o.date.slice(0, 10) : "";
    const day = dayNumber(date);
    if (!id || seen.has(id) || Number.isNaN(day) || today - day > PLAYED_ASK_DAYS) continue;
    const g: TaggedGame = { gameId: id, sport: text(o.sport, 40), venue: text(o.venue, 80), date, start_time: clock(o.start_time), end_time: clock(o.end_time), host: text(o.host, 40) };
    const ends = gameEndsAt(g);
    if (ends === null || ends > now) continue;
    seen.add(id);
    out.push(g);
  }
  return out
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.start_time ?? "").localeCompare(a.start_time ?? "") || (a.gameId < b.gameId ? -1 : 1)))
    .slice(0, MOST);
}

/** The first ten, and how many "Show more" adds. */
export function taggedView(list: readonly TaggedGame[], all: boolean): { shown: readonly TaggedGame[]; more: number } {
  return all || list.length <= PLAYED_SHOWN ? { shown: list, more: 0 } : { shown: list.slice(0, PLAYED_SHOWN), more: list.length - PLAYED_SHOWN };
}

/** One game's lines: "Football at Kings Turf", "Sat 14 Nov, 7 PM", "Added by Asha". */
export function taggedWords(g: TaggedGame, now: number): { title: string; when: string; by: string } {
  const sport = g.sport ?? "A game";
  const year = Number(istDay(now).slice(0, 4));
  return {
    title: g.venue ? `${sport} at ${g.venue}` : sport,
    when: [dayWords(g.date, year), clockWords(g.start_time)].filter(Boolean).join(", "),
    by: `Added by ${g.host ?? "the host"}`,
  };
}

export const PLAYED_COPY = {
  title: "You were tagged in these games. Did you play?",
  hint: "Yes adds the game to your Passport and to the people you played with. No takes you off its lineup.",
  yes: "Yes, I played",
  no: "No, I didn't",
  saidYes: "Added to your Passport.",
  saidNo: "Done. You're off that game.",
  gone: "That one is already answered.",
  closed: "That game can't be confirmed any more.",
} as const;
