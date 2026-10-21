/**
 * Live Scoreboard: keep score for any turf or court sport other than
 * cricket (which has its own ball by ball scorer), and share it live on
 * the same live links (lib/live). The contract every part builds on:
 * the board, its events, what derive shows, the pad and the engines.
 *
 * Event sourced, like lib/cricket/scoring.ts: a board is its setup plus
 * an append-only list of events. Everything shown comes from
 * deriveBoard(board), one pass over the events, so undo is dropping the
 * last event and a board read back from storage or a live link shows
 * exactly what the scorer saw. Engines are pure: no Date.now(), no
 * randomness; time comes in on the events (`at`) or as an argument.
 */

import type { Tag } from "../account/tag";
export type { Tag } from "../account/tag";

export const BOARD_SPORTS = ["football", "basketball", "volleyball", "badminton", "pickleball", "tennis", "table-tennis", "padel", "other"] as const;
export type BoardSport = (typeof BOARD_SPORTS)[number];
export type Side = "a" | "b";

/* ------------------------------------------------------------------ */
/* Rules, one shape per sport (every field filled by normalizeRules)   */
/* ------------------------------------------------------------------ */

/** Football and futsal on a turf. The clock counts up; time past a half's length is stoppage time. */
export type FootballRules = {
  /** 1 or 2 halves. */
  halves: number;
  /** Minutes per half, 5 to 60. Turf games are often 2 x 20 or 2 x 25. */
  halfMinutes: number;
  /** Track yellow and red cards. */
  cards: boolean;
  /** A level score at full time goes to penalties (a shootout of rounds of one kick each side). */
  penalties: boolean;
  /** Kicks each in the shootout before sudden death: 5 (IFAB Law 10), 3 on many 5-a-side turfs. */
  shootoutKicks: number;
};

/** Basketball. Quarters or halves; the clock counts down when used. */
export type BasketballRules = {
  /** 4 quarters or 2 halves. */
  periods: number;
  /** Minutes per period, 1 to 20. */
  periodMinutes: number;
  /** Run a game clock. Pickup games often play to a score with no clock. */
  clock: boolean;
  /** First to this many points ends the game, with or without the clock (pickup "to 21", FIBA 3x3 21). null: play the periods. */
  target: number | null;
  /** With target: lead needed to win (pickup "win by 2"). 1 or 2. */
  winBy: number;
  /** "2s-3s": +1 free throw, +2, +3. "1s-2s" (3x3 and pickup): +1 inside, +2 outside, +1 free throw. */
  scoring: "2s-3s" | "1s-2s";
  /** Team fouls in a period after which every further foul gives free throws (FIBA Art. 41.1.1: 4; 3x3: 6). The notice shows once fouls >= foulLimit. Overtime continues the last period's count (Art. 41.1.3). */
  foulLimit: number;
};

/**
 * Rally point sports: badminton, volleyball, table tennis. A game (set)
 * is won at `points` with a lead of `winBy`, or at `cap` outright. The
 * deciding game is game number bestOf, and only when bestOf > 1:
 * decidingPoints, decidingToss and the deciding-game notices ignore
 * bestOf 1.
 */
export type RallyRules = {
  points: number;
  winBy: number;
  /** The next point wins at cap-1 all. Badminton: 30 for 21-point games, 21 for 15-point games (BWF 3x15). null: no cap. */
  cap: number | null;
  /** Games (sets) in the match: 1, 3, 5 or 7. The match ends when one side cannot be caught. */
  bestOf: number;
  /** Points in the deciding game when it differs (volleyball's 5th set to 15). null: same as `points`. */
  decidingPoints: number | null;
  /**
   * Who serves during a game. "winner": the side that won the rally
   * (badminton, volleyball). A number: the serve changes every that
   * many points, and every point once both reach points - 1 (table
   * tennis: 2).
   */
  serve: "winner" | number;
  /** First server of the next game: "winner" of the last game (badminton Law 7.6) or "alternate": the side that received first in the last game (volleyball FIVB 12.1.2, table tennis ITTF 2.13.6). */
  nextGame: "winner" | "alternate";
  /** Volleyball: a new toss for the deciding set (FIVB 12.1.1): needsServe is true again at its start. */
  decidingToss: boolean;
  doubles: boolean;
};

/** Pickleball with traditional side-out scoring: only the serving side scores; doubles has server 1 and 2 and starts at 0-0-2. */
export type PickleballRules = {
  scoring: "sideout" | "rally";
  /** 11, 15 or 21 (rally games are usually 15 or 21). Every game of side-out doubles starts 0-0-2. */
  points: number;
  winBy: number;
  bestOf: number;
  /** Rally scoring: a point that would win the game counts only for the serving side; a receiving side that wins that rally just gets the serve (USA Pickleball provisional rally rule). */
  gamePointOnServe: boolean;
  doubles: boolean;
};

