-- How much traffic TapTurf has, for the admin's Traffic section.
--
-- The site owner asked (3 Nov) whether we count traffic and how much we
-- have: visits, which pages people open, and where they come from, on a
-- phone, without depending on cookie consent (Google Analytics loads only
-- after Accept). Counted by TapTurf itself from when both this file and the
-- app that sends the counts are in.
--
-- What is counted, as the app decides it (lib/traffic/traffic.ts): a view
-- is a page shown and on screen (never a prerender or a background tab),
-- the first page of a page load and every move to another page inside the
-- site, from a browser that is not a bot or an automated one, never /admin
-- or the API, never the site owner's own signed-in browsing. A visit is a
-- view that arrives from outside the site (the page load's referrer is
-- empty or another site, and it is a real navigation, not a reload or
-- Back/Forward); moving between pages inside the site is views. There is no
-- unique-visitor count: nothing is kept on the device and no network
-- address or hash of one is stored, so the same person arriving again later
-- is another visit. The source is where the page load came from, from the
-- referrer's host name and utm_source only: google, search_other, ai,
-- whatsapp, instagram, facebook, youtube, x, other_site (the other site's
-- host name, nothing else of its address, is kept for visits), app (an
-- app's referrer, android-app://<package>, that is none of those: its
-- package name is kept for visits, as a site's host is), direct (no
-- referrer), or internal (a full page load from a TapTurf page, a reload or
-- Back, or back from a sign-in: views only). The server (POST /api/traffic)
-- checks the agent, prefetches, the page's own origin and per-network
-- limits (in memory) first, and verifies a sign-in sent with the view only
-- to count it as signed in and to leave the owner's own out. Nothing about
-- the visitor reaches the database: no account, no network address or hash,
-- no agent, no device tag.
--
-- 1. private.traffic_days: per India day, page kind and source: views,
--    visits (at most views) and views by signed-in people (signed_views,
--    at most views). One upsert per view.
-- 2. private.traffic_pages: per India day and page (its path: no query,
--    no hash, at most 120 characters, or '(not found)' for a page that
--    doesn't exist): its kind, views and visits that landed on it. About
--    3000 pages a day at most; a new page past that counts under '(other)'.
-- 3. private.traffic_referrers: per India day and other site (its host
--    name) or other app (its package name, app true): visits from it.
--    About 300 a day at most; a new one past that counts under '(other)'.
-- 4. public.traffic_add (account key only): one view, with its kind, path,
--    source, the other site's host or app's package (a visit from one
--    only), whether it is a visit and whether it is signed in. {r: 'ok'};
--    'bad' for a kind, source or path that isn't one; 'unavailable' (a
--    wrong key).
-- 5. public.admin_traffic (site owner only): one answer for the admin's
--    Traffic section: today's India day, the first day counted, totals
--    (views, visits, signed_views) for today, yesterday, the last 7 full
--    days (yesterday back), the 7 before those and the last 30 full days,
--    the daily series (the last p_days full days, 30 by default, and
--    today, the last: the chart's days are the 30 days' totals, with
--    today beside them; every day, 0 for a day with none), and for today,
--    the 7 and the 30 full days: visits and views by source and by kind,
--    the top 30 pages and the top 20 other sites and apps, with how many
--    there were in all. No person in it at all: never a phone number, an
--    email or an account.
--
-- The rows name nobody: they are counts per day, page and site, kept as
-- totals. No job clears them; a later file can, by day.
--
-- The app works before this file is applied: the route finds no function
-- (PGRST202) and counts nothing, quietly; the admin's Traffic section says
-- counting has not started. Apply it before or after the app deploy.
--
-- Additive: three tables in the private schema and two new functions; no
-- existing table, function or grant is touched. Written without the
-- destructive SQL keywords. Safe to run again. Check:
-- scripts/sql-tests/traffic.check.mjs.

create table if not exists private.traffic_days (
  day date not null,
  kind text not null check (kind in ('home', 'city', 'city_sport', 'turf', 'sport', 'near_me', 'turfs_list', 'games', 'game', 'game_create', 'tools', 'blog', 'map', 'live', 'tournament', 'profile', 'dashboard', 'my', 'other')),
  source text not null check (source in ('google', 'search_other', 'ai', 'whatsapp', 'instagram', 'facebook', 'youtube', 'x', 'other_site', 'app', 'direct', 'internal')),
  views bigint not null default 0 check (views >= 0),
  visits bigint not null default 0 check (visits >= 0 and visits <= views),
  signed_views bigint not null default 0 check (signed_views >= 0 and signed_views <= views),
  updated_at timestamptz not null default now(),
  primary key (day, kind, source)
);
revoke all on private.traffic_days from public, anon, authenticated;

create table if not exists private.traffic_pages (
  day date not null,
  path text not null check (char_length(path) between 1 and 120),
  kind text not null,
  views bigint not null default 0 check (views >= 0),
  visits bigint not null default 0 check (visits >= 0 and visits <= views),
  primary key (day, path)
);
revoke all on private.traffic_pages from public, anon, authenticated;

