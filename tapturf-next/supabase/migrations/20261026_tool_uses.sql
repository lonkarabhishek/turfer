-- How much the free tools are used, for the admin.
--
-- The tools report to Google Analytics only, so the admin couldn't say
-- how many scorecards were kept or tosses flipped. Live scoreboard links
-- are in public.live_matches, but a match scored on one phone and never
-- shared leaves nothing. This counts uses per day, nothing about who:
--
-- 1. private.tool_uses: (day in India, tool, event, detail) -> n.
--    event is started (a match started, a toss called, a calculation
--    run) or finished (a match ended, a result shown). detail is a short
--    tag such as a Live Scoreboard's sport, else ''.
-- 2. public.tool_use_count (server key only): one use. /api/tools/use
--    calls it for the tools' own started and finished events, behind a
--    per-network limit.
-- 3. public.admin_tool_uses (site owner only): every row.
-- 4. public.admin_live_matches (site owner only): live scoreboard links
--    per day and status. The match itself is never read.
--
-- Additive: one table in the private schema and new functions. Written
-- without the destructive SQL keywords. Safe to run again.

create table if not exists private.tool_uses (
  day date not null,
  tool text not null,
  event text not null,
  detail text not null default '',
  n integer not null default 0,
  primary key (day, tool, event, detail)
);
revoke all on private.tool_uses from public, anon, authenticated;

create or replace function public.tool_use_count(p_key text, p_tool text, p_event text, p_detail text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day constant date := (now() at time zone 'Asia/Kolkata')::date;
  v_detail text := coalesce(p_detail, '');
begin
  if not private.account_key_ok(p_key) then
    return false;
  end if;
  if p_tool is null or p_tool not in ('live_scorer', 'live_scoreboard', 'scorecard_maker', 'tournament_scorer', 'toss', 'nrr_calculator', 'team_generator')
     or p_event is null or p_event not in ('started', 'finished') then
    return false;
  end if;
  if v_detail !~ '^[a-z0-9_-]{0,24}$' then
    v_detail := '';
  end if;
  insert into private.tool_uses as t (day, tool, event, detail, n) values (v_day, p_tool, p_event, v_detail, 1)
  on conflict (day, tool, event, detail) do update set n = t.n + 1;
  return true;
end;
$$;
revoke all on function public.tool_use_count(text, text, text, text) from public;
grant execute on function public.tool_use_count(text, text, text, text) to anon, authenticated;

create or replace function public.admin_tool_uses(p_firebase_token text default null)
returns table (day date, tool text, event text, detail text, n integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query select t.day, t.tool, t.event, t.detail, t.n from private.tool_uses t order by t.day, t.tool, t.event, t.detail;
end;
$$;
revoke all on function public.admin_tool_uses(text) from public;
grant execute on function public.admin_tool_uses(text) to anon, authenticated;

create or replace function public.admin_live_matches(p_firebase_token text default null)
returns table (day date, status text, n integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select (m.created_at at time zone 'Asia/Kolkata')::date, m.status, count(*)::integer
    from public.live_matches m
   group by 1, 2
   order by 1, 2;
end;
$$;
revoke all on function public.admin_live_matches(text) from public;
grant execute on function public.admin_live_matches(text) to anon, authenticated;
