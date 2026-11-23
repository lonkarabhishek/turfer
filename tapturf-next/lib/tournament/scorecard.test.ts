// Run with: npm run test:tournament
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixtureTitle } from "./format";
import { bannerOf, matchName, matchPlace, nextLine, sidesLine, toLiveTournament, type LiveTournament } from "./scorecard";

const NEXT = { stage: "league", slot: null, n: 4, home: "Strikers", away: "Kings", day: "2026-11-28", time: "19:30" };
const ROW = { code: "smash0018zs1", name: "Sunday Smash League", format: "league", fixture: 3, stage: "league", slot: null, n: 3, of: 6, home: "Titans", away: "Royals", next: NEXT };
const T = toLiveTournament(ROW)!;

test("live_tournament's answer in the app's terms", () => {
  assert.deepEqual(T, { code: "smash0018zs1", name: "Sunday Smash League", format: "league", fixture: 3, stage: "league", slot: null, n: 3, of: 6, home: "Titans", away: "Royals", next: { stage: "league", slot: null, n: 4, home: "Strikers", away: "Kings", day: "2026-11-28", time: "19:30" } });
  assert.deepEqual(toLiveTournament({ ...ROW, stage: "final", slot: "f", n: null, home: null, away: null, next: null }), { ...T, stage: "final", slot: "f", n: null, home: null, away: null, next: null });
  // Whatever else an answer carried is never copied.
  const extra = toLiveTournament({ ...ROW, user_id: "00000000-0000-4000-8000-000000000001", organiser: "Asha Rao", secret: "x" })!;
  assert.deepEqual(Object.keys(extra).sort(), ["away", "code", "fixture", "format", "home", "n", "name", "next", "of", "slot", "stage"]);
  assert.doesNotMatch(JSON.stringify(extra), /Asha|0000-4000|secret/);
});

test("no banner: no tournament, a refusal, or anything that is not a whole answer", () => {
  for (const none of [null, undefined, "", 7, [], [ROW], { r: "unavailable" }, { r: "ok", ...ROW }, {}, { ...ROW, code: "BAD" }, { ...ROW, code: "smash0018zs1x" }, { ...ROW, code: 7 }, { ...ROW, name: "" }, { ...ROW, name: "  " }, { ...ROW, name: null }, { ...ROW, format: "knockout" }, { ...ROW, fixture: 0 }, { ...ROW, fixture: "3" }, { ...ROW, stage: "quarter" }, { ...ROW, stage: null }])
    assert.equal(toLiveTournament(none), null, JSON.stringify(none));
});

test("tidied, never guessed", () => {
  assert.equal(toLiveTournament({ ...ROW, name: "  Sunday \n Smash\tLeague " })!.name, "Sunday Smash League");
  assert.equal(toLiveTournament({ ...ROW, name: "x".repeat(200) })!.name.length, 60);
  assert.equal(toLiveTournament({ ...ROW, home: "T".repeat(80) })!.home!.length, 30);
  assert.deepEqual([toLiveTournament({ ...ROW, home: "", away: 7 })!.home, toLiveTournament({ ...ROW, home: "", away: 7 })!.away], [null, null]);
  for (const n of [0, -1, 2.5, "3", null, 301]) assert.equal(toLiveTournament({ ...ROW, n })!.n, null, String(n));
  assert.equal(toLiveTournament({ ...ROW, stage: "semi", slot: "s1", n: 3 })!.n, null, "a playoff has no number");
  assert.equal(toLiveTournament({ ...ROW, slot: "x" })!.slot, null);
  assert.equal(toLiveTournament({ ...ROW, of: "6" })!.of, 0);
  // The next match: a whole one or none; a day or time that is not one is left off.
  for (const next of [null, undefined, "Match 4", [], { stage: "quarter" }, {}]) assert.equal(toLiveTournament({ ...ROW, next })!.next, null, JSON.stringify(next));
  assert.deepEqual(toLiveTournament({ ...ROW, next: { ...NEXT, day: "28 Nov", time: "7.30" } })!.next, { stage: "league", slot: null, n: 4, home: "Strikers", away: "Kings", day: null, time: null });
});

