import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dailyHoursSummary,
  formatSpan,
  hoursForDisplay,
  isClosedDay,
  normaliseOpeningHours,
  openingHoursJsonLd,
  type DayHours,
} from "./hours";
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

// ---- hoursForDisplay: the visible table only ----

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const perDay = (values: Array<string | null>): OpeningHours =>
  Object.fromEntries(DAY_NAMES.flatMap((d, i) => (values[i] == null ? [] : [[d.toLowerCase(), values[i]]]))) as OpeningHours;
/** What TurfDetails puts in each row of the table. */
const shown = (oh: OpeningHours, closedDays?: string | null): Record<string, string> =>
  Object.fromEntries(
    hoursForDisplay(normaliseOpeningHours(oh), closedDays).map((r) => [
      r.day,
      r.closed ? "Closed" : r.spans.length ? r.spans.map(formatSpan).join(" | ") : r.raw,
    ]),
  );
/** The same with no joining: what the table showed before. */
const stored = (oh: OpeningHours, closedDays?: string | null): Record<string, string> =>
  Object.fromEntries(
    normaliseOpeningHours(oh).map((r) => [
      r.day,
      r.closed || isClosedDay(closedDays, r.day) ? "Closed" : r.spans.length ? r.spans.map(formatSpan).join(" | ") : r.raw,
    ]),
  );

// Malhar sports club cricket turf (Mumbai), as stored on 11 Nov.
const MALHAR = perDay([
  "12–6 am 7 am–12 am",
  "12–2 am 7 am–12 am",
  "12–2 am 7 am–12 am",
  "12–2 am 7 am–12 am",
  "12–2 am 7 am–12 am",
  "12–6 am 7 am–12 am",
  "12–6 am 7 am–12 am",
]);

test("Google's split-midnight week reads as one session a day (Malhar, Mumbai)", () => {
  assert.deepEqual(shown(MALHAR), {
    Monday: "7:00 AM – 2:00 AM",
    Tuesday: "7:00 AM – 2:00 AM",
    Wednesday: "7:00 AM – 2:00 AM",
    Thursday: "7:00 AM – 2:00 AM",
    Friday: "7:00 AM – 6:00 AM",
    Saturday: "7:00 AM – 6:00 AM",
    Sunday: "7:00 AM – 6:00 AM",
  });
  // The rows passed in are not changed.
  const rows = normaliseOpeningHours(MALHAR);
  const copy = JSON.parse(JSON.stringify(rows));
  hoursForDisplay(rows);
  assert.deepEqual(rows, copy);
});

test("the stored spans and the JSON-LD for Malhar are as they were before the table joined nights (pinned)", () => {
  const two = (close: string) => [{ opens: "00:00", closes: close }, { opens: "07:00", closes: "00:00" }];
  assert.deepEqual(normaliseOpeningHours(MALHAR), [
    { day: "Monday", raw: "12–6 am 7 am–12 am", closed: false, spans: two("06:00") },
    { day: "Tuesday", raw: "12–2 am 7 am–12 am", closed: false, spans: two("02:00") },
    { day: "Wednesday", raw: "12–2 am 7 am–12 am", closed: false, spans: two("02:00") },
    { day: "Thursday", raw: "12–2 am 7 am–12 am", closed: false, spans: two("02:00") },
    { day: "Friday", raw: "12–2 am 7 am–12 am", closed: false, spans: two("02:00") },
    { day: "Saturday", raw: "12–6 am 7 am–12 am", closed: false, spans: two("06:00") },
    { day: "Sunday", raw: "12–6 am 7 am–12 am", closed: false, spans: two("06:00") },
  ]);
  assert.equal(
    JSON.stringify(openingHoursJsonLd(MALHAR)),
    "[" +
      (["Monday:06:00", "Tuesday:02:00", "Wednesday:02:00", "Thursday:02:00", "Friday:02:00", "Saturday:06:00", "Sunday:06:00"] as const)
        .map((v) => {
          const day = v.slice(0, v.indexOf(":"));
          const close = v.slice(v.indexOf(":") + 1);
          return (
            `{"@type":"OpeningHoursSpecification","dayOfWeek":"${day}","opens":"00:00","closes":"${close}"},` +
            `{"@type":"OpeningHoursSpecification","dayOfWeek":"${day}","opens":"07:00","closes":"00:00"}`
          );
        })
        .join(",") +
      "]",
  );
  assert.equal(dailyHoursSummary(MALHAR), null);
});

