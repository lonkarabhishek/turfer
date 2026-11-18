import { DAYS_SHOWN, IST_OFFSET_MIN, clockLabel, isFresh, shortDate, slotDays, slotKey, type PublicAvailability, type SlotHours, type SlotKey } from "../availability/slots";
import type { DayName } from "../utils/hours";
import { PLAYERS_MAX, PLAYERS_MIN } from "./ask";

/**
 * What the "Ask for a slot" sheet offers (components/turf/SlotAskSheet.tsx):
 * the days and, for each, the start times. The hours are the ones the turf
 * page shows, worked out by the free slots' own code
 * (lib/availability/slots.ts slotDays, from lib/utils/hours.ts): Today,
 * Tomorrow and the next five days in India, each with the starts of its
 * opening hours that are still to come, after-midnight ones included; a
 * closed day has none. A day whose hours we don't know offers the usual
 * ones, 5 AM to 1 AM (lib/outcome's hour row), and says so. While last
 * night's after-midnight hours are not over they lead, as on the Free
 * slots card.
 *
 * Where the turf's owner keeps Free slots and the marks are fresh, a
 * start the owner has not marked Booked is "Free" (freeKeys): shown with a
 * dot, never used to hide the other hours (a turf may have more grounds).
 * Pure (npm run test:slotask).
 */

const MIN_MS = 60_000;
const IST_MS = IST_OFFSET_MIN * MIN_MS;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The hours offered on a day whose hours we don't know: 5 AM to 11 PM, then midnight and 1 AM (minutes from that day's midnight). */
export const USUAL_STARTS: readonly number[] = [...Array.from({ length: 19 }, (_, i) => (i + 5) * 60), 1440, 1500];

export type AskTime = {
  /** The start in India time, "2026-11-21T19:00"; an after-midnight hour has the next calendar date. */
  key: SlotKey;
  ms: number;
  /** India's calendar date of the start. */
  date: string;
  hour: number;
  minute: number;
  /** "7 PM", "6:30 AM" */
  label: string;
  /** Starts at or after midnight, as part of the day before's opening hours. */
  afterMidnight: boolean;
};

export type AskDay = {
  /** One per chip. */
  id: string;
  /** The business day, YYYY-MM-DD in India. */
  date: string;
  weekday: DayName;
  /** "Today" | "Tomorrow" | "Sat" | "Fri night" */
  chip: string;
  /** "21 Nov" */
  sub: string;
  /** "Today, Wed 18 Nov" */
  heading: string;
  /** Last night's after-midnight hours that are still to come. */
  night: boolean;
  state: "open" | "closed" | "unknown";
  /** The times are the usual ones, not the turf's own (its hours for this day are unknown). */
  guessed: boolean;
  times: AskTime[];
};

const dayStart = (date: string) => Date.parse(`${date}T00:00:00Z`) - IST_MS;
const dayMonth = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

function timeOf(key: SlotKey, ms: number, afterMidnight: boolean): AskTime {
  const hour = Number(key.slice(11, 13));
  const minute = Number(key.slice(14, 16));
  return { key, ms, date: key.slice(0, 10), hour, minute, label: clockLabel(hour * 60 + minute), afterMidnight };
}

/** The days to pick from, each with its start times still to come at `nowMs`. */
export function askDays(h: SlotHours, nowMs: number): AskDay[] {
  const days = slotDays(h, nowMs, DAYS_SHOWN);
  // A start two days both cover stays with the earlier one (slotDays does it for the turf's own hours; the usual hours follow it).
  const seen = new Set<SlotKey>();
  for (const d of days) for (const s of d.slots) seen.add(s.key);
  return days.map((d): AskDay => {
    let times = d.slots.map((s) => timeOf(s.key, s.ms, s.afterMidnight));
    const guessed = d.state === "unknown" && !d.night;
    if (guessed) {
      const base = dayStart(d.date);
      times = [];
      for (const start of USUAL_STARTS) {
        const ms = base + start * MIN_MS;
        const key = slotKey(ms);
        if (ms <= nowMs || seen.has(key)) continue;
        seen.add(key);
        times.push(timeOf(key, ms, start >= 1440));
      }
    }
    return { id: `${d.date}${d.night ? "n" : ""}`, date: d.date, weekday: d.weekday, chip: d.chip, sub: d.night ? "after 12" : dayMonth(d.date), heading: d.heading, night: d.night, state: d.state, guessed, times };
  });
}

/** The day the sheet opens on: today when it has an hour left, else the next day that has one (last night's leftover hours never lead). */
export function defaultDay(days: AskDay[]): number {
  const i = days.findIndex((d) => !d.night && d.times.length > 0);
  if (i >= 0) return i;
  const any = days.findIndex((d) => d.times.length > 0);
  if (any >= 0) return any;
  const today = days.findIndex((d) => !d.night);
  return today >= 0 ? today : 0;
}

/** The same clock time on another day, when that day has it (7 PM stays 7 PM as the day changes). */
export function sameTime(day: AskDay, t: AskTime | null): AskTime | null {
  if (!t) return null;
  return day.times.find((x) => x.hour === t.hour && x.minute === t.minute && x.afterMidnight === t.afterMidnight) ?? null;
}

/** The day and time a slot key names among the days offered now; null when it is not offered any more (it has passed). */
export function findTime(days: AskDay[], key: SlotKey): { day: number; time: AskTime } | null {
  for (let i = 0; i < days.length; i++) {
    const time = days[i].times.find((t) => t.key === key);
    if (time) return { day: i, time };
  }
  return null;
}

/**
 * The starts the owner's fresh marks leave free (GET /api/availability/<id>):
 * every start of the turf's own hours that is not marked Booked. None when
 * there are no fresh marks, and never for a day whose hours are a guess.
 */
export function freeKeys(days: AskDay[], avail: PublicAvailability | null, nowMs: number): Set<SlotKey> {
  const free = new Set<SlotKey>();
  if (!avail || !isFresh(avail.updatedAt, nowMs)) return free;
  const booked = new Set(avail.booked);
  for (const d of days) if (d.state === "open") for (const t of d.times) if (!booked.has(t.key)) free.add(t.key);
  return free;
}

/** "Sat 21 Nov, 7 PM to 8 PM": the line over the Send button. */
export function summary(t: AskTime, minutes: number): string {
  const start = t.hour * 60 + t.minute;
  return `${shortDate(t.date)}, ${clockLabel(start)} to ${clockLabel(start + minutes)}`;
}

/** The sports to pick from: the turf's own labels, each once, in its order. */
export function sportChoices(sports: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const s of sports ?? []) {
    const label = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
    if (label && !out.some((x) => x.toLowerCase() === label.toLowerCase())) out.push(label);
  }
  return out.slice(0, 12);
}

const TEAM = /football|futsal|cricket|hockey|basketball|volleyball|throwball|handball|frisbee|kabaddi|rugby/i;

/** Where the players stepper starts from blank: 10 for a team sport, 4 otherwise. */
export function playersStart(sport: string | null): number {
  return sport && !TEAM.test(sport) ? 4 : 10;
}

/** The stepper: from blank, + gives the start; below the least it is blank again. */
export function stepPlayers(now: number | null, by: 1 | -1, sport: string | null): number | null {
  if (now == null) return by > 0 ? playersStart(sport) : null;
  const n = now + by;
  return n < PLAYERS_MIN ? null : Math.min(PLAYERS_MAX, n);
}

/** India's date at an instant (the message's "today"). */
export function istToday(nowMs: number): string {
  return new Date(nowMs + IST_MS).toISOString().slice(0, 10);
}
