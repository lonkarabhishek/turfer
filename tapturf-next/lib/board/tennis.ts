import type { Board, BoardEvent, BoardSport, BoardView, PadAction, PointEvent, RulePreset, Side, SportEngine, TennisRules, TimelineLine } from "./types";
import { SIDES, blankView, bool, clampInt, cleanName, isObj, isSide, namesNow, oneOf, other, plural, showSideTags } from "./common";

/**
 * Tennis and padel: points, games, sets. One fold for both; padel only
 * changes the defaults and presets. The scorer taps who won the point.
 *
 * Rules followed (ITF Rules of Tennis; FIP padel rules 2026):
 *  - Game: 0, 15, 30, 40, then deuce and advantage, 2 clear (ITF 5a).
 *    Golden (tennis no-ad): at deuce the next point wins (ITF Appendix V).
 *    Star point: advantage at the first two deuces, and at the third (5-5
 *    in points) the next point wins (FIP 2026). The receivers pick the
 *    side for a golden or star point.
 *  - Set: `games` games with 2 clear; at games-all a tiebreak to 7, 2
 *    clear (ITF 5b, 6b), or with no tiebreak play on until 2 clear (6a).
 *    Match: best of 1, 3 or 5 sets (ITF 7). The deciding set may be a 10
 *    point match tiebreak, 2 clear (ITF Appendix V).
 *  - Serve: the receiver serves the next game (ITF 14). In a tiebreak the
 *    side whose turn it is serves the first point, then two each, and the
 *    side that served first in it receives first in the next set (ITF 5b):
 *    the same "other side next" as after any game.
 *  - Ends change after games 1, 3, 5... of a set, at the end of a set
 *    whose games add up to an odd number (a tiebreak counts as one), and
 *    every 6 points of a tiebreak (ITF 10; padel the same).
 */

type Pts = Record<Side, number>;
type Deuce = TennisRules["deuce"];

const zero = (): Pts => ({ a: 0, b: 0 });
const plus = (p: Pts, x: Side): Pts => (x === "a" ? { a: p.a + 1, b: p.b } : { a: p.a, b: p.b + 1 });
const lead = (p: Pts): Side | null => (p.a > p.b ? "a" : p.b > p.a ? "b" : null);
/** "6-4" from x's side. */
const from = (p: Pts, x: Side) => `${p[x]}-${p[other(x)]}`;

const TIEBREAK_TO = 7;
const MATCH_TIEBREAK_TO = 10;
/** Games a set can be played to; offered when a rules change is refused ("pick sets to 6"). */
const GAME_CHOICES = [4, 6];

/** Sets needed to win the match. */
const need = (r: TennisRules) => Math.floor(r.bestOf / 2) + 1;
/** The deciding set is set number bestOf, and only when bestOf > 1 (a single set is not "deciding"). */
const deciding = (r: TennisRules, index: number) => r.bestOf > 1 && index === r.bestOf - 1;
const matchTiebreakDue = (r: TennisRules, index: number) => r.finalSet === "match-tiebreak" && deciding(r, index);
const tiebreakDue = (r: TennisRules, g: Pts) => r.tiebreak && g.a === r.games && g.b === r.games;

/** Who has won a game at these points, if anyone. */
export function gameWinner(p: Pts, deuce: Deuce): Side | null {
  for (const x of SIDES) {
    const me = p[x];
    if (me < 4) continue;
    if (me - p[other(x)] >= 2) return x;
    // Golden: 4 points always wins, since 3-3 is the deciding point. Star: 6-5 wins, the third deuce being 5-5.
    if (deuce === "golden" || (deuce === "star" && me >= 6)) return x;
  }
  return null;
}

/** Who has won the set at these games, if anyone: 2 clear, or the tiebreak at games-all (it counts as the last game, 7-6). */
export function setWinner(g: Pts, r: Pick<TennisRules, "games" | "tiebreak">): Side | null {
  for (const x of SIDES) {
    const me = g[x];
    const them = g[other(x)];
    if (me >= r.games && me - them >= 2) return x;
    if (r.tiebreak && me === r.games + 1 && them === r.games) return x;
  }
  return null;
}

const tiebreakWinner = (p: Pts, to: number): Side | null => SIDES.find((x) => p[x] >= to && p[x] - p[other(x)] >= 2) ?? null;

/** ITF 5b: in a tiebreak `first` serves point 1, the other side points 2 and 3, and so on two each. `played` is points so far. */
export function tiebreakServer(first: Side, played: number): Side {
  return Math.floor((played + 1) / 2) % 2 === 0 ? first : other(first);
}

const CALLS = ["0", "15", "30", "40"];

