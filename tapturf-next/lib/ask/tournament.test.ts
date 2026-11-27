import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { applyBoard, newBoard } from "../board/index";
import type { Board, BoardEvent } from "../board/types";
import { answerTournament, tournamentAsk, TOURNAMENT_SYSTEM, type Phrase } from "../ai/tournamentAnswer";
import { newUsage } from "../ai/ask";
import { quickAnswer } from "../ai/quick";
import { makeFixtures } from "../tournament/fixtures";
import { resolve } from "../tournament/standings";
import type { Fixture, LiveNow, Settings, TournamentGetResponse } from "../tournament/types";
import { livePlaces } from "./liveKind";
import {
  DIGEST_MAX_CHARS,
  MAX_CARDS,
  NOT_SAID,
  matchCard,
  matchRefOf,
  playersNamed,
  scorecardsOf,
  teamsNamed,
  tokensOf,
  tournamentAnswerKind,
  tournamentAskChips,
  tournamentAskGate,
  tournamentAskKind,
  tournamentCodeOf,
  tournamentFacts,
  tournamentFallback,
  tournamentFollowups,
  tournamentGoesOn,
  tournamentHasOf,
  tournamentOwnNames,
  tournamentRead,
  tournamentReply,
  tournamentReplyOk,
  type MatchCard,
  type TournamentAskKind,
  type TournamentFacts,
} from "./tournament";
import { CUP, LEAGUE, TOURNAMENT_FIXTURES, TYPED, scoreMatch, type TournamentFixture } from "./tournament.fixtures";

// Run with: npm run test:ask

const factsOf = (fx: TournamentFixture, max?: number) => tournamentFacts({ status: "ok", view: fx.view, cards: fx.cards }, max);
const league = factsOf(LEAGUE);
const cup = factsOf(CUP);
const typed = factsOf(TYPED);
const UID = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";

const AREAS = { pune: ["Baner", "Kothrud", "Wakad"], hyderabad: ["Madhapur"] };
const PLACES = livePlaces(AREAS, ["Pune", "Mumbai", "Hyderabad"]);
/** As app/api/ask/route.ts reads a message on a tournament's page. */
const read = (q: string, f: TournamentFacts) => tournamentRead(q, f, { places: PLACES, quickIntent: () => quickAnswer(q, { areas: AREAS, turfs: [] }, {}, 10)?.intent ?? null });
/** The code-built answer to a message, as the route gives it; throws when it would go on or to the model. */
function say(q: string, f: TournamentFacts): string {
  const r = read(q, f);
  assert.ok(!r.goesOn, `${q}: went on to the usual Ask`);
  assert.notEqual(r.kind, "other", `${q}: would go to the model`);
  return tournamentReply(r.kind as TournamentAskKind, f, q);
}

/* ------------------------------------------------------------------ */
/* The context, the sign-in rule and the chips                         */
/* ------------------------------------------------------------------ */

test("ctx: only something shaped like a tournament code is read from it", () => {
  assert.equal(tournamentCodeOf("k7m2q9x4a1b3"), "k7m2q9x4a1b3");
  for (const bad of [undefined, null, "", "K7M2Q9X4A1B3", "k7m2q9x4a1b", "k7m2q9x4a1b3x", "../../etc", 12, { code: "k7m2q9x4a1b3" }]) assert.equal(tournamentCodeOf(bad), null, String(bad));
});

test("the sign-in rule: the live score page's, on a tournament's page", () => {
  assert.equal(tournamentAskGate("k7m2q9x4a1b3", UID), "tournament");
  assert.equal(tournamentAskGate("k7m2q9x4a1b3", null), "sign_in", "no visitor answers on a tournament's page");
  assert.equal(tournamentAskGate(null, null), "none", "not a tournament page: the free answers stand");
  assert.equal(tournamentAskGate(null, UID), "none");
});

test("chips come from what the tournament has: no top scorer without a scored match, nothing live or next that isn't", () => {
  assert.deepEqual(league.has, { series: false, played: 3, total: 7, live: 1, scored: 3, champion: false });
  assert.deepEqual(tournamentAskChips(league.has), ["What's on now?", "Who's leading the table?", "Who's the top scorer?", "Most wickets?"]);
  assert.deepEqual(tournamentAskChips(cup.has), ["Who won the tournament?", "Who's the top scorer?", "Most wickets?", "Latest result?"]);
  // Typed results only: no player chips at all.
  assert.deepEqual(typed.has, { series: false, played: 2, total: 3, live: 0, scored: 0, champion: false });
  assert.deepEqual(tournamentAskChips(typed.has), ["Who's leading the table?", "Latest result?", "When's the next match?", "How many matches are left?"]);
  // Nothing played yet.
  assert.deepEqual(tournamentAskChips({ series: false, played: 0, total: 6, live: 0, scored: 0, champion: false }), ["When's the next match?", "Who's playing?", "What's the format?"]);
  assert.deepEqual(tournamentAskChips({ series: true, played: 1, total: 3, live: 0, scored: 1, champion: false }), ["What's the series score?", "Who's the top scorer?", "Most wickets?", "Latest result?"]);
  for (const has of [league.has, cup.has, typed.has]) {
    const chips = tournamentAskChips(has);
    assert.ok(chips.length <= 4);
    assert.equal(chips.some((c) => /scorer|wickets/i.test(c)), has.scored > 0);
    assert.equal(chips.includes("What's on now?"), has.live > 0);
    assert.equal(chips.includes("When's the next match?") && has.played >= has.total, false);
  }
  // The page works the same summary out from its own resolve().
  assert.deepEqual(tournamentHasOf(resolve(LEAGUE.view.tournament, LEAGUE.view.live), "league"), league.has);
  assert.deepEqual(tournamentFollowups(tournamentAskChips(league.has), "who's the top scorer"), ["What's on now?", "Who's leading the table?", "Most wickets?"]);
});

test("every chip is one of the usual questions, answered in code on the tournament that offers it", () => {
  for (const f of [league, cup, typed]) for (const c of tournamentAskChips(f.has)) assert.ok(say(c, f).length > 10, c);
  assert.equal(say("What's the series score?", league), say("Who's leading the table?", league));
});

/* ------------------------------------------------------------------ */
/* Reading the question                                                */
/* ------------------------------------------------------------------ */

test("what a message on a tournament's page asks", () => {
  const cases: [string, TournamentAskKind | "search" | "other"][] = [
    ["Who's leading the table?", "leader"],
    ["who is winning", "leader"],
    ["who's on top", "leader"],
    ["who will win this", "leader"],
    ["kaun jeet raha hai", "leader"],
    ["sabse zyada runs kiske hain", "topScorer"],
    ["agla match kab hai", "next"],
    ["kitne match bache hain", "left"],
    ["show me the points table", "table"],
    ["standings", "table"],
    ["Who won the tournament?", "champion"],
    ["who are the champions", "champion"],
    ["who qualifies for the final", "playoffs"],
    ["who was in the semi finals", "playoffs"],
    ["Who won match 3?", "result"],
    ["who won the last match", "result"],
    ["Latest result?", "result"],
    ["kaun jeeta", "result"],
    ["results so far", "results"],
    ["score of Titans v Kings", "score"],
    ["what happened in match 2", "moments"],
    ["key moments of the final", "moments"],
    ["man of the match", "potm"],
    ["Who's the top scorer?", "topScorer"],
    ["who has the most runs", "topScorer"],
    ["orange cap", "topScorer"],
    ["Most wickets?", "topBowler"],
    ["purple cap kiske paas hai", "topBowler"],
    ["highest score", "highest"],
    ["best bowling figures", "bestBowling"],
    ["who hit the most sixes", "sixes"],
    ["most fours", "fours"],
    ["highest team total", "teamTotal"],
    ["biggest win", "bigWin"],
    ["When's the next match?", "next"],
    ["when do Kings play next", "next"],
    ["fixtures", "next"],
    ["How many matches are left?", "left"],
    ["What's on now?", "live"],
    ["is any match live", "live"],
    ["what is the nrr of Titans", "nrr"],
    ["what does net run rate mean", "nrr"],
    ["Where is it played?", "about"],
    ["Who's playing?", "about"],
    ["What's the format?", "about"],
    // Searches go on to the usual Ask, as on a live score page.
    ["football turf near me", "search"],
    ["box cricket turf near me tonight", "search"],
    ["any games tonight in Baner?", "search"],
    ["can I book a slot for tomorrow", "search"],
    ["host a game saturday 7pm", "search"],
    // About this tournament, though it names a day or a match.
    ["any matches tomorrow?", "other"],
    ["which match is tomorrow", "other"],
    // A greeting or a thank-you is answered here too.
    ["hello", "hello"],
    ["Thanks!", "hello"],
    // Anything else: the model, from the facts.
    ["who is the best fielder", "other"],
    ["hello who is the best fielder", "other"],
  ];
  for (const [q, kind] of cases) assert.equal(tournamentAskKind(q, { places: PLACES }), kind, q);
});

