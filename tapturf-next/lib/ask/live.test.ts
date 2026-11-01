import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, check, newMatch, type Match, type MatchEvent } from "../cricket/scoring";
import { applyBoard, newBoard } from "../board/index";
import type { Board, BoardEvent } from "../board/types";
import { quickAnswer } from "../ai/quick";
import {
  factLines,
  istTime,
  liveAnswerKind,
  liveAskChips,
  liveAskGate,
  liveAskKind,
  liveCodeOf,
  liveFacts,
  liveFallback,
  liveFollowups,
  liveGoesOn,
  liveOwnNames,
  livePlaces,
  liveReply,
  numbersOk,
  type LiveAskKind,
  type LiveFacts,
} from "./live";

/* Titans (a): Amit a1, Rahul a2, Karan a3 ... ; Strikers (b): Sameer b1, Vikas b2 ...; 2 overs a side. */
const ball = (runs = 0, wicket?: { kind: "bowled" }): MatchEvent => ({ type: "ball", runs, extra: "none", ...(wicket ? { wicket } : {}) });
const bat = (player: string): MatchEvent => ({ type: "setBatter", player });
const bowl = (player: string): MatchEvent => ({ type: "setBowler", player });
function run(m: Match, ...events: MatchEvent[]): Match {
  for (const e of events) {
    assert.equal(check(m, e).error, null, JSON.stringify(e));
    m = apply(m, e);
  }
  return m;
}
const start = newMatch(
  { teamA: "Titans", teamB: "Strikers", overs: 2, playersPerSide: 6, players: { a: ["Amit", "Rahul", "Karan", "Dev", "Om", "Jay"], b: ["Sameer", "Vikas", "Nikhil", "Arjun", "Ravi", "Sunny"] }, title: "Sunday cup", venue: "Turf Park" },
  { id: "m1", now: 0 },
);
// Titans 14/1 in 2 overs: 4 1 0 6 0 1, then 0 0 W 1 1 0 (Rahul bowled, Karan in).
const firstOver = run(start, bat("a1"), bat("a2"), bowl("b1"), ball(4), ball(1), ball(0), ball(6), ball(0), ball(1));
const firstDone = run(firstOver, bowl("b2"), ball(0), ball(0), ball(0, { kind: "bowled" }), bat("a3"), ball(1), ball(1), ball(0));
// Strikers 7/0 after 3 balls, chasing 15: 8 needed off 9.
const chase = run(firstDone, bat("b1"), bat("b2"), bowl("a1"), ball(4), ball(2), ball(1));
// Strikers finish on 10/0: Titans win by 4 runs.
const done = run(chase, ball(0), ball(0), ball(0), bowl("a2"), ball(1), ball(1), ball(0), ball(0), ball(1), ball(0));

// 1 Nov 2026, 6:30 pm in India; the last update 90 s before.
const NOW = Date.parse("2026-11-01T13:00:00Z");
const AT = "2026-11-01T12:58:30Z";
const facts = (match: unknown, status: "live" | "done" = "live", updatedAt = AT) => liveFacts({ status, match, updatedAt }, NOW);

test("ctx: only a live link code is read from it", () => {
  assert.equal(liveCodeOf("k7m2q9x4a1b3"), "k7m2q9x4a1b3");
  for (const bad of [undefined, null, "", "K7M2Q9X4A1B3", "k7m2q9x4a1b", "k7m2q9x4a1b3x", "k7m2q9x4a1b3 ", "../../etc", 12, { code: "k7m2q9x4a1b3" }]) assert.equal(liveCodeOf(bad), null, String(bad));
});

test("the sign-in rule: on a live page a signed-in account asks, a visitor is asked to sign in; elsewhere nothing changes", () => {
  const UID = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
  assert.equal(liveAskGate("k7m2q9x4a1b3", UID), "live");
  assert.equal(liveAskGate("k7m2q9x4a1b3", null), "sign_in", "no visitor answers on a live page");
  assert.equal(liveAskGate(null, null), "none", "not a live page: the free answers stand");
  assert.equal(liveAskGate(null, UID), "none");
});

