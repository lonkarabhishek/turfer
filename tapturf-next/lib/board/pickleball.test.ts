// Run with: npm run test:board (compiles lib/board to .test-out/board and runs node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickleballEngine as e } from "./pickleball";
import type { Board, BoardEvent, PickleballRules, Side } from "./types";

function board(rules: Partial<PickleballRules> = {}): Board {
  return { v: 1, kind: "board", id: "t", createdAt: 0, sport: "pickleball", setup: { teamA: "Asha", teamB: "Ravi", title: "", venue: "", rules: e.normalizeRules(rules) }, events: [] };
}

/** Add events, failing the test on any refused one. */
function add(b: Board, ...events: BoardEvent[]): Board {
  for (const ev of events) {
    const why = e.check(b, ev);
    assert.equal(why, null, `${JSON.stringify(ev)} refused: ${why}`);
    b = { ...b, events: [...b.events, ev] };
  }
  return b;
}

const serve = (side: Side, server?: 1 | 2): BoardEvent => ({ type: "serve", side, ...(server ? { server } : {}) });
const rallies = (s: string): BoardEvent[] => [...s].map((c) => ({ type: "point", side: c as Side }));
const call = (b: Board) => e.derive(b).serveNote;
const score = (b: Board) => e.derive(b).sets[e.derive(b).sets.length - 1];

/** Give `side` n more points: it wins rallies until it has the serve, then wins n on its serve. */
function pointsTo(b: Board, side: Side, n: number): Board {
  for (let i = 0; i < n; i++) {
    let guard = 0;
    while (e.derive(b).server !== side && guard++ < 3) b = add(b, ...rallies(side));
    b = add(b, ...rallies(side));
  }
  return b;
}

test("defaults, normalizeRules and presets", () => {
  assert.deepEqual(e.defaults, { scoring: "sideout", points: 11, winBy: 2, bestOf: 1, gamePointOnServe: true, doubles: true });
  for (const raw of [null, "x", [1], {}]) assert.deepEqual(e.normalizeRules(raw), e.defaults);
  assert.deepEqual(e.normalizeRules({ scoring: "rally", points: 21, bestOf: 3, doubles: false, gamePointOnServe: false, junk: 1 }), {
    scoring: "rally",
    points: 21,
    winBy: 2,
    bestOf: 3,
    gamePointOnServe: false,
    doubles: false,
  });
  assert.equal(e.normalizeRules({ bestOf: 7 }).bestOf, 1);
  assert.equal(e.normalizeRules({ scoring: "points" }).scoring, "sideout");
  assert.deepEqual(e.presets.map((p) => p.options.map((o) => o.label)), [["Doubles to 11", "Singles to 11", "Rally to 21"], ["1 game", "Best of 3"]]);
  assert.deepEqual(e.presets[0].options[2].rules, { scoring: "rally", points: 21 });
  assert.equal(e.label, "Pickleball");
  assert.equal(e.icon, "🏓");
});

test("side-out doubles: 0-0-2 start, second server, side out, the call", () => {
  let b = board();
  assert.equal(e.derive(b).needsServe, true);
  assert.equal(e.check(b, rallies("a")[0]), "Pick who serves first");
  b = add(b, serve("a"));
  let v = e.derive(b);
  assert.equal(v.serveNote, "0-0-2", "the first serving side has one server only");
  assert.equal(v.timeline[0].text, "Asha serves first, server 2");
  b = add(b, ...rallies("a"));
  assert.equal(call(b), "1-0-2");
  assert.deepEqual([score(b).a, score(b).b], [1, 0]);

  // Asha's only server loses the rally: side out, no point.
  b = add(b, ...rallies("b"));
  v = e.derive(b);
  assert.equal(v.server, "b");
  assert.equal(v.serveNote, "0-1-1", "the server's score comes first");
  assert.deepEqual(v.current, null);
  assert.deepEqual([v.teams.a.score, v.teams.b.score], [1, 0], "only the serving side scores");
  assert.deepEqual(v.notices, ["Side out"]);
  assert.equal(v.timeline[v.timeline.length - 1].text, "Rally to Ravi, side out");
  assert.equal(v.lastAction, "Rally to Ravi, side out");

  b = add(b, ...rallies("b"));
  assert.equal(call(b), "1-1-1");
  assert.deepEqual(e.derive(b).notices, []);
  // Ravi's server 1 loses: his partner serves as server 2.
  b = add(b, ...rallies("a"));
  v = e.derive(b);
  assert.equal(v.server, "b");
  assert.equal(v.serveNote, "1-1-2");
  assert.deepEqual(v.notices, ["Second server"]);
  assert.deepEqual([v.teams.a.score, v.teams.b.score], [1, 1]);
  b = add(b, ...rallies("a"));
  assert.equal(call(b), "1-1-1", "server 2 loses: side out to Asha's server 1");
  b = add(b, ...rallies("a"));
  assert.equal(call(b), "2-1-1");
  assert.deepEqual(e.derive(b).stats, [
    { label: "Points won", a: "2", b: "1" },
    { label: "Rallies won", a: "4", b: "2" },
    { label: "Longest run", a: "1", b: "1" },
  ]);
});

