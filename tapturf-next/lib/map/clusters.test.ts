import { test } from "node:test";
import assert from "node:assert/strict";
import Supercluster from "supercluster";
import { MAP_COLORS, addBubbleSum, addPriceSum, averagePrice, avgPriceShort, avgPriceWords, bubbleSum, contrastRatio, countText, priceSum, type BubbleSum, type PriceSum } from "./clusters";

test("MAP_COLORS: every text pairing on a bubble, tag or pin passes WCAG AA (4.5:1)", () => {
  const pairs: [string, string, string][] = [
    ["white count on a turf bubble's top", "#FFFFFF", MAP_COLORS.face],
    ["white count on its bottom, and on a picked pill", "#FFFFFF", MAP_COLORS.deep],
    ["the price tag's and a price pill's ink on white", MAP_COLORS.deep, "#FFFFFF"],
    ["the tag's 'avg' on white", MAP_COLORS.muted, "#FFFFFF"],
    ["white on a game bubble or pin", "#FFFFFF", MAP_COLORS.game],
    ["white on a Trending badge or the Trending chip", "#FFFFFF", MAP_COLORS.trend],
    ["a Trending tag's ink on white", MAP_COLORS.trend, "#FFFFFF"],
  ];
  for (const [what, fg, bg] of pairs) assert.ok(contrastRatio(fg, bg) >= 4.5, `${what}: ${contrastRatio(fg, bg).toFixed(2)}`);
  // The brand teal itself is too light for white text: it is kept for rings, halos and the heat's cool end.
  assert.ok(contrastRatio("#FFFFFF", MAP_COLORS.teal) < 4.5);
  assert.equal(contrastRatio("#000000", "#FFFFFF").toFixed(1), "21.0");
  assert.equal(contrastRatio("#777777", "#777777"), 1);
});

test("priceSum and addPriceSum: a turf with no listed hourly price adds nothing to the average", () => {
  assert.deepEqual(priceSum(1200), { ps: 1200, pn: 1 });
  for (const none of [null, undefined, 0, -5, Number.NaN, Infinity]) assert.deepEqual(priceSum(none), { ps: 0, pn: 0 }, String(none));
  const acc: PriceSum = { ps: 0, pn: 0 };
  addPriceSum(acc, priceSum(800));
  addPriceSum(acc, priceSum(null));
  addPriceSum(acc, { ps: 2600, pn: 2 });
  assert.deepEqual(acc, { ps: 3400, pn: 3 });
});

test("averagePrice: over the turfs that list one, null when none does", () => {
  assert.equal(averagePrice({ ps: 3400, pn: 3 }), 3400 / 3);
  assert.equal(averagePrice({ ps: 0, pn: 0 }), null);
  assert.equal(averagePrice({}), null, "a game bubble carries no sums");
  assert.equal(averagePrice(null), null);
  assert.equal(averagePrice({ ps: 900, pn: 0 }), null);
});

test("avgPriceShort and avgPriceWords: the tag's short price and the spoken one", () => {
  const cases: [number, string, string][] = [
    [214.4, "₹210", "₹210"],
    [947, "₹950", "₹950"],
    [995, "₹1k", "₹1,000"],
    [1000, "₹1k", "₹1,000"],
    [1147.33, "₹1.1k", "₹1,150"],
    [1150, "₹1.2k", "₹1,150"],
    [1249, "₹1.2k", "₹1,250"],
    [2050, "₹2.1k", "₹2,050"],
    [9940, "₹9.9k", "₹9,940"],
    [9960, "₹10k", "₹9,960"],
    [12_345, "₹12k", "₹12,350"],
  ];
  for (const [avg, short, words] of cases) {
    assert.equal(avgPriceShort(avg), short, `short ${avg}`);
    assert.equal(avgPriceWords(avg), words, `words ${avg}`);
  }
});

test("countText: the whole count up to 9,999, then thousands", () => {
  assert.equal(countText(7), "7");
  assert.equal(countText(406), "406");
  assert.equal(countText(2434), "2,434");
  assert.equal(countText(12_400), "12k");
});

