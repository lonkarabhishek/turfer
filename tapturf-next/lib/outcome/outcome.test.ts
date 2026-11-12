import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DAYS, HOURS, KINDS, OUTCOMES, OUTCOME_COPY, REASONS, hourLabel, istDay, outcomeBody, parseOutcome, shortName, startHour, thanksFor, type OutcomeAnswer } from "./outcome";

// A player's answer to "Did you get a slot?", and the card's words. Made-up turfs.

const TURF = "eeeeeeee-eeee-4eee-8eee-000000000001";
const base = { turf: TURF, kind: "call", source: "turf_bar", outcome: "got_slot" };
const ans = (o: Partial<OutcomeAnswer> = {}): OutcomeAnswer => ({ turf: TURF, kind: "call", source: "turf_bar", outcome: "got_slot", reason: null, day: null, hour: null, signedIn: false, ...o });

test("the answers the card can send, each read back whole", () => {
  const all: OutcomeAnswer[] = [
    ans({ day: "today", hour: 19, signedIn: true }),
    ans({ kind: "whatsapp", source: "turf_slots", day: "tomorrow", hour: 0 }),
    ans({ day: "today" }),
    ans(),
    ans({ outcome: "not_this_time", reason: "full", day: "tomorrow", hour: 23 }),
    ans({ outcome: "not_this_time", reason: "full" }),
    ...(["price", "no_reply", "wrong_number", "just_asking"] as const).map((reason) => ans({ outcome: "not_this_time", reason })),
    ans({ outcome: "not_this_time" }),
    ans({ outcome: "deciding" }),
    ans({ outcome: "dismissed" }),
  ];
  for (const a of all) assert.deepEqual(parseOutcome(JSON.parse(JSON.stringify(outcomeBody(a)))), a);
  assert.deepEqual(outcomeBody(ans({ day: "today", hour: 19 })), { turf: TURF, kind: "call", source: "turf_bar", outcome: "got_slot", day: "today", hour: 19, signed: false });
  assert.deepEqual(Object.keys(outcomeBody(ans({ outcome: "dismissed" }))).sort(), ["kind", "outcome", "signed", "source", "turf"], "nothing else goes with an answer");
  assert.equal(parseOutcome({ ...base, turf: TURF.toUpperCase() })?.turf, TURF);
  assert.equal(parseOutcome(base)?.signedIn, false, "no flag is signed out");
});

test("anything that isn't an answer is refused whole", () => {
  const bad: unknown[] = [
    null, "x", [], {}, [base],
    { ...base, turf: "nope" }, { ...base, turf: 5 }, { ...base, kind: "sms" }, { ...base, kind: undefined }, { ...base, outcome: "booked" }, { ...base, outcome: null },
    { ...base, source: "Turf Bar" }, { ...base, source: "" }, { ...base, source: "x".repeat(41) }, { ...base, source: 7 },
    { ...base, reason: "full" }, { ...base, outcome: "deciding", reason: "price" }, { ...base, outcome: "dismissed", reason: "no_reply" },
    { ...base, outcome: "not_this_time", reason: "rain" }, { ...base, outcome: "not_this_time", reason: 3 },
    { ...base, outcome: "not_this_time", reason: "price", day: "today" }, { ...base, outcome: "not_this_time", day: "today" }, { ...base, outcome: "deciding", day: "today" }, { ...base, outcome: "dismissed", day: "tomorrow" },
    { ...base, day: "later" }, { ...base, day: "2026-11-20" }, { ...base, day: 1 },
    { ...base, hour: 19 }, { ...base, day: "today", hour: 24 }, { ...base, day: "today", hour: -1 }, { ...base, day: "today", hour: 7.5 }, { ...base, day: "today", hour: "19" },
    { ...base, signed: "yes" }, { ...base, signed: 1 },
    // Nothing about a person can ride along.
    { ...base, user: "someone" }, { ...base, phone: "9000000001" }, { ...base, name: "Asha" }, { ...base, note: "hello" }, { ...base, date: "2026-11-20" },
  ];
  for (const b of bad) assert.equal(parseOutcome(b), null, JSON.stringify(b));
});

