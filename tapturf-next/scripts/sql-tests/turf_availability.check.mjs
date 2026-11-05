// Applies the account, contact-email, admin-verified, auth-mirror, myTapturf,
// claims-account, people, lockdown-step-4, account-links and owner call
// number migrations to stand-ins for Supabase in an in-memory Postgres
// (PGlite), as turf_facts.check.mjs does, and the cache trigger
// (20261025_turf_claimed.sql, with private.mark_dirty recording what it is
// asked to refresh), then 20261105_turf_availability.sql twice, and checks
// free slots: only a manager of an active claimed turf marks hours or
// confirms them, anyone else is refused with nothing written; the public
// read gives slot status and the last update only, while the marks are less
// than 24 hours old, and never an hour that has started; after-midnight and
// 24-hour keys; a batch is checked whole before anything is written; no
// availability call writes public.turfs (no cache purge), the edit log or
// anything personal; the file runs again with the rows kept; the grants.
// Never touches a real database. Made-up numbers only.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/turf_availability.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [M] = process.argv.slice(2);
const NEW = fs.readFileSync(`${M}/20261105_turf_availability.sql`, "utf8");
let passed = 0;
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };

// ── The file. ──
assert.doesNotMatch(NEW, /\bdrop\b|\bdelete\b|\btruncate\b/i, "no destructive keywords");
assert.doesNotMatch(NEW, /[—–]/, "no em or en dashes");
assert.doesNotMatch(NEW, /\bgrant\b[^;]*\bon\s+(table\s+)?public\.turfs\b|\bpolicy\b[^;]*\bon\s+public\.turfs\b/i, "no grant or policy on public.turfs changes");
assert.doesNotMatch(NEW, /\bupdate\s+public\.turfs\b|\binsert\s+into\s+public\.turfs\b|\bfor\s+update\b/i, "no write or lock on public.turfs");
passed += 4;

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


// ── More stand-ins: a made-up site owner key, an inactive turf, a pending claim. ──
await db.exec(`create or replace function public._is_admin_key(p_key text) returns boolean language sql immutable as $$ select p_key = 'p:9000000099' $$`);
await q(`insert into public.turfs (id, name, slug, city, owner_phone, is_active) values ('${T(3)}', 'Three', 'three', 'nashik', '9000000301', false)`);
eq(await rpc("owner_claim", ["phone:9000000202", T(2), null, null, "owner"]), { status: "pending" }, "B's claim on Two waits for the team");

// ── Before the file: no functions. Then the file, twice. ──
eq((await q(`select 1 from pg_proc where proname in ('owner_slots', 'owner_set_slots', 'owner_confirm_slots', 'turf_availability')`)).length, 0, "before: no functions");
await db.exec(NEW);
await db.exec(NEW); // safe to run again

