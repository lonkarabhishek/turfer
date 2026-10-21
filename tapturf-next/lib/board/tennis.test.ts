// Run with: npm run test:board (compiles lib/board to .test-out/board and runs node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { gameCall, gameWinner, padelEngine, setWinner, tennisEngine, tiebreakServer } from "./tennis";
import type { Board, BoardEvent, Side, SportEngine, TennisRules } from "./types";

type Engine = SportEngine<TennisRules>;
const T = tennisEngine;
const P = padelEngine;

function board(engine: Engine, rules: Partial<TennisRules> = {}): Board {
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
/** Points from a string of winners: "aab" is a, a, b. */
const pts = (s: string): BoardEvent[] => [...s].map((c) => ({ type: "point", side: c as Side }));
/** Games from a string of game winners, each won to love. */
const games = (s: string): BoardEvent[] => [...s].flatMap((c) => pts(c.repeat(4)));
/** A set to a-b in games with the trailing side's games paired first, so nobody wins it early. Not for 7-6. */
const set = (a: number, b: number) => games("ab".repeat(Math.min(a, b)) + (a > b ? "a" : "b").repeat(Math.abs(a - b)));
const derive = (engine: Engine, b: Board) => engine.derive(b);

test("defaults, presets and normalizeRules", () => {
  assert.deepEqual(T.defaults, { bestOf: 3, games: 6, tiebreak: true, finalSet: "normal", deuce: "advantage", doubles: false });
  assert.deepEqual(P.defaults, { bestOf: 3, games: 6, tiebreak: true, finalSet: "normal", deuce: "star", doubles: true });
  assert.deepEqual([T.sport, T.label, T.icon, P.sport, P.label, P.icon], ["tennis", "Tennis", "🎾", "padel", "Padel", "🎾"]);
  for (const raw of [null, undefined, "x", 3, [1, 2], {}]) {
    assert.deepEqual(T.normalizeRules(raw), T.defaults);
    assert.deepEqual(P.normalizeRules(raw), P.defaults);
  }
  const n = T.normalizeRules;
  assert.equal(n({ bestOf: 1, finalSet: "match-tiebreak" }).finalSet, "normal", "a single set is never a match tiebreak");
  assert.equal(n({ bestOf: 3, finalSet: "match-tiebreak" }).finalSet, "match-tiebreak");
  assert.equal(n({ bestOf: 2 }).bestOf, 3);
  assert.equal(n({ bestOf: 5 }).bestOf, 5);
  assert.equal(n({ games: 4 }).games, 4);
  assert.equal(n({ games: 99 }).games, 8);
  assert.equal(n({ games: "6" }).games, 6);
  assert.equal(n({ deuce: "no-ad" }).deuce, "advantage");
  assert.equal(P.normalizeRules({ deuce: "golden" }).deuce, "golden");
  assert.equal(n({ tiebreak: "yes" }).tiebreak, true);
  assert.equal("foo" in n({ foo: 1 }), false);
  for (const raw of [{ bestOf: 1, finalSet: "match-tiebreak", games: 4 }, { deuce: "star", doubles: true }, { games: 2.6 }]) assert.deepEqual(n(n(raw)), n(raw), "idempotent");

  const options = (e: Engine, key: string) => e.presets.find((p) => p.key === key)?.options ?? [];
  assert.deepEqual(
    options(P, "deuce").map((o) => [o.label, o.rules.deuce]),
    [
      ["Star point", "star"],
      ["Golden point", "golden"],
      ["Advantage", "advantage"],
    ],
  );
  assert.deepEqual(
    options(T, "deuce").map((o) => [o.label, o.rules.deuce]),
    [
      ["Advantage", "advantage"],
      ["No-ad", "golden"],
    ],
  );
  assert.deepEqual(
    options(T, "final").map((o) => o.rules.finalSet),
    ["normal", "match-tiebreak"],
  );
  assert.deepEqual(options(P, "players")[0].rules, { doubles: true }, "padel lists doubles first, its default");
});

test("game, set and tiebreak arithmetic", () => {
  const g = (a: number, b: number) => ({ a, b });
  assert.equal(gameWinner(g(4, 2), "advantage"), "a");
  assert.equal(gameWinner(g(4, 3), "advantage"), null, "AD-40");
  assert.equal(gameWinner(g(9, 7), "advantage"), "a");
  assert.equal(gameWinner(g(3, 4), "golden"), "b", "no-ad: the point at deuce wins");
  assert.equal(gameWinner(g(4, 3), "star"), null, "first deuce: advantage");
  assert.equal(gameWinner(g(5, 4), "star"), null, "second deuce: advantage");
  assert.equal(gameWinner(g(6, 5), "star"), "a", "third deuce: the star point wins");
  assert.equal(gameWinner(g(3, 3), "star"), null);
  const r = { games: 6, tiebreak: true };
  assert.equal(setWinner(g(6, 4), r), "a");
  assert.equal(setWinner(g(6, 5), r), null);
  assert.equal(setWinner(g(7, 5), r), "a");
  assert.equal(setWinner(g(6, 7), r), "b", "the tiebreak counts as the 13th game");
  assert.equal(setWinner(g(7, 6), { games: 6, tiebreak: false }), null);
  assert.equal(setWinner(g(8, 6), { games: 6, tiebreak: false }), "a");
  assert.equal(setWinner(g(4, 2), { games: 4, tiebreak: true }), "a");
  // ITF 5b: A serves point 1, B points 2 and 3, A points 4 and 5, B 6 and 7.
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6].map((n) => tiebreakServer("a", n)),
    ["a", "b", "b", "a", "a", "b", "b"],
  );
  assert.deepEqual(gameCall(g(0, 0)), { a: "0", b: "0" });
  assert.deepEqual(gameCall(g(2, 1)), { a: "30", b: "15" });
  assert.deepEqual(gameCall(g(3, 3)), { a: "40", b: "40" });
  assert.deepEqual(gameCall(g(5, 6)), { a: "40", b: "AD" });
});

