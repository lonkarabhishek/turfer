set local lock_timeout = '5s';

-- Tagged players show at once, and can say afterwards that they played
-- (18 Nov 2026). The site owner, a day after 20261117_game_confirmed.sql:
-- "once host adds, show them in the confirmed list. Only when the user
-- wants to not confirm they can remove themselves", then "Let them retro
-- fill in the passport. Say that you were tagged in these games, can you
-- confirm if you played here? Once confirmed add them."
--
-- What changes for a tag made from this file on (private.game_tags.shown):
--   * The moment the host tags a player, the game's page lists them by
--     name and photo, with a link to their public profile, marked "added
--     by <host>" (public.game_tags_shown, read by the page's server render
--     and kept with the page: no read per page view). Only players with
--     "Let others find and tag me" on can be tagged (as before), and the
--     read asks that setting again every time: a player who turns it off
--     later is counted but not named ("+1 more"). A trigger on
--     public.usernames marks the games pages stale when a tagged player
--     changes that setting (private.mark_dirty, the cache queue's own
--     call), so the name goes within about a minute.
--   * The notification says so: "Asha added you to Football, Sat 15 Nov,
--     7 PM at Kings Turf. You're on the list." (type game_tagged, as
--     before; its metadata carries shown: true, by which the app offers
--     "I'm in" and "Remove me" instead of "Yes, I'm in" and "Not me").
--   * "I'm in" and "Remove me" are public.game_tag_answer as it is (yes and
--     no): yes makes them a player like any other; no frees the spot at
--     once and that host cannot tag them on that game again. Before the
--     game starts only, as before.
--   * At kickoff an unanswered tag is no longer ended: it stays on that
--     game's lineup as "added by <host>" and stays counted. It is still
--     not a player: no game_participants row, so nothing of it reaches
--     Passport, played-with, medals, reviews or emails. A game that is
--     called off ends its tags, as before.
-- A tag made before this file (shown false: 7 on production on 17 Nov, all
-- on one game that day) was made with the words "your name shows in the
-- lineup only if you say yes". It keeps that promise: never named to
-- anyone but the host, and ended at kickoff, as 20261117 did it.
--
-- Afterwards (the Me tab's Passport): public.game_tags_played lists, for
-- one player, the games that are over (private.game_over_at, the rule
-- Passport and played-with use), not called off, played in the last 90
-- days (private.game_tag_ask_days), where a host tagged them and they
-- never answered (the tag is pending, or one that ended at kickoff) and
-- they are not a player of it. public.game_tag_played takes the answer:
--   yes  they become a player of that game exactly as "I'm in" would have
--        made them (a game_participants row, the tag marked yes), so
--        everything that counts a played game counts it from then on, on
--        the game's own date (lib/profile/history.ts and
--        private.played_game_ids read the game's date and end, never
--        joined_at). joined_at is the moment they confirmed, which is after
--        the start: private.whatsapp_mates (20261101_played_with.sql)
--        therefore unlocks no WhatsApp number through that game, as for
--        anyone a host accepts once a game has started.
--   no   the tag ends (status no) and they are no longer listed.
-- The host is not told either way. public.game_tag_answer is left as it
-- is: before kickoff nothing is loosened.
-- One in-app notification a day at most asks a player to look
-- (game_tag_played_ask: "Were you at Football on Sat 14 Nov? Confirm it
-- for your Passport."), from the job that is there already
-- (game-tags-expire, every 10 minutes; no new job): only for a game that
-- ended in the last 7 days, once per tag (asked_at), and a player with
-- several is told about the newest and not again for the others. No
-- email (private.email_kind_of knows no such type) and no SMS. Its
-- metadata names no game, so web push opens the Me tab's Alerts.
--
-- Functions replaced, each copied from 20261117_game_confirmed.sql
-- (md5(pg_proc.prosrc) on production, read 17 Nov 2026, equals the body in
-- that file):
--   private.game_tags_add(uuid, uuid, text[])   783ef15db30813307677e3298ff68f60
--     + the tag is shown; the notification's words and metadata.
--   private.game_tags_expire()                  3dc5d52882b02f0776a96b6e95d779df
--     + ends a tag at kickoff only when it is not shown; a called-off
--     game's tags end as before; then private.game_tags_ask().
--   public.game_tags_for(text, uuid, uuid)      62447aa3096426fb89f279d145d6c707
--     + shown on each of the host's tags and beside the player's own.
-- Called and left as they are, production's md5 equal to the repo's:
--   public.game_tag_answer        9c17e201ad73c901133ed7f059363ef1  20261117_game_confirmed.sql
--   private.game_recount          da217ad54c4ceec24efc86b881f77d1b  20261117_game_confirmed.sql
--   private.game_tags_pending     13855de1470bf4939e44cbeb7a78f929  20261117_game_confirmed.sql
--   private.game_in               f4d6131b18e05fc0086cfc5763e0dbf7  20261117_game_confirmed.sql
--   private.game_tag_max          8213c84da99ee70b785946aef7eb4ae4  20261117_game_confirmed.sql
--   private.game_tag_day_max      c4f2b1ed38362a8f5357586412928e51  20261117_game_confirmed.sql
--   private.game_tag_tell_max     ac79f45d9f23ad49c79bc6771e476da0  20261117_game_confirmed.sql
--   private.account_key_ok        ca605fa89a97497134b690e753dc5c0e  20261021_accounts_usernames.sql
--   private.game_notify           b105f7aee319ed9725f42b85c5d4735c  20261030_games_lockdown.sql
--   private.game_start_at         870fe04f498b656d8c9435099fd8bfb9  20261101_played_with.sql
--   private.game_over_at          ea17283fa5f62bebd1e6921b269f452c  20261101_played_with.sql
--   private.game_clock_text       9ea2bb3fc277795aa74f5237b2d93af4  20261110_email.sql
--   private.game_sport_text       28192bf7b394432826d0a19a3a6c4d08  20261110_email.sql
--   private.email_venue_name      8ba7980f0d509060ce6ed6f89c789a94  20261110_email.sql
--   private.mark_dirty            37bd49deeb876dea1d0ba207a8969ce0  20261020_cache_queue.sql
-- The counts are untouched: a waiting tag holds a spot (private.game_in),
-- before and after kickoff, and games.confirmed_tagged is how many wait.
-- The limits stay: 20 waiting tags a game, 50 tag notifications a host a
-- day, one player told about one game 3 times at most.
--
-- New public functions (server key, private.account_key_ok; EXECUTE to
-- anon and authenticated as the other game functions):
--   game_tags_shown(p_key, p_game_id): {r: ok, tags: [{id, uid, name,
--     photo, u}]}, the waiting, shown tags of a game that is not called
--     off, whose player still has "Let others find and tag me" on.
--   game_tags_played(p_key, p_user_id): {r: ok, games: [{game_id, sport,
--     date, start_time, end_time, venue, host}]}, newest first, 50 at most.
--   game_tag_played(p_key, p_user_id, p_game_id, p_yes): {r: ok, status:
--     yes | no, current_players} or r: unavailable, bad, gone (no such tag
--     to answer, or a player already), closed (not over yet, called off,
--     or more than 90 days ago).
--
-- Additive: two columns and one index on private.game_tags, one trigger on
-- public.usernames (after an update of taggable only, and it only marks
-- the cache queue; a failure in it never fails the update), new functions;
-- three functions replaced with the same signatures, settings and grants.
-- No grant or policy on a table changes. Written without the destructive
-- SQL keywords: a removal is a status, as before. No string in this file
-- has a backslash, so no client can mangle one. Safe to run again.
--
-- Before this file the app is as 20261117 left it: nobody tagged is named
-- to the public, the notification asks "Yes, I'm in" or "Not me", the
-- Passport has no card.
--
-- Check: PGLITE=<pglite dist/index.js> node scripts/sql-tests/game_tags_shown.check.mjs supabase/migrations

-- Built on the confirmed people, played-with and emails: without them it refuses to run (and changes nothing).
do $$
begin
  if to_regclass('private.game_tags') is null
     or to_regprocedure('private.game_recount(uuid)') is null
     or to_regprocedure('private.game_tags_pending(uuid)') is null
     or to_regprocedure('public.game_tag_answer(text,uuid,uuid,boolean)') is null
     or to_regprocedure('private.game_over_at(date,time,time)') is null
     or to_regprocedure('private.game_start_at(date,time)') is null
     or to_regprocedure('private.email_venue_name(public.games)') is null
     or to_regprocedure('private.game_notify(uuid,text,text,text,jsonb)') is null then
    raise exception 'game tags shown: apply 20261101_played_with.sql, 20261110_email.sql and 20261117_game_confirmed.sql first';
  end if;
end;
$$;

-- ── 1. The columns ─────────────────────────────────────────

-- shown: the tag was made with the words "you're on the list" (this file's game_tags_add), so the game's page may
-- name its player. False for every tag made before this file.
alter table private.game_tags add column if not exists shown boolean not null default false;
-- asked_at: when the player was pointed to the Passport's card for this tag (once).
alter table private.game_tags add column if not exists asked_at timestamptz;
create index if not exists game_tags_user_idx on private.game_tags (user_id);

-- How long after a game a tagged player can still say whether they played.
create or replace function private.game_tag_ask_days()
returns integer language sql immutable set search_path = '' as $$ select 90 $$;
revoke all on function private.game_tag_ask_days() from public, anon, authenticated;

-- ── 2. Tagging: shown at once ──────────────────────────────

-- As 20261117_game_confirmed.sql, but the tag is shown and the player is told so.
create or replace function private.game_tags_add(p_game_id uuid, p_host_id uuid, p_usernames text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_user uuid;
  v_tag private.game_tags;
  v_made integer := 0;
  v_message text;
begin
  if p_game_id is null or p_host_id is null or coalesce(cardinality(p_usernames), 0) = 0 then
    return 0;
  end if;
  select * into v_game from public.games g where g.id = p_game_id;
  if not found or v_game.creator_id is distinct from p_host_id
     or coalesce(v_game.status, 'open') not in ('open', 'full')
     or private.game_start_at(v_game.date, v_game.start_time) <= now() then
    return 0;
  end if;
  -- One host's tags one after the other: the daily limit counts every one before this.
  perform pg_advisory_xact_lock(hashtextextended('game_tag_by:' || p_host_id::text, 0));
  v_message := coalesce(nullif(split_part(btrim(coalesce(v_game.host_name, '')), ' ', 1), ''), 'Your host')
               || ' added you to ' || coalesce(private.game_sport_text(v_game.sport), 'a game') || ', '
               || to_char(v_game.date, 'Dy FMDD Mon') || ', ' || private.game_clock_text(v_game.start_time)
               || ' at ' || private.email_venue_name(v_game) || '. You''re on the list.';
  for v_user in
    select n.user_id
      from unnest(p_usernames) with ordinality x(name, i)
      join public.usernames n on n.username = lower(x.name) and n.taggable
      join public.users u on u.id = n.user_id
     group by n.user_id
     order by min(x.i)
  loop
    continue when v_user = p_host_id;
    continue when exists (select 1 from public.game_participants p where p.game_id = p_game_id and p.user_id = v_user);
    exit when private.game_tags_pending(p_game_id) >= private.game_tag_max();
    exit when (select coalesce(sum(t.notified), 0) from private.game_tags t
                where t.host_id = p_host_id and t.notified_at > now() - interval '1 day') >= private.game_tag_day_max();
    select * into v_tag from private.game_tags t where t.game_id = p_game_id and t.user_id = v_user for update;
    if found then
      continue when v_tag.status in ('pending', 'yes', 'no') or v_tag.notified >= private.game_tag_tell_max();
      update private.game_tags t
         set status = 'pending', host_id = p_host_id, notified = t.notified + 1, notified_at = now(), answered_at = null,
             shown = true, asked_at = null
       where t.id = v_tag.id
      returning * into v_tag;
    else
      insert into private.game_tags (game_id, user_id, host_id, shown) values (p_game_id, v_user, p_host_id, true)
      returning * into v_tag;
    end if;
    perform private.game_notify(v_user, 'game_tagged', 'You''re on the list', v_message,
                                jsonb_build_object('gameId', p_game_id, 'tagId', v_tag.id, 'shown', true));
    v_made := v_made + 1;
  end loop;
  return v_made;
end;
$$;
revoke all on function private.game_tags_add(uuid, uuid, text[]) from public, anon, authenticated;

-- ── 3. After a game: did you play? ─────────────────────────

-- One in-app notification, a day at most per player, pointing to the Passport's card: for a tag never answered
-- (waiting, or ended at kickoff) on a game that is over, not called off and ended in the last 7 days, whose player
-- is not in the game. A player with several is told about the newest; every such tag of theirs is then marked
-- asked, so none of them asks again. Nothing to do: one small read. Answers how many were told.
create or replace function private.game_tags_ask()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_n integer := 0;
begin
  for v_row in
    select distinct on (t.user_id) t.user_id, g.sport, g.date
      from private.game_tags t
      join public.games g on g.id = t.game_id
      join public.users u on u.id = t.user_id
     where t.asked_at is null and t.status in ('pending', 'expired')
       and coalesce(g.status, 'open') <> 'cancelled'
       and private.game_over_at(g.date, g.start_time, g.end_time) <= now()
       and private.game_over_at(g.date, g.start_time, g.end_time) > now() - interval '7 days'
       and not exists (select 1 from public.game_participants p where p.game_id = t.game_id and p.user_id = t.user_id)
       and not exists (select 1 from private.game_tags o where o.user_id = t.user_id and o.asked_at > now() - interval '1 day')
     order by t.user_id, g.date desc, g.start_time desc, t.id
  loop
    update private.game_tags t
       set asked_at = now()
      from public.games g
     where g.id = t.game_id and t.user_id = v_row.user_id and t.asked_at is null and t.status in ('pending', 'expired')
       and coalesce(g.status, 'open') <> 'cancelled'
       and private.game_over_at(g.date, g.start_time, g.end_time) <= now();
    perform private.game_notify(v_row.user_id, 'game_tag_played_ask', 'Did you play?',
                                'Were you at ' || coalesce(private.game_sport_text(v_row.sport), 'the game') || ' on '
                                  || to_char(v_row.date, 'Dy FMDD Mon') || '? Confirm it for your Passport.',
                                jsonb_build_object('tab', 'passport'));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function private.game_tags_ask() from public, anon, authenticated;

-- Every 10 minutes (the job 20261117_game_confirmed.sql made). A called-off game's waiting tags end, as before. A
-- tag made before this file (not shown) still ends when its game starts, as its player was told. A shown tag stays
-- through kickoff: listed as added by the host, counted, never a player. Then the asks above. Answers how many
-- games had tags ended.
create or replace function private.game_tags_expire()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game uuid;
  v_off boolean;
  v_n integer := 0;
begin
  for v_game, v_off in
    select t.game_id, bool_or(coalesce(g.status, 'open') = 'cancelled')
      from private.game_tags t
      join public.games g on g.id = t.game_id
     where t.status = 'pending'
       and (coalesce(g.status, 'open') = 'cancelled'
            or (not t.shown and (private.game_start_at(g.date, g.start_time) <= now() or coalesce(g.status, 'open') not in ('open', 'full'))))
     group by t.game_id
  loop
    update private.game_tags t set status = 'expired', answered_at = now()
     where t.game_id = v_game and t.status = 'pending' and (v_off or not t.shown);
    perform private.game_recount(v_game);
    v_n := v_n + 1;
  end loop;
  perform private.game_tags_ask();
  return v_n;
end;
$$;
revoke all on function private.game_tags_expire() from public, anon, authenticated;

-- ── 4. Reads ───────────────────────────────────────────────

-- As 20261117_game_confirmed.sql, with shown: on each of the host's waiting tags, whether the page names that
-- player (the tag is shown and they still have tagging on); for anyone else, beside mine, whether their own
-- waiting tag is a shown one (the page then offers "I'm in" and "Remove me").
create or replace function public.game_tags_for(p_key text, p_user_id uuid, p_game_id uuid)
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
    return jsonb_build_object('r', 'ok', 'host', true, 'tags', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', coalesce(nullif(btrim(u.name::text), ''), 'Player'),
                                          'photo', u.profile_image_url,
                                          'u', (select n.username from public.usernames n where n.user_id = t.user_id and n.taggable),
                                          'shown', t.shown and exists (select 1 from public.usernames n where n.user_id = t.user_id and n.taggable))
                       order by t.created_at, u.name, t.id)
        from private.game_tags t
        join public.users u on u.id = t.user_id
       where t.game_id = p_game_id and t.status = 'pending'
         and not exists (select 1 from public.game_participants p where p.game_id = t.game_id and p.user_id = t.user_id)), '[]'::jsonb));
  end if;
  return coalesce((
    select jsonb_build_object('r', 'ok', 'host', false, 'mine', t.status, 'shown', t.shown)
      from private.game_tags t
     where t.game_id = p_game_id and t.user_id = p_user_id and t.status = 'pending'
       and not exists (select 1 from public.game_participants p where p.game_id = t.game_id and p.user_id = t.user_id)),
    jsonb_build_object('r', 'ok', 'host', false, 'mine', null));
