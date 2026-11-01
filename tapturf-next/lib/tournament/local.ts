import type { MatchInput, PointsConfig, ResultChoice } from "../cricket/nrr";
import { makeFixtures, type NewFixture } from "./fixtures";
import { MAX_FIXTURES, MAX_SERIES, NAME_MAX, TEAM_MAX, type CreateBody, type ManualResult, type Settings } from "./types";

/**
 * "Go live" on the Cricket Tournament Manager: the tournament kept in this
 * browser (components/tools/TournamentScorer.tsx, tapturf_tournament_v1)
 * as a live tournament's setup, teams and fixtures, its results carried
 * over. The format stays (round robin is a league), and so do the points
 * and the overs a side (none set stays none, so NRR comes out the same).
 * Every pairing of the round robin is made, and each result played goes
 * on the first open fixture between those two teams; a pairing played
 * more often than the schedule has gets a fixture of its own, as does a
 * series match past the planned number. Pure, relative imports only,
 * tested in local.test.ts (npm run test:tournament).
 */

/** The offline tool's tournament, as it keeps it. */
export type LocalTournament = {
  v: 1;
  format: "bilateral" | "tri" | "roundrobin";
  name: string;
  teams: string[];
  points: PointsConfig;
  matches: (MatchInput & { battedFirst: "a" | "b"; at: number })[];
  startedAt: number;
};

const swapChoice = (r: ResultChoice): ResultChoice => (r === "a" ? "b" : r === "b" ? "a" : r);

/** A played match as the fixture between home and away keeps it. */
function resultFor(m: LocalTournament["matches"][number], homeIsA: boolean): ManualResult {
  const a = { runs: m.a.runs, wickets: m.a.wickets, balls: m.a.balls, allOut: !!m.a.allOut };
  const b = { runs: m.b.runs, wickets: m.b.wickets, balls: m.b.balls, allOut: !!m.b.allOut };
  return homeIsA ? { a, b, result: m.result, battedFirst: m.battedFirst } : { a: b, b: a, result: swapChoice(m.result), battedFirst: m.battedFirst === "a" ? "b" : "a" };
}

/** The live tournament's create body (all but the secret), or why it can't be made. */
export function fromLocal(t: LocalTournament): { ok: Omit<CreateBody, "secret"> } | { error: "teams" | "too_many" } {
  const teams = t.teams.map((s) => s.trim().slice(0, TEAM_MAX)).filter(Boolean);
  const minTeams = t.format === "bilateral" ? 2 : 3;
  if (teams.length < minTeams || new Set(teams.map((s) => s.toLowerCase())).size !== teams.length) return { error: "teams" };
  const idOf = new Map(teams.map((name, i) => [name, i + 1]));
  const played = t.matches.filter((m) => idOf.has(m.teamA) && idOf.has(m.teamB) && m.teamA !== m.teamB);

  // A pairing met more than once in the round robin means home and away.
  const pairs = new Map<string, number>();
  for (const m of played) {
    const k = [idOf.get(m.teamA)!, idOf.get(m.teamB)!].sort((x, y) => x - y).join("-");
    pairs.set(k, (pairs.get(k) ?? 0) + 1);
  }
  const twice = [...pairs.values()].some((n) => n > 1);
  const format: Settings["format"] = t.format === "roundrobin" ? "league" : t.format === "tri" ? "tri" : "bilateral";
  const overs = t.points.oversPerSide && t.points.oversPerSide > 0 ? Math.min(50, Math.round(t.points.oversPerSide)) : null;
  const settings: Settings = {
    format,
    legs: format !== "bilateral" && twice ? 2 : 1,
    matches: format === "bilateral" ? Math.min(MAX_SERIES, Math.max(3, played.length)) : 0,
    playoffs: "none",
    overs,
    points: { win: t.points.win, tie: t.points.tie, nr: t.points.nr, loss: t.points.loss },
    venue: null,
    starts: null,
    ends: null,
  };
  const ids = teams.map((_, i) => i + 1);
  const fixtures: NewFixture[] = makeFixtures(settings, ids);
  const extra: NewFixture[] = [];
  let lastRound = fixtures.reduce((r, f) => Math.max(r, f.round), 0);
  for (const m of played) {
    const h = idOf.get(m.teamA)!;
    const w = idOf.get(m.teamB)!;
    const open = fixtures.find((f) => !f.result && ((f.home === h && f.away === w) || (f.home === w && f.away === h)));
    if (open) open.result = resultFor(m, open.home === h);
    else extra.push({ id: 0, stage: "league", slot: null, round: Math.min(99, ++lastRound), seq: 0, home: h, away: w, day: null, time: null, result: resultFor(m, true) });
  }
  const all = [...fixtures, ...extra];
  if (all.length > MAX_FIXTURES) return { error: "too_many" };
  return {
    ok: {
      name: (t.name.trim() || "Cricket tournament").slice(0, NAME_MAX),
      settings,
      teams: teams.map((name) => ({ name, short: null })),
      fixtures: all.map((f, i) => ({ ...f, id: i + 1, seq: i })),
    },
  };
}
