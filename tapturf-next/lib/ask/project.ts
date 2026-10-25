import { compareTopRated } from "../utils/ranking";
import type { Turf } from "../../types/turf";

// The cut-down turf rows Ask TapTurf keeps in memory and in Next's data
// cache. No "@/" imports so the size test compiles it on its own
// (npm run test:ask).

/**
 * Only what Ask reads: the filters (sport, area, city, prices, rating,
 * 24 hours, the needs), name matching, distance, and what TurfMiniCard
 * shows (cover or first photo, area or address, price label, slug for
 * the link). Null keys and false flags are left out: the full rows were
 * 8.5 MB, over the data cache's 2 MB limit, so every ask downloaded
 * every turf again. These are about 0.75 KB each.
 */
export function toAskTurf(t: Turf): Turf {
  const yes = (v: boolean | null | undefined) => (v === true ? true : null);
  const out: Record<string, unknown> = {
    id: t.id,
    slug: t.slug,
    name: t.name,
    address: t.address,
    area: t.area,
    city: t.city,
    lat: t.lat,
    lng: t.lng,
    rating: t.rating,
    total_reviews: t.total_reviews,
    cover_image: t.cover_image,
    // The chat card shows the cover, or the first photo when there is none.
    images: t.cover_image ? [] : t.images.slice(0, 1),
    sports: t.sports,
    amenities: t.amenities?.length ? t.amenities : null,
    morning_price: t.morning_price,
    afternoon_price: t.afternoon_price,
    evening_price: t.evening_price,
    weekend_morning_price: t.weekend_morning_price,
    weekend_afternoon_price: t.weekend_afternoon_price,
    weekend_evening_price: t.weekend_evening_price,
    // Same as forCard(): the price label only needs "a number or some text".
    price_mentions: t.price_mentions?.length ? t.price_mentions.map((m) => (m.price_inr ? { price_inr: m.price_inr } : { text: "." })) : null,
    price_unit: t.price_unit,
    slot_minutes: t.slot_minutes,
    // Ask only ever checks these for true.
    is_24x7: yes(t.is_24x7),
    has_floodlights: yes(t.has_floodlights),
    is_covered: yes(t.is_covered),
    parking_available: yes(t.parking_available),
    washroom_available: yes(t.washroom_available),
    changing_room_available: yes(t.changing_room_available),
    has_cafeteria: yes(t.has_cafeteria),
    equipment_provided: yes(t.equipment_provided),
    claimed: yes(t.claimed),
  };
  for (const k of Object.keys(out)) if (out[k] == null) delete out[k];
  return out as unknown as Turf;
}

/**
 * Which cache piece a turf lives in, from the first two hex digits of
 * its id. Ids never change, so a turf is always in the same piece and
 * pieces refreshed at different moments never drop or repeat a turf.
 */
export function shardOf(id: string, shards: number): number {
  const n = parseInt(id.slice(0, 2), 16);
  return (Number.isFinite(n) ? n : id.charCodeAt(0) || 0) % shards;
}

/** Pieces back into one list, in the order getAllActiveTurfs() returns (top rated, then id). */
export function mergeShards(parts: Turf[][]): Turf[] {
  return parts.flat().sort((a, b) => compareTopRated(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
