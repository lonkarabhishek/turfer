import { test } from "node:test";
import assert from "node:assert/strict";
import { haversineKm } from "../utils/location";
import { asksPrice, compareTable, dayType, hostPreview, hostVenueWords, hoursLine, MAP_ASPECT, priceChart, resultsMap, saysHere, visualsFor, type Reading } from "./cards";
import { visualsToDraw } from "./visuals";
import type { Turf } from "../../types/turf";

// Rows shaped like production's (30 Oct 2026, Pune and Bangalore). Every
// phone number here is made up (90000 00xxx).

function turf(over: Partial<Turf> = {}): Turf {
  return {
    id: "t1",
    slug: "the-turf-ground-kothrud",
    name: "The Turf Ground",
    city: "pune",
    area: "Kothrud",
    address: "Kothrud, Pune",
    sports: ["Football", "Box Cricket"],
    amenities: [],
    images: [],
    rating: 4.6,
    total_reviews: 437,
    lat: 18.50217,
    lng: 73.79356,
    morning_price: 1200,
    afternoon_price: 1200,
    evening_price: 1200,
    weekend_morning_price: null,
    weekend_afternoon_price: null,
    weekend_evening_price: null,
    price_mentions: null,
    price_unit: "per_hour",
    slot_minutes: null,
    start_time: "06:00:00",
    end_time: "02:00:00",
    opening_hours: { daily: "6 AM–2 AM" },
    is_24x7: null,
    has_floodlights: true,
    is_covered: null,
    parking_available: true,
    washroom_available: true,
    changing_room_available: false,
    has_cafeteria: true,
    equipment_provided: false,
    claimed: false,
    owner_phone: "9000000017",
    contact_info: null,
    landline_phone: null,
    whatsapp_phone: null,
    membership_required: null,
    pricing_bands: null,
    price_owner_confirmed: null,
    ...over,
  } as unknown as Turf;
}

const reading = (over: Partial<Reading> = {}): Reading => ({
  intent: "find_turf",
  sport: null,
  time: null,
  when: null,
  sort: "rating",
  max_price_per_hour: null,
  wants_nearby: false,
  ...over,
});

// Friday 30 Oct 2026, 6 pm in India.
const FRIDAY = new Date("2026-10-30T12:30:00Z");

// ── Which pictures ─────────────────────────────────────────────────

test("the reading picks the pictures: price or time asked, a map that fits, compare, host", () => {
  // A plain search with no map: nothing new, as before.
  assert.deepEqual(visualsFor(reading(), { priced: 5, map: false }), []);
  // Price or a time asked, two priced: the chart.
  for (const r of [reading({ time: "evening" }), reading({ sort: "price_low" }), reading({ max_price_per_hour: 500 })]) {
    assert.ok(asksPrice(r));
    assert.deepEqual(visualsFor(r, { priced: 2, map: false }), ["prices"]);
  }
  // One bar is no chart.
  assert.deepEqual(visualsFor(reading({ time: "evening" }), { priced: 1, map: false }), []);
  // Not asked about price: no chart, however many are priced.
  assert.ok(!asksPrice(reading({ wants_nearby: true, sort: "nearby" })));
  // Both, price first; nearest-first puts the map first.
  assert.deepEqual(visualsFor(reading({ sort: "price_low" }), { priced: 4, map: true }), ["prices", "map"]);
  assert.deepEqual(visualsFor(reading({ sort: "nearby", time: "evening" }), { priced: 4, map: true }), ["map", "prices"]);
  // Venues a name found, or headed rows of closest names: none.
  assert.deepEqual(visualsFor(reading({ time: "evening" }), { priced: 3, map: true, named: true }), []);
  assert.deepEqual(visualsFor(reading({ time: "evening" }), { priced: 3, map: true, headed: true }), []);
  // Compare once two are found; hosting always; games and the rest as before.
  assert.deepEqual(visualsFor(reading({ intent: "compare" }), { compared: 2 }), ["compare"]);
  assert.deepEqual(visualsFor(reading({ intent: "compare" }), { compared: 1 }), []);
  assert.deepEqual(visualsFor(reading({ intent: "create_game" }), {}), ["host"]);
  for (const intent of ["find_game", "question", "tool", "other"]) assert.deepEqual(visualsFor(reading({ intent, time: "evening" }), { priced: 5, map: true, compared: 2 }), [], intent);
});