test("a match named by its number or its stage", () => {
  assert.deepEqual(matchRefOf("who won match 3"), { n: 3 });
  assert.deepEqual(matchRefOf("the 2nd match"), { n: 2 });
  assert.deepEqual(matchRefOf("first match"), { n: 1 });
  assert.deepEqual(matchRefOf("who won the final"), { stage: "final" });
  assert.deepEqual(matchRefOf("semi final 2"), { stage: "semi", slot: 2 });
  assert.deepEqual(matchRefOf("the first semi-final"), { stage: "semi", slot: 1 });
  assert.deepEqual(matchRefOf("the semis"), null);
  assert.deepEqual(matchRefOf("who won the last match"), { last: true });
  assert.equal(matchRefOf("what was the final score"), null, "the final score is a score, not the Final");
  assert.equal(matchRefOf("who is leading"), null);
});

test("once the tournament is known: a player's, a team's or one match's question", () => {
  const cases: [string, TournamentAskKind | "other"][] = [
    ["How many runs has Vikas scored?", "player"],
    ["how many wickets did Amit take", "player"],
    ["is Vikas playing well", "player"],
    ["Vikas", "player"],
    // Not in any scorecard or table: the model says so (and without it, the fallback does).
    ["who coaches Vikas", "other"],
    ["who is the captain of Titans", "other"],
    ["Titans", "team"],
    ["Titans results", "team"],
    ["how did Royals do", "team"],
    ["did Kings win", "team"],
    ["Who plays for Kings?", "squad"],
    ["Kings squad", "squad"],
    ["score of Titans v Kings", "score"],
    ["Titans vs Strikers", "score"],
    ["when do Kings play next", "next"],
    ["what is the nrr of Titans", "nrr"],
    ["top scorer in match 1", "match"],
    ["scorecard of match 2", "match"],
    ["who won match 1", "result"],
    ["who won the final", "result"],
    ["man of the match in match 1", "potm"],
    // A forecast that is none of the usual questions is answered with how it stands, never sent to the model.
    ["can Titans win it", "team"],
    ["will it rain on the final", "match"],
    ["could this go down to the wire", "other"],
  ];
  for (const [q, kind] of cases) {
    const r = read(q, league);
    assert.ok(!r.goesOn, q);
    assert.equal(r.kind, kind, q);
  }
  assert.equal(tournamentAnswerKind("other", league, "who should win from here"), "leader");
  assert.deepEqual(teamsNamed(league, "Titans vs strikers score"), ["Titans", "Strikers"]);
  assert.deepEqual(teamsNamed(league, "did the kings win"), ["Kings"]);
  assert.deepEqual(playersNamed(league, "how is vikas doing"), [{ name: "Vikas", team: "Strikers" }]);
  assert.deepEqual(playersNamed(league, "who will win"), [], "will is a word, not a player");
});

test("a search goes on to the usual Ask; the tournament's own names are never a place; a usual question stays", () => {
  assert.deepEqual(read("football turf near me", league), { goesOn: true });
  assert.deepEqual(read("any games tonight in Baner?", league), { goesOn: true });
  // Baner Box League and Kings Turf Arena are this tournament's own names: "turf" and "Baner" in them start no search.
  assert.deepEqual(read("where is Baner Box League played", league), { goesOn: false, kind: "about" });
  assert.deepEqual(read("who leads the Baner Box League", league), { goesOn: false, kind: "leader" });
  // The site has an NRR calculator, but here the question is the tournament's.
  assert.deepEqual(read("what is the net run rate of Titans", league), { goesOn: false, kind: "nrr" });
  assert.equal(tournamentGoesOn("nrr", "tool"), false);
  assert.equal(tournamentGoesOn("other", "tool"), true);
  assert.equal(tournamentGoesOn("other", "find_turf"), true);
  assert.equal(tournamentGoesOn("other", "other"), false, "small talk stays");
  assert.equal(tournamentGoesOn("other", null), false);
  assert.deepEqual(tournamentOwnNames(league).own, ["Baner Box League", "Kings Turf Arena, Baner", "Titans", "Strikers", "Royals", "Kings"]);
});

/* ------------------------------------------------------------------ */
/* Facts                                                               */
/* ------------------------------------------------------------------ */

test("the facts: the page's own table, results, what is on and next, and each scored match's card", () => {
  assert.equal(league.state, "on");
  assert.equal(league.name, "Baner Box League");
  assert.equal(league.format, "League + final");
  assert.equal(league.venue, "Kings Turf Arena, Baner");
  assert.equal(league.dates, "21 to 29 Nov");
  assert.deepEqual(league.teams, ["Titans", "Strikers", "Royals", "Kings"]);
  // The table is resolve()'s, row for row.
  const res = resolve(LEAGUE.view.tournament, LEAGUE.view.live);
  assert.deepEqual(league.table.map((r) => [r.pos, r.team, r.played, r.won, r.lost, r.points, r.nrr]), res.table.map((r, i) => [i + 1, r.team, r.played, r.won, r.lost, r.points, league.table[i].nrr]));
  assert.deepEqual(league.table.map((r) => `${r.team} ${r.points} ${r.nrr}`), ["Titans 4 +1.922", "Strikers 2 +2.000", "Royals 0 -1.866", "Kings 0 -2.333"]);
  assert.deepEqual(league.matches.map((m) => [m.title, m.state, m.entered, m.note]), [
    ["Match 1", "done", "live", "read"],
    ["Match 2", "done", "live", "read"],
    ["Match 3", "done", "typed", "typed"],
    ["Match 4", "live", null, "read"],
    ["Match 5", "scheduled", null, null],
    ["Match 6", "scheduled", null, null],
    ["Final", "scheduled", null, null],
  ]);
  assert.deepEqual(league.matches.map((m) => m.line), [
    "Match 1: Titans 28/2 (3.0) v Kings 21/2 (3.0). Titans won by 7 runs.",
    "Match 2: Royals 24/3 (3.0) v Strikers 25/1 (2.3). Strikers won by 4 wickets with 3 balls left.",
    "Match 3: Royals 31/4 (3.0) v Titans 32/2 (2.4). Titans won by 8 wickets.",
    "Match 4, on now: Strikers 30/2 (3.0), Kings 12/1 (1.2). Kings need 19 runs off 10 balls.",
    "Match 5, not played yet: Titans v Strikers, Sat 28 Nov, 7:30 pm.",
    "Match 6, not played yet: Kings v Royals, Sun 29 Nov, 5 pm.",
    "Final, not played yet: 1st v 2nd, no day set.",
  ]);
  assert.equal(league.played, 3);
  assert.equal(league.total, 7);
  assert.equal(league.champion, null);
  assert.equal(league.qualify, 2);
  // Player numbers come from the three scorecards (the match on now among them), never from the typed result.
  const st = league.stats!;
  assert.equal(st.matches, 3);
  assert.deepEqual(st.batters.slice(0, 3).map((b) => [b.name, b.team, b.runs, b.innings]), [["Vikas", "Strikers", 29, 2], ["Sameer", "Strikers", 16, 2], ["Manoj", "Kings", 16, 2]]);
  assert.deepEqual(st.bowlers.slice(0, 3).map((b) => [b.name, b.wickets, b.runs]), [["Sameer", 3, 23], ["Manoj", 3, 43], ["Amit", 2, 15]]);
  assert.deepEqual([st.sixes, st.fours], [6, 14]);
  // Team totals and margins come from every result, the typed one too.
  assert.deepEqual(league.totals[0], { team: "Titans", against: "Royals", match: "Match 3", score: "32/2", overs: "2.4", runs: 32 });
  assert.deepEqual(league.byRuns, { winner: "Titans", loser: "Kings", match: "Match 1", by: 7 });
  assert.deepEqual(league.byWickets, { winner: "Titans", loser: "Royals", match: "Match 3", by: 8 });
  assert.deepEqual(league.squads.Kings, ["Manoj", "Girish", "Pavan", "Lokesh", "Suresh", "Harsh"]);
});

