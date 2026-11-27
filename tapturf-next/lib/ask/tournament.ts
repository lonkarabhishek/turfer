import { derive, type InningsView, type MatchView, type OverView } from "../cricket/scoring";
import { formatNrr, formatOvers, formatRate, runRate } from "../cricket/overs";
import { deriveBoard } from "../board/index";
import { isLiveBoard, sanitizeLive } from "../live/match";
import { dayLabel, fixtureTitle, rangeLabel, timeLabel } from "../tournament/format";
import { flipped } from "../tournament/live";
import { formatLabel, placeLabel, resolve, type Resolved } from "../tournament/standings";
import type { Format, Points, Stage, Tournament, TournamentGetResponse } from "../tournament/types";
import { PREDICT, normAsk, type LiveOwnNames } from "./liveKind";
import { tournamentHasOf } from "./tournamentHas";
import { SQUAD, matchRefOf, tournamentAskKind, tournamentGoesOn, type MatchRef, type TournamentAskKind, type TournamentHas } from "./tournamentKind";

export {
  matchRefOf,
  tournamentAskChips,
  tournamentAskGate,
  tournamentAskKind,
  tournamentCodeOf,
  tournamentFollowups,
  tournamentGoesOn,
  type MatchRef,
  type TournamentAskKind,
  type TournamentHas,
} from "./tournamentKind";
export { tournamentHasOf } from "./tournamentHas";

/**
 * Ask TapTurf on a tournament's page (/tournament/<code>): the page sends
 * its code in Ask's context ({tournament: code}) and a signed-in player's
 * question is answered from the tournament itself, as followers are served
 * it. This is the live score page's Ask (lib/ask/live.ts) one level up.
 *
 * Everything said is worked out here (tournamentFacts) from two things the
 * page already shows: the tournament (lib/tournament: the view, resolve()'s
 * table, fixtures, results, playoffs and champion, in the page's own
 * words) and, for each fixture scored ball by ball, that match's scorecard
 * (matchCard, through the same derive() the live facts use). The usual
 * questions (lib/ask/tournamentKind.ts, then tournamentAnswerKind once the
 * tournament is known) get a sentence built here (tournamentReply), never a
 * model call. Any other question may go to the model, which only phrases
 * the facts' lines and whose reply is checked (tournamentReplyOk): no
 * number, name, result or forecast the facts don't have. A turf or game
 * search typed on the page goes on to the usual Ask.
 *
 * What each kind of result can answer:
 *  - scored live (a ball-by-ball scorecard): everything. The result, both
 *    innings, every batter and bowler, the key moments from the ball by
 *    ball list. Player numbers across the tournament come only from these.
 *  - typed in (the organiser entered it, or a turf session sent it): the
 *    two scores and the margin, so the table, the results, the highest
 *    team total and the biggest win. No players and no ball by ball, and
 *    the answers say so ("that match's result was typed in, so there is no
 *    scorecard to read").
 *  - scored live, then corrected by hand: the hand result is the result
 *    (as on the page); its scorecard still gives the players.
 *  - scored live, scorecard gone (the link was turned off, or cleared 30
 *    days after its last update): the kept result only, like a typed one.
 *  - another sport on the Live Scoreboard (a fixture whose live link holds
 *    a board): what the board holds, its score, sets and named scorers. No
 *    cricket numbers, and it counts for nothing in the table until a result
 *    is typed, exactly as the page has it.
 *
 * A player is one name on one team: spelled two ways in two matches, they
 * are two players here. The scorer's quick-mode placeholders ("Batter 1",
 * "Bowler 2") are nobody and are left out of every player number. "The
 * latest result" is the last finished match in the organiser's order.
 *
 * Pure, relative imports only, so /api/ask, the tournament page and the
 * unit tests (npm run test:ask) share it. It carries both scoring engines:
 * the chat and the tournament page import only lib/ask/tournamentKind.ts.
 */

/* ------------------------------------------------------------------ */
/* A match's scorecard, compact                                        */
/* ------------------------------------------------------------------ */

/** Bump when matchCard's shape or words change: cached cards (lib/ask/tournament.server.ts) are keyed by it. */
export const CARD_VERSION = 1;

export type CardBat = { name: string; runs: number; balls: number; fours: number; sixes: number; /** "b Vikas", "run out (Sameer)", "retired hurt"; null while in or not out. */ out: string | null; notOut: boolean };
export type CardBowl = { name: string; balls: number; overs: string; runs: number; wickets: number; maidens: number; figures: string };
export type CardInnings = {
  /** The match's own side (its team a or b), turned to the fixture's home and away when it is read. */
  side: "a" | "b";
  runs: number;
  wickets: number;
  balls: number;
  overs: string;
  score: string;
  batters: CardBat[];
  bowlers: CardBowl[];
  /** Wickets, milestones and the innings' end, in order, in the scorecard's own commentary lines ("1.3 OUT! Rahul b Vikas 0 (3)"). */
  moments: string[];
  /** Every four and six, in order, the same way ("0.4 Sameer to Amit, SIX"). */
  boundaries: string[];
  /** Boundaries past the ones listed. */
  moreBoundaries: number;
};
export type CricketCard = {
  kind: "cricket";
  state: "live" | "done";
  /** The two sides as the scorer named them. */
  a: string;
  b: string;
  innings: CardInnings[];
  result: string | null;
  headline: string;
  /** The over the chase turned on and the last over, worked out from the over by over list (closingLines). */
  closing: string[];
  /** The scorecard's own player of the match once it is over ("Amit, 15* (7) and 2/15"), with their side; null while it is on. */
  potm: { text: string; side: "a" | "b" } | null;
  players: { a: string[]; b: string[] };
};
export type BoardCard = {
  kind: "board";
  state: "live" | "done";
  sport: string;
  a: string;
  b: string;
  scoreA: number;
  scoreB: number;
  /** "Goals", "Points", "Sets", "Games". */
  unit: string;
  sets: string[];
  result: string | null;
  headline: string;
  players: { name: string; side: "a" | "b"; text: string }[];
};
export type MatchCard = CricketCard | BoardCard;

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
/** "Titans'", "Amit's". */
const poss = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const simple = (s: string) => normAsk(s).replace(/[^a-z0-9]+/g, " ").trim();
/** The scorer's quick-mode placeholders (components/tools/scorer/logic.ts placeholderOf): nobody's name. */
const PLACEHOLDER = /^(batter|bowler) \d+$/i;
const MAX_MOMENTS = 40;
const MAX_BOUNDARIES = 40;

function cardInnings(i: InningsView): CardInnings {
  const moments: string[] = [];
  const boundaries: string[] = [];
  for (const c of i.commentary) {
    if (c.kind === "over") continue;
    if (c.kind === "info" || c.wicket || / reaches \d+ off |HAT-TRICK/.test(c.text)) moments.push(c.line);
    else if (c.tone === "four" || c.tone === "six") boundaries.push(c.line);
  }
  return {
    side: i.batting,
    runs: i.runs,
    wickets: i.wickets,
    balls: i.legalBalls,
    overs: i.overs,
    score: i.score,
    batters: i.batters
      .filter((b) => b.balls > 0 || b.runs > 0 || b.status === "out" || b.status === "retiredHurt")
      .slice(0, 31)
      .map((b) => ({ name: b.name, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, out: b.status === "out" || b.status === "retiredHurt" ? b.howOut : null, notOut: b.status !== "out" })),
    bowlers: i.bowlers.slice(0, 31).map((b) => ({ name: b.name, balls: b.balls, overs: b.overs, runs: b.runs, wickets: b.wickets, maidens: b.maidens, figures: b.figures })),
    moments: moments.slice(0, MAX_MOMENTS),
    boundaries: boundaries.slice(0, MAX_BOUNDARIES),
    moreBoundaries: Math.max(0, boundaries.length - MAX_BOUNDARIES),
  };
}

const overBowler = (o: OverView) => (o.bowlerName ? `${o.bowlerName} bowling` : "bowler not named");

/**
 * Two lines worked out from a finished match's over by over list, each
 * saying how it was picked, so neither is a judgement:
 *  - "Turning over": in a chase that got home, the over of the chase with
 *    the most runs; in one that fell short, the over with the most wickets
 *    (then the fewest runs), or with no wicket the full over with the
 *    fewest runs. Only for a chase of two overs or more.
 *  - "Last over": the balls of the match's last over, as the scorecard
 *    chips them.
 */
function closingLines(v: MatchView): string[] {
  if (v.status !== "done") return [];
  const out: string[] = [];
  const chase = v.innings[1];
  const r = v.result;
  const overs = chase ? chase.byOver.filter((o) => o.balls.length > 0) : [];
  if (r && overs.length > 1 && (r.kind === "runs" || r.kind === "wickets")) {
    let pick = overs[0];
    let what: string;
    let why: string;
    if (r.kind === "wickets") {
      for (const o of overs) if (o.runs > pick.runs) pick = o;
      what = `${plural(pick.runs, "run")}${pick.wickets ? `, ${plural(pick.wickets, "wicket")}` : ""}`;
      why = "the most runs in an over of a chase that got home";
    } else if (overs.some((o) => o.wickets > 0)) {
      for (const o of overs) if (o.wickets > pick.wickets || (o.wickets === pick.wickets && o.runs < pick.runs)) pick = o;
      what = `${plural(pick.wickets, "wicket")} for ${plural(pick.runs, "run")}`;
      why = "the most wickets in an over of a chase that fell short";
    } else {
      const full = overs.filter((o) => o.complete);
      pick = (full.length ? full : overs)[0];
      for (const o of full) if (o.runs < pick.runs) pick = o;
      what = plural(pick.runs, "run");
      why = "the fewest runs in a full over of a chase that fell short";
    }
    out.push(`Turning over: over ${pick.number} of the chase (${overBowler(pick)}), ${what}: ${why}.`);
  }
  const lastInn = v.innings[v.innings.length - 1];
  const last = [...lastInn.byOver].reverse().find((o) => o.balls.length > 0);
  if (last)
    out.push(
      `Last over: over ${last.number} of the ${lastInn.battingName} innings (${overBowler(last)}): ${last.balls.map((b) => (b.chip === "." ? "dot" : b.chip)).join(", ")}: ${plural(last.runs, "run")}${last.wickets ? `, ${plural(last.wickets, "wicket")}` : ""}.`,
    );
  return out;
}

/**
 * A live link's match as stored, as this file reads it: the cricket
 * scorecard's innings, cards and key moments, or a board's score. null for
 * nothing readable. Small and JSON, so the server keeps it per scorecard
 * and last update instead of the match.
 */
export function matchCard(raw: unknown): MatchCard | null {
  const m = raw == null ? null : sanitizeLive(raw);
  if (!m) return null;
  if (isLiveBoard(m)) {
    const v = deriveBoard(m);
    return {
      kind: "board",
      state: v.status,
      sport: v.sportName,
      a: v.teams.a.name,
      b: v.teams.b.name,
      scoreA: v.teams.a.score,
      scoreB: v.teams.b.score,
      unit: v.scoreUnit,
      sets: v.sets.filter((s) => s.winner !== null).map((s) => `${s.a}-${s.b}`),
      result: v.result?.text ?? null,
      headline: v.headline,
      players: v.players.slice(0, 20).map((p) => ({ name: p.name, side: p.side, text: p.text })),
    };
  }
  const v = derive(m);
  const names = (side: "a" | "b") => v.teams[side].players.map((p) => p.name).filter((n) => !PLACEHOLDER.test(n.trim())).slice(0, 31);
  return {
    kind: "cricket",
    state: v.status,
    a: v.teams.a.name,
    b: v.teams.b.name,
    innings: v.innings.map(cardInnings),
    result: v.result?.text ?? null,
    headline: v.headline,
    closing: closingLines(v),
    potm: v.status === "done" && v.awards.potm && !PLACEHOLDER.test(v.awards.potm.name.trim()) ? { text: v.awards.potm.text, side: v.awards.potm.side } : null,
    players: { a: names("a"), b: names("b") },
  };
}

