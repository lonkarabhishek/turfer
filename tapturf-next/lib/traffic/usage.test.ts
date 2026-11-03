import { test } from "node:test";
import assert from "node:assert/strict";
import { KIND_LABEL, SOURCE_LABEL, changeText, shareText, toTrafficUsage, trafficLine } from "./usage";
import { TRAFFIC_KINDS, TRAFFIC_SOURCES } from "./traffic";

const answer = (over: Record<string, unknown> = {}) => ({
  today: "2026-11-04",
  since: "2026-11-04",
  totals: {
    today: { views: "120", visits: 40, signed_views: 9 },
    yesterday: { views: 300, visits: 100, signed_views: 20 },
    d7: { views: 2000, visits: 700, signed_views: 150 },
    prev7: { views: 1800, visits: 600, signed_views: 100 },
    d30: { views: 8000, visits: 2900, signed_views: 500 },
  },
  daily: [
    { day: "2026-11-04", views: 120, visits: 40, signed_views: 9 },
    { day: "2026-11-03", views: 300, visits: 100, signed_views: 20 },
    { day: "bad", views: 1 },
  ],
  by_source: {
    today: [{ source: "google", visits: 20, views: 50 }],
    d7: [
      { source: "whatsapp", visits: 200, views: 400 },
      { source: "google", visits: 300, views: 700 },
      { source: "tiktok", visits: 5, views: 5 },
      { source: "internal", visits: 0, views: 600 },
    ],
    d30: [],
  },
  by_kind: { today: [], d7: [{ kind: "turf", views: 900, visits: 300 }, { kind: "home", views: 1100, visits: 400 }, { kind: "nope", views: 1 }], d30: [] },
  pages: [{ path: "/turf/x", kind: "turf", views: 90, visits: 30 }, { path: "(not found)", kind: "other", views: 3, visits: 3 }, { path: "", views: 1 }],
  pages_total: 120,
  sites: [{ host: "reddit.com", visits: "7" }],
  sites_total: 1,
  ...over,
});

test("toTrafficUsage: reads the answer, numbers as numbers, unknown sources and kinds left out, lists sorted", () => {
  const u = toTrafficUsage(answer())!;
  assert.equal(u.today, "2026-11-04");
  assert.deepEqual(u.totals.today, { views: 120, visits: 40, signedViews: 9 });
  assert.deepEqual(u.daily.map((d) => d.day), ["2026-11-03", "2026-11-04"], "oldest first, a bad day left out");
  assert.deepEqual(u.bySource.d7.map((r) => r.source), ["google", "whatsapp", "internal"], "most visits first, an unknown source left out");
  assert.deepEqual(u.byKind.d7.map((r) => r.kind), ["home", "turf"]);
  assert.deepEqual(u.pages.map((p) => p.path), ["/turf/x", "(not found)"]);
  assert.equal(u.pagesTotal, 120);
  assert.deepEqual(u.sites, [{ host: "reddit.com", visits: 7 }]);
});

test("toTrafficUsage: visits and signed-in views are never more than views; junk is 0", () => {
  const u = toTrafficUsage(answer({ totals: { today: { views: 5, visits: 9, signed_views: 7 }, d7: { views: "x", visits: -3 } } }))!;
  assert.deepEqual(u.totals.today, { views: 5, visits: 5, signedViews: 5 });
  assert.deepEqual(u.totals.d7, { views: 0, visits: 0, signedViews: 0 });
  assert.deepEqual(u.totals.prev7, { views: 0, visits: 0, signedViews: 0 }, "a missing stretch is zeros");
});

test("toTrafficUsage: not an answer is null", () => {
  for (const x of [null, {}, { today: "x", totals: {} }, { today: "2026-11-04" }, "x", []]) assert.equal(toTrafficUsage(x), null, JSON.stringify(x));
});

test("changeText and shareText", () => {
  assert.equal(changeText(700, 600), "+17%");
  assert.equal(changeText(500, 600), "−17%");
  assert.equal(changeText(600, 600), "±0%");
  assert.equal(changeText(5, 0), "new");
  assert.equal(changeText(0, 0), null);
  assert.equal(shareText(1, 3), "33%");
  assert.equal(shareText(1, 1000), "<1%");
  assert.equal(shareText(0, 10), "0%");
  assert.equal(shareText(3, 0), "0%");
});

test("trafficLine: today's visits, the 7 days with their change, today's page views", () => {
  assert.equal(trafficLine(toTrafficUsage(answer())!), "40 visits today · 700 in 7 days (+17%) · 120 page views today");
  assert.equal(trafficLine(toTrafficUsage(answer({ since: null }))!), "Counting visits and page views from today");
  const one = toTrafficUsage(answer({ totals: { today: { views: 1, visits: 1 }, d7: { views: 0, visits: 0 }, prev7: { views: 0, visits: 0 } } }))!;
  assert.equal(trafficLine(one), "1 visit today · 0 in 7 days · 1 page view today");
});

test("every kind and source has its words", () => {
  for (const k of TRAFFIC_KINDS) assert.ok(KIND_LABEL[k], k);
  for (const s of TRAFFIC_SOURCES) assert.ok(SOURCE_LABEL[s], s);
});
