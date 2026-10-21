import type {
  AnyRules,
  Board,
  BoardEvent,
  BoardSport,
  BoardView,
  PadAction,
  PointEvent,
  RallyRules,
  RulePreset,
  ServeEvent,
  Side,
  SportEngine,
  TimelineLine,
} from "./types";
import { SIDES, blankView, bool, clampInt, cleanName, isObj, isSide, namesNow, num, oneOf, other, plural, showSideTags } from "./common";

/**
 * Rally point sports: badminton, volleyball and table tennis, one fold
 * configured per sport. Pickleball (lib/board/pickleball.ts) plugs its
 * side-out scoring into the same fold through a Kit.
 *
 * The scorer taps who won the rally. Rules followed:
 *  - A game (set) is won at `points` with a lead of `winBy`, or at `cap`
 *    outright (badminton: 29-all, the 30th point wins, Law 7.5; 20-all
 *    and 21 in 15-point games). The match is won by the first to win
 *    more than half of bestOf.
 *  - The deciding game is game number bestOf, and only when bestOf > 1:
 *    volleyball plays it to 15 after a new toss (FIVB 6.3.2, 12.1.1).
 *  - Serve: badminton and volleyball, the rally winner serves next. Table
 *    tennis, every 2 points, and every point from 10-10 (ITTF 2.13.3).
 *  - Next game: badminton, the game's winner serves first (Law 7.6);
 *    volleyball and table tennis, the side that received first (FIVB
 *    12.1.2, ITTF 2.13.6).
 *  - Ends change after every game, and once in the deciding game:
 *    badminton when the leader reaches 11 (8 in 15-point games, Law
 *    8.1.3), table tennis at 5 (ITTF 2.13.7), volleyball at 8 (FIVB
 *    18.2.2), but not before a deciding set that has a new toss.
 *  - Badminton serves from the right court on an even score, left on an
 *    odd one (Laws 10.1 and 11.1), with a 60 second interval when the
 *    leader reaches 11 (8) in every game (Law 16.2.1).
 */

/* ------------------------------------------------------------------ */
/* The shared match fold                                               */
/* ------------------------------------------------------------------ */

/** Who serves the next rally. num: side-out doubles pickleball's server 1 or 2, 1 everywhere else. */
export type Serving = { side: Side; num: 1 | 2 };

/** One game or set as the fold keeps it. */
export type GameS = {
  index: number;
  pts: Record<Side, number>;
  winner: Side | null;
  /** Who served the game's first rally. null until picked (the deciding-set toss). */
  first: Serving | null;
  /** first came from the scorer (a serve event before the first rally: the first serve, a toss, Change server, Fix server number), not the engine. */
  chosen: boolean;
  /** Rallies played, which is more than the points in side-out pickleball. */
  rallies: number;
  timeouts: Record<Side, number>;
};

type Over = { winner: Side | null; how: "points" | "time" | "abandoned" | "retired" | "walkover" | "conceded" };
type Tally = Record<"points" | "rallies" | "served" | "servedWon" | "aces" | "timeouts" | "longest", Record<Side, number>>;

export type GameFold<R> = {
  /** The rules in force now. */
  rules: R;
  names: Record<Side, string>;
  /** Finished games and the one in play (last). */
  games: GameS[];
  won: Record<Side, number>;
  /** Who serves the next rally; null before the first serve is picked and after the match. */
  serving: Serving | null;
  needsServe: boolean;
  over: Over | null;
  lines: TimelineLine[];
  /** Notices from the last rally ("Change ends", "Side out"), shown until the next one. */
  said: string[];
  justEnded: { label: string; changeEnds: boolean } | null;
  changeEnds: boolean;
  tally: Tally;
  run: { side: Side | null; n: number };
  lastAction: string | null;
};

/** The numbers every game sport shares. */
export type Shape = { points: number; winBy: number; cap: number | null; bestOf: number; decidingPoints: number | null };

/** What a sport plugs into the shared fold. Every function is pure apart from correctServe, which may move g.first. */
export type Kit<R extends AnyRules> = {
  sport: BoardSport;
  label: string;
  icon: string;
  /** What one game is called: "Game" or "Set". */
  unit: "Game" | "Set";
  defaults: R;
  normalizeRules(raw: unknown): R;
  presets: RulePreset<R>[];
  /** Points offered when a rules change is refused ("pick 21"). */
  pointChoices: number[];
  shape(r: R): Shape;
  /** The rally went to `won`: who scores (null: nobody, the serve just moves) and a notice for it ("Side out"). */
  rally(f: GameFold<R>, g: GameS, won: Side): { point: Side | null; note: string | null };
  /** Who serves next. The point is already counted; f.serving is still the server of that rally. */
  serveAfter(f: GameFold<R>, g: GameS, won: Side): Serving;
  /** The first server, picked before a game's first rally. */
  firstServe(f: GameFold<R>, e: ServeEvent): Serving;
  /** A serve event once the game is under way: the scorer had the server wrong. */
  correctServe(f: GameFold<R>, g: GameS, e: ServeEvent): Serving;
  /** After a rules change: who serves now (table tennis re-reads the rotation). */
  resync(f: GameFold<R>, g: GameS): Serving | null;
  /** First server of the game after `prev`, or null for a new toss. */
  nextGame(f: GameFold<R>, prev: GameS): Serving | null;
  /** Server numbers 1 and 2 are used (side-out doubles pickleball). */
  numbered(r: R): boolean;
  serveNote(f: GameFold<R>, g: GameS): string | null;
  /** The deciding game's change of ends comes when the leader first reaches this. */
  endsAt(target: number): number;
  /** Ends change before game `next` (0-based). */
  endsBefore(f: GameFold<R>, next: number): boolean;
  /** Extra notices on a point (badminton's interval). */
  pointNotes(f: GameFold<R>, g: GameS, point: Side, endsNow: boolean): string[];
  /** Notices that follow from the score (table tennis deuce). */
  stateNotes(f: GameFold<R>, g: GameS): string[];
  timeouts(r: R): { max: number; per: "game" | "match" } | null;
  /** Side-out scoring: rallies won are not points won, and every point is won on serve. */
  sideOut(r: R): boolean;
  /** "best of 3 to 21 (cap 30)", for the timeline. */
  describe(r: R): string;
};

