-- Users lockdown, step 4 of 4. Apply only when all of these hold:
--   * the app from step 2 has been live at least 48 hours;
--   * API logs show, for the last 24 hours, no anon or authenticated read
--     of public.users that selects or filters email or phone, and no POST
--     or PATCH to /rest/v1/users;
--   * smoke checks pass: phone sign-in, phone sign-up, Google sign-in,
--     profile save, /admin and /admin/users.
-- After it, phone numbers and emails are readable only by server code
-- (SECURITY DEFINER functions) and, through /api/account/me, by the person
-- they belong to. Name, photo and the other listed columns stay public.
-- Nothing is deleted; DELETE and TRUNCATE were never used by the app and
-- go with the rest.
--
-- Revert: supabase/revert/20261022_users_lockdown_revert.sql.

revoke all on public.users from anon, authenticated;
grant select (id, name, role, is_verified, created_at, updated_at, profile_image_url) on public.users to anon, authenticated;

-- Accounts are made only by account_resolve (definer) from now on.
alter policy "Anyone can insert users" on public.users with check (false);
