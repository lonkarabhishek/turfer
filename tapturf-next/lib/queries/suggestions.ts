import { createClient } from "@/lib/supabase/client";

/**
 * Player-suggested info for a turf. Lives in public.turf_suggestions and
 * never overwrites the turfs table. Reads go through the
 * get_turf_suggestions() RPC, which hides rejected rows and masks phone
 * numbers until a human approves them.
 */

export type SuggestionRelationship = "player" | "owner" | "staff" | "other";

export interface TurfSuggestion {
  id: string;
  submitter_name: string;
  relationship: SuggestionRelationship;
  /** Only set once approved. */
  contact_phone: string | null;
  /** Only set once approved. */
  whatsapp_phone: string | null;
  /** A number was shared but is still waiting for a check. */
  phone_pending: boolean;
  price_min: number | null;
  price_max: number | null;
  price_notes: string | null;
  opening_hours: string | null;
  sports: string[];
  amenities: string[];
  notes: string | null;
  status: "pending" | "approved";
  created_at: string;
  /** Set once the author has edited it. */
  updated_at: string | null;
  edit_count: number;
  /** Latest edit: { field: { from, to } }. Phone fields hidden unless approved. */
  last_changes: Record<string, { from: unknown; to: unknown }> | null;
}

/** The signed-in user's own suggestion for a turf, unmasked (for editing). */
export interface MyTurfSuggestion {
  id: string;
  relationship: SuggestionRelationship;
  contact_phone: string | null;
  whatsapp_phone: string | null;
  price_min: number | null;
  price_max: number | null;
  price_notes: string | null;
  opening_hours: string | null;
  sports: string[];
  amenities: string[];
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string | null;
}

export interface NewTurfSuggestion {
  turfId: string;
  userId: string;
  submitterName: string | null;
  relationship: SuggestionRelationship;
  contactPhone: string | null;
  whatsappPhone: string | null;
  priceMin: number | null;
  priceMax: number | null;
  priceNotes: string | null;
  openingHours: string | null;
  sports: string[];
  amenities: string[];
  notes: string | null;
}

export async function getTurfSuggestions(turfId: string): Promise<TurfSuggestion[]> {
  try {
    const { data, error } = await createClient().rpc("get_turf_suggestions", {
      p_turf_id: turfId,
    });
    if (error || !data) return [];
    return (data as TurfSuggestion[]).map((s) => ({
      ...s,
      sports: s.sports ?? [],
      amenities: s.amenities ?? [],
      edit_count: s.edit_count ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function getMyTurfSuggestion(
  turfId: string,
  userId: string,
): Promise<MyTurfSuggestion | null> {
  try {
    const { data, error } = await createClient().rpc("get_my_turf_suggestion", {
      p_turf_id: turfId,
      p_user_id: userId,
    });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const row = data[0] as MyTurfSuggestion;
    return { ...row, sports: row.sports ?? [], amenities: row.amenities ?? [] };
  } catch {
    return null;
  }
}

export type SaveResult = "created" | "updated" | "unchanged";

export async function submitTurfSuggestion(
  input: NewTurfSuggestion,
): Promise<{ ok: true; result: SaveResult } | { ok: false; error: string }> {
  const trim = (v: string | null) => {
    const t = v?.trim();
    return t ? t : null;
  };
  // Never leave the Send button spinning: if the request hasn't come
  // back in 20s, tell the user instead of waiting forever.
  const timeout = new Promise<{ data: null; error: { message: string } }>((resolve) =>
    setTimeout(() => resolve({ data: null, error: { message: "__timeout__" } }), 20000),
  );
  try {
    // One suggestion per person per turf: the RPC creates it the first
    // time and updates it (logging what changed) after that.
    const request = createClient()
      .rpc("save_turf_suggestion", {
        p_turf_id: input.turfId,
        p_user_id: input.userId,
        p_submitter_name: trim(input.submitterName)?.slice(0, 80) ?? null,
        p_relationship: input.relationship,
        p_contact_phone: input.contactPhone,
        p_whatsapp_phone: input.whatsappPhone,
        p_price_min: input.priceMin,
        p_price_max: input.priceMax,
        p_price_notes: trim(input.priceNotes),
        p_opening_hours: trim(input.openingHours),
        p_sports: input.sports,
        p_amenities: input.amenities,
        p_notes: trim(input.notes),
      })
      .then(({ data, error }) => ({ data: data as SaveResult | null, error }));
    const { data, error } = await Promise.race([request, timeout]);
    if (error) {
      if (error.message === "__timeout__") {
        return { ok: false, error: "This is taking too long. Check your connection, refresh the page and try again." };
      }
      if (error.message?.includes("Too many")) {
        return { ok: false, error: "You've made a lot of changes today. Please try again tomorrow." };
      }
      return { ok: false, error: "Couldn't send that. Please check the details and try again." };
    }
    return { ok: true, result: data ?? "created" };
  } catch {
    return { ok: false, error: "Network hiccup. Please try again." };
  }
}
