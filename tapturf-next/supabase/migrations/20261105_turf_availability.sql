-- Free slots. The site owner asked (5 Nov 2026) for a super simple way for
-- owners to keep their turf's free hours on myTapturf, and for turf pages to
-- show them. An owner taps each hour of their opening hours Free or Booked
-- (/my/turf/<id>, components/my/FreeSlots.tsx); a claimed turf's page shows
-- the free start times while the owner changed or confirmed them within the
-- last 24 hours (components/turf/FreeSlotsCard.tsx, read in the browser from
-- GET /api/availability/<turf id>). Which hours are slots is worked out from
-- the turf's own opening hours by lib/availability/slots.ts; the database
-- only keeps marks.
--
-- Where:
--   private.turf_availability: one row per turf, updated_at = the last tap
--     or "All correct" by a manager. Players see the slots while it is less
--     than 24 hours old (private.slots_fresh, FRESH_HOURS in slots.ts).
--   private.turf_slots: one row per (turf, slot start) an owner has
--     touched, status 'free' or 'booked'. An hour with no row is free.
--     Freeing an hour is an upsert of its status to 'free'; rows are never
--     removed. A slot key is its start in India time, 'YYYY-MM-DDTHH:MI'
--     (an after-midnight hour has the next calendar date).
--   No name, number, email, account or sign-in key of anyone is stored:
--   slot status and times only. turf_edit_log is not written.
--
-- Functions (security definer, search_path ''; anon and authenticated may
-- call the public ones, PUBLIC may not; the private ones nobody but their
-- owner):
--   owner_slots(p_token, p_turf_id): the owner's view.
--   owner_set_slots(p_token, p_turf_id, p_changes): marks hours.
--   owner_confirm_slots(p_token, p_turf_id): "All correct", no mark changes.
--   turf_availability(p_turf_id): the public read, slot status and the last
--     update time only, and only for an active claimed turf whose marks are
--     fresh.
-- The owner functions take the caller from public._caller_key (a Google
-- session or a Firebase phone token the database checks itself) and allow
-- public._can_manage's rule (an active claim, or the site owner), and only
-- on an active claimed turf, as owner_set_roof does.
--
-- Nothing here writes or locks public.turfs, so private.mark_turf_dirty
-- never fires on a save and no page cache is purged: marks change far too
-- often for that. The app works before this file (the owner section hides
-- itself, the route answers {"fresh": false}).
-- Additive. Written without the destructive SQL keywords. No grant or
-- policy on a public table changes. Safe to run again.
--
-- Helpers it calls, unchanged since:
--   public._caller_key(text)        20261025_claims_account.sql
--   public._can_manage(text, uuid)  20261026_account_links_reads.sql
--   public.turfs.claimed            20261025_turf_claimed.sql

set local lock_timeout = '5s';

create table if not exists private.turf_availability (
  turf_id uuid primary key,
  updated_at timestamptz not null,
  created_at timestamptz not null default now()
);
comment on table private.turf_availability is
  'Free slots: when a manager last changed or confirmed a turf''s slots (myTapturf). Players see them for 24 hours after. No personal data. 20261105_turf_availability.sql';

create table if not exists private.turf_slots (
  turf_id uuid not null,
  starts_at timestamptz not null,
  status text not null check (status in ('free', 'booked')),
  updated_at timestamptz not null default now(),
  primary key (turf_id, starts_at)
);
comment on table private.turf_slots is
  'Free slots: an hour an owner marked free or booked on myTapturf (no row: free). Slot status and times only, no person. 20261105_turf_availability.sql';

alter table private.turf_availability enable row level security;
alter table private.turf_slots enable row level security;
revoke all on table private.turf_availability from public, anon, authenticated;
revoke all on table private.turf_slots from public, anon, authenticated;

-- FRESH_HOURS in lib/availability/slots.ts.
create or replace function private.slots_fresh()
returns interval language sql immutable set search_path = '' as $$ select interval '24 hours' $$;

