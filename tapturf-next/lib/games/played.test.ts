import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAYED_ASK_DAYS, PLAYED_SHOWN, taggedGames, taggedView, taggedWords } from "./played";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// 17 Nov 2026, 3:40 PM in India.
const NOW = Date.parse("2026-11-17T10:10:00Z");
const row = (n: number, date: string, o: Record<string, unknown> = {}) => ({ game_id: ID(n), sport: "Football", date, start_time: "19:00", end_time: "20:00", venue: "Kings Turf", host: "Asha", ...o });

test("played: the games to ask about are over, at most 90 days old, newest first, each once", () => {
  const rows = [
    row(1, "2026-11-10"),
    row(2, "2026-11-16", { start_time: "07:00", end_time: "08:00" }),
    row(3, "2026-11-16", { start_time: "21:00", end_time: "22:00" }),
    row(4, "2026-11-17", { start_time: "15:00", end_time: "16:00" }), // still on: ends 4 PM, it is 3:40 PM
    row(5, "2026-11-17", { start_time: "14:00", end_time: "15:30" }), // over ten minutes ago
    row(6, "2026-11-18"), // tomorrow
    row(7, "2026-08-19"), // 90 days ago
    row(8, "2026-08-18"), // 91
    row(1, "2026-11-10"), // twice
    { game_id: "nope", date: "2026-11-10" },
    row(9, "soon"),
    null,
  ];
  assert.deepEqual(taggedGames(rows, NOW).map((g) => g.gameId), [ID(5), ID(3), ID(2), ID(1), ID(7)]);
  assert.equal(PLAYED_ASK_DAYS, 90);
  assert.deepEqual([taggedGames(null, NOW), taggedGames("x", NOW), taggedGames([], NOW)], [[], [], []]);
});

test("played: a game past midnight, or with no end, is over when Passport says so", () => {
  const late = row(1, "2026-11-16", { start_time: "23:00", end_time: "01:00" });
  assert.equal(taggedGames([late], Date.parse("2026-11-16T19:00:00Z")).length, 0, "12:30 AM: still on");
  assert.equal(taggedGames([late], Date.parse("2026-11-16T19:31:00Z")).length, 1, "1:01 AM: over");
  const open = row(2, "2026-11-17", { start_time: "14:00", end_time: null });
  assert.equal(taggedGames([open], Date.parse("2026-11-17T09:29:00Z")).length, 0, "no end: an hour after the start");
  assert.equal(taggedGames([open], Date.parse("2026-11-17T09:31:00Z")).length, 1);
});

test("played: what a row may carry", () => {
  const [g] = taggedGames([row(1, "2026-11-10T00:00:00", { sport: "  Box Cricket ", venue: "", host: 7, start_time: "19:00:00", phone: "+919800000001", note: "x" })], NOW);
  assert.deepEqual(g, { gameId: ID(1), sport: "Box Cricket", venue: null, date: "2026-11-10", start_time: "19:00", end_time: "20:00", host: null }, "these keys only");
  assert.deepEqual(taggedWords(g, NOW), { title: "Box Cricket", when: "Tue 10 Nov, 7 PM", by: "Added by the host" });
  assert.deepEqual(taggedWords(taggedGames([row(2, "2026-11-14")], NOW)[0], NOW), { title: "Football at Kings Turf", when: "Sat 14 Nov, 7 PM", by: "Added by Asha" });
  assert.equal(taggedWords({ gameId: ID(3), sport: null, venue: "Kings Turf", date: "2025-12-30", start_time: null, end_time: null, host: "Asha" }, NOW).when, "Tue 30 Dec 2025", "another year is said");
});

test("played: ten shown, then Show more", () => {
  const many = taggedGames(Array.from({ length: 14 }, (_, i) => row(i + 1, `2026-11-${String(i + 1).padStart(2, "0")}`)), NOW);
  assert.equal(PLAYED_SHOWN, 10);
  assert.deepEqual([taggedView(many, false).shown.length, taggedView(many, false).more, taggedView(many, false).shown[0].date], [10, 4, "2026-11-14"]);
  assert.deepEqual([taggedView(many, true).shown.length, taggedView(many, true).more], [14, 0]);
  assert.deepEqual(taggedView(many.slice(0, 10), false).more, 0);
  assert.equal(taggedGames(Array.from({ length: 80 }, (_, i) => row(i + 1, "2026-11-01")), NOW).length, 50, "50 at most");
});
