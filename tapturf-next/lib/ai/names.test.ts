import { test } from "node:test";
import assert from "node:assert/strict";
import { cityNamed, findNamedVenues, nameIn, resolveTurfNames } from "./names";
import type { Turf } from "../../types/turf";

// Real names from the turfs table (October 2026).
const rows: [string, string, number][] = [
  ["A One Sports Club Patancheru", "hyderabad", 300],
  ["A One Sports Pickle Zone & Cricket Arena", "hyderabad", 40],
  ["A-One Turf", "nashik", 120],
  ["A1 Turf", "jalgaon", 15],
  ["Arena One", "yavatmal", 30],
  ["Champions Zone Box Cricket", "hyderabad", 900],
  ["Champion's Turf", "nashik", 60],
  ["Champions Field Hadapsar", "pune", 200],
  ["The Royal MultiSports Turf", "nashik", 25],
  ["Vedant Sports Academy", "nashik", 80],
  ["Hindu Gymkhana Ground", "nashik", 500],
  ["CC Turf Pardi", "nashik", 30],
  ["CC Turf Gangapur", "nashik", 30],
  ["Arena32", "pune", 10],
  ["Reboot Sports Arena", "pune", 300],
  ["DN Parande Football And Cricket Turf", "pune", 120],
];
const all = rows.map(([name, city, total_reviews], i) => ({ id: `t${i}`, name, city, total_reviews, area: null, address: "" }) as unknown as Turf);
const pick = (q: string, city: string | null = null) => resolveTurfNames(all, [q], city)[0].turf?.name ?? null;

test("typos in the generic word do not block a match", () => {
  assert.equal(pick("Royal multisports truf"), "The Royal MultiSports Turf");
  assert.equal(pick("royal multisport turff"), "The Royal MultiSports Turf");
});

test("A one / A-One / A1 match each other, the city decides", () => {
  assert.equal(pick("A one truf", "nashik"), "A-One Turf");
  assert.equal(pick("A1 turf", "jalgaon"), "A1 Turf");
  assert.equal(pick("a-one", "nashik"), "A-One Turf");
});

test("a word never matches inside another word", () => {
  // "one" must not find "Champions Zone".
  assert.notEqual(pick("one", "hyderabad"), "Champions Zone Box Cricket");
});

test("a name with a number is not a shorter word plus digits", () => {
  // The Pune compare chip is "DN Parande Football vs Arena32".
  assert.equal(pick("Arena32", "pune"), "Arena32");
  assert.equal(pick("DN Parande Football", "pune"), "DN Parande Football And Cricket Turf");
});

test("prefixes and possessives still match", () => {
  assert.equal(pick("Champion", "nashik"), "Champion's Turf");
  assert.equal(pick("champions hadapsar"), "Champions Field Hadapsar");
});

test("existing behaviour holds", () => {
  assert.equal(pick("Vedant"), "Vedant Sports Academy");
  assert.equal(pick("Hindu Gymkhana"), "Hindu Gymkhana Ground");
  assert.equal(pick("CC Turf Pardi"), "CC Turf Pardi");
  assert.equal(pick("zzz unknown place"), null);
});

// Venues that share a name across cities, with their areas and
// addresses, as the turfs table has them (28 Oct 2026). Ballari is not
// a curated city: its name comes from the rows.
const india: [string, string, string, string, number][] = [
  ["Prime Turf", "mumbai", "Marol", "Building no 5, Mittal Industrial Estate, Andheri East, Mumbai", 263],
  ["Prime Turf and pickleball arena", "mumbai", "Dombivli East", "Sai Baba complex, Dombivli", 308],
  ["Prime turf", "ballari", "Vidya Nagar", "Opposite dental college, Ballari", 22],
  ["Prime Turf", "malegaon", "Golden Nagar", "Golden Nagar, Malegaon", 3],
  ["Prime Sports Turf cricket", "pune", "Kharadi", "Tukaram Nagar, Kharadi, Pune", 256],
  ["Prime Sports Arena", "hyderabad", "Chandrayangutta", "Vyasa Puri, Hyderabad", 46],
  ["The Pitch", "hyderabad", "Kattedan", "Inner Ring Rd, Hyderabad", 584],
  ["The Pitch", "belagavi", "Godsewadi", "Mandoli Rd, Belagavi", 340],
  ["Kage Multisport Turf", "nashik", "Pathardi", "Pathardi-Vadner Dumala Rd, Nashik", 302],
  ["Kridadham Premium Multisport Club", "nashik", "Rane Nagar", "Rane Nagar, Nashik", 90],
  ["Dribble Den", "bangalore", "Begur", "Yelenahalli, Begur, Bengaluru", 22],
  ["Begur Turf", "bangalore", "Begur", "Begur Rd, Bengaluru", 308],
  ["T & R CRICKET", "mumbai", "Kasarvadavali", "Behind lion cage turf, Thane", 33],
  ["The Royal MultiSports Turf", "nashik", "Vaiduwadi", "Morade Nagar, Nashik", 63],
  ["Royal Turf", "mumbai", "Desale Pada", "Bhopar road, Dombivli", 23],
  ["Best cricket hub", "vijayawada", "Pedapulipaka", "Pedapulipaka, Vijayawada", 44],
  ["Hotfut Kharadi", "pune", "Kharadi", "Kharadi, Pune", 25],
  ["HotFut Gachibowli", "hyderabad", "Gachibowli", "Gachibowli, Hyderabad", 916],
];
const rowsIndia = india.map(([name, city, area, address, total_reviews], i) => ({ id: `i${i}`, name, city, area, address, total_reviews }) as unknown as Turf);
const where = (t: Turf | null | undefined) => (t ? `${t.name} (${t.city})` : null);
const one = (q: string, cities: (string | null)[] = []) => where(resolveTurfNames(rowsIndia, [q], cities)[0].turf);
const found = (q: string) => findNamedVenues(rowsIndia, q)?.matches.map((m) => where(m.turf)) ?? null;

