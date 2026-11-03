-- Covered, partly covered or open air. The site owner asked (3 Nov 2026)
-- for a "Covered" filter on the listings, and few turfs say: on 3 Nov,
-- of 3,830 active turfs, is_covered was true on 44, false on 11 and null
-- on 3,775. Owners could already answer Yes / No / Not sure for "Covered /
-- indoor" on myTapturf (owner_update_turf's flags), but a box cricket
-- ground with a roof over half of it is neither: this lets them say
-- "partly".
--
-- Where: one nullable text column on public.turfs, roof: 'covered',
-- 'partly', 'open' or null (not said). The turf page reads the whole row
-- already (public.turf_page returns to_jsonb(t) minus a few admin
-- columns), so it carries roof with no new read. The lists keep reading
-- is_covered, which the list snapshot carries (no change to
-- private.build_turf_list), and this file keeps the two together:
--   covered -> is_covered true
--   partly  -> is_covered false (the ground is not covered; roof says how much is)
--   open    -> is_covered false
--   null    -> is_covered null
-- so the listing's "Covered" filter (lib/turfList/facts.ts) holds only
-- turfs whose ground is covered, and a snippet or the page never calls a
-- partly covered ground covered.
--
-- Function (the owner edit path, as public.owner_update_turf: the caller
-- from public._caller_key, a Google session or a Firebase phone token the
-- database checks itself, and public._can_manage's rule: an active claim
-- or the site owner; anon and authenticated may call it, PUBLIC may not):
--   * owner_set_roof(p_token, p_turf_id, p_roof): sets roof and is_covered
--     as above. A save that changes nothing writes nothing. Logged in
--     turf_edit_log (before and after of both), as every owner edit is.
--     The cache trigger (private.mark_turf_dirty) sees is_covered change,
--     a list column, and purges the lists and the page, as an
--     owner_update_turf save does.
--
-- The app works before this file: the editor reads roof straight from the
-- table (it is public, as every turf column the page shows) and, when the
-- column is missing, keeps the old Yes / No / Not sure question.
-- Additive: one nullable column with its check, one new function. No grant
-- or policy on a public table changes. Written without the destructive SQL
-- keywords. Safe to run again.
--
-- Helpers it calls, unchanged since:
--   public._caller_key(text)        20261019_mytapturf.sql
--   public._can_manage(text, uuid)  20261026_account_links_reads.sql

set local lock_timeout = '5s';

alter table public.turfs add column if not exists roof text;

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'turfs_roof_ok' and conrelid = 'public.turfs'::regclass) then
    alter table public.turfs add constraint turfs_roof_ok check (roof is null or roof in ('covered', 'partly', 'open'));
  end if;
end
$do$;

comment on column public.turfs.roof is
  'Owner-reported roof over the ground (myTapturf, public.owner_set_roof): covered, partly or open; null when not said. is_covered follows it (covered true, partly and open false). See 20261103_turf_facts.sql.';

create or replace function public.owner_set_roof(p_token text, p_turf_id uuid, p_roof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := public._caller_key(p_token);
  t public.turfs%rowtype;
  v_roof text := nullif(btrim(coalesce(p_roof, '')), '');
  v_covered boolean;
begin
  if not coalesce(public._can_manage(k, p_turf_id), false) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if v_roof is not null and v_roof not in ('covered', 'partly', 'open') then
    return jsonb_build_object('error', 'bad_value', 'field', 'roof');
  end if;
  select * into t from public.turfs x where x.id = p_turf_id for update;
  if not found then
    return jsonb_build_object('error', 'forbidden');
  end if;
  v_covered := case v_roof when 'covered' then true when 'partly' then false when 'open' then false end;
  if t.roof is not distinct from v_roof and t.is_covered is not distinct from v_covered then
    return jsonb_build_object('ok', true, 'roof', v_roof, 'changed', '[]'::jsonb);
  end if;
  update public.turfs x set roof = v_roof, is_covered = v_covered, updated_at = now() where x.id = p_turf_id;
  insert into public.turf_edit_log (turf_id, user_key, before, after)
  values (p_turf_id, k, jsonb_build_object('roof', t.roof, 'is_covered', t.is_covered), jsonb_build_object('roof', v_roof, 'is_covered', v_covered));
  return jsonb_build_object('ok', true, 'roof', v_roof, 'changed', '["roof", "is_covered"]'::jsonb);
end;
$$;
revoke all on function public.owner_set_roof(text, uuid, text) from public;
grant execute on function public.owner_set_roof(text, uuid, text) to anon, authenticated;
