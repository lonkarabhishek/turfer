/**
 * Times in words, India's clock and calendar whatever the device's: "2 h
 * ago" with "Mon 17 Nov, 3:40 PM" behind it (a game's updates and
 * activity), "Sat 15 Nov" and "7 PM" (a stored date and time). Pure;
 * relative imports only (npm run test:games).
 */

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** An instant (ms, or an ISO string) as ms, or null when it is not one. */
export function instant(x: unknown): number | null {
  const ms = typeof x === "number" ? x : typeof x === "string" && x ? Date.parse(x) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** India's day number (days since 1970-01-01) at an instant. */
export function istDayNumber(ms: number): number {
  return Math.floor((ms + IST_MS) / DAY_MS);
}

/** "7 PM", "7:30 PM". */
function clockOf(hours: number, minutes: number): string {
  const h = hours % 12 || 12;
  return `${h}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${hours < 12 ? "AM" : "PM"}`;
}

/** A stored clock ("19:00", "19:00:00") in words, or "". */
export function clockWords(time: unknown): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(typeof time === "string" ? time : "");
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return "";
  return clockOf(Number(m[1]), Number(m[2]));
}

/** A stored date ("2026-11-15") in words: "Sun 15 Nov"; with the year when `year` is another one. "" when it is not a date. */
export function dayWords(date: unknown, year?: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof date === "string" ? date : "");
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return "";
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year !== undefined && year !== d.getUTCFullYear() ? ` ${d.getUTCFullYear()}` : ""}`;
}

/** An instant as India read it: "Mon 17 Nov, 3:40 PM" (with the year when it is not `now`'s). */
export function stampWords(ms: number, now?: number): string {
  const d = new Date(ms + IST_MS);
  const year = now === undefined ? undefined : new Date(now + IST_MS).getUTCFullYear();
  return `${dayWords(d.toISOString().slice(0, 10), year)}, ${clockOf(d.getUTCHours(), d.getUTCMinutes())}`;
}

/**
 * How long ago, briefly: "just now" (under a minute, or a clock a little
 * ahead), "5 min ago", "2 h ago" (under a day), then India's calendar:
 * "yesterday", "3 days ago" (up to 6), then the day ("Mon 17 Nov").
 */
export function agoWords(ms: number, now: number): string {
  const gone = now - ms;
  if (gone < 60_000) return "just now";
  if (gone < 3_600_000) return `${Math.floor(gone / 60_000)} min ago`;
  if (gone < DAY_MS) return `${Math.floor(gone / 3_600_000)} h ago`;
  const days = istDayNumber(now) - istDayNumber(ms);
  if (days <= 1) return "yesterday";
  if (days <= 6) return `${days} days ago`;
  return dayWords(new Date(ms + IST_MS).toISOString().slice(0, 10), new Date(now + IST_MS).getUTCFullYear());
}
