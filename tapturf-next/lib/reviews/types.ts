import type { AspectId, PlayedWhen, Score } from "./catalog";

/**
 * Game reports: what the review routes take and answer, shared by the
 * routes and the browser. Types only.
 *
 *   GET    /api/reviews?turf=<uuid>   -> MineResponse (signed-in only)
 *   POST   /api/reviews   ReportBody  -> SaveResponse
 *   DELETE /api/reviews?turf=<uuid>   -> { r: "ok" }
 *   POST   /api/reviews/vote { review_id, on } -> VoteResponse
 *
 * Every one needs `Authorization: Bearer <token>` (lib/account/types.ts):
 * the server verifies the sign-in and works out the account itself; the
 * browser never names a user id. Refusals carry `error` (an AccountError)
 * and, for the review ones, `reason`.
 */

export type AspectRating = { score: Score; tags?: string[] };
export type Aspects = Partial<Record<AspectId, AspectRating>>;

export type ReportChannel = "turf_page" | "link" | "edit";

/**
 * POST /api/reviews. Leaving note out keeps the note; note.body null clears it.
 * base: the id of the report this save replaces (the one being edited), null for
 * a new one. When the account already has a report here and base doesn't name
 * it, nothing is saved: the answer is reason "exists" with that report.
 */
export type ReportBody = {
  turf_id: string;
  rating: number;
  sport?: string | null;
  played_when?: PlayedWhen | null;
  aspects?: Aspects | null;
  play_again?: Score | null;
  comment?: string | null;
  note?: { body: string | null; show_name: boolean };
  price_paid?: number | null;
  channel?: ReportChannel;
  ms?: number;
  base?: string | null;
};

export type ReviewStatus = "live" | "held" | "hidden" | "removed";

/** The fields a game report adds to a review row (private.review_row_json). All optional: old rows and old payloads have none. */
export type ReportFields = {
  sport?: string | null;
  played_when?: PlayedWhen | null;
  aspects?: Aspects | null;
  play_again?: Score | null;
  verified_via?: "game" | "booking" | null;
  edited_at?: string | null;
};

/** One part's counts on a turf (turf_page review_aspects; owner_dashboard without tags). */
export type AspectCount = {
  aspect: AspectId;
  n: number;
  great: number;
  okay: number;
  needs_work: number;
  tags?: { tag: string; sign: 1 | -1; n: number; last_at?: string }[];
};

/** [no, maybe, yes] over the last 365 days. */
export type PlayAgainCounts = [number, number, number];

export type RateHint = { kind: "game" | "call" | "whatsapp"; at: string; sport?: string | null; played_when?: PlayedWhen | null };

/** A review as the routes send it: review_row_json plus its status. */
export type MyReview = {
  id: string;
  user_id: string;
  turf_id: string;
  rating: number;
  comment: string | null;
  created_at: string | null;
  user_name: string | null;
  user_avatar: string | null;
  upvotes: number;
  status: ReviewStatus;
  source?: null;
} & ReportFields;

/** The author's own report, with their note as they wrote it. */
export type MyReport = MyReview & { note: { body: string; show_name: boolean } | null };

export type MineResponse =
  | {
      mine: MyReport | null;
      voted: string[];
      blocked: "own_turf" | null;
      hint: RateHint | null;
      my_price: number | null;
    }
  | { error: string; reason?: string };

export type SaveResponse =
  | {
      r: "ok";
      created: boolean;
      review: MyReview;
      /**
       * tomorrow: the next 09:00 IST at least 8 hours on (a named note, or the one that made a batch);
       * batch: a note without a name, waiting until 3 or more players' are waiting, to go out together;
       * on_claim: the turf has no owner on TapTurf yet.
       */
      note: { delivers: "tomorrow" | "batch" | "on_claim"; at: string | null } | null;
      after: { tapturf_n: number; aspects: Partial<Record<AspectId, number>> };
      price_saved: boolean;
    }
  | { error: string; reason?: "own_turf" | "contact_info" | "gone" | "exists"; field?: "comment" | "note"; review?: MyReport };

export type VoteResponse = { r: "ok"; on: boolean; upvotes: number } | { error: string; reason?: "own" | "google" | "gone" };
