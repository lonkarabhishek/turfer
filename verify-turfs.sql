-- Quick verification: Check if turfs exist in database

SELECT
    COUNT(*) as total_turfs,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_turfs,
    COUNT(CASE WHEN "Gmap Embed link" IS NOT NULL THEN 1 END) as turfs_with_maps
FROM public.turfs;

-- Show first 5 turfs with basic info
SELECT
    id,
    name,
    address,
    price_per_hour,
    CASE
        WHEN "Gmap Embed link" IS NOT NULL THEN 'Yes'
        ELSE 'No'
    END as has_map,
    is_active,
    created_at
FROM public.turfs
ORDER BY created_at DESC
LIMIT 5;
