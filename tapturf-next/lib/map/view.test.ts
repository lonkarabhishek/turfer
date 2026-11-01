import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INDIA_BOUNDS,
  boundsParam,
  chipsFor,
  cityBounds,
  countLine,
  inBounds,
  inView,
  mapHref,
  mapSearch,
  matchesChip,
  padBounds,
  parseBounds,
  parseMapQuery,
  type Bounds,
} from "./view";

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
  assert.deepEqual(parseMapQuery(""), { city: null, b: null, show: "turfs", sport: null });
  assert.deepEqual(parseMapQuery("?city=Pune&show=games&sport=box-cricket"), { city: "pune", b: null, show: "games", sport: "Box Cricket" });
  assert.deepEqual(parseMapQuery("?b=73.7,18.43,73.96,18.69").b, [73.7, 18.43, 73.96, 18.69]);
  for (const bad of ["turfs", "api", "pick", "../x", "pune;drop", "a".repeat(40)]) assert.equal(parseMapQuery(`?city=${bad}`).city, null, bad);
  assert.equal(parseMapQuery("?city=new-town").city, "new-town", "a city not curated yet");
  assert.equal(parseMapQuery("?sport=curling").sport, null);
  assert.equal(parseMapQuery("?show=everything").show, "turfs");
});

test("mapSearch: the city and the view, defaults left out, other params kept", () => {
  assert.equal(mapSearch({ city: null, b: null, show: "turfs", sport: null }), "");
  assert.equal(mapSearch({ city: "pune", b: null, show: "turfs", sport: null }), "?city=pune");
  assert.equal(mapSearch({ city: "pune", b: [73.7, 18.43, 73.96, 18.69], show: "games", sport: "Box Cricket" }), "?city=pune&b=73.7,18.43,73.96,18.69&show=games&sport=box-cricket");
  assert.equal(mapSearch({ city: null, b: [73.7, 18.43, 73.96, 18.69], show: "turfs", sport: null }, "?city=pune&b=1,2,3,4"), "?b=73.7,18.43,73.96,18.69", "a move leaves the city behind");
  assert.equal(mapSearch({ city: null, b: null, show: "turfs", sport: "Football" }, "?utm_source=wa&city=pune&b=1,2,3,4&show=games"), "?utm_source=wa&sport=football");
  const q = parseMapQuery(mapSearch({ city: null, b: [73.7, 18.43, 73.96, 18.69], show: "games", sport: "Cricket" }));
  assert.deepEqual(q, { city: null, b: [73.7, 18.43, 73.96, 18.69], show: "games", sport: "Cricket" });
});

test("mapHref: the turf list's Map button", () => {
  assert.equal(mapHref(null), "/map");
  assert.equal(mapHref("pune"), "/map?city=pune");
  assert.equal(mapHref("pune", [73.70004, 18.43, 73.96, 18.69]), "/map?city=pune&b=73.7,18.43,73.96,18.69");
  assert.deepEqual(parseMapQuery("?city=pune&b=73.7,18.43,73.96,18.69"), { city: "pune", b: [73.7, 18.43, 73.96, 18.69], show: "turfs", sport: null });
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
