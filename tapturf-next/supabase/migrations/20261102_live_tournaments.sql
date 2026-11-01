-- Live tournaments: /tournament/<code>.
--
-- The site owner asked (1 Nov) for tournaments people run and others
-- follow: an organiser sets one up (a league, a league with playoffs, a
-- bilateral or a tri-series), shares its link, and anyone with the link
-- sees the points table, the fixtures and results, the playoffs, and the
-- matches being scored live on the Live Cricket Scorer. lib/tournament/
-- types.ts has the whole flow.
--
-- Trust, as for live scorecard links (20261021_live_matches.sql): only the
-- Next routes call these functions. Each refuses a call without the
-- server's key: the live write key (private.live_key_ok, LIVE_WRITE_KEY)
-- for creating, changing, reading and counting views, the account key
-- (private.account_key_ok, ACCOUNT_KEY) for keeping a tournament with an
-- account. The routes mint the codes (8 random characters and a 4
-- character tag made with the live write key, lib/tournament/codes.ts),
-- so made-up codes are refused before any lookup. Changing a tournament
-- also needs a secret the organiser's browser made, stored here only as
-- its sha256: no login is needed to run one. A signed-in organiser's
-- tournament is kept with their account (user_id), and that account can
-- add a secret for another of its devices (at most 10 kept, the newest).
--
-- What is stored: what the organiser typed (the tournament's and teams'
-- names, short codes, the venue picked from TapTurf's turfs, dates, the
-- points and overs), the fixtures and their results, and for a fixture
-- scored live the live link's code and its result when it finished.
-- Nothing about followers: views are counts only, as for live links
-- (20261101_live_views.sql). The account a signed-in organiser used is
-- never served to anyone but them and the site owner. A one-way hash of
-- the organiser's network is kept for the create limits and cleared at 47
-- hours by the hourly job below.
--
-- Limits, in the functions as well as the routes: new tournaments 5 an
-- hour and 20 a day per network, 100 an hour site-wide; 16 teams, 300
-- fixtures and 5000 changes per tournament; 120 KB per create.
--
-- 1. private.tournaments, private.tournament_teams, private.tournament_fixtures
--    (a fixture taken out is marked removed, never taken away; a
--    tournament taken down is marked removed and shows only that), and
--    private.tournament_views (code, views, viewers, first and last viewed).
-- 2. public.tournament_create, tournament_update (one change at a time:
--    settings, a team's name, a fixture added, changed, moved, taken out, a
--    result, a live link, the whole tournament taken down),
--    tournament_live_result (a finished live scorecard's result for the
--    fixtures linked to it), tournament_get (what followers see: never the
--    secret, the network hash or the account), tournament_view_add and
--    tournament_view_count: live write key.
-- 3. public.tournament_attach, tournament_device_add, tournament_mine: account key.
-- 4. public.admin_tournaments: site owner only, every tournament with its
--    counts, views, how many of its matches are live now, and its
--    organiser's account (name) when signed in.
--
-- The app works before this file is applied: the routes find no function
-- (PGRST202), the live tournament buttons say coming soon, and the Cricket
-- Tournament Manager works in the browser as before.
--
-- Additive: new tables in the private schema, new functions and one new
-- hourly job; no existing table, function or job is touched. Written
-- without the destructive SQL keywords. Safe to run again. Check:
-- scripts/sql-tests/live_tournaments.check.mjs.

-- ── Checks the tables use ─────────────────────────────────────────────

-- One side's innings: whole runs, wickets and legal balls within a match, and the all-out tick.
-- Up to 30 wickets: the Live Cricket Scorer takes up to 30 a side, last man stands.
create or replace function private.tournament_innings_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(j) = 'object'
    and jsonb_typeof(j -> 'runs') = 'number' and (j ->> 'runs') ~ '^[0-9]{1,3}$'
    and jsonb_typeof(j -> 'wickets') = 'number' and (j ->> 'wickets') ~ '^([0-9]|[12][0-9]|30)$'
    and jsonb_typeof(j -> 'balls') = 'number' and (j ->> 'balls') ~ '^[0-9]{1,3}$' and (j ->> 'balls')::integer <= 600
    and coalesce(jsonb_typeof(j -> 'allOut'), 'boolean') = 'boolean',
    false);
$$;

