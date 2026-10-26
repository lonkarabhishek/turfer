-- Game reports: "How was your game?" in place of stars and a blank box.
--
-- A report is the overall stars (reviews.rating, as before) plus a quick
-- scorecard: each part of the turf the player noticed (pitch, lights, the
-- sport's own row, staff, washroom, value) as Needs work, Okay or Great,
-- with up to three reason chips, the sport and time of day, whether they'd
-- play here again, an optional tip and an optional private note that only
-- the turf's owner reads. Google's numbers (turfs.rating, total_reviews)
-- don't change.
--
-- Writes move behind the server. Until now the browser inserted reviews
-- itself, and reviews_insert_app let anyone post a review as any user_id;
-- phone sign-ins (no Supabase session) could never edit or remove theirs.
-- From the app that ships with this, every write goes browser ->
-- /api/reviews -> the verified caller -> one of these functions, which
-- check the server key (private.account_key_ok) and take the account the
-- server resolved, never one the browser names:
--
-- 1. public.reviews gains sport, played_when, aspects (jsonb), play_again,
--    verified_via, edited_at and status (live, held, hidden, removed). All
--    public parts of a report. One TapTurf report per account per turf
--    (reviews_one_per_player_uidx; 0 duplicate pairs on 26 Oct; the 80
--    Google rows share a placeholder user and stay outside it).
-- 2. reviews_public_read shows live rows only (all 94 are live today).
-- 3. private.reviews_guard (BEFORE INSERT OR UPDATE, security invoker): a
--    write straight from the REST API (current_user anon or authenticated)
--    can't set the new columns, Google's columns, created_at, or move a
--    row to another user or turf. So nobody can forge a "Played in a
--    TapTurf game" badge, unhide a row or plant a Google row, even before
--    the lockdown. It must stay security invoker: inside a definer function
--    current_user is the owner, which would switch it off. The functions
--    below are definers owned by postgres, so their own writes pass.
-- 4. review_votes.withdrawn_at: taking a Helpful vote back keeps the row.
-- 5. private.review_notes (private notes to the owner, shown from the next
--    09:00 IST at least 8 hours later) and private.review_saves (every
--    save: version history, rate limits, channel and time taken).
-- 6. public.review_save, review_mine, review_remove, review_vote: server
--    key only.
-- 7. Replaced bodies, same signatures, every existing key kept:
--    turf_page (20261026_turf_page_found.sql: live reviews only, the new
--    fields, Helpful counts without self-votes or withdrawn ones, and two
--    new keys, review_aspects and review_stats.play_again), owner_dashboard
--    (20261019_mytapturf.sql: new keys under reviews), and
--    get_review_summary_batch and review_summary_progress
--    (20261010_listing_and_review_summary.sql: edits and removals make a
--    summary stale; reports with two rated parts count as written).
--
-- Apply before the app that uses it. The app before it keeps working on
-- it: the insert policy is unchanged, the new columns have defaults, the
-- new turf_page keys are additive. The direct insert, update, delete and
-- vote paths close in a separate file, 20261029_reviews_lockdown_step2.sql,
-- applied 48 hours after the deploy.
--
-- Additive: new columns, indexes, tables in the private schema, functions,
-- one trigger and one policy narrowed. Written without the destructive SQL
-- keywords. Nothing is deleted or merged. Safe to run again.

set local lock_timeout = '5s';

-- ── 1. Columns ─────────────────────────────────────────────

alter table public.reviews add column if not exists sport text
  check (sport is null or char_length(sport) between 1 and 40);
alter table public.reviews add column if not exists played_when text
  check (played_when in ('morning', 'afternoon', 'evening', 'night'));
alter table public.reviews add column if not exists aspects jsonb
  check (aspects is null or jsonb_typeof(aspects) = 'object');
alter table public.reviews add column if not exists play_again smallint
  check (play_again in (-1, 0, 1));
alter table public.reviews add column if not exists verified_via text
  check (verified_via in ('game', 'booking'));
alter table public.reviews add column if not exists edited_at timestamptz;
alter table public.reviews add column if not exists status text not null default 'live'
  check (status in ('live', 'held', 'hidden', 'removed'));

comment on column public.reviews.aspects is
  'Game report scorecard: {"pitch":{"score":1,"tags":["bounce"]},...}. score -1 Needs work, 0 Okay, 1 Great; tags from private.review_catalog(). Written by review_save only.';
comment on column public.reviews.verified_via is
  'game: the account hosted or joined a TapTurf game here before the report (private.review_verified_via). booking is kept for owner-confirmed play later.';
comment on column public.reviews.status is
  'live; removed by its author (review_remove); hidden by the site owner for abuse; held (phase 2). Only live rows are public.';
comment on column public.reviews.edited_at is
  'Set when the author changes the stars, tip, scorecard or play-again answer. The page shows Updated {month}.';

-- ── 2. One report per account per turf, and live rows only ──

create unique index if not exists reviews_one_per_player_uidx
  on public.reviews (user_id, turf_id) where source is null;
create index if not exists reviews_turf_live_idx
  on public.reviews (turf_id, created_at desc) where source is null and status = 'live';

alter policy reviews_public_read on public.reviews using (status = 'live');

-- ── 3. Writes straight from the API can't forge the new fields ──

create or replace function private.reviews_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Only the API roles are held back. The review functions (definers owned
  -- by postgres), Google imports (service_role) and the SQL editor pass.
  if current_user not in ('anon', 'authenticated') then
    return NEW;
  end if;
  if TG_OP = 'INSERT' then
    NEW.sport := null;
    NEW.played_when := null;
    NEW.aspects := null;
    NEW.play_again := null;
    NEW.verified_via := null;
    NEW.edited_at := null;
    NEW.status := 'live';
    NEW.source := null;
    NEW.external_review_id := null;
    NEW.author_name := null;
    NEW.author_url := null;
    NEW.source_url := null;
    NEW.source_date_label := null;
    NEW.created_at := now();
    NEW.updated_at := now();
  else
    NEW.sport := OLD.sport;
    NEW.played_when := OLD.played_when;
    NEW.aspects := OLD.aspects;
    NEW.play_again := OLD.play_again;
    NEW.verified_via := OLD.verified_via;
    NEW.edited_at := OLD.edited_at;
    NEW.status := OLD.status;
    NEW.source := OLD.source;
    NEW.external_review_id := OLD.external_review_id;
    NEW.author_name := OLD.author_name;
    NEW.author_url := OLD.author_url;
    NEW.source_url := OLD.source_url;
    NEW.source_date_label := OLD.source_date_label;
    NEW.created_at := OLD.created_at;
    NEW.user_id := OLD.user_id;
    NEW.turf_id := OLD.turf_id;
  end if;
  return NEW;
end;
$$;
revoke all on function private.reviews_guard() from public, anon, authenticated;

create or replace trigger reviews_guard
  before insert or update on public.reviews
  for each row execute function private.reviews_guard();

-- ── 4. Helpful votes can be taken back without a delete ─────

alter table public.review_votes add column if not exists withdrawn_at timestamptz;
comment on column public.review_votes.withdrawn_at is
  'Set when the voter takes the vote back (review_vote); a new vote clears it. Withdrawn votes do not count.';

-- ── 5. Private tables ──────────────────────────────────────

create table if not exists private.review_notes (
  review_id uuid primary key references public.reviews (id) on delete cascade,
  turf_id uuid not null,
  user_id uuid not null,
  body text check (body is null or char_length(body) between 1 and 400),
  show_name boolean not null default false,
  deliver_after timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  cleared_at timestamptz
);
create index if not exists review_notes_turf_idx on private.review_notes (turf_id, deliver_after);
revoke all on private.review_notes from public, anon, authenticated;
comment on table private.review_notes is
  'Private notes to a turf''s owner, one per report. Read only through owner_dashboard (managers), from deliver_after.';

create table if not exists private.review_saves (
  id bigint generated always as identity primary key,
  review_id uuid not null,
  user_id uuid not null,
  turf_id uuid not null,
  action text not null check (action in ('create', 'edit', 'remove', 'repost')),
  channel text check (channel in ('turf_page', 'link', 'owner_link', 'game', 'ask', 'edit')),
  ms integer check (ms between 0 and 600000),
  price_sent boolean not null default false,
  before jsonb,
  saved_at timestamptz not null default now()
);
create index if not exists review_saves_user_idx on private.review_saves (user_id, saved_at desc);
create index if not exists review_saves_review_idx on private.review_saves (review_id, saved_at desc);
revoke all on private.review_saves from public, anon, authenticated;
comment on table private.review_saves is
  'Every review save: the row before it (version history), the per-account limits, where the report came from and how long it took.';

-- ── 6. Helpers ─────────────────────────────────────────────

-- The one list of parts and reason chips: lib/reviews/catalog.ts (npm run test:reviews
-- checks the two are the same). sign 1 goes with Great, -1 with Needs work.
create or replace function private.review_catalog()
returns table (aspect text, tag text, sign smallint)
language sql
immutable
set search_path = ''
as $$
  select v.aspect, v.tag, v.sign::smallint from (values
    ('pitch', 'fresh', 1), ('pitch', 'bounce', 1), ('pitch', 'grip', 1),
    ('pitch', 'worn', -1), ('pitch', 'uneven', -1), ('pitch', 'slippery', -1), ('pitch', 'hot', -1),
    ('lights', 'bright', 1), ('lights', 'no_glare', 1),
    ('lights', 'dim', -1), ('lights', 'off', -1), ('lights', 'glare', -1), ('lights', 'early', -1),
    ('nets', 'good_nets', 1), ('nets', 'roof', 1), ('nets', 'size', 1),
    ('nets', 'holes', -1), ('nets', 'low_roof', -1), ('nets', 'balls_out', -1), ('nets', 'small', -1),
    ('goals', 'size', 1), ('goals', 'goals', 1), ('goals', 'markings', 1),
    ('goals', 'small', -1), ('goals', 'torn', -1), ('goals', 'no_markings', -1),
    ('lines', 'clear', 1), ('lines', 'net', 1),
    ('lines', 'faded', -1), ('lines', 'sag', -1), ('lines', 'low_roof', -1),
    ('staff', 'quick', 1), ('staff', 'on_time', 1), ('staff', 'helpful', 1), ('staff', 'gear', 1),
    ('staff', 'slow', -1), ('staff', 'late', -1), ('staff', 'overlap', -1), ('staff', 'price_change', -1), ('staff', 'rude', -1),
    ('washroom', 'clean', 1), ('washroom', 'water', 1), ('washroom', 'changing', 1),
    ('washroom', 'dirty', -1), ('washroom', 'no_water', -1), ('washroom', 'no_changing', -1), ('washroom', 'none', -1),
    ('value', 'fair', 1), ('value', 'deal', 1), ('value', 'included', 1),
    ('value', 'pricey', -1), ('value', 'extra', -1), ('value', 'cut_short', -1)
  ) as v(aspect, tag, sign);
$$;
revoke all on function private.review_catalog() from public, anon, authenticated;

-- A scorecard as review_save stores it: 1 to 6 known parts, at most one sport row,
-- score -1, 0 or 1, at most 3 distinct chips that match the score, none with Okay.
create or replace function private.review_aspects_ok(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null then true
    when jsonb_typeof(p) <> 'object' then false
    when (select count(*) from jsonb_object_keys(p)) not between 1 and 6 then false
    when (select count(*) from jsonb_object_keys(p) k where k in ('nets', 'goals', 'lines')) > 1 then false
    else not exists (
      select 1
        from jsonb_each(p) e
       where case
               when e.key not in (select c.aspect from private.review_catalog() c) then true
               when jsonb_typeof(e.value) <> 'object' then true
               when exists (select 1 from jsonb_object_keys(e.value) f where f not in ('score', 'tags')) then true
               when jsonb_typeof(e.value -> 'score') is distinct from 'number' then true
               when (e.value ->> 'score') not in ('-1', '0', '1') then true
               when not (e.value ? 'tags') then false
               when jsonb_typeof(e.value -> 'tags') <> 'array' then true
               when jsonb_array_length(e.value -> 'tags') > 3 then true
               when (e.value ->> 'score') = '0' and jsonb_array_length(e.value -> 'tags') > 0 then true
               when exists (select 1 from jsonb_array_elements(e.value -> 'tags') t
                             where jsonb_typeof(t) <> 'string'
                                or not exists (select 1 from private.review_catalog() c
                                                where c.aspect = e.key and c.tag = (t #>> '{}')
                                                  and c.sign::text = (e.value ->> 'score'))) then true
               when (select count(distinct t) from jsonb_array_elements(e.value -> 'tags') t)
                    <> jsonb_array_length(e.value -> 'tags') then true
               else false
             end)
  end;
$$;
revoke all on function private.review_aspects_ok(jsonb) from public, anon, authenticated;

-- A tip or note as stored: control characters out, runs of spaces and blank
-- lines collapsed, line breaks kept. lib/reviews/screen.ts cleanText is the same.
create or replace function private.review_clean_text(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(replace(replace(coalesce(p, ''), E'\r\n', E'\n'), E'\r', E'\n'),
                                '[\x01-\x09\x0b-\x1f\x7f]', ' ', 'g'),
                 ' {2,}', ' ', 'g'),
               ' *\n *', E'\n', 'g'),
             '\n{3,}', E'\n\n', 'g'),
           E' \n'), '');
