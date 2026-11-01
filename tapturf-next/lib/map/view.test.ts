import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INDIA_BOUNDS,
  boundsParam,
  bubbleLabel,
  chipsFor,
  cityBounds,
  countLine,
  inBounds,
  inView,
  mapHref,
  mapSearch,
  matchesChip,
  nearBounds,
  nearbyLine,
  padBounds,
  parseBounds,
  parseMapQuery,
  parseSnapshot,
  parseTurfKey,
  turfMapHref,
  type Bounds,
} from "./view";
import { haversineKm } from "../utils/location";

test("parseBounds: four numbers west, south, east, north, clamped to where the map goes", () => {
  assert.deepEqual(parseBounds("73.7,18.43,73.96,18.69"), [73.7, 18.43, 73.96, 18.69]);
  assert.deepEqual(parseBounds(" 73.7 , 18.43,73.96,18.69"), [73.7, 18.43, 73.96, 18.69]);
  assert.deepEqual(parseBounds("40,0,120,50"), [55, 0, 110, 42]);
  for (const bad of [null, "", "73.7,18.43,73.96", "a,b,c,d", "73.96,18.43,73.7,18.69", "73.7,18.69,73.96,18.43", "73.7,,73.96,18.69", "-170,-80,-160,-70", "1e9,1,2,3"]) {
    assert.equal(parseBounds(bad), null, String(bad));
  }
});

test("boundsParam: 4 decimals, and back", () => {
  const b: Bounds = [73.701234567, 18.43, 73.96, 18.698765];
  assert.equal(boundsParam(b), "73.7012,18.43,73.96,18.6988");
  assert.deepEqual(parseBounds(boundsParam(b)), [73.7012, 18.43, 73.96, 18.6988]);
});

test("parseMapQuery: the city, the view, games and the chip from the URL", () => {
  assert.deepEqual(parseMapQuery(""), { city: null, b: null, show: "turfs", sport: null, turf: null });
  assert.deepEqual(parseMapQuery("?city=Pune&show=games&sport=box-cricket"), { city: "pune", b: null, show: "games", sport: "Box Cricket", turf: null });
  assert.deepEqual(parseMapQuery("?b=73.7,18.43,73.96,18.69").b, [73.7, 18.43, 73.96, 18.69]);
  for (const bad of ["turfs", "api", "pick", "../x", "pune;drop", "a".repeat(40)]) assert.equal(parseMapQuery(`?city=${bad}`).city, null, bad);
  assert.equal(parseMapQuery("?city=new-town").city, "new-town", "a city not curated yet");
  assert.equal(parseMapQuery("?sport=curling").sport, null);
  assert.equal(parseMapQuery("?show=everything").show, "turfs");
});

test("mapSearch: the city and the view, defaults left out, other params kept", () => {
  assert.equal(mapSearch({ city: null, b: null, show: "turfs", sport: null, turf: null }), "");
  assert.equal(mapSearch({ city: "pune", b: null, show: "turfs", sport: null, turf: null }), "?city=pune");
  assert.equal(mapSearch({ city: "pune", b: [73.7, 18.43, 73.96, 18.69], show: "games", sport: "Box Cricket", turf: null }), "?city=pune&b=73.7,18.43,73.96,18.69&show=games&sport=box-cricket");
  assert.equal(mapSearch({ city: null, b: [73.7, 18.43, 73.96, 18.69], show: "turfs", sport: null, turf: null }, "?city=pune&b=1,2,3,4"), "?b=73.7,18.43,73.96,18.69", "a move leaves the city behind");
  assert.equal(mapSearch({ city: null, b: null, show: "turfs", sport: "Football", turf: null }, "?utm_source=wa&city=pune&b=1,2,3,4&show=games"), "?utm_source=wa&sport=football");
  const q = parseMapQuery(mapSearch({ city: null, b: [73.7, 18.43, 73.96, 18.69], show: "games", sport: "Cricket", turf: null }));
  assert.deepEqual(q, { city: null, b: [73.7, 18.43, 73.96, 18.69], show: "games", sport: "Cricket", turf: null });
});

