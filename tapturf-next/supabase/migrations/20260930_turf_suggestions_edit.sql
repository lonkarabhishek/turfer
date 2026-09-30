-- One suggestion per person per turf, editable, with the latest edit
-- shown publicly ("Edited 2h ago · what changed").
--
-- Writes now go through save_turf_suggestion() only (direct INSERT is
-- closed). It creates the row the first time and updates it after.
-- Identity: Google users are checked against auth.uid(); phone users
-- (no Supabase session) may only act for user ids that are NOT Google
-- accounts, so an anonymous caller can't edit a Google user's entry.

alter table public.turf_suggestions
  add column if not exists updated_at timestamptz,
  add column if not exists edit_count integer not null default 0;

create unique index if not exists turf_suggestions_one_per_user
  on public.turf_suggestions (turf_id, user_id);

create table if not exists public.turf_suggestion_edits (
  id             uuid primary key default gen_random_uuid(),
  suggestion_id  uuid not null references public.turf_suggestions(id) on delete cascade,
  changes        jsonb not null,
  created_at     timestamptz not null default now()
);
create index if not exists turf_suggestion_edits_sugg_idx
  on public.turf_suggestion_edits (suggestion_id, created_at desc);
alter table public.turf_suggestion_edits enable row level security;
-- No policies: only reachable through the functions below.

drop policy if exists turf_suggestions_insert_app on public.turf_suggestions;

