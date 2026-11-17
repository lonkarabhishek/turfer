set local lock_timeout = '5s';

-- Already confirmed (17 Nov 2026). The site owner: "In games give me an
-- option to prefill people who has confirmed. In both while creating the
-- game, plus in the edit option", then "Should be able to tag them". A
-- host usually has friends in already from a WhatsApp group, but a new
-- game showed every spot but the host's as open.
--
-- What: a game's host can say who is in already, when making the game and
-- in its edit sheet. Three kinds, each taking a spot at once (the host
-- vouches for them):
--   games.confirmed_names   text[], up to 20: what the host typed about a
--                           friend, a first name or nickname ("Rahul").
--                           1 to 20 characters once spaces are collapsed;
--                           letters of Latin, Arabic and India's scripts
--                           with their marks, spaces, a dot, a hyphen and
--                           an apostrophe; no digit of any script (so no
--                           phone number lands on a public page) and no
--                           link. Shown on the game's page only. Not an
--                           account: nothing about a name reaches Passport,
--                           played-with, medals, reviews, emails or
--                           notifications.
--   games.confirmed_extra   smallint, 0 to 30: people without a name
--                           ("+2 more").
--   private.game_tags       TapTurf players the host picked by their public
--                           username (public.usernames, taggable only: the
--                           people who left "Let others find and tag me"
--                           on), never the host, never someone in the game
--                           already. Each gets ONE in-app notification
--                           (type game_tagged: "Asha added you as confirmed
--                           for Football, Sat 15 Nov, 7 PM at Kings Turf.")
--                           and answers on the game's page or from the
--                           notification: Yes, I'm in (they become a
--                           game_participants row like any joined player)
--                           or Not me (the spot is free again, and this
--                           host cannot tag them on this game again). No
--                           email (private.email_kind_of knows no such
--                           type) and no SMS. Until they say yes, only the
--                           host reads who is tagged (game_tags_for); the
--                           public row holds a number alone:
--   games.confirmed_tagged  smallint, 0 to 20: tagged players who have not
--                           answered. The page says "+1 more" for each,
--                           with the people without a name.
--                           The host can untag (the spot is free again). A
--                           tag nobody answered ends when the game starts,
--                           or once it is off (the job game-tags-expire,
--                           every 10 minutes), and stops counting. The
--                           host and the tagged player are told nothing
--                           then. Limits: 20 waiting tags a game, 50 tag
--                           notifications a host a day, 3 for one player
--                           on one game. A tag whose account is gone is
--                           skipped by every read and count.
-- games.current_players is, from this file on, the players in
-- game_participants (the host among them) plus the names, the people
-- without one and the waiting tags: private.game_in, used wherever the
-- count was taken from game_participants alone. A game is full when that
-- reaches max_players, exactly as before: a join request is refused as
-- full, and so is the host's accept. With nobody confirmed every function
-- answers and writes what it did before.
--
-- Repeats: the names and the count are kept on private.game_series and
-- copied onto every game it puts up, at once and by the daily job. Tags
-- are for the first game only (a repeat would send the same people a
-- notification for every game it makes); each later game can be tagged
-- from its own edit sheet. An edit changes only that one game.
--
-- An edit (game_update) takes confirmed_names (the whole list),
-- confirmed_extra, confirmed_tags (usernames to add) and confirmed_untag
-- (ids of waiting tags, from game_tags_for). The players, the names, the
-- count and the tags must fit max_players: fewer max players than that is
-- too_few (with the number), more confirmed people than fit is bad with
-- field 'confirmed'. Joined players are never taken out by any of this.
--
-- Functions replaced, each copied from the newest file that defines it
-- (md5(pg_proc.prosrc) on production, read 17 Nov 2026, equals the body in
-- that file) and changed only for the count and the new keys:
--   public.game_create(text, uuid, jsonb)       20261103_game_other_venue.sql  0d171541ee3f6e0f3e00ef4d96b88cc1
--   public.game_series_create(text, uuid, jsonb, jsonb)
--                                               20261103_game_other_venue.sql  301b3fb7602a06eeaa32b36818edcc26
--     + the keys checked (private.game_confirmed_problem), the fit, the
--     names and the count stored, the tags made (the first game's).
--   private.game_series_fill(uuid, timestamptz, boolean)
--                                               20261103_game_other_venue.sql  0c55f721079a3c4833b29618df91b28d
--     + its games copy the names and the count, and start counted.
--   public.game_update(text, uuid, uuid, jsonb, jsonb)
--                                               20261110_email.sql             e3b0876c0d8c2a5e0f7082cbe1c54181
--     + the keys, the fit, the recount with them.
--   public.game_request_send(text, uuid, uuid, text)
--                                               20261030_games_lockdown.sql    c144dc895b036bfcb3821311c5a421c5
--   public.game_request_answer(text, uuid, uuid, boolean)
--                                               20261030_games_lockdown.sql    82b2b5b6d25023eced978503eddb2c75
--   private.email_job(private.email_outbox)     20261110_email.sql             de42a2d469d8d5044b24520afbbe3f1e
--     + the count is private.game_in (one line each; in the answer the
--     fullness check, and private.game_recount for the count it writes).
-- private.game_field_problem (d0fb172c6cb8f1dc0fa284171262d30c) is left as
-- it is: the new keys are taken out before it reads a body
-- (private.game_confirmed_strip) and checked on their own.
-- Called and left as they are, production's md5 equal to the repo's:
--   private.account_key_ok      ca605fa89a97497134b690e753dc5c0e  20261021_accounts_usernames.sql
--   private.game_notify         b105f7aee319ed9725f42b85c5d4735c  20261030_games_lockdown.sql
--   private.game_over           b7ffb3e6915e6bc9743db2027a7fb7ee  20261030_games_lockdown.sql
--   private.game_start_at       870fe04f498b656d8c9435099fd8bfb9  20261101_played_with.sql
--   private.game_venue_text     8cf8615fc5c81008d16598b9a3c3363a  20261103_game_other_venue.sql
--   private.game_venue_digits   fe2139a669ff6dd5e1728d2900329649  20261103_game_other_venue.sql
--   private.game_venue_problem  3cd2b11a746c1156c80896cfe57684de  20261103_game_other_venue.sql
--   private.game_series_no_turf f0758069b2a4b5e4bca85c2d0beb66d6  20261103_game_other_venue.sql
--   private.game_clock_text     9ea2bb3fc277795aa74f5237b2d93af4  20261110_email.sql
--   private.game_sport_text     28192bf7b394432826d0a19a3a6c4d08  20261110_email.sql
--   private.email_venue_name    8ba7980f0d509060ce6ed6f89c789a94  20261110_email.sql
--   private.email_kind_of       420acfb9547a4f449fa128b457176f41  20261110_email.sql
-- Not replaced, and what that means: game_cancel and the venue and time
-- notices tell the players and the requests, as before, never a tagged
-- player who has not answered (their tag ends with the game). Web push
-- (20261102_web_push.sql) sends for every notification with a gameId, so a
-- player who turned push on gets the tag there too.
--
-- New public functions (server key, private.account_key_ok; EXECUTE to
-- anon and authenticated as the other game functions):
--   game_tags_for(p_key, p_user_id, p_game_id): the host gets the waiting
--     tags {id, name, photo, u}; anyone else only whether they are tagged
--     and waiting (mine: 'pending' or null).
--   game_tag_answer(p_key, p_user_id, p_game_id, p_yes): the tagged
--     player's answer. {r: ok, status: yes | no, current_players} or r:
--     unavailable, bad, gone (no waiting tag), closed (the game started or
--     is off). The host gets one in-app notification (game_tag_yes or
--     game_tag_no).
--
-- Table (schema private, RLS on, no grant to anyone; no foreign key to
-- public.users or public.games, as the other private tables, so nothing
-- here holds up removing either): private.game_tags, one row per game and
-- player. On an account erasure, clear its rows (user_id or host_id) by
-- hand with its other rows.
--
-- Additive: three columns and one check on public.games, two columns and
-- one check on private.game_series, one table, new functions, one job; the
-- functions above replaced with the same signatures, settings and grants.
-- Every game on production (62 on 17 Nov 2026) gets no names, 0 and 0, and
-- its current_players is left as it is. No grant or policy on a public
-- table changes: anon and authenticated already read every games column
-- (20261030_games_lockdown_step2.sql), so the names and the two counts are
-- public, as the game is; the create flow tells the host so. Written
-- without the destructive SQL keywords. Safe to run again.
--
-- Before this file: the create flow and the edit sheet ask whether games
-- have confirmed_names and show the section only once they do; the routes
-- refuse the new keys plainly (reason confirmed_off) and every other
-- create and edit goes on exactly as before.
--
-- Check: PGLITE=<pglite dist/index.js> node scripts/sql-tests/game_confirmed.check.mjs supabase/migrations

-- Built on the games lockdown, repeats, typed venues, emails and usernames: without them it refuses to run (and changes nothing).
do $$
begin
  if to_regprocedure('private.game_field_problem(jsonb,text[])') is null
     or to_regprocedure('private.game_notify(uuid,text,text,text,jsonb)') is null
     or to_regprocedure('private.game_series_fill(uuid,timestamptz,boolean)') is null
     or to_regprocedure('private.game_venue_text(text)') is null
     or to_regprocedure('private.game_venue_digits(text)') is null
     or to_regprocedure('private.game_start_at(date,time)') is null
     or to_regprocedure('private.game_clock_text(time)') is null
     or to_regprocedure('private.email_venue_name(public.games)') is null
     or to_regprocedure('private.email_job(private.email_outbox)') is null
     or to_regclass('private.game_series') is null
     or to_regclass('public.usernames') is null then
    raise exception 'game confirmed: apply 20261021_accounts_usernames.sql, 20261030_games_lockdown.sql, 20261101_played_with.sql, 20261102_game_series.sql, 20261103_game_other_venue.sql and 20261110_email.sql first';
  end if;
end;
$$;

-- ── 1. The columns and the table ───────────────────────────

alter table public.games add column if not exists confirmed_names text[] not null default '{}';
alter table public.games add column if not exists confirmed_extra smallint not null default 0;
alter table public.games add column if not exists confirmed_tagged smallint not null default 0;

alter table private.game_series add column if not exists confirmed_names text[] not null default '{}';
alter table private.game_series add column if not exists confirmed_extra smallint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.games'::regclass and c.conname = 'games_confirmed_fields') then
    alter table public.games add constraint games_confirmed_fields
      check (coalesce(array_ndims(confirmed_names), 1) = 1 and cardinality(confirmed_names) <= 20
             and confirmed_extra between 0 and 30 and confirmed_tagged between 0 and 20);
  end if;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'private.game_series'::regclass and c.conname = 'game_series_confirmed_fields') then
    alter table private.game_series add constraint game_series_confirmed_fields
      check (coalesce(array_ndims(confirmed_names), 1) = 1 and cardinality(confirmed_names) <= 20 and confirmed_extra between 0 and 30);
  end if;
