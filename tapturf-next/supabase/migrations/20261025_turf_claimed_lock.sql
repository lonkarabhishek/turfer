-- turfs.claimed (20261025_turf_claimed.sql): one claim change per turf at a time.
--
-- Two claim changes on one turf at the same moment (two revokes, or a
-- revoke while a phone-matched claim goes active) each counted the
-- other's claim as it was before, so turfs.claimed could stay wrong
-- until the next change. The trigger now locks the turf row first, in a
-- statement of its own; the recount after it takes a fresh snapshot, so
-- it sees the other change once that commits.
--
-- Then a one-off recount, for any turf that drifted before this. Safe to
-- run again. Nothing is dropped or deleted.

create or replace function private.sync_turf_claimed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := array(
    select distinct x from unnest(array[
      case when TG_OP <> 'INSERT' then OLD.turf_id end,
      case when TG_OP <> 'DELETE' then NEW.turf_id end
    ]) as x where x is not null order by x);
begin
  -- An admin decision, and rare: the lists and the page refresh at once.
  perform set_config('tapturf.cache_urgent', 'on', true);
  -- Wait for anyone else changing this turf's claims (in id order, so two
  -- turfs never deadlock); the next statement then sees their commit.
  perform 1 from public.turfs where id = any(v_ids) order by id for update;
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

select set_config('tapturf.cache_urgent', 'on', true);
update public.turfs t
   set claimed = c.active
  from (
    select x.id, exists (select 1 from public.turf_owners o where o.turf_id = x.id and o.status = 'active') as active
      from public.turfs x
  ) c
 where t.id = c.id
   and t.claimed is distinct from c.active;
