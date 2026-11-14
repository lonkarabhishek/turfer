import type { OpeningHours, Turf } from "../../types/turf";
import { isAllDaySpan, normaliseOpeningHours } from "../utils/hours";
import { cardPrice, type CardSport } from "../utils/cardSport";

/**
 * What the listing's Filters sheet filters on, per turf, worked out on the
 * server (lib/turfList/query.ts rankTurfs) and never sent to the browser:
 * the cards stay the card rows they were. Relative imports only, so
 * `npm run test:list` compiles it on its own.
 *
 * A facility counts when the turf's own column says yes or its amenities
 * list names it ("Flood Lights", "Restroom", "Rental Equipment"): the data
 * team filled both, and on 3 Nov 1,699 turfs had has_floodlights against
 * 1,750 with either. Nothing here says "no": a turf without the fact is
 * simply not in the filtered list.
 */

/**
 * The sheet's toggles, in the order the URL writes them (`f=open,lights`).
 * "free": the turf's owner marked free hours that players see now (Free
 * slots, lib/availability/free.ts), from the cached reader the route asks
 * only when this toggle is on or the sheet's counts are asked for, never
 * from the turf's facts.
 */
export const FACETS = ["free", "open", "24h", "lights", "covered", "parking", "washroom", "changing", "rated", "coaching", "equipment", "claimed"] as const;
export type Facet = (typeof FACETS)[number];

const BIT = Object.fromEntries(FACETS.map((f, i) => [f, 1 << i])) as Record<Facet, number>;
export const facetBit = (f: Facet): number => BIT[f];

/** "Rated 4.5+": the Google rating on the row (TapTurf players' own stars are separate). */
export const RATED_MIN = 4.5;

/** "Price up to" steps, ₹ per hour (3 Nov: 1,212 of 3,830 turfs list one; median ₹900, 90% at or under ₹1,500). */
export const PRICE_STEPS = [600, 800, 1000, 1200, 1500, 2000] as const;

/** Surfaces the sheet offers, from surface_type (3 Nov: 3,700 "artificial turf", 19 artificial grass, 3 natural grass). */
export const SURFACES = ["artificial", "natural", "wooden", "hard", "clay"] as const;
export type SurfaceKind = (typeof SURFACES)[number];

export const SURFACE_LABELS: Record<SurfaceKind, string> = {
  artificial: "Artificial grass",
  natural: "Natural grass",
  wooden: "Wooden court",
  hard: "Hard court",
  clay: "Clay court",
};

/**
 * The surface a free-text surface_type names, or null. "Synthetic" alone
 * is left out: it is a turf on a football ground and a mat on a badminton
 * court, and the row does not say which.
 */
export function surfaceKind(raw: string | null | undefined): SurfaceKind | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return null;
  if (/\bnatural\b|\breal grass\b|^grass$/.test(s)) return "natural";
  if (/artificial|astro|\bturf\b|synthetic (?:grass|turf)/.test(s)) return "artificial";
  if (/\bwood/.test(s)) return "wooden";
  if (/\bclay\b/.test(s)) return "clay";
  if (/cement|concrete|\bhard\b|acrylic/.test(s)) return "hard";
  return null;
}

/* ---------- opening hours, in minutes ---------- */

/** [opens, closes] in minutes of the day; closes <= opens runs past midnight; a whole day is [0, 1440]. */
export type Span = readonly [number, number];
/** Monday to Sunday: a day's spans, [] when closed, null when not known. */
export type Week = readonly (readonly Span[] | null)[];

const toMin = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 24 && min < 60 ? h * 60 + min : null;
};

function weekOf(rows: ReturnType<typeof normaliseOpeningHours>): Week | null {
  if (!rows.length) return null;
  const order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const week: (Span[] | null)[] = [null, null, null, null, null, null, null];
  for (const r of rows) {
    const i = order.indexOf(r.day);
    if (i < 0) continue;
    if (r.closed) {
      week[i] = [];
      continue;
    }
    const spans: Span[] = [];
    for (const s of r.spans) {
      if (isAllDaySpan(s)) {
        spans.push([0, 1440]);
        continue;
      }
      const o = toMin(s.opens);
      let c = toMin(s.closes);
      if (o == null || c == null) continue;
      // "6 AM–12 AM" closes at midnight: the end of this day, not a span into the next.
      if (c === 0) c = 1440;
      spans.push([o, c]);
    }
    // A day whose text did not parse is not known (the page shows the text), not closed.
    week[i] = spans.length ? spans : null;
  }
  return week.some((d) => d !== null) ? week : null;
}