/** The call for game points: "15" / "40", "40" / "40" at deuce, "AD" / "40". */
export function gameCall(p: Pts): Record<Side, string> {
  if (p.a >= 3 && p.b >= 3) {
    if (p.a === p.b) return { a: "40", b: "40" };
    return p.a > p.b ? { a: "AD", b: "40" } : { a: "40", b: "AD" };
  }
  return { a: CALLS[Math.min(p.a, 3)], b: CALLS[Math.min(p.b, 3)] };
}

/* ------------------------------------------------------------------ */
/* The match fold                                                      */
/* ------------------------------------------------------------------ */

type SetS = {
  index: number;
  games: Pts;
  winner: Side | null;
  /** A 10 point match tiebreak in place of the deciding set: tb holds its points and games stay 0-0. */
  matchTb: boolean;
  /** Tiebreak points once the set reaches games-all (all of a match tiebreak); null while games are played. */
  tb: Pts | null;
};

type Over = { winner: Side | null; how: "points" | "time" | "abandoned" | "retired" | "walkover" | "conceded" };
type Tally = Record<"points" | "aces" | "doubleFaults" | "serviceGames" | "held" | "breakChances" | "breaks", Pts>;

type Fold = {
  /** The rules in force now. */
  rules: TennisRules;
  names: Record<Side, string>;
  /** Each side's name as of the event being folded, to tell a tag-only rename from a real one. */
  spelt: Record<Side, string>;
  /** Finished sets and the one in play (last). */
  sets: SetS[];
  won: Pts;
  /** Points in the game in play; a tiebreak keeps its own on the set. */
  pts: Pts;
  /** Who serves the game in play, or in a tiebreak who serves its first point. null before the first serve is picked. */
  server: Side | null;
  needsServe: boolean;
  over: Over | null;
  lines: TimelineLine[];
  /** Notices from the last point ("Change ends"), shown until the next one. */
  said: string[];
  justEnded: { label: string; changeEnds: boolean } | null;
  changeEnds: boolean;
  tally: Tally;
  lastAction: string | null;
};

type Config = {
  sport: BoardSport;
  label: string;
  icon: string;
  defaults: TennisRules;
  presets: RulePreset<TennisRules>[];
  normalize(raw: unknown): TennisRules;
};

const cur = (f: Fold): SetS => f.sets[f.sets.length - 1];

const newSet = (r: TennisRules, index: number): SetS => {
  const matchTb = matchTiebreakDue(r, index);
  return { index, games: zero(), winner: null, matchTb, tb: matchTb ? zero() : null };
};

/** Who serves the next point, or null before the first serve. */
function serverNow(f: Fold): Side | null {
  const s = cur(f);
  if (f.server === null) return null;
  return s.tb ? tiebreakServer(f.server, s.tb.a + s.tb.b) : f.server;
}

/** No point yet in the game (or tiebreak) in play. */
const gameFresh = (f: Fold, s: SetS) => f.pts.a + f.pts.b === 0 && (!s.tb || s.tb.a + s.tb.b === 0);
/** No point yet in the set in play. */
const setFresh = (f: Fold, s: SetS) => s.games.a + s.games.b === 0 && gameFresh(f, s);
/** The game is at a golden or star point: the next point wins it from deuce. */
const decidingPoint = (f: Fold) => {
  const { a, b } = f.pts;
  return !cur(f).tb && a === b && ((f.rules.deuce === "golden" && a >= 3) || (f.rules.deuce === "star" && a >= 5));
};

/** What one more point for x would win. */
function outcome(f: Fold, x: Side): "point" | "game" | "set" | "match" {
  const s = cur(f);
  if (s.tb) {
    if (tiebreakWinner(plus(s.tb, x), s.matchTb ? MATCH_TIEBREAK_TO : TIEBREAK_TO) !== x) return "point";
  } else {
    if (gameWinner(plus(f.pts, x), f.rules.deuce) !== x) return "point";
    if (setWinner(plus(s.games, x), f.rules) !== x) return "game";
  }
  return f.won[x] + 1 >= need(f.rules) ? "match" : "set";
}

function freshFold(c: Config, board: Board): Fold {
  const rules = c.normalize(board.setup?.rules);
  return {
    rules,
    names: namesNow(board),
    spelt: { a: cleanName(board.setup?.teamA), b: cleanName(board.setup?.teamB) },
    sets: [newSet(rules, 0)],
    won: zero(),
    pts: zero(),
    server: null,
    needsServe: true,
    over: null,
    lines: [],
    said: [],
    justEnded: null,
    changeEnds: false,
    tally: { points: zero(), aces: zero(), doubleFaults: zero(), serviceGames: zero(), held: zero(), breakChances: zero(), breaks: zero() },
    lastAction: null,
  };
}

/** Stored boards are sanitized, but a stray null in events must not throw anywhere (namesNow, lastAt). */
function cleanBoard(board: Board): Board {
  const events = Array.isArray(board.events) ? board.events : [];
  return events.every(isObj) ? board : { ...board, events: events.filter(isObj) };
}

