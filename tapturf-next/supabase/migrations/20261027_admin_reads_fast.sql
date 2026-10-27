-- The admin reads that were slow, answered as sets: same rows, same order,
-- same signatures, return types, settings and grants.
--
-- Why: on 27 Oct the admin home timed out (57014) while these ran at once.
-- pg_stat_statements: admin_ticks mean 811 ms (max 5,474), admin_people
-- mean 477 ms (max 6,432), admin_verified mean 355 ms, admin_google_unfinished
-- mean 348 ms. The time went into per-row calls of SECURITY DEFINER helpers
-- (private.phone_proven, private.email_proven, private.google_account,
-- private.phone_account, private.phone_link_ok), which Postgres can't inline:
-- each nested call repeats its own probes for every account, and
-- admin_people's lateral google_account was planned twice per auth user.
--
-- What changes (the rules are the same ones, read for every row at once):
-- 1. New private.google_accounts(): every auth.users row and the account its
--    sign-in opens, exactly private.google_account(id) for each (the open
--    link, else its own row unless set aside, else the old-app row it lands
--    on), plus which of the three it was (via). Closed to the API.
-- 2. public.admin_ticks: the tick's two halves without the per-account
--    calls. Phone: private.phone_proven's rules over the accounts whose +91
--    number is theirs (the earliest row with that number, as
--    private.phone_account reads it), with each account's last number change
--    read once (users_phone_changes grouped). Email: private.email_proven's
--    rules read from the Google identities (via google_accounts) instead of
--    from every account. private.phone_proven, private.email_proven and
--    private.user_verified stay as they are for one account at a time.
-- 3. public.admin_verified: by_google as three joins from the Google
--    identities (an added Google account, its own identity, the old-app row
--    it lands on) read once, instead of a correlated search that ran twice
--    per account; phone_link_ok read against each account's last change.
-- 4. public.admin_google_unfinished: google_accounts instead of a
--    google_account call per Google sign-in.
-- 5. public.admin_people: the live body with two changes, marked (7) and (8):
--    ax reads google_accounts once, and the myTapturf phone keys read
--    private.phone_account's rules for every account at once (pacct: the
--    earliest row with the number, its open profile link at the last
--    change, or no change and no auth row or an old-app phone sign-in).
--
-- Read for every row at once, two rules are restated without a subquery
-- per row: "no number change after this sign-in" is the account's latest
-- users_phone_changes.at <= the sign-in (at is not null), and "the open
-- link to this account" is google_accounts' via = 'link' (one open link per
-- Google account, account_google_links_auth_open). Both are what the
-- helpers read. auth.identities.user_id references auth.users
-- (identities_user_id_fkey), so every identity has its row in
-- google_accounts.
--
-- Replaced bodies, each copied from the live body. md5(pg_proc.prosrc) on
-- production, read 2026-10-27, equals the body in:
--   public.admin_ticks(text)             20261027_verified_tick.sql       9c94f0e7c78bc5ba48d485c002ee5adc
--   public.admin_verified(text)          20261026_account_links.sql       4f8ba6ba8a1e2527e24e435388e47f71
--   public.admin_google_unfinished(text) 20261026_account_links.sql       012463a77658b3d44eba182cd8b2ab16
--   public.admin_people(text)            20261026_account_links_reads.sql b5edd196a2b80bd9c580e9a9848f9cb9
-- and the helpers whose rules are restated here are unchanged since:
--   private.google_account 09e530212cc0c0cffeba50b9ecb94f01, google_open_link 21cab65dfc5c20277f7e61df6fcfbe25,
--   google_own_row d78c362448329f65fefbeabeabf4e49a, google_legacy_row 625442ff8a35008def10eabff4665a6b,
--   phone_account ffadf36c5a25c62f5a30088504506049, phone_link_ok 7ad290ea37365497c2c90598e3bc7ce4,
--   phone_proven 34cff6ff01c863fd8921c78d12b2fb99, email_proven 2141139f1901b1cafcbde703573cfcf3.
-- Check them again right before applying (as postgres):
--   select p.proname, md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname in ('public', 'private') and p.proname in ('admin_ticks', 'admin_verified',
--          'admin_google_unfinished', 'admin_people', 'google_account', 'google_open_link', 'google_own_row',
--          'google_legacy_row', 'phone_account', 'phone_link_ok', 'phone_proven', 'email_proven');
-- If one differs, a later file changed it: carry that change into the body
-- here (or the rule here) before applying.
--
-- Proof: scripts/sql-tests/admin_reads_fast.check.mjs runs the live bodies
-- and these side by side on every sign-in and link case of the tick's check
-- (and at scale); scripts/sql-tests/admin_reads_fast.compare.mjs prints a
-- read-only query that compares both on production (counts only: run it
-- right before applying, expect only_old = only_new = 0 for each read).
--
-- Expected (production on 2026-10-27, idle, 149 accounts, 54 Google sign-ins,
-- the new queries run inline, read only, EXPLAIN ANALYZE): admin_ticks 428 ms
-- to 9.5 ms (1,074 buffers), admin_people 99 ms to 28 ms (same moment, timing
-- off), admin_verified 77 ms plus 149 ms planning to about 2 ms plus 5 ms,
-- admin_google_unfinished 11 ms to about 2 ms. All grow with the number of
-- accounts, not with nested calls per account.
--
-- No index is needed at this size: every probe uses an existing one. Past
-- about 10k accounts, consider (outside a transaction)
--   create index concurrently users_lower_email on public.users (lower(email));
-- for the old-app row lookups.
--
-- Additive: one new private function and replaced bodies. Written without
-- the destructive SQL keywords. Safe to run again. Needs
-- 20261027_verified_tick.sql (admin_ticks) applied first.

