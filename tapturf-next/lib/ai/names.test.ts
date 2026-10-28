import { test } from "node:test";
import assert from "node:assert/strict";
import { areaElsewhere, cityNamed, closestNames, findNamedVenues, nameIn, namedInSearch, namesVenue, namesWhich, placedAt, readsAsName, resolveTurfNames, resolveWithPage, shownNames, wholeVenueName } from "./names";
import type { CityId } from "../city";
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
  // Only venues by the very same name: Pune's Prime Sports Turf cricket has no namesake in Mumbai.
  assert.deepEqual(resolveTurfNames(rowsIndia, ["Prime Turf"], ["pune"])[0].others, []);
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

// Round 3 (review findings): rows as the turfs table has them on 28 Oct 2026.
const r3: [string, string, string | null, string, string[], number][] = [
  ["Turfsquad Sports Arena", "chandigarh", "Zirakpur", "NH5, Sector 19, Zirakpur, Punjab", ["Box Cricket", "Pickleball"], 186],
  ["Kickstart", "chandigarh", "Sector 44", "Sector 44, Chandigarh", ["Football"], 101],
  ["My Turf", "pune", "Thergaon", "Thergaon, Pimpri-Chinchwad", ["Football"], 16],
  ["Vaayu Turf & Sport Arena", "pune", "Kondhwa", "Shreehans Nagar, Kondhwa, Pune", ["Box Cricket", "Football"], 49],
  ["Sporturf Arena", "kolkata", "Kasba", "Picnic Garden Rd, Kasba, Kolkata", ["Football"], 860],
  ["Titan Turf", "pune", "Arjun nagar", "Jambhulwadi, Arjun nagar, Pune", ["Box Cricket"], 15],
  ["ONESTOP TURF BOX CRICKET", "gandhinagar", "RUTA FARM PARTY PLOT", "Adalaj, Shertha, Gujarat", ["Box Cricket"], 33],
  ["Jay mahadev turf", "bhopal", "Ayodhya Nagar", "Ayodhya Nagar, Bhopal", ["Box Cricket"], 50],
  ["Phoenix Sports Arena", "bangalore", "Mahadevapura", "Maheswari Nagar, Mahadevapura, Bengaluru", ["Box Cricket", "Football"], 67],
  ["Club19", "indore", "Scheme 94", "RING ROAD, PSP-2, Scheme 94, Indore", ["Box Cricket"], 754],
  ["PlayAll GTB Model Town", "delhi", "Zone C-19", "North Ex Model Town, Delhi", ["Box Cricket"], 53],
  ["Turf28 Bijapur", "vijayapura", null, "Al Ameen Rd, Vijayapura, Karnataka", ["Box Cricket"], 22],
  ["Arena 28", "guwahati", "Beltola Tiniali", "Lakhimi Path, Beltola Tiniali, Guwahati", ["Football"], 207],
  ["Sukhbir Turf Club", "karnal", "Sector 28", "Sukhbir colony, Sector 28, Karnal", ["Box Cricket"], 0],
  ["Coimbatore Sports Club", "coimbatore", "Ramanathapuram", "Sungam Bypass Rd, Ramanathapuram", ["Box Cricket"], 156],
  ["Hi5ers Turf - Goregaon", "mumbai", "Goregaon East", "Vishveshwar Nagar Rd, Goregaon East", ["Football"], 229],
  ["Turf 9 Arena", "pune", "Hadapsar", "Sasane Nagar Rd, Hadapsar", ["Box Cricket"], 110],
  ["Chase Skating & Box Cricket", "hyderabad", "Madhapur", "Siddhi Vinayak Nagar, Madhapur, Hyderabad", ["Box Cricket", "Skating"], 106],
  ["PLaY Arena", "bangalore", "Kasavanahalli", "Central Jail Road, Sarjapur Road", ["Box Cricket", "Squash", "Skating"], 40312],
  ["The Sky Arena - Rooftop Turf", "kolkata", "Salt Lake", "Salt Lake, Kolkata", ["Football"], 90],
  ["Score", "mumbai", "Andheri East", "Rooftop, Marwah House, Marol, Andheri East, Mumbai", ["Box Cricket"], 996],
  ["Huddle Arena", "vadodara", "Vemali", "Canal Road, New Sama, Vemali, Vadodara", ["Football"], 837],
  ["Huddle Arena", "vadodara", "Karelibagh", "Sayajibaug Rd, Karelibagh, Vadodara", ["Football"], 399],
  ["Huddle Arena", "mumbai", "Chembur", "Sion - Panvel Hwy, Chembur", ["Football"], 510],
  ["GreenBox Turf", "pune", "Shivajinagar", "Chiplunkar Road, Law College Rd, Shivajinagar", ["Box Cricket"], 199],
  ["Force Playing Fields - Model Colony", "pune", null, "Gokhale Path, Model Colony, Shivaji Nagar, Pune", ["Cricket"], 731],
  ["Chatrapati Shivaji Maharaj Turf (Kamptee)", "nagpur", "Kamptee", "Kumbhare Colony, Gautam Nagar, Kamptee", ["Box Cricket"], 1],
  ["Dribble Den", "bangalore", "Begur", "Yelenahalli, Begur, Bengaluru", ["Football"], 22],
  ["Kage Multisport Turf", "nashik", "Pathardi", "Pathardi-Vadner Dumala Rd, Nashik", ["Cricket"], 302],
  ["Deccan Turf", "sambhajinagar", "Jalna Road", "Jalna Rd, Chilkalthana", ["Football"], 20],
  ["Herkley Sports Centre", "coimbatore", "Peelamedu", "Pioneer Mill Rd, Peelamedu, Coimbatore", ["Football"], 1183],
  ["Power Play Sports Arena", "bangalore", "Chokkanahalli", "Block 3, Chokkanahalli, Bengaluru", ["Football"], 149],
  ["Soccer City", "bangalore", "Marathahalli", "SGR Dental College Rd, Marathahalli", ["Box Cricket"], 1457],
  ["Surekha Turf", "imphal", "Lamphel", "Lamphel, Imphal", ["Football"], 4],
  ["Winners Turf", "mumbai", "Wadeghar Gaon", "Wadeghar Gaon, Kalyan", ["Box Cricket"], 40],
  ["Green Square Turf", "nashik", "Mahiravni", "Trimbak Rd, Mahiravni, Nashik", ["Football"], 300],
];
const rows3 = r3.map(([name, city, area, address, sports, total_reviews], i) => ({ id: `r${i}`, name, city, area, address, sports, total_reviews }) as unknown as Turf);
const at3 = (name: string, city?: string) => rows3.find((t) => t.name === name && (!city || t.city === city))!;
const named3 = (q: string, asName = false) => findNamedVenues(rows3, q, asName)?.matches.map((m) => where(m.turf)) ?? null;
const one3 = (q: string, cities: (string | null)[] = []) => where(resolveTurfNames(rows3, [q], cities)[0].turf);

