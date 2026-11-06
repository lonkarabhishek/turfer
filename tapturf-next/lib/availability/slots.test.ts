import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  AHEAD_DAYS,
  BOOKING_LINE,
  FRESH_HOURS,
  MAX_CHANGES,
  MAX_MARKS,
  PLAYER_COPY,
  SLOT_MINUTES,
  agoText,
  clientNow,
  clockLabel,
  closeChoices,
  contactLinks,
  daySpans,
  freeDays,
  hasUsableHours,
  hoursPatch,
  isFresh,
  isSlotKey,
  istDate,
  istStamp,
  keyTime,
  nextTickMs,
  noFreeLine,
  OWNER_NO_NUMBER,
  ownerDefault,
  ownerLead,
  ownerStatus,
  parseOwner,
  parsePublic,
  playerDefault,
  playerFooter,
  requestFooter,
  slotDays,
  slotKey,
  slotMessage,
  updatedLine,
  wholeDay,
  type SlotDay,
  type SlotHours,
} from "./slots";
import { isClosedDay, type DayName } from "../utils/hours";
import { bannedCopy } from "../seo/defaults";

/** An India wall-clock time as an instant: ist("2026-11-06 21:10"). */
const ist = (s: string) => Date.parse(`${s.replace(" ", "T")}:00+05:30`);
const H = (o: Partial<SlotHours>): SlotHours => ({ opening_hours: null, start_time: null, end_time: null, is_24x7: null, closed_days: null, ...o });
const keys = (d: SlotDay) => d.slots.map((s) => s.key);
const labels = (d: SlotDay) => d.slots.map((s) => s.label);
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

const OVERNIGHT = H({ start_time: "06:00:00", end_time: "02:00:00" });
const ALLDAY = H({ is_24x7: true });

test("1. 06:00 to 23:00: 17 one-hour slots, 6 AM to 10 PM", () => {
  assert.equal(SLOT_MINUTES, 60);
  const [today] = slotDays(H({ start_time: "06:00:00", end_time: "23:00:00" }), ist("2026-11-05 05:00"));
  assert.equal(today.chip, "Today");
  assert.equal(today.heading, "Today, Thu 5 Nov");
  assert.equal(today.open, "6 AM to 11 PM");
  assert.equal(today.slots.length, 17);
  assert.equal(keys(today)[0], "2026-11-05T06:00");
  assert.equal(keys(today).at(-1), "2026-11-05T22:00");
  assert.equal(today.slots[13].range, "7 PM to 8 PM");
  assert.ok(today.slots.every((s) => !s.afterMidnight));
});

test("2. 6 AM to 2 AM at Fri 21:10: Today is 10 PM, 11 PM, then 12 AM and 1 AM after midnight", () => {
  const days = slotDays(OVERNIGHT, ist("2026-11-06 21:10"));
  assert.equal(days.length, 7, "no night chip: last night's hours are over");
  const [today] = days;
  assert.equal(today.heading, "Today, Fri 6 Nov");
  assert.equal(today.open, "6 AM to 2 AM");
  assert.deepEqual(labels(today), ["10 PM", "11 PM", "12 AM", "1 AM"]);
  assert.deepEqual(keys(today), ["2026-11-06T22:00", "2026-11-06T23:00", "2026-11-07T00:00", "2026-11-07T01:00"]);
  assert.deepEqual(today.slots.map((s) => s.afterMidnight), [false, false, true, true]);
  assert.deepEqual(days.map((d) => d.chip), ["Today", "Tomorrow", "Sun", "Mon", "Tue", "Wed", "Thu"]);
});

