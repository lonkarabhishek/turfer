/**
 * Sign-ups over time for the admin chart: buckets of 3 months, a month,
 * a week (Monday to Sunday), a day or 6 hours, in India time (IST, UTC+5:30,
 * no daylight saving). A window is a stretch of time shown at one level;
 * zooming into a bar opens that bar's stretch at the next level down.
 * Pure: times come in as epoch milliseconds, "now" is passed in.
 * Relative imports only, so the unit test compiles it on its own
 * (npm run test:trend).
 */

export const LEVELS = ["quarter", "month", "week", "day", "6h"] as const;
export type Level = (typeof LEVELS)[number];

/** What the zoom buttons say. */
export const LEVEL_NAMES: Record<Level, string> = {
  quarter: "3 months",
  month: "Monthly",
  week: "Weekly",
  day: "Daily",
  "6h": "6 hours",
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** IST is UTC+5:30 all year. */
const IST = 5.5 * HOUR;

/** The IST wall clock of t, read with the getUTC* methods. */
const wall = (t: number) => new Date(t + IST);
/** The instant of an IST wall-clock time. Date.UTC carries overflow (month 13, day 0). */
const fromWall = (y: number, m: number, d = 1, h = 0) => Date.UTC(y, m, d, h) - IST;

/** Start of the bucket at this level that holds t. */
export function floorTo(level: Level, t: number): number {
  const d = wall(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  switch (level) {
    case "6h":
      return fromWall(y, m, day, d.getUTCHours() - (d.getUTCHours() % 6));
    case "day":
      return fromWall(y, m, day);
    case "week":
      // Weeks start on Monday.
      return fromWall(y, m, day - ((d.getUTCDay() + 6) % 7));
    case "month":
      return fromWall(y, m, 1);
    case "quarter":
      return fromWall(y, m - (m % 3), 1);
  }
}

/** The bucket start n buckets after the one starting at t (n may be negative). */
export function addBuckets(level: Level, t: number, n: number): number {
  const start = floorTo(level, t);
  const d = wall(start);
  switch (level) {
    case "6h":
      return start + n * 6 * HOUR;
    case "day":
      return start + n * DAY;
    case "week":
      return start + n * 7 * DAY;
    case "month":
      return fromWall(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
    case "quarter":
      return fromWall(d.getUTCFullYear(), d.getUTCMonth() + 3 * n, 1);
  }
}

export const finer = (level: Level): Level | null => LEVELS[LEVELS.indexOf(level) + 1] ?? null;

/**
 * A stretch of time shown at one level, [start, end). span says how far
 * the arrows move it: n units of a level (a zoomed-in bar moves one of its
 * own kind at a time, a default view by its whole length). label names it
 * in the breadcrumb.
 */
export type TrendWindow = {
  level: Level;
  start: number;
  end: number;
  span: { level: Level; n: number } | null;
  label: string;
};

export type Bucket = {
  start: number;
  end: number;
  count: number;
  /** The bucket is still going on (it holds now). */
  current: boolean;
  /** Short, for the axis. */
  axis: string;
  /** Full, for the tooltip and the table. */
  long: string;
};

/* ------------------------------------------------------------------ */
/* Labels (India time, Indian English)                                 */
/* ------------------------------------------------------------------ */

// Own names, not Intl: the server and every browser must print the same text (hydration), and
// en-IN data differs between engines ("Sep" or "Sept", a comma after the weekday or not).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthShort = (t: number) => MONTHS[wall(t).getUTCMonth()];
const year = (t: number) => wall(t).getUTCFullYear();
const dayMonth = (t: number) => `${wall(t).getUTCDate()} ${monthShort(t)}`;
const dayMonthYear = (t: number) => `${dayMonth(t)} ${year(t)}`;
const weekday = (t: number) => WEEKDAYS[wall(t).getUTCDay()];
const hhmm = (t: number) => {
  const d = wall(t);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const quarterName = (t: number) => `Q${Math.floor(wall(t).getUTCMonth() / 3) + 1} ${wall(t).getUTCFullYear()}`;

/** A bucket's labels; a clipped one says the part shown, so a week cut by a month end reads "1 to 6 Sep 2026". */
function labels(level: Level, start: number, end: number): { axis: string; long: string } {
  const last = end - 1;
  switch (level) {
    case "quarter": {
      return { axis: quarterName(start), long: `${quarterName(start)} (${monthShort(start)} to ${monthShort(last)} ${year(last)})` };
    }
    case "month":
      return { axis: `${monthShort(start)} ${String(year(start)).slice(2)}`, long: `${MONTHS_LONG[wall(start).getUTCMonth()]} ${year(start)}` };
    case "week": {
      // A week cut down to one day by a month edge, like Monday 31 Aug.
      if (last - start < DAY) return { axis: dayMonth(start), long: dayMonthYear(start) };
      const sameMonth = wall(start).getUTCMonth() === wall(last).getUTCMonth();
      // "12 to 18 Oct 2026", "28 Sep to 4 Oct 2026": a cut week reads the same way, as the days it holds.
      const range = sameMonth ? `${wall(start).getUTCDate()} to ${dayMonthYear(last)}` : `${dayMonth(start)} to ${dayMonthYear(last)}`;
      return { axis: dayMonth(start), long: range };
    }
    case "day":
      return { axis: dayMonth(start), long: `${weekday(start)}, ${dayMonthYear(start)}` };
    case "6h": {
      const midnight = wall(start).getUTCHours() === 0;
      return {
        axis: midnight ? `${weekday(start)} ${wall(start).getUTCDate()}` : hhmm(start),
        long: `${weekday(start)} ${dayMonth(start)}, ${hhmm(start)} to ${hhmm(end) === "00:00" ? "24:00" : hhmm(end)}`,
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Counting                                                            */
/* ------------------------------------------------------------------ */

/** How many times fall in [start, end). times must be sorted ascending. */
export function countBetween(times: readonly number[], start: number, end: number): number {
  return lowerBound(times, end) - lowerBound(times, start);
}

function lowerBound(a: readonly number[], x: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The window's buckets, each clipped to the window (so they add up to the
 * window's total) and never past the bucket that holds now. Like totals,
 * they count only up to now, so a row read after "now" never shows in a
 * bar but not in the headline.
 */
export function bucketsOf(times: readonly number[], w: TrendWindow, now: number): Bucket[] {
  const stop = Math.min(w.end, addBuckets(w.level, now, 1));
  const out: Bucket[] = [];
  for (let s = floorTo(w.level, w.start); s < stop; s = addBuckets(w.level, s, 1)) {
    const full = { start: s, end: addBuckets(w.level, s, 1) };
    const start = Math.max(full.start, w.start);
    const end = Math.min(full.end, w.end);
    if (end <= start) continue;
    out.push({ start, end, count: countBetween(times, start, Math.min(end, now + 1)), current: start <= now && now < end, ...labels(w.level, start, end) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Windows                                                             */
/* ------------------------------------------------------------------ */

/** How much each level shows when picked from the zoom buttons. */
const DEFAULT_SPAN: Record<Exclude<Level, "quarter">, { level: Level; n: number; name: string }> = {
  month: { level: "month", n: 12, name: "Last 12 months" },
  week: { level: "week", n: 12, name: "Last 12 weeks" },
  day: { level: "day", n: 30, name: "Last 30 days" },
  "6h": { level: "day", n: 7, name: "Last 7 days" },
};

/**
 * The view for a zoom button: every quarter since the first sign-up, or a
 * recent stretch ending with the bucket that holds now.
 */
export function defaultWindow(level: Level, now: number, first: number | null): TrendWindow {
  if (level === "quarter") {
    const end = addBuckets("quarter", now, 1);
    const start = floorTo("quarter", Math.min(first ?? now, now));
    return { level, start, end, span: null, label: "All time" };
  }
  const span = DEFAULT_SPAN[level];
  const end = addBuckets(span.level, now, 1);
  return { level, start: addBuckets(span.level, end, -span.n), end, span: { level: span.level, n: span.n }, label: span.name };
}

const UNIT_NAMES: Record<Level, [string, string]> = {
  quarter: ["quarter", "quarters"],
  month: ["month", "months"],
  week: ["week", "weeks"],
  day: ["day", "days"],
  "6h": ["6 hours", "6 hour stretches"],
};

/** "Oct 2025 to Sep 2026", "23 Sep to 22 Oct 2026": a stretch of several buckets. */
function rangeLabel(level: Level, start: number, end: number): string {
  const last = end - 1;
  switch (level) {
    case "quarter":
      return `${quarterName(start)} to ${quarterName(last)}`;
    case "month":
      return `${monthShort(start)} ${year(start)} to ${monthShort(last)} ${year(last)}`;
    default:
      return `${dayMonth(start)} to ${dayMonthYear(last)}`;
  }
}

/** Zoom into a bar: its stretch of time at the next level down. Null at 6 hours. */
export function zoomInto(w: TrendWindow, b: Bucket): TrendWindow | null {
  const level = finer(w.level);
  if (!level) return null;
  return { level, start: b.start, end: b.end, span: { level: w.level, n: 1 }, label: b.long };
}

/**
 * The bar next to a zoomed-in one: it starts where this one ends (or ends
 * where this one starts) and is cut at the edges of the bar one level up,
 * like the week bars of a month view. So from "28 to 30 Sep", Later is
 * "1 to 4 Oct", and no day is skipped or shown twice.
 */
function neighbour(level: Level, w: TrendWindow, dir: -1 | 1): { start: number; end: number } {
  const parent: Level | undefined = LEVELS[LEVELS.indexOf(level) - 1];
  if (dir === 1) {
    const start = w.end;
    const end = addBuckets(level, start, 1);
    return { start, end: parent ? Math.min(end, addBuckets(parent, start, 1)) : end };
  }
  const end = w.start;
  const start = floorTo(level, end - 1);
  return { start: parent ? Math.max(start, floorTo(parent, end - 1)) : start, end };
}

/**
 * The same view moved back (dir -1) or forward (+1) by its span. Null when
 * it cannot move at all. A zoomed-in bar moves to the bar next to it.
 */
export function panned(w: TrendWindow, dir: -1 | 1, now: number): TrendWindow | null {
  if (!w.span) return null;
  const { level, n } = w.span;
  const { start, end } = n === 1 ? neighbour(level, w, dir) : { start: addBuckets(level, w.start, dir * n), end: addBuckets(level, w.end, dir * n) };
  let label: string;
  if (n === 1) label = labels(level, start, end).long;
  else {
    // Back at the latest stretch: the zoom button's name again.
    const latest = defaultWindow(w.level, now, null);
    label = latest.start === start && latest.end === end ? latest.label : rangeLabel(level, start, end);
  }
  return { ...w, start, end, label };
}

/** Whether the arrows can move this way: never into the future, never back past the first sign-up. */
export function canPan(w: TrendWindow, dir: -1 | 1, now: number, first: number | null): boolean {
  if (!w.span) return false;
  if (dir === 1) return w.end <= now;
  return first !== null && w.start > first;
}

/** How long one bar is at the levels where that never changes. */
const FIXED: Partial<Record<Level, number>> = { week: 7 * DAY, day: DAY, "6h": 6 * HOUR };

/** Sign-ups in the window, and in the same length of time just before it (null when there is none to compare). */
export function totals(times: readonly number[], w: TrendWindow, now: number): { total: number; previous: number | null; previousName: string | null } {
  const stop = Math.min(w.end, now + 1);
  const total = countBetween(times, w.start, stop);
  if (!w.span) return { total, previous: null, previousName: null };
  // A zoomed-in week, day or 6 hours: the same days and hours one bar earlier, so a week cut by a
  // month edge ("28 to 30 Sep") is set against the same weekdays ("21 to 23 Sep"), and today so far
  // against yesterday up to this hour.
  const length = w.span.n === 1 ? FIXED[w.span.level] : undefined;
  if (length) {
    return { total, previous: countBetween(times, w.start - length, stop - length), previousName: labels(w.span.level, w.start - length, w.end - length).long };
  }
  const back = panned(w, -1, now);
  if (!back) return { total, previous: null, previousName: null };
  // A finished stretch is compared with the whole one before it; one still going on, with the same
  // time into the one before (today so far against yesterday up to this hour).
  const previous = w.end <= now ? countBetween(times, back.start, back.end) : countBetween(times, back.start, Math.min(back.end, back.start + (now + 1 - w.start)));
  const { level, n } = w.span;
  const name = n === 1 ? back.label : `the ${n} ${UNIT_NAMES[level][1]} before`;
  return { total, previous, previousName: name };
}

/**
 * The breadcrumb for a window: all time, then each bar zoomed into down to
 * it. Rebuilt after moving left or right, so the crumbs always hold the
 * stretch on screen. A default view (the last 30 days...) stands alone.
 */
export function trail(w: TrendWindow, now: number, first: number | null): TrendWindow[] {
  if (!w.span || w.span.n !== 1) return [w];
  // Rooted early enough to hold w, even when w was moved to before the first sign-up's quarter.
  const out: TrendWindow[] = [defaultWindow("quarter", now, first === null ? w.start : Math.min(first, w.start))];
  while (out[out.length - 1].level !== w.level) {
    const top = out[out.length - 1];
    const bar = bucketsOf([], top, now).find((b) => b.start <= w.start && w.start < b.end);
    const next = bar && zoomInto(top, bar);
    if (!next) return [w];
    out.push(next);
  }
  out[out.length - 1] = w;
  return out;
}
