-- Admin: every live scoreboard link, for the list behind the dashboard's
-- "Live scoreboards shared" tile (/admin/live).
--
-- One row per link: its code (the page is /live/<code>), status, the
-- sport (cricket for the Live Cricket Scorer, else the Live Scoreboard's
-- sport), the names, title and venue the scorer typed, how many events
-- the match holds, the accepted writes, and when it started and last
-- changed. A stopped or expired link no longer holds its match (it is
-- cleared then), so only its code, status and times are left. Nothing
-- about who scored it: the secret and network hashes are never read.
--
-- Site owner only. Additive: one new function. Safe to run again.

create or replace function public.admin_live_links(p_firebase_token text default null)
returns table (
  code text,
  status text,
  sport text,
  team_a text,
  team_b text,
  title text,
  venue text,
  events integer,
  writes integer,
  created_at timestamptz,
  updated_at timestamptz
)
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
  select m.code,
         m.status,
         case when jsonb_typeof(m.match) is distinct from 'object' then null
              when m.match ->> 'kind' = 'board' then left(m.match ->> 'sport', 24)
              else 'cricket' end,
         left(m.match -> 'setup' ->> 'teamA', 40),
         left(m.match -> 'setup' ->> 'teamB', 40),
         left(m.match -> 'setup' ->> 'title', 60),
         left(m.match -> 'setup' ->> 'venue', 60),
         case when jsonb_typeof(m.match -> 'events') = 'array' then jsonb_array_length(m.match -> 'events') else 0 end,
         m.writes,
         m.created_at,
         m.updated_at
    from public.live_matches m
   order by m.created_at desc, m.code;
end;
$$;
revoke all on function public.admin_live_links(text) from public;
grant execute on function public.admin_live_links(text) to anon, authenticated;
