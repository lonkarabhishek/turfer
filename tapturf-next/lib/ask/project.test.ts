import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeShards, shardOf, toAskTurf } from "./project";
import { forCard } from "../utils/cardTurf";
import { summarisePrice } from "../utils/prices";
import { areaFor } from "../utils/area";
import { compareTopRated } from "../utils/ranking";
import { resolveTurfNames } from "../ai/names";
import type { Turf } from "../../types/turf";

// Field lengths at the long end of the turfs table (October 2026: cover
// URLs up to 208 characters, addresses averaging 86 and up to 250, names
// up to 98), every price, flag and amenity set: a worst-case row.
const LIMIT = 1.5 * 1024 * 1024;
const GROWTH = 5000;
const SHARDS = 8;

function row(i: number): Turf {
  const id = `${(i * 2654435761 % 4294967296).toString(16).padStart(8, "0")}-1c2d-4e5f-8a9b-${String(i).padStart(12, "0")}`;
  return {
    id,
    slug: `the-royal-multisports-turf-and-cricket-academy-${i}`,
    name: `The Royal MultiSports Turf and Cricket Academy ${i}`,
    address: `Survey No. 123/4, Behind Big Bazaar, Near Shivaji Chowk, Pathardi Phata, Gangapur Road, Nashik, Maharashtra 422009, India ${i}`,
    description: "A long description that Ask never reads. ".repeat(12),
    sports: ["Box Cricket", "Football", "Pickleball"],
    amenities: ["Floodlights", "Parking", "Washroom", "Changing Room", "Drinking Water", "Seating Area", "Cafeteria"],
    images: Array.from({ length: 8 }, (_, k) => `https://lh3.googleusercontent.com/gps-cs-s/AC9h4npExampleTokenThatIsQuiteLong${k}${"x".repeat(150)}=w1600-h1200`),
    cover_image: `https://hwfsbpzercuoshodmnuf.supabase.co/storage/v1/object/public/turf-photos/${id}/0123456789abcdef01234567.webp${"?v=1".repeat(10)}`,
    signboard_image: null,
    entry_parking_image: null,
    contact_info: { phone: "+91 98765 43210" },
    owner_name: "Owner",
    owner_phone: "+91 98765 43210",
    preferred_booking_channel: "whatsapp",
    morning_price: 800,
    afternoon_price: 900,
    evening_price: 1200,
    weekend_morning_price: 1000,
    weekend_afternoon_price: 1100,
    weekend_evening_price: 1400,
    rating: 4.6,
    total_reviews: 300 + i,
    external_review_url: "https://maps.google.com/?cid=1234567890123456789",
    height_feet: 40,
    length_feet: 100,
    width_feet: 60,
    grass_condition: "good",
    net_condition: "good",
    equipment_provided: true,
    parking_available: true,
    washroom_available: true,
    changing_room_available: true,
    sitting_area_available: true,
    number_of_grounds: 2,
    unique_features: "Rooftop",
    start_time: "06:00:00",
    end_time: "23:00:00",
    gmap_embed_link: "https://www.google.com/maps/embed?pb=" + "x".repeat(300),
    nearby_landmark: "Big Bazaar",
    lat: 19.987654321,
    lng: 73.765432109,
    city: "nashik",
    area: "Pathardi Phata",
    surface_type: "artificial grass",
    ground_format: "6-a-side",
    is_covered: true,
    has_floodlights: true,
    has_drinking_water: true,
    has_cafeteria: true,
    coaching_available: true,
    opening_hours: { daily: "6 AM to 11 PM" },
    price_mentions: [
      { price_inr: 1000, context: "Reviewer said a thousand for an hour on a weekday evening", source: "google" },
      { text: "Rates go up on weekends, around fourteen hundred", source: "web", source_url: "https://example.com/" },
      { price_inr: 1200, context: "Paid twelve hundred", source: "google" },
    ],
    data_sources: { prices: "owner" },
    field_confidence: { _default: "high" },
    data_verified_at: "2026-10-01T00:00:00Z",
    price_unit: "per_hour",
    slot_minutes: 60,
    day_night_cutoff: "18:00:00",
    is_24x7: true,
    closed_days: null,
    membership_required: false,
    access_notes: null,
    landline_phone: null,
    whatsapp_phone: "+91 98765 43210",
    website_url: "https://example.com",
    instagram_url: "https://instagram.com/example",
    google_place_id: "ChIJ" + "x".repeat(23),
    description_source: "owner",
    description_updated_at: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
}

const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v));