const cur = <R>(f: GameFold<R>): GameS => f.games[f.games.length - 1];

const newGame = (index: number): GameS => ({ index, pts: { a: 0, b: 0 }, winner: null, first: null, chosen: false, rallies: 0, timeouts: { a: 0, b: 0 } });

/** Games needed to win the match. */
const need = (s: Shape) => Math.floor(s.bestOf / 2) + 1;

/** The deciding game is game number bestOf, and only when bestOf > 1 (a single game is not "deciding"). */
export const deciding = (s: Shape, index: number) => s.bestOf > 1 && index === s.bestOf - 1;

export const targetOf = (s: Shape, index: number) => (deciding(s, index) && s.decidingPoints !== null ? s.decidingPoints : s.points);

/** Who has won game `index` at this score, if anyone. */
export function gameWinner(s: Shape, index: number, pts: Record<Side, number>): Side | null {
  const target = targetOf(s, index);
  for (const x of SIDES) {
    const me = pts[x];
    if (me >= target && me - pts[other(x)] >= s.winBy) return x;
    if (s.cap !== null && s.cap > target && me >= s.cap) return x;
  }
  return null;
}

/** Would one more point win the game for `side`? */
export function wouldWin<R extends AnyRules>(kit: Kit<R>, f: GameFold<R>, g: GameS, side: Side): boolean {
  const pts = { ...g.pts };
  pts[side]++;
  return gameWinner(kit.shape(f.rules), g.index, pts) === side;
}

/** "21-17" from `from`'s side. */
const scoreFrom = (p: Record<Side, number>, from: Side) => `${p[from]}-${p[other(from)]}`;
const lead = (p: Record<Side, number>): Side | null => (p.a > p.b ? "a" : p.b > p.a ? "b" : null);
/** Games that were played at all: finished ones and an unfinished one with a rally in it. */
const played = <R>(f: GameFold<R>) => f.games.filter((g) => g.rallies > 0 || g.winner);
const setsText = (games: GameS[], from: Side) => games.map((g) => scoreFrom(g.pts, from)).join(", ");
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function freshFold<R extends AnyRules>(kit: Kit<R>, board: Board): GameFold<R> {
  const zero = () => ({ a: 0, b: 0 });
  return {
    rules: kit.normalizeRules(board.setup?.rules),
    names: namesNow(board),
    games: [newGame(0)],
    won: zero(),
    serving: null,
    needsServe: true,
    over: null,
    lines: [],
    said: [],
    justEnded: null,
    changeEnds: false,
    tally: { points: zero(), rallies: zero(), served: zero(), servedWon: zero(), aces: zero(), timeouts: zero(), longest: zero() },
    run: { side: null, n: 0 },
    lastAction: null,
  };
}

/** Stored boards are sanitized, but a stray null in events must not throw anywhere (namesNow, lastAt). */
function cleanBoard(board: Board): Board {
  const events = Array.isArray(board.events) ? board.events : [];
  return events.every(isObj) ? board : { ...board, events: events.filter(isObj) };
}

/** One pass over the events. Events check() would refuse are skipped, so a stored board derives the same as it scored. */
function fold<R extends AnyRules>(kit: Kit<R>, board: Board): GameFold<R> {
  const f = freshFold(kit, board);
  board.events.forEach((e, i) => {
    if (problem(kit, f, e)) f.lastAction = null;
    else step(kit, f, e, i);
  });
  return f;
}