test("a scorecard's card: both innings, each batter and bowler, and key moments built from the ball by ball list", () => {
  const card = LEAGUE.cards["2"] as Extract<MatchCard, { kind: "cricket" }>;
  assert.equal(card.kind, "cricket");
  assert.equal(card.state, "done");
  assert.equal(card.result, "Strikers won by 4 wickets with 3 balls left");
  assert.deepEqual(card.innings.map((i) => [i.side, i.score, i.overs]), [["a", "24/3", "3.0"], ["b", "25/1", "2.3"]]);
  assert.deepEqual(card.innings[1].batters, [
    { name: "Sameer", runs: 5, balls: 4, fours: 1, sixes: 0, out: "b Faiz", notOut: false },
    { name: "Vikas", runs: 17, balls: 8, fours: 2, sixes: 1, out: null, notOut: true },
    { name: "Nikhil", runs: 3, balls: 3, fours: 0, sixes: 0, out: null, notOut: true },
  ]);
  assert.deepEqual(card.innings[0].bowlers.map((b) => `${b.name} ${b.figures} ${b.overs}`), ["Sameer 2/15 2.0", "Vikas 1/9 1.0"]);
  // Wickets with who and how, and the innings' end, in the scorecard's own commentary lines, in order.
  assert.deepEqual(card.innings[0].moments, ["0.5 OUT! Imran b Sameer 5 (4)", "1.6 OUT! Zaid b Vikas 0 (2)", "2.4 OUT! Kabir c & b Sameer 0 (2)", "Innings over (overs done): Royals 24/3 (3.0 ov)"]);
  assert.deepEqual(card.innings[1].boundaries, ["0.1 Imran to Sameer, FOUR", "0.4 Imran to Vikas, SIX", "2.1 Imran to Vikas, FOUR", "2.3 Imran to Vikas, FOUR"]);
  // The over the chase turned on and the last over, each saying how it was picked.
  assert.deepEqual(card.closing, [
    "Turning over: over 1 of the chase (Imran bowling), 12 runs: the most runs in an over of a chase that got home.",
    "Last over: over 3 of the Strikers innings (Imran bowling): 4, dot, 4: 8 runs.",
  ]);
  // A chase that fell short turns on its wickets.
  assert.equal((CUP.cards["9"] as Extract<MatchCard, { kind: "cricket" }>).closing[0], "Turning over: over 3 of the chase (Aarav bowling), 2 wickets for 12 runs: the most wickets in an over of a chase that fell short.");
  // A match still on has no closing lines and no player of the match.
  const on = LEAGUE.cards["4"] as Extract<MatchCard, { kind: "cricket" }>;
  assert.equal(on.state, "live");
  assert.deepEqual(on.closing, []);
  assert.equal(on.potm, null);
  assert.equal(matchCard(null), null);
  assert.equal(matchCard({ nonsense: true }), null);
});

test("the scorer's quick-mode placeholders are nobody: no player numbers for Batter 1 or Bowler 2", () => {
  const m = scoreMatch({ home: "Titans", away: "Kings", rosterHome: ["Batter 1", "Batter 2", "Asha", "Bowler 1"], rosterAway: ["Batter 1", "Batter 2", "Bowler 1", "Bowler 2"], overs: 1, first: { overs: "4 1 W 6 . 1", bowlers: ["Bowler 1"] }, second: { overs: "1 1 . . 1 .", bowlers: ["Bowler 1"] }, title: "", venue: "" }, "ph1");
  const view: TournamentGetResponse = { ...TYPED.view, tournament: { ...TYPED.view.tournament, teams: [{ id: 1, name: "Titans", short: null }, { id: 2, name: "Kings", short: null }], fixtures: [{ ...TYPED.view.tournament.fixtures[0], home: 1, away: 2, result: { a: { runs: 12, wickets: 1, balls: 6 }, b: { runs: 3, wickets: 0, balls: 6 }, result: "auto", battedFirst: "a" }, live: "phlive000001", liveResult: { a: { name: "Titans", runs: 12, wickets: 1, balls: 6 }, b: { name: "Kings", runs: 3, wickets: 0, balls: 6 }, outcome: "a", battedFirst: "a", text: "Titans won by 9 runs" } }] } };
  const f = tournamentFacts({ status: "ok", view, cards: { "1": matchCard(m) } });
  assert.equal(f.matches[0].entered, "corrected", "scored live, the result then set by hand");
  assert.deepEqual(f.stats!.batters.map((b) => b.name), ["Asha"]);
  assert.deepEqual(f.stats!.bowlers, []);
  assert.deepEqual(f.squads, { Titans: ["Asha"] });
  assert.equal(f.lines.some((l) => /^(Batting|Bowling), (Batter|Bowler) \d/.test(l)), false);
});

/* ------------------------------------------------------------------ */
/* The usual questions, each sentence                                  */
/* ------------------------------------------------------------------ */

const SCOPE_LEAGUE = " That counts the 3 matches scored ball by ball; 1 result was typed in, so it adds no player numbers.";
const SCOPE_CUP = " That counts the 4 matches scored ball by ball; 5 results were typed in, so they add no player numbers.";
const NRR_MEANS = "Net run rate is the runs a team scores per over minus the runs it concedes per over, across its league matches. It separates teams level on points; a side bowled out is counted as facing its full overs, and a match with no result is left out.";

test("a league mid-way: who leads, the table, a result, a score, what is on, what is next, how many are left", () => {
  const cases: [string, string][] = [
    ["Who's leading the table?", "Titans lead the table with 4 points from 2 matches (won 2, lost 0), net run rate +1.922. Strikers are second with 2 points."],
    ["who is winning", "Titans lead the table with 4 points from 2 matches (won 2, lost 0), net run rate +1.922. Strikers are second with 2 points."],
    [
      "show me the points table",
      "The points table after 3 of 7 matches: 1. Titans, 4 points (played 2, won 2, lost 0, net run rate +1.922); 2. Strikers, 2 points (played 1, won 1, lost 0, net run rate +2.000); 3. Royals, 0 points (played 2, won 0, lost 2, net run rate -1.866); 4. Kings, 0 points (played 1, won 0, lost 1, net run rate -2.333).",
    ],
    ["Who won match 1?", "Match 1: Titans 28/2 (3.0) v Kings 21/2 (3.0). Titans won by 7 runs."],
    ["who won the last match", "Match 3: Royals 31/4 (3.0) v Titans 32/2 (2.4). Titans won by 8 wickets."],
    ["Latest result?", "Match 3: Royals 31/4 (3.0) v Titans 32/2 (2.4). Titans won by 8 wickets."],
    ["who won", "The tournament isn't over: 3 of 7 matches played. The latest result: Match 3: Royals 31/4 (3.0) v Titans 32/2 (2.4). Titans won by 8 wickets."],
    ["who won the final", "Final (1st v 2nd) hasn't been played yet; no day or time is set for it."],
    ["who won match 9", "There is no Match 9 in this tournament's fixtures."],
    ["Who won the tournament?", "No champion yet: 3 of 7 matches played. Titans lead the table with 4 points from 2 matches (won 2, lost 0), net run rate +1.922. Strikers are second with 2 points."],
    ["score of Titans v Kings", "Match 1: Titans 28/2 (3.0) v Kings 21/2 (3.0). Titans won by 7 runs."],
    ["Titans vs Strikers score", "Match 5 (Titans v Strikers) hasn't been played yet: it is set for Sat 28 Nov, 7:30 pm."],
    [
      "results so far",
      "Results so far: Match 1: Titans 28/2 (3.0) v Kings 21/2 (3.0). Titans won by 7 runs. Match 2: Royals 24/3 (3.0) v Strikers 25/1 (2.3). Strikers won by 4 wickets with 3 balls left. Match 3: Royals 31/4 (3.0) v Titans 32/2 (2.4). Titans won by 8 wickets.",
    ],
    ["What's on now?", "Match 4, on now: Strikers 30/2 (3.0), Kings 12/1 (1.2). Kings need 19 runs off 10 balls."],
    ["When's the next match?", "Match 4, on now: Strikers 30/2 (3.0), Kings 12/1 (1.2). Kings need 19 runs off 10 balls. Next: Match 5, Titans v Strikers, Sat 28 Nov, 7:30 pm."],
    ["when do Kings play next", "Match 4, on now: Strikers 30/2 (3.0), Kings 12/1 (1.2). Kings need 19 runs off 10 balls. Next: Match 6, Kings v Royals, Sun 29 Nov, 5 pm."],
    ["How many matches are left?", "4 matches are left: 3 of 7 played, and 1 of those left is on now. Next: Match 5, Titans v Strikers, Sat 28 Nov, 7:30 pm."],
    ["who qualifies for the final", "The top 2 of the table go through once the league is done, with 3 league matches still to finish. The top of the table right now: Titans and Strikers."],
    ["Where is it played?", "Baner Box League is at Kings Turf Arena, Baner."],
    ["Who's playing?", "4 teams: Titans, Strikers, Royals and Kings."],
    ["What's the format?", "Baner Box League is a League + final of 4 teams, 3 overs a side, 7 matches in all."],
    ["when does it start", "Its dates on the page: 21 to 29 Nov. Next: Match 5, Titans v Strikers, Sat 28 Nov, 7:30 pm."],
    ["how do the points work", "Points: win 2, tie 1, no result 1, loss 0. Teams level on points are split by net run rate, then by wins. A side bowled out counts the full 3 overs."],
  ];
  for (const [q, want] of cases) assert.equal(say(q, league), want, q);
});

