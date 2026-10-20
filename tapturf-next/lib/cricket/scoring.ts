import { BALLS_PER_OVER, formatOvers, formatRate, runRate } from "./overs";

/**
 * Ball-by-ball cricket scoring, event sourced.
 *
 * A match is its setup plus an append-only list of events: a ball, a new
 * batter, a new bowler, a strike swap, a retirement, the end of an
 * innings, a player added or renamed. Everything the scorer shows comes
 * from derive(match), one pass over the events. Undo is dropping the last
 * event, and a match saved to localStorage comes back exactly as it was.
 * Pure, no dependencies, tested in scoring.test.ts.
 *
 * Rules followed (the Laws, with the usual box cricket house rules as
 * settings):
 *  - Wides and no-balls are not legal balls. They are bowled again and
 *    charged to the bowler. The penalty is a setting: 1 by default, some
 *    groups play 0 for a wide or 2 for a no-ball.
 *  - Runs run on a wide are wides. Runs off the bat on a no-ball go to the
 *    batter and count as a ball faced. Byes run off a no-ball are byes.
 *  - Byes and leg byes are not charged to the bowler and are not the
 *    batter's runs, but the ball counts as faced. A wide is never faced.
 *  - Strike changes on an odd number of runs actually run (a 4 or 6 to
 *    the fence is even anyway, 5 with overthrows is odd) and at the end of
 *    every over.
 *  - Maiden: a full over by one bowler with nothing charged to them and no
 *    wides or no-balls. Byes and leg byes do not spoil it.
 *  - The bowler gets the wicket for bowled, caught, lbw, stumped and hit
 *    wicket. Not for run out, obstructing or a retirement.
 *  - After a no-ball comes a free hit (setting): the striker can only be
 *    run out or out obstructing. A wide or no-ball on a free hit keeps the
 *    free hit for the next ball.
 *  - Caught: the new batter takes strike (the 2022 Law) unless the scorer
 *    says the batters crossed (the older rule many groups still play).
 *  - The innings ends when the overs are done, the side is all out
 *    (players minus one wickets, or every player with last man stands),
 *    the chase passes the target, or the scorer ends it.
 */

const B = BALLS_PER_OVER;

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

export type Side = "a" | "b";
/** Where a batter stands. The striker faces the next ball. */
export type End = "striker" | "nonStriker";

export type Rules = {
  /** Penalty runs for a wide, on top of anything run. 1 by the Laws, 0 in some box games. */
  wideRuns: number;
  /** Penalty runs for a no-ball. 1 by the Laws, some groups play 2. */
  noBallRuns: number;
  /** The ball after a no-ball is a free hit. */
  freeHit: boolean;
  /** Most overs one bowler may bowl, or null for no limit. The engine warns, the UI decides. */
  maxOversPerBowler: number | null;
  /** The last batter carries on alone, so all out means every player out. */
  lastManStands: boolean;
  /** House rule "retire at 30": the view lists batters who have reached it. Advice only. */
  retireAt: number | null;
};

export const DEFAULT_RULES: Rules = { wideRuns: 1, noBallRuns: 1, freeHit: true, maxOversPerBowler: null, lastManStands: false, retireAt: null };

export type Player = { id: string; name: string };

/** Setup with every field filled in. Changed mid-match only by a changeSetup event. */
export type MatchSetup = {
  teamA: string;
  teamB: string;
  /** Overs per innings. */
  overs: number;
  playersPerSide: number;
  battingFirst: Side;
  rules: Rules;
  /** Named players known at the start. More can join mid-match through events. */
  players: Record<Side, Player[]>;
  /** Tournament or series name, optional. */
  title: string;
  venue: string;
};

/** What the setup screen hands newMatch. Everything is optional. */
export type SetupInput = {
  teamA?: string;
  teamB?: string;
  /** Default 6. */
  overs?: number;
  /** Default 11. Box cricket is often 6 to 8. */
  playersPerSide?: number;
  /** Default "a". */
  battingFirst?: Side;
  rules?: Partial<Rules>;
  /** Player names per team, in batting order if you like. Blank names are skipped. */
  players?: Partial<Record<Side, string[]>>;
  title?: string;
  venue?: string;
};

export type Match = {
  v: 1;
  id: string;
  createdAt: number;
  setup: MatchSetup;
  events: MatchEvent[];
};

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export type Extra = "none" | "wide" | "noBall" | "bye" | "legBye";

export type WicketKind = "bowled" | "caught" | "lbw" | "runOut" | "stumped" | "hitWicket" | "retiredHurt" | "retiredOut" | "obstructing";
/** Dismissals that happen on a ball. Retirements are their own event. */
export type BallWicketKind = Exclude<WicketKind, "retiredHurt" | "retiredOut">;
export type RetireKind = "retiredHurt" | "retiredOut";

export type BallWicket = {
  kind: BallWicketKind;
  /** Who is out, by where they stood when the ball was bowled. Default striker. */
  out?: End;
  /** Catcher, keeper or fielder: a player id from the fielding side, or just a name. */
  fielder?: string;
  /**
   * The batters had crossed on the run in progress (run out), or before
   * the catch was taken (older catching rule). Decides who is on strike.
   */
  crossed?: boolean;
};

export type BallEvent = {
  type: "ball";
  /** Runs off the bat: 0 to 6, or 5 and 7 with overthrows. Only on a fair ball or a no-ball. */
  runs: number;
  extra: Extra;
  /**
   * Runs that are neither off the bat nor the penalty: runs taken (or the
   * boundary) on a wide, the byes or leg byes, or byes run off a no-ball.
   */
  extraRuns?: number;
  /** On a no-ball, whether extraRuns were byes or leg byes. Default bye. */
  noBallExtra?: "bye" | "legBye";
  wicket?: BallWicket;
  /** Timestamp, if the UI wants one. Not used by the maths. */
  at?: number;
};

/** A batter walks in. Fills the empty end, striker first. Pass name to add someone new. */
export type SetBatterEvent = { type: "setBatter"; player: string; name?: string; end?: End; at?: number };
/** A bowler takes the ball: a new over, or a change mid-over. Pass name to add someone new. */
export type SetBowlerEvent = { type: "setBowler"; player: string; name?: string; at?: number };
export type SwapStrikeEvent = { type: "swapStrike"; at?: number };
/** Retired hurt can come back later and is not a wicket. Retired out is a wicket. */
export type RetireEvent = { type: "retire"; out: End; kind: RetireKind; at?: number };
/** Declared closes this innings and the match moves on. Abandoned ends the match with no result. */
export type EndInningsEvent = { type: "endInnings"; reason?: "declared" | "abandoned"; at?: number };
export type AddPlayerEvent = { type: "addPlayer"; team: Side; player: string; name: string; at?: number };
export type RenamePlayerEvent = { type: "renamePlayer"; team: Side; player: string; name: string; at?: number };
/** Change names, overs, players or rules mid-match. Applies from here on. */
export type ChangeSetupEvent = {
  type: "changeSetup";
  teamA?: string;
  teamB?: string;
  overs?: number;
  playersPerSide?: number;
  rules?: Partial<Rules>;
  title?: string;
  venue?: string;
  at?: number;
};

export type MatchEvent = BallEvent | SetBatterEvent | SetBowlerEvent | SwapStrikeEvent | RetireEvent | EndInningsEvent | AddPlayerEvent | RenamePlayerEvent | ChangeSetupEvent;

/* ------------------------------------------------------------------ */
/* View model                                                          */
/* ------------------------------------------------------------------ */

export type ChipTone = "dot" | "run" | "four" | "six" | "wicket" | "extra";

export type BallChip = {
  /** ".", "1", "4", "W", "Wd", "Nb+4", "2lb" */
  chip: string;
  tone: ChipTone;
  /** "3.4" */
  label: string;
  legal: boolean;
  /** This ball was a free hit. */
  freeHit: boolean;
  /** Index in match.events. */
  event: number;
};

export type Dismissal = {
  kind: WicketKind;
  bowler: string | null;
  bowlerName: string;
  fielder: string | null;
  fielderName: string;
};

export type BatterLine = {
  id: string;
  name: string;
  /** Batting position, 1 for the first opener in. */
  order: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dots: number;
  /** Strike rate, or null before facing a ball. */
  sr: number | null;
  status: "batting" | "notOut" | "out" | "retiredHurt";
  onStrike: boolean;
  /** "not out", "c Sameer b Rahul", "run out (Sameer)", "retired hurt" */
  howOut: string;
  dismissal: Dismissal | null;
};

export type BowlerLine = {
  id: string;
  name: string;
  order: number;
  /** Legal balls. */
  balls: number;
  /** "2.3" */
  overs: string;
  maidens: number;
  runs: number;
  wickets: number;
  dots: number;
  /** Number of wide deliveries. */
  wides: number;
  /** Number of no-balls. */
  noBalls: number;
  fours: number;
  sixes: number;
  econ: number | null;
  /** "2/12" */
  figures: string;
  /** Has the ball right now. */
  current: boolean;
};

export type Extras = { wides: number; noBalls: number; byes: number; legByes: number; total: number };

export type PartnershipView = {
  /** 1 for the opening stand. */
  number: number;
  batters: { id: string; name: string; runs: number; balls: number }[];
  runs: number;
  balls: number;
  extras: number;
  unbroken: boolean;
  /** "Amit and Rahul, 34 (21)" */
  text: string;
};

export type FowView = {
  wicket: number;
  runs: number;
  balls: number;
  overs: string;
  batter: string;
  name: string;
  /** "45-3 (Amit, 5.2 ov)" */
  text: string;
};

export type OverView = {
  /** 1-based over number. */
  number: number;
  /** Main bowler of the over (most balls), null if unknown. */
  bowler: string | null;
  bowlerName: string;
  runs: number;
  wickets: number;
  extras: number;
  legalBalls: number;
  balls: BallChip[];
  maiden: boolean;
  complete: boolean;
  /** Team score at the end of this over, for a worm or a table. */
  totalRuns: number;
  totalWickets: number;
};

/** A point on the worm. balls is legal balls bowled, so x = balls / 6 in overs. */
export type WormPoint = { balls: number; runs: number; wickets: number };

export type CommentaryLine = {
  /** Stable React key. */
  key: string;
  kind: "ball" | "over" | "info";
  /** "3.4" for a ball, "" otherwise. */
  label: string;
  text: string;
  /** label and text together: "3.4 Rahul to Amit, FOUR" */
  line: string;
  chip: string | null;
  tone: ChipTone | null;
  wicket: boolean;
  event: number;
};

export type EndReason = "overs" | "allOut" | "target" | "declared" | "abandoned";

