import { ASPECT_ORDER, aspectShort, playAgainWords, SCORE_WORDS, tagLabel } from "./catalog";
import type { Aspects } from "./types";

/**
 * A review as the "What players say" summary reads it (lib/ai/reviewSummary.ts):
 * a TapTurf report's taps become words, so a report with no tip still counts.
 * Private notes never come here. Pure.
 */

export type SummaryReview = {
  rating: number;
  comment: string | null;
  source: string | null;
  sport?: string | null;
  played_when?: string | null;
  aspects?: Aspects | null;
  play_again?: number | null;
};

const ratedParts = (a: Aspects | null | undefined) => (a && typeof a === "object" ? ASPECT_ORDER.filter((k) => a[k]) : []);

/** Worth summarising: a written review, or a TapTurf report with 2 or more rated parts. */
export function writtenEnough(r: SummaryReview): boolean {
  if (r.comment && r.comment.trim().length > 10) return true;
  return !r.source && ratedParts(r.aspects).length >= 2;
}

/** "- 4 stars (TapTurf, Box Cricket, evening): Pitch great (true bounce); Lights needs work (dim corners). Would play again. {tip}" */
export function summaryLine(r: SummaryReview): string {
  const google = r.source === "google";
  const where = google ? "Google" : ["TapTurf", r.sport, r.played_when].filter(Boolean).join(", ");
  const parts = google
    ? []
    : ratedParts(r.aspects).map((a) => {
        const v = r.aspects![a]!;
        const tags = (v.tags ?? []).map((t) => tagLabel(a, t).toLowerCase());
        return `${aspectShort(a, r.sport)} ${SCORE_WORDS[v.score].toLowerCase()}${tags.length ? ` (${tags.join(", ")})` : ""}`;
      });
  const again = google ? null : playAgainWords(r.play_again);
  const text = [parts.length ? `${parts.join("; ")}.` : null, again ? `${again}.` : null, r.comment?.trim().slice(0, 400) || null].filter(Boolean).join(" ");
  return `- ${r.rating} stars (${where}): ${text}`;
}
