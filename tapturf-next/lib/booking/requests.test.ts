import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  LIST_MAX,
  MAX_HOURS,
  MAX_PER_TURF_DAY,
  MAX_SENDS_PER_DAY,
  MAX_WAITING,
  ME_COPY,
  NOTE_MAX,
  OWNER_COPY,
  REASON_MAX,
  SHEET_COPY,
  canCancel,
  cancelOutcome,
  effectiveStatus,
  hourChoices,
  limitText,
  meLine,
  parseMine,
  parseMineRow,
  parseOwnerBookings,
  requestFits,
  requestWhatsAppText,
  sendOutcome,
  sortMine,
  toggleNotes,
  waitingCount,
  whenDay,
  whenText,
} from "./requests";
import { PLAYER_COPY, requestFooter, slotDays, type SlotHours } from "../availability/slots";
import { bannedCopy } from "../seo/defaults";
import type { MyBookingRequest } from "./types";

const ist = (s: string) => Date.parse(`${s.replace(" ", "T")}:00+05:30`);
const H = (o: Partial<SlotHours>): SlotHours => ({ opening_hours: null, start_time: null, end_time: null, is_24x7: null, closed_days: null, ...o });
const OVERNIGHT = H({ start_time: "06:00:00", end_time: "02:00:00" });
const SPLIT = H({ opening_hours: { daily: "6–8 AM 4 PM–12 AM" } });
const ALLDAY = H({ is_24x7: true });
const FRI_NOON = ist("2026-11-06 12:00");
const none = new Set<string>();
const SQL = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261106_booking_requests.sql"), "utf8");
const CASES = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/booking/when.cases.json"), "utf8")) as { at: string; hours: number; when: string }[];

test("1. every constant is the migration's", () => {
  const value = (fn: string) => {
    const m = new RegExp(`function private\\.${fn}\\(\\)\\s*returns int language sql immutable set search_path = '' as \\$\\$ select (\\d+) \\$\\$`).exec(SQL);
    assert.ok(m, fn);
    return Number(m[1]);
  };
  assert.equal(value("booking_max_hours"), MAX_HOURS);
  assert.equal(value("booking_max_waiting"), MAX_WAITING);
  assert.equal(value("booking_max_per_turf_day"), MAX_PER_TURF_DAY);
  assert.equal(value("booking_max_sends"), MAX_SENDS_PER_DAY);
  assert.equal(value("booking_list_max"), LIST_MAX);
  assert.ok(SQL.includes(`check (hours between 1 and ${MAX_HOURS})`), "the hours check");
  assert.ok(SQL.includes(`char_length(note) between 1 and ${NOTE_MAX}`), "NOTE_MAX");
  assert.ok(SQL.includes(`char_length(reason) between 1 and ${REASON_MAX}`), "REASON_MAX");
  assert.deepEqual([MAX_HOURS, MAX_WAITING, MAX_PER_TURF_DAY, MAX_SENDS_PER_DAY, LIST_MAX, NOTE_MAX, REASON_MAX], [3, 3, 1, 10, 50, 140, 140], "the agreed numbers");
});

test("2. whenText is private.booking_when (lib/booking/when.cases.json, which the PGlite check reads too)", () => {
  assert.ok(CASES.length >= 6);
  for (const c of CASES) assert.equal(whenText(c.at, c.hours), c.when, c.at);
  assert.equal(whenText("2026-11-08T24:00", 1), "", "not a slot key");
  assert.equal(whenDay("2026-11-07T19:00"), "Sat 7 Nov");
  assert.equal(whenDay("2026-11-08T00:30"), "Sun 8 Nov", "the start's calendar date");
});

