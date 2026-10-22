-- Everything the admin sign-ups list shows about each account, in one
-- read: contact, how they signed up, their username, sign-ins, what they
-- have done on the site and the context saved when the account was made.
-- Answers only the site owner, the same check as admin_users.
-- Additive: one new function, nothing else changes. Safe to run again.

create or replace function public.admin_user_details(p_firebase_token text default null)
returns table (
  id uuid,
  name text,
  email text,
  phone text,
  profile_image_url text,
  role text,
  is_verified boolean,
  created_at timestamptz,
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
  signup jsonb
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
      select gp.user_id, count(distinct gp.game_id)::int as n, max(gp.joined_at) as last_at
        from public.game_participants gp
       where gp.user_id is not null
       group by gp.user_id
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
    ), o as (
      -- myTapturf claims, keyed by Google email or phone like _caller_key.
      select uu.id as user_id,
             jsonb_agg(jsonb_build_object(
                         'turf', coalesce(t.name::text, 'A removed turf'),
                         'slug', t.slug,
                         'status', tow.status,
                         'role', tow.role) order by tow.created_at desc, tow.turf_id) as list
        from public.users uu
        join public.turf_owners tow
          on tow.user_key = 'e:' || lower(uu.email::text)
          or tow.user_key = 'p:' || public._phone10(uu.phone::text)
        left join public.turfs t on t.id = tow.turf_id
       group by uu.id
    )
    select u.id,
           u.name::text,
           u.email::text,
           u.phone::text,
           u.profile_image_url,
           u.role::text,
           u.is_verified,
           u.created_at,
           u.updated_at,
           case when exists (select 1 from auth.users au where au.id = u.id) then 'google'
                when u.phone is not null then 'phone'
                when u.email is not null then 'email'
                else 'unknown' end,
           un.username,
           un.taggable,
           coalesce(l.n, 0),
           l.last_at,
           coalesce(l.methods, '{}'::text[]),
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
           greatest(l.last_at, g.last_at, rq.last_at, p.last_at, rv.last_at, c.last_at, a.last_at, s.last_at),
           sc.ctx
      from public.users u
      left join public.usernames un on un.user_id = u.id
      left join l on l.user_id = u.id
      left join g on g.user_id = u.id
      left join rq on rq.user_id = u.id
      left join p on p.user_id = u.id
      left join rv on rv.user_id = u.id
      left join c on c.user_id = u.id
      left join a on a.user_id = u.id
      left join s on s.user_id = u.id
      left join o on o.user_id = u.id
      left join public.user_signup_context sc on sc.user_id = u.id
     order by u.created_at desc nulls last, u.id;
end;
$$;
revoke all on function public.admin_user_details(text) from public;
grant execute on function public.admin_user_details(text) to anon, authenticated;
