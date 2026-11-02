-- How many people use the map (/map), for the admin.
--
-- The site owner asked (2 Nov) to count views of the map, to see how many
-- people use it, and, when someone is signed in, to see who. Counted from
-- when both this file and the app that sends the counts are in.
--
-- What is counted, as the app decides it (lib/map/views.ts): a view of
-- /map is the page shown and on screen, from a browser that is not a bot
-- or an automated one; the same browser opening it again within 30
-- minutes is the same view. A view is unique when it is the browser's
-- first of the India day; the browser keeps that note itself and sends
-- only yes or no. A tap is a turf or game card on the map opened (its
-- link followed, from the list or the card a pin opens). A mini is the
-- "This turf on the map" card on a turf page tapped open. The server
-- (POST /api/map/views) checks the agent, prefetches and per-network
-- limits first. When the request carries a sign-in the server verified,
-- it passes the account; nothing else about the visitor reaches the
-- database: no network address or hash, no agent, no device tag, and
-- never where on the map anyone looked.
--
-- 1. private.map_use_days: one row per India day: views, unique visitors
--    (visitors, at most views), views by signed-in people (signed_views,
--    at most views), card taps (taps) and turf-page map opens (minis).
-- 2. private.map_account_days: one row per signed-in account per India
--    day it used the map: its views, taps and minis that day, and when it
--    first and last used it that day.
-- 3. public.map_view_add (account key only): one view (unique or not),
--    tap or mini, with the account the server resolved, if any (only one
--    that exists in public.users is kept; anything else counts as a
--    guest's). {r: 'ok', signed} with whether it was kept with an
--    account; 'bad' for any other kind; 'unavailable' (a wrong key).
-- 4. public.admin_map_usage (site owner only): one answer for the admin's
--    Map section: today's India day, the first day counted, totals for
--    today, the last 7 and the last 30 India days (today the last; views,
--    visitors, signed-in views and people, taps, minis), the 30-day daily
--    series (every day, 0 for a day with none), and the signed-in people
--    who used the map, most recent first (at most p_limit, 300, never over
--    1000): the account, its name and username, its views, taps and minis,
--    on how many days, and its first and last use. Never a phone number or
--    an email. people_total says how many there are in all.
--
-- Erasing an account: user_id has no foreign key (like private.tool_use_log
-- and the other private per-user tables, so nothing here cascades from
-- public.users), and the privacy page promises these rows go with the
-- account. On an erasure request, clear this table's rows for the
-- account's id by hand along with its other rows (the primary key finds
-- them). The day's counts in private.map_use_days name nobody and stay.
--
-- The app works before this file is applied: the route finds no function
-- (PGRST202) and counts nothing, quietly; the admin's Map section says
-- counting has not started. Apply it before or after the app deploy.
--
-- Additive: two tables in the private schema and new functions; no
-- existing table, function or grant is touched. Written without the
-- destructive SQL keywords. Safe to run again. Check:
-- scripts/sql-tests/map_views.check.mjs.

create table if not exists private.map_use_days (
  day date primary key,
  views bigint not null default 0 check (views >= 0),
  visitors bigint not null default 0 check (visitors >= 0 and visitors <= views),
  signed_views bigint not null default 0 check (signed_views >= 0 and signed_views <= views),
  taps bigint not null default 0 check (taps >= 0),
  minis bigint not null default 0 check (minis >= 0),
  updated_at timestamptz not null default now()
);
revoke all on private.map_use_days from public, anon, authenticated;

create table if not exists private.map_account_days (
  user_id uuid not null,
  day date not null,
  views integer not null default 0 check (views >= 0),
  taps integer not null default 0 check (taps >= 0),
  minis integer not null default 0 check (minis >= 0),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (user_id, day)
);
revoke all on private.map_account_days from public, anon, authenticated;
create index if not exists map_account_days_day on private.map_account_days (day);

