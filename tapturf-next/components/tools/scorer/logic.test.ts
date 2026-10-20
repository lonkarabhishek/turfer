// Run with: npm run test:scorer (compiled with tsc to .test-out/scorer-ui, then node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, check, derive, newMatch, type Match, type MatchEvent } from "../../../lib/cricket/scoring";
import { buildBall, defaultName, keyHint, placeholderOf, plainRuns, resolvePlayer, runAllowed, smartUndo, stamp } from "./logic";

/** Apply one tap's events the way the scorer does: same timestamp, refuse on error. */
let clock = 1000;
function tap(m: Match, ...events: MatchEvent[]): Match {
  clock += 1000;
  for (const e of stamp(events, clock)) {
    const c = check(m, e);
    assert.equal(c.error, null, `${JSON.stringify(e)}: ${c.error}`);
    m = apply(m, e);
  }
  return m;
}
const fresh = () =>
  tap(
    newMatch({ teamA: "Titans", teamB: "Strikers", overs: 2, playersPerSide: 6 }, { id: "t", now: 0 }),
    { type: "setBatter", player: "a1", name: "Batter 1", end: "striker" },
    { type: "setBatter", player: "a2", name: "Batter 2", end: "nonStriker" },
    { type: "setBowler", player: "b1", name: "Bowler 1" },
  );
const score = (m: Match) => {
  const v = derive(m).current;
  return `${v.runs}/${v.wickets} (${v.overs})`;
};

test("pad taps become the right deliveries", () => {
  assert.deepEqual(buildBall("none", 4), { type: "ball", runs: 4, extra: "none" });
  assert.deepEqual(buildBall("wide", 0), { type: "ball", runs: 0, extra: "wide" });
  assert.deepEqual(buildBall("wide", 2), { type: "ball", runs: 0, extra: "wide", extraRuns: 2 });
  assert.deepEqual(buildBall("noBall", 4), { type: "ball", runs: 4, extra: "noBall" });
  assert.deepEqual(buildBall("noBall", 1, "legBye"), { type: "ball", runs: 0, extra: "noBall", extraRuns: 1, noBallExtra: "legBye" });
  assert.deepEqual(buildBall("bye", 2), { type: "ball", runs: 0, extra: "bye", extraRuns: 2 });
  // A run out off a bye with nothing run is a run out on a fair ball.
  assert.deepEqual(buildBall("bye", 0, "bat", { kind: "runOut" }), { type: "ball", runs: 0, extra: "none", wicket: { kind: "runOut" } });
  assert.deepEqual([plainRuns("wide"), plainRuns("noBall"), plainRuns("bye"), plainRuns("legBye")], [0, 0, 1, 1]);
  assert.equal(runAllowed("wide", "bat", 6), false);
  assert.equal(runAllowed("bye", "bat", 0), false);
  assert.equal(runAllowed("noBall", "bat", 6), true);
  assert.equal(runAllowed(null, "bat", 6), true);
  assert.equal(keyHint("wide", "bat", 0), "Wd");
  assert.equal(keyHint("noBall", "bye", 2), "Nb+2b");
  assert.equal(keyHint("legBye", "bat", 3), "3lb");
  assert.equal(keyHint(null, "bat", 3), null);
});

test("every built delivery passes the engine's checks", () => {
  const m = fresh();
  for (const [x, n, nb] of [
    ["none", 0],
    ["none", 6],
    ["wide", 0],
    ["wide", 4],
    ["noBall", 0],
    ["noBall", 6],
    ["noBall", 2, "bye"],
    ["noBall", 1, "legBye"],
    ["bye", 1],
    ["legBye", 4],
  ] as const) {
    assert.equal(check(m, buildBall(x, n, nb)).error, null, `${x} ${n} ${nb ?? ""}`);
  }
});

