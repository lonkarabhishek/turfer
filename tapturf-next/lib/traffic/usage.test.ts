import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APP_NAMES,
  KIND_LABEL,
  SOURCE_LABEL,
  addDays,
  changeFrom,
  changeText,
  daysBetween,
  fullDaysCounted,
  shareText,
  siteLabel,
  toTrafficUsage,
  trafficLine,
  weekChange,
  weekWords,
  windowNote,
} from "./usage";
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
  pages: {
    today: { rows: [{ path: "/pune", kind: "city", views: 12, visits: 5 }], total: 1 },
    d7: { rows: [{ path: "/turf/x", kind: "turf", views: 90, visits: 30 }, { path: "(not found)", kind: "other", views: 3, visits: 3 }, { path: "", views: 1 }], total: 120 },
  },
  sites: {
    today: { rows: [{ host: "com.google.android.gm", visits: 2, app: true }], total: 1 },
    d7: { rows: [{ host: "reddit.com", visits: "7" }], total: 1 },
    d30: "nope",
  },
  ...over,
});

test("toTrafficUsage: reads the answer, numbers as numbers, unknown sources and kinds left out, lists sorted", () => {
  const u = toTrafficUsage(answer())!;
  assert.equal(u.today, "2026-11-04");
  assert.deepEqual(u.totals.today, { views: 120, visits: 40, signedViews: 9 });
  assert.deepEqual(u.daily.map((d) => d.day), ["2026-11-03", "2026-11-04"], "oldest first, a bad day left out");
  assert.deepEqual(u.bySource.d7.map((r) => r.source), ["google", "whatsapp", "internal"], "most visits first, an unknown source left out");
  assert.deepEqual(u.byKind.d7.map((r) => r.kind), ["home", "turf"]);
  assert.deepEqual(u.pages.d7.rows.map((p) => p.path), ["/turf/x", "(not found)"]);
  assert.equal(u.pages.d7.total, 120);
  assert.deepEqual(u.pages.today, { rows: [{ path: "/pune", kind: "city", views: 12, visits: 5 }], total: 1 }, "today's top pages too");
  assert.deepEqual(u.pages.d30, { rows: [], total: 0 }, "a window missing is empty");
  assert.deepEqual(u.sites.d7, { rows: [{ host: "reddit.com", visits: 7, app: false }], total: 1 });
  assert.deepEqual(u.sites.today, { rows: [{ host: "com.google.android.gm", visits: 2, app: true }], total: 1 }, "an app is marked as one");
  assert.deepEqual(u.sites.d30, { rows: [], total: 0 }, "a window that isn't one is empty");
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
  const old = { since: "2026-10-01" };
  assert.equal(trafficLine(toTrafficUsage(answer(old))!), "40 visits today · 700 in 7 days (+17%) · 120 page views today");
  assert.equal(trafficLine(toTrafficUsage(answer({ since: null }))!), "Counting visits and page views from today");
  const one = toTrafficUsage(answer({ ...old, totals: { today: { views: 1, visits: 1 }, d7: { views: 0, visits: 0 }, prev7: { views: 0, visits: 0 } } }))!;
  assert.equal(trafficLine(one), "1 visit today · 0 in 7 days · 1 page view today");
});

test("counting's first days: each window says how many full days it has; the change waits for 14", () => {
  const at = (since: string) => toTrafficUsage(answer({ since }))!;
  // Counting started today: no full day yet.
  const first = at("2026-11-04");
  assert.equal(fullDaysCounted(first, 7), 0);
  assert.equal(weekWords(first), null);
  assert.equal(trafficLine(first), "40 visits today · 120 page views today", "no 7-day figure on the first day");
  assert.equal(windowNote(first, "d7"), "Counting started today: these days fill in from tomorrow, one full day at a time.");
  assert.equal(windowNote(first, "today"), "Today so far.");
  // Yesterday was the first day.
  const second = at("2026-11-03");
  assert.equal(fullDaysCounted(second, 7), 1);
  assert.equal(trafficLine(second), "40 visits today · 700 yesterday · 120 page views today");
  assert.equal(windowNote(second, "d30"), "Yesterday, the first full day counted.");
  // 3 full days.
  const fourth = at("2026-11-01");
  assert.equal(fullDaysCounted(fourth, 7), 3);
  assert.equal(weekWords(fourth), "in the last 3 days");
  assert.match(windowNote(fourth, "d7"), /^The 3 full days counted so far: 1 Nov to yesterday\.$/);
  assert.equal(weekChange(fourth, "visits"), null, "no change against days before counting began");
  // 7 full days, but the 7 before them only partly counted: no change yet.
  const week = at("2026-10-28");
  assert.equal(fullDaysCounted(week, 7), 7);
  assert.equal(windowNote(week, "d7"), "Yesterday and the 6 days before.");
  assert.match(windowNote(week, "d30"), /^The 7 full days counted so far/);
  assert.equal(weekChange(week, "visits"), null);
  assert.equal(weekWords(week), "in 7 days");
  assert.equal(changeFrom(week), "2026-11-11");
  // 14 full days: the change shows.
  const fortnight = at("2026-10-21");
  assert.equal(weekChange(fortnight, "visits"), "+17%");
  assert.equal(weekWords(fortnight), "in 7 days (+17%)");
  assert.equal(weekWords(fortnight, { brackets: false }), "in 7 days +17%");
  assert.equal(windowNote(at("2026-09-01"), "d30"), "Yesterday and the 29 days before.");
});

test("daysBetween and addDays", () => {
  assert.equal(daysBetween("2026-11-01", "2026-11-04"), 3);
  assert.equal(daysBetween("2026-10-31", "2026-11-01"), 1);
  assert.equal(daysBetween("2026-11-04", "2026-11-04"), 0);
  assert.equal(addDays("2026-10-28", 14), "2026-11-11");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("siteLabel: a website by its host, an app by its name or package, marked as an app", () => {
  assert.deepEqual(siteLabel({ host: "reddit.com", visits: 1, app: false }), { label: "reddit.com" });
  assert.deepEqual(siteLabel({ host: "com.google.android.gm", visits: 1, app: true }), { label: "Gmail", sub: "App" });
  assert.deepEqual(siteLabel({ host: "com.example.turfs", visits: 1, app: true }), { label: "com.example.turfs", sub: "App" });
  assert.deepEqual(siteLabel({ host: "(other)", visits: 1, app: false }), { label: "Others (past the day's 300)" });
  for (const [pkg, name] of Object.entries(APP_NAMES)) assert.ok(pkg === pkg.toLowerCase() && name, `${pkg}: lowercased, as packages are kept`);
});

test("every kind and source has its words", () => {
  for (const k of TRAFFIC_KINDS) assert.ok(KIND_LABEL[k], k);
  for (const s of TRAFFIC_SOURCES) assert.ok(SOURCE_LABEL[s], s);
});
