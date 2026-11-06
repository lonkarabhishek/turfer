import { normalizeRules, wicketLimit, type MatchView, type Rules, type SetupInput } from "../cricket/scoring";
import type { Innings } from "../cricket/nrr";
import type { Venue } from "../tournament/types";
import { liveResultOf } from "../tournament/live";
import { MAX_MATCHES } from "./plan";
import { PLAYERS_MAX, sameNames, sideName } from "./names";
import { outcomeOf, tally, typedText, type Tally } from "./tally";
import type { BatLine, BowlLine, Format, LiveState, MatchResult, Session, SessionMatch, Side, SideKey } from "./types";

/**
 * A turf session's moves: start it, add a match scored ball by ball or
 * typed in as a final score, take in what the scorer says about a match,
 * take one out, change the teams or overs from the next match, end it and
 * reopen it. Each returns a new session (never changes the one given);
 * the screens keep it (store.ts) and the live link follows (sync.ts).
 * Pure, relative imports only, tested in session.test.ts
 * (npm run test:session).
 */

export type NewSession = {
  format: Format;
  venue: string;
  turf: Venue | null;
  day: string;
  overs: number;
  playersPerSide: number;
  rules: Rules;
  pick: boolean;
  sides: { a: Side; b: Side };
  firstBat: SideKey;
  plan: number | null;
  game: Session["game"];
};

export const emptyLive = (): LiveState => ({ want: false, secret: null, code: null, pushed: {}, teamsPushed: null, ended: false, error: null, follow: null });

const other = (s: SideKey): SideKey => (s === "a" ? "b" : "a");
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

export function newSession(x: NewSession, now: number, id = `s${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`): Session {
  return {
    v: 1,
    id,
    createdAt: now,
    updatedAt: now,
    format: x.format,
    venue: x.venue.slice(0, 48),
    turf: x.turf,
    day: x.day,
    overs: clamp(x.overs, 1, 50),
    playersPerSide: clamp(x.playersPerSide, 2, 30),
    rules: normalizeRules(x.rules),
    pick: x.pick,
    sides: x.sides,
    firstBat: x.firstBat,
    plan: x.plan,
    matches: [],
    ended: null,
    game: x.game,
    live: emptyLive(),
  };
}

const names = (s: Pick<Session, "sides">) => ({ a: s.sides.a.name, b: s.sides.b.name });

/** The match being played: the last one, scored ball by ball and not over yet. None once the session has ended. */
export function current(s: Session): SessionMatch | null {
  if (s.ended) return null;
  const last = s.matches[s.matches.length - 1];
  return last && last.kind === "balls" && !last.result ? last : null;
}

/** Who bats first in the next match: the other side from the last match, else the side picked for match 1. */
export function battingFirstFor(s: Pick<Session, "matches" | "firstBat">): SideKey {
  const last = s.matches[s.matches.length - 1];
  return last ? other(last.battedFirst) : s.firstBat;
}

/**
 * The scorer's title for match n: "Match 3 of 6 · Titans lead 2-0",
 * "Match 2 · All square 1-1", "Match 1". 48 characters at most: the
 * " of 6" goes first, then the leader's name ("Match 3 · 2-0").
 */
export function matchTitle(n: number, plan: number | null, t: Tally, side: { a: string; b: string }): string {
  const base = plan && n <= plan ? `Match ${n} of ${plan}` : `Match ${n}`;
  if (!t.played) return base;
  const hi = Math.max(t.a, t.b);
  const lo = Math.min(t.a, t.b);
  const status = t.leader ? `${side[t.leader]} lead ${hi}-${lo}` : `All square ${t.a}-${t.b}`;
  for (const title of [`${base} · ${status}`, `Match ${n} · ${status}`]) if (title.length <= 48) return title;
  return `Match ${n} · ${hi}-${lo}`.slice(0, 48);
}

/** What the Live Cricket Scorer's newMatch takes for match n (the next one by default). */
export function nextSetup(s: Session, opts: { n?: number; battingFirst?: SideKey } = {}): SetupInput {
  const n = opts.n ?? s.matches.length + 1;
  // The tally before match n: a match being replaced does not count towards its own title.
  const before = { ...s, matches: s.matches.filter((m) => m.n < n) };
  return {
    teamA: s.sides.a.name,
    teamB: s.sides.b.name,
    overs: s.overs,
    playersPerSide: s.playersPerSide,
    battingFirst: opts.battingFirst ?? battingFirstFor(before),
    rules: s.rules,
    players: { a: s.sides.a.players, b: s.sides.b.players },
    title: matchTitle(n, s.plan, tally(before), names(s)),
    venue: s.venue,
  };
}

const touched = (s: Session, now: number, change: Partial<Session>): Session => ({ ...s, ...change, updatedAt: now });
const renumber = (list: SessionMatch[]) => list.map((m, i) => (m.n === i + 1 ? m : { ...m, n: i + 1 }));

