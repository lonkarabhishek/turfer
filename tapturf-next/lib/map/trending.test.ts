import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRENDING_MIN_TURFS,
  TRENDING_TOP,
  enoughTrending,
  estimate24h,
  joinTrending,
  parseTrending,
  trendFirst,
  trendRank,
  trendWords,
  trends,
  yesterdayShare,
  type TrendWire,
} from "./trending";

const T = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** India time on 1 Nov 2026 as epoch ms ("18:00" is 12:30 UTC). */
const ist = (hhmm: string, day = "2026-11-01") => Date.parse(`${day}T${hhmm}:00+05:30`);
/** Card rows as getNearTurfs hands them over (only what the join reads). */
const TURFS = [
  { id: T(1), slug: "turf-up-baner", lat: 18.5610585, lng: 73.7890204 },
  { id: T(2), slug: null, lat: 19.0760012, lng: 72.8777 },
  { id: T(3), slug: "no-point", lat: null, lng: null },
  { id: T(4), slug: "sea-off-africa", lat: 0, lng: 0 },
  { id: T(5), slug: "kings-turf-nashik", lat: "20.0063" as unknown as number, lng: "73.7900" as unknown as number },
  { id: T(6), slug: "goal-arena-hyderabad", lat: 17.44, lng: 78.38 },
  { id: T(7), slug: "sixer-box-mumbai", lat: 19.11, lng: 72.86 },
  { id: T(8), slug: "striker-turf-delhi", lat: 28.61, lng: 77.2 },
];

test("yesterdayShare: the part of India's yesterday still inside the last 24 hours", () => {
  assert.equal(yesterdayShare(ist("00:00")), 1, "at India midnight all of yesterday is inside");
  assert.equal(yesterdayShare(ist("06:00")), 0.75);
  assert.equal(yesterdayShare(ist("12:00")), 0.5);
  assert.equal(yesterdayShare(ist("18:00")), 0.25);
  assert.ok(Math.abs(yesterdayShare(ist("23:59")) - 1 / 1440) < 1e-9);
  // India's midnight is 18:30 UTC the day before, not UTC midnight.
  assert.equal(yesterdayShare(Date.parse("2026-10-31T18:30:00Z")), 1);
  assert.equal(yesterdayShare(Date.parse("2026-11-01T00:00:00Z")), 1 - 5.5 / 24);
  assert.equal(yesterdayShare(0), 1 - 5.5 / 24, "the epoch was 05:30 in India");
});

test("estimate24h: today's views so far, plus yesterday's scaled by the share still in the window", () => {
  assert.equal(estimate24h(4, 8, ist("18:00")), 4 + 8 * 0.25);
  assert.equal(estimate24h(4, 8, ist("06:00")), 4 + 8 * 0.75);
  assert.equal(estimate24h(0, 12, ist("12:00")), 6);
  assert.equal(estimate24h(5, 0, ist("09:30")), 5, "with no views yesterday, today's are the estimate");
  assert.equal(estimate24h(0, 0, ist("12:00")), 0);
  // Across India midnight it runs on without a jump: today's total becomes yesterday's, all of it inside.
  const before = estimate24h(9, 3, Date.parse("2026-10-31T18:29:59.999Z"));
  const after = estimate24h(0, 9, Date.parse("2026-10-31T18:30:00Z"));
  assert.ok(Math.abs(before - after) < 0.001, `${before} then ${after}`);
});

test("trends: 3 views or more, and more than the turf's own daily average over the 7 days before yesterday", () => {
  assert.equal(trends(3, 0), true);
  assert.equal(trends(2.99, 0), false, "under 3 is not enough");
  assert.equal(trends(10, 7 * 9), true, "10 beats an average of 9");
  assert.equal(trends(10, 7 * 10), false, "always 10 a day is busy, not rising");
  assert.equal(trends(10, 7 * 12), false);
  assert.equal(trends(4.5, 7 * 4), true);
});

test("trendRank: 1 to the top ten, whole, or nothing", () => {
  for (let r = 1; r <= TRENDING_TOP; r++) assert.equal(trendRank(r), r);
  assert.equal(trendRank("3"), 3, "a smallint may come back as text");
  for (const bad of [0, TRENDING_TOP + 1, 2.5, -1, "", " ", "x", null, undefined, Number.NaN, {}]) assert.equal(trendRank(bad), null, String(bad));
});

