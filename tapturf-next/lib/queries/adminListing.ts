import type { ListingReview } from "@/lib/ai/listing";
import { ownerRead } from "@/lib/admin/db";
import { mapSection, rowsOf, type Section } from "@/lib/admin/section";

export type ListingRow = { id: string; name: string; city: string | null; listing_review: ListingReview; listing_checked_at: string };

/** Owner-only: turfs the listing checker flagged, newest check first; or why they couldn't be read. */
export async function getFlaggedListings(): Promise<Section<ListingRow[]>> {
  const s = await ownerRead("get_listing_reviews", async ({ supabase, token }, signal) =>
    rowsOf<ListingRow>(await supabase.rpc("get_listing_reviews", { p_firebase_token: token }).abortSignal(signal), "get_listing_reviews"),
  );
  return mapSection(s, (rows) => rows.filter((r) => r.listing_review && Array.isArray(r.listing_review.issues)));
}
