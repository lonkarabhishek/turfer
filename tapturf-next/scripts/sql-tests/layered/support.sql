-- For account_links.layered.mjs: what 20261026_account_links.sql and
-- 20261026_account_links_reads.sql need, at creation or when an existing
-- check calls them, that the check's own stand-ins may lack. Everything is
-- "if missing", so a check's own stand-ins and real migrations win.
-- Function bodies are not checked while the two files are created (the
-- layer turns check_function_bodies on again after them). PGlite only.
set check_function_bodies = off;
create schema if not exists private;
create schema if not exists auth;
create schema if not exists extensions;
do $do$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $do$;
alter table auth.users add column if not exists email text;
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists raw_app_meta_data jsonb default '{}'::jsonb;
alter table auth.users add column if not exists raw_user_meta_data jsonb default '{}'::jsonb;
alter table auth.users add column if not exists created_at timestamptz default now();
alter table auth.users add column if not exists last_sign_in_at timestamptz;
create table if not exists auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null, provider text not null,
  identity_data jsonb not null, created_at timestamptz default now());
alter table auth.identities add column if not exists created_at timestamptz default now();
do $do$ begin
  if to_regprocedure('auth.jwt()') is null then
    execute $f$create function auth.jwt() returns jsonb language sql stable as $b$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $b$$f$;
  end if;
  if to_regprocedure('auth.uid()') is null then
    execute $f$create function auth.uid() returns uuid language sql stable as $b$ select nullif(auth.jwt() ->> 'sub', '')::uuid $b$$f$;
  end if;
end $do$;
alter table public.users add column if not exists profile_image_url text;
alter table public.users add column if not exists role varchar default 'user';
alter table public.users add column if not exists password varchar;
create table if not exists public.user_logins (id bigint generated always as identity primary key, user_id uuid not null,
  method text not null, created_at timestamptz not null default now());
create table if not exists private.legacy_email_rows (user_id uuid primary key, added_at timestamptz not null default now());
create table if not exists private.users_phone_changes (id bigint generated always as identity primary key, user_id uuid not null,
  at timestamptz not null default now(), old_hash text, new_hash text);
alter table private.users_phone_changes add column if not exists old_hash text;
alter table private.users_phone_changes add column if not exists new_hash text;
create table if not exists private.account_reports (id bigint generated always as identity primary key, kind text not null,
  detail jsonb not null default '{}'::jsonb, at timestamptz not null default now());
create unique index if not exists account_reports_once on private.account_reports (kind, detail);
create table if not exists private.user_contact_emails (user_id uuid primary key, email text, answer text not null, source text not null,
  consent text, verified_at timestamptz, saves smallint not null default 0, window_start timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists private.phone_verified (user_id uuid primary key, phone_hash text not null, at timestamptz not null default now());
create table if not exists public.usernames (user_id uuid primary key, username text unique not null, taggable boolean not null default true);
alter table public.usernames add column if not exists taggable boolean not null default true;
create table if not exists public.username_history (username text primary key, user_id uuid not null, released_at timestamptz not null default now());
create table if not exists public.games (id uuid primary key default gen_random_uuid());
alter table public.games add column if not exists creator_id uuid;
create table if not exists public.game_requests (id uuid primary key default gen_random_uuid());
alter table public.game_requests add column if not exists user_id uuid;
create table if not exists public.game_participants (id uuid primary key default gen_random_uuid(), game_id uuid, user_id uuid, joined_at timestamptz default now());
create table if not exists public.reviews (id uuid primary key default gen_random_uuid());
alter table public.reviews add column if not exists user_id uuid;
create table if not exists public.review_votes (review_id uuid, user_id uuid);
create table if not exists public.bookings (id uuid primary key default gen_random_uuid(), user_id uuid);
create table if not exists public.turfs (id uuid primary key default gen_random_uuid(), name text);
alter table public.turfs add column if not exists owner_id uuid;
create table if not exists public.turf_suggestions (id uuid primary key default gen_random_uuid(), turf_id uuid);
alter table public.turf_suggestions add column if not exists user_id uuid;
create table if not exists public.turf_owners (turf_id uuid not null, user_key text not null, status text not null, via text not null,
  created_at timestamptz not null default now(), primary key (turf_id, user_key));
alter table public.turf_owners add column if not exists user_id uuid;
create table if not exists public.live_matches (code text primary key, match jsonb);
do $do$ begin
  if to_regprocedure('private.phone_logins_trusted_before()') is null then
    execute $f$create function private.phone_logins_trusted_before() returns timestamptz language sql immutable set search_path = '' as $b$ select timestamptz '2026-10-21 18:50:00+00' $b$$f$;
  end if;
  if to_regprocedure('private.report(text, jsonb)') is null then
    execute $f$create function private.report(p_kind text, p_detail jsonb) returns void language sql security definer set search_path = '' as
      $b$ insert into private.account_reports (kind, detail) values (p_kind, p_detail) on conflict (kind, detail) do nothing $b$$f$;
  end if;
  if to_regprocedure('public._phone10(text)') is null then
    execute $f$create function public._phone10(p text) returns text language sql immutable as
      $b$ select case when length(d) >= 10 and right(d, 10) ~ '^[6-9]' then right(d, 10) end from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x $b$$f$;
  end if;
  -- The core file refuses to run while the API can insert users rows (lockdown step 4).
  if has_any_column_privilege('anon', 'public.users', 'INSERT') or has_any_column_privilege('authenticated', 'public.users', 'INSERT') then
    raise notice 'layer: revoking API inserts on public.users (lockdown step 4)';
    revoke insert on public.users from anon, authenticated;
  end if;
end $do$;
