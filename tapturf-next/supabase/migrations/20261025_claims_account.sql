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
-- 8. Which listed numbers open a turf at once: not a WhatsApp number an
--    owner set themselves in myTapturf (private.turf_trusted_phones).
-- 9. Revoked stays revoked: a revoked person can't come back through
--    another sign-in, the same account or the same proved number.
-- 10. A code's proof must be fresh (signed in within 10 minutes). One
--    listed number gets a code at most every 2 minutes and 5 a day, and one
--    sign-in at most 10 a day. A revoked or active claim is answered before
--    any code is sent.
-- 11. _caller_key and _is_site_owner also need the session itself to be a
--    Google one (amr oauth), not only a Google identity on the account.
-- 12. private.turf_owner_events: every claim, code and decision, so a
--    rejection is not lost when someone claims again.
-- 13. A number from an approved public suggestion is logged (moderate_
--    suggestion) and, like an owner-set one, opens nothing at once. A
--    number on a revoked claim only goes to a check by hand: its real
--    holder is never locked out, and the admin can restore the claim.
-- 14. A claim opened with a code to someone else's number can't change the
--    WhatsApp number for 14 days (owner_update_turf).
-- 15. A proof must be a phone sign-in token of TapTurf's own Firebase
--    project (aud, iss), checked before Google is asked.
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
create index if not exists claim_phone_checks_phone_at on private.claim_phone_checks (phone, at);
revoke all on private.claim_phone_checks from public, anon, authenticated;

-- Every claim, code and admin decision, newest last (the claim row keeps only its latest state).
create table if not exists private.turf_owner_events (
  id bigint generated always as identity primary key,
  turf_id uuid not null,
  user_key text not null,
  user_id uuid,
  from_status text,
  to_status text not null,
  how text,
  at timestamptz not null default now()
);
create index if not exists turf_owner_events_turf on private.turf_owner_events (turf_id, user_key, at);
revoke all on private.turf_owner_events from public, anon, authenticated;

-- Was this column's current number put there by an owner or a suggestion (not by TapTurf)?
create or replace function private.number_set_by_others(p_turf_id uuid, p_column text, p_value text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select not public._is_admin_key(l.user_key) and public._phone10(l.after ->> p_column) is not distinct from public._phone10(p_value)
      from public.turf_edit_log l
     where l.turf_id = p_turf_id and l.after ? p_column
     order by l.created_at desc, l.id desc
     limit 1), false);
$$;
revoke all on function private.number_set_by_others(uuid, text, text) from public, anon, authenticated;

-- ── Which listed numbers open a turf at once ──────────────
-- The listing's mobiles (_turf_phones), except:
-- - an owner or WhatsApp number whose current value was set by a myTapturf
--   owner (owner_update_turf) or came from a public suggestion
--   (moderate_suggestion); both log it in turf_edit_log. Someone must not
--   be able to put in a number that gets them, or anyone, in at once.
--   TapTurf's own changes (the site owner, research) still count.
-- - a number on a revoked claim for this turf: it goes to a check by hand.
create or replace function private.turf_trusted_phones(p_turf_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(x) filter (where x is not null), '{}') from (
    select public._phone10(t.contact_info ->> 'phone') as x from public.turfs t where t.id = p_turf_id
    union all
    select case when not private.number_set_by_others(t.id, 'owner_phone', t.owner_phone) then public._phone10(t.owner_phone) end
      from public.turfs t where t.id = p_turf_id
    union all
    select case when not private.number_set_by_others(t.id, 'whatsapp_phone', t.whatsapp_phone) then public._phone10(t.whatsapp_phone) end
      from public.turfs t where t.id = p_turf_id
  ) p
  where not exists (select 1 from public.turf_owners r
                     where r.turf_id = p_turf_id and r.status = 'revoked'
                       and (r.verified_phone = p.x or r.user_key = 'p:' || p.x));
$$;
revoke all on function private.turf_trusted_phones(uuid) from public, anon, authenticated;