test("a one-word brand is not every venue with the generic word in its name (Turfsquad, Sporturf)", () => {
  assert.deepEqual(named3("Turfsquad"), ["Turfsquad Sports Arena (chandigarh)"]);
  assert.deepEqual(named3("Sporturf Arena"), ["Sporturf Arena (kolkata)"]);
  assert.equal(one3("Turfsquad", ["pune"]), "Turfsquad Sports Arena (chandigarh)");
  // The question's "also in" line names only venues by that very name.
  const [r] = resolveTurfNames(rows3, ["Sporturf Arena"], ["pune"]);
  assert.equal(where(r.turf), "Sporturf Arena (kolkata)");
  assert.deepEqual(r.others, []);
  // A plural still matches; a longer word doesn't (Mahadevapura is not Jay mahadev, "ones" not ONESTOP).
  assert.equal(one3("Titans Turf", ["pune"]), "Titan Turf (pune)");
  assert.ok(!(named3("Mahadevapura turf") ?? []).includes("Jay mahadev turf (bhopal)"));
  assert.equal(named3("Cheaper ones"), null);
  // A four-letter word is not the start of a longer name: "sure" is not Surekha Turf.
  assert.equal(named3("sure"), null);
  assert.equal(named3("Best rated ones"), null);
});

test("a name with a number: Club 19 is Club19, Turf 28 is Turf28 Bijapur, not Zone C-19 or Sector 28", () => {
  assert.deepEqual(named3("Club 19"), ["Club19 (indore)"]);
  assert.equal(one3("Club 19", ["bhopal"]), "Club19 (indore)");
  assert.deepEqual(named3("Turf 28"), ["Turf28 Bijapur (vijayapura)"]);
  assert.equal(named3("Club19")?.[0], "Club19 (indore)");
});