test("weekend rates for the weekend, and for today or tomorrow when that is a Saturday or Sunday in India", () => {
  assert.equal(dayType("weekend", FRIDAY), "weekend");
  assert.equal(dayType("today", FRIDAY), "weekday");
  assert.equal(dayType("tomorrow", FRIDAY), "weekend");
  // Saturday 31 Oct, 1 am in India (still Friday in UTC).
  const saturday = new Date("2026-10-30T19:45:00Z");
  assert.equal(dayType("today", saturday), "weekend");
  assert.equal(dayType("tomorrow", saturday), "weekend");
  assert.equal(dayType("this_week", saturday), "weekday");
  assert.equal(dayType(null, saturday), "weekday");
});

// ── Price by time ──────────────────────────────────────────────────

const powerplay = turf({ id: "pp", name: "Powerplay Park", area: null, sports: ["Football", "Box Cricket", "Basketball", "Badminton"], morning_price: 350, afternoon_price: 350, evening_price: 350 });
const hotfut = turf({ id: "hf", name: "Hotfut SB Road", sports: ["Box Cricket", "Football", "Badminton"], morning_price: 550, afternoon_price: 550, evening_price: 550 });
const gymkhana = turf({
  id: "hg",
  name: "Hindu Gymkhana Kothrud",
  sports: ["Box Cricket", "Football", "Cricket Nets", "Pickleball"],
  morning_price: 800,
  afternoon_price: 800,
  evening_price: 1200,
  weekend_morning_price: 1100,
  weekend_afternoon_price: 1100,
  weekend_evening_price: 1500,
});
const paddock = turf({ id: "pd", name: "The Paddock Turf", morning_price: 1499, afternoon_price: 1499, evening_price: 1999, weekend_evening_price: 1999 });
const unpriced = turf({ id: "sc", name: "Score Bengaluru Sports Park", morning_price: null, afternoon_price: null, evening_price: null });
const reported = turf({ id: "rp", name: "Reported Arena", morning_price: null, afternoon_price: null, evening_price: null, price_mentions: [{ price_inr: 900 }] });

test("the evening chart: each venue's weekday evening rate, cheapest first, the rest named under it", () => {
  const c = priceChart([gymkhana, paddock, powerplay, unpriced, hotfut, reported], reading({ sport: "football", time: "evening", when: "today" }), FRIDAY);
  assert.equal(c.title, "Evening rate per hour, weekdays");
  assert.equal(c.note, "Football, cheapest first");
  assert.deepEqual(
    c.bars.map((b) => [b.id, b.value, b.display]),
    [
      ["pp", 350, "₹350"],
      ["hf", 550, "₹550"],
      ["hg", 1200, "₹1,200"],
      ["pd", 1999, "₹1,999"],
    ],
  );
  // What the card says instead, never a number of ours.
  assert.deepEqual(c.off, [
    { id: "sc", why: "Prices not listed yet" },
    { id: "rp", why: "~₹900/hr (reported)" },
  ]);
  // Saturday: the weekend column; a venue that lists no weekend evening rate is named, not charted at its weekday one.
  const sat = priceChart([gymkhana, paddock, powerplay], reading({ sport: "football", time: "evening", when: "weekend" }), FRIDAY);
  assert.equal(sat.title, "Evening rate per hour, weekends");
  assert.deepEqual(sat.bars.map((b) => [b.id, b.value]), [["hg", 1500], ["pd", 1999]]);
  assert.deepEqual(sat.off, [{ id: "pp", why: "No evening rate listed (₹350/hr)" }]);
  // Ties keep the cards' order.
  const tie = priceChart([turf({ id: "a", evening_price: 900 }), turf({ id: "b", evening_price: 900 })], reading({ time: "evening" }), FRIDAY);
  assert.deepEqual(tie.bars.map((b) => b.id), ["a", "b"]);
});

