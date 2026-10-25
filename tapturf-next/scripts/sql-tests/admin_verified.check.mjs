// Applies 20261025_admin_verified.sql (twice) to an in-memory Postgres
// (PGlite) with stand-ins for Supabase's roles, auth schema and the tables
// it reads, and checks what admin_verified says each sign-in confirmed.
// Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/admin_verified.check.mjs supabase/migrations/20261025_admin_verified.sql
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [FILE] = process.argv.slice(2);
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema private;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null, provider text not null, identity_data jsonb not null);
create table public.users (
  id uuid not null default gen_random_uuid() primary key,
  email varchar unique, name varchar not null, phone varchar,
  role varchar default 'user', is_verified boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table public.user_logins (id bigint generated always as identity primary key, user_id uuid not null, method text not null, created_at timestamptz not null default now());
create table private.users_phone_changes (id bigint generated always as identity primary key, user_id uuid not null, at timestamptz not null default now(), old_hash text, new_hash text);
create function private.phone_logins_trusted_before() returns timestamptz language sql immutable set search_path = '' as $$ select timestamptz '2026-10-21 18:50:00+00' $$;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);

const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\bupdate\b|\binsert\b|\balter\b/i, "read only, nothing destructive");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
await db.exec(sql);
await db.exec(sql); // safe to run again

const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const G = U(1); // Google sign-up
const GU = U(2); // Google, but Google says the address isn't verified
const E = U(3); // old app email account, confirmed by link
const EN = U(4); // old app email account, never confirmed
const ED = U(5); // auth confirmed another address than the account's
const P = U(6); // phone, signed in since the log was trusted
const PO = U(7); // phone, only an old (untrusted) sign-in
const PC = U(8); // phone, trusted sign-in, number changed after it
const PB = U(9); // phone, number changed, then a trusted sign-in on the new one
const GP = U(10); // Google with a typed phone and no phone sign-in
const GL = U(11); // Google with a phone sign-in logged but no number on the account
const NONE = U(12); // users row only

await q(`insert into public.users (id, name, email, phone) values
  ('${G}', 'Gita', 'Gita@Gmail.com', null),
  ('${GU}', 'Guru', 'guru@x.in', null),
  ('${E}', 'Esha', 'e@x.in', null),
  ('${EN}', 'Neel', 'n@x.in', null),
  ('${ED}', 'Dev', 'dev@x.in', null),
  ('${P}', 'Prem', null, '+919876543210'),
  ('${PO}', 'Om', null, '+919876543211'),
  ('${PC}', 'Chetan', null, '+919876543212'),
  ('${PB}', 'Bina', null, '+919876543213'),
  ('${GP}', 'Gopal', 'gopal@gmail.com', '+919876543214'),
  ('${GL}', 'Lata', 'lata@gmail.com', null),
  ('${NONE}', 'Nil', null, null)`);
await q(`insert into auth.users values
  ('${G}', 'gita@gmail.com', '2026-10-20 10:00+00'),
  ('${GU}', 'guru@x.in', '2026-10-20 10:00+00'),
  ('${E}', 'e@x.in', '2025-01-02 00:00+00'),
  ('${EN}', 'n@x.in', null),
  ('${ED}', 'other@x.in', '2025-01-02 00:00+00'),
  ('${GP}', 'gopal@gmail.com', '2026-10-22 10:00+00'),
  ('${GL}', 'lata@gmail.com', '2026-10-22 10:00+00')`);
await q(`insert into auth.identities (user_id, provider, identity_data) values
  ('${G}', 'google', '{"email": "gita@gmail.com", "email_verified": true}'),
  ('${GU}', 'google', '{"email": "guru@x.in", "email_verified": false}'),
  ('${E}', 'email', '{"email": "e@x.in", "email_verified": true}'),
  ('${GP}', 'google', '{"email": "gopal@gmail.com", "email_verified": true}'),
  ('${GL}', 'google', '{"email": "lata@gmail.com", "email_verified": true}')`);
await q(`insert into public.user_logins (user_id, method, created_at) values
  ('${P}', 'phone', '2026-10-23 08:00+00'),
  ('${PO}', 'phone', '2026-10-10 08:00+00'),
  ('${PC}', 'phone', '2026-10-22 08:00+00'),
  ('${PB}', 'phone', '2026-10-24 08:00+00'),
  ('${G}', 'google', '2026-10-22 08:00+00'),
  ('${GL}', 'phone', '2026-10-23 08:00+00')`);
await q(`insert into private.users_phone_changes (user_id, at) values ('${PC}', '2026-10-23 08:00+00'), ('${PB}', '2026-10-23 08:00+00')`);

// Only the site owner.
await db.exec(`set test.owner = 'no'`);
await assert.rejects(q(`select * from public.admin_verified(null)`), /not allowed/);
passed++;
await db.exec(`set test.owner = 'yes'`);

const rows = await q(`select * from public.admin_verified('token')`);
const by = Object.fromEntries(rows.map((r) => [r.user_id, [r.email_by_google, r.email_confirmed, r.phone_by_code]]));
eq(rows.length, 12, "one row per account");
eq(by[G], [true, true, false], "Google sign-up: email by Google and confirmed, whatever the case of the stored address");
eq(by[GU], [false, true, false], "Google said not verified: not by Google (auth's confirmation still shows)");
eq(by[E], [false, true, false], "old email account confirmed by link");
eq(by[EN], [false, false, false], "never confirmed");
eq(by[ED], [false, false, false], "auth confirmed some other address");
eq(by[P], [false, false, true], "phone signed in with a checked code");
eq(by[PO], [false, false, false], "only a sign-in from before the log was trusted");
eq(by[PC], [false, false, false], "number changed after its checked sign-in");
eq(by[PB], [false, false, true], "number changed, then signed in on the new one");
eq(by[GP], [true, true, false], "a typed phone on a Google account is not checked");
eq(by[GL], [true, true, false], "no number on the account: no phone to vouch for");
eq(by[NONE], [false, false, false], "nothing known");

// Callable by the API roles; the owner check is inside.
const grants = await q(`select grantee from information_schema.routine_privileges where routine_name = 'admin_verified' and privilege_type = 'EXECUTE' order by grantee`);
ok(grants.some((g) => g.grantee === "anon") && grants.some((g) => g.grantee === "authenticated"), "anon and authenticated may call it");
ok(!grants.some((g) => g.grantee === "PUBLIC"), "not public");
const def = (await q(`select prosecdef, proconfig from pg_proc where proname = 'admin_verified'`))[0];
ok(def.prosecdef === true, "security definer");
ok(String(def.proconfig).includes("search_path="), "fixed search_path");

console.log(`admin_verified: ${passed} checks passed`);
