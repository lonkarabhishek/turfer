-- Proves the turf list snapshot (supabase/migrations/20261026_cache_list_snapshot.sql):
-- builds move the version only on a change, the parts add up to the active
-- turfs in the card columns and stay within part_bytes, stale parts are never
-- served, and private.flush_lists() builds before it posts, posting only the
-- keys whose change the build has.
--
-- Run after that migration, in one go (Supabase SQL editor, or
-- execute_sql). Every case runs in its own subtransaction that is undone
-- before the next, and the script ends in ROLLBACK, so nothing is kept: no
-- turf edit, no build and no post (pg_net only sends requests that commit).
-- Each case rebuilds the list once or twice (about 0.5 s each).
--
-- Result: one row per case. Every row should start with "ok". Cases 6 and 9
-- can report FAIL if the cron flush runs at that very moment (it holds the
-- flush lock); run the script again. The "no active turfs" raise is only
-- checked on a local database (scripts/sql-tests/cache_list_snapshot.check.mjs):
-- here it would need every turf deactivated.

begin;

-- Run p_sql (a DO block that raises on a failed check), report, undo it.
create function pg_temp.check(p_case text, p_sql text) returns text language plpgsql as $$
declare
  v_err text;
begin
  begin
    execute p_sql;
    raise exception using errcode = 'TT001', message = 'undo case';
  exception
    when sqlstate 'TT001' then
      return 'ok    ' || p_case;
    when others then
      get stacked diagnostics v_err = message_text;
      return format('FAIL  %s: %s', p_case, v_err);
  end;
end;
$$;

-- The most reviewed active turf.
create temp table pick as
  select t.id, t.city from public.turfs t where t.is_active order by t.total_reviews desc nulls last, t.id limit 1;

