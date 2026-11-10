import { FREE_WINDOW_HOURS, FREE_WINDOW_MAX_HOURS, freeCardOf, type FreeCard, type FreeRow } from "../availability/free";
import { clockLabel, istDate } from "../availability/slots";
import { haversineKm, type Coords } from "../utils/location";

// Relative imports only, so npm run test:ask runs this (lib/ask/freeHours.test.ts).

/**
 * Ask TapTurf's "which turf is free near me": whether a question asks for
 * a free hour, the time it names in India time, the turfs whose owners
 * marked hours free then (lib/availability/free.ts, read by
 * lib/queries/freeSlots.ts), and the reply, all said from those rows, never
 * by the model: a turf without hours marked is never said to be free, and
 * nothing says a slot is certain. The route (app/api/ask/route.ts) answers
 * with the usual turf cards, each carrying its free times.
 */

const HOUR = 3_600_000;
const MIN = 60_000;
const DAY = 86_400_000;
const IST = 330 * MIN;

/** The farthest a turf with free hours is shown "near you": the first radius Ask's near me tries (lib/ai/relax.ts NEARBY_KM). */
export const FREE_NEAR_KM = 25;
/** Cards in a free hours answer. */
export const FREE_ASK_LIMIT = 8;
/** "Free now" looks this far ahead. */
export const NOW_HOURS = 2;

