-- Add new columns to turfs table for detailed turf information

-- Dimensions
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS height_feet INTEGER;
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS length_feet INTEGER;
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS width_feet INTEGER;

-- Timing
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS end_time TIME;

-- Pricing
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS price_weekday INTEGER;
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS price_weekend INTEGER;

-- Equipment and Facilities
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS equipment_provided BOOLEAN DEFAULT false;
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS net_condition TEXT; -- 'excellent', 'good', 'fair', 'needs_replacement'
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS grass_condition TEXT; -- 'excellent', 'good', 'fair', 'needs_maintenance'

-- Location details
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS exact_location TEXT; -- Google Maps link or coordinates
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS nearby_landmark TEXT;

-- Additional facilities
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS parking_available BOOLEAN DEFAULT false;
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS washroom_available BOOLEAN DEFAULT false;
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS changing_room_available BOOLEAN DEFAULT false;
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS sitting_area_available BOOLEAN DEFAULT false;

-- Turf capacity
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS number_of_grounds INTEGER DEFAULT 1;

-- Owner information
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS owner_number TEXT;
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS preferred_booking_channel TEXT; -- 'whatsapp', 'call', 'both'

-- Additional images
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS signboard_image TEXT; -- Photo of turf signboard/nameboard
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS entry_parking_image TEXT; -- Photo of entry area + parking zone

-- Unique features
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS unique_features TEXT; -- Any special features of the turf

-- Add comments for better documentation
COMMENT ON COLUMN turfs.height_feet IS 'Height of the turf in feet';
COMMENT ON COLUMN turfs.length_feet IS 'Length of the turf in feet';
COMMENT ON COLUMN turfs.width_feet IS 'Width of the turf in feet';
COMMENT ON COLUMN turfs.start_time IS 'Opening time of the turf';
COMMENT ON COLUMN turfs.end_time IS 'Closing time of the turf';
COMMENT ON COLUMN turfs.price_weekday IS 'Price per hour on weekdays in rupees';
COMMENT ON COLUMN turfs.price_weekend IS 'Price per hour on weekends in rupees';
COMMENT ON COLUMN turfs.equipment_provided IS 'Whether equipment (balls, nets, etc.) is provided';
COMMENT ON COLUMN turfs.net_condition IS 'Condition of nets: excellent, good, fair, needs_replacement';
COMMENT ON COLUMN turfs.grass_condition IS 'Condition of grass: excellent, good, fair, needs_maintenance';
COMMENT ON COLUMN turfs.exact_location IS 'Google Maps link or exact coordinates';
COMMENT ON COLUMN turfs.nearby_landmark IS 'Nearby landmark for easy location';
COMMENT ON COLUMN turfs.number_of_grounds IS 'Number of separate grounds/boxes in the turf';
COMMENT ON COLUMN turfs.owner_name IS 'Name of the turf owner';
COMMENT ON COLUMN turfs.owner_number IS 'Contact number of the turf owner';
COMMENT ON COLUMN turfs.preferred_booking_channel IS 'Preferred way to book: whatsapp, call, or both';
COMMENT ON COLUMN turfs.signboard_image IS 'Photo URL of turf signboard/nameboard';
COMMENT ON COLUMN turfs.entry_parking_image IS 'Photo URL of entry area and parking zone';
COMMENT ON COLUMN turfs.unique_features IS 'Any unique or special features of the turf';
