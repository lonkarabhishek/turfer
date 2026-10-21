import type { Board, BoardEvent, BoardView, Side } from "./types";

/**
 * Small helpers every board engine shares. Relative imports only, so the
 * unit tests compile lib/board on its own (npm run test:board).
 */

export const SIDES: readonly Side[] = ["a", "b"];

export const other = (s: Side): Side => (s === "a" ? "b" : "a");

export const isSide = (x: unknown): x is Side => x === "a" || x === "b";

/** A real number, or undefined. Number() on a JSON object can throw. */
export function num(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

/** A whole number within [min, max], or the fallback. */
export function clampInt(x: unknown, min: number, max: number, fallback: number): number {
  const n = num(x);
  if (n === undefined) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** One of the allowed values, or the fallback. */
export function oneOf<T>(x: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(x as T) ? (x as T) : fallback;
}

/** Trimmed, single-spaced, control characters out, cut to max. Empty when there is nothing. */
export function cleanName(x: unknown, max = 32): string {
  if (typeof x !== "string") return "";
  return x
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** 1st, 2nd, 3rd, 4th. */
export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${s}`;
}

/** 7:05 or 1:02:03 from ms (rounded down to the second). Negative shows as 0:00. */
export function clockText(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Plural: plural(2, "goal") is "2 goals". */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

/** Team names as now: the latest rename of each side, else the setup's. */
export function namesNow(board: Board): Record<Side, string> {
  const names: Record<Side, string> = { a: board.setup.teamA, b: board.setup.teamB };
  for (const e of board.events) if (e.type === "rename") names[e.side] = e.name || names[e.side];
  return names;
}

/** The newest `at` among the events, or null. */
export function lastAt(events: readonly BoardEvent[]): number | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const at = (events[i] as { at?: number }).at;
    if (typeof at === "number" && Number.isFinite(at)) return at;
  }
  return null;
}

/** "2-1" with side a first. */
export const scoreText = (a: number, b: number) => `${a}-${b}`;

/** A view with every field empty, for engines to fill. */
export function blankView(board: Board, sportName: string, scoreUnit: string): BoardView {
  const names = namesNow(board);
  return {
    id: board.id,
    sport: board.sport,
    sportName,
    status: "live",
    setup: { ...board.setup, teamA: names.a, teamB: names.b },
    teams: { a: { name: names.a, score: 0 }, b: { name: names.b, score: 0 } },
    scoreUnit,
    current: null,
    currentLabel: null,
    period: null,
    clock: null,
    server: null,
    serveNote: null,
    needsServe: false,
    sets: [],
    timeline: [],
    stats: [],
    players: [],
    notices: [],
    gameJustEnded: null,
    changeEnds: false,
    headline: "",
    result: null,
    lastAction: null,
    lastAt: lastAt(board.events),
    eventCount: board.events.length,
  };
}

/** A plain object (not null, not an array): what JSON gives for {}. */
export const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** A boolean, or the fallback. */
export const bool = (x: unknown, fallback: boolean): boolean => (typeof x === "boolean" ? x : fallback);

/* ------------------------------------------------------------------ */
/* Timed sports: the period clock                                      */
/* ------------------------------------------------------------------ */

/**
 * A period clock as derive folds it: `ms` is the value at `at` (elapsed
 * counting up, left counting down). started: it has run or been set in
 * this period, so a time read off it means something.
 */
export type PeriodClock = { running: boolean; ms: number; at: number | null; down: boolean; started: boolean };

export const newClock = (down: boolean, ms: number, at: number | null): PeriodClock => ({ running: false, ms, at, down, started: false });

/** The clock's value at `t`. Time going backwards (a phone clock fixed mid match) counts as none, and a down clock stops at 0. */
export function clockValue(c: Pick<PeriodClock, "running" | "ms" | "at" | "down">, t: number | null | undefined): number {
  if (!c.running || c.at === null || typeof t !== "number" || !Number.isFinite(t)) return c.ms;
  const d = Math.max(0, t - c.at);
  return c.down ? Math.max(0, c.ms - d) : c.ms + d;
}

/** Start, stop or set the clock (a ClockEvent the engine has checked). */
export function runClock(c: PeriodClock, e: { run: boolean; at: number; ms?: number }): void {
  const value = clockValue(c, e.at);
  c.ms = e.ms ?? value;
  c.running = e.run;
  c.at = e.at;
  if (e.run || e.ms !== undefined) c.started = true;
}

/** A period or end event stops a running clock at its own `at` (or where it was last read, when it has none). */
export function stopClock(c: PeriodClock, at: number | undefined): void {
  if (!c.running) return;
  c.ms = clockValue(c, at ?? c.at);
  c.running = false;
  if (typeof at === "number") c.at = at;
}

/**
 * The result of an end with a reason: abandoned has none; retired,
 * walkover and conceded go to the side that did not stop. Null for a
 * plain end (time up), which each engine decides on its own score.
 */
export function stoppedResult(e: { reason?: string; side?: Side }, names: Record<Side, string>): BoardView["result"] {
  if (e.reason === "abandoned") return { winner: null, kind: "abandoned", text: "Abandoned" };
  if ((e.reason === "retired" || e.reason === "walkover" || e.reason === "conceded") && isSide(e.side)) {
    const w = other(e.side);
    return { winner: w, kind: "win", text: e.reason === "walkover" ? `${names[w]} won by walkover` : `${names[w]} won, ${names[e.side]} ${e.reason}` };
  }
  return null;
}
