import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turf } from "../../types/turf";
import {
  FACETS,
  allDay,
  decodeWeek,
  encodeWeek,
  extraFactsOf,
  facetBit,
  facetMask,
  filterFactsOf,
  hourlyPrice,
  istParam,
  istTime,
  maskOf,
  openAt,
  parseIst,
  surfaceKind,
  type Facet,
} from "./facts";

const has = (m: number, f: Facet) => (m & facetBit(f)) !== 0;
const facetsOf = (m: number) => FACETS.filter((f) => has(m, f));

test("surface: the free text as a kind, ambiguous or unknown text as none", () => {
  assert.equal(surfaceKind("artificial turf"), "artificial");
  assert.equal(surfaceKind("Artificial Grass (rubber infill)"), "artificial");
  assert.equal(surfaceKind("synthetic turf (reviewer: 50mm dual-tone yarn)"), "artificial");
  assert.equal(surfaceKind("artificial turf / astroturf (indoor nets)"), "artificial");
  assert.equal(surfaceKind("natural grass"), "natural");
  assert.equal(surfaceKind("Grass"), "natural");
  assert.equal(surfaceKind("wooden"), "wooden");
  assert.equal(surfaceKind("cement"), "hard");
  assert.equal(surfaceKind("clay"), "clay");
  // "Synthetic" alone is a turf on one ground and a mat on another.
  assert.equal(surfaceKind("synthetic"), null);
  assert.equal(surfaceKind(""), null);
  assert.equal(surfaceKind(null), null);
});

test("hours: encoded as the turf page reads them, and back", () => {
  // Every day the same: one day's text.
  assert.equal(encodeWeek({ daily: "6 AM–11 PM" }), "360-1380");
  assert.deepEqual(decodeWeek("360-1380"), Array(7).fill([[360, 1380]]));
  // "Open 24 hours" and "12 AM–12 AM" are the whole day.
  assert.equal(encodeWeek({ daily: "Open 24 hours" }), "0-1440");
  assert.equal(encodeWeek({ daily: "12 AM–12 AM" }), "0-1440");
  // Closes at midnight: the end of the day.
  assert.equal(encodeWeek({ daily: "6 AM–12 AM" }), "360-1440");
  // Past midnight: closes after it opens the next day.
  assert.equal(encodeWeek({ daily: "6 AM–1 AM" }), "360-60");
  // Per day, lower-case keys (most rows), a closed day, two spans, a day missing (not known).
  const week = encodeWeek({ monday: "Closed", tuesday: "6–8 AM 4 PM–12 AM", wednesday: "6 AM–10 PM", thursday: "6 AM–10 PM", friday: "6 AM–10 PM", saturday: "5 AM–1 AM" } as never);
  assert.equal(week, "x|360-480,960-1440|360-1320|360-1320|360-1320|300-60|");
  const back = decodeWeek(week)!;
  assert.deepEqual(back[0], []);
  assert.deepEqual(back[1], [[360, 480], [960, 1440]]);
  assert.equal(back[6], null);
  // Hours that are there but do not parse: known to be listed, no times (the row's start and end do not count).
  assert.equal(encodeWeek({ daily: "Call to ask" }), "");
  assert.equal(decodeWeek(""), null);
  // A whole week stored under a day: that day is not known.
  assert.equal(encodeWeek({ monday: "Mon–Fri: 5 AM–11 PM, Sat & Sun: 5 AM–1 AM", tuesday: "6 AM–11 PM" } as never), "|360-1380|||||");
  // No hours.
  assert.equal(encodeWeek(null), null);
  assert.equal(encodeWeek({} as never), null);
  assert.equal(decodeWeek("1-2|3-4"), null);
  assert.equal(decodeWeek("abc"), null);
});

