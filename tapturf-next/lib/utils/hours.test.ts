import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyHoursSummary, normaliseOpeningHours, openingHoursJsonLd } from "./hours";
import type { OpeningHours } from "../../types/turf";

const week = (v: string, casing: (d: string) => string): OpeningHours =>
  Object.fromEntries(
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => [casing(d), v]),
  ) as OpeningHours;

test("per-day hours read whatever the key casing (3,289 turfs store lower-case days)", () => {
  // Playmakers Soccer Field: keys stored as "monday"... and no start/end fallback.
  const lower = week("6 AM–11 PM", (d) => d.toLowerCase());
  const rows = normaliseOpeningHours(lower, { start_time: null, end_time: null });
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[0], { day: "Monday", raw: "6 AM–11 PM", closed: false, spans: [{ opens: "06:00", closes: "23:00" }] });
  assert.equal(dailyHoursSummary(lower, { start_time: null, end_time: null }), "Open 6:00 AM – 11:00 PM daily");
  assert.equal(openingHoursJsonLd(lower)?.length, 7);

  assert.equal(normaliseOpeningHours(week("Open 24 hours", (d) => d.toUpperCase())).length, 7);
  assert.equal(normaliseOpeningHours(week("Open 24 hours", (d) => d)).length, 7);
});

test("a per-day closure in lower-case keys is kept, not replaced by the start/end fallback", () => {
  const oh = { ...week("6 AM–10 PM", (d) => d.toLowerCase()), sunday: "Closed" } as unknown as OpeningHours;
  const rows = normaliseOpeningHours(oh, { start_time: "06:00:00", end_time: "22:00:00" });
  assert.equal(rows.length, 7);
  assert.equal(rows[6].day, "Sunday");
  assert.equal(rows[6].closed, true);
  // Not the same every day, so no one-line summary, and Sunday is left out of the JSON-LD.
  assert.equal(dailyHoursSummary(oh), null);
  assert.equal(openingHoursJsonLd(oh)?.some((s) => s.dayOfWeek === "Sunday"), false);
});

test("mixed-case keys: each day once, an exact 'Monday' beats a stray 'monday'", () => {
  const oh = { Monday: "6 AM–11 PM", monday: "Closed", TUESDAY: "6 AM–11 PM", wednesday: "6 AM–11 PM" } as unknown as OpeningHours;
  const rows = normaliseOpeningHours(oh);
  assert.deepEqual(
    rows.map((r) => [r.day, r.closed]),
    [["Monday", false], ["Tuesday", false], ["Wednesday", false]],
  );
});

test("{daily} and the start/end fallback still work", () => {
  assert.equal(dailyHoursSummary({ daily: "6 AM–12 AM" }), "Open 6:00 AM – 12:00 AM daily");
  assert.equal(normaliseOpeningHours(null, { start_time: "05:00:00", end_time: "23:00:00" }).length, 7);
  // 00:00-23:59 with no flag is the column default, not a fact.
  assert.equal(normaliseOpeningHours(null, { start_time: "00:00:00", end_time: "23:59:00" }).length, 0);
  assert.equal(dailyHoursSummary(null, { start_time: null, end_time: null, is_24x7: true }), "Open 24 hours");
});

test("a whole-week schedule stored under every day claims no hours (3 turfs, 28 Oct)", () => {
  for (const s of [
    "Weekdays: 6 PM–10 PM :: Saturday: 12 PM–10 PM :: Sunday: 8 AM–10 PM", // elite-sports-academy-uttarahalli-hobli
    "Mon–Fri: 5 AM–11 PM, Sat & Sun: 5 AM–1 AM", // royal-turf-pavilion-kadugondanahalli
    "Mon–Sat: 3 PM–5 PM & 7 PM–10 PM, Sunday: 10 AM–10 PM", // don-bosco-futsal-turf-panaji
  ]) {
    const oh = week(s, (d) => d.toLowerCase());
    const fallback = { start_time: "18:00:00", end_time: "22:00:00" };
    const rows = normaliseOpeningHours(oh, fallback);
    // The page still shows the text for each day...
    assert.equal(rows.length, 7);
    assert.ok(rows.every((r) => r.raw === s && !r.closed && r.spans.length === 0));
    // ...but no snippet line and no OpeningHoursSpecification.
    assert.equal(dailyHoursSummary(oh, fallback), null);
    assert.equal(openingHoursJsonLd(oh, fallback), null);
  }
  // A plain range under its own day still parses.
  assert.equal(dailyHoursSummary(week("5 AM–11 PM", (d) => d.toLowerCase())), "Open 5:00 AM – 11:00 PM daily");
});

test("a whole day stored as '12 AM–12 AM' is marked up 00:00 to 23:59, as the page says 'Open 24 hours' (2 turfs, 28 Oct)", () => {
  const oh = week("12 AM–12 AM", (d) => d.toLowerCase());
  const fallback = { start_time: "00:00:00", end_time: "00:00:00", is_24x7: false };
  assert.equal(dailyHoursSummary(oh, fallback), "Open 24 hours");
  const spec = openingHoursJsonLd(oh, fallback);
  assert.equal(spec?.length, 7);
  assert.ok(spec!.every((s) => s.opens === "00:00" && s.closes === "23:59"), JSON.stringify(spec));
  // A span that only ends at midnight keeps its hours; "Open 24 hours" stays 00:00 to 23:59.
  assert.deepEqual(openingHoursJsonLd(week("6 AM–12 AM", (d) => d.toLowerCase()))?.[0], { "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "06:00", closes: "00:00" });
  assert.deepEqual(openingHoursJsonLd(week("Open 24 hours", (d) => d.toLowerCase()))?.[0], { "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "00:00", closes: "23:59" });
});