test("mapHref: the turf list's Map button", () => {
  assert.equal(mapHref(null), "/map");
  assert.equal(mapHref("pune"), "/map?city=pune");
  assert.equal(mapHref("pune", [73.70004, 18.43, 73.96, 18.69]), "/map?city=pune&b=73.7,18.43,73.96,18.69");
  assert.deepEqual(parseMapQuery("?city=pune&b=73.7,18.43,73.96,18.69"), { city: "pune", b: [73.7, 18.43, 73.96, 18.69], show: "turfs", sport: null, turf: null });
});

test("parseTurfKey: a turf page's key, its slug or its id, nothing else", () => {
  assert.equal(parseTurfKey("force-playing-fields-baner"), "force-playing-fields-baner");
  assert.equal(parseTurfKey(" Turf-Up-Baner "), "turf-up-baner", "trimmed, lower case as slugs are made");
  assert.equal(parseTurfKey("5b9f50b1-dcce-45a9-9c8f-c847812b18d0"), "5b9f50b1-dcce-45a9-9c8f-c847812b18d0");
  assert.equal(parseTurfKey("o2"), "o2");
  assert.equal(parseTurfKey("machaxi-sssc-sikki-sumeeth-sports-centre-osman-nagar"), "machaxi-sssc-sikki-sumeeth-sports-centre-osman-nagar");
  assert.equal(parseTurfKey("a".repeat(160)), "a".repeat(160));
  for (const bad of [null, undefined, "", "  ", "-turf", "turf-", "turf up", "turf_up", "../map", "turf%2Fup", "turf/up", "a".repeat(161), "\u091f\u0930\u094d\u092b", "turf;drop", "?b=1"]) {
    assert.equal(parseTurfKey(bad), null, String(bad));
  }
});

test("parseMapQuery and mapSearch: ?turf= from a turf page's Open full map, and gone with the first move", () => {
  assert.deepEqual(parseMapQuery("?turf=force-playing-fields-baner"), { city: null, b: null, show: "turfs", sport: null, turf: "force-playing-fields-baner" });
  assert.equal(parseMapQuery("?turf=..%2F..%2Fadmin").turf, null);
  assert.equal(parseMapQuery("?turf=").turf, null);
  assert.equal(parseMapQuery("?turf=a&turf=b").turf, "a", "the first one");
  // With the rest: a sport chip, games, a view (which then says where the map looks).
  assert.deepEqual(parseMapQuery("?turf=turf-up-baner&sport=football&show=games&b=73.7,18.43,73.96,18.69"), {
    city: null,
    b: [73.7, 18.43, 73.96, 18.69],
    show: "games",
    sport: "Football",
    turf: "turf-up-baner",
  });
  assert.equal(turfMapHref("force-playing-fields-baner"), "/map?turf=force-playing-fields-baner");
  assert.equal(turfMapHref("5B9F50B1-DCCE-45A9-9C8F-C847812B18D0"), "/map?turf=5b9f50b1-dcce-45a9-9c8f-c847812b18d0");
  assert.equal(turfMapHref("not a key"), "/map", "never a broken link");
  assert.equal(parseMapQuery(turfMapHref("turf-up-baner").slice(4)).turf, "turf-up-baner", "and back");
  // MapExplorer's first move writes { b, city: null, turf: null }: the view replaces the turf, other params stay.
  const after = mapSearch({ ...parseMapQuery("?turf=turf-up-baner&utm_source=wa"), b: [73.7, 18.43, 73.96, 18.69], turf: null }, "?turf=turf-up-baner&utm_source=wa");
  assert.equal(after, "?utm_source=wa&b=73.7,18.43,73.96,18.69");
  // Until then the URL keeps it (another write, a chip, leaves it).
  assert.equal(mapSearch({ ...parseMapQuery("?turf=turf-up-baner"), sport: "Football" }, "?turf=turf-up-baner"), "?sport=football&turf=turf-up-baner");
});

const near = (city: string, lat: number, lng: number) => ({ city, lat, lng });

