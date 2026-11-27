import { createKeptReader, type KeptDeps, type KeptReader } from "../keptAnswer";
import type { Format, Playoffs, Slot, Stage } from "./types";

/**
 * What is on at a turf right now, on the turf's own page (the site owner,
 * 27 Nov 2026: "if a tournament is setup or a live match is setup on turf
 * show that please on the turf page"). A live tournament whose organiser
 * picked a TapTurf turf as its venue (settings.venue, the picker in its
 * create and Manage sheets) and was signed in (it is kept with an account;
 * one made without signing in is on no turf's page, since the venue's id
 * comes from the browser and anyone could otherwise put any name on any
 * turf's page) shows on that turf's page while it is on: its
 * name, its format, when it started, how many matches are played, a link
 * to its points table and fixtures, its next match, and each of its
 * matches being scored right now as a "Live now" row linking to the live
 * scorecard. Never who organises it.
 *
 * A live match that is no tournament's fixture has only a venue name
 * someone typed, never a turf's id (two turfs can share a name), so it is
 * not shown: a match reaches a turf's page only through the tournament it
 * is a fixture of. A turf session made from a game on a listed turf is
 * such a tournament (it sends the game's turf as its venue, and only
 * someone signed in can make one), so it shows.
 *
 * The data is one small list for all of India, the same for everyone:
 * public.turf_events_now (supabase/migrations/20261128_turf_events.sql),
 * served by GET /api/turf-events (a minute in the data cache and at the
 * CDN). A turf page never reads it on the server (the page is cached a
 * week): the browser reads the list once per tab in TURF_EVENTS_KEEP_MS,
 * only when the page is loaded, idle and on screen, never on the admin,
 * myTapturf, an owner's report or the email pages and never for a crawler
 * (components/turf/useTurfEvents.ts; the rules are lib/keptAnswer.ts, the
 * ones Trending by views has). A failed read shows nothing.
 *
 * This file is the list read back without trusting it, the tab's kept
 * copy, and every word the card says. It imports nothing that runs but
 * the kept-answer rules, so the turf page does not carry the tournament
 * page's code: the format's words, the progress line, "Started 16 Nov",
 * the next match and the link's words are the tournament page's own,
 * written again here and pinned to them by turfEvents.test.ts (npm run
 * test:tournament).
 */

export const TURF_EVENTS_URL = "/api/turf-events";
/** One read per tab in this long. */
export const TURF_EVENTS_KEEP_MS = 5 * 60_000;
export const TURF_EVENTS_STORE_KEY = "tt_turf_events_v1";
/** The read answers this many turfs and tournaments a turf at most (20261128_turf_events.sql); more than that is not kept. */
export const TURF_EVENTS_MAX_TURFS = 200;
export const TURF_EVENTS_MAX_EACH = 3;
const MAX_LIVE = 3;

/** A fixture being scored right now: its live scorecard's code and the two sides as the tournament names them. */
export type TurfLive = { code: string; home: string | null; away: string | null };
export type TurfNext = { stage: Stage; slot: Slot | null; n: number | null; home: string | null; away: string | null; day: string | null; time: string | null };
export type TurfTournament = {
  code: string;
  name: string;
  format: Format;
  legs: 1 | 2;
  matches: number;
  playoffs: Playoffs;
  /** India's calendar date it was put on TapTurf, YYYY-MM-DD. */
  started: string;
  /** The start date the organiser gave it, or null. */
  starts: string | null;
  played: number;
  total: number;
  live: TurfLive[];
  next: TurfNext | null;
};
export type TurfEvents = { turf: string; tournaments: TurfTournament[] };

/* ------------------------------------------------------------------ */
/* The list, read back without trusting it                             */
/* ------------------------------------------------------------------ */

const CODE_RE = /^[a-z0-9]{12}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const FORMATS: readonly Format[] = ["league", "bilateral", "tri"];
const PLAYOFFS: readonly Playoffs[] = ["none", "final", "semis"];
const STAGES: readonly Stage[] = ["league", "semi", "final"];
const SLOTS: readonly Slot[] = ["s1", "s2", "f"];

