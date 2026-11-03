// Applies the account, contact-email, admin-verified, auth-mirror, myTapturf,
// claims-account, people, lockdown-step-4, account-links and owner call
// number migrations to stand-ins for Supabase in an in-memory Postgres
// (PGlite), as owner_call_number.check.mjs does, and the cache trigger
// (20261025_turf_claimed.sql, with private.mark_dirty recording what it is
// asked to refresh), then 20261103_turf_facts.sql twice, and checks that an
// owner can say their ground is covered, partly covered or open air:
// roof and is_covered set together (covered true, partly and open false,
// not said null), each save logged with both before and after, a save that
// changes nothing writing nothing, a bad value or someone who does not run
// the turf refused with nothing written, the column's check holding every
// writer to the three words, the lists purged (is_covered is a list
// column), and the grants: anon and authenticated, not PUBLIC.
// Never touches a real database. Made-up numbers only.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/turf_facts.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [M] = process.argv.slice(2);
const NEW = fs.readFileSync(`${M}/20261103_turf_facts.sql`, "utf8");
let passed = 0;
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };

// ── The file. ──
assert.doesNotMatch(NEW, /\bdrop\b|\bdelete\b|\btruncate\b/i, "no destructive keywords");
assert.doesNotMatch(NEW, /[—–]/, "no em or en dashes");
assert.doesNotMatch(NEW, /\bgrant\b[^;]*\bon\s+(table\s+)?public\.turfs\b|\bpolicy\b[^;]*\bon\s+public\.turfs\b/i, "no grant or policy on public.turfs changes");
passed += 3;

// ── The database before it (owner_call_number.check.mjs's stand-ins and migrations). ──
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; create schema auth; create schema extensions;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('live_write', 'L'||repeat('1', 63));
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now(), last_sign_in_at timestamptz, phone text);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null, provider text not null,
  identity_data jsonb not null, created_at timestamptz default now());
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create table public.users (
  id uuid not null default gen_random_uuid() primary key,
  email varchar unique, password varchar, name varchar not null, phone varchar,
  role varchar default 'user' check (role in ('user','owner','admin')),
  is_verified boolean default false, created_at timestamptz default now(), updated_at timestamptz default now(),
  profile_image_url text, firebase_uid text unique);
create unique index users_phone_key on public.users (phone) where phone is not null;
alter table public.users enable row level security;
create policy "Anyone can insert users" on public.users for insert with check (true);
grant select, insert, update, delete on public.users to anon, authenticated;
create table public.user_logins (id bigint generated always as identity primary key, user_id uuid not null,
  method text not null check (method in ('phone','google')), created_at timestamptz not null default now());
create table public.live_matches (code text primary key, match jsonb, rev bigint, status text, updated_at timestamptz default now());
create table public.turfs (id uuid primary key default gen_random_uuid(), name text, slug text, city text, area text, address text, is_active boolean default true,
  contact_info jsonb, owner_phone text, whatsapp_phone text, landline_phone text, cover_image text, images jsonb, owner_id uuid,
  morning_price int, afternoon_price int, evening_price int, weekend_morning_price int, weekend_afternoon_price int, weekend_evening_price int,
  has_floodlights boolean, is_covered boolean, parking_available boolean, washroom_available boolean, changing_room_available boolean,
  has_cafeteria boolean, has_drinking_water boolean, equipment_provided boolean, is_24x7 boolean, start_time time, end_time time,
  closed_days text, description text, surface_type text, number_of_grounds int, formats jsonb, opening_hours jsonb,
  price_owner_confirmed boolean, price_verified_at timestamptz, price_unit text, updated_at timestamptz default now());
grant select on public.turfs to anon, authenticated;
create table public.games (id uuid primary key default gen_random_uuid(), creator_id uuid, turf_id uuid, host_name text, date date, status text, created_at timestamptz default now());
create table public.game_requests (id uuid primary key default gen_random_uuid(), user_id uuid, game_id uuid, requester_name text, status text, created_at timestamptz default now());
create table public.game_participants (id uuid primary key default gen_random_uuid(), game_id uuid, user_id uuid, joined_at timestamptz default now());
create table public.reviews (id uuid primary key default gen_random_uuid(), turf_id uuid, user_id uuid, rating int, comment text, author_name text, source text, created_at timestamptz default now());
create table public.review_votes (review_id uuid, user_id uuid);
create table public.bookings (id uuid primary key default gen_random_uuid(), user_id uuid);
create table public.turf_contact_clicks (id bigint generated always as identity primary key, turf_id uuid, user_id uuid, kind text, created_at timestamptz default now());
create table public.ask_queries (id bigint generated always as identity primary key, user_id uuid, query text, filters jsonb, created_at timestamptz default now());
create table public.turf_suggestions (id uuid primary key default gen_random_uuid(), turf_id uuid not null, user_id uuid, contact_phone text, whatsapp_phone text,
  status text not null default 'pending', created_at timestamptz not null default now(), moderated_at timestamptz, ai_review jsonb, notes text);