/** Lower case words with one space around each: "7.30 p.m." is "7:30 pm", other punctuation a space. */
const clean = (q: string) =>
  ` ${q
    .toLowerCase()
    .replace(/[’‘']/g, "")
    .replace(/\b([ap])\.\s?m\b\.?/g, "$1m")
    .replace(/(\d)\.(\d)/g, "$1:$2")
    .replace(/[^a-z0-9:₹]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

/** Words that make it a game question ("free games tonight", "anyone free to play"): Ask's games answer it. */
const GAME = / (?:game|games|squad|pickup|join|joining|anyone) /;
/** "Match" is a game too, unless a venue is asked for ("a turf free for our match tonight"). */
const MATCH = / (?:match|matches) /;
const VENUE = / (?:turf|turfs|truf|ground|grounds|court|courts|cage|cages|venue|venues|arena|arenas|field|fields|slot|slots) /;
/** "Free" that is about price or a facility, not an hour. */
const NOT_HOURS = / free (?:to join|entry|of cost|parking|wifi|wi fi|water|drinking water|coaching|trial|game|games)\b| for free | no fee /g;
/** An hour asked for: free, available, slots, vacant, khali (Hindi), rikama (Marathi). */
const FREE_WORD = / (?:free|available|availability|avail|vacant|empty|slot|slots|khali|khaali|rikama|rikame|open slot|open slots) /;
/** Booking with a time named: "can I book a turf tonight". */
const BOOK_WORD = / (?:book|booking|reserve) /;

/**
 * True when the question asks which turf has a free hour ("which turf is
 * available near me", "any turf free tonight", "free turf tomorrow 7 PM
 * in Bangalore", "aaj raat koi turf khali hai"), and not a game ("free
 * games", "free box cricket match"), a price or a facility ("free
 * parking", "for free") or opening hours ("open now" alone). A
 * booking asked with a time counts ("book a turf tonight"): the marked
 * hours are what we have.
 */
export function asksFreeHours(q: string, nowMs: number = Date.now()): boolean {
  const s = clean(q).replace(NOT_HOURS, " ");
  if (GAME.test(s) || (MATCH.test(s) && !VENUE.test(s))) return false;
  if (FREE_WORD.test(s)) return true;
  return BOOK_WORD.test(s) && freeWindow(q, nowMs) != null;
}

/** A time window in India time, as the reply says it ("tonight", "at 7 PM tomorrow"). wide: the whole of that day, tried when nothing is free at the time itself. */
export type FreeWindow = { fromMs: number; toMs: number; words: string; wide?: { fromMs: number; toMs: number; words: string } };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Part = { from: number; to: number; words: [string, string] };
// Minutes of the business day; past 1440 is after midnight. words: [today's, any day's].
const PARTS: [RegExp, Part][] = [
  [/ (?:late night|midnight|after midnight) /, { from: 23 * 60, to: 28 * 60, words: ["late tonight", "late night"] }],
  [/ (?:tonight|tonite|today night|aaj raat|night|raat|raatri|ratri) /, { from: 18 * 60, to: 28 * 60, words: ["tonight", "night"] }],
  [/ (?:evening|shaam|sham|sandhyakali|sandhyakal) /, { from: 17 * 60, to: 22 * 60, words: ["this evening", "evening"] }],
  [/ (?:afternoon|dopahar|dupahar|dupaar) /, { from: 12 * 60, to: 17 * 60, words: ["this afternoon", "afternoon"] }],
  [/ (?:morning|subah|sakali|savere) /, { from: 5 * 60, to: 12 * 60, words: ["this morning", "morning"] }],
];

const dateOf = (ms: number) => istDate(ms);
const startOf = (date: string) => Date.parse(`${date}T00:00:00Z`) - IST;
const plusDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** The clock named: "7 pm", "7:30pm", "19:00", "7 baje" (evening unless a morning word is there); minutes of the day, or null. */
function clockIn(s: string, morning: boolean, night: boolean): number | null {
  let m = / (\d{1,2})(?:[:.](\d{2}))? ?(am|pm|a m|p m) /.exec(s);
  if (m) {
    const h = Number(m[1]);
    const mm = Number(m[2] ?? 0);
    if (h < 1 || h > 12 || mm > 59) return null;
    const pm = m[3].startsWith("p");
    return ((h % 12) + (pm ? 12 : 0)) * 60 + mm;
  }
  m = / ([01]?\d|2[0-3]):([0-5]\d) /.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = / (\d{1,2})(?:[:.](\d{2}))? ?(?:baje|bje|vajta|vajata|o clock|oclock) /.exec(s);
  if (m) {
    const h = Number(m[1]);
    const mm = Number(m[2] ?? 0);
    if (h < 1 || h > 12 || mm > 59) return null;
    if (h === 12) return night ? 0 : 12 * 60 + mm;
    return (morning ? h : h + 12) * 60 + mm;
  }
  return null;
}

/**
 * The time a question names, in India time at nowMs: now ("free now",
 * "abhi"), a clock ("7 PM", "7 baje", "19:00"), a part of the day
 * (tonight, evening, morning, late night), a day (today, tomorrow,
 * "kal", a weekday, the weekend) or a day and one of those. A time with no
 * day that has gone today is tomorrow's. Null when it names no time.
 */
export function freeWindow(q: string, nowMs: number): FreeWindow | null {
  const s = clean(q);
  const today = dateOf(nowMs);
  if (/ (?:right now|now|abhi|abhee|currently|at the moment|ata) /.test(s)) return { fromMs: nowMs, toMs: nowMs + NOW_HOURS * HOUR, words: "right now" };

  // The day: named, or none (today, or tomorrow when the time has gone).
  let date: string | null = null;
  let dayWords = "";
  let weekend = false;
  if (/ (?:day after tomorrow|parso|parson|parva) /.test(s)) {
    date = plusDays(today, 2);
    dayWords = `on ${NAMES[weekdayOf(date)]}`;
  } else if (/ (?:tomorrow|tmrw|tmr|tommorow|tomorow|kal|udya) /.test(s)) {
    date = plusDays(today, 1);
    dayWords = "tomorrow";
  } else if (/ (?:today|aaj|aj) /.test(s)) {
    date = today;
    dayWords = "today";
  } else {
    const w = WEEKDAYS.findIndex((d) => s.includes(` ${d} `));
    if (w >= 0) {
      date = plusDays(today, (w - weekdayOf(today) + 7) % 7);
      dayWords = date === today ? "today" : `on ${NAMES[w]}`;
    } else if (/ (?:weekend|this weekend) /.test(s)) weekend = true;
  }

  const partHit = PARTS.find(([re]) => re.test(s));
  const part = partHit ? partHit[1] : null;
  const night = !!part && part.from >= 18 * 60;
  const morning = !!part && part.to <= 12 * 60;
  const clock = clockIn(s, morning, night);

  if (weekend && clock == null && !part) {
    const sat = plusDays(today, (6 - weekdayOf(today) + 7) % 7);
    const satStart = weekdayOf(today) === 0 ? startOf(today) + 4 * HOUR : startOf(sat) + 4 * HOUR;
    return { fromMs: Math.max(nowMs, satStart), toMs: startOf(plusDays(weekdayOf(today) === 0 ? today : sat, weekdayOf(today) === 0 ? 1 : 2)) + 4 * HOUR, words: "this weekend" };
  }
  if (clock == null && !part && !date) return null;

  // A whole day: from its 4 AM to the next 4 AM (after-midnight hours are the night before's).
  const whole = (d: string, words: string) => ({ fromMs: Math.max(nowMs, startOf(d) + 4 * HOUR), toMs: startOf(plusDays(d, 1)) + 4 * HOUR, words });
  if (clock == null && !part) return whole(date!, dayWords);

  let d = date ?? today;
  if (clock != null) {
    // "1 am tonight": after midnight, the night of that day.
    const minute = night && clock < 5 * 60 ? clock + 1440 : clock;
    let at = startOf(d) + minute * MIN;
    if (!date && at + 30 * MIN <= nowMs) {
      d = plusDays(d, 1);
      at += DAY;
    }
    const dayPart = d === today ? (night ? "tonight" : "today") : d === plusDays(today, 1) ? "tomorrow" : `on ${NAMES[weekdayOf(d)]}`;
    const label = clockLabel(minute);
    return {
      fromMs: Math.max(nowMs, at - 30 * MIN),
      toMs: at + 31 * MIN,
      words: `at ${label} ${dayPart}`,
      wide: whole(d, dayPart === "tonight" ? "today" : dayPart),
    };
  }
  const p = part!;
  let from = startOf(d) + p.from * MIN;
  let to = startOf(d) + p.to * MIN;
  if (!date && to <= nowMs) {
    d = plusDays(d, 1);
    from += DAY;
    to += DAY;
  }
  const words = d === today ? p.words[0] : d === plusDays(today, 1) ? `tomorrow ${p.words[1]}` : `on ${NAMES[weekdayOf(d)]} ${p.words[1]}`;
  const dayW = d === today ? "today" : d === plusDays(today, 1) ? "tomorrow" : `on ${NAMES[weekdayOf(d)]}`;
  return { fromMs: Math.max(nowMs, from), toMs: to, words, wide: whole(d, dayW) };
}

/** The reader's window for a question: the lists' 36 hours, or 8 days for a time further off. */
export function readerHours(w: FreeWindow | null, nowMs: number): number {
  const end = Math.max(w?.toMs ?? 0, w?.wide?.toMs ?? 0);
  return end - nowMs > FREE_WINDOW_HOURS * HOUR ? FREE_WINDOW_MAX_HOURS : FREE_WINDOW_HOURS;
}

/** What a free hours answer picks from: the reader's rows and, per id, the turf's sports and place from Ask's own rows. */
export type FreePickTurf = { id: string; city: string | null; sports: string[]; lat: number | null; lng: number | null; area: string | null };
export type FreePick = { id: string; card: FreeCard; km: number | null };

/**
 * The turfs with an hour marked free in [fromMs, toMs): near `loc`
 * (within FREE_NEAR_KM, nearest first) when there is one and no city is
 * asked for, else in `city`, else anywhere; of the sport (`plays`), and
 * those in a named area first. Each card holds only its free hours in the
 * window. Only turfs Ask's rows have (active, listed) count.
 */
export function pickFree(
  rows: readonly FreeRow[],
  turfs: ReadonlyMap<string, FreePickTurf>,
  opts: { city: string | null; loc: Coords | null; plays?: ((sports: string[]) => boolean) | null; areas?: readonly string[]; fromMs: number; toMs: number; nowMs: number; limit?: number },
): FreePick[] {
  const areas = (opts.areas ?? []).map((a) => a.toLowerCase()).filter(Boolean);
  const out: (FreePick & { inArea: boolean; i: number })[] = [];
  rows.forEach((r, i) => {
    const t = turfs.get(r.id);
    if (!t) return;
    if (opts.plays && !opts.plays(t.sports)) return;
    let km: number | null = null;
    if (opts.loc && !opts.city) {
      const lat = r.lat ?? t.lat;
      const lng = r.lng ?? t.lng;
      if (lat == null || lng == null) return;
      km = haversineKm(opts.loc, { lat, lng });
      if (!Number.isFinite(km) || km > FREE_NEAR_KM) return;
    } else if (opts.city && t.city !== opts.city) return;
    const card = freeCardOf(r, opts.nowMs, opts.toMs, opts.fromMs);
    if (!card) return;
    const where = `${t.area ?? r.area ?? ""}`.toLowerCase();
    out.push({ id: r.id, card, km, inArea: areas.length > 0 && areas.some((a) => where.includes(a)), i });
  });
  out.sort((a, b) => (a.km != null && b.km != null ? a.km - b.km : 0) || Number(b.inArea) - Number(a.inArea) || a.i - b.i);
  return out.slice(0, opts.limit ?? FREE_ASK_LIMIT).map(({ id, card, km }) => ({ id, card, km }));
}

// ── Words ──

/** The site owner's booking line (5 Nov 2026). */
export const BOOKINGS_LINE = "For bookings, contact the turf directly.";

const withWhen = (words: string) => (words ? ` ${words}` : "");
const forWhen = (words: string) => (!words ? "" : words.startsWith("at ") || words.startsWith("on ") || words === "right now" ? ` ${words}` : ` for ${words}`);

/**
 * The reply over the cards. names: the turfs shown, in order; where: "in
 * Bangalore", "near you" or ""; when: the window's words ("tonight", "at 7
 * PM tomorrow") or ""; requests: how many of them take booking requests.
 */
export function freeFoundReply(i: { names: string[]; where: string; when: string; requests: number }): string {
  const n = i.names.length;
  const lead =
    n === 1
      ? `${i.names[0]}${i.where ? ` ${i.where}` : ""} has hours marked free${withWhen(i.when)} by its owner.`
      : `${n} turfs${i.where ? ` ${i.where}` : ""} have hours marked free${withWhen(i.when)} by their owners.`;
  const tail =
    i.requests === 0
      ? BOOKINGS_LINE
      : n === 1
        ? "You can request a free hour on its page; the turf confirms."
        : i.requests === n
          ? "You can request a free hour on their pages; the turf confirms."
          : `Some take requests on TapTurf; the turf confirms. ${BOOKINGS_LINE}`;
  return `${lead} ${tail}`;
}

/** Nothing at the time asked, but hours that day: "No turf in Bangalore has marked 7 PM tomorrow free. Dribble Den has other hours marked free tomorrow." */
export function freeWidenedReply(i: { names: string[]; where: string; asked: string; day: string; requests: number }): string {
  const n = i.names.length;
  const asked = i.asked.replace(/^at /, "");
  const lead = `No turf${i.where ? ` ${i.where}` : ""} has marked ${asked} free.`;
  const rest = n === 1 ? `${i.names[0]} has other hours marked free${withWhen(i.day)} by its owner.` : `${n} turfs have other hours marked free${withWhen(i.day)} by their owners.`;
  const tail = i.requests > 0 ? "The turf confirms any request." : BOOKINGS_LINE;
  return `${lead} ${rest} ${tail}`;
}

/**
 * None marked: said plainly, and what to do. cards: the usual cards for
 * the place follow (best rated, or nearest), to call or WhatsApp.
 */
export function freeNoneReply(i: { where: string; when: string; cards: "rated" | "nearest" | null; city: string | null }): string {
  const lead = `No turf${i.where ? ` ${i.where}` : ""} has marked free hours${forWhen(i.when)} on TapTurf yet.`;
  if (i.cards === "nearest") return `${lead} Call or WhatsApp a turf to ask. Here are the nearest.`;
  if (i.cards === "rated") return `${lead} Call or WhatsApp a turf to ask. Here are the best rated${i.city ? ` in ${i.city}` : ""}.`;
  return `${lead} Call or WhatsApp a turf to ask.`;
}

/** Near me with no location and no city: ask for one. */
export const FREE_WHERE_LINE = "Share your location or name your city, and I'll look for turfs near you with hours marked free.";

/** What to ask next after a free hours answer. */
export function freeFollowups(when: string, found: boolean): string[] {
  const next = /tomorrow/.test(when) ? "Any turf free tonight" : "Any turf free tomorrow";
  return found ? [next, "Any games tonight"] : [next, "Turfs open 24 hours", "Any games tonight"];
}

/**
 * One venue asked about ("is Dribble Den free tonight"): its marked hours,
 * other hours that day when the time asked isn't marked free (`otherDay`),
 * or that it has none marked (never that it is busy).
 */
export function freeVenueReply(i: { name: string; found: boolean; when: string; requests: boolean; otherDay?: string | null }): string {
  if (i.found && i.otherDay != null) {
    const tail = i.requests ? "You can request a free hour on its page; the turf confirms." : BOOKINGS_LINE;
    return `${i.name} hasn't marked ${i.when.replace(/^at /, "")} free. It has other hours marked free${withWhen(i.otherDay)} by its owner. ${tail}`;
  }
  if (i.found) return freeFoundReply({ names: [i.name], where: "", when: i.when, requests: i.requests ? 1 : 0 });
  return `${i.name} hasn't marked free hours${forWhen(i.when)} on TapTurf. Call or WhatsApp the turf to ask.`;
}

