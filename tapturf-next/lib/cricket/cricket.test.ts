// Run with: npm run test:cricket (compiles to .test-out and runs node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOvers, formatOvers, runRate, formatNrr, toBalls } from "./overs";
import { calcNrr, computeStandings, decideResult, seriesStatus, describeResult, DEFAULT_POINTS, type MatchInput } from "./nrr";

test("parseOvers accepts cricket notation", () => {
  const ok = (s: string, balls: number) => {
    const r = parseOvers(s);
    assert.equal(r.ok, true, s);
    if (r.ok) assert.equal(r.balls, balls, s);
  };
  ok("4", 24);
  ok("4.0", 24);
  ok("4.1", 25);
  ok("4.2", 26);
  ok("4.3", 27);
  ok("4.4", 28);
  ok("4.5", 29);
  ok("5", 30);
  ok("5.0", 30);
  ok("5.3", 33);
  ok("5.5", 35);
  ok("6.0", 36);
  ok("20", 120);
  ok(" 6.4 ", 40);
});

test("parseOvers rejects impossible balls and junk", () => {
  for (const bad of ["4.6", "5.7", "5.8", "4.9", "4.10", "", "abc", "-1", "4.", ".3", "4,3"]) {
    assert.equal(parseOvers(bad).ok, false, bad);
  }
});

test("formatOvers round-trips", () => {
  assert.equal(formatOvers(33), "5.3");
  assert.equal(formatOvers(36), "6.0");
  assert.equal(formatOvers(0), "0.0");
  assert.equal(formatOvers(40), "6.4");
  assert.equal(toBalls(6, 4), 40);
});

test("run rate uses balls, not decimal overs", () => {
  assert.equal(runRate(63, 36), 10.5);
  // 5.3 overs = 33 balls = 5.5 overs of six
  assert.equal(Number(runRate(55, 33)!.toFixed(4)), 10);
  assert.equal(runRate(10, 0), null);
});

test("NRR example from the brief", () => {
  const r = calcNrr(63, 36, 54, 36);
  assert.equal(r.rrFor, 10.5);
  assert.equal(r.rrAgainst, 9);
  assert.equal(formatNrr(r.nrr), "+1.500");
  assert.equal(formatNrr(-0.25), "-0.250");
  assert.equal(formatNrr(0), "+0.000");
  assert.equal(formatNrr(null), "0.000");
});

test("zero runs and zero balls do not crash", () => {
  const r = calcNrr(0, 36, 0, 36);
  assert.equal(r.nrr, 0);
  assert.equal(calcNrr(10, 0, 5, 6).nrr, null);
});

const inn = (runs: number, balls: number, wickets = 0, allOut = false) => ({ runs, wickets, balls, allOut });
const match = (id: string, teamA: string, teamB: string, a: ReturnType<typeof inn>, b: ReturnType<typeof inn>, result: MatchInput["result"] = "auto"): MatchInput => ({ id, teamA, teamB, a, b, result });

test("decideResult from scores, tie and overrides", () => {
  assert.equal(decideResult({ a: inn(100, 36), b: inn(90, 36), result: "auto" }), "a");
  assert.equal(decideResult({ a: inn(90, 36), b: inn(100, 36), result: "auto" }), "b");
  assert.equal(decideResult({ a: inn(90, 36), b: inn(90, 36), result: "auto" }), "tie");
  assert.equal(decideResult({ a: inn(90, 36), b: inn(100, 36), result: "nr" }), "nr");
  assert.equal(decideResult({ a: inn(90, 36), b: inn(100, 36), result: "a" }), "a");
});

test("tri-series standings, worked by hand", () => {
  // Each side bowls 6 overs. Three matches:
  //  M1 Titans 63/36b v Strikers 54/36b -> Titans
  //  M2 Strikers 70/36b v Royals 71/33b -> Royals (chased in 5.3)
  //  M3 Titans 60/36b v Royals 60/36b -> tie
  const teams = ["Titans", "Strikers", "Royals"];
  const ms = [
    match("1", "Titans", "Strikers", inn(63, 36), inn(54, 36)),
    match("2", "Strikers", "Royals", inn(70, 36), inn(71, 33)),
    match("3", "Titans", "Royals", inn(60, 36), inn(60, 36)),
  ];
  const t = computeStandings(teams, ms, DEFAULT_POINTS);
  const by = Object.fromEntries(t.map((s) => [s.team, s]));
  // Titans: for 123 off 72 balls (10.25), against 114 off 72 (9.5) -> +0.75
  assert.equal(by.Titans.points, 3);
  assert.equal(by.Titans.won, 1);
  assert.equal(by.Titans.tied, 1);
  assert.equal(Number(by.Titans.nrr!.toFixed(3)), 0.75);
  // Royals: for 131 off 69 balls (11.3913), against 130 off 72 (10.8333) -> +0.558
  assert.equal(by.Royals.points, 3);
  assert.equal(Number(by.Royals.nrr!.toFixed(3)), 0.558);
  // Strikers: for 124 off 72 (10.3333), against 134 off 69 (11.6522) -> -1.319
  assert.equal(by.Strikers.points, 0);
  assert.equal(by.Strikers.lost, 2);
  assert.equal(Number(by.Strikers.nrr!.toFixed(3)), -1.319);
  // Order: Titans and Royals level on points, Titans ahead on NRR.
  assert.deepEqual(t.map((s) => s.team), ["Titans", "Royals", "Strikers"]);
});

