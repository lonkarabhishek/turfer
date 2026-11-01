import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOT,
  PIN_NAME_MAX,
  TAG_TUCK,
  badgeRect,
  claimOrder,
  collide,
  declutter,
  discRect,
  pinLine,
  pinName,
  pinUnit,
  placeTags,
  tagRect,
  type BubbleSpot,
  type PinSpot,
  type Rect,
  type Size,
} from "./pins";

const len = (s: string) => Array.from(s).length;

test("pinName: whole when it fits, else cut at a word with an ellipsis", () => {
  assert.equal(pinName("O2 Turf"), "O2 Turf");
  assert.equal(pinName("Ranangan Turf Arena"), "Ranangan Turf…");
  assert.equal(pinName("Gamechangers Sports Arena Baner"), "Gamechangers…");
  // Exactly the room: whole.
  assert.equal(len("Sixteen chars ok"), PIN_NAME_MAX);
  assert.equal(pinName("Sixteen chars ok"), "Sixteen chars ok");
  // One word too long: cut mid-word, never past the room.
  assert.equal(pinName("Supercalifragilisticturf"), "Supercalifragil…");
  // A short first word would leave too little: cut mid-word instead.
  assert.equal(pinName("SK Supercalifragilistic"), "SK Supercalifra…");
  // Never ends on a dash, a comma or an open bracket before the ellipsis.
  assert.equal(pinName("Kick Off Turf - Baner"), "Kick Off Turf…");
  assert.equal(pinName("Turf Town, Wakad Pune"), "Turf Town…");
  assert.equal(pinName("Sports Hub (Kharadi)"), "Sports Hub…");
  for (const n of ["Kick Off Turf - Baner", "A very long turf name that goes on and on", "Supercalifragilisticturf", "Gamechangers Sports Arena Baner"]) {
    assert.ok(len(pinName(n)) <= PIN_NAME_MAX, n);
    assert.ok(pinName(n).endsWith("…"), n);
  }
  // A smaller room.
  assert.equal(pinName("Ranangan Turf Arena", 10), "Ranangan…");
});

test("pinName: a chain's '|' reads ' · ', so the pin's own '|' is the only one", () => {
  assert.equal(pinName("HOS Arena|Pune"), "HOS Arena · Pune");
  assert.equal(pinName("HOS Arena | Vikaspuri"), "HOS Arena…");
  assert.equal(pinName("ClayGrounds | Vasant Kunj"), "ClayGrounds…");
  for (const n of ["CoPlay | Sec 50 Noida", "ClayGrounds | Lajpat Nagar", "A|B", "TurfPark|Andheri"]) assert.ok(!pinName(n).includes("|"), n);
});

test("pinName: spaces tidied, nothing for no name, a letter never split from its marks", () => {
  assert.equal(pinName("  O2   Turf \n"), "O2 Turf");
  assert.equal(pinName(""), "");
  assert.equal(pinName(null), "");
  assert.equal(pinName(undefined), "");
  // Devanagari: the 16th character is a vowel sign, so its letter goes with it.
  assert.equal(pinName("कि".repeat(10)), `${"कि".repeat(7)}…`);
  // An emoji keeps its variation selector.
  assert.equal(pinName(`Turf${"⚽️".repeat(9)}`), `Turf${"⚽️".repeat(5)}…`);
});

test("pinLine and pinUnit: 'O2 Turf | ₹500/hr', or the name alone", () => {
  assert.equal(pinLine("O2 Turf", "₹500/hr"), "O2 Turf | ₹500/hr");
  assert.equal(pinLine("O2 Turf", "Box Cricket"), "O2 Turf | Box Cricket");
  assert.equal(pinLine("O2 Turf", null), "O2 Turf");
  assert.equal(pinLine("O2 Turf", ""), "O2 Turf");
  assert.equal(pinUnit("/hr"), "/hr");
  assert.equal(pinUnit("/90-min slot"), "/slot");
  assert.equal(pinUnit("/slot"), "/slot");
  assert.equal(pinUnit("/person"), "/person");
});

const FULL: Size = [150, 28];
const SHORT: Size = [52, 28];
const NAME: Size = [80, 28];
const spot = (key: string, x: number, y: number, p: Partial<PinSpot> = {}): PinSpot => ({ key, x, y, full: FULL, short: SHORT, priced: true, order: 0, ...p });

test("collide: overlapping or closer than the gap", () => {
  const a: Rect = [0, 0, 10, 10];
  assert.equal(collide(a, [20, 0, 30, 10], 4), false);
  assert.equal(collide(a, [13, 0, 30, 10], 4), true, "3 px apart is inside the 4 px gap");
  assert.equal(collide(a, [14, 0, 30, 10], 4), false);
  assert.equal(collide(a, [5, 5, 8, 8], 0), true, "inside");
  assert.equal(collide(a, [0, 20, 10, 30], 4), false);
});

