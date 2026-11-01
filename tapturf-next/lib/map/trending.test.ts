import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRENDING_DAY_TOTAL,
  TRENDING_MIN_TURFS,
  TRENDING_MIN_VIEWS,
  TRENDING_TOP,
  TRENDING_WEEK_TOTAL,
  enoughTrending,
  estimate24h,
  joinTrending,
  noSuchFunction,
  parseTrendWindow,
  parseTrending,
  qualifies,
  rankTrending,
  readTrendingAuto,
  trendFirst,
  trendLegend,
  trendRank,
  trendSpan,
  trendWindow,
  trendWords,
  trendingRanks,
  trends,
  windowViews,
  yesterdayShare,
  type TrendRow,
  type TrendWindow,
  type TrendWire,
  type TurfDays,
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
  assert.equal(trendWords(1, "24h"), "trending, number 1 by views in the last 24 hours");
  assert.equal(trendWords(3, "7d"), "trending, number 3 by views in the last 7 days");
  assert.equal(trendWords(10, "30d"), "trending, number 10 by views in the last 30 days");
});

test("trendLegend and trendSpan: the window in the legend and in words", () => {
  assert.equal(trendLegend("24h"), "Most viewed · last 24 h");
  assert.equal(trendLegend("7d"), "Most viewed · last 7 days");
  assert.equal(trendLegend("30d"), "Most viewed · last 30 days");
  assert.equal(trendSpan("24h"), "the last 24 hours");
  assert.equal(trendSpan("7d"), "the last 7 days");
  assert.equal(trendSpan("30d"), "the last 30 days");
});

// ── The window, picked by the site's views (map_turf_trending_auto, 20261102_map_trending_window.sql) ──

test("the thresholds: 2,000 in 24 hours, else 5,000 in 7 days, else 30 days", () => {
  assert.equal(TRENDING_DAY_TOTAL, 2000);
  assert.equal(TRENDING_WEEK_TOTAL, 5000);
  assert.equal(TRENDING_MIN_VIEWS, 3);
});

test("trendWindow: 24 hours at 2,000 or more, else 7 days at 5,000 or more, else 30 days", () => {
  assert.equal(trendWindow(2000, 0), "24h", "exactly 2,000 in 24 hours is enough, whatever the week");
  assert.equal(trendWindow(2500, 9000), "24h");
  assert.equal(trendWindow(1999.999, 5000), "7d", "just under 2,000: 7 days, at exactly 5,000");
  assert.equal(trendWindow(1999, 4999), "30d", "short of both: 30 days");
  assert.equal(trendWindow(0, 0), "30d", "no views at all: 30 days");
  assert.equal(trendWindow(476, 3298), "30d", "the site on 1 Nov: 30 days");
});

test("windowViews: the estimate in 24 hours, today and the 6 days before in 7, the 29 before in 30", () => {
  const days = Array.from({ length: 40 }, (_, i) => i + 1); // 1 today, 2 yesterday, ... 40 39 days ago
  assert.equal(windowViews(days, "24h", ist("12:00")), 1 + 2 * 0.5);
  assert.equal(windowViews(days, "7d", ist("12:00")), 1 + 2 + 3 + 4 + 5 + 6 + 7, "days 0 to 6");
  assert.equal(windowViews(days, "30d", ist("12:00")), (30 * 31) / 2, "days 0 to 29");
  assert.equal(windowViews([0, 0, 0, 0, 0, 0, 0, 9], "7d", ist("12:00")), 0, "7 days ago is outside 7 days");
  assert.equal(windowViews([...Array(29).fill(0), 3, 900], "30d", ist("12:00")), 3, "29 days ago is in, 30 days ago is not");
  assert.equal(windowViews([], "30d", ist("12:00")), 0);
});