/** Why this event cannot go in now, or null. */
function problem<R extends AnyRules>(kit: Kit<R>, f: GameFold<R>, e: BoardEvent): string | null {
  if (!isObj(e) || typeof e.type !== "string") return "That is not a scoring event";
  switch (e.type) {
    case "rename":
      if (!isSide(e.side)) return "Pick a side";
      return cleanName(e.name) ? null : "Type a name";
    case "card":
      return `${kit.label} has no cards`;
    case "foul":
      return `${kit.label} has no team fouls`;
    case "clock":
      return `${kit.label} has no game clock`;
    case "period":
      return `${kit.unit}s end by themselves in ${kit.label.toLowerCase()}`;
    case "point":
    case "serve":
    case "timeout":
    case "end":
    case "rules":
      break;
    default:
      return "That is not a scoring event";
  }
  if (f.over) return f.over.how === "points" ? "The match is over. Undo to change the last point" : "The match has ended. Undo to carry on";
  const g = cur(f);
  const N = f.names;
  switch (e.type) {
    case "point": {
      if (!isSide(e.side)) return "Pick who won the rally";
      if (f.needsServe || !f.serving) return "Pick who serves first";
      if (e.value !== undefined && e.value !== 1) return "A rally is worth 1 point";
      if (e.how === undefined) return null;
      if (e.how === "ace") return e.side === f.serving.side ? null : "An ace is a point to the server";
      if (e.how === "double-fault") return `${kit.label} has one serve, so there is no double fault`;
      return "Unknown kind of point";
    }
    case "serve": {
      if (!isSide(e.side)) return "Pick who serves";
      if (e.server !== undefined) {
        if (!kit.numbered(f.rules)) return "Server 1 or 2 is only for side-out doubles in pickleball";
        if (e.server !== 1 && e.server !== 2) return "Server is 1 or 2";
      }
      const sv = f.serving;
      if (!f.needsServe && sv && sv.side === e.side && (e.server === undefined || e.server === sv.num)) return `${N[e.side]} is serving already`;
      return null;
    }
    case "timeout": {
      const t = kit.timeouts(f.rules);
      if (!t) return `${kit.label} has no timeouts`;
      if (!isSide(e.side)) return "Pick a side";
      const used = t.per === "game" ? g.timeouts[e.side] : f.tally.timeouts[e.side];
      if (used < t.max) return null;
      if (t.per === "match") return `${N[e.side]} has used ${t.max === 1 ? "the timeout" : `all ${t.max} timeouts`} for the match`;
      return `${N[e.side]} has used ${t.max === 2 ? "both timeouts" : `all ${t.max} timeouts`} this ${kit.unit.toLowerCase()}`;
    }
    case "end": {
      const r = e.reason;
      if (r === undefined || r === "abandoned") return null;
      if (r !== "retired" && r !== "walkover" && r !== "conceded") return "Unknown way to end the match";
      if (!isSide(e.side)) return r === "retired" ? "Pick who retired" : r === "walkover" ? "Pick who did not turn up" : "Pick who conceded";
      if (r === "walkover" && f.games.some((x) => x.rallies > 0)) return "Points have been played, so it is not a walkover. Pick retired or conceded";
      return null;
    }
    case "rules":
      return rulesProblem(kit, f, e.rules);
  }
  return null;
}

/** A rules change applies from now on, so refuse one that would end the current game or the match on the spot. */
function rulesProblem<R extends AnyRules>(kit: Kit<R>, f: GameFold<R>, raw: unknown): string | null {
  if (!isObj(raw)) return "No rules to change";
  const next = kit.normalizeRules({ ...f.rules, ...raw });
  const s = kit.shape(next);
  const top = Math.max(f.won.a, f.won.b);
  if (top >= need(s)) {
    const who = f.won.a >= f.won.b ? "a" : "b";
    return `${f.names[who]} has won ${plural(top, kit.unit.toLowerCase())} already; pick best of ${2 * top + 1}`;
  }
  const g = cur(f);
  if (!gameWinner(s, g.index, g.pts)) return null;
  const hi = Math.max(g.pts.a, g.pts.b);
  const lo = Math.min(g.pts.a, g.pts.b);
  const key = deciding(s, g.index) && s.decidingPoints !== null ? "decidingPoints" : "points";
  const fit = [...kit.pointChoices].sort((x, y) => x - y).find((p) => !gameWinner(kit.shape(kit.normalizeRules({ ...next, [key]: p })), g.index, g.pts));
  return fit ? `Score is ${hi}-${lo} already; pick ${fit}` : `Score is ${hi}-${lo} already, so that would end this ${kit.unit.toLowerCase()}`;
}

function step<R extends AnyRules>(kit: Kit<R>, f: GameFold<R>, e: BoardEvent, i: number) {
  const g = cur(f);
  const N = f.names;
  const line = (side: Side | null, text: string, tone: TimelineLine["tone"], score: string | null = scoreFrom(g.pts, "a")) =>
    f.lines.push({ key: i, side, text, when: null, period: g.index, tone, score });
  switch (e.type) {
    case "point":
      playRally(kit, f, e, i);
      return;
    case "serve": {
      // Before a game's first rally a serve event picks who starts; after it, it fixes a wrong server.
      const fresh = f.needsServe || g.rallies === 0;
      if (fresh) {
        g.first = kit.firstServe(f, e);
        g.chosen = true;
        f.serving = g.first;
        f.needsServe = false;
      } else f.serving = kit.correctServe(f, g, e);
      // Picking the server is the scorer getting on with the next game.
      f.justEnded = null;
      const n = kit.numbered(f.rules) ? `, server ${f.serving.num}` : "";
      line(e.side, fresh ? `${N[e.side]} serves first${n}` : `${N[e.side]} to serve${n}`, "info");
      f.lastAction = `${N[e.side]} serves`;
      return;
    }
    case "timeout":
      g.timeouts[e.side]++;
      f.tally.timeouts[e.side]++;
      line(e.side, `Timeout, ${N[e.side]}`, "info");
      f.lastAction = `Timeout, ${N[e.side]}`;
      return;
    case "rename":
      line(e.side, `Name changed to ${cleanName(e.name)}`, "info", null);
      f.lastAction = `Renamed ${cleanName(e.name)}`;
      return;
    case "rules": {
      const was = f.rules;
      f.rules = kit.normalizeRules({ ...f.rules, ...e.rules });
      if (g.rallies === 0) restartGame(kit, f, g, was);
      else if (f.serving) f.serving = kit.resync(f, g);
      line(null, `Rules changed: ${kit.describe(f.rules)}`, "info", null);
      f.lastAction = "Rules changed";
      return;
    }
    case "end": {
      const r = e.reason;
      // retired, walkover, conceded: e.side stops and the other side wins (BWF and ITTF: a player who cannot go on loses).
      const quit = (r === "retired" || r === "walkover" || r === "conceded") && e.side ? e.side : null;
      if (r === "abandoned") {
        f.over = { winner: null, how: "abandoned" };
        f.lastAction = "Match abandoned";
      } else if (quit && r) {
        f.over = { winner: other(quit), how: r };
        f.lastAction = r === "walkover" ? `Walkover to ${N[other(quit)]}` : `${N[quit]} ${r}`;
      } else {
        // No reason: the court hour is up. Decide on games, then points in the unfinished game.
        f.over = { winner: lead(f.won) ?? lead(g.pts), how: "time" };
        f.lastAction = "Match ended, time up";
      }
      f.serving = null;
      f.needsServe = false;
      f.said = [];
      f.justEnded = null;
      f.changeEnds = false;
      line(f.over.winner, resultOf(kit, f).text, "end", null);
      return;
    }
  }
}