/**
 * opening_hours as the cached facts keep it: each day's spans as
 * "opens-closes" minutes ("360-1380", "360-480,960-1440"), "x" when
 * closed, "" when not known, days joined by "|", or one day's text when
 * all seven are the same. Same reading as the turf page
 * (normaliseOpeningHours, without the row's start and end): null when
 * there are no hours (the row's start and end then count), "" when there
 * are some but no day parses (the page shows the text; no times count).
 */
export function encodeWeek(oh: OpeningHours | null | undefined): string | null {
  const rows = normaliseOpeningHours(oh);
  if (!rows.length) return null;
  const week = weekOf(rows);
  if (!week) return "";
  const days = week.map((d) => (d === null ? "" : d.length === 0 ? "x" : d.map(([o, c]) => `${o}-${c}`).join(",")));
  return days.every((d) => d === days[0]) ? days[0] : days.join("|");
}

export function decodeWeek(s: string | null | undefined): Week | null {
  if (typeof s !== "string") return null;
  const parts = s.split("|");
  const days = parts.length === 1 ? Array(7).fill(parts[0]) : parts;
  if (days.length !== 7) return null;
  const week = days.map((d: string): Span[] | null => {
    if (d === "") return null;
    if (d === "x") return [];
    const spans: Span[] = [];
    for (const p of d.split(",")) {
      const m = /^(\d{1,4})-(\d{1,4})$/.exec(p);
      if (!m) return null;
      const o = Number(m[1]);
      const c = Number(m[2]);
      if (o > 1440 || c > 1440) return null;
      spans.push([o, c]);
    }
    return spans;
  });
  return week.some((d) => d !== null) ? week : null;
}

/** A day and minute in India time: Monday is 0. */
export type IstTime = { day: number; minute: number };

/** Minutes "open now" is rounded down to, so one cached answer serves a quarter of an hour. */
export const IST_STEP = 15;

const IST_FMT = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" });
const WEEKDAY: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** The time in India at `now`, rounded down to IST_STEP minutes. */
export function istTime(now: Date): IstTime {
  const parts = Object.fromEntries(IST_FMT.formatToParts(now).map((p) => [p.type, p.value]));
  const minute = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  return { day: WEEKDAY[parts.weekday] ?? 0, minute: minute - (minute % IST_STEP) };
}

/** "2.1305": the route's `ist` param. */
export const istParam = (t: IstTime): string => `${t.day}.${t.minute}`;

export function parseIst(s: string | null | undefined): IstTime | null {
  const m = typeof s === "string" ? /^([0-6])\.(\d{1,4})$/.exec(s) : null;
  if (!m) return null;
  const minute = Number(m[2]);
  return minute < 1440 && minute % IST_STEP === 0 ? { day: Number(m[1]), minute } : null;
}

/** Open at that time by the hours we have: a span of the day, or one from the day before that runs past midnight. */
export function openAt(week: Week | null, at: IstTime): boolean {
  if (!week) return false;
  const m = at.minute;
  for (const [o, c] of week[at.day] ?? []) if (c > o ? m >= o && m < c : m >= o) return true;
  for (const [o, c] of week[(at.day + 6) % 7] ?? []) if (c <= o && m < c) return true;
  return false;
}

/** Every day known and open all day. */
export function allDay(week: Week | null): boolean {
  return !!week && week.every((d) => !!d && d.some(([o, c]) => o === 0 && c === 1440));
}

/* ---------- each turf's facts ---------- */

/** What the cached read keeps per turf (lib/queries/listFacts.ts): only what the list snapshot's rows lack. */
export type ExtraFacts = {
  /** encodeWeek(opening_hours). */
  oh?: string;
  /** coaching_available. */
  c?: 1;
  /** surfaceKind(surface_type). */
  s?: SurfaceKind;
};

/** The extras from one turfs row (id, opening_hours, coaching_available, surface_type), or null when it has none. */
export function extraFactsOf(row: { opening_hours?: unknown; coaching_available?: unknown; surface_type?: unknown }): ExtraFacts | null {
  const out: ExtraFacts = {};
  const oh = row.opening_hours && typeof row.opening_hours === "object" ? encodeWeek(row.opening_hours as OpeningHours) : null;
  if (oh != null) out.oh = oh;
  if (row.coaching_available === true) out.c = 1;
  const s = surfaceKind(typeof row.surface_type === "string" ? row.surface_type : null);
  if (s) out.s = s;
  return Object.keys(out).length ? out : null;
}

/** One turf's facts. `m`: the facets it has for good (open and rated are worked out per query). */
export type TurfFilterFacts = { m: number; week: Week | null; surface: SurfaceKind | null };

