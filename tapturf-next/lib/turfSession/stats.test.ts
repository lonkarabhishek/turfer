// Run with: npm run test:session
import { test } from "node:test";
import assert from "node:assert/strict";
import { batText, bowlText, hasNames, isPlaceholder, topBatters, topBowlers } from "./stats";
import type { SessionMatch } from "./types";

const match = (n: number, bat: SessionMatch["bat"], bowl: SessionMatch["bowl"], done = true): SessionMatch => ({
  n,
  kind: "balls",
  matchId: `m${n}`,
  battedFirst: "a",
  overs: 6,
  playersPerSide: 6,
  lastManStands: false,
  result: done ? { a: { runs: 1, wickets: 0, balls: 36 }, b: { runs: 0, wickets: 0, balls: 36 }, outcome: "a", text: "" } : null,
  bat,
  bowl,
  balls: 72,
  at: 0,
});

test("totals over matches and sides, by name in any case; placeholders and unfinished matches left out", () => {
  const s = {
    matches: [
      match(1, [["Rohan", "a", 40, 20, true], ["Amit", "a", 10, 8, false], ["Batter 3", "a", 30, 10, true]], [["Sameer", "b", 3, 20, 24], ["Bowler 2", "b", 2, 10, 12]]),
      // Reshuffled: Rohan on side b now.
      match(2, [["rohan ", "b", 30, 15, false], ["Amit", "a", 40, 30, true]], [["Sameer", "a", 2, 30, 24], ["Vikas", "b", 2, 12, 24]]),
      match(3, [["Rohan", "a", 99, 1, false]], [["Vikas", "a", 5, 0, 6]], false),
    ],
  };
  assert.deepEqual(topBatters(s), [
    { name: "Rohan", runs: 70, balls: 35, innings: 2 },
    { name: "Amit", runs: 50, balls: 38, innings: 2 },
  ]);
  assert.deepEqual(topBowlers(s).map((b) => [b.name, b.wickets, b.runs]), [
    ["Sameer", 5, 50],
    ["Vikas", 2, 12],
  ]);
  assert.equal(batText(topBatters(s)[0]), "Rohan · 70 runs (35 balls)");
  assert.equal(bowlText(topBowlers(s)[1]), "Vikas · 2 wickets (12 runs)");
  assert.equal(hasNames(s), true);
});

test("ties: fewer balls for batters; fewer runs, then fewer balls for bowlers; top 3 only", () => {
  const s = {
    matches: [
      match(
        1,
        [["A", "a", 20, 15, true], ["B", "a", 20, 10, true], ["C", "b", 5, 5, true], ["D", "b", 1, 1, true], ["E", "b", 0, 4, true]],
        [["W", "a", 2, 20, 24], ["X", "a", 2, 15, 24], ["Y", "b", 2, 15, 18], ["Z", "b", 0, 4, 6]],
      ),
    ],
  };
  assert.deepEqual(topBatters(s).map((b) => b.name), ["B", "A", "C"]);
  assert.deepEqual(topBowlers(s).map((b) => b.name), ["Y", "X", "W"]);
  assert.deepEqual(topBatters(s, 10).map((b) => b.name), ["B", "A", "C", "D"], "nobody on 0");
});

test("no names: nothing to show", () => {
  const s = { matches: [match(1, [["Batter 1", "a", 20, 10, true], ["Batter 2", "a", 5, 3, false]], [["Bowler 1", "b", 1, 25, 12]])] };
  assert.equal(hasNames(s), false);
  assert.deepEqual(topBatters(s), []);
  assert.equal(hasNames({ matches: [] }), false);
  assert.equal(isPlaceholder("Player 3"), true);
  assert.equal(isPlaceholder("Batter"), false);
});
