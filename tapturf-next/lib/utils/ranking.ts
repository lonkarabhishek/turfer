import type { Turf } from "@/types/turf";

/**
 * A rating only counts toward "Top rated" once it has this many reviews.
 * Without it, a 5.0 from 3 reviews outranks a 4.7 from 400.
 */
export const MIN_REVIEWS_FOR_TOP_RATED = 15;

type Rated = Pick<Turf, "rating" | "total_reviews">;

// total_reviews can be null in the DB; treat it as 0 so sorts never see NaN.
const reviews = (t: Rated) => t.total_reviews ?? 0;
const rating = (t: Rated) => t.rating ?? 0;

export function hasEnoughReviews(t: Rated): boolean {
  return rating(t) > 0 && reviews(t) >= MIN_REVIEWS_FOR_TOP_RATED;
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
    if (rating(b) !== rating(a)) return rating(b) - rating(a);
    return reviews(b) - reviews(a);
  }
  if (reviews(b) !== reviews(a)) return reviews(b) - reviews(a);
  return rating(b) - rating(a);
}
