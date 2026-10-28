import { test } from "node:test";
import assert from "node:assert/strict";
import { citiesLine, dropOrder, relaxSteps, venueLine, venueReply, widenedReply, type RelaxStep } from "./relax";

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

test("widened reply says a typed venue name matched nothing, instead of leading in to other turfs", () => {
  assert.equal(
    widenedReply({ ...base, relaxed: ["text"], prefCity: "Pune", name: "Circuit" }),
    "No venue called Circuit is listed on TapTurf yet, so here are other turfs in Pune.",
  );
  // Generic words dropped from the search: nothing to say, as before.
  assert.equal(widenedReply({ ...base, relaxed: ["text"], prefCity: "Pune", name: null }), null);
});

// The venues by a typed name, from every city (applyAskFilters' named path).
const venues: Row[] = [
  { name: "Kage Multisport Turf", sport: ["Cricket", "Football"], area: "Pathardi", city: "nashik", price: null },
  { name: "Hotfut Kharadi", sport: ["Football", "Box Cricket", "Badminton"], area: "Kharadi", city: "pune", price: 1200 },
  { name: "HotFut Gachibowli", sport: ["Football", "Box Cricket"], area: "Gachibowli", city: "hyderabad", price: 1500 },
];
const NAMED = dropOrder([], true);

test("a named venue is never swapped for local turfs: the cities and a guessed sport give way first", () => {
  // "Kage Turf broo" read as box cricket on the Pune page.
  let out = relaxSteps(venues.slice(0, 1), [
    { key: "sport", keep: plays(["Box Cricket"]) },
    { key: "city", keep: (r) => r.city === "pune" },
    { key: "pref_city", keep: (r) => r.city === "pune" },
  ], NAMED);
  assert.deepEqual(names(out), ["Kage Multisport Turf"]);
  assert.deepEqual(out.relaxed.sort(), ["city", "pref_city", "sport"]);

  // "Hotfut" from Hyderabad: the visitor's city decides between the venues by that name.
  out = relaxSteps(venues.slice(1), [{ key: "pref_city", keep: (r) => r.city === "hyderabad" }], NAMED);
  assert.deepEqual(names(out), ["HotFut Gachibowli"]);

  // "Hotfut in Pune" from Hyderabad: the city asked about beats the visitor's.
  out = relaxSteps(venues.slice(1), [
    { key: "asked_city", keep: (r) => r.city === "pune" },
    { key: "pref_city", keep: (r) => r.city === "hyderabad" },
  ], NAMED);
  assert.deepEqual(names(out), ["Hotfut Kharadi"]);

  // "Hotfut badminton" from Hyderabad: the sport typed beats the visitor's city.
  out = relaxSteps(venues.slice(1), [
    { key: "sport", keep: plays(["Badminton"]) },
    { key: "pref_city", keep: (r) => r.city === "hyderabad" },
  ], NAMED);
  assert.deepEqual(names(out), ["Hotfut Kharadi"]);
  // A search still never drops the sport or a stated city.
  assert.ok(!dropOrder([], false).includes("sport") && !dropOrder([], false).includes("city"));
});

test("venue reply says which city, plainly, when it isn't the player's", () => {
  const dn = { name: "DN Parande Football And Cricket Turf", area: "Dhanori", city: "Pune" };
  assert.equal(venueReply({ label: "DN Parande", shown: [dn], home: "Hyderabad", asked: null }), "DN Parande Football And Cricket Turf is in Dhanori, Pune.");
  // In the player's own city: the reading's reply stands.
  assert.equal(venueReply({ label: "DN Parande", shown: [dn], home: "Pune", asked: null }), null);
  const prime = ["Mumbai", "Ballari", "Malegaon", "Pune", "Salem"].map((city) => ({ name: "Prime Turf", area: null, city }));
  assert.equal(venueReply({ label: "Prime Turf", shown: prime, home: "Hyderabad", asked: null }), "5 venues match Prime Turf, in Mumbai, Ballari, Malegaon and 2 more cities.");
  const hot = ["Kharadi", "Undri"].map((area) => ({ name: `Hotfut ${area}`, area, city: "Pune" }));
  assert.equal(
    venueReply({ label: "Hotfut", shown: hot, home: "Nashik", asked: "Nashik" }),
    "There's no Hotfut in Nashik on TapTurf yet. 2 venues match Hotfut, all in Pune.",
  );
  assert.equal(venueReply({ label: "Hotfut", shown: [], home: "Nashik", asked: null }), null);
});

test("question and compare lines name the venue's city when it isn't the player's", () => {
  const marol = { name: "Prime Turf", area: "Marol", city: "Mumbai" };
  assert.equal(venueLine(marol, "Mumbai", ["Ballari", "Malegaon"]), "It's the one in Marol, Mumbai. There's also a Prime Turf in Ballari and Malegaon.");
  assert.equal(venueLine(marol, "Pune", []), "It's in Marol, Mumbai.");
  assert.equal(venueLine(marol, "Mumbai", []), null);
  const kanade = { name: "Kanade Sports Club", area: "Undri", city: "Pune" };
  assert.equal(citiesLine([kanade, marol], "Pune"), "Kanade Sports Club is in Pune and Prime Turf is in Mumbai.");
  assert.equal(citiesLine([kanade, { ...kanade, name: "Hotfut Kharadi" }], "Mumbai"), "Both are in Pune.");
  assert.equal(citiesLine([kanade, { ...kanade, name: "Hotfut Kharadi" }], "Pune"), null);
});

test("an area with no city stays in the visitor's city once it matches nothing, and leaves it for an area elsewhere", () => {
  const SEARCH = dropOrder([], false);
  assert.ok(SEARCH.indexOf("area_city") >= 0 && SEARCH.indexOf("area_city") < SEARCH.indexOf("area"));
  const places: Row[] = [
    ...rows,
    { name: "Begur Box", sport: ["Box Cricket"], area: "Begur", city: "bangalore", price: null },
    { name: "Camp Turf", sport: ["Football"], area: "Camp", city: "belagavi", price: null },
  ];
  // "box cricket in Swargate" from Pune, read with no city: no row has Swargate, so Pune box cricket.
  let out = relaxSteps(places, [
    { key: "sport", keep: plays(["Box Cricket"]) },
    { key: "area", keep: (r) => r.area === "Swargate" },
    { key: "area_city", keep: (r) => r.city === "pune" },
  ], SEARCH);
  assert.deepEqual(names(out), ["Kothrud Box"]);
  assert.deepEqual(out.relaxed, ["area"]);
  // "Begur" from Nashik: the area is Bangalore's, so the visitor's city gives way.
  out = relaxSteps(places, [
    { key: "area", keep: (r) => r.area === "Begur" },
    { key: "area_city", keep: (r) => r.city === "nashik" },
  ], SEARCH);
  assert.deepEqual(names(out), ["Begur Box"]);
  assert.deepEqual(out.relaxed, ["area_city"]);
});
