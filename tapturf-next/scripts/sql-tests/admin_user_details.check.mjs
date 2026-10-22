// Applies 20261022_admin_user_details.sql (twice) to an in-memory Postgres
// (PGlite) with stand-ins for Supabase's roles, auth schema and the tables
// it reads, and checks what admin_user_details returns. Never touches a
// real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/admin_user_details.check.mjs supabase/migrations/20261022_admin_user_details.sql
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [FILE] = process.argv.slice(2);
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key, email text);
create table public.users (
  id uuid not null default gen_random_uuid() primary key,
  email varchar unique, password varchar, name varchar not null, phone varchar,
  role varchar default 'user', is_verified boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  profile_image_url text, firebase_uid text unique, pin varchar);
create table public.usernames (user_id uuid primary key, username text unique not null, taggable boolean not null default true);
create table public.user_logins (id bigint generated always as identity primary key, user_id uuid not null, method text not null, created_at timestamptz not null default now());
create table public.games (id uuid primary key default gen_random_uuid(), creator_id uuid, created_at timestamptz default now());
create table public.game_requests (id uuid primary key default gen_random_uuid(), game_id uuid, user_id uuid, status text, created_at timestamptz default now());
create table public.game_participants (id uuid primary key default gen_random_uuid(), game_id uuid, user_id uuid, joined_at timestamptz default now());
create table public.reviews (id uuid primary key default gen_random_uuid(), user_id uuid, source text, created_at timestamptz default now());
create table public.turfs (id uuid primary key, name varchar, slug text);
create table public.turf_contact_clicks (id bigint generated always as identity primary key, turf_id uuid, kind text, user_id uuid, created_at timestamptz default now());
create table public.ask_queries (id bigint generated always as identity primary key, query text, user_id uuid, created_at timestamptz default now());
create table public.turf_suggestions (id uuid primary key default gen_random_uuid(), user_id uuid, created_at timestamptz default now());
create table public.turf_owners (turf_id uuid, user_key text, status text, role text, created_at timestamptz default now(), primary key (turf_id, user_key));
create table public.user_signup_context (user_id uuid primary key, ctx jsonb not null, created_at timestamptz default now());
create function public._phone10(p text) returns text language sql immutable as $$
  select case when length(d) >= 10 and right(d, 10) ~ '^[6-9]' then right(d, 10) end
  from (select regexp_replace(coalesce(p, ''), '\\D', '', 'g') as d) x;
$$;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);

const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\bupdate\b|\binsert\b/i, "read only, nothing destructive");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
await db.exec(sql);
await db.exec(sql); // safe to run again

const G = "11111111-1111-4111-8111-111111111111"; // Google
const P = "22222222-2222-4222-8222-222222222222"; // phone
const E = "33333333-3333-4333-8333-333333333333"; // old email account
const N = "44444444-4444-4444-8444-444444444444"; // nothing done yet
const T = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;

await q(`insert into auth.users values ('${G}', 'g@x.in')`);
await q(`insert into public.users (id, name, email, phone, profile_image_url, created_at, updated_at, password, pin) values
  ('${G}', 'Gita', 'G@x.in', null, 'https://img/g', '2026-10-20 10:00+00', '2026-10-21 10:00+00', 'secret', '1234'),
  ('${P}', 'Prem', null, '+919876543210', null, '2026-10-21 10:00+00', '2026-10-21 10:00+00', null, null),
  ('${E}', 'Esha', 'e@x.in', null, null, '2025-01-01 00:00+00', '2025-01-01 00:00+00', null, null),
  ('${N}', 'Nil', null, '+919000000000', null, '2026-10-22 09:00+00', '2026-10-22 09:00+00', null, null)`);
await q(`insert into public.usernames values ('${P}', 'prem_7', false)`);
await q(`insert into public.user_logins (user_id, method, created_at) values
  ('${G}', 'google', '2026-10-20 10:00+00'), ('${G}', 'google', '2026-10-21 12:00+00'),
  ('${E}', 'google', '2026-10-15 08:00+00'), ('${E}', 'phone', '2026-10-01 08:00+00')`);
await q(`insert into public.games (creator_id, created_at) values ('${G}', '2026-10-21 13:00+00'), ('${G}', '2026-10-20 13:00+00'), (null, now())`);
await q(`insert into public.game_requests (game_id, user_id, status, created_at) values
  ('${T(90)}', '${P}', 'accepted', '2026-10-21 11:00+00'), ('${T(91)}', '${P}', 'pending', '2026-10-21 11:30+00'), ('${T(92)}', '${P}', 'declined', '2026-10-21 11:40+00')`);
await q(`insert into public.game_participants (game_id, user_id, joined_at) values ('${T(90)}', '${P}', '2026-10-21 11:05+00'), ('${T(90)}', '${P}', '2026-10-21 11:06+00')`);
await q(`insert into public.reviews (user_id, source, created_at) values ('${G}', 'google', now()), ('${G}', 'google', now()), ('${G}', null, '2026-10-21 09:00+00'), ('${G}', 'tapturf', '2026-10-21 09:30+00')`);
await q(`insert into public.turfs values ${[1, 2, 3, 4, 5, 6].map((i) => `('${T(i)}', 'Turf ${i}', 'turf-${i}')`).join(", ")}`);
// Prem taps six turfs (turf 1 twice, by call and WhatsApp) and one since removed.
await q(`insert into public.turf_contact_clicks (turf_id, kind, user_id, created_at) values
  ('${T(1)}', 'call', '${P}', '2026-10-21 12:00+00'), ('${T(1)}', 'whatsapp', '${P}', '2026-10-21 12:10+00'),
  ('${T(2)}', 'call', '${P}', '2026-10-21 12:20+00'), ('${T(3)}', 'call', '${P}', '2026-10-21 12:30+00'),
  ('${T(4)}', 'call', '${P}', '2026-10-21 12:40+00'), ('${T(5)}', 'call', '${P}', '2026-10-21 12:50+00'),
  ('${T(77)}', 'call', '${P}', '2026-10-21 13:00+00'), ('${T(6)}', 'call', null, now())`);