test("a court sport never charts another sport's rate: the card rule decides", () => {
  // Bangalore, 30 Oct: every badminton venue near Koramangala also lists turf sports, and no band names badminton.
  const dee = turf({ id: "dee", name: "DEE SPORTS HONGASANDRA", sports: ["Box Cricket", "Football", "Badminton", "Swimming"], evening_price: 1300 });
  const courts = turf({ id: "bc", name: "Shuttle Courts", sports: ["Badminton"], evening_price: 450 });
  const c = priceChart([dee, courts, unpriced], reading({ sport: "badminton", time: "evening", max_price_per_hour: 500 }), FRIDAY);
  assert.deepEqual(c.bars.map((b) => [b.id, b.value]), [["bc", 450]]);
  assert.deepEqual(c.off, [
    { id: "dee", why: "No badminton rate listed" },
    { id: "sc", why: "Prices not listed yet" },
  ]);
  assert.equal(c.note, "Badminton, cheapest first · your budget ₹500");
  // Football at a venue whose bands give football another range than its slot columns: the band range, at no time.
  const banded = turf({
    id: "bd",
    sports: ["Box Cricket", "Football"],
    morning_price: 600,
    evening_price: 700,
    sport_bands: { football: [1300, 1400], "box-cricket": [600, 700] },
  });
  const f = priceChart([banded], reading({ sport: "football", time: "evening" }), FRIDAY);
  assert.deepEqual(f.bars, []);
  assert.deepEqual(f.off, [{ id: "bd", why: "No evening rate listed (₹1300 – ₹1400/hr)" }]);
  // With no time asked, the band range's low end is the sport's lowest listed rate.
  const low = priceChart([banded, hotfut], reading({ sport: "football", sort: "price_low" }), FRIDAY);
  assert.equal(low.title, "Lowest listed rate per hour");
  assert.deepEqual(low.bars.map((b) => [b.id, b.display]), [["hf", "₹550"], ["bd", "from ₹1,300"]]);
});

test("late night and no time read the card's own lowest rate; a rate per slot is never charted beside per-hour ones", () => {
  const late = priceChart([gymkhana, powerplay], reading({ time: "late_night" }), FRIDAY);
  assert.equal(late.title, "Lowest listed rate per hour");
  assert.match(late.note, /no late-night rates are listed/);
  assert.deepEqual(late.bars.map((b) => [b.id, b.display]), [["pp", "₹350"], ["hg", "from ₹800"]]);
  const slot = turf({ id: "sl", price_unit: "per_slot", slot_minutes: 90, morning_price: null, afternoon_price: null, evening_price: 1500 });
  const c = priceChart([slot, powerplay], reading({ time: "evening" }), FRIDAY);
  assert.deepEqual(c.off, [{ id: "sl", why: "₹1500/90-min slot" }]);
});

// ── Map ────────────────────────────────────────────────────────────

const place = (id: string, lat: number, lng: number, area: string | null) => ({ id, lat, lng, area });
// Real Pune positions (30 Oct).
const PUNE = [
  place("gymkhana", 18.51019, 73.80194, "Kothrud"),
  place("paddock", 18.51204, 73.82507, "Erandwane"),
  place("wakad", 18.59682, 73.77551, "Wakad"),
  place("sus", 18.54686, 73.75072, "Sus"),
];
const BANER = { lat: 18.559, lng: 73.7868 };

test("the map: every shown venue placed to scale, numbered as its card, in the frame", () => {
  const m = resultsMap([PUNE[0], { id: "nowhere", lat: null, lng: null, area: "Baner" }, ...PUNE.slice(1)], null);
  assert.ok(m);
  assert.deepEqual(m.pins.map((p) => [p.id, p.n]), [["gymkhana", 1], ["paddock", 3], ["wakad", 4], ["sus", 5]]);
  assert.equal(m.left, 1);
  assert.equal(m.me, null);
  for (const p of m.pins) assert.ok(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1, `${p.id} in the frame`);
  // North up, east right: Wakad is north of Kothrud, Erandwane east of it.
  const at = Object.fromEntries(m.pins.map((p) => [p.id, p]));
  assert.ok(at.wakad.y < at.gymkhana.y);
  assert.ok(at.paddock.x > at.gymkhana.x);
  // Honest distances: the frame's ratio of two distances is the ground's.
  const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, (a.y - b.y) / MAP_ASPECT);
  const ground = haversineKm(PUNE[0], PUNE[2]) / haversineKm(PUNE[0], PUNE[3]);
  assert.ok(Math.abs(d(at.gymkhana, at.wakad) / d(at.gymkhana, at.sus) - ground) < 0.03, "to scale");
  // The scale bar is a round distance, its length true to the frame.
  assert.ok([0.5, 1, 2, 5, 10].includes(m.scale.km));
  const across = haversineKm(PUNE[0], PUNE[2]) / d(at.gymkhana, at.wakad);
  assert.ok(Math.abs(m.scale.w * across - m.scale.km) < 0.05 * m.scale.km);
  assert.ok(m.scale.w <= 1 / 3);
  // Each area named once, where it fits.
  assert.ok(m.areas.length >= 2);
  assert.equal(new Set(m.areas.map((a) => a.name)).size, m.areas.length);
});