/** One pass over the events. Events check() would refuse are skipped, so a stored board derives the same as it scored. */
function fold(c: Config, board: Board): Fold {
  const f = freshFold(c, board);
  board.events.forEach((e, i) => {
    if (problem(c, f, e)) f.lastAction = null;
    else step(c, f, e, i);
  });
  return f;
}

/** Why this event cannot go in now, or null. */
function problem(c: Config, f: Fold, e: BoardEvent): string | null {
  if (!isObj(e) || typeof e.type !== "string") return "That is not a scoring event";
  switch (e.type) {
    case "rename":
      if (!isSide(e.side)) return "Pick a side";
      return cleanName(e.name) ? null : "Type a name";
    case "card":
      return `${c.label} has no cards`;
    case "foul":
      return `${c.label} has no team fouls`;
    case "clock":
      return `${c.label} has no game clock`;
    case "timeout":
      return `${c.label} has no timeouts`;
    case "period":
      return `Games and sets end by themselves in ${c.label.toLowerCase()}`;
    case "point":
    case "serve":
    case "end":
    case "rules":
      break;
    default:
      return "That is not a scoring event";
  }
  if (f.over) return f.over.how === "points" ? "The match is over. Undo to change the last point" : "The match has ended. Undo to carry on";
  const N = f.names;
  switch (e.type) {
    case "point": {
      if (!isSide(e.side)) return "Pick who won the point";
      const sv = serverNow(f);
      if (f.needsServe || !sv) return "Pick who serves first";
      if (e.value !== undefined && e.value !== 1) return "A point is worth 1";
      if (e.how === undefined) return null;
      if (e.how === "ace") return e.side === sv ? null : "An ace is a point to the server";
      if (e.how === "double-fault") return e.side !== sv ? null : "A double fault is a point to the receiver";
      return "Unknown kind of point";
    }
    case "serve":
      if (!isSide(e.side)) return "Pick who serves";
      if (e.server !== undefined) return "Server 1 or 2 is only for side-out doubles in pickleball";
      return !f.needsServe && serverNow(f) === e.side ? `${N[e.side]} is serving already` : null;
    case "end": {
      const r = e.reason;
      if (r === undefined || r === "abandoned") return null;
      if (r !== "retired" && r !== "walkover" && r !== "conceded") return "Unknown way to end the match";
      if (!isSide(e.side)) return r === "retired" ? "Pick who retired" : r === "walkover" ? "Pick who did not turn up" : "Pick who conceded";
      if (r === "walkover" && f.tally.points.a + f.tally.points.b > 0) return "Points have been played, so it is not a walkover. Pick retired or conceded";
      return null;
    }
    case "rules":
      return rulesProblem(c, f, e.rules);
  }
  return null;
}

/** The set can go on at these games under r: not won, and not past a tiebreak r would have played. */
const setLive = (g: Pts, r: TennisRules) => !setWinner(g, r) && !(r.tiebreak && Math.max(g.a, g.b) > r.games);

/**
 * A rules change applies from now on, so refuse one the score cannot
 * take: a match or set already won under it, a set or game under way
 * that would turn into something else (a match tiebreak, a tiebreak), or
 * a game that would be over at its points (advantage to golden at AD-40).
 */
function rulesProblem(c: Config, f: Fold, raw: unknown): string | null {
  if (!isObj(raw)) return "No rules to change";
  const next = c.normalize({ ...f.rules, ...raw });
  const top = Math.max(f.won.a, f.won.b);
  if (top >= need(next)) {
    const who: Side = f.won.a >= f.won.b ? "a" : "b";
    return `${f.names[who]} has won ${plural(top, "set")} already; pick best of ${2 * top + 1}`;
  }
  const s = cur(f);
  // Nothing played in this set yet: it starts afresh under the new rules.
  if (setFresh(f, s)) return null;
  if (matchTiebreakDue(next, s.index) !== s.matchTb) return s.matchTb ? "The match tiebreak has started, so it stays" : `Set ${s.index + 1} has started, so it stays a full set`;
  if (s.matchTb) return null;
  if (!setLive(s.games, next)) {
    const score = `${Math.max(s.games.a, s.games.b)}-${Math.min(s.games.a, s.games.b)}`;
    if (!setWinner(s.games, next)) return `Games are ${score} already, too late for a tiebreak at ${next.games}-${next.games}`;
    const fit = GAME_CHOICES.find((g) => setLive(s.games, c.normalize({ ...next, games: g })));
    return fit ? `Games are ${score} already; pick sets to ${fit}` : `Games are ${score} already, so that would end this set`;
  }
  if (gameFresh(f, s)) return null;
  if (tiebreakDue(next, s.games) !== (s.tb !== null)) return s.tb ? "The tiebreak has started; change that after this set" : `Games are ${from(s.games, "a")} and this game has started; change that after this set`;
  if (!s.tb && gameWinner(f.pts, next.deuce)) {
    const call = gameCall(f.pts);
    return `This game is at ${call.a}-${call.b}; change that after it`;
  }
  return null;
}

