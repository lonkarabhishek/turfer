import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { KeptDeps } from "../keptAnswer";
import { trendPath } from "../map/trendingClient";
import { progressWords, startVerb, startedDay } from "./about";
import { bannerOf, nextLine, type LiveTournament } from "./scorecard";
import { formatLabel } from "./standings";
import type { Format, Playoffs } from "./types";
import {
  EVENTS_HEADING,
  LIVE_LABEL,
  TURF_EVENTS_KEEP_MS,
  TURF_EVENTS_MAX_EACH,
  TURF_EVENTS_MAX_TURFS,
  TURF_EVENTS_STORE_KEY,
  TURF_EVENTS_URL,
  createTurfEventsReader,
  eventsAt,
  eventsCard,
  eventsFresh,
  eventsNow,
  eventsText,
  formatWords,
  indiaDay,
  nextWords,
  noEvents,
  playedWords,
  readKeptEvents,
  sidesWords,
  startedWords,
  tableLinkWords,
  toTurfEvents,
  type TurfNext,
  type TurfTournament,
} from "./turfEvents";

const T = (n: number) => `abcdef11-1111-4111-8111-${String(n).padStart(12, "0")}`;
const C = (n: number) => `t${String(n).padStart(11, "0")}`;
const L = (n: number) => `l${String(n).padStart(11, "0")}`;
const MIN = 60_000;
/** Fri 27 Nov 2026, 12 noon in India. */
const T0 = Date.parse("2026-11-27T12:00:00+05:30");

const NEXT: TurfNext = { stage: "league", slot: null, n: 5, home: "Strikers", away: "Kings", day: "2026-11-28", time: "19:30" };
/** A tournament as public.turf_events_now answers it (20261128_turf_events.sql). */
const league = (o: Partial<TurfTournament> = {}): TurfTournament => ({ code: C(1), name: "Sunday Box League", format: "league", legs: 1, matches: 0, playoffs: "none", started: "2026-11-16", starts: null, played: 4, total: 6, live: [], next: NEXT, ...o });
const series = (o: Partial<TurfTournament> = {}): TurfTournament => league({ code: C(2), name: "Titans v Strikers", format: "bilateral", matches: 3, played: 1, total: 3, next: { ...NEXT, n: 2, home: "Titans", away: "Strikers", day: null, time: null }, ...o });
/** The route's answer: Kings has a league with a match on now, Greenfield a league and a series. */
const answer = () => ({
  turfs: [
    { turf: T(1), tournaments: [league({ live: [{ code: L(1), home: "Titans", away: "Kings" }] })] },
    { turf: T(2), tournaments: [league({ code: C(3), name: "Walk-in League" }), series()] },
  ],
});

/* ------------------------------------------------------------------ */
/* The words                                                           */
/* ------------------------------------------------------------------ */

test("the card for a turf with one tournament and a match being scored now", () => {
  const card = eventsCard(eventsAt(eventsNow(answer(), T0), T(1)), T0);
  assert.deepEqual(card, {
    heading: "On at this turf",
    items: [
      {
        code: C(1),
        name: "Sunday Box League",
        live: [{ href: `/live/${L(1)}`, sides: "Titans v Kings", says: "Live now: Titans v Kings, Sunday Box League. Open the live scorecard" }],
        facts: ["League", "Started 16 Nov", "4 of 6 matches played"],
        // The next match is left out while one is being scored: the card says what is on now.
        next: null,
        href: `/tournament/${C(1)}`,
        link: "Points table and fixtures",
        linkSays: "Points table and fixtures: Sunday Box League",
      },
    ],
  });
  assert.equal(EVENTS_HEADING, "On at this turf");
  assert.equal(LIVE_LABEL, "Live now");
});

