import { createClient } from "@/lib/supabase/client";
import type { Review, ReviewWithUser, ReviewSummary } from "@/types/review";

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
      .select("id, user_id, turf_id, booking_id, rating, comment, created_at, updated_at")
      .eq("turf_id", turfId)
      .order("created_at", { ascending: false })
      .limit(limit);

    const rows = (reviews || []) as Review[];
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
      user_name: byId.get(r.user_id)?.name ?? null,
      user_avatar: byId.get(r.user_id)?.profile_image_url ?? null,
      upvotes: voteCounts.get(r.id) || 0,
      viewer_has_upvoted: viewerVoted.has(r.id),
    }));
  } catch (e) {
    console.warn("[reviews] getReviewsForTurf failed:", e);
    return [];
  }
}

/**
 * Toggle an upvote. Returns the new state so the caller can update
 * optimistically without a follow-up fetch. Idempotent: repeated
 * calls flip between voted and not-voted.
 *
 * The DB has a UNIQUE(review_id, user_id) constraint so we treat any
 * insert conflict as "already voted — remove it".
 */
export async function toggleReviewUpvote(
  reviewId: string,
  userId: string,
): Promise<{ ok: boolean; upvoted: boolean; error?: string }> {
  try {
    const s = supa();
    // Cheap existence check to decide direction. Alternative would be
    // "insert, catch 23505, delete on catch" — one round-trip instead
    // of two — but that trades read latency for less code and worse
    // observability. Two calls at ~50ms each is fine here.
    const { data: existing } = await s
      .from("review_votes")
      .select("id")
      .eq("review_id", reviewId)
      .eq("user_id", userId)
      .limit(1);

    if (existing && existing.length > 0) {
      const { error } = await s
        .from("review_votes")
        .delete()
        .eq("review_id", reviewId)
        .eq("user_id", userId);
      if (error) return { ok: false, upvoted: true, error: error.message };
      return { ok: true, upvoted: false };
    }

    const { error } = await s
      .from("review_votes")
      .insert([{ review_id: reviewId, user_id: userId }]);
    if (error) {
      // Race: someone else inserted between our check and insert. Treat
      // as "already voted" success.
      if (String(error.code) === "23505") return { ok: true, upvoted: true };
      return { ok: false, upvoted: false, error: error.message };
    }
    return { ok: true, upvoted: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, upvoted: false, error: msg };
  }
}

/**
 * Aggregate stats for a turf's reviews. Computed in-memory rather than
 * with a stored function so we don't need any new DB objects. Cheap
 * even at 10k reviews per turf, which we won't hit for a long time.
 */
export async function getReviewSummary(turfId: string): Promise<ReviewSummary> {
  try {
    const s = supa();
    const { data } = await s
      .from("reviews")
      .select("rating")
      .eq("turf_id", turfId);
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

/**
 * Post a new review. Returns { ok, error } so the caller can render
 * a specific message instead of a generic failure.
 */
export async function submitReview(input: {
  turfId: string;
  userId: string;
  rating: number;
  comment?: string | null;
  bookingId?: string | null;
}): Promise<{ ok: boolean; error?: string; review?: Review }> {
  const clean = {
    turf_id: input.turfId,
    user_id: input.userId,
    booking_id: input.bookingId ?? null,
    rating: Math.max(1, Math.min(5, Math.round(input.rating))),
    comment: input.comment?.trim() || null,
  };

  try {
    const s = supa();
    const { data, error } = await s
      .from("reviews")
      .insert([clean])
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, review: data as Review };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