set local lock_timeout = '5s';

-- ── Shared ─────────────────────────────────────────────────

-- Every Google sign-in (auth.users row) and the account it opens:
-- private.google_account(auth_uid), read for all of them at once. via says
-- which rule gave it: 'link' (added to a phone account from the profile),
-- 'own' (its own row, not set aside), 'legacy' (the old-app row it lands
-- on); user_id and via are null when it opens none.
create or replace function private.google_accounts()
returns table (auth_uid uuid, user_id uuid, via text)
language sql
stable
security definer
set search_path = ''
as $$
  select x.auth_uid,
         coalesce(x.link_id, case when x.has_row then x.own_id else x.legacy_id end),
         case when x.link_id is not null then 'link'
              when x.has_row then case when x.own_id is not null then 'own' end
              when x.legacy_id is not null then 'legacy' end
    from (
      select a.id as auth_uid,
             -- private.google_open_link: one open link per Google account.
             ol.user_id as link_id,
             ur.id is not null as has_row,
             -- private.google_own_row: not while a link made over it has ended, unless asked for since.
             case when ur.id is not null
                   and not exists (
                         select 1 from private.account_google_links l
                          where l.auth_uid = ur.id and l.ended_at is not null and ur.created_at <= l.ended_at
                            and not exists (select 1 from private.google_own_row_asked c
                                             where c.auth_uid = ur.id and c.at >= l.ended_at))
                  then ur.id end as own_id,
             -- private.google_legacy_row, read only when it can decide.
             case when ol.user_id is null and ur.id is null and a.email is not null then (
                    select u.id
                      from public.users u
                      join private.legacy_email_rows g on g.user_id = u.id
                     where lower(u.email) = lower(a.email)
                       and not exists (select 1 from auth.users a2 where a2.id = u.id)
                     order by u.created_at
                     limit 1) end as legacy_id
        from auth.users a
        left join private.account_google_links ol on ol.auth_uid = a.id and ol.ended_at is null
        left join public.users ur on ur.id = a.id
    ) x;
$$;
revoke all on function private.google_accounts() from public, anon, authenticated;

-- ── Admin ──────────────────────────────────────────────────

