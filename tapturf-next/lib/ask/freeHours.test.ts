import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKINGS_LINE,
  FREE_UNREAD_LINE,
  FREE_WHERE_LINE,
  SURE_COPY,
  asksFreeHours,
  freeFollowups,
  freeFoundReply,
  freeNoneReply,
  freeVenueReply,
  freeWidenedReply,
  freeWindow,
  pickFree,
  planFree,
  readerHours,
  type FreePickTurf,
} from "./freeHours";
import { freeLine, type FreeRow } from "../availability/free";
import type { SlotHours } from "../availability/slots";

/** An India wall-clock time as an instant. */
const ist = (s: string) => Date.parse(`${s.replace(" ", "T")}:00+05:30`);
const at = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 16).replace("T", " ");
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3_600_000;
const NOW = ist("2026-11-10 16:30"); // Tuesday, 4:30 PM in India
const H = (o: Partial<SlotHours>): SlotHours => ({ opening_hours: null, start_time: null, end_time: null, is_24x7: null, closed_days: null, ...o });
const ID = (i: number) => `dddddddd-0000-4000-8000-${String(i).padStart(12, "0")}`;

// ── The fixture: Bangalore has turfs with free hours marked; Pune has none. ──
const row = (i: number, o: Partial<FreeRow>): FreeRow => ({
  id: ID(i), slug: `t${i}`, name: `Turf ${i}`, area: null, city: "bangalore", lat: 12.97, lng: 77.59, updatedAt: iso(NOW - 2 * HOUR), requests: false, booked: [],
  hours: H({ start_time: "06:00:00", end_time: "23:00:00" }), ...o,
});
const ROWS: FreeRow[] = [
  // Dribble Standin: football and box cricket, 6 AM to 2 AM, 6 PM and 8 PM booked tonight.
  row(1, { name: "Dribble Standin", area: "Made-up Layout", lat: 12.93, lng: 77.62, booked: ["2026-11-10T18:00", "2026-11-10T20:00"], hours: H({ start_time: "06:00:00", end_time: "02:00:00" }) }),
  // Request Arena Standin: box cricket, open 24 hours, takes booking requests; 8 PM booked.
  row(2, { name: "Request Arena Standin", area: "Made-up Nagar", lat: 13.05, lng: 77.6, requests: true, booked: ["2026-11-10T20:00"], hours: H({ is_24x7: true }), updatedAt: iso(NOW - 30 * 60_000) }),
  // Stale Standin: marks 25 hours old (the database leaves these out; the app checks again).
  row(3, { name: "Stale Standin", updatedAt: iso(NOW - 25 * HOUR) }),
];
const TURFS = new Map<string, FreePickTurf & { name: string }>([
  [ID(1), { id: ID(1), name: "Dribble Standin", city: "bangalore", sports: ["Football", "Box Cricket"], lat: 12.93, lng: 77.62, area: "Made-up Layout" }],
  [ID(2), { id: ID(2), name: "Request Arena Standin", city: "bangalore", sports: ["Box Cricket"], lat: 13.05, lng: 77.6, area: "Made-up Nagar" }],
  [ID(3), { id: ID(3), name: "Stale Standin", city: "bangalore", sports: ["Football"], lat: 12.97, lng: 77.59, area: null }],
  // Pune's turfs: listed, none with hours marked.
  [ID(9), { id: ID(9), name: "Pune Standin", city: "pune", sports: ["Football"], lat: 18.52, lng: 73.86, area: null }],
]);
const LABELS: Record<string, string> = { bangalore: "Bangalore", pune: "Pune" };
const plan = (o: Partial<Parameters<typeof planFree>[0]> & { q?: string } = {}) =>
  planFree({
    rows: ROWS,
    turfs: TURFS,
    names: (id) => TURFS.get(id)!.name,
    cityLabel: (id) => LABELS[id] ?? null,
    window: o.q != null ? freeWindow(o.q, NOW) : null,
    nowMs: NOW,
    named: null,
    fallbackCity: null,
    loc: null,
    ...o,
  });
const football = (s: string[]) => s.includes("Football");

