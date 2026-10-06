// Reviews are player-written 1-5 star ratings on a turf, optionally
// linked to the booking they came from. Mirrors public.reviews.

export interface Review {
  id: string;
  user_id: string;
  turf_id: string;
  booking_id: string | null;
  rating: number;              // 1..5 (DB check constraint)
  comment: string | null;
  created_at: string | null;
  updated_at: string | null;
  // Imported reviews (source = "google") carry the reviewer's public
  // name and links; created_at is the import time, so the display date
  // comes from source_date_label ("3 years ago"). All null for native.
  source?: string | null;
  author_name?: string | null;
  author_url?: string | null;
  source_url?: string | null;
  source_date_label?: string | null;
}

// Denormalised for list rendering — carries the reviewer's public
// display fields so we don't have to re-fetch users for a review list.
// Also carries upvote state: total count, and whether the CURRENT
// viewer has upvoted this review (drives the filled/hollow icon state).
export interface ReviewWithUser extends Review {
  user_name: string | null;
  user_avatar: string | null;
  upvotes: number;
  viewer_has_upvoted: boolean;
}

export interface ReviewSummary {
  count: number;
  average: number;             // 0..5, one decimal
  histogram: [number, number, number, number, number]; // [1★, 2★, 3★, 4★, 5★] counts
}
