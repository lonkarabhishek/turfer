import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLOSED_LABEL,
  CLOSED_NOTE,
  CLOSED_SWITCH,
  LIST_CAP_LINE,
  LIST_MAX,
  LIST_NOTE,
  LIST_PAGE,
  NOT_SET_UP_TEXT,
  RATE_MIN,
  ROW_SAID_LABEL,
  SAID_KEYS,
  SAID_LABEL,
  TAPS_NOTE,
  VIA_LABEL,
  WINDOW_DAYS,
  WINDOW_KEYS,
  WINDOW_LABEL,
  askText,
  breakdown,
  dayText,
  errorText,
  gapText,
  headline,
  hourRows,
  hourText,
  listCountLine,
  listNext,
  listPage,
  listQuery,
  outcomeFoldLine,
  rowWords,
  slotText,
  tapRows,
  toAnswerList,
  toOutcomeTotals,
  topLine,
  turfName,
  turfState,
  viaOf,
  whenText,
  windowLine,
  wrongLine,
  wrongMore,
  type AnswerRow,
  type OutcomeWindow,
} from "./outcomeTotals";
import { MISSING_FOR_MS, createOutcomeReads } from "./outcomeTotals.server";
import type { AdminRpc } from "./outreach.server";

// Made-up turfs. The admin's "Did you get a slot?" card: the totals, every answer, and every word it shows.

const T = (n: number) => `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, "0")}`;
const ZERO = { total: 0, answered: 0, got_slot: 0, full: 0, price: 0, no_reply: 0, wrong_number: 0, just_asking: 0, no_reason: 0, deciding: 0, dismissed: 0, turfs: 0, turfs_answered: 0, call: 0, whatsapp: 0, slot_ask: 0, call_answered: 0, whatsapp_answered: 0, slot_ask_answered: 0 };
// The real numbers of 17 to 26 Nov 2026: 45 rows across 40 turfs, 18 answers.
const REAL = { ...ZERO, total: 45, answered: 18, got_slot: 7, deciding: 6, full: 2, just_asking: 1, no_reply: 1, no_reason: 1, dismissed: 27, turfs: 40, turfs_answered: 15, call: 30, whatsapp: 15, slot_ask: 8, call_answered: 6, whatsapp_answered: 12, slot_ask_answered: 8 };
const answer = (o: Record<string, unknown> = {}) => ({
  today: "2026-11-26",
  windows: { d7: { days: 7, since: "2026-11-20", ...REAL, total: 30, got_slot: 5, answered: 16, dismissed: 14 }, d30: { days: 30, since: "2026-10-28", ...REAL }, all: { days: null, since: "2026-11-17", ...REAL } },
  top_turfs: [],
  wrong_numbers: [],
  wrong_number_turfs: 0,
  hours: [],
  ...o,
});
const win = (o: Record<string, unknown> = {}, key: "d7" | "d30" | "all" = "d30"): OutcomeWindow => toOutcomeTotals(answer({ windows: { d7: { ...ZERO, ...(key === "d7" ? o : {}) }, d30: { ...ZERO, since: "2026-10-28", ...(key === "d30" ? o : {}) }, all: { ...ZERO, ...(key === "all" ? o : {}) } } }))!.windows[key];
/** Nothing the card says may use these. */
const BANNED = /book|customer|[—–]/i;

test("the totals: three windows, each count where it belongs", () => {
  const t = toOutcomeTotals(answer())!;
  assert.equal(t.today, "2026-11-26");
  assert.deepEqual(Object.keys(t.windows), ["d7", "d30", "all"]);
  const w = t.windows.d30;
  assert.deepEqual([w.key, w.since, w.answered, w.dismissed, w.turfsAnswered], ["d30", "2026-10-28", 18, 27, 15]);
  assert.deepEqual(SAID_KEYS.map((k) => w[k]), [7, 2, 0, 1, 0, 1, 1, 6], "got a slot, full, costly, no reply, wrong number, just asking, no reason, deciding");
  assert.deepEqual([w.call, w.whatsapp, w.slotAsk], [{ answered: 6, closed: 24 }, { answered: 12, closed: 3 }, { answered: 8, closed: 0 }]);
  assert.deepEqual([t.windows.d7.since, t.windows.all.since, t.windows.d7.gotSlot], ["2026-11-20", "2026-11-17", 5]);
});

test("the totals: answered is worked out from the eight counts, so the rows always add up to the headline", () => {
  const w = win({ answered: 99, got_slot: 2, full: 1, deciding: 1, dismissed: 5, total: 3 });
  assert.equal(w.answered, 4, "never the number sent");
  assert.equal(breakdown(w).reduce((s, r) => s + r.n, 0), w.answered);
  assert.equal(w.dismissed, 5, "closed cards are their own count");
});

test("the totals: anything that isn't one is null; odd values are 0, never NaN or a negative", () => {
  for (const bad of [null, undefined, "x", 7, [], {}, { error: "forbidden" }, { windows: [] }, { windows: null }, { error: "forbidden", windows: {} }]) assert.equal(toOutcomeTotals(bad), null);
  const t = toOutcomeTotals({ windows: { d7: null, d30: { got_slot: "7", full: -2, price: 1.9, no_reply: NaN, deciding: Infinity, dismissed: null, since: "26 Nov", call: 3, call_answered: 9 } }, hours: "x", top_turfs: null, wrong_numbers: {} })!;
  assert.deepEqual(SAID_KEYS.map((k) => t.windows.d30[k]), [0, 0, 1, 0, 0, 0, 0, 0]);
  assert.deepEqual([t.windows.d30.answered, t.windows.d30.dismissed, t.windows.d30.since, t.today], [1, 0, null, null]);
  assert.deepEqual(t.windows.d30.call, { answered: 3, closed: 0 }, "answers are never more than the taps' rows");
  assert.deepEqual([t.windows.d7.answered, t.windows.all.answered, t.topTurfs, t.wrongNumbers, t.hours, t.wrongNumberTurfs], [0, 0, [], [], [], 0]);
});

