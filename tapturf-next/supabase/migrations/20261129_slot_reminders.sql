set local lock_timeout = '5s';

-- Slot reminders. The site owner asked (27 Nov 2026): "can we set up some
-- email reminders to owners to update their slots? maybe every 2 days if
-- they havent done it already".
--
-- Why: players see a turf's free hours only for 24 hours after its owner's
-- last tap or All correct on myTapturf (Free slots,
-- 20261105_turf_availability.sql). On 27 Nov 2026 production had 12 claimed
-- turfs, 5 that had ever marked slots, and none updated in the last 24
-- hours, so no player saw a free hour anywhere.
--
-- What it does: one more email, built on the emails that are there
-- (20261110_email.sql: the outbox, the mode, suppressions, the 6 a day
-- cap, the Google-confirmed address, the send route), never beside them.
--   * To whom: an account (public.users.id) that holds an active claim
--     (public.turf_owners.status = 'active', any role, where user_id is the
--     account, or, for a claim from before claims named the account, where
--     its key opens the account now, private.account_for_key: the two arms
--     of private.slots_guard's own test, so exactly the accounts that may
--     mark slots, and never the site owner's admin shortcut, which holds no
--     claim row) made 48 hours ago or more, on a turf that is listed
--     (is_active), claimed, and whose page has a number to call or
--     WhatsApp (private.turf_page_has_number, the twin of
--     lib/utils/contact.ts hasUsableContact, which lib/my/numbers.ts
--     pageHasNumber and the Free slots editor read; both run against
--     lib/my/pageNumber.cases.json).
--   * About what: each such turf whose slots were last updated 48 hours ago
--     or more (private.turf_availability.updated_at), or never. One email
--     per account, listing its turfs that need an update (the first 5 by
--     name, and how many more).
--   * When: a daily job at 9:00 AM India time (pg_cron 'slot-reminders',
--     '30 3 * * *' in UTC, as every job here; private.slot_reminders_run
--     refuses to queue at any other India hour). At most one reminder per
--     account every 2 days: none while one was queued today or yesterday in
--     India (calendar days, so a job that fires a second early or late
--     never slips a day). An owner who updates within the 48 hours gets
--     nothing.
--   * It stops by itself: after 5 reminders in a row with no update, no
--     more are queued until one of the turfs it is about is next updated;
--     then the count starts again. "In a row" counts the reminders queued
--     or sent (never one skipped, failed or expired) since the latest
--     update of any turf that needs one now. The 5th says it is the last.
--   * As every email: only to an address Google confirmed
--     (private.email_address), never one that bounced or complained
--     (private.email_suppressed), within the 6 a day cap
--     (private.email_daily_cap), and by the mode when it comes due (off:
--     skipped as mode_off; owner_only: skipped as test_mode for everyone
--     but the site owner's accounts; never sent later). The every-minute
--     email-flush job posts to the send route when one is due, as for any
--     other email; nothing new runs every minute.
--   * Its own switch: private.email_prefs.slots (new column, default on).
--     Off on the Me tab ("Reminders to update your free slots"), on
--     myTapturf's Slots tab, or with the link in the email
--     (public.slot_reminder_pref_set). "All TapTurf emails" off turns it
--     off too (the new trigger on private.email_prefs; rows already all off
--     are set off once below).
--   * What the email says is read when it is sent
--     (private.slot_reminder_job): the turfs that still need an update
--     then, each with its name, when it was last updated and how many times
--     players asked for a slot there in the last 7 India days
--     (private.slot_asks, the same count public.owner_slot_asks gives
--     myTapturf's Analytics tab for 7 days). Skipped with why: off (the
--     switch), updated (nothing needs an update any more), late (queued
--     over 12 hours ago: never sent at night).
--
-- What is stored: one boolean per account that ever changed an email
-- switch (private.email_prefs.slots), and one private.email_outbox row per
-- reminder, as for every email: the account, when, what became of it, and
-- refs {"about": "slots", "n": which reminder in a row, "last": true on
-- the 5th, "turf_ids": [...]}. Never an address, a name or a number. No
-- new table, so no new foreign key (none to public.users, as before), no
-- new row level security to set and no new grant. On an account erasure
-- its private.email_outbox and private.email_prefs rows are cleared by
-- hand, as CLAUDE.md already says.
--
-- The outbox row's kind: private.email_outbox.kind has a check that names
-- seven kinds, and widening a check means taking the old one out, which
-- this file may not do. So a slot reminder is kept as kind 'reminder' with
-- refs ->> 'about' = 'slots' and a dedupe_key that starts
-- 'slot_reminder:'. Everything a person or the app sees calls it
-- slot_reminder (the job private.slot_reminder_job hands the route, the
-- template, the Resend tag) with its own group, 'slots'. No reader of the
-- outbox tells kinds apart except private.email_job, below.
--
-- Constants (immutable; their twins are in lib/email/slotReminder.ts, and
-- scripts/sql-tests/slot_reminders.check.mjs compares the two):
--   private.slot_reminder_every_days()  2   EVERY_DAYS
--   private.slot_reminder_stale_hours() 48  STALE_HOURS
--   private.slot_reminder_max()         5   MAX_IN_A_ROW
--   private.slot_reminder_hour()        9   SEND_HOUR_IST
--   private.slot_reminder_asks_days()   7   ASKS_DAYS
--   private.slot_reminder_turfs_max()   5   TURFS_MAX
--   private.slot_reminder_late_hours()  12  LATE_HOURS
--
-- Replaced: one function, because email_claim hands every outbox row to it
-- and nothing else can say what a row's email is:
--   private.email_job(private.email_outbox)
--     started from  feab784127f6a3419570da5d51f14904  20261117_game_confirmed.sql
--     becomes       cbb5e19cae817c2ca3d04a683b858f0e
--     That body, every line in order, plus one block of 4 lines after the
--     suppressed check and before the switches' check: a row that is a
--     slot reminder is answered by private.slot_reminder_job. Nothing else
--     in it changes, so every other email is written as before.
--   Compare with production before applying:
--     select md5(p.prosrc) from pg_proc p
--      where p.oid = 'private.email_job(private.email_outbox)'::regprocedure;
--   The guard below refuses to run unless that is one of the two md5s
--   above (the first: not applied yet; the second: applied before).
-- Not replaced: private.email_ok, private.email_group, private.email_kind_of,
-- private.email_queue, public.email_claim, public.email_prefs_get,
-- public.email_prefs_set, public.email_unsubscribe and every other email
-- function are as they were.
--
-- Called here and left as they are (md5(prosrc) of each one's latest body
-- in the repo's migrations; not read from production for this file, so
-- compare: select p.proname, md5(p.prosrc) from pg_proc p join pg_namespace n
-- on n.oid = p.pronamespace where n.nspname = 'private' and p.proname in
-- ('email_address', 'email_suppressed', 'email_mode_skip', 'email_daily_cap',
-- 'account_key_ok', 'account_for_key', 'call_phone10', 'slots_guard')):
--   private.email_address    c39f0b86bb20df60ae95efdd9f39e615  20261110_email.sql
--   private.email_suppressed 3c49df919eec2caa7dd73ed4f5fa3cdb  20261110_email.sql
--   private.email_mode_skip  b67133e3527bbfad32e471894346aef6  20261110_email.sql
--   private.email_daily_cap  244acbf1da9865df330498e58154a601  20261110_email.sql
--   private.account_key_ok   ca605fa89a97497134b690e753dc5c0e  20261021_accounts_usernames.sql
--   private.account_for_key  a37bb5437bca089d3ed548a6b147fe54  20261026_account_links.sql
--   private.call_phone10     39ff2103934db028dbb7a5981850f738  20261028_owner_call_number.sql
-- and the rule this file follows without calling it (a change to it means
-- a change to private.slot_reminder_turfs):
--   private.slots_guard      4ecdf11ccc22bfbed25b7cc4b93e5486  20261105_turf_availability.sql
--
-- New functions (private; nobody but their owner may call them):
--   slot_reminder_every_days(), slot_reminder_stale_hours(),
--   slot_reminder_max(), slot_reminder_hour(), slot_reminder_asks_days(),
--   slot_reminder_turfs_max(), slot_reminder_late_hours(),
--   turf_page_has_number(owner_phone, contact_info, landline_phone,
--   whatsapp_phone), slot_reminder_on(user), slot_reminder_turfs(user, now),
--   slot_reminder_count(user, since), slot_reminders_run(now),
--   slot_reminder_job(row, address), email_prefs_all_off() (the trigger).
-- New public functions (server key; EXECUTE to anon and authenticated as
-- the other email functions, the key is the gate):
--   slot_reminder_pref(p_key, p_user_id)           {r: ok, owner, slots}
--   slot_reminder_pref_set(p_key, p_user_id, p_on) the same answer
--
-- To stop it by hand, any of:
--   the job:  select cron.alter_job((select j.jobid from cron.job j
--             where j.jobname = 'slot-reminders'), active := false);
--   the sends alone: the admin's Emails card, Off (stops every email).
--   one account: update private.email_prefs set slots = false where user_id = ...;
-- To undo by hand without taking any row away: stop the job as above;
-- put private.email_job back by running its "create or replace function"
-- from 20261117_game_confirmed.sql (a slot reminder still queued is then
-- skipped as gone, never sent); switch the trigger off with
--   alter table private.email_prefs disable trigger email_prefs_all_off;
-- and take the two public functions away from the app with
--   revoke execute on function public.slot_reminder_pref(text, uuid) from anon, authenticated;
--   revoke execute on function public.slot_reminder_pref_set(text, uuid, boolean) from anon, authenticated;
-- The column, the outbox rows and the helper functions can stay: nothing
-- reads them then.
--
-- Needs 20261019_mytapturf.sql, 20261025_claims_account.sql,
-- 20261025_turf_claimed.sql, 20261026_account_links.sql,
-- 20261028_owner_call_number.sql, 20261105_turf_availability.sql,
-- 20261110_email.sql, 20261117_game_confirmed.sql, 20261118_slot_asks.sql
-- and pg_cron (it refuses to run without them, changing nothing).
-- Additive: one column, one trigger, functions, one cron job, the one
-- replaced function above. Nothing is removed. No grant or policy on a
-- public table changes. Safe to run again: the column, the switches and
-- the outbox are kept, and the job is made only when there is none of
-- that name (so one stopped by hand stays stopped, and there is never a
-- second one).
-- The app works before this file: the Me tab and myTapturf show no slot
-- reminder switch, the email's link says try later, and nothing is queued.
-- Test: scripts/sql-tests/slot_reminders.check.mjs (PGlite).

do $$
declare
  v_job text;
begin
  if to_regclass('private.email_outbox') is null
     or to_regclass('private.email_prefs') is null
     or to_regclass('private.turf_availability') is null
     or to_regclass('private.slot_asks') is null
     or to_regclass('public.turf_owners') is null
     or to_regprocedure('private.email_job(private.email_outbox)') is null
     or to_regprocedure('private.email_address(uuid)') is null
     or to_regprocedure('private.email_suppressed(text)') is null
     or to_regprocedure('private.email_mode_skip(uuid)') is null
     or to_regprocedure('private.email_daily_cap()') is null
     or to_regprocedure('private.account_key_ok(text)') is null
     or to_regprocedure('private.account_for_key(text)') is null
     or to_regprocedure('private.call_phone10(text)') is null
     or to_regprocedure('private.slots_guard(text,uuid)') is null
     or to_regprocedure('private.game_in(uuid)') is null
     -- By its arguments: pg_cron has two functions of this name, and a bare name that is shared reads as none.
     or to_regprocedure('cron.schedule(text,text,text)') is null
     or to_regclass('cron.job') is null
     or (select count(*) from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = 'turfs'
            and c.column_name in ('claimed', 'is_active', 'owner_phone', 'contact_info', 'landline_phone', 'whatsapp_phone')) <> 6
     or (select count(*) from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = 'turf_owners'
            and c.column_name in ('user_id', 'user_key', 'status', 'created_at', 'decided_at')) <> 5 then
    raise exception 'slot reminders: apply 20261019_mytapturf.sql, 20261025_claims_account.sql, 20261025_turf_claimed.sql, 20261026_account_links.sql, 20261028_owner_call_number.sql, 20261105_turf_availability.sql, 20261110_email.sql, 20261117_game_confirmed.sql and 20261118_slot_asks.sql first (and pg_cron)';
  end if;
  select md5(p.prosrc) into v_job from pg_proc p where p.oid = to_regprocedure('private.email_job(private.email_outbox)');
  if v_job not in ('feab784127f6a3419570da5d51f14904', 'cbb5e19cae817c2ca3d04a683b858f0e') then
    raise exception 'slot reminders: private.email_job is not the body this file starts from (20261117_game_confirmed.sql), its md5 is %', v_job;
  end if;
end;
$$;

-- ── 1. The switch ──────────────────────────────────────────

alter table private.email_prefs add column if not exists slots boolean not null default true;
comment on column private.email_prefs.slots is
  'Emails: reminders to update free slots, for an account that runs a claimed turf (Me tab, myTapturf, or the link in the email). On until turned off. 20261129_slot_reminders.sql';

-- An account that already turned every TapTurf email off: this one is off too (once; a later run finds none).
update private.email_prefs p
   set slots = false
 where p.unsubscribed_all_at is not null
   and p.slots;

-- "All TapTurf emails" off (public.email_unsubscribe with 'all', left as it is) turns this switch off as it turns
-- the other three off, so turning one of those back on later never brings slot reminders back unasked.
create or replace function private.email_prefs_all_off()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.unsubscribed_all_at is not null and (tg_op = 'INSERT' or old.unsubscribed_all_at is null) then
    new.slots := false;
  end if;
  return new;
end;
$$;
revoke all on function private.email_prefs_all_off() from public, anon, authenticated;

create or replace trigger email_prefs_all_off
  before insert or update on private.email_prefs
  for each row
  execute function private.email_prefs_all_off();

-- ── 2. Constants (lib/email/slotReminder.ts has the same) ──

-- EVERY_DAYS: at most one reminder per account in this many India days.
create or replace function private.slot_reminder_every_days()
returns int language sql immutable set search_path = '' as $$ select 2 $$;

-- STALE_HOURS: a turf needs an update when its slots were last updated this long ago, or never.
create or replace function private.slot_reminder_stale_hours()
returns int language sql immutable set search_path = '' as $$ select 48 $$;

-- MAX_IN_A_ROW: after this many with no update, no more until the next update.
create or replace function private.slot_reminder_max()
returns int language sql immutable set search_path = '' as $$ select 5 $$;

-- SEND_HOUR_IST: the hour of the day in India the job queues them.
create or replace function private.slot_reminder_hour()
returns int language sql immutable set search_path = '' as $$ select 9 $$;

-- ASKS_DAYS: "Players asked for a slot here N times in the last 7 days" (India days, today among them).
create or replace function private.slot_reminder_asks_days()
returns int language sql immutable set search_path = '' as $$ select 7 $$;

-- TURFS_MAX: the most turfs one email lists.
create or replace function private.slot_reminder_turfs_max()
returns int language sql immutable set search_path = '' as $$ select 5 $$;

-- LATE_HOURS: a reminder not sent within this long of being queued is never sent (9 AM plus 12: not at night).
create or replace function private.slot_reminder_late_hours()
returns int language sql immutable set search_path = '' as $$ select 12 $$;

-- ── 3. The rules ───────────────────────────────────────────

-- Whether a turf's page shows Call or WhatsApp: lib/utils/contact.ts hasUsableContact (a number the Call button
-- can dial in owner_phone, contact_info.phone or landline_phone, or a mobile in whatsapp_phone), which
-- lib/my/numbers.ts pageHasNumber and the Free slots editor read. contact_info is an object, or the same as JSON
-- text (parseContactInfo); its phone counts only when it is text. Both run against lib/my/pageNumber.cases.json.
create or replace function private.turf_page_has_number(p_owner_phone text, p_contact_info jsonb, p_landline_phone text, p_whatsapp_phone text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_info jsonb := p_contact_info;
  v_contact text;
begin
  if jsonb_typeof(v_info) = 'string' then
    begin
      v_info := (v_info #>> '{}')::jsonb;
    exception when others then
      v_info := null;
    end;
  end if;
  if jsonb_typeof(v_info) = 'object' and jsonb_typeof(v_info -> 'phone') = 'string' then
    v_contact := v_info ->> 'phone';
  end if;
  return coalesce(private.call_phone10(p_owner_phone), private.call_phone10(v_contact), private.call_phone10(p_landline_phone)) is not null
      or coalesce(private.call_phone10(p_whatsapp_phone), '') ~ '^[6-9]';
end;
$$;

-- The account's switch: on unless it turned slot reminders off, or every TapTurf email.
create or replace function private.slot_reminder_on(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.slots and p.unsubscribed_all_at is null
                     from private.email_prefs p where p.user_id = p_user_id), true)
$$;

-- The turfs this account would be reminded about at p_now: it holds an active claim on the turf, made 48 hours
-- ago or more (private.slots_guard's own test, any role: user_id is the account, or, for a claim kept by a key
-- alone, that key opens the account now; the site owner's shortcut is no claim), the turf is listed and claimed
-- and its page has a number, and its slots were last updated 48 hours ago or more, or never.
-- asks: how many times players asked for a slot there in the last 7 India days (public.owner_slot_asks' count).
create or replace function private.slot_reminder_turfs(p_user_id uuid, p_now timestamptz)
returns table (turf_id uuid, name text, updated_at timestamptz, asks integer)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
         left(coalesce(nullif(btrim(t.name::text), ''), 'Your turf'), 80),
         a.updated_at,
         (select count(*)::integer
            from private.slot_asks k
           where k.turf_id = t.id
             and k.created_at >= (((p_now at time zone 'Asia/Kolkata')::date - (private.slot_reminder_asks_days() - 1))::timestamp at time zone 'Asia/Kolkata'))
    from public.turfs t
    left join private.turf_availability a on a.turf_id = t.id
   where p_user_id is not null
     and t.claimed
     and coalesce(t.is_active, false)
     and exists (select 1 from public.turf_owners o
                  where o.turf_id = t.id
                    and o.status = 'active'
                    and coalesce(o.user_id, private.account_for_key(o.user_key)) = p_user_id
                    and coalesce(o.decided_at, o.created_at, '-infinity'::timestamptz) <= p_now - make_interval(hours => private.slot_reminder_stale_hours()))
     and private.turf_page_has_number(t.owner_phone::text, to_jsonb(t.contact_info), t.landline_phone::text, t.whatsapp_phone::text)
     and (a.updated_at is null or a.updated_at <= p_now - make_interval(hours => private.slot_reminder_stale_hours()))
$$;

-- Reminders in a row: this account's slot reminders queued or sent after p_since (null: ever). One that was
-- skipped (the mode, the switch), failed or expired never reached anyone and is not counted.
create or replace function private.slot_reminder_count(p_user_id uuid, p_since timestamptz)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer
    from private.email_outbox o
   where o.user_id = p_user_id
     and o.kind = 'reminder'
     and o.refs ->> 'about' = 'slots'
     and o.status in ('queued', 'sending', 'sent')
     and o.created_at > coalesce(p_since, '-infinity'::timestamptz)
$$;

revoke all on function private.slot_reminder_every_days() from public, anon, authenticated;
revoke all on function private.slot_reminder_stale_hours() from public, anon, authenticated;
revoke all on function private.slot_reminder_max() from public, anon, authenticated;
revoke all on function private.slot_reminder_hour() from public, anon, authenticated;
revoke all on function private.slot_reminder_asks_days() from public, anon, authenticated;
revoke all on function private.slot_reminder_turfs_max() from public, anon, authenticated;
revoke all on function private.slot_reminder_late_hours() from public, anon, authenticated;
revoke all on function private.turf_page_has_number(text, jsonb, text, text) from public, anon, authenticated;
revoke all on function private.slot_reminder_on(uuid) from public, anon, authenticated;
revoke all on function private.slot_reminder_turfs(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.slot_reminder_count(uuid, timestamptz) from public, anon, authenticated;

-- ── 4. The daily job (9:00 AM India time) ──────────────────

-- Queues the reminders that are due at p_now, one per account. {r: ok, queued, stopped, capped}, r: not_now at any
-- India hour but 9 (nothing is ever queued at night, whatever calls it), r: busy while another run holds the lock.
create or replace function private.slot_reminders_run(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_local constant timestamp := p_now at time zone 'Asia/Kolkata';
  v_today constant date := v_local::date;
  r record;
  v_addr text;
  v_ids jsonb;
  v_last timestamptz;
  v_sent integer;
  v_id uuid;
  n_queued integer := 0;
  n_stopped integer := 0;
  n_capped integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('private.slot_reminders_run')) then
    return jsonb_build_object('r', 'busy');
  end if;
  if extract(hour from v_local)::int <> private.slot_reminder_hour() then
    return jsonb_build_object('r', 'not_now');
  end if;

  for r in
    select x.user_id
      from (select coalesce(o.user_id, private.account_for_key(o.user_key)) as user_id
              from public.turf_owners o
             where o.status = 'active') x
     where x.user_id is not null
     group by x.user_id
     order by x.user_id
  loop
    -- As every email: a confirmed address that never bounced or complained, and this kind's switch on.
    v_addr := private.email_address(r.user_id);
    continue when v_addr is null or private.email_suppressed(v_addr) or not private.slot_reminder_on(r.user_id);

    -- At most one every 2 days: none while one was queued today or yesterday in India, whatever became of it.
    continue when exists (
      select 1 from private.email_outbox x
       where x.user_id = r.user_id
         and x.kind = 'reminder'
         and x.refs ->> 'about' = 'slots'
         and (x.created_at at time zone 'Asia/Kolkata')::date > v_today - private.slot_reminder_every_days());

    -- Its turfs that need an update now, and the latest update among them.
    select jsonb_agg(s.turf_id order by s.name, s.turf_id), max(s.updated_at)
      into v_ids, v_last
      from private.slot_reminder_turfs(r.user_id, p_now) s;
    continue when v_ids is null;

    -- It stops by itself: 5 in a row since that update, then none until the next one.
    v_sent := private.slot_reminder_count(r.user_id, v_last);
    if v_sent >= private.slot_reminder_max() then
      n_stopped := n_stopped + 1;
      continue;
    end if;

    -- The 6 a day cap, every kind counted, as private.email_queue counts it. Tried again tomorrow.
    if (select count(*) from private.email_outbox x
         where x.user_id = r.user_id
           and x.created_at > p_now - interval '1 day'
           and x.status in ('queued', 'sending', 'sent')) >= private.email_daily_cap() then
      n_capped := n_capped + 1;
      continue;
    end if;

    v_id := null;
    insert into private.email_outbox (user_id, kind, dedupe_key, refs, next_attempt_at, created_at)
    values (r.user_id, 'reminder', 'slot_reminder:' || r.user_id::text || ':' || v_today::text,
            jsonb_build_object('about', 'slots', 'n', v_sent + 1, 'last', v_sent + 1 >= private.slot_reminder_max(), 'turf_ids', v_ids),
            p_now, p_now)
    on conflict (dedupe_key) do nothing
    returning id into v_id;
    if v_id is not null then
      n_queued := n_queued + 1;
    end if;
  end loop;

  return jsonb_build_object('r', 'ok', 'queued', n_queued, 'stopped', n_stopped, 'capped', n_capped);
end;
$$;
revoke all on function private.slot_reminders_run(timestamptz) from public, anon, authenticated;

-- ── 5. What a reminder says, read when it is sent ──────────

-- The job for a slot reminder's outbox row (private.email_job calls it once the mode, the address and the
-- suppressions have passed), or {skip: why}: off (the switch), late (queued over 12 hours ago), updated (no turf
-- of the account needs an update any more: it was updated, or the claim, the listing or its number went).
-- turfs: the first 5 by name, each {id, name, updated_at (null: never), asks}; more: how many are left out.
create or replace function private.slot_reminder_job(p_row private.email_outbox, p_to text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_turfs jsonb;
  v_first uuid;
  v_n integer;
  v_name text;
begin
  if not private.slot_reminder_on(p_row.user_id) then
    return jsonb_build_object('skip', 'off');
  end if;
  if p_row.created_at < now() - make_interval(hours => private.slot_reminder_late_hours()) then
    return jsonb_build_object('skip', 'late');
  end if;
  select count(*)::integer,
         (array_agg(s.turf_id order by s.name, s.turf_id))[1],
         (jsonb_agg(jsonb_build_object('id', s.turf_id, 'name', s.name, 'updated_at', s.updated_at, 'asks', s.asks)
                    order by s.name, s.turf_id))
    into v_n, v_first, v_turfs
    from private.slot_reminder_turfs(p_row.user_id, now()) s;
  if coalesce(v_n, 0) = 0 then
    return jsonb_build_object('skip', 'updated');
  end if;
  select left(nullif(split_part(btrim(coalesce(u.name::text, '')), ' ', 1), ''), 40) into v_name from public.users u where u.id = p_row.user_id;
  return jsonb_build_object(
    'id', p_row.id,
    'kind', 'slot_reminder',
    'group', 'slots',
    'user_id', p_row.user_id,
    'to', p_to,
    'name', v_name,
    'path', case when v_n = 1 then '/my/turf/' || v_first::text else '/my?list=1' end,
    'n', case when p_row.refs ->> 'n' ~ '^[0-9]{1,3}$' then (p_row.refs ->> 'n')::integer else 1 end,
    'last', coalesce(p_row.refs -> 'last' = 'true'::jsonb, false),
    'turfs', (select jsonb_agg(e.value order by e.ordinality)
                from jsonb_array_elements(v_turfs) with ordinality e
               where e.ordinality <= private.slot_reminder_turfs_max()),
    'more', greatest(v_n - private.slot_reminder_turfs_max(), 0),
    'now', now());
end;
$$;
revoke all on function private.slot_reminder_job(private.email_outbox, text) from public, anon, authenticated;

-- As 20261117_game_confirmed.sql has it (md5(prosrc) feab784127f6a3419570da5d51f14904), every line in
-- order, plus only the block marked 20261129_slot_reminders.sql: a slot reminder is answered by
-- private.slot_reminder_job, after the mode, the address and the suppressions, before the game switches.
create or replace function private.email_job(p_row private.email_outbox)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_held text := private.email_mode_skip(p_row.user_id);
  v_to text;
  v_name text;
  v_game public.games;
  v_starts timestamptz;
  v_requests jsonb;
  v_turf record;
  v_players integer;
begin
  -- The mode first: emails off, or this account isn't the site owner's while only they get emails.
  if v_held is not null then
    return jsonb_build_object('skip', v_held);
  end if;
  v_to := private.email_address(p_row.user_id);
  if v_to is null then
    return jsonb_build_object('skip', 'no_address');
  end if;
  if private.email_suppressed(v_to) then
    return jsonb_build_object('skip', 'suppressed');
  end if;
  -- 20261129_slot_reminders.sql: an owner's slot reminder has its own switch and is about no game.
  if p_row.kind = 'reminder' and p_row.refs ->> 'about' = 'slots' then
    return private.slot_reminder_job(p_row, v_to);
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
    -- Sent late (a retry, a hold): "tomorrow" only while the game is tomorrow in India, "in about 3 hours" only
    -- while it is 90 minutes away or more.
    if (p_row.refs ->> 'when' = 'tomorrow' and v_game.date is distinct from (now() at time zone 'Asia/Kolkata')::date + 1)
       or (p_row.refs ->> 'when' = 'soon' and v_starts - now() < interval '90 minutes') then
      return jsonb_build_object('skip', 'late');
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
  v_players := private.game_in(v_game.id);

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

-- ── 6. The switch, for the app (server key; the verified caller) ──

-- The Me tab's and myTapturf's switch: whether the account runs a turf (an active claim), and its switch.
-- {r: ok, owner, slots} or r: unavailable, bad.
create or replace function public.slot_reminder_pref(p_key text, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  return jsonb_build_object('r', 'ok',
    'owner', exists (select 1 from public.turf_owners o
                      where o.status = 'active' and coalesce(o.user_id, private.account_for_key(o.user_key)) = p_user_id),
    'slots', private.slot_reminder_on(p_user_id));
end;
$$;

-- Turns the switch on or off: the Me tab, myTapturf, and the link in the email (the app checked its signature;
-- off only). Turning it on undoes "all off", as public.email_prefs_set does. Answers as slot_reminder_pref.
create or replace function public.slot_reminder_pref_set(p_key text, p_user_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_on is null or not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  insert into private.email_prefs as x (user_id, slots)
  values (p_user_id, p_on)
  on conflict (user_id) do update
     set slots = p_on,
         unsubscribed_all_at = case when p_on then null else x.unsubscribed_all_at end,
         updated_at = now();
  return public.slot_reminder_pref(p_key, p_user_id);
end;
$$;

revoke all on function public.slot_reminder_pref(text, uuid) from public;
revoke all on function public.slot_reminder_pref_set(text, uuid, boolean) from public;
grant execute on function public.slot_reminder_pref(text, uuid) to anon, authenticated;
grant execute on function public.slot_reminder_pref_set(text, uuid, boolean) to anon, authenticated;

-- ── 7. The job ─────────────────────────────────────────────

-- 03:30 UTC is 9:00 AM in India. Made only when there is no job of that name: a second run makes no second job,
-- and one stopped by hand (cron.alter_job, active := false) stays stopped.
do $$
begin
  if not exists (select 1 from cron.job j where j.jobname = 'slot-reminders') then
    perform cron.schedule('slot-reminders', '30 3 * * *', 'select private.slot_reminders_run()');
  end if;
end;
$$;
