set local lock_timeout = '5s';

-- "Did you get a slot?": the totals and every answer, for the admin
-- (26 Nov 2026). The site owner: "In admin can I see responses to the Did
-- you get the slot popup?". Until now he could only see them turf by turf,
-- inside the Owner outreach rows ("Players said: 4 got a slot, 2 slot
-- full, 1 no reply"; public.admin_contact_outcomes), one city at a time.
-- Offered a card of totals for all turfs with a 7-day and 30-day view, he
-- said: "Yes build the totals card in admin please", and then, of the
-- answers themselves: "I want to see detailed for this".
--
-- The answers are private.contact_outcomes (20261113_contact_outcomes.sql):
-- one row per answer, with the turf, the tap (call or whatsapp, and where
-- on the site it was), the answer, the reason, the slot named and when.
-- Nothing in a row says who answered: no account, no name, no number, no
-- network address, no device tag. This file adds two reads of that table
-- for the admin's "Did you get a slot?" card
-- (components/admin/OutcomeTotals.tsx through GET /api/admin/outcomes;
-- lib/admin/outcomeTotals.ts has the words).
--
-- New, two functions. Both are gated exactly as
-- public.admin_contact_outcomes: public._caller_key(p_token), then
-- public._is_admin_key; anyone but the site owner (no sign-in, a wrong
-- token, any other signed-in person) gets {error: forbidden} and nothing
-- else. Both are stable, security definer, search_path '', with execute
-- for anon and authenticated as admin_contact_outcomes has it (the admin
-- route calls them as the site owner's own session or with his Firebase
-- token; the check inside is the gate).
--
-- 1. public.admin_contact_outcome_totals(p_token text default null): jsonb
--      {today, windows: {d7, d30, all}, top_turfs, wrong_numbers,
--       wrong_number_turfs, hours}
--    today: India's date now.
--    windows: three objects with the same 21 keys each, counted over
--    every answer whatever became of its turf (active, switched off or
--    gone from public.turfs alike): the question is how the card was
--    answered, and an answer stays a real answer when its turf is later
--    switched off. (admin_contact_outcomes counts active turfs of one
--    city only, so its rows can add up to less.)
--      d7   the last 7 India days, today included (since = today - 6)
--      d30  the last 30 India days, today included (since = today - 29:
--           admin_contact_outcomes' own 30-day window)
--      all  every answer kept (days null; since is the India day of the
--           first answer, null with none)
--    Each window:
--      days, since
--      total             every row in the window
--      answered          rows that are an answer: got_slot, not_this_time
--                        or deciding (a closed card, dismissed, is not)
--      got_slot, full, price, no_reply, wrong_number, just_asking,
--      no_reason, deciding, dismissed
--                        the nine counts admin_contact_outcomes has, by
--                        the same rules (no_reason: not_this_time with no
--                        reason). Each row is in exactly one, so the nine
--                        add up to total, and the first eight to answered
--      turfs             different turfs with any row
--      turfs_answered    different turfs with an answer
--      call, whatsapp    rows by the tap's kind (they add up to total)
--      slot_ask          rows whose source is slot_ask (the turf page's
--                        "Ask for a slot", which opens WhatsApp, so in
--                        the app these are counted in whatsapp too)
--      call_answered, whatsapp_answered, slot_ask_answered
--                        the same three, answers only
--    top_turfs: the last 30 India days. The turfs with the most answers
--    (closed cards do not count), most first, then most got_slot, then by
--    name, then by id; 10 at most; a turf with only closed cards is not
--    listed. Each: {id, name, city, slug, active, answered, got_slot,
--    full, price, no_reply, wrong_number, just_asking, no_reason,
--    deciding, dismissed}. name, city (lower case) and slug are
--    public.turfs' own and null for a turf that is gone; active is true
--    only for a turf that is there and switched on.
--    wrong_numbers: the last 30 India days. Every turf a player said has
--    a wrong number, most reports first, then the latest report first,
--    then by name, then by id; 20 at most. Each: {id, name, city, slug,
--    active, wrong_number, last} (last: India's date of the latest
--    report). wrong_number_turfs: how many such turfs there are in all,
--    so a list cut at 20 can say so.
--    hours: the last 30 India days. The hours players said they got (the
--    slot_hour of got_slot rows that name one; 0 and 1 are the late night
--    of the day they named), most named first, then the earlier hour; 5
--    at most. Each: {hour, n}.
--
-- 2. public.admin_contact_outcome_list(p_token text default null,
--      p_days integer default 30, p_limit integer default 20,
--      p_dismissed boolean default false): jsonb
--      {days, since, today, limit, dismissed, n, rows}
--    The answers themselves, newest first (then the row added last
--    first). p_days: 7 or 30 are the windows above; 0 is every answer
--    kept; anything else is 30. p_limit: how many of the newest to
--    return, 1 to 200 (anything under 1 is 1, over 200 is 200, none is
--    20); there is no cursor, the card asks for a longer list. Closed
--    cards (dismissed) are left out unless p_dismissed is true. days,
--    since (null for 0), today, limit and dismissed say what was
--    counted; n is how many rows the window holds under the same switch,
--    so the card knows whether there are more. Each row is what the
--    table holds and the turf's name, city and slug, nothing else:
--      {id, at, turf, name, city, slug, active, kind, source, outcome,
--       reason, slot_date, slot_hour, ask}
--    at is created_at in UTC ("2026-11-26T13:57:04Z"; the card says it in
--    India time); turf is the turf's id; name, city, slug and active as
--    in top_turfs, so a row whose turf is gone or switched off is still
--    listed, without a name or as not active. signed_in is not returned.
--    ask (the site owner, of the list: "Do we know which slot?"): an
--    answer keeps slot_date and slot_hour only for a slot that is today
--    or tomorrow when it is given, so an answer about a day further on
--    names no slot, though the ask itself is in private.slot_asks
--    (20261118_slot_asks.sql). For a row whose source is slot_ask, ask is
--    the ask it most likely answers: the latest private.slot_asks row for
--    the same turf made at or before the answer and no more than 12 hours
--    5 minutes before it (the card asks at most 12 hours after an "Ask
--    for a slot" tap, lib/outcome/prompt.ts ASK_MAX_AGE_MS; the 5 minutes
--    are for the answering itself), as it was asked:
--      {date, hour, minute, minutes, sport, players, at}
--    (date: the calendar date of the start; at: when it was asked, in UTC
--    as above). Null when there is none, and always null for any other
--    source. It is a match by turf and time, not a stored link, and the
--    card says so; two players asking one turf in the same hours can be
--    told apart by nothing in either table. Nothing about who asked is
--    in private.slot_asks either, and its signed_in is not returned.
--    A second function, not a bigger first one: the totals are one fixed
--    answer read once when the card opens, while the list is asked again
--    for each window, each "Show more" and the closed-cards switch.
--
-- Replaced: none. public.admin_contact_outcomes, public.contact_outcome_add
-- and public.owner_report_said (20261113_contact_outcomes.sql) are not
-- touched, and neither are the Owner outreach rows or the owner's report
-- that read them. The two functions this file calls are not changed here.
-- Each md5 is md5(prosrc) of the function's latest body in the repo's
-- migrations; production was not read for this file, so compare before
-- applying:
--   select p.proname, md5(p.prosrc) from pg_proc p
--     join pg_namespace s on s.oid = p.pronamespace
--    where s.nspname = 'public' and p.proname in ('_caller_key', '_is_admin_key');
--   public._caller_key               2ab91047132da79f8f3052f95c6f52de  20261025_claims_account.sql
--   public._is_admin_key             c9e14ff9b4713cd87a73ceac3296f20b  20261019_mytapturf.sql
-- Read and left as they are: private.contact_outcomes (every column but
-- signed_in), public.turfs (id, name, city, slug, is_active) and
-- private.slot_asks (turf_id, slot_date, slot_hour, slot_minute, minutes,
-- sport, players, created_at). No table is altered, nothing is written
-- anywhere, and no index is added: the two windows and the list use
-- contact_outcomes_created_idx (created_at desc), an answer's ask is
-- found by slot_asks_turf_idx (turf_id, created_at desc) for the rows
-- returned only, and "all" reads the whole table, which is capped at
-- 3000 rows a day by contact_outcome_add and held 45 rows on 26 Nov 2026.
--
-- Needs 20261019_mytapturf.sql, 20261025_claims_account.sql,
-- 20261113_contact_outcomes.sql and 20261118_slot_asks.sql (it refuses
-- to run without them, changing nothing). Additive: two functions. Written without the destructive SQL
-- keywords; nothing is removed. No table, no grant or policy on a table,
-- no trigger, no job. Safe to run again.
-- The app works before this file: the route finds no function, asks again
-- only after a minute per instance, and the admin's card says "Totals
-- aren't available yet." Owner outreach's "Players said" is as it was.
-- Nothing about a person is read or returned, so there is nothing more to
-- clear on an account erasure. Shown to the site owner alone, in /admin:
-- never on a public page, in a title, a description, an og tag or JSON-LD.
-- Test: scripts/sql-tests/contact_outcome_totals.check.mjs (PGlite).

do $$
begin
  if to_regprocedure('public._caller_key(text)') is null
     or to_regprocedure('public._is_admin_key(text)') is null
     or to_regclass('private.contact_outcomes') is null
     or to_regclass('private.slot_asks') is null
     or to_regclass('public.turfs') is null then
    raise exception 'contact_outcome_totals needs 20261019_mytapturf.sql, 20261025_claims_account.sql, 20261113_contact_outcomes.sql and 20261118_slot_asks.sql first';
  end if;
end;
$$;

-- ── 1. The totals: three windows, the turfs to look at, the hours (the site owner only) ──

create or replace function public.admin_contact_outcome_totals(p_token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k text := public._caller_key(p_token);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_since7 date;
  v_since30 date;
  v_t7 timestamptz;
  v_t30 timestamptz;
begin
  if k is null or not coalesce(public._is_admin_key(k), false) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  -- Today and the 6 (or 29) days before it, India days: admin_contact_outcomes' own window for 30.
  v_since7 := v_today - 6;
  v_since30 := v_today - 29;
  v_t7 := v_since7::timestamp at time zone 'Asia/Kolkata';
  v_t30 := v_since30::timestamp at time zone 'Asia/Kolkata';
  return jsonb_build_object(
    'today', v_today::text,
    'windows', (
      select jsonb_object_agg(w.key, jsonb_build_object(
               'days', w.days,
               'since', coalesce(w.since, (c.first_at at time zone 'Asia/Kolkata')::date)::text,
               'total', c.total, 'answered', c.answered,
               'got_slot', c.got_slot, 'full', c.slot_full, 'price', c.price, 'no_reply', c.no_reply,
               'wrong_number', c.wrong_number, 'just_asking', c.just_asking, 'no_reason', c.no_reason,
               'deciding', c.deciding, 'dismissed', c.dismissed,
               'turfs', c.turfs, 'turfs_answered', c.turfs_answered,
               'call', c.call, 'whatsapp', c.whatsapp, 'slot_ask', c.slot_ask,
               'call_answered', c.call_answered, 'whatsapp_answered', c.whatsapp_answered, 'slot_ask_answered', c.slot_ask_answered))
        from (values ('d7', 7, v_since7, v_t7), ('d30', 30, v_since30, v_t30), ('all', null::integer, null::date, null::timestamptz)) as w(key, days, since, t)
       cross join lateral (
          select count(*) as total,
                 count(*) filter (where o.outcome <> 'dismissed') as answered,
                 count(*) filter (where o.outcome = 'got_slot') as got_slot,
                 count(*) filter (where o.reason = 'full') as slot_full,
                 count(*) filter (where o.reason = 'price') as price,
                 count(*) filter (where o.reason = 'no_reply') as no_reply,
                 count(*) filter (where o.reason = 'wrong_number') as wrong_number,
                 count(*) filter (where o.reason = 'just_asking') as just_asking,
                 count(*) filter (where o.outcome = 'not_this_time' and o.reason is null) as no_reason,
                 count(*) filter (where o.outcome = 'deciding') as deciding,
                 count(*) filter (where o.outcome = 'dismissed') as dismissed,
                 count(distinct o.turf_id) as turfs,
                 count(distinct o.turf_id) filter (where o.outcome <> 'dismissed') as turfs_answered,
                 count(*) filter (where o.kind = 'call') as call,
                 count(*) filter (where o.kind = 'whatsapp') as whatsapp,
                 count(*) filter (where o.source = 'slot_ask') as slot_ask,
                 count(*) filter (where o.kind = 'call' and o.outcome <> 'dismissed') as call_answered,
                 count(*) filter (where o.kind = 'whatsapp' and o.outcome <> 'dismissed') as whatsapp_answered,
                 count(*) filter (where o.source = 'slot_ask' and o.outcome <> 'dismissed') as slot_ask_answered,
                 min(o.created_at) as first_at
            from private.contact_outcomes o
           where w.t is null or o.created_at >= w.t
       ) c
    ),
    'top_turfs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.turf_id, 'name', x.name, 'city', x.city, 'slug', x.slug, 'active', x.active,
               'answered', x.answered, 'got_slot', x.got_slot, 'full', x.slot_full, 'price', x.price, 'no_reply', x.no_reply,
               'wrong_number', x.wrong_number, 'just_asking', x.just_asking, 'no_reason', x.no_reason,
               'deciding', x.deciding, 'dismissed', x.dismissed)
             order by x.answered desc, x.got_slot desc, lower(x.name), x.turf_id)
        from (
          select o.turf_id,
                 nullif(btrim(t.name::text), '') as name,
                 nullif(lower(btrim(t.city)), '') as city,
                 nullif(btrim(t.slug), '') as slug,
                 coalesce(t.is_active, false) as active,
                 count(*) filter (where o.outcome <> 'dismissed') as answered,
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
            left join public.turfs t on t.id = o.turf_id
           where o.created_at >= v_t30
           group by o.turf_id, t.name, t.city, t.slug, t.is_active
          having count(*) filter (where o.outcome <> 'dismissed') > 0
           order by count(*) filter (where o.outcome <> 'dismissed') desc, count(*) filter (where o.outcome = 'got_slot') desc, lower(nullif(btrim(t.name::text), '')), o.turf_id
           limit 10
        ) x
    ), '[]'::jsonb),
    'wrong_numbers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.turf_id, 'name', x.name, 'city', x.city, 'slug', x.slug, 'active', x.active,
               'wrong_number', x.wrong_number, 'last', (x.last_at at time zone 'Asia/Kolkata')::date::text)
             order by x.wrong_number desc, x.last_at desc, lower(x.name), x.turf_id)
        from (
          select o.turf_id,
                 nullif(btrim(t.name::text), '') as name,
                 nullif(lower(btrim(t.city)), '') as city,
                 nullif(btrim(t.slug), '') as slug,
                 coalesce(t.is_active, false) as active,
                 count(*) as wrong_number,
                 max(o.created_at) as last_at
            from private.contact_outcomes o
            left join public.turfs t on t.id = o.turf_id
           where o.created_at >= v_t30 and o.reason = 'wrong_number'
           group by o.turf_id, t.name, t.city, t.slug, t.is_active
           order by count(*) desc, max(o.created_at) desc, lower(nullif(btrim(t.name::text), '')), o.turf_id
           limit 20
        ) x
    ), '[]'::jsonb),
    'wrong_number_turfs', (
      select count(distinct o.turf_id)
        from private.contact_outcomes o
       where o.created_at >= v_t30 and o.reason = 'wrong_number'
    ),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h.slot_hour, 'n', h.n) order by h.n desc, h.slot_hour)
        from (
          select o.slot_hour, count(*) as n
            from private.contact_outcomes o
           where o.created_at >= v_t30 and o.outcome = 'got_slot' and o.slot_hour is not null
           group by o.slot_hour
           order by count(*) desc, o.slot_hour
           limit 5
        ) h
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_contact_outcome_totals(text) from public, anon, authenticated;
-- The admin route calls it as the site owner's own session (authenticated) or with his Firebase token (anon); the check inside is the gate.
grant execute on function public.admin_contact_outcome_totals(text) to anon, authenticated;