/** A new match scored ball by ball: the scorer's match id and who bats first in it. */
export function addScored(s: Session, matchId: string, battedFirst: SideKey, now: number): Session {
  if (s.matches.length >= MAX_MATCHES) return s;
  const m: SessionMatch = {
    n: s.matches.length + 1,
    kind: "balls",
    matchId,
    battedFirst,
    overs: s.overs,
    playersPerSide: s.playersPerSide,
    lastManStands: s.rules.lastManStands,
    result: null,
    bat: [],
    bowl: [],
    balls: 0,
    at: now,
  };
  return touched(s, now, { matches: [...s.matches, m], ended: null });
}

/** The empty match being played made again (who bats first swapped, or new settings): the old scorer match id, to delete. */
export function replaceCurrent(s: Session, matchId: string, battedFirst: SideKey, now: number): { session: Session; dropped: string | null } {
  const cur = current(s);
  if (!cur || cur.balls > 0) return { session: s, dropped: null };
  const m: SessionMatch = { ...cur, matchId, battedFirst, overs: s.overs, playersPerSide: s.playersPerSide, lastManStands: s.rules.lastManStands, at: now };
  return { session: touched(s, now, { matches: s.matches.map((x) => (x.n === cur.n ? m : x)) }), dropped: cur.matchId };
}

const strip = (x: Innings): Innings => ({ runs: x.runs, wickets: x.wickets, balls: x.balls, allOut: !!x.allOut });

/** Every ball bowled in the scorer's view, wides and no-balls too: a first-ball wide has started the match. */
export const deliveries = (view: MatchView): number => view.innings.reduce((sum, i) => sum + i.commentary.filter((l) => l.kind === "ball").length, 0);

/**
 * What the scorer's view of match n says, copied in: its result (as a
 * live tournament keeps one, lib/tournament/live.ts liveResultOf), its
 * batting and bowling lines, the balls bowled (deliveries) and its overs. For the
 * match being played, team names renamed in its Match settings and new
 * names typed for its players carry over to the session. The same session
 * object back when nothing changed.
 */
export function recordScored(s: Session, n: number, view: MatchView, now: number): Session {
  const m = s.matches.find((x) => x.n === n && x.kind === "balls");
  if (!m) return s;
  const lr = liveResultOf(view);
  const result: MatchResult | null = lr ? { a: strip(lr.a), b: strip(lr.b), outcome: lr.outcome, text: lr.text } : null;
  const bat: BatLine[] = [];
  const bowl: BowlLine[] = [];
  for (const inn of view.innings) {
    for (const b of inn.batters) bat.push([b.name, inn.batting, b.runs, b.balls, b.status === "out"]);
    for (const b of inn.bowlers) bowl.push([b.name, inn.bowling, b.wickets, b.runs, b.balls]);
  }
  const next: SessionMatch = {
    ...m,
    battedFirst: view.innings[0]?.batting ?? m.battedFirst,
    overs: view.setup.overs,
    playersPerSide: view.setup.playersPerSide,
    lastManStands: view.setup.rules.lastManStands,
    result,
    bat,
    bowl,
    balls: deliveries(view),
  };
  let sides = s.sides;
  if (n === s.matches.length) {
    const a = sideName(view.setup.teamA);
    const b = sideName(view.setup.teamB);
    if (a && b && !sameNames(a, b) && (a !== sides.a.name || b !== sides.b.name)) sides = { a: { ...sides.a, name: a }, b: { ...sides.b, name: b } };
    // Players named in this match (a placeholder renamed, someone added) are in the next match's roster too.
    const all = new Set([...sides.a.players, ...sides.b.players].map((p) => p.toLowerCase()));
    const add = (k: SideKey): Side => {
      const extra = view.teams[k].players.map((p) => p.name).filter((p) => !/^(batter|bowler|player) \d+$/i.test(p) && !all.has(p.toLowerCase()));
      for (const p of extra) all.add(p.toLowerCase());
      return extra.length ? { ...sides[k], players: [...sides[k].players, ...extra].slice(0, PLAYERS_MAX) } : sides[k];
    };
    const sa = add("a");
    const sb = add("b");
    if (sa !== sides.a || sb !== sides.b) sides = { a: sa, b: sb };
  }
  if (JSON.stringify(next) === JSON.stringify(m) && sides === s.sides) return s;
  return touched(s, now, { matches: s.matches.map((x) => (x === m ? next : x)), sides });
}

export type FinalInput = {
  /** The match to set: a typed one to edit, or the empty match being played to replace; null for a new one. */
  n: number | null;
  battedFirst: SideKey;
  a: Innings;
  b: Innings;
  noResult: boolean;
  /**
   * Match n was scored ball by ball and this typed score replaces it where it is ("Correct the score"):
   * same number, its batting and bowling lines dropped, its scorer copy kept in the Live Cricket Scorer.
   */
  replaceScored?: boolean;
};

