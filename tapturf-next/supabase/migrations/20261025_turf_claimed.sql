-- Turf cards show which turfs an owner manages on myTapturf ("Managed by
-- the owner", as the turf page already does through turf_claim_status).
--
-- 1. public.turfs.claimed: true while the turf has an active claim in
--    turf_owners (turf_claim_status's rule). Kept in step by a trigger on
--    turf_owners, so every reader of turfs (the list cards, the sitemap,
--    Ask) has it without another query. Nobody but the database writes
--    it: anon and authenticated have no UPDATE on turfs.
-- 2. private.mark_turf_dirty: 'claimed' joins the list columns, so a
--    claim approved or revoked refreshes the city's lists as well as the
--    turf page. lib/cache/keys.ts LIST_COLUMNS and CARD_COLUMNS in
--    lib/queries/turfs.ts carry it too (keys.test.ts checks all three).
--    A claim change is an admin decision and rare: always urgent.
-- 3. The turf claimed today is marked.
--
-- APPLY BEFORE the code that selects turfs.claimed is deployed: the list
-- pages read it. Additive: nothing is dropped or deleted. Safe to run
-- again.

-- turfs is read all the time: give up rather than queue reads behind the
-- brief lock adding a column takes (a constant default, so no rewrite).
set local lock_timeout = '5s';
alter table public.turfs add column if not exists claimed boolean not null default false;
comment on column public.turfs.claimed is 'An owner manages this turf on myTapturf: an active turf_owners claim. Set only by private.sync_turf_claimed.';

create or replace function private.sync_turf_claimed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := array_remove(array[
    case when TG_OP <> 'INSERT' then OLD.turf_id end,
    case when TG_OP <> 'DELETE' then NEW.turf_id end
  ], null);
begin
  -- An admin decision, and rare: the lists and the page refresh at once.
  perform set_config('tapturf.cache_urgent', 'on', true);
  update public.turfs t
     set claimed = c.active
    from (
      select x.id, exists (select 1 from public.turf_owners o where o.turf_id = x.id and o.status = 'active') as active
        from unnest(v_ids) as x(id)
    ) c
   where t.id = c.id
     and t.claimed is distinct from c.active;
  return null;
end;
$$;
revoke all on function private.sync_turf_claimed() from public, anon, authenticated;

create or replace trigger turf_owners_sync_claimed
  after insert or update or delete on public.turf_owners
  for each row execute function private.sync_turf_claimed();

create or replace function private.mark_turf_dirty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- IGNORE: lib/cache/keys.ts IGNORE_COLUMNS.
  v_ignore constant text[] := array[
    'updated_at', 'listing_review', 'listing_checked_at', 'review_summary_at', 'cover_reviewed_at',
    'data_sources', 'field_confidence', 'price_verified_at', 'description_updated_at', 'data_verified_at'
  ];
  -- LIST: lib/cache/keys.ts LIST_COLUMNS (CARD_COLUMNS + is_active, city, slug).
  v_list constant text[] := array[
    'id', 'slug', 'name', 'address', 'area', 'city', 'sports', 'images', 'cover_image',
    'rating', 'total_reviews', 'lat', 'lng',
    'morning_price', 'afternoon_price', 'evening_price',
    'weekend_morning_price', 'weekend_afternoon_price', 'weekend_evening_price',
    'price_mentions', 'price_unit', 'slot_minutes', 'is_covered', 'has_floodlights',
    'start_time', 'end_time', 'is_24x7', 'membership_required', 'is_active',
    'amenities', 'parking_available', 'washroom_available', 'changing_room_available', 'has_cafeteria', 'equipment_provided',
    'image_review',
    -- The "Managed by the owner" mark on cards (20261025_turf_claimed.sql).
    'claimed'
  ];
  v_changed text[];
  v_keys text[] := '{}';
begin
  if TG_OP = 'INSERT' then
    -- The lists gain a card, and the page: a turf deleted and imported
    -- again under the same slug would otherwise serve the 404 its page
    -- cached for a day. Purging a page that was never cached costs nothing.
    if coalesce(NEW.is_active, false) then
      v_keys := array[private.list_key(NEW.city), 'turf:' || lower(coalesce(NEW.slug, NEW.id::text))];
    end if;
  elsif TG_OP = 'DELETE' then
    if coalesce(OLD.is_active, false) then
      v_keys := array[private.list_key(OLD.city)];
    end if;
    v_keys := v_keys || ('turf:' || lower(coalesce(OLD.slug, OLD.id::text))) || ('turf:' || OLD.id::text);
  else
    select coalesce(array_agg(n.key), '{}') into v_changed
      from jsonb_each(to_jsonb(NEW)) n
      join jsonb_each(to_jsonb(OLD)) o using (key)
     where n.value is distinct from o.value
       and n.key <> all (v_ignore);
    if cardinality(v_changed) = 0 then
      return null;
    end if;
    -- An inactive turf is on no list, unless this change deactivated it.
    if v_changed && v_list and (coalesce(NEW.is_active, false) or coalesce(OLD.is_active, false)) then
      v_keys := v_keys || private.list_key(NEW.city);
      if NEW.city is distinct from OLD.city then
        v_keys := v_keys || private.list_key(OLD.city);
      end if;
    end if;
    v_keys := v_keys || ('turf:' || lower(coalesce(NEW.slug, NEW.id::text)));
    -- A new slug: the old page and the /turf/<id> redirect point elsewhere now.
    if NEW.slug is distinct from OLD.slug then
      v_keys := v_keys || ('turf:' || lower(coalesce(OLD.slug, OLD.id::text))) || ('turf:' || NEW.id::text);
    end if;
  end if;
  perform private.mark_dirty(v_keys, current_setting('tapturf.cache_urgent', true) = 'on');
  return null;
end;
$$;

-- The turf claimed today, and any other active claim.
select set_config('tapturf.cache_urgent', 'on', true);
update public.turfs t
   set claimed = true
 where not t.claimed
   and exists (select 1 from public.turf_owners o where o.turf_id = t.id and o.status = 'active');
