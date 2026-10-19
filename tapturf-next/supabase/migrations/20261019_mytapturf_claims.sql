-- myTapturf claims: the claimant's role, and a public yes/no for "is
-- this listing managed by its owner" (no names, numbers or counts).

alter table public.turf_owners add column if not exists role text
  check (role in ('owner', 'manager', 'staff'));

-- The four-argument owner_claim from the first migration stays (DROP
-- timed out on the hosted database); the app always sends p_role, which
-- only this version takes, so calls never reach the old one.
create or replace function public.owner_claim(p_token text, p_turf_id uuid, p_name text default null, p_note text default null, p_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  v_status text;
  v_role text := case when p_role in ('owner', 'manager', 'staff') then p_role end;
begin
  if k is null then
    return jsonb_build_object('error', 'sign_in');
  end if;
  if not exists (select 1 from public.turfs where id = p_turf_id and is_active) then
    return jsonb_build_object('error', 'not_found');
  end if;
  select status into v_status from public.turf_owners where turf_id = p_turf_id and user_key = k;
  if v_status in ('active', 'pending') then
    return jsonb_build_object('status', v_status);
  end if;
  if v_status = 'revoked' then
    return jsonb_build_object('error', 'revoked');
  end if;
  if (select count(*) from public.turf_owners where user_key = k and status = 'pending') >= 5 then
    return jsonb_build_object('error', 'too_many');
  end if;

  if left(k, 2) = 'p:' and substr(k, 3) = any(coalesce(public._turf_phones(p_turf_id), '{}')) then
    v_status := 'active';
  else
    v_status := 'pending';
  end if;

  insert into public.turf_owners (turf_id, user_key, status, via, name, note, role, created_at, decided_at)
  values (p_turf_id, k, v_status, case when v_status = 'active' then 'phone_match' else 'admin' end,
          left(nullif(trim(p_name), ''), 80), left(nullif(trim(p_note), ''), 400), v_role, now(),
          case when v_status = 'active' then now() end)
  on conflict (turf_id, user_key) do update
    set status = excluded.status, via = excluded.via, name = excluded.name, note = excluded.note,
        role = excluded.role, created_at = now(), decided_at = excluded.decided_at;

  return jsonb_build_object('status', v_status);
end;
$$;
grant execute on function public.owner_claim(text, uuid, text, text, text) to anon, authenticated;

create or replace function public.turf_claim_status(p_turf_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.turf_owners where turf_id = p_turf_id and status = 'active');
$$;
grant execute on function public.turf_claim_status(uuid) to anon, authenticated;

create or replace function public.admin_owner_claims(p_firebase_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return coalesce((
    select jsonb_agg(x order by x.pending desc, x.created_at desc) from (
      select o.turf_id, o.user_key, o.status, o.via, o.name, o.note, o.role, o.created_at, o.decided_at,
             o.status = 'pending' as pending,
             t.name as turf_name, t.city, t.area, public._turf_phones(t.id) as listed_phones
      from public.turf_owners o join public.turfs t on t.id = o.turf_id
      order by o.status = 'pending' desc, o.created_at desc
      limit 200
    ) x
  ), '[]'::jsonb);
end;
$$;