-- 20261027_verified_tick.sql, read as sets (see the top).
create or replace function public.admin_ticks(p_firebase_token text default null)
returns table (user_id uuid, verified boolean, phone_proven boolean, email_proven boolean)
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
  with lc as (
    -- Each account's last number change.
    select c.user_id, max(c.id) as last_id, max(c.at) as last_at
      from private.users_phone_changes c
     group by c.user_id
  ), fp as (
    -- private.phone_account: the earliest row with a +91 number is the one it opens.
    select distinct on (u.phone) u.id, u.phone
      from public.users u
     where u.phone ~ '^\+91[0-9]{10}$'
     order by u.phone, u.created_at
  ), fk as (
    select fp.id, fp.phone, lc.user_id is not null as changed, lc.last_at,
           -- private.phone_link_ok
           exists (select 1 from private.phone_links pl
                    where pl.user_id = fp.id and pl.ended_at is null and pl.phone_hash = md5(fp.phone)
                      and pl.change_id is not distinct from lc.last_id) as link_ok
      from fp
      left join lc on lc.user_id = fp.id
  ), ph as (
    -- private.phone_proven: the number opens this account by OTP, and was proved with one.
    select fk.id
      from fk
     where (fk.link_ok
            or (not fk.changed
                and (not exists (select 1 from auth.users a where a.id = fk.id)
                     or exists (select 1 from public.user_logins l
                                 where l.user_id = fk.id and l.method = 'phone'
                                   and l.created_at < private.phone_logins_trusted_before()))))
       and (fk.link_ok
            or exists (select 1 from private.phone_verified v where v.user_id = fk.id and v.phone_hash = md5(fk.phone))
            or exists (select 1 from private.account_google_links l
                         join private.account_link_intents i on i.id = l.intent_id
                        where l.user_id = fk.id and l.ended_at is null and i.phone_hash = md5(fk.phone))
            or exists (select 1 from public.user_logins l
                        where l.user_id = fk.id and l.method = 'phone'
                          and l.created_at >= private.phone_logins_trusted_before()
                          and (fk.last_at is null or fk.last_at <= l.created_at)))
  ), em as (
    -- private.email_proven: Google confirmed this address for a sign-in that opens the account.
    select distinct u.id
      from auth.identities i
      join private.google_accounts() m on m.auth_uid = i.user_id
      join public.users u on u.id = m.user_id
     where i.provider = 'google'
       and i.identity_data ->> 'email_verified' = 'true'
       and coalesce(i.identity_data ->> 'email', '') <> ''
       and (m.via = 'link'
            or i.user_id = u.id
            or (u.email is not null
                and exists (select 1 from private.legacy_email_rows g where g.user_id = u.id)
                and exists (select 1 from auth.users a where a.id = i.user_id and lower(a.email) = lower(u.email))))
       and (lower(i.identity_data ->> 'email') = lower(u.email)
            or (u.email is null and m.via = 'link'))
  )
  select u.id, ph.id is not null and em.id is not null, ph.id is not null, em.id is not null
    from public.users u
    left join ph on ph.id = u.id
    left join em on em.id = u.id
   order by u.id;
end;
$$;
revoke all on function public.admin_ticks(text) from public;
grant execute on function public.admin_ticks(text) to anon, authenticated;