end;
$$;
revoke all on function public.game_tags_for(text, uuid, uuid) from public;
grant execute on function public.game_tags_for(text, uuid, uuid) to anon, authenticated;

-- The tagged players a game's page names: waiting, shown, an account that is there, tagging still on, not a
-- player of the game by now; none for a game that is called off. The first tagged first. For the server's render
-- of the page (kept with the page, purged by the games key), never a browser.
create or replace function public.game_tags_shown(p_key text, p_game_id uuid)
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
  if p_game_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  return jsonb_build_object('r', 'ok', 'tags', coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'uid', x.user_id, 'name', x.name, 'photo', x.photo, 'u', x.username)
                     order by x.created_at, x.name, x.id)
      from (select t.id, t.user_id, t.created_at, coalesce(nullif(btrim(u.name::text), ''), 'Player') as name,
                   nullif(u.profile_image_url, '') as photo, n.username
              from private.game_tags t
              join public.games g on g.id = t.game_id
              join public.users u on u.id = t.user_id
              join public.usernames n on n.user_id = t.user_id and n.taggable
             where t.game_id = p_game_id and t.status = 'pending' and t.shown
               and coalesce(g.status, 'open') <> 'cancelled'
               and not exists (select 1 from public.game_participants p where p.game_id = t.game_id and p.user_id = t.user_id)
             order by t.created_at, t.id
             limit 20) x), '[]'::jsonb));
