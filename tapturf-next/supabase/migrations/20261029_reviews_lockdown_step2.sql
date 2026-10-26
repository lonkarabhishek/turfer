-- Reviews lockdown, step 2 of 2 (step 1 is 20261027_game_reports.sql).
-- Apply only when all of these hold:
--   * the app that posts reports through /api/reviews has been live at
--     least 48 hours;
--   * API logs show, for the last 24 hours, no POST, PATCH or DELETE to
--     /rest/v1/reviews or /rest/v1/review_votes;
--   * smoke checks pass for a phone sign-in and a Google sign-in: post a
--     report, edit it, remove it, post it again, Helpful on and off.
-- The check below refuses to run (and changes nothing) unless the review
-- functions exist and every TapTurf review written in the last 48 hours
-- came through them (has a private.review_saves row).
--
-- After it, reviews and Helpful votes are written only by review_save,
-- review_remove and review_vote (security definer, server key), for the
-- account the server verified. Until now anyone could insert a review as
-- any user_id, and any anonymous client could delete every vote. Reading
-- stays public (live rows only, reviews_public_read). Imports run as
-- service_role and are not affected. No policy is dropped and nothing is
-- deleted; DELETE and TRUNCATE were never needed by the app.
--
-- Revert: supabase/revert/20261029_reviews_lockdown_revert.sql.

do $$
begin
  if to_regprocedure('public.review_save(text,uuid,uuid,jsonb)') is null
     or to_regprocedure('public.review_vote(text,uuid,uuid,boolean)') is null
     or to_regclass('private.review_saves') is null then
    raise exception 'reviews lockdown: apply 20261027_game_reports.sql and deploy the app that uses it first';
  end if;
  if exists (select 1 from public.reviews r
              where r.source is null and r.created_at > now() - interval '48 hours'
                and not exists (select 1 from private.review_saves s where s.review_id = r.id)) then
    raise exception 'reviews lockdown: a TapTurf review from the last 48 hours was written past /api/reviews; an old app is still posting';
  end if;
end;
$$;

alter policy reviews_insert_app on public.reviews with check (false);
alter policy reviews_author_update on public.reviews using (false) with check (false);
alter policy reviews_author_delete on public.reviews using (false);
alter policy review_votes_insert_app on public.review_votes with check (false);
alter policy review_votes_delete_app on public.review_votes using (false);

revoke insert, update, delete, truncate on public.reviews, public.review_votes from anon, authenticated;
