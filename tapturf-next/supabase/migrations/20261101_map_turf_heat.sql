-- Where turfs get the most views, and which are trending, for the
-- "Popular" and "Trending" chips on /map.
--
-- The site owner asked (1 Nov) for a heatmap on /map of which turfs get
-- the most views, then for which are trending in the last 24 hours if
-- there is enough data. Turf page views are counted per turf per India day
-- in public.turf_daily_views (20261019_mytapturf.sql), which nobody but
-- the server's own functions can read. This file adds two functions that
-- give out only a coarse level or a rank per turf, never a count.
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
-- public.map_turf_trending() (anon and authenticated may call it): the
-- turfs most viewed in the last 24 hours. The views table keeps one total
-- per turf per India day, no hours, so the last 24 hours are estimated:
-- today's views so far (all inside the window), plus yesterday's scaled by
-- the share of yesterday still inside it (at 18:00 India time that is its
-- last quarter: yesterday's views times 0.25). That assumes a day's views
-- spread evenly through it; the estimate is exact at India midnight and
-- runs on across it without a jump. A turf trends when its estimate is 3
-- or more and beats its own daily average over the 7 India days before
-- yesterday (days with no row count as none), so trending means rising,
-- not just always busy. Only active turfs with a map point count. They are
-- ranked by the estimate (1 the most viewed; the same estimate shares a
-- rank) and the top 10 come back as turf_id and rank, never a count. Fewer
-- than 5 trending turfs is too little to call anything trending: then no
-- rows at all. The same rules, in TypeScript with unit tests:
-- lib/map/trending.ts. Sized on aggregate counts only: on 1 Nov at 13:46
-- India time this query, counted, found 15 trending turfs; over 22 to 31
-- Oct, estimated at 06:00, 12:00 and 18:00 each day (today's share taken
-- from the day's total the same even way), 0 to 16, and 5 or more at all
-- three times on each of the last four days.
--
-- The app reads them through GET /api/map/heat (cached an hour) and GET
-- /api/map/trending (cached 10 minutes), which put each level or rank on
-- its turf's map point; the page asks for one only when a visitor turns
-- its chip on. The app works before this file is applied: the routes find
-- no function (PGRST202), answer with nothing, and the page says there are
-- not enough views yet.
--
-- Additive: two new functions; no table, view, grant or existing function
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

create or replace function public.map_turf_trending()
returns table (turf_id uuid, rank smallint)
language sql
stable
security definer
set search_path = ''
as $$
  with w as (
    -- India's today, and the share of its yesterday still inside the last 24 hours (1 at midnight, 0 by the next).
    select k.at::date as today, 1 - extract(epoch from (k.at - k.at::date)) / 86400 as share
    from (select now() at time zone 'Asia/Kolkata' as at) k
  ),
  v as (
    select d.turf_id,
      coalesce(sum(d.views) filter (where d.day = w.today), 0)
        + coalesce(sum(d.views) filter (where d.day = w.today - 1), 0) * w.share as est,
      coalesce(sum(d.views) filter (where d.day < w.today - 1), 0) / 7.0 as base
    from public.turf_daily_views d
    cross join w
    join public.turfs t on t.id = d.turf_id
    where d.day between w.today - 8 and w.today
      and t.is_active
      and t.lat is not null and t.lng is not null
      and not (t.lat = 0 and t.lng = 0)
    group by d.turf_id, w.today, w.share
  ),
  r as (
    select v.turf_id, rank() over (order by v.est desc) as rk, count(*) over () as n
    from v
    where v.est >= 3 and v.est > v.base
  )
  select r.turf_id, r.rk::smallint as rank
  from r
  where r.n >= 5 and r.rk <= 10
  order by r.rk, r.turf_id;
$$;

revoke all on function public.map_turf_trending() from public;
grant execute on function public.map_turf_trending() to anon, authenticated;
