-- myTapturf claims belong to the TapTurf account the claimant is signed
-- in to, and a claimant who has the turf's listed mobile can prove it with
-- a code and get in at once.
--
-- 1. turf_owners.user_id: the account (public.users.id). owner_claim sets
--    it from the sign-in and stores that account's name; the name typed in
--    the claim form is no longer used. Old rows are filled in below.
-- 2. turf_owners.verified_phone: the listed number a claimant proved with
--    a code (owner_claim_verified). via stays 'phone_match', so the via
--    check needs no change.
-- 3. owner_phone_listed: is this number listed on this turf? Asked before
--    a code is sent, so no SMS goes to a number that would not count.
--    20 checks an hour per sign-in, so listed numbers can't be fished out.
--    A number that is not listed is kept for the admin's check of the
--    claim. owner_claim_info: does the turf list a mobile at all.
-- 4. owner_claim_verified: the claimant's sign-in plus a Firebase ID token
--    for the listed number (from a separate, in-memory Firebase instance in
--    the browser, so the main sign-in never changes). Checked with Google,
--    as _caller_key checks phone sign-ins.
-- 5. owner_home tells the claimant which account they are claiming as;
--    admin_owner_claims shows the admin that account.
-- 6. _caller_key: an email in the session counts only for a Google
--    sign-in (as _is_site_owner already requires). Old-app email and
--    password sessions no longer open myTapturf.
-- 7. The four-argument owner_claim (unused since 20261019_mytapturf_claims)
--    forwards to the five-argument one and is closed to the browser.
--
-- Additive: two columns, one table, replaced function bodies with the same
-- signatures, one revoke. Nothing is dropped, deleted or merged. Safe to
-- run again. Apply before the code that sends owner_claim_verified.

set local lock_timeout = '5s';

alter table public.turf_owners add column if not exists user_id uuid;
alter table public.turf_owners add column if not exists verified_phone text;
comment on column public.turf_owners.user_id is 'The TapTurf account (public.users.id) the claimant was signed in to. Set by owner_claim and owner_claim_verified.';
comment on column public.turf_owners.verified_phone is 'The listed mobile (10 digits) the claimant proved with a code, when the claim opened that way.';
create index if not exists turf_owners_user on public.turf_owners (user_id);

-- Numbers claimants typed to check against a listing: the rate limit, and
-- for a number that is not listed, what the admin can call to check a claim.
create table if not exists private.claim_phone_checks (
  user_key text not null,
  turf_id uuid,
  phone text,
  listed boolean,
  at timestamptz not null default now()
);
alter table private.claim_phone_checks add column if not exists turf_id uuid;
alter table private.claim_phone_checks add column if not exists phone text;
alter table private.claim_phone_checks add column if not exists listed boolean;
create index if not exists claim_phone_checks_key_at on private.claim_phone_checks (user_key, at);
revoke all on private.claim_phone_checks from public, anon, authenticated;