test("3. hourChoices: consecutive free hours of the day, 3 at most", () => {
  const [today] = slotDays(OVERNIGHT, FRI_NOON);
  assert.deepEqual(hourChoices(today, none, "2026-11-06T19:00"), [
    { hours: 1, until: "8 PM", range: "7 PM to 8 PM" },
    { hours: 2, until: "9 PM", range: "7 PM to 9 PM" },
    { hours: 3, until: "10 PM", range: "7 PM to 10 PM" },
  ]);
  assert.deepEqual(hourChoices(today, new Set(["2026-11-06T21:00"]), "2026-11-06T19:00").map((c) => c.hours), [1, 2], "stops at a booked hour");
  assert.deepEqual(hourChoices(today, new Set(["2026-11-06T19:00"]), "2026-11-06T19:00"), [], "a booked start: nothing");
  assert.deepEqual(hourChoices(today, none, "2026-11-06T23:00").map((c) => c.until), ["12 AM", "1 AM", "2 AM"], "across midnight");
  assert.deepEqual(hourChoices(today, none, "2026-11-07T01:00").map((c) => c.until), ["2 AM"], "the day's last hour");
  assert.deepEqual(hourChoices(today, none, "2026-11-06T19:30"), [], "not one of the day's hours");
  const [split] = slotDays(SPLIT, ist("2026-11-05 05:00"));
  assert.deepEqual(hourChoices(split, none, "2026-11-05T07:00").map((c) => c.range), ["7 AM to 8 AM"], "stops at the gap between spans");
  const [all] = slotDays(ALLDAY, ist("2026-11-05 05:00"));
  assert.equal(hourChoices(all, none, "2026-11-05T10:00").length, MAX_HOURS, "never more than 3");
});

test("4. requestFits: a grid hour still to come, in the 7 days, with the hours after it", () => {
  assert.equal(requestFits(OVERNIGHT, FRI_NOON, "2026-11-06T19:00", 2), true);
  assert.equal(requestFits(OVERNIGHT, FRI_NOON, "2026-11-06T23:00", 3), true, "across midnight");
  assert.equal(requestFits(OVERNIGHT, FRI_NOON, "2026-11-12T19:00", 1), true, "the 7th day");
  assert.equal(requestFits(OVERNIGHT, FRI_NOON, "2026-11-06T19:15", 1), false, "off the grid");
  assert.equal(requestFits(OVERNIGHT, FRI_NOON, "2026-11-06T12:00", 1), false, "started");
  assert.equal(requestFits(OVERNIGHT, FRI_NOON, "2026-11-06T09:00", 1), false, "over");
  assert.equal(requestFits(OVERNIGHT, FRI_NOON, "2026-11-13T19:00", 1), false, "past the 7 days");
  assert.equal(requestFits(OVERNIGHT, FRI_NOON, "2026-11-06T19:00", 4), false, "4 hours");
  assert.equal(requestFits(OVERNIGHT, FRI_NOON, "2026-11-06T19:00", 0), false, "0 hours");
  assert.equal(requestFits(OVERNIGHT, FRI_NOON, "2026-11-07T01:00", 2), false, "a run past closing");
  assert.equal(requestFits(OVERNIGHT, FRI_NOON, "2026-11-06T03:00", 1), false, "a closed hour");
  assert.equal(requestFits(SPLIT, ist("2026-11-05 05:00"), "2026-11-05T07:00", 2), false, "across the gap");
  assert.equal(requestFits(H({}), FRI_NOON, "2026-11-06T19:00", 1), false, "no hours known");
  assert.equal(requestFits(OVERNIGHT, FRI_NOON, "junk", 1), false);
});

const row = (o: Partial<MyBookingRequest> = {}): MyBookingRequest => ({
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  turf_id: "cccccccc-0000-4000-8000-000000000001",
  turf_name: "One Arena",
  turf_slug: "one-arena",
  at: "2026-11-07T19:00",
  hours: 2,
  when: "Sat 7 Nov, 7 PM to 9 PM",
  note: null,
  status: "waiting",
  changed_by: null,
  reason: null,
  created_at: "2026-11-06T06:00:00+00:00",
  changed_at: null,
  can_cancel: true,
  ...o,
});

