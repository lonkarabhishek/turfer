// Run with: npm run test:scorer (compiles to .test-out and runs node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedWicketKinds,
  apply,
  ballTone,
  breakdown,
  check,
  derive,
  describeBall,
  newMatch,
  newPlayerId,
  restoreMatch,
  shareText,
  toScorecard,
  undo,
  undoBall,
  type BallEvent,
  type BallWicket,
  type End,
  type Extra,
  type Match,
  type MatchEvent,
  type SetupInput,
} from "./scoring";

/* Titans (a): Amit a1, Rahul a2, Karan a3, Dev a4, Om a5, Jay a6
 * Strikers (b): Sameer b1, Vikas b2, Nikhil b3, Arjun b4, Ravi b5, Sunny b6 */
const A = ["Amit", "Rahul", "Karan", "Dev", "Om", "Jay"];
const BS = ["Sameer", "Vikas", "Nikhil", "Arjun", "Ravi", "Sunny"];

const make = (over: SetupInput = {}): Match =>
  newMatch({ teamA: "Titans", teamB: "Strikers", overs: 2, playersPerSide: 6, players: { a: A, b: BS }, ...over }, { id: "t", now: 0 });

const ball = (runs = 0, extra: Extra = "none", extraRuns = 0, wicket?: BallWicket): BallEvent => ({ type: "ball", runs, extra, extraRuns, ...(wicket ? { wicket } : {}) });
const dot = () => ball(0);
const wd = (xr = 0) => ball(0, "wide", xr);
const nb = (bat = 0, xr = 0) => ball(bat, "noBall", xr);
const bye = (n: number) => ball(0, "bye", n);
const lb = (n: number) => ball(0, "legBye", n);
const out = (kind: BallWicket["kind"], o: Partial<BallWicket> = {}) => ball(0, "none", 0, { kind, ...o });
const bat = (player: string, end?: End, name?: string): MatchEvent => ({ type: "setBatter", player, ...(end ? { end } : {}), ...(name ? { name } : {}) });
const bowl = (player: string): MatchEvent => ({ type: "setBowler", player });

/** Apply events, failing the test on any refused event. */
function run(m: Match, ...events: MatchEvent[]): Match {
  for (const e of events) {
    const c = check(m, e);
    assert.equal(c.error, null, `${JSON.stringify(e)} refused: ${c.error}`);
    const next = apply(m, e);
    assert.notEqual(next, m);
    m = next;
  }
  return m;
}
const start = (m = make()) => run(m, bat("a1"), bat("a2"), bowl("b1"));
const times = <T>(n: number, f: () => T): T[] => Array.from({ length: n }, f);

test("setup defaults and what the scorer must pick first", () => {
  const m = newMatch({}, { id: "x", now: 1 });
  assert.equal(m.setup.teamA, "Team A");
  assert.equal(m.setup.overs, 6);
  assert.equal(m.setup.playersPerSide, 11);
  assert.deepEqual(m.setup.rules, { wideRuns: 1, noBallRuns: 1, freeHit: true, maxOversPerBowler: null, lastManStands: false, retireAt: null });
  const v = derive(make());
  assert.equal(v.status, "live");
  assert.deepEqual(v.needs, ["striker", "nonStriker", "bowler"]);
  assert.equal(v.ready, false);
  assert.equal(v.current.battingName, "Titans");
  assert.equal(v.headline, "Titans 0/0 (0.0 ov)");
  assert.equal(check(make(), dot()).error, "Pick who is on strike first");
  const v2 = derive(start());
  assert.deepEqual(v2.needs, []);
  assert.equal(v2.ready, true);
  assert.equal(v2.current.striker?.name, "Amit");
  assert.equal(v2.current.nonStriker?.name, "Rahul");
  assert.equal(v2.current.bowler?.name, "Sameer");
});

test("battingFirst b puts Strikers in first", () => {
  const m = run(make({ battingFirst: "b" }), bat("b1"), bat("b2"), bowl("a1"), ball(4));
  const v = derive(m);
  assert.equal(v.current.battingName, "Strikers");
  assert.equal(v.current.striker?.name, "Sameer");
  assert.equal(v.current.bowler?.name, "Amit");
});

test("wides and no-balls are not legal balls and are charged to the bowler", () => {
  const m = run(start(), wd(), nb());
  const v = derive(m).current;
  assert.equal(v.legalBalls, 0);
  assert.equal(v.overs, "0.0");
  assert.equal(v.runs, 2);
  assert.equal(v.bowler?.runs, 2);
  assert.equal(v.bowler?.balls, 0);
  assert.equal(v.bowler?.wides, 1);
  assert.equal(v.bowler?.noBalls, 1);
  assert.deepEqual(v.extras, { wides: 1, noBalls: 1, byes: 0, legByes: 0, total: 2 });
  // The wide is not a ball faced, the no-ball is.
  assert.equal(v.striker?.balls, 1);
  assert.equal(v.striker?.runs, 0);
});

test("runs on a wide are wides, charged to the bowler, and odd ones change strike", () => {
  let v = derive(run(start(), wd(2))).current;
  assert.equal(v.runs, 3);
  assert.equal(v.extras.wides, 3);
  assert.equal(v.bowler?.runs, 3);
  assert.equal(v.striker?.name, "Amit");
  v = derive(run(start(), wd(1))).current;
  assert.equal(v.runs, 2);
  assert.equal(v.striker?.name, "Rahul");
  // Wide to the fence: 4 more, 5 wides, no change of ends.
  v = derive(run(start(), wd(4))).current;
  assert.equal(v.runs, 5);
  assert.equal(v.striker?.name, "Amit");
  assert.equal(check(start(), ball(2, "wide")).error, "Runs on a wide count as wides, so put them in extra runs");
});

test("no-ball runs off the bat go to the batter and count a ball faced", () => {
  const v = derive(run(start(), nb(4))).current;
  assert.equal(v.runs, 5);
  assert.equal(v.striker?.runs, 4);
  assert.equal(v.striker?.balls, 1);
  assert.equal(v.striker?.fours, 1);
  assert.equal(v.bowler?.runs, 5);
  assert.equal(v.extras.noBalls, 1);
  assert.equal(v.legalBalls, 0);
  // Byes off a no-ball are byes, not the bowler's.
  const v2 = derive(run(start(), nb(0, 2))).current;
  assert.equal(v2.runs, 3);
  assert.equal(v2.bowler?.runs, 1);
  assert.equal(v2.extras.byes, 2);
  assert.equal(v2.striker?.runs, 0);
  assert.equal(v2.striker?.balls, 1);
  const v3 = derive(run(start(), { ...nb(0, 1), noBallExtra: "legBye" })).current;
  assert.equal(v3.extras.legByes, 1);
  assert.equal(v3.striker?.name, "Rahul");
});

