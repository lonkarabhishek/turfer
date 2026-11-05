import type { Turf } from "../../types/turf";
import { normaliseOpeningHours, isAllDaySpan, isClosedDay, type DayName } from "../utils/hours";
import { BOOKING_LINE, bookingLine } from "../turfPage/noContact";

// Relative imports only, so node --test runs this (lib/availability/slots.test.ts).
export { contactLinks } from "../utils/contact";
export { BOOKING_LINE };

/**
 * Free slots: the one place that works out which hours of a turf are slots,
 * in India time, for the owner's section on myTapturf
 * (components/my/FreeSlots.tsx), the public read (GET /api/availability/<id>,
 * lib/availability/route.ts) and the turf page's card
 * (components/turf/FreeSlotsCard.tsx). The database keeps only marks
 * (supabase/migrations/20261105_turf_availability.sql): an hour with no mark
 * is free.
 *
 * India time is fixed +05:30 arithmetic on UTC (getUTC*, toISOString), never
 * the device's own time zone, so a phone set to another zone shows the same
 * hours as everyone else.
 *
 * The constants are the site owner's to change. FRESH_HOURS, AHEAD_DAYS,
 * MAX_CHANGES and MAX_MARKS are also in the migration (private.slots_fresh,
 * private.slots_ahead, the "> 100" in private.turf_slots_apply,
 * private.slots_max); a test ties them together.
 */

