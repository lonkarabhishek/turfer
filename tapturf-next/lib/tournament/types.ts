import type { Innings, PointsConfig, ResultChoice } from "../cricket/nrr";

/**
 * Live tournaments (/tournament/<code>): the contract shared by the
 * organiser's browser, the API routes, the follower page and the tests.
 * No imports but types, so every side and the unit tests can use it.
 *
 * Flow. The organiser sets up a tournament (/tournament/new, or "Go live"
 * on the Cricket Tournament Manager): their browser makes a secret of its
 * own and sends the setup, teams and fixtures (POST /api/tournament); the
 * server mints the code and keeps only the secret's sha256
 * (supabase/migrations/20261102_live_tournaments.sql). Every change after
 * that carries the secret (PATCH /api/tournament/<code>). A signed-in
 * organiser's tournament is kept with their account, so another device of
 * theirs can add a secret of its own (POST /api/tournament/<code>/claim).
 * Followers open /tournament/<code> and poll GET /api/tournament/<code>,
 * which the CDN and the data cache answer.
 *
 * A fixture can be scored live: "Score live" opens the Live Cricket Scorer
 * with the two teams and the overs filled in, and once its live link has a
 * code the fixture is linked to it. Followers see that match's score from
 * the live link itself, and when it finishes its result is kept on the
 * fixture (lib/tournament/live.ts) and counts in the table. A result the
 * organiser enters by hand always wins.
 */

/** Minted by the server like the live links' codes (lib/tournament/codes.ts), so made-up codes are refused without a lookup. */
export const TOURNAMENT_CODE_RE = /^[a-z0-9]{12}$/;
/** 32 random bytes as hex, made in the organiser's browser. Only its sha256 is stored. */
export const TOURNAMENT_SECRET_RE = /^[0-9a-f]{64}$/;
/** A live scorecard's code (lib/live/types.ts LIVE_CODE_RE); the routes check its tag too. */
export const LIVE_LINK_CODE_RE = /^[a-z0-9]{12}$/;

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 16;
/** A double round robin of 16 is 240 matches; playoffs and a few extra fit under this. */
export const MAX_FIXTURES = 300;
export const NAME_MAX = 60;
export const TEAM_MAX = 30;
export const SHORT_MAX = 4;
/** A bilateral series of at most this many matches. */
export const MAX_SERIES = 9;
export const MAX_OVERS = 50;
export const MAX_ROUND = 99;

/** Followers poll this often while a match is being scored live and the page is on screen... */
export const TOURNAMENT_LIVE_POLL_MS = 10_000;
/** ...and this often otherwise. Hidden pages do not poll. */
export const TOURNAMENT_POLL_MS = 30_000;
export const TOURNAMENT_POLL_TIMEOUT_MS = 8_000;

/** League (round robin, once or twice), a two-team series, or a three-team series. */
export type Format = "league" | "bilateral" | "tri";
/** After the league: none, a final between the top two, or semi-finals (1st v 4th, 2nd v 3rd) and a final. */
export type Playoffs = "none" | "final" | "semis";
export type Stage = "league" | "semi" | "final";
/** A playoff fixture's place in the bracket: semi-final 1 and 2, and the final. */
export type Slot = "s1" | "s2" | "f";

export type Points = Omit<PointsConfig, "oversPerSide">;
export const DEFAULT_TOURNAMENT_POINTS: Points = { win: 2, tie: 1, nr: 1, loss: 0 };

/** A TapTurf turf the organiser picked, linked to its page. */
export type Venue = { id: string; slug: string | null; name: string; area: string | null };

export type Settings = {
  format: Format;
  /** Round robin once (1) or home and away (2). A series ignores it. */
  legs: 1 | 2;
  /** A bilateral series' number of matches. */
  matches: number;
  playoffs: Playoffs;
  /** Overs a side, for the scorer and the all-out rule; null: the overs faced count as they are. */
  overs: number | null;
  points: Points;
  venue: Venue | null;
  /** YYYY-MM-DD, India's days. */
  starts: string | null;
  ends: string | null;
};

export type Team = { id: number; name: string; short: string | null };

/** A result entered by hand, home as a, away as b. */
export type ManualResult = { a: Innings; b: Innings; result: ResultChoice; battedFirst: "a" | "b" };

/**
 * A live scorecard's result as it finished, as its match had it (team a
 * and b of the scorer, with the names it used), kept on the fixture when
 * the scorer sent it (lib/tournament/live.ts orients it to home and away).
 */
