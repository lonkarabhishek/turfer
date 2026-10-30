import { formatClock, normaliseOpeningHours, type DayName } from "../utils/hours";
import type { OpeningHours } from "../../types/turf";

/**
 * "Open now", "open at 6am tomorrow", "open at 5am on Sunday": router
 * v10's open_at, read against each venue's hours as its page shows them
 * (normaliseOpeningHours). Pure, relative imports only, so npm run
 * test:ask runs it.
 *
 * A venue's week is kept small for the cache (lib/queries/askFacts.ts):
 * Monday first, each day's spans in minutes from midnight, a span that
 * runs past midnight ending after 1440 ("6 AM–2 AM" is 360 to 1560), an
 * empty day closed, null a day with no hours we can read. A venue with
 * no readable hours is never open "for sure", so it is never shown as open.
 */

export type Span = readonly [number, number];
/** Monday to Sunday: the day's spans, [] when closed, null when not known. */
export type Week = readonly (readonly Span[] | null)[];

const DAYS: readonly DayName[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const minutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** The week a turf's page shows, or null when it shows no hours at all. */
export function weekOf(t: { opening_hours: OpeningHours | null | undefined; start_time: string | null; end_time: string | null; is_24x7?: boolean | null }): Week | null {
  const rows = normaliseOpeningHours(t.opening_hours, { start_time: t.start_time, end_time: t.end_time, is_24x7: t.is_24x7 });
  if (!rows.length) return null;
  const week: (Span[] | null)[] = DAYS.map(() => null);
  for (const r of rows) {
    const i = DAYS.indexOf(r.day);
    if (r.closed) {
      week[i] = [];
      continue;
    }
    const spans: Span[] = [];
    for (const s of r.spans) {
      const o = minutes(s.opens);
      let c = minutes(s.closes);
      if (o == null || c == null) continue;
      // 00:00 to 23:59 is the whole day; a close at or before the open is after midnight.
      if (o === 0 && c >= 1439) c = 1440;
      else if (c <= o) c += 1440;
      spans.push([o, c]);
    }
    week[i] = spans.length ? spans : null;
  }
  return week.some((d) => d != null) ? week : null;
}

/** "360-1380,1400-1500|...|x|" : days by "|", spans by ",", "x" closed, "" not known. */
export function encodeWeek(w: Week): string {
  return w.map((d) => (d == null ? "" : d.length ? d.map(([o, c]) => `${o}-${c}`).join(",") : "x")).join("|");
}

export function decodeWeek(s: string): Week {
  const days = s.split("|");
  return DAYS.map((_, i) => {
    const d = days[i] ?? "";
    if (d === "") return null;
    if (d === "x") return [];
    return d.split(",").map((p) => p.split("-").map(Number) as unknown as Span);
  });
}

/**
 * Open at `minute` (0 to 1439) on `day` (0 Monday .. 6 Sunday): one of
 * the day's spans covers it, or the day before runs past midnight into
 * it. Null when neither day's hours are known.
 */
export function isOpenAt(week: Week, day: number, minute: number): boolean | null {
  const today = week[day];
  const before = week[(day + 6) % 7];
  if (today?.some(([o, c]) => o <= minute && minute < c)) return true;
  if (before?.some(([, c]) => c > 1440 && minute + 1440 < c)) return true;
  return today == null && before == null ? null : false;
}

/** "06:00", "6am", "6 am", "6:30 pm", "18:30", "9.30pm": minutes from midnight, or null. Bare "6" is not a time. */
export function parseClock(s: string): number | null {
  const m = /^\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*$/i.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const mer = m[3]?.toLowerCase().replace(/\./g, "");
  if (min > 59) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    if (mer === "pm" && h < 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
  } else if (!m[2] || h > 23) return null;
  return h * 60 + min;
}

/** open_at's day ("sun 05:00"), Monday first as a Week. */
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** "sun", "Sunday", "tues", "thurs": 0 Monday .. 6 Sunday, or null. */
function weekdayOf(s: string): number | null {
  const m = /^(?:(mon)(?:day)?|(tue)(?:s|sday)?|(wed)(?:nesday)?|(thu)(?:r|rs|rsday)?|(fri)(?:day)?|(sat)(?:urday)?|(sun)(?:day)?)\.?$/i.exec(s.trim());
  return m ? m.slice(1).findIndex((g) => g != null) : null;
}

/** open_at as read: "now", or a minute of the day and the weekday named before it ("sun 05:00"; day null: the day `when` says). */
function readOpenAt(raw: string | null | undefined): "now" | { day: number | null; minute: number } | null {
  if (!raw) return null;
  if (/^\s*now\s*$/i.test(raw)) return "now";
  const named = /^\s*([a-z]+\.?)\s+(.+)$/i.exec(raw);
  const day = named ? weekdayOf(named[1]) : null;
  if (named && day == null) return null;
  const minute = parseClock(named ? named[2] : raw);
  return minute == null ? null : { day, minute };
}

/** India's weekday (0 Monday .. 6 Sunday) and minute of the day at `now`. */
export function istNow(now: Date): { day: number; minute: number } {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return { day: (ist.getUTCDay() + 6) % 7, minute: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

export type OpenSlot = { day: number; minute: number };

/**
 * The moments open_at asks about: now, or the time on the weekday it
 * names ("sun 05:00": Sunday, whatever `when` says), else on the day
 * `when` says (today when none; Saturday or Sunday for the weekend; any
 * day this week). Null when open_at is no time we read.
 */
export function openAtSlots(openAt: string | null | undefined, when: string | null | undefined, now: Date): OpenSlot[] | null {
  const read = readOpenAt(openAt);
  if (!read) return null;
  const at = istNow(now);
  if (read === "now") return [at];
  const { day, minute } = read;
  if (day != null) return [{ day, minute }];
  const days =
    when === "tomorrow" ? [(at.day + 1) % 7] : when === "weekend" ? [5, 6] : when === "this_week" ? [0, 1, 2, 3, 4, 5, 6] : [at.day];
  return days.map((day) => ({ day, minute }));
}

/** Open at any of the slots (a weekend: Saturday or Sunday); never for a week we don't know. */
export function openAtAny(week: Week | null | undefined, slots: readonly OpenSlot[], allDay = false): boolean {
  if (allDay) return true;
  if (!week) return false;
  return slots.some((s) => isOpenAt(week, s.day, s.minute) === true);
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** open_at as a reply says it: "open now", "open at 6:00 AM", "open at 6:00 AM tomorrow", "open at 5:00 AM on Sunday". Null when it is no time we read. */
export function openAtWords(openAt: string | null | undefined, when?: string | null): string | null {
  const read = readOpenAt(openAt);
  if (!read) return null;
  if (read === "now") return "open now";
  const clock = formatClock(hhmm(read.minute));
  const day =
    read.day != null ? ` on ${DAYS[read.day]}` : when === "tomorrow" ? " tomorrow" : when === "weekend" ? " at the weekend" : when === "this_week" ? " this week" : "";
  return `open at ${clock}${day}`;
}

/** open_at as the reading stores it: "now", "HH:MM", or "sun HH:MM" for a weekday named, from what a player or the model wrote; null otherwise. */
export function normalOpenAt(raw: string | null | undefined): string | null {
  const read = readOpenAt(raw);
  if (!read) return null;
  if (read === "now") return "now";
  return `${read.day != null ? `${DAY_KEYS[read.day]} ` : ""}${hhmm(read.minute)}`;
}

/** "sun 05:00" from the weekday (0 Monday .. 6 Sunday) and an open_at of "HH:MM"; anything else as it was. */
export function onDay(openAt: string | null, day: number | null): string | null {
  if (day == null || !openAt || !/^\d{2}:\d{2}$/.test(openAt)) return openAt;
  return `${DAY_KEYS[day]} ${openAt}`;
}