test("a whole name with no distinctive word, as a name or with a number", () => {
  // turf_names: a city and generic words can be the name.
  assert.deepEqual(named3("Coimbatore Sports Club", true), ["Coimbatore Sports Club (coimbatore)"]);
  // A plain search for them is a city search.
  assert.equal(named3("Coimbatore Sports Club"), null);
  assert.deepEqual(named3("Turf 9 Arena"), ["Turf 9 Arena (pune)"]);
  assert.deepEqual(named3("Hi 5ers"), ["Hi5ers Turf - Goregaon (mumbai)"]);
  assert.equal(one3("Hi 5ers", ["pune"]), "Hi5ers Turf - Goregaon (mumbai)");
});

test("free_text that a city's rows have stays a search there, a venue's name does not", () => {
  const ft = (text: string, city: string) => {
    const r = namedInSearch(rows3, text, city);
    return r.named ? r.named.matches.map((m) => where(m.turf)) : { search: r.words };
  };
  // "skating in bangalore": PLaY Arena lists it, so not Chase Skating in Hyderabad.
  assert.deepEqual(ft("skating", "bangalore"), { search: ["skating"] });
  // A sport no row in the city lists stays the venues elsewhere that have it.
  assert.deepEqual(ft("skating", "pune"), ["Chase Skating & Box Cricket (hyderabad)"]);
  // "rooftop turf in Mumbai": Score's address says Rooftop.
  assert.deepEqual(ft("rooftop", "mumbai"), { search: ["rooftop"] });
  // An address-only match in the city is a place there, not a venue.
  assert.deepEqual(ft("Shivaji Nagar box cricket", "pune"), { search: ["shivaji", "nagar"] });
  // Venues by name, wherever the player is.
  assert.deepEqual(ft("Dribble Den in begur", "nashik"), ["Dribble Den (bangalore)"]);
  assert.deepEqual(ft("Kage", "pune"), ["Kage Multisport Turf (nashik)"]);
  assert.deepEqual(ft("Club 19", "bhopal"), ["Club19 (indore)"]);
  // "turf in Deccan" is a place, not Deccan Turf's exact name; no Pune row has it, so the venue elsewhere.
  assert.equal(findNamedVenues(rows3, "turf in Deccan")?.placed, true);
  assert.equal(findNamedVenues(rows3, "Pitch In a Box")?.placed ?? false, false);
});

test("keyword readings: only a venue's own name is a venue, not an area or a word", () => {
  assert.equal(namesVenue(rows3, "Andheri"), false);
  assert.equal(namesVenue(rows3, "Shivaji Nagar"), false);
  assert.equal(namesVenue(rows3, "Kage"), true);
  assert.equal(namesVenue(rows3, "Herkley"), true);
  assert.equal(named3("Herkley open now")?.[0], "Herkley Sports Centre (coimbatore)");
  assert.equal(named3("tell me about Herkley")?.[0], "Herkley Sports Centre (coimbatore)");
  // Small talk the reading called other: only a whole name is a search.
  for (const q of ["sure", "really", "fine", "winner"]) assert.equal(wholeVenueName(rows3, q), null, q);
  assert.equal(where(wholeVenueName(rows3, "Dribble den")?.matches[0].turf), "Dribble Den (bangalore)");
  assert.equal(where(wholeVenueName(rows3, "Power play")?.matches[0].turf), "Power Play Sports Arena (bangalore)");
  assert.equal(where(wholeVenueName(rows3, "No Kage Turf")?.matches[0].turf), "Kage Multisport Turf (nashik)");
});

