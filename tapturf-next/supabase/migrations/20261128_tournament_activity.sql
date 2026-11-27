set local lock_timeout = '5s';

-- A live tournament's activity (28 Nov 2026). The site owner, who likes the
-- log at the foot of a game's page (20261118_game_updates.sql): "give an
-- activity tab for tournaments page".
--
-- The tournament page (/tournament/<code>) gets an Activity tab: what
-- happened to the tournament and when, newest first. What the page can
-- already work out it works out, with nothing stored (lib/tournament/
-- activity.ts): that it was started, from created_at (and by whom only
-- where the page already names the organiser, public.tournament_host); a
-- result that came from a finished live scorecard, at that scorecard's own
-- last update; that it was taken down, from updated_at. Everything else
-- left no trace until now: a fixture's updated_at moves with every edit
-- and every reorder, so it cannot say when a result came in, and
-- public.tournament_get does not serve it. This file keeps a small log of
-- those changes as they happen.
--
-- Stored, one new column:
--   private.tournaments.activity  jsonb, a list of {at, k, ...}, oldest
--                                 first, the newest 100 kept (fewer when
--                                 they would pass 40000 bytes). Default
--                                 '[]'. at is now() as the change was made.
--                                 k is one of:
--     name      to                          the tournament renamed
--     venue     from, to                    the venue's name (either may be
--                                           missing: none before, none now)
--     dates     fs, fe, ts, te              starts and ends, before and now
--     overs     from, to                    overs a side
--     points    p: [win, tie, nr, loss]     the points now
--     format    legs, playoffs              round robin once or twice, the
--                                           playoffs
--     team      from, to                    a team renamed
--     team_add  to                          a team added after the start (no
--                                           function adds one today; a
--                                           team cannot be taken out at all)
--   and for a fixture, each with f (its id), h and a (the two teams' names
--   as they were then; missing for a playoff place not filled) and p (s1,
--   s2 or f for a semi-final or the final; missing in the league):
--     fx_add    d, t                        a fixture added after the start
--     fx_move   fd, ft, d, t                its day or time, before and now
--     fx_teams                              its teams changed
--     fx_out                                taken out (the row is marked
--                                           removed, as before; it stays)
--     live                                  linked to a live scorecard (the
--                                           code is not kept: the page links
--                                           to the one the fixture has now)
--     res       s, w, bf, x  or  live, x    its first result. By hand: s is
--                                           [home runs, home wickets, away
--                                           runs, away wickets], w the
--                                           result choice, bf who batted
--                                           first, x the sender's own words
--                                           when there were any. From a
--                                           finished live scorecard: live
--                                           true and x, the scorecard's
--                                           words ("Titans won by 9 runs")
--     fix       as res                      a result changed: corrected by
--                                           hand, or a hand result taken
--                                           back so the scorecard's counts
--                                           again, or the scorecard's own
--                                           result changed after it finished
--     clear                                 its result taken back, none left
--   and two the fixtures add up to:
--     draw      to: semis or final          every league match has a result
--                                           and there are playoffs to play
--     done                                  every match has a result
--   Nothing private is ever in it: no account (user_id), no secret or its
--   hash, no network hash, no name, number or email of anybody, nothing
--   about who manages the tournament or from which device, and nothing a
--   follower could not already see on the page. Keeping a tournament with
--   an account, adding a device and the hourly clearing of network hashes
--   note nothing. A tournament from before this file has an empty log:
--   nothing is made up for it.
--
-- Noted by triggers, from the row's own old and new values, whichever
-- function made the change, so no tournament function is replaced:
--   tournaments_activity_note          before update on private.tournaments,
--                                      only when its name or settings change
--   tournament_teams_activity_add      after insert on private.tournament_teams
--   tournament_teams_activity_note     after update, only when the name changes
--   tournament_fixtures_activity_add   after insert on private.tournament_fixtures
--   tournament_fixtures_activity_note  after update, only when its status,
--                                      teams, day, time, live code, result
--                                      or live result change
-- A write that changes none of those never reaches a trigger function: a
-- reorder, a rev going up, a view counted, and a finished scorecard sent
-- again with the same result (its live_rev moves, its result does not) all
-- note nothing. The rows made with the tournament (its teams and fixtures,
-- in the transaction that makes it) note nothing: the page says "started".
-- The fixture and team triggers run after the write and after the whole
-- statement, so public.tournament_live_result, which changes fixtures and
-- their tournaments in one statement, still raises each tournament's rev
-- itself. Each trigger does its work inside a block that turns any error
-- into a warning: the change always goes through, with or without a note.
--
-- Returned, one new read beside public.tournament_get (which is not
-- replaced and answers what it did):
--   public.tournament_activity(p_key, p_code): jsonb
--     Gated exactly as public.tournament_get: the live write key
--     (private.live_key_ok), else {r: unavailable}; execute for anon and
--     authenticated, because the key is the gate and only the Next server
--     holds it (lib/tournament/server.ts). Stable, security definer,
--     search_path ''. For a tournament that is on it answers the stored
--     list as it is, oldest first ([] when there is none yet); null for
--     anything else (no such tournament, a code that is not a code, a
--     tournament taken down).
--
-- Replaced: none. Each md5 below is md5(prosrc) of that function's latest
-- body in the repo's migrations; production was not read for this file, so
-- compare before applying:
--   select s.nspname, p.proname, md5(p.prosrc) from pg_proc p
--     join pg_namespace s on s.oid = p.pronamespace
--    where p.proname in ('live_key_ok', 'tournament_create', 'tournament_update',
--                        'tournament_live_result', 'tournament_attach',
--                        'tournament_device_add', 'tournament_get');
-- Called by this file:
--   private.live_key_ok              dc6dd849755acae1b79619d94e377586  20261021_accounts_usernames.sql
-- Not called and not changed; their writes are what the triggers see:
--   public.tournament_create         0f5418e2f0bdfd3657e5901b587be260  20261102_live_tournaments.sql
--   public.tournament_update         25f87272a5744bc3ca29ac129debcb17  20261102_live_tournaments.sql
--   public.tournament_live_result    ac5289b6bda6d7e5796cd4e043749966  20261102_live_tournaments.sql
--   public.tournament_attach         8582cedc939051f0b6d4600469a53ae1  20261102_live_tournaments.sql
--   public.tournament_device_add     ada048dd543410ae392bebc467bdb222  20261102_live_tournaments.sql
-- Not called and not changed; it still answers nothing about the log:
--   public.tournament_get            fa6843c70b94890e24496b6edef6fd3a  20261102_live_tournaments.sql
-- Read: private.tournaments (code, status, created_at, name, settings,
-- activity), private.tournament_teams (name) and private.tournament_fixtures
-- (one tournament's rows, by their primary key, when a first result comes
-- in or a fixture is taken out). Written: private.tournaments.activity only.
--
-- Needs 20261021_accounts_usernames.sql and 20261102_live_tournaments.sql
-- (it refuses to run without them, changing nothing). Additive: one column
-- and one check on private.tournaments, five triggers, new functions. No
-- index, no table, no job, no grant or policy on a table. Written without
-- the destructive SQL keywords; nothing is taken away. No string in this
-- file has a backslash. Safe to run again.
-- The app works before this file: the read finds no function, the tab
-- shows what the page can work out (started, results from finished live
-- scorecards) and everything else on the page is exactly as it was.
-- Erasing an account: the log holds nothing about a person, so there is
-- nothing more to clear.
-- Never in a title, a description, an og tag or JSON-LD: the log is drawn
-- only in the tournament page's own body, marked data-nosnippet.
-- Test: scripts/sql-tests/tournament_activity.check.mjs (PGlite).

