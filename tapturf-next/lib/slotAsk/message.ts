import { clockLabel, shortDate } from "../availability/slots";

/**
 * The message "Ask for a slot" opens WhatsApp with
 * (components/turf/SlotAskSheet.tsx): the player's own words to the turf,
 * for them to edit before they send it. It asks and claims nothing:
 *
 *   Hi! Is Kings Turf Arena free on Sat 21 Nov, 7 PM to 8 PM for football
 *   (about 10 players)? Found you on TapTurf: https://www.tapturf.in/turf/kings-turf-arena?utm_source=whatsapp-ask
 *
 * Plain text, one line, no emoji and nothing WhatsApp would read as
 * formatting (a name's * _ ~ ` are taken out), at most MESSAGE_MAX
 * characters for any turf we list: a long name is cut to NAME_MAX, and on
 * a very long address the link loses its utm_source, then the name is cut
 * further (to 20 at the least; the link itself is never cut, so only an
 * address over about 150 characters, twice the longest live one, could run
 * over). The link is the turf's own page, so
 * the owner sees which listing the player came from; utm_source=whatsapp-ask
 * is read as WhatsApp by the traffic counter (lib/traffic/traffic.ts
 * UTM_NAMES) and changes nothing about the page or its canonical.
 * Pure (npm run test:slotask).
 */

export const MESSAGE_MAX = 300;
/** A turf's name in the message, at most (the 95th percentile of live names is 39 characters; the longest is 98). */
export const NAME_MAX = 60;
export const ASK_UTM = "utm_source=whatsapp-ask";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_MS = 86_400_000;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export type MessageAsk = {
  turfName: string;
  /** The turf's page (turfUrl, by slug). */
  pageUrl: string;
  /** India's calendar date of the start. */
  date: string;
  hour: number;
  minute: number;
  minutes: number;
  /** Part of the day before's opening hours (12 AM, 1 AM): the message names that night. */
  afterMidnight?: boolean;
  /** Lower case, e.g. "box cricket"; none: not said. */
  sport?: string | null;
  players?: number | null;
  /** India's date today, so the message can say today or tomorrow. */
  today: string;
};

/** A name as the message says it: one line, nothing WhatsApp formats, at most NAME_MAX characters. */
export function messageName(name: string, max: number = NAME_MAX): string {
  const s = name.replace(/[*~`]/g, "").replace(/_/g, " ").replace(/\s+/g, " ").trim() || "your turf";
  // A cut name ends on a word or a letter, never on a comma or a dash.
  return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1)).replace(/[\s,;:.&/(-]+$/, "")}…`;
}

/** "7 PM to 8 PM", "6:30 AM to 8 AM", "11 PM to 1 AM". */
export function rangeText(hour: number, minute: number, minutes: number): string {
  const start = hour * 60 + minute;
  return `${clockLabel(start)} to ${clockLabel(start + minutes)}`;
}

/** "today (Wed 18 Nov), 7 PM to 8 PM" | "tomorrow (Thu 19 Nov), ..." | "on Sat 21 Nov, ..."; an after-midnight hour names its night. */
export function whenText(a: Pick<MessageAsk, "date" | "hour" | "minute" | "minutes" | "afterMidnight" | "today">): string {
  const range = rangeText(a.hour, a.minute, a.minutes);
  if (a.afterMidnight) {
    const night = WEEKDAYS[new Date(`${addDays(a.date, -1)}T00:00:00Z`).getUTCDay()];
    return `on ${shortDate(a.date)}, ${range} (late ${night} night)`;
  }
  if (a.date === a.today) return `today (${shortDate(a.date)}), ${range}`;
  if (a.date === addDays(a.today, 1)) return `tomorrow (${shortDate(a.date)}), ${range}`;
  return `on ${shortDate(a.date)}, ${range}`;
}

/** The page link with the ask's utm_source. */
export function askLink(pageUrl: string): string {
  return `${pageUrl}${pageUrl.includes("?") ? "&" : "?"}${ASK_UTM}`;
}

export function slotAskMessage(a: MessageAsk): string {
  const sport = a.sport ? ` for ${a.sport}` : "";
  const players = a.players && a.players > 0 ? ` (${a.players === 1 ? "1 player" : `about ${a.players} players`})` : "";
  const build = (name: string, link: string) => `Hi! Is ${name} free ${whenText(a)}${sport}${players}? Found you on TapTurf: ${link}`;
  const name = messageName(a.turfName);
  const full = build(name, askLink(a.pageUrl));
  if (full.length <= MESSAGE_MAX) return full;
  // Too long (a long name on a long address): the plain link first, then a shorter name.
  const plain = build(name, a.pageUrl);
  if (plain.length <= MESSAGE_MAX) return plain;
  return build(messageName(a.turfName, Math.max(20, name.length - (plain.length - MESSAGE_MAX))), a.pageUrl);
}
