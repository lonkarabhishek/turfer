import { test } from "node:test";
import assert from "node:assert/strict";
import * as growthModule from "./growth";
import {
  ACTIONS_NOTE,
  ACTION_KEYS,
  ACTION_LABEL,
  BOOKINGS_LEAD,
  BOOKINGS_NOTE,
  CONFIRMED_LABEL,
  CONTACT_MEANING,
  DEFAULT_WINDOW,
  ESTIMATE_NOTE,
  ESTIMATE_TITLE,
  GOT_SLOT_LABEL,
  GROWTH_ID,
  GROWTH_TITLE,
  NOT_SET_UP_TEXT,
  RATE_MIN,
  REVENUE_FACT,
  SIGNED_OUT_NOTE,
  TAP_ACCOUNT_NOTE,
  WINDOW_KEYS,
  actionRows,
  activeValue,
  confirmedValue,
  confirmedWhen,
  contactsHeadline,
  contactsTurfsLine,
  errorText,
  estimateCapLine,
  estimateOf,
  estimateRows,
  estimatesOf,
  gotSlotValue,
  growthFoldLine,
  noAccountLine,
  ofText,
  repeatIntro,
  repeatRows,
  requestsLine,
  rupeesText,
  tapRows,
  toGrowth,
  toGrowthCounts,
  toSlotRows,
  topTurfLine,
  windowLine,
  type Growth,
  type GrowthWindow,
} from "./growth";
import { MISSING_FOR_MS, createGrowthReads } from "./growth.server";
import type { AdminRpc } from "./outreach.server";
import { VISITS_NOT_PEOPLE } from "../traffic/usage";

const T = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A window as admin_growth sends it. */
const win = (over: Record<string, unknown> = {}) => ({
  days: 30,
  since: "2026-10-30",
  taps: 1454,
  taps_reached: 518,
  taps_signed_out: 936,
  taps_no_account: 0,
  call: 210,
  whatsapp: 190,
  slot_ask: 118,
  people: 320,
  contacts: 371,
  turfs: 212,
  came_back: 10,
  multi_turf: 25,
  active: 512,
  active_2days: 41,
  did_contact: 320,
  did_host: 44,
  did_join: 61,
  did_review: 12,
  did_tool: 130,
  did_request: 1,
  requests: 8,
  confirmed: 3,
  confirmed_hours: 6,
  confirmed_over: 2,
  waiting: 1,
  declined: 1,
  cancelled: 1,
  expired: 2,
  answered: 18,
  got_slot: 7,
  ...over,
});
const counts = (over: Record<string, unknown> = {}) => ({
  today: "2026-11-28",
  windows: { d7: win({ days: 7, since: "2026-11-22", people: 7, contacts: 8, came_back: 1, multi_turf: 1, answered: 4, got_slot: 2 }), d30: win(), all: win({ days: null, since: "2026-09-30", people: 392, contacts: 460 }) },
  top_turfs: {
    d7: [],
    d30: [
      { id: T(1), name: "Kings Turf Arena", city: "hyderabad", slug: "kings-turf-arena", active: true, contacts: 12, taps: 31 },
      { id: T(2), name: "Old Ground", city: "pune", slug: "old-ground", active: false, contacts: 4, taps: 4 },
    ],
    all: [{ id: T(1), name: "Kings Turf Arena", city: "hyderabad", slug: "kings-turf-arena", active: true, contacts: 20, taps: 51 }],
  },
  ...over,
});
const w30 = (over: Record<string, unknown> = {}): GrowthWindow => toGrowthCounts(counts({ windows: { d7: win(), d30: win(over), all: win() } }))!.windows.d30;

// ── Reading admin_growth ──

test("the windows are 7 days, 30 days and all time, 30 first", () => {
  assert.deepEqual([...WINDOW_KEYS], ["d7", "d30", "all"]);
  assert.equal(DEFAULT_WINDOW, "d30");
  assert.equal(RATE_MIN, 10);
});

test("admin_growth's answer as the card's numbers", () => {
  const g = toGrowthCounts(counts())!;
  assert.equal(g.today, "2026-11-28");
  const w = g.windows.d30;
  assert.deepEqual(
    [w.key, w.since, w.taps, w.tapsReached, w.tapsSignedOut, w.call, w.whatsapp, w.slotAsk, w.people, w.contacts, w.turfs, w.cameBack, w.multiTurf],
    ["d30", "2026-10-30", 1454, 518, 936, 210, 190, 118, 320, 371, 212, 10, 25],
  );
  assert.deepEqual([w.active, w.active2Days, w.did], [512, 41, { contact: 320, host: 44, join: 61, review: 12, tool: 130, request: 1 }]);
  assert.deepEqual([w.requests, w.confirmed, w.confirmedHours, w.confirmedOver, w.waiting, w.declined, w.cancelled, w.expired, w.answered, w.gotSlot], [8, 3, 6, 2, 1, 1, 1, 2, 18, 7]);
  assert.equal(g.windows.all.since, "2026-09-30");
  assert.deepEqual(g.topTurfs.d30.map((t) => [t.name, t.city, t.path, t.contacts, t.taps]), [
    ["Kings Turf Arena", "Hyderabad", "/turf/kings-turf-arena", 12, 31],
    ["Old Ground", "Pune", null, 4, 4],
  ]);
  assert.deepEqual(g.topTurfs.d7, []);
});