/** The free hours could not be read: said, and the usual cards follow. */
export const FREE_UNREAD_LINE = "I couldn't check the turfs' free hours just now. Call or WhatsApp a turf to ask.";

/** A reply that says a turf is free with certainty or a booking is instant: never ours (freeHours.test.ts checks every reply here). */
export const SURE_COPY = /\b(?:guarantee[ds]?|for sure|definitely (?:free|available)|book (?:now|instantly|online)|instant(?:ly)?|confirmed (?:free|slot)|100%)\b/i;

/** What a free hours answer to a list question is, before the route makes its cards (planFree). */
export type FreePlan = {
  /** found: turfs with hours marked free then; widened: none then, these that day; none: none marked; unread: the read failed. */
  kind: "found" | "widened" | "none" | "unread";
  /** Near the shared location (no city named). */
  near: boolean;
  /** The city looked in, or null (near, or nowhere known). */
  city: string | null;
  /** "in Bangalore", "near you" or "". */
  where: string;
  /** The window's words ("tonight", "at 7 PM tomorrow") or "". */
  when: string;
  picks: FreePick[];
  /** The reply for found and widened; the route says none and unread under its own cards (freeNoneReply). */
  reply: string | null;
};

/**
 * A free hours answer to "which turf is free ...": near the shared location
 * unless a city is named (`named`: the city the words or the reading name),
 * else that city, else the page's or the visitor's (`fallbackCity`); the
 * window the words name (freeWindow), or the next 36 hours; then the whole
 * of that day when nothing is free at the time itself. rows: the cached
 * read (null when it failed). names: a turf's name as replies say it.
 */
