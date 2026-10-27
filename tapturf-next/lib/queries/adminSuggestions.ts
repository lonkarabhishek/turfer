import type { PendingSuggestion } from "@/lib/ai/suggestions";
import { ownerRead } from "@/lib/admin/db";
import { rowsOf, type Reason } from "@/lib/admin/section";

export type SuggestionsResult = { ok: true; rows: PendingSuggestion[] } | { ok: false; reason: Reason };

/**
 * Pending player suggestions with the turf's current values alongside.
 * Owner-only via get_pending_suggestions(); runs with the visitor's own
 * session so the DB can check who is asking. Says why when it can't read
 * (lib/admin/section.ts); never throws.
 */
export async function getPendingSuggestions(limit = 200): Promise<SuggestionsResult> {
  const s = await ownerRead("get_pending_suggestions", async ({ supabase, token }, signal) =>
    rowsOf<Record<string, unknown>>(
      await supabase.rpc("get_pending_suggestions", { p_limit: limit, p_firebase_token: token }).abortSignal(signal),
      "get_pending_suggestions",
    ),
  );
  if (!s.ok) return s;
  const rows = s.data.map((r) => {
    const cur = (r.current ?? {}) as Record<string, unknown>;
    return {
      ...r,
      sports: Array.isArray(r.sports) ? r.sports : [],
      amenities: Array.isArray(r.amenities) ? r.amenities : [],
      current: {
        ...cur,
        sports: Array.isArray(cur.sports) ? cur.sports : [],
        amenities: Array.isArray(cur.amenities) ? cur.amenities : [],
      },
    } as PendingSuggestion;
  });
  return { ok: true, rows };
}