-- 20261026_account_links.sql, read as sets (see the top).
create or replace function public.admin_verified(p_firebase_token text default null)
returns table (user_id uuid, email_by_google boolean, email_confirmed boolean, phone_by_code boolean)
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
  with gi as (
    select i.user_id as auth_uid, lower(i.identity_data ->> 'email') as email
      from auth.identities i
     where i.provider = 'google'
       and i.identity_data ->> 'email_verified' = 'true'
  ), bg as (
    -- A Google account added to this account from the profile.
    select l.user_id as id
      from private.account_google_links l
     where l.ended_at is null
       and exists (select 1 from gi where gi.auth_uid = l.auth_uid)
    union
    -- Its own Google identity (made without the address when another row holds it).
    select u.id
      from public.users u
     where exists (select 1 from gi where gi.auth_uid = u.id and (u.email is null or gi.email = lower(u.email)))
    union
    -- An old-app row that account_resolve sends this Google sign-in to.
    select u.id
      from public.users u
     where u.email is not null
       and exists (select 1 from private.legacy_email_rows lg where lg.user_id = u.id)
       and not exists (select 1 from auth.users a0 where a0.id = u.id)
       and exists (select 1 from gi
                    where gi.email = lower(u.email)
                      and not exists (select 1 from public.users x where x.id = gi.auth_uid)
                      and not exists (select 1 from private.account_google_links l2
                                       where l2.auth_uid = gi.auth_uid and l2.ended_at is null))
  ), lc as (
    -- Each account's last number change.
    select c.user_id, max(c.id) as last_id, max(c.at) as last_at
      from private.users_phone_changes c
     group by c.user_id
  )
  select u.id,
         bg.id is not null,
         (bg.id is not null and u.email is not null) or (u.email is not null and exists (
           select 1 from auth.users a
            where a.id = u.id and a.email_confirmed_at is not null and lower(a.email) = lower(u.email))),
         u.phone is not null and (
           exists (select 1 from private.phone_verified v where v.user_id = u.id and v.phone_hash = md5(u.phone))
           -- private.phone_link_ok
           or exists (select 1 from private.phone_links pl
                       where pl.user_id = u.id and pl.ended_at is null and pl.phone_hash = md5(u.phone)
                         and pl.change_id is not distinct from lc.last_id)
           or exists (
             select 1 from public.user_logins l
              where l.user_id = u.id and l.method = 'phone'
                and l.created_at >= private.phone_logins_trusted_before()
                and (lc.last_at is null or lc.last_at <= l.created_at)))
    from public.users u
    left join bg on bg.id = u.id
    left join lc on lc.user_id = u.id
   order by u.id;
end;
$$;
revoke all on function public.admin_verified(text) from public;
grant execute on function public.admin_verified(text) to anon, authenticated;

