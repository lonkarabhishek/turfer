-- Ground sizes. The site owner asked (2 Nov 2026) for owners to give the
-- size of each ground on myTapturf, and for the turf page to show it
-- well, benchmarked: higher nets are better for cricket, longer is
-- usually better, wider means more singles and doubles.
--
-- Where: one jsonb column on public.turfs, ground_sizes. The turf page
-- already reads the whole row in its one call (public.turf_page returns
-- to_jsonb(t) minus a few admin columns), so the page, the build-data step
-- and the cache all carry it with no new read; the cache trigger
-- (private.mark_turf_dirty) treats a new column as DETAIL, so a change
-- purges that turf's page only, never the lists. A private table would
-- have needed turf_page replaced, or a second read per page.
--
--   ground_sizes = {
--     "grounds": [ { "name": "Box 1" | null, "sport": "cricket" | "football" | "both" | null,
--                    "length_ft": 120.0, "width_ft": 60.0, "height_ft": 40.0 | null }, ... up to 4 ],
--     "unit": "ft" | "m",          the unit the owner typed in (the form shows it again)
--     "updated_at": "<timestamptz>",
--     "source": "owner" }
-- or null. Feet, to 0.1 ft; width at most the length; length 30 to 400,
-- width 20 to 250, height 8 to 120 (null: no net or roof height, an open
-- ground). The constraint turfs_ground_sizes_ok holds every row to that.
-- lib/turfSize/sizes.ts has the same rules (lib/turfSize/cases.json is run
-- against both: npm run test:turf, scripts/sql-tests/turf_dimensions.check.mjs).
--
-- Functions (the server key, private.account_key_ok, and the account the
-- server resolved from a verified sign-in, never one the browser names;
-- anon and authenticated may call them, PUBLIC may not):
--   * turf_ground_sizes_save: an owner saves the grounds (in feet: the
--     route converts metres). Only an account that runs the turf: an active
--     claim (or turfs.owner_id), by private.account_manages_turf's rules,
--     which alone also counts a pending claim (it blocks an owner's reviews
--     of their own turf, where wider is safer); or the site owner, who can
--     open any turf on myTapturf. Each ground checked, swapped when the
--     width was typed as the longer side, rounded; at most 20 saves a turf
--     in 24 hours (counted in turf_edit_log). A save that changes nothing
--     writes nothing. Logged in turf_edit_log (user_key 'account:<id>'),
--     and the page queued at once (private.mark_dirty, urgent). An empty
--     list takes the sizes off.
--   * turf_ground_sizes_mine: what the form starts from: the saved sizes,
--     the turf's older researched length_feet/width_feet/height_feet, and
--     how many saves are left today. Same check.
--   * turf_ground_size_peers: every active turf's owner sizes as numbers
--     only, [[id, city, [[length, width, height], ...]], ...], for the
--     "longer than 72% of turfs in Nashik" lines (lib/turfSize/benchmark.ts).
--     Anyone may call it: the same numbers are on each turf's public page.
--
-- The app works before this file: the form shows "coming soon" while the
-- functions are missing, and the page shows the card only for a turf with
-- sizes. Additive: one nullable column with its check, new functions. No
-- grant or policy on a public table changes. Written without the
-- destructive SQL keywords. Safe to run again.
--
-- Helpers it calls, unchanged since (md5(pg_proc.prosrc) on production,
-- read 2026-11-02, equals the body in):
--   private.account_key_ok(text)            20261021_accounts_usernames.sql  ca605fa89a97497134b690e753dc5c0e
--   private.account_manages_turf(uuid, uuid) 20261027_game_reports.sql       8258ccac73b99be1b82a657383e91993
--   private.account_phone10(uuid)            20261026_account_links_reads.sql 3cf7116010b181e42c095f43c23b13cd
--   private.account_for_key(text)            20261026_account_links.sql       a37bb5437bca089d3ed548a6b147fe54
--   private.mark_dirty(text[], boolean)      20261026_cache_list_cap.sql      37bd49deeb876dea1d0ba207a8969ce0
--   private.turf_key(uuid)                   20261020_cache_queue.sql         e972eb531f269e6b205e04d1942398a0
--   private.mark_turf_dirty()                20261025_turf_claimed.sql        55460663afb1a86d9582e6200b20b766
--   public._is_admin_key(text)               20261019_mytapturf.sql           c9e14ff9b4713cd87a73ceac3296f20b

set local lock_timeout = '5s';

-- ── The stored shape ──────────────────────────────────────