test("the headline counts players who answered, never rows; a share only from 10 answers", () => {
  assert.equal(RATE_MIN, 10);
  assert.equal(headline(win({ got_slot: 7, deciding: 6, full: 2, just_asking: 1, no_reply: 1, no_reason: 1, dismissed: 27 })), "18 players answered · 7 got a slot (39%)");
  assert.equal(headline(win({ got_slot: 7, deciding: 2 })), "9 players answered · 7 got a slot", "9 answers: the two numbers, no share");
  assert.equal(headline(win({ got_slot: 7, deciding: 3 })), "10 players answered · 7 got a slot (70%)", "10 answers: the share is said");
  assert.equal(headline(win({ got_slot: 1 })), "1 player answered · 1 got a slot");
  assert.equal(headline(win({ deciding: 1, dismissed: 40 })), "1 player answered · none got a slot");
  assert.equal(headline(win({ deciding: 12 })), "12 players answered · none got a slot", "no share of nothing");
  assert.equal(headline(win({ got_slot: 1500, deciding: 500 })), "2,000 players answered · 1,500 got a slot (75%)");
  assert.equal(headline(win({ got_slot: 1, deciding: 2, price: 3, full: 3, no_reply: 1 })), "10 players answered · 1 got a slot (10%)");
  // Closed cards are in no number of the headline, however many.
  assert.equal(headline(win({ got_slot: 2, dismissed: 500 })), headline(win({ got_slot: 2 })));
});

test("the headline with nobody: said plainly for each window", () => {
  assert.equal(headline(win({ dismissed: 27 }, "d7")), "Nobody answered in the last 7 days.");
  assert.equal(headline(win({}, "d30")), "Nobody answered in the last 30 days.");
  assert.equal(headline(win({}, "all")), "Nobody has answered yet.");
});

test("under the headline: the India days counted, and how many turfs the answers are about", () => {
  const t = toOutcomeTotals(answer())!;
  assert.equal(windowLine(t.windows.d7, t.today), "20 Nov to 26 Nov · answers about 15 turfs");
  assert.equal(windowLine(t.windows.d30, t.today), "28 Oct to 26 Nov · answers about 15 turfs");
  assert.equal(windowLine(t.windows.all, t.today), "Since 17 Nov · answers about 15 turfs");
  assert.equal(windowLine(win({ since: "2026-11-20", turfs_answered: 1, got_slot: 1 }, "d7"), "2026-11-26"), "20 Nov to 26 Nov · answers about 1 turf");
  assert.equal(windowLine(win({ since: "2026-11-20" }, "d7"), "2026-11-26"), "20 Nov to 26 Nov", "no answers: no turfs to count");
  assert.equal(windowLine(win({}, "all"), "2026-11-26"), "All time", "no first answer yet");
  assert.equal(windowLine(win({ since: "2025-12-28", turfs_answered: 2 }, "d30"), "2026-01-26"), "28 Dec 2025 to 26 Jan · answers about 2 turfs", "another year is said");
  assert.equal(windowLine(win({ since: "2025-11-17" }, "all"), "2026-11-26"), "Since 17 Nov 2025");
  assert.equal(windowLine(win({ since: "2026-11-20" }, "d7"), null), "From 20 Nov");
  assert.equal(windowLine(win({ since: null }, "d7"), null), "Last 7 days");
});

test("the breakdown: eight rows in the card's order, zeros kept, each a part of the answers", () => {
  const rows = breakdown(toOutcomeTotals(answer())!.windows.d30);
  assert.deepEqual(rows.map((r) => r.label), ["Got a slot", "Slot was full", "Too costly", "No reply", "Wrong number", "Just asking", "No reason given", "Still deciding"]);
  assert.deepEqual(rows.map((r) => r.n), [7, 2, 0, 1, 0, 1, 1, 6]);
  assert.ok(Math.abs(rows.reduce((s, r) => s + r.share, 0) - 1) < 1e-9, "the shares add up to all the answers");
  assert.equal(rows[0].share, 7 / 18);
  assert.equal(rows[0].title, "7 of the 18 who answered");
  const none = breakdown(win({ dismissed: 9 }));
  assert.deepEqual([none.length, none.every((r) => r.n === 0 && r.share === 0), none[0].title], [8, true, "Nobody answered"], "no answers: every row 0, no division by nothing");
  assert.ok(!Object.keys(SAID_LABEL).slice(0, 8).includes("dismissed") && SAID_KEYS.every((k) => k in SAID_LABEL), "a closed card is not a row of the breakdown");
});

test("closed cards, and the taps: said apart", () => {
  assert.equal(CLOSED_LABEL, "Closed the card without answering");
  assert.equal(CLOSED_NOTE, "Not an answer, so not counted in anything above.");
  assert.deepEqual(tapRows(toOutcomeTotals(answer())!.windows.d30), [
    { key: "call", label: "After a Call tap", line: "6 answered · 24 closed the card" },
    { key: "whatsapp", label: "After a WhatsApp tap", line: "12 answered · 3 closed the card" },
    { key: "slotAsk", label: "After Ask for a slot", line: "8 answered · 0 closed the card" },
  ]);
  assert.deepEqual(tapRows(win({})).map((r) => r.line), Array(3).fill("0 answered · 0 closed the card"));
  assert.match(TAPS_NOTE, /Ask for a slot opens WhatsApp/);
});