do $$
begin
  if to_regprocedure('private.live_key_ok(text)') is null
     or to_regclass('private.tournaments') is null
     or to_regclass('private.tournament_teams') is null
     or to_regclass('private.tournament_fixtures') is null then
    raise exception 'tournament_activity needs 20261021_accounts_usernames.sql and 20261102_live_tournaments.sql first';
  end if;
end;
$$;

-- ── 1. The column ──────────────────────────────────────────

alter table private.tournaments add column if not exists activity jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint c where c.conrelid = 'private.tournaments'::regclass and c.conname = 'tournaments_activity_shape') then
    alter table private.tournaments add constraint tournaments_activity_shape
      check (case when jsonb_typeof(activity) = 'array' then jsonb_array_length(activity) <= 100 and octet_length(activity::text) <= 60000 else false end);
  end if;
end;
$$;

-- The log with new entries at its end: the newest 100, and fewer (half, and half again) while it would pass
-- 40000 bytes, so the column's check is never what stops a write. A log that is no list starts again.
create or replace function private.tournament_activity_add(p_log jsonb, p_add jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_all jsonb := case when jsonb_typeof(p_log) = 'array' then p_log else '[]'::jsonb end
                 || case when jsonb_typeof(p_add) = 'array' then p_add else '[]'::jsonb end;
  v_keep integer := 100;
  v_out jsonb;
begin
  loop
    select coalesce(jsonb_agg(x.e order by x.i), '[]'::jsonb) into v_out
      from jsonb_array_elements(v_all) with ordinality x(e, i)
     where x.i > jsonb_array_length(v_all) - v_keep;
    exit when octet_length(v_out::text) <= 40000 or v_keep <= 1;
    v_keep := v_keep / 2;
  end loop;
  if octet_length(v_out::text) > 40000 then
    return case when jsonb_typeof(p_log) = 'array' then p_log else '[]'::jsonb end;
  end if;
  return v_out;
end;
$$;
revoke all on function private.tournament_activity_add(jsonb, jsonb) from public, anon, authenticated;

-- ── 2. The tournament's own row: its name and what followers see of its settings ──

-- Before a tournament's name or settings change: what changed, noted on the row. Never the account, a secret or a
-- network hash (the trigger does not fire for those), and nothing for a tournament that is not on. Never fails the
-- change: an error here is a warning.
create or replace function private.tournament_activity_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at constant jsonb := to_jsonb(now());
  v_add jsonb := '[]'::jsonb;
  o jsonb := old.settings;
  n jsonb := new.settings;
begin
  begin
    -- Taken down, or somebody is writing the log itself: nothing to say.
    if new.status <> 'on' or old.status <> 'on' or new.activity is distinct from old.activity then
      return new;
    end if;
    if new.name is distinct from old.name then
      v_add := v_add || jsonb_build_object('at', v_at, 'k', 'name', 'to', new.name);
    end if;
    if (n -> 'venue' ->> 'id') is distinct from (o -> 'venue' ->> 'id')
       or (n -> 'venue' ->> 'name') is distinct from (o -> 'venue' ->> 'name') then
      v_add := v_add || jsonb_strip_nulls(jsonb_build_object('at', v_at, 'k', 'venue',
                                                             'from', left(o -> 'venue' ->> 'name', 80), 'to', left(n -> 'venue' ->> 'name', 80)));
    end if;
    if (n ->> 'starts') is distinct from (o ->> 'starts') or (n ->> 'ends') is distinct from (o ->> 'ends') then
      v_add := v_add || jsonb_strip_nulls(jsonb_build_object('at', v_at, 'k', 'dates',
                                                             'fs', o ->> 'starts', 'fe', o ->> 'ends', 'ts', n ->> 'starts', 'te', n ->> 'ends'));
    end if;
    if (n ->> 'overs') is distinct from (o ->> 'overs') then
      v_add := v_add || jsonb_strip_nulls(jsonb_build_object('at', v_at, 'k', 'overs', 'from', (o ->> 'overs')::integer, 'to', (n ->> 'overs')::integer));
    end if;
    if (n -> 'points' ->> 'win') is distinct from (o -> 'points' ->> 'win') or (n -> 'points' ->> 'tie') is distinct from (o -> 'points' ->> 'tie')
       or (n -> 'points' ->> 'nr') is distinct from (o -> 'points' ->> 'nr') or (n -> 'points' ->> 'loss') is distinct from (o -> 'points' ->> 'loss') then
      v_add := v_add || jsonb_build_object('at', v_at, 'k', 'points', 'p', jsonb_build_array(
                          (n -> 'points' ->> 'win')::integer, (n -> 'points' ->> 'tie')::integer, (n -> 'points' ->> 'nr')::integer, (n -> 'points' ->> 'loss')::integer));
    end if;
    -- A series' length is not noted: its matches being added and taken out say it.
    if (n ->> 'legs') is distinct from (o ->> 'legs') or (n ->> 'playoffs') is distinct from (o ->> 'playoffs') then
      v_add := v_add || jsonb_build_object('at', v_at, 'k', 'format', 'legs', (n ->> 'legs')::integer, 'playoffs', n ->> 'playoffs');
    end if;
    if jsonb_array_length(v_add) > 0 then
      new.activity := private.tournament_activity_add(old.activity, v_add);
    end if;
  exception when others then
    raise warning 'tournament activity: settings not noted: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function private.tournament_activity_settings() from public, anon, authenticated;

create or replace trigger tournaments_activity_note
  before update on private.tournaments
  for each row
  when (new.name is distinct from old.name or new.settings is distinct from old.settings)
  execute function private.tournament_activity_settings();

-- ── 3. Its teams ───────────────────────────────────────────

-- After a team is renamed, or one is added to a tournament made in an earlier transaction (the teams a tournament
-- is made with note nothing). Never fails the change.
create or replace function private.tournament_activity_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if TG_OP = 'INSERT' then
      update private.tournaments t
         set activity = private.tournament_activity_add(t.activity, jsonb_build_array(jsonb_build_object('at', to_jsonb(now()), 'k', 'team_add', 'to', new.name)))
       where t.code = new.code and t.status = 'on' and t.created_at < now();
    elsif new.name is distinct from old.name then
      update private.tournaments t
         set activity = private.tournament_activity_add(t.activity, jsonb_build_array(jsonb_build_object('at', to_jsonb(now()), 'k', 'team', 'from', old.name, 'to', new.name)))
       where t.code = new.code and t.status = 'on';
    end if;
  exception when others then
    raise warning 'tournament activity: team not noted: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function private.tournament_activity_team() from public, anon, authenticated;

create or replace trigger tournament_teams_activity_add
  after insert on private.tournament_teams
  for each row
  execute function private.tournament_activity_team();

create or replace trigger tournament_teams_activity_note
  after update on private.tournament_teams
  for each row
  when (new.name is distinct from old.name)
  execute function private.tournament_activity_team();

-- ── 4. Its fixtures ────────────────────────────────────────

-- After a fixture is added to a tournament made in an earlier transaction, or one changes in a way followers see:
-- taken out, its teams, its day or time, a live scorecard, a result. The result followers see is the one entered by
-- hand, else the live scorecard's; a change to the one behind it notes nothing. Never fails the change.
create or replace function private.tournament_activity_fixture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_add jsonb := '[]'::jsonb;
  v_base jsonb;
  v_hand jsonb;
  v_live jsonb;
  v_first boolean := false;
  v_gone boolean := false;
  v_n integer;
  v_left integer;
  v_league_left integer;
  v_playoffs integer;
  v_semis integer;
begin
  begin
    if TG_OP = 'INSERT' then
      if new.status = 'removed'
         or not exists (select 1 from private.tournaments t where t.code = new.code and t.status = 'on' and t.created_at < now()) then
        return null;
      end if;
    elsif old.status = 'removed' then
      return null;
    end if;
    v_base := jsonb_strip_nulls(jsonb_build_object(
      'at', to_jsonb(now()),
      'f', new.id,
      'p', case when new.stage = 'final' then 'f' when new.stage = 'semi' and new.slot = 's2' then 's2' when new.stage = 'semi' then 's1' end,
      'h', (select m.name from private.tournament_teams m where m.code = new.code and m.id = new.home),
      'a', (select m.name from private.tournament_teams m where m.code = new.code and m.id = new.away)));
    if TG_OP = 'INSERT' then
      v_add := v_add || (v_base || jsonb_strip_nulls(jsonb_build_object('k', 'fx_add', 'd', new.day, 't', new.time)));
    elsif new.status = 'removed' then
      v_add := v_add || (v_base || jsonb_build_object('k', 'fx_out'));
      v_gone := old.result is null and old.live_result is null;
    else
      if new.result is not null then
        v_hand := jsonb_strip_nulls(jsonb_build_object(
          's', jsonb_build_array((new.result -> 'a' ->> 'runs')::integer, (new.result -> 'a' ->> 'wickets')::integer,
                                 (new.result -> 'b' ->> 'runs')::integer, (new.result -> 'b' ->> 'wickets')::integer),
          'w', new.result ->> 'result',
          'bf', new.result ->> 'battedFirst',
          'x', left(nullif(btrim(new.result ->> 'text'), ''), 120)));
      end if;
      if new.live_result is not null then
        v_live := jsonb_strip_nulls(jsonb_build_object('live', true, 'x', left(nullif(btrim(new.live_result ->> 'text'), ''), 120)));
      end if;
      -- Its teams, when that is the change itself (a result or a scorecard that pins a playoff's places says its own line).
      if (new.home is distinct from old.home or new.away is distinct from old.away)
         and new.result is not distinct from old.result and new.live_code is not distinct from old.live_code then
        v_add := v_add || (v_base || jsonb_build_object('k', 'fx_teams'));
      end if;
      if new.day is distinct from old.day or new.time is distinct from old.time then
        v_add := v_add || (v_base || jsonb_strip_nulls(jsonb_build_object('k', 'fx_move', 'fd', old.day, 'ft', old.time, 'd', new.day, 't', new.time)));
      end if;
      if new.live_code is not null and new.live_code is distinct from old.live_code then
        v_add := v_add || (v_base || jsonb_build_object('k', 'live'));
      end if;
      if new.result is distinct from old.result then
        if new.result is not null then
          v_first := old.result is null and old.live_result is null;
          v_add := v_add || (v_base || jsonb_build_object('k', case when v_first then 'res' else 'fix' end) || v_hand);
        elsif new.live_result is not null then
          -- The hand result was taken back: the scorecard's counts again.
          v_add := v_add || (v_base || jsonb_build_object('k', 'fix') || v_live);
        else
          v_add := v_add || (v_base || jsonb_build_object('k', 'clear'));
        end if;
      elsif new.result is null and new.live_result is distinct from old.live_result then
        if new.live_result is not null then
          v_first := old.live_result is null;
          v_add := v_add || (v_base || jsonb_build_object('k', case when v_first then 'res' else 'fix' end) || v_live);
        else
          v_add := v_add || (v_base || jsonb_build_object('k', 'clear'));
        end if;
      end if;
    end if;
    if jsonb_array_length(v_add) = 0 then
      return null;
    end if;
    -- A first result, or the last match without one taken out: is the league done, or the whole tournament?
    if v_first or v_gone then
      select count(*),
             count(*) filter (where x.result is null and x.live_result is null),
             count(*) filter (where x.stage = 'league' and x.result is null and x.live_result is null),
             count(*) filter (where x.stage <> 'league'),
             count(*) filter (where x.stage = 'semi')
        into v_n, v_left, v_league_left, v_playoffs, v_semis
        from private.tournament_fixtures x
       where x.code = new.code and x.status <> 'removed';
      if v_n > 0 and v_left = 0 then
        v_add := v_add || jsonb_build_object('at', to_jsonb(now()), 'k', 'done');
      elsif new.stage = 'league' and v_league_left = 0 and v_playoffs > 0 and v_n > v_playoffs then
        v_add := v_add || jsonb_build_object('at', to_jsonb(now()), 'k', 'draw', 'to', case when v_semis > 0 then 'semis' else 'final' end);
      end if;
    end if;
    update private.tournaments t
       set activity = private.tournament_activity_add(t.activity, v_add)
     where t.code = new.code and t.status = 'on';
  exception when others then
    raise warning 'tournament activity: fixture not noted: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function private.tournament_activity_fixture() from public, anon, authenticated;

create or replace trigger tournament_fixtures_activity_add
  after insert on private.tournament_fixtures
  for each row
  execute function private.tournament_activity_fixture();

create or replace trigger tournament_fixtures_activity_note
  after update on private.tournament_fixtures
  for each row
  when (old.status <> 'removed'
        and (new.status is distinct from old.status
             or new.home is distinct from old.home or new.away is distinct from old.away
             or new.day is distinct from old.day or new.time is distinct from old.time
             or new.live_code is distinct from old.live_code
             or new.result is distinct from old.result or new.live_result is distinct from old.live_result))
  execute function private.tournament_activity_fixture();

-- ── 5. The read ────────────────────────────────────────────

create or replace function public.tournament_activity(p_key text, p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.live_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_code is null or p_code !~ '^[a-z0-9]{12}$' then
    return null;
  end if;
  return (select t.activity from private.tournaments t where t.code = p_code and t.status = 'on');
end;
$$;

revoke all on function public.tournament_activity(text, text) from public, anon, authenticated;
-- As public.tournament_get: the Next server calls it with the app's anon key and the live write key (p_key); the key is the gate.
grant execute on function public.tournament_activity(text, text) to anon, authenticated;
comment on function public.tournament_activity(text, text) is 'Live write key only: the log of changes followers could already see on a tournament that is on (private.tournaments.activity, the newest 100, oldest first): renames, fixtures added, moved or taken out, matches scored live, results and corrections, settings. null for anything else. Never an account, a secret, a network hash or anything about a person.';
