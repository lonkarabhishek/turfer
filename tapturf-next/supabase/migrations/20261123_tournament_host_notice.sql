set local lock_timeout = '5s';

-- One notice to each organiser whose name now shows on a tournament
-- (23 Nov 2026). 20261123_tournament_host.sql makes a tournament's page
-- say who started it when that person's profile is public. Tournaments
-- started before it were made when the privacy page said the organiser's
-- name did not go with them. Asked whether those should show the name too,
-- the site owner chose: "All, and tell them".
--
-- So this file writes one in-app notification (type tournament_host_shown)
-- to each account that has a tournament that is on, a public profile
-- (usernames.taggable) and a name, which is exactly whose name
-- public.tournament_host starts returning. One per organiser, not per
-- tournament; its metadata carries their most recently changed
-- tournament's code. The app links it to the profile switch that hides the
-- name (lib/my/claimNotice.ts notificationLink).
--
-- Run again, it finds its own notice and adds nothing. No email goes with
-- it (private.email_kind_of knows no such type, so the email trigger
-- returns at once) and it names no game; a phone with web push on gets it
-- as any notification.
-- Nothing else is written, no function, table, policy or grant changes.
-- Written without the destructive SQL keywords and without a backslash.
-- Apply after 20261123_tournament_host.sql, with the deploy that shows
-- the names.

do $$
begin
  if to_regprocedure('public.tournament_host(text,text)') is null
     or to_regclass('private.tournaments') is null
     or to_regclass('public.usernames') is null
     or to_regclass('public.users') is null
     or to_regclass('public.notifications') is null then
    raise exception 'tournament_host_notice needs 20261123_tournament_host.sql first';
  end if;
end;
$$;

insert into public.notifications (user_id, type, title, message, metadata, is_read)
select x.user_id,
       'tournament_host_shown',
       'Your name now shows on your tournament',
       'Tournament pages now say who started them. Yours shows your name and photo, linked to your profile, because your profile is public. To hide them, turn off "Let others find and tag me" in your profile settings.',
       jsonb_build_object('code', x.code),
       false
  from (select distinct on (t.user_id) t.user_id, t.code
          from private.tournaments t
          join public.usernames n on n.user_id = t.user_id and n.taggable
          join public.users u on u.id = t.user_id
         where t.status = 'on'
           and nullif(btrim(u.name), '') is not null
         order by t.user_id, t.updated_at desc, t.code) x
 where not exists (select 1 from public.notifications q
                    where q.user_id = x.user_id and q.type = 'tournament_host_shown');
