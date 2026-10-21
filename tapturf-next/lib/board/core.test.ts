// Run with: npm run test:board (compiles lib/board to .test-out/board and runs node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyBoard,
  boardShape,
  boardShareText,
  checkBoard,
  clockMs,
  deriveBoard,
  isBoard,
  newBoard,
  padFor,
  publicBoard,
  readBoardSport,
  sanitizeBoard,
  SPORT_ENGINES,
  SPORT_LIST,
  undoBoard,
} from "./index";
import { BOARD_SPORTS, type Board, type BoardEvent, type BoardSport, type BoardView, type Side, type Tag } from "./types";
import { sportBySlug } from "../sports";

const T0 = 1_760_000_000_000;
const MIN = 60_000;
const SIDES: Side[] = ["a", "b"];
/** The racquet sports, whose singles players are the sides and so carry the side tags. */
const RACQUET: readonly BoardSport[] = ["badminton", "pickleball", "tennis", "table-tennis", "padel"];

/** Apply events, failing the test on any refused one. */
function run(b: Board, ...events: BoardEvent[]): Board {
  for (const e of events) {
    const why = checkBoard(b, e);
    assert.equal(why, null, `${JSON.stringify(e)} refused: ${why}`);
    const next = applyBoard(b, e);
    assert.notEqual(next, b);
    b = next;
  }
  return b;
}

/** The event is refused, with a reason matching re, and applyBoard hands back the same board. */
function refuse(b: Board, e: BoardEvent, re?: RegExp): void {
  const why = checkBoard(b, e);
  assert.ok(why, `${JSON.stringify(e)} was let in`);
  if (re) assert.match(why, re);
  assert.equal(applyBoard(b, e), b);
}

const goal = (side: Side, player?: string, at?: number): BoardEvent => ({ type: "point", side, how: "goal", ...(player ? { player } : {}), ...(at !== undefined ? { at } : {}) });
const kick = (side: Side, scored: boolean): BoardEvent => ({ type: "point", side, how: scored ? "shootout-goal" : "shootout-miss" });
const clock = (run: boolean, at: number, ms?: number): BoardEvent => ({ type: "clock", run, at, ...(ms !== undefined ? { ms } : {}) });
const period = (at?: number): BoardEvent => ({ type: "period", ...(at !== undefined ? { at } : {}) });
const pts = (side: Side, value: number, how?: string, at?: number): BoardEvent => ({ type: "point", side, value, ...(how ? { how } : {}), ...(at !== undefined ? { at } : {}) });
const wire = (x: unknown): unknown => JSON.parse(JSON.stringify(x));

/* ------------------------------------------------------------------ */
/* Football                                                            */
/* ------------------------------------------------------------------ */

const fb = (rules: object = {}) => newBoard("football", { teamA: "Red FC", teamB: "Blue FC", rules }, { id: "bfoot", now: T0 });

test("football: goals, penalties and own goals count for the side tapped", () => {
  let b = fb();
  const pad = padFor(b);
  // A column always means "goal to this team".
  for (const a of pad) if (a.event.type === "point") assert.equal(a.side, a.event.side, a.id);
  const og = pad.find((a) => a.id === "og-a");
  assert.deepEqual([og?.label, og?.sub, og?.event], ["Own goal", "by Blue FC", { type: "point", side: "a", how: "own-goal" }]);
  assert.deepEqual(
    pad.filter((a) => a.side === "a").map((a) => [a.label, a.sub ?? null]),
    [
      ["Goal", null],
      ["Goal", "Penalty"],
      ["Own goal", "by Blue FC"],
    ],
  );

  b = run(b, goal("a", "Ravi"), { type: "point", side: "a", how: "penalty" }, { type: "point", side: "b", how: "own-goal", player: "Ravi" });
  const v = deriveBoard(b);
  assert.deepEqual([v.teams.a.score, v.teams.b.score, v.scoreUnit, v.sportName], [2, 1, "Goals", "Football"]);
  assert.deepEqual(
    v.timeline.map((l) => [l.text, l.side, l.score, l.when, l.tone]),
    [
      ["Goal! Ravi", "a", "1-0", null, "score"],
      ["Penalty goal! Red FC", "a", "2-0", null, "score"],
      ["Own goal by Ravi", "b", "2-1", null, "score"],
    ],
  );
  assert.equal(v.lastAction, "Own goal, for Blue FC");
  // The own goal is listed with the team it counts for.
  assert.deepEqual(v.players, [
    { side: "a", name: "Ravi", text: "1 goal" },
    { side: "b", name: "Ravi", text: "1 goal (og)" },
  ]);
  assert.deepEqual(v.stats[0], { label: "Goals", a: "2", b: "1" });
  refuse(b, { type: "point", side: "a", value: 2 }, /one/);
  refuse(b, { type: "point", side: "a", how: "three" }, /football/);
  refuse(b, { type: "foul", side: "a" });
  refuse(b, { type: "timeout", side: "a" });
  refuse(b, { type: "serve", side: "a" });
});

test("football: minutes from the clock, stoppage time as 20+2', none before the clock runs", () => {
  let b = fb();
  b = run(b, goal("a", "Early"));
  assert.equal(deriveBoard(b).timeline[0].when, null);
  b = undoBoard(b);
  b = run(
    b,
    clock(true, T0),
    goal("a", "Ravi", T0 + 5 * MIN + 10_000),
    goal("a", "Ravi", T0 + 19 * MIN + 59_000),
    goal("b", "Arjun", T0 + 21 * MIN + 30_000),
    period(T0 + 22 * MIN),
  );
  let v = deriveBoard(b);
  assert.deepEqual(v.period, { index: 1, of: 2, label: "Half time", break: true });
  assert.deepEqual(v.clock, { running: false, ms: 0, at: T0 + 22 * MIN, limitMs: 20 * MIN, down: false, baseMs: 20 * MIN });
  assert.equal(v.headline, "Red FC 2-1 Blue FC, half time");
  const T1 = T0 + 30 * MIN;
  b = run(b, clock(true, T1), goal("b", "Arjun", T1 + 30_000), clock(false, T1 + 10 * MIN), goal("a", undefined, T1 + 12 * MIN), clock(true, T1 + 13 * MIN), goal("a", "Ravi", T1 + 24 * MIN + 5_000));
  v = deriveBoard(b);
  // The paused clock reads 10:00 into the 2nd half (31'); after it runs again, 21:05 in is 40+2'.
  assert.deepEqual(
    v.timeline.filter((l) => l.tone === "score").map((l) => l.when),
    ["6'", "20'", "20+2'", "21'", "31'", "40+2'"],
  );
  assert.deepEqual(
    v.timeline.filter((l) => l.tone === "info").map((l) => l.text),
    ["Kick off", "Half time", "2nd half kicks off"],
  );
  assert.deepEqual(v.period, { index: 1, of: 2, label: "2nd half", break: false });
  assert.equal(v.headline, "Red FC 4-2 Blue FC, 2nd half");
  assert.deepEqual(v.players.find((p) => p.name === "Ravi"), { side: "a", name: "Ravi", text: "6', 20', 40+2'" });
});

test("football: halves, half time and full time", () => {
  let b = fb();
  assert.equal(deriveBoard(b).headline, "Red FC vs Blue FC");
  assert.deepEqual(
    padFor(b).filter((a) => a.side === null).map((a) => [a.label, a.tone]),
    [
      ["Kick off", "primary"],
      ["End half", "plain"],
    ],
  );
  b = run(b, goal("a"), period());
  assert.deepEqual(
    padFor(b).filter((a) => a.side === null).map((a) => a.label),
    ["Start 2nd half"],
  );
  refuse(b, period(), /Start the 2nd half/);
  // A goal at half time means the 2nd half started without its clock.
  b = run(b, goal("a"));
  assert.equal(deriveBoard(b).period?.label, "2nd half");
  assert.equal(padFor(b).find((a) => a.id === "period")?.label, "Full time");
  b = run(b, goal("b"), period());
  const v = deriveBoard(b);
  assert.equal(v.status, "done");
  assert.deepEqual(v.result, { winner: "a", kind: "win", text: "Red FC won 2-1" });
  assert.deepEqual(v.period, { index: 2, of: 2, label: "Full time", break: false });
  assert.equal(v.headline, "Red FC 2-1 Blue FC, full time");
  assert.deepEqual(padFor(b), []);
  refuse(b, goal("a"), /over/);
  refuse(b, period(), /over/);
  // A level game with no penalties is a draw. One half only: "Game".
  let one = fb({ halves: 1, halfMinutes: 40 });
  assert.equal(deriveBoard(one).period?.label, "Game");
  assert.equal(padFor(one).find((a) => a.id === "period")?.label, "Full time");
  one = run(one, goal("a"), goal("b"), period());
  assert.deepEqual(deriveBoard(one).result, { winner: null, kind: "draw", text: "Drawn 1-1" });
});

test("football: clock run, pause and set time; period and end stop it", () => {
  let b = fb();
  refuse(b, clock(false, T0), /stopped/);
  b = run(b, clock(true, T0 + 1000));
  refuse(b, clock(true, T0 + 2000), /running/);
  let v = deriveBoard(b);
  assert.deepEqual(v.clock, { running: true, ms: 0, at: T0 + 1000, limitMs: 20 * MIN, down: false, baseMs: 0 });
  assert.equal(clockMs(v, T0 + 61_000), 60_000);
  // A follower slightly behind the scorer never sees the clock go back.
  assert.equal(clockMs(v, T0), 0);
  b = run(b, clock(false, T0 + 61_000));
  v = deriveBoard(b);
  assert.deepEqual([v.clock?.running, v.clock?.ms, clockMs(v, T0 + 10 * MIN)], [false, 60_000, 60_000]);
  assert.equal(v.lastAction, "Clock stopped");
  // Set time while stopped, and while running.
  b = run(b, clock(false, T0 + 70_000, 5 * MIN));
  assert.equal(deriveBoard(b).lastAction, "Clock set to 5:00");
  b = run(b, clock(true, T0 + 80_000), clock(true, T0 + 90_000, 7 * MIN));
  v = deriveBoard(b);
  assert.deepEqual([v.clock?.running, v.clock?.ms, v.clock?.at], [true, 7 * MIN, T0 + 90_000]);
  refuse(b, clock(true, T0 + 100_000, 51 * MIN), /up to 50:00/);
  refuse(b, clock(true, T0 + 100_000, -1));
  // A phone clock stepping back counts as no time, never as negative.
  b = run(b, clock(false, T0 + 80_000));
  assert.equal(deriveBoard(b).clock?.ms, 7 * MIN);
  // The half's end stops a running clock at its own time; the next half starts stopped at 0.
  b = run(b, clock(true, T0 + 100_000), period(T0 + 160_000));
  v = deriveBoard(b);
  assert.deepEqual(v.clock, { running: false, ms: 0, at: T0 + 160_000, limitMs: 20 * MIN, down: false, baseMs: 20 * MIN });
  b = run(b, clock(true, T0 + 200_000), period(T0 + 260_000));
  v = deriveBoard(b);
  assert.deepEqual([v.clock?.running, v.clock?.ms, v.status], [false, 60_000, "done"]);
  refuse(b, clock(true, T0 + 300_000), /over/);
  // An end stops it too.
  b = run(fb(), clock(true, T0), { type: "end", at: T0 + 90_000 });
  assert.deepEqual([deriveBoard(b).clock?.running, deriveBoard(b).clock?.ms], [false, 90_000]);
});