const turf = (n: number, o: Record<string, unknown> = {}) => ({ id: T(n), name: `Turf ${n}`, city: "hyderabad", slug: `turf-${n}`, active: true, ...o });

test("the turfs with the most answers: named, linked to their page, their line", () => {
  const t = toOutcomeTotals(answer({
    top_turfs: [
      turf(1, { answered: 5, got_slot: 3, full: 1, deciding: 1, dismissed: 4 }),
      turf(2, { name: "Dream Sports Fields - Inorbit Malad - Football & Cricket Turf", city: "mumbai", answered: 2, no_reply: 1, price: 1 }),
      turf(3, { active: false, answered: 1, wrong_number: 1 }),
      { id: T(4), name: null, city: null, slug: null, active: false, answered: 1, just_asking: 1 },
      turf(5, { slug: null, answered: 1, no_reason: 1 }),
      turf(6, { answered: 0, dismissed: 9 }),
      { id: "nope", name: "x", got_slot: 3 },
      null,
    ],
  }))!;
  assert.deepEqual(t.topTurfs.map((x) => x.id), [T(1), T(2), T(3), T(4), T(5)], "a turf with no answer and a row that is no turf are left out");
  assert.deepEqual([t.topTurfs[0].name, t.topTurfs[0].city, t.topTurfs[0].path, t.topTurfs[0].answered], ["Turf 1", "Hyderabad", "/turf/turf-1", 5]);
  assert.equal(topLine(t.topTurfs[0]), "5 answered: 3 got a slot · 1 slot full · 1 still deciding");
  assert.equal(topLine(t.topTurfs[1]), "2 answered: 1 too costly · 1 no reply");
  assert.deepEqual([t.topTurfs[1].city, t.topTurfs[1].path], ["Mumbai", "/turf/turf-2"]);
  assert.deepEqual([turfName(t.topTurfs[2]), t.topTurfs[2].path, turfState(t.topTurfs[2])], ["Turf 3", null, "not listed now"], "a turf switched off: named, no link");
  assert.deepEqual([turfName(t.topTurfs[3]), t.topTurfs[3].path, t.topTurfs[3].city, turfState(t.topTurfs[3])], ["A turf no longer listed", null, null, null], "a turf that is gone");
  assert.equal(t.topTurfs[4].path, `/turf/${T(5)}`, "no slug: its id link");
  assert.deepEqual([topLine(t.topTurfs[3]), topLine(t.topTurfs[4]), topLine(t.topTurfs[2])], ["1 answered: 1 just asking", "1 answered: 1 no reason given", "1 answered: 1 wrong number"]);
  assert.equal(turfState(t.topTurfs[0]), null);
  // Most answers first, then most got a slot, whatever order they came in; 10 at most.
  const many = toOutcomeTotals(answer({ top_turfs: Array.from({ length: 14 }, (_, i) => turf(i + 1, { got_slot: i % 3, deciding: 2 })) }))!.topTurfs;
  assert.equal(many.length, 10);
  assert.deepEqual(many.map((x) => x.answered), [4, 4, 4, 4, 3, 3, 3, 3, 3, 2]);
});

test("wrong numbers: every turf, how many said so, the last day; a cut list says how many more", () => {
  const t = toOutcomeTotals(answer({
    wrong_numbers: [turf(1, { wrong_number: 2, last: "2026-11-24" }), turf(2, { wrong_number: 1, last: "2026-11-26" }), turf(3, { wrong_number: 0 }), turf(4, { active: false, wrong_number: 1, last: null })],
    wrong_number_turfs: 6,
  }))!;
  assert.deepEqual(t.wrongNumbers.map((x) => [x.id, x.reports, x.last, x.path]), [[T(1), 2, "2026-11-24", "/turf/turf-1"], [T(2), 1, "2026-11-26", "/turf/turf-2"], [T(4), 1, null, null]]);
  assert.equal(wrongLine(t.wrongNumbers[0], t.today), "2 players said this number is wrong · last on 24 Nov");
  assert.equal(wrongLine(t.wrongNumbers[1], t.today), "1 player said this number is wrong · last on 26 Nov");
  assert.equal(wrongLine(t.wrongNumbers[2], t.today), "1 player said this number is wrong");
  assert.equal(wrongLine({ ...t.wrongNumbers[0], last: "2025-12-30" }, "2026-01-02"), "2 players said this number is wrong · last on 30 Dec 2025");
  assert.equal(wrongMore(t), "and 3 more turfs");
  assert.equal(wrongMore(toOutcomeTotals(answer({ wrong_numbers: [turf(1, { wrong_number: 1 })], wrong_number_turfs: 2 }))!), "and 1 more turf");
  assert.equal(wrongMore(toOutcomeTotals(answer({ wrong_numbers: [turf(1, { wrong_number: 1 })], wrong_number_turfs: 1 }))!), null);
  assert.equal(toOutcomeTotals(answer({ wrong_numbers: [turf(1, { wrong_number: 1 })], wrong_number_turfs: 0 }))!.wrongNumberTurfs, 1, "never fewer than are listed");
  assert.equal(toOutcomeTotals(answer({ wrong_numbers: Array.from({ length: 25 }, (_, i) => turf(i + 1, { wrong_number: 1 })) }))!.wrongNumbers.length, 20, "20 at most");
});

