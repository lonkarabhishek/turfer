import { test } from "node:test";
import assert from "node:assert/strict";
import { fail, queueOf, settle, shown, takeBatch, tap, tapMany, unsaved } from "./queue";
import { MAX_CHANGES } from "./slots";

const A = "2026-11-05T19:00";
const B = "2026-11-05T20:00";
const C = "2026-11-05T21:00";
const list = (s: Set<string>) => [...s].sort();

test("a tap flips the hour at once; a second tap before it is sent cancels it", () => {
  let q = queueOf([B]);
  q = tap(q, A);
  assert.deepEqual(list(shown(q)), [A, B]);
  assert.equal(unsaved(q, A), true);
  assert.equal(unsaved(q, B), false);
  q = tap(q, A);
  assert.deepEqual(list(shown(q)), [B]);
  assert.equal(q.pending.size, 0, "nothing to send");
  assert.equal(takeBatch(q), null);
  q = tap(q, B);
  assert.deepEqual(list(shown(q)), []);
  assert.deepEqual(takeBatch(q)?.batch, [{ at: B, status: "free" }]);
});

test("taps while a batch is in flight wait for the next batch", () => {
  let q = tap(queueOf([]), A);
  const first = takeBatch(q)!;
  assert.deepEqual(first.batch, [{ at: A, status: "booked" }]);
  q = first.q;
  assert.equal(takeBatch(q), null, "one batch in flight at most");
  q = tap(q, B);
  q = tap(q, A); // unbook A while its booking is being saved
  assert.deepEqual(list(shown(q)), [B]);
  assert.equal(unsaved(q, A), true);
  q = settle(q, [A]);
  assert.equal(q.inflight, null);
  assert.deepEqual(list(shown(q)), [B], "the taps since are kept");
  const next = takeBatch(q)!;
  assert.deepEqual(next.batch, [{ at: B, status: "booked" }, { at: A, status: "free" }]);
});

test("settle drops taps the database already has; fail puts every unsaved tap back", () => {
  let q = tap(tap(queueOf([]), A), B);
  q = takeBatch(q)!.q;
  q = tap(q, C);
  // Another phone booked C meanwhile: the answer has it, so the tap is no change any more.
  q = settle(q, [A, B, C]);
  assert.equal(q.pending.size, 0);
  assert.deepEqual(list(shown(q)), [A, B, C]);
  q = tap(q, A);
  q = takeBatch(q)!.q;
  q = tap(q, B);
  assert.deepEqual(list(shown(q)), [C]);
  q = fail(q);
  assert.deepEqual(list(shown(q)), [A, B, C], "as the database last said");
  assert.equal(q.inflight, null);
  assert.equal(q.pending.size, 0);
  assert.equal(unsaved(q, A) || unsaved(q, B), false);
});

test("a batch is at most MAX_CHANGES; tapMany sets several hours, and an Undo puts them back", () => {
  const many = Array.from({ length: MAX_CHANGES + 5 }, (_, i) => ({ at: `2026-11-0${6 + Math.floor(i / 24)}T${String(i % 24).padStart(2, "0")}:00`, status: "booked" as const }));
  let q = tapMany(queueOf([]), many);
  const t = takeBatch(q)!;
  assert.equal(t.batch.length, MAX_CHANGES);
  assert.equal(t.q.pending.size, 5);
  q = tapMany(queueOf([B]), [{ at: A, status: "booked" }, { at: B, status: "booked" }, { at: C, status: "booked" }]);
  assert.deepEqual(list(shown(q)), [A, B, C]);
  assert.equal(q.pending.size, 2, "B was booked already");
  q = tapMany(q, [{ at: A, status: "free" }, { at: C, status: "free" }]);
  assert.equal(q.pending.size, 0, "the undo before it is sent: nothing to send");
  assert.deepEqual(list(shown(q)), [B]);
});