/**
 * A rules change before a game's first rally: the game starts as the new
 * rules would have started it. A server the engine chose follows the new
 * rules (alternation, or a toss for a set that is now the deciding one).
 * A server the scorer chose stays, its number re-derived only when the new
 * rules turn server numbers on or off (singles to side-out doubles
 * pickleball starts 0-0-2). The change of ends before it follows the new
 * rules.
 */
function restartGame<R extends AnyRules>(kit: Kit<R>, f: GameFold<R>, g: GameS, was: R) {
  const picked = g.first;
  if (picked && g.chosen) {
    if (kit.numbered(was) !== kit.numbered(f.rules)) g.first = kit.firstServe(f, { type: "serve", side: picked.side });
  } else if (g.index > 0) {
    g.first = kit.nextGame(f, f.games[g.index - 1]);
  }
  f.serving = g.first;
  f.needsServe = g.first === null;
  if (g.index > 0 && f.justEnded) {
    const ends = kit.endsBefore(f, g.index);
    if (ends !== f.justEnded.changeEnds) {
      f.justEnded = { ...f.justEnded, changeEnds: ends };
      f.said = ends ? [...f.said, "Change ends"] : f.said.filter((n) => n !== "Change ends");
    }
  }
}

function playRally<R extends AnyRules>(kit: Kit<R>, f: GameFold<R>, e: PointEvent, i: number) {
  const s = kit.shape(f.rules);
  const g = cur(f);
  const N = f.names;
  const won = e.side;
  const server = f.serving ? f.serving.side : won;
  const { point, note } = kit.rally(f, g, won);
  g.rallies++;
  f.tally.rallies[won]++;
  f.tally.served[server]++;
  if (won === server) f.tally.servedWon[won]++;
  if (e.how === "ace") f.tally.aces[won]++;
  f.said = note ? [note] : [];
  f.justEnded = null;
  f.changeEnds = false;
  if (point) {
    g.pts[point]++;
    f.tally.points[point]++;
    f.run = f.run.side === point ? { side: point, n: f.run.n + 1 } : { side: point, n: 1 };
    f.tally.longest[point] = Math.max(f.tally.longest[point], f.run.n);
  }
  const line = (text: string, tone: TimelineLine["tone"]) => f.lines.push({ key: i, side: won, text, when: null, period: g.index, tone, score: scoreFrom(g.pts, "a") });

  const winner = point ? gameWinner(s, g.index, g.pts) : null;
  if (!winner) {
    f.serving = kit.serveAfter(f, g, won);
    if (point) {
      // The deciding game's change of ends: once, when the leader first reaches the mark.
      const half = kit.endsAt(targetOf(s, g.index));
      const endsNow = deciding(s, g.index) && g.pts[point] === half && g.pts[other(point)] < half;
      if (endsNow) {
        f.changeEnds = true;
        f.said.push("Change ends");
      }
      f.said.push(...kit.pointNotes(f, g, point, endsNow));
      const text = e.how === "ace" ? `Ace, ${N[won]}` : `Point to ${N[won]}`;
      line(text, "score");
      f.lastAction = e.how === "ace" ? text : `Point, ${N[won]}`;
    } else {
      const text = `Rally to ${N[won]}, ${lowerFirst(note ?? "no point")}`;
      line(text, "info");
      f.lastAction = text;
    }
    return;
  }

  g.winner = winner;
  f.won[winner]++;
  const label = `${kit.unit} ${g.index + 1}`;
  const score = scoreFrom(g.pts, winner);
  if (f.won[winner] >= need(s)) {
    f.over = { winner, how: "points" };
    f.serving = null;
    f.said = [];
    line(s.bestOf > 1 ? `${label} and the match to ${N[winner]}, ${score}` : `Match to ${N[winner]}, ${score}`, "end");
    f.lastAction = `Match to ${N[winner]}`;
    return;
  }
  const next = newGame(g.index + 1);
  f.games.push(next);
  f.run = { side: null, n: 0 };
  next.first = kit.nextGame(f, g);
  f.serving = next.first;
  f.needsServe = next.first === null;
  const changeEnds = kit.endsBefore(f, next.index);
  f.justEnded = { label: `${label} to ${N[winner]}, ${score}`, changeEnds };
  if (changeEnds) f.said.push("Change ends");
  line(f.justEnded.label, "score");
  f.lastAction = `${label} to ${N[winner]}`;
}

