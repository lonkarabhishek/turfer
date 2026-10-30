import { test } from "node:test";
import assert from "node:assert/strict";
import { citiesLine, closestRow, dropOrder, NEARBY_KM, NEARBY_MIN, nearbyLabel, noneIn, nowhereReply, relaxNearby, relaxSteps, venueLine, venueReply, venueRows, widenedReply, type RelaxStep } from "./relax";
import { haversineKm } from "../utils/location";
import { applyAskFilters } from "./ask";
import { quickAnswer } from "./quick";
import type { Turf } from "../../types/turf";

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

test("venue reply says which city, plainly", () => {
  const dn = { name: "DN Parande Football And Cricket Turf", area: "Dhanori", city: "Pune" };
  assert.equal(venueReply({ label: "DN Parande", shown: [dn], home: "Hyderabad", asked: null }), "DN Parande Football And Cricket Turf is in Dhanori, Pune.");
  // In the player's own city too, not the reading's "Let me find …".
  assert.equal(venueReply({ label: "DN Parande", shown: [dn], home: "Pune", asked: null }), "DN Parande Football And Cricket Turf is in Dhanori, Pune.");
  const prime = ["Mumbai", "Ballari", "Malegaon", "Pune", "Salem"].map((city) => ({ name: "Prime Turf", area: null, city }));
  assert.equal(venueReply({ label: "Prime Turf", shown: prime, home: "Hyderabad", asked: null }), "5 venues match Prime Turf, in Mumbai, Ballari, Malegaon and 2 more cities.");
  const hot = ["Kharadi", "Undri"].map((area) => ({ name: `Hotfut ${area}`, area, city: "Pune" }));
  assert.equal(
    venueReply({ label: "Hotfut", shown: hot, home: "Nashik", asked: "Nashik" }),
    "There's no Hotfut in Nashik on TapTurf yet. 2 venues match Hotfut, all in Pune.",
  );
  assert.equal(venueReply({ label: "Hotfut", shown: [], home: "Nashik", asked: null }), null);
});

test("a venue not in the player's city: no turf by that name here, the closest names here, then where it is", () => {
  const den = { name: "Dribble Den", area: "Begur", city: "Bangalore" };
  const base = { label: "Dribble Den", shown: [den], home: "Hyderabad", asked: null, whole: true };
  // No close name: no "Closest here", and "it" is the venue.
  assert.equal(venueReply({ ...base, closest: [] }), "No turf called Dribble Den in Hyderabad. It's in Begur, Bangalore.");
  assert.equal(
    venueReply({ ...base, closest: ["Cricket Den"] }),
    "No turf called Dribble Den in Hyderabad. Closest here: Cricket Den. Dribble Den is in Begur, Bangalore.",
  );
  assert.equal(
    venueReply({ ...base, closest: ["Cricket Den", "Sports Den"] }),
    "No turf called Dribble Den in Hyderabad. Closest here: Cricket Den and Sports Den. Dribble Den is in Begur, Bangalore.",
  );
  assert.equal(
    venueReply({ ...base, closest: ["Cricket Den", "Sports Den", "Gamer's Den"] }),
    "No turf called Dribble Den in Hyderabad. Closest here: Cricket Den, Sports Den and Gamer's Den. Dribble Den is in Begur, Bangalore.",
  );
  // The venue's own name, not a misspelling or the words around it as typed.
  assert.equal(
    venueReply({ ...base, label: "Dribbel Den", closest: ["Cricket Den"] }),
    "No turf called Dribble Den in Hyderabad. Closest here: Cricket Den. Dribble Den is in Begur, Bangalore.",
  );
  assert.equal(venueReply({ ...base, label: "dribble den price", closest: [] }), "No turf called Dribble Den in Hyderabad. It's in Begur, Bangalore.");
  // The city the player typed is the one said ("Hotfut in Nashik"); venues with only part of the name are similar names, not "it".
  const hot = ["Kharadi", "Undri"].map((area) => ({ name: `Hotfut ${area}`, area, city: "Pune" }));
  assert.equal(venueReply({ label: "Hotfut", shown: hot, home: "Nashik", asked: "Nashik", closest: [] }), "No turf called Hotfut in Nashik. Similar names are in Pune.");
  // Without `closest` (the player's city has one by that name, filtered out): as before.
  assert.equal(venueReply({ label: "Dribble Den", shown: [den], home: "Hyderabad", asked: null }), "Dribble Den is in Begur, Bangalore.");
});