test("byes and leg byes: not the bowler's, not the batter's, but a ball faced", () => {
  const v = derive(run(start(), bye(2), lb(1))).current;
  assert.equal(v.runs, 3);
  assert.equal(v.legalBalls, 2);
  assert.equal(v.extras.byes, 2);
  assert.equal(v.extras.legByes, 1);
  const bowler = v.bowler!;
  assert.equal(bowler.runs, 0);
  assert.equal(bowler.balls, 2);
  assert.equal(bowler.dots, 2);
  const amit = v.batters.find((b) => b.name === "Amit")!;
  assert.equal(amit.runs, 0);
  assert.equal(amit.balls, 2);
  // The single leg bye changed ends.
  assert.equal(v.striker?.name, "Rahul");
  assert.equal(check(start(), ball(2, "bye")).error, "Byes are not off the bat, so put them in extra runs");
  assert.equal(check(start(), ball(0, "bye", 0)).error, "Add how many byes they ran");
});

test("strike changes on odd runs run, not on boundaries", () => {
  const striker = (...evs: MatchEvent[]) => derive(run(start(), ...evs)).current.striker?.name;
  assert.equal(striker(ball(1)), "Rahul");
  assert.equal(striker(ball(2)), "Amit");
  assert.equal(striker(ball(3)), "Rahul");
  assert.equal(striker(ball(4)), "Amit");
  assert.equal(striker(ball(6)), "Amit");
  assert.equal(striker(ball(5)), "Rahul");
  assert.equal(striker(bye(1)), "Rahul");
  assert.equal(striker(lb(3)), "Rahul");
  assert.equal(striker(nb(1)), "Rahul");
  assert.equal(striker(nb(4)), "Amit");
  assert.equal(striker(ball(1), ball(1)), "Amit");
  // Manual swap.
  assert.equal(striker({ type: "swapStrike" }), "Rahul");
});

test("end of over: strike changes, bowler is cleared, overs read right", () => {
  let m = run(start(), ...times(5, dot), ball(1));
  let v = derive(m);
  assert.equal(v.current.overs, "1.0");
  // 1 off the last ball: Rahul ran to the striker's end, then the over ended.
  assert.equal(v.current.striker?.name, "Amit");
  assert.equal(v.current.bowler, null);
  assert.deepEqual(v.needs, ["bowler"]);
  assert.equal(v.current.lastOverBowler, "b1");
  assert.equal(check(m, dot()).error, "Pick the bowler for this over first");
  m = run(m, bowl("b2"), wd(), dot());
  v = derive(m);
  assert.equal(v.current.overs, "1.1");
  const chips = v.current.thisOver!.balls.map((b) => `${b.label} ${b.chip}`);
  assert.deepEqual(chips, ["1.1 Wd", "1.1 ."]);

  // 23 legal balls is 3.5, 24 is 4.0.
  let long = start(make({ overs: 5 }));
  const bowlers = ["b2", "b1", "b2"];
  long = run(long, ...times(6, dot));
  for (const b of bowlers) long = run(long, bowl(b), ...times(6, dot));
  long = undo(long);
  assert.equal(derive(long).current.overs, "3.5");
  long = run(long, dot());
  assert.equal(derive(long).current.overs, "4.0");
  assert.equal(derive(long).current.byOver.length, 4);
});

test("maidens: byes are fine, wides and no-balls are not", () => {
  const maiden = (...evs: MatchEvent[]) => derive(run(start(), ...evs)).current.bowlers[0].maidens;
  assert.equal(maiden(...times(6, dot)), 1);
  assert.equal(maiden(...times(5, dot), bye(1)), 1);
  assert.equal(maiden(...times(5, dot), lb(4)), 1);
  assert.equal(maiden(wd(), ...times(6, dot)), 0);
  assert.equal(maiden(nb(), ...times(6, dot)), 0);
  assert.equal(maiden(...times(5, dot), ball(1)), 0);
  // A wide is a wide even with a 0-run house rule.
  assert.equal(derive(run(start(make({ rules: { wideRuns: 0 } })), wd(), ...times(6, dot))).current.bowlers[0].maidens, 0);
  // Over split between two bowlers is nobody's maiden.
  const split = derive(run(start(), dot(), dot(), dot(), bowl("b3"), dot(), dot(), dot())).current;
  assert.deepEqual(
    split.bowlers.map((b) => [b.name, b.overs, b.maidens]),
    [
      ["Sameer", "0.3", 0],
      ["Nikhil", "0.3", 0],
    ],
  );
  assert.equal(split.byOver[0].maiden, false);
});

test("bowler gets bowled, caught, lbw, stumped, hit wicket; not run out or obstructing", () => {
  const m = run(
    start(make({ playersPerSide: 11, overs: 5 })),
    out("bowled"),
    bat("a3"),
    out("caught", { fielder: "b2" }),
    bat("a4"),
    out("lbw"),
    bat("a5"),
    out("runOut", { fielder: "b3" }),
    bat("a6"),
    out("stumped", { fielder: "b4" }),
    bowl("b2"),
    bat("a7", undefined, "Kabir"),
    out("hitWicket"),
    bat("a8", undefined, "Manav"),
    bowl("b3"),
    out("obstructing"),
  );
  const v = derive(m).current;
  assert.equal(v.wickets, 7);
  assert.equal(v.bowlers.find((b) => b.name === "Sameer")!.wickets, 4);
  assert.equal(v.bowlers.find((b) => b.name === "Vikas")!.wickets, 1);
  const how = Object.fromEntries(v.batters.map((b) => [b.name, b.howOut]));
  assert.equal(how.Amit, "b Sameer");
  assert.equal(how.Karan, "c Vikas b Sameer");
  assert.equal(how.Dev, "lbw b Sameer");
  assert.equal(how.Om, "run out (Nikhil)");
  assert.equal(how.Jay, "st Arjun b Sameer");
  assert.equal(how.Kabir, "hit wicket b Vikas");
  // Kabir was out on the last ball, so Rahul faced the next over.
  assert.equal(how.Rahul, "obstructing the field");
  assert.equal(how.Manav, "not out");
  const cb = derive(run(start(), out("caught", { fielder: "b1" }))).current.batters[0];
  assert.equal(cb.howOut, "c & b Sameer");
  assert.equal(derive(run(start(), out("caught"))).current.batters[0].howOut, "caught b Sameer");
});

