set local lock_timeout = '5s';

-- Owner outreach (12 Nov 2026). The site owner is starting to talk to turf
-- owners: in the last 30 days players tapped Call or WhatsApp 768 times on
-- turf pages (public.turf_contact_clicks), and 6 turfs are claimed
-- (public.turf_owners). He and his data team phone and WhatsApp the owners
-- of turfs nobody has claimed, city by city, Hyderabad first, and send each
-- a free report of what TapTurf did for their turf, with a link to claim
-- the page. This file adds the admin's list, a note of who was contacted,
-- and the read behind the report page.
--
-- 1. The admin's "Owner outreach" section (components/admin/OwnerOutreach.tsx
--    through /api/admin/outreach, the site owner only:
--    public._caller_key(p_token) and public._is_admin_key, as
--    admin_email_status; anyone else gets {error: forbidden}):
--      public.admin_owner_outreach(p_token, p_city, p_days): jsonb {city,
--        days, since, today, cities: [{city, n}], turfs: [...]}. One row
--        per active turf of the city (lower case, 'hyderabad' when none is
--        given), most taps first (calls + WhatsApps), then most page
--        views, then by name: id, slug, name, area, views
--        (public.turf_daily_views), calls and whatsapp
--        (public.turf_contact_clicks) over the last p_days India days,
--        today included (30, or 90; anything else is 30: the window
--        public.owner_dashboard counts), taps30 and views30 (the same
--        over the last 30 India days whatever p_days is: what the
--        report page shows, so the WhatsApp message and the report say the
--        same numbers), claim (active, pending or null, from
--        public.turf_owners), the turf's own listed numbers
--        (owner_phone, contact_phone, landline_phone, whatsapp_phone: the
--        columns the turf page's Call and WhatsApp buttons pick from,
--        picked in the app by lib/utils/contact.ts, never here), and the
--        outreach note (status, note, by, at). cities is
--        public.city_turf_counts, for the picker. One jsonb answer, so
--        PostgREST's row cap never cuts it (432 active turfs in Hyderabad
--        on 12 Nov 2026). The numbers are the turfs' public listed ones,
--        already on their pages; nothing about a player or an account.
--      public.admin_owner_outreach_set(p_token, p_turf_id, p_status,
--        p_note, p_by): the note for one turf: not_contacted, contacted,
--        interested, not_interested or wrong_number, an optional note of at
--        most 200 characters, and who set it (a name typed in the admin, at
--        most 40 characters, 'Site owner' when none; the team shares the
--        site owner's sign-in, so the account can't tell them apart).
--        {ok, status, note, by, at}; {error: bad} for another status or a
--        longer note, {error: not_found} for a turf that doesn't exist.
--
-- 2. The owner's report page (/report/<token>, no sign-in; the token is the
--    turf's id signed by the app, lib/report/token.ts):
--      public.owner_report(p_key, p_turf_id): server key only
--        (private.account_key_ok, as email_claim). {r: ok, turf: {id, slug,
--        name, area, city}, claimed, days: 30, since, today, now: {views,
--        calls, whatsapp, ask}, prev: {the same, the 30 days before},
--        series: [{day, calls, whatsapp}] for each of the 30 days}.
--        views, calls, whatsapp and ask are counted exactly as
--        public.owner_dashboard counts them for the turf's owner on
--        myTapturf (ask: public.ask_queries rows whose filters.shown_ids
--        holds the turf), so the report and the owner's Analytics tab
--        agree. {r: not_found} for a turf that doesn't exist or isn't
--        active; {r: unavailable} without the key. Counts only: never a
--        number, a name, an account, a query's words or anything else about
--        a person. Read only: it writes nothing.
--
-- Table (schema private, RLS on, no grant to anyone; only the two admin
-- functions read or write it; no foreign key, as private.booking_requests,
-- so nothing here locks public.turfs):
--   private.owner_outreach   one row per turf once somebody sets it:
--                            turf_id, status, note, updated_by, updated_at.
--                            A turf with no row is "Not contacted". No
--                            personal data but the team member's typed name.
--
-- Replaced: none. Every function this file calls, as production runs it
-- (md5(prosrc), read 12 Nov 2026), equals its latest body in the repo:
--   public._caller_key               2ab91047132da79f8f3052f95c6f52de  20261025_claims_account.sql
--   public._is_admin_key             c9e14ff9b4713cd87a73ceac3296f20b  20261019_mytapturf.sql
--   private.account_key_ok           ca605fa89a97497134b690e753dc5c0e  20261021_accounts_usernames.sql
-- The rule it follows and leaves as it is (the window and the four counts):
--   public.owner_dashboard           36b19ecb4a52a092dbc3648b49707262  20261028_owner_call_number.sql
--
-- Needs 20261019_mytapturf.sql, 20261021_accounts_usernames.sql and
-- 20261025_claims_account.sql (it refuses to run without them, changing
-- nothing). Additive: one table, three functions. Written without the
-- destructive SQL keywords; nothing is removed. No grant or policy on a
-- public table changes, and public.turfs is never written. Safe to run
-- again (the notes stay as they are).
-- The app works before this file: the admin section says the file isn't
-- applied yet, and a report link answers 503 "try again later", never a
-- wrong number.
-- Test: scripts/sql-tests/owner_outreach.check.mjs (PGlite).