test("what a message on a live page asks", () => {
  const cases: [string, LiveAskKind | "search" | "other"][] = [
    ["What's the score?", "score"],
    ["what’s the score", "score"],
    ["score kya hai", "score"],
    ["How many needed?", "need"],
    ["how many runs do they need", "need"],
    ["Required run rate?", "need"],
    ["kitne run chahiye", "need"],
    ["What's the target?", "need"],
    ["What's the run rate?", "rate"],
    ["Who's batting?", "batting"],
    ["who is on strike", "batting"],
    ["Who was top scorer?", "batting"],
    ["Who's bowling?", "bowling"],
    ["Best bowling?", "bowling"],
    ["how many wickets down", "wickets"],
    ["who got out", "wickets"],
    ["Who won?", "result"],
    ["Who's winning?", "result"],
    ["who will win this", "result"],
    ["is the match over", "result"],
    ["how many overs left", "overs"],
    ["what happened in the last over", "over"],
    ["partnership kitni hai", "partnership"],
    ["How long is left?", "time"],
    ["when was it last updated", "updated"],
    ["Who's playing?", "teams"],
    ["where is this match", "teams"],
    ["what's happening", "summary"],
    // Searches go on to the usual Ask.
    ["box cricket turf near me tonight", "search"],
    ["Find a football turf in Baner", "search"],
    ["can I book a slot for tomorrow", "search"],
    ["any open games this weekend", "search"],
    ["host a game saturday 7pm", "search"],
    // Games and players wanted, with a day, a sport or a place: searches, though they say games, need or ground (the review's).
    ["any games tonight in Baner?", "search"],
    ["football games in Kothrud tomorrow", "search"],
    ["is there a game tomorrow at 7 in Wakad", "search"],
    ["cricket game tomorrow", "search"],
    ["need 2 players for cricket tonight", "search"],
    ["players needed for game tonight", "search"],
    ["players needed for a game tonight", "search"],
    ["cheap ground for 10 players", "search"],
    ["Any games tonight in Pune?", "search"],
    ["any pickup games near kothrud?", "search"],
    ["games this weekend", "search"],
    ["football games in baner", "search"],
    ["Is there a game I can join?", "search"],
    ["any cricket games on sunday", "search"],
    ["Where can I play cricket tonight", "search"],
    // About this match, though it names a turf, a day or games.
    ["which turf is this match at", "other"],
    ["Is the game tonight?", "score"],
    ["who won today", "result"],
    // A board's games are its score.
    ["any games left in this set", "score"],
    ["how many games has she won", "result"],
    // Anything else about the match: the model, from the facts.
    ["is Amit playing well?", "other"],
    ["hello", "other"],
  ];
  for (const [q, kind] of cases) assert.equal(liveAskKind(q), kind, q);
});

// As app/api/ask/route.ts reads a message on a live page: the kind, with the turfs' places and this match's own names; the quick reader's search; then the kind for this match.
const AREAS = { pune: ["Baner", "Kothrud", "Wakad"], nashik: ["Gangapur Road"] };
// Sagar: a town as well as a first name.
const PLACES = livePlaces(AREAS, ["Pune", "Mumbai", "Hyderabad", "Bombay", "Sagar"]);
function onLivePage(q: string, f: LiveFacts): LiveAskKind | "search" | "other" {
  const asked = liveAskKind(q, { places: PLACES, ...liveOwnNames(f) });
  if (asked === "search" || liveGoesOn(q, asked, quickAnswer(q, { areas: AREAS, turfs: [] }, {}, 9)?.intent ?? null)) return "search";
  return liveAnswerKind(asked, f, q);
}