test("free hit after a no-ball: only a run out, wides keep it going", () => {
  let m = run(start(), nb());
  let v = derive(m);
  assert.equal(v.freeHit, true);
  assert.equal(check(m, out("bowled")).error, "Free hit: the batter can only be run out");
  assert.equal(check(m, out("caught")).error, "Free hit: the batter can only be run out");
  assert.equal(check(m, out("runOut")).error, null);
  assert.deepEqual(allowedWicketKinds("none", { freeHit: true }), ["runOut", "obstructing"]);
  m = run(m, wd());
  assert.equal(derive(m).freeHit, true, "a wide on a free hit keeps the free hit");
  m = run(m, ball(6));
  v = derive(m);
  assert.equal(v.freeHit, false);
  assert.match(v.current.commentary.at(-1)!.line, /SIX \(free hit\)$/);
  assert.match(v.current.commentary[0].line, /no ball\. Free hit next$/);
  // A no-ball on a free hit gives another free hit.
  assert.equal(derive(run(start(), nb(), nb())).freeHit, true);
  // House rule off.
  assert.equal(derive(run(start(make({ rules: { freeHit: false } })), nb())).freeHit, false);
});

test("run outs: either batter, completed runs count, on wides and no-balls too", () => {
  // Non-striker run out backing up, no runs: new batter at the non-striker's end.
  let v = derive(run(start(), ball(0, "none", 0, { kind: "runOut", out: "nonStriker" }), bat("a3"))).current;
  assert.equal(v.striker?.name, "Amit");
  assert.equal(v.nonStriker?.name, "Karan");
  assert.equal(v.batters.find((b) => b.name === "Rahul")!.status, "out");

  // One run completed, striker out going for the second, not crossed:
  // Amit is out at the bowler's end, Rahul faces.
  let m = run(start(), ball(1, "none", 0, { kind: "runOut", out: "striker" }));
  v = derive(m).current;
  assert.equal(v.runs, 1);
  assert.equal(v.batters[0].runs, 1);
  assert.equal(v.batters[0].balls, 1);
  assert.equal(v.striker?.name, "Rahul");
  assert.deepEqual(derive(m).needs, ["nonStriker"]);
  // Same, but they had crossed on the second run: the new batter faces.
  m = run(start(), ball(1, "none", 0, { kind: "runOut", out: "striker", crossed: true }));
  assert.deepEqual(derive(m).needs, ["striker"]);
  assert.equal(derive(m).current.nonStriker?.name, "Rahul");

  // Run out on a wide with one run completed: 2 wides, bowler charged, no wicket for him.
  v = derive(run(start(), ball(0, "wide", 1, { kind: "runOut", out: "nonStriker" }))).current;
  assert.equal(v.runs, 2);
  assert.equal(v.extras.wides, 2);
  assert.equal(v.wickets, 1);
  assert.equal(v.bowlers[0].wickets, 0);
  assert.equal(v.legalBalls, 0);
  // Run out on a no-ball after 2 off the bat.
  v = derive(run(start(), ball(2, "noBall", 0, { kind: "runOut", out: "striker" }))).current;
  assert.equal(v.runs, 3);
  assert.equal(v.batters[0].runs, 2);
  assert.equal(v.batters[0].howOut, "run out");
  assert.equal(v.commentary[0].line, "0.1 OUT! Amit run out 2 (1). No ball, 2 runs completed. Free hit next");

  // Stumped off a wide counts the wide and is the bowler's.
  v = derive(run(start(), ball(0, "wide", 0, { kind: "stumped", fielder: "b4" }))).current;
  assert.equal(v.runs, 1);
  assert.equal(v.bowlers[0].wickets, 1);
  assert.equal(v.batters[0].balls, 0);
  assert.equal(check(start(), ball(0, "wide", 0, { kind: "bowled" })).error, "Off a wide the batter can only be stumped, run out or hit wicket");
  assert.equal(check(start(), ball(0, "noBall", 0, { kind: "stumped" })).error, "Off a no-ball the batter can only be run out");
  assert.equal(check(start(), ball(0, "none", 0, { kind: "bowled", out: "nonStriker" })).error, "The non-striker can only be run out");
  assert.equal(check(start(), ball(2, "none", 0, { kind: "caught" })).error, "If they ran, it can only be a run out");
});

test("caught: the new batter faces unless the batters crossed", () => {
  let m = run(start(), out("caught", { fielder: "b2" }));
  assert.deepEqual(derive(m).needs, ["striker"]);
  m = run(m, bat("a3"));
  assert.equal(derive(m).current.striker?.name, "Karan");
  m = run(start(), out("caught", { fielder: "b2", crossed: true }), bat("a3"));
  assert.equal(derive(m).current.striker?.name, "Rahul");
  assert.equal(derive(m).current.nonStriker?.name, "Karan");
  // Bowled batters cannot have crossed, so a stray flag changes nothing.
  m = run(start(), out("bowled", { crossed: true }), bat("a3"));
  assert.equal(derive(m).current.striker?.name, "Karan");
  // Out on the last ball of the over: the other batter faces the next over.
  m = run(start(), ...times(5, dot), out("bowled"));
  assert.deepEqual(derive(m).needs, ["nonStriker", "bowler"]);
  m = run(m, bat("a3"), bowl("b2"));
  assert.equal(derive(m).current.striker?.name, "Rahul");
});

test("all out at players minus one wickets, then the chase starts", () => {
  let m = start(make({ playersPerSide: 3 }));
  m = run(m, ball(4), out("bowled"), bat("a3"), ball(1), out("bowled"));
  const v = derive(m);
  assert.equal(v.innings[0].ended, "allOut");
  assert.equal(v.innings[0].wickets, 2);
  assert.equal(v.innings.length, 2);
  assert.equal(v.current.index, 1);
  assert.equal(v.current.battingName, "Strikers");
  assert.equal(v.current.target, 6);
  assert.equal(v.inningsBreak, true);
  assert.deepEqual(v.needs, ["striker", "nonStriker", "bowler"]);
  assert.equal(v.chase?.text, "Need 6 runs off 12 balls");
  assert.equal(v.headline, "Strikers need 6 runs off 12 balls");
  assert.deepEqual(
    v.innings[0].fow.map((f) => f.text),
    ["4-1 (Amit, 0.2 ov)", "5-2 (Rahul, 0.4 ov)"],
  );
  // The break is over once the chase openers and bowler are in, before the first ball.
  const picked = derive(run(m, bat("b1"), bat("b2"), bowl("a1")));
  assert.equal(picked.inningsBreak, false);
  assert.equal(picked.ready, true);
  assert.equal(picked.current.striker?.name, "Sameer");
  assert.equal(picked.current.bowler?.name, "Amit");
  assert.equal(picked.chase?.text, "Need 6 runs off 12 balls");
  assert.match(shareText(picked), /\*Strikers 0\/0 \(0\.0 ov\)\*\nNeed 6 runs off 12 balls, RRR 3\.00/);
  // Undo of those picks is back at the break.
  assert.equal(derive(undo(undo(undo(run(m, bat("b1"), bat("b2"), bowl("a1")))))).inningsBreak, true);
});

