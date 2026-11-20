set local lock_timeout = '5s';

-- The medal on a player's photo (20 Nov 2026). The site owner: "my
-- profile should be highlighted so that others are motivated", and of the
-- ways to do it: "Badge on my photo: your best medal shows on your photo
-- wherever other players see you: game lineups, the host card,
-- played-with. Tapping it opens your profile."
--
-- Medals are worked out in the app from a player's games and reviews
-- (lib/profile/medals.ts, lib/profile/passport.ts), never in SQL, and that
-- stays so. A game's lineup can't work out every player's medals on each
-- view, so this file keeps one small fact per player, their best medal and
-- how many they have, where a lineup can read it in one call.
--
-- Table (schema private, RLS on, no grant to anyone; only the two
-- functions below touch it; no foreign key to public.users, as
-- private.game_tags and private.booking_requests, so nothing here locks
-- that table: on an account erasure, clear its row by hand with its other
-- rows; a row whose account is gone is never read, since the read joins
-- public.usernames):
--   private.player_badges   one row per player who has, or once had, a
--                           medal: user_id, medal (the id of their best
--                           one in lib/profile/medals.ts, such as
--                           'games-25'; null: none now), medals (how many
--                           they have earned, 0 with no medal),
--                           updated_at (the last time either changed).
--                           Nothing else: no name, number, address or
--                           game, and nothing that isn't already on that
--                           player's public profile, which shows their
--                           medals (20261101_played_with.sql).
--
-- 1. Kept in step by the app, with no job: whenever the server works out
--    the signed-in player's medals anyway (GET /api/me/played, read once
--    per tab session, and GET /api/me/passport; lib/profile/routes.ts), it
--    sends their best one, after the reply, unless that server instance
--    already sent the same (lib/profile/playerBadge.ts createBadgeSync).
--    So a badge appears, or changes, the next time its player opens
--    TapTurf signed in.
--      public.player_badge_set(p_key, p_user_id, p_medal, p_medals):
--        server key only (private.account_key_ok, as played_with_extras).
--        {r: ok, changed: true} once the row says so; {r: ok, changed:
--        false} when it already did (nothing is written, updated_at
--        stays). "No medal" (p_medal null, p_medals 0) sets a row that
--        has a medal to none and keeps the row; it makes no row for a
--        player who never had one, so nothing is kept about players
--        without medals. {r: bad} for anything that isn't a badge (no
--        account id, a medal id that isn't lower-case words joined by
--        hyphens or is over 32 characters, a count under 0 or over 99, a
--        medal with a count of 0 or a count with no medal);
--        {r: not_found} for an account that doesn't exist;
--        {r: unavailable} without the key.
--
-- 2. Read in one call per game page, by the browser, beside the lineup's
--    own reads (lib/queries/badges.ts), and by the server for the Me tab's
--    Played with (lib/profile/server.ts readBadges):
--      public.player_badges_for(p_ids uuid[]): jsonb [{id, m, n, u}], one
--        entry for each of those accounts that has a medal now AND whose
--        public.usernames row is taggable now: m the medal's id, n how
--        many they have, u their username (their profile, /u/<u>). The
--        "Let others find and tag me" switch is asked on every read, so
--        turning it off takes the badge away at once, and a player with
--        no public profile never has one. At most the first 60 ids are
--        read, counted as elements (as public.users_verified reads its
--        100); an id asked twice is answered once. Anyone may ask (anon
--        and authenticated), as anyone may open that player's public
--        profile and see the same medals there. It tells nothing about an
--        account without a public profile, not even that it exists.
--
-- Replaced: none. The one function this file calls is not changed here;
-- its md5(prosrc) is that of its latest body in the repo, which is what
-- production ran when 20261118_slot_asks.sql read pg_proc on 18 Nov 2026
-- (production was not read again for this file):
--   private.account_key_ok           ca605fa89a97497134b690e753dc5c0e  20261021_accounts_usernames.sql
-- Read and left as they are: public.users (does the account exist) and
-- public.usernames (username, taggable). No existing table is altered.
--
-- Needs 20261021_accounts_usernames.sql (it refuses to run without it,
-- changing nothing). Additive: one table, two functions. Written without
-- the destructive SQL keywords; nothing is removed. No grant or policy on
-- a public table changes, no public table is written, no trigger, no job.
-- Safe to run again (the rows stay as they are).
-- The app works before this file: the server's send finds no function and
-- waits (nothing fails), the browser's read finds none and shows no
-- badges, and every lineup, host card and Played with list looks exactly
-- as it did.
-- Never in a title, a description, JSON-LD, a share image, an email or a
-- list of games: the badge is drawn only on a game's own page and on the
-- Me tab, from this read.
-- Test: scripts/sql-tests/player_badges.check.mjs (PGlite).