$$;
revoke all on function private.review_clean_text(text) from public, anon, authenticated;

-- 'contact_info' when the text has an Indian mobile number (10 digits from 6 to 9,
-- with or without +91 or 0, spaces or dashes), an email, a link or a bare domain;
-- else null. Prices (Rs 1,200), times (7-9pm) and scores (120/3) pass.
-- lib/reviews/screen.ts contactProblem is the same, for instant feedback.
create or replace function private.review_text_problem(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null then null
    when p ~ '(^|[^0-9])(\+?91[ -]?|0)?[6-9]([ -]?[0-9]){9}([^0-9]|$)' then 'contact_info'
    when p ~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}' then 'contact_info'
    when p ~* '(https?://|www\.)' then 'contact_info'
    when p ~* '(^|[^a-z0-9@.])(wa\.me|t\.me|bit\.ly)([^a-z0-9]|$)' then 'contact_info'
    when p ~* '(^|[^a-z0-9@.])[a-z0-9][a-z0-9-]*\.(com|org|io|app|xyz|ly|gl|site|online|shop|store|info|biz|co\.in|net\.in|org\.in)([^a-z0-9]|$)' then 'contact_info'
    when p ~* '(^|[^a-z0-9@.])[a-z0-9][a-z0-9-]*\.[a-z]{2,}/[^ ]' then 'contact_info'
  end;