-- ── Which account a myTapturf sign-in is ──────────────────
-- The rules account_resolve uses (20261021_accounts_fixes.sql), read only:
-- Google is the auth user's own row (or the old-app email row it lands
-- on); a phone is the row with that number, unless the number was changed
-- through the API or sits on a Google row it never signed in to.
create or replace function private.account_for_key(p_key text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case left(coalesce(p_key, ''), 2)
    when 'e:' then coalesce(
      (select u.id from auth.users a join public.users u on u.id = a.id
        where lower(a.email) = substr(p_key, 3)
          and a.raw_app_meta_data -> 'providers' @> '["google"]'::jsonb
        order by a.created_at limit 1),
      (select u.id from public.users u join private.legacy_email_rows g on g.user_id = u.id
        where lower(u.email) = substr(p_key, 3)
          and not exists (select 1 from auth.users a where a.id = u.id)
        order by u.created_at limit 1))
    when 'p:' then (
      select u.id from public.users u
       where u.phone = '+91' || substr(p_key, 3)
         and not exists (select 1 from private.users_phone_changes c where c.user_id = u.id)
         and (not exists (select 1 from auth.users a where a.id = u.id)
              or exists (select 1 from public.user_logins l
                          where l.user_id = u.id and l.method = 'phone'
                            and l.created_at < private.phone_logins_trusted_before()))
       order by u.created_at limit 1)
  end;
$$;
revoke all on function private.account_for_key(text) from public, anon, authenticated;

-- The caller's account: for Google, the signed-in auth user's own row first.
create or replace function private.caller_account(p_key text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when left(coalesce(p_key, ''), 2) = 'e:'
              then coalesce((select u.id from public.users u where u.id = auth.uid()), private.account_for_key(p_key))
              else private.account_for_key(p_key) end;
$$;
revoke all on function private.caller_account(text) from public, anon, authenticated;

-- A Firebase ID token's verified phone, as 10 digits (Indian mobiles only), or null.
create or replace function private.firebase_phone10(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  if p_token is null or length(p_token) < 100 or length(p_token) > 8000
     or not exists (select 1 from pg_extension where extname = 'http') then
    return null;
  end if;
  begin
    execute $q$
      select r.content::jsonb #>> '{users,0,phoneNumber}'
      from extensions.http_post(
        'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyDQE1iEsJXZqqHLJw5WrtjkD5A0vwpvwxY',
        json_build_object('idToken', $1)::text,
        'application/json'
      ) r
      where r.status = 200
    $q$ into v_phone using p_token;
  exception when others then
    return null;
  end;
  if v_phone is null or v_phone !~ '^\+91[0-9]{10}$' then
    return null;
  end if;
  return public._phone10(v_phone);
end;
$$;
revoke all on function private.firebase_phone10(text) from public, anon, authenticated;

-- ── Who is calling: Google sessions only ──────────────────
create or replace function public._caller_key(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_phone text;
begin
  -- A Google sign-in (an old-app email and password session is not one;
  -- it falls through to the phone check, like no session at all).
  if v_email <> '' and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb then
    return 'e:' || v_email;
  end if;
  if p_token is null or length(p_token) < 100
     or not exists (select 1 from pg_extension where extname = 'http') then
    return null;
  end if;
  begin
    execute $q$
      select r.content::jsonb #>> '{users,0,phoneNumber}'
      from extensions.http_post(
        'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyDQE1iEsJXZqqHLJw5WrtjkD5A0vwpvwxY',
        json_build_object('idToken', $1)::text,
        'application/json'
      ) r
      where r.status = 200
    $q$ into v_phone using p_token;
  exception when others then
    return null;
  end;
  if v_phone is null or v_phone !~ '^\+91[0-9]{10}$' then
    return null;
  end if;
  v_phone := public._phone10(v_phone);
  return case when v_phone is null then null else 'p:' || v_phone end;
end;
$$;
revoke all on function public._caller_key(text) from public, anon, authenticated;

-- ── Owner home: plus the account claims are made as ───────
create or replace function public.owner_home(p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  v_uid uuid;
begin
  if k is null then
    return jsonb_build_object('signed_in', false);
  end if;
  v_uid := private.caller_account(k);
  return jsonb_build_object(
    'signed_in', true,
    'who', substr(k, 3),
    'kind', case when left(k, 2) = 'p:' then 'phone' else 'email' end,
    'admin', public._is_admin_key(k),
    'account', (select jsonb_build_object('name', u.name, 'username', un.username)
                  from public.users u left join public.usernames un on un.user_id = u.id
                 where u.id = v_uid),
    'turfs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'city', t.city, 'area', t.area,
        'cover', coalesce(t.cover_image, to_jsonb(t.images) ->> 0),
        'status', o.status, 'via', o.via, 'since', o.created_at
      ) order by o.status, o.created_at)
      from public.turf_owners o join public.turfs t on t.id = o.turf_id
      where o.user_key = k and o.status in ('active', 'pending')
    ), '[]'::jsonb),
    'matches', case when left(k, 2) = 'p:' then coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'city', t.city, 'area', t.area,
                                          'cover', coalesce(t.cover_image, to_jsonb(t.images) ->> 0)))
      from public.turfs t
      where t.is_active
        and substr(k, 3) in (public._phone10(t.contact_info ->> 'phone'), public._phone10(t.owner_phone), public._phone10(t.whatsapp_phone))
        and not exists (select 1 from public.turf_owners o where o.turf_id = t.id and o.user_key = k and o.status in ('active', 'pending'))
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

