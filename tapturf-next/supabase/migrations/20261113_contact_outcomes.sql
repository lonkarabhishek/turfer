set local lock_timeout = '5s';

-- "Did you get a slot?" (12 Nov 2026). We know players tap Call or
-- WhatsApp on turf pages (public.turf_contact_clicks) but not whether they
-- got a slot. The site owner's ask: when a player comes back to the site
-- after such a tap, ask them once, gently (components/outcome/OutcomeCard.tsx;
-- lib/outcome/prompt.ts keeps it from nagging): did you get a slot? If yes,
-- when are you playing; if not, why (slot was full, too pricey, no reply,
-- wrong number, just asking), and for a full slot which time they wanted.
-- The answers are proof for turf owners, tell us when demand is, and point
-- at wrong numbers. This file keeps the answers and adds the three reads
-- and writes around them.
--
-- Table (schema private, RLS on, no grant to anyone; only the functions
-- below touch it; no foreign key, as private.booking_requests, so nothing
-- here locks public.turfs):
--   private.contact_outcomes   one row per answer: turf_id, kind (call or
--                              whatsapp), source (where the tap was, as
--                              the click has it), outcome (got_slot,
--                              not_this_time, deciding, dismissed), reason
--                              (full, price, no_reply, wrong_number,
--                              just_asking; only with not_this_time),
--                              slot_date (India's date the player plays,
--                              or wanted when the slot was full; worked
--                              out here from today or tomorrow; null for
--                              later or skipped), slot_hour (0 to 23, only
--                              with a date; 0 and 1 are the late night of
--                              slot_date, since the card's hour row runs
--                              5 AM to 1 AM), signed_in (the page's own
--                              word, as a click's is), created_at.
--                              Nothing that says who answered: no account,
--                              no name, no number, no network address, no
--                              device tag. Kept as it is; there is nothing
--                              in a row to clear when an account goes.
--
-- 1. The answer (POST /api/contact-outcome, lib/outcome/route.ts, which
--    checks the body, the page it came from and a limit per network first):
--      public.contact_outcome_add(p_key, p_turf_id, p_kind, p_source,
--        p_outcome, p_reason, p_day, p_hour, p_signed): server key only
--        (private.account_key_ok, as email_claim). {r: ok, city} once
--        stored (city: the turf's, lower case, for the card's free hours
--        link); {r: bad} for anything that isn't an answer (a reason
--        without not_this_time, a day without got_slot or a full slot, an
--        hour without a day, a source that isn't a short lower-case word);
--        {r: not_found} for a turf that doesn't exist or isn't active;
--        {r: capped} past 40 answers for one turf, or 3000 for all turfs,
--        in one India day, so the table can't be flooded; {r: unavailable}
--        without the key. p_day is 'today' or 'tomorrow' (India's), never
--        a date from the browser.
--
-- 2. The admin's Owner outreach rows ("Players said: 4 got a slot, 2 slot
--    full, 1 no reply, 1 wrong number"; components/admin/OwnerOutreach.tsx
--    through /api/admin/outreach, the site owner only:
--    public._caller_key(p_token) and public._is_admin_key, as
--    admin_owner_outreach; anyone else gets {error: forbidden}):
--      public.admin_contact_outcomes(p_token, p_city, p_days): jsonb
--        {city, days, since, today, turfs: [{id, got_slot, full, price,
--        no_reply, wrong_number, just_asking, no_reason, deciding,
--        dismissed}]}, one row per active turf of the city that has an
--        answer in the window: admin_owner_outreach's own city and window
--        (lower case, 'hyderabad' when none; the last 30 India days today
--        included, or 90). 20261113_owner_outreach.sql is left as it was
--        reviewed: the route reads both and joins them by turf id.
--
-- 3. The owner's report page (/report/<token>, lib/report/):
--      public.owner_report_said(p_key, p_turf_id): server key only.
--        {r: ok, days: 30, since, today, answered, got_slot, hours:
--        [{hour, n}]}. answered counts the players who told us how it
--        went (got_slot and not_this_time; a "still deciding" or a closed
--        card says nothing about a slot) in public.owner_report's own
--        window, the last 30 India days. Below 3 answered, got_slot is
--        null and hours is empty: the page shows nothing about it, since
--        one or two answers could be read as one person. hours: the three
--        hours named most (the hour a player plays, or wanted when the
--        slot was full), most first. {r: not_found} for a turf that
--        doesn't exist or isn't active; {r: unavailable} without the key.
--        public.owner_report and its counts are left as they are.
--
-- Replaced: none. Every function this file calls, as production runs it
-- (md5(prosrc), read from pg_proc 12 Nov 2026), equals its latest body in
-- the repo:
--   public._caller_key               2ab91047132da79f8f3052f95c6f52de  20261025_claims_account.sql
--   public._is_admin_key             c9e14ff9b4713cd87a73ceac3296f20b  20261019_mytapturf.sql
--   private.account_key_ok           ca605fa89a97497134b690e753dc5c0e  20261021_accounts_usernames.sql
--
-- Needs 20261019_mytapturf.sql, 20261021_accounts_usernames.sql and
-- 20261025_claims_account.sql (it refuses to run without them, changing
-- nothing). It does not need 20261113_owner_outreach.sql, and runs before
-- or after it. Additive: one table, two indexes, three functions. Written
-- without the destructive SQL keywords; nothing is removed. No grant or
-- policy on a public table changes, and no public table is written. Safe
-- to run again (the answers stay as they are).
-- The app works before this file: the card still asks and says thanks, the
-- route stores nothing, and the admin rows and the report show nothing
-- about answers.
-- Test: scripts/sql-tests/contact_outcomes.check.mjs (PGlite).

do $$
begin
  if to_regprocedure('public._caller_key(text)') is null
     or to_regprocedure('public._is_admin_key(text)') is null
     or to_regprocedure('private.account_key_ok(text)') is null
     or to_regclass('public.turfs') is null then
    raise exception 'contact_outcomes needs 20261019_mytapturf.sql, 20261021_accounts_usernames.sql and 20261025_claims_account.sql first';
  end if;
end;
$$;

-- ── 1. The answers ────────────────────────────────────────

create table if not exists private.contact_outcomes (
  id bigint generated always as identity primary key,
  turf_id uuid not null,
  kind text not null check (kind in ('call', 'whatsapp')),
  source text not null check (source ~ '^[a-z0-9_]{1,40}$'),
  outcome text not null check (outcome in ('got_slot', 'not_this_time', 'deciding', 'dismissed')),
  reason text check (reason is null or reason in ('full', 'price', 'no_reply', 'wrong_number', 'just_asking')),
  slot_date date,
  slot_hour smallint check (slot_hour is null or slot_hour between 0 and 23),
  signed_in boolean not null default false,
  created_at timestamptz not null default now(),
  constraint contact_outcomes_reason_with_no check (reason is null or outcome = 'not_this_time'),
  constraint contact_outcomes_slot_with_yes_or_full check (slot_date is null or outcome = 'got_slot' or coalesce(reason, '') = 'full'),
  constraint contact_outcomes_hour_with_day check (slot_hour is null or slot_date is not null)
);
create index if not exists contact_outcomes_turf_idx on private.contact_outcomes (turf_id, created_at desc);
create index if not exists contact_outcomes_created_idx on private.contact_outcomes (created_at desc);
alter table private.contact_outcomes enable row level security;
revoke all on table private.contact_outcomes from public, anon, authenticated;
comment on table private.contact_outcomes is 'Players'' answers to "Did you get a slot?" after a Call or WhatsApp tap: the turf, the answer and the time they play or wanted. Nothing that says who answered. Written only by contact_outcome_add; read only by admin_contact_outcomes and owner_report_said.';

-- ── 2. One answer in (server key) ─────────────────────────

create or replace function public.contact_outcome_add(
  p_key text,
  p_turf_id uuid,
  p_kind text,
  p_source text,
  p_outcome text,
  p_reason text default null,
  p_day text default null,
  p_hour integer default null,
  p_signed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Answers kept for one turf, and for all turfs, in one India day.
  max_turf_day constant integer := 40;
  max_day constant integer := 3000;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_t_today timestamptz;
  v_city text;
  v_found boolean := false;
  v_date date;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_turf_id is null
     or p_kind is null or p_kind not in ('call', 'whatsapp')
     or p_source is null or p_source !~ '^[a-z0-9_]{1,40}$'
     or p_outcome is null or p_outcome not in ('got_slot', 'not_this_time', 'deciding', 'dismissed')
     or (p_reason is not null and (p_outcome <> 'not_this_time' or p_reason not in ('full', 'price', 'no_reply', 'wrong_number', 'just_asking')))
     or (p_day is not null and (p_day not in ('today', 'tomorrow') or not (p_outcome = 'got_slot' or coalesce(p_reason, '') = 'full')))
     or (p_hour is not null and (p_day is null or p_hour < 0 or p_hour > 23)) then
    return jsonb_build_object('r', 'bad');
  end if;
  select true, nullif(lower(btrim(t.city)), '') into v_found, v_city
    from public.turfs t
   where t.id = p_turf_id and t.is_active;
  if not coalesce(v_found, false) then
    return jsonb_build_object('r', 'not_found');
  end if;
  v_t_today := v_today::timestamp at time zone 'Asia/Kolkata';
  if (select count(*) from private.contact_outcomes o where o.turf_id = p_turf_id and o.created_at >= v_t_today) >= max_turf_day
     or (select count(*) from private.contact_outcomes o where o.created_at >= v_t_today) >= max_day then
    return jsonb_build_object('r', 'capped');
  end if;
  v_date := case p_day when 'today' then v_today when 'tomorrow' then v_today + 1 end;
  insert into private.contact_outcomes (turf_id, kind, source, outcome, reason, slot_date, slot_hour, signed_in)
  values (p_turf_id, p_kind, p_source, p_outcome, p_reason, v_date, p_hour::smallint, coalesce(p_signed, false));
  return jsonb_build_object('r', 'ok', 'city', v_city);
end;
$$;

revoke all on function public.contact_outcome_add(text, uuid, text, text, text, text, text, integer, boolean) from public, anon, authenticated;
-- The route's server calls it with the app's anon key and the server key (p_key), as email_claim; the key is the gate.
grant execute on function public.contact_outcome_add(text, uuid, text, text, text, text, text, integer, boolean) to anon;

-- ── 3. The admin's "Players said" (the site owner only) ───

create or replace function public.admin_contact_outcomes(p_token text default null, p_city text default 'hyderabad', p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k text := public._caller_key(p_token);
  v_city text := coalesce(nullif(lower(btrim(p_city)), ''), 'hyderabad');
  v_days integer := case when p_days = 90 then 90 else 30 end;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_since date;
  v_t_since timestamptz;
begin
  if k is null or not coalesce(public._is_admin_key(k), false) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  v_since := v_today - (v_days - 1);
  v_t_since := v_since::timestamp at time zone 'Asia/Kolkata';
  return jsonb_build_object(
    'city', v_city,
    'days', v_days,
    'since', v_since::text,
    'today', v_today::text,
    'turfs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.turf_id, 'got_slot', x.got_slot, 'full', x.slot_full, 'price', x.price, 'no_reply', x.no_reply,
               'wrong_number', x.wrong_number, 'just_asking', x.just_asking, 'no_reason', x.no_reason,
               'deciding', x.deciding, 'dismissed', x.dismissed)
             order by x.turf_id)
        from (
          select o.turf_id,
                 count(*) filter (where o.outcome = 'got_slot') as got_slot,
                 count(*) filter (where o.reason = 'full') as slot_full,
                 count(*) filter (where o.reason = 'price') as price,
                 count(*) filter (where o.reason = 'no_reply') as no_reply,
                 count(*) filter (where o.reason = 'wrong_number') as wrong_number,
                 count(*) filter (where o.reason = 'just_asking') as just_asking,
                 count(*) filter (where o.outcome = 'not_this_time' and o.reason is null) as no_reason,
                 count(*) filter (where o.outcome = 'deciding') as deciding,
                 count(*) filter (where o.outcome = 'dismissed') as dismissed
            from private.contact_outcomes o
            join public.turfs t on t.id = o.turf_id
           where o.created_at >= v_t_since and t.is_active and lower(t.city) = v_city
           group by o.turf_id
        ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_contact_outcomes(text, text, integer) from public, anon, authenticated;
-- The admin route calls it as the site owner's own session (authenticated) or with his Firebase token (anon); the check inside is the gate.
grant execute on function public.admin_contact_outcomes(text, text, integer) to anon, authenticated;

-- ── 4. The owner's report: what players told us (server key; counts only) ──

create or replace function public.owner_report_said(p_key text, p_turf_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d constant integer := 30;
  -- Fewer players than this told us: nothing is said about it.
  min_answered constant integer := 3;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  since date;
  t_since timestamptz;
  v_answered bigint;
  v_got bigint;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_turf_id is null or not exists (select 1 from public.turfs t where t.id = p_turf_id and t.is_active) then
    return jsonb_build_object('r', 'not_found');
  end if;
  -- public.owner_report's window: today and the 29 days before it, India days.
  since := today - (d - 1);
  t_since := since::timestamp at time zone 'Asia/Kolkata';
  select count(*), count(*) filter (where o.outcome = 'got_slot')
    into v_answered, v_got
    from private.contact_outcomes o
   where o.turf_id = p_turf_id and o.created_at >= t_since and o.outcome in ('got_slot', 'not_this_time');
  return jsonb_build_object(
    'r', 'ok',
    'days', d,
    'since', since::text,
    'today', today::text,
    'answered', v_answered,
    'got_slot', case when v_answered >= min_answered then v_got end,
    'hours', case when v_answered >= min_answered then coalesce((
      select jsonb_agg(jsonb_build_object('hour', h.slot_hour, 'n', h.n) order by h.n desc, h.slot_hour)
        from (
          select o.slot_hour, count(*) as n
            from private.contact_outcomes o
           where o.turf_id = p_turf_id and o.created_at >= t_since and o.outcome in ('got_slot', 'not_this_time') and o.slot_hour is not null
           group by o.slot_hour
           order by count(*) desc, o.slot_hour
           limit 3
        ) h
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.owner_report_said(text, uuid) from public, anon, authenticated;
-- The report page's server reads it with the app's anon key and the server key (p_key), as owner_report; the key is the gate.
grant execute on function public.owner_report_said(text, uuid) to anon;
