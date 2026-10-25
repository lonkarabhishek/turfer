-- An optional email for phone accounts: "turf deals and game invites".
--
-- 65% of accounts signed up by phone and have no email. They are asked
-- once (an optional field when they sign up, else one prompt later, and
-- the profile has the field for good). Google accounts keep the email
-- they signed in with and are never asked.
--
-- The typed address goes in private.user_contact_emails, never in
-- users.email: it is not checked, so it must never identify anyone.
-- users.email is unique and account_resolve and the auth trigger read
-- it, so an address typed there could hold back someone else's Google
-- account or tell a stranger the address is registered. This table has
-- no unique rule and nothing that signs people in reads it. Only the
-- person (through the account routes, ACCOUNT_KEY) and the site owner
-- (admin_contact_emails) can see it.
--
-- 1. private.user_contact_emails, private.clean_email.
-- 2. private.profile_json: adds contact_email and ask_email (same
--    signature and return type).
-- 3. public.account_set_email: save, skip or remove. Five saves a day.
-- 4. public.admin_contact_emails: for the admin people list.
-- Additive: nothing dropped, deleted or merged. Safe to run again.

create table if not exists private.user_contact_emails (
  user_id uuid primary key,
  email text check (email is null or email = lower(email)),
  -- saved, skipped (No thanks) or removed (cleared in the profile).
  answer text not null check (answer in ('saved', 'skipped', 'removed')),
  source text not null check (source in ('signup', 'prompt', 'profile')),
  -- The promise shown when they gave it.
  consent text,
  -- For a confirm link later; never grants access or links accounts.
  verified_at timestamptz,
  saves smallint not null default 0,
  window_start timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on private.user_contact_emails from public, anon, authenticated;
-- Two people may type the same address: admin flags it, nothing links on it.
create index if not exists user_contact_emails_email on private.user_contact_emails (email) where email is not null;

-- An address we accept: lowercase, no spaces, a dot in the domain. lib/account/emails.ts cleanEmail is the same rule.
create or replace function private.clean_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when length(v) between 6 and 254
               and length(split_part(v, '@', 1)) between 1 and 64
               and v ~ '^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'
              then v end
    from (select lower(btrim(coalesce(p_email, ''))) as v) x;
$$;
revoke all on function private.clean_email(text) from public, anon, authenticated;

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
           'username', n.username, 'taggable', coalesce(n.taggable, true),
           'contact_email', ce.email,
           -- A phone account with no email that has not answered yet.
           'ask_email', u.email is null and (ce.user_id is null)
                        and not exists (select 1 from auth.users a where a.id = u.id))
    from public.users u
    left join public.usernames n on n.user_id = u.id
    left join private.user_contact_emails ce on ce.user_id = u.id
   where u.id = p_user_id;
$$;
revoke all on function private.profile_json(uuid) from public, anon, authenticated;

-- p_action: save (p_email), skip (No thanks) or remove. p_source: signup, prompt or profile.
-- Answers r: ok (with the profile), email (not an address), limit, bad, unavailable.
create or replace function public.account_set_email(p_key text, p_user_id uuid, p_action text, p_email text default null, p_source text default 'profile')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_cur private.user_contact_emails%rowtype;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_action is null or p_action not in ('save', 'skip', 'remove')
     or p_source is null or p_source not in ('signup', 'prompt', 'profile') then
    return jsonb_build_object('r', 'bad');
  end if;
  -- Phone accounts only: Google and old-app accounts keep the email they have.
  if not exists (select 1 from public.users u where u.id = p_user_id and u.email is null)
     or exists (select 1 from auth.users a where a.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  perform pg_advisory_xact_lock(hashtext('account_set_email'), hashtext(p_user_id::text));
  select * into v_cur from private.user_contact_emails c where c.user_id = p_user_id;
  -- A skip answers the ask only when nothing was answered before.
  if p_action = 'skip' and v_cur.user_id is not null then
    return private.profile_json(p_user_id) || jsonb_build_object('r', 'ok');
  end if;
  if p_action = 'save' then
    v_email := private.clean_email(p_email);
    if v_email is null then
      return jsonb_build_object('r', 'email');
    end if;
    if v_cur.email is not distinct from v_email then
      return private.profile_json(p_user_id) || jsonb_build_object('r', 'ok');
    end if;
    if v_cur.window_start > now() - interval '1 day' and v_cur.saves >= 5 then
      return jsonb_build_object('r', 'limit');
    end if;
  end if;
  if p_action = 'remove' and v_cur.email is null then
    return private.profile_json(p_user_id) || jsonb_build_object('r', 'ok');
  end if;

  insert into private.user_contact_emails as c (user_id, email, answer, source, consent, saves, window_start)
  values (p_user_id, v_email,
          case p_action when 'save' then 'saved' when 'skip' then 'skipped' else 'removed' end,
          p_source, case when p_action = 'save' then 'deals_invites_v1' end,
          case when p_action = 'save' then 1 else 0 end,
          case when p_action = 'save' then now() end)
  on conflict (user_id) do update set
    email = excluded.email,
    answer = excluded.answer,
    source = excluded.source,
    consent = excluded.consent,
    verified_at = null,
    saves = case when excluded.saves = 0 then c.saves
                 when c.window_start > now() - interval '1 day' then c.saves + 1
                 else 1 end,
    window_start = case when excluded.saves = 0 then c.window_start
                        when c.window_start > now() - interval '1 day' then c.window_start
                        else now() end,
    updated_at = now();
  return private.profile_json(p_user_id) || jsonb_build_object('r', 'ok');
end;
$$;
revoke all on function public.account_set_email(text, uuid, text, text, text) from public;
grant execute on function public.account_set_email(text, uuid, text, text, text) to anon, authenticated;

-- Admin: everyone's answer. A function of its own: admin_people returns a fixed table, and changing that hangs the hosted database.
create or replace function public.admin_contact_emails(p_firebase_token text default null)
returns table (user_id uuid, email text, answer text, source text, verified boolean, answered_at timestamptz, same_as_other_account boolean)
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
  select c.user_id, c.email, c.answer, c.source, c.verified_at is not null, c.updated_at,
         c.email is not null and (
           exists (select 1 from public.users u where lower(u.email) = c.email and u.id <> c.user_id)
           or exists (select 1 from private.user_contact_emails o where o.email = c.email and o.user_id <> c.user_id))
    from private.user_contact_emails c;
end;
$$;
revoke all on function public.admin_contact_emails(text) from public;
grant execute on function public.admin_contact_emails(text) to anon, authenticated;
