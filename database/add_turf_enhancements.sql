-- Add optional enhancements to turfs table for bulk data import
-- Run this in Supabase SQL Editor

-- 1. Add external review link (for Google Reviews, etc.)
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS external_review_url TEXT;

-- 2. Add cover/primary image for quick access
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS cover_image TEXT;

-- 3. Create index for rating-based searches
CREATE INDEX IF NOT EXISTS idx_turfs_rating ON turfs(rating DESC);

-- 4. Add comment for documentation
COMMENT ON COLUMN turfs.external_review_url IS 'URL to external reviews (Google Maps, etc.)';
COMMENT ON COLUMN turfs.cover_image IS 'Primary/cover image URL for quick display';
