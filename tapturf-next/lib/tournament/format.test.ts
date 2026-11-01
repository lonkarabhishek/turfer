// Run with: npm run test:tournament
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayLabel, fixtureTitle, groupFixtures, rangeLabel, shareText, timeLabel } from "./format";
import { makeFixtures } from "./fixtures";
import { resolve } from "./standings";
import type { Fixture, Settings } from "./types";

test("days and times", () => {
  assert.equal(dayLabel("2026-11-08"), "Sun 8 Nov");
  assert.equal(timeLabel("19:30"), "7:30 pm");
  assert.equal(timeLabel("07:00"), "7 am");
  assert.equal(timeLabel("12:00"), "12 noon");
  assert.equal(timeLabel("00:15"), "12:15 am");
  assert.equal(rangeLabel("2026-11-08", "2026-11-15"), "8 to 15 Nov");
  assert.equal(rangeLabel("2026-11-28", "2026-12-03"), "28 Nov to 3 Dec");
  assert.equal(rangeLabel("2026-11-08", null), "From 8 Nov");
  assert.equal(rangeLabel(null, "2026-11-15"), "Until 15 Nov");
  assert.equal(rangeLabel("2026-11-08", "2026-11-08"), "8 Nov");
  assert.equal(rangeLabel(null, null), null);
});

const s: Settings = { format: "league", legs: 1, matches: 0, playoffs: "semis", overs: 6, points: { win: 2, tie: 1, nr: 1, loss: 0 }, venue: null, starts: null, ends: null };
const teams = [1, 2, 3, 4, 5].map((id) => ({ id, name: `T${id}`, short: null }));
const tour = () => ({ settings: s, teams, fixtures: makeFixtures(s, [1, 2, 3, 4, 5]).map((f): Fixture => ({ ...f, live: null, liveResult: null })) });

test("fixture names", () => {
  const t = tour();
  assert.equal(fixtureTitle(t.fixtures[2], t.fixtures), "Match 3");
  assert.equal(fixtureTitle(t.fixtures[10], t.fixtures), "Semi-final 1");
  assert.equal(fixtureTitle(t.fixtures[11], t.fixtures), "Semi-final 2");
  assert.equal(fixtureTitle(t.fixtures[12], t.fixtures), "Final");
  // Moved to the front: it is Match 1 now.
  t.fixtures[4].seq = -1;
  assert.equal(fixtureTitle(t.fixtures[4], t.fixtures), "Match 1");
});

test("by round, with byes, the playoffs last", () => {
  const t = tour();
  const g = groupFixtures(resolve(t).fixtures, teams, false);
  assert.deepEqual(g.map((x) => x.title), ["Round 1", "Round 2", "Round 3", "Round 4", "Round 5", "Semi-finals", "Final"]);
  assert.ok(g.slice(0, 5).every((x) => x.items.length === 2 && x.byes.length === 1), "five teams: one bye a round");
  assert.deepEqual(g[5].byes, []);
});

test("by day once any has a day; a series is one list", () => {
  const t = tour();
  t.fixtures[3].day = "2026-11-09";
  t.fixtures[0].day = "2026-11-08";
  const g = groupFixtures(resolve(t).fixtures, teams, false);
  assert.deepEqual(g.map((x) => x.title), ["Sun 8 Nov", "Mon 9 Nov", "Date to be set"]);
  assert.equal(g[2].items.length, 11);
  const bs: Settings = { ...s, format: "bilateral", matches: 3, playoffs: "none" };
  const bt = { settings: bs, teams: teams.slice(0, 2), fixtures: makeFixtures(bs, [1, 2]).map((f): Fixture => ({ ...f, live: null, liveResult: null })) };
  assert.deepEqual(groupFixtures(resolve(bt).fixtures, bt.teams, true).map((x) => [x.title, x.items.length]), [["Matches", 3]]);
});

test("the share text ends with the link", () => {
  const text = shareText("Sunday League", "https://www.tapturf.in/tournament/abc");
  assert.match(text, /^Follow Sunday League on TapTurf/);
  assert.ok(text.endsWith("https://www.tapturf.in/tournament/abc"));
});