-- Shared identity check.
create or replace function public._turf_suggestion_caller_ok(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is not null then auth.uid() = p_user_id
    else not exists (select 1 from auth.users a where a.id = p_user_id)
         and exists (select 1 from public.users u where u.id = p_user_id)
  end;
$$;
revoke all on function public._turf_suggestion_caller_ok(uuid) from public, anon, authenticated;

create or replace function public.save_turf_suggestion(
  p_turf_id uuid,
  p_user_id uuid,
  p_submitter_name text,
  p_relationship text,
  p_contact_phone text,
  p_whatsapp_phone text,
  p_price_min integer,
  p_price_max integer,
  p_price_notes text,
  p_opening_hours text,
  p_sports text[],
  p_amenities text[],
  p_notes text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.turf_suggestions%rowtype;
  old_j jsonb;
  new_j jsonb;
  diff jsonb;
  phone_changed boolean;
begin
  if p_user_id is null or not public._turf_suggestion_caller_ok(p_user_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into existing from public.turf_suggestions
    where turf_id = p_turf_id and user_id = p_user_id
    for update;

  if not found then
    insert into public.turf_suggestions (
      turf_id, user_id, submitter_name, relationship, contact_phone, whatsapp_phone,
      price_min, price_max, price_notes, opening_hours, sports, amenities, notes
    ) values (
      p_turf_id, p_user_id, p_submitter_name, coalesce(p_relationship, 'player'),
      p_contact_phone, p_whatsapp_phone, p_price_min, p_price_max, p_price_notes,
      p_opening_hours, coalesce(p_sports, '{}'), coalesce(p_amenities, '{}'), p_notes
    );
    return 'created';
  end if;

  if (select count(*) from public.turf_suggestion_edits
        where suggestion_id = existing.id
          and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many edits, try again tomorrow' using errcode = 'P0001';
  end if;

  old_j := jsonb_build_object(
    'relationship', existing.relationship,
    'contact_phone', existing.contact_phone,
    'whatsapp_phone', existing.whatsapp_phone,
    'price_min', existing.price_min,
    'price_max', existing.price_max,
    'price_notes', existing.price_notes,
    'opening_hours', existing.opening_hours,
    'sports', to_jsonb(existing.sports),
    'amenities', to_jsonb(existing.amenities),
    'notes', existing.notes);
  new_j := jsonb_build_object(
    'relationship', coalesce(p_relationship, 'player'),
    'contact_phone', p_contact_phone,
    'whatsapp_phone', p_whatsapp_phone,
    'price_min', p_price_min,
    'price_max', p_price_max,
    'price_notes', p_price_notes,
    'opening_hours', p_opening_hours,
    'sports', to_jsonb(coalesce(p_sports, '{}')),
    'amenities', to_jsonb(coalesce(p_amenities, '{}')),
    'notes', p_notes);

  select coalesce(jsonb_object_agg(k, jsonb_build_object('from', old_j -> k, 'to', new_j -> k)), '{}')
    into diff
    from jsonb_object_keys(new_j) as k
    where (old_j -> k) is distinct from (new_j -> k);

  if diff = '{}'::jsonb then
    return 'unchanged';
  end if;

  phone_changed := diff ? 'contact_phone' or diff ? 'whatsapp_phone';

  update public.turf_suggestions set
    submitter_name = p_submitter_name,
    relationship = coalesce(p_relationship, 'player'),
    contact_phone = p_contact_phone,
    whatsapp_phone = p_whatsapp_phone,
    price_min = p_price_min,
    price_max = p_price_max,
    price_notes = p_price_notes,
    opening_hours = p_opening_hours,
    sports = coalesce(p_sports, '{}'),
    amenities = coalesce(p_amenities, '{}'),
    notes = p_notes,
    -- A new number needs a fresh check; rejected stays rejected.
    status = case when existing.status = 'approved' and phone_changed then 'pending' else existing.status end,
    updated_at = now(),
    edit_count = existing.edit_count + 1
  where id = existing.id;

  insert into public.turf_suggestion_edits (suggestion_id, changes) values (existing.id, diff);
  return 'updated';
end;
$$;
revoke all on function public.save_turf_suggestion(uuid, uuid, text, text, text, text, integer, integer, text, text, text[], text[], text) from public;
grant execute on function public.save_turf_suggestion(uuid, uuid, text, text, text, text, integer, integer, text, text, text[], text[], text) to anon, authenticated;

-- The caller's own suggestion, unmasked, to prefill the edit form.
create or replace function public.get_my_turf_suggestion(p_turf_id uuid, p_user_id uuid)
returns table (
  id uuid, relationship text, contact_phone text, whatsapp_phone text,
  price_min integer, price_max integer, price_notes text, opening_hours text,
  sports text[], amenities text[], notes text, status text,
  created_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.relationship, s.contact_phone, s.whatsapp_phone,
         s.price_min, s.price_max, s.price_notes, s.opening_hours,
         s.sports, s.amenities, s.notes, s.status, s.created_at, s.updated_at
  from public.turf_suggestions s
  where s.turf_id = p_turf_id and s.user_id = p_user_id
    and public._turf_suggestion_caller_ok(p_user_id);
$$;
revoke all on function public.get_my_turf_suggestion(uuid, uuid) from public;
grant execute on function public.get_my_turf_suggestion(uuid, uuid) to anon, authenticated;

-- Public read: now with edit info. Phone values inside the change log
-- are hidden unless the row is approved.
drop function if exists public.get_turf_suggestions(uuid);
create function public.get_turf_suggestions(p_turf_id uuid)
returns table (
  id uuid,
  submitter_name text,
  relationship text,
  contact_phone text,
  whatsapp_phone text,
  phone_pending boolean,
  price_min integer,
  price_max integer,
  price_notes text,
  opening_hours text,
  sports text[],
  amenities text[],
  notes text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  edit_count integer,
  last_changes jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    split_part(coalesce(nullif(btrim(s.submitter_name), ''), 'A player'), ' ', 1),
    s.relationship,
    case when s.status = 'approved' then s.contact_phone end,
    case when s.status = 'approved' then s.whatsapp_phone end,
    (s.status <> 'approved' and (s.contact_phone is not null or s.whatsapp_phone is not null)),
    s.price_min, s.price_max, s.price_notes, s.opening_hours,
    s.sports, s.amenities, s.notes, s.status, s.created_at,
    s.updated_at, s.edit_count,
    (select case when s.status = 'approved' then e.changes
                 else e.changes - 'contact_phone' - 'whatsapp_phone' end
       from public.turf_suggestion_edits e
      where e.suggestion_id = s.id
      order by e.created_at desc
      limit 1)
  from public.turf_suggestions s
  where s.turf_id = p_turf_id and s.status <> 'rejected'
  order by (s.status = 'approved') desc, coalesce(s.updated_at, s.created_at) desc
  limit 50;
$$;
revoke all on function public.get_turf_suggestions(uuid) from public;
grant execute on function public.get_turf_suggestions(uuid) to anon, authenticated;

-- Insert trigger: the per-turf cap is now the unique index; keep the
-- overall daily cap.
create or replace function public.turf_suggestions_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.turf_suggestions
        where user_id = new.user_id
          and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many suggestions, try again tomorrow'
      using errcode = 'P0001';
  end if;
  new.status := 'pending';
  new.created_at := now();
  new.updated_at := null;
  new.edit_count := 0;
  return new;
end;
$$;
