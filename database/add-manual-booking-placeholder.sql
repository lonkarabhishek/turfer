-- Create placeholder turf for manual bookings
-- Run this in Supabase SQL Editor

-- Insert a special "Manual Booking" placeholder turf
-- This turf ID is used when users manually add bookings they made outside the app
INSERT INTO turfs (
  id,
  owner_id,
  name,
  address,
  lat,
  lng,
  description,
  sports,
  amenities,
  images,
  price_per_hour,
  price_per_hour_weekend,
  operating_hours,
  contact_info,
  rating,
  total_reviews,
  is_active,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000000', -- System placeholder owner
  'Manual Booking Placeholder',
  'N/A - Manual Entry',
  0,
  0,
  'This is a system placeholder for manually uploaded bookings',
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  0,
  0,
  '{}'::jsonb,
  '{}'::jsonb,
  0,
  0,
  false, -- Not active - won't show in turf listings
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Note: Manual bookings will have turf_id = '00000000-0000-0000-0000-000000000000'
-- The actual turf name will be stored in the notes field with [MANUAL] prefix
