-- Copy the remaining Google-hosted turf photos into our storage, slowly
-- and at night only (the site owner's yes, 11 Nov 2026).
--
-- Google photo links expire: the August imports' links answered 403 by
-- November, and 723 active turfs (mostly added in October) still hold
-- only Google links. The mirror job (20261019_turf_photo_mirror.sql) was
-- stopped on 20 Oct after the database overload, at 5 turfs every 30
-- seconds around the clock. This runs it again at 3 turfs a minute,
-- 00:30 to 05:29 India time (19:00 to 23:59 UTC), and posts nothing once
-- no turf is left to claim. claim_photo_batch and finish_photo_job are
-- unchanged (production md5(prosrc) on 11 Nov: b6d38e4cae0f4d44b30ba27a003741d2
-- and 9c87a77ce8f085d25f0295c65fba5e54); a turf whose links are dead is
-- tried 5 times and then left as it is.
--
-- Additive and safe to run again (cron.schedule replaces a job of the
-- same name). The edge function's real version is deployed with this.
select cron.schedule('mirror-turf-photos-night', '* 19-23 * * *', $cron$
  select net.http_post(
    url := 'https://hwfsbpzercuoshodmnuf.supabase.co/functions/v1/mirror-turf-photos?n=3',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-mirror-secret', (select value from public.app_secrets where name = 'mirror_photos')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  where exists (
    select 1 from public.turfs t
    left join public.photo_mirror_jobs pj on pj.turf_id = t.id
    where t.is_active
      and (t.images::text like '%googleusercontent.com%' or coalesce(t.cover_image, '') like '%googleusercontent.com%')
      and (pj.turf_id is null or (pj.tries < 5 and (pj.last_try is null or pj.last_try < now() - interval '15 minutes')))
  )
$cron$);