test("football: cards, a second yellow is a red", () => {
  let b = fb();
  refuse(b, { type: "card", side: "b", color: "yellow" }, /off/);
  assert.equal(padFor(b).some((a) => a.event.type === "card"), false);
  b = run(b, { type: "rules", rules: { cards: true } });
  assert.deepEqual(
    padFor(b).filter((a) => a.event.type === "card" && a.side === "b").map((a) => [a.label, a.tone, a.ask]),
    [
      ["Yellow", "warn", "player"],
      ["Red", "danger", "player"],
    ],
  );
  b = run(b, clock(true, T0), { type: "card", side: "b", color: "yellow", player: "Arjun", at: T0 + 3 * MIN }, { type: "card", side: "b", color: "yellow", player: "Arjun", at: T0 + 15 * MIN });
  let v = deriveBoard(b);
  assert.deepEqual(
    v.timeline.filter((l) => l.tone === "card").map((l) => [l.text, l.when]),
    [
      ["Yellow card, Arjun", "4'"],
      ["Second yellow, Arjun. Sent off", "16'"],
    ],
  );
  assert.equal(v.lastAction, "Second yellow, Blue FC");
  assert.deepEqual(v.players, [{ side: "b", name: "Arjun", text: "Yellow card 4', second yellow 16'" }]);
  refuse(b, { type: "card", side: "b", color: "yellow", player: "arjun" }, /sent off/);
  refuse(b, { type: "card", side: "b", color: "red", player: "Arjun" }, /sent off/);
  b = run(b, { type: "card", side: "a", color: "red" }, { type: "card", side: "b", color: "yellow", player: "Kiran" });
  v = deriveBoard(b);
  assert.deepEqual(
    v.stats.filter((s) => s.label.endsWith("cards")),
    [
      { label: "Yellow cards", a: "0", b: "3" },
      { label: "Red cards", a: "1", b: "1" },
    ],
  );
});

/** Two halves played to a level score, ready for penalties. */
function levelAtFullTime(rules: object): Board {
  return run(fb({ penalties: true, ...rules }), goal("a"), goal("b"), period(), clock(true, T0 + MIN), period(T0 + 2 * MIN));
}

test("football: shootout, kicks alternate and it stops once one side cannot catch up", () => {
  let b = run(fb({ penalties: true }), goal("a"));
  refuse(b, kick("a", true), /after full time/);
  b = levelAtFullTime({});
  let v = deriveBoard(b);
  assert.equal(v.status, "live");
  assert.deepEqual([v.current, v.currentLabel, v.period?.label, v.period?.break], [{ a: "0", b: "0" }, "Penalties", "Full time", true]);
  assert.deepEqual(v.notices, ["Level at full time. Penalties"]);
  assert.equal(v.timeline.at(-1)?.text, "Full time. Penalties next");
  refuse(b, goal("a"), /penalties/);
  refuse(b, period(), /Full time already/);
  refuse(b, clock(true, T0 + 3 * MIN), /over/);
  assert.deepEqual(
    padFor(b).filter((a) => a.side === "a").map((a) => [a.label, a.event.type === "point" ? a.event.how : null, a.disabled ?? null]),
    [
      ["Scored", "shootout-goal", null],
      ["Missed", "shootout-miss", null],
    ],
  );

  b = run(b, kick("a", true));
  // IFAB Law 10: kicks alternate.
  refuse(b, kick("a", true), /Blue FC take the next kick/);
  assert.ok(padFor(b).find((a) => a.id === "kick-in-a")?.disabled);
  assert.deepEqual(deriveBoard(b).notices, ["Blue FC to kick"]);
  b = run(b, kick("b", false), kick("a", true), kick("b", false), kick("a", true));
  // 3-0 with Blue FC on 2 kicks: three left, so it goes on.
  assert.equal(deriveBoard(b).status, "live");
  b = run(b, kick("b", false));
  v = deriveBoard(b);
  assert.equal(v.status, "done");
  assert.deepEqual([v.teams.a.score, v.teams.b.score], [1, 1]);
  assert.deepEqual(v.result, { winner: "a", kind: "win", text: "Red FC won 3-0 on penalties" });
  assert.deepEqual(v.current, { a: "3", b: "0" });
  assert.equal(v.headline, "Red FC 1-1 Blue FC, Red FC won 3-0 on penalties");
  assert.deepEqual(v.stats.find((s) => s.label === "Penalties"), { label: "Penalties", a: "3 (3)", b: "0 (3)" });
  assert.deepEqual(boardShape(v), { status: "done", innings: [null, null, null] });
  refuse(b, kick("a", true), /over/);
});

test("football: shootout sudden death, the side that kicked first keeps kicking first", () => {
  let b = levelAtFullTime({ shootoutKicks: 3 });
  b = run(b, kick("b", true), kick("a", true), kick("b", true), kick("a", true), kick("b", true), kick("a", true));
  let v = deriveBoard(b);
  assert.equal(v.status, "live");
  assert.deepEqual(v.notices, ["Sudden death", "Blue FC to kick"]);
  refuse(b, kick("a", true), /Blue FC take the next kick/);
  b = run(b, kick("b", true));
  refuse(b, kick("b", true), /Red FC take the next kick/);
  // Red FC still have their kick in the round.
  assert.equal(deriveBoard(b).status, "live");
  b = run(b, kick("a", false));
  v = deriveBoard(b);
  assert.deepEqual(v.result, { winner: "b", kind: "win", text: "Blue FC won 4-3 on penalties" });
  assert.deepEqual(
    v.timeline.slice(-2).map((l) => [l.text, l.score, l.period]),
    [
      ["Penalty scored", "3-4", 2],
      ["Penalty missed", "3-4", 2],
    ],
  );
});

test("football: end reasons, walkover with no events", () => {
  let b = run(fb(), { type: "end", reason: "walkover", side: "b" });
  let v = deriveBoard(b);
  assert.deepEqual([v.status, v.result, v.headline], ["done", { winner: "a", kind: "win", text: "Red FC won by walkover" }, "Red FC won by walkover"]);
  refuse(fb(), { type: "end", reason: "retired" }, /Pick the team/);
  // Abandoned keeps no side.
  b = run(fb(), goal("a"), { type: "end", reason: "abandoned", side: "a" });
  assert.deepEqual(b.events.at(-1), { type: "end", reason: "abandoned" });
  v = deriveBoard(b);
  assert.deepEqual([v.result, v.headline, v.period?.label], [{ winner: null, kind: "abandoned", text: "Abandoned" }, "Red FC 1-0 Blue FC, abandoned", "Abandoned"]);
  b = run(fb(), goal("a"), { type: "end", reason: "conceded", side: "a" });
  v = deriveBoard(b);
  assert.deepEqual([v.result?.text, v.result?.winner, v.headline], ["Blue FC won, Red FC conceded", "b", "Red FC 1-0 Blue FC, Red FC conceded"]);
  // A plain end is time up: on the score.
  assert.deepEqual(deriveBoard(run(fb(), goal("a"), goal("b"), { type: "end" })).result, { winner: null, kind: "draw", text: "Drawn 1-1" });
  b = run(fb(), goal("a"), goal("a"), goal("b"), { type: "end" });
  assert.deepEqual(deriveBoard(b).result, { winner: "a", kind: "win", text: "Red FC won 2-1" });
  refuse(b, goal("a"), /over/);
  refuse(b, { type: "end" }, /over/);
  // Names can still be fixed after the match.
  b = run(b, { type: "rename", side: "a", name: "Red Lions" });
  assert.equal(deriveBoard(b).result?.text, "Red Lions won 2-1");
});

test("football: a rules change applies from there on", () => {
  let b = run(fb(), clock(true, T0), { type: "rules", rules: { halfMinutes: 25 }, at: T0 + MIN });
  assert.deepEqual(b.events.at(-1), { type: "rules", rules: { halfMinutes: 25 }, at: T0 + MIN });
  let v = deriveBoard(b);
  assert.equal((v.setup.rules as { halfMinutes: number }).halfMinutes, 25);
  assert.equal(v.clock?.limitMs, 25 * MIN);
  // 22 minutes in is no longer stoppage time.
  b = run(b, goal("a", undefined, T0 + 22 * MIN));
  assert.equal(deriveBoard(b).timeline.at(-1)?.when, "23'");
  b = run(b, period(T0 + 26 * MIN), clock(true, T0 + 30 * MIN));
  refuse(b, { type: "rules", rules: { halves: 1 } }, /2nd half is on/);
  // Rules are cleaned on the way in: unknown keys dropped, numbers clamped.
  b = run(b, { type: "rules", rules: { halfMinutes: 99, junk: 1 } as object });
  assert.deepEqual(b.events.at(-1), { type: "rules", rules: { halfMinutes: 60 } });
  b = run(b, period());
  refuse(b, { type: "rules", rules: { cards: true } }, /over/);
  // A draw at full time can still go to penalties.
  let d = run(fb(), period(), clock(true, T0), period(T0 + MIN));
  assert.equal(deriveBoard(d).result?.kind, "draw");
  d = run(d, { type: "rules", rules: { penalties: true } });
  v = deriveBoard(d);
  assert.deepEqual([v.status, v.currentLabel], ["live", "Penalties"]);
  d = run(d, kick("a", true));
  refuse(d, { type: "rules", rules: { shootoutKicks: 3 } }, /started/);
});

/* ------------------------------------------------------------------ */
/* Basketball                                                          */
/* ------------------------------------------------------------------ */

const bb = (rules: object = {}) => newBoard("basketball", { teamA: "Hoopers", teamB: "Dunkers", rules }, { id: "bball", now: T0 });
/** Run the current period's clock for a moment, then end it. */
const playPeriod = (b: Board, t: number, ...events: BoardEvent[]) => run(b, clock(true, t), ...events, period(t + 30_000));