test("the card for a turf with two tournaments and nothing live: each one's facts, its next match and its link", () => {
  const card = eventsCard(eventsAt(eventsNow(answer(), T0), T(2)), T0);
  assert.deepEqual(card?.items.map((i) => [i.name, i.facts.join(" · "), i.next, i.href, i.link, i.live.length]), [
    ["Walk-in League", "League · Started 16 Nov · 4 of 6 matches played", "Next: Match 5 · Strikers v Kings · Sat 28 Nov, 7:30 pm", `/tournament/${C(3)}`, "Points table and fixtures", 0],
    ["Titans v Strikers", "3-match series · Started 16 Nov · 1 of 3 matches played", "Next: Match 2 · Titans v Strikers", `/tournament/${C(2)}`, "Series score and fixtures", 0],
  ]);
});

test("nothing on at this turf is no card at all", () => {
  const now = eventsNow(answer(), T0);
  assert.equal(eventsCard(eventsAt(now, T(9)), T0), null, "a turf not in the list");
  assert.equal(eventsCard(null, T0), null);
  assert.equal(eventsCard(undefined, T0), null);
  assert.equal(eventsCard([], T0), null);
  assert.equal(eventsCard(eventsAt(noEvents(T0), T(1)), T0), null, "nothing on anywhere");
  assert.equal(eventsCard(eventsAt(null, T(1)), T0), null, "nothing read yet: the server's render and the first paint");
  assert.equal(eventsAt(now, null), null);
  assert.equal(eventsAt(now, ""), null);
  // By the turf's id only, whatever its case: never by a name or a slug.
  assert.equal(eventsAt(now, T(1).toUpperCase())?.length, 1);
  assert.equal(eventsAt(now, "kings-turf-arena"), null);
});

test("every match being scored gets its own Live now row; a side not known yet is said plainly", () => {
  const t = league({ live: [{ code: L(1), home: "Titans", away: "Kings" }, { code: L(2), home: "Royals", away: null }, { code: L(3), home: null, away: null }] });
  const card = eventsCard([t], T0);
  assert.deepEqual(card?.items[0].live.map((l) => [l.href, l.sides]), [[`/live/${L(1)}`, "Titans v Kings"], [`/live/${L(2)}`, "A match"], [`/live/${L(3)}`, "A match"]]);
  assert.equal(card?.items[0].live[1].says, "Live now: A match, Sunday Box League. Open the live scorecard");
  assert.equal(sidesWords({ home: "Titans", away: "Kings" }), "Titans v Kings");
  assert.equal(sidesWords({ home: null, away: "Kings" }), "A match");
});

test("the format, in the tournament page's own words (formatLabel)", () => {
  assert.equal(formatWords(league()), "League");
  assert.equal(formatWords(league({ legs: 2 })), "Double round robin");
  assert.equal(formatWords(league({ playoffs: "final" })), "League + final");
  assert.equal(formatWords(league({ playoffs: "semis" })), "League + semi-finals");
  assert.equal(formatWords(league({ legs: 2, playoffs: "semis" })), "Double round robin + semi-finals");
  assert.equal(formatWords(league({ format: "tri" })), "Tri-series");
  assert.equal(formatWords(league({ format: "tri", playoffs: "final" })), "Tri-series + final");
  assert.equal(formatWords(series()), "3-match series");
  assert.equal(formatWords(series({ matches: 1 })), "1-match series");
  for (const format of ["league", "bilateral", "tri"] as Format[])
    for (const legs of [1, 2] as const)
      for (const playoffs of ["none", "final", "semis"] as Playoffs[])
        for (const matches of [0, 1, 3, 5, 9]) assert.equal(formatWords({ format, legs, matches, playoffs }), formatLabel({ format, legs, matches, playoffs }), `${format} ${legs} ${playoffs} ${matches}`);
});

test("how many are played, singular and plural (progressWords)", () => {
  assert.equal(playedWords(4, 6), "4 of 6 matches played");
  assert.equal(playedWords(0, 6), "0 of 6 matches played");
  assert.equal(playedWords(6, 6), "6 of 6 matches played");
  assert.equal(playedWords(1, 1), "1 of 1 match played");
  assert.equal(playedWords(0, 1), "0 of 1 match played");
  assert.equal(playedWords(1, 2), "1 of 2 matches played");
  assert.equal(playedWords(0, 0), "No matches yet");
  assert.equal(playedWords(9, 6), "6 of 6 matches played", "never more than there are");
  for (let total = 0; total <= 8; total++) for (let played = -1; played <= 9; played++) assert.equal(playedWords(played, total), progressWords(played, total), `${played} of ${total}`);
});

