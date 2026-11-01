import { derive, type BatterLine, type InningsView, type MatchView } from "../cricket/scoring";
import { formatRate } from "../cricket/overs";
import { clockMs, deriveBoard } from "../board/index";
import type { Board, BoardView } from "../board/types";
import { isLiveBoard, sanitizeLive } from "../live/match";
import { liveIdleClosed, type LiveStatus } from "../live/types";
import { PREDICT, normAsk, type LiveAskKind } from "./liveKind";

export { liveAskGate, liveAskKind, liveCodeOf, liveFollowups, type LiveAskKind } from "./liveKind";

/**
 * Ask TapTurf on a live score page (/live/<code>): the page sends its
 * code in Ask's context ({live: code}), and a signed-in player's question
 * about the match is answered from the match itself, as followers are
 * served it. Everything said is worked out here from the match JSON
 * (liveFacts): the teams, the score, overs, wickets, who is batting and
 * bowling, the run rates, the target and the rate needed, the result, the
 * last update and whether the link stopped. The usual questions
 * (lib/ask/liveKind.ts liveAskKind) get a sentence built here (liveReply);
 * any other one may go to the model, which only phrases these facts and
 * may use no number they don't have (numbersOk). A turf or game search
 * typed on the page goes on to the usual search.
 *
 * Asking on a live page needs an account (liveAskGate): visitors get no
 * free answers there, as they do elsewhere. Pure, relative imports only,
 * so the follower page, /api/ask and the unit tests (npm run test:ask)
 * share it. It carries both scoring engines: the chat itself imports only
 * lib/ask/liveKind.ts.
 */

/* ------------------------------------------------------------------ */
/* Facts                                                               */
/* ------------------------------------------------------------------ */

/**
 * Where the link stands. closed: live, but no update for 2 hours
 * (LIVE_IDLE_CLOSE_MS), so this is its last score. missing: not a code
 * of ours. unknown: the score could not be read just now.
 */
export type LiveAskState = "waiting" | "live" | "done" | "closed" | "stopped" | "expired" | "missing" | "unknown";

export type BatFact = { name: string; runs: number; balls: number; fours: number; sixes: number; sr: string | null; onStrike: boolean; atCrease: boolean; out: string | null };
export type InningsFact = { team: string; runs: number; wickets: number; score: string; overs: string; maxOvers: number; ballsLeft: number; crr: string | null; ended: boolean };

export type CricketFacts = {
  teamA: string;
  teamB: string;
  title: string;
  venue: string;
  overs: number;
  players: number;
  innings: InningsFact[];
  /** The innings being played, or the last one when it is over. */
  current: InningsFact;
  second: boolean;
  bowling: string;
  striker: BatFact | null;
  nonStriker: BatFact | null;
  bowler: { name: string; figures: string; overs: string; econ: string | null } | null;
  chase: { target: number; runsNeeded: number; ballsLeft: number; rrr: string | null } | null;
  /** Between the innings: the second is set up, nobody picked, no ball bowled. */
  inningsBreak: boolean;
  result: string | null;
  lastWicket: string | null;
  partnership: string | null;
  thisOver: { number: number; balls: string[]; runs: number; complete: boolean } | null;
  topScorer: string | null;
  bestBowler: string | null;
  batters: BatFact[];
  bowlers: { name: string; figures: string; overs: string }[];
  freeHit: boolean;
};

export type BoardFacts = {
  sport: string;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  /** "Goals", "Points", "Sets", "Games". */
  unit: string;
  /** The score inside the game or set in play ("40", "AD"), with its label ("Set 3"). */
  current: { a: string; b: string; label: string | null } | null;
  period: string | null;
  /** The clock as people read it, as of now ("34:12", "20:00 +1:05"); null with no clock. */
  clock: string | null;
  clockRunning: boolean;
  sets: string[];
  result: string | null;
  headline: string;
  notices: string[];
  recent: string[];
};