select r from (
  select 1 as n, pg_temp.check('a build with nothing changed returns false and keeps the version', $q$
    do $x$
    declare v1 bigint;
    begin
      perform private.build_turf_list();
      v1 := (select version from private.turf_list_state where id);
      if private.build_turf_list() then
        raise exception 'the second build reported a change';
      end if;
      if (select version from private.turf_list_state where id) <> v1 then
        raise exception 'the version moved';
      end if;
    end $x$$q$) as r

  union all
  select 2, pg_temp.check('a card column edit moves the version by one and shows in its part', format($q$
    do $x$
    declare v1 bigint;
    begin
      perform private.build_turf_list();
      v1 := (select version from private.turf_list_state where id);
      update public.turfs set name = name || ' (snapshot test)' where id = %L;
      if not private.build_turf_list() then
        raise exception 'the edit was not seen';
      end if;
      if (select version from private.turf_list_state where id) <> v1 + 1 then
        raise exception 'the version did not move by one';
      end if;
      if not exists (
        select 1 from generate_series(0, (public.turf_list_version() ->> 'parts')::int - 1) i,
               json_array_elements(public.turf_list_part(i) -> 'rows') r
         where r ->> 'id' = %L and r ->> 'name' like '%%(snapshot test)') then
        raise exception 'the edited row is not in the current parts';
      end if;
    end $x$$q$, p.id, p.id)) from pick p

  union all
  select 3, pg_temp.check('the parts add up to n and to the active turfs, each turf once, each part within part_bytes', $q$
    do $x$
    declare m json; v_total int; v_ids int; v_active int; v_bytes int; v_over int; v_short int;
    begin
      perform private.build_turf_list();
      m := public.turf_list_version();
      select count(*), count(distinct r ->> 'id') into v_total, v_ids
        from generate_series(0, (m ->> 'parts')::int - 1) i, json_array_elements(public.turf_list_part(i) -> 'rows') r;
      v_active := (select count(*) from public.turfs where is_active);
      if v_total <> (m ->> 'n')::int or v_total <> v_active or v_ids <> v_total then
        raise exception 'rows %, distinct ids %, n %, active turfs %', v_total, v_ids, m ->> 'n', v_active;
      end if;
      -- Row JSON per part as the build measures it: at most part_bytes plus
      -- one row, and every part but the last full (so a part fits the app's
      -- 2 MB data cache entry, and parts are not wasted).
      v_bytes := (select part_bytes from private.turf_list_state where id);
      select count(*) filter (where b.bytes > v_bytes + b.widest),
             count(*) filter (where b.i < (m ->> 'parts')::int - 1 and b.bytes < v_bytes - b.widest)
        into v_over, v_short
        from (select i, sum(octet_length(r::jsonb::text)) as bytes, max(octet_length(r::jsonb::text)) as widest
                from generate_series(0, (m ->> 'parts')::int - 1) i, json_array_elements(public.turf_list_part(i) -> 'rows') r
               group by i) b;
      if v_over > 0 or v_short > 0 then
        raise exception '% parts over % bytes, % short ones', v_over, v_bytes, v_short;
      end if;
    end $x$$q$)

  union all
  select 4, pg_temp.check('no part past the last or below 0, and a part of another version is never served', $q$
    do $x$
    declare m json;
    begin
      perform private.build_turf_list();
      m := public.turf_list_version();
      if public.turf_list_part((m ->> 'parts')::int) is not null or public.turf_list_part(-1) is not null then
        raise exception 'a part outside 0..parts-1 was served';
      end if;
      if exists (select 1 from private.turf_list_parts p where p.part >= (m ->> 'parts')::int and public.turf_list_part(p.part) is not null) then
        raise exception 'a leftover part was served';
      end if;
      update private.turf_list_parts set version = version - 1 where part = 0;
      if public.turf_list_part(0) is not null then
        raise exception 'a part of another version was served';
      end if;
    end $x$$q$)

  union all
  select 5, pg_temp.check('cols lists the card columns, and every row has exactly those keys', $q$
    do $x$
    declare m json; v_cols text[]; v_bad int;
    begin
      perform private.build_turf_list();
      m := public.turf_list_version();
      v_cols := (select array_agg(c order by c) from unnest(string_to_array(m ->> 'cols', ', ')) c);
      if cardinality(v_cols) < 30 or not ('id' = any (v_cols)) or 'description' = any (v_cols) then
        raise exception 'unexpected cols %', m ->> 'cols';
      end if;
      select count(*) into v_bad
        from generate_series(0, (m ->> 'parts')::int - 1) i, json_array_elements(public.turf_list_part(i) -> 'rows') r
       where (select array_agg(k order by k) from json_object_keys(r) k) is distinct from v_cols;
      if v_bad > 0 then
        raise exception '% rows with other keys', v_bad;
      end if;
    end $x$$q$)

  union all
  select 6, pg_temp.check('flush_lists builds the change into the rows before it posts the list key', format($q$
    do $x$
    declare v1 bigint;
    begin
      perform private.build_turf_list();
      v1 := (select version from private.turf_list_state where id);
      update public.turfs set name = name || ' (snapshot test)' where id = %L;
      update private.cache_list_dirty set first_at = now() - interval '4 minutes', last_at = now() - interval '4 minutes'
       where key = private.list_key(%L);
      update private.cache_list_state set last_post = null, last_request = null where id;
      perform private.flush_lists();
      if (select last_request from private.cache_list_state where id) is null then
        raise exception 'nothing posted (the cron flush may hold the lock: run again)';
      end if;
      if (select version from private.turf_list_state where id) <> v1 + 1 then
        raise exception 'posted without building the edit';
      end if;
      if not exists (select 1 from private.cache_list_dirty where key = private.list_key(%L) and posted_at = now()) then
        raise exception 'the list key was not posted';
      end if;
    end $x$$q$, p.id, p.city, p.city)) from pick p

  union all
  select 8, pg_temp.check('turf_list_version: built is the last build, epoch ms, and moves on an unchanged build', $q$
    do $x$
    declare b1 bigint;
    begin
      perform private.build_turf_list();
      b1 := (public.turf_list_version() ->> 'built')::bigint;
      if b1 is distinct from floor(extract(epoch from now()) * 1000)::bigint then
        raise exception 'built % is not this build (%)', b1, floor(extract(epoch from now()) * 1000)::bigint;
      end if;
      update private.turf_list_state set built_at = built_at - interval '1 minute' where id;
      if (public.turf_list_version() ->> 'built')::bigint <> b1 - 60000 then
        raise exception 'built does not follow built_at';
      end if;
      if private.build_turf_list() then
        raise exception 'the second build reported a change';
      end if;
      -- A statement of its own: a stable function in the build's statement would read the old stamp.
      if (public.turf_list_version() ->> 'built')::bigint <> b1 then
        raise exception 'an unchanged build did not stamp built';
      end if;
    end $x$$q$)

  union all
  select 9, pg_temp.check('flush_lists leaves a key changed after its build began for the next post', format($q$
    do $x$
    begin
      update public.turfs set name = name || ' (snapshot test)' where id = %L;
      -- As if a transaction that commits after the build's snapshot changed it again.
      update private.cache_list_dirty
         set first_at = now() - interval '4 minutes', last_at = now() - interval '4 minutes',
             marked_xid = (pg_current_xact_id()::text::bigint + 1000000)::text::xid8
       where key = private.list_key(%L);
      update private.cache_list_state set last_post = null, last_request = null where id;
      perform private.flush_lists();
      if exists (select 1 from private.cache_list_dirty where key = private.list_key(%L) and posted_at is not null) then
        raise exception 'posted a key whose change the build may not have';
      end if;
      if (select built_at from private.turf_list_state where id) is distinct from now() then
        raise exception 'no build (the cron flush may hold the lock: run again)';
      end if;
      update private.cache_list_dirty set marked_xid = pg_current_xact_id() where key = private.list_key(%L);
      update private.cache_list_state set last_post = null, last_request = null where id;
      perform private.flush_lists();
      if not exists (select 1 from private.cache_list_dirty where key = private.list_key(%L) and posted_at = now()) then
        raise exception 'the key was not posted once its change was in';
      end if;
    end $x$$q$, p.id, p.city, p.city, p.city, p.city)) from pick p

  union all
  select 10, pg_temp.check('the flush-lists tick is bounded to 30 s', $q$
    do $x$
    begin
      if not exists (select 1 from cron.job where jobname = 'flush-lists' and active
                        and command = 'set statement_timeout = ''30s''; select private.flush_lists()') then
        raise exception 'flush-lists is not scheduled with the 30 s bound';
      end if;
    end $x$$q$)

  union all
  select 7, pg_temp.check('anon calls the two RPCs and nothing else', $q$
    do $x$
    begin
      if not (has_function_privilege('anon', 'public.turf_list_version()', 'execute')
              and has_function_privilege('anon', 'public.turf_list_part(integer)', 'execute')) then
        raise exception 'anon cannot call the RPCs';
      end if;
      if has_function_privilege('anon', 'private.build_turf_list()', 'execute')
         or has_function_privilege('anon', 'private.flush_lists()', 'execute')
         or has_table_privilege('anon', 'private.turf_list_parts', 'select')
         or has_table_privilege('anon', 'private.turf_list_state', 'select') then
        raise exception 'anon reaches the builder or the tables';
      end if;
    end $x$$q$)
) cases
order by n;

rollback;