/* ------------------------------------------------------------------ */
/* Facts                                                               */
/* ------------------------------------------------------------------ */

/** on: read. removed: the organiser took it down. missing: not a code of ours, or no such tournament. unknown: it could not be read just now. */
export type TournamentAskState = "on" | "removed" | "missing" | "unknown";

export type TableFact = {
  pos: number;
  team: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  nr: number;
  points: number;
  /** "+1.200" */
  nrr: string;
  runsFor: number;
  oversFor: string;
  runsAgainst: number;
  oversAgainst: string;
  /** Runs an over, "8.50"; null before a counted match. */
  rateFor: string | null;
  rateAgainst: string | null;
};

export type SideScore = { score: string; overs: string; runs: number };

/**
 * How a finished match's result came to the page. typed: entered by hand
 * (or sent by a turf session). live: from its ball-by-ball scorecard.
 * corrected: scored live, then changed by hand.
 */
export type Entered = "typed" | "live" | "corrected";
/** read: its cricket scorecard is in the facts. board: a Live Scoreboard's score is. typed: none, the result was typed. gone: scored live but no longer kept. unread: past the cap of scorecards read for one tournament. */
export type CardNote = "read" | "board" | "typed" | "gone" | "unread";

export type MatchFact = {
  id: number;
  /** "Match 3", "Semi-final 1", "Final": the page's own name for it. */
  title: string;
  stage: Stage;
  home: string | null;
  away: string | null;
  /** "Titans v Kings", or the places still to be filled: "1st v 4th". */
  sides: string;
  /** "Sat 28 Nov, 7:30 pm", as the organiser set it; null when not set. */
  when: string | null;
  state: "scheduled" | "live" | "done";
  entered: Entered | null;
  /** "Titans won by 14 runs", in the page's words. */
  result: string | null;
  winner: string | null;
  loser: string | null;
  a: SideScore | null;
  b: SideScore | null;
  card: MatchCard | null;
  note: CardNote | null;
  /** The scorecard's team a is the fixture's away team. */
  flip: boolean;
  live: { headline: string; closed: boolean } | null;
  /** The match in one line, as the page shows it. */
  line: string;
};

export type BatGame = { match: string; against: string; runs: number; balls: number; fours: number; sixes: number; out: string | null; notOut: boolean };
export type BowlGame = { match: string; against: string; figures: string; overs: string; balls: number; runs: number; wickets: number };
export type BatAgg = { name: string; team: string; innings: number; runs: number; balls: number; fours: number; sixes: number; best: BatGame; games: BatGame[] };
export type BowlAgg = { name: string; team: string; innings: number; balls: number; runs: number; wickets: number; maidens: number; best: BowlGame; games: BowlGame[] };

/** The numbers people ask about, from the scorecards read (player numbers) and from every result (team totals, margins). */
export type TournamentStats = {
  /** Cricket scorecards the player numbers come from, a match on now among them. */
  matches: number;
  /** Most runs first, then fewer balls. */
  batters: BatAgg[];
  /** Most wickets first, then fewer runs. */
  bowlers: BowlAgg[];
  /** Every innings a batter played, highest first. */
  scores: (BatGame & { name: string; team: string })[];
  /** Every spell, best first: most wickets, then fewest runs. */
  spells: (BowlGame & { name: string; team: string })[];
  fours: number;
  sixes: number;
};

export type TeamTotal = { team: string; against: string; match: string; score: string; overs: string; runs: number };
export type Margin = { winner: string; loser: string; match: string; by: number };

export type TournamentFacts = {
  state: TournamentAskState;
  name: string | null;
  /** "League + semi-finals" */
  format: string | null;
  kind: Format | null;
  venue: string | null;
  /** "8 to 15 Nov" */
  dates: string | null;
  overs: number | null;
  points: Points | null;
  teams: string[];
  table: TableFact[];
  /** A two-team series: "Titans 2 - 1 Strikers" and who leads. */
  series: { line: string; leader: string | null } | null;
  /** The winner's name, "shared", or null while undecided. */
  champion: string | null;
  /** Places that go through to the playoffs (0: none). */
  qualify: number;
  leagueDone: boolean;
  /** In the organiser's order. */
  matches: MatchFact[];
  played: number;
  total: number;
  /** null with no cricket scorecard read. */
  stats: TournamentStats | null;
  /** From every finished match with scores, typed or scored live: highest first. */
  totals: TeamTotal[];
  byRuns: Margin | null;
  byWickets: Margin | null;
  /** Players seen in the scorecards, per team. */
  squads: Record<string, string[]>;
  has: TournamentHas;
  /** The digest: every fact as a short line, all the model may use. */
  lines: string[];
  /** What the digest left out to fit, oldest first; empty when everything fits. */
  left: string[];
};

const EMPTY_HAS: TournamentHas = { series: false, played: 0, total: 0, live: 0, scored: 0, champion: false };

const STATE_LINE: Record<TournamentAskState, string> = {
  on: "on.",
  removed: "the organiser took this tournament down; there is nothing to read.",
  missing: "no tournament was found for this link.",
  unknown: "the tournament could not be read just now.",
};

function empty(state: TournamentAskState, name: string | null = null): TournamentFacts {
  return {
    state,
    name,
    format: null,
    kind: null,
    venue: null,
    dates: null,
    overs: null,
    points: null,
    teams: [],
    table: [],
    series: null,
    champion: null,
    qualify: 0,
    leagueDone: false,
    matches: [],
    played: 0,
    total: 0,
    stats: null,
    totals: [],
    byRuns: null,
    byWickets: null,
    squads: {},
    has: EMPTY_HAS,
    lines: [`Status: ${STATE_LINE[state]}`],
    left: [],
  };
}

/** A finished scorecard to read for a tournament's facts: the fixture, its live link, and what its card is kept under (its kept result: a finished match's does not change). */
export type CardWanted = { id: number; code: string; stamp: string };

/**
 * The scorecards a tournament's facts are read from, each oldest first in
 * the organiser's order.
 *  - kept: fixtures whose scorecard finished (the fixture keeps its
 *    result, liveResult), a hand correction over it or not. Their cards
 *    never change, so the server keeps each one and reads it once.
 *  - inPlay: fixtures linked to a scorecard with no result at all yet:
 *    being scored, waiting for a first ball, turned off, or a Live
 *    Scoreboard. Read each time, from the copy followers share.
 * A result typed over a scorecard that never finished is a typed result:
 * nothing is read for it.
 */
export function scorecardsOf(t: Pick<Tournament, "fixtures">): { kept: CardWanted[]; inPlay: { id: number; code: string }[] } {
  const kept: CardWanted[] = [];
  const inPlay: { id: number; code: string }[] = [];
  for (const f of [...t.fixtures].sort((a, b) => a.seq - b.seq || a.id - b.id)) {
    if (!f.live) continue;
    if (f.liveResult) kept.push({ id: f.id, code: f.live, stamp: JSON.stringify(f.liveResult) });
    else if (!f.result) inPlay.push({ id: f.id, code: f.live });
  }
  return { kept, inPlay };
}

const sideText = (name: string, s: SideScore | null) => (s ? `${name} ${s.score} (${s.overs})` : `${name} yet to bat`);

function matchFact(r: Resolved, title: string, card: MatchCard | null, unread: boolean): MatchFact {
  const f = r.fixture;
  const when = [f.day ? dayLabel(f.day) : null, f.time ? timeLabel(f.time) : null].filter(Boolean).join(", ") || null;
  const sides = `${r.homeLabel} v ${r.awayLabel}`;
  const score = (side: "a" | "b"): SideScore | null => {
    if (r.state === "live") {
      const s = r.live?.[side];
      return s ? { ...s, runs: Number(s.score.split("/")[0]) || 0 } : null;
    }
    if (r.state !== "done" || !r.match || r.outcome === "nr") return null;
    const inn = r.match[side];
    return { score: `${inn.runs}/${inn.wickets}`, overs: formatOvers(inn.balls), runs: inn.runs };
  };
  const a = score("a");
  const b = score("b");
  const entered: Entered | null = r.state !== "done" ? null : r.source === "manual" ? (f.liveResult ? "corrected" : "typed") : "live";
  // A cricket scorecard is read only where the page itself shows that match live or finished; a board stands beside whatever the page says.
  const use = card && (card.kind === "board" || r.state !== "scheduled") ? card : null;
  const note: CardNote | null = use ? (use.kind === "board" ? "board" : "read") : r.state !== "done" ? null : entered === "typed" ? "typed" : unread ? "unread" : "gone";
  const flip = !!use && !!r.homeName && !!r.awayName && flipped({ a: { name: use.a }, b: { name: use.b } }, r.homeName, r.awayName);
  const won = r.outcome === "a" || r.outcome === "b";
  const board = use?.kind === "board" ? ` On the Live Scoreboard (${use.sport.toLowerCase()}): ${use.result ? `${use.result}. ` : ""}${use.headline}.` : "";
  const home = r.homeName ?? r.homeLabel;
  const away = r.awayName ?? r.awayLabel;
  let line: string;
  if (r.state === "done") line = `${title}: ${a && b ? `${sideText(home, a)} v ${sideText(away, b)}` : sides}. ${r.text ?? "Finished"}.${board}`;
  else if (r.state === "live") line = `${title}, on now: ${sideText(home, a)}, ${sideText(away, b)}.${a && b && r.live?.headline ? ` ${r.live.headline}.` : ""}${r.live?.closed ? " Its live score stopped updating." : ""}`;
  else line = `${title}, not played yet: ${sides}${when ? `, ${when}` : ", no day set"}.${board}`;
  return {
    id: f.id,
    title,
    stage: f.stage,
    home: r.homeName,
    away: r.awayName,
    sides,
    when,
    state: r.state,
    entered,
    result: r.state === "done" ? r.text : null,
    winner: r.state === "done" && won ? (r.outcome === "a" ? r.homeName : r.awayName) : null,
    loser: r.state === "done" && won ? (r.outcome === "a" ? r.awayName : r.homeName) : null,
    a,
    b,
    card: use,
    note,
    flip,
    live: r.state === "live" ? { headline: r.live?.headline ?? "", closed: !!r.live?.closed } : null,
    line,
  };
}

/** Which of the fixture's teams a scorecard side is. */
const teamOfSide = (m: MatchFact, side: "a" | "b"): { team: string; against: string } => {
  const home = m.home ?? "";
  const away = m.away ?? "";
  return (side === "a") !== m.flip ? { team: home, against: away } : { team: away, against: home };
};

const batGame = (b: CardBat, match: string, against: string): BatGame => ({ match, against, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, out: b.out, notOut: b.notOut });

