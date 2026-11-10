// Applies booking_requests.check.mjs's stand-ins and migrations (the account,
// myTapturf, claims, account-links and owner call number migrations, the
// turfs cache trigger, 20261027_verified_tick.sql,
// 20261105_turf_availability.sql and 20261106_booking_requests.sql) to an
// in-memory Postgres (PGlite), then 20261111_free_slots_nearby.sql twice,
// and checks Free hours nearby: the file's rules and its header (the md5 of
// every function it calls, as the repo's migrations make them here); the
// two functions it makes and nothing it replaces; their grants; the batch
// read (private.free_slots_at, public.free_slots_now) equals
// turf_availability and turf_takes_requests turf by turf, at several
// clocks (fresh, stale, unclaimed, inactive, never marked, past hours,
// after midnight): a turf is in it exactly when its own read says fresh,
// with the same booked keys cut to the window and the same requests flag;
// the city filter, a bad city, the window held to 1 to 192 hours, its
// order and the cap; nothing personal in it; it writes nothing (no row, no
// cache purge). Never touches a real database. Made-up turfs and numbers.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/free_slots_nearby.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: free_slots_nearby.check.mjs <supabase/migrations>");
const NEW = fs.readFileSync(`${M}/20261111_free_slots_nearby.sql`, "utf8");
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };

// ── 0. The file. ──
const code = NEW.replace(/^\s*--.*$/gm, "");
assert.doesNotMatch(NEW, /\bdrop\b|\bdelete\b|\btruncate\b/i, "no destructive keywords, comments included");
assert.doesNotMatch(NEW, /[—–]/, "no em or en dashes");
assert.match(NEW, /\nset local lock_timeout = '5s';\n/, "sets the lock timeout");
assert.doesNotMatch(code, /\b(update|insert\s+into)\s+(public|private)\.|\bfor\s+update\b|\bcreate\s+table\b|\balter\s+table\b/i, "writes, locks and makes no table");
assert.doesNotMatch(code, /\bgrant\b[^;]*\bon\s+(table\s+)?public\.|\bpolicy\b/i, "no grant or policy on a public table");
passed += 5;
const MADE = [...NEW.matchAll(/create or replace function (\w+)\.(\w+)\(/gi)].map((m) => `${m[1]}.${m[2]}`);
eq(MADE.sort(), ["private.free_slots_at", "public.free_slots_now"], "exactly these two functions");
for (const w of ["Additive.", "No function from before is replaced.", "The app works before this file", "read 10 Nov 2026", "Nothing personal"]) ok(NEW.includes(w), `the header says ${w}`);
const HEADER_MD5 = Object.fromEntries([...NEW.matchAll(/^--\s+((?:private|public)\.\w+)\s+([0-9a-f]{32})/gm)].map((m) => [m[1], m[2]]));
eq(Object.keys(HEADER_MD5).sort(), ["private.booking_open", "private.slot_at", "private.slot_key", "private.slots_ahead", "private.slots_fresh", "private.slots_max",
  "private.turf_availability_at", "private.turf_booked", "public.turf_availability", "public.turf_takes_requests"], "the header lists every function it calls, and theirs");

// ── The database before it (booking_requests.check.mjs's stand-ins and migrations). ──
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
grant select, insert, update on public.users to anon, authenticated;
create table public.user_logins (id bigint generated always as identity primary key, user_id uuid not null,
  method text not null check (method in ('phone','google')), created_at timestamptz not null default now());
create table public.live_matches (code text primary key, match jsonb, rev bigint, status text, updated_at timestamptz default now());
create table public.turfs (id uuid primary key default gen_random_uuid(), name text, slug text, city text, area text, address text, is_active boolean default true,
  contact_info jsonb, owner_phone text, whatsapp_phone text, landline_phone text, cover_image text, images jsonb, owner_id uuid,
  morning_price int, afternoon_price int, evening_price int, weekend_morning_price int, weekend_afternoon_price int, weekend_evening_price int,
  has_floodlights boolean, is_covered boolean, parking_available boolean, washroom_available boolean, changing_room_available boolean,
  has_cafeteria boolean, has_drinking_water boolean, equipment_provided boolean, is_24x7 boolean, start_time time, end_time time,
  closed_days text, description text, surface_type text, number_of_grounds int, formats jsonb, opening_hours jsonb,
  price_owner_confirmed boolean, price_verified_at timestamptz, price_unit text, lat double precision, lng double precision, updated_at timestamptz default now());
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
create table public.notifications (id uuid not null default gen_random_uuid() primary key, user_id uuid references public.users(id) on delete cascade,
  type text not null, title text not null, message text not null, metadata jsonb default '{}'::jsonb, is_read boolean default false, created_at timestamptz default now());
`);
for (const f of ["20261019_mytapturf.sql", "20261019_mytapturf_claims.sql", "20261021_accounts_usernames.sql", "20261021_accounts_fixes.sql",
  "20261021_phone_identity_exact_india.sql", "20261022_people_fixes.sql", "20261025_contact_email.sql", "20261025_admin_verified.sql",
  "20261025_auth_mirror_google_only.sql", "20261025_claims_account.sql", "20261024_users_lockdown_step4.sql",
  "20261026_account_links.sql", "20261026_account_links_reads.sql", "20261028_owner_call_number.sql"]) await db.exec(fs.readFileSync(`${M}/${f}`, "utf8"));
await db.exec(`
create or replace function private.firebase_phone10(p_token text) returns text language sql as
  $$ select case when p_token ~ '^proof:[6-9][0-9]{9}$' then substr(p_token, 7) end $$;
create or replace function public._caller_key(p_token text) returns text language sql security definer set search_path = public as $$
  select case when p_token ~ '^phone:[6-9][0-9]{9}$' then 'p:' || substr(p_token, 7) end $$;
create or replace function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
create or replace function public._is_admin_key(p_key text) returns boolean language sql immutable as $$ select p_key = 'p:9000000099' $$;
create table private.dirty_log (id bigserial primary key, keys text[], urgent boolean);
create or replace function private.mark_dirty(p_keys text[], p_urgent boolean default false) returns void language sql as
  $$ insert into private.dirty_log (keys, urgent) values ((select array_agg(distinct x order by x) from unnest(p_keys) x where x is not null), p_urgent) $$;
create or replace function private.list_key(p_city text) returns text language sql immutable as
  $$ select 'list:' || case when p_city ~ '^[a-z][a-z-]{1,30}$' then p_city else 'all' end $$;
`);
await db.exec(fs.readFileSync(`${M}/20261025_turf_claimed.sql`, "utf8"));
await db.exec(`create trigger turfs_mark_cache_dirty after insert or update or delete on public.turfs for each row execute function private.mark_turf_dirty();`);
await db.exec(fs.readFileSync(`${M}/20261027_verified_tick.sql`, "utf8"));
await db.exec(fs.readFileSync(`${M}/20261105_turf_availability.sql`, "utf8"));
await db.exec(fs.readFileSync(`${M}/20261106_booking_requests.sql`, "utf8"));

// ── 1. The header's md5s are the bodies these migrations make (production's, read through the MCP, are the same: see the header). ──
for (const [name, md5] of Object.entries(HEADER_MD5)) {
  const [schema, fn] = name.split(".");
  const r = await one(`select md5(p.prosrc) m from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2`, [schema, fn]);
  eq(r?.m, md5, `${name}: the header's md5 is its body here`);
}

