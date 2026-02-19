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

  // System
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
