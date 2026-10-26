import { ASPECT_ORDER, aspectShort, tagLabel, type AspectId } from "./catalog";
import type { AspectCount, PlayAgainCounts } from "./types";

/**
 * What the turf page says about its TapTurf reports: the "How it plays"
 * bars, their words and chips, the would-play-again share. Pure: the
 * counts come from turf_page (plain counts, never weighted, so anyone can
 * check a number by reading the reports).
 */

/** A part gets its bar once this many reports rated it (in the last 12 months). */
export const BAR_MIN = 3;
/** The play-again share shows once this many players answered. */
export const PLAY_AGAIN_MIN = 3;

export type BarTone = "great" | "needs" | "okay";
export type BarChip = { tag: string; label: string; sign: 1 | -1; n: number };
export type Bar = {
  aspect: AspectId;
  label: string;
  n: number;
  great: number;
  okay: number;
  needs_work: number;
  words: string;
  tone: BarTone;
  chips: BarChip[];
};

/**
 * The words by a bar, by rule: Great when at least half say great, Needs
 * work when at least 40% say so, otherwise mostly okay.
 */
export function barWords(c: Pick<AspectCount, "n" | "great" | "needs_work">): { words: string; tone: BarTone } {
  if (c.n > 0 && c.great * 2 >= c.n) return { words: `${c.great} of ${c.n} say great`, tone: "great" };
  if (c.n > 0 && c.needs_work * 5 >= c.n * 2) return { words: `${c.needs_work} of ${c.n} say needs work`, tone: "needs" };
  return { words: `Mostly okay (${c.n})`, tone: "okay" };
}

/**
 * Up to `max` reason chips, most named first. The most named Needs work
 * chip is always among them when there is one, so a bar never shows only
 * praise.
 */
export function pickChips(aspect: AspectId, tags: AspectCount["tags"], max = 3): BarChip[] {
  const all = [...(tags ?? [])]
    .filter((t) => t.n > 0 && (t.sign === 1 || t.sign === -1))
    .sort((a, b) => b.n - a.n)
    .map((t) => ({ tag: t.tag, label: tagLabel(aspect, t.tag), sign: t.sign, n: t.n }));
  const top = all.slice(0, max);
  const worst = all.find((t) => t.sign === -1);
  if (worst && !top.includes(worst)) {
    top[Math.min(top.length, max) - 1] = worst;
  }
  return top.sort((a, b) => b.n - a.n);
}

export type Scorecard = {
  bars: Bar[];
  /** Parts rated 1 or 2 times: "Lights and Washroom need a few more ratings." */
  waiting: AspectId[];
};

/** The bars for the parts rated at least BAR_MIN times, in catalogue order, and the parts still waiting. */
export function scorecard(counts: readonly AspectCount[], turfSports: readonly string[] = []): Scorecard {
  const by = new Map(counts.map((c) => [c.aspect, c]));
  const bars: Bar[] = [];
  const waiting: AspectId[] = [];
  for (const a of ASPECT_ORDER) {
    const c = by.get(a);
    if (!c || c.n <= 0) continue;
    if (c.n < BAR_MIN) {
      waiting.push(a);
      continue;
    }
    bars.push({
      aspect: a,
      label: aspectShort(a, null, turfSports),
      n: c.n,
      great: c.great,
      okay: c.okay,
      needs_work: c.needs_work,
      ...barWords(c),
      chips: pickChips(a, c.tags),
    });
  }
  return { bars, waiting };
}

/** "Lights", "Lights and Washroom", "Lights, Staff and Washroom". */
export function listWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function waitingLine(waiting: AspectId[], turfSports: readonly string[] = []): string | null {
  if (!waiting.length) return null;
  const names = listWords(waiting.map((a) => aspectShort(a, null, turfSports)));
  return `${names} ${waiting.length === 1 ? "needs" : "need"} a few more ratings.`;
}

/** Before any part has its bar. */
export const emptyScorecardLine = (reports: number) => `The scorecard goes live at ${BAR_MIN} player reports. ${reports} so far.`;

/**
 * "9 of 10 would play again", in tens: once PLAY_AGAIN_MIN players answered,
 * the share of yes as a number out of 10 (out of the real count when fewer
 * than 10 answered).
 */
export function playAgainLine(counts: PlayAgainCounts | null | undefined): string | null {
  if (!counts) return null;
  const [no, maybe, yes] = counts;
  const total = no + maybe + yes;
  if (total < PLAY_AGAIN_MIN) return null;
  if (total <= 10) return `${yes} of ${total} would play again`;
  return `${Math.round((yes / total) * 10)} of 10 would play again`;
}