test("5. effectiveStatus and canCancel: a waiting request expires at its start", () => {
  const before = ist("2026-11-07 18:59");
  const at = ist("2026-11-07 19:00");
  assert.equal(effectiveStatus("waiting", "2026-11-07T19:00", before), "waiting");
  assert.equal(effectiveStatus("waiting", "2026-11-07T19:00", at), "expired");
  assert.equal(effectiveStatus("confirmed", "2026-11-07T19:00", at), "confirmed");
  assert.equal(effectiveStatus("declined", "2026-11-07T19:00", before), "declined");
  assert.equal(canCancel(row(), before), true);
  assert.equal(canCancel(row({ status: "confirmed" }), before), true);
  assert.equal(canCancel(row({ status: "confirmed" }), at), false, "started");
  assert.equal(canCancel(row(), at), false, "expired");
  for (const s of ["declined", "cancelled", "expired"] as const) assert.equal(canCancel(row({ status: s }), before), false, s);
  const list = [
    row({ id: "a1", status: "declined", can_cancel: false, created_at: "2026-11-06T09:00:00Z" }),
    row({ id: "a2", created_at: "2026-11-06T07:00:00Z" }),
    row({ id: "a3", status: "confirmed", created_at: "2026-11-06T08:00:00Z" }),
    row({ id: "a4", status: "cancelled", can_cancel: false, created_at: "2026-11-06T10:00:00Z" }),
  ];
  assert.deepEqual(sortMine(list).map((r) => r.id), ["a3", "a2", "a4", "a1"], "open ones first, newest first in each");
  // Open is the database's can_cancel as of the read, never the phone's clock: a confirmed one that has started sorts with the rest.
  const started = row({ id: "a5", status: "confirmed", can_cancel: false, created_at: "2026-11-06T11:00:00Z" });
  assert.deepEqual(sortMine([...list, started]).map((r) => r.id), ["a3", "a2", "a5", "a4", "a1"]);
  assert.equal(waitingCount(list, before), 1);
  assert.equal(waitingCount(list, at), 0, "an expired one waits for nobody");
});

test("6. sendOutcome: one sheet state for every answer", () => {
  const cases: [number, unknown, string][] = [
    [200, { r: "ok", request: {} }, "sent"],
    [409, { error: "not_allowed", reason: "off" }, "off"],
    [409, { error: "not_allowed", reason: "own" }, "own"],
    [409, { error: "not_allowed", reason: "no_phone" }, "no_phone"],
    [409, { error: "conflict", reason: "taken", booked: [] }, "taken"],
    [409, { error: "conflict", reason: "past" }, "taken"],
    [400, { error: "bad", field: "at" }, "taken"],
    [429, { error: "limit", reason: "waiting" }, "limit_waiting"],
    [429, { error: "limit", reason: "day" }, "limit_day"],
    [429, { error: "limit", reason: "overlap" }, "limit_overlap"],
    [429, { error: "limit", reason: "sends" }, "limit_sends"],
    [401, { error: "sign_in" }, "sign_in"],
    [503, { error: "unavailable", reason: "not_ready" }, "failed"],
    [503, { error: "unavailable" }, "failed"],
    [429, { error: "slow" }, "failed"],
    [404, { error: "new" }, "failed"],
    [400, { error: "bad", field: "note" }, "failed"],
    [0, { error: "unavailable" }, "failed"],
    [200, "<html>", "failed"],
    [200, { r: "nope" }, "failed"],
  ];
  for (const [status, body, want] of cases) assert.equal(sendOutcome(status, body), want, JSON.stringify([status, body]));
  assert.deepEqual(
    (["limit_waiting", "limit_day", "limit_overlap", "limit_sends"] as const).map((l) => limitText(l, "2026-11-08T00:00")),
    [SHEET_COPY.limitWaiting, "You already have a request waiting at this turf for Sun 8 Nov.", SHEET_COPY.limitOverlap, SHEET_COPY.limitSends],
    "each limit's words",
  );
});

test("7. the WhatsApp after sending: exactly the agreed words, no emoji", () => {
  const t = requestWhatsAppText({ turfName: "One Arena", when: "Sat 7 Nov, 7 PM to 9 PM" });
  assert.equal(t, "Hi! I just sent a request on TapTurf for *One Arena*: Sat 7 Nov, 7 PM to 9 PM. Please confirm it on myTapturf: https://www.tapturf.in/my");
  assert.doesNotMatch(t, /\p{Extended_Pictographic}/u);
});

