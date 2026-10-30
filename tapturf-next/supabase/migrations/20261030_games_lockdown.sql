-- Games lockdown, step 1 of 2 (step 2 is 20261030_games_lockdown_step2.sql).
--
-- Until now the browser wrote games, game_requests, game_participants and
-- notifications itself with the anon key, and the tables let anyone do
-- anything: edit, move or cancel any game, accept anyone into it, send any
-- player any notification, and read every notification and every join
-- request note. Phone sign-ins have no Supabase session, so no policy
-- could tell who was asking.
--
-- From the app that ships with this, every write goes browser -> an /api
-- route -> the verified caller (Firebase ID token or Google session) ->
-- one of the functions below, which check the server key
-- (private.account_key_ok) and take the account the server resolved,
-- never one the browser names. Each checks its own rule:
--   * game_create: the caller is the host; the turf is listed (active);
--     every field checked; the host's name and photo from their account;
--     status open, 1 player, the host the first participant. 10 a day.
--   * game_update: the host only, on an open (or full) game; only the
--     fields the edit sheet has; max players never under the players in
--     it; a new venue only a listed turf. A real move tells everyone
--     playing and everyone with a request pending or accepted, never the
--     host (game_venue_changed). The players are recounted.
--   * game_cancel: the host only; status cancelled; the players and the
--     pending requests are told (game_cancelled). No screen uses it yet.
--   * game_request_send: not the host, not already in, no pending or
--     accepted request; the game open, not over, not full; a note of at
--     most 300 characters. One row per player per game: a declined or
--     withdrawn one goes back to pending. The host is told. 30 a day.
--   * game_request_withdraw: the requester's own pending request only. It
--     becomes withdrawn (nothing is removed); every reader skips it.
--   * game_request_answer: the host of the request's game only, a pending
--     request only. Accepting locks the game row, refuses a full game,
--     adds the player once and recounts current_players. The requester
--     is told either way.
--   * game_requests_for / game_requests_mine / game_requests_incoming:
--     the host sees the requests for their own games (notes too, never a
--     phone number); a player sees only their own.
--   * notifications_mine / notifications_unread / notifications_read: a
--     player reads, counts and marks read only their own.
--   * admin_game_requests / admin_notifications / admin_notification_counts:
--     the site owner's reads for /admin (public._is_site_owner), which
--     read these tables with the anon key until now.
-- Notifications are made only here, as the side effect of a real action,
-- with the texts the app used before.
--
-- Apply after the app that uses it is live (its routes call these
-- functions first and, until they exist, do the same checks themselves
-- with today's grants), then step 2 within minutes: until step 2 the
-- tables are still open to anyone holding the anon key.
--
-- Additive: one guarded unique index, one index, new functions. No grant
-- or policy changes here. Written without the destructive SQL keywords;
-- nothing is removed or merged. Safe to run again.

set local lock_timeout = '5s';

-- ── 1. One request row per player per game ─────────────────

-- None had two on 30 Oct. The functions take an advisory lock per
-- (game, player) and never rely on it, so a pair that appears before this
-- runs only skips the index (a NOTICE says so).
do $$
begin
  if to_regclass('public.game_requests_one_per_player_uidx') is not null then
    return;
  end if;
  if exists (select 1 from public.game_requests r
              where r.game_id is not null and r.user_id is not null
              group by r.game_id, r.user_id having count(*) > 1) then
    raise notice 'games lockdown: some players have more than one request for a game; game_requests_one_per_player_uidx is not made (nothing depends on it)';
    return;
  end if;
  create unique index game_requests_one_per_player_uidx on public.game_requests (game_id, user_id);
end;
$$;

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- ── 2. Helpers (closed to the API roles) ───────────────────

-- One notification, made only by the functions below.
create or replace function private.game_notify(p_user_id uuid, p_type text, p_title text, p_message text, p_metadata jsonb)
returns integer
language sql
security definer
set search_path = ''
as $$
  with made as (
    insert into public.notifications (user_id, type, title, message, metadata, is_read)
    select p_user_id, p_type, left(p_title, 120), left(p_message, 400), coalesce(p_metadata, '{}'::jsonb), false
     where p_user_id is not null
    returning 1
  )
  select count(*)::integer from made;
$$;
revoke all on function private.game_notify(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- A YYYY-MM-DD date, or null when it is not one (2026-02-30 included).
create or replace function private.game_date_or_null(p text)
returns date
language plpgsql
stable
set search_path = ''
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return p::date;
exception when others then
  return null;
end;
$$;
revoke all on function private.game_date_or_null(text) from public, anon, authenticated;

-- Over: as close_past_games reads it (the end, or 2 hours after the start
-- when the end is not after it), 30 minutes on, in IST.
create or replace function private.game_over(p_date date, p_start time, p_end time)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (case
            when p_end is not null and p_start is not null and p_end > p_start then p_date + p_end
            when p_start is not null then p_date + p_start + interval '2 hours'
            else p_date + time '23:59'
          end) < (now() at time zone 'Asia/Kolkata') - interval '30 minutes';
$$;
revoke all on function private.game_over(date, time, time) from public, anon, authenticated;

-- The first field of a game body that is not allowed or not well formed,
-- or null when every one is fine ('body' when it is not an object).
create or replace function private.game_field_problem(p jsonb, p_allowed text[])
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  s text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return 'body';
  end if;
  for k, v in select e.key, e.value from jsonb_each(p) e loop
    if not (k = any (p_allowed)) then
      return k;
    end if;
    s := case when jsonb_typeof(v) = 'string' then v #>> '{}' end;
    if k = 'date' then
      if private.game_date_or_null(s) is null then return k; end if;
    elsif k in ('start_time', 'end_time') then
      if s is null or s !~ '^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$' then return k; end if;
    elsif k = 'max_players' then
      if jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^\d{1,2}$' or (v #>> '{}')::integer not between 2 and 50 then return k; end if;
    elsif k = 'price_per_player' then
      if jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^\d{1,5}(\.\d{1,2})?$' or (v #>> '{}')::numeric > 10000 then return k; end if;
    elsif k = 'description' then
      if not (jsonb_typeof(v) = 'null' or (s is not null and char_length(btrim(s)) <= 500)) then return k; end if;
    elsif k = 'turf_booked' then
      if jsonb_typeof(v) <> 'boolean' then return k; end if;
    elsif k = 'skill_level' then
      if s is null or s not in ('beginner', 'intermediate', 'advanced', 'all') then return k; end if;
    elsif k = 'turf_id' then
      if s is null or s !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return k; end if;
    elsif k = 'sport' then
      if s is null or char_length(btrim(s)) not between 1 and 40 then return k; end if;
    elsif k = 'host_phone' then
      if s is null or not (s = '' or s ~ '^\+91[6-9]\d{9}$') then return k; end if;
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.game_field_problem(jsonb, text[]) from public, anon, authenticated;

-- A join request as its game's host and its requester read it: never the
-- legacy requester_phone.
create or replace function private.game_request_json(r public.game_requests)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'game_id', r.game_id, 'user_id', r.user_id, 'note', r.note, 'status', r.status,
    'requester_name', r.requester_name, 'requester_avatar', r.requester_avatar,
    'created_at', r.created_at, 'responded_at', r.responded_at);
$$;
revoke all on function private.game_request_json(public.game_requests) from public, anon, authenticated;

-- ── 3. Games: create, edit (and move), cancel ──────────────

-- p_game: turf_id, sport, skill_level, max_players, date, start_time,
-- end_time, price_per_player (all needed), description, turf_booked,
-- host_phone ('' or +91 and 10 digits, the number the host gives players).
-- Answers {r: ok, game} or r: unavailable, bad (with field), venue, limit.
create or replace function public.game_create(p_key text, p_user_id uuid, p_game jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users;
  v_date date;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_bad text;
  v_row public.games;
  v_sport text;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  v_bad := private.game_field_problem(p_game, array['turf_id', 'sport', 'skill_level', 'max_players', 'date', 'start_time', 'end_time',
                                                    'price_per_player', 'description', 'turf_booked', 'host_phone']);
  if v_bad is null and not (p_game ?& array['turf_id', 'sport', 'skill_level', 'max_players', 'date', 'start_time', 'end_time', 'price_per_player']) then
    v_bad := 'body';
  end if;
  if v_bad is not null then
    return jsonb_build_object('r', 'bad', 'field', v_bad);
  end if;
  v_date := (p_game ->> 'date')::date;
  if v_date < v_today or v_date > v_today + 365 then
    return jsonb_build_object('r', 'bad', 'field', 'date');
  end if;
  -- One create at a time per account: the daily limit counts every game before this one.
  perform pg_advisory_xact_lock(hashtextextended('game_create:' || p_user_id::text, 0));
  select * into v_user from public.users u where u.id = p_user_id;
  if not found then
    return jsonb_build_object('r', 'bad');
  end if;
  if not exists (select 1 from public.turfs t where t.id = (p_game ->> 'turf_id')::uuid and t.is_active is true) then
    return jsonb_build_object('r', 'venue');
  end if;
  if (select count(*) from public.games g where g.creator_id = p_user_id and g.created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('r', 'limit');
  end if;
  v_sport := btrim(p_game ->> 'sport');
  insert into public.games (creator_id, turf_id, title, description, sport, skill_level, max_players, current_players, date,
                            start_time, end_time, price_per_player, status, host_name, host_phone, host_profile_image_url, turf_booked)
  values (p_user_id, (p_game ->> 'turf_id')::uuid, v_sport || ' Game',
          coalesce(nullif(btrim(p_game ->> 'description'), ''), v_sport || ' game'),
          v_sport, p_game ->> 'skill_level', (p_game ->> 'max_players')::integer, 1, v_date,
          (p_game ->> 'start_time')::time, (p_game ->> 'end_time')::time, (p_game ->> 'price_per_player')::numeric, 'open',
          coalesce(nullif(btrim(v_user.name::text), ''), 'Player'), coalesce(p_game ->> 'host_phone', ''),
          coalesce(v_user.profile_image_url, ''), coalesce((p_game ->> 'turf_booked')::boolean, false))
  returning * into v_row;
  insert into public.game_participants (game_id, user_id) values (v_row.id, p_user_id)
  on conflict (game_id, user_id) do nothing;
  return jsonb_build_object('r', 'ok', 'game', to_jsonb(v_row));
end;
$$;
revoke all on function public.game_create(text, uuid, jsonb) from public;
grant execute on function public.game_create(text, uuid, jsonb) to anon, authenticated;

-- The host's edit sheet. p_changes: any of date, start_time, end_time,
-- max_players, price_per_player, description, turf_booked, skill_level,
-- turf_id. p_move_notice {title, message}: what the players are told when
-- the venue changes (the route words it from the public game and turf
-- rows; capped here, and who hears it is worked out here). Answers {r: ok,
-- game, notified} or r: unavailable, bad (with field), gone, not_host,
-- closed, too_few (with players), venue.
create or replace function public.game_update(p_key text, p_user_id uuid, p_game_id uuid, p_changes jsonb, p_move_notice jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.games;
  v_row public.games;
  v_bad text;
  v_date date;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_players integer;
  v_turf uuid;
  v_moved boolean := false;
  v_title text;
  v_message text;
  v_notified integer := 0;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_game_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  v_bad := private.game_field_problem(p_changes, array['date', 'start_time', 'end_time', 'max_players', 'price_per_player', 'description',
                                                       'turf_booked', 'skill_level', 'turf_id']);
  if v_bad is not null then
    return jsonb_build_object('r', 'bad', 'field', v_bad);
  end if;
  select * into v_old from public.games g where g.id = p_game_id for update;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if v_old.creator_id is distinct from p_user_id then
    return jsonb_build_object('r', 'not_host');
  end if;
  if coalesce(v_old.status, 'open') not in ('open', 'full') then
    return jsonb_build_object('r', 'closed');
  end if;
  if p_changes ? 'date' then
    v_date := (p_changes ->> 'date')::date;
    if v_date is distinct from v_old.date and (v_date < v_today or v_date > v_today + 365) then
      return jsonb_build_object('r', 'bad', 'field', 'date');
    end if;
  end if;
  select count(*) into v_players from public.game_participants p where p.game_id = p_game_id;
  if p_changes ? 'max_players' and (p_changes ->> 'max_players')::integer < v_players then
    return jsonb_build_object('r', 'too_few', 'players', v_players);
  end if;
  if p_changes ? 'turf_id' then
    v_turf := (p_changes ->> 'turf_id')::uuid;
    if v_turf is distinct from v_old.turf_id then
      if not exists (select 1 from public.turfs t where t.id = v_turf and t.is_active is true) then
        return jsonb_build_object('r', 'venue');
      end if;
      v_moved := true;
    end if;
  end if;
  update public.games g
     set date = coalesce(v_date, g.date),
         start_time = coalesce((p_changes ->> 'start_time')::time, g.start_time),
         end_time = coalesce((p_changes ->> 'end_time')::time, g.end_time),
         max_players = coalesce((p_changes ->> 'max_players')::integer, g.max_players),
         price_per_player = coalesce((p_changes ->> 'price_per_player')::numeric, g.price_per_player),
         description = case when p_changes ? 'description' then nullif(btrim(p_changes ->> 'description'), '') else g.description end,
         turf_booked = coalesce((p_changes ->> 'turf_booked')::boolean, g.turf_booked),
         skill_level = coalesce(p_changes ->> 'skill_level', g.skill_level),
         turf_id = case when v_moved then v_turf else g.turf_id end,
         current_players = case when v_players > 0 then v_players else g.current_players end,
         updated_at = now()
   where g.id = p_game_id
  returning * into v_row;
  if v_moved then
    v_title := coalesce(nullif(left(btrim(p_move_notice ->> 'title'), 80), ''), 'Venue changed');
    v_message := nullif(left(btrim(p_move_notice ->> 'message'), 300), '');
    if v_message is null then
      v_message := 'Your game moved to ' || coalesce((select btrim(t.name::text) from public.turfs t where t.id = v_turf), 'another venue');
    end if;
    with told as (
      select p.user_id from public.game_participants p where p.game_id = p_game_id
      union
      select r.user_id from public.game_requests r where r.game_id = p_game_id and r.status in ('pending', 'accepted')
    )
    insert into public.notifications (user_id, type, title, message, metadata, is_read)
    select t.user_id, 'game_venue_changed', v_title, v_message,
           jsonb_build_object('gameId', p_game_id, 'turfId', v_turf, 'fromTurfId', v_old.turf_id), false
      from told t
     where t.user_id is not null and t.user_id is distinct from v_old.creator_id;
    get diagnostics v_notified = row_count;
  end if;
  return jsonb_build_object('r', 'ok', 'game', to_jsonb(v_row), 'notified', v_notified);
end;
$$;
revoke all on function public.game_update(text, uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.game_update(text, uuid, uuid, jsonb, jsonb) to anon, authenticated;

-- The host calls the game off: status cancelled (the row stays). Everyone
-- playing and everyone waiting on a request is told. Answers {r: ok} or
-- r: unavailable, bad, gone, not_host, closed.
create or replace function public.game_cancel(p_key text, p_user_id uuid, p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_host text;
  v_message text;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_game_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_game from public.games g where g.id = p_game_id for update;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if v_game.creator_id is distinct from p_user_id then
    return jsonb_build_object('r', 'not_host');
  end if;
  if v_game.status = 'cancelled' then
    return jsonb_build_object('r', 'ok');
  end if;
  if coalesce(v_game.status, 'open') not in ('open', 'full') then
    return jsonb_build_object('r', 'closed');
  end if;
  update public.games g set status = 'cancelled', updated_at = now() where g.id = p_game_id;
  v_host := nullif(split_part(btrim(coalesce(v_game.host_name, '')), ' ', 1), '');
  v_message := coalesce(v_host, 'Your host') || ' cancelled ' || coalesce(nullif(btrim(v_game.sport), ''), 'the game')
               || ' on ' || to_char(v_game.date, 'Dy FMDD Mon');
  insert into public.notifications (user_id, type, title, message, metadata, is_read)
  select t.user_id, 'game_cancelled', 'Game cancelled', v_message, jsonb_build_object('gameId', p_game_id), false
    from (select p.user_id from public.game_participants p where p.game_id = p_game_id
          union
          select r.user_id from public.game_requests r where r.game_id = p_game_id and r.status = 'pending') t
   where t.user_id is not null and t.user_id is distinct from v_game.creator_id;
  return jsonb_build_object('r', 'ok');
end;
$$;
revoke all on function public.game_cancel(text, uuid, uuid) from public;
grant execute on function public.game_cancel(text, uuid, uuid) to anon, authenticated;

-- ── 4. Join requests ───────────────────────────────────────

-- Ask to join. Answers {r: ok, request {id, status, created_at}} or r:
-- unavailable, bad (with field), gone, own, closed, full, joined, pending,
-- limit.
create or replace function public.game_request_send(p_key text, p_user_id uuid, p_game_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users;
  v_game public.games;
  v_req public.game_requests;
  v_had boolean;
  v_note text;
  v_name text;
  v_players integer;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_game_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if char_length(v_note) > 300 then
    return jsonb_build_object('r', 'bad', 'field', 'note');
  end if;
  -- One send at a time per player and game, and per player for the daily limit.
  perform pg_advisory_xact_lock(hashtextextended('game_request:' || p_game_id::text || ':' || p_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('game_request_by:' || p_user_id::text, 0));
  select * into v_user from public.users u where u.id = p_user_id;
  if not found then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_game from public.games g where g.id = p_game_id;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if v_game.creator_id = p_user_id then
    return jsonb_build_object('r', 'own');
  end if;
  if coalesce(v_game.status, 'open') not in ('open', 'full') or private.game_over(v_game.date, v_game.start_time, v_game.end_time) then
    return jsonb_build_object('r', 'closed');
  end if;
  if exists (select 1 from public.game_participants p where p.game_id = p_game_id and p.user_id = p_user_id) then
    return jsonb_build_object('r', 'joined');
  end if;
  select * into v_req from public.game_requests r
   where r.game_id = p_game_id and r.user_id = p_user_id
   order by r.created_at desc nulls last
   limit 1
   for update;
  v_had := found;
  if v_had and v_req.status = 'pending' then
    return jsonb_build_object('r', 'pending');
  end if;
  if v_had and v_req.status = 'accepted' then
    return jsonb_build_object('r', 'joined');
  end if;
  select count(*) into v_players from public.game_participants p where p.game_id = p_game_id;
  if v_game.status = 'full' or v_players >= v_game.max_players then
    return jsonb_build_object('r', 'full');
  end if;
  if (select count(*) from public.game_requests r where r.user_id = p_user_id and r.created_at > now() - interval '1 day') >= 30 then
    return jsonb_build_object('r', 'limit');
  end if;
  v_name := coalesce(nullif(btrim(v_user.name::text), ''), 'Player');
  if v_had then
    -- Declined or withdrawn before: the same row asks again.
    update public.game_requests r
       set status = 'pending', note = v_note, requester_name = v_name, requester_avatar = v_user.profile_image_url,
           created_at = now(), responded_at = null
     where r.id = v_req.id
    returning * into v_req;
  else
    insert into public.game_requests (game_id, user_id, note, status, requester_name, requester_avatar)
    values (p_game_id, p_user_id, v_note, 'pending', v_name, v_user.profile_image_url)
    returning * into v_req;
  end if;
  perform private.game_notify(v_game.creator_id, 'game_request', 'New Join Request',
                              v_name || ' wants to join your ' || coalesce(nullif(v_game.sport, ''), 'game'),
                              jsonb_build_object('gameId', p_game_id, 'requestId', v_req.id));
  return jsonb_build_object('r', 'ok', 'request', jsonb_build_object('id', v_req.id, 'status', v_req.status, 'created_at', v_req.created_at));
end;
$$;
revoke all on function public.game_request_send(text, uuid, uuid, text) from public;
grant execute on function public.game_request_send(text, uuid, uuid, text) to anon, authenticated;

-- The requester takes back their own pending request: status withdrawn.
-- Answers {r: ok} or r: unavailable, bad, gone (not theirs, or none),
-- answered (with status).
create or replace function public.game_request_withdraw(p_key text, p_user_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.game_requests;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_request_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_req from public.game_requests r where r.id = p_request_id;
  if not found or v_req.user_id is distinct from p_user_id then
    return jsonb_build_object('r', 'gone');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('game_request:' || v_req.game_id::text || ':' || p_user_id::text, 0));
  select * into v_req from public.game_requests r where r.id = p_request_id for update;
  if v_req.status = 'withdrawn' then
    return jsonb_build_object('r', 'ok');
  end if;
  if v_req.status is distinct from 'pending' then
    return jsonb_build_object('r', 'answered', 'status', v_req.status);
  end if;
  update public.game_requests r set status = 'withdrawn' where r.id = p_request_id;
  return jsonb_build_object('r', 'ok');
end;
$$;
revoke all on function public.game_request_withdraw(text, uuid, uuid) from public;
grant execute on function public.game_request_withdraw(text, uuid, uuid) to anon, authenticated;

-- The host accepts or declines. Answers {r: ok, status, current_players}
-- or r: unavailable, bad, gone, not_host, answered (with status), closed,
-- full.
create or replace function public.game_request_answer(p_key text, p_user_id uuid, p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id uuid;
  v_game public.games;
  v_req public.game_requests;
  v_players integer;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_request_id is null or p_accept is null then
    return jsonb_build_object('r', 'bad');
  end if;
  select r.game_id into v_game_id from public.game_requests r where r.id = p_request_id;
  if not found or v_game_id is null then
    return jsonb_build_object('r', 'gone');
  end if;
  -- The game row first, then the request: two answers on one game run one after the other.
  select * into v_game from public.games g where g.id = v_game_id for update;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if v_game.creator_id is distinct from p_user_id then
    return jsonb_build_object('r', 'not_host');
  end if;
  select * into v_req from public.game_requests r where r.id = p_request_id for update;
  if v_req.status is distinct from 'pending' then
    return jsonb_build_object('r', 'answered', 'status', v_req.status);
  end if;
  if p_accept then
    if v_req.user_id is null then
      return jsonb_build_object('r', 'bad');
    end if;
    if coalesce(v_game.status, 'open') not in ('open', 'full') or private.game_over(v_game.date, v_game.start_time, v_game.end_time) then
      return jsonb_build_object('r', 'closed');
    end if;
    if not exists (select 1 from public.game_participants p where p.game_id = v_game.id and p.user_id = v_req.user_id) then
      select count(*) into v_players from public.game_participants p where p.game_id = v_game.id;
      if v_players >= v_game.max_players then
        return jsonb_build_object('r', 'full');
      end if;
      insert into public.game_participants (game_id, user_id) values (v_game.id, v_req.user_id)
      on conflict (game_id, user_id) do nothing;
    end if;
    update public.game_requests r set status = 'accepted', responded_at = now() where r.id = p_request_id;
    select count(*) into v_players from public.game_participants p where p.game_id = v_game.id;
    update public.games g set current_players = v_players where g.id = v_game.id and g.current_players is distinct from v_players;
    perform private.game_notify(v_req.user_id, 'game_request_accepted', 'Request Accepted!', 'Your request to join the game has been accepted!',
                                jsonb_build_object('gameId', v_game.id, 'requestId', p_request_id));
    return jsonb_build_object('r', 'ok', 'status', 'accepted', 'current_players', v_players);
  end if;
  update public.game_requests r set status = 'declined', responded_at = now() where r.id = p_request_id;
  perform private.game_notify(v_req.user_id, 'game_request_declined', 'Request Declined', 'Your request to join the game was declined.',
                              jsonb_build_object('gameId', v_game.id, 'requestId', p_request_id));
  return jsonb_build_object('r', 'ok', 'status', 'declined', 'current_players', v_game.current_players);
end;
$$;
revoke all on function public.game_request_answer(text, uuid, uuid, boolean) from public;
grant execute on function public.game_request_answer(text, uuid, uuid, boolean) to anon, authenticated;

-- The requests for one game: its host gets every one but the withdrawn
-- (newest first, with notes); anyone else only their own latest {id,
-- status}. Answers {r: ok, host: true, requests} or {r: ok, host: false,
-- mine}, or r: unavailable, bad, gone.
create or replace function public.game_requests_for(p_key text, p_user_id uuid, p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_host uuid;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_game_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  select g.creator_id into v_host from public.games g where g.id = p_game_id;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if v_host = p_user_id then
    return jsonb_build_object('r', 'ok', 'host', true, 'requests', coalesce((
      select jsonb_agg(private.game_request_json(r) order by r.created_at desc nulls last)
        from public.game_requests r
       where r.game_id = p_game_id and r.status is distinct from 'withdrawn'), '[]'::jsonb));
  end if;
  return jsonb_build_object('r', 'ok', 'host', false, 'mine', (
    select jsonb_build_object('id', r.id, 'status', r.status)
      from public.game_requests r
     where r.game_id = p_game_id and r.user_id = p_user_id and r.status is distinct from 'withdrawn'
     order by r.created_at desc nulls last
     limit 1));
end;
$$;
revoke all on function public.game_requests_for(text, uuid, uuid) from public;
grant execute on function public.game_requests_for(text, uuid, uuid) to anon, authenticated;

-- The caller's own requests (not the withdrawn), newest first. {r: ok, requests}.
create or replace function public.game_requests_mine(p_key text, p_user_id uuid)
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
    select jsonb_agg(private.game_request_json(r) order by r.created_at desc nulls last)
      from public.game_requests r
     where r.id in (select x.id from public.game_requests x
                     where x.user_id = p_user_id and x.status is distinct from 'withdrawn'
                     order by x.created_at desc nulls last
                     limit 200)), '[]'::jsonb));
end;
$$;
revoke all on function public.game_requests_mine(text, uuid) from public;
grant execute on function public.game_requests_mine(text, uuid) to anon, authenticated;

-- Pending requests on the open games the caller hosts, newest first. {r: ok, requests}.
create or replace function public.game_requests_incoming(p_key text, p_user_id uuid)
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
    select jsonb_agg(private.game_request_json(r) order by r.created_at desc nulls last)
      from public.game_requests r
     where r.id in (select x.id from public.game_requests x
                      join public.games g on g.id = x.game_id
                     where g.creator_id = p_user_id and coalesce(g.status, 'open') in ('open', 'full') and x.status = 'pending'
                     order by x.created_at desc nulls last
                     limit 100)), '[]'::jsonb));
end;
$$;
revoke all on function public.game_requests_incoming(text, uuid) from public;
grant execute on function public.game_requests_incoming(text, uuid) to anon, authenticated;

-- ── 5. Notifications: the caller's own ─────────────────────

-- The newest p_limit (1 to 100), and how many are unread. {r: ok, notifications, unread}.
create or replace function public.notifications_mine(p_key text, p_user_id uuid, p_limit integer default 50)
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
  return jsonb_build_object('r', 'ok',
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc nulls last)
        from (select n.id, n.user_id, n.type, n.title, n.message, n.metadata, n.is_read, n.created_at
                from public.notifications n
               where n.user_id = p_user_id
               order by n.created_at desc nulls last
               limit least(greatest(coalesce(p_limit, 50), 1), 100)) x), '[]'::jsonb),
    'unread', (select count(*) from public.notifications n where n.user_id = p_user_id and n.is_read is not true));
end;
$$;
revoke all on function public.notifications_mine(text, uuid, integer) from public;
grant execute on function public.notifications_mine(text, uuid, integer) to anon, authenticated;

-- How many of the caller's are unread (the header's badge). {r: ok, unread}.
create or replace function public.notifications_unread(p_key text, p_user_id uuid)
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
  return jsonb_build_object('r', 'ok', 'unread', (select count(*) from public.notifications n where n.user_id = p_user_id and n.is_read is not true));