test("last man stands: the last batter bats alone and always faces", () => {
  let m = start(make({ playersPerSide: 3, rules: { lastManStands: true } }));
  m = run(m, out("bowled"), bat("a3"), out("bowled"));
  let v = derive(m);
  assert.equal(v.current.index, 0, "not all out yet");
  assert.deepEqual(v.needs, []);
  assert.equal(v.current.striker?.name, "Rahul");
  assert.equal(v.current.nonStriker, null);
  m = run(m, ball(1), ball(3), dot(), ball(1));
  v = derive(m);
  // Over ended after 1 off the 6th ball: still Rahul on strike, alone.
  assert.equal(v.current.striker?.name, "Rahul");
  assert.equal(v.current.striker?.runs, 5);
  assert.equal(check(m, { type: "swapStrike" }).error, "The last batter is batting alone");
  m = run(m, bowl("b2"), out("bowled"));
  v = derive(m);
  assert.equal(v.innings[0].ended, "allOut");
  assert.equal(v.innings[0].wickets, 3);
});

test("chase: target passed ends it, won by wickets with balls left", () => {
  let m = run(start(), ball(6), ball(4), ...times(4, dot), bowl("b2"), ...times(6, dot));
  let v = derive(m);
  assert.equal(v.innings[0].ended, "overs");
  assert.equal(v.current.target, 11);
  m = run(m, bat("b1"), bat("b2"), bowl("a1"), ball(4), ball(1));
  v = derive(m);
  assert.equal(v.chase?.runsNeeded, 6);
  assert.equal(v.chase?.ballsLeft, 10);
  assert.equal(v.chase?.rrr?.toFixed(2), "3.60");
  // After 2 balls Titans were 10/0.
  assert.deepEqual(v.chase?.sameStage, { runs: 10, wickets: 0 });
  m = run(m, ball(6));
  v = derive(m);
  assert.equal(v.status, "done");
  assert.equal(v.innings[1].ended, "target");
  assert.equal(v.result?.kind, "wickets");
  assert.equal(v.result?.margin, 5);
  assert.equal(v.result?.text, "Strikers won by 5 wickets with 9 balls left");
  assert.equal(v.headline, v.result?.text);
  assert.equal(check(m, dot()).error, "The match is over. Undo to change the last ball.");
  assert.equal(v.needs.length, 0);
  assert.equal(v.ready, false);
});

test("a wicket on the winning ball does not count (Law 16.6)", () => {
  const msg = "The winning run ends the match, so that wicket does not count. Just score the runs.";
  // Titans 4/0, Strikers 4/4 after 4 balls: level.
  const chase = (overs = 2) => {
    let m = run(start(make({ overs })), ball(4), { type: "endInnings" }, bat("b1"), bat("b2"), bowl("a1"));
    for (let i = 3; i <= 6 && overs === 2; i++) m = run(m, out("bowled"), bat(`b${i}`));
    return m;
  };
  const level = run(chase(), ball(4));
  assert.equal(derive(level).current.score, "4/4");
  const runOut1: BallEvent = { type: "ball", runs: 1, extra: "none", wicket: { kind: "runOut" } };
  const wideStumped: BallEvent = { type: "ball", runs: 0, extra: "wide", wicket: { kind: "stumped" } };
  const nbRunOut: BallEvent = { type: "ball", runs: 1, extra: "noBall", wicket: { kind: "runOut" } };
  const wd4RunOut: BallEvent = { type: "ball", runs: 0, extra: "wide", extraRuns: 4, wicket: { kind: "runOut", out: "nonStriker" } };
  for (const e of [runOut1, wideStumped, nbRunOut, wd4RunOut]) {
    assert.equal(check(level, e).error, msg, JSON.stringify(e));
    assert.equal(apply(level, e), level);
  }
  // A run out with nothing completed does not win it, so it still counts.
  assert.equal(check(level, { type: "ball", runs: 0, extra: "none", wicket: { kind: "runOut" } }).error, null);
  // The same runs without the wicket win it by 1 wicket.
  assert.equal(derive(run(level, ball(1))).result?.text, "Strikers won by 1 wicket with 6 balls left");
  assert.equal(derive(run(level, wd())).result?.text, "Strikers won by 1 wicket with 7 balls left");
  // 1 over a side: a 4 to level, then a run out after 1 completed is still won by 5 wickets.
  const one = run(chase(1), ball(4));
  assert.equal(check(one, runOut1).error, msg);
  // Saved before this check existed: the wicket is dropped, the runs stay.
  for (const [base, e, text, score] of [
    [level, runOut1, "Strikers won by 1 wicket with 6 balls left", "5/4"],
    [level, wideStumped, "Strikers won by 1 wicket with 7 balls left", "5/4"],
    [one, runOut1, "Strikers won by 5 wickets with 4 balls left", "5/0"],
  ] as const) {
    const v = derive({ ...base, events: [...base.events, e] });
    assert.equal(v.ignored, 0);
    assert.equal(v.result?.text, text);
    assert.equal(v.innings[1].score, score);
    assert.equal(v.innings[1].fow.length, v.innings[1].wickets);
    assert.equal(v.innings[1].bowlers[0].wickets, base === level ? 4 : 0);
    assert.doesNotMatch(v.innings[1].byOver.at(-1)!.balls.at(-1)!.chip, /W$/);
    assert.doesNotMatch(v.innings[1].commentary.find((l) => l.event === base.events.length)!.line, /OUT/);
  }
});

test("results: by runs, off the last ball, tie, no result", () => {
  const first = (m: Match) => run(m, ball(4), ...times(5, dot), bowl("b2"), ...times(6, dot)); // 4/0 off 2 overs
  const second = (m: Match) => run(m, bat("b1"), bat("b2"), bowl("a1"));
  let m = second(first(start()));
  m = run(m, ball(2), ...times(5, dot), bowl("a2"), ...times(6, dot));
  assert.equal(derive(m).result?.text, "Titans won by 2 runs");
  m = second(first(start()));
  m = run(m, ...times(6, dot), bowl("a2"), ...times(5, dot), ball(4));
  assert.equal(derive(m).result?.text, "Match tied");
  m = second(first(start()));
  m = run(m, ...times(6, dot), bowl("a2"), ...times(5, dot), ball(6));
  assert.equal(derive(m).result?.text, "Strikers won by 5 wickets off the last ball");
  m = run(start(), ball(1), { type: "endInnings", reason: "abandoned" });
  assert.equal(derive(m).result?.text, "No result");
  assert.equal(derive(m).status, "done");
  m = run(start(), ball(1), { type: "endInnings", reason: "declared" });
  assert.equal(derive(m).current.index, 1);
  assert.equal(derive(m).current.target, 2);
  assert.equal(derive(run(start(), ball(1), { type: "endInnings", reason: "declared" }, { type: "endInnings" })).result?.text, "Titans won by 1 run");
});

