import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKINGS_LINE,
  FREE_UNREAD_LINE,
  FREE_WHERE_LINE,
  SURE_COPY,
  asksFreeHours,
  freeAsk,
  freeFollowups,
  freeFoundReply,
  freeNamedCity,
  freeNoneReply,
  freeNotFoundLine,
  freeVenueReply,
  freeWidenedReply,
  freeWindow,
  mayAskFreeHours,
  nameAsTyped,
  pickFree,
  planFree,
  planFreeVenue,
  readerHours,
  withoutNames,
  type FreePickTurf,
} from "./freeHours";
import { freeFiltersAsked, freeKeep } from "./freeFilters";
import { freeCardOf, freeLine, type FreeRow } from "../availability/free";
import type { SlotHours } from "../availability/slots";
import type { AskReading } from "../ai/ask";
import type { Turf } from "../../types/turf";

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
  id: ID(i), slug: `t${i}`, name: `Turf ${i}`, area: null, city: "bangalore", lat: 12.97, lng: 77.59, updatedAt: iso(NOW - 2 * HOUR), requests: false, booked: [], bookedUntil: NOW + 192 * HOUR,
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
  // A named area: only the turfs in it; none there, the city's, said so.
  const nagar = plan({ fallbackCity: "bangalore", areas: ["Made-up Nagar"] });
  assert.deepEqual([nagar.picks.map((x) => x.id), nagar.areaMissed], [[ID(2)], false]);
  assert.equal(nagar.reply, "Request Arena Standin in Bangalore has hours marked free by its owner. You can request a free hour on its page; the turf confirms.");
  const kora = plan({ fallbackCity: "bangalore", areas: ["Koramangala"], q: "free turf in koramangala tonight" });
  assert.deepEqual([kora.kind, kora.picks.map((x) => x.id), kora.areaMissed], ["found", [ID(1), ID(2)], true]);
  assert.equal(kora.reply, `No turf in Koramangala has marked free hours for tonight. 2 turfs in Bangalore have hours marked free tonight by their owners. Some take requests on TapTurf; the turf confirms. ${BOOKINGS_LINE}`);
  assert.doesNotMatch(kora.reply!, SURE_COPY);
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

test("facilities, prices and people said available or free are no free hour; available alone needs a turf, a time or near me", () => {
  for (const q of [
    "is parking available at Dribble Den",
    "are washrooms available at Dribble Den",
    "turfs with parking available in pune",
    "box cricket turf with washroom available in bangalore",
    "is coaching available at dribble den",
    "which turf has equipment available",
    "what sports are available at dribble den",
    "any turf with empty parking",
    "is drinking water available",
    "does dribble den have floodlights available",
    "players available tonight in pune",
    "need 2 players tonight free",
    "looking for a team tonight",
    "is entry free at dribble den",
    "is the turf free of cost",
    "free wifi turf",
    "free trial coaching in pune",
    "are you free tonight",
    "anything available?",
  ])
    assert.equal(asksFreeHours(q, NOW), false, q);
  for (const q of ["turfs available in pune", "any turf empty tonight", "available tonight?", "box cricket turf available near me", "turf under 500 available in bangalore", "free turf with parking tonight"])
    assert.equal(asksFreeHours(q, NOW), true, q);
  // "Parking free" is free parking, whatever follows.
  assert.equal(asksFreeHours("turf with parking free tonight", NOW), false);
  // One venue, its name already out of the words: "available" or "empty" is enough; what it offers is no hour.
  for (const q of ["is available tonight", "is available", "is empty", "free slots tomorrow", "is free at 7 pm", "is available for football tonight", "can i book it tonight"])
    assert.equal(asksFreeHours(q, NOW, true), true, q);
  for (const q of ["is available for box cricket", "is parking available at", "does it have floodlights available", "is free for kids", "is open tonight", "what are the timings", "free games here tonight"])
    assert.equal(asksFreeHours(q, NOW, true), false, q);
  // The route reads no further without one of these words.
  assert.equal(mayAskFreeHours("football turfs in Baner"), false);
  assert.equal(mayAskFreeHours("Is parking available?"), true);
});

