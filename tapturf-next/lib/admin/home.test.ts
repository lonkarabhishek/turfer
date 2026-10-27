import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeUsers,
  bookingTotals,
  countByLabel,
  createdSince,
  dailyCounts,
  dedupeUsers,
  gameState,
  gamesByCity,
  istMinute,
  latestGames,
  normPhone,
  peopleTotals,
  requestsByGame,
  reviewTotals,
  topHostCounts,
  turfsByCity,
} from "./home";

const NOW = Date.parse("2026-10-27T10:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
// PostgREST's timestamps look like this, not like toISOString().
const pg = (days: number) => ago(days).replace("Z", "+00:00");

test("createdSince compares times, not strings (PostgREST's +00:00 against a Z)", () => {
  const rows = [{ created_at: pg(1) }, { created_at: pg(8) }, { created_at: null }, { created_at: "2026-10-20T10:00:00.000+00:00" }];
  assert.equal(createdSince(rows, NOW - 7 * DAY).length, 2);
});

test("dailyCounts: one bucket per UTC day for the window, today last, zeros kept", () => {
  const rows = [{ created_at: "2026-10-27T01:00:00+00:00" }, { created_at: "2026-10-27T09:00:00+00:00" }, { created_at: "2026-10-25T23:59:00+00:00" }, { created_at: "2026-09-01T00:00:00+00:00" }, { created_at: null }];
  const pts = dailyCounts(rows, 30, NOW);
  assert.equal(pts.length, 30);
  assert.equal(pts[0].date, "2026-09-28");
  assert.deepEqual(pts.at(-1), { date: "2026-10-27", count: 2 });
  assert.deepEqual(pts.at(-3), { date: "2026-10-25", count: 1 });
  assert.equal(pts.reduce((s, p) => s + p.count, 0), 3, "the September game is outside the window");
});

test("countByLabel: lowercased, a missing label is the fallback, most first then by label", () => {
  assert.deepEqual(countByLabel(["Football", "football", "Cricket", null, "", "box-cricket", "cricket"], "other"), [
    { label: "cricket", count: 2 },
    { label: "football", count: 2 },
    { label: "other", count: 2 },
    { label: "box-cricket", count: 1 },
  ]);
  assert.deepEqual(countByLabel([], "x"), []);
});

test("gamesByCity: through the game's turf; no turf or no city is unknown", () => {
  const cities = new Map<string, string | null>([["t1", "Pune"], ["t2", "pune"], ["t3", null]]);
  assert.deepEqual(gamesByCity([{ turf_id: "t1" }, { turf_id: "t2" }, { turf_id: "t3" }, { turf_id: null }, { turf_id: "gone" }], cities), [
    { label: "unknown", count: 3 },
    { label: "pune", count: 2 },
  ]);
});

test("turfsByCity: the view's rows lowercased and merged, plus the active turfs with no city", () => {
  // city_turf_counts groups by the city as stored; the admin always lowercased and merged.
  assert.deepEqual(turfsByCity([{ city: "hyderabad", n: 900 }, { city: "Hyderabad", n: 2 }, { city: "pune", n: 300 }], 4), [
    { label: "hyderabad", count: 902 },
    { label: "pune", count: 300 },
    { label: "unknown", count: 4 },
  ]);
  assert.deepEqual(turfsByCity([{ city: "nashik", n: 5 }], 0), [{ label: "nashik", count: 5 }]);
});

test("topHostCounts: most games first, ties by id, at most the limit; games without a host skipped", () => {
  const games = [{ creator_id: "b" }, { creator_id: "a" }, { creator_id: "b" }, { creator_id: null }, { creator_id: "c" }, { creator_id: "a" }];
  assert.deepEqual(topHostCounts(games, 2), [["a", 2], ["b", 2]]);
  assert.deepEqual(topHostCounts([], 10), []);
});

test("activeUsers: hosts and requesters in the window, each once", () => {
  const games = [{ creator_id: "u1", created_at: pg(2) }, { creator_id: "u2", created_at: pg(20) }, { creator_id: null, created_at: pg(1) }];
  const reqs = [
    { game_id: "g", user_id: "u1", status: "pending", created_at: pg(3) },
    { game_id: "g", user_id: "u3", status: "pending", created_at: pg(6) },
    { game_id: "g", user_id: "u4", status: "pending", created_at: pg(29) },
    { game_id: "g", user_id: null, status: "pending", created_at: pg(1) },
  ];
  assert.equal(activeUsers(games, reqs, 7, NOW), 2);
  assert.equal(activeUsers(games, reqs, 30, NOW), 4);
});

test("requestsByGame and latestGames", () => {
  const m = requestsByGame([
    { game_id: "g1", user_id: "a", status: "pending", created_at: null },
    { game_id: "g1", user_id: "b", status: "accepted", created_at: null },
    { game_id: "g2", user_id: "c", status: "declined", created_at: null },
  ]);
  assert.deepEqual(m.get("g1"), { total: 2, pending: 1, accepted: 1 });
  assert.deepEqual(m.get("g2"), { total: 1, pending: 0, accepted: 0 });
  const games = [
    { id: "1", date: "2026-10-20", start_time: "18:00:00" },
    { id: "2", date: "2026-10-28", start_time: "07:00:00" },
    { id: "3", date: "2026-10-28", start_time: "19:00:00" },
    { id: "4", date: "2026-10-01", start_time: "06:00:00" },
  ];
  assert.deepEqual(latestGames(games, 3).map((g) => g.id), ["3", "2", "1"]);
});

test("gameState: worked out from the date and times in IST", () => {
  const now = istMinute(Date.parse("2026-10-27T13:00:00Z")); // 18:30 IST
  assert.equal(now, "2026-10-27 18:30");
  const g = (date: string, start: string, end: string, status: string | null = "open") => gameState({ date, start_time: start, end_time: end, status }, now);
  assert.equal(g("2026-10-27", "18:00:00", "19:00:00"), "live");
  assert.equal(g("2026-10-27", "17:00:00", "18:00:00"), "expired");
  assert.equal(g("2026-10-27", "20:00:00", "21:00:00"), "upcoming");
  assert.equal(g("2026-10-27", "23:00:00", "01:00:00"), "upcoming", "past midnight: ends that day");
  assert.equal(g("2026-10-28", "06:00:00", "07:00:00", "Cancelled"), "cancelled");
});

test("bookingTotals and reviewTotals", () => {
  const b = bookingTotals(
    [
      { total_amount: 1200, status: "confirmed", payment_status: "paid", created_at: pg(1) },
      { total_amount: 800, status: "pending", payment_status: "pending", created_at: pg(10) },
      { total_amount: null, status: "pending", payment_status: "paid", created_at: pg(2) },
    ],
    NOW,
  );
  assert.deepEqual(b, { totalBookings: 3, bookings7d: 2, paidBookings: 2, pendingBookings: 2, bookingRevenue: 1200 });
  assert.deepEqual(reviewTotals([]), { totalReviews: 0, avgRating: 0 });
  assert.deepEqual(reviewTotals([{ rating: 5 }, { rating: 4 }, { rating: null }]), { totalReviews: 3, avgRating: 3 });
});

test("normPhone and dedupeUsers: one person per email or phone, the earliest sign-up kept", () => {
  assert.equal(normPhone("+91 98765-43210"), "9876543210");
  assert.equal(normPhone(null), "");
  const people = dedupeUsers([
    { id: "1", email: "A@x.com", phone: null, created_at: "2026-10-01T00:00:00Z" },
    { id: "2", email: "a@x.com ", phone: "+919876543210", created_at: "2026-09-01T00:00:00Z" },
    { id: "3", email: null, phone: "9876543210", created_at: "2026-10-05T00:00:00Z" },
    { id: "4", email: null, phone: null, created_at: null },
  ]);
  assert.equal(people.length, 2);
  const merged = people.find((p) => p.rowCount === 3)!;
  assert.equal(merged.earliestSignup, "2026-09-01T00:00:00Z");
  assert.equal(people.find((p) => p.rowCount === 1)!.earliestSignup, "9999");
});

test("peopleTotals: accounts plus the Google sign-ups with no account, and the windows", () => {
  const accounts = [
    { id: "1", email: "a@x.com", phone: null, created_at: ago(2) },
    { id: "2", email: null, phone: "+919876543210", created_at: ago(40) },
    { id: "3", email: "a@x.com".toUpperCase(), phone: null, created_at: ago(10) },
  ];
  const notFinished = [
    { id: "g1", email: "new@gmail.com", phone: null, created_at: ago(1) },
    // Already an account: not counted twice.
    { id: "1", email: "a@x.com", phone: null, created_at: ago(2) },
  ];
  assert.deepEqual(peopleTotals(accounts, notFinished, NOW), {
    totalUsers: 4,
    unfinishedSignups: 1,
    uniquePeople: 3,
    duplicateUsers: 1,
    signups7d: 2,
    signups30d: 3,
    uniqueSignups7d: 1,
    uniqueSignups30d: 2,
  });
});
