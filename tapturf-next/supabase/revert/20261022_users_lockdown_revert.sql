-- NOT a migration: run by hand only to undo the users lockdown (steps 3
-- and 4) if the app has to roll back past the server account routes.
-- If step 4 was applied, run this BEFORE deploying an older app.
-- Restores exactly the grants and policies as they were on 2026-10-21.
-- GRANT and ALTER POLICY only: nothing is dropped or deleted.

grant select (id, email, name, phone, role, is_verified, created_at, updated_at, profile_image_url, firebase_uid)
  on public.users to anon, authenticated;
grant insert, delete, references, trigger, truncate on public.users to anon, authenticated;
grant update (name, phone, profile_image_url, updated_at) on public.users to anon, authenticated;

alter policy users_update_app_legacy on public.users using (true) with check (true);
alter policy "Anyone can insert users" on public.users with check (true);

grant execute on function public.live_match_get(text) to anon, authenticated;