test("freeAsk: of a list, of one venue (its name out of the words), or not at all; never a game search", () => {
  const ask = (q: string, o: Partial<Parameters<typeof freeAsk>[0]> = {}) => freeAsk({ q, nowMs: NOW, intent: "find_turf", names: [], venue: false, carries: false, ...o });
  assert.equal(ask("any turf free tonight").mode, "list");
  assert.equal(ask("any turf free tonight", { intent: "other" }).mode, "list");
  assert.equal(ask("any turf free tonight", { intent: "find_game" }).mode, null, "a game search stays one");
  assert.equal(ask("players available tonight in pune").mode, null);
  assert.equal(ask("is any turf free tonight", { intent: "question" }).mode, "list", "a question naming no venue: the place's turfs");
  // A venue's name is no time and no free hour ("Night Owl", "Free Kick").
  assert.equal(freeWindow("is Night Owl Turf 1350 available tomorrow", NOW)?.words, "tomorrow night", "read whole, the name is a night");
  assert.equal(withoutNames("Is Night Owl Turf 1350 available tomorrow?", ["Night Owl Turf 1350"]), " is available tomorrow ");
  const owl = ask("is Night Owl Turf 1350 available tomorrow", { intent: "question", names: ["Night Owl Turf 1350"], venue: true });
  assert.deepEqual([owl.mode, owl.window?.words], ["venue", "tomorrow"]);
  assert.equal(ask("is Night Owl Turf 1350 open late", { intent: "question", names: ["Night Owl Turf 1350"], venue: true }).mode, null);
  assert.equal(ask("Free Kick Arena timings", { names: ["Free Kick Arena"], venue: true }).mode, null);
  // A search the reading gave a venue name ("Dribble Standin slots tomorrow"): that venue's hours.
  assert.equal(ask("Dribble Standin slots tomorrow", { names: ["Dribble Standin"], venue: true }).mode, "venue");
  assert.equal(ask("Dribble Standin availability", { names: ["Dribble Standin"], venue: true }).mode, "venue");
  // Facilities and what a venue offers stay the question they are.
  assert.equal(ask("is parking available at Dribble Standin", { intent: "question", names: ["Dribble Standin"], venue: true }).mode, null);
  assert.equal(ask("are washrooms available at Dribble Standin", { intent: "question", names: ["Dribble Standin"], venue: true }).mode, null);
  assert.equal(ask("is Dribble Standin available for box cricket", { intent: "question", names: ["Dribble Standin"], venue: true }).mode, null);
  // A follow-up naming only a time after a free hours answer asks the same; anything else is a new search.
  assert.equal(ask("and tomorrow evening?", { carries: true }).mode, "list");
  assert.equal(ask("and tomorrow evening?", { carries: true, names: ["Dribble Standin"], venue: true }).mode, "venue");
  assert.equal(ask("and tomorrow evening?").mode, null);
  assert.equal(ask("cheaper ones", { carries: true }).mode, null);
});