test("shown names carry the area and city when shared, and read back as that venue", () => {
  const cards = [at3("Huddle Arena", "vadodara"), rows3.find((t) => t.area === "Karelibagh")!, at3("Huddle Arena", "mumbai"), at3("Kage Multisport Turf")];
  const top = shownNames(cards, rows3);
  assert.deepEqual(top, ["Huddle Arena, Vemali, Vadodara", "Huddle Arena, Karelibagh, Vadodara", "Huddle Arena, Chembur, Mumbai", "Kage Multisport Turf"]);
  // "Compare the top two": two different venues, the two shown.
  const got = resolveTurfNames(rows3, top.slice(0, 2), ["pune"], { distinct: true }).map((r) => r.turf?.area);
  assert.deepEqual(got, ["Vemali", "Karelibagh"]);
  // The same name twice in a compare is two venues, not one with itself.
  const twice = resolveTurfNames(rows3, ["Huddle Arena", "Huddle Arena"], ["vadodara"], { distinct: true }).map((r) => r.turf?.id);
  assert.notEqual(twice[0], twice[1]);
});

test("on a venue's page, 'this turf' is that row, not the first venue by its name", () => {
  const page = { name: "Huddle Arena", turf: rows3.find((t) => t.area === "Karelibagh")! };
  const [hit] = resolveWithPage(rows3, ["Huddle Arena"], ["vadodara"], page);
  assert.equal(hit.turf?.area, "Karelibagh");
  assert.deepEqual(hit.others, []);
  const cmp = resolveWithPage(rows3, ["Huddle Arena", "Kickstart"], ["vadodara"], page, { distinct: true });
  assert.deepEqual(cmp.map((r) => r.turf?.area), ["Karelibagh", "Sector 44"]);
  // Another venue named on the page resolves as usual.
  assert.equal(resolveWithPage(rows3, ["Huddle Arena Chembur"], ["vadodara"], page)[0].turf?.city, "mumbai");
});

test("an inferred city gives way only to an area another city lists as its own", () => {
  assert.equal(areaElsewhere(rows3, ["Begur"], "nashik"), true);
  // Misspelt by an edit or two (ask 211).
  assert.equal(areaElsewhere(rows3, ["Marathalli"], "noida"), true);
  // Only in another city's address, not a listed area: the city stays.
  assert.equal(areaElsewhere(rows3, ["Jalna Rd"], "nashik"), false);
  assert.equal(areaElsewhere(rows3, ["Model Colony"], "nashik"), false);
  // The city has it itself.
  assert.equal(areaElsewhere(rows3, ["Shivajinagar"], "pune"), false);
});

// Closest names in the player's city, for a venue named that isn't there (rows as on 28 Oct).
const r4: [string, string, string | null, number][] = [
  ["Dribble Den", "bangalore", "Begur", 22],
  ["Cricket Den", "hyderabad", "Uppal", 184],
  ["Sports Den", "hyderabad", "Pocharam", 9],
  ["Gamer's Den", "hyderabad", "Manikonda", 395],
  ["Champions Zone Box Cricket", "hyderabad", "Ghatkesar", 4],
  ["Raptor Sports Zone", "hyderabad", "Kothapet", 273],
  ["SB Arena", "hyderabad", "Puppalaguda", 67],
  ["HotFut Inorbit", "hyderabad", "Madhapur", 1276],
  ["HotFut Gachibowli", "hyderabad", "Gachibowli", 916],
  ["Hotfut SB Road", "pune", "Senapati Bapat Road", 16],
  ["Dribble Sports Club", "pune", null, 138],
  ["Runbhumi The Multisports Turf", "pune", "Balewadi", 443],
  ["Kage Multisport Turf", "nashik", "Pathardi", 302],
  ["Maidaan Multi Sports Turf", "nashik", "Satpur", 60],
  ["Prime Turf", "mumbai", "Marol", 263],
  ["Prime Turf and pickleball arena", "mumbai", "Dombivli East", 308],
  ["Football Turf Thane - Strikers Arena", "mumbai", "Kolshet", 694],
  ["Spin Arena Turf", "mumbai", "Mira Road East", 45],
  ["LEO PRIDE ACADEMY OF CRICKET EXCELLENCE", "bangalore", "Krishnarajapuram", 37],
  ["CC Turf Ram Nagar Hill Top", "nagpur", "Ram Nagar", 884],
  ["Ch. Mange Ram Box Cricket", "delhi", "Rohini", 23],
  ["S K Sports Arena", "delhi", "Dwarka", 12],
  ["The Royal Turf", "pune", "Kalewadi", 90],
];
const rows4 = r4.map(([name, city, area, total_reviews], i) => ({ id: `c${i}`, name, city, area, address: "", sports: [], total_reviews }) as unknown as Turf);
const closest = (q: string, city: string, found: string[] = []) =>
  closestNames(rows4, q, city as CityId, rows4.filter((t) => found.includes(t.name))).map((t) => t.name);