test("declutter: pins with room show in full", () => {
  const out = declutter([spot("a", 100, 100), spot("b", 100, 200, { order: 1 }), spot("c", 300, 100, { order: 2 })], [], true);
  assert.deepEqual(Object.fromEntries(out), { a: "full", b: "full", c: "full" });
});

test("declutter: on overlap the top rated keeps its name, the next its price where that fits, else a dot", () => {
  // Three pins 62 px apart in a row (as close as the bubbles let two pins come).
  const out = declutter([spot("c", 224, 100, { order: 2 }), spot("a", 100, 100, { order: 0 }), spot("b", 162, 100, { order: 1 })], [], true);
  assert.equal(out.get("a"), "full");
  assert.equal(out.get("b"), "dot", "its price pill would sit on a's name");
  assert.equal(out.get("c"), "short", "its name runs into a's, its price pill is clear of a and of b's dot");
});

test("declutter: a turf with no price shows its name alone where the rest does not fit, else a dot", () => {
  const unpriced = { priced: false, short: NAME };
  const out = declutter([spot("a", 100, 100), spot("b", 220, 100, { ...unpriced, order: 1 }), spot("c", 100, 120, { ...unpriced, order: 2 })], [], true);
  assert.equal(out.get("a"), "full");
  assert.equal(out.get("b"), "short", "its name alone fits beside a's");
  assert.equal(out.get("c"), "dot", "right under a, not even its name fits");
  // Nothing after the name ("O2 Turf" under a sport chip): no short face, so full or a dot.
  const bare = declutter([spot("a", 100, 100), spot("d", 100, 120, { priced: false, short: null, order: 1 })], [], true);
  assert.equal(bare.get("d"), "dot");
});

test("declutter: the picked or hovered pin is always in full, and the rest make way", () => {
  const out = declutter([spot("a", 100, 100, { order: 0 }), spot("b", 162, 100, { order: 5, pinned: true })], [], true);
  assert.equal(out.get("b"), "full");
  assert.equal(out.get("a"), "dot");
  // Even over a bubble, and zoomed out where names wait.
  const over = declutter([spot("p", 100, 100, { pinned: true })], [[60, 60, 140, 140]], false);
  assert.equal(over.get("p"), "full");
});

test("declutter: trending pins claim room before the rest, most viewed first", () => {
  const out = declutter([spot("top", 100, 100, { order: 0 }), spot("hot", 162, 100, { order: 9, trend: 2 }), spot("hotter", 162, 130, { order: 9, trend: 1 })], [], true);
  assert.equal(out.get("hotter"), "full");
  assert.equal(out.get("hot"), "dot", "rank 2 sits on rank 1's name");
  assert.equal(out.get("top"), "dot", "the top rated gives way to the trending turfs");
  const order = [spot("x", 0, 0, { order: 1 }), spot("y", 0, 0, { order: 0 }), spot("t", 0, 0, { order: 7, trend: 3 }), spot("p", 0, 0, { order: 9, pinned: true })].sort(claimOrder);
  assert.deepEqual(
    order.map((s) => s.key),
    ["p", "t", "y", "x"],
  );
});

test("declutter: the bubbles are in the way too", () => {
  const bubble: Rect = [130, 76, 178, 124];
  const out = declutter([spot("a", 100, 100), spot("far", 100, 300, { order: 1 })], [bubble], true);
  assert.equal(out.get("a"), "short", "its name would run under the bubble; its price pill is clear");
  assert.equal(out.get("far"), "full");
  assert.equal(declutter([spot("b", 154, 100)], [bubble], true).get("b"), "dot");
});

test("declutter: zoomed out, names wait; a price shows where it fits, the rest are dots", () => {
  const out = declutter([spot("a", 100, 100), spot("u", 400, 100, { priced: false, short: NAME, order: 1 })], [], false);
  assert.equal(out.get("a"), "short");
  assert.equal(out.get("u"), "dot", "a turf with no price waits for the names");
});

test("declutter: a crowd: every pin gets an answer, and no two names or prices overlap", () => {
  // A dense grid, as a city close-up with many turfs, a third of them without a price.
  const spots: PinSpot[] = [];
  let i = 0;
  for (let x = 0; x < 390; x += 47) for (let y = 0; y < 600; y += 41) spots.push(spot(`p${i}`, x, y, { order: i, priced: i % 3 !== 0, short: i++ % 3 !== 0 ? SHORT : NAME }));
  const out = declutter(spots, [], true);
  assert.equal(out.size, spots.length);
  const faces: Rect[] = [];
  for (const s of spots) {
    const lod = out.get(s.key);
    assert.ok(lod === "full" || lod === "short" || lod === "dot");
    if (lod === "dot") continue;
    const [w, h] = lod === "full" ? s.full : (s.short as Size);
    faces.push([s.x - w / 2, s.y - h / 2, s.x + w / 2, s.y + h / 2]);
  }
  for (let a = 0; a < faces.length; a++) for (let b = a + 1; b < faces.length; b++) assert.ok(!collide(faces[a], faces[b], 0), `${faces[a]} ${faces[b]}`);
  const lods = new Set(out.values());
  assert.ok(lods.has("full") && lods.has("short") && lods.has("dot"), [...lods].join());
  assert.equal(DOT[0], 16);
});

