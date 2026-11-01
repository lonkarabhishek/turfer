import type { AspectId, PlayedWhen, Score } from "./catalog";

/**
 * Game reports: what the review routes take and answer, shared by the
 * routes and the browser. Types only.
 *
 *   GET    /api/reviews?turf=<uuid>   -> MineResponse (signed-in only)
 *   POST   /api/reviews   ReportBody  -> SaveResponse
 *   DELETE /api/reviews?turf=<uuid>   -> { r: "ok" }
 *   POST   /api/reviews/vote { review_id, on } -> VoteResponse
 *   GET    /api/reviews/photos        -> PhotoReadyResponse
 *   POST   /api/reviews/photos?turf=<uuid>  multipart full + thumb -> PhotoAddResponse
 *   DELETE /api/reviews/photos?id=<uuid>    -> { r: "ok" } (one not on a report yet)
 *   POST   /api/reviews/flag { review_id, reason, detail } -> FlagResponse
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
  /**
   * The report's photos, in order (up to 3, POST /api/reviews/photos ids):
   * the list replaces the photos it had. Leaving it out keeps them.
   */
  photos?: string[];
};

/** A photo from the game on a report (20261102_reviews_trust.sql): files in the review-photos bucket, the full one and its thumbnail. */
export type ReviewPhoto = { id: string; path: string; thumb: string; w: number; h: number };

export type ReviewStatus = "live" | "held" | "hidden" | "removed";

/** The fields a game report adds to a review row (private.review_row_json). All optional: old rows and old payloads have none. */
export type ReportFields = {
  sport?: string | null;
  played_when?: PlayedWhen | null;
  aspects?: Aspects | null;
  play_again?: Score | null;
  verified_via?: "game" | "booking" | null;
  edited_at?: string | null;
  /**
   * Played here (verified): its author was in a TapTurf game at this turf
   * that was over by now and had started by the time they wrote it
   * (private.review_played_here). Worked out by the database at every read,
   * never who played or which game. Missing on a database from before
   * 20261102_reviews_trust.sql.
   */
  played_here?: boolean;
  photos?: ReviewPhoto[];
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

/**
 * One new report a day, or one for each turf played at that day (India time): allowed, the
 * other turfs posted on today, the turfs played at today, and whether a new report here
 * would be refused (full).
 */
export type DailyAllowance = { allowed: number; posted: number; played: number; full: boolean };

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
      /** Today's new reports (20261101_reviews_policy.sql); null on a database from before it, or for a manager. */
      daily: DailyAllowance | null;
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
  | {
      error: string;
      reason?: "own_turf" | "contact_info" | "gone" | "exists" | "daily";
      field?: "comment" | "note";
      review?: MyReport;
      /** reason daily: how many new reports they may post today, and how many turfs they played at. */
      allowed?: number;
      played?: number;
    };

export type VoteResponse = { r: "ok"; on: boolean; upvotes: number } | { error: string; reason?: "own" | "google" | "gone" };

/**
 * GET /api/reviews/photos: whether this database has review photos (ready
 * false before 20261102_reviews_trust.sql: the sheet offers none), whether
 * uploads are on now (the check is set up, not paused) and how many this
 * account may still add today.
 */
export type PhotoReadyResponse = { ready: boolean; upload: boolean; left: number } | { error: string };

/**
 * Why a photo wasn't added. The browser's own (a file it couldn't use):
 * not_photo, too_big, too_small, unreadable. The server's: the check
 * turned it down (refused, with why), couldn't run (unchecked), the day's
 * uploads are used (limit), or the account can't rate this turf (own_turf, gone).
 */
export type PhotoProblem = "not_photo" | "too_big" | "too_small" | "unreadable" | "personal_info" | "spam" | "not_venue" | "other";

export type PhotoAddResponse = { r: "ok"; photo: ReviewPhoto; left: number } | { error: string; problem?: PhotoProblem; reason?: "own_turf" | "gone" };

/** POST /api/reviews/flag: "Report this review". already: this account had reported it (since its last change). */
export type FlagResponse = { r: "ok"; already: boolean } | { error: string; reason?: "own" | "google" | "gone" };