test("when it started, by India's calendar: today, yesterday, then the date, the year when it is another one", () => {
  const s = (started: string, now = T0, starts: string | null = null) => startedWords({ started, starts }, now);
  assert.equal(s("2026-11-27"), "Started today");
  assert.equal(s("2026-11-26"), "Started yesterday");
  assert.equal(s("2026-11-25"), "Started 25 Nov");
  assert.equal(s("2026-11-16"), "Started 16 Nov");
  assert.equal(s("2026-01-02"), "Started 2 Jan");
  assert.equal(s("2025-12-30"), "Started 30 Dec 2025");
  assert.equal(s("2026-11-28"), "Started today", "a clock a little behind the server's is today");
  // India's day, whatever the device's: 11:30 pm in India on the 27th is the 27th, half an hour later the 28th (6:30 pm UTC).
  assert.equal(indiaDay(Date.parse("2026-11-27T18:00:00Z")), "2026-11-27");
  assert.equal(indiaDay(Date.parse("2026-11-27T18:30:00Z")), "2026-11-28");
  assert.equal(indiaDay(Date.parse("2026-11-26T18:29:59Z")), "2026-11-26");
  assert.equal(s("2026-11-27", Date.parse("2026-11-27T18:29:00Z")), "Started today");
  assert.equal(s("2026-11-27", Date.parse("2026-11-27T18:30:00Z")), "Started yesterday", "past midnight in India");
  assert.equal(s("2026-12-31", Date.parse("2027-01-02T06:00:00Z")), "Started 31 Dec 2026");
  // The organiser gave it a start date of its own on another day: this day is when it was set up.
  assert.equal(s("2026-11-16", T0, "2026-12-05"), "Set up 16 Nov");
  assert.equal(s("2026-11-27", T0, "2026-12-05"), "Set up today");
  assert.equal(s("2026-11-16", T0, "2026-11-16"), "Started 16 Nov", "its own start date is that same day");
});

test("when it started is the tournament page's own line (startVerb, startedDay), for any instant and any day", () => {
  // created: an instant; the read answers its India date. now: an instant later or a little earlier.
  for (const created of ["2026-11-27T05:00:00Z", "2026-11-26T18:29:59Z", "2026-11-26T18:30:00Z", "2026-11-16T10:00:00Z", "2025-12-31T18:29:00Z", "2025-12-31T18:31:00Z", "2026-02-28T20:00:00Z"]) {
    const createdMs = Date.parse(created);
    for (const now of [T0, T0 + 11.5 * 3_600_000, T0 + 12 * 3_600_000, createdMs + 1000, createdMs + 86_400_000, Date.parse("2027-01-01T00:00:00+05:30")]) {
      for (const starts of [null, indiaDay(createdMs), "2026-12-05"]) {
        assert.equal(startedWords({ started: indiaDay(createdMs), starts }, now), `${startVerb(createdMs, starts)} ${startedDay(createdMs, now)}`, `${created} at ${new Date(now).toISOString()} starts ${starts}`);
      }
    }
  }
});

