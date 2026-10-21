import { BOARD_SPORTS, type AnyRules, type Board, type BoardEvent, type BoardInput, type BoardShape, type BoardSport, type BoardView, type PadAction, type RenameEvent, type Side, type SportEngine, type Tag } from "./types";
import { cleanName, clockText, clockValue, isObj, isSide, namesNow, num, PLAYER_SPORTS, SIDES, setupWithTags, tagOf, tagsNow } from "./common";
import { footballEngine, footballMinute, SET_TIME_GRACE_MS } from "./football";
import { basketballEngine, OVERTIME_MS } from "./basketball";
import { otherEngine } from "./other";
import { badmintonEngine, tableTennisEngine, volleyballEngine } from "./rally";
import { pickleballEngine } from "./pickleball";
import { padelEngine, tennisEngine } from "./tennis";
export { SPORT_LIST, readBoardSport } from "./sports";

/**
 * The Live Scoreboard's public API. Everything outside lib/board imports
 * this and ./types only; the engines stay behind SPORT_ENGINES. Relative
 * imports only, so npm run test:board compiles lib/board on its own.
 */

// The setup screen reads each sport's own rules shape (presets, defaults), so the map stays loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SPORT_ENGINES: Record<BoardSport, SportEngine<any>> = {
  football: footballEngine,
  basketball: basketballEngine,
  volleyball: volleyballEngine,
  badminton: badmintonEngine,
  pickleball: pickleballEngine,
  tennis: tennisEngine,
  "table-tennis": tableTennisEngine,
  padel: padelEngine,
  other: otherEngine,
};



const isBoardSport = (x: unknown): x is BoardSport => (BOARD_SPORTS as readonly unknown[]).includes(x);
const engineOf = (sport: BoardSport) => SPORT_ENGINES[sport] ?? otherEngine;

/** Singles racquet games name players, not teams. */
function defaultNames(sport: BoardSport, rules: unknown): [string, string] {
  return PLAYER_SPORTS.includes(sport) && isObj(rules) && rules.doubles === false ? ["Player A", "Player B"] : ["Team A", "Team B"];
}