/**
 * A match's final score, typed in: it counts like any other. It edits a
 * typed match, replaces the empty match being played (dropped: its scorer
 * match id, to delete), corrects a match scored ball by ball when asked
 * (replaceScored), or comes next. All out is a side whose wickets reach
 * the limit.
 */
export function recordFinal(s: Session, x: FinalInput, now: number): { session: Session; dropped: string | null; n: number } {
  const target = x.n === null ? null : s.matches.find((m) => m.n === x.n) ?? null;
  const cur = current(s);
  const replace = target ?? (cur && cur.balls === 0 ? cur : null);
  const scored = !!target && target.kind === "balls" && target.balls > 0;
  if (scored && !x.replaceScored) return { session: s, dropped: null, n: target!.n };
  if (!replace && s.matches.length >= MAX_MATCHES) return { session: s, dropped: null, n: s.matches.length };
  const playersPerSide = replace?.playersPerSide ?? s.playersPerSide;
  const lastManStands = replace?.lastManStands ?? s.rules.lastManStands;
  const limit = wicketLimit({ playersPerSide, rules: { ...s.rules, lastManStands } });
  const side = (inn: Innings): Innings => {
    const wickets = clamp(inn.wickets, 0, limit);
    return { runs: clamp(inn.runs, 0, 999), wickets, balls: clamp(inn.balls, 0, 600), allOut: wickets >= limit };
  };
  const a = side(x.a);
  const b = side(x.b);
  const outcome = outcomeOf(a, b, x.noResult);
  const result: MatchResult = { a, b, outcome, text: typedText({ a, b, outcome }, x.battedFirst, names(s), limit) };
  const n = replace?.n ?? s.matches.length + 1;
  const m: SessionMatch = {
    n,
    kind: "final",
    matchId: null,
    battedFirst: x.battedFirst,
    overs: replace?.overs ?? s.overs,
    playersPerSide,
    lastManStands,
    result,
    bat: [],
    bowl: [],
    balls: a.balls + b.balls,
    at: replace?.at ?? now,
  };
  const matches = replace ? s.matches.map((y) => (y === replace ? m : y)) : [...s.matches, m];
  // A match with balls in it keeps its scorer copy (the Live Cricket Scorer's saved matches); an empty one goes.
  return { session: touched(s, now, { matches }), dropped: replace?.kind === "balls" && !scored ? replace.matchId : null, n };
}

/** Matches scored ball by ball that have started (a ball, wides too) but have no result: the one being played, or an earlier one whose result Undo took back. */
export function unfinished(s: Pick<Session, "matches">): SessionMatch[] {
  return s.matches.filter((m) => m.kind === "balls" && !m.result && m.balls > 0);
}

/** "6 overs a match", or "4 to 6 overs a match" when the overs changed between matches; "" for none. */
export function oversText(matches: Pick<SessionMatch, "overs">[]): string {
  if (!matches.length) return "";
  const lo = Math.min(...matches.map((m) => m.overs));
  const hi = Math.max(...matches.map((m) => m.overs));
  const word = (n: number) => `${n} over${n === 1 ? "" : "s"}`;
  return lo === hi ? `${word(lo)} a match` : `${lo} to ${word(hi)} a match`;
}

/** Match n out of the session; the ones after it move up a number. */
export function removeMatch(s: Session, n: number, now: number): { session: Session; removed: SessionMatch | null } {
  const removed = s.matches.find((m) => m.n === n) ?? null;
  if (!removed) return { session: s, removed: null };
  return { session: touched(s, now, { matches: renumber(s.matches.filter((m) => m !== removed)) }), removed };
}

export type Changes = Partial<Pick<Session, "sides" | "overs" | "playersPerSide" | "rules" | "pick" | "plan" | "venue" | "format">>;

/** Teams, overs, players or rules from the next match on (a match already played keeps its own). */
export function applyChanges(s: Session, ch: Changes, now: number): Session {
  const next: Partial<Session> = { ...ch };
  if (ch.overs !== undefined) next.overs = clamp(ch.overs, 1, 50);
  if (ch.playersPerSide !== undefined) next.playersPerSide = clamp(ch.playersPerSide, 2, 30);
  if (ch.rules) next.rules = normalizeRules(ch.rules);
  return touched(s, now, next);
}

/**
 * The end: matches not finished are left out (one still being scored
 * stays in the Live Cricket Scorer's saved matches; dropped lists them).
 */
export function endSession(s: Session, now: number): { session: Session; dropped: SessionMatch[] } {
  const dropped = s.matches.filter((m) => !m.result);
  const matches = renumber(s.matches.filter((m) => !!m.result));
  return { session: touched(s, now, { matches, ended: now }), dropped };
}

export function reopen(s: Session, now: number): Session {
  return s.ended ? touched(s, now, { ended: null }) : s;
}

/** Matches with a result. */
export function playedCount(s: Session): number {
  return s.matches.filter((m) => !!m.result).length;
}