export function planFree(i: {
  rows: readonly FreeRow[] | null;
  turfs: ReadonlyMap<string, FreePickTurf>;
  names: (id: string) => string;
  cityLabel: (id: string) => string | null;
  window: FreeWindow | null;
  nowMs: number;
  named: string | null;
  fallbackCity: string | null;
  loc: Coords | null;
  plays?: ((sports: string[]) => boolean) | null;
  areas?: readonly string[];
}): FreePlan {
  const near = !!i.loc && !i.named;
  const city = near ? null : (i.named ?? i.fallbackCity ?? null);
  const label = city ? i.cityLabel(city) : null;
  const where = near ? "near you" : label ? `in ${label}` : "";
  const span = i.window ?? { fromMs: i.nowMs, toMs: i.nowMs + FREE_WINDOW_HOURS * HOUR, words: "" };
  const plan: FreePlan = { kind: "none", near, city, where, when: span.words, picks: [], reply: null };
  if (!i.rows) return { ...plan, kind: "unread" };
  const pick = (fromMs: number, toMs: number) =>
    pickFree(i.rows!, i.turfs, { city, loc: near ? i.loc : null, plays: i.plays ?? null, areas: i.areas, fromMs, toMs, nowMs: i.nowMs });
  let picks = pick(span.fromMs, span.toMs);
  if (picks.length) {
    const requests = picks.filter((p) => p.card.requests).length;
    return { ...plan, kind: "found", picks, reply: freeFoundReply({ names: picks.map((p) => i.names(p.id)), where, when: span.words, requests }) };
  }
  if (i.window?.wide) {
    picks = pick(i.window.wide.fromMs, i.window.wide.toMs);
    if (picks.length) {
      const requests = picks.filter((p) => p.card.requests).length;
      return { ...plan, kind: "widened", picks, reply: freeWidenedReply({ names: picks.map((p) => i.names(p.id)), where, asked: i.window.words, day: i.window.wide.words, requests }) };
    }
  }
  return plan;
}