/* ------------------------------------------------------------------ */
/* Turning the fold into the view                                      */
/* ------------------------------------------------------------------ */

function resultOf<R extends AnyRules>(kit: Kit<R>, f: GameFold<R>): { winner: Side | null; kind: "win" | "draw" | "abandoned"; text: string; headline: string } {
  const o = f.over ?? { winner: null, how: "abandoned" };
  const N = f.names;
  const games = played(f);
  const sets = (from: Side) => (games.length ? ` (${setsText(games, from)})` : "");
  const w = o.winner;
  if (o.how === "abandoned" || (!w && o.how !== "time")) return { winner: null, kind: "abandoned", text: `Abandoned${sets("a")}`, headline: `${N.a} vs ${N.b} abandoned${sets("a")}` };
  if (!w) return { winner: null, kind: "draw", text: `Drawn, time up${sets("a")}`, headline: `${N.a} and ${N.b} drew, time up${sets("a")}` };
  const l = other(w);
  switch (o.how) {
    case "walkover":
      return { winner: w, kind: "win", text: `${N[w]} won by walkover`, headline: `${N[w]} beat ${N[l]} by walkover` };
    case "retired":
    case "conceded": {
      const text = `${N[w]} won, ${N[l]} ${o.how}${sets(w)}`;
      return { winner: w, kind: "win", text, headline: text };
    }
    case "time":
      return { winner: w, kind: "win", text: `${N[w]} won, time up${sets(w)}`, headline: `${N[w]} beat ${N[l]}, time up${sets(w)}` };
    default: {
      const line = kit.shape(f.rules).bestOf > 1 ? `${scoreFrom(f.won, w)} (${setsText(games, w)})` : scoreFrom(cur(f).pts, w);
      return { winner: w, kind: "win", text: `${N[w]} won ${line}`, headline: `${N[w]} beat ${N[l]} ${line}` };
    }
  }
}

/** "Asha leads Ravi 1-0 (21-17, 8-6)": games first, then points in the game in play. */
function headlineOf<R extends AnyRules>(kit: Kit<R>, f: GameFold<R>): string {
  const N = f.names;
  const g = cur(f);
  const games = played(f);
  if (!games.length) return `${N.a} vs ${N.b}`;
  const byGames = lead(f.won);
  if (byGames) return `${N[byGames]} leads ${N[other(byGames)]} ${scoreFrom(f.won, byGames)} (${setsText(games, byGames)})`;
  const byPoints = lead(g.pts);
  const single = kit.shape(f.rules).bestOf === 1;
  const before = games.filter((x) => x !== g);
  if (byPoints) {
    const where = single ? "" : ` in ${kit.unit.toLowerCase()} ${g.index + 1}`;
    return `${N[byPoints]} leads ${N[other(byPoints)]} ${scoreFrom(g.pts, byPoints)}${where}${before.length ? ` (${setsText(before, byPoints)})` : ""}`;
  }
  if (!before.length) return `${N.a} ${scoreFrom(g.pts, "a")} ${N.b}`;
  return `${N.a} ${scoreFrom(f.won, "a")} ${N.b} (${setsText(games, "a")})`;
}

function noticesOf<R extends AnyRules>(kit: Kit<R>, f: GameFold<R>): string[] {
  const s = kit.shape(f.rules);
  const g = cur(f);
  const out: string[] = [];
  if (f.needsServe) {
    if (deciding(s, g.index)) out.push(`New toss for the deciding ${kit.unit.toLowerCase()}`);
  } else if (f.serving) {
    for (const x of SIDES) {
      // Only a rally that scores can win the game (side-out pickleball: only the server's).
      if (kit.rally(f, g, x).point !== x || !wouldWin(kit, f, g, x)) continue;
      const match = s.bestOf > 1 && f.won[x] + 1 >= need(s);
      out.push(`${match ? "Match" : kit.unit} point ${f.names[x]}`);
    }
    out.push(...kit.stateNotes(f, g));
  }
  for (const n of f.said) if (!out.includes(n)) out.push(n);
  return out;
}

function statsOf<R extends AnyRules>(kit: Kit<R>, f: GameFold<R>): BoardView["stats"] {
  const t = f.tally;
  const any = (k: keyof Tally) => t[k].a + t[k].b > 0;
  if (!any("rallies") && !any("timeouts")) return [];
  const row = (label: string, k: keyof Tally) => ({ label, a: String(t[k].a), b: String(t[k].b) });
  const sideOut = kit.sideOut(f.rules);
  const rows = [row("Points won", "points")];
  if (sideOut) rows.push(row("Rallies won", "rallies"));
  rows.push(row("Longest run", "longest"));
  if (!sideOut) rows.push({ label: "Won on serve", a: `${t.servedWon.a} of ${t.served.a}`, b: `${t.servedWon.b} of ${t.served.b}` });
  if (any("aces")) rows.push(row("Aces", "aces"));
  if (any("timeouts")) rows.push(row("Timeouts", "timeouts"));
  return rows;
}