test("which questions ask for a free hour, and which don't (games, prices, facilities, opening hours)", () => {
  for (const q of [
    "Which turf is available near me",
    "any turf free tonight",
    "free turf tomorrow 7 PM in Bangalore",
    "aaj raat koi turf khali hai kya",
    "football slots tonight in bangalore",
    "is Dribble Den free at 7pm",
    "any availability at box cricket turfs tomorrow?",
    "turf rikama aahe ka udya",
    "can I book a turf tonight",
    "need a turf free for our match tonight",
    "anything free right now?",
  ])
    assert.equal(asksFreeHours(q, NOW), true, q);
  for (const q of [
    // The eval's game questions stay games.
    "free football games this weekend",
    "any free games tomorrow in pune",
    "free box cricket match aaj raat",
    "koi free game hai kal",
    "free games at verified turfs",
    "anyone free to play tonight",
    // Prices, facilities, bookings without a time, opening hours, plain searches.
    "turf with free parking in pune",
    "can I book a turf on tapturf",
    "open now turfs in pune",
    "football turfs in Baner",
    "cheapest box cricket in Kothrud",
    "turfs open 24 hours",
  ])
    assert.equal(asksFreeHours(q, NOW), false, q);
});

test("the time a question names, in India time (Tuesday 4:30 PM)", () => {
  const w = (q: string) => {
    const x = freeWindow(q, NOW);
    return x && [at(x.fromMs), at(x.toMs), x.words, x.wide ? `${at(x.wide.fromMs)} to ${at(x.wide.toMs)} ${x.wide.words}` : null];
  };
  assert.deepEqual(w("any turf free tonight"), ["2026-11-10 18:00", "2026-11-11 04:00", "tonight", "2026-11-10 16:30 to 2026-11-11 04:00 today"]);
  assert.deepEqual(w("free turf tomorrow 7 PM in Bangalore"), ["2026-11-11 18:30", "2026-11-11 19:31", "at 7 PM tomorrow", "2026-11-11 04:00 to 2026-11-12 04:00 tomorrow"]);
  assert.deepEqual(w("turf free at 7pm"), ["2026-11-10 18:30", "2026-11-10 19:31", "at 7 PM today", "2026-11-10 16:30 to 2026-11-11 04:00 today"]);
  assert.deepEqual(w("free at 7 am")?.slice(0, 3), ["2026-11-11 06:30", "2026-11-11 07:31", "at 7 AM tomorrow"], "7 AM has gone today: tomorrow's");
  assert.deepEqual(w("free at 7.30 p.m.")?.slice(0, 3), ["2026-11-10 19:00", "2026-11-10 20:01", "at 7:30 PM today"]);
  assert.deepEqual(w("free at 19:00")?.slice(0, 3), ["2026-11-10 18:30", "2026-11-10 19:31", "at 7 PM today"]);
  assert.deepEqual(w("aaj raat 9 baje koi turf khali hai")?.slice(0, 3), ["2026-11-10 20:30", "2026-11-10 21:31", "at 9 PM tonight"]);
  assert.deepEqual(w("kal subah 6 baje turf khali hai kya")?.slice(0, 3), ["2026-11-11 05:30", "2026-11-11 06:31", "at 6 AM tomorrow"]);
  assert.deepEqual(w("free turf 1 am tonight")?.slice(0, 3), ["2026-11-11 00:30", "2026-11-11 01:31", "at 1 AM tonight"]);
  assert.deepEqual(w("free turf right now"), ["2026-11-10 16:30", "2026-11-10 18:30", "right now", null]);
  assert.deepEqual(w("abhi koi turf khali hai"), ["2026-11-10 16:30", "2026-11-10 18:30", "right now", null]);
  assert.deepEqual(w("any turf free tomorrow"), ["2026-11-11 04:00", "2026-11-12 04:00", "tomorrow", null]);
  assert.deepEqual(w("turf free today"), ["2026-11-10 16:30", "2026-11-11 04:00", "today", null]);
  assert.deepEqual(w("free slots on saturday"), ["2026-11-14 04:00", "2026-11-15 04:00", "on Saturday", null]);
  assert.deepEqual(w("free slots tuesday")?.slice(2, 3), ["today"], "today's weekday is today");
  assert.deepEqual(w("free turf this evening")?.slice(0, 3), ["2026-11-10 17:00", "2026-11-10 22:00", "this evening"]);
  assert.deepEqual(w("free turf in the morning")?.slice(0, 3), ["2026-11-11 05:00", "2026-11-11 12:00", "tomorrow morning"], "this morning has gone");
  assert.deepEqual(w("free turf saturday evening")?.slice(0, 3), ["2026-11-14 17:00", "2026-11-14 22:00", "on Saturday evening"]);
  assert.deepEqual(w("any turf free this weekend"), ["2026-11-14 04:00", "2026-11-16 04:00", "this weekend", null]);
  assert.equal(freeWindow("which turf is available near me", NOW), null, "no time named");
  assert.equal(freeWindow("5 a side turf free", NOW), null, "a number is no clock");
  // The reader's window: the lists' 36 hours, or 8 days for later.
  assert.equal(readerHours(null, NOW), 36);
  assert.equal(readerHours(freeWindow("free tonight", NOW), NOW), 36);
  assert.equal(readerHours(freeWindow("free tomorrow 7 pm", NOW), NOW), 36);
  assert.equal(readerHours(freeWindow("free on saturday", NOW), NOW), 192);
});