test("joinTrending: each rank on its turf's map point and key, most viewed first", () => {
  const out = joinTrending(
    [
      { turf_id: T(2), rank: 3 },
      { turf_id: T(1), rank: 1 },
      { turf_id: T(5), rank: "2" },
      { turf_id: T(6), rank: 3 },
    ],
    TURFS,
  );
  assert.deepEqual(out, [
    { k: "turf-up-baner", y: 18.56106, x: 73.78902, r: 1 },
    { k: "kings-turf-nashik", y: 20.0063, x: 73.79, r: 2 },
    { k: T(2), y: 19.076, x: 72.8777, r: 3 },
    { k: "goal-arena-hyderabad", y: 17.44, x: 78.38, r: 3 },
  ]);
});

test("joinTrending: a turf off the map, a bad row, or a turf listed twice is left out; no count goes out", () => {
  const out = joinTrending(
    [
      { turf_id: T(3), rank: 1 }, // no point
      { turf_id: T(4), rank: 1 }, // 0,0
      { turf_id: T(9), rank: 1 }, // not an active turf on the map
      { turf_id: T(1), rank: 11 }, // past the top ten
      { turf_id: 42, rank: 2 },
      { rank: 2 },
      null as unknown as { turf_id: string; rank: number },
      { turf_id: T(2), rank: 4, views: 37 } as { turf_id: string; rank: number },
      { turf_id: T(2), rank: 1 }, // the same turf again: its first row stands
    ],
    TURFS,
  );
  assert.deepEqual(out, [{ k: T(2), y: 19.076, x: 72.8777, r: 4 }]);
  assert.deepEqual(Object.keys(out[0]).sort(), ["k", "r", "x", "y"]);
  assert.ok(!JSON.stringify(out).includes("37"));
  assert.deepEqual(joinTrending([], TURFS), []);
});

test("enoughTrending: five trending turfs or more, else none", () => {
  const five = [1, 2, 3, 4, 5];
  assert.equal(TRENDING_MIN_TURFS, 5);
  assert.deepEqual(enoughTrending(five), five);
  assert.deepEqual(enoughTrending(five.slice(0, 4)), [], "four is too few to call anything trending");
  assert.deepEqual(enoughTrending([]), []);
  const twelve = Array.from({ length: 12 }, (_, i) => i);
  assert.deepEqual(enoughTrending(twelve), twelve);
  assert.notEqual(enoughTrending(five), five, "a copy");
});

test("parseTrending: the route's answer, read back without trusting it", () => {
  const good: TrendWire[] = [
    { k: "turf-up-baner", y: 18.56106, x: 73.78902, r: 1 },
    { k: "b", y: 19.076, x: 72.8777, r: 2 },
  ];
  assert.deepEqual(parseTrending(JSON.parse(JSON.stringify({ trending: good }))), good);
  for (const bad of [null, undefined, "x", 3, {}, { trending: "x" }, { trending: null }]) assert.deepEqual(parseTrending(bad), [], JSON.stringify(bad));
  assert.deepEqual(
    parseTrending({
      trending: [
        { k: "ok2", y: 18, x: 73, r: 4 },
        { k: "", y: 1, x: 1, r: 1 },
        { k: "a", y: "18", x: 73, r: 1 },
        { k: "a", y: 95, x: 73, r: 1 },
        { k: "a", y: 18, x: 181, r: 1 },
        { k: "a", y: 18, x: 73, r: 0 },
        { k: "a", y: 18, x: 73, r: 1.5 },
        null,
        { k: "ok", y: 18, x: 73, r: 2, views: 40 },
        { k: "ok", y: 18, x: 73, r: 3 },
      ],
    }),
    [
      { k: "ok", y: 18, x: 73, r: 2 },
      { k: "ok2", y: 18, x: 73, r: 4 },
    ],
  );
});

test("trendFirst: trending first by rank, ties and the rest in their own order", () => {
  const ranks = new Map([
    ["d", 2],
    ["b", 1],
    ["e", 2],
  ]);
  const list = ["a", "b", "c", "d", "e", "f"];
  assert.deepEqual(trendFirst(list, (k) => ranks.get(k)), ["b", "d", "e", "a", "c", "f"]);
  assert.deepEqual(trendFirst(list, () => null), list, "nothing trending: the order stands");
  assert.deepEqual(trendFirst([], (k: string) => ranks.get(k)), []);
  assert.deepEqual(list, ["a", "b", "c", "d", "e", "f"], "the list itself is left as it was");
});

test("trendWords: the rank as a screen reader hears it", () => {
  assert.equal(trendWords(1), "trending, number 1 by views in the last 24 hours");
});
