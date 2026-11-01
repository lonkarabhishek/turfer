import type { PhotoProblem, ReviewPhoto } from "./types";

/**
 * Photos from the game on a report (20261102_reviews_trust.sql): the
 * limits, where the files are, the shape the routes and the page read, and
 * what each refusal says. A photo is made smaller on the phone (1600 px on
 * its long side, and a 360 px thumbnail; drawing it again leaves the
 * camera's details, the location too, behind), checked by the server
 * before it is stored, and shows on the report once it is posted. Pure,
 * relative imports only (npm run test:reviews).
 */

export const REVIEW_PHOTOS = {
  /** On one report. review_save keeps the first 3 it is sent. */
  perReport: 3,
  /** Uploads a day per account, the ones the check turned down too (review_photo_start). */
  perDay: 10,
  /** Long side of the photo and of its thumbnail. */
  full: 1600,
  thumb: 360,
  /** The shorter side of the photo as taken, at least: a smaller one shows nothing. */
  minSide: 480,
  /** The bucket's limit (1 MB) and the thumbnail's (review_photo_start). */
  maxBytes: 1_048_576,
  thumbMaxBytes: 131_072,
  /** Encoder quality, then lower while the file is over the limit. */
  quality: [0.82, 0.72, 0.6] as const,
  thumbQuality: 0.7,
  /** A photo added but never posted is removed after this (the sweep); a draft drops it a little sooner. */
  readyMs: 2 * 86_400_000,
} as const;

export const REVIEW_PHOTO_BUCKET = "review-photos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FULL = /^([0-9a-f]{24})\.(webp|jpg)$/;
const THUMB = /^([0-9a-f]{24})_t\.(webp|jpg)$/;

/** The public address of a file in the bucket, from the Supabase project the app talks to. */
export function reviewPhotoUrl(path: string, base: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  return `${(base ?? "").replace(/\/+$/, "")}/storage/v1/object/public/${REVIEW_PHOTO_BUCKET}/${path}`;
}

/** One photo as the database sends it (review_row_json, review_photo_finish), checked; null when it isn't one. */
export function shapeReviewPhoto(raw: unknown): ReviewPhoto | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const full = typeof r.path === "string" ? FULL.exec(r.path) : null;
  const thumb = typeof r.thumb === "string" ? THUMB.exec(r.thumb) : null;
  const side = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x > 0 && x <= REVIEW_PHOTOS.full ? x : null);
  const w = side(r.w);
  const h = side(r.h);
  if (typeof r.id !== "string" || !UUID.test(r.id) || !full || !thumb || full[1] !== thumb[1] || full[2] !== thumb[2] || !w || !h) return null;
  return { id: r.id.toLowerCase(), path: full[0], thumb: thumb[0], w, h };
}

/** A report's photos: the first 3 well-formed ones, each once; [] for none or junk. */
export function shapeReviewPhotos(raw: unknown): ReviewPhoto[] {
  if (!Array.isArray(raw)) return [];
  const out: ReviewPhoto[] = [];
  for (const x of raw) {
    const p = shapeReviewPhoto(x);
    if (p && !out.some((o) => o.id === p.id)) out.push(p);
    if (out.length === REVIEW_PHOTOS.perReport) break;
  }
  return out;
}

/** The sizes the server takes: the photo within 1600 px (and at least 200 on its short side), its thumbnail within 400 and the same shape. */
export function photoSizesOk(full: { w: number; h: number }, thumb: { w: number; h: number }): boolean {
  if (Math.max(full.w, full.h) > REVIEW_PHOTOS.full || Math.min(full.w, full.h) < 200) return false;
  if (Math.max(thumb.w, thumb.h) > 400 || Math.min(thumb.w, thumb.h) < 40) return false;
  // The thumbnail is the photo made smaller: the same shape, give or take its rounding.
  return Math.abs(full.w / full.h - thumb.w / thumb.h) <= 0.05 * (full.w / full.h) && thumb.w <= full.w && thumb.h <= full.h;
}

/** What to tell the player when a photo wasn't added: an error from POST /api/reviews/photos with its problem, or a file the phone couldn't use. */
export function photoErrorText(error: string | null, problem?: string | null): string {
  switch (error) {
    case "refused":
      switch (problem as PhotoProblem | undefined) {
        case "personal_info":
          return "That photo seems to show a number, a document or a code. Pick another one.";
        case "spam":
          return "That looks like a poster, an ad or a screenshot. Add a photo you took at the turf.";
        case "not_venue":
          return "We couldn't see the turf in that photo. Add one of the pitch, the court or your game.";
        default:
          return "That photo can't go on a review on TapTurf. Pick another one.";
      }
    case "unchecked":
      return "We couldn't check your photo just now, so it wasn't added. Try again in a few minutes.";
    case "limit":
      return `That's ${REVIEW_PHOTOS.perDay} photos today. Try again tomorrow.`;
    case "not_allowed":
      return "You manage this turf, so you can't add photos to a review of it.";
    case "sign_in":
      return "Your login ended. Log in again to add photos.";
    case "bad":
      switch (problem) {
        case "too_small":
          return "That photo is too small to show. Pick a bigger one.";
        case "too_big":
          return "That photo is too big to open (over 30 MB). Try another.";
        case "not_photo":
          return "That file isn't a photo we can use. Try a JPG or PNG from your gallery.";
        case "unreadable":
          return "We couldn't open that photo. If it's an HEIC photo, share it as JPG from your gallery and try again.";
        default:
          return "Something went wrong with that photo. Try again.";
      }
    default:
      return "Couldn't add the photo just now. Check your connection and try again.";
  }
}
