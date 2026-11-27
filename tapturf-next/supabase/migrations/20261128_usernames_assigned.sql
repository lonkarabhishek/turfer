set local lock_timeout = '5s';

-- A username for every account, kept private until its person says so
-- (28 Nov 2026). The site owner, 27 Nov: "please make picking username
-- easy. Like assign user name already, let them decide if they want to
-- keep it. Also for people who dont have usernames, assign them one".
--
-- The line that must hold: nobody becomes findable, taggable or publicly
-- visible because TapTurf gave them a username. A profile goes public
-- only by the person's own tap.
--
-- How it holds. A given username is NOT a row of public.usernames. It
-- waits in a new private table, private.username_assigned, that no
-- public function reads. Every reader of public.usernames (the public
-- profile, player search, tagging, the medal badge, "Managed by", the
-- name on a tournament, live tags, the verified names, the admin's
-- lists) finds no row for that account, so it is to them exactly an
-- account with no username, as it is today. The name becomes a
-- public.usernames row only when the person taps "Keep it" or saves a
-- name of their own, through public.username_set as it is, which is what
-- picking a first username does today (taggable on unless they turn the
-- switch off first; a first username never counts against the 3 changes
-- in 30 days, and nothing goes to public.username_history).
--
-- Why not a public.usernames row with taggable off, marked as given.
-- private.account_is_empty (20261026_account_links.sql) counts any
-- public.usernames row as "this account was used". Adding Google to a
-- phone account is allowed over a Google account's own row only while
-- that row is empty, so a row for every account would refuse that for
-- everyone (has_account), and it could only be put right by replacing
-- that function. A row would also fire usernames_mark_managed_turfs once
-- per account (20261028_turf_managers.sql marks an owner's turf pages on
-- any insert there, whatever taggable is), and private.profile_json
-- would hand the name to every screen as if it had been picked. A table
-- of its own has none of these, changes no column's meaning, and keeps
-- when a name was given and what became of it.
--
-- New, one table (closed to the API roles, row level security on, no
-- policy):
--   private.username_assigned
--     user_id      the account (public.users.id); one row per account,
--                  ever, so nobody is given a second username
--     username     the name given, in the same form as a username
--     source       backfill (this file) or signin (the app, for an
--                  account made later, at its first signed-in request)
--     assigned_at  when
--     chosen_at    null while it waits for its person; set when they
--                  keep it, pick another, or it is set aside
--     chosen_how   kept (Keep it), changed (they saved another name),
--                  own (they picked one without this file's functions),
--                  off (set aside by hand, see "To undo")
--   and one index: a name that is waiting is held by one account only
--   (unique where chosen_at is null). A name stops being held the moment
--   it is chosen: kept, it is in public.usernames from then on; changed,
--   own or off, it is free again (it was never public, so no link to it
--   exists and it is not put in public.username_history).
--
-- How a name is made (private.username_from_name; the same rules are in
-- lib/account/assigned.ts and both are run against
-- lib/account/assigned.cases.json). From the name on the account and
-- nothing else. Accents are folded to plain letters (NFKD), capitals
-- lowered; spaces, tabs and . _ , / & + ( ) - separate words; every
-- other character is left out (digits of any kind, so no part of a phone
-- number can come through; other scripts, emoji, apostrophes). A title in
-- front (mr, mrs, ms, miss, dr, prof, shri, smt) is left out. Then
-- first_last when that is 16 characters or fewer, else the first word
-- and the last word's initial, else the first word cut at 16. If that is
-- under 3 characters, or private.username_problem refuses it (a reserved
-- word), the name gives nothing. A name with an @ in it gives nothing.
-- A name that is the part before the @ of an address the account holds
-- (what a Google account without a name was given as its name) gives
-- nothing: the addresses are read for that comparison only and no part
-- of one is ever used. The phone number is never read.
-- Then the first that is free of: base, base2, base3, ... or, when the
-- name gave nothing, turfer1, turfer2, ... (never the bare word). Free
-- means nobody has it (public.usernames), nobody had it
-- (public.username_history, the never given to anyone else rule) and
-- nobody is waiting to choose it (this table).
--
-- New private functions (execute for nobody but the owner):
--   private.username_from_name(p_name, p_emails)  the base, or null
--   private.username_is_free(p_username, p_user_id)
--   private.username_assign(p_user_id, p_source)  gives one and keeps it
-- New public functions (the account key is the gate, as every account
-- function; execute for anon and authenticated; security definer,
-- search_path ''; only the Next server holds the key, and it passes the
-- account whose sign-in it verified, lib/account/server.ts):
--   public.username_ensure(p_key, p_user_id): jsonb
--     {r: ok, assigned}: the name waiting for this account, given now if
--     it has no username and none was given yet (an account made after
--     this file gets its name here, at its first signed-in request).
--     assigned is null for an account that has a username. Never writes
--     public.usernames, never a notification.
--   public.username_choose(p_key, p_user_id, p_username, p_taggable): jsonb
--     Every username write goes through it. A null p_username with a
--     name waiting is "Keep it". A name that is waiting for someone else
--     answers {r: taken}. Everything else is public.username_set's own
--     answer: this function calls it and changes nothing of its rules.
--     When the write went through, the waiting row is marked kept or
--     changed. Keeping a name that someone took meanwhile (possible only
--     through the older function) gives another: {r: moved, assigned}.
--   public.username_check_all(p_key, p_user_id, p_username): jsonb
--     public.username_check's answer, and {r: taken} for a name that is
--     waiting for someone else.
--
-- What this file writes, once:
--   * private.username_assigned: one row for each account that has no
--     username, oldest account first (so of two people with one name the
--     older account gets the plain one), about 414 rows (662 accounts,
--     248 with a username, counted 27 Nov 2026). An account whose Google
--     sign-in opens another account (an open row of
--     private.account_google_links) is left out: nobody can sign in to
--     it. One loop in one transaction: per account a handful of index
--     lookups and one insert.
--   * public.notifications: one row for each of those accounts, type
--     username_assigned, "You have a TapTurf username" / "Your TapTurf
--     username is @asha_rao. Keep it or change it in Profile. It stays
--     private until you say so." The app links it to
--     /dashboard?tab=profile#username (lib/my/claimNotice.ts).
--   * private.push_sends: one row for each of those notifications, with
--     0 phones and 0 sent. It is the claim public.push_targets makes
--     before a send, made here first, so that notification is never sent
--     to a phone.
--   Nothing is written to public.usernames, public.username_history,
--   public.users or any game, turf or review table.
-- Run again, it gives nobody a second name (one row per account) and
-- writes nobody a second notice (it looks for its own type first).
--
-- What those writes set off. public.notifications has two triggers:
--   * notifications_email (private.email_on_notification): returns at
--     once, because private.email_kind_of knows no such type. No email
--     is queued.
--   * notifications_push (private.push_on_notification): for an account
--     with an active push subscription it posts the notification's id to
--     the app's /api/push/dispatch after commit. The app then asks
--     public.push_targets, finds the claim above and sends nothing. So:
--     at most one small request per such account (few of these accounts
--     will have one; production was not read), and no push.
-- No SMS exists anywhere. Nothing here marks a cache key: no page is
-- purged or rebuilt, because public.usernames is not touched (its
-- triggers, usernames_mark_managed_turfs and usernames_game_tags_setting,
-- do not fire).
-- Later, when one person keeps or changes their name, public.username_set
-- writes their public.usernames row and its triggers fire for that one
-- account, exactly as for any username picked today.
--
-- Replaced: none. No existing function, table, column, trigger, policy
-- or grant is changed. The functions this file calls are left as they
-- are. Each md5 is md5(prosrc) of the latest body in the repo's
-- migrations (for public.username_set that is 20261021_accounts_fixes.sql,
-- which was written after 20261021_accounts_usernames.sql and replaces
-- its body); production was not read for this file, so compare before
-- applying:
--   select s.nspname, p.proname, md5(p.prosrc) from pg_proc p
--     join pg_namespace s on s.oid = p.pronamespace
--    where (s.nspname, p.proname) in (('private', 'account_key_ok'),
--          ('private', 'username_problem'), ('public', 'username_set'),
--          ('public', 'username_check'));
--   private.account_key_ok    ca605fa89a97497134b690e753dc5c0e  20261021_accounts_usernames.sql
--   private.username_problem  7382c7af76e965d0b961fd0f48a1253d  20261021_accounts_usernames.sql
--   public.username_set       5914cc7622e610e87179d0b478b5ca76  20261021_accounts_fixes.sql
--   public.username_check     e792ba191eb6412ccb93c46494359e96  20261021_accounts_usernames.sql
-- Read and left as they are: public.users (id, name, email, created_at),
-- auth.users (id, email), private.user_contact_emails (user_id, email),
-- private.account_google_links (user_id, auth_uid, email, ended_at),
-- public.usernames and public.username_history (username, user_id),
-- public.notifications (user_id, type). The email columns are read only
-- to tell a real name from an address used as one. public.users.phone is
-- never read.
--
-- To undo by hand, removing no row. A waiting name is inert already: it
-- is in no public table and no public function reads it. To stop
-- offering them, set the waiting ones aside, which also frees the names:
--   update private.username_assigned
--      set chosen_at = now(), chosen_how = 'off' where chosen_at is null;
-- and, so that no new account is given one,
--   revoke execute on function public.username_ensure(text, uuid) from anon, authenticated;
-- The app then asks people to pick a username as it does today. To send
-- username writes and checks back to the functions from before, revoke
-- the other two the same way: the app falls back to public.username_set
-- and public.username_check. A username someone kept or picked is theirs
-- and stays; the notices already written stay as read or unread text.
--
-- The app works before this file: it finds none of the three functions,
-- gives nobody a name, and asks people to pick a username as it does
-- today.
-- Needs 20261021_accounts_usernames.sql, 20261021_accounts_fixes.sql,
-- 20261025_contact_email.sql, 20261026_account_links.sql and
-- 20261102_web_push.sql, and Postgres 13 or later on a UTF8 database for
-- normalize() (it refuses to run without them, changing nothing).
-- Additive. Written without the destructive SQL keywords and
-- without the escape character. Safe to run again.
-- Erasing an account: clear its private.username_assigned row by hand
-- with its other rows (no foreign key to public.users, so nothing here
-- locks it).
-- Test: scripts/sql-tests/usernames_assigned.check.mjs (PGlite).

do $$
begin
  if to_regclass('public.users') is null
     or to_regclass('auth.users') is null
     or to_regclass('public.usernames') is null
     or to_regclass('public.username_history') is null
     or to_regclass('public.notifications') is null
     or to_regclass('private.user_contact_emails') is null
     or to_regclass('private.account_google_links') is null
     or to_regclass('private.push_sends') is null
     or to_regprocedure('private.account_key_ok(text)') is null
     or to_regprocedure('private.username_problem(text)') is null
     or to_regprocedure('public.username_set(text,uuid,text,boolean)') is null
     or to_regprocedure('public.username_check(text,uuid,text)') is null then
    raise exception 'usernames_assigned needs 20261021_accounts_usernames.sql, 20261021_accounts_fixes.sql, 20261025_contact_email.sql, 20261026_account_links.sql and 20261102_web_push.sql first';
  end if;
  -- Accents are folded with normalize(), which is Postgres 13 and later, on a UTF8 database.
  if current_setting('server_version_num')::integer < 130000 or getdatabaseencoding() <> 'UTF8' then
    raise exception 'usernames_assigned needs Postgres 13 or later and a UTF8 database';
  end if;
end;
$$;

-- ── 1. Where a given name waits (closed to the API roles) ──

create table if not exists private.username_assigned (
  -- The account (public.users.id). One row per account, ever.
  user_id uuid primary key,
  username text not null check (username ~ '^[a-z][a-z0-9_]{2,19}$'),
  source text not null check (source in ('backfill', 'signin')),
  assigned_at timestamptz not null default now(),
  -- Null while it waits for its person.
  chosen_at timestamptz,
  chosen_how text check (chosen_how is null or chosen_how in ('kept', 'changed', 'own', 'off')),
  constraint username_assigned_chosen_both check ((chosen_at is null) = (chosen_how is null))
);
alter table private.username_assigned enable row level security;
revoke all on private.username_assigned from public, anon, authenticated;
-- A name that is waiting is held by one account only.
create unique index if not exists username_assigned_waiting_uidx on private.username_assigned (username) where chosen_at is null;
comment on table private.username_assigned is
  'The username TapTurf gave an account, waiting for its person to keep it or pick another (chosen_at null), and what became of it. Private: no public function reads it, so a waiting name shows nowhere. It becomes a public.usernames row only through public.username_choose, by the person''s own tap.';

-- ── 2. The name from the name ──

-- The start of a username from the name on an account, or null when the
-- name gives none. p_emails: every address the account holds, read only
-- to refuse a name that is the part of one before the @. Letters only;
-- no digit is kept. lib/account/assigned.ts assignedBase is the same.
create or replace function private.username_from_name(p_name text, p_emails text[] default null)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_blank constant text := ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13);
  v_raw text := btrim(coalesce(p_name, ''), v_blank);
  v text;
  v_words text[];
  v_first text;
  v_last text;
  v_base text;