test("no map when it says nothing: one area, one venue, or venues in two cities, unless the visitor's place is known", () => {
  const kothrud = [place("a", 18.51019, 73.80194, "Kothrud"), place("b", 18.50348, 73.79515, "Kothrud"), place("c", 18.50197, 73.7928, "Kothrud")];
  assert.equal(resultsMap(kothrud, null), null);
  assert.equal(resultsMap([PUNE[0]], null), null);
  const twoCities = [...PUNE, place("dee", 12.89744, 77.62199, "Hongasandra")];
  assert.equal(resultsMap(twoCities, null), null);
  // Near me: the visitor's dot and the venues near them; the one in Bangalore stays off.
  const near = resultsMap(twoCities, BANER);
  assert.ok(near?.me);
  assert.equal(near.pins.length, 4);
  assert.equal(near.left, 1);
  // One area is enough with the dot.
  assert.ok(resultsMap(kothrud, BANER)?.me);
  // A location far from every venue: drawn without the dot, by the usual rules.
  const far = resultsMap(PUNE, { lat: 28.61, lng: 77.21 });
  assert.equal(far?.me, null);
  assert.equal(far?.pins.length, 4);
});

test("the scale bar sits in a corner no pin covers, and no area name sits on it", () => {
  // Bangalore badminton venues (30 Oct): Arekere is the south-west corner of the map.
  const blr = [
    place("dhi", 12.88592, 77.60003, "Arekere"),
    place("smash", 12.88975, 77.65249, "VGP Layout"),
    place("play", 12.9114, 77.6763, "Kasavanahalli"),
    place("dee", 12.89744, 77.62199, "Hongasandra"),
    place("vplay", 12.93146, 77.6838, "Bellandur"),
    place("grid", 12.92758, 77.6413, "Koramangala"),
    place("mania", 12.93058, 77.67375, "Bellandur"),
    place("score", 12.88178, 77.63696, "Begur"),
  ];
  const m = resultsMap(blr, null);
  assert.ok(m);
  assert.notEqual(m.scale.at, "bl");
  const H = 290 / MAP_ASPECT;
  const w = Math.max(36, m.scale.w * 290) + 4;
  const right = m.scale.at.endsWith("r");
  const top = m.scale.at.startsWith("t");
  const box = { x0: right ? 290 - 6 - w : 6, x1: right ? 284 : 6 + w, y0: top ? 4 : H - 28, y1: top ? 28 : H - 4 };
  for (const p of m.pins) {
    const [x, y] = [p.x * 290, p.y * H];
    assert.ok(x + 13 < box.x0 || x - 13 > box.x1 || y + 13 < box.y0 || y - 13 > box.y1, `pin ${p.n} clear of the scale bar`);
  }
  for (const a of m.areas) {
    const [x, y] = [a.x * 290, a.y * H];
    assert.ok(!(x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1), `${a.name} clear of the scale bar`);
  }
});

test("venues on the same spot are moved apart, and the map says so", () => {
  const same = [place("a", 18.5504, 73.76565, "Baner"), place("b", 18.5504, 73.76565, "Baner"), place("c", 18.5495, 73.763, "Sus"), place("d", 18.60004, 73.76641, "Wakad")];
  const m = resultsMap(same, null);
  assert.ok(m);
  assert.ok(m.nudged);
  const [a, b] = m.pins;
  assert.ok(Math.hypot((a.x - b.x) * 290, ((a.y - b.y) * 290) / MAP_ASPECT) >= 20);
  assert.equal(resultsMap(PUNE, null)?.nudged, false);
});

// ── Compare ────────────────────────────────────────────────────────

