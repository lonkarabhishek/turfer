-- Migration: Add detailed turf information columns
-- Run this in Supabase SQL Editor

-- Dimensions
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS height_feet INTEGER;
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS length_feet INTEGER;
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS width_feet INTEGER;

-- Timing (start_time and end_time as TIME columns)
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS end_time TIME;

-- Pricing (you already have price_per_hour and price_per_hour_weekend, so we'll use those)
-- No changes needed for pricing as you already have:
-- - price_per_hour (weekday price)
-- - price_per_hour_weekend (weekend price)

-- Equipment and Facilities
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS equipment_provided BOOLEAN DEFAULT false;
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS net_condition TEXT CHECK (net_condition IN ('excellent', 'good', 'fair', 'needs_replacement'));
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS grass_condition TEXT CHECK (grass_condition IN ('excellent', 'good', 'fair', 'needs_maintenance'));

-- Location details (you already have lat, lng, address, and "Gmap Embed link")
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS nearby_landmark TEXT;

-- Additional facilities (parking, washroom already exist in amenities JSONB, but adding as booleans for easier querying)
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS parking_available BOOLEAN DEFAULT false;
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS washroom_available BOOLEAN DEFAULT false;
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS changing_room_available BOOLEAN DEFAULT false;
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS sitting_area_available BOOLEAN DEFAULT false;

-- Turf capacity
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS number_of_grounds INTEGER DEFAULT 1;

-- Owner information (contact_info already exists as JSONB, but adding specific columns)
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS owner_phone TEXT;
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS preferred_booking_channel TEXT CHECK (preferred_booking_channel IN ('whatsapp', 'call', 'both', 'online'));

-- Additional images (you already have images JSONB and cover_image)
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS signboard_image TEXT;
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS entry_parking_image TEXT;

-- Unique features
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS unique_features TEXT;

-- Add helpful comments
COMMENT ON COLUMN public.turfs.height_feet IS 'Height of the turf enclosure in feet';
COMMENT ON COLUMN public.turfs.length_feet IS 'Length of the turf in feet';
COMMENT ON COLUMN public.turfs.width_feet IS 'Width of the turf in feet';
COMMENT ON COLUMN public.turfs.start_time IS 'Daily opening time';
COMMENT ON COLUMN public.turfs.end_time IS 'Daily closing time';
COMMENT ON COLUMN public.turfs.equipment_provided IS 'Whether balls, nets, etc. are provided';
COMMENT ON COLUMN public.turfs.net_condition IS 'Condition of nets';
COMMENT ON COLUMN public.turfs.grass_condition IS 'Condition of grass/turf surface';
COMMENT ON COLUMN public.turfs.nearby_landmark IS 'Nearby landmark for directions';
COMMENT ON COLUMN public.turfs.number_of_grounds IS 'Number of separate playing areas/boxes';
COMMENT ON COLUMN public.turfs.owner_name IS 'Turf owner name';
COMMENT ON COLUMN public.turfs.owner_phone IS 'Owner contact number';
COMMENT ON COLUMN public.turfs.preferred_booking_channel IS 'Preferred booking method';
COMMENT ON COLUMN public.turfs.signboard_image IS 'URL of turf signboard photo';
COMMENT ON COLUMN public.turfs.entry_parking_image IS 'URL of entry/parking area photo';
COMMENT ON COLUMN public.turfs.unique_features IS 'Special features of this turf';

-- Create indexes for commonly queried columns
CREATE INDEX IF NOT EXISTS idx_turfs_equipment ON public.turfs(equipment_provided);
CREATE INDEX IF NOT EXISTS idx_turfs_parking ON public.turfs(parking_available);
CREATE INDEX IF NOT EXISTS idx_turfs_price_weekday ON public.turfs(price_per_hour);
CREATE INDEX IF NOT EXISTS idx_turfs_price_weekend ON public.turfs(price_per_hour_weekend);
