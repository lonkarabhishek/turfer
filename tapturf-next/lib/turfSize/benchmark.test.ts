import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BENCHMARK_MIN_TURFS,
  CITY_MIN_TURFS,
  MID_TURF,
  benchmarkNote,
  benchmarkOf,
  benchmarkText,
  halves,
  levelOf,
  meterPos,
  middleTurf,
  peersFrom,
  sideView,
  sizeWord,
  sportsFor,
  suitability,
  topView,
  type PeerTurf,
} from "./benchmark";
import type { Ground } from "./sizes";

const g = (length_ft: number, width_ft: number, height_ft: number | null, sport: Ground["sport"] = null): Ground => ({ name: null, sport, length_ft, width_ft, height_ft });
const BOTH = { cricket: true, football: true };
const label = (id: string) => id[0].toUpperCase() + id.slice(1);

test("benchmark: the size words and their edges", () => {
  assert.deepEqual([99.9, 100, 140, 140.1].map((x) => sizeWord("length", x)), ["Short", "Medium", "Medium", "Long"]);
  assert.deepEqual([54.9, 55, 80, 80.1].map((x) => sizeWord("width", x)), ["Narrow", "Medium", "Medium", "Wide"]);
  assert.deepEqual([24.9, 25, 40, 40.1].map((x) => sizeWord("height", x)), ["Low", "Medium", "Medium", "High"]);
  assert.equal(levelOf("length", 30), 0);
  assert.deepEqual(MID_TURF, { length: 120, width: 68 });
});

test("benchmark: the site owner's examples", () => {
  // Long but low: good for football, not great for cricket.
  const longLow = suitability(g(160, 70, 20), BOTH);
  assert.equal(longLow.summary, "Long, mid-width and low: great for football, not great for cricket.");
  assert.deepEqual(longLow.chips.map((c) => [c.text, c.tone]), [["Not great for adult cricket", "poor"], ["Great for football", "great"]]);
  assert.ok(longLow.reasons.some((r) => /lofted shots hit the net or roof/.test(r)));

  // High but short: not for adult cricket (the boundary is close), good for football and juniors.
  const highShort = suitability(g(90, 50, 45), BOTH);
  assert.equal(highShort.summary, "Short, narrow and high: good for football and junior cricket.");
  assert.deepEqual(highShort.chips.map((c) => c.text), ["Not great for adult cricket", "Good for juniors (U14-16)", "Good for football"]);
  assert.ok(highShort.reasons[0].includes("even a mistimed shot can go for six"));

  // Long, wide and high: great for adult cricket and football, with room to run.
  const big = suitability(g(160, 90, 50), BOTH);
  assert.equal(big.summary, "Long, wide and high: great for adult cricket and football.");
  assert.deepEqual(big.chips.map((c) => c.text), ["Great for adult cricket", "Great for football", "Lots of singles and doubles"]);
  assert.ok(big.reasons.includes("High nets: lofted shots stay in play."));
  assert.ok(big.reasons.includes("Wide: more room to run singles and doubles."));

  // Short with high nets, a football focus: football and junior cricket are what it suits.
  const shortHigh = suitability(g(80, 45, 42), BOTH);
  assert.deepEqual(shortHigh.chips.map((c) => c.id), ["cricket", "juniors", "football"]);
});

test("benchmark: the grades in between", () => {
  const tone = (l: number, w: number, h: number | null) => suitability(g(l, w, h), BOTH).chips.find((c) => c.id === "cricket")?.tone;
  assert.equal(tone(150, 70, 45), "great", "long, mid-width, high");
  assert.equal(tone(150, 50, 45), "good", "long and high but narrow: fewer singles");
  assert.equal(tone(150, 70, 30), "good", "long, mid-height");
  assert.equal(tone(120, 60, 45), "good", "medium length, high");
  assert.equal(tone(120, 60, 30), "ok", "medium all round");
  assert.equal(tone(120, 60, 20), "poor", "low nets");
  assert.equal(tone(90, 60, 30), "poor", "short");
  assert.equal(suitability(g(120, 60, 30), BOTH).summary, "Mid-length, mid-width and mid-height: OK for adult cricket, good for football.");
  assert.equal(suitability(g(150, 70, 30), BOTH).summary, "Long, mid-width and mid-height: good for adult cricket, great for football.");
  // Short and low: no juniors chip either.
  const shortLow = suitability(g(80, 40, 18), BOTH);
  assert.deepEqual(shortLow.chips.map((c) => c.id), ["cricket", "football"]);
  assert.equal(shortLow.summary, "Short, narrow and low: good for football, not great for cricket.");
});