end;
$$;

-- A TapTurf player a host tagged as confirmed. status: pending (waiting
-- for their answer: counted, named to the host alone), yes (they are a
-- player now), no (they said "Not me"), untagged (the host took it back),
-- expired (nobody answered before the game started or was called off).
-- notified: how many times this player was told about this game (3 at most).
create table if not exists private.game_tags (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  user_id uuid not null,
  host_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'yes', 'no', 'untagged', 'expired')),
  notified smallint not null default 1,
  notified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  unique (game_id, user_id)
);
create index if not exists game_tags_host_idx on private.game_tags (host_id, notified_at);
create index if not exists game_tags_pending_idx on private.game_tags (game_id) where status = 'pending';
alter table private.game_tags enable row level security;
revoke all on private.game_tags from public, anon, authenticated;

-- ── 2. The limits and the checks (lib/games/confirmed.ts has the same) ──

create or replace function private.game_tag_max()
returns integer language sql immutable set search_path = '' as $$ select 20 $$;
create or replace function private.game_tag_day_max()
returns integer language sql immutable set search_path = '' as $$ select 50 $$;
create or replace function private.game_tag_tell_max()
returns integer language sql immutable set search_path = '' as $$ select 3 $$;
revoke all on function private.game_tag_max() from public, anon, authenticated;
revoke all on function private.game_tag_day_max() from public, anon, authenticated;
revoke all on function private.game_tag_tell_max() from public, anon, authenticated;

