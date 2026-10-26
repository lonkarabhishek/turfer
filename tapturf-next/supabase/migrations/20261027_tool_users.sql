-- Who used the free tools, and what they used, for the admin.
--
-- 20261026_tool_uses.sql counts the tools' uses per day and nothing
-- about who, so the site owner could see that 12 tosses were flipped but
-- not by whom. From this file on, every use is also kept as one row:
--
-- 1. private.tool_use_log: when, the tool, the event (started or
--    finished), a short tag of what was used (a Live Scoreboard's sport,
--    a match's overs and players a side, a tournament's format and
--    matches, a team split's players and teams; up to 4 short slugs, never
--    typed text), the live link's code when the match had one (so the
--    owner can open /live/<code>), who, and the visitor's city. Who is
--    the TapTurf account when the browser sent a sign-in the server
--    verified (lib/account/toolRoutes.ts: the bearer token checked as on
--    every account route, then the account it opens, never one made for
--    it), else an anonymous device tag: a random id the browser keeps for
--    this, no personal data, started over on every sign-in and sign-out
--    (lib/analytics/tools.ts) and never sent with a signed-in use. Never
--    both. A live link's code is kept only with an account (a live link
--    needs a sign-in), so no guest row shares a link with an account's.
--    The city is the place the internet connection points to (Vercel's IP
--    headers, as the sign-up city note uses), else the city the visitor
--    picked on TapTurf. Never the IP address itself.
-- 2. public.tool_use_record (server key only): one use, in one round
--    trip: it bumps private.tool_uses exactly as tool_use_count does (the
--    admin tiles keep working) and adds the log row. Checks the tool, the
--    event and every tag the way tool_use_count does; a bad tag, code,
--    device tag or unknown account is left out, the use still counts.
--    /api/tools/use calls it behind the same per-network limit.
-- 3. public.admin_tool_users (site owner only): the people who used the
--    tools, newest first, at most p_limit (300, never over 1000, under
--    the API's row cap) in one read: optionally only those who used one
--    tool, and signed in or guests only. One row per person: the account's
--    name and username, the latest city, first and last use, and the tools
--    as a list (uses started and finished, first and last use, the latest
--    distinct tags and live link codes).
-- 4. public.admin_tool_counts (site owner only): how many people (signed
--    in and guests) used each tool and every tool, and their uses, for the
--    page's filters and totals.
-- 5. public.admin_tool_activity (site owner only): the latest uses,
--    newest first, optionally for one tool and signed in or guest only.
-- The reads show a live link's code only while it names a link in
-- public.live_matches (a code is as the browser sent it, and the row is
-- made by the link's first write, which can land after the use).
--
-- Additive: one table in the private schema, three indexes and new
-- functions; tool_use_count stays for instances still on the old code.
-- Written without the destructive SQL keywords. Safe to run again.

create table if not exists private.tool_use_log (
  id bigint generated always as identity primary key,
  used_at timestamptz not null default now(),
  tool text not null,
  event text not null check (event in ('started', 'finished')),
  -- Up to 4 short slugs, space separated, else ''.
  detail text not null default '' check (detail ~ '^([a-z0-9_-]{1,24}( [a-z0-9_-]{1,24}){0,3})?$'),
  -- A live link's code (lib/live/types.ts LIVE_CODE_RE).
  code text check (code is null or code ~ '^[a-z0-9]{12}$'),
  -- The verified account, or else the browser's random device tag.
  user_id uuid,
  device text check (device is null or device ~ '^[a-z0-9]{8,32}$'),
  -- A place name as Vercel gives it (with the country when not India), or a curated city's label.
  city text check (city is null or length(city) <= 60),
  check (user_id is null or device is null)
);
revoke all on private.tool_use_log from public, anon, authenticated;
create index if not exists tool_use_log_used_at on private.tool_use_log (used_at desc, id desc);
create index if not exists tool_use_log_tool on private.tool_use_log (tool, used_at desc);
create index if not exists tool_use_log_user on private.tool_use_log (user_id, used_at desc) where user_id is not null;

create or replace function public.tool_use_record(
  p_key text,
  p_tool text,
  p_event text,
  p_detail text default null,
  p_tags text default null,
  p_code text default null,
  p_user_id uuid default null,
  p_device text default null,
  p_city text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day constant date := (now() at time zone 'Asia/Kolkata')::date;
  v_detail text := coalesce(p_detail, '');
  v_tags text := coalesce(p_tags, '');
  v_code text;
  v_user uuid;
  v_device text;
  v_city text := left(nullif(btrim(regexp_replace(coalesce(p_city, ''), '[[:cntrl:]]', '', 'g')), ''), 60);
begin
  if not private.account_key_ok(p_key) then
    return false;
  end if;
  if p_tool is null or p_tool not in ('live_scorer', 'live_scoreboard', 'scorecard_maker', 'tournament_scorer', 'toss', 'nrr_calculator', 'team_generator')
     or p_event is null or p_event not in ('started', 'finished') then
    return false;
  end if;
  -- The count's tag, as tool_use_count reads it.
  if v_detail !~ '^[a-z0-9_-]{0,24}$' then
    v_detail := '';
  end if;
  if v_tags !~ '^([a-z0-9_-]{1,24}( [a-z0-9_-]{1,24}){0,3})?$' then
    v_tags := '';
  end if;
  -- Only an account that exists; the server passes one it just resolved.
  if p_user_id is not null then
    select u.id into v_user from public.users u where u.id = p_user_id;
  end if;
  -- A live link's code only with that account (a live link needs a sign-in): a guest's row never carries one,
  -- so no device tag is tied to an account through a shared link.
  if v_user is not null and p_tool in ('live_scorer', 'live_scoreboard') and p_code ~ '^[a-z0-9]{12}$' then
    v_code := p_code;
  end if;
  if v_user is null and p_device ~ '^[a-z0-9]{8,32}$' then
    v_device := p_device;
  end if;

  insert into private.tool_uses as t (day, tool, event, detail, n) values (v_day, p_tool, p_event, v_detail, 1)
  on conflict (day, tool, event, detail) do update set n = t.n + 1;
  insert into private.tool_use_log (tool, event, detail, code, user_id, device, city)
  values (p_tool, p_event, v_tags, v_code, v_user, v_device, v_city);
  return true;
end;
$$;
revoke all on function public.tool_use_record(text, text, text, text, text, text, uuid, text, text) from public;
grant execute on function public.tool_use_record(text, text, text, text, text, text, uuid, text, text) to anon, authenticated;


create or replace function public.admin_tool_users(
  p_firebase_token text default null,
  p_tool text default null,
  p_who text default null,
  p_limit integer default 300
)
returns table (
  user_id uuid,
  device text,
  name text,
  username text,
  city text,
  first_at timestamptz,
  last_at timestamptz,
  tools jsonb
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
  with l as (
    -- One key per person: the account, else the device tag ('-' for guests whose browser keeps none).
    -- signed: accounts only; guest: none; anything else: everyone.
    select t.user_id, t.device, t.tool, t.event, t.detail, t.code, t.city, t.used_at,
           coalesce('u:' || t.user_id::text, 'd:' || t.device, '-') as who
      from private.tool_use_log t
     where (p_who is distinct from 'signed' or t.user_id is not null)
       and (p_who is distinct from 'guest' or t.user_id is null)
  ),
  p as (
    -- The newest people (with a tool: the newest to use it), at most p_limit, under the API's row cap.
    select l.who
      from l
     where p_tool is null or l.tool = p_tool
     group by l.who
     order by max(l.used_at) desc, l.who
     limit greatest(1, least(coalesce(p_limit, 300), 1000))
  ),
  k as (
    select l.* from l join p on p.who = l.who
  ),
  g as (
    select k.who, k.tool,
           (count(*) filter (where k.event = 'started'))::integer as n_started,
           (count(*) filter (where k.event = 'finished'))::integer as n_finished,
           min(k.used_at) as first_used,
           max(k.used_at) as last_used
      from k
     group by k.who, k.tool
  ),
  d as (
    select x.who, x.tool, (array_agg(x.detail order by x.seen desc, x.detail))[1:4] as tags
      from (select k.who, k.tool, k.detail, max(k.used_at) as seen from k where k.detail <> '' group by k.who, k.tool, k.detail) x
     group by x.who, x.tool
  ),
  c as (
    -- Only codes that name a link (see the note at the top).
    select x.who, x.tool, (array_agg(x.code order by x.seen desc, x.code))[1:5] as links
      from (select k.who, k.tool, k.code, max(k.used_at) as seen
              from k
             where k.code is not null and exists (select 1 from public.live_matches m where m.code = k.code)
             group by k.who, k.tool, k.code) x
     group by x.who, x.tool
  ),
  tl as (
    select g.who,
           jsonb_agg(jsonb_build_object(
             'tool', g.tool, 'started', g.n_started, 'finished', g.n_finished, 'first_at', g.first_used, 'last_at', g.last_used,
             'details', to_jsonb(coalesce(d.tags, '{}'::text[])), 'codes', to_jsonb(coalesce(c.links, '{}'::text[]))
           ) order by g.last_used desc, g.tool) as list
      from g
      left join d on d.who = g.who and d.tool = g.tool
      left join c on c.who = g.who and c.tool = g.tool
     group by g.who
  ),
  pe as (
    select k.who, k.user_id, k.device,
           min(k.used_at) as first_used,
           max(k.used_at) as last_used,
           (array_agg(k.city order by k.used_at desc) filter (where k.city is not null))[1] as last_city
      from k
     group by k.who, k.user_id, k.device
  )
  -- users.name is character varying: cast, as the other admin reads do.
  select pe.user_id, pe.device, u.name::text, n.username::text, pe.last_city, pe.first_used, pe.last_used, tl.list
    from pe
    join tl on tl.who = pe.who
    left join public.users u on u.id = pe.user_id
    left join public.usernames n on n.user_id = pe.user_id
   order by pe.last_used desc, pe.who;
end;
$$;
revoke all on function public.admin_tool_users(text, text, text, integer) from public;
grant execute on function public.admin_tool_users(text, text, text, integer) to anon, authenticated;

create or replace function public.admin_tool_counts(
  p_firebase_token text default null,
  p_who text default null
)
returns table (
  tool text,
  signed integer,
  guests integer,
  uses integer
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
  with g as (
    -- One row per person and tool; a use is a start, or a finish when none started (a match started before the log).
    select coalesce('u:' || t.user_id::text, 'd:' || t.device, '-') as who,
           t.user_id is not null as is_signed,
           t.tool as t_tool,
           count(*) filter (where t.event = 'started') as n_started,
           count(*) filter (where t.event = 'finished') as n_finished
      from private.tool_use_log t
     where (p_who is distinct from 'signed' or t.user_id is not null)
       and (p_who is distinct from 'guest' or t.user_id is null)
     group by 1, 2, 3
  )
  -- One row per tool, and one with no tool for every tool.
  select g.t_tool,
         (count(distinct g.who) filter (where g.is_signed))::integer,
         (count(distinct g.who) filter (where not g.is_signed))::integer,
         coalesce(sum(case when g.n_started > 0 then g.n_started else g.n_finished end), 0)::integer
    from g
   group by grouping sets ((g.t_tool), ())
   order by g.t_tool nulls first;
end;
$$;
revoke all on function public.admin_tool_counts(text, text) from public;
grant execute on function public.admin_tool_counts(text, text) to anon, authenticated;

create or replace function public.admin_tool_activity(
  p_firebase_token text default null,
  p_tool text default null,
  p_who text default null,
  p_limit integer default 200
)
returns table (
  used_at timestamptz,
  tool text,
  event text,
  detail text,
  code text,
  user_id uuid,
  device text,
  city text,
  name text,
  username text
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
  select l.used_at, l.tool, l.event, l.detail,
         -- Only a code that names a link (see the note at the top).
         case when l.code is not null and exists (select 1 from public.live_matches m where m.code = l.code) then l.code end,
         l.user_id, l.device, l.city,
         -- users.name is character varying: cast, as the other admin reads do.
         u.name::text, n.username::text
    from private.tool_use_log l
    left join public.users u on u.id = l.user_id
    left join public.usernames n on n.user_id = l.user_id
   where (p_tool is null or l.tool = p_tool)
     -- signed: an account; guest: none; anything else: everyone.
     and (p_who is distinct from 'signed' or l.user_id is not null)
     and (p_who is distinct from 'guest' or l.user_id is null)
   order by l.used_at desc, l.id desc
   limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;
revoke all on function public.admin_tool_activity(text, text, text, integer) from public;
grant execute on function public.admin_tool_activity(text, text, text, integer) to anon, authenticated;
