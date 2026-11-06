// Run with: npm run test:session
import { test } from "node:test";
import assert from "node:assert/strict";
import { extrasText, leadText, matchLine, outcomeOf, scoreText, tally, typedText, verdict } from "./tally";
import { aSession, withFinal } from "./testkit";

test("the tally counts by side, so a rename never flips a result", () => {
  let s = withFinal(withFinal(withFinal(aSession(), 60, 50), 40, 45), 70, 20);
  assert.deepEqual(tally(s), { a: 2, b: 1, tied: 0, nr: 0, played: 3, leader: "a", line: "Titans 2 - 1 Strikers" });
  s = { ...s, sides: { a: { ...s.sides.a, name: "Lions" }, b: s.sides.b } };
  assert.equal(tally(s).line, "Lions 2 - 1 Strikers");
  assert.equal(leadText(s), "Lions lead");
  assert.equal(verdict(s), "Lions won the session");
});

test("level, empty, tied and no-result sessions", () => {
  const empty = aSession();
  assert.equal(leadText(empty), "No matches yet");
  assert.equal(verdict(empty), "No matches played");
  const level = withFinal(withFinal(aSession(), 60, 50), 40, 45);
  assert.equal(leadText(level), "All square");
  assert.equal(verdict(level), "Session drawn");
  const odd = withFinal(withFinal(level, 30, 30), 1, 0, { noResult: true });
  const t = tally(odd);
  assert.equal(t.line, "Titans 1 - 1 Strikers (1 tied, 1 no result)");
  assert.equal(extrasText(t), "(1 tied, 1 no result)");
  assert.equal(extrasText(tally(level)), "");
});

test("typed results in words: runs for the side that batted first, wickets in hand for the chase", () => {
  const names = { a: "Titans", b: "Strikers" };
  const inn = (runs: number, wickets: number) => ({ runs, wickets, balls: 36 });
  // 6 a side: 5 wickets.
  assert.equal(typedText({ a: inn(64, 3), b: inn(58, 5), outcome: "a" }, "a", names, 5), "Titans won by 6 runs");
  assert.equal(typedText({ a: inn(64, 3), b: inn(65, 2), outcome: "b" }, "a", names, 5), "Strikers won by 3 wickets");
  assert.equal(typedText({ a: inn(64, 3), b: inn(65, 4), outcome: "b" }, "a", names, 5), "Strikers won by 1 wicket");
  assert.equal(typedText({ a: inn(64, 3), b: inn(65, 5), outcome: "b" }, "a", names, 6), "Strikers won by 1 wicket", "last man stands: 6");
  assert.equal(typedText({ a: inn(64, 3), b: inn(63, 2), outcome: "a" }, "b", names, 5), "Titans won by 2 wickets", "Titans chased");
  assert.equal(typedText({ a: inn(1, 0), b: inn(1, 0), outcome: "a" }, "a", names, 5), "Titans won", "a winner by no margin");
  assert.equal(typedText({ a: inn(30, 3), b: inn(30, 3), outcome: "tie" }, "a", names, 5), "Match tied");
  assert.equal(typedText({ a: inn(30, 3), b: inn(0, 0), outcome: "nr" }, "a", names, 5), "No result");
  assert.equal(outcomeOf(inn(10, 1), inn(9, 1), false), "a");
  assert.equal(outcomeOf(inn(10, 1), inn(11, 1), false), "b");
  assert.equal(outcomeOf(inn(10, 1), inn(10, 1), false), "tie");
  assert.equal(outcomeOf(inn(10, 1), inn(1, 1), true), "nr");
});

test("a match's line, the side that batted first first", () => {
  const names = { a: "Titans", b: "Strikers" };
  const result = { a: { runs: 64, wickets: 3, balls: 36 }, b: { runs: 58, wickets: 5, balls: 33 }, outcome: "a" as const, text: "" };
  assert.equal(matchLine({ result, battedFirst: "a" }, names), "Titans 64/3 (6) · Strikers 58/5 (5.3)");
  assert.equal(matchLine({ result, battedFirst: "b" }, names), "Strikers 58/5 (5.3) · Titans 64/3 (6)");
  assert.equal(matchLine({ result: null, battedFirst: "a" }, names), "");
  assert.equal(scoreText({ runs: 0, wickets: 0, balls: 0 }), "0/0 (0)");
});
