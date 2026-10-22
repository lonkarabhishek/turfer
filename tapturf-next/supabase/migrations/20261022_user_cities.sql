-- Each person's city, for the admin view of users by city.
--
-- 1. private.user_cities: the city recorded for an account by the server
--    (POST and GET /api/account/me, after the reply), from the city the
--    person picked or found with GPS (the tt_city cookie), else the city
--    of their internet connection. Owner-only: never in the profile the
--    person's own browser gets, never readable through the API.
-- 2. account_note_city: the server's write, behind the account key. A
--    better source replaces a weaker one (a pick beats an internet
--    guess, which beats nothing); a pick is never replaced.
-- 3. admin_people, which takes over from admin_user_details (it returns
--    more columns, so it is a new function; the old one stays, unused,
--    because dropping a function hangs the tool these are applied with).
--    For the site owner only, it adds:
--    - signed_up_at: the real sign-up time. 26 accounts were bulk copied
--      into users with two shared created_at values, and a few more were
--      added late; auth.users holds their first sign-in.
--    - the recorded city, its source and the internet city.
--    - likely_city: a best guess from activity for accounts with no
--      recorded city (the turfs of games hosted, requested or joined,
--      turfs contacted, suggestions, own reviews, the cities looked at
--      before signing up, active or pending turf claims, cities named in
--      Ask searches), with the winner's share of the evidence.
--    And fixes from its review:
--    - games joined leaves out their own games (a host is added as a
--      participant of the game they make);
--    - "google" only for accounts made with Google: the old app's
--      email and password accounts also have an auth.users row;
--    - sign-ins include the last one auth.users knows when the sign-in
--      log (6 Oct 2026) does not have it;
--    - turf claims are matched on the keys the account can really hold,
--      as _caller_key builds them: its Google email (or an old-app email
--      row's), and a +91 number a phone sign-in would open.
-- Nothing else changes and no rows are deleted. Safe to run again.

create table if not exists private.user_cities (
  user_id uuid primary key,
  -- A curated city id from lib/city.ts, or null when nothing was known.
  city text check (city is null or city ~ '^[a-z][a-z-]{1,30}$'),
  -- picked (city menu, pick screen, "Make this my city"), gps (located),
  -- ip (the internet connection's city: approximate), unknown.
  source text not null check (source in ('picked', 'gps', 'ip', 'unknown')),
  -- The internet connection's own city name when first recorded, even
  -- when a pick won: it can name places outside the curated cities.
  ip_city text check (ip_city is null or length(ip_city) <= 60),
  -- Recorded within a day of the account being made.
  at_signup boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((city is null) = (source = 'unknown'))
);
revoke all on private.user_cities from public, anon, authenticated;
create index if not exists user_cities_city on private.user_cities (city);

create or replace function public.account_note_city(
  p_key text,
  p_user_id uuid,
  p_city text,
  p_source text,
  p_ip_city text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_signed_up timestamptz;
  v_ip text := left(nullif(btrim(p_ip_city), ''), 60);
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null
     or p_source is null or p_source not in ('picked', 'gps', 'ip', 'unknown')
     or (p_city is not null and p_city !~ '^[a-z][a-z-]{1,30}$')
     or ((p_city is null) <> (p_source = 'unknown')) then
    return jsonb_build_object('r', 'bad');
  end if;
  select least(u.created_at, coalesce(a.created_at, u.created_at))
    into v_signed_up
    from public.users u
    left join auth.users a on a.id = u.id
   where u.id = p_user_id;
  if not found then
    return jsonb_build_object('r', 'bad');
  end if;
  insert into private.user_cities as c (user_id, city, source, ip_city, at_signup)
  values (p_user_id, p_city, p_source, v_ip, coalesce(v_signed_up > now() - interval '1 day', false))
  on conflict (user_id) do update
     set city = excluded.city,
         source = excluded.source,
         at_signup = excluded.at_signup,
         ip_city = coalesce(c.ip_city, excluded.ip_city),
         updated_at = now()
   where (case excluded.source when 'picked' then 2 when 'gps' then 2 when 'ip' then 1 else 0 end)
       > (case c.source when 'picked' then 2 when 'gps' then 2 when 'ip' then 1 else 0 end);
  return jsonb_build_object('r', 'ok');
end;
$$;
revoke all on function public.account_note_city(text, uuid, text, text, text) from public;
grant execute on function public.account_note_city(text, uuid, text, text, text) to anon, authenticated;

create or replace function public.admin_people(p_firebase_token text default null)
returns table (
  id uuid,
  name text,
  email text,
  phone text,
  profile_image_url text,
  role text,
  is_verified boolean,
  created_at timestamptz,
  signed_up_at timestamptz,
  updated_at timestamptz,
  method text,
  username text,
  taggable boolean,
  logins integer,
  last_login timestamptz,
  login_methods text[],
  games_hosted integer,
  requests integer,
  requests_accepted integer,
  games_joined integer,
  reviews integer,
  contact_taps integer,
  contacted jsonb,
  asks integer,
  recent_asks text[],
  suggestions integer,
  turfs jsonb,
  last_active timestamptz,
  signup jsonb,
  city text,
  city_source text,
  city_ip text,
  city_at_signup boolean,
  city_at timestamptz,
  likely_city text,
  likely_share real
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
    with l as (
      select ul.user_id, count(*)::int as n, max(ul.created_at) as last_at,
             array_agg(distinct ul.method::text order by ul.method::text) as methods
        from public.user_logins ul
       group by ul.user_id
    ), g as (
      select gm.creator_id as user_id, count(*)::int as n, max(gm.created_at) as last_at
        from public.games gm
       where gm.creator_id is not null
       group by gm.creator_id
    ), rq as (
      select r.user_id, count(*)::int as n,
             (count(*) filter (where r.status = 'accepted'))::int as accepted,
             max(r.created_at) as last_at
        from public.game_requests r
       where r.user_id is not null
       group by r.user_id
    ), p as (
      -- Games they joined; making a game adds its host as a participant.
      select gp.user_id, count(distinct gp.game_id)::int as n, max(gp.joined_at) as last_at
        from public.game_participants gp
       where gp.user_id is not null
         and not exists (select 1 from public.games gm where gm.id = gp.game_id and gm.creator_id = gp.user_id)
       group by gp.user_id
    ), ax as (
      -- The last sign-in auth.users knows, when the log does not have it (sign-ins before 6 Oct 2026).
      select au.id as user_id, au.last_sign_in_at as at,
             case when au.raw_app_meta_data ->> 'provider' = 'google' or au.raw_app_meta_data -> 'providers' @> '["google"]'::jsonb then 'google' else 'email' end as method
        from auth.users au
       where au.last_sign_in_at is not null
         and not exists (select 1 from public.user_logins x where x.user_id = au.id and x.created_at >= au.last_sign_in_at - interval '10 minutes')
    ), rv as (
      -- Their own reviews; imported Google reviews hang off one account.
      select r.user_id, count(*)::int as n, max(r.created_at) as last_at
        from public.reviews r
       where r.user_id is not null and r.source is distinct from 'google'
       group by r.user_id
    ), ct as (
      select cc.user_id, cc.turf_id, count(*)::int as n, max(cc.created_at) as last_at,
             array_agg(distinct cc.kind::text order by cc.kind::text) as kinds,
             row_number() over (partition by cc.user_id order by max(cc.created_at) desc, cc.turf_id) as rk
        from public.turf_contact_clicks cc
       where cc.user_id is not null
       group by cc.user_id, cc.turf_id
    ), c as (
      -- The five turfs they reached out to most recently.
      select ct.user_id, sum(ct.n)::int as n, max(ct.last_at) as last_at,
             coalesce(jsonb_agg(jsonb_build_object(
                        'turf', coalesce(t.name::text, 'A removed turf'),
                        'slug', t.slug,
                        'kinds', to_jsonb(ct.kinds),
                        'n', ct.n,
                        'at', ct.last_at) order by ct.rk) filter (where ct.rk <= 5), '[]'::jsonb) as list
        from ct
        left join public.turfs t on t.id = ct.turf_id
       group by ct.user_id
    ), a as (
      select aq.user_id, count(*)::int as n, max(aq.created_at) as last_at,
             (array_agg(left(aq.query, 200) order by aq.created_at desc, aq.id desc))[1:3] as recent
        from public.ask_queries aq
       where aq.user_id is not null
       group by aq.user_id
    ), s as (
      select ts.user_id, count(*)::int as n, max(ts.created_at) as last_at
        from public.turf_suggestions ts
       where ts.user_id is not null
       group by ts.user_id
    ), keys as (
      -- The myTapturf keys each account can hold, built as _caller_key builds them.
      select k.user_id, k.user_key
        from (
          select uu.id as user_id,
                 'e:' || lower(coalesce(au.email::text, case when au.id is null and lg.user_id is not null then uu.email::text end)) as user_key
            from public.users uu
            left join auth.users au on au.id = uu.id
            left join private.legacy_email_rows lg on lg.user_id = uu.id
          union all
          -- A phone sign-in opens this row (account_resolve): +91, not changed through the API, and on a
          -- Google row only when that phone signed in to it before the login log could be faked.
          select uu.id, 'p:' || public._phone10(uu.phone::text)
            from public.users uu
            left join auth.users au on au.id = uu.id
           where uu.phone::text ~ '^\+91[0-9]{10}$'
             and not exists (select 1 from private.users_phone_changes pc where pc.user_id = uu.id)
             and (au.id is null or exists (
                   select 1 from public.user_logins ul
                    where ul.user_id = uu.id and ul.method = 'phone' and ul.created_at < private.phone_logins_trusted_before()))
        ) k
       where k.user_key is not null
    ), o as (
      -- myTapturf claims, every status.
      select k.user_id,
             jsonb_agg(jsonb_build_object(
                         'turf', coalesce(t.name::text, 'A removed turf'),
                         'slug', t.slug,
                         'status', tow.status,
                         'role', tow.role) order by tow.created_at desc, tow.turf_id) as list
        from keys k
        join public.turf_owners tow on tow.user_key = k.user_key
        left join public.turfs t on t.id = tow.turf_id
       group by k.user_id
    ), games_touched as (
      -- Each game once per person, whether they hosted, asked to join or played.
      select x.user_id, x.game_id, max(x.at) as at
        from (
          select gm.creator_id as user_id, gm.id as game_id, gm.created_at as at
            from public.games gm where gm.creator_id is not null
          union all
          select r.user_id, r.game_id, r.created_at from public.game_requests r where r.user_id is not null
          union all
          select gp.user_id, gp.game_id, gp.joined_at from public.game_participants gp where gp.user_id is not null
        ) x
       group by x.user_id, x.game_id
    ), evidence as (
      -- Weighted city signals for the best guess.
      select gt.user_id, t.city::text as city, 3::numeric as w, gt.at
        from games_touched gt
        join public.games gm on gm.id = gt.game_id
        join public.turfs t on t.id = gm.turf_id
      union all
      select ct.user_id, t.city::text, 2::numeric, ct.last_at
        from ct join public.turfs t on t.id = ct.turf_id
      union all
      select ts.user_id, t.city::text, 2::numeric, ts.created_at
        from public.turf_suggestions ts join public.turfs t on t.id = ts.turf_id
       where ts.user_id is not null
      union all
      select r.user_id, t.city::text, 1::numeric, r.created_at
        from public.reviews r join public.turfs t on t.id = r.turf_id
       where r.user_id is not null and r.source is distinct from 'google'
      union all
      select sc.user_id, sc.ctx #>> '{interest,cities,0}', 4::numeric, sc.created_at
        from public.user_signup_context sc
       where jsonb_typeof(sc.ctx #> '{interest,cities,0}') = 'string'
      union all
      select k.user_id, t.city::text, 5::numeric, tow.created_at
        from keys k
        join public.turf_owners tow on tow.user_key = k.user_key and tow.status in ('active', 'pending')
        join public.turfs t on t.id = tow.turf_id
      union all
      -- Cities named in Ask searches: interest more than home, so each city counts once a day, lightly.
      select q.user_id, q.city, 0.5::numeric, max(q.created_at)
        from (
          select aq.user_id, aq.filters ->> 'city' as city, aq.created_at,
                 (aq.created_at at time zone 'Asia/Kolkata')::date as day
            from public.ask_queries aq
           where aq.user_id is not null and jsonb_typeof(aq.filters -> 'city') = 'string'
        ) q
       group by q.user_id, q.city, q.day
    ), scored as (
      select e.user_id, e.city, sum(e.w) as score, max(e.at) as last_at,
             sum(sum(e.w)) over (partition by e.user_id) as total,
             row_number() over (partition by e.user_id order by sum(e.w) desc, max(e.at) desc nulls last, e.city) as rk
        from evidence e
       where e.city ~ '^[a-z][a-z-]{1,30}$'
       group by e.user_id, e.city
    )
    select u.id,
           u.name::text,
           u.email::text,
           u.phone::text,
           u.profile_image_url,
           u.role::text,
           u.is_verified,
           u.created_at,
           least(u.created_at, coalesce(au.created_at, u.created_at)),
           u.updated_at,
           -- How the account was made: auth's first provider (the old app made email and password
           -- accounts there too), else a phone sign-in, else an old-app email row.
           case when au.id is not null then case when au.raw_app_meta_data ->> 'provider' = 'google' then 'google' else 'email' end
                when u.phone is not null then 'phone'
                when u.email is not null then 'email'
                else 'unknown' end,
           un.username,
           un.taggable,
           coalesce(l.n, 0) + (ax.user_id is not null)::int,
           greatest(l.last_at, ax.at),
           array(select distinct m from unnest(coalesce(l.methods, '{}'::text[]) || coalesce(array[ax.method], '{}'::text[])) m
                  where m is not null order by m),
           coalesce(g.n, 0),
           coalesce(rq.n, 0),
           coalesce(rq.accepted, 0),
           coalesce(p.n, 0),
           coalesce(rv.n, 0),
           coalesce(c.n, 0),
           coalesce(c.list, '[]'::jsonb),
           coalesce(a.n, 0),
           coalesce(a.recent, '{}'::text[]),
           coalesce(s.n, 0),
           coalesce(o.list, '[]'::jsonb),
           greatest(l.last_at, ax.at, g.last_at, rq.last_at, p.last_at, rv.last_at, c.last_at, a.last_at, s.last_at),
           sc.ctx,
           uc.city,
           uc.source,
           uc.ip_city,
           uc.at_signup,
           uc.updated_at,
           sd.city,
           (sd.score / nullif(sd.total, 0))::real
      from public.users u
      left join auth.users au on au.id = u.id
      left join public.usernames un on un.user_id = u.id
      left join l on l.user_id = u.id
      left join ax on ax.user_id = u.id
      left join g on g.user_id = u.id
      left join rq on rq.user_id = u.id
      left join p on p.user_id = u.id
      left join rv on rv.user_id = u.id
      left join c on c.user_id = u.id
      left join a on a.user_id = u.id
      left join s on s.user_id = u.id
      left join o on o.user_id = u.id
      left join public.user_signup_context sc on sc.user_id = u.id
      left join private.user_cities uc on uc.user_id = u.id
      left join scored sd on sd.user_id = u.id and sd.rk = 1
     order by least(u.created_at, coalesce(au.created_at, u.created_at)) desc nulls last, u.id;
end;
$$;
revoke all on function public.admin_people(text) from public;
grant execute on function public.admin_people(text) to anon, authenticated;
