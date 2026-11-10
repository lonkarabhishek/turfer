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
const GAME = / (?:game|games|squad|pickup|join|joining|anyone|anybody|someone|somebody) /;
/** Players wanted ("need 2 players tonight", "looking for a team"): a game too. */
const PLAYERS_WANTED = / (?:need|needs|needed|looking for|want|wanted) (?:\d+ |a |an |some |more |few |a few )?(?:player|players|people|teammate|teammates|partner|partners|opponent|opponents|team) /;
/** "Match" is a game too, unless a venue is asked for ("a turf free for our match tonight"). */
const MATCH = / (?:match|matches) /;
const VENUE = / (?:turf|turfs|truf|ground|grounds|court|courts|cage|cages|venue|venues|arena|arenas|field|fields|slot|slots) /;
/**
 * What "available", "free" or "empty" can be said of that is no hour: a
 * facility, a price or people ("is parking available", "washrooms
 * available", "free coaching", "entry is free", "players available
 * tonight", "are you free").
 */
const THINGS = [
  "parking", "parking space", "parking lot", "washroom", "washrooms", "toilet", "toilets", "restroom", "restrooms", "bathroom", "bathrooms",
  "shower", "showers", "changing room", "changing rooms", "locker", "lockers", "coaching", "coach", "coaches", "trainer", "trainers", "training",
  "equipment", "equipments", "gear", "kit", "kits", "bat", "bats", "ball", "balls", "racket", "rackets", "racquet", "racquets", "shoes", "bibs",
  "floodlight", "floodlights", "flood light", "flood lights", "light", "lights", "lighting", "water", "drinking water", "wifi", "wi fi", "cafe",
  "canteen", "food", "snacks", "seating", "sitting area", "first aid", "sport", "sports", "entry", "fee", "fees", "charge", "charges", "cost",
  "price", "prices", "membership", "trial", "rent", "rental", "umpire", "referee", "scorer", "bowling machine", "power backup",
  "player", "players", "people", "teammate", "teammates", "partner", "partners", "opponent", "opponents", "members", "you", "u",
].join("|");
const SAID_OF = "(?:available|availability|avail|free|empty|vacant)";
/** "Free", "available" or "empty" said of one of THINGS, or of a price: never an hour. Taken out before the words are read. */
const NOT_HOURS = new RegExp(
  [
    ` (?:${THINGS}) (?:is |are |also |is also |are also |not )?${SAID_OF}(?= )`,
    ` ${SAID_OF} (?:of |for )?(?:${THINGS})(?= )`,
    " (?:for free|free of cost|free of charge|no fee|no fees|free to join|free to play|free to use)(?= )",
    " free for (?:kids|children|women|girls|ladies|students|members|everyone|all)(?= )",
  ].join("|"),
  "g",
);
/** An hour asked for whatever else the words say: free, vacant, slots, availability, khali (Hindi), rikama (Marathi). */
const FREE_WORD = / (?:free|vacant|khali|khaali|rikama|rikame|slot|slots|availability) /;
/** An hour asked for when the words also name a turf, a time or near me: "turfs available in Pune", "any turf empty tonight". */
const SOFT_WORD = / (?:available|avail|empty) /;
/** Near the player. */
const NEAR_WORD = / (?:near me|nearby|near by|around me|close to me|closest|nearest|paas|aas paas) /;
/** Booking with a time named: "can I book a turf tonight". */
const BOOK_WORD = / (?:book|booking|reserve) /;
/** Any word that could make it a free hours question: the route reads no more when none is there. */
const MAYBE = / (?:free|vacant|khali|khaali|rikama|rikame|slot|slots|availability|available|avail|empty|book|booking|reserve) /;

/** Whether the words could ask for a free hour at all (cheap; asksFreeHours decides). */
export function mayAskFreeHours(q: string): boolean {
  return MAYBE.test(clean(q));
}