-- A result the organiser entered: home as a, away as b.
create or replace function private.tournament_result_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(j) = 'object' and octet_length(j::text) <= 1000
    and private.tournament_innings_ok(j -> 'a') and private.tournament_innings_ok(j -> 'b')
    and (j ->> 'result') in ('auto', 'a', 'b', 'tie', 'nr')
    and (j ->> 'battedFirst') in ('a', 'b'),
    false);
$$;

-- A finished live scorecard's result, as its match had it (team names included).
create or replace function private.tournament_live_result_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(j) = 'object' and octet_length(j::text) <= 1500
    and private.tournament_innings_ok(j -> 'a') and private.tournament_innings_ok(j -> 'b')
    and jsonb_typeof(j -> 'a' -> 'name') = 'string' and char_length(j -> 'a' ->> 'name') <= 40
    and jsonb_typeof(j -> 'b' -> 'name') = 'string' and char_length(j -> 'b' ->> 'name') <= 40
    and (j ->> 'outcome') in ('a', 'b', 'tie', 'nr')
    and (j ->> 'battedFirst') in ('a', 'b')
    and jsonb_typeof(j -> 'text') = 'string' and char_length(j ->> 'text') <= 120,
    false);
$$;

-- The settings: format, legs, series length, playoffs, overs, points, venue and dates, each within limits.
create or replace function private.tournament_settings_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(j) = 'object' and octet_length(j::text) <= 2000
    and (j ->> 'format') in ('league', 'bilateral', 'tri')
    and (j ->> 'legs') in ('1', '2')
    and jsonb_typeof(j -> 'matches') = 'number' and (j ->> 'matches') ~ '^[0-9]$'
    and (j ->> 'playoffs') in ('none', 'final', 'semis')
    and (jsonb_typeof(j -> 'overs') = 'null' or ((j ->> 'overs') ~ '^[0-9]{1,2}$' and (j ->> 'overs')::integer between 1 and 50))
    and jsonb_typeof(j -> 'points') = 'object'
    and (j -> 'points' ->> 'win') ~ '^[0-9]{1,2}$' and (j -> 'points' ->> 'tie') ~ '^[0-9]{1,2}$'
    and (j -> 'points' ->> 'nr') ~ '^[0-9]{1,2}$' and (j -> 'points' ->> 'loss') ~ '^[0-9]{1,2}$'
    and (jsonb_typeof(j -> 'venue') = 'null'
         or (jsonb_typeof(j -> 'venue') = 'object'
             and (j -> 'venue' ->> 'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and char_length(coalesce(j -> 'venue' ->> 'name', '')) between 1 and 80
             and char_length(coalesce(j -> 'venue' ->> 'slug', '')) <= 120
             and char_length(coalesce(j -> 'venue' ->> 'area', '')) <= 60))
    and (jsonb_typeof(j -> 'starts') = 'null' or (j ->> 'starts') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    and (jsonb_typeof(j -> 'ends') = 'null' or (j ->> 'ends') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
    false);
$$;

revoke all on function private.tournament_innings_ok(jsonb) from public, anon, authenticated;
revoke all on function private.tournament_result_ok(jsonb) from public, anon, authenticated;
revoke all on function private.tournament_live_result_ok(jsonb) from public, anon, authenticated;
revoke all on function private.tournament_settings_ok(jsonb) from public, anon, authenticated;

-- ── Tables ────────────────────────────────────────────────────────────

create table if not exists private.tournaments (
  code text primary key check (code ~ '^[a-z0-9]{12}$'),
  -- sha256 of each secret that may change it: the organiser's browser, and any device their account added.
  secret_hashes bytea[] not null check (cardinality(secret_hashes) between 1 and 10),
  name text not null check (char_length(name) between 1 and 60 and name !~ '[[:cntrl:]]'),
  format text not null check (format in ('league', 'bilateral', 'tri')),
  settings jsonb not null check (private.tournament_settings_ok(settings)),
  status text not null default 'on' check (status in ('on', 'removed')),
  -- The account it is kept with, when the organiser was signed in. No foreign key, like the other private per-user tables.
  user_id uuid,
  -- sha256 of the live write key and the organiser's network, for the create limits; cleared at 47 hours.
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{32}$'),
  rev bigint not null default 1,
  writes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (settings ->> 'format' = format)
);
revoke all on private.tournaments from public, anon, authenticated;
create index if not exists tournaments_created_idx on private.tournaments (created_at);
create index if not exists tournaments_ip_created_idx on private.tournaments (ip_hash, created_at) where ip_hash is not null;
create index if not exists tournaments_user_idx on private.tournaments (user_id) where user_id is not null;

create table if not exists private.tournament_teams (
  code text not null references private.tournaments (code),
  id smallint not null check (id between 1 and 16),
  name text not null check (char_length(name) between 1 and 30 and name !~ '[[:cntrl:]]'),
  short text check (short is null or short ~ '^[A-Z0-9]{1,4}$'),
  primary key (code, id)
);
revoke all on private.tournament_teams from public, anon, authenticated;
-- No two teams of a tournament with the same name, in any case.
create unique index if not exists tournament_teams_name_idx on private.tournament_teams (code, lower(name));

create table if not exists private.tournament_fixtures (
  code text not null references private.tournaments (code),
  id smallint not null check (id between 1 and 300),
  stage text not null check (stage in ('league', 'semi', 'final')),
  slot text check (slot is null or slot in ('s1', 's2', 'f')),
  round smallint not null check (round between 1 and 99),
  seq smallint not null check (seq between 0 and 999),
  home smallint,
  away smallint,
  day date check (day is null or day between date '2020-01-01' and date '2100-12-31'),
  time text check (time is null or time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  status text not null default 'scheduled' check (status in ('scheduled', 'removed')),
  result jsonb check (result is null or private.tournament_result_ok(result)),
  -- The live scorecard (/live/<code>) it is scored on, and that scorecard's result once it finished, with the live rev it came with.
  live_code text check (live_code is null or live_code ~ '^[a-z0-9]{12}$'),
  live_result jsonb check (live_result is null or private.tournament_live_result_ok(live_result)),
  live_rev bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (code, id),
  foreign key (code, home) references private.tournament_teams (code, id),
  foreign key (code, away) references private.tournament_teams (code, id),
  check (home is null or away is null or home <> away),
  check (stage <> 'league' or (home is not null and away is not null and slot is null)),
  check (result is null or (home is not null and away is not null))
);
revoke all on private.tournament_fixtures from public, anon, authenticated;
create index if not exists tournament_fixtures_live_idx on private.tournament_fixtures (live_code) where live_code is not null;

-- Views: counts only, nothing about who viewed (as private.live_link_views).
create table if not exists private.tournament_views (
  code text primary key references private.tournaments (code),
  views bigint not null default 0 check (views >= 0),
  viewers bigint not null default 0 check (viewers >= 0 and viewers <= views),
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now()
);
revoke all on private.tournament_views from public, anon, authenticated;

-- ── Create ────────────────────────────────────────────────────────────

-- p_data: { name, settings, teams: [{name, short}], fixtures: [{id, stage,
-- slot, round, seq, home, away, day, time, result}] }, as the route read it
-- (lib/tournament/payload.ts readCreate); team ids are their places, from 1.
-- {r, rev}: ok, taken (the code is in use: mint another), limit (this
-- network made too many: 5 an hour, 20 a day), busy (100 an hour
-- site-wide), bad, unavailable (a wrong key).
create or replace function public.tournament_create(p_key text, p_code text, p_secret text, p_data jsonb, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_format text;
  v_teams integer;
  v_fixtures integer;
begin
  if not private.live_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_code is null or p_code !~ '^[a-z0-9]{12}$'
     or p_secret is null or p_secret !~ '^[0-9a-f]{64}$'
     or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{32}$'
     or p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 120000
     or jsonb_typeof(p_data -> 'name') is distinct from 'string'
     or jsonb_typeof(p_data -> 'settings') is distinct from 'object'
     or jsonb_typeof(p_data -> 'teams') is distinct from 'array'
     or jsonb_typeof(p_data -> 'fixtures') is distinct from 'array' then
    return jsonb_build_object('r', 'bad');
  end if;
  v_format := p_data -> 'settings' ->> 'format';
  v_teams := jsonb_array_length(p_data -> 'teams');
  v_fixtures := jsonb_array_length(p_data -> 'fixtures');
  if v_format is null or v_teams < 2 or v_teams > 16 or v_fixtures < 1 or v_fixtures > 300
     or (v_format = 'bilateral' and v_teams <> 2) or (v_format = 'tri' and v_teams <> 3) or (v_format = 'league' and v_teams < 3) then
    return jsonb_build_object('r', 'bad');
  end if;
  if exists (select 1 from private.tournaments t where t.code = p_code) then
    return jsonb_build_object('r', 'taken');
  end if;

  -- Per network: every tournament made in the window counts, taken down or not. Each count stops at its cap.
  if (select count(*) from (
        select 1 from private.tournaments t
         where t.ip_hash = p_ip_hash and t.created_at > now() - interval '24 hours'
         limit 20) x) >= 20
     or (select count(*) from (
        select 1 from private.tournaments t
         where t.ip_hash = p_ip_hash and t.created_at > now() - interval '1 hour'
         limit 5) x) >= 5 then
    return jsonb_build_object('r', 'limit');
  end if;
  if (select count(*) from (
        select 1 from private.tournaments t
         where t.created_at > now() - interval '1 hour'
         limit 100) x) >= 100 then
    return jsonb_build_object('r', 'busy');
  end if;

  -- One go: anything the tables refuse (a bad name, a team twice, a fixture
  -- naming a team that isn't in it, a result that isn't one) makes none of it.
  begin
    insert into private.tournaments (code, secret_hashes, name, format, settings, ip_hash)
    values (p_code, array[sha256(convert_to(p_secret, 'UTF8'))], p_data ->> 'name', v_format, p_data -> 'settings', p_ip_hash);
    insert into private.tournament_teams (code, id, name, short)
    select p_code, x.n::smallint, x.t ->> 'name', nullif(x.t ->> 'short', '')
      from jsonb_array_elements(p_data -> 'teams') with ordinality as x (t, n);
    insert into private.tournament_fixtures (code, id, stage, slot, round, seq, home, away, day, time, result)
    select p_code, (f ->> 'id')::smallint, f ->> 'stage', f ->> 'slot', (f ->> 'round')::smallint, (f ->> 'seq')::smallint,
           (f ->> 'home')::smallint, (f ->> 'away')::smallint, (f ->> 'day')::date, f ->> 'time',
           case when jsonb_typeof(f -> 'result') = 'object' then f -> 'result' end
      from jsonb_array_elements(p_data -> 'fixtures') as f;
  exception when others then
    return jsonb_build_object('r', 'bad');
  end;
  return jsonb_build_object('r', 'ok', 'rev', 1);
end;
$$;

-- ── Change ────────────────────────────────────────────────────────────

-- One change, with the organiser's secret. p_op and p_data:
--   settings       {name, settings}      the format stays as it was made
--   team           {id, name, short}
--   fixture_add    {stage, slot, round, home, away, day, time}
--   fixture_edit   {id, round, home, away, day, time}
--   fixture_remove {id}                   marked removed
--   fixture_order  {ids}                  listed first to last
--   result         {id, result, home, away}  result null clears it; home and away pin a playoff's empty places
--   live_link      {id, live_code, home, away}
--   live_unlink    {id}
--   remove         {}                     the tournament is taken down
-- {r, rev}: ok, forbidden (wrong secret), gone (no such tournament, or taken
-- down), taken (a team name in use), limit (5000 changes, or 300 fixtures),
-- bad, unavailable. Changes to one tournament go one at a time.
create or replace function public.tournament_update(p_key text, p_code text, p_secret text, p_op text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t private.tournaments;
  v_hash bytea;
  v_id smallint;
  v_n integer;
  v_max integer;
  v_seq integer;
  v_rev bigint;
begin
  if not private.live_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_code is null or p_code !~ '^[a-z0-9]{12}$'
     or p_secret is null or p_secret !~ '^[0-9a-f]{64}$'
     or p_op is null or p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 8000 then
    return jsonb_build_object('r', 'bad');
  end if;
  v_hash := sha256(convert_to(p_secret, 'UTF8'));
  -- A plain read says who may; only the organiser then waits for the row.
  select * into t from private.tournaments x where x.code = p_code;
  if not found or t.status <> 'on' then
    return jsonb_build_object('r', 'gone');
  end if;
  if not (v_hash = any(t.secret_hashes)) then
    return jsonb_build_object('r', 'forbidden');
  end if;
  select * into t from private.tournaments x where x.code = p_code for update;
  if t.status <> 'on' then
    return jsonb_build_object('r', 'gone');
  end if;
  if t.writes >= 5000 then
    return jsonb_build_object('r', 'limit');
  end if;
  if p_data ? 'id' and (p_data ->> 'id') !~ '^[0-9]{1,3}$' then
    return jsonb_build_object('r', 'bad');
  end if;
  v_id := (p_data ->> 'id')::smallint;

  begin
    case p_op
      when 'settings' then
        if (p_data -> 'settings' ->> 'format') is distinct from t.format then
          return jsonb_build_object('r', 'bad');
        end if;
        update private.tournaments x set name = p_data ->> 'name', settings = p_data -> 'settings' where x.code = p_code;
      when 'team' then
        update private.tournament_teams x set name = p_data ->> 'name', short = nullif(p_data ->> 'short', '')
         where x.code = p_code and x.id = v_id;
        if not found then
          return jsonb_build_object('r', 'bad');
        end if;
      when 'fixture_add' then
        select count(*), coalesce(max(f.id), 0), coalesce(max(f.seq), -1) into v_n, v_max, v_seq
          from private.tournament_fixtures f where f.code = p_code;
        if v_n >= 300 or v_max >= 300 then
          return jsonb_build_object('r', 'limit');
        end if;
        insert into private.tournament_fixtures (code, id, stage, slot, round, seq, home, away, day, time)
        values (p_code, v_max + 1, coalesce(p_data ->> 'stage', 'league'), p_data ->> 'slot', (p_data ->> 'round')::smallint, least(v_seq + 1, 999),
                (p_data ->> 'home')::smallint, (p_data ->> 'away')::smallint, (p_data ->> 'day')::date, p_data ->> 'time');
      when 'fixture_edit' then
        update private.tournament_fixtures f
           set round = (p_data ->> 'round')::smallint, home = (p_data ->> 'home')::smallint, away = (p_data ->> 'away')::smallint,
               day = (p_data ->> 'day')::date, time = p_data ->> 'time', updated_at = now()
         where f.code = p_code and f.id = v_id and f.status <> 'removed';
        if not found then
          return jsonb_build_object('r', 'bad');
        end if;
      when 'fixture_remove' then
        update private.tournament_fixtures f set status = 'removed', updated_at = now()
         where f.code = p_code and f.id = v_id and f.status <> 'removed';
        if not found then
          return jsonb_build_object('r', 'bad');
        end if;
      when 'fixture_order' then
        if jsonb_typeof(p_data -> 'ids') is distinct from 'array' or jsonb_array_length(p_data -> 'ids') > 300 then
          return jsonb_build_object('r', 'bad');
        end if;
        update private.tournament_fixtures f set seq = o.n - 1, updated_at = now()
          from jsonb_array_elements_text(p_data -> 'ids') with ordinality as o (id, n)
         where f.code = p_code and f.id = o.id::smallint;
      when 'result' then
        update private.tournament_fixtures f
           set result = case when jsonb_typeof(p_data -> 'result') = 'object' then p_data -> 'result' end,
               home = coalesce(f.home, (p_data ->> 'home')::smallint),
               away = coalesce(f.away, (p_data ->> 'away')::smallint),
               updated_at = now()
         where f.code = p_code and f.id = v_id and f.status <> 'removed';
        if not found then
          return jsonb_build_object('r', 'bad');
        end if;
      when 'live_link' then
        if (p_data ->> 'live_code') is null or (p_data ->> 'live_code') !~ '^[a-z0-9]{12}$' then
          return jsonb_build_object('r', 'bad');
        end if;
        update private.tournament_fixtures f
           set live_code = p_data ->> 'live_code',
               live_result = case when f.live_code is distinct from p_data ->> 'live_code' then null else f.live_result end,
               live_rev = case when f.live_code is distinct from p_data ->> 'live_code' then 0 else f.live_rev end,
               home = coalesce(f.home, (p_data ->> 'home')::smallint),
               away = coalesce(f.away, (p_data ->> 'away')::smallint),
               updated_at = now()
         where f.code = p_code and f.id = v_id and f.status <> 'removed';
        if not found then
          return jsonb_build_object('r', 'bad');
        end if;
      when 'live_unlink' then
        update private.tournament_fixtures f set live_code = null, live_result = null, live_rev = 0, updated_at = now()
         where f.code = p_code and f.id = v_id and f.status <> 'removed';
        if not found then
          return jsonb_build_object('r', 'bad');
        end if;
      when 'remove' then
        update private.tournaments x set status = 'removed' where x.code = p_code;
      else
        return jsonb_build_object('r', 'bad');
    end case;
  exception
    when unique_violation then
      return jsonb_build_object('r', 'taken');
    when others then
      return jsonb_build_object('r', 'bad');
  end;
  update private.tournaments x set rev = x.rev + 1, writes = x.writes + 1, updated_at = now()
   where x.code = p_code
  returning x.rev into v_rev;
  return jsonb_build_object('r', 'ok', 'rev', v_rev);
end;
$$;

-- A finished live scorecard's result (lib/tournament/live.ts liveResultOf),
-- for every fixture linked to it, from the route that just took the
-- scorer's write (or read the finished match): only for a scorecard that is
-- finished, only a newer live rev than the one kept, never on a fixture
-- taken out or a tournament taken down. A result the organiser entered
-- stays in front of it (the app reads that first). {r, codes}: ok (the
-- tournaments changed), none, bad, unavailable.
create or replace function public.tournament_live_result(p_key text, p_live_code text, p_result jsonb, p_rev bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codes jsonb;
begin
  if not private.live_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_live_code is null or p_live_code !~ '^[a-z0-9]{12}$'
     or p_rev is null or p_rev <= 0
     or not private.tournament_live_result_ok(p_result) then
    return jsonb_build_object('r', 'bad');
  end if;
  if not exists (select 1 from public.live_matches m where m.code = p_live_code and m.status = 'done' and m.match is not null) then
    return jsonb_build_object('r', 'none');
  end if;
  with changed as (
    update private.tournament_fixtures f
       set live_result = p_result, live_rev = p_rev, updated_at = now()
     where f.live_code = p_live_code and f.status <> 'removed' and f.live_rev < p_rev
       and exists (select 1 from private.tournaments t where t.code = f.code and t.status = 'on')
    returning f.code
  ), bumped as (
    update private.tournaments t set rev = t.rev + 1, updated_at = now()
     where t.code in (select c.code from changed c)
    returning t.code
  )
  select jsonb_agg(b.code order by b.code) into v_codes from bumped b;
  if v_codes is null then
    return jsonb_build_object('r', 'none');
  end if;
  return jsonb_build_object('r', 'ok', 'codes', v_codes);
end;
$$;

-- ── Read ──────────────────────────────────────────────────────────────

-- What followers see: the tournament, its teams and its fixtures (not those
-- taken out), in the organiser's order. A tournament taken down says only
-- that. Never the secrets, the network hash, the account or the counts.
-- null: no such tournament (or no code).
create or replace function public.tournament_get(p_key text, p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t private.tournaments;
begin
  if not private.live_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_code is null or p_code !~ '^[a-z0-9]{12}$' then
    return null;
  end if;
  select * into t from private.tournaments x where x.code = p_code;
  if not found then
    return null;
  end if;
  if t.status <> 'on' then
    return jsonb_build_object('code', t.code, 'status', t.status, 'rev', t.rev, 'updated_at', t.updated_at);
  end if;
  return jsonb_build_object(
    'code', t.code,
    'status', t.status,
    'name', t.name,
    'settings', t.settings,
    'rev', t.rev,
    'created_at', t.created_at,
    'updated_at', t.updated_at,
    'teams', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'short', x.short) order by x.id), '[]'::jsonb)
                from private.tournament_teams x where x.code = p_code),
    'fixtures', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', f.id, 'stage', f.stage, 'slot', f.slot, 'round', f.round, 'seq', f.seq,
                   'home', f.home, 'away', f.away, 'day', f.day, 'time', f.time,
                   'result', f.result, 'live', f.live_code, 'live_result', f.live_result) order by f.seq, f.id), '[]'::jsonb)
                   from private.tournament_fixtures f where f.code = p_code and f.status <> 'removed'));
