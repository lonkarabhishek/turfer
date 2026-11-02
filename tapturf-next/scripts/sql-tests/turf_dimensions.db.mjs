// The database turf_dimensions.check.mjs (and a stand-in server) applies
// 20261102_turf_dimensions.sql to: an in-memory Postgres (PGlite) with what
// production has around public.turfs. The helpers the file calls are the
// real bodies, read from the migration files that last wrote them
// (account_key_ok, account_manages_turf, _is_admin_key, turf_key, list_key,
// mark_turf_dirty and its trigger); stand-ins only for the account lookups
// (account_phone10, account_for_key: a table each) and mark_dirty (a log of
// its calls). turfs has production's write lock (no browser role writes it)
// and a data-team role that may write it without the private schema.
// PGlite only; never touches a real database.
import fs from "node:fs";

/** The last full `create or replace function <name>(` ... `$$;` in a file. */
export function fnFrom(file, name) {
  const sql = fs.readFileSync(file, "utf8");
  const re = new RegExp(`create or replace function ${name.replace(/\./g, "\\.")}\\([^]*?\\n\\$\\$;`, "g");
  let m;
  let last = null;
  while ((m = re.exec(sql))) last = m[0];
  if (!last) throw new Error(`${name} not found in ${file}`);
  return last;
}

/**
 * SETUP for `migrations`: the stand-in schema, with `turfColumns` added to
 * public.turfs (a stand-in server needs the page's columns).
 */
export function setupSql(migrations, turfColumns = "") {
  const M = (f) => `${migrations}/${f}`;
  return `
do $do$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  -- Like Supabase's service_role: past row security, no usage on the private schema.
  if not exists (select 1 from pg_roles where rolname = 'data_team') then create role data_team bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'nobody') then create role nobody; end if;
end $do$;
create schema if not exists private;
create schema if not exists auth;
revoke all on schema private from public, anon, authenticated;
grant usage on schema public to anon, authenticated, data_team;
grant usage on schema auth to anon, authenticated;

create table auth.users (id uuid primary key, email text);
create table public.users (id uuid primary key, name text, email text, phone text);
create table public.turfs (
  id uuid primary key, slug text, name text, city text, is_active boolean not null default true,
  owner_id uuid, length_feet integer, width_feet integer, height_feet integer,
  sports jsonb default '[]'::jsonb, claimed boolean default false, updated_at timestamptz default now()${turfColumns ? `,\n  ${turfColumns}` : ""});
alter table public.turfs enable row level security;
create policy turfs_public_read_active on public.turfs for select to anon, authenticated using (is_active = true);
grant select on public.turfs to anon, authenticated;
grant select, update on public.turfs to data_team;
create table public.turf_owners (turf_id uuid not null, user_key text not null, user_id uuid, status text not null,
  via text default 'admin', name text, role text, created_at timestamptz default now(), decided_at timestamptz, primary key (turf_id, user_key));
create table public.turf_edit_log (id bigserial primary key, turf_id uuid not null, user_key text not null, before jsonb not null, after jsonb not null,
  created_at timestamptz not null default now());
alter table public.turf_owners enable row level security;
alter table public.turf_edit_log enable row level security;
revoke all on public.turf_owners, public.turf_edit_log, public.users from anon, authenticated;

create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', 'test-account-key');
create table private.dirty_log (id bigserial primary key, keys text[], urgent boolean);
create function private.mark_dirty(p_keys text[], p_urgent boolean default false) returns void language sql security definer set search_path = '' as
  $$ insert into private.dirty_log (keys, urgent) values ((select array_agg(distinct x order by x) from unnest(p_keys) x where x is not null), coalesce(p_urgent, false)) $$;
create table private.proven_phones (user_id uuid primary key, phone10 text not null);
create function private.account_phone10(p_user_id uuid) returns text language sql stable security definer set search_path = '' as
  $$ select phone10 from private.proven_phones where user_id = p_user_id $$;
create table private.key_accounts (user_key text primary key, user_id uuid);
create function private.account_for_key(p_key text) returns uuid language sql stable security definer set search_path = '' as
  $$ select user_id from private.key_accounts where user_key = p_key $$;

${fnFrom(M("20261021_accounts_usernames.sql"), "private.account_key_ok")}
${fnFrom(M("20261019_mytapturf.sql"), "public._is_admin_key")}
${fnFrom(M("20261027_game_reports.sql"), "private.account_manages_turf")}
${fnFrom(M("20261020_cache_queue.sql"), "private.list_key")}
${fnFrom(M("20261020_cache_queue.sql"), "private.turf_key")}
${fnFrom(M("20261025_turf_claimed.sql"), "private.mark_turf_dirty")}
create trigger turfs_mark_cache_dirty after insert or update or delete on public.turfs
  for each row execute function private.mark_turf_dirty();
revoke all on all functions in schema private from public, anon, authenticated;
`;
}

/** The site owner's phone sign-in key, as public._is_admin_key lists it (read from the file, never written out). */
export function adminPhone(migrations) {
  const m = /'p:(\d{10})'/.exec(fnFrom(`${migrations}/20261019_mytapturf.sql`, "public._is_admin_key"));
  if (!m) throw new Error("no phone key in _is_admin_key");
  return m[1];
}

export const KEY = "test-account-key";
