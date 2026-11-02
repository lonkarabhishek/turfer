// A turf's ground sizes: what owners save on myTapturf (turfs.ground_sizes,
// supabase/migrations/20261102_turf_dimensions.sql) and how an owner's
// numbers become what is stored. Pure, relative imports only, so the unit
// tests (npm run test:turf), the form, the route and the page share it.
//
// Stored in feet, to 0.1 ft. Owners may type feet or metres; the route
// converts metres (normaliseGrounds) and the database checks the feet again
// with the same rules (lib/turfSize/cases.json is run against both).

/** Owners may describe this many grounds (boxes) per turf. */
export const MAX_GROUNDS = 4;
/** "Box 1", "Main ground": at most this many characters. */
export const NAME_MAX = 30;
/** Saves a turf's owners may make in 24 hours (the database counts them). */
export const SAVES_PER_DAY = 20;

/** Feet, inclusive. Width is at most the length (they are swapped when typed the other way round). */
export const LIMITS = {
  length: { min: 30, max: 400 },
  width: { min: 20, max: 250 },
  height: { min: 8, max: 120 },
} as const;

export const FT_PER_M = 1 / 0.3048;

export type Dim = keyof typeof LIMITS;
export type Unit = "ft" | "m";
export const GROUND_SPORTS = ["cricket", "football", "both"] as const;
export type GroundSport = (typeof GROUND_SPORTS)[number];
export const SPORT_LABEL: Record<GroundSport, string> = { cricket: "Cricket", football: "Football", both: "Cricket and football" };

/** One ground (box, cage, pitch), in feet. height_ft null: no net or roof height given (an open ground). */
export type Ground = { name: string | null; sport: GroundSport | null; length_ft: number; width_ft: number; height_ft: number | null };

/** turfs.ground_sizes as the page and the form read it. */
export type GroundSizes = {
  grounds: Ground[];
  /** The unit the owner typed in (the form shows it again). */
  unit: Unit;
  /** When the owner last saved them (ISO). */
  updated_at: string | null;
  source: "owner";
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** To 0.1 (half up, as Postgres round(numeric, 1) does for these positive numbers). */
export const tenth = (x: number): number => Math.round(x * 10) / 10;

/** Feet from the owner's unit, to 0.1 ft. */
export const toFeet = (v: number, unit: Unit): number => tenth(unit === "m" ? v * FT_PER_M : v);
/** Feet in the owner's unit, to 0.1. */
export const fromFeet = (ft: number, unit: Unit): number => tenth(unit === "m" ? ft / FT_PER_M : ft);

const inRange = (dim: Dim, ft: number) => ft >= LIMITS[dim].min && ft <= LIMITS[dim].max;

/**
 * The stored value, or null when there is nothing to show. Grounds that
 * break the rules (the database's check makes that impossible) are left
 * out rather than shown half right.
 */
export function toGroundSizes(raw: unknown): GroundSizes | null {
  if (!isObj(raw) || !Array.isArray(raw.grounds)) return null;
  const grounds: Ground[] = [];
  for (const g of raw.grounds) {
    if (grounds.length === MAX_GROUNDS) break;
    if (!isObj(g)) continue;
    const l = finite(g.length_ft);
    const w = finite(g.width_ft);
    const h = g.height_ft == null ? null : finite(g.height_ft);
    if (l == null || w == null || !inRange("length", l) || !inRange("width", w) || w > l) continue;
    if (g.height_ft != null && (h == null || !inRange("height", h))) continue;
    const name = typeof g.name === "string" && g.name.trim() ? g.name.trim().slice(0, NAME_MAX) : null;
    const sport = (GROUND_SPORTS as readonly unknown[]).includes(g.sport) ? (g.sport as GroundSport) : null;
    grounds.push({ name, sport, length_ft: l, width_ft: w, height_ft: h });
  }
  if (grounds.length === 0) return null;
  return {
    grounds,
    unit: raw.unit === "m" ? "m" : "ft",
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null,
    source: "owner",
  };
}

/** One ground as the owner typed it: numbers or the text in the boxes. */
export type GroundInput = { name?: unknown; sport?: unknown; length?: unknown; width?: unknown; height?: unknown };

export type InputField = Dim | "name" | "sport" | "grounds";
/**
 * Why a ground can't be saved. ground: its index (-1: the list itself).
 * missing: a length or width left empty; number: not a number; range: out
 * of LIMITS once in feet (and swapped); long: a name over NAME_MAX; phone:
 * a phone number in the name; count: more than MAX_GROUNDS.
 */
export type InputProblem = { ground: number; field: InputField; why: "missing" | "number" | "range" | "long" | "phone" | "sport" | "count" };

/** A phone-like run (8 or more digits, a few separators between): no ground name may carry one (the database's rule too). */
const PHONE_RUN = /[0-9](?:[ .()-]{0,2}[0-9]){7,}/;

/** A number from a box ("36.5", "36,5", 120), null when empty, NaN when not a number. */
export function readNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v !== "string") return NaN;
  const t = v.trim().replace(/\s+/g, "");
  if (!t) return null;
  const s = /^\d+,\d+$/.test(t) ? t.replace(",", ".") : t;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/**
 * The grounds to store, from what the owner typed in `unit`: feet to 0.1,
 * width and length swapped when the width is the longer, height empty for
 * an open ground. The first problem found otherwise (the form shows it on
 * that box). An empty list is a valid answer: the owner removed them all.
 */
