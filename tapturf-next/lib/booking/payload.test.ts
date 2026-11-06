import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanNote, isUuid, parseSend } from "./payload";

const TURF = "CCCCCCCC-0000-4000-8000-000000000001";
const OK = { turf_id: TURF, at: "2026-11-07T19:00", hours: 2, note: "5-a-side" };

test("a good body: the turf's id lowercased, the rest as sent", () => {
  assert.deepEqual(parseSend(OK), { ok: { turf_id: TURF.toLowerCase(), at: "2026-11-07T19:00", hours: 2, note: "5-a-side" } });
  assert.deepEqual(parseSend({ turf_id: TURF, at: "2026-11-07T19:00", hours: 1 }), { ok: { turf_id: TURF.toLowerCase(), at: "2026-11-07T19:00", hours: 1, note: null } }, "no note");
  assert.deepEqual(parseSend({ ...OK, note: null }), { ok: { turf_id: TURF.toLowerCase(), at: "2026-11-07T19:00", hours: 2, note: null } });
});

test("turf_id: a uuid", () => {
  for (const v of ["", "one-arena", 7, null, undefined, `${TURF}x`, "../x"]) assert.deepEqual(parseSend({ ...OK, turf_id: v }), { bad: "turf_id" }, String(v));
  assert.equal(isUuid(TURF), true);
});

test("at: a slot key (India date and time to the minute, a real one)", () => {
  for (const v of ["2026-11-07T24:00", "2026-02-30T10:00", "2026-11-07 19:00", "2026-11-07T19:00:00", "tomorrow", 1, null, undefined])
    assert.deepEqual(parseSend({ ...OK, at: v }), { bad: "at" }, String(v));
});

test("hours: a whole number from 1 to 3", () => {
  for (const v of [0, 4, 1.5, "2", null, undefined, -1, Number.NaN]) assert.deepEqual(parseSend({ ...OK, hours: v }), { bad: "hours" }, String(v));
  for (const v of [1, 2, 3]) assert.equal("ok" in parseSend({ ...OK, hours: v }), true, String(v));
});

test("note: control characters out, whitespace folded, trimmed, 140 at most, empty is none", () => {
  assert.deepEqual(cleanNote("  5-a-side,\n\t10   players\u0007 "), { ok: "5-a-side, 10 players" });
  assert.deepEqual(cleanNote(`a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x85)}c`), { ok: "a b c" });
  assert.deepEqual(cleanNote("   "), { ok: null });
  assert.deepEqual(cleanNote(""), { ok: null });
  assert.deepEqual(cleanNote(null), { ok: null });
  assert.deepEqual(cleanNote(undefined), { ok: null });
  assert.deepEqual(cleanNote("x".repeat(140)), { ok: "x".repeat(140) });
  assert.deepEqual(cleanNote("x".repeat(141)), { bad: true });
  assert.deepEqual(cleanNote("क".repeat(140)), { ok: "क".repeat(140) }, "characters, not bytes");
  assert.deepEqual(cleanNote(" ".repeat(50) + "x".repeat(140) + " ".repeat(50)), { ok: "x".repeat(140) }, "counted after trimming");
  for (const v of [5, {}, [], true]) assert.deepEqual(parseSend({ ...OK, note: v }), { bad: "note" }, String(v));
  assert.deepEqual(parseSend({ ...OK, note: "x".repeat(141) }), { bad: "note" });
});

test("anything else is refused with its field, or the body", () => {
  for (const extra of ["user_id", "status", "player_name", "player_phone", "name", "phone"]) assert.deepEqual(parseSend({ ...OK, [extra]: "x" }), { bad: extra }, extra);
  assert.deepEqual(parseSend({ ...OK, "Weird Key!": 1 }), { bad: "body" });
  assert.deepEqual(parseSend(null), { bad: "body" });
});
