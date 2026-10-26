-- Turn the per-row turf webhook off: the function becomes a no-op and the triggers stay.
--
-- 26 Oct import day: the cache queue's second step (removing the old
-- per-row webhook) was never applied, so on_turfs_change_notify_revalidate
-- and on_trending_change_notify_revalidate still post every changed row to
-- /api/revalidate next to the queue. Each post is a legacy payload with
-- list:<city>, i.e. a revalidateTag("turf-data", "max") plus a
-- check_revalidate_secret call: 141 of the 165 list purges on 26 Oct
-- (00:00-11:30 UTC), up to 44 at once (09:32:45). The queue
-- (20261020_cache_queue.sql) already sends the same list and turf keys in
-- one batch.
--
-- CREATE OR REPLACE FUNCTION takes no lock on turfs or trending_turfs; the
-- triggers stay and call this no-op. Both are AFTER row triggers, which
-- ignore the return value; it returns the row anyway, so the function stays
-- harmless if it is ever attached as a BEFORE trigger. Revert: re-run
-- 20261019_revalidate_skip_photo_only.sql. Additive and safe to run again.
create or replace function public.notify_turf_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  -- Replaced by the cache queue (20261020_cache_queue.sql).
  return coalesce(NEW, OLD);
end;
$function$;
revoke all on function public.notify_turf_change() from public, anon, authenticated;