test("a part is never more than its whole, and junk is nothing", () => {
  const w = w30({ people: 5, came_back: 9, multi_turf: 7, contacts: 2, active: 3, active_2days: 8, did_contact: 99, answered: 2, got_slot: 6, confirmed: 2, confirmed_over: 5, requests: 1, taps: 1, taps_reached: 4, taps_signed_out: 6, taps_no_account: 9 });
  assert.deepEqual([w.cameBack, w.multiTurf, w.contacts, w.active, w.active2Days, w.did.contact, w.gotSlot, w.confirmedOver, w.requests, w.taps, w.tapsNoAccount], [5, 5, 5, 5, 5, 5, 2, 2, 2, 10, 4]);
  const junk = w30({ people: "many", contacts: -4, came_back: null, since: "yesterday", turfs: 2.9 });
  assert.deepEqual([junk.people, junk.contacts, junk.cameBack, junk.since, junk.turfs], [0, 0, 0, null, 2]);
  for (const bad of [null, undefined, 7, "x", [], {}, { error: "forbidden" }, { windows: null }, { windows: {}, error: "forbidden" }]) assert.equal(toGrowthCounts(bad), null, JSON.stringify(bad));
  const empty = toGrowthCounts({ windows: {} })!;
  assert.deepEqual([empty.today, empty.windows.d7.people, empty.topTurfs.all], [null, 0, []]);
  const top = toGrowthCounts(counts({ top_turfs: { d30: [{ id: "nope", contacts: 9 }, { id: T(3), name: "B", contacts: 2, taps: 9 }, { id: T(4), name: "A", contacts: 5, taps: 1 }, { id: T(3), name: "B again", contacts: 7 }, { id: T(5), name: "None", contacts: 0 }] } }))!;
  assert.deepEqual(top.topTurfs.d30.map((t) => [t.name, t.contacts, t.taps]), [["A", 5, 5], ["B", 2, 9]], "no id, a repeat and a turf with no contact are left out; most contacts first; taps never under contacts");
});

// ── The words ──

test("unique turf contacts: people, and one person and one turf as one contact", () => {
  assert.equal(contactsHeadline(w30()), "320 people contacted a turf · 371 unique contacts");
  assert.equal(contactsHeadline(w30({ people: 1, contacts: 1 })), "1 person contacted a turf · 1 unique contact");
  assert.equal(contactsHeadline(w30({ people: 0, contacts: 0 })), "Nobody contacted a turf in the last 30 days.");
  assert.equal(contactsHeadline({ ...w30({ people: 0 }), key: "d7" }), "Nobody contacted a turf in the last 7 days.");
  assert.equal(contactsHeadline({ ...w30({ people: 0 }), key: "all" }), "Nobody has contacted a turf yet.");
  assert.equal(contactsTurfsLine(w30()), "At 212 turfs.");
  assert.equal(contactsTurfsLine(w30({ turfs: 1 })), "At 1 turf.");
  assert.equal(contactsTurfsLine(w30({ turfs: 0 })), null);
  assert.match(CONTACT_MEANING, /one person and one turf/);
  assert.match(CONTACT_MEANING, /five times is one contact of that turf/);
  assert.equal(windowLine(w30(), "2026-11-28"), "30 Oct to 28 Nov, India days");
  assert.equal(windowLine({ ...w30(), key: "all", since: "2026-09-30" }, "2026-11-28"), "Since 30 Sep, the first tap kept");
  assert.equal(windowLine({ ...w30(), key: "all", since: "2025-12-30" }, "2026-11-28"), "Since 30 Dec 2025, the first tap kept");
  assert.equal(windowLine({ ...w30(), key: "all", since: null }, "2026-11-28"), "All time");
  assert.equal(windowLine({ ...w30(), since: null }, "2026-11-28"), "Last 30 days");
});

test("the raw taps: the ones that reached a turf three ways, and the signed-out ones said plainly", () => {
  const rows = tapRows(w30());
  assert.deepEqual(rows.map((r) => [r.key, r.label, r.n, r.part]), [
    ["reached", "Taps that reached a turf", 518, false],
    ["call", "Call", 210, true],
    ["whatsapp", "WhatsApp", 190, true],
    ["slotAsk", "Ask for a slot", 118, true],
    ["signedOut", "Taps while signed out", 936, false],
  ]);
  assert.equal(rows[0].note, "Signed in, so the tap opened the dialer or WhatsApp.");
  assert.equal(rows[4].note, "These opened the sign-in instead, so they reached no turf and are not contacts.");
  assert.equal(rows[1].n + rows[2].n + rows[3].n, rows[0].n, "the three parts add up");
  assert.equal(topTurfLine({ id: T(1), name: "K", city: null, path: null, contacts: 12, taps: 31 }), "12 contacts · 31 taps");
  assert.equal(topTurfLine({ id: T(1), name: "K", city: null, path: null, contacts: 1, taps: 1 }), "1 contact · 1 tap");
  assert.equal(TAP_ACCOUNT_NOTE, "The account on a tap is the one the browser said it was. The server does not check it, which is fine for counting.");
  assert.equal(noAccountLine(w30()), null);
  assert.equal(noAccountLine(w30({ taps_no_account: 3 })), "3 signed-in taps carry no account that is on TapTurf now, so they are in no count of people.");
  assert.equal(noAccountLine(w30({ taps_no_account: 1 })), "1 signed-in tap carries no account that is on TapTurf now, so it is in no count of people.");
});