test("a bowler cannot bowl two overs in a row: warned, not blocked", () => {
  let m = run(start(make({ overs: 4, rules: { maxOversPerBowler: 1 } })), ...times(6, dot));
  const c = check(m, bowl("b1"));
  assert.equal(c.error, null);
  assert.deepEqual(c.warnings, ["Sameer bowled the last over. A bowler cannot bowl two overs in a row.", "Sameer has bowled all 1 over"]);
  const v = derive(m);
  const opt = Object.fromEntries(v.bowlerOptions.map((o) => [o.name, o.blocked]));
  assert.equal(opt.Sameer, "quota");
  assert.equal(opt.Vikas, null);
  m = run(m, bowl("b1"));
  assert.deepEqual(derive(m).warnings, ["Sameer bowled the last over too", "Sameer has bowled all 1 over"]);
  m = run(m, bowl("b2"), ...times(6, dot));
  assert.equal(derive(m).bowlerOptions.find((o) => o.name === "Vikas")!.blocked, "quota");
  assert.equal(check(m, bowl("b3")).warnings.length, 0);
});

test("batting card, bowling card, extras and rates", () => {
  const m = run(start(), ball(4), ball(1), ball(6), wd(), dot(), bye(1), ball(2), bowl("b2"), lb(1), nb(1), ball(3));
  const v = derive(m).current;
  const amit = v.batters[0];
  const rahul = v.batters[1];
  assert.deepEqual([amit.name, amit.runs, amit.balls, amit.fours, amit.sixes, amit.dots], ["Amit", 8, 4, 1, 0, 0]);
  assert.deepEqual([rahul.name, rahul.runs, rahul.balls, rahul.fours, rahul.sixes, rahul.dots], ["Rahul", 9, 5, 0, 1, 3]);
  assert.equal(amit.sr, 200);
  assert.equal(v.runs, 4 + 1 + 6 + 1 + 0 + 1 + 2 + 1 + 2 + 3);
  assert.deepEqual(v.extras, { wides: 1, noBalls: 1, byes: 1, legByes: 1, total: 4 });
  assert.equal(v.extrasText, "Extras 4 (wd 1, nb 1, b 1, lb 1)");
  const [sameer, vikas] = v.bowlers;
  assert.deepEqual([sameer.overs, sameer.runs, sameer.wides, sameer.dots, sameer.figures], ["1.0", 14, 1, 2, "0/14"]);
  assert.equal(sameer.econ, 14);
  assert.deepEqual([vikas.overs, vikas.runs, vikas.noBalls], ["0.2", 5, 1]);
  assert.equal(v.overs, "1.2");
  // 21 off 8 balls: 15.75 an over, 31.5 at that rate over 2 overs.
  assert.equal(v.crr?.toFixed(2), "15.75");
  assert.equal(v.projected, 32);
  // Batter runs plus extras is the total; bowler runs plus byes and leg byes too.
  assert.equal(v.batters.reduce((s, b) => s + b.runs, 0) + v.extras.total, v.runs);
  assert.equal(v.bowlers.reduce((s, b) => s + b.runs, 0) + v.extras.byes + v.extras.legByes, v.runs);
  assert.equal(v.fours, 1);
  assert.equal(v.sixes, 1);
});

test("partnerships, fall of wickets and last wicket", () => {
  const m = run(start(), ball(4), ball(1), ball(2), out("caught", { fielder: "b3" }), bat("a3"), ball(1), wd());
  const v = derive(m).current;
  assert.equal(v.partnerships.length, 2);
  const [p1, p2] = v.partnerships;
  assert.equal(p1.runs, 7);
  assert.equal(p1.balls, 4);
  assert.equal(p1.unbroken, false);
  assert.deepEqual(
    p1.batters.map((b) => [b.name, b.runs, b.balls]),
    [
      ["Amit", 5, 2],
      ["Rahul", 2, 2],
    ],
  );
  assert.equal(p1.text, "Amit and Rahul, 7 (4)");
  assert.equal(p2.unbroken, true);
  assert.equal(p2.runs, 2);
  assert.equal(v.partnership?.text, "Amit and Karan, 2 (1)");
  assert.equal(v.fow[0].text, "7-1 (Rahul, 0.4 ov)");
  assert.equal(v.lastWicket, "Rahul c Nikhil b Sameer 2 (2), 7-1 (0.4 ov)");
});

test("over by over and the worm", () => {
  const m = run(start(), ball(4), ...times(4, dot), out("bowled"), bat("a3"), bowl("b2"), ball(6), wd());
  const v = derive(m).current;
  assert.deepEqual(
    v.byOver.map((o) => [o.number, o.bowlerName, o.runs, o.wickets, o.complete, o.totalRuns]),
    [
      [1, "Sameer", 4, 1, true, 4],
      [2, "Vikas", 7, 0, false, 11],
    ],
  );
  assert.deepEqual(v.worm, [
    { balls: 0, runs: 0, wickets: 0 },
    { balls: 6, runs: 4, wickets: 1 },
    { balls: 7, runs: 11, wickets: 1 },
  ]);
  assert.equal(v.thisOver?.number, 2);
  assert.deepEqual(
    v.thisOver?.balls.map((b) => b.chip),
    ["6", "Wd"],
  );
});

test("commentary lines read like a scorer", () => {
  const m = run(start(), ball(4), wd(), dot(), out("caught", { fielder: "b2" }), bat("a3"), bye(2), ...times(2, dot));
  const lines = derive(m).current.commentary.map((c) => c.line);
  assert.deepEqual(lines, [
    "0.1 Sameer to Amit, FOUR",
    "0.2 Sameer to Amit, wide",
    "0.2 Sameer to Amit, no run",
    "0.3 OUT! Amit c Vikas b Sameer 4 (3)",
    "0.4 Sameer to Karan, 2 byes",
    "0.5 Sameer to Karan, no run",
    "0.6 Sameer to Karan, no run",
    "End of over 1: 7 runs, 1 wicket (Sameer). Titans 7/1",
  ]);
  for (const l of lines) assert.doesNotMatch(l, /\u2014/);
});

