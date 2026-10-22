import { test } from "node:test";
import assert from "node:assert/strict";
import { addBuckets, bucketsOf, canPan, countBetween, defaultWindow, finer, floorTo, panned, totals, trail, zoomInto, type TrendWindow } from "./trend";

/** An IST wall-clock time as an instant: ist(2026, 10, 22, 9, 30) is 22 Oct 2026 09:30 IST. */
const ist = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 5.5 * 3_600_000;

test("buckets start on India time, not UTC", () => {
  // 18:29 UTC on 21 Oct is 23:59 IST on 21 Oct; 18:30 UTC is midnight IST on the 22nd.
  assert.equal(floorTo("day", Date.UTC(2026, 9, 21, 18, 29)), ist(2026, 10, 21));
  assert.equal(floorTo("day", Date.UTC(2026, 9, 21, 18, 30)), ist(2026, 10, 22));
  assert.equal(floorTo("6h", ist(2026, 10, 22, 5, 59)), ist(2026, 10, 22, 0));
  assert.equal(floorTo("6h", ist(2026, 10, 22, 6, 0)), ist(2026, 10, 22, 6));
  assert.equal(floorTo("6h", ist(2026, 10, 22, 23, 59)), ist(2026, 10, 22, 18));
});

test("weeks start on Monday; months and quarters roll over years", () => {
  // 22 Oct 2026 is a Thursday; that week starts Monday 19 Oct. A Sunday belongs to the week before.
  assert.equal(floorTo("week", ist(2026, 10, 22, 12)), ist(2026, 10, 19));
  assert.equal(floorTo("week", ist(2026, 10, 25, 23)), ist(2026, 10, 19));
  assert.equal(floorTo("week", ist(2026, 10, 26)), ist(2026, 10, 26));
  // A week across a month and a year end.
  assert.equal(floorTo("week", ist(2027, 1, 2)), ist(2026, 12, 28));
  assert.equal(floorTo("month", ist(2026, 10, 31, 23, 59)), ist(2026, 10, 1));
  assert.equal(floorTo("quarter", ist(2026, 10, 22)), ist(2026, 10, 1));
  assert.equal(floorTo("quarter", ist(2026, 9, 30, 23)), ist(2026, 7, 1));
  assert.equal(addBuckets("month", ist(2026, 12, 15), 1), ist(2027, 1, 1));
  assert.equal(addBuckets("month", ist(2026, 1, 31), 1), ist(2026, 2, 1));
  assert.equal(addBuckets("quarter", ist(2026, 11, 5), 1), ist(2027, 1, 1));
  assert.equal(addBuckets("quarter", ist(2026, 2, 5), -1), ist(2025, 10, 1));
  assert.equal(addBuckets("6h", ist(2026, 10, 22, 19), 1), ist(2026, 10, 23, 0));
  assert.equal(finer("quarter"), "month");
  assert.equal(finer("6h"), null);
});

const NOW = ist(2026, 10, 22, 9, 15); // Thursday 22 Oct 2026, 09:15 IST
const T = [
  ist(2025, 8, 26, 18), // first sign-up
  ist(2025, 11, 26, 23),
  ist(2025, 11, 30, 20),
  ist(2026, 8, 31, 10), // Monday 31 Aug: in the week of 31 Aug, not in September
  ist(2026, 9, 1, 0, 0), // midnight, first second of September
  ist(2026, 9, 6, 23, 59), // Sunday: end of that week
  ist(2026, 9, 15, 6, 0),
  ist(2026, 9, 15, 11, 59),
  ist(2026, 9, 15, 12, 0),
  ist(2026, 9, 30, 23, 59),
  ist(2026, 10, 21, 18),
  ist(2026, 10, 22, 0, 30),
  ist(2026, 10, 22, 9, 0),
].sort((a, b) => a - b);
const FIRST = T[0];

test("countBetween is [start, end)", () => {
  assert.equal(countBetween(T, ist(2026, 9, 1), ist(2026, 10, 1)), 6);
  assert.equal(countBetween(T, ist(2026, 9, 1, 0, 1), ist(2026, 10, 1)), 5);
  assert.equal(countBetween(T, 0, Number.MAX_SAFE_INTEGER), T.length);
  assert.equal(countBetween([], 0, 1), 0);
});

