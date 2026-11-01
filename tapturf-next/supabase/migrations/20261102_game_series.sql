-- Repeat games. The site owner asked for "an option to create repeat
-- games", the host choosing how, "just like how google calendar let us
-- choose". In the create flow the host picks, for one game:
--   * weekly on one or more weekdays (Tue and Thu), every 1 to 4 weeks
--     (2 is every other week); the first game is the first of those days
--     on or after the first day, and the weeks count from its week
--     (Monday first);
--   * monthly on the same date (the 14th; a 29th, 30th or 31st is the
--     month's last day in shorter months), or on the nth weekday of the
--     first day (the first Sunday, the last Saturday);
--   * ending never (up to a year from the first day), on a date (within
--     that year), or after 2 to 52 games.
-- lib/games/repeat.ts does the same maths for the create flow's preview;
-- both are checked against the same cases (lib/games/repeat.cases.json,
-- npm run test:games and scripts/sql-tests/game_series.check.mjs). This
-- file is what makes the games.
--
-- A series is a row in private.game_series (the host, the turf, the game
-- fields, the rule and the end). Its games are ordinary public.games
-- rows, each made with game_create's own steps (the host's name and photo
-- from the account, status open, 1 player, the host its first player)
-- and a link back (games.series_id), so every page, the lineup, joining
-- and the host's edit sheet work on each one as on any game. Players join
-- each game on its own. The days made so far are kept in
-- private.game_series_dates, so a day is never made twice, even when the
-- host moves or cancels its game.
--
-- Games go up ahead, not all at once: every day of the next 4 weeks
-- (today counts), at most 8 not yet played per series, and always the
-- next one (so a monthly series has its next game up; a game the host
-- cancelled counts for neither, so the one after it goes up). A day
-- whose start has passed is skipped. A daily job (05:37 IST) tops every
-- series up; one with no day left to make is ended ('done').
--
-- Functions (the server key, private.account_key_ok, and the account the
-- server resolved, never one the browser names; anon and authenticated
-- may call them, PUBLIC may not):
--   * game_series_create: the game checked as game_create checks it, and
--     the repeat; the first game neither started nor past; the turf
--     listed. At most 3 series running per host, 5 started a day. Makes
--     the first games at once (the host's "Turf booked" goes on the first
--     one only: the host books each date themselves). Series games have
--     their own limit, 30 a day per host, and do not count towards
--     game_create's 10 a day (game_create below counts single games only).
--   * game_series_stop: the host only. No more games. With p_cancel, its
--     games not yet started are cancelled through game_cancel, so their
--     players and pending requests are told, as for any cancel.
--   * game_series_mine: the host's own series, newest first, with how
--     many games are still to play and the next one.
--   * game_series_public: what any game page shows of its series (the
--     rule, the time, the end, running or not): nothing about anyone.
--
-- The app works before this file: the create flow hides the repeat
-- option until GET /api/game-series answers ready, and single games are
-- made as before.
--
-- Additive: one nullable column and an index on public.games, two tables
-- in the private schema, new functions, game_create replaced with the
-- same signature and body but for its daily count, and a cron job. No
-- grant or policy on a public table changes. Written without the
-- destructive SQL keywords. Safe to run again.

set local lock_timeout = '5s';

-- Built on the games lockdown's checks and its cancel: without them it
-- refuses to run (and changes nothing).
do $$
begin
  if to_regprocedure('private.game_field_problem(jsonb,text[])') is null
     or to_regprocedure('private.game_date_or_null(text)') is null
     or to_regprocedure('private.game_over(date,time,time)') is null
     or to_regprocedure('public.game_cancel(text,uuid,uuid)') is null then
    raise exception 'game series: apply 20261030_games_lockdown.sql first';
  end if;
end;
$$;

-- ── 1. The link on games, and the series ───────────────────

alter table public.games add column if not exists series_id uuid;
create index if not exists games_series_idx on public.games (series_id, date) where series_id is not null;

