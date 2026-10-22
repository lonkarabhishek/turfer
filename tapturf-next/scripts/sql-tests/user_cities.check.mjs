// Applies 20261022_admin_user_details.sql, then 20261022_user_cities.sql
// (twice), to an in-memory Postgres (PGlite) with stand-ins for Supabase's
// roles, auth schema and the tables they read, and checks how cities are
// recorded and what admin_people returns. Never touches a real
// database.
// Then 20261022_people_fixes.sql (twice) and the case it fixes.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/user_cities.check.mjs supabase/migrations/20261022_admin_user_details.sql supabase/migrations/20261022_user_cities.sql supabase/migrations/20261022_people_fixes.sql
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [BASE, FILE, FIXES] = process.argv.slice(2);
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', 'K'||repeat('1', 63));
create function private.account_key_ok(p_key text) returns boolean language sql stable security definer set search_path = '' as
  $$ select p_key is not null and p_key = (select s.value from private.app_secrets s where s.name = 'account') $$;
create schema auth;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), last_sign_in_at timestamptz, raw_app_meta_data jsonb default '{}');
create table private.legacy_email_rows (user_id uuid primary key, added_at timestamptz not null default now());
create table private.users_phone_changes (id bigint generated always as identity primary key, user_id uuid not null, at timestamptz not null default now());
create function private.phone_logins_trusted_before() returns timestamptz language sql immutable set search_path = '' as $$ select timestamptz '2026-10-21 18:50:00+00' $$;
create table public.users (
  id uuid not null default gen_random_uuid() primary key,
  email varchar unique, password varchar, name varchar not null, phone varchar,
  role varchar default 'user', is_verified boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  profile_image_url text, firebase_uid text unique, pin varchar);
create table public.usernames (user_id uuid primary key, username text unique not null, taggable boolean not null default true);
create table public.user_logins (id bigint generated always as identity primary key, user_id uuid not null, method text not null, created_at timestamptz not null default now());
create table public.games (id uuid primary key default gen_random_uuid(), creator_id uuid, turf_id uuid, created_at timestamptz default now());
create table public.game_requests (id uuid primary key default gen_random_uuid(), game_id uuid, user_id uuid, status text, created_at timestamptz default now());
create table public.game_participants (id uuid primary key default gen_random_uuid(), game_id uuid, user_id uuid, joined_at timestamptz default now());
create table public.reviews (id uuid primary key default gen_random_uuid(), user_id uuid, turf_id uuid, source text, created_at timestamptz default now());
create table public.turfs (id uuid primary key, name varchar, slug text, city text);
create table public.turf_contact_clicks (id bigint generated always as identity primary key, turf_id uuid, kind text, user_id uuid, created_at timestamptz default now());
create table public.ask_queries (id bigint generated always as identity primary key, query text, filters jsonb, user_id uuid, created_at timestamptz default now());
create table public.turf_suggestions (id uuid primary key default gen_random_uuid(), turf_id uuid, user_id uuid, created_at timestamptz default now());
create table public.turf_owners (turf_id uuid, user_key text, status text, role text, created_at timestamptz default now(), primary key (turf_id, user_key));
create table public.user_signup_context (user_id uuid primary key, ctx jsonb not null, created_at timestamptz default now());
create function public._phone10(p text) returns text language sql immutable as $$
  select case when length(d) >= 10 and right(d, 10) ~ '^[6-9]' then right(d, 10) end
  from (select regexp_replace(coalesce(p, ''), '\\D', '', 'g') as d) x;
$$;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);

await db.exec(fs.readFileSync(BASE, "utf8"));
const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b/i, "nothing dropped or deleted");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
await db.exec(sql);
await db.exec(sql); // safe to run again

const KEY = "K" + "1".repeat(63);
const note = async (user, city, source, ip = null, key = KEY) => (await one("select public.account_note_city($1, $2, $3, $4, $5) r", [key, user, city, source, ip])).r;
const row = (user) => one("select city, source, ip_city, at_signup from private.user_cities where user_id = $1", [user]);

