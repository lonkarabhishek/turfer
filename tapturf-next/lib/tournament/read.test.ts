// Run with: npm run test:tournament
import { test } from "node:test";
import assert from "node:assert/strict";
import { opData, toLiveResult, toMine, toTournament } from "./read";

const row = {
  code: "abcdefghijkl",
  status: "on",
  name: "Sunday League",
  settings: { format: "league", legs: 1, matches: 0, playoffs: "semis", overs: 6, points: { win: 2, tie: 1, nr: 1, loss: 0 }, venue: null, starts: "2026-11-08", ends: null },
  rev: 7,
  created_at: "2026-11-01T10:00:00.123456+00:00",
  updated_at: "2026-11-01T11:00:00+00:00",
  teams: [1, 2, 3, 4].map((id) => ({ id, name: `T${id}`, short: id === 1 ? "TA" : null })),
  fixtures: [
    { id: 1, stage: "league", slot: null, round: 1, seq: 0, home: 1, away: 2, day: "2026-11-08", time: "19:30", result: { a: { runs: 63, wickets: 4, balls: 36, allOut: false }, b: { runs: 54, wickets: 10, balls: 30, allOut: true }, result: "auto", battedFirst: "a" }, live: null, live_result: null },
    { id: 2, stage: "semi", slot: "s1", round: 4, seq: 1, home: null, away: null, day: null, time: null, result: null, live: "livelinkaaaa", live_result: { a: { name: "T1", runs: 10, wickets: 1, balls: 6, allOut: false }, b: { name: "T4", runs: 5, wickets: 2, balls: 6, allOut: false }, outcome: "a", battedFirst: "a", text: "T1 won by 5 runs" } },
  ],
};

test("tournament_get's row in the app's terms", () => {
  const t = toTournament(row)!;
  assert.equal(t.createdAt, "2026-11-01T10:00:00.123Z");
  assert.equal(t.settings.playoffs, "semis");
  assert.equal(t.settings.starts, "2026-11-08");
  assert.deepEqual(t.teams[0], { id: 1, name: "T1", short: "TA" });
  assert.equal(t.fixtures[0].result!.b.allOut, true);
  assert.equal(t.fixtures[1].slot, "s1");
  assert.equal(t.fixtures[1].live, "livelinkaaaa");
  assert.equal(t.fixtures[1].liveResult!.text, "T1 won by 5 runs");
});

test("none, taken down, and rows that are not one", () => {
  assert.equal(toTournament(null), null);
  const gone = toTournament({ code: "abcdefghijkl", status: "removed", rev: 9, updated_at: "2026-11-01T11:00:00Z" })!;
  assert.deepEqual([gone.status, gone.teams, gone.fixtures, gone.rev], ["removed", [], [], 9]);
  assert.throws(() => toTournament({ r: "unavailable" }));
  assert.throws(() => toTournament({ ...row, code: "x" }));
  assert.throws(() => toTournament({ ...row, settings: { format: "?" } }));
  assert.throws(() => toTournament({ ...row, fixtures: [{ id: "x" }] }));
  assert.throws(() => toTournament({ ...row, updated_at: "yesterday" }));
});

test("a kept live result is rebuilt; a broken one is none", () => {
  assert.equal(toLiveResult({ a: { name: "x" } }), null);
  assert.equal(toLiveResult(null), null);
  assert.equal(toLiveResult({ ...row.fixtures[1].live_result, outcome: "draw" }), null);
});

test("tournament_mine's list", () => {
  assert.deepEqual(toMine({ r: "ok", list: [{ code: "abcdefghijkl", name: "L", format: "tri", status: "on", teams: 3, fixtures: 3, played: 1, created_at: "a", updated_at: "b" }, { code: "BAD" }] }), [
    { code: "abcdefghijkl", name: "L", format: "tri", status: "on", teams: 3, fixtures: 3, played: 1, createdAt: "a", updatedAt: "b" },
  ]);
  assert.deepEqual(toMine(null), []);
});

test("changes in the database's words", () => {
  assert.deepEqual(opData({ op: "live_link", id: 3, liveCode: "abcdefghijkl", home: 1 }), { p_op: "live_link", p_data: { id: 3, live_code: "abcdefghijkl", home: 1, away: null } });
  assert.deepEqual(opData({ op: "fixture_remove", id: 2 }), { p_op: "fixture_remove", p_data: { id: 2 } });
  assert.deepEqual(opData({ op: "remove" }), { p_op: "remove", p_data: {} });
  assert.deepEqual(opData({ op: "result", id: 1, result: null, home: null, away: null }), { p_op: "result", p_data: { id: 1, result: null, home: null, away: null } });
});