-- Fine as a confirmed friend's name: 1 to 20 characters once spaces are
-- collapsed; letters of Latin, Arabic and India's scripts with their marks,
-- the two joiners those scripts use, spaces, a dot, a hyphen and an
-- apostrophe (straight or curly), with a letter among them; no digit of
-- any script (private.game_venue_digits) and no link ("amit.in", "www.x";
-- "S.Kumar" is a name). lib/games/confirmed.ts nameProblem is the same rule.
create or replace function private.game_confirmed_name_ok(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select x is not null
     and char_length(x) between 1 and 20
     and private.game_venue_digits(x) !~ '[0-9]'
     and x !~* '(www\.|\.(com|net|org|io|app|gl|ly|me|info|xyz|online|site|page|link|biz|in)(?![a-z]))'
     and x ~ '^[A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u024f\u0600-\u06ff\u0900-\u0963\u0966-\u0d7f\u200c\u200d .''\u2019-]+$'
     and x ~ '[^ .''\u2019-]'
    from (select private.game_venue_text(p) as x) v;
$$;
revoke all on function private.game_confirmed_name_ok(text) from public, anon, authenticated;

-- A game body without the four keys below, for private.game_field_problem (which knows none of them).
create or replace function private.game_confirmed_strip(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p) = 'object' then p - array['confirmed_names', 'confirmed_extra', 'confirmed_tags', 'confirmed_untag'] else p end;
$$;
revoke all on function private.game_confirmed_strip(jsonb) from public, anon, authenticated;

-- The first of the four keys that is not well formed, or null: confirmed_names
-- a list of at most 20 names; confirmed_extra a whole number 0 to 30;
-- confirmed_tags a list of at most 20 usernames; confirmed_untag (an edit
-- only) a list of at most 20 tag ids. Run after game_field_problem.
create or replace function private.game_confirmed_problem(p jsonb, p_edit boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return null;
  end if;
  if p ? 'confirmed_names' then
    v := p -> 'confirmed_names';
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 20
       or exists (select 1 from jsonb_array_elements(v) e
                   where jsonb_typeof(e) <> 'string' or not coalesce(private.game_confirmed_name_ok(e #>> '{}'), false)) then
      return 'confirmed_names';
    end if;
  end if;
  if p ? 'confirmed_extra' then
    v := p -> 'confirmed_extra';
    if jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^\d{1,2}$' or (v #>> '{}')::integer > 30 then
      return 'confirmed_extra';
    end if;
  end if;
  if p ? 'confirmed_tags' then
    v := p -> 'confirmed_tags';
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > private.game_tag_max()
       or exists (select 1 from jsonb_array_elements(v) e
                   where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[a-z][a-z0-9_]{2,19}$') then
      return 'confirmed_tags';
    end if;
  end if;
  if p ? 'confirmed_untag' then
    v := p -> 'confirmed_untag';
    if not coalesce(p_edit, false) or jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > private.game_tag_max()
       or exists (select 1 from jsonb_array_elements(v) e
                   where jsonb_typeof(e) <> 'string'
                      or (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      return 'confirmed_untag';
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.game_confirmed_problem(jsonb, boolean) from public, anon, authenticated;

-- The names of a checked body as they are stored: spaces collapsed, in the host's order. None when the key is absent.
create or replace function private.game_confirmed_names(p jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce((select array_agg(private.game_venue_text(e.value #>> '{}') order by e.ordinality)
                     from jsonb_array_elements(case when jsonb_typeof(p -> 'confirmed_names') = 'array' then p -> 'confirmed_names' else '[]'::jsonb end)
                          with ordinality e), '{}'::text[]);
$$;
revoke all on function private.game_confirmed_names(jsonb) from public, anon, authenticated;

-- The people without a name of a checked body. 0 when the key is absent.
create or replace function private.game_confirmed_extra(p jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(case when jsonb_typeof(p -> 'confirmed_extra') = 'number' then (p ->> 'confirmed_extra')::integer end, 0);
$$;
revoke all on function private.game_confirmed_extra(jsonb) from public, anon, authenticated;

-- The usernames a checked body tags, each once, in the host's order.
create or replace function private.game_confirmed_tags(p jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce((select array_agg(x.u order by x.i)
                     from (select e.value #>> '{}' as u, min(e.ordinality) as i
                             from jsonb_array_elements(case when jsonb_typeof(p -> 'confirmed_tags') = 'array' then p -> 'confirmed_tags' else '[]'::jsonb end)
                                  with ordinality e
                            group by 1) x), '{}'::text[]);
$$;
revoke all on function private.game_confirmed_tags(jsonb) from public, anon, authenticated;

-- The tag ids a checked edit takes back.
create or replace function private.game_confirmed_untag(p jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce((select array_agg(distinct (e.value #>> '{}')::uuid)
                     from jsonb_array_elements(case when jsonb_typeof(p -> 'confirmed_untag') = 'array' then p -> 'confirmed_untag' else '[]'::jsonb end) e),
                  '{}'::uuid[]);
$$;
revoke all on function private.game_confirmed_untag(jsonb) from public, anon, authenticated;

-- How many spots a new game's body asks for besides the host's: its names, its people without one, its tags.
create or replace function private.game_confirmed_asked(p jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select cardinality(private.game_confirmed_names(p)) + private.game_confirmed_extra(p) + cardinality(private.game_confirmed_tags(p));
$$;
revoke all on function private.game_confirmed_asked(jsonb) from public, anon, authenticated;

-- ── 3. The count ───────────────────────────────────────────

-- A game's tagged players still waiting to answer. A tag whose account is gone is not one, and neither is a
-- tag of someone who is in the game by now (the host accepted their own request meanwhile): they count once,
-- as the player they are.
create or replace function private.game_tags_pending(p_game_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from private.game_tags t
    join public.users u on u.id = t.user_id
   where t.game_id = p_game_id and t.status = 'pending'
     and not exists (select 1 from public.game_participants p where p.game_id = t.game_id and p.user_id = t.user_id);
$$;
revoke all on function private.game_tags_pending(uuid) from public, anon, authenticated;

-- Everyone in a game: the players (the host among them), the names, the people without one and the waiting tags.
create or replace function private.game_in(p_game_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.game_participants p where p.game_id = p_game_id)::integer
       + coalesce((select cardinality(g.confirmed_names) + g.confirmed_extra from public.games g where g.id = p_game_id), 0)
       + private.game_tags_pending(p_game_id);
$$;
revoke all on function private.game_in(uuid) from public, anon, authenticated;

-- Writes the count where it changed (current_players, and the waiting tags as the public row says them). Answers the count.
create or replace function private.game_recount(p_game_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in integer := private.game_in(p_game_id);
  v_tagged integer := private.game_tags_pending(p_game_id);
begin
  update public.games g
     set current_players = v_in, confirmed_tagged = least(v_tagged, 20)
   where g.id = p_game_id
     and (g.current_players is distinct from v_in or g.confirmed_tagged is distinct from least(v_tagged, 20));
  return v_in;
end;
$$;
revoke all on function private.game_recount(uuid) from public, anon, authenticated;

-- The waiting tags an edit would leave: those there now, less the ones it untags, plus every username it adds
-- (each counted, though some may not become a tag: the fit is checked before anyone is told).
create or replace function private.game_tags_after(p_game_id uuid, p_changes jsonb)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*)
            from private.game_tags t
            join public.users u on u.id = t.user_id
           where t.game_id = p_game_id and t.status = 'pending'
             and not exists (select 1 from public.game_participants p where p.game_id = t.game_id and p.user_id = t.user_id)
             and not (t.id = any (private.game_confirmed_untag(p_changes))))::integer
       + cardinality(private.game_confirmed_tags(p_changes));
$$;
revoke all on function private.game_tags_after(uuid, jsonb) from public, anon, authenticated;

-- ── 4. Tags ────────────────────────────────────────────────

-- The host tags players by username on their own game, open and not started. Skipped, silently: a username
-- nobody has or whose owner turned tagging off, the host, a player in the game, someone waiting already, someone
-- who answered, someone told 3 times; and everyone past 20 waiting tags on the game or 50 notifications from
-- this host in a day. Each new tag is told once (game_tagged). Answers how many were made.
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
               || ' added you as confirmed for ' || coalesce(private.game_sport_text(v_game.sport), 'a game') || ', '
               || to_char(v_game.date, 'Dy FMDD Mon') || ', ' || private.game_clock_text(v_game.start_time)
               || ' at ' || private.email_venue_name(v_game) || '.';
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
         set status = 'pending', host_id = p_host_id, notified = t.notified + 1, notified_at = now(), answered_at = null
       where t.id = v_tag.id
      returning * into v_tag;
    else
      insert into private.game_tags (game_id, user_id, host_id) values (p_game_id, v_user, p_host_id)
      returning * into v_tag;
    end if;
    perform private.game_notify(v_user, 'game_tagged', 'Are you in?', v_message,
                                jsonb_build_object('gameId', p_game_id, 'tagId', v_tag.id));
    v_made := v_made + 1;
  end loop;
  return v_made;
end;
$$;
revoke all on function private.game_tags_add(uuid, uuid, text[]) from public, anon, authenticated;

-- The host takes waiting tags back. Answers how many.
create or replace function private.game_tags_untag(p_game_id uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update private.game_tags t
     set status = 'untagged', answered_at = now()
   where t.game_id = p_game_id and t.status = 'pending' and t.id = any (coalesce(p_ids, '{}'::uuid[]));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function private.game_tags_untag(uuid, uuid[]) from public, anon, authenticated;

-- Tags nobody answered, once their game has started or is off: they end, and stop counting. Every 10 minutes.
create or replace function private.game_tags_expire()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game uuid;
  v_n integer := 0;
begin
  for v_game in
    select distinct t.game_id
      from private.game_tags t
      join public.games g on g.id = t.game_id
     where t.status = 'pending'
       and (private.game_start_at(g.date, g.start_time) <= now() or coalesce(g.status, 'open') not in ('open', 'full'))
  loop
    update private.game_tags t set status = 'expired', answered_at = now() where t.game_id = v_game and t.status = 'pending';
    perform private.game_recount(v_game);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function private.game_tags_expire() from public, anon, authenticated;

-- Who is tagged and waiting on a game: its host gets each {id, name, photo, u (their public username, when
-- tagging is still on)}, the first tagged first (then by name); anyone else only whether they are (mine: 'pending' or null). Answers
-- {r: ok, host: true, tags} or {r: ok, host: false, mine}, or r: unavailable, bad, gone.
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
                                          'u', (select n.username from public.usernames n where n.user_id = t.user_id and n.taggable))
                       order by t.created_at, u.name, t.id)
        from private.game_tags t
        join public.users u on u.id = t.user_id
       where t.game_id = p_game_id and t.status = 'pending'
         and not exists (select 1 from public.game_participants p where p.game_id = t.game_id and p.user_id = t.user_id)), '[]'::jsonb));
  end if;
  return jsonb_build_object('r', 'ok', 'host', false, 'mine', (
    select t.status from private.game_tags t
     where t.game_id = p_game_id and t.user_id = p_user_id and t.status = 'pending'
       and not exists (select 1 from public.game_participants p where p.game_id = t.game_id and p.user_id = t.user_id)));
end;
$$;
revoke all on function public.game_tags_for(text, uuid, uuid) from public;
grant execute on function public.game_tags_for(text, uuid, uuid) to anon, authenticated;

-- The tagged player's answer. Yes: they are a player of the game (a game_participants row, as an accepted
-- request makes; a request of theirs still waiting is marked accepted), and the count is as it was, since the
-- tag held their spot. No: the spot is free again. Either way the host is told once, in the app. Answers
-- {r: ok, status: yes | no, current_players} or r: unavailable, bad, gone (no waiting tag: taken back,
-- answered or ended), closed (the game started or is off).
create or replace function public.game_tag_answer(p_key text, p_user_id uuid, p_game_id uuid, p_yes boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_tag private.game_tags;
  v_name text;
  v_sport text;
  v_in integer;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_game_id is null or p_yes is null then
    return jsonb_build_object('r', 'bad');
  end if;
  -- The game row first, as the host's answers and edits take it: one change to its count at a time.
  select * into v_game from public.games g where g.id = p_game_id for update;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  select * into v_tag from private.game_tags t where t.game_id = p_game_id and t.user_id = p_user_id for update;
  if not found or v_tag.status is distinct from 'pending' then
    return jsonb_build_object('r', 'gone');
  end if;
  if coalesce(v_game.status, 'open') not in ('open', 'full') or private.game_start_at(v_game.date, v_game.start_time) <= now() then
    return jsonb_build_object('r', 'closed');
  end if;
  select nullif(split_part(btrim(coalesce(u.name::text, '')), ' ', 1), '') into v_name from public.users u where u.id = p_user_id;
  if not found then
    return jsonb_build_object('r', 'bad');
  end if;
  v_sport := coalesce(private.game_sport_text(v_game.sport), 'your') || ' game';
  if p_yes then
    insert into public.game_participants (game_id, user_id) values (p_game_id, p_user_id)
    on conflict (game_id, user_id) do nothing;
    update public.game_requests r set status = 'accepted', responded_at = now()
     where r.game_id = p_game_id and r.user_id = p_user_id and r.status = 'pending';
  end if;
  update private.game_tags t set status = case when p_yes then 'yes' else 'no' end, answered_at = now() where t.id = v_tag.id;
  v_in := private.game_recount(p_game_id);
  perform private.game_notify(v_game.creator_id, case when p_yes then 'game_tag_yes' else 'game_tag_no' end,
                              case when p_yes then 'Confirmed' else 'Spot open again' end,
                              coalesce(v_name, 'A player') || case when p_yes then ' is in for your ' || v_sport || ' on '
                                                                 else ' can''t make your ' || v_sport || ' on ' end
                                || to_char(v_game.date, 'Dy FMDD Mon') || '.',
                              jsonb_build_object('gameId', p_game_id));
  return jsonb_build_object('r', 'ok', 'status', case when p_yes then 'yes' else 'no' end, 'current_players', v_in);
end;
$$;
revoke all on function public.game_tag_answer(text, uuid, uuid, boolean) from public;
grant execute on function public.game_tag_answer(text, uuid, uuid, boolean) to anon, authenticated;

-- ── 5. Games: create and edit ──────────────────────────────

-- As 20261103_game_other_venue.sql, with the confirmed people: p_game may
-- carry confirmed_names, confirmed_extra and confirmed_tags; the host and
-- all of them must fit max_players (r: bad, field confirmed). The game
-- starts counted with them.
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
  v_venue boolean;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  v_bad := private.game_field_problem(private.game_confirmed_strip(p_game), array['turf_id', 'sport', 'skill_level', 'max_players', 'date', 'start_time', 'end_time',
                                                    'price_per_player', 'description', 'turf_booked', 'host_phone',
                                                    'venue_name', 'venue_address', 'venue_area', 'venue_city', 'venue_maps_url']);
  v_venue := v_bad is null and p_game ?| array['venue_name', 'venue_address', 'venue_area', 'venue_city', 'venue_maps_url'];
  if v_bad is null then
    v_bad := private.game_venue_problem(p_game);
  end if;
  if v_bad is null then
    v_bad := private.game_confirmed_problem(p_game, false);
  end if;
  if v_bad is null and not (p_game ?& array['sport', 'skill_level', 'max_players', 'date', 'start_time', 'end_time', 'price_per_player']
                            and (v_venue or p_game ? 'turf_id')) then
    v_bad := 'body';
  end if;
  if v_bad is not null then
    return jsonb_build_object('r', 'bad', 'field', v_bad);
  end if;
  v_date := (p_game ->> 'date')::date;
  if v_date < v_today or v_date > v_today + 365 then
    return jsonb_build_object('r', 'bad', 'field', 'date');
  end if;
  -- 20261117_game_confirmed.sql: the host and everyone the host says is in must fit.
  if 1 + private.game_confirmed_asked(p_game) > (p_game ->> 'max_players')::integer then
    return jsonb_build_object('r', 'bad', 'field', 'confirmed');
  end if;
  -- One create at a time per account: the daily limit counts every game before this one.
  perform pg_advisory_xact_lock(hashtextextended('game_create:' || p_user_id::text, 0));
  select * into v_user from public.users u where u.id = p_user_id;
  if not found then
    return jsonb_build_object('r', 'bad');
  end if;
  if not v_venue and not exists (select 1 from public.turfs t where t.id = (p_game ->> 'turf_id')::uuid and t.is_active is true) then
    return jsonb_build_object('r', 'venue');
  end if;
  if (select count(*) from public.games g where g.creator_id = p_user_id and g.series_id is null and g.created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('r', 'limit');
  end if;
  v_sport := btrim(p_game ->> 'sport');
  insert into public.games (creator_id, turf_id, title, description, sport, skill_level, max_players, current_players, date,
                            start_time, end_time, price_per_player, status, host_name, host_phone, host_profile_image_url, turf_booked,
                            venue_name, venue_address, venue_area, venue_city, venue_maps_url, confirmed_names, confirmed_extra)
  values (p_user_id, case when v_venue then null else (p_game ->> 'turf_id')::uuid end, v_sport || ' Game',
          coalesce(nullif(btrim(p_game ->> 'description'), ''), v_sport || ' game'),
          v_sport, p_game ->> 'skill_level', (p_game ->> 'max_players')::integer,
          1 + cardinality(private.game_confirmed_names(p_game)) + private.game_confirmed_extra(p_game), v_date,
          (p_game ->> 'start_time')::time, (p_game ->> 'end_time')::time, (p_game ->> 'price_per_player')::numeric, 'open',
          coalesce(nullif(btrim(v_user.name::text), ''), 'Player'), coalesce(p_game ->> 'host_phone', ''),
          coalesce(v_user.profile_image_url, ''), coalesce((p_game ->> 'turf_booked')::boolean, false),
          case when v_venue then private.game_venue_text(p_game ->> 'venue_name') end,
          case when v_venue then private.game_venue_text(p_game ->> 'venue_address') end,
          case when v_venue then nullif(private.game_venue_text(p_game ->> 'venue_area'), '') end,
          case when v_venue then private.game_venue_text(p_game ->> 'venue_city') end,
          case when v_venue then nullif(private.game_venue_text(p_game ->> 'venue_maps_url'), '') end,
          private.game_confirmed_names(p_game), private.game_confirmed_extra(p_game))
  returning * into v_row;
  insert into public.game_participants (game_id, user_id) values (v_row.id, p_user_id)
  on conflict (game_id, user_id) do nothing;
  -- 20261117_game_confirmed.sql: the players the host tagged are told, and counted until they answer.
  if p_game ? 'confirmed_tags' then
    perform private.game_tags_add(v_row.id, p_user_id, private.game_confirmed_tags(p_game));
    perform private.game_recount(v_row.id);
    select * into v_row from public.games g where g.id = v_row.id;
  end if;
  return jsonb_build_object('r', 'ok', 'game', to_jsonb(v_row));
end;
$$;
revoke all on function public.game_create(text, uuid, jsonb) from public;
grant execute on function public.game_create(text, uuid, jsonb) to anon, authenticated;

-- The host's edit sheet, as 20261110_email.sql, with the confirmed people:
-- p_changes may carry confirmed_names (the whole list), confirmed_extra,
-- confirmed_tags (usernames to add) and confirmed_untag (waiting tags to
-- take back). Max players can't go under everyone in (too_few, with the
-- number), and more confirmed people than fit is bad (field confirmed).
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
  v_venue boolean := false;
  v_name text;
  v_address text;
  v_area text;
  v_city text;
  v_maps text;
  v_host text;
  v_names text[];
  v_extra integer;
  v_guests integer;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_game_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  v_bad := private.game_field_problem(private.game_confirmed_strip(p_changes), array['date', 'start_time', 'end_time', 'max_players', 'price_per_player', 'description',
                                                       'turf_booked', 'skill_level', 'turf_id',
                                                       'venue_name', 'venue_address', 'venue_area', 'venue_city', 'venue_maps_url']);
  if v_bad is null then
    v_bad := private.game_venue_problem(p_changes);
  end if;
  if v_bad is null then
    v_bad := private.game_confirmed_problem(p_changes, true);
  end if;
  if v_bad is not null then
    return jsonb_build_object('r', 'bad', 'field', v_bad);
  end if;
  v_venue := p_changes ?| array['venue_name', 'venue_address', 'venue_area', 'venue_city', 'venue_maps_url'];
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
  -- 20261117_game_confirmed.sql: the people the host says are in take spots too (the names and the count as this
  -- save leaves them, the tags still waiting, less the ones untagged, plus the new ones).
  v_names := case when p_changes ? 'confirmed_names' then private.game_confirmed_names(p_changes) else v_old.confirmed_names end;
  v_extra := case when p_changes ? 'confirmed_extra' then private.game_confirmed_extra(p_changes) else v_old.confirmed_extra end;
  v_guests := cardinality(v_names) + v_extra + private.game_tags_after(p_game_id, p_changes);
  if p_changes ? 'max_players' and (p_changes ->> 'max_players')::integer < v_players + v_guests then
    return jsonb_build_object('r', 'too_few', 'players', v_players + v_guests);
  end if;
  if p_changes ?| array['confirmed_names', 'confirmed_extra', 'confirmed_tags', 'confirmed_untag'] and v_players + v_guests > v_old.max_players and not p_changes ? 'max_players' then
    return jsonb_build_object('r', 'bad', 'field', 'confirmed');
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
  if v_venue then
    v_name := private.game_venue_text(p_changes ->> 'venue_name');
    v_address := private.game_venue_text(p_changes ->> 'venue_address');
    v_area := nullif(private.game_venue_text(p_changes ->> 'venue_area'), '');
    v_city := private.game_venue_text(p_changes ->> 'venue_city');
    v_maps := nullif(private.game_venue_text(p_changes ->> 'venue_maps_url'), '');
    -- Off its turf, or another place: a move. Only the area or the map link: an edit, no one told.
    v_moved := v_old.turf_id is not null
               or (lower(v_name), lower(v_address), lower(v_city)) is distinct from (lower(v_old.venue_name), lower(v_old.venue_address), lower(v_old.venue_city));
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
         turf_id = case when v_venue then null when v_moved then v_turf else g.turf_id end,
         venue_name = case when v_venue then v_name when v_moved then null else g.venue_name end,
         venue_address = case when v_venue then v_address when v_moved then null else g.venue_address end,
         venue_area = case when v_venue then v_area when v_moved then null else g.venue_area end,
         venue_city = case when v_venue then v_city when v_moved then null else g.venue_city end,
         venue_maps_url = case when v_venue then v_maps when v_moved then null else g.venue_maps_url end,
         confirmed_names = v_names,
         confirmed_extra = v_extra,
         current_players = case when v_players + v_guests > 0 then v_players + v_guests else g.current_players end,
         updated_at = now()
   where g.id = p_game_id
  returning * into v_row;
  if v_moved then
    v_title := coalesce(nullif(left(btrim(p_move_notice ->> 'title'), 80), ''), 'Venue changed');
    v_message := nullif(left(btrim(p_move_notice ->> 'message'), 300), '');
    if v_message is null then
      v_message := 'Your game moved to ' || coalesce(case when v_venue then v_name else (select btrim(t.name::text) from public.turfs t where t.id = v_turf) end, 'another venue');
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
  -- 20261110_email.sql: a new date or start time tells the people a move tells (game_time_changed), never the host.
  if v_row.date is distinct from v_old.date or v_row.start_time is distinct from v_old.start_time then
    v_host := nullif(split_part(btrim(coalesce(v_old.host_name, '')), ' ', 1), '');
    with told as (
      select p.user_id from public.game_participants p where p.game_id = p_game_id
      union
      select r.user_id from public.game_requests r where r.game_id = p_game_id and r.status in ('pending', 'accepted')
    )
    insert into public.notifications (user_id, type, title, message, metadata, is_read)
    select t.user_id, 'game_time_changed', 'Game time changed',
           coalesce(v_host, 'Your host') || ' moved ' || coalesce(private.game_sport_text(v_row.sport), 'the game') || ' to '
             || to_char(v_row.date, 'Dy FMDD Mon') || ', ' || private.game_clock_text(v_row.start_time) || '.',
           jsonb_build_object('gameId', p_game_id, 'date', v_row.date, 'startTime', to_char(v_row.start_time, 'HH24:MI'),
                              'fromDate', v_old.date, 'fromStartTime', to_char(v_old.start_time, 'HH24:MI')), false
      from told t
     where t.user_id is not null and t.user_id is distinct from v_old.creator_id;
  end if;
  -- 20261117_game_confirmed.sql: untag, then tag (the new ones are told), then the count as it now is.
  if p_changes ?| array['confirmed_tags', 'confirmed_untag'] then
    perform private.game_tags_untag(p_game_id, private.game_confirmed_untag(p_changes));
    perform private.game_tags_add(p_game_id, p_user_id, private.game_confirmed_tags(p_changes));
    perform private.game_recount(p_game_id);
    select * into v_row from public.games g where g.id = p_game_id;
  end if;
  return jsonb_build_object('r', 'ok', 'game', to_jsonb(v_row), 'notified', v_notified);
end;
$$;
revoke all on function public.game_update(text, uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.game_update(text, uuid, uuid, jsonb, jsonb) to anon, authenticated;

-- ── 6. Join requests: full counts the confirmed people ─────

-- As 20261030_games_lockdown.sql; full is everyone in (private.game_in), not the joined players alone.
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
  v_players := private.game_in(p_game_id);
  if v_game.status = 'full' or v_players >= v_game.max_players then
    return jsonb_build_object('r', 'full');
  end if;
  -- Sends, not rows: asking again reuses the row, but every send tells the
  -- host once, so the hosts' notes about this player's requests are counted.
  if (select count(*)
        from public.game_requests r
        join public.games g on g.id = r.game_id
        join public.notifications n on n.user_id = g.creator_id
       where r.user_id = p_user_id
         and n.type = 'game_request'
         and n.created_at > now() - interval '1 day'
         and n.metadata ->> 'requestId' = r.id::text) >= 30 then
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

-- As 20261030_games_lockdown.sql; full, and the count it writes, are everyone in (private.game_in; the
-- recount also takes the accepted player's own waiting tag, if the host had tagged them, off the public count).
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
      v_players := private.game_in(v_game.id);
      if v_players >= v_game.max_players then
        return jsonb_build_object('r', 'full');
      end if;
      insert into public.game_participants (game_id, user_id) values (v_game.id, v_req.user_id)
      on conflict (game_id, user_id) do nothing;
    end if;
    update public.game_requests r set status = 'accepted', responded_at = now() where r.id = p_request_id;
    v_players := private.game_recount(v_game.id);
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

-- ── 7. Repeats ─────────────────────────────────────────────

-- Puts up the series' next games, as 20261103_game_other_venue.sql: each copies the names and the people
-- without one, and starts counted with them.
create or replace function private.game_series_fill(p_series_id uuid, p_now timestamptz default now(), p_booked boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s private.game_series;
  v_user public.users;
  v_now timestamp := p_now at time zone 'Asia/Kolkata';
  v_today date := (p_now at time zone 'Asia/Kolkata')::date;
  v_ahead integer;
  v_room integer;
  v_day date;
  v_made integer := 0;
  v_row public.games;
begin
  -- One fill at a time per series (the create and the daily job).
  select * into v_s from private.game_series s where s.id = p_series_id for update;
  if not found or not v_s.active then
    return 0;
  end if;
  if not exists (select 1 from private.game_series_days(v_s.rule, v_s.starts_on, private.game_series_last(v_s), v_s.max_games) x
                  where x.day + v_s.start_time > v_now
                    and not exists (select 1 from private.game_series_dates d where d.series_id = v_s.id and d.day = x.day)) then
    update private.game_series s set active = false, ended = 'done', updated_at = now() where s.id = v_s.id;
    return 0;
  end if;
  select * into v_user from public.users u where u.id = v_s.host_id;
  -- No account any more, or the turf is not listed: nothing is made until it is. A typed venue has no listing.
  if not found or (v_s.turf_id <> private.game_series_no_turf()
                   and not exists (select 1 from public.turfs t where t.id = v_s.turf_id and t.is_active is true)) then
    return 0;
  end if;
  -- Series games have their own daily limit, across the host's series.
  perform pg_advisory_xact_lock(hashtextextended('game_series_fill:' || v_s.host_id::text, 0));
  v_room := 30 - (select count(*) from public.games g
                   where g.creator_id = v_s.host_id and g.series_id is not null and g.created_at > p_now - interval '1 day');
  -- Its games still on from today: one the host cancelled holds no place
  -- (game_series_dates still keeps its day from being made again).
  select count(*) into v_ahead from public.games g
   where g.series_id = v_s.id and coalesce(g.status, 'open') in ('open', 'full') and g.date >= v_today;
  for v_day in
    select x.day
      from private.game_series_days(v_s.rule, v_s.starts_on, private.game_series_last(v_s), v_s.max_games) x
     where x.day + v_s.start_time > v_now
       and not exists (select 1 from private.game_series_dates d where d.series_id = v_s.id and d.day = x.day)
     order by x.day
  loop
    exit when v_ahead >= 8 or v_room <= 0 or (v_day > v_today + 27 and v_ahead > 0);
    insert into public.games (creator_id, turf_id, title, description, sport, skill_level, max_players, current_players, date,
                              start_time, end_time, price_per_player, status, host_name, host_phone, host_profile_image_url, turf_booked, series_id,
                              venue_name, venue_address, venue_area, venue_city, venue_maps_url, confirmed_names, confirmed_extra)
    values (v_s.host_id, nullif(v_s.turf_id, private.game_series_no_turf()), v_s.sport || ' Game', coalesce(nullif(btrim(v_s.description), ''), v_s.sport || ' game'),
            v_s.sport, v_s.skill_level, v_s.max_players, 1 + cardinality(v_s.confirmed_names) + v_s.confirmed_extra, v_day, v_s.start_time, v_s.end_time, v_s.price_per_player, 'open',
            coalesce(nullif(btrim(v_user.name::text), ''), 'Player'), coalesce(v_s.host_phone, ''),
            coalesce(v_user.profile_image_url, ''), coalesce(p_booked, false) and v_made = 0, v_s.id,
            v_s.venue_name, v_s.venue_address, v_s.venue_area, v_s.venue_city, v_s.venue_maps_url, v_s.confirmed_names, v_s.confirmed_extra)
    returning * into v_row;
    insert into public.game_participants (game_id, user_id) values (v_row.id, v_s.host_id)
    on conflict (game_id, user_id) do nothing;
    insert into private.game_series_dates (series_id, day, game_id) values (v_s.id, v_day, v_row.id);
    v_made := v_made + 1;
    v_ahead := v_ahead + 1;
    v_room := v_room - 1;
  end loop;
  if v_made > 0 then
    update private.game_series s set updated_at = now() where s.id = v_s.id;
  end if;
  return v_made;
end;
$$;
revoke all on function private.game_series_fill(uuid, timestamptz, boolean) from public, anon, authenticated;

-- Starting a repeat, as 20261103_game_other_venue.sql, with the confirmed people as game_create takes them:
-- the names and the count kept on the series for every game, the tags for the first game only.
create or replace function public.game_series_create(p_key text, p_user_id uuid, p_game jsonb, p_repeat jsonb)
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
  v_rule jsonb;
  v_ends jsonb;
  v_first date;
  v_s private.game_series;
  v_sport text;
  v_made integer;
  v_venue boolean;
  v_first_game uuid;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  v_bad := private.game_field_problem(private.game_confirmed_strip(p_game), array['turf_id', 'sport', 'skill_level', 'max_players', 'date', 'start_time', 'end_time',
                                                    'price_per_player', 'description', 'turf_booked', 'host_phone',
                                                    'venue_name', 'venue_address', 'venue_area', 'venue_city', 'venue_maps_url']);
  v_venue := v_bad is null and p_game ?| array['venue_name', 'venue_address', 'venue_area', 'venue_city', 'venue_maps_url'];
  if v_bad is null then
    v_bad := private.game_venue_problem(p_game);
  end if;
  if v_bad is null then
    v_bad := private.game_confirmed_problem(p_game, false);
  end if;
  if v_bad is null and not (p_game ?& array['sport', 'skill_level', 'max_players', 'date', 'start_time', 'end_time', 'price_per_player']
                            and (v_venue or p_game ? 'turf_id')) then
    v_bad := 'body';
  end if;
  if v_bad is not null then
    return jsonb_build_object('r', 'bad', 'field', v_bad);
  end if;
  v_date := (p_game ->> 'date')::date;
  if v_date < v_today or v_date > v_today + 365 then
    return jsonb_build_object('r', 'bad', 'field', 'date');
  end if;
  -- 20261117_game_confirmed.sql: the host and everyone the host says is in must fit.
  if 1 + private.game_confirmed_asked(p_game) > (p_game ->> 'max_players')::integer then
    return jsonb_build_object('r', 'bad', 'field', 'confirmed');
  end if;
  v_bad := private.game_series_problem(p_repeat, v_date);
  if v_bad is not null then
    return jsonb_build_object('r', 'bad', 'field', v_bad);
  end if;
  v_ends := p_repeat -> 'ends';
  -- Kept as the maths reads it: a weekly rule's days in order, each once.
  v_rule := case when p_repeat -> 'rule' ->> 'freq' = 'weekly' then
      jsonb_build_object('freq', 'weekly', 'interval', (p_repeat -> 'rule' ->> 'interval')::integer,
                         'days', (select jsonb_agg((e #>> '{}')::integer order by (e #>> '{}')::integer) from jsonb_array_elements(p_repeat -> 'rule' -> 'days') e))
    when p_repeat -> 'rule' ->> 'by' = 'date' then
      jsonb_build_object('freq', 'monthly', 'by', 'date', 'day', (p_repeat -> 'rule' ->> 'day')::integer)
    else
      jsonb_build_object('freq', 'monthly', 'by', 'weekday', 'nth', (p_repeat -> 'rule' ->> 'nth')::integer, 'weekday', (p_repeat -> 'rule' ->> 'weekday')::integer)
    end;
  -- The first game must not have started already.
  select x.day into v_first from private.game_series_days(v_rule, v_date, v_date + 365, null) x order by x.day limit 1;
  if v_first + (p_game ->> 'start_time')::time <= (now() at time zone 'Asia/Kolkata') then
    return jsonb_build_object('r', 'bad', 'field', 'start_time');
  end if;
  -- One create at a time per host: the limits count every series before this one.
  perform pg_advisory_xact_lock(hashtextextended('game_series:' || p_user_id::text, 0));
  select * into v_user from public.users u where u.id = p_user_id;
  if not found then
    return jsonb_build_object('r', 'bad');
  end if;
  if not v_venue and not exists (select 1 from public.turfs t where t.id = (p_game ->> 'turf_id')::uuid and t.is_active is true) then
    return jsonb_build_object('r', 'venue');
  end if;
  if (select count(*) from private.game_series s where s.host_id = p_user_id and s.active) >= 3 then
    return jsonb_build_object('r', 'many');
  end if;
  if (select count(*) from private.game_series s where s.host_id = p_user_id and s.created_at > now() - interval '1 day') >= 5
     or (select count(*) from public.games g where g.creator_id = p_user_id and g.series_id is not null and g.created_at > now() - interval '1 day') >= 30 then
    -- (The second: today's series games are used up, so it could put up no first game.)
    return jsonb_build_object('r', 'limit');
  end if;
  v_sport := btrim(p_game ->> 'sport');
  insert into private.game_series (host_id, turf_id, sport, skill_level, max_players, start_time, end_time, price_per_player,
                                   description, host_phone, rule, starts_on, ends_on, max_games,
                                   venue_name, venue_address, venue_area, venue_city, venue_maps_url, confirmed_names, confirmed_extra)
  values (p_user_id, case when v_venue then private.game_series_no_turf() else (p_game ->> 'turf_id')::uuid end,
          v_sport, p_game ->> 'skill_level', (p_game ->> 'max_players')::integer,
          (p_game ->> 'start_time')::time, (p_game ->> 'end_time')::time, (p_game ->> 'price_per_player')::numeric,
          nullif(btrim(p_game ->> 'description'), ''), coalesce(p_game ->> 'host_phone', ''), v_rule, v_date,
          case when v_ends ->> 'type' = 'on' then (v_ends ->> 'date')::date end,
          case when v_ends ->> 'type' = 'after' then (v_ends ->> 'count')::integer end,
          case when v_venue then private.game_venue_text(p_game ->> 'venue_name') end,
          case when v_venue then private.game_venue_text(p_game ->> 'venue_address') end,
          case when v_venue then nullif(private.game_venue_text(p_game ->> 'venue_area'), '') end,
          case when v_venue then private.game_venue_text(p_game ->> 'venue_city') end,
          case when v_venue then nullif(private.game_venue_text(p_game ->> 'venue_maps_url'), '') end,
          private.game_confirmed_names(p_game), private.game_confirmed_extra(p_game))
  returning * into v_s;
  v_made := private.game_series_fill(v_s.id, now(), coalesce((p_game ->> 'turf_booked')::boolean, false));
  -- 20261117_game_confirmed.sql: tags are for the first game only (each later game can be tagged from its own page).
  if v_made > 0 and p_game ? 'confirmed_tags' then
    select g.id into v_first_game from public.games g where g.series_id = v_s.id order by g.date limit 1;
    perform private.game_tags_add(v_first_game, p_user_id, private.game_confirmed_tags(p_game));
    perform private.game_recount(v_first_game);
  end if;
  select * into v_s from private.game_series s where s.id = v_s.id;
  return jsonb_build_object('r', 'ok', 'series', private.game_series_json(v_s), 'made', v_made,
    'games', coalesce((select jsonb_agg(to_jsonb(g) order by g.date) from public.games g where g.series_id = v_s.id), '[]'::jsonb));
end;
$$;
revoke all on function public.game_series_create(text, uuid, jsonb, jsonb) from public;
grant execute on function public.game_series_create(text, uuid, jsonb, jsonb) to anon, authenticated;

-- ── 8. Emails: the players an email counts ─────────────────

-- As 20261110_email.sql; 'players' is everyone in (private.game_in), so an email's spots agree with the page.
-- Never a confirmed name, and nothing goes to a tagged player who has not answered.
create or replace function private.email_job(p_row private.email_outbox)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_held text := private.email_mode_skip(p_row.user_id);
  v_to text;
  v_name text;
  v_game public.games;
  v_starts timestamptz;
  v_requests jsonb;
  v_turf record;
  v_players integer;
begin
  -- The mode first: emails off, or this account isn't the site owner's while only they get emails.
  if v_held is not null then
    return jsonb_build_object('skip', v_held);
  end if;
  v_to := private.email_address(p_row.user_id);
  if v_to is null then
    return jsonb_build_object('skip', 'no_address');
  end if;
  if private.email_suppressed(v_to) then
    return jsonb_build_object('skip', 'suppressed');
  end if;
  if not private.email_ok(p_row.user_id, p_row.kind) then
    return jsonb_build_object('skip', 'off');
  end if;
  select left(nullif(split_part(btrim(coalesce(u.name::text, '')), ' ', 1), ''), 40) into v_name from public.users u where u.id = p_row.user_id;

  if p_row.kind = 'welcome' then
    return jsonb_build_object('id', p_row.id, 'kind', p_row.kind, 'group', 'account', 'user_id', p_row.user_id,
                              'to', v_to, 'name', v_name, 'path', '/games');
  end if;

  select * into v_game from public.games x where x.id = private.email_uuid(p_row.refs ->> 'game_id');
  if not found then
    return jsonb_build_object('skip', 'gone');
  end if;
  v_starts := private.game_start_at(v_game.date, v_game.start_time);
  if p_row.kind = 'game_cancelled' then
    if v_game.status is distinct from 'cancelled' then
      return jsonb_build_object('skip', 'gone');
    end if;
  else
    if v_game.status = 'cancelled' then
      return jsonb_build_object('skip', 'cancelled');
    end if;
    if coalesce(v_game.status, 'open') not in ('open', 'full') then
      return jsonb_build_object('skip', 'closed');
    end if;
    if v_starts <= now() then
      return jsonb_build_object('skip', 'started');
    end if;
  end if;

  if p_row.kind in ('join_request', 'request_waiting') then
    -- Only the requests still waiting for the host's answer.
    select jsonb_agg(jsonb_build_object('name', left(coalesce(nullif(btrim(q.requester_name::text), ''), 'A player'), 60)) order by q.created_at)
      into v_requests
      from public.game_requests q
     where q.game_id = v_game.id
       and q.status = 'pending'
       and q.id in (select private.email_uuid(e) from jsonb_array_elements_text(coalesce(p_row.refs -> 'request_ids', '[]'::jsonb)) e);
    if v_requests is null then
      return jsonb_build_object('skip', 'answered');
    end if;
  elsif p_row.kind = 'request_accepted' then
    if not exists (select 1 from public.game_participants pp where pp.game_id = v_game.id and pp.user_id = p_row.user_id) then
      return jsonb_build_object('skip', 'not_in');
    end if;
  elsif p_row.kind = 'reminder' then
    if p_row.refs ? 'start_at' and (p_row.refs ->> 'start_at')::timestamptz is distinct from v_starts then
      return jsonb_build_object('skip', 'moved');
    end if;
    -- Sent late (a retry, a hold): "tomorrow" only while the game is tomorrow in India, "in about 3 hours" only
    -- while it is 90 minutes away or more.
    if (p_row.refs ->> 'when' = 'tomorrow' and v_game.date is distinct from (now() at time zone 'Asia/Kolkata')::date + 1)
       or (p_row.refs ->> 'when' = 'soon' and v_starts - now() < interval '90 minutes') then
      return jsonb_build_object('skip', 'late');
    end if;
  elsif p_row.kind = 'game_changed' then
    -- Only the time, and it is back to what it was: nothing changed.
    if not (p_row.refs -> 'changes' @> '["venue"]'::jsonb)
       and p_row.refs ->> 'from_date' = v_game.date::text
       and p_row.refs ->> 'from_start' = to_char(v_game.start_time, 'HH24:MI') then
      return jsonb_build_object('skip', 'no_change');
    end if;
  end if;

  select t.name::text as name, t.area::text as area, t.city::text as city, t.address::text as address, t.lat, t.lng, t.slug::text as slug
    into v_turf
    from public.turfs t
   where t.id = v_game.turf_id;
  v_players := private.game_in(v_game.id);

  return jsonb_build_object(
    'id', p_row.id,
    'kind', p_row.kind,
    'group', private.email_group(p_row.kind),
    'user_id', p_row.user_id,
    'to', v_to,
    'name', v_name,
    'you_host', v_game.creator_id is not distinct from p_row.user_id,
    'game', jsonb_build_object(
      'id', v_game.id,
      'sport', v_game.sport,
      'date', v_game.date,
      'start_time', to_char(v_game.start_time, 'HH24:MI'),
      'end_time', to_char(v_game.end_time, 'HH24:MI'),
      'price_per_player', v_game.price_per_player,
      'status', v_game.status,
      'host_first', left(nullif(split_part(btrim(coalesce(v_game.host_name, '')), ' ', 1), ''), 40),
      'players', v_players,
      'max_players', v_game.max_players,
      'venue', jsonb_build_object(
        'name', left(coalesce(nullif(btrim(v_turf.name), ''), nullif(btrim(v_game.venue_name), '')), 80),
        'area', coalesce(nullif(btrim(v_turf.area), ''), nullif(btrim(v_game.venue_area), '')),
        'city', coalesce(nullif(btrim(v_turf.city), ''), nullif(btrim(v_game.venue_city), '')),
        'address', left(coalesce(nullif(btrim(v_turf.address), ''), nullif(btrim(v_game.venue_address), '')), 200),
        'lat', v_turf.lat,
        'lng', v_turf.lng,
        'maps_url', v_game.venue_maps_url,
        'turf_slug', v_turf.slug)),
    'when', p_row.refs ->> 'when',
    'requests', coalesce(v_requests, '[]'::jsonb),
    'changes', coalesce(p_row.refs -> 'changes', '[]'::jsonb),
    'from', jsonb_strip_nulls(jsonb_build_object('date', p_row.refs ->> 'from_date', 'start_time', p_row.refs ->> 'from_start')),
    'path', '/game/' || v_game.id::text);
end;
$$;
revoke all on function private.email_job(private.email_outbox) from public, anon, authenticated;

-- ── 9. The job ─────────────────────────────────────────────

select cron.schedule('game-tags-expire', '*/10 * * * *', 'select private.game_tags_expire()');
