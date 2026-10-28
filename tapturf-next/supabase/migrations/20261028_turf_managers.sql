-- "Managed by @username" at the foot of a claimed turf's page.
--
-- 1. public.turf_managers(p_turf_id): who runs this turf, as the public may
--    see it. Each ACTIVE claim in turf_owners (never pending, rejected or
--    revoked) counts once per account: turf_owners.user_id, the account the
--    claim belongs to, whichever of its sign-ins made it (_can_manage's
--    rule); a claim from before claims named the account (user_id null, 0
--    active on 28 Oct) counts for the account its sign-in opens now
--    (private.account_for_key). Only accounts with a username and "Let
--    others find and tag me" on (usernames.taggable, as profile_get and
--    usernames_verified) are shown: their /u/ page exists. Owners first,
--    then managers, staff, no role; the earliest decision first. At most 3,
--    plus how many more such accounts there are. Out: the username and the
--    tick (private.user_verified) only, never an id, name, number or email,
--    and nothing about anyone who is not shown.
--      {"managers": [{"u": "turfking", "v": false}], "more": 0}
-- 2. Freshness. Claim decisions already refresh the page (mark_owner_dirty,
--    urgent, plus revalidatePath in /api/admin/owner-claims and
--    /api/my/revalidate). New here: private.mark_manager_dirty queues
--    turf:<slug> for every turf an account manages when its username or
--    tagging switch changes (urgent: rare, and "turn it off" should take
--    effect at the next flush), and when its number, email or Google link
--    changes, which can take its tick away (not urgent). Also when an
--    active claim's role or account changes while it stays active, which
--    mark_owner_dirty leaves alone (urgent: the order or the name on the
--    line changes). The page stays ISR with its day-long backstop.
--
-- Additive: the read, a helper and two trigger functions, six triggers.
-- Nothing is replaced, dropped or deleted. Safe to run again. The app
-- works with either database: before this, the read fails and the line
-- is hidden.
--
-- After applying (read only):
--   select t.slug, public.turf_managers(t.id) from public.turfs t
--    where t.id in (select turf_id from public.turf_owners where status = 'active');
--   select tgname from pg_trigger where tgname like '%mark_managed_turfs%'
--      or tgname = 'turf_owners_mark_manager_change';   -- 6 rows
-- Test: scripts/sql-tests/turf_managers.check.mjs (PGlite).

set local lock_timeout = '5s';

-- ── 1. The read ────────────────────────────────────────────

create or replace function public.turf_managers(p_turf_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with acct as (
    -- One row per account, its best role and earliest decision.
    select distinct on (a.user_id) a.user_id, a.rank, a.since
      from (
        select coalesce(o.user_id, private.account_for_key(o.user_key)) as user_id,
               case o.role when 'owner' then 0 when 'manager' then 1 when 'staff' then 2 else 3 end as rank,
               coalesce(o.decided_at, o.created_at) as since
          from public.turf_owners o
          join public.turfs t on t.id = o.turf_id and t.is_active
         where o.turf_id = p_turf_id
           and o.status = 'active'
      ) a
     where a.user_id is not null
     order by a.user_id, a.rank, a.since
  ),
  shown as (
    select n.username, a.user_id, a.rank, a.since,
           row_number() over (order by a.rank, a.since, n.username) as pos
      from acct a
      join public.usernames n on n.user_id = a.user_id and n.taggable
  )
  select jsonb_build_object(
           'managers', coalesce((
             select jsonb_agg(jsonb_build_object('u', s.username, 'v', private.user_verified(s.user_id)) order by s.pos)
               from shown s
              where s.pos <= 3), '[]'::jsonb),
           'more', (select greatest(count(*) - 3, 0) from shown));
$$;
revoke all on function public.turf_managers(uuid) from public, anon, authenticated;
grant execute on function public.turf_managers(uuid) to anon, authenticated;

-- ── 2. Freshness ───────────────────────────────────────────

-- turf:<slug> of every turf this account holds an active claim on (turf_managers' rule).
create or replace function private.managed_turf_keys(p_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct private.turf_key(o.turf_id)), '{}'::text[])
    from public.turf_owners o
   where p_user_id is not null
     and o.status = 'active'
     and (o.user_id = p_user_id
          or (o.user_id is null and private.account_for_key(o.user_key) = p_user_id));
$$;
revoke all on function private.managed_turf_keys(uuid) from public, anon, authenticated;

-- TG_ARGV[0]: the column holding the account id; TG_ARGV[1] 'urgent' sends at the next flush.
create or replace function private.mark_manager_dirty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col constant text := coalesce(TG_ARGV[0], 'user_id');
  v_ids uuid[] := array_remove(array[
    case when TG_OP <> 'INSERT' then (to_jsonb(OLD) ->> v_col)::uuid end,
    case when TG_OP <> 'DELETE' then (to_jsonb(NEW) ->> v_col)::uuid end
  ], null);
  v_keys text[];
begin
  select coalesce(array_agg(distinct k), '{}'::text[]) into v_keys
    from unnest(v_ids) as i(id), unnest(private.managed_turf_keys(i.id)) as k;
  if cardinality(v_keys) > 0 then
    perform private.mark_dirty(v_keys, coalesce(TG_ARGV[1], '') = 'urgent');
  end if;
  return null;
end;
$$;
revoke all on function private.mark_manager_dirty() from public, anon, authenticated;

-- A username picked, changed or (never today) removed; the tagging switch.
create or replace trigger usernames_mark_managed_turfs
  after insert or delete on public.usernames
  for each row execute function private.mark_manager_dirty('user_id', 'urgent');
create or replace trigger usernames_mark_managed_turfs_update
  after update of username, taggable on public.usernames
  for each row
  when (old.username is distinct from new.username or old.taggable is distinct from new.taggable)
  execute function private.mark_manager_dirty('user_id', 'urgent');

-- The tick's inputs that take it away: the account's number or email, its Google link, its proved number.
create or replace trigger users_mark_managed_turfs
  after update of phone, email on public.users
  for each row
  when (old.phone is distinct from new.phone or old.email is distinct from new.email)
  execute function private.mark_manager_dirty('id');
create or replace trigger account_google_links_mark_managed_turfs
  after insert or update of ended_at on private.account_google_links
  for each row execute function private.mark_manager_dirty('user_id');
create or replace trigger phone_links_mark_managed_turfs
  after insert or update of ended_at on private.phone_links
  for each row execute function private.mark_manager_dirty('user_id');

-- An active claim that stays active but changes role or account: the line's
-- order or name changes. mark_owner_dirty (20261020_cache_queue.sql) queues
-- every change to or from active and returns early for this one.
create or replace function private.mark_manager_turf_dirty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.mark_dirty(array[private.turf_key(NEW.turf_id)], true);
  return null;
end;
$$;
revoke all on function private.mark_manager_turf_dirty() from public, anon, authenticated;

create or replace trigger turf_owners_mark_manager_change
  after update of role, user_id on public.turf_owners
  for each row
  when (old.status = 'active' and new.status = 'active'
        and (old.role is distinct from new.role or old.user_id is distinct from new.user_id))
  execute function private.mark_manager_turf_dirty();