test("the hours players said they got: most named first, 5 at most, India's clock in plain words", () => {
  const t = toOutcomeTotals(answer({ hours: [{ hour: 19, n: 4 }, { hour: 20, n: 4 }, { hour: 7, n: 3 }, { hour: 0, n: 2 }, { hour: 13, n: 1 }, { hour: 12, n: 1 }, { hour: 24, n: 9 }, { hour: 19, n: 9 }, { hour: 6, n: 0 }, null] }))!;
  assert.deepEqual(hourRows(t.hours), [{ hour: 19, label: "7 pm", n: 4 }, { hour: 20, label: "8 pm", n: 4 }, { hour: 7, label: "7 am", n: 3 }, { hour: 0, label: "12 am (late night)", n: 2 }, { hour: 12, label: "12 pm", n: 1 }]);
  assert.deepEqual([0, 1, 5, 11, 12, 13, 23].map((h) => hourText(h)), ["12 am", "1 am", "5 am", "11 am", "12 pm", "1 pm", "11 pm"]);
  assert.deepEqual([hourText(19, 30), hourText(0, 5), hourText(12, 0)], ["7:30 pm", "12:05 am", "12 pm"]);
  assert.deepEqual([dayText("2026-11-24"), dayText("2026-11-24", { weekday: true }), dayText("2026-11-24", { year: 2026 }), dayText("2025-11-24", { weekday: true, year: 2026 })], ["24 Nov", "Tue 24 Nov", "24 Nov", "Mon 24 Nov 2025"]);
});

test("the fold's line, the switch and what is said when the numbers can't be shown", () => {
  assert.equal(outcomeFoldLine(toOutcomeTotals(answer())!), "Last 30 days: 18 players answered, 7 got a slot");
  assert.equal(outcomeFoldLine(toOutcomeTotals(answer({ wrong_number_turfs: 2 }))!), "Last 30 days: 18 players answered, 7 got a slot · 2 turfs with a wrong number");
  assert.equal(outcomeFoldLine(toOutcomeTotals(answer({ windows: { d30: { ...ZERO, deciding: 1 } }, wrong_number_turfs: 1 }))!), "Last 30 days: 1 player answered, none got a slot · 1 turf with a wrong number");
  assert.equal(outcomeFoldLine(toOutcomeTotals(answer({ windows: {} }))!), "Last 30 days: nobody answered");
  assert.deepEqual(WINDOW_KEYS.map((k) => [WINDOW_LABEL[k], WINDOW_DAYS[k]]), [["7 days", 7], ["30 days", 30], ["All time", 0]]);
  assert.equal(NOT_SET_UP_TEXT, "Totals aren't available yet.");
  assert.deepEqual([errorText("not_set_up"), errorText("forbidden"), errorText("unavailable")], ["Totals aren't available yet.", "Only the site owner can see this.", "Couldn't load the answers."]);
});

// ── Every answer ──

const NOW = Date.parse("2026-11-26T14:00:00Z");
const row = (o: Record<string, unknown> = {}) => ({ id: 1, at: "2026-11-26T13:57:04Z", turf: T(1), name: "Turf 1", city: "hyderabad", slug: "turf-1", active: true, kind: "whatsapp", source: "turf_bar", outcome: "got_slot", reason: null, slot_date: null, slot_hour: null, ask: null, ...o });
const listOf = (rows: unknown[], o: Record<string, unknown> = {}) => toAnswerList({ days: 30, since: "2026-10-28", today: "2026-11-26", limit: 20, dismissed: false, n: rows.length, rows, ...o });
const one = (o: Record<string, unknown> = {}): AnswerRow => listOf([row(o)])!.rows[0];
const words = (o: Record<string, unknown> = {}) => rowWords(one(o), NOW);
const asked = (o: Record<string, unknown> = {}) => ({ date: "2026-11-28", hour: 15, minute: 0, minutes: 120, sport: "football", players: null, at: "2026-11-26T13:57:00Z", ...o });

test("the list: newest first, what the window holds, anything that isn't one is null", () => {
  for (const bad of [null, "x", [], {}, { error: "forbidden" }, { rows: null }, { error: "forbidden", rows: [] }]) assert.equal(toAnswerList(bad), null);
  const l = listOf([row({ id: 3, at: "2026-11-25T10:00:00Z" }), row({ id: 9, at: "2026-11-26T10:00:00Z" }), row({ id: 5, at: "2026-11-24T10:00:00Z" })], { n: 40, days: 7, dismissed: true })!;
  assert.deepEqual([l.rows.map((r) => r.id), l.n, l.days, l.dismissed], [["9", "3", "5"], 40, 7, true]);
  assert.deepEqual([listOf([], { days: 0 })!.days, listOf([], { days: 12 })!.days, listOf([], { days: null })!.days, listOf([], { dismissed: "yes" })!.dismissed], [0, 30, 30, false]);
  assert.equal(listOf([row(), row({ id: 2 })], { n: 0 })!.n, 2, "never fewer than are listed");
});

test("the list: a row that isn't an answer is left out, and no row twice", () => {
  const l = listOf([
    row({ id: 1 }), row({ id: 1 }), row({ id: 2, turf: "nope" }), row({ id: 3, at: "yesterday" }), row({ id: 4, at: null }), row({ id: 5, kind: "sms", source: "x" }),
    row({ id: 6, outcome: "booked" }), row({ id: 7, outcome: "not_this_time", reason: "rain" }), row({ id: 8, outcome: "not_this_time", reason: "got_slot" }), row({ id: null }), null, "x",
    row({ id: 9, outcome: "not_this_time", reason: "deciding" }), row({ id: 10, outcome: "not_this_time", reason: "no_reason" }),
  ])!;
  assert.deepEqual(l.rows.map((r) => r.id), ["1"]);
});

