import { dayNumber, istDay, shortDay } from "./history";

/**
 * "You played here on 12 Oct": the words for the signed-in player's badge
 * on turf cards and the line on a turf page. On its own, so the lists that
 * show it load nothing else of the passport. Pure. Relative imports only
 * (npm run test:profile).
 */

/** "You played here today", "yesterday", or "on 12 Oct" (with the year when it was another year). */
export function playedHereText(day: string, now: number): string {
  const diff = dayNumber(istDay(now)) - dayNumber(day);
  if (diff === 0) return "You played here today";
  if (diff === 1) return "You played here yesterday";
  return `You played here on ${shortDay(day, now)}`;
}

/** The badge's short form: "Played here · 12 Oct". */
export function playedHereShort(day: string, now: number): string {
  const diff = dayNumber(istDay(now)) - dayNumber(day);
  return `Played here · ${diff === 0 ? "today" : diff === 1 ? "yesterday" : shortDay(day, now)}`;
}
