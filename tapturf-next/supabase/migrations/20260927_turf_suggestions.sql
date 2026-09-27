-- Player-suggested info for turfs (contact number, prices, hours, sports,
-- amenities, notes). Nothing here ever overwrites public.turfs: it's a
-- separate, clearly labelled "suggested by players" layer.
--
-- Access model
--   * anon/authenticated may INSERT (status forced to 'pending').
--   * Nobody may SELECT the table directly. The public reads through
--     get_turf_suggestions(), which hides rejected rows and masks phone
--     numbers until a row is approved (so a random number can't become a
--     "call this turf" button without a human checking it).
--   * Moderation = flip status to 'approved' / 'rejected' in the
--     Supabase table editor (service role).

create table if not exists public.turf_suggestions (
  id              uuid primary key default gen_random_uuid(),
  turf_id         uuid not null references public.turfs(id) on delete cascade,
  user_id         uuid references public.users(id) on delete set null,
  submitter_name  text check (char_length(submitter_name) <= 80),
  relationship    text not null default 'player'
                  check (relationship in ('player', 'owner', 'staff', 'other')),
  contact_phone   text check (contact_phone ~ '^[0-9+() -]{8,20}$'),
  whatsapp_phone  text check (whatsapp_phone ~ '^[0-9+() -]{8,20}$'),
  price_min       integer check (price_min between 100 and 20000),
  price_max       integer check (price_max between 100 and 20000),
  price_notes     text check (char_length(price_notes) <= 200),
  opening_hours   text check (char_length(opening_hours) <= 200),
  sports          text[] not null default '{}'
                  check (cardinality(sports) <= 12 and char_length(array_to_string(sports, ',')) <= 300),
  amenities       text[] not null default '{}'
                  check (cardinality(amenities) <= 20 and char_length(array_to_string(amenities, ',')) <= 500),
  notes           text check (char_length(notes) <= 1000),
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  created_at      timestamptz not null default now(),
  constraint turf_suggestions_price_order
    check (price_min is null or price_max is null or price_max >= price_min),
  constraint turf_suggestions_has_content check (
    contact_phone is not null or whatsapp_phone is not null
    or price_min is not null or price_max is not null
    or nullif(btrim(price_notes), '') is not null
    or nullif(btrim(opening_hours), '') is not null
    or cardinality(sports) > 0 or cardinality(amenities) > 0
    or nullif(btrim(notes), '') is not null
  )
);

create index if not exists turf_suggestions_turf_created_idx
  on public.turf_suggestions (turf_id, created_at desc);
create index if not exists turf_suggestions_user_created_idx
  on public.turf_suggestions (user_id, created_at desc);

alter table public.turf_suggestions enable row level security;

drop policy if exists turf_suggestions_insert_app on public.turf_suggestions;
create policy turf_suggestions_insert_app on public.turf_suggestions
  for insert to anon, authenticated
  with check (user_id is not null and status = 'pending');

-- Simple flood guard: max 5 suggestions per user per turf per day and
-- 20 per user per day overall.
create or replace function public.turf_suggestions_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.turf_suggestions
        where user_id = new.user_id and turf_id = new.turf_id
          and created_at > now() - interval '1 day') >= 5
     or (select count(*) from public.turf_suggestions
        where user_id = new.user_id
          and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many suggestions, try again tomorrow'
      using errcode = 'P0001';
  end if;
  new.status := 'pending';
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists turf_suggestions_rate_limit on public.turf_suggestions;
create trigger turf_suggestions_rate_limit
  before insert on public.turf_suggestions
  for each row execute function public.turf_suggestions_rate_limit();

-- Public read path.
create or replace function public.get_turf_suggestions(p_turf_id uuid)
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
  created_at timestamptz
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
    s.sports, s.amenities, s.notes, s.status, s.created_at
  from public.turf_suggestions s
  where s.turf_id = p_turf_id and s.status <> 'rejected'
  order by (s.status = 'approved') desc, s.created_at desc
  limit 50;
$$;

revoke all on function public.get_turf_suggestions(uuid) from public;
grant execute on function public.get_turf_suggestions(uuid) to anon, authenticated;
revoke all on function public.turf_suggestions_rate_limit() from public, anon, authenticated;