function statsOf(matches: MatchFact[]): { stats: TournamentStats | null; squads: Record<string, string[]> } {
  const bats = new Map<string, BatAgg>();
  const bowls = new Map<string, BowlAgg>();
  const squads: Record<string, string[]> = {};
  let read = 0;
  let fours = 0;
  let sixes = 0;
  const seen = (team: string, name: string) => {
    if (!team || PLACEHOLDER.test(name.trim())) return;
    const list = (squads[team] ??= []);
    if (!list.some((n) => simple(n) === simple(name)) && list.length < 40) list.push(name);
  };
  for (const m of matches) {
    const card = m.card;
    if (!card || card.kind !== "cricket" || !m.home || !m.away) continue;
    read++;
    for (const side of ["a", "b"] as const) for (const p of card.players[side]) seen(teamOfSide(m, side).team, p);
    for (const inn of card.innings) {
      const { team, against } = teamOfSide(m, inn.side);
      for (const b of inn.batters) {
        fours += b.fours;
        sixes += b.sixes;
        if (PLACEHOLDER.test(b.name.trim())) continue;
        seen(team, b.name);
        const g = batGame(b, m.title, against);
        const k = `${team}|${simple(b.name)}`;
        const x = bats.get(k);
        if (!x) bats.set(k, { name: b.name, team, innings: 1, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, best: g, games: [g] });
        else {
          x.innings++;
          x.runs += b.runs;
          x.balls += b.balls;
          x.fours += b.fours;
          x.sixes += b.sixes;
          if (g.runs > x.best.runs || (g.runs === x.best.runs && g.notOut && !x.best.notOut)) x.best = g;
          x.games.push(g);
        }
      }
      for (const w of inn.bowlers) {
        if (PLACEHOLDER.test(w.name.trim())) continue;
        seen(against, w.name);
        const g: BowlGame = { match: m.title, against: team, figures: w.figures, overs: w.overs, balls: w.balls, runs: w.runs, wickets: w.wickets };
        const k = `${against}|${simple(w.name)}`;
        const x = bowls.get(k);
        if (!x) bowls.set(k, { name: w.name, team: against, innings: 1, balls: w.balls, runs: w.runs, wickets: w.wickets, maidens: w.maidens, best: g, games: [g] });
        else {
          x.innings++;
          x.balls += w.balls;
          x.runs += w.runs;
          x.wickets += w.wickets;
          x.maidens += w.maidens;
          if (g.wickets > x.best.wickets || (g.wickets === x.best.wickets && g.runs < x.best.runs)) x.best = g;
          x.games.push(g);
        }
      }
    }
  }
  if (!read) return { stats: null, squads };
  const batters = [...bats.values()].sort((x, y) => y.runs - x.runs || x.balls - y.balls || x.name.localeCompare(y.name));
  const bowlers = [...bowls.values()].sort((x, y) => y.wickets - x.wickets || x.runs - y.runs || x.name.localeCompare(y.name));
  const scores = batters.flatMap((p) => p.games.map((g) => ({ ...g, name: p.name, team: p.team }))).sort((x, y) => y.runs - x.runs || x.balls - y.balls);
  const spells = bowlers.flatMap((p) => p.games.map((g) => ({ ...g, name: p.name, team: p.team }))).sort((x, y) => y.wickets - x.wickets || x.runs - y.runs || x.balls - y.balls);
  return { stats: { matches: read, batters, bowlers, scores, spells, fours, sixes }, squads };
}

/** A margin read from the page's own result words ("Titans won by 14 runs"), so it is the margin the page shows. */
function marginOf(m: MatchFact, unit: "run" | "wicket"): Margin | null {
  const hit = m.winner && m.loser && m.result ? new RegExp(`won by (\\d+) ${unit}s?\\b`).exec(m.result) : null;
  return hit ? { winner: m.winner!, loser: m.loser!, match: m.title, by: Number(hit[1]) } : null;
}

const biggest = (ms: (Margin | null)[]): Margin | null => ms.reduce<Margin | null>((best, m) => (m && (!best || m.by > best.by) ? m : best), null);

/** Finished scorecards read for one tournament: the newest in the organiser's order (lib/ask/tournament.server.ts); older matches keep their result and say their scorecard was not read. */
export const MAX_CARDS = 30;
/** Scorecards with no result yet (being scored, waiting, off, a board) read for one question: the newest. */
export const MAX_IN_PLAY = 6;
/** The digest's cap, about 6,000 tokens at four characters a token. */
export const DIGEST_MAX_CHARS = 24_000;
/** A rough count: four characters a token. */
export const tokensOf = (chars: number) => Math.ceil(chars / 4);

const batWords = (g: Pick<BatGame, "runs" | "balls" | "notOut" | "out">) => `${g.runs}${g.notOut ? " not out" : ""} off ${plural(g.balls, "ball")}${g.out ? `, ${/^(run out|retired)/.test(g.out) ? g.out : `out ${g.out}`}` : ""}`;
const hits = (fours: number, sixes: number) => [fours ? plural(fours, "four") : null, sixes ? plural(sixes, "six", "sixes") : null].filter(Boolean).join(", ");
const ordinalInnings = (n: number) => (n === 0 ? "1st" : "2nd");

/** What a match's digest lines are: its one line, then its scorecard, then its ball-by-ball detail (dropped first when the digest is too long). */
type MatchPart = { title: string; state: MatchFact["state"]; line: string; card: string[]; detail: string[] };

function matchPart(m: MatchFact): MatchPart {
  const how =
    m.note === "typed"
      ? " Typed result: a score and a margin, no scorecard."
      : m.note === "gone"
        ? " Scored live, but its scorecard is no longer kept: only this result."
        : m.note === "unread"
          ? " Scored live; its scorecard is not among the ones read here: only this result."
          : m.entered === "corrected"
            ? " Scored live, result corrected by hand."
            : m.note === "read" && m.state === "done"
              ? " Scored live."
              : "";
  const part: MatchPart = { title: m.title, state: m.state, line: `${m.line}${how}`, card: [], detail: [] };
  const c = m.card;
  if (c?.kind === "board") {
    if (c.sets.length) part.card.push(`${m.title}, finished ${c.unit === "Sets" ? "sets" : "games"}: ${c.sets.join(", ")}.`);
    if (c.players.length) part.card.push(`${m.title}, ${c.sport.toLowerCase()} players: ${c.players.map((p) => `${p.name} (${p.side === "a" ? c.a : c.b}) ${p.text}`).join("; ")}.`);
  }
  if (c?.kind !== "cricket") return part;
  c.innings.forEach((inn, n) => {
    const { team, against } = teamOfSide(m, inn.side);
    const bat = inn.batters.map((b) => `${b.name} ${batWords(b)}${hits(b.fours, b.sixes) ? `, ${hits(b.fours, b.sixes)}` : ""}`);
    part.card.push(`${m.title}, ${ordinalInnings(n)} innings, ${team} batting ${inn.score} in ${inn.overs} overs${bat.length ? `: ${bat.join("; ")}` : ""}.`);
    if (inn.bowlers.length) part.card.push(`${m.title}, ${against} bowling: ${inn.bowlers.map((b) => `${b.name} ${b.figures} in ${b.overs} overs`).join("; ")}.`);
    if (inn.moments.length) part.detail.push(`${m.title}, ${team} innings, ball by ball: ${inn.moments.join("; ")}.`);
    if (inn.boundaries.length) part.detail.push(`${m.title}, ${team} boundaries: ${inn.boundaries.join("; ")}${inn.moreBoundaries ? `; and ${inn.moreBoundaries} more` : ""}.`);
  });
  if (c.potm) part.card.push(`${m.title}, player of the match on its scorecard: ${c.potm.text} (${teamOfSide(m, c.potm.side).team}).`);
  for (const l of c.closing) part.detail.push(`${m.title}. ${l}`);
  return part;
}

/** Room kept for the "Left out" line, at its longest (three kinds, six titles each). */
const LEFT_NOTE_ROOM = 420;
const titles = (xs: string[]) => (xs.length <= 6 ? join(xs) : `${xs.slice(0, 5).join(", ")} and ${xs.length - 5} more`);

/**
 * The digest's lines within the cap. Too long, it leaves out, oldest
 * match first and in this order: ball-by-ball detail, then scorecards,
 * then finished matches' own lines (and last, from the far end of the
 * fixture list, matches not played yet); and says so in a line of its
 * own, so a question about something left out is answered "not in what I
 * read". The table, what is on now and the players' numbers always stay.
 */
function digest(head: string[], parts: MatchPart[], tail: string[], max: number): { lines: string[]; left: string[] } {
  const size = () => head.concat(...parts.map((p) => [p.line, ...p.card, ...p.detail]), tail).reduce((n, l) => n + l.length + 1, 0);
  const cut = { detail: [] as string[], card: [] as string[], line: [] as string[], later: [] as string[] };
  let n = size();
  // Something has to go: keep room for the line that says what did.
  if (n > max) n += LEFT_NOTE_ROOM;
  const drop = (key: "detail" | "card" | "line" | "later") => {
    for (const p of key === "later" ? [...parts].reverse() : parts) {
      if (n <= max) return;
      if (key === "line" || key === "later" ? p.state !== (key === "line" ? "done" : "scheduled") || !p.line : !p[key].length) continue;
      n -= key === "line" || key === "later" ? p.line.length + 1 : p[key].reduce((s, l) => s + l.length + 1, 0);
      if (key === "line" || key === "later") p.line = "";
      else p[key] = [];
      cut[key].push(p.title);
    }
  };
  drop("detail");
  drop("card");
  drop("line");
  drop("later");
  const left = [
    cut.detail.length ? `Ball-by-ball detail left out for ${titles(cut.detail)}.` : null,
    cut.card.length ? `Scorecards left out for ${titles(cut.card)}.` : null,
    cut.line.length ? `Results left out for ${titles(cut.line)}.` : null,
    cut.later.length ? `Fixtures left out for the last ${plural(cut.later.length, "match", "matches")} still to be played.` : null,
  ].filter((x): x is string => !!x);
  const note = left.length ? [`Left out of these facts to keep them short (the page has them): ${left.join(" ")}`] : [];
  return { lines: [...head, ...note, ...parts.flatMap((p) => [p.line, ...p.card, ...p.detail].filter(Boolean)), ...tail], left };
}

/**
 * The facts about a tournament as its page shows it now. view: what GET
 * /api/tournament/<code> serves (null status: it could not be read).
 * cards: per fixture id, the scorecard its live link holds (matchCard);
 * unread: fixtures scored live whose scorecards were not read (past
 * MAX_CARDS). max: the digest's cap.
 */
