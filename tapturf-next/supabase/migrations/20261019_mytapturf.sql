-- myTapturf: the owner side of TapTurf.
--
-- Owners are identified the same way /admin is: a Google sign-in comes
-- through auth.jwt() (email), a phone sign-in sends its Firebase ID
-- token, which we check with Google (identitytoolkit accounts:lookup)
-- to get the verified phone number. Nothing the browser says about who
-- it is gets trusted. A caller is a key: 'p:9876543210' or 'e:name@x.com'.
--
-- Access: a phone sign-in whose number is listed on the turf gets in
-- straight away; anyone else files a claim the site owner approves.
-- All tables are RLS-locked with no policies; only these functions
-- touch them.

create table if not exists public.turf_owners (
  turf_id uuid not null,
  user_key text not null,
  status text not null check (status in ('active', 'pending', 'rejected', 'revoked')),
  via text not null check (via in ('phone_match', 'admin')),
  name text,
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (turf_id, user_key)
);
create index if not exists turf_owners_key on public.turf_owners (user_key);
alter table public.turf_owners enable row level security;
revoke all on public.turf_owners from anon, authenticated;

create table if not exists public.turf_edit_log (
  id bigserial primary key,
  turf_id uuid not null,
  user_key text not null,
  before jsonb not null,
  after jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists turf_edit_log_turf on public.turf_edit_log (turf_id, created_at desc);
alter table public.turf_edit_log enable row level security;
revoke all on public.turf_edit_log from anon, authenticated;

-- One row per turf per India day, counted from turf page loads (people
-- with JavaScript, so crawlers mostly don't count).
create table if not exists public.turf_daily_views (
  turf_id uuid not null,
  day date not null,
  views integer not null default 0,
  primary key (turf_id, day)
);
alter table public.turf_daily_views enable row level security;
revoke all on public.turf_daily_views from anon, authenticated;

create or replace function public.log_turf_view(p_turf_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.turf_daily_views (turf_id, day, views)
  select p_turf_id, (now() at time zone 'Asia/Kolkata')::date, 1
  where exists (select 1 from public.turfs where id = p_turf_id and is_active)
  on conflict (turf_id, day) do update set views = public.turf_daily_views.views + 1;
$$;
revoke all on function public.log_turf_view(uuid) from public;
grant execute on function public.log_turf_view(uuid) to anon, authenticated;

-- ── Identity ──────────────────────────────────────────────

create or replace function public._phone10(p text)
returns text
language sql
immutable
as $$
  select case when length(d) >= 10 and right(d, 10) ~ '^[6-9]' then right(d, 10) end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

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
  if v_email <> '' then
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
  v_phone := public._phone10(v_phone);
  return case when v_phone is null then null else 'p:' || v_phone end;
end;
$$;

-- The site owner (same two identities as _is_site_owner) can open any turf.
create or replace function public._is_admin_key(p_key text)
returns boolean
language sql
immutable
as $$
  select p_key in ('e:lonkarabhishek00@gmail.com', 'p:9403612979');
$$;

create or replace function public._turf_phones(p_turf_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_remove(array[
    public._phone10(t.contact_info ->> 'phone'),
    public._phone10(t.owner_phone),
    public._phone10(t.whatsapp_phone)
  ], null)
  from public.turfs t where t.id = p_turf_id;
$$;

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
  );
$$;

-- ── Owner home: my turfs, my claims, turfs listing my number ──

create or replace function public.owner_home(p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
begin
  if k is null then
    return jsonb_build_object('signed_in', false);
  end if;
  return jsonb_build_object(
    'signed_in', true,
    'who', substr(k, 3),
    'kind', case when left(k, 2) = 'p:' then 'phone' else 'email' end,
    'admin', public._is_admin_key(k),
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

-- ── Claim a turf ──────────────────────────────────────────

create or replace function public.owner_claim(p_token text, p_turf_id uuid, p_name text default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  v_status text;
begin
  if k is null then
    return jsonb_build_object('error', 'sign_in');
  end if;
  if not exists (select 1 from public.turfs where id = p_turf_id and is_active) then
    return jsonb_build_object('error', 'not_found');
  end if;
  select status into v_status from public.turf_owners where turf_id = p_turf_id and user_key = k;
  if v_status in ('active', 'pending') then
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

  insert into public.turf_owners (turf_id, user_key, status, via, name, note, created_at, decided_at)
  values (p_turf_id, k, v_status, case when v_status = 'active' then 'phone_match' else 'admin' end,
          left(nullif(trim(p_name), ''), 80), left(nullif(trim(p_note), ''), 400), now(),
          case when v_status = 'active' then now() end)
  on conflict (turf_id, user_key) do update
    set status = excluded.status, via = excluded.via, name = excluded.name, note = excluded.note,
        created_at = now(), decided_at = excluded.decided_at;

  return jsonb_build_object('status', v_status);
end;
$$;

-- ── Dashboard: listing, stats for a window, and the window before ──

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
               t.description, t.number_of_grounds, t.surface_type, t.formats, t.whatsapp_phone
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
      'tapturf', (select count(*) from public.reviews where turf_id = p_turf_id and source is null),
      'recent', coalesce((
        select jsonb_agg(r) from (
          select rating, left(comment, 300) as comment, coalesce(author_name, 'A player') as author,
                 coalesce(source, 'tapturf') as source, created_at
          from public.reviews where turf_id = p_turf_id and comment is not null and length(trim(comment)) > 0
          order by created_at desc limit 5
        ) r
      ), '[]'::jsonb)
    ),
    'edits', coalesce((
      select jsonb_agg(e) from (
        select created_at, (select array_agg(key) from jsonb_object_keys(after) key) as fields
        from public.turf_edit_log where turf_id = p_turf_id order by created_at desc limit 5
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

-- ── Edit the listing: a fixed list of fields, each checked ──

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

-- Can this caller manage this turf? (The revalidate route asks.)
create or replace function public.owner_can_manage(p_token text, p_turf_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public._can_manage(public._caller_key(p_token), p_turf_id);
$$;

-- ── Admin: the claim queue ────────────────────────────────

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
      select o.turf_id, o.user_key, o.status, o.via, o.name, o.note, o.created_at, o.decided_at,
             o.status = 'pending' as pending,
             t.name as turf_name, t.city, t.area, public._turf_phones(t.id) as listed_phones
      from public.turf_owners o join public.turfs t on t.id = o.turf_id
      order by o.status = 'pending' desc, o.created_at desc
      limit 200
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_decide_owner_claim(p_firebase_token text, p_turf_id uuid, p_user_key text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if p_status not in ('active', 'rejected', 'revoked') then
    return jsonb_build_object('error', 'bad_status');
  end if;
  update public.turf_owners set status = p_status, decided_at = now()
  where turf_id = p_turf_id and user_key = p_user_key;
  return jsonb_build_object('ok', found);
end;
$$;

-- Callable from the browser (the functions check the caller themselves).
revoke all on function public._caller_key(text) from public, anon, authenticated;
revoke all on function public._turf_phones(uuid) from public, anon, authenticated;
revoke all on function public._can_manage(text, uuid) from public, anon, authenticated;
grant execute on function public.owner_home(text) to anon, authenticated;
grant execute on function public.owner_claim(text, uuid, text, text) to anon, authenticated;
grant execute on function public.owner_dashboard(text, uuid, integer) to anon, authenticated;
grant execute on function public.owner_update_turf(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.owner_can_manage(text, uuid) to anon, authenticated;
grant execute on function public.admin_owner_claims(text) to anon, authenticated;
grant execute on function public.admin_decide_owner_claim(text, uuid, text, text) to anon, authenticated;
