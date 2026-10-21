import { isBoard, sanitizeBoard } from "../board/index";
import type { Board } from "../board/types";
import { sanitizeMatch, type Match } from "../cricket/scoring";

/**
 * What a live link carries: a cricket match (Live Cricket Scorer) or a
 * board (Live Scoreboard). Client safe and relative imports only, so the
 * follower page, the API route and the unit tests can all use it
 * (lib/live/server.ts pulls in node:crypto and next/cache).
 */
export type LiveMatch = Match | Board;

/** A board, not a cricket match: the type guard for a LiveMatch already rebuilt. */
export const isLiveBoard = (m: LiveMatch): m is Board => (m as Partial<Board>).kind === "board";

/**
 * Rebuild whatever a live link holds from the right engine's whitelist.
 * Every reader of live data goes through here: read as a cricket match,
 * a board would come back as an empty 0/0 scorecard with no error.
 */
export function sanitizeLive(raw: unknown): LiveMatch | null {
  return isBoard(raw) ? sanitizeBoard(raw) : sanitizeMatch(raw);
}
