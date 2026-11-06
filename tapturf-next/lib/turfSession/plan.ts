import type { Format } from "./types";

/**
 * What a turf session starts with: the two formats the scorers know (box
 * cricket and cricket: just overs, players a side and house rules, as
 * lib/cricket/scoring.ts takes them), what a game's sport means, how many
 * matches fit in its slot, and when its page offers "Score this game".
 * Every number here is a guess the organiser can change, tunable in one
 * place. Times are India wall clock, as games store them. Pure, relative
 * imports only, tested in plan.test.ts (npm run test:session).
 */

export type FormatDef = {
  label: string;
  /** Overs a match by default, and the chips offered. */
  overs: number;
  oversChips: number[];
  /** Players a side by default, and the chips offered. */
  players: number;
  playersChips: number[];
  /** Minutes an over takes, both innings counted separately. */
  minPerOver: number;
  /** Minutes between two matches (and the innings break). */
  changeMin: number;
};

export const FORMATS: Record<Format, FormatDef> = {
  box: { label: "Box cricket", overs: 6, oversChips: [4, 5, 6, 8, 10], players: 6, playersChips: [5, 6, 7, 8], minPerOver: 1.5, changeMin: 2 },
  cricket: { label: "Cricket", overs: 10, oversChips: [5, 6, 8, 10, 20], players: 11, playersChips: [7, 8, 11], minPerOver: 2.5, changeMin: 4 },
};

/** Matches planned, on the chips. */
export const PLAN_CHIPS = [3, 4, 5, 6, 8];
export const MAX_PLAN = 9;

/** The chips for this plan: a guess off them (2 cricket matches in a 2-hour slot) gets its own, so it shows picked. */
export const planChips = (plan: number | null): number[] =>
  plan === null || PLAN_CHIPS.includes(plan) ? PLAN_CHIPS : [...PLAN_CHIPS, plan].sort((a, b) => a - b);
/** A session keeps at most this many matches. */
export const MAX_MATCHES = 30;

/** Games on or after this India day may have a session on their page (the day this shipped): older ones are never read for one. */
export const SESSION_SINCE = "2026-11-06";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * A game's sport as a session format: box cricket for anything box,
 * cricket for the rest of cricket, and null for anything that is not a
 * match (nets, a bowling machine, practice) or not cricket at all.
 */
export function formatFor(sport: string | null | undefined): Format | null {
  const s = String(sport ?? "").toLowerCase();
  if (!s.includes("cricket")) return null;
  if (/net|bowling machine|practice/i.test(s)) return null;
  return /box/i.test(s) ? "box" : "cricket";
}

/** Players a side from a game's spots: half, 2 to 11; the format's default when the spots are unknown. */
export function playersFromSpots(max: number | null | undefined, format: Format): number {
  const n = Number(max);
  if (!Number.isFinite(n) || n <= 0) return FORMATS[format].players;
  return clamp(Math.floor(n / 2), 2, 11);
}

/** "HH:MM[:SS]" as minutes after midnight, or NaN. */
export function minutesOf(time: string | null | undefined): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  if (!m) return NaN;
  const h = +m[1];
  const mm = +m[2];
  return h < 24 && mm < 60 ? h * 60 + mm : NaN;
}

/** The slot's length in minutes. An end before the start is past midnight. Equal, unknown or over 12 hours: 120. */
export function slotMinutes(start: string | null | undefined, end: string | null | undefined): number {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (Number.isNaN(s) || Number.isNaN(e) || s === e) return 120;
  const len = e > s ? e - s : e + 1440 - s;
  return len > 12 * 60 ? 120 : len;
}

/** How many matches of these overs fit in the slot: 1 to 9. */
export function planMatches(slot: number, format: Format, overs: number): number {
  const f = FORMATS[format];
  const o = Math.max(1, overs);
  return clamp(Math.floor((slot + f.changeMin) / (2 * o * f.minPerOver + f.changeMin)), 1, MAX_PLAN);
}

/** The format's overs, fewer only when one match of them does not fit in the slot; never below 2. */
export function oversThatFit(slot: number, format: Format): number {
  const f = FORMATS[format];
  if (2 * f.overs * f.minPerOver <= slot) return f.overs;
  return Math.max(2, Math.floor(slot / (2 * f.minPerOver)));
}

/* ------------------------------------------------------------------ */
/* India days                                                          */
/* ------------------------------------------------------------------ */

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "YYYY-MM-DD" as a day count since 1970-01-01, or NaN. */
export function dayNumber(date: string | null | undefined): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return new Date(t).toISOString().slice(0, 10) === date ? t / DAY_MS : NaN;
}

/** India's date at this instant, as YYYY-MM-DD. */
export function indiaDay(now: number): string {
  return new Date(Math.floor((now + IST_MS) / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
}

/** "Sat 8 Nov" for an India day; the text as it is when it is not one. */
export function dayLabel(date: string): string {
  const d = dayNumber(date);
  if (Number.isNaN(d)) return date;
  const x = new Date(d * DAY_MS);
  return `${WEEKDAYS[x.getUTCDay()]} ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`;
}

/**
 * When a game's page offers "Score this game": from 30 minutes before the
 * start to 3 hours after the end (past midnight too), as instants. Null
 * without a day or a start.
 */
export function scoreWindow(game: { date: string; start_time: string; end_time?: string | null }): { open: number; close: number } | null {
  const day = dayNumber(game.date);
  const s = minutesOf(game.start_time);
  if (Number.isNaN(day) || Number.isNaN(s)) return null;
  const start = day * DAY_MS + s * 60_000 - IST_MS;
  const end = start + slotMinutes(game.start_time, game.end_time) * 60_000;
  return { open: start - 30 * 60_000, close: end + 180 * 60_000 };
}

/**
 * The server's own, wider check before it gives a game its live link:
 * India's today is from the day before the game to two days after. A
 * wrong phone clock moves the button, never this.
 */
export function serverWindowOk(date: string, now: number): boolean {
  const day = dayNumber(date);
  if (Number.isNaN(day)) return false;
  const today = dayNumber(indiaDay(now));
  return today >= day - 1 && today <= day + 2;
}