test("3. the same turf at Sat 00:30: a Fri night chip with 1 AM, then Today; gone at 01:00", () => {
  const days = slotDays(OVERNIGHT, ist("2026-11-07 00:30"));
  assert.equal(days.length, 8);
  const [night, today] = days;
  assert.equal(night.chip, "Fri night");
  assert.equal(night.night, true);
  assert.equal(night.heading, "Friday night, after midnight");
  assert.equal(night.date, "2026-11-06");
  assert.deepEqual(keys(night), ["2026-11-07T01:00"]);
  assert.equal(today.chip, "Today");
  assert.equal(today.heading, "Today, Sat 7 Nov");
  assert.equal(keys(today)[0], "2026-11-07T06:00");
  assert.equal(keys(today).at(-1), "2026-11-08T01:00");
  assert.equal(ownerDefault(days), 0, "the owner starts on the night chip while it has an hour");
  const later = slotDays(OVERNIGHT, ist("2026-11-07 01:00"));
  assert.equal(later.length, 7);
  assert.equal(later[0].chip, "Today");
});

test("4. 24 hours at 19:20: Today 8 PM to 11 PM; Tomorrow 24 slots, none after midnight; no night chip at 00:30", () => {
  const [today, tomorrow] = slotDays(ALLDAY, ist("2026-11-05 19:20"));
  assert.deepEqual(labels(today), ["8 PM", "9 PM", "10 PM", "11 PM"]);
  assert.equal(today.open, "24 hours");
  assert.equal(tomorrow.slots.length, 24);
  assert.equal(keys(tomorrow)[0], "2026-11-06T00:00");
  assert.equal(keys(tomorrow).at(-1), "2026-11-06T23:00");
  assert.ok(tomorrow.slots.every((s) => !s.afterMidnight));
  const late = slotDays(ALLDAY, ist("2026-11-06 00:30"));
  assert.equal(late.length, 7);
  assert.equal(late[0].chip, "Today");
  assert.equal(late[0].slots[0].key, "2026-11-06T01:00");
});

test("5. 'Open 24 hours' and 12 AM to 12 AM: 24 slots; the 00:00 to 23:59 column default is no hours", () => {
  for (const h of [H({ opening_hours: { daily: "Open 24 hours" } }), H({ opening_hours: { daily: "12 AM–12 AM" } })]) {
    const [, tomorrow] = slotDays(h, ist("2026-11-05 12:00"));
    assert.equal(tomorrow.slots.length, 24);
    assert.ok(hasUsableHours(h));
  }
  const def = H({ start_time: "00:00:00", end_time: "23:59:00" });
  assert.equal(hasUsableHours(def), false);
  assert.equal(slotDays(def, ist("2026-11-05 12:00"))[0].state, "unknown");
  assert.equal(hasUsableHours(H({})), false);
  assert.ok(hasUsableHours(OVERNIGHT));
});

test("6. 6:30 AM to 11 PM: 6:30 AM to 9:30 PM", () => {
  const [today] = slotDays(H({ opening_hours: { daily: "6:30 AM – 11 PM" } }), ist("2026-11-05 05:00"));
  assert.equal(labels(today)[0], "6:30 AM");
  assert.equal(labels(today).at(-1), "9:30 PM");
  assert.equal(today.slots.length, 16);
  assert.equal(today.slots[0].range, "6:30 AM to 7:30 AM");
});

test("7. split hours '6–8 AM 4 PM–12 AM': 6 AM, 7 AM, then 4 PM to 11 PM", () => {
  const [today] = slotDays(H({ opening_hours: { daily: "6–8 AM 4 PM–12 AM" } }), ist("2026-11-05 05:00"));
  assert.deepEqual(labels(today), ["6 AM", "7 AM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM", "10 PM", "11 PM"]);
  assert.equal(today.open, "6 AM to 8 AM, 4 PM to 12 AM");
});