test("points wait for the first serve", () => {
  const b = board(T);
  const v = derive(T, b);
  assert.equal(v.needsServe, true);
  assert.equal(v.server, null);
  assert.equal(v.status, "live");
  assert.equal(v.headline, "Asha vs Ravi");
  assert.equal(v.scoreUnit, "Sets");
  assert.deepEqual(v.current, { a: "0", b: "0" });
  assert.equal(v.currentLabel, "Game 1, set 1");
  assert.deepEqual(v.sets, [{ a: 0, b: 0, winner: null, tiebreak: null }]);
  assert.deepEqual(v.stats, []);
  assert.equal(T.check(b, pts("a")[0]), "Pick who serves first");
  const pad = T.pad(b, v);
  assert.deepEqual(
    pad.map((p) => p.id),
    ["serve-a", "serve-b", "walkover-a", "walkover-b", "end", "abandon"],
  );
  assert.deepEqual(pad[0], { id: "serve-a", side: "a", label: "Asha serves first", tone: "primary", event: { type: "serve", side: "a" } });

  const s = add(T, b, serve("a"));
  const v2 = derive(T, s);
  assert.deepEqual([v2.needsServe, v2.server, v2.serveNote, v2.lastAction], [false, "a", "Right court", "Asha serves"]);
  assert.deepEqual(v2.timeline, [{ key: 0, side: "a", text: "Asha serves first", when: null, period: 0, tone: "info", score: "0-0" }]);
  const pad2 = T.pad(s, v2);
  assert.deepEqual(
    pad2.map((p) => p.id),
    ["point-a", "point-b", "fix-serve", "walkover-a", "walkover-b", "end", "abandon"],
  );
  assert.deepEqual(pad2[0], { id: "point-a", side: "a", label: "Won the point", sub: "Point", tone: "primary", event: { type: "point", side: "a" } });
  assert.deepEqual(pad2[2].event, { type: "serve", side: "b" });
  // Every scoring button scores for its own column.
  for (const p of pad2) if (p.event.type === "point") assert.equal(p.event.side, p.side);
});

test("a game: 0, 15, 30, 40, the server changes every game, ends change after odd games", () => {
  let b = add(T, board(T), serve("a"), ...pts("a"));
  let v = derive(T, b);
  assert.deepEqual(v.current, { a: "15", b: "0" });
  assert.equal(v.serveNote, "Left court", "ITF 17: the serve alternates halves each point, from the right");
  assert.deepEqual(v.timeline.length, 1, "points inside a game add no timeline line");
  assert.equal(v.lastAction, "Point, Asha");
  b = add(T, b, ...pts("b"));
  assert.deepEqual(derive(T, b).current, { a: "15", b: "15" });
  b = add(T, b, ...pts("aa"));
  v = derive(T, b);
  assert.deepEqual(v.current, { a: "40", b: "15" });
  assert.deepEqual(
    T.pad(b, v)
      .slice(0, 2)
      .map((p) => p.sub),
    ["Wins the game", "Point"],
  );
  assert.equal(v.gameJustEnded, null);

  b = add(T, b, ...pts("a"));
  v = derive(T, b);
  assert.deepEqual(v.sets, [{ a: 1, b: 0, winner: null, tiebreak: null }]);
  assert.deepEqual(v.current, { a: "0", b: "0" });
  assert.equal(v.server, "b", "ITF 14: the receiver serves the next game");
  assert.equal(v.currentLabel, "Game 2, set 1");
  assert.deepEqual(v.notices, ["Change ends"], "ITF 10: after game 1");
  assert.equal(v.changeEnds, true);
  assert.equal(v.gameJustEnded, null, "a game is not a set");
  assert.deepEqual(v.timeline[1], { key: 5, side: "a", text: "Game to Asha", when: null, period: 0, tone: "score", score: "1-0" });
  assert.equal(v.lastAction, "Game to Asha");
  assert.equal(v.headline, "Asha leads Ravi 1-0 in set 1");
  assert.equal(v.teams.a.score, 0, "the main score counts sets");

  b = add(T, b, ...pts("a"));
  v = derive(T, b);
  assert.deepEqual([v.notices, v.changeEnds], [[], false], "shown until the next point");
  // Asha breaks Ravi's serve: no change of ends after game 2.
  b = add(T, b, ...pts("aaa"));
  v = derive(T, b);
  assert.equal(v.timeline[2].text, "Game to Asha, break of serve");
  assert.deepEqual([v.server, v.notices, v.changeEnds], ["a", [], false]);
  assert.deepEqual(v.stats, [
    { label: "Points won", a: "8", b: "1" },
    { label: "Games won", a: "2", b: "0" },
    { label: "Service games won", a: "1 of 1", b: "0 of 1" },
    { label: "Break points won", a: "1 of 1", b: "0 of 0" },
  ]);
});

