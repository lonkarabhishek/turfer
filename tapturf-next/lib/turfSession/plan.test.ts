// Run with: npm run test:session
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayLabel, FORMATS, formatFor, indiaDay, oversThatFit, planChips, planMatches, playersFromSpots, scoreWindow, serverWindowOk, setupPlan, slotMinutes } from "./plan";

const at = (iso: string) => Date.parse(iso);

test("a game's sport picks the format; nets and practice are not a match", () => {
  assert.equal(formatFor("Box Cricket"), "box");
  assert.equal(formatFor("box cricket"), "box");
  assert.equal(formatFor("Cricket"), "cricket");
  assert.equal(formatFor("cricket"), "cricket");
  assert.equal(formatFor("Tennis ball cricket"), "cricket");
  assert.equal(formatFor("Cricket nets"), null);
  assert.equal(formatFor("Cricket bowling machine"), null);
  assert.equal(formatFor("Cricket practice"), null);
  assert.equal(formatFor("Football"), null);
  assert.equal(formatFor(""), null);
  assert.equal(formatFor(null), null);
});

test("players a side from the spots: half, 2 to 11, else the format's default", () => {
  assert.equal(playersFromSpots(12, "box"), 6);
  assert.equal(playersFromSpots(22, "cricket"), 11);
  assert.equal(playersFromSpots(14, "cricket"), 7);
  assert.equal(playersFromSpots(13, "box"), 6);
  assert.equal(playersFromSpots(30, "cricket"), 11);
  assert.equal(playersFromSpots(2, "box"), 2);
  assert.equal(playersFromSpots(0, "box"), FORMATS.box.players);
  assert.equal(playersFromSpots(null, "cricket"), FORMATS.cricket.players);
});

test("slot length: past midnight adds a day; equal, unknown or over 12 hours is 2 hours", () => {
  assert.equal(slotMinutes("19:00", "21:00"), 120);
  assert.equal(slotMinutes("19:00:00", "20:00:00"), 60);
  assert.equal(slotMinutes("23:00", "01:00"), 120);
  assert.equal(slotMinutes("22:30", "00:00"), 90);
  assert.equal(slotMinutes("19:00", "19:00"), 120);
  assert.equal(slotMinutes("19:00", ""), 120);
  assert.equal(slotMinutes(null, "21:00"), 120);
  assert.equal(slotMinutes("06:00", "20:00"), 120, "14 hours is a typo, not a slot");
});

test("matches that fit: box 6 overs in 2 hours is 6; cricket 10 overs is 2, or 1 in an hour", () => {
  assert.equal(planMatches(120, "box", 6), 6);
  assert.equal(planMatches(120, "cricket", 10), 2);
  assert.equal(planMatches(60, "cricket", 10), 1);
  assert.equal(planMatches(60, "box", 6), 3);
  assert.equal(planMatches(10, "cricket", 20), 1, "never fewer than 1");
  assert.equal(planMatches(720, "box", 2), 9, "never more than 9");
});

test("planChips: a guess off the chips gets its own chip", () => {
  assert.deepEqual(planChips(6), [3, 4, 5, 6, 8]);
  assert.deepEqual(planChips(null), [3, 4, 5, 6, 8]);
  assert.deepEqual(planChips(planMatches(120, "cricket", 10)), [2, 3, 4, 5, 6, 8], "2 cricket matches in a 2-hour slot");
  assert.deepEqual(planChips(9), [3, 4, 5, 6, 8, 9]);
});

test("overs shrink only when one match does not fit, never below 2", () => {
  assert.equal(oversThatFit(120, "box"), 6);
  assert.equal(oversThatFit(60, "cricket"), 10);
  assert.equal(oversThatFit(45, "cricket"), 9);
  assert.equal(oversThatFit(15, "box"), 5);
  assert.equal(oversThatFit(5, "box"), 2);
});

test("the score window opens 30 min before and closes 3 h after the end, in India time", () => {
  const w = scoreWindow({ date: "2026-11-08", start_time: "19:00", end_time: "21:00" })!;
  assert.equal(w.open, at("2026-11-08T18:30:00+05:30"));
  assert.equal(w.close, at("2026-11-09T00:00:00+05:30"));
  const late = scoreWindow({ date: "2026-11-08", start_time: "23:00", end_time: "01:00" })!;
  assert.equal(late.close, at("2026-11-09T04:00:00+05:30"), "ends past midnight");
  const same = scoreWindow({ date: "2026-11-08", start_time: "19:00", end_time: "19:00" })!;
  assert.equal(same.close, at("2026-11-08T21:00:00+05:30") + 3 * 3600_000, "equal times count as 2 hours");
  assert.equal(scoreWindow({ date: "8 Nov", start_time: "19:00" }), null);
  assert.equal(scoreWindow({ date: "2026-11-08", start_time: "" }), null);
});

test("the server's window: the day before the game to two days after, in India's days", () => {
  assert.equal(serverWindowOk("2026-11-08", at("2026-11-06T23:59:00+05:30")), false);
  assert.equal(serverWindowOk("2026-11-08", at("2026-11-07T00:00:00+05:30")), true);
  assert.equal(serverWindowOk("2026-11-08", at("2026-11-08T12:00:00+05:30")), true);
  assert.equal(serverWindowOk("2026-11-08", at("2026-11-10T23:59:00+05:30")), true);
  assert.equal(serverWindowOk("2026-11-08", at("2026-11-11T00:00:00+05:30")), false);
  assert.equal(serverWindowOk("nope", Date.now()), false);
});

test("India days and their labels", () => {
  assert.equal(indiaDay(at("2026-11-07T19:00:00Z")), "2026-11-08", "00:30 in India is the next day");
  assert.equal(dayLabel("2026-11-08"), "Sun 8 Nov");
  assert.equal(dayLabel("2026-11-07"), "Sat 7 Nov");
  assert.equal(dayLabel("garbage"), "garbage");
});

test("setup's matches planned: the slot's guess follows the overs and format until a chip is tapped", () => {
  // A 2-hour Box Cricket game: 6 at 6 overs; tap 10 overs and the guess is 3; switch to Cricket at 10 overs: 2.
  assert.equal(setupPlan(120, "box", 6, undefined), 6);
  assert.equal(setupPlan(120, "box", 10, undefined), 3);
  assert.equal(setupPlan(120, "cricket", 10, undefined), 2);
  // Once the organiser picks, it stays theirs, Not sure included.
  assert.equal(setupPlan(120, "box", 10, 5), 5);
  assert.equal(setupPlan(120, "box", 10, null), null);
  // No game: not sure until picked.
  assert.equal(setupPlan(null, "box", 6, undefined), null);
  assert.equal(setupPlan(null, "box", 6, 4), 4);
});