test("the next match and the link's words are the live scorecard banner's own (nextLine, bannerOf)", () => {
  assert.equal(nextWords(NEXT), "Next: Match 5 · Strikers v Kings · Sat 28 Nov, 7:30 pm");
  assert.equal(nextWords({ ...NEXT, time: null }), "Next: Match 5 · Strikers v Kings · Sat 28 Nov");
  assert.equal(nextWords({ ...NEXT, day: null, time: "12:00" }), "Next: Match 5 · Strikers v Kings · 12 noon");
  assert.equal(nextWords({ ...NEXT, day: null, time: null }), "Next: Match 5 · Strikers v Kings");
  assert.equal(nextWords({ stage: "final", slot: "f", n: null, home: null, away: null, day: null, time: null }), "Next: Final");
  assert.equal(nextWords({ stage: "semi", slot: "s2", n: null, home: "Titans", away: null, day: null, time: null }), "Next: Semi-final 2");
  const nexts: TurfNext[] = [];
  for (const [stage, slot, n] of [["league", null, 1], ["league", null, 12], ["league", null, null], ["semi", "s1", null], ["semi", "s2", null], ["final", "f", null]] as const)
    for (const [home, away] of [["Titans", "Kings"], [null, null], ["Titans", null]] as const)
      for (const day of [null, "2026-11-28", "2027-01-03"])
        for (const time of [null, "00:00", "07:05", "12:00", "12:30", "19:30", "23:59"]) nexts.push({ stage, slot, n, home, away, day, time });
  for (const n of nexts) assert.equal(nextWords(n), nextLine(n), JSON.stringify(n));
  const banner = (format: Format) => bannerOf({ code: C(1), name: "x", format, fixture: 1, stage: "league", slot: null, n: 1, of: 3, home: "A", away: "B", next: null } as LiveTournament, { shown: null, over: false }).link;
  for (const f of ["league", "bilateral", "tri"] as Format[]) assert.equal(tableLinkWords(f), banner(f), f);
  assert.equal(tableLinkWords("league"), "Points table and fixtures");
  assert.equal(tableLinkWords("bilateral"), "Series score and fixtures");
});