-- Every row's ground_sizes: null, or the shape above. The check runs as
-- whoever writes the row (the data team's service role included), so
-- PUBLIC keeps EXECUTE: it reads only its argument. anon and
-- authenticated cannot write turfs at all (20261019_lock_bookings_and_turfs.sql),
-- and the private schema is not exposed.
create or replace function private.turf_ground_sizes_ok(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_object_keys(p) k where k not in ('grounds', 'unit', 'updated_at', 'source'))
    and p ->> 'source' = 'owner'
    and p ->> 'unit' in ('ft', 'm')
    and jsonb_typeof(p -> 'updated_at') = 'string'
    and (p ->> 'updated_at') ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}'
    and jsonb_typeof(p -> 'grounds') = 'array'
    and jsonb_array_length(p -> 'grounds') between 1 and 4
    and not exists (
      select 1 from jsonb_array_elements(p -> 'grounds') g
       where jsonb_typeof(g) <> 'object'
          or exists (select 1 from jsonb_object_keys(g) k where k not in ('name', 'sport', 'length_ft', 'width_ft', 'height_ft'))
          or jsonb_typeof(g -> 'name') not in ('string', 'null')
          or (jsonb_typeof(g -> 'name') = 'string' and (length(g ->> 'name') not between 1 and 30 or g ->> 'name' <> btrim(g ->> 'name')))
          or jsonb_typeof(g -> 'sport') not in ('string', 'null')
          or (jsonb_typeof(g -> 'sport') = 'string' and g ->> 'sport' not in ('cricket', 'football', 'both'))
          or jsonb_typeof(g -> 'length_ft') is distinct from 'number'
          or jsonb_typeof(g -> 'width_ft') is distinct from 'number'
          or jsonb_typeof(g -> 'height_ft') not in ('number', 'null')
          or (g ->> 'length_ft')::numeric not between 30 and 400
          or (g ->> 'width_ft')::numeric not between 20 and 250
          or (g ->> 'width_ft')::numeric > (g ->> 'length_ft')::numeric
          or (jsonb_typeof(g -> 'height_ft') = 'number' and (g ->> 'height_ft')::numeric not between 8 and 120)
          or (g ->> 'length_ft')::numeric <> round((g ->> 'length_ft')::numeric, 1)
          or (g ->> 'width_ft')::numeric <> round((g ->> 'width_ft')::numeric, 1)
          or (jsonb_typeof(g -> 'height_ft') = 'number' and (g ->> 'height_ft')::numeric <> round((g ->> 'height_ft')::numeric, 1))));
$$;
grant execute on function private.turf_ground_sizes_ok(jsonb) to public;

alter table public.turfs add column if not exists ground_sizes jsonb;

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'turfs_ground_sizes_ok' and conrelid = 'public.turfs'::regclass) then
    alter table public.turfs add constraint turfs_ground_sizes_ok check (private.turf_ground_sizes_ok(ground_sizes));
  end if;
end
$do$;

comment on column public.turfs.ground_sizes is
  'Owner-reported ground sizes in feet (myTapturf, public.turf_ground_sizes_save only): {grounds: [{name, sport, length_ft, width_ft, height_ft}], unit, updated_at, source}. See 20261102_turf_dimensions.sql.';

-- ── Who may change them ───────────────────────────────────