test("near me with a location: the page's city gives way, a city the words name holds", () => {
  assert.equal(freeNamedCity({ askedCity: null, readingCity: "pune", wantsNearby: true, hasLoc: true }), null);
  assert.equal(freeNamedCity({ askedCity: "pune", readingCity: "pune", wantsNearby: true, hasLoc: true }), "pune");
  assert.equal(freeNamedCity({ askedCity: null, readingCity: "pune", wantsNearby: true, hasLoc: false }), "pune", "no location: the city");
  assert.equal(freeNamedCity({ askedCity: null, readingCity: "pune", wantsNearby: false, hasLoc: true }), "pune", "no near me: the city read");
  // On the Pune page, "which turf is available near me" from beside the Bangalore turfs: those, near you.
  const near = plan({ named: freeNamedCity({ askedCity: null, readingCity: "pune", wantsNearby: true, hasLoc: true }), fallbackCity: "pune", loc: { lat: 12.98, lng: 77.6 }, wantsNearby: true });
  assert.deepEqual([near.kind, near.near, near.where, near.picks.length], ["found", true, "near you", 2]);
  // Near me with no location and no city: the cards' own city said, and asked for a place.
  const nowhere = plan({ wantsNearby: true });
  assert.equal(nowhere.where, "in Bangalore");
  assert.equal(nowhere.reply, `2 turfs in Bangalore have hours marked free by their owners. Some take requests on TapTurf; the turf confirms. ${BOOKINGS_LINE} ${FREE_WHERE_LINE}`);
  assert.equal(plan({}).reply, `2 turfs in Bangalore have hours marked free by their owners. Some take requests on TapTurf; the turf confirms. ${BOOKINGS_LINE}`, "no near me: no question back");
});

test("the reading's other filters: only free turfs that meet them; none that does, said so", () => {
  const one = plan({ fallbackCity: "bangalore", keep: (id) => id === ID(2) });
  assert.deepEqual([one.kind, one.filtered, one.picks.map((p) => p.id)], ["found", true, [ID(2)]]);
  const none = plan({ fallbackCity: "bangalore", keep: () => false, q: "any turf free tonight" });
  assert.deepEqual([none.kind, none.filtered, none.picks], ["none", true, []]);
  assert.equal(
    freeNoneReply({ where: none.where, when: none.when, cards: "rated", city: "Bangalore", filtered: none.filtered }),
    "No turf in Bangalore that matches what you asked has marked free hours for tonight on TapTurf yet. Call or WhatsApp a turf to ask. Here are the best rated in Bangalore.",
  );
  assert.equal(plan({ fallbackCity: "bangalore" }).filtered, false);
  // Pune has none marked at all: said plainly, not "that matches".
  assert.deepEqual([plan({ fallbackCity: "pune", keep: () => false }).kind, plan({ fallbackCity: "pune", keep: () => false }).filtered], ["none", false]);
  // As a turf search reads them (applyAskFilters), nothing dropped: a budget, facilities, 24 hours, a rating.
  const turf = (id: string, o: Partial<Turf>) => ({ id, slug: id, name: id, city: "bangalore", area: null, address: "", sports: ["Football", "Box Cricket"], amenities: [], images: [], rating: 4.2, total_reviews: 10, ...o }) as unknown as Turf;
  const TURF_ROWS = [turf(ID(1), { morning_price: 1800, evening_price: 2200, parking_available: true }), turf(ID(2), { morning_price: 900, evening_price: 1200, is_24x7: true, rating: 4.7 })];
  const reading = (o: Partial<AskReading>): AskReading => ({
    intent: "find_turf", tool: null, city: "bangalore", sport: null, areas: [], turf_names: [], question: null, max_price_per_hour: null, min_rating: null, time: "evening", when: "today",
    skill: null, open_24x7: false, wants_nearby: false, players: null, needs: [], sort: "rating", free_text: null, summary: "", reply: "", followups: [], ...o,
  });
  const ids = (o: Partial<AskReading>) => {
    const k = freeKeep(TURF_ROWS, reading(o));
    return k ? [...k].sort() : null;
  };
  assert.equal(ids({}), null, "nothing else asked: no filter");
  assert.equal(freeFiltersAsked(reading({})), false);
  assert.deepEqual(ids({ max_price_per_hour: 1000 }), [ID(2)]);
  assert.deepEqual(ids({ max_price_per_hour: 500 }), [], "none under 500: none, never the budget dropped");
  assert.deepEqual(ids({ needs: ["parking"] }), [ID(1)]);
  assert.deepEqual(ids({ needs: ["parking"], max_price_per_hour: 1000 }), [], "no turf has both");
  assert.deepEqual(ids({ open_24x7: true }), [ID(2)]);
  assert.deepEqual(ids({ min_rating: 4.5 }), [ID(2)]);
  assert.deepEqual(ids({ needs: ["covered"] }), []);
  assert.deepEqual(ids({ with_photos: true }), [], "router v10's photos");
  assert.deepEqual(ids({ max_price_per_hour: 1000, city: "pune", areas: ["Made-up Nagar"], time: "late_night" }), [ID(2)], "the place and the time are the free answer's own");
});

