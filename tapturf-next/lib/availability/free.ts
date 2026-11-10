import type { SlotHours, SlotKey } from "./slots";
import { DAYS_SHOWN, agoText, clockLabel, freeDays, isFresh, isSlotKey, istDate, keyTime, slotDays, slotKey } from "./slots";
import { contactFieldsOf, hasUsableContact } from "../utils/contact";

// Relative imports only, so node --test runs this (lib/availability/free.test.ts).

/**
 * Free hours nearby: every turf whose free slots players see right now, in
 * one city or all of India, for the lists' "Free hours marked" filter (GET
 * /api/turfs/list f=free) and Ask TapTurf ("which turf is free near me"),
 * read once a minute at most by the one cached reader
 * (lib/queries/freeSlots.ts) from public.free_slots_now
 * (supabase/migrations/20261111_free_slots_nearby.sql), which gives each
 * such turf's marks and hours as public.turf_availability would, turf by
 * turf. Which hours are free is worked out here with the turf page card's
 * own maths (slots.ts slotDays and freeDays: an hour with no mark is free),
 * and a turf whose page has no number to call or WhatsApp is left out, as
 * the page shows the card only beside Call or WhatsApp (hasUsableContact).
 *
 * Nothing here says a turf is available for sure: "marked free by the
 * owner", and the turf confirms.
 */

/** The window the lists and most of Ask read: the next 36 hours (= public.free_slots_now's p_hours default). */
export const FREE_WINDOW_HOURS = 36;
/** The longest window (= private.slots_ahead, 8 days): Ask's "on Saturday". */
export const FREE_WINDOW_MAX_HOURS = 192;
/** The most turfs the database lists (the migration's limit 200). */
export const FREE_TURFS_MAX = 200;
/** Free start times kept per turf in an answer. */
export const FREE_KEYS_MAX = 24;
/** Times one card line shows; the rest are "+N". */
export const FREE_LINE_TIMES = 4;
/** The anchor on the turf page the free hours link to (components/turf/FreeSlotsCard.tsx). */
export const FREE_SLOTS_HASH = "#free-slots";

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** One turf as the database read gives it. */
export type FreeRow = {
  id: string;
  slug: string | null;
  name: string;
  area: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  /** The owner's last tap or All correct. */
  updatedAt: string;
  /** It takes booking requests on TapTurf now (turf_takes_requests). */
  requests: boolean;
  /** Its Booked marks in the window. */
  booked: SlotKey[];
  /**
   * The read's horizon (ms): its own clock plus the window it was read for.
   * Booked marks are known only for hours that start before it, so no hour
   * at or past it is ever called free (freeCardOf), however much later the
   * app's clock is than the read (a copy kept a minute, or five after a
   * failed read).
   */
  bookedUntil: number;
  hours: SlotHours;
};

/** The read: the database's clock and the turfs. */
export type FreeAnswer = { now: string; rows: FreeRow[] };

/** A business day's free start times (an after-midnight hour belongs to the day before, as on the turf page). night: last night's. */
export type FreeDay = { date: string; night?: true; keys: SlotKey[] };

/** What a card carries: when the owner last updated, whether the turf takes requests, the free start times still to come. */
export type FreeCard = { updatedAt: string; requests: boolean; days: FreeDay[] };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * public.free_slots_now's answer for a window of `hours` (as asked of it), checked; null for anything malformed. A turf
 * row that isn't one is left out. Each row's bookedUntil is the read's clock plus that window, held to 1 to 192 hours as
 * the database holds p_hours: its booked keys stop there.
 */
