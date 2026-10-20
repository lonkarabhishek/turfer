-- Cache queue: database changes reach the site's caches as one small
-- batch a minute instead of one webhook per changed row.
--
-- 19/20 Oct outage follow-up. notify_turf_change() posted the whole row
-- (about 21 KB) to /api/revalidate for every changed turfs or
-- trending_turfs row: 1,474 posts in 24 h, 784 in the peak hour, up to
-- 200 at once for one bulk statement. Each post expired every turf cache
-- and about 990 pages, which then rebuilt by reading the whole turf table
-- again. Imports and admin AI batches (listing_review, review_summary)
-- sent one such storm per row.
--
-- Now a trigger only notes a key in private.cache_dirty (no HTTP call):
--   list:<city>  the lists showing that city's turfs changed
--   turf:<key>   one turf page (slug, or id for the /turf/<id> redirect)
--   games        open games changed
-- and private.flush_cache(), run by pg_cron every minute, posts the
-- pending keys in one request ({"keys": [...]}) once changes have settled.
-- An 800-row import becomes one or two purges instead of 800.
--
-- turfs columns fall in three classes (lib/cache/keys.ts has the same
-- lists; its test checks they match this file):
--   IGNORE  admin passes and provenance stamps no public page renders:
--           a change to only these queues nothing.
--   LIST    what list pages read (CARD_COLUMNS in lib/queries/turfs.ts
--           plus is_active, city, slug): queues list:<city> and the page.
--   DETAIL  every other column, including any added later: queues only
--           turf:<slug>. A new column is never ignored by default.
--
-- Owner saves (owner_update_turf) and claim decisions
-- (admin_decide_owner_claim) are urgent: sent at the next tick instead of
-- waiting for a quiet period. The owner's own page is also revalidated
-- at once by /api/my/revalidate. Both functions stay as they are: a
-- trigger on turf_edit_log (written only by owner_update_turf, in the
-- same transaction as its update) and the turf_owners trigger mark the
-- keys urgent. (ALTER FUNCTION ... SET tapturf.cache_urgent needs a
-- superuser on Supabase, and a later CREATE OR REPLACE would drop it.)
-- Any other writer can still make its keys urgent with
-- set_config('tapturf.cache_urgent', 'on', true) before it writes.
--
-- APPLY AFTER the /api/revalidate that accepts {"keys": [...]} is live:
-- the old route would treat a batch as a full storm. Both paths run side
-- by side until 20261020_cache_queue_step2_drop_old_notify.sql removes the
-- per-row webhook. Test with supabase/tests/20261020_cache_queue_classes.sql.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.cache_dirty (
  key        text primary key,
  -- first unsent change and latest change (for the send rules below)
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  urgent     boolean not null default false,
  -- set when a flush posted the key; cleared again by a newer change
  sent_at    timestamptz,
  request_id bigint,
  -- the transaction that last noted the key (lets a bulk statement note
  -- each key once instead of once per row)
  marked_xid xid8
);
revoke all on private.cache_dirty from public, anon, authenticated;

create table if not exists private.cache_flush_state (
  id                  boolean primary key default true check (id),
  last_flush          timestamptz,
  last_trending_check timestamptz not null default now()
);
revoke all on private.cache_flush_state from public, anon, authenticated;
insert into private.cache_flush_state (id) values (true) on conflict do nothing;

-- list:<city>; a turf with no usable city still shows on the all-India lists.
create or replace function private.list_key(p_city text)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'list:' || case when p_city ~ '^[a-z][a-z-]{1,30}$' then p_city else 'all' end;
$$;