create table public.turf_suggestion_edits (id uuid primary key default gen_random_uuid(), suggestion_id uuid not null, changes jsonb not null, created_at timestamptz not null default now());
create table public.user_signup_context (user_id uuid primary key, ctx jsonb, created_at timestamptz default now());
create table private.user_cities (user_id uuid primary key, city text, source text, ip_city text, at_signup boolean, updated_at timestamptz);
`);
const MIG = ["20261019_mytapturf.sql", "20261019_mytapturf_claims.sql", "20261021_accounts_usernames.sql", "20261021_accounts_fixes.sql",
  "20261021_phone_identity_exact_india.sql", "20261022_people_fixes.sql", "20261025_contact_email.sql", "20261025_admin_verified.sql",
  "20261025_auth_mirror_google_only.sql", "20261025_claims_account.sql", "20261024_users_lockdown_step4.sql",
  "20261026_account_links.sql", "20261026_account_links_reads.sql", "20261028_owner_call_number.sql"];
for (const f of MIG) await db.exec(fs.readFileSync(`${M}/${f}`, "utf8"));

// Firebase can't be reached here: _caller_key and firebase_phone10 stand-ins, as in owner_call_number.check.mjs.
const STANDINS = `
create or replace function private.firebase_phone10(p_token text) returns text language sql as
  $$ select case when p_token ~ '^proof:[6-9][0-9]{9}$' then substr(p_token, 7) end $$;
create or replace function public._caller_key(p_token text) returns text language sql security definer set search_path = public as $$
  select case when lower(coalesce(auth.jwt() ->> 'email', '')) <> '' and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb
                   and coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method": "oauth"}]'::jsonb
              then 'e:' || lower(auth.jwt() ->> 'email')
              when p_token ~ '^phone:[6-9][0-9]{9}$' then 'p:' || substr(p_token, 7) end $$;
create or replace function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`;
await db.exec(STANDINS);

// The cache queue, recorded: what the turfs trigger (20261025_turf_claimed.sql) asks to refresh.
await db.exec(`
create table private.dirty_log (id bigserial primary key, keys text[], urgent boolean);
create or replace function private.mark_dirty(p_keys text[], p_urgent boolean default false) returns void language sql as
  $$ insert into private.dirty_log (keys, urgent) values ((select array_agg(distinct x order by x) from unnest(p_keys) x where x is not null), p_urgent) $$;
create or replace function private.list_key(p_city text) returns text language sql immutable as
  $$ select 'list:' || case when p_city ~ '^[a-z][a-z-]{1,30}$' then p_city else 'all' end $$;