test("the 3 months view starts at the first sign-up's quarter and ends with the one going on", () => {
  const w = defaultWindow("quarter", NOW, FIRST);
  assert.equal(w.start, ist(2025, 7, 1));
  const b = bucketsOf(T, w, NOW);
  assert.deepEqual(b.map((x) => x.axis), ["Q3 2025", "Q4 2025", "Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026"]);
  assert.deepEqual(b.map((x) => x.count), [1, 2, 0, 0, 7, 3]);
  assert.equal(b.reduce((s, x) => s + x.count, 0), T.length);
  assert.deepEqual(b.map((x) => x.current), [false, false, false, false, false, true]);
  assert.equal(b[4].long, "Q3 2026 (Jul to Sep 2026)");
  assert.equal(canPan(w, -1, NOW, FIRST), false);
  assert.equal(canPan(w, 1, NOW, FIRST), false);
  assert.equal(totals(T, w, NOW).previous, null);
});

test("zooming in: quarter, month, week, day, 6 hours, each adding up to the bar it came from", () => {
  let w: TrendWindow = defaultWindow("quarter", NOW, FIRST);
  const q3 = bucketsOf(T, w, NOW)[4];
  w = zoomInto(w, q3)!;
  assert.equal(w.level, "month");
  let b = bucketsOf(T, w, NOW);
  assert.deepEqual(b.map((x) => x.long), ["July 2026", "August 2026", "September 2026"]);
  assert.deepEqual(b.map((x) => x.count), [0, 1, 6]);

  // September in weeks: the first and last weeks are cut at the month's edges, so the bars add up to September.
  w = zoomInto(w, b[2])!;
  assert.equal(w.label, "September 2026");
  b = bucketsOf(T, w, NOW);
  assert.equal(b.length, 5);
  assert.equal(b[0].long, "1 to 6 Sep 2026");
  assert.equal(b[0].start, ist(2026, 9, 1));
  assert.equal(b[0].count, 2, "31 Aug is left out of the September view");
  assert.equal(b[4].long, "28 to 30 Sep 2026");
  assert.equal(b.reduce((s, x) => s + x.count, 0), 6);
  assert.equal(b[2].long, "14 to 20 Sep 2026");

  w = zoomInto(w, b[2])!;
  assert.equal(w.level, "day");
  b = bucketsOf(T, w, NOW);
  assert.equal(b.length, 7);
  assert.deepEqual(b.map((x) => x.count), [0, 3, 0, 0, 0, 0, 0]);
  assert.equal(b[1].long, "Tue, 15 Sep 2026");

  w = zoomInto(w, b[1])!;
  assert.equal(w.level, "6h");
  b = bucketsOf(T, w, NOW);
  assert.deepEqual(b.map((x) => x.count), [0, 2, 1, 0]);
  assert.deepEqual(b.map((x) => x.long.split(", ")[1]), ["00:00 to 06:00", "06:00 to 12:00", "12:00 to 18:00", "18:00 to 24:00"]);
  assert.equal(zoomInto(w, b[1]), null, "6 hours is the finest");
});

test("buckets never run into the future, and the one going on is marked", () => {
  const w = defaultWindow("day", NOW, FIRST);
  const b = bucketsOf(T, w, NOW);
  assert.equal(b.length, 30);
  assert.equal(b[29].start, ist(2026, 10, 22));
  assert.equal(b[29].current, true);
  assert.equal(b[29].count, 2);
  assert.equal(b[28].count, 1);
  const six = bucketsOf(T, defaultWindow("6h", NOW, FIRST), NOW);
  assert.equal(six.length, 6 * 4 + 2, "6 whole days and today's first two stretches");
  assert.equal(six.at(-1)!.long.endsWith("06:00 to 12:00"), true);
  // Zoomed into today's month, the weeks stop at this week.
  const month = zoomInto(defaultWindow("month", NOW, FIRST), bucketsOf(T, defaultWindow("month", NOW, FIRST), NOW).at(-1)!)!;
  assert.equal(bucketsOf(T, month, NOW).at(-1)!.start, ist(2026, 10, 19));
});

