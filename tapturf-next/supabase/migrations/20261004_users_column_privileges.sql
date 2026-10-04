-- users: stop exposing password / pin columns through the public API.
--
-- RLS lets anon read every users row ("Anyone can read users") and the
-- app relies on that for phone sign-in lookups, so rows stay readable.
-- But the API also returned password, pin, pin_attempts and
-- pin_locked_until. Column privileges fix that without touching rows
-- or policies: a table-wide SELECT grant would override a column
-- revoke, so revoke the table grant and re-grant the safe columns.
--
-- UPDATE: "users_update_app_legacy" lets anon update any row (phone
-- users have no Supabase session). Until phone users get real server
-- auth, limit what such an update can change to what the profile
-- screen edits. role, email, password, pin, firebase_uid and
-- is_verified are no longer writable from the API.
--
-- INSERT is unchanged (sign-up still writes the placeholder password).
-- security definer functions (handle_new_user etc.) run as the owner
-- and are unaffected. service_role keeps full access.

revoke select on public.users from anon, authenticated;
grant select (id, email, name, phone, role, is_verified, created_at, updated_at, profile_image_url, firebase_uid)
  on public.users to anon, authenticated;

revoke update on public.users from anon, authenticated;
grant update (name, phone, profile_image_url, updated_at)
  on public.users to anon, authenticated;