test("a wicket maiden says so", () => {
  let v = derive(run(start(), dot(), dot(), out("bowled"), bat("a3"), ...times(3, dot))).current;
  assert.equal(v.byOver[0].maiden, true);
  assert.equal(v.commentary.at(-1)!.line, "End of over 1: wicket maiden (Sameer). Titans 0/1");
  v = derive(run(start(), out("bowled"), bat("a3"), out("lbw"), bat("a4"), ...times(4, dot))).current;
  assert.equal(v.commentary.at(-1)!.line, "End of over 1: wicket maiden, 2 wickets (Sameer). Titans 0/2");
  v = derive(run(start(), ...times(6, dot))).current;
  assert.equal(v.commentary.at(-1)!.line, "End of over 1: maiden (Sameer). Titans 0/0");
});

test("renames apply everywhere, new players join mid-match", () => {
  let m = make({ players: {} });
  assert.equal(newPlayerId(m, "a"), "a1");
  m = run(m, bat("a1", undefined, "Amit"), bat("a2", undefined, "Rahul"), { type: "setBowler", player: "b1", name: "Player" }, ball(4));
  assert.equal(newPlayerId(m, "a"), "a3");
  assert.equal(newPlayerId(m, "b"), "b2");
  m = run(m, { type: "renamePlayer", team: "b", player: "b1", name: "Sameer" });
  const v = derive(m);
  assert.equal(v.current.commentary[0].line, "0.1 Sameer to Amit, FOUR");
  assert.equal(v.current.bowler?.name, "Sameer");
  assert.deepEqual(
    v.teams.a.players.map((p) => p.name),
    ["Amit", "Rahul"],
  );
  assert.equal(check(m, bat("a9", undefined, "Zed")).error, "Both batters are in. Retire someone first.");
  m = run(m, { type: "addPlayer", team: "a", player: "a3", name: "Karan" });
  assert.deepEqual(
    derive(m).batterOptions.map((p) => p.name),
    ["Karan"],
  );
  assert.equal(check(m, { type: "addPlayer", team: "a", player: "a3", name: "Again" }).error, "That player is already in the team");
});

test("retired hurt is not a wicket and can come back; retired out is", () => {
  let m = run(start(), ball(4), { type: "retire", out: "striker", kind: "retiredHurt" });
  let v = derive(m);
  assert.equal(v.current.wickets, 0);
  assert.deepEqual(v.needs, ["striker"]);
  assert.equal(v.current.batters[0].howOut, "retired hurt");
  assert.equal(v.current.commentary.at(-1)!.line, "Amit retired hurt 4 (1)");
  m = run(m, bat("a3"), ball(1), { type: "retire", out: "nonStriker", kind: "retiredOut" });
  v = derive(m);
  assert.equal(v.current.wickets, 1);
  assert.equal(v.current.fow[0].name, "Karan");
  const back = v.batterOptions.find((o) => o.name === "Amit")!;
  assert.equal(back.retiredHurt, true);
  assert.equal(check(m, bat("a1")).warnings[0], "Amit comes back after retiring hurt");
  m = run(m, bat("a1"));
  v = derive(m);
  assert.equal(v.current.nonStriker?.name, "Amit");
  assert.equal(v.current.nonStriker?.runs, 4);
  assert.equal(v.current.nonStriker?.status, "batting");
  assert.equal(check(start(), out("bowled", { kind: "retiredHurt" as never })).error, "Use retire for a retirement, it is not a ball");
});

test("retired out counts in its over, the worm and the end of over line", () => {
  const retOut: MatchEvent = { type: "retire", out: "striker", kind: "retiredOut" };
  let v = derive(run(start(), ball(1), retOut, bat("a3"), ...times(5, dot))).current;
  assert.equal(v.score, "1/1");
  assert.deepEqual(
    v.byOver.map((o) => [o.wickets, o.totalRuns, o.totalWickets]),
    [[1, 1, 1]],
  );
  assert.deepEqual(v.worm.at(-1), { balls: 6, runs: 1, wickets: 1 });
  assert.equal(v.commentary.find((l) => l.kind === "over")!.text, "End of over 1: 1 run, 1 wicket (Sameer). Titans 1/1");
  // Between overs it stays with the over just finished, like its fall of wicket (1-1 at 1.0 ov).
  v = derive(run(start(), ball(1), ...times(5, dot), retOut, bat("a3"), bowl("b2"), dot())).current;
  assert.deepEqual(
    v.byOver.map((o) => [o.wickets, o.totalWickets]),
    [
      [1, 1],
      [0, 1],
    ],
  );
  assert.equal(v.fow[0].text, "1-1 (Amit, 1.0 ov)");
  // Before the first ball there is no over yet: the first over carries it.
  v = derive(run(start(), retOut, bat("a3"), dot())).current;
  assert.deepEqual(
    v.byOver.map((o) => [o.wickets, o.totalWickets]),
    [[1, 1]],
  );
});

test("retire-at house rule is flagged", () => {
  const m = run(start(make({ rules: { retireAt: 10 } })), ball(6), ball(4));
  const v = derive(m);
  assert.deepEqual(v.retireDue, ["a1"]);
  assert.equal(v.warnings[0], "Amit has 10, time to retire as per your rule");
});

test("house rules: 0-run wides, 2-run no-balls", () => {
  const v = derive(run(start(make({ rules: { wideRuns: 0, noBallRuns: 2 } })), wd(), nb(1))).current;
  assert.equal(v.runs, 3);
  assert.deepEqual(v.extras, { wides: 0, noBalls: 2, byes: 0, legByes: 0, total: 2 });
  assert.equal(v.bowlers[0].wides, 1);
});

test("hat-trick and fifty show up in the commentary", () => {
  let m = start(make({ playersPerSide: 11 }));
  m = run(m, out("bowled"), bat("a3"), out("lbw"), bat("a4"));
  assert.equal(derive(m).onHatTrick, true);
  m = run(m, out("caught", { fielder: "b5" }));
  assert.match(derive(m).current.commentary.at(-1)!.line, /HAT-TRICK for Sameer!$/);
  let f = start(make({ overs: 20 }));
  for (let o = 0; o < 3; o++) f = run(f, ...times(6, () => ball(o % 2 ? 1 : 6)).slice(0, 6), bowl(o % 2 ? "b1" : "b2"));
  const fifty = derive(f).current.commentary.find((c) => /reaches 50/.test(c.text));
  assert.ok(fifty, "fifty line");
  assert.match(fifty!.text, /reaches 50 off \d+ balls/);
});