function step(c: Config, f: Fold, e: BoardEvent, i: number) {
  const s = cur(f);
  const N = f.names;
  const line = (side: Side | null, text: string, tone: TimelineLine["tone"], score: string | null = setScore(s)) =>
    f.lines.push({ key: i, side, text, when: null, period: s.index, tone, score });
  switch (e.type) {
    case "point":
      playPoint(f, e, i);
      return;
    case "serve": {
      const first = f.needsServe;
      // ITF 27: a serve out of turn is put right from the next point. A game has one server, so it is the game's
      // server from now. A tiebreak's order is fixed by its first server, so the scorer had that wrong: flip it,
      // and the next set's first server follows from the fixed one.
      if (first || !s.tb) f.server = e.side;
      else if (serverNow(f) !== e.side) f.server = other(f.server ?? e.side);
      f.needsServe = false;
      // Picking the server is the scorer getting on with the next set.
      f.justEnded = null;
      line(e.side, first ? `${N[e.side]} serves first` : `${N[e.side]} to serve`, "info");
      f.lastAction = `${N[e.side]} serves`;
      return;
    }
    case "rename": {
      const name = cleanName(e.name);
      // A change of tag alone carries the current name: no "Name changed" line, and never a username in the text.
      if (name === f.spelt[e.side] && e.tag !== undefined) {
        f.lastAction = e.tag ? `${name} tagged` : `Tag removed, ${name}`;
        return;
      }
      f.spelt[e.side] = name;
      line(e.side, `Name changed to ${name}`, "info", null);
      f.lastAction = `Renamed ${name}`;
      return;
    }
    case "rules": {
      f.rules = c.normalize({ ...f.rules, ...e.rules });
      // A set with nothing played starts under the new rules (a match tiebreak or not), and so does a game with nothing played (a tiebreak or not).
      if (setFresh(f, s)) {
        s.matchTb = matchTiebreakDue(f.rules, s.index);
        s.tb = s.matchTb ? zero() : null;
      } else if (!s.matchTb && gameFresh(f, s)) s.tb = tiebreakDue(f.rules, s.games) ? zero() : null;
      line(null, `Rules changed: ${describe(f.rules)}`, "info", null);
      f.lastAction = "Rules changed";
      return;
    }
    case "end": {
      const r = e.reason;
      // retired, walkover, conceded: e.side stops and the other side wins (ITF and FIP: a player who cannot go on loses).
      const quit = (r === "retired" || r === "walkover" || r === "conceded") && e.side ? e.side : null;
      if (r === "abandoned") {
        f.over = { winner: null, how: "abandoned" };
        f.lastAction = "Match abandoned";
      } else if (quit && r) {
        f.over = { winner: other(quit), how: r };
        f.lastAction = r === "walkover" ? `Walkover to ${N[other(quit)]}` : `${N[quit]} ${r}`;
      } else {
        // No reason: the court hour is up. Decide on sets, then games in the unfinished set, then points in the unfinished game.
        f.over = { winner: lead(f.won) ?? lead(s.games) ?? lead(s.tb ?? f.pts), how: "time" };
        f.lastAction = "Match ended, time up";
      }
      f.needsServe = false;
      f.said = [];
      f.justEnded = null;
      f.changeEnds = false;
      line(f.over.winner, resultOf(f).text, "end", null);
      return;
    }
  }
}

/** The set's score for the timeline: games, or a match tiebreak's points. */
const setScore = (s: SetS) => from(s.matchTb && s.tb ? s.tb : s.games, "a");

/** "6-4", "7-6 (7-5)" or "[10-8]" from x's side. A tiebreak shows only once the set is over. */
function setText(s: SetS, x: Side): string {
  if (s.matchTb) return `[${from(s.tb ?? zero(), x)}]`;
  return `${from(s.games, x)}${s.winner && s.tb ? ` (${from(s.tb, x)})` : ""}`;
}
const setsText = (sets: SetS[], x: Side) => sets.map((s) => setText(s, x)).join(", ");
/** Sets that were played: finished ones and one in play with a game (or match tiebreak point) in it. */
const played = (f: Fold) => f.sets.filter((s) => s.winner || s.games.a + s.games.b > 0 || (s.matchTb && s.tb && s.tb.a + s.tb.b > 0));

