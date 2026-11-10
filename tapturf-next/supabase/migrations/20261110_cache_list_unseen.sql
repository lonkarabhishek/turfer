-- The hourly list build queues what it found changed (10 Nov 2026).
--
-- private.flush_lists() (20261026_cache_list_snapshot.sql) rebuilds the
-- turf list snapshot at least once an hour even on a tick that posts
-- nothing, "which keeps the old hourly freshness for writes no trigger
-- saw": the version moves only when the rows changed, and until 10 Nov the
-- list pages picked it up on their own timers (10 minutes to an hour, the
-- list version entry an hour). Every write a trigger sees already waits as
-- a list:<city> or turf:<key> key and is built and posted. Since 10 Nov
-- the list pages are kept a day and the turf pages a week, each purged by
-- its own keys (turf-data:<city> and turf-data:india tags,
-- app/api/revalidate), so such a version would otherwise reach a city page
-- within a day and a turf page within a week.
--
-- Now every build compares the turfs' list rows (CARD_COLUMNS: prices,
-- hours, name, photos, rating, active) before and after it, and when it
-- moved the version, queues the keys of the turfs it changed: list:<city>
-- for the old and the new city, turf:<slug> for the old and the new slug
-- (or id). Both builds do it:
--   the build before a list post: on a busy day it is the one that takes
--   in such a write, since every post stamps built_at and the hourly build
--   then seldom runs. The list keys no waiting key carries go out with
--   this same post (and are marked posted, so a failed post sends them
--   again, as the others); the turf keys go to flush_cache (about a
--   minute). A turf a trigger saw too gets its page key again: one more
--   render of that page per such edit (about 25 turf purges on 9 Nov).
--   the hourly build on a tick that posts nothing: the list keys wait for
--   the next list post (the gap, 15 minutes by default), the turf keys go
--   to flush_cache.
-- A build with nothing changed queues nothing. On 10 Nov the live snapshot
-- (v144, 3,857 rows) changed last at a list post (changed_at = last_post):
-- this is a backstop for bulk fixes run with triggers off, not a new
-- stream of purges.
--
-- The comparison parses the current version's parts once before the build
-- and once after it (about 0.43 s each on 10 Nov, measured read-only on
-- production): about 0.9 s more per list post (at most one per gap) and per
-- hourly build, well inside the tick's 30 s.
--
-- Replaces private.flush_lists() only (as in 20261026_cache_list_snapshot.sql,
-- plus the comparison and queueing in both builds). Production md5(prosrc) before this file,
-- read with a SELECT on 10 Nov 2026 (twice, the second after the post
-- build's comparison was added), the same as the repository's
-- 20261026_cache_list_snapshot.sql body:
--   private.flush_lists()               f6f50f906813b213c5675f8c1bba82cc
-- and, unchanged here, what it calls:
--   private.build_turf_list()           ea7f6e22f13d268e2d4bc66910d40fa5
--   private.mark_dirty(text[], boolean) 37bd49deeb876dea1d0ba207a8969ce0
--   private.list_key(text)              0019493d8e0c9f856ff9f335f2eac6bd
-- Adds private.turf_list_rows_now() and private.turf_list_changed_keys().
-- Additive and safe to run again; nothing is removed. Works with the app
-- before or after 10 Nov (the keys are the ones the triggers queue). Check:
-- scripts/sql-tests/cache_list_unseen.check.mjs.

-- What the pages show now, per turf: {id: [md5 of its list row, city, slug]}
-- from the current snapshot version, or {} before the first build.
create or replace function private.turf_list_rows_now()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(r->>'id', jsonb_build_array(md5(r::text), r->>'city', r->>'slug')), '{}'::jsonb)
    from private.turf_list_state s
    join private.turf_list_parts p on p.version = s.version and p.part < s.parts
    cross join lateral json_array_elements(p.rows) r
   where s.id and s.version > 0;
$$;

