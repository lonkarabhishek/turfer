-- NOT a migration: run by hand only to undo the reviews lockdown
-- (supabase/migrations/20261029_reviews_lockdown_step2.sql) if the app has
-- to roll back past /api/reviews. Run it BEFORE deploying the older app.
-- Restores exactly the grants and policies as they were on 2026-10-26
-- (pg_policies and information_schema.role_table_grants, read that day).
-- GRANT and ALTER POLICY only: nothing is dropped or deleted. The guard
-- trigger from 20261027_game_reports.sql stays, so direct writes still
-- can't forge a report's badge, status or scorecard.

alter policy reviews_insert_app on public.reviews
  with check ((user_id is not null) and ((rating >= 1) and (rating <= 5)));
alter policy reviews_author_update on public.reviews
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy reviews_author_delete on public.reviews
  using (user_id = (select auth.uid()));
alter policy review_votes_insert_app on public.review_votes
  with check (user_id is not null);
alter policy review_votes_delete_app on public.review_votes
  using (user_id is not null);

grant insert, update, delete, truncate on public.reviews, public.review_votes to anon, authenticated;