export type InningsView = {
  index: 0 | 1;
  batting: Side;
  bowling: Side;
  battingName: string;
  bowlingName: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  maxBalls: number;
  ballsLeft: number;
  /** "3.5" */
  overs: string;
  /** "45/3" */
  score: string;
  /** "Titans 45/3 (3.5 ov)" */
  summary: string;
  extras: Extras;
  /** "Extras 7 (wd 4, nb 1, b 1, lb 1)" */
  extrasText: string;
  crr: number | null;
  /** Score at the end of the overs at the current rate. Null before a ball. */
  projected: number | null;
  /** Runs to win, in the second innings. */
  target: number | null;
  live: boolean;
  ended: EndReason | null;
  striker: BatterLine | null;
  nonStriker: BatterLine | null;
  bowler: BowlerLine | null;
  /** Who bowled the last completed over, so the UI can keep them out of the next one. */
  lastOverBowler: string | null;
  /** The next ball is a free hit. */
  freeHit: boolean;
  /** In order of coming in. */
  batters: BatterLine[];
  /** Named players of the batting side who have not batted. */
  yetToBat: Player[];
  /** In order of first ball bowled. */
  bowlers: BowlerLine[];
  partnership: PartnershipView | null;
  partnerships: PartnershipView[];
  fow: FowView[];
  /** "Amit c Sameer b Rahul 23 (14), 45-3 (5.2 ov)" */
  lastWicket: string | null;
  /** Over by over, for a Manhattan chart and an overs table. */
  byOver: OverView[];
  /** Cumulative runs: a point at the start, one per completed over and one for now. */
  worm: WormPoint[];
  /** The over being bowled, or the one just finished until the next ball. */
  thisOver: OverView | null;
  fours: number;
  sixes: number;
  /** Legal balls with no run of any kind. */
  dots: number;
  commentary: CommentaryLine[];
};

export type ChaseView = {
  target: number;
  runsNeeded: number;
  ballsLeft: number;
  rrr: number | null;
  /** "Need 18 runs off 10 balls" */
  text: string;
  /** What the side batting first had after the same number of legal balls. */
  sameStage: { runs: number; wickets: number } | null;
};

export type ResultView = {
  kind: "runs" | "wickets" | "tie" | "noResult";
  winner: Side | null;
  winnerName: string;
  /** Runs or wickets, 0 for a tie or no result. */
  margin: number;
  /** Balls left in the chase when it was won. */
  ballsLeft: number;
  /** "Strikers won by 3 wickets with 10 balls left" */
  text: string;
};

export type AwardLine = { id: string; side: Side; name: string; text: string; score: number };

export type Awards = {
  /** "Amit 34* (15)" */
  topScorer: AwardLine | null;
  /** "Sameer 2/12" */
  bestBowler: AwardLine | null;
  /** By a simple impact score: runs and pace, wickets and economy, catches, a nudge for the winners. */
  potm: AwardLine | null;
};

export type Need = "striker" | "nonStriker" | "bowler";

export type BatterOption = { id: string; name: string; retiredHurt: boolean; runs: number; balls: number };
export type BowlerOption = {
  id: string;
  name: string;
  balls: number;
  overs: string;
  runs: number;
  wickets: number;
  current: boolean;
  /** Why they should not bowl next: bowled the last over, or out of overs. Null if fine. */
  blocked: "lastOver" | "quota" | null;
};

export type MatchView = {
  id: string;
  setup: MatchSetup;
  /** Current names and full rosters, including players added mid-match. */
  teams: Record<Side, { name: string; players: Player[] }>;
  /** One or two innings. The second appears as soon as the first ends. */
  innings: InningsView[];
  /** The innings being played, or the last one when the match is over. */
  current: InningsView;
  status: "live" | "done";
  /** The second innings is set up but nobody is picked and no ball has been bowled. */
  inningsBreak: boolean;
  /** What the scorer must pick before the next ball, in this order. */
  needs: Need[];
  /** A ball can be recorded right now. */
  ready: boolean;
  freeHit: boolean;
  chase: ChaseView | null;
  result: ResultView | null;
  /** One line for the top of the screen: score, equation or result. */
  headline: string;
  /** Things the UI might flag, like a bowler bowling two overs in a row. */
  warnings: string[];
  batterOptions: BatterOption[];
  bowlerOptions: BowlerOption[];
  /** Batters at the crease who reached the retireAt house rule. */
  retireDue: string[];
  /** The current bowler took wickets with their last two balls. */
  onHatTrick: boolean;
  awards: Awards;
  /** What undo would take back: "4.2 FOUR", "Amit in", "Rahul to bowl". */
  lastAction: string | null;
  eventCount: number;
  /** Events that could not be applied (bad data); they are skipped, never fatal. */
  ignored: number;
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const toInt = (x: unknown): number => {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 99) : 0;
};

