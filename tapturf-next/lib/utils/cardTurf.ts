import type { Turf } from "@/types/turf";

/**
 * Only what TurfCard, the listing filters and distance sorting read.
 * Turf lists are serialised into the page for the client components,
 * so every dropped field is paid for 240 times. Keys that would be
 * null are left out (JSON "null" x 30 fields x 240 turfs adds up).
 */
export function forCard(t: Turf): Turf {
  const out: Record<string, unknown> = {
    id: t.id,
    name: t.name,
    address: t.address,
    area: t.area,
    city: t.city,
    lat: t.lat,
    lng: t.lng,
    rating: t.rating,
    total_reviews: t.total_reviews,
    cover_image: t.cover_image,
    images: t.images.slice(0, 4),
    sports: t.sports,
    has_floodlights: t.has_floodlights,
    is_covered: t.is_covered,
    morning_price: t.morning_price,
    afternoon_price: t.afternoon_price,
    evening_price: t.evening_price,
    weekend_morning_price: t.weekend_morning_price,
    weekend_afternoon_price: t.weekend_afternoon_price,
    weekend_evening_price: t.weekend_evening_price,
    // Cards only need "is there a number / is there text", not the notes.
    price_mentions: t.price_mentions?.map((m) => (m.price_inr ? { price_inr: m.price_inr } : { text: "." })) ?? null,
    price_unit: t.price_unit,
    slot_minutes: t.slot_minutes,
    is_24x7: t.is_24x7,
  };
  for (const k of Object.keys(out)) if (out[k] == null) delete out[k];
  return out as unknown as Turf;
}
