import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatPrice,
  getBandPriceRange,
  getMaximumPrice,
  getMinimumPrice,
  getNumericPriceMentions,
  hasRealPrices,
  positivePrice,
  priceRangeText,
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