export function tournamentFacts(
  input: { status: "ok"; view: TournamentGetResponse; cards?: Record<string, MatchCard | null | undefined>; unread?: readonly number[] } | { status: "missing" | "unknown" },
  max = DIGEST_MAX_CHARS,
): TournamentFacts {
  if (input.status !== "ok") return empty(input.status);
  const t = input.view.tournament;
  if (t.status === "removed") return empty("removed", t.name);
  const res = resolve(t, input.view.live);
  const unread = new Set(input.unread ?? []);
  const matches = res.fixtures.map((r) => matchFact(r, fixtureTitle(r.fixture, t.fixtures), input.cards?.[String(r.fixture.id)] ?? null, unread.has(r.fixture.id)));
  const { stats, squads } = statsOf(matches);
  const s = t.settings;
  const table: TableFact[] = res.table.map((row, i) => ({
    pos: i + 1,
    team: row.team,
    played: row.played,
    won: row.won,
    lost: row.lost,
    tied: row.tied,
    nr: row.nr,
    points: row.points,
    nrr: formatNrr(row.nrr),
    runsFor: row.runsFor,
    oversFor: formatOvers(row.ballsFor),
    runsAgainst: row.runsAgainst,
    oversAgainst: formatOvers(row.ballsAgainst),
    rateFor: row.ballsFor > 0 ? formatRate(runRate(row.runsFor, row.ballsFor)) : null,
    rateAgainst: row.ballsAgainst > 0 ? formatRate(runRate(row.runsAgainst, row.ballsAgainst)) : null,
  }));
  const done = matches.filter((m) => m.state === "done");
  const totals: TeamTotal[] = done
    .flatMap((m) => (m.a && m.b && m.home && m.away ? [{ team: m.home, against: m.away, match: m.title, score: m.a.score, overs: m.a.overs, runs: m.a.runs }, { team: m.away, against: m.home, match: m.title, score: m.b.score, overs: m.b.overs, runs: m.b.runs }] : []))
    .sort((x, y) => y.runs - x.runs);
  const champion = !res.champion ? null : "id" in res.champion ? (t.teams.find((x) => x.id === (res.champion as { id: number }).id)?.name ?? null) : "shared";
  const venue = s.venue ? `${s.venue.name}${s.venue.area ? `, ${s.venue.area}` : ""}` : null;
  const f: TournamentFacts = {
    state: "on",
    name: t.name,
    format: formatLabel(s),
    kind: s.format,
    venue,
    dates: rangeLabel(s.starts, s.ends),
    overs: s.overs,
    points: s.points,
    teams: t.teams.map((x) => x.name),
    table,
    series: res.series ? { line: res.series.line, leader: res.series.leader } : null,
    champion,
    qualify: res.qualify,
    leagueDone: res.leagueDone,
    matches,
    played: res.played,
    total: res.total,
    stats,
    totals,
    byRuns: biggest(done.map((m) => marginOf(m, "run"))),
    byWickets: biggest(done.map((m) => marginOf(m, "wicket"))),
    squads,
    has: tournamentHasOf(res, s.format),
    lines: [],
    left: [],
  };
  const d = digest(headLines(f), matches.map(matchPart), statLines(f), max);
  return { ...f, lines: d.lines, left: d.left };
}

const tableLine = (r: TableFact) =>
  `${r.pos}. ${r.team}: played ${r.played}, won ${r.won}, lost ${r.lost}${r.tied ? `, tied ${r.tied}` : ""}${r.nr ? `, no result ${r.nr}` : ""}, ${plural(r.points, "point")}, net run rate ${r.nrr}${
    r.rateFor && r.rateAgainst ? ` (${r.runsFor} runs in ${r.oversFor} overs for, ${r.rateFor} an over, and ${r.runsAgainst} in ${r.oversAgainst} against, ${r.rateAgainst} an over)` : ""
  }.`;

const count = (f: TournamentFacts, note: CardNote) => f.matches.filter((m) => m.note === note && (note === "board" || m.state !== "scheduled")).length;

function headLines(f: TournamentFacts): string[] {
  const p = f.points!;
  const out = [
    "Status: on.",
    `Tournament: ${f.name}. Format: ${f.format}. ${plural(f.teams.length, "team")}: ${f.teams.join(", ")}.${f.overs ? ` ${plural(f.overs, "over")} a side.` : ""}`,
    f.venue ? `Venue: ${f.venue}.` : "Venue: not set on the page.",
    f.dates ? `Dates: ${f.dates}.` : "Dates: not set on the page.",
    `Progress: ${f.played} of ${plural(f.total, "match", "matches")} played${f.has.live ? `, ${f.has.live} on now` : ""}, ${f.total - f.played} still to finish.`,
    `Points: win ${p.win}, tie ${p.tie}, no result ${p.nr}, loss ${p.loss}. Level on points: net run rate, then wins.`,
    `How results came in: ${count(f, "read")} with a ball-by-ball scorecard read here, ${count(f, "typed")} typed in (a score and a margin, no players), ${count(f, "gone") + count(f, "unread")} scored live whose scorecard is not here${count(f, "board") ? `, ${count(f, "board")} on the Live Scoreboard (another sport: a score, no cricket numbers)` : ""}.`,
  ];
  if (f.series) out.push(`Series score: ${f.series.line}.`);
  else for (const r of f.table) out.push(tableLine(r));
  out.push(f.champion === "shared" ? "Champion: the title is shared." : f.champion ? `Champion: ${f.champion}.` : "Champion: not decided yet.");
  if (f.qualify) out.push(`Playoffs: the top ${f.qualify} of the table go through${f.leagueDone ? "; the league stage is over" : " once every league match has a result"}.`);
  const next = nextOf(f);
  out.push(next ? `Next match: ${next.title}, ${next.sides}${next.when ? `, ${next.when}` : ", no day set"}.` : "Next match: none, every match is played or on now.");
  return out;
}

function statLines(f: TournamentFacts): string[] {
  const out: string[] = [];
  if (f.totals[0]) out.push(`Highest team total: ${f.totals[0].team} ${f.totals[0].score} in ${f.totals[0].overs} overs against ${f.totals[0].against} (${f.totals[0].match}).`);
  if (f.byRuns) out.push(`Biggest win by runs: ${f.byRuns.winner} beat ${f.byRuns.loser} by ${plural(f.byRuns.by, "run")} (${f.byRuns.match}).`);
  if (f.byWickets) out.push(`Biggest win by wickets: ${f.byWickets.winner} beat ${f.byWickets.loser} by ${plural(f.byWickets.by, "wicket")} (${f.byWickets.match}).`);
  const st = f.stats;
  if (!st) {
    out.push("Player numbers: none. No match here has a ball-by-ball scorecard to read.");
    return out;
  }
  out.push(`Player numbers below come from the ${plural(st.matches, "match", "matches")} with a scorecard read here, and from no typed result. Sixes hit in them: ${st.sixes}. Fours: ${st.fours}.`);
  st.batters.slice(0, 12).forEach((b, i) =>
    out.push(`Batting, ${b.name} (${b.team}): ${plural(b.runs, "run")} in ${plural(b.innings, "innings", "innings")}, ${plural(b.balls, "ball")}, ${plural(b.fours, "four")}, ${plural(b.sixes, "six", "sixes")}, best ${b.best.runs}${b.best.notOut ? " not out" : ""} against ${b.best.against} in ${b.best.match}. Number ${i + 1} for runs.`),
  );
  st.bowlers.slice(0, 12).forEach((b, i) =>
    out.push(`Bowling, ${b.name} (${b.team}): ${plural(b.wickets, "wicket")} for ${plural(b.runs, "run")} in ${formatOvers(b.balls)} overs, best ${b.best.figures} against ${b.best.against} in ${b.best.match}. Number ${i + 1} for wickets.`),
  );
  return out;
}

/* ------------------------------------------------------------------ */
/* Who a message names                                                 */
/* ------------------------------------------------------------------ */

// Names that are words too: never taken for a player on their own ("who will win", "the chase").
const NOT_NAMES = new Set(["will", "may", "mark", "chase", "win", "won", "run", "runs", "out", "over", "ball", "bat", "best", "top", "king", "lucky", "happy", "sunny", "max", "ace", "star", "team", "match", "final", "next", "last", "first", "most", "score", "the", "and", "who"]);
// Words of a team's name that don't name it alone: "Kings" is Kothrud Kings, "Club" or "Super" is nobody.
const TEAM_GENERIC = new Set([...NOT_NAMES, "club", "xi", "cc", "fc", "sc", "united", "city", "sports", "cricket", "boys", "super", "royal", "all", "stars", "eleven", "academy", "warriors"]);

/** Where a text names each team (once, its first mention), by position in the text's simple form: by whole name, else by a word of three letters or more that only that team has ("Kings" for Kothrud Kings). */
function teamMentions(f: TournamentFacts, text: string): { name: string; at: number }[] {
  const t = ` ${simple(text)} `;
  const words = f.teams.map((n) => simple(n).split(" "));
  const found: { name: string; at: number }[] = [];
  f.teams.forEach((name, i) => {
    const whole = simple(name);
    let at = whole ? t.indexOf(` ${whole} `) : -1;
    if (at < 0) {
      const own = words[i].filter((w) => w.length >= 3 && !TEAM_GENERIC.has(w) && !words.some((other, j) => j !== i && other.includes(w)));
      const hits = own.map((w) => t.indexOf(` ${w} `)).filter((x) => x >= 0);
      if (hits.length) at = Math.min(...hits);
    }
    if (at >= 0) found.push({ name, at });
  });
  return found.sort((x, y) => x.at - y.at);
}

/** The teams a message names, in the order said. */
export function teamsNamed(f: TournamentFacts, q: string): string[] {
  return teamMentions(f, q).map((x) => x.name);
}

/** Every player the scorecards name, with their team. */
function allPlayers(f: TournamentFacts): { name: string; team: string }[] {
  return Object.entries(f.squads).flatMap(([team, names]) => names.map((name) => ({ name, team })));
}

/**
 * The players a message names, by full name or else by first name (three
 * letters or more); the team names are left out first ("Rahul XI" is a
 * team). At most three.
 */
export function playersNamed(f: TournamentFacts, q: string): { name: string; team: string }[] {
  let t = ` ${simple(q)} `;
  for (const team of f.teams) {
    const n = simple(team);
    if (n) t = t.split(` ${n} `).join(" _ ");
  }
  const all = allPlayers(f);
  const said = (n: string, min: number) => n.length >= min && !NOT_NAMES.has(n) && t.includes(` ${n} `);
  const full = all.filter((p) => said(simple(p.name), 2));
  return (full.length ? full : all.filter((p) => said(simple(p.name).split(" ")[0], 3))).slice(0, 3);
}

/** This tournament's names for the search reading (liveKind's LiveOwnNames): its name, venue and teams as whole names, its players by every word of theirs. */
export function tournamentOwnNames(f: TournamentFacts): LiveOwnNames {
  return { own: [f.name ?? "", f.venue ?? "", ...f.teams].filter(Boolean), players: allPlayers(f).map((p) => p.name) };
}

/** Asks what will happen: never answered with a guess, only with how it stands (the live answers' PREDICT, and "can Kings still qualify"). */
const FUTURE = new RegExp(`${PREDICT.source}|\\b(will|can|could|would|should|might) .{0,40}\\b(win|qualify|make it|go through|reach|finish|lose|top)\\b`);
const NO_GUESS = "I can't say what will happen, only how it stands.";

// Asks for one person's numbers: "how many runs did Ravi score", "has Meera taken a wicket".
const PLAYER_ASK = /\b(did|has|have) (?!been\b|they\b|the\b|we\b|you\b|anyone\b|everyone\b|each\b|all\b|teams?\b|it\b|there\b)(\w+ ){1,3}(score|scored|take|taken|took|hit|make|made|get|got|bowl|bowled|concede|conceded)\b/;

// What a message about a player's or a team's cricket says.
const PLAYER_WORDS = /\b(runs?|wickets?|scor(e|ed|es|ing)|bat(s|ted|ting)?|bowl(s|ed|ing)?|figures|numbers|stats?|how|doing|playing|played|play|out|six(es)?|fours?|boundar(y|ies)|best|performance|form|innings|overs?|take|took|taken|hit|made|make|well)\b/;
const TEAM_WORDS = /\b(how|results?|doing|do|did|does|win|wins|won|winning|lose|lost|losing|play|plays|played|playing|position|place|standing|points|form|record|performance|far|matches|games|table|rank|qualif\w+|out|through|beat|beaten)\b/;

const STAT_KINDS: ReadonlySet<string> = new Set(["topScorer", "topBowler", "highest", "bestBowling", "sixes", "fours", "score", "results", "other"]);
const TEAM_KINDS: ReadonlySet<string> = new Set(["other", "result", "results", "score", "leader", "table", "left", "champion", "live"]);