/**
 * True when the question asks which turf has a free hour ("which turf is
 * available near me", "any turf free tonight", "free turf tomorrow 7 PM
 * in Bangalore", "aaj raat koi turf khali hai"), and not a game ("free
 * games", "free box cricket match", "players available tonight"), a price
 * or a facility ("free parking", "for free", "is parking available",
 * "turfs with washroom available") or opening hours ("open now" alone).
 * "Available" or "empty" alone counts with a turf, a time or near me. A
 * booking asked with a time counts ("book a turf tonight"): the marked
 * hours are what we have.
 *
 * venue: asked of one venue ("is Dribble Den free tonight"), with its
 * name already out of the words (withoutNames): "available" or "empty" is
 * enough, but "available for box cricket" asks what it offers, not an
 * hour, unless a time is named.
 */
export function asksFreeHours(q: string, nowMs: number = Date.now(), venue = false): boolean {
  let s = clean(q).replace(NOT_HOURS, "");
  if (!s.endsWith(" ")) s += " ";
  if (GAME.test(s) || PLAYERS_WANTED.test(s) || (MATCH.test(s) && !VENUE.test(s))) return false;
  const timed = freeWindow(s, nowMs) != null;
  if (venue) {
    if (!timed) s = s.replace(/ (?:free|available|avail|empty|vacant) for .*$/, " ");
    return FREE_WORD.test(s) || SOFT_WORD.test(s) || (timed && BOOK_WORD.test(s));
  }
  if (FREE_WORD.test(s)) return true;
  if (SOFT_WORD.test(s) && (VENUE.test(s) || timed || NEAR_WORD.test(s))) return true;
  return BOOK_WORD.test(s) && timed;
}

/**
 * The words without the venue names in them, so a name is never read as a
 * time or a free hour: "Night Owl Turf" is no night, "Free Kick Arena" no
 * free hour. names: the reading's turf_names and the venue found; a name
 * of under three letters is left in.
 */
export function withoutNames(q: string, names: readonly (string | null | undefined)[]): string {
  let s = clean(q);
  for (const n of names) {
    const name = clean(n ?? "").trim();
    if (name.length >= 3) s = s.split(` ${name} `).join(" ");
  }
  return s;
}

/** How Ask answers a free hours question: of a list of turfs, of one venue, or not at all (null). */
export type FreeMode = "list" | "venue" | null;

/**
 * Whether Ask answers from the owners' marked hours, and the time asked:
 * the words without the venue names (withoutNames), read as a question of
 * one venue when one is named (`venue`: a question about one, the page's
 * own, or a search the reading gave a venue name) and else of a list. A
 * turf search, small talk ("other") or a question; never a game search.
 * carries: the last answer was a free hours one, so a follow-up that only
 * names a time ("and tomorrow?") asks the same.
 */
export function freeAsk(i: { q: string; nowMs: number; intent: string; names: readonly (string | null | undefined)[]; venue: boolean; carries: boolean }): { mode: FreeMode; window: FreeWindow | null } {
  const text = withoutNames(i.q, i.names);
  const window = freeWindow(text, i.nowMs);
  const followup = i.carries && window != null;
  const listy = i.intent === "find_turf" || i.intent === "other";
  if (i.intent !== "question" && !listy) return { mode: null, window };
  if (i.venue) return { mode: asksFreeHours(text, i.nowMs, true) || (followup && i.intent !== "other") ? "venue" : null, window };
  if (i.intent === "question") return { mode: asksFreeHours(text, i.nowMs, true) ? "list" : null, window };
  return { mode: asksFreeHours(text, i.nowMs) || (followup && i.intent === "find_turf") ? "list" : null, window };
}

/**
 * The city a free hours answer to a list is bounded by: the one the
 * player's words name (askedCity), else the reading's, which near me with
 * a location shared gives way, as a turf search's does (lib/ai/ask.ts
 * applyAskFilters: the quick reading puts the page's city there for "near
 * me"). Null: near the location, or the page's or visitor's city
 * (planFree's fallbackCity).
 */