begin
  if position('@' in v_raw) > 0 then
    return null;
  end if;
  if v_raw <> '' and exists (
       select 1
         from unnest(coalesce(p_emails, '{}'::text[])) as e(address)
        where e.address is not null
          and lower(v_raw) = lower(split_part(btrim(e.address, v_blank), '@', 1))) then
    return null;
  end if;
  v := normalize(v_raw, NFKD);
  v := translate(v, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz');
  -- Tabs, line ends and . _ , / & + ( ) - separate words, as a space does.
  v := translate(v, chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || '._,/&+()-', repeat(' ', 14));
  v := btrim(regexp_replace(v, '[^a-z ]', '', 'g'), ' ');
  if v = '' then
    return null;
  end if;
  v_words := regexp_split_to_array(v, ' +');
  while cardinality(v_words) > 1 and v_words[1] = any (array['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'shri', 'smt']) loop
    v_words := v_words[2:];
  end loop;
  v_first := v_words[1];
  v_last := case when cardinality(v_words) > 1 then v_words[cardinality(v_words)] end;
  v_base := case
              when v_last is null then left(v_first, 16)
              when length(v_first) + 1 + length(v_last) <= 16 then v_first || '_' || v_last
              when length(v_first) + 2 <= 16 then v_first || '_' || left(v_last, 1)
              else left(v_first, 16)
            end;
  if length(v_base) < 3 or private.username_problem(v_base) is not null then
    return null;
  end if;
  return v_base;
end;
$$;
revoke all on function private.username_from_name(text, text[]) from public, anon, authenticated;

-- Nobody else has it, had it, or is waiting to choose it.
create or replace function private.username_is_free(p_username text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_username is not null
     and not exists (select 1 from public.usernames n where n.username = p_username and n.user_id is distinct from p_user_id)
     and not exists (select 1 from public.username_history h where h.username = p_username and h.user_id is distinct from p_user_id)
     and not exists (select 1 from private.username_assigned a
                      where a.username = p_username and a.user_id is distinct from p_user_id and a.chosen_at is null);
$$;
revoke all on function private.username_is_free(text, uuid) from public, anon, authenticated;

-- Give an account a name and keep it waiting: the first free of base,
-- base2, base3, ... or turfer1, turfer2, ... The name given, or null (no
-- such account, its row is chosen already, or 9999 are taken). Callers
-- hold the username lock, so two accounts are never given one name.
create or replace function private.username_assign(p_user_id uuid, p_source text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_known boolean;
  v_base text;
  v_name text;
  v_given text;
  v_n integer := 0;
begin
  select true,
         private.username_from_name(
           u.name::text,
           array[u.email::text,
                 (select a.email::text from auth.users a where a.id = u.id),
                 (select c.email::text from private.user_contact_emails c where c.user_id = u.id)]
           || array(select l.email::text from private.account_google_links l where l.user_id = u.id or l.auth_uid = u.id))
    into v_known, v_base
    from public.users u
   where u.id = p_user_id;
  if v_known is not true then
    return null;
  end if;
  loop
    v_n := v_n + 1;
    if v_n > 9999 then
      return null;
    end if;
    v_name := case when v_base is null then 'turfer' || v_n::text
                   when v_n = 1 then v_base
                   else v_base || v_n::text end;
    exit when private.username_is_free(v_name, p_user_id);
  end loop;
  insert into private.username_assigned as t (user_id, username, source)
  values (p_user_id, v_name, p_source)
  on conflict (user_id) do update set username = excluded.username
    where t.chosen_at is null
  returning t.username into v_given;
  return v_given;
end;
$$;
revoke all on function private.username_assign(uuid, text) from public, anon, authenticated;

-- ── 3. For the server (the account key is the gate) ──

-- The name waiting for an account, given now if it has none. Never
-- writes public.usernames and never tells anyone.
create or replace function public.username_ensure(p_key text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.username_assigned;
  v_name text;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_row from private.username_assigned a where a.user_id = p_user_id;
  if exists (select 1 from public.usernames n where n.user_id = p_user_id) then
    -- They have a username. One picked without this file's functions leaves a row waiting: close it.
    if v_row.user_id is not null and v_row.chosen_at is null then
      update private.username_assigned set chosen_at = now(), chosen_how = 'own' where user_id = p_user_id and chosen_at is null;
    end if;
    return jsonb_build_object('r', 'ok', 'assigned', null);
  end if;
  if v_row.chosen_at is not null then
    -- Set aside by hand: nothing is offered.
    return jsonb_build_object('r', 'ok', 'assigned', null);
  end if;
  if v_row.user_id is not null and private.username_is_free(v_row.username, p_user_id) then
    return jsonb_build_object('r', 'ok', 'assigned', v_row.username);
  end if;
  -- None yet, or someone took it through the older function: give one, one writer at a time.
  perform pg_advisory_xact_lock(hashtext('username_set'));
  if exists (select 1 from public.usernames n where n.user_id = p_user_id) then
    return jsonb_build_object('r', 'ok', 'assigned', null);
  end if;
  select * into v_row from private.username_assigned a where a.user_id = p_user_id;
  if v_row.chosen_at is not null then
    return jsonb_build_object('r', 'ok', 'assigned', null);
  end if;
  if v_row.user_id is not null and private.username_is_free(v_row.username, p_user_id) then
    return jsonb_build_object('r', 'ok', 'assigned', v_row.username);
  end if;
  v_name := private.username_assign(p_user_id, coalesce(v_row.source, 'signin'));
  return jsonb_build_object('r', 'ok', 'assigned', v_name);
end;
$$;
revoke all on function public.username_ensure(text, uuid) from public, anon, authenticated;
grant execute on function public.username_ensure(text, uuid) to anon, authenticated;

-- Keep the given name (p_username null), or set or change a username
-- and/or the "Let others find and tag me" switch. The write itself is
-- public.username_set's, with its rules and its answers; this adds only
-- that a name waiting for someone else is taken, and that the caller's
-- waiting row is closed once they have chosen.
create or replace function public.username_choose(p_key text, p_user_id uuid, p_username text default null, p_taggable boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.username_assigned;
  v_problem text;
  v_name text;
  v_res jsonb;
  v_new text;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  perform pg_advisory_xact_lock(hashtext('username_set'));
  if p_user_id is null or not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_row from private.username_assigned a where a.user_id = p_user_id and a.chosen_at is null;

  if p_username is not null then
    -- The rules first, on the name as typed, so only plain letters are ever lowered.
    v_problem := private.username_problem(p_username);
    if v_problem is not null then
      return jsonb_build_object('r', v_problem);
    end if;
    v_name := lower(p_username);
    if exists (select 1 from private.username_assigned o
                where o.username = v_name and o.user_id <> p_user_id and o.chosen_at is null) then
      return jsonb_build_object('r', 'taken');
    end if;
  end if;

  if exists (select 1 from public.usernames n where n.user_id = p_user_id) then
    -- They have a username already: today's change, with today's limit.
    v_res := public.username_set(p_key, p_user_id, p_username, p_taggable);
    if v_row.user_id is not null then
      update private.username_assigned set chosen_at = now(), chosen_how = 'own' where user_id = p_user_id and chosen_at is null;
    end if;
    return v_res;
  end if;

  if p_username is null then
    if v_row.user_id is null then
      -- Nothing waiting to keep, and the switch alone has no username to be set on.
      return jsonb_build_object('r', 'bad');
    end if;
    v_name := v_row.username;
  end if;

  -- Their first username, by their own tap: what picking one does today. Public unless they turned the switch off first.
  v_res := public.username_set(p_key, p_user_id, coalesce(p_username, v_name), coalesce(p_taggable, true));
  if v_res ->> 'r' = 'ok' then
    if v_row.user_id is not null then
      update private.username_assigned
         set chosen_at = now(), chosen_how = case when v_name = v_row.username then 'kept' else 'changed' end
       where user_id = p_user_id and chosen_at is null;
    end if;
    return v_res;
  end if;
  if p_username is null and v_res ->> 'r' = 'taken' then
    -- The name they were keeping went to someone else through the older function: give another.
    v_new := private.username_assign(p_user_id, v_row.source);
    return jsonb_build_object('r', 'moved', 'assigned', v_new);
  end if;
  return v_res;
end;
$$;
revoke all on function public.username_choose(text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.username_choose(text, uuid, text, boolean) to anon, authenticated;

-- Whether p_username is free for p_user_id: public.username_check's
-- answer, and taken for a name that is waiting for someone else.
create or replace function public.username_check_all(p_key text, p_user_id uuid, p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_res jsonb;
begin
  v_res := public.username_check(p_key, p_user_id, p_username);
  if v_res ->> 'r' = 'ok'
     and exists (select 1 from private.username_assigned o
                  where o.username = v_res ->> 'username' and o.user_id is distinct from p_user_id and o.chosen_at is null) then
    return jsonb_build_object('r', 'taken');
  end if;
  return v_res;
end;
$$;
revoke all on function public.username_check_all(text, uuid, text) from public, anon, authenticated;
grant execute on function public.username_check_all(text, uuid, text) to anon, authenticated;

-- ── 4. Once: a name for every account that has none ──

-- Oldest account first. An account that has a username, was given a name
-- already (this file run before) or cannot be signed in to (its Google
-- sign-in opens another account) is left alone.
do $$
declare
  r record;
  v_given integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('username_set'));
  for r in
    select u.id
      from public.users u
     where not exists (select 1 from public.usernames n where n.user_id = u.id)
       and not exists (select 1 from private.username_assigned a where a.user_id = u.id)
       and not exists (select 1 from private.account_google_links l
                        where l.auth_uid = u.id and l.ended_at is null and l.user_id <> u.id)
     order by u.created_at, u.id
  loop
    if private.username_assign(r.id, 'backfill') is not null then
      v_given := v_given + 1;
    end if;
  end loop;
  raise notice 'usernames_assigned: % accounts given a username', v_given;
end;
$$;

-- ── 5. Once: tell each of them, in the app only ──

-- One notification per account, and with it the claim that keeps it off
-- phones (public.push_targets finds the claim and sends nothing). No
-- email: private.email_kind_of knows no such type.
with told as (
  insert into public.notifications (user_id, type, title, message, metadata, is_read)
  select a.user_id,
         'username_assigned',
         'You have a TapTurf username',
         'Your TapTurf username is @' || a.username || '. Keep it or change it in Profile. It stays private until you say so.',
         jsonb_build_object('username', a.username),
         false
    from private.username_assigned a
   where a.source = 'backfill'
     and a.chosen_at is null
     and not exists (select 1 from public.notifications q
                      where q.user_id = a.user_id and q.type = 'username_assigned')
   order by a.assigned_at, a.user_id
  returning id, user_id
)
insert into private.push_sends (kind, notification_id, user_id, targets, sent, gone, failed, reported_at)
select 'notification', t.id, t.user_id, 0, 0, 0, 0, now()
  from told t
on conflict (notification_id) where notification_id is not null do nothing;
