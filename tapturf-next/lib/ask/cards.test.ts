import { test } from "node:test";
import assert from "node:assert/strict";
import { haversineKm } from "../utils/location";
import { asksPrice, cardPrices, compareTable, dayType, hostPreview, hostVenueWords, hoursLine, MAP_ASPECT, priceChart, resultsMap, saysHere, visualsFor, type Reading } from "./cards";
import { cardPriceOf, visualsToDraw } from "./visuals";
import { sportBandMap, sportBandTimeMap } from "../utils/cardSport";
import { summarisePrice } from "../utils/prices";
import type { PriceBand, Turf } from "../../types/turf";

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
  // Saturday: the weekend column; a venue that lists no weekend evening rate is named, not charted at its weekday one,
  // and the line says it is the weekend rate that isn't listed (its page shows the weekday one).
  const sat = priceChart([gymkhana, paddock, powerplay], reading({ sport: "football", time: "evening", when: "weekend" }), FRIDAY);
  assert.equal(sat.title, "Evening rate per hour, weekends");
  assert.deepEqual(sat.bars.map((b) => [b.id, b.value]), [["hg", 1500], ["pd", 1999]]);
  assert.deepEqual(sat.off, [{ id: "pp", why: "No weekend evening rate listed (₹350/hr)" }]);
  // Tomorrow is Saturday in India: the same.
  assert.deepEqual(priceChart([gymkhana, powerplay], reading({ time: "morning", when: "tomorrow" }), FRIDAY).off, [{ id: "pp", why: "No weekend morning rate listed (₹350/hr)" }]);
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
  // Its slot columns are not football's, so they are never charted; without the bands by time, its range is named under the chart.
  const f = priceChart([banded], reading({ sport: "football", time: "evening" }), FRIDAY);
  assert.deepEqual(f.bars, []);
  assert.deepEqual(f.off, [{ id: "bd", why: "Football ₹1300 – ₹1400/hr; its page has the rate by time" }]);
  // Bands by time that list no football evening: said as football's, never as no evening rate at all.
  const morningOnly = { bd: { football: { morning: { weekday: [1300, 1300] as const } } } };
  assert.deepEqual(priceChart([banded], reading({ sport: "football", time: "evening" }), FRIDAY, morningOnly).off, [
    { id: "bd", why: "No evening football rate listed (₹1300 – ₹1400/hr)" },
  ]);
  // With no time asked, the band range's low end is the sport's lowest listed rate.
  const low = priceChart([banded, hotfut], reading({ sport: "football", sort: "price_low" }), FRIDAY);
  assert.equal(low.title, "Lowest listed rate per hour");
  assert.deepEqual(low.bars.map((b) => [b.id, b.display]), [["hf", "₹550"], ["bd", "from ₹1,300"]]);
});