end;
$$;
revoke all on function public.notifications_unread(text, uuid) from public;
grant execute on function public.notifications_unread(text, uuid) to anon, authenticated;

-- Mark one of the caller's read (p_id), or all of theirs (null). {r: ok, marked}, or r: gone for one that isn't theirs.
create or replace function public.notifications_read(p_key text, p_user_id uuid, p_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  if p_id is not null then
    if not exists (select 1 from public.notifications n where n.id = p_id and n.user_id = p_user_id) then
      return jsonb_build_object('r', 'gone');
    end if;
    update public.notifications n set is_read = true where n.id = p_id and n.user_id = p_user_id and n.is_read is not true;
  else
    update public.notifications n set is_read = true where n.user_id = p_user_id and n.is_read is not true;
  end if;
  get diagnostics v_n = row_count;
  return jsonb_build_object('r', 'ok', 'marked', v_n);
end;
$$;
revoke all on function public.notifications_read(text, uuid, uuid) from public;
grant execute on function public.notifications_read(text, uuid, uuid) to anon, authenticated;

-- ── 6. The site owner's reads for /admin ───────────────────

-- Every join request (withdrawn ones too), newest first, optionally one
-- status. Page it with range: PostgREST returns at most 1,000 rows.
create or replace function public.admin_game_requests(p_firebase_token text default null, p_status text default null)
returns table (
  id uuid,
  game_id uuid,
  user_id uuid,
  status text,
  note text,
  requester_name text,
  requester_phone text,
  created_at timestamptz,
  responded_at timestamptz
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
  select r.id, r.game_id, r.user_id, r.status, r.note, r.requester_name::text, r.requester_phone::text, r.created_at, r.responded_at
    from public.game_requests r
   where p_status is null or r.status = p_status
   order by r.created_at desc nulls last, r.id;
end;
$$;
revoke all on function public.admin_game_requests(text, text) from public;
grant execute on function public.admin_game_requests(text, text) to anon, authenticated;

-- The newest 500 notifications (or only the unread ones).
create or replace function public.admin_notifications(p_firebase_token text default null, p_unread boolean default false)
returns table (
  id uuid,
  user_id uuid,
  type text,
  title text,
  message text,
  is_read boolean,
  created_at timestamptz
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
  select n.id, n.user_id, n.type, n.title, n.message, coalesce(n.is_read, false), n.created_at
    from public.notifications n
   where not coalesce(p_unread, false) or n.is_read is not true
   order by n.created_at desc nulls last, n.id
   limit 500;
end;
$$;
revoke all on function public.admin_notifications(text, boolean) from public;
grant execute on function public.admin_notifications(text, boolean) to anon, authenticated;

-- All notifications and the unread ones, counted.
create or replace function public.admin_notification_counts(p_firebase_token text default null)
returns table (total bigint, unread bigint)
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
  select count(*), count(*) filter (where n.is_read is not true) from public.notifications n;
end;
$$;
revoke all on function public.admin_notification_counts(text) from public;
grant execute on function public.admin_notification_counts(text) to anon, authenticated;
