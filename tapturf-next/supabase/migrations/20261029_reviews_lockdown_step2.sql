-- Reviews lockdown, step 2 of 2 (step 1 is 20261027_game_reports.sql).
-- Apply when all of these hold:
--   * the app that posts reports through /api/reviews has been live at
--     least 48 hours;
--   * API logs show the app's own POST, PATCH and DELETE calls to
--     /rest/v1/reviews and /rest/v1/review_votes have stopped. Stray ones
--     may go on: a tab still open on the old app, or someone posting as
--     another player through the open insert policy this file closes. They
--     are no reason to wait; the check below lists them;
--   * smoke checks pass for a phone sign-in and a Google sign-in: post a
--     report, edit it, remove it, post it again, Helpful on and off.
-- The check below refuses to run (and changes nothing) unless the review
-- functions exist. It never waits on rows anyone can write: TapTurf
-- reviews from the last 48 hours that didn't come through review_save (no
-- private.review_saves row) are listed in a NOTICE, by id, for the site
-- owner to look at and hide if forged
-- (update public.reviews set status = 'hidden' where id = '...').
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
declare
  v_n integer;
  v_ids text;
begin
  if to_regprocedure('public.review_save(text,uuid,uuid,jsonb)') is null
     or to_regprocedure('public.review_vote(text,uuid,uuid,boolean)') is null
     or to_regclass('private.review_saves') is null then
    raise exception 'reviews lockdown: apply 20261027_game_reports.sql and deploy the app that uses it first';
  end if;
  select count(*) into v_n
    from public.reviews r
   where r.source is null and r.created_at > now() - interval '48 hours'
     and not exists (select 1 from private.review_saves s where s.review_id = r.id);
  if v_n > 0 then
    select string_agg(x.id::text, ', ') into v_ids
      from (select r.id from public.reviews r
             where r.source is null and r.created_at > now() - interval '48 hours'
               and not exists (select 1 from private.review_saves s where s.review_id = r.id)
             order by r.created_at desc
             limit 50) x;
    raise notice 'reviews lockdown: % TapTurf review(s) from the last 48 hours came straight from the API, not through /api/reviews (a stale tab, or a post as someone else). Check them and hide any that are forged: %', v_n, v_ids;
  end if;
end;
$$;

alter policy reviews_insert_app on public.reviews with check (false);
alter policy reviews_author_update on public.reviews using (false) with check (false);
alter policy reviews_author_delete on public.reviews using (false);
alter policy review_votes_insert_app on public.review_votes with check (false);
alter policy review_votes_delete_app on public.review_votes using (false);

revoke insert, update, delete, truncate on public.reviews, public.review_votes from anon, authenticated;