test("undo takes back one tap: a ball, or a wicket with the batter who came in", () => {
  let m = tap(fresh(), buildBall("none", 4));
  m = tap(m, buildBall("none", 1));
  assert.equal(score(m), "5/0 (0.2)");
  m = smartUndo(m).match;
  assert.equal(score(m), "4/0 (0.1)");

  const before = m;
  m = tap(m, buildBall("none", 0, "bat", { kind: "bowled" }), { type: "setBatter", ...resolvePlayer(apply(m, buildBall("none", 0, "bat", { kind: "bowled" })), "a", "Batter 3") });
  assert.equal(score(m), "4/1 (0.2)");
  assert.equal(derive(m).current.striker?.name, "Batter 3");
  const u = smartUndo(m);
  assert.deepEqual(u.match.events, before.events);
  assert.equal(u.removedBall, before.events.length);
});

test("undo after the next bowler is picked takes back the last ball of the over with the pick", () => {
  let m = fresh();
  for (let i = 0; i < 5; i++) m = tap(m, buildBall("none", 1));
  const fiveBalls = m;
  m = tap(m, buildBall("none", 6));
  assert.deepEqual(derive(m).needs, ["bowler"]);
  m = tap(m, { type: "setBowler", player: "b2", name: "Bowler 2" });
  assert.equal(derive(m).ready, true);
  const u = smartUndo(m);
  assert.deepEqual(u.match.events, fiveBalls.events);
  assert.equal(score(u.match), "5/0 (0.5)");
  assert.equal(derive(u.match).current.bowler?.name, "Bowler 1");
});

test("undo of a strike swap, a rename or a mid-over bowler change takes back only that", () => {
  let m = tap(fresh(), buildBall("none", 2));
  const afterBall = m;
  m = tap(m, { type: "swapStrike" });
  assert.deepEqual(smartUndo(m).match.events, afterBall.events);
  m = tap(afterBall, { type: "renamePlayer", team: "a", player: "a1", name: "Rohit" });
  assert.deepEqual(smartUndo(m).match.events, afterBall.events);
  m = tap(afterBall, { type: "setBowler", player: "b2", name: "Bowler 2" });
  assert.deepEqual(smartUndo(m).match.events, afterBall.events);
});

test("undo after picking the chase openers goes back to the innings break", () => {
  let m = fresh();
  for (let i = 0; i < 6; i++) m = tap(m, buildBall("none", 1));
  m = tap(m, { type: "setBowler", player: "b2", name: "Bowler 2" });
  for (let i = 0; i < 6; i++) m = tap(m, buildBall("none", 1));
  const brk = derive(m);
  assert.equal(brk.inningsBreak, true);
  const atBreak = m;
  m = tap(m, { type: "setBatter", player: "b3", name: "Batter 1", end: "striker" }, { type: "setBatter", player: "b4", name: "Batter 2", end: "nonStriker" }, { type: "setBowler", player: "a3", name: "Bowler 1" });
  assert.equal(derive(m).ready, true);
  const u = smartUndo(m);
  assert.deepEqual(u.match.events, atBreak.events);
  assert.equal(u.removedBall, null);
});

test("default names keep counting after renames and never cross roles", () => {
  let m = tap(fresh(), { type: "renamePlayer", team: "a", player: "a1", name: "Rohit" });
  const v = derive(m);
  // Two have batted, one renamed: the next is Batter 3, not a second "Batter 1".
  assert.equal(defaultName(v, "a", "Batter"), "Batter 3");
  assert.equal(defaultName(v, "b", "Bowler"), "Bowler 2");
  assert.equal(defaultName(v, "b", "Batter"), "Batter 1");
  assert.equal(defaultName(v, "a", "Batter", ["Batter 3"]), "Batter 4");
  assert.equal(placeholderOf("Bowler 2"), "Bowler");
  assert.equal(placeholderOf("batter 10"), "Batter");
  assert.equal(placeholderOf("Rohit"), null);
  // Typing an existing name picks that player; a new name adds one with a fresh id.
  assert.deepEqual(resolvePlayer(m, "a", "rohit"), { player: "a1" });
  m = tap(m, buildBall("none", 0));
  assert.deepEqual(resolvePlayer(m, "a", "Sahil"), { player: "a3", name: "Sahil" });
});
