import { createReadOnlyClient } from "@/lib/supabase/server";

/** True when an owner manages this turf on myTapturf. No names or numbers leave the database. */
export async function isTurfClaimed(turfId: string): Promise<boolean> {
  try {
    const { data } = await createReadOnlyClient().rpc("turf_claim_status", { p_turf_id: turfId });
    return data === true;
  } catch {
    return false;
  }
}