export function freeNamedCity(i: { askedCity: string | null; readingCity: string | null; wantsNearby: boolean; hasLoc: boolean }): string | null {
  return i.askedCity ?? (i.wantsNearby && i.hasLoc ? null : i.readingCity);
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
const istHour = (ms: number) => new Date(ms + IST).getUTCHours();
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
  const tomorrow = plusDays(today, 1);
  const yesterday = plusDays(today, -1);
  const dayName = (d: string) => (d === today ? "today" : d === tomorrow ? "tomorrow" : d < today ? "tonight" : `on ${NAMES[weekdayOf(d)]}`);

  if (clock != null) {
    let at: number;
    if (date) {
      // A day named: its hour, or with a night word its night's ("kal raat 1 baje" is after tomorrow's midnight).
      at = startOf(date) + (night && clock < 5 * 60 ? clock + 1440 : clock) * MIN;
    } else {
      // No day: the next time the hour comes ("1 AM" at 11 PM is in two hours, at 12:30 AM in half an
      // hour); one that has gone today is tomorrow's.
      at = startOf(today) + clock * MIN;
      if (at + 30 * MIN <= nowMs) at += DAY;
    }
    // Its business day (an hour after midnight is the night before's), whose other hours are tried when it isn't free.
    const businessDay = dateOf(at - 4 * HOUR);
    return {
      fromMs: Math.max(nowMs, at - 30 * MIN),
      toMs: at + 31 * MIN,
      words: `at ${clockLabel(clock)} ${hourWord(at, nowMs, night)}`,
      wide: whole(businessDay, dayName(businessDay)),
    };
  }
  const p = part!;
  let d = date ?? today;
  let from = startOf(d) + p.from * MIN;
  let to = startOf(d) + p.to * MIN;
  if (!date) {
    // In the small hours, a part of the night still running is last night's: "tonight" at 12:30 AM is until 4 AM,
    // as the cards call those hours tonight's; its other hours tried are today's.
    const lastTo = startOf(yesterday) + p.to * MIN;
    if (p.to > 1440 && lastTo > nowMs) {
      return { fromMs: nowMs, toMs: lastTo, words: p.words[0], wide: whole(today, "today") };
    }
    if (to <= nowMs) {
      d = tomorrow;
      from += DAY;
      to += DAY;
    }
  }
  const words = d === today ? p.words[0] : d === tomorrow ? `tomorrow ${p.words[1]}` : `on ${NAMES[weekdayOf(d)]} ${p.words[1]}`;
  return { fromMs: Math.max(nowMs, from), toMs: to, words, wide: whole(d, dayName(d)) };
}

/**
 * The day an hour is said with, as the list cards say it (lib/availability/free.ts dayWord): an hour before
 * 5 AM in the coming night is "tonight" (12 AM at 11:30 PM, 1 AM at 12:30 AM), else "today", "tomorrow" or
 * "on Thursday"; an evening hour today is "tonight" when the words said night.
 */
function hourWord(at: number, nowMs: number, night: boolean): string {
  const today = dateOf(nowMs);
  const date = dateOf(at);
  const small = istHour(at) < 5;
  const nowSmall = istHour(nowMs) < 5;
  if (date === today) return small ? (nowSmall ? "tonight" : "today") : night ? "tonight" : "today";
  if (date === plusDays(today, 1)) return small && !nowSmall ? "tonight" : "tomorrow";
  return `on ${NAMES[weekdayOf(date)]}`;
}

/** The reader's window for a question: the lists' 36 hours, or 8 days for a time further off. */
export function readerHours(w: FreeWindow | null, nowMs: number): number {
  const end = Math.max(w?.toMs ?? 0, w?.wide?.toMs ?? 0);
  return end - nowMs > FREE_WINDOW_HOURS * HOUR ? FREE_WINDOW_MAX_HOURS : FREE_WINDOW_HOURS;
}

/** What a free hours answer picks from: the reader's rows and, per id, the turf's sports and place from Ask's own rows. */
export type FreePickTurf = { id: string; city: string | null; sports: string[]; lat: number | null; lng: number | null; area: string | null };
export type FreePick = { id: string; card: FreeCard; km: number | null; inArea?: boolean };

