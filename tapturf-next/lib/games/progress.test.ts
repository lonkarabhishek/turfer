import { test } from "node:test";
import assert from "node:assert/strict";
import { FAST, barOf, barWords, confirmedCount, joinedOnTapTurf, joinsNeeded, speedOf } from "./progress";

const NOW = Date.parse("2026-11-17T12:00:00Z");
const H = 3_600_000;
const ago = (hours: number) => new Date(NOW - hours * H).toISOString();
const base = { closed: false, now: NOW };

test("progress: the bar is current of max, clamped", () => {
  assert.deepEqual(barOf(7, 14), { current: 7, max: 14, open: 7, percent: 50, full: false });
  assert.deepEqual(barOf(14, 14), { current: 14, max: 14, open: 0, percent: 100, full: true });
  assert.deepEqual(barOf(16, 14), { current: 16, max: 14, open: 0, percent: 100, full: true }, "over its max never draws past the end");
  assert.deepEqual(barOf(1, 50), { current: 1, max: 50, open: 49, percent: 4, full: false }, "one player still shows a sliver");
  assert.deepEqual(barOf(0, 10), { current: 0, max: 10, open: 10, percent: 0, full: false });
  assert.deepEqual(barOf("x", null), { current: 0, max: 0, open: 0, percent: 0, full: false }, "a row without numbers draws nothing");
  assert.equal(barOf(1, 3).percent, 33);
});

test("progress: the thresholds", () => {
  assert.deepEqual([FAST.RECENT_HOURS, FAST.JOINS, FAST.JOINS_SMALL, FAST.SMALL_GAME, FAST.YOUNG_HOURS, FAST.YOUNG_SHARE, FAST.ALMOST_SPOTS, FAST.ALMOST_SHARE], [24, 3, 2, 10, 48, 0.5, 2, 0.6]);
  assert.deepEqual([4, 9, 10, 14, 22].map(joinsNeeded), [2, 2, 3, 3, 3], "3 joins in a game of 10 or more, 2 in a smaller one");
});

test("progress: a slow game says nothing", () => {
  const none = { label: null, detail: null, kind: null, fast: false };
  assert.deepEqual(speedOf({ ...base, current: 1, max: 14, createdAt: ago(2) }), none, "a new game with its host alone");
  assert.deepEqual(speedOf({ ...base, current: 3, max: 14, createdAt: ago(200), joinedAt: [ago(100), ago(150)] }), none, "two joins days ago");
  assert.deepEqual(speedOf({ ...base, current: 3, max: 14, createdAt: ago(200), joinedAt: [ago(1), ago(2)] }), none, "two joins today in a game of 14: one short");
  assert.deepEqual(speedOf({ ...base, current: 2, max: 6, createdAt: ago(200), joinedAt: [ago(1)] }), none, "one join is never fast, however small the game");
  assert.deepEqual(speedOf({ ...base, current: 4, max: 14, createdAt: ago(200), joinedAt: [ago(24.1), ago(25), ago(30)] }), none, "three joins just over 24 hours ago");
});

test("progress: filling fast on the game page, from when players joined", () => {
  assert.deepEqual(speedOf({ ...base, current: 4, max: 14, createdAt: ago(200), joinedAt: [ago(1), ago(5), ago(24)] }),
    { label: "Filling fast", detail: "3 joined in the last 24 hours", kind: "fast", fast: true }, "three joins inside 24 hours (the edge counts)");
  assert.deepEqual(speedOf({ ...base, current: 3, max: 6, createdAt: ago(200), joinedAt: [ago(1), ago(5)] }),
    { label: "Filling fast", detail: "2 joined in the last 24 hours", kind: "fast", fast: true }, "two in a small game");
  assert.deepEqual(speedOf({ ...base, current: 6, max: 14, createdAt: ago(200), joinedAt: [ago(1), ago(2), ago(3), ago(4), ago(90)] }).detail, "4 joined in the last 24 hours", "the number is the joins in the window");
  assert.equal(speedOf({ ...base, current: 4, max: 14, joinedAt: [ago(1), ago(5), new Date(NOW + 2 * H).toISOString()] }).fast, false, "a join time in the future is no join");
  assert.equal(speedOf({ ...base, current: 4, max: 14, joinedAt: [ago(1), "not a time", null, ago(2)] }).fast, false, "nor is a bad one");
});

