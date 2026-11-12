import { KINDS, istDay, type Kind } from "./outcome";

/**
 * When the "Did you get a slot?" card may show (components/outcome/OutcomeCard.tsx),
 * all of it here so it can't nag: the rules, and what the device remembers
 * for them. A Call or WhatsApp tap that opened the dialer or WhatsApp is
 * noted for this tab (sessionStorage, TAP_KEY; a newer tap replaces it).
 * The card asks about it once, when the player comes back: the page was
 * hidden, or the window lost focus, after the tap, and they return between
 * MIN_AWAY_MS and MAX_AGE_MS after it. A return sooner than that is not a
 * return (nobody got a slot in 15 seconds): the tap waits for the next one.
 *
 * Never: twice for one tap; for a turf answered about in the last
 * SAME_TURF_MS; more than MAX_ASKS_PER_DAY times a day (India's day) on
 * one device; for SNOOZE_MS after the card was closed with its ✕; on the
 * admin, myTapturf, owner report and email pages. A tap that may not be
 * asked about for one of the device's reasons is forgotten, so it never
 * pops up later; on a page where the card never shows it just waits.
 *
 * The device's memory (localStorage, MEMORY_KEY) is only those marks: when
 * the snooze ends, which turfs were answered about and when, and today's
 * count. First-party, no identifier, never sent anywhere. Pure: no storage,
 * no clock of its own (lib/outcome/device.ts reads and writes). Relative
 * imports only (npm run test:outcome).
 */

export const TAP_KEY = "tapturf_contact_tap_v1";
export const MEMORY_KEY = "tapturf_contact_asks_v1";

/** Back sooner than this after the tap: not asked (the dialer was closed, the chat never opened). */
export const MIN_AWAY_MS = 15_000;
/** Back later than this: the tap is too old to ask about. */
export const MAX_AGE_MS = 3 * 60 * 60_000;
/** After an answer about a turf, that turf is not asked about again for this long. */
export const SAME_TURF_MS = 7 * 24 * 60 * 60_000;
/** The card's ✕: no asks at all for this long. */
export const SNOOZE_MS = 3 * 24 * 60 * 60_000;
/** Asks shown on one device in one India day, at most. */
export const MAX_ASKS_PER_DAY = 2;
/** Turfs remembered as answered, at most (the oldest go first). */
export const ANSWERED_MAX = 30;

/** The tap this tab is waiting to ask about. */
export type Tap = {
  turf: string;
  name: string;
  kind: Kind;
  source: string;
  /** When it was tapped. */
  at: number;
  /** The page was hidden, or the window lost focus, since the tap. */
  left: boolean;
  signedIn: boolean;
};

export type Memory = {
  /** No asks before this time (0: no snooze). */
  snoozeUntil: number;
  /** Turf id: when its last answer was given. */
  answered: Record<string, number>;
  /** The India day `asks` counts. */
  day: string;
  asks: number;
};

export const EMPTY_MEMORY: Memory = { snoozeUntil: 0, answered: {}, day: "", asks: 0 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const time = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** A new tap: it replaces whatever was waiting (only the latest tap counts). Null when it names no turf. */
export function newTap(t: { turf: string; name: string; kind: Kind; source: string; signedIn: boolean }, now: number): Tap | null {
  const name = t.name.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!UUID.test(t.turf) || !name || !KINDS.includes(t.kind)) return null;
  return { turf: t.turf.toLowerCase(), name, kind: t.kind, source: /^[a-z0-9_]{1,40}$/.test(t.source) ? t.source : "unknown", at: now, left: false, signedIn: t.signedIn };
}

/** The stored tap; null for none or anything that isn't one (it is then cleared by the caller). */
export function readTap(text: string | null): Tap | null {
  if (!text) return null;
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    if (!o || typeof o !== "object" || typeof o.turf !== "string" || typeof o.name !== "string" || typeof o.source !== "string" || !time(o.at)) return null;
    const t = newTap({ turf: o.turf, name: o.name, kind: o.kind as Kind, source: o.source, signedIn: o.signedIn === true }, o.at);
    return t && { ...t, left: o.left === true };
  } catch {
    return null;
  }
}