test("a venue whose card shows its bands' range for the sport is charted at the sport's band for the time asked", () => {
  // Bangalore, 30 Oct (SELECT only): each lists box cricket too, and its bands give football another range than its slot columns.
  const split = (format: string, days: PriceBand["days"], prices: Record<PriceBand["band"], number>) =>
    Object.entries(prices).map(([band, price_per_hour]) => ({ band, days, format, price_per_hour }) as PriceBand);
  const allDays = (format: string, prices: Record<PriceBand["band"], number>) => split(format, "all", prices);
  const hitAndRun = turf({
    id: "hr",
    name: "HIT AND RUN",
    sports: ["Box Cricket", "Football"],
    morning_price: 799,
    afternoon_price: 799,
    evening_price: 999,
    weekend_morning_price: 799,
    weekend_afternoon_price: 799,
    weekend_evening_price: 999,
    pricing_bands: [...allDays("6-a-side", { morning: 800, day: 800, evening: 999, night: 999 }), ...allDays("box cricket (Medium)", { morning: 799, day: 799, evening: 999, night: 999 })],
  });
  const sprintplay = turf({
    id: "sp",
    name: "Sprintplay Sports Arena",
    sports: ["Box Cricket", "Football", "Badminton"],
    morning_price: 1000,
    afternoon_price: 800,
    evening_price: 1000,
    weekend_morning_price: 1400,
    weekend_afternoon_price: 1200,
    weekend_evening_price: 1400,
    pricing_bands: [
      ...split("box cricket (Large)", "weekday", { morning: 1000, day: 800, evening: 1000, night: 1000 }),
      ...split("box cricket (Large)", "weekend", { morning: 1400, day: 1200, evening: 1400, night: 1400 }),
      ...split("6-a-side", "weekday", { morning: 1000, day: 1000, evening: 1000, night: 1000 }),
      ...split("6-a-side", "weekend", { morning: 1400, day: 1400, evening: 1400, night: 1400 }),
    ],
  });
  const geetanjali = turf({
    id: "ge",
    name: "Geetanjali Olympiad Sports Arena",
    sports: ["Football", "Badminton", "Skating"],
    morning_price: 1800,
    afternoon_price: 1800,
    evening_price: 1800,
    weekend_morning_price: 1800,
    weekend_afternoon_price: 1800,
    weekend_evening_price: 1800,
    pricing_bands: [...allDays("5-a-side", { morning: 1800, day: 1800, evening: 1800, night: 1800 }), ...allDays("7-a-side", { morning: 2000, day: 2000, evening: 2000, night: 2000 })],
  });
  const rows = [hitAndRun, sprintplay, geetanjali, powerplay];
  // As the route gives them: the card rows with the sport bands, and the bands by time, read from the same rows.
  const ranges = sportBandMap(rows.map((t) => ({ id: t.id, pricing_bands: t.pricing_bands ?? null, price_owner_confirmed: null })));
  const times = sportBandTimeMap(rows.map((t) => ({ id: t.id, pricing_bands: t.pricing_bands ?? null })));
  const cards = rows.map((t) => (ranges[t.id] ? { ...t, pricing_bands: null, sport_bands: ranges[t.id] } : t));
  // "Cheapest football turf tonight", a Friday: weekday evening, every venue charted, none named as listing no rate.
  const tonight = priceChart(cards, reading({ sport: "football", time: "evening", when: "today", sort: "price_low" }), FRIDAY, times);
  assert.deepEqual(
    tonight.bars.map((b) => [b.id, b.value, b.display]),
    [
      ["pp", 350, "₹350"],
      ["hr", 999, "₹999"],
      ["sp", 1000, "₹1,000"],
      // 5-a-side ₹1,800, 7-a-side ₹2,000 in the evening.
      ["ge", 1800, "from ₹1,800"],
    ],
  );
  assert.deepEqual(tonight.off, []);
  // The weekend reads the weekend bands; the afternoon reads the "day" band (12 to 5 pm).
  const sat = priceChart(cards, reading({ sport: "football", time: "evening", when: "weekend" }), FRIDAY, times);
  assert.deepEqual(sat.bars.find((b) => b.id === "sp")?.value, 1400);
  const noon = priceChart(cards, reading({ sport: "football", time: "afternoon" }), FRIDAY, times);
  assert.deepEqual(noon.bars.find((b) => b.id === "sp")?.value, 1000);
  // Box cricket: HIT AND RUN's bands give it its card's own range, so its slot columns are box cricket's.
  const box = priceChart(cards, reading({ sport: "box-cricket", time: "afternoon" }), FRIDAY, times);
  assert.deepEqual(box.bars.find((b) => b.id === "hr")?.value, 799);
  assert.deepEqual(box.bars.find((b) => b.id === "sp")?.value, 800);
});

