import type { Board, BoardEvent, BoardView, EndEvent, OtherRules, PadAction, RulePreset, Side, SportEngine, TimelineLine } from "./types";
import { blankView, cleanName, clampInt, isObj, namesNow, ordinal, other, SIDES, stoppedResult } from "./common";

/**
 * Any other sport: points for each side from the rules' buttons,
 * optionally first to a target, optionally in periods. No clock.
 */

const DEFAULTS: OtherRules = { name: "", target: null, periods: null, values: [1] };

function normalizeRules(raw: unknown): OtherRules {
  const r = isObj(raw) ? raw : {};
  // Whole points 1 to 99, no repeats, at most 4 buttons a side.
  const values = Array.isArray(r.values) ? [...new Set(r.values.filter((x): x is number => Number.isInteger(x) && x >= 1 && x <= 99))].slice(0, 4) : [];
  return {
    name: cleanName(r.name, 32),
    target: r.target === null || r.target === undefined ? null : clampInt(r.target, 1, 999, 21),
    periods: r.periods === null || r.periods === undefined ? null : clampInt(r.periods, 1, 10, 2),
    values: values.length ? values : [1],
  };
}

const PRESETS: RulePreset<OtherRules>[] = [
  {
    key: "format",
    label: "Format",
    options: [
      { label: "Points", rules: { target: null, periods: null } },
      { label: "First to 21", rules: { target: 21, periods: null } },
      { label: "Halves", rules: { target: null, periods: 2 } },
    ],
  },
  { key: "values", label: "Buttons", options: [{ label: "+1", rules: { values: [1] } }, { label: "+1 +2 +3", rules: { values: [1, 2, 3] } }] },
];

type S = {
  rules: OtherRules;
  names: Record<Side, string>;
  /** The period being played, 0-based; in a break, the next one. */
  p: number;
  phase: "play" | "break";
  final: boolean;
  score: Record<Side, number>;
  byPeriod: Record<Side, number>[];
  ended: EndEvent | null;
  timeline: TimelineLine[];
  lastAction: string | null;
};

function periodLabel(r: OtherRules, p: number): string {
  return r.periods === 2 ? `${ordinal(p + 1)} half` : `Period ${p + 1}`;
}

/** First to the target wins outright, with no win by 2. */
function targetWinner(s: S): Side | null {
  const t = s.rules.target;
  return t === null ? null : (SIDES.find((x) => s.score[x] >= t) ?? null);
}

function result(s: S): BoardView["result"] {
  const { names, score } = s;
  const onScore = (): BoardView["result"] => {
    if (score.a === score.b) return { winner: null, kind: "draw", text: `Drawn ${score.a}-${score.b}` };
    const w: Side = score.a > score.b ? "a" : "b";
    return { winner: w, kind: "win", text: `${names[w]} won ${score[w]}-${score[other(w)]}` };
  };
  if (s.ended) return stoppedResult(s.ended, names) ?? onScore();
  return s.final || targetWinner(s) ? onScore() : null;
}

function why(s: S, e: BoardEvent): string | null {
  if (e.type === "rename") return cleanName(e.name) ? null : "Type a name";
  if (result(s)) return "The game is over";
  switch (e.type) {
    case "end":
      if (e.reason && e.reason !== "abandoned" && e.side !== "a" && e.side !== "b") return "Pick the side that stopped";
      return null;
    case "point":
      return s.rules.values.includes(e.value ?? 1) ? null : `Points go up by ${s.rules.values.join(", ")}`;
    case "period":
      if (s.rules.periods === null) return "This game has no periods";
      return null;
    case "rules": {
      const next = normalizeRules({ ...s.rules, ...e.rules });
      const hi = Math.max(s.score.a, s.score.b);
      if (next.target !== null && hi >= next.target) return `Score is ${s.score.a}-${s.score.b} already; pick more than ${hi}`;
      if (next.periods !== null && next.periods < s.p + 1) return `${periodLabel(s.rules, s.p)} is on. Keep ${s.p + 1} or more`;
      if (next.periods === null && s.phase === "break") return "Start the next period first";
      return null;
    }
    case "card":
    case "foul":
    case "timeout":
    case "clock":
    case "serve":
      return "Not used for this sport";
    default:
      return "Unknown event";
  }
}