test("how they reached the turf: Call, WhatsApp, Ask for a slot, or a Free slots time", () => {
  assert.deepEqual(VIA_LABEL, { call: "Call", whatsapp: "WhatsApp", slot_ask: "Ask for a slot", free_slots: "Free slots" });
  assert.deepEqual(
    [["call", "turf_bar"], ["whatsapp", "turf_bar"], ["whatsapp", "turf_sidebar"], ["whatsapp", "slot_ask"], ["whatsapp", "turf_slots"], ["whatsapp", "turf_request"], ["call", "ask_card"], ["sms", "turf_bar"], [null, null]].map(([k, s]) => viaOf(k, s)),
    ["call", "whatsapp", "whatsapp", "slot_ask", "free_slots", "free_slots", "call", null, null],
  );
  assert.deepEqual([words({ kind: "call" }).via, words().via, words({ source: "slot_ask" }).via, words({ source: "turf_slots" }).via], ["Call", "WhatsApp", "Ask for a slot", "Free slots"]);
});

test("what they said, in plain words: every answer the card can store", () => {
  const said = (outcome: string, reason: string | null = null) => words({ outcome, reason }).said;
  assert.deepEqual(
    [said("got_slot"), said("not_this_time", "full"), said("not_this_time", "price"), said("not_this_time", "no_reply"), said("not_this_time", "wrong_number"), said("not_this_time", "just_asking"), said("not_this_time"), said("deciding"), said("dismissed")],
    ["Got a slot", "Slot was full", "Too costly", "No reply", "Wrong number", "Just asking", "Not this time", "Still deciding", "Closed without answering"],
  );
  assert.equal(SAID_LABEL.noReason, "No reason given", "the breakdown's row for the same answer");
  assert.equal(ROW_SAID_LABEL.dismissed, "Closed without answering");
});

test("when it was answered: India time, whatever the server's clock says", () => {
  assert.equal(words().when, "26 Nov, 7:27 pm", "13:57 UTC is 7:27 pm in India");
  assert.equal(whenText(Date.parse("2026-11-25T18:30:00Z"), NOW), "26 Nov, 12:00 am", "India's midnight: the next day there");
  assert.equal(whenText(Date.parse("2026-11-25T18:29:59Z"), NOW), "25 Nov, 11:59 pm");
  assert.equal(whenText(Date.parse("2026-11-26T06:35:00Z"), NOW), "26 Nov, 12:05 pm");
  assert.equal(whenText(Date.parse("2026-11-26T01:00:00Z"), NOW), "26 Nov, 6:30 am");
  assert.equal(whenText(Date.parse("2025-12-31T19:00:00Z"), NOW), "1 Jan, 12:30 am", "already this year in India");
  assert.equal(whenText(Date.parse("2025-12-31T12:00:00Z"), NOW), "31 Dec 2025, 5:30 pm", "another year is said");
});

test("the slot the answer names: day and hour, an hour alone, a day alone, nothing", () => {
  assert.equal(words({ slot_date: "2026-11-24", slot_hour: 13 }).named, "for Tue 24 Nov, 1 pm");
  assert.equal(words({ outcome: "not_this_time", reason: "full", slot_date: "2026-11-25", slot_hour: 21 }).named, "for Wed 25 Nov, 9 pm");
  assert.equal(words({ slot_hour: 8 }).named, "for 8 am", "an hour with no day says just the hour");
  assert.equal(words({ slot_date: "2026-11-24" }).named, "for Tue 24 Nov", "a day with no hour says just the day");
  assert.equal(words().named, null, "neither: nothing");
  assert.equal(words({ slot_date: "2026-11-24", slot_hour: 0 }).named, "for Tue 24 Nov, 12 am (late night)", "midnight is that day's late night, as the card stores it");
  assert.equal(slotText({ date: null, hour: 1 }), "1 am");
  assert.deepEqual([words({ slot_date: "24/11", slot_hour: 99 }).named, words({ slot_date: "2026-13-45", slot_hour: 7.5 }).named], [null, null], "a slot that isn't one is none");
  const w = words({ slot_date: "2026-11-24", slot_hour: 13 });
  assert.deepEqual([w.asked, w.saidSlot, w.gap], [null, null, null], "no ask: no asked line, no gap");
});

test("the asked slot: said as asked, with how long after the ask the answer came", () => {
  // Asked Sat 28 Nov 3 pm for two hours of football, answered the same minute; the answer itself keeps no slot (it is further on than tomorrow).
  const a = words({ source: "slot_ask", ask: asked() });
  assert.deepEqual(a, { when: "26 Nov, 7:27 pm", via: "Ask for a slot", said: "Got a slot", named: null, asked: "Asked for Sat 28 Nov, 3 pm to 5 pm, football", saidSlot: null, gap: "answered less than a minute after asking" });
  // Asked Tue 24 Nov 1 pm for three hours of box cricket, 8 players; the answer names the same slot: one line.
  const b = words({ source: "slot_ask", at: "2026-11-23T08:01:10Z", slot_date: "2026-11-24", slot_hour: 13, ask: asked({ date: "2026-11-24", hour: 13, minutes: 180, sport: "box cricket", players: 8, at: "2026-11-23T08:00:00Z" }) });
  assert.deepEqual([b.asked, b.saidSlot, b.named, b.gap], ["Asked for Tue 24 Nov, 1 pm to 4 pm, box cricket, 8 players", null, null, "answered 1 min after asking"]);
  // Asked Sun 29 Nov 10 pm for two hours, 16 players: it ends at midnight.
  assert.equal(askText(one({ source: "slot_ask", ask: asked({ date: "2026-11-29", hour: 22, sport: "box cricket", players: 16 }) }).ask!), "Sun 29 Nov, 10 pm to 12 am, box cricket, 16 players");
  assert.equal(askText({ date: "2026-11-21", hour: 19, minute: 30, minutes: 90, sport: null, players: 1, at: 0 }), "Sat 21 Nov, 7:30 pm to 9 pm, 1 player");
  assert.equal(askText({ date: "2026-11-21", hour: 23, minute: 0, minutes: 180, sport: "football", players: null, at: 0 }), "Sat 21 Nov, 11 pm to 2 am, football");
  assert.equal(askText({ date: "2026-11-21", hour: 6, minute: 0, minutes: 60, sport: null, players: null, at: 0 }), "Sat 21 Nov, 6 am to 7 am");
});