-- AHEAD_DAYS in lib/availability/slots.ts: the 7 days shown plus the last one's after-midnight hours.
create or replace function private.slots_ahead()
returns interval language sql immutable set search_path = '' as $$ select interval '8 days' $$;

-- A slot key, 'YYYY-MM-DDTHH:MI' in India time, as the instant it names; null for anything else.
create or replace function private.slot_at(p_key text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_key is null or p_key !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$' then
    return null;
  end if;
  return p_key::timestamp at time zone 'Asia/Kolkata';
exception when others then
  return null;
end;
$$;

-- The slot key of an instant: its India date and time.
create or replace function private.slot_key(p_at timestamptz)
returns text language sql stable set search_path = '' as $$
  select to_char(p_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI')
$$;

-- The booked slots that have not started yet, within the window, in time order.
create or replace function private.turf_booked(p_turf_id uuid, p_now timestamptz)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(private.slot_key(s.starts_at) order by s.starts_at), '[]'::jsonb)
    from private.turf_slots s
   where s.turf_id = p_turf_id
     and s.status = 'booked'
     and s.starts_at > p_now
     and s.starts_at < p_now + private.slots_ahead()
$$;

-- What the owner's section draws from: the hours the turf page shows, the last update, the booked slots.
create or replace function private.turf_slots_state(p_turf_id uuid, p_now timestamptz)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'ok', true,
    'now', p_now,
    'updated_at', (select a.updated_at from private.turf_availability a where a.turf_id = t.id),
    'grounds', t.number_of_grounds,
    'hours', jsonb_build_object(
      'opening_hours', t.opening_hours,
      'start_time', t.start_time,
      'end_time', t.end_time,
      'is_24x7', t.is_24x7,
      'closed_days', t.closed_days),
    'booked', private.turf_booked(t.id, p_now))
    from public.turfs t
   where t.id = p_turf_id
$$;

-- Who may use the owner functions: null when allowed, else the error.
create or replace function private.slots_guard(p_token text, p_turf_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := public._caller_key(p_token);
  v_live boolean;
begin
  if not coalesce(public._can_manage(k, p_turf_id), false) then
    return 'forbidden';
  end if;
  select (t.claimed and coalesce(t.is_active, false)) into v_live from public.turfs t where t.id = p_turf_id;
  if not found then
    return 'forbidden';
  end if;
  if not coalesce(v_live, false) then
    return 'not_claimed';
  end if;
  return null;
end;
$$;

-- Marks hours. p_changes: [{"at": "2026-11-05T19:00", "status": "booked"}, ...], 1 to 100 items
-- (MAX_CHANGES), all checked before anything is written. The same key twice: the last one wins.
-- Keys that have started (at or before p_now) or lie past the window are skipped, not refused.
-- Any key saved counts as a check of every day: updated_at moves to p_now.
create or replace function private.turf_slots_apply(p_turf_id uuid, p_changes jsonb, p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_keys int;
  n_in int;
  n_changed int;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    return jsonb_build_object('error', 'bad_value');
  end if;
  if jsonb_array_length(p_changes) > 100 then
    return jsonb_build_object('error', 'too_many');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_changes) e
     where jsonb_typeof(e) <> 'object'
        or jsonb_typeof(e -> 'at') is distinct from 'string'
        or jsonb_typeof(e -> 'status') is distinct from 'string'
        or (e ->> 'status') not in ('free', 'booked')
        or private.slot_at(e ->> 'at') is null
  ) then
    return jsonb_build_object('error', 'bad_value');
  end if;

  with c as (
    select distinct on (x.at) x.at, x.status
      from (select private.slot_at(j.e ->> 'at') as at, j.e ->> 'status' as status, j.i
              from jsonb_array_elements(p_changes) with ordinality as j(e, i)) x
     order by x.at, x.i desc
  ), w as (
    select c.at, c.status from c
     where c.at > p_now and c.at < p_now + private.slots_ahead()
  ), up as (
    insert into private.turf_slots as s (turf_id, starts_at, status, updated_at)
    select p_turf_id, w.at, w.status, p_now from w
    on conflict (turf_id, starts_at) do update
       set status = excluded.status, updated_at = excluded.updated_at
     where s.status is distinct from excluded.status
    returning 1
  )
  select (select count(*) from c), (select count(*) from w), (select count(*) from up)
    into n_keys, n_in, n_changed;

  if n_in > 0 then
    insert into private.turf_availability as a (turf_id, updated_at) values (p_turf_id, p_now)
    on conflict (turf_id) do update set updated_at = greatest(a.updated_at, excluded.updated_at);
  end if;
  return private.turf_slots_state(p_turf_id, p_now)
    || jsonb_build_object('saved', n_in, 'changed', n_changed, 'skipped', n_keys - n_in);