test("Bangalore: the turfs with hours marked free, each card its times; the stale one never; Pune: none", () => {
  const p = plan({ fallbackCity: "bangalore" });
  assert.equal(p.kind, "found");
  assert.deepEqual(p.picks.map((x) => x.id), [ID(1), ID(2)], "in the read's order; Stale Standin left out");
  assert.equal(p.where, "in Bangalore");
  assert.equal(p.reply, `2 turfs in Bangalore have hours marked free by their owners. Some take requests on TapTurf; the turf confirms. ${BOOKINGS_LINE}`);
  assert.equal(freeLine(p.picks[0].card, NOW)!.text, "Free today: 5 PM, 7 PM, 9 PM, 10 PM +3");
  assert.equal(freeLine(p.picks[1].card, NOW)!.requests, true);
  // Pune: none marked; the reply says so and what to do.
  const pune = plan({ fallbackCity: "pune", q: "any turf free tonight in pune" });
  assert.deepEqual([pune.kind, pune.picks, pune.where, pune.when], ["none", [], "in Pune", "tonight"]);
  assert.equal(freeNoneReply({ where: pune.where, when: pune.when, cards: "rated", city: "Pune" }), "No turf in Pune has marked free hours for tonight on TapTurf yet. Call or WhatsApp a turf to ask. Here are the best rated in Pune.");
  // The words' city beats the visitor's.
  assert.deepEqual(plan({ named: "pune", fallbackCity: "bangalore" }).picks, []);
});

test("tonight, a time, a time that is booked (the day instead), a sport, near me", () => {
  const tonight = plan({ fallbackCity: "bangalore", q: "any turf free tonight" });
  assert.equal(tonight.kind, "found");
  assert.equal(tonight.reply, "2 turfs in Bangalore have hours marked free tonight by their owners. Some take requests on TapTurf; the turf confirms. For bookings, contact the turf directly.");
  assert.ok(tonight.picks.every((x) => x.card.days.flatMap((d) => d.keys).every((k) => k >= "2026-11-10T18:00" && k < "2026-11-11T04:00")), "only tonight's hours");
  // 6 PM: Dribble has it booked, the arena has it free.
  const six = plan({ named: "bangalore", q: "free turf at 6 pm in bangalore" });
  assert.deepEqual(six.picks.map((x) => x.id), [ID(2)]);
  assert.equal(six.reply, "Request Arena Standin in Bangalore has hours marked free at 6 PM today by its owner. You can request a free hour on its page; the turf confirms.");
  // 8 PM: both booked; their other hours today, said as such.
  const eight = plan({ named: "bangalore", q: "free turf at 8 pm in bangalore" });
  assert.equal(eight.kind, "widened");
  assert.equal(eight.reply, "No turf in Bangalore has marked 8 PM today free. 2 turfs have other hours marked free today by their owners. The turf confirms any request.");
  // Football: the arena plays box cricket only.
  assert.deepEqual(plan({ fallbackCity: "bangalore", plays: football }).picks.map((x) => x.id), [ID(1)]);
  // Near a shared location (no city named): within 25 km, nearest first.
  const near = plan({ loc: { lat: 13.06, lng: 77.6 }, fallbackCity: "pune" });
  assert.deepEqual([near.near, near.city, near.where], [true, null, "near you"]);
  assert.deepEqual(near.picks.map((x) => x.id), [ID(2), ID(1)]);
  assert.ok(near.picks[0].km! < near.picks[1].km!);
  assert.equal(near.reply, `2 turfs near you have hours marked free by their owners. Some take requests on TapTurf; the turf confirms. ${BOOKINGS_LINE}`);
  // Far from both: none near you.
  assert.deepEqual(plan({ loc: { lat: 18.52, lng: 73.86 } }).picks, []);
  // A named area leads.
  assert.deepEqual(plan({ fallbackCity: "bangalore", areas: ["Made-up Nagar"] }).picks.map((x) => x.id), [ID(2), ID(1)]);
  // The read failed: said, never "none marked".
  assert.equal(plan({ rows: null, fallbackCity: "bangalore" }).kind, "unread");
});

