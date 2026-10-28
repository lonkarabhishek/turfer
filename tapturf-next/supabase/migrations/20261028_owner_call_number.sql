-- myTapturf: an owner can change the turf's call number, not only its
-- WhatsApp number. Apply before the app code that sends owner_phone (the
-- editor shows the call field only once owner_dashboard returns it).
--
-- Body-only changes, same signatures, return types, settings and grants,
-- each copied from the live body (the file named above it) with the
-- changes marked (n):
--   owner_update_turf, marked (3) to (6) after the two marks it already
--     has: patch key owner_phone, a mobile or a landline with its STD code
--     (private.call_phone10, the rules of normalizeIndianPhone in
--     lib/utils/phone.ts), stored as +91 and 10 digits. It replaces every
--     number the Call button could dial (owner_phone, then
--     contact_info.phone, then landline_phone): contact_info.phone, where
--     the key exists, gets the same number (taken out when the owner clears
--     it; other keys kept, never created), landline_phone is emptied, and
--     every old value goes into turf_edit_log.before. The 14-day hold on a
--     claim opened with a code to someone else's number covers it too, and
--     no save may leave the turf with neither a call nor a WhatsApp number.
--     Patch keys contact_info and landline_phone stay ignored.
--   turf_trusted_phones, marked (1): contact_info.phone opens a turf at
--     once only when an owner or a suggestion did not put it there, since
--     it now mirrors an owner's number. Two logged histories say so: its
--     own (owner_update_turf logs contact_info; an owner's number left in
--     it after an approved suggestion moved owner_phone on still counts as
--     the owner's) and owner_phone's (a suggestion logs only owner_phone,
--     and the data team copies it into contact_info by hand). On
--     2026-10-28 this took no number off any production turf.
--   owner_dashboard, marked (1): the turf also returns owner_phone,
--     landline_phone and contact_info.phone (contact_phone), so the editor
--     shows the number the page dials.
--   admin_owner_claims, marked (1): number_edits, the last 5 call or
--     WhatsApp number changes on the claim's turf (at, by, tapturf: made
--     by the site owner, field, from, to). A call number's "from" is the
--     number the Call button dialled before (owner_phone, then
--     contact_info.phone, then landline_phone: the first it can dial), and
--     a listing phone holding another mobile that a save replaced is its
--     own change (field contact_phone).
-- One new helper, private.call_phone10. Written without the destructive
-- SQL keywords. Safe to run again.
--
-- Replaced bodies; md5(pg_proc.prosrc) on production, read 2026-10-28,
-- equals the body in:
--   public.owner_update_turf(text, uuid, jsonb)   20261026_account_links_reads.sql  cf5f39068b40157e2cbad165afd2bbcb
--   private.turf_trusted_phones(uuid)              20261025_claims_account.sql       b1b24305da9bae725c5916277b262285
--   public.owner_dashboard(text, uuid, integer)    20261027_game_reports.sql         86d72528a915294bedd20f59df7450a4
--   public.admin_owner_claims(text)                20261025_claims_account.sql       38f14cb4ff31b01d2689d461242e7cba
-- and the helpers they call are unchanged since: private.number_set_by_others
-- e0654de1cd191d1e00f19e45e8188f66, public._phone10 f833f28ee85cef2b7dc3556e2ef4f47c,
-- public._turf_phones 3b12029749c408d4f6b46e4a728699f9.
-- Check them again right before applying (as postgres):
--   select n.nspname, p.proname, md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where (n.nspname, p.proname) in (('public','owner_update_turf'), ('private','turf_trusted_phones'),
--          ('public','owner_dashboard'), ('public','admin_owner_claims'), ('private','number_set_by_others'),
--          ('public','_phone10'), ('public','_turf_phones'));

set local lock_timeout = '5s';

-- The 10 digits of a number the Call button can dial, or null: a mobile
-- (6 to 9 first) or a landline with its STD code (2 to 5 first), after
-- the 0091, 091, 0 and 91 prefixes normalizeIndianPhone takes off. A 7 or
-- 8 digit number without its STD code, 1800 numbers and foreign numbers
-- are not. Landlines are never a way in (public._phone10 is mobiles only).
create or replace function private.call_phone10(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when d ~ '^[2-9][0-9]{9}$' then d end from (
    select case when length(c) = 12 and left(c, 2) = '91' then substr(c, 3) else c end as d from (
      select case when length(b) = 13 and left(b, 3) = '091' then substr(b, 2)
                  when length(b) = 11 and left(b, 1) = '0' then substr(b, 2) else b end as c from (
        select case when left(a, 2) = '00' then substr(a, 3) else a end as b
          from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as a) a0) b0) c0) d0;