const NEW = "11111111-1111-4111-8111-111111111111";
const OLD = "22222222-2222-4222-8222-222222222222";
const GOO = "33333333-3333-4333-8333-333333333333"; // Google, bulk copied into users later
const MIX = "44444444-4444-4444-8444-444444444444";
const NONE = "55555555-5555-4555-8555-555555555555";
const T = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;

await q(`insert into auth.users (id, email, created_at, last_sign_in_at, raw_app_meta_data) values ('${GOO}', 'g@x.in', '2025-09-01 10:00+00', '2025-09-20 10:00+00', '{"provider":"google","providers":["google"]}')`);
await q(`insert into public.users (id, name, email, phone, created_at) values
  ('${NEW}', 'New', null, '+919800000001', now() - interval '5 minutes'),
  ('${OLD}', 'Old', null, '+919800000002', '2025-06-01 00:00+00'),
  ('${GOO}', 'Goo', 'G@x.in', null, '2025-10-30 12:51:56+00'),
  ('${MIX}', 'Mix', null, '+919800000004', '2026-03-01 00:00+00'),
  ('${NONE}', 'None', null, '+919800000005', '2026-04-01 00:00+00')`);

// Grants.
eq((await one("select has_function_privilege('anon', 'public.account_note_city(text, uuid, text, text, text)', 'execute') x")).x, true, "the server calls it with the anon key; the account key is the gate");
const t = await one("select has_table_privilege('anon', 'private.user_cities', 'select') s, has_table_privilege('authenticated', 'private.user_cities', 'insert') i");
eq([t.s, t.i], [false, false], "nobody reads or writes the table directly");

// Refusals.
eq(await note(NEW, "pune", "picked", null, "wrong"), { r: "unavailable" }, "wrong key");
for (const [city, source, what] of [
  [null, "picked", "a pick needs a city"],
  ["pune", "unknown", "unknown has no city"],
  ["Pune", "picked", "ids are lowercase"],
  ["pune'; --", "picked", "ids are slugs"],
  ["pune", "telepathy", "known sources only"],
  ["pune", null, "a source is needed"],
]) eq(await note(NEW, city, source), { r: "bad" }, what);
eq(await note("99999999-9999-4999-8999-999999999999", "pune", "picked"), { r: "bad" }, "no such account");
eq(await note(null, "pune", "picked"), { r: "bad" }, "no account id");
eq(await row(NEW), undefined, "nothing written by a refusal");

// A new account: the internet guess first, then a pick replaces it; a pick is never replaced.
eq(await note(NEW, "mumbai", "ip", "  Navi Mumbai  "), { r: "ok" });
eq(await row(NEW), { city: "mumbai", source: "ip", ip_city: "Navi Mumbai", at_signup: true }, "internet city, at sign-up");
eq(await note(NEW, null, "unknown"), { r: "ok" });
eq((await row(NEW)).city, "mumbai", "unknown never replaces a city");
eq(await note(NEW, "pune", "picked", "Thane"), { r: "ok" });
eq(await row(NEW), { city: "pune", source: "picked", ip_city: "Navi Mumbai", at_signup: true }, "a pick replaces the guess; the first internet city is kept");
await note(NEW, "nashik", "gps");
await note(NEW, "delhi", "ip");
eq((await row(NEW)).city, "pune", "a pick is never replaced, by GPS or a guess");

// An older account noted on a later visit is not marked as at sign-up.
await note(OLD, null, "unknown", "x".repeat(80));
eq(await row(OLD), { city: null, source: "unknown", ip_city: "x".repeat(60), at_signup: false }, "unknown, internet city capped, not at sign-up");
await note(OLD, "nashik", "ip");
eq((await row(OLD)).source, "ip", "unknown is upgraded by a guess");
await note(OLD, "pune", "gps");
eq((await row(OLD)), { city: "pune", source: "gps", ip_city: "x".repeat(60), at_signup: false }, "and a guess by GPS");