test("cityBounds: around the city's turfs, a stray one left out, never too tight", () => {
  const pune = Array.from({ length: 30 }, (_, i) => near("pune", 18.45 + (i % 10) * 0.025, 73.72 + Math.floor(i / 10) * 0.08));
  // One turf of the city placed in Nagpur by mistake, and other cities' turfs.
  const rows = [...pune, near("pune", 21.14, 79.08), near("mumbai", 19.07, 72.87), near("pune", null as unknown as number, 73.8)];
  const b = cityBounds("pune", rows)!;
  assert.ok(b[2] < 74.2 && b[3] < 18.9, `stray turf left out: ${b}`);
  for (const p of pune) assert.ok(inBounds(p, b), `every turf in the city is in view: ${p.lat},${p.lng} in ${b}`);
  // Pimpri-Chinchwad and Hadapsar ends of one city, 25 km apart: both kept.
  const wide = cityBounds("pune", [near("pune", 18.63, 73.8), near("pune", 18.5, 73.93), near("pune", 18.52, 73.85)])!;
  assert.ok(inBounds({ lat: 18.63, lng: 73.8 }, wide) && inBounds({ lat: 18.5, lng: 73.93 }, wide));
  // Few turfs: all of them, padded, at least MIN_SPAN wide.
  const one = cityBounds("nashik", [near("nashik", 20.0, 73.79)])!;
  assert.ok(Math.abs(one[2] - one[0] - 0.05) < 1e-9 && Math.abs(one[3] - one[1] - 0.05) < 1e-9, String(one));
  assert.ok(inBounds({ lat: 20.0, lng: 73.79 }, one));
  // No turf placed yet: the curated centre; an unknown city: nothing.
  const centre = cityBounds("pune", [])!;
  assert.ok(inBounds({ lat: 18.5204, lng: 73.8567 }, centre) && Math.abs(centre[2] - centre[0] - 0.2) < 1e-9);
  assert.equal(cityBounds("nowhere-town", []), null);
});

/** A point `km` from `at` towards `deg` (0 north, 90 east), near enough on a city's scale. */
function towards(at: { lat: number; lng: number }, km: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  return { lat: at.lat + (km * Math.cos(r)) / 111.32, lng: at.lng + (km * Math.sin(r)) / (111.32 * Math.cos((at.lat * Math.PI) / 180)) };
}
/** How far the view reaches north of `at`, and east, in km. */
function reach(b: Bounds, at: { lat: number; lng: number }) {
  return { n: haversineKm(at, { lat: b[3], lng: at.lng }), e: haversineKm(at, { lat: at.lat, lng: b[2] }) };
}

test("nearBounds: centred on the turf, out to its fifth nearest neighbour, a little past it", () => {
  const baner = { lat: 18.5596, lng: 73.7795 };
  const others = [0.6, 0.9, 1.5, 1.5, 1.6, 2.4, 3.1].map((km, i) => towards(baner, km, i * 50));
  const b = nearBounds(baner, others);
  assert.ok(Math.abs((b[0] + b[2]) / 2 - baner.lng) < 1e-9 && Math.abs((b[1] + b[3]) / 2 - baner.lat) < 1e-9, `centred: ${b}`);
  const r = reach(b, baner);
  assert.ok(Math.abs(r.n - 1.6 * 1.15) < 0.02 && Math.abs(r.e - 1.6 * 1.15) < 0.02, `fifth nearest is 1.6 km: ${JSON.stringify(r)}`);
  for (const p of others.slice(0, 5)) assert.ok(inBounds(p, b), `the nearest five are in view: ${p.lat},${p.lng}`);
  assert.ok(!inBounds(others[6], b), "a farther one is not");
  // Order does not matter.
  assert.deepEqual(nearBounds(baner, [...others].reverse()), b);
});

test("nearBounds: never closer than 0.8 km, never past 4 km, a lone turf its neighbourhood", () => {
  const at = { lat: 18.5596, lng: 73.7795 };
  // Five turfs inside one complex: still the streets around it.
  const tight = reach(nearBounds(at, [0.05, 0.1, 0.1, 0.2, 0.3].map((km, i) => towards(at, km, i * 70))), at);
  assert.ok(Math.abs(tight.n - 0.8) < 0.01, JSON.stringify(tight));
  // Two neighbours within 4 km, the rest far: out to the farther of the two.
  const two = reach(nearBounds(at, [towards(at, 1, 0), towards(at, 3, 90), towards(at, 12, 180), towards(at, 40, 270)]), at);
  assert.ok(Math.abs(two.n - 3.45) < 0.02, JSON.stringify(two));
  // Only far ones (a Nashik edge, 8.6 km): its neighbourhood, 1.2 km.
  const lone = reach(nearBounds(at, [towards(at, 8.6, 30), towards(at, 9.9, 200)]), at);
  assert.ok(Math.abs(lone.n - 1.2) < 0.01, JSON.stringify(lone));
  assert.deepEqual(nearBounds(at, []), nearBounds(at, [towards(at, 50, 0)]), "no neighbours at all: the same");
  // Never more than 4 km each way (3.6 km x 1.15 would be 4.14).
  const wide = reach(nearBounds(at, [3.2, 3.3, 3.4, 3.5, 3.6].map((km, i) => towards(at, km, i * 70))), at);
  assert.ok(Math.abs(wide.n - 4) < 0.02, JSON.stringify(wide));
  // Square on the ground: wider in degrees of longitude away from the equator.
  const delhi = { lat: 28.61, lng: 77.21 };
  const d = nearBounds(delhi, []);
  assert.ok(d[2] - d[0] > d[3] - d[1], String(d));
  const dr = reach(d, delhi);
  assert.ok(Math.abs(dr.n - dr.e) < 0.01, JSON.stringify(dr));
});

