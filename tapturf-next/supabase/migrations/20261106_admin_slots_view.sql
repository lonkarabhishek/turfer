set local lock_timeout = '5s';

-- The site owner's read-only look at a turf's Slots tab (6 Nov 2026). The
-- site owner (public._is_admin_key: the two keys of 20261019_mytapturf.sql)
-- opens any turf on myTapturf, but Free slots refuses them on purpose
-- (private.slots_guard, 20261105_turf_availability.sql: players read the
-- marks as the owner's), so the Slots tab only said "Only someone who runs
-- this turf can mark its free slots". They want to see what an owner sees
-- before telling owners to use it. This file adds a read for them, and
-- nothing else: they still can't mark an hour, tap All correct, turn
-- booking requests on or off, or answer a request (slots_guard and
-- booking_guard are not touched).
--
-- What the site owner sees: the turf's hours, the last update and the
-- Booked marks (private.turf_slots_state, exactly what owner_slots returns
-- to the turf's owner), and booking requests by time alone: the switch,
-- whether players can send them now, and the waiting and confirmed
-- requests' hours and state. Never a player's name, number or note, nor a
-- request's id or account: the privacy page (#booking-requests) and the
-- terms promise those go to the turf's owner and managers and no one else.
-- private.booking_admin_state reads only the time columns, so none of
-- those can reach its answer.
--
-- Functions (both new; search_path ''):
--   private.booking_admin_state(p_turf_id, p_now): {on, open, waiting:
--     [{at, hours, when, created_at}], confirmed: [{at, hours, when}]}, with
--     private.booking_owner_state's filters, order and limits. Nobody but
--     its owner may call it.
--   public.admin_turf_slots(p_token, p_turf_id): security definer, for
--     anon and authenticated (the browser calls it with p_token, as
--     owner_slots; lib/my/client.ts getAdminSlots). The site owner only:
--     anyone else (a turf's own owner, manager or staff too) gets
--     {error: forbidden}, as does a turf that doesn't exist; a turf not
--     claimed or not active gets {error: not_claimed}. Else
--     turf_slots_state || {admin: true, requests: booking_admin_state}.
--     Read only: it writes nothing (no mark, no expiry stored, no
--     notification, never public.turfs).
--
-- Replaced: none. Every function this file calls, as production runs it
-- (md5(prosrc), read 6 Nov 2026), equals its latest body in the repo:
--   public._caller_key               2ab91047132da79f8f3052f95c6f52de  20261025_claims_account.sql
--   public._is_admin_key             c9e14ff9b4713cd87a73ceac3296f20b  20261019_mytapturf.sql
--   private.turf_slots_state         3a2908658ce4234b3776cd5ddb5325bb  20261105_turf_availability.sql
--   private.booking_open             b056988dee34f98630a1e09fd41479ea  20261106_booking_requests.sql
--   private.booking_when             2f75be1e89236a17f3f21df9d1a731e1  20261106_booking_requests.sql
--   private.slot_key                 3409327162994d55152da920ee1d7c6f  20261105_turf_availability.sql
--   private.booking_list_max         c4f2b1ed38362a8f5357586412928e51  20261106_booking_requests.sql
-- and the ones those call:
--   private.turf_booked              67a8af535e56722c351d83d6c9306ce1  20261105_turf_availability.sql
--   private.slots_ahead              21123cc9e231c8af279c7ddc2da07053  20261105_turf_availability.sql
--   private.slots_max                8fd7ac309d445ccd043f9add99d682a9  20261105_turf_availability.sql
--   private.slots_fresh              55f626c4384ee7e7b6a62f00a8121935  20261105_turf_availability.sql
--   private.booking_clock            f24fe8aaeef5c9c95a2d72e6da4ef18d  20261106_booking_requests.sql
-- The rules it follows and leaves as they are:
--   private.booking_owner_state      91d3ba8a5380d74593f0cf1391085d21  (its filters and limits)
--   private.slots_guard              4ecdf11ccc22bfbed25b7cc4b93e5486  (still refuses the site owner)
--
-- Needs 20261105_turf_availability.sql and 20261106_booking_requests.sql.
-- Additive: two new functions. Written without the destructive SQL
-- keywords. No table, grant or policy on a public table changes. Safe to
-- run again. The app works before this file: the Slots tab shows the site
-- owner the old "Only someone who runs this turf" note.
-- Test: scripts/sql-tests/admin_slots_view.check.mjs (PGlite).

-- The owner's list (private.booking_owner_state) by time alone: the switch, whether players can send
-- now, the waiting requests (newest first) and the confirmed ones whose hours have not ended (soonest
-- first), at most booking_list_max() each. Reads no name, number, note, id or account.
create or replace function private.booking_admin_state(p_turf_id uuid, p_now timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'on', coalesce((select s.requests_on from private.turf_booking_settings s where s.turf_id = p_turf_id), false),
    'open', private.booking_open(p_turf_id, p_now),
    'waiting', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', private.slot_key(w.starts_at),
               'hours', w.hours,
               'when', private.booking_when(w.starts_at, w.hours),
               'created_at', w.created_at) order by w.created_at desc, w.id)
        from (select b.id, b.starts_at, b.hours, b.created_at from private.booking_requests b
               where b.turf_id = p_turf_id and b.status = 'waiting' and b.starts_at > p_now
               order by b.created_at desc, b.id
               limit private.booking_list_max()) w), '[]'::jsonb),
    'confirmed', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', private.slot_key(c.starts_at),
               'hours', c.hours,
               'when', private.booking_when(c.starts_at, c.hours)) order by c.starts_at, c.id)
        from (select b.id, b.starts_at, b.hours from private.booking_requests b
               where b.turf_id = p_turf_id and b.status = 'confirmed' and b.ends_at > p_now
               order by b.starts_at, b.id
               limit private.booking_list_max()) c), '[]'::jsonb))
$$;

revoke all on function private.booking_admin_state(uuid, timestamptz) from public, anon, authenticated;

-- The site owner's look at a turf's Slots tab on myTapturf: what owner_slots shows its owner, and its
-- booking requests by time. {error: forbidden | not_claimed} otherwise. Writes nothing.
create or replace function public.admin_turf_slots(p_token text, p_turf_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := public._caller_key(p_token);
  v_live boolean;
begin
  if k is null or not coalesce(public._is_admin_key(k), false) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select (t.claimed and coalesce(t.is_active, false)) into v_live from public.turfs t where t.id = p_turf_id;
  if not found then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if not coalesce(v_live, false) then
    return jsonb_build_object('error', 'not_claimed');
  end if;
  return private.turf_slots_state(p_turf_id, now())
    || jsonb_build_object('admin', true, 'requests', private.booking_admin_state(p_turf_id, now()));
end;
$$;

revoke all on function public.admin_turf_slots(text, uuid) from public;
grant execute on function public.admin_turf_slots(text, uuid) to anon, authenticated;
