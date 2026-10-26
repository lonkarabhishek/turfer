-- The verified tick: a check next to a person's name when they proved both
-- a phone number and an email, and both are still theirs.
--
-- What it means (private.user_verified):
-- 1. Phone (private.phone_proven): the account's number opens it by OTP
--    today (private.phone_account) and was proved with one: an OTP added
--    or confirmed from the profile (private.phone_link_ok), a Firebase
--    phone token the server checked for this number while it opened this
--    account (private.phone_verified: account_phone_checked,
--    account_set_phone, and the backfill from trusted logins), the fresh
--    OTP that made the account's open Google link (account_link_intents),
--    or a phone sign-in logged by account_resolve since the login log
--    stopped taking writes from browsers (21 Oct 2026 18:50 UTC), with no
--    number change after it. A number typed onto an account, or only
--    there since a row was made, never counts.
-- 2. Email (private.email_proven): Google confirmed the account's email
--    (auth.identities, email_verified) for a Google sign-in that opens this
--    account (private.google_account: an open link, its own row unless set
--    aside, or the old-app row it lands on). A phone account whose Google
--    address another row holds (users.email empty) counts by its open link.
--    Typed emails (private.user_contact_emails), email and password
--    sign-ins, and a Google row made without its address never count.
-- 3. Computed on every read, never stored: it changes the moment a link
--    ends or is swapped, or the number or email changes. No trigger, no
--    column. users.is_verified (an old-app flag: 6 true, none of them
--    passes this) stays exactly as it is, and is not read here.
--
-- Who sees what: the public sees one boolean per account
-- (public.users_verified, public.usernames_verified, the 'verified' key of
-- public.profile_get, the 'v' key of public.players_search), never the
-- number or the email, and never which half is missing. The owner's own
-- profile (private.profile_json, returned only to them through the
-- account routes) also says which half is proved. The site owner gets
-- both halves for everyone (public.admin_ticks).
--
-- Replaced bodies (same signatures, return types, settings and grants),
-- each copied from the live body and changed only by the added lines.
-- md5(pg_proc.prosrc) on production, read 2026-10-26, equals the body in:
--   private.profile_json(uuid)       20261026_account_links.sql      bc73a0d819f546264cc6775b9a9d8532
--   public.profile_get(text)         20261021_accounts_usernames.sql 927cbc4ef84529e8be276cc548e0e69b
--   public.players_search(text,text) 20261021_accounts_usernames.sql 861c8474915aeb8fe28cd64d15e5cf2a
-- New: one index, private.phone_proven, private.email_proven,
-- private.user_verified, public.users_verified, public.usernames_verified,
-- public.admin_ticks.
--
-- Needs 20261026_account_links.sql. Additive: nothing dropped, deleted or
-- merged. Safe to run again. The app works with either database: before
-- this, the profile has no 'verified' key and the app shows no tick and no
-- ask.
--
-- Expected right after applying (the same rules read on production on
-- 2026-10-26, aggregates only): 147 accounts, 51 phone proven, 36 email
-- proven, 1 ticked. Check, as postgres:
--   select count(*) filter (where private.phone_proven(id)) as phone,
--          count(*) filter (where private.email_proven(id)) as email,
--          count(*) filter (where private.user_verified(id)) as ticked
--     from public.users;

set local lock_timeout = '5s';

-- phone_link_ok and the rules below look up a person's number changes.
create index if not exists users_phone_changes_user on private.users_phone_changes (user_id, id);

-- The account's current number opens it by OTP and was proved with one.
-- (Stricter, if ever wanted: for a row with an auth.users row or on
-- private.legacy_email_rows, accept only phone_link_ok or the open link's
-- intent, so the same person demonstrably proved both.)
create or replace function private.phone_proven(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select u.phone ~ '^\+91[0-9]{10}$'
       and private.phone_account(u.phone) = u.id
       and (private.phone_link_ok(u.id, u.phone)
            or exists (select 1 from private.phone_verified v
                        where v.user_id = u.id and v.phone_hash = md5(u.phone))
            or exists (select 1 from private.account_google_links l
                         join private.account_link_intents i on i.id = l.intent_id
                        where l.user_id = u.id and l.ended_at is null and i.phone_hash = md5(u.phone))
            or exists (select 1 from public.user_logins l
                        where l.user_id = u.id and l.method = 'phone'
                          and l.created_at >= private.phone_logins_trusted_before()
                          and not exists (select 1 from private.users_phone_changes c
                                           where c.user_id = u.id and c.at > l.created_at)))
      from public.users u
     where u.id = p_user_id), false);