end;
$$;
revoke all on function public.game_tags_shown(text, uuid) from public;
grant execute on function public.game_tags_shown(text, uuid) to anon, authenticated;

-- The games a player was tagged in and never answered about, that are over (as Passport reads it), not called
-- off and from the last 90 days, where they are not a player: newest first, 50 at most.
create or replace function public.game_tags_played(p_key text, p_user_id uuid)
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
  return jsonb_build_object('r', 'ok', 'games', coalesce((
    select jsonb_agg(jsonb_build_object('game_id', x.id, 'sport', x.sport, 'date', x.date,
                                        'start_time', to_char(x.start_time, 'HH24:MI'), 'end_time', to_char(x.end_time, 'HH24:MI'),
                                        'venue', x.venue, 'host', x.host)
                     order by x.date desc, x.start_time desc, x.id)
      from (select g.id, g.sport, g.date, g.start_time, g.end_time, private.email_venue_name(g) as venue,
                   nullif(split_part(btrim(coalesce(g.host_name, '')), ' ', 1), '') as host
              from private.game_tags t
              join public.games g on g.id = t.game_id
             where t.user_id = p_user_id and t.status in ('pending', 'expired')
               and coalesce(g.status, 'open') <> 'cancelled'
               and private.game_over_at(g.date, g.start_time, g.end_time) <= now()
               and g.date >= (now() at time zone 'Asia/Kolkata')::date - private.game_tag_ask_days()
               and not exists (select 1 from public.game_participants p where p.game_id = t.game_id and p.user_id = t.user_id)
             order by g.date desc, g.start_time desc, g.id
             limit 50) x), '[]'::jsonb));