test("side-out: to 11, 2 clear, and only the serving side has game point", () => {
  let b = pointsTo(pointsTo(add(board(), serve("a")), "a", 10), "b", 9);
  let v = e.derive(b);
  assert.equal(v.server, "b");
  assert.deepEqual([v.teams.a.score, v.teams.b.score], [10, 9]);
  assert.deepEqual(v.notices, [], "Asha is receiving, so she cannot win the game on this rally");
  const pad = e.pad(b, v);
  assert.equal(pad.find((p) => p.id === "point-a")?.sub, v.serveNote?.endsWith("-1") ? "Second server" : "Side out");
  // 10-10 on Ravi's serve, then Asha wins rallies until she has the serve.
  b = pointsTo(b, "b", 1);
  while (e.derive(b).server !== "a") b = add(b, ...rallies("a"));
  v = e.derive(b);
  assert.deepEqual([v.teams.a.score, v.teams.b.score], [10, 10]);
  assert.deepEqual(v.notices.filter((n) => n.includes("point")), [], "11-10 does not win");
  b = add(b, ...rallies("a"));
  v = e.derive(b);
  assert.deepEqual([v.teams.a.score, v.teams.b.score], [11, 10]);
  assert.deepEqual(v.notices, ["Game point Asha"]);
  assert.equal(e.pad(b, v).find((p) => p.id === "point-a")?.sub, "Wins the match");
  b = add(b, ...rallies("a"));
  v = e.derive(b);
  assert.equal(v.status, "done");
  assert.deepEqual(v.result, { winner: "a", kind: "win", text: "Asha won 12-10" });
  assert.equal(v.headline, "Asha beat Ravi 12-10");
  assert.equal(e.check(b, rallies("b")[0]), "The match is over. Undo to change the last point");
});

test("best of 3: every game starts 0-0-2, served first by the side that received first", () => {
  let b = pointsTo(add(board({ bestOf: 3 }), serve("a")), "a", 11);
  let v = e.derive(b);
  assert.deepEqual(v.gameJustEnded, { label: "Game 1 to Asha, 11-0", changeEnds: true });
  assert.ok(v.notices.includes("Change ends"));
  assert.equal(v.server, "b", "5.B.1: the first serve changes after each game");
  assert.equal(v.serveNote, "0-0-2");
  assert.equal(v.scoreUnit, "Games");
  assert.equal(v.headline, "Asha leads Ravi 1-0 (11-0)");
  b = add(b, ...rallies("a"));
  v = e.derive(b);
  assert.equal(v.server, "a", "one server at the start: the first lost rally is a side out");
  assert.equal(v.serveNote, "0-0-1");
  assert.equal(v.gameJustEnded, null);
});

test("best of 3: the deciding game changes ends at 6 (8 in games to 15)", () => {
  let b = pointsTo(add(board({ bestOf: 3 }), serve("a")), "a", 11);
  b = pointsTo(b, "a", 5);
  assert.deepEqual(e.derive(b).notices, [], "no change of ends inside game 2");
  // Ravi takes game 2, 11-5.
  b = pointsTo(b, "b", 11);
  let v = e.derive(b);
  assert.deepEqual(v.sets[1], { a: 5, b: 11, winner: "b", tiebreak: null });
  assert.equal(v.currentLabel, "Game 3");
  b = pointsTo(b, "b", 6);
  v = e.derive(b);
  assert.deepEqual(v.notices.filter((n) => n === "Change ends"), ["Change ends"]);
  assert.equal(v.changeEnds, true);
  b = pointsTo(b, "b", 1);
  assert.equal(e.derive(b).changeEnds, false);

  let c = pointsTo(add(board({ bestOf: 3, points: 15 }), serve("a")), "a", 15);
  c = pointsTo(pointsTo(c, "b", 15), "a", 8);
  assert.equal(e.derive(c).changeEnds, true);
});

