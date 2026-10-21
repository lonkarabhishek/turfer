// Run with: npm run test:board (compiles lib/board to .test-out/board and runs node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { badmintonEngine, rotatingServer, tableTennisEngine, volleyballEngine } from "./rally";
import type { Board, BoardEvent, RallyRules, Side, SportEngine } from "./types";

type Engine = SportEngine<RallyRules>;

function board(engine: Engine, rules: Partial<RallyRules> = {}): Board {
  return { v: 1, kind: "board", id: "t", createdAt: 0, sport: engine.sport, setup: { teamA: "Asha", teamB: "Ravi", title: "", venue: "", rules: engine.normalizeRules(rules) }, events: [] };
}

/** Add events, failing the test on any refused one. */
function add(engine: Engine, b: Board, ...events: BoardEvent[]): Board {
  for (const e of events) {
    const why = engine.check(b, e);
    assert.equal(why, null, `${JSON.stringify(e)} refused: ${why}`);
    b = { ...b, events: [...b.events, e] };
  }
  return b;
}

const serve = (side: Side): BoardEvent => ({ type: "serve", side });
/** Rallies from a string of winners: "aab" is a, a, b. */
const rallies = (s: string): BoardEvent[] => [...s].map((c) => ({ type: "point", side: c as Side }));
/** Rallies that reach a-b from 0-0 with the trailing side's points paired first, so nobody wins early. */
const game = (a: number, b: number) => rallies("ab".repeat(Math.min(a, b)) + (a > b ? "a" : "b").repeat(Math.abs(a - b)));

test("defaults per sport and normalizeRules", () => {
  assert.deepEqual(badmintonEngine.defaults, { points: 21, winBy: 2, cap: 30, bestOf: 3, decidingPoints: null, serve: "winner", nextGame: "winner", decidingToss: false, doubles: false });
  assert.deepEqual(volleyballEngine.defaults, { points: 25, winBy: 2, cap: null, bestOf: 3, decidingPoints: 15, serve: "winner", nextGame: "alternate", decidingToss: true, doubles: false });
  assert.deepEqual(tableTennisEngine.defaults, { points: 11, winBy: 2, cap: null, bestOf: 5, decidingPoints: null, serve: 2, nextGame: "alternate", decidingToss: false, doubles: false });
  for (const raw of [null, undefined, "x", 3, [1, 2], {}]) assert.deepEqual(badmintonEngine.normalizeRules(raw), badmintonEngine.defaults);
  const n = badmintonEngine.normalizeRules;
  assert.equal(n({ points: 15, cap: 21 }).cap, 21);
  assert.equal(n({ points: 25, cap: 21 }).cap, null, "a cap at or under the target goes");
  assert.equal(n({ points: 21, cap: 21 }).cap, null);
  assert.equal(n({ cap: null }).cap, null);
  assert.equal(n({ bestOf: 2 }).bestOf, 3);
  assert.equal(n({ bestOf: 5 }).bestOf, 5);
  assert.equal(n({ points: "21" }).points, 21);
  assert.equal(n({ points: 1000 }).points, 99);
  assert.equal(n({ winBy: 5 }).winBy, 2);
  assert.equal(n({ serve: 2 }).serve, 2);
  assert.equal(n({ serve: "x" }).serve, "winner");
  assert.equal(n({ nextGame: "loser" }).nextGame, "winner");
  assert.equal(n({ decidingPoints: 15 }).decidingPoints, 15);
  assert.equal("foo" in n({ foo: 1 }), false);
  const fifteen = badmintonEngine.presets.flatMap((p) => p.options).find((o) => o.label === "15 (cap 21), new BWF format");
  assert.deepEqual(fifteen?.rules, { points: 15, winBy: 2, cap: 21 });
  assert.deepEqual(tableTennisEngine.presets[0].options.map((o) => o.label), ["Best of 3", "Best of 5", "Best of 7"]);
  assert.ok(volleyballEngine.presets[0].options.some((o) => o.label === "Best of 5" && o.rules.bestOf === 5));
  assert.equal(badmintonEngine.icon, "🏸");
  assert.equal(tableTennisEngine.label, "Table Tennis");
});