-- The keys of every turf whose row differs between two such maps (added,
-- changed or gone): its city's list key and its page key, old and new.
-- Null when nothing differs, or when there was nothing before (a first
-- build: the pages read the table then, and nothing was cached from a
-- snapshot).
create or replace function private.turf_list_changed_keys(p_before jsonb, p_after jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case when p_before is null or p_before = '{}'::jsonb then null else (
    select array_agg(distinct k order by k)
      from (
        select x.id, x.side, x.v
          from (
            select b.key as id, 'before' as side, b.value as v from jsonb_each(p_before) b
            union all
            select a.key, 'after', a.value from jsonb_each(coalesce(p_after, '{}'::jsonb)) a
          ) x
         where (p_before->(x.id)->>0) is distinct from (coalesce(p_after, '{}'::jsonb)->(x.id)->>0)
      ) c
      cross join lateral unnest(array[
        private.list_key(c.v->>1),
        'turf:' || lower(coalesce(nullif(c.v->>2, ''), c.id))
      ]) k
     where k is not null
  ) end;
$$;

revoke all on function private.turf_list_rows_now(), private.turf_list_changed_keys(jsonb, jsonb) from public, anon, authenticated;

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
  v_before jsonb;
  v_found  text[];
  v_pages  text[];
  v_more   text[];
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

    -- The rows first, holding no key's lock, and what changed in them:
    -- besides the writes the waiting keys carry, the build can take in a
    -- write no trigger saw (no key waits for it). Its turfs' pages go to
    -- flush_cache now; their lists go out with this post, below.
    v_snap := pg_current_snapshot();
    v_before := private.turf_list_rows_now();
    if private.build_turf_list() then
      v_found := private.turf_list_changed_keys(v_before, private.turf_list_rows_now());
    end if;
    v_pages := array(select k from unnest(v_found) k where k like 'turf:%' order by k);
    if cardinality(v_pages) > 0 then
      perform private.mark_dirty(v_pages, false);
    end if;

    select array_agg(key order by key) into v_keys from (
      select d.key from private.cache_list_dirty d
       where d.posted_at is null
         and (d.marked_xid is null
              or d.marked_xid = pg_current_xact_id_if_assigned()
              or pg_visible_in_snapshot(d.marked_xid, v_snap))
         for update of d skip locked
    ) s;

    -- The changed lists no waiting key carries. Marked posted with the
    -- rest (a failed post queues them again at the next window, above):
    -- a city never queued, or one posted before and held by no open
    -- transaction. A key still waiting that the select above passed over
    -- (an open transaction holds it, or it was marked after the snapshot)
    -- keeps waiting: it goes out with the next post, built after its write.
    v_more := array(select k from unnest(v_found) k where k like 'list:%' and k <> all (coalesce(v_keys, '{}'::text[])) order by k);
    if cardinality(v_more) > 0 then
      update private.cache_list_dirty d set first_at = v_now, last_at = v_now, posted_at = v_now
       where d.key in (
         select x.key from private.cache_list_dirty x
          where x.key = any (v_more) and x.posted_at is not null
            for update of x skip locked);
      insert into private.cache_list_dirty (key, first_at, last_at, posted_at)
      select k, v_now, v_now, v_now from unnest(v_more) k
      on conflict (key) do nothing;
    end if;

    if v_keys is null and cardinality(v_more) = 0 then
      exit post;
    end if;
    v_req := net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-revalidate-secret', v_secret),
      body    := jsonb_build_object('keys', to_jsonb(array(
                   select distinct k from unnest(coalesce(v_keys, '{}'::text[]) || v_more) k order by k))),
      timeout_milliseconds := 15000
    );
    update private.cache_list_dirty set posted_at = v_now where key = any (v_keys);
    update private.cache_list_state set last_post = v_now, last_request = v_req where id;
    return;
  end;

  -- Nothing posted this tick: rebuild at least hourly anyway. The version
  -- moves only if something changed that no list key carried: a write no
  -- trigger saw (every write a trigger sees waits as a key and is built
  -- and posted above). Since 10 Nov the pages no longer pick that up on an
  -- hour's timer (list pages are kept a day, turf pages a week, each purged
  -- by its own keys), so the keys of exactly the turfs whose list row the
  -- build changed are queued: their city's lists (old and new city) and
  -- their page (old and new slug). The lists go out with the next list
  -- post, the pages with flush_cache's next post.
  if coalesce((select s.built_at from private.turf_list_state s where s.id) < v_now - interval '1 hour', true) then
    v_before := private.turf_list_rows_now();
    if private.build_turf_list() then
      v_keys := private.turf_list_changed_keys(v_before, private.turf_list_rows_now());
      if v_keys is not null then
        perform private.mark_dirty(v_keys, false);
      end if;
    end if;
  end if;
end;
$$;
revoke all on function private.flush_lists() from public, anon, authenticated;