test("late night and no time read the card's own lowest rate; a rate per slot is never charted beside per-hour ones", () => {
  const late = priceChart([gymkhana, powerplay], reading({ time: "late_night" }), FRIDAY);
  assert.equal(late.title, "Lowest listed rate per hour");
  // Not "none are listed": most bands list a night rate (after 9 pm), which this chart doesn't read.
  assert.match(late.note, /late-night rates aren't charted here, so this is each venue's lowest listed rate/);
  assert.deepEqual(late.bars.map((b) => [b.id, b.display]), [["pp", "₹350"], ["hg", "from ₹800"]]);
  const slot = turf({ id: "sl", price_unit: "per_slot", slot_minutes: 90, morning_price: null, afternoon_price: null, evening_price: 1500 });
  const c = priceChart([slot, powerplay], reading({ time: "evening" }), FRIDAY);
  assert.deepEqual(c.off, [{ id: "sl", why: "₹1500/90-min slot" }]);
});

test("with a sport, a search's cards show the price the chart reads; without one, their own", () => {
  // Rows as listed on 30 Oct (SELECT only), with their bands as the route gives them (sportBandMap, withSportBands).
  const band = (format: string, lo: number, hi: number): PriceBand[] => [
    { band: "morning", days: "all", format, price_per_hour: lo },
    { band: "evening", days: "all", format, price_per_hour: hi },
  ];
  const nSports = turf({ id: "ns", name: "N Sports Arena", city: "hyderabad", morning_price: 1200, afternoon_price: 1200, evening_price: 1800, weekend_morning_price: 1300, weekend_afternoon_price: 1300, weekend_evening_price: 2200, pricing_bands: [...band("box cricket (7-a-side)", 1200, 2200), ...band("5-a-side", 3000, 4000)] });
  const swingZone = turf({ id: "sz", name: "Swing Zone", city: "hyderabad", sports: ["Box Cricket", "Football", "Volleyball"], morning_price: 400, afternoon_price: 400, evening_price: 600, pricing_bands: band("box cricket (6-a-side)", 400, 900) });
  const kanade = turf({ id: "ks", name: "Kanade Sports Club", morning_price: 300, afternoon_price: 300, evening_price: 700, weekend_evening_price: 900, pricing_bands: [...band("6-a-side", 300, 900), ...band("9-a-side", 500, 1600)] });
  const jignasa = turf({ id: "jg", name: "Jignasa Sports Venue", morning_price: 299, afternoon_price: null, evening_price: 299, pricing_bands: [...band("box cricket (Small)", 299, 299), ...band("3-a-side", 299, 299)] });
  const dee = turf({ id: "dee", name: "DEE SPORTS HONGASANDRA", sports: ["Box Cricket", "Football", "Badminton", "Swimming"], morning_price: 1300, afternoon_price: 1300, evening_price: 1300 });
  const courts = turf({ id: "bc", name: "Shuttle Courts", sports: ["Badminton"], morning_price: 450, afternoon_price: 450, evening_price: 450 });
  const all = [nSports, swingZone, kanade, jignasa, dee, courts, powerplay, unpriced];
  const bands = sportBandMap(all.map((t) => ({ id: t.id, pricing_bands: t.pricing_bands ?? null, price_owner_confirmed: null })));
  const rows = all.map((t) => (bands[t.id] ? { ...t, pricing_bands: null, sport_bands: bands[t.id] } : t));
  // Football: the band's range where it isn't the card's own; null where the bands name only another sport. The rest send nothing.
  assert.deepEqual(cardPrices(rows, "football"), {
    ns: { label: "₹3000 – ₹4000/hr", kind: "real" },
    sz: null,
    ks: { label: "₹300 – ₹1600/hr", kind: "real" },
  });
  // Badminton: no band names it and every price but the courts' is another sport's (as the chart's "No badminton rate listed").
  const badminton = cardPrices(rows, "badminton")!;
  assert.deepEqual(Object.keys(badminton).sort(), ["dee", "jg", "ks", "ns", "pp", "sz"]);
  assert.ok(Object.values(badminton).every((p) => p === null));
  // No sport, or one we don't know: nothing sent, every card its own, as before.
  assert.equal(cardPrices(rows, null), null);
  assert.equal(cardPrices(rows, "curling"), null);
  assert.equal(cardPrices([powerplay, courts], "football"), null);
  // Card and chart agree: every charted card shows a real price whose range holds the bar, every card named
  // under the chart as listing no rate for the sport reads "Prices not listed yet".
  for (const sport of ["football", "badminton", "box-cricket"]) {
    const sent = cardPrices(rows, sport) ?? {};
    // As TurfMiniCard reads it: the price sent, null for none listed, else its own.
    const shown = (t: Turf) => (t.id in sent ? (sent[t.id] ?? { label: "Prices not listed yet", kind: "unknown" }) : summarisePrice(t));
    const chart = priceChart(rows, reading({ sport, sort: "price_low" }), FRIDAY);
    for (const b of chart.bars) {
      const p = shown(rows.find((t) => t.id === b.id)!);
      assert.equal(p.kind, "real", `${sport} ${b.id}`);
      assert.match(p.label, new RegExp(`^₹${b.value}\\b`), `${sport} ${b.id}`);
    }
    for (const o of chart.off.filter((x) => /^No .* rate listed$|^Prices not listed yet$/.test(x.why)))
      assert.equal(shown(rows.find((t) => t.id === o.id)!).label, "Prices not listed yet", `${sport} ${o.id}`);
  }
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
  const H = 288 / MAP_ASPECT;
  const w = Math.max(36, m.scale.w * 288) + 4;
  const right = m.scale.at.endsWith("r");
  const top = m.scale.at.startsWith("t");
  const box = { x0: right ? 288 - 6 - w : 6, x1: right ? 282 : 6 + w, y0: top ? 4 : H - 28, y1: top ? 28 : H - 4 };
  for (const p of m.pins) {
    const [x, y] = [p.x * 288, p.y * H];
    assert.ok(x + 13 < box.x0 || x - 13 > box.x1 || y + 13 < box.y0 || y - 13 > box.y1, `pin ${p.n} clear of the scale bar`);
  }
  for (const a of m.areas) {
    const [x, y] = [a.x * 288, a.y * H];
    assert.ok(!(x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1), `${a.name} clear of the scale bar`);
  }
});