test("on a live page a game or turf search goes on to the usual Ask; the match's own questions stay", () => {
  const f = facts(chase);
  for (const q of [
    "any games tonight in Baner?",
    "football games in Kothrud tomorrow",
    "is there a game tomorrow at 7 in Wakad",
    "need 2 players for cricket tonight",
    "players needed for game tonight",
    "who is playing football tonight in Baner",
    "cheap ground for 10 players",
    "any pickup games near kothrud?",
    "Is there a game I can join?",
    "Where can I play cricket tonight",
    // Read by the quick reader: a place and a sport, a tool, a host.
    "football Baner tonight",
    "box cricket Kothrud",
    "Calculate our NRR",
    "Host a game Saturday 7pm",
  ]) {
    assert.equal(onLivePage(q, f), "search", q);
  }
  // A place alone after in/near/at is a search; a place the quick reader can't read stays the model's otherwise.
  assert.equal(liveAskKind("who is playing football tonight in Baner"), "teams", "without the places, as the chat reads it");
  assert.equal(liveAskKind("who is playing football tonight in Baner", { places: PLACES }), "search");
  assert.equal(liveAskKind("anything happening in bombay", { places: PLACES }), "search");
  for (const chip of [...liveAskChips(chase), ...liveAskChips(done), ...liveAskChips(start), "Who's playing?", "where is this match", "what's happening", "is the match over"]) {
    assert.notEqual(onLivePage(chip, f), "search", chip);
  }
});

test("a match's own names are never a search: teams named for a turf or a place", () => {
  const m = newMatch({ teamA: "Turf Kings", teamB: "Baner Blasters", overs: 2, players: { a: ["Sagar", "Ajay"], b: ["Kunal", "Rohit"] }, venue: "Kothrud Sports Arena" }, { id: "m2", now: 0 });
  const f = facts(run(m, bat("a1"), bat("a2"), bowl("b1"), ball(4)));
  assert.equal(liveAskKind("how many runs have Turf Kings got", {}), "search", "without its names, 'turf' reads as a search");
  assert.equal(onLivePage("how many runs have Turf Kings got", f), "score");
  assert.equal(liveAskKind("are Baner Blasters winning at Kothrud Sports Arena?", { places: PLACES }), "search", "without its names, two places");
  assert.equal(onLivePage("are Baner Blasters winning at Kothrud Sports Arena?", f), "result");
  assert.equal(liveAskKind("how many runs from Sagar", { places: PLACES }), "search", "a place, to a page that doesn't know the players");
  assert.equal(onLivePage("how many runs from Sagar", f), "player", "a player of this match");
  assert.equal(onLivePage("is it raining at Kothrud Sports Arena", f), "other");
  // A team's name is theirs only whole: Baner alone is still the place.
  assert.equal(onLivePage("who is playing football tonight in Baner", f), "search");
  assert.equal(onLivePage("any games tonight in Baner?", f), "search");
  assert.deepEqual(liveOwnNames(f), { own: ["Turf Kings", "Baner Blasters", "Kothrud Sports Arena"], players: ["Sagar", "Ajay", "Kunal", "Rohit"] });
});

test("the quick reader's reading sends a usual question on only for a search, a host or a tool, never one about this match", () => {
  assert.equal(liveGoesOn("Calculate our NRR", "other", "tool"), true);
  assert.equal(liveGoesOn("about turf park", "other", "question"), true, "about nothing in the match: any reading it has, as before");
  assert.equal(liveGoesOn("Any games tonight in Pune?", "score", "find_game"), true);
  assert.equal(liveGoesOn("Host a game Saturday 7pm", "score", "create_game"), true);
  assert.equal(liveGoesOn("score of the games tonight in Pune", "score", "find_game"), false, "it says score");
  assert.equal(liveGoesOn("is this match in Pune", "teams", "find_turf"), false, "it points at this match");
  assert.equal(liveGoesOn("What's the score?", "score", null), false);
  assert.equal(liveGoesOn("who's playing", "teams", "question"), false);
  assert.equal(liveGoesOn("hello", "other", "other"), false);
});