// Best guesses from activity.
await q(`insert into public.turfs values
  ('${T(1)}', 'Nashik One', 'nashik-one', 'nashik'), ('${T(2)}', 'Nashik Two', 'nashik-two', 'nashik'),
  ('${T(3)}', 'Pune One', 'pune-one', 'pune'), ('${T(4)}', 'Mumbai One', 'mumbai-one', 'mumbai'),
  ('${T(5)}', 'Sambhajinagar One', 'sam-one', 'sambhajinagar')`);
const G1 = T(101), G2 = T(102);
await q(`insert into public.games (id, creator_id, turf_id, created_at) values ('${G1}', '${MIX}', '${T(1)}', '2026-03-02 00:00+00'), ('${G2}', null, '${T(2)}', '2026-03-03 00:00+00')`);
// Mix hosts G1 and is also its participant (one game, counted once: 3), asks to join G2 (3): nashik 6.
await q(`insert into public.game_participants (game_id, user_id, joined_at) values ('${G1}', '${MIX}', '2026-03-02 01:00+00')`);
await q(`insert into public.game_requests (game_id, user_id, status, created_at) values ('${G2}', '${MIX}', 'pending', '2026-03-03 01:00+00')`);
// Pune: two turfs contacted? one turf twice (2), a review (1), Google-imported reviews ignored: pune 3.
await q(`insert into public.turf_contact_clicks (turf_id, kind, user_id, created_at) values ('${T(3)}', 'call', '${MIX}', '2026-03-04 00:00+00'), ('${T(3)}', 'whatsapp', '${MIX}', '2026-03-05 00:00+00')`);
await q(`insert into public.reviews (user_id, turf_id, source, created_at) values ('${MIX}', '${T(3)}', null, '2026-03-06 00:00+00'), ('${MIX}', '${T(4)}', 'google', now()), ('${MIX}', '${T(4)}', 'google', now())`);
// A revoked claim counts for nothing; Ask cities count once a day, lightly: mumbai 0.5 + 0.5.
await q(`insert into public.turf_owners (turf_id, user_key, status, role, created_at) values ('${T(5)}', 'p:9800000004', 'revoked', null, now())`);
await q(`insert into public.ask_queries (query, filters, user_id, created_at) values
  ('a', '{"city":"mumbai"}', '${MIX}', '2026-03-07 05:00+00'), ('b', '{"city":"mumbai"}', '${MIX}', '2026-03-07 06:00+00'),
  ('c', '{"city":"mumbai"}', '${MIX}', '2026-03-09 06:00+00'), ('d', '{"city":null}', '${MIX}', now()), ('e', '{"city":"Bad City"}', '${MIX}', now())`);
// Old's sign-up context looked at Sangli first (4).
await q(`insert into public.user_signup_context (user_id, ctx) values ('${OLD}', '{"interest":{"cities":["sangli","pune"]}}')`);

await assert.rejects(q("select * from public.admin_people('tok')"), (e) => e.code === "42501", "refused for anyone else");
passed++;
await q("select set_config('test.owner', 'yes', false)");
const rows = await q("select * from public.admin_people('tok')");
const by = Object.fromEntries(rows.map((r) => [r.name, r]));

eq(+by.Goo.signed_up_at, +new Date("2025-09-01T10:00Z"), "a bulk-copied Google account signed up at its first Google sign-in");
eq(+by.Goo.created_at, +new Date("2025-10-30T12:51:56Z"), "the row's own time is still there");
eq(+by.Old.signed_up_at, +new Date("2025-06-01T00:00Z"), "a phone account: the row's time");
eq(rows.map((r) => r.name), ["New", "None", "Mix", "Goo", "Old"], "newest sign-up first");
eq(by.Goo.method, "google");
eq([by.Goo.logins, +by.Goo.last_login, by.Goo.login_methods], [1, +new Date("2025-09-20T10:00Z"), ["google"]], "a sign-in from before the log, from auth");
eq(+by.Goo.last_active, +new Date("2025-09-20T10:00Z"), "and it counts as activity");
eq(by.Mix.games_joined, 0, "hosting a game is not joining one");