$$;
revoke all on function private.call_phone10(text) from public, anon, authenticated;

-- 20261026_account_links_reads.sql

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
  -- (3) Nor a new call number: the same hold, told by the field asked for.
  if (p_patch ? 'whatsapp_phone' or p_patch ? 'owner_phone') and not public._is_admin_key(k) and exists (
       select 1 from public.turf_owners o
        where o.turf_id = p_turf_id and o.status = 'active'
          -- (1) A claim that lets this sign-in in (_can_manage): this account's, from whichever of
          -- its sign-ins, or one under this key from before claims named the account.
          and ((o.user_key = k and o.user_id is null)
               or (o.user_id is not null and o.user_id = (select private.account_for_key(k))))
          and o.verified_phone is not null and o.user_key <> 'p:' || o.verified_phone
          -- (2) A code to the account's own number is not someone else's.
          and o.verified_phone is distinct from private.account_phone10(o.user_id)
          and o.decided_at > now() - interval '14 days') then
    return jsonb_build_object('error', 'held', 'field', case when p_patch ? 'owner_phone' then 'owner_phone' else 'whatsapp_phone' end);
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
  -- (4) The call number: a mobile or a landline with its STD code, as +91 and 10 digits, or
  -- none. It replaces every number the Call button could dial (owner_phone, then
  -- contact_info.phone, then landline_phone), so the page never falls back to an older one:
  -- contact_info.phone, where the key exists, gets the same number (taken out when cleared;
  -- other keys kept, never created), and landline_phone is emptied. The old values are logged.
  if p_patch ? 'owner_phone' then
    v := nullif(trim(p_patch ->> 'owner_phone'), '');
    if v is not null and private.call_phone10(v) is null then
      return jsonb_build_object('error', 'bad_value', 'field', 'owner_phone');
    end if;
    v := '+91' || private.call_phone10(v);
    v_before := v_before || jsonb_build_object('owner_phone', t.owner_phone);
    v_after := v_after || jsonb_build_object('owner_phone', v);
    if jsonb_typeof(t.contact_info) = 'object' and t.contact_info ? 'phone' then
      v_before := v_before || jsonb_build_object('contact_info', t.contact_info);
      v_after := v_after || jsonb_build_object('contact_info', case when v is null then t.contact_info - 'phone' else jsonb_set(t.contact_info, '{phone}', to_jsonb(v)) end);
    end if;
    if t.landline_phone is not null then
      v_before := v_before || jsonb_build_object('landline_phone', t.landline_phone);
      v_after := v_after || jsonb_build_object('landline_phone', null::text);
    end if;
  end if;
  -- (5) A change of numbers leaves at least one way to reach the turf: a number to call
  -- (what the Call button dials after this save) or a WhatsApp mobile.
  if (v_after ? 'owner_phone' or v_after ? 'whatsapp_phone')
     and (case when v_after ? 'owner_phone' then v_after ->> 'owner_phone'
          else coalesce(private.call_phone10(t.owner_phone), private.call_phone10(t.contact_info ->> 'phone'), private.call_phone10(t.landline_phone)) end) is null
     and public._phone10(case when v_after ? 'whatsapp_phone' then v_after ->> 'whatsapp_phone' else t.whatsapp_phone end) is null then
    return jsonb_build_object('error', 'no_number');
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
    -- (6) The call number and the columns it replaces (4).
    owner_phone = case when v_after ? 'owner_phone' then v_after ->> 'owner_phone' else owner_phone end,
    contact_info = case when v_after ? 'contact_info' then v_after -> 'contact_info' else contact_info end,
    landline_phone = case when v_after ? 'landline_phone' then v_after ->> 'landline_phone' else landline_phone end,
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

-- 20261025_claims_account.sql

