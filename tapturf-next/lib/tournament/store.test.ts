// Run with: npm run test:tournament
import { test } from "node:test";
import assert from "node:assert/strict";
import { HANDOFF_FOR_MS, STORE_MAX, keep, readHandoff, readScoreAsk, readStore, takeHandoff, type ScoreHandoff } from "./store";

const S = "cd".repeat(32);

test("the organiser's record: malformed entries left out, never thrown", () => {
  assert.deepEqual(readStore(null), { v: 1, list: {} });
  assert.deepEqual(readStore("{"), { v: 1, list: {} });
  const raw = JSON.stringify({ v: 1, list: { abcdefghijkl: { secret: S, name: "League", at: 5, acct: "u1" }, BAD: { secret: S }, abcdefghijkm: { secret: "short" } } });
  assert.deepEqual(readStore(raw), { v: 1, list: { abcdefghijkl: { secret: S, name: "League", at: 5, acct: "u1" } } });
});

test("kept newest first, at most STORE_MAX", () => {
  let s = readStore(null);
  for (let i = 0; i < STORE_MAX + 5; i++) s = keep(s, `code${String(i).padStart(8, "0")}`, { secret: S, name: `T${i}`, at: i });
  const codes = Object.keys(s.list);
  assert.equal(codes.length, STORE_MAX);
  assert.ok(!codes.includes("code00000000"), "the oldest went");
  assert.ok(codes.includes(`code${String(STORE_MAX + 4).padStart(8, "0")}`));
});

const h: ScoreHandoff = { code: "abcdefghijkl", fixture: 3, title: "League · Match 3", teamA: "Titans", teamB: "Strikers", overs: 6, venue: "", home: null, away: null, at: 1_000 };

test("the score hand-off: taken once, for its fixture, while fresh", () => {
  const back = readHandoff(JSON.stringify(h))!;
  assert.deepEqual(back, h);
  assert.equal(takeHandoff(back, "abcdefghijkl", 3, 2_000), back);
  assert.equal(takeHandoff(back, "abcdefghijkl", 4, 2_000), null, "another fixture");
  assert.equal(takeHandoff(back, "zzzzzzzzzzzz", 3, 2_000), null, "another tournament");
  assert.equal(takeHandoff(back, "abcdefghijkl", 3, 1_000 + HANDOFF_FOR_MS), null, "too old");
  assert.equal(takeHandoff({ ...back, matchId: "m1" }, "abcdefghijkl", 3, 2_000), null, "already has its match");
  assert.equal(readHandoff(JSON.stringify({ ...h, teamA: "" })), null);
  assert.equal(readHandoff(JSON.stringify({ ...h, overs: 500 }))!.overs, 6);
  assert.equal(readHandoff(JSON.stringify({ ...h, linked: "abcdefghijkl", matchId: "m1" }))!.linked, "abcdefghijkl");
});

test("the scorer's query: read once and taken out", () => {
  assert.deepEqual(readScoreAsk("?tournament=abcdefghijkl&fixture=3&live=1"), { code: "abcdefghijkl", fixture: 3, rest: "?live=1" });
  assert.deepEqual(readScoreAsk("?tournament=BAD&fixture=x"), { code: null, fixture: null, rest: "" });
  assert.deepEqual(readScoreAsk(""), { code: null, fixture: null, rest: "" });
});