test("8. Fri 6 AM to 2 AM and Sat open 24 hours: Sat 12 AM and 1 AM stay with Friday", () => {
  const h = H({ opening_hours: { Friday: "6 AM–2 AM", Saturday: "Open 24 hours" } });
  const days = slotDays(h, ist("2026-11-06 05:00"));
  const [fri, sat] = days;
  assert.ok(keys(fri).includes("2026-11-07T00:00") && keys(fri).includes("2026-11-07T01:00"));
  assert.ok(!keys(sat).includes("2026-11-07T00:00") && !keys(sat).includes("2026-11-07T01:00"));
  assert.equal(keys(sat)[0], "2026-11-07T02:00");
  assert.equal(sat.slots.length, 22);
  assert.equal(days[2].state, "unknown", "Sunday is not listed");
  const all = days.flatMap(keys);
  assert.equal(new Set(all).size, all.length, "no hour twice");
});

test("9. day states: closed_days, a per-day Closed, a whole-week text under one day, a missing day", () => {
  assert.equal(daySpans(H({ start_time: "06:00", end_time: "23:00", closed_days: "Mondays" }), "Monday").state, "closed");
  assert.equal(daySpans(H({ start_time: "06:00", end_time: "23:00", closed_days: "Mondays" }), "Tuesday").state, "open");
  const per = H({ opening_hours: { Monday: "Closed", Tuesday: "Mon–Fri: 5 AM–11 PM, Sat & Sun: 5 AM–1 AM", Wednesday: "6 AM–10 PM" } });
  assert.equal(daySpans(per, "Monday").state, "closed");
  assert.equal(daySpans(per, "Tuesday").state, "unknown");
  assert.equal(daySpans(per, "Thursday").state, "unknown");
  assert.deepEqual(daySpans(per, "Wednesday"), { state: "open", spans: [[360, 1320]] });
  assert.deepEqual(daySpans(OVERNIGHT, "Friday").spans, [[360, 1560]]);
  assert.deepEqual(daySpans(H({ start_time: "06:00", end_time: "06:00" }), "Friday").spans, [[360, 1800]], "6 AM to 6 AM is 24 hours");
  const days = slotDays(H({ start_time: "06:00", end_time: "23:00", closed_days: "Monday" }), ist("2026-11-05 05:00"));
  const mon = days.find((d) => d.weekday === "Monday")!;
  assert.equal(mon.state, "closed");
  assert.deepEqual(mon.slots, []);
  assert.equal(mon.open, null);
});

test("10. an hour starting exactly now is over; 18:30 UTC is India midnight", () => {
  const [today] = slotDays(H({ start_time: "06:00", end_time: "23:00" }), ist("2026-11-05 19:00"));
  assert.equal(today.slots[0].label, "8 PM");
  assert.equal(istDate(Date.parse("2026-11-05T18:30:00Z")), "2026-11-06");
  assert.equal(istDate(Date.parse("2026-11-05T18:29:59Z")), "2026-11-05");
  assert.equal(slotKey(Date.parse("2026-11-05T18:30:00Z")), "2026-11-06T00:00");
  assert.equal(keyTime("2026-11-06T00:00"), Date.parse("2026-11-05T18:30:00Z"));
  assert.ok(Number.isNaN(keyTime("2026-11-06T24:00")));
  assert.equal(clockLabel(0), "12 AM");
  assert.equal(clockLabel(390), "6:30 AM");
  assert.equal(clockLabel(720), "12 PM");
  assert.equal(clockLabel(1140), "7 PM");
  assert.equal(clockLabel(1500), "1 AM");
});

