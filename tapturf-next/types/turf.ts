export interface Turf {
  id: string;
  name: string;
  address: string;
  description: string | null;
  sports: string[];
  amenities: string[];
  images: string[];
  cover_image: string | null;
  signboard_image: string | null;
  entry_parking_image: string | null;

  // Contact
  contact_info: { phone?: string; email?: string; website?: string } | null;
  owner_name: string | null;
  owner_phone: string | null;
  preferred_booking_channel: string | null;

  // Pricing
  morning_price: number | null;
  afternoon_price: number | null;
  evening_price: number | null;
  weekend_morning_price: number | null;
  weekend_afternoon_price: number | null;
  weekend_evening_price: number | null;

  // Ratings
  rating: number;
  total_reviews: number;
  external_review_url: string | null;

  // Facility details
  height_feet: number | null;
  length_feet: number | null;
  width_feet: number | null;
  grass_condition: string | null;
  net_condition: string | null;
  equipment_provided: boolean | null;
  parking_available: boolean | null;
  washroom_available: boolean | null;
  changing_room_available: boolean | null;
  sitting_area_available: boolean | null;
  number_of_grounds: number | null;
  unique_features: string | null;

  // Operations
  start_time: string | null;
  end_time: string | null;
  gmap_embed_link: string | null;
  nearby_landmark: string | null;

  // Location
  lat: number | null;
  lng: number | null;
  city: string | null; // 'nashik' | 'pune' (see lib/city.ts)

  // Enrichment added by data ops on 2026-09-25
  // (migration add_turf_trust_provenance_fields_20260925). All nullable.
  surface_type: string | null;                    // e.g. "artificial grass"
  ground_format: string | null;                   // e.g. "5-a-side, 6-a-side"
  is_covered: boolean | null;                     // true or NULL (false is never written)
  has_floodlights: boolean | null;                // true or NULL
  has_drinking_water: boolean | null;             // true or NULL
  has_cafeteria: boolean | null;                  // true or NULL
  coaching_available: boolean | null;             // true or NULL
  opening_hours: OpeningHours | null;             // {daily: "..."} or per-day
  price_mentions: PriceMention[] | null;          // reviewer-reported, unverified
  data_sources: DataSources | null;               // provenance per field
  field_confidence: FieldConfidence | null;       // "high" | "low", with _default fallback
  data_verified_at: string | null;                // ISO timestamp, IST via toIST()

  // System
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type DayName =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";
export type OpeningHours = { daily: string } | Partial<Record<DayName, string>>;
export type PriceMention = {
  price_inr: number;
  context: string;
  date: string;
  source: string;
  confidence: "low" | "high";
};
export type FieldConfidence = { _default: "high" | "low" } & Record<
  string,
  "high" | "low"
>;
export type DataSources = Record<
  string,
  string | string[] | Record<string, string>
>;