test("qualifies: in 24 hours, rising and 3 or more; in 7 or 30 days, 3 or more, no rising rule", () => {
  const busy = [6, 0, 6, 6, 6, 6, 6, 6, 6]; // 6 a day: not rising
  assert.equal(qualifies(busy, "24h", ist("12:00")), false, "always busy does not trend in 24 hours");
  assert.equal(qualifies(busy, "7d", ist("12:00")), true, "but it is among the most viewed over 7 days");
  assert.equal(qualifies(busy, "30d", ist("12:00")), true);
  assert.equal(qualifies([10, 0, 3, 3, 3, 3, 3, 3, 3], "24h", ist("12:00")), true, "10 against 3 a day rises");
  assert.equal(qualifies([0, 0, 0, 0, 0, 0, 3], "7d", ist("12:00")), true, "3 in 7 days, all 6 days ago");
  assert.equal(qualifies([0, 0, 0, 0, 0, 0, 2, 9], "7d", ist("12:00")), false, "2 in 7 days; the 9 a week ago is outside");
  assert.equal(qualifies([...Array(29).fill(0), 3], "30d", ist("12:00")), true, "3 on the window's first day");
  assert.equal(qualifies([...Array(29).fill(0), 2, 50], "30d", ist("12:00")), false, "2 in 30 days; the 50 before it are outside");
  assert.equal(qualifies([2, 1], "24h", ist("00:00")), true, "an estimate of exactly 3 at India midnight");
  assert.equal(qualifies([2, 1], "24h", ist("00:01")), false, "a minute later yesterday's 1 is no longer all in");
});

/** `n` turfs (T(start) on), each with `days`. */
const many = (start: number, n: number, days: readonly number[]): TurfDays[] => Array.from({ length: n }, (_, i) => ({ id: T(start + i), days }));
/** The site's views on India's today alone, spread so none of these turfs qualifies (2 each), to set the window. */
const filler = (total: number, at = 2000): TurfDays[] => {
  const out: TurfDays[] = [];
  for (let i = 0; i < Math.floor(total / 2); i++) out.push({ id: T(at + i), days: [2] });
  if (total % 2) out.push({ id: T(at + 9999), days: [1] });
  return out;
};

test("rankTrending: 30 days while the site is quiet, 3 or more in the window, ranked, ties shared", () => {
  const turfs: TurfDays[] = [
    { id: T(1), days: [50] },
    { id: T(2), days: [6, 0, 6, 6, 6, 6, 6, 6, 6] }, // 48, always busy: no rising rule in 30 days
    { id: T(3), days: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20] }, // 20, all ten days ago
    { id: T(4), days: [...Array(29).fill(0), 20] }, // 20 on the window's first day: ties T3
    { id: T(5), days: [...Array(29).fill(0), 3] }, // exactly 3
    { id: T(6), days: [...Array(29).fill(0), 2, 900] }, // 2 in the window: out
    { id: T(7), days: [1, 1] }, // 2: out
  ];
  const a = rankTrending(turfs, ist("18:00"));
  assert.equal(a.window, "30d");
  assert.deepEqual(a.turfs, [
    { turf_id: T(1), rank: 1 },
    { turf_id: T(2), rank: 2 },
    { turf_id: T(3), rank: 3 },
    { turf_id: T(4), rank: 3 },
    { turf_id: T(5), rank: 5 },
  ]);
});

test("rankTrending: 7 days at exactly 5,000 in them (and short of 2,000 in 24 hours), 4,999 is 30 days", () => {
  const turfs = (week: number): TurfDays[] => [
    { id: T(1), days: [0, 0, 0, 0, 0, 0, week - 20] }, // 6 days ago: in 7 days, not in 24 hours
    { id: T(2), days: [0, 0, 0, 0, 0, 0, 0, 900] }, // 7 days ago: in 30 days only
    { id: T(3), days: [0, 0, 0, 5] },
    { id: T(4), days: [0, 0, 0, 5] },
    { id: T(5), days: [0, 0, 0, 0, 0, 5] },
    { id: T(6), days: [5] },
  ];
  const a = rankTrending(turfs(5000), ist("09:00"));
  assert.equal(a.window, "7d");
  assert.deepEqual(a.turfs, [
    { turf_id: T(1), rank: 1 },
    { turf_id: T(3), rank: 2 },
    { turf_id: T(4), rank: 2 },
    { turf_id: T(5), rank: 2 },
    { turf_id: T(6), rank: 2 },
  ], "T2's 900 a week ago are outside 7 days");
  const b = rankTrending(turfs(4999), ist("09:00"));
  assert.equal(b.window, "30d", "4,999 in 7 days: 30 days");
  assert.deepEqual(b.turfs[0], { turf_id: T(1), rank: 1 });
  assert.deepEqual(b.turfs[1], { turf_id: T(2), rank: 2 }, "and in 30 days T2's 900 count");
});

