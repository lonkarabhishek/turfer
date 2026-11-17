import { test } from "node:test";
import assert from "node:assert/strict";
import { agoWords, clockWords, dayWords, instant, stampWords } from "./when";
import { UPDATES_MAX, UPDATES_PER_DAY, UPDATE_CHARS, canPostUpdate, updateProblem, updateWhen, updatesList, updatesOf, updatesReady } from "./updates";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// 17 Nov 2026, 3:40 PM in India.
const NOW = Date.parse("2026-11-17T10:10:00Z");
const M = 60_000, H = 60 * M;

test("when: India's clock and calendar, whatever the device's", () => {
  assert.equal(stampWords(NOW), "Tue 17 Nov, 3:40 PM");
  assert.equal(stampWords(Date.parse("2026-11-17T18:30:00Z")), "Wed 18 Nov, 12 AM", "midnight in India is the next day");
  assert.equal(stampWords(Date.parse("2026-11-17T06:35:00Z")), "Tue 17 Nov, 12:05 PM");
  assert.equal(stampWords(Date.parse("2025-12-30T20:00:00Z"), NOW), "Wed 31 Dec 2025, 1:30 AM", "another year is said");
  assert.equal(dayWords("2026-11-15"), "Sun 15 Nov");
  assert.equal(dayWords("2027-01-02", 2026), "Sat 2 Jan 2027");
  assert.equal(dayWords("15 Nov"), "");
  assert.deepEqual(["19:00", "19:30:00", "00:00", "12:05", "7:00", "25:00", ""].map(clockWords), ["7 PM", "7:30 PM", "12 AM", "12:05 PM", "7 AM", "", ""]);
  assert.deepEqual([instant("2026-11-17T10:10:00Z"), instant(NOW), instant("x"), instant(null), instant("")], [NOW, NOW, null, null, null]);
});

test("when: how long ago", () => {
  assert.equal(agoWords(NOW - 20_000, NOW), "just now");
  assert.equal(agoWords(NOW + 30_000, NOW), "just now", "a clock a little ahead");
  assert.equal(agoWords(NOW - M, NOW), "1 min ago");
  assert.equal(agoWords(NOW - 59 * M, NOW), "59 min ago");
  assert.equal(agoWords(NOW - H, NOW), "1 h ago");
  assert.equal(agoWords(NOW - 2 * H - 20 * M, NOW), "2 h ago");
  assert.equal(agoWords(NOW - 23 * H, NOW), "23 h ago", "under a day is hours, even across India's midnight");
  assert.equal(agoWords(NOW - 24 * H, NOW), "yesterday");
  assert.equal(agoWords(NOW - 39 * H, NOW), "yesterday", "16 Nov, 12:40 AM in India");
  assert.equal(agoWords(NOW - 41 * H, NOW), "2 days ago", "15 Nov, 10:40 PM in India: two calendar days back");
  assert.equal(agoWords(NOW - 6 * 24 * H, NOW), "6 days ago");
  assert.equal(agoWords(NOW - 7 * 24 * H, NOW), "Tue 10 Nov", "a week on, the day");
  assert.equal(agoWords(Date.parse("2025-11-17T10:10:00Z"), NOW), "Mon 17 Nov 2025");
});

test("updates: what the row holds, as the page takes it", () => {
  const rows = [
    { id: ID(2), at: "2026-11-17T09:00:00Z", text: "  Bring bottles  " },
    { id: ID(1), at: "2026-11-16T09:00:00Z", text: "Turf booked" },
    { id: "not-an-id", at: "2026-11-16T09:00:00Z", text: "x" },
    { id: ID(3), at: "nope", text: "x" },
    { id: ID(4), at: "2026-11-16T09:00:00Z", text: "   " },
    null,
    "x",
  ];
  assert.deepEqual(updatesOf({ updates: rows }), [
    { id: ID(1), at: "2026-11-16T09:00:00Z", text: "Turf booked" },
    { id: ID(2), at: "2026-11-17T09:00:00Z", text: "Bring bottles" },
  ], "well formed ones only, oldest first");
  assert.deepEqual([updatesOf(null), updatesOf({}), updatesOf({ updates: "x" })], [[], [], []]);
  assert.equal(updatesOf({ updates: Array.from({ length: 30 }, (_, i) => ({ id: ID(i), at: "2026-11-16T09:00:00Z", text: "u" })) }).length, UPDATES_MAX);
  assert.deepEqual([updatesReady({ updates: [] }), updatesReady({ id: "x" }), updatesReady(null)], [true, false, false], "before the file the row has no such column");
});

test("updates: the list, newest first, the note the game went up with last", () => {
  const g = { created_at: "2026-11-15T04:00:00Z", updates: [{ id: ID(1), at: "2026-11-16T09:00:00Z", text: "Turf booked" }, { id: ID(2), at: "2026-11-17T08:10:00Z", text: "Bring bottles" }] };
  const list = updatesList(g, "Turf will be booked once players confirm");
  assert.deepEqual(list.map((e) => [e.id, e.text, e.original]), [[ID(2), "Bring bottles", false], [ID(1), "Turf booked", false], [null, "Turf will be booked once players confirm", true]]);
  assert.deepEqual(list.map((e) => updateWhen(e, NOW).ago), ["2 h ago", "yesterday", "2 days ago"]);
  assert.deepEqual(updateWhen(list[0], NOW), { ago: "2 h ago", stamp: "Tue 17 Nov, 1:40 PM", iso: "2026-11-17T08:10:00.000Z" }, "the full India date and time behind it");
  assert.deepEqual(updateWhen(list[2], NOW).stamp, "Sun 15 Nov, 9:30 AM", "the first note's time is when the game was posted");
  assert.deepEqual(updatesList({ created_at: "2026-11-15T04:00:00Z" }, "Bring a dark tee").map((e) => [e.id, e.original]), [[null, true]], "a game from before updates: its note alone");
  assert.deepEqual(updatesList({ created_at: "2026-11-15T04:00:00Z", updates: [] }, null), [], "no note and no updates: nothing");
  assert.deepEqual(updatesList(g, null).length, 2, "updates without a first note");
  assert.deepEqual(updateWhen(updatesList({}, "A note")[0], NOW), { ago: "", stamp: "", iso: "" }, "no created_at: no time is made up");
});

test("updates: the limits", () => {
  assert.deepEqual([UPDATE_CHARS, UPDATES_MAX, UPDATES_PER_DAY], [300, 20, 10]);
  assert.deepEqual([updateProblem(""), updateProblem("  \n "), updateProblem(null), updateProblem("ok"), updateProblem("x".repeat(300)), updateProblem(` ${"x".repeat(300)} `), updateProblem("x".repeat(301))],
    ["missing", "missing", "missing", null, null, null, "long"]);
  assert.equal(updateProblem("न".repeat(300)), null, "characters, not bytes");
  const full = { updates: Array.from({ length: 20 }, (_, i) => ({ id: ID(i), at: "2026-11-16T09:00:00Z", text: "u" })) };
  assert.deepEqual([canPostUpdate({ updates: [] }), canPostUpdate(full), canPostUpdate({}), canPostUpdate(null)], [true, false, false, false], "20 a game; nothing to post into before the file");
});