test("points wait for the first serve", () => {
  const b = board(badmintonEngine);
  const v = badmintonEngine.derive(b);
  assert.equal(v.needsServe, true);
  assert.equal(v.server, null);
  assert.equal(v.status, "live");
  assert.equal(v.headline, "Asha vs Ravi");
  assert.equal(v.scoreUnit, "Games");
  assert.deepEqual(v.current, { a: "0", b: "0" });
  assert.equal(v.currentLabel, "Game 1");
  assert.deepEqual(v.sets, [{ a: 0, b: 0, winner: null, tiebreak: null }]);
  assert.deepEqual(v.stats, []);
  assert.equal(badmintonEngine.check(b, rallies("a")[0]), "Pick who serves first");
  const pad = badmintonEngine.pad(b, v);
  assert.deepEqual(pad.map((p) => p.id), ["serve-a", "serve-b", "walkover-a", "walkover-b", "end", "abandon"]);
  assert.deepEqual(pad[0], { id: "serve-a", side: "a", label: "Asha serves first", tone: "primary", event: { type: "serve", side: "a" } });

  const s = add(badmintonEngine, b, serve("a"));
  const v2 = badmintonEngine.derive(s);
  assert.equal(v2.needsServe, false);
  assert.equal(v2.server, "a");
  assert.equal(v2.serveNote, "Right court");
  assert.equal(v2.lastAction, "Asha serves");
  assert.deepEqual(v2.timeline, [{ key: 0, side: "a", text: "Asha serves first", when: null, period: 0, tone: "info", score: "0-0" }]);
});

test("badminton: winner serves, serve court from the server's score, 2 clear, 30th point wins at 29-all", () => {
  const e = badmintonEngine;
  let b = add(e, board(e), serve("a"), ...rallies("a"));
  let v = e.derive(b);
  assert.equal(v.server, "a");
  assert.equal(v.serveNote, "Left court", "1 is odd: left court (Law 10.1)");
  b = add(e, b, ...rallies("b"));
  v = e.derive(b);
  assert.equal(v.server, "b", "the rally winner serves");
  assert.equal(v.serveNote, "Left court");
  b = add(e, b, ...rallies("b"));
  assert.equal(e.derive(b).serveNote, "Right court");

  const at20 = add(e, board(e), serve("a"), ...game(20, 20));
  assert.deepEqual(e.derive(at20).current, { a: "20", b: "20" });
  const at21 = add(e, at20, ...rallies("a"));
  assert.equal(e.derive(at21).sets.length, 1, "21-20 is not a win");
  const done = add(e, at21, ...rallies("a"));
  v = e.derive(done);
  assert.deepEqual(v.sets[0], { a: 22, b: 20, winner: "a", tiebreak: null });
  assert.equal(v.teams.a.score, 1);

  const capped = add(e, board(e), serve("a"), ...game(29, 29), ...rallies("b"));
  v = e.derive(capped);
  assert.deepEqual(v.sets[0], { a: 29, b: 30, winner: "b", tiebreak: null });
  assert.deepEqual(v.gameJustEnded, { label: "Game 1 to Ravi, 30-29", changeEnds: true });
});

test("badminton: interval at 11 in every game, change of ends at 11 in the deciding game only", () => {
  const e = badmintonEngine;
  let b = add(e, board(e), serve("b"), ...game(10, 10), ...rallies("a"));
  let v = e.derive(b);
  assert.deepEqual(v.notices, ["Interval"]);
  assert.equal(v.changeEnds, false, "no change of ends at 11 in game 1");
  b = add(e, b, ...rallies("b"));
  assert.deepEqual(e.derive(b).notices, [], "shown until the next point");
  // 11-11 to 21-17 for Asha.
  b = add(e, b, ...rallies("ab".repeat(6) + "aaaa"));
  v = e.derive(b);
  assert.deepEqual(v.sets[0], { a: 21, b: 17, winner: "a", tiebreak: null });
  assert.deepEqual(v.gameJustEnded, { label: "Game 1 to Asha, 21-17", changeEnds: true });
  assert.ok(v.notices.includes("Change ends"));
  assert.equal(v.server, "a", "Law 7.6: the game's winner serves first in the next");
  assert.equal(v.currentLabel, "Game 2");
  assert.equal(v.headline, "Asha leads Ravi 1-0 (21-17)");

  b = add(e, b, ...game(15, 21));
  v = e.derive(b);
  assert.equal(v.server, "b");
  assert.equal(v.headline, "Asha 1-1 Ravi (21-17, 15-21)");
  assert.equal(v.currentLabel, "Game 3");
  b = add(e, b, ...game(10, 10), ...rallies("b"));
  v = e.derive(b);
  assert.deepEqual(v.notices, ["Change ends", "Interval"]);
  assert.equal(v.changeEnds, true);
  b = add(e, b, ...rallies("a"));
  v = e.derive(b);
  assert.equal(v.changeEnds, false);
  assert.deepEqual(v.notices, []);
});

