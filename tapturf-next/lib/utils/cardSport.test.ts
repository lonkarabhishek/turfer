import { test } from "node:test";
import assert from "node:assert/strict";
import { cardPrice, cardSports, labelRank, pricesAreForSport, sportLineParts, type CardSport } from "./cardSport";
import { summarisePrice } from "./prices";
import { SPORT_PAGES, sportBySlug, turfPlaysSport } from "../sports";
import type { Turf } from "../../types/turf";

// A list row as forCard() ships it: price columns null unless set.
const turf = (over: Partial<Turf> = {}): Turf =>
  ({
    id: "t1",
    name: "Venue",
    sports: ["Football"],
    morning_price: null,
    afternoon_price: null,
    evening_price: null,
    weekend_morning_price: null,
    weekend_afternoon_price: null,
    weekend_evening_price: null,
    price_mentions: null,
    price_unit: null,
    slot_minutes: null,
    ...over,
  }) as unknown as Turf;

const page = (slug: string): CardSport => ({ labels: sportBySlug(slug)!.labels });
const chip = (c: string): CardSport => ({ chip: c });
const NOT_LISTED = { label: "Prices not listed yet", kind: "unknown", min: null, max: null, unit: "/hr" };

test("unfiltered lists: the first two labels and summarisePrice, exactly as before", () => {
  const labels = ["Box Cricket", "Football", "Badminton"];
  assert.deepEqual(cardSports(labels), ["Box Cricket", "Football"]);
  assert.deepEqual(cardSports(labels, null), ["Box Cricket", "Football"]);
  assert.deepEqual(cardSports(["Football"]), ["Football"]);
  assert.deepEqual(cardSports([]), []);
  const t = turf({ sports: labels, morning_price: 800, evening_price: 1400 });
  assert.deepEqual(cardPrice(t), summarisePrice(t));
  assert.deepEqual(cardPrice(t, null), summarisePrice(t));
});

test("P1: the selected sport leads, then the two sports the card showed before", () => {
  // Sprintplay Sports Arena on /bangalore/badminton (29 Oct): read "Box Cricket, Football".
  assert.deepEqual(cardSports(["Box Cricket", "Football", "Badminton"], page("badminton")), ["Badminton", "Box Cricket", "Football"]);
  // Already first: unchanged.
  assert.deepEqual(cardSports(["Badminton", "Football"], page("badminton")), ["Badminton", "Football"]);
  // Second: moves to the front, and the next other sport keeps the card at three.
  assert.deepEqual(cardSports(["Football", "Badminton", "Box Cricket", "Cricket"], page("badminton")), ["Badminton", "Football", "Box Cricket"]);
  // Only sport.
  assert.deepEqual(cardSports(["Pickleball"], page("pickleball")), ["Pickleball"]);
  // Far down a long list.
  assert.deepEqual(
    cardSports(["Box Cricket", "Football", "Volleyball", "Handball", "Throwball", "Cricket Nets", "Pickleball"], page("pickleball")),
    ["Pickleball", "Box Cricket", "Football"],
  );
});

test("P1: every label of the page matches, the page's own label first", () => {
  // Football page lists Football and Futsal: Football leads whatever the stored order.
  assert.deepEqual(cardSports(["Box Cricket", "Futsal", "Football"], page("football")), ["Football", "Futsal", "Box Cricket"]);
  // A Futsal-only venue on /<city>/football shows Futsal (honest: that is what it lists).
  assert.deepEqual(cardSports(["Futsal", "Box Cricket"], page("football")), ["Futsal", "Box Cricket"]);
  // Tennis page: Lawn Tennis and Tennis; Table Tennis is another sport.
  assert.deepEqual(cardSports(["Table Tennis", "Lawn Tennis"], page("tennis")), ["Lawn Tennis", "Table Tennis"]);
  // Cricket page: nets count, box cricket does not.
  assert.deepEqual(cardSports(["Box Cricket", "Football", "Cricket Nets", "Cricket"], page("cricket")), ["Cricket", "Cricket Nets", "Box Cricket", "Football"]);
});