function playPoint(f: Fold, e: PointEvent, i: number) {
  const s = cur(f);
  const N = f.names;
  const won = e.side;
  const server = serverNow(f) ?? won;
  const t = f.tally;
  t.points[won]++;
  if (e.how === "ace") t.aces[server]++;
  if (e.how === "double-fault") t.doubleFaults[server]++;
  f.said = [];
  f.justEnded = null;
  f.changeEnds = false;
  f.lastAction = e.how === "ace" ? `Ace, ${N[won]}` : e.how === "double-fault" ? `Double fault, ${N[server]}` : `Point, ${N[won]}`;

  if (s.tb) {
    s.tb[won]++;
    const w = tiebreakWinner(s.tb, s.matchTb ? MATCH_TIEBREAK_TO : TIEBREAK_TO);
    if (w) {
      if (!s.matchTb) s.games[w]++;
      endSet(f, w, i);
    } else if ((s.tb.a + s.tb.b) % 6 === 0) {
      // ITF 10: in a tiebreak, ends change after every 6 points.
      f.changeEnds = true;
      f.said.push("Change ends");
    }
    return;
  }

  const receiver = other(server);
  // A break point: the receiver would win the game with this point.
  if (gameWinner(plus(f.pts, receiver), f.rules.deuce) === receiver) {
    t.breakChances[receiver]++;
    if (won === receiver) t.breaks[receiver]++;
  }
  f.pts[won]++;
  const gw = gameWinner(f.pts, f.rules.deuce);
  if (!gw) return;
  s.games[gw]++;
  f.pts = zero();
  t.serviceGames[server]++;
  if (gw === server) t.held[server]++;
  const sw = setWinner(s.games, f.rules);
  if (sw) {
    endSet(f, sw, i);
    return;
  }
  // ITF 14: the receiver serves the next game.
  f.server = other(server);
  if (tiebreakDue(f.rules, s.games)) s.tb = zero();
  // ITF 10: ends change after the 1st, 3rd and every odd game of a set.
  if ((s.games.a + s.games.b) % 2 === 1) {
    f.changeEnds = true;
    f.said.push("Change ends");
  }
  // One timeline line a game, not a point: a set is 60 points or more, and the header shows the points.
  f.lines.push({ key: i, side: gw, text: gw === server ? `Game to ${N[gw]}` : `Game to ${N[gw]}, break of serve`, when: null, period: s.index, tone: "score", score: setScore(s) });
  f.lastAction = `Game to ${N[gw]}`;
}

/** The set in play goes to w (its games, or the match tiebreak's points, already counted). */
function endSet(f: Fold, w: Side, i: number) {
  const s = cur(f);
  const N = f.names;
  s.winner = w;
  f.won[w]++;
  f.pts = zero();
  // ITF 14 and 5b: the other side serves next. After a tiebreak, f.server is the side that served its first point.
  f.server = f.server === null ? null : other(f.server);
  const line = (text: string, tone: TimelineLine["tone"]) => f.lines.push({ key: i, side: w, text, when: null, period: s.index, tone, score: setScore(s) });
  if (f.won[w] >= need(f.rules)) {
    f.over = { winner: w, how: "points" };
    line(`Match to ${N[w]}, ${setsText(played(f), w)}`, "end");
    f.lastAction = `Match to ${N[w]}`;
    return;
  }
  f.sets.push(newSet(f.rules, s.index + 1));
  // ITF 10: ends change at the end of a set whose games add up to odd (7-6 is 13); after an even one, after the next set's first game.
  const changeEnds = (s.games.a + s.games.b) % 2 === 1;
  f.justEnded = { label: `Set ${s.index + 1} to ${N[w]}, ${setText(s, w)}`, changeEnds };
  if (changeEnds) f.said.push("Change ends");
  line(f.justEnded.label, "score");
  f.lastAction = `Set ${s.index + 1} to ${N[w]}`;
}

/* ------------------------------------------------------------------ */
/* Turning the fold into the view                                      */
/* ------------------------------------------------------------------ */

/** What decided a time-up win when sets and games were level: "tiebreak 5-3" or "30-15 in game 5", from w's side. */
function decidedBy(f: Fold, w: Side): string | null {
  const s = cur(f);
  if (lead(f.won) || s.winner || s.matchTb || lead(s.games)) return null;
  if (s.tb) return `tiebreak ${from(s.tb, w)}`;
  if (!lead(f.pts)) return null;
  const call = gameCall(f.pts);
  return `${call[w]}-${call[other(w)]} in game ${s.games.a + s.games.b + 1}`;
}