/** One-hour slots. */
export const SLOT_MINUTES = 60;
/** Players see the slots for this long after the owner's last tap or All correct (= private.slots_fresh()). */
export const FRESH_HOURS = 24;
/** The owner's line turns amber this many hours before players stop seeing the slots. */
export const FRESH_WARN_HOURS = 4;
/** Today, Tomorrow and 5 more days (plus last night's after-midnight hours, when some are left). */
export const DAYS_SHOWN = 7;
/** How far ahead a mark may be (= private.slots_ahead()): the 7 days shown and the last one's after-midnight hours. */
export const AHEAD_DAYS = 8;
/** The most marks in one save (= the "> 100" in private.turf_slots_apply). */
export const MAX_CHANGES = 100;
/** The most marks a turf holds in the AHEAD_DAYS window, and the public read lists (= private.slots_max()): 8 days of half-hour starts, more than any grid has. */
export const MAX_MARKS = 384;
/** How long the whole-day Undo stays. */
export const UNDO_MS = 8000;
/** India: UTC+05:30, no daylight saving. */
export const IST_OFFSET_MIN = 330;
/** The turf page reads the slots again when the tab comes back after this long. */
export const REFETCH_AFTER_MS = 300_000;

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const IST_MS = IST_OFFSET_MIN * MIN_MS;
const WEEK: DayName[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** The same as private.slot_at in the migration. */
const KEY_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

/** A slot's start in India time, "2026-11-05T19:00"; an after-midnight hour has the next calendar date. */
export type SlotKey = string;
export type SlotStatus = "free" | "booked";
export type SlotChange = { at: SlotKey; status: SlotStatus };
export type SlotHours = Pick<Turf, "opening_hours" | "start_time" | "end_time" | "is_24x7" | "closed_days">;
export type Slot = {
  key: SlotKey;
  ms: number;
  /** "7 PM", "6:30 AM", "12 AM" */
  label: string;
  /** "7 PM to 8 PM" */
  range: string;
  /** Starts at or after midnight, as part of the day before's opening hours. */
  afterMidnight: boolean;
};
export type SlotDay = {
  /** The business day, YYYY-MM-DD in India: an after-midnight hour belongs to the day before. */
  date: string;
  weekday: DayName;
  /** "Fri night" | "Today" | "Tomorrow" | "Sat" */
  chip: string;
  /** Last night's after-midnight hours that are still to come (the chip before Today). */
  night: boolean;
  /** "Friday night, after midnight" | "Today, Thu 5 Nov" | "Tomorrow, Fri 6 Nov" | "Saturday 7 Nov" */
  heading: string;
  state: "open" | "closed" | "unknown";
  /** "6 AM to 2 AM" | "6 AM to 8 AM, 4 PM to 12 AM" | "24 hours"; null unless open. */
  open: string | null;
  /** The slots still to come (start after now), in time order. */
  slots: Slot[];
};
export type PublicAvailability = { updatedAt: string; now: string; booked: SlotKey[] };
export type OwnerSlots = {
  ok: true;
  now: string;
  updated_at: string | null;
  grounds: number | null;
  hours: SlotHours;
  booked: SlotKey[];
  saved?: number;
  changed?: number;
  skipped?: number;
};

// ── India time ──

/** The India calendar date of an instant, YYYY-MM-DD. */
export function istDate(ms: number): string {
  return new Date(ms + IST_MS).toISOString().slice(0, 10);
}

/** The slot key of an instant: its India date and time to the minute. */
export function slotKey(ms: number): SlotKey {
  return new Date(ms + IST_MS).toISOString().slice(0, 16);
}

/** A slot key the database takes: the shape, and a real date and time (no 2026-02-30, no 24:00). */
export function isSlotKey(s: unknown): s is SlotKey {
  if (typeof s !== "string" || !KEY_RE.test(s)) return false;
  const t = Date.parse(`${s}:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 16) === s;
}

/** The instant a slot key names; NaN for anything that is not one. */
export function keyTime(key: SlotKey): number {
  return isSlotKey(key) ? Date.parse(`${key}:00Z`) - IST_MS : NaN;
}

/** A minute of the day as a clock: 0 "12 AM", 390 "6:30 AM", 720 "12 PM", 1140 "7 PM" (past 1440 wraps). */
export function clockLabel(minuteOfDay: number): string {
  const m = ((Math.round(minuteOfDay) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

const dayStart = (date: string) => Date.parse(`${date}T00:00:00Z`) - IST_MS;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (date: string): DayName => WEEK[new Date(`${date}T00:00:00Z`).getUTCDay()];
/** "Thu 5 Nov" */
const shortDate = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEK[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
/** "Saturday 7 Nov" */
const longDate = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEK[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

// ── Hours ──

/**
 * A weekday's opening hours as minute spans of its business day, from the
 * hours the turf page shows (lib/utils/hours.ts normaliseOpeningHours: the
 * owner's 24 hours flag, else researched opening_hours, else the owner's
 * opening and closing time). A close at or before the open runs past
 * midnight (6 AM to 2 AM is [360, 1560]); a close of 23:59 is midnight.
 * No row, or a row with no hours we can read: unknown. Closed that day
 * (the row says so, or closed_days names it): closed.
 */
export function daySpans(h: SlotHours, day: DayName): { state: "open" | "closed" | "unknown"; spans: [number, number][] } {
  const row = normaliseOpeningHours(h.opening_hours, { start_time: h.start_time, end_time: h.end_time, is_24x7: h.is_24x7 }).find((r) => r.day === day);
  if (!row) return { state: "unknown", spans: [] };
  if (row.closed || isClosedDay(h.closed_days, day)) return { state: "closed", spans: [] };
  if (!row.spans.length) return { state: "unknown", spans: [] };
  const spans = row.spans.map((s): [number, number] => {
    if (isAllDaySpan(s)) return [0, 1440];
    const o = minutes(s.opens);
    let c = s.closes.slice(0, 5) === "23:59" ? 1440 : minutes(s.closes);
    if (c <= o) c += 1440;
    return [o, c];
  });
  return { state: "open", spans };
}

/** The slots of one business day, whole hours from each opening, in time order. */
function slotsOf(date: string, spans: [number, number][]): Slot[] {
  const base = dayStart(date);
  const byKey = new Map<string, Slot>();
  for (const [o, c] of spans) {
    for (let s = o; s + SLOT_MINUTES <= c; s += SLOT_MINUTES) {
      const ms = base + s * MIN_MS;
      const key = slotKey(ms);
      if (!byKey.has(key)) byKey.set(key, { key, ms, label: clockLabel(s), range: `${clockLabel(s)} to ${clockLabel(s + SLOT_MINUTES)}`, afterMidnight: s >= 1440 });
    }
  }
  return [...byKey.values()].sort((a, b) => a.ms - b.ms);
}

const openText = (spans: [number, number][]) =>
  spans.map(([o, c]) => (o === 0 && c === 1440 ? "24 hours" : `${clockLabel(o)} to ${clockLabel(c)}`)).join(", ");

/** True when some weekday is open with at least one slot: else the owner picks the hours first. */
export function hasUsableHours(h: SlotHours): boolean {
  return WEEK.some((day) => {
    const { state, spans } = daySpans(h, day);
    return state === "open" && spans.some(([o, c]) => c - o >= SLOT_MINUTES);
  });
}

/**
 * The days the owner and players pick from: Today, Tomorrow, then weekdays,
 * `count` in all, India calendar days as the turf page's hours table marks
 * Today. Each holds its business day's slots still to come, after-midnight
 * ones included. Before them, while last night's after-midnight hours are
 * not over, a "Fri night" day with what is left of them. An hour two days'
 * hours both cover stays with the earlier day.
 */
export function slotDays(h: SlotHours, nowMs: number, count: number = DAYS_SHOWN): SlotDay[] {
  const d0 = istDate(nowMs);
  const seen = new Set<string>();
  const days: SlotDay[] = [];
  for (let i = -1; i < count; i++) {
    const date = addDays(d0, i);
    const weekday = weekdayOf(date);
    const { state, spans } = daySpans(h, weekday);
    const own = slotsOf(date, spans).filter((s) => !seen.has(s.key));
    for (const s of own) seen.add(s.key);
    const slots = own.filter((s) => s.ms > nowMs);
    const open = state === "open" ? openText(spans) : null;
    if (i === -1) {
      if (slots.length) days.push({ date, weekday, chip: `${weekday.slice(0, 3)} night`, night: true, heading: `${weekday} night, after midnight`, state, open, slots });
      continue;
    }
    const chip = i === 0 ? "Today" : i === 1 ? "Tomorrow" : weekday.slice(0, 3);
    const heading = i === 0 ? `Today, ${shortDate(date)}` : i === 1 ? `Tomorrow, ${shortDate(date)}` : longDate(date);
    days.push({ date, weekday, chip, night: false, heading, state, open, slots });
  }
  return days;
}

/** The days a player sees: open days with an hour still to come, each with its free hours (a fully marked day stays, with none). */
export function freeDays(days: SlotDay[], booked: ReadonlySet<SlotKey>): (SlotDay & { free: Slot[] })[] {
  return days.filter((d) => d.state === "open" && d.slots.length > 0).map((d) => ({ ...d, free: d.slots.filter((s) => !booked.has(s.key)) }));
}

/** The owner's first day: the first with an hour to mark, else Today. */
export function ownerDefault(days: SlotDay[]): number {
  const i = days.findIndex((d) => d.slots.length > 0);
  if (i >= 0) return i;
  const today = days.findIndex((d) => !d.night);
  return today >= 0 ? today : 0;
}

/** A player's first day: the first with a free hour, else the first. */
export function playerDefault(days: (SlotDay & { free: Slot[] })[]): number {
  const i = days.findIndex((d) => d.free.length > 0);
  return i >= 0 ? i : 0;
}

/**
 * The whole-day button: while any hour still to come is free, mark them all
 * booked; else mark them all free. The changes, and the undo that puts each
 * hour back as it was. Null for last night's chip and a day with no hours.
 */
export function wholeDay(
  day: SlotDay,
  booked: ReadonlySet<SlotKey>,
): { status: SlotStatus; changes: SlotChange[]; undo: SlotChange[] } | null {
  if (day.night || !day.slots.length) return null;
  const status: SlotStatus = day.slots.some((s) => !booked.has(s.key)) ? "booked" : "free";
  const moved = day.slots.filter((s) => (booked.has(s.key) ? "booked" : "free") !== status);
  return {
    status,
    changes: moved.map((s) => ({ at: s.key, status })),
    undo: moved.map((s) => ({ at: s.key, status: status === "booked" ? "free" : "booked" })),
  };
}

// ── Freshness ──

const timeOf = (iso: string | null | undefined) => (typeof iso === "string" ? Date.parse(iso) : NaN);

/** Players see the slots while the owner's last tap or All correct is under FRESH_HOURS old (a time ahead of this clock counts as fresh). */
export function isFresh(updatedAt: string | null, nowMs: number): boolean {
  const t = timeOf(updatedAt);
  return Number.isFinite(t) && nowMs - t < FRESH_HOURS * HOUR_MS;
}

/** Hours until players stop seeing the slots (negative once they have). */
export function hoursLeft(updatedAt: string, nowMs: number): number {
  return (timeOf(updatedAt) + FRESH_HOURS * HOUR_MS - nowMs) / HOUR_MS;
}

/** "just now", "12 min ago", "2 h ago", "1 day ago", "3 days ago". */
export function agoText(updatedAt: string, nowMs: number): string {
  const d = nowMs - timeOf(updatedAt);
  if (!Number.isFinite(d) || d < MIN_MS) return "just now";
  if (d < HOUR_MS) return `${Math.floor(d / MIN_MS)} min ago`;
  if (d < DAY_MS) return `${Math.floor(d / HOUR_MS)} h ago`;
  const n = Math.floor(d / DAY_MS);
  return `${n} day${n === 1 ? "" : "s"} ago`;
}

/** An instant in India time: "3 Nov, 9:15 PM". */
export function istStamp(iso: string): string {
  const t = timeOf(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + IST_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${clockLabel(d.getUTCHours() * 60 + d.getUTCMinutes())}`;
}

/**
 * A turf whose page has no number to call or WhatsApp: players never see its
 * free slots (the page shows the card only beside Call or WhatsApp), so the
 * owner's section says so, with a link to the numbers, instead of "Players
 * see this". The marks still save and count once a number is added.
 */
export const OWNER_NO_NUMBER = {
  line: "Players see your free slots once your page has a number to call or WhatsApp.",
  link: "Add your number",
} as const;

/** The owner's section's lead under its heading: with a number, that players see the free hours. */
export function ownerLead(hasNumber: boolean): string {
  return hasNumber
    ? "Tap an hour when it gets booked. Tap again to free it. Players see your free hours on your page and contact you."
    : "Tap an hour when it gets booked. Tap again to free it.";
}

/** The owner's status line and its button. hasNumber false: the page has no number, so players see nothing yet. */
export function ownerStatus(
  updatedAt: string | null,
  nowMs: number,
  hasNumber = true,
): { kind: "never" | "live" | "ending" | "hidden" | "no_number"; line: string; button: string } {
  if (!hasNumber) return { kind: "no_number", line: OWNER_NO_NUMBER.line, button: "All correct" };
  if (!updatedAt || !Number.isFinite(timeOf(updatedAt)))
    return { kind: "never", line: "Players don't see this yet. Mark what's booked; players will see the rest as free.", button: "Show free hours to players" };
  if (!isFresh(updatedAt, nowMs)) return { kind: "hidden", line: `Hidden from players · last updated ${istStamp(updatedAt)}`, button: "All correct" };
  const left = hoursLeft(updatedAt, nowMs);
  const ago = agoText(updatedAt, nowMs);
  if (left <= FRESH_WARN_HOURS) return { kind: "ending", line: `Players see this for ${Math.max(1, Math.ceil(left))} more h · updated ${ago}`, button: "All correct" };
  return { kind: "live", line: `Players see this · updated ${ago}`, button: "All correct" };
}

/**
 * How long to wait before working the slots out again: to the next minute
 * of the clock the screen uses (every slot starts on a whole minute, so an
 * hour drops off the moment it starts), or to the moment the owner's marks
 * stop being fresh, whichever is sooner, plus a few ms so the timer never
 * lands just before it.
 */
export function nextTickMs(nowMs: number, updatedAt?: string | null): number {
  const toMinute = MIN_MS - (((nowMs % MIN_MS) + MIN_MS) % MIN_MS);
  const t = timeOf(updatedAt);
  const toStale = Number.isFinite(t) ? t + FRESH_HOURS * HOUR_MS - nowMs : Infinity;
  return Math.max(0, Math.min(toMinute, toStale > 0 ? toStale : Infinity)) + TICK_MARGIN_MS;
}
const TICK_MARGIN_MS = 25;

/** The clock to work slots out with: the device's, unless it runs behind the server's (a phone set a day back must not show past hours). */
export function clientNow(serverIso: string | null | undefined, deviceMs: number): number {
  const t = timeOf(serverIso);
  return Number.isFinite(t) ? Math.max(deviceMs, t) : deviceMs;
}

// ── Answers ──

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const keysOf = (x: unknown): SlotKey[] => (Array.isArray(x) ? x.filter(isSlotKey) : []);

/** The public read (turf_availability, the route's body): the marks while fresh at `nowMs`; null otherwise or for anything malformed. */
export function parsePublic(json: unknown, nowMs: number): PublicAvailability | null {
  if (!isObj(json) || json.fresh !== true) return null;
  const { updated_at: updatedAt, now } = json;
  if (typeof updatedAt !== "string" || typeof now !== "string" || !Number.isFinite(timeOf(updatedAt)) || !Number.isFinite(timeOf(now))) return null;
  if (!isFresh(updatedAt, nowMs)) return null;
  return { updatedAt, now, booked: keysOf(json.booked) };
}

/** An owner function's answer: the owner's view, an error, or null for anything malformed. */
export function parseOwner(json: unknown): OwnerSlots | { error: string } | null {
  if (!isObj(json)) return null;
  if (typeof json.error === "string") return { error: json.error };
  if (json.ok !== true || typeof json.now !== "string" || !Number.isFinite(timeOf(json.now)) || !isObj(json.hours)) return null;
  const h = json.hours;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const out: OwnerSlots = {
    ok: true,
    now: json.now,
    updated_at: typeof json.updated_at === "string" && Number.isFinite(timeOf(json.updated_at)) ? json.updated_at : null,
    grounds: typeof json.grounds === "number" && Number.isFinite(json.grounds) ? json.grounds : null,
    hours: {
      opening_hours: isObj(h.opening_hours) ? (h.opening_hours as SlotHours["opening_hours"]) : null,
      start_time: str(h.start_time),
      end_time: str(h.end_time),
      is_24x7: typeof h.is_24x7 === "boolean" ? h.is_24x7 : null,
      closed_days: str(h.closed_days),
    },
    booked: keysOf(json.booked),
  };
  for (const k of ["saved", "changed", "skipped"] as const) if (typeof json[k] === "number") out[k] = json[k] as number;
  return out;
}

// ── Words ──

/**
 * The message a slot opens WhatsApp with: it asks, it claims nothing. No emoji.
 * "Hi! Is 7 PM to 8 PM today (Thu 5 Nov) free at *Kick Off Arena*? I'd like to book it."
 */
export function slotMessage(a: { turfName: string; pageUrl: string; day: SlotDay; slot: Slot }): string {
  const { day, slot } = a;
  const when =
    day.night || slot.afterMidnight
      ? `on ${shortDate(istDate(slot.ms))} (${day.weekday} night)`
      : day.chip === "Today"
        ? `today (${shortDate(day.date)})`
        : day.chip === "Tomorrow"
          ? `tomorrow (${shortDate(day.date)})`
          : `on ${shortDate(day.date)}`;
  return `Hi! Is ${slot.range} ${when} free at *${a.turfName}*? I'd like to book it.\n\nFound you on TapTurf: ${a.pageUrl}`;
}

/** The hours picker's Closes list: the 23 hours after the opening hour, in order; past midnight says so. */
export function closeChoices(openHour: number): { value: string; label: string }[] {
  return Array.from({ length: 23 }, (_, i) => {
    const h = (openHour + i + 1) % 24;
    return { value: `${String(h).padStart(2, "0")}:00`, label: `${clockLabel(h * 60)}${h === 0 ? " (midnight)" : h < openHour ? " (next day)" : ""}` };
  });
}

/** What the hours picker saves through owner_update_turf. */
export function hoursPatch(p: { open: string; close: string; allDay: boolean }): { is_24x7: true } | { is_24x7: false; start_time: string; end_time: string } {
  return p.allDay ? { is_24x7: true } : { is_24x7: false, start_time: p.open, end_time: p.close };
}

/** What players read on the card. No "book", no counts, nothing urgent: the owner marked it, the turf confirms. */
export const PLAYER_COPY = {
  title: "Free slots",
  afterMidnight: "After midnight",
  hintWhatsApp: "Tap a time to ask the turf on WhatsApp.",
  hintCall: "Tap a time to call the turf.",
  freeMeans: "Free means the owner marked the hour free; the turf confirms it.",
  membersClub: "Members' club: ask the turf about guest access.",
} as const;

/** The card's last line, with the page's booking line, or for a members' club (no booking line, as on the page) that it is one. */
export function playerFooter(membersOnly: boolean): string {
  return [PLAYER_COPY.freeMeans, membersOnly ? PLAYER_COPY.membersClub : bookingLine(membersOnly, true)].filter(Boolean).join(" ");
}

/** "Updated 2 h ago by the owner" */
export function updatedLine(ago: string): string {
  return `Updated ${ago} by the owner`;
}

/** A day with no free hour on the card. */
export function noFreeLine(day: SlotDay): string {
  const when = day.night ? `${day.weekday} night` : day.chip === "Today" ? "the rest of today" : day.chip === "Tomorrow" ? "tomorrow" : day.weekday;
  return `No free slots marked for ${when}.`;
}
