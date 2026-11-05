-- Turf page views per turf, for the admin's "No phone" list.
--
-- The site owner approved (5 Nov) the admin's No phone list showing the
-- turf pages that show no Call and no WhatsApp, most viewed over the last
-- 28 days first, with the views, so the numbers worth finding first are on
-- top. Turf page views are counted per turf per India day in
-- public.turf_daily_views (20261019_mytapturf.sql), which nobody but the
-- server's own functions can read; the map's functions
-- (20261101_map_turf_heat.sql, 20261102_map_trending_window.sql) give out
-- only a level or a rank, never a count. This file adds one read for the
-- site owner.
--
-- public.admin_turf_views(p_firebase_token, p_days) (site owner only,
-- public._is_site_owner, as every admin read): jsonb {"days": n, "since":
-- "YYYY-MM-DD", "today": "YYYY-MM-DD", "views": {"<turf id>": views, ...}}:
-- for each active turf with at least one view, its turf page views over
-- the last p_days India days, today included (today and the p_days - 1
-- before it). p_days is 28 by default, and kept to 1 to 90. One jsonb
-- answer, not a set of rows, so PostgREST's row cap (1,000) never cuts it:
-- about 3,800 active turfs, 2,433 with a view in 14 days on 1 Nov. Nothing
-- about a person: turf ids and counts only.
--
-- Which turfs show no number is decided in the app, by the rule the turf
-- page's Call and WhatsApp buttons read (lib/utils/contact.ts), not here,
-- so the list and the pages never disagree (lib/admin/noPhone.ts,
-- npm run test:trend).
--
-- The app works before this file is applied: the read finds no function
-- (PGRST202), and the list shows by name, saying the views need this file.
--
-- Additive: one new function; no table, view, grant or existing function
-- is touched. Written without the destructive SQL keywords. Safe to run
-- again. Check: scripts/sql-tests/admin_turf_views.check.mjs.

create or replace function public.admin_turf_views(p_firebase_token text default null, p_days integer default 28)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_days integer := least(greatest(coalesce(p_days, 28), 1), 90);
  v_since date := v_today - (least(greatest(coalesce(p_days, 28), 1), 90) - 1);
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'days', v_days,
    'since', v_since::text,
    'today', v_today::text,
    'views', coalesce((
      select jsonb_object_agg(v.turf_id::text, v.n)
        from (select d.turf_id, sum(d.views)::bigint as n
                from public.turf_daily_views d
                join public.turfs t on t.id = d.turf_id
               where d.day between v_since and v_today
                 and t.is_active
               group by d.turf_id
              having sum(d.views) > 0) v
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.admin_turf_views(text, integer) from public;
grant execute on function public.admin_turf_views(text, integer) to anon, authenticated;
