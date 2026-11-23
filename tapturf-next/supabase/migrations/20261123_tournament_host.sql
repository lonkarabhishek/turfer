set local lock_timeout = '5s';

-- Who started a live tournament (23 Nov 2026). The site owner, of a
-- tournament someone ran on TapTurf with care: "in the tournament view
-- ... can we also give info of who started it, when etc etc nicely".
--
-- When is already served: public.tournament_get answers created_at and
-- updated_at. Who is not: private.tournaments.user_id (the account a
-- signed-in organiser's tournament is kept with; null for an organiser
-- who never signed in) has been served to nobody but that organiser and
-- the site owner (20261102_live_tournaments.sql says so). This file adds
-- one read that names the organiser to followers, and only an organiser
-- who has a public profile at that moment.
--
-- The same day he asked for the other direction: "Also live scorecards if
-- they are part of a tournament give a link and show it properly please".
-- A fixture scored live carries its scorecard's code
-- (private.tournament_fixtures.live_code), and the tournament page links
-- to that scorecard, but the scorecard page (/live/<code>) knew nothing of
-- the tournament. The second read below tells it.
--
-- New, two functions:
--   public.tournament_host(p_key, p_code): jsonb
--     Gated exactly as public.tournament_get: the live write key
--     (private.live_key_ok), else {r: unavailable}; execute for anon and
--     authenticated, because the key is the gate and only the Next server
--     holds it (lib/tournament/server.ts). Stable, security definer,
--     search_path ''.
--     For a tournament that is on, whose user_id has a public.usernames
--     row that is taggable right now ("Let others find and tag me" on,
--     the same switch that decides whether /u/<username> exists) and a
--     name, it answers what that public profile already shows and nothing
--     more:
--       {u, name, photo, verified, m, n}
--         u         their username (the page links to /u/<u>)
--         name      public.users.name
--         photo     public.users.profile_image_url, or null
--         verified  the tick (private.user_verified), true or false
--         m, n      the medal on their photo: their best medal's id and
--                   how many they have (private.player_badges,
--                   20261121_player_badges.sql); null and 0 with none
--     Anything else answers null, with no way to tell the cases apart: no
--     such tournament, a code that is not a code, a tournament taken
--     down, an organiser who never signed in, an organiser with no
--     username or no name, or one whose switch is off.
--     Never the account's id, its number or its email, and never anything
--     about an organiser whose profile is not public. The switch is asked
--     on every call, so turning it off takes the name off the tournament
--     page as soon as the server's own copy runs out: it keeps one for 30
--     seconds, tagged with the tournament so the organiser's own changes
--     refresh it, and never shows one older than 90 seconds, however long
--     nobody opened the page (lib/tournament/host.ts HOST_COPY_MAX_MS). An
--     open page follows at its next poll.
--
--   public.live_tournament(p_key, p_live_code): jsonb
--     Gated and granted the same way (private.live_key_ok, {r:
--     unavailable} without the key, execute for anon and authenticated),
--     stable, security definer, search_path ''. For a live scorecard's
--     code that a fixture is linked to, where the fixture is not taken
--     out and its tournament is on, it answers what the scorecard page's
--     banner says and nothing more, all of it already on the tournament's
--     own page:
--       {code, name, format, fixture, stage, slot, n, of, home, away, next}
--         code, name   the tournament (the banner links to /tournament/<code>)
--         format       league, bilateral or tri
--         fixture      the fixture's id in that tournament
--         stage, slot  league, semi or final; s1, s2, f or null
--         n, of        a league match's place among the league matches, in
--                      the organiser's order (seq, then id: the page's own
--                      "Match 3"), and how many there are; n is null for a
--                      playoff
--         home, away   the two teams' names as the tournament has them
--                      (null for a playoff place not filled yet)
--         next         the first match in the organiser's order that has
--                      no result and no scorecard yet (so never this
--                      one): {stage, slot, n, home, away, day, time}, or
--                      null when there is none
--     When one link is on more than one fixture (the scorer kept the link
--     for the next match), the match still without a result comes first,
--     then the one changed last. null for anything else: a code that is no
--     code, a link no fixture has, a fixture taken out, a tournament taken
--     down. Never who organises it: no account, and nothing from
--     public.users or public.usernames.
--
-- Replaced: none. public.tournament_get and the live scorecard's own reads
-- are not touched; tournament_get still answers nothing about the
-- organiser. The two functions this file calls are not changed here. Each
-- md5 is md5(prosrc) of that function's latest body in the repo's
-- migrations; production was not read for this file, so compare before
-- applying:
--   select p.proname, md5(p.prosrc) from pg_proc p
--     join pg_namespace s on s.oid = p.pronamespace
--    where s.nspname = 'private' and p.proname in ('live_key_ok', 'user_verified');
--   private.live_key_ok              dc6dd849755acae1b79619d94e377586  20261021_accounts_usernames.sql
--   private.user_verified            d5ca7efd156622096d0b8f143052797d  20261027_verified_tick.sql
-- Read and left as they are: private.tournaments (code, status, user_id,
-- name, format), private.tournament_fixtures, private.tournament_teams
-- (name), public.usernames (username, taggable), public.users (name,
-- profile_image_url) and private.player_badges (medal, medals). No table
-- is altered, nothing is written anywhere, and no index is added: the
-- organiser's read is one tournament by its primary key, then one row of
-- each of the others by theirs; the scorecard's read finds its fixture by
-- tournament_fixtures_live_idx (live_code, where it is not null), then
-- that one tournament's fixtures and teams by their primary keys.
--
-- Needs 20261021_accounts_usernames.sql, 20261027_verified_tick.sql,
-- 20261102_live_tournaments.sql and 20261121_player_badges.sql (it
-- refuses to run without them, changing nothing). Additive: two functions.
-- Written without the destructive SQL keywords; nothing is removed. No
-- table, no grant or policy on a table, no trigger, no job. Safe to run
-- again.
-- The app works before this file: the reads find no function, the
-- tournament page says when it was started and names nobody, the
-- organiser's own controls say nothing about a name, a live scorecard
-- shows no tournament banner, and everything else on both pages is
-- exactly as it was.
-- Erasing an account: nothing new is kept, so there is nothing more to
-- clear. A tournament whose account or username is gone names nobody.
-- Never in a title, a description, an og tag or JSON-LD: the organiser's
-- name is drawn only in the tournament page's own body, and the banner
-- only in the scorecard page's.
-- Test: scripts/sql-tests/tournament_host.check.mjs (PGlite).

