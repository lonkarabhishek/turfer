-- One TapTurf account, two ways in: what myTapturf and the admin read.
-- Apply right after 20261026_account_links.sql (it uses its rules).
--
-- Body-only changes, same signatures and return types, each copied from the
-- live body (the file named above it) with the changes marked (n):
--   _can_manage, owner_home, owner_claim, owner_claim_verified,
--   owner_update_turf: a claim belongs to the account, so either of its
--     sign-ins (the phone, or the Google account added to it; Google, or
--     the number added to it) sees and manages it, and never makes a
--     second claim on the same turf.
--   admin_people, get_recent_logins: a Google sign-in counts for the
--     account it opens (a linked phone account, an old-app row), and a code
--     exchange that only added Google to a phone account is not a sign-in.
--     A Google account's myTapturf key is the phone account's it was added
--     to, never its own row's (an empty one the link was made over).
-- One new helper, private.account_phone10. Written without the destructive
-- SQL keywords. Safe to run again.

set local lock_timeout = '5s';

-- The 10 digits of the number this account opens with by OTP (its phone
-- sign-in, or a number proved from the profile), or null.
create or replace function private.account_phone10(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public._phone10(u.phone::text)
    from public.users u
   where u.id = p_user_id and u.phone is not null
     and private.phone_account(u.phone::text) = u.id;
$$;
revoke all on function private.account_phone10(uuid) from public, anon, authenticated;

-- 20261019_mytapturf.sql

create or replace function public._can_manage(p_key text, p_turf_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_key is not null and (
    public._is_admin_key(p_key)
    or exists (select 1 from public.turf_owners o where o.turf_id = p_turf_id and o.user_key = p_key and o.status = 'active')
    -- (1) The same account's claim made from its other sign-in.
    or exists (select 1 from public.turf_owners o
                where o.turf_id = p_turf_id and o.status = 'active'
                  and o.user_id is not null and o.user_id = private.caller_account(p_key))
  );
$$;

revoke all on function public._can_manage(text, uuid) from public, anon, authenticated;

-- 20261025_claims_account.sql

create or replace function public.owner_home(p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  v_uid uuid;
  v_p10 text;
begin
  if k is null then
    return jsonb_build_object('signed_in', false);
  end if;
  v_uid := private.caller_account(k);
  -- (1) The number this account opens with: the phone sign-in's own, or a verified one on the account.
  v_p10 := case when left(k, 2) = 'p:' then substr(k, 3) else private.account_phone10(v_uid) end;
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
    -- (2) The account's claims from either of its sign-ins, one per turf.
    'turfs', coalesce((
      select jsonb_agg(x.j order by x.status, x.created_at) from (
        select distinct on (o.turf_id) o.status, o.created_at,
               jsonb_build_object(
                 'id', t.id, 'name', t.name, 'city', t.city, 'area', t.area,
                 'cover', coalesce(t.cover_image, to_jsonb(t.images) ->> 0),
                 'status', o.status, 'via', o.via, 'since', o.created_at) as j
          from public.turf_owners o join public.turfs t on t.id = o.turf_id
         where o.status in ('active', 'pending')
           and (o.user_key = k or (v_uid is not null and o.user_id = v_uid))
         order by o.turf_id, (o.status = 'active') desc, (o.user_key = k) desc, o.created_at
      ) x
    ), '[]'::jsonb),
    -- (3) Turfs that list the account's number, from either sign-in.
    'matches', case when v_p10 is not null then coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'city', t.city, 'area', t.area,
                                          'cover', coalesce(t.cover_image, to_jsonb(t.images) ->> 0)))
      from public.turfs t
      where t.is_active
        and v_p10 in (public._phone10(t.contact_info ->> 'phone'), public._phone10(t.owner_phone), public._phone10(t.whatsapp_phone))
        and v_p10 = any(private.turf_trusted_phones(t.id))
        and not exists (select 1 from public.turf_owners o
                         where o.turf_id = t.id and (o.user_key = k or (v_uid is not null and o.user_id = v_uid))
                           and o.status in ('active', 'pending'))
        and not private.claim_revoked(t.id, k, v_uid, null)
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

grant execute on function public.owner_home(text) to anon, authenticated;

-- 20261025_claims_account.sql

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
  v_p10 text;
  v_okey text;
  v_ostatus text;
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
  -- (1) The number this account opens with, from either sign-in.
  v_p10 := case when left(k, 2) = 'p:' then substr(k, 3) else private.account_phone10(v_uid) end;
  select status into v_status from public.turf_owners where turf_id = p_turf_id and user_key = k;
  -- A waiting phone claim opens once its own number is on the listing.
  if v_status = 'pending' and v_p10 is not null and v_p10 = any(coalesce(private.turf_trusted_phones(p_turf_id), '{}'))
     and not private.claim_revoked(p_turf_id, k, v_uid, null) then
    update public.turf_owners set status = 'active', via = 'phone_match', verified_phone = v_p10, decided_at = now(), user_id = coalesce(user_id, v_uid)
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
  -- (2) The same account's claim from its other sign-in: that one, never a second row.
  if v_status is distinct from 'revoked' then
    select o.user_key, o.status into v_okey, v_ostatus from public.turf_owners o
     where o.turf_id = p_turf_id and o.user_key <> k and o.user_id = v_uid and o.status in ('active', 'pending')
     order by (o.status = 'active') desc, o.created_at
     limit 1;
    if v_ostatus = 'pending' and v_p10 is not null and v_p10 = any(coalesce(private.turf_trusted_phones(p_turf_id), '{}'))
       and not private.claim_revoked(p_turf_id, k, v_uid, null) then
      update public.turf_owners set status = 'active', via = 'phone_match', verified_phone = v_p10, decided_at = now()
       where turf_id = p_turf_id and user_key = v_okey and status = 'pending';
      insert into private.turf_owner_events (turf_id, user_key, user_id, from_status, to_status, how)
      values (p_turf_id, v_okey, v_uid, 'pending', 'active', 'phone_match');
      return jsonb_build_object('status', 'active');
    end if;
    if v_ostatus is not null then
      return jsonb_build_object('status', v_ostatus);
    end if;
  end if;
  if v_status = 'revoked' or private.claim_revoked(p_turf_id, k, v_uid, null) then
    return jsonb_build_object('error', 'revoked');
  end if;
  if (select count(*) from public.turf_owners where (user_key = k or (user_id is not null and user_id = v_uid)) and status = 'pending') >= 5 then
    return jsonb_build_object('error', 'too_many');
  end if;

  v_prev := v_status;
  if v_p10 is not null and v_p10 = any(coalesce(private.turf_trusted_phones(p_turf_id), '{}')) then
    v_status := 'active';
  else
    v_status := 'pending';
  end if;
  insert into private.turf_owner_events (turf_id, user_key, user_id, from_status, to_status, how)
  values (p_turf_id, k, v_uid, v_prev, v_status, case when v_status = 'active' then 'phone_match' else 'claim' end);

  insert into public.turf_owners (turf_id, user_key, user_id, status, via, name, note, role, verified_phone, created_at, decided_at)
  values (p_turf_id, k, v_uid, v_status, case when v_status = 'active' then 'phone_match' else 'admin' end,
          v_name, left(nullif(trim(p_note), ''), 400), v_role,
          case when v_status = 'active' then v_p10 end, now(),
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

-- 20261025_claims_account.sql

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
  v_okey text;
  v_ostatus text;
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
  -- (1) The same account's claim from its other sign-in: open that one, never a second row.
  if v_status is null then
    select o.user_key, o.status into v_okey, v_ostatus from public.turf_owners o
     where o.turf_id = p_turf_id and o.user_key <> k and o.user_id = v_uid and o.status in ('active', 'pending')
     order by (o.status = 'active') desc, o.created_at
     limit 1;
    if v_ostatus = 'active' then
      return jsonb_build_object('status', 'active');
    end if;
    if v_ostatus = 'pending' and not private.claim_revoked(p_turf_id, k, v_uid, v_phone) then
      update public.turf_owners
         set status = 'active', via = 'phone_match', verified_phone = v_phone, decided_at = now(),
             note = coalesce(left(nullif(trim(p_note), ''), 400), note), role = coalesce(v_role, role)
       where turf_id = p_turf_id and user_key = v_okey and status = 'pending';
      insert into private.turf_owner_events (turf_id, user_key, user_id, from_status, to_status, how)
      values (p_turf_id, v_okey, v_uid, 'pending', 'active', 'code:' || v_phone);
      return jsonb_build_object('status', 'active');
    end if;
  end if;
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

-- 20261025_claims_account.sql

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
  -- so a code read out to a stranger can't send players' chats elsewhere straight away. (Whoever
  -- then signs in with that number itself is, for TapTurf, its holder, and is not held.)
  if p_patch ? 'whatsapp_phone' and not public._is_admin_key(k) and exists (
       select 1 from public.turf_owners o
        where o.turf_id = p_turf_id and o.status = 'active'
          -- (1) The claim of this account, from whichever of its sign-ins.
          and (o.user_key = k or (o.user_id is not null and o.user_id = private.caller_account(k)))
          and o.verified_phone is not null and o.user_key <> 'p:' || o.verified_phone
          -- (2) A code to the account's own number is not someone else's.
          and o.verified_phone is distinct from private.account_phone10(o.user_id)
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

grant execute on function public.owner_update_turf(text, uuid, jsonb) to anon, authenticated;

-- 20261022_people_fixes.sql

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
      -- (1) Counted for the account the sign-in opens (a linked phone account, an old-app row), once.
      -- (2) A code exchange that only added this Google account to a phone account is not a sign-in.
      select distinct on (m.user_id) m.user_id, au.last_sign_in_at as at,
             case when au.raw_app_meta_data ->> 'provider' = 'google' or au.raw_app_meta_data -> 'providers' @> '["google"]'::jsonb then 'google' else 'email' end as method
        from auth.users au
        cross join lateral (select coalesce(private.google_account(au.id), au.id) as user_id) m
       where au.last_sign_in_at is not null
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
             and private.phone_account(uu.phone::text) = uu.id
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
      -- (6) By the keys the account holds, and by the account the claim was made for.
      select c.user_id,
             jsonb_agg(jsonb_build_object(
                         'turf', coalesce(t.name::text, 'A removed turf'),
                         'slug', t.slug,
                         'status', tow.status,
                         'role', tow.role) order by tow.created_at desc, tow.turf_id) as list
        from (select k.user_id, tow0.turf_id, tow0.user_key
                from keys k join public.turf_owners tow0 on tow0.user_key = k.user_key
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

-- 20261022_people_fixes.sql

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
    -- (1) Listed under the account the sign-in opens; a Google sign-in that opens none is not a TapTurf login.
    -- (2) A code exchange that only added this Google account to a phone account is not a sign-in.
    select m.user_id, 'google'::text, au.last_sign_in_at
    from auth.users au
    cross join lateral (select private.google_account(au.id) as user_id) m
    where au.last_sign_in_at is not null
      and m.user_id is not null
      and not exists (
        select 1 from private.account_link_legs lg
        where lg.auth_uid = au.id
          and lg.returned_at between au.last_sign_in_at - interval '10 minutes' and au.last_sign_in_at + interval '10 minutes'
      )
      and not exists (
        select 1 from public.user_logins x
        where x.user_id = m.user_id and x.method = 'google' and x.created_at >= au.last_sign_in_at - interval '10 minutes'
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