test("which match: the words the tournament page uses", () => {
  assert.equal(matchPlace(T), "League · Match 3 of 6");
  assert.equal(matchPlace({ ...T, format: "bilateral", n: 2, of: 3 }), "Series · Match 2 of 3");
  assert.equal(matchPlace({ ...T, format: "tri", n: 5, of: 6 }), "Tri-series · Match 5 of 6");
  assert.equal(matchPlace({ ...T, n: 1, of: 1 }), "League · Match 1", "the only match needs no 'of'");
  assert.equal(matchPlace({ ...T, n: 7, of: 6 }), "League · Match 7", "a count that doesn't hold it is left off");
  assert.equal(matchPlace({ ...T, n: null }), "League match");
  assert.equal(matchPlace({ ...T, stage: "semi", slot: "s1", n: null }), "Semi-final 1");
  assert.equal(matchPlace({ ...T, stage: "semi", slot: "s2", n: null }), "Semi-final 2");
  assert.equal(matchPlace({ ...T, stage: "final", slot: "f", n: null }), "Final");
  // The same names as the tournament page's own cards (lib/tournament/format.ts fixtureTitle).
  const all = [1, 2, 3, 4].map((id) => ({ id, stage: "league" as const, seq: id - 1 }));
  assert.equal(matchName({ stage: "league", slot: null, n: 3 }), fixtureTitle({ id: 3, stage: "league", slot: null }, all));
  assert.equal(matchName({ stage: "semi", slot: "s2", n: null }), fixtureTitle({ id: 9, stage: "semi", slot: "s2" }, all));
  assert.equal(matchName({ stage: "final", slot: "f", n: null }), fixtureTitle({ id: 10, stage: "final", slot: "f" }, all));
});

test("the two sides: said only when the scorecard under it names them differently", () => {
  assert.equal(sidesLine(T, null), "Titans v Royals", "no score on screen yet");
  assert.equal(sidesLine(T, { a: "Titans", b: "Royals" }), null, "the scorecard says the same");
  assert.equal(sidesLine(T, { a: "Royals", b: "Titans" }), null, "the other way round is the same two");
  assert.equal(sidesLine(T, { a: " titans ", b: "ROYALS" }), null, "case and spaces don't count");
  assert.equal(sidesLine(T, { a: "TIT", b: "ROY" }), "Titans v Royals", "the scorer typed short names");
  assert.equal(sidesLine(T, { a: "Titans", b: "Team B" }), "Titans v Royals");
  assert.equal(sidesLine({ home: null, away: "Royals" }, null), null, "a playoff place not filled yet");
  assert.equal(sidesLine({ home: "Titans", away: null }, { a: "x", b: "y" }), null);
});

test("the next match", () => {
  assert.equal(nextLine(T.next!), "Next: Match 4 · Strikers v Kings · Sat 28 Nov, 7:30 pm");
  assert.equal(nextLine({ ...T.next!, day: null, time: null }), "Next: Match 4 · Strikers v Kings");
  assert.equal(nextLine({ ...T.next!, time: null }), "Next: Match 4 · Strikers v Kings · Sat 28 Nov");
  assert.equal(nextLine({ ...T.next!, day: null }), "Next: Match 4 · Strikers v Kings · 7:30 pm");
  assert.equal(nextLine({ stage: "final", slot: "f", n: null, home: null, away: null, day: null, time: null }), "Next: Final", "its places are not filled yet");
  assert.equal(nextLine({ stage: "semi", slot: "s1", n: null, home: "Titans", away: null, day: null, time: null }), "Next: Semi-final 1", "one side alone is not a pairing");
  assert.equal(nextLine({ stage: "final", slot: "f", n: null, home: "Titans", away: "Strikers", day: "2026-11-29", time: "12:00" }), "Next: Final · Titans v Strikers · Sun 29 Nov, 12 noon");
});

test("the banner: while it is on, once it is over, and for a series", () => {
  assert.deepEqual(bannerOf(T, { shown: { a: "Titans", b: "Royals" }, over: false }), {
    name: "Sunday Smash League",
    place: "League · Match 3 of 6",
    sides: null,
    next: null,
    href: "/tournament/smash0018zs1",
    link: "Points table and fixtures",
  });
  assert.equal(bannerOf(T, { shown: { a: "Titans", b: "Royals" }, over: true }).next, "Next: Match 4 · Strikers v Kings · Sat 28 Nov, 7:30 pm", "over: the next match is said");
  assert.equal(bannerOf({ ...T, next: null }, { shown: null, over: true }).next, null, "nothing left to play: nothing is said");
  assert.equal(bannerOf(T, { shown: null, over: false }).sides, "Titans v Royals", "waiting for the first ball: the sides are said");
  const series: LiveTournament = { ...T, name: "Titans v Strikers", format: "bilateral", n: 2, of: 3, home: "Titans", away: "Strikers" };
  assert.deepEqual(bannerOf(series, { shown: { a: "Titans", b: "Strikers" }, over: false }), { name: "Titans v Strikers", place: "Series · Match 2 of 3", sides: null, next: null, href: "/tournament/smash0018zs1", link: "Series score and fixtures" });
  for (const name of ["Titans v Strikers", "titans vs strikers", "Strikers v Titans"]) assert.equal(bannerOf({ ...series, name }, { shown: null, over: false }).sides, null, `named for its sides (${name}): they are not said twice`);
  assert.equal(bannerOf({ ...series, name: "Diwali Cup" }, { shown: null, over: false }).sides, "Titans v Strikers");
  // Nothing about who organises it, no hurry, never "book".
  for (const over of [true, false]) assert.doesNotMatch(Object.values(bannerOf(T, { shown: null, over })).join(" | "), /\bbook|hurry|organis|started by|!/i);
});
