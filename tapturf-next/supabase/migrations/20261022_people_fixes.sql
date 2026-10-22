-- Fixes from the review of 20261022_user_cities.sql. Both functions are
-- made again with create or replace, same signatures; nothing is dropped.
--
-- A Google sign-in that auth.users remembers (last_sign_in_at) is shown
-- when the sign-in log does not have it. The check for "the log has it"
-- looked at a logged sign-in of any kind, so a later phone sign-in on the
-- same account hid the Google one. Phone sign-ins never move
-- last_sign_in_at: only a logged Google sign-in can stand for it.
-- 1. admin_people (the admin people list and the sign-ups chart).
-- 2. get_recent_logins (the admin Latest logins tile), so both agree.
-- Safe to run again.

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
      -- Only a logged Google sign-in can stand for it: phone sign-ins never move last_sign_in_at.
      select au.id as user_id, au.last_sign_in_at as at,
             case when au.raw_app_meta_data ->> 'provider' = 'google' or au.raw_app_meta_data -> 'providers' @> '["google"]'::jsonb then 'google' else 'email' end as method
        from auth.users au
       where au.last_sign_in_at is not null
         and not exists (select 1 from public.user_logins x
                          where x.user_id = au.id and x.method = 'google'
                            and x.created_at >= au.last_sign_in_at - interval '10 minutes')
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

create or replace function public.get_recent_logins(p_limit integer default 200, p_firebase_token text default null)
returns table (
  user_id uuid,
  name text,
  phone text,
  email text,
  method text,
  logged_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with l as (
    select ul.user_id, ul.method, ul.created_at
    from public.user_logins ul
    union all
    select au.id, 'google'::text, au.last_sign_in_at
    from auth.users au
    where au.last_sign_in_at is not null
      and not exists (
        select 1 from public.user_logins x
        where x.user_id = au.id and x.method = 'google' and x.created_at >= au.last_sign_in_at - interval '10 minutes'
      )
  )
  select l.user_id, u.name::text, u.phone::text, coalesce(u.email, au.email)::text, l.method, l.created_at
  from l
  left join public.users u on u.id = l.user_id
  left join auth.users au on au.id = l.user_id
  order by l.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;
revoke all on function public.get_recent_logins(integer, text) from public;
grant execute on function public.get_recent_logins(integer, text) to anon, authenticated;