test("closest names share a distinctive word, best match first, at most three, never padded", () => {
  // "Den" is the word they share; the turf, cricket and sports around it don't count.
  assert.deepEqual(closest("Dribble Den", "hyderabad"), ["Cricket Den", "Sports Den", "Gamer's Den"]);
  assert.deepEqual(closest("Dribble Den", "pune"), ["Dribble Sports Club"]);
  assert.deepEqual(closest("Dribble Den", "nashik"), []);
  // A word ("Hotfut") makes a name close; two letters ("SB") alone never do when the name has a word.
  assert.deepEqual(closest("Hotfut SB Road", "hyderabad", ["Hotfut SB Road"]), ["HotFut Inorbit", "HotFut Gachibowli"]);
  // The area of the venue it was found at is where it is, not its name.
  assert.deepEqual(closest("CC Turf Ram Nagar Hill Top", "delhi", ["CC Turf Ram Nagar Hill Top"]), []);
  assert.deepEqual(closest("CC Turf Ram Nagar Hill Top", "delhi"), ["Ch. Mange Ram Box Cricket"]);
});

test("closest names: generic words alone never make a name close", () => {
  // Turf, multisport, sports, arena, cricket, box, a sport, "zone" and a city are all the overlap there is.
  assert.deepEqual(closest("Kage Multisport Turf", "mumbai"), []);
  assert.deepEqual(closest("Raptor Sports Zone", "mumbai"), []);
  assert.deepEqual(closest("Champions Zone Box Cricket", "mumbai"), []);
  assert.deepEqual(closest("Sports Zone", "hyderabad"), []);
  assert.deepEqual(closest("Mumbai Football Arena", "mumbai"), []);
  assert.deepEqual(closest("The Box Cricket Arena Turf", "hyderabad"), []);
  assert.deepEqual(closest("Football Turf", "mumbai"), []);
  assert.deepEqual(closest("Turf", "delhi"), []);
  // Half the name's distinctive words at least: one of three is another name. Common words only ("Royal", "Champions"): all of them.
  assert.deepEqual(closest("Royal Champions", "pune"), []);
  assert.deepEqual(closest("Royal Challengers Kings", "pune"), []);
});

test("closest names: a misspelling, run together or initials", () => {
  assert.deepEqual(closest("Dribbel Den", "pune"), ["Dribble Sports Club"]);
  assert.deepEqual(closest("Runbhoomi Multisport Turf", "pune"), ["Runbhumi The Multisports Turf"]);
  assert.deepEqual(closest("Maidan The Turf", "nashik"), ["Maidaan Multi Sports Turf"]);
  // "Prime" is spelt right and names other venues: Pride is another name, not a misspelling.
  assert.deepEqual(closest("Prime Turf", "bangalore"), []);
  assert.deepEqual(closest("Dribbleden", "bangalore"), ["Dribble Den"]);
  assert.deepEqual(closest("SK Turf", "delhi"), ["S K Sports Arena"]);
});

