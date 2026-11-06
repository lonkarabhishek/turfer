// Run with: npm run test:session
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, derive, newMatch } from "../cricket/scoring";
import { addScored, applyChanges, battingFirstFor, current, endSession, matchTitle, nextSetup, recordFinal, recordScored, removeMatch, reopen, replaceCurrent } from "./session";
import { tally } from "./tally";
import { aSession, T0, withFinal, withScored } from "./testkit";

test("batting first alternates from the side picked for match 1", () => {
  let s = aSession({ firstBat: "b" });
  assert.equal(battingFirstFor(s), "b");
  s = withFinal(s, 50, 40, { battedFirst: "b" });
  assert.equal(battingFirstFor(s), "a");
  s = withFinal(s, 50, 40, { battedFirst: "a" });
  assert.equal(battingFirstFor(s), "b");
  assert.equal(nextSetup(s).battingFirst, "b");
});

test("match titles: the number, the plan and the lead, 48 characters at most", () => {
  const t = (a: number, b: number, tied = 0) => ({ a, b, tied, nr: 0, played: a + b + tied, leader: a > b ? ("a" as const) : b > a ? ("b" as const) : null, line: "" });
  const side = { a: "Titans", b: "Strikers" };
  assert.equal(matchTitle(1, 6, t(0, 0), side), "Match 1 of 6");
  assert.equal(matchTitle(1, null, t(0, 0), side), "Match 1");
  assert.equal(matchTitle(3, 6, t(2, 0), side), "Match 3 of 6 · Titans lead 2-0");
  assert.equal(matchTitle(2, null, t(1, 1), side), "Match 2 · All square 1-1");
  assert.equal(matchTitle(7, 6, t(4, 2), side), "Match 7 · Titans lead 4-2", "past the plan: no 'of 6'");
  assert.equal(matchTitle(2, 6, t(0, 0, 1), side), "Match 2 of 6 · All square 0-0");
  const long = { a: "The Mighty Saturday Night Titans", b: "Strikers" };
  const title = matchTitle(3, 6, t(2, 0), long);
  assert.ok(title.length <= 48, title);
  assert.equal(matchTitle(3, 6, t(2, 0), { a: "Saturday Night Titans Club", b: "B" }), "Match 3 · Saturday Night Titans Club lead 2-0");
  assert.equal(title, "Match 3 · 2-0");
  const s = withFinal(withFinal(aSession(), 60, 40), 70, 50, { battedFirst: "b" });
  assert.equal(nextSetup(s).title, "Match 3 of 6 · Titans lead 2-0");
  assert.equal(nextSetup(s).teamA, "Titans");
  assert.deepEqual(nextSetup(s).players, { a: ["Rohan", "Amit", "Sahil"], b: ["Vikas", "Sameer", "Arjun"] });
});

test("a scored match: the scorer's result, lines and balls copied in; nothing changed is the same object", () => {
  const { session: s, view } = withScored(aSession(), [4, 6, 1, 0, 2, -1], [1, 1, 1, 1, 1, 1]);
  const m = s.matches[0];
  assert.equal(view.status, "done");
  assert.equal(m.kind, "balls");
  assert.equal(m.matchId, "m1");
  assert.equal(m.balls, 12);
  assert.deepEqual(m.result?.a, { runs: 13, wickets: 1, balls: 6, allOut: false });
  assert.deepEqual(m.result?.b, { runs: 6, wickets: 0, balls: 6, allOut: false });
  assert.equal(m.result?.outcome, "a");
  assert.equal(m.result?.text, "Titans won by 7 runs");
  assert.ok(m.bat.some(([name, side, runs]) => name === "Rohan" && side === "a" && runs === 11));
  assert.ok(m.bowl.some(([name, side, w]) => name === "Vikas" && side === "b" && w === 1));
  assert.equal(recordScored(s, 1, view, T0 + 1), s, "the same view again changes nothing");
  assert.deepEqual(tally(s), { a: 1, b: 0, tied: 0, nr: 0, played: 1, leader: "a", line: "Titans 1 - 0 Strikers" });
});

test("a scored match taken back by Undo goes back to no result, and stops counting", () => {
  const { session: s, match } = withScored(aSession(), [1, 1, 1, 1, 1, 1], [4, 4]);
  assert.equal(s.matches[0].result?.outcome, "b");
  const undone = { ...match, events: match.events.slice(0, -1) };
  const s2 = recordScored(s, 1, derive(undone), T0 + 5);
  assert.equal(s2.matches[0].result, null);
  assert.equal(tally(s2).played, 0);
  assert.equal(current(s2)?.n, 1);
});

test("team names renamed in the scorer's Match settings carry over; names typed for players join the roster", () => {
  const s0 = aSession({ sides: { a: { name: "Team A", players: [] }, b: { name: "Team B", players: [] } } });
  const setup = nextSetup(s0);
  const m0 = newMatch(setup, { id: "m1", now: T0 });
  let s = addScored(s0, "m1", "a", T0);
  let m = apply(m0, { type: "changeSetup", teamA: "Titans" });
  m = apply(m, { type: "setBatter", player: "a1", name: "Rohan", end: "striker" });
  m = apply(m, { type: "setBatter", player: "a2", name: "Batter 2", end: "nonStriker" });
  m = apply(m, { type: "setBowler", player: "b1", name: "Vikas" });
  s = recordScored(s, 1, derive(m), T0);
  assert.equal(s.sides.a.name, "Titans");
  assert.equal(s.sides.b.name, "Team B");
  assert.deepEqual(s.sides.a.players, ["Rohan"], "placeholders stay out");
  assert.deepEqual(s.sides.b.players, ["Vikas"]);
  // A rename that would make the two names the same is not taken.
  const clash = apply(m, { type: "changeSetup", teamB: "titans" });
  assert.equal(recordScored(s, 1, derive(clash), T0).sides.b.name, "Team B");
});

