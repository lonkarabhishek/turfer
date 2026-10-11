import { runRate, toBalls } from "./overs";

/**
 * Net run rate and standings. Deterministic, pure, tested in
 * cricket.test.ts. Rules used (the common limited-overs ones):
 *
 *  - NRR = runs scored per over faced minus runs conceded per over bowled,
 *    over all of a team's counted matches.
 *  - A tie counts in NRR like any other match. A no-result match is left
 *    out of NRR entirely; both sides get the no-result points.
 *  - All out: when a side is bowled out, the full quota of overs for the
 *    match is counted against it, not the overs it actually faced. That
 *    only applies when the match has an overs-per-side setting and the
 *    innings is marked all out. Without a quota the overs faced are used.
 *  - Standings order: points, then NRR, then wins, then name.
 */

export type Innings = {
  runs: number;
  wickets: number;
  /** Legal deliveries faced. */
  balls: number;
  /** Bowled out: the full quota counts against the batting side. */
  allOut?: boolean;
};

export type ResultChoice = "auto" | "a" | "b" | "tie" | "nr";
export type Outcome = "a" | "b" | "tie" | "nr";

export type MatchInput = {
  id: string;
  teamA: string;
  teamB: string;
  a: Innings;
  b: Innings;
  result: ResultChoice;
};

export type PointsConfig = {
  win: number;
  tie: number;
  nr: number;
  loss: number;
  /** Overs per side for the all-out rule; null means use overs faced. */
  oversPerSide: number | null;
};

export const DEFAULT_POINTS: PointsConfig = { win: 2, tie: 1, nr: 1, loss: 0, oversPerSide: null };

export type Standing = {
  team: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  nr: number;
  points: number;
  runsFor: number;
  ballsFor: number;
  runsAgainst: number;
  ballsAgainst: number;
  nrr: number | null;
};

/** Who won, from the scores unless the user overrode it. */
export function decideResult(m: Pick<MatchInput, "a" | "b" | "result">): Outcome {
  if (m.result !== "auto") return m.result;
  if (m.a.runs > m.b.runs) return "a";
  if (m.b.runs > m.a.runs) return "b";
  return "tie";
}

/** Balls that count against a batting side for NRR. */
export function countedBalls(inn: Innings, cfg: Pick<PointsConfig, "oversPerSide">): number {
  if (inn.allOut && cfg.oversPerSide && cfg.oversPerSide > 0) return Math.max(inn.balls, toBalls(cfg.oversPerSide));
  return inn.balls;
}

/** Single-match NRR, as the NRR calculator shows it. */
export function calcNrr(runsFor: number, ballsFaced: number, runsAgainst: number, ballsBowled: number) {
  const rrFor = runRate(runsFor, ballsFaced);
  const rrAgainst = runRate(runsAgainst, ballsBowled);
  const nrr = rrFor == null || rrAgainst == null ? null : rrFor - rrAgainst;
  return { rrFor, rrAgainst, nrr };
}

export function computeStandings(teams: string[], matches: MatchInput[], cfg: PointsConfig): Standing[] {
  const table = new Map<string, Standing>();
  for (const t of teams) {
    table.set(t, { team: t, played: 0, won: 0, lost: 0, tied: 0, nr: 0, points: 0, runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, nrr: null });
  }
  for (const m of matches) {
    const A = table.get(m.teamA);
    const B = table.get(m.teamB);
    if (!A || !B || m.teamA === m.teamB) continue;
    const out = decideResult(m);
    A.played++;
    B.played++;
    if (out === "nr") {
      A.nr++;
      B.nr++;
      A.points += cfg.nr;
      B.points += cfg.nr;
      continue;
    }
    const aBalls = countedBalls(m.a, cfg);
    const bBalls = countedBalls(m.b, cfg);
    A.runsFor += m.a.runs;
    A.ballsFor += aBalls;
    A.runsAgainst += m.b.runs;
    A.ballsAgainst += bBalls;
    B.runsFor += m.b.runs;
    B.ballsFor += bBalls;
    B.runsAgainst += m.a.runs;
    B.ballsAgainst += aBalls;
    if (out === "tie") {
      A.tied++;
      B.tied++;
      A.points += cfg.tie;
      B.points += cfg.tie;
    } else {
      const [w, l] = out === "a" ? [A, B] : [B, A];
      w.won++;
      l.lost++;
      w.points += cfg.win;
      l.points += cfg.loss;
    }
  }
  const rows = [...table.values()].map((s) => {
    const { nrr } = calcNrr(s.runsFor, s.ballsFor, s.runsAgainst, s.ballsAgainst);
    return { ...s, nrr };
  });
  rows.sort((x, y) => y.points - x.points || (y.nrr ?? -Infinity) - (x.nrr ?? -Infinity) || y.won - x.won || x.team.localeCompare(y.team));
  return rows;
}

/** "Titans 2 - 1 Strikers" for a two-team series, with ties and no-results noted. */
export function seriesStatus(teamA: string, teamB: string, matches: MatchInput[]): { a: number; b: number; tied: number; nr: number; line: string; leader: string | null } {
  let a = 0;
  let b = 0;
  let tied = 0;
  let nr = 0;
  for (const m of matches) {
    const out = decideResult(m);
    const flip = m.teamA !== teamA;
    if (out === "tie") tied++;
    else if (out === "nr") nr++;
    else if ((out === "a") !== flip) a++;
    else b++;
  }
  const extras = [tied ? `${tied} tied` : "", nr ? `${nr} no result` : ""].filter(Boolean).join(", ");
  const line = `${teamA} ${a} - ${b} ${teamB}${extras ? ` (${extras})` : ""}`;
  const leader = a > b ? teamA : b > a ? teamB : null;
  return { a, b, tied, nr, line, leader };
}

/** Plain-English match result: "Titans won by 8 runs", "Strikers won by 3 wickets" when the chaser won. */
export function describeResult(m: MatchInput, battedFirst: "a" | "b" = "a"): string {
  const out = decideResult(m);
  if (out === "tie") return "Match tied";
  if (out === "nr") return "No result";
  const winner = out === "a" ? m.teamA : m.teamB;
  const win = out === "a" ? m.a : m.b;
  const lose = out === "a" ? m.b : m.a;
  const chased = out !== battedFirst;
  if (chased) {
    const wkts = Math.max(0, 10 - win.wickets);
    return win.wickets > 0 && win.wickets < 10 ? `${winner} won by ${wkts} wicket${wkts === 1 ? "" : "s"}` : `${winner} won`;
  }
  const margin = win.runs - lose.runs;
  return margin > 0 ? `${winner} won by ${margin} run${margin === 1 ? "" : "s"}` : `${winner} won`;
}