test("the stats people ask about, from the scorecards, each saying what it counts", () => {
  const cases: [string, string][] = [
    ["Who's the top scorer?", `Most runs: Vikas (Strikers) with 29 in 2 innings, best 17 not out. Then Sameer (Strikers) 16 and Manoj (Kings) 16.${SCOPE_LEAGUE}`],
    ["Most wickets?", `Sameer (Strikers) and Manoj (Kings) are level on 3 wickets, the most in the tournament. Then Amit (Titans) 2 and Faiz (Royals) 1.${SCOPE_LEAGUE}`],
    ["highest score", `Highest score: Vikas (Strikers), 17 not out off 8 balls against Royals in Match 2. Next best: Amit (Titans) 15 not out (Match 1).${SCOPE_LEAGUE}`],
    ["best bowling figures", `Best bowling: Sameer (Strikers), 2/15 in 2.0 overs against Royals in Match 2. Next best: Amit (Titans) 2/15 (Match 1).${SCOPE_LEAGUE}`],
    ["who hit the most sixes", `Nikhil (Strikers), Amit (Titans), Rahul (Titans) and 3 more have hit the most sixes, 1 each. Sixes hit in all: 6.${SCOPE_LEAGUE}`],
    ["most fours", `Manoj (Kings) and Vikas (Strikers) have hit the most fours, 3 each. Then Sameer (Strikers) 2 and Karan (Titans) 1. Fours hit in all: 14.${SCOPE_LEAGUE}`],
    ["highest team total", "Highest team total: Titans 32/2 in 2.4 overs against Royals (Match 3). Next: Royals 31/4 against Titans (Match 3)."],
    ["biggest win", "Biggest win by runs: Titans beat Kings by 7 runs (Match 1). Biggest win by wickets: Titans beat Royals by 8 wickets (Match 3)."],
  ];
  for (const [q, want] of cases) assert.equal(say(q, league), want, q);
  assert.equal(say("Who's the top scorer?", cup), `Most runs: Aarav (Lions) with 41 in 3 innings, best 22. Then Reyansh (Lions) 26 and Vihaan (Lions) 25.${SCOPE_CUP}`);
  assert.equal(say("most wickets", cup), `Most wickets: Kunal (Lions) with 7, for 25 runs in 3.5 overs, best 4/14. Then Aarav (Lions) 6 and Hitesh (Wolves) 3.${SCOPE_CUP}`);
  assert.equal(say("biggest win", cup), "Biggest win by runs: Lions beat Wolves by 18 runs (Match 1). Biggest win by wickets: Panthers beat Eagles by 9 wickets (Match 2).");
  assert.equal(say("highest team total", cup), "Highest team total: Panthers 36/2 in 3.0 overs against Wolves (Match 4). Next: Lions 35/2 against Panthers (Match 5).");
});

test("a team's own leaders when the question names the team, and a greeting", () => {
  assert.equal(say("who took most wickets for Kings", league), `Most wickets for Kings: Manoj (Kings) with 3, for 43 runs in 4.0 overs, best 2/21. Then Girish (Kings) 1.${SCOPE_LEAGUE}`);
  assert.equal(say("Kings top scorer", league), `Most runs for Kings: Manoj (Kings) with 16 in 2 innings, best 11 not out. Then Pavan (Kings) 12 and Girish (Kings) 4.${SCOPE_LEAGUE}`);
  assert.equal(say("highest score by Titans", league), `Highest score for Titans: Amit (Titans), 15 not out off 7 balls against Kings in Match 1. Next best: Rahul (Titans) 7 (Match 1).${SCOPE_LEAGUE}`);
  assert.equal(say("most sixes for Royals", league), `Most sixes for Royals: Faiz (Royals) with 1. Sixes hit for Royals in all: 1.${SCOPE_LEAGUE}`);
  assert.equal(say("best bowling for Panthers", cup), `Best bowling for Panthers: Rohan (Panthers), 2/18 in 2.0 overs against Wolves in Match 4. Next best: Sahil (Panthers) 1/8 (Match 4).${SCOPE_CUP}`);
  // Eagles' only scorecard is the Final; Panthers never bowled Eagles out on one.
  assert.equal(say("top scorer for Eagles", cup), `Most runs for Eagles: Deepak (Eagles) with 9 in 1 innings, best 9. Then Aditya (Eagles) 8 and Farhan (Eagles) 5.${SCOPE_CUP}`);
  assert.equal(say("hello", league), "Hello. I answer from Baner Box League's table and scorecards. Ask me who's ahead, a result, the next match, the top scorer or a player's numbers.");
  assert.equal(say("thanks", typed), "Anytime. I answer from Office Cup's table and results. Ask me who's ahead, a result, the next match or a team's results.");
});

test("a team's results, a player's numbers match by match, a squad, the net run rate and what it means", () => {
  assert.equal(say("Titans results", league), "Titans are 1st in the table: played 2, won 2, lost 0, 4 points, net run rate +1.922. Results: Match 1 v Kings: Titans won by 7 runs; Match 3 v Royals: Titans won by 8 wickets. Next: Match 5, Titans v Strikers, Sat 28 Nov, 7:30 pm.");
  assert.equal(
    say("how did Royals do", league),
    "Royals are 3rd in the table: played 2, won 0, lost 2, 0 points, net run rate -1.866. Results: Match 2 v Strikers: Strikers won by 4 wickets with 3 balls left; Match 3 v Titans: Titans won by 8 wickets. Next: Match 6, Kings v Royals, Sun 29 Nov, 5 pm.",
  );
  assert.equal(
    say("How many runs has Vikas scored?", league),
    `Vikas (Strikers): 29 runs in 2 innings (16 balls, 3 fours, 1 six), best 17 not out. Match 2 v Royals: 17 not out off 8 balls; Match 4 v Kings: 12 not out off 8 balls. Bowling: 1 wicket for 13 runs in 1.2 overs. Match 2 v Royals: 1/9 in 1.0 overs; Match 4 v Kings: 0/4 in 0.2 overs.${SCOPE_LEAGUE}`,
  );
  assert.equal(
    say("Aarav", cup),
    `Aarav (Lions): 41 runs in 3 innings (22 balls, 5 fours, 2 sixes), best 22. Match 1 v Wolves: 11 off 6 balls, out b Hitesh; Semi-final 1 v Wolves: 8 off 6 balls, out c Gaurav b Hitesh; Final v Eagles: 22 off 10 balls, out c & b Aditya. Bowling: 6 wickets for 43 runs in 5.0 overs. Match 1 v Wolves: 2/12 in 2.0 overs; Semi-final 1 v Wolves: 1/8 in 1.0 overs; Final v Eagles: 3/23 in 2.0 overs.${SCOPE_CUP}`,
  );
  assert.equal(say("how many runs did Sachin score", league), "I can't find that player in this tournament's scorecards. I have 24 players from the 3 matches scored ball by ball; ask with the name as the scorecard spells it.");
  assert.equal(say("Who plays for Kings?", league), "Kings' players in the scorecards read here: Manoj, Girish, Pavan, Lokesh, Suresh and Harsh.");
  assert.equal(say("what is the nrr of Titans", league), `Titans' net run rate is +1.922: 60 runs in 5.4 overs for (10.59 an over) and 52 in 6.0 overs against (8.67 an over). ${NRR_MEANS}`);
  assert.equal(say("what does net run rate mean", league), `${NRR_MEANS} Here: Titans +1.922, Strikers +2.000, Royals -1.866, Kings -2.333.`);
});