test("repeat users: counts always, a share only from 10 people", () => {
  assert.equal(repeatIntro(w30()), "Of the 320 people who contacted a turf:");
  assert.equal(repeatIntro(w30({ people: 1, contacts: 1 })), "Of the 1 person who contacted a turf:");
  assert.equal(repeatIntro(w30({ people: 0 })), null);
  assert.deepEqual(repeatRows(w30()).map((r) => [r.label, r.value, r.note]), [
    ["Came back on another day", "10 of 320 (3%)", "Contacted a turf on 2 or more different India days."],
    ["Contacted 2 or more turfs", "25 of 320 (8%)", "Different turfs, on any days."],
  ]);
  assert.deepEqual(repeatRows(w30({ people: 9, came_back: 2, multi_turf: 3 })).map((r) => r.value), ["2 of 9", "3 of 9"], "under 10 people: the two numbers alone");
  assert.deepEqual(repeatRows(w30({ people: 10, came_back: 2, multi_turf: 0 })).map((r) => r.value), ["2 of 10 (20%)", "0 of 10 (0%)"], "from 10: the share too");
  assert.equal(ofText(1234, 5678), "1,234 of 5,678 (22%)");
  assert.equal(activeValue(w30()), "41 of 512 signed-in people (8%)");
  assert.equal(activeValue(w30({ active: 9, active_2days: 4, people: 2 })), "4 of 9 signed-in people");
  assert.equal(activeValue(w30({ active: 1, active_2days: 1, people: 1 })), "1 of 1 signed-in person");
  assert.equal(activeValue(w30({ active: 0, people: 0 })), "Nobody yet");
});

test("what counts as active is listed, each with how many people did it", () => {
  assert.deepEqual([...ACTION_KEYS], ["contact", "host", "join", "review", "tool", "request"]);
  assert.deepEqual(actionRows(w30()).map((a) => [a.label, a.value]), [
    ["Contacted a turf (a Call, WhatsApp or Ask for a slot tap that reached it)", "320 people"],
    ["Hosted a game", "44 people"],
    ["Joined a game", "61 people"],
    ["Wrote a review", "12 people"],
    ["Used a free tool while signed in", "130 people"],
    ["Sent a booking request", "1 person"],
  ]);
  for (const k of ACTION_KEYS) assert.ok(ACTION_LABEL[k]);
  assert.match(ACTIONS_NOTE, /A repeat game counts once, on the day its host set it up, and a host is not counted as joining their own game\./);
});

test("visitors who are not signed in are never counted as people, and the card says why", () => {
  assert.equal(
    SIGNED_OUT_NOTE,
    "Visitors who are not signed in cannot be counted as people at all: TapTurf keeps no identifier on their device unless they tap Accept on the cookie banner. So visits in Traffic are arrivals, not people, and Google Analytics, which sees accepted cookies only, is the only place that estimates returning visitors.",
  );
  // Traffic's line points at this fold by its title and anchor.
  assert.equal(VISITS_NOT_PEOPLE.link, GROWTH_TITLE);
  assert.equal(VISITS_NOT_PEOPLE.href, `#${GROWTH_ID}`);
  assert.equal(GROWTH_TITLE, "People, contacts and bookings");
});

test("completed bookings: two numbers, each labelled with what it is", () => {
  assert.equal(CONFIRMED_LABEL, "Confirmed by the turf on TapTurf");
  assert.equal(GOT_SLOT_LABEL, "Players who told us they got a slot");
  assert.match(BOOKINGS_LEAD, /never added together/);
  assert.equal(BOOKINGS_NOTE, "One player could be in both, which is why they are never added together. TapTurf sees no other bookings: most are made on a call or WhatsApp with the turf.");
  assert.equal(confirmedValue(w30()), "3 requests · 6 hours");
  assert.equal(confirmedValue(w30({ confirmed: 1, confirmed_hours: 1 })), "1 request · 1 hour");
  assert.equal(confirmedValue(w30({ confirmed: 0, confirmed_hours: 0 })), "0");
  assert.equal(confirmedWhen(w30()), "2 are over, 1 is still to come.");
  assert.equal(confirmedWhen(w30({ confirmed: 1, confirmed_over: 1 })), "1 is over.");
  assert.equal(confirmedWhen(w30({ confirmed: 2, confirmed_over: 0 })), "2 are still to come.");
  assert.equal(confirmedWhen(w30({ confirmed: 0 })), null);
  assert.equal(requestsLine(w30()), "Of 8 booking requests sent in these days: 3 confirmed · 1 waiting · 1 declined · 1 cancelled · 2 expired.");
  assert.equal(requestsLine(w30({ requests: 1, confirmed: 0, waiting: 1, declined: 0, cancelled: 0, expired: 0 })), "Of 1 booking request sent in these days: 1 waiting.");
  assert.equal(requestsLine({ ...w30({ requests: 1, confirmed: 0, waiting: 1, declined: 0, cancelled: 0, expired: 0 }), key: "all" }), "Of 1 booking request sent so far: 1 waiting.");
  assert.equal(requestsLine(w30({ requests: 0, confirmed: 0 })), "No booking request was sent in these days.");
  assert.equal(requestsLine({ ...w30({ requests: 0, confirmed: 0 }), key: "all" }), "No booking request has been sent yet.");
  assert.equal(gotSlotValue(w30()), "7 of 18 who answered (39%)");
  assert.equal(gotSlotValue(w30({ answered: 9, got_slot: 4 })), "4 of 9 who answered", "under 10 answers: no share");
  assert.equal(gotSlotValue(w30({ answered: 0, got_slot: 0 })), "0");
});

