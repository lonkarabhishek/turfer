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
  sanitizeMatch,
  shareText,
  toScorecard,
  undo,
  undoBall,
  type BallEvent,
  type BallWicket,
  type BallWicketKind,
  type ChangeSetupEvent,
  type End,
  type Extra,
  type Match,
  type MatchEvent,
  type SetupInput,
  type Side,
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

/* ------------------------------------------------------------------ */
/* sanitizeMatch: what the live link reads                             */
/* ------------------------------------------------------------------ */

const WICKETS: BallWicketKind[] = ["bowled", "caught", "lbw", "runOut", "stumped", "hitWicket", "obstructing"];
const EVENT_TYPES: MatchEvent["type"][] = ["ball", "setBatter", "setBowler", "swapStrike", "retire", "endInnings", "addPlayer", "renamePlayer", "changeSetup"];
/** The match as it travels: JSON. */
const wire = (m: Match): unknown => JSON.parse(JSON.stringify(m));

/**
 * A random legal match with every kind of event the scorer makes, built
 * through the public API: events check() refuses are skipped, so only
 * legal ones go in. seen counts what went in.
 */
function anyMatch(seed: number, seen: Map<string, number>): Match {
  const r = rng(seed * 7919);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const chance = (p: number) => r() < p;
  const NAMES = ["Amit", "Rahul K", "Sameer", "Vikas Rao", "Om", "Dev", "Jay", "Ravi"];
  // Longer than 40 and cut at a space: the roster keeps that trailing space, and so must the round trip.
  const LONG = "Very Long Name Very Long Name Very Long Name";
  let m = newMatch(
    {
      teamA: pick(["Titans", "Kothrud Kings", ""]),
      teamB: pick(["Strikers", "Baner Boys XI"]),
      overs: 1 + Math.floor(r() * 3),
      playersPerSide: 3 + Math.floor(r() * 4),
      battingFirst: pick(["a", "b"] as const),
      rules: { wideRuns: pick([0, 1, 2]), noBallRuns: pick([1, 2]), freeHit: chance(0.7), lastManStands: chance(0.3), maxOversPerBowler: pick([null, 1, 2]), retireAt: pick([null, 10]) },
      players: { a: [...NAMES.slice(0, Math.floor(r() * 5)), ...(chance(0.3) ? [LONG] : [])], b: NAMES.slice(3, 3 + Math.floor(r() * 5)) },
      title: chance(0.5) ? "Sunday League" : "",
      venue: chance(0.5) ? "Kothrud Turf, Pune" : "",
    },
    { id: `s${seed}`, now: 1_760_000_000_000 + seed },
  );
  for (let step = 0; step < 300; step++) {
    const v = derive(m);
    if (v.status === "done") break;
    const inn = v.current;
    // The scorer stamps each tap; events made through the API may have no time.
    const at = chance(0.8) ? { at: 1_760_000_000_000 + step * 997 + (chance(0.2) ? 0.25 : 0) } : {};
    const fresh = (side: Side, role: string) => ({ player: newPlayerId(m, side), name: `${role} ${step}` });
    const x = r();
    let e: MatchEvent;
    if (v.needs.includes("striker") || v.needs.includes("nonStriker")) {
      const opts = v.batterOptions;
      e = { type: "setBatter", ...(opts.length && chance(0.7) ? { player: pick(opts).id } : fresh(inn.batting, "Batter")), ...(chance(0.2) ? { end: v.needs[0] as End } : {}), ...at };
    } else if (v.needs.includes("bowler") || x < 0.02) {
      const ok = v.bowlerOptions.filter((o) => !o.blocked && !o.current);
      e = { type: "setBowler", ...(ok.length && chance(0.8) ? { player: pick(ok).id } : fresh(inn.bowling, "Bowler")), ...at };
    } else if (x < 0.04) e = { type: "swapStrike", ...at };
    else if (x < 0.06) e = { type: "retire", out: pick(["striker", "nonStriker"] as const), kind: pick(["retiredHurt", "retiredOut"] as const), ...at };
    else if (x < 0.08) {
      const side = pick(["a", "b"] as const);
      e = { type: "addPlayer", team: side, ...fresh(side, "Sub"), ...at };
    } else if (x < 0.1) {
      const side = pick(["a", "b"] as const);
      const players = v.teams[side].players;
      if (!players.length) continue;
      e = { type: "renamePlayer", team: side, player: pick(players).id, name: pick([...NAMES, "y".repeat(40)]), ...at };
    } else if (x < 0.12) {
      const c: ChangeSetupEvent = { type: "changeSetup", ...at };
      // 40 characters: the settings sheet allows it, the engine reads 32.
      if (chance(0.3)) c.teamA = "Kothrud Kings Cricket Club of Pune East";
      if (chance(0.3)) c.overs = v.setup.overs + pick([-1, 1, 2]);
      // 40 players can be typed in settings; the engine reads 30.
      if (chance(0.3)) c.playersPerSide = pick([4, 6, 40]);
      if (chance(0.3)) c.rules = chance(0.5) ? { ...v.setup.rules, freeHit: !v.setup.rules.freeHit } : { lastManStands: chance(0.5) };
      if (chance(0.2)) c.title = pick(["", "Final"]);
      if (chance(0.2)) c.venue = "Baner";
      e = c;
    } else if (x < 0.125) e = { type: "endInnings", ...(chance(0.6) ? { reason: pick(["declared", "abandoned"] as const) } : {}), ...at };
    else if (x < 0.14) {
      m = chance(0.5) ? undoBall(m) : undo(m);
      continue;
    } else {
      const extra = pick(["none", "none", "none", "none", "wide", "noBall", "bye", "legBye"] as const);
      const runs = extra === "none" || extra === "noBall" ? pick([0, 0, 1, 2, 3, 4, 6, 5]) : 0;
      const extraRuns = extra === "bye" || extra === "legBye" ? pick([1, 2, 4]) : extra === "wide" ? pick([0, 0, 1, 4]) : extra === "noBall" && !runs ? pick([0, 1, 2]) : 0;
      const wicket: BallWicket | null = chance(0.15)
        ? { kind: pick(WICKETS), ...(chance(0.25) ? { out: pick(["striker", "nonStriker"] as const) } : {}), ...(chance(0.5) ? { fielder: pick(["b1", "a2", "Sub fielder"]) } : {}), ...(chance(0.3) ? { crossed: chance(0.5) } : {}) }
        : null;
      e = {
        type: "ball",
        runs,
        extra,
        ...(extraRuns || chance(0.3) ? { extraRuns } : {}),
        ...(extra === "noBall" && extraRuns ? { noBallExtra: pick(["bye", "legBye"] as const) } : {}),
        ...(wicket ? { wicket } : {}),
        ...at,
      };
    }
    const next = apply(m, e);
    if (next === m) continue;
    m = next;
    for (const k of [e.type, e.type === "ball" ? e.extra : null, e.type === "ball" ? e.wicket?.kind : e.type === "retire" ? e.kind : null]) if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return m;
}

test("sanitizeMatch: every match the engine makes comes back exactly", () => {
  const seen = new Map<string, number>();
  for (let seed = 1; seed <= 150; seed++) {
    const m = anyMatch(seed, seen);
    const s = sanitizeMatch(wire(m));
    assert.deepEqual(s, m, `seed ${seed}`);
    assert.deepEqual(derive(s!), derive(m), `seed ${seed} derive`);
  }
  for (const k of [...EVENT_TYPES, ...WICKETS, "retiredHurt", "retiredOut", "wide", "noBall", "bye", "legBye"]) assert.ok(seen.get(k), `no ${k} in any match`);
  for (let seed = 1; seed <= 30; seed++) {
    const m = randomMatch(seed, { overs: 3 + (seed % 5), playersPerSide: 4 + (seed % 7) });
    assert.deepEqual(sanitizeMatch(wire(m)), m, `soak seed ${seed}`);
  }
  assert.deepEqual(sanitizeMatch(wire(finished())), finished());
  assert.deepEqual(sanitizeMatch(wire(newMatch({}, { id: "x", now: 1 }))), newMatch({}, { id: "x", now: 1 }));
});

test("sanitizeMatch: extra keys are dropped everywhere", () => {
  const m = finished();
  const padded = {
    ...m,
    evil: "<script>",
    setup: {
      ...m.setup,
      evil: 1,
      rules: { ...m.setup.rules, evil: 2 },
      players: { a: m.setup.players.a.map((p) => ({ ...p, evil: 3 })), b: m.setup.players.b, c: [{ id: "a1", name: "Nope" }] },
    },
    events: m.events.map((e) => ({ ...e, evil: 4, ...(e.type === "ball" && e.wicket ? { wicket: { ...e.wicket, evil: 5 } } : {}) })),
  };
  assert.deepEqual(sanitizeMatch(padded), m);
  // A "__proto__" key from JSON is just a key: dropped, and nothing is polluted.
  const proto = sanitizeMatch({ ...m, events: [JSON.parse('{"type": "swapStrike", "__proto__": {"polluted": true}}')] });
  assert.deepEqual(proto?.events, [{ type: "swapStrike" }]);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("sanitizeMatch: objects where ids and names go are refused, never stringified", () => {
  const m = finished();
  // String() on this throws, so the sanitiser must never call it on what it is given.
  const trap: unknown = JSON.parse('{"toString": 1, "valueOf": 1}');
  assert.throws(() => String(trap));
  const s = sanitizeMatch({
    ...m,
    id: { $gt: "" },
    setup: {
      ...m.setup,
      teamA: { name: "Titans" },
      teamB: ["Strikers"],
      title: 42,
      venue: trap,
      overs: trap,
      rules: { wideRuns: trap, freeHit: trap },
      players: { a: [{ id: { x: 1 }, name: "Ghost" }, { id: "a1", name: { first: "Amit" } }, { id: "a2", name: trap }, "a9", null], b: "b1" },
    },
    events: [
      { type: "setBatter", player: { id: "a1" } },
      { type: "setBatter", player: "a1", name: trap },
      { type: "setBowler", player: ["b1"] },
      { type: "addPlayer", team: "a", player: "a7", name: ["Sam"] },
      { type: "renamePlayer", team: { a: 1 }, player: "a1", name: "Sam" },
      { type: "renamePlayer", team: "a", player: "a1", name: trap },
      { type: "ball", runs: { n: 4 }, extra: "none", extraRuns: trap, wicket: { kind: "caught", fielder: { id: "b2" }, out: {}, crossed: "yes" } },
      { type: "ball", runs: 1, extra: { none: 1 } },
      { type: "ball", runs: 1, extra: "none", wicket: { kind: trap } },
      { type: "changeSetup", teamA: trap, overs: trap, rules: trap, title: ["Final"] },
    ],
  });
  assert.ok(s);
  assert.equal(s.id, "match");
  assert.deepEqual([s.setup.teamA, s.setup.teamB, s.setup.title, s.setup.venue, s.setup.overs, s.setup.rules.wideRuns, s.setup.rules.freeHit], ["Team A", "Team B", "", "", 6, 1, true]);
  assert.deepEqual(s.setup.players, { a: [{ id: "a1", name: "a1" }, { id: "a2", name: "a2" }], b: [] });
  assert.deepEqual(s.events, [
    { type: "setBatter", player: "a1" },
    { type: "ball", runs: 0, extra: "none", wicket: { kind: "caught" } },
    { type: "ball", runs: 1, extra: "none" },
    // The trap is an object, so it reads as rules with nothing usable in them: no change.
    { type: "changeSetup", rules: {} },
  ]);
  assert.doesNotThrow(() => derive(s));
});

test("sanitizeMatch: 300 KB strings are cut to the engine's lengths", () => {
  const m = finished();
  const big = "x ".repeat(150_000);
  const s = sanitizeMatch({
    ...m,
    id: big,
    setup: { ...m.setup, teamA: big, teamB: big, title: big, venue: big, players: { a: [{ id: "a1", name: big }], b: [] } },
    events: [
      { type: "setBatter", player: "a1", name: big },
      { type: "addPlayer", team: "b", player: "b9", name: big },
      { type: "ball", runs: 0, extra: "none", wicket: { kind: "runOut", fielder: big } },
      { type: "changeSetup", teamA: big, title: big, venue: big },
    ],
  });
  assert.ok(s);
  assert.equal(s.id, "match");
  assert.deepEqual([s.setup.teamA.length, s.setup.teamB.length, s.setup.title.length, s.setup.venue.length, s.setup.players.a[0].name.length], [32, 32, 48, 48, 40]);
  for (const e of s.events) for (const v of Object.values(e)) if (typeof v === "string") assert.ok(v.length <= 48, `${e.type} ${v.length}`);
  assert.ok(JSON.stringify(s).length < 1500, `${JSON.stringify(s).length} chars`);
});

test("sanitizeMatch: not a match, a wrong version or too many events is null", () => {
  const m = finished();
  for (const x of [null, undefined, 0, 1, true, "", "match", JSON.stringify(m), [], [m]]) assert.equal(sanitizeMatch(x), null, String(x));
  for (const v of [0, 2, "1", null, undefined]) assert.equal(sanitizeMatch({ ...m, v }), null, `v ${v}`);
  for (const setup of [null, "setup", [m.setup], undefined]) assert.equal(sanitizeMatch({ ...m, setup }), null);
  for (const events of [null, {}, "[]", undefined]) assert.equal(sanitizeMatch({ ...m, events }), null);
  const swaps = (n: number) => ({ ...m, events: Array.from({ length: n }, () => ({ type: "swapStrike" })) });
  assert.equal(sanitizeMatch(swaps(10_000)), null);
  assert.equal(sanitizeMatch(swaps(3001)), null);
  assert.equal(sanitizeMatch(swaps(3000))?.events.length, 3000);
});

test("sanitizeMatch: NaN, Infinity and wild numbers are clamped the engine's way", () => {
  const m = finished();
  const s = sanitizeMatch({
    ...m,
    createdAt: NaN,
    setup: { ...m.setup, overs: Infinity, playersPerSide: -Infinity, rules: { wideRuns: NaN, noBallRuns: 1e9, freeHit: "no", maxOversPerBowler: Infinity, lastManStands: 1, retireAt: -5 } },
    events: [
      { type: "ball", runs: Infinity, extra: "wide", extraRuns: NaN, at: Infinity },
      { type: "ball", runs: 1e9, extra: "none", at: NaN },
      { type: "ball", runs: -3, extra: "noBall", extraRuns: 2.7, at: 5 },
      { type: "changeSetup", overs: NaN, playersPerSide: Infinity, rules: { wideRuns: -1, retireAt: 1e9, freeHit: "yes" }, at: -Infinity },
      { type: "changeSetup", overs: 1e9, playersPerSide: 0 },
    ],
  });
  assert.ok(s);
  assert.equal(s.createdAt, 0);
  assert.equal(sanitizeMatch({ ...m, createdAt: Infinity })?.createdAt, 0);
  assert.equal(sanitizeMatch({ ...m, createdAt: "1760000000000" })?.createdAt, 0);
  assert.deepEqual([s.setup.overs, s.setup.playersPerSide], [6, 11]);
  assert.deepEqual(s.setup.rules, { wideRuns: 1, noBallRuns: 5, freeHit: true, maxOversPerBowler: null, lastManStands: false, retireAt: null });
  assert.deepEqual(s.events, [
    { type: "ball", runs: 0, extra: "wide", extraRuns: 0 },
    { type: "ball", runs: 99, extra: "none" },
    { type: "ball", runs: 0, extra: "noBall", extraRuns: 2, at: 5 },
    { type: "changeSetup", rules: { wideRuns: 0, retireAt: 500 } },
    { type: "changeSetup", overs: 100, playersPerSide: 2 },
  ]);
  const v = derive(s);
  assert.doesNotMatch([v.headline, ...v.current.commentary.map((c) => c.line)].join("\n"), /NaN|Infinity|undefined/);
});

test("sanitizeMatch: unknown event types and player ids the engine never makes are dropped", () => {
  const m = finished();
  const junk: unknown[] = [{ type: "hack" }, { type: "__proto__" }, { type: "toString" }, { type: "BALL", runs: 4, extra: "none" }, { runs: 4, extra: "none" }, null, 7, "ball", [{ type: "swapStrike" }]];
  assert.deepEqual(sanitizeMatch({ ...m, events: [...junk, ...m.events, ...junk] })?.events, m.events);
  const s = sanitizeMatch({
    ...m,
    setup: {
      ...m.setup,
      players: {
        a: [{ id: "a1", name: "Amit" }, { id: "c1", name: "X" }, { id: "a12345", name: "X" }, { id: "a1", name: "Again" }, { id: "<img src=x>", name: "X" }, { id: "A2", name: "X" }],
        b: Array.from({ length: 60 }, (_, i) => ({ id: `b${i + 1}`, name: `Player ${i + 1}` })),
      },
    },
    events: [
      { type: "setBatter", player: "zz", name: "Who" },
      { type: "setBowler", player: "b1 " },
      { type: "setBowler", player: "" },
      { type: "addPlayer", team: "c", player: "a8", name: "Sam" },
      { type: "addPlayer", team: "a", player: "a8", name: "   " },
      { type: "addPlayer", team: "a", player: "a1000", name: "Sam" },
      { type: "retire", out: "both", kind: "retiredHurt" },
      { type: "retire", out: "striker", kind: "retiredBored" },
      { type: "setBatter", player: "a1", end: "middle" },
      { type: "endInnings", reason: "rain" },
      { type: "ball", runs: 0, extra: "none", noBallExtra: "four", wicket: { kind: "retiredHurt" } },
    ],
  });
  assert.ok(s);
  assert.deepEqual(s.setup.players.a, [{ id: "a1", name: "Amit" }]);
  assert.equal(s.setup.players.b.length, 40);
  assert.deepEqual(s.setup.players.b.at(-1), { id: "b40", name: "Player 40" });
  assert.deepEqual(s.events, [
    { type: "addPlayer", team: "a", player: "a1000", name: "Sam" },
    { type: "setBatter", player: "a1" },
    { type: "endInnings" },
    { type: "ball", runs: 0, extra: "none" },
  ]);
});

test("sanitizeMatch: junk anywhere never throws, derives cleanly and reads back the same", () => {
  const JUNK: unknown[] = [null, true, false, 0, -1, 2.5, 1e308, -1e308, NaN, Infinity, "", " ", "a1", "b99", "x".repeat(5000), "__proto__", {}, [], [1, 2], { kind: "caught" }, { type: "ball" }, JSON.parse('{"toString": 1, "valueOf": 1}'), JSON.parse('{"__proto__": {"polluted": 1}}')];
  const FIELDS = ["type", "player", "name", "team", "runs", "extra", "extraRuns", "noBallExtra", "wicket", "kind", "out", "fielder", "end", "reason", "rules", "players", "overs", "teamA", "id", "at", "evil"];
  let checked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const r = rng(seed * 104729);
    const doc = wire(anyMatch(seed, new Map()));
    const holders: Record<string, unknown>[] = [];
    const walk = (x: unknown) => {
      if (!x || typeof x !== "object") return;
      holders.push(x as Record<string, unknown>);
      for (const v of Object.values(x)) walk(v);
    };
    walk(doc);
    // Skip the top level, which only has to be wrong once to give null.
    for (let i = 0; i < 12; i++) {
      const h = holders[1 + Math.floor(r() * (holders.length - 1))];
      const keys = Object.keys(h);
      const k = keys.length && r() < 0.7 ? keys[Math.floor(r() * keys.length)] : FIELDS[Math.floor(r() * FIELDS.length)];
      h[k] = JUNK[Math.floor(r() * JUNK.length)];
    }
    const s = sanitizeMatch(doc);
    if (!s) continue;
    checked++;
    const v = derive(s);
    const text = [v.headline, shareText(v), ...v.innings.flatMap((i) => [i.summary, i.extrasText, ...i.commentary.map((c) => c.line), ...i.batters.map((b) => b.howOut)])].join("\n");
    assert.doesNotMatch(text, /undefined|NaN|Infinity|\[object/, `seed ${seed}`);
    assert.deepEqual(sanitizeMatch(wire(s)), s, `seed ${seed} reads back the same`);
  }
  assert.ok(checked >= 30, `${checked} junked matches checked`);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});