test("deuce and advantage", () => {
  let b = add(T, board(T), serve("a"), ...pts("aaabbb"));
  let v = derive(T, b);
  assert.deepEqual([v.current, v.notices], [{ a: "40", b: "40" }, ["Deuce"]]);
  b = add(T, b, ...pts("a"));
  v = derive(T, b);
  assert.deepEqual([v.current, v.notices], [{ a: "AD", b: "40" }, []]);
  b = add(T, b, ...pts("b"));
  assert.deepEqual(derive(T, b).notices, ["Deuce"], "back to deuce");
  b = add(T, b, ...pts("b"));
  assert.deepEqual(derive(T, b).current, { a: "40", b: "AD" });
  b = add(T, b, ...pts("ab"));
  assert.deepEqual(derive(T, b).current, { a: "40", b: "AD" }, "deuce and advantage Ravi again");
  b = add(T, b, ...pts("b"));
  v = derive(T, b);
  assert.deepEqual(v.sets[0], { a: 0, b: 1, winner: null, tiebreak: null });
  assert.equal(v.timeline[1].text, "Game to Ravi, break of serve");
  // Ravi had a break point at each advantage (not at deuce), and took the second.
  assert.deepEqual(v.stats[3], { label: "Break points won", a: "0 of 0", b: "1 of 2" });
});

test("golden point: the point at deuce wins, receivers pick the side", () => {
  for (const engine of [T, P]) {
    let b = add(engine, board(engine, { deuce: "golden" }), serve("a"), ...pts("aaabbb"));
    const v = derive(engine, b);
    assert.deepEqual(v.current, { a: "40", b: "40" });
    assert.deepEqual(v.notices, ["Golden point, receivers pick the side"], engine.sport);
    assert.equal(v.serveNote, "Receivers pick the side");
    b = add(engine, b, ...pts("b"));
    assert.deepEqual(derive(engine, b).sets[0], { a: 0, b: 1, winner: null, tiebreak: null }, engine.sport);
  }
});

test("star point (padel default): advantage at the first two deuces, the third deuce decides", () => {
  let b = add(P, board(P), serve("a"), ...pts("aaabbb"));
  assert.deepEqual(derive(P, b).notices, ["Deuce"]);
  b = add(P, b, ...pts("a"));
  assert.deepEqual(derive(P, b).current, { a: "AD", b: "40" });
  b = add(P, b, ...pts("b"));
  assert.deepEqual(derive(P, b).notices, ["Deuce, star point at the next deuce"]);
  b = add(P, b, ...pts("b"));
  assert.deepEqual(derive(P, b).current, { a: "40", b: "AD" });
  b = add(P, b, ...pts("a"));
  let v = derive(P, b);
  assert.deepEqual([v.current, v.notices, v.serveNote], [{ a: "40", b: "40" }, ["Star point, receivers pick the side"], "Receivers pick the side"]);
  b = add(P, b, ...pts("a"));
  v = derive(P, b);
  assert.deepEqual(v.sets[0], { a: 1, b: 0, winner: null, tiebreak: null });
  assert.equal(v.timeline[1].text, "Game to Asha");
  // Under advantage the same points just go on.
  assert.deepEqual(derive(T, add(T, board(T), serve("a"), ...pts("aaabbbabba"))).current, { a: "40", b: "40" });
});