/** Tennis and padel: points, games, sets. */
export type TennisRules = {
  /** Sets in the match: 1, 3 or 5. */
  bestOf: number;
  /** Games to win a set: 6, or 4 for short sets. */
  games: number;
  /** At games-all (6-6) play a tiebreak to 7, win by 2. false: play on until two clear. */
  tiebreak: boolean;
  /** The deciding set: a normal set, or a 10 point match tiebreak in its place (common in padel and club doubles). Always "normal" when bestOf is 1. */
  finalSet: "normal" | "match-tiebreak";
  /**
   * advantage: win by 2 points after 40-40. golden: at the first deuce
   * the next point wins (tennis "no-ad"). star: advantage at the first
   * two deuces, and at the third deuce the next point wins (FIP 2026).
   * Receivers pick the side for a golden or star point.
   */
  deuce: "advantage" | "golden" | "star";
  doubles: boolean;
};

/** Anything else: points for each side, optionally to a target, optionally in periods. */
export type OtherRules = {
  /** The sport's name, shown in place of a sport ("Kabaddi", "Ultimate frisbee"). */
  name: string;
  /** First to this many wins. null: no target. */
  target: number | null;
  /** Periods (halves, rounds) to play, or null for one continuous game. */
  periods: number | null;
  /** Point buttons offered: [1] for most, [1, 2, 3] for basketball-like games. */
  values: number[];
};

export type RulesFor = {
  football: FootballRules;
  basketball: BasketballRules;
  volleyball: RallyRules;
  badminton: RallyRules;
  "table-tennis": RallyRules;
  pickleball: PickleballRules;
  tennis: TennisRules;
  padel: TennisRules;
  other: OtherRules;
};
export type AnyRules = RulesFor[BoardSport];

/* ------------------------------------------------------------------ */
/* The board                                                           */
/* ------------------------------------------------------------------ */

export type BoardSetup = {
  /** Team or player names, cleaned, at most 32 characters. Doubles: "Asha / Ravi". */
  teamA: string;
  teamB: string;
  /** Tournament or series, optional, at most 48. */
  title: string;
  venue: string;
  rules: AnyRules;
  /**
   * Racquet sports (badminton, pickleball, tennis, table tennis, padel):
   * the TapTurf profile tagged on each singles player, by side. Present
   * only when at least one side is tagged, and never on other sports. A
   * rename can set or clear it later (see RenameEvent). Kept while the
   * rules are doubles, shown only while they are singles.
   */
  tags?: Partial<Record<Side, Tag>>;
};

/** kind tells a board from a cricket match wherever both travel (storage, live links, the follower page). */
export type Board = {
  v: 1;
  kind: "board";
  id: string;
  createdAt: number;
  sport: BoardSport;
  setup: BoardSetup;
  events: BoardEvent[];
  /** Only on the copy sent to a live link: the scorer's Date.now() at send. The follower's clock ticks from it. derive ignores it. */
  sentAt?: number;
};

/** What the setup screen hands newBoard. Everything optional. */
export type BoardInput = {
  teamA?: string;
  teamB?: string;
  title?: string;
  venue?: string;
  rules?: Partial<AnyRules>;
  /** Racquet sports: who serves first. Asked before the first point when left out. */
  firstServe?: Side;
  /** Racquet sports: the singles players' TapTurf profiles. Invalid ones, and any on other sports, are dropped. */
  tags?: Partial<Record<Side, Tag | null>>;
};

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

/** Every event may carry `at`: the scorer's wall clock in ms. Only clock maths and minutes use it. */
type Stamp = { at?: number };

/**
 * Points for a side. value: 1 by default; basketball 1, 2 or 3. how:
 * football "goal" | "penalty" | "own-goal" (an own goal is scored for
 * `side` by the other team; player is the one who put it in);
 * basketball "free-throw" | "two" | "three" (2s-3s) or "free-throw" |
 * "inside" | "outside" (1s-2s); a penalty shootout kick "shootout-goal"
 * | "shootout-miss" (does not change the score; side = the kicking
 * team); racquet sports optionally "ace" (side = server) or
 * "double-fault" (side = receiver), for stats only. player: an optional
 * name typed by the scorer, at most 40 characters. tag: the TapTurf
 * profile picked for that player, only ever next to a player name.
 * Football and basketball list a tagged player once per tag (whatever
 * the spelling typed), an untagged one once per name.
 */
