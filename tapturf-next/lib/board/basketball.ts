import type { BasketballRules, Board, BoardEvent, BoardView, EndEvent, PadAction, RulePreset, Side, SportEngine, TimelineLine } from "./types";
import { blankView, bool, cleanName, clampInt, clockText, clockValue, isObj, namesNow, newClock, oneOf, other, plural, runClock, SIDES, stopClock, stoppedResult, type PeriodClock } from "./common";

/**
 * Basketball: quarters or halves on a count-down clock, or pickup "first
 * to 21" with no clock, or FIBA 3x3 (both). Team fouls per period with
 * the bonus, timeouts and overtime.
 */

const MIN = 60_000;
/** FIBA Art. 8.7: each overtime is 5 minutes. */
export const OVERTIME_MS = 5 * MIN;

const DEFAULTS: BasketballRules = { periods: 4, periodMinutes: 10, clock: true, target: null, winBy: 1, scoring: "2s-3s", foulLimit: 4 };

function normalizeRules(raw: unknown): BasketballRules {
  const r = isObj(raw) ? raw : {};
  return {
    periods: oneOf(r.periods, [1, 2, 4], DEFAULTS.periods),
    periodMinutes: clampInt(r.periodMinutes, 1, 20, DEFAULTS.periodMinutes),
    clock: bool(r.clock, DEFAULTS.clock),
    target: r.target === null || r.target === undefined ? null : clampInt(r.target, 1, 200, 21),
    winBy: oneOf(r.winBy, [1, 2], DEFAULTS.winBy),
    scoring: oneOf(r.scoring, ["2s-3s", "1s-2s"] as const, DEFAULTS.scoring),
    foulLimit: clampInt(r.foulLimit, 1, 10, DEFAULTS.foulLimit),
  };
}