$$;
revoke all on function private.review_text_problem(text) from public, anon, authenticated;

-- An account that manages or claims this turf can't rate it (app/terms): an active
-- or pending claim for the account, or under one of its sign-ins from before claims
-- named the account; turfs.owner_id; or its own suggestion saying it owns or works there.
create or replace function private.account_manages_turf(p_user uuid, p_turf uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and p_turf is not null and (
    exists (
      select 1 from public.turf_owners o
       where o.turf_id = p_turf and o.status in ('active', 'pending')
         and (o.user_id = p_user
              or (o.user_id is null and (
                    o.user_key = 'p:' || private.account_phone10(p_user)
                    or o.user_key in (select 'e:' || lower(a.email::text) from auth.users a where a.id = p_user and a.email is not null
                                      union all
                                      select 'e:' || lower(u.email::text) from public.users u where u.id = p_user and u.email is not null)
                    or private.account_for_key(o.user_key) = p_user))))
    or exists (select 1 from public.turfs t where t.id = p_turf and t.owner_id = p_user)
    or exists (select 1 from public.turf_suggestions s
                where s.turf_id = p_turf and s.user_id = p_user and s.relationship in ('owner', 'staff'))
  );
$$;
revoke all on function private.account_manages_turf(uuid, uuid) from public, anon, authenticated;

-- 'game' when the account hosted or joined a TapTurf game at this turf that was
-- not cancelled and started in the last 365 days; else null. A label, never a gate.
create or replace function private.review_verified_via(p_user uuid, p_turf uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.games g
     where g.turf_id = p_turf
       and coalesce(g.status, 'open') <> 'cancelled'
       and g.date >= (now() at time zone 'Asia/Kolkata')::date - 366
       and ((g.date + g.start_time) at time zone 'Asia/Kolkata') between now() - interval '365 days' and now()
       and (g.creator_id = p_user
            or exists (select 1 from public.game_participants p where p.game_id = g.id and p.user_id = p_user))
  ) then 'game' end;
$$;
revoke all on function private.review_verified_via(uuid, uuid) from public, anon, authenticated;

-- When a note may be shown: the next 09:00 in India at least 8 hours after it was
-- written, so its timing points at no one.
create or replace function private.next_note_delivery(p_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case when d >= p_at + interval '8 hours' then d else d + interval '1 day' end
    from (select (((p_at at time zone 'Asia/Kolkata')::date + time '09:00') at time zone 'Asia/Kolkata') as d) x;
$$;
revoke all on function private.next_note_delivery(timestamptz) from public, anon, authenticated;

-- The one public shape of a review: turf_page, review_save and review_mine all use it.
-- Helpful counts live votes from anyone but the author.
create or replace function private.review_row_json(r public.reviews)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', r.id,
           'user_id', r.user_id,
           'turf_id', r.turf_id,
           'rating', r.rating,
           'comment', left(r.comment, 2000),
           'created_at', r.created_at,
           'source', r.source,
           'author_name', r.author_name,
           'author_url', r.author_url,
           'source_url', r.source_url,
           'source_date_label', r.source_date_label,
           'user_name', case when coalesce(r.source, '') = '' then u.name else r.author_name end,
           'user_avatar', case when coalesce(r.source, '') = '' then u.profile_image_url end,
           'upvotes', (select count(*) from public.review_votes v
                        where v.review_id = r.id and v.withdrawn_at is null and v.user_id is distinct from r.user_id),
           'sport', r.sport,
           'played_when', r.played_when,
           'aspects', r.aspects,
           'play_again', r.play_again,
           'verified_via', r.verified_via,
           'edited_at', r.edited_at)
    from (select 1) one
    left join public.users u on u.id = r.user_id;
$$;
revoke all on function private.review_row_json(public.reviews) from public, anon, authenticated;

-- Per part of the turf: how many live TapTurf reports since p_since rated it, how
-- (Great, Okay, Needs work), and each reason chip's count and latest use.
-- Plain counts, never weighted, so anyone can check a number by reading the reports.
create or replace function private.review_aspect_counts(p_turf_id uuid, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with rated as (
    select x.aspect, x.score, x.tags, x.at
      from (
        select e.key as aspect,
               case when e.value ->> 'score' in ('-1', '0', '1') then (e.value ->> 'score')::int end as score,
               case when jsonb_typeof(e.value -> 'tags') = 'array' then e.value -> 'tags' else '[]'::jsonb end as tags,
               coalesce(r.edited_at, r.created_at) as at
          from public.reviews r
          cross join lateral jsonb_each(case when jsonb_typeof(r.aspects) = 'object' then r.aspects else '{}'::jsonb end) e
         where r.turf_id = p_turf_id and r.source is null and r.status = 'live'
           and coalesce(r.edited_at, r.created_at) >= p_since
      ) x
     where x.score is not null and jsonb_typeof(x.tags) = 'array'
  ),
  tagged as (
    select x.aspect, t.tag, x.score as sign, count(*)::int as n, max(x.at) as last_at
      from rated x
      cross join lateral jsonb_array_elements_text(x.tags) t(tag)
     where x.score <> 0
     group by 1, 2, 3
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'aspect', a.aspect, 'n', a.n, 'great', a.great, 'okay', a.okay, 'needs_work', a.needs_work,
           'tags', coalesce((select jsonb_agg(jsonb_build_object('tag', g.tag, 'sign', g.sign, 'n', g.n, 'last_at', g.last_at)
                                              order by g.n desc, g.last_at desc, g.tag)
                               from tagged g where g.aspect = a.aspect), '[]'::jsonb))
           order by a.n desc, a.aspect), '[]'::jsonb)
    from (select aspect, count(*)::int as n,
                 count(*) filter (where score = 1)::int as great,
                 count(*) filter (where score = 0)::int as okay,
                 count(*) filter (where score = -1)::int as needs_work
            from rated group by aspect) a;
$$;
revoke all on function private.review_aspect_counts(uuid, timestamptz) from public, anon, authenticated;

