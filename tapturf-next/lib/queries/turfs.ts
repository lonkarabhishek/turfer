import { createReadOnlyClient as createServerClient } from "@/lib/supabase/server";
import { convertImageUrls, firstImageUrl } from "@/lib/utils/images";
import { compareTopRated } from "@/lib/utils/ranking";
import { turfPlaysSport, type SportPage } from "@/lib/sports";
import { guessCityFromAddress, isCity, type CityId } from "@/lib/city";
import type { Turf } from "@/types/turf";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Columns for list pages (cards, search, sort, near-me). select("*")
 * shipped descriptions, data_sources and field_confidence for 240+
 * turfs on every listing: /turfs was 3.4 MB of HTML. Detail pages
 * still use "*" via getTurfById().
 */
const CARD_COLUMNS = [
  "id", "name", "address", "area", "city", "sports", "images", "cover_image",
  "rating", "total_reviews", "lat", "lng",
  "morning_price", "afternoon_price", "evening_price",
  "weekend_morning_price", "weekend_afternoon_price", "weekend_evening_price",
  "price_mentions", "price_unit", "slot_minutes", "is_covered", "has_floodlights",
  "start_time", "end_time", "is_24x7", "membership_required", "is_active",
  // Ask TapTurf filters on these; forCard() drops them before pages ship them.
  "amenities", "parking_available", "washroom_available", "changing_room_available", "has_cafeteria",
  // AI cover pass: photos judged unusable are dropped from images below.
  "image_review",
].join(", ");