/** Side tags from the setup screen or a stored setup: racquet sports only, valid tags only. */
function readSideTags(raw: unknown, sport: BoardSport): Partial<Record<Side, Tag>> {
  const out: Partial<Record<Side, Tag>> = {};
  if (!PLAYER_SPORTS.includes(sport) || !isObj(raw)) return out;
  for (const s of SIDES) {
    const t = tagOf(raw[s]);
    if (t) out[s] = t;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Making and changing a board                                         */
/* ------------------------------------------------------------------ */

/** Far more than a real match: a five set tennis match is about 400 points. */
const MAX_EVENTS = 3000;

/** A fresh board. Pass id and now for repeatable tests. firstServe goes in as the first event, for the sports that serve. */
export function newBoard(sport: BoardSport, input: BoardInput = {}, opts: { id?: string; now?: number } = {}): Board {
  const s = isBoardSport(sport) ? sport : "other";
  const now = opts.now ?? Date.now();
  // "b", base 36 time, 5 random base 36 characters: like newMatch's "m" ids, and never one of them.
  const id = opts.id ?? `b${Math.floor(now).toString(36)}${Array.from({ length: 5 }, () => Math.floor(Math.random() * 36).toString(36)).join("")}`;
  const rules = engineOf(s).normalizeRules(input.rules ?? {});
  const [da, db] = defaultNames(s, rules);
  const board: Board = {
    v: 1,
    kind: "board",
    id,
    createdAt: now,
    sport: s,
    setup: setupWithTags({ teamA: cleanName(input.teamA) || da, teamB: cleanName(input.teamB) || db, title: cleanName(input.title, 48), venue: cleanName(input.venue, 48), rules }, readSideTags(input.tags, s)),
    events: [],
  };
  return isSide(input.firstServe) ? applyBoard(board, { type: "serve", side: input.firstServe }) : board;
}

/** The rules in force after the board's events, as derive folds them. */
function rulesNow(board: Board): AnyRules {
  const engine = engineOf(board.sport);
  let rules = engine.normalizeRules(board.setup.rules);
  for (const e of board.events) if (e.type === "rules") rules = engine.normalizeRules({ ...rules, ...e.rules });
  return rules;
}

/** Why this event cannot go in now, or the event as it would be stored. */
function prepare(board: Board, event: BoardEvent): { error: string } | { event: BoardEvent } {
  if (board.events.length >= MAX_EVENTS) return { error: "This match is too long to score any more" };
  const ctx = { sport: board.sport, rules: rulesNow(board) };
  const e = readEvent(event, ctx, true);
  if (!e) return { error: "Unknown event" };
  const why = engineOf(board.sport).check(board, e);
  if (why) return { error: why };
  // What sanitizeBoard keeps, so a board read back off a live link is the scorer's own.
  if (e.type === "clock" && e.ms !== undefined && (e.ms < 0 || e.ms > clockLimit(ctx))) return { error: `Pick a time up to ${clockText(clockLimit(ctx))}` };
  return { event: e };
}

/** Why this event cannot go in now, or null. */
export function checkBoard(board: Board, event: BoardEvent): string | null {
  const p = prepare(board, event);
  return "error" in p ? p.error : null;
}

/** Add an event: a new board, or the same board object untouched when checkBoard refuses it. Names are cleaned on the way in. */
export function applyBoard(board: Board, event: BoardEvent): Board {
  const p = prepare(board, event);
  return "error" in p ? board : { ...board, events: [...board.events, p.event] };
}

/** Drop the last event, whatever it was. */
export function undoBoard(board: Board): Board {
  return board.events.length ? { ...board, events: board.events.slice(0, -1) } : board;
}

export function deriveBoard(board: Board): BoardView {
  return engineOf(board.sport).derive(board);
}

export function padFor(board: Board, view?: BoardView): PadAction[] {
  return engineOf(board.sport).pad(board, view ?? deriveBoard(board));
}

/** The clock's shown value at `now` (the scorer's clock domain), without baseMs; null when there is no clock. */
export function clockMs(view: BoardView, now: number): number | null {
  return view.clock ? clockValue(view.clock, now) : null;
}

/* ------------------------------------------------------------------ */
/* Reading a board from someone else                                   */
/* ------------------------------------------------------------------ */

/** A board, not a cricket match: they travel the same storage and live links. */
export function isBoard(raw: unknown): boolean {
  return isObj(raw) && raw.kind === "board";
}

const BOARD_ID = /^[a-z0-9]{1,24}$/i;
/** PointEvent.how is the engines' own word: "goal", "free-throw", "shootout-miss". */
const HOW = /^[a-z][a-z-]{0,23}$/;
const END_REASONS = ["abandoned", "retired", "walkover", "conceded"] as const;
const MIN = 60_000;

type ReadCtx = { sport: BoardSport; rules: AnyRules };

/** Set time goes up to a period's length plus 30 minutes; overtime is 5 minutes even in short basketball periods. */
function clockLimit(ctx: ReadCtx): number {
  const r = ctx.rules as Partial<Record<string, unknown>>;
  const period = ctx.sport === "football" ? (num(r.halfMinutes) ?? 0) * MIN : ctx.sport === "basketball" ? Math.max((num(r.periodMinutes) ?? 0) * MIN, OVERTIME_MS) : 0;
  return period + SET_TIME_GRACE_MS;
}

const intIn = (x: unknown, lo: number, hi: number): x is number => typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi;

/**
 * A rules change keeps only the keys it gave, each as normalizeRules
 * makes it against the rules in force there, the way derive applies it.
 * Normalising the keys on their own would read "cap 21" against the
 * default 21 points and change what the scorer saw.
 */
function readRules(raw: Record<string, unknown>, ctx: ReadCtx): Partial<AnyRules> {
  const engine = engineOf(ctx.sport);
  const keys = Object.keys(engine.defaults).filter((k) => Object.prototype.hasOwnProperty.call(raw, k));
  const full = engine.normalizeRules({ ...ctx.rules, ...Object.fromEntries(keys.map((k) => [k, raw[k]])) }) as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, full[k]])) as Partial<AnyRules>;
}

/**
 * One event, field by field. Null when it is not one the engines know or
 * a field it needs is unusable. Reading a stored board (strict false)
 * drops a bad optional field; an event coming in from the pad (strict)
 * is refused instead, so it never goes in as a different event.
 */