$$;
revoke all on function private.phone_proven(uuid) from public, anon, authenticated;

-- The account's current email is the address Google confirmed for a sign-in
-- that opens this account (google_account: the open link, its own row
-- unless set aside, the old-app row it lands on). No email counts only by
-- an open link (another row holds the address).
create or replace function private.email_proven(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select exists (
      select 1 from auth.identities i
       where i.provider = 'google'
         and i.identity_data ->> 'email_verified' = 'true'
         and coalesce(i.identity_data ->> 'email', '') <> ''
         and i.user_id in (
               select l.auth_uid from private.account_google_links l where l.user_id = u.id and l.ended_at is null
               union all
               select u.id
               union all
               select a.id from auth.users a
                where u.email is not null and lower(a.email) = lower(u.email)
                  and exists (select 1 from private.legacy_email_rows g where g.user_id = u.id))
         and private.google_account(i.user_id) = u.id
         and (lower(i.identity_data ->> 'email') = lower(u.email)
              or (u.email is null and private.google_open_link(i.user_id) = u.id)))
      from public.users u
     where u.id = p_user_id), false);
$$;
revoke all on function private.email_proven(uuid) from public, anon, authenticated;

-- The tick.
create or replace function private.user_verified(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.phone_proven(p_user_id) and private.email_proven(p_user_id);
$$;
revoke all on function private.user_verified(uuid) from public, anon, authenticated;

-- Public: which of these accounts have the tick. Only those ids, sorted;
-- nothing else about anyone. At most the first 100 ids are read, counted
-- as elements (a slice would keep every row of a many-dimensional array).
create or replace function public.users_verified(p_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(x.id order by x.id), '{}'::uuid[])
    from (select distinct t.id
            from (select u.id from unnest(p_ids) with ordinality as u(id, n) order by u.n limit 100) t
           where t.id is not null) x
   where private.user_verified(x.id);
$$;
revoke all on function public.users_verified(uuid[]) from public;
grant execute on function public.users_verified(uuid[]) to anon, authenticated;

-- Public: the same for current usernames people may tag (live scorecard
-- tags), as typed in ASCII and lowercased. At most the first 64 are read,
-- counted as elements, as above.
create or replace function public.usernames_verified(p_usernames text[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(n.username order by n.username), '{}'::text[])
    from (select distinct lower(t.x) as name
            from (select u.x from unnest(p_usernames) with ordinality as u(x, n) order by u.n limit 64) t
           where t.x ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$') a
    join public.usernames n on n.username = a.name and n.taggable
   where private.user_verified(n.user_id);
$$;
revoke all on function public.usernames_verified(text[]) from public;
grant execute on function public.usernames_verified(text[]) to anon, authenticated;

-- Admin (site owner only): the tick and its two halves for every account.
-- A function of its own: admin_verified's return table can't grow in place.
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
  select u.id, x.p and x.e, x.p, x.e
    from public.users u
    cross join lateral (select private.phone_proven(u.id) as p, private.email_proven(u.id) as e) x
   order by u.id;
end;
$$;
revoke all on function public.admin_ticks(text) from public;
grant execute on function public.admin_ticks(text) to anon, authenticated;

-- ── Replaced bodies ────────────────────────────────────────

-- 20261026_account_links.sql, plus the tick and its halves (the lateral
-- join and the last three keys). Only ever returned to the account's owner.
create or replace function private.profile_json(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone,
           'role', u.role, 'profile_image_url', u.profile_image_url, 'created_at', u.created_at,
           'username', n.username, 'taggable', coalesce(n.taggable, true),
           -- An email typed into an earlier TapTurf, unless it is the account's own address now.
           'contact_email', case when ce.email is distinct from lower(u.email) then ce.email end,
           -- The typed ask and field are gone: false, so pages from before never open them.
           'ask_email', false,
           'email_editable', false,
           -- A phone account with no email, no Google account and no answer yet: asked once to add Google.
           'ask_google', u.email is null and ce.user_id is null and gl.id is null and a.id is null
                         and not exists (select 1 from private.account_link_intents i where i.user_id = u.id),
           -- The Google account added from the profile, if any.
           'google_email', gl.email,
           -- May add, change or remove a Google account (from a phone sign-in).
           'google_linkable', a.id is null and (u.email is null or coalesce(lower(u.email) = gl.email, false)),
           -- The number on the account opens it with an OTP.
           'phone_confirmed', u.phone is not null and private.phone_account(u.phone) is not distinct from u.id,
           -- Google is this account's own way in (not one added to a phone account): it may add, change or remove the number.
           'phone_settable', a.id is not null or lg.user_id is not null,
           -- The verified tick (private.user_verified), and which half is proved.
           'verified', vt.pp and vt.ep,
           'phone_proven', vt.pp,
           'email_proven', vt.ep)
    from public.users u
    left join auth.users a on a.id = u.id
    left join private.legacy_email_rows lg on lg.user_id = u.id
    left join public.usernames n on n.user_id = u.id
    left join private.user_contact_emails ce on ce.user_id = u.id
    left join private.account_google_links gl on gl.user_id = u.id and gl.ended_at is null
    cross join lateral (select private.phone_proven(u.id) as pp, private.email_proven(u.id) as ep) vt
   where u.id = p_user_id;
$$;
revoke all on function private.profile_json(uuid) from public, anon, authenticated;

-- 20261021_accounts_usernames.sql, plus 'verified' for a profile that is
-- shown (nothing in the moved_to answer).
create or replace function public.profile_get(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text := lower(coalesce(p_username, ''));
  v_user uuid;
begin
  if v_name !~ '^[a-z][a-z0-9_]{2,19}$' then
    return null;
  end if;
  if exists (select 1 from public.usernames n where n.username = v_name and n.taggable) then
    return (
      select jsonb_build_object('u', n.username, 'name', u.name, 'photo', u.profile_image_url, 'since', u.created_at,
                                'verified', private.user_verified(u.id))
        from public.usernames n join public.users u on u.id = n.user_id
       where n.username = v_name);
  end if;
  select h.user_id into v_user from public.username_history h where h.username = v_name;
  if v_user is not null then
    return (select jsonb_build_object('moved_to', n.username) from public.usernames n where n.user_id = v_user and n.taggable);
  end if;
  return null;
end;
$$;
revoke all on function public.profile_get(text) from public;
grant execute on function public.profile_get(text) to anon, authenticated;

-- 20261021_accounts_usernames.sql, plus 'v' (the tick) for each of the 8
-- players found. The account id is read inside only, never returned.
create or replace function public.players_search(p_key text, p_q text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(btrim(coalesce(p_q, '')));
  v_like text;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  v_q := regexp_replace(v_q, '^@', '');
  if length(v_q) < 2 or length(v_q) > 30 then
    return jsonb_build_object('r', 'ok', 'players', '[]'::jsonb);
  end if;
  v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  return jsonb_build_object('r', 'ok', 'players', coalesce((
    select jsonb_agg(jsonb_build_object('u', p.username, 'name', p.name, 'photo', p.photo,
                                        'v', private.user_verified(p.user_id)) order by p.rank, p.username)
      from (
        select n.username, u.name, u.profile_image_url as photo,
               case when n.username = v_q then 0 when n.username like v_like || '%' then 1 else 2 end as rank,
               n.user_id
          from public.usernames n
          join public.users u on u.id = n.user_id
         where n.taggable
           and (n.username like v_like || '%' or lower(u.name) like '%' || v_like || '%')
         order by 4, n.username
         limit 8
      ) p
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.players_search(text, text) from public;
grant execute on function public.players_search(text, text) to anon, authenticated;