test("nothing is said that the data doesn't say: no urgency, no booking word, no count of people, no dash", () => {
  const cards = [eventsCard(eventsAt(eventsNow(answer(), T0), T(1)), T0), eventsCard(eventsAt(eventsNow(answer(), T0), T(2)), T0), eventsCard([series({ live: [{ code: L(4), home: null, away: null }], played: 3 })], T0)];
  for (const card of cards) {
    const said = JSON.stringify(card);
    assert.doesNotMatch(said, /book|hurry|fast|hot|don't miss|join now|popular|watching|viewers|views|organis|host|[—–]/i, said);
  }
});

/* ------------------------------------------------------------------ */
/* The list, read back without trusting it                             */
/* ------------------------------------------------------------------ */

test("toTurfEvents: the read's own answer goes through whole; a refusal is not a list", () => {
  assert.deepEqual(toTurfEvents(answer().turfs), answer().turfs);
  assert.deepEqual(toTurfEvents([]), []);
  for (const no of [null, undefined, "", 7, {}, { r: "unavailable" }, { turfs: [] }]) assert.equal(toTurfEvents(no), null, JSON.stringify(no));
});

test("toTurfEvents: an entry that is not whole is left out, never guessed at; the caps hold", () => {
  const good = league();
  const turf = (tournaments: unknown, id: unknown = T(1)) => [{ turf: id, tournaments }];
  for (const bad of [null, 7, "x", [], {}, { ...good, code: "BAD" }, { ...good, code: null }, { ...good, name: "  " }, { ...good, name: 5 }, { ...good, format: "knockout" }, { ...good, started: "16 Nov" }, { ...good, started: "2026-13-45" }, { ...good, started: null }, { ...good, total: -1 }, { ...good, total: "6" }, { ...good, total: 301 }])
    assert.deepEqual(toTurfEvents(turf([bad])), [], `a turf whose only tournament is not one is not listed: ${JSON.stringify(bad)}`);
  for (const id of [null, 7, "", "kings-turf-arena", T(1).toUpperCase(), `${T(1)}x`]) assert.deepEqual(toTurfEvents(turf([good], id)), [], `a turf id that is not one: ${String(id)}`);
  assert.deepEqual(toTurfEvents(turf("x")), []);
  assert.deepEqual(toTurfEvents(turf([])), [], "a turf with nothing on is not listed");
  // What can be read is; what can't falls back to what says least.
  const odd = toTurfEvents(turf([{ ...good, legs: 7, matches: "3", playoffs: "x", starts: "soon", played: 99, live: "x", next: { stage: "x" }, organiser: "Asha Rao", user_id: "u1" }]))?.[0].tournaments[0];
  assert.deepEqual(odd, { ...good, legs: 1, matches: 0, playoffs: "none", starts: null, played: 6, live: [], next: null });
  assert.equal(JSON.stringify(odd).includes("Asha"), false, "a field the card has no use for goes no further than the parse");
  // Live rows: a code that is one, once, three at most.
  const live = toTurfEvents(turf([{ ...good, live: [{ code: "BAD", home: "A", away: "B" }, { code: L(1), home: " Titans ", away: "" }, { code: L(1), home: "X", away: "Y" }, null, { code: L(2), home: "A", away: "B" }, { code: L(3), home: "A", away: "B" }, { code: L(4), home: "A", away: "B" }] }]))?.[0].tournaments[0].live;
  assert.deepEqual(live, [{ code: L(1), home: "Titans", away: null }, { code: L(2), home: "A", away: "B" }, { code: L(3), home: "A", away: "B" }]);
  // Names are one line, cut to the tournament's own limits.
  const long = toTurfEvents(turf([{ ...good, name: `A\nlong\tname ${"x".repeat(80)}`, next: { ...NEXT, home: "y".repeat(40), time: "7:30", day: "28 Nov" } }]))?.[0].tournaments[0];
  assert.equal(long?.name.length, 60);
  assert.equal(long?.name.startsWith("A long name x"), true);
  assert.deepEqual([long?.next?.home?.length, long?.next?.time, long?.next?.day], [30, null, null]);
  // Three tournaments a turf, a tournament once, a turf once, 200 turfs.
  const many = [1, 2, 2, 3, 4, 5].map((n) => league({ code: C(n) }));
  assert.deepEqual(toTurfEvents(turf(many))?.[0].tournaments.map((t) => t.code), [C(1), C(2), C(3)]);
  assert.equal(TURF_EVENTS_MAX_EACH, 3);
  assert.equal(toTurfEvents([...turf([good]), ...turf([league({ code: C(9) })])])?.length, 1, "a turf listed twice is read once");
  assert.equal(toTurfEvents(Array.from({ length: 260 }, (_, i) => ({ turf: T(i + 1), tournaments: [good] })))?.length, 200);
  assert.equal(TURF_EVENTS_MAX_TURFS, 200);
});

test("eventsNow: the route's { turfs }, and nothing on for anything else", () => {
  const now = eventsNow(answer(), T0);
  assert.equal(now.at, T0);
  assert.deepEqual([...now.byTurf.keys()], [T(1), T(2)]);
  assert.equal(now.byTurf.get(T(2))?.length, 2);
  for (const junk of [null, undefined, "", 7, [], {}, { turfs: "x" }, { error: "unavailable" }, answer().turfs]) assert.equal(eventsNow(junk, T0).byTurf.size, 0, JSON.stringify(junk));
  assert.equal(noEvents(T0).byTurf.size, 0);
});

/* ------------------------------------------------------------------ */
/* The tab's copy and the reader                                       */
/* ------------------------------------------------------------------ */

test("the kept answer: reused for 5 minutes, then not; a broken or stale one is read again", () => {
  assert.equal(TURF_EVENTS_KEEP_MS, 5 * MIN);
  assert.equal(TURF_EVENTS_URL, "/api/turf-events");
  assert.equal(TURF_EVENTS_STORE_KEY, "tt_turf_events_v1");
  const text = eventsText(eventsNow(answer(), T0));
  const back = readKeptEvents(text, T0 + 4 * MIN);
  assert.ok(back);
  assert.equal(back.at, T0);
  assert.deepEqual(back.list, answer().turfs);
  assert.ok(readKeptEvents(text, T0 + TURF_EVENTS_KEEP_MS - 1));
  assert.equal(readKeptEvents(text, T0 + TURF_EVENTS_KEEP_MS), null, "five minutes old: stale");
  assert.equal(readKeptEvents(text, T0 - 1), null, "kept at a time ahead of the clock (the clock went back)");
  for (const broken of [null, undefined, "", "{", "null", "[]", "7", '"x"', "{}", '{"at":"now"}', '{"at":null,"turfs":[]}', '{"turfs":[]}']) assert.equal(readKeptEvents(broken, T0), null, String(broken));
  // The right shape with junk in it is read as the route's answer is: junk rows are left out.
  const junk = JSON.stringify({ at: T0, turfs: [...answer().turfs, { turf: "x", tournaments: [league()] }, { turf: T(5), tournaments: [{ code: "BAD" }] }] });
  assert.equal(readKeptEvents(junk, T0)?.byTurf.size, 2);
  // "Nothing on anywhere" is an answer too, and kept as long.
  assert.equal(readKeptEvents(eventsText(noEvents(T0)), T0 + MIN)?.byTurf.size, 0);
  assert.equal(eventsFresh(null, T0), false);
  assert.equal(eventsFresh(noEvents(T0), T0), true);
  // Only the route's public answer and when it was read: nothing about the visitor or the page they were on.
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ["at", "turfs"]);
});