// ── The estimate ──

// Thu 26, Fri 27, Sat 28, Sun 29, Mon 30 Nov 2026.
const PRICES = { morning_price: 600, afternoon_price: 700, evening_price: 900, weekend_morning_price: null, weekend_afternoon_price: null, weekend_evening_price: 1200, pricing_bands: null, price_unit: "per_hour", slot_minutes: null, price_owner_confirmed: true };
const NONE = { morning_price: null, afternoon_price: null, evening_price: null, weekend_morning_price: null, weekend_afternoon_price: null, weekend_evening_price: null, pricing_bands: null, price_unit: null, slot_minutes: null, price_owner_confirmed: null };
const slots = (over: Record<string, unknown> = {}) => ({
  today: "2026-11-28",
  cap: 2000,
  confirmed_n: 0,
  confirmed: [],
  got_slot_n: 0,
  got_slot: [],
  turfs: [
    { id: T(1), ...PRICES },
    { id: T(2), ...NONE },
    { id: T(3), ...NONE, evening_price: 400, price_unit: "per_person" },
    {
      id: T(4),
      ...NONE,
      evening_price: "500",
      pricing_bands: [
        { band: "evening", days: "all", format: "5-a-side", price_per_hour: 1000, source: "listing:somewhere 2026-10-16" },
        { band: "evening", days: "all", format: "7-a-side", price_per_hour: 1400 },
        { band: "bogus", days: "all", format: null, price_per_hour: 5 },
      ],
    },
  ],
  ...over,
});
const all = (over: Record<string, unknown>) => estimateOf(toSlotRows(slots(over))!, null);

test("a confirmed request: its hours, each at the turf's listed price for that day and time", () => {
  const c = (o: Record<string, unknown>) => all({ confirmed: [{ turf: T(1), at: "2026-11-28", minute: 0, ...o }] }).confirmed;
  assert.deepEqual(c({ date: "2026-11-28", hour: 19, hours: 2 }), { slots: 1, hours: 2, low: 2400, high: 2400, rangeUsed: 0, severalPrices: 0, noTime: 0, noPrice: 0 }, "Saturday 7 pm to 9 pm: two weekend evening hours");
  assert.deepEqual([c({ date: "2026-11-26", hour: 16, hours: 2 }).low, c({ date: "2026-11-26", hour: 16, hours: 2 }).hours], [1600, 2], "Thursday 4 pm to 6 pm: an afternoon hour and an evening hour");
  assert.equal(c({ date: "2026-11-27", hour: 23, hours: 3 }).low, 2700, "Friday 11 pm to 2 am: three weekday evening hours, the two after midnight at Friday's rate though the calendar says Saturday");
  assert.equal(c({ date: "2026-11-28", hour: 0, hours: 1 }).low, 900, "12 am on Saturday's date is Friday's night");
  assert.equal(c({ date: "2026-11-30", hour: 0, hours: 1 }).low, 1200, "12 am on Monday's date is Sunday's night: the weekend rate");
  assert.equal(c({ date: "2026-11-26", hour: 16, minute: 30, hours: 1 }).low, 700, "a start on the half hour reads the hour it starts in");
  const range = c({ date: "2026-11-28", hour: 13, hours: 1 });
  assert.deepEqual([range.low, range.high, range.rangeUsed, range.slots], [600, 1200, 1, 1], "a weekend afternoon with no weekend afternoon price: the turf's lowest to highest, said as a range");
  const mixed = c({ date: "2026-11-28", hour: 16, hours: 2 });
  assert.deepEqual([mixed.low, mixed.high, mixed.rangeUsed], [1800, 2400, 1], "one hour by a range and one by a price is one request by a range");
});

