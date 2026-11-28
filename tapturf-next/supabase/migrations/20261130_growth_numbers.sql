set local lock_timeout = '5s';

-- People, contacts and bookings: the admin's numbers of people (28 Nov
-- 2026). The site owner: "start tracking unique turf contacts, repeat
-- users, completed bookings and revenue. Your current visit tracking
-- explicitly counts returning arrivals as new visits, so visits should
-- not be confused with unique users."
--
-- Nothing new is collected for this. Every number here is counted from
-- rows TapTurf already keeps, and only where a row already carries an
-- account and a time:
--   public.turf_contact_clicks   a Call or WhatsApp tap on a turf. A
--                                signed-in tap opens the dialer or
--                                WhatsApp and is kept with the account
--                                the browser said it was (the server does
--                                not check it: log_turf_contact_click is
--                                called by the browser, 20260930). A
--                                signed-out tap opens the sign-in, so it
--                                reached no turf and is no contact.
--   public.games, private.game_series, public.game_participants,
--   public.reviews, private.tool_use_log, private.booking_requests
--                                the other things an account does with a
--                                time on them (below, "active").
--   private.contact_outcomes     "Did you get a slot?" answers. No
--                                account on a row, by design.
-- Visitors who are not signed in cannot be counted as people: the visit
-- counter (20261104_traffic.sql) keeps no identifier at all, so a person
-- who comes back is a new visit. That is unchanged.
--
-- New, two functions, both read only, for the admin's "People, contacts
-- and bookings" card (components/admin/GrowthNumbers.tsx through
-- GET /api/admin/growth; lib/admin/growth.ts has every word). Both are
-- gated exactly as public.admin_contact_outcome_totals
-- (20261127_contact_outcome_totals.sql): public._caller_key(p_token),
-- then public._is_admin_key; anyone but the site owner (no sign-in, a
-- wrong token, any other signed-in person) gets {error: forbidden} and
-- nothing else. Both are stable, security definer, search_path '', with
-- execute for anon and authenticated as admin_contact_outcome_totals has
-- it (the admin route calls them as the site owner's own session or with
-- his Firebase token; the check inside is the gate).
--
-- 1. public.admin_growth(p_token text default null): jsonb
--      {today, windows: {d7, d30, all}, top_turfs: {d7, d30, all}}
--    today: India's date now. Every window is India days:
--      d7   the last 7 India days, today included (since = today - 6)
--      d30  the last 30 India days, today included (since = today - 29)
--      all  everything kept (days null; since is the India day of the
--           first tap, null with none)
--    An account is counted only while it is in public.users (an erased
--    account is in no count). Each window:
--      days, since
--      taps              every tap row in the window
--      taps_reached      taps with signed_in true: they opened the dialer
--                        or WhatsApp
--      taps_signed_out   taps with signed_in false: they opened the
--                        sign-in instead (taps = the two added up)
--      taps_no_account   signed-in taps with no account on them, or one
--                        that is not in public.users: in taps_reached, in
--                        no count of people
--      call, whatsapp, slot_ask
--                        taps_reached split three ways, adding up to it:
--                        kind call; kind whatsapp from anywhere but "Ask
--                        for a slot"; and source slot_ask (which opens
--                        WhatsApp)
--      people            different accounts with a tap that reached a turf
--      contacts          different (account, turf) pairs among those: a
--                        player who taps Call and WhatsApp at one turf
--                        five times is one contact of that turf
--      turfs             different turfs those people contacted
--      came_back         of people: those with such taps on 2 or more
--                        different India days
--      multi_turf        of people: those who contacted 2 or more turfs
--      active            different accounts with any counted action in
--                        the window. The actions: a tap that reached a
--                        turf; a game hosted (public.games.created_at for
--                        a game that is not a repeat's, and
--                        private.game_series.created_at for a repeat, so
--                        the games the daily job puts up for a repeat are
--                        not the host's doing on that day); a game joined
--                        (public.game_participants.joined_at, the host's
--                        own row left out); a review written
--                        (public.reviews.created_at, TapTurf's own:
--                        source null); a free tool used signed in
--                        (private.tool_use_log.used_at, rows with an
--                        account); a booking request sent
--                        (private.booking_requests.created_at)
--      active_2days      of active: those with an action on 2 or more
--                        different India days (two different actions on
--                        two days count)
--      did_contact, did_host, did_join, did_review, did_tool,
--      did_request       of active: accounts with each action (one
--                        account can be in several)
--      requests          booking requests sent in the window (by the day
--                        they were sent), and of those, by the state
--                        every read shows (private.booking_state):
--      confirmed         the turf confirmed it and it still stands
--                        (status confirmed; one cancelled after is
--                        cancelled)
--      confirmed_hours   their hours added up
--      confirmed_over    of confirmed: those whose hours have ended
--      waiting, declined, cancelled, expired
--                        the rest (requests = the five added up)
--      answered          "Did you get a slot?" answers in the window
--                        (got_slot, not_this_time, deciding; a closed
--                        card is not an answer)
--      got_slot          of answered: got a slot
--    top_turfs: for each window, the turfs with the most contacts
--    (different accounts that reached them), most first, then most taps
--    by those accounts, then by name, then by id; 10 at most. Each:
--    {id, name, city, slug, active, contacts, taps}. name, city (lower
--    case) and slug are public.turfs' own; active is true only for a turf
--    that is switched on.
--
-- 2. public.admin_growth_slots(p_token text default null): jsonb
--      {today, cap, confirmed_n, confirmed, got_slot_n, got_slot, turfs}
--    The rows an estimate of booking value needs, and nothing else.
--    TapTurf takes no payment, so there is no revenue to read: the card
--    shows an estimate at each turf's listed price and says so. The price
--    for a day and a time is picked in TypeScript by the turf page's own
--    rule (lib/utils/prices.ts listedPriceAt), so this file has no copy of
--    that rule: it hands over the slots and each turf's price columns.
--      confirmed   every booking request that is confirmed, newest sent
--                  first: {turf, at, date, hour, minute, hours}. at is
--                  India's date it was sent (the window it is in); date,
--                  hour and minute are the start in India time (the
--                  calendar date).
--      got_slot    every got_slot answer, newest first: {turf, at, date,
--                  hour}. at is India's date of the answer; date and hour
--                  are the slot the answer names, null when it names
--                  none (12 am and 1 am are kept under the day whose
--                  night it is, as the answer stores them). An answer
--                  says nothing of how long.
--      cap         2000: the most rows either list returns.
--                  confirmed_n and got_slot_n are how many there are in
--                  all, so a cut list can say so.
--      turfs       for each turf in either list that is still in
--                  public.turfs: {id, morning_price, afternoon_price,
--                  evening_price, weekend_morning_price,
--                  weekend_afternoon_price, weekend_evening_price,
--                  pricing_bands, price_unit, slot_minutes,
--                  price_owner_confirmed}.
--
-- Never returned by either: an account id, a name, a number, an email, a
-- note, or anything else about a person. Counts, turf ids and names,
-- dates, hours and listed prices only.
--
-- Replaced: none. Nothing from before is touched. The three functions
-- this file calls are not changed here. Each md5 is md5(prosrc) of the
-- function's latest body in the repo's migrations; production was not
-- read for this file, so compare before applying:
--   select s.nspname, p.proname, md5(p.prosrc) from pg_proc p
--     join pg_namespace s on s.oid = p.pronamespace
--    where (s.nspname, p.proname) in (('public', '_caller_key'),
--          ('public', '_is_admin_key'), ('private', 'booking_state'));
--   public._caller_key               2ab91047132da79f8f3052f95c6f52de  20261025_claims_account.sql
--   public._is_admin_key             c9e14ff9b4713cd87a73ceac3296f20b  20261019_mytapturf.sql
--   private.booking_state            5ac49740dc46cb8374312ce12df53d50  20261106_booking_requests.sql
-- Read and left as they are: public.turf_contact_clicks (turf_id, kind,
-- source, signed_in, user_id, created_at), public.users (id only),
-- public.games (id, creator_id, series_id, created_at),
-- private.game_series (host_id, created_at), public.game_participants
-- (game_id, user_id, joined_at), public.reviews (user_id, source,
-- created_at), private.tool_use_log (user_id, used_at),
-- private.booking_requests (turf_id, user_id, starts_at, ends_at, hours,
-- status, created_at; never the name, the number or the note),
-- private.contact_outcomes (turf_id, outcome, slot_date, slot_hour,
-- created_at) and public.turfs (id, name, city, slug, is_active and the
-- price columns). No table is altered, nothing is written anywhere, and
-- no index is added. Cost: each function is one statement. It reads each
-- table whole (the all-time window needs every row), once or twice, into
-- working sets that the three windows then share, and looks accounts up
-- in public.users by id; nothing is read row by row from the app. These
-- tables are small: on 28 Nov 2026 the taps were 1,812 rows, the answers
-- 50, the booking requests 1. The card reads it only when the site owner
-- opens the fold.
--
-- Needs 20260930_turf_contact_clicks.sql, 20261019_mytapturf.sql,
-- 20261025_claims_account.sql, 20261027_tool_users.sql,
-- 20261102_game_series.sql, 20261106_booking_requests.sql and
-- 20261113_contact_outcomes.sql (it refuses to run without them, changing
-- nothing). Additive: two functions. Written without the destructive SQL
-- keywords; nothing is taken away. No table, no grant or policy on a
-- table, no trigger, no job. Safe to run again.
-- The app works before this file: the route finds no function, asks again
-- only after a minute per instance, and the admin's card says "These
-- numbers aren't available yet."
-- Nothing new is stored, so there is nothing more to clear on an account
-- erasure. Shown to the site owner alone, in /admin: never on a public
-- page, in a title, a description, an og tag or JSON-LD.
-- Test: scripts/sql-tests/growth_numbers.check.mjs (PGlite).

do $$
begin
  if to_regprocedure('public._caller_key(text)') is null
     or to_regprocedure('public._is_admin_key(text)') is null
     or to_regprocedure('private.booking_state(text, timestamp with time zone, timestamp with time zone)') is null
     or to_regclass('public.turf_contact_clicks') is null
     or to_regclass('public.users') is null
     or to_regclass('public.games') is null
     or to_regclass('private.game_series') is null
     or to_regclass('public.game_participants') is null
     or to_regclass('public.reviews') is null
     or to_regclass('private.tool_use_log') is null
     or to_regclass('private.booking_requests') is null
     or to_regclass('private.contact_outcomes') is null
     or to_regclass('public.turfs') is null then
    raise exception 'growth_numbers needs 20260930_turf_contact_clicks.sql, 20261019_mytapturf.sql, 20261025_claims_account.sql, 20261027_tool_users.sql, 20261102_game_series.sql, 20261106_booking_requests.sql and 20261113_contact_outcomes.sql first';
  end if;
  -- Every column the two reads name is there (a function's body is only checked when it runs).
  if (select count(*)
        from information_schema.columns c
       where (c.table_schema, c.table_name, c.column_name) in (
               ('public', 'turf_contact_clicks', 'turf_id'), ('public', 'turf_contact_clicks', 'kind'), ('public', 'turf_contact_clicks', 'source'),
               ('public', 'turf_contact_clicks', 'signed_in'), ('public', 'turf_contact_clicks', 'user_id'), ('public', 'turf_contact_clicks', 'created_at'),
               ('public', 'games', 'creator_id'), ('public', 'games', 'series_id'), ('public', 'games', 'created_at'),
               ('private', 'game_series', 'host_id'), ('private', 'game_series', 'created_at'),
               ('public', 'game_participants', 'game_id'), ('public', 'game_participants', 'user_id'), ('public', 'game_participants', 'joined_at'),
               ('public', 'reviews', 'user_id'), ('public', 'reviews', 'source'), ('public', 'reviews', 'created_at'),
               ('private', 'tool_use_log', 'user_id'), ('private', 'tool_use_log', 'used_at'),
               ('private', 'booking_requests', 'turf_id'), ('private', 'booking_requests', 'user_id'), ('private', 'booking_requests', 'starts_at'),
               ('private', 'booking_requests', 'ends_at'), ('private', 'booking_requests', 'hours'), ('private', 'booking_requests', 'status'),
               ('private', 'booking_requests', 'created_at'),
               ('private', 'contact_outcomes', 'turf_id'), ('private', 'contact_outcomes', 'outcome'), ('private', 'contact_outcomes', 'slot_date'),
               ('private', 'contact_outcomes', 'slot_hour'), ('private', 'contact_outcomes', 'created_at'),
               ('public', 'turfs', 'name'), ('public', 'turfs', 'city'), ('public', 'turfs', 'slug'), ('public', 'turfs', 'is_active'),
               ('public', 'turfs', 'morning_price'), ('public', 'turfs', 'afternoon_price'), ('public', 'turfs', 'evening_price'),
               ('public', 'turfs', 'weekend_morning_price'), ('public', 'turfs', 'weekend_afternoon_price'), ('public', 'turfs', 'weekend_evening_price'),
               ('public', 'turfs', 'pricing_bands'), ('public', 'turfs', 'price_unit'), ('public', 'turfs', 'slot_minutes'),
               ('public', 'turfs', 'price_owner_confirmed'))) <> 45 then
    raise exception 'growth_numbers: a column it reads is missing (see the list in its guard)';
  end if;
  -- Every time it turns into an India day is a timestamp with its zone (a bare timestamp would land on the wrong day).
  if (select count(*)
        from information_schema.columns c
       where c.data_type = 'timestamp with time zone'
         and (c.table_schema, c.table_name, c.column_name) in (
               ('public', 'turf_contact_clicks', 'created_at'), ('public', 'games', 'created_at'), ('private', 'game_series', 'created_at'),
               ('public', 'game_participants', 'joined_at'), ('public', 'reviews', 'created_at'), ('private', 'tool_use_log', 'used_at'),
               ('private', 'booking_requests', 'created_at'), ('private', 'booking_requests', 'starts_at'), ('private', 'booking_requests', 'ends_at'),
               ('private', 'contact_outcomes', 'created_at'))) <> 10 then
    raise exception 'growth_numbers: a time it reads is not a timestamp with time zone (see the list in its guard)';
  end if;
end;
$$;

-- ── 1. People, contacts, repeat users and bookings: three windows (the site owner only) ──

create or replace function public.admin_growth(p_token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k text := public._caller_key(p_token);
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_since7 date;
  v_since30 date;
  v_out jsonb;
begin
  if k is null or not coalesce(public._is_admin_key(k), false) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  -- Today and the 6 (or 29) days before it, India days: admin_contact_outcome_totals' own windows.
  v_since7 := v_today - 6;
  v_since30 := v_today - 29;
  with w(key, days, since) as (
    values ('d7', 7, v_since7), ('d30', 30, v_since30), ('all', null::integer, null::date)
  ),
  -- Every tap, once: its India day, and its account when it reached the turf and the account is there.
  taps as materialized (
    select c.turf_id, c.kind, c.source, c.signed_in,
           (c.created_at at time zone 'Asia/Kolkata')::date as day,
           case when c.signed_in and u.id is not null then c.user_id end as who
      from public.turf_contact_clicks c
      left join public.users u on u.id = c.user_id
  ),
  -- Everything an account did that has a time on it: who, the India day, what.
  acts as materialized (
    select t.who, t.day, 'contact'::text as act
      from taps t
     where t.who is not null
    union all
    select g.creator_id, (g.created_at at time zone 'Asia/Kolkata')::date, 'host'
      from public.games g
      join public.users u on u.id = g.creator_id
     where g.series_id is null and g.created_at is not null
    union all
    select s.host_id, (s.created_at at time zone 'Asia/Kolkata')::date, 'host'
      from private.game_series s
      join public.users u on u.id = s.host_id
    union all
    select p.user_id, (p.joined_at at time zone 'Asia/Kolkata')::date, 'join'
      from public.game_participants p
      join public.games g on g.id = p.game_id
      join public.users u on u.id = p.user_id
     where p.joined_at is not null and p.user_id is distinct from g.creator_id
    union all
    select r.user_id, (r.created_at at time zone 'Asia/Kolkata')::date, 'review'
      from public.reviews r
      join public.users u on u.id = r.user_id
     where r.source is null and r.created_at is not null
    union all
    select l.user_id, (l.used_at at time zone 'Asia/Kolkata')::date, 'tool'
      from private.tool_use_log l
      join public.users u on u.id = l.user_id
    union all
    select b.user_id, (b.created_at at time zone 'Asia/Kolkata')::date, 'request'
      from private.booking_requests b
      join public.users u on u.id = b.user_id
  ),
  reqs as materialized (
    select (b.created_at at time zone 'Asia/Kolkata')::date as day,
           private.booking_state(b.status, b.starts_at, v_now) as state,
           b.hours, b.ends_at
      from private.booking_requests b
  ),
  said as materialized (
    select (o.created_at at time zone 'Asia/Kolkata')::date as day, o.outcome
      from private.contact_outcomes o
     where o.outcome <> 'dismissed'
  )
  select jsonb_build_object(
    'today', v_today::text,
    'windows', (
      select jsonb_object_agg(w.key, jsonb_build_object(
               'days', w.days,
               'since', coalesce(w.since, tp.first_day)::text,
               'taps', tp.taps, 'taps_reached', tp.reached, 'taps_signed_out', tp.signed_out, 'taps_no_account', tp.no_account,
               'call', tp.call, 'whatsapp', tp.whatsapp, 'slot_ask', tp.slot_ask,
               'people', pe.people, 'contacts', pe.contacts, 'turfs', tp.turfs,
               'came_back', pe.came_back, 'multi_turf', pe.multi_turf,
               'active', ac.active, 'active_2days', ac.active_2days,
               'did_contact', ac.did_contact, 'did_host', ac.did_host, 'did_join', ac.did_join,
               'did_review', ac.did_review, 'did_tool', ac.did_tool, 'did_request', ac.did_request,
               'requests', rq.requests, 'confirmed', rq.confirmed, 'confirmed_hours', rq.confirmed_hours, 'confirmed_over', rq.confirmed_over,
               'waiting', rq.waiting, 'declined', rq.declined, 'cancelled', rq.cancelled, 'expired', rq.expired,
               'answered', sd.answered, 'got_slot', sd.got_slot))
        from w
       cross join lateral (
          select count(*) as taps,
                 count(*) filter (where t.signed_in) as reached,
                 count(*) filter (where not t.signed_in) as signed_out,
                 count(*) filter (where t.signed_in and t.who is null) as no_account,
                 count(*) filter (where t.signed_in and t.kind = 'call' and t.source <> 'slot_ask') as call,
                 count(*) filter (where t.signed_in and t.kind = 'whatsapp' and t.source <> 'slot_ask') as whatsapp,
                 count(*) filter (where t.signed_in and t.source = 'slot_ask') as slot_ask,
                 count(distinct t.turf_id) filter (where t.who is not null) as turfs,
                 min(t.day) as first_day
            from taps t
           where w.since is null or t.day >= w.since
       ) tp
       cross join lateral (
          select count(*) as people,
                 coalesce(sum(x.turfs), 0) as contacts,
                 count(*) filter (where x.days >= 2) as came_back,
                 count(*) filter (where x.turfs >= 2) as multi_turf
            from (
              select t.who, count(distinct t.turf_id) as turfs, count(distinct t.day) as days
                from taps t
               where t.who is not null and (w.since is null or t.day >= w.since)
               group by t.who
            ) x
       ) pe
       cross join lateral (
          select count(*) as active,
                 count(*) filter (where x.days >= 2) as active_2days,
                 count(*) filter (where x.did_contact) as did_contact,
                 count(*) filter (where x.did_host) as did_host,
                 count(*) filter (where x.did_join) as did_join,
                 count(*) filter (where x.did_review) as did_review,
                 count(*) filter (where x.did_tool) as did_tool,
                 count(*) filter (where x.did_request) as did_request
            from (
              select a.who, count(distinct a.day) as days,
                     bool_or(a.act = 'contact') as did_contact, bool_or(a.act = 'host') as did_host,
                     bool_or(a.act = 'join') as did_join, bool_or(a.act = 'review') as did_review,
                     bool_or(a.act = 'tool') as did_tool, bool_or(a.act = 'request') as did_request
                from acts a
               where w.since is null or a.day >= w.since
               group by a.who
            ) x
       ) ac
       cross join lateral (
          select count(*) as requests,
                 count(*) filter (where r.state = 'confirmed') as confirmed,
                 coalesce(sum(r.hours) filter (where r.state = 'confirmed'), 0) as confirmed_hours,
                 count(*) filter (where r.state = 'confirmed' and r.ends_at <= v_now) as confirmed_over,
                 count(*) filter (where r.state = 'waiting') as waiting,
                 count(*) filter (where r.state = 'declined') as declined,
                 count(*) filter (where r.state = 'cancelled') as cancelled,
                 count(*) filter (where r.state = 'expired') as expired
            from reqs r
           where w.since is null or r.day >= w.since
       ) rq
       cross join lateral (
          select count(*) as answered,
                 count(*) filter (where s.outcome = 'got_slot') as got_slot
            from said s
           where w.since is null or s.day >= w.since
       ) sd
    ),
    'top_turfs', (
      select jsonb_object_agg(w.key, coalesce(x.list, '[]'::jsonb))
        from w
       cross join lateral (
          select jsonb_agg(jsonb_build_object(
                   'id', y.turf_id, 'name', y.name, 'city', y.city, 'slug', y.slug, 'active', y.active,
                   'contacts', y.contacts, 'taps', y.taps)
                 order by y.contacts desc, y.taps desc, lower(y.name), y.turf_id) as list
            from (
              select t.turf_id,
                     nullif(btrim(f.name::text), '') as name,
                     nullif(lower(btrim(f.city)), '') as city,
                     nullif(btrim(f.slug), '') as slug,
                     coalesce(f.is_active, false) as active,
                     count(distinct t.who) as contacts,
                     count(*) as taps
                from taps t
                left join public.turfs f on f.id = t.turf_id
               where t.who is not null and (w.since is null or t.day >= w.since)
               group by t.turf_id, f.name, f.city, f.slug, f.is_active
               order by count(distinct t.who) desc, count(*) desc, lower(nullif(btrim(f.name::text), '')), t.turf_id
               limit 10
            ) y
       ) x
    )
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.admin_growth(text) from public, anon, authenticated;
-- The admin route calls it as the site owner's own session (authenticated) or with his Firebase token (anon); the check inside is the gate.
grant execute on function public.admin_growth(text) to anon, authenticated;

-- ── 2. The slots an estimate of booking value stands on, with each turf's listed prices (the site owner only) ──

create or replace function public.admin_growth_slots(p_token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k text := public._caller_key(p_token);
  -- The most rows either list returns.
  max_rows constant integer := 2000;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_out jsonb;
begin
  if k is null or not coalesce(public._is_admin_key(k), false) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  with conf as materialized (
    select b.id, b.turf_id, b.created_at, b.hours,
           (b.created_at at time zone 'Asia/Kolkata')::date as at_day,
           (b.starts_at at time zone 'Asia/Kolkata') as starts
      from private.booking_requests b
     where private.booking_state(b.status, b.starts_at, v_now) = 'confirmed'
     order by b.created_at desc, b.id desc
     limit max_rows
  ),
  got as materialized (
    select o.id, o.turf_id, o.created_at, o.slot_date, o.slot_hour,
           (o.created_at at time zone 'Asia/Kolkata')::date as at_day
      from private.contact_outcomes o
     where o.outcome = 'got_slot'
     order by o.created_at desc, o.id desc
     limit max_rows
  )
  select jsonb_build_object(
    'today', v_today::text,
    'cap', max_rows,
    'confirmed_n', (
      select count(*)
        from private.booking_requests b
       where private.booking_state(b.status, b.starts_at, v_now) = 'confirmed'
    ),
    'confirmed', coalesce((
      select jsonb_agg(jsonb_build_object(
               'turf', c.turf_id, 'at', c.at_day::text, 'date', c.starts::date::text,
               'hour', extract(hour from c.starts)::integer, 'minute', extract(minute from c.starts)::integer,
               'hours', c.hours)
             order by c.created_at desc, c.id desc)
        from conf c
    ), '[]'::jsonb),
    'got_slot_n', (
      select count(*)
        from private.contact_outcomes o
       where o.outcome = 'got_slot'
    ),
    'got_slot', coalesce((
      select jsonb_agg(jsonb_build_object(
               'turf', g.turf_id, 'at', g.at_day::text, 'date', g.slot_date::text, 'hour', g.slot_hour)
             order by g.created_at desc, g.id desc)
        from got g
    ), '[]'::jsonb),
    'turfs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id,
               'morning_price', f.morning_price, 'afternoon_price', f.afternoon_price, 'evening_price', f.evening_price,
               'weekend_morning_price', f.weekend_morning_price, 'weekend_afternoon_price', f.weekend_afternoon_price,
               'weekend_evening_price', f.weekend_evening_price,
               'pricing_bands', f.pricing_bands, 'price_unit', f.price_unit, 'slot_minutes', f.slot_minutes,
               'price_owner_confirmed', f.price_owner_confirmed)
             order by f.id)
        from public.turfs f
       where f.id in (select c.turf_id from conf c union select g.turf_id from got g)
    ), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.admin_growth_slots(text) from public, anon, authenticated;
-- The admin route calls it as the site owner's own session (authenticated) or with his Firebase token (anon); the check inside is the gate.
grant execute on function public.admin_growth_slots(text) to anon, authenticated;