test("a question naming a player is that player's, from every innings' cards", () => {
  const f = facts(chase);
  const asked = (q: string) => [onLivePage(q, f), liveReply(onLivePage(q, f) as LiveAskKind, f, q)];
  // The review's: each was the side's wickets, score or overs before.
  assert.deepEqual(asked("How many wickets did Vikas take?"), ["player", "Vikas bowled for Strikers in the 1st innings: 1/2 in 1.0 overs. Vikas is batting for Strikers: 0 off 0 balls, on strike."]);
  const rahul = "Rahul batted for Titans in the 1st innings: 7 off 7 balls, 1 six, strike rate 100.00, out b Vikas.";
  assert.deepEqual(asked("how did Rahul get out"), ["player", rahul]);
  assert.deepEqual(asked("Rahul kitne pe out hua?"), ["player", rahul]);
  assert.deepEqual(asked("How many runs did Rahul score?"), ["player", rahul]);
  assert.deepEqual(asked("How many balls has Amit faced?"), ["player", "Amit batted for Titans in the 1st innings: 6 off 3 balls, 1 four, strike rate 200.00, not out. Amit is bowling for Titans: 0/7 in 0.3 overs."]);
  assert.deepEqual(asked("how many overs did Sameer bowl"), ["player", "Sameer bowled for Strikers in the 1st innings: 0/12 in 1.0 overs. Sameer is batting for Strikers: 7 off 3 balls, 1 four, strike rate 233.33."]);
  // Who is bowling or batting with someone: the bowler and the batters answer it.
  assert.equal(onLivePage("Who's bowling to Vikas?", f), "bowling");
  assert.equal(onLivePage("who is batting with Sameer", f), "batting");
  // Anything else about a player is the model's, from the facts; without it, the player's own lines.
  assert.equal(onLivePage("is Amit playing well?", f), "other");
  assert.equal(liveFallback(f, "is Amit playing well?"), liveReply("player", f, "how is Amit"));
  assert.equal(liveFallback(f, "Did Dev bat?"), "Dev plays for Titans and hasn't batted or bowled yet.");
  // Words that are names too, and team names, are not players.
  assert.equal(onLivePage("who will win", f), "result");
  assert.equal(onLivePage("what's the score", f), "score");
  for (const q of ["How many wickets did Vikas take?", "how did Rahul get out", "How many balls has Amit faced?", "how many overs did Sameer bowl"]) {
    assert.ok(numbersOk(liveReply("player", f, q), f), `${q}: every number is in the facts`);
  }

  // Once it is over, every innings still answers.
  const end = facts(done, "done");
  assert.equal(liveReply("player", end, "How many runs did Rahul score?"), `${rahul} Rahul bowled for Titans in the 2nd innings: 0/3 in 1.0 overs.`);
  assert.equal(liveReply("player", end, "how many wickets did vikas take"), "Vikas bowled for Strikers in the 1st innings: 1/2 in 1.0 overs. Vikas batted for Strikers in the 2nd innings: 1 off 5 balls, strike rate 20.00, not out.");
});

test("the facts carry every innings' batting and bowling cards and both sides' players", () => {
  const f = facts(chase);
  assert.ok(f.lines.includes("1st innings batting, Titans: Amit 6 off 3 balls, 1 four, strike rate 200.00, not out; Rahul 7 off 7 balls, 1 six, strike rate 100.00, out b Vikas; Karan 1 off 2 balls, strike rate 50.00, not out."));
  assert.ok(f.lines.includes("1st innings bowling, Strikers: Sameer 0/12 in 1.0; Vikas 1/2 in 1.0."));
  assert.ok(f.lines.includes("2nd innings bowling, Titans: Amit 0/7 in 0.3."));
  assert.ok(f.lines.includes("Players: Titans: Amit, Rahul, Karan, Dev, Om, Jay; Strikers: Sameer, Vikas, Nikhil, Arjun, Ravi, Sunny."));
  assert.ok(!f.lines.some((l) => l.startsWith("2nd innings batting")), "the two at the crease are said once, above");
  const end = facts(done, "done");
  assert.ok(end.lines.includes("2nd innings batting, Strikers: Sameer 9 off 7 balls, 1 four, strike rate 128.57, not out; Vikas 1 off 5 balls, strike rate 20.00, not out."));
  assert.ok(end.lines.includes("2nd innings bowling, Titans: Amit 0/7 in 1.0; Rahul 0/3 in 1.0."));
  // So the model may say a first-innings number during the chase.
  assert.equal(numbersOk("Rahul made 7 off 7 before Vikas bowled him.", f), true);
});

