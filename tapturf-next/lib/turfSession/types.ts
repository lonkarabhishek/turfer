import type { Innings } from "../cricket/nrr";
import type { Rules } from "../cricket/scoring";
import type { Venue } from "../tournament/types";

/**
 * A turf session (/tools/turf-session): one group, one turf slot, a few
 * short matches back to back between the same two sides, and the running
 * result (Titans 3 - 2 Strikers). Kept on the phone first
 * (lib/turfSession/store.ts, tapturf_turf_session_v1). A match scored ball
 * by ball is an ordinary Live Cricket Scorer match (its own keys,
 * tapturf_scorer_*): the session keeps its id, and a copy of its result and
 * its batting and bowling lines, so the summary outlives the scorer's
 * 25-match cap. A match typed in as a final score has only the copy. A
 * live link is an ordinary bilateral live tournament (lib/turfSession/sync.ts).
 * Types only, so every side and the tests can use them.
 */

export type Format = "box" | "cricket";
export type SideKey = "a" | "b";

/** A side's name (30 at most, as a tournament team's) and its players (up to 30, 40 characters each). */
export type Side = { name: string; players: string[] };

/** A match's result: side a is the scorer's team A, the tournament's home team (team 1). */
export type MatchResult = { a: Innings; b: Innings; outcome: "a" | "b" | "tie" | "nr"; text: string };

export type BatLine = [name: string, side: SideKey, runs: number, balls: number, out: boolean];
export type BowlLine = [name: string, side: SideKey, wickets: number, runs: number, balls: number];

export type SessionMatch = {
  /** 1 up, in the order played; renumbered when one is taken out. */
  n: number;
  /** balls: scored on the Live Cricket Scorer (matchId); final: just the final score, typed in. */
  kind: "balls" | "final";
  matchId: string | null;
  battedFirst: SideKey;
  overs: number;
  playersPerSide: number;
  lastManStands: boolean;
  /** Null until the match is over (a scored match taken back by Undo goes back to null). */
  result: MatchResult | null;
  bat: BatLine[];
  bowl: BowlLine[];
  /** Balls bowled so far, both innings (wides and no-balls count: a first-ball wide has started it); 0 is a match not started. A typed match: its legal balls. */
  balls: number;
  at: number;
};

export type LiveError = null | "login" | "taken" | "not_in_game" | "limit" | "busy" | "stopped" | "failed";

export type LiveState = {
  /** The organiser asked for a link (or the game's link is due once match 1 is over). */
  want: boolean;
  /** This phone's tournament secret, saved before the create is sent. */
  secret: string | null;
  code: string | null;
  /** Per match number: the hash of the result the live page has (sync.ts hashResult). */
  pushed: Record<string, string>;
  /** The two team names the live page has, as "A\u0000B". */
  teamsPushed: string | null;
  ended: boolean;
  error: LiveError;
  /** Another phone has this game's link: its code, to follow it. */
  follow: string | null;
};

export type Session = {
  v: 1;
  id: string;
  createdAt: number;
  updatedAt: number;
  format: Format;
  /** The turf's name or a typed venue, 48 at most. */
  venue: string;
  /** The TapTurf turf, when the session came from a game there; the live page links it. */
  turf: Venue | null;
  /** India YYYY-MM-DD. */
  day: string;
  overs: number;
  playersPerSide: number;
  rules: Rules;
  /** Ask who bats and bowls (the scorer's sheets); off: quick mode picks them. */
  pick: boolean;
  sides: { a: Side; b: Side };
  /** Who bats first in match 1; after that it alternates. */
  firstBat: SideKey;
  /** Matches planned, or null for not sure. */
  plan: number | null;
  matches: SessionMatch[];
  ended: number | null;
  /**
   * The game it was started from; its live link is the game's (lib/tournament/codes.ts gameTournamentCode).
   * local: "Score on this phone instead" (another phone has the game's link): found from the game page on this
   * phone, but its live link, if any, is an ordinary one, never the game's.
   */
  game: { id: string; start: string; end: string; local?: true } | null;
  live: LiveState;
};
