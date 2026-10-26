"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { Star, User, ExternalLink, ChevronUp } from "lucide-react";
import {
  getReviewsForTurf,
  getReviewSummary,
  getViewerUpvotes,
  submitReview,
  toggleReviewUpvote,
} from "@/lib/queries/reviews";
import { ACCOUNT_NOT_CONFIRMED, useAuth } from "@/components/auth/AuthProvider";
import type { ReviewWithUser, ReviewSummary } from "@/types/review";

const noop = () => () => {};

/**
 * Reviews block on the turf detail page. A client component because the
 * logged-in user gates the write form (the server would need the
 * SSR-cookie plumbing we already skip for phone-auth users).
 * The list and in-app stats come with the page (turf_page) instead of 2
 * to 4 browser queries per view, Googlebot's and scrapers' included (20
 * Oct outage). The browser reads again only after the visitor's own
 * review, and for a signed-in visitor, which reviews they upvoted.
 */
export function TurfReviews({
  turfId,
  initialReviews,
  initialSummary,
  googleRating,
  googleReviewCount,
  googleReviewUrl,
  playersSay,
}: {
  turfId: string;
  /** Latest reviews from the server render, players' own first. */
  initialReviews: ReviewWithUser[];
  /** In-app review count and average from the server render. */
  initialSummary: ReviewSummary;
  /** Summary of written reviews made by the admin pass; null until it runs. */
  playersSay?: { summary: string; likes: string[]; gripes: string[]; based_on: number; sources: string[] } | null;
  // Pass Google's public rating so the block has something to show
  // before anyone has left an in-app review. Both values come from the
  // turfs table (which we've backfilled from Google) and any of them
  // can be null/0 for a brand-new turf.
  googleRating?: number | null;
  googleReviewCount?: number | null;
  googleReviewUrl?: string | null;
}) {
  const { user, login, confirmedUser } = useAuth();
  const userId = user?.id ?? null;
  const [reviews, setReviews] = useState<ReviewWithUser[]>(initialReviews);
  const [summary, setSummary] = useState<ReviewSummary | null>(initialSummary);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Dates read the visitor's clock and locale, so they appear after
  // hydration; the server's (UTC, its own ICU) could differ and break it.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  // Reload from the database after the visitor's own review only; the
  // cached page catches up when the queue next refreshes it.
  const load = useCallback(async () => {
    setLoading(true);
    const [list, sum] = await Promise.all([
      getReviewsForTurf(turfId, 20, userId),
      getReviewSummary(turfId),
    ]);
    setReviews(list);
    setSummary(sum);
    setLoading(false);
  }, [turfId, userId]);

  // Which reviews this signed-in visitor upvoted is theirs alone, so it
  // is not in the cached page. One read, for every in-app review: the
  // cached count can still read 0 for a minute after their own vote, and
  // skipping those showed the button off, so the next tap removed the
  // vote. Their own vote counts at least once until the page refreshes.
  const votedOn = initialReviews
    .filter((r) => !r.source)
    .map((r) => r.id)
    .join(",");
  useEffect(() => {
    if (!userId || !votedOn) return;
    let alive = true;
    getViewerUpvotes(votedOn.split(","), userId).then((ids) => {
      if (!alive || !ids) return;
      setReviews((prev) =>
        prev.map((r) => ({ ...r, viewer_has_upvoted: ids.has(r.id), upvotes: ids.has(r.id) ? Math.max(r.upvotes, 1) : r.upvotes })),
      );
    });
    return () => {
      alive = false;
    };
  }, [userId, votedOn]);

  /**
   * Optimistic upvote toggle. Updates local state instantly, then
   * calls the DB in the background. On failure we roll back so the UI
   * matches server truth. Prompts login for anonymous viewers.
   */
  const handleUpvote = async (reviewId: string) => {
    if (!user) return login();

    // Optimistic flip
    setReviews((prev) =>
      prev.map((r) => {
        if (r.id !== reviewId) return r;
        const nowVoted = !r.viewer_has_upvoted;
        return {
          ...r,
          viewer_has_upvoted: nowVoted,
          upvotes: Math.max(0, r.upvotes + (nowVoted ? 1 : -1)),
        };
      }),
    );

    // The account the server confirms for this sign-in, never only what this device kept.
    const me = await confirmedUser();
    const { ok, upvoted } = me ? await toggleReviewUpvote(reviewId, me.id) : { ok: false, upvoted: false };
    if (!ok) {
      // Roll back to pre-click state
      setReviews((prev) =>
        prev.map((r) => {
          if (r.id !== reviewId) return r;
          const nowVoted = !r.viewer_has_upvoted;
          return {
            ...r,
            viewer_has_upvoted: nowVoted,
            upvotes: Math.max(0, r.upvotes + (nowVoted ? 1 : -1)),
          };
        }),
      );
      return;
    }
    // Reconcile with server-truth in case optimistic guess drifted
    // (e.g. we predicted up, server said already-voted).
    setReviews((prev) =>
      prev.map((r) => {
        if (r.id !== reviewId) return r;
        // If our optimistic value doesn't match the server, correct it.
        if (r.viewer_has_upvoted === upvoted) return r;
        const delta = upvoted ? 1 : -1;
        return {
          ...r,
          viewer_has_upvoted: upvoted,
          upvotes: Math.max(0, r.upvotes + delta),
        };
      }),
    );
  };

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
    const me = await confirmedUser();
    if (!me) {
      setPosting(false);
      setError(ACCOUNT_NOT_CONFIRMED);
      return;
    }
    const { ok, error: err } = await submitReview({
      turfId,
      userId: me.id,
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

  // A Google score without a review count is still a score (14 Pune
  // turfs); only the count line is hidden then.
  const hasGoogle = typeof googleRating === "number" && googleRating > 0;
  const hasGoogleCount = typeof googleReviewCount === "number" && googleReviewCount > 0;

  return (
    <div className="section-divider">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-[22px] font-bold text-primary-800 font-serif">
          Reviews
        </h2>
        {summary && summary.count > 0 && (
          <div className="text-sm text-primary-500">
            <span className="text-primary-800 font-semibold">
              ★ {summary.average.toFixed(1)}
            </span>{" "}
            · {summary.count} in-app
          </div>
        )}
      </div>

      {/* What players say: two sentences from the written reviews we
          hold (Google and TapTurf), made by the admin pass. */}
      {playersSay && (
        <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4 mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-500 mb-1.5">What players say</p>
          {playersSay.summary && <p className="text-[15px] text-primary-900 leading-snug">{playersSay.summary}</p>}
          {(playersSay.likes.length > 0 || playersSay.gripes.length > 0) && (
            <div className={`${playersSay.summary ? "mt-3" : ""} grid sm:grid-cols-2 gap-3`}>
              {playersSay.likes.length > 0 && (
                <div>
                  <p className="text-[12px] font-semibold text-accent-700 mb-1">What players like</p>
                  <ul className="space-y-1">
                    {playersSay.likes.map((l) => (
                      <li key={`l-${l}`} className="flex gap-1.5 text-[14px] text-primary-800 leading-snug">
                        <span aria-hidden className="text-accent-600">+</span> {l}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {playersSay.gripes.length > 0 && (
                <div>
                  <p className="text-[12px] font-semibold text-amber-800 mb-1">Common complaints</p>
                  <ul className="space-y-1">
                    {playersSay.gripes.map((g) => (
                      <li key={`g-${g}`} className="flex gap-1.5 text-[14px] text-primary-800 leading-snug">
                        <span aria-hidden className="text-amber-700">&minus;</span> {g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <p className="mt-2.5 text-[11px] text-primary-400">
            {playersSay.based_on > 0
              ? `Summarised by TapTurf from ${playersSay.based_on} written ${playersSay.sources.join(" and ")} review${playersSay.based_on === 1 ? "" : "s"}.`
              : `Summarised by TapTurf from ${playersSay.sources.join(" and ")} reviews.`}
          </p>
        </div>
      )}

      {/* Google summary card — shown whenever we have a public rating,
          regardless of whether in-app reviews exist. This is the fastest
          way to give social proof on any turf page while our own reviews
          table fills up. */}
      {hasGoogle && (
        <a
          href={googleReviewUrl || undefined}
          target={googleReviewUrl ? "_blank" : undefined}
          rel="noopener noreferrer"
          className={`press-tight flex items-center gap-4 rounded-2xl border border-primary-200 bg-white p-4 mb-4 ${
            googleReviewUrl ? "hover:border-accent-400 hover:bg-accent-50/30" : ""
          } transition-colors`}
        >
          {/* Score chip */}
          <div className="flex flex-col items-center justify-center rounded-xl bg-accent-50 border border-accent-200 px-4 py-3 min-w-[68px]">
            <span className="font-display text-2xl leading-none text-accent-700">
              {Number(googleRating).toFixed(1)}
            </span>
            <div className="flex items-center gap-0.5 mt-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star
                  key={i}
                  className={`w-3 h-3 ${
                    i < Math.round(googleRating || 0)
                      ? "fill-accent-500 text-accent-500"
                      : "fill-none text-accent-300"
                  }`}
                />
              ))}
            </div>
          </div>
          {/* Label + link */}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-primary-500">
              Rated on Google
            </p>
            <p className="text-primary-800 font-semibold leading-tight">
              {hasGoogleCount
                ? `${googleReviewCount!.toLocaleString("en-IN")} Google review${googleReviewCount === 1 ? "" : "s"}`
                : "Google rating"}
            </p>
            {googleReviewUrl && (
              <p className="text-xs text-accent-600 font-semibold mt-0.5 inline-flex items-center gap-1">
                Read them on Google
                <ExternalLink className="w-3 h-3" />
              </p>
            )}
          </div>
        </a>
      )}

      {/* Empty state — the in-app reviews table is 0 rows at launch, so
          we lean on the Google card above and invite the first player
          to review directly. */}
      {!loading && !reviews.some((r) => !r.source) && (
        <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/40 p-6 text-center">
          <p className="text-primary-700 font-semibold">
            No TapTurf reviews yet
          </p>
          <p className="text-primary-500 text-sm mt-1">
            {hasGoogle
              ? "Played here? Add the first TapTurf review below the Google score."
              : "Played here? Be the first to leave a review."}
          </p>
          {user ? (
            !showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="press-tight mt-4 inline-flex items-center rounded-full bg-primary-800 text-white text-sm font-bold px-4 py-2 hover:bg-primary-900"
              >
                Write a review
              </button>
            )
          ) : (
            <button
              onClick={login}
              className="press-tight mt-4 inline-flex items-center rounded-full bg-primary-800 text-white text-sm font-bold px-4 py-2 hover:bg-primary-900"
            >
              Log in to review
            </button>
          )}
        </div>
      )}

      {/* Post-a-review CTA (when in-app reviews exist and user hasn't reviewed) */}
      {!loading && reviews.some((r) => !r.source) && user && !alreadyReviewed && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="press-tight w-full rounded-2xl border border-primary-200 bg-white hover:border-accent-400 hover:bg-accent-50/40 py-3 mb-4 text-sm font-semibold text-primary-800 transition-colors"
        >
          + Add your review
        </button>
      )}
      {!loading && reviews.some((r) => !r.source) && !user && (
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
          <p className="text-xs font-bold text-primary-500 mb-3">
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
              className="press-tight rounded-full bg-primary-800 text-white text-sm font-bold px-5 py-2 hover:bg-primary-900 disabled:opacity-50"
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
          {reviews.map((r) => {
            // Signed out, nothing is "yours" (the flags belong to the last viewer).
            const voted = !!user && r.viewer_has_upvoted;
            return (
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
                    <p className="text-sm font-semibold text-primary-800 truncate flex items-center gap-1.5">
                      <span className="truncate">
                        {r.source ? r.author_name || "Google user" : r.user_name || "TapTurf player"}
                      </span>
                      {r.source === "google" && (
                        <GoogleBadge href={r.author_url || r.source_url} />
                      )}
                    </p>
                    <p className="text-[11px] text-primary-400">
                      {r.source ? r.source_date_label || "on Google" : hydrated ? formatDate(r.created_at) : "\u00a0"}
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

                {/* Upvote row — 'Helpful' style. Filled on viewer's own
                    upvote. Tapping while signed-out routes to /login.
                    Not shown on imported reviews. */}
                {!r.source && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => handleUpvote(r.id)}
                    aria-pressed={voted}
                    aria-label={
                      voted
                        ? "Remove your upvote"
                        : "Upvote this review"
                    }
                    className={`press-tight inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                      voted
                        ? "bg-accent-500 border-accent-500 text-white hover:bg-accent-600"
                        : "bg-white border-primary-200 text-primary-700 hover:border-accent-400 hover:text-accent-700"
                    }`}
                  >
                    <ChevronUp
                      className="w-4 h-4"
                      strokeWidth={voted ? 3 : 2.5}
                    />
                    <span>Helpful</span>
                    {r.upvotes > 0 && (
                      <span
                        className={`font-mono tabular-nums ${
                          voted ? "text-white" : "text-primary-500"
                        }`}
                      >
                        · {r.upvotes}
                      </span>
                    )}
                  </button>
                </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Small "Google" tag next to an imported reviewer's name, linking out when we have a URL. */
function GoogleBadge({ href }: { href: string | null | undefined }) {
  const cls =
    "shrink-0 inline-flex items-center gap-0.5 rounded-full border border-primary-200 bg-primary-50 px-1.5 py-px text-[10px] font-semibold text-primary-500";
  if (!href) return <span className={cls}>Google</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener nofollow"
      className={`${cls} hover:border-accent-400 hover:text-accent-700`}
      onClick={(e) => e.stopPropagation()}
    >
      Google <ExternalLink className="w-2.5 h-2.5" />
    </a>
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