test("venues on the same spot are moved apart, and the map says so", () => {
  const same = [place("a", 18.5504, 73.76565, "Baner"), place("b", 18.5504, 73.76565, "Baner"), place("c", 18.5495, 73.763, "Sus"), place("d", 18.60004, 73.76641, "Wakad")];
  const m = resultsMap(same, null);
  assert.ok(m);
  assert.ok(m.nudged);
  // Every pin a tap target's width (30px) from every other on the 288px frame of a 320px phone, so no target covers a neighbour.
  const gaps = (pins: { x: number; y: number }[]) => pins.flatMap((p, i) => pins.slice(i + 1).map((q) => Math.hypot((p.x - q.x) * 288, ((p.y - q.y) * 288) / MAP_ASPECT)));
  assert.ok(Math.min(...gaps(m.pins)) >= 29.5, `${Math.min(...gaps(m.pins))}`);
  assert.equal(resultsMap(PUNE, null)?.nudged, false);
  // A crowd near the visitor (Baner and around): still a target's width apart, and clear of the dot.
  const crowd = [
    place("c1", 18.5504, 73.76565, "Baner"),
    place("c2", 18.5504, 73.76565, "Baner"),
    place("c3", 18.5504, 73.76565, "Baner"),
    place("c4", 18.56106, 73.78902, "Baner"),
    place("c5", 18.5591, 73.7802, "Baner"),
    place("c6", 18.5622, 73.7741, "Balewadi"),
    place("c7", 18.5481, 73.7735, "Baner"),
    place("c8", 18.5679, 73.7713, "Balewadi"),
    place("c9", 18.5455, 73.7889, "Aundh"),
    place("c10", 18.5573, 73.7928, "Aundh"),
  ];
  const near = resultsMap(crowd, BANER);
  assert.ok(near?.me);
  const me = near.me;
  assert.ok(Math.min(...gaps(near.pins)) >= 29.5, `${Math.min(...gaps(near.pins))}`);
  assert.ok(Math.min(...near.pins.map((p) => Math.hypot((p.x - me.x) * 288, ((p.y - me.y) * 288) / MAP_ASPECT))) >= 29.5);
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
  // No sport asked: the price its own page shows (its owner confirmed prices listed only as bands), and the card under the table shows it too.
  assert.deepEqual(a.price, { label: "₹1300 – ₹2500/hr", kind: "real" });
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
  assert.deepEqual(compareTable([hotfut, den]).venues[0].price, { label: "₹550/hr", kind: "real" });
  assert.deepEqual(compareTable([hotfut, den], { sport: "football" }).venues[0].price, { label: "₹550/hr", kind: "real" });
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
  assert.equal(compareTable([banded, den], { sport: "football" }).venues[0].price?.label, "₹1400/hr");
  // No sport: its page's price, which follows the bands its Pricing table lists, not the slot columns' ₹600 – ₹1200.
  assert.equal(compareTable([banded, den]).venues[0].price?.label, "₹600 – ₹1400/hr");
  // A sport asked keeps the sport pages' rule: Dribble Den lists no price of its own, so none for football.
  assert.equal(compareTable([den, banded], { sport: "football" }).venues[0].price, null);
  // An owner's own listed prices win over the bands, as on the page.
  assert.equal(compareTable([{ ...banded, price_owner_confirmed: true } as Turf, den]).venues[0].price?.label, "₹600 – ₹1200/hr");
  // A reported price is the page's too, and says so (the table styles it as the card does).
  assert.deepEqual(compareTable([reported, den]).venues[0].price, { label: "~₹900/hr (reported)", kind: "reported" });
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
  // Football World (Palava), Mumbai, 30 Oct: closed four days of seven. The open days first, then the closed ones by name.
  const evenings = { monday: "Closed", tuesday: "7 PM–9 PM", wednesday: "Closed", thursday: "7 PM–9 PM", friday: "6 PM–9:30 PM", saturday: "Closed", sunday: "Closed" };
  assert.equal(
    hoursLine({ opening_hours: evenings as unknown as Turf["opening_hours"], start_time: null, end_time: null, is_24x7: null }),
    "Tue, Thu 7:00 PM – 9:00 PM; Fri 6:00 PM – 9:30 PM; Mon, Wed, Sat, Sun closed",
  );
  const sundays = { ...week, sunday: "Closed" };
  assert.equal(hoursLine({ opening_hours: sundays as unknown as Turf["opening_hours"], start_time: null, end_time: null, is_24x7: null }), "6:00 AM – 10:00 PM; Sun Closed");
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

test("a card's price from the reply: none sent (an old reply, or no sport) shows its own; a misshapen one too", () => {
  assert.equal(cardPriceOf(undefined, "a"), undefined);
  assert.equal(cardPriceOf({}, "a"), undefined);
  assert.equal(cardPriceOf({ b: null }, "a"), undefined);
  assert.equal(cardPriceOf({ a: null }, "a"), null);
  assert.deepEqual(cardPriceOf({ a: { label: "₹3000 – ₹4000/hr", kind: "real" } }, "a"), { label: "₹3000 – ₹4000/hr", kind: "real" });
  assert.equal(cardPriceOf({ a: { label: "₹1", kind: "unknown" } }, "a"), undefined);
  assert.equal(cardPriceOf({ a: { label: 1, kind: "real" } }, "a"), undefined);
  assert.equal(cardPriceOf([{ label: "₹1", kind: "real" }], "0"), undefined);
  assert.equal(cardPriceOf({}, "constructor"), undefined);
});