test("changing overs mid-innings applies from there on", () => {
  let m = run(start(make({ overs: 6 })), ...times(6, dot), bowl("b2"), dot());
  assert.equal(derive(m).current.maxBalls, 36);
  const c = check(m, { type: "changeSetup", overs: 1 });
  assert.deepEqual(c.warnings, ["This ends the current innings"]);
  m = run(m, { type: "changeSetup", overs: 1 });
  const v = derive(m);
  assert.equal(v.innings[0].ended, "overs");
  assert.equal(v.current.index, 1);
  assert.equal(v.current.maxBalls, 6);
  m = run(m, { type: "changeSetup", teamA: "Titans XI" });
  assert.equal(derive(m).innings[0].battingName, "Titans XI");
});

test("checks refuse bad events and apply returns the same match", () => {
  const m = start();
  assert.equal(apply(m, ball(9)), m);
  assert.equal(check(m, ball(9)).error, "Runs off the bat are 0 to 7");
  assert.equal(check(m, ball(0, "none", 2)).error, "Extra runs need a wide, no-ball, bye or leg bye");
  assert.equal(check(m, ball(2, "noBall", 1)).error, "On a no-ball the runs are off the bat or byes, not both");
  assert.equal(check(m, bat("a1")).error, "Amit is already batting");
  assert.equal(check(m, bowl("b1")).error, "Sameer is already bowling");
  assert.equal(check(m, bat("zz")).error, "Type the batter's name");
  assert.equal(check(m, { type: "nope" } as unknown as MatchEvent).error, "That is not a scoring event");
  const afterOut = run(m, out("bowled"));
  assert.equal(check(afterOut, bat("a1")).error, "Amit is already out");
  assert.equal(check(afterOut, bat("a3", "nonStriker")).error, "Someone is already batting at that end");
});

test("undo drops the last event; undoBall drops the ball and the picks after it", () => {
  const base = run(start(), ball(4), ball(1));
  const withOut = run(base, out("bowled"), bat("a3"), { type: "renamePlayer", team: "a", player: "a3", name: "Karan K" });
  assert.equal(derive(undo(withOut)).current.batters.find((b) => b.id === "a3")?.name, "Karan");
  const back = undoBall(withOut);
  assert.equal(back.events.length, base.events.length + 1);
  const v = derive(back);
  assert.equal(v.current.wickets, 0);
  assert.equal(v.teams.a.players.find((p) => p.id === "a3")?.name, "Karan K");
  assert.equal(derive(base).lastAction, "0.2 1 run");
  assert.equal(derive(run(base, out("bowled"))).lastAction, "0.3 OUT");
  assert.equal(derive(run(base, out("bowled"), bat("a3"))).lastAction, "Karan in");
  assert.equal(undo(make()).events.length, 0);
});

test("describeBall chips and tones", () => {
  assert.equal(describeBall(dot()), ".");
  assert.equal(describeBall(ball(1)), "1");
  assert.equal(describeBall(ball(4)), "4");
  assert.equal(describeBall(ball(6)), "6");
  assert.equal(describeBall(out("bowled")), "W");
  assert.equal(describeBall(wd()), "Wd");
  assert.equal(describeBall(wd(1)), "Wd+1");
  assert.equal(describeBall(nb(4)), "Nb+4");
  assert.equal(describeBall(nb()), "Nb");
  assert.equal(describeBall(nb(0, 1)), "Nb+1b");
  assert.equal(describeBall(lb(2)), "2lb");
  assert.equal(describeBall(bye(1)), "1b");
  assert.equal(describeBall(ball(1, "none", 0, { kind: "runOut" })), "1+W");
  assert.equal(describeBall(ball(0, "wide", 0, { kind: "stumped" })), "Wd+W");
  assert.equal(ballTone(ball(6)), "six");
  assert.equal(ballTone(nb(4)), "four");
  assert.equal(ballTone(wd()), "extra");
  assert.equal(ballTone(out("lbw")), "wicket");
  assert.equal(ballTone(ball(2)), "run");
  assert.equal(ballTone(dot()), "dot");
});

/** Two overs a side: Titans 14/2, then Strikers chase it down with Vikas starring. */
function finished(): Match {
  let m = start(make({ title: "Sunday Box League", venue: "Kothrud Turf" }));
  m = run(m, ball(4), ball(1), out("caught", { fielder: "b2" }), bat("a3"), ball(2), dot(), ball(1));
  m = run(m, bowl("b2"), ball(1), dot(), ball(4), lb(1), dot(), out("bowled"));
  // Titans 14/2 in 2 overs. Strikers need 15.
  return m;
}

test("full match: share text, awards and the result card", () => {
  let m = finished();
  let v = derive(m);
  assert.equal(v.innings[0].summary, "Titans 14/2 (2.0 ov)");
  assert.equal(v.inningsBreak, true);
  assert.equal(shareText(v), "Titans vs Strikers, Sunday Box League\nTitans 14/2 (2.0 ov)\n*Innings break.* Strikers need 15 runs off 12 balls\nScored ball by ball on TapTurf.in");
  m = run(m, bat("b1"), bat("b2"), bowl("a1"), ball(1), ball(6), ball(4));
  v = derive(m);
  assert.equal(
    shareText(v),
    [
      "Titans vs Strikers, Sunday Box League",
      "Titans 14/2 (2.0 ov)",
      "*Strikers 11/0 (0.3 ov)*",
      "Need 4 runs off 9 balls, RRR 2.67",
      "Vikas 10* (2), Sameer 1* (1)",
      "Bowling: Amit 0.3-0-11-0",
      "This over: 1 6 4",
      "Scored ball by ball on TapTurf.in",
    ].join("\n"),
  );
  m = run(m, ball(4));
  v = derive(m);
  assert.equal(v.status, "done");
  assert.equal(v.result?.text, "Strikers won by 5 wickets with 8 balls left");
  assert.equal(v.awards.topScorer?.text, "Vikas 14* (3)");
  assert.equal(v.awards.bestBowler?.text, "Vikas 1/5");
  assert.equal(v.awards.potm?.name, "Vikas");
  const done = shareText(v, { link: "https://www.tapturf.in/tools/x" });
  assert.equal(
    done,
    [
      "*Strikers won by 5 wickets with 8 balls left*",
      "Titans vs Strikers, Sunday Box League",
      "Titans 14/2 (2.0 ov)",
      "Strikers 15/0 (0.4 ov)",
      "Top scorer: Vikas 14* (3)",
      "Best bowler: Vikas 1/5",
      "Player of the match: Vikas",
      "Live score: https://www.tapturf.in/tools/x",
    ].join("\n"),
  );
  assert.deepEqual(toScorecard(v), {
    tournament: "Sunday Box League",
    aName: "Titans",
    aRuns: "14",
    aWkts: "2",
    aOvers: "2.0",
    bName: "Strikers",
    bRuns: "15",
    bWkts: "0",
    bOvers: "0.4",
    result: "Strikers won by 5 wickets with 8 balls left",
    potm: "Vikas",
    topScorer: "Vikas 14* (3)",
    bestBowler: "Vikas 1/5",
    venue: "Kothrud Turf",
  });
});