test("sets: 6 games with 2 clear, a set end hands over gameJustEnded, ends change by the set's games", () => {
  let b = add(T, board(T), serve("a"), ...set(5, 5), ...games("a"));
  let v = derive(T, b);
  assert.deepEqual(v.sets, [{ a: 6, b: 5, winner: null, tiebreak: null }]);
  assert.deepEqual([v.gameJustEnded, v.changeEnds], [null, true]);
  b = add(T, b, ...games("a"));
  v = derive(T, b);
  assert.deepEqual(v.sets, [
    { a: 7, b: 5, winner: "a", tiebreak: null },
    { a: 0, b: 0, winner: null, tiebreak: null },
  ]);
  // 12 games is even: no change now, but after the first game of set 2 (ITF 10).
  assert.deepEqual(v.gameJustEnded, { label: "Set 1 to Asha, 7-5", changeEnds: false });
  assert.deepEqual([v.notices, v.changeEnds, v.teams.a.score, v.currentLabel], [[], false, 1, "Game 1, set 2"]);
  assert.deepEqual(v.timeline.at(-1), { key: b.events.length - 1, side: "a", text: "Set 1 to Asha, 7-5", when: null, period: 0, tone: "score", score: "7-5" });
  assert.equal(v.lastAction, "Set 1 to Asha");
  assert.equal(v.headline, "Asha leads Ravi 1-0 (7-5)");
  b = add(T, b, ...pts("b"));
  assert.equal(derive(T, b).gameJustEnded, null, "the next point clears it");
  b = add(T, b, ...pts("bbb"));
  v = derive(T, b);
  assert.deepEqual([v.notices, v.changeEnds, v.timeline.at(-1)?.period], [["Change ends"], true, 1]);

  // 6-3 is 9 games: change ends at the end of the set.
  v = derive(T, add(T, board(T), serve("a"), ...set(6, 3)));
  assert.deepEqual(v.gameJustEnded, { label: "Set 1 to Asha, 6-3", changeEnds: true });
  assert.deepEqual(v.notices, ["Change ends"]);
  assert.equal(v.changeEnds, false, "the set end's change is gameJustEnded's");

  v = derive(T, add(T, board(T), serve("a"), ...set(6, 4), ...games("ababa")));
  assert.equal(v.headline, "Asha leads Ravi 1-0 (6-4, 3-2)");
  v = derive(T, add(T, board(T), serve("a"), ...set(6, 4), ...games("abab")));
  assert.equal(v.currentLabel, "Game 5, set 2");
  assert.equal(v.headline, "Asha leads Ravi 1-0 (6-4, 2-2)");
  v = derive(T, add(T, board(T), serve("a"), ...set(4, 6), ...set(6, 3), ...games("b")));
  assert.equal(v.headline, "Ravi leads Asha 1-0 in set 3 (6-4, 3-6)");
  v = derive(T, add(T, board(T), serve("a"), ...set(4, 6), ...set(6, 3)));
  assert.equal(v.headline, "Asha 1-1 Ravi (4-6, 6-3)");
});

test("tiebreak at 6-6: to 7, 2 clear, serve 1 then 2 each, ends every 6 points, next set served by its first receiver", () => {
  // Asha serves the odd games, so the 13th game, the tiebreak, is hers to start.
  let b = add(T, board(T), serve("a"), ...games("ab".repeat(6)));
  let v = derive(T, b);
  assert.deepEqual([v.currentLabel, v.current, v.server, v.serveNote], ["Tiebreak", { a: "0", b: "0" }, "a", "Right court"]);
  assert.deepEqual(v.sets, [{ a: 6, b: 6, winner: null, tiebreak: null }]);
  const servers: (Side | null)[] = [];
  for (const p of pts("ababab")) {
    b = add(T, b, p);
    servers.push(derive(T, b).server);
  }
  assert.deepEqual(servers, ["b", "b", "a", "a", "b", "b"]);
  v = derive(T, b);
  assert.deepEqual([v.current, v.notices, v.changeEnds], [{ a: "3", b: "3" }, ["Change ends"], true]);
  b = add(T, b, ...pts("aabba"));
  v = derive(T, b);
  assert.deepEqual([v.current, v.notices], [{ a: "6", b: "5" }, ["Set point Asha"]]);
  b = add(T, b, ...pts("b"));
  assert.deepEqual(derive(T, b).notices, ["Change ends"], "12 points: change again");
  b = add(T, b, ...pts("a"));
  assert.equal(derive(T, b).sets.length, 1, "7-6 in points is not 2 clear");
  b = add(T, b, ...pts("a"));
  v = derive(T, b);
  assert.deepEqual(v.sets[0], { a: 7, b: 6, winner: "a", tiebreak: { a: 8, b: 6 } });
  // 7-6 is 13 games: change ends now (ITF 10). Asha served the tiebreak's first point, so Ravi serves set 2 (ITF 5b).
  assert.deepEqual(v.gameJustEnded, { label: "Set 1 to Asha, 7-6 (8-6)", changeEnds: true });
  assert.deepEqual([v.server, v.currentLabel, v.current], ["b", "Game 1, set 2", { a: "0", b: "0" }]);
  assert.equal(v.stats[1].a, "7", "the tiebreak counts as a game won");
  // Short sets to 4 play the tiebreak at 4-4.
  v = derive(T, add(T, board(T, { games: 4 }), serve("a"), ...games("abababab")));
  assert.equal(v.currentLabel, "Tiebreak");
  v = derive(T, add(T, board(T, { games: 4 }), serve("a"), ...set(4, 2)));
  assert.deepEqual(v.sets[0], { a: 4, b: 2, winner: "a", tiebreak: null });
});