test("10b. the screen works the slots out again on the minute an hour starts, and when the marks stop being fresh", () => {
  const h = H({ start_time: "06:00", end_time: "23:00" });
  // Mounted at 18:58:59.900: the next recompute is at 18:59:00, then 19:00:00, when 7 PM is gone.
  let t = ist("2026-11-05 18:58") + 59_900;
  assert.equal(slotDays(h, t)[0].slots[0].label, "7 PM");
  const d1 = nextTickMs(t);
  assert.ok(d1 >= 100 && d1 <= 150, `${d1}`);
  t += d1;
  const d2 = nextTickMs(t);
  assert.ok(d2 >= 59_900 && d2 <= 60_000, `${d2}`);
  t += d2;
  assert.ok(t >= ist("2026-11-05 19:00") && t < ist("2026-11-05 19:00") + 1000, "lands just after 7 PM starts");
  assert.equal(slotDays(h, t)[0].slots[0].label, "8 PM", "7 PM is gone the moment it starts");
  assert.equal(slotDays(h, ist("2026-11-05 19:00"))[0].slots[0].label, "8 PM", "at 19:00:00.000 exactly");
  // Exactly on a minute: the next one, a whole minute on.
  assert.ok(nextTickMs(ist("2026-11-05 19:00")) >= 60_000);
  // Freshness lapses in 5 s: wait 5 s, not to the minute; once lapsed, back to the minute.
  const now = ist("2026-11-05 19:00") + 30_000;
  const updated = iso(now - FRESH_HOURS * HOUR + 5_000);
  const d3 = nextTickMs(now, updated);
  assert.ok(d3 >= 5_000 && d3 <= 5_050, `${d3}`);
  assert.equal(isFresh(updated, now + d3), false, "stale when it fires");
  const d4 = nextTickMs(now, iso(now - FRESH_HOURS * HOUR - 1));
  assert.ok(d4 >= 30_000 && d4 <= 30_050, `${d4}`);
  assert.ok(nextTickMs(now, null) <= 30_050);
});

test("11. chips across a month end", () => {
  const days = slotDays(H({ start_time: "06:00", end_time: "23:00" }), ist("2026-11-27 10:00"));
  assert.deepEqual(days.map((d) => d.chip), ["Today", "Tomorrow", "Sun", "Mon", "Tue", "Wed", "Thu"]);
  assert.deepEqual(days.map((d) => d.date), ["2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03"]);
  assert.equal(days[4].heading, "Tuesday 1 Dec");
  assert.equal(days[4].slots[0].key, "2026-12-01T06:00");
});

test("12. fresh for 24 hours (a time ahead counts); how long ago", () => {
  assert.equal(FRESH_HOURS, 24);
  const now = ist("2026-11-06 23:30");
  assert.equal(isFresh(iso(now - 24 * HOUR + 60_000), now), true, "23 h 59 min");
  assert.equal(isFresh(iso(now - 24 * HOUR), now), false, "24 h");
  assert.equal(isFresh(iso(now + 5 * 60_000), now), true, "ahead of this clock");
  assert.equal(isFresh(null, now), false);
  assert.equal(isFresh("junk", now), false);
  assert.equal(agoText(iso(now - 30_000), now), "just now");
  assert.equal(agoText(iso(now + 60_000), now), "just now");
  assert.equal(agoText(iso(now - 12 * 60_000), now), "12 min ago");
  assert.equal(agoText(iso(now - 2 * HOUR - 59 * 60_000), now), "2 h ago");
  assert.equal(agoText(iso(now - 25 * HOUR), now), "1 day ago");
  assert.equal(agoText(iso(now - 3 * 24 * HOUR - HOUR), now), "3 days ago");
  assert.equal(istStamp("2026-11-03T15:45:00Z"), "3 Nov, 9:15 PM");
  assert.equal(updatedLine("2 h ago"), "Updated 2 h ago by the owner");
});

test("13. the owner's line in all four states", () => {
  const now = ist("2026-11-05 13:00");
  assert.deepEqual(ownerStatus(null, now), {
    kind: "never",
    line: "Players don't see this yet. Mark what's booked; players will see the rest as free.",
    button: "Show free hours to players",
  });
  assert.deepEqual(ownerStatus(iso(now - 12 * 60_000), now), { kind: "live", line: "Players see this · updated 12 min ago", button: "All correct" });
  assert.deepEqual(ownerStatus(iso(now - 21 * HOUR - 10 * 60_000), now), { kind: "ending", line: "Players see this for 3 more h · updated 21 h ago", button: "All correct" });
  assert.deepEqual(ownerStatus("2026-11-03T15:45:00Z", now), { kind: "hidden", line: "Hidden from players · last updated 3 Nov, 9:15 PM", button: "All correct" });
});

