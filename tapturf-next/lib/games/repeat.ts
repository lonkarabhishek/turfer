import { formatTimeRange } from "../utils/game";

/**
 * Repeat games: how a host's game repeats, as they pick it in the create
 * flow (weekly on chosen weekdays every 1 to 4 weeks, or monthly on the
 * same date or the nth weekday; ending never, on a date or after N
 * games), the dates that makes, and how it reads ("Every Tue and Thu,
 * 7 – 8 PM, until 20 Dec"). The same maths as the database's
 * (20261102_game_series.sql private.game_series_matches, game_series_days
 * and game_series_problem); both are checked against repeat.cases.json.
 * This one is for the preview: the database makes the games. Dates are
 * India wall-clock days, YYYY-MM-DD; weekdays are 0 (Sunday) to 6, as
 * Date.getUTCDay and Postgres's dow. Pure; relative imports only (npm run
 * test:games).
 */

export type WeeklyRule = { freq: "weekly"; interval: number; days: number[] };
export type MonthlyRule = { freq: "monthly"; by: "date"; day: number } | { freq: "monthly"; by: "weekday"; nth: number; weekday: number };
export type RepeatRule = WeeklyRule | MonthlyRule;
export type RepeatEnds = { type: "never" } | { type: "on"; date: string } | { type: "after"; count: number };
export type Repeat = { rule: RepeatRule; ends: RepeatEnds };

/** Every 1 to this many weeks. */
export const MAX_EVERY = 4;
/** "After N games": 2 to this many. */
export const MAX_GAMES = 52;
/** A series runs at most this many days from its first ("never" included). */
export const SERIES_DAYS = 365;
/** Games go up this many days ahead (today counts), at most AHEAD_GAMES not yet played, and always the next one. */
export const AHEAD_DAYS = 28;
export const AHEAD_GAMES = 8;
/** Series running at once, per host. */
export const MAX_RUNNING = 3;

const DAY_MS = 86_400_000;
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NTH = ["", "first", "second", "third", "fourth"];
/** Monday first, as weeks run here. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "YYYY-MM-DD" as a day count since 1970-01-01, or NaN. */
function dayNum(d: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const back = new Date(t);
  return back.getUTCMonth() === +m[2] - 1 && back.getUTCDate() === +m[3] ? t / DAY_MS : NaN;
}
const dayStr = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const plusDays = (d: string, n: number) => dayStr(dayNum(d) + n);

