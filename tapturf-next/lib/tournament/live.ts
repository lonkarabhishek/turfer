import type { InningsView, MatchView } from "../cricket/scoring";
import type { Innings } from "../cricket/nrr";
import { formatOvers } from "../cricket/overs";
import type { LiveNow, LiveResult, ManualResult } from "./types";

/**
 * A fixture scored on the Live Cricket Scorer: what the live scorecard
 * says, in the tournament's terms. Pure (the server derives the match and
 * passes its view), relative imports only, tested in live.test.ts
 * (npm run test:tournament).
 *
 * The scorer opens with the fixture's home team as team A and its away
 * team as team B, but whoever scores can type the names the other way
 * round. So a result is kept as the match had it, with its names
 * (liveResultOf), and turned to home and away by name when it is read
 * (orientLive): swapped only when the names say so, else as it came.
 */

/** Runs, wickets and legal balls of a side's innings, and whether it was bowled out; a side that never batted has none. */
function inningsOf(view: Pick<MatchView, "innings">, side: "a" | "b"): (Innings & { ended: InningsView["ended"] }) | null {
  const inn = view.innings.find((i) => i.batting === side);
  return inn ? { runs: inn.runs, wickets: inn.wickets, balls: inn.legalBalls, allOut: inn.ended === "allOut", ended: inn.ended } : null;
}

type ViewPart = Pick<MatchView, "status" | "innings" | "result" | "teams">;

/** A finished match's result, as the match had it; null while it is still being played. */
export function liveResultOf(view: ViewPart): LiveResult | null {
  if (view.status !== "done" || !view.result) return null;
  const side = (s: "a" | "b") => {
    const inn = inningsOf(view, s);
    return { name: view.teams[s].name.slice(0, 40), runs: inn?.runs ?? 0, wickets: inn?.wickets ?? 0, balls: inn?.balls ?? 0, allOut: inn?.allOut ?? false };
  };
  const r = view.result;
  const outcome: LiveResult["outcome"] = r.kind === "tie" ? "tie" : r.kind === "noResult" ? "nr" : r.winner === "b" ? "b" : "a";
  return { a: side("a"), b: side("b"), outcome, battedFirst: view.innings[0]?.batting === "b" ? "b" : "a", text: r.text.slice(0, 120) };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Whether the match's team A is the fixture's away team: the names say so, and nothing says otherwise. */
export function flipped(lr: { a: { name: string }; b: { name: string } }, home: string, away: string): boolean {
  const a = norm(lr.a.name);
  const b = norm(lr.b.name);
  const h = norm(home);
  const w = norm(away);
  if (h === w) return false;
  return (a === w || b === h) && !(a === h || b === w);
}

/** The live result with home as a and away as b, as a hand-entered result is kept: the scorer's winner stands. */
export function orientLive(lr: LiveResult, home: string, away: string): ManualResult {
  const flip = flipped(lr, home, away);
  const strip = ({ runs, wickets, balls, allOut }: LiveResult["a"]): Innings => ({ runs, wickets, balls, allOut });
  const swap = (s: "a" | "b"): "a" | "b" => (flip ? (s === "a" ? "b" : "a") : s);
  return {
    a: strip(flip ? lr.b : lr.a),
    b: strip(flip ? lr.a : lr.b),
    result: lr.outcome === "tie" || lr.outcome === "nr" ? lr.outcome : swap(lr.outcome),
    battedFirst: swap(lr.battedFirst),
  };
}

/** A side's "45/3" and "5.2", or null before it bats. */
function scoreOf(view: Pick<MatchView, "innings">, side: "a" | "b"): { score: string; overs: string } | null {
  const inn = inningsOf(view, side);
  return inn ? { score: `${inn.runs}/${inn.wickets}`, overs: formatOvers(inn.balls) } : null;
}

/**
 * A linked scorecard as the fixture's card shows it, home as a: its
 * status, the headline, each side's score and who bats, and the result
 * once it is over. off and waiting carry no match (view null).
 */
export function liveNowOf(
  link: { status: "live" | "done" | "off" | "waiting"; closed: boolean; updatedAt: string | null },
  view: (ViewPart & Pick<MatchView, "headline" | "current">) | null,
  home: string,
  away: string,
): LiveNow {
  if (!view || link.status === "off" || link.status === "waiting") {
    return { status: link.status === "off" ? "off" : "waiting", closed: false, headline: "", a: null, b: null, batting: null, updatedAt: link.updatedAt, result: null };
  }
  const result = liveResultOf(view);
  // Read by the names the scorer used, as a result is.
  const names = { a: { name: view.teams.a.name }, b: { name: view.teams.b.name } };
  const flip = flipped(names, home, away);
  const a = scoreOf(view, flip ? "b" : "a");
  const b = scoreOf(view, flip ? "a" : "b");
  const bat = view.status === "live" ? view.current.batting : null;
  return {
    status: view.status,
    closed: link.closed,
    headline: view.headline.slice(0, 140),
    a,
    b,
    batting: bat === null ? null : flip ? (bat === "a" ? "b" : "a") : bat,
    updatedAt: link.updatedAt,
    result,
  };
}