test("one match in full, its key moments, and its player of the match, from the scorecard", () => {
  assert.equal(
    say("top scorer in match 1", league),
    "Match 1: Titans 28/2 (3.0) v Kings 21/2 (3.0). Titans won by 7 runs. Top scores: Amit 15 not out off 7 for Titans; Rahul 7 off 7 for Titans; Manoj 11 not out off 9 for Kings; Pavan 5 off 4 for Kings. Best bowling: Girish 1/6 in 1.0 overs for Kings; Amit 2/15 in 2.0 overs for Titans. Player of the match on the scorecard: Amit, 15* (7) and 2/15 (Titans).",
  );
  assert.equal(
    say("what happened in match 2", league),
    "Match 2, Royals v Strikers, from its ball by ball list. Royals 24/3 in 3.0 overs, with 2 fours, 1 six: 0.5 OUT! Imran b Sameer 5 (4); 1.6 OUT! Zaid b Vikas 0 (2); 2.4 OUT! Kabir c & b Sameer 0 (2); Innings over (overs done): Royals 24/3 (3.0 ov). Strikers 25/1 in 2.3 overs, with 3 fours, 1 six: 1.2 OUT! Sameer b Faiz 5 (4); Innings over (target reached): Strikers 25/1 (2.3 ov). Turning over: over 1 of the chase (Imran bowling), 12 runs: the most runs in an over of a chase that got home. Last over: over 3 of the Strikers innings (Imran bowling): 4, dot, 4: 8 runs. Strikers won by 4 wickets with 3 balls left.",
  );
  assert.equal(say("man of the match in the final", cup), "Final's player of the match on its scorecard: Aarav, 22 (10) and 3/23 and 1 catch (Lions). Final: Lions 34/3 (3.0) v Eagles 31/4 (3.0). Lions won by 3 runs.");
  assert.equal(
    say("player of the match", cup),
    `Players of the match, as each scorecard has them: Match 1: Aarav, 11 (6) and 2/12 and 1 catch (Lions); Match 4: Rohan, 15 (8) and 2/18 and 1 catch (Panthers); Semi-final 1: Kunal, 1* (1) and 4/14 (Lions); Final: Aarav, 22 (10) and 3/23 and 1 catch (Lions).${SCOPE_CUP} There is no player of the tournament on this page.`,
  );
});

test("a finished tournament with playoffs: the champion, the final, the semi-finals, nothing left", () => {
  const cases: [string, string][] = [
    ["Who won the tournament?", "Lions are the champions. Final: Lions 34/3 (3.0) v Eagles 31/4 (3.0). Lions won by 3 runs."],
    ["who's leading", "Lions are the champions. Final: Lions 34/3 (3.0) v Eagles 31/4 (3.0). Lions won by 3 runs."],
    ["who won", "Lions are the champions. Final: Lions 34/3 (3.0) v Eagles 31/4 (3.0). Lions won by 3 runs."],
    ["who won the final", "Final: Lions 34/3 (3.0) v Eagles 31/4 (3.0). Lions won by 3 runs."],
    ["who won semi final 2", "Semi-final 2: Panthers 28/3 (3.0) v Eagles 29/2 (2.5). Eagles won by 8 wickets."],
    ["who won match 2", "Match 2: Eagles 25/5 (3.0) v Panthers 26/1 (2.2). Panthers won by 9 wickets."],
    ["how many matches are left", "Every match has been played: 9 of 9. Lions are the champions. Final: Lions 34/3 (3.0) v Eagles 31/4 (3.0). Lions won by 3 runs."],
    ["When's the next match?", "Every match has been played. Lions are the champions. Final: Lions 34/3 (3.0) v Eagles 31/4 (3.0). Lions won by 3 runs."],
    ["What's on now?", "No match is being scored live right now. The latest result: Final: Lions 34/3 (3.0) v Eagles 31/4 (3.0). Lions won by 3 runs. Every match has been played."],
    [
      "who was in the semi finals",
      "The league stage is over and the top 4 went through. Semi-final 1: Lions 30/2 (3.0) v Wolves 22/5 (2.5). Lions won by 8 runs. Semi-final 2: Panthers 28/3 (3.0) v Eagles 29/2 (2.5). Eagles won by 8 wickets. Final: Lions 34/3 (3.0) v Eagles 31/4 (3.0). Lions won by 3 runs.",
    ],
    [
      "Lions results",
      "Lions are the champions. Lions are 1st in the table: played 3, won 3, lost 0, 6 points, net run rate +3.931. Results: Match 1 v Wolves: Lions won by 18 runs; Match 3 v Eagles: Lions won; Match 5 v Panthers: Lions won by 5 runs; Semi-final 1 v Wolves: Lions won by 8 runs; Final v Eagles: Lions won by 3 runs. Lions have no match left on the fixture list.",
    ],
  ];
  for (const [q, want] of cases) assert.equal(say(q, cup), want, q);
});

test("typed results only: the table, results and margins are answered; anything about players is said to be unreadable, plainly", () => {
  assert.equal(typed.stats, null);
  const none = "Every result here was typed in with a score and a margin, so there is no scorecard to read and I can't tell you";
  const cases: [string, string][] = [
    ["Who's leading the table?", "Devs and Sales are level on 2 points at the top of the table; Devs are ahead on net run rate (+1.333 against -0.240)."],
    ["who won match 2", "Match 2: Sales 55/5 (6.0) v Devs 56/3 (5.2). Devs won by 7 wickets."],
    ["When's the next match?", "Next: Match 3, Devs v Design, Fri 4 Dec, 6 pm."],
    ["highest team total", "Highest team total: Devs 56/3 in 5.2 overs against Sales (Match 2). Next: Sales 55/5 against Devs (Match 2)."],
    ["biggest win", "Biggest win by runs: Sales beat Design by 4 runs (Match 1). Biggest win by wickets: Devs beat Sales by 7 wickets (Match 2)."],
    ["Devs results", "Devs are 1st in the table: played 1, won 1, lost 0, 2 points, net run rate +1.333. Results: Match 2 v Sales: Devs won by 7 wickets. Next: Match 3, Devs v Design, Fri 4 Dec, 6 pm."],
    ["Who's the top scorer?", `${none} who scored the runs.`],
    ["most wickets", `${none} who took the wickets.`],
    ["highest score", `${none} who made the highest score.`],
    ["best bowling figures", `${none} who bowled best.`],
    ["who hit the most sixes", `${none} who hit the sixes.`],
    ["player of the match", `${none} who was player of the match.`],
    ["how many runs did Ravi score", `${none} a player's numbers.`],
    ["who plays for Sales", "I have no player names for Sales: none of their matches has a ball-by-ball scorecard to read here."],
    ["what happened in match 2", "That match's result was typed in, so there is no scorecard to read: no batters, bowlers or ball by ball for it. Match 2: Sales 55/5 (6.0) v Devs 56/3 (5.2). Devs won by 7 wickets."],
    ["top scorer in match 1", "Match 1: Sales 48/6 (6.0) v Design 44/7 (6.0). Sales won by 4 runs. That match's result was typed in, so there is no scorecard to read: no batters, bowlers or ball by ball for it."],
    ["Where is it played?", "The organiser hasn't put a venue on this page."],
    ["when does it start", "The organiser hasn't put dates on this page. Next: Match 3, Devs v Design, Fri 4 Dec, 6 pm."],
  ];
  for (const [q, want] of cases) assert.equal(say(q, typed), want, q);
  // In a tournament with both kinds, a typed match says so only where it matters.
  assert.equal(say("key moments of match 3", league), "That match's result was typed in, so there is no scorecard to read: no batters, bowlers or ball by ball for it. Match 3: Royals 31/4 (3.0) v Titans 32/2 (2.4). Titans won by 8 wickets.");
});