test("benchmark: an open ground is judged on length and width, and says so", () => {
  const open = suitability(g(200, 120, null), BOTH);
  assert.equal(open.summary, "Long and wide: good for adult cricket, great for football.");
  assert.ok(open.reasons.includes("No net height given, so this is judged on length and width only."));
  const shortOpen = suitability(g(90, 50, null), BOTH);
  assert.ok(shortOpen.chips.some((c) => c.id === "juniors"), "short and open: juniors");
  assert.equal(suitability(g(120, 60, null), BOTH).chips[0].tone, "ok");
});

test("benchmark: only the sports the ground or turf is for", () => {
  assert.deepEqual(sportsFor(g(120, 60, 30, "football"), ["Box Cricket"]), { cricket: false, football: true });
  assert.deepEqual(sportsFor(g(120, 60, 30, "both"), []), BOTH);
  assert.deepEqual(sportsFor(g(120, 60, 30), ["Box Cricket", "Pickleball"]), { cricket: true, football: false });
  assert.deepEqual(sportsFor(g(120, 60, 30), ["Futsal"]), { cricket: false, football: true });
  assert.deepEqual(sportsFor(g(120, 60, 30), []), BOTH, "nothing listed: both");
  assert.deepEqual(sportsFor(g(120, 60, 30), ["Badminton"]), { cricket: false, football: false });

  const fb = suitability(g(160, 70, 20), { cricket: false, football: true });
  assert.equal(fb.summary, "Long, mid-width and low: great for football.");
  assert.deepEqual(fb.chips.map((c) => c.text), ["Great for football"]);
  assert.ok(!fb.reasons.some((r) => /cricket|singles/.test(r)), "no cricket words for football only");

  const cr = suitability(g(90, 85, 45), { cricket: true, football: false });
  assert.equal(cr.summary, "Short, wide and high: good for junior cricket, short for adults.");
  assert.deepEqual(cr.chips.map((c) => c.id), ["cricket", "juniors", "running"]);
  assert.equal(suitability(g(150, 70, 45), { cricket: true, football: false }).summary, "Long, mid-width and high: great for adult cricket.");
  assert.equal(suitability(g(120, 60, 30), { cricket: true, football: false }).summary, "Mid-length, mid-width and mid-height: OK for adult cricket.");

  const neither = suitability(g(44, 20, 30), { cricket: false, football: false });
  assert.deepEqual(neither, { summary: "Short, narrow and mid-height.", chips: [], reasons: [] });
});

/** n turfs in `city`, lengths start, start+step... */
function turfs(n: number, city: string | null, start: number, step: number, prefix: string): PeerTurf[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, city, length: start + i * step, width: 40 + i, height: i % 3 === 0 ? null : 20 + i }));
}

test("benchmark: no percentiles before 20 turfs have sizes", () => {
  const me = { id: "me", city: "nashik" };
  const few = turfs(BENCHMARK_MIN_TURFS - 2, "nashik", 80, 5, "n");
  assert.deepEqual(benchmarkOf(g(150, 70, 40), me, few), {}, "18 others + this one = 19");
  // With this turf it is 20: percentiles, and Nashik has 10 or more.
  const enough = turfs(BENCHMARK_MIN_TURFS - 1, "nashik", 80, 5, "n");
  const b = benchmarkOf(g(150, 70, 40), me, enough);
  assert.equal(b.length?.place, "city");
  assert.equal(b.length?.n, 19);
  // Lengths 80..170: 14 of 19 are under 150.
  assert.deepEqual(b.length, { dir: "more", pct: Math.round((100 * 14) / 19), place: "city", city: "nashik", n: 19 });
  // Heights: only the ones with a height count, and there are fewer than 20 of them.
  assert.equal(b.height, undefined);
});

test("benchmark: the city once 10 turfs there have sizes, else India; the turf itself never counts against itself", () => {
  assert.equal(CITY_MIN_TURFS, 10);
  const india = [...turfs(15, "pune", 60, 10, "p"), ...turfs(8, "nashik", 90, 10, "n")];
  const me = { id: "me", city: "nashik" };
  // 8 in Nashik + this one = 9: India.
  const b = benchmarkOf(g(120, 60, null), me, india);
  assert.equal(b.length?.place, "india");
  assert.equal(b.length?.n, 23);
  assert.equal(benchmarkText("length", b.length!, label), "About as long as most turfs across India");
  // One more in Nashik: the city.
  const more = [...india, { id: "n9", city: "nashik", length: 200, width: 90, height: 50 }];
  const c = benchmarkOf(g(120, 60, null), me, more);
  assert.equal(c.length?.place, "city");
  assert.equal(c.length?.n, 9);
  // This turf in the peers already (the copy has caught up): left out of the comparison, counted once.
  const withMe = [...more, { id: "me", city: "nashik", length: 120, width: 60, height: null }];
  assert.deepEqual(benchmarkOf(g(120, 60, null), me, withMe), c);
  // An open ground gets no height benchmark.
  assert.equal(c.height, undefined);
});