function deriveWith<R extends AnyRules>(kit: Kit<R>, raw: Board): BoardView {
  const board = cleanBoard(raw);
  const f = fold(kit, board);
  const s = kit.shape(f.rules);
  const multi = s.bestOf > 1;
  const v = blankView(board, kit.label, multi ? `${kit.unit}s` : "Points");
  const g = cur(f);
  const live = !f.over;
  v.status = live ? "live" : "done";
  v.setup = { ...v.setup, rules: f.rules };
  showSideTags(v);
  v.teams.a.score = multi ? f.won.a : g.pts.a;
  v.teams.b.score = multi ? f.won.b : g.pts.b;
  if (live && multi) {
    v.current = { a: String(g.pts.a), b: String(g.pts.b) };
    const to = deciding(s, g.index) && s.decidingPoints !== null && s.decidingPoints !== s.points ? `, to ${s.decidingPoints}` : "";
    v.currentLabel = `${kit.unit} ${g.index + 1}${to}`;
  }
  v.server = live && !f.needsServe && f.serving ? f.serving.side : null;
  v.serveNote = v.server ? kit.serveNote(f, g) : null;
  v.needsServe = live && f.needsServe;
  v.sets = (live ? f.games : played(f)).map((x) => ({ a: x.pts.a, b: x.pts.b, winner: x.winner, tiebreak: null }));
  v.timeline = f.lines;
  v.stats = statsOf(kit, f);
  v.notices = live ? noticesOf(kit, f) : [];
  v.gameJustEnded = live ? f.justEnded : null;
  v.changeEnds = live && f.changeEnds;
  if (f.over) {
    const r = resultOf(kit, f);
    v.result = { winner: r.winner, kind: r.kind, text: r.text };
    v.headline = r.headline;
  } else v.headline = headlineOf(kit, f);
  v.lastAction = f.lastAction;
  v.eventCount = Array.isArray(raw.events) ? raw.events.length : 0;
  return v;
}

/** What tapping "won the rally" for `x` would do, for the button's second line. */
function rallySub<R extends AnyRules>(kit: Kit<R>, f: GameFold<R>, g: GameS, x: Side): string {
  const s = kit.shape(f.rules);
  const { point, note } = kit.rally(f, g, x);
  if (!point) return note ?? "No point";
  if (wouldWin(kit, f, g, x)) return s.bestOf === 1 || f.won[x] + 1 >= need(s) ? "Wins the match" : `Wins ${kit.unit.toLowerCase()} ${g.index + 1}`;
  return "Point";
}

