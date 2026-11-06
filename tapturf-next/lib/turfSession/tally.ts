import { seriesStatus, type Innings, type MatchInput } from "../cricket/nrr";
import { formatOvers } from "../cricket/overs";
import type { MatchResult, Session, SessionMatch, SideKey } from "./types";

/**
 * The session's running result and the words for it: the tally is the
 * Cricket Tournament Manager's series score (lib/cricket/nrr.ts
 * seriesStatus) over every finished match, by side, so a rename or a
 * reshuffle never flips a result. Pure, relative imports only, tested in
 * tally.test.ts (npm run test:session).
 */

export type Tally = {
  a: number;
  b: number;
  tied: number;
  nr: number;
  /** Matches with a result. */
  played: number;
  leader: SideKey | null;
  /** "Titans 2 - 1 Strikers (1 tied)" */
  line: string;
};

export function tally(s: Pick<Session, "sides" | "matches">): Tally {
  const A = s.sides.a.name;
  const B = s.sides.b.name;
  const done = s.matches.filter((m): m is SessionMatch & { result: MatchResult } => !!m.result);
  const inputs: MatchInput[] = done.map((m) => ({ id: String(m.n), teamA: A, teamB: B, a: m.result.a, b: m.result.b, result: m.result.outcome }));
  const st = seriesStatus(A, B, inputs);
  return { a: st.a, b: st.b, tied: st.tied, nr: st.nr, played: done.length, leader: st.a > st.b ? "a" : st.b > st.a ? "b" : null, line: st.line };
}

/** "(1 tied)", "(2 tied, 1 no result)", or "". */
export function extrasText(t: Tally): string {
  const parts = [t.tied ? `${t.tied} tied` : "", t.nr ? `${t.nr} no result` : ""].filter(Boolean);
  return parts.length ? `(${parts.join(", ")})` : "";
}

/** "Titans lead", "All square", "No matches yet". */
export function leadText(s: Pick<Session, "sides" | "matches">): string {
  const t = tally(s);
  if (!t.played) return "No matches yet";
  return t.leader ? `${s.sides[t.leader].name} lead` : "All square";
}

/** "Titans won the session", "Session drawn", "No matches played". */
export function verdict(s: Pick<Session, "sides" | "matches">): string {
  const t = tally(s);
  if (!t.played) return "No matches played";
  return t.leader ? `${s.sides[t.leader].name} won the session` : "Session drawn";
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * A typed result in words, as the Live Cricket Scorer says one: the side
 * that batted first wins by runs, the chasing side by wickets in hand
 * (the wicket limit, from the players a side and last man stands, less the
 * wickets down), or just "won" when the margin cannot be told.
 */
export function typedText(r: Pick<MatchResult, "a" | "b" | "outcome">, battedFirst: SideKey, names: { a: string; b: string }, limit: number): string {
  if (r.outcome === "tie") return "Match tied";
  if (r.outcome === "nr") return "No result";
  const w = r.outcome;
  const win = r[w];
  const lose = r[w === "a" ? "b" : "a"];
  const name = names[w];
  if (w === battedFirst) {
    const margin = win.runs - lose.runs;
    return margin > 0 ? `${name} won by ${plural(margin, "run")}` : `${name} won`;
  }
  const inHand = limit - win.wickets;
  return inHand > 0 ? `${name} won by ${plural(inHand, "wicket")}` : `${name} won`;
}

/** The winner from typed scores: more runs wins, level is a tie. */
export function outcomeOf(a: Innings, b: Innings, noResult: boolean): MatchResult["outcome"] {
  if (noResult) return "nr";
  return a.runs > b.runs ? "a" : b.runs > a.runs ? "b" : "tie";
}

/** "64/3 (6)" or "58/10 (5.3)". */
export function scoreText(inn: Innings): string {
  const o = formatOvers(inn.balls);
  return `${inn.runs}/${inn.wickets} (${o.endsWith(".0") ? o.slice(0, -2) : o})`;
}

/** "Titans 64/3 (6) · Strikers 58/5 (6)", the side that batted first first; "" before a result. */
export function matchLine(m: Pick<SessionMatch, "result" | "battedFirst">, names: { a: string; b: string }): string {
  if (!m.result) return "";
  const first = m.battedFirst;
  const second: SideKey = first === "a" ? "b" : "a";
  return `${names[first]} ${scoreText(m.result[first])} · ${names[second]} ${scoreText(m.result[second])}`;
}