const clampInt = (x: unknown, lo: number, hi: number, dflt: number): number => {
  if (x === null || x === undefined || x === "") return dflt;
  const n = Math.round(Number(x));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

const optionalLimit = (x: unknown, hi: number): number | null => {
  if (x === null || x === undefined || x === "") return null;
  const n = Math.round(Number(x));
  return Number.isFinite(n) && n > 0 ? Math.min(n, hi) : null;
};

const cleanName = (s: unknown, max = 40): string =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

const BOWLER_KINDS: ReadonlySet<WicketKind> = new Set<WicketKind>(["bowled", "caught", "lbw", "stumped", "hitWicket"]);
const BALL_KINDS: ReadonlySet<string> = new Set<BallWicketKind>(["bowled", "caught", "lbw", "runOut", "stumped", "hitWicket", "obstructing"]);
const EXTRAS: ReadonlySet<string> = new Set<Extra>(["none", "wide", "noBall", "bye", "legBye"]);

/** The bowler gets credit for this dismissal. */
export function creditedToBowler(kind: WicketKind): boolean {
  return BOWLER_KINDS.has(kind);
}

export const WICKET_LABELS: Record<WicketKind, string> = {
  bowled: "Bowled",
  caught: "Caught",
  lbw: "LBW",
  runOut: "Run out",
  stumped: "Stumped",
  hitWicket: "Hit wicket",
  retiredHurt: "Retired hurt",
  retiredOut: "Retired out",
  obstructing: "Obstructing the field",
};

/**
 * Which dismissals are possible on this ball. Off a wide: stumped, run
 * out, hit wicket. Off a no-ball, a free hit, byes or a ball the batters
 * ran on: only run out (or obstructing). The non-striker: only run out.
 */
export function allowedWicketKinds(extra: Extra, opts: { freeHit?: boolean; out?: End; runs?: number } = {}): BallWicketKind[] {
  const runOutOnly: BallWicketKind[] = ["runOut", "obstructing"];
  if (opts.out === "nonStriker" || opts.freeHit) return runOutOnly;
  if (extra === "noBall" || extra === "bye" || extra === "legBye") return runOutOnly;
  if (extra === "wide") return opts.runs ? runOutOnly : ["stumped", "runOut", "hitWicket", "obstructing"];
  return opts.runs ? runOutOnly : ["bowled", "caught", "lbw", "runOut", "stumped", "hitWicket", "obstructing"];
}

/** Total wickets that end the innings. */
export function wicketLimit(setup: Pick<MatchSetup, "playersPerSide" | "rules">): number {
  return setup.rules.lastManStands ? setup.playersPerSide : setup.playersPerSide - 1;
}

/** How one ball's runs split up. Tolerant: runs typed in the wrong field are moved where they belong. */
export type BallBreakdown = {
  legal: boolean;
  /** Runs to the batter. */
  bat: number;
  /** Wide extras: the penalty plus anything run on the wide. */
  wides: number;
  /** No-ball penalty only. */
  noBalls: number;
  byes: number;
  legByes: number;
  total: number;
  /** Runs charged to the bowler. */
  bowlerRuns: number;
  /** Runs the batters ran (or hit to the fence), for who keeps strike. */
  ran: number;
  /** Counts as a ball faced by the striker (everything but a wide). */
  faced: boolean;
};

export function breakdown(e: BallEvent, rules: Rules): BallBreakdown {
  const extra: Extra = EXTRAS.has(e.extra) ? e.extra : "none";
  let bat = toInt(e.runs);
  let xr = toInt(e.extraRuns);
  if (extra === "wide" || extra === "bye" || extra === "legBye") {
    xr += bat;
    bat = 0;
  }
  if (extra === "none") xr = 0;
  const wide = extra === "wide";
  const nb = extra === "noBall";
  const lbOffNb = nb && e.noBallExtra === "legBye";
  const wides = wide ? rules.wideRuns + xr : 0;
  const noBalls = nb ? rules.noBallRuns : 0;
  const byes = extra === "bye" || (nb && !lbOffNb) ? xr : 0;
  const legByes = extra === "legBye" || lbOffNb ? xr : 0;
  return {
    legal: !wide && !nb,
    bat,
    wides,
    noBalls,
    byes,
    legByes,
    total: bat + wides + noBalls + byes + legByes,
    bowlerRuns: bat + wides + noBalls,
    ran: bat + xr,
    faced: !wide,
  };
}

/** Short chip for a ball: ".", "1", "4", "6", "W", "Wd", "Wd+1", "Nb+4", "2b", "2lb", "1+W". */
export function describeBall(e: BallEvent): string {
  const extra: Extra = EXTRAS.has(e.extra) ? e.extra : "none";
  let bat = toInt(e.runs);
  let xr = toInt(e.extraRuns);
  if (extra === "wide" || extra === "bye" || extra === "legBye") {
    xr += bat;
    bat = 0;
  }
  let s: string;
  switch (extra) {
    case "wide":
      s = xr ? `Wd+${xr}` : "Wd";
      break;
    case "noBall":
      s = `Nb${bat ? `+${bat}` : ""}${xr ? `+${xr}${e.noBallExtra === "legBye" ? "lb" : "b"}` : ""}`;
      break;
    case "bye":
      s = `${xr}b`;
      break;
    case "legBye":
      s = `${xr}lb`;
      break;
    default:
      s = bat ? String(bat) : ".";
  }
  if (e.wicket) return s === "." ? "W" : `${s}+W`;
  return s;
}

/** Colour family for a chip. Wicket beats six beats four beats extra beats run beats dot. */
export function ballTone(e: BallEvent): ChipTone {
  if (e.wicket) return "wicket";
  const extra: Extra = EXTRAS.has(e.extra) ? e.extra : "none";
  const bat = extra === "none" || extra === "noBall" ? toInt(e.runs) : 0;
  if (bat === 6) return "six";
  if (bat === 4) return "four";
  if (extra !== "none") return "extra";
  return bat > 0 ? "run" : "dot";
}

/* ------------------------------------------------------------------ */
/* Creating, applying, undoing                                         */
/* ------------------------------------------------------------------ */

export function normalizeRules(r?: Partial<Rules> | null): Rules {
  return {
    wideRuns: clampInt(r?.wideRuns, 0, 5, DEFAULT_RULES.wideRuns),
    noBallRuns: clampInt(r?.noBallRuns, 0, 5, DEFAULT_RULES.noBallRuns),
    freeHit: typeof r?.freeHit === "boolean" ? r.freeHit : DEFAULT_RULES.freeHit,
    maxOversPerBowler: optionalLimit(r?.maxOversPerBowler, 100),
    lastManStands: r?.lastManStands === true,
    retireAt: optionalLimit(r?.retireAt, 500),
  };
}

const rosterFrom = (side: Side, names: unknown): Player[] =>
  (Array.isArray(names) ? names : [])
    .map((n) => cleanName(n))
    .filter(Boolean)
    .map((name, i) => ({ id: `${side}${i + 1}`, name }));

/** Fill in defaults and clamp numbers. Also used to read back saved matches. */
export function normalizeSetup(input: SetupInput | MatchSetup = {}): MatchSetup {
  const players = (input as MatchSetup).players as Partial<Record<Side, unknown>> | undefined;
  const asRoster = (side: Side): Player[] => {
    const list = players?.[side];
    if (Array.isArray(list) && list.every((p) => p && typeof p === "object" && typeof (p as Player).id === "string")) {
      return (list as Player[]).map((p) => ({ id: p.id, name: cleanName(p.name) || p.id }));
    }
    return rosterFrom(side, list);
  };
  return {
    teamA: cleanName(input.teamA, 32) || "Team A",
    teamB: cleanName(input.teamB, 32) || "Team B",
    overs: clampInt(input.overs, 1, 100, 6),
    playersPerSide: clampInt(input.playersPerSide, 2, 30, 11),
    battingFirst: input.battingFirst === "b" ? "b" : "a",
    rules: normalizeRules(input.rules),
    players: { a: asRoster("a"), b: asRoster("b") },
    title: cleanName(input.title, 48),
    venue: cleanName(input.venue, 48),
  };
}

/** A fresh match with no balls bowled. Pass id and now for repeatable tests. */
export function newMatch(input: SetupInput = {}, opts: { id?: string; now?: number } = {}): Match {
  const now = opts.now ?? Date.now();
  const id = opts.id ?? `m${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return { v: 1, id, createdAt: now, setup: normalizeSetup(input), events: [] };
}

/** Read a match back from storage. Null if it does not look like one. */
export function restoreMatch(raw: unknown): Match | null {
  try {
    const m = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<Match> | null;
    if (!m || typeof m !== "object" || m.v !== 1 || !m.setup || typeof m.setup !== "object" || !Array.isArray(m.events)) return null;
    const events = m.events.filter((e): e is MatchEvent => !!e && typeof e === "object" && typeof (e as MatchEvent).type === "string");
    return { v: 1, id: String(m.id ?? "match"), createdAt: Number(m.createdAt) || 0, setup: normalizeSetup(m.setup), events };
  } catch {
    return null;
  }
}

/**
 * Add an event. Returns a new match, or the same match object untouched
 * when check() finds the event invalid, so `next === match` means nothing
 * happened. Warnings do not block.
 */
export function apply(match: Match, event: MatchEvent): Match {
  if (check(match, event).error) return match;
  return { ...match, events: [...match.events, event] };
}

/** Drop the last event, whatever it was. */
export function undo(match: Match): Match {
  if (!match.events.length) return match;
  return { ...match, events: match.events.slice(0, -1) };
}

/**
 * Take back the last ball, along with the batter and bowler picks that
 * came after it. Players added or renamed since are kept.
 */
export function undoBall(match: Match): Match {
  const ev = match.events;
  let i = ev.length - 1;
  while (i >= 0 && ev[i].type !== "ball") i--;
  if (i < 0) return undo(match);
  const keep = ev.slice(i + 1).filter((e) => e.type === "addPlayer" || e.type === "renamePlayer");
  return { ...match, events: [...ev.slice(0, i), ...keep] };
}

/** A fresh player id for a side: "a7". Unique across the whole match. */
export function newPlayerId(match: Match, side: Side): string {
  const used = new Set<string>();
  for (const s of ["a", "b"] as const) for (const p of match.setup.players[s]) used.add(p.id);
  for (const e of match.events) {
    if (e.type === "addPlayer" || e.type === "renamePlayer" || e.type === "setBatter" || e.type === "setBowler") used.add(e.player);
  }
  let max = 0;
  const re = new RegExp(`^${side}(\\d+)$`);
  for (const id of used) {
    const m = id.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  let n = max + 1;
  while (used.has(`${side}${n}`)) n++;
  return `${side}${n}`;
}

/* ------------------------------------------------------------------ */
/* Reading a match from someone else                                   */
/* ------------------------------------------------------------------ */

/**
 * The ids rosterFrom and newPlayerId make: the side, then a number. Four
 * digits, not three: newPlayerId counts up past every id used, and any
 * event can bring in a new player, so an odd but real match can pass a999.
 */
const PLAYER_ID = /^[ab]\d{1,4}$/;
const MATCH_ID = /^[a-z0-9]{1,24}$/i;
/** Far more than a real match: 100 overs a side is about 1,600 events. */
const MAX_EVENTS = 3000;
const MAX_ROSTER = 40;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
/** Numbers only: Number() on an object from JSON can throw ({"valueOf": 1, "toString": 1}). */
const num = (x: unknown): number | undefined => (typeof x === "number" ? x : undefined);
const isEnd = (x: unknown): x is End => x === "striker" || x === "nonStriker";
const isSide = (x: unknown): x is Side => x === "a" || x === "b";

/**
 * cleanName for a name read back. cleanName trims before it cuts, so a
 * long name cut at a space ends in that space, and a second pass would
 * drop it. Keep such a name as it is, so the match comes back exactly.
 */
function readName(x: unknown, max: number): string {
  const s = typeof x === "string" ? x : "";
  const c = cleanName(s, max);
  return c && s.length === max && s === `${c} ` ? s : c;
}

function readRoster(list: unknown): Player[] {
  const out: Player[] = [];
  const seen = new Set<string>();
  for (const p of Array.isArray(list) ? list : []) {
    if (out.length >= MAX_ROSTER) break;
    if (!isObj(p) || typeof p.id !== "string" || !PLAYER_ID.test(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ id: p.id, name: readName(p.name, 40) || p.id });
  }
  return out;
}

/** Only the rules that are there with the right type, clamped as normalizeRules does: a changeSetup keeps the rest. */
function readRules(x: unknown): Partial<Rules> {
  if (!isObj(x)) return {};
  const isNum = (v: unknown) => typeof v === "number";
  const isBool = (v: unknown) => typeof v === "boolean";
  const isLimit = (v: unknown) => v === null || typeof v === "number";
  const ok: Record<keyof Rules, (v: unknown) => boolean> = { wideRuns: isNum, noBallRuns: isNum, freeHit: isBool, maxOversPerBowler: isLimit, lastManStands: isBool, retireAt: isLimit };
  const keys = (Object.keys(ok) as (keyof Rules)[]).filter((k) => ok[k](x[k]));
  const full = normalizeRules(Object.fromEntries(keys.map((k) => [k, x[k]])));
  return Object.fromEntries(keys.map((k) => [k, full[k]]));
}

function readSetup(x: Obj): MatchSetup {
  const base = normalizeSetup({ overs: num(x.overs), playersPerSide: num(x.playersPerSide), battingFirst: x.battingFirst === "b" ? "b" : "a", rules: readRules(x.rules) });
  const players = isObj(x.players) ? x.players : {};
  return {
    ...base,
    teamA: readName(x.teamA, 32) || base.teamA,
    teamB: readName(x.teamB, 32) || base.teamB,
    players: { a: readRoster(players.a), b: readRoster(players.b) },
    title: readName(x.title, 48),
    venue: readName(x.venue, 48),
  };
}

function readWicket(x: unknown): BallWicket | null {
  if (!isObj(x) || typeof x.kind !== "string" || !BALL_KINDS.has(x.kind)) return null;
  const w: BallWicket = { kind: x.kind as BallWicketKind };
  if (isEnd(x.out)) w.out = x.out;
  if (typeof x.fielder === "string") w.fielder = readName(x.fielder, 40);
  if (typeof x.crossed === "boolean") w.crossed = x.crossed;
  return w;
}

/** One event, field by field. Null when it is not one the engine knows or a field it needs is unusable. */
function readEvent(x: unknown): MatchEvent | null {
  if (!isObj(x)) return null;
  const at = typeof x.at === "number" && Number.isFinite(x.at) ? { at: x.at } : {};
  const player = typeof x.player === "string" && PLAYER_ID.test(x.player) ? x.player : null;
  const name = typeof x.name === "string" ? { name: readName(x.name, 40) } : {};
  switch (x.type) {
    case "ball": {
      if (typeof x.extra !== "string" || !EXTRAS.has(x.extra)) return null;
      // toInt is how breakdown() reads runs, so the score is what it was.
      const e: BallEvent = { type: "ball", runs: toInt(num(x.runs)), extra: x.extra as Extra };
      if (typeof x.extraRuns === "number") e.extraRuns = toInt(x.extraRuns);
      if (x.noBallExtra === "bye" || x.noBallExtra === "legBye") e.noBallExtra = x.noBallExtra;
      const w = readWicket(x.wicket);
      if (w) e.wicket = w;
      return { ...e, ...at };
    }
    case "setBatter":
      return player ? { type: "setBatter", player, ...name, ...(isEnd(x.end) ? { end: x.end } : {}), ...at } : null;
    case "setBowler":
      return player ? { type: "setBowler", player, ...name, ...at } : null;
    case "swapStrike":
      return { type: "swapStrike", ...at };
    case "retire":
      return isEnd(x.out) && (x.kind === "retiredHurt" || x.kind === "retiredOut") ? { type: "retire", out: x.out, kind: x.kind, ...at } : null;
    case "endInnings":
      return { type: "endInnings", ...(x.reason === "declared" || x.reason === "abandoned" ? { reason: x.reason } : {}), ...at };
    case "addPlayer":
    case "renamePlayer": {
      const n = readName(x.name, 40);
      return player && isSide(x.team) && n ? { type: x.type, team: x.team, player, name: n, ...at } : null;
    }
    case "changeSetup": {
      const e: ChangeSetupEvent = { type: "changeSetup" };
      if (typeof x.teamA === "string") e.teamA = readName(x.teamA, 40);
      if (typeof x.teamB === "string") e.teamB = readName(x.teamB, 40);
      // Players up to 100 like overs, though the engine reads 30: the settings sheet takes two digits, and the match comes back as typed.
      const overs = clampInt(num(x.overs), 1, 100, 0);
      const players = clampInt(num(x.playersPerSide), 2, 100, 0);
      if (overs) e.overs = overs;
      if (players) e.playersPerSide = players;
      if (isObj(x.rules)) e.rules = readRules(x.rules);
      if (typeof x.title === "string") e.title = readName(x.title, 48);
      if (typeof x.venue === "string") e.venue = readName(x.venue, 48);
      return { ...e, ...at };
    }
    default:
      return null;
  }
}

/**
 * A match from someone else's browser or the database, rebuilt field by
 * field from what the engine reads, so nothing else rides along: unknown
 * keys and event types are dropped, numbers clamped, enums checked, names
 * cut, player ids kept to the engine's own "a7" form and rosters to 40 a
 * side. A match the engine made comes back unchanged. Null if it is not a
 * match, or is longer than any real one.
 */
export function sanitizeMatch(raw: unknown): Match | null {
  if (!isObj(raw) || raw.v !== 1 || !isObj(raw.setup) || !Array.isArray(raw.events) || raw.events.length > MAX_EVENTS) return null;
  const events: MatchEvent[] = [];
  for (const x of raw.events) {
    const e = readEvent(x);
    if (e) events.push(e);
  }
  return {
    v: 1,
    id: typeof raw.id === "string" && MATCH_ID.test(raw.id) ? raw.id : "match",
    createdAt: typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
    setup: readSetup(raw.setup),
    events,
  };
}

/* ------------------------------------------------------------------ */
/* Handing a match to someone else                                     */
/* ------------------------------------------------------------------ */

/**
 * The match as the live link serves it, with every player's earlier names
 * folded into the one they have now. A rename changes the scorecard
 * everywhere, but the match still carries the old name: in the roster, in
 * the addPlayer, setBatter or setBowler that brought the player in, and in
 * each rename before the last. Here all of those say the latest name. The
 * renames stay, now renames to the same name, so the events line up one
 * for one and derive() reads the same. The commentary never mentions a
 * rename, and lastAction's "Renamed to X" is the last rename, already the
 * latest name. The scorer's own match is not touched.
 *
 * A setBatter or setBowler is filed under the side batting or bowling in
 * its innings, as fold() files it: the id's first letter for any id the
 * engine makes, and still right for one that is not. A name is kept as it
 * is when it already reads as the latest one (so a match sanitizeMatch read
 * comes back exactly), when it is blank (so nothing fold() refused gets in),
 * or when fold() never gave that player a name. The one change derive() can
 * show: an addPlayer for a player already in the team, which check()
 * refuses, says the latest name too, so as the last event its lastAction
 * does.
 */
export function publicMatch(m: Match): Match {
  const f = fold(m);
  const second = f.inns[1]?.from ?? Infinity;
  const latest = (side: Side, id: string, name: string): string => {
    const now = isSide(side) ? f.roster[side].get(id) : undefined;
    const was = cleanName(name);
    return now && was && was !== now ? now : name;
  };
  const roster = (side: Side): Player[] => m.setup.players[side].map((p) => ({ ...p, name: latest(side, p.id, p.name) }));
  const events = m.events.map((e, i): MatchEvent => {
    switch (e.type) {
      case "addPlayer":
      case "renamePlayer":
        return { ...e, name: latest(e.team, e.player, e.name) };
      case "setBatter":
      case "setBowler": {
        if (e.name === undefined) return e;
        const inn = i >= second ? f.inns[1] : f.inns[0];
        return { ...e, name: latest(e.type === "setBatter" ? inn.batting : inn.bowling, e.player, e.name) };
      }
      default:
        return e;
    }
  });
  return { ...m, setup: { ...m.setup, players: { a: roster("a"), b: roster("b") } }, events };
}

/* ------------------------------------------------------------------ */
/* The fold                                                            */
/* ------------------------------------------------------------------ */

type DismissalS = { kind: WicketKind; bowler: string | null; fielder: string | null };
type BatS = { id: string; order: number; runs: number; balls: number; fours: number; sixes: number; dots: number; out: boolean; retiredHurt: boolean; how: DismissalS | null };
type BowlS = { id: string; order: number; balls: number; runs: number; wickets: number; dots: number; wides: number; noBalls: number; fours: number; sixes: number; maidens: number; streak: number };
type PartS = { ids: string[]; runs: number; balls: number; extras: number; by: Record<string, { runs: number; balls: number }> };
type ChipS = BallChip;
type OverS = { index: number; bowlers: string[]; balls: ChipS[]; runs: number; bowlerRuns: number; wickets: number; extras: number; legal: number; illegal: number; complete: boolean; maiden: boolean; bowlerBalls: Record<string, number> };
type FowS = { wicket: number; runs: number; legal: number; batter: string };
type NoteS =
  | {
      kind: "ball";
      ev: number;
      label: string;
      bowler: string;
      striker: string;
      e: BallEvent;
      n: BallBreakdown;
      freeHit: boolean;
      nextFreeHit: boolean;
      out: { id: string; runs: number; balls: number; how: DismissalS } | null;
      milestones: { id: string; runs: number; balls: number }[];
      hatTrick: boolean;
    }
  | { kind: "over"; ev: number; over: number; runs: number; wickets: number; bowler: string; maiden: boolean; teamRuns: number; teamWkts: number }
  | { kind: "retire"; ev: number; id: string; retire: RetireKind; runs: number; balls: number }
  | { kind: "end"; ev: number };

type InnS = {
  index: 0 | 1;
  batting: Side;
  bowling: Side;
  runs: number;
  wickets: number;
  legal: number;
  maxBalls: number;
  target: number | null;
  extras: { wides: number; noBalls: number; byes: number; legByes: number };
  striker: string | null;
  nonStriker: string | null;
  bowler: string | null;
  lastOverBowler: string | null;
  bats: Map<string, BatS>;
  bowls: Map<string, BowlS>;
  overs: OverS[];
  part: PartS;
  parts: PartS[];
  fow: FowS[];
  notes: NoteS[];
  freeHit: boolean;
  ended: EndReason | null;
  /** Team runs and wickets after each legal ball; index 0 is the start. */
  scoreAt: number[];
  wktsAt: number[];
  fours: number;
  sixes: number;
  dots: number;
  deliveries: number;
  /** A retired out before the first ball of the innings, for the first over to carry. */
  pendingWkts: number;
  /** Index of the first event read in this innings. */
  from: number;
};

type Fold = {
  id: string;
  setup: MatchSetup;
  roster: Record<Side, Map<string, string>>;
  inns: InnS[];
  abandoned: boolean;
  done: boolean;
  ignored: number;
  lastLabel: string | null;
};

const newPart = (ids: string[] = []): PartS => ({ ids, runs: 0, balls: 0, extras: 0, by: {} });

function newInn(index: 0 | 1, batting: Side, setup: MatchSetup, target: number | null, from: number): InnS {
  return {
    index,
    batting,
    bowling: batting === "a" ? "b" : "a",
    runs: 0,
    wickets: 0,
    legal: 0,
    maxBalls: setup.overs * B,
    target,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0 },
    striker: null,
    nonStriker: null,
    bowler: null,
    lastOverBowler: null,
    bats: new Map(),
    bowls: new Map(),
    overs: [],
    part: newPart(),
    parts: [],
    fow: [],
    notes: [],
    freeHit: false,
    ended: null,
    scoreAt: [0],
    wktsAt: [0],
    fours: 0,
    sixes: 0,
    dots: 0,
    deliveries: 0,
    pendingWkts: 0,
    from,
  };
}

function getBat(inn: InnS, id: string): BatS {
  let b = inn.bats.get(id);
  if (!b) {
    b = { id, order: inn.bats.size + 1, runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0, out: false, retiredHurt: false, how: null };
    inn.bats.set(id, b);
  }
  return b;
}

function getBowl(inn: InnS, id: string): BowlS {
  let b = inn.bowls.get(id);
  if (!b) {
    b = { id, order: inn.bowls.size + 1, balls: 0, runs: 0, wickets: 0, dots: 0, wides: 0, noBalls: 0, fours: 0, sixes: 0, maidens: 0, streak: 0 };
    inn.bowls.set(id, b);
  }
  return b;
}

function ensurePlayer(f: Fold, side: Side, id: string, name?: string) {
  const m = f.roster[side];
  if (!m.has(id)) m.set(id, cleanName(name) || `Player ${m.size + 1}`);
}

/** Last man stands and only one wicket left: the last batter may bat alone. */
const mayBatAlone = (f: Fold, inn: InnS) => f.setup.rules.lastManStands && inn.wickets >= f.setup.playersPerSide - 1;
/** Batting alone right now: they always face, and strike never changes. */
const isLone = (f: Fold, inn: InnS) => mayBatAlone(f, inn) && (inn.striker === null) !== (inn.nonStriker === null);

function closePartnership(inn: InnS, survivor: string | null) {
  if (inn.part.ids.length) inn.parts.push(inn.part);
  inn.part = newPart(survivor ? [survivor] : []);
}

function checkEnd(f: Fold, inn: InnS, ev: number) {
  if (inn.ended) return;
  if (inn.target !== null && inn.runs >= inn.target) inn.ended = "target";
  else if (inn.wickets >= wicketLimit(f.setup)) inn.ended = "allOut";
  else if (inn.legal >= inn.maxBalls) inn.ended = "overs";
  if (inn.ended) markEnded(inn, ev);
}

function markEnded(inn: InnS, ev: number) {
  inn.freeHit = false;
  inn.notes.push({ kind: "end", ev });
}

function playBall(f: Fold, inn: InnS, e: BallEvent, ev: number): boolean {
  const striker = inn.striker;
  const bowler = inn.bowler;
  if (!striker || !bowler) return false;
  if (inn.nonStriker === null && !mayBatAlone(f, inn)) return false;
  const r = f.setup.rules;
  const n = breakdown(e, r);
  const extra: Extra = EXTRAS.has(e.extra) ? e.extra : "none";
  const overIdx = Math.floor(inn.legal / B);
  let over = inn.overs[inn.overs.length - 1];
  if (!over || over.index !== overIdx) {
    over = { index: overIdx, bowlers: [], balls: [], runs: 0, bowlerRuns: 0, wickets: inn.pendingWkts, extras: 0, legal: 0, illegal: 0, complete: false, maiden: false, bowlerBalls: {} };
    inn.pendingWkts = 0;
    inn.overs.push(over);
  }
  if (!over.bowlers.includes(bowler)) over.bowlers.push(bowler);
  over.bowlerBalls[bowler] = (over.bowlerBalls[bowler] ?? 0) + 1;
  const label = `${overIdx}.${(inn.legal % B) + 1}`;
  const freeHit = inn.freeHit;
  const bat = getBat(inn, striker);
  const bw = getBowl(inn, bowler);
  const runsBefore = bat.runs;

  // Batter
  if (n.faced) {
    bat.balls++;
    if (n.bat === 0) bat.dots++;
  }
  bat.runs += n.bat;
  if (n.bat === 4) {
    bat.fours++;
    bw.fours++;
    inn.fours++;
  } else if (n.bat === 6) {
    bat.sixes++;
    bw.sixes++;
    inn.sixes++;
  }

  // Bowler
  if (n.legal) {
    bw.balls++;
    if (n.bowlerRuns === 0) bw.dots++;
  }
  bw.runs += n.bowlerRuns;
  if (extra === "wide") bw.wides++;
  if (extra === "noBall") bw.noBalls++;

  // Team, partnership, over
  inn.deliveries++;
  inn.runs += n.total;
  inn.extras.wides += n.wides;
  inn.extras.noBalls += n.noBalls;
  inn.extras.byes += n.byes;
  inn.extras.legByes += n.legByes;
  if (n.legal && n.total === 0) inn.dots++;
  // Nothing after the winning run counts (Law 16.6), so a wicket on that ball is dropped. check() refuses it; this covers old saves.
  const won = inn.target !== null && inn.runs >= inn.target;
  const ball: BallEvent = won && e.wicket ? { ...e, wicket: undefined } : e;
  const p = inn.part;
  p.runs += n.total;
  p.extras += n.total - n.bat;
  if (n.legal) p.balls++;
  const c = p.by[striker] ?? (p.by[striker] = { runs: 0, balls: 0 });
  c.runs += n.bat;
  if (n.faced) c.balls++;
  over.runs += n.total;
  over.bowlerRuns += n.bowlerRuns;
  over.extras += n.total - n.bat;
  if (n.legal) over.legal++;
  else over.illegal++;
  over.balls.push({ chip: describeBall(ball), tone: ballTone(ball), label, legal: n.legal, freeHit, event: ev });
  if (n.legal) inn.legal++;
  inn.freeHit = r.freeHit && (extra === "noBall" || (freeHit && extra === "wide"));

  // Who ends up where
  let st: string | null = inn.striker;
  let ns: string | null = inn.nonStriker;
  const swap = () => {
    const t = st;
    st = ns;
    ns = t;
  };
  if (ns !== null && n.ran % 2 === 1) swap();

  let out: (NoteS & { kind: "ball" })["out"] = null;
  let hatTrick = false;
  const w = ball.wicket;
  const outId = w ? (w.out === "nonStriker" ? inn.nonStriker : inn.striker) : null;
  if (w && outId) {
    // Crossing only matters when the batters could be running: caught, run out, obstructing.
    if (w.crossed && ns !== null && (w.kind === "caught" || w.kind === "runOut" || w.kind === "obstructing")) swap();
    if (st === outId) st = null;
    else if (ns === outId) ns = null;
    const ob = getBat(inn, outId);
    const kind = w.kind as WicketKind;
    const hurt = kind === "retiredHurt";
    ob.out = !hurt;
    ob.retiredHurt = hurt;
    ob.how = { kind, bowler, fielder: w.fielder ? String(w.fielder) : null };
    if (!hurt) {
      inn.wickets++;
      over.wickets++;
      inn.fow.push({ wicket: inn.wickets, runs: inn.runs, legal: inn.legal, batter: outId });
    }
    if (BOWLER_KINDS.has(kind)) {
      bw.wickets++;
      bw.streak++;
      hatTrick = bw.streak === 3;
    } else if (n.legal) bw.streak = 0;
    out = { id: outId, runs: ob.runs, balls: ob.balls, how: ob.how };
    closePartnership(inn, st ?? ns);
  } else if (n.legal) bw.streak = 0;

  inn.striker = st;
  inn.nonStriker = ns;
  const lone = isLone(f, inn);
  if (lone && inn.striker === null) {
    inn.striker = inn.nonStriker;
    inn.nonStriker = null;
  }

  const milestones: { id: string; runs: number; balls: number }[] = [];
  for (const m of [50, 100, 150, 200]) if (runsBefore < m && bat.runs >= m) milestones.push({ id: striker, runs: m, balls: bat.balls });

  if (n.legal) {
    inn.scoreAt[inn.legal] = inn.runs;
    inn.wktsAt[inn.legal] = inn.wickets;
  }
  inn.notes.push({ kind: "ball", ev, label, bowler, striker, e: ball, n, freeHit, nextFreeHit: inn.freeHit, out, milestones, hatTrick });
  f.lastLabel = `${label} ${out ? "OUT" : ballText(ball, n)}`;

  if (n.legal && inn.legal % B === 0) {
    over.complete = true;
    if (over.bowlers.length === 1 && over.bowlerRuns === 0 && over.illegal === 0) {
      over.maiden = true;
      bw.maidens++;
    }
    if (!lone) {
      const t = inn.striker;
      inn.striker = inn.nonStriker;
      inn.nonStriker = t;
    }
    inn.lastOverBowler = bowler;
    inn.bowler = null;
    checkEnd(f, inn, ev);
    if (!inn.ended) inn.notes.push({ kind: "over", ev, over: overIdx, runs: over.runs, wickets: over.wickets, bowler, maiden: over.maiden, teamRuns: inn.runs, teamWkts: inn.wickets });
    return true;
  }
  checkEnd(f, inn, ev);
  return true;
}

function setBatter(f: Fold, inn: InnS, e: SetBatterEvent): boolean {
  const id = String(e.player ?? "");
  if (!id) return false;
  if (inn.striker === id || inn.nonStriker === id) return false;
  const existing = inn.bats.get(id);
  if (existing?.out) return false;
  const end: End = e.end ?? (inn.striker === null ? "striker" : "nonStriker");
  if ((end === "striker" ? inn.striker : inn.nonStriker) !== null) return false;
  ensurePlayer(f, inn.batting, id, e.name);
  const b = getBat(inn, id);
  if (b.retiredHurt) {
    b.retiredHurt = false;
    b.how = null;
  }
  if (end === "striker") inn.striker = id;
  else inn.nonStriker = id;
  if (inn.part.ids.length < 2 && !inn.part.ids.includes(id)) inn.part.ids.push(id);
  return true;
}

function retire(f: Fold, inn: InnS, e: RetireEvent, ev: number): boolean {
  const id = e.out === "nonStriker" ? inn.nonStriker : inn.striker;
  if (!id) return false;
  const kind: RetireKind = e.kind === "retiredOut" ? "retiredOut" : "retiredHurt";
  const b = getBat(inn, id);
  b.how = { kind, bowler: null, fielder: null };
  if (kind === "retiredOut") {
    b.out = true;
    inn.wickets++;
    inn.fow.push({ wicket: inn.wickets, runs: inn.runs, legal: inn.legal, batter: id });
    // Counts in the over it fell in (or the one just finished, like its fall of wicket), so overs, worm and FOW agree.
    const o = inn.overs[inn.overs.length - 1];
    if (o) o.wickets++;
    else inn.pendingWkts++;
    inn.wktsAt[inn.legal] = inn.wickets;
  } else b.retiredHurt = true;
  if (inn.striker === id) inn.striker = null;
  else inn.nonStriker = null;
  closePartnership(inn, inn.striker ?? inn.nonStriker);
  if (isLone(f, inn) && inn.striker === null) {
    inn.striker = inn.nonStriker;
    inn.nonStriker = null;
  }
  inn.notes.push({ kind: "retire", ev, id, retire: kind, runs: b.runs, balls: b.balls });
  checkEnd(f, inn, ev);
  return true;
}

function changeSetup(f: Fold, e: ChangeSetupEvent, ev: number) {
  const s = f.setup;
  f.setup = {
    ...s,
    teamA: cleanName(e.teamA, 32) || s.teamA,
    teamB: cleanName(e.teamB, 32) || s.teamB,
    overs: e.overs === undefined ? s.overs : clampInt(e.overs, 1, 100, s.overs),
    playersPerSide: e.playersPerSide === undefined ? s.playersPerSide : clampInt(e.playersPerSide, 2, 30, s.playersPerSide),
    rules: e.rules ? normalizeRules({ ...s.rules, ...e.rules }) : s.rules,
    title: e.title === undefined ? s.title : cleanName(e.title, 48),
    venue: e.venue === undefined ? s.venue : cleanName(e.venue, 48),
  };
  const inn = f.inns[f.inns.length - 1];
  if (!inn.ended && !f.done) {
    inn.maxBalls = f.setup.overs * B;
    if (!f.setup.rules.freeHit) inn.freeHit = false;
    checkEnd(f, inn, ev);
  }
}

/** One pass over the events. Never throws: events that do not fit are counted in ignored. */
function fold(match: Match): Fold {
  const setup = normalizeSetup(match.setup);
  const roster: Record<Side, Map<string, string>> = { a: new Map(), b: new Map() };
  for (const s of ["a", "b"] as const) for (const p of setup.players[s]) roster[s].set(p.id, p.name);
  const f: Fold = { id: match.id, setup, roster, inns: [newInn(0, setup.battingFirst, setup, null, 0)], abandoned: false, done: false, ignored: 0, lastLabel: null };
  const events = Array.isArray(match.events) ? match.events : [];

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const inn = f.inns[f.inns.length - 1];
    if (!e || typeof e !== "object") {
      f.ignored++;
      continue;
    }
    let ok = true;
    switch (e.type) {
      case "addPlayer": {
        const name = cleanName(e.name);
        if ((e.team === "a" || e.team === "b") && e.player && name && !f.roster[e.team].has(e.player)) f.roster[e.team].set(e.player, name);
        else ok = false;
        break;
      }
      case "renamePlayer": {
        const name = cleanName(e.name);
        if ((e.team === "a" || e.team === "b") && f.roster[e.team].has(e.player) && name) f.roster[e.team].set(e.player, name);
        else ok = false;
        break;
      }
      case "changeSetup":
        changeSetup(f, e, i);
        break;
      default:
        if (f.done || inn.ended) {
          ok = false;
          break;
        }
        switch (e.type) {
          case "ball":
            ok = playBall(f, inn, e, i);
            break;
          case "setBatter":
            ok = setBatter(f, inn, e);
            break;
          case "setBowler": {
            const id = String(e.player ?? "");
            if (!id) ok = false;
            else {
              ensurePlayer(f, inn.bowling, id, e.name);
              inn.bowler = id;
            }
            break;
          }
          case "swapStrike":
            if ((inn.striker || inn.nonStriker) && !isLone(f, inn)) [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
            else ok = false;
            break;
          case "retire":
            ok = retire(f, inn, e, i);
            break;
          case "endInnings":
            inn.ended = e.reason === "abandoned" ? "abandoned" : "declared";
            if (inn.ended === "abandoned") f.abandoned = true;
            markEnded(inn, i);
            break;
          default:
            ok = false;
        }
    }
    if (!ok) f.ignored++;

    // Move the match along: second innings as soon as the first ends.
    const last = f.inns[f.inns.length - 1];
    if (last.ended && !f.done) {
      if (f.abandoned || last.index === 1) f.done = true;
      else f.inns.push(newInn(1, last.bowling, f.setup, last.runs + 1, i + 1));
    }
  }
  return f;
}

/* ------------------------------------------------------------------ */
/* Turning the fold into words and numbers                             */
/* ------------------------------------------------------------------ */

function ballText(e: BallEvent, n: BallBreakdown): string {
  const extra: Extra = EXTRAS.has(e.extra) ? e.extra : "none";
  const offBat = (r: number) => (r === 4 ? "FOUR" : r === 6 ? "SIX" : r === 0 ? "no run" : plural(r, "run"));
  switch (extra) {
    case "wide":
      return n.wides > 1 ? `${n.wides} wides` : "wide";
    case "noBall": {
      const parts = ["no ball"];
      if (n.bat) parts.push(offBat(n.bat));
      if (n.byes) parts.push(plural(n.byes, "bye"));
      if (n.legByes) parts.push(plural(n.legByes, "leg bye"));
      return parts.join(", ");
    }
    case "bye":
      return plural(n.byes, "bye");
    case "legBye":
      return plural(n.legByes, "leg bye");
    default:
      return offBat(n.bat);
  }
}

function howOutText(how: DismissalS | null, bowlerName: string, fielderName: string): string {
  if (!how) return "not out";
  const b = bowlerName ? ` b ${bowlerName}` : "";
  switch (how.kind) {
    case "bowled":
      return `b ${bowlerName}`.trim();
    case "caught":
      if (how.fielder && how.fielder === how.bowler) return `c & b ${bowlerName}`;
      return fielderName ? `c ${fielderName}${b}` : `caught${b}`;
    case "lbw":
      return `lbw${b}`;
    case "stumped":
      return fielderName ? `st ${fielderName}${b}` : `stumped${b}`;
    case "hitWicket":
      return `hit wicket${b}`;
    case "runOut":
      return fielderName ? `run out (${fielderName})` : "run out";
    case "retiredHurt":
      return "retired hurt";
    case "retiredOut":
      return "retired out";
    case "obstructing":
      return "obstructing the field";
  }
}

const sr = (runs: number, balls: number) => (balls > 0 ? (runs / balls) * 100 : null);

function buildInnings(f: Fold, inn: InnS, live: boolean): InningsView {
  const s = f.setup;
  const teamName = (side: Side) => (side === "a" ? s.teamA : s.teamB);
  const batName = (id: string | null) => (id ? (f.roster[inn.batting].get(id) ?? id) : "");
  const bowlName = (id: string | null) => (id ? (f.roster[inn.bowling].get(id) ?? id) : "");
  /** A fielder may be a roster id or just a typed name. */
  const fieldName = (id: string | null) => (id ? (f.roster[inn.bowling].get(id) ?? f.roster[inn.batting].get(id) ?? id) : "");

  const dismissal = (how: DismissalS | null): Dismissal | null =>
    how ? { kind: how.kind, bowler: how.bowler, bowlerName: bowlName(how.bowler), fielder: how.fielder, fielderName: fieldName(how.fielder) } : null;

  const batLine = (b: BatS): BatterLine => {
    const atCrease = inn.striker === b.id || inn.nonStriker === b.id;
    const status: BatterLine["status"] = b.out ? "out" : b.retiredHurt ? "retiredHurt" : atCrease && live ? "batting" : "notOut";
    return {
      id: b.id,
      name: batName(b.id),
      order: b.order,
      runs: b.runs,
      balls: b.balls,
      fours: b.fours,
      sixes: b.sixes,
      dots: b.dots,
      sr: sr(b.runs, b.balls),
      status,
      onStrike: live && inn.striker === b.id,
      howOut: howOutText(b.how, bowlName(b.how?.bowler ?? null), fieldName(b.how?.fielder ?? null)),
      dismissal: dismissal(b.how),
    };
  };
  const batters = [...inn.bats.values()].sort((x, y) => x.order - y.order).map(batLine);
  const batById = new Map(batters.map((b) => [b.id, b]));

  const bowlLine = (b: BowlS): BowlerLine => ({
    id: b.id,
    name: bowlName(b.id),
    order: b.order,
    balls: b.balls,
    overs: formatOvers(b.balls),
    maidens: b.maidens,
    runs: b.runs,
    wickets: b.wickets,
    dots: b.dots,
    wides: b.wides,
    noBalls: b.noBalls,
    fours: b.fours,
    sixes: b.sixes,
    econ: runRate(b.runs, b.balls),
    figures: `${b.wickets}/${b.runs}`,
    current: live && inn.bowler === b.id,
  });
  const bowlers = [...inn.bowls.values()].sort((x, y) => x.order - y.order).map(bowlLine);
  const emptyBowl = (id: string): BowlerLine => bowlLine({ id, order: 0, balls: 0, runs: 0, wickets: 0, dots: 0, wides: 0, noBalls: 0, fours: 0, sixes: 0, maidens: 0, streak: 0 });

  const partView = (p: PartS, number: number, unbroken: boolean): PartnershipView => {
    const bs = p.ids.map((id) => ({ id, name: batName(id), runs: p.by[id]?.runs ?? 0, balls: p.by[id]?.balls ?? 0 }));
    const who = bs.map((b) => b.name).join(" and ");
    return { number, batters: bs, runs: p.runs, balls: p.balls, extras: p.extras, unbroken, text: `${who}, ${p.runs} (${p.balls})` };
  };
  const partnerships = inn.parts.map((p, i) => partView(p, i + 1, false));
  const current = inn.part.ids.length ? partView(inn.part, partnerships.length + 1, true) : null;
  if (current) partnerships.push(current);

  const fow: FowView[] = inn.fow.map((w) => ({
    wicket: w.wicket,
    runs: w.runs,
    balls: w.legal,
    overs: formatOvers(w.legal),
    batter: w.batter,
    name: batName(w.batter),
    text: `${w.runs}-${w.wicket} (${batName(w.batter)}, ${formatOvers(w.legal)} ov)`,
  }));
  const lastFow = fow[fow.length - 1];
  const lastOutBat = lastFow ? batById.get(lastFow.batter) : undefined;
  const lastWicket = lastFow && lastOutBat ? `${lastOutBat.name} ${lastOutBat.howOut} ${lastOutBat.runs} (${lastOutBat.balls}), ${lastFow.runs}-${lastFow.wicket} (${lastFow.overs} ov)` : null;

  let cumRuns = 0;
  let cumWkts = 0;
  const byOver: OverView[] = inn.overs.map((o) => {
    cumRuns += o.runs;
    cumWkts += o.wickets;
    let main: string | null = null;
    for (const id of o.bowlers) if (main === null || (o.bowlerBalls[id] ?? 0) > (o.bowlerBalls[main] ?? 0)) main = id;
    return {
      number: o.index + 1,
      bowler: main,
      bowlerName: o.bowlers.map(bowlName).join(", "),
      runs: o.runs,
      wickets: o.wickets,
      extras: o.extras,
      legalBalls: o.legal,
      balls: o.balls,
      maiden: o.maiden,
      complete: o.complete,
      totalRuns: cumRuns,
      totalWickets: cumWkts,
    };
  });
  const worm: WormPoint[] = [{ balls: 0, runs: 0, wickets: 0 }];
  for (const o of byOver) worm.push({ balls: o.complete ? o.number * B : inn.legal, runs: o.totalRuns, wickets: o.totalWickets });

  const extras: Extras = { ...inn.extras, total: inn.extras.wides + inn.extras.noBalls + inn.extras.byes + inn.extras.legByes };
  const xParts = [extras.wides ? `wd ${extras.wides}` : "", extras.noBalls ? `nb ${extras.noBalls}` : "", extras.byes ? `b ${extras.byes}` : "", extras.legByes ? `lb ${extras.legByes}` : ""].filter(Boolean);
  const crr = runRate(inn.runs, inn.legal);
  const overs = formatOvers(inn.legal);
  const score = `${inn.runs}/${inn.wickets}`;

  const commentary = buildCommentary(f, inn, { batName, bowlName, fieldName, batById });

  return {
    index: inn.index,
    batting: inn.batting,
    bowling: inn.bowling,
    battingName: teamName(inn.batting),
    bowlingName: teamName(inn.bowling),
    runs: inn.runs,
    wickets: inn.wickets,
    legalBalls: inn.legal,
    maxBalls: inn.maxBalls,
    ballsLeft: Math.max(0, inn.maxBalls - inn.legal),
    overs,
    score,
    summary: `${teamName(inn.batting)} ${score} (${overs} ov)`,
    extras,
    extrasText: `Extras ${extras.total}${xParts.length ? ` (${xParts.join(", ")})` : ""}`,
    crr,
    projected: crr === null ? null : Math.round(inn.runs + (crr * Math.max(0, inn.maxBalls - inn.legal)) / B),
    target: inn.target,
    live,
    ended: inn.ended,
    striker: live && inn.striker ? (batById.get(inn.striker) ?? null) : null,
    nonStriker: live && inn.nonStriker ? (batById.get(inn.nonStriker) ?? null) : null,
    bowler: live && inn.bowler ? (bowlers.find((b) => b.id === inn.bowler) ?? { ...emptyBowl(inn.bowler), current: true }) : null,
    lastOverBowler: inn.lastOverBowler,
    freeHit: live && inn.freeHit,
    batters,
    yetToBat: [...f.roster[inn.batting]].filter(([id]) => !inn.bats.has(id)).map(([id, name]) => ({ id, name })),
    bowlers,
    partnership: current,
    partnerships,
    fow,
    lastWicket,
    byOver,
    worm,
    thisOver: byOver[byOver.length - 1] ?? null,
    fours: inn.fours,
    sixes: inn.sixes,
    dots: inn.dots,
    commentary,
  };
}

type Namers = {
  batName: (id: string | null) => string;
  bowlName: (id: string | null) => string;
  fieldName: (id: string | null) => string;
  batById: Map<string, BatterLine>;
};

function buildCommentary(f: Fold, inn: InnS, nm: Namers): CommentaryLine[] {
  const s = f.setup;
  const team = (side: Side) => (side === "a" ? s.teamA : s.teamB);
  const lines: CommentaryLine[] = [];
  for (const note of inn.notes) {
    if (note.kind === "ball") {
      const bowler = nm.bowlName(note.bowler);
      const striker = nm.batName(note.striker);
      let text: string;
      if (note.out) {
        const how = howOutText(note.out.how, nm.bowlName(note.out.how.bowler), nm.fieldName(note.out.how.fielder));
        text = `OUT! ${nm.batName(note.out.id)} ${how} ${note.out.runs} (${note.out.balls})`;
        const rest = ballText(note.e, note.n);
        if (rest !== "no run") text += `. ${rest[0].toUpperCase()}${rest.slice(1)}${note.e.wicket?.kind === "runOut" && note.n.ran && note.e.extra !== "wide" ? " completed" : ""}`;
      } else {
        text = `${bowler} to ${striker}, ${ballText(note.e, note.n)}`;
      }
      if (note.freeHit) text += " (free hit)";
      for (const m of note.milestones) text += `. ${nm.batName(m.id)} reaches ${m.runs} off ${plural(m.balls, "ball")}`;
      if (note.hatTrick) text += `. HAT-TRICK for ${bowler}!`;
      if (note.nextFreeHit && !note.freeHit) text += ". Free hit next";
      lines.push({ key: `e${note.ev}`, kind: "ball", label: note.label, text, line: `${note.label} ${text}`, chip: describeBall(note.e), tone: ballTone(note.e), wicket: !!note.out, event: note.ev });
    } else if (note.kind === "over") {
      const wkts = note.wickets ? `, ${plural(note.wickets, "wicket")}` : "";
      const what = note.maiden ? (note.wickets ? `wicket maiden${note.wickets > 1 ? wkts : ""}` : "maiden") : `${plural(note.runs, "run")}${wkts}`;
      const text = `End of over ${note.over + 1}: ${what} (${nm.bowlName(note.bowler)}). ${team(inn.batting)} ${note.teamRuns}/${note.teamWkts}`;
      lines.push({ key: `e${note.ev}-over`, kind: "over", label: "", text, line: text, chip: null, tone: null, wicket: false, event: note.ev });
    } else if (note.kind === "retire") {
      const text = `${nm.batName(note.id)} ${note.retire === "retiredOut" ? "retired out" : "retired hurt"} ${note.runs} (${note.balls})`;
      lines.push({ key: `e${note.ev}`, kind: "info", label: "", text, line: text, chip: null, tone: null, wicket: note.retire === "retiredOut", event: note.ev });
    } else {
      const why: Record<EndReason, string> = { overs: "overs done", allOut: "all out", target: "target reached", declared: "innings closed", abandoned: "match abandoned" };
      const text = `Innings over (${why[inn.ended ?? "declared"]}): ${team(inn.batting)} ${inn.runs}/${inn.wickets} (${formatOvers(inn.legal)} ov)`;
      lines.push({ key: `e${note.ev}-end`, kind: "info", label: "", text, line: text, chip: null, tone: null, wicket: false, event: note.ev });
    }
  }
  return lines;
}

function resultOf(f: Fold): ResultView | null {
  const s = f.setup;
  const name = (side: Side) => (side === "a" ? s.teamA : s.teamB);
  if (f.abandoned) return { kind: "noResult", winner: null, winnerName: "", margin: 0, ballsLeft: 0, text: "No result" };
  if (!f.done || f.inns.length < 2) return null;
  const [first, second] = f.inns;
  const ballsLeft = Math.max(0, second.maxBalls - second.legal);
  if (second.runs > first.runs) {
    const w = Math.max(0, wicketLimit(s) - second.wickets);
    const winnerName = name(second.batting);
    const tail = ballsLeft > 0 ? ` with ${plural(ballsLeft, "ball")} left` : " off the last ball";
    return { kind: "wickets", winner: second.batting, winnerName, margin: w, ballsLeft, text: `${winnerName} won by ${plural(w, "wicket")}${tail}` };
  }
  if (second.runs === first.runs) return { kind: "tie", winner: null, winnerName: "", margin: 0, ballsLeft: 0, text: "Match tied" };
  const margin = first.runs - second.runs;
  const winnerName = name(first.batting);
  return { kind: "runs", winner: first.batting, winnerName, margin, ballsLeft: 0, text: `${winnerName} won by ${plural(margin, "run")}` };
}

function awardsOf(f: Fold, views: InningsView[], result: ResultView | null): Awards {
  type Acc = { id: string; side: Side; name: string; runs: number; balls: number; out: boolean; batted: boolean; wkts: number; conceded: number; bowled: number; dots: number; c: number; st: number; ro: number };
  const acc = new Map<string, Acc>();
  const get = (side: Side, id: string, name: string): Acc => {
    const k = `${side}:${id}`;
    let a = acc.get(k);
    if (!a) {
      a = { id, side, name, runs: 0, balls: 0, out: false, batted: false, wkts: 0, conceded: 0, bowled: 0, dots: 0, c: 0, st: 0, ro: 0 };
      acc.set(k, a);
    }
    return a;
  };
  let matchRuns = 0;
  let matchBalls = 0;
  for (const v of views) {
    matchRuns += v.runs;
    matchBalls += v.legalBalls;
    for (const b of v.batters) {
      const a = get(v.batting, b.id, b.name);
      a.batted = true;
      a.runs += b.runs;
      a.balls += b.balls;
      a.out = a.out || b.status === "out";
      const d = b.dismissal;
      if (d?.fielder) {
        const fa = get(v.bowling, d.fielder, d.fielderName);
        if (d.kind === "caught") fa.c++;
        else if (d.kind === "stumped") fa.st++;
        else if (d.kind === "runOut") fa.ro++;
      }
    }
    for (const b of v.bowlers) {
      const a = get(v.bowling, b.id, b.name);
      a.wkts += b.wickets;
      a.conceded += b.runs;
      a.bowled += b.balls;
      a.dots += b.dots;
    }
  }
  const all = [...acc.values()];
  if (!matchBalls && !all.some((a) => a.balls)) return { topScorer: null, bestBowler: null, potm: null };

  const batText = (a: Acc) => `${a.runs}${a.out ? "" : "*"} (${a.balls})`;
  const bowlText = (a: Acc) => `${a.wkts}/${a.conceded}`;

  const batters = all.filter((a) => a.batted && (a.balls > 0 || a.runs > 0));
  batters.sort((x, y) => y.runs - x.runs || x.balls - y.balls);
  const top = batters[0];
  const bowlers = all.filter((a) => a.bowled > 0);
  bowlers.sort((x, y) => y.wkts - x.wkts || x.conceded - y.conceded || y.bowled - x.bowled);
  const best = bowlers[0];

  // Impact: runs plus half the runs above a run a ball; 20 a wicket, a run a dot,
  // and runs saved against the match rate; 8 for each catch, stumping or run out.
  const perBall = matchBalls ? matchRuns / matchBalls : 1;
  let potm: AwardLine | null = null;
  for (const a of all) {
    let score = 0;
    if (a.balls > 0 || a.runs > 0) score += a.runs + (a.runs - a.balls) * 0.5;
    if (a.bowled > 0) score += a.wkts * 20 + a.dots + (a.bowled * perBall - a.conceded);
    score += (a.c + a.st + a.ro) * 8;
    if (result?.winner && a.side === result.winner) score += 10;
    if (!potm || score > potm.score) {
      const parts = [
        a.balls > 0 || a.runs > 0 ? batText(a) : "",
        a.bowled > 0 ? bowlText(a) : "",
        a.c ? plural(a.c, "catch", "catches") : "",
        a.st ? plural(a.st, "stumping") : "",
        a.ro ? plural(a.ro, "run out") : "",
      ].filter(Boolean);
      potm = { id: a.id, side: a.side, name: a.name, text: `${a.name}${parts.length ? `, ${parts.join(" and ")}` : ""}`, score: Math.round(score * 10) / 10 };
    }
  }
  return {
    topScorer: top ? { id: top.id, side: top.side, name: top.name, text: `${top.name} ${batText(top)}`, score: top.runs } : null,
    bestBowler: best ? { id: best.id, side: best.side, name: best.name, text: `${best.name} ${bowlText(best)}`, score: best.wkts } : null,
    potm,
  };
}

/** The full view model the scorer renders. Fast: a single pass over the events. */
export function derive(match: Match): MatchView {
  const f = fold(match);
  const s = f.setup;
  const inn = f.inns[f.inns.length - 1];
  const live = !f.done;
  const innings = f.inns.map((i) => buildInnings(f, i, live && i === inn));
  const current = innings[innings.length - 1];
  const result = resultOf(f);
  const teamName = (side: Side) => (side === "a" ? s.teamA : s.teamB);
  const roster = (side: Side): Player[] => [...f.roster[side]].map(([id, name]) => ({ id, name }));

  let chase: ChaseView | null = null;
  if (inn.index === 1 && inn.target !== null && live) {
    const runsNeeded = Math.max(0, inn.target - inn.runs);
    const ballsLeft = Math.max(0, inn.maxBalls - inn.legal);
    const first = f.inns[0];
    const sameStage = inn.legal <= first.legal && first.scoreAt[inn.legal] !== undefined ? { runs: first.scoreAt[inn.legal], wickets: first.wktsAt[inn.legal] } : null;
    chase = {
      target: inn.target,
      runsNeeded,
      ballsLeft,
      rrr: runRate(runsNeeded, ballsLeft),
      text: `${runsNeeded === 1 ? "Scores level, need" : "Need"} ${plural(runsNeeded, "run")} off ${plural(ballsLeft, "ball")}`,
      sameStage,
    };
  }

  const needs: Need[] = [];
  if (live) {
    if (inn.striker === null) needs.push("striker");
    if (inn.nonStriker === null && !mayBatAlone(f, inn)) needs.push("nonStriker");
    if (inn.bowler === null) needs.push("bowler");
  }

  const max = s.rules.maxOversPerBowler;
  const bowlerOptions: BowlerOption[] = live
    ? roster(inn.bowling).map((p) => {
        const b = inn.bowls.get(p.id);
        const balls = b?.balls ?? 0;
        const blocked: BowlerOption["blocked"] = max !== null && balls >= max * B ? "quota" : inn.lastOverBowler === p.id ? "lastOver" : null;
        return { id: p.id, name: p.name, balls, overs: formatOvers(balls), runs: b?.runs ?? 0, wickets: b?.wickets ?? 0, current: inn.bowler === p.id, blocked };
      })
    : [];
  const batterOptions: BatterOption[] = live
    ? roster(inn.batting)
        .filter((p) => p.id !== inn.striker && p.id !== inn.nonStriker && !inn.bats.get(p.id)?.out)
        .map((p) => {
          const b = inn.bats.get(p.id);
          return { id: p.id, name: p.name, retiredHurt: !!b?.retiredHurt, runs: b?.runs ?? 0, balls: b?.balls ?? 0 };
        })
    : [];

  const warnings: string[] = [];
  if (live && inn.bowler) {
    const nm = f.roster[inn.bowling].get(inn.bowler) ?? inn.bowler;
    if (inn.bowler === inn.lastOverBowler) warnings.push(`${nm} bowled the last over too`);
    const b = inn.bowls.get(inn.bowler);
    if (max !== null && b && b.balls >= max * B) warnings.push(`${nm} has bowled all ${plural(max, "over")}`);
  }
  const retireAt = s.rules.retireAt;
  const retireDue = live && retireAt !== null ? [inn.striker, inn.nonStriker].filter((id): id is string => !!id && (inn.bats.get(id)?.runs ?? 0) >= retireAt) : [];
  for (const id of retireDue) warnings.push(`${f.roster[inn.batting].get(id) ?? id} has ${inn.bats.get(id)?.runs ?? 0}, time to retire as per your rule`);

  const onHatTrick = live && !!inn.bowler && (inn.bowls.get(inn.bowler)?.streak ?? 0) === 2;
  // Until anyone is picked for the chase; once the openers and bowler are in, the header and Live tab show them.
  const inningsBreak = live && inn.index === 1 && inn.deliveries === 0 && inn.striker === null && inn.nonStriker === null && inn.bowler === null;
  let headline = current.summary;
  if (result) headline = result.text;
  else if (chase) {
    const eq = `${teamName(inn.batting)} need ${plural(chase.runsNeeded, "run")} off ${plural(chase.ballsLeft, "ball")}`;
    headline = chase.runsNeeded === 1 ? `Scores level. ${eq}` : eq;
  }

  const lastEvent = match.events[match.events.length - 1];
  let lastAction: string | null = null;
  if (lastEvent) {
    const p = (side: Side, id: string) => f.roster[side].get(id) ?? id;
    switch (lastEvent.type) {
      case "ball":
        lastAction = f.lastLabel;
        break;
      case "setBatter":
        lastAction = `${p(inn.batting, lastEvent.player)} in`;
        break;
      case "setBowler":
        lastAction = `${p(inn.bowling, lastEvent.player)} to bowl`;
        break;
      case "swapStrike":
        lastAction = "Strike swapped";
        break;
      case "retire":
        lastAction = lastEvent.kind === "retiredOut" ? "Retired out" : "Retired hurt";
        break;
      case "endInnings":
        lastAction = lastEvent.reason === "abandoned" ? "Match abandoned" : "Innings ended";
        break;
      case "addPlayer":
        lastAction = `${cleanName(lastEvent.name)} added`;
        break;
      case "renamePlayer":
        lastAction = `Renamed to ${cleanName(lastEvent.name)}`;
        break;
      case "changeSetup":
        lastAction = "Match settings changed";
        break;
    }
  }

  return {
    id: f.id,
    setup: { ...s, players: { a: roster("a"), b: roster("b") } },
    teams: { a: { name: s.teamA, players: roster("a") }, b: { name: s.teamB, players: roster("b") } },
    innings,
    current,
    status: live ? "live" : "done",
    inningsBreak,
    needs,
    ready: live && needs.length === 0,
    freeHit: live && inn.freeHit,
    chase,
    result,
    headline,
    warnings,
    batterOptions,
    bowlerOptions,
    retireDue,
    onHatTrick,
    awards: awardsOf(f, innings, result),
    lastAction,
    eventCount: match.events.length,
    ignored: f.ignored,
  };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export type CheckResult = { error: string | null; warnings: string[] };

/**
 * Would this event make sense now? error blocks it (apply refuses it),
 * warnings are for the UI to show or ignore, like a bowler bowling two
 * overs in a row.
 */
export function check(match: Match, e: MatchEvent): CheckResult {
  const warnings: string[] = [];
  const fail = (error: string): CheckResult => ({ error, warnings });
  if (!e || typeof e !== "object" || typeof e.type !== "string") return fail("That is not a scoring event");
  const f = fold(match);
  const inn = f.inns[f.inns.length - 1];
  const s = f.setup;
  const isSide = (x: unknown): x is Side => x === "a" || x === "b";

  switch (e.type) {
    case "addPlayer":
      if (!isSide(e.team)) return fail("Pick a team");
      if (!e.player) return fail("Missing player id");
      if (!cleanName(e.name)) return fail("Type a name");
      if (f.roster[e.team].has(e.player)) return fail("That player is already in the team");
      return { error: null, warnings };
    case "renamePlayer":
      if (!isSide(e.team) || !f.roster[e.team].has(e.player)) return fail("Player not found");
      if (!cleanName(e.name)) return fail("Type a name");
      return { error: null, warnings };
    case "changeSetup": {
      if (e.overs !== undefined && !(Number(e.overs) >= 1)) return fail("Overs must be at least 1");
      if (e.playersPerSide !== undefined && !(Number(e.playersPerSide) >= 2)) return fail("A side needs at least 2 players");
      if (!f.done && e.overs !== undefined && Math.round(Number(e.overs)) * B <= inn.legal) warnings.push("This ends the current innings");
      return { error: null, warnings };
    }
  }

  if (f.done) return fail("The match is over. Undo to change the last ball.");

  switch (e.type) {
    case "ball": {
      if (inn.striker === null) return fail("Pick who is on strike first");
      if (inn.nonStriker === null && !mayBatAlone(f, inn)) return fail("Pick the non-striker first");
      if (inn.bowler === null) return fail(inn.legal === 0 ? "Pick the opening bowler first" : "Pick the bowler for this over first");
      if (!EXTRAS.has(e.extra)) return fail("Unknown extra");
      const okRuns = (x: unknown) => x === undefined || (Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 7);
      if (!okRuns(e.runs)) return fail("Runs off the bat are 0 to 7");
      if (!okRuns(e.extraRuns)) return fail("Extra runs are 0 to 7");
      const runs = e.runs ?? 0;
      const xr = e.extraRuns ?? 0;
      if (e.extra === "wide" && runs > 0) return fail("Runs on a wide count as wides, so put them in extra runs");
      if ((e.extra === "bye" || e.extra === "legBye") && runs > 0) return fail("Byes are not off the bat, so put them in extra runs");
      if ((e.extra === "bye" || e.extra === "legBye") && xr === 0) return fail("Add how many byes they ran");
      if (e.extra === "none" && xr > 0) return fail("Extra runs need a wide, no-ball, bye or leg bye");
      if (e.extra === "noBall" && runs > 0 && xr > 0) return fail("On a no-ball the runs are off the bat or byes, not both");
      if (e.wicket) {
        const w = e.wicket;
        const kind: string = w.kind;
        if (!BALL_KINDS.has(kind)) return fail(kind === "retiredHurt" || kind === "retiredOut" ? "Use retire for a retirement, it is not a ball" : "Unknown way of getting out");
        const out: End = w.out ?? "striker";
        if (out !== "striker" && out !== "nonStriker") return fail("Who is out: striker or non-striker");
        if (out === "nonStriker" && inn.nonStriker === null) return fail("The last batter is batting alone");
        const allowed = allowedWicketKinds(e.extra, { freeHit: inn.freeHit, out, runs: runs + xr });
        if (!allowed.includes(w.kind)) {
          if (out === "nonStriker") return fail("The non-striker can only be run out");
          if (inn.freeHit) return fail("Free hit: the batter can only be run out");
          if (e.extra === "wide") return fail(runs + xr ? "If they ran on the wide, it can only be a run out" : "Off a wide the batter can only be stumped, run out or hit wicket");
          if (e.extra === "noBall") return fail("Off a no-ball the batter can only be run out");
          if (e.extra === "bye" || e.extra === "legBye") return fail("On byes only a run out is possible");
          return fail("If they ran, it can only be a run out");
        }
        // Law 16.6: the match ends the moment the winning run (or the wide or no-ball penalty) is scored.
        if (inn.target !== null && inn.runs + breakdown(e, s.rules).total >= inn.target) return fail("The winning run ends the match, so that wicket does not count. Just score the runs.");
      }
      if (inn.bowler === inn.lastOverBowler && inn.legal % B === 0 && !inn.overs.some((o) => o.index === inn.legal / B)) {
        warnings.push(`${f.roster[inn.bowling].get(inn.bowler) ?? inn.bowler} bowled the last over too`);
      }
      return { error: null, warnings };
    }
    case "setBatter": {
      const id = String(e.player ?? "");
      if (!id) return fail("Pick a batter");
      const known = f.roster[inn.batting].has(id);
      if (!known && !cleanName(e.name)) return fail("Type the batter's name");
      const name = f.roster[inn.batting].get(id) ?? cleanName(e.name);
      if (inn.striker === id || inn.nonStriker === id) return fail(`${name} is already batting`);
      if (inn.bats.get(id)?.out) return fail(`${name} is already out`);
      if (e.end !== undefined && e.end !== "striker" && e.end !== "nonStriker") return fail("Pick an end");
      if (e.end && (e.end === "striker" ? inn.striker : inn.nonStriker) !== null) return fail("Someone is already batting at that end");
      if (!e.end && inn.striker !== null && inn.nonStriker !== null) return fail("Both batters are in. Retire someone first.");
      if (inn.bats.get(id)?.retiredHurt) warnings.push(`${name} comes back after retiring hurt`);
      return { error: null, warnings };
    }
    case "setBowler": {
      const id = String(e.player ?? "");
      if (!id) return fail("Pick a bowler");
      const known = f.roster[inn.bowling].has(id);
      if (!known && !cleanName(e.name)) return fail("Type the bowler's name");
      const name = f.roster[inn.bowling].get(id) ?? cleanName(e.name);
      if (inn.bowler === id) return fail(`${name} is already bowling`);
      if (inn.lastOverBowler === id) warnings.push(`${name} bowled the last over. A bowler cannot bowl two overs in a row.`);
      const max = s.rules.maxOversPerBowler;
      const b = inn.bowls.get(id);
      if (max !== null && b && b.balls >= max * B) warnings.push(`${name} has bowled all ${plural(max, "over")}`);
      return { error: null, warnings };
    }
    case "swapStrike":
      if (inn.striker === null && inn.nonStriker === null) return fail("No batters in yet");
      if (isLone(f, inn)) return fail("The last batter is batting alone");
      return { error: null, warnings };
    case "retire": {
      if (e.out !== "striker" && e.out !== "nonStriker") return fail("Who is retiring: striker or non-striker");
      if ((e.out === "striker" ? inn.striker : inn.nonStriker) === null) return fail("No batter at that end");
      if (e.kind !== "retiredHurt" && e.kind !== "retiredOut") return fail("Retired hurt or retired out");
      return { error: null, warnings };
    }
    case "endInnings":
      if (e.reason !== undefined && e.reason !== "declared" && e.reason !== "abandoned") return fail("Unknown reason");
      return { error: null, warnings };
    default:
      return fail("That is not a scoring event");
  }
}

/* ------------------------------------------------------------------ */
/* Sharing                                                             */
/* ------------------------------------------------------------------ */

const rate = (r: number | null) => formatRate(r);
const batShort = (b: BatterLine, mark = b.status === "batting" || b.status === "notOut") => `${b.name} ${b.runs}${mark ? "*" : ""} (${b.balls})`;
const bowlFigures = (b: BowlerLine) => `${b.name} ${b.overs}-${b.maidens}-${b.runs}-${b.wickets}`;

/**
 * A WhatsApp-friendly score update. *Bold* is WhatsApp's own markdown.
 * Live: score, rates or equation, batters, bowler, this over. Finished:
 * result, both scores, top scorer, best bowler, player of the match.
 */
export function shareText(view: MatchView, opts: { link?: string } = {}): string {
  const s = view.setup;
  const lines: string[] = [];
  const head = `${s.teamA} vs ${s.teamB}${s.title ? `, ${s.title}` : ""}`;
  const footer = opts.link ? `Live score: ${opts.link}` : "Scored ball by ball on TapTurf.in";

  if (view.status === "done") {
    lines.push(`*${view.result?.text ?? "Match over"}*`, head);
    for (const inn of view.innings) if (inn.legalBalls || inn.runs || inn.wickets) lines.push(inn.summary);
    const { topScorer, bestBowler, potm } = view.awards;
    if (topScorer) lines.push(`Top scorer: ${topScorer.text}`);
    if (bestBowler) lines.push(`Best bowler: ${bestBowler.text}`);
    if (potm) lines.push(`Player of the match: ${potm.name}`);
    lines.push(footer);
    return lines.join("\n");
  }

  const cur = view.current;
  lines.push(head);
  if (cur.index === 1) lines.push(view.innings[0].summary);
  if (view.inningsBreak && view.chase) {
    lines.push(`*Innings break.* ${cur.battingName} need ${plural(view.chase.target, "run")} off ${plural(view.chase.ballsLeft, "ball")}`);
    lines.push(footer);
    return lines.join("\n");
  }
  lines.push(`*${cur.summary}*`);
  if (view.chase) lines.push(`${view.chase.text}${view.chase.rrr !== null ? `, RRR ${rate(view.chase.rrr)}` : ""}`);
  else if (cur.crr !== null) lines.push(`CRR ${rate(cur.crr)}${cur.projected !== null ? `, projected ${cur.projected}` : ""}`);
  const bats = [cur.striker, cur.nonStriker].filter((b): b is BatterLine => !!b).map((b) => batShort(b));
  if (bats.length) lines.push(bats.join(", "));
  if (cur.bowler) lines.push(`Bowling: ${bowlFigures(cur.bowler)}`);
  if (cur.thisOver && cur.thisOver.balls.length) lines.push(`${cur.thisOver.complete ? `Over ${cur.thisOver.number}` : "This over"}: ${cur.thisOver.balls.map((b) => b.chip).join(" ")}`);
  if (cur.lastWicket) lines.push(`Last wicket: ${cur.lastWicket}`);
  if (view.freeHit) lines.push("Next ball is a free hit");
  lines.push(footer);
  return lines.join("\n");
}

/** The fields ScorecardMaker draws. Team a is the side that batted first. */
export type ScorecardFields = {
  tournament: string;
  aName: string;
  aRuns: string;
  aWkts: string;
  aOvers: string;
  bName: string;
  bRuns: string;
  bWkts: string;
  bOvers: string;
  result: string;
  potm: string;
  topScorer: string;
  bestBowler: string;
  venue: string;
};

/**
 * Map the match onto the result card. The side that batted first is
 * card team A, so ScorecardMaker's "who batted first" is "a".
 */
export function toScorecard(view: MatchView): ScorecardFields {
  const s = view.setup;
  const first = view.innings[0];
  const second = view.innings[1];
  const firstSide = first.batting;
  const secondSide: Side = firstSide === "a" ? "b" : "a";
  const name = (side: Side) => (side === "a" ? s.teamA : s.teamB);
  const played = (inn: InningsView | undefined) => !!inn && (inn.legalBalls > 0 || inn.runs > 0 || inn.wickets > 0);
  const { topScorer, bestBowler, potm } = view.awards;
  return {
    tournament: s.title,
    aName: name(firstSide),
    aRuns: played(first) ? String(first.runs) : "",
    aWkts: played(first) ? String(first.wickets) : "",
    aOvers: played(first) ? first.overs : "",
    bName: name(secondSide),
    bRuns: played(second) ? String(second!.runs) : "",
    bWkts: played(second) ? String(second!.wickets) : "",
    bOvers: played(second) ? second!.overs : "",
    result: view.result?.text ?? view.headline,
    potm: potm?.name ?? "",
    topScorer: topScorer?.text ?? "",
    bestBowler: bestBowler?.text ?? "",
    venue: s.venue,
  };
}
