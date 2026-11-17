set local lock_timeout = '5s';

-- Updates from the host, and a game's activity (18 Nov 2026). The site
-- owner, looking at a game's "Your note" he had edited to add a line:
-- "Instead of notes, can we add updates section? Like when game was
-- created host added notes, then what I did I edited the note; instead of
-- that show updates with timeframes", then "Show activity log at the very
-- bottom too of the game".
--
-- Updates: games.description stays what the host wrote when the game went
-- up (the page shows it as the first entry, at games.created_at). After
-- that the host posts updates, each kept with when it was posted:
--   games.updates   jsonb, a list of {id, at, text}, oldest first, 20 at
--                   most; text is 1 to 300 characters as the host typed
--                   it (trimmed). On the public row, as the note is: the
--                   page reads it with the game, no new read, and the
--                   games key of the cache queue covers it.
-- public.game_update_post (the game's host, while the game is open and not
-- over; 20 a game, and 10 posts a game in a day counted in
-- private.game_update_posts so taking one back gives no post back) adds
-- one and tells, once each and in the app only (type game_update_posted,
-- "Asha: Turf booked, please bring bottles"), the people a time change
-- tells: the game's players and everyone with a request waiting or
-- accepted, and the tagged players still to answer; never the host. No
-- email (private.email_kind_of knows no such type) and no SMS; web push
-- sends it as it sends any notification with a game.
-- public.game_update_remove takes one back (it is gone from the list;
-- nothing can be edited, so the times stay true). An update belongs to its
-- one game, a repeat's too.
--
-- Activity: what happened to a game and when, for the timeline at the foot
-- of its page. What the page can work out it works out (posted, from
-- created_at; a player joined, from game_participants.joined_at; an
-- update, from games.updates: lib/games/activity.ts). What left no trace
-- until now is noted on the row as it happens:
--   games.activity  jsonb, a list of {at, k, ...}, oldest first, the
--                   newest 50 kept. k is one of:
--                     time       fd, fs, fe -> td, ts, te (day, start, end)
--                     venue      from -> to (the venues' names)
--                     spots      from -> to (max players)
--                     booked     the host said the turf is booked
--                     confirmed  n more people confirmed with the host (a
--                                number only: never a typed name, never a
--                                tagged player)
--                     full       the game filled up (before its start)
--                     cancelled  the game was called off
-- Noted by one trigger on public.games (private.game_activity_note, before
-- an insert or update of the row), from the row's own old and new values,
-- whichever function made the change: so no game function is replaced
-- (game_update cc7e51846ae5bf9067a9dc3d60d6c0e0, game_cancel
-- 549331bb333fd8223527b687c96d8a17 and game_request_answer
-- b373dfe612350114e7325f9ba94c0ae5 on production, read 17 Nov 2026, stay
-- as they are). A failure in it is a warning and the change goes through
-- without a note. Nothing in the log is private: every entry is something
-- the page shows or showed (no request, no note of a request, nobody who
-- asked and was not accepted, no number), and somebody who took
-- themselves off a game leaves no entry. Games from before this file have
-- an empty log: nothing is made up for them.
--
-- Called and left as they are, production's md5 equal to the repo's:
--   private.account_key_ok   ca605fa89a97497134b690e753dc5c0e  20261021_accounts_usernames.sql
--   private.game_notify      b105f7aee319ed9725f42b85c5d4735c  20261030_games_lockdown.sql
--   private.game_over        b7ffb3e6915e6bc9743db2027a7fb7ee  20261030_games_lockdown.sql
--   private.game_sport_text  28192bf7b394432826d0a19a3a6c4d08  20261110_email.sql
--
-- New public functions (server key, private.account_key_ok; EXECUTE to
-- anon and authenticated as the other game functions):
--   game_update_post(p_key, p_user_id, p_game_id, p_text): {r: ok, update,
--     updates, notified} or r: unavailable, bad (field text), gone,
--     not_host, closed (over or off), most (20 already), limit (10 posts
--     on this game in a day).
--   game_update_remove(p_key, p_user_id, p_game_id, p_update_id): {r: ok,
--     updates} or r: unavailable, bad, gone (no such game or update),
--     not_host.
--
-- Additive: two columns and two checks on public.games, one private table,
-- one trigger on public.games, new functions. Nothing replaced. No grant
-- or policy on a public table changes: anon and authenticated already
-- read every games column, so the updates and the log are public, as the
-- note is; list rows leave both out in the app (cardGame, shapeGames,
-- Ask's games, the browser's list reads). Written without the destructive
-- SQL keywords. No string in this file has a backslash. Safe to run again.
--
-- Before this file: the page shows the note as it did and offers no
-- "Post an update"; the routes answer plainly (reason updates_off); the
-- timeline shows what it can work out.
--
-- Check: PGLITE=<pglite dist/index.js> node scripts/sql-tests/game_updates.check.mjs supabase/migrations

-- Built on the games lockdown, emails and the confirmed people: without them it refuses to run (and changes nothing).
do $$
begin
  if to_regprocedure('private.game_notify(uuid,text,text,text,jsonb)') is null
     or to_regprocedure('private.game_over(date,time,time)') is null
     or to_regprocedure('private.game_sport_text(text)') is null
     or to_regclass('private.game_tags') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'games' and column_name = 'confirmed_tagged') then
    raise exception 'game updates: apply 20261030_games_lockdown.sql, 20261110_email.sql and 20261117_game_confirmed.sql first';
  end if;