/**
 * The kind to answer, now that the tournament is known. A question naming
 * a player is that player's; two teams, the match between them; one match
 * ("match 3", "the final", "the last match"), that match; one team, that
 * team's results, squad, next match or net run rate. A question about what
 * will happen that is none of the usual ones is answered with how it
 * stands, never sent to the model.
 */
export function tournamentAnswerKind(kind: TournamentAskKind | "other", f: TournamentFacts, q: string): TournamentAskKind | "other" {
  if (f.state !== "on") return kind;
  const t = normAsk(q);
  if (kind === "moments" || kind === "potm") return kind;
  // A named player's numbers, when the message is about what they did (or is little more than the name): "who coaches Amit" is not in any scorecard, so the model says so.
  if (playersNamed(f, q).length) return kind !== "other" || PLAYER_WORDS.test(t) || t.split(" ").length <= 2 ? "player" : "other";
  const teams = teamsNamed(f, q);
  const ref = matchRefOf(q);
  if (teams.length >= 2 && (TEAM_KINDS.has(kind) || kind === "next" || kind === "match")) return "score";
  if (ref && kind === "result") return "result";
  if (ref && STAT_KINDS.has(kind)) return "match";
  if (teams.length === 1) {
    if (SQUAD.test(t)) return "squad";
    // A named team's results, the same way: "who is the captain of Titans" is in no table.
    if (TEAM_KINDS.has(kind)) return kind !== "other" || TEAM_WORDS.test(t) || t.split(" ").length <= 2 ? "team" : "other";
  }
  if (kind === "other" && FUTURE.test(t)) return "leader";
  // "How many runs did Ravi score" with no such player in the scorecards: said so, never a team's score in its place.
  if (PLAYER_ASK.test(t) && !teams.length && !ref) return "player";
  return kind;
}

/* ------------------------------------------------------------------ */
/* Answers                                                             */
/* ------------------------------------------------------------------ */

/** What is said when the facts don't hold an answer. */
export const NOT_SAID = "I can't tell that from this tournament's scorecards.";

const NO_FACTS: Partial<Record<TournamentAskState, string>> = {
  missing: "I can't find a tournament for this link. Check the link with whoever sent it.",
  removed: "The organiser took this tournament down, so there is nothing to read here now.",
  unknown: "I can't read this tournament right now. Ask me again in a moment.",
};

const nextOf = (f: TournamentFacts, team?: string): MatchFact | null => f.matches.find((m) => m.state === "scheduled" && (!team || m.home === team || m.away === team)) ?? null;
const liveOf = (f: TournamentFacts) => f.matches.filter((m) => m.state === "live");
const doneOf = (f: TournamentFacts) => f.matches.filter((m) => m.state === "done");
const lastDone = (f: TournamentFacts): MatchFact | null => doneOf(f).at(-1) ?? null;

const nextSentence = (f: TournamentFacts, team?: string): string => {
  const n = nextOf(f, team);
  if (!n) return team ? `${team} have no match left on the fixture list.` : liveOf(f).length ? "" : "Every match has been played.";
  return `Next: ${n.title}, ${n.sides}${n.when ? `, ${n.when}` : "; no day or time is set for it yet"}.`;
};

/** The match a message points at, or null. */
function matchFor(f: TournamentFacts, ref: MatchRef): MatchFact | null {
  if ("last" in ref) return lastDone(f);
  if ("n" in ref) return f.matches.find((m) => m.title === `Match ${ref.n}`) ?? null;
  if (ref.stage === "final") return f.matches.find((m) => m.stage === "final") ?? null;
  const semis = f.matches.filter((m) => m.stage === "semi");
  return ref.slot ? (semis.find((m) => m.title === `Semi-final ${ref.slot}`) ?? null) : (semis[0] ?? null);
}

const refWords = (ref: MatchRef) => ("last" in ref ? "finished match" : "n" in ref ? `Match ${ref.n}` : ref.stage === "final" ? "final" : "semi-final");

/** A match in a sentence: its line when finished or on, where it stands when not played. */
function matchSentence(m: MatchFact): string {
  if (m.state !== "scheduled") return m.line;
  return `${m.title} (${m.sides}) hasn't been played yet${m.when ? `: it is set for ${m.when}` : "; no day or time is set for it"}.${m.card?.kind === "board" ? ` On the Live Scoreboard (${m.card.sport.toLowerCase()}): ${m.card.result ? `${m.card.result}. ` : ""}${m.card.headline}.` : ""}`;
}

/** Why a finished match has no scorecard to read, said plainly; "" when it has one. */
function noCard(m: MatchFact): string {
  if (m.note === "typed") return "That match's result was typed in, so there is no scorecard to read: no batters, bowlers or ball by ball for it.";
  if (m.note === "gone") return "That match was scored live, but its scorecard is no longer kept, so only the result is left.";
  if (m.note === "unread") return "That match was scored live, but its scorecard is not among the ones I read for this tournament, so I only have the result.";
  if (m.note === "board") return `That match is ${m.card?.kind === "board" ? m.card.sport.toLowerCase() : "another sport"} on the Live Scoreboard: it has a score, not a cricket scorecard.`;
  return "";
}

/** Where the player numbers come from, when that is not every result. */
function scope(f: TournamentFacts): string {
  const typed = count(f, "typed");
  const gone = count(f, "gone") + count(f, "unread");
  if (!f.stats || (!typed && !gone)) return "";
  const rest = [typed ? `${typed} ${typed === 1 ? "result was" : "results were"} typed in` : null, gone ? `${gone} ${gone === 1 ? "scorecard is" : "scorecards are"} not kept here` : null].filter(Boolean).join(" and ");
  return ` That counts the ${plural(f.stats.matches, "match", "matches")} scored ball by ball; ${rest}, so ${typed + gone === 1 ? "it adds" : "they add"} no player numbers.`;
}

/** Why there are no player numbers at all. */
function noStats(f: TournamentFacts, what: string): string {
  const boards = f.matches.filter((m) => m.card?.kind === "board");
  if (boards.length && !doneOf(f).length && boards[0].card?.kind === "board")
    return `This tournament's matches are ${boards[0].card.sport.toLowerCase()} on the Live Scoreboard, which keeps the score and not runs or wickets, so I can't tell you ${what}. ${boards.map((m) => m.line).join(" ")}`;
  if (!doneOf(f).length && !liveOf(f).length) return `No match has been played yet, so I can't tell you ${what}. ${nextSentence(f)}`.trim();
  const typed = count(f, "typed");
  if (typed === doneOf(f).length && !liveOf(f).length) return `Every result here was typed in with a score and a margin, so there is no scorecard to read and I can't tell you ${what}.`;
  return `No match here has a ball-by-ball scorecard I can read, so I can't tell you ${what}.`;
}

function championReply(f: TournamentFacts): string {
  const final = f.matches.find((m) => m.stage === "final" && m.state === "done");
  if (f.champion === "shared") return `The title is shared. ${final ? final.line : f.series ? `The series ended level: ${f.series.line}.` : ""}`.trim();
  if (f.champion) {
    const top = f.table.find((r) => r.team === f.champion);
    return `${f.champion} are the champions. ${final ? final.line : f.series ? `They won the series: ${f.series.line}.` : top ? `They finished top of the table with ${plural(top.points, "point")} from ${plural(top.played, "match", "matches")}.` : ""}`.trim();
  }
  return `No champion yet: ${f.played} of ${plural(f.total, "match", "matches")} played. ${f.played ? leaderReply(f) : nextSentence(f)}`.trim();
}

function leaderReply(f: TournamentFacts): string {
  if (f.champion) return championReply(f);
  if (f.series) {
    if (!f.played) return `No match of the series has a result yet. ${nextSentence(f)}`.trim();
    return f.series.leader ? `${f.series.leader} lead the series: ${f.series.line}, after ${f.played} of ${plural(f.total, "match", "matches")}.` : `The series is level: ${f.series.line}, after ${f.played} of ${plural(f.total, "match", "matches")}.`;
  }
  const [a, b] = f.table;
  if (!a || a.played === 0) return `No match has a result yet, so nobody is ahead. ${nextSentence(f)}`.trim();
  const record = `won ${a.won}, lost ${a.lost}${a.tied ? `, tied ${a.tied}` : ""}${a.nr ? `, no result ${a.nr}` : ""}`;
  if (b && b.points === a.points && b.played > 0) {
    const by = a.nrr !== b.nrr ? `${a.team} are ahead on net run rate (${a.nrr} against ${b.nrr})` : a.won !== b.won ? `${a.team} are ahead on wins` : "they are level on net run rate and wins too";
    return `${a.team} and ${b.team} are level on ${plural(a.points, "point")} at the top of the table; ${by}.`;
  }
  return `${a.team} lead the table with ${plural(a.points, "point")} from ${plural(a.played, "match", "matches")} (${record}), net run rate ${a.nrr}.${b ? ` ${b.team} are second with ${plural(b.points, "point")}.` : ""}`;
}

function tableReply(f: TournamentFacts): string {
  if (f.series) return `This is a series, so there is no points table: ${f.series.line}, after ${f.played} of ${plural(f.total, "match", "matches")}.`;
  if (!f.table.some((r) => r.played > 0)) return `No match has a result yet, so every team is on 0 points: ${join(f.teams)}. ${nextSentence(f)}`.trim();
  const rows = f.table.slice(0, 8).map((r) => `${r.pos}. ${r.team}, ${plural(r.points, "point")} (played ${r.played}, won ${r.won}, lost ${r.lost}, net run rate ${r.nrr})`);
  return `The points table after ${f.played} of ${plural(f.total, "match", "matches")}: ${rows.join("; ")}.${f.table.length > 8 ? ` ${f.table.length - 8} more on the page's Table.` : ""}`;
}

function playoffsReply(f: TournamentFacts): string {
  if (f.kind === "bilateral") return `This is a series between two teams, so there are no playoffs. ${f.series?.line ?? ""}`.trim();
  if (!f.qualify) return `This tournament has no playoffs: the team on top of the table when every match is played wins it. ${f.table.some((r) => r.played > 0) ? leaderReply(f) : ""}`.trim();
  const games = f.matches.filter((m) => m.stage !== "league").map(matchSentence);
  if (f.leagueDone) return `The league stage is over and the top ${f.qualify} went through. ${games.join(" ")}`;
  const left = f.matches.filter((m) => m.stage === "league" && m.state !== "done").length;
  const top = f.table.filter((r) => r.played > 0).slice(0, f.qualify).map((r) => r.team);
  return `The top ${f.qualify} of the table go through once the league is done, with ${plural(left, "league match", "league matches")} still to finish.${top.length ? ` The top of the table right now: ${join(top)}.` : ""}`;
}

function resultReply(f: TournamentFacts, q: string): string {
  const ref = matchRefOf(q);
  if (ref) {
    const m = matchFor(f, ref);
    if (!m) return "last" in ref ? `No match has a result yet. ${nextSentence(f)}`.trim() : `There is no ${refWords(ref)} in this tournament's fixtures.`;
    return matchSentence(m);
  }
  if (f.champion) return championReply(f);
  const last = lastDone(f);
  if (!last) return `No match has a result yet. ${liveOf(f).map((m) => m.line).join(" ")} ${nextSentence(f)}`.replace(/\s+/g, " ").trim();
  return `The tournament isn't over: ${f.played} of ${plural(f.total, "match", "matches")} played. The latest result: ${last.line}`;
}

