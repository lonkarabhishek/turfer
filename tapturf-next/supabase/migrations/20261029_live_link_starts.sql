-- Who turned on each live link, for the admin.
--
-- The scorer has asked for a login before turning on a live link since
-- 21 Oct, but only the page checked it and nothing kept who it was: on
-- 29 Oct /live/w1znilk3wn16 was live and nobody could say whose it was.
-- From the deploy that goes with this file the server checks it too:
-- PUT /api/live/<code> takes a write only with a sign-in it verifies
-- (lib/live/gate.ts), and the first write it takes with one records the
-- account here.
--
-- 1. private.live_link_starts: one row per link, the first one stays: the
--    code, the account, the tool (cricket: the Live Cricket Scorer;
--    board: the Live Scoreboard), how the account signed in (google or
--    phone) and when it was recorded. Nothing else: never the link's
--    secret, a device tag or the network hash. A link from before the
--    deploy (no sign-in was checked) gets its row when a signed-in write
--    first reaches it, from the browser that holds the link's secret.
-- 2. public.live_link_start_record (live write key only): adds that row,
--    only for a link that has taken a write and an account that exists.
--    'ok' (recorded), 'known' (it has one already: the first stays),
--    'bad', 'unavailable' (a wrong key).
-- 3. public.live_link_starter_known (live write key only): 'known' or
--    'none'. The route asks only while it cannot check sign-ins at all
--    (Firebase or Supabase down): a link with a recorded starter keeps
--    taking writes with its secret, a new one waits until checks work.
-- 4. public.live_link_created (live write key only): a link's status, when
--    its row was made and when its starter was recorded (null: none). The
--    route asks only for a write with no valid sign-in on a link with an
--    old code: a row whose starter came with the write that made it was
--    made by the server that checks sign-ins (no server before it recorded
--    one), so the grace for links already running at the deploy never
--    covers an old code started since with a single login.
-- 5. public.admin_live_links2 (site owner only): every column of
--    admin_live_links, then who started the link: their account id, name,
--    username, sign-in method and when it was recorded (null for a link
--    with no row here). p_min_writes leaves out links with fewer writes
--    (1: no stop markers, for the admin home's latest link).
--    admin_live_links stays as it is for instances still on the old code
--    (a function's columns cannot change in place).
--
-- The app works before this file is applied: recording fails quietly and
-- the admin says "Not recorded"; the login check does not depend on it
-- (a running link with an old code goes on with its secret alone, as it
-- would right after the deploy).
--
-- Erasing an account: user_id has no foreign key, like the other private
-- per-user tables (private.tool_use_log, private.user_cities). On an
-- erasure request clear this table's rows for the account's id by hand
-- along with its other rows (live_link_starts_user finds them).
--
-- Additive: one table in the private schema, an index and new functions;
-- live_match_put and live_match_stop are not touched. Written without the
-- destructive SQL keywords. Safe to run again.

create table if not exists private.live_link_starts (
  code text primary key check (code ~ '^[a-z0-9]{12}$'),
  user_id uuid not null,
  tool text not null check (tool in ('cricket', 'board')),
  method text not null check (method in ('google', 'phone')),
  started_at timestamptz not null default now()
);
revoke all on private.live_link_starts from public, anon, authenticated;
create index if not exists live_link_starts_user on private.live_link_starts (user_id);

-- The server calls this after live_match_put answered ok for a write with
-- a verified sign-in, at most once per link per instance.
create or replace function public.live_link_start_record(p_key text, p_code text, p_user_id uuid, p_tool text, p_method text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.live_key_ok(p_key) then
    return 'unavailable';
  end if;
  if p_code is null or p_code !~ '^[a-z0-9]{12}$'
     or p_user_id is null
     or p_tool is null or p_tool not in ('cricket', 'board')
     or p_method is null or p_method not in ('google', 'phone') then
    return 'bad';
  end if;
  -- Only a link that took a write (a stop marker took none), and an account that exists.
  if not exists (select 1 from public.live_matches m where m.code = p_code and m.writes > 0)
     or not exists (select 1 from public.users u where u.id = p_user_id) then
    return 'bad';
  end if;
  insert into private.live_link_starts (code, user_id, tool, method)
  values (p_code, p_user_id, p_tool, p_method)
  on conflict (code) do nothing;
  if found then
    return 'ok';
  end if;
  return 'known';
end;
$$;

create or replace function public.live_link_starter_known(p_key text, p_code text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.live_key_ok(p_key) then
    return 'unavailable';
  end if;
  if p_code is null or p_code !~ '^[a-z0-9]{12}$' then
    return 'bad';
  end if;
  if exists (select 1 from private.live_link_starts s where s.code = p_code) then
    return 'known';
  end if;
  return 'none';
end;
$$;

-- The app compares the two (lib/live/gate.ts legacyRead): a starter
-- recorded within a minute of the row being made came with the write that
-- made it. live_match_put sets a row's created_at at its first write, over
-- a stop marker too.
create or replace function public.live_link_created(p_key text, p_code text)
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
             'status', m.status,
             'created_at', m.created_at,
             'started_at', s.started_at)
      from public.live_matches m
      left join private.live_link_starts s on s.code = m.code
     where m.code = p_code);
end;
$$;

-- Callable with the anon key; the write key check inside is the gate, as for live_match_put.
revoke all on function public.live_link_start_record(text, text, uuid, text, text) from public;
revoke all on function public.live_link_starter_known(text, text) from public;
revoke all on function public.live_link_created(text, text) from public;
grant execute on function public.live_link_start_record(text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.live_link_starter_known(text, text) to anon, authenticated;
grant execute on function public.live_link_created(text, text) to anon, authenticated;

-- admin_live_links (20261026_admin_live_links.sql) with the starter after
-- its own columns. The name is the account's as it is now, cut to 60.
create or replace function public.admin_live_links2(p_firebase_token text default null, p_min_writes integer default 0)
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
  updated_at timestamptz,
  starter_id uuid,
  starter_name text,
  starter_username text,
  starter_method text,
  started_at timestamptz
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
         m.updated_at,
         s.user_id,
         left(u.name::text, 60),
         un.username,
         s.method,
         s.started_at
    from public.live_matches m
    left join private.live_link_starts s on s.code = m.code
    left join public.users u on u.id = s.user_id
    left join public.usernames un on un.user_id = s.user_id
   where m.writes >= coalesce(p_min_writes, 0)
   order by m.created_at desc, m.code;
end;
$$;
revoke all on function public.admin_live_links2(text, integer) from public;
grant execute on function public.admin_live_links2(text, integer) to anon, authenticated;