test("benchmark: the words, both ways and in the middle", () => {
  const peers: PeerTurf[] = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, city: "nashik", length: 100 + i, width: 50 + i, height: 20 + i }));
  const me = { id: "me", city: "nashik" };
  const long = benchmarkOf(g(126, 52, 49.5), me, peers);
  assert.equal(benchmarkText("length", long.length!, label), "Longer than 87% of turfs in Nashik");
  assert.equal(benchmarkText("width", long.width!, label), "Narrower than 90% of turfs in Nashik");
  assert.equal(benchmarkText("height", long.height!, label), "Higher than any other turf in Nashik");
  // 50% and 57% either way: about as long, about as wide (CLEAR_PCT); 60% is clear.
  const mid = benchmarkOf(g(114.5, 66.5, 37.5), me, peers);
  assert.equal(benchmarkText("length", mid.length!, label), "About as long as most turfs in Nashik");
  assert.equal(benchmarkText("width", mid.width!, label), "About as wide as most turfs in Nashik");
  assert.equal(benchmarkText("height", mid.height!, label), "Higher than 60% of turfs in Nashik");
  assert.equal(benchmarkNote(mid.length!, label), "Compared with the 30 other turfs in Nashik whose owners shared their size on TapTurf.");
  assert.deepEqual(middleTurf(me, peers, mid.length), { length: 115, width: 65 });
  assert.equal(middleTurf(me, peers, undefined), null);
});

test("benchmark: the peers as the database sends them", () => {
  const raw = [
    ["a", "nashik", [[120, 60, 40], [90, 45, null]]],
    ["b", null, [[100, 50, null]]],
    ["c", "pune", [[0, 50, 20]]],
    ["d", "pune", "x"],
    [7, "pune", [[100, 50, 20]]],
    "nope",
  ];
  assert.deepEqual(peersFrom(raw), [
    { id: "a", city: "nashik", length: 120, width: 60, height: 40 },
    { id: "b", city: null, length: 100, width: 50, height: null },
  ]);
  assert.deepEqual(peersFrom(null), []);
});

test("benchmark: the drawings fit their boxes", () => {
  const t = topView(g(160, 90, 50), MID_TURF);
  assert.equal(t.w, 320);
  assert.ok(t.ground.x >= 0 && t.ground.x + t.ground.w <= t.w + 0.1);
  assert.ok(t.ground.y >= 0 && t.ground.y + t.ground.h <= t.h + 0.1);
  assert.ok(t.ref.w < t.ground.w && t.ref.h < t.ground.h, "a bigger ground draws bigger than the reference");
  assert.ok(Math.abs(t.ground.w / t.ground.h - 160 / 90) < 0.01, "to scale");
  const small = topView(g(60, 40, 20), MID_TURF);
  assert.ok(small.ground.w < small.ref.w, "a small box inside the reference");
  assert.ok(small.pitch.w <= small.ground.w * 0.6 + 0.1, "the pitch fits a short box");
  const framed = topView(g(90, 45, 30), MID_TURF, { length: 160, width: 90 });
  assert.equal(framed.s, t.s, "every ground of a turf to one scale");
  assert.equal(framed.h, t.h);
  const s = sideView(40);
  assert.ok(s.netTop >= 10 && s.netTop < s.base);
  assert.equal(s.players, "6½");
  assert.ok(sideView(30).netTop > sideView(50).netTop, "lower nets draw lower: one frame up to 60 ft");
  assert.equal(sideView(30).player, sideView(50).player, "the same player");
  assert.ok(sideView(90).player < sideView(50).player, "higher than the frame: the player shrinks");
  assert.deepEqual([halves(0.4), halves(1), halves(6.67), halves(20)], ["½", "1", "6½", "20"]);
  // The meters: three equal parts, ends held.
  assert.deepEqual([meterPos("length", 10), meterPos("length", 100), meterPos("length", 120), meterPos("length", 140.1), meterPos("length", 400)], [0, 0.333, 0.5, 0.667, 1]);
  assert.equal(meterPos("height", 25), 0.333);
  assert.ok(meterPos("width", 79.9) < meterPos("width", 80.1), "across a band edge");
});