/** A page: a clock, a tab's storage and a route, with the reads the page asked for counted. */
function page(o: { store?: Map<string, string>; blocked?: boolean; path?: string; bot?: boolean; route?: () => unknown } = {}) {
  const store = o.store ?? new Map<string, string>();
  const state = { now: T0, gets: 0, idle: [] as (() => void)[], leaving: false, path: o.path ?? "/turf/kings-turf-arena", fail: false, body: (o.route ?? answer) as () => unknown, changes: 0 };
  const deps: KeptDeps = {
    now: () => state.now,
    load: () => {
      if (o.blocked) throw new Error("storage blocked");
      return store.get("k") ?? null;
    },
    save: (text) => {
      if (o.blocked) throw new Error("storage blocked");
      store.set("k", text);
    },
    get: async () => {
      state.gets++;
      if (state.fail) throw new Error("HTTP 503");
      return state.body();
    },
    later: (run) => {
      state.idle.push(run);
    },
    allowed: () => !o.bot && trendPath(state.path),
    leaving: () => state.leaving,
  };
  const reader = createTurfEventsReader(deps);
  reader.subscribe(() => state.changes++);
  /** The page goes idle (and is on screen): what waited runs, and its read settles. */
  const idle = async () => {
    for (const run of state.idle.splice(0)) run();
    await new Promise((r) => setImmediate(r));
  };
  return { reader, state, store, idle };
}

test("one page: nothing is asked before the page is idle, then once", async () => {
  const p = page();
  assert.equal(p.reader.now(), null, "the first paint knows nothing");
  for (let i = 0; i < 10; i++) p.reader.want();
  assert.equal(p.state.gets, 0, "not before the page is idle and on screen");
  assert.equal(p.state.idle.length, 1);
  await p.idle();
  assert.equal(p.state.gets, 1);
  assert.equal(p.state.changes, 1);
  const t = p.reader.now();
  assert.equal(eventsAt(t, T(1))?.[0].name, "Sunday Box League");
  assert.equal(p.reader.now(), t, "the same object until a read replaces it");
  p.reader.want();
  await p.idle();
  assert.equal(p.state.gets, 1);
});

