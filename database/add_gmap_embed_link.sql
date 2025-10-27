-- Migration: Add gmap_embed_link column to turfs table
-- Run this in Supabase SQL Editor to add the Google Maps embed link column

ALTER TABLE turfs
ADD COLUMN IF NOT EXISTS gmap_embed_link TEXT;

-- Add a comment to document the column
COMMENT ON COLUMN turfs.gmap_embed_link IS 'Google Maps embed iframe link for displaying interactive map on turf detail page';

-- Example update (replace with actual embed links)
-- UPDATE turfs SET gmap_embed_link = 'https://www.google.com/maps/embed?...' WHERE id = 'turf_id_here';
