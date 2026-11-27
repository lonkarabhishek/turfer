set local lock_timeout = '5s';

-- One notice to each organiser whose tournament now shows on a turf's
-- page (27 Nov 2026). 20261128_turf_events.sql and the deploy with it make
-- a turf's page say what is on there (the site owner: "if a tournament is
-- setup or a live match is setup on turf show that please on the turf
-- page"). Tournaments started before it had their venue picked when the
-- venue only made a link from the tournament to the turf, so their
-- organisers are told, as the organisers whose names started showing were
-- (20261123_tournament_host_notice.sql).
--
-- So this file writes one in-app notification (type
-- tournament_on_turf_page) to each account that has a tournament which
-- public.turf_events_now starts returning: it is on, it is kept with that
-- account, its venue is a listed turf, and it was changed in the last 14
-- of India's days or has a match being scored right now. One per organiser, not per tournament; it names
-- their most recently changed such tournament and that turf, and its
-- metadata carries the tournament's code. The app links it to the
-- tournament's page, where Manage has the venue (lib/my/claimNotice.ts
-- notificationLink). A tournament whose organiser never signed in is on
-- no turf's page and has no account, so there is nothing to say and
-- nobody to tell; the venue picker tells them to sign in for it.
--
-- Run again, it finds its own notice and adds nothing. No email goes with
-- it (private.email_kind_of knows no such type, so the email trigger
-- returns at once) and it names no game; a phone with web push on gets it
-- as any notification.
-- Nothing else is written, no function, table, policy or grant changes.
-- Written without the destructive SQL keywords and without a backslash.
-- Apply after 20261128_turf_events.sql, with the deploy that shows
-- tournaments on turf pages.

do $$
begin
  if to_regprocedure('public.turf_events_now(text)') is null
     or to_regclass('private.tournaments') is null
     or to_regclass('private.tournament_fixtures') is null
     or to_regclass('public.live_matches') is null
     or to_regclass('public.turfs') is null
     or to_regclass('public.users') is null
     or to_regclass('public.notifications') is null then
    raise exception 'turf_events_notice needs 20261128_turf_events.sql first';
  end if;
end;
$$;

insert into public.notifications (user_id, type, title, message, metadata, is_read)
select x.user_id,
       'tournament_on_turf_page',
       'Your tournament now shows on the turf''s page',
       x.name || ' now shows on ' || x.turf_name || '''s page on TapTurf, because you picked that turf as its venue. To take it off, change the venue under Manage.',
       jsonb_build_object('code', x.code),
       false
  from (select distinct on (t.user_id) t.user_id, t.code, t.name, left(coalesce(nullif(btrim(s.name), ''), 'the turf'), 80) as turf_name
          from private.tournaments t
          join public.turfs s on s.id = (t.settings -> 'venue' ->> 'id')::uuid and s.is_active
          join public.users u on u.id = t.user_id
         where t.status = 'on'
           and t.user_id is not null
           and jsonb_typeof(t.settings -> 'venue') = 'object'
           -- Exactly the tournaments public.turf_events_now counts: changed in the last 14 of India's days, or a match on now.
           and ((now() at time zone 'Asia/Kolkata')::date - (t.updated_at at time zone 'Asia/Kolkata')::date <= 14
                or exists (select 1
                             from private.tournament_fixtures f
                             join public.live_matches c on c.code = f.live_code
                            where f.code = t.code
                              and f.status <> 'removed'
                              and f.result is null and f.live_result is null
                              and c.status = 'live' and c.updated_at > now() - interval '2 hours'))
         order by t.user_id, t.updated_at desc, t.code) x
 where not exists (select 1 from public.notifications q
                    where q.user_id = x.user_id and q.type = 'tournament_on_turf_page');