test("five turf pages in one tab: one request in 5 minutes, the next when it is due", async () => {
  const store = new Map<string, string>();
  const first = page({ store });
  first.reader.want();
  await first.idle();
  let gets = first.state.gets;
  // Four more pages, each a new document with the tab's storage, a minute apart.
  for (let i = 1; i <= 4; i++) {
    const next = page({ store, path: `/turf/turf-${i}` });
    next.state.now = T0 + i * MIN;
    assert.equal(eventsAt(next.reader.now(), T(2))?.length, 2, "known at once from the tab's storage");
    next.reader.want();
    await next.idle();
    gets += next.state.gets;
  }
  assert.equal(gets, 1, "five pages, one request");
  const late = page({ store });
  late.state.now = T0 + TURF_EVENTS_KEEP_MS;
  assert.equal(late.reader.now(), null, "the kept answer is stale: this page starts with nothing");
  late.reader.want();
  await late.idle();
  assert.equal(late.state.gets, 1, "and asks once");
  assert.equal(eventsAt(late.reader.now(), T(1))?.length, 1);
});

test("a failed read shows nothing, is not retried for 5 minutes, and never throws", async () => {
  const store = new Map<string, string>();
  const p = page({ store });
  p.state.fail = true;
  p.reader.want();
  await p.idle();
  assert.equal(p.state.gets, 1);
  assert.equal(eventsAt(p.reader.now(), T(1)), null, "nothing on, as far as this page can say");
  assert.equal(eventsCard(eventsAt(p.reader.now(), T(1)), T0), null);
  const next = page({ store });
  next.state.now = T0 + 2 * MIN;
  next.reader.want();
  await next.idle();
  assert.equal(next.state.gets, 0, "the next page does not ask a route that just failed");
  // A read the page's own leaving cut off is not kept as "nothing on".
  const store2 = new Map<string, string>();
  const gone = page({ store: store2 });
  gone.state.fail = true;
  gone.state.leaving = true;
  gone.reader.want();
  await gone.idle();
  assert.equal(store2.size, 0);
  // An answer that is not the route's shape is nothing on, and kept as that.
  const odd = page({ route: () => ({ error: "unavailable" }) });
  odd.reader.want();
  await odd.idle();
  assert.equal(odd.reader.now()?.byTurf.size, 0);
});

test("storage blocked: memory only, still one request for the page", async () => {
  const p = page({ blocked: true });
  p.reader.want();
  p.reader.want();
  await p.idle();
  assert.equal(p.state.gets, 1);
  assert.equal(eventsAt(p.reader.now(), T(1))?.length, 1);
});

test("never read on the admin, myTapturf, an owner's report or the email pages, nor by a crawler", async () => {
  for (const pathname of ["/admin", "/admin/tournaments", "/my/turf/abc", "/report/abcdef", "/email/off"]) {
    const p = page({ path: pathname });
    p.reader.want();
    await p.idle();
    assert.equal(p.state.gets, 0, pathname);
    assert.equal(p.reader.now(), null, pathname);
  }
  const bot = page({ bot: true });
  bot.reader.want();
  await bot.idle();
  assert.equal(bot.state.gets, 0);
  assert.equal(bot.reader.now(), null);
  // Nor is a kept answer shown there.
  const store = new Map<string, string>([["k", eventsText(eventsNow(answer(), T0))]]);
  assert.equal(page({ store, path: "/my/turf/abc" }).reader.now(), null);
  assert.equal(page({ store, bot: true }).reader.now(), null);
  assert.equal(page({ store }).reader.now()?.byTurf.size, 2);
});