create table if not exists private.traffic_referrers (
  day date not null,
  host text not null check (char_length(host) between 1 and 100),
  visits bigint not null default 0 check (visits >= 0),
  -- An app's package name (android-app://<package>), not a website's host.
  app boolean not null default false,
  primary key (day, host)
);
revoke all on private.traffic_referrers from public, anon, authenticated;

-- One statement per count: two at once both count (the second takes the
-- conflict path), and no count is ever read and written back. A page or a
-- site already in the day is one update; a new one is one insert (or the
-- day's '(other)' once the day has its fill).
create or replace function public.traffic_add(
  p_key text,
  p_kind text,
  p_path text,
  p_source text,
  p_host text default null,
  p_visit boolean default false,
  p_signed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day constant date := (now() at time zone 'Asia/Kolkata')::date;
  -- About this many pages and other sites a day; a new one past it counts under '(other)'.
  v_page_cap constant integer := 3000;
  v_host_cap constant integer := 300;
  v_visit integer;
  v_signed integer := case when p_signed is true then 1 else 0 end;
  v_path text := p_path;
  v_kind text := p_kind;
  v_host text;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_kind is null or p_kind not in ('home', 'city', 'city_sport', 'turf', 'sport', 'near_me', 'turfs_list', 'games', 'game', 'game_create', 'tools', 'blog', 'map', 'live', 'tournament', 'profile', 'dashboard', 'my', 'other')
     or p_source is null or p_source not in ('google', 'search_other', 'ai', 'whatsapp', 'instagram', 'facebook', 'youtube', 'x', 'other_site', 'app', 'direct', 'internal') then
    return jsonb_build_object('r', 'bad');
  end if;
  -- A page's path as the app normalises it (no query, no hash, no spaces), or a page that doesn't exist; never the admin or the API.
  if p_path is null or char_length(p_path) > 120
     or not (p_path = '(not found)' or (left(p_path, 1) = '/' and p_path !~ '[[:space:][:cntrl:]?#\\]'))
     or p_path ~ '^/(admin|api)(/|$)' then
    return jsonb_build_object('r', 'bad');
  end if;
  -- Only a view from outside the site is a visit.
  v_visit := case when p_visit is true and p_source <> 'internal' then 1 else 0 end;
  -- Another site's host name or another app's package name, only for a visit from one, and only a clean name (no address, no IP).
  if v_visit = 1 and p_source in ('other_site', 'app') and p_host is not null then
    v_host := lower(p_host);
    if char_length(v_host) > 100
       or v_host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
       or v_host ~ '^[0-9.]+$' then
      v_host := null;
    end if;
  end if;

  insert into private.traffic_days as d (day, kind, source, views, visits, signed_views)
  values (v_day, p_kind, p_source, 1, v_visit, v_signed)
  on conflict (day, kind, source) do update
     set views = d.views + 1,
         visits = d.visits + excluded.visits,
         signed_views = d.signed_views + excluded.signed_views,
         updated_at = now();

  update private.traffic_pages as p
     set views = p.views + 1, visits = p.visits + v_visit
   where p.day = v_day and p.path = v_path;
  if not found then
    if (select count(*) from private.traffic_pages p where p.day = v_day) >= v_page_cap then
      v_path := '(other)';
      v_kind := 'other';
    end if;
    insert into private.traffic_pages as p (day, path, kind, views, visits)
    values (v_day, v_path, v_kind, 1, v_visit)
    on conflict (day, path) do update
       set views = p.views + 1, visits = p.visits + excluded.visits;
  end if;

  if v_host is not null then
    update private.traffic_referrers as r
       set visits = r.visits + 1
     where r.day = v_day and r.host = v_host;
    if not found then
      if (select count(*) from private.traffic_referrers r where r.day = v_day) >= v_host_cap then
        v_host := '(other)';
      end if;
      insert into private.traffic_referrers as r (day, host, visits, app)
      values (v_day, v_host, 1, v_host <> '(other)' and p_source = 'app')
      on conflict (day, host) do update
         set visits = r.visits + 1;
    end if;
  end if;
  return jsonb_build_object('r', 'ok');
end;
$$;
-- Callable with the anon key; the account key check inside is the gate, as for map_view_add.
revoke all on function public.traffic_add(text, text, text, text, text, boolean, boolean) from public;
grant execute on function public.traffic_add(text, text, text, text, text, boolean, boolean) to anon, authenticated;

create or replace function public.admin_traffic(p_firebase_token text default null, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today constant date := (now() at time zone 'Asia/Kolkata')::date;
  v_days constant integer := greatest(7, least(coalesce(p_days, 30), 90));
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'today', v_today,
    'since', (select min(d.day) from private.traffic_days d),
    -- Today; yesterday; the last 7 full days (yesterday back) and the 7 before them; the last 30 full days.
    'totals', (
      select jsonb_object_agg(w.name, jsonb_build_object(
               'views', coalesce((select sum(d.views) from private.traffic_days d where d.day between w.a and w.b), 0),
               'visits', coalesce((select sum(d.visits) from private.traffic_days d where d.day between w.a and w.b), 0),
               'signed_views', coalesce((select sum(d.signed_views) from private.traffic_days d where d.day between w.a and w.b), 0)
             ))
        from (values ('today', v_today, v_today),
                     ('yesterday', v_today - 1, v_today - 1),
                     ('d7', v_today - 7, v_today - 1),
                     ('prev7', v_today - 14, v_today - 8),
                     ('d30', v_today - 30, v_today - 1)) as w (name, a, b)
    ),
    -- Every one of the last v_days full days (the d30 window for 30), oldest first, then today, the last.
    'daily', (
      select jsonb_agg(jsonb_build_object(
               'day', s.day,
               'views', coalesce(t.views, 0),
               'visits', coalesce(t.visits, 0),
               'signed_views', coalesce(t.signed_views, 0)
             ) order by s.day)
        from (select (v_today - g)::date as day from generate_series(0, v_days) as g) s
        left join (
          select d.day, sum(d.views) as views, sum(d.visits) as visits, sum(d.signed_views) as signed_views
            from private.traffic_days d
           where d.day >= v_today - v_days and d.day <= v_today
           group by d.day
        ) t on t.day = s.day
    ),
    -- Visits and views by source, and by kind: today, the 7 and the 30 full days. Only what has a view.
    'by_source', (
      select jsonb_object_agg(w.name, coalesce((
               select jsonb_agg(jsonb_build_object('source', x.source, 'visits', x.visits, 'views', x.views) order by x.visits desc, x.views desc, x.source)
                 from (select d.source, sum(d.visits) as visits, sum(d.views) as views
                         from private.traffic_days d
                        where d.day between w.a and w.b
                        group by d.source) x
             ), '[]'::jsonb))
        from (values ('today', v_today, v_today), ('d7', v_today - 7, v_today - 1), ('d30', v_today - 30, v_today - 1)) as w (name, a, b)
    ),
    'by_kind', (
      select jsonb_object_agg(w.name, coalesce((
               select jsonb_agg(jsonb_build_object('kind', x.kind, 'views', x.views, 'visits', x.visits) order by x.views desc, x.visits desc, x.kind)
                 from (select d.kind, sum(d.views) as views, sum(d.visits) as visits
                         from private.traffic_days d
                        where d.day between w.a and w.b
                        group by d.kind) x
             ), '[]'::jsonb))
        from (values ('today', v_today, v_today), ('d7', v_today - 7, v_today - 1), ('d30', v_today - 30, v_today - 1)) as w (name, a, b)
    ),
    -- The most viewed pages, and how many pages had a view: today, the 7 and the 30 full days.
    'pages', (
      select jsonb_object_agg(w.name, jsonb_build_object(
               'rows', coalesce((
                 select jsonb_agg(jsonb_build_object('path', x.path, 'kind', x.kind, 'views', x.views, 'visits', x.visits) order by x.views desc, x.visits desc, x.path)
                   from (select p.path, min(p.kind) as kind, sum(p.views) as views, sum(p.visits) as visits
                           from private.traffic_pages p
                          where p.day between w.a and w.b
                          group by p.path
                          order by sum(p.views) desc, sum(p.visits) desc, p.path
                          limit 30) x
               ), '[]'::jsonb),
               'total', (select count(distinct p.path) from private.traffic_pages p where p.day between w.a and w.b)
             ))
        from (values ('today', v_today, v_today), ('d7', v_today - 7, v_today - 1), ('d30', v_today - 30, v_today - 1)) as w (name, a, b)
    ),
    -- The other sites and apps by visits, and how many there were: today, the 7 and the 30 full days.
    'sites', (
      select jsonb_object_agg(w.name, jsonb_build_object(
               'rows', coalesce((
                 select jsonb_agg(jsonb_build_object('host', x.host, 'visits', x.visits, 'app', x.app) order by x.visits desc, x.host)
                   from (select r.host, sum(r.visits) as visits, bool_or(r.app) as app
                           from private.traffic_referrers r
                          where r.day between w.a and w.b
                          group by r.host
                          order by sum(r.visits) desc, r.host
                          limit 20) x
               ), '[]'::jsonb),
               'total', (select count(distinct r.host) from private.traffic_referrers r where r.day between w.a and w.b)
             ))
        from (values ('today', v_today, v_today), ('d7', v_today - 7, v_today - 1), ('d30', v_today - 30, v_today - 1)) as w (name, a, b)
    )
  );
end;
$$;
revoke all on function public.admin_traffic(text, integer) from public;
grant execute on function public.admin_traffic(text, integer) to anon, authenticated;