function resultOf(f: Fold): { winner: Side | null; kind: "win" | "draw" | "abandoned"; text: string; headline: string } {
  const o = f.over ?? { winner: null, how: "abandoned" };
  const N = f.names;
  const sets = played(f);
  const w = o.winner;
  // Time up decided inside the set in play: the points that decided it go in too ("6-6, tiebreak 5-3").
  const tail = o.how === "time" && w ? decidedBy(f, w) : null;
  const list = (x: Side) => {
    const parts = [...(sets.length ? [setsText(sets, x)] : []), ...(tail ? [tail] : [])];
    return parts.length ? ` (${parts.join(", ")})` : "";
  };
  if (o.how === "abandoned" || (!w && o.how !== "time")) return { winner: null, kind: "abandoned", text: `Abandoned${list("a")}`, headline: `${N.a} vs ${N.b} abandoned${list("a")}` };
  if (!w) return { winner: null, kind: "draw", text: `Drawn, time up${list("a")}`, headline: `${N.a} and ${N.b} drew, time up${list("a")}` };
  const l = other(w);
  switch (o.how) {
    case "walkover":
      return { winner: w, kind: "win", text: `${N[w]} won by walkover`, headline: `${N[w]} beat ${N[l]} by walkover` };
    case "retired":
    case "conceded": {
      const text = `${N[w]} won, ${N[l]} ${o.how}${list(w)}`;
      return { winner: w, kind: "win", text, headline: text };
    }
    case "time":
      return { winner: w, kind: "win", text: `${N[w]} won, time up${list(w)}`, headline: `${N[w]} beat ${N[l]}, time up${list(w)}` };
    default:
      // Tennis writes a result as the sets from the winner's side: "6-4, 7-6 (7-5)".
      return { winner: w, kind: "win", text: `${N[w]} won ${setsText(sets, w)}`, headline: `${N[w]} beat ${N[l]} ${setsText(sets, w)}` };
  }
}

/** "Asha leads Ravi 1-0 (6-4, 3-2)": sets first, then games in the set in play. */
function headlineOf(f: Fold): string {
  const N = f.names;
  const s = cur(f);
  const sets = played(f);
  if (!sets.length) return `${N.a} vs ${N.b}`;
  const bySets = lead(f.won);
  if (bySets) return `${N[bySets]} leads ${N[other(bySets)]} ${from(f.won, bySets)} (${setsText(sets, bySets)})`;
  const single = f.rules.bestOf === 1;
  const inPlay = s.matchTb && s.tb ? s.tb : s.games;
  const byGames = s.winner ? null : lead(inPlay);
  const before = sets.filter((x) => x !== s);
  if (byGames) {
    const where = single ? "" : s.matchTb ? " in the match tiebreak" : ` in set ${s.index + 1}`;
    return `${N[byGames]} leads ${N[other(byGames)]} ${from(inPlay, byGames)}${where}${before.length ? ` (${setsText(before, byGames)})` : ""}`;
  }
  if (single) return `${N.a} ${from(s.games, "a")} ${N.b}`;
  return `${N.a} ${from(f.won, "a")} ${N.b} (${setsText(sets, "a")})`;
}

function noticesOf(f: Fold): string[] {
  const out: string[] = [];
  const s = cur(f);
  if (!f.needsServe && serverNow(f)) {
    for (const x of SIDES) {
      const o = outcome(f, x);
      if (o === "match") out.push(`Match point ${f.names[x]}`);
      else if (o === "set") out.push(`Set point ${f.names[x]}`);
    }
    const { a, b } = f.pts;
    if (!s.tb && a === b && a >= 3) {
      if (decidingPoint(f)) out.push(f.rules.deuce === "golden" ? "Golden point, receivers pick the side" : "Star point, receivers pick the side");
      // FIP 2026: the star point comes at the third deuce, so say when the next one is it.
      else if (f.rules.deuce === "star" && a === 4) out.push("Deuce, star point at the next deuce");
      else out.push("Deuce");
    }
  }
  for (const n of f.said) if (!out.includes(n)) out.push(n);
  return out;
}

function statsOf(f: Fold): BoardView["stats"] {
  const t = f.tally;
  if (t.points.a + t.points.b === 0) return [];
  const sum = (k: keyof Tally) => t[k].a + t[k].b;
  const row = (label: string, p: Pts) => ({ label, a: String(p.a), b: String(p.b) });
  const of = (label: string, won: Pts, all: Pts) => ({ label, a: `${won.a} of ${all.a}`, b: `${won.b} of ${all.b}` });
  const games = { a: 0, b: 0 };
  for (const s of f.sets) if (!s.matchTb) for (const x of SIDES) games[x] += s.games[x];
  const rows = [row("Points won", t.points), row("Games won", games)];
  if (sum("serviceGames")) rows.push(of("Service games won", t.held, t.serviceGames));
  if (sum("breakChances")) rows.push(of("Break points won", t.breaks, t.breakChances));
  if (sum("aces")) rows.push(row("Aces", t.aces));
  if (sum("doubleFaults")) rows.push(row("Double faults", t.doubleFaults));
  return rows;
}

/** One view.sets entry. A match tiebreak is its points, written [10-8]. */
function setEntry(s: SetS): BoardView["sets"][number] {
  if (s.matchTb) return { a: s.tb?.a ?? 0, b: s.tb?.b ?? 0, winner: s.winner, tiebreak: null, matchTiebreak: true };
  return { a: s.games.a, b: s.games.b, winner: s.winner, tiebreak: s.winner && s.tb ? { ...s.tb } : null };
}