test("a turf with no listed price per hour is counted and never priced", () => {
  const e = all({
    confirmed: [
      { turf: T(2), at: "2026-11-28", date: "2026-11-28", hour: 19, minute: 0, hours: 2 },
      { turf: T(3), at: "2026-11-28", date: "2026-11-28", hour: 19, minute: 0, hours: 1 },
      { turf: T(99), at: "2026-11-28", date: "2026-11-28", hour: 19, minute: 0, hours: 1 },
    ],
    got_slot: [
      { turf: T(2), at: "2026-11-28", date: "2026-11-28", hour: 19 },
      { turf: T(3), at: "2026-11-28", date: "2026-11-28", hour: 19 },
      { turf: T(99), at: "2026-11-28", date: "2026-11-28", hour: 19 },
      { turf: T(1), at: "2026-11-28", date: null, hour: null },
      { turf: T(1), at: "2026-11-28", date: "2026-11-28", hour: null },
    ],
  });
  assert.deepEqual(e.confirmed, { slots: 0, hours: 0, low: 0, high: 0, rangeUsed: 0, severalPrices: 0, noTime: 0, noPrice: 3 }, "no price listed, a price per person, a turf that is gone");
  assert.deepEqual(e.gotSlot, { slots: 0, hours: 0, low: 0, high: 0, rangeUsed: 0, severalPrices: 0, noTime: 2, noPrice: 3 }, "and an answer with no day and hour is no time, whatever its turf lists");
});

test("a got a slot answer: one hour at the listed price for the time it names", () => {
  const g = (o: Record<string, unknown>) => all({ got_slot: [{ turf: T(1), at: "2026-11-28", ...o }] }).gotSlot;
  assert.deepEqual(g({ date: "2026-11-27", hour: 19 }), { slots: 1, hours: 1, low: 900, high: 900, rangeUsed: 0, severalPrices: 0, noTime: 0, noPrice: 0 });
  assert.equal(g({ date: "2026-11-28", hour: 19 }).low, 1200, "a Saturday");
  assert.equal(g({ date: "2026-11-27", hour: 0 }).low, 900, "an answer keeps 12 am under the day whose night it is: Friday's");
  assert.equal(g({ date: "2026-11-29", hour: 1 }).low, 1200, "and Sunday's 1 am is Sunday night");
  assert.equal(g({ date: "2026-11-27", hour: 8 }).low, 600);
  const formats = all({ got_slot: [{ turf: T(4), at: "2026-11-28", date: "2026-11-27", hour: 19 }] }).gotSlot;
  assert.deepEqual([formats.low, formats.high, formats.severalPrices, formats.rangeUsed], [1000, 1400, 1, 0], "listed bands with two formats at that time: the lowest and the highest, never the six columns, and a band that is no band is not read");
  const noBand = all({ got_slot: [{ turf: T(4), at: "2026-11-28", date: "2026-11-27", hour: 9 }] }).gotSlot;
  assert.deepEqual([noBand.low, noBand.high, noBand.severalPrices, noBand.rangeUsed], [1000, 1400, 0, 1], "no morning band: the bands' lowest to highest");
});

test("each window has its own estimate, by the day the request was sent or the answer given", () => {
  const rows = toSlotRows(
    slots({
      confirmed: [
        { turf: T(1), at: "2026-11-28", date: "2026-12-03", hour: 19, minute: 0, hours: 1 },
        { turf: T(1), at: "2026-11-22", date: "2026-11-23", hour: 19, minute: 0, hours: 1 },
        { turf: T(1), at: "2026-11-21", date: "2026-11-23", hour: 19, minute: 0, hours: 1 },
        { turf: T(1), at: "2026-10-30", date: "2026-11-02", hour: 19, minute: 0, hours: 1 },
        { turf: T(1), at: "2026-10-29", date: "2026-11-02", hour: 19, minute: 0, hours: 1 },
      ],
      got_slot: [
        { turf: T(1), at: "2026-11-22", date: "2026-11-22", hour: 19 },
        { turf: T(1), at: "2026-10-01", date: "2026-10-01", hour: 19 },
      ],
    }),
  )!;
  const e = estimatesOf(rows)!;
  assert.deepEqual([e.d7.confirmed.slots, e.d30.confirmed.slots, e.all.confirmed.slots], [2, 4, 5], "7 days: from 22 Nov; 30 days: from 30 Oct; all time: every one");
  assert.deepEqual([e.d7.gotSlot.slots, e.d30.gotSlot.slots, e.all.gotSlot.slots], [1, 1, 2]);
  assert.deepEqual([e.d7.confirmed.low, e.d7.gotSlot.low], [1800, 1200]);
  assert.equal(estimatesOf({ ...rows, today: null }), null, "no date: no windows, so no estimate");
});