test("badminton 15-point games: interval at 8, 2 clear from 14-all, the 21st point wins at 20-all", () => {
  const e = badmintonEngine;
  const r = { points: 15, cap: 21 };
  let b = add(e, board(e, r), serve("a"), ...game(7, 7), ...rallies("a"));
  assert.deepEqual(e.derive(b).notices, ["Interval"]);
  b = add(e, board(e, r), serve("a"), ...game(14, 14), ...rallies("a"));
  assert.equal(e.derive(b).sets.length, 1, "15-14 is not a win");
  b = add(e, b, ...rallies("a"));
  assert.deepEqual(e.derive(b).sets[0], { a: 16, b: 14, winner: "a", tiebreak: null });
  b = add(e, board(e, r), serve("a"), ...game(20, 20), ...rallies("b"));
  assert.deepEqual(e.derive(b).sets[0], { a: 20, b: 21, winner: "b", tiebreak: null });
});

test("game point, match point, the match result and points after it", () => {
  const e = badmintonEngine;
  let b = add(e, board(e), serve("a"), ...game(17, 17), ...rallies("aaa"));
  assert.deepEqual(e.derive(b).notices, ["Game point Asha"]);
  b = add(e, b, ...rallies("a"), ...game(8, 6));
  let v = e.derive(b);
  assert.equal(v.headline, "Asha leads Ravi 1-0 (21-17, 8-6)");
  assert.deepEqual(v.current, { a: "8", b: "6" });
  assert.equal(v.gameJustEnded, null, "the next point clears it");
  // 8-6 to 20-15.
  b = add(e, b, ...rallies("ab".repeat(9) + "aaa"));
  v = e.derive(b);
  assert.deepEqual(v.current, { a: "20", b: "15" });
  assert.deepEqual(v.notices, ["Match point Asha"]);
  const pad = e.pad(b, v);
  assert.equal(pad.find((p) => p.id === "point-a")?.sub, "Wins the match");
  assert.equal(pad.find((p) => p.id === "point-b")?.sub, "Point");

  b = add(e, b, ...rallies("a"));
  v = e.derive(b);
  assert.equal(v.status, "done");
  assert.deepEqual(v.result, { winner: "a", kind: "win", text: "Asha won 2-0 (21-17, 21-15)" });
  assert.equal(v.headline, "Asha beat Ravi 2-0 (21-17, 21-15)");
  assert.deepEqual(v.sets.map((s) => [s.a, s.b, s.winner]), [[21, 17, "a"], [21, 15, "a"]]);
  assert.deepEqual(v.notices, []);
  assert.equal(v.gameJustEnded, null);
  assert.equal(v.server, null);
  assert.equal(v.current, null);
  assert.equal(v.currentLabel, null);
  assert.deepEqual(e.pad(b, v), []);
  assert.equal(v.lastAction, "Match to Asha");
  const last = v.timeline[v.timeline.length - 1];
  assert.equal(last.text, "Game 2 and the match to Asha, 21-15");
  assert.equal(last.tone, "end");
  assert.equal(last.key, b.events.length - 1);
  assert.equal(e.check(b, rallies("b")[0]), "The match is over. Undo to change the last point");
  assert.equal(e.check(b, serve("b")), "The match is over. Undo to change the last point");
  assert.equal(e.check(b, { type: "rename", side: "a", name: "Asha K" }), null, "names can still be fixed");
});

test("at 29-all both sides are at game point", () => {
  const e = badmintonEngine;
  const b = add(e, board(e), serve("a"), ...game(29, 29));
  assert.deepEqual(e.derive(b).notices, ["Game point Asha", "Game point Ravi"]);
});

test("best of 1: one game, no deciding-game rules, the score is points", () => {
  const e = badmintonEngine;
  let b = add(e, board(e, { bestOf: 1 }), serve("a"), ...game(10, 10), ...rallies("a"));
  let v = e.derive(b);
  assert.deepEqual(v.notices, ["Interval"]);
  assert.equal(v.changeEnds, false);
  assert.equal(v.scoreUnit, "Points");
  assert.equal(v.teams.a.score, 11);
  assert.equal(v.teams.b.score, 10);
  assert.equal(v.current, null);
  assert.equal(v.currentLabel, null);
  assert.equal(v.headline, "Asha leads Ravi 11-10");
  // 11-10 to 21-17.
  b = add(e, b, ...rallies("ab".repeat(7) + "aaa"));
  v = e.derive(b);
  assert.deepEqual(v.result, { winner: "a", kind: "win", text: "Asha won 21-17" });
  assert.equal(v.headline, "Asha beat Ravi 21-17");
});

