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
    }));
  } catch {
    return [];
  }
}

export async function submitTurfSuggestion(
  input: NewTurfSuggestion,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trim = (v: string | null) => {
    const t = v?.trim();
    return t ? t : null;
  };
  try {
    const { error } = await createClient()
      .from("turf_suggestions")
      .insert([
        {
          turf_id: input.turfId,
          user_id: input.userId,
          submitter_name: trim(input.submitterName)?.slice(0, 80) ?? null,
          relationship: input.relationship,
          contact_phone: input.contactPhone,
          whatsapp_phone: input.whatsappPhone,
          price_min: input.priceMin,
          price_max: input.priceMax,
          price_notes: trim(input.priceNotes),
          opening_hours: trim(input.openingHours),
          sports: input.sports,
          amenities: input.amenities,
          notes: trim(input.notes),
        },
      ]);
    if (error) {
      if (error.message?.includes("Too many suggestions")) {
        return { ok: false, error: "You've shared a lot today. Please try again tomorrow." };
      }
      return { ok: false, error: "Couldn't send that. Please check the details and try again." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network hiccup. Please try again." };
  }
}