test("default views and moving them back and forward", () => {
  const m = defaultWindow("month", NOW, FIRST);
  assert.equal(m.label, "Last 12 months");
  assert.equal(m.start, ist(2025, 11, 1));
  assert.equal(bucketsOf(T, m, NOW).length, 12);
  assert.equal(canPan(m, 1, NOW, FIRST), false, "not into the future");
  assert.equal(canPan(m, -1, NOW, FIRST), true);
  const back = panned(m, -1, NOW)!;
  assert.equal(back.start, ist(2024, 11, 1));
  assert.equal(back.label, "Nov 2024 to Oct 2025");
  assert.equal(canPan(back, -1, NOW, FIRST), false, "nothing before the first sign-up");
  assert.equal(canPan(back, 1, NOW, FIRST), true);
  assert.equal(panned(back, 1, NOW)!.label, "Last 12 months", "back to the latest");
  assert.deepEqual(defaultWindow("week", NOW, FIRST).label, "Last 12 weeks");
  assert.deepEqual(defaultWindow("6h", NOW, FIRST).label, "Last 7 days");

  // A zoomed-in week moves one whole week at a time, even from a part week.
  const sep = zoomInto(defaultWindow("quarter", NOW, FIRST), bucketsOf(T, defaultWindow("quarter", NOW, FIRST), NOW)[4])!;
  const sepWeeks = zoomInto(sep, bucketsOf(T, sep, NOW)[2])!;
  const firstWeek = zoomInto(sepWeeks, bucketsOf(T, sepWeeks, NOW)[0])!;
  assert.equal(firstWeek.start, ist(2026, 9, 1), "a part week opens as its part");
  const prev = panned(firstWeek, -1, NOW)!;
  assert.equal(prev.start, ist(2026, 8, 24));
  assert.equal(prev.end, ist(2026, 8, 31));
  const next = panned(firstWeek, 1, NOW)!;
  assert.equal(next.start, ist(2026, 9, 7));
  assert.equal(next.end, ist(2026, 9, 14));
});

test("totals compare with the same length of time before", () => {
  // Last 30 days against the 30 days before.
  const d = totals(T, defaultWindow("day", NOW, FIRST), NOW);
  assert.equal(d.total, 4); // 30 Sep, 21 Oct, 22 Oct x2 (30 Sep 23:59 is in the last 30 days: 23 Sep onwards)
  assert.equal(d.previousName, "the 30 days before");
  // September against August.
  const sep = zoomInto(defaultWindow("quarter", NOW, FIRST), bucketsOf(T, defaultWindow("quarter", NOW, FIRST), NOW)[4])!;
  const sepMonth = zoomInto(sep, bucketsOf(T, sep, NOW)[2])!;
  const t = totals(T, sepMonth, NOW);
  assert.deepEqual([t.total, t.previous, t.previousName], [6, 1, "August 2026"]);
  // Today so far against yesterday up to the same time.
  const today = zoomInto(defaultWindow("day", NOW, FIRST), bucketsOf(T, defaultWindow("day", NOW, FIRST), NOW).at(-1)!)!;
  const td = totals(T, today, NOW);
  assert.equal(td.total, 2);
  assert.equal(td.previous, 0, "yesterday 18:00 is after 09:15, so it is not counted against this morning");
});

test("the breadcrumb follows a moved view", () => {
  const all = defaultWindow("quarter", NOW, FIRST);
  const q3 = zoomInto(all, bucketsOf(T, all, NOW)[4])!;
  const sep = zoomInto(q3, bucketsOf(T, q3, NOW)[2])!;
  assert.deepEqual(trail(sep, NOW, FIRST).map((w) => w.label), ["All time", "Q3 2026 (Jul to Sep 2026)", "September 2026"]);
  // Move on a month: October is in Q4.
  const oct = panned(sep, 1, NOW)!;
  assert.equal(oct.label, "October 2026");
  assert.deepEqual(trail(oct, NOW, FIRST).map((w) => w.label), ["All time", "Q4 2026 (Oct to Dec 2026)", "October 2026"]);
  // A default view has no parents.
  assert.deepEqual(trail(defaultWindow("day", NOW, FIRST), NOW, FIRST).map((w) => w.label), ["Last 30 days"]);
});

test("a week across two months names both", () => {
  const w = defaultWindow("week", ist(2026, 10, 2, 12), null);
  const last = bucketsOf([], w, ist(2026, 10, 2, 12)).at(-1)!;
  assert.equal(last.long, "28 Sep to 4 Oct 2026");
  assert.equal(last.axis, "28 Sep");
});