function padWith<R extends AnyRules>(kit: Kit<R>, raw: Board): PadAction[] {
  const f = fold(kit, cleanBoard(raw));
  if (f.over) return [];
  const N = f.names;
  const g = cur(f);
  const out: PadAction[] = [];
  const sv = f.serving;
  if (f.needsServe || !sv) {
    for (const x of SIDES) out.push({ id: `serve-${x}`, side: x, label: `${N[x]} serves first`, tone: "primary", event: { type: "serve", side: x } });
  } else {
    // A column always means "this side won the rally": the event's side is the action's side.
    for (const x of SIDES) out.push({ id: `point-${x}`, side: x, label: "Won the rally", sub: rallySub(kit, f, g, x), tone: "primary", event: { type: "point", side: x } });
    const t = kit.timeouts(f.rules);
    if (t) {
      for (const x of SIDES) {
        const left = t.max - (t.per === "game" ? g.timeouts[x] : f.tally.timeouts[x]);
        out.push({
          id: `timeout-${x}`,
          side: x,
          label: "Timeout",
          sub: left > 0 ? `${left} left` : undefined,
          tone: "plain",
          event: { type: "timeout", side: x },
          ...(left > 0 ? {} : { disabled: "No timeouts left" }),
        });
      }
    }
    out.push({ id: "fix-serve", side: null, label: "Change server", sub: `${N[other(sv.side)]} to serve`, tone: "plain", event: { type: "serve", side: other(sv.side) } });
    if (kit.numbered(f.rules)) {
      const alt = sv.num === 1 ? 2 : 1;
      out.push({ id: "fix-number", side: null, label: "Fix server number", sub: `Make it ${scoreFrom(g.pts, sv.side)}-${alt}`, tone: "plain", event: { type: "serve", side: sv.side, server: alt } });
    }
  }
  const started = f.games.some((x) => x.rallies > 0);
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

/** A SportEngine from a Kit. */
export function makeEngine<R extends AnyRules>(kit: Kit<R>): SportEngine<R> {
  return {
    sport: kit.sport,
    label: kit.label,
    icon: kit.icon,
    defaults: kit.defaults,
    normalizeRules: kit.normalizeRules,
    presets: kit.presets,
    check: (board, event) => problem(kit, fold(kit, cleanBoard(board)), event),
    derive: (board) => deriveWith(kit, board),
    pad: (board) => padWith(kit, board),
  };
}

/* ------------------------------------------------------------------ */
/* Badminton, volleyball, table tennis                                 */
/* ------------------------------------------------------------------ */

/** Fill every RallyRules field from raw, falling back to the sport's defaults. Never throws. */
function normalizeRally(d: RallyRules, raw: unknown): RallyRules {
  const r = isObj(raw) ? raw : {};
  const points = clampInt(r.points, 3, 99, d.points);
  const capIn = r.cap === null ? null : num(r.cap) !== undefined ? clampInt(r.cap, 3, 199, 0) : d.cap;
  const deciding = r.decidingPoints === null ? null : num(r.decidingPoints) !== undefined ? clampInt(r.decidingPoints, 3, 99, 0) : d.decidingPoints;
  const serve = r.serve === "winner" ? "winner" : num(r.serve) !== undefined ? clampInt(r.serve, 1, 10, 2) : d.serve;
  return {
    points,
    winBy: clampInt(r.winBy, 1, 2, d.winBy),
    // A cap at or under the target would end games early, so it goes.
    cap: capIn !== null && capIn > points ? capIn : null,
    bestOf: oneOf(r.bestOf, [1, 3, 5, 7], d.bestOf),
    decidingPoints: deciding,
    serve,
    nextGame: oneOf(r.nextGame, ["winner", "alternate"] as const, d.nextGame),
    decidingToss: bool(r.decidingToss, d.decidingToss),
    doubles: bool(r.doubles, d.doubles),
  };
}

/**
 * Table tennis server for the next rally (ITTF 2.13.3): the serve
 * changes every `every` points, and every point once both sides reach
 * target - 1 (10-10). `first` served the game's first rally.
 */
export function rotatingServer(first: Side, a: number, b: number, every: number, target: number): Side {
  const deuceAt = 2 * (target - 1);
  if (a >= target - 1 && b >= target - 1) {
    const atDeuce = Math.floor(deuceAt / every) % 2 === 0 ? first : other(first);
    return (a + b - deuceAt) % 2 === 0 ? atDeuce : other(atDeuce);
  }
  return Math.floor((a + b) / every) % 2 === 0 ? first : other(first);
}

type RallyConfig = {
  sport: BoardSport;
  label: string;
  icon: string;
  unit: "Game" | "Set";
  defaults: RallyRules;
  presets: RulePreset<RallyRules>[];
  pointChoices: number[];
  endsAt(target: number): number;
  /** Badminton: interval at the half way mark of every game, and the serve court from the score. */
  badminton?: boolean;
  /** Table tennis doubles: the receiving pair swaps order at the deciding game's change of ends. */
  receiversSwap?: boolean;
  timeouts: { max: number; per: "game" | "match" } | null;
};

function rallyKit(c: RallyConfig): Kit<RallyRules> {
  const rotating = (f: GameFold<RallyRules>, g: GameS): Serving | null => {
    const every = f.rules.serve;
    if (typeof every !== "number" || !g.first) return null;
    return { side: rotatingServer(g.first.side, g.pts.a, g.pts.b, every, targetOf(f.rules, g.index)), num: 1 };
  };
  return {
    sport: c.sport,
    label: c.label,
    icon: c.icon,
    unit: c.unit,
    defaults: c.defaults,
    normalizeRules: (raw) => normalizeRally(c.defaults, raw),
    presets: c.presets,
    pointChoices: c.pointChoices,
    shape: (r) => r,
    // Every rally is a point to its winner.
    rally: (_f, _g, won) => ({ point: won, note: null }),
    serveAfter: (f, g, won) => rotating(f, g) ?? { side: won, num: 1 },
    firstServe: (_f, e) => ({ side: e.side, num: 1 }),
    correctServe: (f, g, e) => {
      // ITTF 2.14.1: after a serve out of turn, play goes on in the order set at the start of the game, so the
      // first server was wrong: flip it, and the next game's first server follows from the fixed one.
      if (typeof f.rules.serve === "number" && g.first && f.serving?.side !== e.side) g.first = { side: other(g.first.side), num: 1 };
      return { side: e.side, num: 1 };
    },
    resync: (f, g) => rotating(f, g) ?? f.serving,
    nextGame: (f, prev) => {
      const r = f.rules;
      // FIVB 12.1.1: a new toss before the deciding set.
      if (r.decidingToss && deciding(r, prev.index + 1)) return null;
      const side = r.nextGame === "winner" || !prev.first ? (prev.winner ?? "a") : other(prev.first.side);
      return { side, num: 1 };
    },
    numbered: () => false,
    serveNote: (f, g) => {
      const sv = f.serving;
      if (!c.badminton || !sv) return null;
      return g.pts[sv.side] % 2 === 0 ? "Right court" : "Left court";
    },
    endsAt: c.endsAt,
    // FIVB 18.2.1: ends change after every set, except before a deciding set, where the new toss picks the court.
    endsBefore: (f, next) => !(f.rules.decidingToss && deciding(f.rules, next)),
    pointNotes: (f, g, point, endsNow) => {
      const out: string[] = [];
      const half = Math.ceil(targetOf(f.rules, g.index) / 2);
      // BWF Law 16.2.1: a 60 second interval when the leading score reaches 11 (8 in 15-point games).
      if (c.badminton && g.pts[point] === half && g.pts[other(point)] < half) out.push("Interval");
      // ITTF 2.13.6: in the last possible game of doubles, the receiving pair changes order at the change of ends.
      if (c.receiversSwap && endsNow && f.rules.doubles) out.push("Receivers swap order");
      return out;
    },
    stateNotes: (f, g) => {
      const t = targetOf(f.rules, g.index);
      // ITTF 2.13.3: from 10-10 the serve changes after every point.
      const deuce = typeof f.rules.serve === "number" && f.rules.winBy > 1 && g.pts.a === g.pts.b && g.pts.a >= t - 1;
      return deuce ? ["Deuce, one serve each"] : [];
    },
    timeouts: () => c.timeouts,
    sideOut: () => false,
    describe: (r) => {
      const games = r.bestOf === 1 ? `1 ${c.unit.toLowerCase()}` : `best of ${r.bestOf}`;
      const last = r.bestOf > 1 && r.decidingPoints !== null && r.decidingPoints !== r.points ? `, deciding ${c.unit.toLowerCase()} to ${r.decidingPoints}` : "";
      return `${games} to ${r.points}${r.cap !== null ? ` (cap ${r.cap})` : ""}${last}`;
    },
  };
}

const PLAYERS: RulePreset<RallyRules> = {
  key: "players",
  label: "Players",
  options: [
    { label: "Singles", rules: { doubles: false } },
    { label: "Doubles", rules: { doubles: true } },
  ],
};

export const badmintonEngine: SportEngine<RallyRules> = makeEngine(
  rallyKit({
    sport: "badminton",
    label: "Badminton",
    icon: "🏸",
    unit: "Game",
    // BWF Law 7: best of 3 games to 21, 2 clear from 20-all, the 30th point wins at 29-all; the game's winner serves first in the next (Law 7.6).
    defaults: { points: 21, winBy: 2, cap: 30, bestOf: 3, decidingPoints: null, serve: "winner", nextGame: "winner", decidingToss: false, doubles: false },
    presets: [
      {
        key: "game",
        label: "Games",
        options: [
          { label: "21 (cap 30)", rules: { points: 21, winBy: 2, cap: 30 } },
          // BWF 3x15 from Jan 2027 (BAI since July 2026): 2 clear from 14-all, the 21st point wins at 20-all.
          { label: "15 (cap 21), new BWF format", rules: { points: 15, winBy: 2, cap: 21 } },
        ],
      },
      {
        key: "match",
        label: "Match",
        options: [
          { label: "Best of 3", rules: { bestOf: 3 } },
          { label: "1 game", rules: { bestOf: 1 } },
        ],
      },
      PLAYERS,
    ],
    pointChoices: [15, 21],
    endsAt: (t) => Math.ceil(t / 2),
    badminton: true,
    // Badminton has no timeouts; the intervals are in the Laws (16.2).
    timeouts: null,
  }),
);

export const volleyballEngine: SportEngine<RallyRules> = makeEngine(
  rallyKit({
    sport: "volleyball",
    label: "Volleyball",
    icon: "🏐",
    unit: "Set",
    // FIVB 6.2, 6.3: sets to 25, 2 clear, the deciding set to 15. 12.1.2: the side that did not serve first serves the next set.
    defaults: { points: 25, winBy: 2, cap: null, bestOf: 3, decidingPoints: 15, serve: "winner", nextGame: "alternate", decidingToss: true, doubles: false },
    presets: [
      {
        key: "match",
        label: "Match",
        options: [
          { label: "Best of 3", rules: { bestOf: 3 } },
          { label: "Best of 5", rules: { bestOf: 5 } },
          { label: "1 set", rules: { bestOf: 1 } },
        ],
      },
      {
        key: "points",
        label: "Sets to",
        options: [
          { label: "25", rules: { points: 25 } },
          { label: "21", rules: { points: 21 } },
          { label: "15", rules: { points: 15 } },
        ],
      },
    ],
    pointChoices: [15, 21, 25],
    // FIVB 18.2.2: in the deciding set to 15, ends change at 8.
    endsAt: (t) => Math.ceil(t / 2),
    // FIVB 15.1: two timeouts a set for each team.
    timeouts: { max: 2, per: "game" },
  }),
);

export const tableTennisEngine: SportEngine<RallyRules> = makeEngine(
  rallyKit({
    sport: "table-tennis",
    label: "Table Tennis",
    icon: "🏓",
    unit: "Game",
    // ITTF 2.11, 2.12: games to 11, 2 clear, best of an odd number. 2.13.3: serve every 2 points. 2.13.6: the first receiver serves first next game.
    defaults: { points: 11, winBy: 2, cap: null, bestOf: 5, decidingPoints: null, serve: 2, nextGame: "alternate", decidingToss: false, doubles: false },
    presets: [
      {
        key: "match",
        label: "Match",
        options: [
          { label: "Best of 3", rules: { bestOf: 3 } },
          { label: "Best of 5", rules: { bestOf: 5 } },
          { label: "Best of 7", rules: { bestOf: 7 } },
        ],
      },
      PLAYERS,
    ],
    pointChoices: [11, 21],
    // ITTF 2.13.7: in the last possible game, ends change when a side first reaches 5 (10 in old 21-point games).
    endsAt: (t) => Math.floor(t / 2),
    receiversSwap: true,
    // ITTF 3.4.4.1: one timeout of up to a minute in a match.
    timeouts: { max: 1, per: "match" },
  }),
);