end;
$$;

-- "All correct": the marks stay as they are, updated_at moves to p_now.
create or replace function private.turf_slots_confirm(p_turf_id uuid, p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.turf_availability as a (turf_id, updated_at) values (p_turf_id, p_now)
  on conflict (turf_id) do update set updated_at = greatest(a.updated_at, excluded.updated_at);
  return private.turf_slots_state(p_turf_id, p_now);
end;
$$;

-- The public read at p_now: {"fresh": true, "updated_at", "now", "booked": [keys]} for an active
-- claimed turf whose marks were changed or confirmed within 24 hours; {"fresh": false} otherwise.
create or replace function private.turf_availability_at(p_turf_id uuid, p_now timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object(
              'fresh', true,
              'updated_at', a.updated_at,
              'now', p_now,
              'booked', private.turf_booked(a.turf_id, p_now))
       from private.turf_availability a
       join public.turfs t on t.id = a.turf_id
      where a.turf_id = p_turf_id
        and t.claimed
        and coalesce(t.is_active, false)
        and a.updated_at > p_now - private.slots_fresh()),
    jsonb_build_object('fresh', false))
$$;

revoke all on function private.slots_fresh() from public, anon, authenticated;
revoke all on function private.slots_ahead() from public, anon, authenticated;
revoke all on function private.slot_at(text) from public, anon, authenticated;
revoke all on function private.slot_key(timestamptz) from public, anon, authenticated;
revoke all on function private.turf_booked(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.turf_slots_state(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.slots_guard(text, uuid) from public, anon, authenticated;
revoke all on function private.turf_slots_apply(uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function private.turf_slots_confirm(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.turf_availability_at(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.owner_slots(p_token text, p_turf_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err text := private.slots_guard(p_token, p_turf_id);
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  return private.turf_slots_state(p_turf_id, now());
end;
$$;

create or replace function public.owner_set_slots(p_token text, p_turf_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err text := private.slots_guard(p_token, p_turf_id);
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  return private.turf_slots_apply(p_turf_id, p_changes, now());
end;
$$;

create or replace function public.owner_confirm_slots(p_token text, p_turf_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err text := private.slots_guard(p_token, p_turf_id);
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  return private.turf_slots_confirm(p_turf_id, now());
end;
$$;

create or replace function public.turf_availability(p_turf_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.turf_availability_at(p_turf_id, now())
$$;

revoke all on function public.owner_slots(text, uuid) from public;
revoke all on function public.owner_set_slots(text, uuid, jsonb) from public;
revoke all on function public.owner_confirm_slots(text, uuid) from public;
revoke all on function public.turf_availability(uuid) from public;
grant execute on function public.owner_slots(text, uuid) to anon, authenticated;
grant execute on function public.owner_set_slots(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.owner_confirm_slots(text, uuid) to anon, authenticated;
grant execute on function public.turf_availability(uuid) to anon, authenticated;
