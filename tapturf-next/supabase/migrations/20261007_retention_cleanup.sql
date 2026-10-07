-- Retention promised in /privacy:
--   sign-in and OTP logs kept up to 12 months;
--   Call/WhatsApp tap counts kept, the link to the account dropped after 90 days.
-- Runs nightly via pg_cron at 04:00 IST (22:30 UTC).
--
-- Applied by hand in three steps (apply_migration kept timing out):
-- extension, then function, then schedule.

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.apply_retention()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.user_logins where created_at < now() - interval '12 months';
  delete from public.otp_send_log where created_at < now() - interval '12 months';
  update public.turf_contact_clicks set user_id = null
    where user_id is not null and created_at < now() - interval '90 days';
$$;
revoke all on function public.apply_retention() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'apply_retention';
select cron.schedule('apply_retention', '30 22 * * *', 'select public.apply_retention()');
