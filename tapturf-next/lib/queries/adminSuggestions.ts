import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE } from "@/lib/admin/auth";
import type { PendingSuggestion } from "@/lib/ai/suggestions";

export type SuggestionsResult =
  | { ok: true; rows: PendingSuggestion[] }
  | { ok: false; reason: "not_allowed" | "not_set_up" | "error" };

/**
 * Pending player suggestions with the turf's current values alongside.
 * Owner-only via get_pending_suggestions(); runs with the visitor's own
 * session so the DB can check who is asking.
 */
export async function getPendingSuggestions(limit = 200): Promise<SuggestionsResult> {
  try {
    const supabase = await createServerClient();
    const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
    const { data, error } = await supabase.rpc("get_pending_suggestions", { p_limit: limit, p_firebase_token: token });
    if (error) {
      if (error.code === "42501") return { ok: false, reason: "not_allowed" };
      if (error.code === "PGRST202" || error.code === "42883") return { ok: false, reason: "not_set_up" };
      return { ok: false, reason: "error" };
    }
    const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => {
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
  } catch {
    return { ok: false, reason: "error" };
  }
}