await q(`insert into public.ask_queries (query, user_id, created_at) values
  ('one', '${P}', '2026-10-21 10:10+00'), ('two', '${P}', '2026-10-21 10:20+00'), ('three', '${P}', '2026-10-21 10:30+00'),
  ($1, '${P}', '2026-10-21 10:40+00'), ('anon', null, now())`, ["x".repeat(500)]);
await q(`insert into public.turf_suggestions (user_id, created_at) values ('${E}', '2026-10-16 08:00+00')`);
await q(`insert into public.turf_owners (turf_id, user_key, status, role, created_at) values
  ('${T(1)}', 'e:g@x.in', 'approved', 'owner', '2026-10-21 00:00+00'),
  ('${T(2)}', 'p:9876543210', 'pending', 'manager', '2026-10-21 01:00+00'),
  ('${T(77)}', 'p:9876543210', 'revoked', null, '2026-10-20 01:00+00'),
  ('${T(3)}', 'e:someone@else.in', 'approved', 'owner', now())`);
await q(`insert into public.user_signup_context (user_id, ctx) values ('${P}', '{"v":1,"method":"phone","first":{"landing":"/pune"}}')`);

// Grants and shape.
eq((await one("select has_function_privilege('anon', 'public.admin_user_details(text)', 'execute') x")).x, true, "anon may call it; the owner check is inside");
const f = await one("select prosecdef, provolatile, proconfig from pg_proc where proname = 'admin_user_details'");
eq([f.prosecdef, f.provolatile, f.proconfig], [true, "s", ["search_path=\"\""]], "security definer, stable, empty search_path");

// Not the owner: refused, nothing returned.
await assert.rejects(q("select * from public.admin_user_details('tok')"), (e) => e.code === "42501", "refused for anyone else");
passed++;

await q("select set_config('test.owner', 'yes', false)");
const rows = await q("select * from public.admin_user_details('tok')");
eq(rows.map((r) => r.name), ["Nil", "Prem", "Gita", "Esha"], "everyone, newest first");
const by = Object.fromEntries(rows.map((r) => [r.name, r]));
ok(!("password" in by.Gita) && !("pin" in by.Gita) && !("firebase_uid" in by.Gita), "no secrets in the result");

eq([by.Gita.method, by.Prem.method, by.Esha.method, by.Nil.method], ["google", "phone", "email", "phone"], "sign-up method");
eq([by.Gita.email, by.Gita.profile_image_url, by.Prem.phone], ["G@x.in", "https://img/g", "+919876543210"], "contact and picture");
eq([by.Prem.username, by.Prem.taggable, by.Gita.username, by.Gita.taggable], ["prem_7", false, null, null], "username and tagging");

eq([by.Gita.logins, by.Gita.login_methods, +by.Gita.last_login], [2, ["google"], +new Date("2026-10-21T12:00Z")], "Google sign-ins");
eq([by.Esha.logins, by.Esha.login_methods], [2, ["google", "phone"]], "every method used");
eq([by.Gita.games_hosted, by.Gita.reviews], [2, 2], "hosted games, own reviews only (imported Google reviews left out)");
eq([by.Prem.requests, by.Prem.requests_accepted, by.Prem.games_joined], [3, 1, 1], "requests and games joined (one game, counted once)");

eq(by.Prem.contact_taps, 7, "every tap counted");
eq(by.Prem.contacted.map((c) => c.turf), ["A removed turf", "Turf 5", "Turf 4", "Turf 3", "Turf 2"], "the five latest turfs, newest first");
const prem1 = (await q("select * from public.admin_user_details()")).find((r) => r.name === "Prem");
eq(prem1.contacted.length, 5, "capped at five");
eq(by.Prem.contacted[0], { turf: "A removed turf", slug: null, kinds: ["call"], n: 1, at: "2026-10-21T13:00:00+00:00" }, "a contact entry");

eq(by.Prem.asks, 4, "Ask searches counted");
eq(by.Prem.recent_asks, ["x".repeat(200), "three", "two"], "three latest searches, trimmed to 200 characters");
eq(by.Esha.suggestions, 1, "turf suggestions");

eq(by.Gita.turfs, [{ turf: "Turf 1", slug: "turf-1", status: "approved", role: "owner" }], "turf claim by email, any case");
eq(by.Prem.turfs.map((t) => [t.turf, t.status]), [["Turf 2", "pending"], ["A removed turf", "revoked"]], "turf claims by phone, every status");

eq(+by.Prem.last_active, +new Date("2026-10-21T13:00Z"), "last active is the latest of everything");
eq(+by.Gita.last_active, +new Date("2026-10-21T13:00Z"), "a hosted game counts as activity");
eq(by.Prem.signup, { v: 1, method: "phone", first: { landing: "/pune" } }, "sign-up context passed through");

const nil = by.Nil;
eq([nil.logins, nil.login_methods, nil.last_login, nil.games_hosted, nil.requests, nil.requests_accepted, nil.games_joined, nil.reviews, nil.contact_taps, nil.contacted, nil.asks, nil.recent_asks, nil.suggestions, nil.turfs, nil.last_active, nil.signup],
  [0, [], null, 0, 0, 0, 0, 0, 0, [], 0, [], 0, [], null, null], "someone who has done nothing: zeros and empty lists, never nulls for counts");

console.log(`admin_user_details: ${passed} checks passed`);
