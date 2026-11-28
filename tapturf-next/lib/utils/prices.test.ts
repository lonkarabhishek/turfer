import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatPrice,
  bandRows,
  bandsCheckedOn,
  getBandPriceRange,
  getMaximumPrice,
  getMinimumPrice,
  getNumericPriceMentions,
  hasRealPrices,
  listedPriceAt,
  nightOf,
  weekendDate,
  BAND_TIMES,
  LATE_NIGHT_UNTIL,
  SLOT_TIMES,
  playerPriceRange,
  positivePrice,
  priceRangeText,
  reportedMentions,
  showsPriceBands,
  summarisePagePrice,
  summarisePrice,
} from "./prices";
import type { PriceBand, Turf } from "../../types/turf";

// A turf row as transformTurf gives it: every price column null unless set.
const turf = (over: Partial<Turf> = {}): Turf =>
  ({
    id: "t1",
    name: "Turf Up",
    morning_price: null,
    afternoon_price: null,
    evening_price: null,
    weekend_morning_price: null,
    weekend_afternoon_price: null,
    weekend_evening_price: null,
    price_mentions: null,
    price_unit: null,
    slot_minutes: null,
    pricing_bands: null,
    price_owner_confirmed: null,
    ...over,
  }) as unknown as Turf;

const band = (price_per_hour: number, over: Partial<PriceBand> = {}): PriceBand => ({
  band: "evening",
  days: "all",
  format: null,
  price_per_hour,
  ...over,
});

const noRupeeZero = (s: string | null) => assert.ok(s == null || !/₹\s?0(?!\d)|NaN|N\/A/.test(s), `bad price text: ${s}`);

test("no price at all: no number anywhere, never ₹0", () => {
  const t = turf();
  assert.equal(hasRealPrices(t), false);
  assert.equal(getMinimumPrice(t), null);
  assert.equal(getMaximumPrice(t), null);
  const s = summarisePrice(t);
  assert.deepEqual([s.kind, s.min, s.max], ["unknown", null, null]);
  assert.equal(s.label, "Prices not listed yet");
  noRupeeZero(s.label);
  assert.deepEqual(summarisePagePrice(t), s);
});

test("0, negatives, NaN and junk count as no price", () => {
  for (const bad of [0, -500, Number.NaN, Number.POSITIVE_INFINITY, "800" as unknown as number]) {
    const t = turf({ morning_price: bad, weekend_evening_price: bad });
    assert.equal(positivePrice(bad), null, String(bad));
    assert.equal(getMinimumPrice(t), null, String(bad));
    assert.equal(summarisePrice(t).kind, "unknown", String(bad));
  }
  // A zero next to a real price never becomes the minimum.
  const t = turf({ morning_price: 0, evening_price: 1200 });
  assert.equal(getMinimumPrice(t), 1200);
  assert.equal(summarisePrice(t).label, "₹1200/hr");
});

test("a missing table cell is a dash, never N/A or ₹0", () => {
  for (const p of [null, undefined, 0, -1, Number.NaN]) assert.equal(formatPrice(p), "–");
  assert.equal(formatPrice(800), "₹800");
});

test("card range text is null when neither end is known", () => {
  assert.equal(priceRangeText(null, null), null);
  assert.equal(priceRangeText(0, 0), null);
  assert.equal(priceRangeText(undefined, Number.NaN), null);
  assert.equal(priceRangeText(600, null), "₹600");
  assert.equal(priceRangeText(null, 800), "₹800");
  assert.equal(priceRangeText(600, 1200), "₹600–1,200");
});

test("weekend-only prices still summarise", () => {
  const t = turf({ weekend_morning_price: 800, weekend_evening_price: 1499 });
  const s = summarisePrice(t);
  assert.deepEqual([s.kind, s.min, s.max, s.label], ["real", 800, 1499, "₹800 – ₹1499/hr"]);
});

test("reported mentions: zero or junk numbers are ignored, text alone is reported_text", () => {
  assert.equal(summarisePrice(turf({ price_mentions: [{ price_inr: 0 }, { price_inr: null }] })).kind, "unknown");
  const numeric = turf({ price_mentions: [{ price_inr: 500 }, { price_inr: 0 }, { price_inr: 700, context: "night" }] });
  const s = summarisePrice(numeric);
  assert.deepEqual([s.kind, s.min, s.max], ["reported", 500, 700]);
  assert.deepEqual(getNumericPriceMentions(numeric).map((m) => m.price_inr), [500, 700]);
  assert.equal(summarisePrice(turf({ price_mentions: [{ text: "Rs 600 per hour" }] })).kind, "reported_text");
});