-- One statement per table: two at once both count (the second takes the
-- conflict path), and no count is ever read and written back.
create or replace function public.map_view_add(p_key text, p_kind text, p_unique boolean default false, p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day constant date := (now() at time zone 'Asia/Kolkata')::date;
  v_view integer := case when p_kind = 'view' then 1 else 0 end;
  v_tap integer := case when p_kind = 'tap' then 1 else 0 end;
  v_mini integer := case when p_kind = 'mini' then 1 else 0 end;
  v_unique integer;
  v_user uuid;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_kind is null or p_kind not in ('view', 'tap', 'mini') then
    return jsonb_build_object('r', 'bad');
  end if;
  -- Only a view is ever unique.
  v_unique := case when v_view = 1 and p_unique is true then 1 else 0 end;
  -- Only an account that exists; the server passes one it just resolved.
  if p_user_id is not null then
    select u.id into v_user from public.users u where u.id = p_user_id;
  end if;

  insert into private.map_use_days as d (day, views, visitors, signed_views, taps, minis)
  values (v_day, v_view, v_unique, case when v_user is not null then v_view else 0 end, v_tap, v_mini)
  on conflict (day) do update
     set views = d.views + excluded.views,
         visitors = d.visitors + excluded.visitors,
         signed_views = d.signed_views + excluded.signed_views,
         taps = d.taps + excluded.taps,
         minis = d.minis + excluded.minis,
         updated_at = now();
  if v_user is not null then
    insert into private.map_account_days as a (user_id, day, views, taps, minis)
    values (v_user, v_day, v_view, v_tap, v_mini)
    on conflict (user_id, day) do update
       set views = a.views + excluded.views,
           taps = a.taps + excluded.taps,
           minis = a.minis + excluded.minis,
           last_at = now();
  end if;
  return jsonb_build_object('r', 'ok', 'signed', v_user is not null);
end;
$$;
-- Callable with the anon key; the account key check inside is the gate, as for tool_use_record.
revoke all on function public.map_view_add(text, text, boolean, uuid) from public;
grant execute on function public.map_view_add(text, text, boolean, uuid) to anon, authenticated;

create or replace function public.admin_map_usage(p_firebase_token text default null, p_limit integer default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today constant date := (now() at time zone 'Asia/Kolkata')::date;
  v_limit constant integer := greatest(1, least(coalesce(p_limit, 300), 1000));
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'today', v_today,
    'since', (select min(d.day) from private.map_use_days d),
    -- Today, and the last 7 and 30 India days with today the last.
    'totals', (
      select jsonb_object_agg(w.name, jsonb_build_object(
               'views', coalesce((select sum(d.views) from private.map_use_days d where d.day > v_today - w.n and d.day <= v_today), 0),
               'visitors', coalesce((select sum(d.visitors) from private.map_use_days d where d.day > v_today - w.n and d.day <= v_today), 0),
               'signed_views', coalesce((select sum(d.signed_views) from private.map_use_days d where d.day > v_today - w.n and d.day <= v_today), 0),
               'signed_people', (select count(distinct a.user_id) from private.map_account_days a where a.day > v_today - w.n and a.day <= v_today),
               'taps', coalesce((select sum(d.taps) from private.map_use_days d where d.day > v_today - w.n and d.day <= v_today), 0),
               'minis', coalesce((select sum(d.minis) from private.map_use_days d where d.day > v_today - w.n and d.day <= v_today), 0)
             ))
        from (values ('today', 1), ('d7', 7), ('d30', 30)) as w (name, n)
    ),
    -- Every one of the 30 days, oldest first.
    'daily', (
      select jsonb_agg(jsonb_build_object(
               'day', s.day,
               'views', coalesce(d.views, 0),
               'visitors', coalesce(d.visitors, 0),
               'signed_views', coalesce(d.signed_views, 0),
               'taps', coalesce(d.taps, 0),
               'minis', coalesce(d.minis, 0)
             ) order by s.day)
        from (select (v_today - g)::date as day from generate_series(0, 29) as g) s
        left join private.map_use_days d on d.day = s.day
    ),
    -- users.name is character varying: cast, as the other admin reads do. Never the phone or the email.
    'people', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.last_at desc, p.user_id)
        from (
          select a.user_id,
                 u.name::text as name,
                 n.username::text as username,
                 sum(a.views)::bigint as views,
                 sum(a.taps)::bigint as taps,
                 sum(a.minis)::bigint as minis,
                 count(*)::integer as days,
                 min(a.first_at) as first_at,
                 max(a.last_at) as last_at
            from private.map_account_days a
            left join public.users u on u.id = a.user_id
            left join public.usernames n on n.user_id = a.user_id
           group by a.user_id, u.name, n.username
           order by max(a.last_at) desc, a.user_id
           limit v_limit
        ) p
    ), '[]'::jsonb),
    'people_total', (select count(distinct a.user_id) from private.map_account_days a)
  );
end;
$$;
revoke all on function public.admin_map_usage(text, integer) from public;
grant execute on function public.admin_map_usage(text, integer) to anon, authenticated;
