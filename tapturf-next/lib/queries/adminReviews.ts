import { cache } from "react";
import { ownerRead } from "@/lib/admin/db";
import { dataOf, ReadFailed } from "@/lib/admin/section";
import { toAdminFlags } from "@/lib/reviews/flags";
import { toAdminRemovals } from "@/lib/reviews/removal";

/**
 * How many owners' requests to take a player's report off are waiting, for
 * the admin home's reviews tile: admin_review_removals (site owner only,
 * 20261101_reviews_policy.sql). Settled; not_set_up on a database from
 * before it. The list itself is read in the browser on /admin/reviews.
 */
export const reviewRemovalNumbers = cache(() =>
  ownerRead("admin_review_removals", async ({ supabase, token }, signal) => {
    const d = dataOf(await supabase.rpc("admin_review_removals", { p_firebase_token: token }).abortSignal(signal), "admin_review_removals");
    if ((d as { error?: string } | null)?.error) throw new ReadFailed("not_allowed", "admin_review_removals: not the site owner");
    const shaped = toAdminRemovals(d);
    if (!shaped) throw new ReadFailed("error", "admin_review_removals: unexpected answer");
    return { open: shaped.open };
  }),
);

/**
 * How many players' reports of reviews ("Report this review") wait for the
 * site owner, for What's waiting and the Reported reviews fold:
 * admin_review_flags (20261102_reviews_trust.sql). Settled; not_set_up on a
 * database from before it. The list is read in the browser.
 */
export const reviewFlagNumbers = cache(() =>
  ownerRead("admin_review_flags", async ({ supabase, token }, signal) => {
    const d = dataOf(await supabase.rpc("admin_review_flags", { p_firebase_token: token }).abortSignal(signal), "admin_review_flags");
    if ((d as { error?: string } | null)?.error) throw new ReadFailed("not_allowed", "admin_review_flags: not the site owner");
    const shaped = toAdminFlags(d);
    if (!shaped) throw new ReadFailed("error", "admin_review_flags: unexpected answer");
    return { open: shaped.open };
  }),
);
