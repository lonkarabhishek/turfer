-- Proves the cache queue's rules (supabase/migrations/20261020_cache_queue.sql):
-- which row changes queue which keys, urgency, re-arming and the flush.
--
-- Run after that migration, in one go (Supabase SQL editor, or
-- execute_sql). Every case runs in its own subtransaction that is undone
-- before the next, and the script ends in ROLLBACK, so nothing is kept:
-- no turf edit, no queued key and no webhook (pg_net only sends
-- requests that commit). The old notify_turf_change() trigger, while it
-- exists, also fires here and is rolled back the same way.
--
-- Result: one row per case. Every row should start with "ok". The flush
-- cases (26, 28) can report FAIL if the cron flush happens to run at that
-- very moment (it holds the flush lock), or (28) if a real trending
-- window opened or closed in the last 5 minutes; run the script again.

begin;

-- Keys queued by this transaction, sorted.
create function pg_temp.queued() returns text[] language sql as $$
  select coalesce(array_agg(key order by key), '{}') from private.cache_dirty where marked_xid = pg_current_xact_id();
$$;

-- Run p_sql, return the keys it queued, then undo all of it.
create function pg_temp.keys_after(p_sql text) returns text[] language plpgsql as $$
declare
  v text[];
begin
  begin
    execute p_sql;
    v := pg_temp.queued();
    raise exception using errcode = 'TT001', message = 'undo case';
  exception when sqlstate 'TT001' then
    null;
  end;
  return v;
end;
$$;

create function pg_temp.check(p_case text, p_sql text, p_want text[]) returns text language plpgsql as $$
declare
  v_got  text[] := pg_temp.keys_after(p_sql);
  v_want text[] := (select coalesce(array_agg(distinct x order by x), '{}') from unnest(p_want) x where x is not null);
begin
  if v_got = v_want then
    return 'ok    ' || p_case;
  end if;
  return format('FAIL  %s: want %s, got %s', p_case, v_want, v_got);
end;
$$;

-- An active turf in a city trending picks accept, another city to move it to,
-- an inactive turf, and one row each from the child tables.
create temp table pick as
  select t.id, t.slug, t.city, case when t.city = 'pune' then 'mumbai' else 'pune' end as other_city
    from public.turfs t
   where t.is_active and t.slug is not null and t.city in ('nashik', 'pune', 'mumbai', 'nagpur', 'hyderabad')
   order by t.total_reviews desc nulls last, t.id
   limit 1;
create temp table off_pick as
  select id, slug from public.turfs where not coalesce(is_active, false) and slug is not null order by id limit 1;
create temp table review_pick as
  select r.id, private.turf_key(r.turf_id) as turf_key from public.reviews r order by r.created_at desc limit 1;
create temp table suggestion_pick as
  select s.id, private.turf_key(s.turf_id) as turf_key from public.turf_suggestions s order by s.created_at desc limit 1;
create temp table game_pick as
  select g.id, private.turf_key(g.turf_id) as turf_key from public.games g where g.turf_id is not null order by g.created_at desc limit 1;
create temp table bulk_cities as
  select coalesce(array_agg(distinct private.list_key(city)), '{}')
         || coalesce(array_agg('turf:' || lower(slug) || '-cache-test'), '{}') as keys
    from (select city, slug from public.turfs where is_active and slug is not null order by id limit 100) s;
-- A second active turf in pick's city (a newer trending pick takes over),
-- the live picks there now, a user who has not voted on review_pick, and
-- an existing vote.
create temp table pick2 as
  select t.id, t.slug from public.turfs t, pick p
   where t.is_active and t.slug is not null and t.city = p.city and t.id <> p.id
   order by t.id limit 1;
create temp table live_picks as
  select coalesce(array_agg(private.turf_key(q.turf_id)), '{}') as keys
    from public.trending_turfs q, pick p
   where q.city = p.city and q.starts_at <= now() and q.ends_at > now();