// Review of the closest names (28 Oct): rows as the turfs table has them.
const r5: [string, string, string | null, number][] = [
  ["Golden turf", "lucknow", "Aishbagh", 43],
  ["Golden Boot Turf", "mumbai", "Airoli", 226],
  ["Thunder turf", "nagercoil", "Suchindrum", 0],
  ["Thunderbird turf", "ajmer", "Kankarda Bhonabay", 79],
  ["Supernova Sports Arena", "pune", null, 397],
  ["Super Sports Park", "pune", null, 4],
  ["Greenbox", "pune", "Range Hills", 553],
  ["GreenBox Turf", "pune", "Shivajinagar", 199],
  ["High Score FC", "pune", "Kothrud", 847],
  ["Turf Up - Kharadi", "pune", "Kharadi", 1915],
  ["Champion Turf Club", "pune", "Manjari Budruk", 262],
  ["Free Kick Sports Arena", "bangalore", "Fraser Town", 520],
  ["Switch Hit Arena", "bangalore", "Nagavara", 9],
  ["HIT AND RUN", "bangalore", "Marsur", 7],
  ["Pro Legacy Sports Academy", "bangalore", "Banashankari", 422],
  ["GameOn Pro Sports Turf", "bangalore", "Kalkere", 357],
  ["Sportingo", "bangalore", "Rajarajeshwari Nagar", 831],
  ["TurfKlub Sporting Arena", "bangalore", "Rajarajeshwari Nagar", 34],
  ["El Classico Turf", "bangalore", "Electronic City", 76],
  ["Common Wealth Games Village Sports Complex", "delhi", "Pandav Nagar", 2696],
  ["Om Sunder Khel Arena", "delhi", "Janakpuri", 52],
  ["OFF SIDE TURF (OS)", "nashik", null, 68],
  ["Champion's Turf", "nashik", "Amrutdham", 60],
  ["Zeta Sports Arena", "kozhikode", "Mankavu", 284],
  ["Darbari Lal Sports Arena", "noida", "Zeta 1", 19],
  ["Dribble Den", "bangalore", "Begur", 22],
  ["Prime Turf", "mumbai", "Marol", 263],
];
const rows5 = r5.map(([name, city, area, total_reviews], i) => ({ id: `v${i}`, name, city, area, address: "", sports: [], total_reviews }) as unknown as Turf);
const at5 = (name: string) => rows5.find((t) => t.name === name)!;
const near5 = (q: string, city: string, opts: Parameters<typeof closestNames>[5] = {}) => closestNames(rows5, q, city as CityId, [], 3, opts).map((t) => t.name);

test("the whole name typed beats a venue in the player's city with only part of it; a city typed still decides", () => {
  assert.equal(where(resolveTurfNames(rows5, ["Golden turf"], ["mumbai"])[0].turf), "Golden turf (lucknow)");
  assert.equal(resolveTurfNames(rows5, ["Golden turf"], ["mumbai"])[0].whole, true);
  assert.equal(where(resolveTurfNames(rows5, ["Golden turf Mumbai"], ["pune"])[0].turf), "Golden Boot Turf (mumbai)");
  assert.equal(resolveTurfNames(rowsIndia, ["Kage"], ["mumbai"])[0].whole, false);
  // Misspelt, it is still the whole name.
  assert.equal(findNamedVenues(rowsIndia, "Dribbel Den")?.matches[0].whole, true);
  assert.equal(resolveTurfNames(rowsIndia, ["Dribbel Den"], ["pune"])[0].whole, true);
});

test("the name said back keeps its own small words; only the words around it go", () => {
  assert.equal(nameIn(rows5, "Balls Of Fury- Box cricket"), "Balls Of Fury- Box cricket");
  assert.equal(nameIn(rows5, "Kick it arena"), "Kick it arena");
  assert.equal(nameIn(rows5, "Lord of Turfs"), "Lord of Turfs");
  assert.equal(nameIn(rows5, "Box22 Drive in"), "Box22 Drive in");
  assert.equal(nameIn(rows5, "Score On"), "Score On");
  assert.equal(nameIn(rows5, "dribble den price"), "dribble den");
  assert.equal(nameIn(rows5, "number of Kage near me?"), "Kage");
  assert.equal(nameIn(rows5, "Hotfut in Navi Mumbai"), "Hotfut");
  assert.equal(findNamedVenues(rowsIndia, "Kage Turf broo")?.label, "Kage Turf");
  // Nothing left but the words around a name: said as typed, not "Its".
  assert.equal(nameIn(rows5, "Its prices"), "Its prices");
});

