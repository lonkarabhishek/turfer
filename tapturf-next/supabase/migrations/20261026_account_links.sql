-- One TapTurf account, two ways in.
--
-- 1. A phone account adds, changes or removes its email only by signing
--    in with Google from the profile, right after a fresh phone OTP.
--    That Google account then opens the same account:
--    private.account_google_links, made by account_link_google from a
--    one-time intent (account_link_start) that the fresh phone sign-in
--    started. Each Google round trip is a leg (account_link_legs) whose
--    PKCE verifier only the server and that browser's httpOnly cookie
--    hold; account_link_attach records which Google account came back,
--    and the person confirms it before the link is made.
-- 2. A Google account adds, confirms, changes or removes its phone number
--    after a Google sign-in in the last 10 minutes and a fresh Firebase
--    OTP for the new number (account_set_phone, account_remove_phone).
--    A number set that way, and not changed since, opens the account by
--    phone: private.phone_links, read by private.phone_link_ok. Nothing
--    weaker counts. A phone account reached through its Google link can
--    never change its number here: the number is how it logs in.
-- 3. The auth.users trigger makes no TapTurf account any more. Google
--    accounts are made by account_resolve with create (the sign-in
--    callback, then POST /api/account/me), which knows about links and
--    open intents. A Google account taken off a phone account gets
--    r = 'replaced' instead of a new empty account, unless the person
--    asks for one (account_google_fresh).
-- 4. Typed emails are no longer taken. ask_email and email_editable are
--    false from now on, so older pages never open the typed ask or field;
--    the new ask is ask_google. The 5 typed emails stay in
--    private.user_contact_emails; their owners can still remove them,
--    also after adding Google (account_set_email).
-- 5. Admin: admin_verified counts both ways in; admin_sign_in_links,
--    admin_google_unfinished and admin_link_refusals are new reads
--    (admin_link_refusals also lists links made over an empty own row).
--
-- Decided here: a Google sign-in whose email matches an old-app row on
-- private.legacy_email_rows in another case (Foo@Gmail.com) lands on that
-- row, as the legacy rule says; the trigger used to give it a new, empty
-- row. A new Google account whose address another row holds in another
-- case gets no email (google_email_held), never a second copy.
--
-- Decided by the owner (2026-10-26): a Google account whose own TapTurf
-- row was never used (private.account_is_empty, the one definition of
-- empty) can still be added to a phone account. The link is made over
-- that row: from then on the Google sign-in opens the phone account, and
-- the empty row stays exactly as it is (nothing removed, changed or
-- moved). The link is reported (link_over_empty) and admin lists it next
-- to the refusals. An own row with any activity, and an old-app row the
-- Google account lands on, are still refused (has_account). When such a
-- link ends (a swap or a removal), that Google account gets r = 'replaced'
-- like any other taken off a phone account, never the old row in silence
-- (private.google_own_row); "Make a new TapTurf account with Google"
-- (account_google_fresh) then opens that row again, as it is.
--
-- Rules kept: no users row is ever removed or merged, nothing moves from
-- one account to another, a Google account or number that already has a
-- used account is refused. Additive: new private tables, new functions,
-- replaced function bodies with the same signatures and return types.
-- Written without the destructive SQL keywords. Safe to run again.
-- Needs 20261024_users_lockdown_step4.sql applied first (checked below):
-- with public.users open to API inserts, a forged row could hide a link.
-- Apply after the app that reads ask_google is live (the app works with
-- either database).

set local lock_timeout = '5s';