function step(s: S, e: BoardEvent, i: number): void {
  const line = (text: string, tone: TimelineLine["tone"], side: Side | null) =>
    s.timeline.push({ key: i, side, text, when: s.rules.periods === null ? null : periodLabel(s.rules, s.p), period: s.p, tone, score: `${s.score.a}-${s.score.b}` });
  switch (e.type) {
    case "point": {
      s.phase = "play";
      const value = e.value ?? 1;
      s.score[e.side] += value;
      s.byPeriod[s.p][e.side] += value;
      line(`+${value}, ${e.player ?? s.names[e.side]}`, "score", e.side);
      s.lastAction = `+${value}, ${s.names[e.side]}`;
      return;
    }
    case "period": {
      const label = periodLabel(s.rules, s.p);
      if (s.p >= (s.rules.periods ?? 1) - 1) {
        s.final = true;
        line(`End of ${label}. ${result(s)?.text ?? ""}`.trim(), "end", null);
      } else {
        line(`End of ${label}`, "info", null);
        s.p++;
        s.phase = "break";
        s.byPeriod.push({ a: 0, b: 0 });
      }
      s.lastAction = `End of ${label}`;
      return;
    }
    case "end":
      s.ended = e;
      line(result(s)?.text ?? "Game ended", "end", null);
      s.lastAction = e.reason === "abandoned" ? "Game abandoned" : "Game ended";
      return;
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
  const rules = normalizeRules(board.setup.rules);
  const s: S = { rules, names: namesNow(board), p: 0, phase: "play", final: false, score: { a: 0, b: 0 }, byPeriod: [{ a: 0, b: 0 }], ended: null, timeline: [], lastAction: null };
  board.events.forEach((e, i) => {
    if (!why(s, e)) step(s, e, i);
    else if (i === board.events.length - 1) s.lastAction = null;
  });
  return s;
}

function derive(board: Board): BoardView {
  const s = fold(board);
  const { rules, names, score } = s;
  const v = blankView(board, rules.name || "Game", "Points");
  const res = result(s);
  v.setup = { ...v.setup, rules };
  v.teams.a.score = score.a;
  v.teams.b.score = score.b;
  v.status = res ? "done" : "live";
  v.result = res;
  if (rules.periods !== null) {
    const breakLabel = rules.periods === 2 ? "Half time" : `End of period ${s.p}`;
    v.period = {
      index: s.p,
      of: rules.periods,
      label: res ? (s.ended?.reason === "abandoned" ? "Abandoned" : "Full time") : s.phase === "break" ? breakLabel : periodLabel(rules, s.p),
      break: !res && s.phase === "break",
    };
  }
  v.stats.push({ label: "Points", a: String(score.a), b: String(score.b) });
  if (s.byPeriod.length > 1) s.byPeriod.forEach((x, p) => v.stats.push({ label: periodLabel(rules, p), a: String(x.a), b: String(x.b) }));
  if (!res && rules.target !== null) for (const x of SIDES) if (rules.target - score[x] <= Math.max(...rules.values) && score[x] < rules.target) v.notices.push(`${names[x]} need ${rules.target - score[x]} to win`);

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
            : res.winner
              ? `${names[res.winner]} beat ${names[other(res.winner)]} ${score[res.winner]}-${score[other(res.winner)]}`
              : `${line}, drawn`;
  } else if (!board.events.length) v.headline = `${names.a} vs ${names.b}`;
  else v.headline = v.period ? `${line}, ${v.period.label.charAt(0).toLowerCase()}${v.period.label.slice(1)}` : line;
  v.timeline = s.timeline;
  v.lastAction = s.lastAction;
  return v;
}

function pad(board: Board): PadAction[] {
  const s = fold(board);
  if (result(s)) return [];
  const out: PadAction[] = [];
  for (const side of SIDES)
    s.rules.values.forEach((value, k) => out.push({ id: `p${value}-${side}`, side, label: `+${value}`, ...(k === 0 && s.rules.values.length === 1 ? { sub: "Point" } : {}), tone: k === 0 ? "primary" : "plain", event: { type: "point", side, value } }));
  if (s.rules.periods !== null) out.push({ id: "period", side: null, label: s.p >= s.rules.periods - 1 ? "End game" : `End ${periodLabel(s.rules, s.p).toLowerCase()}`, tone: "plain", event: { type: "period" } });
  return out;
}

export const otherEngine: SportEngine<OtherRules> = {
  sport: "other",
  label: "Other sport",
  icon: "🏅",
  defaults: DEFAULTS,
  normalizeRules,
  presets: PRESETS,
  check: (board, event) => why(fold(board), event),
  derive,
  pad: (board) => pad(board),
};
