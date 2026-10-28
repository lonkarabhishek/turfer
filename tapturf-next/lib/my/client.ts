import { createClient } from "@/lib/supabase/client";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { AspectId } from "@/lib/reviews/catalog";
import type { AspectCount, ReportFields } from "@/lib/reviews/types";

/**
 * Browser side of myTapturf. Every owner call goes to a database
 * function that works out who is calling on its own: a Google sign-in
 * rides along as the Supabase session, a phone sign-in sends its
 * Firebase ID token, which the database checks with Google. Nothing
 * here grants access; a wrong token just gets "forbidden" back.
 */

/** Firebase ID token for phone sign-ins; null for Google sign-ins. */
export async function ownerToken(): Promise<string | null> {
  // Local end-to-end builds only (next.config.ts refuses the flag on Vercel), as lib/account/client.ts firebaseToken.
  if (process.env.NEXT_PUBLIC_E2E_AUTH === "1") {
    try {
      return localStorage.getItem("tt_e2e_fb_token");
    } catch {
      return null;
    }
  }
  try {
    const auth = await getFirebaseAuth();
    await auth.authStateReady();
    return (await auth.currentUser?.getIdToken()) ?? null;
  } catch {
    return null;
  }
}

export async function ownerRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const token = await ownerToken();
  const { data, error } = await createClient().rpc(fn, { p_token: token, ...args });
  if (error) throw new Error(error.message);
  return data as T;
}

/** Ask the server to rebuild the public turf page after an edit. */
export async function refreshTurfPage(turfId: string) {
  try {
    await fetch("/api/my/revalidate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ turfId, token: await ownerToken() }),
    });
  } catch {
    /* the page refreshes on its own schedule anyway */
  }
}

export type OwnerTurfRef = { id: string; name: string; city: string | null; area: string | null; cover: string | null };
export type OwnerHome =
  | { signed_in: false }
  | {
      signed_in: true;
      who: string;
      kind: "phone" | "email";
      admin: boolean;
      /** The TapTurf account claims are made as; null when this sign-in opens none. Missing on an older database. */
      account?: { name: string | null; username: string | null } | null;
      /** none: no account for this sign-in yet; conflict: its number is on an account it can't open. */
      account_state?: "ok" | "none" | "conflict";
      turfs: (OwnerTurfRef & { status: "active" | "pending"; via: string; since: string })[];
      matches: OwnerTurfRef[];
    };

/** owner_claim_info: how many mobiles the listing has, and the last two digits of each. */
export type ClaimInfo = { mobiles: number; endings: string[] } | { error: string };
export type ClaimResult = { status?: "active" | "pending"; admin?: boolean; error?: string };

export type DayStat = { day: string; views: number; calls: number; whatsapp: number };
export type OwnerTurf = {
  id: string;
  name: string;
  city: string | null;
  area: string | null;
  address: string | null;
  sports: string[] | null;
  rating: number | null;
  total_reviews: number | null;
  cover: string | null;
  photos: number;
  morning_price: number | null;
  afternoon_price: number | null;
  evening_price: number | null;
  weekend_morning_price: number | null;
  weekend_afternoon_price: number | null;
  weekend_evening_price: number | null;
  price_owner_confirmed: boolean | null;
  price_verified_at: string | null;
  has_listed_bands: boolean;
  start_time: string | null;
  end_time: string | null;
  is_24x7: boolean | null;
  closed_days: string | null;
  has_floodlights: boolean | null;
  is_covered: boolean | null;
  parking_available: boolean | null;
  washroom_available: boolean | null;
  changing_room_available: boolean | null;
  has_cafeteria: boolean | null;
  has_drinking_water: boolean | null;
  equipment_provided: boolean | null;
  description: string | null;
  number_of_grounds: number | null;
  surface_type: string | null;
  formats: string[] | null;
  whatsapp_phone: string | null;
  /**
   * The numbers the Call button picks from, first dialable one wins (lib/my/numbers.ts
   * shownCallNumber). From 20261028_owner_call_number.sql, missing on an older database,
   * where the editor shows no call field.
   */
  owner_phone?: string | null;
  landline_phone?: string | null;
  /** contact_info.phone */
  contact_phone?: string | null;
};
/** One of the latest reviews on /my: a TapTurf report (with its scorecard) or a Google review. */
export type OwnerRecentReview = {
  id?: string;
  rating: number;
  comment: string | null;
  /** The player's public name (as the turf page shows it), or the Google reviewer's. */
  author: string;
  source: string;
  created_at: string;
} & ReportFields;

/**
 * owner_dashboard.reviews. The keys after recent come with game reports
 * (20261027_game_reports.sql), always over the last 90 days, and are
 * missing on an older database.
 */
export type OwnerReviews = {
  tapturf: number;
  recent: OwnerRecentReview[];
  window_days?: number;
  n?: number;
  average?: number | null;
  play_again?: { yes: number; maybe: number; no: number };
  verified?: number;
  aspects?: Omit<AspectCount, "tags">[];
  /** tag null: rated Needs work with no reason picked. */
  fix_first?: { aspect: AspectId; tag: string | null; n: number; last_at: string }[];
  love?: { aspect: AspectId; tag: string; n: number }[];
  /** Private notes, once they arrived. Unnamed ones arrive in batches of 3 or more players and say "A player" (or a context 3 of the batch share) and the month. */
  notes?: { context: string | null; month: string; name: string | null; rating_word: string | null; body: string }[];
};

export type OwnerDashboard =
  | { error: string }
  | {
      days: number;
      turf: OwnerTurf;
      series: DayStat[];
      prev: { views: number; calls: number; whatsapp: number; ask: number };
      ask: number;
      games: { hosted: number; upcoming: number };
      reviews: OwnerReviews;
      edits: { created_at: string; fields: string[] }[];
    };