export type PointEvent = Stamp & { type: "point"; side: Side; value?: number; how?: string; player?: string; tag?: Tag };
/** Football cards. */
export type CardEvent = Stamp & { type: "card"; side: Side; color: "yellow" | "red"; player?: string; tag?: Tag };
/** Basketball team fouls (player optional). */
export type FoulEvent = Stamp & { type: "foul"; side: Side; player?: string; tag?: Tag };
/** Start (run true) or stop the clock. `at` is required. ms sets the period clock to that value at `at` (elapsed counting up, left counting down): "Set time". A period or end event stops a running clock at its own `at`. */
export type ClockEvent = { type: "clock"; run: boolean; at: number; ms?: number };
/** End the current half, quarter or period (timed and "other" sports). Sets and games end by themselves. */
export type PeriodEvent = Stamp & { type: "period" };
/**
 * Racquet sports and volleyball: who serves now (first serve, or a
 * correction). Mid-game it means the scorer had the first server wrong:
 * table tennis and tiebreaks flip that game's first server (so the next
 * game's first server follows from it); other sports set the server from
 * now and carry on the normal order. server: side-out doubles
 * pickleball's server 1 or 2.
 */
export type ServeEvent = Stamp & { type: "serve"; side: Side; server?: 1 | 2 };
/**
 * End the match now. No reason: time up (court hour over): decided on
 * the score (set sports: sets, then games in the unfinished set, then
 * points; level: drawn). "abandoned": no result. "retired", "walkover",
 * "conceded": `side` is the side that stops, and the other side wins.
 */
export type EndEvent = Stamp & { type: "end"; reason?: "abandoned" | "retired" | "walkover" | "conceded"; side?: Side };
/**
 * Rename a team or player. tag, racquet sports only: left out keeps the
 * side's tag as it is, null clears it, a tag sets it. A change of tag
 * alone carries the side's current name.
 */
export type RenameEvent = Stamp & { type: "rename"; side: Side; name: string; tag?: Tag | null };
export type TimeoutEvent = Stamp & { type: "timeout"; side: Side };
/** Change rules from here on; earlier games, sets and periods stay as played. check() refuses a change the current state cannot take ("Score is 16-12 already; pick 21"). */
export type RulesEvent = Stamp & { type: "rules"; rules: Partial<AnyRules> };

export type BoardEvent = PointEvent | CardEvent | FoulEvent | ClockEvent | PeriodEvent | ServeEvent | EndEvent | RenameEvent | TimeoutEvent | RulesEvent;

/* ------------------------------------------------------------------ */
/* The view                                                            */
/* ------------------------------------------------------------------ */

export type TimelineLine = {
  /** Stable for React keys: the event's index. */
  key: number;
  side: Side | null;
  /** "Goal! Ravi", "Yellow card, Arjun", "Set 2 to Asha, 21-17", "Half time". */
  text: string;
  /** Football minute ("34'", "45+2'"), basketball "Q3 4:12", or null. */
  when: string | null;
  /** 0-based period, set or game the line belongs to. */
  period: number;
  tone: "score" | "card" | "info" | "end";
  /** The score after this line, "2-1" or "21-19". */
  score: string | null;
};

