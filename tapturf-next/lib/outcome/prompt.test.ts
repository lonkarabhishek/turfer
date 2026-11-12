import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANSWERED_MAX,
  EMPTY_MEMORY,
  MAX_AGE_MS,
  MAX_ASKS_PER_DAY,
  MIN_AWAY_MS,
  SAME_TURF_MS,
  SNOOZE_MS,
  afterAnswer,
  afterAsk,
  afterClose,
  decide,
  leftAfterTap,
  newTap,
  quietPath,
  readMemory,
  readTap,
  type Memory,
  type Tap,
} from "./prompt";
import { istDay } from "./outcome";

// When the "Did you get a slot?" card may show. Made-up turfs.

const T = (n: number) => `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, "0")}`;
/** 13 Nov 2026, 6:20 PM in India. */
const NOW = Date.parse("2026-11-13T12:50:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const tap = (o: Partial<Tap> = {}): Tap => ({ turf: T(1), name: "Kings Turf", kind: "call", source: "turf_bar", at: NOW - 5 * MIN, left: true, signedIn: true, ...o });
const mem = (o: Partial<Memory> = {}): Memory => ({ ...EMPTY_MEMORY, answered: {}, ...o });
const ask = (o: Partial<Parameters<typeof decide>[0]> = {}) => decide({ tap: tap(), memory: mem(), now: NOW, path: "/turf/kings-turf", ...o });

test("the limits, as the site owner asked", () => {
  assert.deepEqual([MIN_AWAY_MS, MAX_AGE_MS, SAME_TURF_MS, SNOOZE_MS, MAX_ASKS_PER_DAY], [15_000, 3 * HOUR, 7 * DAY, 3 * DAY, 2]);
});

test("back from a tap between 15 seconds and 3 hours later: ask, about that tap", () => {
  assert.deepEqual(ask(), { do: "ask", tap: tap() });
  assert.equal(ask({ tap: tap({ at: NOW - MIN_AWAY_MS }) }).do, "ask", "15 seconds exactly");
  assert.equal(ask({ tap: tap({ at: NOW - MAX_AGE_MS }) }).do, "ask", "3 hours exactly");
  assert.equal(ask({ path: "/" }).do, "ask", "on any page of the site");
  assert.equal(ask({ path: "/hyderabad" }).do, "ask");
});

test("no tap, or the player never left: nothing", () => {
  assert.deepEqual(ask({ tap: null }), { do: "wait", tap: null, why: "no_tap" });
  const here = tap({ left: false });
  assert.deepEqual(ask({ tap: here }), { do: "wait", tap: here, why: "not_left" });
  assert.equal(ask({ tap: tap({ left: false, at: NOW - 2 * HOUR }) }).do, "wait", "however long they stay on the page");
});

test("back after 3 seconds: not asked; the tap waits for a real return", () => {
  const d = ask({ tap: tap({ at: NOW - 3_000 }) });
  assert.deepEqual(d, { do: "wait", tap: tap({ at: NOW - 3_000, left: false }), why: "too_soon" });
  assert.equal(ask({ tap: tap({ at: NOW - (MIN_AWAY_MS - 1) }) }).do, "wait", "just under 15 seconds");
  // They stay on the page: still nothing, even a minute on.
  assert.equal(decide({ tap: d.do === "wait" ? d.tap : null, memory: mem(), now: NOW + MIN, path: "/" }).do, "wait");
  // They leave again and come back: now it is asked.
  const again = leftAfterTap(d.do === "wait" ? d.tap : null);
  assert.equal(decide({ tap: again, memory: mem(), now: NOW + 2 * MIN, path: "/" }).do, "ask");
});

test("back after more than 3 hours, or with a clock gone wrong: the tap is forgotten", () => {
  assert.deepEqual(ask({ tap: tap({ at: NOW - MAX_AGE_MS - 1 }) }), { do: "forget", why: "too_old" });
  assert.deepEqual(ask({ tap: tap({ at: NOW + MIN }) }), { do: "forget", why: "too_old" });
});

test("never on the admin, myTapturf, the owner's report or the email pages; the tap waits for another page", () => {
  for (const p of ["/admin", "/admin/people", "/my", "/my/turf/abc", "/MY/turf/abc", "/report/abcdef", "/email/off", "/email"]) {
    assert.equal(quietPath(p), true, p);
    assert.deepEqual(ask({ path: p }), { do: "wait", tap: tap(), why: "quiet_page" }, p);
  }
  for (const p of ["/", "/turfs", "/turf/kings-turf", "/mysore", "/myth", "/reports", "/administrator", "/emails", "/dashboard", "/games"]) assert.equal(quietPath(p), false, p);
});

test("the bottom of the screen is taken (cookie card, Ask): not now, the tap waits", () => {
  assert.deepEqual(ask({ busy: true }), { do: "wait", tap: tap(), why: "busy" });
  assert.equal(ask({ busy: false }).do, "ask");
});

test("once per tap: a newer tap replaces the one waiting, and is what gets asked", () => {
  const first = newTap({ turf: T(1), name: "Kings Turf", kind: "call", source: "turf_bar", signedIn: false }, NOW - 10 * MIN)!;
  const second = newTap({ turf: T(2), name: "  Queens   Arena ", kind: "whatsapp", source: "turf_slots", signedIn: true }, NOW - MIN)!;
  assert.deepEqual(second, { turf: T(2), name: "Queens Arena", kind: "whatsapp", source: "turf_slots", at: NOW - MIN, left: false, signedIn: true });
  assert.equal(first.left, false, "a new tap has not been left yet");
  const d = decide({ tap: leftAfterTap(second), memory: mem(), now: NOW, path: "/" });
  assert.equal(d.do === "ask" && d.tap.turf, T(2));
  assert.equal(leftAfterTap(null), null);
  const left = leftAfterTap(first)!;
  assert.equal(leftAfterTap(left), left, "leaving twice changes nothing");
});

test("a tap that names no turf is never kept", () => {
  assert.equal(newTap({ turf: "nope", name: "X", kind: "call", source: "turf_bar", signedIn: false }, NOW), null);
  assert.equal(newTap({ turf: T(1), name: "   ", kind: "call", source: "turf_bar", signedIn: false }, NOW), null);
  assert.equal(newTap({ turf: T(1), name: "X", kind: "sms" as "call", source: "turf_bar", signedIn: false }, NOW), null);
  assert.equal(newTap({ turf: T(1).toUpperCase(), name: "X", kind: "call", source: "Not A Source", signedIn: false }, NOW)?.source, "unknown");
  assert.equal(newTap({ turf: T(1), name: "N".repeat(300), kind: "call", source: "turf_bar", signedIn: false }, NOW)?.name.length, 120);
});

test("not twice for the same turf within 7 days of an answer; another turf may be asked", () => {
  const m = afterAnswer(mem(), T(1), NOW - DAY);
  assert.deepEqual(ask({ memory: m }), { do: "forget", why: "same_turf" });
  assert.equal(ask({ memory: m, tap: tap({ turf: T(2) }) }).do, "ask");
  assert.equal(ask({ memory: afterAnswer(mem(), T(1), NOW - SAME_TURF_MS + MIN) }).do, "forget", "just under 7 days");
  assert.equal(ask({ memory: readMemory(JSON.stringify(afterAnswer(mem(), T(1), NOW - SAME_TURF_MS)), NOW) }).do, "ask", "7 days on, it may be asked again");
});

test("at most 2 asks a day on one device, India's day", () => {
  let m = mem();
  assert.equal(ask({ memory: m }).do, "ask");
  m = afterAsk(m, NOW);
  assert.deepEqual([m.day, m.asks], ["2026-11-13", 1]);
  assert.equal(ask({ memory: m, tap: tap({ turf: T(2) }) }).do, "ask", "a second ask the same day");
  m = afterAsk(m, NOW + HOUR);
  assert.equal(m.asks, 2);
  assert.deepEqual(ask({ memory: m, tap: tap({ turf: T(3) }), now: NOW + 2 * HOUR }), { do: "forget", why: "day_cap" }, "a third is not shown");
  // 11:50 PM India the same day: still capped. 12:10 AM: a new day.
  const late = Date.parse("2026-11-13T18:20:00Z");
  assert.equal(ask({ memory: readMemory(JSON.stringify(m), late), tap: tap({ turf: T(3), at: late - MIN }), now: late }).do, "forget");
  const next = Date.parse("2026-11-13T18:40:00Z");
  assert.equal(istDay(next), "2026-11-14");
  assert.equal(ask({ memory: readMemory(JSON.stringify(m), next), tap: tap({ turf: T(3), at: next - MIN }), now: next }).do, "ask");
  assert.deepEqual([afterAsk(m, next).day, afterAsk(m, next).asks], ["2026-11-14", 1], "the count starts again");
});

test("the card's ✕ snoozes every ask for 3 days", () => {
  const m = afterClose(mem(), NOW);
  assert.equal(m.snoozeUntil, NOW + SNOOZE_MS);
  for (const t of [T(1), T(2)]) assert.deepEqual(ask({ memory: m, tap: tap({ turf: t, at: NOW + MIN }), now: NOW + 5 * MIN }), { do: "forget", why: "snoozed" });
  const justBefore = NOW + SNOOZE_MS - MIN;
  assert.equal(ask({ memory: readMemory(JSON.stringify(m), justBefore), tap: tap({ at: justBefore - MIN }), now: justBefore }).do, "forget");
  const after = NOW + SNOOZE_MS + MIN;
  assert.equal(ask({ memory: readMemory(JSON.stringify(m), after), tap: tap({ at: after - MIN }), now: after }).do, "ask", "3 days on, asks may show again");
});

test("the order of the rules: a quiet page keeps the tap; the device's own reasons forget it", () => {
  const snoozed = afterClose(mem(), NOW);
  assert.equal(ask({ memory: snoozed, path: "/my" }).do, "wait", "on myTapturf nothing is decided yet");
  assert.equal(ask({ memory: snoozed, busy: true }).do, "forget", "a snooze forgets the tap even while the cookie card shows");
  assert.equal(ask({ tap: tap({ at: NOW - 3_000 }), memory: snoozed }).do, "wait", "a quick return is not a return, whatever else");
});

test("the device's memory: read back as written; what has run out is left behind; nonsense is empty", () => {
  let m = afterAsk(afterAnswer(afterClose(mem(), NOW), T(1), NOW), NOW);
  assert.deepEqual(readMemory(JSON.stringify(m), NOW), m);
  assert.deepEqual(readMemory(JSON.stringify(m), NOW + 8 * DAY), { snoozeUntil: 0, answered: {}, day: istDay(NOW + 8 * DAY), asks: 0 });
  for (const bad of [null, "", "x", "[]", "null", "{}", '{"answered":"x","asks":"3","snoozeUntil":"soon"}'])
    assert.deepEqual(readMemory(bad, NOW), { snoozeUntil: 0, answered: {}, day: bad && bad !== "x" && bad !== "null" ? istDay(NOW) : "", asks: 0 }, String(bad));
  assert.equal(readMemory(JSON.stringify({ snoozeUntil: NOW + 30 * DAY }), NOW).snoozeUntil, 0, "a snooze longer than one can be is not kept");
  assert.deepEqual(readMemory(JSON.stringify({ answered: { nope: NOW, [T(1)]: NOW + DAY, [T(2).toUpperCase()]: NOW - MIN } }), NOW).answered, { [T(2)]: NOW - MIN }, "only turf ids, only past answers");
  for (let i = 1; i <= ANSWERED_MAX + 10; i++) m = afterAnswer(m, T(i), NOW + i);
  assert.equal(Object.keys(m.answered).length, ANSWERED_MAX, "at most 30 turfs remembered");
  assert.ok(m.answered[T(ANSWERED_MAX + 10)] && !m.answered[T(1)], "the oldest go first");
  assert.doesNotMatch(JSON.stringify(m), /Kings|call|whatsapp|turf_bar/, "the marks hold turf ids and times only");
});

test("the waiting tap: read back as written; nonsense is none", () => {
  const t = tap({ left: false });
  assert.deepEqual(readTap(JSON.stringify(t)), t);
  assert.deepEqual(readTap(JSON.stringify(leftAfterTap(t))), { ...t, left: true });
  for (const bad of [null, "", "x", "[]", "null", "{}", JSON.stringify({ ...t, turf: "x" }), JSON.stringify({ ...t, at: "now" }), JSON.stringify({ ...t, kind: "sms" }), JSON.stringify({ ...t, name: 5 })])
    assert.equal(readTap(bad), null, String(bad));
});
