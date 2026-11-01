-- Views of each live scorecard, kept for later, for the admin.
--
-- The site owner asked (1 Nov) to see how many times each live scorecard
-- (/live/<code>) was viewed, and to keep the count after the match itself
-- is gone: the hourly job clears a match 30 days after its last update
-- (20261021_live_matches.sql), so the counts live in a table of their own
-- that nothing clears.
--
-- What a view is, as the app decides it (lib/live/views.ts): the page
-- shows a score (live or finished) and is on screen, the browser is not a
-- bot or an automated one, and it is not the scorer's own (it holds the
-- link). The same browser opening the same link again within 30 minutes
-- is the same view. A view is unique when it is the browser's first of
-- the day (India's day) for that link; the browser keeps that note
-- itself and sends only yes or no. Nothing about the viewer reaches the
-- database: no id, no network address or hash, no agent.
--
-- 1. private.live_link_views: one row per link that was viewed: the code,
--    how many views (views) and unique daily viewers (viewers, at most
--    views), and when it was first and last viewed.
-- 2. public.live_view_add (live write key only): one view, unique or not,
--    for a link that shows a score (live or finished, a write taken, its
--    match still held). {r: 'ok', views, viewers} with the new counts;
--    'none' for any other link (waiting, turned off, expired, unknown);
--    'bad'; 'unavailable' (a wrong key). The server calls it from
--    POST /api/live/<code>/views after its own checks (the agent, a
--    prefetch, per-network limits).
-- 3. public.live_view_count (live write key only): {r: 'ok', views,
--    viewers} for a link, 0 and 0 before its first view, for the count the
--    follower page and the scorer show (GET /api/live/<code>/views).
-- 4. public.admin_live_views (site owner only): every viewed link's
--    counts and times, for /admin/live and the admin home's "Live
--    scoreboards shared" tile. Kept whatever became of the link.
--
-- The app works before this file is applied: the routes find no function
-- (PGRST202) and answer with no count, the pages show none and the admin
-- shows "-". Apply it before or after the app deploy; views are counted
-- from when both are in.
--
-- Additive: one table in the private schema and new functions; no live
-- function or job is touched. Written without the destructive SQL
-- keywords. Safe to run again. Check: scripts/sql-tests/live_views.check.mjs.

create table if not exists private.live_link_views (
  code text primary key check (code ~ '^[a-z0-9]{12}$'),
  views bigint not null default 0 check (views >= 0),
  viewers bigint not null default 0 check (viewers >= 0 and viewers <= views),
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now()
);
revoke all on private.live_link_views from public, anon, authenticated;

-- One statement: two views of a new link at once both count (the second
-- takes the conflict path), and no count is ever read and written back.
create or replace function public.live_view_add(p_key text, p_code text, p_unique boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_views bigint;
  v_viewers bigint;
  v_one integer := case when p_unique is true then 1 else 0 end;
begin
  if not private.live_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_code is null or p_code !~ '^[a-z0-9]{12}$' then
    return jsonb_build_object('r', 'bad');
  end if;
  -- A link showing a score: a stop marker (no write) or a link turned off
  -- or expired (its match cleared) shows none.
  if not exists (select 1 from public.live_matches m
                  where m.code = p_code and m.writes > 0 and m.status in ('live', 'done') and m.match is not null) then
    return jsonb_build_object('r', 'none');
  end if;
  insert into private.live_link_views as v (code, views, viewers)
  values (p_code, 1, v_one)
  on conflict (code) do update
     set views = v.views + 1,
         viewers = v.viewers + v_one,
         last_viewed_at = now()
  returning v.views, v.viewers into v_views, v_viewers;
  return jsonb_build_object('r', 'ok', 'views', v_views, 'viewers', v_viewers);
end;
$$;

create or replace function public.live_view_count(p_key text, p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v private.live_link_views;
begin
  if not private.live_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_code is null or p_code !~ '^[a-z0-9]{12}$' then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v from private.live_link_views x where x.code = p_code;
  return jsonb_build_object('r', 'ok', 'views', coalesce(v.views, 0), 'viewers', coalesce(v.viewers, 0));
end;
$$;

-- Callable with the anon key; the write key check inside is the gate, as for live_match_put.
revoke all on function public.live_view_add(text, text, boolean) from public;
revoke all on function public.live_view_count(text, text) from public;
grant execute on function public.live_view_add(text, text, boolean) to anon, authenticated;
grant execute on function public.live_view_count(text, text) to anon, authenticated;

-- Every viewed link, most recently viewed first. The admin joins it to the
-- links by code (admin_live_links2); a link the hourly job cleared keeps
-- its row here.
create or replace function public.admin_live_views(p_firebase_token text default null)
returns table (
  code text,
  views bigint,
  viewers bigint,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select v.code, v.views, v.viewers, v.first_viewed_at, v.last_viewed_at
    from private.live_link_views v
   order by v.last_viewed_at desc, v.code;
end;
$$;
revoke all on function public.admin_live_views(text) from public;
grant execute on function public.admin_live_views(text) to anon, authenticated;
