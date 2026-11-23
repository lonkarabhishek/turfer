import { deriveBoard } from "../board/index";
import { derive } from "../cricket/scoring";
import { isLiveBoard, sanitizeLive } from "../live/match";

/**
 * A live link's score line, worked out from its stored match exactly as
 * the follower page does (app/live/[code]/page.tsx describe): the cricket
 * engine's or the board engine's headline ("Titans 45/2 (4.3 ov)",
 * "Strikers won by 5 runs", "Red FC 2-1 Blue FC, 2nd half"), with the two
 * sides as they are named now (after renames). The score is not a field of
 * the match: it comes from the ball by ball list, so the server works it
 * out and sends the browser only this. null for anything that is not a
 * match. Pure, relative imports only (npm run test:matches).
 */
export type MatchLine = { line: string; teamA: string; teamB: string };

export function matchLine(raw: unknown): MatchLine | null {
  const match = raw == null ? null : sanitizeLive(raw);
  if (!match) return null;
  if (isLiveBoard(match)) {
    const v = deriveBoard(match);
    return { line: v.headline, teamA: v.teams.a.name, teamB: v.teams.b.name };
  }
  const v = derive(match);
  return { line: v.headline, teamA: v.setup.teamA, teamB: v.setup.teamB };
}