/* ------------------------------------------------------------------ */
/* How it is wired                                                     */
/* ------------------------------------------------------------------ */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("the turf page adds no server read: the card is a browser-only overlay on the gallery, never in the HTML, hidden from snippets", () => {
  const page = read("app/turf/[id]/page.tsx");
  assert.match(page, /<div className="relative">\s*<TurfImageGallery [^>]*\/>\s*<TurfTrendChip [^>]*\/>\s*<TurfEventsCard id=\{turf\.id\} slug=\{turf\.slug\} photos=\{orderPhotos\(turf\.images\)\.length\} \/>\s*<\/div>/, "laid over the gallery, beside the Trending chip");
  assert.doesNotMatch(page, /turfEvents|turf-events|turf_events/, "the page itself knows nothing of the list: no server read, no fetch");
  assert.match(page, /export const revalidate = 604800;/, "still a week");
  const card = read("components/turf/TurfEventsCard.tsx");
  assert.match(card, /^"use client";/);
  assert.match(card, /data-nosnippet/);
  assert.match(card, /className=\{`absolute /, "it takes no room of its own, so nothing on the page moves when it arrives");
  assert.match(card, /if \(!card\) return null;/, "a turf with nothing on renders nothing at all");
  assert.match(card, /prefetch=\{false\}/, "its links are never fetched ahead");
  assert.doesNotMatch(card, /Date\.now\(|new Date\(/, "what it says is of the moment the list was read");
  const hook = read("components/turf/useTurfEvents.ts");
  assert.match(hook, /const serverSnapshot = \(\) => null;/, "never in the server render or the hydration pass");
  assert.match(hook, /later: whenIdleAndShown,/, "the same wait as Trending by views: loaded, idle and on screen");
  assert.match(hook, /allowed: \(\) => person && trendPath\(window\.location\.pathname\),/);
  assert.match(hook, /const person = !isBotAgent\(navigator\.userAgent\);/);
  assert.match(hook, /fetch\(TURF_EVENTS_URL\)/, "the route with no query string, so everyone shares one copy");
});

test("the route: one shared copy for a minute, never indexed; the list is read with the server's key and an absent function is an empty list", () => {
  const route = read("app/api/turf-events/route.ts");
  assert.match(route, /"Cache-Control": `public, max-age=\$\{TURF_EVENTS_FRESH_S\}, s-maxage=\$\{TURF_EVENTS_FRESH_S\}, stale-while-revalidate=120`/);
  assert.match(route, /"X-Robots-Tag": "noindex"/);
  assert.match(route, /export async function GET\(\) \{/, "it reads nothing of the request: no query string, no cookie");
  const server = read("lib/tournament/turfEvents.server.ts");
  assert.match(server, /export const TURF_EVENTS_FRESH_S = 60;/);
  assert.match(server, /\{ revalidate: TURF_EVENTS_FRESH_S \}/);
  assert.match(server, /rpc\("turf_events_now", \{ p_key: key \}\)/);
  assert.match(server, /if \(missingFn\(error\.code\)\) \{\s*offUntil = Date\.now\(\) \+ 60_000;\s*throw new EventsOff\(\);/, "before the migration: asked again only after a minute");
  assert.match(server, /if \(e instanceof EventsOff\) return \[\];/, "and answered as nothing on, never an error");
  // The module the turf page carries imports nothing that runs but the kept-answer rules.
  const mod = read("lib/tournament/turfEvents.ts");
  assert.deepEqual([...mod.matchAll(/^import (type )?.* from "(.+)";$/gm)].map((m) => `${m[1] ? "type " : ""}${m[2]}`), ["../keptAnswer", "type ./types"]);
  // The organiser is told where they pick the venue, in both sheets (one picker).
  const picker = read("components/tournament/VenuePicker.tsx");
  assert.match(picker, /export const VENUE_SHOWS_NOTE = "This tournament will show on the turf's page while it is on\.";/);
  assert.match(picker, /export const VENUE_SHOWS_SIGN_IN_NOTE = "Sign in and this tournament will show on the turf's page while it is on\.";/);
  assert.match(picker, /\{\(user \|\| !loading\) && <p [^>]*>\{user \? VENUE_SHOWS_NOTE : VENUE_SHOWS_SIGN_IN_NOTE\}<\/p>\}/, "signed in: it will show; not signed in: sign in and it will; nothing while the sign-in is still being read");
  // Only a tournament kept with an account is in the read (20261128_turf_events.sql).
  assert.match(read("supabase/migrations/20261128_turf_events.sql"), /where t\.status = 'on'\n\s+-- [^\n]*\n\s+and t\.user_id is not null\n/);
  for (const f of ["components/tournament/TournamentCreate.tsx", "components/tournament/OrganiserSheets.tsx"]) assert.match(read(f), /<VenuePicker value=\{venue\} onChange=\{setVenue\} \/>/, f);
});