test("one venue: its hours in the window, its other hours that day, or none marked; a venue we don't list", () => {
  const v = (q: string | null, r: FreeRow | null = ROWS[0], read = true) => planFreeVenue({ row: r, read, name: "Dribble Standin", window: q == null ? null : freeWindow(q, NOW), nowMs: NOW });
  const tonight = v("is it free tonight");
  assert.equal(tonight.reply, "Dribble Standin has hours marked free tonight by its owner. For bookings, contact the turf directly.");
  assert.equal(freeLine(tonight.card, NOW)!.text, "Free today: 7 PM, 9 PM, 10 PM, 11 PM +2");
  const six = v("free at 6 pm");
  assert.equal(six.reply, "Dribble Standin hasn't marked 6 PM today free. It has other hours marked free today by its owner. For bookings, contact the turf directly.");
  assert.equal(v(null).card?.days[0].keys[0], "2026-11-10T17:00", "no time named: the next 36 hours");
  assert.equal(v("tonight", null).reply, "Dribble Standin hasn't marked free hours for tonight on TapTurf. Call or WhatsApp the turf to ask.");
  assert.equal(v("tonight", ROWS[2]).card, null, "stale marks: none");
  assert.deepEqual([v("tonight", ROWS[0], false).reply, v("tonight", ROWS[0], false).card], [FREE_UNREAD_LINE, null]);
  assert.equal(freeNotFoundLine("Kage Arena"), "I couldn't find Kage Arena on TapTurf.");
  assert.equal(nameAsTyped("is Kage Arena free tonight", "kage arena"), "Kage Arena", "as the player typed it");
  assert.equal(nameAsTyped("is kage arena free tonight", "kage arena"), "Kage arena");
  assert.equal(nameAsTyped("free tonight?", "Kage Arena"), "Kage Arena");
});

