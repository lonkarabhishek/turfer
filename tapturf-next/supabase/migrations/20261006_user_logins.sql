-- Sign-in log for the admin "Latest logins" tile.
--
-- Rows come from log_user_login(): the OAuth callback (Google, with the
-- new session, so auth.uid() must match) and the phone OTP form after
-- Firebase verified the code (phone users have no Supabase session, so
-- we can only check the account exists). One row per person per 10
-- minutes, so double taps and retries don't pile up.
--
-- Closed table: RLS on, no policies, no grants. The only way to read it
-- is get_recent_logins(), which answers the site owner only.

-- For the phone-owner check in _is_site_owner (synchronous HTTP call).
create extension if not exists http with schema extensions;

create table if not exists public.user_logins (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  method text not null check (method in ('phone', 'google')),
  created_at timestamptz not null default now()
);
create index if not exists user_logins_created_idx on public.user_logins (created_at desc);
create index if not exists user_logins_user_idx on public.user_logins (user_id, created_at desc);
alter table public.user_logins enable row level security;
revoke all on public.user_logins from anon, authenticated;

create or replace function public.log_user_login(p_user_id uuid, p_method text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_method is null or p_method not in ('phone', 'google') then
    return;
  end if;
  if p_method = 'google' and auth.uid() is distinct from p_user_id then
    return;
  end if;
  if p_method = 'phone' and not exists (select 1 from public.users where id = p_user_id) then
    return;
  end if;
  if exists (
    select 1 from public.user_logins
    where user_id = p_user_id and created_at > now() - interval '10 minutes'
  ) then
    return;
  end if;
  insert into public.user_logins (user_id, method) values (p_user_id, p_method);
end;
$$;
revoke all on function public.log_user_login(uuid, text) from public;
grant execute on function public.log_user_login(uuid, text) to anon, authenticated;

-- Is the caller the site owner? Same owner as lib/admin/auth.ts.
--   Google: the Supabase session's email (verified by Supabase).
--   Phone: a Firebase ID token, checked by asking Google's Identity
--   Toolkit who it belongs to (needs the `http` extension; without it
--   only the Google path works).
create or replace function public._is_site_owner(p_firebase_token text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) = 'lonkarabhishek00@gmail.com' then
    return true;
  end if;
  if p_firebase_token is null or length(p_firebase_token) < 100
     or not exists (select 1 from pg_extension where extname = 'http') then
    return false;
  end if;
  begin
    execute $q$
      select r.content::jsonb #>> '{users,0,phoneNumber}'
      from extensions.http_post(
        'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyDQE1iEsJXZqqHLJw5WrtjkD5A0vwpvwxY',
        json_build_object('idToken', $1)::text,
        'application/json'
      ) r
      where r.status = 200
    $q$ into v_phone using p_firebase_token;
  exception when others then
    return false;
  end;
  return right(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), 10) = '9403612979';
end;
$$;
revoke all on function public._is_site_owner(text) from public, anon, authenticated;

-- Latest sign-ins, newest first. Google sign-ins from before this log
-- existed come from auth.users.last_sign_in_at (one per account).
create or replace function public.get_recent_logins(p_limit integer default 200, p_firebase_token text default null)
returns table (
  user_id uuid,
  name text,
  phone text,
  email text,
  method text,
  logged_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with l as (
    select ul.user_id, ul.method, ul.created_at
    from public.user_logins ul
    union all
    select au.id, 'google'::text, au.last_sign_in_at
    from auth.users au
    where au.last_sign_in_at is not null
      and not exists (
        select 1 from public.user_logins x
        where x.user_id = au.id and x.created_at >= au.last_sign_in_at - interval '10 minutes'
      )
  )
  select l.user_id, u.name::text, u.phone::text, coalesce(u.email, au.email)::text, l.method, l.created_at
  from l
  left join public.users u on u.id = l.user_id
  left join auth.users au on au.id = l.user_id
  order by l.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;
revoke all on function public.get_recent_logins(integer, text) from public;
grant execute on function public.get_recent_logins(integer, text) to anon, authenticated;
