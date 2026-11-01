// Run with: npm run test:tournament
// Real matches from the Live Cricket Scorer's engine, read the way the server reads a linked scorecard.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, check, derive, newMatch, type BallEvent, type Match, type MatchEvent } from "../cricket/scoring";
import { flipped, liveNowOf, liveResultOf, orientLive } from "./live";
import { resolve } from "./standings";
import type { LiveResult } from "./types";

function run(m: Match, events: MatchEvent[]): Match {
  for (const e of events) {
    const c = check(m, e);
    assert.equal(c.error, null, `${JSON.stringify(e)} refused: ${c.error}`);
    m = apply(m, e);
  }
  return m;
}
const ball = (runs: number): BallEvent => ({ type: "ball", runs, extra: "none", extraRuns: 0 });
const bowled = (): BallEvent => ({ type: "ball", runs: 0, extra: "none", extraRuns: 0, wicket: { kind: "bowled" } });
const start = (side: "a" | "b"): MatchEvent[] => {
  const bowl = side === "a" ? "b" : "a";
  return [
    { type: "setBatter", player: `${side}1` },
    { type: "setBatter", player: `${side}2` },
    { type: "setBowler", player: `${bowl}1` },
  ];
};
const make = (teamA = "Titans", teamB = "Strikers") => newMatch({ teamA, teamB, overs: 1, playersPerSide: 3, players: { a: ["Amit", "Rahul", "Karan"], b: ["Sameer", "Vikas", "Nikhil"] } }, { id: "m1", now: 0 });

/** Titans 15/0 in the over; Strikers chase it in three balls. */
function chased(teamA?: string, teamB?: string) {
  return run(make(teamA, teamB), [...start("a"), ball(4), ball(4), ball(1), ball(0), ball(6), ball(0), ...start("b"), ball(6), ball(6), ball(4)]);
}

test("a chase won: the result as the match has it", () => {
  const v = derive(chased());
  assert.equal(v.status, "done");
  const lr = liveResultOf(v)!;
  assert.deepEqual(lr.a, { name: "Titans", runs: 15, wickets: 0, balls: 6, allOut: false });
  assert.deepEqual(lr.b, { name: "Strikers", runs: 16, wickets: 0, balls: 3, allOut: false });
  assert.equal(lr.outcome, "b");
  assert.equal(lr.battedFirst, "a");
  assert.match(lr.text, /^Strikers won by/);
});

test("still being played: no result", () => {
  const m = run(make(), [...start("a"), ball(4)]);
  assert.equal(liveResultOf(derive(m)), null);
});

test("bowled out: the all-out flag, so the table counts the full overs", () => {
  const m = run(make(), [...start("a"), ball(1), ball(1), ball(1), ball(1), ball(1), ball(1), ...start("b"), bowled(), { type: "setBatter", player: "b3" }, bowled()]);
  const v = derive(m);
  assert.equal(v.status, "done");
  const lr = liveResultOf(v)!;
  assert.deepEqual(lr.b, { name: "Strikers", runs: 0, wickets: 2, balls: 2, allOut: true });
  assert.equal(lr.outcome, "a");
  // In the table: Strikers' 2 balls count as the full over.
  const t = {
    settings: { format: "league" as const, legs: 1 as const, matches: 0, playoffs: "none" as const, overs: 1, points: { win: 2, tie: 1, nr: 1, loss: 0 }, venue: null, starts: null, ends: null },
    teams: [{ id: 1, name: "Titans", short: null }, { id: 2, name: "Strikers", short: null }, { id: 3, name: "Royals", short: null }],
    fixtures: [{ id: 1, stage: "league" as const, slot: null, round: 1, seq: 0, home: 1, away: 2, day: null, time: null, result: null, live: "abcdefghijkl", liveResult: lr }],
  };
  const st = resolve(t).table.find((s) => s.team === "Strikers")!;
  assert.equal(st.ballsFor, 6);
  assert.equal(st.lost, 1);
});

test("abandoned: no result", () => {
  const m = run(make(), [...start("a"), ball(4), { type: "endInnings", reason: "abandoned" }]);
  const lr = liveResultOf(derive(m));
  assert.equal(lr?.outcome, "nr");
});

test("a tie", () => {
  const m = run(make(), [...start("a"), ball(1), ball(1), ball(1), ball(1), ball(1), ball(1), ...start("b"), ball(1), ball(1), ball(1), ball(1), ball(1), ball(1)]);
  assert.equal(liveResultOf(derive(m))!.outcome, "tie");
});

test("names typed the other way round: turned to home and away", () => {
  const lr = liveResultOf(derive(chased("Strikers", "Titans")))!; // the scorer put the away team first
  assert.equal(flipped(lr, "Titans", "Strikers"), true);
  const r = orientLive(lr, "Titans", "Strikers");
  assert.deepEqual([r.a.runs, r.b.runs, r.result, r.battedFirst], [16, 15, "a", "b"], "home (Titans) chased and won");
  // As typed: as it came.
  const same = liveResultOf(derive(chased()))!;
  assert.equal(flipped(same, "Titans", "Strikers"), false);
  assert.deepEqual(orientLive(same, "Titans", "Strikers").result, "b");
  // Names that match neither (the scorer renamed them): order kept.
  const other = liveResultOf(derive(chased("Team A", "Team B")))!;
  assert.equal(flipped(other, "Titans", "Strikers"), false);
  // Case and spaces do not matter; one name matching is enough.
  const lr2: LiveResult = { ...same, a: { ...same.a, name: "  strikers " }, b: { ...same.b, name: "Someone" } };
  assert.equal(flipped(lr2, "Titans", "Strikers"), true);
  assert.equal(flipped(same, "Same", "Same"), false, "a fixture with two equal names is never swapped");
});

test("the card while live: each side's score, who bats, home first", () => {
  const m = run(make("Strikers", "Titans"), [...start("a"), ball(4), ball(2)]);
  const now = liveNowOf({ status: "live", closed: false, updatedAt: "2026-11-01T10:00:00.000Z" }, derive(m), "Titans", "Strikers");
  assert.equal(now.status, "live");
  assert.deepEqual(now.b, { score: "6/0", overs: "0.2" }, "Strikers are the away team, batting");
  assert.equal(now.a, null);
  assert.equal(now.batting, "b");
  assert.match(now.headline, /6\/0/);
  assert.equal(now.result, null);
  const off = liveNowOf({ status: "off", closed: false, updatedAt: null }, null, "Titans", "Strikers");
  assert.deepEqual([off.status, off.a, off.result], ["off", null, null]);
  const done = liveNowOf({ status: "done", closed: false, updatedAt: null }, derive(chased()), "Titans", "Strikers");
  assert.equal(done.result!.outcome, "b");
  assert.equal(done.batting, null);
});