test("around midnight in India time: the reply's day is the cards' day (11:30 PM and 12:30 AM)", () => {
  const LATE = ist("2026-11-10 23:30"); // Tuesday 11:30 PM
  const SMALL = ist("2026-11-11 00:30"); // Wednesday 12:30 AM
  const w = (q: string, now: number) => {
    const x = freeWindow(q, now)!;
    return [at(x.fromMs), at(x.toMs), x.words, x.wide ? `${at(x.wide.fromMs)} to ${at(x.wide.toMs)} ${x.wide.words}` : null];
  };
  // 11:30 PM: 12 AM and 1 AM are tonight's, as the cards say them.
  assert.deepEqual(w("free turf at 12 am", LATE), ["2026-11-10 23:30", "2026-11-11 00:31", "at 12 AM tonight", "2026-11-10 23:30 to 2026-11-11 04:00 today"]);
  assert.deepEqual(w("free turf at 1 am", LATE).slice(0, 3), ["2026-11-11 00:30", "2026-11-11 01:31", "at 1 AM tonight"]);
  assert.deepEqual(w("any turf free tonight", LATE).slice(0, 3), ["2026-11-10 23:30", "2026-11-11 04:00", "tonight"]);
  assert.deepEqual(w("free turf tomorrow 1 am", LATE).slice(0, 3), ["2026-11-11 00:30", "2026-11-11 01:31", "at 1 AM tonight"], "the hour itself: in two hours");
  // 12:30 AM: tonight and late night are the rest of this night (the cards' "Free tonight: 1 AM"), the day after is today's.
  assert.deepEqual(w("any turf free tonight", SMALL), ["2026-11-11 00:30", "2026-11-11 04:00", "tonight", "2026-11-11 04:00 to 2026-11-12 04:00 today"]);
  assert.deepEqual(w("late night turf free", SMALL).slice(0, 3), ["2026-11-11 00:30", "2026-11-11 04:00", "late tonight"]);
  assert.deepEqual(w("free turf at 1 am", SMALL).slice(0, 3), ["2026-11-11 00:30", "2026-11-11 01:31", "at 1 AM tonight"]);
  assert.deepEqual(w("free turf 1 am tonight", SMALL).slice(0, 3), ["2026-11-11 00:30", "2026-11-11 01:31", "at 1 AM tonight"]);
  assert.deepEqual(w("free turf at 12 am", SMALL).slice(0, 3), ["2026-11-11 23:30", "2026-11-12 00:31", "at 12 AM tomorrow"], "tonight's 12 AM has gone: the next");
  assert.deepEqual(w("turf free this evening", SMALL).slice(0, 3), ["2026-11-11 17:00", "2026-11-11 22:00", "this evening"]);
  assert.deepEqual(w("any turf free tomorrow", SMALL).slice(0, 3), ["2026-11-12 04:00", "2026-11-13 04:00", "tomorrow"]);
  assert.deepEqual(w("aaj raat 9 baje koi turf khali hai", SMALL).slice(2, 3), ["at 9 PM tonight"]);
  // The reply and the card agree: a turf open to 2 AM with its owner's marks an hour old.
  const dribble = (now: number): FreeRow => ({ ...ROWS[0], booked: [], updatedAt: iso(now - HOUR), bookedUntil: now + 36 * HOUR });
  for (const [now, q, said, line] of [
    [LATE, "free turf at 12 am", "Dribble Standin in Bangalore has hours marked free at 12 AM tonight by its owner.", "Free tonight: 12 AM"],
    [LATE, "free turf at 1 am", "Dribble Standin in Bangalore has hours marked free at 1 AM tonight by its owner.", "Free tonight: 1 AM"],
    [SMALL, "any turf free tonight", "Dribble Standin in Bangalore has hours marked free tonight by its owner.", "Free tonight: 1 AM"],
    [SMALL, "free turf late night", "Dribble Standin in Bangalore has hours marked free late tonight by its owner.", "Free tonight: 1 AM"],
  ] as const) {
    const p = planFree({ rows: [dribble(now)], turfs: TURFS, names: () => "Dribble Standin", cityLabel: (id) => LABELS[id] ?? null, window: freeWindow(q, now), nowMs: now, named: null, fallbackCity: "bangalore", loc: null });
    assert.equal(p.kind, "found", q);
    assert.ok(p.reply!.startsWith(said), `${q}: ${p.reply}`);
    assert.equal(freeLine(p.picks[0].card, now)!.text, line, q);
  }
  // The list's card at 12:30 AM (the next 36 hours) leads with tonight's 1 AM, which "tonight" now finds.
  assert.equal(freeLine(freeCardOf(dribble(SMALL), SMALL, SMALL + 36 * HOUR), SMALL)!.text, "Free tonight: 1 AM");
});

test("the new replies: plain, never sure, never a booking promise", () => {
  for (const r of [
    freeNoneReply({ where: "in Bangalore", when: "tonight", cards: "rated", city: "Bangalore", filtered: true }),
    freeNotFoundLine("Kage Arena"),
    planFree({ rows: ROWS, turfs: TURFS, names: (id) => TURFS.get(id)!.name, cityLabel: (id) => LABELS[id] ?? null, window: null, nowMs: NOW, named: null, fallbackCity: null, loc: null, wantsNearby: true }).reply!,
  ]) {
    assert.doesNotMatch(r, SURE_COPY, r);
    assert.doesNotMatch(r, /\bavailable\b|\bbook (?:it|now|here)\b/i, r);
  }
});