test("bands only: cards say nothing listed, the page summarises the bands", () => {
  const t = turf({ pricing_bands: [band(1100), band(800, { band: "morning" }), band(0)] });
  assert.equal(summarisePrice(t).kind, "unknown");
  assert.deepEqual(getBandPriceRange(t), { min: 800, max: 1100 });
  assert.equal(showsPriceBands(t), true);
  const p = summarisePagePrice(t);
  assert.deepEqual([p.kind, p.min, p.max, p.label, p.unit], ["real", 800, 1100, "₹800 – ₹1100/hr", "/hr"]);
});

test("bands and slot columns disagree: the page follows the table it shows", () => {
  // PlayAll Noida 105 on 26 Oct: columns ₹660 to ₹2300, the table only ₹1760.
  const t = turf({ morning_price: 660, evening_price: 2300, pricing_bands: [band(1760)] });
  assert.equal(summarisePrice(t).min, 660);
  assert.deepEqual([summarisePagePrice(t).min, summarisePagePrice(t).max], [1760, 1760]);
  // The owner's own prices win over the bands, on the page too.
  const owner = { ...t, price_owner_confirmed: true };
  assert.equal(showsPriceBands(owner), false);
  assert.deepEqual([summarisePagePrice(owner).min, summarisePagePrice(owner).max], [660, 2300]);
  // An owner flag with no real price does not hide the bands.
  const empty = turf({ price_owner_confirmed: true, morning_price: 0, pricing_bands: [band(900)] });
  assert.equal(showsPriceBands(empty), true);
});

test("no summary label ever prints ₹0 or NaN", () => {
  const cases = [
    turf(),
    turf({ morning_price: 0 }),
    turf({ price_mentions: [{ price_inr: 0, text: "" }] }),
    turf({ pricing_bands: [band(0)] }),
    turf({ weekend_evening_price: 1000 }),
  ];
  for (const t of cases) {
    noRupeeZero(summarisePrice(t).label);
    noRupeeZero(summarisePagePrice(t).label);
  }
});

test("player-shared rates: the range across suggestions, never ₹0", () => {
  assert.equal(playerPriceRange([]), null);
  assert.equal(playerPriceRange([{ price_min: null, price_max: null }, { price_min: 0, price_max: 0 }]), null);
  assert.deepEqual(playerPriceRange([{ price_min: 800, price_max: null }]), { min: 800, max: 800, count: 1 });
  assert.deepEqual(
    playerPriceRange([{ price_min: 600, price_max: 900 }, { price_min: null, price_max: 1000 }, { price_min: 0, price_max: null }]),
    { min: 600, max: 1000, count: 2 },
  );
});

// 26 Oct: 1,248 turfs had notes like "booking-app listing: …" with
// source_url "external-listing" (a relative link to /turf/external-listing).
test("reported prices: notes naming a booking app are cleaned or dropped before the view is chosen", () => {
  const grid = {
    text: "booking-app live booking grid (hourly = 2×30-min slots): Thu 23 Oct: cheapest turf court 'Turf 1' (Box Cricket) hourly morning ₹800 | Sat 25 Oct: x",
    source_url: "external-listing",
  };
  // Only an app's grid: nothing to report, so the page shows "Prices not listed yet".
  assert.deepEqual(reportedMentions(turf({ price_mentions: [grid] })), []);
  const listed = reportedMentions(
    turf({ price_mentions: [grid, { text: "booking-app listing: '₹999 onwards' (slot length and unit not stated)", source_url: "external-listing" }] }),
  );
  assert.deepEqual(
    listed.map((m) => [m.text, m.source_url]),
    [["₹999 onwards (slot length and unit not stated)", null]],
  );
  // A plain note and a review number stay; a link stays only to a plain web page.
  const plain = reportedMentions(
    turf({
      price_mentions: [
        { text: "Rs 500 per hour (Day)", source_url: "https://www.niwec.org/sport-fees/" },
        { price_inr: 700, context: "a reviewer", source_url: "https://hudle.in/x" },
      ],
    }),
  );
  assert.deepEqual(
    plain.map((m) => [m.text ?? m.price_inr, m.source_url]),
    [
      ["Rs 500 per hour (Day)", "https://www.niwec.org/sport-fees/"],
      [700, null],
    ],
  );
  assert.ok(!/booking|external|hudle/i.test(JSON.stringify(plain)));
  assert.deepEqual(reportedMentions(turf()), []);
});

