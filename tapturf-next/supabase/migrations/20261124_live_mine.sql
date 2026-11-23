set local lock_timeout = '5s';

-- My live matches (24 Nov 2026). The site owner, of the Me section: "In
-- the user profile show My Tournaments, My live matches etc all tools
-- related stuff before the Profile tab in Me section please. So it'll
-- Games Requests Matches (whatever suits the name here) Alerts Profile".
--
-- My tournaments already has its read (public.tournament_mine,
-- 20261102_live_tournaments.sql). Live matches do not: who turned on each
-- live link is kept in private.live_link_starts
-- (20261029_live_link_starts.sql) and has been read by the admin alone.
-- This file adds the read that gives a signed-in player their own list.
--
-- New, one function:
--   public.live_links_mine(p_key, p_user_id): jsonb
--     Gated exactly as public.tournament_mine: the account key
--     (private.account_key_ok), else {r: unavailable}; a null account
--     answers {r: bad}; execute for anon and authenticated, because the
--     key is the gate and only the Next server holds it
--     (lib/matches/server.ts, for the caller whose sign-in the server
--     verified: GET /api/live/mine). Stable, security definer,
--     search_path ''.
--     It answers {r: ok, list}: the live links that account started that
--     still show a score, the one updated last first (then by code), 30
--     at most. Each one is exactly these eleven fields:
--       code             the link (the follower page is /live/<code>)
--       tool             cricket (the Live Cricket Scorer) or board (the
--                        Live Scoreboard), as recorded when it started
--       started_at       when its starter was recorded
--       status           live or done, as public.live_matches has it. A
--                        live link with no update for 2 hours takes no
--                        more writes (20261029_live_idle_close.sql); that
--                        is worked out by the app from updated_at, as the
--                        follower page does, and never stored
--       updated_at       its last accepted update
--       sport            a board's sport (football, badminton, ...), cut
--                        to 24; null for a cricket match
--       team_a, team_b   the two sides as the scorer typed them at the
--                        start (match.setup.teamA and teamB), cut to 40
--       title            the match's title if it has one (match.setup
--                        .title), cut to 60
--       tournament       the code of the tournament this link is a
--                        fixture of, and
--       tournament_name  its name; both null unless the fixture is not
--                        taken out and its tournament is on. A link on
--                        two fixtures (the scorer kept it for the next
--                        match) names the one still without a result,
--                        then the one changed last: the same pick as
--                        public.live_tournament (20261123_tournament_host.sql)
--     From the match only those four values are read (kind, sport, and
--     the setup's teamA, teamB and title): never the whole match, its
--     players, its balls or its venue. Never the link's secret hash, the
--     network hash, the stop markers, the write count, how the account
--     signed in, or anything of another account: every row is one whose
--     private.live_link_starts.user_id is p_user_id.
--     A cleared link is left out: one the scorer turned off (stopped) or
--     that expired 30 days after its last update has no match any more,
--     so there is nothing to name and its page shows no score. So is a
--     link whose row is gone. The match itself, where this phone scored
--     it, is still on that phone and the Me tab lists it from there.
--     The score line is not a field of the match: it is worked out from
--     the ball by ball list, in the app. The server works it out for the
--     newest few from the read followers already share
--     (public.live_match_get_k, unchanged) and sends the browser only the
--     line.
--
-- Replaced: none. public.tournament_mine, public.live_tournament, the
-- live scorecard's reads and writes and the admin's lists are not
-- touched. The one function this file calls is not changed here. Its md5
-- is md5(prosrc) of its latest body in the repo's migrations; production
-- was not read for this file, so compare before applying:
--   select p.proname, md5(p.prosrc) from pg_proc p
--     join pg_namespace s on s.oid = p.pronamespace
--    where s.nspname = 'private' and p.proname = 'account_key_ok';
--   private.account_key_ok           ca605fa89a97497134b690e753dc5c0e  20261021_accounts_usernames.sql
-- Read and left as they are: private.live_link_starts (code, user_id,
-- tool, started_at), public.live_matches (code, status, updated_at and
-- the four values of match above), private.tournament_fixtures and
-- private.tournaments (code, name, status). No table is altered, nothing
-- is written anywhere, and no index is added: the account's links are
-- found by live_link_starts_user (user_id), each link's row by
-- public.live_matches' primary key, and its fixture by
-- tournament_fixtures_live_idx (live_code, where it is not null).
--
-- Needs 20261021_accounts_usernames.sql, 20261021_live_matches.sql,
-- 20261029_live_link_starts.sql and 20261102_live_tournaments.sql (it
-- refuses to run without them, changing nothing). Additive: one function.
-- Written without the destructive SQL keywords; nothing is removed. No
-- table, no grant or policy on a table, no trigger, no job. Safe to run
-- again.
-- The app works before this file: the read finds no function, the Me
-- tab's Matches shows no list from the server (the matches on the phone,
-- the tournaments and the tools are all still there) and nothing fails.
-- Erasing an account: nothing new is kept, so there is nothing more to
-- clear. private.live_link_starts is cleared by hand as its own file says,
-- and then this read answers an empty list for that account.
-- Shown to nobody but the signed-in player themselves: never on a public
-- page, in a title, a description, an og tag or JSON-LD.
-- Test: scripts/sql-tests/live_mine.check.mjs (PGlite).

