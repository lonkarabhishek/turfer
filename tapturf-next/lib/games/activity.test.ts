import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIVITY_SHOWN, activityLog, activityView, activityWhen } from "./activity";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HOST = ID(1), RAVI = ID(2), PRIYA = ID(3);
const NOW = Date.parse("2026-11-17T10:10:00Z");
const texts = (i: Parameters<typeof activityLog>[0]) => activityLog(i).map((e) => e.text);

const GAME = {
  id: ID(100),
  creator_id: HOST,
  created_at: "2026-11-15T04:00:00Z",
  updates: [{ id: ID(50), at: "2026-11-16T09:00:00Z", text: "Turf booked, please bring bottles and a dark tee, we start on time so come ten minutes early" }],
  activity: [
    { at: "2026-11-15T04:00:00Z", k: "confirmed", n: 2 },
    { at: "2026-11-15T04:00:00.400Z", k: "confirmed", n: 1 },
    { at: "2026-11-15T06:00:00Z", k: "time", fd: "2026-11-21", fs: "19:00", fe: "20:00", td: "2026-11-22", ts: "20:00", te: "21:00" },
    { at: "2026-11-15T07:00:00Z", k: "venue", from: "Kings Turf - Book on Playo", to: "Dribble Den" },
    { at: "2026-11-15T08:00:00Z", k: "spots", from: 10, to: 12 },
    { at: "2026-11-15T09:00:00Z", k: "booked" },
    { at: "2026-11-16T12:00:00Z", k: "confirmed", n: 1 },
    { at: "2026-11-17T08:00:00Z", k: "full" },
    { at: "2026-11-17T09:00:00Z", k: "cancelled" },
  ],
};
const LINEUP = [
  { user_id: HOST, joined_at: "2026-11-15T04:00:00Z", name: "Asha Rao" },
  { user_id: RAVI, joined_at: "2026-11-16T05:00:00Z", name: "Ravi Kumar" },
  { user_id: PRIYA, joined_at: "2026-11-17T07:30:00Z", name: "Priya Sharma" },
];

test("activity: derived and stored entries, merged, newest first", () => {
  const log = activityLog({ game: GAME, hostFirst: "Asha", participants: LINEUP, clean: (s) => s.replace(/ - Book on Playo$/, "") });
  assert.deepEqual(log.map((e) => e.text), [
    "Asha called the game off",
    "Game filled up",
    "Priya Sharma joined",
    "+1 confirmed with Asha",
    "Asha posted an update: “Turf booked, please bring bottles and a dark tee, we start…”",
    "Ravi Kumar joined",
    "Asha said the turf is booked",
    "Spots changed: 10 → 12",
    "Venue changed: Kings Turf → Dribble Den",
    "Day changed: Sat 21 Nov, 7 PM → Sun 22 Nov, 8 PM",
    "+3 confirmed with Asha",
    "Asha posted the game",
  ]);
  assert.deepEqual(log.map((e) => e.kind), ["cancelled", "full", "joined", "confirmed", "update", "joined", "booked", "spots", "venue", "time", "confirmed", "posted"]);
  assert.ok(log.every((e, i) => i === 0 || e.at <= log[i - 1].at), "newest first");
  assert.equal(new Set(log.map((e) => e.key)).size, log.length, "each with its own key");
  assert.deepEqual(activityWhen(log[2], NOW), { ago: "2 h ago", stamp: "Tue 17 Nov, 1 PM", iso: "2026-11-17T07:30:00.000Z" });
  assert.equal(activityWhen(log.at(-1)!, NOW).stamp, "Sun 15 Nov, 9:30 AM");
});

test("activity: a brand-new game has one entry; a game from before the log shows what can be worked out", () => {
  assert.deepEqual(texts({ game: { creator_id: HOST, created_at: "2026-11-17T10:00:00Z", activity: [], updates: [] }, hostFirst: "Asha", participants: [LINEUP[0]] }), ["Asha posted the game"]);
  assert.deepEqual(texts({ game: { creator_id: HOST, created_at: "2026-11-15T04:00:00Z" }, hostFirst: "the host", participants: LINEUP }),
    ["Priya Sharma joined", "Ravi Kumar joined", "The host posted the game"], "no column: posted and the joins, nothing made up");
  assert.deepEqual(texts({ game: { creator_id: HOST }, hostFirst: "Asha", participants: [] }), [], "no created_at: nothing");
  assert.deepEqual(texts({ game: { creator_id: HOST, created_at: "2026-11-15T04:00:00Z", status: "cancelled" } as never, hostFirst: "Asha", participants: [] }), ["Asha posted the game"],
    "a game called off before the log has no time for it: not said");
});

