-- Free hours nearby. The site owner asked (10 Nov 2026) for Ask TapTurf to
-- answer "which turf is free near me" and for the turf lists to get a "Free
-- hours marked" filter, both from the hours owners mark on myTapturf (Free
-- slots, 20261105_turf_availability.sql). Dribble Den in Bangalore is the
-- first; more will follow.
--
-- One public read, public.free_slots_now(p_city, p_hours): every turf whose
-- free slots players see right now (the same answer public.turf_availability
-- gives that turf, one by one), in one city or all of India, with what the
-- app needs to work out its free hours and show them:
--   {"now": <the time it was read>, "turfs": [{
--     "id", "slug", "name", "area", "city", "lat", "lng",
--     "updated_at"  the owner's last tap or All correct,
--     "requests"    the turf takes booking requests now (turf_takes_requests' answer),
--     "booked"      its Booked marks that start within p_hours (slot keys, time order),
--     "hours"       {"opening_hours", "start_time", "end_time", "is_24x7", "closed_days"}
--   }, ...]}
-- Which hours are slots is worked out from the hours by
-- lib/availability/slots.ts (an hour with no mark is free), in the app, as
-- for the turf page's card: the database still keeps only marks. Whether the
-- turf's page has a number to call or WhatsApp (the turf page shows the card
-- only then) is the app's rule too (lib/utils/contact.ts hasUsableContact),
-- checked by the one cached reader in the app (lib/queries/freeSlots.ts)
-- before anything is shown.
--
-- One rule for "players see this turf's slots": private.turf_availability_at
-- (fresh within private.slots_fresh, claimed, active, future hours only) is
-- called for each turf that has ever been marked, nothing of it copied. A
-- turf it calls not fresh is left out; the booked keys are its own, cut to
-- the window. The requests flag is private.booking_open, which
-- turf_takes_requests answers. scripts/sql-tests/free_slots_nearby.check.mjs
-- checks that the batch equals turf_availability and turf_takes_requests
-- turf by turf.
--
-- No p_from on the public read: a time of the caller's choosing would show
-- marks that are no longer fresh. private.free_slots_at takes the clock, for
-- the check.
--
-- Nothing personal: no name, number, email or account of anyone; the turf's
-- own public listing fields and slot times only. Bounded: at most 200 turfs
-- (the most recently updated first), each with at most private.slots_max()
-- keys; p_hours is held to 1 to 192 (private.slots_ahead, 8 days).
--
-- Additive. Written without the destructive SQL keywords. Writes nothing,
-- locks nothing, changes no grant or policy on a public table.
-- No function from before is replaced. Safe to run again.
-- The app works before this file (the reader answers no turfs, so the filter
-- and Ask say none is marked yet).
--
-- Functions it calls, as production runs them (md5(prosrc), read 10 Nov 2026
-- through a SELECT on pg_proc), each equal to its latest body in the repo:
--   private.turf_availability_at   8e22d49ea7d967904db3588dc61f11e0  20261105_turf_availability.sql
--   private.booking_open           b056988dee34f98630a1e09fd41479ea  20261106_booking_requests.sql
--   private.slot_at                fb271509244b8986ed81c48aa5c58531  20261105_turf_availability.sql
--   private.slots_ahead            21123cc9e231c8af279c7ddc2da07053  20261105_turf_availability.sql
-- and, called by those:
--   private.turf_booked            67a8af535e56722c351d83d6c9306ce1
--   private.slot_key               3409327162994d55152da920ee1d7c6f
--   private.slots_fresh            55f626c4384ee7e7b6a62f00a8121935
--   private.slots_max              8fd7ac309d445ccd043f9add99d682a9
--   public.turf_availability       ca7a836bb02ee94e0715299fd33533c8  (the per-turf read the batch equals)
--   public.turf_takes_requests     159253c316a30cdb93224fe67ba76afd  (the flag the batch equals)

set local lock_timeout = '5s';

-- The batch at p_now: the turfs whose slots players see then, in p_city (a city id) or all of India (null).
create or replace function private.free_slots_at(p_city text, p_now timestamptz, p_hours int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with w as (
    select greatest(1, least(coalesce(p_hours, 36), (extract(epoch from private.slots_ahead()) / 3600)::int)) as h
  ), seen as (
    select t.id, t.slug, t.name, t.area, t.city, t.lat, t.lng,
           t.opening_hours, t.start_time, t.end_time, t.is_24x7, t.closed_days,
           private.turf_availability_at(t.id, p_now) as av
      from private.turf_availability a
      join public.turfs t on t.id = a.turf_id
     where p_city is null or (p_city ~ '^[a-z][a-z-]{1,30}$' and t.city = p_city)
  ), shown as (
    select s.*
      from seen s
     where s.av ->> 'fresh' = 'true'
     order by (s.av ->> 'updated_at')::timestamptz desc, s.id
     limit 200
  )
  select jsonb_build_object(
    'now', p_now,
    'turfs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'slug', s.slug,
               'name', s.name,
               'area', s.area,
               'city', s.city,
               'lat', s.lat,
               'lng', s.lng,
               'updated_at', s.av -> 'updated_at',
               'requests', private.booking_open(s.id, p_now),
               'booked', coalesce((
                 select jsonb_agg(k.key order by k.n)
                   from jsonb_array_elements_text(s.av -> 'booked') with ordinality as k(key, n)
                  where private.slot_at(k.key) < p_now + make_interval(hours => (select w.h from w))), '[]'::jsonb),
               'hours', jsonb_build_object(
                 'opening_hours', s.opening_hours,
                 'start_time', s.start_time,
                 'end_time', s.end_time,
                 'is_24x7', s.is_24x7,
                 'closed_days', s.closed_days))
             order by (s.av ->> 'updated_at')::timestamptz desc, s.id)
        from shown s), '[]'::jsonb))
$$;

revoke all on function private.free_slots_at(text, timestamptz, int) from public, anon, authenticated;

-- The public read, now: what Ask TapTurf and the lists' filter show (through the app's cached reader).
create or replace function public.free_slots_now(p_city text default null, p_hours int default 36)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.free_slots_at(p_city, now(), p_hours)
$$;

revoke all on function public.free_slots_now(text, int) from public;
grant execute on function public.free_slots_now(text, int) to anon, authenticated;