test("no tiebreak: play on until 2 clear", () => {
  let b = add(T, board(T, { tiebreak: false }), serve("a"), ...games("ab".repeat(6)));
  assert.equal(derive(T, b).currentLabel, "Game 13, set 1");
  b = add(T, b, ...games("a"));
  assert.equal(derive(T, b).sets[0].winner, null, "7-6");
  b = add(T, b, ...games("a"));
  assert.deepEqual(derive(T, b).sets[0], { a: 8, b: 6, winner: "a", tiebreak: null });
});

test("best of 1, 3 and 5", () => {
  let v = derive(T, add(T, board(T, { bestOf: 1 }), serve("a"), ...games("aab")));
  assert.deepEqual([v.scoreUnit, v.teams.a.score, v.teams.b.score, v.currentLabel, v.headline], ["Games", 2, 1, "Game 4", "Asha leads Ravi 2-1"]);
  const one = add(T, board(T, { bestOf: 1 }), serve("a"), ...set(6, 4));
  v = derive(T, one);
  assert.deepEqual([v.status, v.result, v.headline], ["done", { winner: "a", kind: "win", text: "Asha won 6-4" }, "Asha beat Ravi 6-4"]);
  assert.deepEqual(v.sets, [{ a: 6, b: 4, winner: "a", tiebreak: null }]);
  assert.deepEqual([v.current, v.currentLabel, v.server, v.notices, v.gameJustEnded], [null, null, null, [], null]);
  assert.equal(T.check(one, pts("a")[0]), "The match is over. Undo to change the last point");
  assert.deepEqual(T.pad(one, v), []);

  v = derive(T, add(T, board(T), serve("a"), ...set(6, 4), ...set(6, 4)));
  assert.deepEqual([v.status, v.teams.a.score, v.teams.b.score, v.result?.text], ["done", 2, 0, "Asha won 6-4, 6-4"]);

  const five = add(T, board(T, { bestOf: 5 }), serve("a"), ...set(6, 4), ...set(4, 6), ...set(6, 4));
  assert.equal(derive(T, five).status, "live", "2-1 in best of 5");
  v = derive(T, add(T, five, ...set(6, 4)));
  assert.deepEqual([v.status, v.teams.a.score, v.teams.b.score, v.result?.text], ["done", 3, 1, "Asha won 6-4, 4-6, 6-4, 6-4"]);
});

test("set point, match point and the finished line", () => {
  // 5-4 to Asha, and Ravi serves game 10: 0-40 is set point (and a break point) for Asha.
  let b = add(T, board(T), serve("a"), ...set(5, 4), ...pts("aaa"));
  let v = derive(T, b);
  assert.deepEqual([v.server, v.notices], ["b", ["Set point Asha"]]);
  assert.deepEqual(
    T.pad(b, v)
      .slice(0, 2)
      .map((p) => p.sub),
    ["Wins set 1", "Point"],
  );
  b = add(T, board(T), serve("a"), ...set(6, 4), ...games("ab".repeat(6)), ...pts("aaaaaabbbbb"));
  v = derive(T, b);
  assert.deepEqual([v.current, v.notices], [{ a: "6", b: "5" }, ["Match point Asha"]]);
  assert.equal(T.pad(b, v)[0].sub, "Wins the match");
  b = add(T, b, ...pts("a"));
  v = derive(T, b);
  assert.equal(v.status, "done");
  assert.deepEqual(v.result, { winner: "a", kind: "win", text: "Asha won 6-4, 7-6 (7-5)" });
  assert.equal(v.headline, "Asha beat Ravi 6-4, 7-6 (7-5)");
  assert.deepEqual(v.sets, [
    { a: 6, b: 4, winner: "a", tiebreak: null },
    { a: 7, b: 6, winner: "a", tiebreak: { a: 7, b: 5 } },
  ]);
  assert.deepEqual(v.timeline.at(-1), { key: b.events.length - 1, side: "a", text: "Match to Asha, 6-4, 7-6 (7-5)", when: null, period: 1, tone: "end", score: "7-6" });
  assert.equal(v.lastAction, "Match to Asha");
  // Ravi's side of the same match.
  const lost = add(T, board(T), serve("a"), ...set(4, 6), ...games("ab".repeat(6)), ...pts("bbbbbbaaaaab"));
  assert.equal(derive(T, lost).result?.text, "Ravi won 6-4, 7-6 (7-5)");
});