export type BoardView = {
  /** The board's id, so views key per match (a live link can move to the next match). */
  id: string;
  sport: BoardSport;
  /** "Football", or OtherRules.name. */
  sportName: string;
  status: "live" | "done";
  /** Names and tags as now (after renames) and the rules in force now (after rules events). */
  setup: BoardSetup;
  /** tag: the singles player's TapTurf profile, only while the rules in force are singles in a racquet sport; left out otherwise. */
  teams: Record<Side, { name: string; score: number; tag?: Tag }>;
  /** What teams[x].score counts: "Goals", "Points", "Sets", "Games". */
  scoreUnit: string;
  /** Racquet and set sports: the score inside the current game or set ("40" / "AD", "18" / "20"). null when the main score says it all. */
  current: Record<Side, string> | null;
  /** "Set 3", "Game 5, set 2", "Tiebreak", "Match tiebreak", or null. */
  currentLabel: string | null;
  /** Halves, quarters, periods: "1st half", "Q3", "Half time", "Full time". null for set sports. */
  period: { index: number; of: number | null; label: string; break: boolean } | null;
  /**
   * The clock as of `at` (the scorer's wall clock, ms): ms elapsed in
   * this period (counting up) or left (down). Shown time: running ?
   * ms +/- (now - at) : ms. null when the sport or rules have no clock.
   */
  clock: {
    running: boolean;
    ms: number;
    at: number | null;
    /** Length of this period, or null with no limit. Up clocks past it are in stoppage time. */
    limitMs: number | null;
    down: boolean;
    /** Added to the shown value for the match clock: football's earlier halves (2nd half starts at 20:00 in 2 x 20). 0 otherwise. */
    baseMs: number;
  } | null;
  server: Side | null;
  /** Pickleball's call "4-2-1", badminton's "Right court", or null. */
  serveNote: string | null;
  /** Racquet sports: the first serve has not been picked yet. Points wait for it. */
  needsServe: boolean;
  /** Finished sets or games and the one in play (last), with tiebreak points when one was played. A match tiebreak (in place of the deciding set) has a and b as its points and matchTiebreak true, written [10-8]. */
  sets: { a: number; b: number; winner: Side | null; tiebreak: { a: number; b: number } | null; matchTiebreak?: boolean }[];
  timeline: TimelineLine[];
  /** Per sport: goals, cards, fouls, timeouts, points won, longest run, aces... a: and b: as shown. */
  stats: { label: string; a: string; b: string }[];
  /** Scorers and cards for football; top scorers for basketball. Empty when no names were typed. A tagged player is one row per tag, named as first typed, with the tag. */
  players: { side: Side; name: string; text: string; tag?: Tag }[];
  /** "Set point Asha", "Match point", "Deuce", "Golden point", "Change ends", "Blue in the bonus", "Interval". Shown until the next point. Time-based ones ("Stoppage time", "Time up") are the UI's, from clockMs. */
  notices: string[];
  /** Racquet sports and volleyball: a game or set just ended; the pad waits for "Start game N" (optionally with "Swap sides"). Never stored: the next point clears it. */
  gameJustEnded: { label: string; changeEnds: boolean } | null;
  /** The mid-game change of ends just came up (11 in badminton's deciding game, 5 in table tennis, 8 in volleyball, odd games in tennis): the UI offers "Swap sides". */
  changeEnds: boolean;
  /** One line for lists and link previews: "Red FC 2-1 Blue FC, 2nd half", "Asha leads Ravi 1-0 (21-17, 8-6)". */
  headline: string;
  result: { winner: Side | null; kind: "win" | "draw" | "abandoned"; text: string } | null;
  /** What the last event did, for the undo toast: "Goal, Red FC". */
  lastAction: string | null;
  /** The newest event's `at`, for the follower's clock (see LiveFollow). */
  lastAt: number | null;
  eventCount: number;
};

/* ------------------------------------------------------------------ */
/* The pad                                                             */
/* ------------------------------------------------------------------ */

/**
 * One button on the scorer's pad. The UI renders actions grouped by
 * side (a, b, then null for match-wide ones) in order, and on tap
 * commits `event` (stamping `at`). ask "player": first offer an
 * optional name sheet ("Who scored? Skip"), then commit with player set.
 */
export type PadAction = {
  id: string;
  side: Side | null;
  label: string;
  /** Smaller second line ("+2", "Penalty"). */
  sub?: string;
  /** primary: the big main button (Point, Goal, +2). */
  tone: "primary" | "plain" | "warn" | "danger";
  event: BoardEvent;
  ask?: "player";
  /** Shown but not tappable, with the reason as its label's title. */
  disabled?: string;
};

/* ------------------------------------------------------------------ */
/* Engines                                                             */
/* ------------------------------------------------------------------ */

/** One preset row on the setup screen: chips that set some rules ("2 x 20", "2 x 25", "Custom"). */
export type RulePreset<R> = { key: string; label: string; options: { label: string; rules: Partial<R> }[] };

/**
 * One sport. lib/board/<family>.ts export these; lib/board/index.ts
 * dispatches by board.sport. Everything pure.
 */
export type SportEngine<R> = {
  sport: BoardSport;
  label: string;
  /** Emoji used in lists, matching lib/sports.ts. */
  icon: string;
  defaults: R;
  /** Fill every field, clamp numbers, drop unknown keys. Never throws. */
  normalizeRules(raw: unknown): R;
  presets: RulePreset<R>[];
  /** Why this event cannot go in now, or null. apply() refuses events check() refuses. */
  check(board: Board, event: BoardEvent): string | null;
  derive(board: Board): BoardView;
  pad(board: Board, view: BoardView): PadAction[];
};

/** Live sync urgency: an end of period, set or match skips the send throttle (see components/tools/scorer/live.ts shapeOf). */
export type BoardShape = { status: BoardView["status"]; innings: readonly unknown[] };
