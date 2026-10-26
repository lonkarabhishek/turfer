-- The turf list pages' rows, built once per list purge in the database
-- instead of read in full by every page regeneration.
--
-- 26 Oct import day: every regeneration of a list page (/<city>,
-- /<city>/<sport>, /sport/*, /turfs, /turf-near-me, /) read every active
-- turf: 7 sorted statements of card columns, about 8.6 MB for 3,183 rows.
-- The app kept the rows in Next's data cache (32 unstable_cache pieces), but
-- a page Vercel regenerates skips every unstable_cache read
-- (isOnDemandRevalidate in next's unstable-cache.js), so the pieces never
-- served one. That was 11 to 100 full reads per purge, reads of 8 to 16 s
-- when they piled up, and 5 s timeouts (116 statement timeouts in 24 h).
--
-- Now:
--   private.build_turf_list()  runs the sorted read once, in one statement,
--       and keeps the result as parts of about part_bytes (1 MB) of row
--       JSON each (at most that plus one row), under a version number. The version moves only when the
--       rows or the column list changed. The app shares each part through
--       Next's data cache, which refuses entries over 2 MB.
--   private.flush_lists()  (the list cap, 20261026_cache_list_cap.sql)
--       builds right before it posts list keys to /api/revalidate. pg_net
--       sends only after commit, so a purge never reaches the site before
--       its rows. A tick that posts nothing still builds once an hour,
--       which keeps the old hourly freshness for writes no trigger saw. A
--       failed build fails the tick: nothing is posted, the next tick tries
--       again. The build holds no list key's lock (writers never wait for
--       it), and the cron command bounds a tick to 30 s.
--   public.turf_list_version()  {v, n, parts, cols, age_s, built}: what a
--       page regeneration reads (one tiny row). built (epoch ms) moves on
--       every build, changed or not.
--   public.turf_list_part(i)  {v, n, parts, rows}: one prebuilt part by
--       primary key, only while it belongs to the current version, so a
--       part left over from a longer list never mixes in.
-- Each server process keeps one copy of the rows per version
-- (lib/cache/rowStore.ts), so a purge costs one build in the database and
-- one fetch of the parts per process. The parts carry only CARD_COLUMNS of
-- active turfs, which anon can already read from public.turfs.
--
-- The version must only ever grow: the app treats a version's parts as
-- fixed (it caches them by version, with no expiry). Never reset
-- private.turf_list_state; to force a rebuild, run private.build_turf_list().
--
-- v_cols below is CARD_COLUMNS in lib/queries/turfs.ts; keys.test.ts checks
-- the two agree. The app uses a snapshot that has every column it selects
-- (extra ones are ignored), so to add a card column replace this function
-- first, then ship the code. Code that selects a column the snapshot lacks
-- reads the table itself, once per build per process, until it has it.
--
-- flush-lists is the only builder: keep it scheduled. To post list purges
-- (nearly) every minute again, lower the gap instead:
--   update private.cache_list_state set gap = interval '2 minutes' where id;
-- Re-running 20261026_cache_list_cap.sql keeps this file's flush_lists().
-- To go back to the app reading the table, ship code that does (835ae43's
-- lib/queries/turfs.ts) first; this file can then stay.
--
-- APPLY AFTER 20261026_cache_list_cap.sql (this replaces its
-- flush_lists()) and BEFORE the code that calls turf_list_version: a build
-- without these functions fails, so production stays on the deployment it
-- has. Harmless to the code running now. Additive: tables, functions and
-- one build; parts are updated in place, never removed. Safe to run again.

create table if not exists private.turf_list_state (
  id         boolean primary key default true check (id),
  version    bigint not null default 0,
  n          int not null default 0,
  parts      int not null default 0,
  cols       text,
  hash       text,
  -- last build, changed or not (age_s, built), and last build that changed something
  built_at   timestamptz,
  changed_at timestamptz,
  -- Row JSON per part. A Next data cache entry holds 2 MB, and the escaping
  -- it adds takes about 5% more: 1.5 MB is the most that fits.
  part_bytes int not null default 1000000 check (part_bytes between 10000 and 1500000)
);
alter table private.turf_list_state
  add column if not exists part_bytes int not null default 1000000 check (part_bytes between 10000 and 1500000);
revoke all on private.turf_list_state from public, anon, authenticated;
insert into private.turf_list_state (id) values (true) on conflict do nothing;

create table if not exists private.turf_list_parts (
  part    int primary key check (part between 0 and 199),
  version bigint not null,
  rows    json not null
);
revoke all on private.turf_list_parts from public, anon, authenticated;

-- One sorted read of the active turfs into parts, in the order the pages
-- used to read them (rating high to low, no rating first, then id). A part
-- holds the rows that start inside its part_bytes window of row JSON, so it
-- is at most part_bytes plus one row, however wide rows get. Returns true
-- when the version moved, false when nothing changed (then it only stamps
-- built_at). Raises when there are no active turfs at all: that is a broken
-- read or an accident, and keeping the last list beats emptying every
-- listing.
create or replace function private.build_turf_list()
returns boolean
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  -- lib/queries/turfs.ts CARD_COLUMNS, same order.
  v_cols constant text[] := array[
    'id', 'slug', 'name', 'address', 'area', 'city', 'sports', 'images', 'cover_image',
    'rating', 'total_reviews', 'lat', 'lng',
    'morning_price', 'afternoon_price', 'evening_price',
    'weekend_morning_price', 'weekend_afternoon_price', 'weekend_evening_price',
    'price_mentions', 'price_unit', 'slot_minutes', 'is_covered', 'has_floodlights',
    'start_time', 'end_time', 'is_24x7', 'membership_required', 'is_active',
    'amenities', 'parking_available', 'washroom_available', 'changing_room_available', 'has_cafeteria', 'equipment_provided',
    'image_review',
    'claimed'
  ];
  v_cols_text constant text := array_to_string(v_cols, ', ');
  v_state private.turf_list_state;
  v_parts json[];
  v_n int;
  v_hash text;
  v_version bigint;
begin
  -- One build at a time (the cron tick and a migration's own build).
  select * into v_state from private.turf_list_state where id for update;

  -- One pass in index order: each row's JSON, its size, its place and the
  -- bytes before it (the window it starts in). Then one sort of the small
  -- rows into parts. offset 0 keeps to_jsonb computed once per row. On
  -- 26 Oct, under EXPLAIN ANALYZE: 0.36 s for 3,209 turfs (the 500-row
  -- form of this statement took 2.6 s at the same time).
  execute format($q$
    with c as (
      select x.r, row_number() over w as rn__, sum(x.len) over w - x.len as before__
        from public.turfs t
       cross join lateral (
         select y.r, octet_length(y.r::text) as len
           from (select to_jsonb(s) as r from (select %s) s offset 0) y
       ) x
       where t.is_active
      window w as (order by t.rating desc, t.id)
    ), p as (
      select c.before__ / %s as win,
             json_agg(c.r order by c.rn__) as rows,
             count(*) as n,
             md5(string_agg(c.r::text, E'\n' order by c.rn__)) as h
        from c
       group by 1
    )
    -- Parts are numbered by position below, so a window a wide row
    -- skipped leaves no gap.
    select array_agg(p.rows order by p.win), coalesce(sum(p.n), 0)::int, md5(coalesce(string_agg(p.h, ',' order by p.win), ''))
      from p
  $q$, (select string_agg(format('t.%I', c), ', ') from unnest(v_cols) c), v_state.part_bytes)
  into v_parts, v_n, v_hash;

  if v_n = 0 then
    raise exception 'build_turf_list: no active turfs, keeping version %', v_state.version;
  end if;
  if cardinality(v_parts) > 200 then
    raise exception 'build_turf_list: % parts of % bytes, more than 200: raise part_bytes', cardinality(v_parts), v_state.part_bytes;
  end if;

  if v_state.version > 0 and v_state.hash = v_hash and v_state.cols = v_cols_text then
    update private.turf_list_state set built_at = now() where id;
    return false;
  end if;

  v_version := v_state.version + 1;
  insert into private.turf_list_parts as p (part, version, rows)
  select i - 1, v_version, v_parts[i] from generate_subscripts(v_parts, 1) as i
  on conflict (part) do update set version = excluded.version, rows = excluded.rows;
  update private.turf_list_state
     set version = v_version, n = v_n, parts = cardinality(v_parts), cols = v_cols_text, hash = v_hash,
         built_at = now(), changed_at = now()
   where id;
  return true;
end;
$$;
revoke all on function private.build_turf_list() from public, anon, authenticated;

-- What a page regeneration reads: null until the first build.
create or replace function public.turf_list_version()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object('v', s.version, 'n', s.n, 'parts', s.parts, 'cols', s.cols,
                           'age_s', floor(extract(epoch from now() - s.built_at))::bigint,
                           'built', floor(extract(epoch from s.built_at) * 1000)::bigint)
    from private.turf_list_state s
   where s.id and s.version > 0;
$$;

-- One part of the current version, or null (no such part, or a part left
-- over from an older, longer list). State and part are read in one
-- statement, so the answer is never half one version and half another.
create or replace function public.turf_list_part(p_part int)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object('v', s.version, 'n', s.n, 'parts', s.parts, 'rows', p.rows)
    from private.turf_list_state s
    join private.turf_list_parts p on p.part = p_part and p.version = s.version
   where s.id and s.version > 0 and p_part between 0 and s.parts - 1;
$$;
revoke all on function public.turf_list_version(), public.turf_list_part(int) from public;
grant execute on function public.turf_list_version(), public.turf_list_part(int) to anon, authenticated, service_role;

-- As in 20261026_cache_list_cap.sql, plus the build: right before a post,
-- or once an hour on a tick that posts nothing.
--
-- The build runs before any list key is locked. A turf write in a waiting
-- city updates its key row (mark_dirty), so a lock held across the build
-- would make owners' saves and imports wait for it. Instead the build goes
-- first, and the post carries only the keys whose last change was committed
-- before the build began (visible in v_snap, taken just before it; the
-- build's own statement is later, so it has those changes), plus any this
-- transaction marked itself. A key changed again after v_snap stays waiting
-- for the next post, which builds again.
create or replace function private.flush_lists()
returns void
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_url    constant text := 'https://www.tapturf.in/api/revalidate';
  v_now    constant timestamptz := now();
  v_state  private.cache_list_state;
  v_ok     boolean;
  v_last   timestamptz;
  v_first  timestamptz;
  v_keys   text[];
  v_secret text;
  v_req    bigint;
  v_snap   pg_snapshot;
begin
  if not pg_try_advisory_xact_lock(hashtext('private.flush_lists')) then
    return;
  end if;

  <<post>>
  begin
    select * into v_state from private.cache_list_state where id for update;
    if v_state.last_post > v_now - v_state.gap then
      exit post;
    end if;

    -- The last post never got a 2xx: what it carried, unchanged since,
    -- waits again. Rows an open transaction holds are skipped: that
    -- transaction marks them waiting itself.
    if v_state.last_request is not null then
      select coalesce(bool_or(r.status_code between 200 and 299), false) into v_ok
        from net._http_response r where r.id = v_state.last_request;
      if not v_ok then
        update private.cache_list_dirty set posted_at = null
         where key in (
           select d.key from private.cache_list_dirty d
            where d.posted_at = v_state.last_post
              for update of d skip locked);
      end if;
      update private.cache_list_state set last_request = null where id;
    end if;

    select max(last_at), min(first_at) into v_last, v_first
      from private.cache_list_dirty where posted_at is null;
    if v_first is null then
      exit post;
    end if;
    if not (v_last < v_now - interval '45 seconds' or v_first < v_now - interval '3 minutes') then
      exit post;
    end if;
    v_secret := (select value from private.app_secrets where name = 'revalidate');
    if v_secret is null then
      raise warning 'flush_lists: no revalidate secret in private.app_secrets';
      exit post;
    end if;

    -- The rows first, holding no key's lock.
    v_snap := pg_current_snapshot();
    perform private.build_turf_list();

    select array_agg(key order by key) into v_keys from (
      select d.key from private.cache_list_dirty d
       where d.posted_at is null
         and (d.marked_xid is null
              or d.marked_xid = pg_current_xact_id_if_assigned()
              or pg_visible_in_snapshot(d.marked_xid, v_snap))
         for update of d skip locked
    ) s;
    if v_keys is null then
      exit post;
    end if;
    v_req := net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-revalidate-secret', v_secret),
      body    := jsonb_build_object('keys', to_jsonb(v_keys)),
      timeout_milliseconds := 15000
    );
    update private.cache_list_dirty set posted_at = v_now where key = any (v_keys);
    update private.cache_list_state set last_post = v_now, last_request = v_req where id;
    return;
  end;

  -- Nothing posted this tick: rebuild at least hourly anyway. The version
  -- moves only if something changed, and pages pick it up on their timers.
  if coalesce((select s.built_at from private.turf_list_state s where s.id) < v_now - interval '1 hour', true) then
    perform private.build_turf_list();
  end if;
end;
$$;
revoke all on function private.flush_lists() from public, anon, authenticated;

-- Every minute, at most 30 s per tick (a SET inside the function would not
-- bound the statement already running). The same command as the cap file's.
select cron.schedule('flush-lists', '* * * * *', $$set statement_timeout = '30s'; select private.flush_lists()$$);

-- The first build, so the deployment that reads it finds a version. A
-- database with no active turfs (a fresh branch) keeps version 0: the app
-- then reads the table itself, as before.
do $$
begin
  if exists (select 1 from public.turfs where is_active) then
    perform private.build_turf_list();
  end if;
end;
$$;
