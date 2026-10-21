-- Users lockdown, step 3 of 4 (DESIGN: accounts and usernames).
-- Apply right after the app that edits profiles through /api/account/me
-- (account_update, username_set) is live. From here the public API can no
-- longer change users rows: name and photo edits go through the account
-- RPCs, which check the verified caller and ACCOUNT_KEY. The phone number
-- is never edited through the API again (it is the phone sign-in key).
--
-- Also retires the one-argument live read: live links are read through
-- live_match_get_k, so stored player tags only reach followers after the
-- app has checked them.
--
-- Revert: supabase/revert/20261022_users_lockdown_revert.sql (GRANT and
-- ALTER POLICY only; nothing here drops or deletes anything).

alter policy users_update_app_legacy on public.users using (false) with check (false);
revoke update on public.users from anon, authenticated;

revoke execute on function public.live_match_get(text) from public, anon, authenticated;
