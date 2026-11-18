import { test } from "node:test";
import assert from "node:assert/strict";
import { OWNER_ASKS_COPY, askHourLabel, parseOwnerAsks, topAsked } from "./slotAsks";

// myTapturf's Analytics: the slots players asked for (owner_slot_asks). Made-up counts.

const RAW = { days: 30, since: "2026-10-20", today: "2026-11-18", asks: 14, prev: 6, hours: [{ hour: 6, n: 1 }, { hour: 19, n: 6 }, { hour: 20, n: 4 }, { hour: 21, n: 3 }] };

test("the read: a whole answer or nothing", () => {
  assert.deepEqual(parseOwnerAsks(RAW), { days: 30, asks: 14, prev: 6, hours: RAW.hours });
  assert.deepEqual(parseOwnerAsks({ ...RAW, days: 90 })?.days, 90);
  assert.deepEqual(parseOwnerAsks({ days: 7, asks: 0, prev: 0, hours: [] }), { days: 7, asks: 0, prev: 0, hours: [] });
  const bad: unknown[] = [null, "x", [], {}, { error: "forbidden" }, { ...RAW, days: 3 }, { ...RAW, days: 400 }, { ...RAW, asks: 15 }, { ...RAW, asks: "14" }, { ...RAW, prev: -1 }, { ...RAW, hours: null },
    { ...RAW, hours: [{ hour: 24, n: 14 }] }, { ...RAW, hours: [{ hour: 19, n: 7 }, { hour: 19, n: 7 }] }, { ...RAW, hours: [{ hour: 19, n: 0 }, { hour: 20, n: 14 }] }];
  for (const b of bad) assert.equal(parseOwnerAsks(b), null, JSON.stringify(b)?.slice(0, 80));
});

test("the hours asked for most: most first, a tie to the earlier hour, five at most", () => {
  const a = parseOwnerAsks(RAW)!;
  assert.deepEqual(topAsked(a).map((h) => [askHourLabel(h.hour), h.n]), [["7 PM", 6], ["8 PM", 4], ["9 PM", 3], ["6 AM", 1]]);
  assert.deepEqual(topAsked({ days: 30, asks: 7, prev: 0, hours: [5, 6, 7, 8, 9, 10, 11].map((hour) => ({ hour, n: 1 })) }).map((h) => h.hour), [5, 6, 7, 8, 9]);
  assert.deepEqual([0, 12, 13, 23].map(askHourLabel), ["12 AM", "12 PM", "1 PM", "11 PM"]);
});

test("the words count asks, never people, and never a booking", () => {
  for (const w of [OWNER_ASKS_COPY.title, OWNER_ASKS_COPY.stat, OWNER_ASKS_COPY.top, OWNER_ASKS_COPY.note(30)]) assert.doesNotMatch(w.replace("not people", ""), /book|customer|people|leads?|confirmed/i, w);
  assert.match(OWNER_ASKS_COPY.note(90), /in the last 90 days: times asked, not people\. Compared with the 90 days before\./);
});
