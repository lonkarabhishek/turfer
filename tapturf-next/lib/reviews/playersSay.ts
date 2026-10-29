import { mentionsBookingApp, scrubBookingApps } from "../utils/bookingApps";
import { writtenEnough } from "./summaryLine";
import type { Aspects } from "./types";

/** turfs.review_summary as the page and Ask read it (lib/queries/turfs.ts toPlayersSay). */
export type PlayersSay = { summary: string; likes: string[]; gripes: string[]; based_on: number; sources: string[] };

/** A live review as turf_page sends it (lib/turfPage/shape.ts): null source is a TapTurf player's report. */
export type LiveReview = { rating: number; comment: string | null; source?: string | null; aspects?: Aspects | null };

/** turf_page sends the latest this many live reviews, Google's and TapTurf's together. */
export const PAGE_REVIEWS = 20;

/**
 * Whether the live reviews still back a summary that TapTurf players'
 * reports went into. A player can remove their report (review_remove) and
 * moderation can hide one, but nothing remakes or clears the stored
 * summary then: get_review_summary_batch needs 2 written reviews to remake
 * it. So the summary would keep repeating the withdrawn words. Backed: at
 * least one of the players' own written reports is live, and as many
 * written reviews of its kinds as it was made from (writtenEnough, as the
 * summary pass counts them), unless turf_page's latest 20 can't show them
 * all. A summary of Google reviews alone is not a player's to withdraw.
 */
export function backedBy(s: PlayersSay, live: readonly LiveReview[]): boolean {
  if (!s.sources.includes("TapTurf")) return true;
  const google = s.sources.includes("Google");
  const written = live.filter(
    (r) => (!r.source || (google && r.source === "google")) && writtenEnough({ rating: r.rating, comment: r.comment, source: r.source ?? null, aspects: r.aspects ?? null }),
  );
  if (!written.some((r) => !r.source)) return false;
  return live.length >= PAGE_REVIEWS || written.length >= (s.based_on || 0);
}

/**
 * "What players say" as the turf page shows it and Ask reads it: the
 * summary of the written reviews without any booking app (the reviews it
 * was made from can name one), or null when nothing is left. With the
 * venue's live reviews, also null when they no longer back it (backedBy).
 * Pure.
 */
export function playersSayOf(s: PlayersSay | null | undefined, live?: readonly LiveReview[]): PlayersSay | null {
  if (!s) return null;
  if (live && !backedBy(s, live)) return null;
  const out = {
    ...s,
    summary: scrubBookingApps(s.summary) ?? "",
    likes: s.likes.filter((l) => !mentionsBookingApp(l)),
    gripes: s.gripes.filter((g) => !mentionsBookingApp(g)),
  };
  return out.summary || out.likes.length || out.gripes.length ? out : null;
}
