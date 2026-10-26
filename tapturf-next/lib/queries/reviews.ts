import { createClient } from "@/lib/supabase/client";
import type { Review, ReviewWithUser, ReviewSummary } from "@/types/review";

// Reads only. Writes (a report, an edit, removing it, Helpful) go through
// /api/reviews (lib/reviews/client.ts): the server verifies who is calling.

// Small helper: keep a single browser client instance (createClient is
// already a singleton) but skip re-creating one on every call.
const supa = () => createClient();

/**
 * All reviews for a turf, newest first, with the reviewer's public
 * display fields joined in-memory (no PostgREST join needed).
 * Returns [] on error so pages don't crash — a missing review list
 * is never a hard failure.
 *
 * When `viewerId` is passed, each row also carries whether that user
 * has upvoted it — powers the filled/hollow upvote button state.
 */
export async function getReviewsForTurf(
  turfId: string,
  limit = 20,
  viewerId?: string | null,
): Promise<ReviewWithUser[]> {
  try {
    const s = supa();
    const { data: reviews } = await s
      .from("reviews")
      .select(
        "id, user_id, turf_id, booking_id, rating, comment, created_at, updated_at, source, author_name, author_url, source_url, source_date_label",
      )
      .eq("turf_id", turfId)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Players' own reviews first, then the imported Google ones.
    const rows = [...((reviews || []) as Review[])].sort((a, b) => Number(!!a.source) - Number(!!b.source));
    if (rows.length === 0) return [];

    const reviewIds = rows.map((r) => r.id);
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));

    // Fetch reviewers + vote rows in parallel. We only need the vote
    // columns we consume; skip payload we don't render.
    const [{ data: users }, { data: votes }] = await Promise.all([
      s
        .from("users")
        .select("id, name, profile_image_url")
        .in("id", userIds),
      s
        .from("review_votes")
        .select("review_id, user_id")
        .in("review_id", reviewIds),
    ]);

    const byId = new Map<string, { name: string | null; profile_image_url: string | null }>();
    (users || []).forEach((u) =>
      byId.set(u.id, {
        name: u.name ?? null,
        profile_image_url: u.profile_image_url ?? null,
      }),
    );

    // Group vote rows by review_id → count. Also mark whether the
    // viewer has voted, if we know who they are.
    const voteCounts = new Map<string, number>();
    const viewerVoted = new Set<string>();
    (votes || []).forEach((v) => {
      voteCounts.set(v.review_id, (voteCounts.get(v.review_id) || 0) + 1);
      if (viewerId && v.user_id === viewerId) viewerVoted.add(v.review_id);
    });

    return rows.map((r) => ({
      ...r,
      // Imported rows hang off a placeholder user ("Google reviewer");
      // the real name is author_name.
      user_name: r.source ? r.author_name ?? null : byId.get(r.user_id)?.name ?? null,
      user_avatar: r.source ? null : byId.get(r.user_id)?.profile_image_url ?? null,
      upvotes: voteCounts.get(r.id) || 0,
      viewer_has_upvoted: viewerVoted.has(r.id),
    }));
  } catch (e) {
    console.warn("[reviews] getReviewsForTurf failed:", e);
    return [];
  }
}

/**
 * Aggregate stats for a turf's in-app reviews. Imported Google rows are
 * left out: their score is already on the turf as rating/total_reviews,
 * and mixing 5 imported rows into "N in-app" misread as our own.
 * Computed in-memory; cheap at this volume.
 */
export async function getReviewSummary(turfId: string): Promise<ReviewSummary> {
  try {
    const s = supa();
    const { data } = await s
      .from("reviews")
      .select("rating")
      .eq("turf_id", turfId)
      .is("source", null);
    const rows = (data || []) as { rating: number }[];
    if (rows.length === 0) return zeroSummary();

    const histogram: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    let sum = 0;
    for (const r of rows) {
      const rating = Math.max(1, Math.min(5, Math.round(r.rating)));
      histogram[rating - 1] += 1;
      sum += rating;
    }
    return {
      count: rows.length,
      average: Math.round((sum / rows.length) * 10) / 10,
      histogram,
    };
  } catch (e) {
    console.warn("[reviews] getReviewSummary failed:", e);
    return zeroSummary();
  }
}

function zeroSummary(): ReviewSummary {
  return { count: 0, average: 0, histogram: [0, 0, 0, 0, 0] };
}