test("13b. a page with no number: players see nothing, so the owner's lines never say they do", () => {
  const now = ist("2026-11-05 13:00");
  for (const at of [null, iso(now - 12 * 60_000), iso(now - 21 * HOUR - 10 * 60_000), "2026-11-03T15:45:00Z"]) {
    const s = ownerStatus(at, now, false);
    assert.deepEqual(s, { kind: "no_number", line: OWNER_NO_NUMBER.line, button: "All correct" }, String(at));
    assert.doesNotMatch(s.line, /Players see this/);
    assert.deepEqual(ownerStatus(at, now, true), ownerStatus(at, now), "with a number, as before");
  }
  assert.equal(OWNER_NO_NUMBER.line, "Players see your free slots once your page has a number to call or WhatsApp.");
  assert.doesNotMatch(ownerLead(false), /Players see/);
  assert.match(ownerLead(true), /Players see your free hours on your page and contact you\./);
  for (const s of [OWNER_NO_NUMBER.line, OWNER_NO_NUMBER.link]) assert.equal(bannedCopy(s), null, s);
  // The owner's own words may say "booked" (the hour's mark), never the ruled-out phrasings.
  for (const s of [OWNER_NO_NUMBER.line, OWNER_NO_NUMBER.link, ownerLead(false), ownerLead(true)]) {
    assert.doesNotMatch(s, /take bookings|takes no bookings|book now|instant|guarantee/i, s);
  }
});

test("14. the clock: the server's when the device runs behind", () => {
  const server = "2026-11-05T13:00:00Z";
  assert.equal(clientNow(server, Date.parse(server) - 86_400_000), Date.parse(server));
  assert.equal(clientNow(server, Date.parse(server) + 60_000), Date.parse(server) + 60_000);
  assert.equal(clientNow(null, 5), 5);
  assert.equal(clientNow("junk", 5), 5);
});

test("15. the public answer: junk, malformed keys, stale", () => {
  const now = ist("2026-11-05 13:00");
  const good = { fresh: true, updated_at: iso(now - HOUR), now: iso(now), booked: ["2026-11-05T19:00", "2026-11-05T24:00", "2026-02-30T10:00", 5, "x"] };
  assert.deepEqual(parsePublic(good, now), { updatedAt: good.updated_at, now: good.now, booked: ["2026-11-05T19:00"], requests: false });
  // Booking requests: only a plain true turns the request button on.
  assert.equal(parsePublic({ ...good, requests: true }, now)?.requests, true);
  for (const r of [false, "true", 1, null, undefined, {}]) assert.equal(parsePublic({ ...good, requests: r }, now)?.requests, false, String(r));
  for (const junk of [null, undefined, "x", [], {}, { fresh: false }, { fresh: "true", updated_at: good.updated_at, now: good.now }, { ...good, now: undefined }, { ...good, updated_at: "junk" }])
    assert.equal(parsePublic(junk, now), null);
  assert.equal(parsePublic({ ...good, updated_at: iso(now - 25 * HOUR) }, now), null, "stale");
  assert.deepEqual(parsePublic({ ...good, booked: null }, now)?.booked, []);
  assert.equal(isSlotKey("2026-11-05T19:00"), true);
  for (const bad of ["2026-11-05T19:00:00", "2026-11-05 19:00", "2026-02-30T10:00", "2026-11-05T19:60", 7, null]) assert.equal(isSlotKey(bad), false);
  // The owner's answers.
  const owner = parseOwner({ ok: true, now: good.now, updated_at: null, grounds: 3, hours: { opening_hours: null, start_time: "06:00:00", end_time: "02:00:00", is_24x7: false, closed_days: null }, booked: ["2026-11-05T19:00", "nope"], saved: 1, changed: 1, skipped: 0 });
  assert.deepEqual(owner, { ok: true, now: good.now, updated_at: null, grounds: 3, hours: { opening_hours: null, start_time: "06:00:00", end_time: "02:00:00", is_24x7: false, closed_days: null }, booked: ["2026-11-05T19:00"], saved: 1, changed: 1, skipped: 0 });
  assert.deepEqual(parseOwner({ error: "forbidden" }), { error: "forbidden" });
  for (const junk of [null, [], {}, { ok: true }, { ok: true, now: good.now }, { ok: true, now: "junk", hours: {} }]) assert.equal(parseOwner(junk), null);
});

