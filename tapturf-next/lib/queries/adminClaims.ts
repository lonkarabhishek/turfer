import { ownerRead } from "@/lib/admin/db";
import { claimsAnswer } from "@/lib/admin/claimed";
import { turfsById } from "@/lib/queries/admin";
import { dataOf, okSection, type Section } from "@/lib/admin/section";
import type { AdminClaim } from "@/lib/admin/claims";

export type AdminClaims = {
  claims: AdminClaim[];
  /** Claimed turfs that are not on the site (not active); null when that couldn't be read. */
  offSite: ReadonlySet<string> | null;
};

/**
 * Every myTapturf claim with its turf and account, for /admin/claimed:
 * admin_owner_claims, the owner-claims panel's read (site owner only, with
 * the visitor's session and Firebase token), then which of those turfs are
 * on the site (active turfs are the ones the anon read sees), so a turf
 * claimed and later taken off the site says so. Settled; never throws.
 */
export async function getAdminClaims(): Promise<Section<AdminClaims>> {
  const s = await ownerRead("admin_owner_claims", async ({ supabase, token }, signal) =>
    claimsAnswer(dataOf(await supabase.rpc("admin_owner_claims", { p_firebase_token: token }).abortSignal(signal), "admin_owner_claims")),
  );
  if (!s.ok) return s;
  const ids = [...new Set(s.data.map((c) => c.turfId))];
  if (ids.length === 0) return okSection({ claims: [], offSite: new Set<string>() });
  const live = await turfsById(ids);
  return okSection({ claims: s.data, offSite: live.ok ? new Set(ids.filter((id) => !live.data.has(id))) : null });
}
