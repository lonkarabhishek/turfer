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
}

// Denormalised for list rendering — carries the reviewer's public
// display fields so we don't have to re-fetch users for a review list.
export interface ReviewWithUser extends Review {
  user_name: string | null;
  user_avatar: string | null;
}

export interface ReviewSummary {
  count: number;
  average: number;             // 0..5, one decimal
  histogram: [number, number, number, number, number]; // [1★, 2★, 3★, 4★, 5★] counts
}