eq([by.New.city, by.New.city_source, by.New.city_ip, by.New.city_at_signup], ["pune", "picked", "Navi Mumbai", true], "recorded city");
eq([by.None.city, by.None.city_source, by.None.likely_city, by.None.likely_share], [null, null, null, null], "nothing known");
eq(by.Mix.likely_city, "nashik", "games outweigh contacts, reviews and Ask cities");
ok(Math.abs(by.Mix.likely_share - 6 / 10) < 1e-6, `share of the evidence: 6 of 10 (got ${by.Mix.likely_share})`);
eq(by.Old.likely_city, "sangli", "the first city looked at before signing up");
eq(by.Mix.games_hosted, 1, "the details are unchanged");

// Ties go to the latest evidence, then the city id.
const TIE = "66666666-6666-4666-8666-666666666666";
await q(`insert into public.users (id, name, phone, created_at) values ('${TIE}', 'Tie', '+919800000006', '2026-05-01 00:00+00')`);
await q(`insert into public.turf_contact_clicks (turf_id, kind, user_id, created_at) values ('${T(3)}', 'call', '${TIE}', '2026-05-02 00:00+00'), ('${T(4)}', 'call', '${TIE}', '2026-05-03 00:00+00')`);
const tie = (await q("select * from public.admin_people('tok')")).find((r) => r.name === "Tie");
eq([tie.likely_city, tie.likely_share], ["mumbai", 0.5], "a tie goes to the most recent");

// The old app's email and password accounts have an auth row too: not Google.
const EML = "77777777-7777-4777-8777-777777777777";
await q(`insert into auth.users (id, email, created_at, last_sign_in_at, raw_app_meta_data) values ('${EML}', 'e@x.in', '2025-05-01 00:00+00', null, '{"provider":"email","providers":["email","google"]}')`);
await q(`insert into public.users (id, name, email, created_at) values ('${EML}', 'Eml', 'e@x.in', '2025-05-02 00:00+00')`);
await q(`insert into public.user_logins (user_id, method, created_at) values ('${EML}', 'google', '2026-10-10 00:00+00')`);
let all = await q("select * from public.admin_people('tok')");
let eml = all.find((r) => r.name === "Eml");
eq([eml.method, eml.logins, eml.login_methods], ["email", 1, ["google"]], "made with email and password; later Google sign-ins still listed");

// Turf claims show on the account that can hold the key, as _caller_key builds it.
const GHELD = "88888888-8888-4888-8888-888888888888"; // Google, its email held by another row
const HOLDER = "99999999-9999-4999-8999-999999999999"; // a non-legacy row holding that email
const LEG = "aaaaaaaa-0000-4000-8000-000000000001"; // an old-app email row
const GPH = "aaaaaaaa-0000-4000-8000-000000000002"; // Google row with a typed, unverified phone
await q(`insert into auth.users (id, email, raw_app_meta_data) values ('${GHELD}', 'held@x.in', '{"provider":"google"}'), ('${GPH}', 'gph@x.in', '{"provider":"google"}')`);
await q(`insert into public.users (id, name, email, phone, created_at) values
  ('${GHELD}', 'Gheld', null, null, '2026-06-01 00:00+00'),
  ('${HOLDER}', 'Holder', 'held@x.in', null, '2026-06-02 00:00+00'),
  ('${LEG}', 'Leg', 'leg@x.in', null, '2025-01-01 00:00+00'),
  ('${GPH}', 'Gph', 'gph@x.in', '+919811111111', '2026-06-03 00:00+00')`);
await q(`insert into private.legacy_email_rows (user_id) values ('${LEG}')`);
await q(`insert into public.turf_owners (turf_id, user_key, status, role, created_at) values
  ('${T(1)}', 'e:held@x.in', 'active', 'owner', now()), ('${T(2)}', 'e:leg@x.in', 'pending', 'manager', now()),
  ('${T(3)}', 'p:9811111111', 'active', 'owner', now()), ('${T(4)}', 'p:9800000004', 'active', 'owner', now())`);