do $$
begin
  if to_regprocedure('private.account_key_ok(text)') is null
     or to_regclass('public.users') is null
     or to_regclass('public.usernames') is null then
    raise exception 'player_badges needs 20261021_accounts_usernames.sql first';
  end if;
end;
$$;

-- ── 1. Each player's best medal ───────────────────────────

create table if not exists private.player_badges (
  user_id uuid primary key,
  medal text check (medal is null or (char_length(medal) <= 32 and medal ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$')),
  medals smallint not null default 0 check (medals between 0 and 99),
  updated_at timestamptz not null default now(),
  -- A medal and a count go together: none and 0, or one and at least 1.
  constraint player_badges_both check ((medal is null) = (medals = 0))
);
alter table private.player_badges enable row level security;
revoke all on table private.player_badges from public, anon, authenticated;
comment on table private.player_badges is 'Each player''s best medal (its id in lib/profile/medals.ts) and how many they have earned, for the badge on their photo. Worked out by the app, never here. Written only by player_badge_set (server key); read only by player_badges_for, which answers for people with a public profile alone. No foreign key: clear a row by hand when its account is erased.';

-- ── 2. One player's badge in (server key) ─────────────────

create or replace function public.player_badge_set(
  p_key text,
  p_user_id uuid,
  p_medal text default null,
  p_medals integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer := 0;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null
     or p_medals is null or p_medals < 0 or p_medals > 99
     or (p_medal is null) <> (p_medals = 0)
     or (p_medal is not null and (char_length(p_medal) > 32 or p_medal !~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$')) then
    return jsonb_build_object('r', 'bad');
  end if;
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'not_found');
  end if;
  if p_medal is null then
    -- No medal now: a row that has one is set to none and kept. A player who never had a row gets none.
    update private.player_badges b
       set medal = null, medals = 0, updated_at = now()
     where b.user_id = p_user_id and b.medal is not null;
  else
    -- The same medal and count again writes nothing: updated_at is the last time either changed.
    insert into private.player_badges as b (user_id, medal, medals)
    values (p_user_id, p_medal, p_medals::smallint)
    on conflict (user_id) do update
      set medal = excluded.medal, medals = excluded.medals, updated_at = now()
      where b.medal is distinct from excluded.medal or b.medals is distinct from excluded.medals;
  end if;
  get diagnostics v_rows = row_count;
  return jsonb_build_object('r', 'ok', 'changed', v_rows > 0);
end;
$$;

revoke all on function public.player_badge_set(text, uuid, text, integer) from public, anon, authenticated;
-- The passport routes' server calls it with the app's anon key and the server key (p_key), as played_with_extras; the key is the gate.
grant execute on function public.player_badge_set(text, uuid, text, integer) to anon;
comment on function public.player_badge_set(text, uuid, text, integer) is 'Server key only: keep this player''s best medal and how many they have (private.player_badges). The same values again write nothing; no medal sets an existing row to none and makes no new row.';

-- ── 3. The badges of the people on a page (anyone may ask) ──

create or replace function public.player_badges_for(p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.user_id, 'm', b.medal, 'n', b.medals, 'u', n.username)
                            order by b.user_id), '[]'::jsonb)
    from (select distinct t.id
            from (select u.id from unnest(p_ids) with ordinality as u(id, k) order by u.k limit 60) t
           where t.id is not null) x
    join private.player_badges b on b.user_id = x.id and b.medal is not null
    -- Only people whose profile is public right now: the switch is asked on every read.
    join public.usernames n on n.user_id = b.user_id and n.taggable;
$$;

revoke all on function public.player_badges_for(uuid[]) from public, anon, authenticated;
-- The game page's browser calls it as anon, or as authenticated for a Google session; it answers only for people with a public profile.
grant execute on function public.player_badges_for(uuid[]) to anon, authenticated;
comment on function public.player_badges_for(uuid[]) is 'Public: for the first 60 of these account ids, the best medal, the medal count and the username of each one that has a medal and a public profile (usernames.taggable) right now. Nothing about anyone else.';