-- 20261026_account_links.sql, with google_accounts read once.
create or replace function public.admin_google_unfinished(p_firebase_token text default null)
returns table (auth_uid uuid, email text, name text, created_at timestamptz, last_sign_in_at timestamptz, state text)
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
  select a.id,
         lower(a.email::text),
         coalesce(nullif(btrim(a.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(a.raw_user_meta_data ->> 'name'), '')),
         a.created_at,
         a.last_sign_in_at,
         case when exists (select 1 from private.account_link_intents i
                            where i.auth_uid = a.id and i.closed_at is null and i.expires_at > now()) then 'linking'
              when exists (select 1 from private.account_google_links l where l.auth_uid = a.id) then 'replaced'
              when exists (select 1 from private.account_link_legs lg where lg.auth_uid = a.id) then 'link_failed'
              else 'not_finished' end
    from auth.users a
    join private.google_accounts() m on m.auth_uid = a.id
   where (a.raw_app_meta_data ->> 'provider' = 'google'
          or coalesce(a.raw_app_meta_data -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb)
     and m.user_id is null
   order by a.created_at desc, a.id;
end;
$$;
revoke all on function public.admin_google_unfinished(text) from public;
grant execute on function public.admin_google_unfinished(text) to anon, authenticated;

-- 20261026_account_links_reads.sql, with (7) and (8).
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
    with lc as (
      -- (8) Each account's last number change, for pacct.
      select c.user_id, max(c.id) as last_id
        from private.users_phone_changes c
       group by c.user_id
    ), pacct as (
      -- (8) The accounts private.phone_account(phone) opens, all at once with its rules: the earliest
      -- row with a +91 number, when its open profile link was made at its last change
      -- (phone_link_ok), or it has no change and no auth row or an old-app phone sign-in.
      select x.id as user_id
        from (select distinct on (u.phone) u.id, u.phone
                from public.users u
               where u.phone::text ~ '^\+91[0-9]{10}$'
               order by u.phone, u.created_at) x
        left join lc on lc.user_id = x.id
       where exists (select 1 from private.phone_links pl
                      where pl.user_id = x.id and pl.ended_at is null and pl.phone_hash = md5(x.phone::text)
                        and pl.change_id is not distinct from lc.last_id)
          or (lc.user_id is null
              and (not exists (select 1 from auth.users a where a.id = x.id)
                   or exists (select 1 from public.user_logins ul
                               where ul.user_id = x.id and ul.method = 'phone'
                                 and ul.created_at < private.phone_logins_trusted_before())))
    ), l as (
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
      -- (1) Counted for the account the sign-in opens (a linked phone account, an old-app row), once.
      -- (2) A code exchange that only added this Google account to a phone account is not a sign-in.
      select distinct on (m.user_id) m.user_id, au.last_sign_in_at as at,
             case when au.raw_app_meta_data ->> 'provider' = 'google' or au.raw_app_meta_data -> 'providers' @> '["google"]'::jsonb then 'google' else 'email' end as method
        from auth.users au
        -- (7) The account each sign-in opens, read once for all of them (private.google_account).
        join private.google_accounts() m on m.auth_uid = au.id
       where au.last_sign_in_at is not null
         -- A sign-in that opens no account (taken off a phone account, say) is nobody's login.
         and m.user_id is not null
         and not exists (select 1 from private.account_link_legs lg
                          where lg.auth_uid = au.id
                            and lg.returned_at between au.last_sign_in_at - interval '10 minutes' and au.last_sign_in_at + interval '10 minutes')
         and not exists (select 1 from public.user_logins x
                          where x.user_id = m.user_id and x.method = 'google'
                            and x.created_at >= au.last_sign_in_at - interval '10 minutes')
       order by m.user_id, au.last_sign_in_at desc
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
           -- (3) A Google account added to a phone account opens that account (below), never
           -- its own row (an empty one the link was made over keeps no key of its own).
           where not exists (select 1 from private.account_google_links gl where gl.auth_uid = uu.id and gl.ended_at is null)
          union all
          -- A phone sign-in opens this row (account_resolve): +91, not changed through the API, and on a
          -- Google row only when that phone signed in to it before the login log could be faked.
          -- (4) The same rules as private.phone_account, which also counts a number proved with an OTP from the profile.
          select uu.id, 'p:' || public._phone10(uu.phone::text)
            from public.users uu
           where uu.phone::text ~ '^\+91[0-9]{10}$'
             -- (8) private.phone_account(uu.phone) = uu.id, read from pacct.
             and exists (select 1 from pacct where pacct.user_id = uu.id)
          union all
          -- (5) A Google account added to this phone account from the profile.
          select l.user_id, 'e:' || lower(a.email::text)
            from private.account_google_links l
            join auth.users a on a.id = l.auth_uid
           where l.ended_at is null and a.email is not null
        ) k
       where k.user_key is not null
    ), o as (
      -- myTapturf claims, every status.
      -- (6) By the account the claim was made for, and by the keys the account holds for claims
      -- from before claims named one (never another account's claim under a key it holds now).
      select c.user_id,
             jsonb_agg(jsonb_build_object(
                         'turf', coalesce(t.name::text, 'A removed turf'),
                         'slug', t.slug,
                         'status', tow.status,
                         'role', tow.role) order by tow.created_at desc, tow.turf_id) as list
        from (select k.user_id, tow0.turf_id, tow0.user_key
                from keys k join public.turf_owners tow0 on tow0.user_key = k.user_key
                                                         and (tow0.user_id is null or tow0.user_id = k.user_id)
              union
              select tow0.user_id, tow0.turf_id, tow0.user_key
                from public.turf_owners tow0 where tow0.user_id is not null) c
        join public.turf_owners tow on tow.turf_id = c.turf_id and tow.user_key = c.user_key
        left join public.turfs t on t.id = tow.turf_id
       group by c.user_id
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