test("basketball: 2s and 3s", () => {
  let b = bb();
  assert.deepEqual(
    padFor(b).filter((a) => a.side === "a").map((a) => [a.id, a.label, a.sub ?? null, a.tone]),
    [
      ["two-a", "+2", null, "primary"],
      ["three-a", "+3", null, "plain"],
      ["ft-a", "+1", "Free throw", "plain"],
      ["foul-a", "Foul", "0 team fouls", "warn"],
      ["timeout-a", "Timeout", null, "plain"],
    ],
  );
  b = run(b, pts("a", 2, "two", T0), pts("a", 3, "three"), pts("a", 1, "free-throw", T0 + 5000), pts("b", 2));
  const v = deriveBoard(b);
  assert.deepEqual([v.teams.a.score, v.teams.b.score, v.scoreUnit], [6, 2, "Points"]);
  assert.deepEqual(
    v.stats.filter((s) => /pointers|Free/.test(s.label)),
    [
      { label: "Free throws", a: "1", b: "0" },
      { label: "2 pointers", a: "1", b: "1" },
      { label: "3 pointers", a: "1", b: "0" },
    ],
  );
  assert.deepEqual(
    v.timeline.map((l) => [l.text, l.when]),
    [
      ["+2, Hoopers", "Q1 10:00"],
      ["+3, Hoopers", "Q1 10:00"],
      ["Free throw, Hoopers", "Q1 10:00"],
      ["+2, Dunkers", "Q1 10:00"],
    ],
  );
  refuse(b, pts("a", 3, "two"), /count/);
  refuse(b, pts("a", 4), /1, 2 or 3/);
  refuse(b, pts("a", 1, "inside"));
  refuse(b, { type: "card", side: "a", color: "red" });
});

test("basketball: 1s and 2s (3x3)", () => {
  const preset = SPORT_ENGINES.basketball.presets[0].options.find((o: { label: string }) => o.label.startsWith("3x3"));
  assert.ok(preset);
  let b = bb(preset.rules);
  assert.deepEqual(
    padFor(b).filter((a) => a.side === "b" && a.event.type === "point").map((a) => [a.label, a.sub]),
    [
      ["+1", "Inside"],
      ["+2", "Outside"],
      ["+1", "Free throw"],
    ],
  );
  b = run(b, pts("b", 1, "inside"), pts("b", 2, "outside"), pts("b", 1));
  assert.deepEqual(deriveBoard(b).teams.b.score, 4);
  refuse(b, pts("b", 3), /1 or 2/);
  refuse(b, pts("b", 2, "two"));
  // One period: the clock reads without a label.
  b = run(b, clock(true, T0), pts("a", 1, "inside", T0 + 2 * MIN));
  assert.equal(deriveBoard(b).timeline.at(-1)?.when, "8:00");
  assert.equal(deriveBoard(b).period?.label, "Game");
});

test("basketball: quarters on a count-down clock", () => {
  let b = bb();
  b = run(b, clock(true, T0));
  let v = deriveBoard(b);
  assert.deepEqual(v.clock, { running: true, ms: 10 * MIN, at: T0, limitMs: 10 * MIN, down: true, baseMs: 0 });
  assert.equal(clockMs(v, T0 + 61_000), 10 * MIN - 61_000);
  assert.equal(clockMs(v, T0 + 11 * MIN), 0);
  b = run(b, pts("a", 2, "two", T0 + 30_000), clock(false, T0 + 60_000));
  v = deriveBoard(b);
  assert.deepEqual([v.timeline[0].when, v.clock?.ms, clockMs(v, T0 + 5 * MIN)], ["Q1 9:30", 9 * MIN, 9 * MIN]);
  b = run(b, clock(false, T0 + 70_000, 7 * MIN + 42_000));
  assert.equal(deriveBoard(b).lastAction, "Clock set to 7:42");
  refuse(b, clock(false, T0 + 70_000, 11 * MIN), /up to 10:00/);
  // Run out the clock: it cannot start again at 0:00.
  b = run(b, clock(true, T0 + 80_000), clock(false, T0 + 20 * MIN));
  assert.equal(deriveBoard(b).clock?.ms, 0);
  refuse(b, clock(true, T0 + 21 * MIN), /No time left/);
  b = run(b, period(T0 + 21 * MIN));
  v = deriveBoard(b);
  assert.deepEqual(v.period, { index: 1, of: 4, label: "End of Q1", break: true });
  assert.deepEqual([v.clock?.ms, v.clock?.running], [10 * MIN, false]);
  refuse(b, period(), /Start Q2 first/);
  assert.equal(padFor(b).find((a) => a.id === "clock")?.label, "Start Q2");
  b = playPeriod(b, T0 + 22 * MIN, pts("b", 3, "three"));
  assert.deepEqual(deriveBoard(b).period, { index: 2, of: 4, label: "Half time", break: true });
  assert.equal(deriveBoard(b).headline, "Hoopers 2-3 Dunkers, half time");
  b = playPeriod(b, T0 + 40 * MIN);
  b = run(b, clock(true, T0 + 60 * MIN));
  v = deriveBoard(b);
  assert.deepEqual([v.period?.label, v.headline], ["Q4", "Hoopers 2-3 Dunkers, Q4"]);
  assert.deepEqual(
    v.stats.filter((s) => /^Q\d$/.test(s.label)).map((s) => [s.label, s.a, s.b]),
    [
      ["Q1", "2", "0"],
      ["Q2", "0", "3"],
      ["Q3", "0", "0"],
      ["Q4", "0", "0"],
    ],
  );
  b = run(b, period(T0 + 61 * MIN));
  v = deriveBoard(b);
  assert.deepEqual([v.status, v.result?.text, v.headline], ["done", "Dunkers won 3-2", "Hoopers 2-3 Dunkers, full time"]);
});

test("basketball: overtime is 5 minutes and team fouls carry over from the 4th", () => {
  let b = bb();
  b = playPeriod(b, T0, pts("a", 2));
  b = playPeriod(b, T0 + 15 * MIN);
  b = playPeriod(b, T0 + 30 * MIN);
  b = playPeriod(b, T0 + 45 * MIN, pts("b", 2), { type: "foul", side: "a" }, { type: "foul", side: "a" }, { type: "foul", side: "a" });
  let v = deriveBoard(b);
  assert.equal(v.status, "live");
  assert.deepEqual(v.period, { index: 4, of: 4, label: "Overtime next", break: true });
  assert.deepEqual([v.clock?.ms, v.clock?.limitMs], [5 * MIN, 5 * MIN]);
  assert.equal(v.timeline.at(-1)?.text, "End of Q4. Level, overtime next");
  // FIBA Art. 41.1.3: the 3 fouls of the 4th still count.
  assert.deepEqual(v.stats.find((s) => s.label.startsWith("Team fouls")), { label: "Team fouls, overtime", a: "3", b: "0" });
  assert.deepEqual(v.notices, []);
  b = run(b, clock(true, T0 + 60 * MIN), { type: "foul", side: "a", player: "Ravi" });
  v = deriveBoard(b);
  assert.equal(v.period?.label, "OT");
  assert.deepEqual(v.notices, ["Dunkers in the bonus"]);
  refuse(b, clock(true, T0 + 60 * MIN, 6 * MIN), /up to 5:00/);
  b = run(b, pts("a", 3, "three", T0 + 61 * MIN), period(T0 + 65 * MIN));
  v = deriveBoard(b);
  assert.deepEqual(v.result, { winner: "a", kind: "win", text: "Hoopers won 5-2 after overtime" });
  assert.equal(v.headline, "Hoopers 5-2 Dunkers, after overtime");
  assert.deepEqual(
    v.stats.filter((s) => /^(Q\d|OT)$/.test(s.label)).map((s) => s.label),
    ["Q1", "Q2", "Q3", "Q4", "OT"],
  );
  assert.deepEqual(v.players, [{ side: "a", name: "Ravi", text: "1 foul" }]);
});

test("basketball: the bonus shows once team fouls reach the limit, and resets each quarter", () => {
  let b = run(bb(), clock(true, T0), { type: "foul", side: "a" }, { type: "foul", side: "a" }, { type: "foul", side: "a" });
  assert.deepEqual(deriveBoard(b).notices, []);
  b = run(b, { type: "foul", side: "a" });
  // FIBA Art. 41.1.1: after 4 team fouls in a quarter, the 5th is shot.
  assert.deepEqual(deriveBoard(b).notices, ["Dunkers in the bonus"]);
  assert.equal(padFor(b).find((a) => a.id === "foul-a")?.sub, "4 team fouls");
  b = run(b, period(T0 + MIN), clock(true, T0 + 2 * MIN));
  const v = deriveBoard(b);
  assert.deepEqual(v.notices, []);
  assert.deepEqual(v.stats.find((s) => s.label === "Fouls"), { label: "Fouls", a: "4", b: "0" });
  assert.deepEqual(v.stats.find((s) => s.label.startsWith("Team fouls")), { label: "Team fouls, Q2", a: "0", b: "0" });
});

test("basketball: pickup to 21, win by 2, no clock", () => {
  let b = bb({ periods: 1, clock: false, target: 21, winBy: 2 });
  let v = deriveBoard(b);
  assert.deepEqual([v.clock, v.period], [null, null]);
  assert.deepEqual(
    padFor(b).filter((a) => a.side === null),
    [],
  );
  refuse(b, clock(true, T0), /off/);
  for (let i = 0; i < 10; i++) b = run(b, pts("a", 2), pts("b", 2));
  b = run(b, pts("a", 1), pts("b", 1), pts("a", 1));
  assert.equal(deriveBoard(b).status, "live");
  b = run(b, pts("a", 1));
  v = deriveBoard(b);
  assert.deepEqual([v.status, v.result?.text, v.headline], ["done", "Hoopers won 23-21", "Hoopers 23-21 Dunkers, full time"]);
  refuse(b, pts("b", 2), /over/);
  // A target the score has passed already is refused.
  const c = run(bb(), pts("a", 2), pts("a", 2), pts("a", 2), pts("a", 2), pts("a", 2), pts("a", 3), pts("a", 3), pts("b", 2), pts("b", 2), pts("b", 2), pts("b", 3), pts("b", 3));
  refuse(c, { type: "rules", rules: { target: 15 } }, /Score is 16-12 already; pick more than 16/);
  run(c, { type: "rules", rules: { target: 21 } });
});

test("basketball: 3x3 overtime goes to the first side to score 2", () => {
  const preset = SPORT_ENGINES.basketball.presets[0].options.find((o: { label: string }) => o.label.startsWith("3x3"));
  let b = run(bb(preset?.rules), clock(true, T0), pts("a", 2, "outside"), pts("b", 2, "outside"), period(T0 + 10 * MIN));
  assert.equal(deriveBoard(b).period?.label, "Overtime next");
  b = run(b, clock(true, T0 + 11 * MIN), pts("a", 1, "inside"));
  assert.deepEqual(deriveBoard(b).notices, ["Overtime: first to score 2 wins"]);
  b = run(b, pts("b", 1, "inside"));
  assert.equal(deriveBoard(b).status, "live");
  // Hoopers' 2nd point of overtime wins it, though they lead by one.
  b = run(b, pts("a", 1, "free-throw"));
  assert.equal(deriveBoard(b).result?.text, "Hoopers won 4-3 after overtime");
});

