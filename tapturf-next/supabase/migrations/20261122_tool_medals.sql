set local lock_timeout = '5s';

-- Medals for using the free tools (20 Nov 2026). The site owner: "if not
-- already please give medals for using tools, scorecards etc etc". There
-- were none: every medal was for games played or hosted, turfs, cities,
-- sports, reviews and the weekly streak.
--
-- Medals are worked out in the app (lib/profile/medals.ts,
-- lib/profile/passport.ts), never in SQL, and that stays so. Every use of
-- a free tool is already kept, one row each, in private.tool_use_log
-- (20261027_tool_users.sql): when, the tool, started or finished, and who.
-- Who is the TapTurf account only when the browser sent a sign-in the
-- server verified; a guest's row has no account at all (an anonymous
-- device tag, or nothing). So a tool medal can only ever come from a use
-- made while signed in, and the app says so on each locked one.
--
-- This file adds the one read the app needs, and nothing else:
--
--   public.tool_uses_of(p_key, p_user_id): server key only
--     (private.account_key_ok, as played_with_extras). For that one
--     account, from its own rows of private.tool_use_log (user_id =
--     p_user_id; a guest's row has user_id null and can never match):
--       {r: ok,
--        tools: [{t, first, days: [[day, n], ...]}, ...],
--        live:  [day, ...]}
--     tools: one entry per tool the account has used, in the tool's name
--       order. t the tool (live_scorer, live_scoreboard, scorecard_maker,
--       tournament_scorer, toss, nrr_calculator, team_generator, as
--       tool_use_record writes them); first the day of its first use of
--       any kind, started or finished; days each day with a finished use,
--       oldest first, with how many were finished on it (n, 999 at most).
--       At most the first 100 such days per tool, and at most 20 tools.
--     live: for each live link (the log's code, kept only with an
--       account and only for the two scoring tools) that a finished use
--       carried, the day of the first such use, oldest first. One per
--       link, at most the first 20. A match scored to its end with its
--       live link on.
--     Every day is India's date of the use (Asia/Kolkata), as text
--     (YYYY-MM-DD), as every other medal's day is.
--     At most the account's first 5000 rows are read (oldest first), so
--     one account can never make the read unbounded; that is far past
--     any medal's goal.
--     {r: bad} with no account id; {r: unavailable} without the key. An
--     account with no use, or an id that is no account, is {r: ok} with
--     both lists empty: it tells nothing about whether the account exists.
--     Nothing but days and counts leaves it: no tag, no code, no city, no
--     device tag, no time of day, and nothing of anyone else's.
--
-- Where it is read: wherever the app reads a player's history for the
-- passport (lib/profile/server.ts readHistory, beside the games and
-- reviews reads): the Me tab's Passport, the played summary, the public
-- profile and the medals' story picture, which show only the medals earned.
--
-- Replaced: none. The one function this file calls is not changed here;
-- its md5(prosrc) is that of its latest body in the repo, which is what
-- production ran when 20261118_slot_asks.sql read pg_proc on 18 Nov 2026
-- (production was not read again for this file):
--   private.account_key_ok           ca605fa89a97497134b690e753dc5c0e  20261021_accounts_usernames.sql
-- Read and left as it is: private.tool_use_log. No existing table is
-- altered, nothing is written anywhere, and no index is added: the read
-- is by account, which tool_use_log_user (user_id, used_at desc) where
-- user_id is not null already serves.
--
-- Needs 20261021_accounts_usernames.sql and 20261027_tool_users.sql (it
-- refuses to run without them, changing nothing). Additive: one function.
-- Written without the destructive SQL keywords; nothing is removed. No
-- table, no grant or policy on a table, no trigger, no job. Safe to run
-- again.
-- The app works before this file: the read finds no function, the tool
-- medals stay locked at zero and nothing fails; every other medal, number
-- and page is exactly as it was.
-- Erasing an account: nothing new is kept, so there is nothing more to
-- clear; the log's rows go with the account as 20261027_tool_users.sql
-- says, and its tool medals go with them.
-- Test: scripts/sql-tests/tool_medals.check.mjs (PGlite).

do $$
begin
  if to_regprocedure('private.account_key_ok(text)') is null
     or to_regclass('private.tool_use_log') is null then
    raise exception 'tool_medals needs 20261021_accounts_usernames.sql and 20261027_tool_users.sql first';
  end if;
end;
$$;

create or replace function public.tool_uses_of(p_key text, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tools jsonb;
  v_live jsonb;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null then
    return jsonb_build_object('r', 'bad');
  end if;

  with l as (
    -- This account's own uses, oldest first, 5000 at most. A guest's row has no account and is never here.
    select t.tool, t.event, t.code, (t.used_at at time zone 'Asia/Kolkata')::date as day
      from private.tool_use_log t
     where t.user_id = p_user_id
     order by t.used_at, t.id
     limit 5000
  ),
  f as (
    -- Each tool's first use of any kind; 20 tools at most (the log has 7).
    select l.tool, min(l.day) as first_day
      from l
     group by l.tool
     order by l.tool
     limit 20
  ),
  d as (
    -- Finished uses per tool and India day, numbered oldest first.
    select x.tool, x.day, x.n, row_number() over (partition by x.tool order by x.day) as i
      from (select l.tool, l.day, count(*) as n from l where l.event = 'finished' group by l.tool, l.day) x
  ),
  c as (
    -- Each live link a finished use carried, at the day of the first such use.
    select min(l.day) as day
      from l
     where l.event = 'finished' and l.code is not null and l.tool in ('live_scorer', 'live_scoreboard')
     group by l.code
     order by 1
     limit 20
  )
  select coalesce((select jsonb_agg(jsonb_build_object(
                            't', f.tool,
                            'first', to_char(f.first_day, 'YYYY-MM-DD'),
                            'days', coalesce((select jsonb_agg(jsonb_build_array(to_char(d.day, 'YYYY-MM-DD'), least(d.n, 999)) order by d.day)
                                                from d
                                               where d.tool = f.tool and d.i <= 100), '[]'::jsonb)
                          ) order by f.tool)
                     from f), '[]'::jsonb),
         coalesce((select jsonb_agg(to_char(c.day, 'YYYY-MM-DD') order by c.day) from c), '[]'::jsonb)
    into v_tools, v_live;

  return jsonb_build_object('r', 'ok', 'tools', v_tools, 'live', v_live);
end;
$$;

revoke all on function public.tool_uses_of(text, uuid) from public, anon, authenticated;
-- The passport's server reads it with the app's anon key and the server key (p_key), as played_with_extras; the key is the gate.
grant execute on function public.tool_uses_of(text, uuid) to anon;
comment on function public.tool_uses_of(text, uuid) is 'Server key only: one account''s own signed-in uses of the free tools, for the tool medals (lib/profile/medals.ts): per tool the India day of its first use and how many uses were finished on each day (first 100 days), and the day each live link was first scored to an end (first 20). Days and counts only; a guest''s use has no account and is never counted.';