test("never a forecast: who will win is answered with how it stands, in code", () => {
  assert.equal(say("who will win the league", league), "I can't say what will happen, only how it stands. Titans lead the table with 4 points from 2 matches (won 2, lost 0), net run rate +1.922. Strikers are second with 2 points.");
  assert.equal(say("can Kings still qualify", league), "I can't say what will happen, only how it stands. The top 2 of the table go through once the league is done, with 3 league matches still to finish. The top of the table right now: Titans and Strikers.");
  assert.match(say("will Titans win the final", league), /^I can't say what will happen, only how it stands\. /);
  assert.match(say("who are the favourites", league), /^I can't say what will happen, only how it stands\. Titans lead the table/);
  assert.match(say("can Titans win it", league), /^I can't say what will happen, only how it stands\. Titans are 1st in the table/);
  for (const q of ["who will win the league", "can Kings still qualify", "will Titans win the final", "who are the favourites", "who should win from here", "what are Royals' chances"]) {
    const r = read(q, league);
    assert.ok(!r.goesOn && r.kind !== "other", `${q}: a forecast never reaches the model`);
  }
});

test("a tournament that can't be read, was taken down or has nothing yet", () => {
  const missing = tournamentFacts({ status: "missing" });
  const unknown = tournamentFacts({ status: "unknown" });
  const removed = tournamentFacts({ status: "ok", view: { ...TYPED.view, tournament: { ...TYPED.view.tournament, status: "removed" } } });
  assert.equal(tournamentReply("leader", missing), "I can't find a tournament for this link. Check the link with whoever sent it.");
  assert.equal(tournamentReply("topScorer", unknown), "I can't read this tournament right now. Ask me again in a moment.");
  assert.equal(tournamentReply("table", removed), "The organiser took this tournament down, so there is nothing to read here now.");
  assert.equal(tournamentFallback(removed, "hello"), "The organiser took this tournament down, so there is nothing to read here now.");
  assert.deepEqual(unknown.lines, ["Status: the tournament could not be read just now."]);
  // Nothing played yet.
  const fresh = tournamentFacts({ status: "ok", view: { ...TYPED.view, tournament: { ...TYPED.view.tournament, fixtures: TYPED.view.tournament.fixtures.map((x) => ({ ...x, result: null })) } } });
  assert.equal(say("Who's leading the table?", fresh), "No match has a result yet, so nobody is ahead. Next: Match 1, Sales v Design; no day or time is set for it yet.");
  assert.equal(say("Who's the top scorer?", fresh), "No match has been played yet, so I can't tell you who scored the runs. Next: Match 1, Sales v Design; no day or time is set for it yet.");
  assert.equal(say("Latest result?", fresh), "No match has a result yet. Next: Match 1, Sales v Design; no day or time is set for it yet.");
  assert.equal(say("points table", fresh), "No match has a result yet, so every team is on 0 points: Devs, Design and Sales. Next: Match 1, Sales v Design; no day or time is set for it yet.");
});

test("a two-team series: the series score, not a table", () => {
  const s: Settings = { ...TYPED.view.tournament.settings, format: "bilateral", matches: 3, overs: 6 };
  const teams = [{ id: 1, name: "Sharks", short: null }, { id: 2, name: "Lions", short: null }];
  const fixtures: Fixture[] = makeFixtures(s, [1, 2]).map((x, i) => ({ ...x, live: null, liveResult: null, result: i === 0 ? { a: { runs: 50, wickets: 4, balls: 36 }, b: { runs: 41, wickets: 6, balls: 36 }, result: "auto", battedFirst: "a", text: "Sharks won by 9 runs" } : null }));
  const f = tournamentFacts({ status: "ok", view: { tournament: { ...TYPED.view.tournament, name: "Sunday session", settings: s, teams, fixtures }, live: {}, at: 0 } });
  assert.equal(say("who is leading", f), "Sharks lead the series: Sharks 1 - 0 Lions, after 1 of 3 matches.");
  assert.equal(say("points table", f), "This is a series, so there is no points table: Sharks 1 - 0 Lions, after 1 of 3 matches.");
  assert.equal(say("who qualifies", f), "This is a series between two teams, so there are no playoffs. Sharks 1 - 0 Lions");
  // A turf session's result carries its own words for the margin: said as the page says it.
  assert.equal(say("who won match 1", f), "Match 1: Sharks 50/4 (6.0) v Lions 41/6 (6.0). Sharks won by 9 runs.");
  assert.deepEqual(tournamentAskChips(f.has).slice(0, 2), ["What's the series score?", "Latest result?"]);
});

test("another sport on the Live Scoreboard: what the board holds, and no cricket numbers", () => {
  let b: Board = newBoard("football", { teamA: "Devs", teamB: "Design" }, { id: "bf", now: 0 });
  const go = (e: BoardEvent) => (b = applyBoard(b, e));
  go({ type: "clock", run: true, at: 1000 });
  go({ type: "point", side: "a", how: "goal", player: "Ravi", at: 2000 });
  const card = matchCard(b);
  assert.equal(card?.kind, "board");
  const off: LiveNow = { status: "off", closed: false, headline: "", a: null, b: null, batting: null, updatedAt: "2026-11-27T10:00:00.000Z", result: null };
  const view: TournamentGetResponse = {
    ...TYPED.view,
    tournament: { ...TYPED.view.tournament, fixtures: TYPED.view.tournament.fixtures.map((x) => ({ ...x, result: null, ...(x.id === 3 ? { live: "boardlive001" } : {}) })) },
    live: { "3": off },
  };
  const f = tournamentFacts({ status: "ok", view, cards: { "3": card } });
  const m = f.matches[2];
  assert.equal(m.note, "board");
  assert.equal(m.state, "scheduled", "the page counts a board for nothing until a result is typed, and so does this");
  assert.match(m.line, /^Match 3, not played yet: Devs v Design, Fri 4 Dec, 6 pm\. On the Live Scoreboard \(football\): /);
  assert.match(m.line, /Devs 1/);
  assert.equal(f.stats, null);
  assert.match(say("Who's the top scorer?", f), /^This tournament's matches are football on the Live Scoreboard, which keeps the score and not runs or wickets, so I can't tell you who scored the runs\. Match 3, not played yet/);
  assert.match(say("score of Devs v Design", f), /On the Live Scoreboard \(football\)/);
  assert.match(f.lines.join("\n"), /1 on the Live Scoreboard \(another sport: a score, no cricket numbers\)/);
});

/* ------------------------------------------------------------------ */
/* The guard on a model's reply                                        */
/* ------------------------------------------------------------------ */

test("the guard passes a reply that only phrases the facts", () => {
  const ok = [
    "Titans are on top with 4 points from 2 matches.",
    "Vikas has 29 runs in 2 innings for Strikers, the most so far.",
    "Titans beat Kings by 7 runs in Match 1.",
    "Kings lost to Titans by 7 runs.",
    "Match 4 is on now: Kings need 19 runs off 10 balls.",
    "I can't tell that from this tournament's scorecards. They do show Sameer and Manoj level on 3 wickets.",
    "Hello. I can tell you who is ahead, a result, the next match or a player's numbers.",
    "Match 3's result was typed in, so there is no scorecard to read. Titans won it by 8 wickets.",
    "Abhi Titans sabse aage hain, 4 points ke saath.",
    "I can't say who will win, only how it stands: Titans lead with 4 points.",
    "The next match is Match 5, Titans v Strikers, on Sat 28 Nov at 7:30 pm.",
  ];
  for (const r of ok) assert.deepEqual(tournamentReplyOk(r, league, "anything"), { ok: true }, r);
  assert.deepEqual(tournamentReplyOk("Lions are the champions after beating Eagles by 3 runs in the Final.", cup), { ok: true });
});

test("the guard refuses an invented number, an invented player and an invented result", () => {
  const bad: [string, string][] = [
    // A number the facts don't have at all.
    ["Vikas has scored 87 runs so far.", "number"],
    ["Titans are top with 4 points, 13 clear of Kings.", "number"],
    // A number the facts have, about somebody else: Vikas has 29, Amit 15.
    ["Amit is the top scorer with 29 runs.", "number"],
    ["Kings lead the table with 4 points.", "number"],
    // A player, a team or a place nobody named.
    ["Sachin is the top scorer for Titans.", "name"],
    ["The best fielder so far is Jadeja.", "name"],
    ["The final will be at Wankhede.", "name"],
    ["Mumbai Indians are second.", "name"],
    // A result the facts don't have: the wrong winner, a margin no match had, a title nobody has won.
    ["Kings beat Titans by 7 runs in Match 1.", "result"],
    ["Royals won by 8 wickets against Titans.", "result"],
    ["Royals have won a match already.", "result"],
    ["Titans lost Match 1.", "result"],
    ["Strikers lost to Royals in Match 2.", "result"],
    ["Titans are the champions.", "result"],
    ["Titans won by 12 runs.", "result"],
    // A forecast dressed as a fact, and the word players never read.
    ["Titans should win the league from here.", "forecast"],
    ["Titans are the favourites now.", "forecast"],
    ["Strikers will probably qualify.", "forecast"],
    ["You can book the turf for the final.", "words"],
  ];
  for (const [r, why] of bad) assert.deepEqual(tournamentReplyOk(r, league, "who is doing well"), { ok: false, why }, r);
  // On typed results there is no player to name at all.
  assert.deepEqual(tournamentReplyOk("Ravi top scored with 31 for Devs.", typed, "who top scored"), { ok: false, why: "name" });
  assert.deepEqual(tournamentReplyOk("Eagles beat Lions by 3 runs in the Final.", cup), { ok: false, why: "result" });
  // A name the player typed may be said back: "I can't find Ravi" is no invention.
  assert.deepEqual(tournamentReplyOk("I can't tell that from this tournament's scorecards: Ravi isn't in them.", league, "how is Ravi doing"), { ok: true });
});

test("the model's answer is used only when it passes; otherwise the code-built answer or that the scorecards don't say", async () => {
  const told: string[] = [];
  const phrase =
    (reply: string | null): Phrase =>
    async (ask) => {
      told.push(ask.message);
      return reply;
    };
  const far = Date.now() + 10_000;
  const ok = await answerTournament("who is the best fielder", league, [], newUsage(), far, phrase("I can't tell that from this tournament's scorecards. They do show Sameer and Manoj level on 3 wickets."));
  assert.deepEqual(ok, { reply: "I can't tell that from this tournament's scorecards. They do show Sameer and Manoj level on 3 wickets.", via: "claude" });
  const fallback = "I can't tell that from this tournament's scorecards. Ask me who's ahead, a result, the next match, the top scorer or a player's numbers.";
  assert.equal(tournamentFallback(league, "who is the best fielder"), fallback);
  assert.ok(fallback.startsWith(NOT_SAID));
  for (const [reply, why] of [
    ["Jadeja has been the best fielder with 4 catches.", "name"],
    ["Vikas has taken 33 catches.", "number"],
    ["Kings beat Titans in Match 1.", "result"],
    ["Titans should win it.", "forecast"],
    ["Try Playo to find a ground.", "name"],
  ] as const) {
    assert.deepEqual(await answerTournament("who is the best fielder", league, [], newUsage(), far, phrase(reply)), { reply: fallback, via: "keywords", refused: why }, reply);
  }
  // A question naming a player or a team falls back to that player's or team's own lines.
  const vikas = await answerTournament("is Vikas the best", league, [], newUsage(), far, phrase("Vikas is the best with 99 runs."));
  assert.equal(vikas.via, "keywords");
  assert.match(vikas.reply, /^I can't tell that from this tournament's scorecards\. What they do say: Vikas \(Strikers\): 29 runs in 2 innings/);
  assert.match(tournamentFallback(league, "who is the captain of Titans"), /^I can't tell that from this tournament's scorecards\. What the page does say: Titans are 1st in the table/);
  // No reply, a thrown call, or no key at all: the fallback, never an error.
  assert.deepEqual(await answerTournament("x", league, [], newUsage(), far, phrase(null)), { reply: fallback, via: "keywords" });
  assert.deepEqual(await answerTournament("x", league, [], newUsage(), far, async () => Promise.reject(new Error("down"))), { reply: fallback, via: "keywords" });
  const key = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  assert.deepEqual(await answerTournament("x", league, [], newUsage(), far), { reply: fallback, via: "keywords" });
  if (key !== undefined) process.env.ANTHROPIC_API_KEY = key;
  // What the model is sent: the instructions, the digest as a block of its own, and the message with the last two turns.
  const ask = tournamentAsk("who is the best fielder", league, [{ user: "a", reply: "b" }, { user: "c", reply: "d" }, { user: "e", reply: "f" }]);
  assert.equal(ask.system, TOURNAMENT_SYSTEM);
  assert.equal(ask.facts, `FACTS\n${league.lines.join("\n")}`);
  assert.equal(ask.message, "EARLIER IN THE CHAT\nPlayer: c\nTapTurf: d\nPlayer: e\nTapTurf: f\n\nMESSAGE\nwho is the best fielder");
  assert.equal(/\b(ago|today|now is|minutes?)\b/.test(ask.facts), false, "no clock in the digest: it is the same text until the tournament changes");
  assert.equal(/[—–]/.test(`${TOURNAMENT_SYSTEM}${ask.facts}`), false);
});

/* ------------------------------------------------------------------ */
/* The digest                                                          */
/* ------------------------------------------------------------------ */

const sizeOf = (f: TournamentFacts) => f.lines.join("\n").length;

test("the digest is small and whole for the fixture tournaments", () => {
  const sizes = { league: sizeOf(league), cup: sizeOf(cup), typed: sizeOf(typed) };
  assert.deepEqual(sizes, { league: 8561, cup: 11610, typed: 1520 });
  assert.deepEqual([league, cup, typed].map((f) => tokensOf(sizeOf(f))), [2141, 2903, 380]);
  for (const f of [league, cup, typed]) {
    assert.ok(sizeOf(f) <= DIGEST_MAX_CHARS);
    assert.deepEqual(f.left, []);
  }
  // Every line the answers are built from is in it: the table, each match, each scorecard.
  const text = league.lines.join("\n");
  for (const m of league.matches) assert.ok(text.includes(m.line), m.title);
  assert.match(text, /^1\. Titans: played 2, won 2, lost 0, 4 points, net run rate \+1\.922 \(60 runs in 5\.4 overs for, 10\.59 an over, and 52 in 6\.0 against, 8\.67 an over\)\.$/m);
  assert.match(text, /^Match 3: .* Typed result: a score and a margin, no scorecard\.$/m);
  assert.match(text, /^Match 2, 2nd innings, Strikers batting 25\/1 in 2\.3 overs: Sameer 5 off 4 balls, out b Faiz, 1 four; Vikas 17 not out off 8 balls, 2 fours, 1 six; Nikhil 3 not out off 3 balls\.$/m);
  assert.match(text, /^Batting, Vikas \(Strikers\): 29 runs in 2 innings, 16 balls, 3 fours, 1 six, best 17 not out against Royals in Match 2\. Number 1 for runs\.$/m);
  assert.match(text, /^Match 1, player of the match on its scorecard: Amit, 15\* \(7\) and 2\/15 \(Titans\)\.$/m);
});

/** A long league: 12 teams (66 matches), every match scored live, each with the cup final's scorecard. */
function longLeague(matches: number): TournamentFixture {
  const settings: Settings = { ...TYPED.view.tournament.settings, overs: 3 };
  const teams = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Team ${String.fromCharCode(65 + i)}`, short: null }));
  const card = CUP.cards["9"]!;
  const kept = CUP.view.tournament.fixtures[8].liveResult!;
  const cards: Record<string, MatchCard | null> = {};
  const fixtures: Fixture[] = makeFixtures(settings, teams.map((t) => t.id)).map((x, i) => {
    if (i >= matches) return { ...x, live: null, liveResult: null };
    cards[String(x.id)] = card;
    return { ...x, live: `longlive${String(x.id).padStart(4, "0")}`, liveResult: { ...kept, a: { ...kept.a, name: teams[x.home! - 1].name }, b: { ...kept.b, name: teams[x.away! - 1].name }, text: `${teams[x.home! - 1].name} won by 3 runs` }, result: { a: { runs: 34, wickets: 3, balls: 18 }, b: { runs: 31, wickets: 4, balls: 18 }, result: "auto", battedFirst: "a" } };
  });
  return { view: { tournament: { ...TYPED.view.tournament, name: "Long League", settings, teams, fixtures }, live: {}, at: 0 }, matches: {}, cards };
}

test("a long tournament: the digest stays under the cap, leaving out old ball by ball first, then scorecards, then results, and says so", () => {
  const long = longLeague(12);
  const whole = factsOf(long, 1_000_000);
  assert.deepEqual(whole.left, []);
  assert.ok(sizeOf(whole) > DIGEST_MAX_CHARS, "twelve scored matches of a 12-team league do not fit whole");
  const f = factsOf(long);
  assert.ok(sizeOf(f) <= DIGEST_MAX_CHARS, `${sizeOf(f)}`);
  assert.equal(f.stats!.matches, 12);
  // First to go: ball-by-ball detail, oldest match first. Scorecards and results all stay.
  assert.equal(f.left.length, 1);
  assert.match(f.left[0], /^Ball-by-ball detail left out for Match 1, Match 2, /);
  const text = f.lines.join("\n");
  assert.match(text, /^Left out of these facts to keep them short \(the page has them\): Ball-by-ball detail left out for /m);
  assert.equal(/^Match 1, Team [A-L] innings, ball by ball/m.test(text), false);
  assert.equal(/^Match 12, Team [A-L] innings, ball by ball/m.test(text), true, "the newest match keeps its detail");
  assert.equal(/^Match 1, 1st innings/m.test(text), true, "its scorecard is still there");
  // The answers are built from the facts, not the digest: nothing is lost to them.
  assert.equal(say("who won match 1", f), "Match 1: Team A 34/3 (3.0) v Team L 31/4 (3.0). Team A won by 3 runs.");
  assert.match(say("what happened in match 1", f), /Turning over: over 3 of the chase/);

  // Tighter: scorecards go next, again oldest first, and only once no detail is left to drop.
  const tight = factsOf(long, 14_000);
  assert.ok(sizeOf(tight) <= 14_000, `${sizeOf(tight)}`);
  assert.deepEqual(tight.left.map((l) => l.split(" left out")[0]), ["Ball-by-ball detail", "Scorecards"]);
  assert.match(tight.left[0], /Match 1, Match 2, Match 3, Match 4, Match 5 and 7 more\.$/, "every match's detail went before any scorecard");
  assert.match(tight.left[1], /^Scorecards left out for Match 1, /);
  assert.equal(/^Match 1, 1st innings/m.test(tight.lines.join("\n")), false);
  assert.equal(/^Match 12, 1st innings/m.test(tight.lines.join("\n")), true, "the newest scorecard stays");
  assert.equal(/^Match 1: Team A/m.test(tight.lines.join("\n")), true, "its result is still there");

  // A whole 66-match league, every match scored: finished matches' own lines go last, and it still fits.
  const all = longLeague(66);
  const full = factsOf(all);
  assert.ok(sizeOf(full) <= DIGEST_MAX_CHARS, `${sizeOf(full)}`);
  assert.ok(tokensOf(sizeOf(full)) <= 6_000);
  assert.deepEqual(full.left.map((l) => l.split(" left out")[0]), ["Ball-by-ball detail", "Scorecards"]);
  const tiny = factsOf(all, 6_500);
  assert.ok(sizeOf(tiny) <= 6_500, `${sizeOf(tiny)}`);
  assert.deepEqual(tiny.left.map((l) => l.split(" left out")[0]), ["Ball-by-ball detail", "Scorecards", "Results"]);
  assert.equal(/^Match 1: Team A/m.test(tiny.lines.join("\n")), false);
  assert.match(tiny.lines.join("\n"), /^1\. Team /m, "the table is never dropped");
  assert.match(tiny.lines.join("\n"), /^Batting, /m, "nor the players' numbers");

  // The longest tournament there can be (300 fixtures), nothing played: under the cap with every fixture in.
  const s: Settings = { ...TYPED.view.tournament.settings, legs: 2 };
  const teams = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, name: `Team ${String.fromCharCode(65 + i)} United XI`, short: null }));
  const fixtures: Fixture[] = makeFixtures(s, teams.map((t) => t.id)).map((x) => ({ ...x, day: "2026-12-05", time: "19:30", live: null, liveResult: null }));
  const big = tournamentFacts({ status: "ok", view: { tournament: { ...TYPED.view.tournament, settings: s, teams, fixtures }, live: {}, at: 0 } });
  assert.equal(big.total, 240);
  assert.ok(sizeOf(big) <= DIGEST_MAX_CHARS, `${sizeOf(big)}`);
  // Squeezed, the far end of the fixture list goes; the next matches stay.
  const squeezed = tournamentFacts({ status: "ok", view: { tournament: { ...TYPED.view.tournament, settings: s, teams, fixtures }, live: {}, at: 0 } }, 12_000);
  assert.ok(sizeOf(squeezed) <= 12_000, `${sizeOf(squeezed)}`);
  assert.match(squeezed.left[0], /^Fixtures left out for the last \d+ matches still to be played\.$/);
  assert.match(squeezed.lines.join("\n"), /^Match 1, not played yet: /m);
  assert.equal(/^Match 240, not played yet: /m.test(squeezed.lines.join("\n")), false);
});

test("which scorecards are read: a finished one once (kept by its result), one in play each time, a typed result never", () => {
  // The league: Match 1 and 2 finished on their scorecards, Match 4 is being scored, Match 3 was typed in.
  const l = scorecardsOf(LEAGUE.view.tournament);
  assert.deepEqual(l.kept.map((w) => [w.id, w.code]), [[1, "leaguelive01"], [2, "leaguelive02"]]);
  assert.deepEqual(l.inPlay, [{ id: 4, code: "leaguelive04" }]);
  assert.equal(l.kept[0].stamp, JSON.stringify(LEAGUE.view.tournament.fixtures[0].liveResult), "kept under its result: it changes only if the scorecard's result does");
  // The cup: nine fixtures, four finished scorecards, none in play.
  const c = scorecardsOf(CUP.view.tournament);
  assert.deepEqual(c.kept.map((w) => w.id), [1, 4, 7, 9]);
  assert.deepEqual(c.inPlay, []);
  assert.deepEqual(scorecardsOf(TYPED.view.tournament), { kept: [], inPlay: [] });
  // A hand correction over a finished scorecard still reads its card; a result typed over one that never finished does not; a link waiting for its first ball is in play.
  const fixtures = LEAGUE.view.tournament.fixtures.map((x) => (x.id === 1 ? { ...x, result: { a: { runs: 28, wickets: 2, balls: 18 }, b: { runs: 21, wickets: 2, balls: 18 }, result: "a" as const, battedFirst: "a" as const } } : x.id === 4 ? { ...x, result: { a: { runs: 30, wickets: 2, balls: 18 }, b: { runs: 20, wickets: 5, balls: 18 }, result: "auto" as const, battedFirst: "a" as const } } : x.id === 5 ? { ...x, live: "leaguelive05" } : x));
  const w = scorecardsOf({ fixtures });
  assert.deepEqual(w.kept.map((x) => x.id), [1, 2]);
  assert.deepEqual(w.inPlay, [{ id: 5, code: "leaguelive05" }]);
  // The finished matches' results come from the fixtures themselves: no scorecard state is needed to say them.
  const bare = tournamentFacts({ status: "ok", view: { ...LEAGUE.view, live: { "4": LEAGUE.view.live["4"] } }, cards: LEAGUE.cards });
  assert.deepEqual(bare.matches.map((m) => m.line), league.matches.map((m) => m.line));
  assert.deepEqual(bare.lines, league.lines);
  // Past the cap, the oldest are left as not read: their matches keep their result and say so.
  assert.equal(MAX_CARDS, 30);
  const long = longLeague(40);
  const read = Object.fromEntries(Object.entries(long.cards).slice(-MAX_CARDS));
  const f = tournamentFacts({ status: "ok", view: long.view, cards: read, unread: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
  assert.equal(f.stats!.matches, 30);
  assert.equal(f.matches[0].note, "unread");
  assert.match(say("top scorer in match 1", f), /That match was scored live, but its scorecard is not among the ones I read for this tournament, so I only have the result\.$/);
  assert.match(say("Who's the top scorer?", f), /That counts the 30 matches scored ball by ball; 10 scorecards are not kept here, so they add no player numbers\.$/);
});

/* ------------------------------------------------------------------ */
/* The eval set, offline                                               */
/* ------------------------------------------------------------------ */

type EvalQuestion = { id: string; q: string; tournament?: string; expect?: Record<string, unknown>; facts?: string[] };
type Grade = { gradeReply: (q: EvalQuestion, reply: unknown, truth: null) => { fails: string[]; skipped: string[] } };
// A real import(): the tests are compiled to CommonJS, the grader is an ES module.
const load = new Function("p", "return import(p)") as (p: string) => Promise<Grade>;

test("the eval set's tournament questions (scripts/ask-eval/questions.json), run offline through the route's own reading with a stand-in for the model, pass the grader", async () => {
  const { gradeReply } = await load(pathToFileURL(resolvePath("scripts/ask-eval/grade.mjs")).href);
  const { questions } = JSON.parse(readFileSync("scripts/ask-eval/questions.json", "utf8")) as { questions: EvalQuestion[] };
  const { replies } = JSON.parse(readFileSync("scripts/ask-eval/tournament-model.json", "utf8")) as { replies: Record<string, string> };
  const asked = questions.filter((x) => x.tournament);
  assert.ok(asked.length >= 30, `${asked.length} tournament questions`);
  assert.deepEqual([...new Set(asked.map((x) => x.tournament))].sort(), ["cup", "league", "typed"]);
  for (const x of questions) assert.equal(x.id.startsWith("tournament-"), !!x.tournament, x.id);
  // The stand-in model: the reply the file has for the message, as the mock /v1/messages would give it.
  const model: Phrase = async (ask) => replies[ask.message.split("MESSAGE\n")[1].toLowerCase()] ?? null;
  let byModel = 0;
  let refused = 0;
  for (const x of asked) {
    const f = factsOf(TOURNAMENT_FIXTURES[x.tournament!]);
    const r = read(x.q, f);
    let body: Record<string, unknown>;
    if (r.goesOn) body = { router: 10, intent: "find_turf", reply: "", memo: {}, followups: [] };
    else {
      const said = r.kind === "other" ? await answerTournament(x.q, f, [], newUsage(), Date.now() + 10_000, model) : { reply: tournamentReply(r.kind, f, x.q), via: "keywords" as const };
      if (r.kind === "other") assert.ok(x.q.toLowerCase() in replies, `${x.id}: the stand-in model has no reply for it`);
      if (said.via === "claude") byModel++;
      if ("refused" in said && said.refused) refused++;
      body = { router: 10, intent: "tournament", reply: said.reply, source: said.via, via: "tournament", memo: { intent: "other", top: [] }, followups: tournamentFollowups(tournamentAskChips(f.has), x.q), tournament: { code: f.name, state: f.state, kind: r.kind } };
      // Whatever is shown passes the guard: the code-built sentences too.
      assert.deepEqual(tournamentReplyOk(said.reply, f, x.q), { ok: true }, `${x.id}: ${said.reply}`);
    }
    assert.deepEqual(gradeReply(x, body, null).fails, [], `${x.id}: ${String(body.reply)}`);
  }
  assert.equal(byModel, 3, "three honest model replies were shown");
  assert.equal(refused, 3, "three invented ones were replaced");
});
