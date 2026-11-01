import { dayNumber, istDay, weekDays, weekOf, type PlayedGame } from "./history";

/**
 * The weekly play streak: India weeks (Monday to Sunday) in a row with at
 * least one played game. A streak stays alive through the week after its
 * last game, so "play this week to keep it" is true until Sunday night.
 * Pure. Relative imports only (npm run test:profile).
 */

export type Streak = {
  /** Weeks in a row, up to this week (or last week, when this week has no game yet). 0: no streak. */
  current: number;
  /** The longest run ever. */
  best: number;
  /** A game played this week. */
  thisWeek: boolean;
  /** The last 12 weeks, oldest first, this week last: whether each had a game. */
  weeks: boolean[];
  /** India's Monday and Sunday of this week. */
  monday: string;
  sunday: string;
};

export const STREAK_WEEKS_SHOWN = 12;

export function streakOf(played: readonly PlayedGame[], now: number): Streak {
  const weeks = new Set(played.map((g) => weekOf(g.day)).filter((w) => !Number.isNaN(w)));
  const thisWeek = weekOf(istDay(now));
  let best = 0;
  for (const w of weeks) {
    if (weeks.has(w - 1)) continue;
    let n = 1;
    while (weeks.has(w + n)) n++;
    best = Math.max(best, n);
  }
  const from = weeks.has(thisWeek) ? thisWeek : weeks.has(thisWeek - 1) ? thisWeek - 1 : null;
  let current = 0;
  if (from !== null) while (weeks.has(from - current)) current++;
  const { monday, sunday } = weekDays(thisWeek);
  return {
    current,
    best,
    thisWeek: weeks.has(thisWeek),
    weeks: Array.from({ length: STREAK_WEEKS_SHOWN }, (_, i) => weeks.has(thisWeek - STREAK_WEEKS_SHOWN + 1 + i)),
    monday,
    sunday,
  };
}

/**
 * The day a run first reached `goal` weeks in a row (its first game in
 * that week), or null. For the streak medals.
 */
export function streakReachedOn(played: readonly PlayedGame[], goal: number): string | null {
  const firstByWeek = new Map<number, string>();
  for (const g of played) {
    const w = weekOf(g.day);
    if (Number.isNaN(w)) continue;
    const had = firstByWeek.get(w);
    if (!had || dayNumber(g.day) < dayNumber(had)) firstByWeek.set(w, g.day);
  }
  const sorted = [...firstByWeek.keys()].sort((a, b) => a - b);
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    if (run >= goal) return firstByWeek.get(sorted[i]) ?? null;
  }
  return null;
}

/** The nudge: a short title and what to do, from played games only. Null for someone who never played. */
export type StreakNudge = { title: string; detail: string; tone: "hot" | "calm" };

export function streakNudge(s: Streak, played: number): StreakNudge | null {
  if (played === 0) return null;
  if (s.current >= 2 && s.thisWeek) return { title: `${s.current}-week streak`, detail: "You played this week. Play next week to keep it going.", tone: "calm" };
  if (s.current >= 2) return { title: `${s.current}-week streak`, detail: "Play this week to keep it.", tone: "hot" };
  if (s.current === 1 && s.thisWeek) return { title: "You played this week", detail: "Play next week too to start a streak.", tone: "calm" };
  if (s.current === 1) return { title: "You played last week", detail: "Play this week to make it a 2-week streak.", tone: "hot" };
  if (s.best >= 2) return { title: `Best streak: ${s.best} weeks`, detail: "Play this week to start a new one.", tone: "calm" };
  return { title: "No streak yet", detail: "Play this week and next to start one.", tone: "calm" };
}

/** "Sunday 2 Nov": the last day to keep a streak, for the nudge's small print. */
export function sundayWords(s: Pick<Streak, "sunday">): string {
  const n = dayNumber(s.sunday);
  if (Number.isNaN(n)) return "";
  return new Date(n * 86_400_000).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}