function resultsReply(f: TournamentFacts): string {
  const done = doneOf(f);
  if (!done.length) return `No match has a result yet. ${nextSentence(f)}`.trim();
  const shown = done.slice(-8);
  return `${done.length > shown.length ? `The latest ${shown.length} of ${done.length} results` : "Results so far"}: ${shown.map((m) => m.line).join(" ")}`;
}

/** The matches between two teams, the latest first to be answered about. */
const between = (f: TournamentFacts, x: string, y: string) => f.matches.filter((m) => (m.home === x && m.away === y) || (m.home === y && m.away === x));

function scoreReply(f: TournamentFacts, q: string): string {
  const [x, y] = teamsNamed(f, q);
  if (x && y) {
    const games = between(f, x, y);
    if (!games.length) return `${x} and ${y} are not down to play each other in this tournament's fixtures.`;
    return games.map(matchSentence).join(" ");
  }
  if (x) return teamReply(f, x);
  const ref = matchRefOf(q);
  if (ref) return matchReply(f, q);
  const on = liveOf(f);
  if (on.length) return on.map((m) => m.line).join(" ");
  const last = lastDone(f);
  return last ? `The latest result: ${last.line}` : `No match has a score yet. ${nextSentence(f)}`.trim();
}

/** The match a message is about: the one it names, the one between the two teams it names, else the latest with a scorecard. */
function matchAsked(f: TournamentFacts, q: string): MatchFact | null | "none" {
  const ref = matchRefOf(q);
  if (ref) return matchFor(f, ref) ?? "none";
  const [x, y] = teamsNamed(f, q);
  if (x && y) return between(f, x, y).filter((m) => m.state !== "scheduled").at(-1) ?? between(f, x, y)[0] ?? "none";
  return f.matches.filter((m) => m.card?.kind === "cricket").at(-1) ?? lastDone(f);
}

/** One match in full: its line, each innings' best batters and the best bowling against it; or why it has no scorecard. */
function matchReply(f: TournamentFacts, q: string): string {
  const m = matchAsked(f, q);
  if (m === "none") {
    const ref = matchRefOf(q);
    return ref && !("last" in ref) ? `There is no ${refWords(ref)} in this tournament's fixtures.` : `No match has a result yet. ${nextSentence(f)}`.trim();
  }
  if (!m) return `No match has a result yet. ${nextSentence(f)}`.trim();
  if (m.state === "scheduled") return matchSentence(m);
  const c = m.card;
  if (!c || c.kind !== "cricket") return `${m.line} ${noCard(m)}`.trim();
  const tops = c.innings.flatMap((inn) => {
    const { team } = teamOfSide(m, inn.side);
    const best = [...inn.batters].sort((p, r) => r.runs - p.runs || p.balls - r.balls).slice(0, 2);
    return best.map((b) => `${b.name} ${b.runs}${b.notOut ? " not out" : ""} off ${b.balls} for ${team}`);
  });
  const bowl = c.innings.flatMap((inn) => {
    const { against } = teamOfSide(m, inn.side);
    const best = [...inn.bowlers].sort((p, r) => r.wickets - p.wickets || p.runs - r.runs)[0];
    return best ? [`${best.name} ${best.figures} in ${best.overs} overs for ${against}`] : [];
  });
  return `${m.line}${tops.length ? ` Top scores: ${tops.join("; ")}.` : ""}${bowl.length ? ` Best bowling: ${bowl.join("; ")}.` : ""}${c.potm ? ` Player of the match on the scorecard: ${c.potm.text} (${teamOfSide(m, c.potm.side).team}).` : ""}${m.entered === "corrected" ? " The result was corrected by hand after it was scored live." : ""}`;
}

/** The scorecards' own players of the match: one match's when the message names it, else every finished scored match's. */
function potmReply(f: TournamentFacts, q: string): string {
  const one = matchRefOf(q) || teamsNamed(f, q).length >= 2 ? matchAsked(f, q) : null;
  if (one === "none") return matchReply(f, q);
  if (one) {
    if (one.state === "scheduled") return matchSentence(one);
    const c = one.card;
    if (!c || c.kind !== "cricket") return `${noCard(one)} ${one.line}`.trim();
    return c.potm ? `${one.title}'s player of the match on its scorecard: ${c.potm.text} (${teamOfSide(one, c.potm.side).team}). ${one.line}` : `${one.title} isn't over, so its scorecard names no player of the match yet. ${one.line}`;
  }
  const all = f.matches.flatMap((m) => (m.card?.kind === "cricket" && m.card.potm ? [`${m.title}: ${m.card.potm.text} (${teamOfSide(m, m.card.potm.side).team})`] : []));
  if (!all.length) return f.stats ? "No scored match is over yet, so no scorecard names a player of the match." : noStats(f, "who was player of the match");
  return `Players of the match, as each scorecard has them: ${all.slice(-8).join("; ")}.${scope(f)} There is no player of the tournament on this page.`;
}

function momentsReply(f: TournamentFacts, q: string): string {
  const m = matchAsked(f, q);
  if (m === "none" || !m) return matchReply(f, q);
  if (m.state === "scheduled") return matchSentence(m);
  const c = m.card;
  if (!c || c.kind !== "cricket") return `${noCard(m)} ${m.line}`.trim();
  const said = c.innings.map((inn) => {
    const { team } = teamOfSide(m, inn.side);
    const b = hits(inn.batters.reduce((n, x) => n + x.fours, 0), inn.batters.reduce((n, x) => n + x.sixes, 0));
    const shown = inn.moments.slice(0, 8);
    return `${team} ${inn.score} in ${inn.overs} overs${b ? `, with ${b}` : ""}${shown.length ? `: ${shown.join("; ")}${inn.moments.length > shown.length ? `; and ${inn.moments.length - shown.length} more on the scorecard` : ""}` : ""}.`;
  });
  return `${m.title}, ${m.sides}, from its ball by ball list. ${said.join(" ")} ${c.closing.join(" ")} ${m.state === "done" && m.result ? `${m.result}.` : ""}`.replace(/\s+/g, " ").trim();
}

const who = (p: { name: string; team: string }) => `${p.name} (${p.team})`;
/** Players level on a number: three by name, then how many more. */
const levelNames = (xs: { name: string; team: string }[]) => (xs.length > 3 ? `${xs.slice(0, 3).map(who).join(", ")} and ${xs.length - 3} more` : join(xs.map(who)));

/** The player numbers of one team's players, when a question names a team ("most wickets for Kings"); all of them otherwise. */
function statsFor(f: TournamentFacts, team?: string): TournamentStats | null {
  const st = f.stats;
  if (!st || !team) return st;
  const batters = st.batters.filter((b) => b.team === team);
  return { ...st, batters, bowlers: st.bowlers.filter((b) => b.team === team), scores: st.scores.filter((b) => b.team === team), spells: st.spells.filter((b) => b.team === team), fours: batters.reduce((n, b) => n + b.fours, 0), sixes: batters.reduce((n, b) => n + b.sixes, 0) };
}
const of = (team?: string) => (team ? ` for ${team}` : "");
const most = (team?: string) => (team ? `the most for ${team}` : "the most in the tournament");
/** A team none of whose matches has a scorecard read here. */
const noTeamStats = (team: string) => `I have no player numbers for ${team}: none of their matches has a ball-by-ball scorecard to read here.`;

function topScorerReply(f: TournamentFacts, team?: string): string {
  const st = statsFor(f, team);
  if (!st) return noStats(f, "who scored the runs");
  const top = st.batters[0];
  if (!top && team) return noTeamStats(team);
  if (!top || top.runs === 0) return `Nobody has scored a run off the bat yet${of(team)} in the ${plural(st.matches, "match", "matches")} scored ball by ball.`;
  const level = st.batters.filter((b) => b.runs === top.runs);
  const lead =
    level.length > 1
      ? `${levelNames(level)} are level on ${plural(top.runs, "run")}, ${most(team)}.`
      : `Most runs${of(team)}: ${who(top)} with ${top.runs} in ${plural(top.innings, "innings", "innings")}, best ${top.best.runs}${top.best.notOut ? " not out" : ""}.`;
  const then = st.batters.slice(level.length, level.length + 2).filter((b) => b.runs > 0);
  return `${lead}${then.length ? ` Then ${join(then.map((b) => `${who(b)} ${b.runs}`))}.` : ""}${scope(f)}`;
}

function topBowlerReply(f: TournamentFacts, team?: string): string {
  const st = statsFor(f, team);
  if (!st) return noStats(f, "who took the wickets");
  const top = st.bowlers[0];
  if (!top && team) return noTeamStats(team);
  if (!top || top.wickets === 0) return `Nobody has a wicket to their name yet${of(team)} in the ${plural(st.matches, "match", "matches")} scored ball by ball.`;
  const level = st.bowlers.filter((b) => b.wickets === top.wickets);
  const lead =
    level.length > 1
      ? `${levelNames(level)} are level on ${plural(top.wickets, "wicket")}, ${most(team)}.`
      : `Most wickets${of(team)}: ${who(top)} with ${top.wickets}, for ${plural(top.runs, "run")} in ${formatOvers(top.balls)} overs, best ${top.best.figures}.`;
  const then = st.bowlers.slice(level.length, level.length + 2).filter((b) => b.wickets > 0);
  return `${lead}${then.length ? ` Then ${join(then.map((b) => `${who(b)} ${b.wickets}`))}.` : ""}${scope(f)}`;
}

function highestReply(f: TournamentFacts, team?: string): string {
  const st = statsFor(f, team);
  if (!st) return noStats(f, "who made the highest score");
  const [top, second] = st.scores;
  if (!top && team) return noTeamStats(team);
  if (!top) return `Nobody has batted yet in the ${plural(st.matches, "match", "matches")} scored ball by ball.`;
  return `Highest score${of(team)}: ${who(top)}, ${top.runs}${top.notOut ? " not out" : ""} off ${plural(top.balls, "ball")} against ${top.against} in ${top.match}.${second && second.runs > 0 ? ` Next best: ${who(second)} ${second.runs}${second.notOut ? " not out" : ""} (${second.match}).` : ""}${scope(f)}`;
}

function bestBowlingReply(f: TournamentFacts, team?: string): string {
  const st = statsFor(f, team);
  if (!st) return noStats(f, "who bowled best");
  const [top, second] = st.spells;
  if (!top && team) return noTeamStats(team);
  if (!top || top.wickets === 0) return `Nobody has taken a wicket yet${of(team)} in the ${plural(st.matches, "match", "matches")} scored ball by ball.`;
  return `Best bowling${of(team)}: ${who(top)}, ${top.figures} in ${top.overs} overs against ${top.against} in ${top.match}.${second && second.wickets > 0 ? ` Next best: ${who(second)} ${second.figures} (${second.match}).` : ""}${scope(f)}`;
}

function hitsReply(f: TournamentFacts, key: "sixes" | "fours", team?: string): string {
  const st = statsFor(f, team);
  const word = key === "sixes" ? "six" : "four";
  if (!st) return noStats(f, `who hit the ${key}`);
  if (!st.batters.length && team) return noTeamStats(team);
  const all = st[key];
  const ranked = [...st.batters].sort((x, y) => y[key] - x[key] || x.balls - y.balls);
  const top = ranked[0];
  if (!top || top[key] === 0) return `Nobody has hit a ${word}${of(team)} in the ${plural(st.matches, "match", "matches")} scored ball by ball.`;
  const level = ranked.filter((b) => b[key] === top[key]);
  const lead = level.length > 1 ? `${levelNames(level)} have hit the most ${key}${of(team)}, ${top[key]} each.` : `Most ${key}${of(team)}: ${who(top)} with ${top[key]}.`;
  const then = ranked.slice(level.length, level.length + 2).filter((b) => b[key] > 0);
  return `${lead}${then.length ? ` Then ${join(then.map((b) => `${who(b)} ${b[key]}`))}.` : ""} ${key === "sixes" ? "Sixes" : "Fours"} hit${of(team)} in all: ${all}.${scope(f)}`;
}