test("the comparison's every cell comes from the rows, and what a venue doesn't list reads as not listed", () => {
  // Dribble Den (Bangalore, 30 Oct): claimed, prices only in its bands, which its page shows.
  const den = turf({
    id: "den",
    name: "Dribble Den",
    city: "bangalore",
    area: "Begur",
    sports: ["Box Cricket", "Football"],
    rating: 5,
    total_reviews: 22,
    lat: 12.86854,
    lng: 77.6214,
    morning_price: null,
    afternoon_price: null,
    evening_price: null,
    opening_hours: null,
    start_time: "05:00:00",
    end_time: "23:30:00",
    is_covered: true,
    equipment_provided: true,
    has_cafeteria: null,
    claimed: true,
    whatsapp_phone: "9000100030",
    price_owner_confirmed: true,
    pricing_bands: [
      { band: "morning", days: "weekday", format: "5-a-side", price_per_hour: 1300 },
      { band: "evening", days: "weekend", format: "7-a-side", price_per_hour: 2500 },
      { band: "morning", days: "weekday", format: "box cricket (Small)", price_per_hour: 1300 },
    ],
  });
  const score = turf({ id: "score", name: "Score Bengaluru Sports Park", city: "bangalore", area: "Begur", rating: 4, total_reviews: 1846, morning_price: null, afternoon_price: null, evening_price: null, owner_phone: null, opening_hours: null, start_time: null, end_time: null, has_floodlights: null, parking_available: null, washroom_available: null, has_cafeteria: null, lat: null, lng: null });
  const t = compareTable([den, score], { reports: [{ players: 3, average: "4.7" }, null] });
  const [a, b] = t.venues;
  // The price its card shows under the table: none listed in the slot columns, so none here either.
  assert.equal(a.price, null);
  assert.equal(b.price, null);
  assert.deepEqual(a.google, { rating: "5.0", reviews: "22" });
  assert.deepEqual(b.google, { rating: "4.0", reviews: "1,846" });
  assert.deepEqual(a.players, { count: 3, average: "4.7" });
  assert.equal(b.players, null);
  assert.equal(a.hours, "5:00 AM – 11:30 PM");
  assert.equal(b.hours, null);
  assert.deepEqual(a.facilities, ["Floodlights", "Covered", "Parking", "Washroom", "Equipment"]);
  assert.deepEqual(b.facilities, []);
  assert.equal(a.claimed, true);
  assert.equal(b.claimed, false);
  // The page's own numbers: WhatsApp's own, the call number from owner_phone; none at all reads as none.
  assert.equal(a.contact.whatsapp, "9000100030");
  assert.equal(a.contact.phone, "9000000017");
  assert.deepEqual([b.contact.phone, b.contact.whatsapp], [null, null]);
  assert.equal(t.distance, false);
  // A sport asked: the card rule, with each venue's own bands. Hotfut lists one rate for three sports: football's
  // (a turf sport, as its sport pages show it), never badminton's; a venue whose bands give football its own range says that range.
  assert.equal(compareTable([hotfut, den]).venues[0].price, "₹550/hr");
  assert.equal(compareTable([hotfut, den], { sport: "football" }).venues[0].price, "₹550/hr");
  assert.equal(compareTable([hotfut, den], { sport: "badminton" }).venues[0].price, null);
  const banded = turf({
    id: "bd",
    sports: ["Box Cricket", "Football"],
    morning_price: 600,
    evening_price: 700,
    pricing_bands: [
      { band: "evening", days: "weekday", format: "6-a-side", price_per_hour: 1400 },
      { band: "morning", days: "weekday", format: "box cricket", price_per_hour: 600 },
    ],
  });
  assert.equal(compareTable([banded, den], { sport: "football" }).venues[0].price, "₹1400/hr");
  assert.equal(compareTable([banded, den]).venues[0].price, "₹600 – ₹1200/hr");
  // The visitor's distance, when their place is known; none for a venue without one.
  const near = compareTable([den, score], { loc: { lat: 12.9279, lng: 77.6271 } });
  assert.ok(near.distance);
  assert.ok(near.venues[0].km! > 6 && near.venues[0].km! < 7.5);
  assert.equal(near.venues[1].km, null);
});

