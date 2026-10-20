-- Cache queue, step 2: remove the per-row turf webhook.
--
-- 19/20 Oct outage follow-up. notify_turf_change() posted every changed
-- turfs and trending_turfs row to /api/revalidate on its own (the storm
-- described in 20261020_cache_queue.sql). The queue's triggers and
-- private.flush_cache() replace it.
--
-- APPLY ONLY AFTER both of these hold:
--   1. the /api/revalidate that accepts {"keys": [...]} is live, and
--   2. 20261020_cache_queue.sql is applied and its flushes succeed:
--        select status_code, count(*) from net._http_response
--         where created > now() - interval '1 hour' group by 1;   -- all 200
--        select count(*), count(sent_at) from private.cache_dirty; -- drains to 0
--        select status, count(*) from cron.job_run_details
--         where jobid = (select jobid from cron.job where jobname = 'flush-cache')
--         group by 1;                                              -- succeeded
-- Afterwards /api/revalidate's legacy {record} branch can go in a later
-- release (keep check_revalidate_secret: the route still uses it while
-- REVALIDATE_SECRET is not set in Vercel).

drop trigger if exists on_turfs_change_notify_revalidate on public.turfs;
drop trigger if exists on_trending_change_notify_revalidate on public.trending_turfs;
drop function if exists public.notify_turf_change();
