-- Admin: what each account's sign-in has confirmed, from the facts.
--
-- The admin showed "Verified: No" for nearly everyone. That line read
-- users.is_verified, a flag from the old app that no sign-in sets any
-- more: 48 of the 49 Google accounts had it false although Google had
-- confirmed every one of their emails. This reads what is actually
-- known instead:
--
-- 1. email_by_google: Google gave the address and said it is verified
--    (a Google identity in auth.identities with email_verified). It is
--    the account's own identity, or, for an old-app account, the Google
--    sign-in that account_resolve lands on it (same rule: the row is on
--    private.legacy_email_rows, has no auth user of its own, the address
--    matches, and that Google user has no row of its own). An account
--    made without its address, because another row holds it, still
--    counts by its own identity.
-- 2. email_confirmed: auth confirmed the account's address (a Google
--    sign-in, or the old app's confirm link).
-- 3. phone_by_code: the account's current number was checked with a
--    Firebase code on the server: a sign-in, or a later visit whose
--    session token carries that number. Kept in private.phone_verified
--    (the sign-in log is cleared after 12 months), and the logged phone
--    sign-ins since 21 Oct 2026 18:50 UTC (when the log stopped taking
--    writes from browsers) still count.
--
-- Parts:
-- a. private.phone_verified: one row per account, the number's md5 and
--    when it was last checked. A changed number no longer matches.
-- b. Filled once from the trusted phone sign-ins already logged.
-- c. public.account_phone_checked (server key only): the server calls it
--    after it verified a Firebase phone token for the account's own
--    number. At most one write a day per account.
-- d. public.admin_verified (site owner only, read only), ordered by id
--    so paged reads are stable.
--
-- A function of its own: admin_people returns a fixed table, and
-- changing that hangs the hosted database. users.is_verified stays as it
-- is. Additive: nothing dropped, deleted or merged. Safe to run again.

create table if not exists private.phone_verified (
  user_id uuid primary key,
  phone_hash text not null,
  at timestamptz not null default now()
);
revoke all on private.phone_verified from public, anon, authenticated;

insert into private.phone_verified (user_id, phone_hash, at)
select u.id, md5(u.phone), max(l.created_at)
  from public.users u
  join public.user_logins l on l.user_id = u.id
 where u.phone is not null
   and l.method = 'phone'
   and l.created_at >= private.phone_logins_trusted_before()
   and not exists (select 1 from private.users_phone_changes c where c.user_id = u.id and c.at > l.created_at)
 group by u.id, u.phone
on conflict (user_id) do nothing;

create or replace function public.account_phone_checked(p_key text, p_user_id uuid, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_phone is null or p_phone !~ '^\+91[0-9]{10}$' then
    return jsonb_build_object('r', 'bad');
  end if;
  -- Only the account's own number: one typed onto another account proves nothing about it.
  if not exists (select 1 from public.users u where u.id = p_user_id and u.phone = p_phone) then
    return jsonb_build_object('r', 'other');
  end if;
  insert into private.phone_verified as v (user_id, phone_hash, at)
  values (p_user_id, md5(p_phone), now())
  on conflict (user_id) do update set phone_hash = excluded.phone_hash, at = excluded.at
   where v.phone_hash is distinct from excluded.phone_hash or v.at < now() - interval '1 day';
  return jsonb_build_object('r', 'ok');
end;
$$;
revoke all on function public.account_phone_checked(text, uuid, text) from public;
grant execute on function public.account_phone_checked(text, uuid, text) to anon, authenticated;

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
  with g as (
    select u.id,
           exists (
             select 1 from auth.identities i
              where i.provider = 'google'
                and i.identity_data ->> 'email_verified' = 'true'
                and (
                  -- Its own Google identity (made without the address when another row holds it).
                  (i.user_id = u.id and (u.email is null or lower(i.identity_data ->> 'email') = lower(u.email)))
                  -- An old-app row that account_resolve sends this Google sign-in to.
                  or (u.email is not null
                      and lower(i.identity_data ->> 'email') = lower(u.email)
                      and exists (select 1 from private.legacy_email_rows lg where lg.user_id = u.id)
                      and not exists (select 1 from auth.users a0 where a0.id = u.id)
                      and not exists (select 1 from public.users x where x.id = i.user_id)))) as by_google
      from public.users u
  )
  select u.id,
         g.by_google,
         (g.by_google and u.email is not null) or (u.email is not null and exists (
           select 1 from auth.users a
            where a.id = u.id and a.email_confirmed_at is not null and lower(a.email) = lower(u.email))),
         u.phone is not null and (
           exists (select 1 from private.phone_verified v where v.user_id = u.id and v.phone_hash = md5(u.phone))
           or exists (
             select 1 from public.user_logins l
              where l.user_id = u.id and l.method = 'phone'
                and l.created_at >= private.phone_logins_trusted_before()
                and not exists (select 1 from private.users_phone_changes c where c.user_id = u.id and c.at > l.created_at)))
    from public.users u
    join g on g.id = u.id
   order by u.id;
end;
$$;
revoke all on function public.admin_verified(text) from public;
grant execute on function public.admin_verified(text) to anon, authenticated;
