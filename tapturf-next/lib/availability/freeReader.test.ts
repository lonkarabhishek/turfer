import { test } from "node:test";
import assert from "node:assert/strict";
import { MEMO_MS, STALE_MS, makeFreeReader, readFreeOnce, windowOf, type ReadFree, type ReadNumbers } from "./freeReader";

const NOW = Date.parse("2026-11-10T11:00:00Z");
const ID = (i: number) => `dddddddd-0000-4000-8000-${String(i).padStart(12, "0")}`;
const turf = (i: number) => ({
  id: ID(i), slug: `t${i}`, name: `Turf ${i}`, area: null, city: "bangalore", lat: null, lng: null, updated_at: new Date(NOW - 3_600_000).toISOString(), requests: false, booked: [],
  hours: { opening_hours: null, start_time: "06:00:00", end_time: "23:00:00", is_24x7: false, closed_days: null },
});
const ANSWER = { now: new Date(NOW).toISOString(), turfs: [turf(1), turf(2), turf(3)] };
// Turf 1 has a mobile, 2 a landline, 3 nothing to call.
const NUMBERS = [{ id: ID(1), owner_phone: "9000000101" }, { id: ID(2), landline_phone: "0253 235 0977" }, { id: ID(3), owner_phone: "12345" }];

test("a read: the database's turfs, those whose page has no number left out; the numbers read for those turfs only, never kept", async () => {
  const asked: string[][] = [];
  const out = await readFreeOnce(async () => ({ data: ANSWER, error: null }), async (ids) => (asked.push(ids), { data: NUMBERS, error: null }), null, 36);
  assert.deepEqual(out.rows.map((r) => r.id), [ID(1), ID(2)]);
  assert.deepEqual(asked, [[ID(1), ID(2), ID(3)]]);
  assert.ok(!JSON.stringify(out).includes("9000000101"), "no number in what it gives");
  // None: no numbers read.
  const none = await readFreeOnce(async () => ({ data: { now: ANSWER.now, turfs: [] }, error: null }), async () => assert.fail("no read"), null, 36);
  assert.deepEqual(none.rows, []);
});

test("before the migration: no turfs; any other error, or a malformed answer, or the numbers failing: it throws", async () => {
  const nums: ReadNumbers = async () => ({ data: NUMBERS, error: null });
  for (const code of ["PGRST202", "42883"]) assert.deepEqual((await readFreeOnce(async () => ({ data: null, error: { code } }), nums, null, 36)).rows, []);
  await assert.rejects(readFreeOnce(async () => ({ data: null, error: { code: "57014", message: "timeout" } }), nums, null, 36), /57014/);
  await assert.rejects(readFreeOnce(async () => ({ data: [1], error: null }), nums, null, 36), /something else/);
  await assert.rejects(readFreeOnce(async () => ({ data: ANSWER, error: null }), async () => ({ data: null, error: { message: "x" } }), null, 36), /turf numbers/);
});

test("memoised a minute per city and window; callers share a read; a failure gives the last copy under 5 minutes old, else throws", async () => {
  let t = NOW;
  let reads = 0;
  let fail = false;
  const read: ReadFree = async (city, hours) => {
    reads++;
    assert.ok(hours === 36 || hours === 192, `window ${hours}`);
    if (fail) return { data: null, error: { code: "57014", message: "down" } };
    return { data: ANSWER, error: null };
  };
  const get = makeFreeReader(read, async () => ({ data: NUMBERS, error: null }), () => t);
  const [a, b] = await Promise.all([get(null), get(null)]);
  assert.equal(reads, 1, "two callers, one read");
  assert.equal(a, b);
  t += MEMO_MS - 1;
  await get(null);
  assert.equal(reads, 1, "a minute: the same copy");
  await get(null, 100);
  assert.equal(reads, 2, "another window is another read (8 days)");
  await get("bangalore");
  assert.equal(reads, 3, "another city is another read");
  t += 2;
  fail = true;
  const stale = await get(null);
  assert.equal(stale, a, "a failed read: the last copy");
  t += STALE_MS;
  await assert.rejects(get(null), /down/, "the last copy is too old");
  fail = false;
  t += 1;
  assert.equal((await get(null)).rows.length, 2);
  assert.equal(windowOf(1), 36);
  assert.equal(windowOf(36), 36);
  assert.equal(windowOf(37), 192);
});