test("match tiebreak in place of the deciding set, written [10-8]", () => {
  const r = { finalSet: "match-tiebreak" as const };
  const level = add(T, board(T, r), serve("a"), ...set(6, 4), ...set(4, 6));
  let v = derive(T, level);
  assert.deepEqual([v.currentLabel, v.current, v.headline], ["Match tiebreak", { a: "0", b: "0" }, "Asha 1-1 Ravi (6-4, 4-6)"]);
  assert.deepEqual(v.sets[2], { a: 0, b: 0, winner: null, tiebreak: null, matchTiebreak: true });
  // Ravi served the last game of set 2, so Asha starts the match tiebreak, then two each.
  assert.equal(v.server, "a");
  let b = add(T, level, ...pts("ababab"));
  v = derive(T, b);
  assert.deepEqual([v.notices, v.server, v.headline], [["Change ends"], "b", "Asha 1-1 Ravi (6-4, 4-6, [3-3])"]);
  b = add(T, level, ...pts("ab".repeat(9)));
  b = add(T, b, ...pts("a"));
  v = derive(T, b);
  assert.deepEqual([v.status, v.current, v.notices], ["live", { a: "10", b: "9" }, ["Match point Asha"]]);
  assert.equal(v.headline, "Asha leads Ravi 10-9 in the match tiebreak (6-4, 4-6)");
  b = add(T, b, ...pts("a"));
  v = derive(T, b);
  assert.deepEqual(v.result, { winner: "a", kind: "win", text: "Asha won 6-4, 4-6, [11-9]" });

  b = add(T, level, ...pts("ab".repeat(8) + "aa"));
  v = derive(T, b);
  assert.deepEqual(v.sets, [
    { a: 6, b: 4, winner: "a", tiebreak: null },
    { a: 4, b: 6, winner: "b", tiebreak: null },
    { a: 10, b: 8, winner: "a", tiebreak: null, matchTiebreak: true },
  ]);
  assert.equal(v.result?.text, "Asha won 6-4, 4-6, [10-8]");
  assert.equal(v.headline, "Asha beat Ravi 6-4, 4-6, [10-8]");
  assert.deepEqual(v.stats[1], { label: "Games won", a: "10", b: "10" }, "the match tiebreak is not a game");
  // A single set is never a match tiebreak.
  assert.equal(derive(T, add(T, board(T, { ...r, bestOf: 1 }), serve("a"))).currentLabel, "Game 1");
});

test("serve corrections: a game's server from now, a tiebreak's first server flipped", () => {
  let b = add(T, board(T), serve("a"), ...pts("a"));
  assert.equal(T.check(b, serve("a")), "Asha is serving already");
  assert.equal(T.check(b, { type: "serve", side: "b", server: 2 }), "Server 1 or 2 is only for side-out doubles in pickleball");
  b = add(T, b, serve("b"));
  let v = derive(T, b);
  assert.deepEqual([v.server, v.current, v.timeline.at(-1)?.text], ["b", { a: "15", b: "0" }, "Ravi to serve"]);
  b = add(T, b, ...pts("bbbb"));
  v = derive(T, b);
  assert.equal(v.timeline.at(-1)?.text, "Game to Ravi", "Ravi held the game he served");
  assert.equal(v.server, "a", "and the order carries on from him");

  // Tiebreak: Asha served point 1; after 2 points the scorer says Asha serves now (it was Ravi's turn).
  b = add(T, board(T), serve("a"), ...games("ab".repeat(6)), ...pts("ab"));
  assert.equal(derive(T, b).server, "b");
  b = add(T, b, serve("a"));
  v = derive(T, b);
  assert.equal(v.server, "a");
  b = add(T, b, ...pts("b"));
  assert.equal(derive(T, b).server, "b", "Ravi was the first server: Asha has points 2 and 3, Ravi 4 and 5");
  b = add(T, b, ...pts("aaaaaa"));
  v = derive(T, b);
  assert.deepEqual(v.sets[0], { a: 7, b: 6, winner: "a", tiebreak: { a: 7, b: 2 } });
  assert.equal(v.server, "a", "Ravi served the tiebreak first, so Asha serves set 2");
});

