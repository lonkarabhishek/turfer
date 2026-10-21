-- Accounts behind verified server routes, usernames, and the lookups that
-- player tagging needs. Step 1 of the users lockdown: additive only, safe
-- with the app that is live now.
--
-- The Next app has no service-role key. It verifies who is asking (a
-- Firebase ID token for phone users, a Supabase access token for Google
-- users) and then calls these SECURITY DEFINER functions with a
-- server-held key from private.app_secrets: 'account' for account and
-- username work (env ACCOUNT_KEY), 'live_write' for live-link lookups
-- (env LIVE_WRITE_KEY). A wrong key answers 'unavailable'. EXECUTE goes to
-- anon because the key is the gate, as with live_match_put.
--
-- Rules kept here: no user row is ever removed or merged; a phone is
-- matched only as +91 and exactly 10 digits, compared in full; a username
-- once used is never given to anyone else. Supabase's default privileges
-- grant anon everything on new tables and functions, so every new object
-- revokes them first. Written without the two destructive SQL keywords.

-- Server key for account work. Copy it into Vercel as ACCOUNT_KEY
-- (Production). Rotating it blocks sign-in until the env var matches.
insert into private.app_secrets (name, value)
values ('account', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

create or replace function private.account_key_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_key is not null
     and p_key = (select s.value from private.app_secrets s where s.name = 'account');
$$;
revoke all on function private.account_key_ok(text) from public, anon, authenticated;

create or replace function private.live_key_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_key is not null
     and p_key = (select s.value from private.app_secrets s where s.name = 'live_write');
$$;
revoke all on function private.live_key_ok(text) from public, anon, authenticated;

-- Cases the owner should look at (a phone typed onto a Google row, a
-- Google sign-in that lands on an old email row, an insert that could not
-- make a row). Closed to the public API.
create table if not exists private.account_reports (
  id bigint generated always as identity primary key,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
revoke all on private.account_reports from public, anon, authenticated;

-- Until public edits of users are closed, anyone with the anon key can
-- change a row's phone. Record every change (hashes only) so a row
-- re-pointed in that window can be found.
create table if not exists private.users_phone_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  at timestamptz not null default now(),
  old_hash text,
  new_hash text
);
revoke all on private.users_phone_changes from public, anon, authenticated;

create or replace function private.log_phone_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.phone is distinct from new.phone then
    insert into private.users_phone_changes (user_id, old_hash, new_hash)
    values (new.id, md5(coalesce(old.phone, '')), md5(coalesce(new.phone, '')));
  end if;
  return new;
end;
$$;
revoke all on function private.log_phone_change() from public, anon, authenticated;

create or replace trigger users_phone_change_audit
after update of phone on public.users
for each row execute function private.log_phone_change();

-- Usernames. Read only through the functions below; no table grants.
create table if not exists public.usernames (
  user_id uuid primary key references public.users(id),
  username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,19}$'),
  taggable boolean not null default true,
  changes smallint not null default 0,
  window_start timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.usernames enable row level security;
revoke all on public.usernames from public, anon, authenticated;

-- A name someone moved away from stays theirs: old links redirect, and it
-- is never given to anyone else.
create table if not exists public.username_history (
  username text primary key,
  user_id uuid not null references public.users(id),
  released_at timestamptz not null default now()
);
alter table public.username_history enable row level security;
revoke all on public.username_history from public, anon, authenticated;
create index if not exists username_history_user_idx on public.username_history (user_id);

-- Why a username cannot be used, or null. Takes the name as typed: it must
-- be ASCII letters, digits and underscores before it is lowercased, so
-- look-alike Unicode never folds into an ASCII name.
create or replace function private.username_problem(p_name text)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_base text;
begin
  if p_name is null or p_name !~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' then
    return 'bad';
  end if;
  v_base := regexp_replace(replace(lower(p_name), '_', ''), '[0-9]+$', '');
  if v_base like '%tapturf%' or v_base like '%admin%' or v_base = any (array[
    'about', 'account', 'accounts', 'api', 'app', 'auth', 'blog', 'c', 'contact', 'dashboard',
    'everyone', 'game', 'games', 'help', 'here', 'home', 'live', 'login', 'logout', 'me', 'mod',
    'moderator', 'my', 'near', 'nearme', 'null', 'official', 'owner', 'owners', 'privacy',
    'profile', 'register', 'robots', 'root', 'settings', 'signin', 'signup', 'sitemap', 'sport',
    'sports', 'staff', 'support', 'system', 'team', 'terms', 'tool', 'tools', 'turf', 'turfs',
    'u', 'undefined', 'user', 'users', 'www'
  ]) then
    return 'reserved';
  end if;
  return null;
end;
$$;
revoke all on function private.username_problem(text) from public, anon, authenticated;

-- A name trimmed, single-spaced, without control characters, 1 to 60
-- characters, or null.
create or replace function private.clean_name(p_name text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g')), 60), '');
$$;
revoke all on function private.clean_name(text) from public, anon, authenticated;

-- The signed-in user's own profile, phone and email included. Only ever
-- returned to that user, through a verified route.
create or replace function private.profile_json(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone,
           'role', u.role, 'profile_image_url', u.profile_image_url, 'created_at', u.created_at,
           'username', n.username, 'taggable', coalesce(n.taggable, true))
    from public.users u
    left join public.usernames n on n.user_id = u.id
   where u.id = p_user_id;
$$;
revoke all on function private.profile_json(uuid) from public, anon, authenticated;

-- Find (and, for a real sign-in, make) the account for a verified
-- identity. kind 'phone': p_phone is the number Firebase verified,
-- '+91' and 10 digits, matched in full. kind 'google': p_uid is the
-- Supabase user id, p_email its verified Google email.
-- Answers the profile with r 'ok', or r 'new' (no account yet),
-- 'conflict' (reported for the owner), 'name' (a name is needed),
-- 'bad' or 'unavailable'.
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
      -- A number typed onto a Google account through the old profile form
      -- was never verified. Unless this phone has signed in to it before,
      -- do not open that account; report it instead.
      if exists (select 1 from auth.users a where a.id = v_id)
         and not exists (select 1 from public.user_logins l where l.user_id = v_id and l.method = 'phone') then
        insert into private.account_reports (kind, detail)
        values ('phone_on_google_row', jsonb_build_object('user_id', v_id, 'phone_tail', right(p_phone, 2)));
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
      -- An account from the old app with this email and no Google id: the
      -- person lands on it as before. Reported, never merged.
      select u.id into v_id
        from public.users u
       where lower(u.email) = lower(p_email)
         and not exists (select 1 from auth.users a where a.id = u.id)
         and u.created_at < timestamptz '2026-10-01 00:00:00+00'
       order by u.created_at
       limit 1;
      if v_id is not null then
        insert into private.account_reports (kind, detail)
        values ('google_on_legacy_email_row', jsonb_build_object('auth_uid', p_uid, 'user_id', v_id));
      end if;
    end if;
    if v_id is null then
      if not p_create then
        return jsonb_build_object('r', 'new');
      end if;
      insert into public.users (id, email, name, profile_image_url, role, password)
      values (p_uid, p_email,
              coalesce(private.clean_name(p_name), nullif(split_part(coalesce(p_email, ''), '@', 1), ''), 'User'),
              p_avatar, 'user', 'oauth-no-password')
      on conflict do nothing;
      select u.id into v_id from public.users u where u.id = p_uid;
      if v_id is null then
        insert into private.account_reports (kind, detail)
        values ('google_insert_conflict', jsonb_build_object('auth_uid', p_uid));
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

-- The signed-in user's name. Phone is not editable: it is the phone
-- sign-in key, and only a verified number may set it.
create or replace function public.account_update(p_key text, p_user_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  v_name := private.clean_name(p_name);
  if p_user_id is null or v_name is null then
    return jsonb_build_object('r', 'bad');
  end if;
  update public.users set name = v_name where id = p_user_id;
  if not found then
    return jsonb_build_object('r', 'bad');
  end if;
  return private.profile_json(p_user_id) || jsonb_build_object('r', 'ok');
end;
$$;
revoke all on function public.account_update(text, uuid, text) from public;
grant execute on function public.account_update(text, uuid, text) to anon, authenticated;

-- Whether p_username is free for p_user_id: r 'ok', 'bad', 'reserved',
-- 'taken'. A name in someone else's history counts as taken.
create or replace function public.username_check(p_key text, p_user_id uuid, p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_problem text;
  v_name text := lower(p_username);
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  v_problem := private.username_problem(p_username);
  if v_problem is not null then
    return jsonb_build_object('r', v_problem);
  end if;
  if exists (select 1 from public.usernames n where n.username = v_name and n.user_id is distinct from p_user_id)
     or exists (select 1 from public.username_history h where h.username = v_name and h.user_id is distinct from p_user_id) then
    return jsonb_build_object('r', 'taken');
  end if;
  return jsonb_build_object('r', 'ok', 'username', v_name);
end;
$$;
revoke all on function public.username_check(text, uuid, text) from public;
grant execute on function public.username_check(text, uuid, text) to anon, authenticated;

-- The first free name from candidates built by the app (it folds accents
-- and spaces), or null.
create or replace function public.username_pick(p_key text, p_candidates text[])
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) or p_candidates is null then
    return null;
  end if;
  return (
    select lower(c.name)
      from unnest(p_candidates[1:50]) with ordinality as c(name, i)
     where private.username_problem(c.name) is null
       and not exists (select 1 from public.usernames n where n.username = lower(c.name))
       and not exists (select 1 from public.username_history h where h.username = lower(c.name))
     order by c.i
     limit 1);
end;
$$;
revoke all on function public.username_pick(text, text[]) from public;
grant execute on function public.username_pick(text, text[]) to anon, authenticated;

-- Set or change a username, and/or the "Let others find and tag me"
-- switch (p_username null changes only the switch). The first username is
-- free; after that, at most 3 changes in 30 days. The old name goes to
-- history and stays this user's. One call at a time, so two people
-- cannot take the same name in the gap between check and write.
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
  v_changes smallint;
  v_window timestamptz;
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
    v_window := v_cur.window_start;
    v_changes := v_cur.changes;
    if v_window is null or v_window < now() - interval '30 days' then
      v_window := now();
      v_changes := 0;
    end if;
    if v_changes >= 3 then
      return jsonb_build_object('r', 'limit');
    end if;
    insert into public.username_history (username, user_id, released_at)
    values (v_cur.username, p_user_id, now())
    on conflict (username) do update set released_at = now()
      where public.username_history.user_id = excluded.user_id;
    update public.usernames
       set username = v_name,
           taggable = coalesce(p_taggable, taggable),
           changes = v_changes + 1,
           window_start = v_window,
           updated_at = now()
     where user_id = p_user_id;
  end if;
  return private.profile_json(p_user_id) || jsonb_build_object('r', 'ok');
exception when unique_violation then
  return jsonb_build_object('r', 'taken');
end;
$$;
revoke all on function public.username_set(text, uuid, text, boolean) from public;
grant execute on function public.username_set(text, uuid, text, boolean) to anon, authenticated;

-- Find people to tag: taggable usernames that start with q, or whose
-- name contains q. Never matches phone or email; never returns ids.
create or replace function public.players_search(p_key text, p_q text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(btrim(coalesce(p_q, '')));
  v_like text;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  v_q := regexp_replace(v_q, '^@', '');
  if length(v_q) < 2 or length(v_q) > 30 then
    return jsonb_build_object('r', 'ok', 'players', '[]'::jsonb);
  end if;
  v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  return jsonb_build_object('r', 'ok', 'players', coalesce((
    select jsonb_agg(jsonb_build_object('u', p.username, 'name', p.name, 'photo', p.photo) order by p.rank, p.username)
      from (
        select n.username, u.name, u.profile_image_url as photo,
               case when n.username = v_q then 0 when n.username like v_like || '%' then 1 else 2 end as rank
          from public.usernames n
          join public.users u on u.id = n.user_id
         where n.taggable
           and (n.username like v_like || '%' or lower(u.name) like '%' || v_like || '%')
         order by 4, n.username
         limit 8
      ) p
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.players_search(text, text) from public;
grant execute on function public.players_search(text, text) to anon, authenticated;

-- Live links: which tagged usernames may show, as their current names. A
-- name someone moved away from resolves to their current one. People who
-- turned tagging off, or unknown names, are left out. At most 64 names.
create or replace function public.live_tags_check(p_key text, p_usernames text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.live_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_usernames is null or cardinality(p_usernames) = 0 then
    return jsonb_build_object('r', 'ok', 'tags', '[]'::jsonb);
  end if;
  if cardinality(p_usernames) > 64 then
    return jsonb_build_object('r', 'too_many');
  end if;
  return jsonb_build_object('r', 'ok', 'tags', coalesce((
    select jsonb_agg(jsonb_build_object('asked', a.asked, 'u', cur.username))
      from (select distinct lower(x) as asked from unnest(p_usernames) as x where x ~ '^[a-z][a-z0-9_]{2,19}$') a
      join lateral (
        select coalesce(
          (select n.user_id from public.usernames n where n.username = a.asked),
          (select h.user_id from public.username_history h where h.username = a.asked)
        ) as user_id
      ) who on who.user_id is not null
      join public.usernames cur on cur.user_id = who.user_id and cur.taggable
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.live_tags_check(text, text[]) from public;
grant execute on function public.live_tags_check(text, text[]) to anon, authenticated;

-- The public profile page: current name, display name, photo and join
-- date, or where an old name moved to. Nothing for someone who turned
-- tagging off. No ids.
create or replace function public.profile_get(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text := lower(coalesce(p_username, ''));
  v_user uuid;
begin
  if v_name !~ '^[a-z][a-z0-9_]{2,19}$' then
    return null;
  end if;
  if exists (select 1 from public.usernames n where n.username = v_name and n.taggable) then
    return (
      select jsonb_build_object('u', n.username, 'name', u.name, 'photo', u.profile_image_url, 'since', u.created_at)
        from public.usernames n join public.users u on u.id = n.user_id
       where n.username = v_name);
  end if;
  select h.user_id into v_user from public.username_history h where h.username = v_name;
  if v_user is not null then
    return (select jsonb_build_object('moved_to', n.username) from public.usernames n where n.user_id = v_user and n.taggable);
  end if;
  return null;
end;
$$;
revoke all on function public.profile_get(text) from public;
grant execute on function public.profile_get(text) to anon, authenticated;

-- Admin user lists, for the site owner only (the same check as
-- get_recent_logins). Replaces the admin pages' anon reads of email and
-- phone.
create or replace function public.admin_users(p_firebase_token text default null, p_ids uuid[] default null)
returns table (id uuid, name text, email text, phone text, role text, is_verified boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select u.id, u.name::text, u.email::text, u.phone::text, u.role::text, u.is_verified, u.created_at
      from public.users u
     where p_ids is null or u.id = any (p_ids)
     order by u.created_at desc;
end;
$$;
revoke all on function public.admin_users(text, uuid[]) from public;
grant execute on function public.admin_users(text, uuid[]) to anon, authenticated;

-- The live read, behind the live write key. The one-argument
-- live_match_get stays callable until the app that uses this one is live;
-- then its EXECUTE is revoked from anon, so stored tags are only served
-- through the app, which filters them.
create or replace function public.live_match_get_k(p_key text, p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.live_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_code is null or p_code !~ '^[a-z0-9]{12}$' then
    return null;
  end if;
  return (
    select jsonb_build_object(
             'match', m.match,
             'rev', m.rev,
             'status', m.status,
             'updated_at', m.updated_at)
      from public.live_matches m
     where m.code = p_code);
end;
$$;
revoke all on function public.live_match_get_k(text, text) from public;
grant execute on function public.live_match_get_k(text, text) to anon, authenticated;