test("16. players' days: closed and unknown days dropped, a fully marked day kept with no free hour", () => {
  const h = H({ opening_hours: { Thursday: "6 PM–9 PM", Friday: "6 PM–8 PM", Saturday: "Closed" } });
  const days = slotDays(h, ist("2026-11-05 12:00"));
  const booked = new Set(["2026-11-06T18:00", "2026-11-06T19:00", "2026-11-05T19:00"]);
  const fd = freeDays(days, booked);
  assert.deepEqual(fd.map((d) => d.chip), ["Today", "Tomorrow"]);
  assert.deepEqual(fd[0].free.map((s) => s.label), ["6 PM", "8 PM"]);
  assert.deepEqual(fd[1].free, []);
  assert.equal(playerDefault(fd), 0);
  assert.equal(playerDefault(freeDays(days, new Set([...booked, "2026-11-05T18:00", "2026-11-05T20:00"]))), 0, "none free anywhere: the first");
  const fullToday = freeDays(days, new Set([...booked, "2026-11-05T18:00", "2026-11-05T20:00"]).add("x"));
  assert.deepEqual(fullToday.map((d) => d.free.length), [0, 0]);
  assert.equal(noFreeLine(fd[1]), "No free slots marked for tomorrow.");
});

test("17. the whole day: all free, all booked, mixed (exact undo), last night (none)", () => {
  const [today] = slotDays(H({ opening_hours: { daily: "6 PM–9 PM" } }), ist("2026-11-05 12:00"));
  const ks = keys(today);
  const allFree = wholeDay(today, new Set())!;
  assert.equal(allFree.status, "booked");
  assert.deepEqual(allFree.changes, ks.map((at) => ({ at, status: "booked" })));
  assert.deepEqual(allFree.undo, ks.map((at) => ({ at, status: "free" })));
  const allBooked = wholeDay(today, new Set(ks))!;
  assert.equal(allBooked.status, "free");
  assert.deepEqual(allBooked.changes, ks.map((at) => ({ at, status: "free" })));
  const mixed = wholeDay(today, new Set([ks[1]]))!;
  assert.equal(mixed.status, "booked");
  assert.deepEqual(mixed.changes, [{ at: ks[0], status: "booked" }, { at: ks[2], status: "booked" }]);
  assert.deepEqual(mixed.undo, [{ at: ks[0], status: "free" }, { at: ks[2], status: "free" }]);
  const [night] = slotDays(OVERNIGHT, ist("2026-11-07 00:30"));
  assert.equal(night.night, true);
  assert.equal(wholeDay(night, new Set()), null);
  const [done] = slotDays(H({ opening_hours: { daily: "6 PM–9 PM" } }), ist("2026-11-05 22:00"));
  assert.equal(wholeDay(done, new Set()), null, "no hours left");
  assert.equal(ownerDefault(slotDays(H({ opening_hours: { Thursday: "6 PM–9 PM" } }), ist("2026-11-05 22:00"))), 0, "nothing anywhere: Today");
});