function readEvent(x: unknown, ctx: ReadCtx, strict: boolean): BoardEvent | null {
  if (!isObj(x)) return null;
  const bad = (given: boolean) => strict && given;
  if (bad(x.at !== undefined && num(x.at) === undefined)) return null;
  const at = num(x.at) !== undefined ? { at: x.at as number } : {};
  const side = isSide(x.side) ? x.side : null;
  if (bad(x.player !== undefined && typeof x.player !== "string")) return null;
  const name = cleanName(x.player, 40);
  // A point, card or foul keeps a tag only next to a player name. From the pad, a bad tag or one with no name is refused; null means none.
  const tag = name ? tagOf(x.tag) : undefined;
  if ((x.type === "point" || x.type === "card" || x.type === "foul") && bad(x.tag !== undefined && x.tag !== null && !tag)) return null;
  const player = name ? { player: name, ...(tag ? { tag } : {}) } : {};
  switch (x.type) {
    case "point": {
      if (!side || bad(x.value !== undefined && !intIn(x.value, 1, 99)) || bad(x.how !== undefined && !(typeof x.how === "string" && HOW.test(x.how)))) return null;
      return {
        type: "point",
        side,
        ...(intIn(x.value, 1, 99) ? { value: x.value } : {}),
        ...(typeof x.how === "string" && HOW.test(x.how) ? { how: x.how } : {}),
        ...player,
        ...at,
      };
    }
    case "card":
      return side && (x.color === "yellow" || x.color === "red") ? { type: "card", side, color: x.color, ...player, ...at } : null;
    case "foul":
      return side ? { type: "foul", side, ...player, ...at } : null;
    case "clock": {
      const t = num(x.at);
      const ms = num(x.ms);
      if (typeof x.run !== "boolean" || t === undefined || bad(x.ms !== undefined && ms === undefined)) return null;
      // A stored board keeps a set time only within the limit; one from the pad is checked against it in prepare().
      const keep = ms !== undefined && (strict || (ms >= 0 && ms <= clockLimit(ctx)));
      return { type: "clock", run: x.run, at: t, ...(keep ? { ms } : {}) };
    }
    case "period":
      return { type: "period", ...at };
    case "serve":
      if (!side || bad(x.server !== undefined && x.server !== 1 && x.server !== 2)) return null;
      return { type: "serve", side, ...(x.server === 1 || x.server === 2 ? { server: x.server } : {}), ...at };
    case "end": {
      const reason = END_REASONS.find((r) => r === x.reason);
      if (bad(x.reason !== undefined && !reason)) return null;
      // Only a side that stopped (and so loses) is kept: abandoned and time up have no side.
      const keepSide = reason && reason !== "abandoned" && side;
      return { type: "end", ...(reason ? { reason } : {}), ...(keepSide ? { side } : {}), ...at };
    }
    case "rename": {
      const n = cleanName(x.name, 32);
      if (!side || !n) return null;
      // Racquet sports only: no tag keeps the side's, null clears it, a tag sets it.
      if (x.tag === undefined) return { type: "rename", side, name: n, ...at };
      const t = x.tag === null ? null : tagOf(x.tag);
      const ok = t !== undefined && PLAYER_SPORTS.includes(ctx.sport);
      if (bad(!ok)) return null;
      return ok ? { type: "rename", side, name: n, tag: t, ...at } : { type: "rename", side, name: n, ...at };
    }
    case "timeout":
      return side ? { type: "timeout", side, ...at } : null;
    case "rules":
      return isObj(x.rules) ? { type: "rules", rules: readRules(x.rules, ctx), ...at } : null;
    default:
      return null;
  }
}

/**
 * A board from someone else's browser or the database, rebuilt field by
 * field from what the engines read, like sanitizeMatch: unknown keys and
 * event types are dropped, names cut, rules normalised, numbers checked.
 * A board the engines made comes back unchanged. Null unless it is a
 * board (kind "board") of a known sport, with at most 3000 events.
 */
export function sanitizeBoard(raw: unknown): Board | null {
  if (!isObj(raw) || raw.kind !== "board" || raw.v !== 1 || !isBoardSport(raw.sport) || !isObj(raw.setup) || !Array.isArray(raw.events) || raw.events.length > MAX_EVENTS) return null;
  const sport = raw.sport;
  const engine = engineOf(sport);
  const rules = engine.normalizeRules(raw.setup.rules);
  const [da, db] = defaultNames(sport, rules);
  const ctx: ReadCtx = { sport, rules };
  const events: BoardEvent[] = [];
  for (const x of raw.events) {
    const e = readEvent(x, ctx, false);
    if (!e) continue;
    events.push(e);
    if (e.type === "rules") ctx.rules = engine.normalizeRules({ ...ctx.rules, ...e.rules });
  }
  const board: Board = {
    v: 1,
    kind: "board",
    id: typeof raw.id === "string" && BOARD_ID.test(raw.id) ? raw.id : "board",
    createdAt: num(raw.createdAt) ?? 0,
    sport,
    setup: setupWithTags({ teamA: cleanName(raw.setup.teamA) || da, teamB: cleanName(raw.setup.teamB) || db, title: cleanName(raw.setup.title, 48), venue: cleanName(raw.setup.venue, 48), rules }, readSideTags(raw.setup.tags, sport)),
    events,
  };
  const sentAt = num(raw.sentAt);
  if (sentAt !== undefined) board.sentAt = sentAt;
  return board;
}

/* ------------------------------------------------------------------ */
/* Handing a board to someone else                                     */
/* ------------------------------------------------------------------ */