test("the slots read: only rows that are slots, each turf's prices as numbers, and whether it was cut", () => {
  const rows = toSlotRows(
    slots({
      confirmed_n: 3,
      confirmed: [{ turf: T(1), at: "2026-11-28", date: "2026-11-28", hour: 19, minute: 0, hours: 2 }, { turf: "x", at: "2026-11-28", date: "2026-11-28", hour: 19, hours: 1 }, { turf: T(1), at: "2026-11-28", date: "2026-11-28", hour: 24, hours: 1 }, { turf: T(1), at: "2026-11-28", date: "2026-11-28", hour: 19, hours: 0 }],
      got_slot_n: 1,
      got_slot: [{ turf: T(1), at: "2026-11-28", date: "2026-13-40", hour: 77 }, { turf: T(1), at: "soon", date: null, hour: null }],
    }),
  )!;
  assert.deepEqual(rows.confirmed, [{ turf: T(1), at: "2026-11-28", date: "2026-11-28", hour: 19, hours: 2 }]);
  assert.deepEqual(rows.gotSlot, [{ turf: T(1), at: "2026-11-28", date: null, hour: null }], "a slot that is no date or hour is an answer with no time");
  assert.equal(rows.cap, 2000, "more confirmed requests than rows: cut at the cap");
  assert.equal(toSlotRows(slots())!.cap, null);
  assert.equal(rows.turfs.get(T(4))!.evening_price, 500, "a price sent as text is a number");
  assert.equal(rows.turfs.get(T(4))!.pricing_bands!.length, 2);
  assert.ok(!JSON.stringify(rows.turfs.get(T(4))).includes("listing"), "a band's source note is not kept");
  assert.equal(rows.turfs.get(T(3))!.price_unit, "per_person");
  for (const bad of [null, 7, [], {}, { error: "forbidden" }, { confirmed: [] }, { got_slot: [] }, { confirmed: [], got_slot: [], error: "forbidden" }]) assert.equal(toSlotRows(bad), null, JSON.stringify(bad));
  assert.equal(estimateCapLine(2000), "Only the latest 2,000 of each are read, so older ones are in no estimate.");
  assert.equal(estimateCapLine(null), null);
});