test("open now: a span of the day, or yesterday's past midnight; unknown days are not open", () => {
  const mon = (minute: number) => ({ day: 0, minute });
  const tue = (minute: number) => ({ day: 1, minute });
  const daily = decodeWeek("360-1380");
  assert.equal(openAt(daily, mon(359)), false);
  assert.equal(openAt(daily, mon(360)), true);
  assert.equal(openAt(daily, mon(1379)), true);
  assert.equal(openAt(daily, mon(1380)), false);
  const late = decodeWeek("360-60");
  assert.equal(openAt(late, tue(30)), true, "Monday's hours run into Tuesday");
  assert.equal(openAt(late, tue(60)), false);
  assert.equal(openAt(late, tue(1430)), true);
  const midnight = decodeWeek("360-1440");
  assert.equal(openAt(midnight, mon(1425)), true);
  assert.equal(openAt(midnight, tue(0)), false);
  const closedMonday = decodeWeek("x|360-1380|360-1380|360-1380|360-1380|360-1380|360-1380");
  assert.equal(openAt(closedMonday, mon(600)), false);
  assert.equal(openAt(closedMonday, tue(600)), true);
  // Sunday's late hours run into Monday.
  assert.equal(openAt(decodeWeek("||||||300-60"), mon(30)), true);
  assert.equal(openAt(decodeWeek("|360-1380|||||"), mon(600)), false, "Monday not known");
  assert.equal(openAt(null, mon(600)), false);
  assert.equal(allDay(decodeWeek("0-1440")), true);
  assert.equal(allDay(decodeWeek("0-1440|0-1440|0-1440|0-1440|0-1440|0-1440|")), false);
  assert.equal(allDay(null), false);
});

test("India time: the day and minute in Asia/Kolkata, rounded down to 15 minutes", () => {
  // 04:44 UTC on Monday 2 Nov 2026 is 10:14 in India.
  assert.deepEqual(istTime(new Date("2026-11-02T04:44:00Z")), { day: 0, minute: 600 });
  // 18:40 UTC on Tuesday is 00:10 on Wednesday in India.
  assert.deepEqual(istTime(new Date("2026-11-03T18:40:00Z")), { day: 2, minute: 0 });
  // 18:29 UTC on Sunday 8 Nov is 23:59 on Sunday.
  assert.deepEqual(istTime(new Date("2026-11-08T18:29:59Z")), { day: 6, minute: 1425 });
  assert.equal(istParam({ day: 2, minute: 1305 }), "2.1305");
  assert.deepEqual(parseIst("2.1305"), { day: 2, minute: 1305 });
  assert.deepEqual(parseIst("0.0"), { day: 0, minute: 0 });
  for (const bad of ["7.0", "1.1440", "1.7", "1", "a.b", "1.15.0", "", null]) assert.equal(parseIst(bad), null, String(bad));
});

const row = (p: Record<string, unknown> = {}) => ({ amenities: [], ...p });

test("facts: a turf has a facility when its column or its amenities say so", () => {
  assert.deepEqual(facetsOf(filterFactsOf(row(), null).m), []);
  const cols = filterFactsOf(row({ has_floodlights: true, is_covered: true, parking_available: true, washroom_available: true, changing_room_available: true, equipment_provided: true }), null);
  assert.deepEqual(facetsOf(cols.m), ["lights", "covered", "parking", "washroom", "changing", "equipment"]);
  // The words the data team used (3 Nov), any case.
  const words = filterFactsOf(row({ amenities: ["Flood Lights", "Ample Parking", "Restroom", "Changing Rooms", "Rental Equipment"] }), null);
  assert.deepEqual(facetsOf(words.m), ["lights", "parking", "washroom", "changing", "equipment"]);
  assert.deepEqual(facetsOf(filterFactsOf(row({ amenities: ["floodlights", "parking", "Washrooms", "Toilet", "equipment"] }), null).m), ["lights", "parking", "washroom", "equipment"]);
  // Either saying yes is enough; a column's false does not undo the amenity.
  assert.ok(has(filterFactsOf(row({ has_floodlights: false, amenities: ["Floodlights"] }), null).m, "lights"));
  // Words that are not the facility.
  assert.deepEqual(facetsOf(filterFactsOf(row({ amenities: ["Lights", "Drinking Water", "Shower", "Indoor", "Cafeteria"] }), null).m), []);
  // Covered only from the column (the amenities never say it); coaching only from the extras.
  assert.ok(!has(filterFactsOf(row({ is_covered: false }), null).m, "covered"));
  assert.ok(!has(filterFactsOf(row({ is_covered: null }), null).m, "covered"));
  assert.ok(has(filterFactsOf(row(), { c: 1 }).m, "coaching"));
  assert.equal(filterFactsOf(row(), { s: "natural" }).surface, "natural");
  // A malformed amenities value is no amenities.
  assert.deepEqual(facetsOf(filterFactsOf(row({ amenities: "Parking" }), null).m), []);
});