export function parseFreeAnswer(json: unknown, hours: number = FREE_WINDOW_HOURS): FreeAnswer | null {
  if (!isObj(json) || typeof json.now !== "string" || !Number.isFinite(Date.parse(json.now)) || !Array.isArray(json.turfs)) return null;
  const bookedUntil = Date.parse(json.now) + Math.max(1, Math.min(Math.trunc(hours) || FREE_WINDOW_HOURS, FREE_WINDOW_MAX_HOURS)) * HOUR;
  const rows: FreeRow[] = [];
  for (const t of json.turfs.slice(0, FREE_TURFS_MAX)) {
    if (!isObj(t) || typeof t.id !== "string" || !UUID.test(t.id) || typeof t.name !== "string") continue;
    const updatedAt = str(t.updated_at);
    if (!updatedAt || !Number.isFinite(Date.parse(updatedAt)) || !isObj(t.hours)) continue;
    const h = t.hours;
    rows.push({
      id: t.id,
      slug: str(t.slug),
      name: t.name,
      area: str(t.area),
      city: str(t.city),
      lat: num(t.lat),
      lng: num(t.lng),
      updatedAt,
      requests: t.requests === true,
      booked: Array.isArray(t.booked) ? t.booked.filter(isSlotKey) : [],
      bookedUntil,
      hours: {
        opening_hours: isObj(h.opening_hours) ? (h.opening_hours as SlotHours["opening_hours"]) : null,
        start_time: str(h.start_time),
        end_time: str(h.end_time),
        is_24x7: typeof h.is_24x7 === "boolean" ? h.is_24x7 : null,
        closed_days: str(h.closed_days),
      },
    });
  }
  return { now: json.now, rows };
}

/** A turfs row's numbers (owner_phone, contact_info, landline_phone, whatsapp_phone): whether its page shows Call or WhatsApp. */
export function pageHasNumber(raw: { owner_phone?: unknown; contact_info?: unknown; landline_phone?: unknown; whatsapp_phone?: unknown }): boolean {
  return hasUsableContact(contactFieldsOf(raw));
}

/**
 * A turf's free start times in [fromMs, untilMs) still to come at nowMs, by business day, at most
 * FREE_KEYS_MAX: the turf page's days (slotDays, freeDays: open days, hours
 * still to come, no Booked mark). The window ends at the read's horizon
 * (row.bookedUntil) at the latest: past it the read has no Booked marks,
 * and an hour with no mark would read as free. Null when the marks are not
 * fresh at nowMs or no hour in the window is free.
 */
export function freeCardOf(
  row: Pick<FreeRow, "updatedAt" | "requests" | "booked" | "bookedUntil" | "hours">,
  nowMs: number,
  untilMs: number,
  fromMs: number = nowMs,
): FreeCard | null {
  untilMs = Math.min(untilMs, row.bookedUntil);
  if (!isFresh(row.updatedAt, nowMs) || !(untilMs > nowMs) || !(untilMs > fromMs)) return null;
  const count = Math.max(DAYS_SHOWN, Math.ceil((untilMs - nowMs) / DAY) + 1);
  const booked = new Set(row.booked);
  const days: FreeDay[] = [];
  let left = FREE_KEYS_MAX;
  for (const d of freeDays(slotDays(row.hours, nowMs, count), booked)) {
    if (left <= 0) break;
    const keys = d.free.filter((s) => s.ms > nowMs && s.ms >= fromMs && s.ms < untilMs).slice(0, left).map((s) => s.key);
    if (!keys.length) continue;
    left -= keys.length;
    days.push(d.night ? { date: d.date, night: true, keys } : { date: d.date, keys });
  }
  return days.length ? { updatedAt: row.updatedAt, requests: row.requests, days } : null;
}

/** Each turf with a free hour in [nowMs, nowMs + hours): its card, by id, in the read's order (most recently updated first). */
export function freeCards(rows: readonly FreeRow[], nowMs: number, hours: number = FREE_WINDOW_HOURS): Map<string, FreeCard> {
  const out = new Map<string, FreeCard>();
  for (const r of rows) {
    const c = freeCardOf(r, nowMs, nowMs + hours * HOUR);
    if (c) out.set(r.id, c);
  }
  return out;
}

/** A card as the list route and Ask send it, checked (a card from the browser's saved list, or an older answer); null if not one. */
export function parseFreeCard(x: unknown): FreeCard | null {
  if (!isObj(x) || typeof x.updatedAt !== "string" || !Array.isArray(x.days)) return null;
  const days: FreeDay[] = [];
  for (const d of x.days) {
    if (!isObj(d) || typeof d.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Array.isArray(d.keys)) continue;
    const keys = d.keys.filter(isSlotKey);
    if (keys.length) days.push(d.night === true ? { date: d.date, night: true, keys } : { date: d.date, keys });
  }
  return { updatedAt: x.updatedAt, requests: x.requests === true, days };
}

// ── Words ──