do $$
begin
  if to_regprocedure('public._caller_key(text)') is null
     or to_regprocedure('public._is_admin_key(text)') is null
     or to_regprocedure('private.account_key_ok(text)') is null
     or to_regclass('public.turf_daily_views') is null
     or to_regclass('public.turf_owners') is null then
    raise exception 'owner_outreach needs 20261019_mytapturf.sql, 20261021_accounts_usernames.sql and 20261025_claims_account.sql first';
  end if;
end;
$$;

-- ── 1. The note of who was contacted ──────────────────────

create table if not exists private.owner_outreach (
  turf_id uuid primary key,
  status text not null check (status in ('not_contacted', 'contacted', 'interested', 'not_interested', 'wrong_number')),
  note text check (note is null or char_length(note) between 1 and 200),
  updated_by text not null check (char_length(updated_by) between 1 and 40),
  updated_at timestamptz not null default now()
);
alter table private.owner_outreach enable row level security;
revoke all on table private.owner_outreach from public, anon, authenticated;
comment on table private.owner_outreach is 'Owner outreach: whether the team has contacted a turf, a short note, who set it and when. Read and written only by admin_owner_outreach and admin_owner_outreach_set.';

-- ── 2. The admin's list (the site owner only) ─────────────

create or replace function public.admin_owner_outreach(p_token text default null, p_city text default 'hyderabad', p_days integer default 30)
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
  v_since30 date;
  v_t_since timestamptz;
  v_t_since30 timestamptz;