// ── Grants: the tables are private, RLS on; the public functions for anon and authenticated, not PUBLIC; the private ones for nobody. ──
for (const t of ["turf_slots", "turf_availability"]) {
  const p = await one(`select has_table_privilege('anon', c.oid, 'select,insert,update') a, has_table_privilege('authenticated', c.oid, 'select,insert,update') u,
    c.relrowsecurity r from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'private' and c.relname = $1`, [t]);
  eq([p.a, p.u, p.r], [false, false, true], `private.${t}: no access for anon or authenticated, RLS on`);
}
for (const f of ["owner_slots", "owner_set_slots", "owner_confirm_slots", "turf_availability"]) {
  const fn = await one(`select p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u,
    has_function_privilege('public', p.oid, 'execute') p from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [f]);
  eq([fn.prosecdef, fn.proconfig, fn.a, fn.u, fn.p], [true, ['search_path=""'], true, true, false], `${f}: security definer, search_path '', anon and authenticated only`);
}
const priv = await q(`select p.proname, p.proconfig, has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute') open
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = any($1)`,
  [["slots_fresh", "slots_ahead", "slot_at", "slot_key", "turf_booked", "turf_slots_state", "slots_guard", "turf_slots_apply", "turf_slots_confirm", "turf_availability_at"]]);
eq([priv.length, priv.filter((r) => r.open).length, priv.filter((r) => String(r.proconfig) !== 'search_path=""').length], [10, 0, 0], "the 10 private helpers: nobody may call them, search_path ''");

// ── Nothing personal: the columns. ──
eq((await q(`select table_name, column_name from information_schema.columns where table_schema = 'private' and table_name in ('turf_slots', 'turf_availability') order by table_name, ordinal_position`)).map((r) => `${r.table_name}.${r.column_name}`),
  ["turf_availability.turf_id", "turf_availability.updated_at", "turf_availability.created_at", "turf_slots.turf_id", "turf_slots.starts_at", "turf_slots.status", "turf_slots.updated_at"], "slot status and times only");

const dirtyN = async () => Number((await one(`select count(*) n from private.dirty_log`)).n);
const turfRows = async () => JSON.stringify(await q(`select * from public.turfs order by id`));
const editN = async () => Number((await one(`select count(*) n from public.turf_edit_log`)).n);
const before = { dirty: await dirtyN(), turfs: await turfRows(), edits: await editN() };
const rows = async (id) => q(`select private.slot_key(starts_at) at, status from private.turf_slots where turf_id = $1 order by starts_at`, [id]);
const ch = (...xs) => JSON.stringify(xs.map(([at, status]) => ({ at, status })));
// Pinned clocks (the private functions take p_now, as private.game_series_fill does).
const apply = async (id, changes, now) => (await one(`select private.turf_slots_apply($1, $2, $3) r`, [id, changes, now])).r;
const readAt = async (id, now) => (await one(`select private.turf_availability_at($1, $2) r`, [id, now])).r;

// ── 1. Who may: a manager of an active claimed turf. Everyone else: refused, nothing written. ──
const A = "phone:9000000101", B = "phone:9000000202", ADMIN = "phone:9000000099";
const first = await rpc("owner_slots", [A, T(1)]);
eq([first.ok, first.updated_at, first.booked, Object.keys(first.hours).sort()], [true, null, [], ["closed_days", "end_time", "is_24x7", "opening_hours", "start_time"]], "A opens One: never used, nothing booked, the page's hours");
const future = new Date(Date.now() + 26 * 3600e3).toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 13).replace(" ", "T") + ":00";
for (const [who, id, want, why] of [[B, T(1), "forbidden", "B does not run One"], [null, T(1), "forbidden", "nobody signed in"], [B, T(2), "forbidden", "B's claim is pending"],
  [A, T(2), "forbidden", "A does not run Two"], [ADMIN, T(2), "not_claimed", "the site owner on an unclaimed turf"], [ADMIN, T(3), "not_claimed", "an inactive turf"],
  [ADMIN, "cccccccc-0000-4000-8000-000000009999", "forbidden", "no such turf"]]) {
  eq(await rpc("owner_slots", [who, id]), { error: want }, `read: ${why}`);
  eq(await rpc("owner_set_slots", [who, id, ch([future, "booked"])]), { error: want }, `write: ${why}`);
  eq(await rpc("owner_confirm_slots", [who, id]), { error: want }, `confirm: ${why}`);
}
eq([(await q(`select count(*)::int n from private.turf_slots`))[0].n, (await q(`select count(*)::int n from private.turf_availability`))[0].n], [0, 0], "nothing written by a refused call");
eq((await rpc("owner_slots", [ADMIN, T(1)])).ok, true, "the site owner on a claimed turf may");
const w = await rpc("owner_set_slots", [A, T(1), ch([future, "booked"])]);
eq([w.ok, w.saved, w.changed, w.skipped, w.booked], [true, 1, 1, 0, [future]], "A marks an hour tomorrow booked");
eq((await rpc("turf_availability", [T(1)])).booked, [future], "the public read lists it");
eq(Object.keys(await rpc("turf_availability", [T(1)])).sort(), ["booked", "fresh", "now", "updated_at"], "the public read: slot status and times only");
const f2 = await rpc("owner_set_slots", [A, T(1), ch([future, "free"])]);
eq([f2.booked, await rows(T(1))], [[], [{ at: future, status: "free" }]], "freeing it is an upsert of its status: the row stays, as free");
eq(await rpc("turf_availability", [T(2)]), { fresh: false }, "an unclaimed turf: nothing");

// ── 2. Pinned times: past hours, after midnight, the same key twice, the window. ──
const P = "2026-11-05 23:30+05:30";
let r = await apply(T(1), ch(["2026-11-05T23:00", "booked"], ["2026-11-06T00:00", "booked"], ["2026-11-06T01:00", "booked"], ["2026-11-06T01:00", "free"], ["2026-11-06T01:00", "booked"]), P);
eq([r.saved, r.changed, r.skipped, r.booked], [2, 2, 1, ["2026-11-06T00:00", "2026-11-06T01:00"]], "23:30: 11 PM has started (skipped); 12 AM and 1 AM tonight saved; the last of three 1 AM marks wins");
eq((await readAt(T(1), "2026-11-06 00:59+05:30")).booked, ["2026-11-06T01:00"], "00:59: 12 AM has started, 1 AM still listed");
eq((await readAt(T(1), "2026-11-06 01:00+05:30")).booked, [], "01:00: started, never listed");
r = await apply(T(1), ch(["2026-11-07T00:00", "booked"], ["2026-11-07T23:00", "booked"]), P);
eq([r.saved, r.booked.slice(-2)], [2, ["2026-11-07T00:00", "2026-11-07T23:00"]], "a 24-hour day's first and last hour are two keys");
r = await apply(T(1), ch(["2026-11-13T23:00", "booked"], ["2026-11-13T23:31", "booked"]), P);
eq([r.saved, r.skipped], [1, 1], "the window: 8 days ahead and not a minute more");
for (const bad of [ch(["2026-11-07T24:00", "booked"]), ch(["2026-11-07T10:00", "maybe"]), ch(["2026-02-30T10:00", "free"]), ch(["2026-11-07T10:00:00", "free"]), "[]", "{}", "[5]", '[{"at": "2026-11-07T10:00"}]', '[{"at": 5, "status": "free"}]'])
  eq(await apply(T(1), bad, P), { error: "bad_value" }, `refused: ${bad}`);
const n0 = (await rows(T(1))).length;
eq(await apply(T(1), ch(["2026-11-07T10:00", "booked"], ["2026-11-07T24:00", "booked"]), P), { error: "bad_value" }, "one bad item refuses the whole batch");
eq(await apply(T(1), JSON.stringify(Array.from({ length: 101 }, () => ({ at: "2026-11-07T10:00", status: "free" }))), P), { error: "too_many" }, "101 items");
eq((await rows(T(1))).length, n0, "nothing written by a refused batch");
eq((await apply(T(1), ch(["2026-11-05T22:00", "booked"]), "2026-11-06 23:00+05:30")).saved, 0, "only started hours: nothing saved");

// ── 3. Fresh for 24 hours after the last change or All correct. ──
await q(`update private.turf_availability set updated_at = '2026-11-05 23:30+05:30' where turf_id = $1`, [T(1)]);
eq((await readAt(T(1), "2026-11-06 23:29+05:30")).fresh, true, "23 h 59 min later: shown");
eq(await readAt(T(1), "2026-11-06 23:30+05:30"), { fresh: false }, "24 h later: hidden");
eq((await apply(T(1), ch(["2026-11-05T22:00", "booked"]), "2026-11-06 23:31+05:30")).updated_at, "2026-11-05T18:00:00+00:00", "a save of only started hours is no check: still hidden");
const marks = await rows(T(1));
eq((await one(`select private.turf_slots_confirm($1, $2) r`, [T(1), "2026-11-06 23:40+05:30"])).r.updated_at, "2026-11-06T18:10:00+00:00", "All correct moves the time");
eq([(await readAt(T(1), "2026-11-06 23:41+05:30")).fresh, await rows(T(1))], [true, marks], "shown again, marks untouched");
await q(`update private.turf_availability set updated_at = now() - interval '25 hours' where turf_id = $1`, [T(1)]);
eq((await rpc("turf_availability", [T(1)])).fresh, false, "a day old: hidden now");
eq((await rpc("owner_slots", [A, T(1)])).ok, true, "opening the section...");
eq((await rpc("turf_availability", [T(1)])).fresh, false, "...is no check");
await rpc("owner_confirm_slots", [A, T(1)]);
eq((await rpc("turf_availability", [T(1)])).fresh, true, "All correct shows it again");

// ── 4. Never public.turfs, the cache queue or the edit log. ──
eq([await dirtyN(), await turfRows(), await editN()], [before.dirty, before.turfs, before.edits], "no availability call wrote public.turfs (no purge) or the edit log");

// ── 5. Claim revoked or turf made inactive: hidden at once, owner refused. ──
await q(`update public.turf_owners set status = 'revoked' where turf_id = $1`, [T(1)]);
eq([await rpc("turf_availability", [T(1)]), await rpc("owner_slots", [A, T(1)])], [{ fresh: false }, { error: "forbidden" }], "revoked: hidden, A refused");
await q(`update public.turf_owners set status = 'active' where turf_id = $1`, [T(1)]);
await rpc("owner_confirm_slots", [A, T(1)]);
await q(`update public.turfs set is_active = false where id = $1`, [T(1)]);
eq(await rpc("turf_availability", [T(1)]), { fresh: false }, "inactive: hidden");
await q(`update public.turfs set is_active = true where id = $1`, [T(1)]);

// ── 6. Any session time zone, the same keys. ──
await db.exec(`set timezone = 'UTC'`);
const utc = await readAt(T(1), "2026-11-06 00:59+05:30");
await db.exec(`set timezone = 'Asia/Kolkata'`);
eq((await readAt(T(1), "2026-11-06 00:59+05:30")).booked, utc.booked, "UTC and India sessions read the same keys");
await db.exec(`reset timezone`);

// ── 7. anon calls the public read, cannot read the tables. ──
await db.exec(`set role anon`);
eq((await one(`select public.turf_availability($1) r`, [T(1)])).r.fresh, true, "anon: the public read");
await assert.rejects(q(`select * from private.turf_slots`), /permission denied/, "anon: no table read");
await assert.rejects(q(`select private.turf_availability_at($1, now())`, [T(1)]), /permission denied/, "anon: no private helper");
passed += 2;
await db.exec(`reset role`);

// ── 8. Again, with rows: kept. ──
const kept = [await rows(T(1)), await q(`select * from private.turf_availability order by turf_id`)];
await db.exec(NEW);
eq([await rows(T(1)), await q(`select * from private.turf_availability order by turf_id`)], kept, "the file again: rows and times kept");

console.log(`turf_availability: ${passed} checks passed`);