test("revenue: the fact first, and every rupee figure is called an estimate with what it stands on", () => {
  assert.equal(REVENUE_FACT, "TapTurf takes no payment, so its revenue is ₹0.");
  assert.equal(ESTIMATE_TITLE, "Estimate of booking value for turfs");
  assert.match(ESTIMATE_NOTE, /^An estimate at each turf's listed price/);
  assert.match(ESTIMATE_NOTE, /never TapTurf's revenue/);
  assert.match(ESTIMATE_NOTE, /never added together/);
  assert.equal(rupeesText(2400, 2400), "₹2,400");
  assert.equal(rupeesText(480000, 620000), "₹4,80,000 to ₹6,20,000");
  const e = all({
    confirmed: [
      { turf: T(1), at: "2026-11-28", date: "2026-11-28", hour: 19, minute: 0, hours: 2 },
      { turf: T(1), at: "2026-11-28", date: "2026-11-27", hour: 19, minute: 0, hours: 1 },
      { turf: T(2), at: "2026-11-28", date: "2026-11-28", hour: 19, minute: 0, hours: 1 },
    ],
    got_slot: [
      { turf: T(1), at: "2026-11-28", date: "2026-11-27", hour: 19 },
      { turf: T(1), at: "2026-11-28", date: "2026-11-28", hour: 13 },
      { turf: T(4), at: "2026-11-28", date: "2026-11-27", hour: 19 },
      { turf: T(1), at: "2026-11-28", date: null, hour: null },
      { turf: T(1), at: "2026-11-28", date: null, hour: null },
      { turf: T(2), at: "2026-11-28", date: "2026-11-27", hour: 19 },
    ],
  });
  const [a, b] = estimateRows(e);
  assert.deepEqual(a, {
    key: "confirmed",
    label: "Confirmed by the turf on TapTurf",
    value: "Estimate: ₹3,300",
    stands: "Stands on 2 confirmed requests, 3 hours in all, each hour at the listed price for its time.",
    ranged: null,
    unpriced: "1 more has no price to go by: the turf lists no price per hour.",
  });
  assert.deepEqual(b, {
    key: "gotSlot",
    label: "Players who told us they got a slot",
    value: "Estimate: ₹2,500 to ₹3,500",
    stands: "Stands on 3 answers, counted as one hour each: the answer doesn't say how long.",
    ranged: "For 1 of them the turf lists no price for that time, so its lowest to highest listed price is used. For 1 of them the turf lists more than one price for that time, one for each format, so the lowest and the highest are both counted.",
    unpriced: "3 more have no price to go by: 2 name no day and hour, 1 is at a turf with no listed price per hour.",
  });
  // Nothing to stand on: no rupee figure at all, never ₹0.
  const none = estimateRows(all({}));
  assert.deepEqual(none.map((r) => [r.value, r.stands, r.ranged, r.unpriced]), [["No estimate", "No confirmed request to stand on.", null, null], ["No estimate", "No answer to stand on.", null, null]]);
  const unpriced = estimateRows(all({ confirmed: [{ turf: T(2), at: "2026-11-28", date: "2026-11-28", hour: 19, minute: 0, hours: 1 }], got_slot: [{ turf: T(1), at: "2026-11-28", date: null, hour: null }] }));
  assert.deepEqual(unpriced.map((r) => [r.value, r.stands, r.unpriced]), [
    ["No estimate", "No confirmed request has a price to go by.", "1 has no price to go by: the turf lists no price per hour."],
    ["No estimate", "No answer has a price to go by.", "1 has no price to go by: 1 names no day and hour."],
  ]);
  for (const r of [a, b, ...none, ...unpriced]) assert.ok(!r.value.includes("₹") || r.value.startsWith("Estimate: "), `a rupee figure is always an estimate: ${r.value}`);
});

test("the fold's line, and what the card says when it can't show its numbers", () => {
  const g = toGrowth(counts(), slots())!;
  assert.equal(growthFoldLine(g), "Last 30 days: 320 people contacted a turf, 371 unique contacts · 7 said they got a slot · 3 confirmed on TapTurf");
  assert.equal(growthFoldLine(toGrowth(counts({ windows: { d30: win({ people: 0, contacts: 0, got_slot: 0, confirmed: 0 }) } }), null)!), "Last 30 days: nobody contacted a turf · 0 said they got a slot · 0 confirmed on TapTurf");
  assert.equal(errorText("not_set_up"), NOT_SET_UP_TEXT);
  assert.equal(NOT_SET_UP_TEXT, "These numbers aren't available yet.");
  assert.equal(errorText("forbidden"), "Only the site owner can see this.");
  assert.equal(errorText("unavailable"), "Couldn't load the numbers.");
});

// Every word a person reads: plain, no long dash, no semicolon, never "customers", "book" never as a verb.
test("the copy rules hold for every word of the card", () => {
  const said: string[] = [];
  for (const v of Object.values(growthModule)) {
    if (typeof v === "string") said.push(v);
    else if (v && typeof v === "object" && !Array.isArray(v)) for (const x of Object.values(v as Record<string, unknown>)) if (typeof x === "string") said.push(x);
  }
  const shapes: GrowthWindow[] = [w30(), w30({ people: 0, contacts: 0, turfs: 0, active: 0, requests: 0, confirmed: 0, answered: 0, got_slot: 0 }), w30({ people: 1, contacts: 1, taps_no_account: 1, active: 1 }), { ...w30(), key: "all" }, { ...w30(), key: "d7" }];
  for (const w of shapes) {
    said.push(contactsHeadline(w), contactsTurfsLine(w) ?? "", windowLine(w, "2026-11-28"), noAccountLine(w) ?? "", repeatIntro(w) ?? "", activeValue(w), confirmedValue(w), confirmedWhen(w) ?? "", requestsLine(w), gotSlotValue(w));
    for (const r of tapRows(w)) said.push(r.label, r.note ?? "");
    for (const r of repeatRows(w)) said.push(r.label, r.value, r.note);
    for (const r of actionRows(w)) said.push(r.label, r.value);
  }
  const e = all({ confirmed: [{ turf: T(1), at: "2026-11-28", date: "2026-11-28", hour: 13, minute: 0, hours: 2 }, { turf: T(2), at: "2026-11-28", date: "2026-11-28", hour: 13, minute: 0, hours: 2 }], got_slot: [{ turf: T(4), at: "2026-11-28", date: "2026-11-27", hour: 19 }, { turf: T(1), at: "2026-11-28", date: null, hour: null }, { turf: T(2), at: "2026-11-28", date: "2026-11-27", hour: 19 }] });
  for (const r of estimateRows(e)) said.push(r.label, r.value, r.stands, r.ranged ?? "", r.unpriced ?? "");
  said.push(estimateCapLine(2000)!, growthFoldLine(toGrowth(counts(), slots())!), errorText("forbidden"), errorText("unavailable"), topTurfLine({ id: T(1), name: "K", city: null, path: null, contacts: 2, taps: 3 }));
  assert.ok(said.length > 120, `${said.length} strings read`);
  for (const s of said) {
    assert.ok(!/[—–]/.test(s), `no long dash: "${s}"`);
    assert.ok(!s.includes(";"), `no semicolon: "${s}"`);
    assert.ok(!/customer/i.test(s), `never customers: "${s}"`);
    assert.ok(!/\bbook(s|ed)?\b/i.test(s), `"book" is never a verb: "${s}"`);
    assert.ok(!/\b(unique|returning) (users|visitors)\b/i.test(s) || s === SIGNED_OUT_NOTE, `a visit is never called a person: "${s}"`);
    assert.ok(!/₹/.test(s) || /estimate|revenue is ₹0/i.test(s), `a rupee figure is an estimate, or the ₹0 fact: "${s}"`);
    assert.ok(!/\brevenue\b/i.test(s) || /Revenue$|revenue is ₹0|never TapTurf's revenue/.test(s), `revenue is only ever ₹0: "${s}"`);
  }
});

// ── The route's read ──

const fake = (answers: Record<string, unknown>): { rpc: AdminRpc; calls: [string, Record<string, unknown>][] } => {
  const calls: [string, Record<string, unknown>][] = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push([fn, args]);
      const a = answers[fn];
      if (a instanceof Error) throw a;
      const e = (a as { __error?: { code?: string } } | null)?.__error;
      return e ? { data: null, error: e } : { data: a, error: null };
    },
  };
};
const body = async (r: Response) => [r.status, r.headers.get("cache-control"), await r.json()] as [number, string | null, { ok: boolean; error?: string; growth?: Growth }];
const quiet = async <T>(run: () => Promise<T>): Promise<T> => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return await run();
  } finally {
    console.warn = warn;
  }
};