const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const oneLine = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const count = (x: unknown, min: number, max: number) => (typeof x === "number" && Number.isInteger(x) && x >= min && x <= max ? x : null);
const day = (x: unknown) => (typeof x === "string" && DAY_RE.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`)) ? x : null);

function toNext(x: unknown): TurfNext | null {
  const o = obj(x);
  const stage = STAGES.find((s) => s === o?.stage);
  if (!o || !stage) return null;
  return {
    stage,
    slot: SLOTS.find((s) => s === o.slot) ?? null,
    n: stage === "league" ? count(o.n, 1, 300) : null,
    home: oneLine(o.home, 30) || null,
    away: oneLine(o.away, 30) || null,
    day: day(o.day),
    time: typeof o.time === "string" && TIME_RE.test(o.time) ? o.time : null,
  };
}

function toTournament(x: unknown): TurfTournament | null {
  const o = obj(x);
  if (!o) return null;
  const name = oneLine(o.name, 60);
  const format = FORMATS.find((f) => f === o.format);
  const started = day(o.started);
  const total = count(o.total, 0, 300);
  if (typeof o.code !== "string" || !CODE_RE.test(o.code) || !name || !format || !started || total === null) return null;
  const live: TurfLive[] = [];
  for (const l of Array.isArray(o.live) ? o.live : []) {
    const v = obj(l);
    if (v && typeof v.code === "string" && CODE_RE.test(v.code) && !live.some((y) => y.code === v.code)) live.push({ code: v.code, home: oneLine(v.home, 30) || null, away: oneLine(v.away, 30) || null });
    if (live.length >= MAX_LIVE) break;
  }
  return {
    code: o.code,
    name,
    format,
    legs: o.legs === 2 ? 2 : 1,
    matches: count(o.matches, 0, 99) ?? 0,
    playoffs: PLAYOFFS.find((p) => p === o.playoffs) ?? "none",
    started,
    starts: day(o.starts),
    played: Math.min(count(o.played, 0, 300) ?? 0, total),
    total,
    live,
    next: toNext(o.next),
  };
}

/**
 * public.turf_events_now's answer (or the route's, or the tab's kept
 * copy), or null when it is not a list at all (a refusal, {r}). An entry
 * that is not whole is left out, never guessed at; a turf is listed once,
 * with at most three tournaments, and only when it has one.
 */
export function toTurfEvents(data: unknown): TurfEvents[] | null {
  if (!Array.isArray(data)) return null;
  const out: TurfEvents[] = [];
  const seen = new Set<string>();
  for (const x of data) {
    const o = obj(x);
    if (!o || typeof o.turf !== "string" || !UUID_RE.test(o.turf) || seen.has(o.turf) || !Array.isArray(o.tournaments)) continue;
    const tournaments: TurfTournament[] = [];
    for (const t of o.tournaments) {
      const r = toTournament(t);
      if (r && !tournaments.some((y) => y.code === r.code)) tournaments.push(r);
      if (tournaments.length >= TURF_EVENTS_MAX_EACH) break;
    }
    if (!tournaments.length) continue;
    seen.add(o.turf);
    out.push({ turf: o.turf, tournaments });
    if (out.length >= TURF_EVENTS_MAX_TURFS) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The tab's copy                                                      */
/* ------------------------------------------------------------------ */

/** The route's answer as a page holds it: when it was read, and each turf's tournaments by the turf's id. */
export type EventsNow = { at: number; list: readonly TurfEvents[]; byTurf: ReadonlyMap<string, readonly TurfTournament[]> };

function shape(at: number, list: TurfEvents[]): EventsNow {
  return { at, list, byTurf: new Map(list.map((t) => [t.turf, t.tournaments])) };
}

/** The route's JSON ({ turfs: [...] }) read at `at`. Anything else is nothing on anywhere. */
export function eventsNow(json: unknown, at: number): EventsNow {
  return shape(at, toTurfEvents(obj(json)?.turfs) ?? []);
}

/** Nothing on anywhere (a failed read, too): no turf page shows anything. */
export function noEvents(at: number): EventsNow {
  return shape(at, []);
}

/** The text kept in sessionStorage: the time of the read and the route's own key. */
export function eventsText(t: EventsNow): string {
  return JSON.stringify({ at: t.at, turfs: t.list });
}

/** Read within the last TURF_EVENTS_KEEP_MS. A time ahead of the clock (the clock went back) is not fresh. */
export function eventsFresh(t: EventsNow | null, now: number): boolean {
  return !!t && t.at <= now && now - t.at < TURF_EVENTS_KEEP_MS;
}

/** The kept text read back without trusting it, or null when there is none, it is not that shape, or it is no longer fresh. */
export function readKeptEvents(text: string | null | undefined, now: number): EventsNow | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text) as { at?: unknown } | null;
    if (!v || typeof v !== "object" || typeof v.at !== "number" || !Number.isFinite(v.at)) return null;
    const t = eventsNow(v, v.at);
    return eventsFresh(t, now) ? t : null;
  } catch {
    return null;
  }
}

/** A turf's tournaments, or null when nothing is on there (or nothing is known). By the turf's id: the venue is kept by id, never by name. */
export function eventsAt(t: EventsNow | null | undefined, turfId: string | null | undefined): readonly TurfTournament[] | null {
  if (!t || !turfId) return null;
  const list = t.byTurf.get(turfId.toLowerCase());
  return list?.length ? list : null;
}

export type TurfEventsReader = KeptReader<EventsNow>;

/** One reader per page: lib/keptAnswer.ts's rules, with this answer. */
export function createTurfEventsReader(d: KeptDeps): TurfEventsReader {
  return createKeptReader<EventsNow>(d, { fromJson: eventsNow, none: noEvents, text: eventsText, readKept: readKeptEvents, fresh: eventsFresh });
}

/* ------------------------------------------------------------------ */
/* The words                                                           */
/* ------------------------------------------------------------------ */

export const EVENTS_HEADING = "On at this turf";
/** The heading when every tournament listed is still to start (the site owner, 27 Nov 2026, of one set up two weeks ahead). */
export const EVENTS_HEADING_SOON = "Coming up at this turf";
export const LIVE_LABEL = "Live now";

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayNumber = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY_MS);

/** India's calendar date at an instant, "2026-11-16". */
export function indiaDay(ms: number): string {
  return new Date(ms + IST_MS).toISOString().slice(0, 10);
}

/** The format in a few words, as the tournament page's masthead has it (lib/tournament/standings.ts formatLabel): "League + semi-finals", "Double round robin", "3-match series". */
export function formatWords(t: Pick<TurfTournament, "format" | "legs" | "matches" | "playoffs">): string {
  if (t.format === "bilateral") return `${t.matches}-match series`;
  const base = t.format === "tri" ? "Tri-series" : t.legs === 2 ? "Double round robin" : "League";
  return t.playoffs === "semis" ? `${base} + semi-finals` : t.playoffs === "final" ? `${base} + final` : base;
}

/**
 * "Started today", "Started yesterday", "Started 16 Nov" (with the year
 * when it is not this one), by India's calendar; "Set up 10 Nov" when the
 * organiser gave it a start date of its own on another day. The
 * tournament page's own words (lib/tournament/about.ts startVerb, startedDay).
 */
export function startedWords(t: Pick<TurfTournament, "started" | "starts">, now: number): string {
  const verb = t.starts && t.starts !== t.started ? "Set up" : "Started";
  const today = indiaDay(now);
  const days = dayNumber(today) - dayNumber(t.started);
  if (days <= 0) return `${verb} today`;
  if (days === 1) return `${verb} yesterday`;
  const d = new Date(`${t.started}T00:00:00Z`);
  const y = d.getUTCFullYear();
  return `${verb} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${y === Number(today.slice(0, 4)) ? "" : ` ${y}`}`;
}

/**
 * Still to start: the organiser gave it a start date after today in India,
 * and nothing of it has been played or is being scored. One with no start
 * date of its own, or with a result or a match on, is on.
 */
export function comingUp(t: Pick<TurfTournament, "starts" | "played" | "live">, now: number): boolean {
  return !!t.starts && t.starts > indiaDay(now) && t.played === 0 && t.live.length === 0;
}

/** "Starts tomorrow", "Starts Sat 12 Dec" (with the year when it is not this one), by India's calendar. */
export function startsWords(starts: string, now: number): string {
  const today = indiaDay(now);
  if (dayNumber(starts) - dayNumber(today) === 1) return "Starts tomorrow";
  const d = new Date(`${starts}T00:00:00Z`);
  const y = d.getUTCFullYear();
  return `Starts ${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${y === Number(today.slice(0, 4)) ? "" : ` ${y}`}`;
}

/** "7 matches", "1 match", "No matches yet": how many one still to start has. */
export function matchesWords(total: number): string {
  if (total <= 0) return "No matches yet";
  return `${total} ${total === 1 ? "match" : "matches"}`;
}

/** "4 of 6 matches played", "1 of 1 match played", "No matches yet" (lib/tournament/about.ts progressWords). */
export function playedWords(played: number, total: number): string {
  if (total <= 0) return "No matches yet";
  return `${Math.max(0, Math.min(played, total))} of ${total} ${total === 1 ? "match" : "matches"} played`;
}

function timeWords(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (h === 12 && m === 0) return "12 noon";
  const hh = ((h + 11) % 12) + 1;
  return m ? `${hh}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}` : `${hh} ${h >= 12 ? "pm" : "am"}`;
}

/** "Next: Match 4 · Strikers v Kings · Sat 28 Nov, 7:30 pm"; a playoff place not filled yet is just "Next: Final" (lib/tournament/scorecard.ts nextLine). */
export function nextWords(n: TurfNext): string {
  const name = n.stage === "final" ? "Final" : n.stage === "semi" ? (n.slot === "s2" ? "Semi-final 2" : "Semi-final 1") : n.n ? `Match ${n.n}` : "Match";
  const d = n.day ? new Date(`${n.day}T00:00:00Z`) : null;
  const when = [d ? `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : null, n.time ? timeWords(n.time) : null].filter(Boolean).join(", ");
  return `Next: ${[name, n.home && n.away ? `${n.home} v ${n.away}` : null, when || null].filter(Boolean).join(" · ")}`;
}

