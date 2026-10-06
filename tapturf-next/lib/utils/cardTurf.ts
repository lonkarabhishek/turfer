import type { Turf } from "@/types/turf";

/** Only what TurfCard reads, so the page doesn't ship descriptions etc. twice. */
export function forCard(t: Turf): Turf {
  return {
    id: t.id,
    name: t.name,
    address: t.address,
    area: t.area,
    city: t.city,
    rating: t.rating,
    total_reviews: t.total_reviews,
    cover_image: t.cover_image,
    images: t.images.slice(0, 4),
    sports: t.sports,
    morning_price: t.morning_price,
    afternoon_price: t.afternoon_price,
    evening_price: t.evening_price,
    weekend_morning_price: t.weekend_morning_price,
    weekend_afternoon_price: t.weekend_afternoon_price,
    weekend_evening_price: t.weekend_evening_price,
    price_mentions: t.price_mentions,
  } as Turf;
}