-- ── Claim a turf (five arguments; p_name is kept for old callers, unused) ──
create or replace function public.owner_claim(p_token text, p_turf_id uuid, p_name text default null, p_note text default null, p_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  v_uid uuid;
  v_name text;
  v_status text;
  v_role text := case when p_role in ('owner', 'manager', 'staff') then p_role end;
begin
  if k is null then
    return jsonb_build_object('error', 'sign_in');
  end if;
  if not exists (select 1 from public.turfs where id = p_turf_id and is_active) then
    return jsonb_build_object('error', 'not_found');
  end if;
  -- The site owner opens every turf without a claim.
  if public._is_admin_key(k) then
    return jsonb_build_object('status', 'active', 'admin', true);
  end if;
  v_uid := private.caller_account(k);
  if v_uid is null then
    return jsonb_build_object('error', 'no_account');
  end if;
  select left(nullif(btrim(u.name), ''), 80) into v_name from public.users u where u.id = v_uid;
  select status into v_status from public.turf_owners where turf_id = p_turf_id and user_key = k;
  if v_status in ('active', 'pending') then
    -- Same claim again: keep it, and link the account if an old row lacks it.
    update public.turf_owners set user_id = v_uid where turf_id = p_turf_id and user_key = k and user_id is null;
    return jsonb_build_object('status', v_status);
  end if;
  if v_status = 'revoked' then
    return jsonb_build_object('error', 'revoked');
  end if;
  if (select count(*) from public.turf_owners where user_key = k and status = 'pending') >= 5 then
    return jsonb_build_object('error', 'too_many');
  end if;

  if left(k, 2) = 'p:' and substr(k, 3) = any(coalesce(public._turf_phones(p_turf_id), '{}')) then
    v_status := 'active';
  else
    v_status := 'pending';
  end if;

  insert into public.turf_owners (turf_id, user_key, user_id, status, via, name, note, role, verified_phone, created_at, decided_at)
  values (p_turf_id, k, v_uid, v_status, case when v_status = 'active' then 'phone_match' else 'admin' end,
          v_name, left(nullif(trim(p_note), ''), 400), v_role,
          case when v_status = 'active' then substr(k, 3) end, now(),
          case when v_status = 'active' then now() end)
  on conflict (turf_id, user_key) do update
    set user_id = excluded.user_id, status = excluded.status, via = excluded.via, name = excluded.name,
        note = excluded.note, role = excluded.role, verified_phone = excluded.verified_phone,
        created_at = now(), decided_at = excluded.decided_at;

  return jsonb_build_object('status', v_status);
end;
$$;
grant execute on function public.owner_claim(text, uuid, text, text, text) to anon, authenticated;

-- The four-argument version: the same rules, closed to the browser.
create or replace function public.owner_claim(p_token text, p_turf_id uuid, p_name text default null, p_note text default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.owner_claim(p_token, p_turf_id, p_name, p_note, null::text);
$$;
revoke all on function public.owner_claim(text, uuid, text, text) from public, anon, authenticated;

-- ── Is this number on the listing? (before any code is sent) ──
create or replace function public.owner_phone_listed(p_token text, p_turf_id uuid, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  v_phone text := public._phone10(p_phone);
  v_listed boolean;
begin
  if k is null then
    return jsonb_build_object('error', 'sign_in');
  end if;
  if not exists (select 1 from public.turfs where id = p_turf_id and is_active) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_phone is null then
    return jsonb_build_object('error', 'bad_phone');
  end if;
  if (select count(*) from private.claim_phone_checks c where c.user_key = k and c.at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('error', 'too_many');
  end if;
  v_listed := v_phone = any(coalesce(public._turf_phones(p_turf_id), '{}'));
  insert into private.claim_phone_checks (user_key, turf_id, phone, listed) values (k, p_turf_id, v_phone, v_listed);
  return jsonb_build_object('listed', v_listed);
end;
$$;
revoke all on function public.owner_phone_listed(text, uuid, text) from public;
grant execute on function public.owner_phone_listed(text, uuid, text) to anon, authenticated;

-- ── What the claim form needs to know about a turf ────────
-- Whether it lists a mobile at all (no code can help otherwise), and the
-- last two digits of each, which the turf page shows in full anyway.
create or replace function public.owner_claim_info(p_token text, p_turf_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  v_phones text[];
begin
  if k is null then
    return jsonb_build_object('error', 'sign_in');
  end if;
  if not exists (select 1 from public.turfs where id = p_turf_id and is_active) then
    return jsonb_build_object('error', 'not_found');
  end if;
  v_phones := coalesce(public._turf_phones(p_turf_id), '{}');
  return jsonb_build_object(
    'mobiles', cardinality(array(select distinct x from unnest(v_phones) x)),
    'endings', coalesce((select jsonb_agg(e order by e) from (select distinct right(x, 2) as e from unnest(v_phones) x) d), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.owner_claim_info(text, uuid) from public;
grant execute on function public.owner_claim_info(text, uuid) to anon, authenticated;

-- ── Claim with a code sent to the listed number: active at once ──
create or replace function public.owner_claim_verified(p_token text, p_proof text, p_turf_id uuid, p_note text default null, p_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  v_uid uuid;
  v_name text;
  v_phone text;
  v_status text;
  v_role text := case when p_role in ('owner', 'manager', 'staff') then p_role end;
begin
  if k is null then
    return jsonb_build_object('error', 'sign_in');
  end if;
  if not exists (select 1 from public.turfs where id = p_turf_id and is_active) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if public._is_admin_key(k) then
    return jsonb_build_object('status', 'active', 'admin', true);
  end if;
  v_uid := private.caller_account(k);
  if v_uid is null then
    return jsonb_build_object('error', 'no_account');
  end if;
  v_phone := private.firebase_phone10(p_proof);
  if v_phone is null then
    return jsonb_build_object('error', 'bad_code');
  end if;
  if not (v_phone = any(coalesce(public._turf_phones(p_turf_id), '{}'))) then
    return jsonb_build_object('error', 'not_listed');
  end if;
  select status into v_status from public.turf_owners where turf_id = p_turf_id and user_key = k;
  if v_status = 'active' then
    return jsonb_build_object('status', 'active');
  end if;
  -- Access TapTurf removed stays removed, code or not.
  if v_status = 'revoked' then
    return jsonb_build_object('error', 'revoked');
  end if;
  select left(nullif(btrim(u.name), ''), 80) into v_name from public.users u where u.id = v_uid;

  insert into public.turf_owners (turf_id, user_key, user_id, status, via, name, note, role, verified_phone, created_at, decided_at)
  values (p_turf_id, k, v_uid, 'active', 'phone_match', v_name, left(nullif(trim(p_note), ''), 400), v_role, v_phone, now(), now())
  on conflict (turf_id, user_key) do update
    set user_id = excluded.user_id, status = 'active', via = 'phone_match', name = excluded.name,
        note = coalesce(excluded.note, public.turf_owners.note), role = coalesce(excluded.role, public.turf_owners.role),
        verified_phone = excluded.verified_phone, decided_at = now();

  return jsonb_build_object('status', 'active');
end;
$$;
revoke all on function public.owner_claim_verified(text, text, uuid, text, text) from public;
grant execute on function public.owner_claim_verified(text, text, uuid, text, text) to anon, authenticated;

-- ── Admin: each claim with the account behind it ──────────
create or replace function public.admin_owner_claims(p_firebase_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return coalesce((
    select jsonb_agg(x order by x.pending desc, x.created_at desc) from (
      select o.turf_id, o.user_key, o.status, o.via, o.name, o.note, o.role, o.created_at, o.decided_at,
             o.verified_phone,
             -- The last number they typed for this turf, when it was not on the listing.
             (select c.phone from private.claim_phone_checks c
               where c.user_key = o.user_key and c.turf_id = o.turf_id and c.listed is false
               order by c.at desc limit 1) as phone_given,
             o.status = 'pending' as pending,
             public._is_admin_key(o.user_key) as site_owner,
             t.name as turf_name, t.slug, t.city, t.area, public._turf_phones(t.id) as listed_phones,
             u.id as user_id,
             case when u.id is null then null else jsonb_build_object(
               'id', u.id, 'name', u.name, 'username', un.username,
               'email', coalesce(u.email, au.email), 'phone', u.phone,
               'method', case when au.id is not null then case when au.raw_app_meta_data -> 'providers' @> '["google"]'::jsonb then 'google' else 'email' end
                              when u.phone is not null then 'phone'
                              when u.email is not null then 'email'
                              else 'unknown' end,
               'signed_up_at', least(u.created_at, coalesce(au.created_at, u.created_at)),
               'last_seen', greatest((select max(l.created_at) from public.user_logins l where l.user_id = u.id), au.last_sign_in_at),
               -- A Google account whose sign-in never came back to TapTurf has neither.
               'signin_finished', au.last_sign_in_at is not null or exists (select 1 from public.user_logins l where l.user_id = u.id),
               'other_claims', (select count(*) from public.turf_owners o2
                                 where o2.user_id = u.id and o2.turf_id <> o.turf_id and o2.status in ('active', 'pending'))
             ) end as account
        from public.turf_owners o
        join public.turfs t on t.id = o.turf_id
        left join public.users u on u.id = coalesce(o.user_id, private.account_for_key(o.user_key))
        left join auth.users au on au.id = u.id
        left join public.usernames un on un.user_id = u.id
       order by o.status = 'pending' desc, o.created_at desc
       limit 200
    ) x
  ), '[]'::jsonb);
end;
$$;

-- ── Old claims: link the account ──────────────────────────
update public.turf_owners o
   set user_id = a.uid
  from (select turf_id, user_key, private.account_for_key(user_key) as uid from public.turf_owners where user_id is null) a
 where o.turf_id = a.turf_id and o.user_key = a.user_key and a.uid is not null;