/** What the link to the tournament says, as the live scorecard's banner says it (lib/tournament/scorecard.ts bannerOf). */
export function tableLinkWords(format: Format): string {
  return format === "bilateral" ? "Series score and fixtures" : "Points table and fixtures";
}

/** "Titans v Kings"; a side not known yet (a playoff place not filled) is "A match". */
export function sidesWords(l: Pick<TurfLive, "home" | "away">): string {
  return l.home && l.away ? `${l.home} v ${l.away}` : "A match";
}

export type EventLive = {
  /** /live/<code> */
  href: string;
  /** "Titans v Kings" */
  sides: string;
  /** For a screen reader: "Live now: Titans v Kings, Sunday Box League. Open the live scorecard" */
  says: string;
};

export type EventItem = {
  code: string;
  name: string;
  /** Its matches being scored right now. */
  live: EventLive[];
  /** "League + final", "Started 16 Nov", "4 of 6 matches played"; for one still to start, "League + final", "Starts Sat 12 Dec", "7 matches" */
  facts: string[];
  /** "Next: Match 5 · Strikers v Kings · Sat 28 Nov, 7:30 pm": only while nothing of it is being scored, and there is a match to come. */
  next: string | null;
  /** /tournament/<code> */
  href: string;
  /** "Points table and fixtures" */
  link: string;
  /** For a screen reader: "Points table and fixtures: Sunday Box League" */
  linkSays: string;
};