do $$
begin
  if to_regprocedure('private.live_key_ok(text)') is null
     or to_regprocedure('private.user_verified(uuid)') is null
     or to_regclass('private.tournaments') is null
     or to_regclass('private.tournament_fixtures') is null
     or to_regclass('private.tournament_teams') is null
     or to_regclass('private.player_badges') is null
     or to_regclass('public.usernames') is null
     or to_regclass('public.users') is null then
    raise exception 'tournament_host needs 20261021_accounts_usernames.sql, 20261027_verified_tick.sql, 20261102_live_tournaments.sql and 20261121_player_badges.sql first';
  end if;
end;
$$;

create or replace function public.tournament_host(p_key text, p_code text)
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
  return (
    select jsonb_build_object(
             'u', n.username,
             'name', u.name,
             'photo', u.profile_image_url,
             'verified', private.user_verified(u.id),
             'm', b.medal,
             'n', coalesce(b.medals, 0))
      from private.tournaments t
      -- Only an organiser whose profile is public right now: the switch is asked on every call.
      join public.usernames n on n.user_id = t.user_id and n.taggable
      join public.users u on u.id = n.user_id
      -- A row that says no medal now has medal null and medals 0 (the table's own check).
      left join private.player_badges b on b.user_id = n.user_id
     where t.code = p_code
       and t.status = 'on'
       and nullif(btrim(u.name), '') is not null);
end;
$$;

revoke all on function public.tournament_host(text, text) from public, anon, authenticated;
-- As public.tournament_get: the Next server calls it with the app's anon key and the live write key (p_key); the key is the gate.
grant execute on function public.tournament_host(text, text) to anon, authenticated;
comment on function public.tournament_host(text, text) is 'Live write key only: who started this tournament, as their public profile shows them (username, name, photo, verified tick, best medal and medal count), and only while the tournament is on and that account has a public profile (usernames.taggable) right now. null for anything else. Never an account id, a number or an email.';

-- ── The tournament a live scorecard belongs to ────────────

create or replace function public.live_tournament(p_key text, p_live_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f private.tournament_fixtures;
  t private.tournaments;
begin
  if not private.live_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_live_code is null or p_live_code !~ '^[a-z0-9]{12}$' then
    return null;
  end if;
  -- The fixture scored on this link, in a tournament that is on. A link kept for the next match is on two
  -- fixtures: the one still without a result (the match on now) comes first, then the one changed last.
  select x.* into f
    from private.tournament_fixtures x
    join private.tournaments y on y.code = x.code and y.status = 'on'
   where x.live_code = p_live_code
     and x.status <> 'removed'
   order by (x.result is null and x.live_result is null) desc, x.updated_at desc, x.code, x.id
   limit 1;
  if not found then
    return null;
  end if;
  select y.* into t from private.tournaments y where y.code = f.code;
  return jsonb_build_object(
    'code', t.code,
    'name', t.name,
    'format', t.format,
    'fixture', f.id,
    'stage', f.stage,
    'slot', f.slot,
    -- A league match's place among the league matches not taken out, in the organiser's order: the page's "Match 3".
    'n', case when f.stage = 'league' then
           (select count(*) from private.tournament_fixtures l
             where l.code = f.code and l.status <> 'removed' and l.stage = 'league'
               and (l.seq, l.id) <= (f.seq, f.id)) end,
    'of', (select count(*) from private.tournament_fixtures l
            where l.code = f.code and l.status <> 'removed' and l.stage = 'league'),
    'home', (select m.name from private.tournament_teams m where m.code = f.code and m.id = f.home),
    'away', (select m.name from private.tournament_teams m where m.code = f.code and m.id = f.away),
    -- The first match in the organiser's order with no result and no scorecard yet (so never this one, which has one).
    'next', (select jsonb_build_object(
                      'stage', n.stage,
                      'slot', n.slot,
                      'n', case when n.stage = 'league' then
                             (select count(*) from private.tournament_fixtures l
                               where l.code = n.code and l.status <> 'removed' and l.stage = 'league'
                                 and (l.seq, l.id) <= (n.seq, n.id)) end,
                      'home', (select m.name from private.tournament_teams m where m.code = n.code and m.id = n.home),
                      'away', (select m.name from private.tournament_teams m where m.code = n.code and m.id = n.away),
                      'day', n.day,
                      'time', n.time)
               from private.tournament_fixtures n
              where n.code = f.code
                and n.status <> 'removed'
                and n.result is null and n.live_result is null and n.live_code is null
              order by n.seq, n.id
              limit 1));
end;
$$;

revoke all on function public.live_tournament(text, text) from public, anon, authenticated;
-- As public.tournament_get and the live scorecard's keyed read: called by the Next server with the live write key.
grant execute on function public.live_tournament(text, text) to anon, authenticated;
comment on function public.live_tournament(text, text) is 'Live write key only: the tournament a live scorecard is a match of (its code, name and format), which match it is there (stage, place among the league matches, the two teams as the tournament names them) and the next match without a result or a scorecard. Only for a fixture not taken out, in a tournament that is on; null for anything else. Nothing about who organises it.';
