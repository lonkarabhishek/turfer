set local lock_timeout = '5s';

-- "Ask for a slot" (18 Nov 2026). A turf wants to "go online" with
-- TapTurf, and the simplest thing that works for every turf today is this:
-- on the turf's page a player picks a day and a time, and WhatsApp opens
-- with the question already written to the turf
-- (components/turf/SlotAskSheet.tsx, lib/slotAsk/). The turf answers on
-- WhatsApp as it always has. No owner sign-up, no calendar to keep, and
-- nothing is paid on TapTurf. The tap is still counted as a WhatsApp tap
-- (public.turf_contact_clicks, source slot_ask), exactly as before.
--
-- What we did not have, and this file keeps: which times players ask for,
-- per turf ("players asked for a slot 14 times this month, mostly 7 PM to
-- 9 PM"), for the owner's report and for the team that talks to owners.
--
-- Table (schema private, RLS on, no grant to anyone; only the functions
-- below touch it; no foreign key, as private.contact_outcomes, so nothing
-- here locks public.turfs):
--   private.slot_asks   one row per ask that opened WhatsApp: turf_id,
--                       slot_date (India's calendar date of the start the
--                       player asked about; an hour after midnight has
--                       the next day's date), slot_hour (0 to 23),
--                       slot_minute (0 unless the turf opens on a half
--                       hour), minutes (60, 90, 120 or 180), sport (the
--                       turf's own label, lower case; null when it lists
--                       none), players (the group size, null unless
--                       given), signed_in (the page's own word, as a
--                       click's is), created_at.
--                       Nothing that says who asked: no account, no name,
--                       no number, no network address, no device tag, and
--                       never the message or the chat (those go from the
--                       player's WhatsApp to the turf and never reach
--                       TapTurf). Kept as it is; there is nothing in a row
--                       to clear when an account goes.
--
-- 1. The ask (POST /api/slot-ask, lib/slotAsk/route.ts, which checks the
--    body, the page it came from and a limit per network first):
--      public.slot_ask_add(p_key, p_turf_id, p_date, p_hour, p_minute,
--        p_minutes, p_sport, p_players, p_signed): server key only
--        (private.account_key_ok, as contact_outcome_add). {r: ok} once
--        stored; {r: bad} for anything that isn't an ask (an hour or a
--        minute out of range, a length that isn't 60, 90, 120 or 180, a
--        group under 1 or over 60, a date before yesterday or more than
--        8 days on in India, a sport the turf does not list);
--        {r: not_found} for a turf that doesn't exist or isn't active;
--        {r: capped} past 100 asks for one turf, or 5000 for all turfs,
--        in one India day, so the table can't be flooded;
--        {r: unavailable} without the key. The sport must be one of the
--        turf's own (public.turfs.sports), so no free text is ever kept.
--
-- 2. The admin's Owner outreach rows ("Slot asks: 14 · most asked 7 PM,
--    8 PM, 9 PM"; components/admin/OwnerOutreach.tsx through
--    /api/admin/outreach, the site owner only: public._caller_key(p_token)
--    and public._is_admin_key, as admin_contact_outcomes; anyone else gets
--    {error: forbidden}):
--      public.admin_slot_asks(p_token, p_city, p_days): jsonb {city, days,
--        since, today, turfs: [{id, asks, asks30, hours: [{hour, n}]}]},
--        one row per active turf of the city with an ask in the window:
--        admin_owner_outreach's own city and window (lower case,
--        'hyderabad' when none; the last 30 India days today included, or
--        90). asks30 is always the last 30 days (the prefilled message and
--        the report say 30 days whatever the window); hours: the three
--        start hours asked for most in the window, most first.
--
-- 3. The owner's report page (/report/<token>, lib/report/):
--      public.owner_report_asks(p_key, p_turf_id): server key only.
--        {r: ok, days: 30, since, today, asks, prev, hours: [{hour, n}]}.
--        asks counts the asks made in public.owner_report's own window,
--        the last 30 India days; prev the 30 days before; hours: every
--        start hour asked for in the window with its count, by hour.
--        Counts of asks, never of people. {r: not_found} for a turf that
--        doesn't exist or isn't active; {r: unavailable} without the key.
--
-- 4. The owner's own Analytics tab on myTapturf (components/my/MyTurf.tsx,
--    a read of its own beside public.owner_dashboard, which is left as it
--    is):
--      public.owner_slot_asks(p_token, p_turf_id, p_days): for whoever
--        may open that turf's dashboard (public._caller_key and
--        public._can_manage, as owner_dashboard; anyone else gets
--        {error: forbidden}). {days, since, today, asks, prev, hours:
--        [{hour, n}]} over owner_dashboard's own window (7 to 90 days, 30
--        when none) and the same number of days before it.
--
-- Replaced: none. Every function this file calls, as production runs it
-- (md5(prosrc), read from pg_proc 18 Nov 2026), equals its latest body in
-- the repo:
--   public._caller_key               2ab91047132da79f8f3052f95c6f52de  20261025_claims_account.sql
--   public._is_admin_key             c9e14ff9b4713cd87a73ceac3296f20b  20261019_mytapturf.sql
--   public._can_manage               daec6751657cce4d6a97d090b20a0035  20261026_account_links_reads.sql
--   private.account_key_ok           ca605fa89a97497134b690e753dc5c0e  20261021_accounts_usernames.sql
-- Left as they are, and not called here (production, the same day):
--   public.contact_outcome_add       b37dee7d8a905c6c87e8ca0f1e9d818c  20261113_contact_outcomes.sql
--   public.owner_report              a1d924591bf89c6e8da3f96815d76371  20261113_owner_outreach.sql
--   public.owner_dashboard           36b19ecb4a52a092dbc3648b49707262  20261028_owner_call_number.sql
--   public.log_turf_contact_click    e3d3eed5bf44e5423d79278d43cd10d0  (production's body; the repo's only copy,
--                                    20260930_turf_contact_clicks.sql, is an older one: b8b22e6894b0a6df24af78a6a58065d9)
-- "Did you get a slot?" needs no change here: its answer about an asked
-- time goes through contact_outcome_add as it is (p_day 'today' or
-- 'tomorrow' and p_hour; a time further on is stored as "later", with no
-- date, as the card's own Later is).
--
-- Needs 20261019_mytapturf.sql, 20261021_accounts_usernames.sql,
-- 20261025_claims_account.sql and 20261026_account_links_reads.sql (it
-- refuses to run without them, changing nothing). It needs neither
-- 20261113 file. Additive: one table, two indexes, four functions. Written
-- without the destructive SQL keywords; nothing is removed. No grant or
-- policy on a public table changes, and no public table is written. Safe
-- to run again (the asks stay as they are).
-- The app works before this file: WhatsApp opens with the message, the
-- route stores nothing, and the admin rows, the report and myTapturf show
-- nothing about asks.
-- Test: scripts/sql-tests/slot_asks.check.mjs (PGlite).

do $$
begin
  if to_regprocedure('public._caller_key(text)') is null
     or to_regprocedure('public._is_admin_key(text)') is null
     or to_regprocedure('public._can_manage(text, uuid)') is null
     or to_regprocedure('private.account_key_ok(text)') is null
     or to_regclass('public.turfs') is null then
    raise exception 'slot_asks needs 20261019_mytapturf.sql, 20261021_accounts_usernames.sql, 20261025_claims_account.sql and 20261026_account_links_reads.sql first';
  end if;
end;
$$;

-- ── 1. The asks ───────────────────────────────────────────

create table if not exists private.slot_asks (
  id bigint generated always as identity primary key,
  turf_id uuid not null,
  slot_date date not null,
  slot_hour smallint not null check (slot_hour between 0 and 23),
  slot_minute smallint not null default 0 check (slot_minute between 0 and 59),
  minutes smallint not null check (minutes in (60, 90, 120, 180)),
  sport text check (sport is null or sport ~ '^[a-z0-9][a-z0-9 &/().+-]{0,29}$'),
  players smallint check (players is null or players between 1 and 60),
  signed_in boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists slot_asks_turf_idx on private.slot_asks (turf_id, created_at desc);
create index if not exists slot_asks_created_idx on private.slot_asks (created_at desc);
alter table private.slot_asks enable row level security;
revoke all on table private.slot_asks from public, anon, authenticated;
comment on table private.slot_asks is 'Each "Ask for a slot" that opened WhatsApp from a turf page: the turf, the day and time asked for, how long, the sport and the group size. Nothing that says who asked, and never the words sent to the turf. Written only by slot_ask_add; read only by admin_slot_asks, owner_report_asks and owner_slot_asks.';

-- ── 2. One ask in (server key) ────────────────────────────

create or replace function public.slot_ask_add(
  p_key text,
  p_turf_id uuid,
  p_date date,
  p_hour integer,
  p_minute integer default 0,
  p_minutes integer default 60,
  p_sport text default null,
  p_players integer default null,
  p_signed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Asks kept for one turf, and for all turfs, in one India day.
  max_turf_day constant integer := 100;
  max_day constant integer := 5000;
  -- How far on a player can ask: the 7 days the sheet shows and the last one's hours after midnight.
  ahead constant integer := 8;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_t_today timestamptz;
  v_found boolean := false;
  v_sports jsonb;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_turf_id is null
     or p_date is null or p_date < v_today - 1 or p_date > v_today + ahead
     or p_hour is null or p_hour < 0 or p_hour > 23
     or coalesce(p_minute, 0) < 0 or coalesce(p_minute, 0) > 59
     or p_minutes is null or p_minutes not in (60, 90, 120, 180)
     or (p_sport is not null and p_sport !~ '^[a-z0-9][a-z0-9 &/().+-]{0,29}$')
     or (p_players is not null and (p_players < 1 or p_players > 60)) then
    return jsonb_build_object('r', 'bad');
  end if;
  select true, case when jsonb_typeof(to_jsonb(t.sports)) = 'array' then to_jsonb(t.sports) else '[]'::jsonb end
    into v_found, v_sports
    from public.turfs t
   where t.id = p_turf_id and t.is_active;
  if not coalesce(v_found, false) then
    return jsonb_build_object('r', 'not_found');
  end if;
  -- Only a sport the turf itself lists: no free text is kept.
  if p_sport is not null and not exists (
       select 1 from jsonb_array_elements_text(v_sports) s(label)
        where lower(btrim(regexp_replace(s.label, '[[:space:]]+', ' ', 'g'))) = p_sport) then
    return jsonb_build_object('r', 'bad');
  end if;
  v_t_today := v_today::timestamp at time zone 'Asia/Kolkata';
  if (select count(*) from private.slot_asks a where a.turf_id = p_turf_id and a.created_at >= v_t_today) >= max_turf_day
     or (select count(*) from private.slot_asks a where a.created_at >= v_t_today) >= max_day then
    return jsonb_build_object('r', 'capped');
  end if;
  insert into private.slot_asks (turf_id, slot_date, slot_hour, slot_minute, minutes, sport, players, signed_in)
  values (p_turf_id, p_date, p_hour::smallint, coalesce(p_minute, 0)::smallint, p_minutes::smallint, p_sport, p_players::smallint, coalesce(p_signed, false));
  return jsonb_build_object('r', 'ok');
end;
$$;

revoke all on function public.slot_ask_add(text, uuid, date, integer, integer, integer, text, integer, boolean) from public, anon, authenticated;
-- The route's server calls it with the app's anon key and the server key (p_key), as contact_outcome_add; the key is the gate.
grant execute on function public.slot_ask_add(text, uuid, date, integer, integer, integer, text, integer, boolean) to anon;

-- ── 3. The admin's "Slot asks" (the site owner only) ──────

create or replace function public.admin_slot_asks(p_token text default null, p_city text default 'hyderabad', p_days integer default 30)
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
  v_t_30 timestamptz;
begin
  if k is null or not coalesce(public._is_admin_key(k), false) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  v_since := v_today - (v_days - 1);
  v_t_since := v_since::timestamp at time zone 'Asia/Kolkata';
  -- The report's and the message's own window, whatever the list's: today and the 29 days before it.
  v_t_30 := (v_today - 29)::timestamp at time zone 'Asia/Kolkata';
  return jsonb_build_object(
    'city', v_city,
    'days', v_days,
    'since', v_since::text,
    'today', v_today::text,
    'turfs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.turf_id, 'asks', x.asks, 'asks30', x.asks30,
               'hours', coalesce((
                 select jsonb_agg(jsonb_build_object('hour', h.slot_hour, 'n', h.n) order by h.n desc, h.slot_hour)
                   from (
                     select a.slot_hour, count(*) as n
                       from private.slot_asks a
                      where a.turf_id = x.turf_id and a.created_at >= v_t_since
                      group by a.slot_hour
                      order by count(*) desc, a.slot_hour
                      limit 3
                   ) h
               ), '[]'::jsonb))
             order by x.turf_id)
        from (
          select a.turf_id,
                 count(*) as asks,
                 count(*) filter (where a.created_at >= v_t_30) as asks30
            from private.slot_asks a
            join public.turfs t on t.id = a.turf_id
           where a.created_at >= v_t_since and t.is_active and lower(t.city) = v_city
           group by a.turf_id
        ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_slot_asks(text, text, integer) from public, anon, authenticated;
-- The admin route calls it as the site owner's own session (authenticated) or with his Firebase token (anon); the check inside is the gate.
grant execute on function public.admin_slot_asks(text, text, integer) to anon, authenticated;

-- ── 4. The owner's report: the slots players asked for (server key; counts only) ──

create or replace function public.owner_report_asks(p_key text, p_turf_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d constant integer := 30;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  since date;
  prev date;
  t_since timestamptz;
  t_prev timestamptz;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_turf_id is null or not exists (select 1 from public.turfs t where t.id = p_turf_id and t.is_active) then
    return jsonb_build_object('r', 'not_found');
  end if;
  -- public.owner_report's window: today and the 29 days before it, India days; then the 30 before those.
  since := today - (d - 1);
  prev := since - d;
  t_since := since::timestamp at time zone 'Asia/Kolkata';
  t_prev := prev::timestamp at time zone 'Asia/Kolkata';
  return jsonb_build_object(
    'r', 'ok',
    'days', d,
    'since', since::text,
    'today', today::text,
    'asks', (select count(*) from private.slot_asks a where a.turf_id = p_turf_id and a.created_at >= t_since),
    'prev', (select count(*) from private.slot_asks a where a.turf_id = p_turf_id and a.created_at >= t_prev and a.created_at < t_since),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h.slot_hour, 'n', h.n) order by h.slot_hour)
        from (
          select a.slot_hour, count(*) as n
            from private.slot_asks a
           where a.turf_id = p_turf_id and a.created_at >= t_since
           group by a.slot_hour
        ) h
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.owner_report_asks(text, uuid) from public, anon, authenticated;
-- The report page's server reads it with the app's anon key and the server key (p_key), as owner_report; the key is the gate.
grant execute on function public.owner_report_asks(text, uuid) to anon;

-- ── 5. myTapturf's Analytics tab: the same counts, for whoever may open the turf's dashboard ──

create or replace function public.owner_slot_asks(p_token text default null, p_turf_id uuid default null, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k text := public._caller_key(p_token);
  -- public.owner_dashboard's own window.
  d integer := least(greatest(coalesce(p_days, 30), 7), 90);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  since date;
  prev date;
  t_since timestamptz;
  t_prev timestamptz;
begin
  if p_turf_id is null or not coalesce(public._can_manage(k, p_turf_id), false) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  since := today - (d - 1);
  prev := since - d;
  t_since := since::timestamp at time zone 'Asia/Kolkata';
  t_prev := prev::timestamp at time zone 'Asia/Kolkata';
  return jsonb_build_object(
    'days', d,
    'since', since::text,
    'today', today::text,
    'asks', (select count(*) from private.slot_asks a where a.turf_id = p_turf_id and a.created_at >= t_since),
    'prev', (select count(*) from private.slot_asks a where a.turf_id = p_turf_id and a.created_at >= t_prev and a.created_at < t_since),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h.slot_hour, 'n', h.n) order by h.slot_hour)
        from (
          select a.slot_hour, count(*) as n
            from private.slot_asks a
           where a.turf_id = p_turf_id and a.created_at >= t_since
           group by a.slot_hour
        ) h
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.owner_slot_asks(text, uuid, integer) from public, anon, authenticated;
-- myTapturf calls it from the browser as the owner's own session (authenticated) or with their Firebase token (anon), as owner_dashboard; the check inside is the gate.
grant execute on function public.owner_slot_asks(text, uuid, integer) to anon, authenticated;
