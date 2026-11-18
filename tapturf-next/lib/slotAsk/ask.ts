/**
 * "Ask for a slot" (18 Nov 2026): on a turf page the player picks a day
 * and a time, and WhatsApp opens with the question already written to the
 * turf (components/turf/SlotAskSheet.tsx; the message is
 * lib/slotAsk/message.ts). The turf answers on WhatsApp as it always has:
 * no owner sign-up, no calendar to keep, nothing paid on TapTurf.
 *
 * This file is what an ask is, checked the same way by the sheet that
 * sends it and the route that stores it (POST /api/slot-ask,
 * lib/slotAsk/route.ts; private.slot_asks, 20261118_slot_asks.sql): the
 * turf, the day and time asked for, how long, the sport and the group
 * size. Nothing about the player goes with it: no account, no name, no
 * number, no device tag, and never the message or the chat. Pure, no
 * imports (npm run test:slotask), and small: the turf page's buttons load
 * it, the sheet's own code only on the first tap.
 */

/** How long a player may ask for, in minutes: 1 h (the default), 1.5 h, 2 h, 3 h. */
export const ASK_MINUTES = [60, 90, 120, 180] as const;
export type AskMinutes = (typeof ASK_MINUTES)[number];
export const DEFAULT_MINUTES: AskMinutes = 60;

/** The group size the stepper offers (blank by default). The table takes 1 to 60. */
export const PLAYERS_MIN = 2;
export const PLAYERS_MAX = 30;
export const PLAYERS_STORED_MAX = 60;

/** A sport as it is stored and said in the message: the turf's own label, lower case. */
const SPORT = /^[a-z0-9][a-z0-9 &/().+-]{0,29}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type SlotAsk = {
  turf: string;
  /** India's calendar date of the start, "2026-11-21": an after-midnight hour has the next day's date. */
  date: string;
  /** 0 to 23, India time. */
  hour: number;
  /** 0 unless the turf opens on a half hour (its slots then start at :30). */
  minute: number;
  minutes: AskMinutes;
  /** Lower case; null when the turf lists no sport. */
  sport: string | null;
  /** Null unless the player gave one. */
  players: number | null;
  signedIn: boolean;
};

/** A real calendar date in YYYY-MM-DD (no 2026-02-30). */
export function isDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

const whole = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** A turf's sport label as the ask says it: "Box Cricket" is "box cricket"; null for anything that is no label. */
export function sportWord(label: unknown): string | null {
  if (typeof label !== "string") return null;
  const s = label.replace(/\s+/g, " ").trim().toLowerCase();
  return SPORT.test(s) ? s : null;
}

/**
 * A POST body as an ask; null for anything that isn't exactly one
 * ({turf, date, hour, minute?, minutes, sport?, players?, signed?}).
 * Refused whole, never trimmed into something the player didn't pick.
 * Whether the date is one a player can ask about (India's today to a week
 * on) and whether the turf lists the sport is the database's to say.
 */
export function parseAsk(raw: unknown): SlotAsk | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!["turf", "date", "hour", "minute", "minutes", "sport", "players", "signed"].includes(k)) return null;
  if (typeof o.turf !== "string" || !UUID.test(o.turf)) return null;
  if (!isDate(o.date) || !whole(o.hour, 0, 23)) return null;
  const minute = o.minute == null ? 0 : whole(o.minute, 0, 59) ? o.minute : -1;
  if (minute < 0) return null;
  if (!(ASK_MINUTES as readonly unknown[]).includes(o.minutes)) return null;
  const sport = o.sport == null ? null : typeof o.sport === "string" && SPORT.test(o.sport) ? o.sport : undefined;
  const players = o.players == null ? null : whole(o.players, 1, PLAYERS_STORED_MAX) ? o.players : undefined;
  if (sport === undefined || players === undefined) return null;
  if (o.signed != null && typeof o.signed !== "boolean") return null;
  return { turf: o.turf.toLowerCase(), date: o.date, hour: o.hour, minute, minutes: o.minutes as AskMinutes, sport, players, signedIn: o.signed === true };
}

/** The body the sheet sends for an ask (what parseAsk reads back). */
export function askBody(a: SlotAsk): Record<string, unknown> {
  return {
    turf: a.turf,
    date: a.date,
    hour: a.hour,
    ...(a.minute ? { minute: a.minute } : {}),
    minutes: a.minutes,
    ...(a.sport ? { sport: a.sport } : {}),
    ...(a.players != null ? { players: a.players } : {}),
    signed: a.signedIn,
  };
}

// ---------------------------------------------------------------------------
// The choice a signed-out player made, kept across the sign-in

/**
 * A signed-out player picks first; Send then opens the sign-in (the same
 * gate as the page's Call and WhatsApp buttons), which is another page.
 * What they picked waits in this tab's sessionStorage under DRAFT_KEY and
 * the sheet opens with it once they are back, signed in, so Send is one
 * tap. First-party, no identifier, never sent anywhere; gone when it is
 * used, when the sheet is closed, with the tab, or after DRAFT_MAX_MS.
 */
export const DRAFT_KEY = "tapturf_slot_ask_draft_v1";
export const DRAFT_MAX_MS = 30 * 60_000;

export type AskDraft = {
  turf: string;
  /** The slot's key, India time: "2026-11-21T19:00". */
  key: string;
  minutes: AskMinutes;
  /** The sport's label as the turf lists it. */
  sport: string | null;
  players: number | null;
  /** When Send was tapped. */
  at: number;
};

const KEY = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

/** The stored draft for this turf while it is under DRAFT_MAX_MS old; null for none, another turf's, an old one or anything that isn't one. */
export function readDraft(text: string | null, turf: string, now: number): AskDraft | null {
  if (!text) return null;
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    if (!o || typeof o !== "object" || typeof o.turf !== "string" || o.turf.toLowerCase() !== turf.toLowerCase()) return null;
    if (typeof o.key !== "string" || !KEY.test(o.key) || !isDate(o.key.slice(0, 10))) return null;
    if (!(ASK_MINUTES as readonly unknown[]).includes(o.minutes)) return null;
    if (typeof o.at !== "number" || !Number.isFinite(o.at) || o.at > now || now - o.at > DRAFT_MAX_MS) return null;
    const sport = typeof o.sport === "string" && o.sport.length <= 60 ? o.sport : null;
    const players = whole(o.players, PLAYERS_MIN, PLAYERS_MAX) ? o.players : null;
    return { turf: o.turf.toLowerCase(), key: o.key, minutes: o.minutes as AskMinutes, sport, players, at: o.at };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// What the tap tells "Did you get a slot?"

/** The time a slot ask was for, noted with the tap so the card can ask about it (lib/outcome/prompt.ts Tap.ask). */
export type AskedTime = { date: string; hour: number; minute: number };

/** A tap's noted time; null for anything that isn't one. */
export function askedTime(raw: unknown): AskedTime | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isDate(o.date) || !whole(o.hour, 0, 23)) return null;
  const minute = o.minute == null ? 0 : o.minute;
  return whole(minute, 0, 59) ? { date: o.date, hour: o.hour, minute } : null;
}