test("P1: chips match by substring, as the /turfs filter does; the chip's own label first", () => {
  assert.deepEqual(cardSports(["Box Cricket", "Football", "Badminton"], chip("Badminton")), ["Badminton", "Box Cricket", "Football"]);
  assert.deepEqual(cardSports(["Box Cricket", "Cricket Nets", "Cricket", "Football"], chip("Cricket")), ["Cricket", "Box Cricket", "Cricket Nets", "Football"]);
  // The Tennis chip lists table tennis venues (substring): the card says so.
  assert.deepEqual(cardSports(["Football", "Table Tennis"], chip("Tennis")), ["Table Tennis", "Football"]);
  assert.deepEqual(cardSports(["Box Cricket"], chip("box cricket")), ["Box Cricket"]);
});

test("P1: no sport is dropped from what the card showed, none repeats, blanks are skipped", () => {
  for (const sp of SPORT_PAGES) {
    const labels = ["Box Cricket", "Football", ...sp.labels.slice(0, 1), "Volleyball"];
    const out = cardSports(labels, { labels: sp.labels });
    assert.equal(out[0], sp.labels[0], sp.slug);
    for (const before of cardSports(labels)) assert.ok(out.includes(before), `${sp.slug} dropped ${before}`);
    assert.equal(new Set(out.map((l) => l.toLowerCase())).size, out.length, sp.slug);
  }
  assert.deepEqual(cardSports(["Badminton", "badminton ", "", "Football"], page("badminton")), ["Badminton", "Football"]);
  // Nothing matches (not a qualifying card): as before.
  assert.deepEqual(cardSports(["Box Cricket", "Football", "Cricket"], page("badminton")), ["Box Cricket", "Football"]);
});

test("sportLineParts: joined, the line reads place · distance · sports · hours; the lead ends with the selected sport", () => {
  const D = "2.1 km away";
  const H = "Open 24 hours";
  const S = ["Badminton", "Box Cricket", "Football"];
  for (const place of ["Hosakerehalli", "", null]) {
    for (const distance of [D, null]) {
      for (const sports of [S, ["Badminton"], []]) {
        for (const hours of [H, null]) {
          const p = sportLineParts(place, { distance, sports, hours });
          const want = [place, distance, sports.join(", ") || null, hours].filter(Boolean).join(" · ");
          assert.equal(p.place + p.lead + p.tail, want, JSON.stringify({ place, distance, sports, hours }));
          assert.equal(p.place, place ?? "");
          // The lead carries the first sport, never anything after it.
          if (sports.length) assert.ok(p.lead.endsWith(sports[0]), p.lead);
          if (distance) assert.ok(p.lead.includes(distance));
          assert.ok(!p.tail.includes("Badminton"));
        }
      }
    }
  }
  assert.deepEqual(sportLineParts("Hosakerehalli", { distance: null, sports: S, hours: H }), {
    place: "Hosakerehalli",
    lead: " · Badminton",
    tail: ", Box Cricket, Football · Open 24 hours",
  });
  assert.deepEqual(sportLineParts(null, { distance: D, sports: ["Pickleball"], hours: null }), { place: "", lead: "2.1 km away · Pickleball", tail: "" });
  assert.deepEqual(sportLineParts("Baner", { distance: null, sports: [], hours: H }), { place: "Baner", lead: "", tail: " · Open 24 hours" });
  // Blank labels never leave an empty slot.
  assert.deepEqual(sportLineParts("Baner", { distance: null, sports: [" ", "Tennis"], hours: null }), { place: "Baner", lead: " · Tennis", tail: "" });
});

test("labelRank agrees with turfPlaysSport for every sport page", () => {
  const all = ["Football", "Futsal", "Box Cricket", "Cricket", "Cricket Nets", "Indoor Cricket Net", "Bowling Machine", "Badminton", "Pickleball", "Volleyball", "Beach Volleyball", "Basketball", "Tennis", "Lawn Tennis", "Table Tennis", "Padel", "Ultimate Frisbee", "Swimming", " badminton "];
  for (const sp of SPORT_PAGES) {
    for (const l of all) assert.equal(labelRank(l, { labels: sp.labels }) != null, turfPlaysSport([l], sp), `${sp.slug} / ${l}`);
  }
  assert.equal(labelRank("", page("football")), null);
  assert.equal(labelRank("Football", chip("")), null);
  assert.equal(labelRank("Beach Volleyball", chip("Volleyball")), 1);
  assert.equal(labelRank("Volleyball", chip("Volleyball")), 0);
});