create temp table voter as
  select u.id from public.users u, review_pick r
   where not exists (select 1 from public.review_votes v where v.review_id = r.id and v.user_id = u.id)
   order by u.id limit 1;
create temp table vote_pick as
  select v.id, private.turf_key(r.turf_id) as turf_key
    from public.review_votes v join public.reviews r on r.id = v.review_id
   order by v.created_at desc nulls last limit 1;

select r from (
  -- turfs: IGNORE
  select 1 as n, pg_temp.check('only ignored columns (admin listing pass): nothing',
    format($q$update public.turfs set listing_checked_at = now(), data_verified_at = now(),
              listing_review = coalesce(listing_review, '{}'::jsonb) || '{"cache_test": true}' where id = %L$q$, p.id),
    '{}') as r from pick p
  union all
  select 2, pg_temp.check('no-op update (only updated_at moves): nothing',
    format('update public.turfs set name = name where id = %L', p.id), '{}') from pick p

  -- turfs: DETAIL
  union all
  select 3, pg_temp.check('detail column (description): the turf page only',
    format($q$update public.turfs set description = coalesce(description, '') || ' ' where id = %L$q$, p.id),
    array['turf:' || p.slug]) from pick p
  union all
  select 4, pg_temp.check('detail column (review_summary, admin AI batch): the turf page only',
    format($q$update public.turfs set review_summary = coalesce(review_summary, '{}'::jsonb) || '{"cache_test": true}' where id = %L$q$, p.id),
    array['turf:' || p.slug]) from pick p

  -- turfs: LIST
  union all
  select 5, pg_temp.check('list column (name): city lists and the page',
    format($q$update public.turfs set name = name || ' ' where id = %L$q$, p.id),
    array['list:' || p.city, 'turf:' || p.slug]) from pick p
  union all
  select 6, pg_temp.check('list column (morning_price): city lists and the page',
    format('update public.turfs set morning_price = coalesce(morning_price, 0) + 1 where id = %L', p.id),
    array['list:' || p.city, 'turf:' || p.slug]) from pick p
  union all
  select 7, pg_temp.check('city move: both cities and the page',
    format('update public.turfs set city = %L where id = %L', p.other_city, p.id),
    array['list:' || p.city, 'list:' || p.other_city, 'turf:' || p.slug]) from pick p
  union all
  select 8, pg_temp.check('slug change: lists, old and new page, /turf/<id> redirect',
    format($q$update public.turfs set slug = slug || '-cachetest' where id = %L$q$, p.id),
    array['list:' || p.city, 'turf:' || p.slug, 'turf:' || p.slug || '-cachetest', 'turf:' || p.id]) from pick p
  union all
  select 9, pg_temp.check('deactivate: lists and the page',
    format('update public.turfs set is_active = false where id = %L', p.id),
    array['list:' || p.city, 'turf:' || p.slug]) from pick p
  union all
  select 10, pg_temp.check('inactive turf, list column: the page only (it is on no list)',
    format($q$update public.turfs set name = name || ' ' where id = %L$q$, o.id),
    array['turf:' || o.slug]) from off_pick o

  -- turfs: INSERT / DELETE
  union all
  select 11, pg_temp.check('100-row import: one key per city and each new page (a re-imported slug may have a cached 404)',
    $q$insert into public.turfs (owner_id, name, address, city, is_active, slug)
       select owner_id, name || ' (cache test)', address, city, true, slug || '-cache-test'
         from public.turfs where is_active and slug is not null order by id limit 100$q$,
    b.keys) from bulk_cities b
  union all
  select 12, pg_temp.check('inactive insert: nothing',
    format($q$insert into public.turfs (owner_id, name, address, city, is_active, slug)
              select owner_id, 'Cache test', address, city, false, 'cache-test-inactive' from public.turfs where id = %L$q$, p.id),
    '{}') from pick p
  union all
  select 13, pg_temp.check('insert then delete: lists, page and redirect',
    format($q$insert into public.turfs (id, owner_id, name, address, city, is_active, slug)
              select '00000000-0000-4000-8000-00000000cafe', owner_id, 'Cache test', address, city, true, 'cache-test-turf'
                from public.turfs where id = %L;
              delete from public.turfs where id = '00000000-0000-4000-8000-00000000cafe'$q$, p.id),
    array['list:' || p.city, 'turf:cache-test-turf', 'turf:00000000-0000-4000-8000-00000000cafe']) from pick p

  -- urgency and re-arming
  union all
  select 14, pg_temp.check('urgent writer (owner_update_turf sets tapturf.cache_urgent): keys marked urgent',
    format($q$select set_config('tapturf.cache_urgent', 'on', true);
              update public.turfs set name = name || ' ' where id = %L;
              do $x$ begin
                if not (select bool_and(urgent) from private.cache_dirty where marked_xid = pg_current_xact_id()) then
                  raise exception 'keys not urgent';
                end if;
              end $x$$q$, p.id),
    array['list:' || p.city, 'turf:' || p.slug]) from pick p
  union all
  select 15, pg_temp.check('a change after a key was sent: back to unsent',
    format($q$select private.mark_dirty(array['list:' || %L]);
              update private.cache_dirty set sent_at = now(), request_id = -1, marked_xid = null where key = 'list:' || %L;
              update public.turfs set name = name || ' ' where id = %L;
              do $x$ begin
                if exists (select 1 from private.cache_dirty where key = 'list:' || %L and (sent_at is not null or request_id is not null)) then
                  raise exception 'key not re-armed';
                end if;
              end $x$$q$, p.city, p.city, p.id, p.city),
    array['list:' || p.city, 'turf:' || p.slug]) from pick p
  union all
  select 16, pg_temp.check('owner save (update, then its turf_edit_log row): its keys urgent, other transactions'' keys not',
    format($q$insert into private.cache_dirty (key, marked_xid) values ('list:cache-test-other', null) on conflict do nothing;
              update public.turfs set name = name || ' ' where id = %L;
              insert into public.turf_edit_log (turf_id, user_key, before, after) values (%L, 'cache-test', '{}', '{"name": "x"}');
              do $x$ begin
                if not (select bool_and(urgent) from private.cache_dirty where marked_xid = pg_current_xact_id()) then
                  raise exception 'owner save keys not urgent';
                end if;
                if (select urgent from private.cache_dirty where key = 'list:cache-test-other') then
                  raise exception 'another transaction''s key turned urgent';
                end if;
              end $x$$q$, p.id, p.id),
    array['list:' || p.city, 'turf:' || p.slug]) from pick p

  -- trending_turfs
  union all
  select 17, pg_temp.check('live trending pick: city lists, the page and the city''s other live picks',
    format($q$insert into public.trending_turfs (city, turf_id, starts_at, ends_at)
              values (%L, %L, now() - interval '1 minute', now() + interval '1 day')$q$, p.city, p.id),
    array['list:' || p.city, 'turf:' || p.slug] || l.keys) from pick p, live_picks l
  union all
  select 18, pg_temp.check('future trending pick: nothing yet (the flush queues it when it starts)',
    format($q$insert into public.trending_turfs (city, turf_id, starts_at, ends_at)
              values (%L, %L, now() + interval '1 day', now() + interval '2 days')$q$, p.city, p.id),
    '{}') from pick p

  -- child tables
  union all
  select 19, pg_temp.check('review text: its turf page',
    format($q$update public.reviews set comment = coalesce(comment, '') || ' ' where id = %L$q$, r.id),
    array[r.turf_key]) from review_pick r
  union all
  select 20, pg_temp.check('review no-op (only updated_at): nothing',
    format('update public.reviews set comment = comment where id = %L', r.id), '{}') from review_pick r
  union all
  select 21, pg_temp.check('suggestion AI review only: nothing',
    format($q$update public.turf_suggestions set ai_review = coalesce(ai_review, '{}'::jsonb) || '{"cache_test": true}', reviewed_at = now() where id = %L$q$, s.id),
    '{}') from suggestion_pick s
  union all
  select 22, pg_temp.check('suggestion notes: its turf page',
    format($q$update public.turf_suggestions set notes = coalesce(notes, '') || ' ' where id = %L$q$, s.id),
    array[s.turf_key]) from suggestion_pick s
  union all
  select 23, pg_temp.check('game players: its turf page and games',
    format('update public.games set current_players = coalesce(current_players, 0) + 1 where id = %L', g.id),
    array[g.turf_key, 'games']) from game_pick g
  union all
  select 24, pg_temp.check('pending owner claim: nothing',
    format($q$insert into public.turf_owners (turf_id, user_key, status, via) values (%L, 'cache-test', 'pending', 'admin')$q$, p.id),
    '{}') from pick p
  union all
  select 25, pg_temp.check('active owner claim: the turf page, urgent',
    format($q$insert into public.turf_owners (turf_id, user_key, status, via) values (%L, 'cache-test', 'active', 'admin');
              do $x$ begin
                if not (select bool_and(urgent) from private.cache_dirty where marked_xid = pg_current_xact_id()) then
                  raise exception 'claim key not urgent';
                end if;
              end $x$$q$, p.id),
    array['turf:' || p.slug]) from pick p

  -- flush
  union all
  select 26, pg_temp.check('flush posts an urgent key at once',
    format($q$select private.mark_dirty(array['list:' || %L], true);
              select private.flush_cache();
              do $x$ begin
                if not exists (select 1 from private.cache_dirty where key = 'list:' || %L and sent_at is not null and request_id is not null) then
                  raise exception 'urgent key not sent';
                end if;
              end $x$$q$, p.city, p.city),
    array['list:' || p.city]) from pick p

  -- trending takeover and votes
  union all
  select 27, pg_temp.check('a newer live pick takes over: the older pick''s page too (it loses the badge)',
    format($q$insert into public.trending_turfs (city, turf_id, starts_at, ends_at)
              values (%L, %L, now() - interval '1 day', now() + interval '1 day');
              delete from private.cache_dirty where marked_xid = pg_current_xact_id();
              insert into public.trending_turfs (city, turf_id, starts_at, ends_at)
              values (%L, %L, now() - interval '1 minute', now() + interval '1 day')$q$, p.city, p.id, p.city, q.id),
    array['list:' || p.city, 'turf:' || p.slug, 'turf:' || q.slug] || l.keys) from pick p, pick2 q, live_picks l
  union all
  select 28, pg_temp.check('flush: a pick''s window opening queues the city''s other live picks too',
    format($q$insert into public.trending_turfs (city, turf_id, starts_at, ends_at)
              values (%L, %L, now() - interval '1 day', now() + interval '1 day');
              insert into public.trending_turfs (city, turf_id, starts_at, ends_at)
              values (%L, %L, now() - interval '2 minutes', now() + interval '1 day');
              delete from private.cache_dirty where marked_xid = pg_current_xact_id();
              update private.cache_flush_state set last_trending_check = now() - interval '5 minutes' where id;
              select private.flush_cache()$q$, p.city, p.id, p.city, q.id),
    array['list:' || p.city, 'turf:' || p.slug, 'turf:' || q.slug] || l.keys) from pick p, pick2 q, live_picks l
  union all
  select 29, pg_temp.check('a vote: its review''s turf page',
    format($q$insert into public.review_votes (review_id, user_id) values (%L, %L)$q$, r.id, u.id),
    array[r.turf_key]) from review_pick r, voter u
  union all
  select 30, pg_temp.check('a vote removed: its review''s turf page',
    format('delete from public.review_votes where id = %L', v.id),
    array[v.turf_key]) from vote_pick v
) cases
order by n;

rollback;
