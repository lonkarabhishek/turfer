-- Migration: Add time-based pricing columns
-- Run this in Supabase SQL Editor

-- Add time-based pricing columns
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS morning_price DECIMAL(10,2);
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS afternoon_price DECIMAL(10,2);
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS evening_price DECIMAL(10,2);

-- Add weekend time-based pricing
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS weekend_morning_price DECIMAL(10,2);
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS weekend_afternoon_price DECIMAL(10,2);
ALTER TABLE public.turfs ADD COLUMN IF NOT EXISTS weekend_evening_price DECIMAL(10,2);

-- Add comments
COMMENT ON COLUMN public.turfs.morning_price IS 'Weekday morning price (typically 6am-12pm)';
COMMENT ON COLUMN public.turfs.afternoon_price IS 'Weekday afternoon price (typically 12pm-6pm)';
COMMENT ON COLUMN public.turfs.evening_price IS 'Weekday evening price (typically 6pm-12am)';
COMMENT ON COLUMN public.turfs.weekend_morning_price IS 'Weekend morning price';
COMMENT ON COLUMN public.turfs.weekend_afternoon_price IS 'Weekend afternoon price';
COMMENT ON COLUMN public.turfs.weekend_evening_price IS 'Weekend evening price';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_turfs_morning_price ON public.turfs(morning_price);
CREATE INDEX IF NOT EXISTS idx_turfs_evening_price ON public.turfs(evening_price);