test("the asked slot and the answer's own: one line when they agree, both when they differ", () => {
  const w = (slot: Record<string, unknown>, a: Record<string, unknown> = {}) => words({ source: "slot_ask", ...slot, ask: asked({ date: "2026-11-24", hour: 13, ...a }) });
  assert.equal(w({ slot_date: "2026-11-24", slot_hour: 13 }).saidSlot, null, "the same day and hour");
  assert.equal(w({ slot_date: "2026-11-24" }).saidSlot, null, "the same day, no hour named");
  assert.equal(w({}).saidSlot, null, "the answer names nothing");
  assert.equal(w({ slot_date: "2026-11-24", slot_hour: 14 }).saidSlot, "Said: Tue 24 Nov, 2 pm", "another hour");
  assert.equal(w({ slot_date: "2026-11-25", slot_hour: 13 }).saidSlot, "Said: Wed 25 Nov, 1 pm", "another day");
  assert.equal(w({ slot_date: "2026-11-25" }).saidSlot, "Said: Wed 25 Nov");
  // An hour after midnight: the answer keeps it under the night before, the ask under its calendar date. They are the same start.
  assert.equal(w({ slot_date: "2026-11-23", slot_hour: 0 }, { hour: 0 }).saidSlot, null, "Mon night's 12 am is Tue 24 Nov 12 am");
  assert.equal(w({ slot_date: "2026-11-24", slot_hour: 0 }, { hour: 0 }).saidSlot, "Said: Tue 24 Nov, 12 am (late night)", "Tue night's 12 am is not");
  // A half-hour start: the answer has the hour only.
  assert.equal(w({ slot_date: "2026-11-24", slot_hour: 19 }, { hour: 19, minute: 30 }).saidSlot, null);
  // Whatever is said, the asked line is the ask as it was sent.
  assert.equal(w({ slot_date: "2026-11-25", slot_hour: 13 }).asked, "Asked for Tue 24 Nov, 1 pm to 3 pm, football");
});

test("the gap between the ask and the answer: just the gap, no judgement", () => {
  const g = (ms: number) => gapText(0, ms);
  assert.deepEqual([g(0), g(59_999), g(60_000), g(119_000), g(3 * 60_000), g(59 * 60_000 + 59_000)], ["answered less than a minute after asking", "answered less than a minute after asking", "answered 1 min after asking", "answered 1 min after asking", "answered 3 min after asking", "answered 59 min after asking"]);
  assert.deepEqual([g(60 * 60_000), g(125 * 60_000), g(12 * 3_600_000 + 5 * 60_000)], ["answered 1 h after asking", "answered 2 h 5 min after asking", "answered 12 h 5 min after asking"]);
  assert.equal(g(-1), null, "an ask after the answer is no gap");
  assert.equal(gapText(NaN, 5), null);
});

test("an ask only goes with an Ask for a slot answer, and only a whole one", () => {
  assert.equal(one({ source: "turf_bar", ask: asked() }).ask, null, "another tap never has an ask");
  assert.equal(one({ kind: "call", source: "turf_bar", ask: asked() }).ask, null);
  for (const bad of [null, "x", {}, asked({ date: "28 Nov" }), asked({ hour: 24 }), asked({ hour: "15" }), asked({ at: null }), asked({ at: "soon" })]) assert.equal(one({ source: "slot_ask", ask: bad }).ask, null);
  assert.deepEqual(one({ source: "slot_ask", ask: asked({ minute: 75, minutes: 0, sport: " ", players: 0 }) }).ask, { date: "2026-11-28", hour: 15, minute: 0, minutes: 60, sport: null, players: null, at: Date.parse("2026-11-26T13:57:00Z") }, "odd values fall back to a plain hour");
  assert.equal(words({ source: "slot_ask" }).asked, null, "Ask for a slot with no ask found: nothing is made up");
  assert.equal(words({ source: "slot_ask", slot_date: "2026-11-24", slot_hour: 13 }).named, "for Tue 24 Nov, 1 pm", "its own slot is still said");
});

test("the list's turf: its name, city and page; one that is off or gone keeps its row", () => {
  const long = one({ name: "Dream Sports Fields - Inorbit Malad - Football & Cricket Turf", city: "mumbai", slug: "dream-sports-fields-inorbit-malad" });
  assert.deepEqual([turfName(long.turf), long.turf.city, long.turf.path], ["Dream Sports Fields - Inorbit Malad - Football & Cricket Turf", "Mumbai", "/turf/dream-sports-fields-inorbit-malad"]);
  const off = one({ active: false });
  assert.deepEqual([turfName(off.turf), off.turf.path, turfState(off.turf)], ["Turf 1", null, "not listed now"]);
  const gone = one({ name: null, city: null, slug: null, active: false });
  assert.deepEqual([turfName(gone.turf), gone.turf.path, gone.turf.city, turfState(gone.turf)], ["A turf no longer listed", null, null, null]);
  assert.deepEqual([one({ city: "navi mumbai" }).turf.city, one({ city: "<b>" }).turf.city, one({ city: "" }).turf.city], ["Navi Mumbai", null, null]);
});