test("singles: the call is two numbers and a lost rally is a side out", () => {
  let b = add(board({ doubles: false }), serve("a"));
  assert.equal(call(b), "0-0");
  b = add(b, ...rallies("b"));
  let v = e.derive(b);
  assert.equal(v.server, "b");
  assert.deepEqual(v.notices, ["Side out"]);
  b = add(b, ...rallies("b"));
  v = e.derive(b);
  assert.equal(v.serveNote, "1-0");
  assert.deepEqual(e.pad(b, v).map((p) => p.id).includes("fix-number"), false);
});

test("serve corrections: side and server number", () => {
  let b = add(board(), serve("a"), ...rallies("a"));
  assert.equal(call(b), "1-0-2");
  b = add(b, serve("a", 1));
  assert.equal(call(b), "1-0-1");
  assert.equal(e.derive(b).timeline[e.derive(b).timeline.length - 1].text, "Asha to serve, server 1");
  assert.equal(e.check(b, serve("a", 1)), "Asha is serving already");
  assert.equal(e.check(b, serve("a")), "Asha is serving already");
  assert.equal(e.check(b, { type: "serve", side: "a", server: 3 } as unknown as BoardEvent), "Server is 1 or 2");
  b = add(b, serve("b"));
  assert.equal(call(b), "0-1-1");
  const fix = e.pad(b, e.derive(b)).find((p) => p.id === "fix-number");
  assert.deepEqual(fix?.event, { type: "serve", side: "b", server: 2 });
  assert.equal(fix?.sub, "Make it 0-1-2");
  assert.equal(e.check(b, fix!.event), null);

  // At the start of a game a serve pick is the first server: 0-0-2 unless the number is given.
  const s = add(board(), serve("b"));
  assert.equal(call(s), "0-0-2");
  assert.equal(call(add(s, serve("b", 1))), "0-0-1");
  assert.equal(call(add(s, serve("a"))), "0-0-2");

  const single = add(board({ doubles: false }), serve("a"));
  assert.equal(e.check(single, serve("b", 2)), "Server 1 or 2 is only for side-out doubles in pickleball");
  const rally = add(board({ scoring: "rally" }), serve("a"));
  assert.equal(e.check(rally, serve("b", 1)), "Server 1 or 2 is only for side-out doubles in pickleball");
});

test("rally scoring: every rally scores, and a game point is won only on serve", () => {
  const r = { scoring: "rally" as const, points: 21 };
  let b = add(board(r), serve("a"), ...rallies("a"));
  assert.equal(call(b), "1-0");
  b = add(b, ...rallies("b"));
  let v = e.derive(b);
  assert.deepEqual([v.teams.a.score, v.teams.b.score], [1, 1], "the receiving side scores too");
  assert.equal(v.server, "b");
  assert.deepEqual(v.notices, ["Side out"]);

  // Asha 20, Ravi 15 and Ravi serving.
  const at = add(board(r), serve("a"), ...rallies("a".repeat(20) + "b".repeat(15)));
  v = e.derive(at);
  assert.deepEqual([v.teams.a.score, v.teams.b.score], [20, 15]);
  assert.equal(v.server, "b");
  assert.deepEqual(v.notices, [], "Asha cannot win the game on Ravi's serve");
  assert.equal(e.pad(at, v).find((p) => p.id === "point-a")?.sub, "Side out, no point: a game is won on serve");
  b = add(at, ...rallies("a"));
  v = e.derive(b);
  assert.deepEqual([v.teams.a.score, v.teams.b.score], [20, 15], "no point, just the serve");
  assert.equal(v.server, "a");
  assert.equal(v.serveNote, "20-15");
  assert.deepEqual(v.notices, ["Game point Asha", "Side out, no point: a game is won on serve"]);
  b = add(b, ...rallies("a"));
  v = e.derive(b);
  assert.deepEqual(v.result, { winner: "a", kind: "win", text: "Asha won 21-15" });
  assert.equal(v.stats.some((s) => s.label === "Won on serve"), true);
  assert.equal(v.stats.some((s) => s.label === "Rallies won"), false);

  // Without the rule the receiving side wins the game outright.
  const off = add(board({ ...r, gamePointOnServe: false }), serve("a"), ...rallies("a".repeat(20) + "b".repeat(15) + "a"));
  assert.deepEqual(e.derive(off).result, { winner: "a", kind: "win", text: "Asha won 21-15" });
});