/** The stored memory, with what has run out left behind: turfs answered over a week ago, a past snooze, another day's count. */
export function readMemory(text: string | null, now: number): Memory {
  if (!text) return { ...EMPTY_MEMORY, answered: {} };
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    if (!o || typeof o !== "object") return { ...EMPTY_MEMORY, answered: {} };
    const answered: Record<string, number> = {};
    const raw = o.answered && typeof o.answered === "object" ? (o.answered as Record<string, unknown>) : {};
    for (const [id, at] of Object.entries(raw)) if (UUID.test(id) && time(at) && at <= now && now - at < SAME_TURF_MS) answered[id.toLowerCase()] = at;
    const today = istDay(now);
    const asks = o.day === today && typeof o.asks === "number" && Number.isInteger(o.asks) && o.asks > 0 ? o.asks : 0;
    // A snooze further off than one can be (a clock that was wrong) is not kept.
    const snoozeUntil = time(o.snoozeUntil) && o.snoozeUntil > now && o.snoozeUntil - now <= SNOOZE_MS ? o.snoozeUntil : 0;
    return { snoozeUntil, answered, day: today, asks };
  } catch {
    return { ...EMPTY_MEMORY, answered: {} };
  }
}

/** Pages where the card never shows: the admin, myTapturf, the owner's report and the email pages. */
export function quietPath(path: string): boolean {
  const p = path.toLowerCase();
  return ["/admin", "/my", "/report", "/email"].some((x) => p === x || p.startsWith(`${x}/`));
}

/** The player left the page (it was hidden, or its window lost focus) after the tap. */
export function leftAfterTap(tap: Tap | null): Tap | null {
  return tap && !tap.left ? { ...tap, left: true } : tap;
}

export type Decision =
  /** Show the card for this tap now. */
  | { do: "ask"; tap: Tap }
  /** Not now; the tap stays (`tap` is it, changed or not). */
  | { do: "wait"; tap: Tap | null; why: "no_tap" | "not_left" | "too_soon" | "quiet_page" | "busy" }
  /** Never for this tap: forget it. */
  | { do: "forget"; why: "too_old" | "snoozed" | "same_turf" | "day_cap" };

/**
 * What to do when the player is back on a page (it became visible, its
 * window got focus, or it loaded): ask, wait or forget the tap. `busy`: the
 * bottom of the screen is taken (the cookie card, the Ask panel), so not now.
 */
export function decide(v: { tap: Tap | null; memory: Memory; now: number; path: string; busy?: boolean }): Decision {
  const { tap, memory, now } = v;
  if (!tap) return { do: "wait", tap: null, why: "no_tap" };
  if (!tap.left) return { do: "wait", tap, why: "not_left" };
  const away = now - tap.at;
  if (away > MAX_AGE_MS || away < 0) return { do: "forget", why: "too_old" };
  // Straight back: that was not a call or a chat. The next time they leave and return may be.
  if (away < MIN_AWAY_MS) return { do: "wait", tap: { ...tap, left: false }, why: "too_soon" };
  if (quietPath(v.path)) return { do: "wait", tap, why: "quiet_page" };
  if (memory.snoozeUntil > now) return { do: "forget", why: "snoozed" };
  const last = memory.answered[tap.turf];
  if (last !== undefined && now - last < SAME_TURF_MS) return { do: "forget", why: "same_turf" };
  if (memory.day === istDay(now) && memory.asks >= MAX_ASKS_PER_DAY) return { do: "forget", why: "day_cap" };
  if (v.busy) return { do: "wait", tap, why: "busy" };
  return { do: "ask", tap };
}

/** The card was shown: one more ask today. (The tap is forgotten by the caller: one ask per tap.) */
export function afterAsk(m: Memory, now: number): Memory {
  const today = istDay(now);
  return { ...m, day: today, asks: (m.day === today ? m.asks : 0) + 1 };
}

/** An answer was given about a turf (Still deciding is one): not asked about it again for a week. */
export function afterAnswer(m: Memory, turf: string, now: number): Memory {
  const answered = Object.entries({ ...m.answered, [turf.toLowerCase()]: now })
    .sort((a, b) => b[1] - a[1])
    .slice(0, ANSWERED_MAX);
  return { ...m, answered: Object.fromEntries(answered) };
}

/** The card's ✕: nothing is asked for three days. */
export function afterClose(m: Memory, now: number): Memory {
  return { ...m, snoozeUntil: now + SNOOZE_MS };
}