test("saved matches restore exactly", () => {
  const m = finished();
  const back = restoreMatch(JSON.stringify(m));
  assert.ok(back);
  assert.deepEqual(derive(back!), derive(m));
  assert.equal(restoreMatch("{bad json"), null);
  assert.equal(restoreMatch({ v: 2 }), null);
  assert.equal(restoreMatch(null), null);
});

/** Deterministic random numbers for the soak test. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Play a random but legal match, picking batters and bowlers when asked. */
function randomMatch(seed: number, setup: SetupInput, wicketRate = 0.1): Match {
  const r = rng(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  let m = newMatch({ teamA: "A", teamB: "B", ...setup }, { id: `r${seed}`, now: 0 });
  for (let guard = 0; guard < 2000; guard++) {
    const v = derive(m);
    if (v.status === "done") break;
    let e: MatchEvent;
    if (v.needs.includes("striker") || v.needs.includes("nonStriker")) {
      const opts = v.batterOptions;
      const side = v.current.batting;
      e = opts.length && r() < 0.8 ? bat(pick(opts).id) : { type: "setBatter", player: newPlayerId(m, side), name: `New ${guard}` };
    } else if (v.needs.includes("bowler")) {
      const ok = v.bowlerOptions.filter((o) => !o.blocked);
      e = ok.length ? bowl(pick(ok).id) : { type: "setBowler", player: newPlayerId(m, v.current.bowling), name: `Bowler ${guard}` };
    } else {
      const x = r();
      const extra: Extra = x < 0.08 ? "wide" : x < 0.13 ? "noBall" : x < 0.17 ? "bye" : x < 0.2 ? "legBye" : "none";
      const runs = extra === "none" || extra === "noBall" ? pick([0, 0, 0, 1, 1, 2, 3, 4, 4, 6, 5]) : 0;
      const extraRuns = extra === "bye" || extra === "legBye" ? pick([1, 1, 2, 4]) : extra === "wide" && r() < 0.2 ? pick([1, 4]) : 0;
      let wicket: BallWicket | undefined;
      // No wicket on the ball that wins the chase: the match is already over (check refuses it).
      const wins = v.chase !== null && breakdown({ type: "ball", runs, extra, extraRuns }, v.setup.rules).total >= v.chase.runsNeeded;
      if (r() < wicketRate && !wins) {
        const o: End = r() < 0.15 && v.current.nonStriker ? "nonStriker" : "striker";
        const kinds = allowedWicketKinds(extra, { freeHit: v.freeHit, out: o, runs: runs + extraRuns });
        wicket = { kind: pick(kinds), out: o, fielder: pick(["b1", "a2", "Sub"]), crossed: r() < 0.3 };
      }
      e = { type: "ball", runs, extra, extraRuns, ...(wicket ? { wicket } : {}) };
      if (r() < 0.02) e = { type: "retire", out: "striker", kind: r() < 0.5 ? "retiredHurt" : "retiredOut" };
    }
    const next = apply(m, e);
    if (next === m) assert.fail(`refused ${JSON.stringify(e)}: ${check(m, e).error}`);
    m = next;
  }
  return m;
}

test("soak: random matches keep every total consistent, and undo is exact", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const setup: SetupInput = {
      overs: 3 + (seed % 8),
      playersPerSide: 4 + (seed % 7),
      rules: { lastManStands: seed % 3 === 0, wideRuns: seed % 5 === 0 ? 0 : 1, noBallRuns: seed % 7 === 0 ? 2 : 1, freeHit: seed % 4 !== 0 },
    };
    const m = randomMatch(seed, setup);
    const v = derive(m);
    assert.equal(v.status, "done", `seed ${seed} finished`);
    assert.equal(v.ignored, 0);
    for (const inn of v.innings) {
      const batRuns = inn.batters.reduce((s, b) => s + b.runs, 0);
      const bowlRuns = inn.bowlers.reduce((s, b) => s + b.runs, 0);
      const bowlBalls = inn.bowlers.reduce((s, b) => s + b.balls, 0);
      const overRuns = inn.byOver.reduce((s, o) => s + o.runs, 0);
      const partRuns = inn.partnerships.reduce((s, p) => s + p.runs, 0);
      assert.equal(batRuns + inn.extras.total, inn.runs, `seed ${seed} batters + extras`);
      assert.equal(bowlRuns + inn.extras.byes + inn.extras.legByes, inn.runs, `seed ${seed} bowlers + byes`);
      assert.equal(bowlBalls, inn.legalBalls, `seed ${seed} bowler balls`);
      assert.equal(overRuns, inn.runs, `seed ${seed} overs`);
      assert.equal(partRuns, inn.runs, `seed ${seed} partnerships`);
      assert.equal(inn.fow.length, inn.wickets, `seed ${seed} fow`);
      assert.equal(inn.byOver.reduce((s, o) => s + o.wickets, 0), inn.wickets, `seed ${seed} over wickets`);
      assert.equal(inn.byOver.at(-1)?.totalWickets ?? 0, inn.wickets, `seed ${seed} over totals`);
      assert.ok(inn.legalBalls <= inn.maxBalls);
      assert.equal(inn.worm.at(-1)!.runs, inn.runs);
      for (const o of inn.byOver.slice(0, -1)) assert.equal(o.legalBalls, 6, `seed ${seed} full overs`);
      for (const line of inn.commentary) assert.doesNotMatch(line.line, /\u2014|undefined|NaN/);
    }
    assert.ok(v.result, `seed ${seed} result`);
    assert.doesNotMatch(shareText(v), /\u2014|undefined|NaN/);
    // Undo is a pure prefix: derive(undo(m)) equals deriving the shorter list.
    const cut = Math.floor(m.events.length / 2);
    const prefix: Match = { ...m, events: m.events.slice(0, cut) };
    let u = m;
    while (u.events.length > cut) u = undo(u);
    assert.deepEqual(derive(u), derive(prefix));
  }
});

test("derive is instant over a long match", () => {
  const m = randomMatch(7, { overs: 50, playersPerSide: 11 }, 0.015);
  assert.ok(m.events.length > 300, `long match (${m.events.length} events)`);
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) derive(m);
  const each = (performance.now() - t0) / 20;
  assert.ok(each < 20, `derive took ${each.toFixed(2)} ms`);
});