test("facts from a chase, every number as the page shows it", () => {
  const f = facts(chase);
  assert.equal(f.state, "live");
  assert.equal(f.kind, "cricket");
  assert.equal(f.teams, "Titans vs Strikers");
  assert.equal(f.updated, "6:28 pm");
  assert.equal(f.ageMin, 1);
  const c = f.cricket!;
  assert.deepEqual(c.innings.map((i) => [i.team, i.score, i.overs, i.crr]), [["Titans", "14/1", "2.0", "7.00"], ["Strikers", "7/0", "0.3", "14.00"]]);
  assert.deepEqual(c.chase, { target: 15, runsNeeded: 8, ballsLeft: 9, rrr: "5.33" });
  assert.deepEqual([c.striker?.name, c.striker?.runs, c.nonStriker?.name, c.nonStriker?.runs], ["Vikas", 0, "Sameer", 7]);
  assert.deepEqual(c.bowler, { name: "Amit", figures: "0/7", overs: "0.3", econ: "14.00" });
  assert.deepEqual(c.thisOver, { number: 1, balls: ["4", "2", "1"], runs: 7, complete: false });
  assert.ok(f.lines.includes("Chase: target 15; Strikers need 8 runs off 9 balls, required rate 5.33."));
  assert.ok(f.lines.includes("1st innings: Titans 14/1 after 2.0 of 2 overs, run rate 7.00, innings over."));
  assert.ok(f.lines.includes("Venue: Turf Park."));
  assert.deepEqual(factLines(f), f.lines, "the lines are the facts");
  assert.ok(!f.lines.some((l) => /Also batted/.test(l) && /Sameer|Vikas/.test(l)), "the batters at the crease are not listed twice");
});

test("answers from a chase: the score and the rate needed, worked out from the match", () => {
  const f = facts(chase);
  assert.equal(liveReply("score", f), "Strikers are 7/0 after 0.3 of 2 overs, chasing 15. They need 8 runs off 9 balls.");
  assert.equal(liveReply("need", f), "Strikers need 8 runs off 9 balls to win, a required rate of 5.33 an over. The target is 15.");
  assert.equal(liveReply("rate", f), "Strikers are scoring at 14.00 an over (7/0 after 0.3 overs). They need 5.33 an over from here.");
  assert.equal(liveReply("batting", f), "Strikers are batting, 7/0 after 0.3 overs. Vikas has 0 off 0 balls and is on strike; Sameer has 7 off 3 balls.");
  assert.equal(liveReply("bowling", f), "Amit is bowling for Titans, 0/7 in 0.3 overs. Best bowling so far: Vikas 1/2.");
  assert.equal(liveReply("wickets", f), "Strikers haven't lost a wicket yet: 7/0 after 0.3 overs.");
  assert.equal(liveReply("overs", f), "0.3 of 2 overs bowled to Strikers, 9 balls left. They need 8 runs.");
  assert.equal(liveReply("over", f), "Over 1 so far: 4, 2, 1, 7 runs. Strikers are 7/0 after 0.3 of 2 overs, chasing 15. They need 8 runs off 9 balls.");
  assert.equal(liveReply("result", f, "who will win?"), "I can't say who will win, only how it stands. Strikers need 8 runs off 9 balls.", "never a guess");
  assert.equal(liveReply("result", f, "who's winning"), "No result yet. Strikers need 8 runs off 9 balls.");
  assert.equal(liveReply("teams", f), "Titans vs Strikers, 2 overs a side, Sunday cup, at Turf Park.");
  assert.match(liveReply("updated", f), /^The last update came in at 6:28 pm, 1 minute ago, and this page updates by itself\./);
  for (const k of ["score", "need", "rate", "batting", "bowling", "wickets", "overs", "over", "partnership", "result", "updated", "teams", "summary"] as LiveAskKind[]) {
    assert.ok(numbersOk(liveReply(k, f), f), `${k}: every number is in the facts`);
    // The venue the scorer typed is "Turf Park"; nothing else may say turf.
    assert.doesNotMatch(liveReply(k, f).replace("Turf Park", ""), /\bbook|turf\b/i, `${k}: no booking, no turf`);
  }
});

test("a link that went live before the first ball (production has such rows)", () => {
  const f = facts(start);
  assert.equal(f.state, "live");
  assert.equal(liveReply("score", f), "Titans are batting first. No balls bowled yet.");
  assert.equal(liveReply("rate", f), "No balls bowled to Titans yet, so there's no run rate.");
  assert.equal(liveReply("batting", f), "Titans are batting; the scorer hasn't picked the batters yet.");
  assert.deepEqual(liveAskChips(start), ["What's the score?", "Who's batting?", "Who's bowling?", "What's the run rate?"]);
});

