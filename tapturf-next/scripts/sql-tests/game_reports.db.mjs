// The database game_reports.check.mjs runs 20261027_game_reports.sql against, in
// PGlite: stand-ins for Supabase's roles, auth schema and the tables the reviews
// touch (columns, checks, policies, grants and triggers as on production,
// read 2026-10-26), the cache queue's triggers with a recording mark_dirty, then
// the real migrations the new file replaces bodies from (myTapturf's
// owner_dashboard, the review summary functions, turf_page as live). Also used
// by the local end-to-end stand-in, so both run the same SQL. Made-up people only.
import fs from "node:fs";

export const KEY = "server-key-0123456789";

export const SETUP = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema private; create schema auth; create schema extensions;
grant usage on schema auth to anon, authenticated;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', '${KEY}');
create function private.account_key_ok(p_key text) returns boolean language sql stable security definer set search_path = '' as
  $$ select p_key is not null and p_key = (select s.value from private.app_secrets s where s.name = 'account') $$;
create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb default '{}');
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;

create table public.users (id uuid primary key default gen_random_uuid(), email varchar unique, name varchar not null, phone varchar,
  profile_image_url text, created_at timestamptz default now());
create table public.turfs (id uuid primary key default gen_random_uuid(), name text, slug text, city text, area text, address text,
  is_active boolean default true, sports jsonb default '[]', owner_id uuid, rating numeric, total_reviews int default 0,
  contact_info jsonb, owner_phone text, whatsapp_phone text, cover_image text, images jsonb default '[]',
  morning_price int, afternoon_price int, evening_price int, weekend_morning_price int, weekend_afternoon_price int, weekend_evening_price int,
  pricing_bands jsonb, price_owner_confirmed boolean, price_verified_at timestamptz, price_unit text,
  has_floodlights boolean, is_covered boolean, parking_available boolean, washroom_available boolean, changing_room_available boolean,
  has_cafeteria boolean, has_drinking_water boolean, equipment_provided boolean, is_24x7 boolean, start_time time, end_time time,
  closed_days text, description text, surface_type text, number_of_grounds int, formats jsonb, opening_hours jsonb,
  data_sources jsonb, field_confidence jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.trending_turfs (turf_id uuid, city text, tagline text, starts_at timestamptz, ends_at timestamptz);
create table public.bookings (id uuid primary key default gen_random_uuid(), user_id uuid);
create table public.games (id uuid primary key default gen_random_uuid(), creator_id uuid, turf_id uuid not null, title text default 'Game',
  sport text not null default 'Football', max_players int default 10, date date not null, start_time time not null, end_time time not null,
  price_per_player numeric default 0, status text default 'open' check (status in ('open', 'full', 'completed', 'cancelled')),
  host_name text, host_phone text, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.game_participants (id uuid primary key default gen_random_uuid(), game_id uuid, user_id uuid, joined_at timestamptz default now(),
  unique (game_id, user_id));
create table public.turf_contact_clicks (id bigint generated always as identity primary key, turf_id uuid not null, kind text not null check (kind in ('call', 'whatsapp')),
  source text not null default 'page', signed_in boolean not null default false, user_id uuid, created_at timestamptz not null default now());
create table public.ask_queries (id bigint generated always as identity primary key, user_id uuid, query text, filters jsonb, created_at timestamptz default now());

-- The cache queue (20261020_cache_queue.sql): the real triggers and turf_key; mark_dirty records.
create table private.test_dirty (key text, urgent boolean, at timestamptz default clock_timestamp());
create function private.mark_dirty(p_keys text[], p_urgent boolean default false) returns void language sql security definer set search_path = '' as
  $$ insert into private.test_dirty (key, urgent) select distinct k, coalesce(p_urgent, false) from unnest(p_keys) k where k is not null $$;
create function private.turf_key(p_turf_id uuid) returns text language sql stable security definer set search_path = '' as
  $$ select 'turf:' || lower(coalesce(t.slug, t.id::text)) from public.turfs t where t.id = p_turf_id $$;
create function private.mark_turf_child_dirty() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ignore constant text[] := string_to_array(coalesce(TG_ARGV[0], ''), ',');
  v_keys text[] := '{}';
begin
  if TG_OP = 'UPDATE' and (to_jsonb(NEW) - v_ignore) = (to_jsonb(OLD) - v_ignore) then
    return null;
  end if;
  if TG_OP <> 'DELETE' then
    v_keys := v_keys || private.turf_key(NEW.turf_id);
  end if;
  if TG_OP <> 'INSERT' then
    v_keys := v_keys || private.turf_key(OLD.turf_id);
  end if;
  perform private.mark_dirty(v_keys, current_setting('tapturf.cache_urgent', true) = 'on');
  return null;
end;
$$;
create function private.mark_vote_dirty() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.mark_dirty(array[(
    select private.turf_key(r.turf_id) from public.reviews r
     where r.id = case when TG_OP = 'DELETE' then OLD.review_id else NEW.review_id end)], false);
  return null;
end;
$$;
create function public.update_updated_at_column() returns trigger language plpgsql as $$ begin NEW.updated_at = now(); return NEW; end; $$;

-- public.reviews and public.review_votes as on production.
create table public.reviews (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  turf_id uuid not null references public.turfs (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  source text, external_review_id text, author_name text, author_url text, source_url text, source_date_label text);
create unique index reviews_source_external_uidx on public.reviews (source, external_review_id) where external_review_id is not null;
create index reviews_turf_created_idx on public.reviews (turf_id, created_at desc);
alter table public.reviews enable row level security;
create policy reviews_public_read on public.reviews for select to anon, authenticated using (true);
create policy reviews_insert_app on public.reviews for insert to anon, authenticated with check ((user_id is not null) and ((rating >= 1) and (rating <= 5)));
create policy reviews_author_update on public.reviews for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy reviews_author_delete on public.reviews for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete, truncate, references, trigger on public.reviews to anon, authenticated, service_role;
create trigger update_reviews_updated_at before update on public.reviews for each row execute function public.update_updated_at_column();
create trigger reviews_mark_cache_dirty after insert or update or delete on public.reviews for each row execute function private.mark_turf_child_dirty('updated_at');

create table public.review_votes (
  id uuid not null default gen_random_uuid() primary key,
  review_id uuid not null references public.reviews (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz default now(),
  constraint review_votes_unique_user unique (review_id, user_id));
alter table public.review_votes enable row level security;
create policy review_votes_public_read on public.review_votes for select to anon, authenticated using (true);
create policy review_votes_insert_app on public.review_votes for insert to anon, authenticated with check (user_id is not null);
create policy review_votes_delete_app on public.review_votes for delete to anon, authenticated using (user_id is not null);
grant select, insert, update, delete, truncate, references, trigger on public.review_votes to anon, authenticated, service_role;
create trigger review_votes_mark_cache_dirty after insert or delete on public.review_votes for each row execute function private.mark_vote_dirty();

-- public.turf_suggestions as on production (checks, one per player, the insert trigger, the cache trigger).
create table public.turf_suggestions (id uuid primary key default gen_random_uuid(), turf_id uuid not null, user_id uuid, submitter_name text check (char_length(submitter_name) <= 80),
  relationship text not null default 'player' check (relationship in ('player', 'owner', 'staff', 'other')),
  contact_phone text check (contact_phone ~ '^[0-9+() -]{8,20}$'), whatsapp_phone text check (whatsapp_phone ~ '^[0-9+() -]{8,20}$'),
  price_min integer check (price_min >= 100 and price_min <= 20000), price_max integer check (price_max >= 100 and price_max <= 20000),
  price_notes text, opening_hours text, sports text[] not null default '{}', amenities text[] not null default '{}', notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz, edit_count integer not null default 0,
  ai_review jsonb, reviewed_at timestamptz, moderated_at timestamptz,
  check (price_min is null or price_max is null or price_max >= price_min),
  check (contact_phone is not null or whatsapp_phone is not null or price_min is not null or price_max is not null
         or nullif(btrim(price_notes), '') is not null or nullif(btrim(opening_hours), '') is not null
         or cardinality(sports) > 0 or cardinality(amenities) > 0 or nullif(btrim(notes), '') is not null));
create unique index turf_suggestions_one_per_user on public.turf_suggestions (turf_id, user_id);
create table public.turf_suggestion_edits (id uuid primary key default gen_random_uuid(), suggestion_id uuid not null, changes jsonb not null, created_at timestamptz not null default now());
create function public.turf_suggestions_rate_limit() returns trigger language plpgsql security definer set search_path = public as $$
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
create trigger turf_suggestions_rate_limit before insert on public.turf_suggestions for each row execute function public.turf_suggestions_rate_limit();
create trigger turf_suggestions_mark_cache_dirty after insert or update or delete on public.turf_suggestions
  for each row execute function private.mark_turf_child_dirty('updated_at,ai_review,reviewed_at');
create function public.get_turf_suggestions(p_turf_id uuid)
returns table(id uuid, submitter_name text, relationship text, contact_phone text, whatsapp_phone text, phone_pending boolean, price_min integer, price_max integer,
  price_notes text, opening_hours text, sports text[], amenities text[], notes text, status text, created_at timestamptz, updated_at timestamptz, edit_count integer, last_changes jsonb)
language sql stable security definer set search_path to 'public' as $$
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

-- Accounts (20261026_account_links*.sql): stand-ins for which account a sign-in key opens.
create function private.account_phone10(p_user_id uuid) returns text language sql stable security definer set search_path = '' as
  $$ select right(regexp_replace(u.phone::text, '\\D', '', 'g'), 10) from public.users u where u.id = p_user_id and u.phone is not null $$;
create function private.account_for_key(p_key text) returns uuid language sql stable security definer set search_path = '' as $$
  select case left(coalesce(p_key, ''), 2)
    when 'p:' then (select u.id from public.users u where right(regexp_replace(u.phone::text, '\\D', '', 'g'), 10) = substr(p_key, 3) limit 1)
    when 'e:' then (select u.id from public.users u where lower(u.email) = substr(p_key, 3) limit 1) end $$;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`;

/** Bodies read before the new file applies, and the md5 of each on production (pg_proc.prosrc, 2026-10-26). */
export const LIVE = {
  "20261026_turf_page_found.sql:15": "0e19b38989f6953c67ba808ba4ce7695", // public.turf_page
  "20261019_mytapturf.sql:238": "5a7a96b456cb04f93c36d9e4b1129462", // public.owner_dashboard
  "20261010_listing_and_review_summary.sql:67": "708e5269327af2978c6ec2d7c6b9b59b", // public.get_review_summary_batch
  "20261010_listing_and_review_summary.sql:93": "ac1bf781ed8567b8e660e96b03d6e857", // public.review_summary_progress
};

/** The database before the new file: stand-ins, then the live bodies the file replaces. */
export async function makeDb(PGlite, migrations) {
  const db = new PGlite();
  await db.exec(SETUP);
  for (const f of ["20261019_mytapturf.sql", "20261010_listing_and_review_summary.sql", "20261026_turf_page_found.sql"]) {
    await db.exec(fs.readFileSync(`${migrations}/${f}`, "utf8"));
  }
  // Claims name the account since 20261025_claims_account.sql; myTapturf's key comes from the
  // sign-in, stood in for here ('phone:<10 digits>' tokens, or a Google session's email).
  await db.exec(`
alter table public.turf_owners add column if not exists role text;
alter table public.turf_owners add column if not exists user_id uuid;
alter table public.turf_owners add column if not exists verified_phone text;
create or replace function public._caller_key(p_token text) returns text language sql security definer set search_path = public as $$
  select case when lower(coalesce(auth.jwt() ->> 'email', '')) <> '' then 'e:' || lower(auth.jwt() ->> 'email')
              when p_token ~ '^phone:[6-9][0-9]{9}$' then 'p:' || substr(p_token, 7) end $$;
create or replace function public._can_manage(p_key text, p_turf_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select p_key is not null and (
    public._is_admin_key(p_key)
    or exists (select 1 from public.turf_owners o
                where o.turf_id = p_turf_id and o.status = 'active'
                  and ((o.user_key = p_key and o.user_id is null)
                       or (o.user_id is not null and o.user_id = (select private.account_for_key(p_key)))))) $$;
`);
  return db;
}
