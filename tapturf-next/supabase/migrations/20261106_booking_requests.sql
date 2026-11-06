set local lock_timeout = '5s';

-- Booking requests, the pilot of the site owner's option A (6 Nov 2026):
-- on a claimed turf whose owner turned requests on, a signed-in player with
-- a verified number asks for 1 to 3 of the hours the owner marked free on
-- myTapturf (components/turf/RequestSheet.tsx); the turf's owner confirms
-- or declines it on myTapturf (components/my/BookingRequests.tsx). Nothing
-- is paid online: the player pays at the turf. Confirming marks those hours
-- Booked, with the same marks Free slots uses (private.turf_slots_apply,
-- 20261105_turf_availability.sql), and declines every other waiting
-- request for them. Both sides hear about it as in-app notifications
-- (public.notifications), which the existing notifications_push trigger
-- also sends to phones where push is on. Never an email or an SMS.
--
-- Tables (schema private, RLS on, no grant to anyone; only the functions
-- below read or write them; no foreign keys, as with private.turf_slots,
-- so nothing here locks public.users or public.turfs):
--   private.turf_booking_settings: one row per turf whose owner used the
--     switch; requests_on is false until they turn it on.
--   private.booking_requests: one row per request. The player's name and
--     verified number are copied in when it is sent: what the turf saw is
--     what was sent. Statuses change by update only (waiting, confirmed,
--     declined, cancelled, expired); rows are never removed. changed_by:
--     owner (confirm, decline, cancel), player (cancel), taken (declined
--     because the hours were confirmed for someone else), clock (expired).
--
-- Who is who:
--   Players, as the games routes identify them (lib/booking/server.ts): the
--   route verifies the caller (lib/account/route.ts caller), resolves the
--   account (account_resolve), and calls a server-key function with p_key
--   (private.account_key_ok) and that account's id. The browser never names
--   a user id. A player needs a verified number (private.phone_proven,
--   20261027_verified_tick.sql).
--   Owners, as Free slots identifies them: the browser calls the owner
--   functions itself with p_token, and each runs private.booking_guard,
--   which is private.slots_guard's rule (an active claim of the caller's
--   own on an active claimed turf; the site owner's admin shortcut does not
--   count) with staff claims left out.
--   The turf's people (private.booking_owners): every active claim on it as
--   owner or manager (a claim with no role counts as an owner's), by
--   account (turf_owners.user_id, else the account its sign-in opens), the
--   rule turf_managers and admin_answer_owner_claim use. Staff claims are
--   not among them: they mark Free slots, but never see a request. Only the
--   turf's people see a request's name and number: while it waits, and
--   once confirmed until its hours end. Their notifications name nobody.
--   Nobody with an active claim on the turf (staff too) may send it one.
--
-- Constants (immutable; each names its twin in lib/booking/requests.ts):
--   private.booking_max_hours()        3   MAX_HOURS
--   private.booking_max_waiting()      3   MAX_WAITING
--   private.booking_max_per_turf_day() 1   MAX_PER_TURF_DAY
--   private.booking_max_sends()        10  MAX_SENDS_PER_DAY
--   private.booking_list_max()         50  LIST_MAX
--   NOTE_MAX and REASON_MAX (140) are the check constraints'. The window is
--   private.slots_ahead() (8 days, AHEAD_DAYS); the route narrows it to the
--   7 days the card shows and to the turf's opening hours.
--
-- Helpers (private; nobody but their owner may call them):
--   booking_clock(at), booking_when(starts, hours): "Sun 8 Nov, 7 PM to 9 PM"
--     in India time (= whenText in lib/booking/requests.ts, both checked
--     against lib/booking/when.cases.json).
--   booking_owners(turf), booking_guard(token, turf), booking_open(turf,
--     now), booking_state(status, starts, now), booking_taken(turf, starts,
--     ends) (the owner's Booked marks alone), booking_free(turf, starts,
--     ends), booking_expire(turf, user, now),
--   booking_notify(user, type, title, message, metadata),
--   booking_mine_json(row, now), booking_owner_json(row),
--   booking_owner_state(turf, now).
-- Public functions:
--   booking_request_send(p_key, p_user_id, p_turf_id, p_at, p_hours, p_note)
--   booking_requests_mine(p_key, p_user_id)
--   booking_request_cancel(p_key, p_user_id, p_request_id, p_expect)
--   owner_booking_requests(p_token, p_turf_id)
--   owner_set_booking_requests(p_token, p_turf_id, p_on)
--   owner_answer_booking_request(p_token, p_request_id, p_action, p_reason)
--   turf_takes_requests(p_turf_id): a boolean only, for the turf page's card.
-- A waiting request expires at its start: every read works the state out
-- (booking_state), and the write functions store it (booking_expire).
--
-- Replaced: none. Every function this file calls, and private.slots_guard
-- (whose body booking_guard copies), as production runs it (md5(prosrc),
-- read 6 Nov 2026), equals its latest body in the repo:
--   private.slots_guard              4ecdf11ccc22bfbed25b7cc4b93e5486
--   public._caller_key               2ab91047132da79f8f3052f95c6f52de
--   public._can_manage               daec6751657cce4d6a97d090b20a0035
--   private.turf_slots_apply         a87c760baa6e95101ae1ce0b0124189e
--   private.turf_booked              67a8af535e56722c351d83d6c9306ce1
--   private.slot_at                  fb271509244b8986ed81c48aa5c58531
--   private.slot_key                 3409327162994d55152da920ee1d7c6f
--   private.slots_fresh              55f626c4384ee7e7b6a62f00a8121935
--   private.slots_ahead              21123cc9e231c8af279c7ddc2da07053
--   private.phone_proven             34cff6ff01c863fd8921c78d12b2fb99
--   private.account_key_ok           ca605fa89a97497134b690e753dc5c0e
--   private.account_for_key          a37bb5437bca089d3ed548a6b147fe54
--   public.account_phone_checked     e962f47c36c9c2ffc0ad6a70c9aa63da
--   private.push_url                 7194c64e4d38986c2f21fe7b60f911f8
--   private.push_on_notification     1272b4bded03cbebd6289b1f25fa385c
--   (_caller_key and _can_manage read again 6 Nov 2026, for booking_guard.)
-- public.bookings (the old app's table) is not touched.
--
-- Erasing an account: user_id has no foreign key (like private.tool_use_log
-- and the other private per-user tables, so nothing here cascades from
-- public.users), and the privacy page promises a request goes with the
-- account. On an erasure request, clear private.booking_requests' rows for
-- the account's id by hand along with its other rows (booking_requests_
-- user_idx finds them). Until then a removed account's request breaks
-- nothing: booking_notify tells only accounts that still exist, so the turf
-- can still answer it and every request it overlaps.
--
-- Needs 20261105_turf_availability.sql and 20261027_verified_tick.sql.
-- Additive: two tables, two indexes, new functions. Written without the
-- destructive SQL keywords. Never writes or locks public.turfs; no grant
-- or policy on a public table changes. Safe to run again.
-- The app works before this file: the card keeps its Call and WhatsApp
-- times (the availability route says requests: false), the owner's switch
-- and list hide themselves, and the Me tab lists no turf requests.
-- Test: scripts/sql-tests/booking_requests.check.mjs (PGlite).

-- ── 1. Tables ──────────────────────────────────────────────

create table if not exists private.turf_booking_settings (
  turf_id uuid primary key,
  requests_on boolean not null default false,
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table private.turf_booking_settings is
  'Booking requests: whether a turf''s owner takes booking requests on TapTurf (myTapturf switch, off by default). 20261106_booking_requests.sql';

create table if not exists private.booking_requests (
  id uuid primary key default gen_random_uuid(),
  turf_id uuid not null,
  user_id uuid not null,
  starts_at timestamptz not null,
  hours smallint not null check (hours between 1 and 3),
  ends_at timestamptz not null check (ends_at > starts_at),
  note text check (note is null or char_length(note) between 1 and 140),
  player_name text not null check (char_length(player_name) between 1 and 80),
  player_phone text not null check (player_phone ~ '^\+91[0-9]{10}$'),
  status text not null default 'waiting' check (status in ('waiting', 'confirmed', 'declined', 'cancelled', 'expired')),
  changed_by text check (changed_by in ('owner', 'player', 'taken', 'clock')),
  reason text check (reason is null or char_length(reason) between 1 and 140),
  created_at timestamptz not null default now(),
  changed_at timestamptz
);
comment on table private.booking_requests is
  'Booking requests: a player asks a turf for 1 to 3 free hours; the turf confirms or declines on myTapturf. Holds the player''s name and verified number, shown only to that turf''s owners and managers. 20261106_booking_requests.sql';
comment on column private.booking_requests.user_id is 'The player''s account (public.users.id).';
comment on column private.booking_requests.starts_at is 'The first hour''s start (a slot key''s instant).';
comment on column private.booking_requests.ends_at is 'starts_at plus hours.';

create index if not exists booking_requests_turf_idx on private.booking_requests (turf_id, status, starts_at);
create index if not exists booking_requests_user_idx on private.booking_requests (user_id, created_at desc);

alter table private.turf_booking_settings enable row level security;
alter table private.booking_requests enable row level security;
revoke all on table private.turf_booking_settings from public, anon, authenticated;
revoke all on table private.booking_requests from public, anon, authenticated;

-- ── 2. Constants ───────────────────────────────────────────

-- MAX_HOURS in lib/booking/requests.ts: the most hours one request asks for (the hours check above too).
create or replace function private.booking_max_hours()
returns int language sql immutable set search_path = '' as $$ select 3 $$;

-- MAX_WAITING in lib/booking/requests.ts: a player's requests waiting for an answer, across all turfs.
create or replace function private.booking_max_waiting()
returns int language sql immutable set search_path = '' as $$ select 3 $$;

-- MAX_PER_TURF_DAY in lib/booking/requests.ts: a player's waiting requests at one turf for one India date.
create or replace function private.booking_max_per_turf_day()
returns int language sql immutable set search_path = '' as $$ select 1 $$;

-- MAX_SENDS_PER_DAY in lib/booking/requests.ts: requests a player sends in 24 hours, cancelled ones too.
create or replace function private.booking_max_sends()
returns int language sql immutable set search_path = '' as $$ select 10 $$;

-- LIST_MAX in lib/booking/requests.ts: the most rows one list gives.
create or replace function private.booking_list_max()
returns int language sql immutable set search_path = '' as $$ select 50 $$;

-- ── 3. Helpers ─────────────────────────────────────────────

-- A clock in India time: "7 PM", "6:30 AM", "12 AM" (clockLabel in lib/availability/slots.ts).
create or replace function private.booking_clock(p_at timestamptz)
returns text language sql stable set search_path = '' as $$
  select case when extract(minute from p_at at time zone 'Asia/Kolkata') = 0
              then to_char(p_at at time zone 'Asia/Kolkata', 'FMHH12 AM')
              else to_char(p_at at time zone 'Asia/Kolkata', 'FMHH12:MI AM') end
$$;

-- "Sun 8 Nov, 7 PM to 9 PM": the start's India date, and its hours (whenText in lib/booking/requests.ts).
create or replace function private.booking_when(p_starts timestamptz, p_hours int)
returns text language sql stable set search_path = '' as $$
  select to_char(p_starts at time zone 'Asia/Kolkata', 'Dy FMDD Mon') || ', '
         || private.booking_clock(p_starts) || ' to '
         || private.booking_clock(p_starts + make_interval(hours => p_hours))
$$;

-- The turf's people: the account of every active owner or manager claim on it, once each (never staff).
create or replace function private.booking_owners(p_turf_id uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct x.id
    from (select coalesce(o.user_id, private.account_for_key(o.user_key)) as id
            from public.turf_owners o
           where o.turf_id = p_turf_id
             and o.status = 'active'
             and coalesce(o.role, 'owner') <> 'staff') x
   where x.id is not null
$$;

-- Who may use the owner functions: private.slots_guard's body (20261105_turf_availability.sql),
-- with one line more, so a staff claim is refused (the check compares the two bodies).
create or replace function private.booking_guard(p_token text, p_turf_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := public._caller_key(p_token);
  v_live boolean;
begin
  if k is null or not coalesce(public._can_manage(k, p_turf_id), false) or not exists (
    select 1 from public.turf_owners o
     where o.turf_id = p_turf_id
       and o.status = 'active'
       and coalesce(o.role, 'owner') <> 'staff'
       and ((o.user_key = k and o.user_id is null)
            or (o.user_id is not null and o.user_id = private.account_for_key(k)))
  ) then
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

-- Players may send requests now: the owner turned them on, the turf is claimed and active, its free slots are fresh.
create or replace function private.booking_open(p_turf_id uuid, p_now timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select s.requests_on from private.turf_booking_settings s where s.turf_id = p_turf_id), false)
     and coalesce((select t.claimed and coalesce(t.is_active, false) from public.turfs t where t.id = p_turf_id), false)
     and exists (select 1 from private.turf_availability a
                  where a.turf_id = p_turf_id
                    and a.updated_at > p_now - private.slots_fresh())
$$;

-- A request's state as every read shows it: a waiting one whose start has come is expired.
create or replace function private.booking_state(p_status text, p_starts timestamptz, p_now timestamptz)
returns text language sql stable set search_path = '' as $$
  select case when p_status = 'waiting' and p_starts <= p_now then 'expired' else p_status end
$$;

-- Some of [p_starts, p_ends) is marked Booked. The owner's marks are the one truth, as the card shows
-- them: a confirm writes its hours' marks, and an hour the owner taps Free again (another ground is
-- free then) can be asked for and confirmed again.
create or replace function private.booking_taken(p_turf_id uuid, p_starts timestamptz, p_ends timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.turf_slots s
                  where s.turf_id = p_turf_id
                    and s.status = 'booked'
                    and s.starts_at >= p_starts
                    and s.starts_at < p_ends)
$$;

-- A cancelled booking's hours go back to Free. private.turf_availability is not touched:
-- nobody looked at the other hours, so players are not told they were just checked.
create or replace function private.booking_free(p_turf_id uuid, p_starts timestamptz, p_ends timestamptz)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update private.turf_slots s
     set status = 'free', updated_at = now()
   where s.turf_id = p_turf_id
     and s.status = 'booked'
     and s.starts_at >= p_starts
     and s.starts_at < p_ends;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Stores what the clock decided: waiting requests (of a turf, or of a player) whose start has come.
create or replace function private.booking_expire(p_turf_id uuid, p_user_id uuid, p_now timestamptz)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update private.booking_requests b
     set status = 'expired', changed_by = 'clock', changed_at = b.starts_at
   where b.status = 'waiting'
     and b.starts_at <= p_now
     and (b.turf_id = p_turf_id or b.user_id = p_user_id);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- One notification, made only by the functions below: private.game_notify's body (20261030_games_lockdown.sql),
-- for an account that still exists (public.notifications.user_id references public.users; a request
-- outlives a removed account, and its answer must not fail on it).
create or replace function private.booking_notify(p_user_id uuid, p_type text, p_title text, p_message text, p_metadata jsonb)
returns integer
language sql
security definer
set search_path = ''
as $$
  with made as (
    insert into public.notifications (user_id, type, title, message, metadata, is_read)
    select p_user_id, p_type, left(p_title, 120), left(p_message, 400), coalesce(p_metadata, '{}'::jsonb), false
     where p_user_id is not null
       and exists (select 1 from public.users u where u.id = p_user_id)
    returning 1
  )
  select count(*)::integer from made;
$$;

-- A request as its player sees it: the turf, the hours, the state. Never a name or a number.
create or replace function private.booking_mine_json(r private.booking_requests, p_now timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id,
    'turf_id', r.turf_id,
    'turf_name', t.name,
    'turf_slug', t.slug,
    'at', private.slot_key(r.starts_at),
    'hours', r.hours,
    'when', private.booking_when(r.starts_at, r.hours),
    'note', r.note,
    'status', x.state,
    'changed_by', case when x.state = 'expired' then 'clock' else r.changed_by end,
    'reason', r.reason,
    'created_at', r.created_at,
    'changed_at', case when x.state = 'expired' and r.changed_at is null then r.starts_at else r.changed_at end,
    'can_cancel', x.state in ('waiting', 'confirmed') and r.starts_at > p_now)
    from (select private.booking_state(r.status, r.starts_at, p_now) as state) x
    left join public.turfs t on t.id = r.turf_id
$$;

-- A request as the turf's people see it: who asked, their number and note.
create or replace function private.booking_owner_json(r private.booking_requests)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id,
    'at', private.slot_key(r.starts_at),
    'hours', r.hours,
    'when', private.booking_when(r.starts_at, r.hours),
    'name', r.player_name,
    'phone', r.player_phone,
    'note', r.note,
    'created_at', r.created_at)
$$;

-- The owner's list: the switch, whether players can send now, the waiting requests (newest first)
-- and the confirmed ones whose hours have not ended (soonest first), at most booking_list_max() each.
create or replace function private.booking_owner_state(p_turf_id uuid, p_now timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'ok', true,
    'now', p_now,
    'on', coalesce((select s.requests_on from private.turf_booking_settings s where s.turf_id = p_turf_id), false),
    'open', private.booking_open(p_turf_id, p_now),
    'waiting', coalesce((
      select jsonb_agg(private.booking_owner_json(w.b) order by (w.b).created_at desc, (w.b).id)
        from (select b from private.booking_requests b
               where b.turf_id = p_turf_id and b.status = 'waiting' and b.starts_at > p_now
               order by b.created_at desc, b.id
               limit private.booking_list_max()) w), '[]'::jsonb),
    'confirmed', coalesce((
      select jsonb_agg(private.booking_owner_json(c.b) order by (c.b).starts_at, (c.b).id)
        from (select b from private.booking_requests b
               where b.turf_id = p_turf_id and b.status = 'confirmed' and b.ends_at > p_now
               order by b.starts_at, b.id
               limit private.booking_list_max()) c), '[]'::jsonb))
$$;

revoke all on function private.booking_max_hours() from public, anon, authenticated;
revoke all on function private.booking_max_waiting() from public, anon, authenticated;
revoke all on function private.booking_max_per_turf_day() from public, anon, authenticated;
revoke all on function private.booking_max_sends() from public, anon, authenticated;
revoke all on function private.booking_list_max() from public, anon, authenticated;
revoke all on function private.booking_clock(timestamptz) from public, anon, authenticated;
revoke all on function private.booking_when(timestamptz, int) from public, anon, authenticated;
revoke all on function private.booking_owners(uuid) from public, anon, authenticated;
revoke all on function private.booking_guard(text, uuid) from public, anon, authenticated;
revoke all on function private.booking_open(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.booking_state(text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.booking_taken(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.booking_free(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.booking_expire(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.booking_notify(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.booking_mine_json(private.booking_requests, timestamptz) from public, anon, authenticated;
revoke all on function private.booking_owner_json(private.booking_requests) from public, anon, authenticated;
revoke all on function private.booking_owner_state(uuid, timestamptz) from public, anon, authenticated;

-- ── 4. Players (server key; called only by lib/booking/server.ts) ──

-- Send a request. Answers {r: ok, request} or r: unavailable, bad (field), off, own, no_phone,
-- past, taken (with booked: the turf's booked slot keys), limit (kind: day, overlap, waiting, sends).
-- overlap: a waiting request of theirs at this turf already covers some of these hours (the card
-- puts hours after midnight under the day before, so two such requests have different dates).
create or replace function public.booking_request_send(p_key text, p_user_id uuid, p_turf_id uuid, p_at text, p_hours integer, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_note text;
  v_user public.users;
  v_turf text;
  v_req private.booking_requests;
  v_owner uuid;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_turf_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  v_start := private.slot_at(p_at);
  if v_start is null then
    return jsonb_build_object('r', 'bad', 'field', 'at');
  end if;
  if p_hours is null or p_hours < 1 or p_hours > private.booking_max_hours() then
    return jsonb_build_object('r', 'bad', 'field', 'hours');
  end if;
  v_note := nullif(btrim(p_note), '');
  if char_length(v_note) > 140 or v_note ~ '[[:cntrl:]]' then
    return jsonb_build_object('r', 'bad', 'field', 'note');
  end if;
  -- The player's sends one at a time (the limits), then the turf's (the hours): always in this order.
  perform pg_advisory_xact_lock(hashtextextended('booking_by:' || p_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('booking_turf:' || p_turf_id::text, 0));
  perform private.booking_expire(null, p_user_id, now());

  select * into v_user from public.users u where u.id = p_user_id;
  if not found then
    return jsonb_build_object('r', 'bad');
  end if;
  if not private.booking_open(p_turf_id, now()) then
    return jsonb_build_object('r', 'off');
  end if;
  if exists (select 1 from public.turf_owners o
              where o.turf_id = p_turf_id
                and o.status = 'active'
                and coalesce(o.user_id, private.account_for_key(o.user_key)) = p_user_id) then
    return jsonb_build_object('r', 'own');
  end if;
  if not private.phone_proven(p_user_id) then
    return jsonb_build_object('r', 'no_phone');
  end if;
  v_end := v_start + make_interval(hours => p_hours);
  if v_start <= now() or v_start >= now() + private.slots_ahead() then
    return jsonb_build_object('r', 'past');
  end if;
  if private.booking_taken(p_turf_id, v_start, v_end) then
    return jsonb_build_object('r', 'taken', 'booked', private.turf_booked(p_turf_id, now()));
  end if;

  if (select count(*) from private.booking_requests b
       where b.user_id = p_user_id and b.turf_id = p_turf_id
         and b.status = 'waiting' and b.starts_at > now()
         and (b.starts_at at time zone 'Asia/Kolkata')::date = (v_start at time zone 'Asia/Kolkata')::date)
     >= private.booking_max_per_turf_day() then
    return jsonb_build_object('r', 'limit', 'kind', 'day');
  end if;
  if exists (select 1 from private.booking_requests b
              where b.user_id = p_user_id and b.turf_id = p_turf_id
                and b.status = 'waiting' and b.starts_at > now()
                and b.starts_at < v_end and b.ends_at > v_start) then
    return jsonb_build_object('r', 'limit', 'kind', 'overlap');
  end if;
  if (select count(*) from private.booking_requests b
       where b.user_id = p_user_id and b.status = 'waiting' and b.starts_at > now())
     >= private.booking_max_waiting() then
    return jsonb_build_object('r', 'limit', 'kind', 'waiting');
  end if;
  if (select count(*) from private.booking_requests b
       where b.user_id = p_user_id and b.created_at > now() - interval '1 day')
     >= private.booking_max_sends() then
    return jsonb_build_object('r', 'limit', 'kind', 'sends');
  end if;

  insert into private.booking_requests (turf_id, user_id, starts_at, hours, ends_at, note, player_name, player_phone)
  values (p_turf_id, p_user_id, v_start, p_hours, v_end, v_note,
          left(coalesce(nullif(btrim(v_user.name::text), ''), 'A player'), 80), v_user.phone)
  returning * into v_req;

  select left(coalesce(nullif(btrim(t.name), ''), 'the turf'), 60) into v_turf from public.turfs t where t.id = p_turf_id;
  for v_owner in select private.booking_owners(p_turf_id) loop
    -- Never the player's name: the list on myTapturf shows it while the request is open.
    perform private.booking_notify(v_owner, 'booking_request', 'New booking request',
      'A player asked for ' || private.booking_when(v_req.starts_at, v_req.hours) || ' at ' || coalesce(v_turf, 'the turf')
        || '. Confirm or decline it on myTapturf.',
      jsonb_build_object('turfId', p_turf_id, 'requestId', v_req.id));
  end loop;
  return jsonb_build_object('r', 'ok', 'request', private.booking_mine_json(v_req, now()));
end;
$$;

-- The caller's own requests, newest first, at most booking_list_max(). {r: ok, requests}.
create or replace function public.booking_requests_mine(p_key text, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  return jsonb_build_object('r', 'ok', 'requests', coalesce((
    select jsonb_agg(private.booking_mine_json(x.b, now()) order by (x.b).created_at desc, (x.b).id)
      from (select b from private.booking_requests b
             where b.user_id = p_user_id
             order by b.created_at desc, b.id
             limit private.booking_list_max()) x), '[]'::jsonb));
end;
$$;

-- The player cancels their own waiting or confirmed request before it starts. Cancelling a
-- confirmed one frees its hours and tells the turf's people; a waiting one tells nobody.
-- p_expect (waiting or confirmed, or null): the state the player's screen showed. When the
-- request is in another one now (the turf confirmed it meanwhile), nothing changes and the
-- answer is answered (status), so a one-tap cancel of a waiting request never cancels a booking.
-- Answers {r: ok, status: cancelled, request} (again for one already cancelled), or r:
-- unavailable, bad, gone (none, or not theirs), answered (status), started.
create or replace function public.booking_request_cancel(p_key text, p_user_id uuid, p_request_id uuid, p_expect text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req private.booking_requests;
  v_state text;
  v_turf text;
  v_owner uuid;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_request_id is null or (p_expect is not null and p_expect not in ('waiting', 'confirmed')) then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_req from private.booking_requests b where b.id = p_request_id;
  if not found or v_req.user_id <> p_user_id then
    return jsonb_build_object('r', 'gone');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('booking_turf:' || v_req.turf_id::text, 0));
  select * into v_req from private.booking_requests b where b.id = p_request_id for update;
  if v_req.status = 'cancelled' then
    return jsonb_build_object('r', 'ok', 'status', 'cancelled', 'request', private.booking_mine_json(v_req, now()));
  end if;
  v_state := private.booking_state(v_req.status, v_req.starts_at, now());
  if v_state not in ('waiting', 'confirmed') or v_state <> coalesce(p_expect, v_state) then
    return jsonb_build_object('r', 'answered', 'status', v_state);
  end if;
  if v_req.starts_at <= now() then
    return jsonb_build_object('r', 'started');
  end if;
  update private.booking_requests b
     set status = 'cancelled', changed_by = 'player', changed_at = now()
   where b.id = v_req.id
  returning * into v_req;
  if v_state = 'confirmed' then
    perform private.booking_free(v_req.turf_id, v_req.starts_at, v_req.ends_at);
    select left(coalesce(nullif(btrim(t.name), ''), 'the turf'), 60) into v_turf from public.turfs t where t.id = v_req.turf_id;
    for v_owner in select private.booking_owners(v_req.turf_id) loop
      perform private.booking_notify(v_owner, 'booking_cancelled_by_player', 'Booking cancelled',
        'A player cancelled ' || private.booking_when(v_req.starts_at, v_req.hours) || ' at ' || coalesce(v_turf, 'the turf')
          || '. Those hours are free again.',
        jsonb_build_object('turfId', v_req.turf_id, 'requestId', v_req.id));
    end loop;
  end if;
  return jsonb_build_object('r', 'ok', 'status', 'cancelled', 'request', private.booking_mine_json(v_req, now()));
end;
$$;

revoke all on function public.booking_request_send(text, uuid, uuid, text, integer, text) from public;
revoke all on function public.booking_requests_mine(text, uuid) from public;
revoke all on function public.booking_request_cancel(text, uuid, uuid, text) from public;
grant execute on function public.booking_request_send(text, uuid, uuid, text, integer, text) to anon, authenticated;
grant execute on function public.booking_requests_mine(text, uuid) to anon, authenticated;
grant execute on function public.booking_request_cancel(text, uuid, uuid, text) to anon, authenticated;

-- ── 5. Owners (p_token, from the browser, as Free slots) ──

-- The owner's list and switch. {error: forbidden | not_claimed} for anyone else (staff too).
create or replace function public.owner_booking_requests(p_token text, p_turf_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err text := private.booking_guard(p_token, p_turf_id);
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  return private.booking_owner_state(p_turf_id, now());
end;
$$;

-- "Take booking requests on TapTurf": on or off. Turning it off leaves waiting requests answerable.
create or replace function public.owner_set_booking_requests(p_token text, p_turf_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_err text := private.booking_guard(p_token, p_turf_id);
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  if p_on is null then
    return jsonb_build_object('error', 'bad');
  end if;
  insert into private.turf_booking_settings as s (turf_id, requests_on, changed_at)
  values (p_turf_id, p_on, now())
  on conflict (turf_id) do update set requests_on = excluded.requests_on, changed_at = excluded.changed_at;
  return private.booking_owner_state(p_turf_id, now());
end;
$$;

-- Confirm or decline a waiting request, or cancel a confirmed one that has not started.
-- Confirming marks its hours Booked (private.turf_slots_apply: "Updated just now by the owner")
-- and declines every other waiting request for those hours, telling each player. Answers the
-- owner's list plus done (and declined_others for a confirm), or {error: bad | gone | forbidden |
-- not_claimed | answered (with status) | taken | started | too_many | bad_value}.
create or replace function public.owner_answer_booking_request(p_token text, p_request_id uuid, p_action text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(p_reason), '');
  v_turf_id uuid;
  v_err text;
  v_req private.booking_requests;
  v_other private.booking_requests;
  v_state text;
  v_turf text;
  v_slug text;
  v_when text;
  v_marks jsonb;
  v_applied jsonb;
  n int := 0;
begin
  if p_action is null or p_action not in ('confirm', 'decline', 'cancel')
     or char_length(v_reason) > 140 or v_reason ~ '[[:cntrl:]]' then
    return jsonb_build_object('error', 'bad');
  end if;
  select b.turf_id into v_turf_id from private.booking_requests b where b.id = p_request_id;
  if v_turf_id is null then
    return jsonb_build_object('error', 'gone');
  end if;
  v_err := private.booking_guard(p_token, v_turf_id);
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('booking_turf:' || v_turf_id::text, 0));
  perform private.booking_expire(v_turf_id, null, now());
  select * into v_req from private.booking_requests b where b.id = p_request_id for update;
  v_state := private.booking_state(v_req.status, v_req.starts_at, now());
  select left(coalesce(nullif(btrim(t.name), ''), 'the turf'), 60), t.slug into v_turf, v_slug from public.turfs t where t.id = v_turf_id;
  v_turf := coalesce(v_turf, 'the turf');
  v_when := private.booking_when(v_req.starts_at, v_req.hours);

  if p_action = 'confirm' then
    if v_state <> 'waiting' then
      return jsonb_build_object('error', 'answered', 'status', v_state);
    end if;
    if private.booking_taken(v_turf_id, v_req.starts_at, v_req.ends_at) then
      return jsonb_build_object('error', 'taken');
    end if;
    select jsonb_agg(jsonb_build_object('at', private.slot_key(v_req.starts_at + make_interval(hours => g)), 'status', 'booked') order by g)
      into v_marks
      from generate_series(0, v_req.hours - 1) g;
    v_applied := private.turf_slots_apply(v_turf_id, v_marks, now());
    if v_applied ? 'error' then
      return jsonb_build_object('error', v_applied ->> 'error');
    end if;
    update private.booking_requests b
       set status = 'confirmed', changed_by = 'owner', changed_at = now()
     where b.id = v_req.id
    returning * into v_req;
    for v_other in
      update private.booking_requests o
         set status = 'declined', changed_by = 'taken', changed_at = now()
       where o.turf_id = v_turf_id
         and o.id <> v_req.id
         and o.status = 'waiting'
         and o.starts_at > now()
         and o.starts_at < v_req.ends_at
         and o.ends_at > v_req.starts_at
      returning o.*
    loop
      n := n + 1;
      perform private.booking_notify(v_other.user_id, 'booking_declined', 'Request declined',
        v_turf || ' can''t take your request for ' || private.booking_when(v_other.starts_at, v_other.hours) || ': those hours went to someone else.',
        jsonb_build_object('turfId', v_turf_id, 'slug', v_slug, 'requestId', v_other.id, 'by', 'taken'));
    end loop;
    perform private.booking_notify(v_req.user_id, 'booking_confirmed', 'Request confirmed',
      v_turf || ' confirmed ' || v_when || '. Pay at the turf.',
      jsonb_build_object('turfId', v_turf_id, 'slug', v_slug, 'requestId', v_req.id));
    return private.booking_owner_state(v_turf_id, now()) || jsonb_build_object('done', 'confirm', 'declined_others', n);
  end if;

  if p_action = 'decline' then
    if v_state <> 'waiting' then
      return jsonb_build_object('error', 'answered', 'status', v_state);
    end if;
    update private.booking_requests b
       set status = 'declined', changed_by = 'owner', reason = v_reason, changed_at = now()
     where b.id = v_req.id;
    perform private.booking_notify(v_req.user_id, 'booking_declined', 'Request declined',
      v_turf || ' declined your request for ' || v_when || '.' || coalesce(' They said: "' || v_reason || '"', ''),
      jsonb_build_object('turfId', v_turf_id, 'slug', v_slug, 'requestId', v_req.id, 'by', 'owner'));
    return private.booking_owner_state(v_turf_id, now()) || jsonb_build_object('done', 'decline');
  end if;

  -- cancel
  if v_req.status <> 'confirmed' then
    return jsonb_build_object('error', 'answered', 'status', v_state);
  end if;
  if v_req.starts_at <= now() then
    return jsonb_build_object('error', 'started');
  end if;
  update private.booking_requests b
     set status = 'cancelled', changed_by = 'owner', reason = v_reason, changed_at = now()
   where b.id = v_req.id;
  perform private.booking_free(v_turf_id, v_req.starts_at, v_req.ends_at);
  perform private.booking_notify(v_req.user_id, 'booking_cancelled', 'Cancelled by the turf',
    v_turf || ' cancelled ' || v_when || '.' || coalesce(' They said: "' || v_reason || '"', ''),
    jsonb_build_object('turfId', v_turf_id, 'slug', v_slug, 'requestId', v_req.id));
  return private.booking_owner_state(v_turf_id, now()) || jsonb_build_object('done', 'cancel');
end;
$$;

revoke all on function public.owner_booking_requests(text, uuid) from public;
revoke all on function public.owner_set_booking_requests(text, uuid, boolean) from public;
revoke all on function public.owner_answer_booking_request(text, uuid, text, text) from public;
grant execute on function public.owner_booking_requests(text, uuid) to anon, authenticated;
grant execute on function public.owner_set_booking_requests(text, uuid, boolean) to anon, authenticated;
grant execute on function public.owner_answer_booking_request(text, uuid, text, text) to anon, authenticated;

-- ── 6. The public read ─────────────────────────────────────

-- Whether players may send requests to this turf now: a boolean, nothing else (the availability route asks).
create or replace function public.turf_takes_requests(p_turf_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.booking_open(p_turf_id, now())
$$;

revoke all on function public.turf_takes_requests(uuid) from public;
grant execute on function public.turf_takes_requests(uuid) to anon, authenticated;