/** The card columns (lib/build/reads.ts CARD_COLUMNS) these are made from. */
export type FactRow = {
  amenities?: unknown;
  has_floodlights?: unknown;
  is_covered?: unknown;
  parking_available?: unknown;
  washroom_available?: unknown;
  changing_room_available?: unknown;
  equipment_provided?: unknown;
  /** turfs.claimed: an owner or manager has an active claim (kept by private.sync_turf_claimed). */
  claimed?: unknown;
  is_24x7?: unknown;
  start_time?: unknown;
  end_time?: unknown;
};

/** Amenity words that mean the same as a column (3 Nov: "Flood Lights" 115, "Restroom" 7, "Rental Equipment" 22...). */
const AMENITY: [Facet, RegExp][] = [
  ["lights", /^flood\s*-?\s*lights?$|^floodlit$/],
  ["parking", /\bparking\b/],
  ["washroom", /\b(?:wash\s*rooms?|rest\s*rooms?|toilets?)\b/],
  ["changing", /\bchanging\s*rooms?\b/],
  ["equipment", /^(?:rental\s+)?equipment(?:\s+provided)?$/],
];
const COLUMN: [Facet, keyof FactRow][] = [
  ["lights", "has_floodlights"],
  ["covered", "is_covered"],
  ["parking", "parking_available"],
  ["washroom", "washroom_available"],
  ["changing", "changing_room_available"],
  ["equipment", "equipment_provided"],
  ["claimed", "claimed"],
];

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * The facts of one turf: its row (card columns) and its extras. Hours
 * read the way the turf page reads them (normaliseOpeningHours): the
 * 24x7 flag first, then the researched opening_hours, then the owner's or
 * the row's start and end.
 */
export function filterFactsOf(row: FactRow, extra: ExtraFacts | null | undefined): TurfFilterFacts {
  let m = 0;
  for (const [f, col] of COLUMN) if (row[col] === true) m |= BIT[f];
  const amenities = Array.isArray(row.amenities) ? row.amenities.filter((a): a is string => typeof a === "string").map((a) => a.trim().toLowerCase()) : [];
  for (const [f, re] of AMENITY) if (!(m & BIT[f]) && amenities.some((a) => re.test(a))) m |= BIT[f];
  if (extra?.c) m |= BIT.coaching;
  const week =
    row.is_24x7 === true
      ? weekOf(normaliseOpeningHours(null, { start_time: null, end_time: null, is_24x7: true }))
      : extra?.oh != null
        ? decodeWeek(extra.oh)
        : weekOf(normaliseOpeningHours(null, { start_time: str(row.start_time), end_time: str(row.end_time) }));
  if (allDay(week)) m |= BIT["24h"];
  return { m, week, surface: extra?.s ?? null };
}

/**
 * The lowest listed price per hour the card's price rule gives (cardPrice
 * with the sport chip or page): a per-slot price as per hour from its slot
 * length; a per-person price, a reported one or none, null.
 */
export function hourlyPrice(turf: Turf, sport: CardSport | null): number | null {
  const s = cardPrice(turf, sport);
  if (s.kind !== "real" || s.min == null) return null;
  if (s.unit === "/hr") return s.min;
  if (turf.price_unit === "per_slot" && typeof turf.slot_minutes === "number" && turf.slot_minutes >= 15) return Math.round((s.min * 60) / turf.slot_minutes);
  return null;
}

/** The facets this turf has at `at` (open and rated included), as bits. free: its owner's free hours show now (the route's cached read). */
export function facetMask(turf: Pick<Turf, "rating" | "total_reviews">, facts: TurfFilterFacts | undefined, at: IstTime | null, free = false): number {
  let m = facts?.m ?? 0;
  if (free) m |= BIT.free;
  if (Number(turf.rating) >= RATED_MIN && Number(turf.total_reviews) > 0) m |= BIT.rated;
  if (at && facts && openAt(facts.week, at)) m |= BIT.open;
  return m;
}

export function maskOf(facets: readonly Facet[]): number {
  let m = 0;
  for (const f of facets) m |= BIT[f];
  return m;
}

/* ---------- the sheet's words ---------- */

export const FACET_LABELS: Record<Facet, string> = {
  // = lib/availability/free.ts FREE_FILTER_LABEL (lib/turfList/filters.test.ts ties them).
  free: "Free hours marked",
  open: "Open now",
  "24h": "Open 24 hours",
  lights: "Floodlights",
  covered: "Covered",
  parking: "Parking",
  washroom: "Washroom",
  changing: "Changing room",
  rated: "4.5+ on Google",
  coaching: "Coaching",
  equipment: "Equipment provided",
  claimed: "Claimed by owner",
};

/** ₹1,000 */
export const rupees = (n: number): string => `₹${n.toLocaleString("en-IN")}`;