end;
$$;

-- ── 1. The columns and the table ───────────────────────────

alter table public.games add column if not exists updates jsonb not null default '[]'::jsonb;
alter table public.games add column if not exists activity jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.games'::regclass and c.conname = 'games_updates_shape') then
    alter table public.games add constraint games_updates_shape
      check (case when jsonb_typeof(updates) = 'array' then jsonb_array_length(updates) <= 20 and octet_length(updates::text) <= 40000 else false end);
  end if;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.games'::regclass and c.conname = 'games_activity_shape') then
    alter table public.games add constraint games_activity_shape
      check (case when jsonb_typeof(activity) = 'array' then jsonb_array_length(activity) <= 50 and octet_length(activity::text) <= 24000 else false end);
  end if;
end;
$$;

-- Every update posted, for the daily limit (an update taken back still counts). No text, no person.
create table if not exists private.game_update_posts (
  game_id uuid not null,
  posted_at timestamptz not null default now()
);
create index if not exists game_update_posts_idx on private.game_update_posts (game_id, posted_at);
alter table private.game_update_posts enable row level security;
revoke all on private.game_update_posts from public, anon, authenticated;

-- The limits (lib/games/updates.ts has the same).
create or replace function private.game_update_max()
returns integer language sql immutable set search_path = '' as $$ select 20 $$;
create or replace function private.game_update_day_max()
returns integer language sql immutable set search_path = '' as $$ select 10 $$;
create or replace function private.game_update_chars()
returns integer language sql immutable set search_path = '' as $$ select 300 $$;
revoke all on function private.game_update_max() from public, anon, authenticated;
revoke all on function private.game_update_day_max() from public, anon, authenticated;
revoke all on function private.game_update_chars() from public, anon, authenticated;

-- ── 2. Updates ─────────────────────────────────────────────