test("facts: hours as the turf page reads them (24x7 first, then researched hours, then start and end)", () => {
  const at = (day: number, minute: number) => ({ day, minute });
  const h24 = filterFactsOf(row({ is_24x7: true, start_time: "06:00:00", end_time: "22:00:00" }), { oh: "360-1320" });
  assert.ok(has(h24.m, "24h"));
  assert.ok(openAt(h24.week, at(3, 180)));
  // Researched hours win over the row's start and end.
  const researched = filterFactsOf(row({ start_time: "06:00:00", end_time: "23:00:00" }), { oh: "420-1260" });
  assert.equal(openAt(researched.week, at(0, 390)), false);
  assert.equal(openAt(researched.week, at(0, 450)), true);
  // Without researched hours: start and end, every day.
  const own = filterFactsOf(row({ start_time: "06:00:00", end_time: "01:00:00" }), null);
  assert.equal(openAt(own.week, at(4, 30)), true);
  assert.equal(openAt(own.week, at(4, 120)), false);
  // 00:00 to 23:59 with no flag is the column default, not "open all day".
  const dflt = filterFactsOf(row({ start_time: "00:00:00", end_time: "23:59:00" }), null);
  assert.equal(dflt.week, null);
  assert.ok(!has(dflt.m, "24h"));
  // Researched "Open 24 hours" every day counts as 24 hours.
  assert.ok(has(filterFactsOf(row(), { oh: "0-1440" }).m, "24h"));
  // Researched hours that do not parse: no times, and the start and end do not count either.
  assert.equal(filterFactsOf(row({ start_time: "06:00:00", end_time: "23:00:00" }), { oh: "" }).week, null);
});

test("facts: rated and open are worked out per query", () => {
  const f = filterFactsOf(row(), { oh: "360-1380" });
  const t = { rating: 4.5, total_reviews: 12 };
  assert.deepEqual(facetsOf(facetMask(t, f, { day: 0, minute: 600 })), ["open", "rated"]);
  assert.deepEqual(facetsOf(facetMask(t, f, { day: 0, minute: 60 })), ["rated"]);
  assert.deepEqual(facetsOf(facetMask(t, f, null)), ["rated"], "no time, no open");
  assert.deepEqual(facetsOf(facetMask({ rating: 4.4, total_reviews: 900 }, f, null)), []);
  assert.deepEqual(facetsOf(facetMask({ rating: 5, total_reviews: 0 }, f, null)), [], "a rating with no reviews is no rating");
  assert.deepEqual(facetsOf(facetMask(t, undefined, { day: 0, minute: 600 })), ["rated"], "no facts: nothing but the rating");
  assert.equal(maskOf(["open", "rated"]), facetBit("open") | facetBit("rated"));
  assert.equal(maskOf([]), 0);
});

test("extras: only what a row has, compact", () => {
  assert.equal(extraFactsOf({ opening_hours: null, coaching_available: null, surface_type: null }), null);
  assert.deepEqual(extraFactsOf({ opening_hours: { daily: "6 AM–11 PM" }, coaching_available: true, surface_type: "natural grass" }), { oh: "360-1380", c: 1, s: "natural" });
  assert.deepEqual(extraFactsOf({ opening_hours: { daily: "ask" }, coaching_available: false, surface_type: "synthetic" }), { oh: "" });
});

const turf = (p: Partial<Turf>): Turf => ({ id: "t", name: "T", address: "", sports: ["Football"], rating: 4, total_reviews: 10, ...p }) as Turf;

test("price per hour: the card's price rule, per hour", () => {
  assert.equal(hourlyPrice(turf({ morning_price: 800, evening_price: 1200 }), null), 800);
  assert.equal(hourlyPrice(turf({ morning_price: 800, price_unit: "per_hour" }), null), 800);
  // A 90-minute slot at ₹1,200 is ₹800 an hour.
  assert.equal(hourlyPrice(turf({ morning_price: 1200, price_unit: "per_slot", slot_minutes: 90 }), null), 800);
  assert.equal(hourlyPrice(turf({ morning_price: 1200, price_unit: "per_slot", slot_minutes: null }), null), null);
  assert.equal(hourlyPrice(turf({ morning_price: 200, price_unit: "per_person" }), null), null);
  // Only a reported price, or none: not under any cap.
  assert.equal(hourlyPrice(turf({ price_mentions: [{ price_inr: 700 }] }), null), null);
  assert.equal(hourlyPrice(turf({}), null), null);
  // With a chip, the card's price for that sport: the bands' range for it, or none when its price is another sport's.
  const venue = turf({ sports: ["Football", "Box Cricket"], morning_price: 1500, sport_bands: { "box-cricket": [900, 1100] } });
  assert.equal(hourlyPrice(venue, { chip: "Box Cricket" }), 900);
  assert.equal(hourlyPrice(turf({ sports: ["Football", "Badminton"], morning_price: 1500, sport_bands: { football: [1500, 1500] } }), { chip: "Badminton" }), null);
});
