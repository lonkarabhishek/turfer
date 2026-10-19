-- Close games once they are over: 30 minutes after their end time
-- (India time), or 2 hours after start when the end time is missing or
-- runs past midnight. Lists only show open games, so this only tidies
-- status for hosts, admin and reports. Runs hourly via pg_cron.
create or replace function public.close_past_games()
returns integer
language sql
security definer
set search_path = public
as $$
  with done as (
    update public.games g
       set status = 'completed', updated_at = now()
     where g.status in ('open', 'full')
       and g.date is not null
       and (case
              when g.end_time is not null and g.start_time is not null and g.end_time > g.start_time then g.date + g.end_time
              when g.start_time is not null then g.date + g.start_time + interval '2 hours'
              else g.date + time '23:59'
            end) < (now() at time zone 'Asia/Kolkata') - interval '30 minutes'
    returning 1
  )
  select count(*)::integer from done;
$$;
revoke all on function public.close_past_games() from public, anon, authenticated;

select cron.schedule('close-past-games', '17 * * * *', 'select public.close_past_games()');