test("the first innings, the break and the result", () => {
  const first = facts(firstOver);
  assert.equal(liveReply("score", first), "Titans are 12/0 after 1.0 of 2 overs, run rate 12.00.");
  assert.equal(liveReply("need", first), "There's no target yet: Titans are batting first, 12/0 after 1.0 of 2 overs. The chase starts after this innings.");
  const brk = facts(firstDone);
  assert.equal(brk.cricket?.inningsBreak, true);
  assert.equal(liveReply("score", brk), "It's the innings break. Titans made 14/1 in 2.0 overs, so Strikers need 15 to win.");
  assert.equal(liveReply("need", brk), "Strikers need 15 to win off 2 overs. The chase hasn't started yet.");
  const end = facts(done, "done");
  assert.equal(end.state, "done");
  assert.equal(liveReply("score", end), "Titans won by 4 runs. Titans made 14/1 in 2.0 overs, Strikers made 10/0 in 2.0 overs.");
  assert.equal(liveReply("result", end), liveReply("score", end));
  assert.equal(liveReply("batting", end), "The match is over: Titans won by 4 runs. Top scorer: Sameer 9* (7).");
  assert.equal(liveReply("need", end), liveReply("score", end), "no runs needed once it is over");
});

test("a link that is not showing a live score says so, and nothing else", () => {
  const at = (status: "waiting" | "stopped" | "expired" | "missing" | null) => liveFacts({ status, match: null, updatedAt: null }, NOW);
  assert.match(liveReply("score", at("waiting")), /hasn't sent the first score yet/);
  assert.match(liveReply("need", at("stopped")), /turned this live link off/);
  assert.match(liveReply("batting", at("expired")), /has expired: a live score is cleared 30 days after its last update/);
  assert.match(liveReply("score", at("missing")), /can't find a live score for this link/);
  assert.match(liveReply("score", at(null)), /can't read this match's score right now/);
  // A live row whose match can't be read is not a 0/0 scorecard.
  assert.equal(liveFacts({ status: "live", match: { nonsense: true }, updatedAt: AT }, NOW).state, "unknown");
  for (const s of ["waiting", "stopped", "expired", "missing", null] as const) {
    const f = at(s);
    assert.equal(f.cricket, null);
    assert.equal(liveFallback(f), liveReply("summary", f), "no score: no offer to ask about one");
  }
});

test("a link closed for want of updates: its last score, said to be the last", () => {
  const f = facts(chase, "live", "2026-11-01T10:00:00Z");
  assert.equal(f.state, "closed");
  assert.equal(
    liveReply("score", f),
    "This live link stopped updating at 3:30 pm, after 2 hours without a new score, so this is the last score it had. Strikers are 7/0 after 0.3 of 2 overs, chasing 15. They need 8 runs off 9 balls.",
  );
  assert.equal(facts(chase, "live", "2026-11-01T11:00:01Z").state, "live", "under 2 hours: still live");
});

test("a board: the score, who is ahead, the clock as of now, and no cricket words", () => {
  const T0 = NOW - 600_000;
  let b: Board = newBoard("football", { teamA: "Red FC", teamB: "Blue FC" }, { id: "bf", now: T0 });
  const go = (e: BoardEvent) => (b = applyBoard(b, e));
  go({ type: "clock", run: true, at: T0 });
  go({ type: "point", side: "a", how: "goal", player: "Ravi", at: NOW - 300_000 });
  // Sent when that goal went in; the server has had it five minutes, the clock ran on.
  const f = liveFacts({ status: "live", match: { ...b, sentAt: NOW - 300_000 }, updatedAt: new Date(NOW - 300_000).toISOString() }, NOW);
  assert.equal(f.kind, "board");
  assert.deepEqual([f.board?.scoreA, f.board?.scoreB, f.board?.clock, f.board?.clockRunning, f.board?.period], [1, 0, "10:00", true, "1st half"]);
  assert.equal(liveReply("score", f), "Red FC 1-0 Blue FC, 1st half.");
  assert.equal(liveReply("result", f), "No result yet. Red FC lead 1-0, 1st half.");
  assert.equal(liveReply("time", f), "1st half, 10:00 on the clock. Red FC 1-0 Blue FC, 1st half.");
  assert.equal(liveReply("batting", f), "This is a football match, not cricket. Red FC 1-0 Blue FC, 1st half.");
  assert.equal(liveReply("teams", f), "Red FC vs Blue FC, football.");
  assert.ok(numbersOk(liveReply("time", f), f));
  assert.deepEqual(liveAskChips(b), ["What's the score?", "Who's winning?", "How long is left?", "Who's playing?"]);

  // Everyday words read as cricket's on a board: the model answers from the facts, or the clock does. "Not cricket" only for cricket's own words.
  const kinds = (q: string) => liveAnswerKind(liveAskKind(q) as LiveAskKind | "other", f, q);
  assert.equal(kinds("How many goals needed to equalise?"), "other");
  assert.equal(kinds("How many points do they need?"), "other");
  assert.equal(kinds("Is Ravi out?"), "other");
  assert.equal(kinds("who's the striker"), "other", "a striker is football's too");
  assert.equal(kinds("How long until it's over?"), "time");
  assert.equal(liveReply(kinds("How long until it's over?") as LiveAskKind, f), "1st half, 10:00 on the clock. Red FC 1-0 Blue FC, 1st half.");
  for (const q of ["Who's batting?", "how many wickets", "how many overs left", "what's the run rate"]) assert.match(liveReply(kinds(q) as LiveAskKind, f, q), /^This is a football match, not cricket\./, q);
  assert.equal(liveFallback(f, "How many goals needed to equalise?"), "Red FC 1-0 Blue FC, 1st half. Latest: 6' Goal! Ravi (1-0). Ask me the score, who's ahead or how long is left.");
  assert.ok(f.lines.includes("Players: Ravi (Red FC) 6'."), "the scorers, for the model");
  assert.deepEqual(liveOwnNames(f), { own: ["Red FC", "Blue FC"], players: ["Ravi"] });
});

test("the model's reply is used only when every number in it is in the facts", () => {
  const f = facts(chase);
  assert.equal(numbersOk("Strikers need 8 off 9 balls, so 5.33 an over.", f), true);
  assert.equal(numbersOk("Sameer has hit one four so far.", f), true);
  assert.equal(numbersOk("At this rate they will finish on 31.", f), false, "a projection the facts don't have");
  assert.equal(numbersOk("They need 8 off 9, about 53 percent of the target.", f), false);
});

test("chips for the match as it stands, never a turf or a booking; each reads as its own question", () => {
  const all = [liveAskChips(null), liveAskChips(firstOver), liveAskChips(chase), liveAskChips(firstDone), liveAskChips(done)];
  assert.deepEqual(all[0], ["What's the score?", "Who's playing?"]);
  assert.deepEqual(all[1], ["What's the score?", "Who's batting?", "Who's bowling?", "What's the run rate?"]);
  assert.deepEqual(all[2], ["What's the score?", "How many needed?", "Who's batting?", "Required run rate?"]);
  assert.deepEqual(all[3], all[2], "the innings break: the chase's");
  assert.deepEqual(all[4], ["Who won?", "Who was top scorer?", "Best bowling?"]);
  for (const chip of all.flat()) {
    assert.doesNotMatch(chip, /turf|book|court|venue|game/i, chip);
    assert.ok(!["search", "other"].includes(liveAskKind(chip)), `${chip} is answered from the match`);
  }
  assert.deepEqual(liveFollowups(all[2], "what's the score"), ["How many needed?", "Who's batting?", "Required run rate?"], "not the one just asked");
  assert.deepEqual(liveFollowups(all[2], "who's bowling?"), all[2].slice(0, 3));
});

test("times in India", () => {
  assert.equal(istTime(Date.parse("2026-11-01T13:00:00Z"), NOW), "6:30 pm");
  assert.equal(istTime(Date.parse("2026-11-01T00:05:00Z"), NOW), "5:35 am");
  assert.equal(istTime(Date.parse("2026-10-31T06:30:00Z"), NOW), "12:00 pm on 31 Oct");
  assert.equal(istTime(Date.parse("2026-10-31T18:45:00Z"), NOW), "12:15 am", "after midnight there: today");
});