/** The weekday of a day, 0 (Sunday) to 6. */
export const weekdayOf = (d: string) => new Date(dayNum(d) * DAY_MS).getUTCDay();
const dateOf = (d: string) => new Date(dayNum(d) * DAY_MS).getUTCDate();
function monthDays(d: string): number {
  const t = new Date(dayNum(d) * DAY_MS);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Is `day` on the rule? `start`: the series' first day (the weeks of a weekly rule count from its Monday). */
export function matches(rule: RepeatRule, start: string, day: string): boolean {
  if (rule.freq === "weekly") {
    const monday = dayNum(start) - ((weekdayOf(start) + 6) % 7);
    return rule.days.includes(weekdayOf(day)) && Math.floor((dayNum(day) - monday) / 7) % rule.interval === 0;
  }
  if (rule.by === "date") return dateOf(day) === Math.min(rule.day, monthDays(day));
  if (weekdayOf(day) !== rule.weekday) return false;
  return rule.nth === -1 ? dateOf(day) + 7 > monthDays(day) : Math.floor((dateOf(day) + 6) / 7) === rule.nth;
}

/** The series' last possible day: its end date, else a year from the first. */
export const lastDay = (start: string, ends: RepeatEnds) => (ends.type === "on" ? ends.date : plusDays(start, SERIES_DAYS));

/** Every day of the series in order, from `start`, as many as it ends with. */
export function seriesDays(repeat: Repeat, start: string): string[] {
  const out: string[] = [];
  const count = repeat.ends.type === "after" ? repeat.ends.count : Infinity;
  const last = dayNum(lastDay(start, repeat.ends));
  for (let n = dayNum(start); n <= last && out.length < count; n++) {
    const d = dayStr(n);
    if (matches(repeat.rule, start, d)) out.push(d);
  }
  return out;
}

/** India's wall clock now, as "YYYY-MM-DDTHH:MM", to compare with a day and a start time. */
function istNow(now: number): string {
  return new Date(now + 330 * 60_000).toISOString().slice(0, 16);
}

/** The series' next `n` days whose start is still ahead (the preview's "next few dates"). */
export function nextDays(repeat: Repeat, start: string, startTime: string, n: number, now = Date.now()): string[] {
  const at = istNow(now);
  return seriesDays(repeat, start)
    .filter((d) => `${d}T${startTime.slice(0, 5)}` > at)
    .slice(0, n);
}

/**
 * The monthly rules a first day allows, as a calendar offers them: the
 * same date, then its nth weekday ("the second Saturday"), and "the last"
 * when it is in the month's last 7 days (a 29th to 31st is only "last").
 */
export function monthlyChoices(start: string): MonthlyRule[] {
  const dom = dateOf(start);
  const weekday = weekdayOf(start);
  const nth = Math.floor((dom + 6) / 7);
  const out: MonthlyRule[] = [{ freq: "monthly", by: "date", day: dom }];
  if (nth <= 4) out.push({ freq: "monthly", by: "weekday", nth, weekday });
  if (dom + 7 > monthDays(start)) out.push({ freq: "monthly", by: "weekday", nth: -1, weekday });
  return out;
}

/** A rule for a new first day: weekly keeps its days but follows a lone one to the new weekday; monthly keeps its kind. */
export function ruleFor(rule: RepeatRule, start: string, oldStart?: string): RepeatRule {
  if (rule.freq === "weekly") {
    const lone = rule.days.length === 1 && oldStart && rule.days[0] === weekdayOf(oldStart);
    return lone || rule.days.length === 0 ? { ...rule, days: [weekdayOf(start)] } : rule;
  }
  const choices = monthlyChoices(start);
  if (rule.by === "date") return choices[0];
  return choices.find((c) => c.by === "weekday" && c.nth === rule.nth) ?? choices.find((c) => c.by === "weekday") ?? choices[0];
}

/** Weekly on the first day's weekday, every week; or monthly on its date. */
export function startRule(freq: RepeatRule["freq"], start: string): RepeatRule {
  return freq === "weekly" ? { freq: "weekly", interval: 1, days: [weekdayOf(start)] } : monthlyChoices(start)[0];
}

/** The most games "after N" can be for this rule from `start` (all of its year, at most MAX_GAMES). */
export function maxGames(rule: RepeatRule, start: string): number {
  return Math.min(MAX_GAMES, seriesDays({ rule, ends: { type: "never" } }, start).length);
}

const isInt = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const only = (o: object, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/**
 * What the browser sent ({ rule, ends }) for a series from `start`: the
 * first field that is not allowed or not well formed ("repeat", "rule",
 * "interval", "days", "month", "ends"), or null when it is fine. As the
 * database's private.game_series_problem: a monthly rule must fall on
 * `start`; a series is at least 2 games; "after" is at most the games its
 * year holds.
 */
export function repeatProblem(x: unknown, start: string): string | null {
  if (!isObj(x) || !only(x, ["rule", "ends"]) || Number.isNaN(dayNum(start))) return "repeat";
  const { rule, ends } = x;
  if (!isObj(rule)) return "rule";
  if (rule.freq === "weekly") {
    if (!only(rule, ["freq", "interval", "days"])) return "rule";
    if (!isInt(rule.interval, 1, MAX_EVERY)) return "interval";
    const days = rule.days;
    if (!Array.isArray(days) || days.length < 1 || days.length > 7 || !days.every((d) => isInt(d, 0, 6)) || new Set(days).size !== days.length) return "days";
  } else if (rule.freq === "monthly") {
    if (rule.by === "date") {
      if (!only(rule, ["freq", "by", "day"])) return "rule";
      if (rule.day !== dateOf(start)) return "month";
    } else if (rule.by === "weekday") {
      if (!only(rule, ["freq", "by", "nth", "weekday"])) return "rule";
      if (rule.weekday !== weekdayOf(start) || ![1, 2, 3, 4, -1].includes(rule.nth as number) || !matches(rule as RepeatRule, start, start)) return "month";
    } else return "rule";
  } else return "rule";
  if (!isObj(ends)) return "ends";
  let last: string;
  if (ends.type === "never") {
    if (!only(ends, ["type"])) return "ends";
    last = plusDays(start, SERIES_DAYS);
  } else if (ends.type === "on") {
    if (!only(ends, ["type", "date"]) || typeof ends.date !== "string" || Number.isNaN(dayNum(ends.date))) return "ends";
    if (ends.date < start || ends.date > plusDays(start, SERIES_DAYS)) return "ends";
    last = ends.date;
  } else if (ends.type === "after") {
    if (!only(ends, ["type", "count"]) || !isInt(ends.count, 2, MAX_GAMES)) return "ends";
    last = plusDays(start, SERIES_DAYS);
  } else return "ends";
  const n = seriesDays({ rule: rule as RepeatRule, ends: { type: "on", date: last } }, start).length;
  if (n < 2 || (ends.type === "after" && (ends.count as number) > n)) return "ends";
  return null;
}

/** A repeat as it is sent: a weekly rule's days in order, each once. */
export function normalRepeat(r: Repeat): Repeat {
  const rule = r.rule.freq === "weekly" ? { ...r.rule, days: [...new Set(r.rule.days)].sort((a, b) => a - b) } : r.rule;
  return { rule, ends: r.ends };
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/** "Tue", "Tue and Thu", "Mon, Wed and Fri". */
function andList(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** 1st, 2nd, 3rd, 4th, 11th, 21st, 31st. */
export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

/** The weekdays of a weekly rule, Monday first: "Tue and Thu". */
export function weekdaysLabel(days: number[]): string {
  const set = new Set(days);
  return andList(WEEK_ORDER.filter((d) => set.has(d)).map((d) => SHORT[d]));
}

/**
 * How a rule reads: "Every Tue and Thu", "Every 2 weeks on Sat", "Every
 * day", "Every weekday", "Monthly on the 14th", "Monthly on the 31st (or
 * the month's last day)", "Monthly on the first Sunday", "Monthly on the
 * last Saturday".
 */
export function repeatLabel(rule: RepeatRule): string {
  if (rule.freq === "weekly") {
    const set = new Set(rule.days);
    const weekdays = set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d));
    const what = set.size === 7 ? "day" : weekdays ? "weekday" : null;
    if (rule.interval === 1) return what ? `Every ${what}` : `Every ${weekdaysLabel(rule.days)}`;
    return what === "day" ? `Every ${rule.interval} weeks, every day` : `Every ${rule.interval} weeks on ${what === "weekday" ? "weekdays" : weekdaysLabel(rule.days)}`;
  }
  if (rule.by === "date") return `Monthly on the ${ordinal(rule.day)}${rule.day > 28 ? " (or the month's last day)" : ""}`;
  return `Monthly on the ${rule.nth === -1 ? "last" : NTH[rule.nth]} ${LONG[rule.weekday]}`;
}

/** "20 Dec", with the year when it is not the first day's. */
function shortDate(d: string, start: string): string {
  const t = new Date(dayNum(d) * DAY_MS);
  const year = d.slice(0, 4) !== start.slice(0, 4) ? ` ${t.getUTCFullYear()}` : "";
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}${year}`;
}

/** How a series ends: "until 20 Dec", "8 games", or null for never. */
export function endsLabel(ends: RepeatEnds, start: string): string | null {
  if (ends.type === "on") return `until ${shortDate(ends.date, start)}`;
  if (ends.type === "after") return `${ends.count} games`;
  return null;
}

/** The summary's parts, for a page that keeps the time on one line: ["Every Tue and Thu", "7 – 8 PM", "until 20 Dec"]. */
export function repeatParts(repeat: Repeat, start: string, startTime: string | null, endTime: string | null): string[] {
  const time = startTime ? formatTimeRange(startTime, endTime) : "";
  return [repeatLabel(repeat.rule), time, endsLabel(repeat.ends, start) ?? ""].filter(Boolean);
}

/** The whole repeat in a line: "Every Tue and Thu, 7 – 8 PM, until 20 Dec". */
export function repeatSummary(repeat: Repeat, start: string, startTime: string | null, endTime: string | null): string {
  return repeatParts(repeat, start, startTime, endTime).join(", ");
}
