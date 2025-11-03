-- Add turf_booked column to games table
-- This column indicates whether the turf has already been booked by the host

ALTER TABLE games
ADD COLUMN IF NOT EXISTS turf_booked BOOLEAN DEFAULT false;

-- Add a comment to explain the column
COMMENT ON COLUMN games.turf_booked IS 'Indicates whether the turf has already been booked for this game';