test("nearbyLine: how many other turfs are within 3 km, else how far the nearest is", () => {
  const at = { lat: 18.5596, lng: 73.7795 };
  assert.equal(nearbyLine(at, [0.6, 0.9, 1.5, 2.9, 3.4, 8].map((km, i) => towards(at, km, i * 40))), "4 other turfs within 3 km");
  assert.equal(nearbyLine(at, [towards(at, 2, 90)]), "1 other turf within 3 km");
  assert.equal(nearbyLine(at, Array.from({ length: 1200 }, (_, i) => towards(at, 0.5 + (i % 20) * 0.1, i))), "1,200 other turfs within 3 km");
  assert.equal(nearbyLine(at, [towards(at, 8.6, 30), towards(at, 12, 200)]), "Nearest other turf: 8.6 km");
  assert.equal(nearbyLine(at, [towards(at, 14.2, 30)]), "Nearest other turf: 14 km");
  assert.equal(nearbyLine(at, []), "No other turfs on the map yet");
  assert.equal(nearbyLine(at, [{ lat: NaN, lng: 73 }]), "No other turfs on the map yet", "a point that is no point");
});

test("padBounds and inBounds", () => {
  assert.deepEqual(padBounds([0, 0, 10, 20], 0.1), [-1, -2, 11, 22]);
  assert.ok(inBounds({ lat: 18.5, lng: 73.8 }, INDIA_BOUNDS));
  assert.ok(!inBounds({ lat: 51.5, lng: -0.1 }, INDIA_BOUNDS));
  assert.ok(inBounds({ lat: 20, lng: 73 }, [73, 20, 74, 21]), "edges count");
});

test("inView: what is in the view, in the list's own order, nearest first with a location", () => {
  const items = [
    { id: "a", lat: 18.52, lng: 73.85 },
    { id: "b", lat: 18.6, lng: 73.75 },
    { id: "far", lat: 19.07, lng: 72.87 },
    { id: "c", lat: 18.5, lng: 73.9 },
  ];
  const b: Bounds = [73.6, 18.4, 74.0, 18.7];
  assert.deepEqual(inView(items, b, (x) => x, null).map((r) => [r.item.id, r.km]), [["a", null], ["b", null], ["c", null]]);
  const me = { lat: 18.6, lng: 73.76 };
  const byKm = inView(items, b, (x) => x, me);
  assert.deepEqual(byKm.map((r) => r.item.id), ["b", "a", "c"]);
  assert.ok(byKm[0].km! < 1.2 && byKm[2].km! > byKm[1].km!);
  assert.deepEqual(inView(items, [0, 0, 1, 1], (x) => x, null), []);
});

test("matchesChip and chipsFor: a chip matches any sport containing it, as /turfs does", () => {
  assert.ok(matchesChip(["Box Cricket"], "Cricket"));
  assert.ok(matchesChip(["Cricket Nets"], "cricket"));
  assert.ok(!matchesChip(["Football"], "Cricket"));
  assert.ok(matchesChip(["Football"], null));
  assert.ok(!matchesChip(null, "Football"));
  assert.deepEqual(chipsFor(["Football", "Box Cricket", "Cricket", "Badminton"], [["Box Cricket"], ["Football", "Futsal"]]), ["Football", "Box Cricket", "Cricket"]);
});