test("P2: a venue that lists only the selected sport keeps its price, unchanged", () => {
  const solo = turf({ sports: ["Badminton"], morning_price: 400, evening_price: 600, price_unit: "per_hour" });
  assert.deepEqual(cardPrice(solo, page("badminton")), summarisePrice(solo));
  assert.equal(cardPrice(solo, page("badminton")).kind, "real");
  // Football + Futsal are both the football page's sport.
  const fut = turf({ sports: ["Futsal", "Football"], morning_price: 900, evening_price: 1200 });
  assert.deepEqual(cardPrice(fut, page("football")), summarisePrice(fut));
  // Tennis + Lawn Tennis on the tennis page.
  const ten = turf({ sports: ["Lawn Tennis", "Tennis"], morning_price: 900 });
  assert.deepEqual(cardPrice(ten, page("tennis")), summarisePrice(ten));
  // Reported numbers and notes at a one-sport venue are that sport's too.
  const rep = turf({ sports: ["Football"], price_mentions: [{ price_inr: 900 }] });
  assert.equal(cardPrice(rep, page("football")).kind, "reported");
  const note = turf({ sports: ["Football"], price_mentions: [{ text: "Rates at the gate" }] });
  assert.equal(cardPrice(note, page("football")).kind, "reported_text");
});

test("P2: a multi-sport venue's untagged price never shows as the selected sport's", () => {
  // Sprintplay Sports Arena: ₹800–1,400 is its 6-a-side and large box cricket rate.
  const sprint = turf({ sports: ["Box Cricket", "Football", "Badminton"], morning_price: 800, evening_price: 1400, price_unit: "per_hour" });
  assert.deepEqual(cardPrice(sprint, page("badminton")), NOT_LISTED);
  // On the football and box cricket pages too: the slot columns name no sport.
  assert.deepEqual(cardPrice(sprint, page("football")), NOT_LISTED);
  assert.deepEqual(cardPrice(sprint, page("box-cricket")), NOT_LISTED);
  // Reported numbers and notes at a multi-sport venue: the same.
  const rep = turf({ sports: ["Football", "Box Cricket"], price_mentions: [{ price_inr: 900 }] });
  assert.deepEqual(cardPrice(rep, page("football")), NOT_LISTED);
  const note = turf({ sports: ["Pickleball", "Badminton"], price_mentions: [{ text: "Court ₹400" }] });
  assert.deepEqual(cardPrice(note, page("pickleball")), NOT_LISTED);
  // Nothing listed stays as it was.
  const none = turf({ sports: ["Badminton", "Football"] });
  assert.deepEqual(cardPrice(none, page("badminton")), summarisePrice(none));
});

test("P2: the unit follows the venue, so a hidden price never changes another card's wording", () => {
  const slot = turf({ sports: ["Pickleball", "Football"], morning_price: 600, price_unit: "per_slot", slot_minutes: 90 });
  assert.equal(cardPrice(slot, page("pickleball")).unit, "/90-min slot");
  assert.equal(cardPrice(slot, page("pickleball")).label, "Prices not listed yet");
});

test("P2: chips use their own filter: every label must contain the chip", () => {
  const nets = turf({ sports: ["Cricket Nets", "Box Cricket"], morning_price: 500 });
  assert.equal(cardPrice(nets, chip("Cricket")).kind, "real");
  assert.deepEqual(cardPrice(nets, chip("Box Cricket")), NOT_LISTED);
  const both = turf({ sports: ["Box Cricket", "Football"], morning_price: 1000 });
  assert.deepEqual(cardPrice(both, chip("Cricket")), NOT_LISTED);
  assert.deepEqual(cardPrice(both, chip("Football")), NOT_LISTED);
  const solo = turf({ sports: ["Football"], morning_price: 1000 });
  assert.equal(cardPrice(solo, chip("Football")).kind, "real");
});

test("pricesAreForSport: needs at least one listed sport, ignores blanks", () => {
  assert.equal(pricesAreForSport([], page("badminton")), false);
  assert.equal(pricesAreForSport(["", " "], page("badminton")), false);
  assert.equal(pricesAreForSport(["Badminton", " "], page("badminton")), true);
  assert.equal(pricesAreForSport(["badminton"], page("badminton")), true);
  assert.equal(pricesAreForSport(["Badminton", "Squash"], page("badminton")), false);
});