/** ITF 17: every game starts from the right half and alternates each point; a tiebreak the same over its points. */
function serveNoteOf(f: Fold): string {
  if (decidingPoint(f)) return "Receivers pick the side";
  const s = cur(f);
  const n = s.tb ? s.tb.a + s.tb.b : f.pts.a + f.pts.b;
  return n % 2 === 0 ? "Right court" : "Left court";
}

function deriveWith(c: Config, raw: Board): BoardView {
  const board = cleanBoard(raw);
  const f = fold(c, board);
  const r = f.rules;
  const multi = r.bestOf > 1;
  const v = blankView(board, c.label, multi ? "Sets" : "Games");
  const s = cur(f);
  const live = !f.over;
  v.status = live ? "live" : "done";
  v.setup = { ...v.setup, rules: r };
  showSideTags(v);
  v.teams.a.score = multi ? f.won.a : s.games.a;
  v.teams.b.score = multi ? f.won.b : s.games.b;
  if (live) {
    v.current = s.tb ? { a: String(s.tb.a), b: String(s.tb.b) } : gameCall(f.pts);
    v.currentLabel = s.matchTb ? "Match tiebreak" : s.tb ? "Tiebreak" : `Game ${s.games.a + s.games.b + 1}${multi ? `, set ${s.index + 1}` : ""}`;
  }
  v.server = live && !f.needsServe ? serverNow(f) : null;
  v.serveNote = v.server ? serveNoteOf(f) : null;
  v.needsServe = live && f.needsServe;
  v.sets = (live ? f.sets : played(f)).map(setEntry);
  v.timeline = f.lines;
  v.stats = statsOf(f);
  v.notices = live ? noticesOf(f) : [];
  v.gameJustEnded = live ? f.justEnded : null;
  v.changeEnds = live && f.changeEnds;
  if (f.over) {
    const res = resultOf(f);
    v.result = { winner: res.winner, kind: res.kind, text: res.text };
    v.headline = res.headline;
  } else v.headline = headlineOf(f);
  v.lastAction = f.lastAction;
  v.eventCount = Array.isArray(raw.events) ? raw.events.length : 0;
  return v;
}

/** What tapping "won the point" for x would do, for the button's second line. */
function pointSub(f: Fold, x: Side): string {
  switch (outcome(f, x)) {
    case "match":
      return "Wins the match";
    case "set":
      return `Wins set ${cur(f).index + 1}`;
    case "game":
      return "Wins the game";
    default:
      return "Point";
  }
}

function padWith(c: Config, raw: Board): PadAction[] {
  const f = fold(c, cleanBoard(raw));
  if (f.over) return [];
  const N = f.names;
  const out: PadAction[] = [];
  const sv = serverNow(f);
  if (f.needsServe || !sv) {
    for (const x of SIDES) out.push({ id: `serve-${x}`, side: x, label: `${N[x]} serves first`, tone: "primary", event: { type: "serve", side: x } });
  } else {
    // A column always means "this side won the point": the event's side is the action's side.
    for (const x of SIDES) out.push({ id: `point-${x}`, side: x, label: "Won the point", sub: pointSub(f, x), tone: "primary", event: { type: "point", side: x } });
    out.push({ id: "fix-serve", side: null, label: "Change server", sub: `${N[other(sv)]} to serve`, tone: "plain", event: { type: "serve", side: other(sv) } });
  }
  const started = f.tally.points.a + f.tally.points.b > 0;
  for (const x of SIDES) {
    out.push(
      started
        ? { id: `retire-${x}`, side: null, label: `${N[x]} retired`, sub: `${N[other(x)]} wins`, tone: "warn", event: { type: "end", reason: "retired", side: x } }
        : { id: `walkover-${x}`, side: null, label: `${N[x]} did not turn up`, sub: `Walkover to ${N[other(x)]}`, tone: "warn", event: { type: "end", reason: "walkover", side: x } },
    );
  }
  out.push({ id: "end", side: null, label: "End match", sub: "Time up, result on the score", tone: "warn", event: { type: "end" } });
  out.push({ id: "abandon", side: null, label: "Abandon", sub: "No result", tone: "danger", event: { type: "end", reason: "abandoned" } });
  return out;
}

/* ------------------------------------------------------------------ */
/* Rules, presets and the two engines                                  */
/* ------------------------------------------------------------------ */