test("a final score: replaces the empty match being played, edits a typed one, comes next otherwise", () => {
  const s0 = aSession({ playersPerSide: 6 });
  const s1 = addScored(s0, "m1", "a", T0);
  const r = recordFinal(s1, { n: null, battedFirst: "a", a: { runs: 58, wickets: 3, balls: 36 }, b: { runs: 61, wickets: 2, balls: 33 }, noResult: false }, T0);
  assert.equal(r.dropped, "m1", "the empty scorer match goes");
  assert.equal(r.n, 1);
  assert.equal(r.session.matches.length, 1);
  assert.equal(r.session.matches[0].kind, "final");
  assert.equal(r.session.matches[0].result?.text, "Strikers won by 3 wickets", "6 a side: 5 wickets, 2 down");
  const edit = recordFinal(r.session, { n: 1, battedFirst: "a", a: { runs: 58, wickets: 5, balls: 36 }, b: { runs: 40, wickets: 5, balls: 36 }, noResult: false }, T0);
  assert.equal(edit.session.matches.length, 1);
  assert.equal(edit.session.matches[0].result?.text, "Titans won by 18 runs");
  assert.equal(edit.session.matches[0].result?.a.allOut, true, "5 down of 6 a side is all out");
  assert.equal(edit.dropped, null);
  const next = recordFinal(edit.session, { n: null, battedFirst: "b", a: { runs: 30, wickets: 1, balls: 36 }, b: { runs: 30, wickets: 4, balls: 36 }, noResult: false }, T0);
  assert.equal(next.session.matches.length, 2);
  assert.equal(next.session.matches[1].result?.text, "Match tied");
  const nr = recordFinal(next.session, { n: null, battedFirst: "a", a: { runs: 10, wickets: 0, balls: 12 }, b: { runs: 0, wickets: 0, balls: 0 }, noResult: true }, T0);
  assert.equal(nr.session.matches[2].result?.outcome, "nr");
  assert.equal(tally(nr.session).line, "Titans 1 - 0 Strikers (1 tied, 1 no result)");
});

test("a scored match with balls bowled is never replaced by a typed score", () => {
  let s = addScored(aSession(), "m1", "a", T0);
  s = { ...s, matches: [{ ...s.matches[0], balls: 3 }] };
  const r = recordFinal(s, { n: 1, battedFirst: "a", a: { runs: 1, wickets: 0, balls: 6 }, b: { runs: 0, wickets: 0, balls: 6 }, noResult: false }, T0);
  assert.equal(r.session, s);
  // n null with a match in progress: the typed one comes after it.
  const after = recordFinal(s, { n: null, battedFirst: "a", a: { runs: 1, wickets: 0, balls: 6 }, b: { runs: 0, wickets: 0, balls: 6 }, noResult: false }, T0);
  assert.equal(after.session.matches.length, 2);
});

test("taking a match out renumbers the rest", () => {
  let s = withFinal(withFinal(withFinal(aSession(), 50, 40), 40, 50), 30, 20);
  const r = removeMatch(s, 2, T0);
  s = r.session;
  assert.equal(r.removed?.result?.outcome, "b");
  assert.deepEqual(s.matches.map((m) => m.n), [1, 2]);
  assert.deepEqual(tally(s).line, "Titans 2 - 0 Strikers");
  assert.equal(removeMatch(s, 9, T0).session, s);
});

test("ending drops matches not finished; reopening brings the session back", () => {
  let s = withFinal(aSession(), 50, 40);
  s = addScored(s, "m2", "b", T0);
  assert.equal(current(s)?.n, 2);
  const e = endSession(s, T0 + 60_000);
  assert.equal(e.session.ended, T0 + 60_000);
  assert.deepEqual(e.dropped.map((m) => m.matchId), ["m2"]);
  assert.equal(e.session.matches.length, 1);
  assert.equal(current(e.session), null);
  const back = reopen(e.session, T0 + 120_000);
  assert.equal(back.ended, null);
  assert.equal(addScored(back, "m3", "b", T0).matches[1].n, 2);
});

test("changes apply from the next match; an empty match being played can be made again", () => {
  let s = addScored(aSession(), "m1", "a", T0);
  s = applyChanges(s, { overs: 8, sides: { a: { name: "Lions", players: ["Rohan"] }, b: s.sides.b } }, T0);
  assert.equal(s.overs, 8);
  assert.equal(s.matches[0].overs, 1, "the match already made keeps its overs");
  const r = replaceCurrent(s, "m1b", "b", T0);
  assert.equal(r.dropped, "m1");
  assert.equal(r.session.matches[0].matchId, "m1b");
  assert.equal(r.session.matches[0].battedFirst, "b");
  assert.equal(r.session.matches[0].overs, 8);
  assert.equal(nextSetup(r.session, { n: 1, battingFirst: "b" }).title, "Match 1 of 6");
  assert.equal(nextSetup(r.session, { n: 1, battingFirst: "b" }).teamA, "Lions");
});