test("volleyball: next set served by the side that received first, new toss and 15 points for the deciding set", () => {
  const e = volleyballEngine;
  let b = add(e, board(e), serve("a"), ...game(20, 20), ...rallies("aaaa"));
  assert.deepEqual(e.derive(b).notices, ["Set point Asha"]);
  b = add(e, b, ...rallies("a"));
  let v = e.derive(b);
  assert.deepEqual(v.gameJustEnded, { label: "Set 1 to Asha, 25-20", changeEnds: true });
  assert.equal(v.server, "b", "FIVB 12.1.2: Asha served first in set 1, so Ravi serves set 2 though Asha won the last rally");
  assert.equal(v.scoreUnit, "Sets");
  assert.equal(v.currentLabel, "Set 2");

  b = add(e, b, ...game(24, 24));
  assert.equal(e.derive(b).sets.length, 2, "24-24 plays on");
  b = add(e, b, ...rallies("bb"));
  v = e.derive(b);
  assert.deepEqual(v.gameJustEnded, { label: "Set 2 to Ravi, 26-24", changeEnds: false });
  assert.equal(v.needsServe, true, "FIVB 12.1.1: a new toss for the deciding set");
  assert.equal(v.server, null);
  assert.deepEqual(v.notices, ["New toss for the deciding set"]);
  assert.equal(v.currentLabel, "Set 3, to 15");
  assert.equal(e.check(b, rallies("a")[0]), "Pick who serves first");
  assert.deepEqual(e.pad(b, v).slice(0, 2).map((p) => p.id), ["serve-a", "serve-b"]);

  b = add(e, b, serve("b"));
  v = e.derive(b);
  assert.equal(v.gameJustEnded, null, "picking the server gets on with the set");
  assert.equal(v.server, "b");
  b = add(e, b, ...game(7, 7), ...rallies("a"));
  v = e.derive(b);
  assert.deepEqual(v.notices, ["Change ends"], "FIVB 18.2.2: at 8 in the deciding set");
  assert.equal(v.changeEnds, true);
  // 8-7 to 14-14, then 16-14.
  b = add(e, b, ...rallies("b" + "ab".repeat(6)));
  assert.equal(e.derive(b).status, "live");
  b = add(e, b, ...rallies("a"));
  assert.equal(e.derive(b).status, "live", "15-14 is not a win");
  b = add(e, b, ...rallies("a"));
  v = e.derive(b);
  assert.deepEqual(v.result, { winner: "a", kind: "win", text: "Asha won 2-1 (25-20, 24-26, 16-14)" });
});

test("volleyball best of 1: the one set is to 25 with no toss or switch at 8", () => {
  const e = volleyballEngine;
  let b = add(e, board(e, { bestOf: 1 }), serve("a"), ...game(7, 7), ...rallies("a"));
  assert.deepEqual(e.derive(b).notices, []);
  b = add(e, b, ...rallies("ab".repeat(5) + "aa"));
  assert.equal(e.derive(b).status, "live", "15-12 does not end a 25-point set");
  b = add(e, board(e, { bestOf: 1 }), serve("a"), ...game(25, 23));
  assert.deepEqual(e.derive(b).result, { winner: "a", kind: "win", text: "Asha won 25-23" });
});

test("volleyball timeouts: two a set for each team", () => {
  const e = volleyballEngine;
  const to: BoardEvent = { type: "timeout", side: "a" };
  let b = add(e, board(e), serve("a"), to, to);
  assert.equal(e.check(b, to), "Asha has used both timeouts this set");
  const pad = e.pad(b, e.derive(b));
  assert.equal(pad.find((p) => p.id === "timeout-a")?.disabled, "No timeouts left");
  assert.equal(pad.find((p) => p.id === "timeout-b")?.sub, "2 left");
  assert.equal(e.check(b, { type: "timeout", side: "b" }), null);
  b = add(e, b, ...game(25, 20));
  assert.equal(e.check(b, to), null, "a new set, new timeouts");
  b = add(e, b, to);
  const v = e.derive(b);
  assert.deepEqual(v.stats.find((s) => s.label === "Timeouts"), { label: "Timeouts", a: "3", b: "0" });
  assert.equal(v.timeline[v.timeline.length - 1].text, "Timeout, Asha");
  assert.equal(badmintonEngine.check(add(badmintonEngine, board(badmintonEngine), serve("a")), to), "Badminton has no timeouts");
});