test("timeouts: two a game to 11, three to 21", () => {
  const to: BoardEvent = { type: "timeout", side: "b" };
  let b = add(board(), serve("a"), to, to);
  assert.equal(e.check(b, to), "Ravi has used both timeouts this game");
  b = add(board({ scoring: "rally", points: 21 }), serve("a"), to, to, to);
  assert.equal(e.check(b, to), "Ravi has used all 3 timeouts this game");
});

test("end reasons and refusals", () => {
  let v = e.derive(add(board(), { type: "end", reason: "walkover", side: "b" }));
  assert.deepEqual(v.result, { winner: "a", kind: "win", text: "Asha won by walkover" });
  const played = pointsTo(add(board(), serve("a")), "a", 4);
  v = e.derive(add(played, { type: "end", reason: "retired", side: "a" }));
  assert.deepEqual(v.result, { winner: "b", kind: "win", text: "Ravi won, Asha retired (0-4)" });
  v = e.derive(add(played, { type: "end" }));
  assert.deepEqual(v.result, { winner: "a", kind: "win", text: "Asha won, time up (4-0)" });
  assert.equal(e.check(played, { type: "clock", run: true, at: 1 }), "Pickleball has no game clock");
  assert.equal(e.check(played, { type: "period" }), "Games end by themselves in pickleball");
  assert.equal(e.check(played, { type: "rules", rules: { points: 3 } }), "Score is 4-0 already; pick 11");
  assert.equal(e.check(played, { type: "rules", rules: { scoring: "rally", points: 15 } }), null);
});

test("pad: what each won-the-rally tap will do", () => {
  // 0-0-2: a lost rally is a side out.
  let b = add(board(), serve("a"));
  let pad = e.pad(b, e.derive(b));
  assert.deepEqual(pad.slice(0, 2).map((p) => [p.id, p.side, p.label, p.sub, p.event]), [
    ["point-a", "a", "Won the rally", "Point", { type: "point", side: "a" }],
    ["point-b", "b", "Won the rally", "Side out", { type: "point", side: "b" }],
  ]);
  b = add(b, ...rallies("bb"));
  pad = e.pad(b, e.derive(b));
  assert.equal(pad.find((p) => p.id === "point-a")?.sub, "Second server");
  for (const p of pad) {
    if (p.event.type === "point") assert.equal(p.side, p.event.side);
    assert.equal(e.check(b, p.event), null, `${p.id} must be allowed`);
  }
  assert.deepEqual(pad.map((p) => p.id), ["point-a", "point-b", "timeout-a", "timeout-b", "fix-serve", "fix-number", "retire-a", "retire-b", "end", "abandon"]);
});

test("rules changed before the first rally: the game starts as the new rules start it", () => {
  // Set up as singles, Asha serving: "0-0". Switched to doubles before a rally: "0-0-2", and losing the first rally is a side out.
  let b = add(board({ doubles: false }), serve("a"));
  assert.equal(call(b), "0-0");
  b = add(b, { type: "rules", rules: { doubles: true } });
  assert.equal(call(b), "0-0-2");
  b = add(b, ...rallies("b"));
  assert.equal(e.derive(b).server, "b", "side out: the first serving side has one server only");
  assert.equal(call(b), "0-0-1");
});

test("rules changed before the first rally keep a server the scorer picked, and its number", () => {
  // Game 2: the app has Ravi serving; the scorer fixes it to Asha, then changes the points. Asha keeps the serve.
  let b = add(board({ points: 11, bestOf: 3 }), serve("a"));
  b = pointsTo(b, "a", 11);
  assert.equal(e.derive(b).sets.length, 2);
  b = add(b, serve("a"), { type: "rules", rules: { points: 15 } });
  assert.equal(e.derive(b).server, "a", "Change server survives the rules change");
  b = add(b, ...rallies("a"));
  assert.deepEqual(score(b), { a: 1, b: 0, winner: null, tiebreak: null }, "the server's rally is a point, not a side out");
  // Game 1: Fix server number to 1, then a rules change that keeps doubles: still 0-0-1.
  let c = add(board({ doubles: true }), serve("a", 1));
  assert.equal(call(c), "0-0-1");
  c = add(c, { type: "rules", rules: { points: 15 } });
  assert.equal(call(c), "0-0-1");
});