-- turf:<slug> (or turf:<id> for a turf without one); null if the turf is gone.
create or replace function private.turf_key(p_turf_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'turf:' || lower(coalesce(t.slug, t.id::text)) from public.turfs t where t.id = p_turf_id;
$$;

-- Note keys as changed. A key already sent goes back to unsent, with a
-- fresh first_at, so the change after the send is not lost.
create or replace function private.mark_dirty(p_keys text[], p_urgent boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_xid constant xid8 := pg_current_xact_id();
  -- current_setting(..., true) is null where the setting was never set.
  v_urgent constant boolean := coalesce(p_urgent, false);
  k text;
begin
  foreach k in array coalesce((select array_agg(distinct x) from unnest(p_keys) x where x is not null), '{}'::text[]) loop
    -- Already noted by this transaction (one bulk statement touches the
    -- same city key hundreds of times): nothing to add. This transaction
    -- holds that row's lock, so no flush can have sent it meanwhile.
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

-- public.turfs: the IGNORE / LIST / DETAIL rules above.
create or replace function private.mark_turf_dirty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- IGNORE: lib/cache/keys.ts IGNORE_COLUMNS.
  v_ignore constant text[] := array[
    'updated_at', 'listing_review', 'listing_checked_at', 'review_summary_at', 'cover_reviewed_at',
    'data_sources', 'field_confidence', 'price_verified_at', 'description_updated_at', 'data_verified_at'
  ];
  -- LIST: lib/cache/keys.ts LIST_COLUMNS (CARD_COLUMNS + is_active, city, slug).
  v_list constant text[] := array[
    'id', 'slug', 'name', 'address', 'area', 'city', 'sports', 'images', 'cover_image',
    'rating', 'total_reviews', 'lat', 'lng',
    'morning_price', 'afternoon_price', 'evening_price',
    'weekend_morning_price', 'weekend_afternoon_price', 'weekend_evening_price',
    'price_mentions', 'price_unit', 'slot_minutes', 'is_covered', 'has_floodlights',
    'start_time', 'end_time', 'is_24x7', 'membership_required', 'is_active',
    'amenities', 'parking_available', 'washroom_available', 'changing_room_available', 'has_cafeteria', 'equipment_provided',
    'image_review'
  ];
  v_changed text[];
  v_keys text[] := '{}';
begin
  if TG_OP = 'INSERT' then
    -- The lists gain a card, and the page: a turf deleted and imported
    -- again under the same slug would otherwise serve the 404 its page
    -- cached for a day. Purging a page that was never cached costs nothing.
    if coalesce(NEW.is_active, false) then
      v_keys := array[private.list_key(NEW.city), 'turf:' || lower(coalesce(NEW.slug, NEW.id::text))];
    end if;
  elsif TG_OP = 'DELETE' then
    if coalesce(OLD.is_active, false) then
      v_keys := array[private.list_key(OLD.city)];
    end if;
    v_keys := v_keys || ('turf:' || lower(coalesce(OLD.slug, OLD.id::text))) || ('turf:' || OLD.id::text);
  else
    select coalesce(array_agg(n.key), '{}') into v_changed
      from jsonb_each(to_jsonb(NEW)) n
      join jsonb_each(to_jsonb(OLD)) o using (key)
     where n.value is distinct from o.value
       and n.key <> all (v_ignore);
    if cardinality(v_changed) = 0 then
      return null;
    end if;
    -- An inactive turf is on no list, unless this change deactivated it.
    if v_changed && v_list and (coalesce(NEW.is_active, false) or coalesce(OLD.is_active, false)) then
      v_keys := v_keys || private.list_key(NEW.city);
      if NEW.city is distinct from OLD.city then
        v_keys := v_keys || private.list_key(OLD.city);
      end if;
    end if;
    v_keys := v_keys || ('turf:' || lower(coalesce(NEW.slug, NEW.id::text)));
    -- A new slug: the old page and the /turf/<id> redirect point elsewhere now.
    if NEW.slug is distinct from OLD.slug then
      v_keys := v_keys || ('turf:' || lower(coalesce(OLD.slug, OLD.id::text))) || ('turf:' || NEW.id::text);
    end if;
  end if;
  perform private.mark_dirty(v_keys, current_setting('tapturf.cache_urgent', true) = 'on');
  return null;
end;
$$;

-- public.trending_turfs: the city's lists and both turf pages, when the
-- pick is live. A pick that starts or ends later is queued by
-- flush_cache() when its window opens or closes.
-- A turf page shows the badge only for its city's newest live pick
-- (turf_page), so a pick that takes over or goes away also changes the
-- other live picks' pages in that city: queue those too.
create or replace function private.mark_trending_dirty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text[] := '{}';
  v_cities text[] := '{}';
begin
  if TG_OP <> 'INSERT' and OLD.starts_at <= now() and OLD.ends_at > now() then
    v_keys := v_keys || private.list_key(OLD.city) || private.turf_key(OLD.turf_id);
    v_cities := v_cities || OLD.city;
  end if;
  if TG_OP <> 'DELETE' and NEW.starts_at <= now() and NEW.ends_at > now() then
    v_keys := v_keys || private.list_key(NEW.city) || private.turf_key(NEW.turf_id);
    v_cities := v_cities || NEW.city;
  end if;
  v_keys := v_keys || array(
    select private.turf_key(q.turf_id) from public.trending_turfs q
     where q.city = any (v_cities) and q.starts_at <= now() and q.ends_at > now());
  perform private.mark_dirty(v_keys, current_setting('tapturf.cache_urgent', true) = 'on');
  return null;
end;
$$;

-- games, reviews, turf_suggestions: the turf's page (which renders them
-- from turf_page()), and for games the games key. TG_ARGV[0] lists
-- columns whose changes alone are not shown (comma-separated).
create or replace function private.mark_turf_child_dirty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ignore constant text[] := string_to_array(coalesce(TG_ARGV[0], ''), ',');
  v_keys text[] := '{}';
begin
  if TG_OP = 'UPDATE' and (to_jsonb(NEW) - v_ignore) = (to_jsonb(OLD) - v_ignore) then
    return null;
  end if;
  if TG_OP <> 'DELETE' then
    v_keys := v_keys || private.turf_key(NEW.turf_id);
  end if;
  if TG_OP <> 'INSERT' then
    v_keys := v_keys || private.turf_key(OLD.turf_id);
  end if;
  if TG_TABLE_NAME = 'games' then
    v_keys := v_keys || 'games'::text;
  end if;
  perform private.mark_dirty(v_keys, current_setting('tapturf.cache_urgent', true) = 'on');
  return null;
end;
$$;

-- turf_owners: a turf page shows only whether it has an active claim.
-- Claims change only by an admin decision (admin_decide_owner_claim), and
-- rarely: always urgent.
create or replace function private.mark_owner_dirty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was boolean := false;
  v_is  boolean := false;
  v_keys text[] := '{}';
begin
  if TG_OP <> 'INSERT' then
    v_was := OLD.status = 'active';
  end if;
  if TG_OP <> 'DELETE' then
    v_is := NEW.status = 'active';
  end if;
  if v_was and v_is and OLD.turf_id = NEW.turf_id then
    return null;
  end if;
  if v_was then
    v_keys := v_keys || private.turf_key(OLD.turf_id);
  end if;
  if v_is then
    v_keys := v_keys || private.turf_key(NEW.turf_id);
  end if;
  perform private.mark_dirty(v_keys, true);
  return null;
end;
$$;

-- review_votes: turf pages render each review's vote count. Anon can
-- vote, but a burst still becomes at most one purge a minute per turf.
-- A vote removed because its review was deleted finds no review here;
-- the review's own delete already queued the page.
create or replace function private.mark_vote_dirty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.mark_dirty(array[(
    select private.turf_key(r.turf_id) from public.reviews r
     where r.id = case when TG_OP = 'DELETE' then OLD.review_id else NEW.review_id end)], false);
  return null;
end;
$$;

-- turf_edit_log: owner_update_turf inserts its log row right after its
-- update, in the same transaction, so the keys that update queued are
-- the ones this transaction marked: make them urgent.
create or replace function private.mark_owner_edit_urgent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.cache_dirty set urgent = true
   where marked_xid = pg_current_xact_id() and not urgent;
  return null;
end;
$$;

revoke all on function private.list_key(text), private.turf_key(uuid), private.mark_dirty(text[], boolean),
  private.mark_turf_dirty(), private.mark_trending_dirty(), private.mark_turf_child_dirty(), private.mark_owner_dirty(),
  private.mark_vote_dirty(), private.mark_owner_edit_urgent()
  from public, anon, authenticated;

drop trigger if exists turfs_mark_cache_dirty on public.turfs;
create trigger turfs_mark_cache_dirty
  after insert or update or delete on public.turfs
  for each row execute function private.mark_turf_dirty();

drop trigger if exists trending_turfs_mark_cache_dirty on public.trending_turfs;
create trigger trending_turfs_mark_cache_dirty
  after insert or update or delete on public.trending_turfs
  for each row execute function private.mark_trending_dirty();

drop trigger if exists games_mark_cache_dirty on public.games;
create trigger games_mark_cache_dirty
  after insert or update or delete on public.games
  for each row execute function private.mark_turf_child_dirty('updated_at');

drop trigger if exists reviews_mark_cache_dirty on public.reviews;
create trigger reviews_mark_cache_dirty
  after insert or update or delete on public.reviews
  for each row execute function private.mark_turf_child_dirty('updated_at');

-- ai_review and reviewed_at are the admin AI pass.
drop trigger if exists turf_suggestions_mark_cache_dirty on public.turf_suggestions;
create trigger turf_suggestions_mark_cache_dirty
  after insert or update or delete on public.turf_suggestions
  for each row execute function private.mark_turf_child_dirty('updated_at,ai_review,reviewed_at');

drop trigger if exists turf_owners_mark_cache_dirty on public.turf_owners;
create trigger turf_owners_mark_cache_dirty
  after insert or update or delete on public.turf_owners
  for each row execute function private.mark_owner_dirty();

drop trigger if exists review_votes_mark_cache_dirty on public.review_votes;
create trigger review_votes_mark_cache_dirty
  after insert or delete on public.review_votes
  for each row execute function private.mark_vote_dirty();

-- Once per statement: owner_update_turf writes one log row per save.
drop trigger if exists turf_edit_log_cache_urgent on public.turf_edit_log;
create trigger turf_edit_log_cache_urgent
  after insert on public.turf_edit_log
  for each statement execute function private.mark_owner_edit_urgent();

-- Every minute: settle earlier posts, queue trending windows that opened
-- or closed, and post the pending keys when the rules say so.
-- lock_timeout: a long import holding a key must delay a flush, never
-- stall it (the next tick tries again).
create or replace function private.flush_cache()
returns void
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_url    constant text := 'https://www.tapturf.in/api/revalidate';
  v_now    constant timestamptz := now();
  v_secret text;
  v_since  timestamptz;
  v_keys   text[];
  v_urgent boolean;
  v_last   timestamptz;
  v_first  timestamptz;
  v_req    bigint;
begin
  -- One flush at a time, even if a tick overruns.
  if not pg_try_advisory_xact_lock(hashtext('private.flush_cache')) then
    return;
  end if;

  -- 1. Posts that got a 2xx are done. Ones without success after 3
  --    minutes (error, timeout, pg_net response expired) go out again.
  delete from private.cache_dirty
   where key in (
     select d.key
       from private.cache_dirty d
       join net._http_response r on r.id = d.request_id
      where r.status_code between 200 and 299
        for update of d skip locked);
  update private.cache_dirty
     set sent_at = null, request_id = null
   where key in (
     select d.key from private.cache_dirty d
      where d.sent_at < v_now - interval '3 minutes'
        for update of d skip locked);

  -- 2. Trending picks whose window opened or closed since the last check,
  --    and the other live picks in those cities (only the newest live
  --    pick shows the badge, see mark_trending_dirty).
  select last_trending_check into v_since from private.cache_flush_state where id for update;
  select array_agg(k) into v_keys from (
    select private.list_key(t.city) k from public.trending_turfs t
     where (t.starts_at > v_since and t.starts_at <= v_now) or (t.ends_at > v_since and t.ends_at <= v_now)
    union
    select private.turf_key(t.turf_id) from public.trending_turfs t
     where (t.starts_at > v_since and t.starts_at <= v_now) or (t.ends_at > v_since and t.ends_at <= v_now)
    union
    select private.turf_key(q.turf_id) from public.trending_turfs q
     where q.starts_at <= v_now and q.ends_at > v_now
       and q.city in (
         select t.city from public.trending_turfs t
          where (t.starts_at > v_since and t.starts_at <= v_now) or (t.ends_at > v_since and t.ends_at <= v_now))
  ) s;
  if v_keys is not null then
    perform private.mark_dirty(v_keys, false);
  end if;
  update private.cache_flush_state set last_trending_check = v_now where id;

  -- 3. Send when a key is urgent, when the newest change is 45 s old (a
  --    burst such as an import has settled), or when the oldest unsent
  --    change is 3 minutes old (a steady trickle still goes out).
  select bool_or(urgent), max(last_at), min(first_at)
    into v_urgent, v_last, v_first
    from private.cache_dirty where sent_at is null;
  if v_first is null then
    return;
  end if;
  if not (v_urgent or v_last < v_now - interval '45 seconds' or v_first < v_now - interval '3 minutes') then
    return;
  end if;

  -- 4. Up to 1,000 keys, urgent and oldest first, in one post; the rest
  --    go next minute. Keys a running transaction is still writing are
  --    left for the next tick (skip locked).
  select array_agg(key) into v_keys from (
    select d.key from private.cache_dirty d
     where d.sent_at is null
     order by d.urgent desc, d.first_at
     limit 1000
       for update of d skip locked
  ) s;
  if v_keys is null then
    return;
  end if;
  v_secret := (select value from private.app_secrets where name = 'revalidate');
  if v_secret is null then
    raise warning 'flush_cache: no revalidate secret in private.app_secrets';
    return;
  end if;
  v_req := net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-revalidate-secret', v_secret),
    body    := jsonb_build_object('keys', to_jsonb(v_keys)),
    timeout_milliseconds := 15000
  );
  update private.cache_dirty set sent_at = v_now, request_id = v_req where key = any (v_keys);
  update private.cache_flush_state set last_flush = v_now where id;
end;
$$;
revoke all on function private.flush_cache() from public, anon, authenticated;

select cron.schedule('flush-cache', '* * * * *', 'select private.flush_cache()');

-- A run a minute adds 1,440 rows a day to cron.job_run_details: keep 3 days.
create or replace function public.apply_retention()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  delete from public.user_logins where created_at < now() - interval '12 months';
  delete from public.otp_send_log where created_at < now() - interval '12 months';
  update public.turf_contact_clicks set user_id = null
    where user_id is not null and created_at < now() - interval '90 days';
  delete from cron.job_run_details where end_time < now() - interval '3 days';
end;
$function$;
