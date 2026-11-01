// Run with: npm run test:cricket
// The match form the Cricket Tournament Manager has always had, moved here so the live tournament's
// result sheet reads a result the same way: the same messages, the same numbers kept.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyScoreDraft, readScoreDraft, scoreDraftOf } from "./resultForm";
import { computeStandings, DEFAULT_POINTS } from "./nrr";

const names = { a: "Titans", b: "Strikers" };
const draft = (over: Partial<ReturnType<typeof emptyScoreDraft>> = {}) => ({ ...emptyScoreDraft(), aRuns: "63", aWkts: "4", aOvers: "6", bRuns: "54", bWkts: "10", bOvers: "5.3", bAllOut: true, ...over });

test("a filled form reads as balls, ticks and the result", () => {
  assert.deepEqual(readScoreDraft(draft(), names), {
    ok: { a: { runs: 63, wickets: 4, balls: 36, allOut: false }, b: { runs: 54, wickets: 10, balls: 33, allOut: true }, result: "auto", battedFirst: "a" },
  });
});

test("the form's messages, in its order", () => {
  assert.deepEqual(readScoreDraft(draft({ aRuns: "" }), names), { error: "Enter runs for both teams." });
  assert.deepEqual(readScoreDraft(draft({ aOvers: "4.6" }), names), { error: "Titans overs: 4.6 is not valid: an over has 6 balls, so the last digit is 0 to 5" });
  assert.deepEqual(readScoreDraft(draft({ bOvers: "" }), names), { error: "Strikers overs: Enter overs, like 6 or 5.3" });
  assert.deepEqual(readScoreDraft(draft({ aOvers: "0" }), names), { error: "Overs must be more than 0 for a completed match. Use No result if the match was not played out." });
});

test("no result needs no scores", () => {
  const r = readScoreDraft({ ...emptyScoreDraft(), result: "nr" }, names);
  assert.deepEqual(r, { ok: { a: { runs: 0, wickets: 0, balls: 0, allOut: false }, b: { runs: 0, wickets: 0, balls: 0, allOut: false }, result: "nr", battedFirst: "a" } });
});

test("a kept result goes back into the form as it was typed, and reads the same", () => {
  const r = readScoreDraft(draft({ result: "b", battedFirst: "b" }), names);
  assert.ok("ok" in r);
  if (!("ok" in r)) return;
  const back = scoreDraftOf(r.ok);
  assert.deepEqual(back, { aRuns: "63", aWkts: "4", aOvers: "6.0", aAllOut: false, bRuns: "54", bWkts: "10", bOvers: "5.3", bAllOut: true, result: "b", battedFirst: "b" });
  assert.deepEqual(readScoreDraft(back, names), r);
  // And the table it makes is the offline tool's, all-out rule included.
  const t = computeStandings(["Titans", "Strikers"], [{ id: "1", teamA: "Titans", teamB: "Strikers", ...r.ok }], { ...DEFAULT_POINTS, oversPerSide: 6 });
  assert.equal(t.find((s) => s.team === "Strikers")!.ballsFor, 36);
});