test("18. the WhatsApp message: today, tomorrow, a later day, after midnight, last night", () => {
  const url = "https://www.tapturf.in/turf/night-owl";
  const days = slotDays(OVERNIGHT, ist("2026-11-05 12:00"));
  const msg = (d: SlotDay, i: number) => slotMessage({ turfName: "Night Owl", pageUrl: url, day: d, slot: d.slots[i] });
  const today = days[0];
  const seven = today.slots.findIndex((s) => s.label === "7 PM");
  assert.equal(msg(today, seven), `Hi! Is 7 PM to 8 PM today (Thu 5 Nov) free at *Night Owl*? I'd like to book it.\n\nFound you on TapTurf: ${url}`);
  assert.ok(msg(days[1], 0).includes("Is 6 AM to 7 AM tomorrow (Fri 6 Nov) free"));
  assert.ok(msg(days[4], 0).includes("Is 6 AM to 7 AM on Mon 9 Nov free"));
  const oneAm = today.slots.findIndex((s) => s.label === "1 AM");
  assert.ok(msg(today, oneAm).includes("Is 1 AM to 2 AM on Fri 6 Nov (Thursday night) free"));
  const [night] = slotDays(OVERNIGHT, ist("2026-11-07 00:30"));
  assert.ok(msg(night, 0).includes("Is 1 AM to 2 AM on Sat 7 Nov (Friday night) free"));
  assert.ok(!/\p{Extended_Pictographic}/u.test(msg(today, 0)), "no emoji");
});

test("19. the hours picker: Closes lists the 23 hours after the opening; what it saves", () => {
  const c = closeChoices(6);
  assert.equal(c.length, 23);
  assert.deepEqual(c[0], { value: "07:00", label: "7 AM" });
  assert.deepEqual(c[16], { value: "23:00", label: "11 PM" });
  assert.deepEqual(c[17], { value: "00:00", label: "12 AM (midnight)" });
  assert.deepEqual(c[18], { value: "01:00", label: "1 AM (next day)" });
  assert.deepEqual(c[22], { value: "05:00", label: "5 AM (next day)" });
  assert.ok(closeChoices(0).every((x) => !x.label.includes("(")), "opening at midnight: nothing past midnight");
  assert.deepEqual(hoursPatch({ open: "06:00", close: "02:00", allDay: false }), { is_24x7: false, start_time: "06:00", end_time: "02:00" });
  assert.deepEqual(hoursPatch({ open: "", close: "", allDay: true }), { is_24x7: true });
  // What it saves gives the hours it promised: 6 AM to 2 AM.
  const [today] = slotDays(H({ start_time: "06:00:00", end_time: "02:00:00", is_24x7: false }), ist("2026-11-05 05:00"));
  assert.equal(today.open, "6 AM to 2 AM");
});

