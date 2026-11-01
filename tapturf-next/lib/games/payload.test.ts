import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, fieldProblem, gameOver, hostFirst, isDay, isUuid, parseChanges, parseCreate, parseNote, CHANGE_FIELDS } from "./payload";
import { gameProblem } from "./client";

const TURF = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const TODAY = "2026-10-30";
const GAME = { turf_id: TURF, sport: "Football", skill_level: "all", max_players: 10, date: "2026-11-01", start_time: "19:00", end_time: "20:00", price_per_player: 150 };

test("days: real ones only, and counting on", () => {
  assert.equal(isDay("2026-11-01"), true);
  assert.equal(isDay("2026-02-30"), false);
  assert.equal(isDay("2026-13-01"), false);
  assert.equal(isDay("1 Nov"), false);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-10-30", 365), "2027-10-30");
});

test("create: the host's fields, each checked, the day from today to a year on", () => {
  const ok = parseCreate({ ...GAME, turf_id: TURF.toUpperCase(), sport: "  Box Cricket ", description: "  Tennis ball  ", turf_booked: true, host_phone: "+919812345678" }, TODAY);
  assert.ok("ok" in ok);
  assert.deepEqual(ok.ok, { ...GAME, sport: "Box Cricket", description: "Tennis ball", turf_booked: true, host_phone: "+919812345678" });
  assert.ok("ok" in parseCreate({ ...GAME, date: TODAY }, TODAY), "today is fine");
  assert.ok("ok" in parseCreate({ ...GAME, host_phone: "" }, TODAY), "no number is fine");
  assert.ok("ok" in parseCreate({ ...GAME, description: undefined }, TODAY), "an undefined field is left out, as JSON would");
  const bad: [Record<string, unknown>, string][] = [
    [{ ...GAME, date: "2026-10-29" }, "date"],
    [{ ...GAME, date: "2027-11-01" }, "date"],
    [{ ...GAME, date: "2026-02-30" }, "date"],
    [{ ...GAME, max_players: 1 }, "max_players"],
    [{ ...GAME, max_players: 51 }, "max_players"],
    [{ ...GAME, max_players: 4.5 }, "max_players"],
    [{ ...GAME, max_players: "10" }, "max_players"],
    [{ ...GAME, price_per_player: -1 }, "price_per_player"],
    [{ ...GAME, price_per_player: 10_001 }, "price_per_player"],
    [{ ...GAME, price_per_player: 1.005 }, "price_per_player"],
    [{ ...GAME, start_time: "7 pm" }, "start_time"],
    [{ ...GAME, end_time: "24:00" }, "end_time"],
    [{ ...GAME, skill_level: "pro" }, "skill_level"],
    [{ ...GAME, turf_id: "kings-turf" }, "turf_id"],
    [{ ...GAME, sport: " " }, "sport"],
    [{ ...GAME, sport: "x".repeat(41) }, "sport"],
    [{ ...GAME, description: "x".repeat(501) }, "description"],
    [{ ...GAME, turf_booked: "yes" }, "turf_booked"],
    [{ ...GAME, host_phone: "9812345678" }, "host_phone"],
    [{ ...GAME, host_phone: "+915812345678" }, "host_phone"],
    // Never from the browser: who hosts, the status, the count, the name and photo.
    [{ ...GAME, creator_id: "x" }, "creator_id"],
    [{ ...GAME, status: "full" }, "status"],
    [{ ...GAME, current_players: 9 }, "current_players"],
    [{ ...GAME, host_name: "Someone" }, "host_name"],
    [{ ...GAME, user_id: "x" }, "user_id"],
    [{ ...GAME, sport: undefined }, "sport"],
  ];
  for (const [b, field] of bad) assert.deepEqual(parseCreate(b, TODAY), { bad: field }, JSON.stringify(b));
  assert.deepEqual(parseCreate(null, TODAY), { bad: "body" });
});