test("table tennis: serve every 2 points, every point from 10-10", () => {
  assert.deepEqual(
    [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [10, 10], [11, 10], [11, 11], [12, 11]].map(([a, b]) => rotatingServer("a", a, b, 2, 11)),
    ["a", "a", "b", "b", "a", "a", "b", "a", "b"],
  );
  const e = tableTennisEngine;
  let b = add(e, board(e), serve("a"));
  const servers: (Side | null)[] = [e.derive(b).server];
  for (const p of rallies("abba")) {
    b = add(e, b, p);
    servers.push(e.derive(b).server);
  }
  assert.deepEqual(servers, ["a", "a", "b", "b", "a"], "the winner of the rally does not take the serve");
  assert.equal(e.derive(b).serveNote, null);

  b = add(e, board(e), serve("a"), ...game(10, 10));
  let v = e.derive(b);
  assert.equal(v.server, "a");
  assert.deepEqual(v.notices, ["Deuce, one serve each"]);
  b = add(e, b, ...rallies("a"));
  v = e.derive(b);
  assert.equal(v.server, "b");
  assert.deepEqual(v.notices, ["Game point Asha"]);
  b = add(e, b, ...rallies("b"));
  assert.equal(e.derive(b).server, "a");
  b = add(e, b, ...rallies("aa"));
  v = e.derive(b);
  assert.deepEqual(v.gameJustEnded, { label: "Game 1 to Asha, 13-11", changeEnds: true });
  assert.equal(v.server, "b", "ITTF 2.13.6: Ravi received first in game 1, so serves first in game 2");
});

test("table tennis: a serve correction flips the game's first server, and the next game follows it", () => {
  const e = tableTennisEngine;
  let b = add(e, board(e), serve("a"), ...rallies("ab"));
  assert.equal(e.derive(b).server, "b");
  assert.equal(e.check(b, serve("b")), "Ravi is serving already");
  b = add(e, b, serve("a"));
  let v = e.derive(b);
  assert.equal(v.server, "a");
  assert.equal(v.timeline[v.timeline.length - 1].text, "Asha to serve");
  // Ravi now counts as the game's first server: 1-1 and 2-1 are Asha's pair, 2-2 is Ravi's.
  b = add(e, b, ...rallies("a"));
  assert.equal(e.derive(b).server, "a");
  b = add(e, b, ...rallies("b"));
  assert.equal(e.derive(b).server, "b");
  // 2-2 to 11-2 for Asha: the next game's first server is the one who received first, Asha.
  b = add(e, b, ...rallies("a".repeat(9)));
  v = e.derive(b);
  assert.equal(v.sets[0].winner, "a");
  assert.equal(v.server, "a");
});

test("table tennis deciding game: change ends at 5, doubles receivers swap order", () => {
  const e = tableTennisEngine;
  let b = add(e, board(e, { bestOf: 3, doubles: true }), serve("a"), ...game(4, 4), ...rallies("a"));
  assert.deepEqual(e.derive(b).notices, [], "not in game 1");
  b = add(e, b, ...rallies("a".repeat(6)), ...game(0, 11), ...game(4, 4), ...rallies("b"));
  const v = e.derive(b);
  assert.equal(v.currentLabel, "Game 3");
  assert.deepEqual(v.notices, ["Change ends", "Receivers swap order"]);
  assert.equal(v.changeEnds, true);
  const single = add(e, board(e, { bestOf: 3 }), serve("a"), ...game(11, 0), ...game(0, 11), ...game(4, 4), ...rallies("b"));
  assert.deepEqual(e.derive(single).notices, ["Change ends"]);
  const five = add(e, board(e), serve("a"), ...game(11, 0), ...game(0, 11), ...game(4, 4), ...rallies("b"));
  assert.deepEqual(e.derive(five).notices, [], "game 3 of best of 5 is not the last possible game");
});

test("table tennis: one timeout a match", () => {
  const e = tableTennisEngine;
  const to: BoardEvent = { type: "timeout", side: "a" };
  let b = add(e, board(e), serve("a"), to);
  assert.equal(e.check(b, to), "Asha has used the timeout for the match");
  b = add(e, b, ...game(11, 3));
  assert.equal(e.check(b, to), "Asha has used the timeout for the match");
});

