import { test } from "node:test";
import assert from "node:assert/strict";
import { claimedThisWeek, deltaText, signupGlance } from "./glance";
import { toClaims } from "./claims";

const ist = (m: number, d: number, h: number, min = 0) => Date.UTC(2026, m - 1, d, h, min) - 5.5 * 3_600_000;
// 1 Nov 2026, 14:30 in India.
const now = ist(11, 1, 14, 30);

test("sign-ups today, in 7 and in 30 days, each against the stretch before up to the same time", () => {
  const times = [
    ist(9, 10, 12), // 30 days before: counted against the last 30 days
    ist(10, 5, 9),
    ist(10, 20, 11), // the 7 days before
    ist(10, 25, 18), // the 7 days before, but after 14:30 on its last day
    ist(10, 27, 12),
    ist(10, 31, 10), // yesterday before 14:30
    ist(10, 31, 20), // yesterday after 14:30
    ist(11, 1, 1),
    ist(11, 1, 14),
    ist(11, 1, 15), // read after now: never counted
  ].sort((a, b) => a - b);
  const g = signupGlance(times, now);
  assert.deepEqual(g.today, { total: 2, previous: 1 }, "today so far against yesterday up to 14:30");
  assert.deepEqual(g.week, { total: 5, previous: 1 }, "26 Oct to today against 19 to 25 Oct up to 14:30");
  assert.deepEqual(g.month, { total: 8, previous: 1 }, "3 Oct to today against the 30 days before");
});

test("a day starts at midnight in India, not UTC", () => {
  // 1 Nov 00:10 in India is still 31 Oct in UTC.
  const g = signupGlance([ist(11, 1, 0, 10)], ist(11, 1, 0, 20));
  assert.equal(g.today.total, 1);
  assert.equal(g.today.previous, 0);
});

test("the delta reads like the chart's", () => {
  assert.equal(deltaText({ total: 5, previous: 2 }), "+3");
  assert.equal(deltaText({ total: 1, previous: 4 }), "−3");
  assert.equal(deltaText({ total: 2, previous: 2 }), "±0");
  assert.equal(deltaText({ total: 2, previous: null }), null);
});

test("turfs claimed this week: the turf's first active claim went through in the last 7 days", () => {
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();
  const row = (turf: string, key: string, status: string, created: number, decided: number | null) => ({ turf_id: turf, user_key: key, status, turf_name: turf, created_at: ago(created), decided_at: decided === null ? null : ago(decided) });
  const claims = toClaims([
    row("a", "e:a@x.in", "active", 2, 2),
    row("b", "e:b1@x.in", "active", 20, 20),
    row("b", "e:b2@x.in", "active", 1, 1), // a second manager on a turf claimed before
    row("c", "e:c@x.in", "pending", 1, null),
    row("d", "e:d@x.in", "revoked", 3, 2),
    row("e", "e:e@x.in", "active", 10, 3), // made earlier, approved this week
    row("f", "e:f@x.in", "active", 9, 8),
  ]);
  assert.equal(claimedThisWeek(claims, now), 2);
  assert.equal(claimedThisWeek([], now), 0);
});
