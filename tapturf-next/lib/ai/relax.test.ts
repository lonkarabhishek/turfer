import { test } from "node:test";
import assert from "node:assert/strict";
import { relaxSteps, widenedReply, type RelaxStep } from "./relax";

type Row = { name: string; sport: string[]; area: string; city: string; price: number | null };

// Shapes from the live rows on 26 Oct: Kothrud has no football turf,
// Nashik has cricket grounds and no practice nets.
const rows: Row[] = [
  { name: "Wakad 5s", sport: ["Football"], area: "Wakad", city: "pune", price: 700 },
  { name: "Baner Arena", sport: ["Football"], area: "Baner", city: "pune", price: 800 },
  { name: "Baner Big", sport: ["Football"], area: "Baner", city: "pune", price: 1500 },
  { name: "Kothrud Box", sport: ["Box Cricket"], area: "Kothrud", city: "pune", price: 600 },
  { name: "Nashik Ground", sport: ["Cricket"], area: "College Road", city: "nashik", price: null },
  { name: "Pune Nets", sport: ["Cricket Nets"], area: "Baner", city: "pune", price: 400 },
];
const plays = (labels: string[]) => (r: Row) => r.sport.some((s) => labels.includes(s));
const ORDER = ["text", "rating", "open_24x7", "price", "area", "narrow_sport", "pref_city"];
const names = (out: { matched: Row[] }) => out.matched.map((r) => r.name);

test("nothing dropped when something matches", () => {
  const steps: RelaxStep<Row>[] = [
    { key: "sport", keep: plays(["Football"]) },
    { key: "area", keep: (r) => r.area === "Baner" },
  ];
  const out = relaxSteps(rows, steps, ORDER);
  assert.deepEqual(out.relaxed, []);
  assert.deepEqual(names(out), ["Baner Arena", "Baner Big"]);
});

test("a budget dropped for an empty area applies again across the city", () => {
  // "football turf under 1000 in Kothrud": the area has no football turf.
  const steps: RelaxStep<Row>[] = [
    { key: "sport", keep: plays(["Football"]) },
    { key: "area", keep: (r) => r.area === "Kothrud" },
    { key: "city", keep: (r) => r.city === "pune" },
    { key: "price", keep: (r) => r.price != null && r.price <= 1000 },
  ];
  const out = relaxSteps(rows, steps, ORDER);
  assert.deepEqual(out.relaxed, ["area"]);
  assert.deepEqual(names(out), ["Wakad 5s", "Baner Arena"]);
});

test("the budget stays dropped when no turf in the wider place meets it", () => {
  const steps: RelaxStep<Row>[] = [
    { key: "sport", keep: plays(["Football"]) },
    { key: "area", keep: (r) => r.area === "Kothrud" },
    { key: "price", keep: (r) => r.price != null && r.price <= 500 },
  ];
  const out = relaxSteps(rows, steps, ORDER);
  assert.deepEqual(out.relaxed, ["price", "area"]);
  assert.equal(out.matched.length, 3);
});

test("a narrow sport widens to its parent instead of coming back empty", () => {
  // "cricket nets in Nashik": the explicit city and the sport stay.
  const steps: RelaxStep<Row>[] = [
    { key: "sport", keep: plays(["Cricket", "Cricket Nets"]) },
    { key: "narrow_sport", keep: plays(["Cricket Nets"]) },
    { key: "city", keep: (r) => r.city === "nashik" },
  ];
  const out = relaxSteps(rows, steps, ORDER);
  assert.deepEqual(out.relaxed, ["narrow_sport"]);
  assert.deepEqual(names(out), ["Nashik Ground"]);
});

test("nets elsewhere in the city come before cricket grounds in the area", () => {
  const steps: RelaxStep<Row>[] = [
    { key: "sport", keep: plays(["Cricket", "Cricket Nets"]) },
    { key: "narrow_sport", keep: plays(["Cricket Nets"]) },
    { key: "area", keep: (r) => r.area === "Wakad" },
    { key: "city", keep: (r) => r.city === "pune" },
  ];
  const out = relaxSteps(rows, steps, ORDER);
  assert.deepEqual(out.relaxed, ["area"]);
  assert.deepEqual(names(out), ["Pune Nets"]);
});

test("the sport and an explicit city are never dropped", () => {
  const steps: RelaxStep<Row>[] = [
    { key: "sport", keep: plays(["Pickleball"]) },
    { key: "city", keep: (r) => r.city === "pune" },
  ];
  const out = relaxSteps(rows, steps, ORDER);
  assert.deepEqual(out, { matched: [], relaxed: [] });
});

const base = { maxPrice: null, cheapestFirst: false, areas: [], city: null, prefCity: null, narrowed: null };

test("widened reply: nothing to say when only soft filters went", () => {
  assert.equal(widenedReply({ ...base, relaxed: [] }), null);
  assert.equal(widenedReply({ ...base, relaxed: ["rating", "need:parking"] }), null);
});

test("widened reply names the empty area, not the budget, when the budget survived", () => {
  assert.equal(
    widenedReply({ ...base, relaxed: ["area"], areas: ["Kothrud"], city: "Pune", maxPrice: 1000, cheapestFirst: true }),
    "Nothing in Kothrud matched, so here are matches from the rest of Pune.",
  );
});

test("widened reply says no rate is listed under the budget only when the budget went", () => {
  assert.equal(
    widenedReply({ ...base, relaxed: ["price"], maxPrice: 1000, cheapestFirst: true }),
    "None of the matching turfs list a rate under ₹1,000 an hour yet, so the lowest listed rates come first. Check the rate with the turf.",
  );
  assert.equal(
    widenedReply({ ...base, relaxed: ["price", "area"], areas: ["Kothrud"], city: "Pune", maxPrice: 500 }),
    "Nothing in Kothrud matched, so here are matches from the rest of Pune. None of these list a rate under ₹500 an hour yet. Check the rate with the turf.",
  );
});

test("widened reply for a narrow sport that fell back", () => {
  const narrowed = { none: "cricket practice nets", instead: "cricket grounds" };
  assert.equal(
    widenedReply({ ...base, relaxed: ["narrow_sport"], city: "Nashik", narrowed }),
    "No cricket practice nets are listed in Nashik yet, so here are cricket grounds instead.",
  );
  assert.equal(widenedReply({ ...base, relaxed: [], city: "Nashik", narrowed }), null);
  assert.equal(
    widenedReply({ ...base, relaxed: ["pref_city"], prefCity: "Nashik" }),
    "Nothing in Nashik matched, so here are matches from other cities.",
  );
});