test("basketball: timeouts", () => {
  const b = run(bb(), { type: "timeout", side: "a" }, { type: "timeout", side: "a" }, { type: "timeout", side: "b" });
  const v = deriveBoard(b);
  assert.deepEqual(v.stats.find((s) => s.label === "Timeouts"), { label: "Timeouts", a: "2", b: "1" });
  assert.deepEqual(
    v.timeline.map((l) => [l.text, l.side, l.tone]),
    [
      ["Timeout, Hoopers", "a", "info"],
      ["Timeout, Hoopers", "a", "info"],
      ["Timeout, Dunkers", "b", "info"],
    ],
  );
  assert.equal(v.lastAction, "Timeout, Dunkers");
});

/* ------------------------------------------------------------------ */
/* Other                                                               */
/* ------------------------------------------------------------------ */

const ot = (rules: object = {}) => newBoard("other", { teamA: "Tigers", teamB: "Lions", rules }, { id: "bother", now: T0 });

test("other: first to a target", () => {
  let b = ot({ name: "  Kabaddi ", target: 5 });
  let v = deriveBoard(b);
  assert.deepEqual([v.sportName, v.period, v.clock], ["Kabaddi", null, null]);
  b = run(b, pts("a", 1), pts("a", 1), pts("b", 1), pts("a", 1), pts("b", 1), pts("a", 1));
  assert.deepEqual(deriveBoard(b).notices, ["Tigers need 1 to win"]);
  b = run(b, { type: "point", side: "a" });
  v = deriveBoard(b);
  assert.deepEqual([v.status, v.result, v.headline], ["done", { winner: "a", kind: "win", text: "Tigers won 5-2" }, "Tigers beat Lions 5-2"]);
  refuse(b, pts("b", 1), /over/);
  refuse(ot(), clock(true, T0));
  refuse(ot(), period(), /no periods/);
});

test("other: periods", () => {
  let b = ot({ periods: 2 });
  assert.equal(padFor(b).find((a) => a.id === "period")?.label, "End 1st half");
  b = run(b, pts("a", 1), period());
  let v = deriveBoard(b);
  assert.deepEqual(v.period, { index: 1, of: 2, label: "Half time", break: true });
  assert.equal(v.headline, "Tigers 1-0 Lions, half time");
  assert.equal(padFor(b).find((a) => a.id === "period")?.label, "End game");
  b = run(b, pts("b", 1), period());
  v = deriveBoard(b);
  assert.deepEqual([v.status, v.result?.kind, v.result?.text, v.headline], ["done", "draw", "Drawn 1-1", "Tigers 1-1 Lions, drawn"]);
  assert.deepEqual(
    v.stats.map((s) => [s.label, s.a, s.b]),
    [
      ["Points", "1", "1"],
      ["1st half", "1", "0"],
      ["2nd half", "0", "1"],
    ],
  );
});

test("other: point values", () => {
  let b = ot({ values: [1, 2, 3, 2, 0, 7.5] });
  assert.deepEqual((deriveBoard(b).setup.rules as { values: number[] }).values, [1, 2, 3]);
  assert.deepEqual(
    padFor(b).filter((a) => a.side === "a").map((a) => [a.label, a.tone]),
    [
      ["+1", "primary"],
      ["+2", "plain"],
      ["+3", "plain"],
    ],
  );
  b = run(b, pts("a", 3), pts("b", 2), { type: "point", side: "b" });
  assert.deepEqual([deriveBoard(b).teams.a.score, deriveBoard(b).teams.b.score], [3, 3]);
  refuse(b, pts("a", 5), /1, 2, 3/);
  const twos = ot({ values: [2] });
  refuse(twos, { type: "point", side: "a" });
  assert.equal(deriveBoard(ot()).sportName, "Game");
});

/* ------------------------------------------------------------------ */
/* The public API                                                      */
/* ------------------------------------------------------------------ */

test("newBoard: ids like newMatch's, names and first serve", () => {
  const b = newBoard("football");
  assert.match(b.id, /^b[0-9a-z]+$/);
  assert.equal(b.id.length, 1 + Date.now().toString(36).length + 5);
  assert.notEqual(newBoard("football").id, b.id);
  assert.deepEqual([b.v, b.kind, b.setup.teamA, b.setup.teamB, b.setup.title, b.events], [1, "board", "Team A", "Team B", "", []]);
  const named = newBoard("football", { teamA: "  Red\n  FC ", teamB: "B".repeat(40), title: "T".repeat(60), venue: "Kothrud Turf" }, { id: "x", now: 5 });
  assert.deepEqual([named.setup.teamA, named.setup.teamB.length, named.setup.title.length, named.setup.venue, named.createdAt], ["Red FC", 32, 48, "Kothrud Turf", 5]);
  // Football has no serve; a racquet sport takes it as the first event.
  assert.deepEqual(newBoard("football", { firstServe: "b" }).events, []);
  assert.deepEqual(newBoard("badminton", { firstServe: "b" }).events, [{ type: "serve", side: "b" }]);
  assert.equal(newBoard("cricket" as BoardSport).sport, "other");
  for (const s of BOARD_SPORTS) {
    assert.equal(SPORT_ENGINES[s].sport, s);
    const fresh = newBoard(s, {}, { id: "b1", now: T0 });
    assert.deepEqual(sanitizeBoard(wire(fresh)), fresh, s);
    assert.equal(deriveBoard(fresh).status, "live", s);
  }
});

test("SPORT_LIST: every sport once, named and drawn as lib/sports.ts has them", () => {
  assert.deepEqual(
    SPORT_LIST.map((s) => s.sport),
    [...BOARD_SPORTS],
  );
  for (const s of SPORT_LIST) {
    if (s.sport === "other") continue;
    const page = sportBySlug(s.sport);
    assert.deepEqual([s.label, s.icon], [page?.name, page?.icon], s.sport);
  }
});

test("undoBoard drops the last event", () => {
  const b = run(fb(), goal("a"), goal("b"));
  assert.deepEqual(undoBoard(b).events, [{ type: "point", side: "a", how: "goal" }]);
  const empty = fb();
  assert.equal(undoBoard(empty), empty);
});

test("applyBoard: names are cleaned, and an event that would change on the way in is refused", () => {
  const b = run(fb(), { type: "point", side: "a", how: "goal", player: "  Ravi \n Kumar  " }, { type: "rename", side: "b", name: " Blue   Lions " });
  assert.deepEqual(b.events, [
    { type: "point", side: "a", how: "goal", player: "Ravi Kumar" },
    { type: "rename", side: "b", name: "Blue Lions" },
  ]);
  refuse(b, { type: "point", side: "a", value: 150 });
  refuse(b, { type: "point", side: "a", how: "GOAL!" });
  refuse(b, { type: "point", side: "c" as Side });
  refuse(b, { type: "rename", side: "a", name: "   " });
  refuse(b, { type: "end", reason: "lost" as "retired", side: "a" });
  refuse(b, { type: "nope" } as unknown as BoardEvent, /Unknown/);
  refuse(b, { type: "clock", run: true, at: Number.NaN });
  // A set time past what a stored board keeps (a period plus 30 minutes) never goes in.
  refuse(bb(), clock(false, T0, 41 * MIN));
});

test("clockMs: up and down, running and stopped", () => {
  const up = deriveBoard(run(fb(), clock(true, T0)));
  assert.deepEqual([clockMs(up, T0 + 90_000), clockMs(up, T0 - 5_000)], [90_000, 0]);
  const down = deriveBoard(run(bb(), clock(true, T0)));
  assert.deepEqual([clockMs(down, T0 + 90_000), clockMs(down, T0 + 60 * MIN)], [10 * MIN - 90_000, 0]);
  const stopped = deriveBoard(run(bb(), clock(true, T0), clock(false, T0 + MIN)));
  assert.equal(clockMs(stopped, T0 + 30 * MIN), 9 * MIN);
  assert.equal(clockMs(deriveBoard(ot()), T0), null);
});

test("isBoard and sanitizeBoard tell a board from anything else", () => {
  const b = run(fb(), goal("a"));
  assert.equal(isBoard(b), true);
  for (const x of [null, undefined, 0, "", [], [b], { ...b, kind: "Board" }, { ...b, kind: undefined }, JSON.stringify(b)]) {
    assert.equal(isBoard(x), false, String(x));
    assert.equal(sanitizeBoard(x), null, String(x));
  }
  // A cricket match has the same v, setup and events, but no kind.
  const cricket = { v: 1, id: "mabc", createdAt: T0, setup: { teamA: "Titans", teamB: "Strikers", overs: 6 }, events: [{ type: "ball", runs: 4, extra: "none" }] };
  assert.equal(isBoard(cricket), false);
  assert.equal(sanitizeBoard(cricket), null);
  assert.equal(sanitizeBoard({ ...cricket, kind: "match" }), null);
  for (const v of [0, 2, "1"]) assert.equal(sanitizeBoard({ ...b, v }), null, `v ${v}`);
  for (const sport of ["cricket", "Football", null]) assert.equal(sanitizeBoard({ ...b, sport }), null, `sport ${sport}`);
  for (const setup of [null, "x", []]) assert.equal(sanitizeBoard({ ...b, setup }), null);
  for (const events of [null, {}, "[]"]) assert.equal(sanitizeBoard({ ...b, events }), null);
  const periods = (n: number) => ({ ...b, events: Array.from({ length: n }, () => ({ type: "period" })) });
  assert.equal(sanitizeBoard(periods(3001)), null);
  assert.equal(sanitizeBoard(periods(3000))?.events.length, 3000);
  assert.equal(sanitizeBoard(periods(100_000)), null);
});

