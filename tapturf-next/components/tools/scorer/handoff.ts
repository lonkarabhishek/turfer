import type { ScorecardFields } from "@/lib/cricket/scoring";

/**
 * "Make the result card": the live scorer leaves the final scores here
 * and opens the scorecard maker with ?from=live-scorer, which reads them.
 * They stay for an hour, so a reload (Android often reloads the tab after
 * sharing to WhatsApp) fills the card again; the next handoff overwrites
 * them. Kept apart from storage.ts so the scorecard maker does not load
 * the scoring engine.
 */
export const HANDOFF_KEY = "tapturf_scorecard_handoff_v1";

/** Hand the finished match to the scorecard maker. */
export function writeHandoff(fields: ScorecardFields, now: number) {
  try {
    localStorage.setItem(HANDOFF_KEY, JSON.stringify({ v: 1, at: now, fields }));
  } catch {
    /* ignore */
  }
}

/** Read the handoff. Only a fresh one (under an hour old) counts. */
export function takeHandoff(now: number): ScorecardFields | null {
  try {
    const raw = localStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const x = JSON.parse(raw) as { v?: number; at?: number; fields?: Partial<ScorecardFields> };
    if (!x || x.v !== 1 || typeof x.at !== "number" || now - x.at > 60 * 60 * 1000 || !x.fields) return null;
    const f = x.fields;
    const str = (v: unknown, max = 60) => (typeof v === "string" ? v.slice(0, max) : "");
    return {
      tournament: str(f.tournament, 48),
      aName: str(f.aName, 40),
      aRuns: str(f.aRuns, 4),
      aWkts: str(f.aWkts, 4),
      aOvers: str(f.aOvers, 6),
      bName: str(f.bName, 40),
      bRuns: str(f.bRuns, 4),
      bWkts: str(f.bWkts, 4),
      bOvers: str(f.bOvers, 6),
      result: str(f.result),
      potm: str(f.potm, 40),
      topScorer: str(f.topScorer, 40),
      bestBowler: str(f.bestBowler, 40),
      venue: str(f.venue, 48),
    };
  } catch {
    return null;
  }
}