test("price bands for the client table: no source notes, and the month they were checked", () => {
  const bands = [
    band(800, { source: "listing:booking-app grid 2026-10-16" }),
    band(1000, { band: "night", days: "weekend", format: "6-a-side", source: "listing:booking-app grid 2026-09-30; external-listing" }),
  ];
  const rows = bandRows(bands);
  assert.deepEqual(rows, [
    { band: "evening", days: "all", format: null, price_per_hour: 800 },
    { band: "night", days: "weekend", format: "6-a-side", price_per_hour: 1000 },
  ]);
  assert.ok(!/booking|listing|external/i.test(JSON.stringify(rows)));
  assert.equal(bandsCheckedOn(bands), "Oct 2026");
  assert.equal(bandsCheckedOn([band(800)]), null);
  assert.equal(bandsCheckedOn([band(800, { source: "checked 2026-13-01" })]), null);
  assert.deepEqual(bandRows(null), []);
});

// ── The listed price at a time ──

test("the two tables' times are written once: the rows the page draws are the hours listedPriceAt reads", () => {
  // The labels the turf page has always shown (TurfPricing.tsx and PriceBands.tsx read them from here).
  assert.deepEqual(SLOT_TIMES.map((s) => [s.slot, s.name, s.time, s.from, s.to]), [
    ["morning", "Morning", "6AM – 12PM", 6, 12],
    ["afternoon", "Afternoon", "12PM – 5PM", 12, 17],
    ["evening", "Evening", "5PM – Close", 17, 24],
  ]);
  assert.deepEqual(BAND_TIMES.map((b) => [b.band, b.name, b.time, b.from, b.to]), [
    ["morning", "Morning", "5 am to 12 pm", 5, 12],
    ["day", "Afternoon", "12 to 5 pm", 12, 17],
    ["evening", "Evening", "5 to 9 pm", 17, 21],
    ["night", "Night", "after 9 pm", 21, 24],
  ]);
  // Each row starts where the one before ends, so an hour is in one row at most.
  for (const rows of [SLOT_TIMES, BAND_TIMES]) for (let i = 1; i < rows.length; i++) assert.equal(rows[i].from, rows[i - 1].to);
  assert.equal(LATE_NIGHT_UNTIL, 2);
});

test("whose night an hour is, and which days are the weekend", () => {
  assert.equal(nightOf("2026-12-01", 0), "2026-11-30", "12 am is the night of the day before");
  assert.equal(nightOf("2026-12-01", 1), "2026-11-30", "and 1 am");
  assert.equal(nightOf("2026-12-01", 2), "2026-12-01", "2 am is its own date");
  assert.equal(nightOf("2026-03-01", 0), "2026-02-28", "across a month");
  assert.equal(nightOf("2026-11-28", 19), "2026-11-28");
  assert.deepEqual(["2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30"].map(weekendDate), [false, true, true, false], "Friday, Saturday, Sunday, Monday");
});