export type LiveResult = {
  a: Innings & { name: string };
  b: Innings & { name: string };
  outcome: "a" | "b" | "tie" | "nr";
  battedFirst: "a" | "b";
  /** "Titans won by 9 runs" */
  text: string;
};

export type Fixture = {
  id: number;
  stage: Stage;
  slot: Slot | null;
  round: number;
  /** Order in the list; the organiser can move fixtures. */
  seq: number;
  /** Team ids; a playoff fixture's are null until set (the table fills them in on the page). */
  home: number | null;
  away: number | null;
  /** YYYY-MM-DD and HH:MM, India's time. */
  day: string | null;
  time: string | null;
  result: ManualResult | null;
  /** The live scorecard's code (/live/<code>) when it is scored live. */
  live: string | null;
  liveResult: LiveResult | null;
};

/** What a follower is served: never the secret, the network hash or who organises it. */
export type Tournament = {
  code: string;
  status: "on" | "removed";
  name: string;
  settings: Settings;
  teams: Team[];
  fixtures: Fixture[];
  rev: number;
  createdAt: string;
  updatedAt: string;
};

/** A linked live scorecard as it stands, for the fixture's card. Worked out by the server from the live link. */
export type LiveNow = {
  /** live: being scored; done: finished; off: the link was turned off or expired; waiting: no score yet. */
  status: "live" | "done" | "off" | "waiting";
  /** Closed after 2 hours without an update (still live by its status). */
  closed: boolean;
  /** "Titans 45/3 (5.2 ov) · need 20 off 14" */
  headline: string;
  /** Per team of the fixture (home a, away b): "45/3" and "5.2", null before that side bats. */
  a: { score: string; overs: string } | null;
  b: { score: string; overs: string } | null;
  /** The side batting now (home a, away b). */
  batting: "a" | "b" | null;
  updatedAt: string | null;
  /** The finished match's result, as the match had it (lib/tournament/live.ts orientLive turns it to home and away). */
  result: LiveResult | null;
};

/** GET /api/tournament/<code>. live: per fixture id, for the fixtures scored live. */
export type TournamentGetResponse = { tournament: Tournament; live: Record<string, LiveNow>; at: number };

/** POST /api/tournament body. fixtures: as the organiser's browser made them (lib/tournament/fixtures.ts); left out, the server makes them. */
export type CreateBody = {
  secret: string;
  name: string;
  settings: Settings;
  teams: { name: string; short: string | null }[];
  fixtures?: Omit<Fixture, "live" | "liveResult">[];
};

/** Changes, one at a time (PATCH /api/tournament/<code> { secret, op, ...data }). */
export type Op =
  | { op: "settings"; name: string; settings: Settings }
  | { op: "team"; id: number; name: string; short: string | null }
  | { op: "fixture_add"; stage: Stage; slot: Slot | null; round: number; home: number | null; away: number | null; day: string | null; time: string | null }
  | { op: "fixture_edit"; id: number; round: number; home: number | null; away: number | null; day: string | null; time: string | null }
  | { op: "fixture_remove"; id: number }
  | { op: "fixture_order"; ids: number[] }
  /** result null clears a hand-entered result (a live one shows again). home and away pin a playoff's teams. */
  | { op: "result"; id: number; result: ManualResult | null; home?: number | null; away?: number | null }
  | { op: "live_link"; id: number; liveCode: string; home?: number | null; away?: number | null }
  | { op: "live_unlink"; id: number }
  | { op: "remove" };

export type OpName = Op["op"];

/**
 * Answers, HTTP status in brackets:
 * forbidden (403) this browser's secret is not the tournament's.
 * gone (410) taken down, or no such tournament.
 * taken (409) a team name already used in it.
 * limit (429) too many new tournaments from this network (5 an hour, 20 a day), or too many changes.
 * busy (503) too many new tournaments site-wide this hour.
 * slow (429) changes too close together: try again in a moment.
 * bad (400) malformed. login (401) a claim without a sign-in. unavailable (503) not set up or the database is down.
 */
export type TournamentError = "forbidden" | "gone" | "taken" | "limit" | "busy" | "slow" | "bad" | "login" | "unavailable";

export type CreateResponse = { code: string; rev: number } | { error: TournamentError };
export type PatchResponse = { ok: true; rev: number; view: TournamentGetResponse | null } | { error: TournamentError; field?: string };

/** A tournament of the signed-in organiser (GET /api/tournament/mine). */
export type MineItem = { code: string; name: string; format: Format; status: "on" | "removed"; teams: number; fixtures: number; played: number; createdAt: string; updatedAt: string };

export function tournamentUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/tournament/${code}`;
}
