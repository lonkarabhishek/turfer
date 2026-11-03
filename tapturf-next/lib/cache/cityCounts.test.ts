import { test } from "node:test";
import assert from "node:assert/strict";
import { cityCountsFromRows } from "./cityCounts";

const byCity = (rows: ReturnType<typeof cityCountsFromRows>) => Object.fromEntries(rows.map((r) => [r.city, r]));

test("city counts from the turf rows: what city_turf_counts answers (count per city, median point inside India)", () => {
  const rows = [
    { id: "a", city: "nashik", lat: 20.0, lng: 73.7, is_active: true },
    { id: "b", city: "nashik", lat: 20.2, lng: 73.9, is_active: true },
    { id: "c", city: "nashik", lat: 20.1, lng: 73.8, is_active: true },
    { id: "d", city: "pune", lat: 18.5, lng: 73.8 },
    { id: "e", city: "pune", lat: 18.7, lng: 73.6 },
    // Outside India's box (a 0,0 pin): counted, never placed.
    { id: "f", city: "pune", lat: 0, lng: 0 },
    { id: "g", city: "alwar", lat: null, lng: null },
    // Not counted: inactive, no city, an empty city.
    { id: "h", city: "pune", lat: 18.6, lng: 73.7, is_active: false },
    { id: "i", city: null, lat: 19, lng: 73 },
    { id: "j", city: "", lat: 19, lng: 73 },
  ];
  const got = byCity(cityCountsFromRows(rows));
  assert.deepEqual(Object.keys(got).sort(), ["alwar", "nashik", "pune"]);
  assert.deepEqual(got.nashik, { city: "nashik", n: 3, lat: 20.1, lng: 73.8 });
  // An even number placed: the mean of the two middle values (percentile_cont(0.5)).
  assert.equal(got.pune.n, 3);
  assert.ok(Math.abs(got.pune.lat! - 18.6) < 1e-9 && Math.abs(got.pune.lng! - 73.7) < 1e-9, JSON.stringify(got.pune));
  assert.deepEqual(got.alwar, { city: "alwar", n: 1, lat: null, lng: null });
});

test("city counts from no rows: none (the caller treats that as a failed read, never as no cities)", () => {
  assert.deepEqual(cityCountsFromRows([]), []);
  assert.deepEqual(cityCountsFromRows([{ id: "x", city: "pune", is_active: false }]), []);
});