test("a shared name not in the player's city says the cities, with no count", () => {
  const prime = ["Mumbai", "Ballari", "Malegaon", "Salem", "Kolkata"].map((city) => ({ name: "Prime Turf", area: null, city }));
  assert.equal(
    venueReply({ label: "Prime Turf", shown: prime, home: "Nashik", asked: null, closest: [], whole: true }),
    "No turf called Prime Turf in Nashik. There's one in Mumbai, Ballari, Malegaon and 2 more cities.",
  );
  assert.equal(
    venueReply({ label: "Prime Turf", shown: prime.slice(0, 2), home: "Nashik", asked: null, closest: ["Prime Sports Arena"], whole: true }),
    "No turf called Prime Turf in Nashik. Closest here: Prime Sports Arena. There's a Prime Turf in Mumbai and Ballari.",
  );
  // Two close venues by one name: said once, as two.
  assert.equal(
    venueReply({ label: "Prime Turf", shown: prime.slice(0, 1), home: "Nashik", asked: null, closest: ["Prime Arena", "Prime Arena"], whole: true }),
    "No turf called Prime Turf in Nashik. Closest here: two venues called Prime Arena. Prime Turf is in Mumbai.",
  );
  assert.equal(
    venueReply({ label: "Ace Arena", shown: prime.slice(0, 2).map((v) => ({ ...v, name: "Ace Arena" })), home: "Nashik", asked: null, closest: ["Ace Turf"], whole: true }),
    "No turf called Ace Arena in Nashik. Closest here: Ace Turf. There's an Ace Arena in Mumbai and Ballari.",
  );
});

test("a name found nowhere: the closest names in the player's city", () => {
  assert.equal(nowhereReply("Circuit", "Pune", ["Circuit House Arena"]), "No turf called Circuit on TapTurf yet. Closest in Pune: Circuit House Arena.");
  assert.equal(nowhereReply("Dribble Zone", "Pune", ["Dribble Sports Club", "Dribble Hub"]), "No turf called Dribble Zone on TapTurf yet. Closest in Pune: Dribble Sports Club and Dribble Hub.");
});

