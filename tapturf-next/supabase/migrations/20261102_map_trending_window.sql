-- Trending on /map picks its own window, 24 hours, 7 days or 30 days, by
-- how many views the site has.
--
-- The site owner asked (1 Nov), in this order: "for now since we dont have
-- much views count 30 days", then "Then switch to 7 days then 24 hrs later
-- / Maybe add a threshold rn itself". public.map_turf_trending()
-- (20261101_map_turf_heat.sql) ranks the turfs most viewed in the last 24
-- hours; on 1 Nov the whole site had about 476 turf page views in 24 hours,
-- 3,298 in 7 days and 4,908 in 30, too few for 24 hours to say much. This
-- file adds public.map_turf_trending_auto() (anon and authenticated may
-- call it), which picks the window itself, and leaves map_turf_trending()
-- as it is.
--
-- The window. The site's turf page views (every active turf with a map
-- point: lat and lng set, and not 0,0) are counted three ways: the last 24
-- hours, estimated as map_turf_trending() does (today's views so far, plus
-- yesterday's times the share of yesterday still inside the 24 hours, India
-- days); the last 7 days (today and the 6 India days before it); the last
-- 30 days (today and the 29 before it). The window is 24 hours once the
-- site's 24-hour estimate is 2,000 or more (day_total); else 7 days once
-- its last 7 days are 5,000 or more (week_total); else 30 days. On 1 Nov
-- that is 30 days. The site grows into 7 days and then 24 hours by itself,
-- and goes back if views fall.
--
-- In the window. 24 hours: map_turf_trending()'s rule exactly, an estimate
-- of 3 or more (min_views) that beats the turf's own daily average over the
-- 7 India days before yesterday. 7 or 30 days: 3 views or more in the
-- window; no rising rule (on so few views a week's average says little).
-- The qualifying turfs are ranked by their views in the window (the
-- estimate for 24 hours), 1 the most viewed, the same views sharing a rank
-- (rank()); the top 10 (top) come back. Fewer than 5 qualifying turfs
-- (min_turfs) is too little to call anything trending: then no turfs.
--
-- The answer is jsonb: {"window": "24h" | "7d" | "30d", "turfs":
-- [{"turf_id", "rank"}, ...]}, most viewed first. Never a count: not a
-- turf's, not the site's (the window says only which side of a threshold
-- the site is on).
--
-- To change a threshold: edit its number in the `c` row at the top of the
-- function (day_total, week_total, min_views, min_turfs, top), and the
-- constant of the same meaning in lib/map/trending.ts
-- (TRENDING_DAY_TOTAL, TRENDING_WEEK_TOTAL, TRENDING_MIN_VIEWS,
-- TRENDING_MIN_TURFS, TRENDING_TOP), whose unit tests and
-- scripts/sql-tests/map_turf_heat.check.mjs hold the edges; then run this
-- file again. To pin a window for good, set both totals so it always wins
-- (day_total 0 for 24 hours always; a week_total of 0 with a day_total out
-- of reach for 7 days always).
--
-- The app reads it through GET /api/map/trending (cached 10 minutes),
-- which puts each rank on its turf's map point and says the window, and the
-- page's legend says it ("Most viewed · last 30 days"). The app works
-- before this file is applied: the route finds no function (PGRST202) and
-- falls back to map_turf_trending(), 24 hours, as before.
--
-- The known limit in 20261101_map_turf_heat.sql's header stands: the
-- counts come from log_turf_view, which anon may call, with no cap per
-- visitor. Over 7 or 30 days a quiet turf needs as few as 3 views to rank,
-- as in 24 hours; the window decides only how long a lift lasts.
--
-- Additive: one new function; no table, view, grant or existing function
-- is touched. Written without the destructive SQL keywords. Safe to run
-- again. Check: scripts/sql-tests/map_turf_heat.check.mjs.

create or replace function public.map_turf_trending_auto()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    -- The thresholds (lib/map/trending.ts: TRENDING_DAY_TOTAL, TRENDING_WEEK_TOTAL, TRENDING_MIN_VIEWS, TRENDING_MIN_TURFS, TRENDING_TOP).
    select 2000 as day_total, 5000 as week_total, 3 as min_views, 5 as min_turfs, 10 as top
  ),
  w as (
    -- India's today, and the share of its yesterday still inside the last 24 hours (1 at midnight, 0 by the next).
    select k.at::date as today, 1 - extract(epoch from (k.at - k.at::date)) / 86400 as share
    from (select now() at time zone 'Asia/Kolkata' as at) k
  ),
  v as (
    -- Each active turf with a map point: its 24-hour estimate, its daily average over the 7 days before yesterday, its last 7 days and its last 30.
    select d.turf_id,
      coalesce(sum(d.views) filter (where d.day = w.today), 0)
        + coalesce(sum(d.views) filter (where d.day = w.today - 1), 0) * w.share as h24,
      coalesce(sum(d.views) filter (where d.day between w.today - 8 and w.today - 2), 0) / 7.0 as base,
      coalesce(sum(d.views) filter (where d.day >= w.today - 6), 0) as d7,
      sum(d.views) as d30
    from public.turf_daily_views d
    cross join w
    join public.turfs t on t.id = d.turf_id
    where d.day between w.today - 29 and w.today
      and t.is_active
      and t.lat is not null and t.lng is not null
      and not (t.lat = 0 and t.lng = 0)
    group by d.turf_id, w.today, w.share
  ),
  p as (
    -- The window: 24 hours once the site has the views for it, else 7 days once it has those, else 30 days.
    select case
      when (select coalesce(sum(v.h24), 0) from v) >= c.day_total then '24h'
      when (select coalesce(sum(v.d7), 0) from v) >= c.week_total then '7d'
      else '30d'
    end as win
    from c
  ),
  q as (
    -- The turfs that qualify in it, with their views in it.
    select v.turf_id, case p.win when '24h' then v.h24 when '7d' then v.d7 else v.d30 end as n
    from v
    cross join p
    cross join c
    where case p.win
      when '24h' then v.h24 >= c.min_views and v.h24 > v.base
      when '7d' then v.d7 >= c.min_views
      else v.d30 >= c.min_views
    end
  ),
  r as (
    select q.turf_id, rank() over (order by q.n desc) as rk, count(*) over () as qualifying
    from q
  )
  select jsonb_build_object(
    'window', p.win,
    'turfs', coalesce(
      (select jsonb_agg(jsonb_build_object('turf_id', r.turf_id, 'rank', r.rk::int) order by r.rk, r.turf_id)
       from r cross join c
       where r.qualifying >= c.min_turfs and r.rk <= c.top),
      '[]'::jsonb)
  )
  from p;
$$;

revoke all on function public.map_turf_trending_auto() from public;
grant execute on function public.map_turf_trending_auto() to anon, authenticated;