test("hours in one line: 24 hours, the same every day, or the days that differ", () => {
  assert.equal(hoursLine({ opening_hours: null, start_time: null, end_time: null, is_24x7: true }), "Open 24 hours");
  assert.equal(hoursLine({ opening_hours: { daily: "6 AM–11 PM" }, start_time: null, end_time: null, is_24x7: null }), "6:00 AM – 11:00 PM");
  const week = { monday: "6 AM–10 PM", tuesday: "6 AM–10 PM", wednesday: "6 AM–10 PM", thursday: "6 AM–10 PM", friday: "6 AM–10 PM", saturday: "6 AM–10 PM", sunday: "7 AM–10 PM" };
  assert.equal(hoursLine({ opening_hours: week as unknown as Turf["opening_hours"], start_time: null, end_time: null, is_24x7: null }), "6:00 AM – 10:00 PM; Sun 7:00 AM – 10:00 PM");
  assert.equal(hoursLine({ opening_hours: null, start_time: null, end_time: null, is_24x7: null }), null);
});

// ── Host this game ─────────────────────────────────────────────────

test("the host card says only what was read, and hands the wizard the sentence and the venue", () => {
  const q = "plan a 6-a-side game Saturday 7 pm at Hindu Gymkhana Kothrud";
  const h = hostPreview({ sport: "football", when: "weekend", time: "evening", players: 12, skill: null }, gymkhana, q);
  assert.deepEqual(h.lines, [
    { label: "Sport", value: "Football" },
    { label: "Day", value: "This weekend" },
    { label: "Time", value: "Evening" },
    { label: "Players", value: "12" },
  ]);
  assert.deepEqual(h.turf, { id: "hg", slug: "the-turf-ground-kothrud", name: "Hindu Gymkhana Kothrud", place: "Kothrud, Pune" });
  const url = new URL(h.href, "https://www.tapturf.in");
  assert.equal(url.pathname, "/game/create");
  assert.equal(url.searchParams.get("draft"), q);
  assert.equal(url.searchParams.get("turf"), "hg");
  assert.equal(url.searchParams.get("turfName"), "Hindu Gymkhana Kothrud");
  // Nothing read: no lines, the sentence alone; nonsense counts are dropped.
  const bare = hostPreview({ sport: null, when: null, time: null, players: 400, skill: "beginner" }, null, "host a game");
  assert.deepEqual(bare.lines, [{ label: "Level", value: "Beginner" }]);
  assert.equal(bare.turf, null);
  assert.equal(bare.href, "/game/create?draft=host+a+game");
});

test("the venue words of a hosting sentence, and 'here' on a venue's page", () => {
  assert.equal(hostVenueWords("plan a 6-a-side game Saturday 7 pm at Hindu Gymkhana Kothrud"), "Hindu Gymkhana Kothrud");
  assert.equal(hostVenueWords("host box cricket at 7 pm at Hotfut SB Road, 10 players"), "Hotfut SB Road");
  assert.equal(hostVenueWords("football at Turf 18 with 14 players"), "Turf 18");
  assert.equal(hostVenueWords("host a game Saturday at 7pm"), null);
  assert.equal(hostVenueWords("host a game at 7:30"), null);
  assert.equal(hostVenueWords("host football Saturday evening"), null);
  assert.ok(saysHere("host a game here on Sunday"));
  assert.ok(saysHere("create a game at this turf"));
  assert.ok(!saysHere("host a game in Baner"));
});

// ── What the chat draws ────────────────────────────────────────────

test("an old reply draws as before, and a misshapen or unknown picture is left out", () => {
  assert.deepEqual(visualsToDraw(undefined), []);
  assert.deepEqual(visualsToDraw(null), []);
  assert.deepEqual(visualsToDraw({ show: ["map"] }), []);
  assert.deepEqual(visualsToDraw({ show: ["chart3d", "host"], host: { lines: [], turf: null, href: "/game/create?draft=x" } }), ["host"]);
  assert.deepEqual(visualsToDraw({ show: ["host"], host: { lines: [], turf: null, href: "https://evil.example" } }), []);
  const prices = { title: "t", note: "", bars: [{ id: "a", value: 1, display: "₹1" }], off: [] };
  const map = resultsMap(PUNE, null);
  assert.deepEqual(visualsToDraw({ show: ["prices", "map", "prices"], prices, map }), ["prices", "map"]);
  assert.deepEqual(visualsToDraw({ show: ["prices"], prices: { ...prices, bars: [{ id: "a", value: "1" }] } }), []);
});