test("GET /api/admin/growth: both reads at once, the estimate worked out on the server, private and never kept", async () => {
  const f = fake({
    admin_growth: counts(),
    admin_growth_slots: slots({ confirmed_n: 1, confirmed: [{ turf: T(1), at: "2026-11-28", date: "2026-11-28", hour: 19, minute: 0, hours: 2 }], got_slot_n: 1, got_slot: [{ turf: T(1), at: "2026-11-20", date: "2026-11-20", hour: 19 }] }),
  });
  const [status, cache, j] = await body(await createGrowthReads().numbers(f.rpc));
  assert.deepEqual([status, cache, j.ok], [200, "private, no-store", true]);
  assert.deepEqual(f.calls, [["admin_growth", {}], ["admin_growth_slots", {}]], "two reads, no argument but the caller's own token (added by the route's rpc)");
  const g = j.growth!;
  assert.equal(g.windows.d30.people, 320);
  assert.deepEqual([g.estimate!.d7.confirmed.low, g.estimate!.d7.gotSlot.slots, g.estimate!.d30.gotSlot.low, g.estimateCap], [2400, 0, 900, null]);
  // Only totals go to the browser: no price column, no slot, no turf's prices.
  const sent = JSON.stringify(j);
  assert.ok(!/morning_price|evening_price|pricing_bands|price_unit|"turfs":\s*\[|"confirmed":\s*\[|"got_slot"/.test(sent), "no price column and no slot row is sent on");
  assert.deepEqual(Object.keys(g).sort(), ["estimate", "estimateCap", "today", "topTurfs", "windows"]);
});

test("the slots read failing leaves the counts standing, with no estimate", async () => {
  for (const bad of [{ __error: { code: "57014" } }, new Error("boom"), { error: "forbidden" }, "nonsense", null]) {
    const f = fake({ admin_growth: counts(), admin_growth_slots: bad });
    const [status, , j] = await quiet(async () => body(await createGrowthReads().numbers(f.rpc)));
    assert.deepEqual([status, j.ok, j.growth!.estimate, j.growth!.windows.d30.contacts], [200, true, null, 371], JSON.stringify(bad));
  }
});

test("anyone but the site owner, a database that fails, an answer that isn't one", async () => {
  const forbidden = await body(await createGrowthReads().numbers(fake({ admin_growth: { error: "forbidden" }, admin_growth_slots: { error: "forbidden" } }).rpc));
  assert.deepEqual([forbidden[0], forbidden[1], forbidden[2]], [403, "private, no-store", { ok: false, error: "forbidden" }]);
  const down = await quiet(async () => body(await createGrowthReads().numbers(fake({ admin_growth: { __error: { code: "57014" } }, admin_growth_slots: slots() }).rpc)));
  assert.deepEqual([down[0], down[2]], [503, { ok: false, error: "unavailable" }]);
  const threw = await quiet(async () => body(await createGrowthReads().numbers(fake({ admin_growth: new Error("boom"), admin_growth_slots: slots() }).rpc)));
  assert.deepEqual([threw[0], threw[2]], [503, { ok: false, error: "unavailable" }]);
  const odd = await body(await createGrowthReads().numbers(fake({ admin_growth: "nonsense", admin_growth_slots: slots() }).rpc));
  assert.deepEqual([odd[0], odd[2]], [502, { ok: false, error: "unavailable" }]);
});

test("before the file is applied: 200 not_set_up, and the database is asked again only after a minute", async () => {
  assert.equal(MISSING_FOR_MS, 60_000);
  for (const code of ["PGRST202", "42883"]) {
    const reads = createGrowthReads();
    const f = fake({ admin_growth: { __error: { code } }, admin_growth_slots: { __error: { code } } });
    const first = await body(await reads.numbers(f.rpc, 1_000));
    assert.deepEqual([first[0], first[1], first[2]], [200, "private, no-store", { ok: false, error: "not_set_up" }], code);
    assert.equal(f.calls.length, 2);
    await reads.numbers(f.rpc, 1_000 + MISSING_FOR_MS - 1);
    assert.equal(f.calls.length, 2, "not asked again inside the minute");
    const g = fake({ admin_growth: counts(), admin_growth_slots: slots() });
    const later = await body(await reads.numbers(g.rpc, 1_000 + MISSING_FOR_MS));
    assert.deepEqual([later[0], later[2].ok, g.calls.length], [200, true, 2], "after the minute it asks, and shows the numbers once the file is there");
  }
  // One instance's mark is its own.
  const a = createGrowthReads();
  const b = createGrowthReads();
  await a.numbers(fake({ admin_growth: { __error: { code: "PGRST202" } }, admin_growth_slots: slots() }).rpc, 0);
  const fb = fake({ admin_growth: counts(), admin_growth_slots: slots() });
  await b.numbers(fb.rpc, 1);
  assert.equal(fb.calls.length, 2);
});