test("closest names: the same word or its plural, never the start of a longer one", () => {
  assert.ok(!near5("Super Cricket Box", "pune").includes("Supernova Sports Arena"));
  assert.deepEqual(near5("GREEN FIELD ARENA TURF", "pune"), []);
  assert.deepEqual(near5("Champions Arena", "nashik"), ["Champion's Turf"]);
  assert.deepEqual(near5("Champions Arena", "pune"), ["Champion Turf Club"]);
});

test("closest names: one common word shared (pro, hit, free, off, high, village, sporting) is another name", () => {
  assert.deepEqual(near5("Pro Turf Arena", "bangalore"), []);
  assert.deepEqual(near5("Free Hit Turf", "bangalore"), []);
  assert.deepEqual(near5("RAP hit and play Turf", "bangalore"), []);
  assert.deepEqual(near5("Kick Off Turf", "nashik"), []);
  assert.deepEqual(near5("Sky High Turf", "pune"), []);
  assert.deepEqual(near5("KAIRAV'S SPORTS VILLAGE", "delhi"), []);
  assert.deepEqual(near5("Impetus Sporting Punawale", "bangalore"), []);
});

test("closest names: one or two letters shared are not enough when the name has a word", () => {
  assert.deepEqual(near5("Level Up", "pune"), []);
  assert.deepEqual(near5("El-Dorado Turf", "bangalore"), []);
  assert.deepEqual(near5("Om Cricket Xperia", "delhi"), []);
});

test("closest names: venues the matcher took for the name come first, and filters and every word apply when asked", () => {
  const also = [at5("Golden Boot Turf")];
  assert.deepEqual(near5("Golden turf", "mumbai", { also }), ["Golden Boot Turf"]);
  // Thunderbird only starts with Thunder.
  assert.deepEqual(near5("Thunder turf", "ajmer", { also: [at5("Thunderbird turf")] }), []);
  // Every word, for a name no venue has: Den alone is not Dribble Den.
  assert.deepEqual(closestNames(rows4, "Dribble Den", "hyderabad" as CityId, [], 3, { every: true }).map((t) => t.name), []);
  assert.deepEqual(closestNames(rows4, "Dribble Zone", "pune" as CityId, [], 3, { every: true }).map((t) => t.name), ["Dribble Sports Club"]);
  assert.deepEqual(near5("Champions Arena", "pune", { keep: (t) => t.total_reviews > 500 }), []);
});

test("a name, not what a venue has: rooftop, astro turf, a cafe and snooker say what", () => {
  for (const q of ["rooftop turf", "rooftop", "astro turf", "turf with cafe", "snooker", "real grass turf for kids"]) assert.equal(namesWhich(rows5, q), q === "real grass turf for kids", q);
  for (const q of ["Kage", "Golden turf", "Champions Arena", "Dribble Den", "T & R"]) assert.equal(namesWhich(rows5, q), true, q);
  // On its own as a name: a few words, no number, no place after "near".
  for (const q of ["Dribble Zone Sports Arena", "Circuit", "Dribble Zone Turf"]) assert.equal(readsAsName(rows5, q), true, q);
  for (const q of ["turf for 14 players", "turf near metro station", "I know tapturf has a score tracker", "rooftop turf"]) assert.equal(readsAsName(rows5, q), false, q);
});

test("the player said where the venue is: an area word that is no venue's name word", () => {
  assert.equal(placedAt([at5("Dribble Den")], "Dribble Den in Begur"), true);
  assert.equal(placedAt([at5("Dribble Den")], "Dribble Den", ["Begur"]), true);
  assert.equal(placedAt([at5("Prime Turf")], "Prime Turf Marol"), true);
  assert.equal(placedAt([at5("Dribble Den")], "Dribble Den"), false);
  // Zeta is in Zeta Sports Arena's name, though Darbari Lal Sports Arena is in Zeta 1.
  assert.equal(placedAt([at5("Zeta Sports Arena"), at5("Darbari Lal Sports Arena")], "Zeta Sports Arena"), false);
});
