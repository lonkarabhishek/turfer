import { createServerClient } from "@/lib/supabase/server";
import { convertGoogleDriveUrl, convertImageUrls } from "@/lib/utils/images";
import type { Turf } from "@/types/turf";

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  const images = convertImageUrls(
    rawImages.flatMap((img: string) =>
      typeof img === "string"
        ? img.split(",").map((u) => u.trim()).filter(Boolean)
        : []
    )
  );

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
    cover_image: raw.cover_image
      ? convertGoogleDriveUrl(raw.cover_image)
      : null,
    signboard_image: raw.signboard_image
      ? convertGoogleDriveUrl(raw.signboard_image)
      : null,
    entry_parking_image: raw.entry_parking_image
      ? convertGoogleDriveUrl(raw.entry_parking_image)
      : null,
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
    is_active: raw.is_active ?? true,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export async function getAllActiveTurfs(): Promise<Turf[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("turfs")
    .select("*")
    .eq("is_active", true)
    .order("rating", { ascending: false });

  if (error) {
    console.error("Failed to fetch turfs:", error);
    return [];
  }

  return (data ?? []).map(transformTurf);
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

export async function getTurfsBySport(sport: string): Promise<Turf[]> {
  const supabase = createServerClient();
  // Fetch all active turfs and filter client-side because the sports field
  // stores comma-separated values inside array elements
  const { data, error } = await supabase
    .from("turfs")
    .select("*")
    .eq("is_active", true)
    .order("rating", { ascending: false });

  if (error) {
    console.error("Failed to fetch turfs by sport:", error);
    return [];
  }

  const turfs = (data ?? []).map(transformTurf);
  const sportLower = sport.toLowerCase();

  return turfs.filter((turf) =>
    turf.sports.some((s) => s.toLowerCase().includes(sportLower))
  );
}

export async function getAllTurfIds(): Promise<string[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("turfs")
    .select("id")
    .eq("is_active", true);
  return (data ?? []).map((t) => t.id);
}