test("rows of cards follow the reply: the closest names, then the venue named", () => {
  const den = { name: "Dribble Den", area: "Begur", city: "Bangalore" };
  // The place apart from the name, so a long name is cut short before it is.
  assert.deepEqual(venueRows("Hyderabad", 2, [den]), [
    { label: "Closest", place: "Hyderabad", count: 2 },
    { label: "Dribble Den", place: "Bangalore", count: 1 },
  ]);
  // No close names: one row, unheaded, as before.
  assert.equal(venueRows("Hyderabad", 0, [den]), null);
  const huddle = ["Vadodara", "Mumbai"].map((city) => ({ name: "Huddle Arena", area: null, city }));
  assert.deepEqual(venueRows("Pune", 1, huddle)?.[1], { label: "Huddle Arena", place: "other cities", count: 2 });
  assert.deepEqual(venueRows("Pune", 1, [huddle[0], { ...huddle[1], name: "HUDDLE ARENA" }])?.[1], { label: "Huddle Arena", place: "other cities", count: 2 });
  // Other names than one: similar names, never the name typed over them.
  const hot = ["Kharadi", "Undri"].map((area) => ({ name: `Hotfut ${area}`, area, city: "Pune" }));
  assert.deepEqual(venueRows("Hyderabad", 3, hot)?.[1], { label: "Similar names", place: "Pune", count: 2 });
  const thunder = [{ name: "Thunderbird turf", area: null, city: "Ajmer" }, { name: "THUNDERS TURF", area: null, city: "Madurai" }];
  assert.deepEqual(venueRows("Hyderabad", 1, thunder)?.[1], { label: "Similar names", place: "other cities", count: 2 });
  assert.deepEqual(venueRows("Mumbai", 1, [{ name: "Kage Multisport Turf", area: "Pathardi", city: "Nashik" }])?.[1], { label: "Kage Multisport Turf", place: "Nashik", count: 1 });
  assert.equal(noneIn("Kage", "Mumbai"), "No turf called Kage in Mumbai.");
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

test("a name typed only in part, or misspelt: the venue's own name says where it is, never \"It's\"", () => {
  const dhanori = { name: "Sports Arena Dhanori", area: "Dhanori", city: "Pune" };
  assert.equal(venueReply({ label: "dhaneri", shown: [dhanori], home: "Hyderabad", asked: null, closest: [], whole: false }), "No turf called Dhaneri in Hyderabad. Sports Arena Dhanori is in Dhanori, Pune.");
  const kage = { name: "Kage Multisport Turf", area: "Pathardi", city: "Nashik" };
  assert.equal(venueReply({ label: "kage", shown: [kage], home: "Mumbai", asked: null, closest: [], whole: false }), "No turf called Kage in Mumbai. Kage Multisport Turf is in Pathardi, Nashik.");
  const thunder = ["Ajmer", "Kolhapur", "Madurai", "Nagercoil"].map((city) => ({ name: "Thunder turf", area: null, city }));
  assert.equal(
    venueReply({ label: "Thunder Arena", shown: thunder, home: "Hyderabad", asked: null, closest: [], whole: false }),
    "No turf called Thunder Arena in Hyderabad. Similar names are in Ajmer, Kolhapur, Madurai and 1 more city.",
  );
  const huddle = ["Vadodara", "Mumbai", "Ahmedabad"].map((city) => ({ name: "Huddle Arena", area: null, city }));
  assert.equal(venueReply({ label: "Huddle Arena", shown: huddle, home: "Pune", asked: null, closest: [], whole: true }), "No turf called Huddle Arena in Pune. There's one in Vadodara, Mumbai and Ahmedabad.");
  // The name typed whole, under other names around it (Thunder Club Turf, Thunder turf): similar names, not "one".
  const club = [{ name: "Thunder Club Turf", area: "Kalamba", city: "Kolhapur" }, { name: "Thunder turf", area: "Suchindrum", city: "Nagercoil" }];
  assert.equal(venueReply({ label: "Thunder Arena", shown: club, home: "Hyderabad", asked: null, closest: [], whole: true }), "No turf called Thunder Arena in Hyderabad. Similar names are in Kolhapur and Nagercoil.");
});

test("where a venue is: the city alone when its area is the city again, a PIN or 'near'", () => {
  const at = (area: string, city: string) => venueReply({ label: "X", shown: [{ name: "X Turf", area, city }], home: "Pune", asked: null, closest: [], whole: true });
  assert.equal(at("Kudasan, Gandhinagar", "Gandhinagar"), "No turf called X Turf in Pune. It's in Kudasan, Gandhinagar.");
  assert.equal(at("PIN 395013", "Surat"), "No turf called X Turf in Pune. It's in Surat.");
  assert.equal(at("Near", "Patan"), "No turf called X Turf in Pune. It's in Patan.");
  assert.equal(at("near global Indian international school", "Jodhpur"), "No turf called X Turf in Pune. It's in Jodhpur.");
  assert.equal(at("Navi Mumbai", "Mumbai"), "No turf called X Turf in Pune. It's in Navi Mumbai, Mumbai.");
  assert.equal(venueLine({ name: "Crickbox Arena", area: "Kudasan, Gandhinagar", city: "Gandhinagar" }, "Pune", []), "It's in Kudasan, Gandhinagar.");
});

test("closest names listed: two cards with one name said once, semicolons when a name has a comma", () => {
  assert.equal(nowhereReply("huddle kings", "Mumbai", ["Huddle Arena", "Huddle Arena"]), "No turf called Huddle kings on TapTurf yet. Closest in Mumbai: two venues called Huddle Arena.");
  assert.equal(
    nowhereReply("Players Kings", "Mumbai", ["Players Turf, Mahakali Caves", "PLAYERS TURF -PPS BHANDUP", "Players Turf At Saki Naka"]),
    "No turf called Players Kings on TapTurf yet. Closest in Mumbai: Players Turf, Mahakali Caves; PLAYERS TURF -PPS BHANDUP; and Players Turf At Saki Naka.",
  );
  assert.deepEqual(closestRow("Pune", 2), { label: "Closest", place: "Pune", count: 2 });
});

// ── Near me: within a radius of the visitor ─────────────────────────

// Football venues as listed on 30 Oct (SELECT only): the cheapest in India
// by listed rate, and Pune's out to Lonavala.
type Venue = { name: string; city: string; lat: number | null; lng: number | null; price: number };
const venues2: Venue[] = [
  { name: "Hotfut Kharadi", city: "pune", lat: 18.5557645, lng: 73.9612833, price: 200 },
  { name: "Nova Center For Excellence", city: "pune", lat: 18.5210973, lng: 73.9464171, price: 250 },
  { name: "Jignasa Sports Venue", city: "hyderabad", lat: 17.4698085, lng: 78.3077991, price: 299 },
  { name: "Greenland Turf", city: "bangalore", lat: 12.7999059, lng: 77.6830084, price: 300 },
  { name: "The Defender's multisports turf", city: "nashik", lat: 19.9302307813809, lng: 73.811603610806, price: 350 },
  { name: "Powerplay Park", city: "pune", lat: 18.5495006, lng: 73.7629951, price: 350 },
  { name: "PlayAll DIS Dwarka", city: "delhi", lat: 28.5639508, lng: 77.0582883, price: 300 },
  { name: "Ace Sports Arena (GGIS Tathawade)", city: "pune", lat: 18.6307759, lng: 73.7514631, price: 400 },
  { name: "Wakad Goal Arena", city: "pune", lat: 18.59682, lng: 73.77551, price: 800 },
  { name: "The Turf Hub", city: "pune", lat: 18.7418516, lng: 73.4132872, price: 0 },
  { name: "Dabhade Sports Club / Turf", city: "pune", lat: 18.74193, lng: 73.4196771, price: 0 },
  { name: "ARKADE sports", city: "mumbai", lat: 19.1989396, lng: 73.1858189, price: 800 },
  { name: "No Pin Arena", city: "pune", lat: null, lng: null, price: 100 },
];
const from = (at: { lat: number; lng: number }) => (v: Venue) => (v.lat != null && v.lng != null ? haversineKm(at, { lat: v.lat, lng: v.lng }) : null);
const BANER_AT = { lat: 18.559, lng: 73.7868 };
const LONAVALA_AT = { lat: 18.7505, lng: 73.4071 };
const vNames = (out: { matched: Venue[] }) => out.matched.map((v) => v.name);
const SEARCH_ORDER = dropOrder([], false);

test("near me stays near: within 25 km of the visitor, whatever the sort, never all of India", () => {
  // "Cheapest football turf near me" from Baner: Hyderabad, Bangalore, Nashik and Delhi were in the answer.
  const out = relaxNearby(venues2, [], SEARCH_ORDER, from(BANER_AT));
  assert.deepEqual(out.relaxed, []);
  assert.deepEqual(vNames(out), ["Hotfut Kharadi", "Nova Center For Excellence", "Powerplay Park", "Ace Sports Arena (GGIS Tathawade)", "Wakad Goal Arena"]);
  // A row with no location is never near.
  assert.ok(!vNames(out).includes("No Pin Arena"));
  assert.ok(out.matched.every((v) => from(BANER_AT)(v)! <= 25));
});

test("near me widens to 50, then 100 km, only while fewer than three match, and says so", () => {
  // From Lonavala: two football turfs within 25 km, so the search reaches 50 km (Tathawade, Wakad).
  const lonavala = relaxNearby(venues2, [], SEARCH_ORDER, from(LONAVALA_AT));
  assert.deepEqual(lonavala.relaxed, ["near:50"]);
  assert.deepEqual(vNames(lonavala), ["Powerplay Park", "Ace Sports Arena (GGIS Tathawade)", "Wakad Goal Arena", "The Turf Hub", "Dabhade Sports Club / Turf"]);
  assert.equal(nearbyLabel(lonavala.relaxed[0]), "the distance to 50 km");
  // Fewer than three even at 100 km: what 100 km has, never further (ARKADE is 55 km from Lonavala, Deolali 138).
  const priced = (max: number): RelaxStep<Venue>[] => [{ key: "price", keep: (v) => v.price > 0 && v.price <= max }];
  const few = relaxNearby(venues2, [{ key: "sport", keep: (v) => v.city !== "pune" }], SEARCH_ORDER, from(LONAVALA_AT));
  assert.deepEqual(few.relaxed, ["near:100"]);
  assert.deepEqual(vNames(few), ["ARKADE sports"]);
  // Nothing within 100 km: nothing, not the nearest in another state.
  const none = relaxNearby(venues2, [{ key: "sport", keep: (v) => v.city === "delhi" }], SEARCH_ORDER, from(BANER_AT));
  assert.deepEqual(none, { matched: [], relaxed: ["near:100"] });
  // The usual widening happens only when nothing within 100 km passes every filter, and then within
  // 25 km first: a budget no venue near meets gives way there, and one some meet holds.
  const cheap = relaxNearby(venues2, priced(150), SEARCH_ORDER, from(BANER_AT));
  assert.deepEqual(cheap.relaxed, ["price"]);
  assert.equal(cheap.matched.length, 5);
  const budget = relaxNearby(venues2, priced(400), SEARCH_ORDER, from(BANER_AT));
  assert.deepEqual(budget.relaxed, []);
  assert.deepEqual(vNames(budget), ["Hotfut Kharadi", "Nova Center For Excellence", "Powerplay Park", "Ace Sports Arena (GGIS Tathawade)"]);
  assert.equal(nearbyLabel("price"), null);
  assert.ok(NEARBY_KM.every((km, i) => i === 0 || km > NEARBY_KM[i - 1]) && NEARBY_MIN === 3);
});

test("near me widens on every filter first: a budget met a little further away is kept, never dropped for the nearest", () => {
  // From Talegaon, football under ₹300: none within 25 km (Powerplay Park, ₹350, is 23 km away), three at ₹200 to ₹300 within 50.
  const TALEGAON_AT = { lat: 18.735, lng: 73.675 };
  const rows = [...venues2, { name: "Kanade Sports Club", city: "pune", lat: 18.4439484, lng: 73.9146692, price: 300 }];
  const under = (max: number): RelaxStep<Venue>[] => [{ key: "price", keep: (v) => v.price > 0 && v.price <= max }];
  const strict = relaxNearby(rows, under(300), SEARCH_ORDER, from(TALEGAON_AT));
  assert.deepEqual(strict.relaxed, ["near:50"]);
  assert.deepEqual(vNames(strict), ["Hotfut Kharadi", "Nova Center For Excellence", "Kanade Sports Club"]);
  // A looser budget never gets a worse answer than a stricter one.
  const looser = relaxNearby(rows, under(350), SEARCH_ORDER, from(TALEGAON_AT));
  assert.deepEqual(looser.relaxed, ["near:50"]);
  assert.deepEqual(vNames(looser), ["Hotfut Kharadi", "Nova Center For Excellence", "Powerplay Park", "Kanade Sports Club"]);
  // One or two within 100 km pass every filter: those, rather than the budget dropped nearer.
  const two = relaxNearby(rows, under(250), SEARCH_ORDER, from(TALEGAON_AT));
  assert.deepEqual(two.relaxed, ["near:100"]);
  assert.deepEqual(vNames(two), ["Hotfut Kharadi", "Nova Center For Excellence"]);
});

test("near me on another city's page: the visitor's location wins over the page's city, not over a city they named", () => {
  // "Football turf near me" from Baner on a Mumbai page: the quick reading takes the page's city.
  const mumbai: Venue[] = [
    { name: "ARKADE sports", city: "mumbai", lat: 19.1989396, lng: 73.1858189, price: 800 },
    { name: "Kharghar turf", city: "mumbai", lat: 19.033, lng: 73.1003, price: 900 },
    { name: "Nerul turf", city: "mumbai", lat: 19.0176, lng: 73.0391, price: 1000 },
    { name: "Panvel turf", city: "mumbai", lat: 18.9894, lng: 73.1175, price: 1100 },
  ];
  const turfs = [...venues2, ...mumbai].map(
    (v, i) =>
      ({ id: `v${i}`, slug: `v${i}`, name: v.name, city: v.city, area: null, address: "", sports: ["Football"], amenities: [], images: [], rating: 4.2, total_reviews: 10, lat: v.lat, lng: v.lng, morning_price: v.price || null }) as unknown as Turf,
  );
  const f = quickAnswer("football turf near me", { areas: {}, turfs }, { prefCity: "pune", city: "mumbai" })!;
  assert.equal(f.city, "mumbai");
  assert.equal(f.wants_nearby, true);
  const page = applyAskFilters(turfs, f, { prefCity: "pune", loc: BANER_AT, askedCity: null });
  assert.deepEqual(page.relaxed, []);
  assert.deepEqual(page.turfs.map((t) => t.name), ["Powerplay Park", "Wakad Goal Arena", "Ace Sports Arena (GGIS Tathawade)", "Nova Center For Excellence", "Hotfut Kharadi"]);
  assert.ok(page.turfs.every((t) => t.city === "pune" && t.distanceKm! <= 25));
  // No city chip, nor the next turn's city, for cards that aren't the page's.
  assert.equal(page.city, null);
  // On their own city's page the cards are its, so its chip and list stay.
  const own = applyAskFilters(turfs, { ...f, city: "pune" }, { prefCity: "pune", loc: BANER_AT, askedCity: null });
  assert.deepEqual(own.turfs.map((t) => t.name), page.turfs.map((t) => t.name));
  assert.equal(own.city, "pune");
  // "Near me in Mumbai": a city the player named keeps them there.
  const named = applyAskFilters(turfs, f, { prefCity: "pune", loc: BANER_AT, askedCity: "mumbai" });
  assert.equal(named.city, "mumbai");
  assert.ok(named.turfs.length > 0 && named.turfs.every((t) => t.city === "mumbai"));
  // A caller that doesn't know what the player named (the games' fallback turfs): the reading's city, as before.
  assert.ok(applyAskFilters(turfs, f, { prefCity: "pune", loc: BANER_AT }).turfs.every((t) => t.city === "mumbai"));
});