end;
$$;
revoke all on function public.game_tags_played(text, uuid) from public;
grant execute on function public.game_tags_played(text, uuid) to anon, authenticated;

-- A tagged player's answer once the game is over: yes makes them a player of it (as "I'm in" would have), no ends
-- the tag. Only for a game game_tags_played lists. The count is recounted as ever (a waiting tag held its spot,
-- so a yes leaves it as it was; a tag that ended at kickoff adds its player back). The host is not told.
create or replace function public.game_tag_played(p_key text, p_user_id uuid, p_game_id uuid, p_yes boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_tag private.game_tags;
  v_in integer;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_game_id is null or p_yes is null then
    return jsonb_build_object('r', 'bad');
  end if;
  -- The game row first, as every change to its count takes it.
  select * into v_game from public.games g where g.id = p_game_id for update;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  select * into v_tag from private.game_tags t where t.game_id = p_game_id and t.user_id = p_user_id for update;
  if not found or v_tag.status not in ('pending', 'expired')
     or exists (select 1 from public.game_participants p where p.game_id = p_game_id and p.user_id = p_user_id) then
    return jsonb_build_object('r', 'gone');
  end if;
  if coalesce(v_game.status, 'open') = 'cancelled'
     or private.game_over_at(v_game.date, v_game.start_time, v_game.end_time) > now()
     or v_game.date < (now() at time zone 'Asia/Kolkata')::date - private.game_tag_ask_days() then
    return jsonb_build_object('r', 'closed');
  end if;
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  if p_yes then
    insert into public.game_participants (game_id, user_id) values (p_game_id, p_user_id)
    on conflict (game_id, user_id) do nothing;
    update public.game_requests r set status = 'accepted', responded_at = now()
     where r.game_id = p_game_id and r.user_id = p_user_id and r.status = 'pending';
  end if;
  update private.game_tags t set status = case when p_yes then 'yes' else 'no' end, answered_at = now() where t.id = v_tag.id;
  v_in := private.game_recount(p_game_id);
  return jsonb_build_object('r', 'ok', 'status', case when p_yes then 'yes' else 'no' end, 'current_players', v_in);
end;
$$;
revoke all on function public.game_tag_played(text, uuid, uuid, boolean) from public;
grant execute on function public.game_tag_played(text, uuid, uuid, boolean) to anon, authenticated;

-- ── 5. "Let others find and tag me", turned off or on ──────

-- A player with a shown, waiting tag changed that setting: the game pages are marked stale (the games key of the
-- cache queue), so the name goes, or comes back, within about a minute. Never fails the update it follows.
create or replace function private.game_tags_setting_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.game_tags t where t.user_id = new.user_id and t.status = 'pending' and t.shown) then
    perform private.mark_dirty(array['games'], false);
  end if;
  return null;
exception when others then
  raise warning 'game tags: could not mark the games pages stale: %', sqlerrm;
  return null;
end;
$$;
revoke all on function private.game_tags_setting_changed() from public, anon, authenticated;

create or replace trigger usernames_game_tags_setting
  after update of taggable on public.usernames
  for each row
  when (old.taggable is distinct from new.taggable)
  execute function private.game_tags_setting_changed();