test("days with nothing to join are shown as stored", () => {
  const same = (oh: OpeningHours, closedDays?: string | null) => assert.deepEqual(shown(oh, closedDays), stored(oh, closedDays));

  // A lunch break: two daytime ranges.
  const lunch = perDay(Array(7).fill("6–10 am 4–11 pm"));
  same(lunch);
  assert.equal(shown(lunch).Monday, "6:00 AM – 10:00 AM | 4:00 PM – 11:00 PM");

  // The day before is closed, stored or through closed_days: Tuesday's 12 to 2 AM has no night to join.
  const tue = [null, "12–2 am 7 am–12 am", "7 am–12 am", "7 am–12 am", "7 am–12 am", "7 am–12 am", "7 am–12 am"];
  const mondayClosed = perDay(["Closed", ...tue.slice(1)]);
  same(mondayClosed);
  assert.equal(shown(mondayClosed).Tuesday, "12:00 AM – 2:00 AM | 7:00 AM – 12:00 AM");
  const mondayOff = perDay(["7 am–12 am", ...tue.slice(1)]);
  same(mondayOff, "Mondays");
  assert.equal(shown(mondayOff, "Mondays").Monday, "Closed");
  assert.equal(shown(mondayOff, "Mondays").Tuesday, "12:00 AM – 2:00 AM | 7:00 AM – 12:00 AM");
  // With Monday open the same week does join.
  assert.equal(shown(mondayOff).Monday, "7:00 AM – 2:00 AM");
  assert.equal(shown(mondayOff).Tuesday, "7:00 AM – 12:00 AM");

  // The day itself is closed through closed_days: the day before keeps its stored midnight.
  same(mondayOff, "Tuesdays");

  // The day before is missing.
  same(perDay(tue));

  // The day before is open all day.
  same(perDay(["Open 24 hours", ...tue.slice(1)]));
  same(perDay(["12 AM–12 AM", ...tue.slice(1)]));

  // The day before does not run to midnight.
  same(perDay(["7 am–11 pm", ...tue.slice(1)]));

  // The day's only range is the one after midnight: it stays, and Monday keeps its midnight.
  const onlyTail = perDay(["7 am–12 am", "12–2 am", "7 am–12 am", "7 am–12 am", "7 am–12 am", "7 am–12 am", "7 am–12 am"]);
  same(onlyTail);
  assert.equal(shown(onlyTail).Tuesday, "12:00 AM – 2:00 AM");

  // Joined it would read "7:00 AM – 7:00 AM" or longer than a day: left alone.
  same(perDay(["7 am–12 am", "12–7 am 7 am–12 am", null, null, null, null, null]));
  same(perDay(["7 am–12 am", "12–9 am 10 am–12 am", null, null, null, null, null]));

  // The first range runs to noon or later: "6:00 PM – 12:00 PM" would read as a slip for 12:00 AM.
  // (Chatrapati Shivaji Maharaj Turf, Nagpur; GREEN FIELD ARENA TURF, Mumbai.)
  const noon = perDay(["6 PM–12 AM", "6 PM–12 AM", "6 PM–12 AM", "6 PM–12 AM", "6 PM–12 AM", "6 PM–12 AM", "12 AM–12 PM, 6 PM–12 AM"]);
  same(noon);
  assert.equal(shown(noon).Sunday, "12:00 AM – 12:00 PM | 6:00 PM – 12:00 AM");
  same(perDay(["10 pm–12 am", "10 pm–12 am", "10 pm–12 am", "10 pm–12 am", "10 pm–12 am", "10 pm–12 am", "12 am–12:30 pm 10 pm–12 am"]));

  // Open all week.
  same(week("Open 24 hours", (d) => d.toLowerCase()));
  same(week("12 AM–12 AM", (d) => d.toLowerCase()));
  same({ daily: "6 AM–1 AM" });

  // A week schedule stored as text under each day, next to a day that could otherwise join.
  const text = "Mon–Fri: 5 AM–12 AM, Sat & Sun: 12 AM–1 AM & 5 AM–12 AM";
  same(week(text, (d) => d.toLowerCase()));
  assert.equal(shown(week(text, (d) => d.toLowerCase())).Sunday, text);
  same(perDay([text, "12–2 am 7 am–12 am", text, text, text, text, text]));
  same(perDay(["7 am–12 am", text, text, text, text, text, text]));
});

test("Sunday night runs into Monday", () => {
  const oh = perDay(["12–3 am 6 am–11 pm", "6 am–11 pm", "6 am–11 pm", "6 am–11 pm", "6 am–11 pm", "6 am–11 pm", "6 am–12 am"]);
  assert.deepEqual(shown(oh), {
    Monday: "6:00 AM – 11:00 PM",
    Tuesday: "6:00 AM – 11:00 PM",
    Wednesday: "6:00 AM – 11:00 PM",
    Thursday: "6:00 AM – 11:00 PM",
    Friday: "6:00 AM – 11:00 PM",
    Saturday: "6:00 AM – 11:00 PM",
    Sunday: "6:00 AM – 3:00 AM",
  });
});

test("23:59 and 24:00 count as midnight, and only the last range of the day before is joined", () => {
  const rows: DayHours[] = [
    { day: "Friday", raw: "", closed: false, spans: [{ opens: "06:00", closes: "10:00" }, { opens: "16:00", closes: "23:59" }] },
    { day: "Saturday", raw: "", closed: false, spans: [{ opens: "00:00", closes: "01:30" }, { opens: "06:00", closes: "24:00" }] },
    { day: "Sunday", raw: "", closed: false, spans: [{ opens: "00:00", closes: "02:00" }, { opens: "08:00", closes: "22:00" }] },
  ];
  assert.deepEqual(
    hoursForDisplay(rows).map((r) => r.spans.map(formatSpan)),
    [["6:00 AM – 10:00 AM", "4:00 PM – 1:30 AM"], ["6:00 AM – 2:00 AM"], ["8:00 AM – 10:00 PM"]],
  );
});