-- The host posts an update on their own game, while it is open and not over. Its players, everyone with a
-- request waiting or accepted and the tagged players still to answer are told once, in the app; never the host.
create or replace function public.game_update_post(p_key text, p_user_id uuid, p_game_id uuid, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_text text := btrim(coalesce(p_text, ''), ' ' || chr(9) || chr(10) || chr(13));
  v_entry jsonb;
  v_line text;
  v_user uuid;
  v_notified integer := 0;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_game_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  if char_length(v_text) not between 1 and private.game_update_chars() then
    return jsonb_build_object('r', 'bad', 'field', 'text');
  end if;
  -- The game row first: one change to its list at a time.
  select * into v_game from public.games g where g.id = p_game_id for update;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if v_game.creator_id is distinct from p_user_id then
    return jsonb_build_object('r', 'not_host');
  end if;
  if coalesce(v_game.status, 'open') not in ('open', 'full') or private.game_over(v_game.date, v_game.start_time, v_game.end_time) then
    return jsonb_build_object('r', 'closed');
  end if;
  if jsonb_array_length(v_game.updates) >= private.game_update_max() then
    return jsonb_build_object('r', 'most');
  end if;
  if (select count(*) from private.game_update_posts p where p.game_id = p_game_id and p.posted_at > now() - interval '1 day') >= private.game_update_day_max() then
    return jsonb_build_object('r', 'limit');
  end if;
  v_entry := jsonb_build_object('id', gen_random_uuid(), 'at', now(), 'text', v_text);
  update public.games g set updates = g.updates || jsonb_build_array(v_entry), updated_at = now()
   where g.id = p_game_id
  returning * into v_game;
  insert into private.game_update_posts (game_id) values (p_game_id);
  -- "Asha: Turf booked, please bring bottles": one line, the first 80 characters.
  v_line := btrim(translate(v_text, chr(10) || chr(13) || chr(9), '   '));
  v_line := coalesce(nullif(split_part(btrim(coalesce(v_game.host_name, '')), ' ', 1), ''), 'Your host') || ': '
            || case when char_length(v_line) > 80 then left(v_line, 77) || '...' else v_line end;
  for v_user in
    select p.user_id from public.game_participants p where p.game_id = p_game_id
    union
    select r.user_id from public.game_requests r where r.game_id = p_game_id and r.status in ('pending', 'accepted')
    union
    select t.user_id from private.game_tags t join public.users u on u.id = t.user_id where t.game_id = p_game_id and t.status = 'pending'
  loop
    continue when v_user is null or v_user = v_game.creator_id;
    perform private.game_notify(v_user, 'game_update_posted',
                                'Update: ' || coalesce(private.game_sport_text(v_game.sport), 'your game') || ', ' || to_char(v_game.date, 'Dy FMDD Mon'),
                                v_line, jsonb_build_object('gameId', p_game_id, 'updateId', v_entry ->> 'id'));
    v_notified := v_notified + 1;
  end loop;
  return jsonb_build_object('r', 'ok', 'update', v_entry, 'updates', v_game.updates, 'notified', v_notified);
end;
$$;
revoke all on function public.game_update_post(text, uuid, uuid, text) from public;
grant execute on function public.game_update_post(text, uuid, uuid, text) to anon, authenticated;

-- The host takes back an update they posted: it is gone from the list. Any time, on their own game.
create or replace function public.game_update_remove(p_key text, p_user_id uuid, p_game_id uuid, p_update_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_game_id is null or p_update_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_game from public.games g where g.id = p_game_id for update;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if v_game.creator_id is distinct from p_user_id then
    return jsonb_build_object('r', 'not_host');
  end if;
  if not exists (select 1 from jsonb_array_elements(v_game.updates) e where e ->> 'id' = p_update_id::text) then
    return jsonb_build_object('r', 'gone');
  end if;
  update public.games g
     set updates = coalesce((select jsonb_agg(x.e order by x.i)
                               from jsonb_array_elements(g.updates) with ordinality x(e, i)
                              where x.e ->> 'id' is distinct from p_update_id::text), '[]'::jsonb),
         updated_at = now()
   where g.id = p_game_id
  returning * into v_game;
  return jsonb_build_object('r', 'ok', 'updates', v_game.updates);
end;
$$;
revoke all on function public.game_update_remove(text, uuid, uuid, uuid) from public;
grant execute on function public.game_update_remove(text, uuid, uuid, uuid) to anon, authenticated;

-- ── 3. Activity ────────────────────────────────────────────

-- A venue's name as the log says it: the turf's, or the one its host typed.
create or replace function private.game_activity_venue(p_turf_id uuid, p_venue_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(coalesce(nullif(btrim((select t.name::text from public.turfs t where t.id = p_turf_id)), ''), nullif(btrim(p_venue_name), ''), 'another venue'), 80);
$$;
revoke all on function private.game_activity_venue(uuid, text) from public, anon, authenticated;

-- Before a game row is made or changed: what the change is, noted on the row (games.activity, the newest 50). A
-- new game notes only the people its host confirmed with it. Never fails the change: an error here is a warning.
create or replace function private.game_activity_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at constant jsonb := to_jsonb(now());
  v_add jsonb := '[]'::jsonb;
  v_was integer;
  v_is integer;
  v_log jsonb;
begin
  v_is := coalesce(cardinality(new.confirmed_names), 0) + coalesce(new.confirmed_extra, 0) + coalesce(new.confirmed_tagged, 0);
  if TG_OP = 'INSERT' then
    if v_is > 0 and coalesce(new.activity, '[]'::jsonb) = '[]'::jsonb then
      new.activity := jsonb_build_array(jsonb_build_object('at', v_at, 'k', 'confirmed', 'n', v_is));
    end if;
    return new;
  end if;
  -- Somebody is writing the log itself: theirs to say.
  if new.activity is distinct from old.activity then
    return new;
  end if;
  if (new.date, new.start_time, new.end_time) is distinct from (old.date, old.start_time, old.end_time) then
    v_add := v_add || jsonb_build_object('at', v_at, 'k', 'time',
                                         'fd', old.date, 'fs', to_char(old.start_time, 'HH24:MI'), 'fe', to_char(old.end_time, 'HH24:MI'),
                                         'td', new.date, 'ts', to_char(new.start_time, 'HH24:MI'), 'te', to_char(new.end_time, 'HH24:MI'));
  end if;
  if new.turf_id is distinct from old.turf_id
     or (new.turf_id is null and lower(btrim(coalesce(new.venue_name, ''))) is distinct from lower(btrim(coalesce(old.venue_name, '')))) then
    v_add := v_add || jsonb_build_object('at', v_at, 'k', 'venue',
                                         'from', private.game_activity_venue(old.turf_id, old.venue_name),
                                         'to', private.game_activity_venue(new.turf_id, new.venue_name));
  end if;
  if new.max_players is distinct from old.max_players then
    v_add := v_add || jsonb_build_object('at', v_at, 'k', 'spots', 'from', old.max_players, 'to', new.max_players);
  end if;
  if new.turf_booked is true and old.turf_booked is not true then
    v_add := v_add || jsonb_build_object('at', v_at, 'k', 'booked');
  end if;
  v_was := coalesce(cardinality(old.confirmed_names), 0) + coalesce(old.confirmed_extra, 0) + coalesce(old.confirmed_tagged, 0);
  if v_is > v_was then
    v_add := v_add || jsonb_build_object('at', v_at, 'k', 'confirmed', 'n', v_is - v_was);
  end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    v_add := v_add || jsonb_build_object('at', v_at, 'k', 'cancelled');
  elsif new.max_players > 0 and new.current_players >= new.max_players
        and coalesce(old.current_players, 0) < coalesce(old.max_players, 0)
        -- Before it starts only: a player who says afterwards that they played fills nothing.
        and (new.date + coalesce(new.start_time, time '00:00')) at time zone 'Asia/Kolkata' > now() then
    v_add := v_add || jsonb_build_object('at', v_at, 'k', 'full');
  end if;
  if jsonb_array_length(v_add) > 0 then
    v_log := coalesce(old.activity, '[]'::jsonb) || v_add;
    if jsonb_array_length(v_log) > 50 then
      v_log := (select jsonb_agg(x.e order by x.i)
                  from jsonb_array_elements(v_log) with ordinality x(e, i)
                 where x.i > jsonb_array_length(v_log) - 50);
    end if;
    new.activity := v_log;
  end if;
  return new;
exception when others then
  raise warning 'game activity: not noted: %', sqlerrm;
  return new;
end;
$$;
revoke all on function private.game_activity_note() from public, anon, authenticated;

create or replace trigger games_activity_note
  before insert or update on public.games
  for each row
  execute function private.game_activity_note();
