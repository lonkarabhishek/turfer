import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE } from "@/lib/admin/auth";
import type { ListingReview } from "@/lib/ai/listing";

export type ListingRow = { id: string; name: string; city: string | null; listing_review: ListingReview; listing_checked_at: string };

/** Owner-only: turfs the listing checker flagged, newest check first. */
export async function getFlaggedListings(): Promise<ListingRow[]> {
  try {
    const supabase = await createServerClient();
    const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
    const { data, error } = await supabase.rpc("get_listing_reviews", { p_firebase_token: token });
    if (error) return [];
    return ((data ?? []) as ListingRow[]).filter((r) => r.listing_review && Array.isArray(r.listing_review.issues));
  } catch {
    return [];
  }
}