test("sanitizeBoard: extra keys dropped, huge strings cut, bad fields out", () => {
  const b = run(fb(), clock(true, T0), goal("a", "Ravi", T0 + MIN));
  const big = "x".repeat(300_000);
  const s = sanitizeBoard({
    ...(wire(b) as object),
    extra: big,
    id: "not an id!",
    createdAt: Infinity,
    sentAt: T0 + 5,
    setup: { teamA: big, teamB: "", title: big, venue: big, rules: { halves: 9, halfMinutes: "20", cards: "yes", junk: big }, evil: 1 },
    events: [
      { type: "point", side: "a", how: "goal", player: big, extra: big, at: T0 },
      { type: "point", side: "a", how: big, value: 1e9, at: Number.NaN },
      { type: "point", side: "c" },
      { type: "card", side: "a", color: "green" },
      { type: "rename", side: "b", name: big },
      { type: "rename", side: "b", name: "  " },
      { type: "rules", rules: { halfMinutes: 25, junk: big, cards: "yes" } },
      { type: "rules", rules: "x" },
      { type: "clock", run: true, at: Infinity },
      { type: "clock", run: "yes", at: T0 },
      { type: "clock", run: false, at: T0 + 1, ms: 1e12 },
      { type: "clock", run: false, at: T0 + 2, ms: 20 * MIN },
      { type: "serve", side: "a", server: 3 },
      { type: "end", reason: "abandoned", side: "a" },
      { type: "end", reason: "walkover", side: "b", extra: 1 },
      { type: "end", reason: "lost" },
      { type: "nope" },
      null,
      "point",
      JSON.parse('{"type": "period", "__proto__": {"polluted": true}}'),
    ],
  });
  assert.ok(s);
  assert.deepEqual(Object.keys(s).sort(), ["createdAt", "events", "id", "kind", "sentAt", "setup", "sport", "v"]);
  assert.deepEqual([s.id, s.createdAt, s.sentAt], ["board", 0, T0 + 5]);
  assert.deepEqual(Object.keys(s.setup).sort(), ["rules", "teamA", "teamB", "title", "venue"]);
  assert.deepEqual([s.setup.teamA.length, s.setup.teamB, s.setup.title.length, s.setup.venue.length], [32, "Team B", 48, 48]);
  assert.deepEqual(s.setup.rules, { halves: 2, halfMinutes: 20, cards: false, penalties: false, shootoutKicks: 5 });
  assert.deepEqual(s.events, [
    { type: "point", side: "a", how: "goal", player: "x".repeat(40), at: T0 },
    { type: "point", side: "a" },
    { type: "rename", side: "b", name: "x".repeat(32) },
    { type: "rules", rules: { halfMinutes: 25, cards: false } },
    { type: "clock", run: false, at: T0 + 1 },
    { type: "clock", run: false, at: T0 + 2, ms: 20 * MIN },
    { type: "serve", side: "a" },
    { type: "end", reason: "abandoned" },
    { type: "end", reason: "walkover", side: "b" },
    { type: "end" },
    { type: "period" },
  ]);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.ok(JSON.stringify(s).length < 1500, `${JSON.stringify(s).length} chars`);
  // A non-finite sentAt is dropped; the rest still reads.
  assert.equal("sentAt" in (sanitizeBoard({ ...b, sentAt: Infinity }) ?? {}), false);
  assert.equal(deriveBoard(s).sport, "football");
});

/** Deterministic random numbers. */
function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

/**
 * A random board with every kind of event the scorer makes, built
 * through the public API: mostly taps on the pad, plus clock sets, rule
 * changes, renames, serves, ends and undos. Refused events are skipped.
 */