await q(`insert into private.users_phone_changes (user_id) values ('${NONE}')`);
await q(`update public.users set phone = '+919800000004' where id = '${MIX}'`);
all = await q("select * from public.admin_people('tok')");
const who = (n) => all.find((r) => r.name === n);
eq(who("Gheld").turfs.map((t) => t.turf), ["Nashik One"], "a Google account's claim, by its Google email");
eq(who("Holder").turfs, [], "never on a row that only holds the email");
eq(who("Leg").turfs.map((t) => t.status), ["pending"], "an old-app email row's claim");
eq(who("Gph").turfs, [], "a typed phone on a Google row was never verified");
eq(who("Mix").turfs.map((t) => [t.turf, t.status]), [["Mumbai One", "active"], ["Sambhajinagar One", "revoked"]], "a phone account's claims, every status");
eq(who("Mix").likely_city, "mumbai", "an active claim (5) plus Ask cities (1) ties the games (6): the latest evidence wins");

// The fixes: a phone sign-in logged later no longer hides a Google sign-in from before the log.
const BOTH = "aaaaaaaa-0000-4000-8000-000000000003";
await q(`insert into auth.users (id, email, created_at, last_sign_in_at, raw_app_meta_data) values ('${BOTH}', 'both@x.in', '2026-09-01 00:00+00', '2026-10-01 00:00+00', '{"provider":"google","providers":["google"]}')`);
await q(`insert into public.users (id, name, email, phone, created_at) values ('${BOTH}', 'Both', 'both@x.in', '+919822222222', '2026-09-01 00:00+00')`);
await q(`insert into public.user_logins (user_id, method, created_at) values ('${BOTH}', 'phone', '2026-10-10 00:00+00'), ('${BOTH}', 'phone', '2026-10-22 00:00+00')`);
let both = (await q("select * from public.admin_people('tok')")).find((r) => r.name === "Both");
eq([both.logins, both.login_methods], [2, ["phone"]], "before the fixes: the Google sign-in is hidden by the phone ones");
const fixes = fs.readFileSync(FIXES, "utf8");
assert.doesNotMatch(fixes, /\bdrop\b|\bdelete\b|\btruncate\b/i, "fixes: nothing dropped or deleted");
assert.doesNotMatch(fixes, /[\u2014\u2013]/, "fixes: no em or en dashes");
await db.exec(fixes);
await db.exec(fixes);
both = (await q("select * from public.admin_people('tok')")).find((r) => r.name === "Both");
eq([both.logins, +both.last_login, both.login_methods], [3, +new Date("2026-10-22T00:00Z"), ["google", "phone"]], "after: both kinds, three sign-ins");
const goo = (await q("select * from public.admin_people('tok')")).find((r) => r.name === "Goo");
eq([goo.logins, goo.login_methods], [1, ["google"]], "a Google account with no log rows is unchanged");
// The Latest logins tile agrees.
const recent = await q("select method, logged_in_at from public.get_recent_logins(50, 'tok') where user_id = $1 order by logged_in_at", [BOTH]);
eq(recent.map((r) => r.method), ["google", "phone", "phone"], "Latest logins lists the Google sign-in too");
// A Google sign-in that is in the log is not counted twice.
await q(`update auth.users set last_sign_in_at = '2026-10-20 10:00+00' where id = '${BOTH}'`);
await q(`insert into public.user_logins (user_id, method, created_at) values ('${BOTH}', 'google', '2026-10-20 10:02+00')`);
both = (await q("select * from public.admin_people('tok')")).find((r) => r.name === "Both");
eq([both.logins, both.login_methods], [3, ["google", "phone"]], "a logged Google sign-in is not counted again");

console.log(`user_cities: ${passed} checks passed`);
