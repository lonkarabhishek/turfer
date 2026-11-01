import { formatOvers, parseOvers } from "./overs";
import type { Innings, ResultChoice } from "./nrr";

/**
 * A match result as a form holds it, and back: runs, wickets and overs as
 * typed ("5.3" is five overs and three balls), the all-out ticks, who batted
 * first and the result (from the scores, a team, a tie or no result). The
 * Cricket Tournament Manager's match form and the live tournament's result
 * sheet both read and check a result here, so a result means the same in
 * either. Pure, relative imports only, tested in resultForm.test.ts
 * (npm run test:cricket).
 */

export type ScoreDraft = {
  aRuns: string;
  aWkts: string;
  aOvers: string;
  aAllOut: boolean;
  bRuns: string;
  bWkts: string;
  bOvers: string;
  bAllOut: boolean;
  result: ResultChoice;
  battedFirst: "a" | "b";
};

/** A result as it is kept: both innings in balls, the result and who batted first. */
export type ScoreResult = { a: Innings; b: Innings; result: ResultChoice; battedFirst: "a" | "b" };

export const emptyScoreDraft = (): ScoreDraft => ({ aRuns: "", aWkts: "", aOvers: "", aAllOut: false, bRuns: "", bWkts: "", bOvers: "", bAllOut: false, result: "auto", battedFirst: "a" });

/** A kept result back in the form, to edit it. */
export function scoreDraftOf(m: ScoreResult): ScoreDraft {
  return {
    aRuns: String(m.a.runs),
    aWkts: String(m.a.wickets),
    aOvers: formatOvers(m.a.balls),
    aAllOut: !!m.a.allOut,
    bRuns: String(m.b.runs),
    bWkts: String(m.b.wickets),
    bOvers: formatOvers(m.b.balls),
    bAllOut: !!m.b.allOut,
    result: m.result,
    battedFirst: m.battedFirst,
  };
}

/**
 * The form's result, or what is wrong with it, in the words the form
 * shows. names: the two teams, for the overs messages. A no result needs
 * no scores: whatever was typed is kept as far as it reads.
 */
export function readScoreDraft(d: ScoreDraft, names: { a: string; b: string }): { ok: ScoreResult } | { error: string } {
  const pa = parseOvers(d.aOvers);
  const pb = parseOvers(d.bOvers);
  if (d.result !== "nr") {
    if (d.aRuns === "" || d.bRuns === "") return { error: "Enter runs for both teams." };
    if ("error" in pa) return { error: `${names.a} overs: ${pa.error}` };
    if ("error" in pb) return { error: `${names.b} overs: ${pb.error}` };
    if (pa.balls === 0 || pb.balls === 0) return { error: "Overs must be more than 0 for a completed match. Use No result if the match was not played out." };
  }
  return {
    ok: {
      a: { runs: Number(d.aRuns || 0), wickets: Number(d.aWkts || 0), balls: "balls" in pa ? pa.balls : 0, allOut: d.aAllOut },
      b: { runs: Number(d.bRuns || 0), wickets: Number(d.bWkts || 0), balls: "balls" in pb ? pb.balls : 0, allOut: d.bAllOut },
      result: d.result,
      battedFirst: d.battedFirst,
    },
  };
}