function anyBoard(sport: BoardSport, seed: number, seen: Map<string, number>): Board {
  const r = rng(seed * 7919 + sport.length);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const chance = (p: number) => r() < p;
  const NAMES = ["Ravi", "  Arjun  K ", "Asha", "Sameer\tR", "P".repeat(45), "Kiran"];
  const engine = SPORT_ENGINES[sport];
  const rules = Object.assign({}, ...engine.presets.map((p: { options: { rules: object }[] }) => (chance(0.6) ? pick(p.options).rules : {})));
  const jitter = (v: unknown): unknown =>
    typeof v === "number" ? v + pick([-2, -1, 1, 2, 5]) : typeof v === "boolean" ? !v : v === null ? pick([11, 15, 21]) : Array.isArray(v) ? pick([[1], [1, 2, 3], [2]]) : typeof v === "string" ? pick(["Kabaddi", "  Ultimate   frisbee ", v]) : v;
  // Tags come from their own stream, so the boards' events are the ones they were before tags.
  const rt = rng(seed * 104_729 + sport.length + 3);
  const TAGS: Tag[] = [{ u: "ravi" }, { u: "asha_k" }, { u: "arjun99" }];
  const someTag = () => TAGS[Math.floor(rt() * TAGS.length)];
  const playerTag = () => (rt() < 0.5 ? { tag: someTag() } : {});
  // Racquet renames: keep, clear or set the side's tag. Other sports take no side tags.
  const renameTag = () => (!RACQUET.includes(sport) ? {} : ((x) => (x < 0.4 ? {} : x < 0.6 ? { tag: null } : { tag: someTag() }))(rt()));
  const setupTags = rt() < 0.5 ? { tags: { a: someTag(), ...(rt() < 0.5 ? { b: someTag() } : {}) } } : {};
  let b = newBoard(
    sport,
    { teamA: pick(["Red FC", " Kothrud   Kings ", "", "x".repeat(50)]), teamB: pick(["Blue FC", "Asha / Ravi"]), title: chance(0.5) ? "Sunday League" : "", venue: chance(0.5) ? "Baner Turf, Pune" : "", rules, ...(chance(0.6) ? { firstServe: pick(SIDES) } : {}), ...setupTags },
    { id: `b${seed}x${sport.length}`, now: T0 + seed },
  );
  if (b.setup.tags) seen.set("tag:setup", (seen.get("tag:setup") ?? 0) + 1);
  let t = T0 + seed;
  for (let step = 0; step < 220; step++) {
    const v = deriveBoard(b);
    t += Math.floor(r() * 45_000);
    const x = r();
    let e: BoardEvent;
    if (x < 0.72) {
      const acts = padFor(b, v).filter((a) => !a.disabled);
      if (!acts.length) {
        if (v.status === "done" && chance(0.3)) b = undoBoard(b);
        continue;
      }
      const a = pick(acts);
      e = { ...a.event, ...(a.event.type === "clock" || chance(0.85) ? { at: t } : {}) } as BoardEvent;
      if (a.ask === "player" && chance(0.5)) e = { ...e, player: pick(NAMES), ...playerTag() } as BoardEvent;
    } else if (x < 0.77) e = { type: "clock", run: chance(0.5), at: t, ...(chance(0.6) ? { ms: Math.floor(r() * 12 * MIN) } : {}) };
    else if (x < 0.8) e = { type: "rename", side: pick(SIDES), name: pick(NAMES), ...renameTag(), ...(chance(0.5) ? { at: t } : {}) };
    else if (x < 0.84) {
      const cur = v.setup.rules as unknown as Record<string, unknown>;
      const key = pick(Object.keys(cur));
      e = { type: "rules", rules: chance(0.5) ? pick(pick(engine.presets as { options: { rules: object }[] }[]).options).rules : { [key]: jitter(cur[key]) }, at: t };
    } else if (x < 0.86) e = { type: "serve", side: pick(SIDES), ...(chance(0.3) ? { server: pick([1, 2] as const) } : {}), at: t };
    else if (x < 0.88) e = { type: "timeout", side: pick(SIDES), at: t };
    else if (x < 0.9) e = { type: "foul", side: pick(SIDES), ...(chance(0.5) ? { player: pick(NAMES), ...playerTag() } : {}), at: t };
    else if (x < 0.905) e = { type: "end", ...(chance(0.7) ? { reason: pick(["abandoned", "retired", "walkover", "conceded"] as const), side: pick(SIDES) } : {}), at: t };
    else if (x < 0.93) {
      b = undoBoard(b);
      continue;
    } else e = { type: "period", ...(chance(0.8) ? { at: t } : {}) };
    const next = applyBoard(b, e);
    if (next === b) continue;
    b = next;
    const how = e.type === "point" ? e.how : undefined;
    const tag = (e as { tag?: Tag | null }).tag;
    const tagged = tag === undefined ? null : `tag:${e.type}${tag === null ? "-null" : ""}`;
    for (const k of [e.type, how ? `how:${how}` : null, `${sport}:${e.type}`, tagged]) if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return b;
}

test("sanitizeBoard: every board the engines build comes back exactly", () => {
  const seen = new Map<string, number>();
  for (const sport of BOARD_SPORTS) {
    for (let seed = 1; seed <= 30; seed++) {
      const b = anyBoard(sport, seed, seen);
      const s = sanitizeBoard(wire(b));
      assert.deepEqual(s, b, `${sport} seed ${seed}`);
      assert.deepEqual(deriveBoard(s!), deriveBoard(b), `${sport} seed ${seed} derive`);
      // The live copy round-trips too, with sentAt.
      const live = { ...publicBoard(b), sentAt: T0 + 99 };
      assert.deepEqual(sanitizeBoard(wire(live)), live, `${sport} seed ${seed} public`);
      // It shows the same names, side tags and players, and folding it again changes nothing.
      const pv = deriveBoard(live);
      const bv = deriveBoard(b);
      assert.deepEqual([pv.teams, pv.setup, pv.players], [bv.teams, bv.setup, bv.players], `${sport} seed ${seed} public view`);
      assert.deepEqual(publicBoard(live), live, `${sport} seed ${seed} public twice`);
    }
  }
  for (const k of ["point", "card", "foul", "clock", "period", "serve", "end", "rename", "timeout", "rules"]) assert.ok(seen.get(k), `no ${k} on any board`);
  for (const k of ["tag:setup", "tag:point", "tag:card", "tag:foul", "tag:rename", "tag:rename-null"]) assert.ok(seen.get(k), `no ${k} on any board`);
  for (const k of ["goal", "penalty", "own-goal", "shootout-goal", "shootout-miss", "two", "three", "free-throw"]) assert.ok(seen.get(`how:${k}`), `no ${k} on any board`);
  for (const s of BOARD_SPORTS) assert.ok(seen.get(`${s}:point`), `no points in ${s}`);
});

test("publicBoard: renames fold into the latest name, players as typed", () => {
  const b = run(fb(), goal("a", "Ravi"), { type: "rename", side: "a", name: "Red Lions" }, goal("a", "Ravi"), { type: "rename", side: "a", name: "Red Tigers" }, { type: "rename", side: "b", name: "Blue Lions" });
  const p = publicBoard(b);
  assert.deepEqual([p.setup.teamA, p.setup.teamB], ["Red Tigers", "Blue Lions"]);
  assert.deepEqual(
    p.events.filter((e) => e.type === "rename").map((e) => (e.type === "rename" ? e.name : "")),
    ["Red Tigers", "Red Tigers", "Blue Lions"],
  );
  assert.ok(!JSON.stringify(p).includes("Red FC") && !JSON.stringify(p).includes("Red Lions"));
  assert.deepEqual(deriveBoard(p), deriveBoard(b));
  // The scorer's own board is untouched.
  assert.equal(b.setup.teamA, "Red FC");
  assert.deepEqual(publicBoard(p), p);
  assert.deepEqual(publicBoard({ ...b, sentAt: 7 }).sentAt, 7);
});

/* ------------------------------------------------------------------ */
/* TapTurf profile tags                                                */
/* ------------------------------------------------------------------ */

const RAHUL_K: Tag = { u: "rahul_k" };
const RAHUL_S: Tag = { u: "rahul_s" };
const ev = (x: object) => x as BoardEvent;

test("tags: kept next to a player name on points, cards and fouls; from the pad a bad one, or one with no name, is refused", () => {
  const b = run(
    fb({ cards: true }),
    ev({ type: "point", side: "a", how: "goal", player: " Rahul ", tag: { u: "rahul_k", uid: "0b7c" } }),
    ev({ type: "card", side: "b", color: "yellow", player: "Arjun", tag: { u: "arjun99" } }),
    ev({ type: "point", side: "a", how: "goal", player: "Ravi", tag: null }),
  );
  // Only the username is kept; null is no tag, and leaves no key.
  assert.deepEqual(b.events, [
    { type: "point", side: "a", how: "goal", player: "Rahul", tag: { u: "rahul_k" } },
    { type: "card", side: "b", color: "yellow", player: "Arjun", tag: { u: "arjun99" } },
    { type: "point", side: "a", how: "goal", player: "Ravi" },
  ]);
  assert.equal("tag" in b.events[2], false);
  for (const tag of [{ u: "Rahul K" }, { u: "rahul-k" }, { u: "ab" }, { u: "1rahul" }, { u: "r".repeat(21) }, { u: 5 }, "rahul_k", ["rahul_k"], {}, 0]) {
    refuse(b, ev({ type: "point", side: "a", how: "goal", player: "Rahul", tag }));
  }
  refuse(b, ev({ type: "point", side: "a", how: "goal", tag: RAHUL_K }));
  refuse(b, ev({ type: "point", side: "a", how: "goal", player: "   ", tag: RAHUL_K }));
  refuse(b, ev({ type: "card", side: "a", color: "red", tag: RAHUL_K }));
  const k = run(bb(), clock(true, T0), ev({ type: "foul", side: "a", player: "Rahul", tag: RAHUL_K }));
  assert.deepEqual(k.events[1], { type: "foul", side: "a", player: "Rahul", tag: RAHUL_K });
  refuse(k, ev({ type: "foul", side: "a", tag: RAHUL_K }));
  refuse(k, ev({ type: "foul", side: "a", player: "Rahul", tag: { u: "RAHUL_K" } }));
});

test("tags: a stored board drops a bad tag, or one with no player name, and keeps the event", () => {
  const raw = {
    ...(wire(fb({ cards: true })) as object),
    events: [
      { type: "point", side: "a", how: "goal", player: "Rahul", tag: { u: "rahul_k", evil: "x".repeat(1000) } },
      { type: "point", side: "a", how: "goal", player: "Rahul", tag: { u: "NOPE" } },
      { type: "point", side: "a", how: "goal", tag: { u: "rahul_k" } },
      { type: "card", side: "b", color: "red", player: "  ", tag: { u: "rahul_k" } },
      { type: "foul", side: "a", player: "Ravi", tag: "ravi" },
      { type: "point", side: "a", how: "goal", player: "Rahul", tag: null },
      { type: "point", side: "a", how: "goal", player: 7, tag: { u: "rahul_k" } },
    ],
  };
  const s = sanitizeBoard(raw)!;
  assert.deepEqual(s.events, [
    { type: "point", side: "a", how: "goal", player: "Rahul", tag: { u: "rahul_k" } },
    { type: "point", side: "a", how: "goal", player: "Rahul" },
    { type: "point", side: "a", how: "goal" },
    { type: "card", side: "b", color: "red" },
    { type: "foul", side: "a", player: "Ravi" },
    { type: "point", side: "a", how: "goal", player: "Rahul" },
    { type: "point", side: "a", how: "goal" },
  ]);
  for (const e of s.events.slice(1)) assert.equal("tag" in e, false, JSON.stringify(e));
  assert.deepEqual(sanitizeBoard(wire(s)), s);
  assert.deepEqual(publicBoard(s).events, s.events, "player tags stay as typed on the live copy");
});

test("football: two Rahuls tagged to different profiles are two players, and the sent-off check is per person", () => {
  let b = run(
    fb({ cards: true }),
    clock(true, T0),
    ev({ type: "point", side: "a", how: "goal", player: "Rahul", tag: RAHUL_K, at: T0 + 2 * MIN }),
    ev({ type: "point", side: "a", how: "goal", player: "Rahul", tag: RAHUL_S, at: T0 + 5 * MIN }),
    ev({ type: "point", side: "a", how: "goal", player: "Rahul", at: T0 + 7 * MIN }),
    ev({ type: "card", side: "a", color: "yellow", player: "Rahul", tag: RAHUL_K, at: T0 + 8 * MIN }),
    ev({ type: "card", side: "a", color: "yellow", player: "rahul", tag: RAHUL_K, at: T0 + 9 * MIN }),
  );
  let v = deriveBoard(b);
  // Timeline lines are text, the name as typed, tagged or not.
  assert.deepEqual(
    v.timeline.filter((l) => l.tone !== "info").map((l) => l.text),
    ["Goal! Rahul", "Goal! Rahul", "Goal! Rahul", "Yellow card, Rahul", "Second yellow, rahul. Sent off"],
  );
  assert.deepEqual(v.players, [
    { side: "a", name: "Rahul", text: "3'", tag: RAHUL_K },
    { side: "a", name: "Rahul", text: "6'", tag: RAHUL_S },
    { side: "a", name: "Rahul", text: "8'" },
    { side: "a", name: "Rahul", text: "Yellow card 9', second yellow 10'", tag: RAHUL_K },
  ]);
  assert.equal("tag" in v.players[2], false);
  // Rahul K is off, in any spelling; Rahul S and the untagged Rahul are not.
  refuse(b, ev({ type: "card", side: "a", color: "red", player: "RAHUL", tag: RAHUL_K }), /^Rahul is sent off already$/);
  refuse(b, ev({ type: "card", side: "a", color: "yellow", player: "Rahul Kumar", tag: RAHUL_K }), /sent off/);
  b = run(
    b,
    ev({ type: "card", side: "a", color: "yellow", player: "Rahul", tag: RAHUL_S, at: T0 + 10 * MIN }),
    ev({ type: "card", side: "a", color: "red", player: "Rahul", at: T0 + 11 * MIN }),
  );
  v = deriveBoard(b);
  assert.deepEqual(v.players.slice(3), [
    { side: "a", name: "Rahul", text: "Yellow card 9', second yellow 10'", tag: RAHUL_K },
    { side: "a", name: "Rahul", text: "Yellow card 11'", tag: RAHUL_S },
    { side: "a", name: "Rahul", text: "Red card 12'" },
  ]);
  // Now the untagged Rahul is off too, but Rahul S still is not.
  refuse(b, ev({ type: "card", side: "a", color: "yellow", player: "rahul" }), /sent off/);
  b = run(b, ev({ type: "card", side: "a", color: "yellow", player: "Rahul", tag: RAHUL_S }));
  assert.equal(deriveBoard(b).timeline.at(-1)?.text, "Second yellow, Rahul. Sent off");
  refuse(b, ev({ type: "card", side: "a", color: "red", player: "Rahul", tag: RAHUL_S }), /sent off/);
  // The same name on the other team is someone else.
  run(b, ev({ type: "card", side: "b", color: "red", player: "Rahul", tag: RAHUL_K }));
  // A stored board reads back the same, and so does its live copy.
  assert.deepEqual(sanitizeBoard(wire(b)), b);
  assert.deepEqual(deriveBoard(publicBoard(b)).players, deriveBoard(b).players);
});

test("football and basketball: a tagged player is one row however the name is typed", () => {
  const f = run(
    fb(),
    ev({ type: "point", side: "a", how: "goal", player: "Rahul", tag: RAHUL_K }),
    ev({ type: "point", side: "a", how: "penalty", player: "RAHUL", tag: RAHUL_K }),
    ev({ type: "point", side: "a", how: "goal", player: "rahul k", tag: RAHUL_K }),
    // Rahul K puts one in his own net: listed with the team it counts for, as before.
    ev({ type: "point", side: "b", how: "own-goal", player: "Rahul", tag: RAHUL_K }),
  );
  const fv = deriveBoard(f);
  assert.deepEqual(fv.players, [
    { side: "a", name: "Rahul", text: "3 goals (pen)", tag: RAHUL_K },
    { side: "b", name: "Rahul", text: "1 goal (og)", tag: RAHUL_K },
  ]);
  assert.deepEqual(
    fv.timeline.map((l) => l.text),
    ["Goal! Rahul", "Penalty goal! RAHUL", "Goal! rahul k", "Own goal by Rahul"],
  );
  assert.ok(boardShareText(fv).includes("Goals: Rahul 3 goals (pen), Rahul 1 goal (og)"));

  const k = run(
    bb(),
    clock(true, T0),
    ev({ type: "point", side: "a", value: 2, how: "two", player: "Rahul", tag: RAHUL_K }),
    ev({ type: "point", side: "a", value: 3, how: "three", player: "RAHUL", tag: RAHUL_K }),
    ev({ type: "foul", side: "a", player: "rahul", tag: RAHUL_K }),
    ev({ type: "point", side: "a", value: 2, how: "two", player: "Rahul", tag: RAHUL_S }),
    ev({ type: "point", side: "a", value: 1, how: "free-throw", player: "Rahul" }),
    ev({ type: "point", side: "a", value: 1, how: "free-throw", player: "rahul" }),
  );
  const kv = deriveBoard(k);
  assert.deepEqual(kv.players, [
    { side: "a", name: "Rahul", text: "5 points, 1 foul", tag: RAHUL_K },
    { side: "a", name: "Rahul", text: "2 points", tag: RAHUL_S },
    { side: "a", name: "Rahul", text: "2 points" },
  ]);
  assert.equal("tag" in kv.players[2], false);
  assert.deepEqual(
    kv.timeline.filter((l) => l.side).map((l) => l.text),
    ["+2, Rahul", "+3, RAHUL", "Foul, rahul (team foul 1)", "+2, Rahul", "Free throw, Rahul", "Free throw, rahul"],
  );
  assert.deepEqual(sanitizeBoard(wire(k)), k);
});

test("racquet singles: a tag per player at setup; a rename leaving it out keeps it, null clears it, and the live copy has the final one", () => {
  const plain = newBoard("badminton", { teamA: "Asha", teamB: "Ravi", rules: { doubles: false } }, { id: "bbad", now: T0 });
  assert.deepEqual(Object.keys(plain.setup).sort(), ["rules", "teamA", "teamB", "title", "venue"], "untagged: the exact keys as before");
  assert.deepEqual(Object.keys(deriveBoard(plain).setup).sort(), ["rules", "teamA", "teamB", "title", "venue"]);
  assert.deepEqual(deriveBoard(plain).teams, { a: { name: "Asha", score: 0 }, b: { name: "Ravi", score: 0 } });

  let b = newBoard("badminton", { teamA: "Asha", teamB: "Ravi", rules: { doubles: false }, tags: { a: { u: "asha_k" }, b: null } }, { id: "bbad", now: T0 });
  assert.deepEqual(b.setup.tags, { a: { u: "asha_k" } });
  assert.deepEqual(deriveBoard(b).teams, { a: { name: "Asha", score: 0, tag: { u: "asha_k" } }, b: { name: "Ravi", score: 0 } });
  assert.deepEqual(sanitizeBoard(wire(b)), b);

  // Renamed later without touching the tag: the tag stays.
  b = run(b, { type: "serve", side: "a" }, { type: "point", side: "a" }, { type: "rename", side: "a", name: "Asha K" });
  assert.deepEqual(b.events.at(-1), { type: "rename", side: "a", name: "Asha K" });
  assert.deepEqual(deriveBoard(b).teams.a, { name: "Asha K", score: 0, tag: { u: "asha_k" } });
  // A tag-only change carries the current name.
  b = run(b, { type: "rename", side: "b", name: "Ravi", tag: { u: "ravi" } });
  assert.deepEqual(deriveBoard(b).teams.b, { name: "Ravi", score: 0, tag: { u: "ravi" } });
  // An explicit null clears it, and a later rename with no tag does not bring it back.
  b = run(b, { type: "rename", side: "a", name: "Asha K", tag: null }, { type: "rename", side: "a", name: "Asha Kumar" });
  assert.deepEqual(b.events.at(-2), { type: "rename", side: "a", name: "Asha K", tag: null });
  let v = deriveBoard(b);
  assert.deepEqual(v.teams.a, { name: "Asha Kumar", score: 0 });
  assert.deepEqual(v.setup.tags, { b: { u: "ravi" } }, "the view's setup has the tags as now");
  // Set again, to another profile.
  b = run(b, { type: "rename", side: "a", name: "Asha Kumar", tag: { u: "asha_kumar" } });
  v = deriveBoard(b);
  assert.deepEqual([v.teams.a.tag, v.teams.b.tag], [{ u: "asha_kumar" }, { u: "ravi" }]);
  assert.deepEqual(sanitizeBoard(wire(b)), b);

  // The live copy: the setup and every rename carry each side's final tag.
  const p = publicBoard(b);
  assert.deepEqual(p.setup.tags, { a: { u: "asha_kumar" }, b: { u: "ravi" } });
  assert.deepEqual(
    p.events.filter((e) => e.type === "rename"),
    [
      { type: "rename", side: "a", name: "Asha Kumar", tag: { u: "asha_kumar" } },
      { type: "rename", side: "b", name: "Ravi", tag: { u: "ravi" } },
      { type: "rename", side: "a", name: "Asha Kumar", tag: { u: "asha_kumar" } },
      { type: "rename", side: "a", name: "Asha Kumar", tag: { u: "asha_kumar" } },
      { type: "rename", side: "a", name: "Asha Kumar", tag: { u: "asha_kumar" } },
    ],
  );
  assert.ok(!JSON.stringify(p).includes('"asha_k"'), "an old tag is not served");
  assert.deepEqual([deriveBoard(p).teams, deriveBoard(p).setup], [deriveBoard(b).teams, deriveBoard(b).setup]);
  assert.deepEqual(publicBoard(p), p);
  assert.deepEqual(sanitizeBoard(wire(p)), p);
  assert.deepEqual(b.setup.tags, { a: { u: "asha_k" } }, "the scorer's own board is untouched");

  // Cleared at the end: no tag for that side anywhere in the live copy.
  const cleared = publicBoard(run(b, { type: "rename", side: "a", name: "Asha Kumar", tag: null }));
  assert.deepEqual(cleared.setup.tags, { b: { u: "ravi" } });
  assert.ok(!JSON.stringify(cleared).includes("asha_"));
  for (const e of cleared.events) if (e.type === "rename" && e.side === "a") assert.equal("tag" in e, false);
  // Both cleared: no tags key at all.
  const none = publicBoard(run(b, { type: "rename", side: "a", name: "Asha Kumar", tag: null }, { type: "rename", side: "b", name: "Ravi", tag: null }));
  assert.equal("tags" in none.setup, false);
  assert.ok(!JSON.stringify(none).includes('"tag"'));
});

test("racquet sides: a bad tag is refused from the pad and dropped from a stored board", () => {
  const b = newBoard("tennis", { teamA: "Asha", teamB: "Ravi", rules: { doubles: false }, tags: { a: { u: "Asha K" }, b: { u: "ravi", uid: "x" } as Tag } }, { id: "bten", now: T0 });
  assert.deepEqual(b.setup.tags, { b: { u: "ravi" } });
  for (const tag of [{ u: "Asha" }, "asha_k", [], {}, 1]) refuse(b, ev({ type: "rename", side: "a", name: "Asha", tag }));
  const raw = {
    ...(wire(b) as object),
    setup: { ...b.setup, tags: { a: { u: "asha_k", x: 1 }, b: { u: "BAD" }, c: { u: "ravi" } } },
    events: [
      { type: "rename", side: "a", name: "Asha", tag: { u: "Bad Tag" } },
      { type: "rename", side: "b", name: "Ravi", tag: null },
      { type: "rename", side: "a", name: "Asha", tag: { u: "asha_k", y: 2 } },
    ],
  };
  const s = sanitizeBoard(raw)!;
  assert.deepEqual(s.setup.tags, { a: { u: "asha_k" } });
  assert.deepEqual(s.events, [
    { type: "rename", side: "a", name: "Asha" },
    { type: "rename", side: "b", name: "Ravi", tag: null },
    { type: "rename", side: "a", name: "Asha", tag: { u: "asha_k" } },
  ]);
  for (const tags of [null, "asha_k", [], { a: null }, { a: "asha_k" }]) assert.equal("tags" in sanitizeBoard({ ...raw, setup: { ...b.setup, tags } })!.setup, false, JSON.stringify(tags));
});

test("racquet doubles: a side tag is kept but not shown, and shows again when the rules go back to singles", () => {
  let b = newBoard("tennis", { teamA: "Asha", teamB: "Ravi", rules: { doubles: false }, tags: { a: { u: "asha_k" } } }, { id: "bten", now: T0 });
  assert.deepEqual(deriveBoard(b).teams.a.tag, { u: "asha_k" });
  b = run(b, { type: "rules", rules: { doubles: true } });
  const v = deriveBoard(b);
  assert.deepEqual(v.teams, { a: { name: "Asha", score: 0 }, b: { name: "Ravi", score: 0 } });
  assert.deepEqual(v.setup.tags, { a: { u: "asha_k" } }, "kept in the setup as now");
  // A rename in doubles leaves the tag alone.
  b = run(b, { type: "rename", side: "a", name: "Asha / Meera" });
  assert.equal("tag" in deriveBoard(b).teams.a, false);
  b = run(b, { type: "rules", rules: { doubles: false } }, { type: "rename", side: "a", name: "Asha" });
  assert.deepEqual(deriveBoard(b).teams.a, { name: "Asha", score: 0, tag: { u: "asha_k" } });
  // Padel and pickleball are doubles unless set otherwise: a tag given at setup is not shown.
  for (const sport of ["padel", "pickleball"] as BoardSport[]) {
    const d = newBoard(sport, { teamA: "Asha / Meera", tags: { a: { u: "asha_k" } } }, { id: "bdbl", now: T0 });
    assert.deepEqual(d.setup.tags, { a: { u: "asha_k" } }, sport);
    assert.deepEqual(deriveBoard(d).teams.a, { name: "Asha / Meera", score: 0 }, sport);
  }
  // Every racquet sport shows it in singles.
  for (const sport of RACQUET) {
    const sg = newBoard(sport, { rules: { doubles: false }, tags: { b: { u: "ravi" } } }, { id: "bsgl", now: T0 });
    assert.deepEqual([deriveBoard(sg).teams.a.tag, deriveBoard(sg).teams.b.tag], [undefined, { u: "ravi" }], sport);
    assert.equal("tag" in deriveBoard(sg).teams.a, false, sport);
  }
});

test("side tags are for racquet players only: other sports drop them at setup and in a stored board, and refuse them on a rename", () => {
  for (const sport of BOARD_SPORTS.filter((s) => !RACQUET.includes(s))) {
    const x = newBoard(sport, { rules: { doubles: false }, tags: { a: { u: "asha_k" } } }, { id: "bx", now: T0 });
    assert.equal("tags" in x.setup, false, sport);
    assert.equal("tag" in deriveBoard(x).teams.a, false, sport);
    refuse(x, ev({ type: "rename", side: "a", name: "Asha", tag: { u: "asha_k" } }));
    refuse(x, ev({ type: "rename", side: "a", name: "Asha", tag: null }));
    const s = sanitizeBoard({ ...(wire(x) as object), setup: { ...x.setup, tags: { a: { u: "asha_k" } } }, events: [{ type: "rename", side: "a", name: "Asha", tag: { u: "asha_k" } }] })!;
    assert.equal("tags" in s.setup, false, sport);
    assert.deepEqual(s.events, [{ type: "rename", side: "a", name: "Asha" }], sport);
    // A hand-built board with a side tag shows none and serves none.
    const hand = { ...x, setup: { ...x.setup, tags: { a: { u: "asha_k" } } } };
    assert.equal("tags" in deriveBoard(hand).setup, false, sport);
    assert.equal("tags" in publicBoard(hand).setup, false, sport);
  }
});

test("readBoardSport: a game's sport label", () => {
  const cases: [string | null | undefined, BoardSport | null][] = [
    ["5v5 Football", "football"],
    ["7v7 Football", "football"],
    ["football", "football"],
    ["Football", "football"],
    ["Futsal", "football"],
    ["Soccer", "football"],
    ["Basketball", "basketball"],
    ["Volleyball", "volleyball"],
    ["Badminton", "badminton"],
    ["Pickleball", "pickleball"],
    ["Tennis", "tennis"],
    ["Lawn Tennis", "tennis"],
    ["Table Tennis", "table-tennis"],
    [" table   tennis ", "table-tennis"],
    ["Padel", "padel"],
    ["Ultimate Frisbee", "other"],
    ["Box Cricket", null],
    ["Cricket", null],
    ["Cricket Nets", null],
    ["Swimming", null],
    ["Kabaddi", null],
    ["", null],
    [null, null],
    [undefined, null],
  ];
  for (const [label, sport] of cases) assert.equal(readBoardSport(label), sport, String(label));
});

test("boardShape: one more innings per finished period or set", () => {
  let b = fb();
  assert.deepEqual(boardShape(deriveBoard(b)), { status: "live", innings: [null] });
  b = run(b, period());
  assert.equal(boardShape(deriveBoard(b)).innings.length, 2);
  b = run(b, clock(true, T0), period(T0 + MIN));
  assert.deepEqual(boardShape(deriveBoard(b)), { status: "done", innings: [null, null, null] });
  const view = { ...deriveBoard(fb()), period: null, sets: [{ a: 21, b: 17, winner: "a" as Side, tiebreak: null }, { a: 3, b: 1, winner: null, tiebreak: null }] };
  assert.equal(boardShape(view).innings.length, 2);
});

test("boardShareText: football mid match with the clock, and after penalties", () => {
  let b = newBoard("football", { teamA: "Red FC", teamB: "Blue FC", title: "Sunday League", rules: { penalties: true } }, { id: "bshare", now: T0 });
  const T1 = T0 + 25 * MIN;
  b = run(b, clock(true, T0), goal("a", "Ravi", T0 + 5 * MIN + 10_000), period(T0 + 21 * MIN), clock(true, T1), { type: "point", side: "b", how: "penalty", player: "Arjun", at: T1 + 3 * MIN });
  const v = deriveBoard(b);
  assert.equal(
    boardShareText(v, { link: "https://tapturf.in/live/ab12", now: T1 + 6 * MIN + 30_000 }),
    ["*Red FC 1-1 Blue FC*", "Football, Sunday League", "2nd half, 27'", "Goals: Ravi 6', Arjun 24' (pen)", "Live score: https://tapturf.in/live/ab12"].join("\n"),
  );
  // Without now: the period alone. In stoppage time: 40+2'.
  assert.equal(boardShareText(v).split("\n")[2], "2nd half");
  assert.equal(boardShareText(v, { now: T1 + 21 * MIN + 5_000 }).split("\n")[2], "2nd half, 40+2'");
  b = run(b, period(T1 + 22 * MIN), kick("a", true), kick("b", false));
  assert.equal(boardShareText(deriveBoard(b)).split("\n")[2], "Penalties 1-0");
  b = run(b, kick("a", true), kick("b", false), kick("a", true), kick("b", false));
  assert.equal(
    boardShareText(deriveBoard(b), { now: T1 + 40 * MIN }),
    ["*Red FC 1-1 Blue FC*", "Football, Sunday League", "Red FC won 3-0 on penalties", "Goals: Ravi 6', Arjun 24' (pen)", "Scored live on TapTurf.in"].join("\n"),
  );
});

test("boardShareText: basketball points by quarter, other, and set sports", () => {
  let b = bb();
  b = playPeriod(b, T0, pts("a", 3, "three"), pts("a", 2, "two"), pts("b", 1, "free-throw"));
  b = run(b, clock(true, T0 + 5 * MIN), pts("b", 2, "two", T0 + 5 * MIN + 10_000));
  assert.equal(
    boardShareText(deriveBoard(b), { now: T0 + 5 * MIN + 30_000 }),
    ["*Hoopers 5-3 Dunkers*", "Basketball", "Q2 9:30", "Q1 5-1, Q2 0-2", "Scored live on TapTurf.in"].join("\n"),
  );
  const o = run(ot({ name: "Kabaddi" }), pts("a", 1), pts("a", 1), pts("b", 1));
  assert.equal(boardShareText(deriveBoard(o), { link: "https://tapturf.in/live/x" }), ["*Tigers 2-1 Lions*", "Kabaddi", "Live score: https://tapturf.in/live/x"].join("\n"));

  // Set sports, from views as the racquet engines fill them.
  const base = deriveBoard(newBoard("other", { teamA: "Asha", teamB: "Ravi" }, { id: "bset", now: T0 }));
  const rally: BoardView = {
    ...base,
    sport: "badminton",
    sportName: "Badminton",
    scoreUnit: "Games",
    teams: { a: { name: "Asha", score: 1 }, b: { name: "Ravi", score: 0 } },
    currentLabel: "Game 2",
    current: { a: "8", b: "6" },
    server: "a",
    sets: [
      { a: 21, b: 17, winner: "a", tiebreak: null },
      { a: 8, b: 6, winner: null, tiebreak: null },
    ],
  };
  assert.equal(boardShareText(rally), ["*Asha 1-0 Ravi* (games)", "Badminton", "Game 2", "21-17, 8-6", "Asha serving", "Scored live on TapTurf.in"].join("\n"));
  const tennis: BoardView = {
    ...base,
    sport: "tennis",
    sportName: "Tennis",
    scoreUnit: "Sets",
    status: "done",
    teams: { a: { name: "Asha", score: 2 }, b: { name: "Ravi", score: 1 } },
    result: { winner: "a", kind: "win", text: "Asha won 2-1" },
    sets: [
      { a: 7, b: 6, winner: "a", tiebreak: { a: 7, b: 5 } },
      { a: 3, b: 6, winner: "b", tiebreak: null },
      { a: 10, b: 8, winner: "a", tiebreak: null, matchTiebreak: true },
    ],
  };
  assert.equal(boardShareText(tennis), ["*Asha 2-1 Ravi* (sets)", "Tennis", "Asha won 2-1", "7-6(5), 3-6, [10-8]", "Scored live on TapTurf.in"].join("\n"));
  const padel: BoardView = { ...tennis, sport: "padel", sportName: "Padel", status: "live", result: null, currentLabel: "Game 5, set 2", current: { a: "40", b: "AD" }, server: "b", sets: tennis.sets.slice(0, 2) };
  assert.equal(boardShareText(padel).split("\n").slice(2, 5).join("\n"), ["Game 5, set 2: 40-AD", "7-6(5), 3-6", "Ravi serving"].join("\n"));
});

test("football: a half length changed at half time leaves the 1st half's minutes as played", () => {
  const at = T0 + 25 * MIN + 30_000;
  const b = run(fb(), clock(true, T0), period(T0 + 21 * MIN), { type: "rules", rules: { halfMinutes: 25 } }, clock(true, T0 + 25 * MIN), goal("a", undefined, at));
  const v = deriveBoard(b);
  assert.equal(v.timeline.at(-1)?.when, "21'", "20 minutes were played before it, not 25");
  assert.equal(v.clock?.baseMs, 20 * MIN);
  assert.match(boardShareText(v, { now: at }), /2nd half, 21'/);
  // Set time is refused in match time: 20 played + 25 + 30 of stoppage.
  refuse(b, clock(true, at, 56 * MIN), /up to 75:00/);
});

test("football: time up mid-shootout is a draw, unless the kicks are equal or one side cannot catch up", () => {
  let b = run(levelAtFullTime({}), kick("b", true));
  assert.deepEqual(deriveBoard(run(b, { type: "end" })).result, { winner: null, kind: "draw", text: "Drawn 1-1" });
  b = run(b, kick("a", false));
  assert.equal(deriveBoard(run(b, { type: "end" })).result?.text, "Blue FC won 1-0 on penalties");
});

test("basketball: reaching the target stops the clock on that basket", () => {
  const preset = SPORT_ENGINES.basketball.presets[0].options.find((o: { label: string }) => o.label.startsWith("3x3"));
  assert.ok(preset);
  let b = run(bb(preset.rules), clock(true, T0));
  for (let i = 0; i < 10; i++) b = run(b, pts("a", 2, "outside", T0 + MIN));
  b = run(b, pts("a", 1, "inside", T0 + 4 * MIN));
  const v = deriveBoard(b);
  assert.equal(v.status, "done");
  assert.equal(v.clock?.running, false);
  assert.equal(clockMs(v, T0 + 20 * MIN), 6 * MIN, "6 minutes were left at the winning basket");
});

test("basketball: times on a count-down clock round up, as the clock shows them", () => {
  const b = run(bb(), clock(true, T0), pts("a", 3, undefined, T0 + 10 * MIN - 600));
  assert.equal(deriveBoard(b).timeline.at(-1)?.when, "Q1 0:01");
  assert.match(boardShareText(deriveBoard(b), { now: T0 + 10 * MIN - 600 }), /Q1 0:01/);
});

test("football: a finished draw takes penalties and nothing else", () => {
  const b = run(fb(), clock(true, T0), period(T0 + 21 * MIN), clock(true, T0 + 25 * MIN), period(T0 + 46 * MIN));
  assert.equal(deriveBoard(b).result?.kind, "draw");
  refuse(b, { type: "rules", rules: { penalties: true, halfMinutes: 45 } }, /Only penalties/);
  refuse(b, { type: "rules", rules: { halfMinutes: 45 } }, /over/);
  const pens = run(b, { type: "rules", rules: { penalties: true, shootoutKicks: 3 } });
  assert.equal(deriveBoard(pens).status, "live");
});

test("tags: a name typed as @username is not the tagged person", () => {
  let b = run(fb({ cards: true }), clock(true, T0), { type: "point", side: "a", how: "goal", player: "@rahul_k", at: T0 + MIN }, { type: "point", side: "a", how: "goal", player: "Rahul", tag: { u: "rahul_k" }, at: T0 + 2 * MIN });
  const rows = deriveBoard(b).players.filter((p) => p.side === "a");
  assert.equal(rows.length, 2);
  assert.ok(rows.some((p) => p.name === "Rahul" && p.tag?.u === "rahul_k"));
  assert.ok(rows.some((p) => p.name === "@rahul_k" && !p.tag));
  // A red for the typed name does not send the tagged player off.
  b = run(b, { type: "card", side: "a", color: "red", player: "@rahul_k", at: T0 + 3 * MIN });
  assert.equal(checkBoard(b, { type: "card", side: "a", color: "yellow", player: "Rahul", tag: { u: "rahul_k" }, at: T0 + 4 * MIN }), null);

  const k = run(bb(), clock(true, T0), { type: "point", side: "a", value: 2, player: "@ravi_x", at: T0 + MIN }, { type: "point", side: "a", value: 3, player: "Ravi", tag: { u: "ravi_x" }, at: T0 + 2 * MIN });
  assert.equal(deriveBoard(k).players.filter((p) => p.side === "a").length, 2);
});

test("tags: a tag-only rename in singles adds no name-change line and no username in text", () => {
  for (const sport of ["badminton", "tennis"] as const) {
    const b0 = newBoard(sport, { teamA: "Asha", teamB: "Ravi", rules: { doubles: false } }, { id: `t-${sport}`, now: T0 });
    const b1 = run(b0, { type: "rename", side: "a", name: "Asha", tag: { u: "asha_p" } });
    const v1 = deriveBoard(b1);
    assert.equal(v1.timeline.filter((l) => /Name changed/.test(l.text)).length, 0, sport);
    assert.equal(v1.lastAction, "Asha tagged", sport);
    assert.equal(v1.teams.a.tag?.u, "asha_p", sport);
    assert.ok(!JSON.stringify(v1.timeline).includes("asha_p"), sport);
    const v2 = deriveBoard(run(b1, { type: "rename", side: "a", name: "Asha", tag: null }));
    assert.equal(v2.lastAction, "Tag removed, Asha", sport);
    assert.equal(v2.teams.a.tag, undefined, sport);
    // A real rename with a tag still says so.
    const v3 = deriveBoard(run(b0, { type: "rename", side: "a", name: "Asha P", tag: { u: "asha_p" } }));
    assert.equal(v3.timeline.filter((l) => /Name changed to Asha P/.test(l.text)).length, 1, sport);
  }
});