test("pickFree: only turfs with hours marked, in Ask's rows; never a turf the read doesn't have", () => {
  const picks = pickFree(ROWS, new Map([[ID(1), TURFS.get(ID(1))!]]), { city: "bangalore", loc: null, fromMs: NOW, toMs: NOW + 36 * HOUR, nowMs: NOW });
  assert.deepEqual(picks.map((x) => x.id), [ID(1)], "a turf Ask doesn't list is left out");
  assert.deepEqual(pickFree([], TURFS, { city: "bangalore", loc: null, fromMs: NOW, toMs: NOW + 36 * HOUR, nowMs: NOW }), []);
  assert.equal(pickFree(ROWS, TURFS, { city: null, loc: null, fromMs: NOW, toMs: NOW + 36 * HOUR, nowMs: NOW, limit: 1 }).length, 1);
});

test("the replies: plain, never sure, never a booking promise; the site owner's booking line", () => {
  const replies = [
    freeFoundReply({ names: ["Dribble Den"], where: "in Bangalore", when: "tonight", requests: 0 }),
    freeFoundReply({ names: ["Dribble Den"], where: "", when: "", requests: 1 }),
    freeFoundReply({ names: ["A", "B"], where: "near you", when: "at 7 PM tomorrow", requests: 2 }),
    freeWidenedReply({ names: ["Dribble Den"], where: "in Bangalore", asked: "at 7 PM tomorrow", day: "tomorrow", requests: 0 }),
    freeNoneReply({ where: "in Pune", when: "", cards: "rated", city: "Pune" }),
    freeNoneReply({ where: "near you", when: "right now", cards: "nearest", city: null }),
    freeNoneReply({ where: "", when: "at 7 PM tomorrow", cards: null, city: null }),
    freeVenueReply({ name: "Dribble Den", found: true, when: "tonight", requests: false }),
    freeVenueReply({ name: "Dribble Den", found: false, when: "tonight", requests: false }),
    freeVenueReply({ name: "Dribble Den", found: true, when: "at 7 PM tomorrow", requests: true, otherDay: "tomorrow" }),
    FREE_UNREAD_LINE,
    FREE_WHERE_LINE,
  ];
  assert.deepEqual(replies, [
    "Dribble Den in Bangalore has hours marked free tonight by its owner. For bookings, contact the turf directly.",
    "Dribble Den has hours marked free by its owner. You can request a free hour on its page; the turf confirms.",
    "2 turfs near you have hours marked free at 7 PM tomorrow by their owners. You can request a free hour on their pages; the turf confirms.",
    "No turf in Bangalore has marked 7 PM tomorrow free. Dribble Den has other hours marked free tomorrow by its owner. For bookings, contact the turf directly.",
    "No turf in Pune has marked free hours on TapTurf yet. Call or WhatsApp a turf to ask. Here are the best rated in Pune.",
    "No turf near you has marked free hours right now on TapTurf yet. Call or WhatsApp a turf to ask. Here are the nearest.",
    "No turf has marked free hours at 7 PM tomorrow on TapTurf yet. Call or WhatsApp a turf to ask.",
    "Dribble Den has hours marked free tonight by its owner. For bookings, contact the turf directly.",
    "Dribble Den hasn't marked free hours for tonight on TapTurf. Call or WhatsApp the turf to ask.",
    "Dribble Den hasn't marked 7 PM tomorrow free. It has other hours marked free tomorrow by its owner. You can request a free hour on its page; the turf confirms.",
    "I couldn't check the turfs' free hours just now. Call or WhatsApp a turf to ask.",
    "Share your location or name your city, and I'll look for turfs near you with hours marked free.",
  ]);
  for (const r of [...replies, ...freeFollowups("tonight", true), ...freeFollowups("tomorrow", false)]) {
    assert.doesNotMatch(r, SURE_COPY, r);
    assert.doesNotMatch(r, /\bavailable\b|\bbook (?:it|now|here)\b|on TapTurf\b.*\bbook/i, r);
  }
  assert.match("Guaranteed slot, book now", SURE_COPY);
  assert.match("available for sure", SURE_COPY);
  assert.deepEqual(freeFollowups("tomorrow", true), ["Any turf free tonight", "Any games tonight"]);
  assert.deepEqual(freeFollowups("", false), ["Any turf free tomorrow", "Turfs open 24 hours", "Any games tonight"]);
});