// ── The turfs: made up, in two cities. ──
const T = (i) => `dddddddd-0000-4000-8000-${String(i).padStart(12, "0")}`;
const TURFS = [
  // i, name, city, area, owner number, hours
  [1, "Dribble Standin", "bangalore", "Made-up Layout", "9000000101", { start: "06:00", end: "02:00" }],
  [2, "Stale Standin", "bangalore", "Made-up Nagar", "9000000102", { start: "06:00", end: "23:00" }],
  [3, "Unclaimed Standin", "bangalore", "Made-up Nagar", "9000000103", { start: "06:00", end: "23:00" }],
  [4, "Closed Down Standin", "bangalore", "Made-up Nagar", "9000000104", { start: "06:00", end: "23:00" }],
  [5, "Pune Free Standin", "pune", "Made-up Peth", "9000000105", { h24: true }],
  [6, "Never Marked Standin", "pune", "Made-up Peth", "9000000106", { start: "06:00", end: "23:00" }],
  [7, "Past Only Standin", "bangalore", "Made-up Layout", "9000000107", { start: "06:00", end: "23:00" }],
];
for (const [i, name, city, area, phone, h] of TURFS) {
  await q(`insert into public.turfs (id, name, slug, city, area, owner_phone, whatsapp_phone, lat, lng, is_24x7, start_time, end_time, closed_days, opening_hours)
    values ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [T(i), name, `${name.toLowerCase().replace(/\s+/g, "-")}-${city}`, city, area, phone, 12.9 + i / 100, 77.6 + i / 100, !!h.h24, h.start ?? null, h.end ?? null, i === 7 ? "Sunday" : null, null]);
}
// Claims (straight into turf_owners: the trigger sets claimed), except Unclaimed Standin.
for (const [i, , , , phone] of TURFS) if (i !== 3) await q(`insert into public.turf_owners (turf_id, user_key, status, via) values ($1, $2, 'active', 'admin')`, [T(i), `p:${phone}`]);
eq((await q(`select id from public.turfs where claimed order by id`)).map((r) => r.id), [1, 2, 4, 5, 6, 7].map(T), "every turf but Unclaimed Standin is claimed");

// The marks, at a pinned clock long before the real one (so nothing is fresh at now()): 10 Mar 2026, 4:30 PM India time.
const NOW = "2026-03-10T11:00:00Z";
const at = (iso, h) => new Date(Date.parse(iso) + h * 3600e3).toISOString();
const key = (iso) => new Date(Date.parse(iso) + 330 * 60e3).toISOString().slice(0, 16);
const apply = async (i, changes, when) => (await one(`select private.turf_slots_apply($1, $2::jsonb, $3) r`, [T(i), JSON.stringify(changes), when])).r;
const B = (...hours) => hours.map((h) => ({ at: key(at(NOW, h)), status: "booked" }));
// Dribble: booked 1 h 30 m, 3 h 30 m, 8 h 30 m (1 AM, after midnight), 40 h 30 m (past 36 h) and 6 days ahead from NOW.
let r = await apply(1, [...B(1.5, 3.5, 8.5, 40.5, 150.5)], at(NOW, -2));
ok(r.ok === true && r.saved === 5, "Dribble's marks saved");
// Its booking requests on.
await q(`insert into private.turf_booking_settings (turf_id, requests_on) values ($1, true)`, [T(1)]);
// Stale: marked 25 hours before NOW.
r = await apply(2, B(1.5), at(NOW, -25));
ok(r.ok === true, "Stale's mark saved, 25 h ago");
// Unclaimed and Closed Down: marked now (rows by hand: the guard would refuse them), then Closed Down switched off.
await q(`insert into private.turf_availability (turf_id, updated_at) values ($1, $3), ($2, $3)`, [T(3), T(4), at(NOW, -1)]);
await q(`update public.turfs set is_active = false where id = $1`, [T(4)]);
// Pune Free: 24 hours, marked an hour ago, nothing booked; its requests off.
r = await (async () => (await one(`select private.turf_slots_confirm($1, $2) r`, [T(5), at(NOW, -1)])).r)();
ok(r.ok === true, "Pune Free confirmed an hour ago");
await q(`insert into private.turf_booking_settings (turf_id, requests_on) values ($1, false)`, [T(5)]);
// Past Only: marks an hour that has started by NOW, confirmed 3 h ago.
r = await apply(7, B(-0.5, 0.5), at(NOW, -3));
ok(r.ok === true, "Past Only's marks saved");

// ── 2. Before the file: no functions. Then the file, twice. ──
eq((await q(`select 1 from pg_proc where proname in ('free_slots_at', 'free_slots_now')`)).length, 0, "before: no free slots batch functions");
const dirtyBefore = Number((await one(`select count(*) n from private.dirty_log`)).n);
const snapshot = async () => createHash("md5").update(JSON.stringify([
  await q(`select * from public.turfs order by id`), await q(`select * from private.turf_availability order by turf_id`),
  await q(`select * from private.turf_slots order by turf_id, starts_at`), await q(`select * from private.turf_booking_settings order by turf_id`),
])).digest("hex");
const before = await snapshot();
await db.exec(NEW);
await db.exec(NEW);
eq((await q(`select p.proname from pg_proc p where p.proname in ('free_slots_at', 'free_slots_now') group by 1 having count(*) > 1`)).length, 0, "no overloads after running it twice");

// ── 3. Grants. ──
const fnInfo = async (schema, name) => one(`select p.prosecdef s, p.proconfig c, p.provolatile v, has_function_privilege('anon', p.oid, 'execute') a,
  has_function_privilege('authenticated', p.oid, 'execute') u, has_function_privilege('public', p.oid, 'execute') p
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2`, [schema, name]);
let f = await fnInfo("public", "free_slots_now");
eq([f.s, f.c, f.v, f.a, f.u, f.p], [true, ['search_path=""'], "s", true, true, false], "free_slots_now: security definer, stable, search_path '', anon and authenticated only");
f = await fnInfo("private", "free_slots_at");
eq([f.s, f.c, f.v, f.a, f.u, f.p], [true, ['search_path=""'], "s", false, false, false], "free_slots_at: nobody may call it");
eq((await one(`select pg_get_function_identity_arguments(p.oid) a from pg_proc p where p.proname = 'free_slots_now'`)).a, "p_city text, p_hours integer", "no clock on the public read");

// ── 4. The batch equals turf_availability and turf_takes_requests, turf by turf. ──
const batch = async (city, when, hours = 36) => (await one(`select private.free_slots_at($1, $2, $3) r`, [city, when, hours])).r;
const perTurf = async (i, when) => (await one(`select private.turf_availability_at($1, $2) r`, [T(i), when])).r;
const takes = async (i, when) => (await one(`select private.booking_open($1, $2) r`, [T(i), when])).r;
const slotAt = (k) => Date.parse(`${k}:00Z`) - 330 * 60e3;
const CLOCKS = [NOW, at(NOW, -1.5), at(NOW, 5), at(NOW, 21.5), at(NOW, 23.5), at(NOW, 30)];
for (const when of CLOCKS) {
  for (const hours of [36, 192, 1]) {
    const b = await batch(null, when, hours);
    eq(Date.parse(b.now), Date.parse(when), `the batch says its clock (${when})`);
    const byId = new Map(b.turfs.map((t) => [t.id, t]));
    for (const [i] of TURFS) {
      const own = await perTurf(i, when);
      const row = byId.get(T(i));
      eq(!!row, own.fresh === true, `turf ${i} at ${when}, ${hours} h: in the batch exactly when its own read is fresh`);
      if (!row) continue;
      eq(row.updated_at, own.updated_at, `turf ${i}: the same updated_at`);
      const cut = Date.parse(when) + Math.max(1, Math.min(hours, 192)) * 3600e3;
      eq(row.booked, own.booked.filter((k) => slotAt(k) < cut), `turf ${i} at ${when}, ${hours} h: its own booked keys, cut to the window`);
      eq(row.requests, await takes(i, when), `turf ${i}: the same requests flag as turf_takes_requests`);
    }
  }
}
// The public read is the batch now (the real clock: none of the made-up marks is fresh at it, so none).
eq((await one(`select public.free_slots_now() r`)).r.turfs, (await batch(null, new Date().toISOString())).turfs, "free_slots_now() is free_slots_at(null, now(), 36)");
eq((await one(`select public.free_slots_now('bangalore', 5) r`)).r.turfs, (await batch("bangalore", new Date().toISOString(), 5)).turfs, "free_slots_now(city, hours) passes both on");
eq(await one(`select public.turf_availability($1) r`, [T(1)]).then((x) => x.r.fresh), false, "and turf_availability agrees at the real clock");

// ── 5. What NOW shows. ──
let b = await batch(null, NOW);
eq(b.turfs.map((t) => t.name), ["Pune Free Standin", "Dribble Standin", "Past Only Standin"], "at NOW: the three fresh claimed active turfs, most recently updated first");
const dribble = b.turfs.find((t) => t.id === T(1));
eq(dribble.booked, [key(at(NOW, 1.5)), key(at(NOW, 3.5)), key(at(NOW, 8.5))], "Dribble: its booked hours in the next 36 h (the 40 h and 6 day ones left out)");
eq(dribble.booked, ["2026-03-10T18:00", "2026-03-10T20:00", "2026-03-11T01:00"], "an after-midnight key is the next calendar date");
eq([dribble.requests, b.turfs.find((t) => t.id === T(5)).requests], [true, false], "Dribble takes requests; Pune Free doesn't");
eq(b.turfs.find((t) => t.id === T(7)).booked, [key(at(NOW, 0.5))], "Past Only: the hour that started is gone, the one to come stays");
eq(Object.keys(dribble).sort(), ["area", "booked", "city", "hours", "id", "lat", "lng", "name", "requests", "slug", "updated_at"], "a turf's fields, and nothing else");
eq(Object.keys(dribble.hours).sort(), ["closed_days", "end_time", "is_24x7", "opening_hours", "start_time"], "its hours, as the page reads them");
eq([dribble.hours.start_time, dribble.hours.end_time, dribble.hours.is_24x7, b.turfs.find((t) => t.id === T(7)).hours.closed_days], ["06:00:00", "02:00:00", false, "Sunday"], "the hours' values");
eq([dribble.slug, dribble.area, dribble.city, dribble.lat, dribble.lng], ["dribble-standin-bangalore", "Made-up Layout", "bangalore", 12.9 + 1 / 100, 77.6 + 1 / 100], "its listing fields");
const flat = JSON.stringify(b);
ok(!/9000000|owner_phone|whatsapp|contact|user_key|p:/.test(flat), "no number, owner, account or claim key anywhere in it");
// The city filter.
eq((await batch("bangalore", NOW)).turfs.map((t) => t.name), ["Dribble Standin", "Past Only Standin"], "bangalore: its two");
eq((await batch("pune", NOW)).turfs.map((t) => t.name), ["Pune Free Standin"], "pune: its one");
eq((await batch("nashik", NOW)).turfs, [], "a city with none: an empty list");
for (const bad of ["Bangalore", "bangalore'; select 1; --", "", "x"]) eq((await batch(bad, NOW)).turfs, [], `a bad city id (${JSON.stringify(bad)}): none`);
// The window held to 1 to 192 hours.
eq((await batch("bangalore", NOW, 0)).turfs[0].booked, (await batch("bangalore", NOW, 1)).turfs[0].booked, "0 hours is 1");
eq((await batch("bangalore", NOW, 10000)).turfs[0].booked, (await batch("bangalore", NOW, 192)).turfs[0].booked, "10000 hours is 192");
eq((await batch("bangalore", NOW, 192)).turfs[0].booked.length, 5, "192 hours: the 40 h and 6 day ones too (all 5)");
eq((await batch("bangalore", NOW, null)).turfs[0].booked, (await batch("bangalore", NOW, 36)).turfs[0].booked, "no window is 36 hours");
// Marks go stale 24 h after the last save: Past Only's at 21 h from NOW, Dribble's at 22 h.
eq((await batch("bangalore", at(NOW, 21.5))).turfs.map((t) => t.name), ["Dribble Standin"], "21 h 30 m on: Past Only's marks are 24 h old, it is gone");
eq((await batch("bangalore", at(NOW, 22.01))).turfs, [], "22 h on: Dribble's too");
// ── 6. It wrote nothing. ──
eq(await snapshot(), before, "the turfs, marks and settings are as they were before the file");
const dirtyNow = Number((await one(`select count(*) n from private.dirty_log`)).n);
for (const when of CLOCKS) await batch(null, when, 192);
eq(await snapshot(), before, "reading the batch changed nothing");
eq([dirtyNow, Number((await one(`select count(*) n from private.dirty_log`)).n)], [dirtyBefore, dirtyBefore], "and asked for no cache purge");

// ── 7. The cap:  200 turfs, the most recently updated first.
for (let k = 100; k < 305; k++) {
  await q(`insert into public.turfs (id, name, slug, city, owner_phone) values ($1, $2, $3, 'chennai', '9000000199')`, [T(k), `Bulk ${k}`, `bulk-${k}-chennai`]);
  await q(`insert into public.turf_owners (turf_id, user_key, status, via) values ($1, 'p:9000000199', 'active', 'admin')`, [T(k)]);
  await q(`insert into private.turf_availability (turf_id, updated_at) values ($1, $2)`, [T(k), at(NOW, -k / 100)]);
}
b = await batch("chennai", NOW);
eq([b.turfs.length, b.turfs[0].name, b.turfs[199].name], [200, "Bulk 100", "Bulk 299"], "at most 200 turfs, the most recently updated first");

console.log(`free_slots_nearby: ${passed} checks passed`);