test("no result is left out of NRR and gives both sides a point", () => {
  const teams = ["A", "B"];
  const ms = [match("1", "A", "B", inn(10, 36), inn(200, 36), "nr"), match("2", "A", "B", inn(63, 36), inn(54, 36))];
  const by = Object.fromEntries(computeStandings(teams, ms, DEFAULT_POINTS).map((s) => [s.team, s]));
  assert.equal(by.A.played, 2);
  assert.equal(by.A.nr, 1);
  assert.equal(by.A.points, 3);
  assert.equal(by.B.points, 1);
  assert.equal(Number(by.A.nrr!.toFixed(3)), 1.5);
  assert.equal(Number(by.B.nrr!.toFixed(3)), -1.5);
});

test("all out counts the full quota when overs per side is set", () => {
  const teams = ["A", "B"];
  // A all out for 40 in 4 overs (24 balls); B chase 41 in 3 overs.
  const ms = [match("1", "A", "B", inn(40, 24, 10, true), inn(41, 18, 2))];
  const withQuota = computeStandings(teams, ms, { ...DEFAULT_POINTS, oversPerSide: 6 });
  const a = withQuota.find((s) => s.team === "A")!;
  // A faced counts as 36 balls: 40/6 = 6.667 ; conceded 41 off 18 balls = 13.667 -> -7.0
  assert.equal(a.ballsFor, 36);
  assert.equal(Number(a.nrr!.toFixed(3)), -7);
  const noQuota = computeStandings(teams, ms, DEFAULT_POINTS).find((s) => s.team === "A")!;
  assert.equal(noQuota.ballsFor, 24);
  assert.equal(Number(noQuota.nrr!.toFixed(3)), -3.667);
});

test("editing and deleting matches recomputes from scratch", () => {
  const teams = ["A", "B"];
  const m1 = match("1", "A", "B", inn(63, 36), inn(54, 36));
  const m2 = match("2", "A", "B", inn(50, 36), inn(80, 36));
  let t = computeStandings(teams, [m1, m2], DEFAULT_POINTS);
  assert.equal(t.find((s) => s.team === "A")!.points, 2);
  // Edit m2 so A wins it too.
  const m2b = { ...m2, b: inn(40, 36) };
  t = computeStandings(teams, [m1, m2b], DEFAULT_POINTS);
  assert.equal(t.find((s) => s.team === "A")!.points, 4);
  // Delete m1.
  t = computeStandings(teams, [m2b], DEFAULT_POINTS);
  assert.equal(t.find((s) => s.team === "A")!.played, 1);
  assert.equal(t.find((s) => s.team === "A")!.points, 2);
});

test("series status and result text", () => {
  const ms = [
    match("1", "Titans", "Strikers", inn(63, 36), inn(54, 36)),
    match("2", "Strikers", "Titans", inn(70, 36), inn(60, 36)),
    match("3", "Titans", "Strikers", inn(80, 36), inn(70, 36)),
    match("4", "Titans", "Strikers", inn(80, 36), inn(70, 36), "nr"),
  ];
  const s = seriesStatus("Titans", "Strikers", ms);
  assert.equal(s.line, "Titans 2 - 1 Strikers (1 no result)");
  assert.equal(s.leader, "Titans");
  assert.equal(describeResult(ms[0]), "Titans won by 9 runs");
  assert.equal(describeResult(match("5", "A", "B", inn(90, 36), inn(91, 30, 3)), "a"), "B won by 7 wickets");
  assert.equal(describeResult(match("6", "A", "B", inn(90, 36), inn(90, 36))), "Match tied");
});