test("20. players' words: honest, with the site owner's booking line (a members' club says it is one instead)", () => {
  const [today, tomorrow] = slotDays(OVERNIGHT, ist("2026-11-05 12:00"));
  const [night] = slotDays(OVERNIGHT, ist("2026-11-07 00:30"));
  const lines = [...Object.values(PLAYER_COPY), playerFooter(false), playerFooter(true), requestFooter(false), requestFooter(true), updatedLine("2 h ago"), updatedLine("just now"), noFreeLine(today), noFreeLine(tomorrow), noFreeLine(night), noFreeLine(slotDays(OVERNIGHT, ist("2026-11-05 12:00"))[3])];
  for (const s of lines) {
    assert.equal(bannedCopy(s), null, s);
    assert.doesNotMatch(s, /take bookings|takes no bookings|book now|instant|guarantee/i, s);
  }
  assert.ok(playerFooter(false).includes(BOOKING_LINE));
  assert.equal(BOOKING_LINE, "For bookings, contact the turf directly.");
  assert.ok(!playerFooter(true).includes(BOOKING_LINE));
  assert.equal(playerFooter(true), `${PLAYER_COPY.freeMeans} Members' club: ask the turf about guest access.`, "a members' club says so");
  // On a turf that takes booking requests: the hint and the footer say the turf confirms and nothing is paid online.
  assert.equal(PLAYER_COPY.hintRequest, "Tap a time to send a request. The turf confirms.");
  assert.equal(requestFooter(false), "Free means the owner marked the hour free. Pay at the turf; nothing is paid online.");
  assert.equal(requestFooter(true), `${requestFooter(false)} Members' club: ask the turf about guest access.`);
  for (const s of [PLAYER_COPY.hintRequest, requestFooter(false), requestFooter(true)]) assert.doesNotMatch(s, /\bbook|book now|instant|guarantee|hurry|only \d+ left/i, s);
  assert.equal(noFreeLine(today), "No free slots marked for the rest of today.");
  assert.equal(noFreeLine(night), "No free slots marked for Friday night.");
  assert.equal(noFreeLine(slotDays(OVERNIGHT, ist("2026-11-05 12:00"))[2]), "No free slots marked for Saturday.");
  const m = slotMessage({ turfName: "X", pageUrl: "https://www.tapturf.in/turf/x", day: today, slot: today.slots[0] });
  assert.doesNotMatch(m, /guarantee|instant|confirmed/i);
});

test("21. the constants match the migration's", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261105_turf_availability.sql"), "utf8");
  assert.ok(sql.includes(`interval '${FRESH_HOURS} hours'`), "FRESH_HOURS = private.slots_fresh()");
  assert.ok(sql.includes(`interval '${AHEAD_DAYS} days'`), "AHEAD_DAYS = private.slots_ahead()");
  assert.ok(sql.includes(`jsonb_array_length(p_changes) > ${MAX_CHANGES}`), "MAX_CHANGES = turf_slots_apply's limit");
  assert.ok(sql.includes(`$$ select ${MAX_MARKS} $$`), "MAX_MARKS = private.slots_max()");
  assert.ok(MAX_MARKS >= AHEAD_DAYS * 48, "room for 8 days of half-hour starts");
  assert.ok(sql.includes(`'^\\d{4}-\\d{2}-\\d{2}T([01]\\d|2[0-3]):[0-5]\\d$'`), "the same slot key shape as isSlotKey");
});

test("22. isClosedDay reads closed_days as the turf page's hours table did", () => {
  const old = (closedDays: string | null, day: string) => {
    const c = closedDays?.trim() || null;
    return !!c && new RegExp(`\\b${day}`, "i").test(c);
  };
  const days: DayName[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  for (const cd of [null, "", "  ", "Monday", "mondays", "Closed on Tuesdays", "Sat & Sun", "Sunday, Monday", "every sunday"])
    for (const d of days) assert.equal(isClosedDay(cd, d), old(cd, d), `${cd} ${d}`);
  assert.equal(isClosedDay(undefined, "Monday"), false);
});

test("23. the page's Call and WhatsApp rule", () => {
  const land = contactLinks("0253 235 0977", null);
  assert.equal(land.call?.type, "landline");
  assert.equal(land.whatsapp, null);
  const both = contactLinks("0253 235 0977", "9000000101");
  assert.equal(both.call?.e164, "+912532350977");
  assert.equal(both.whatsapp?.digits, "919000000101");
  const mobile = contactLinks("+91 90000 00102", null);
  assert.equal(mobile.whatsapp?.digits, "919000000102", "a mobile call number doubles as WhatsApp");
  const waOnly = contactLinks(null, "9000000103");
  assert.deepEqual([waOnly.call, waOnly.whatsapp?.e164], [null, "+919000000103"]);
  assert.deepEqual(contactLinks("12345", "junk"), { call: null, whatsapp: null });
  assert.deepEqual(contactLinks("0253 235 0977", "0253 235 0977").whatsapp, null, "a landline is never WhatsApp");
});