test("8. words: the player's never say book, instant, guaranteed or hurry; nobody's say TapTurf takes no bookings", () => {
  const call = (v: unknown): string[] => (typeof v === "function" ? [String(v("Sat 7 Nov")), String(v(1)), String(v(2))] : typeof v === "object" && v ? Object.values(v).flatMap(call) : [String(v)]);
  const player = [
    ...Object.values(SHEET_COPY).flatMap(call),
    ...Object.values(ME_COPY).flatMap(call),
    PLAYER_COPY.hintRequest,
    requestFooter(false),
    requestFooter(true),
    requestWhatsAppText({ turfName: "One Arena", when: "Sat 7 Nov, 7 PM to 9 PM" }),
    ...(["waiting", "confirmed", "declined", "cancelled", "expired"] as const).flatMap((s) =>
      (["owner", "player", "taken", "clock", null] as const).map((by) => meLine({ status: s, changed_by: by })),
    ),
  ];
  for (const s of player) {
    assert.equal(bannedCopy(s), null, s);
    assert.doesNotMatch(s, /\bbook/i, s);
    assert.doesNotMatch(s, /instant|guarantee|hurry|filling fast|only \d+ left|last chance/i, s);
  }
  for (const s of [...player, ...Object.values(OWNER_COPY).flatMap(call)]) assert.doesNotMatch(s, /(doesn.?t|don.?t|do not|does not) take bookings/i, s);
  // The agreed lines, word for word.
  assert.equal(SHEET_COPY.seesYou, "The turf will see your name and number.");
  assert.equal(SHEET_COPY.sent, "Request sent.");
  assert.equal(SHEET_COPY.sentLine, "The turf confirms here; you'll get a message.");
  assert.equal(SHEET_COPY.pay, "Pay at the turf; nothing is paid online.");
  assert.equal(SHEET_COPY.limitWaiting, "You have 3 requests waiting for an answer. Cancel one on your Me tab, or wait for an answer.");
  assert.equal(SHEET_COPY.limitSends, "You've sent 10 requests today. Try again tomorrow.");
  assert.equal(SHEET_COPY.limitDay("Sat 7 Nov"), "You already have a request waiting at this turf for Sat 7 Nov.");
  assert.equal(OWNER_COPY.toggle, "Take booking requests on TapTurf");
  assert.equal(OWNER_COPY.confirmed(0), "Confirmed. Those hours are marked Booked.");
  assert.equal(OWNER_COPY.confirmed(1), "Confirmed. Those hours are marked Booked. 1 other request for them was declined.");
  assert.equal(OWNER_COPY.confirmed(2), "Confirmed. Those hours are marked Booked. 2 other requests for them were declined.");
  assert.equal(OWNER_COPY.heading(2), "Booking requests · 2");
  assert.equal(OWNER_COPY.heading(0), "Booking requests", "no count of 0 above a confirmed booking");
  assert.equal(SHEET_COPY.limitOverlap, "You already have a request waiting at this turf for some of these hours.");
  assert.equal(OWNER_COPY.toggleNever("Show free hours to players"), "Players can't send requests until your free hours show on your page. Tap Show free hours to players below.");
  assert.equal(OWNER_COPY.toggleHidden("All correct"), "Players can't send requests while your free hours are hidden. Tap All correct below to show them.");
  assert.equal(ME_COPY.confirmedMeanwhile, "The turf confirmed this just now. Tap Cancel if you still want to cancel it.");
  assert.equal(OWNER_COPY.askCancel("Priya"), "Cancel this booking? Priya will be told, and the hours go back to Free.");
  assert.equal(ME_COPY.heading, "Turf requests");
  assert.equal(ME_COPY.said("Rain"), 'The turf said: "Rain"');
});

test("9. meLine: what each state says on the Me tab, from the database's state alone (no clock, so it agrees with the pill)", () => {
  assert.equal(meLine({ status: "waiting", changed_by: null }), "The turf confirms here; you'll get a message.");
  assert.equal(meLine({ status: "confirmed", changed_by: "owner" }), "Confirmed. Pay at the turf.");
  assert.equal(meLine({ status: "declined", changed_by: "owner" }), "The turf declined this.");
  assert.equal(meLine({ status: "declined", changed_by: "taken" }), "Those hours went to someone else.");
  assert.equal(meLine({ status: "cancelled", changed_by: "player" }), "You cancelled this.");
  assert.equal(meLine({ status: "cancelled", changed_by: "owner" }), "The turf cancelled this.");
  assert.equal(meLine({ status: "expired", changed_by: "clock" }), "No answer before it started.");
  assert.equal(meLine.length, 1, "takes no clock");
});

test("11. cancelOutcome: answered meanwhile or gone reloads with no error; started says so; only a failed call says try again", () => {
  assert.deepEqual(cancelOutcome(200, { r: "ok", status: "cancelled", request: {} }), { done: true });
  assert.deepEqual(cancelOutcome(409, { error: "conflict", reason: "answered", status: "declined" }), { done: false, reload: true, error: null, note: null });
  assert.deepEqual(cancelOutcome(409, { error: "conflict", reason: "answered", status: "expired" }), { done: false, reload: true, error: null, note: null });
  assert.deepEqual(cancelOutcome(409, { error: "conflict", reason: "answered", status: "confirmed" }), { done: false, reload: true, error: null, note: ME_COPY.confirmedMeanwhile });
  assert.deepEqual(cancelOutcome(400, { error: "bad", reason: "gone" }), { done: false, reload: true, error: null, note: null });
  assert.deepEqual(cancelOutcome(409, { error: "not_allowed", reason: "started" }), { done: false, reload: true, error: ME_COPY.started, note: null });
  for (const [status, body] of [[0, { error: "unavailable" }], [503, { error: "unavailable" }], [500, "<html>"], [200, { r: "nope" }]] as const)
    assert.deepEqual(cancelOutcome(status, body), { done: false, reload: false, error: ME_COPY.cancelFailed, note: null }, JSON.stringify([status, body]));
});

