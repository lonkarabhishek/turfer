import { z } from "zod";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { ROUTER_MODEL, structured } from "./ask";

/**
 * "What players say": two sentences and a few likes and gripes, made
 * from the written reviews we hold for a venue (Google and TapTurf).
 * Only venues with at least two written reviews get one, it is stored
 * on the row, and it is remade when a newer review arrives.
 */

export const ReviewSummary = z.object({
  /** Two sentences, at most 45 words, in TapTurf's voice. */
  summary: z.string(),
  /** Up to three things reviewers praise, 2 to 5 words each. */
  likes: z.array(z.string()),
  /** Up to two things reviewers complain about, 2 to 5 words each. Empty when none. */
  gripes: z.array(z.string()),
});
export type ReviewSummary = z.infer<typeof ReviewSummary>;
export type StoredReviewSummary = ReviewSummary & { based_on: number; sources: string[] };

type ReviewRow = { rating: number; comment: string | null; source: string | null; created_at: string };

const SYSTEM = `You summarise written reviews of one sports venue for TapTurf, an Indian turf directory. Reply only with the JSON object.

Rules:
- summary: two short sentences, at most 45 words, reporting what reviewers say, with attribution ("Reviewers praise...", "A few mention..."). Only what the reviews contain. No ratings, no numbers, no venue name, no marketing words, no advice, no emoji. Indian English.
- likes: up to three things praised, 2 to 5 words each, lower case ("well kept grass", "good lights"). gripes: up to two complaints, same style, empty when there are none.
- When the reviews disagree, say so plainly. When they are thin, keep the summary to one sentence.
- Never mention prices unless more than one review gives the same figure, and then say reviewers reported it.`;

export async function loadReviewsFor(turfId: string): Promise<ReviewRow[]> {
  const supabase = createReadOnlyClient();
  const { data } = await supabase
    .from("reviews")
    .select("rating, comment, source, created_at")
    .eq("turf_id", turfId)
    .not("comment", "is", null)
    .order("created_at", { ascending: false })
    .limit(40);
  return ((data ?? []) as ReviewRow[]).filter((r) => r.comment && r.comment.trim().length > 10);
}

export async function summariseReviews(reviews: ReviewRow[]): Promise<StoredReviewSummary | null> {
  const use = reviews.slice(0, 30);
  if (use.length < 2) return null;
  const lines = use.map((r) => `- ${r.rating} stars (${r.source === "google" ? "Google" : "TapTurf"}): ${r.comment!.trim().slice(0, 400)}`).join("\n");
  const out = await structured(
    ReviewSummary,
    {
      model: ROUTER_MODEL,
      max_tokens: 400,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `${use.length} reviews:\n${lines}` }],
    },
    "review-summary",
  );
  if (!out) return null;
  const sources = [...new Set(use.map((r) => (r.source === "google" ? "Google" : "TapTurf")))];
  return { ...out, likes: out.likes.slice(0, 3), gripes: out.gripes.slice(0, 2), based_on: use.length, sources };
}
