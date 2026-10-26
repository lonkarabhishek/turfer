import { ASPECT_ORDER, aspectShort, type AspectId } from "./catalog";
import { BAR_MIN } from "./insights";
import { rupees } from "./sheet";

/**
 * The one line on the thank-you screen that says what the report just
 * changed, the first that applies. Recognition only, never a reward. Pure:
 * it reads the save's answer (review_save after).
 */

export type UnlockInput = {
  turfName: string;
  /** A new report (not an edit or a repost). */
  created: boolean;
  /** Live TapTurf reports at the turf, this one included. */
  tapturfN: number;
  /** Per part this report rated: how many live reports in 12 months rated it, this one included. */
  aspectCounts: Partial<Record<AspectId, number>>;
  sport?: string | null;
  turfSports?: readonly string[];
  /** The price was saved, and the From players range with it. */
  price?: { min: number; max: number } | null;
};

export function unlockLine(u: UnlockInput): string {
  const part = (a: AspectId) => aspectShort(a, u.sport ?? null, u.turfSports ?? []);
  if (u.created && u.tapturfN === 1) return `You're the first player to rate ${u.turfName} on TapTurf.`;
  const rated = ASPECT_ORDER.filter((a) => typeof u.aspectCounts[a] === "number");
  const live = rated.find((a) => u.aspectCounts[a] === BAR_MIN);
  if (live) return `Your report put the ${part(live)} bar live on ${u.turfName}'s page.`;
  if (u.price) {
    const { min, max } = u.price;
    return min === max ? `Your rate is in. Players paid ${rupees(min)} here.` : `Your rate is in. Players paid ${rupees(min)} to ${rupees(max)} here.`;
  }
  const close = rated
    .filter((a) => (u.aspectCounts[a] ?? 0) < BAR_MIN)
    .sort((a, b) => (u.aspectCounts[b] ?? 0) - (u.aspectCounts[a] ?? 0))[0];
  if (close) {
    const left = BAR_MIN - (u.aspectCounts[close] ?? 0);
    return `${left} more ${part(close)} rating${left === 1 ? "" : "s"} and its bar goes live.`;
  }
  return `${u.tapturfN} player${u.tapturfN === 1 ? " has" : "s have"} now rated ${u.turfName} on TapTurf.`;
}
