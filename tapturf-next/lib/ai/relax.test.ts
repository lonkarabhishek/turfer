import { test } from "node:test";
import assert from "node:assert/strict";
import { citiesLine, closestRow, dropOrder, noneIn, nowhereReply, relaxSteps, venueLine, venueReply, venueRows, widenedReply, type RelaxStep } from "./relax";

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