test(`compact rows for ${GROWTH} turfs fit in ${SHARDS} cache pieces under 1.5 MB each`, () => {
  const all = Array.from({ length: GROWTH }, (_, i) => row(i));
  const compact = all.map(toAskTurf);
  const full = bytes(all);
  const small = bytes(compact);
  const pieces = Array.from({ length: SHARDS }, (_, s) => compact.filter((t) => shardOf(t.id, SHARDS) === s));
  const sizes = pieces.map(bytes);
  console.log(`full ${(full / 1e6).toFixed(2)} MB, compact ${(small / 1e6).toFixed(2)} MB (${Math.round(small / GROWTH)} B/turf), largest piece ${(Math.max(...sizes) / 1e6).toFixed(2)} MB`);
  // Real rows average about 760 bytes; this worst case is about 1.25 KB.
  assert.ok(small / GROWTH < 1300, "a compact row should stay near 1 KB even at worst");
  assert.ok(small < full / 3);
  assert.equal(pieces.flat().length, GROWTH);
  for (const s of sizes) assert.ok(s < LIMIT, `piece of ${s} bytes`);
});

test("pieces split evenly and always put a turf in the same piece", () => {
  const ids = Array.from({ length: 4000 }, (_, i) => row(i).id);
  const counts = new Array(SHARDS).fill(0);
  for (const id of ids) counts[shardOf(id, SHARDS)]++;
  assert.ok(Math.max(...counts) < (ids.length / SHARDS) * 1.3, `uneven pieces ${counts}`);
  assert.equal(shardOf(ids[7], SHARDS), shardOf(ids[7], SHARDS));
  assert.equal(shardOf("not-a-uuid", SHARDS), shardOf("not-a-uuid", SHARDS));
});

test("merged pieces come back in getAllActiveTurfs() order", () => {
  const all = Array.from({ length: 300 }, (_, i) => ({ ...row(i), rating: [4.6, 4.2, 0][i % 3], total_reviews: [10, 300, 40][i % 4] ?? 0 })).map(toAskTurf);
  const parts = Array.from({ length: SHARDS }, (_, s) => all.filter((t) => shardOf(t.id, SHARDS) === s));
  const merged = mergeShards(parts.reverse());
  const expected = [...all].sort((a, b) => a.id.localeCompare(b.id)).sort(compareTopRated);
  assert.deepEqual(merged.map((t) => t.id), expected.map((t) => t.id));
});

test("the compact row gives the same card, price label, area and name match", () => {
  const t = row(3);
  const c = toAskTurf(t);
  const card = forCard(t) as unknown as Record<string, unknown>;
  // The chat card shows the cover; the other photos are not kept.
  assert.deepEqual({ ...(forCard(c) as unknown as Record<string, unknown>), images: card.images }, card);
  assert.deepEqual(summarisePrice(c), summarisePrice(t));
  assert.equal(areaFor(c), areaFor(t));
  assert.equal(resolveTurfNames([c], ["Royal Multisports"], "nashik")[0].turf?.id, t.id);

  const noCover = toAskTurf({ ...t, cover_image: null, has_floodlights: null, amenities: [] });
  assert.deepEqual(noCover.images, [t.images[0]]);
  assert.equal("has_floodlights" in noCover, false);
  assert.equal("amenities" in noCover, false);
});
