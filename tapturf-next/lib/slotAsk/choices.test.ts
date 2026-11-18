import { test } from "node:test";
import assert from "node:assert/strict";
import { USUAL_STARTS, askDays, defaultDay, findTime, freeKeys, istToday, playersStart, sameTime, sportChoices, stepPlayers, summary, type AskDay } from "./choices";
import { freeDays, slotDays, type PublicAvailability, type SlotHours } from "../availability/slots";
import { PLAYERS_MAX, PLAYERS_MIN } from "./ask";

// The days and start times "Ask for a slot" offers. Made-up turfs; India time throughout.

/** An instant from India's clock: ist("2026-11-18", "18:20"). */
const ist = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+05:30`);
const NONE: SlotHours = { opening_hours: null, start_time: null, end_time: null, is_24x7: null, closed_days: null };
const hours = (o: Partial<SlotHours>): SlotHours => ({ ...NONE, ...o });
const SIX_TO_MIDNIGHT = hours({ start_time: "06:00:00", end_time: "00:00:00" });
const labels = (d: AskDay) => d.times.map((t) => t.label);
/** Wed 18 Nov 2026, 6:20 PM. */
const NOW = ist("2026-11-18", "18:20");

test("seven days: Today, Tomorrow, then the next five, by India's calendar", () => {
  const days = askDays(SIX_TO_MIDNIGHT, NOW);
  assert.deepEqual(days.map((d) => d.chip), ["Today", "Tomorrow", "Fri", "Sat", "Sun", "Mon", "Tue"]);
  assert.deepEqual(days.map((d) => d.sub), ["18 Nov", "19 Nov", "20 Nov", "21 Nov", "22 Nov", "23 Nov", "24 Nov"]);
  assert.deepEqual(days.map((d) => d.date), ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24"]);
  assert.equal(days[0].heading, "Today, Wed 18 Nov");
  assert.equal(new Set(days.map((d) => d.id)).size, 7);
  // 11:50 PM in London on the 17th is 5:20 AM on the 18th in India: the device's zone never matters.
  assert.equal(askDays(SIX_TO_MIDNIGHT, Date.parse("2026-11-17T23:50:00Z"))[0].date, "2026-11-18");
  assert.equal(istToday(Date.parse("2026-11-17T18:29:00Z")), "2026-11-17");
  assert.equal(istToday(Date.parse("2026-11-17T18:30:00Z")), "2026-11-18");
});

test("only the hours the turf is open, and today's past hours are left out", () => {
  const days = askDays(SIX_TO_MIDNIGHT, NOW);
  assert.deepEqual(labels(days[0]), ["7 PM", "8 PM", "9 PM", "10 PM", "11 PM"], "at 6:20 PM the 6 PM start has gone");
  assert.equal(days[1].times.length, 18);
  assert.deepEqual([labels(days[1])[0], labels(days[1]).at(-1)], ["6 AM", "11 PM"]);
  assert.ok(days.every((d) => d.state === "open" && !d.guessed));
  assert.deepEqual(days[0].times[0], { key: "2026-11-18T19:00", ms: ist("2026-11-18", "19:00"), date: "2026-11-18", hour: 19, minute: 0, label: "7 PM", afterMidnight: false });
  // On the hour exactly, that hour has started.
  assert.equal(labels(askDays(SIX_TO_MIDNIGHT, ist("2026-11-18", "19:00"))[0])[0], "8 PM");
  assert.equal(labels(askDays(SIX_TO_MIDNIGHT, ist("2026-11-18", "18:59"))[0])[0], "7 PM");
});

test("the same hours as the Free slots card, slot for slot", () => {
  for (const h of [SIX_TO_MIDNIGHT, hours({ is_24x7: true }), hours({ start_time: "06:30", end_time: "02:00" }), hours({ opening_hours: { monday: "6–10 AM 4 PM–12 AM", tuesday: "Closed", wednesday: "6 AM–11 PM", thursday: "6 AM–11 PM", friday: "6 AM–1 AM", saturday: "Open 24 hours", sunday: "7 AM–10 PM" } as SlotHours["opening_hours"] })]) {
    for (const now of [NOW, ist("2026-11-21", "00:40"), ist("2026-11-23", "09:05")]) {
      const card = slotDays(h, now);
      const ask = askDays(h, now);
      assert.deepEqual(ask.map((d) => [d.id, d.state, d.times.map((t) => t.key)]), card.map((d) => [`${d.date}${d.night ? "n" : ""}`, d.state, d.slots.map((s) => s.key)]));
    }
  }
});

test("no hour left today: the sheet opens on tomorrow", () => {
  const late = askDays(hours({ start_time: "06:00", end_time: "22:00" }), ist("2026-11-18", "21:30"));
  assert.deepEqual(labels(late[0]), []);
  assert.equal(late[0].state, "open");
  assert.equal(defaultDay(late), 1);
  assert.equal(defaultDay(askDays(SIX_TO_MIDNIGHT, NOW)), 0, "an hour left today: today");
});

test("a closed day offers nothing and is never the day the sheet opens on", () => {
  // Wed 18 Nov: closed on Wednesdays.
  const days = askDays(hours({ start_time: "06:00", end_time: "23:00", closed_days: "Wednesday" }), ist("2026-11-18", "10:00"));
  assert.deepEqual([days[0].state, days[0].times.length, days[0].guessed], ["closed", 0, false]);
  assert.equal(defaultDay(days), 1);
  assert.equal(days[1].times.length, 17);
  assert.equal(days[6].state, "open", "next Tuesday");
  const perDay = askDays(hours({ opening_hours: { monday: "6 AM–11 PM", tuesday: "6 AM–11 PM", wednesday: "Closed", thursday: "Closed", friday: "6 AM–11 PM", saturday: "6 AM–11 PM", sunday: "6 AM–11 PM" } as SlotHours["opening_hours"] }), ist("2026-11-18", "10:00"));
  assert.deepEqual(perDay.map((d) => d.state), ["closed", "closed", "open", "open", "open", "open", "open"]);
  assert.equal(defaultDay(perDay), 2, "the first day with an hour");
  // Every day closed: nothing to open on but today.
  const shut = askDays(hours({ start_time: "06:00", end_time: "23:00", closed_days: "Monday Tuesday Wednesday Thursday Friday Saturday Sunday" }), NOW);
  assert.equal(defaultDay(shut), 0);
  assert.ok(shut.every((d) => d.times.length === 0));
});

test("hours unknown: 5 AM to 1 AM, said to be a guess, past hours left out", () => {
  const days = askDays(NONE, NOW);
  assert.ok(days.every((d) => d.state === "unknown" && d.guessed));
  assert.deepEqual(labels(days[0]), ["7 PM", "8 PM", "9 PM", "10 PM", "11 PM", "12 AM", "1 AM"]);
  assert.deepEqual(labels(days[1]), ["5 AM", "6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM", "10 PM", "11 PM", "12 AM", "1 AM"]);
  assert.equal(USUAL_STARTS.length, 21);
  const midnight = days[0].times.find((t) => t.label === "12 AM")!;
  assert.deepEqual([midnight.key, midnight.date, midnight.hour, midnight.afterMidnight], ["2026-11-19T00:00", "2026-11-19", 0, true], "tonight's midnight is tomorrow's date");
  assert.equal(new Set(days.flatMap((d) => d.times.map((t) => t.key))).size, days.flatMap((d) => d.times).length, "no start offered twice");
  // The column default (00:00 to 23:59, no 24x7 flag) is not a fact: unknown too.
  assert.ok(askDays(hours({ start_time: "00:00:00", end_time: "23:59:00" }), NOW)[0].guessed);
  // Some days known, some not: only the unknown ones are guessed.
  const mixed = askDays(hours({ opening_hours: { wednesday: "6 AM–11 PM", thursday: "Open 24 hours" } as SlotHours["opening_hours"] }), NOW);
  assert.deepEqual(mixed.slice(0, 3).map((d) => [d.state, d.guessed]), [["open", false], ["open", false], ["unknown", true]]);
});

test("a turf open past midnight: the late hours belong to their night, and last night's leftovers lead until they are over", () => {
  const h = hours({ start_time: "06:00", end_time: "02:00" });
  const eve = askDays(h, NOW);
  assert.deepEqual(labels(eve[0]), ["7 PM", "8 PM", "9 PM", "10 PM", "11 PM", "12 AM", "1 AM"]);
  assert.deepEqual(eve[0].times.filter((t) => t.afterMidnight).map((t) => t.key), ["2026-11-19T00:00", "2026-11-19T01:00"]);
  // 12:40 AM on Thursday: Wednesday night's 1 AM is still to come.
  const night = askDays(h, ist("2026-11-19", "00:40"));
  assert.deepEqual([night[0].chip, night[0].night, labels(night[0])], ["Wed night", true, ["1 AM"]]);
  assert.equal(night[1].chip, "Today");
  assert.equal(defaultDay(night), 1, "the sheet opens on today, not on the half hour left of last night");
  assert.equal(night.length, 8);
});

test("a turf that opens on the half hour offers its own starts", () => {
  const d = askDays(hours({ start_time: "06:30", end_time: "22:30" }), ist("2026-11-18", "05:00"))[0];
  assert.deepEqual([labels(d)[0], labels(d).at(-1), d.times.length], ["6:30 AM", "9:30 PM", 16]);
  assert.deepEqual([d.times[0].hour, d.times[0].minute], [6, 30]);
  assert.equal(summary(d.times[0], 90), "Wed 18 Nov, 6:30 AM to 8 AM");
});

test("changing the day keeps the time where the new day has it", () => {
  const days = askDays(hours({ opening_hours: { wednesday: "6 AM–11 PM", thursday: "4 PM–10 PM", friday: "Closed" } as SlotHours["opening_hours"] }), ist("2026-11-18", "08:00"));
  const seven = days[0].times.find((t) => t.label === "7 PM")!;
  assert.equal(sameTime(days[1], seven)?.key, "2026-11-19T19:00");
  assert.equal(sameTime(days[1], days[0].times.find((t) => t.label === "9 AM")!), null, "Thursday opens at 4 PM");
  assert.equal(sameTime(days[2], seven), null);
  assert.equal(sameTime(days[1], null), null);
  assert.deepEqual(findTime(days, "2026-11-19T19:00"), { day: 1, time: sameTime(days[1], seven) });
  assert.equal(findTime(days, "2026-11-18T07:00"), null, "an hour that has passed is not found");
  assert.equal(summary(seven, 60), "Wed 18 Nov, 7 PM to 8 PM");
  assert.equal(summary(seven, 180), "Wed 18 Nov, 7 PM to 10 PM");
});

test("free: what the owner's fresh marks leave free, exactly the Free slots card's hours; nothing when the marks are old or missing", () => {
  const days = askDays(SIX_TO_MIDNIGHT, NOW);
  const avail = (o: Partial<PublicAvailability> = {}): PublicAvailability => ({ updatedAt: new Date(NOW - 2 * 3_600_000).toISOString(), now: new Date(NOW).toISOString(), booked: ["2026-11-18T19:00", "2026-11-18T20:00", "2026-11-19T06:00"], requests: false, ...o });
  const free = freeKeys(days, avail(), NOW);
  assert.ok(!free.has("2026-11-18T19:00") && !free.has("2026-11-19T06:00"));
  assert.deepEqual(days[0].times.filter((t) => free.has(t.key)).map((t) => t.label), ["9 PM", "10 PM", "11 PM"]);
  const card = freeDays(slotDays(SIX_TO_MIDNIGHT, NOW), new Set(avail().booked));
  assert.deepEqual([...free].sort(), card.flatMap((d) => d.free.map((s) => s.key)).sort(), "the card's free hours, key for key");
  // The other hours are never hidden: every start is still offered.
  assert.deepEqual(labels(days[0]), ["7 PM", "8 PM", "9 PM", "10 PM", "11 PM"]);
  assert.equal(freeKeys(days, null, NOW).size, 0, "no marks");
  assert.equal(freeKeys(days, avail({ updatedAt: new Date(NOW - 25 * 3_600_000).toISOString() }), NOW).size, 0, "marks over 24 hours old");
  assert.equal(freeKeys(askDays(NONE, NOW), avail(), NOW).size, 0, "never on hours that are a guess");
});

test("sports: the turf's own labels, each once; the picker shows only for more than one", () => {
  assert.deepEqual(sportChoices(["Box Cricket", " Football ", "box  cricket", "", "Pickleball"]), ["Box Cricket", "Football", "Pickleball"]);
  assert.deepEqual(sportChoices(null), []);
  assert.deepEqual(sportChoices(["Football"]), ["Football"]);
});

test("players: blank until asked; + starts at 10 for a team sport, 4 otherwise; below 2 is blank again", () => {
  assert.deepEqual([playersStart("Football"), playersStart("Box Cricket"), playersStart("Badminton"), playersStart("Pickleball"), playersStart(null)], [10, 10, 4, 4, 10]);
  assert.equal(stepPlayers(null, 1, "Football"), 10);
  assert.equal(stepPlayers(null, -1, "Football"), null);
  assert.equal(stepPlayers(10, 1, null), 11);
  assert.equal(stepPlayers(PLAYERS_MIN, -1, null), null);
  assert.equal(stepPlayers(3, -1, null), 2);
  assert.equal(stepPlayers(PLAYERS_MAX, 1, null), PLAYERS_MAX);
});
