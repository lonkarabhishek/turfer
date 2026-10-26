-- Cache queue: list purges at most once per gap (default 15 minutes).
--
-- Every list:<city> key becomes revalidateTag("turf-data", "max") in
-- /api/revalidate, and that one tag covers every list page, the home
-- extras and the trending picks: each post marks all 32 turf-row pieces
-- stale everywhere, and each stale piece costs a full read of the active
-- turfs (3,183 rows, ~7 statements) the next time it is read. On the
-- 26 Oct import day a city was imported every 20-60 minutes, and every
-- import set off two or three purges a few minutes apart (the per-row
-- webhook, the queue flush, and a resend when pg_net kept no response).
--
-- Now list:* keys wait in private.cache_list_dirty and
-- private.flush_lists() posts them at most once per
-- private.cache_list_state.gap. turf:<key> and games keys stay in
-- private.cache_dirty and private.flush_cache() as before, so a turf's
-- own page still refreshes within about a minute (at once when urgent).
-- The first list change after a quiet gap goes out as fast as before
-- (45 s after the burst settles); later ones wait for the gap. Urgent
-- marks do not skip the gap for lists: the owner's own page is urgent,
-- the cards follow within the gap.
--
-- No row is ever removed: cache_list_dirty holds one row per city key
-- (about 90). A row is waiting while posted_at is null.
--
-- Tune without a migration (an import day can take an hour):
--   update private.cache_list_state set gap = interval '60 minutes' where id;
-- List purges (nearly) every minute again, the smallest gap:
--   update private.cache_list_state set gap = interval '2 minutes' where id;
--
-- Once 20261026_cache_list_snapshot.sql is applied, flush_lists() is also
-- the only builder of the list pages' rows (it builds before every list
-- post, and hourly). Then keep flush-lists scheduled and the list keys in
-- cache_list_dirty: unscheduling it, or sending list keys through
-- flush_cache() again, posts purges with no build, and every list page
-- rebuilds from the last build. Lower the gap instead (above). Re-running
-- this file is safe: it keeps the snapshot's flush_lists() when
-- private.build_turf_list() exists.
-- Full revert, only while the snapshot is not applied (or after the app is
-- back on code that reads the table, 835ae43's lib/queries/turfs.ts):
-- re-run private.mark_dirty() from 20261020_cache_queue.sql, then
--   select cron.unschedule('flush-lists');
--   select private.mark_dirty(array_agg(key)) from private.cache_list_dirty where posted_at is null;
-- supabase/tests/20261020_cache_queue_classes.sql: its queued() helper
-- must read both tables (list keys now land in cache_list_dirty).

create table if not exists private.cache_list_dirty (
  key        text primary key check (key like 'list:%'),
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  -- set when a post carried this change; cleared again by a newer change
  posted_at  timestamptz,
  marked_xid xid8
);
revoke all on private.cache_list_dirty from public, anon, authenticated;

create table if not exists private.cache_list_state (
  id           boolean primary key default true check (id),
  -- 2 min: a post's response is in by then (15 s timeout); 6 h: pg_net.ttl keeps it that long.
  gap         interval not null default interval '15 minutes' check (gap between interval '2 minutes' and interval '6 hours'),
  last_post    timestamptz,
  last_request bigint
);
revoke all on private.cache_list_state from public, anon, authenticated;
insert into private.cache_list_state (id) values (true) on conflict do nothing;

-- As in 20261020_cache_queue.sql, except that list:* keys go to
-- cache_list_dirty (urgency does not apply to them).
create or replace function private.mark_dirty(p_keys text[], p_urgent boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_xid constant xid8 := pg_current_xact_id();
  v_urgent constant boolean := coalesce(p_urgent, false);
  k text;
begin
  foreach k in array coalesce((select array_agg(distinct x) from unnest(p_keys) x where x is not null), '{}'::text[]) loop
    if k like 'list:%' then
      -- Already noted by this transaction: it holds the row's lock, so no
      -- list post can have carried it meanwhile.
      continue when exists (
        select 1 from private.cache_list_dirty d where d.key = k and d.marked_xid = v_xid
      );
      insert into private.cache_list_dirty as d (key, marked_xid)
      values (k, v_xid)
      on conflict (key) do update set
        first_at   = case when d.posted_at is null then d.first_at else now() end,
        last_at    = now(),
        posted_at  = null,
        marked_xid = excluded.marked_xid;
      continue;
    end if;
    continue when exists (
      select 1 from private.cache_dirty d where d.key = k and d.marked_xid = v_xid and (d.urgent or not v_urgent)
    );
    insert into private.cache_dirty as d (key, urgent, marked_xid)
    values (k, v_urgent, v_xid)
    on conflict (key) do update set
      first_at   = case when d.sent_at is null then d.first_at else now() end,
      last_at    = now(),
      urgent     = case when d.sent_at is null then d.urgent or excluded.urgent else excluded.urgent end,
      sent_at    = null,
      request_id = null,
      marked_xid = excluded.marked_xid;
  end loop;
end;
$$;

-- Every minute: post the waiting list keys when the gap since the last
-- list post has passed and the changes have settled (newest 45 s old) or
-- the oldest has waited 3 minutes. A post without a 2xx (error, timeout,
-- or no response kept, as happened to 7 of 18 queue posts on 26 Oct)
-- goes again at the next window, not after 3 minutes.
-- After 20261026_cache_list_snapshot.sql the snapshot's flush_lists() (the
-- same, plus the build) stays: this one would post purges without building.
do $do$
begin
  if to_regprocedure('private.build_turf_list()') is not null then
    raise notice 'flush_lists: keeping the list snapshot''s version (20261026_cache_list_snapshot.sql)';
    return;
  end if;
  execute $fn$
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
begin
  if not pg_try_advisory_xact_lock(hashtext('private.flush_lists')) then
    return;
  end if;
  select * into v_state from private.cache_list_state where id for update;
  if v_state.last_post > v_now - v_state.gap then
    return;
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
    return;
  end if;
  if not (v_last < v_now - interval '45 seconds' or v_first < v_now - interval '3 minutes') then
    return;
  end if;

  select array_agg(key order by key) into v_keys from (
    select d.key from private.cache_list_dirty d
     where d.posted_at is null
       for update of d skip locked
  ) s;
  if v_keys is null then
    return;
  end if;
  v_secret := (select value from private.app_secrets where name = 'revalidate');
  if v_secret is null then
    raise warning 'flush_lists: no revalidate secret in private.app_secrets';
    return;
  end if;
  v_req := net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-revalidate-secret', v_secret),
    body    := jsonb_build_object('keys', to_jsonb(v_keys)),
    timeout_milliseconds := 15000
  );
  update private.cache_list_dirty set posted_at = v_now where key = any (v_keys);
  update private.cache_list_state set last_post = v_now, last_request = v_req where id;
end;
$$
$fn$;
end;
$do$;
revoke all on function private.mark_dirty(text[], boolean), private.flush_lists() from public, anon, authenticated;

-- A list:* key queued in cache_dirty before this runs is sent once by
-- flush_cache() as before; mark_dirty() no longer adds any there.
-- At most 30 s per tick (a SET inside the function would not bound the
-- statement already running); 20261026_cache_list_snapshot.sql schedules the same command.
select cron.schedule('flush-lists', '* * * * *', $$set statement_timeout = '30s'; select private.flush_lists()$$);