/** Fill every TennisRules field from raw, falling back to the sport's defaults. Never throws. */
function normalizeTennis(d: TennisRules, raw: unknown): TennisRules {
  const r = isObj(raw) ? raw : {};
  const bestOf = oneOf(r.bestOf, [1, 3, 5], d.bestOf);
  return {
    bestOf,
    // 6, or 4 for short sets (ITF Appendix V); up to 8 for a pro set.
    games: clampInt(r.games, 4, 8, d.games),
    tiebreak: bool(r.tiebreak, d.tiebreak),
    // A single set is not a deciding set, so it is never a match tiebreak.
    finalSet: bestOf === 1 ? "normal" : oneOf(r.finalSet, ["normal", "match-tiebreak"] as const, d.finalSet),
    deuce: oneOf(r.deuce, ["advantage", "golden", "star"] as const, d.deuce),
    doubles: bool(r.doubles, d.doubles),
  };
}

/** "best of 3 sets to 6 games, tiebreak at 6-6, advantage", for the timeline. */
function describe(r: TennisRules): string {
  const sets = r.bestOf === 1 ? `1 set to ${r.games} games` : `best of ${r.bestOf} sets to ${r.games} games`;
  const tb = r.tiebreak ? `tiebreak at ${r.games}-${r.games}` : "no tiebreak";
  const last = r.finalSet === "match-tiebreak" ? ", match tiebreak to 10 for the last set" : "";
  const deuce = r.deuce === "golden" ? "golden point" : r.deuce === "star" ? "star point" : "advantage";
  return `${sets}, ${tb}${last}, ${deuce}`;
}

const MATCH: RulePreset<TennisRules> = {
  key: "match",
  label: "Match",
  options: [
    { label: "Best of 3", rules: { bestOf: 3 } },
    { label: "1 set", rules: { bestOf: 1 } },
    { label: "Best of 5", rules: { bestOf: 5 } },
  ],
};
const FINAL: RulePreset<TennisRules> = {
  key: "final",
  label: "Deciding set",
  options: [
    { label: "Full set", rules: { finalSet: "normal" } },
    { label: "Match tiebreak to 10", rules: { finalSet: "match-tiebreak" } },
  ],
};
const GAMES: RulePreset<TennisRules> = {
  key: "games",
  label: "Sets to",
  options: [
    { label: "6 games", rules: { games: 6 } },
    { label: "4 games (short sets)", rules: { games: 4 } },
  ],
};
const TIEBREAK: RulePreset<TennisRules> = {
  key: "tiebreak",
  label: "At games all",
  options: [
    { label: "Tiebreak to 7", rules: { tiebreak: true } },
    { label: "Play on, 2 clear", rules: { tiebreak: false } },
  ],
};

function makeEngine(c: Omit<Config, "normalize">): SportEngine<TennisRules> {
  const config: Config = { ...c, normalize: (raw) => normalizeTennis(c.defaults, raw) };
  return {
    sport: c.sport,
    label: c.label,
    icon: c.icon,
    defaults: c.defaults,
    normalizeRules: config.normalize,
    presets: c.presets,
    check: (board, event) => problem(config, fold(config, cleanBoard(board)), event),
    derive: (board) => deriveWith(config, board),
    pad: (board) => padWith(config, board),
  };
}

export const tennisEngine: SportEngine<TennisRules> = makeEngine({
  sport: "tennis",
  label: "Tennis",
  icon: "🎾",
  // ITF 5 to 7: best of 3 tiebreak sets to 6, advantage games.
  defaults: { bestOf: 3, games: 6, tiebreak: true, finalSet: "normal", deuce: "advantage", doubles: false },
  presets: [
    {
      key: "players",
      label: "Players",
      options: [
        { label: "Singles", rules: { doubles: false } },
        { label: "Doubles", rules: { doubles: true } },
      ],
    },
    MATCH,
    FINAL,
    {
      key: "deuce",
      label: "At deuce",
      options: [
        { label: "Advantage", rules: { deuce: "advantage" } },
        // ITF Appendix V no-ad: the next point at deuce wins the game.
        { label: "No-ad", rules: { deuce: "golden" } },
      ],
    },
    GAMES,
    TIEBREAK,
  ],
});

export const padelEngine: SportEngine<TennisRules> = makeEngine({
  sport: "padel",
  label: "Padel",
  icon: "🎾",
  // FIP 2026: doubles, best of 3 tiebreak sets to 6, star point at the third deuce.
  defaults: { bestOf: 3, games: 6, tiebreak: true, finalSet: "normal", deuce: "star", doubles: true },
  presets: [
    {
      key: "players",
      label: "Players",
      options: [
        { label: "Doubles", rules: { doubles: true } },
        { label: "Singles", rules: { doubles: false } },
      ],
    },
    MATCH,
    FINAL,
    {
      key: "deuce",
      label: "At deuce",
      options: [
        { label: "Star point", rules: { deuce: "star" } },
        { label: "Golden point", rules: { deuce: "golden" } },
        { label: "Advantage", rules: { deuce: "advantage" } },
      ],
    },
    GAMES,
    TIEBREAK,
  ],
});