test("end: retired, walkover, conceded, abandoned and time up", () => {
  // A walkover needs no events and no first serve.
  let v = derive(T, add(T, board(T), { type: "end", reason: "walkover", side: "b" }));
  assert.deepEqual([v.status, v.result, v.headline], ["done", { winner: "a", kind: "win", text: "Asha won by walkover" }, "Asha beat Ravi by walkover"]);
  const started = add(T, board(T), serve("a"), ...pts("a"));
  assert.equal(T.check(started, { type: "end", reason: "walkover", side: "b" }), "Points have been played, so it is not a walkover. Pick retired or conceded");
  assert.equal(T.check(started, { type: "end", reason: "retired" }), "Pick who retired");
  assert.deepEqual(
    T.pad(started, derive(T, started))
      .filter((p) => p.event.type === "end")
      .map((p) => p.id),
    ["retire-a", "retire-b", "end", "abandon"],
  );

  const mid = add(T, board(T), serve("a"), ...set(6, 4), ...games("ab"));
  v = derive(T, add(T, mid, { type: "end", reason: "retired", side: "a" }));
  assert.deepEqual(v.result, { winner: "b", kind: "win", text: "Ravi won, Asha retired (4-6, 1-1)" });
  assert.deepEqual(v.sets, [
    { a: 6, b: 4, winner: "a", tiebreak: null },
    { a: 1, b: 1, winner: null, tiebreak: null },
  ]);
  assert.deepEqual(v.timeline.at(-1)?.tone, "end");
  v = derive(T, add(T, mid, { type: "end", reason: "conceded", side: "b" }));
  assert.equal(v.result?.text, "Asha won, Ravi conceded (6-4, 1-1)");
  v = derive(T, add(T, mid, { type: "end", reason: "abandoned" }));
  assert.deepEqual([v.result, v.headline], [{ winner: null, kind: "abandoned", text: "Abandoned (6-4, 1-1)" }, "Asha vs Ravi abandoned (6-4, 1-1)"]);
  assert.equal(T.check(add(T, mid, { type: "end" }), pts("a")[0]), "The match has ended. Undo to carry on");

  // Time up: sets, then games in the unfinished set, then points in the unfinished game.
  v = derive(T, add(T, mid, ...games("b"), { type: "end" }));
  assert.deepEqual([v.result, v.headline], [{ winner: "a", kind: "win", text: "Asha won, time up (6-4, 1-2)" }, "Asha beat Ravi, time up (6-4, 1-2)"]);
  const level = add(T, board(T), serve("a"), ...set(6, 4), ...set(4, 6));
  v = derive(T, add(T, level, ...games("aba"), { type: "end" }));
  assert.equal(v.result?.text, "Asha won, time up (6-4, 4-6, 2-1)");
  v = derive(T, add(T, board(T), serve("a"), ...pts("abb"), { type: "end" }));
  assert.deepEqual(v.result, { winner: "b", kind: "win", text: "Ravi won, time up" });
  v = derive(T, add(T, level, { type: "end" }));
  assert.deepEqual([v.result, v.headline], [{ winner: null, kind: "draw", text: "Drawn, time up (6-4, 4-6)" }, "Asha and Ravi drew, time up (6-4, 4-6)"]);
  // In a tiebreak, its points decide.
  v = derive(T, add(T, board(T), serve("a"), ...games("ab".repeat(6)), ...pts("bba"), { type: "end" }));
  assert.equal(v.result?.text, "Ravi won, time up (6-6)");
});