test("end of match: retired, walkover, conceded, time up, abandoned", () => {
  const e = badmintonEngine;
  const played = add(e, board(e), serve("a"), ...game(21, 15), ...game(12, 8));
  let b = add(e, played, { type: "end", reason: "retired", side: "a" });
  let v = e.derive(b);
  assert.equal(v.status, "done");
  assert.deepEqual(v.result, { winner: "b", kind: "win", text: "Ravi won, Asha retired (15-21, 8-12)" });
  assert.equal(v.headline, "Ravi won, Asha retired (15-21, 8-12)");
  assert.deepEqual(v.sets.map((s) => [s.a, s.b, s.winner]), [[21, 15, "a"], [12, 8, null]]);
  assert.deepEqual(e.pad(b, v), []);
  assert.equal(v.lastAction, "Asha retired");
  assert.equal(v.timeline[v.timeline.length - 1].tone, "end");
  assert.equal(e.check(b, rallies("a")[0]), "The match has ended. Undo to carry on");
  assert.equal(e.check(b, { type: "end" }), "The match has ended. Undo to carry on");

  b = add(e, board(e), { type: "end", reason: "walkover", side: "a" });
  v = e.derive(b);
  assert.deepEqual(v.result, { winner: "b", kind: "win", text: "Ravi won by walkover" });
  assert.equal(v.headline, "Ravi beat Asha by walkover");
  assert.deepEqual(v.sets, []);
  assert.equal(v.needsServe, false);
  assert.equal(e.check(played, { type: "end", reason: "walkover", side: "a" }), "Points have been played, so it is not a walkover. Pick retired or conceded");
  assert.equal(e.check(played, { type: "end", reason: "retired" }), "Pick who retired");
  assert.equal(e.check(played, { type: "end", reason: "rain" } as unknown as BoardEvent), "Unknown way to end the match");

  v = e.derive(add(e, played, { type: "end", reason: "conceded", side: "b" }));
  assert.deepEqual(v.result, { winner: "a", kind: "win", text: "Asha won, Ravi conceded (21-15, 12-8)" });

  // Time up: games first, then points in the unfinished game, else drawn.
  v = e.derive(add(e, board(e), serve("a"), ...game(21, 17), ...game(6, 10), { type: "end" }));
  assert.deepEqual(v.result, { winner: "a", kind: "win", text: "Asha won, time up (21-17, 6-10)" });
  assert.equal(v.headline, "Asha beat Ravi, time up (21-17, 6-10)");
  assert.equal(v.lastAction, "Match ended, time up");
  v = e.derive(add(e, board(e), serve("a"), ...game(6, 8), { type: "end" }));
  assert.deepEqual(v.result, { winner: "b", kind: "win", text: "Ravi won, time up (8-6)" });
  v = e.derive(add(e, board(e), serve("a"), ...game(21, 17), ...game(15, 21), ...game(5, 5), { type: "end" }));
  assert.deepEqual(v.result, { winner: null, kind: "draw", text: "Drawn, time up (21-17, 15-21, 5-5)" });
  assert.equal(v.headline, "Asha and Ravi drew, time up (21-17, 15-21, 5-5)");
  v = e.derive(add(e, board(e), serve("a"), ...game(21, 17), { type: "end" }));
  assert.equal(v.result?.text, "Asha won, time up (21-17)", "the 0-0 game in waiting is left out");
  assert.equal(v.sets.length, 1);

  v = e.derive(add(e, board(e), serve("a"), ...game(21, 17), ...game(8, 6), { type: "end", reason: "abandoned" }));
  assert.deepEqual(v.result, { winner: null, kind: "abandoned", text: "Abandoned (21-17, 8-6)" });
  assert.equal(v.headline, "Asha vs Ravi abandoned (21-17, 8-6)");
  assert.equal(v.lastAction, "Match abandoned");
});