/** What the Filters sheet and the pills call it. */
export const FREE_FILTER_LABEL = "Free hours marked";
/** The line under it in the sheet. */
export const FREE_FILTER_HINT = "Hours the turf's owner marked free on TapTurf";
/** On a card of a turf that takes booking requests (its page's free hours open the request sheet). */
export const FREE_REQUEST = "Request a free hour";
/** The owners' line under an empty list. */
export const OWNER_NUDGE = { lead: "Own a turf?", link: "Mark your free hours on myTapturf", href: "/my" } as const;

/** "Marked free by the owner 2 h ago" */
export function markedLine(updatedAt: string, nowMs: number): string {
  return `Marked free by the owner ${agoText(updatedAt, nowMs)}`;
}

/** A slot key's clock: "2026-11-10T19:00" is "7 PM". */
export function keyLabel(key: SlotKey): string {
  return clockLabel(Number(key.slice(11, 13)) * 60 + Number(key.slice(14, 16)));
}

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/**
 * When a card's first free hour is, at nowMs, by the hour itself (not its
 * business day, so an overnight turf's 12 AM and a 24-hour turf's read the
 * same): "today"; "tonight" for an hour before 5 AM that is tonight's (after
 * midnight, or now in the small hours); "tomorrow"; else its weekday ("Thu").
 */
export function dayWord(key: SlotKey, nowMs: number): string {
  const today = istDate(nowMs);
  const date = key.slice(0, 10);
  const small = Number(key.slice(11, 13)) < 5;
  const nowSmall = Number(slotKey(nowMs).slice(11, 13)) < 5;
  if (date === today) return small && nowSmall ? "tonight" : "today";
  if (date === addDays(today, 1)) return small && !nowSmall ? "tonight" : "tomorrow";
  return WEEK[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export type FreeLine = {
  /** "Free today" */
  lead: string;
  /** "6 PM", "7 PM": at most FREE_LINE_TIMES. */
  times: string[];
  /** Times on that day past those shown. */
  more: number;
  /** "Free today: 6 PM, 7 PM, 8 PM, 9 PM +2" */
  text: string;
  /** "Marked free by the owner 2 h ago" */
  marked: string;
  requests: boolean;
};

/**
 * The card's line at nowMs: the first day with a free hour still to come
 * and its times. Null when the marks stopped being fresh or every hour has
 * started: a card read a while ago says nothing then, rather than a time
 * that has gone.
 */
export function freeLine(card: FreeCard | null | undefined, nowMs: number): FreeLine | null {
  if (!card || !isFresh(card.updatedAt, nowMs)) return null;
  for (const [i, d] of card.days.entries()) {
    const keys = d.keys.filter((k) => keyTime(k) > nowMs);
    if (!keys.length) continue;
    // Hours that run on past midnight into the next day's (a 24-hour turf's 11 PM, 12 AM, 1 AM) read as one run, as
    // an overnight turf's after-midnight hours do: "Free today: 11 PM, 12 AM, 1 AM".
    for (const k of card.days[i + 1]?.keys ?? []) {
      if (keys.length >= FREE_LINE_TIMES || keyTime(k) - keyTime(keys[keys.length - 1]) !== HOUR) break;
      keys.push(k);
    }
    const times = keys.slice(0, FREE_LINE_TIMES).map(keyLabel);
    const more = keys.length - times.length;
    const lead = `Free ${dayWord(keys[0], nowMs)}`;
    return { lead, times, more, text: `${lead}: ${times.join(", ")}${more > 0 ? ` +${more}` : ""}`, marked: markedLine(card.updatedAt, nowMs), requests: card.requests };
  }
  return null;
}

/** The turf page's free hours: its path and the card's anchor. */
export function freeHref(turfPath: string): string {
  return `${turfPath}${FREE_SLOTS_HASH}`;
}

/**
 * The empty list's first line: "No turf in Pune has marked free hours yet."
 * otherFilters: anything else narrows the list (the sheet's other filters,
 * a sport chip, a search). noun: "turf", or "court" on a court sport's
 * page; sport: a city+sport page's sport ("No football turf in Pune ...").
 */
export function noFreeTitle(cityLabel: string | null, otherFilters: boolean, noun: string = "turf", sport: string | null = null): string {
  const what = `${sport ? `${sport.toLowerCase()} ` : ""}${noun}`;
  const where = cityLabel ? ` in ${cityLabel}` : "";
  return otherFilters ? `No ${what}${where} with these filters has marked free hours yet.` : `No ${what}${where} has marked free hours yet.`;
}