test("rankTrending: 24 hours at exactly 2,000 in them, map_turf_trending's rule; 1,999 is not", () => {
  const ranked: TurfDays[] = [
    { id: T(1), days: [50] },
    { id: T(2), days: [10, 0, 3, 3, 3, 3, 3, 3, 3] }, // rising
    { id: T(3), days: [6, 0, 6, 6, 6, 6, 6, 6, 6] }, // always busy: out in 24 hours
    { id: T(4), days: [8] },
    { id: T(5), days: [8] },
    { id: T(6), days: [3] },
  ];
  const before = ranked.reduce((n, t) => n + t.days[0], 0); // 85 today among them
  const a = rankTrending([...ranked, ...filler(TRENDING_DAY_TOTAL - before)], ist("15:00"));
  assert.equal(a.window, "24h");
  assert.deepEqual(a.turfs, [
    { turf_id: T(1), rank: 1 },
    { turf_id: T(2), rank: 2 },
    { turf_id: T(4), rank: 3 },
    { turf_id: T(5), rank: 3 },
    { turf_id: T(6), rank: 5 },
  ]);
  const b = rankTrending([...ranked, ...filler(TRENDING_DAY_TOTAL - before - 1)], ist("15:00"));
  assert.equal(b.window, "30d", "1,999 in 24 hours, under 5,000 in 7 days: 30 days");
  assert.ok(b.turfs.some((t) => t.turf_id === T(3)), "where always busy counts");
});

test("rankTrending: the 24-hour total is India's estimate: yesterday counts by the share still inside", () => {
  // 1,000 today and 2,000 yesterday (3,000 in 7 days): 3,000 in 24 hours at India midnight, 2,000 at 12:00, 1,500 at 18:00.
  const site: TurfDays[] = many(1, 5, [200, 400]);
  assert.equal(rankTrending(site, ist("00:00")).window, "24h");
  assert.equal(rankTrending(site, ist("12:00")).window, "24h", "exactly 2,000 at India noon");
  assert.equal(rankTrending(site, ist("12:01")).window, "30d", "a minute later just under, and 3,000 in 7 days is short of 5,000: 30 days");
  assert.equal(rankTrending(site, ist("18:00")).window, "30d");
  // The share is India's: 12:00 UTC is 17:30 in India (1,000 + 2,000 x 0.27, under 2,000), not noon.
  assert.equal(rankTrending(site, Date.parse("2026-11-01T12:00:00Z")).window, "30d");
  assert.equal(rankTrending(site, Date.parse("2026-11-01T06:30:00Z")).window, "24h", "06:30 UTC is India noon");
  // With 2,000 more views 3 days ago the week has 5,000: 7 days once the 24 hours fall short.
  const week = [...site, { id: T(9), days: [0, 0, 0, 2000] }];
  assert.equal(rankTrending(week, ist("12:00")).window, "24h", "the 2,000 3 days ago are not in 24 hours; the rest still are 2,000");
  assert.equal(rankTrending(week, ist("12:01")).window, "7d");
});

test("rankTrending: no counts go out, the site's included; under 5 qualifying, no turfs but a window", () => {
  const four: TurfDays[] = many(1, 4, [9]);
  const a = rankTrending([...four, { id: T(5), days: [2] }], ist("12:00"));
  assert.deepEqual(a, { window: "30d", turfs: [] }, "4 qualifying: none");
  const five = rankTrending([...four, { id: T(5), days: [3] }], ist("12:00"));
  assert.equal(five.turfs.length, 5);
  assert.deepEqual(Object.keys(five).sort(), ["turfs", "window"]);
  for (const t of five.turfs) assert.deepEqual(Object.keys(t).sort(), ["rank", "turf_id"]);
  assert.ok(!/"(views|n|count|total|h24|d7|d30)"/.test(JSON.stringify(five)), JSON.stringify(five));
});

