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
 */
export async function getReviewsForTurf(
  turfId: string,
  limit = 20,
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

    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    const { data: users } = await s
      .from("users")
      .select("id, name, profile_image_url")
      .in("id", userIds);

    const byId = new Map<string, { name: string | null; profile_image_url: string | null }>();
    (users || []).forEach((u) =>
      byId.set(u.id, {
        name: u.name ?? null,
        profile_image_url: u.profile_image_url ?? null,
      }),
    );

    return rows.map((r) => ({
      ...r,
      user_name: byId.get(r.user_id)?.name ?? null,
      user_avatar: byId.get(r.user_id)?.profile_image_url ?? null,
    }));
  } catch (e) {
    console.warn("[reviews] getReviewsForTurf failed:", e);
    return [];
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
