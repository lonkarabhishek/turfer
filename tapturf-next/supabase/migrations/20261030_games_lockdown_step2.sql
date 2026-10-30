-- Games lockdown, step 2 of 2 (step 1 is 20261030_games_lockdown.sql).
-- Apply within minutes of step 1 (the site owner asked for this as soon
-- as possible), when all of these hold:
--   * the app whose /api/games, /api/game-requests and /api/notifications
--     routes call the step 1 functions is live, and step 1 is applied;
--   * smoke checks pass for a phone sign-in and a Google sign-in: create a
--     game, edit it, move its venue, ask to join, accept, decline,
--     withdraw, the notifications list, count and mark read, /admin,
--     /admin/requests and /admin/notifications;
--   * API logs show no writes (POST, PATCH and the rest) to /rest/v1/games,
--     game_requests, game_participants or notifications, and no GET of
--     game_requests or notifications, from the new app. Stray ones from a
--     tab still open on the old app are no reason to wait: they fail
--     after this until the tab reloads.
-- The check below refuses to run (and changes nothing) unless every step
-- 1 function exists.
--
-- After it, the API roles (anon, authenticated) can only read games and
-- game_participants, as the public pages do today (the lineup, counts,
-- the game page). They can no longer insert, update or remove a row in
-- any of the four tables, and can no longer read join requests or
-- notifications at all: those go through the step 1 functions, for the
-- account the server verified. The definer functions (step 1, the hourly
-- close_past_games, account_update on a rename, turf_page, the admin
-- reads) and the cache trigger run as the table owner and are not
-- affected; service_role is untouched. The open write policies, and the
-- open read policies on game_requests and notifications, are set to
-- false as a second lock, by name, so a later grant cannot reopen them by
-- itself; the policies that read games and participants stay. No policy
-- is removed and no row changes.
--
-- Revert: supabase/revert/20261030_games_lockdown_revert.sql.

do $$
begin
  if to_regprocedure('public.game_create(text,uuid,jsonb)') is null
     or to_regprocedure('public.game_update(text,uuid,uuid,jsonb,jsonb)') is null
     or to_regprocedure('public.game_cancel(text,uuid,uuid)') is null
     or to_regprocedure('public.game_request_send(text,uuid,uuid,text)') is null
     or to_regprocedure('public.game_request_withdraw(text,uuid,uuid)') is null
     or to_regprocedure('public.game_request_answer(text,uuid,uuid,boolean)') is null
     or to_regprocedure('public.game_requests_for(text,uuid,uuid)') is null
     or to_regprocedure('public.game_requests_mine(text,uuid)') is null
     or to_regprocedure('public.game_requests_incoming(text,uuid)') is null
     or to_regprocedure('public.notifications_mine(text,uuid,integer)') is null
     or to_regprocedure('public.notifications_unread(text,uuid)') is null
     or to_regprocedure('public.notifications_read(text,uuid,uuid)') is null
     or to_regprocedure('public.admin_game_requests(text,text)') is null
     or to_regprocedure('public.admin_notifications(text,boolean)') is null
     or to_regprocedure('public.admin_notification_counts(text)') is null then
    raise exception 'games lockdown: apply 20261030_games_lockdown.sql and deploy the app that uses it first';
  end if;
end;
$$;

revoke all on public.games, public.game_requests, public.game_participants, public.notifications from anon, authenticated;
grant select on public.games, public.game_participants to anon, authenticated;

-- The policies that let anyone (or any Google sign-in) write, by their
-- exact names as read on 30 Oct (two have a line break and two spaces in
-- them). One that is not there is skipped. A policy with no WITH CHECK
-- keeps none: Postgres then checks its USING, which is false.
do $$
declare
  v record;
begin
  for v in
    select p.tablename, p.policyname, p.cmd, p.with_check is not null as has_check
      from pg_policies p
     where p.schemaname = 'public'
       and (p.tablename, p.policyname) in (
         ('games', 'Allow all operations on games'),
         ('games', 'Anyone can create games'),
         ('games', 'Anyone can update games'),
         ('game_participants', 'Anyone can manage participants'),
         ('game_participants', 'Anyone can insert participants'),
         ('game_participants', 'System can insert participants'),
         ('game_requests', 'Anyone can create requests'),
         ('game_requests', 'Anyone can update game requests'),
         ('game_requests', 'Anyone can view own requests'),
         ('game_requests', 'Enable insert for authenticated users'),
         ('game_requests', 'Users can create requests'),
         ('game_requests', 'Enable update for game owners'),
         ('game_requests', E'Game hosts can update requests for their\n  games'),
         ('game_requests', 'Hosts can update request status'),
         ('game_requests', 'Hosts can update requests'),
         ('notifications', E'Allow all operations for authenticated\n  users'),
         ('notifications', E'Allow authenticated users to create\n  notifications'),
         ('notifications', 'Anyone can create notifications'),
         ('notifications', 'System can create notifications'),
         ('notifications', 'Users can insert notifications for others'),
         ('notifications', 'Enable insert for all authenticated users'),
         ('notifications', 'Anyone can read notifications'),
         ('notifications', 'Anyone can update notifications'),
         ('notifications', 'Enable update for own notifications'),
         ('notifications', 'Users can update own notifications'),
         ('notifications', 'Users can update their notifications'))
  loop
    if v.cmd = 'INSERT' then
      execute format('alter policy %I on public.%I with check (false)', v.policyname, v.tablename);
    elsif v.has_check then
      execute format('alter policy %I on public.%I using (false) with check (false)', v.policyname, v.tablename);
    else
      execute format('alter policy %I on public.%I using (false)', v.policyname, v.tablename);
    end if;
  end loop;
end;
$$;