test("progress: the host's confirmed friends move the bar, never the speed", () => {
  // 9 of 14 two hours after posting: the host, 8 friends typed in, nobody joined.
  assert.equal(speedOf({ ...base, current: 9, max: 14, createdAt: ago(2), joined: 0 }).label, null, "half full at once with nobody joined: not fast");
  assert.equal(speedOf({ ...base, current: 9, max: 14, createdAt: ago(2), joined: 2 }).label, null, "two joined: one short");
  assert.equal(joinedOnTapTurf({ current_players: 9, confirmed_names: ["A", "B", "C"], confirmed_extra: 3, confirmed_tagged: 2 }), 0, "current less the host and every confirmed person");
  assert.equal(joinedOnTapTurf({ current_players: 9, confirmed_named: 3, confirmed_extra: 1, confirmed_tagged: 1 }), 3, "a list row (names left out, their count kept)");
  assert.equal(joinedOnTapTurf({ current_players: 5 }), 4, "a row from before confirmed people");
  assert.equal(joinedOnTapTurf({ current_players: 1, confirmed_extra: 4 }), 0, "never below zero");
  assert.equal(confirmedCount({ confirmed_names: ["A"], confirmed_named: 7, confirmed_extra: 1 }), 2, "the names, when the row has them, are what is counted");
});

test("progress: filling fast on a card, from the row alone", () => {
  const card = { ...base, current: 7, max: 14, joined: 3 };
  assert.deepEqual(speedOf({ ...card, createdAt: ago(47) }), { label: "Filling fast", detail: null, kind: "fast", fast: true }, "half full within 48 hours of posting, 3 joined");
  assert.equal(speedOf({ ...card, createdAt: ago(48) }).fast, true, "the 48th hour counts");
  assert.equal(speedOf({ ...card, createdAt: ago(48.1) }).fast, false, "past it, a card says nothing");
  assert.equal(speedOf({ ...card, current: 6, createdAt: ago(10) }).fast, false, "under half full");
  assert.equal(speedOf({ ...card, createdAt: null }).fast, false, "a row with no created_at (the map's) says nothing");
  assert.equal(speedOf({ ...card, createdAt: new Date(NOW + H).toISOString() }).fast, false, "nor one posted in the future");
  assert.equal(speedOf({ ...base, current: 3, max: 6, joined: 2, createdAt: ago(5) }).fast, true, "a small game: 2 joined");
});

test("progress: almost full, and full", () => {
  assert.deepEqual(speedOf({ ...base, current: 12, max: 14, createdAt: ago(300) }), { label: "Almost full: 2 spots left", detail: null, kind: "almost", fast: false });
  assert.deepEqual(speedOf({ ...base, current: 13, max: 14, createdAt: ago(300) }).label, "Almost full: 1 spot left");
  assert.equal(speedOf({ ...base, current: 11, max: 14 }).label, null, "3 left: not yet");
  assert.equal(speedOf({ ...base, current: 1, max: 3 }).label, null, "1 of 3 has 2 spots left and is not almost full");
  assert.equal(speedOf({ ...base, current: 2, max: 4 }).label, null, "nor 2 of 4");
  assert.equal(speedOf({ ...base, current: 2, max: 3 }).label, "Almost full: 1 spot left");
  assert.equal(speedOf({ ...base, current: 3, max: 5 }).label, "Almost full: 2 spots left", "60% with 2 left");
  assert.deepEqual(speedOf({ ...base, current: 12, max: 14, joinedAt: [ago(1), ago(2), ago(3)] }),
    { label: "Almost full: 2 spots left", detail: "3 joined in the last 24 hours", kind: "almost", fast: true }, "almost full and really fast: both said, the bar moves");
  assert.deepEqual(speedOf({ ...base, current: 14, max: 14, joinedAt: [ago(1), ago(2), ago(3)] }), { label: "Full", detail: null, kind: "full", fast: false }, "full: no speed");
  assert.equal(speedOf({ ...base, current: 15, max: 14 }).label, "Full");
});

test("progress: a game that has started, is over or is off says nothing", () => {
  for (const g of [{ current: 14, max: 14 }, { current: 12, max: 14 }, { current: 7, max: 14, joined: 5, createdAt: ago(3), joinedAt: [ago(1), ago(1), ago(1)] }]) {
    assert.deepEqual(speedOf({ ...base, ...g, closed: true }), { label: null, detail: null, kind: null, fast: false });
  }
  assert.equal(speedOf({ ...base, current: 3, max: 0 }).label, null, "nor a row with no max");
});

test("progress: the bar in words, for a screen reader", () => {
  const none = speedOf({ ...base, current: 7, max: 14 });
  assert.equal(barWords(barOf(7, 14), none), "7 of 14 players going, 7 spots open.");
  assert.equal(barWords(barOf(13, 14), speedOf({ ...base, current: 13, max: 14 })), "13 of 14 players going, 1 spot open.");
  assert.equal(barWords(barOf(14, 14), speedOf({ ...base, current: 14, max: 14 })), "14 of 14 players going, no spots left.");
  assert.equal(barWords(barOf(7, 14), speedOf({ ...base, current: 7, max: 14, joined: 3, createdAt: ago(3) })), "7 of 14 players going, 7 spots open. Filling fast.");
  assert.equal(barWords(barOf(9, 14), none, true), "9 of 14 players joined.");
});