-- ── 2. Every answer, newest first (the site owner only) ──

create or replace function public.admin_contact_outcome_list(p_token text default null, p_days integer default 30, p_limit integer default 20, p_dismissed boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k text := public._caller_key(p_token);
  -- The longest list ever returned.
  max_rows constant integer := 200;
  -- How long before an answer its "Ask for a slot" can have been sent: the card's 12 hours and 5 minutes to answer it.
  ask_window constant interval := interval '12 hours 5 minutes';
  -- 7, 30, or 0 for every answer kept.
  v_days integer := case when p_days = 7 then 7 when p_days = 0 then 0 else 30 end;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), max_rows);
  v_closed boolean := coalesce(p_dismissed, false);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_since date;
  v_t_since timestamptz;
begin
  if k is null or not coalesce(public._is_admin_key(k), false) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if v_days > 0 then
    v_since := v_today - (v_days - 1);
    v_t_since := v_since::timestamp at time zone 'Asia/Kolkata';
  end if;
  return jsonb_build_object(
    'days', v_days,
    'since', v_since::text,
    'today', v_today::text,
    'limit', v_limit,
    'dismissed', v_closed,
    'n', (
      select count(*)
        from private.contact_outcomes o
       where (v_t_since is null or o.created_at >= v_t_since) and (v_closed or o.outcome <> 'dismissed')
    ),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id,
               'at', to_char(x.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
               'turf', x.turf_id, 'name', x.name, 'city', x.city, 'slug', x.slug, 'active', x.active,
               'kind', x.kind, 'source', x.source, 'outcome', x.outcome, 'reason', x.reason,
               'slot_date', x.slot_date::text, 'slot_hour', x.slot_hour,
               'ask', case when a.created_at is not null then jsonb_build_object(
                 'date', a.slot_date::text, 'hour', a.slot_hour, 'minute', a.slot_minute, 'minutes', a.minutes,
                 'sport', a.sport, 'players', a.players,
                 'at', to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) end)
             order by x.created_at desc, x.id desc)
        from (
          select o.id, o.created_at, o.turf_id, o.kind, o.source, o.outcome, o.reason, o.slot_date, o.slot_hour,
                 nullif(btrim(t.name::text), '') as name,
                 nullif(lower(btrim(t.city)), '') as city,
                 nullif(btrim(t.slug), '') as slug,
                 coalesce(t.is_active, false) as active
            from private.contact_outcomes o
            left join public.turfs t on t.id = o.turf_id
           where (v_t_since is null or o.created_at >= v_t_since) and (v_closed or o.outcome <> 'dismissed')
           order by o.created_at desc, o.id desc
           limit v_limit
        ) x
        -- The ask this answer most likely answers: the latest one for the same turf in the hours before it. Only for "Ask for a slot" taps.
        left join lateral (
          select s.slot_date, s.slot_hour, s.slot_minute, s.minutes, s.sport, s.players, s.created_at
            from private.slot_asks s
           where x.source = 'slot_ask' and s.turf_id = x.turf_id
             and s.created_at <= x.created_at and s.created_at >= x.created_at - ask_window
           order by s.created_at desc, s.id desc
           limit 1
        ) a on true
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_contact_outcome_list(text, integer, integer, boolean) from public, anon, authenticated;
-- The admin route calls it as the site owner's own session (authenticated) or with his Firebase token (anon); the check inside is the gate.
grant execute on function public.admin_contact_outcome_list(text, integer, integer, boolean) to anon, authenticated;