const TAG: Size = [80, 18];
const bub = (key: string, x: number, y: number, more: Partial<BubbleSpot> = {}): BubbleSpot => ({ key, x, y, disc: [48, 48], tag: TAG, badge: null, count: 100, ...more });

test("tagRect: the price tag tucks under its disc's edge, below or above", () => {
  const b = bub("a", 100, 100);
  assert.deepEqual(discRect(b), [76, 76, 124, 124]);
  assert.deepEqual(tagRect(b, "below"), [60, 124 - TAG_TUCK, 140, 124 - TAG_TUCK + 18]);
  assert.deepEqual(tagRect(b, "above"), [60, 76 + TAG_TUCK - 18, 140, 76 + TAG_TUCK]);
  assert.deepEqual(badgeRect(bub("t", 100, 100, { badge: [10, -34, 38, -14] })), [110, 66, 138, 86]);
  assert.equal(badgeRect(b), null);
});

test("placeTags: a lone bubble's tag hangs under it; a bubble with no price has none", () => {
  const out = placeTags([bub("a", 100, 100), bub("n", 300, 100, { tag: null })]);
  assert.equal(out.get("a"), "below");
  assert.equal(out.has("n"), false);
});

test("placeTags: a tag that would run into the next bubble hangs over its own disc, else is left off", () => {
  // 513 with 118 down and to its left, as on the India view: 513's tag would cross 118's disc.
  const big = bub("513", 122, 306, { count: 513 });
  const small = bub("118", 73, 342, { count: 118 });
  let out = placeTags([small, big]);
  assert.equal(out.get("513"), "above");
  assert.equal(out.get("118"), "below");
  // Boxed in above and below: left off (its label still says the average).
  const top = bub("top", 122, 250, { count: 50 });
  out = placeTags([small, big, top]);
  assert.equal(out.get("513"), "none");
  assert.equal(out.get("top"), "above", "its own tag would run into the 513's disc");
});

test("placeTags: the bigger bubble keeps its tag first; two tags never overlap", () => {
  // Side by side, their tags would touch: the bigger keeps below, the smaller goes over.
  const out = placeTags([bub("small", 170, 100, { count: 20 }), bub("big", 100, 100, { count: 900 })]);
  assert.equal(out.get("big"), "below");
  assert.equal(out.get("small"), "above");
});

test("placeTags: a Trending badge and the bar over the map are in the way too", () => {
  // Its badge at its shoulder: a tag over the disc would run into it.
  const badged = bub("b", 122, 306, { count: 513, badge: [10, -34, 38, -14] });
  assert.equal(placeTags([bub("118", 73, 342, { count: 118 }), badged]).get("b"), "none");
  // Under the bar: the tag is left off rather than hung under it.
  const bar: Rect = [-1e4, -1e4, 1e4, 290];
  assert.equal(placeTags([bub("118", 73, 342, { count: 118 }), bub("513", 122, 306, { count: 513 })], [bar]).get("513"), "none");
  assert.equal(placeTags([bub("x", 100, 280)], [bar]).get("x"), "below");
});

test("placeTags: a crowd: every tag hung is clear of every other disc, every badge and every other tag", () => {
  // A city's bubbles: about a cluster radius apart and more, some trending.
  const bubbles: BubbleSpot[] = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let i = 0;
  for (let x = 40; x < 390; x += 88) for (let y = 40; y < 700; y += 80) {
    bubbles.push(bub(`c${i}`, x + (rnd() - 0.5) * 36, y + (rnd() - 0.5) * 30, { count: 10 + Math.floor(rnd() * 500), badge: i++ % 4 === 0 ? [10, -34, 38, -14] : null }));
  }
  const out = placeTags(bubbles);
  const tags: Rect[] = [];
  for (const b of bubbles) {
    const at = out.get(b.key);
    assert.ok(at === "below" || at === "above" || at === "none");
    if (at === "none") continue;
    const r = tagRect(b, at);
    for (const o of bubbles) {
      if (o !== b) assert.ok(!collide(discRect(o), r, 0), `${b.key} ${at} vs ${o.key}`);
      const badge = badgeRect(o);
      if (badge) assert.ok(!collide(badge, r, 0), `${b.key} ${at} vs ${o.key}'s badge`);
    }
    tags.push(r);
  }
  for (let a = 0; a < tags.length; a++) for (let b = a + 1; b < tags.length; b++) assert.ok(!collide(tags[a], tags[b], 0));
  assert.ok(tags.length > bubbles.length / 2, `${tags.length} of ${bubbles.length}`);
});