/**
 * The board as a live link serves it: an old team name is not served
 * once it is renamed, nor an old or removed side tag. The setup names and
 * tags and every rename say the latest ones (a side with no tag now has
 * none anywhere), so derive reads the same and the events line up one
 * for one. Player names and tags on events stay as typed. The scorer's
 * own board is not touched.
 */
export function publicBoard(board: Board): Board {
  const names = namesNow(board);
  const tags = tagsNow(board);
  const events = board.events.map((e): BoardEvent => {
    if (e.type !== "rename") return e;
    const out: RenameEvent = { ...e, name: names[e.side] };
    // The tag key only where the scorer's rename had one (a tag change): a
    // rename without it must stay one, so the follower's lines match.
    delete out.tag;
    if (e.tag !== undefined) out.tag = tags[e.side] ?? null;
    return out;
  });
  return { ...board, setup: setupWithTags({ ...board.setup, teamA: names.a, teamB: names.b }, tags), events };
}

/** Live sync urgency: one "innings" per finished period or set, so an end of either (or of the match) skips the send throttle. */
export function boardShape(view: BoardView): BoardShape {
  const sets = view.sets.filter((s) => s.winner !== null).length;
  const periods = view.period?.index ?? 0;
  return { status: view.status, innings: new Array<null>(sets + periods + 1).fill(null) };
}

const SET_SPORTS: readonly BoardSport[] = ["volleyball", "badminton", "pickleball", "tennis", "table-tennis", "padel"];
const PERIOD_ROW = /^(Q\d|OT\d*|1st half|2nd half)$/;

/** "21-17, 6-7(5), [10-8]": tennis writes a tiebreak set with the loser's tiebreak points. */
function setsText(view: BoardView): string {
  const sets = view.sets.filter((s, i) => i === 0 || s.winner !== null || s.a + s.b > 0);
  return sets.map((s) => (s.matchTiebreak ? `[${s.a}-${s.b}]` : `${s.a}-${s.b}${s.tiebreak ? `(${Math.min(s.tiebreak.a, s.tiebreak.b)})` : ""}`)).join(", ");
}

/** The live status line: "2nd half, 67'", "Q3 4:12", "Game 5, set 2: 40-15". */
function statusLine(view: BoardView, now: number | undefined): string | null {
  const p = view.period;
  const c = view.clock;
  if (view.sport === "football" && view.current) return `Penalties ${view.current.a}-${view.current.b}`;
  if (p && c && !p.break && now !== undefined && (c.running || c.ms > 0)) {
    const ms = clockMs(view, now) ?? c.ms;
    if (view.sport === "football" && c.limitMs) return `${p.label}, ${footballMinute(Math.round(c.baseMs / MIN), c.limitMs / MIN, ms)}`;
    return p.label === "Game" ? clockText(ms, c.down) : `${p.label} ${clockText(ms, c.down)}`;
  }
  if (p) return p.label;
  if (view.current && (view.sport === "tennis" || view.sport === "padel")) return `${view.currentLabel ?? "Game"}: ${view.current.a}-${view.current.b}`;
  return view.currentLabel;
}

/**
 * A WhatsApp-friendly score update (*bold* is WhatsApp's own markdown):
 * the score, the sport and title, the result or where the match is
 * (with the clock when `now` is given), sets, goals or points by period.
 */
export function boardShareText(view: BoardView, opts: { link?: string; now?: number } = {}): string {
  const { a, b } = view.teams;
  const setSport = SET_SPORTS.includes(view.sport);
  const lines = [`*${a.name} ${a.score}-${b.score} ${b.name}*${setSport ? ` (${view.scoreUnit.toLowerCase()})` : ""}`];
  lines.push(view.setup.title ? `${view.sportName}, ${view.setup.title}` : view.sportName);
  if (view.status === "done") {
    if (view.result) lines.push(view.result.text);
  } else {
    const status = statusLine(view, opts.now);
    if (status) lines.push(status);
  }
  if (setSport && view.sets.length) lines.push(setsText(view));
  if (setSport && view.status === "live" && view.server) lines.push(`${view.teams[view.server].name} serving`);
  if (view.sport === "football") {
    // Scorers; cards are the players' other lines.
    const goals = view.players.filter((p) => !/card|yellow/i.test(p.text)).map((p) => `${p.name} ${p.text}`);
    if (goals.length) lines.push(`Goals: ${goals.join(", ")}`);
  }
  if (view.sport === "basketball") {
    const byPeriod = view.stats.filter((s) => PERIOD_ROW.test(s.label)).map((s) => `${s.label} ${s.a}-${s.b}`);
    if (byPeriod.length) lines.push(byPeriod.join(", "));
  }
  lines.push(opts.link ? `Live score: ${opts.link}` : "Scored live on TapTurf.in");
  return lines.join("\n");
}