function teamTotalReply(f: TournamentFacts): string {
  const [top, second] = f.totals;
  if (!top) return `No match has a score yet. ${nextSentence(f)}`.trim();
  return `Highest team total: ${top.team} ${top.score} in ${top.overs} overs against ${top.against} (${top.match}).${second ? ` Next: ${second.team} ${second.score} against ${second.against} (${second.match}).` : ""}`;
}

function bigWinReply(f: TournamentFacts): string {
  const said = [
    f.byRuns ? `Biggest win by runs: ${f.byRuns.winner} beat ${f.byRuns.loser} by ${plural(f.byRuns.by, "run")} (${f.byRuns.match}).` : null,
    f.byWickets ? `Biggest win by wickets: ${f.byWickets.winner} beat ${f.byWickets.loser} by ${plural(f.byWickets.by, "wicket")} (${f.byWickets.match}).` : null,
  ].filter(Boolean);
  if (said.length) return said.join(" ");
  return doneOf(f).length ? "No result here has a margin in runs or wickets to compare." : `No match has a result yet. ${nextSentence(f)}`.trim();
}

function nextReply(f: TournamentFacts, q: string): string {
  const [team] = teamsNamed(f, q);
  if (team) {
    const on = liveOf(f).find((m) => m.home === team || m.away === team);
    return `${on ? `${on.line} ` : ""}${nextSentence(f, team)}`.trim();
  }
  const on = liveOf(f).map((m) => m.line);
  const up = f.matches.filter((m) => m.state === "scheduled");
  if (!up.length) return `${on.join(" ")} ${f.played >= f.total ? "Every match has been played." : "No other match is waiting to be played."}${f.champion ? ` ${championReply(f)}` : ""}`.trim();
  const more = /\b(fixtures?|schedule|upcoming)\b/.test(normAsk(q)) ? up.slice(1, 4).map((m) => `${m.title}, ${m.sides}${m.when ? `, ${m.when}` : ""}`) : [];
  return `${on.join(" ")} ${nextSentence(f)}${more.length ? ` After that: ${more.join("; ")}.` : ""}`.trim();
}

function leftReply(f: TournamentFacts): string {
  const on = liveOf(f).length;
  const left = f.total - f.played;
  if (!f.total) return "No matches are set up yet.";
  if (!left) return `Every match has been played: ${f.played} of ${f.total}.${f.champion ? ` ${championReply(f)}` : ""}`;
  return `${plural(left, "match is", "matches are")} left: ${f.played} of ${f.total} played${on ? `, and ${on} of those left ${on === 1 ? "is" : "are"} on now` : ""}. ${nextSentence(f)}`.trim();
}

function liveReply(f: TournamentFacts): string {
  const on = liveOf(f);
  if (on.length) return on.map((m) => m.line).join(" ");
  const last = lastDone(f);
  return `No match is being scored live right now.${last ? ` The latest result: ${last.line}` : ""} ${nextSentence(f)}`.trim();
}

const NRR_MEANS =
  "Net run rate is the runs a team scores per over minus the runs it concedes per over, across its league matches. It separates teams level on points; a side bowled out is counted as facing its full overs, and a match with no result is left out.";

function nrrReply(f: TournamentFacts, q: string): string {
  if (f.series) return `${NRR_MEANS} A series is decided on matches won, so this page shows none: ${f.series.line}.`;
  const [team] = teamsNamed(f, q);
  const row = team ? f.table.find((r) => r.team === team) : null;
  if (row) {
    if (!row.rateFor || !row.rateAgainst) return `${row.team} have no net run rate yet: no league result counts for them. ${NRR_MEANS}`;
    return `${poss(row.team)} net run rate is ${row.nrr}: ${row.runsFor} runs in ${row.oversFor} overs for (${row.rateFor} an over) and ${row.runsAgainst} in ${row.oversAgainst} overs against (${row.rateAgainst} an over). ${NRR_MEANS}`;
  }
  const rows = f.table.filter((r) => r.played > 0);
  return `${NRR_MEANS}${rows.length ? ` Here: ${rows.slice(0, 8).map((r) => `${r.team} ${r.nrr}`).join(", ")}.` : " No match here has a result yet, so nobody has one."}`;
}