-- The rate a player paid, saved as their "From players" price (turf_suggestions),
-- the way save_turf_suggestion saves one: a new row as a player, or only the price
-- of their row, with the diff logged. A paid rate inside the range they already
-- gave changes nothing. Past that function's 10 edits a day it skips (false).
create or replace function private.review_share_price(p_user uuid, p_turf uuid, p_paid integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.turf_suggestions%rowtype;
  v_name text;
  v_diff jsonb;
begin
  if p_paid is null or p_paid < 100 or p_paid > 20000 then
    return false;
  end if;
  select * into s from public.turf_suggestions x where x.turf_id = p_turf and x.user_id = p_user for update;
  if not found then
    select u.name into v_name from public.users u where u.id = p_user;
    insert into public.turf_suggestions (turf_id, user_id, submitter_name, relationship, price_min, price_max)
    values (p_turf, p_user, left(nullif(btrim(coalesce(v_name, '')), ''), 80), 'player', p_paid, p_paid);
    return true;
  end if;
  if s.price_min is not null and s.price_max is not null and p_paid between s.price_min and s.price_max then
    return true;
  end if;
  if (select count(*) from public.turf_suggestion_edits e
       where e.suggestion_id = s.id and e.created_at > now() - interval '1 day') >= 10 then
    return false;
  end if;
  v_diff := '{}'::jsonb;
  if s.price_min is distinct from p_paid then
    v_diff := v_diff || jsonb_build_object('price_min', jsonb_build_object('from', s.price_min, 'to', p_paid));
  end if;
  if s.price_max is distinct from p_paid then
    v_diff := v_diff || jsonb_build_object('price_max', jsonb_build_object('from', s.price_max, 'to', p_paid));
  end if;
  update public.turf_suggestions
     set price_min = p_paid, price_max = p_paid, updated_at = now(), edit_count = s.edit_count + 1
   where id = s.id;
  insert into public.turf_suggestion_edits (suggestion_id, changes) values (s.id, v_diff);
  return true;
end;
$$;
revoke all on function private.review_share_price(uuid, uuid, integer) from public, anon, authenticated;

-- What /my shows about a turf's TapTurf reports, last 90 days, for owner_dashboard
-- (which checks _can_manage first). Notes only once due, never with a review id;
-- an anonymous one says only roughly who, and only "A player" when the turf had
-- fewer than 3 live reports that month.
create or replace function private.owner_review_block(p_turf_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since constant timestamptz := now() - interval '90 days';
  v_aspects jsonb := private.review_aspect_counts(p_turf_id, now() - interval '90 days');
begin
  return (
    select jsonb_build_object(
      'window_days', 90,
      'n', count(*),
      'average', round(avg(r.rating), 1),
      'play_again', jsonb_build_object(
        'yes', count(*) filter (where r.play_again = 1),
        'maybe', count(*) filter (where r.play_again = 0),
        'no', count(*) filter (where r.play_again = -1)),
      'verified', count(*) filter (where r.verified_via = 'game'),
      'aspects', coalesce((
        select jsonb_agg(a - 'tags') from jsonb_array_elements(v_aspects) a), '[]'::jsonb),
      'fix_first', coalesce((
        select jsonb_agg(jsonb_build_object('aspect', f.aspect, 'tag', f.tag, 'n', f.n, 'last_at', f.last_at)
                         order by f.n desc, f.last_at desc, f.aspect, f.tag)
          from (select a ->> 'aspect' as aspect, t ->> 'tag' as tag, (t ->> 'n')::int as n, (t ->> 'last_at')::timestamptz as last_at
                  from jsonb_array_elements(v_aspects) a, jsonb_array_elements(a -> 'tags') t
                 where (t ->> 'sign') = '-1'
                 order by 3 desc, 4 desc, 1, 2
                 limit 5) f), '[]'::jsonb),
      'love', coalesce((
        select jsonb_agg(jsonb_build_object('aspect', f.aspect, 'tag', f.tag, 'n', f.n) order by f.n desc, f.last_at desc, f.aspect, f.tag)
          from (select a ->> 'aspect' as aspect, t ->> 'tag' as tag, (t ->> 'n')::int as n, (t ->> 'last_at')::timestamptz as last_at
                  from jsonb_array_elements(v_aspects) a, jsonb_array_elements(a -> 'tags') t
                 where (t ->> 'sign') = '1'
                 order by 3 desc, 4 desc, 1, 2
                 limit 3) f), '[]'::jsonb),
      'notes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'context', case when nt.show_name then null
                                 when nt.few or (nt.sport is null and nt.played_when is null) then 'A player'
                                 else nt.who end,
                 'month', nt.month,
                 'name', case when nt.show_name then nt.name end,
                 'rating_word', case when nt.show_name then (array['Bad', 'Not great', 'Okay', 'Good', 'Loved it'])[nt.rating] end,
                 'body', nt.body)
                 order by nt.month_start desc, nt.shuffle)
          from (
            select n.show_name, n.body, rv.sport, rv.played_when, rv.rating, u.name,
                   to_char(n.created_at at time zone 'Asia/Kolkata', 'Mon YYYY') as month,
                   date_trunc('month', n.created_at at time zone 'Asia/Kolkata') as month_start,
                   md5(n.review_id::text) as shuffle,
                   (case when left(w.phrase, 1) in ('a', 'e', 'i', 'o', 'u') then 'An ' else 'A ' end) || w.phrase as who,
                   (select count(*) from public.reviews m
                     where m.turf_id = p_turf_id and m.source is null and m.status = 'live'
                       and date_trunc('month', m.created_at at time zone 'Asia/Kolkata')
                           = date_trunc('month', n.created_at at time zone 'Asia/Kolkata')) < 3 as few
              from private.review_notes n
              join public.reviews rv on rv.id = n.review_id
              left join public.users u on u.id = n.user_id
              cross join lateral (select concat_ws(' ', rv.played_when, lower(rv.sport), 'player') as phrase) w
             where n.turf_id = p_turf_id and n.body is not null and n.cleared_at is null
               and n.deliver_after <= now() and rv.status = 'live'
             order by n.deliver_after desc
             limit 30
          ) nt), '[]'::jsonb))
      from public.reviews r
     where r.turf_id = p_turf_id and r.source is null and r.status = 'live'
       and coalesce(r.edited_at, r.created_at) >= v_since
  );
end;
$$;
revoke all on function private.owner_review_block(uuid) from public, anon, authenticated;

-- ── 7. The server-key functions ────────────────────────────