/**
 * The turfs with an hour marked free in [fromMs, toMs): near `loc`
 * (within FREE_NEAR_KM, nearest first) when there is one and no city is
 * asked for, else in `city`, else anywhere; of the sport (`plays`) and
 * meeting the reading's other filters (`keep`), and those in a named area
 * first (`inArea`). Each card holds only its free hours in the
 * window. Only turfs Ask's rows have (active, listed) count.
 */
export function pickFree(
  rows: readonly FreeRow[],
  turfs: ReadonlyMap<string, FreePickTurf>,
  opts: {
    city: string | null;
    loc: Coords | null;
    plays?: ((sports: string[]) => boolean) | null;
    /** The reading's other filters (lib/ask/freeFilters.ts freeKeep): only the turfs they keep. */
    keep?: ((id: string) => boolean) | null;
    areas?: readonly string[];
    fromMs: number;
    toMs: number;
    nowMs: number;
    limit?: number;
  },
): FreePick[] {
  const areas = (opts.areas ?? []).map((a) => a.toLowerCase()).filter(Boolean);
  const out: (FreePick & { inArea: boolean; i: number })[] = [];
  rows.forEach((r, i) => {
    const t = turfs.get(r.id);
    if (!t) return;
    if (opts.plays && !opts.plays(t.sports)) return;
    if (opts.keep && !opts.keep(r.id)) return;
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
  return out.slice(0, opts.limit ?? FREE_ASK_LIMIT).map(({ id, card, km, inArea }) => (areas.length ? { id, card, km, inArea } : { id, card, km }));
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
 * filtered: the reading's other filters (a budget, facilities) were asked
 * for, so other turfs there may have hours marked: none that matches.
 */
export function freeNoneReply(i: { where: string; when: string; cards: "rated" | "nearest" | null; city: string | null; filtered?: boolean }): string {
  const lead = `No turf${i.where ? ` ${i.where}` : ""}${i.filtered ? " that matches what you asked" : ""} has marked free hours${forWhen(i.when)} on TapTurf yet.`;
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

/** A venue asked about that TapTurf doesn't list (no match for the name typed): said, never the model's words. */
export function freeNotFoundLine(name: string): string {
  return `I couldn't find ${name} on TapTurf.`;
}

/** A name as the player typed it in their words (the reading may have changed its case), with a capital first letter. */
export function nameAsTyped(q: string, name: string): string {
  const at = q.toLowerCase().indexOf(name.toLowerCase());
  const typed = at >= 0 ? q.slice(at, at + name.length) : name;
  return typed.charAt(0).toUpperCase() + typed.slice(1);
}

/**
 * One venue's free hours answer: its hours marked free in the window asked
 * (the next 36 hours when no time is named), else its other free hours
 * that day (the window's `wide`), else none marked. row: the venue's row
 * in the read, or none (no hours marked showing); read: false when the
 * read failed (said, never "none marked").
 */
export function planFreeVenue(i: { row: FreeRow | null | undefined; read: boolean; name: string; window: FreeWindow | null; nowMs: number }): { card: FreeCard | null; reply: string; when: string } {
  const span = i.window ?? { fromMs: i.nowMs, toMs: i.nowMs + FREE_WINDOW_HOURS * HOUR, words: "" };
  if (!i.read) return { card: null, reply: FREE_UNREAD_LINE, when: span.words };
  const exact = i.row ? freeCardOf(i.row, i.nowMs, span.toMs, span.fromMs) : null;
  // Not at the time asked: its other free hours that day, said as such.
  const wide = i.window?.wide;
  const other = !exact && i.row && wide ? freeCardOf(i.row, i.nowMs, wide.toMs, wide.fromMs) : null;
  const card = exact ?? other;
  return {
    card,
    reply: freeVenueReply({ name: i.name, found: !!card, when: span.words, requests: !!card?.requests, otherDay: other && wide ? wide.words : null }),
    when: span.words,
  };
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
  /** The reading's other filters were applied; with none shown, other turfs there have hours marked (the none reply says "that matches what you asked"). */
  filtered: boolean;
  /** An area was asked for and no turf in it has hours marked free then: the cards are the place's, said so, and no area chip goes over them. */
  areaMissed?: boolean;
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
  /** The reading's other filters (lib/ask/freeFilters.ts freeKeep), when any was asked. */
  keep?: ((id: string) => boolean) | null;
  areas?: readonly string[];
  /** Near me was asked: with neither a location nor a city to go by, the reply says where the turfs are and asks for one. */
  wantsNearby?: boolean;
}): FreePlan {
  const near = !!i.loc && !i.named;
  const city = near ? null : (i.named ?? i.fallbackCity ?? null);
  const label = city ? i.cityLabel(city) : null;
  const span = i.window ?? { fromMs: i.nowMs, toMs: i.nowMs + FREE_WINDOW_HOURS * HOUR, words: "" };
  const plan: FreePlan = { kind: "none", near, city, where: near ? "near you" : label ? `in ${label}` : "", when: span.words, picks: [], reply: null, filtered: !!i.keep };
  if (!i.rows) return { ...plan, kind: "unread", filtered: false };
  const pick = (fromMs: number, toMs: number, keep = i.keep ?? null) =>
    pickFree(i.rows!, i.turfs, { city, loc: near ? i.loc : null, plays: i.plays ?? null, keep, areas: i.areas, fromMs, toMs, nowMs: i.nowMs });
  // Nowhere to go by (no location, no city): the turfs' own city when they share one, never read as "near you".
  const whereOf = (picks: FreePick[]) => {
    if (plan.where) return plan.where;
    const cities = new Set(picks.map((p) => i.turfs.get(p.id)?.city ?? null));
    const only = cities.size === 1 ? [...cities][0] : null;
    const shared = only ? i.cityLabel(only) : null;
    return shared ? `in ${shared}` : "";
  };
  const askWhere = !near && !city && !!i.wantsNearby ? ` ${FREE_WHERE_LINE}` : "";
  // An area asked for ("free turf in Koramangala tonight"): only the turfs in it; with none there, the place's,
  // after saying so ("No turf in Koramangala has marked free hours for tonight.").
  const area = (i.areas ?? []).find((a) => a.trim()) ?? null;
  const inArea = (all: FreePick[], when: string) => {
    if (!area) return { picks: all, lead: "", areaMissed: false };
    const inside = all.filter((p) => p.inArea);
    return inside.length ? { picks: inside, lead: "", areaMissed: false } : { picks: all, lead: `No turf in ${area} has marked free hours${forWhen(when)}. `, areaMissed: true };
  };
  const found = inArea(pick(span.fromMs, span.toMs), span.words);
  if (found.picks.length) {
    const { picks, lead, areaMissed } = found;
    const requests = picks.filter((p) => p.card.requests).length;
    const where = whereOf(picks);
    return { ...plan, kind: "found", where, picks, areaMissed, reply: `${lead}${freeFoundReply({ names: picks.map((p) => i.names(p.id)), where, when: span.words, requests })}${askWhere}` };
  }
  if (i.window?.wide) {
    const widened = inArea(pick(i.window.wide.fromMs, i.window.wide.toMs), i.window.words);
    if (widened.picks.length) {
      const { picks, lead, areaMissed } = widened;
      const requests = picks.filter((p) => p.card.requests).length;
      const where = whereOf(picks);
      return {
        ...plan,
        kind: "widened",
        where,
        picks,
        areaMissed,
        reply: `${lead}${freeWidenedReply({ names: picks.map((p) => i.names(p.id)), where, asked: i.window.words, day: i.window.wide.words, requests })}${askWhere}`,
      };
    }
  }
  // None: "that matches what you asked" only when the filters are why (other turfs there have hours marked then).
  const others = !!i.keep && (pick(span.fromMs, span.toMs, null).length > 0 || (!!i.window?.wide && pick(i.window.wide.fromMs, i.window.wide.toMs, null).length > 0));
  return { ...plan, filtered: others };
}
