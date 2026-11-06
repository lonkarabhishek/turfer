import { computeStandings, decideResult, describeResult, seriesStatus, type MatchInput, type Outcome, type Standing } from "../cricket/nrr";
import { orientLive } from "./live";
import type { Fixture, LiveNow, ManualResult, Settings, Slot, Team, Tournament } from "./types";

/**
 * A tournament as the page shows it: every fixture with its teams, state
 * and result, the points table, the playoffs filled in and the winner.
 * The points and NRR are the Cricket Tournament Manager's own
 * (lib/cricket/nrr.ts computeStandings: W2/T1/NR1/L0 by default, all out
 * counts the full overs, sorted by points, then NRR, then wins). Worked
 * out the same in the browser and on the server, from what
 * GET /api/tournament/<code> serves. Pure, relative imports only, tested
 * in standings.test.ts (npm run test:tournament).
 *
 * A fixture's result, first that applies:
 *  1. one the organiser entered (or corrected) by hand;
 *  2. its live scorecard, while that can be read: still being played, it
 *     is live and counts for nothing yet; finished, its result counts;
 *  3. the live result kept on the fixture when the scorer finished, for a
 *     scorecard turned off or cleared since.
 * Playoffs: a fixture whose teams the organiser has not set takes them
 * from the table once every league match has a result (1st v 4th and 2nd
 * v 3rd for the semi-finals, 1st v 2nd for a final with none), and a final
 * after semi-finals takes their winners. A tie or no result in a
 * semi-final sends the higher-placed team (listed first) through unless
 * the organiser sets the winner; in the final the title is shared.
 */

export type FixtureState = "scheduled" | "live" | "done";

export type Resolved = {
  fixture: Fixture;
  /** The teams playing: set on the fixture, or filled from the table or the semi-finals (filled). */
  home: number | null;
  away: number | null;
  filled: boolean;
  homeName: string | null;
  awayName: string | null;
  /** What an empty place says: "1st", "Winner SF1". */
  homeLabel: string;
  awayLabel: string;
  /** A playoff's places ("1st", "4th"; "SF1", "SF2" in a final after semis), shown beside its teams; null in the league. */
  seeds: [string, string] | null;
  state: FixtureState;
  source: "manual" | "live" | null;
  /** The result in the table's terms, home as A; null until there is one. */
  match: (MatchInput & { battedFirst: "a" | "b" }) | null;
  outcome: Outcome | null;
  /** "Titans won by 9 runs" */
  text: string | null;
  live: LiveNow | null;
  /** Who goes through from a playoff (a tie or no result: the team listed first). */
  winner: number | null;
};

export type TableRow = Standing & { id: number };

export type Resolution = {
  /** In the organiser's order. */
  fixtures: Resolved[];
  table: TableRow[];
  /** Every league match has a result. */
  leagueDone: boolean;
  played: number;
  total: number;
  /** A two-team series' score. */
  series: ReturnType<typeof seriesStatus> | null;
  /** The winner once it is decided; shared for a final (or a series) that ended level. */
  champion: { id: number } | { shared: true } | null;
  /** How many places go through to the playoffs (0: none). */
  qualify: number;
};

const ORDINAL = ["1st", "2nd", "3rd", "4th"];
const SLOT_LABELS: Record<Slot, [string, string]> = { s1: ["1st", "4th"], s2: ["2nd", "3rd"], f: ["1st", "2nd"] };

/** The format in a few words: "League + semi-finals", "Double round robin". */
export function formatLabel(s: Pick<Settings, "format" | "legs" | "matches" | "playoffs">): string {
  if (s.format === "bilateral") return `${s.matches}-match series`;
  const base = s.format === "tri" ? "Tri-series" : s.legs === 2 ? "Double round robin" : "League";
  return s.playoffs === "semis" ? `${base} + semi-finals` : s.playoffs === "final" ? `${base} + final` : base;
}

function resultOf(f: Fixture, homeName: string, awayName: string, live: LiveNow | null): { state: FixtureState; source: Resolved["source"]; r: ManualResult | null; text: string | null } {
  if (f.result) return { state: "done", source: "manual", r: f.result, text: f.result.text ?? null };
  if (live?.status === "live") return { state: "live", source: "live", r: null, text: null };
  const lr = live?.status === "done" && live.result ? live.result : f.liveResult;
  if (lr) return { state: "done", source: "live", r: orientLive(lr, homeName, awayName), text: lr.text };
  return { state: "scheduled", source: null, r: null, text: null };
}