export type EventsCard = { heading: string; items: EventItem[] };

/**
 * Everything the card on a turf's page says, for the moment `now`; null
 * when nothing is on at this turf, and the page then looks exactly as it
 * always did.
 */
export function eventsCard(list: readonly TurfTournament[] | null | undefined, now: number): EventsCard | null {
  if (!list?.length) return null;
  const items = list.slice(0, TURF_EVENTS_MAX_EACH).map((t): EventItem => {
    const link = tableLinkWords(t.format);
    return {
      code: t.code,
      name: t.name,
      live: t.live.map((l) => {
        const sides = sidesWords(l);
        return { href: `/live/${l.code}`, sides, says: `${LIVE_LABEL}: ${sides}, ${t.name}. Open the live scorecard` };
      }),
      facts: t.starts && comingUp(t, now) ? [formatWords(t), startsWords(t.starts, now), matchesWords(t.total)] : [formatWords(t), startedWords(t, now), playedWords(t.played, t.total)],
      next: t.next && !t.live.length ? nextWords(t.next) : null,
      href: `/tournament/${t.code}`,
      link,
      linkSays: `${link}: ${t.name}`,
    };
  });
  // "Coming up" only when nothing listed has started; one that is on makes the card "On at this turf", and each still says its own start.
  const shown = list.slice(0, TURF_EVENTS_MAX_EACH);
  return { heading: shown.every((t) => comingUp(t, now)) ? EVENTS_HEADING_SOON : EVENTS_HEADING, items };
}
