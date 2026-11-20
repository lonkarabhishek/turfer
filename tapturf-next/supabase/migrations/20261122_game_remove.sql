set local lock_timeout = '5s';

-- A host can take a game they posted off TapTurf (20 Nov 2026). The site
-- owner asked for a way to get rid of a hosted game (his words are in
-- tapturf-next/CLAUDE.md). Until now a host could only call a game off
-- (public.game_cancel), and the called-off game stayed on the site and in
-- their lists.
--
-- Taking a game off is "call it off if needed, then hide it from
-- everyone". The row is never removed from the table: it is kept, hidden,
-- so the players who were in it could be told and a mistake can be put
-- right by hand (the last lines of this header).
--
-- What changes on public.games:
--   removed_at      timestamptz, null for every game on TapTurf. Set once,
--                   when its host takes the game off.
--   removed_status  text, null with removed_at. The status the game had
--                   just before (open, full, completed, cancelled), so it
--                   can be put back.
--   games_removed_fields  a check: the two columns are set together, and
--                   a hidden game is always status 'cancelled'.
--   The read policy "Anyone can read games" goes from using (true) to
--   using (removed_at is null): the browser's and the server's reads of
--   public.games (both the anon key, both under row level security) stop
--   seeing a hidden game, so it leaves every list, the home, a turf's
--   games, the map, its own page (which then says "Game not found"), the
--   sitemap, the share image, Ask, the scoring hand-off, the admin's game
--   list and its host's Passport without one reader being touched. The
--   change is guarded: it is made only when that policy is there with
--   the plain condition true it has today; it is left alone when it
--   already has the new condition; anything else stops the file before
--   it has changed a thing, and so does any other policy that would
--   still let a hidden game be read. No grant changes.
--
-- Why a hidden game is always status 'cancelled': the functions that run
-- as their owner do not go through the policy. Every one of them that
-- shows a game to somebody or acts on one already leaves a called-off game
-- alone, so a hidden game needs no reader replaced:
--   turf_page (a turf's games), owner_dashboard's upcoming count,
--   game_series_mine and private.game_series_fill (a repeat's counts; the
--   day itself stays in private.game_series_dates, so a repeat never puts
--   the hidden date up again), game_series_stop, game_requests_incoming,
--   private.email_clock (reminders, waiting requests), private.email_job
--   (sends nothing for it but its own cancelled email, which links to
--   /games), private.game_tags_expire and private.game_tags_ask,
--   game_tags_shown, game_tags_played and game_tag_played ("Did you
--   play?"), game_tag_answer, game_request_send, game_request_answer,
--   game_update, game_update_post, private.played_game_ids (played with;
--   private.whatsapp_mates reads games through it),
--   private.review_played_here, private.review_verified_via and
--   private.review_daily (a review's "played here").
-- scripts/sql-tests/game_remove.check.mjs proves each of those against a
-- hidden game. Left counting it, on purpose, because they count rows that
-- were posted and a called-off game counts there today: owner_dashboard's
-- "hosted" (games posted at a turf in a period), the admin's people counts
-- (admin_people, admin_user_details, admin_owner_claim_signals,
-- admin_typed_venues) and private.account_is_empty (an account that
-- posted a game is not empty).
--
-- The rules (public.game_remove, server key, the verified caller's
-- account, as every game function):
--   * Only the game's host. Anyone else gets not_host, or gone when the
--     game is already hidden (so a hidden game tells them nothing).
--   * Not started, and open or full: it is first called off by
--     public.game_cancel itself (called, not copied: the players in it and
--     everyone with a request waiting get its "Game cancelled" notice and
--     email, and every reminder stops, exactly as for a game called off
--     today). Then the tagged players still to answer, whom game_cancel
--     does not tell, get the same notice in the app (no email: the notice
--     carries no game id, which is what an email is queued from, and the
--     page it would open is gone). Then it is hidden.
--   * Already called off: hidden. Nobody is told again.
--   * Started, over or closed (state "played"): hidden only when nobody
--     but the host is a player of it (no public.game_participants row for
--     another account). Otherwise it answers others with how many: their
--     Passports, medals and played-with count that game, and hiding it
--     would take it from them. A solo game is hidden and its status
--     becomes cancelled too, which is what takes it out of its host's own
--     played games.
--   * Tags nobody answered end (expired), and the count is put right.
--   * Hiding a hidden game answers ok and changes nothing.
--   * One game of a repeat is that one game. The repeat goes on; its own
--     stop (game_series_stop) is unchanged.
-- The page cache: the row changes, so the cache trigger on public.games
-- (games_mark_cache_dirty) marks the games key and the turf's key, as it
-- does for a cancel.
--
-- New functions:
--   private.game_remove_plan(game): {state: upcoming | off | played,
--     players, requests, tags}: the state as above; players: other
--     accounts in the game; requests: other accounts with a request
--     waiting who are not in it; tags: tagged accounts still to answer who
--     are neither. Each person is in one number only, and for an upcoming
--     game the three add up to exactly who is told.
--   public.game_remove_check(p_key, p_user_id, p_game_id): what the app's
--     confirm step says before anything happens: {r: ok, can, state,
--     players, requests, tags, repeat} (can: false for a played game with
--     other players; repeat: it is one game of a repeat), or r:
--     unavailable, bad, gone (no such game, or hidden already), not_host.
--     It changes nothing.
--   public.game_remove(p_key, p_user_id, p_game_id): {r: ok, removed:
--     true, state, told} (told: how many people were sent the notice),
--     {r: ok, removed: false} for a game hidden already, or r:
--     unavailable, bad, gone, not_host, others (with players), or whatever
--     game_cancel answered if it refused.
-- EXECUTE on the two public functions goes to anon only (the server key is
-- the gate, as for the server-key functions of the files just before this
-- one): each is first revoked from public, anon and authenticated, since
-- new functions in public start with EXECUTE for the API roles on
-- Supabase.
--
-- Replaced: none. Called and left as they are, each md5(prosrc) that of
-- its latest body in the repo (game_cancel's is also what
-- 20261118_game_updates.sql read on production on 17 Nov 2026; production
-- was not read again for this file):
--   private.account_key_ok   ca605fa89a97497134b690e753dc5c0e  20261021_accounts_usernames.sql
--   public.game_cancel       549331bb333fd8223527b687c96d8a17  20261030_games_lockdown.sql
--   private.game_start_at    870fe04f498b656d8c9435099fd8bfb9  20261101_played_with.sql
--   private.game_recount     da217ad54c4ceec24efc86b881f77d1b  20261117_game_confirmed.sql
--
-- Additive: two columns and one check on public.games, one policy's
-- condition narrowed, three new functions. No table, no trigger, no job,
-- no grant on a table. Nothing new is kept about anybody: the two columns
-- say when a game was taken off and what state it was in, on the game's
-- own row. Written without the destructive SQL keywords, and no string in
-- this file has a backslash. Safe to run again.
--
-- Before this file: the app shows no option (it looks for removed_at on
-- the rows it reads), the two routes answer plainly (reason remove_off),
-- and everything else is as it was.
--
-- Putting a game back by hand (the players who were told it is off are
-- not told again; a game that was open is open again):
--   update public.games
--      set status = removed_status, removed_at = null, removed_status = null, updated_at = now()
--    where id = '<the game>';
--
-- Check: PGLITE=<pglite dist/index.js> node scripts/sql-tests/game_remove.check.mjs supabase/migrations

-- Built on the games lockdown, played-with and the confirmed people: without them it refuses to run (and changes nothing).
-- The read policy is looked at here too, before anything is changed: the one this file narrows must be there, either
-- as the plain true it is today or already narrowed by an earlier run, and no other policy may let a hidden game be read.
do $$
declare
  v_was text;
  v_other text;
begin
  if to_regprocedure('private.account_key_ok(text)') is null
     or to_regprocedure('public.game_cancel(text,uuid,uuid)') is null
     or to_regprocedure('private.game_start_at(date,time)') is null
     or to_regprocedure('private.game_recount(uuid)') is null
     or to_regclass('private.game_tags') is null
     or to_regclass('public.game_participants') is null
     or to_regclass('public.game_requests') is null
     or to_regclass('public.notifications') is null then
    raise exception 'game remove: apply 20261030_games_lockdown.sql, 20261101_played_with.sql and 20261117_game_confirmed.sql first';
  end if;
  select p.qual into v_was
    from pg_catalog.pg_policies p
   where p.schemaname = 'public' and p.tablename = 'games' and p.policyname = 'Anyone can read games'
     and p.cmd = 'SELECT' and p.permissive = 'PERMISSIVE';
  if not found then
    raise exception 'game remove: public.games has no read policy "Anyone can read games"; nothing was changed';
  end if;
  if v_was is distinct from 'true' and v_was is distinct from '(removed_at IS NULL)' then
    raise exception 'game remove: the policy "Anyone can read games" is not the plain true it was (%); nothing was changed', v_was;
  end if;
  select p.policyname into v_other
    from pg_catalog.pg_policies p
   where p.schemaname = 'public' and p.tablename = 'games' and p.policyname <> 'Anyone can read games'
     and p.cmd in ('SELECT', 'ALL') and p.permissive = 'PERMISSIVE'
     and coalesce(p.qual, 'true') <> 'false'
   order by p.policyname
   limit 1;
  if found then
    raise exception 'game remove: the policy "%" on public.games would still show a hidden game; nothing was changed', v_other;
  end if;
end;
$$;

-- ── 1. The columns ─────────────────────────────────────────

alter table public.games add column if not exists removed_at timestamptz;
alter table public.games add column if not exists removed_status text;

do $$
begin
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.games'::regclass and c.conname = 'games_removed_fields') then
    alter table public.games add constraint games_removed_fields
      check ((removed_at is null) = (removed_status is null) and (removed_at is null or status = 'cancelled'));
  end if;
end;
$$;

comment on column public.games.removed_at is
  'When the host took this game off TapTurf (public.game_remove). Null: the game is on TapTurf. A row with a time here is hidden from anon and authenticated by the read policy, and is always status cancelled.';
comment on column public.games.removed_status is
  'The status the game had just before its host took it off TapTurf (open, full, completed, cancelled). Null with removed_at.';

-- ── 2. The read policy: a hidden game is not read ──────────

-- Made only from the policy as it is today (the block at the top has
-- already stopped the file for anything else). Run again, it finds its
-- own condition and does nothing.
do $$
begin
  if exists (select 1 from pg_catalog.pg_policies p
              where p.schemaname = 'public' and p.tablename = 'games' and p.policyname = 'Anyone can read games'
                and p.cmd = 'SELECT' and p.qual = 'true') then
    alter policy "Anyone can read games" on public.games using (removed_at is null);
  end if;
end;
$$;

-- ── 3. What taking a game off would do ─────────────────────

-- The game's state and who would be told. Each person is counted once:
-- a player, else a waiting request, else a waiting tag.
create or replace function private.game_remove_plan(p_game public.games)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'state', case
               when p_game.status = 'cancelled' then 'off'
               when coalesce(p_game.status, 'open') in ('open', 'full')
                    and private.game_start_at(p_game.date, p_game.start_time) > now() then 'upcoming'
               else 'played'
             end,
    'players', (select count(distinct p.user_id)
                  from public.game_participants p
                 where p.game_id = p_game.id and p.user_id is not null and p.user_id is distinct from p_game.creator_id)::integer,
    'requests', (select count(distinct r.user_id)
                   from public.game_requests r
                  where r.game_id = p_game.id and r.status = 'pending'
                    and r.user_id is not null and r.user_id is distinct from p_game.creator_id
                    and not exists (select 1 from public.game_participants p where p.game_id = r.game_id and p.user_id = r.user_id))::integer,
    'tags', (select count(distinct t.user_id)
               from private.game_tags t
               join public.users u on u.id = t.user_id
              where t.game_id = p_game.id and t.status = 'pending'
                and t.user_id is distinct from p_game.creator_id
                and not exists (select 1 from public.game_participants p where p.game_id = t.game_id and p.user_id = t.user_id)
                and not exists (select 1 from public.game_requests r
                                 where r.game_id = t.game_id and r.user_id = t.user_id and r.status = 'pending'))::integer);
$$;
revoke all on function private.game_remove_plan(public.games) from public, anon, authenticated;

-- What the confirm step says, for the game's host. Changes nothing.
create or replace function public.game_remove_check(p_key text, p_user_id uuid, p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_plan jsonb;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_game_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_game from public.games g where g.id = p_game_id;
  if not found or v_game.removed_at is not null then
    return jsonb_build_object('r', 'gone');
  end if;
  if v_game.creator_id is distinct from p_user_id then
    return jsonb_build_object('r', 'not_host');
  end if;
  v_plan := private.game_remove_plan(v_game);
  return jsonb_build_object('r', 'ok',
                            'can', not (v_plan ->> 'state' = 'played' and (v_plan ->> 'players')::integer > 0),
                            'repeat', v_game.series_id is not null) || v_plan;
end;
$$;
revoke all on function public.game_remove_check(text, uuid, uuid) from public, anon, authenticated;
-- The games routes' server calls it with the app's anon key and the server key (p_key); the key is the gate.
grant execute on function public.game_remove_check(text, uuid, uuid) to anon;

-- ── 4. Taking a game off ───────────────────────────────────

create or replace function public.game_remove(p_key text, p_user_id uuid, p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_plan jsonb;
  v_state text;
  v_off jsonb;
  v_host text;
  v_told integer := 0;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_game_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  -- The game row first, as every change to it takes it: one at a time.
  select * into v_game from public.games g where g.id = p_game_id for update;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if v_game.creator_id is distinct from p_user_id then
    return jsonb_build_object('r', case when v_game.removed_at is not null then 'gone' else 'not_host' end);
  end if;
  if v_game.removed_at is not null then
    return jsonb_build_object('r', 'ok', 'removed', false);
  end if;
  v_plan := private.game_remove_plan(v_game);
  v_state := v_plan ->> 'state';
  -- Played with other people: it counts on their Passports, so it stays.
  if v_state = 'played' and (v_plan ->> 'players')::integer > 0 then
    return jsonb_build_object('r', 'others', 'players', (v_plan ->> 'players')::integer);
  end if;
  if v_state = 'upcoming' then
    -- Called off as any game is: its players and waiting requests are told, emails and reminders follow from that.
    v_off := public.game_cancel(p_key, p_user_id, p_game_id);
    if v_off ->> 'r' is distinct from 'ok' then
      return v_off;
    end if;
    -- The tagged players still to answer, whom game_cancel does not tell: the same words, in the app only.
    -- No game id on the notice: the page is gone, and an email is queued only from a notice that has one.
    v_host := nullif(split_part(btrim(coalesce(v_game.host_name, '')), ' ', 1), '');
    insert into public.notifications (user_id, type, title, message, metadata, is_read)
    select t.user_id, 'game_cancelled', 'Game cancelled',
           coalesce(v_host, 'Your host') || ' cancelled ' || coalesce(nullif(btrim(v_game.sport), ''), 'the game')
             || ' on ' || to_char(v_game.date, 'Dy FMDD Mon'),
           jsonb_build_object('removed', true), false
      from private.game_tags t
      join public.users u on u.id = t.user_id
     where t.game_id = p_game_id and t.status = 'pending'
       and t.user_id is distinct from v_game.creator_id
       and not exists (select 1 from public.game_participants p where p.game_id = t.game_id and p.user_id = t.user_id)
       and not exists (select 1 from public.game_requests r
                        where r.game_id = t.game_id and r.user_id = t.user_id and r.status = 'pending');
    v_told := (v_plan ->> 'players')::integer + (v_plan ->> 'requests')::integer + (v_plan ->> 'tags')::integer;
  end if;
  -- Tags nobody answered end with the game, and its count follows.
  update private.game_tags t set status = 'expired', answered_at = now()
   where t.game_id = p_game_id and t.status = 'pending';
  perform private.game_recount(p_game_id);
  update public.games g
     set removed_at = now(), removed_status = coalesce(v_game.status, 'open'), status = 'cancelled', updated_at = now()
   where g.id = p_game_id;
  return jsonb_build_object('r', 'ok', 'removed', true, 'state', v_state, 'told', v_told);
end;
$$;
revoke all on function public.game_remove(text, uuid, uuid) from public, anon, authenticated;
-- The games routes' server calls it with the app's anon key and the server key (p_key); the key is the gate.
grant execute on function public.game_remove(text, uuid, uuid) to anon;