-- The account runs this turf: private.account_manages_turf, and of what it
-- counts only turfs.owner_id or an active claim (for the account, or from
-- before claims named the account, under a sign-in that opens it now: the
-- rule public._can_manage keeps for every other owner edit), never a
-- pending one. Or the site owner (public._is_admin_key, by the account's
-- proven number or its Google address), as on the rest of myTapturf.
create or replace function private.turf_ground_sizes_editor(p_user uuid, p_turf uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and p_turf is not null and (
    (private.account_manages_turf(p_user, p_turf)
     and (exists (select 1 from public.turfs t where t.id = p_turf and t.owner_id = p_user)
          or exists (select 1 from public.turf_owners o
                      where o.turf_id = p_turf and o.status = 'active'
                        and (o.user_id = p_user
                             or (o.user_id is null and private.account_for_key(o.user_key) = p_user)))))
    or public._is_admin_key('p:' || coalesce(private.account_phone10(p_user), ''))
    or exists (select 1 from auth.users a
                where a.id = p_user and a.email is not null
                  and public._is_admin_key('e:' || lower(a.email::text)))
  );
$$;
revoke all on function private.turf_ground_sizes_editor(uuid, uuid) from public, anon, authenticated;

-- Saves left in the 24 hours to now (20 a turf, whoever saves).
create or replace function private.turf_ground_sizes_left(p_turf uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, 20 - (
    select count(*)::integer from public.turf_edit_log l
     where l.turf_id = p_turf and l.created_at > now() - interval '24 hours' and l.after ? 'ground_sizes'));
$$;
revoke all on function private.turf_ground_sizes_left(uuid) from public, anon, authenticated;

-- ── The form's start ──────────────────────────────────────

create or replace function public.turf_ground_sizes_mine(p_key text, p_user_id uuid, p_turf_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t record;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  select x.ground_sizes, x.length_feet, x.width_feet, x.height_feet into t
    from public.turfs x where x.id = p_turf_id and x.is_active;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if not private.turf_ground_sizes_editor(p_user_id, p_turf_id) then
    return jsonb_build_object('r', 'forbidden');
  end if;
  return jsonb_build_object(
    'r', 'ok',
    'ground_sizes', t.ground_sizes,
    -- The research pass's one size (28 active turfs on 2 Nov 2026), offered to check, never saved for the owner.
    'legacy', case when t.length_feet is not null and t.width_feet is not null
                   then jsonb_build_object('length_ft', t.length_feet, 'width_ft', t.width_feet, 'height_ft', t.height_feet) end,
    'saves_left', private.turf_ground_sizes_left(p_turf_id));
end;
$$;
revoke all on function public.turf_ground_sizes_mine(text, uuid, uuid) from public;
grant execute on function public.turf_ground_sizes_mine(text, uuid, uuid) to anon, authenticated;

-- ── Save ──────────────────────────────────────────────────

-- p_sizes = {"unit": "ft" | "m", "grounds": [{name, sport, length_ft, width_ft, height_ft}, ...]}.
-- Answers {r: ok, changed, ground_sizes, saves_left}, or r: bad (ground: its index, -1 for the
-- list; field: name, sport, length, width, height, unit or grounds), forbidden, gone, limit or unavailable.
create or replace function public.turf_ground_sizes_save(p_key text, p_user_id uuid, p_turf_id uuid, p_sizes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_unit text;
  v_list jsonb;
  v_grounds jsonb := '[]'::jsonb;
  v_new jsonb;
  g jsonb;
  i integer;
  v_name text;
  v_sport text;
  v_l numeric;
  v_w numeric;
  v_h numeric;
  v_swap numeric;
  v_left integer;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  -- The row first, locked: two saves at once count against the limit one after the other.
  select t.ground_sizes into v_old from public.turfs t where t.id = p_turf_id and t.is_active for update;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if not private.turf_ground_sizes_editor(p_user_id, p_turf_id) then
    return jsonb_build_object('r', 'forbidden');
  end if;

  if p_sizes is null or jsonb_typeof(p_sizes) <> 'object' or jsonb_typeof(p_sizes -> 'grounds') is distinct from 'array' then
    return jsonb_build_object('r', 'bad', 'ground', -1, 'field', 'grounds');
  end if;
  v_unit := coalesce(p_sizes ->> 'unit', 'ft');
  if jsonb_typeof(coalesce(p_sizes -> 'unit', '"ft"'::jsonb)) <> 'string' or v_unit not in ('ft', 'm') then
    return jsonb_build_object('r', 'bad', 'ground', -1, 'field', 'unit');
  end if;
  v_list := p_sizes -> 'grounds';
  if jsonb_array_length(v_list) > 4 then
    return jsonb_build_object('r', 'bad', 'ground', -1, 'field', 'grounds');
  end if;

  for i in 0 .. jsonb_array_length(v_list) - 1 loop
    g := v_list -> i;
    if jsonb_typeof(g) <> 'object' then
      return jsonb_build_object('r', 'bad', 'ground', i, 'field', 'grounds');
    end if;
    -- Name: spaces squeezed and trimmed, blank is none, at most 30 characters, no phone number in it.
    if jsonb_typeof(g -> 'name') not in ('string', 'null') then
      return jsonb_build_object('r', 'bad', 'ground', i, 'field', 'name');
    end if;
    v_name := nullif(btrim(regexp_replace(g ->> 'name', '\s+', ' ', 'g')), '');
    if length(v_name) > 30 or v_name ~ '[0-9]([ .()-]{0,2}[0-9]){7,}' then
      return jsonb_build_object('r', 'bad', 'ground', i, 'field', 'name');
    end if;
    if jsonb_typeof(g -> 'sport') not in ('string', 'null') or (g ->> 'sport') not in ('cricket', 'football', 'both') then
      return jsonb_build_object('r', 'bad', 'ground', i, 'field', 'sport');
    end if;
    v_sport := g ->> 'sport';
    if jsonb_typeof(g -> 'length_ft') is distinct from 'number' then
      return jsonb_build_object('r', 'bad', 'ground', i, 'field', 'length');
    end if;
    if jsonb_typeof(g -> 'width_ft') is distinct from 'number' then
      return jsonb_build_object('r', 'bad', 'ground', i, 'field', 'width');
    end if;
    if jsonb_typeof(g -> 'height_ft') not in ('number', 'null') then
      return jsonb_build_object('r', 'bad', 'ground', i, 'field', 'height');
    end if;
    v_l := round((g ->> 'length_ft')::numeric, 1);
    v_w := round((g ->> 'width_ft')::numeric, 1);
    v_h := round((g ->> 'height_ft')::numeric, 1);
    -- Nothing (0, or under 0.05 ft) is no size, before any swap: the box it was typed in.
    if v_l <= 0 then
      return jsonb_build_object('r', 'bad', 'ground', i, 'field', 'length');
    end if;
    if v_w <= 0 then
      return jsonb_build_object('r', 'bad', 'ground', i, 'field', 'width');
    end if;
    if v_h <= 0 then
      return jsonb_build_object('r', 'bad', 'ground', i, 'field', 'height');
    end if;
    -- Typed the other way round: the longer side is the length.
    if v_w > v_l then
      v_swap := v_l;
      v_l := v_w;
      v_w := v_swap;
    end if;
    if v_l not between 30 and 400 then
      return jsonb_build_object('r', 'bad', 'ground', i, 'field', 'length');
    end if;
    if v_w not between 20 and 250 then
      return jsonb_build_object('r', 'bad', 'ground', i, 'field', 'width');
    end if;
    if v_h is not null and v_h not between 8 and 120 then
      return jsonb_build_object('r', 'bad', 'ground', i, 'field', 'height');
    end if;
    v_grounds := v_grounds || jsonb_build_array(jsonb_build_object(
      'name', v_name, 'sport', v_sport, 'length_ft', v_l, 'width_ft', v_w, 'height_ft', v_h));
  end loop;

  -- Nothing new: no write, no log, no save used.
  if (jsonb_array_length(v_grounds) = 0 and v_old is null)
     or (v_old is not null and v_old -> 'grounds' = v_grounds and v_old ->> 'unit' = v_unit) then
    return jsonb_build_object('r', 'ok', 'changed', false, 'ground_sizes', v_old, 'saves_left', private.turf_ground_sizes_left(p_turf_id));
  end if;
  v_left := private.turf_ground_sizes_left(p_turf_id);
  if v_left <= 0 then
    return jsonb_build_object('r', 'limit');
  end if;

  v_new := case when jsonb_array_length(v_grounds) = 0 then null
                else jsonb_build_object('grounds', v_grounds, 'unit', v_unit, 'updated_at', now(), 'source', 'owner') end;
  update public.turfs set ground_sizes = v_new, updated_at = now() where id = p_turf_id;
  insert into public.turf_edit_log (turf_id, user_key, before, after)
  values (p_turf_id, 'account:' || p_user_id::text, jsonb_build_object('ground_sizes', v_old), jsonb_build_object('ground_sizes', v_new));
  -- The page now (the turfs trigger queued it too; the edit log's trigger and this make it urgent).
  perform private.mark_dirty(array[private.turf_key(p_turf_id)], true);
  return jsonb_build_object('r', 'ok', 'changed', true, 'ground_sizes', v_new, 'saves_left', v_left - 1);
end;
$$;
revoke all on function public.turf_ground_sizes_save(text, uuid, uuid, jsonb) from public;
grant execute on function public.turf_ground_sizes_save(text, uuid, uuid, jsonb) to anon, authenticated;

-- ── Other turfs, for the benchmarks ───────────────────────

-- Numbers only, for active turfs (the caller's own rights: anon reads active turfs).
create or replace function public.turf_ground_size_peers()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_array(
           t.id, t.city,
           (select jsonb_agg(jsonb_build_array(g -> 'length_ft', g -> 'width_ft', g -> 'height_ft') order by n)
              from jsonb_array_elements(t.ground_sizes -> 'grounds') with ordinality x(g, n)))
         order by t.id), '[]'::jsonb)
    from public.turfs t
   where t.is_active and t.ground_sizes is not null and t.ground_sizes ->> 'source' = 'owner';
$$;
revoke all on function public.turf_ground_size_peers() from public;
grant execute on function public.turf_ground_size_peers() to anon, authenticated;