test("activity: nothing private, nobody named but the lineup", () => {
  const sneaky = {
    creator_id: HOST,
    created_at: "2026-11-15T04:00:00Z",
    activity: [
      { at: "2026-11-15T05:00:00Z", k: "confirmed", n: 2, names: ["Rahul", "Amit"], who: "Neha Joshi" },
      { at: "2026-11-15T05:10:00Z", k: "request", name: "Kiran Patil", note: "Can play in goal" },
      { at: "2026-11-15T05:20:00Z", k: "declined", name: "Kiran Patil" },
      { at: "2026-11-15T05:30:00Z", k: "left", name: "Omar Shaikh" },
      { at: "2026-11-15T05:40:00Z", k: "booked", phone: "+919800000001" },
      { at: "2026-11-15T05:50:00Z", k: "confirmed", n: "3" },
      { at: "nope", k: "full" },
      { k: "full" },
      null,
      "x",
    ],
  };
  const log = activityLog({ game: sneaky, hostFirst: "Asha", participants: [{ user_id: RAVI, joined_at: "2026-11-16T05:00:00Z", name: "Ravi Kumar" }, { user_id: PRIYA, joined_at: null, name: "Priya Sharma" }, { user_id: RAVI, joined_at: "2026-11-16T06:00:00Z", name: "Ravi Kumar" }] });
  assert.deepEqual(log.map((e) => e.text), ["Ravi Kumar joined", "Asha said the turf is booked", "+2 confirmed with Asha", "Asha posted the game"],
    "a kind this code doesn't know is left out; confirmed people are a number; a player is listed once, and only with a time");
  assert.ok(!/Rahul|Amit|Neha|Kiran|Omar|goal|98000/.test(JSON.stringify(log)), "no typed name, tagged player, request, note or number");
  assert.deepEqual(texts({ game: { creator_id: HOST, created_at: "2026-11-15T04:00:00Z" }, hostFirst: "Asha", participants: [{ user_id: RAVI, joined_at: "2026-11-16T05:00:00Z" }] })[0], "A player joined", "a lineup row without a name");
  assert.deepEqual(texts({ game: { creator_id: HOST, created_at: "2026-11-15T04:00:00Z", activity: [{ at: "2026-11-15T05:00:00Z", k: "confirmed", n: 4 }] }, hostFirst: "the host", participants: [] })[0], "+4 confirmed with the host");
});

test("activity: the words of a change", () => {
  const one = (e: Record<string, unknown>) => texts({ game: { creator_id: HOST, activity: [{ at: "2026-11-15T05:00:00Z", ...e }] }, hostFirst: "Asha", participants: [] });
  assert.deepEqual(one({ k: "time", fd: "2026-11-21", fs: "19:00", fe: "20:00", td: "2026-11-21", ts: "20:30", te: "21:30" }), ["Time changed: Sat 21 Nov, 7 PM → Sat 21 Nov, 8:30 PM"]);
  assert.deepEqual(one({ k: "time", fd: "2026-11-21", fs: "19:00", fe: "20:00", td: "2026-11-21", ts: "19:00", te: "21:00" }), ["End time changed: 8 PM → 9 PM"]);
  assert.deepEqual(one({ k: "time", fd: "2026-11-21", fs: "19:00", fe: "20:00", td: "2026-11-21", ts: "19:00", te: "20:00" }), [], "nothing changed: nothing said");
  assert.deepEqual(one({ k: "time", fd: "x", fs: "y", td: "z", ts: "w" }), []);
  assert.deepEqual(one({ k: "spots", from: 10, to: 10 }), []);
  assert.deepEqual(one({ k: "spots", from: "10", to: 12 }), []);
  assert.deepEqual(one({ k: "venue", from: "A".repeat(200), to: "B" }), [`Venue changed: ${"A".repeat(80)} → B`], "a long name is cut");
  assert.deepEqual(one({ k: "venue", from: "", to: "B" }), []);
  assert.deepEqual(one({ k: "confirmed", n: 0 }), []);
});

test("activity: the five newest, then Show all", () => {
  const log = activityLog({ game: GAME, hostFirst: "Asha", participants: LINEUP });
  assert.equal(ACTIVITY_SHOWN, 5);
  assert.deepEqual([activityView(log, false).shown.length, activityView(log, false).more], [5, 7]);
  assert.deepEqual([activityView(log, true).shown.length, activityView(log, true).more], [12, 0]);
  assert.deepEqual(activityView(log.slice(0, 5), false), { shown: log.slice(0, 5), more: 0 }, "five or fewer: no button");
  assert.deepEqual(activityView(log, false).shown[0].text, "Asha called the game off");
});
