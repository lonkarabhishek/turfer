"use client";

import { useEffect, useState, useCallback } from "react";
import { Star, User } from "lucide-react";
import {
  getReviewsForTurf,
  getReviewSummary,
  submitReview,
} from "@/lib/queries/reviews";
import { useAuth } from "@/components/auth/AuthProvider";
import type { ReviewWithUser, ReviewSummary } from "@/types/review";

/**
 * Reviews block on the turf detail page. Client-side because:
 * - We rely on the logged-in user to gate the write form (server would
 *   need the SSR-cookie plumbing we already skip for phone-auth users).
 * - Reviews are low-volume today (table just added, 0 rows) and don't
 *   need SEO indexing on the first render; SEO already gets the
 *   aggregate rating from turfs.rating + turfs.total_reviews.
 * Fetches on mount, refetches after a successful post.
 */
export function TurfReviews({ turfId }: { turfId: string }) {
  const { user, login } = useAuth();
  const [reviews, setReviews] = useState<ReviewWithUser[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, sum] = await Promise.all([
      getReviewsForTurf(turfId, 20),
      getReviewSummary(turfId),
    ]);
    setReviews(list);
    setSummary(sum);
    setLoading(false);
  }, [turfId]);

  useEffect(() => {
    load();
  }, [load]);

  const alreadyReviewed = user
    ? reviews.some((r) => r.user_id === user.id)
    : false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!user) return login();
    if (rating < 1 || rating > 5) {
      setError("Pick a rating from 1 to 5.");
      return;
    }
    setPosting(true);
    const { ok, error: err } = await submitReview({
      turfId,
      userId: user.id,
      rating,
      comment,
    });
    setPosting(false);
    if (!ok) {
      setError(err || "Couldn't post that review. Try again in a minute.");
      return;
    }
    setRating(0);
    setComment("");
    setShowForm(false);
    load();
  };

  return (
    <div className="section-divider">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-[22px] font-bold text-primary-800 font-serif">
          Player reviews
        </h2>
        {summary && summary.count > 0 && (
          <div className="text-sm text-primary-500">
            <span className="text-primary-800 font-semibold">
              ★ {summary.average.toFixed(1)}
            </span>{" "}
            · {summary.count} review{summary.count === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {/* Empty state — the DB has 0 reviews on turfs at launch. */}
      {!loading && reviews.length === 0 && (
        <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/40 p-6 text-center">
          <p className="text-primary-700 font-semibold">No reviews yet.</p>
          <p className="text-primary-500 text-sm mt-1">
            Played here? Be the first to leave a review.
          </p>
          {user ? (
            !showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="press-tight mt-4 inline-flex items-center rounded-full bg-primary-800 text-white text-sm font-bold uppercase tracking-widest px-4 py-2 hover:bg-primary-900"
              >
                Write a review
              </button>
            )
          ) : (
            <button
              onClick={login}
              className="press-tight mt-4 inline-flex items-center rounded-full bg-primary-800 text-white text-sm font-bold uppercase tracking-widest px-4 py-2 hover:bg-primary-900"
            >
              Log in to review
            </button>
          )}
        </div>
      )}

      {/* Post-a-review CTA (when reviews DO exist and user hasn't reviewed) */}
      {!loading && reviews.length > 0 && user && !alreadyReviewed && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="press-tight w-full rounded-2xl border border-primary-200 bg-white hover:border-accent-400 hover:bg-accent-50/40 py-3 mb-4 text-sm font-semibold text-primary-800 transition-colors"
        >
          + Add your review
        </button>
      )}
      {!loading && reviews.length > 0 && !user && (
        <button
          onClick={login}
          className="press-tight w-full rounded-2xl border border-primary-200 bg-white hover:border-accent-400 hover:bg-accent-50/40 py-3 mb-4 text-sm font-semibold text-primary-800 transition-colors"
        >
          Log in to add your review
        </button>
      )}

      {/* Write form */}
      {showForm && user && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-primary-200 bg-white p-5 mb-6"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-primary-500 mb-3">
            Your rating
          </p>
          <div className="flex items-center gap-1 mb-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => setRating(n)}
                aria-label={`Rate ${n} out of 5`}
                className="p-1"
              >
                <Star
                  className={`w-7 h-7 ${
                    n <= rating
                      ? "fill-accent-500 text-accent-500"
                      : "text-primary-300"
                  }`}
                />
              </button>
            ))}
          </div>
          <label className="block">
            <span className="sr-only">Your review</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={800}
              placeholder="How was the pitch, floodlights, staff? (optional)"
              className="w-full rounded-xl border border-primary-200 focus:border-accent-500 focus:ring-2 focus:ring-accent-200 p-3 text-sm text-primary-800 placeholder:text-primary-400 outline-none"
            />
          </label>
          {error && (
            <p className="mt-2 text-sm text-hot-600">{error}</p>
          )}
          <div className="flex items-center justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="press-tight rounded-full px-4 py-2 text-sm font-semibold text-primary-500 hover:text-primary-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={posting || rating < 1}
              className="press-tight rounded-full bg-primary-800 text-white text-sm font-bold uppercase tracking-widest px-5 py-2 hover:bg-primary-900 disabled:opacity-50"
            >
              {posting ? "Posting…" : "Post review"}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="text-sm text-primary-400">Loading reviews…</div>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-primary-100 bg-white p-4"
            >
              <div className="flex items-center gap-3 mb-2">
                {r.user_avatar ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={r.user_avatar}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-primary-800 truncate">
                    {r.user_name || "TapTurf player"}
                  </p>
                  <p className="text-[11px] text-primary-400">
                    {formatDate(r.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 text-accent-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        i < r.rating
                          ? "fill-accent-500"
                          : "fill-none text-primary-200"
                      }`}
                    />
                  ))}
                </div>
              </div>
              {r.comment && (
                <p className="text-[15px] leading-snug text-primary-700 whitespace-pre-line">
                  {r.comment}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