-- No foreign keys to accounts or turfs: a series never holds up removing
-- either (its games go with them as before; the series then makes nothing).
create table if not exists private.game_series (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null,
  turf_id uuid not null,
  sport text not null,
  skill_level text not null,
  max_players integer not null,
  start_time time not null,
  end_time time not null,
  price_per_player numeric not null,
  description text,
  host_phone text not null default '',
  -- {freq: weekly, interval: 1-4, days: [0-6, Sunday 0]} or
  -- {freq: monthly, by: date, day: 1-31} or {freq: monthly, by: weekday, nth: 1-4 or -1, weekday: 0-6}.
  rule jsonb not null,
  starts_on date not null,
  -- Ends on this day (null: never, which is a year from starts_on).
  ends_on date,
  -- Ends after this many games (null: no count).
  max_games integer,
  -- Still making games. ended: why not: 'stopped' (the host) or 'done' (no day left).
  active boolean not null default true,
  ended text,
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists game_series_host_idx on private.game_series (host_id, created_at desc);
create index if not exists game_series_active_idx on private.game_series (created_at) where active;
revoke all on private.game_series from public, anon, authenticated;

-- Every day a series has made a game for, whatever became of the game.
create table if not exists private.game_series_dates (
  series_id uuid not null references private.game_series (id),
  day date not null,
  game_id uuid not null,
  made_at timestamptz not null default now(),
  primary key (series_id, day)
);
revoke all on private.game_series_dates from public, anon, authenticated;

-- ── 2. The maths (lib/games/repeat.ts has the same) ────────

-- The number of days in the month of p_day.
create or replace function private.game_series_month_days(p_day date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select extract(day from (date_trunc('month', p_day::timestamp) + interval '1 month' - interval '1 day'))::integer;
$$;
revoke all on function private.game_series_month_days(date) from public, anon, authenticated;

-- The Monday of the week of a weekly rule's first game (the first of its
-- days on or after p_start): its weeks count from there, so every 2 weeks
-- on Monday from a Sunday starts the next day.
create or replace function private.game_series_week_one(p_rule jsonb, p_start date)
returns date
language sql
immutable
set search_path = ''
as $$
  select x.f - (extract(isodow from x.f)::integer - 1)
    from (select p_start + (select min(((e #>> '{}')::integer - extract(dow from p_start)::integer + 7) % 7)
                              from jsonb_array_elements(p_rule -> 'days') e) as f) x;
$$;
revoke all on function private.game_series_week_one(jsonb, date) from public, anon, authenticated;

-- Is p_day on the rule? p_start: the series' first day (the weeks of a
-- weekly rule count from its first game's week). Days are 0 (Sunday) to 6.
create or replace function private.game_series_matches(p_rule jsonb, p_start date, p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_rule ->> 'freq'
    when 'weekly' then
      (p_rule -> 'days') @> to_jsonb(extract(dow from p_day)::integer)
      and ((p_day - private.game_series_week_one(p_rule, p_start)) / 7) % (p_rule ->> 'interval')::integer = 0
    when 'monthly' then
      case p_rule ->> 'by'
        when 'date' then
          extract(day from p_day)::integer = least((p_rule ->> 'day')::integer, private.game_series_month_days(p_day))
        when 'weekday' then
          extract(dow from p_day)::integer = (p_rule ->> 'weekday')::integer
          and case when (p_rule ->> 'nth')::integer = -1
                   then extract(day from p_day)::integer + 7 > private.game_series_month_days(p_day)
                   else (extract(day from p_day)::integer + 6) / 7 = (p_rule ->> 'nth')::integer
              end
        else false
      end
    else false
  end;
$$;
revoke all on function private.game_series_matches(jsonb, date, date) from public, anon, authenticated;

-- The series' days in order, from p_start to p_last, the first p_count of
-- them (null: every one). n: the day's place in the series (1 is the first).
create or replace function private.game_series_days(p_rule jsonb, p_start date, p_last date, p_count integer)
returns table (day date, n integer)
language sql
immutable
set search_path = ''
as $$
  select x.day, x.n::integer
    from (select d::date as day, row_number() over (order by d) as n
            from generate_series(p_start::timestamp, p_last::timestamp, interval '1 day') d
           where private.game_series_matches(p_rule, p_start, d::date)) x
   where p_count is null or x.n <= p_count
   order by x.day;
$$;
revoke all on function private.game_series_days(jsonb, date, date, integer) from public, anon, authenticated;

-- The repeat the browser sent ({rule, ends}), for a series from p_start:
-- the first field that is not allowed or not well formed ('repeat',
-- 'rule', 'interval', 'days', 'month', 'ends'), or null when it is fine.
-- A monthly rule must fall on p_start; a series is at least 2 games;
-- "after" is at most the games the year holds.
create or replace function private.game_series_problem(p_repeat jsonb, p_start date)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_rule jsonb;
  v_ends jsonb;
  v_n integer;
  v_day integer;
  v_on date;
begin
  if p_start is null or p_repeat is null or jsonb_typeof(p_repeat) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_repeat) k where k not in ('rule', 'ends')) then
    return 'repeat';
  end if;
  v_rule := p_repeat -> 'rule';
  v_ends := p_repeat -> 'ends';
  if v_rule is null or jsonb_typeof(v_rule) <> 'object' then
    return 'rule';
  end if;
  if v_rule ->> 'freq' = 'weekly' then
    if exists (select 1 from jsonb_object_keys(v_rule) k where k not in ('freq', 'interval', 'days')) then
      return 'rule';
    end if;
    if jsonb_typeof(v_rule -> 'interval') is distinct from 'number' or (v_rule ->> 'interval') !~ '^[1-4]$' then
      return 'interval';
    end if;
    if jsonb_typeof(v_rule -> 'days') is distinct from 'array' or jsonb_array_length(v_rule -> 'days') not between 1 and 7
       or exists (select 1 from jsonb_array_elements(v_rule -> 'days') e where jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[0-6]$')
       or (select count(distinct e #>> '{}') from jsonb_array_elements(v_rule -> 'days') e) <> jsonb_array_length(v_rule -> 'days') then
      return 'days';
    end if;
  elsif v_rule ->> 'freq' = 'monthly' then
    v_day := extract(day from p_start)::integer;
    if v_rule ->> 'by' = 'date' then
      if exists (select 1 from jsonb_object_keys(v_rule) k where k not in ('freq', 'by', 'day')) then
        return 'rule';
      end if;
      if jsonb_typeof(v_rule -> 'day') is distinct from 'number' or (v_rule ->> 'day') is distinct from v_day::text then
        return 'month';
      end if;
    elsif v_rule ->> 'by' = 'weekday' then
      if exists (select 1 from jsonb_object_keys(v_rule) k where k not in ('freq', 'by', 'nth', 'weekday')) then
        return 'rule';
      end if;
      if jsonb_typeof(v_rule -> 'weekday') is distinct from 'number' or (v_rule ->> 'weekday') is distinct from extract(dow from p_start)::integer::text
         or jsonb_typeof(v_rule -> 'nth') is distinct from 'number' or (v_rule ->> 'nth') not in ('1', '2', '3', '4', '-1')
         or not private.game_series_matches(v_rule, p_start, p_start) then
        return 'month';
      end if;
    else
      return 'rule';
    end if;
  else
    return 'rule';
  end if;
  if v_ends is null or jsonb_typeof(v_ends) <> 'object' then
    return 'ends';
  end if;
  if v_ends ->> 'type' = 'never' then
    if exists (select 1 from jsonb_object_keys(v_ends) k where k <> 'type') then
      return 'ends';
    end if;
    v_on := p_start + 365;
  elsif v_ends ->> 'type' = 'on' then
    if exists (select 1 from jsonb_object_keys(v_ends) k where k not in ('type', 'date')) then
      return 'ends';
    end if;
    v_on := private.game_date_or_null(case when jsonb_typeof(v_ends -> 'date') = 'string' then v_ends ->> 'date' end);
    if v_on is null or v_on < p_start or v_on > p_start + 365 then
      return 'ends';
    end if;
  elsif v_ends ->> 'type' = 'after' then
    if exists (select 1 from jsonb_object_keys(v_ends) k where k not in ('type', 'count'))
       or jsonb_typeof(v_ends -> 'count') is distinct from 'number' or (v_ends ->> 'count') !~ '^\d{1,2}$'
       or (v_ends ->> 'count')::integer not between 2 and 52 then
      return 'ends';
    end if;
    v_on := p_start + 365;
  else
    return 'ends';
  end if;
  select count(*) into v_n from private.game_series_days(v_rule, p_start, v_on, null);
  if v_n < 2 or (v_ends ->> 'type' = 'after' and (v_ends ->> 'count')::integer > v_n) then
    return 'ends';
  end if;
  return null;
end;
$$;
revoke all on function private.game_series_problem(jsonb, date) from public, anon, authenticated;

-- The series' last possible day: its end date, else a year from its first.
create or replace function private.game_series_last(s private.game_series)
returns date
language sql
immutable
set search_path = ''
as $$
  select coalesce(s.ends_on, s.starts_on + 365);
$$;
revoke all on function private.game_series_last(private.game_series) from public, anon, authenticated;

-- How a series ends, as the app reads it: {type: never}, {type: on, date} or {type: after, count}.
create or replace function private.game_series_ends(s private.game_series)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
           when s.max_games is not null then jsonb_build_object('type', 'after', 'count', s.max_games)
           when s.ends_on is not null then jsonb_build_object('type', 'on', 'date', s.ends_on)
           else jsonb_build_object('type', 'never')
         end;
$$;
revoke all on function private.game_series_ends(private.game_series) from public, anon, authenticated;

-- A series as its host reads it (never the number it gives players).
create or replace function private.game_series_json(s private.game_series)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id, 'turf_id', s.turf_id, 'sport', s.sport, 'skill_level', s.skill_level, 'max_players', s.max_players,
    'start_time', s.start_time, 'end_time', s.end_time, 'price_per_player', s.price_per_player,
    'rule', s.rule, 'starts_on', s.starts_on, 'ends', private.game_series_ends(s),
    'active', s.active, 'ended', s.ended, 'stopped_at', s.stopped_at, 'created_at', s.created_at);
$$;
revoke all on function private.game_series_json(private.game_series) from public, anon, authenticated;

-- ── 3. Making the games ────────────────────────────────────

-- Puts up the series' next games (see the top): each one as game_create
-- makes a game, the host its first player; p_booked: the first game made
-- here has the turf booked (the create; the daily job passes false).
-- p_now: the time it goes by (the checks pass another). Answers how many
-- games it made; a series with no day left to make is ended ('done').
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
  -- No account any more, or the turf is not listed: nothing is made until it is.
  if not found or not exists (select 1 from public.turfs t where t.id = v_s.turf_id and t.is_active is true) then
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
                              start_time, end_time, price_per_player, status, host_name, host_phone, host_profile_image_url, turf_booked, series_id)
    values (v_s.host_id, v_s.turf_id, v_s.sport || ' Game', coalesce(nullif(btrim(v_s.description), ''), v_s.sport || ' game'),
            v_s.sport, v_s.skill_level, v_s.max_players, 1, v_day, v_s.start_time, v_s.end_time, v_s.price_per_player, 'open',
            coalesce(nullif(btrim(v_user.name::text), ''), 'Player'), coalesce(v_s.host_phone, ''),
            coalesce(v_user.profile_image_url, ''), coalesce(p_booked, false) and v_made = 0, v_s.id)
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

-- The daily job: every running series topped up, oldest first. One that
-- fails is skipped (and logged); the others still run.
create or replace function private.game_series_tick()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_made integer := 0;
begin
  for v_id in select s.id from private.game_series s where s.active order by s.created_at loop
    begin
      v_made := v_made + private.game_series_fill(v_id);
    exception when others then
      raise warning 'game_series_fill %: %', v_id, sqlerrm;
    end;
  end loop;
  return v_made;
end;
$$;
revoke all on function private.game_series_tick() from public, anon, authenticated;
select cron.schedule('game-series-fill', '7 0 * * *', 'select private.game_series_tick()');

-- ── 4. The host's functions ────────────────────────────────

-- p_game: as game_create's (date is the series' first day). p_repeat:
-- {rule, ends} (see the top). Answers {r: ok, series, games (the games
-- made, soonest first), made} or r: unavailable, bad (with field), venue,
-- many (3 series running), limit (5 started today, or 30 series games made).
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
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  v_bad := private.game_field_problem(p_game, array['turf_id', 'sport', 'skill_level', 'max_players', 'date', 'start_time', 'end_time',
                                                    'price_per_player', 'description', 'turf_booked', 'host_phone']);
  if v_bad is null and not (p_game ?& array['turf_id', 'sport', 'skill_level', 'max_players', 'date', 'start_time', 'end_time', 'price_per_player']) then
    v_bad := 'body';
  end if;
  if v_bad is not null then
    return jsonb_build_object('r', 'bad', 'field', v_bad);
  end if;
  v_date := (p_game ->> 'date')::date;
  if v_date < v_today or v_date > v_today + 365 then
    return jsonb_build_object('r', 'bad', 'field', 'date');
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
  if not exists (select 1 from public.turfs t where t.id = (p_game ->> 'turf_id')::uuid and t.is_active is true) then
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
                                   description, host_phone, rule, starts_on, ends_on, max_games)
  values (p_user_id, (p_game ->> 'turf_id')::uuid, v_sport, p_game ->> 'skill_level', (p_game ->> 'max_players')::integer,
          (p_game ->> 'start_time')::time, (p_game ->> 'end_time')::time, (p_game ->> 'price_per_player')::numeric,
          nullif(btrim(p_game ->> 'description'), ''), coalesce(p_game ->> 'host_phone', ''), v_rule, v_date,
          case when v_ends ->> 'type' = 'on' then (v_ends ->> 'date')::date end,
          case when v_ends ->> 'type' = 'after' then (v_ends ->> 'count')::integer end)
  returning * into v_s;
  v_made := private.game_series_fill(v_s.id, now(), coalesce((p_game ->> 'turf_booked')::boolean, false));
  select * into v_s from private.game_series s where s.id = v_s.id;
  return jsonb_build_object('r', 'ok', 'series', private.game_series_json(v_s), 'made', v_made,
    'games', coalesce((select jsonb_agg(to_jsonb(g) order by g.date) from public.games g where g.series_id = v_s.id), '[]'::jsonb));
end;
$$;
revoke all on function public.game_series_create(text, uuid, jsonb, jsonb) from public;
grant execute on function public.game_series_create(text, uuid, jsonb, jsonb) to anon, authenticated;

-- The host stops the series: no more games. p_cancel: also cancel its
-- games not yet started (game_cancel tells their players and pending
-- requests). Asking again is fine (it can cancel what is left). Answers
-- {r: ok, series, cancelled} or r: unavailable, bad, gone, not_host.
create or replace function public.game_series_stop(p_key text, p_user_id uuid, p_series_id uuid, p_cancel boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s private.game_series;
  v_id uuid;
  v_n integer := 0;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_series_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_s from private.game_series s where s.id = p_series_id for update;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if v_s.host_id is distinct from p_user_id then
    return jsonb_build_object('r', 'not_host');
  end if;
  if v_s.active then
    update private.game_series s set active = false, ended = 'stopped', stopped_at = now(), updated_at = now()
     where s.id = p_series_id
    returning * into v_s;
  end if;
  if coalesce(p_cancel, false) then
    for v_id in
      select g.id from public.games g
       where g.series_id = p_series_id and g.creator_id = p_user_id and coalesce(g.status, 'open') in ('open', 'full')
         and g.date + g.start_time > (now() at time zone 'Asia/Kolkata')
       order by g.date
    loop
      if public.game_cancel(p_key, p_user_id, v_id) ->> 'r' = 'ok' then
        v_n := v_n + 1;
      end if;
    end loop;
  end if;
  return jsonb_build_object('r', 'ok', 'series', private.game_series_json(v_s), 'cancelled', v_n);
end;
$$;
revoke all on function public.game_series_stop(text, uuid, uuid, boolean) from public;
grant execute on function public.game_series_stop(text, uuid, uuid, boolean) to anon, authenticated;

-- The host's series, newest first (at most 20), each with its games still
-- to play (open or full, not over), how many of them have not started
-- (unstarted: what a stop that cancels calls off) and the next of them
-- {id, date, start_time}. {r: ok, series}.
create or replace function public.game_series_mine(p_key text, p_user_id uuid)
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
  return jsonb_build_object('r', 'ok', 'series', coalesce((
    select jsonb_agg(private.game_series_json(s) || jsonb_build_object(
             'upcoming', (select count(*) from public.games g
                           where g.series_id = s.id and coalesce(g.status, 'open') in ('open', 'full')
                             and not private.game_over(g.date, g.start_time, g.end_time)),
             'unstarted', (select count(*) from public.games g
                            where g.series_id = s.id and g.creator_id = s.host_id and coalesce(g.status, 'open') in ('open', 'full')
                              and g.date + g.start_time > (now() at time zone 'Asia/Kolkata')),
             'next', (select jsonb_build_object('id', g.id, 'date', g.date, 'start_time', g.start_time)
                        from public.games g
                       where g.series_id = s.id and coalesce(g.status, 'open') in ('open', 'full')
                         and not private.game_over(g.date, g.start_time, g.end_time)
                       order by g.date, g.start_time
                       limit 1))
           order by s.created_at desc)
      from private.game_series s
     where s.id in (select x.id from private.game_series x where x.host_id = p_user_id order by x.created_at desc limit 20)), '[]'::jsonb));
end;
$$;
revoke all on function public.game_series_mine(text, uuid) from public;
grant execute on function public.game_series_mine(text, uuid) to anon, authenticated;

-- What a game page shows of its series, for up to 50 ids: the rule, the
-- time, the first day, the end and whether it still runs. No key: it is
-- no more than the games themselves show, and nothing about anyone.
create or replace function public.game_series_public(p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'rule', s.rule, 'starts_on', s.starts_on, 'ends', private.game_series_ends(s),
           'start_time', s.start_time, 'end_time', s.end_time, 'active', s.active)), '[]'::jsonb)
    from private.game_series s
   where s.id = any ((coalesce(p_ids, '{}'::uuid[]))[1:50]);
$$;
revoke all on function public.game_series_public(uuid[]) from public;
grant execute on function public.game_series_public(uuid[]) to anon, authenticated;

-- ── 5. game_create counts single games only ────────────────

-- As 20261030_games_lockdown.sql, but for one line: its 10 a day counts
-- the games the host made themselves, not those their series made (which
-- have their own limit above), so a series never stops a single game.
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
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  v_bad := private.game_field_problem(p_game, array['turf_id', 'sport', 'skill_level', 'max_players', 'date', 'start_time', 'end_time',
                                                    'price_per_player', 'description', 'turf_booked', 'host_phone']);
  if v_bad is null and not (p_game ?& array['turf_id', 'sport', 'skill_level', 'max_players', 'date', 'start_time', 'end_time', 'price_per_player']) then
    v_bad := 'body';
  end if;
  if v_bad is not null then
    return jsonb_build_object('r', 'bad', 'field', v_bad);
  end if;
  v_date := (p_game ->> 'date')::date;
  if v_date < v_today or v_date > v_today + 365 then
    return jsonb_build_object('r', 'bad', 'field', 'date');
  end if;
  -- One create at a time per account: the daily limit counts every game before this one.
  perform pg_advisory_xact_lock(hashtextextended('game_create:' || p_user_id::text, 0));
  select * into v_user from public.users u where u.id = p_user_id;
  if not found then
    return jsonb_build_object('r', 'bad');
  end if;
  if not exists (select 1 from public.turfs t where t.id = (p_game ->> 'turf_id')::uuid and t.is_active is true) then
    return jsonb_build_object('r', 'venue');
  end if;
  if (select count(*) from public.games g where g.creator_id = p_user_id and g.series_id is null and g.created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('r', 'limit');
  end if;
  v_sport := btrim(p_game ->> 'sport');
  insert into public.games (creator_id, turf_id, title, description, sport, skill_level, max_players, current_players, date,
                            start_time, end_time, price_per_player, status, host_name, host_phone, host_profile_image_url, turf_booked)
  values (p_user_id, (p_game ->> 'turf_id')::uuid, v_sport || ' Game',
          coalesce(nullif(btrim(p_game ->> 'description'), ''), v_sport || ' game'),
          v_sport, p_game ->> 'skill_level', (p_game ->> 'max_players')::integer, 1, v_date,
          (p_game ->> 'start_time')::time, (p_game ->> 'end_time')::time, (p_game ->> 'price_per_player')::numeric, 'open',
          coalesce(nullif(btrim(v_user.name::text), ''), 'Player'), coalesce(p_game ->> 'host_phone', ''),
          coalesce(v_user.profile_image_url, ''), coalesce((p_game ->> 'turf_booked')::boolean, false))
  returning * into v_row;
  insert into public.game_participants (game_id, user_id) values (v_row.id, p_user_id)
  on conflict (game_id, user_id) do nothing;
  return jsonb_build_object('r', 'ok', 'game', to_jsonb(v_row));
end;
$$;
revoke all on function public.game_create(text, uuid, jsonb) from public;
grant execute on function public.game_create(text, uuid, jsonb) to anon, authenticated;
