import { test } from "node:test";
import assert from "node:assert/strict";
import { heatFeatures, heatLevel, joinHeat, parseHeat, type HeatWire } from "./heat";

const T = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** Card rows as getNearTurfs hands them over (only what the join reads). */
const TURFS = [
  { id: T(1), slug: "turf-up-baner", lat: 18.5610585, lng: 73.7890204 },
  { id: T(2), slug: null, lat: 19.0760012, lng: 72.8777 },
  { id: T(3), slug: "no-point", lat: null, lng: null },
  { id: T(4), slug: "sea-off-africa", lat: 0, lng: 0 },
  { id: T(5), slug: "kings-turf-nashik", lat: "20.0063" as unknown as number, lng: "73.7900" as unknown as number },
];

test("heatLevel: 1 to 5, whole, or nothing", () => {
  for (const l of [1, 2, 3, 4, 5]) assert.equal(heatLevel(l), l);
  assert.equal(heatLevel("4"), 4, "a smallint may come back as text");
  for (const bad of [0, 6, 2.5, -1, "", " ", "x", null, undefined, Number.NaN, {}]) assert.equal(heatLevel(bad), null, String(bad));
});

test("joinHeat: each level on its turf's map point and key, most popular first", () => {
  const out = joinHeat(
    [
      { turf_id: T(2), level: 2 },
      { turf_id: T(1), level: 5 },
      { turf_id: T(5), level: "3" },
    ],
    TURFS,
  );
  assert.deepEqual(out, [
    { k: "turf-up-baner", y: 18.56106, x: 73.78902, l: 5 },
    { k: "kings-turf-nashik", y: 20.0063, x: 73.79, l: 3 },
    { k: T(2), y: 19.076, x: 72.8777, l: 2 },
  ]);
});

test("joinHeat: a turf off the map, a bad row, or a turf listed twice is left out", () => {
  const out = joinHeat(
    [
      { turf_id: T(3), level: 5 }, // no point
      { turf_id: T(4), level: 5 }, // 0,0
      { turf_id: T(9), level: 5 }, // not an active turf on the map
      { turf_id: T(1), level: 9 }, // no such level
      { turf_id: 42, level: 3 },
      { level: 3 },
      null as unknown as { turf_id: string; level: number },
      { turf_id: T(2), level: 4 },
      { turf_id: T(2), level: 1 }, // the same turf again: its first row stands
    ],
    TURFS,
  );
  assert.deepEqual(out, [{ k: T(2), y: 19.076, x: 72.8777, l: 4 }]);
  assert.deepEqual(joinHeat([], TURFS), []);
});

test("joinHeat: the answer carries a key, a point and a level, and no count", () => {
  const out = joinHeat([{ turf_id: T(1), level: 5, views: 120 } as { turf_id: string; level: number }], TURFS);
  assert.deepEqual(Object.keys(out[0]).sort(), ["k", "l", "x", "y"]);
  assert.ok(!JSON.stringify(out).includes("120"));
});

test("parseHeat: the route's answer, read back without trusting it", () => {
  const good: HeatWire[] = [
    { k: "turf-up-baner", y: 18.56106, x: 73.78902, l: 5 },
    { k: "b", y: 19.076, x: 72.8777, l: 1 },
  ];
  assert.deepEqual(parseHeat(JSON.parse(JSON.stringify({ heat: good }))), good);
  for (const bad of [null, undefined, "x", 3, {}, { heat: "x" }, { heat: null }]) assert.deepEqual(parseHeat(bad), [], JSON.stringify(bad));
  assert.deepEqual(
    parseHeat({
      heat: [
        { k: "", y: 1, x: 1, l: 1 },
        { k: "a", y: "18", x: 73, l: 1 },
        { k: "a", y: 95, x: 73, l: 1 },
        { k: "a", y: 18, x: 181, l: 1 },
        { k: "a", y: 18, x: 73, l: 7 },
        null,
        { k: "ok", y: 18, x: 73, l: 2, extra: "dropped" },
      ],
    }),
    [{ k: "ok", y: 18, x: 73, l: 2 }],
  );
});

test("heatFeatures: GeoJSON points with the level, only the turfs the chip shows", () => {
  const points: HeatWire[] = [
    { k: "a", y: 18.5, x: 73.8, l: 5 },
    { k: "b", y: 19.07, x: 72.87, l: 2 },
  ];
  assert.deepEqual(heatFeatures(points), {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [73.8, 18.5] }, properties: { l: 5 } },
      { type: "Feature", geometry: { type: "Point", coordinates: [72.87, 19.07] }, properties: { l: 2 } },
    ],
  });
  const shown = new Set(["b"]);
  assert.deepEqual(heatFeatures(points, (k) => shown.has(k)).features.map((f) => f.properties.l), [2]);
  assert.deepEqual(heatFeatures([], () => true).features, []);
});