`);
await db.exec(fs.readFileSync(`${M}/20261025_turf_claimed.sql`, "utf8"));
// The trigger itself, as 20261020_cache_queue.sql creates it on production.
await db.exec(`create trigger turfs_mark_cache_dirty after insert or update or delete on public.turfs for each row execute function private.mark_turf_dirty();`);

const KEY = (await one("select value from private.app_secrets where name = 'account'")).value;
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const phoneAccount = async (p10, name) => {
  const r = await rpc("account_resolve", [KEY, "phone", `+91${p10}`, null, null, name, null, true, false]);
  assert.equal(r.r, "ok", `account for ${name}`);
  return r.id;
};
const T = (i) => `cccccccc-0000-4000-8000-${String(i).padStart(12, "0")}`;
await q(`insert into public.turfs (id, name, slug, city, owner_phone, is_covered, has_floodlights) values
  ('${T(1)}', 'One', 'one', 'nashik', '9000000101', true, true),
  ('${T(2)}', 'Two', 'two', 'pune', '9000000201', null, null)`);
await phoneAccount("9000000101", "Asha Owner");
await phoneAccount("9000000202", "Somebody Else");
eq(await rpc("owner_claim", ["phone:9000000101", T(1), null, null, "owner"]), { status: "active" }, "A's own number is on One: in at once");

// Before the file: no roof, no function.
eq((await q(`select 1 from information_schema.columns where table_schema = 'public' and table_name = 'turfs' and column_name = 'roof'`)).length, 0, "before: no roof column");
eq((await q(`select 1 from pg_proc where proname = 'owner_set_roof'`)).length, 0, "before: no owner_set_roof");

await db.exec(NEW);
await db.exec(NEW); // safe to run again
eq((await q(`select is_nullable, data_type from information_schema.columns where table_schema = 'public' and table_name = 'turfs' and column_name = 'roof'`)), [{ is_nullable: "YES", data_type: "text" }], "roof: nullable text");
eq((await q(`select conname from pg_constraint where conrelid = 'public.turfs'::regclass and conname = 'turfs_roof_ok'`)).length, 1, "one check constraint, however many runs");
eq(await one(`select roof, is_covered from public.turfs where id = '${T(1)}'`), { roof: null, is_covered: true }, "existing rows untouched: roof not said, is_covered as it was");

// The function: definer, its own search path, anon and authenticated may call it, PUBLIC may not.
const fn = await one(`select p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u,
  has_function_privilege('public', p.oid, 'execute') p from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'owner_set_roof'`);
eq([fn.prosecdef, fn.proconfig, fn.a, fn.u, fn.p], [true, ['search_path=""'], true, true, false], "security definer, search_path '', anon and authenticated only");

const row = (id) => one(`select roof, is_covered, has_floodlights from public.turfs where id = $1`, [id]);
const logs = (id) => q(`select user_key, before, after from public.turf_edit_log where turf_id = $1 order by created_at, id`, [id]);
const dirty = async () => (await q(`select keys from private.dirty_log order by id`)).map((x) => x.keys);
const set = (who, id, roof) => rpc("owner_set_roof", [who, id, roof]);
await q(`delete from private.dirty_log`);

// ── 1. Each answer, with is_covered beside it, logged. ──
eq(await set("phone:9000000101", T(1), "partly"), { ok: true, roof: "partly", changed: ["roof", "is_covered"] }, "partly: saved");
eq(await row(T(1)), { roof: "partly", is_covered: false, has_floodlights: true }, "partly: the ground is not covered (roof says how much is); nothing else moves");
eq((await logs(T(1))).at(-1), { user_key: "p:9000000101", before: { roof: null, is_covered: true }, after: { roof: "partly", is_covered: false } }, "partly: logged, both before and after");
eq(await dirty(), [["list:nashik", "turf:one"]], "is_covered is a list column: the city's lists and the page are refreshed");
eq(await set("phone:9000000101", T(1), "covered"), { ok: true, roof: "covered", changed: ["roof", "is_covered"] }, "covered: saved");
eq(await row(T(1)), { roof: "covered", is_covered: true, has_floodlights: true }, "covered: is_covered true");
eq(await set("phone:9000000101", T(1), " open "), { ok: true, roof: "open", changed: ["roof", "is_covered"] }, "open air (trimmed): saved");
eq(await row(T(1)), { roof: "open", is_covered: false, has_floodlights: true }, "open: is_covered false");
eq(await set("phone:9000000101", T(1), null), { ok: true, roof: null, changed: ["roof", "is_covered"] }, "not sure: saved");
eq(await row(T(1)), { roof: null, is_covered: null, has_floodlights: true }, "not sure: both null");
eq(await set("phone:9000000101", T(1), ""), { ok: true, roof: null, changed: [] }, "empty is not sure too, and the same again writes nothing");
eq((await logs(T(1))).length, 4, "four saves, four log rows");

// ── 2. The same answer again: nothing written, nothing logged, nothing refreshed. ──
await set("phone:9000000101", T(1), "covered");
const n = (await logs(T(1))).length;
const d = (await dirty()).length;
eq(await set("phone:9000000101", T(1), "covered"), { ok: true, roof: "covered", changed: [] }, "no change");
eq([(await logs(T(1))).length, (await dirty()).length], [n, d], "no log row, no refresh");

// ── 3. Refused, nothing written. ──
const before = await row(T(1));
for (const bad of ["roofed", "Covered", "indoor", "partial", "yes"]) eq(await set("phone:9000000101", T(1), bad), { error: "bad_value", field: "roof" }, `refused: ${bad}`);
eq(await set("phone:9000000202", T(1), "open"), { error: "forbidden" }, "someone who does not run the turf");
eq(await set(null, T(1), "open"), { error: "forbidden" }, "nobody signed in");
eq(await set("phone:9000000101", T(2), "open"), { error: "forbidden" }, "the owner's account does not run Two");
eq(await set("phone:9000000101", "cccccccc-0000-4000-8000-000000009999", "open"), { error: "forbidden" }, "no such turf");
eq([await row(T(1)), (await logs(T(1))).length], [before, n], "nothing written, nothing logged");
eq(await row(T(2)), { roof: null, is_covered: null, has_floodlights: null }, "Two untouched");

// ── 4. Every writer is held to the three words (the data team's service role too). ──
await assert.rejects(q(`update public.turfs set roof = 'roofed' where id = '${T(2)}'`), /turfs_roof_ok/, "the column's check");
passed++;
await q(`update public.turfs set roof = 'partly' where id = '${T(2)}'`);
eq((await row(T(2))).roof, "partly", "a good word saves");

// ── 5. owner_update_turf, unchanged: its Covered flag still saves (the old editor, before the new one loads). ──
eq((await rpc("owner_update_turf", ["phone:9000000101", T(1), JSON.stringify({ has_floodlights: false })])).ok, true, "owner_update_turf still saves");
eq(await row(T(1)), { roof: "covered", is_covered: true, has_floodlights: false }, "and leaves the roof alone");

console.log(`turf_facts: ${passed} checks passed`);
