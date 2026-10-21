-- Accounts and usernames: fixes from the review of 20261021_accounts_usernames.sql.
-- Additive: new private tables, an index, and replaced function bodies with
-- the same signatures. Nothing is dropped, deleted or merged.
--
-- 1. Legacy email rows. A Google sign-in may land on an old email-only
--    account only if that account is on a list taken today. The created_at
--    test it replaces could be met by a row anyone could insert. A Google
--    email already held by an account not on the list no longer blocks the
--    sign-in: the Google account is made without the email, and reported.
-- 2. A phone number on a Google account opens it by phone only when that
--    phone signed in to it before today (before the public log_user_login
--    could have been used to fake one) and its phone was never changed
--    through the API since the change log began. log_user_login no longer
--    records phone sign-ins: account_resolve does, behind ACCOUNT_KEY.
--    Any account whose phone was changed through the API since the change
--    log began is reported instead of opened by that phone.
-- 3. Reports are written once per case, not on every sign-in.
-- 4. A verified phone with no account is reported.
-- 5. Username changes: at most 3 in any 30 days, counted from a log.

create table if not exists private.legacy_email_rows (
  user_id uuid primary key,
  added_at timestamptz not null default now()
);
revoke all on private.legacy_email_rows from public, anon, authenticated;
insert into private.legacy_email_rows (user_id)
select u.id
  from public.users u
 where u.email is not null
   and not exists (select 1 from auth.users a where a.id = u.id)
   and u.created_at < timestamptz '2026-10-01 00:00:00+00'
on conflict (user_id) do nothing;

create table if not exists private.username_changes (
  user_id uuid not null,
  at timestamptz not null default now()
);
revoke all on private.username_changes from public, anon, authenticated;
create index if not exists username_changes_user_at on private.username_changes (user_id, at);

create unique index if not exists account_reports_once on private.account_reports (kind, detail);

-- Phone sign-ins recorded before this moment came from the old app (and
-- one was reviewed); later ones can only come from account_resolve.
create or replace function private.phone_logins_trusted_before()
returns timestamptz
language sql
immutable
set search_path = ''
as $$ select timestamptz '2026-10-21 18:50:00+00' $$;
revoke all on function private.phone_logins_trusted_before() from public, anon, authenticated;

