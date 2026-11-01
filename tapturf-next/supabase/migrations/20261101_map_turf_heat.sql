-- Where turfs get the most views, for the "Popular" layer on /map.
--
-- The site owner asked (1 Nov) for a heatmap on /map of which turfs get
-- the most views. Turf page views are counted per turf per India day in
-- public.turf_daily_views (20261019_mytapturf.sql), which nobody but the
-- server's own functions can read. This file adds one function that gives
-- out only a coarse level per turf, never a count.
--
-- public.map_turf_heat() (anon and authenticated may call it): one row per
-- active turf with a map point (lat and lng set, and not 0,0) that had at
-- least 3 views over the last 30 India days (today and the 29 before it):
-- turf_id and level, 1 to 5, its rank among those turfs by views
-- (1 + floor(percent_rank * 5), capped at 5: the least viewed of them is
-- 1, the most viewed 5, and turfs with the same views share a level).
-- Turfs under 3 views are left out: a view or two may be the owner or a
-- friend checking the page. On 1 Nov: 2,433 located active turfs had any
-- view in the 14 days counted so far, 476 had 3 or more, the median 1.
--
-- The app reads it through GET /api/map/heat (cached an hour), which puts
-- each level on its turf's map point; the page asks for that only when a
-- visitor turns the layer on. The app works before this file is applied:
-- the route finds no function (PGRST202), answers with no points, and the
-- page says there are not enough views yet.
--
-- Additive: one new function; no table, view, grant or existing function
-- is touched. Written without the destructive SQL keywords. Safe to run
-- again. Check: scripts/sql-tests/map_turf_heat.check.mjs.

create or replace function public.map_turf_heat()
returns table (turf_id uuid, level smallint)
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select d.turf_id, sum(d.views)::bigint as n
    from public.turf_daily_views d
    join public.turfs t on t.id = d.turf_id
    where d.day >= (now() at time zone 'Asia/Kolkata')::date - 29
      and t.is_active
      and t.lat is not null and t.lng is not null
      and not (t.lat = 0 and t.lng = 0)
    group by d.turf_id
    having sum(d.views) >= 3
  )
  select v.turf_id, least(5, 1 + floor(percent_rank() over (order by v.n) * 5))::smallint as level
  from v
  order by level desc, v.turf_id;
$$;

revoke all on function public.map_turf_heat() from public;
grant execute on function public.map_turf_heat() to anon, authenticated;
