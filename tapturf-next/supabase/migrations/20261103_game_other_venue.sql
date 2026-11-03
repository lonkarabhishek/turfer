-- Other venue: a game at a place that is not on TapTurf. The site owner:
-- "For someone to host game, if the turf is not on tapturf give them an
-- option to type other and ask address". Until now every game had to be
-- at a listed turf (games.turf_id not null), so a host whose ground is not
-- listed could not post at all.
--
-- What: a game has either a TapTurf turf (turf_id, as before) or a venue
-- its host typed, kept on the game itself:
--   venue_name      2 to 80 characters        "Shivaji Maidan"
--   venue_address   5 to 200                  "Behind Ganesh Temple, Baner Road"
--   venue_area      up to 60, may be left out "Baner"
--   venue_city      2 to 60                   a city id ("pune") when it is
--                                             one, else the host's words ("Wai")
--   venue_maps_url  up to 300, may be left out: https Google Maps links
--                   only (maps.app.goo.gl, goo.gl/maps, www.google.com/maps,
--                   google.com/maps, maps.google.com), no dot segment
-- Never both, never neither: the constraint games_turf_or_venue. Lengths
-- and the map link's host: games_venue_fields. The words are stored with
-- spaces collapsed and trimmed, and the functions refuse a phone number (7
-- or more digits in a row, in any of India's scripts, once the marks
-- between a number's parts are taken out; a Hyderabad door number and a
-- PIN code after a comma are their own numbers: section 2), a link or an
-- email in the name, address, area or city (players reach the host
-- through TapTurf). lib/games/otherVenue.ts has the same rules; both are
-- run against lib/games/otherVenue.cases.json.
--
-- Nothing is added to public.turfs: the curated list, turf pages and every
-- city and sport page stay as they are. A typed venue's game is a game
-- like any other (/games, its own page, joining, the lineup, the Me tab);
-- it has no turf page and no map pin. The admin's "Venues hosts typed"
-- (admin_typed_venues, the site owner only) counts them, so popular ones
-- can be added to TapTurf.
--
-- Repeats carry the venue too: private.game_series gets the same columns
-- and its games copy them. Its turf_id stays not null (only the games
-- column below was approved to change), so a series at a typed venue
-- holds the all-zero uuid there (private.game_series_no_turf()); it has no
-- foreign key, nothing reads it as a turf, and game_series_json gives
-- null for it. Should the owner later approve that column's change too, a
-- follow-up can swap the marker for null.
--
-- Functions replaced, each copied from the newest file that defines it
-- (md5(pg_proc.prosrc) on production, read 2026-11-03, equals the body in
-- that file) and changed only for the venue:
--   private.game_field_problem(jsonb, text[])  20261030_games_lockdown.sql  8f0288752747b22b1404d23f47126930
--     + the five venue fields' rules (each caller still passes its own list).
--   public.game_create(text, uuid, jsonb)       20261102_game_series.sql    cf0627cfa6583f5ccd43fafa7455e6d7
--   public.game_series_create(text, uuid, jsonb, jsonb)
--                                               20261102_game_series.sql    9aaa3faca85f7fb807720b41770e66bb
--     + a turf_id or a typed venue (name, address and city needed, area and
--     map link may be left out), never both. A turf is still checked as
--     listed (r: venue); a typed venue has nothing to check against.
--   private.game_series_fill(uuid, timestamptz, boolean)
--                                               20261102_game_series.sql    b9d952dd05a1739e9f37edfe9d27f372
--     + a typed venue's series waits for no listing (the host's account
--     still); its games copy the venue.
--   private.game_series_json(private.game_series) 20261102_game_series.sql  378643aaec1a993ce7e06b02134aca43
--     + the venue keys; turf_id null for a typed venue.
--   public.game_update(text, uuid, uuid, jsonb, jsonb)
--                                               20261030_games_lockdown.sql 765f9b89a20b37d029d233f3c1a4f927
--     + a move to a listed turf clears the typed venue; the host may also
--     move the game to a typed venue (all of name, address and city).
--     Either tells the players, as a move always has.
-- Readers left as they are (a typed venue's game has no turf_id, which
-- each reads correctly): turf_page and owner_dashboard (a turf's games),
-- the review checks (a typed venue has no TapTurf turf to review), the
-- cache trigger (private.turf_key(null) is null; the 'games' key is still
-- marked), played-with, close_past_games, admin_people (a typed venue
-- adds no city evidence).
--
-- Additive: five nullable columns on each of the two tables, two checks on
-- each, new helper functions and one new admin read; the functions above
-- replaced with the same signatures. One statement changes a column, the
-- one the owner approved for this file (section 1): public.games.turf_id
-- may be null from now on, for a game at a typed venue. The foreign key
-- games_turf_id_fkey stays as it is: a null turf_id skips it, and a turf
-- taken out of the table still takes only its own games with it. Every
-- game on production has a turf (55 on 2026-11-03, none orphaned) and no
-- venue, so the checks pass for every row. No grant or
-- policy on a public table changes: anon and authenticated already read
-- every games column (20261030_games_lockdown_step2.sql), so the typed
-- venue is public, as a turf is; the create flow tells the host so.
-- Nothing is removed. Safe to run again.
--
-- Before this file: the create flow asks the database whether games have
-- venue_name and offers "Add the venue" only once they do; the routes
-- refuse a typed venue plainly (reason venue_off: "pick a TapTurf turf for
-- now"), and turf games go on exactly as before.
--
-- Check: PGLITE=<pglite dist/index.js> node scripts/sql-tests/game_other_venue.check.mjs supabase/migrations

set local lock_timeout = '5s';

-- Built on the games lockdown and repeats: without them it refuses to run (and changes nothing).
do $$
begin
  if to_regprocedure('private.game_field_problem(jsonb,text[])') is null
     or to_regprocedure('public.game_update(text,uuid,uuid,jsonb,jsonb)') is null
     or to_regprocedure('public.game_series_create(text,uuid,jsonb,jsonb)') is null
     or to_regprocedure('private.game_series_fill(uuid,timestamptz,boolean)') is null
     or to_regclass('private.game_series') is null then
    raise exception 'other venue: apply 20261030_games_lockdown.sql and 20261102_game_series.sql first';
  end if;
end;
$$;

-- ── 1. The columns ─────────────────────────────────────────

alter table public.games add column if not exists venue_name text;
alter table public.games add column if not exists venue_address text;
alter table public.games add column if not exists venue_area text;
alter table public.games add column if not exists venue_city text;
alter table public.games add column if not exists venue_maps_url text;

alter table private.game_series add column if not exists venue_name text;
alter table private.game_series add column if not exists venue_address text;
alter table private.game_series add column if not exists venue_area text;
alter table private.game_series add column if not exists venue_city text;
alter table private.game_series add column if not exists venue_maps_url text;

-- The one approved change: a game at a typed venue has no turf.
alter table public.games alter column turf_id drop not null;

-- A series at a typed venue: its turf_id (still not null) holds this.
create or replace function private.game_series_no_turf()
returns uuid
language sql
immutable
set search_path = ''
as $$
  select '00000000-0000-0000-0000-000000000000'::uuid;
$$;
revoke all on function private.game_series_no_turf() from public, anon, authenticated;

-- A turf or a typed venue (its name, address and city), never both, never
-- neither; each field's length, and the map link https Google Maps only.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'games_turf_or_venue' and conrelid = 'public.games'::regclass) then
    alter table public.games add constraint games_turf_or_venue check (
      (turf_id is not null and venue_name is null and venue_address is null and venue_area is null and venue_city is null and venue_maps_url is null)
      or (turf_id is null and venue_name is not null and venue_address is not null and venue_city is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'games_venue_fields' and conrelid = 'public.games'::regclass) then
    alter table public.games add constraint games_venue_fields check (
      (venue_name is null or char_length(venue_name) between 2 and 80)
      and (venue_address is null or char_length(venue_address) between 5 and 200)
      and (venue_area is null or char_length(venue_area) between 1 and 60)
      and (venue_city is null or char_length(venue_city) between 2 and 60)
      and (venue_maps_url is null or (char_length(venue_maps_url) <= 300
           and venue_maps_url ~* '^https://(maps\.app\.goo\.gl/|goo\.gl/maps(/|$)|(www\.)?google\.com/maps([/?#]|$)|maps\.google\.com([/?#]|$))'
           and venue_maps_url !~* '(\.\.|%2e)'
           and venue_maps_url ~ '^[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$')));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'game_series_turf_or_venue' and conrelid = 'private.game_series'::regclass) then
    alter table private.game_series add constraint game_series_turf_or_venue check (
      (turf_id <> '00000000-0000-0000-0000-000000000000'::uuid
        and venue_name is null and venue_address is null and venue_area is null and venue_city is null and venue_maps_url is null)
      or (turf_id = '00000000-0000-0000-0000-000000000000'::uuid
        and venue_name is not null and venue_address is not null and venue_city is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'game_series_venue_fields' and conrelid = 'private.game_series'::regclass) then
    alter table private.game_series add constraint game_series_venue_fields check (
      (venue_name is null or char_length(venue_name) between 2 and 80)
      and (venue_address is null or char_length(venue_address) between 5 and 200)
      and (venue_area is null or char_length(venue_area) between 1 and 60)
      and (venue_city is null or char_length(venue_city) between 2 and 60)
      and (venue_maps_url is null or (char_length(venue_maps_url) <= 300
           and venue_maps_url ~* '^https://(maps\.app\.goo\.gl/|goo\.gl/maps(/|$)|(www\.)?google\.com/maps([/?#]|$)|maps\.google\.com([/?#]|$))'
           and venue_maps_url !~* '(\.\.|%2e)'
           and venue_maps_url ~ '^[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$')));
  end if;
end;
$$;

comment on column public.games.venue_name is
  'A venue not on TapTurf, as its host typed it (turf_id is then null): name, with venue_address, venue_area, venue_city (a city id when known) and venue_maps_url. See 20261103_game_other_venue.sql.';

-- ── 2. The words' rules (lib/games/otherVenue.ts has the same) ──

-- Spaces, tabs, line breaks and no-break spaces collapsed to one space, the ends trimmed.
create or replace function private.game_venue_text(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(p, '[ \t\n\r\f\v ]+', ' ', 'g'), ' ');
$$;
revoke all on function private.game_venue_text(text) from public, anon, authenticated;

-- Every digit read as 0 to 9: those of India's scripts (Arabic-Indic and
-- its Persian form, Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil,
-- Telugu, Kannada, Malayalam) and full-width ones, 120 characters, each
-- script's 0 to 9 in order (lib/games/otherVenue.ts asciiDigits).
create or replace function private.game_venue_digits(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(p, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹०१२३४५६७८९০১২৩৪৫৬৭৮৯੦੧੨੩੪੫੬੭੮੯૦૧૨૩૪૫૬૭૮૯୦୧୨୩୪୫୬୭୮୯௦௧௨௩௪௫௬௭௮௯౦౧౨౩౪౫౬౭౮౯೦೧೨೩೪೫೬೭೮೯൦൧൨൩൪൫൬൭൮൯０１２３４５６７８９',
                      '012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789');
$$;
revoke all on function private.game_venue_digits(text) from public, anon, authenticated;

-- Fine as a venue's name, address, area or city: p_min to p_max characters
-- once spaces are collapsed; no control character, phone number, email or
-- link. A phone number: 7 or more digits in a row (any script's digits,
-- game_venue_digits) once the marks people put between a number's parts
-- are out: spaces, dots, commas, brackets, a plus, underscores, dashes,
-- and a slash before 4 or more digits ("98220/12345"; a survey number's
-- "1234/567" keeps its slash). Two numbers of an address are their own
-- first: a door number of the Hyderabad kind ("16-11-740": ward, block,
-- house) and a PIN code after a comma (", 411045"). A link: a scheme,
-- www., or a name ending in a common domain, except ".in" with a space
-- and a word after it, a sentence ("bus stand.In front of").
create or replace function private.game_venue_text_ok(p text, p_min integer, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select x is not null
     and char_length(x) between p_min and p_max
     and x !~ '[\u0001-\u001f\u007f]'
     and regexp_replace(
           regexp_replace(
             regexp_replace(private.game_venue_digits(x), '(?<![0-9-])[0-9]{1,2}-[0-9]{1,2}-[0-9]{1,4}(?![0-9-])', ' x ', 'g'),
             ', ?[1-9][0-9]{5}(?![0-9])', ', x ', 'g'),
           '[ .,()+_‐-―-]|/(?=[0-9]{4})', '', 'g') !~ '[0-9]{7,}'
     and x !~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+'
     and x !~* '(https?:|www\.|[a-z0-9-]+\.(com|net|org|io|app|gl|ly|me|info|xyz|online|site|page|link|biz)(?![a-z0-9_])|[a-z0-9-]+\.in(?![a-z0-9_])(?! [a-z]))'
    from (select private.game_venue_text(p) as x) v;
$$;
revoke all on function private.game_venue_text_ok(text, integer, integer) from public, anon, authenticated;

-- A Google Maps link the pages may open: https, a Google Maps host, no dot
-- segment plain or encoded ("/maps/../url" opens another Google page), at
-- most 300 characters, URL characters only.
create or replace function private.game_venue_maps_ok(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select x is not null and x <> '' and char_length(x) <= 300
     and x ~* '^https://(maps\.app\.goo\.gl/|goo\.gl/maps(/|$)|(www\.)?google\.com/maps([/?#]|$)|maps\.google\.com([/?#]|$))'
     and x !~* '(\.\.|%2e)'
     and x ~ '^[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$'
    from (select private.game_venue_text(p) as x) v;
$$;
revoke all on function private.game_venue_maps_ok(text) from public, anon, authenticated;

-- ── 3. The checks every game function shares ──────────────

-- The first field of a game body that is not allowed or not well formed,
-- or null when every one is fine ('body' when it is not an object). As
-- 20261030_games_lockdown.sql, with the typed venue's five fields.
create or replace function private.game_field_problem(p jsonb, p_allowed text[])
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  s text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return 'body';
  end if;
  for k, v in select e.key, e.value from jsonb_each(p) e loop
    if not (k = any (p_allowed)) then
      return k;
    end if;
    s := case when jsonb_typeof(v) = 'string' then v #>> '{}' end;
    if k = 'date' then
      if private.game_date_or_null(s) is null then return k; end if;
    elsif k in ('start_time', 'end_time') then
      if s is null or s !~ '^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$' then return k; end if;
    elsif k = 'max_players' then
      if jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^\d{1,2}$' or (v #>> '{}')::integer not between 2 and 50 then return k; end if;
    elsif k = 'price_per_player' then
      if jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^\d{1,5}(\.\d{1,2})?$' or (v #>> '{}')::numeric > 10000 then return k; end if;
    elsif k = 'description' then
      if not (jsonb_typeof(v) = 'null' or (s is not null and char_length(btrim(s)) <= 500)) then return k; end if;
    elsif k = 'turf_booked' then
      if jsonb_typeof(v) <> 'boolean' then return k; end if;
    elsif k = 'skill_level' then
      if s is null or s not in ('beginner', 'intermediate', 'advanced', 'all') then return k; end if;
    elsif k = 'turf_id' then
      if s is null or s !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return k; end if;
    elsif k = 'sport' then
      if s is null or char_length(btrim(s)) not between 1 and 40 then return k; end if;
    elsif k = 'host_phone' then
      if s is null or not (s = '' or s ~ '^\+91[6-9]\d{9}$') then return k; end if;
    elsif k = 'venue_name' then
      if not private.game_venue_text_ok(s, 2, 80) then return k; end if;
    elsif k = 'venue_address' then
      if not private.game_venue_text_ok(s, 5, 200) then return k; end if;
    elsif k = 'venue_city' then
      if not private.game_venue_text_ok(s, 2, 60) then return k; end if;
    elsif k = 'venue_area' then
      if not (jsonb_typeof(v) = 'null' or (s is not null and (private.game_venue_text(s) = '' or private.game_venue_text_ok(s, 1, 60)))) then return k; end if;
    elsif k = 'venue_maps_url' then
      if not (jsonb_typeof(v) = 'null' or (s is not null and (private.game_venue_text(s) = '' or private.game_venue_maps_ok(s)))) then return k; end if;
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.game_field_problem(jsonb, text[]) from public, anon, authenticated;

-- What is wrong with a body's place, or null: a body names a turf (turf_id)
-- or types a venue (any venue field), never both; a typed venue needs its
-- name, address and city. Run after game_field_problem.
create or replace function private.game_venue_problem(p jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when not (p ?| array['venue_name', 'venue_address', 'venue_area', 'venue_city', 'venue_maps_url']) then null
           when p ? 'turf_id' then 'venue_name'
           when not p ? 'venue_name' then 'venue_name'
           when not p ? 'venue_address' then 'venue_address'
           when not p ? 'venue_city' then 'venue_city'
         end;
$$;
revoke all on function private.game_venue_problem(jsonb) from public, anon, authenticated;

-- ── 4. Games: create and edit (and move) ──────────────────

-- As 20261102_game_series.sql, with the typed venue: p_game has turf_id
-- (checked as listed, r: venue, as before) or venue_name, venue_address
-- and venue_city (venue_area and venue_maps_url may be left out), which
-- are stored with spaces collapsed, the empty ones null, and turf_id null.
create or replace function public.game_create(p_key text, p_user_id uuid, p_game jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users;
  v_date date;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_bad text;
  v_row public.games;
  v_sport text;
  v_venue boolean;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  v_bad := private.game_field_problem(p_game, array['turf_id', 'sport', 'skill_level', 'max_players', 'date', 'start_time', 'end_time',
                                                    'price_per_player', 'description', 'turf_booked', 'host_phone',
                                                    'venue_name', 'venue_address', 'venue_area', 'venue_city', 'venue_maps_url']);
  v_venue := v_bad is null and p_game ?| array['venue_name', 'venue_address', 'venue_area', 'venue_city', 'venue_maps_url'];
  if v_bad is null then
    v_bad := private.game_venue_problem(p_game);
  end if;
  if v_bad is null and not (p_game ?& array['sport', 'skill_level', 'max_players', 'date', 'start_time', 'end_time', 'price_per_player']
                            and (v_venue or p_game ? 'turf_id')) then
    v_bad := 'body';
  end if;
  if v_bad is not null then
    return jsonb_build_object('r', 'bad', 'field', v_bad);
  end if;
  v_date := (p_game ->> 'date')::date;
  if v_date < v_today or v_date > v_today + 365 then
    return jsonb_build_object('r', 'bad', 'field', 'date');
  end if;
  -- One create at a time per account: the daily limit counts every game before this one.
  perform pg_advisory_xact_lock(hashtextextended('game_create:' || p_user_id::text, 0));
  select * into v_user from public.users u where u.id = p_user_id;
  if not found then
    return jsonb_build_object('r', 'bad');
  end if;
  if not v_venue and not exists (select 1 from public.turfs t where t.id = (p_game ->> 'turf_id')::uuid and t.is_active is true) then
    return jsonb_build_object('r', 'venue');
  end if;
  if (select count(*) from public.games g where g.creator_id = p_user_id and g.series_id is null and g.created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('r', 'limit');
  end if;
  v_sport := btrim(p_game ->> 'sport');
  insert into public.games (creator_id, turf_id, title, description, sport, skill_level, max_players, current_players, date,
                            start_time, end_time, price_per_player, status, host_name, host_phone, host_profile_image_url, turf_booked,
                            venue_name, venue_address, venue_area, venue_city, venue_maps_url)
  values (p_user_id, case when v_venue then null else (p_game ->> 'turf_id')::uuid end, v_sport || ' Game',
          coalesce(nullif(btrim(p_game ->> 'description'), ''), v_sport || ' game'),
          v_sport, p_game ->> 'skill_level', (p_game ->> 'max_players')::integer, 1, v_date,
          (p_game ->> 'start_time')::time, (p_game ->> 'end_time')::time, (p_game ->> 'price_per_player')::numeric, 'open',
          coalesce(nullif(btrim(v_user.name::text), ''), 'Player'), coalesce(p_game ->> 'host_phone', ''),
          coalesce(v_user.profile_image_url, ''), coalesce((p_game ->> 'turf_booked')::boolean, false),
          case when v_venue then private.game_venue_text(p_game ->> 'venue_name') end,
          case when v_venue then private.game_venue_text(p_game ->> 'venue_address') end,
          case when v_venue then nullif(private.game_venue_text(p_game ->> 'venue_area'), '') end,
          case when v_venue then private.game_venue_text(p_game ->> 'venue_city') end,
          case when v_venue then nullif(private.game_venue_text(p_game ->> 'venue_maps_url'), '') end)
  returning * into v_row;
  insert into public.game_participants (game_id, user_id) values (v_row.id, p_user_id)
  on conflict (game_id, user_id) do nothing;
  return jsonb_build_object('r', 'ok', 'game', to_jsonb(v_row));
end;
$$;
revoke all on function public.game_create(text, uuid, jsonb) from public;
grant execute on function public.game_create(text, uuid, jsonb) to anon, authenticated;

-- The host's edit sheet, as 20261030_games_lockdown.sql, with the typed
-- venue: a move to a listed turf (turf_id) clears it; a typed venue
-- (venue_name, venue_address and venue_city, maybe venue_area and
-- venue_maps_url; never with turf_id) takes the game off its turf. A change
-- of turf, or of the typed name, address or city, is a move: the players
-- are told ("Your game moved to <name>" unless the route words it).
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
  return jsonb_build_object('r', 'ok', 'game', to_jsonb(v_row), 'notified', v_notified);
end;
$$;
revoke all on function public.game_update(text, uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.game_update(text, uuid, uuid, jsonb, jsonb) to anon, authenticated;

-- ── 5. Repeats at a typed venue ───────────────────────────

-- A series as its host reads it (never the number it gives players), as
-- 20261102_game_series.sql, with the typed venue (turf_id null for one).
create or replace function private.game_series_json(s private.game_series)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id, 'turf_id', nullif(s.turf_id, private.game_series_no_turf()), 'sport', s.sport, 'skill_level', s.skill_level, 'max_players', s.max_players,
    'start_time', s.start_time, 'end_time', s.end_time, 'price_per_player', s.price_per_player,
    'rule', s.rule, 'starts_on', s.starts_on, 'ends', private.game_series_ends(s),
    'active', s.active, 'ended', s.ended, 'stopped_at', s.stopped_at, 'created_at', s.created_at,
    'venue_name', s.venue_name, 'venue_address', s.venue_address, 'venue_area', s.venue_area, 'venue_city', s.venue_city,
    'venue_maps_url', s.venue_maps_url);
$$;
revoke all on function private.game_series_json(private.game_series) from public, anon, authenticated;

-- Puts up the series' next games, as 20261102_game_series.sql: a series at
-- a typed venue waits for no listing (only for the host's account), and
-- its games carry the venue.
create or replace function private.game_series_fill(p_series_id uuid, p_now timestamptz default now(), p_booked boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s private.game_series;
  v_user public.users;
  v_now timestamp := p_now at time zone 'Asia/Kolkata';
  v_today date := (p_now at time zone 'Asia/Kolkata')::date;
  v_ahead integer;
  v_room integer;
  v_day date;
  v_made integer := 0;
  v_row public.games;
begin
  -- One fill at a time per series (the create and the daily job).
  select * into v_s from private.game_series s where s.id = p_series_id for update;
  if not found or not v_s.active then
    return 0;
  end if;
  if not exists (select 1 from private.game_series_days(v_s.rule, v_s.starts_on, private.game_series_last(v_s), v_s.max_games) x
                  where x.day + v_s.start_time > v_now
                    and not exists (select 1 from private.game_series_dates d where d.series_id = v_s.id and d.day = x.day)) then
    update private.game_series s set active = false, ended = 'done', updated_at = now() where s.id = v_s.id;
    return 0;
  end if;
  select * into v_user from public.users u where u.id = v_s.host_id;
  -- No account any more, or the turf is not listed: nothing is made until it is. A typed venue has no listing.
  if not found or (v_s.turf_id <> private.game_series_no_turf()
                   and not exists (select 1 from public.turfs t where t.id = v_s.turf_id and t.is_active is true)) then
    return 0;
  end if;
  -- Series games have their own daily limit, across the host's series.
  perform pg_advisory_xact_lock(hashtextextended('game_series_fill:' || v_s.host_id::text, 0));
  v_room := 30 - (select count(*) from public.games g
                   where g.creator_id = v_s.host_id and g.series_id is not null and g.created_at > p_now - interval '1 day');
  -- Its games still on from today: one the host cancelled holds no place
  -- (game_series_dates still keeps its day from being made again).
  select count(*) into v_ahead from public.games g
   where g.series_id = v_s.id and coalesce(g.status, 'open') in ('open', 'full') and g.date >= v_today;
  for v_day in
    select x.day
      from private.game_series_days(v_s.rule, v_s.starts_on, private.game_series_last(v_s), v_s.max_games) x
     where x.day + v_s.start_time > v_now
       and not exists (select 1 from private.game_series_dates d where d.series_id = v_s.id and d.day = x.day)
     order by x.day
  loop
    exit when v_ahead >= 8 or v_room <= 0 or (v_day > v_today + 27 and v_ahead > 0);
    insert into public.games (creator_id, turf_id, title, description, sport, skill_level, max_players, current_players, date,
                              start_time, end_time, price_per_player, status, host_name, host_phone, host_profile_image_url, turf_booked, series_id,
                              venue_name, venue_address, venue_area, venue_city, venue_maps_url)
    values (v_s.host_id, nullif(v_s.turf_id, private.game_series_no_turf()), v_s.sport || ' Game', coalesce(nullif(btrim(v_s.description), ''), v_s.sport || ' game'),
            v_s.sport, v_s.skill_level, v_s.max_players, 1, v_day, v_s.start_time, v_s.end_time, v_s.price_per_player, 'open',
            coalesce(nullif(btrim(v_user.name::text), ''), 'Player'), coalesce(v_s.host_phone, ''),
            coalesce(v_user.profile_image_url, ''), coalesce(p_booked, false) and v_made = 0, v_s.id,
            v_s.venue_name, v_s.venue_address, v_s.venue_area, v_s.venue_city, v_s.venue_maps_url)
    returning * into v_row;
    insert into public.game_participants (game_id, user_id) values (v_row.id, v_s.host_id)
    on conflict (game_id, user_id) do nothing;
    insert into private.game_series_dates (series_id, day, game_id) values (v_s.id, v_day, v_row.id);
    v_made := v_made + 1;
    v_ahead := v_ahead + 1;
    v_room := v_room - 1;
  end loop;
  if v_made > 0 then
    update private.game_series s set updated_at = now() where s.id = v_s.id;
  end if;
  return v_made;
end;
$$;
revoke all on function private.game_series_fill(uuid, timestamptz, boolean) from public, anon, authenticated;

-- Starting a repeat, as 20261102_game_series.sql, with the typed venue as
-- game_create takes it (kept on the series; its turf_id the all-zero marker).
create or replace function public.game_series_create(p_key text, p_user_id uuid, p_game jsonb, p_repeat jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users;
  v_date date;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_bad text;
  v_rule jsonb;
  v_ends jsonb;
  v_first date;
  v_s private.game_series;
  v_sport text;
  v_made integer;
  v_venue boolean;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  v_bad := private.game_field_problem(p_game, array['turf_id', 'sport', 'skill_level', 'max_players', 'date', 'start_time', 'end_time',
                                                    'price_per_player', 'description', 'turf_booked', 'host_phone',
                                                    'venue_name', 'venue_address', 'venue_area', 'venue_city', 'venue_maps_url']);
  v_venue := v_bad is null and p_game ?| array['venue_name', 'venue_address', 'venue_area', 'venue_city', 'venue_maps_url'];
  if v_bad is null then
    v_bad := private.game_venue_problem(p_game);
  end if;
  if v_bad is null and not (p_game ?& array['sport', 'skill_level', 'max_players', 'date', 'start_time', 'end_time', 'price_per_player']
                            and (v_venue or p_game ? 'turf_id')) then
    v_bad := 'body';
  end if;
  if v_bad is not null then
    return jsonb_build_object('r', 'bad', 'field', v_bad);
  end if;
  v_date := (p_game ->> 'date')::date;
  if v_date < v_today or v_date > v_today + 365 then
    return jsonb_build_object('r', 'bad', 'field', 'date');
  end if;
  v_bad := private.game_series_problem(p_repeat, v_date);
  if v_bad is not null then
    return jsonb_build_object('r', 'bad', 'field', v_bad);
  end if;
  v_ends := p_repeat -> 'ends';
  -- Kept as the maths reads it: a weekly rule's days in order, each once.
  v_rule := case when p_repeat -> 'rule' ->> 'freq' = 'weekly' then
      jsonb_build_object('freq', 'weekly', 'interval', (p_repeat -> 'rule' ->> 'interval')::integer,
                         'days', (select jsonb_agg((e #>> '{}')::integer order by (e #>> '{}')::integer) from jsonb_array_elements(p_repeat -> 'rule' -> 'days') e))
    when p_repeat -> 'rule' ->> 'by' = 'date' then
      jsonb_build_object('freq', 'monthly', 'by', 'date', 'day', (p_repeat -> 'rule' ->> 'day')::integer)
    else
      jsonb_build_object('freq', 'monthly', 'by', 'weekday', 'nth', (p_repeat -> 'rule' ->> 'nth')::integer, 'weekday', (p_repeat -> 'rule' ->> 'weekday')::integer)
    end;
  -- The first game must not have started already.
  select x.day into v_first from private.game_series_days(v_rule, v_date, v_date + 365, null) x order by x.day limit 1;
  if v_first + (p_game ->> 'start_time')::time <= (now() at time zone 'Asia/Kolkata') then
    return jsonb_build_object('r', 'bad', 'field', 'start_time');
  end if;
  -- One create at a time per host: the limits count every series before this one.
  perform pg_advisory_xact_lock(hashtextextended('game_series:' || p_user_id::text, 0));
  select * into v_user from public.users u where u.id = p_user_id;
  if not found then
    return jsonb_build_object('r', 'bad');
  end if;
  if not v_venue and not exists (select 1 from public.turfs t where t.id = (p_game ->> 'turf_id')::uuid and t.is_active is true) then
    return jsonb_build_object('r', 'venue');
  end if;
  if (select count(*) from private.game_series s where s.host_id = p_user_id and s.active) >= 3 then
    return jsonb_build_object('r', 'many');
  end if;
  if (select count(*) from private.game_series s where s.host_id = p_user_id and s.created_at > now() - interval '1 day') >= 5
     or (select count(*) from public.games g where g.creator_id = p_user_id and g.series_id is not null and g.created_at > now() - interval '1 day') >= 30 then
    -- (The second: today's series games are used up, so it could put up no first game.)
    return jsonb_build_object('r', 'limit');
  end if;
  v_sport := btrim(p_game ->> 'sport');
  insert into private.game_series (host_id, turf_id, sport, skill_level, max_players, start_time, end_time, price_per_player,
                                   description, host_phone, rule, starts_on, ends_on, max_games,
                                   venue_name, venue_address, venue_area, venue_city, venue_maps_url)
  values (p_user_id, case when v_venue then private.game_series_no_turf() else (p_game ->> 'turf_id')::uuid end,
          v_sport, p_game ->> 'skill_level', (p_game ->> 'max_players')::integer,
          (p_game ->> 'start_time')::time, (p_game ->> 'end_time')::time, (p_game ->> 'price_per_player')::numeric,
          nullif(btrim(p_game ->> 'description'), ''), coalesce(p_game ->> 'host_phone', ''), v_rule, v_date,
          case when v_ends ->> 'type' = 'on' then (v_ends ->> 'date')::date end,
          case when v_ends ->> 'type' = 'after' then (v_ends ->> 'count')::integer end,
          case when v_venue then private.game_venue_text(p_game ->> 'venue_name') end,
          case when v_venue then private.game_venue_text(p_game ->> 'venue_address') end,
          case when v_venue then nullif(private.game_venue_text(p_game ->> 'venue_area'), '') end,
          case when v_venue then private.game_venue_text(p_game ->> 'venue_city') end,
          case when v_venue then nullif(private.game_venue_text(p_game ->> 'venue_maps_url'), '') end)
  returning * into v_s;
  v_made := private.game_series_fill(v_s.id, now(), coalesce((p_game ->> 'turf_booked')::boolean, false));
  select * into v_s from private.game_series s where s.id = v_s.id;
  return jsonb_build_object('r', 'ok', 'series', private.game_series_json(v_s), 'made', v_made,
    'games', coalesce((select jsonb_agg(to_jsonb(g) order by g.date) from public.games g where g.series_id = v_s.id), '[]'::jsonb));
end;
$$;
revoke all on function public.game_series_create(text, uuid, jsonb, jsonb) from public;
grant execute on function public.game_series_create(text, uuid, jsonb, jsonb) to anon, authenticated;

-- ── 6. The site owner's list of typed venues ──────────────

-- The venues hosts typed, the most used first (at most 200): the name and
-- area as most of its games spell them, the city, how many games (of any
-- status) and hosts, the last game's day and when one was last posted. One
-- row per name and city, whatever the case. Nothing about anyone: no
-- address, no host, no number.
create or replace function public.admin_typed_venues(p_firebase_token text default null)
returns table (
  venue_name text,
  venue_area text,
  venue_city text,
  games bigint,
  hosts bigint,
  last_day date,
  last_posted timestamptz
)
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
  select mode() within group (order by g.venue_name), mode() within group (order by g.venue_area),
         mode() within group (order by g.venue_city), count(*), count(distinct g.creator_id), max(g.date), max(g.created_at)
    from public.games g
   where g.turf_id is null and g.venue_name is not null
   group by lower(g.venue_name), lower(coalesce(g.venue_city, ''))
   order by count(*) desc, max(g.created_at) desc nulls last
   limit 200;
end;
$$;
revoke all on function public.admin_typed_venues(text) from public;
grant execute on function public.admin_typed_venues(text) to anon, authenticated;