test("the lists the database's checks are written from", () => {
  assert.deepEqual([...OUTCOMES], ["got_slot", "not_this_time", "deciding", "dismissed"]);
  assert.deepEqual([...REASONS], ["full", "price", "no_reply", "wrong_number", "just_asking"]);
  assert.deepEqual([...KINDS], ["call", "whatsapp"]);
  assert.deepEqual([...DAYS], ["today", "tomorrow"]);
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261113_contact_outcomes.sql"), "utf8");
  for (const list of [OUTCOMES, REASONS, KINDS, DAYS]) assert.ok(sql.includes(`(${list.map((v) => `'${v}'`).join(", ")})`), `the migration checks ${list.join(", ")}`);
  assert.ok(sql.includes("'^[a-z0-9_]{1,40}$'"), "and a source's shape");
});

test("the hour row: 5 AM to 1 AM, opened at the next hour in India", () => {
  assert.deepEqual(HOURS.map(hourLabel), ["5 AM", "6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM", "10 PM", "11 PM", "12 AM", "1 AM"]);
  assert.equal(new Set(HOURS).size, 21);
  const at = (ist: string) => Date.parse(`2026-11-13T${ist}:00+05:30`);
  assert.deepEqual(
    ["18:20", "18:00", "09:59", "22:30", "23:10", "00:40", "01:05", "03:30", "04:00", "04:59"].map((t) => startHour("today", at(t))),
    [19, 19, 10, 23, 0, 1, 5, 5, 5, 5],
    "the next full hour; in the small hours, 5 AM",
  );
  for (const t of ["06:00", "18:20", "23:50"]) assert.equal(startHour("tomorrow", at(t)), 18, "tomorrow opens at 6 PM");
  for (const d of DAYS) for (let h = 0; h < 24; h++) assert.ok(HOURS.includes(startHour(d, at(`${String(h).padStart(2, "0")}:15`))), "always an hour that is in the row");
  assert.deepEqual([istDay(Date.parse("2026-11-13T18:29:59Z")), istDay(Date.parse("2026-11-13T18:30:00Z"))], ["2026-11-13", "2026-11-14"], "India's day turns at 18:30 UTC");
});

test("the card's words: short, friendly, and never a booking", () => {
  const C = OUTCOME_COPY;
  assert.equal(`${C.ask("Kings Turf")} ${C.askLine}`, "Back from Kings Turf? Did you get a slot?");
  assert.deepEqual([C.yes, C.no, C.deciding], ["Yes! 🎉", "Not this time", "Still deciding"]);
  assert.deepEqual([C.whenPlay, C.whenWanted, C.why], ["Nice! When are you playing?", "Which time did you want?", "Ah, what happened?"]);
  assert.deepEqual([C.days.today, C.days.tomorrow, C.days.later, C.skip], ["Today", "Tomorrow", "Later", "Skip"]);
  assert.deepEqual(REASONS.map((r) => C.reasons[r]), ["Slot was full", "Too pricey", "No reply", "Wrong number", "Just asking"]);
  assert.equal(thanksFor({ outcome: "got_slot", reason: null }), "Have a great game! ⚽");
  assert.equal(thanksFor({ outcome: "not_this_time", reason: "full" }), "Got it, thanks! This helps us show free hours.");
  assert.equal(thanksFor({ outcome: "not_this_time", reason: "wrong_number" }), "Thanks for telling us. We'll check this number.");
  for (const reason of ["price", "no_reply", "just_asking", null] as const) assert.equal(thanksFor({ outcome: "not_this_time", reason }), "Thanks! 🙌");
  assert.equal(thanksFor({ outcome: "deciding", reason: null }), "No worries! Good luck 🙂");
  assert.equal(C.freeLink("Pune"), "See turfs with free hours in Pune");
  const words: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") words.push(v);
    else if (typeof v === "function") words.push(String((v as (s: string) => string)("Kings Turf")));
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(C);
  assert.ok(words.length > 20);
  for (const w of words) {
    assert.doesNotMatch(w, /book|instant|guarantee/i, w);
    assert.doesNotMatch(w, /[—–]/, w);
    assert.ok(w.length <= 50, `short: ${w}`);
  }
  // The card itself adds no words of its own to what a player reads.
  const card = fs.readFileSync(path.join(process.cwd(), "components/outcome/OutcomeCard.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.doesNotMatch(card, /book/i, "no \"book\" anywhere in the card");
  assert.deepEqual([...card.matchAll(/>\s*([A-Z][a-z]+[^<{]*)</g)].map((m) => m[1].trim()), [], "its text all comes from OUTCOME_COPY");
});

test("a long turf name is cut to one short line", () => {
  assert.equal(shortName("  Kings   Turf "), "Kings Turf");
  const long = shortName("The Very Long Named Sports Arena And Box Cricket Ground Of Gachibowli");
  assert.ok(long.length <= 40 && long.endsWith("…"));
});
