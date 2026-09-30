import type { Turf } from "@/types/turf";

/**
 * A rating only counts toward "Top rated" once it has this many reviews.
 * Without it, a 5.0 from 3 reviews outranks a 4.7 from 400.
 */
export const MIN_REVIEWS_FOR_TOP_RATED = 15;

type Rated = Pick<Turf, "rating" | "total_reviews">;

export function hasEnoughReviews(t: Rated): boolean {
  return t.rating > 0 && t.total_reviews >= MIN_REVIEWS_FOR_TOP_RATED;
}

/**
 * Sort comparator for "Top rated": turfs with at least
 * MIN_REVIEWS_FOR_TOP_RATED reviews come first, by rating then review
 * count. Everything else follows, most-reviewed first, so a thinly
 * reviewed 5.0 never jumps the queue.
 */
export function compareTopRated(a: Rated, b: Rated): number {
  const qa = hasEnoughReviews(a);
  const qb = hasEnoughReviews(b);
  if (qa !== qb) return qa ? -1 : 1;
  if (qa) {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return b.total_reviews - a.total_reviews;
  }
  if (b.total_reviews !== a.total_reviews) return b.total_reviews - a.total_reviews;
  return b.rating - a.rating;
}