/** Every fixture's state and result, the table, the playoffs and the winner. live: the server's LiveNow per fixture id. */
export function resolve(t: Pick<Tournament, "settings" | "teams" | "fixtures">, live: Record<string, LiveNow> = {}): Resolution {
  const byId = new Map<number, Team>(t.teams.map((x) => [x.id, x]));
  const name = (id: number | null) => (id === null ? null : (byId.get(id)?.name ?? null));
  const cfg = { ...t.settings.points, oversPerSide: t.settings.overs };
  const ordered = [...t.fixtures].sort((a, b) => a.seq - b.seq || a.id - b.id);

  const play = (f: Fixture, home: number | null, away: number | null, filled: boolean, labels: [string, string], seeds: [string, string] | null = null): Resolved => {
    const homeName = name(home);
    const awayName = name(away);
    const base = { fixture: f, home, away, filled, homeName, awayName, homeLabel: homeName ?? labels[0], awayLabel: awayName ?? labels[1], seeds, live: live[String(f.id)] ?? null };
    if (homeName === null || awayName === null || home === away) return { ...base, state: "scheduled", source: null, match: null, outcome: null, text: null, winner: null };
    const got = resultOf(f, homeName, awayName, base.live);
    if (!got.r) return { ...base, state: got.state, source: got.source, match: null, outcome: null, text: null, winner: null };
    const match = { id: String(f.id), teamA: homeName, teamB: awayName, a: got.r.a, b: got.r.b, result: got.r.result, battedFirst: got.r.battedFirst };
    const outcome: Outcome = decideResult(match);
    return { ...base, state: "done", source: got.source, match, outcome, text: got.text ?? describeResult(match, match.battedFirst), winner: outcome === "b" ? away : home };
  };

  const league = ordered.filter((f) => f.stage === "league").map((f) => play(f, f.home, f.away, false, ["Home", "Away"]));
  const names = t.teams.map((x) => x.name);
  const idOf = new Map(t.teams.map((x) => [x.name, x.id]));
  const table: TableRow[] = computeStandings(
    names,
    league.filter((r) => r.match).map((r) => r.match!),
    cfg,
  ).map((s) => ({ ...s, id: idOf.get(s.team)! }));
  const leagueDone = league.length > 0 && league.every((r) => r.state === "done");

  // Playoffs, in bracket order: the semi-finals before the final they feed.
  const slots = new Map<Slot, Resolved>();
  const playoffs: Resolved[] = [];
  const hasSemis = ordered.some((f) => f.slot === "s1" || f.slot === "s2");
  for (const f of [...ordered.filter((x) => x.stage === "semi"), ...ordered.filter((x) => x.stage === "final")]) {
    const slot = f.slot;
    let home = f.home;
    let away = f.away;
    let filled = false;
    let labels: [string, string] = slot ? SLOT_LABELS[slot] : ["Home", "Away"];
    if (slot === "f" && hasSemis) labels = ["Winner SF1", "Winner SF2"];
    if (slot && !slots.has(slot) && (home === null || away === null)) {
      const seeds: [number | null, number | null] =
        slot === "f" && hasSemis
          ? [slots.get("s1")?.winner ?? null, slots.get("s2")?.winner ?? null]
          : leagueDone
            ? slot === "s1"
              ? [table[0]?.id ?? null, table[3]?.id ?? null]
              : slot === "s2"
                ? [table[1]?.id ?? null, table[2]?.id ?? null]
                : [table[0]?.id ?? null, table[1]?.id ?? null]
            : [null, null];
      if (home === null && seeds[0] !== null) [home, filled] = [seeds[0], true];
      if (away === null && seeds[1] !== null) [away, filled] = [seeds[1], true];
    }
    const r = play(f, home, away, filled, labels, slot === "f" && hasSemis ? ["SF1", "SF2"] : slot ? SLOT_LABELS[slot] : null);
    if (slot && !slots.has(slot)) slots.set(slot, r);
    playoffs.push(r);
  }
  const inPlayoffs = new Set(playoffs.map((r) => r.fixture.id));
  const fixtures = ordered.map((f) => (inPlayoffs.has(f.id) ? playoffs.find((r) => r.fixture.id === f.id)! : league.find((r) => r.fixture.id === f.id)!));

  let series: Resolution["series"] = null;
  let champion: Resolution["champion"] = null;
  if (t.settings.format === "bilateral" && t.teams.length >= 2) {
    series = seriesStatus(t.teams[0].name, t.teams[1].name, league.filter((r) => r.match).map((r) => r.match!));
    if (leagueDone) champion = series.leader ? { id: idOf.get(series.leader)! } : { shared: true };
  } else {
    const final = slots.get("f");
    if (final) {
      if (final.state === "done") champion = final.outcome === "tie" || final.outcome === "nr" ? { shared: true } : { id: final.winner! };
    } else if (leagueDone && table[0]) champion = { id: table[0].id };
  }
  const done = fixtures.filter((r) => r.state === "done").length;
  const qualify = hasSemis ? 4 : slots.has("f") ? 2 : 0;
  return { fixtures, table, leagueDone, played: done, total: fixtures.length, series, champion, qualify };
}

/** "1st" to "4th" for a playoff place. */
export const placeLabel = (i: number) => ORDINAL[i] ?? `${i + 1}th`;