-- Was this person turned away from this turf: the same sign-in or the same account. (A number on a
-- revoked claim is not a person: turf_trusted_phones sends it to a check by hand instead, so its real
-- holder can still claim.) p_phone is not used.
create or replace function private.claim_revoked(p_turf_id uuid, p_key text, p_user_id uuid, p_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.turf_owners r
     where r.turf_id = p_turf_id and r.status = 'revoked'
       and (r.user_key = p_key or (p_user_id is not null and r.user_id = p_user_id)));
$$;
revoke all on function private.claim_revoked(uuid, text, uuid, text) from public, anon, authenticated;

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

-- A token's claims (the middle part), read without checking the signature, or null.
create or replace function private.token_claims(p_token text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_part text := split_part(coalesce(p_token, ''), '.', 2);
  v_claims jsonb;
begin
  if v_part = '' then
    return null;
  end if;
  begin
    v_claims := convert_from(decode(rpad(translate(v_part, '-_', '+/'), ((length(v_part) + 3) / 4) * 4, '='), 'base64'), 'utf8')::jsonb;
  exception when others then
    return null;
  end;
  return case when jsonb_typeof(v_claims) = 'object' then v_claims end;
end;
$$;
revoke all on function private.token_claims(text) from public, anon, authenticated;

-- Is this a Firebase ID token of TapTurf's project (by its claims; Google checks the signature)?
create or replace function private.tapturf_token(p_claims jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_claims ->> 'aud' = 'tapturf' and p_claims ->> 'iss' = 'https://securetoken.google.com/tapturf', false);
$$;
revoke all on function private.tapturf_token(jsonb) from public, anon, authenticated;

-- A phone sign-in token of TapTurf's project from the last 10 minutes: its claims, else null.
-- Read without checking the signature: firebase_phone10 asks Google for that.
create or replace function private.fresh_token_claims(p_token text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := private.token_claims(p_token);
begin
  -- coalesce: a missing claim must refuse, not slip through as null.
  if v_claims is null or not private.tapturf_token(v_claims)
     or coalesce(v_claims #>> '{firebase,sign_in_provider}', '') <> 'phone'
     or coalesce(jsonb_typeof(v_claims -> 'auth_time'), '') <> 'number' then
    return null;
  end if;
  if (v_claims ->> 'auth_time')::numeric < extract(epoch from now() - interval '10 minutes') then
    return null;
  end if;
  return v_claims;
end;
$$;
revoke all on function private.fresh_token_claims(text) from public, anon, authenticated;

-- A Firebase ID token's verified phone, as 10 digits (Indian mobiles only), or null. Only a fresh
-- sign-in counts: a code just sent, never an old token for that number lying about.
create or replace function private.firebase_phone10(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_claims jsonb := private.fresh_token_claims(p_token);
begin
  if v_claims is null or length(p_token) < 100 or length(p_token) > 8000
     or p_token !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
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
  -- The number Google vouches for, and the one the token itself names.
  if v_phone is null or v_phone !~ '^\+91[0-9]{10}$' or v_phone is distinct from v_claims ->> 'phone_number' then
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
  -- A Google sign-in: a Google identity, and this session signed in with it
  -- (amr oauth). An email and password session is not one, even on an
  -- account that also has Google; it falls through to the phone check.
  if v_email <> ''
     and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb
     and coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method": "oauth"}]'::jsonb then
    return 'e:' || v_email;
  end if;
  -- Only a token of TapTurf's own project is worth a call to Google.
  if p_token is null or length(p_token) < 100 or length(p_token) > 8000
     or p_token !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
     or not private.tapturf_token(private.token_claims(p_token))
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

-- The site owner, as before (20261021_phone_identity_exact_india.sql), with
-- the same rule for the Google path: this session signed in with Google.
create or replace function public._is_site_owner(p_firebase_token text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) = 'lonkarabhishek00@gmail.com'
     and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb
     and coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method": "oauth"}]'::jsonb then
    return true;
  end if;
  -- Only a token of TapTurf's own project is worth a call to Google.
  if p_firebase_token is null or length(p_firebase_token) < 100 or length(p_firebase_token) > 8000
     or p_firebase_token !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
     or not private.tapturf_token(private.token_claims(p_firebase_token))
     or not exists (select 1 from pg_extension where extname = 'http') then
    return false;
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
    $q$ into v_phone using p_firebase_token;
  exception when others then
    return false;
  end;
  return coalesce(v_phone, '') = '+919403612979';
end;
$$;
revoke all on function public._is_site_owner(text) from public, anon, authenticated;

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
    -- none: no account for this sign-in yet; conflict: the number is on an account it can't open (a Google one).
    'account_state', case when v_uid is not null then 'ok'
                          when left(k, 2) = 'p:' and exists (select 1 from public.users u where u.phone = '+91' || substr(k, 3)) then 'conflict'
                          else 'none' end,
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
        and substr(k, 3) = any(private.turf_trusted_phones(t.id))
        and not exists (select 1 from public.turf_owners o where o.turf_id = t.id and o.user_key = k and o.status in ('active', 'pending'))
        and not private.claim_revoked(t.id, k, v_uid, null)
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
  v_prev text;
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
  -- A waiting phone claim opens once its own number is on the listing.
  if v_status = 'pending' and left(k, 2) = 'p:' and substr(k, 3) = any(coalesce(private.turf_trusted_phones(p_turf_id), '{}'))
     and not private.claim_revoked(p_turf_id, k, v_uid, null) then
    update public.turf_owners set status = 'active', via = 'phone_match', verified_phone = substr(k, 3), decided_at = now(), user_id = coalesce(user_id, v_uid)
     where turf_id = p_turf_id and user_key = k and status = 'pending';
    insert into private.turf_owner_events (turf_id, user_key, user_id, from_status, to_status, how)
    values (p_turf_id, k, v_uid, 'pending', 'active', 'phone_match');
    return jsonb_build_object('status', 'active');
  end if;
  if v_status in ('active', 'pending') then
    -- Same claim again: keep it, and link the account if an old row lacks it.
    update public.turf_owners set user_id = v_uid where turf_id = p_turf_id and user_key = k and user_id is null;
    return jsonb_build_object('status', v_status);
  end if;
  if v_status = 'revoked' or private.claim_revoked(p_turf_id, k, v_uid, null) then
    return jsonb_build_object('error', 'revoked');
  end if;
  if (select count(*) from public.turf_owners where user_key = k and status = 'pending') >= 5 then
    return jsonb_build_object('error', 'too_many');
  end if;

  v_prev := v_status;
  if left(k, 2) = 'p:' and substr(k, 3) = any(coalesce(private.turf_trusted_phones(p_turf_id), '{}')) then
    v_status := 'active';
  else
    v_status := 'pending';
  end if;
  insert into private.turf_owner_events (turf_id, user_key, user_id, from_status, to_status, how)
  values (p_turf_id, k, v_uid, v_prev, v_status, case when v_status = 'active' then 'phone_match' else 'claim' end);

  insert into public.turf_owners (turf_id, user_key, user_id, status, via, name, note, role, verified_phone, created_at, decided_at)
  values (p_turf_id, k, v_uid, v_status, case when v_status = 'active' then 'phone_match' else 'admin' end,
          v_name, left(nullif(trim(p_note), ''), 400), v_role,
          case when v_status = 'active' then substr(k, 3) end, now(),
          case when v_status = 'active' then now() end)
  on conflict (turf_id, user_key) do update
    set user_id = excluded.user_id, status = excluded.status, via = excluded.via, name = excluded.name,
        note = excluded.note, role = excluded.role, verified_phone = excluded.verified_phone,
        created_at = now(), decided_at = excluded.decided_at
    -- Revoked a moment ago by the admin: that stands.
    where public.turf_owners.status <> 'revoked'
  returning status into v_status;
  if v_status is null then
    return jsonb_build_object('error', 'revoked');
  end if;

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
  -- Answered before any code goes out: already in, or turned away.
  if public._is_admin_key(k) or exists (select 1 from public.turf_owners o where o.turf_id = p_turf_id and o.user_key = k and o.status = 'active') then
    return jsonb_build_object('status', 'active');
  end if;
  if private.claim_revoked(p_turf_id, k, private.caller_account(k), v_phone) then
    return jsonb_build_object('error', 'revoked');
  end if;
  if (select count(*) from private.claim_phone_checks c where c.user_key = k and c.at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('error', 'too_many');
  end if;
  v_listed := v_phone = any(coalesce(private.turf_trusted_phones(p_turf_id), '{}'));
  -- On the listing, but it can't open it at once (set by an owner, say): a check by hand.
  if not v_listed and v_phone = any(coalesce(public._turf_phones(p_turf_id), '{}')) then
    insert into private.claim_phone_checks (user_key, turf_id, phone, listed) values (k, p_turf_id, v_phone, false);
    return jsonb_build_object('listed', false, 'blocked', true);
  end if;
  -- A code goes to this number next: one every 2 minutes and 5 a day to one number, whoever asks,
  -- and 10 a day for one sign-in.
  if v_listed then
    if exists (select 1 from private.claim_phone_checks c where c.phone = v_phone and c.listed and c.at > now() - interval '2 minutes') then
      return jsonb_build_object('error', 'wait', 'retry_in',
        ceil(extract(epoch from (select max(c.at) from private.claim_phone_checks c where c.phone = v_phone and c.listed) + interval '2 minutes' - now()))::int);
    end if;
    if (select count(*) from private.claim_phone_checks c where c.phone = v_phone and c.listed and c.at > now() - interval '1 day') >= 5 then
      return jsonb_build_object('error', 'number_busy');
    end if;
    if (select count(*) from private.claim_phone_checks c where c.user_key = k and c.listed and c.at > now() - interval '1 day') >= 10 then
      return jsonb_build_object('error', 'too_many');
    end if;
  end if;
  insert into private.claim_phone_checks (user_key, turf_id, phone, listed) values (k, p_turf_id, v_phone, v_listed);
  return case when v_listed then jsonb_build_object('listed', true, 'retry_in', 120) else jsonb_build_object('listed', false) end;
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
  v_phones := coalesce(private.turf_trusted_phones(p_turf_id), '{}');
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
  -- A person TapTurf turned away is told so, whatever number they prove.
  if private.claim_revoked(p_turf_id, k, v_uid, null) then
    return jsonb_build_object('error', 'revoked');
  end if;
  v_phone := private.firebase_phone10(p_proof);
  if v_phone is null then
    return jsonb_build_object('error', 'bad_code');
  end if;
  if not (v_phone = any(coalesce(private.turf_trusted_phones(p_turf_id), '{}'))) then
    -- On the listing but not one that opens it at once: a check by hand.
    return jsonb_build_object('error', case when v_phone = any(coalesce(public._turf_phones(p_turf_id), '{}')) then 'needs_check' else 'not_listed' end);
  end if;
  select status into v_status from public.turf_owners where turf_id = p_turf_id and user_key = k;
  if v_status = 'active' then
    return jsonb_build_object('status', 'active');
  end if;
  -- Access TapTurf removed stays removed, code or not, whichever sign-in or number they come back with.
  if v_status = 'revoked' or private.claim_revoked(p_turf_id, k, v_uid, v_phone) then
    return jsonb_build_object('error', 'revoked');
  end if;
  insert into private.turf_owner_events (turf_id, user_key, user_id, from_status, to_status, how)
  values (p_turf_id, k, v_uid, v_status, 'active', 'code:' || v_phone);
  select left(nullif(btrim(u.name), ''), 80) into v_name from public.users u where u.id = v_uid;

  insert into public.turf_owners (turf_id, user_key, user_id, status, via, name, note, role, verified_phone, created_at, decided_at)
  values (p_turf_id, k, v_uid, 'active', 'phone_match', v_name, left(nullif(trim(p_note), ''), 400), v_role, v_phone, now(), now())
  on conflict (turf_id, user_key) do update
    set user_id = excluded.user_id, status = 'active', via = 'phone_match', name = excluded.name,
        note = coalesce(excluded.note, public.turf_owners.note), role = coalesce(excluded.role, public.turf_owners.role),
        verified_phone = excluded.verified_phone, decided_at = now()
    -- Revoked a moment ago by the admin: that stands.
    where public.turf_owners.status <> 'revoked'
  returning status into v_status;
  if v_status is null then
    return jsonb_build_object('error', 'revoked');
  end if;

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
             -- The last time TapTurf turned this claim down, if ever.
             (select max(e.at) from private.turf_owner_events e
               where e.turf_id = o.turf_id and e.user_key = o.user_key and e.to_status = 'rejected') as rejected_at,
             -- A number of theirs that still opens this turf at once (worth changing on the listing when revoking).
             (select x from unnest(private.turf_trusted_phones(o.turf_id)) x
               where x = o.verified_phone or 'p:' || x = o.user_key limit 1) as their_listed_phone,
             t.name as turf_name, t.slug, t.city, t.area, public._turf_phones(t.id) as listed_phones,
             u.id as user_id,
             case when u.id is null then null else jsonb_build_object(
               'id', u.id, 'name', u.name, 'username', un.username,
               'email', coalesce(u.email, au.email), 'phone', u.phone,
               -- Only a Google account's email was checked (by Google); an old-app email was typed.
               'email_checked', au.email is not null,
               'method', case when au.id is not null then case when au.raw_app_meta_data -> 'providers' @> '["google"]'::jsonb then 'google' else 'email' end
                              when u.phone is not null then 'phone'
                              when u.email is not null then 'email'
                              else 'unknown' end,
               'signed_up_at', least(u.created_at, coalesce(au.created_at, u.created_at)),
               'last_seen', greatest((select max(l.created_at) from public.user_logins l where l.user_id = u.id), au.last_sign_in_at),
               -- Google accounts only (null otherwise): one whose sign-in never came back to TapTurf has neither.
               'signin_finished', case when au.id is null or not (au.raw_app_meta_data ->> 'provider' = 'google' or au.raw_app_meta_data -> 'providers' @> '["google"]'::jsonb) then null
                                       else au.last_sign_in_at is not null or exists (select 1 from public.user_logins l where l.user_id = au.id) end,
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

-- Admin decisions, as before, now also in the event log.
create or replace function public.admin_decide_owner_claim(p_firebase_token text, p_turf_id uuid, p_user_key text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
  v_uid uuid;
begin
  if not public._is_site_owner(p_firebase_token) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if p_status not in ('active', 'rejected', 'revoked') then
    return jsonb_build_object('error', 'bad_status');
  end if;
  select status, user_id into v_prev, v_uid from public.turf_owners where turf_id = p_turf_id and user_key = p_user_key for update;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  update public.turf_owners set status = p_status, decided_at = now()
  where turf_id = p_turf_id and user_key = p_user_key;
  insert into private.turf_owner_events (turf_id, user_key, user_id, from_status, to_status, how)
  values (p_turf_id, p_user_key, v_uid, v_prev, p_status, 'admin');
  return jsonb_build_object('ok', true);
end;
$$;

-- Approving a suggestion, as before (20261009_suggestion_review.sql), now also logs any phone it
-- changes, so turf_trusted_phones knows a number came from the public.
create or replace function public.moderate_suggestion(p_id uuid, p_action text, p_apply jsonb default '{}'::jsonb, p_firebase_token text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turf uuid;
  v_daily text;
  v_before public.turfs%rowtype;
  v_after jsonb := '{}'::jsonb;
  v_prev jsonb := '{}'::jsonb;
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'bad action';
  end if;
  select turf_id into v_turf from public.turf_suggestions where id = p_id and status = 'pending';
  if v_turf is null then
    return;
  end if;

  if p_action = 'approve' then
    select * into v_before from public.turfs where id = v_turf for update;
    v_daily := p_apply->'opening_hours'->>'daily';
    update public.turfs t set
      owner_phone = coalesce(nullif(p_apply->>'owner_phone', ''), t.owner_phone),
      whatsapp_phone = coalesce(nullif(p_apply->>'whatsapp_phone', ''), t.whatsapp_phone),
      morning_price = coalesce((p_apply->>'morning_price')::numeric, t.morning_price),
      afternoon_price = coalesce((p_apply->>'afternoon_price')::numeric, t.afternoon_price),
      evening_price = coalesce((p_apply->>'evening_price')::numeric, t.evening_price),
      weekend_evening_price = coalesce((p_apply->>'weekend_evening_price')::numeric, t.weekend_evening_price),
      opening_hours = case when v_daily is not null and v_daily <> '' then jsonb_build_object('daily', v_daily) else t.opening_hours end,
      is_24x7 = case when v_daily is not null and v_daily ilike '%24 hours%' then true
                     when v_daily is not null and v_daily <> '' then false
                     else t.is_24x7 end,
      sports = case when jsonb_typeof(p_apply->'sports_add') = 'array'
                    then (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
                          from jsonb_array_elements_text(coalesce(t.sports, '[]'::jsonb) || (p_apply->'sports_add')) x)
                    else t.sports end,
      amenities = case when jsonb_typeof(p_apply->'amenities_add') = 'array'
                       then (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
                             from jsonb_array_elements_text(coalesce(t.amenities, '[]'::jsonb) || (p_apply->'amenities_add')) x)
                       else t.amenities end,
      updated_at = now()
    where t.id = v_turf;
    if nullif(p_apply->>'owner_phone', '') is not null and (p_apply->>'owner_phone') is distinct from v_before.owner_phone then
      v_prev := v_prev || jsonb_build_object('owner_phone', v_before.owner_phone);
      v_after := v_after || jsonb_build_object('owner_phone', p_apply->>'owner_phone');
    end if;
    if nullif(p_apply->>'whatsapp_phone', '') is not null and (p_apply->>'whatsapp_phone') is distinct from v_before.whatsapp_phone then
      v_prev := v_prev || jsonb_build_object('whatsapp_phone', v_before.whatsapp_phone);
      v_after := v_after || jsonb_build_object('whatsapp_phone', p_apply->>'whatsapp_phone');
    end if;
    if v_after <> '{}'::jsonb then
      insert into public.turf_edit_log (turf_id, user_key, before, after) values (v_turf, 'suggestion:' || p_id, v_prev, v_after);
    end if;
  end if;

  update public.turf_suggestions
  set status = case when p_action = 'approve' then 'approved' else 'rejected' end,
      moderated_at = now()
  where id = p_id;
end;
$$;

-- Editing the listing, as before (20261019_mytapturf.sql), with one hold: see the check after bad_patch.
create or replace function public.owner_update_turf(p_token text, p_turf_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  t public.turfs%rowtype;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  f text;
  v text;
  prices text[] := array['morning_price', 'afternoon_price', 'evening_price', 'weekend_morning_price', 'weekend_afternoon_price', 'weekend_evening_price'];
  flags text[] := array['has_floodlights', 'is_covered', 'parking_available', 'washroom_available', 'changing_room_available', 'has_cafeteria', 'has_drinking_water', 'equipment_provided', 'is_24x7'];
  price_touched boolean := false;
  hours_touched boolean := false;
begin
  if not public._can_manage(k, p_turf_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('error', 'bad_patch');
  end if;
  -- Opened with a code to someone else's number: no new WhatsApp number for the first 14 days,
  -- so a code read out to a stranger can't send players' chats elsewhere straight away.
  if p_patch ? 'whatsapp_phone' and not public._is_admin_key(k) and exists (
       select 1 from public.turf_owners o
        where o.turf_id = p_turf_id and o.user_key = k and o.status = 'active'
          and o.verified_phone is not null and o.user_key <> 'p:' || o.verified_phone
          and o.decided_at > now() - interval '14 days') then
    return jsonb_build_object('error', 'held', 'field', 'whatsapp_phone');
  end if;
  select * into t from public.turfs where id = p_turf_id for update;

  foreach f in array prices loop
    if p_patch ? f then
      v := nullif(trim(p_patch ->> f), '');
      if v is not null and (v !~ '^\d{1,6}$' or v::int > 100000) then
        return jsonb_build_object('error', 'bad_value', 'field', f);
      end if;
      v_before := v_before || jsonb_build_object(f, to_jsonb(t) -> f);
      v_after := v_after || jsonb_build_object(f, v::int);
      price_touched := true;
    end if;
  end loop;

  foreach f in array flags loop
    if p_patch ? f then
      if jsonb_typeof(p_patch -> f) not in ('boolean', 'null') then
        return jsonb_build_object('error', 'bad_value', 'field', f);
      end if;
      v_before := v_before || jsonb_build_object(f, to_jsonb(t) -> f);
      v_after := v_after || jsonb_build_object(f, p_patch -> f);
      if f = 'is_24x7' then hours_touched := true; end if;
    end if;
  end loop;

  foreach f in array array['start_time', 'end_time'] loop
    if p_patch ? f then
      v := nullif(trim(p_patch ->> f), '');
      if v is not null and v !~ '^([01]\d|2[0-3]):[0-5]\d$' then
        return jsonb_build_object('error', 'bad_value', 'field', f);
      end if;
      v_before := v_before || jsonb_build_object(f, to_jsonb(t) -> f);
      v_after := v_after || jsonb_build_object(f, v);
      hours_touched := true;
    end if;
  end loop;

  if p_patch ? 'closed_days' then
    v_before := v_before || jsonb_build_object('closed_days', t.closed_days);
    v_after := v_after || jsonb_build_object('closed_days', left(nullif(trim(p_patch ->> 'closed_days'), ''), 60));
  end if;
  if p_patch ? 'description' then
    v_before := v_before || jsonb_build_object('description', t.description);
    v_after := v_after || jsonb_build_object('description', left(nullif(trim(p_patch ->> 'description'), ''), 1500));
  end if;
  if p_patch ? 'surface_type' then
    v_before := v_before || jsonb_build_object('surface_type', t.surface_type);
    v_after := v_after || jsonb_build_object('surface_type', left(nullif(trim(p_patch ->> 'surface_type'), ''), 40));
  end if;
  if p_patch ? 'number_of_grounds' then
    v := nullif(trim(p_patch ->> 'number_of_grounds'), '');
    if v is not null and (v !~ '^\d{1,2}$' or v::int < 1 or v::int > 30) then
      return jsonb_build_object('error', 'bad_value', 'field', 'number_of_grounds');
    end if;
    v_before := v_before || jsonb_build_object('number_of_grounds', t.number_of_grounds);
    v_after := v_after || jsonb_build_object('number_of_grounds', v::int);
  end if;
  if p_patch ? 'formats' then
    if jsonb_typeof(p_patch -> 'formats') <> 'array' or jsonb_array_length(p_patch -> 'formats') > 10
       or exists (select 1 from jsonb_array_elements(p_patch -> 'formats') e where jsonb_typeof(e) <> 'string' or length(e #>> '{}') > 40) then
      return jsonb_build_object('error', 'bad_value', 'field', 'formats');
    end if;
    v_before := v_before || jsonb_build_object('formats', t.formats);
    v_after := v_after || jsonb_build_object('formats', case when jsonb_array_length(p_patch -> 'formats') = 0 then null else p_patch -> 'formats' end);
  end if;
  if p_patch ? 'whatsapp_phone' then
    v := nullif(trim(p_patch ->> 'whatsapp_phone'), '');
    if v is not null and public._phone10(v) is null then
      return jsonb_build_object('error', 'bad_value', 'field', 'whatsapp_phone');
    end if;
    v_before := v_before || jsonb_build_object('whatsapp_phone', t.whatsapp_phone);
    v_after := v_after || jsonb_build_object('whatsapp_phone', case when v is null then null else '+91' || public._phone10(v) end);
  end if;

  if v_after = '{}'::jsonb then
    return jsonb_build_object('ok', true, 'changed', '[]'::jsonb);
  end if;

  update public.turfs set
    morning_price = case when v_after ? 'morning_price' then (v_after ->> 'morning_price')::int else morning_price end,
    afternoon_price = case when v_after ? 'afternoon_price' then (v_after ->> 'afternoon_price')::int else afternoon_price end,
    evening_price = case when v_after ? 'evening_price' then (v_after ->> 'evening_price')::int else evening_price end,
    weekend_morning_price = case when v_after ? 'weekend_morning_price' then (v_after ->> 'weekend_morning_price')::int else weekend_morning_price end,
    weekend_afternoon_price = case when v_after ? 'weekend_afternoon_price' then (v_after ->> 'weekend_afternoon_price')::int else weekend_afternoon_price end,
    weekend_evening_price = case when v_after ? 'weekend_evening_price' then (v_after ->> 'weekend_evening_price')::int else weekend_evening_price end,
    has_floodlights = case when v_after ? 'has_floodlights' then (v_after ->> 'has_floodlights')::boolean else has_floodlights end,
    is_covered = case when v_after ? 'is_covered' then (v_after ->> 'is_covered')::boolean else is_covered end,
    parking_available = case when v_after ? 'parking_available' then (v_after ->> 'parking_available')::boolean else parking_available end,
    washroom_available = case when v_after ? 'washroom_available' then (v_after ->> 'washroom_available')::boolean else washroom_available end,
    changing_room_available = case when v_after ? 'changing_room_available' then (v_after ->> 'changing_room_available')::boolean else changing_room_available end,
    has_cafeteria = case when v_after ? 'has_cafeteria' then (v_after ->> 'has_cafeteria')::boolean else has_cafeteria end,
    has_drinking_water = case when v_after ? 'has_drinking_water' then (v_after ->> 'has_drinking_water')::boolean else has_drinking_water end,
    equipment_provided = case when v_after ? 'equipment_provided' then (v_after ->> 'equipment_provided')::boolean else equipment_provided end,
    is_24x7 = case when v_after ? 'is_24x7' then (v_after ->> 'is_24x7')::boolean else is_24x7 end,
    start_time = case when v_after ? 'start_time' then (v_after ->> 'start_time')::time else start_time end,
    end_time = case when v_after ? 'end_time' then (v_after ->> 'end_time')::time else end_time end,
    closed_days = case when v_after ? 'closed_days' then v_after ->> 'closed_days' else closed_days end,
    description = case when v_after ? 'description' then v_after ->> 'description' else description end,
    surface_type = case when v_after ? 'surface_type' then v_after ->> 'surface_type' else surface_type end,
    number_of_grounds = case when v_after ? 'number_of_grounds' then (v_after ->> 'number_of_grounds')::int else number_of_grounds end,
    formats = case when v_after ? 'formats' then v_after -> 'formats' else formats end,
    whatsapp_phone = case when v_after ? 'whatsapp_phone' then v_after ->> 'whatsapp_phone' else whatsapp_phone end,
    -- The owner's own hours replace researched opening_hours text.
    opening_hours = case when hours_touched then null else opening_hours end,
    price_owner_confirmed = case when price_touched then true else price_owner_confirmed end,
    price_verified_at = case when price_touched then now() else price_verified_at end,
    price_unit = case when price_touched and price_unit is null then 'per_hour' else price_unit end,
    updated_at = now()
  where id = p_turf_id;

  insert into public.turf_edit_log (turf_id, user_key, before, after) values (p_turf_id, k, v_before, v_after);
  return jsonb_build_object('ok', true, 'changed', (select jsonb_agg(key) from jsonb_object_keys(v_after) key));
end;
$$;

-- ── Old claims: link the account ──────────────────────────
update public.turf_owners o
   set user_id = a.uid
  from (select turf_id, user_key, private.account_for_key(user_key) as uid from public.turf_owners where user_id is null) a
 where o.turf_id = a.turf_id and o.user_key = a.user_key and a.uid is not null;