end;
$$;

-- ── Views ─────────────────────────────────────────────────────────────

-- One view, unique or not, of a tournament that is on (lib/live/views.ts
-- says what a view is; the route checks the agent and its limits first).
-- {r: ok, views, viewers}; none (no such tournament, or taken down); bad; unavailable.
create or replace function public.tournament_view_add(p_key text, p_code text, p_unique boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_views bigint;
  v_viewers bigint;
  v_one integer := case when p_unique is true then 1 else 0 end;
begin
  if not private.live_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_code is null or p_code !~ '^[a-z0-9]{12}$' then
    return jsonb_build_object('r', 'bad');
  end if;
  if not exists (select 1 from private.tournaments t where t.code = p_code and t.status = 'on') then
    return jsonb_build_object('r', 'none');
  end if;
  insert into private.tournament_views as v (code, views, viewers)
  values (p_code, 1, v_one)
  on conflict (code) do update
     set views = v.views + 1,
         viewers = v.viewers + v_one,
         last_viewed_at = now()
  returning v.views, v.viewers into v_views, v_viewers;
  return jsonb_build_object('r', 'ok', 'views', v_views, 'viewers', v_viewers);
end;
$$;

create or replace function public.tournament_view_count(p_key text, p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v private.tournament_views;
begin
  if not private.live_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_code is null or p_code !~ '^[a-z0-9]{12}$' then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v from private.tournament_views x where x.code = p_code;
  return jsonb_build_object('r', 'ok', 'views', coalesce(v.views, 0), 'viewers', coalesce(v.viewers, 0));
end;
$$;

-- ── Accounts ──────────────────────────────────────────────────────────

-- Keep a tournament with the signed-in organiser's account, from the browser
-- holding its secret (the route verified the sign-in). {r}: ok, known
-- (already this account's), other (another account's: the first stays),
-- forbidden (wrong secret), gone, bad (no such account), unavailable.
create or replace function public.tournament_attach(p_key text, p_code text, p_secret text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t private.tournaments;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_code is null or p_code !~ '^[a-z0-9]{12}$' or p_secret is null or p_secret !~ '^[0-9a-f]{64}$' or p_user_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into t from private.tournaments x where x.code = p_code;
  if not found or t.status <> 'on' then
    return jsonb_build_object('r', 'gone');
  end if;
  if not (sha256(convert_to(p_secret, 'UTF8')) = any(t.secret_hashes)) then
    return jsonb_build_object('r', 'forbidden');
  end if;
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  if t.user_id = p_user_id then
    return jsonb_build_object('r', 'known');
  end if;
  update private.tournaments x set user_id = p_user_id where x.code = p_code and x.user_id is null;
  if found then
    return jsonb_build_object('r', 'ok');
  end if;
  return jsonb_build_object('r', 'other');
end;
$$;

-- Another device of the organiser's account: its own secret, so it can
-- manage the tournament too. The 10 newest secrets are kept. {r}: ok, known,
-- forbidden (not this account's tournament), gone, bad, unavailable.
create or replace function public.tournament_device_add(p_key text, p_code text, p_user_id uuid, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t private.tournaments;
  v_hash bytea;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_code is null or p_code !~ '^[a-z0-9]{12}$' or p_secret is null or p_secret !~ '^[0-9a-f]{64}$' or p_user_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into t from private.tournaments x where x.code = p_code for update;
  if not found or t.status <> 'on' then
    return jsonb_build_object('r', 'gone');
  end if;
  if t.user_id is distinct from p_user_id then
    return jsonb_build_object('r', 'forbidden');
  end if;
  v_hash := sha256(convert_to(p_secret, 'UTF8'));
  if v_hash = any(t.secret_hashes) then
    return jsonb_build_object('r', 'known');
  end if;
  update private.tournaments x
     set secret_hashes = (x.secret_hashes || v_hash)[greatest(1, cardinality(x.secret_hashes) - 8):]
   where x.code = p_code;
  return jsonb_build_object('r', 'ok');
end;
$$;

-- The account's tournaments that are on, newest first (at most 50), for the Me tab.
create or replace function public.tournament_mine(p_key text, p_user_id uuid)
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
    select jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc)
      from (
        select t.code, t.name, t.format, t.status,
               (select count(*) from private.tournament_teams m where m.code = t.code)::integer as teams,
               (select count(*) from private.tournament_fixtures f where f.code = t.code and f.status <> 'removed')::integer as fixtures,
               (select count(*) from private.tournament_fixtures f
                 where f.code = t.code and f.status <> 'removed' and (f.result is not null or f.live_result is not null))::integer as played,
               t.created_at, t.updated_at
          from private.tournaments t
         where t.user_id = p_user_id and t.status = 'on'
         order by t.updated_at desc
         limit 50) x), '[]'::jsonb));
end;
$$;

-- ── Admin ─────────────────────────────────────────────────────────────

-- Every tournament, newest first: what it is, its counts, how many of its
-- matches are being scored live now (a live link taking updates: live, and
-- updated within 2 hours, as 20261029_live_idle_close.sql has it), its
-- views, and the account it is kept with. Never a secret or a network hash.
create or replace function public.admin_tournaments(p_firebase_token text default null)
returns table (
  code text,
  name text,
  format text,
  status text,
  playoffs text,
  teams integer,
  fixtures integer,
  played integer,
  live_now integer,
  views bigint,
  viewers bigint,
  organiser_id uuid,
  organiser_name text,
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
  select t.code,
         t.name,
         t.format,
         t.status,
         t.settings ->> 'playoffs',
         (select count(*) from private.tournament_teams m where m.code = t.code)::integer,
         (select count(*) from private.tournament_fixtures f where f.code = t.code and f.status <> 'removed')::integer,
         (select count(*) from private.tournament_fixtures f
           where f.code = t.code and f.status <> 'removed' and (f.result is not null or f.live_result is not null))::integer,
         (select count(*) from private.tournament_fixtures f
            join public.live_matches l on l.code = f.live_code
           where f.code = t.code and f.status <> 'removed' and f.result is null
             and l.status = 'live' and l.updated_at > now() - interval '2 hours')::integer,
         coalesce(v.views, 0),
         coalesce(v.viewers, 0),
         t.user_id,
         left(u.name::text, 60),
         t.created_at,
         t.updated_at
    from private.tournaments t
    left join private.tournament_views v on v.code = t.code
    left join public.users u on u.id = t.user_id
   order by t.created_at desc, t.code;
end;
$$;

-- ── Grants ────────────────────────────────────────────────────────────

-- Callable with the anon key; the key check inside each is the gate, as for live_match_put.
revoke all on function public.tournament_create(text, text, text, jsonb, text) from public;
revoke all on function public.tournament_update(text, text, text, text, jsonb) from public;
revoke all on function public.tournament_live_result(text, text, jsonb, bigint) from public;
revoke all on function public.tournament_get(text, text) from public;
revoke all on function public.tournament_view_add(text, text, boolean) from public;
revoke all on function public.tournament_view_count(text, text) from public;
revoke all on function public.tournament_attach(text, text, text, uuid) from public;
revoke all on function public.tournament_device_add(text, text, uuid, text) from public;
revoke all on function public.tournament_mine(text, uuid) from public;
revoke all on function public.admin_tournaments(text) from public;
grant execute on function public.tournament_create(text, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.tournament_update(text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.tournament_live_result(text, text, jsonb, bigint) to anon, authenticated;
grant execute on function public.tournament_get(text, text) to anon, authenticated;
grant execute on function public.tournament_view_add(text, text, boolean) to anon, authenticated;
grant execute on function public.tournament_view_count(text, text) to anon, authenticated;
grant execute on function public.tournament_attach(text, text, text, uuid) to anon, authenticated;
grant execute on function public.tournament_device_add(text, text, uuid, text) to anon, authenticated;
grant execute on function public.tournament_mine(text, uuid) to anon, authenticated;
grant execute on function public.admin_tournaments(text) to anon, authenticated;

-- ── Hourly ────────────────────────────────────────────────────────────

-- At 23 past (cron.schedule replaces a job of the same name): network
-- hashes are cleared at 47 hours, so none is kept past 2 days. The create
-- limits look back 24 hours at most. Reads only rows still holding a hash.
create index if not exists tournaments_iphash_created_idx on private.tournaments (created_at) where ip_hash is not null;
select cron.schedule(
  'live-tournaments-iphash',
  '23 * * * *',
  $$update private.tournaments
       set ip_hash = null
     where ip_hash is not null and created_at < now() - interval '47 hours'$$
);