test("edit: only the sheet's fields; a move is a turf id", () => {
  assert.deepEqual(parseChanges({ turf_id: TURF.toUpperCase(), turf_booked: false }), { ok: { turf_id: TURF, turf_booked: false } });
  assert.deepEqual(parseChanges({ description: "  Bring water " }), { ok: { description: "Bring water" } });
  assert.deepEqual(parseChanges({ description: null }), { ok: { description: null } });
  assert.deepEqual(parseChanges({ start_time: "19:00:00" }), { ok: { start_time: "19:00:00" } }, "the time as the row has it");
  for (const k of ["status", "current_players", "creator_id", "host_phone", "host_name", "title", "sport", "id"]) {
    assert.deepEqual(parseChanges({ [k]: "x" }), { bad: k }, k);
  }
  assert.deepEqual(parseChanges({}), { bad: "body" });
  assert.deepEqual(parseChanges({ max_players: 0 }), { bad: "max_players" });
  assert.deepEqual([...CHANGE_FIELDS].sort(), ["date", "description", "end_time", "max_players", "price_per_player", "skill_level", "start_time", "turf_booked", "turf_id"]);
  assert.equal(fieldProblem([], CHANGE_FIELDS), "body");
});

test("a join note: trimmed, 300 characters at most", () => {
  assert.deepEqual(parseNote("  I can keep goal  "), { ok: "I can keep goal" });
  assert.deepEqual(parseNote("   "), { ok: null });
  assert.deepEqual(parseNote(undefined), { ok: null });
  assert.deepEqual(parseNote("x".repeat(300)), { ok: "x".repeat(300) });
  assert.deepEqual(parseNote("x".repeat(301)), { bad: true });
  assert.deepEqual(parseNote(7), { bad: true });
});

test("over: as close_past_games reads it, 30 minutes after the end, in India", () => {
  // 7 to 8 pm IST on 1 Nov is 13:30 to 14:30 UTC; over from 15:00 UTC.
  const g = { date: "2026-11-01", start_time: "19:00:00", end_time: "20:00:00" };
  assert.equal(gameOver(g, Date.parse("2026-11-01T14:59:00Z")), false);
  assert.equal(gameOver(g, Date.parse("2026-11-01T15:01:00Z")), true);
  // Ends after midnight (end before start): 2 hours after the start, then 30 minutes.
  const late = { date: "2026-11-01", start_time: "23:00", end_time: "01:00" };
  assert.equal(gameOver(late, Date.parse("2026-11-01T19:59:00Z")), false);
  assert.equal(gameOver(late, Date.parse("2026-11-01T20:01:00Z")), true);
});

test("ids and names", () => {
  assert.equal(isUuid(TURF), true);
  assert.equal(isUuid("x"), false);
  assert.equal(isUuid(7), false);
  assert.equal(hostFirst(" Asha  Rao "), "Asha");
  assert.equal(hostFirst(null), "Your host");
});

test("what the page says when the server says no", () => {
  const no = (status: number, body: Record<string, unknown>) => gameProblem({ status, body: body as { error: string } });
  assert.equal(gameProblem({ status: 200, body: { r: "ok" } as never }), null);
  assert.equal(no(409, { error: "not_allowed", reason: "full" }), "This game is full.");
  assert.equal(no(409, { error: "not_allowed", reason: "not_host" }), "Only the host can do that.");
  assert.equal(no(409, { error: "conflict", reason: "pending" }), "You already have a pending request.");
  assert.equal(no(400, { error: "bad", reason: "too_few", players: 6 }), "6 players are in already: max players can't be fewer.");
  assert.equal(no(400, { error: "bad", reason: "venue" }), "That venue isn't listed on TapTurf any more. Pick another one.");
  assert.equal(no(400, { error: "bad", field: "note" }), "Keep the note to 300 characters.");
  assert.equal(no(400, { error: "bad", field: "something" }), "Something there doesn't look right. Check it and try again.");
  assert.equal(no(401, { error: "sign_in" }), "Your login ended. Please log in again.");
  assert.equal(no(429, { error: "limit" }), "That's a lot for one day. Try again later.");
  assert.equal(no(0, { error: "unavailable" }), "Couldn't reach TapTurf. Check your connection and try again.");
});