test("a venue is found in every city, the visitor's city only breaks ties", () => {
  assert.equal(one("Kage", ["pune"]), "Kage Multisport Turf (nashik)");
  assert.equal(one("Dribble Den", ["nashik"]), "Dribble Den (bangalore)");
  // Same name in several cities: the visitor's, else the exact name, else the most reviewed.
  assert.equal(one("Prime Turf", ["mumbai"]), "Prime Turf (mumbai)");
  assert.equal(one("Prime Turf", ["pune"]), "Prime Sports Turf cricket (pune)");
  assert.equal(one("Prime Turf", ["hyderabad"]), "Prime Turf (mumbai)");
  assert.equal(one("Hotfut", ["hyderabad"]), "HotFut Gachibowli (hyderabad)");
});

test("a city in the ask beats the visitor's, typed with the name or not", () => {
  assert.equal(one("The Pitch Belagavi", ["hyderabad"]), "The Pitch (belagavi)");
  assert.equal(one("The Pitch", ["belagavi", "hyderabad"]), "The Pitch (belagavi)");
  assert.equal(one("Prime Turf in Ballari", ["pune"]), "Prime turf (ballari)");
  assert.equal(one("Prime Turf", ["ballari", "pune"]), "Prime turf (ballari)");
  assert.equal(cityNamed(rowsIndia, "Does Prime Turf in Ballari have floodlights?"), "ballari");
  assert.equal(cityNamed(rowsIndia, "Dribble Den Bengaluru"), "bangalore");
  assert.equal(cityNamed(rowsIndia, "Dribble Den in begur"), null);
});

test("an area or address word with the name, short names and misspellings", () => {
  assert.equal(one("Prime Turf Marol", ["pune"]), "Prime Turf (mumbai)");
  assert.equal(one("Prime Turf Andheri", ["pune"]), "Prime Turf (mumbai)");
  assert.equal(one("T & R", ["mumbai"]), "T & R CRICKET (mumbai)");
  assert.equal(one("Kridadam", ["mumbai"]), "Kridadham Premium Multisport Club (nashik)");
  assert.equal(one("Dribbel Den", ["pune"]), "Dribble Den (bangalore)");
});

test("other venues with exactly the name are named too", () => {
  const [r] = resolveTurfNames(rowsIndia, ["Prime Turf"], ["mumbai"]);
  assert.deepEqual(r.others.map((t) => t.city).sort(), ["ballari", "malegaon"]);
  // A city typed with the name: only that one.
  assert.deepEqual(resolveTurfNames(rowsIndia, ["Prime Turf Mumbai"], ["pune"])[0].others, []);
});

test("a turf search names a venue only with a word of a name", () => {
  for (const q of ["best turf", "cheap turf", "turf with parking", "24 hour turf", "sports arena", "football turf near me", "box cricket"]) {
    assert.equal(findNamedVenues(rowsIndia, q), null, q);
    assert.equal(nameIn(rowsIndia, q), null, q);
  }
  assert.deepEqual(found("Kage Turf broo"), ["Kage Multisport Turf (nashik)"]);
  assert.deepEqual(found("Dribble Den near me"), ["Dribble Den (bangalore)"]);
  assert.deepEqual(found("number of kage"), ["Kage Multisport Turf (nashik)"]);
  // "Prime Turf" means venues with both words: Prime Sports Arena is not one.
  const prime = found("Prime Turf") ?? [];
  assert.ok(!prime.includes("Prime Sports Arena (hyderabad)"));
  assert.deepEqual(prime.slice(0, 3).sort(), ["Prime Turf (malegaon)", "Prime Turf (mumbai)", "Prime turf (ballari)"]);
  // The venue first, then the rest of the area that has the words.
  assert.equal(found("Begur Turf")?.[0], "Begur Turf (bangalore)");
  const hot = findNamedVenues(rowsIndia, "Hotfut in Nashik");
  assert.equal(hot?.city, "nashik");
  assert.equal(hot?.label, "Hotfut");
  assert.equal(hot?.matches.length, 2);
  assert.equal(nameIn(rowsIndia, "Circuit near me"), "Circuit");
});