test("countLine", () => {
  assert.equal(countLine(1, "turfs"), "1 turf in this area");
  assert.equal(countLine(3826, "turfs"), "3,826 turfs in this area");
  assert.equal(countLine(2, "games"), "2 games in this area");
  assert.equal(countLine(0, "games"), "No games in this area");
});

test("bubbleLabel: a bubble that splits says zoom in; one at one turf says where, and promises no zoom", () => {
  assert.equal(bubbleLabel(1240, "turfs", null), "1,240 turfs here. Zoom in");
  assert.equal(bubbleLabel(3, "games", ["Turf Up", "Turf Up", " Turf Up"]), "3 games at Turf Up");
  assert.equal(bubbleLabel(2, "turfs", ["Turf Up A", "Turf Up B"]), "2 turfs here");
  assert.equal(bubbleLabel(2, "games", ["", ""]), "2 games here");
  for (const l of [bubbleLabel(3, "games", ["Turf Up", "Turf Up"]), bubbleLabel(2, "turfs", ["A", "B"])]) assert.ok(!/zoom/i.test(l), l);
});

test("bubbleLabel: a turf bubble's average hourly price, and how many turfs it is over", () => {
  assert.equal(bubbleLabel(406, "turfs", null, { avg: 1147.3, n: 120 }), "406 turfs here, average ₹1,150 an hour over the 120 with a listed price. Zoom in");
  assert.equal(bubbleLabel(4, "turfs", null, { avg: 1000, n: 4 }), "4 turfs here, average ₹1,000 an hour. Zoom in");
  assert.equal(bubbleLabel(2, "turfs", ["Turf Up", "Turf Up"], { avg: 900, n: 1 }), "2 turfs at Turf Up, average ₹900 an hour over the 1 with a listed price");
  assert.equal(bubbleLabel(1240, "turfs", null, null), "1,240 turfs here. Zoom in");
  assert.equal(bubbleLabel(12, "turfs", null, { avg: 0, n: 0 }), "12 turfs here. Zoom in", "none listed: no price");
});

test("bubbleLabel: with Trending on, how many of the bubble's turfs trend", () => {
  assert.equal(bubbleLabel(406, "turfs", null, { avg: 1147.3, n: 120 }, 2), "406 turfs here, 2 trending, average ₹1,150 an hour over the 120 with a listed price. Zoom in");
  assert.equal(bubbleLabel(2, "turfs", ["Turf Up", "Turf Up"], null, 1), "2 turfs at Turf Up, 1 trending");
  assert.equal(bubbleLabel(40, "turfs", null, null, 0), "40 turfs here. Zoom in", "none trending: not said");
});

test("parseSnapshot: what Back restores, from history.state, never trusted as is", () => {
  const good = { b: [73.7, 18.43, 73.96, 18.69], gps: true, sheet: "full", n: 36, top: 1400.4, pick: ["a001", "a002"], heat: false, trend: true };
  assert.deepEqual(parseSnapshot(good), { b: [73.7, 18.43, 73.96, 18.69], gps: true, sheet: "full", n: 36, top: 1400, pick: ["a001", "a002"], heat: false, trend: true });
  assert.deepEqual(parseSnapshot(structuredClone(good)), parseSnapshot(good), "survives the structured clone history.state is");
  for (const bad of [null, undefined, "x", 3, {}, { b: [1, 2, 3] }, { b: [73.96, 18.43, 73.7, 18.69] }, { b: ["a", "b", "c", "d"] }]) assert.equal(parseSnapshot(bad), null, JSON.stringify(bad));
  const odd = parseSnapshot({ b: [73.7, 18.43, 73.96, 18.69], gps: "yes", sheet: "huge", n: -5, top: -1, pick: [4, "", "ok"], heat: 1, trend: "on" })!;
  assert.deepEqual(odd, { b: [73.7, 18.43, 73.96, 18.69], gps: false, sheet: "peek", n: 1, top: 0, pick: ["ok"], heat: false, trend: false });
  // A snapshot from before the layers were kept: both off.
  const older = parseSnapshot({ b: [73.7, 18.43, 73.96, 18.69], gps: false, sheet: "half", n: 12, top: 0, pick: null })!;
  assert.deepEqual([older.heat, older.trend], [false, false]);
  assert.equal(parseSnapshot({ ...good, pick: [] })!.pick, null);
  assert.equal(parseSnapshot({ ...good, n: 1e9 })!.n, 10_000);
});