test("the six columns: the price of the row and day type the page's table shows for that hour", () => {
  const t = turf({ morning_price: 600, afternoon_price: 700, evening_price: 900, weekend_morning_price: 800, weekend_evening_price: 1200 });
  const at = (hour: number, weekend = false) => listedPriceAt(t, { weekend, hour });
  assert.deepEqual(at(6), { min: 600, max: 600, from: "time" }, "6 AM is Morning");
  assert.deepEqual(at(11), { min: 600, max: 600, from: "time" });
  assert.deepEqual(at(12), { min: 700, max: 700, from: "time" }, "12 PM is Afternoon");
  assert.deepEqual(at(16), { min: 700, max: 700, from: "time" });
  assert.deepEqual(at(17), { min: 900, max: 900, from: "time" }, "5 PM is Evening");
  assert.deepEqual(at(23), { min: 900, max: 900, from: "time" });
  assert.deepEqual(at(0), { min: 900, max: 900, from: "time" }, "12 am and 1 am are the evening they end");
  assert.deepEqual(at(1), { min: 900, max: 900, from: "time" });
  assert.deepEqual(at(19, true), { min: 1200, max: 1200, from: "time" }, "a weekend reads the weekend column");
  assert.deepEqual(at(7, true), { min: 800, max: 800, from: "time" });
  // The table has no price there: the turf's lowest to highest listed price, said as a range.
  assert.deepEqual(at(13, true), { min: 600, max: 1200, from: "range" }, "no weekend afternoon price: the range");
  assert.deepEqual(at(5), { min: 600, max: 1200, from: "range" }, "5 AM is before the Morning row starts");
  assert.deepEqual(at(3), { min: 600, max: 1200, from: "range" }, "3 AM is in no row");
  assert.deepEqual([at(13, true)?.min, at(13, true)?.max], [getMinimumPrice(t), getMaximumPrice(t)], "the range is the page's own lowest and highest");
});

test("no listed price per hour: null, never a guess", () => {
  assert.equal(listedPriceAt(turf(), { weekend: false, hour: 19 }), null, "no price listed");
  assert.equal(listedPriceAt(turf({ evening_price: 0 }), { weekend: false, hour: 19 }), null, "0 is no price");
  assert.equal(listedPriceAt(turf({ evening_price: 500, price_unit: "per_person" }), { weekend: false, hour: 19 }), null, "a price per person is not a price per hour");
  assert.equal(listedPriceAt(turf({ evening_price: 1500, price_unit: "per_slot", slot_minutes: 90 }), { weekend: false, hour: 19 }), null, "nor a price per slot");
  assert.deepEqual(listedPriceAt(turf({ evening_price: 900, price_unit: "per_hour" }), { weekend: false, hour: 19 }), { min: 900, max: 900, from: "time" });
  // Prices from reviews are never read.
  assert.equal(listedPriceAt(turf({ price_mentions: [{ price_inr: 700, context: "per hour" }] }), { weekend: false, hour: 19 }), null);
});

test("the listed bands, where the page shows those: the band and day type of the hour, one price for each format", () => {
  const t = turf({
    evening_price: 500,
    pricing_bands: [
      band(800, { band: "morning", days: "weekday", format: "5-a-side" }),
      band(1000, { band: "evening", days: "weekday", format: "5-a-side" }),
      band(1400, { band: "evening", days: "weekday", format: "7-a-side" }),
      band(1600, { band: "evening", days: "weekend", format: "5-a-side" }),
      band(1100, { band: "night", days: "all", format: "5-a-side" }),
    ],
  });
  assert.equal(showsPriceBands(t), true);
  const at = (hour: number, weekend = false) => listedPriceAt(t, { weekend, hour });
  assert.deepEqual(at(5), { min: 800, max: 800, from: "time" }, "the bands' morning starts at 5 am");
  assert.deepEqual(at(19), { min: 1000, max: 1400, from: "time" }, "two formats at one time: the lowest and the highest, never the six columns' 500");
  assert.deepEqual(at(19, true), { min: 1600, max: 1600, from: "time" });
  assert.deepEqual(at(21), { min: 1100, max: 1100, from: "time" }, "9 pm is Night, listed for all days");
  assert.deepEqual(at(22, true), { min: 1100, max: 1100, from: "time" });
  assert.deepEqual(at(0), { min: 1100, max: 1100, from: "time" }, "12 am is the night it ends");
  assert.deepEqual(at(13), { min: 800, max: 1600, from: "range" }, "no afternoon band: the bands' own lowest to highest");
  assert.deepEqual(at(8, true), { min: 800, max: 1600, from: "range" }, "no weekend morning band");
  assert.deepEqual(at(3), { min: 800, max: 1600, from: "range" }, "3 am is in no band");
  // The owner's own prices win over the bands, as on the page.
  const owner = turf({ ...t, price_owner_confirmed: true });
  assert.equal(showsPriceBands(owner), false);
  assert.deepEqual(listedPriceAt(owner, { weekend: false, hour: 19 }), { min: 500, max: 500, from: "time" });
});
