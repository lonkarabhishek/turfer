set local lock_timeout = '5s';

-- What is on at a turf right now (27 Nov 2026). The site owner: "if a
-- tournament is setup or a live match is setup on turf show that please
-- on the turf page".
--
-- A live tournament can carry a TapTurf turf as its venue: the organiser
-- picks it by name when setting the tournament up or under Manage, and it
-- is kept in private.tournaments.settings as venue {id, slug, name, area}
-- (20261102_live_tournaments.sql checks its shape). Until now only the
-- tournament's own page said so, with a link to the turf. The turf's page
-- said nothing of it. This file adds the one read the turf page needs.
--
-- A live match on its own (the Live Cricket Scorer, the Live Scoreboard)
-- has only a venue name someone typed, never a turf's id, and two turfs
-- can share a name, so it is tied to a turf only through a tournament it
-- is a fixture of (private.tournament_fixtures.live_code). A turf session
-- made from a game on a listed turf is such a tournament: the session
-- sends the game's turf as its venue (lib/turfSession/sync.ts), so it is
-- found the same way. Nothing here matches a venue by its typed text.
--
-- New, one function:
--   public.turf_events_now(p_key): jsonb
--     Gated exactly as public.tournament_get, public.tournament_host and
--     public.live_tournament: the live write key (private.live_key_ok),
--     else {r: unavailable}; execute for anon and authenticated, because
--     the key is the gate and only the Next server holds it
--     (lib/tournament/turfEvents.server.ts). Stable, security definer,
--     search_path ''.
--     It answers every turf that has something on right now, all of India
--     in one small list, so the app keeps ONE shared copy for every turf
--     page (GET /api/turf-events, a minute in the data cache and at the
--     CDN) and a turf page view is never a database read:
--       [{turf, tournaments: [{code, name, format, legs, matches,
--          playoffs, started, starts, played, total, live, next}]}]
--         turf        the turf's id (public.turfs.id), as text
--         code, name  the tournament (the page links to /tournament/<code>)
--         format      league, bilateral or tri
--         legs, matches, playoffs
--                     the three settings the tournament page words its
--                     format from ("Double round robin", "3-match series",
--                     "League + semi-finals")
--         started     India's calendar date it was put on TapTurf,
--                     YYYY-MM-DD
--         starts      the start date the organiser gave it, or null (the
--                     tournament page says "Set up", not "Started", when
--                     that is another day)
--         played      fixtures not taken out that have a result, typed or
--                     kept from a live scorecard (the tournament page's
--                     own count)
--         total       fixtures not taken out
--         live        its fixtures being scored right now, three at most,
--                     in the organiser's order: [{code, home, away}], the
--                     live scorecard's code (/live/<code>) and the two
--                     sides as the tournament names them. "Right now" is
--                     the follower page's own rule: the scorecard
--                     (public.live_matches) is live and was updated in the
--                     last 2 hours; and the fixture has no result yet, so
--                     a link kept for the next match names that match
--         next        the first match in the organiser's order with no
--                     result and no scorecard yet, exactly as
--                     public.live_tournament picks it: {stage, slot, n,
--                     home, away, day, time}, or null when there is none
--     A tournament counts when its status is on, its venue is a turf that
--     is listed (public.turfs.is_active), and it is not stale: it was
--     changed in the last 14 of India's days (the tournament page's own
--     QUIET_AFTER_DAYS, lib/tournament/about.ts), or one of its matches is
--     being scored right now. At most 3 tournaments a turf (one with a
--     match on now first, then the one changed last) and at most 200
--     turfs (the same order), so the answer stays small whatever is made.
--     A turf with nothing on is not in the list. Without anything on
--     anywhere the answer is [].
--     Never who organises it: no account id, no name, no secret's hash,
--     no network hash, and nothing from public.users or public.usernames.
--     Nothing of a tournament that was taken down, and nothing of a
--     fixture that was taken out. Everything it answers is already on the
--     tournament's own public page.
--
-- Replaced: none. public.tournament_get, public.tournament_host,
-- public.live_tournament and the live scorecard's own reads are not
-- touched. The one function this file calls is not changed here. Its md5
-- is md5(prosrc) of its latest body in the repo's migrations; production
-- was not read for this file, so compare before applying:
--   select p.proname, md5(p.prosrc) from pg_proc p
--     join pg_namespace s on s.oid = p.pronamespace
--    where s.nspname = 'private' and p.proname = 'live_key_ok';
--   private.live_key_ok              dc6dd849755acae1b79619d94e377586  20261021_accounts_usernames.sql
-- Read and left as they are: private.tournaments (code, name, format,
-- settings, status, created_at, updated_at), private.tournament_fixtures,
-- private.tournament_teams (name), public.live_matches (code, status,
-- updated_at) and public.turfs (id, is_active). No table is altered and
-- nothing is written anywhere.
-- No index is added: private.tournaments had 7 rows on 27 Nov 2026, so
-- the read is one pass over it, then each kept tournament's fixtures and
-- teams by their primary keys, its live scorecards by theirs and its turf
-- by its own. When the table grows to thousands, add
--   create index if not exists tournaments_venue_on_idx
--     on private.tournaments ((settings -> 'venue' ->> 'id'), updated_at)
--     where status = 'on' and jsonb_typeof(settings -> 'venue') = 'object';
-- and the read stays a walk over the tournaments that have a venue.
--
-- Needs 20261021_live_matches.sql, 20261021_accounts_usernames.sql and
-- 20261102_live_tournaments.sql (it refuses to run without them, changing
-- nothing). Additive: one function. Written without the destructive SQL
-- keywords and without a backslash; nothing is removed. No table, no
-- grant or policy on a table, no trigger, no job. Safe to run again.
-- The app works before this file: the read finds no function, asks again
-- only after a minute, GET /api/turf-events answers an empty list and
-- every turf page looks exactly as it did.
-- Erasing an account: nothing new is kept, so there is nothing more to
-- clear.
-- Never in a title, a description, an og tag or JSON-LD, and never in a
-- turf page's server HTML: the browser reads the list after the page has
-- loaded (components/turf/TurfEventsCard.tsx).
-- Test: scripts/sql-tests/turf_events.check.mjs (PGlite).

