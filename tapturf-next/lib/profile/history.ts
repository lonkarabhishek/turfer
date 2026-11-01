/**
 * A player's TapTurf history, from public rows: the games they were in
 * (a game_participants row, or hosting it), the turfs those were at and
 * their live player reviews. What counts as played, India's days and
 * weeks. Pure: lib/profile/server.ts reads the rows. Relative imports
 * only (npm run test:profile).
 *
 * Played means the game happened: it was not cancelled and its end has
 * passed (its date and end time, India time; past midnight when it ends
 * at or before its start; an hour after the start when it has no end).
 * private.game_over_at in 20261101_played_with.sql is the same rule.
 */

export type GameRow = {
  id: string;
  creator_id: string | null;
  turf_id: string | null;
  sport: string | null;
  /** YYYY-MM-DD, India's date. */
  date: string;
  /** HH:MM or HH:MM:SS, India's clock. */
  start_time: string | null;
  end_time: string | null;
  status: string | null;
};

export type TurfRef = { id: string; slug: string | null; name: string; city: string | null; cityLabel: string | null };

/** A live player review (source null, status live). */
export type ReviewRow = { turf_id: string; rating: number; created_at: string | null };

/** One game the person played, oldest first in every list. */
export type PlayedGame = {
  id: string;
  turfId: string | null;
  sport: string | null;
  /** India's date of the game. */
  day: string;
  hosted: boolean;
  /** When it ended (ms). */
  endsAt: number;
};

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** India's date (YYYY-MM-DD) at a moment. */
export function istDay(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function minutesOf(t: string | null): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Days since 1970-01-01 of a YYYY-MM-DD date, or NaN. */
export function dayNumber(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(ms) ? NaN : Math.round(ms / DAY_MS);
}

/** The YYYY-MM-DD of a day number. */
export function dayOfNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** India weeks run Monday to Sunday: the week a day is in, as a number (1970-01-01 was a Thursday). */
export function weekOf(day: string): number {
  return Math.floor((dayNumber(day) + 3) / 7);
}

/** The Monday and Sunday of a week number. */
export function weekDays(week: number): { monday: string; sunday: string } {
  return { monday: dayOfNumber(week * 7 - 3), sunday: dayOfNumber(week * 7 + 3) };
}

/** When a game ends (ms), or null when its date can't be read. */
export function gameEndsAt(g: Pick<GameRow, "date" | "start_time" | "end_time">): number | null {
  const day = dayNumber(g.date);
  if (Number.isNaN(day)) return null;
  const start = minutesOf(g.start_time) ?? 0;
  const end = minutesOf(g.end_time);
  const length = end === null ? 60 : end <= start ? end - start + 1440 : end - start;
  return day * DAY_MS + (start + length) * 60_000 - IST_OFFSET_MS;
}

/** The game happened: not cancelled, and over. */
export function isPlayed(g: Pick<GameRow, "date" | "start_time" | "end_time" | "status">, now: number): boolean {
  if (g.status === "cancelled") return false;
  const end = gameEndsAt(g);
  return end !== null && end <= now;
}

/**
 * The games this person played, oldest first, each once. `games` are the
 * games they were in: a participant, or the host (a host plays their own
 * game, even when an old game has no participant row for them).
 */
export function playedGames(userId: string, games: readonly GameRow[], now: number): PlayedGame[] {
  const seen = new Set<string>();
  const out: PlayedGame[] = [];
  for (const g of games) {
    if (seen.has(g.id) || !isPlayed(g, now)) continue;
    seen.add(g.id);
    out.push({
      id: g.id,
      turfId: g.turf_id,
      sport: g.sport?.trim() || null,
      day: g.date,
      hosted: g.creator_id === userId,
      endsAt: gameEndsAt(g) as number,
    });
  }
  return out.sort((a, b) => a.endsAt - b.endsAt || (a.id < b.id ? -1 : 1));
}

/** Words for a day: "12 Oct", with the year when it isn't this year (India time). */
export function shortDay(day: string, now: number): string {
  const n = dayNumber(day);
  if (Number.isNaN(n)) return "";
  const d = new Date(n * DAY_MS);
  const sameYear = day.slice(0, 4) === istDay(now).slice(0, 4);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}