function transformTurf(raw: any): Turf {
  // Parse sports - handle both ["Cricket, Football"] and ["Cricket", "Football"]
  let sports: string[] = [];
  if (Array.isArray(raw.sports)) {
    sports = raw.sports.flatMap((s: string) =>
      typeof s === "string" ? s.split(",").map((x) => x.trim()) : [s]
    );
  }

  // Parse amenities
  let amenities: string[] = [];
  if (Array.isArray(raw.amenities)) {
    amenities = raw.amenities.filter(
      (a: unknown) => typeof a === "string" && a.trim() !== ""
    );
  }

  // Parse images
  const rawImages = Array.isArray(raw.images) ? raw.images : [];
  // convertImageUrls splits comma-joined entries, drops placeholders
  // and duplicates, and normalizes Google / Drive links.
  let images = convertImageUrls(rawImages);
  // Photos the cover pass flagged (logos, screenshots, blur) stay in the
  // row but never reach a card or gallery.
  if (Array.isArray(raw.image_review)) {
    const bad = new Set(
      (raw.image_review as { url?: string; usable?: boolean }[])
        .filter((r) => r && r.usable === false && typeof r.url === "string")
        .map((r) => r.url as string),
    );
    if (bad.size) {
      const kept = images.filter((u) => !bad.has(u));
      if (kept.length) images = kept;
    }
  }

  // Parse contact_info - can be string or object
  let contactInfo = raw.contact_info;
  if (typeof contactInfo === "string") {
    try {
      contactInfo = JSON.parse(contactInfo);
    } catch {
      contactInfo = null;
    }
  }

  return {
    id: raw.id,
    name: raw.name,
    address: raw.address,
    description: raw.description || null,
    sports,
    amenities,
    images,
    cover_image: firstImageUrl(raw.cover_image),
    signboard_image: firstImageUrl(raw.signboard_image),
    entry_parking_image: firstImageUrl(raw.entry_parking_image),
    contact_info: contactInfo || null,
    owner_name: raw.owner_name || null,
    owner_phone: raw.owner_phone || null,
    preferred_booking_channel: raw.preferred_booking_channel || null,
    morning_price: raw.morning_price || null,
    afternoon_price: raw.afternoon_price || null,
    evening_price: raw.evening_price || null,
    weekend_morning_price: raw.weekend_morning_price || null,
    weekend_afternoon_price: raw.weekend_afternoon_price || null,
    weekend_evening_price: raw.weekend_evening_price || null,
    rating: Number(raw.rating) || 0,
    total_reviews: raw.total_reviews || 0,
    external_review_url: raw.external_review_url || null,
    height_feet: raw.height_feet || null,
    length_feet: raw.length_feet || null,
    width_feet: raw.width_feet || null,
    grass_condition: raw.grass_condition || null,
    net_condition: raw.net_condition || null,
    equipment_provided: raw.equipment_provided ?? null,
    parking_available: raw.parking_available ?? null,
    washroom_available: raw.washroom_available ?? null,
    changing_room_available: raw.changing_room_available ?? null,
    sitting_area_available: raw.sitting_area_available ?? null,
    number_of_grounds: raw.number_of_grounds || null,
    unique_features: raw.unique_features || null,
    start_time: raw.start_time || null,
    end_time: raw.end_time || null,
    // Handle the DB column named "Gmap Embed link" (with space)
    gmap_embed_link: raw["Gmap Embed link"] || raw.gmap_embed_link || null,
    nearby_landmark: raw.nearby_landmark || null,
    lat: raw.lat ?? null,
    lng: raw.lng ?? null,
    // Fall back to guessing from address for rows not yet backfilled.
    city: raw.city ?? guessCityFromAddress(raw.address),
    area: typeof raw.area === "string" && raw.area.trim() ? raw.area.trim() : null,
    // Trust/provenance fields — all nullable, all pass-through.
    surface_type: raw.surface_type ?? null,
    ground_format: raw.ground_format ?? null,
    is_covered: raw.is_covered ?? null,
    has_floodlights: raw.has_floodlights ?? null,
    has_drinking_water: raw.has_drinking_water ?? null,
    has_cafeteria: raw.has_cafeteria ?? null,
    coaching_available: raw.coaching_available ?? null,
    opening_hours: raw.opening_hours ?? null,
    price_mentions: Array.isArray(raw.price_mentions) ? raw.price_mentions : null,
    data_sources: raw.data_sources ?? null,
    field_confidence: raw.field_confidence ?? null,
    data_verified_at: raw.data_verified_at ?? null,
    // 2026-10-06 research columns, pass-through.
    price_unit: raw.price_unit ?? null,
    slot_minutes: raw.slot_minutes ?? null,
    day_night_cutoff: raw.day_night_cutoff ?? null,
    is_24x7: raw.is_24x7 ?? null,
    closed_days: raw.closed_days || null,
    membership_required: raw.membership_required ?? null,
    access_notes: raw.access_notes || null,
    landline_phone: raw.landline_phone || null,
    whatsapp_phone: raw.whatsapp_phone || null,
    website_url: raw.website_url || null,
    instagram_url: raw.instagram_url || null,
    google_place_id: raw.google_place_id || null,
    description_source: raw.description_source || null,
    description_updated_at: raw.description_updated_at ?? null,
    is_active: raw.is_active ?? true,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export async function getAllActiveTurfs(cityFilter?: CityId | null): Promise<Turf[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("turfs")
    .select(CARD_COLUMNS)
    .eq("is_active", true)
    .order("rating", { ascending: false });

  if (cityFilter && isCity(cityFilter)) {
    query = query.eq("city", cityFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to fetch turfs:", error);
    return [];
  }
  // Default order is "top rated" with the minimum-review rule, so a
  // 5.0 from a handful of reviews doesn't lead city / listing pages.
  return (data ?? []).map(transformTurf).sort(compareTopRated);
}

export async function getTurfById(id: string): Promise<Turf | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("turfs")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return transformTurf(data);
}

export async function getTurfsBySport(sport: SportPage): Promise<Turf[]> {
  const supabase = createServerClient();
  // Fetch all active turfs and filter here because the sports field
  // stores comma-separated values inside array elements.
  const { data, error } = await supabase
    .from("turfs")
    .select(CARD_COLUMNS)
    .eq("is_active", true)
    .order("rating", { ascending: false });

  if (error) {
    console.error("Failed to fetch turfs by sport:", error);
    return [];
  }

  // Exact label match: "Cricket" must not pull in "Box Cricket".
  return (data ?? [])
    .map(transformTurf)
    .filter((t) => turfPlaysSport(t.sports, sport))
    .sort(compareTopRated);
}

export async function getAllTurfIds(): Promise<string[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("turfs")
    .select("id")
    .eq("is_active", true);
  return (data ?? []).map((t) => t.id);
}
