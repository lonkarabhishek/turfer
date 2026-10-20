-- The photo mirror job is stopped for good (owner's call on 20 Oct, after
-- the database overload). Turfs it already copied keep their links to
-- the turf-photos bucket; the rest keep their Google links. The edge
-- function was replaced with a no-op on the same day.
-- By job id, so a re-run (the job is already gone in production since
-- 20 Oct) is a no-op instead of "could not find valid entry for job".
select cron.unschedule(jobid) from cron.job where jobname = 'mirror-turf-photos';