do $$
begin
  if to_regprocedure('private.account_key_ok(text)') is null
     or to_regclass('public.live_matches') is null
     or to_regclass('private.live_link_starts') is null
     or to_regclass('private.tournaments') is null
     or to_regclass('private.tournament_fixtures') is null then
    raise exception 'live_mine needs 20261021_accounts_usernames.sql, 20261021_live_matches.sql, 20261029_live_link_starts.sql and 20261102_live_tournaments.sql first';
  end if;
end;
$$;

create or replace function public.live_links_mine(p_key text, p_user_id uuid)
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
  return jsonb_build_object('r', 'ok', 'list', coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc, x.code)
      from (
        select s.code,
               s.tool,
               s.started_at,
               m.status,
               m.updated_at,
               -- Only these four values of the match are read: what it is and the two sides.
               case when m.match ->> 'kind' = 'board' then left(m.match ->> 'sport', 24) end as sport,
               left(m.match -> 'setup' ->> 'teamA', 40) as team_a,
               left(m.match -> 'setup' ->> 'teamB', 40) as team_b,
               left(m.match -> 'setup' ->> 'title', 60) as title,
               t.code as tournament,
               t.name as tournament_name
          from private.live_link_starts s
          -- A link whose row is gone, or whose match was cleared (turned off, or expired), is left out.
          join public.live_matches m on m.code = s.code
                                    and m.status in ('live', 'done')
                                    and jsonb_typeof(m.match) = 'object'
          -- The tournament this link is a fixture of: not taken out, in a tournament that is on. The same pick as
          -- public.live_tournament: the match still without a result first, then the one changed last.
          left join lateral (
            select y.code, y.name
              from private.tournament_fixtures f
              join private.tournaments y on y.code = f.code and y.status = 'on'
             where f.live_code = s.code
               and f.status <> 'removed'
             order by (f.result is null and f.live_result is null) desc, f.updated_at desc, f.code, f.id
             limit 1) t on true
         where s.user_id = p_user_id
         order by m.updated_at desc, s.code
         limit 30) x), '[]'::jsonb));
end;
$$;

revoke all on function public.live_links_mine(text, uuid) from public, anon, authenticated;
-- As public.tournament_mine: the Next server calls it with the app's anon key and the account key (p_key); the key is the gate.
grant execute on function public.live_links_mine(text, uuid) to anon, authenticated;
comment on function public.live_links_mine(text, uuid) is 'Account key only: the live links this account started that still show a score (live or done, match not cleared), the one updated last first, 30 at most: code, tool, started_at, status, updated_at, a board''s sport, the two sides and the title as typed at the start, and the code and name of the tournament it is a fixture of when that fixture is not taken out and the tournament is on. Never the whole match, a secret or network hash, or another account''s link.';