test("rules change mid-match: earlier games stay, impossible changes are refused", () => {
  const e = badmintonEngine;
  const fifteen: BoardEvent = { type: "rules", rules: { points: 15, cap: 21 } };
  let b = add(e, board(e), serve("a"), ...game(21, 17), fifteen);
  let v = e.derive(b);
  assert.equal((v.setup.rules as RallyRules).points, 15);
  assert.equal((v.setup.rules as RallyRules).cap, 21);
  assert.deepEqual(v.sets[0], { a: 21, b: 17, winner: "a", tiebreak: null });
  assert.equal(v.timeline[v.timeline.length - 1].text, "Rules changed: best of 3 to 15 (cap 21)");
  assert.equal(v.lastAction, "Rules changed");
  b = add(e, b, ...game(15, 10));
  v = e.derive(b);
  assert.deepEqual(v.result, { winner: "a", kind: "win", text: "Asha won 2-0 (21-17, 15-10)" });
  assert.equal(e.check(b, fifteen), "The match is over. Undo to change the last point");

  const mid = add(e, board(e), serve("a"), ...game(16, 12));
  assert.equal(e.check(mid, fifteen), "Score is 16-12 already; pick 21");
  assert.equal(e.check(mid, { type: "rules", rules: { bestOf: 1 } }), null);
  assert.equal(e.check(mid, { type: "rules", rules: "21" } as unknown as BoardEvent), "No rules to change");

  const tt = tableTennisEngine;
  const two = add(tt, board(tt), serve("a"), ...game(11, 5), ...game(11, 7));
  assert.equal(tt.check(two, { type: "rules", rules: { bestOf: 3 } }), "Asha has won 2 games already; pick best of 5");
  assert.equal(tt.check(two, { type: "rules", rules: { bestOf: 7 } }), null);

  // Volleyball at 1-1 in sets, 16-14 in set 3: best of 3 would make set 3 the deciding set to 15, already over.
  const vb = volleyballEngine;
  const third = add(vb, board(vb, { bestOf: 5 }), serve("a"), ...game(25, 20), ...game(20, 25), ...game(16, 14));
  assert.equal(vb.check(third, { type: "rules", rules: { bestOf: 3 } }), "Score is 16-14 already; pick 21");
});

test("events the sport does not use, and bad points or serves", () => {
  const e = badmintonEngine;
  const b = add(e, board(e), serve("a"));
  assert.equal(e.check(b, { type: "card", side: "a", color: "yellow" }), "Badminton has no cards");
  assert.equal(e.check(b, { type: "foul", side: "a" }), "Badminton has no team fouls");
  assert.equal(e.check(b, { type: "clock", run: true, at: 0 }), "Badminton has no game clock");
  assert.equal(e.check(b, { type: "period" }), "Games end by themselves in badminton");
  assert.equal(volleyballEngine.check(b, { type: "period" }), "Sets end by themselves in volleyball");
  assert.equal(e.check(b, { type: "serve", side: "b", server: 2 }), "Server 1 or 2 is only for side-out doubles in pickleball");
  assert.equal(e.check(b, serve("a")), "Asha is serving already");
  assert.equal(e.check(b, { type: "point", side: "a", value: 2 }), "A rally is worth 1 point");
  assert.equal(e.check(b, { type: "point", side: "b", how: "ace" }), "An ace is a point to the server");
  assert.equal(e.check(b, { type: "point", side: "a", how: "ace" }), null);
  assert.equal(e.check(b, { type: "point", side: "b", how: "double-fault" }), "Badminton has one serve, so there is no double fault");
  assert.equal(e.check(b, { type: "point", side: "a", how: "smash" }), "Unknown kind of point");
  assert.equal(e.check(b, { type: "point", side: "c" } as unknown as BoardEvent), "Pick who won the rally");
  assert.equal(e.check(b, { type: "rename", side: "a", name: "  " }), "Type a name");
  assert.equal(e.check(b, { type: "jump" } as unknown as BoardEvent), "That is not a scoring event");
  assert.equal(e.check(b, null as unknown as BoardEvent), "That is not a scoring event");
});

test("a serve pick before game 2's first rally sets that game's first server", () => {
  const e = badmintonEngine;
  let b = add(e, board(e), serve("a"), ...game(21, 10));
  assert.notEqual(e.derive(b).gameJustEnded, null);
  b = add(e, b, serve("b"));
  const v = e.derive(b);
  assert.equal(v.server, "b");
  assert.equal(v.gameJustEnded, null);
  assert.equal(v.timeline[v.timeline.length - 1].text, "Ravi serves first");
});

test("stats: points won, longest run, won on serve, aces", () => {
  const e = badmintonEngine;
  // Asha serves and wins 3, loses on her serve, Ravi wins 2 on his and loses the 3rd.
  let b = add(e, board(e), serve("a"), ...rallies("aaabbba"));
  assert.deepEqual(e.derive(b).stats, [
    { label: "Points won", a: "4", b: "3" },
    { label: "Longest run", a: "3", b: "3" },
    { label: "Won on serve", a: "3 of 4", b: "2 of 3" },
  ]);
  b = add(e, b, { type: "point", side: "a", how: "ace" });
  const v = e.derive(b);
  assert.deepEqual(v.stats.find((s) => s.label === "Aces"), { label: "Aces", a: "1", b: "0" });
  assert.equal(v.lastAction, "Ace, Asha");
  assert.equal(v.timeline[v.timeline.length - 1].text, "Ace, Asha");
});

