-- city_turf_counts says where each city is.
--
-- "Turfs in other cities" lists (the turf listing, the city home, /<city>
-- and /<city>/<sport>) put the nearest cities first, but the app only knew
-- the 96 curated centroids in lib/city.ts (CITY_COORDS). About 100 live
-- cities are not curated, so they had no point: they fell to the end of
-- every list, and a visitor in one of them got no "nearest first" at all.
--
-- The view now also returns lat and lng: the median of the city's active
-- turfs, counting only points inside India's box (6 to 37 N, 68 to 98 E),
-- so a stray 0,0 or a turf pinned abroad never pulls a city away. On 28 Oct
-- 3,725 of 3,729 active turfs had such a point, each of the 198 live cities
-- had at least one, and the medians sat within about 5 km of the curated centres
-- (Pune 18.554, 73.819 against 18.5204, 73.8567). A city whose turfs have
-- no point in the box gets null for both; the app then lists it last, as
-- before. The app prefers its curated centroid and uses these for the rest
-- (lib/city.ts cityPoint). IP and GPS detection still read only the curated
-- list.
--
-- The first two columns (city, n) are the live definition unchanged, so
-- every reader of "city, n" reads the same rows; lat and lng are appended,
-- which create or replace allows. Create or replace keeps the owner and the
-- grants. The view had no options (pg_class.reloptions was null on 28 Oct,
-- so no security_invoker), and none are set here. Safe to run again.
--
-- The app reads "city, n, lat, lng" and falls back to "city, n" when the
-- columns are missing, so the app can ship before or after this.

create or replace view public.city_turf_counts as
select
  city,
  count(*)::integer as n,
  (percentile_cont(0.5) within group (order by lat) filter (where lat between 6 and 37 and lng between 68 and 98))::double precision as lat,
  (percentile_cont(0.5) within group (order by lng) filter (where lat between 6 and 37 and lng between 68 and 98))::double precision as lng
from public.turfs
where is_active and city is not null and city <> ''
group by city;