test("12. toggleNotes: never two lines that disagree, and the button named is the one Free slots shows", () => {
  const never = { kind: "never", button: "Show free hours to players" } as const;
  const hidden = { kind: "hidden", button: "All correct" } as const;
  const live = { kind: "live", button: "All correct" } as const;
  const ending = { kind: "ending", button: "All correct" } as const;
  assert.deepEqual(toggleNotes({ on: true, justOn: true, status: never }), { on: null, hidden: OWNER_COPY.toggleNever("Show free hours to players") }, "first use: only what stops requests");
  assert.deepEqual(toggleNotes({ on: true, justOn: true, status: hidden }), { on: null, hidden: OWNER_COPY.toggleHidden("All correct") }, "a day old");
  assert.deepEqual(toggleNotes({ on: true, justOn: true, status: live }), { on: OWNER_COPY.toggleOn, hidden: null });
  assert.deepEqual(toggleNotes({ on: true, justOn: true, status: ending }), { on: OWNER_COPY.toggleOn, hidden: null });
  assert.deepEqual(toggleNotes({ on: true, justOn: false, status: live }), { on: null, hidden: null }, "on, from before");
  assert.deepEqual(toggleNotes({ on: true, justOn: false, status: never }), { on: null, hidden: OWNER_COPY.toggleNever("Show free hours to players") });
  for (const status of [never, hidden, live]) assert.deepEqual(toggleNotes({ on: false, justOn: false, status }), { on: null, hidden: null }, `off: nothing (${status.kind})`);
});

test("10. the parsers: well formed rows kept, the rest dropped; junk is null", () => {
  const good = row();
  assert.deepEqual(parseMineRow(good), good);
  assert.deepEqual(parseMine({ ready: true, requests: [good, { ...good, at: "2026-11-07T24:00" }, { ...good, hours: 4 }, { ...good, status: "maybe" }, "x", null] }), { ready: true, requests: [good] });
  assert.deepEqual(parseMine({ ready: false, requests: [] }), { ready: false, requests: [] });
  for (const junk of [null, "x", [], {}, { ready: true }, { ready: "yes", requests: [] }, { requests: [] }]) assert.equal(parseMine(junk), null, JSON.stringify(junk));
  assert.equal(parseMineRow({ ...good, turf_slug: "../admin" })?.turf_slug, null, "only a slug");
  assert.equal(parseMineRow({ ...good, changed_by: "robot" })?.changed_by, null);
  assert.equal(parseMineRow({ ...good, when: undefined })?.when, "Sat 7 Nov, 7 PM to 9 PM", "worked out when missing");
  const owner = { id: "aaaaaaaa-0000-4000-8000-000000000009", at: "2026-11-07T19:00", hours: 2, when: "Sat 7 Nov, 7 PM to 9 PM", name: "Priya", phone: "+919100000001", note: "5-a-side", created_at: "2026-11-06T06:00:00Z" };
  const state = { ok: true, now: "2026-11-06T06:30:00Z", on: true, open: true, waiting: [owner, { ...owner, phone: "12345" }], confirmed: [], done: "confirm", declined_others: 1 };
  assert.deepEqual(parseOwnerBookings(state), { ok: true, now: state.now, on: true, open: true, waiting: [owner], confirmed: [], done: "confirm", declined_others: 1 });
  assert.deepEqual(parseOwnerBookings({ error: "forbidden" }), { error: "forbidden" });
  assert.deepEqual(parseOwnerBookings({ error: "answered", status: "confirmed" }), { error: "answered", status: "confirmed" });
  for (const junk of [null, [], "x", { ok: true }, { ...state, now: "junk" }, { ...state, waiting: null }, { ...state, on: "yes" }]) assert.equal(parseOwnerBookings(junk), null, JSON.stringify(junk));
});