create or replace function private.turf_trusted_phones(p_turf_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(x) filter (where x is not null), '{}') from (
    -- (1) The listing's phone, unless an owner or a suggestion put it there. owner_update_turf
    -- writes an owner's call number into it as well as into owner_phone and logs both, so its own
    -- latest logged change counts (a suggestion approved later moves owner_phone on, not this);
    -- a suggestion logs only owner_phone, which the data team copies in, so owner_phone's counts too.
    select case when not private.number_set_by_others(t.id, 'owner_phone', t.contact_info ->> 'phone')
                 and not coalesce((
                   select not public._is_admin_key(l.user_key)
                          and public._phone10(l.after -> 'contact_info' ->> 'phone') is not distinct from public._phone10(t.contact_info ->> 'phone')
                     from public.turf_edit_log l
                    where l.turf_id = t.id and l.after ? 'contact_info'
                      and public._phone10(l.before -> 'contact_info' ->> 'phone') is distinct from public._phone10(l.after -> 'contact_info' ->> 'phone')
                    order by l.created_at desc, l.id desc
                    limit 1), false)
           then public._phone10(t.contact_info ->> 'phone') end as x
      from public.turfs t where t.id = p_turf_id
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

-- 20261027_game_reports.sql

create or replace function public.owner_dashboard(p_token text, p_turf_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  d integer := least(greatest(coalesce(p_days, 30), 7), 90);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  since date := today - (d - 1);
  prev date := since - d;
  t_since timestamptz := since::timestamp at time zone 'Asia/Kolkata';
  t_prev timestamptz := prev::timestamp at time zone 'Asia/Kolkata';
begin
  if not public._can_manage(k, p_turf_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  return jsonb_build_object(
    'days', d,
    'turf', (
      select to_jsonb(x) from (
        select t.id, t.name, t.city, t.area, t.address, t.sports, t.rating, t.total_reviews,
               coalesce(t.cover_image, to_jsonb(t.images) ->> 0) as cover,
               case when jsonb_typeof(t.images) = 'array' then jsonb_array_length(t.images) else 0 end as photos,
               t.morning_price, t.afternoon_price, t.evening_price,
               t.weekend_morning_price, t.weekend_afternoon_price, t.weekend_evening_price,
               t.price_owner_confirmed, t.price_verified_at,
               (t.pricing_bands is not null) as has_listed_bands,
               t.start_time, t.end_time, t.is_24x7, t.closed_days,
               t.has_floodlights, t.is_covered, t.parking_available, t.washroom_available,
               t.changing_room_available, t.has_cafeteria, t.has_drinking_water, t.equipment_provided,
               t.description, t.number_of_grounds, t.surface_type, t.formats, t.whatsapp_phone,
               -- (1) The numbers the Call button picks from, so the editor shows the one it dials.
               t.owner_phone, t.landline_phone, t.contact_info ->> 'phone' as contact_phone
        from public.turfs t where t.id = p_turf_id
      ) x
    ),
    'series', (
      select jsonb_agg(jsonb_build_object('day', g.day, 'views', coalesce(v.views, 0),
                                          'calls', coalesce(c.calls, 0), 'whatsapp', coalesce(c.wa, 0)) order by g.day)
      from (select generate_series(since, today, interval '1 day')::date as day) g
      left join public.turf_daily_views v on v.turf_id = p_turf_id and v.day = g.day
      left join (
        select (created_at at time zone 'Asia/Kolkata')::date as day,
               count(*) filter (where kind = 'call') as calls,
               count(*) filter (where kind = 'whatsapp') as wa
        from public.turf_contact_clicks
        where turf_id = p_turf_id and created_at >= t_since
        group by 1
      ) c on c.day = g.day
    ),
    'prev', jsonb_build_object(
      'views', (select coalesce(sum(views), 0) from public.turf_daily_views where turf_id = p_turf_id and day >= prev and day < since),
      'calls', (select count(*) from public.turf_contact_clicks where turf_id = p_turf_id and kind = 'call' and created_at >= t_prev and created_at < t_since),
      'whatsapp', (select count(*) from public.turf_contact_clicks where turf_id = p_turf_id and kind = 'whatsapp' and created_at >= t_prev and created_at < t_since),
      'ask', (select count(*) from public.ask_queries where created_at >= t_prev and created_at < t_since and filters -> 'shown_ids' ? p_turf_id::text)
    ),
    'ask', (select count(*) from public.ask_queries where created_at >= t_since and filters -> 'shown_ids' ? p_turf_id::text),
    'games', jsonb_build_object(
      'hosted', (select count(*) from public.games where turf_id = p_turf_id and created_at >= t_since),
      'upcoming', (select count(*) from public.games where turf_id = p_turf_id and date >= today and status in ('open', 'upcoming', 'active'))
    ),
    'reviews', jsonb_build_object(
      'tapturf', (select count(*) from public.reviews where turf_id = p_turf_id and source is null and status = 'live'),
      'recent', coalesce((
        select jsonb_agg(r) from (
          select x.id, x.rating, left(x.comment, 300) as comment, coalesce(x.author_name, u.name, 'A player') as author,
                 coalesce(x.source, 'tapturf') as source, x.created_at,
                 x.sport, x.played_when, x.aspects, x.play_again, x.verified_via, x.edited_at
          from public.reviews x
          left join public.users u on u.id = x.user_id and x.source is null
          where x.turf_id = p_turf_id and x.status = 'live'
            -- Every TapTurf report (stars alone say something too); Google rows with text, as before.
            and (x.source is null or (x.comment is not null and length(trim(x.comment)) > 0))
          order by x.created_at desc limit 5
        ) r
      ), '[]'::jsonb)
    ) || private.owner_review_block(p_turf_id),
    'edits', coalesce((
      select jsonb_agg(e) from (
        select created_at, (select array_agg(key) from jsonb_object_keys(after) key) as fields
        from public.turf_edit_log where turf_id = p_turf_id order by created_at desc limit 5
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.owner_dashboard(text, uuid, integer) to anon, authenticated;

-- 20261025_claims_account.sql

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
             -- (1) The last 5 changes to this turf's call or WhatsApp number, newest first, so a
             -- number given on a claim can be matched with one an owner took off the listing. A call
             -- number's "from" is the number the Call button dialled before (getPhone's order:
             -- owner_phone, the listing phone, landline_phone; the first it can dial, else
             -- owner_phone as it was); a listing phone holding another mobile, which the same save
             -- replaced, is its own change (contact_phone).
             coalesce((
               select jsonb_agg(e.j order by e.at desc, e.id desc, e.k) from (
                 select l.created_at as at, l.id, f.k,
                        jsonb_build_object('at', l.created_at, 'by', l.user_key, 'tapturf', public._is_admin_key(l.user_key),
                                           'field', f.k, 'from', f.b, 'to', f.a) as j
                   from public.turf_edit_log l
                   cross join lateral (select coalesce(
                       case when private.call_phone10(l.before ->> 'owner_phone') is not null then l.before ->> 'owner_phone' end,
                       case when private.call_phone10(l.before -> 'contact_info' ->> 'phone') is not null then l.before -> 'contact_info' ->> 'phone' end,
                       case when private.call_phone10(l.before ->> 'landline_phone') is not null then l.before ->> 'landline_phone' end,
                       l.before ->> 'owner_phone') as dialled) d
                   cross join lateral (values
                       ('owner_phone', d.dialled, l.after ->> 'owner_phone', l.after ? 'owner_phone'),
                       ('whatsapp_phone', l.before ->> 'whatsapp_phone', l.after ->> 'whatsapp_phone', l.after ? 'whatsapp_phone'),
                       ('contact_phone', l.before -> 'contact_info' ->> 'phone', l.after -> 'contact_info' ->> 'phone',
                        l.after ? 'contact_info' and public._phone10(l.before -> 'contact_info' ->> 'phone') is not null
                        and public._phone10(l.before -> 'contact_info' ->> 'phone') is distinct from private.call_phone10(d.dialled))) f(k, b, a, has)
                  where l.turf_id = o.turf_id and f.has and f.b is distinct from f.a
                  order by l.created_at desc, l.id desc, f.k
                  limit 5) e
             ), '[]'::jsonb) as number_edits,
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
        -- The account's own auth user; for an e: key on an old-app row (no auth user of its own),
        -- the Google sign-in with that email, which is who made the claim.
        left join lateral (
          select a.id, a.email, a.created_at, a.last_sign_in_at, a.raw_app_meta_data
            from auth.users a
           where a.id = u.id
              or (o.user_key like 'e:%' and lower(a.email) = substr(o.user_key, 3)
                  and a.raw_app_meta_data -> 'providers' @> '["google"]'::jsonb)
           order by (a.id = u.id) desc, a.created_at
           limit 1) au on true
        left join public.usernames un on un.user_id = u.id
       order by o.status = 'pending' desc, o.created_at desc
       limit 200
    ) x
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_owner_claims(text) to anon, authenticated;