function aboutReply(f: TournamentFacts, q: string): string {
  const t = normAsk(q);
  const p = f.points!;
  if (/\b(where|venue|ground)\b/.test(t)) return f.venue ? `${f.name} is at ${f.venue}.` : `The organiser hasn't put a venue on this page.`;
  if (/\b(when|dates?)\b/.test(t)) return `${f.dates ? `Its dates on the page: ${f.dates}.` : "The organiser hasn't put dates on this page."} ${nextSentence(f)}`.trim();
  if (/\b(rules|points for|how (does|do) (the )?points)\b/.test(t)) return `Points: win ${p.win}, tie ${p.tie}, no result ${p.nr}, loss ${p.loss}. Teams level on points are split by net run rate, then by wins.${f.overs ? ` A side bowled out counts the full ${f.overs} overs.` : ""}`;
  if (/\b(teams?|who'?s playing|who is playing)\b/.test(t) && !/\bformat\b/.test(t)) return `${plural(f.teams.length, "team")}: ${join(f.teams)}.`;
  if (/\b(format|overs)\b/.test(t)) return `${f.name} is a ${f.format} of ${plural(f.teams.length, "team")}${f.overs ? `, ${plural(f.overs, "over")} a side` : ""}, ${plural(f.total, "match", "matches")} in all.`;
  return `${f.name}: ${f.format}, ${plural(f.teams.length, "team")} (${join(f.teams)})${f.overs ? `, ${plural(f.overs, "over")} a side` : ""}${f.venue ? `, at ${f.venue}` : ""}${f.dates ? `, ${f.dates}` : ""}. ${f.played} of ${plural(f.total, "match", "matches")} played.`;
}

function teamReply(f: TournamentFacts, team: string): string {
  const row = f.table.find((r) => r.team === team);
  const games = doneOf(f).filter((m) => m.home === team || m.away === team);
  const on = liveOf(f).find((m) => m.home === team || m.away === team);
  const stand = f.series
    ? `${team}: ${f.series.line} in the series.`
    : row && row.played > 0
      ? `${team} are ${placeLabel(row.pos - 1)} in the table: played ${row.played}, won ${row.won}, lost ${row.lost}${row.tied ? `, tied ${row.tied}` : ""}${row.nr ? `, no result ${row.nr}` : ""}, ${plural(row.points, "point")}, net run rate ${row.nrr}.`
      : `${team} have no result yet.`;
  const shown = games.slice(-6).map((m) => `${m.title} v ${m.home === team ? m.away : m.home}: ${m.result}`);
  return `${f.champion === team ? `${team} are the champions. ` : ""}${stand}${shown.length ? ` ${games.length > shown.length ? `Their latest ${shown.length} results` : "Results"}: ${shown.join("; ")}.` : ""}${on ? ` ${on.line}` : ""} ${nextSentence(f, team)}`.trim();
}

function squadReply(f: TournamentFacts, team: string): string {
  const names = f.squads[team];
  if (!names?.length) return `I have no player names for ${team}: none of their matches has a ball-by-ball scorecard to read here.`;
  return `${poss(team)} players in the scorecards read here: ${join(names.slice(0, 20))}.`;
}

function playerReply(f: TournamentFacts, names: { name: string; team: string }[]): string {
  const st = f.stats;
  return names
    .slice(0, 2)
    .map((p) => {
      const bat = st?.batters.find((b) => b.team === p.team && simple(b.name) === simple(p.name));
      const bowl = st?.bowlers.find((b) => b.team === p.team && simple(b.name) === simple(p.name));
      if (!bat && !bowl) return `${who(p)} is in the scorecards but hasn't batted or bowled.`;
      const said: string[] = [];
      if (bat) {
        const each = bat.games.slice(-5).map((g) => `${g.match} v ${g.against}: ${batWords(g)}`);
        said.push(`${plural(bat.runs, "run")} in ${plural(bat.innings, "innings", "innings")} (${plural(bat.balls, "ball")}${hits(bat.fours, bat.sixes) ? `, ${hits(bat.fours, bat.sixes)}` : ""}), best ${bat.best.runs}${bat.best.notOut ? " not out" : ""}. ${each.join("; ")}.`);
      }
      if (bowl) {
        const each = bowl.games.slice(-5).map((g) => `${g.match} v ${g.against}: ${g.figures} in ${g.overs} overs`);
        said.push(`${bat ? "Bowling: " : ""}${plural(bowl.wickets, "wicket")} for ${plural(bowl.runs, "run")} in ${formatOvers(bowl.balls)} overs. ${each.join("; ")}.`);
      }
      return `${who(p)}: ${said.join(" ")}`;
    })
    .join(" ")
    .concat(scope(f));
}

/** What can be asked here, for this tournament. */
const canAsk = (f: TournamentFacts) => `Ask me who's ahead, a result, the next match${f.stats ? ", the top scorer or a player's numbers" : " or a team's results"}.`;

/** A greeting or a thank-you: answered here, with what can be asked. */
function helloReply(f: TournamentFacts, q: string): string {
  return `${/\b(thanks?|thank you|thx|shukriya|dhanyavaa?d)\b/.test(normAsk(q)) ? "Anytime." : "Hello."} I answer from ${f.name}'s table${f.stats ? " and scorecards" : " and results"}. ${canAsk(f)}`;
}

/** The answer to one of the usual questions, from the facts alone. */
export function tournamentReply(kind: TournamentAskKind, f: TournamentFacts, q = ""): string {
  const none = NO_FACTS[f.state];
  if (none) return none;
  const guess = FUTURE.test(normAsk(q)) && ["leader", "champion", "playoffs", "team", "score", "match", "result"].includes(kind) ? `${NO_GUESS} ` : "";
  const [team] = teamsNamed(f, q);
  switch (kind) {
    case "leader":
      return guess + leaderReply(f);
    case "table":
      return tableReply(f);
    case "champion":
      return guess + championReply(f);
    case "playoffs":
      return guess + playoffsReply(f);
    case "result":
      return guess + resultReply(f, q);
    case "results":
      return resultsReply(f);
    case "score":
      return guess + scoreReply(f, q);
    case "match":
      return guess + matchReply(f, q);
    case "moments":
      return momentsReply(f, q);
    case "potm":
      return potmReply(f, q);
    case "topScorer":
      return topScorerReply(f, team);
    case "topBowler":
      return topBowlerReply(f, team);
    case "highest":
      return highestReply(f, team);
    case "bestBowling":
      return bestBowlingReply(f, team);
    case "sixes":
    case "fours":
      return hitsReply(f, kind, team);
    case "hello":
      return helloReply(f, q);
    case "teamTotal":
      return teamTotalReply(f);
    case "bigWin":
      return bigWinReply(f);
    case "next":
      return nextReply(f, q);
    case "left":
      return leftReply(f);
    case "live":
      return liveReply(f);
    case "nrr":
      return nrrReply(f, q);
    case "about":
      return aboutReply(f, q);
    case "team":
      return guess + (team ? teamReply(f, team) : leaderReply(f));
    case "squad":
      return team ? squadReply(f, team) : aboutReply(f, "teams");
    case "player": {
      const names = playersNamed(f, q);
      if (names.length) return playerReply(f, names);
      if (!f.stats) return noStats(f, "a player's numbers");
      return `I can't find that player in this tournament's scorecards. I have ${plural(allPlayers(f).length, "player")} from the ${plural(f.stats.matches, "match", "matches")} scored ball by ball; ask with the name as the scorecard spells it.`;
    }
  }
}

/**
 * What /api/ask does with a message on a tournament's page: on to the
 * usual Ask (a turf or game search, or a message that is nothing here and
 * that the quick reader reads as a search, a comparison, a host or a
 * tool), or answered here as `kind` ("other": the model, from the facts).
 * places: the turf areas and cities a search may name (liveKind's
 * livePlaces). quickIntent: lib/ai/quick.ts quickAnswer's intent for the
 * message, asked only when it is none of the usual questions.
 */
export function tournamentRead(q: string, f: TournamentFacts, opts: { places?: RegExp | null; quickIntent: () => string | null }): { goesOn: true } | { goesOn: false; kind: TournamentAskKind | "other" } {
  const asked = tournamentAskKind(q, { places: opts.places, ...tournamentOwnNames(f) });
  if (asked === "search" || tournamentGoesOn(asked, asked === "other" ? opts.quickIntent() : null)) return { goesOn: true };
  return { goesOn: false, kind: tournamentAnswerKind(asked, f, q) };
}

/**
 * Without the model, or when its answer can't be used: that the
 * scorecards don't say, then what they do say about the player or team
 * the message names, else what can be asked.
 */
export function tournamentFallback(f: TournamentFacts, q = ""): string {
  const none = NO_FACTS[f.state];
  if (none) return none;
  const names = playersNamed(f, q);
  if (names.length) return `${NOT_SAID} What they do say: ${playerReply(f, names)}`;
  const [team] = teamsNamed(f, q);
  if (team) return `${NOT_SAID} What the page does say: ${teamReply(f, team)}`;
  return `${NOT_SAID} ${canAsk(f)}`;
}

/* ------------------------------------------------------------------ */
/* The guard on a model's reply                                        */
/* ------------------------------------------------------------------ */

/** Every run of digits in a text. */
export function numbersFrom(text: string): string[] {
  return text.match(/\d+/g) ?? [];
}

// Words a reply may start a sentence with, or use in capitals, that are no name: ordinary English and the Hinglish players write.
const COMMON = new Set(
  (
    "a an the this that these those there here it its they them their he she his her him we you i me my our your who whom whose what which when where why how " +
    "yes no not none nobody nothing neither nor never only just also still yet so and but or if then than as at by for from in into of off on onto to up with without within over under after before since until till while during between against across " +
    "is are was were be been being am has have had do does did can could may might must shall should will would " +
    "all any both each every few many most more much some several one two three four five six seven eight nine ten first second third fourth last next latest previous other another same such " +
    "match matches game games final finals semi semi-final semi-finals league series tournament table points point team teams side sides player players batter batters bowler bowlers batting bowling innings over overs run runs wicket wickets six sixes four fours boundary boundaries " +
    "top best highest biggest lowest most least net rate result results score scores scorecard scorecards played won lost tied level ahead behind leading leads lead winner winners champion champions title " +
    "sorry right now today tomorrow yesterday currently overall so far together altogether however though although because that's it's there's here's they're he's she's i'm i'll i've can't don't doesn't didn't isn't aren't wasn't weren't hasn't haven't won't " +
    "tapturf nrr ask live scoreboard cricket football badminton tennis volleyball basketball pickleball india indian ok okay hi hello hey namaste thanks thank welcome please " +
    "monday tuesday wednesday thursday friday saturday sunday mon tue wed thu fri sat sun january february march april june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec " +
    "abhi ab aaj kal haan han nahi nahin koi kaun kon kya kitne kitna sabse sab yeh ye woh wo is us agla pichla tak se ne ko ka ki ke hai hain tha thi the mein me par aur ya bhi sirf jeeta jeeti haara match-wise " +
    "based according looking unfortunately typed scored that's why"
  ).split(" "),
);

type Segment = { text: string; nums: Set<string> };

/** The facts' lines in pieces, one thing each (a table row, a match, one batter of a scorecard): a reply's number must sit in a piece with what it is said about. */
function segmentsOf(f: TournamentFacts): Segment[] {
  return f.lines.flatMap((l) => l.split("; ")).map((s) => ({ text: ` ${simple(s)} `, nums: new Set(numbersFrom(s)) }));
}

/** Team and player names a sentence uses, as the facts' pieces spell them (simple). */
function namedIn(f: TournamentFacts, sentence: string): string[] {
  const teams = teamsNamed(f, sentence).map(simple);
  const players = playersNamed(f, sentence).map((p) => simple(p.name));
  return [...new Set([...teams, ...players])];
}

const NEGATED = /\b(not|never|no|nahi|nahin|yet|if|whether|unless|can't|cannot|couldn't|hasn't|haven't|didn't|doesn't|isn't|aren't|wasn't|weren't|won't)\b|n't\b/;
const FORECAST = /\b(will|should|going to|gonna|likely to|bound to|set to|sure to|expected to|looks? set to|favou?rites? to)\s+(?:\w+\s+){0,3}(win|lift|qualify|top|finish|beat|lose|go through|make it|reach)\b|\bfavou?rites?\b|\bprobably\b|\blikely\b|\bpredict/i;
const BOOK = /\bbook(s|ed|ing|ings)?\b/i;

export type ReplyCheck = { ok: true } | { ok: false; why: "words" | "forecast" | "name" | "number" | "result" };

/**
 * Whether a model's reply may be shown: it only phrased the facts. Refused
 * (the caller then gives the code-built answer or NOT_SAID) when it
 *  - says "book" (words), or
 *  - says what will happen (forecast): "should win", "favourites", or
 *  - uses a capitalised word that is not in the facts, the question or
 *    everyday words (name): an invented player, team or place, or
 *  - has a number the facts don't have, or have only about something else
 *    (number): each number must sit in one piece of the facts with a team
 *    or player the same sentence names, or
 *  - states a result the facts don't have (result): "A beat B", "A won by
 *    14 runs", "A are the champions" must be a finished match's own winner
 *    and margin.
 * Two things in one sentence can still be swapped ("Amit 12 and Rahul 34"
 * for the reverse): the prompt forbids it and the usual questions never
 * reach the model.
 */
export function tournamentReplyOk(reply: string, f: TournamentFacts, q = ""): ReplyCheck {
  if (BOOK.test(reply)) return { ok: false, why: "words" };
  const sentences = reply.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  if (sentences.some((s) => FORECAST.test(s) && !/\b(can't|cannot|can not|no way|nahi bata|not say|won't guess|only how it stands)\b/i.test(s))) return { ok: false, why: "forecast" };

  // Names: every capitalised word is in the facts, the question or everyday words.
  const known = new Set(`${f.lines.join(" ")} ${q}`.toLowerCase().match(/[a-z][a-z'’-]*/g) ?? []);
  for (const w of reply.match(/[A-Z][A-Za-z'’-]*/g) ?? []) {
    const lw = w.toLowerCase().replace(/[’']s$/, "").replace(/[’']$/, "");
    if (!known.has(lw) && !known.has(w.toLowerCase()) && !COMMON.has(lw)) return { ok: false, why: "name" };
  }

  // Numbers: in one piece of the facts with what the sentence is about.
  const segs = segmentsOf(f);
  const anywhere = new Set(segs.flatMap((s) => [...s.nums]));
  const has = (set: Set<string>, n: string) => set.has(n) || set.has(String(Number(n)));
  for (const s of sentences) {
    const nums = numbersFrom(s);
    if (!nums.length) continue;
    const named = namedIn(f, s);
    for (const n of nums) {
      if (!has(anywhere, n)) return { ok: false, why: "number" };
      if (named.length && !segs.some((g) => has(g.nums, n) && named.some((e) => g.text.includes(` ${e} `)))) return { ok: false, why: "number" };
    }
  }

  // From here by clause: a list ("Match 1 v Kings: Titans won by 7 runs; Match 3 v Royals: ...") is one claim each.
  const clauses = reply.split(/(?<=[.!?;])\s+/).filter((s) => s.trim());
  const done = doneOf(f);
  for (const s of clauses) {
    const mentions = teamMentions(f, s);
    const teams = mentions.map((x) => x.name);
    const low = ` ${simple(s)} `;
    const ref = matchRefOf(s);
    const game = ref ? matchFor(f, ref) : null;

    // A team's points and its won, lost and played counts are its own row's; only the table's first team leads it.
    if (teams.length === 1 && !f.series) {
      const row = f.table.find((r) => r.team === teams[0]);
      for (const m of s.matchAll(/\b(\d+) (?:points?|pts)\b/gi)) if (!row || Number(m[1]) !== row.points) return { ok: false, why: "number" };
      for (const m of s.matchAll(/\b(won|lost|played|tied) (\d+)\b/gi)) if (!row || Number(m[2]) !== row[m[1].toLowerCase() as "won" | "lost" | "played" | "tied"]) return { ok: false, why: "number" };
      if (!NEGATED.test(s) && /\b(lead|leads|leading|top of the table|on top|table toppers?|in first place|are first|is first|sabse aage|sabse upar)\b/i.test(s) && f.table[0]?.team !== teams[0] && f.champion !== teams[0]) return { ok: false, why: "result" };
    }

    // A margin is one a finished match between the teams named had.
    for (const m of s.matchAll(/\bby (\d+) (run|wicket)s?\b/gi)) {
      const hit = done.filter((d) => new RegExp(`\\bby ${Number(m[1])} ${m[2].toLowerCase()}s?\\b`).test(d.result ?? ""));
      if (!hit.some((d) => teams.every((x) => x === d.home || x === d.away))) return { ok: false, why: "result" };
    }
    if (NEGATED.test(s) || /\?\s*$/.test(s)) continue;

    // A win or a loss: the team said just before the verb won (or lost) a finished match, the one named when one is, against the other team when one is.
    // "Won 2, lost 0" are the table's counts (checked above), "won the toss" and "lost 3 wickets" no result: blanked, the same length, so places still line up.
    const blank = (m: string) => "_".repeat(m.length);
    const counts = low.replace(/(?<= )(won|lost|played|tied) \d+(?= )/g, blank).replace(/(?<= )won the toss(?= )/g, blank).replace(/(?<= )lost (\d+|a|the|their|his|her|its|early|quick) (wickets?|batters?)(?= )/g, blank);
    for (const v of counts.matchAll(/(?<= )(beat|beats|defeated|defeats|won|win|wins|thrashed|edged|haraya|jeeta|jeeti|lost|lose|loses|haara|haari|beaten)(?= )/g)) {
      const subject = mentions.filter((x) => x.at < v.index).at(-1)?.name;
      if (!subject) continue;
      const lost = /^(lost|lose|loses|haara|haari|beaten)$/.test(v[1]);
      const other = teams.find((x) => x !== subject);
      const mine = done.filter((d) => (lost ? d.loser : d.winner) === subject && (!other || d.home === other || d.away === other));
      if (game ? !mine.includes(game) : !mine.length) return { ok: false, why: "result" };
    }
    if (teams.length && /\b(champions?|won the (tournament|title|cup|league|series|trophy)|lifted)\b/.test(low) && !teams.includes(f.champion ?? "")) return { ok: false, why: "result" };
  }
  return { ok: true };
}
