import type { CreateGameBody, GameChanges } from "./types";

/**
 * The games routes' bodies, checked before the database checks them again
 * (20261030_games_lockdown.sql private.game_field_problem has the same
 * rules), and the few rules the fallback (lib/games/legacy.ts) needs.
 * Pure; relative imports only (npm run test:games).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (x: unknown): x is string => typeof x === "string" && UUID.test(x);

export const SKILLS = ["beginner", "intermediate", "advanced", "all"] as const;
export const MAX_PLAYERS = 50;
export const MAX_PRICE = 10_000;
export const NOTE_MAX = 300;
export const DESCRIPTION_MAX = 500;
/** How far ahead a game can be set. */
export const DAYS_AHEAD = 365;

/** Today in India, YYYY-MM-DD. */
export const istToday = (now = Date.now()) => new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** The day `days` after a YYYY-MM-DD one. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A real YYYY-MM-DD day (2026-02-30 is not one). */
export function isDay(x: unknown): x is string {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [y, m, d] = x.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const isTime = (x: unknown): x is string => typeof x === "string" && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(x);

const CREATE_FIELDS = ["turf_id", "sport", "skill_level", "max_players", "date", "start_time", "end_time", "price_per_player", "description", "turf_booked", "host_phone"] as const;
const CREATE_NEEDS = ["turf_id", "sport", "skill_level", "max_players", "date", "start_time", "end_time", "price_per_player"] as const;
export const CHANGE_FIELDS = ["date", "start_time", "end_time", "max_players", "price_per_player", "description", "turf_booked", "skill_level", "turf_id"] as const;

/**
 * The first field of a body that is not allowed or not well formed, or
 * null when all are fine ("body" when it isn't an object). As the
 * database's private.game_field_problem.
 */
export function fieldProblem(p: unknown, allowed: readonly string[]): string | null {
  if (!p || typeof p !== "object" || Array.isArray(p)) return "body";
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    if (!allowed.includes(k)) return k;
    const fine = (() => {
      switch (k) {
        case "date":
          return isDay(v);
        case "start_time":
        case "end_time":
          return isTime(v);
        case "max_players":
          return Number.isInteger(v) && (v as number) >= 2 && (v as number) <= MAX_PLAYERS;
        case "price_per_player":
          // Rupees, at most 2 decimals.
          return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_PRICE && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
        case "description":
          return v === null || (typeof v === "string" && v.trim().length <= DESCRIPTION_MAX);
        case "turf_booked":
          return typeof v === "boolean";
        case "skill_level":
          return (SKILLS as readonly unknown[]).includes(v);
        case "turf_id":
          return isUuid(v);
        case "sport":
          return typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 40;
        case "host_phone":
          return v === "" || (typeof v === "string" && /^\+91[6-9]\d{9}$/.test(v));
        default:
          return false;
      }
    })();
    if (!fine) return k;
  }
  return null;
}

/** Only the keys that are there (undefined ones left out, as JSON would). */
const present = (b: Record<string, unknown>) => Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));

/** A create body: the host's game, every needed field there and well formed, the day from today to a year on. */
export function parseCreate(body: Record<string, unknown> | null, today = istToday()): { ok: CreateGameBody } | { bad: string } {
  if (!body) return { bad: "body" };
  const b = present(body);
  const problem = fieldProblem(b, CREATE_FIELDS) ?? CREATE_NEEDS.find((k) => !(k in b)) ?? null;
  if (problem) return { bad: problem };
  if ((b.date as string) < today || (b.date as string) > addDays(today, DAYS_AHEAD)) return { bad: "date" };
  return {
    ok: {
      ...(b as CreateGameBody),
      turf_id: (b.turf_id as string).toLowerCase(),
      sport: (b.sport as string).trim(),
      ...(typeof b.description === "string" ? { description: b.description.trim() } : {}),
    },
  };
}

/** An edit: only the fields the sheet has, each well formed. The database checks the day against the game's own. */
export function parseChanges(body: Record<string, unknown> | null): { ok: GameChanges } | { bad: string } {
  if (!body) return { bad: "body" };
  const b = present(body);
  const problem = fieldProblem(b, CHANGE_FIELDS);
  if (problem) return { bad: problem };
  if (Object.keys(b).length === 0) return { bad: "body" };
  return {
    ok: {
      ...(b as GameChanges),
      ...(typeof b.turf_id === "string" ? { turf_id: b.turf_id.toLowerCase() } : {}),
      ...(typeof b.description === "string" ? { description: b.description.trim() } : {}),
    },
  };
}

/** A join request's note: trimmed, empty is none, at most NOTE_MAX characters. */
export function parseNote(x: unknown): { ok: string | null } | { bad: true } {
  if (x === undefined || x === null) return { ok: null };
  if (typeof x !== "string") return { bad: true };
  const t = x.trim();
  if (t.length > NOTE_MAX) return { bad: true };
  return { ok: t || null };
}

/** HH:MM(:SS) as minutes after midnight. */
const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Over, as the database (private.game_over, close_past_games) reads it:
 * the end, or 2 hours after the start when the end is not after it, then
 * 30 minutes more, in India.
 */
export function gameOver(g: { date: string; start_time: string | null; end_time: string | null }, now = Date.now()): boolean {
  if (!isDay(g.date)) return false;
  const start = g.start_time && isTime(g.start_time) ? minutes(g.start_time) : null;
  const end = g.end_time && isTime(g.end_time) ? minutes(g.end_time) : null;
  const at = start != null && end != null && end > start ? end : start != null ? start + 120 : 23 * 60 + 59;
  const [y, m, d] = g.date.split("-").map(Number);
  // India is UTC+5:30 all year.
  const overAt = Date.UTC(y, m - 1, d) + (at + 30 - 330) * 60_000;
  return overAt < now;
}

/** The host's first name, as a notification says it ("Your host" when there is none). */
export function hostFirst(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || "Your host";
}
