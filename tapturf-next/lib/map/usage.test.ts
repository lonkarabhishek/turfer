import { test } from "node:test";
import assert from "node:assert/strict";
import { mapLine, mapUseById, mapUseText, toMapUsage } from "./usage";

const ASHA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const RAVI = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const GONE = "aaaaaaaa-aaaa-4aaa-8aaa-000000000099";
const zero = { views: 0, visitors: 0, signed_views: 0, signed_people: 0, taps: 0, minis: 0 };
// As admin_map_usage answers (PostgREST sends sums as numbers, or strings for big ones).
const answer = {
  today: "2026-11-02",
  since: "2026-11-02",
  totals: {
    today: { views: 12, visitors: 8, signed_views: 3, signed_people: 2, taps: 4, minis: 1 },
    d7: { views: "140", visitors: 96, signed_views: 20, signed_people: 5, taps: 40, minis: 9 },
    d30: { ...zero, views: 560, visitors: 900 },
  },
  daily: [
    { day: "2026-11-02", views: 12, visitors: 8, signed_views: 3, taps: 4, minis: 1 },
    { day: "2026-11-01", views: 0, visitors: 0, signed_views: 0, taps: 0, minis: 0 },
    { day: "bad", views: 5 },
  ],
  people: [
    { user_id: ASHA.toUpperCase(), known: true, name: "Asha Patil", username: "asha_p", views: 3, taps: 2, minis: 0, days: 2, first_at: "2026-10-31T10:00:00+00:00", last_at: "2026-11-02T06:00:00.123+00:00" },
    { user_id: null, name: "No id" },
    { user_id: RAVI, known: true, name: null, username: null, views: "1", taps: -4, minis: 1, days: 1, first_at: "x", last_at: null },
    { user_id: GONE, known: false, name: null, username: null, views: 1, taps: 0, minis: 0, days: 1, first_at: null, last_at: null },
  ],
  people_total: 3,
};

test("the admin read: numbers as numbers, a bad field 0, visitors never past views, days oldest first", () => {
  const u = toMapUsage(answer);
  assert.ok(u);
  assert.equal(u.today, "2026-11-02");
  assert.equal(u.since, "2026-11-02");
  assert.deepEqual(u.totals.today, { views: 12, visitors: 8, signedViews: 3, signedPeople: 2, taps: 4, minis: 1 });
  assert.equal(u.totals.d7.views, 140, "a sum sent as a string");
  assert.equal(u.totals.d30.visitors, 560, "visitors at most views");
  assert.deepEqual(u.daily.map((d) => d.day), ["2026-11-01", "2026-11-02"], "a day that isn't one is left out; oldest first");
  assert.deepEqual(u.people.map((p) => p.id), [ASHA, RAVI, GONE], "a person without an id is left out; ids in lower case");
  assert.deepEqual(u.people[0], { id: ASHA, known: true, name: "Asha Patil", username: "asha_p", views: 3, taps: 2, minis: 0, days: 2, firstAt: Date.parse("2026-10-31T10:00:00Z"), lastAt: Date.parse("2026-11-02T06:00:00.123Z") });
  assert.deepEqual(u.people[1], { id: RAVI, known: true, name: null, username: null, views: 1, taps: 0, minis: 1, days: 1, firstAt: null, lastAt: null }, "no name or username, still an account");
  assert.equal(u.people[2].known, false, "an erased account");
  assert.equal(toMapUsage({ ...answer, people: [{ user_id: ASHA, name: null }] })?.people[0].known, true, "an answer that doesn't say: known (the people list copes with an id it lacks)");
  assert.equal(u.peopleTotal, 3);
  assert.equal(JSON.stringify(u).includes("email") || JSON.stringify(u).includes("phone"), false, "no contact fields");
});

test("the admin read: anything that isn't an answer is null", () => {
  for (const x of [null, undefined, [], "x", {}, { today: "2 Nov", totals: {} }, { today: "2026-11-02" }]) assert.equal(toMapUsage(x), null, JSON.stringify(x));
  const bare = toMapUsage({ today: "2026-11-02", totals: {} });
  assert.ok(bare);
  assert.deepEqual([bare.since, bare.daily, bare.people, bare.peopleTotal, bare.totals.d30.views], [null, [], [], 0, 0], "an empty database");
});

test("each person's use: theirs, none when the list holds everyone, unknown when it was cut short", () => {
  const u = toMapUsage(answer)!;
  const by = mapUseById(u);
  assert.deepEqual(by.get(ASHA), { views: 3, taps: 2, minis: 0, days: 2, firstAt: u.people[0].firstAt, lastAt: u.people[0].lastAt });
  assert.equal(by.get(ASHA.toUpperCase())?.views, 3, "any case");
  assert.equal(by.get("someone-else"), null, "the list holds all 3: never used it");
  assert.equal(mapUseById({ ...u, peopleTotal: 5 }).get("someone-else"), undefined, "the list was cut short: can't say");
  assert.equal(mapUseById(null).get(ASHA), undefined, "no read: can't say");
});

test("the words: the fold's line and a person's use", () => {
  const u = toMapUsage(answer)!;
  assert.equal(mapLine(u), "12 views today · 140 in 7 days · 5 people signed in this week");
  assert.equal(mapLine({ ...u, totals: { ...u.totals, today: { ...u.totals.today, views: 1 }, d7: { ...u.totals.d7, signedPeople: 1, views: 1200 } } }), "1 view today · 1,200 in 7 days · 1 person signed in this week");
  assert.equal(mapLine({ ...u, since: null }), "Counting views of the map from today");
  assert.equal(mapUseText({ views: 3, taps: 1, minis: 2 }), "3 views, 1 card opened, 2 turf page maps");
  assert.equal(mapUseText({ views: 0, taps: 2, minis: 0 }), "2 cards opened");
  assert.equal(mapUseText({ views: 1, taps: 0, minis: 0 }), "1 view");
});
