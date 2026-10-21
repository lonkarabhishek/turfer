import type { Board, BoardEvent, BoardView, EndEvent, FootballRules, PadAction, PointEvent, RulePreset, Side, SportEngine, Tag, TimelineLine } from "./types";
import { blankView, bool, cleanName, clampInt, clockValue, isObj, namesNow, newClock, ordinal, other, plural, runClock, SIDES, stopClock, stoppedResult, tagOf, type PeriodClock } from "./common";

/**
 * Football and futsal on a turf: goals, halves on a count-up clock with
 * stoppage time past each half's length, optional cards and an optional
 * penalty shootout when it is level at full time.
 */

const MIN = 60_000;

/** The match clock as people read it and type it: minutes run on past the hour (75:00, never 1:15:00). */
function matchTime(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
/** "Set time" can go this far past a half's length: stoppage time on a turf is never longer. */
export const SET_TIME_GRACE_MS = 30 * MIN;

const DEFAULTS: FootballRules = { halves: 2, halfMinutes: 20, cards: false, penalties: false, shootoutKicks: 5 };

function normalizeRules(raw: unknown): FootballRules {
  const r = isObj(raw) ? raw : {};
  return {
    halves: clampInt(r.halves, 1, 2, DEFAULTS.halves),
    halfMinutes: clampInt(r.halfMinutes, 5, 60, DEFAULTS.halfMinutes),
    cards: bool(r.cards, DEFAULTS.cards),
    penalties: bool(r.penalties, DEFAULTS.penalties),
    shootoutKicks: clampInt(r.shootoutKicks, 1, 10, DEFAULTS.shootoutKicks),
  };
}

const PRESETS: RulePreset<FootballRules>[] = [
  {
    key: "length",
    label: "Match length",
    options: [
      { label: "2 x 20", rules: { halves: 2, halfMinutes: 20 } },
      { label: "2 x 25", rules: { halves: 2, halfMinutes: 25 } },
      { label: "2 x 30", rules: { halves: 2, halfMinutes: 30 } },
      { label: "2 x 45", rules: { halves: 2, halfMinutes: 45 } },
      { label: "1 x 40", rules: { halves: 1, halfMinutes: 40 } },
    ],
  },
  { key: "cards", label: "Cards", options: [{ label: "Off", rules: { cards: false } }, { label: "Yellow and red", rules: { cards: true } }] },
  {
    key: "penalties",
    label: "Level at full time",
    options: [
      { label: "Draw", rules: { penalties: false } },
      { label: "Penalties, 5 each", rules: { penalties: true, shootoutKicks: 5 } },
      { label: "Penalties, 3 each", rules: { penalties: true, shootoutKicks: 3 } },
    ],
  },
];

/**
 * The minute a goal or card goes in the report: 2 x 20 runs 1' to 20',
 * then 20+1' in stoppage time; the 2nd half runs 21' to 40', then 40+1'.
 * baseMin is the minutes of the halves before this one, each as long as
 * it was set when it ended; elapsed is ms into this half.
 */
export function footballMinute(baseMin: number, halfMinutes: number, elapsed: number): string {
  const len = halfMinutes * MIN;
  const e = Math.max(0, elapsed);
  if (e < len) return `${baseMin + Math.floor(e / MIN) + 1}'`;
  return `${baseMin + halfMinutes}+${Math.floor((e - len) / MIN) + 1}'`;
}

/* ------------------------------------------------------------------ */
/* The fold                                                            */
/* ------------------------------------------------------------------ */

const GOAL_HOWS = ["goal", "penalty", "own-goal"];
const isKick = (e: PointEvent) => e.how === "shootout-goal" || e.how === "shootout-miss";

type Kick = { side: Side; scored: boolean };
/** when: the minute, or null with no clock; tag: "pen", "og" or "". profile: the player's TapTurf tag, when one was picked. */
type Scorer = { side: Side; name: string; profile?: Tag; goals: { when: string | null; tag: string }[] };
type Booking = { side: Side; name: string; profile?: Tag; marks: string[]; yellows: number; off: boolean };

type S = {
  rules: FootballRules;
  names: Record<Side, string>;
  /** The half being played, or the last one at full time. */
  h: number;
  /** Minutes of the halves before this one, at the length each had: a change to 2 x 25 at half time leaves the 1st half at 20. */
  base: number;
  /** play: a half is on (or about to kick off). break: half time. full: the halves are over. */
  phase: "play" | "break" | "full";
  clock: PeriodClock;
  /** This half has kicked off (its clock first ran). */
  kicked: boolean;
  goals: Record<Side, number>;
  kicks: Kick[];
  yellow: Record<Side, number>;
  red: Record<Side, number>;
  scorers: Map<string, Scorer>;
  bookings: Map<string, Booking>;
  ended: EndEvent | null;
  timeline: TimelineLine[];
  lastAction: string | null;
};

function start(board: Board): S {
  return {
    rules: normalizeRules(board.setup.rules),
    names: namesNow(board),
    h: 0,
    base: 0,
    phase: "play",
    clock: newClock(false, 0, null),
    kicked: false,
    goals: { a: 0, b: 0 },
    kicks: [],
    yellow: { a: 0, b: 0 },
    red: { a: 0, b: 0 },
    scorers: new Map(),
    bookings: new Map(),
    ended: null,
    timeline: [],
    lastAction: null,
  };
}

/** One person per key: a tagged player by the tag (whatever the spelling typed), an untagged one by the name, any case. */
// \u0001 cannot be in a cleaned name, so a name typed as "@rahul_k" never shares a key with the tagged rahul_k.
const playerKey = (side: Side, name: string, tag?: Tag) => (tag ? `${side}\u0001${tag.u}` : `${side}:${name.toLowerCase()}`);
/** The event's player tag, read only next to a name. */
const tagIn = (e: { player?: string; tag?: unknown }) => (e.player ? tagOf(e.tag) : undefined);
const level = (s: S) => s.goals.a === s.goals.b;

/** The shootout so far. IFAB Law 10: kicks alternate, the side that kicks first keeps kicking first, and it stops once one side cannot catch up. */
function shootout(s: S) {
  const n = s.rules.shootoutKicks;
  const taken = { a: 0, b: 0 };
  const scored = { a: 0, b: 0 };
  for (const k of s.kicks) {
    taken[k.side]++;
    if (k.scored) scored[k.side]++;
  }
  // Each side's kicks still to come: the regulation ones, or the rest of this sudden death round.
  const rounds = Math.max(n, taken.a, taken.b);
  const left = { a: rounds - taken.a, b: rounds - taken.b };
  const winner: Side | null = scored.a > scored.b + left.b ? "a" : scored.b > scored.a + left.a ? "b" : null;
  const first = s.kicks[0]?.side ?? null;
  const next: Side | null = winner ? null : taken.a === taken.b ? first : taken.a < taken.b ? "a" : "b";
  return { taken, scored, winner, next, suddenDeath: taken.a >= n && taken.b >= n && !winner };
}

/** On penalties: the halves are over, level, with the shootout on. */
const shootoutOn = (s: S) => s.phase === "full" && level(s) && s.rules.penalties;

function result(s: S): BoardView["result"] {
  const { names, goals } = s;
  const hi = Math.max(goals.a, goals.b);
  const lo = Math.min(goals.a, goals.b);
  const onScore = (): BoardView["result"] => {
    if (!level(s)) {
      const w: Side = goals.a > goals.b ? "a" : "b";
      return { winner: w, kind: "win", text: `${names[w]} won ${hi}-${lo}` };
    }
    const so = shootout(s);
    // Stopped mid-shootout (time up): a win only on equal kicks or once one side cannot catch up (IFAB Law 10). Else a draw.
    const decided = so.winner ?? (so.taken.a === so.taken.b && so.scored.a !== so.scored.b ? (so.scored.a > so.scored.b ? "a" : "b") : null);
    if (decided) {
      const w: Side = decided;
      return { winner: w, kind: "win", text: `${names[w]} won ${Math.max(so.scored.a, so.scored.b)}-${Math.min(so.scored.a, so.scored.b)} on penalties` };
    }
    return { winner: null, kind: "draw", text: `Drawn ${hi}-${lo}` };
  };
  if (s.ended) return stoppedResult(s.ended, names) ?? onScore();
  if (s.phase !== "full") return null;
  if (!shootoutOn(s)) return onScore();
  return shootout(s).winner ? onScore() : null;
}

function halfLabel(s: S, h = s.h): string {
  return s.rules.halves === 1 ? "Game" : `${ordinal(h + 1)} half`;
}

/** The minute on the clock at `at`, or null when this half's clock never ran. */
function minuteAt(s: S, at: number | undefined): string | null {
  const c = s.clock;
  if (!c.started || (c.running && at === undefined)) return null;
  return footballMinute(s.base, s.rules.halfMinutes, clockValue(c, at));
}

/** Why this event cannot go in now, or null. */
function why(s: S, e: BoardEvent): string | null {
  const res = result(s);
  if (e.type === "rename") return cleanName(e.name) ? null : "Type a name";
  if (e.type === "rules") {
    const next = normalizeRules({ ...s.rules, ...e.rules });
    // A draw at full time can still go to penalties: that is the one change a finished match takes, and nothing else with it.
    if (res) {
      if (!(res.kind === "draw" && !s.ended && next.penalties)) return "The match is over";
      const others = (Object.keys(next) as (keyof FootballRules)[]).some((k) => k !== "penalties" && k !== "shootoutKicks" && next[k] !== s.rules[k]);
      if (others) return "The match is over. Only penalties can be turned on now";
    }
    if (next.halves < s.h + 1) return `The ${ordinal(s.h + 1)} half is on. Keep ${s.h + 1} halves`;
    if (s.phase === "full" && next.halves !== s.rules.halves) return "The halves are played already";
    if (s.kicks.length && (next.penalties !== s.rules.penalties || next.shootoutKicks !== s.rules.shootoutKicks)) return "Penalties have started";
    return null;
  }
  if (res) return "The match is over";
  switch (e.type) {
    case "end":
      if (e.reason && e.reason !== "abandoned" && e.side !== "a" && e.side !== "b") return "Pick the team that stopped";
      return null;
    case "point": {
      if (isKick(e)) {
        if (s.phase !== "full") return "Penalties come after full time";
        if (!s.rules.penalties) return "Penalties are off in settings";
        const next = shootout(s).next;
        return next && next !== e.side ? `${s.names[next]} take the next kick` : null;
      }
      if (e.how !== undefined && !GOAL_HOWS.includes(e.how)) return "That is not a football goal";
      if (e.value !== undefined && e.value !== 1) return "A goal counts one";
      return s.phase === "full" ? "Full time. Score the penalties" : null;
    }
    case "card": {
      if (!s.rules.cards) return "Cards are off in settings";
      const b = e.player ? s.bookings.get(playerKey(e.side, e.player, tagIn(e))) : undefined;
      return b?.off ? `${b.name} is sent off already` : null;
    }
    case "clock": {
      if (s.phase === "full") return "The halves are over";
      const max = s.rules.halfMinutes * MIN + SET_TIME_GRACE_MS;
      // On the match clock the scorer types: 70:00 in the 2nd half of 2 x 20, not 50:00.
      if (e.ms !== undefined && (e.ms < 0 || e.ms > max)) return `Pick a time up to ${matchTime(s.base * MIN + max)}`;
      if (e.ms === undefined && e.run === s.clock.running) return e.run ? "The clock is running" : "The clock is stopped";
      return null;
    }
    case "period":
      if (s.phase === "break") return `Half time now. Start the ${ordinal(s.h + 1)} half first`;
      return s.phase === "full" ? "Full time already" : null;
    case "foul":
      return "Team fouls are for basketball";
    case "timeout":
      return "No timeouts in football";
    case "serve":
      return "No serve in football";
    default:
      return "Unknown event";
  }
}

/** Apply an event why() passed. */
function step(s: S, e: BoardEvent, i: number): void {
  const line = (text: string, tone: TimelineLine["tone"], side: Side | null, when: string | null = null, period = s.h, score = `${s.goals.a}-${s.goals.b}`) =>
    s.timeline.push({ key: i, side, text, when, period, tone, score });
  switch (e.type) {
    case "point": {
      const who = e.player ? `, ${e.player}` : "";
      if (isKick(e)) {
        const scored = e.how === "shootout-goal";
        s.kicks.push({ side: e.side, scored });
        const so = shootout(s);
        line(`Penalty ${scored ? "scored" : "missed"}${who}`, scored ? "score" : "info", e.side, null, s.rules.halves, `${so.scored.a}-${so.scored.b}`);
        s.lastAction = `Penalty ${scored ? "scored" : "missed"}, ${s.names[e.side]}`;
        return;
      }
      // A goal at half time means the next half is on: the scorer just never started its clock.
      if (s.phase === "break") s.phase = "play";
      s.goals[e.side]++;
      const when = minuteAt(s, e.at);
      const how = e.how === "penalty" || e.how === "own-goal" ? e.how : "goal";
      const text = how === "own-goal" ? `Own goal by ${e.player ?? s.names[other(e.side)]}` : `${how === "penalty" ? "Penalty goal" : "Goal"}! ${e.player ?? s.names[e.side]}`;
      line(text, "score", e.side, when);
      if (e.player) {
        // Own goals are listed with the team they count for, as match reports do.
        const profile = tagIn(e);
        const k = playerKey(e.side, e.player, profile);
        const sc = s.scorers.get(k) ?? { side: e.side, name: e.player, ...(profile ? { profile } : {}), goals: [] };
        sc.goals.push({ when, tag: how === "penalty" ? "pen" : how === "own-goal" ? "og" : "" });
        s.scorers.set(k, sc);
      }
      s.lastAction = how === "own-goal" ? `Own goal, for ${s.names[e.side]}` : `${how === "penalty" ? "Penalty goal" : "Goal"}, ${s.names[e.side]}`;
      return;
    }
    case "card": {
      const when = minuteAt(s, e.at);
      const name = e.player ?? s.names[e.side];
      const profile = tagIn(e);
      const b = e.player ? (s.bookings.get(playerKey(e.side, e.player, profile)) ?? { side: e.side, name: e.player, ...(profile ? { profile } : {}), marks: [], yellows: 0, off: false }) : null;
      // IFAB Law 12: a second caution in the match is a sending off.
      const second = e.color === "yellow" && !!b && b.yellows === 1;
      if (e.color === "yellow") s.yellow[e.side]++;
      if (e.color === "red" || second) s.red[e.side]++;
      const text = second ? `Second yellow, ${name}. Sent off` : `${e.color === "red" ? "Red" : "Yellow"} card, ${name}`;
      line(text, "card", e.side, when);
      if (b) {
        if (e.color === "yellow") b.yellows++;
        if (e.color === "red" || second) b.off = true;
        b.marks.push(`${second ? "second yellow" : e.color === "red" ? "red card" : "yellow card"}${when ? ` ${when}` : ""}`);
        s.bookings.set(playerKey(b.side, b.name, b.profile), b);
      }
      s.lastAction = `${second ? "Second yellow" : e.color === "red" ? "Red card" : "Yellow card"}, ${s.names[e.side]}`;
      return;
    }
    case "clock": {
      const kickOff = e.run && !s.kicked;
      if (e.run) {
        s.phase = "play";
        s.kicked = true;
      }
      runClock(s.clock, e);
      if (kickOff) line(s.h === 0 ? "Kick off" : `${ordinal(s.h + 1)} half kicks off`, "info", null);
      s.lastAction = e.ms !== undefined ? `Clock set to ${matchTime(s.base * MIN + e.ms)}` : kickOff ? (s.h === 0 ? "Kick off" : `${ordinal(s.h + 1)} half kicks off`) : e.run ? "Clock started" : "Clock stopped";
      return;
    }
    case "period": {
      stopClock(s.clock, e.at);
      if (s.h < s.rules.halves - 1) {
        line("Half time", "info", null);
        s.base += s.rules.halfMinutes;
        s.h++;
        s.phase = "break";
        s.kicked = false;
        s.clock = newClock(false, 0, e.at ?? s.clock.at);
        s.lastAction = "Half time";
      } else {
        s.phase = "full";
        line(shootoutOn(s) ? "Full time. Penalties next" : "Full time", shootoutOn(s) ? "info" : "end", null);
        s.lastAction = "Full time";
      }
      return;
    }
    case "end": {
      stopClock(s.clock, e.at);
      s.ended = e;
      line(result(s)?.text ?? "Match ended", "end", null);
      s.lastAction = e.reason === "abandoned" ? "Match abandoned" : "Match ended";
      return;
    }
    case "rules":
      s.rules = normalizeRules({ ...s.rules, ...e.rules });
      line("Rules changed", "info", null);
      s.lastAction = "Rules changed";
      return;
    case "rename":
      s.lastAction = `Renamed to ${e.name}`;
      return;
  }
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
  const v = blankView(board, "Football", "Goals");
  const { names, goals, rules } = s;
  const res = result(s);
  const so = shootout(s);
  const len = rules.halfMinutes * MIN;
  v.setup = { ...v.setup, rules };
  v.teams.a.score = goals.a;
  v.teams.b.score = goals.b;
  v.status = res ? "done" : "live";
  v.result = res;
  const waitingKicks = !res && shootoutOn(s) && !s.kicks.length;
  const label = res
    ? s.ended?.reason === "abandoned"
      ? "Abandoned"
      : "Full time"
    : s.phase === "break"
      ? "Half time"
      : s.phase === "full"
        ? s.kicks.length
          ? "Penalties"
          : "Full time"
        : halfLabel(s);
  v.period = { index: s.phase === "full" ? rules.halves : s.h, of: rules.halves, label, break: s.phase === "break" || waitingKicks };
  v.clock = { running: s.clock.running, ms: s.clock.ms, at: s.clock.at, limitMs: len, down: false, baseMs: s.base * MIN };
  if (shootoutOn(s) || s.kicks.length) {
    v.current = { a: String(so.scored.a), b: String(so.scored.b) };
    v.currentLabel = "Penalties";
  }

  v.stats.push({ label: "Goals", a: String(goals.a), b: String(goals.b) });
  if (rules.cards || s.yellow.a + s.yellow.b + s.red.a + s.red.b) {
    v.stats.push({ label: "Yellow cards", a: String(s.yellow.a), b: String(s.yellow.b) });
    v.stats.push({ label: "Red cards", a: String(s.red.a), b: String(s.red.b) });
  }
  if (s.kicks.length) v.stats.push({ label: "Penalties", a: `${so.scored.a} (${so.taken.a})`, b: `${so.scored.b} (${so.taken.b})` });

  // "34', 52' (pen)" when every minute is known, else "2 goals (34', pen)".
  for (const sc of s.scorers.values()) {
    const known = sc.goals.every((g) => g.when);
    const marks = sc.goals.map((g) => (g.when ? `${g.when}${g.tag ? ` (${g.tag})` : ""}` : g.tag)).filter(Boolean);
    v.players.push({ side: sc.side, name: sc.name, text: known ? marks.join(", ") : `${plural(sc.goals.length, "goal")}${marks.length ? ` (${marks.join(", ")})` : ""}`, ...(sc.profile ? { tag: { ...sc.profile } } : {}) });
  }
  for (const b of s.bookings.values()) {
    const text = b.marks.join(", ");
    v.players.push({ side: b.side, name: b.name, text: text.charAt(0).toUpperCase() + text.slice(1), ...(b.profile ? { tag: { ...b.profile } } : {}) });
  }

  if (!res && shootoutOn(s)) {
    if (!s.kicks.length) v.notices.push("Level at full time. Penalties");
    else if (so.suddenDeath) v.notices.push("Sudden death");
    if (so.next) v.notices.push(`${names[so.next]} to kick`);
  }

  const line = `${names.a} ${goals.a}-${goals.b} ${names.b}`;
  if (res) {
    const end = s.ended;
    v.headline =
      end?.reason === "walkover"
        ? res.text
        : end?.reason === "abandoned"
          ? `${line}, abandoned`
          : end?.reason && end.side
            ? `${line}, ${names[end.side]} ${end.reason}`
            : res.winner && level(s)
              ? `${line}, ${res.text}`
              : `${line}, full time`;
  } else if (!board.events.length) v.headline = `${names.a} vs ${names.b}`;
  else if (s.phase === "full") v.headline = s.kicks.length ? `${line}, penalties ${so.scored.a}-${so.scored.b}` : `${line}, full time`;
  else if (s.phase === "break") v.headline = `${line}, half time`;
  else v.headline = rules.halves > 1 ? `${line}, ${halfLabel(s)}` : line;

  v.timeline = s.timeline;
  v.lastAction = s.lastAction;
  return v;
}

function pad(board: Board): PadAction[] {
  const s = fold(board);
  if (result(s)) return [];
  const { names, rules } = s;
  const out: PadAction[] = [];
  const cards = (side: Side) => {
    if (!rules.cards) return;
    out.push({ id: `yellow-${side}`, side, label: "Yellow", sub: "Card", tone: "warn", event: { type: "card", side, color: "yellow" }, ask: "player" });
    out.push({ id: `red-${side}`, side, label: "Red", sub: "Card", tone: "danger", event: { type: "card", side, color: "red" }, ask: "player" });
  };
  if (s.phase === "full") {
    const next = shootout(s).next;
    for (const side of SIDES) {
      const disabled = next && next !== side ? { disabled: `${names[next]} take the next kick` } : {};
      out.push({ id: `kick-in-${side}`, side, label: "Scored", sub: "Penalty kick", tone: "primary", event: { type: "point", side, how: "shootout-goal" }, ask: "player", ...disabled });
      out.push({ id: `kick-out-${side}`, side, label: "Missed", sub: "Penalty kick", tone: "plain", event: { type: "point", side, how: "shootout-miss" }, ask: "player", ...disabled });
      cards(side);
    }
    return out;
  }
  for (const side of SIDES) {
    // A column always means "goal to this team", own goals too (put in by the other team).
    out.push({ id: `goal-${side}`, side, label: "Goal", tone: "primary", event: { type: "point", side, how: "goal" }, ask: "player" });
    out.push({ id: `pen-${side}`, side, label: "Goal", sub: "Penalty", tone: "plain", event: { type: "point", side, how: "penalty" }, ask: "player" });
    out.push({ id: `og-${side}`, side, label: "Own goal", sub: `by ${names[other(side)]}`, tone: "plain", event: { type: "point", side, how: "own-goal" }, ask: "player" });
    cards(side);
  }
  const c = s.clock;
  const startLabel = s.h === 0 ? "Kick off" : `Start ${ordinal(s.h + 1)} half`;
  if (s.phase === "break" || !s.kicked) out.push({ id: "clock", side: null, label: startLabel, tone: "primary", event: { type: "clock", run: true, at: 0 } });
  else out.push({ id: "clock", side: null, label: c.running ? "Pause" : "Resume", tone: "plain", event: { type: "clock", run: !c.running, at: 0 } });
  if (s.phase === "play") out.push({ id: "period", side: null, label: s.h < rules.halves - 1 ? "End half" : "Full time", tone: "plain", event: { type: "period" } });
  return out;
}

export const footballEngine: SportEngine<FootballRules> = {
  sport: "football",
  label: "Football",
  icon: "⚽",
  defaults: DEFAULTS,
  normalizeRules,
  presets: PRESETS,
  check: (board, event) => why(fold(board), event),
  derive,
  pad: (board) => pad(board),
};