test("20 rows, Show more adds 20, 200 at most with a plain line at the cap", () => {
  assert.deepEqual([LIST_PAGE, LIST_MAX], [20, 200]);
  assert.deepEqual([listNext(20), listNext(40), listNext(180), listNext(190), listNext(200), listNext(999)], [40, 60, 200, 200, 200, 200]);
  const l = (shown: number, n: number) => listOf(Array.from({ length: shown }, (_, i) => row({ id: i + 1 })), { n })!;
  assert.deepEqual(listPage(l(18, 18), 20), { more: false, left: 0, capped: false }, "all of them are on screen");
  assert.deepEqual(listPage(l(20, 20), 20), { more: false, left: 0, capped: false });
  assert.deepEqual(listPage(l(20, 45), 20), { more: true, left: 25, capped: false }, "more to load");
  assert.deepEqual(listPage(l(200, 200), 200), { more: false, left: 0, capped: false }, "exactly 200: nothing older");
  assert.deepEqual(listPage(l(200, 260), 200), { more: false, left: 60, capped: true }, "at the cap with older answers");
  assert.equal(LIST_CAP_LINE, "These are the latest 200 answers.");
  assert.equal(toAnswerList({ rows: Array.from({ length: 230 }, (_, i) => row({ id: i + 1 })), n: 230 })!.rows.length, 200, "never more than 200 rows");
});

test("the list's count, its note and its switch", () => {
  assert.equal(listCountLine(listOf([row()], { n: 18 })!), "18 answers");
  assert.equal(listCountLine(listOf([row()])!), "1 answer");
  assert.equal(listCountLine(listOf([row()], { n: 45, dismissed: true })!), "45 answers and closed cards");
  assert.equal(listCountLine(listOf([row()], { dismissed: true })!), "1 answer or closed card");
  assert.deepEqual([listCountLine(listOf([])!), listCountLine(listOf([], { dismissed: true })!)], ["No answers here.", "No answers or closed cards here."]);
  assert.equal(LIST_NOTE, "The slot is the latest one asked for at that turf before the answer.");
  assert.equal(CLOSED_SWITCH, "Show the ones who closed it too");
});

test("what the list route is asked: 7, 30 or every day; 1 to 200 rows; closed cards only when asked", () => {
  const q = (s: string) => listQuery(new URLSearchParams(s));
  assert.deepEqual(q(""), { days: 30, limit: 20, dismissed: false });
  assert.deepEqual(q("days=7&limit=40&closed=1"), { days: 7, limit: 40, dismissed: true });
  assert.deepEqual([q("days=0").days, q("days=90").days, q("days=x").days, q("days=-7").days, q("days=07").days], [0, 30, 30, 30, 30]);
  assert.deepEqual(["0", "-5", "1", "200", "201", "9999", "x", "20.5", ""].map((l) => q(`limit=${l}`).limit), [20, 20, 1, 200, 200, 200, 20, 20, 20]);
  assert.deepEqual(["0", "true", "yes", "1"].map((c) => q(`closed=${c}`).dismissed), [false, false, false, true]);
});

test("nothing the card says uses a word it must not, or a long dash", () => {
  const t = toOutcomeTotals(answer({
    top_turfs: [turf(1, { got_slot: 3, full: 1, price: 1, no_reply: 1, wrong_number: 1, just_asking: 1, no_reason: 1, deciding: 1 })],
    wrong_numbers: [turf(1, { wrong_number: 2, last: "2026-11-24" })], wrong_number_turfs: 30, hours: [{ hour: 19, n: 4 }, { hour: 0, n: 1 }],
  }))!;
  const said: string[] = [CLOSED_LABEL, CLOSED_NOTE, TAPS_NOTE, LIST_NOTE, LIST_CAP_LINE, CLOSED_SWITCH, NOT_SET_UP_TEXT, ...Object.values(SAID_LABEL), ...Object.values(ROW_SAID_LABEL), ...Object.values(VIA_LABEL), ...Object.values(WINDOW_LABEL), outcomeFoldLine(t), wrongMore(t)!, topLine(t.topTurfs[0]), wrongLine(t.wrongNumbers[0], t.today), turfName(t.topTurfs[0]), "A turf no longer listed", "not listed now"];
  for (const e of ["not_set_up", "forbidden", "unavailable"] as const) said.push(errorText(e));
  for (const k of WINDOW_KEYS) {
    said.push(headline(t.windows[k]), windowLine(t.windows[k], t.today), headline(win({}, k)), ...breakdown(t.windows[k]).flatMap((r) => [r.label, r.title]), ...tapRows(t.windows[k]).flatMap((r) => [r.label, r.line]));
  }
  said.push(...hourRows(t.hours).map((h) => h.label));
  for (const o of [{}, { source: "slot_ask", ask: asked() }, { source: "slot_ask", slot_date: "2026-11-25", slot_hour: 0, ask: asked() }, { outcome: "dismissed" }, { slot_date: "2026-11-24", slot_hour: 13 }]) said.push(...Object.values(words(o)).filter((v): v is string => typeof v === "string"));
  for (const l of [listOf([row()], { n: 18 })!, listOf([], { dismissed: true })!, listOf([row()], { n: 45, dismissed: true })!]) said.push(listCountLine(l));
  assert.ok(said.length > 90);
  for (const s of said) assert.ok(!BANNED.test(s), `"${s}"`);
  // A share is never said from fewer than 10 answers, in any line.
  for (let n = 1; n < RATE_MIN; n++) assert.ok(!/%/.test(headline(win({ got_slot: n }))), `${n} answers: no share`);
});