export function normaliseGrounds(unit: Unit, inputs: readonly GroundInput[]): { ok: Ground[] } | { problem: InputProblem } {
  if (inputs.length > MAX_GROUNDS) return { problem: { ground: -1, field: "grounds", why: "count" } };
  const out: Ground[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const g = inputs[i] ?? {};
    const name = g.name == null ? "" : typeof g.name === "string" ? g.name.trim().replace(/\s+/g, " ") : null;
    if (name == null) return { problem: { ground: i, field: "name", why: "long" } };
    if (name.length > NAME_MAX) return { problem: { ground: i, field: "name", why: "long" } };
    if (PHONE_RUN.test(name)) return { problem: { ground: i, field: "name", why: "phone" } };
    const sport = g.sport == null || g.sport === "" ? null : (GROUND_SPORTS as readonly unknown[]).includes(g.sport) ? (g.sport as GroundSport) : undefined;
    if (sport === undefined) return { problem: { ground: i, field: "sport", why: "sport" } };
    const vals: Partial<Record<Dim, number | null>> = {};
    for (const dim of ["length", "width", "height"] as const) {
      const n = readNumber(g[dim]);
      if (n === null) {
        if (dim !== "height") return { problem: { ground: i, field: dim, why: "missing" } };
        vals[dim] = null;
        continue;
      }
      // Nothing (0, or under 0.05 ft) is no size, before any swap: the box it was typed in.
      const ft = Number.isNaN(n) ? NaN : toFeet(n, unit);
      if (!(ft > 0)) return { problem: { ground: i, field: dim, why: "number" } };
      vals[dim] = ft;
    }
    let l = vals.length as number;
    let w = vals.width as number;
    if (w > l) [l, w] = [w, l];
    // After the swap the numbers sit in the box they now describe: a problem names that box.
    if (!inRange("length", l)) return { problem: { ground: i, field: "length", why: "range" } };
    if (!inRange("width", w)) return { problem: { ground: i, field: "width", why: "range" } };
    const h = vals.height ?? null;
    if (h != null && !inRange("height", h)) return { problem: { ground: i, field: "height", why: "range" } };
    out.push({ name: name || null, sport, length_ft: l, width_ft: w, height_ft: h });
  }
  return { ok: out };
}

/** The limits of `dim` in the owner's unit, for "between 9.1 and 121.9 m". */
export function limitsIn(dim: Dim, unit: Unit): { min: number; max: number } {
  return { min: fromFeet(LIMITS[dim].min, unit), max: fromFeet(LIMITS[dim].max, unit) };
}

const DIM_WORD: Record<Dim, string> = { length: "Length", width: "Width", height: "Height" };

/** The form's words for a problem. */
export function problemText(p: InputProblem, unit: Unit): string {
  if (p.field === "grounds") return `Up to ${MAX_GROUNDS} grounds.`;
  if (p.field === "name") return p.why === "phone" ? "Leave phone numbers out of the name." : `Keep the name to ${NAME_MAX} characters.`;
  if (p.field === "sport") return "Pick cricket, football or both.";
  const word = DIM_WORD[p.field];
  if (p.why === "missing") return `${word} is needed.`;
  if (p.why === "number") return `${word} should be a number, like ${unit === "m" ? "36.5" : "120"}.`;
  const { min, max } = limitsIn(p.field, unit);
  return `${word} should be between ${min} and ${max} ${unit}.`;
}

/** 120 -> "120", 36.6 -> "36.6": feet or metres for the page. */
export const shown = (x: number): string => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/** "120 × 60 × 40 ft" (or "120 × 60 ft" for an open ground). */
export function sizeLine(g: Ground, unit: Unit): string {
  const parts = [g.length_ft, g.width_ft, ...(g.height_ft == null ? [] : [g.height_ft])].map((ft) => shown(fromFeet(ft, unit)));
  return `${parts.join(" × ")} ${unit}`;
}

/** Same grounds (what a save would store), in order. */
export function sameGrounds(a: readonly Ground[], b: readonly Ground[]): boolean {
  return a.length === b.length && a.every((g, i) => g.name === b[i].name && g.sport === b[i].sport && g.length_ft === b[i].length_ft && g.width_ft === b[i].width_ft && g.height_ft === b[i].height_ft);
}

/** "Box 1", or "Ground 2" when unnamed (just "Ground" for a turf with one). */
export function groundTitle(g: Ground, i: number, count: number): string {
  return g.name ?? (count > 1 ? `Ground ${i + 1}` : "Ground");
}