test("pad: one big won-the-rally button per side, match-wide actions under side null", () => {
  const e = volleyballEngine;
  const b = add(e, board(e), serve("a"), ...rallies("ab"));
  const v = e.derive(b);
  const pad = e.pad(b, v);
  assert.deepEqual(pad.map((p) => p.id), ["point-a", "point-b", "timeout-a", "timeout-b", "fix-serve", "retire-a", "retire-b", "end", "abandon"]);
  const primary = pad.filter((p) => p.tone === "primary");
  assert.deepEqual(primary.map((p) => [p.side, p.label, p.sub]), [["a", "Won the rally", "Point"], ["b", "Won the rally", "Point"]]);
  for (const p of pad) {
    if (p.event.type === "point") assert.equal(p.side, p.event.side, "a column always means points to that side");
    if (p.event.type === "end" || p.event.type === "serve") assert.equal(p.side, null);
    assert.equal(e.check(b, p.event), null, `${p.id} must be allowed`);
  }
  const fix = pad.find((p) => p.id === "fix-serve");
  assert.deepEqual(fix?.event, { type: "serve", side: "a" });
  assert.equal(fix?.sub, "Asha to serve");
  assert.equal(pad.find((p) => p.id === "end")?.tone, "warn");
  assert.equal(pad.find((p) => p.id === "abandon")?.tone, "danger");
});

test("timeline, headline mid-game and a board with junk events", () => {
  const e = badmintonEngine;
  let b = add(e, board(e), serve("a"), ...rallies("ab"), { type: "rename", side: "b", name: "Ravi K" });
  let v = e.derive(b);
  assert.deepEqual(
    v.timeline.map((l) => [l.key, l.side, l.text, l.tone, l.score]),
    [
      [0, "a", "Asha serves first", "info", "0-0"],
      [1, "a", "Point to Asha", "score", "1-0"],
      [2, "b", "Point to Ravi K", "score", "1-1"],
      [3, "b", "Name changed to Ravi K", "info", null],
    ],
  );
  assert.equal(v.teams.b.name, "Ravi K");
  assert.equal(v.headline, "Asha 1-1 Ravi K");
  b = add(e, b, ...rallies("aa"));
  assert.equal(e.derive(b).headline, "Asha leads Ravi K 3-1 in game 1");
  b = add(e, board(e), serve("a"), ...game(21, 17), ...game(15, 21), ...game(5, 5));
  assert.equal(e.derive(b).headline, "Asha 1-1 Ravi (21-17, 15-21, 5-5)");
  b = add(e, b, ...rallies("b"));
  assert.equal(e.derive(b).headline, "Ravi leads Asha 6-5 in game 3 (17-21, 21-15)");

  const junk = { ...board(e), events: [null, { type: "point", side: "z" }, serve("a"), { type: "point", side: "a" }, { type: "point" }] } as unknown as Board;
  v = e.derive(junk);
  assert.deepEqual(v.current, { a: "1", b: "0" });
  assert.equal(v.eventCount, 5);
  assert.equal(v.lastAction, null, "the last event was skipped");
  assert.doesNotThrow(() => e.pad(junk, v));
});

test("volleyball: best of 3 at 1-1 changed to best of 5 before set 3: no toss, the set 2 receivers serve", () => {
  const e = volleyballEngine;
  let b = add(e, board(e), serve("a"), ...game(25, 0), ...game(0, 25));
  let v = e.derive(b);
  assert.equal(v.needsServe, true, "deciding set: a new toss");
  b = add(e, b, { type: "rules", rules: { bestOf: 5 } });
  v = e.derive(b);
  assert.equal(v.needsServe, false, "set 3 of 5 is not the deciding set");
  assert.equal(v.server, "a", "FIVB 12.1.2: Ravi served first in set 2, so Asha serves set 3");
  assert.equal(v.gameJustEnded?.changeEnds, true, "and the teams change ends");
  assert.ok(v.notices.includes("Change ends"));
  // And back: best of 3 again makes it the deciding set, with a toss and no change of ends before it.
  b = add(e, b, { type: "rules", rules: { bestOf: 3 } });
  v = e.derive(b);
  assert.equal(v.needsServe, true);
  assert.equal(v.gameJustEnded?.changeEnds, false);
  assert.ok(!v.notices.includes("Change ends"));
  // A toss picked, then a rules change that keeps it deciding: the pick stays.
  b = add(e, b, serve("b"), { type: "rules", rules: { decidingPoints: 15 } });
  assert.equal(e.derive(b).server, "b");
});