do $$
begin
  if to_regprocedure('private.live_key_ok(text)') is null
     or to_regclass('private.tournaments') is null
     or to_regclass('private.tournament_fixtures') is null
     or to_regclass('private.tournament_teams') is null
     or to_regclass('public.live_matches') is null
     or to_regclass('public.turfs') is null then
    raise exception 'turf_events needs 20261021_live_matches.sql, 20261021_accounts_usernames.sql and 20261102_live_tournaments.sql first';
  end if;
end;
$$;

create or replace function public.turf_events_now(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not private.live_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  return coalesce((
    with held as (
      -- Every tournament that is on at a listed turf, with its matches being scored right now.
      select t.code, t.name, t.format, t.settings, t.created_at, t.updated_at, s.id::text as turf, l.live
        from private.tournaments t
        join public.turfs s on s.id = (t.settings -> 'venue' ->> 'id')::uuid and s.is_active
       cross join lateral (
              select coalesce(jsonb_agg(jsonb_build_object('code', x.live_code, 'home', x.home, 'away', x.away) order by x.seq, x.id), '[]'::jsonb) as live
                from (select f.live_code, f.seq, f.id,
                             (select m.name from private.tournament_teams m where m.code = f.code and m.id = f.home) as home,
                             (select m.name from private.tournament_teams m where m.code = f.code and m.id = f.away) as away
                        from private.tournament_fixtures f
                        join public.live_matches c on c.code = f.live_code
                       where f.code = t.code
                         and f.status <> 'removed'
                         -- A link kept for the next match is on two fixtures: only the one still without a result is on now.
                         and f.result is null and f.live_result is null
                         and c.status = 'live' and c.updated_at > now() - interval '2 hours'
                       order by f.seq, f.id
                       limit 3) x) l
       where t.status = 'on'
         and jsonb_typeof(t.settings -> 'venue') = 'object'
    ), fresh as (
      -- Not stale: changed in the last 14 of India's days, or a match on now. Three a turf, a match on now first.
      select h.*,
             jsonb_array_length(h.live) > 0 as on_now,
             row_number() over (partition by h.turf order by (jsonb_array_length(h.live) > 0) desc, h.updated_at desc, h.code) as place
        from held h
       where v_today - (h.updated_at at time zone 'Asia/Kolkata')::date <= 14
          or jsonb_array_length(h.live) > 0
    ), turfs as (
      select k.turf,
             bool_or(k.on_now) as on_now,
             max(k.updated_at) as latest,
             jsonb_agg(jsonb_build_object(
               'code', k.code,
               'name', k.name,
               'format', k.format,
               'legs', k.settings -> 'legs',
               'matches', k.settings -> 'matches',
               'playoffs', k.settings -> 'playoffs',
               'started', to_char(k.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
               'starts', k.settings -> 'starts',
               'played', (select count(*) from private.tournament_fixtures f
                           where f.code = k.code and f.status <> 'removed' and (f.result is not null or f.live_result is not null)),
               'total', (select count(*) from private.tournament_fixtures f where f.code = k.code and f.status <> 'removed'),
               'live', k.live,
               -- The first match in the organiser's order with no result and no scorecard yet, as public.live_tournament picks it.
               'next', (select jsonb_build_object(
                                 'stage', n.stage,
                                 'slot', n.slot,
                                 'n', case when n.stage = 'league' then
                                        (select count(*) from private.tournament_fixtures g
                                          where g.code = n.code and g.status <> 'removed' and g.stage = 'league'
                                            and (g.seq, g.id) <= (n.seq, n.id)) end,
                                 'home', (select m.name from private.tournament_teams m where m.code = n.code and m.id = n.home),
                                 'away', (select m.name from private.tournament_teams m where m.code = n.code and m.id = n.away),
                                 'day', n.day,
                                 'time', n.time)
                          from private.tournament_fixtures n
                         where n.code = k.code
                           and n.status <> 'removed'
                           and n.result is null and n.live_result is null and n.live_code is null
                         order by n.seq, n.id
                         limit 1)
             ) order by k.place) as list
        from fresh k
       where k.place <= 3
       group by k.turf
       order by bool_or(k.on_now) desc, max(k.updated_at) desc, k.turf
       limit 200
    )
    select jsonb_agg(jsonb_build_object('turf', u.turf, 'tournaments', u.list) order by u.on_now desc, u.latest desc, u.turf)
      from turfs u), '[]'::jsonb);
end;
$$;

revoke all on function public.turf_events_now(text) from public, anon, authenticated;
-- As public.tournament_get: the Next server calls it with the app's anon key and the live write key (p_key); the key is the gate.
grant execute on function public.turf_events_now(text) to anon, authenticated;
comment on function public.turf_events_now(text) is 'Live write key only: every listed turf with a live tournament on right now (status on, that turf as its venue, changed in the last 14 India days or a match being scored now), 200 turfs and 3 tournaments a turf at most: each tournament''s code, name, format, India start date, matches played and in all, its matches on a live scorecard right now with the two sides, and its next match. Nothing about who organises it.';