-- Save a report: the first one, an edit, or one posted again after removal.
-- p_report: {rating 1-5, sport?, played_when?, aspects?, play_again?, comment?,
-- note?: {body|null, show_name}, price_paid?, channel?, ms?}. Leaving note out keeps
-- the note as it is; note.body null clears it. Answers {r: ok, created, review,
-- note, after, price_saved}, or r: unavailable, bad, gone, own_turf, limit,
-- contact_info (with field).
create or replace function public.review_save(p_key text, p_user_id uuid, p_turf_id uuid, p_report jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turf public.turfs;
  v_old public.reviews;
  v_row public.reviews;
  v_rating int;
  v_sport text;
  v_when text;
  v_aspects jsonb;
  v_again smallint;
  v_comment text;
  v_has_note boolean;
  v_note_body text;
  v_show_name boolean := false;
  v_price int;
  v_channel text;
  v_ms int;
  v_created boolean := false;
  v_id uuid;
  v_price_saved boolean := false;
  v_note jsonb := null;
  v_claimed boolean;
  v_deliver timestamptz;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_turf_id is null or p_report is null or jsonb_typeof(p_report) <> 'object' then
    return jsonb_build_object('r', 'bad');
  end if;
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_turf from public.turfs t where t.id = p_turf_id and t.is_active = true;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if private.account_manages_turf(p_user_id, p_turf_id) then
    return jsonb_build_object('r', 'own_turf');
  end if;

  -- The report, each field checked (the route checked it too).
  if jsonb_typeof(p_report -> 'rating') is distinct from 'number' or (p_report ->> 'rating') !~ '^[1-5]$' then
    return jsonb_build_object('r', 'bad');
  end if;
  v_rating := (p_report ->> 'rating')::int;

  if jsonb_typeof(p_report -> 'sport') = 'string' then
    v_sport := p_report ->> 'sport';
    if not (jsonb_typeof(v_turf.sports) = 'array' and v_turf.sports ? v_sport) then
      return jsonb_build_object('r', 'bad');
    end if;
  elsif coalesce(jsonb_typeof(p_report -> 'sport'), 'null') <> 'null' then
    return jsonb_build_object('r', 'bad');
  end if;

  if jsonb_typeof(p_report -> 'played_when') = 'string' and (p_report ->> 'played_when') in ('morning', 'afternoon', 'evening', 'night') then
    v_when := p_report ->> 'played_when';
  elsif coalesce(jsonb_typeof(p_report -> 'played_when'), 'null') <> 'null' then
    return jsonb_build_object('r', 'bad');
  end if;

  if jsonb_typeof(p_report -> 'play_again') = 'number' and (p_report ->> 'play_again') in ('-1', '0', '1') then
    v_again := (p_report ->> 'play_again')::smallint;
  elsif coalesce(jsonb_typeof(p_report -> 'play_again'), 'null') <> 'null' then
    return jsonb_build_object('r', 'bad');
  end if;

  v_aspects := case when jsonb_typeof(p_report -> 'aspects') = 'object' and p_report -> 'aspects' <> '{}'::jsonb
                    then p_report -> 'aspects' end;
  if coalesce(jsonb_typeof(p_report -> 'aspects'), 'null') not in ('null', 'object') or not private.review_aspects_ok(v_aspects) then
    return jsonb_build_object('r', 'bad');
  end if;

  if jsonb_typeof(p_report -> 'comment') = 'string' then
    v_comment := private.review_clean_text(p_report ->> 'comment');
    if char_length(v_comment) > 500 then
      return jsonb_build_object('r', 'bad');
    end if;
  elsif coalesce(jsonb_typeof(p_report -> 'comment'), 'null') <> 'null' then
    return jsonb_build_object('r', 'bad');
  end if;

  v_has_note := p_report ? 'note' and jsonb_typeof(p_report -> 'note') = 'object';
  if p_report ? 'note' and not v_has_note and jsonb_typeof(p_report -> 'note') <> 'null' then
    return jsonb_build_object('r', 'bad');
  end if;
  if v_has_note then
    if jsonb_typeof(p_report -> 'note' -> 'body') = 'string' then
      v_note_body := private.review_clean_text(p_report -> 'note' ->> 'body');
      if char_length(v_note_body) > 400 then
        return jsonb_build_object('r', 'bad');
      end if;
    elsif coalesce(jsonb_typeof(p_report -> 'note' -> 'body'), 'null') <> 'null' then
      return jsonb_build_object('r', 'bad');
    end if;
    v_show_name := case when jsonb_typeof(p_report -> 'note' -> 'show_name') = 'boolean'
                        then (p_report -> 'note' ->> 'show_name')::boolean else false end;
  end if;

  if jsonb_typeof(p_report -> 'price_paid') = 'number' then
    if (p_report ->> 'price_paid') !~ '^[0-9]{3,5}$' then
      return jsonb_build_object('r', 'bad');
    end if;
    v_price := (p_report ->> 'price_paid')::int;
    if v_price not between 100 and 20000 then
      return jsonb_build_object('r', 'bad');
    end if;
  elsif coalesce(jsonb_typeof(p_report -> 'price_paid'), 'null') <> 'null' then
    return jsonb_build_object('r', 'bad');
  end if;

  -- Where the report came from and how long it took: kept only when well formed.
  v_channel := case when (p_report ->> 'channel') in ('turf_page', 'link', 'owner_link', 'game', 'ask', 'edit') then p_report ->> 'channel' end;
  if jsonb_typeof(p_report -> 'ms') = 'number' and (p_report ->> 'ms') ~ '^[0-9]{1,6}$' then
    v_ms := (p_report ->> 'ms')::int;
    if v_ms > 600000 then
      v_ms := null;
    end if;
  end if;

  if private.review_text_problem(v_comment) is not null then
    return jsonb_build_object('r', 'contact_info', 'field', 'comment');
  end if;
  if private.review_text_problem(v_note_body) is not null then
    return jsonb_build_object('r', 'contact_info', 'field', 'note');
  end if;

  select * into v_old from public.reviews r
   where r.user_id = p_user_id and r.turf_id = p_turf_id and r.source is null
   for update;

  -- Per account: 5 new reports and 20 saves a day.
  if (select count(*) from private.review_saves s where s.user_id = p_user_id and s.saved_at > now() - interval '24 hours') >= 20
     or ((v_old.id is null or v_old.status = 'removed')
         and (select count(*) from private.review_saves s
               where s.user_id = p_user_id and s.saved_at > now() - interval '24 hours' and s.action in ('create', 'repost')) >= 5) then
    return jsonb_build_object('r', 'limit');
  end if;

  -- The page refreshes within a minute, not at the next sweep.
  perform set_config('tapturf.cache_urgent', 'on', true);

  if v_old.id is not null then
    insert into private.review_saves (review_id, user_id, turf_id, action, channel, ms, price_sent, before)
    values (v_old.id, p_user_id, p_turf_id, case when v_old.status = 'removed' then 'repost' else 'edit' end,
            v_channel, v_ms, v_price is not null, to_jsonb(v_old));
    update public.reviews r
       set rating = v_rating,
           comment = v_comment,
           sport = v_sport,
           played_when = v_when,
           aspects = v_aspects,
           play_again = v_again,
           verified_via = coalesce(private.review_verified_via(p_user_id, p_turf_id), v_old.verified_via),
           edited_at = case when (v_rating, v_comment, v_aspects, v_again) is distinct from (v_old.rating, v_old.comment, v_old.aspects, v_old.play_again)
                            then now() else v_old.edited_at end,
           status = case when v_old.status in ('hidden', 'held') then v_old.status else 'live' end
     where r.id = v_old.id
    returning * into v_row;
  else
    insert into public.reviews as r (user_id, turf_id, rating, comment, sport, played_when, aspects, play_again, verified_via, status)
    values (p_user_id, p_turf_id, v_rating, v_comment, v_sport, v_when, v_aspects, v_again,
            private.review_verified_via(p_user_id, p_turf_id), 'live')
    on conflict (user_id, turf_id) where source is null do update
       set rating = excluded.rating, comment = excluded.comment, sport = excluded.sport,
           played_when = excluded.played_when, aspects = excluded.aspects, play_again = excluded.play_again,
           verified_via = coalesce(excluded.verified_via, r.verified_via), edited_at = now(),
           status = case when r.status in ('hidden', 'held') then r.status else 'live' end
    returning r.id, (r.xmax = 0) into v_id, v_created;
    select * into v_row from public.reviews r where r.id = v_id;
    insert into private.review_saves (review_id, user_id, turf_id, action, channel, ms, price_sent, before)
    values (v_row.id, p_user_id, p_turf_id, case when v_created then 'create' else 'edit' end, v_channel, v_ms, v_price is not null, null);
  end if;

  -- The private note.
  if v_has_note then
    if v_note_body is null then
      update private.review_notes n
         set body = null, cleared_at = now(), updated_at = now()
       where n.review_id = v_row.id and n.body is not null;
    else
      insert into private.review_notes as n (review_id, turf_id, user_id, body, show_name, deliver_after)
      values (v_row.id, p_turf_id, p_user_id, v_note_body, v_show_name, private.next_note_delivery(now()))
      on conflict (review_id) do update
         set body = excluded.body,
             show_name = excluded.show_name,
             updated_at = now(),
             cleared_at = null,
             deliver_after = case when n.body is null then excluded.deliver_after else n.deliver_after end;
    end if;
  end if;
  select n.deliver_after into v_deliver from private.review_notes n
   where n.review_id = v_row.id and n.body is not null and n.cleared_at is null;
  if v_deliver is not null then
    v_claimed := exists (select 1 from public.turf_owners o where o.turf_id = p_turf_id and o.status = 'active');
    v_note := jsonb_build_object('delivers', case when v_claimed then 'tomorrow' else 'on_claim' end, 'at', v_deliver);
  end if;

  -- The rate they paid, as their From players price. Never loses the report.
  if v_price is not null then
    begin
      v_price_saved := private.review_share_price(p_user_id, p_turf_id, v_price);
    exception when others then
      v_price_saved := false;
    end;
  end if;

  return jsonb_build_object(
    'r', 'ok',
    'created', v_created,
    'review', private.review_row_json(v_row) || jsonb_build_object('status', v_row.status),
    'note', v_note,
    'price_saved', v_price_saved,
    'after', jsonb_build_object(
      'tapturf_n', (select count(*) from public.reviews r where r.turf_id = p_turf_id and r.source is null and r.status = 'live'),
      'aspects', coalesce((
        select jsonb_object_agg(k, (
                 select count(*) from public.reviews r
                  where r.turf_id = p_turf_id and r.source is null and r.status = 'live'
                    and jsonb_typeof(r.aspects) = 'object' and r.aspects ? k
                    and coalesce(r.edited_at, r.created_at) >= now() - interval '365 days'))
          from jsonb_object_keys(coalesce(v_row.aspects, '{}'::jsonb)) k), '{}'::jsonb)));
end;
$$;
revoke all on function public.review_save(text, uuid, uuid, jsonb) from public;
grant execute on function public.review_save(text, uuid, uuid, jsonb) to anon, authenticated;

-- What one signed-in viewer sees of a turf's reports that the cached page can't
-- hold: their own report in any status (with their note), which reports they
-- marked Helpful, whether they manage the turf, their From players price, and a
-- hint for the rate card: a TapTurf game here 2 hours to 30 days ago, else a
-- signed-in Call or WhatsApp tap 12 hours to 14 days ago. Taps are never shown
-- to anyone else.
create or replace function public.review_mine(p_key text, p_user_id uuid, p_turf_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.reviews;
  v_mine jsonb := null;
  v_blocked boolean;
  v_hint jsonb := null;
  v_price int;
  v_sports jsonb;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_turf_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  select t.sports into v_sports from public.turfs t where t.id = p_turf_id and t.is_active = true;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  v_blocked := private.account_manages_turf(p_user_id, p_turf_id);

  select * into v_row from public.reviews r where r.user_id = p_user_id and r.turf_id = p_turf_id and r.source is null;
  if found then
    v_mine := private.review_row_json(v_row) || jsonb_build_object(
      'status', v_row.status,
      'note', (select jsonb_build_object('body', n.body, 'show_name', n.show_name)
                 from private.review_notes n where n.review_id = v_row.id and n.body is not null and n.cleared_at is null));
  elsif not v_blocked then
    select jsonb_build_object(
             'kind', 'game',
             'at', (g.date + g.start_time) at time zone 'Asia/Kolkata',
             'sport', case when jsonb_typeof(v_sports) = 'array' and v_sports ? g.sport then g.sport end,
             'played_when', case when g.start_time < time '12:00' then 'morning'
                                 when g.start_time < time '16:00' then 'afternoon'
                                 when g.start_time < time '19:00' then 'evening'
                                 else 'night' end)
      into v_hint
      from public.games g
     where g.turf_id = p_turf_id
       and coalesce(g.status, 'open') <> 'cancelled'
       and g.date >= (now() at time zone 'Asia/Kolkata')::date - 31
       and ((g.date + g.start_time) at time zone 'Asia/Kolkata') between now() - interval '30 days' and now() - interval '2 hours'
       and (g.creator_id = p_user_id
            or exists (select 1 from public.game_participants p where p.game_id = g.id and p.user_id = p_user_id))
     order by g.date desc, g.start_time desc
     limit 1;
    if v_hint is null then
      select jsonb_build_object('kind', c.kind, 'at', c.created_at)
        into v_hint
        from public.turf_contact_clicks c
       where c.user_id = p_user_id and c.turf_id = p_turf_id and c.signed_in = true
         and c.kind in ('call', 'whatsapp')
         and c.created_at between now() - interval '14 days' and now() - interval '12 hours'
       order by c.created_at desc
       limit 1;
    end if;
  end if;

  select case when s.price_min = s.price_max then s.price_min end into v_price
    from public.turf_suggestions s where s.turf_id = p_turf_id and s.user_id = p_user_id;

  return jsonb_build_object(
    'r', 'ok',
    'mine', v_mine,
    'voted', coalesce((
      select jsonb_agg(v.review_id order by v.review_id)
        from public.review_votes v join public.reviews r on r.id = v.review_id
       where v.user_id = p_user_id and v.withdrawn_at is null and r.turf_id = p_turf_id), '[]'::jsonb),
    'blocked', case when v_blocked then 'own_turf' end,
    'hint', v_hint,
    'my_price', v_price);
end;
$$;
revoke all on function public.review_mine(text, uuid, uuid) from public;
grant execute on function public.review_mine(text, uuid, uuid) to anon, authenticated;

-- Take a report off the page: status removed (a hidden one stays hidden), its note
-- cleared, the row before kept in review_saves. Nothing is deleted; posting again
-- brings it back.
create or replace function public.review_remove(p_key text, p_user_id uuid, p_turf_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.reviews;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_turf_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_old from public.reviews r
   where r.user_id = p_user_id and r.turf_id = p_turf_id and r.source is null
   for update;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if v_old.status = 'removed' then
    return jsonb_build_object('r', 'ok');
  end if;
  perform set_config('tapturf.cache_urgent', 'on', true);
  insert into private.review_saves (review_id, user_id, turf_id, action, channel, before)
  values (v_old.id, p_user_id, p_turf_id, 'remove', null, to_jsonb(v_old));
  update public.reviews r
     set status = case when v_old.status in ('hidden', 'held') then v_old.status else 'removed' end
   where r.id = v_old.id;
  update private.review_notes n
     set body = null, cleared_at = now(), updated_at = now()
   where n.review_id = v_old.id and n.body is not null;
  return jsonb_build_object('r', 'ok');
end;
$$;
revoke all on function public.review_remove(text, uuid, uuid) from public;
grant execute on function public.review_remove(text, uuid, uuid) to anon, authenticated;

-- Helpful, on or off. Not on your own report, a Google row or one that isn't live.
-- Off keeps the row (withdrawn_at); on again clears it. 60 new votes an hour.
create or replace function public.review_vote(p_key text, p_user_id uuid, p_review_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.reviews;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_review_id is null or p_on is null
     or not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_review from public.reviews r where r.id = p_review_id;
  if not found or v_review.status <> 'live' then
    return jsonb_build_object('r', 'gone');
  end if;
  if coalesce(v_review.source, '') <> '' then
    return jsonb_build_object('r', 'google');
  end if;
  if v_review.user_id = p_user_id then
    return jsonb_build_object('r', 'own');
  end if;

  if p_on then
    if not exists (select 1 from public.review_votes v where v.review_id = p_review_id and v.user_id = p_user_id)
       and (select count(*) from public.review_votes v where v.user_id = p_user_id and v.created_at > now() - interval '1 hour') >= 60 then
      return jsonb_build_object('r', 'limit');
    end if;
    insert into public.review_votes as v (review_id, user_id) values (p_review_id, p_user_id)
    on conflict (review_id, user_id) do update set withdrawn_at = null where v.withdrawn_at is not null;
  else
    update public.review_votes v set withdrawn_at = now()
     where v.review_id = p_review_id and v.user_id = p_user_id and v.withdrawn_at is null;
  end if;
  -- The vote trigger only sees inserts and deletes; a withdrawal is an update.
  perform private.mark_dirty(array[private.turf_key(v_review.turf_id)], false);

  return jsonb_build_object(
    'r', 'ok',
    'on', p_on,
    'upvotes', (select count(*) from public.review_votes v
                 where v.review_id = p_review_id and v.withdrawn_at is null and v.user_id is distinct from v_review.user_id));
end;
$$;
revoke all on function public.review_vote(text, uuid, uuid, boolean) from public;
grant execute on function public.review_vote(text, uuid, uuid, boolean) to anon, authenticated;

-- ── 8. Replaced bodies ─────────────────────────────────────

-- 20261026_turf_page_found.sql, with: reviews live only and in the one shape
-- (private.review_row_json, which adds the report fields and counts Helpful
-- without self-votes or withdrawn ones); review_stats over live rows (the same
-- numbers today) plus play_again [no, maybe, yes] for the last 365 days; and
-- review_aspects, every part rated in the last 365 days (the page shows a bar
-- from 3 ratings, lib/reviews/insights.ts). Nothing per viewer.
create or replace function public.turf_page(p_key text)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  t public.turfs;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_trending jsonb;
begin
  if p_key is null or length(p_key) > 200 then
    return jsonb_build_object('found', false);
  end if;

  if p_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into t from public.turfs where id = p_key::uuid and is_active = true;
  else
    select * into t from public.turfs where slug = lower(p_key) and is_active = true;
  end if;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  select jsonb_build_object('city', p.city, 'tagline', p.tagline)
    into v_trending
    from public.trending_turfs p
   where p.turf_id = t.id
     and p.starts_at <= now() and p.ends_at > now()
     and not exists (
       select 1 from public.trending_turfs q
        where q.city = p.city
          and q.starts_at <= now() and q.ends_at > now()
          and q.starts_at > p.starts_at)
   order by (p.city is not distinct from t.city) desc, p.starts_at desc
   limit 1;

  return jsonb_build_object(
    'turf', to_jsonb(t) - array['listing_review', 'listing_checked_at', 'review_summary_at', 'data_sources', 'field_confidence'],

    'claimed', exists (
      select 1 from public.turf_owners o where o.turf_id = t.id and o.status = 'active'),

    'trending', v_trending,
    'is_trending', coalesce(v_trending ->> 'city' = t.city, false),

    'reviews', coalesce((
      select jsonb_agg(private.review_row_json(r) order by (coalesce(r.source, '') <> ''), r.created_at desc)
        from public.reviews r
       where r.id in (
           select x.id from public.reviews x
            where x.turf_id = t.id and x.status = 'live'
            order by x.created_at desc
            limit 20)
    ), '[]'::jsonb),

    'review_stats', (
      select jsonb_build_object(
               'count', count(*),
               'average', coalesce(round(avg(least(greatest(rating, 1), 5)), 1), 0),
               'histogram', jsonb_build_array(
                 count(*) filter (where rating <= 1),
                 count(*) filter (where rating = 2),
                 count(*) filter (where rating = 3),
                 count(*) filter (where rating = 4),
                 count(*) filter (where rating >= 5)),
               'play_again', jsonb_build_array(
                 count(*) filter (where play_again = -1 and coalesce(edited_at, created_at) >= now() - interval '365 days'),
                 count(*) filter (where play_again = 0 and coalesce(edited_at, created_at) >= now() - interval '365 days'),
                 count(*) filter (where play_again = 1 and coalesce(edited_at, created_at) >= now() - interval '365 days')))
        from public.reviews
       where turf_id = t.id and source is null and status = 'live'),

    'review_aspects', private.review_aspect_counts(t.id, now() - interval '365 days'),

    'suggestions', coalesce((
      select jsonb_agg(to_jsonb(s) - 'ordinality' order by s.ordinality)
        from public.get_turf_suggestions(t.id) with ordinality s
    ), '[]'::jsonb),

    'games', coalesce((
      select jsonb_agg(to_jsonb(g) - 'host_phone' order by g.date, g.start_time)
        from (
          select * from public.games
           where turf_id = t.id
             and status in ('open', 'upcoming', 'active')
             and date >= v_today
           order by date, start_time
           limit 20
        ) g
    ), '[]'::jsonb)
  );
end;
$function$;

-- 20261019_mytapturf.sql, with only the reviews block changed: tapturf and recent
-- count live rows only; recent carries each report's id, scorecard, play-again
-- answer and the player's public name (the page already shows it); and the keys
-- of private.owner_review_block (last 90 days) are added.
create or replace function public.owner_dashboard(p_token text, p_turf_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  d integer := least(greatest(coalesce(p_days, 30), 7), 90);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  since date := today - (d - 1);
  prev date := since - d;
  t_since timestamptz := since::timestamp at time zone 'Asia/Kolkata';
  t_prev timestamptz := prev::timestamp at time zone 'Asia/Kolkata';
begin
  if not public._can_manage(k, p_turf_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  return jsonb_build_object(
    'days', d,
    'turf', (
      select to_jsonb(x) from (
        select t.id, t.name, t.city, t.area, t.address, t.sports, t.rating, t.total_reviews,
               coalesce(t.cover_image, to_jsonb(t.images) ->> 0) as cover,
               case when jsonb_typeof(t.images) = 'array' then jsonb_array_length(t.images) else 0 end as photos,
               t.morning_price, t.afternoon_price, t.evening_price,
               t.weekend_morning_price, t.weekend_afternoon_price, t.weekend_evening_price,
               t.price_owner_confirmed, t.price_verified_at,
               (t.pricing_bands is not null) as has_listed_bands,
               t.start_time, t.end_time, t.is_24x7, t.closed_days,
               t.has_floodlights, t.is_covered, t.parking_available, t.washroom_available,
               t.changing_room_available, t.has_cafeteria, t.has_drinking_water, t.equipment_provided,
               t.description, t.number_of_grounds, t.surface_type, t.formats, t.whatsapp_phone
        from public.turfs t where t.id = p_turf_id
      ) x
    ),
    'series', (
      select jsonb_agg(jsonb_build_object('day', g.day, 'views', coalesce(v.views, 0),
                                          'calls', coalesce(c.calls, 0), 'whatsapp', coalesce(c.wa, 0)) order by g.day)
      from (select generate_series(since, today, interval '1 day')::date as day) g
      left join public.turf_daily_views v on v.turf_id = p_turf_id and v.day = g.day
      left join (
        select (created_at at time zone 'Asia/Kolkata')::date as day,
               count(*) filter (where kind = 'call') as calls,
               count(*) filter (where kind = 'whatsapp') as wa
        from public.turf_contact_clicks
        where turf_id = p_turf_id and created_at >= t_since
        group by 1
      ) c on c.day = g.day
    ),
    'prev', jsonb_build_object(
      'views', (select coalesce(sum(views), 0) from public.turf_daily_views where turf_id = p_turf_id and day >= prev and day < since),
      'calls', (select count(*) from public.turf_contact_clicks where turf_id = p_turf_id and kind = 'call' and created_at >= t_prev and created_at < t_since),
      'whatsapp', (select count(*) from public.turf_contact_clicks where turf_id = p_turf_id and kind = 'whatsapp' and created_at >= t_prev and created_at < t_since),
      'ask', (select count(*) from public.ask_queries where created_at >= t_prev and created_at < t_since and filters -> 'shown_ids' ? p_turf_id::text)
    ),
    'ask', (select count(*) from public.ask_queries where created_at >= t_since and filters -> 'shown_ids' ? p_turf_id::text),
    'games', jsonb_build_object(
      'hosted', (select count(*) from public.games where turf_id = p_turf_id and created_at >= t_since),
      'upcoming', (select count(*) from public.games where turf_id = p_turf_id and date >= today and status in ('open', 'upcoming', 'active'))
    ),
    'reviews', jsonb_build_object(
      'tapturf', (select count(*) from public.reviews where turf_id = p_turf_id and source is null and status = 'live'),
      'recent', coalesce((
        select jsonb_agg(r) from (
          select x.id, x.rating, left(x.comment, 300) as comment, coalesce(x.author_name, u.name, 'A player') as author,
                 coalesce(x.source, 'tapturf') as source, x.created_at,
                 x.sport, x.played_when, x.aspects, x.play_again, x.verified_via, x.edited_at
          from public.reviews x
          left join public.users u on u.id = x.user_id and x.source is null
          where x.turf_id = p_turf_id and x.status = 'live'
            and ((x.comment is not null and length(trim(x.comment)) > 0) or jsonb_typeof(x.aspects) = 'object')
          order by x.created_at desc limit 5
        ) r
      ), '[]'::jsonb)
    ) || private.owner_review_block(p_turf_id),
    'edits', coalesce((
      select jsonb_agg(e) from (
        select created_at, (select array_agg(key) from jsonb_object_keys(after) key) as fields
        from public.turf_edit_log where turf_id = p_turf_id order by created_at desc limit 5
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

-- 20261010_listing_and_review_summary.sql, with: a written review is a live one
-- with a comment, or a TapTurf report with 2 or more rated parts; and a summary
-- goes stale when any review here was written or changed after it (an edit,
-- removal or hide bumps updated_at), not only when one was added.
create or replace function public.get_review_summary_batch(p_limit integer default 5, p_firebase_token text default null)
returns table (id uuid, name text)
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_site_owner(p_firebase_token) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select t.id, t.name::text from public.turfs t
  where t.is_active
    and (select count(*) from public.reviews r
          where r.turf_id = t.id and r.status = 'live'
            and ((r.comment is not null and length(trim(r.comment)) > 10)
                 or (r.source is null
                     and case when jsonb_typeof(r.aspects) = 'object' then (select count(*) from jsonb_object_keys(r.aspects)) else 0 end >= 2))) >= 2
    and (t.review_summary_at is null or exists (select 1 from public.reviews r where r.turf_id = t.id and greatest(r.created_at, r.updated_at) > t.review_summary_at))
  order by t.total_reviews desc nulls last, t.name
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
end $$;

create or replace function public.review_summary_progress(p_firebase_token text default null)
returns table (total integer, reviewed integer, flagged integer)
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_site_owner(p_firebase_token) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  with c as (
    select t.id, t.review_summary_at,
      (select count(*) from public.reviews r
        where r.turf_id = t.id and r.status = 'live'
          and ((r.comment is not null and length(trim(r.comment)) > 10)
               or (r.source is null
                   and case when jsonb_typeof(r.aspects) = 'object' then (select count(*) from jsonb_object_keys(r.aspects)) else 0 end >= 2))) as n,
      exists (select 1 from public.reviews r where r.turf_id = t.id and t.review_summary_at is not null and greatest(r.created_at, r.updated_at) > t.review_summary_at) as stale
    from public.turfs t where t.is_active
  )
  select count(*) filter (where n >= 2)::integer,
         count(*) filter (where n >= 2 and review_summary_at is not null and not stale)::integer,
         0::integer
  from c;
end $$;