test("rankTrending: the top 10, a tie at 10 comes in whole", () => {
  const turfs = [13, 12, 11, 10, 9, 8, 7, 7, 6, 5, 4, 3].map((c, i) => ({ id: T(i + 1), days: [c] }));
  assert.deepEqual(
    rankTrending(turfs, ist("12:00")).turfs.map((t) => t.rank),
    [1, 2, 3, 4, 5, 6, 7, 7, 9, 10],
  );
  turfs[9] = { id: T(10), days: [4] };
  const tie = rankTrending(turfs, ist("12:00")).turfs;
  assert.equal(tie.length, 11);
  assert.deepEqual(tie.slice(-2), [
    { turf_id: T(10), rank: 10 },
    { turf_id: T(11), rank: 10 },
  ]);
});

test("readTrendingAuto: the window and each turf's id and rank, nothing else", () => {
  const good = { window: "7d", turfs: [{ turf_id: T(1), rank: 1 }, { turf_id: T(2), rank: 2, views: 37 }] };
  const r = readTrendingAuto(JSON.parse(JSON.stringify(good)));
  assert.deepEqual(r, { window: "7d", rows: [{ turf_id: T(1), rank: 1 }, { turf_id: T(2), rank: 2 }] });
  assert.ok(!JSON.stringify(r).includes("37"), "a count that came along goes no further");
  assert.deepEqual(readTrendingAuto({ window: "30d", turfs: [] }), { window: "30d", rows: [] });
  for (const bad of [null, undefined, "x", [], {}, { window: "24h" }, { turfs: [] }, { window: "1h", turfs: [] }, { window: "24h", turfs: "x" }, { window: 24, turfs: [] }])
    assert.equal(readTrendingAuto(bad), null, JSON.stringify(bad));
  const out = joinTrending(readTrendingAuto({ window: "24h", turfs: [{ turf_id: T(1), rank: 1, total: 4908 }, null] })!.rows, TURFS);
  assert.deepEqual(out, [{ k: "turf-up-baner", y: 18.56106, x: 73.78902, r: 1 }]);
});

test("trendingRanks: the auto function's ranks; while it is missing, map_turf_trending's, 24 hours", async () => {
  const rows: TrendRow[] = [{ turf_id: T(1), rank: 1 }];
  const day: TrendRow[] = [{ turf_id: T(2), rank: 1 }];
  const fail = (code: string) => async () => {
    throw Object.assign(new Error(code), { code });
  };
  let dayCalls = 0;
  const dayFn = async () => {
    dayCalls++;
    return day;
  };
  assert.deepEqual(await trendingRanks(async () => ({ window: "30d", rows }), dayFn), { window: "30d", rows });
  assert.equal(dayCalls, 0, "the 24-hour function is not asked when the auto one answers");
  assert.deepEqual(await trendingRanks(fail("PGRST202"), dayFn), { window: "24h", rows: day }, "before the file: 24 hours as before");
  assert.deepEqual(await trendingRanks(fail("42883"), dayFn), { window: "24h", rows: day });
  assert.deepEqual(await trendingRanks(fail("PGRST202"), fail("PGRST202")), { window: "24h", rows: [] }, "neither there: none");
  await assert.rejects(trendingRanks(fail("57014"), dayFn), /57014/, "a failed read is thrown, never answered with the fallback");
  await assert.rejects(trendingRanks(fail("PGRST202"), fail("08006")), /08006/);
  assert.equal(noSuchFunction({ code: "PGRST202" }), true);
  assert.equal(noSuchFunction(null), false);
  assert.equal(noSuchFunction(new Error("x")), false);
});

test("parseTrendWindow: the route's window, 24 hours when it says none", () => {
  for (const w of ["24h", "7d", "30d"] as TrendWindow[]) assert.equal(parseTrendWindow({ window: w, trending: [] }), w);
  assert.equal(parseTrendWindow({ trending: [] }), "24h", "an answer from before the window: 24 hours");
  for (const bad of [null, undefined, "x", {}, { window: "1h" }, { window: 7 }]) assert.equal(parseTrendWindow(bad), "24h", JSON.stringify(bad));
});