// ── The routes' reads ──

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
const body = async (r: Response) => [r.status, r.headers.get("cache-control"), await r.json()];

test("GET /api/admin/outcomes: the totals, private and never kept", async () => {
  const f = fake({ admin_contact_outcome_totals: answer() });
  const r = await createOutcomeReads().totals(f.rpc);
  const [status, cache, j] = await body(r);
  assert.deepEqual([status, cache, j.ok, j.totals.windows.d30.answered, j.totals.windows.d30.gotSlot], [200, "private, no-store", true, 18, 7]);
  assert.deepEqual(f.calls, [["admin_contact_outcome_totals", {}]], "one read, no argument but the caller's own token (added by the route's rpc)");
});

test("GET /api/admin/outcomes/list: the window, the limit and the switch go to the function as asked", async () => {
  const f = fake({ admin_contact_outcome_list: { days: 7, dismissed: true, n: 3, rows: [row({ source: "slot_ask", ask: asked() })] } });
  const r = await createOutcomeReads().list(f.rpc, new Request("https://www.tapturf.in/api/admin/outcomes/list?days=7&limit=40&closed=1"));
  const [status, cache, j] = await body(r);
  assert.deepEqual([status, cache, j.ok, j.list.n, j.list.rows.length, j.list.rows[0].via, j.list.rows[0].ask.hour], [200, "private, no-store", true, 3, 1, "slot_ask", 15]);
  assert.deepEqual(f.calls, [["admin_contact_outcome_list", { p_days: 7, p_limit: 40, p_dismissed: true }]]);
  const g = fake({ admin_contact_outcome_list: { rows: [] } });
  await createOutcomeReads().list(g.rpc, new Request("https://www.tapturf.in/api/admin/outcomes/list?days=365&limit=100000"));
  assert.deepEqual(g.calls[0][1], { p_days: 30, p_limit: 200, p_dismissed: false }, "nothing wider than the card can ask is passed on");
});

test("a refusal, a failure and an answer that isn't one: said as what they are, never a made-up number", async () => {
  const reads = createOutcomeReads();
  const t = async (a: unknown) => body(await reads.totals(fake({ admin_contact_outcome_totals: a }).rpc));
  const l = async (a: unknown) => body(await reads.list(fake({ admin_contact_outcome_list: a }).rpc, new Request("https://x/api/admin/outcomes/list")));
  const no = "private, no-store";
  for (const read of [t, l]) {
    assert.deepEqual(await read({ error: "forbidden" }), [403, no, { ok: false, error: "forbidden" }]);
    assert.deepEqual(await read({ __error: { code: "57014" } }), [503, no, { ok: false, error: "unavailable" }]);
    assert.deepEqual(await read(new Error("fetch failed")), [503, no, { ok: false, error: "unavailable" }]);
    assert.deepEqual(await read(null), [502, no, { ok: false, error: "unavailable" }]);
    assert.deepEqual(await read("x"), [502, no, { ok: false, error: "unavailable" }]);
  }
});

test("before the migration: a quiet answer, and the database is asked again only after a minute", async () => {
  assert.equal(MISSING_FOR_MS, 60_000);
  for (const code of ["PGRST202", "42883"]) {
    const reads = createOutcomeReads();
    const f = fake({ admin_contact_outcome_totals: { __error: { code } }, admin_contact_outcome_list: { __error: { code } } });
    const t0 = 1_000_000;
    assert.deepEqual(await body(await reads.totals(f.rpc, t0)), [200, "private, no-store", { ok: false, error: "not_set_up" }], "not an error: a 200 that says it isn't there yet");
    assert.equal(f.calls.length, 1);
    await reads.totals(f.rpc, t0 + 1);
    await reads.list(f.rpc, new Request("https://x/api/admin/outcomes/list"), t0 + 30_000);
    assert.deepEqual(await body(await reads.totals(f.rpc, t0 + 59_999)), [200, "private, no-store", { ok: false, error: "not_set_up" }]);
    assert.equal(f.calls.length, 1, "within the minute neither read asks the database again");
    await reads.totals(f.rpc, t0 + 60_000);
    assert.equal(f.calls.length, 2, "after a minute it asks once more");
    await reads.list(f.rpc, new Request("https://x/api/admin/outcomes/list"), t0 + 60_001);
    assert.equal(f.calls.length, 2, "and waits again");
    // Once the file is applied the next ask after the wait gets the numbers.
    const applied = fake({ admin_contact_outcome_totals: answer() });
    const j = (await body(await reads.totals(applied.rpc, t0 + 120_001)))[2];
    assert.equal(j.ok, true);
  }
  // A failure that is not a missing function is asked again at once.
  const reads = createOutcomeReads();
  const f = fake({ admin_contact_outcome_totals: { __error: { code: "57014" } } });
  await reads.totals(f.rpc, 5);
  await reads.totals(f.rpc, 6);
  assert.equal(f.calls.length, 2);
  // Another server instance has its own mark.
  const a = createOutcomeReads();
  const b = createOutcomeReads();
  const missing = fake({ admin_contact_outcome_totals: { __error: { code: "PGRST202" } } });
  await a.totals(missing.rpc, 10);
  await b.totals(missing.rpc, 11);
  assert.equal(missing.calls.length, 2);
});