create or replace function private.report(p_kind text, p_detail jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.account_reports (kind, detail) values (p_kind, p_detail)
  on conflict (kind, detail) do nothing;
$$;
revoke all on function private.report(text, jsonb) from public, anon, authenticated;

create or replace function public.account_resolve(
  p_key text,
  p_kind text,
  p_phone text default null,
  p_uid uuid default null,
  p_email text default null,
  p_name text default null,
  p_avatar text default null,
  p_create boolean default false,
  p_log boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
  v_email text;
  v_created boolean := false;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;

  if p_kind = 'phone' then
    if p_phone is null or p_phone !~ '^\+91[0-9]{10}$' then
      return jsonb_build_object('r', 'bad');
    end if;
    select u.id into v_id from public.users u where u.phone = p_phone order by u.created_at limit 1;
    if v_id is not null then
      -- A number changed through the API since the change log began was
      -- never verified for that account.
      if exists (select 1 from private.users_phone_changes c where c.user_id = v_id) then
        perform private.report('phone_changed_by_api', jsonb_build_object('user_id', v_id, 'phone_tail', right(p_phone, 2)));
        return jsonb_build_object('r', 'conflict');
      end if;
      -- A number typed onto a Google account through the old profile form
      -- was never verified. Unless this phone signed in to it before the
      -- public login log could be faked, do not open that account.
      if exists (select 1 from auth.users a where a.id = v_id)
         and not exists (
           select 1 from public.user_logins l
            where l.user_id = v_id and l.method = 'phone' and l.created_at < private.phone_logins_trusted_before()
         ) then
        perform private.report('phone_on_google_row', jsonb_build_object('user_id', v_id, 'phone_tail', right(p_phone, 2)));
        return jsonb_build_object('r', 'conflict');
      end if;
    elsif p_create then
      v_name := private.clean_name(p_name);
      if v_name is null then
        return jsonb_build_object('r', 'name');
      end if;
      insert into public.users (id, name, phone, role, password)
      values (gen_random_uuid(), v_name, p_phone, 'user', 'phone-auth-no-password')
      on conflict (phone) where phone is not null do nothing;
      select u.id into v_id from public.users u where u.phone = p_phone order by u.created_at limit 1;
      v_created := true;
    else
      perform private.report('phone_no_row', jsonb_build_object('phone_tail', right(p_phone, 2)));
      return jsonb_build_object('r', 'new');
    end if;
    if p_log and not exists (
      select 1 from public.user_logins l where l.user_id = v_id and l.created_at > now() - interval '10 minutes'
    ) then
      insert into public.user_logins (user_id, method) values (v_id, 'phone');
    end if;

  elsif p_kind = 'google' then
    if p_uid is null then
      return jsonb_build_object('r', 'bad');
    end if;
    select u.id into v_id from public.users u where u.id = p_uid;
    if v_id is null and p_email is not null then
      -- An account from the old app with this email, on the list taken
      -- when this was deployed: the person lands on it as before.
      -- Reported, never merged.
      select u.id into v_id
        from public.users u
        join private.legacy_email_rows g on g.user_id = u.id
       where lower(u.email) = lower(p_email)
         and not exists (select 1 from auth.users a where a.id = u.id)
       order by u.created_at
       limit 1;
      if v_id is not null then
        perform private.report('google_on_legacy_email_row', jsonb_build_object('auth_uid', p_uid, 'user_id', v_id));
      end if;
    end if;
    if v_id is null then
      if not p_create then
        return jsonb_build_object('r', 'new');
      end if;
      -- Another account already holds this email (emails are unique): the
      -- Google account is made without it, never joined to that one.
      v_email := p_email;
      if v_email is not null and exists (select 1 from public.users u where lower(u.email) = lower(v_email)) then
        perform private.report('google_email_held', jsonb_build_object('auth_uid', p_uid));
        v_email := null;
      end if;
      insert into public.users (id, email, name, profile_image_url, role, password)
      values (p_uid, v_email,
              coalesce(private.clean_name(p_name), nullif(split_part(coalesce(p_email, ''), '@', 1), ''), 'User'),
              p_avatar, 'user', 'oauth-no-password')
      on conflict do nothing;
      select u.id into v_id from public.users u where u.id = p_uid;
      if v_id is null then
        perform private.report('google_insert_conflict', jsonb_build_object('auth_uid', p_uid));
        return jsonb_build_object('r', 'conflict');
      end if;
      v_created := true;
    end if;

  else
    return jsonb_build_object('r', 'bad');
  end if;

  return private.profile_json(v_id) || jsonb_build_object('r', 'ok', 'created', v_created);
end;
$$;
revoke all on function public.account_resolve(text, text, text, uuid, text, text, text, boolean, boolean) from public;
grant execute on function public.account_resolve(text, text, text, uuid, text, text, text, boolean, boolean) to anon, authenticated;

create or replace function public.username_set(p_key text, p_user_id uuid, p_username text default null, p_taggable boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problem text;
  v_name text;
  v_cur public.usernames%rowtype;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  perform pg_advisory_xact_lock(hashtext('username_set'));
  if p_user_id is null or not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_cur from public.usernames n where n.user_id = p_user_id;

  if p_username is null then
    if v_cur.user_id is null then
      return jsonb_build_object('r', 'bad');
    end if;
    if p_taggable is not null then
      update public.usernames set taggable = p_taggable, updated_at = now() where user_id = p_user_id;
    end if;
    return private.profile_json(p_user_id) || jsonb_build_object('r', 'ok');
  end if;

  v_problem := private.username_problem(p_username);
  if v_problem is not null then
    return jsonb_build_object('r', v_problem);
  end if;
  v_name := lower(p_username);

  if v_cur.user_id is not null and v_cur.username = v_name then
    if p_taggable is not null then
      update public.usernames set taggable = p_taggable, updated_at = now() where user_id = p_user_id;
    end if;
    return private.profile_json(p_user_id) || jsonb_build_object('r', 'ok');
  end if;

  if exists (select 1 from public.usernames n where n.username = v_name and n.user_id <> p_user_id)
     or exists (select 1 from public.username_history h where h.username = v_name and h.user_id <> p_user_id) then
    return jsonb_build_object('r', 'taken');
  end if;

  if v_cur.user_id is null then
    insert into public.usernames (user_id, username, taggable)
    values (p_user_id, v_name, coalesce(p_taggable, true));
  else
    -- The first username is free; after that, at most 3 changes in any 30 days.
    if (select count(*) from private.username_changes c where c.user_id = p_user_id and c.at > now() - interval '30 days') >= 3 then
      return jsonb_build_object('r', 'limit');
    end if;
    insert into public.username_history (username, user_id, released_at)
    values (v_cur.username, p_user_id, now())
    on conflict (username) do update set released_at = now()
      where public.username_history.user_id = excluded.user_id;
    update public.usernames
       set username = v_name,
           taggable = coalesce(p_taggable, taggable),
           changes = changes + 1,
           window_start = coalesce(window_start, now()),
           updated_at = now()
     where user_id = p_user_id;
    insert into private.username_changes (user_id) values (p_user_id);
  end if;
  return private.profile_json(p_user_id) || jsonb_build_object('r', 'ok');
exception when unique_violation then
  return jsonb_build_object('r', 'taken');
end;
$$;
revoke all on function public.username_set(text, uuid, text, boolean) from public;
grant execute on function public.username_set(text, uuid, text, boolean) to anon, authenticated;

-- Phone sign-ins are recorded by account_resolve now (behind ACCOUNT_KEY,
-- for a verified phone). The public function keeps recording Google
-- sign-ins for the signed-in Google user only, as before.
create or replace function public.log_user_login(p_user_id uuid, p_method text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_user_id is null or p_method is distinct from 'google' then
    return;
  end if;
  if auth.uid() is distinct from p_user_id then
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