test("rules changes apply from now on, and the score must be able to take them", () => {
  // Advantage to golden at AD-40 would end the game on the spot.
  const ad = add(T, board(T), serve("a"), ...pts("aaabbba"));
  assert.equal(T.check(ad, { type: "rules", rules: { deuce: "golden" } }), "This game is at AD-40; change that after it");
  let b = add(T, board(T), serve("a"), ...pts("aab"), { type: "rules", rules: { deuce: "golden" } });
  let v = derive(T, b);
  assert.equal((v.setup.rules as TennisRules).deuce, "golden", "the rules in force now");
  assert.equal(v.timeline.at(-1)?.text, "Rules changed: best of 3 sets to 6 games, tiebreak at 6-6, golden point");
  assert.equal(v.lastAction, "Rules changed");
  b = add(T, b, ...pts("abb"));
  assert.deepEqual(derive(T, b).notices, ["Golden point, receivers pick the side"]);

  const oneUp = add(T, board(T), serve("a"), ...set(6, 4));
  assert.equal(T.check(oneUp, { type: "rules", rules: { bestOf: 1 } }), "Asha has won 1 set already; pick best of 3");
  assert.equal(T.check(oneUp, { type: "rules", rules: { bestOf: 5 } }), null);

  const fiveTwo = add(T, board(T), serve("a"), ...set(5, 2));
  assert.equal(T.check(fiveTwo, { type: "rules", rules: { games: 4 } }), "Games are 5-2 already; pick sets to 6");
  const sevenAll = add(T, board(T, { tiebreak: false }), serve("a"), ...games("ab".repeat(7)));
  assert.equal(T.check(sevenAll, { type: "rules", rules: { tiebreak: true } }), "Games are 7-7 already, too late for a tiebreak at 6-6");

  // Games 4-4 with nothing played in game 9: sets to 4 makes it the tiebreak. With a point played, finish the game first.
  const fourAll = add(T, board(T), serve("a"), ...games("abababab"));
  assert.equal(derive(T, add(T, fourAll, { type: "rules", rules: { games: 4 } })).currentLabel, "Tiebreak");
  assert.equal(T.check(add(T, fourAll, ...pts("a")), { type: "rules", rules: { games: 4 } }), "Finish this game first");

  // A tiebreak under way stays; one not started yet can go.
  const tb = add(T, board(T), serve("a"), ...games("ab".repeat(6)));
  assert.equal(T.check(add(T, tb, ...pts("a")), { type: "rules", rules: { tiebreak: false } }), "The tiebreak has started; change that after this set");
  assert.equal(derive(T, add(T, tb, { type: "rules", rules: { tiebreak: false } })).currentLabel, "Game 13, set 1");

  // The deciding set becomes a match tiebreak only before it starts, and a match tiebreak under way stays.
  const level = add(T, board(T), serve("a"), ...set(6, 4), ...set(4, 6));
  assert.equal(T.check(add(T, level, ...pts("a")), { type: "rules", rules: { finalSet: "match-tiebreak" } }), "Set 3 has started, so it stays a full set");
  b = add(T, level, { type: "rules", rules: { finalSet: "match-tiebreak" } });
  v = derive(T, b);
  assert.deepEqual([v.currentLabel, (v.setup.rules as TennisRules).finalSet], ["Match tiebreak", "match-tiebreak"]);
  b = add(T, b, ...pts("a"));
  assert.equal(T.check(b, { type: "rules", rules: { finalSet: "normal" } }), "The match tiebreak has started, so it stays");
  assert.equal(T.check(b, { type: "rules", rules: "x" } as unknown as BoardEvent), "No rules to change");
  // Earlier sets stay as played: set 1 to 6 still reads 6-4 after a switch to short sets.
  v = derive(T, add(T, oneUp, { type: "rules", rules: { games: 4 } }, ...set(4, 1)));
  assert.deepEqual(
    v.sets.map((s) => [s.a, s.b, s.winner]),
    [
      [6, 4, "a"],
      [4, 1, "a"],
    ],
  );
});

test("events tennis does not take, and aces and double faults", () => {
  const b = add(T, board(T), serve("a"));
  assert.equal(T.check(b, { type: "card", side: "a", color: "yellow" }), "Tennis has no cards");
  assert.equal(T.check(b, { type: "foul", side: "a" }), "Tennis has no team fouls");
  assert.equal(T.check(b, { type: "clock", run: true, at: 1 }), "Tennis has no game clock");
  assert.equal(T.check(b, { type: "timeout", side: "a" }), "Tennis has no timeouts");
  assert.equal(P.check(board(P), { type: "period" }), "Games and sets end by themselves in padel");
  assert.equal(T.check(b, { type: "point", side: "a", value: 2 }), "A point is worth 1");
  assert.equal(T.check(b, { type: "point", side: "b", how: "ace" }), "An ace is a point to the server");
  assert.equal(T.check(b, { type: "point", side: "a", how: "double-fault" }), "A double fault is a point to the receiver");
  assert.equal(T.check(b, { type: "point", side: "a", how: "smash" }), "Unknown kind of point");
  assert.equal(T.check(b, { type: "nope" } as unknown as BoardEvent), "That is not a scoring event");
  const s = add(T, b, { type: "point", side: "a", how: "ace" }, { type: "point", side: "b", how: "double-fault" });
  const v = derive(T, s);
  assert.equal(v.lastAction, "Double fault, Asha");
  assert.deepEqual(v.stats.slice(-2), [
    { label: "Aces", a: "1", b: "0" },
    { label: "Double faults", a: "1", b: "0" },
  ]);
});

test("padel: doubles, star point by default, renames and a stray event", () => {
  const b = add(P, board(P), serve("b"), { type: "rename", side: "a", name: "Asha / Meera" }, ...pts("bbbb"));
  const v = derive(P, b);
  assert.deepEqual([v.sportName, v.scoreUnit, (v.setup.rules as TennisRules).doubles, v.teams.a.name], ["Padel", "Sets", true, "Asha / Meera"]);
  assert.equal(v.headline, "Ravi leads Asha / Meera 1-0 in set 1");
  assert.equal(v.timeline[1].text, "Name changed to Asha / Meera");
  assert.equal(v.server, "a");
  const stray = { ...b, events: [...b.events, null as unknown as BoardEvent] };
  assert.equal(derive(P, stray).eventCount, b.events.length + 1);
  assert.deepEqual(derive(P, stray).sets, v.sets);
});