begin
  if k is null or not coalesce(public._is_admin_key(k), false) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  v_since := v_today - (v_days - 1);
  v_since30 := v_today - 29;
  v_t_since := v_since::timestamp at time zone 'Asia/Kolkata';
  v_t_since30 := v_since30::timestamp at time zone 'Asia/Kolkata';
  return jsonb_build_object(
    'city', v_city,
    'days', v_days,
    'since', v_since::text,
    'today', v_today::text,
    'cities', coalesce((
      select jsonb_agg(jsonb_build_object('city', c.city, 'n', c.n) order by c.n desc, c.city)
        from public.city_turf_counts c
    ), '[]'::jsonb),
    'turfs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'slug', x.slug, 'name', x.name, 'area', x.area,
               'views', x.views, 'calls', x.calls, 'whatsapp', x.whatsapp,
               'taps30', x.taps30, 'views30', x.views30, 'claim', x.claim,
               'owner_phone', x.owner_phone, 'contact_phone', x.contact_phone,
               'landline_phone', x.landline_phone, 'whatsapp_phone', x.whatsapp_phone,
               'status', coalesce(x.status, 'not_contacted'), 'note', x.note, 'by', x.updated_by, 'at', x.updated_at)
             order by x.calls + x.whatsapp desc, x.views desc, lower(x.name), x.id)
        from (
          select t.id, t.slug, t.name::text as name, t.area,
                 coalesce(v.n, 0) as views, coalesce(c.calls, 0) as calls, coalesce(c.wa, 0) as whatsapp,
                 coalesce(c.taps30, 0) as taps30, coalesce(v.n30, 0) as views30,
                 case when exists (select 1 from public.turf_owners o where o.turf_id = t.id and o.status = 'active') then 'active'
                      when exists (select 1 from public.turf_owners o where o.turf_id = t.id and o.status = 'pending') then 'pending'
                 end as claim,
                 t.owner_phone, t.contact_info ->> 'phone' as contact_phone, t.landline_phone, t.whatsapp_phone,
                 n.status, n.note, n.updated_by, n.updated_at
            from public.turfs t
            left join (select d.turf_id, sum(d.views)::bigint as n,
                              coalesce(sum(d.views) filter (where d.day >= v_since30), 0)::bigint as n30
                         from public.turf_daily_views d
                        where d.day >= v_since
                        group by d.turf_id) v on v.turf_id = t.id
            left join (select k.turf_id,
                              count(*) filter (where k.kind = 'call') as calls,
                              count(*) filter (where k.kind = 'whatsapp') as wa,
                              count(*) filter (where k.kind in ('call', 'whatsapp') and k.created_at >= v_t_since30) as taps30
                         from public.turf_contact_clicks k
                        where k.created_at >= v_t_since
                        group by k.turf_id) c on c.turf_id = t.id
            left join private.owner_outreach n on n.turf_id = t.id
           where t.is_active and lower(t.city) = v_city
        ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- Set one turf's note. p_by is the team member's typed name ('Site owner' when none).
create or replace function public.admin_owner_outreach_set(p_token text, p_turf_id uuid, p_status text, p_note text default null, p_by text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := public._caller_key(p_token);
  v_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '');
  v_by text := coalesce(nullif(left(btrim(regexp_replace(coalesce(p_by, ''), '\s+', ' ', 'g')), 40), ''), 'Site owner');
  v_row private.owner_outreach;
begin
  if k is null or not coalesce(public._is_admin_key(k), false) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if p_status is null or p_status not in ('not_contacted', 'contacted', 'interested', 'not_interested', 'wrong_number')
     or char_length(coalesce(v_note, '')) > 200 then
    return jsonb_build_object('error', 'bad');
  end if;
  if p_turf_id is null or not exists (select 1 from public.turfs t where t.id = p_turf_id) then
    return jsonb_build_object('error', 'not_found');
  end if;
  insert into private.owner_outreach as o (turf_id, status, note, updated_by, updated_at)
  values (p_turf_id, p_status, v_note, v_by, now())
  on conflict (turf_id) do update
     set status = excluded.status, note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning o.* into v_row;
  return jsonb_build_object('ok', true, 'status', v_row.status, 'note', v_row.note, 'by', v_row.updated_by, 'at', v_row.updated_at);
end;
$$;

revoke all on function public.admin_owner_outreach(text, text, integer) from public, anon, authenticated;
revoke all on function public.admin_owner_outreach_set(text, uuid, text, text, text) from public, anon, authenticated;
-- The admin route calls them as the site owner's own session (authenticated) or with his Firebase token (anon); the check inside is the gate.
grant execute on function public.admin_owner_outreach(text, text, integer) to anon, authenticated;
grant execute on function public.admin_owner_outreach_set(text, uuid, text, text, text) to anon, authenticated;

-- ── 3. The owner's report (server key; counts only) ───────

create or replace function public.owner_report(p_key text, p_turf_id uuid)
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
  v_turf jsonb;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  select jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name::text, 'area', t.area, 'city', t.city)
    into v_turf
    from public.turfs t
   where t.id = p_turf_id and t.is_active;
  if v_turf is null then
    return jsonb_build_object('r', 'not_found');
  end if;
  -- The window public.owner_dashboard counts: today and the 29 days before it, India days; then the 30 before those.
  since := today - (d - 1);
  prev := since - d;
  t_since := since::timestamp at time zone 'Asia/Kolkata';
  t_prev := prev::timestamp at time zone 'Asia/Kolkata';
  return jsonb_build_object(
    'r', 'ok',
    'turf', v_turf,
    'claimed', exists (select 1 from public.turf_owners o where o.turf_id = p_turf_id and o.status = 'active'),
    'days', d,
    'since', since::text,
    'today', today::text,
    'now', jsonb_build_object(
      'views', (select coalesce(sum(v.views), 0) from public.turf_daily_views v where v.turf_id = p_turf_id and v.day >= since),
      'calls', (select count(*) from public.turf_contact_clicks c where c.turf_id = p_turf_id and c.kind = 'call' and c.created_at >= t_since),
      'whatsapp', (select count(*) from public.turf_contact_clicks c where c.turf_id = p_turf_id and c.kind = 'whatsapp' and c.created_at >= t_since),
      'ask', (select count(*) from public.ask_queries a where a.created_at >= t_since and a.filters -> 'shown_ids' ? p_turf_id::text)
    ),
    'prev', jsonb_build_object(
      'views', (select coalesce(sum(v.views), 0) from public.turf_daily_views v where v.turf_id = p_turf_id and v.day >= prev and v.day < since),
      'calls', (select count(*) from public.turf_contact_clicks c where c.turf_id = p_turf_id and c.kind = 'call' and c.created_at >= t_prev and c.created_at < t_since),
      'whatsapp', (select count(*) from public.turf_contact_clicks c where c.turf_id = p_turf_id and c.kind = 'whatsapp' and c.created_at >= t_prev and c.created_at < t_since),
      'ask', (select count(*) from public.ask_queries a where a.created_at >= t_prev and a.created_at < t_since and a.filters -> 'shown_ids' ? p_turf_id::text)
    ),
    'series', (
      select jsonb_agg(jsonb_build_object('day', g.day::text, 'calls', coalesce(c.calls, 0), 'whatsapp', coalesce(c.wa, 0)) order by g.day)
        from (select generate_series(since, today, interval '1 day')::date as day) g
        left join (
          select (k.created_at at time zone 'Asia/Kolkata')::date as day,
                 count(*) filter (where k.kind = 'call') as calls,
                 count(*) filter (where k.kind = 'whatsapp') as wa
            from public.turf_contact_clicks k
           where k.turf_id = p_turf_id and k.created_at >= t_since
           group by 1
        ) c on c.day = g.day
    )
  );
end;
$$;

revoke all on function public.owner_report(text, uuid) from public, anon, authenticated;
-- The report page's server reads it with the app's anon key and the server key (p_key), as email_claim; the key is the gate.
grant execute on function public.owner_report(text, uuid) to anon;
