set local lock_timeout = '5s';

-- Emails, TapTurf's first (the site owner approved these six, 9 Nov 2026),
-- sent through Resend (domain tapturf.in, verified) from
-- app/api/email/dispatch/route.ts:
--   1. Welcome to TapTurf: once, to an account made after this file first
--      ran (private.email_launch_at; never to the accounts made before).
--   2. New join request: to the host (in-app game_request). It waits 15
--      minutes and lists every request for that game that came meanwhile
--      and is still waiting; a request the host answered in the app by
--      then is left out, and with none left nothing is sent.
--   3. Request still waiting: to the host, once per request, when it is
--      still pending 2 hours after it was sent, or 30 minutes after it was
--      sent once the game starts within 3 hours; never once the game has
--      started. Also an in-app notification (new type game_request_waiting).
--   4. You're in: to the player the host accepted (game_request_accepted).
--   5. Game changes: cancelled (game_cancelled), venue changed
--      (game_venue_changed), date or start time changed (new in-app type
--      game_time_changed, made by game_update below for the people a venue
--      change tells: the players and the pending or accepted requests,
--      never the host who changed it). A venue and a time change in one
--      save, or within 2 minutes, make one email.
--   6. Game reminders: to the host and every player of an open or full
--      game, "tomorrow" at 6 PM India time the day before and "in about 3
--      hours" about 3 hours before the start (its run in a 30 minute
--      window: a run that missed it sends none). Skipped for anyone who
--      joined, or made the game, less than an hour before; the second is
--      skipped when the first went less than an hour before. Also an
--      in-app notification (new type game_reminder).
-- Never emailed: booking requests and their answers (the privacy page
-- promises it), claim decisions (lib/my/claimNotice.ts promises it), a
-- declined request, anything promotional. Only the types above map to an
-- email (private.email_kind_of); every other notification is left alone.
--
-- Who gets an email: only an account whose public.users.email Google
-- confirmed (private.email_proven, 20261027_verified_tick.sql; 112 of 323
-- accounts on 10 Nov 2026, all with users.email), never a typed one
-- (private.user_contact_emails) or an old unconfirmed address; never one
-- that bounced or complained (private.email_suppressions); only with that
-- kind's switch on (private.email_prefs: requests for 2, 3 and 4, changes
-- for 5, reminders for 6, all on until turned off on the Me tab or with the
-- link in an email); at most 6 a day per account (private.email_daily_cap).
-- One send per person: the address is read at send time and goes only to
-- the route; nothing here stores an address or a name.
--
-- How it runs:
--   * notifications_email, after insert on public.notifications: for the
--     types above, queues (or joins) a row in private.email_outbox. It
--     never fails the insert: any error is a warning, as notifications_push.
--   * private.email_clock(), every 5 minutes (pg_cron 'email-clock', one
--     run at a time): the reminders and the waiting nudges as in-app
--     notifications (so they reach the Alerts list, phones with push, and
--     the outbox through the trigger), each once (private.game_alerts),
--     and Welcome for new accounts. India time throughout.
--   * private.email_flush(), every minute (pg_cron 'email-flush', one run
--     at a time): a send whose lease ran out is tried again (or failed after
--     the fifth try); a row queued over 24 hours expires, so mail turned on
--     late is never stale; and only when a row is due does pg_net post to
--     https://www.tapturf.in/api/email/dispatch with the revalidate secret
--     (x-revalidate-secret, as the push trigger). An idle minute calls
--     nothing. A post the route has not answered (no email_claim since) is
--     sent again 10 minutes on at the earliest; while the route says it
--     can't send (no Resend key yet: email_hold) it waits 30 minutes.
--   * The route (ACCOUNT_KEY, private.account_key_ok): email_claim leases up
--     to 20 due rows (status sending, 5 minutes) with what each email says,
--     read now (the game as it is, the recipient's address and first name,
--     the host's first name, the venue and its map, the requests still
--     waiting), and marks the rest skipped with why (answered, cancelled,
--     started, moved, off, suppressed, no_address); email_report records
--     what Resend answered: sent (its id), failed, or retry after 1, 5, 30,
--     120 minutes, failed after the 5th try.
--   * The account routes (the verified caller, as the games routes):
--     email_prefs_get and email_prefs_set, the Me tab's Emails block. The
--     link in an email (signed by the app per account and group):
--     email_unsubscribe. Resend's webhook (bounced, complained):
--     email_suppress.
--
-- Tables (schema private, RLS on, no grant to anyone; only the functions
-- below read or write them; no foreign keys, as private.booking_requests,
-- so nothing here locks public.users or public.games):
--   private.email_settings     one row, launch_at (when this file first ran).
--   private.email_outbox       one row per email: account, kind, dedupe_key
--                              (unique), refs (the game, the requests, what
--                              changed), status (queued, sending, sent,
--                              failed, skipped, expired), attempts,
--                              next_attempt_at, lease_until, provider_id
--                              (Resend's), last_error, created_at, sent_at.
--   private.email_prefs        per account: requests, changes, reminders
--                              (default on), unsubscribed_all_at.
--   private.email_suppressions md5 of a bounced or complaining address (lower
--                              case), the account it was then, why, when.
--   private.email_flush_state  one row: the last post, the last claim, a hold.
--   private.game_alerts        each reminder and nudge decided (told or
--                              skipped), so each is decided once.
--
-- Constants (immutable; the route's twins in lib/email/types.ts):
--   private.email_daily_cap()    6    emails per account in 24 hours
--   private.email_claim_max()    20   CLAIM_MAX
--   private.email_max_attempts() 5    tries before failed
--   private.email_backoff(n)     1, 5, 30, 120 minutes after try n
--   private.email_collapse()     15 minutes
--
-- New helpers (private; nobody but their owner may call them):
--   game_clock_text(time), email_launch_at(), email_group(kind),
--   email_kind_of(type), email_uuid(text), email_address(user),
--   email_hash(address), email_suppressed(address), email_ok(user, kind),
--   email_queue(user, kind, key, refs, due), email_join(user, kind, game,
--   key, value, extra), email_on_notification() (the trigger),
--   email_venue_name(game), email_clock(now), email_flush(now),
--   email_job(row).
-- New public functions (server key; EXECUTE to anon as every other one,
-- the key is the gate): email_claim(p_key, p_limit), email_report(p_key,
-- p_results), email_hold(p_key, p_reason), email_prefs_get(p_key,
-- p_user_id), email_prefs_set(p_key, p_user_id, p_requests, p_changes,
-- p_reminders), email_unsubscribe(p_key, p_user_id, p_group),
-- email_suppress(p_key, p_address, p_reason).
--
-- Replaced: one function, public.game_update(text, uuid, uuid, jsonb,
-- jsonb), with its body as production runs it (md5(prosrc) read 10 Nov
-- 2026: 2b3c117ecacd890462f3243d210d30b0, the body in
-- 20261103_game_other_venue.sql) plus only the lines that tell the players
-- when the date or start time changes (game_time_changed, the same people
-- as game_venue_changed) and their two variables. Its answer is unchanged
-- ('notified' counts the venue notices, as before).
-- Called here and left as production runs them (md5(prosrc), read 10 Nov
-- 2026, equal to their latest body in the repo):
--   private.email_proven          2141139f1901b1cafcbde703573cfcf3
--   private.account_key_ok        ca605fa89a97497134b690e753dc5c0e
--   private.game_notify           b105f7aee319ed9725f42b85c5d4735c
--   private.game_start_at         870fe04f498b656d8c9435099fd8bfb9
--   private.push_url              7194c64e4d38986c2f21fe7b60f911f8
--   private.push_on_notification  1272b4bded03cbebd6289b1f25fa385c
-- push_url needs no change: the three new types carry gameId, so a push
-- opens the game, as lib/my/claimNotice.ts notificationLink does.
--
-- Needs 20261027_verified_tick.sql, 20261030_games_lockdown.sql,
-- 20261101_played_with.sql and 20261103_game_other_venue.sql (it refuses
-- to run without them, changing nothing), pg_cron and pg_net.
-- Additive: six tables, indexes, functions, one trigger, two cron jobs, the
-- one replaced function above. Written without the destructive SQL
-- keywords; nothing is removed. No grant or policy on a public table
-- changes. Safe to run again (launch_at keeps its first value).
-- The app works before this file: the Me tab hides the Emails block, the
-- dispatch route is never called, and the email links say try later.
-- Until RESEND_API_KEY is in Vercel the route sends nothing and says so
-- (email_hold); rows expire after 24 hours, so turning the key on later
-- sends nothing stale.
-- Test: scripts/sql-tests/email.check.mjs (PGlite).

do $$
begin
  if to_regprocedure('private.game_notify(uuid,text,text,text,jsonb)') is null
     or to_regprocedure('public.game_update(text,uuid,uuid,jsonb,jsonb)') is null
     or to_regprocedure('private.email_proven(uuid)') is null
     or to_regprocedure('private.game_start_at(date,time)') is null
     or to_regprocedure('private.account_key_ok(text)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'games' and column_name = 'venue_name') then
    raise exception 'email: apply 20261027_verified_tick.sql, 20261030_games_lockdown.sql, 20261101_played_with.sql and 20261103_game_other_venue.sql first';
  end if;
end;
$$;

-- ── 1. Tables ──────────────────────────────────────────────

create table if not exists private.email_settings (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
comment on table private.email_settings is
  'Emails: settings. launch_at: when 20261110_email.sql first ran; Welcome goes only to accounts made after it.';
-- The first run sets it; running the file again keeps it.
insert into private.email_settings (name, value)
values ('launch_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
on conflict (name) do nothing;

create table if not exists private.email_outbox (
  id uuid primary key default gen_random_uuid(),
  -- The account (public.users.id) it is for. Never its address: that is read at send time.
  user_id uuid not null,
  kind text not null check (kind in ('welcome', 'join_request', 'request_waiting', 'request_accepted', 'game_cancelled', 'game_changed', 'reminder')),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  -- What it is about: game_id, request_ids, changes, from_date, from_start, when, start_at. Ids and times only.
  refs jsonb not null default '{}'::jsonb check (jsonb_typeof(refs) = 'object'),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped', 'expired')),
  attempts smallint not null default 0 check (attempts between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  provider_id text check (provider_id is null or char_length(provider_id) <= 100),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint email_outbox_dedupe_key unique (dedupe_key)
);
comment on table private.email_outbox is
  'Emails: one row per email to send, sent or not sent (and why). Ids and times only, never an address or a name. 20261110_email.sql';
create index if not exists email_outbox_due_idx on private.email_outbox (next_attempt_at) where status = 'queued';
create index if not exists email_outbox_lease_idx on private.email_outbox (lease_until) where status = 'sending';
create index if not exists email_outbox_user_idx on private.email_outbox (user_id, created_at desc);

create table if not exists private.email_prefs (
  user_id uuid primary key,
  requests boolean not null default true,
  changes boolean not null default true,
  reminders boolean not null default true,
  unsubscribed_all_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table private.email_prefs is
  'Emails: an account''s switches (Me tab, or the link in an email). No row: all on. 20261110_email.sql';

create table if not exists private.email_suppressions (
  address_hash text primary key check (address_hash ~ '^[0-9a-f]{32}$'),
  user_id uuid,
  reason text not null check (reason in ('bounce', 'complaint')),
  at timestamptz not null default now()
);
comment on table private.email_suppressions is
  'Emails: addresses never emailed again (md5 of the lower case address): Resend said it bounced or the person marked us as spam. 20261110_email.sql';

create table if not exists private.email_flush_state (
  id boolean primary key default true check (id),
  last_poke_at timestamptz,
  last_poke_id bigint,
  last_claim_at timestamptz,
  hold_until timestamptz,
  hold_reason text check (hold_reason is null or char_length(hold_reason) <= 40)
);
insert into private.email_flush_state (id) values (true) on conflict (id) do nothing;

create table if not exists private.game_alerts (
  key text primary key check (char_length(key) between 1 and 200),
  user_id uuid not null,
  game_id uuid not null,
  kind text not null check (kind in ('tomorrow', 'soon', 'waiting')),
  outcome text not null check (outcome in ('told', 'skipped_new', 'skipped_close')),
  at timestamptz not null default now()
);
comment on table private.game_alerts is
  'Game reminders and join request nudges (private.email_clock): each decided once, told or skipped. 20261110_email.sql';
create index if not exists game_alerts_user_game_idx on private.game_alerts (user_id, game_id, at desc);

alter table private.email_settings enable row level security;
alter table private.email_outbox enable row level security;
alter table private.email_prefs enable row level security;
alter table private.email_suppressions enable row level security;
alter table private.email_flush_state enable row level security;
alter table private.game_alerts enable row level security;
revoke all on table private.email_settings from public, anon, authenticated;
revoke all on table private.email_outbox from public, anon, authenticated;
revoke all on table private.email_prefs from public, anon, authenticated;
revoke all on table private.email_suppressions from public, anon, authenticated;
revoke all on table private.email_flush_state from public, anon, authenticated;
revoke all on table private.game_alerts from public, anon, authenticated;

-- ── 2. Constants and helpers ───────────────────────────────

-- Emails per account in 24 hours, every kind counted (queued, sending or sent).
create or replace function private.email_daily_cap()
returns int language sql immutable set search_path = '' as $$ select 6 $$;

-- CLAIM_MAX in lib/email/types.ts: the most rows one claim leases.
create or replace function private.email_claim_max()
returns int language sql immutable set search_path = '' as $$ select 20 $$;

-- Tries before a row is failed.
create or replace function private.email_max_attempts()
returns int language sql immutable set search_path = '' as $$ select 5 $$;

-- How long after try n the next one goes: 1, 5, 30, 120 minutes.
create or replace function private.email_backoff(p_attempts int)
returns interval language sql immutable set search_path = '' as $$
  select case when coalesce(p_attempts, 1) <= 1 then interval '1 minute'
              when p_attempts = 2 then interval '5 minutes'
              when p_attempts = 3 then interval '30 minutes'
              else interval '120 minutes' end
$$;

-- Join requests for one game within this long make one email.
create or replace function private.email_collapse()
returns interval language sql immutable set search_path = '' as $$ select interval '15 minutes' $$;

-- "7 PM", "6:30 AM": a game's start as stored (India time).
create or replace function private.game_clock_text(p_time time)
returns text language sql immutable set search_path = '' as $$
  select case when extract(minute from p_time) = 0
              then to_char(date '2000-01-01' + p_time, 'FMHH12 AM')
              else to_char(date '2000-01-01' + p_time, 'FMHH12:MI AM') end
$$;

-- When this file first ran: Welcome only for accounts made after it.
create or replace function private.email_launch_at()
returns timestamptz language sql stable security definer set search_path = '' as $$
  select coalesce((select s.value::timestamptz from private.email_settings s where s.name = 'launch_at'), 'infinity'::timestamptz)
$$;

-- The Me tab's switch an email kind belongs to ('account' for Welcome).
create or replace function private.email_group(p_kind text)
returns text language sql immutable set search_path = '' as $$
  select case when p_kind in ('join_request', 'request_waiting', 'request_accepted') then 'requests'
              when p_kind in ('game_cancelled', 'game_changed') then 'changes'
              when p_kind = 'reminder' then 'reminders'
              when p_kind = 'welcome' then 'account' end
$$;

-- The email a notification type makes; null for every other type (booking requests, claim decisions, declines...).
create or replace function private.email_kind_of(p_type text)
returns text language sql immutable set search_path = '' as $$
  select case p_type
           when 'game_request' then 'join_request'
           when 'game_request_waiting' then 'request_waiting'
           when 'game_request_accepted' then 'request_accepted'
           when 'game_cancelled' then 'game_cancelled'
           when 'game_venue_changed' then 'game_changed'
           when 'game_time_changed' then 'game_changed'
           when 'game_reminder' then 'reminder'
         end
$$;

-- A uuid, or null when the text is not one.
create or replace function private.email_uuid(p text)
returns uuid language sql immutable set search_path = '' as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
$$;

-- The address an account is emailed at: its own users.email, only when Google confirmed it. Else null.
create or replace function private.email_address(p_user_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select btrim(u.email::text)
    from public.users u
   where u.id = p_user_id
     and u.email is not null
     and char_length(btrim(u.email::text)) between 6 and 254
     and btrim(u.email::text) ~ '^[^@[:space:]<>,;"]+@[^@[:space:]<>,;"]+\.[^@[:space:]<>,;"]+$'
     and private.email_proven(u.id)
$$;

create or replace function private.email_hash(p_address text)
returns text language sql immutable set search_path = '' as $$
  select md5(lower(btrim(p_address)))
$$;

create or replace function private.email_suppressed(p_address text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_address is not null
     and exists (select 1 from private.email_suppressions s where s.address_hash = private.email_hash(p_address))
$$;

-- Whether this account may get this kind now: a confirmed address that never bounced or complained, and its switch on.
create or replace function private.email_ok(p_user_id uuid, p_kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select a.addr is not null
       and not private.email_suppressed(a.addr)
       and case private.email_group(p_kind)
             when 'requests' then coalesce(p.requests, true)
             when 'changes' then coalesce(p.changes, true)
             when 'reminders' then coalesce(p.reminders, true)
             when 'account' then p.unsubscribed_all_at is null
             else false
           end
      from (select private.email_address(p_user_id) as addr) a
      left join private.email_prefs p on p.user_id = p_user_id), false)
$$;

-- One email in the outbox, due at p_due, when the account may get it and has had fewer than 6 in 24 hours.
-- The new row's id, or null (not allowed, the cap, or that dedupe key was queued before).
create or replace function private.email_queue(p_user_id uuid, p_kind text, p_dedupe text, p_refs jsonb, p_due timestamptz default now())
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null or p_dedupe is null or private.email_group(p_kind) is null or not private.email_ok(p_user_id, p_kind) then
    return null;
  end if;
  if (select count(*) from private.email_outbox o
       where o.user_id = p_user_id
         and o.created_at > now() - interval '1 day'
         and o.status in ('queued', 'sending', 'sent')) >= private.email_daily_cap() then
    return null;
  end if;
  insert into private.email_outbox (user_id, kind, dedupe_key, refs, next_attempt_at)
  values (p_user_id, p_kind, left(p_dedupe, 200), coalesce(p_refs, '{}'::jsonb), coalesce(p_due, now()))
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Adds p_value to the list p_key of this account's queued email of this kind about this game (made in the last
-- 15 minutes), with p_extra's keys where it has none. True when there was one to add to.
create or replace function private.email_join(p_user_id uuid, p_kind text, p_game uuid, p_key text, p_value jsonb, p_extra jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select o.id into v_id
    from private.email_outbox o
   where o.user_id = p_user_id
     and o.kind = p_kind
     and o.status = 'queued'
     and o.refs ->> 'game_id' = p_game::text
     and o.created_at > now() - private.email_collapse()
   order by o.created_at desc
   limit 1
     for update;
  if v_id is null then
    return false;
  end if;
  update private.email_outbox o
     set refs = coalesce(p_extra, '{}'::jsonb) || o.refs
                || jsonb_build_object(p_key, case when coalesce(o.refs -> p_key, '[]'::jsonb) @> jsonb_build_array(p_value)
                                                  then coalesce(o.refs -> p_key, '[]'::jsonb)
                                                  else coalesce(o.refs -> p_key, '[]'::jsonb) || jsonb_build_array(p_value) end)
   where o.id = v_id;
  return true;
end;
$$;

-- The name players know a game's place by: its turf's name, or the venue its host typed.
create or replace function private.email_venue_name(p_game public.games)
returns text language sql stable security definer set search_path = '' as $$
  select left(coalesce(nullif(btrim((select t.name::text from public.turfs t where t.id = p_game.turf_id)), ''),
                       nullif(btrim(p_game.venue_name), ''), 'the venue'), 60)
$$;

revoke all on function private.email_daily_cap() from public, anon, authenticated;
revoke all on function private.email_claim_max() from public, anon, authenticated;
revoke all on function private.email_max_attempts() from public, anon, authenticated;
revoke all on function private.email_backoff(int) from public, anon, authenticated;
revoke all on function private.email_collapse() from public, anon, authenticated;
revoke all on function private.game_clock_text(time) from public, anon, authenticated;
revoke all on function private.email_launch_at() from public, anon, authenticated;
revoke all on function private.email_group(text) from public, anon, authenticated;
revoke all on function private.email_kind_of(text) from public, anon, authenticated;
revoke all on function private.email_uuid(text) from public, anon, authenticated;
revoke all on function private.email_address(uuid) from public, anon, authenticated;
revoke all on function private.email_hash(text) from public, anon, authenticated;
revoke all on function private.email_suppressed(text) from public, anon, authenticated;
revoke all on function private.email_ok(uuid, text) from public, anon, authenticated;
revoke all on function private.email_queue(uuid, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function private.email_join(uuid, text, uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.email_venue_name(public.games) from public, anon, authenticated;

-- ── 3. Queueing: every new notification of the six kinds ──

-- After a notification is made: the email it makes, if any. Never blocks or fails the insert: any error is a
-- warning and the notification is made as before.
create or replace function private.email_on_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_m jsonb;
  v_game uuid;
  v_req uuid;
  v_change text;
  v_extra jsonb;
begin
  begin
    v_kind := private.email_kind_of(new.type);
    if v_kind is null or new.user_id is null then
      return null;
    end if;
    v_m := case when jsonb_typeof(new.metadata) = 'object' then new.metadata else '{}'::jsonb end;
    v_game := private.email_uuid(coalesce(nullif(v_m ->> 'gameId', ''), v_m ->> 'game_id'));
    if v_game is null then
      return null;
    end if;
    v_req := private.email_uuid(v_m ->> 'requestId');

    if v_kind in ('join_request', 'request_waiting') then
      -- One email per host and game: requests within 15 minutes join it. A new one waits 15 minutes (join_request).
      if v_req is null then
        return null;
      end if;
      if not private.email_join(new.user_id, v_kind, v_game, 'request_ids', to_jsonb(v_req::text)) then
        perform private.email_queue(new.user_id, v_kind, v_kind || ':' || new.id::text,
          jsonb_build_object('game_id', v_game, 'request_ids', jsonb_build_array(v_req::text)),
          now() + case when v_kind = 'join_request' then private.email_collapse() else interval '0 minutes' end);
      end if;

    elsif v_kind = 'game_changed' then
      -- The venue and the time in one save (or within 2 minutes): one email. The first "was" is kept.
      v_change := case when new.type = 'game_venue_changed' then 'venue' else 'time' end;
      v_extra := case when v_change = 'time'
                      then jsonb_strip_nulls(jsonb_build_object('from_date', v_m ->> 'fromDate', 'from_start', v_m ->> 'fromStartTime'))
                      else '{}'::jsonb end;
      if not private.email_join(new.user_id, 'game_changed', v_game, 'changes', to_jsonb(v_change), v_extra) then
        perform private.email_queue(new.user_id, 'game_changed', 'game_changed:' || new.id::text,
          v_extra || jsonb_build_object('game_id', v_game, 'changes', jsonb_build_array(v_change)),
          now() + interval '2 minutes');
      end if;

    elsif v_kind = 'game_cancelled' then
      -- Whatever was waiting to go to this person about the game is moot now.
      update private.email_outbox o
         set status = 'skipped', last_error = 'cancelled', lease_until = null
       where o.user_id = new.user_id
         and o.status = 'queued'
         and o.refs ->> 'game_id' = v_game::text;
      perform private.email_queue(new.user_id, 'game_cancelled', 'game_cancelled:' || v_game::text || ':' || new.user_id::text,
        jsonb_build_object('game_id', v_game));

    elsif v_kind = 'request_accepted' then
      perform private.email_queue(new.user_id, 'request_accepted', 'request_accepted:' || new.id::text,
        jsonb_strip_nulls(jsonb_build_object('game_id', v_game, 'request_id', v_req)));

    elsif v_kind = 'reminder' then
      perform private.email_queue(new.user_id, 'reminder', 'reminder:' || new.id::text,
        jsonb_strip_nulls(jsonb_build_object('game_id', v_game, 'when', v_m ->> 'when', 'start_at', v_m ->> 'startAt')));
    end if;
  exception when others then
    raise warning 'email: notification % not queued: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function private.email_on_notification() from public, anon, authenticated;

create or replace trigger notifications_email
  after insert on public.notifications
  for each row
  execute function private.email_on_notification();

-- ── 4. The clock: reminders, nudges, Welcome (every 5 minutes) ──

create or replace function private.email_clock(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_local constant timestamp := p_now at time zone 'Asia/Kolkata';
  v_launch constant timestamptz := private.email_launch_at();
  g record;
  p record;
  r record;
  v_kind text;
  v_kinds text[];
  v_starts timestamptz;
  v_key text;
  v_outcome text;
  v_place text;
  v_sport text;
  n_told integer := 0;
  n_skipped integer := 0;
  n_waiting integer := 0;
  n_welcome integer := 0;
begin
  -- One run at a time, even if a run overruns.
  if not pg_try_advisory_xact_lock(hashtext('private.email_clock')) then
    return jsonb_build_object('r', 'busy');
  end if;

  -- 1. Reminders: "tomorrow" from 6 PM India time the day before, "in about 3 hours" from 3 hours before the start
  --    (until 2.5 hours before). To the host and every player, each once; skipped for someone in the game less than
  --    an hour, and when the other reminder went to them less than an hour before.
  for g in
    select x.id, x.creator_id, x.created_at, x.sport, x.date, x.start_time, x.turf_id, x.venue_name,
           private.game_start_at(x.date, x.start_time) as starts
      from public.games x
     where coalesce(x.status, 'open') in ('open', 'full')
       and x.date between v_local::date and v_local::date + 1
  loop
    v_starts := g.starts;
    -- Both can be due at once (a game at 12:30 AM: "tomorrow" all evening, the other from 9:30 PM).
    v_kinds := array_remove(array[
                 case when g.date = v_local::date + 1 and v_local::time >= time '18:00' then 'tomorrow' end,
                 case when v_starts - interval '3 hours' <= p_now and v_starts - interval '150 minutes' > p_now then 'soon' end], null);
    continue when cardinality(v_kinds) = 0 or v_starts <= p_now;
    v_place := private.email_venue_name((select x from public.games x where x.id = g.id));
    v_sport := coalesce(nullif(btrim(g.sport), ''), 'Your game');
    foreach v_kind in array v_kinds loop
    for p in
      select y.user_id, min(y.at) as joined_at
        from (select pp.user_id, pp.joined_at as at from public.game_participants pp where pp.game_id = g.id
              union all
              select g.creator_id, g.created_at) y
       where y.user_id is not null
       group by y.user_id
    loop
      v_key := v_kind || ':' || g.id::text || ':' || p.user_id::text || ':' || extract(epoch from v_starts)::bigint::text;
      continue when exists (select 1 from private.game_alerts a where a.key = v_key);
      v_outcome := case
                     when coalesce(p.joined_at, '-infinity'::timestamptz) > p_now - interval '1 hour' then 'skipped_new'
                     when exists (select 1 from private.game_alerts a
                                   where a.user_id = p.user_id and a.game_id = g.id and a.kind in ('tomorrow', 'soon')
                                     and a.outcome = 'told' and a.at > p_now - interval '1 hour') then 'skipped_close'
                     else 'told'
                   end;
      insert into private.game_alerts (key, user_id, game_id, kind, outcome, at)
      values (v_key, p.user_id, g.id, v_kind, v_outcome, p_now)
      on conflict (key) do nothing;
      if not found then
        continue;
      end if;
      if v_outcome <> 'told' then
        n_skipped := n_skipped + 1;
        continue;
      end if;
      perform private.game_notify(p.user_id, 'game_reminder',
        case when v_kind = 'tomorrow' then 'Game tomorrow' else 'Game in about 3 hours' end,
        v_sport || case when v_kind = 'tomorrow' then ' tomorrow, ' || to_char(g.date, 'Dy FMDD Mon') || ', at ' else ' at ' end
          || private.game_clock_text(g.start_time) || ' at ' || v_place || '.',
        jsonb_build_object('gameId', g.id, 'when', v_kind, 'startAt', v_starts));
      n_told := n_told + 1;
    end loop;
    end loop;
  end loop;

  -- 2. A join request still waiting: 2 hours after it was sent, or 30 minutes once the game starts within 3 hours;
  --    never once the game has started. Requests sent before this file ran are left alone.
  for r in
    select q.id as request_id, q.created_at, q.requester_name, x.id as game_id, x.creator_id, x.sport, x.date
      from public.game_requests q
      join public.games x on x.id = q.game_id
     where q.status = 'pending'
       and q.created_at >= v_launch
       and q.created_at > p_now - interval '7 days'
       and coalesce(x.status, 'open') in ('open', 'full')
       and x.creator_id is not null
       and q.user_id is distinct from x.creator_id
       and private.game_start_at(x.date, x.start_time) > p_now
       and (q.created_at <= p_now - interval '2 hours'
            or (q.created_at <= p_now - interval '30 minutes'
                and private.game_start_at(x.date, x.start_time) <= p_now + interval '3 hours'))
  loop
    v_key := 'waiting:' || r.request_id::text || ':' || extract(epoch from r.created_at)::bigint::text;
    insert into private.game_alerts (key, user_id, game_id, kind, outcome, at)
    values (v_key, r.creator_id, r.game_id, 'waiting', 'told', p_now)
    on conflict (key) do nothing;
    if found then
      perform private.game_notify(r.creator_id, 'game_request_waiting', 'Join request waiting',
        left(coalesce(nullif(btrim(r.requester_name::text), ''), 'A player'), 60) || ' is still waiting to hear from you about '
          || coalesce(nullif(btrim(r.sport), ''), 'your game') || ' on ' || to_char(r.date, 'Dy FMDD Mon') || '. Accept or decline on the game page.',
        jsonb_build_object('gameId', r.game_id, 'requestId', r.request_id));
      n_waiting := n_waiting + 1;
    end if;
  end loop;

  -- 3. Welcome: accounts made after this file ran (in the last 3 days, so one that confirms its email a day later gets it too).
  for r in
    select u.id
      from public.users u
     where u.created_at > v_launch
       and u.created_at > p_now - interval '3 days'
       and u.created_at <= p_now
       and not exists (select 1 from private.email_outbox o where o.dedupe_key = 'welcome:' || u.id::text)
  loop
    if private.email_queue(r.id, 'welcome', 'welcome:' || r.id::text, '{}'::jsonb) is not null then
      n_welcome := n_welcome + 1;
    end if;
  end loop;

  return jsonb_build_object('r', 'ok', 'reminders', n_told, 'skipped', n_skipped, 'waiting', n_waiting, 'welcome', n_welcome);
end;
$$;
revoke all on function private.email_clock(timestamptz) from public, anon, authenticated;

-- ── 5. The flush: ask the app to send, only when an email is due (every minute) ──

create or replace function private.email_flush(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_url constant text := 'https://www.tapturf.in/api/email/dispatch';
  v_state private.email_flush_state;
  v_due integer;
  v_secret text;
  v_req bigint;
  n_back integer;
  n_expired integer;
begin
  if not pg_try_advisory_xact_lock(hashtext('private.email_flush')) then
    return jsonb_build_object('r', 'busy');
  end if;

  -- 1. A send whose lease ran out (the route stopped part way): again after its wait, or failed after the 5th try.
  --    Resend sends one email per outbox id (the Idempotency-Key), so a send that did go out is not doubled.
  update private.email_outbox o
     set status = case when o.attempts >= private.email_max_attempts() then 'failed' else 'queued' end,
         next_attempt_at = p_now + private.email_backoff(o.attempts),
         lease_until = null,
         last_error = 'lease ran out'
   where o.status = 'sending'
     and o.lease_until < p_now;
  get diagnostics n_back = row_count;

  -- 2. Queued for over 24 hours: never sent late.
  update private.email_outbox o
     set status = 'expired', last_error = coalesce(o.last_error, 'not sent within 24 hours')
   where o.status = 'queued'
     and o.created_at < p_now - interval '24 hours';
  get diagnostics n_expired = row_count;

  -- 3. Nothing due: nothing is called.
  select count(*) into v_due from private.email_outbox o where o.status = 'queued' and o.next_attempt_at <= p_now;
  if v_due = 0 then
    return jsonb_build_object('r', 'idle', 'back', n_back, 'expired', n_expired);
  end if;

  select * into v_state from private.email_flush_state s where s.id for update;
  -- The route said it can't send yet (no Resend key): wait.
  if v_state.hold_until is not null and v_state.hold_until > p_now then
    return jsonb_build_object('r', 'held', 'due', v_due);
  end if;
  -- The last post was not answered yet (no claim since): again 10 minutes on at the earliest.
  if v_state.last_poke_at is not null
     and v_state.last_poke_at > p_now - interval '10 minutes'
     and v_state.last_poke_at > coalesce(v_state.last_claim_at, '-infinity'::timestamptz) then
    return jsonb_build_object('r', 'waiting', 'due', v_due);
  end if;

  v_secret := (select s.value from private.app_secrets s where s.name = 'revalidate');
  if v_secret is null then
    raise warning 'email_flush: no revalidate secret in private.app_secrets';
    return jsonb_build_object('r', 'no_secret', 'due', v_due);
  end if;
  begin
    v_req := net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-revalidate-secret', v_secret),
      body := jsonb_build_object('due', v_due),
      timeout_milliseconds := 60000
    );
  exception when others then
    raise warning 'email_flush: could not post: %', sqlerrm;
    return jsonb_build_object('r', 'no_post', 'due', v_due);
  end;
  update private.email_flush_state s set last_poke_at = p_now, last_poke_id = v_req where s.id;
  return jsonb_build_object('r', 'posted', 'due', v_due);
end;
$$;
revoke all on function private.email_flush(timestamptz) from public, anon, authenticated;

-- ── 6. What one email says, read when it is sent ───────────

-- The email for an outbox row, with everything its template needs, or {skip: why} when it should not go:
-- no_address, suppressed, off, gone, closed, started, cancelled, answered, not_in, moved, no_change.
create or replace function private.email_job(p_row private.email_outbox)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_to text := private.email_address(p_row.user_id);
  v_name text;
  v_game public.games;
  v_starts timestamptz;
  v_requests jsonb;
  v_turf record;
  v_players integer;
begin
  if v_to is null then
    return jsonb_build_object('skip', 'no_address');
  end if;
  if private.email_suppressed(v_to) then
    return jsonb_build_object('skip', 'suppressed');
  end if;
  if not private.email_ok(p_row.user_id, p_row.kind) then
    return jsonb_build_object('skip', 'off');
  end if;
  select left(nullif(split_part(btrim(coalesce(u.name::text, '')), ' ', 1), ''), 40) into v_name from public.users u where u.id = p_row.user_id;

  if p_row.kind = 'welcome' then
    return jsonb_build_object('id', p_row.id, 'kind', p_row.kind, 'group', 'account', 'user_id', p_row.user_id,
                              'to', v_to, 'name', v_name, 'path', '/games');
  end if;

  select * into v_game from public.games x where x.id = private.email_uuid(p_row.refs ->> 'game_id');
  if not found then
    return jsonb_build_object('skip', 'gone');
  end if;
  v_starts := private.game_start_at(v_game.date, v_game.start_time);
  if p_row.kind = 'game_cancelled' then
    if v_game.status is distinct from 'cancelled' then
      return jsonb_build_object('skip', 'gone');
    end if;
  else
    if v_game.status = 'cancelled' then
      return jsonb_build_object('skip', 'cancelled');
    end if;
    if coalesce(v_game.status, 'open') not in ('open', 'full') then
      return jsonb_build_object('skip', 'closed');
    end if;
    if v_starts <= now() then
      return jsonb_build_object('skip', 'started');
    end if;
  end if;

  if p_row.kind in ('join_request', 'request_waiting') then
    -- Only the requests still waiting for the host's answer.
    select jsonb_agg(jsonb_build_object('name', left(coalesce(nullif(btrim(q.requester_name::text), ''), 'A player'), 60)) order by q.created_at)
      into v_requests
      from public.game_requests q
     where q.game_id = v_game.id
       and q.status = 'pending'
       and q.id in (select private.email_uuid(e) from jsonb_array_elements_text(coalesce(p_row.refs -> 'request_ids', '[]'::jsonb)) e);
    if v_requests is null then
      return jsonb_build_object('skip', 'answered');
    end if;
  elsif p_row.kind = 'request_accepted' then
    if not exists (select 1 from public.game_participants pp where pp.game_id = v_game.id and pp.user_id = p_row.user_id) then
      return jsonb_build_object('skip', 'not_in');
    end if;
  elsif p_row.kind = 'reminder' then
    if p_row.refs ? 'start_at' and (p_row.refs ->> 'start_at')::timestamptz is distinct from v_starts then
      return jsonb_build_object('skip', 'moved');
    end if;
  elsif p_row.kind = 'game_changed' then
    -- Only the time, and it is back to what it was: nothing changed.
    if not (p_row.refs -> 'changes' @> '["venue"]'::jsonb)
       and p_row.refs ->> 'from_date' = v_game.date::text
       and p_row.refs ->> 'from_start' = to_char(v_game.start_time, 'HH24:MI') then
      return jsonb_build_object('skip', 'no_change');
    end if;
  end if;

  select t.name::text as name, t.area::text as area, t.city::text as city, t.address::text as address, t.lat, t.lng, t.slug::text as slug
    into v_turf
    from public.turfs t
   where t.id = v_game.turf_id;
  select count(*) into v_players from public.game_participants pp where pp.game_id = v_game.id;

  return jsonb_build_object(
    'id', p_row.id,
    'kind', p_row.kind,
    'group', private.email_group(p_row.kind),
    'user_id', p_row.user_id,
    'to', v_to,
    'name', v_name,
    'you_host', v_game.creator_id is not distinct from p_row.user_id,
    'game', jsonb_build_object(
      'id', v_game.id,
      'sport', v_game.sport,
      'date', v_game.date,
      'start_time', to_char(v_game.start_time, 'HH24:MI'),
      'end_time', to_char(v_game.end_time, 'HH24:MI'),
      'price_per_player', v_game.price_per_player,
      'status', v_game.status,
      'host_first', left(nullif(split_part(btrim(coalesce(v_game.host_name, '')), ' ', 1), ''), 40),
      'players', v_players,
      'max_players', v_game.max_players,
      'venue', jsonb_build_object(
        'name', left(coalesce(nullif(btrim(v_turf.name), ''), nullif(btrim(v_game.venue_name), '')), 80),
        'area', coalesce(nullif(btrim(v_turf.area), ''), nullif(btrim(v_game.venue_area), '')),
        'city', coalesce(nullif(btrim(v_turf.city), ''), nullif(btrim(v_game.venue_city), '')),
        'address', left(coalesce(nullif(btrim(v_turf.address), ''), nullif(btrim(v_game.venue_address), '')), 200),
        'lat', v_turf.lat,
        'lng', v_turf.lng,
        'maps_url', v_game.venue_maps_url,
        'turf_slug', v_turf.slug)),
    'when', p_row.refs ->> 'when',
    'requests', coalesce(v_requests, '[]'::jsonb),
    'changes', coalesce(p_row.refs -> 'changes', '[]'::jsonb),
    'from', jsonb_strip_nulls(jsonb_build_object('date', p_row.refs ->> 'from_date', 'start_time', p_row.refs ->> 'from_start')),
    'path', '/game/' || v_game.id::text);
end;
$$;
revoke all on function private.email_job(private.email_outbox) from public, anon, authenticated;

-- ── 7. The sender (server key; called only by lib/email/server.ts) ──

-- Lease up to p_limit (at most 20) due emails for 5 minutes, with what each says; the ones that should not go
-- become skipped (with why). {r: ok, jobs, skipped, more} or r: unavailable.
create or replace function public.email_claim(p_key text, p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.email_outbox;
  v_job jsonb;
  v_jobs jsonb := '[]'::jsonb;
  v_skipped integer := 0;
  v_limit constant integer := least(greatest(coalesce(p_limit, 20), 1), private.email_claim_max());
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  -- The route answered: the flush may post again, and a hold is over.
  update private.email_flush_state s set last_claim_at = now(), hold_until = null, hold_reason = null where s.id;
  for v_row in
    select * from private.email_outbox o
     where o.status = 'queued' and o.next_attempt_at <= now()
     order by o.next_attempt_at, o.created_at
     limit v_limit
       for update skip locked
  loop
    v_job := private.email_job(v_row);
    if v_job ? 'skip' then
      update private.email_outbox o set status = 'skipped', last_error = v_job ->> 'skip', lease_until = null where o.id = v_row.id;
      v_skipped := v_skipped + 1;
    else
      update private.email_outbox o
         set status = 'sending', attempts = o.attempts + 1, lease_until = now() + interval '5 minutes'
       where o.id = v_row.id;
      v_jobs := v_jobs || jsonb_build_array(v_job || jsonb_build_object('attempt', v_row.attempts + 1));
    end if;
  end loop;
  return jsonb_build_object('r', 'ok', 'jobs', v_jobs, 'skipped', v_skipped,
    'more', exists (select 1 from private.email_outbox o where o.status = 'queued' and o.next_attempt_at <= now()));
end;
$$;

-- What Resend answered for each leased email: [{id, result: sent | retry | failed, provider_id?, error?}], 50 at most.
-- sent: done; failed: never tried again; retry: again in 1, 5, 30, 120 minutes, failed after the 5th try.
-- Only rows still leased (sending) change. {r: ok, sent, retry, failed} or r: unavailable, bad.
create or replace function public.email_report(p_key text, p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent integer;
  v_retry integer;
  v_failed integer;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_results is null or jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) > 50 then
    return jsonb_build_object('r', 'bad');
  end if;
  with res as (
    select distinct on (private.email_uuid(e.value ->> 'id'))
           private.email_uuid(e.value ->> 'id') as id,
           e.value ->> 'result' as result,
           left(nullif(btrim(e.value ->> 'provider_id'), ''), 100) as provider_id,
           left(nullif(btrim(e.value ->> 'error'), ''), 300) as error
      from jsonb_array_elements(p_results) e
     where jsonb_typeof(e.value) = 'object'
       and private.email_uuid(e.value ->> 'id') is not null
       and e.value ->> 'result' in ('sent', 'retry', 'failed')
  ), done as (
    update private.email_outbox o
       set status = case when r.result = 'sent' then 'sent'
                         when r.result = 'failed' or o.attempts >= private.email_max_attempts() then 'failed'
                         else 'queued' end,
           sent_at = case when r.result = 'sent' then now() else o.sent_at end,
           provider_id = case when r.result = 'sent' then r.provider_id else o.provider_id end,
           last_error = case when r.result = 'sent' then null else coalesce(r.error, 'send failed') end,
           next_attempt_at = case when r.result = 'retry' then now() + private.email_backoff(o.attempts) else o.next_attempt_at end,
           lease_until = null
      from res r
     where o.id = r.id
       and o.status = 'sending'
    returning o.status
  )
  select count(*) filter (where d.status = 'sent'), count(*) filter (where d.status = 'queued'), count(*) filter (where d.status = 'failed')
    into v_sent, v_retry, v_failed
    from done d;
  return jsonb_build_object('r', 'ok', 'sent', v_sent, 'retry', v_retry, 'failed', v_failed);
end;
$$;

-- The route can't send yet (no Resend key, not production): the flush waits 30 minutes before posting again.
create or replace function public.email_hold(p_key text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  update private.email_flush_state s
     set hold_until = now() + interval '30 minutes',
         hold_reason = left(coalesce(nullif(btrim(p_reason), ''), 'not configured'), 40),
         last_claim_at = now()
   where s.id;
  return jsonb_build_object('r', 'ok');
end;
$$;

revoke all on function public.email_claim(text, integer) from public;
revoke all on function public.email_report(text, jsonb) from public;
revoke all on function public.email_hold(text, text) from public;
grant execute on function public.email_claim(text, integer) to anon, authenticated;
grant execute on function public.email_report(text, jsonb) to anon, authenticated;
grant execute on function public.email_hold(text, text) to anon, authenticated;

-- ── 8. The account's own switches (server key; the verified caller) ──

-- The Me tab's Emails block: the account's own confirmed address (or null), whether it bounced, the three switches.
-- {r: ok, email, suppressed, requests, changes, reminders, all_off} or r: unavailable, bad.
create or replace function public.email_prefs_get(p_key text, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_addr text;
  v_p private.email_prefs;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  v_addr := private.email_address(p_user_id);
  select * into v_p from private.email_prefs x where x.user_id = p_user_id;
  return jsonb_build_object('r', 'ok',
    'email', v_addr,
    'suppressed', private.email_suppressed(v_addr),
    'requests', coalesce(v_p.requests, true),
    'changes', coalesce(v_p.changes, true),
    'reminders', coalesce(v_p.reminders, true),
    'all_off', v_p.unsubscribed_all_at is not null);
end;
$$;

-- Change any of the three switches (null: as it is). Turning one on undoes "all off". Answers as email_prefs_get.
create or replace function public.email_prefs_set(p_key text, p_user_id uuid, p_requests boolean default null, p_changes boolean default null, p_reminders boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or not exists (select 1 from public.users u where u.id = p_user_id)
     or (p_requests is null and p_changes is null and p_reminders is null) then
    return jsonb_build_object('r', 'bad');
  end if;
  insert into private.email_prefs as x (user_id, requests, changes, reminders)
  values (p_user_id, coalesce(p_requests, true), coalesce(p_changes, true), coalesce(p_reminders, true))
  on conflict (user_id) do update
     set requests = coalesce(p_requests, x.requests),
         changes = coalesce(p_changes, x.changes),
         reminders = coalesce(p_reminders, x.reminders),
         unsubscribed_all_at = case when coalesce(p_requests, false) or coalesce(p_changes, false) or coalesce(p_reminders, false)
                                    then null else x.unsubscribed_all_at end,
         updated_at = now();
  return public.email_prefs_get(p_key, p_user_id);
end;
$$;

-- The link in an email (the app checked its signature): one group off, or all of them (Welcome's link).
-- {r: ok, group} or r: unavailable, bad.
create or replace function public.email_unsubscribe(p_key text, p_user_id uuid, p_group text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_group is null or p_group not in ('requests', 'changes', 'reminders', 'all')
     or not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  insert into private.email_prefs as x (user_id, requests, changes, reminders, unsubscribed_all_at)
  values (p_user_id, p_group not in ('requests', 'all'), p_group not in ('changes', 'all'), p_group not in ('reminders', 'all'),
          case when p_group = 'all' then now() end)
  on conflict (user_id) do update
     set requests = x.requests and p_group not in ('requests', 'all'),
         changes = x.changes and p_group not in ('changes', 'all'),
         reminders = x.reminders and p_group not in ('reminders', 'all'),
         unsubscribed_all_at = case when p_group = 'all' then coalesce(x.unsubscribed_all_at, now()) else x.unsubscribed_all_at end,
         updated_at = now();
  return jsonb_build_object('r', 'ok', 'group', p_group);
end;
$$;

-- Resend's webhook: this address bounced or complained; it is never emailed again. {r: ok} or r: unavailable, bad.
create or replace function public.email_suppress(p_key text, p_address text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_reason is null or p_reason not in ('bounce', 'complaint')
     or p_address is null or char_length(btrim(p_address)) not between 3 and 254 or position('@' in p_address) = 0 then
    return jsonb_build_object('r', 'bad');
  end if;
  insert into private.email_suppressions as s (address_hash, user_id, reason)
  values (private.email_hash(p_address),
          (select u.id from public.users u where u.email is not null and lower(btrim(u.email::text)) = lower(btrim(p_address)) limit 1),
          p_reason)
  on conflict (address_hash) do update
     set reason = case when excluded.reason = 'complaint' then 'complaint' else s.reason end;
  return jsonb_build_object('r', 'ok');
end;
$$;

revoke all on function public.email_prefs_get(text, uuid) from public;
revoke all on function public.email_prefs_set(text, uuid, boolean, boolean, boolean) from public;
revoke all on function public.email_unsubscribe(text, uuid, text) from public;
revoke all on function public.email_suppress(text, text, text) from public;
grant execute on function public.email_prefs_get(text, uuid) to anon, authenticated;
grant execute on function public.email_prefs_set(text, uuid, boolean, boolean, boolean) to anon, authenticated;
grant execute on function public.email_unsubscribe(text, uuid, text) to anon, authenticated;
grant execute on function public.email_suppress(text, text, text) to anon, authenticated;

-- ── 9. game_update: the date or start time changed (game_time_changed) ──

-- The host's edit sheet: production's body (20261103_game_other_venue.sql, md5(prosrc)
-- 2b3c117ecacd890462f3243d210d30b0 read 10 Nov 2026) plus only v_host and the block that tells
-- the players and the pending or accepted requests (as a move does, never the host) when the
-- date or the start time changes: "Asha moved Football to Sat 15 Nov, 7 PM." (game_time_changed,
-- with the new and the old date and time). The answer is as before.
create or replace function public.game_update(p_key text, p_user_id uuid, p_game_id uuid, p_changes jsonb, p_move_notice jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.games;
  v_row public.games;
  v_bad text;
  v_date date;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_players integer;
  v_turf uuid;
  v_moved boolean := false;
  v_title text;
  v_message text;
  v_notified integer := 0;
  v_venue boolean := false;
  v_name text;
  v_address text;
  v_area text;
  v_city text;
  v_maps text;
  v_host text;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_game_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  v_bad := private.game_field_problem(p_changes, array['date', 'start_time', 'end_time', 'max_players', 'price_per_player', 'description',
                                                       'turf_booked', 'skill_level', 'turf_id',
                                                       'venue_name', 'venue_address', 'venue_area', 'venue_city', 'venue_maps_url']);
  if v_bad is null then
    v_bad := private.game_venue_problem(p_changes);
  end if;
  if v_bad is not null then
    return jsonb_build_object('r', 'bad', 'field', v_bad);
  end if;
  v_venue := p_changes ?| array['venue_name', 'venue_address', 'venue_area', 'venue_city', 'venue_maps_url'];
  select * into v_old from public.games g where g.id = p_game_id for update;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if v_old.creator_id is distinct from p_user_id then
    return jsonb_build_object('r', 'not_host');
  end if;
  if coalesce(v_old.status, 'open') not in ('open', 'full') then
    return jsonb_build_object('r', 'closed');
  end if;
  if p_changes ? 'date' then
    v_date := (p_changes ->> 'date')::date;
    if v_date is distinct from v_old.date and (v_date < v_today or v_date > v_today + 365) then
      return jsonb_build_object('r', 'bad', 'field', 'date');
    end if;
  end if;
  select count(*) into v_players from public.game_participants p where p.game_id = p_game_id;
  if p_changes ? 'max_players' and (p_changes ->> 'max_players')::integer < v_players then
    return jsonb_build_object('r', 'too_few', 'players', v_players);
  end if;
  if p_changes ? 'turf_id' then
    v_turf := (p_changes ->> 'turf_id')::uuid;
    if v_turf is distinct from v_old.turf_id then
      if not exists (select 1 from public.turfs t where t.id = v_turf and t.is_active is true) then
        return jsonb_build_object('r', 'venue');
      end if;
      v_moved := true;
    end if;
  end if;
  if v_venue then
    v_name := private.game_venue_text(p_changes ->> 'venue_name');
    v_address := private.game_venue_text(p_changes ->> 'venue_address');
    v_area := nullif(private.game_venue_text(p_changes ->> 'venue_area'), '');
    v_city := private.game_venue_text(p_changes ->> 'venue_city');
    v_maps := nullif(private.game_venue_text(p_changes ->> 'venue_maps_url'), '');
    -- Off its turf, or another place: a move. Only the area or the map link: an edit, no one told.
    v_moved := v_old.turf_id is not null
               or (lower(v_name), lower(v_address), lower(v_city)) is distinct from (lower(v_old.venue_name), lower(v_old.venue_address), lower(v_old.venue_city));
  end if;
  update public.games g
     set date = coalesce(v_date, g.date),
         start_time = coalesce((p_changes ->> 'start_time')::time, g.start_time),
         end_time = coalesce((p_changes ->> 'end_time')::time, g.end_time),
         max_players = coalesce((p_changes ->> 'max_players')::integer, g.max_players),
         price_per_player = coalesce((p_changes ->> 'price_per_player')::numeric, g.price_per_player),
         description = case when p_changes ? 'description' then nullif(btrim(p_changes ->> 'description'), '') else g.description end,
         turf_booked = coalesce((p_changes ->> 'turf_booked')::boolean, g.turf_booked),
         skill_level = coalesce(p_changes ->> 'skill_level', g.skill_level),
         turf_id = case when v_venue then null when v_moved then v_turf else g.turf_id end,
         venue_name = case when v_venue then v_name when v_moved then null else g.venue_name end,
         venue_address = case when v_venue then v_address when v_moved then null else g.venue_address end,
         venue_area = case when v_venue then v_area when v_moved then null else g.venue_area end,
         venue_city = case when v_venue then v_city when v_moved then null else g.venue_city end,
         venue_maps_url = case when v_venue then v_maps when v_moved then null else g.venue_maps_url end,
         current_players = case when v_players > 0 then v_players else g.current_players end,
         updated_at = now()
   where g.id = p_game_id
  returning * into v_row;
  if v_moved then
    v_title := coalesce(nullif(left(btrim(p_move_notice ->> 'title'), 80), ''), 'Venue changed');
    v_message := nullif(left(btrim(p_move_notice ->> 'message'), 300), '');
    if v_message is null then
      v_message := 'Your game moved to ' || coalesce(case when v_venue then v_name else (select btrim(t.name::text) from public.turfs t where t.id = v_turf) end, 'another venue');
    end if;
    with told as (
      select p.user_id from public.game_participants p where p.game_id = p_game_id
      union
      select r.user_id from public.game_requests r where r.game_id = p_game_id and r.status in ('pending', 'accepted')
    )
    insert into public.notifications (user_id, type, title, message, metadata, is_read)
    select t.user_id, 'game_venue_changed', v_title, v_message,
           jsonb_build_object('gameId', p_game_id, 'turfId', v_turf, 'fromTurfId', v_old.turf_id), false
      from told t
     where t.user_id is not null and t.user_id is distinct from v_old.creator_id;
    get diagnostics v_notified = row_count;
  end if;
  -- 20261110_email.sql: a new date or start time tells the people a move tells (game_time_changed), never the host.
  if v_row.date is distinct from v_old.date or v_row.start_time is distinct from v_old.start_time then
    v_host := nullif(split_part(btrim(coalesce(v_old.host_name, '')), ' ', 1), '');
    with told as (
      select p.user_id from public.game_participants p where p.game_id = p_game_id
      union
      select r.user_id from public.game_requests r where r.game_id = p_game_id and r.status in ('pending', 'accepted')
    )
    insert into public.notifications (user_id, type, title, message, metadata, is_read)
    select t.user_id, 'game_time_changed', 'Game time changed',
           coalesce(v_host, 'Your host') || ' moved ' || coalesce(nullif(btrim(v_row.sport), ''), 'the game') || ' to '
             || to_char(v_row.date, 'Dy FMDD Mon') || ', ' || private.game_clock_text(v_row.start_time) || '.',
           jsonb_build_object('gameId', p_game_id, 'date', v_row.date, 'startTime', to_char(v_row.start_time, 'HH24:MI'),
                              'fromDate', v_old.date, 'fromStartTime', to_char(v_old.start_time, 'HH24:MI')), false
      from told t
     where t.user_id is not null and t.user_id is distinct from v_old.creator_id;
  end if;
  return jsonb_build_object('r', 'ok', 'game', to_jsonb(v_row), 'notified', v_notified);
end;
$$;
revoke all on function public.game_update(text, uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.game_update(text, uuid, uuid, jsonb, jsonb) to anon, authenticated;

-- ── 10. The jobs ───────────────────────────────────────────

select cron.schedule('email-clock', '*/5 * * * *', 'select private.email_clock()');
select cron.schedule('email-flush', '* * * * *', 'select private.email_flush()');