do $$
begin
  if has_any_column_privilege('anon', 'public.users', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.users', 'INSERT') then
    raise exception 'Apply 20261024_users_lockdown_step4.sql first: public.users must not take inserts from the API';
  end if;
end;
$$;

-- ── Tables ─────────────────────────────────────────────────

-- A Google sign-in (auth.users.id) that opens a phone account. One open
-- link per Google account and per TapTurf account; an ended one is kept.
create table if not exists private.account_google_links (
  id bigint generated always as identity primary key,
  auth_uid uuid not null,
  user_id uuid not null,
  -- The address Google confirmed when it was added, lowercase.
  email text check (email is null or email = lower(email)),
  intent_id bigint,
  linked_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_reason text check (ended_reason is null or ended_reason in ('changed', 'removed'))
);
revoke all on private.account_google_links from public, anon, authenticated;
create unique index if not exists account_google_links_auth_open on private.account_google_links (auth_uid) where ended_at is null;
create unique index if not exists account_google_links_user_open on private.account_google_links (user_id) where ended_at is null;
create index if not exists account_google_links_user on private.account_google_links (user_id, linked_at);
create index if not exists account_google_links_auth on private.account_google_links (auth_uid);

-- "Add Google", asked by a phone sign-in made in the last 5 minutes.
-- Ten minutes, closed on every final outcome.
create table if not exists private.account_link_intents (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  kind text not null default 'google' check (kind in ('google')),
  -- md5 of the Firebase uid and of the number that asked: every later step must be the same phone sign-in.
  fb_sub_hash text not null,
  phone_hash text not null,
  -- When that OTP sign-in happened, and its single-use key (private.otp_proofs).
  auth_time timestamptz not null,
  proof_key text not null check (proof_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- The Google account that came back on the newest leg and can be confirmed.
  auth_uid uuid,
  returned_at timestamptz,
  closed_at timestamptz,
  outcome text check (outcome is null or outcome in (
    'linked', 'cancelled', 'expired', 'replaced', 'mismatch', 'not_allowed', 'gave_up',
    'has_account', 'other_account', 'unverified', 'bad'))
);
revoke all on private.account_link_intents from public, anon, authenticated;
create index if not exists account_link_intents_user on private.account_link_intents (user_id, created_at);
create index if not exists account_link_intents_open_uid on private.account_link_intents (auth_uid) where closed_at is null;
create index if not exists account_link_intents_proof on private.account_link_intents (proof_key);

-- One Google round trip of an intent. The browser's httpOnly cookie holds
-- the PKCE verifier; only sha256('tt-link:' || verifier) is kept here, so
-- the code_challenge Google and Supabase see is not this value.
create table if not exists private.account_link_legs (
  id bigint generated always as identity primary key,
  intent_id bigint not null,
  secret_hash text not null unique check (secret_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  auth_uid uuid,
  returned_at timestamptz,
  outcome text check (outcome is null or outcome in ('ok', 'has_account', 'other_account', 'unverified', 'bad'))
);
revoke all on private.account_link_legs from public, anon, authenticated;
create index if not exists account_link_legs_intent on private.account_link_legs (intent_id, id);
create index if not exists account_link_legs_auth on private.account_link_legs (auth_uid) where auth_uid is not null;

-- Fresh phone OTPs already used: sha256 hex of "<Firebase uid>:<auth_time>",
-- so one OTP sign-in counts once, however many ID tokens it mints.
create table if not exists private.otp_proofs (
  proof_key text primary key check (proof_key ~ '^[0-9a-f]{64}$'),
  purpose text not null check (purpose in ('link_google', 'unlink_google', 'set_phone')),
  user_id uuid not null,
  at timestamptz not null default now()
);
revoke all on private.otp_proofs from public, anon, authenticated;

-- A number a Google sign-in proved with an OTP from the profile.
-- change_id is the users_phone_changes row that set it (null: the number
-- was already there and the log has no change for the account). It opens
-- the account only while that change is still the latest one.
create table if not exists private.phone_links (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  phone_hash text not null,
  change_id bigint,
  proof_key text not null check (proof_key ~ '^[0-9a-f]{64}$'),
  at timestamptz not null default now(),
  ended_at timestamptz,
  ended_reason text check (ended_reason is null or ended_reason in ('changed', 'removed'))
);
revoke all on private.phone_links from public, anon, authenticated;
create unique index if not exists phone_links_open on private.phone_links (user_id) where ended_at is null;
create index if not exists phone_links_user_at on private.phone_links (user_id, at);

-- "Make a new TapTurf account with Google", asked by a Google account that
-- was taken off a phone account and still has its own row from before (the
-- empty one the link was made over): from then on it opens that row again.
-- Rows are never removed; the newest one after the link ended counts.
create table if not exists private.google_own_row_asked (
  id bigint generated always as identity primary key,
  auth_uid uuid not null,
  at timestamptz not null default now()
);
revoke all on private.google_own_row_asked from public, anon, authenticated;
create index if not exists google_own_row_asked_auth on private.google_own_row_asked (auth_uid, at);

-- ── Shared rules ───────────────────────────────────────────

-- This account's number was proved with an OTP from the profile, and nothing changed it since.
create or replace function private.phone_link_ok(p_user_id uuid, p_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and p_phone is not null and exists (
    select 1 from private.phone_links pl
     where pl.user_id = p_user_id and pl.ended_at is null and pl.phone_hash = md5(p_phone)
       and pl.change_id is not distinct from (
             select max(c.id) from private.users_phone_changes c where c.user_id = p_user_id));
$$;
revoke all on function private.phone_link_ok(uuid, text) from public, anon, authenticated;

-- The account a verified phone sign-in opens, or null: account_resolve's
-- phone rules (20261021_accounts_fixes.sql), read only, plus phone_link_ok.
create or replace function private.phone_account(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when private.phone_link_ok(x.id, p_phone) then x.id
           when not exists (select 1 from private.users_phone_changes c where c.user_id = x.id)
                and (not exists (select 1 from auth.users a where a.id = x.id)
                     or exists (select 1 from public.user_logins l
                                 where l.user_id = x.id and l.method = 'phone'
                                   and l.created_at < private.phone_logins_trusted_before()))
             then x.id
         end
    from (select u.id from public.users u
           where coalesce(p_phone, '') ~ '^\+91[0-9]{10}$' and u.phone = p_phone
           order by u.created_at limit 1) x;
$$;
revoke all on function private.phone_account(text) from public, anon, authenticated;

-- This number left an account in the last 90 days (changed or removed): a
-- new sign-up with it is told so before it makes a second account.
create or replace function private.phone_was_used(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_phone, '') ~ '^\+91[0-9]{10}$'
     and not exists (select 1 from public.users u where u.phone = p_phone)
     and exists (select 1 from private.users_phone_changes c
                  where c.old_hash = md5(p_phone) and c.at > now() - interval '90 days');
$$;
revoke all on function private.phone_was_used(text) from public, anon, authenticated;

-- The address Google confirmed for this Google sign-in, lowercase, or null.
create or replace function private.google_verified_email(p_auth_uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(i.identity_data ->> 'email')
    from auth.identities i
   where i.user_id = p_auth_uid and i.provider = 'google'
     and i.identity_data ->> 'email_verified' = 'true'
     and coalesce(i.identity_data ->> 'email', '') <> ''
   order by i.created_at desc nulls last
   limit 1;
$$;
revoke all on function private.google_verified_email(uuid) from public, anon, authenticated;

-- The old-app row a Google sign-in lands on (account_resolve's legacy rule), or null.
create or replace function private.google_legacy_row(p_auth_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
    from auth.users a
    join public.users u on lower(u.email) = lower(a.email)
    join private.legacy_email_rows g on g.user_id = u.id
   where a.id = p_auth_uid and a.email is not null
     and not exists (select 1 from auth.users a2 where a2.id = u.id)
   order by u.created_at
   limit 1;
$$;
revoke all on function private.google_legacy_row(uuid) from public, anon, authenticated;

-- The phone account this Google sign-in was added to, or null.
create or replace function private.google_open_link(p_auth_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.user_id from private.account_google_links l where l.auth_uid = p_auth_uid and l.ended_at is null;
$$;
revoke all on function private.google_open_link(uuid) from public, anon, authenticated;

-- The Google account's own row, or null. Null also when a link was made
-- while that row was there (over it: it was empty, google_link_problem) and
-- has ended since (a swap or a removal), unless the person asked for the
-- row back afterwards (account_google_fresh). Such a Google account gets
-- r = 'replaced' and the choice, never that row in silence. A row made
-- after the link ended (account_google_fresh) is its own as usual.
create or replace function private.google_own_row(p_auth_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from public.users u
   where u.id = p_auth_uid
     and not exists (
       select 1 from private.account_google_links l
        where l.auth_uid = u.id and l.ended_at is not null and u.created_at <= l.ended_at
          and not exists (select 1 from private.google_own_row_asked c where c.auth_uid = u.id and c.at >= l.ended_at));
$$;
revoke all on function private.google_own_row(uuid) from public, anon, authenticated;

-- The account a Google sign-in opens, or null. The link comes first: a
-- Google account with a link has no used row of its own (google_link_problem
-- refuses one that has), so its own row (an empty one the link was made
-- over, or one forged since) can't take the link's place. With a row of its
-- own it never lands on an old-app row, also while that row is set aside
-- (google_own_row).
create or replace function private.google_account(p_auth_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.google_open_link(p_auth_uid),
    case when exists (select 1 from public.users u where u.id = p_auth_uid)
         then private.google_own_row(p_auth_uid)
         else private.google_legacy_row(p_auth_uid) end);
$$;
revoke all on function private.google_account(uuid) from public, anon, authenticated;

-- The row in the way of adding this Google account to a phone account (its
-- own row, or the old-app row it lands on), for has_account and its brief.
-- What a Google sign-in opens is google_account.
create or replace function private.google_own_account(p_auth_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.id from public.users u where u.id = p_auth_uid), private.google_legacy_row(p_auth_uid));
$$;
revoke all on function private.google_own_account(uuid) from public, anon, authenticated;

-- May this account add, change or remove a Google account? Only a phone
-- account (no Google sign-in of its own) whose email is empty or the one an
-- earlier link put there: an old-app address is never replaced.
create or replace function private.google_linkable(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
     where u.id = p_user_id
       and not exists (select 1 from auth.users a where a.id = u.id)
       and (u.email is null or exists (
             select 1 from private.account_google_links l
              where l.user_id = u.id and l.ended_at is null and l.email = lower(u.email))));
$$;
revoke all on function private.google_linkable(uuid) from public, anon, authenticated;

-- Never used: the one definition of an empty account. No game hosted, no
-- join request, no game joined, no review, no review vote, no username
-- (now or before), no turf claim (any status) or turf it owns, no turf
-- suggestion, no live match that tags it, no booking. A link is made over
-- a Google account's own row only while this holds (google_link_problem);
-- refusals, the phone_held report and admin show it too.
create or replace function private.account_is_empty(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
     and not exists (select 1 from public.games x where x.creator_id = p_user_id)
     and not exists (select 1 from public.game_requests x where x.user_id = p_user_id)
     and not exists (select 1 from public.game_participants x where x.user_id = p_user_id)
     and not exists (select 1 from public.reviews x where x.user_id = p_user_id)
     and not exists (select 1 from public.review_votes x where x.user_id = p_user_id)
     and not exists (select 1 from public.usernames x where x.user_id = p_user_id)
     and not exists (select 1 from public.username_history x where x.user_id = p_user_id)
     -- Claims made for the account, and any made under its sign-in keys before claims named the account.
     and not exists (select 1 from public.turf_owners x
                      where x.user_id = p_user_id
                         or (x.user_id is null and x.user_key in (
                               select 'e:' || lower(a.email::text) from auth.users a where a.id = p_user_id and a.email is not null
                               union all
                               select 'p:' || public._phone10(u.phone::text) from public.users u where u.id = p_user_id and u.phone is not null)))
     and not exists (select 1 from public.turfs x where x.owner_id = p_user_id)
     and not exists (select 1 from public.turf_suggestions x where x.user_id = p_user_id)
     and not exists (select 1 from public.bookings x where x.user_id = p_user_id)
     -- A live match names people only by username tag ({"u": name} under "tag", or under
     -- "tags" by side), so the two username lines above already cover it; it is checked
     -- here too so the rule says what it means if live matches ever name people otherwise.
     and not exists (select 1
                       from (select n.username from public.usernames n where n.user_id = p_user_id
                             union all
                             select h.username from public.username_history h where h.user_id = p_user_id) nm
                      where exists (select 1 from public.live_matches m
                                     where m.match is not null
                                       and jsonb_path_exists(m.match, '$.** ? (@.tag.u == $n || @.tags.*.u == $n)',
                                                             jsonb_build_object('n', nm.username))));
$$;
revoke all on function private.account_is_empty(uuid) from public, anon, authenticated;

-- What a refusal (or a link made over a Google account's own empty row) may
-- say about the other account to the person who just proved its Google
-- login or SIM: whether it is empty, and when it was made.
create or replace function private.account_brief(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when u.id is null then '{}'::jsonb
              else jsonb_build_object('other_empty', private.account_is_empty(u.id),
                                      'other_made_on', to_char(u.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD')) end
    from (select 1) one
    left join public.users u on u.id = p_user_id;
$$;
revoke all on function private.account_brief(uuid) from public, anon, authenticated;

-- Why this Google sign-in can't be added to this account, or null.
create or replace function private.google_link_problem(p_auth_uid uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from auth.users a
                      where a.id = p_auth_uid
                        and (a.raw_app_meta_data ->> 'provider' = 'google'
                             or coalesce(a.raw_app_meta_data -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb)) then 'bad'
    when exists (select 1 from private.account_google_links l
                  where l.auth_uid = p_auth_uid and l.ended_at is null and l.user_id <> p_user_id) then 'other_account'
    -- Already on this account: nothing to refuse.
    when exists (select 1 from private.account_google_links l
                  where l.auth_uid = p_auth_uid and l.ended_at is null and l.user_id = p_user_id) then null
    -- It has a TapTurf account of its own that was used: never joined to this one.
    -- Its own row never used is not in the way (the owner's decision): the link is
    -- made over it, and the row stays as it is.
    when exists (select 1 from public.users u where u.id = p_auth_uid)
         and not private.account_is_empty(p_auth_uid) then 'has_account'
    -- It lands on an old-app row (the legacy rule): refused, used or not.
    when not exists (select 1 from public.users u where u.id = p_auth_uid)
         and private.google_legacy_row(p_auth_uid) is not null then 'has_account'
    when private.google_verified_email(p_auth_uid) is null then 'unverified'
  end;
$$;
revoke all on function private.google_link_problem(uuid, uuid) from public, anon, authenticated;

-- A new Google account's row (account_resolve with create, account_google_fresh).
-- Without the email when another row holds it in any case. Null on a clash.
create or replace function private.google_make_account(p_uid uuid, p_email text, p_name text, p_avatar text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := p_email;
begin
  if v_email is not null and exists (select 1 from public.users u where lower(u.email) = lower(v_email)) then
    perform private.report('google_email_held', jsonb_build_object('auth_uid', p_uid));
    v_email := null;
  end if;
  insert into public.users (id, email, name, profile_image_url, role, password)
  values (p_uid, v_email,
          coalesce(private.clean_name(p_name), nullif(split_part(coalesce(p_email, ''), '@', 1), ''), 'User'),
          p_avatar, 'user', 'oauth-no-password')
  on conflict do nothing;
  return (select u.id from public.users u where u.id = p_uid);
end;
$$;
revoke all on function private.google_make_account(uuid, text, text, text) from public, anon, authenticated;

-- ── The profile ────────────────────────────────────────────
-- Same signature and return type (20261025_contact_email.sql), four more keys.
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
           -- An email typed into an earlier TapTurf, unless it is the account's own address now.
           'contact_email', case when ce.email is distinct from lower(u.email) then ce.email end,
           -- The typed ask and field are gone: false, so pages from before never open them.
           'ask_email', false,
           'email_editable', false,
           -- A phone account with no email, no Google account and no answer yet: asked once to add Google.
           'ask_google', u.email is null and ce.user_id is null and gl.id is null and a.id is null
                         and not exists (select 1 from private.account_link_intents i where i.user_id = u.id),
           -- The Google account added from the profile, if any.
           'google_email', gl.email,
           -- May add, change or remove a Google account (from a phone sign-in).
           'google_linkable', a.id is null and (u.email is null or coalesce(lower(u.email) = gl.email, false)),
           -- The number on the account opens it with an OTP.
           'phone_confirmed', u.phone is not null and private.phone_account(u.phone) is not distinct from u.id,
           -- Google is this account's own way in (not one added to a phone account): it may add, change or remove the number.
           'phone_settable', a.id is not null or lg.user_id is not null)
    from public.users u
    left join auth.users a on a.id = u.id
    left join private.legacy_email_rows lg on lg.user_id = u.id
    left join public.usernames n on n.user_id = u.id
    left join private.user_contact_emails ce on ce.user_id = u.id
    left join private.account_google_links gl on gl.user_id = u.id and gl.ended_at is null
   where u.id = p_user_id;
$$;
revoke all on function private.profile_json(uuid) from public, anon, authenticated;

-- ── account_resolve ────────────────────────────────────────
-- The live body (20261021_accounts_fixes.sql) with the changes marked (n).
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
      -- (1) A number the account proved with an OTP from the profile
      -- (account_set_phone), not changed since, opens it. Otherwise:
      if not private.phone_link_ok(v_id, p_phone) then
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
      end if;
    elsif p_create then
      v_name := private.clean_name(p_name);
      if v_name is null then
        -- (2) was_used: this number left an account lately; the sign-up says so first.
        return jsonb_build_object('r', 'name', 'was_used', private.phone_was_used(p_phone));
      end if;
      insert into public.users (id, name, phone, role, password)
      values (gen_random_uuid(), v_name, p_phone, 'user', 'phone-auth-no-password')
      on conflict (phone) where phone is not null do nothing;
      select u.id into v_id from public.users u where u.phone = p_phone order by u.created_at limit 1;
      v_created := true;
    else
      perform private.report('phone_no_row', jsonb_build_object('phone_tail', right(p_phone, 2)));
      return jsonb_build_object('r', 'new', 'was_used', private.phone_was_used(p_phone));
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
    -- (3) The phone account this Google account was added to comes first,
    -- also over the Google account's own row (an empty one the link was made over).
    v_id := private.google_open_link(p_uid);
    if v_id is null then
      -- (8) Its own row, unless a link was made over it and ended since
      -- (google_own_row): then 'replaced' below, never that row in silence.
      v_id := private.google_own_row(p_uid);
    end if;
    if v_id is null and p_email is not null and not exists (select 1 from public.users u where u.id = p_uid) then
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
      -- (4) Taken off a phone account: never a new empty account unasked, nor
      -- the own row the link was made over (account_google_fresh asks).
      if exists (select 1 from private.account_google_links l where l.auth_uid = p_uid) then
        return jsonb_build_object('r', 'replaced');
      end if;
      if not p_create then
        return jsonb_build_object('r', 'new');
      end if;
      -- (5) account_link_attach and account_link_google hold this lock until
      -- they commit: a link finishing right now is seen, not raced.
      perform pg_advisory_xact_lock(hashtext('account_link_google'));
      v_id := coalesce(private.google_open_link(p_uid), private.google_own_row(p_uid));
      if v_id is null then
        if exists (select 1 from private.account_google_links l where l.auth_uid = p_uid) then
          return jsonb_build_object('r', 'replaced');
        end if;
        -- (6) Being added to a phone account right now: never a second account.
        if exists (select 1 from private.account_link_intents i
                    where i.auth_uid = p_uid and i.closed_at is null and i.expires_at > now()) then
          perform private.report('linking_blocked_create', jsonb_build_object('auth_uid', p_uid));
          return jsonb_build_object('r', 'linking');
        end if;
        -- Another account already holds this email (emails are unique): the
        -- Google account is made without it, never joined to that one.
        v_id := private.google_make_account(p_uid, p_email, p_name, p_avatar);
        if v_id is null then
          perform private.report('google_insert_conflict', jsonb_build_object('auth_uid', p_uid));
          return jsonb_build_object('r', 'conflict');
        end if;
        v_created := true;
      end if;
    end if;
    -- (7) Only the sign-in callback passes p_log for Google, once per real
    -- sign-in; it is logged on the account it opens, whichever that is.
    if p_log and not exists (
      select 1 from public.user_logins l where l.user_id = v_id and l.created_at > now() - interval '10 minutes'
    ) then
      insert into public.user_logins (user_id, method) values (v_id, 'google');
    end if;

  else
    return jsonb_build_object('r', 'bad');
  end if;

  return private.profile_json(v_id) || jsonb_build_object('r', 'ok', 'created', v_created);
end;
$$;
revoke all on function public.account_resolve(text, text, text, uuid, text, text, text, boolean, boolean) from public;
grant execute on function public.account_resolve(text, text, text, uuid, text, text, text, boolean, boolean) to anon, authenticated;

-- A Google account taken off a phone account asks for an account of its
-- own ("Make a new TapTurf account"). When it still has its own row from
-- before (the empty one the link was made over), that row is what it gets,
-- as it is, and opens from now on (google_own_row_asked); otherwise a new
-- one is made. Any other Google sign-in gets what account_resolve would
-- give it.
-- r: ok (with the profile, created), linking, conflict, bad, unavailable.
create or replace function public.account_google_fresh(p_key text, p_uid uuid, p_email text default null, p_name text default null, p_avatar text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_uid is null or not exists (
       select 1 from auth.users a
        where a.id = p_uid
          and (a.raw_app_meta_data ->> 'provider' = 'google'
               or coalesce(a.raw_app_meta_data -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb)) then
    return jsonb_build_object('r', 'bad');
  end if;
  perform pg_advisory_xact_lock(hashtext('account_link_google'));
  v_id := private.google_account(p_uid);
  if v_id is not null then
    return private.profile_json(v_id) || jsonb_build_object('r', 'ok', 'created', false);
  end if;
  if exists (select 1 from private.account_link_intents i
              where i.auth_uid = p_uid and i.closed_at is null and i.expires_at > now()) then
    return jsonb_build_object('r', 'linking');
  end if;
  -- Its own row from before, set aside since the link ended: that one, untouched, never a second.
  if exists (select 1 from public.users u where u.id = p_uid) then
    insert into private.google_own_row_asked (auth_uid) values (p_uid);
    perform private.report('google_fresh_after_link', jsonb_build_object('auth_uid', p_uid, 'own_row', true));
    return private.profile_json(p_uid) || jsonb_build_object('r', 'ok', 'created', false);
  end if;
  v_id := private.google_make_account(p_uid, p_email, p_name, p_avatar);
  if v_id is null then
    perform private.report('google_insert_conflict', jsonb_build_object('auth_uid', p_uid));
    return jsonb_build_object('r', 'conflict');
  end if;
  perform private.report('google_fresh_after_link', jsonb_build_object('auth_uid', p_uid));
  return private.profile_json(v_id) || jsonb_build_object('r', 'ok', 'created', true);
end;
$$;
revoke all on function public.account_google_fresh(text, uuid, text, text, text) from public;
grant execute on function public.account_google_fresh(text, uuid, text, text, text) to anon, authenticated;

-- ── The auth.users mirror makes no account any more ───────
-- Same trigger (on_auth_user_created_sync_public_users), same function.
-- A Google sign-up gets its account from account_resolve with create: the
-- sign-in callback runs it right after the code exchange, before the
-- session reaches the browser, and POST /api/account/me runs it on app
-- loads. Only account_resolve knows about links and open intents. A Google
-- sign-in that never reaches the app has no account: admin_google_unfinished
-- lists those.
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  return new;
end;
$$;
-- As on production: nobody calls it but the trigger.
revoke all on function public.handle_auth_user_created() from public, anon, authenticated;

-- ── myTapturf: which account a sign-in is ─────────────────
-- 20261025_claims_account.sql, plus links both ways (links first).
create or replace function private.account_for_key(p_key text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case left(coalesce(p_key, ''), 2)
    -- What the Google account with this address opens (google_account): the phone account it was
    -- added to first, then its own row (none while set aside after a link made over it ended),
    -- then the old-app row it lands on. The one with a link first, then one with a row.
    when 'e:' then (
      select case when g.id is not null then private.google_account(g.id)
                  else (select u.id from public.users u join private.legacy_email_rows lg on lg.user_id = u.id
                         where lower(u.email) = substr(p_key, 3)
                           and not exists (select 1 from auth.users a where a.id = u.id)
                         order by u.created_at limit 1) end
        from (select 1) one
        left join lateral (
          select a.id from auth.users a
           where lower(a.email) = substr(p_key, 3)
             and a.raw_app_meta_data -> 'providers' @> '["google"]'::jsonb
           order by (private.google_open_link(a.id) is not null) desc,
                    exists (select 1 from public.users u where u.id = a.id) desc,
                    a.created_at
           limit 1) g on true)
    when 'p:' then private.phone_account('+91' || substr(p_key, 3))
  end;
$$;
revoke all on function private.account_for_key(text) from public, anon, authenticated;

create or replace function private.caller_account(p_key text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- A Google session: what its own sign-in opens (the link, else its own row unless set aside),
  -- by auth.uid() first; only a session with neither is looked up by its key.
  select case when left(coalesce(p_key, ''), 2) = 'e:'
                   and (private.google_open_link(auth.uid()) is not null
                        or exists (select 1 from public.users u where u.id = auth.uid()))
              then private.google_account(auth.uid())
              else private.account_for_key(p_key) end;
$$;
revoke all on function private.caller_account(text) from public, anon, authenticated;

-- ── Typed emails: saved ones can still be removed ─────────
-- 20261025_contact_email.sql with one change: 'save' still needs an empty
-- users.email, but 'skip' and 'remove' only need an account with no Google
-- sign-in of its own, so a typed email can be removed after Google is
-- added. (The route no longer sends 'save'.)
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
  if not exists (select 1 from public.users u where u.id = p_user_id and (u.email is null or p_action <> 'save'))
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

-- ── Add Google to a phone account ─────────────────────────

-- Step 1, from a phone sign-in the server checked, made in the last 5
-- minutes (p_auth_time; p_proof_key = sha256 hex of "<sub>:<auth_time>").
-- One open intent per account; a new one replaces the old. The same proof
-- again (a lost reply) starts a new leg on the intent it made.
-- r: ok (expires_at), new, conflict, not_allowed, stale, used, limit (until), bad, unavailable.
create or replace function public.account_link_start(p_key text, p_phone text, p_fb_sub text, p_auth_time timestamptz, p_proof_key text, p_secret_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_until timestamptz := now() + interval '10 minutes';
  v_open private.account_link_intents%rowtype;
  v_first timestamptz;
  v_intent bigint;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_phone is null or p_phone !~ '^\+91[0-9]{10}$' or coalesce(p_fb_sub, '') = '' or p_auth_time is null
     or p_proof_key is null or p_proof_key !~ '^[0-9a-f]{64}$'
     or p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('r', 'bad');
  end if;
  v_user := private.phone_account(p_phone);
  if v_user is null then
    return jsonb_build_object('r', case when exists (select 1 from public.users u where u.phone = p_phone) then 'conflict' else 'new' end);
  end if;
  if not private.google_linkable(v_user) then
    return jsonb_build_object('r', 'not_allowed');
  end if;
  if p_auth_time < now() - interval '5 minutes' or p_auth_time > now() + interval '1 minute' then
    return jsonb_build_object('r', 'stale');
  end if;
  perform pg_advisory_xact_lock(hashtext('account_link_start'), hashtext(v_user::text));
  -- The same proof again: its intent, if still open, gets a new leg.
  if exists (select 1 from private.otp_proofs p where p.proof_key = p_proof_key) then
    select * into v_open from private.account_link_intents i
     where i.proof_key = p_proof_key and i.user_id = v_user and i.closed_at is null and i.expires_at > now()
     order by i.id desc limit 1;
    if v_open.id is null then
      return jsonb_build_object('r', 'used');
    end if;
    update private.account_link_intents set auth_uid = null, returned_at = null where id = v_open.id;
    insert into private.account_link_legs (intent_id, secret_hash) values (v_open.id, p_secret_hash);
    return jsonb_build_object('r', 'ok', 'expires_at', v_open.expires_at);
  end if;
  select min(i.created_at) into v_first from private.account_link_intents i
   where i.user_id = v_user and i.created_at > now() - interval '1 hour';
  if (select count(*) from private.account_link_intents i where i.user_id = v_user and i.created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('r', 'limit', 'until', v_first + interval '1 hour');
  end if;
  select min(i.created_at) into v_first from private.account_link_intents i
   where i.user_id = v_user and i.created_at > now() - interval '1 day';
  if (select count(*) from private.account_link_intents i where i.user_id = v_user and i.created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('r', 'limit', 'until', v_first + interval '1 day');
  end if;
  insert into private.otp_proofs (proof_key, purpose, user_id) values (p_proof_key, 'link_google', v_user);
  update private.account_link_intents set closed_at = now(), outcome = 'replaced'
   where user_id = v_user and closed_at is null;
  insert into private.account_link_intents (user_id, kind, fb_sub_hash, phone_hash, auth_time, proof_key, expires_at)
  values (v_user, 'google', md5(p_fb_sub), md5(p_phone), p_auth_time, p_proof_key, v_until)
  returning id into v_intent;
  insert into private.account_link_legs (intent_id, secret_hash) values (v_intent, p_secret_hash);
  return jsonb_build_object('r', 'ok', 'expires_at', v_until);
exception when unique_violation then
  return jsonb_build_object('r', 'bad');
end;
$$;
revoke all on function public.account_link_start(text, text, text, timestamptz, text, text) from public;
grant execute on function public.account_link_start(text, text, text, timestamptz, text, text) to anon, authenticated;

-- Another Google round trip on the same intent ("Try a different Google
-- account"): the same phone sign-in (p_fb_sub) and the newest leg's cookie.
-- Releases any Google account attached but not confirmed. At most 5 legs.
-- r: ok (expires_at), expired, mismatch, limit, bad, unavailable.
create or replace function public.account_link_leg(p_key text, p_secret_hash text, p_fb_sub text, p_new_secret_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leg private.account_link_legs%rowtype;
  v_i private.account_link_intents%rowtype;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' or coalesce(p_fb_sub, '') = ''
     or p_new_secret_hash is null or p_new_secret_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('r', 'bad');
  end if;
  perform pg_advisory_xact_lock(hashtext('account_link_google'));
  select * into v_leg from private.account_link_legs l where l.secret_hash = p_secret_hash;
  if not found then
    return jsonb_build_object('r', 'expired');
  end if;
  select * into v_i from private.account_link_intents i where i.id = v_leg.intent_id for update;
  if v_i.closed_at is not null
     or v_leg.id <> (select max(l.id) from private.account_link_legs l where l.intent_id = v_i.id) then
    return jsonb_build_object('r', 'expired');
  end if;
  if v_i.expires_at <= now() then
    update private.account_link_intents set closed_at = now(), outcome = 'expired' where id = v_i.id;
    return jsonb_build_object('r', 'expired');
  end if;
  if v_i.fb_sub_hash <> md5(p_fb_sub) then
    return jsonb_build_object('r', 'mismatch');
  end if;
  if (select count(*) from private.account_link_legs l where l.intent_id = v_i.id) >= 5 then
    return jsonb_build_object('r', 'limit', 'until', v_i.expires_at);
  end if;
  update private.account_link_intents set auth_uid = null, returned_at = null where id = v_i.id;
  insert into private.account_link_legs (intent_id, secret_hash) values (v_i.id, p_new_secret_hash);
  return jsonb_build_object('r', 'ok', 'expires_at', v_i.expires_at);
exception when unique_violation then
  return jsonb_build_object('r', 'bad');
end;
$$;
revoke all on function public.account_link_leg(text, text, text, text) from public;
grant execute on function public.account_link_leg(text, text, text, text) to anon, authenticated;

-- Step 2, from /api/account/link/google/callback right after Google's code
-- was exchanged with this leg's verifier (from the browser's httpOnly
-- cookie): which Google account came back. Only the newest leg of an open
-- intent, once. A refusal keeps the intent open for another leg.
-- r: ok (other_empty, other_made_on when the Google account has an own row
-- that was never used: the link would be made over it), has_account
-- (other_empty, other_made_on), other_account, unverified, bad, used,
-- expired, unavailable.
create or replace function public.account_link_attach(p_key text, p_secret_hash text, p_auth_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leg private.account_link_legs%rowtype;
  v_i private.account_link_intents%rowtype;
  v_problem text;
  v_brief jsonb := '{}'::jsonb;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' or p_auth_uid is null then
    return jsonb_build_object('r', 'bad');
  end if;
  -- The same lock as account_resolve's create: no row for this Google
  -- account can appear between this check and the confirmation.
  perform pg_advisory_xact_lock(hashtext('account_link_google'));
  select * into v_leg from private.account_link_legs l where l.secret_hash = p_secret_hash for update;
  if not found then
    return jsonb_build_object('r', 'expired');
  end if;
  if v_leg.returned_at is not null then
    return jsonb_build_object('r', 'used');
  end if;
  select * into v_i from private.account_link_intents i where i.id = v_leg.intent_id for update;
  if v_i.closed_at is not null
     or v_leg.id <> (select max(l.id) from private.account_link_legs l where l.intent_id = v_i.id) then
    return jsonb_build_object('r', 'expired');
  end if;
  if v_i.expires_at <= now() then
    update private.account_link_intents set closed_at = now(), outcome = 'expired' where id = v_i.id;
    return jsonb_build_object('r', 'expired');
  end if;
  v_problem := private.google_link_problem(p_auth_uid, v_i.user_id);
  update private.account_link_legs set auth_uid = p_auth_uid, returned_at = now(), outcome = coalesce(v_problem, 'ok')
   where id = v_leg.id;
  if v_problem is not null then
    if v_problem = 'has_account' then
      v_brief := private.account_brief(private.google_own_account(p_auth_uid));
    end if;
    -- The other account, so admin can open both: the Google account's own (has_account), or
    -- the phone account it is already on (other_account).
    perform private.report('link_' || v_problem,
      jsonb_build_object('user_id', v_i.user_id, 'auth_uid', p_auth_uid,
                         'other_user_id', case v_problem when 'has_account' then private.google_own_account(p_auth_uid)
                                                         when 'other_account' then private.google_open_link(p_auth_uid) end) || v_brief);
    if (select count(*) from private.account_link_legs l where l.intent_id = v_i.id and l.outcome <> 'ok') >= 5 then
      update private.account_link_intents set closed_at = now(), outcome = 'gave_up' where id = v_i.id;
    end if;
    return jsonb_build_object('r', v_problem) || v_brief;
  end if;
  update private.account_link_intents set auth_uid = p_auth_uid, returned_at = now() where id = v_i.id;
  -- With its own row, never used, that the link would be made over: what it is
  -- (account_brief is empty when the Google account has no row).
  return jsonb_build_object('r', 'ok') || private.account_brief(p_auth_uid);
end;
$$;
revoke all on function public.account_link_attach(text, text, uuid) from public;
grant execute on function public.account_link_attach(text, text, uuid) to anon, authenticated;

-- What /account/link shows, for the same phone sign-in only.
-- state: none, waiting, attached (google_email; other_empty, other_made_on
-- when the link would be made over the Google account's own empty row),
-- refused (problem, other_empty, other_made_on), closed (outcome;
-- google_email when linked).
create or replace function public.account_link_status(p_key text, p_secret_hash text, p_fb_sub text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leg private.account_link_legs%rowtype;
  v_i private.account_link_intents%rowtype;
  v_left int;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' or coalesce(p_fb_sub, '') = '' then
    return jsonb_build_object('r', 'ok', 'state', 'none');
  end if;
  select * into v_leg from private.account_link_legs l where l.secret_hash = p_secret_hash;
  if not found then
    return jsonb_build_object('r', 'ok', 'state', 'none');
  end if;
  select * into v_i from private.account_link_intents i where i.id = v_leg.intent_id;
  if v_i.fb_sub_hash <> md5(p_fb_sub) then
    return jsonb_build_object('r', 'ok', 'state', 'none');
  end if;
  if v_i.closed_at is not null then
    return jsonb_build_object('r', 'ok', 'state', 'closed', 'outcome', v_i.outcome,
             'google_email', case when v_i.outcome = 'linked' then
               (select l.email from private.account_google_links l where l.intent_id = v_i.id) end);
  end if;
  if v_i.expires_at <= now() then
    return jsonb_build_object('r', 'ok', 'state', 'closed', 'outcome', 'expired');
  end if;
  v_left := 5 - (select count(*)::int from private.account_link_legs l where l.intent_id = v_i.id);
  if v_i.auth_uid is not null and v_leg.auth_uid = v_i.auth_uid then
    return jsonb_build_object('r', 'ok', 'state', 'attached', 'google_email', private.google_verified_email(v_i.auth_uid),
                              'expires_at', v_i.expires_at, 'legs_left', v_left)
           || private.account_brief(v_i.auth_uid);
  end if;
  if v_leg.outcome is not null and v_leg.outcome <> 'ok' then
    return jsonb_build_object('r', 'ok', 'state', 'refused', 'problem', v_leg.outcome,
                              'expires_at', v_i.expires_at, 'legs_left', v_left)
           || case when v_leg.outcome = 'has_account' then private.account_brief(private.google_own_account(v_leg.auth_uid)) else '{}'::jsonb end;
  end if;
  return jsonb_build_object('r', 'ok', 'state', 'waiting', 'expires_at', v_i.expires_at, 'legs_left', v_left);
end;
$$;
revoke all on function public.account_link_status(text, text, text) from public;
grant execute on function public.account_link_status(text, text, text) to anon, authenticated;

-- Step 3, after the person confirmed the Google account on /account/link,
-- from the same phone sign-in (the server checked its token): the link,
-- and the Google address on the account.
-- r: ok (with the profile), expired, mismatch, not_allowed, has_account
-- (other_empty, other_made_on), other_account, unverified, bad, unavailable.
-- A Google account whose own row was never used is linked over that row
-- (reported link_over_empty); the row itself is never touched.
create or replace function public.account_link_google(p_key text, p_secret_hash text, p_phone text, p_fb_sub text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leg private.account_link_legs%rowtype;
  v_i private.account_link_intents%rowtype;
  v_user uuid;
  v_problem text;
  v_email text;
  v_old private.account_google_links%rowtype;
  v_cur text;
  v_other uuid;
  v_brief jsonb := '{}'::jsonb;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$'
     or p_phone is null or p_phone !~ '^\+91[0-9]{10}$' or coalesce(p_fb_sub, '') = '' then
    return jsonb_build_object('r', 'bad');
  end if;
  -- One link at a time, and never alongside account_resolve's create.
  perform pg_advisory_xact_lock(hashtext('account_link_google'));
  select * into v_leg from private.account_link_legs l where l.secret_hash = p_secret_hash;
  if not found then
    return jsonb_build_object('r', 'expired');
  end if;
  select * into v_i from private.account_link_intents i where i.id = v_leg.intent_id for update;
  if v_i.closed_at is not null then
    -- The same completion again (its reply was lost): the same answer.
    if v_i.outcome = 'linked' and v_i.phone_hash = md5(p_phone) and v_i.fb_sub_hash = md5(p_fb_sub)
       and exists (select 1 from private.account_google_links l
                    where l.user_id = v_i.user_id and l.auth_uid = v_i.auth_uid and l.ended_at is null) then
      return private.profile_json(v_i.user_id) || jsonb_build_object('r', 'ok');
    end if;
    return jsonb_build_object('r', 'expired');
  end if;
  if v_i.expires_at <= now() then
    update private.account_link_intents set closed_at = now(), outcome = 'expired' where id = v_i.id;
    return jsonb_build_object('r', 'expired');
  end if;
  -- Only a Google account attached on this very leg can be confirmed.
  if v_i.auth_uid is null or v_leg.auth_uid is distinct from v_i.auth_uid then
    return jsonb_build_object('r', 'expired');
  end if;
  -- The phone sign-in that asked, still: the same Firebase user, the same number, the same account.
  v_user := private.phone_account(p_phone);
  if v_i.fb_sub_hash <> md5(p_fb_sub) or v_i.phone_hash <> md5(p_phone) or v_user is distinct from v_i.user_id then
    update private.account_link_intents set closed_at = now(), outcome = 'mismatch' where id = v_i.id;
    perform private.report('link_mismatch', jsonb_build_object('user_id', v_i.user_id, 'auth_uid', v_i.auth_uid));
    return jsonb_build_object('r', 'mismatch');
  end if;
  if not private.google_linkable(v_user) then
    update private.account_link_intents set closed_at = now(), outcome = 'not_allowed' where id = v_i.id;
    return jsonb_build_object('r', 'not_allowed');
  end if;
  -- Again, under the lock: its own row may have been used since it came back.
  v_problem := private.google_link_problem(v_i.auth_uid, v_user);
  if v_problem is not null then
    update private.account_link_intents set closed_at = now(), outcome = v_problem where id = v_i.id;
    if v_problem = 'has_account' then
      v_other := private.google_own_account(v_i.auth_uid);
      v_brief := private.account_brief(v_other);
    elsif v_problem = 'other_account' then
      v_other := private.google_open_link(v_i.auth_uid);
    end if;
    perform private.report('link_' || v_problem,
      jsonb_build_object('user_id', v_user, 'auth_uid', v_i.auth_uid, 'other_user_id', v_other) || v_brief);
    return jsonb_build_object('r', v_problem) || v_brief;
  end if;
  v_email := private.google_verified_email(v_i.auth_uid);
  select * into v_old from private.account_google_links l where l.user_id = v_user and l.ended_at is null;
  if v_old.id is not null and v_old.auth_uid = v_i.auth_uid then
    -- Already this Google account: nothing to change.
    update private.account_link_intents set closed_at = now(), outcome = 'linked' where id = v_i.id;
    return private.profile_json(v_user) || jsonb_build_object('r', 'ok');
  end if;
  if v_old.id is not null then
    update private.account_google_links set ended_at = now(), ended_reason = 'changed' where id = v_old.id;
  end if;
  insert into private.account_google_links (auth_uid, user_id, email, intent_id)
  values (v_i.auth_uid, v_user, v_email, v_i.id);
  -- Made over the Google account's own row, never used (google_link_problem
  -- allowed it): that row stays exactly as it is and simply stops being what
  -- this Google account opens. Reported so admin lists it.
  if exists (select 1 from public.users u where u.id = v_i.auth_uid) then
    perform private.report('link_over_empty',
      jsonb_build_object('user_id', v_user, 'auth_uid', v_i.auth_uid, 'other_user_id', v_i.auth_uid, 'intent_id', v_i.id)
      || private.account_brief(v_i.auth_uid));
  end if;
  -- The account's email: the Google one, unless another row holds it
  -- (emails are unique; an empty own row the link was made over usually
  -- does, and keeps it). google_linkable allowed only an empty email or
  -- the one the old link put there; that one never outlives its link.
  select u.email into v_cur from public.users u where u.id = v_user;
  if exists (select 1 from public.users u where lower(u.email) = v_email and u.id <> v_user) then
    perform private.report('link_email_held', jsonb_build_object('user_id', v_user));
    if v_cur is not null then
      update public.users set email = null where id = v_user;
    end if;
  elsif v_cur is distinct from v_email then
    begin
      update public.users set email = v_email where id = v_user;
    exception when unique_violation then
      perform private.report('link_email_held', jsonb_build_object('user_id', v_user));
      if v_cur is not null then
        update public.users set email = null where id = v_user;
      end if;
    end;
  end if;
  update private.account_link_intents set closed_at = now(), outcome = 'linked' where id = v_i.id;
  return private.profile_json(v_user) || jsonb_build_object('r', 'ok');
end;
$$;
revoke all on function public.account_link_google(text, text, text, text) from public;
grant execute on function public.account_link_google(text, text, text, text) to anon, authenticated;

-- Give up on an intent (Cancel, log out). Needs the newest leg's secret, so only its browser can.
create or replace function public.account_link_cancel(p_key text, p_secret_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('r', 'bad');
  end if;
  update private.account_link_intents i set closed_at = now(), outcome = 'cancelled'
    from private.account_link_legs l
   where l.secret_hash = p_secret_hash and i.id = l.intent_id and i.closed_at is null;
  return jsonb_build_object('r', 'ok');
end;
$$;
revoke all on function public.account_link_cancel(text, text) from public;
grant execute on function public.account_link_cancel(text, text) to anon, authenticated;

-- A phone account takes its Google account off, after a fresh OTP. Not
-- counted against any limit: the SIM's owner can always end a link.
-- r: ok (with the profile), new, not_allowed, stale, used, bad, unavailable.
create or replace function public.account_unlink_google(p_key text, p_phone text, p_fb_sub text, p_auth_time timestamptz, p_proof_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_link private.account_google_links%rowtype;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_phone is null or p_phone !~ '^\+91[0-9]{10}$' or coalesce(p_fb_sub, '') = '' or p_auth_time is null
     or p_proof_key is null or p_proof_key !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('r', 'bad');
  end if;
  v_user := private.phone_account(p_phone);
  if v_user is null then
    return jsonb_build_object('r', 'new');
  end if;
  perform pg_advisory_xact_lock(hashtext('account_link_google'));
  select * into v_link from private.account_google_links l where l.user_id = v_user and l.ended_at is null;
  if v_link.id is null then
    -- Nothing on it (or the reply to an earlier removal was lost).
    return private.profile_json(v_user) || jsonb_build_object('r', 'ok');
  end if;
  if not private.google_linkable(v_user) then
    return jsonb_build_object('r', 'not_allowed');
  end if;
  if p_auth_time < now() - interval '5 minutes' or p_auth_time > now() + interval '1 minute' then
    return jsonb_build_object('r', 'stale');
  end if;
  if exists (select 1 from private.otp_proofs p where p.proof_key = p_proof_key) then
    return jsonb_build_object('r', 'used');
  end if;
  insert into private.otp_proofs (proof_key, purpose, user_id) values (p_proof_key, 'unlink_google', v_user);
  update private.account_google_links set ended_at = now(), ended_reason = 'removed' where id = v_link.id;
  update public.users set email = null where id = v_user and lower(email) = v_link.email;
  update private.account_link_intents set closed_at = now(), outcome = 'cancelled' where user_id = v_user and closed_at is null;
  return private.profile_json(v_user) || jsonb_build_object('r', 'ok');
end;
$$;
revoke all on function public.account_unlink_google(text, text, text, timestamptz, text) from public;
grant execute on function public.account_unlink_google(text, text, text, timestamptz, text) to anon, authenticated;

-- ── Add, confirm, change or remove the phone of a Google sign-in ──
-- The server checked a Google session (p_auth_uid) that signed in with
-- Google in the last 10 minutes, and a Firebase phone token for p_phone
-- minted at an OTP sign-in in the last 5 minutes (p_proof_key = sha256 hex
-- of "<sub>:<auth_time>"). Only for an account Google is the own way into:
-- a phone account reached through its link keeps its number.
-- r: ok (with the profile), new, not_allowed, used, taken (holder_opens,
-- holder_empty, holder_made_on), limit (until), bad, unavailable.
create or replace function public.account_set_phone(p_key text, p_auth_uid uuid, p_phone text, p_proof_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_cur text;
  v_holder uuid;
  v_change bigint;
  v_third timestamptz;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_auth_uid is null or p_phone is null or p_phone !~ '^\+91[0-9]{10}$'
     or p_proof_key is null or p_proof_key !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('r', 'bad');
  end if;
  perform pg_advisory_xact_lock(hashtext('account_set_phone'));
  if private.google_open_link(p_auth_uid) is not null then
    return jsonb_build_object('r', 'not_allowed');
  end if;
  -- With no open link: its own row (none while set aside), or the old-app row it lands on.
  v_user := private.google_account(p_auth_uid);
  if v_user is null then
    return jsonb_build_object('r', 'new');
  end if;
  -- The same proof again (its reply was lost): the same answer.
  if exists (select 1 from private.phone_links pl
              where pl.user_id = v_user and pl.ended_at is null and pl.proof_key = p_proof_key and pl.phone_hash = md5(p_phone)) then
    return private.profile_json(v_user) || jsonb_build_object('r', 'ok');
  end if;
  if exists (select 1 from private.otp_proofs p where p.proof_key = p_proof_key) then
    return jsonb_build_object('r', 'used');
  end if;
  -- Another account has this number: refused, never moved.
  select u.id into v_holder from public.users u where u.phone = p_phone and u.id <> v_user order by u.created_at limit 1;
  if v_holder is not null then
    perform private.report('phone_held', jsonb_build_object('user_id', v_user, 'holder', v_holder, 'phone_tail', right(p_phone, 2),
                                                            'holder_empty', private.account_is_empty(v_holder)));
    return jsonb_build_object('r', 'taken', 'holder_opens', private.phone_account(p_phone) is not null,
                              'holder_empty', private.account_is_empty(v_holder),
                              'holder_made_on', (private.account_brief(v_holder) ->> 'other_made_on'));
  end if;
  select u.phone into v_cur from public.users u where u.id = v_user;
  if v_cur is distinct from p_phone then
    select pl.at into v_third from private.phone_links pl
     where pl.user_id = v_user and pl.at > now() - interval '30 days'
     order by pl.at desc offset 2 limit 1;
    if v_third is not null then
      return jsonb_build_object('r', 'limit', 'until', v_third + interval '30 days');
    end if;
    begin
      -- users_phone_change_audit logs this change; phone_links keeps its id.
      update public.users set phone = p_phone where id = v_user;
    exception when unique_violation then
      return jsonb_build_object('r', 'taken', 'holder_opens', private.phone_account(p_phone) is not null);
    end;
  end if;
  insert into private.otp_proofs (proof_key, purpose, user_id) values (p_proof_key, 'set_phone', v_user);
  select max(c.id) into v_change from private.users_phone_changes c where c.user_id = v_user;
  update private.phone_links set ended_at = now(), ended_reason = 'changed' where user_id = v_user and ended_at is null;
  insert into private.phone_links (user_id, phone_hash, change_id, proof_key)
  values (v_user, md5(p_phone), v_change, p_proof_key);
  insert into private.phone_verified as v (user_id, phone_hash, at)
  values (v_user, md5(p_phone), now())
  on conflict (user_id) do update set phone_hash = excluded.phone_hash, at = excluded.at;
  return private.profile_json(v_user) || jsonb_build_object('r', 'ok');
end;
$$;
revoke all on function public.account_set_phone(text, uuid, text, text) from public;
grant execute on function public.account_set_phone(text, uuid, text, text) to anon, authenticated;

-- A Google sign-in (Google in the last 10 minutes, checked by the server)
-- takes the number off its own account. Not counted against the limit.
-- r: ok (with the profile), new, not_allowed, bad, unavailable.
create or replace function public.account_remove_phone(p_key text, p_auth_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_auth_uid is null then
    return jsonb_build_object('r', 'bad');
  end if;
  perform pg_advisory_xact_lock(hashtext('account_set_phone'));
  if private.google_open_link(p_auth_uid) is not null then
    return jsonb_build_object('r', 'not_allowed');
  end if;
  v_user := private.google_account(p_auth_uid);
  if v_user is null then
    return jsonb_build_object('r', 'new');
  end if;
  -- users_phone_change_audit logs it; the number then opens nothing.
  update public.users set phone = null where id = v_user and phone is not null;
  update private.phone_links set ended_at = now(), ended_reason = 'removed' where user_id = v_user and ended_at is null;
  return private.profile_json(v_user) || jsonb_build_object('r', 'ok');
end;
$$;
revoke all on function public.account_remove_phone(text, uuid) from public;
grant execute on function public.account_remove_phone(text, uuid) to anon, authenticated;

-- ── Admin ──────────────────────────────────────────────────

-- 20261025_admin_verified.sql, plus a Google account added from the
-- profile and a number proved with an OTP from the profile.
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
                  -- A Google account added to this account from the profile.
                  exists (select 1 from private.account_google_links l
                           where l.user_id = u.id and l.ended_at is null and l.auth_uid = i.user_id)
                  -- Its own Google identity (made without the address when another row holds it).
                  or (i.user_id = u.id and (u.email is null or lower(i.identity_data ->> 'email') = lower(u.email)))
                  -- An old-app row that account_resolve sends this Google sign-in to.
                  or (u.email is not null
                      and lower(i.identity_data ->> 'email') = lower(u.email)
                      and exists (select 1 from private.legacy_email_rows lg where lg.user_id = u.id)
                      and not exists (select 1 from auth.users a0 where a0.id = u.id)
                      and not exists (select 1 from public.users x where x.id = i.user_id)
                      and not exists (select 1 from private.account_google_links l2 where l2.auth_uid = i.user_id and l2.ended_at is null)))) as by_google
      from public.users u
  )
  select u.id,
         g.by_google,
         (g.by_google and u.email is not null) or (u.email is not null and exists (
           select 1 from auth.users a
            where a.id = u.id and a.email_confirmed_at is not null and lower(a.email) = lower(u.email))),
         u.phone is not null and (
           exists (select 1 from private.phone_verified v where v.user_id = u.id and v.phone_hash = md5(u.phone))
           or private.phone_link_ok(u.id, u.phone)
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

-- Admin: which accounts added a Google account or a number from the profile.
create or replace function public.admin_sign_in_links(p_firebase_token text default null)
returns table (user_id uuid, google_email text, google_linked_at timestamptz, google_links integer, google_removed_at timestamptz,
               phone_added_at timestamptz, phone_opens boolean)
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
  with ids as (
    select l.user_id from private.account_google_links l
    union
    select p.user_id from private.phone_links p
  )
  select ids.user_id,
         gl.email,
         gl.linked_at,
         (select count(*)::int from private.account_google_links l2 where l2.user_id = ids.user_id),
         (select max(l3.ended_at) from private.account_google_links l3 where l3.user_id = ids.user_id and l3.ended_reason = 'removed'),
         pl.at,
         -- The number on the account opens it with an OTP.
         coalesce(private.phone_account(u.phone) = ids.user_id, false)
    from ids
    left join private.account_google_links gl on gl.user_id = ids.user_id and gl.ended_at is null
    left join private.phone_links pl on pl.user_id = ids.user_id and pl.ended_at is null
    left join public.users u on u.id = ids.user_id
   order by ids.user_id;
end;
$$;
revoke all on function public.admin_sign_in_links(text) from public;
grant execute on function public.admin_sign_in_links(text) to anon, authenticated;

-- Admin: Google sign-ins that have no TapTurf account. Before this change
-- the trigger made an empty account for each of them.
-- state: linking (being added to a phone account now), replaced (taken off
-- a phone account), link_failed (tried to add it to a phone account),
-- not_finished (picked Google but never came back to TapTurf).
create or replace function public.admin_google_unfinished(p_firebase_token text default null)
returns table (auth_uid uuid, email text, name text, created_at timestamptz, last_sign_in_at timestamptz, state text)
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
  select a.id,
         lower(a.email::text),
         coalesce(nullif(btrim(a.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(a.raw_user_meta_data ->> 'name'), '')),
         a.created_at,
         a.last_sign_in_at,
         case when exists (select 1 from private.account_link_intents i
                            where i.auth_uid = a.id and i.closed_at is null and i.expires_at > now()) then 'linking'
              when exists (select 1 from private.account_google_links l where l.auth_uid = a.id) then 'replaced'
              when exists (select 1 from private.account_link_legs lg where lg.auth_uid = a.id) then 'link_failed'
              else 'not_finished' end
    from auth.users a
   where (a.raw_app_meta_data ->> 'provider' = 'google'
          or coalesce(a.raw_app_meta_data -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb)
     and private.google_account(a.id) is null
   order by a.created_at desc, a.id;
end;
$$;
revoke all on function public.admin_google_unfinished(text) from public;
grant execute on function public.admin_google_unfinished(text) to anon, authenticated;

-- Admin: Google accounts and numbers people could not add because another
-- account holds them, and Google accounts added over their own row that was
-- never used (kind link_over_empty), newest first, last 90 days, so the
-- owner can follow up by hand (nothing is merged here). other_user_id: that
-- other account; other_empty: it has nothing in it (now).
create or replace function public.admin_link_refusals(p_firebase_token text default null)
returns table (at timestamptz, kind text, user_id uuid, other_user_id uuid, other_empty boolean, other_made_at timestamptz)
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
  select r.at,
         r.kind,
         nullif(r.detail ->> 'user_id', '')::uuid,
         o.id,
         case when o.id is not null then private.account_is_empty(o.id) end,
         o.created_at
    from private.account_reports r
    left join public.users o on o.id = nullif(coalesce(r.detail ->> 'other_user_id', r.detail ->> 'holder'), '')::uuid
   where r.kind in ('link_has_account', 'link_other_account', 'phone_held', 'link_over_empty')
     and r.at > now() - interval '90 days'
   order by r.at desc
   limit 500;
end;
$$;
revoke all on function public.admin_link_refusals(text) from public;
grant execute on function public.admin_link_refusals(text) to anon, authenticated;