const QUARTERS = { clock: true, target: null, winBy: 1, scoring: "2s-3s", foulLimit: 4 } as const;
const PRESETS: RulePreset<BasketballRules>[] = [
  {
    key: "format",
    label: "Format",
    options: [
      { label: "4 x 10", rules: { ...QUARTERS, periods: 4, periodMinutes: 10 } },
      { label: "4 x 12", rules: { ...QUARTERS, periods: 4, periodMinutes: 12 } },
      { label: "2 x 20", rules: { ...QUARTERS, periods: 2, periodMinutes: 20 } },
      { label: "Pickup: to 21, win by 2, no clock", rules: { periods: 1, clock: false, target: 21, winBy: 2, scoring: "2s-3s", foulLimit: 4 } },
      // FIBA 3x3: one 10 minute period, first to 21, 1 inside the arc and 2 outside, penalty after 6 team fouls.
      { label: "3x3: 10 min, first to 21, 1s and 2s, bonus after 6", rules: { periods: 1, periodMinutes: 10, clock: true, target: 21, winBy: 1, scoring: "1s-2s", foulLimit: 6 } },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* The fold                                                            */
/* ------------------------------------------------------------------ */

/** How each basket counts, per scoring. */
const HOWS: Record<BasketballRules["scoring"], Record<string, number>> = {
  "2s-3s": { "free-throw": 1, two: 2, three: 3 },
  "1s-2s": { "free-throw": 1, inside: 1, outside: 2 },
};
const HOW_LABEL: Record<string, string> = { "free-throw": "Free throws", two: "2 pointers", three: "3 pointers", inside: "Inside the arc", outside: "Outside the arc" };

type S = {
  rules: BasketballRules;
  names: Record<Side, string>;
  /** The period being played, 0-based; rules.periods and up are overtimes. In a break, the next one. */
  p: number;
  phase: "play" | "break";
  clock: PeriodClock;
  score: Record<Side, number>;
  /** Points per period index. */
  byPeriod: Record<Side, number>[];
  /** Team fouls that count for the bonus: this period's, or in overtime the 4th's and on. */
  fouls: Record<Side, number>;
  foulsTotal: Record<Side, number>;
  timeouts: Record<Side, number>;
  made: Record<Side, Record<string, number>>;
  /** Named players: points and fouls. */
  players: Map<string, { side: Side; name: string; points: number; fouls: number }>;
  /** Scores when this overtime began (3x3: first to 2 in overtime). */
  otFrom: Record<Side, number>;
  /** Regulation and overtimes are over and decided on the score. */
  final: boolean;
  ended: EndEvent | null;
  timeline: TimelineLine[];
  lastAction: string | null;
};

const periodMs = (r: BasketballRules, p: number) => (p < r.periods ? r.periodMinutes * MIN : OVERTIME_MS);

function start(board: Board): S {
  const rules = normalizeRules(board.setup.rules);
  return {
    rules,
    names: namesNow(board),
    p: 0,
    phase: "play",
    clock: newClock(true, periodMs(rules, 0), null),
    score: { a: 0, b: 0 },
    byPeriod: [{ a: 0, b: 0 }],
    fouls: { a: 0, b: 0 },
    foulsTotal: { a: 0, b: 0 },
    timeouts: { a: 0, b: 0 },
    made: { a: {}, b: {} },
    players: new Map(),
    otFrom: { a: 0, b: 0 },
    final: false,
    ended: null,
    timeline: [],
    lastAction: null,
  };
}

const inOvertime = (s: S) => s.p >= s.rules.periods;

/** "Q3", "1st half", "OT", "OT2", or "Game" for a one period game. */
function periodLabel(r: BasketballRules, p: number): string {
  if (p >= r.periods) return p === r.periods ? "OT" : `OT${p - r.periods + 1}`;
  if (r.periods === 4) return `Q${p + 1}`;
  if (r.periods === 2) return p === 0 ? "1st half" : "2nd half";
  return "Game";
}

/** The side that has won on target, or null. FIBA 3x3 Art. 6.4: overtime goes to the first side to score 2 in it. */
function targetWinner(s: S): Side | null {
  const { target, winBy, clock } = s.rules;
  if (target === null) return null;
  for (const x of SIDES) {
    const y = other(x);
    if (s.score[x] >= target && s.score[x] - s.score[y] >= winBy) return x;
    if (clock && inOvertime(s) && s.score[x] - s.otFrom[x] >= 2 && s.score[x] > s.score[y]) return x;
  }
  return null;
}

function result(s: S): BoardView["result"] {
  const { names, score } = s;
  const onScore = (): BoardView["result"] => {
    if (score.a === score.b) return { winner: null, kind: "draw", text: `Drawn ${score.a}-${score.b}` };
    const w: Side = score.a > score.b ? "a" : "b";
    return { winner: w, kind: "win", text: `${names[w]} won ${score[w]}-${score[other(w)]}${inOvertime(s) && s.phase === "play" ? " after overtime" : ""}` };
  };
  if (s.ended) return stoppedResult(s.ended, names) ?? onScore();
  if (s.final || targetWinner(s)) return onScore();
  return null;
}

function whenAt(s: S, at: number | undefined): string | null {
  const label = periodLabel(s.rules, s.p);
  const one = s.rules.periods === 1 && !inOvertime(s);
  if (!s.rules.clock || (s.clock.running && at === undefined)) return one ? null : label;
  const left = clockText(clockValue(s.clock, at), s.clock.down);
  return one ? left : `${label} ${left}`;
}

function why(s: S, e: BoardEvent): string | null {
  const res = result(s);
  if (e.type === "rename") return cleanName(e.name) ? null : "Type a name";
  if (res) return "The game is over";
  switch (e.type) {
    case "end":
      if (e.reason && e.reason !== "abandoned" && e.side !== "a" && e.side !== "b") return "Pick the team that stopped";
      return null;
    case "point": {
      const value = e.value ?? 1;
      const hows = HOWS[s.rules.scoring];
      if (e.how !== undefined) return hows[e.how] === value ? null : "That basket does not count that way";
      return Object.values(hows).includes(value) ? null : `A basket counts ${s.rules.scoring === "2s-3s" ? "1, 2 or 3" : "1 or 2"}`;
    }
    case "foul":
    case "timeout":
      return null;
    case "clock": {
      if (!s.rules.clock) return "The clock is off in settings";
      const max = periodMs(s.rules, s.p);
      if (e.ms !== undefined && (e.ms < 0 || e.ms > max)) return `Pick a time up to ${clockText(max)}`;
      if (e.ms === undefined && e.run === s.clock.running) return e.run ? "The clock is running" : "The clock is stopped";
      if (e.ms === undefined && e.run && s.clock.ms <= 0) return `No time left. End ${periodLabel(s.rules, s.p)} or set the time`;
      return null;
    }
    case "period":
      // With no clock nothing else starts a period, so a scoreless one can still be ended.
      return s.phase === "break" && s.rules.clock ? `Start ${periodLabel(s.rules, s.p)} first` : null;
    case "rules": {
      const next = normalizeRules({ ...s.rules, ...e.rules });
      if (!inOvertime(s) && next.periods < s.p + 1) return `${periodLabel(s.rules, s.p)} is on. Keep ${s.p + 1} or more`;
      if (inOvertime(s) && next.periods !== s.rules.periods) return "Overtime is on already";
      if (next.target !== null) {
        const hi = Math.max(s.score.a, s.score.b);
        if (hi >= next.target && Math.abs(s.score.a - s.score.b) >= next.winBy) return `Score is ${s.score.a}-${s.score.b} already; pick more than ${hi}`;
      }
      return null;
    }
    case "card":
      return "Cards are for football";
    case "serve":
      return "No serve in basketball";
    default:
      return "Unknown event";
  }
}

function step(s: S, e: BoardEvent, i: number): void {
  const line = (text: string, tone: TimelineLine["tone"], side: Side | null, when: string | null = null) =>
    s.timeline.push({ key: i, side, text, when, period: s.p, tone, score: `${s.score.a}-${s.score.b}` });
  // Anything played in a break starts the next period, clock or not.
  const begin = () => {
    s.phase = "play";
  };
  switch (e.type) {
    case "point": {
      begin();
      const value = e.value ?? 1;
      const when = whenAt(s, e.at);
      s.score[e.side] += value;
      s.byPeriod[s.p][e.side] += value;
      // Reaching the target ends the game (FIBA 3x3): the clock stops on that basket, as at any end.
      if (targetWinner(s)) stopClock(s.clock, e.at);
      const how = e.how ?? Object.keys(HOWS[s.rules.scoring]).find((k) => HOWS[s.rules.scoring][k] === value && k !== "free-throw") ?? "free-throw";
      s.made[e.side][how] = (s.made[e.side][how] ?? 0) + 1;
      if (e.player) {
        const pl = player(s, e.side, e.player);
        pl.points += value;
      }
      const what = how === "free-throw" ? "Free throw" : `+${value}`;
      line(`${what}, ${e.player ?? s.names[e.side]}`, "score", e.side, when);
      s.lastAction = `${what}, ${s.names[e.side]}`;
      return;
    }
    case "foul": {
      // A foul in a break (a technical) counts for the period about to start.
      s.fouls[e.side]++;
      s.foulsTotal[e.side]++;
      if (e.player) player(s, e.side, e.player).fouls++;
      line(`Foul, ${e.player ?? s.names[e.side]} (team foul ${s.fouls[e.side]})`, "card", e.side, whenAt(s, e.at));
      s.lastAction = `Foul, ${s.names[e.side]}`;
      return;
    }
    case "timeout":
      s.timeouts[e.side]++;
      line(`Timeout, ${s.names[e.side]}`, "info", e.side, whenAt(s, e.at));
      s.lastAction = `Timeout, ${s.names[e.side]}`;
      return;
    case "clock": {
      if (e.run) begin();
      runClock(s.clock, e);
      s.lastAction = e.ms !== undefined ? `Clock set to ${clockText(e.ms)}` : e.run ? "Clock started" : "Clock stopped";
      return;
    }
    case "period": {
      stopClock(s.clock, e.at);
      const label = periodLabel(s.rules, s.p);
      const last = s.p >= s.rules.periods - 1;
      if (last && s.score.a !== s.score.b) {
        s.final = true;
        line(`End of ${label}. ${result(s)?.text ?? ""}`.trim(), "end", null);
        s.lastAction = `End of ${label}`;
        return;
      }
      line(last ? `End of ${label}. Level, overtime next` : `End of ${label}`, "info", null);
      s.p++;
      s.phase = "break";
      s.byPeriod.push({ a: 0, b: 0 });
      s.clock = newClock(true, periodMs(s.rules, s.p), e.at ?? s.clock.at);
      // FIBA Art. 41.1.3: overtime fouls count as the last quarter's, so only regulation periods start from 0.
      if (!inOvertime(s)) s.fouls = { a: 0, b: 0 };
      else s.otFrom = { ...s.score };
      s.lastAction = `End of ${label}`;
      return;
    }
    case "end":
      stopClock(s.clock, e.at);
      s.ended = e;
      line(result(s)?.text ?? "Game ended", "end", null);
      s.lastAction = e.reason === "abandoned" ? "Game abandoned" : "Game ended";
      return;
    case "rules": {
      const was = s.rules;
      s.rules = normalizeRules({ ...s.rules, ...e.rules });
      // A new period length applies to the clock only before it has run this period.
      if (!s.clock.started && periodMs(was, s.p) !== periodMs(s.rules, s.p)) s.clock = newClock(true, periodMs(s.rules, s.p), s.clock.at);
      line("Rules changed", "info", null);
      s.lastAction = "Rules changed";
      return;
    }
    case "rename":
      s.lastAction = `Renamed to ${e.name}`;
      return;
  }
}

function player(s: S, side: Side, name: string) {
  const k = `${side}:${name.toLowerCase()}`;
  let pl = s.players.get(k);
  if (!pl) s.players.set(k, (pl = { side, name, points: 0, fouls: 0 }));
  return pl;
}

function fold(board: Board): S {
  const s = start(board);
  board.events.forEach((e, i) => {
    if (!why(s, e)) step(s, e, i);
    else if (i === board.events.length - 1) s.lastAction = null;
  });
  return s;
}

/* ------------------------------------------------------------------ */
/* View and pad                                                        */
/* ------------------------------------------------------------------ */

function derive(board: Board): BoardView {
  const s = fold(board);
  const v = blankView(board, "Basketball", "Points");
  const { names, score, rules } = s;
  const res = result(s);
  v.setup = { ...v.setup, rules };
  v.teams.a.score = score.a;
  v.teams.b.score = score.b;
  v.status = res ? "done" : "live";
  v.result = res;

  const label = periodLabel(rules, s.p);
  const breakLabel = s.p >= rules.periods ? "Overtime next" : rules.periods === 4 && s.p === 2 ? "Half time" : rules.periods === 2 ? "Half time" : `End of ${periodLabel(rules, s.p - 1)}`;
  const timed = rules.periods > 1 || inOvertime(s) || rules.clock;
  if (timed) {
    v.period = {
      index: s.p,
      of: rules.periods,
      label: res ? (s.ended?.reason === "abandoned" ? "Abandoned" : "Full time") : s.phase === "break" ? breakLabel : label,
      break: !res && s.phase === "break",
    };
  }
  if (rules.clock) v.clock = { running: s.clock.running, ms: s.clock.ms, at: s.clock.at, limitMs: periodMs(rules, s.p), down: true, baseMs: 0 };

  // Points by period, then how they came, fouls and timeouts.
  if (rules.periods > 1 || s.byPeriod.length > 1) s.byPeriod.forEach((x, p) => v.stats.push({ label: periodLabel(rules, p), a: String(x.a), b: String(x.b) }));
  for (const how of Object.keys(HOWS[rules.scoring])) v.stats.push({ label: HOW_LABEL[how], a: String(s.made.a[how] ?? 0), b: String(s.made.b[how] ?? 0) });
  v.stats.push({ label: "Fouls", a: String(s.foulsTotal.a), b: String(s.foulsTotal.b) });
  if (!res) v.stats.push({ label: `Team fouls, ${inOvertime(s) ? "overtime" : label}`, a: String(s.fouls.a), b: String(s.fouls.b) });
  v.stats.push({ label: "Timeouts", a: String(s.timeouts.a), b: String(s.timeouts.b) });

  const players = [...s.players.values()].sort((x, y) => y.points - x.points || x.name.localeCompare(y.name));
  for (const pl of players) v.players.push({ side: pl.side, name: pl.name, text: [pl.points ? plural(pl.points, "point") : "", pl.fouls ? plural(pl.fouls, "foul") : ""].filter(Boolean).join(", ") });

  if (!res) {
    // FIBA Art. 41.1.1: once a team has rules.foulLimit team fouls in a period, every further foul gives the other side free throws.
    for (const x of SIDES) if (s.fouls[x] >= rules.foulLimit) v.notices.push(`${names[other(x)]} in the bonus`);
    if (rules.target !== null && rules.clock && inOvertime(s)) v.notices.push("Overtime: first to score 2 wins");
  }

  const line = `${names.a} ${score.a}-${score.b} ${names.b}`;
  if (res) {
    const end = s.ended;
    v.headline =
      end?.reason === "walkover"
        ? res.text
        : end?.reason === "abandoned"
          ? `${line}, abandoned`
          : end?.reason && end.side
            ? `${line}, ${names[end.side]} ${end.reason}`
            : `${line}, ${inOvertime(s) && s.phase === "play" ? "after overtime" : "full time"}`;
  } else if (!board.events.length) v.headline = `${names.a} vs ${names.b}`;
  else v.headline = v.period && (rules.periods > 1 || inOvertime(s)) ? `${line}, ${s.phase === "break" ? breakLabel.charAt(0).toLowerCase() + breakLabel.slice(1) : label}` : line;

  v.timeline = s.timeline;
  v.lastAction = s.lastAction;
  return v;
}

function pad(board: Board): PadAction[] {
  const s = fold(board);
  if (result(s)) return [];
  const { rules } = s;
  const out: PadAction[] = [];
  for (const side of SIDES) {
    if (rules.scoring === "2s-3s") {
      out.push({ id: `two-${side}`, side, label: "+2", tone: "primary", event: { type: "point", side, value: 2, how: "two" }, ask: "player" });
      out.push({ id: `three-${side}`, side, label: "+3", tone: "plain", event: { type: "point", side, value: 3, how: "three" }, ask: "player" });
    } else {
      out.push({ id: `inside-${side}`, side, label: "+1", sub: "Inside", tone: "primary", event: { type: "point", side, value: 1, how: "inside" }, ask: "player" });
      out.push({ id: `outside-${side}`, side, label: "+2", sub: "Outside", tone: "plain", event: { type: "point", side, value: 2, how: "outside" }, ask: "player" });
    }
    out.push({ id: `ft-${side}`, side, label: "+1", sub: "Free throw", tone: "plain", event: { type: "point", side, value: 1, how: "free-throw" }, ask: "player" });
    out.push({ id: `foul-${side}`, side, label: "Foul", sub: plural(s.fouls[side], "team foul"), tone: "warn", event: { type: "foul", side }, ask: "player" });
    out.push({ id: `timeout-${side}`, side, label: "Timeout", tone: "plain", event: { type: "timeout", side } });
  }
  const label = periodLabel(rules, s.p);
  if (rules.clock) {
    const c = s.clock;
    if (c.running) out.push({ id: "clock", side: null, label: "Pause", tone: "plain", event: { type: "clock", run: false, at: 0 } });
    else
      out.push({
        id: "clock",
        side: null,
        label: s.phase === "break" || !c.started ? `Start ${label === "Game" ? "" : label}`.trim() : "Resume",
        tone: s.phase === "break" || !c.started ? "primary" : "plain",
        event: { type: "clock", run: true, at: 0 },
        ...(c.ms <= 0 ? { disabled: `No time left. End ${label}` } : {}),
      });
  }
  // Pickup to a score with no clock ends on the score; End game in More covers time up.
  const toScore = !rules.clock && rules.target !== null && !inOvertime(s);
  if ((s.phase === "play" || !rules.clock) && !toScore) out.push({ id: "period", side: null, label: `End ${label === "Game" ? "game" : label}`, tone: "plain", event: { type: "period" } });
  return out;
}

export const basketballEngine: SportEngine<BasketballRules> = {
  sport: "basketball",
  label: "Basketball",
  icon: "🏀",
  defaults: DEFAULTS,
  normalizeRules,
  presets: PRESETS,
  check: (board, event) => why(fold(board), event),
  derive,
  pad: (board) => pad(board),
};