export type LiveFacts = {
  state: LiveAskState;
  kind: "cricket" | "board" | null;
  /** "Kothrud Kings vs Baner Blasters", or null with no match. */
  teams: string | null;
  /** The last update in India's time: "7:41 pm", "7:41 pm on 31 Oct". null while waiting. */
  updated: string | null;
  /** Minutes since the last update, by the server's clock. */
  ageMin: number | null;
  cricket: CricketFacts | null;
  board: BoardFacts | null;
  /** Every fact as a short line, numbers as the page shows them: all the model may use. */
  lines: string[];
};

const IST_MS = 330 * 60_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "7:41 pm" in India, with " on 31 Oct" when it is not today there. */
export function istTime(at: number, now: number): string {
  const d = new Date(at + IST_MS);
  const h = d.getUTCHours();
  const time = `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  const today = new Date(now + IST_MS).toISOString().slice(0, 10) === d.toISOString().slice(0, 10);
  return today ? time : `${time} on ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const rate = (r: number | null) => (r == null ? null : formatRate(r));

function batFact(b: BatterLine): BatFact {
  return {
    name: b.name,
    runs: b.runs,
    balls: b.balls,
    fours: b.fours,
    sixes: b.sixes,
    sr: b.sr == null ? null : b.sr.toFixed(2),
    onStrike: b.onStrike,
    atCrease: b.status === "batting",
    out: b.status === "out" ? b.howOut : null,
  };
}

function inningsFact(i: InningsView): InningsFact {
  return { team: i.battingName, runs: i.runs, wickets: i.wickets, score: i.score, overs: i.overs, maxOvers: i.maxBalls / 6, ballsLeft: i.ballsLeft, crr: i.legalBalls > 0 ? rate(i.crr) : null, ended: i.ended !== null };
}

/** A ball chip as words: "." is a dot ball. */
const chipWord = (c: string) => (c === "." ? "dot" : c);

function cricketFacts(v: MatchView): CricketFacts {
  const cur = v.current;
  const innings = v.innings.map(inningsFact);
  const over = cur.thisOver;
  return {
    teamA: v.setup.teamA,
    teamB: v.setup.teamB,
    title: v.setup.title,
    venue: v.setup.venue,
    overs: v.setup.overs,
    players: v.setup.playersPerSide,
    innings,
    current: innings[innings.length - 1],
    second: cur.index === 1,
    bowling: cur.bowlingName,
    striker: v.status === "live" && cur.striker ? batFact(cur.striker) : null,
    nonStriker: v.status === "live" && cur.nonStriker ? batFact(cur.nonStriker) : null,
    bowler: v.status === "live" && cur.bowler ? { name: cur.bowler.name, figures: cur.bowler.figures, overs: cur.bowler.overs, econ: rate(cur.bowler.econ) } : null,
    chase: v.chase ? { target: v.chase.target, runsNeeded: v.chase.runsNeeded, ballsLeft: v.chase.ballsLeft, rrr: rate(v.chase.rrr) } : null,
    inningsBreak: v.inningsBreak,
    result: v.result?.text ?? null,
    lastWicket: cur.lastWicket,
    partnership: cur.partnership && cur.partnership.balls + cur.partnership.runs > 0 ? cur.partnership.text : null,
    thisOver: over && over.balls.length ? { number: over.number, balls: over.balls.map((b) => chipWord(b.chip)), runs: over.runs, complete: over.complete } : null,
    topScorer: v.awards.topScorer?.text ?? null,
    bestBowler: v.awards.bestBowler?.text ?? null,
    batters: cur.batters.map(batFact),
    bowlers: cur.bowlers.map((b) => ({ name: b.name, figures: b.figures, overs: b.overs })),
    freeHit: v.status === "live" && v.freeHit,
  };
}

/** 7:05 from ms, as the board's clock shows it (components/board/BoardClock.tsx). */
function mmss(ms: number, up: boolean): string {
  const t = Math.max(0, up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** The board's clock as people read it at the scorer's now, as the follower page shows it; null with no clock. */
function boardClock(v: BoardView, scorerNow: number | null): string | null {
  const c = v.clock;
  if (!c) return null;
  const shown = (scorerNow === null ? null : clockMs(v, scorerNow)) ?? c.ms;
  if (c.down) return mmss(shown, false);
  if (c.limitMs !== null && shown > c.limitMs) return `${mmss(c.baseMs + c.limitMs, true)} +${mmss(shown - c.limitMs, true)}`;
  return mmss(c.baseMs + shown, true);
}

function boardFacts(b: Board, v: BoardView, updatedAt: number | null, now: number): BoardFacts {
  // The scorer's clock now: when this copy was sent plus how long the server has had it (follow.ts boardNow).
  const anchor = b.sentAt ?? v.lastAt;
  const scorerNow = anchor == null || updatedAt === null ? null : anchor + Math.max(0, now - updatedAt);
  const done = v.status === "done";
  return {
    sport: v.sportName,
    teamA: v.teams.a.name,
    teamB: v.teams.b.name,
    scoreA: v.teams.a.score,
    scoreB: v.teams.b.score,
    unit: v.scoreUnit,
    current: v.current && !done ? { a: v.current.a, b: v.current.b, label: v.currentLabel } : null,
    period: v.period?.label ?? null,
    clock: done ? null : boardClock(v, scorerNow),
    clockRunning: !done && !!v.clock?.running,
    sets: v.sets.filter((s) => s.winner !== null).map((s) => `${s.a}-${s.b}`),
    result: v.result?.text ?? null,
    headline: v.headline,
    notices: v.notices.slice(0, 3),
    recent: v.timeline.slice(-3).map((l) => [l.when, l.text, l.score ? `(${l.score})` : null].filter(Boolean).join(" ")),
  };
}

/**
 * The facts about a link as followers would see it now: its status, its
 * match as stored (sanitised again here) and the time of its last update,
 * from GET /api/live/<code>'s read. status null: the read failed.
 */
export function liveFacts(input: { status: LiveStatus | "waiting" | "missing" | null; match: unknown; updatedAt: string | null }, now: number): LiveFacts {
  const at = input.updatedAt ? Date.parse(input.updatedAt) : NaN;
  const updatedAt = Number.isFinite(at) ? at : null;
  const base = { updated: updatedAt === null ? null : istTime(updatedAt, now), ageMin: updatedAt === null ? null : Math.max(0, Math.floor((now - updatedAt) / 60_000)), cricket: null, board: null };
  const empty = (state: LiveAskState): LiveFacts => ({ state, kind: null, teams: null, ...base, lines: [`Status: ${STATE_LINE[state]}`] });
  if (input.status === null) return empty("unknown");
  if (input.status === "missing" || input.status === "waiting" || input.status === "stopped" || input.status === "expired") return empty(input.status);
  const match = input.match == null ? null : sanitizeLive(input.match);
  if (!match) return empty("unknown");
  const state: LiveAskState = input.status === "live" && liveIdleClosed(input.status, updatedAt, now) ? "closed" : input.status;
  if (isLiveBoard(match)) {
    const board = boardFacts(match, deriveBoard(match), updatedAt, now);
    const f: LiveFacts = { state, kind: "board", teams: `${board.teamA} vs ${board.teamB}`, ...base, board, lines: [] };
    return { ...f, lines: factLines(f) };
  }
  const cricket = cricketFacts(derive(match));
  const f: LiveFacts = { state, kind: "cricket", teams: `${cricket.teamA} vs ${cricket.teamB}`, ...base, cricket, lines: [] };
  return { ...f, lines: factLines(f) };
}

const STATE_LINE: Record<LiveAskState, string> = {
  waiting: "waiting for the scorer's first update; no score yet.",
  live: "live, updating as the scorer scores.",
  done: "finished.",
  closed: "this live link stopped updating after 2 hours without a new score; this is its last score.",
  stopped: "the scorer turned this live link off; there is no score to show.",
  expired: "this live link has expired (a live score is cleared 30 days after its last update).",
  missing: "no live score was found for this link.",
  unknown: "the score could not be read just now.",
};

function batText(b: BatFact): string {
  const bits = [`${b.runs} off ${plural(b.balls, "ball")}`, b.fours ? plural(b.fours, "four") : null, b.sixes ? plural(b.sixes, "six", "sixes") : null, b.sr ? `strike rate ${b.sr}` : null];
  return `${b.name} ${bits.filter(Boolean).join(", ")}${b.out ? `, out ${b.out}` : b.onStrike ? ", on strike" : ""}`;
}

/** The facts as lines for the model, in the page's own words and numbers. */
export function factLines(f: LiveFacts): string[] {
  const out = [`Status: ${STATE_LINE[f.state]}`];
  if (f.updated) out.push(`Last update: ${f.updated}, ${f.ageMin === 0 ? "under a minute" : plural(f.ageMin ?? 0, "minute")} ago.`);
  const c = f.cricket;
  if (c) {
    out.push(`Match: ${c.teamA} vs ${c.teamB}, cricket, ${plural(c.overs, "over")} a side, ${c.players} players a side.`);
    if (c.title) out.push(`Title: ${c.title}.`);
    if (c.venue) out.push(`Venue: ${c.venue}.`);
    c.innings.forEach((i, n) =>
      out.push(`${n === 0 ? "1st" : "2nd"} innings: ${i.team} ${i.score} after ${i.overs} of ${i.maxOvers} overs${i.crr ? `, run rate ${i.crr}` : ""}${i.ended ? ", innings over" : ""}.`),
    );
    if (c.inningsBreak) out.push(`Innings break: ${c.current.team} need ${c.chase?.target ?? c.innings[0].runs + 1} to win.`);
    if (c.chase) out.push(`Chase: target ${c.chase.target}; ${c.current.team} need ${plural(c.chase.runsNeeded, "run")} off ${plural(c.chase.ballsLeft, "ball")}${c.chase.rrr ? `, required rate ${c.chase.rrr}` : ""}.`);
    if (c.result) out.push(`Result: ${c.result}.`);
    if (c.striker || c.nonStriker) out.push(`At the crease: ${[c.striker, c.nonStriker].filter((b): b is BatFact => !!b).map(batText).join("; ")}.`);
    if (c.bowler) out.push(`Bowling now: ${c.bowler.name}, ${c.bowler.figures} in ${c.bowler.overs} overs${c.bowler.econ ? `, economy ${c.bowler.econ}` : ""}.`);
    if (c.freeHit) out.push("The next ball is a free hit.");
    if (c.thisOver) out.push(`Over ${c.thisOver.number}${c.thisOver.complete ? "" : " so far"}: ${c.thisOver.balls.join(", ")} (${plural(c.thisOver.runs, "run")}).`);
    if (c.partnership) out.push(`Partnership: ${c.partnership}.`);
    if (c.lastWicket) out.push(`Last wicket: ${c.lastWicket}.`);
    // At the crease is said above, while the match is on.
    const batted = c.batters.filter((b) => !(b.atCrease && (c.striker || c.nonStriker)) && (b.balls > 0 || b.out));
    if (batted.length) out.push(`Also batted in this innings: ${batted.slice(0, 9).map(batText).join("; ")}.`);
    if (c.bowlers.length) out.push(`Bowlers in this innings: ${c.bowlers.slice(0, 8).map((b) => `${b.name} ${b.figures} in ${b.overs}`).join("; ")}.`);
    if (c.topScorer) out.push(`Top scorer: ${c.topScorer}.`);
    if (c.bestBowler) out.push(`Best bowling: ${c.bestBowler}.`);
  }
  const b = f.board;
  if (b) {
    out.push(`Match: ${b.teamA} vs ${b.teamB}, ${b.sport}.`);
    out.push(`Score (${b.unit.toLowerCase()}): ${b.teamA} ${b.scoreA}, ${b.teamB} ${b.scoreB}. ${b.headline}.`);
    if (b.current) out.push(`${b.current.label ?? "Current game"}: ${b.teamA} ${b.current.a}, ${b.teamB} ${b.current.b}.`);
    if (b.sets.length) out.push(`Finished ${b.unit === "Sets" ? "sets" : "games"}: ${b.sets.join(", ")}.`);
    if (b.period) out.push(`Period: ${b.period}.`);
    if (b.clock) out.push(`Clock: ${b.clock}${b.clockRunning ? ", running" : ", stopped"}.`);
    if (b.notices.length) out.push(`Notices: ${b.notices.join("; ")}.`);
    if (b.recent.length) out.push(`Latest: ${b.recent.join("; ")}.`);
    if (b.result) out.push(`Result: ${b.result}.`);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Answers                                                             */
/* ------------------------------------------------------------------ */

const NO_SCORE: Partial<Record<LiveAskState, string>> = {
  waiting: "The scorer hasn't sent the first score yet. It shows on this page as soon as it comes in, no need to refresh.",
  stopped: "The scorer turned this live link off, so there's no score to read here now. If the match is still on, ask the scorer for a new link.",
  expired: "This live link has expired: a live score is cleared 30 days after its last update.",
  missing: "I can't find a live score for this link. Check the link with whoever sent it.",
  unknown: "I can't read this match's score right now. The page keeps trying by itself, so ask me again in a moment.",
};

const crrText = (i: InningsFact) => (i.crr ? `, run rate ${i.crr}` : "");
const overText = (i: InningsFact) => `${i.overs} of ${plural(i.maxOvers, "over")}`;

function cricketScore(c: CricketFacts): string {
  const [first, second] = c.innings;
  if (c.result) return `${c.result}. ${first.team} made ${first.score} in ${first.overs} overs${second ? `, ${second.team} made ${second.score} in ${second.overs} overs` : ""}.`;
  if (c.inningsBreak) return `It's the innings break. ${first.team} made ${first.score} in ${first.overs} overs, so ${c.current.team} need ${c.chase?.target ?? first.runs + 1} to win.`;
  if (c.chase) return `${c.current.team} are ${c.current.score} after ${overText(c.current)}, chasing ${c.chase.target}. They need ${plural(c.chase.runsNeeded, "run")} off ${plural(c.chase.ballsLeft, "ball")}.`;
  if (c.current.overs === "0.0" && c.current.runs === 0) return `${c.current.team} are batting first. No balls bowled yet.`;
  return `${c.current.team} are ${c.current.score} after ${overText(c.current)}${crrText(c.current)}.`;
}

function cricketReply(kind: LiveAskKind, c: CricketFacts, f: LiveFacts, q: string): string {
  const cur = c.current;
  const over = !!c.result;
  switch (kind) {
    case "need":
      if (over) return cricketScore(c);
      if (c.inningsBreak) return `${cur.team} need ${c.chase?.target ?? c.innings[0].runs + 1} to win off ${plural(cur.maxOvers, "over")}. The chase hasn't started yet.`;
      if (c.chase) return `${cur.team} need ${plural(c.chase.runsNeeded, "run")} off ${plural(c.chase.ballsLeft, "ball")} to win${c.chase.rrr ? `, a required rate of ${c.chase.rrr} an over` : ""}. The target is ${c.chase.target}.`;
      return `There's no target yet: ${cur.team} are batting first, ${cur.score} after ${overText(cur)}. The chase starts after this innings.`;
    case "rate":
      if (!cur.crr) return over ? cricketScore(c) : `No balls bowled to ${cur.team} yet, so there's no run rate.`;
      return `${cur.team} are scoring at ${cur.crr} an over (${cur.score} after ${cur.overs} overs).${c.chase?.rrr && !over ? ` They need ${c.chase.rrr} an over from here.` : ""}`;
    case "partnership":
      if (over) return cricketScore(c);
      return c.partnership ? `The current partnership: ${c.partnership}.` : `No partnership for ${cur.team} yet.`;
    case "over":
      if (!c.thisOver) return over ? cricketScore(c) : `No balls bowled to ${cur.team} yet.`;
      return `Over ${c.thisOver.number}${c.thisOver.complete ? "" : " so far"}: ${c.thisOver.balls.join(", ")}, ${plural(c.thisOver.runs, "run")}. ${cricketScore(c)}`;
    case "batting": {
      if (over) return `The match is over: ${c.result}.${c.topScorer ? ` Top scorer: ${c.topScorer}.` : ""}`;
      const at = [c.striker, c.nonStriker].filter((b): b is BatFact => !!b);
      // Before the first ball the score has nothing to add.
      if (!at.length) return `${cur.team} are batting; the scorer hasn't picked the batters yet.${cur.crr ? ` ${cricketScore(c)}` : ""}`;
      const lines = at.map((b) => `${b.name} has ${b.runs} off ${plural(b.balls, "ball")}${b.onStrike ? " and is on strike" : ""}`);
      return `${cur.team} are batting, ${cur.score} after ${cur.overs} overs. ${lines.join("; ")}.`;
    }
    case "bowling":
      if (over) return `The match is over: ${c.result}.${c.bestBowler ? ` Best bowling: ${c.bestBowler}.` : ""}`;
      if (!c.bowler) return `${c.bowling} are bowling; the scorer hasn't picked the bowler for this over yet.`;
      return `${c.bowler.name} is bowling for ${c.bowling}, ${c.bowler.figures} in ${c.bowler.overs} overs.${c.bestBowler && !c.bestBowler.startsWith(`${c.bowler.name} `) ? ` Best bowling so far: ${c.bestBowler}.` : ""}`;
    case "wickets":
      if (over) return cricketScore(c);
      if (cur.wickets === 0) return `${cur.team} haven't lost a wicket yet: ${cur.score} after ${cur.overs} overs.`;
      return `${cur.team} have lost ${plural(cur.wickets, "wicket")}, ${cur.score} after ${cur.overs} overs.${c.lastWicket ? ` Last out: ${c.lastWicket}.` : ""}`;
    case "result": {
      if (over) return cricketScore(c);
      const now = c.chase ? `${cur.team} need ${plural(c.chase.runsNeeded, "run")} off ${plural(c.chase.ballsLeft, "ball")}.` : `${cur.team} are batting first, ${cur.score} after ${overText(cur)}.`;
      return `${PREDICT.test(normAsk(q)) ? "I can't say who will win, only how it stands." : "No result yet."} ${now}`;
    }
    case "overs":
    case "time":
      if (over) return cricketScore(c);
      return `${cur.overs} of ${plural(cur.maxOvers, "over")} bowled to ${cur.team}, ${plural(cur.ballsLeft, "ball")} left.${c.chase ? ` They need ${plural(c.chase.runsNeeded, "run")}.` : ""}`;
    case "updated":
      return updatedReply(f, cricketScore(c));
    case "teams":
      return teamsReply(`${c.teamA} vs ${c.teamB}`, c.title, c.venue, `${plural(c.overs, "over")} a side`);
    case "summary": {
      if (over) return cricketScore(c);
      const at = c.striker ? ` ${c.striker.name} is on strike with ${c.striker.runs} off ${plural(c.striker.balls, "ball")}.` : "";
      const bowl = c.bowler ? ` ${c.bowler.name} is bowling, ${c.bowler.figures}.` : "";
      return `${c.second ? `${c.innings[0].team} made ${c.innings[0].score}. ` : ""}${cricketScore(c)}${at}${bowl}`;
    }
    case "score":
    default:
      return cricketScore(c);
  }
}

function boardScore(b: BoardFacts): string {
  if (b.result) return `${b.result}. ${b.headline}.`;
  const cur = b.current ? ` ${b.current.label ?? "This game"}: ${b.teamA} ${b.current.a}, ${b.teamB} ${b.current.b}.` : "";
  return `${b.headline}.${cur}`;
}

function boardReply(kind: LiveAskKind, b: BoardFacts, f: LiveFacts, q: string): string {
  switch (kind) {
    case "result": {
      if (b.result) return boardScore(b);
      const lead =
        b.scoreA === b.scoreB ? `Level at ${b.scoreA}-${b.scoreB}` : b.scoreA > b.scoreB ? `${b.teamA} lead ${b.scoreA}-${b.scoreB}` : `${b.teamB} lead ${b.scoreB}-${b.scoreA}`;
      const unit = b.unit === "Sets" || b.unit === "Games" ? ` on ${b.unit.toLowerCase()}` : "";
      const cur = b.current ? ` ${b.current.label ?? "This game"}: ${b.current.a}-${b.current.b}.` : "";
      return `${PREDICT.test(normAsk(q)) ? "I can't say who will win, only how it stands." : "No result yet."} ${lead}${unit}${b.period ? `, ${b.period}` : ""}.${cur}`;
    }
    case "time":
      if (b.result) return boardScore(b);
      if (!b.clock) return `${b.sport} here is played without a clock. ${boardScore(b)}`;
      return `${b.period ? `${b.period}, ` : ""}${b.clock} on the clock${b.clockRunning ? "" : ", stopped"}. ${boardScore(b)}`;
    case "updated":
      return updatedReply(f, boardScore(b));
    case "teams":
      return teamsReply(`${b.teamA} vs ${b.teamB}`, "", "", b.sport.toLowerCase());
    case "need":
    case "rate":
    case "partnership":
    case "over":
    case "batting":
    case "bowling":
    case "wickets":
    case "overs":
      // Cricket words on another sport's board: say what it is, and the score.
      return `This is a ${b.sport.toLowerCase()} match, not cricket. ${boardScore(b)}`;
    case "summary":
      return `${boardScore(b)}${b.recent.length ? ` Latest: ${b.recent[b.recent.length - 1]}.` : ""}`;
    case "score":
    default:
      return boardScore(b);
  }
}

function updatedReply(f: LiveFacts, score: string): string {
  if (!f.updated) return score;
  if (f.state === "done") return `The match is over. The last update came in at ${f.updated}. ${score}`;
  if (f.state === "closed") return score;
  const ago = f.ageMin === 0 ? "under a minute ago" : `${plural(f.ageMin ?? 0, "minute")} ago`;
  return `The last update came in at ${f.updated}, ${ago}, and this page updates by itself. ${score}`;
}

function teamsReply(teams: string, title: string, venue: string, format: string): string {
  return `${teams}, ${format}${title ? `, ${title}` : ""}${venue ? `, at ${venue}` : ""}.`;
}

/** The answer to one of the usual questions, from the facts alone. */
export function liveReply(kind: LiveAskKind, f: LiveFacts, q = ""): string {
  const none = NO_SCORE[f.state];
  if (none || (!f.cricket && !f.board)) return none ?? NO_SCORE.unknown!;
  const said = f.cricket ? cricketReply(kind, f.cricket, f, q) : boardReply(kind, f.board!, f, q);
  // A link closed for want of updates: say this is its last score first.
  return f.state === "closed" ? `This live link stopped updating at ${f.updated}, after 2 hours without a new score, so this is the last score it had. ${said}` : said;
}

/** Without the model, or when its answer can't be used: where the match stands, and what can be asked. */
export function liveFallback(f: LiveFacts): string {
  const said = liveReply("summary", f);
  if (NO_SCORE[f.state] || (!f.cricket && !f.board)) return said;
  return `${said} Ask me the score, ${f.board ? "who's ahead or how long is left" : "who's batting or bowling, or how many are needed"}.`;
}

/** Every run of digits in a text: a reply may use only numbers the facts have. */
export function numbersFrom(text: string): string[] {
  return text.match(/\d+/g) ?? [];
}

/** True when every number in the reply is one the facts have. */
export function numbersOk(reply: string, f: LiveFacts): boolean {
  const have = new Set(numbersFrom(f.lines.join("\n")));
  return numbersFrom(reply).every((n) => have.has(n) || have.has(String(Number(n))));
}

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

/**
 * What to ask on this page, for the match as it stands: the chat opens
 * with these and offers them after each answer. Never a turf or a booking.
 */
export function liveAskChips(raw: unknown): string[] {
  const match = raw == null ? null : sanitizeLive(raw);
  if (!match) return ["What's the score?", "Who's playing?"];
  if (isLiveBoard(match)) {
    const v = deriveBoard(match);
    if (v.status === "done") return ["Who won?", "What was the score?", "Who's playing?"];
    return ["What's the score?", "Who's winning?", ...(v.clock ? ["How long is left?"] : []), "Who's playing?"];
  }
  const v = derive(match);
  if (v.status === "done") return ["Who won?", "Who was top scorer?", "Best bowling?"];
  if (v.chase || v.inningsBreak) return ["What's the score?", "How many needed?", "Who's batting?", "Required run rate?"];
  return ["What's the score?", "Who's batting?", "Who's bowling?", "What's the run rate?"];
}
