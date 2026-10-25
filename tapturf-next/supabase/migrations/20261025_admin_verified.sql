-- Admin: what each account's sign-in has confirmed, from the facts.
--
-- The admin showed "Verified: No" for nearly everyone. That line read
-- users.is_verified, a flag from the old app that no sign-in sets any
-- more: 48 of the 49 Google accounts had it false although Google had
-- confirmed every one of their emails. This reads what is actually
-- known instead:
--
-- 1. email_by_google: Google gave this address and said it is verified
--    (the account's Google identity in auth.identities, email_verified).
-- 2. email_confirmed: auth confirmed the address (a Google sign-in, or
--    the old app's confirm link), and it is the account's address.
-- 3. phone_by_code: the account's number signed in with a code TapTurf
--    checked itself (a phone sign-in logged since 21 Oct 2026, when the
--    log stopped taking writes from browsers), and the number hasn't
--    changed since.
--
-- A function of its own: admin_people returns a fixed table, and
-- changing that hangs the hosted database. users.is_verified stays as it
-- is. Read only: nothing written, changed or dropped. Safe to run again.

create or replace function public.admin_verified(p_firebase_token text default null)
returns table (user_id uuid, email_by_google boolean, email_confirmed boolean, phone_by_code boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select u.id,
         u.email is not null and exists (
           select 1 from auth.identities i
            where i.user_id = u.id and i.provider = 'google'
              and lower(i.identity_data ->> 'email') = lower(u.email)
              and i.identity_data ->> 'email_verified' = 'true'),
         u.email is not null and exists (
           select 1 from auth.users a
            where a.id = u.id and a.email_confirmed_at is not null and lower(a.email) = lower(u.email)),
         u.phone is not null and exists (
           select 1 from public.user_logins l
            where l.user_id = u.id and l.method = 'phone'
              and l.created_at >= private.phone_logins_trusted_before()
              and not exists (select 1 from private.users_phone_changes c where c.user_id = u.id and c.at > l.created_at))
    from public.users u;
end;
$$;
revoke all on function public.admin_verified(text) from public;
grant execute on function public.admin_verified(text) to anon, authenticated;