test("Supercluster with map and reduce: each bubble's average is over exactly its turfs that list a price", () => {
  // Pune (three priced, one not) and Nashik (one priced, one not), far apart; at zoom 5 each city is one bubble.
  const turfs = [
    { lng: 73.80, lat: 18.52, h: 800 },
    { lng: 73.81, lat: 18.53, h: 1200 },
    { lng: 73.82, lat: 18.51, h: null },
    { lng: 73.79, lat: 18.54, h: 1600 },
    { lng: 73.78, lat: 20.0, h: 600 },
    { lng: 73.79, lat: 20.01, h: null },
  ];
  const index = new Supercluster<{ i: number; h: number | null }, Partial<PriceSum>>({
    radius: 62,
    maxZoom: 18,
    minPoints: 2,
    map: (p) => priceSum(p.h),
    reduce: (acc, p) => addPriceSum(acc as PriceSum, p as PriceSum),
  });
  index.load(turfs.map((t, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [t.lng, t.lat] }, properties: { i, h: t.h } })));
  const bubbles = index.getClusters([68, 6, 98, 36], 5).map((f) => f.properties as Partial<PriceSum> & { point_count?: number });
  const byCount = new Map(bubbles.map((b) => [b.point_count, b]));
  assert.equal(bubbles.length, 2);
  assert.deepEqual([byCount.get(4)?.ps, byCount.get(4)?.pn], [3600, 3]);
  assert.equal(averagePrice(byCount.get(4)), 1200, "Pune: (800 + 1200 + 1600) / 3, the unpriced turf counted in 4 but not in the average");
  assert.equal(averagePrice(byCount.get(2)), 600, "Nashik: one priced turf");
  // All of India at zoom 2: one bubble, the sums folded again.
  const all = index.getClusters([68, 6, 98, 36], 2).map((f) => f.properties as Partial<PriceSum> & { point_count?: number });
  assert.equal(all.length, 1);
  assert.equal(all[0].point_count, 6);
  assert.equal(averagePrice(all[0]), (800 + 1200 + 1600 + 600) / 4);
  // None priced: no average.
  const bare = new Supercluster<{ i: number; h: number | null }, Partial<PriceSum>>({ radius: 62, maxZoom: 18, minPoints: 2, map: (p) => priceSum(p.h), reduce: (a, p) => addPriceSum(a as PriceSum, p as PriceSum) });
  bare.load(turfs.slice(2, 3).concat(turfs.slice(5)).map((t, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [t.lng, t.lat] }, properties: { i, h: t.h } })));
  assert.equal(averagePrice(bare.getClusters([68, 6, 98, 36], 2)[0].properties as Partial<PriceSum>), null);
});

test("bubbleSum and addBubbleSum: the price sums, and how many of the turfs are trending", () => {
  assert.deepEqual(bubbleSum(1200, true), { ps: 1200, pn: 1, tn: 1 });
  assert.deepEqual(bubbleSum(null, true), { ps: 0, pn: 0, tn: 1 }, "a trending turf with no price still counts as trending");
  assert.deepEqual(bubbleSum(900, false), { ps: 900, pn: 1, tn: 0 });
  const acc: BubbleSum = bubbleSum(800, false);
  addBubbleSum(acc, bubbleSum(null, true));
  addBubbleSum(acc, { ps: 2600, pn: 2, tn: 3 });
  assert.deepEqual(acc, { ps: 3400, pn: 3, tn: 4 });
  // Trending folded in by Supercluster: Pune (2 of 3 trending), Nashik (none); all of India: 2.
  const turfs = [
    { lng: 73.8, lat: 18.52, h: 800, t: true },
    { lng: 73.81, lat: 18.53, h: null, t: true },
    { lng: 73.82, lat: 18.51, h: 1200, t: false },
    { lng: 73.78, lat: 20.0, h: 600, t: false },
    { lng: 73.79, lat: 20.01, h: null, t: false },
  ];
  const index = new Supercluster<{ i: number; h: number | null; t: boolean }, Partial<BubbleSum>>({
    radius: 62,
    maxZoom: 18,
    minPoints: 2,
    map: (p) => bubbleSum(p.h, p.t),
    reduce: (a, p) => addBubbleSum(a as BubbleSum, p as BubbleSum),
  });
  index.load(turfs.map((t, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [t.lng, t.lat] }, properties: { i, h: t.h, t: t.t } })));
  const at5 = new Map(index.getClusters([68, 6, 98, 36], 5).map((f) => [(f.properties as { point_count?: number }).point_count, f.properties as Partial<BubbleSum>]));
  assert.equal(at5.get(3)?.tn, 2);
  assert.equal(averagePrice(at5.get(3)), 1000, "the average is still over the priced turfs only");
  assert.equal(at5.get(2)?.tn, 0);
  const all = index.getClusters([68, 6, 98, 36], 2).map((f) => f.properties as Partial<BubbleSum>);
  assert.equal(all.length, 1);
  assert.equal(all[0].tn, 2);
});
