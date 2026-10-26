// Applies 20261025_admin_verified.sql (twice) to an in-memory Postgres
// (PGlite) with stand-ins for Supabase's roles, auth schema and the tables
// it reads, and checks what admin_verified says each sign-in confirmed,
// and what account_phone_checked records. Never touches a real database.
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
create table private.legacy_email_rows (user_id uuid primary key);
create function private.phone_logins_trusted_before() returns timestamptz language sql immutable set search_path = '' as $$ select timestamptz '2026-10-21 18:50:00+00' $$;
create function private.account_key_ok(p_key text) returns boolean language sql stable as $$ select p_key = 'server-key' $$;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);

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
const L = U(13); // old-app row a Google sign-in lands on (its Google user LG has no row)
const LG = U(14); // that Google auth user
const LX = U(15); // old-app row, but the Google user with its address has a row of its own (LXG)
const LXG = U(16);
const GH = U(17); // Google account made without its address (another row held it)
const PS = U(18); // phone, only ever restored from a session (account_phone_checked)

// Everything as it stands before the migration: the backfill reads it.
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
  ('${NONE}', 'Nil', null, null),
  ('${L}', 'Leela', 'Leela@Gmail.com', null),
  ('${LX}', 'Lax', 'lax@gmail.com', null),
  ('${LXG}', 'Lax two', 'lax2@gmail.com', null),
  ('${GH}', 'Hari', null, null),
  ('${PS}', 'Sita', null, '+919876543215')`);
await q(`insert into private.legacy_email_rows values ('${L}'), ('${LX}')`);
await q(`insert into auth.users values
  ('${G}', 'gita@gmail.com', '2026-10-20 10:00+00'),
  ('${GU}', 'guru@x.in', '2026-10-20 10:00+00'),
  ('${E}', 'e@x.in', '2025-01-02 00:00+00'),
  ('${EN}', 'n@x.in', null),
  ('${ED}', 'other@x.in', '2025-01-02 00:00+00'),
  ('${GP}', 'gopal@gmail.com', '2026-10-22 10:00+00'),
  ('${GL}', 'lata@gmail.com', '2026-10-22 10:00+00'),
  ('${LG}', 'leela@gmail.com', '2026-10-22 10:00+00'),
  ('${LXG}', 'lax@gmail.com', '2026-10-22 10:00+00'),
  ('${GH}', 'gita@gmail.com', '2026-10-23 10:00+00')`);
await q(`insert into auth.identities (user_id, provider, identity_data) values
  ('${G}', 'google', '{"email": "gita@gmail.com", "email_verified": true}'),
  ('${GU}', 'google', '{"email": "guru@x.in", "email_verified": false}'),
  ('${E}', 'email', '{"email": "e@x.in", "email_verified": true}'),
  ('${GP}', 'google', '{"email": "gopal@gmail.com", "email_verified": true}'),
  ('${GL}', 'google', '{"email": "lata@gmail.com", "email_verified": true}'),
  ('${LG}', 'google', '{"email": "leela@gmail.com", "email_verified": true}'),
  ('${LXG}', 'google', '{"email": "lax@gmail.com", "email_verified": true}'),
  ('${GH}', 'google', '{"email": "gita@gmail.com", "email_verified": true}')`);
await q(`insert into public.user_logins (user_id, method, created_at) values
  ('${P}', 'phone', '2026-10-23 08:00+00'),
  ('${PO}', 'phone', '2026-10-10 08:00+00'),
  ('${PC}', 'phone', '2026-10-22 08:00+00'),
  ('${PB}', 'phone', '2026-10-24 08:00+00'),
  ('${G}', 'google', '2026-10-22 08:00+00'),
  ('${GL}', 'phone', '2026-10-23 08:00+00')`);
await q(`insert into private.users_phone_changes (user_id, at) values ('${PC}', '2026-10-23 08:00+00'), ('${PB}', '2026-10-23 08:00+00')`);

const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b/i, "nothing destructive");
assert.doesNotMatch(sql.replace(/^--.*$/gm, ""), /\bupdate\s+public\./i, "no rows of public tables changed");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
await db.exec(sql);
await db.exec(sql); // safe to run again
passed++;

// The backfill: trusted phone sign-ins on the number the account still has.
const backfilled = (await q(`select user_id from private.phone_verified order by user_id`)).map((r) => r.user_id);
eq(backfilled, [P, PB], "filled from trusted phone sign-ins whose number hasn't changed since");

// account_phone_checked: server key, own number, at most one write a day.
const check = async (key, id, phone) => (await q(`select public.account_phone_checked($1, $2, $3) as r`, [key, id, phone]))[0].r.r;
eq(await check("wrong", PS, "+919876543215"), "unavailable", "needs the server key");
eq(await check("server-key", PS, "9876543215"), "bad", "a number in another form");
eq(await check("server-key", PS, "+919876543299"), "other", "not the account's own number");
eq(await check("server-key", GP, "+919876543214") === "ok", true, "a number typed on a Google account, once its owner signs in by phone");
eq(await check("server-key", PS, "+919876543215"), "ok");
const at1 = (await q(`select at from private.phone_verified where user_id = $1`, [PS]))[0].at;
await check("server-key", PS, "+919876543215");
const at2 = (await q(`select at from private.phone_verified where user_id = $1`, [PS]))[0].at;
eq(String(at1), String(at2), "the same day: not written again");
await q(`update private.phone_verified set at = now() - interval '2 days' where user_id = $1`, [PS]);
await check("server-key", PS, "+919876543215");
ok((await q(`select at > now() - interval '1 minute' as fresh from private.phone_verified where user_id = $1`, [PS]))[0].fresh, "a day later: the time moves on");
const noPhone = await check("server-key", NONE, "+919876543216");
eq(noPhone, "other", "an account with no number");

// Only the site owner.
await db.exec(`set test.owner = 'no'`);
await assert.rejects(q(`select * from public.admin_verified(null)`), /not allowed/);
passed++;
await db.exec(`set test.owner = 'yes'`);

const read = async () => {
  const rows = await q(`select * from public.admin_verified('token')`);
  return { rows, by: Object.fromEntries(rows.map((r) => [r.user_id, [r.email_by_google, r.email_confirmed, r.phone_by_code]])) };
};
let { rows, by } = await read();
eq(rows.length, 17, "one row per account");
eq(rows.map((r) => r.user_id), [...rows.map((r) => r.user_id)].sort(), "ordered by id, so pages are stable");
eq(by[G], [true, true, false], "Google sign-up: email by Google and confirmed, whatever the case of the stored address");
eq(by[GU], [false, true, false], "Google said not verified: not by Google (auth's confirmation still shows)");
eq(by[E], [false, true, false], "old email account confirmed by link");
eq(by[EN], [false, false, false], "never confirmed");
eq(by[ED], [false, false, false], "auth confirmed some other address");
eq(by[P], [false, false, true], "phone signed in with a checked code");
eq(by[PO], [false, false, false], "only a sign-in from before the log was trusted");
eq(by[PC], [false, false, false], "number changed after its checked sign-in");
eq(by[PB], [false, false, true], "number changed, then signed in on the new one");
eq(by[GP], [true, true, true], "Google account whose number was then checked by a phone sign-in");
eq(by[GL], [true, true, false], "no number on the account: no phone to vouch for");
eq(by[NONE], [false, false, false], "nothing known");
eq(by[L], [true, true, false], "old-app row a Google sign-in lands on");
eq(by[LX], [false, false, false], "old-app row whose address's Google user has a row of its own: that sign-in lands there, not here");
eq(by[LXG][0], false, "and that row holds another address than its Google identity");
eq(by[GH], [true, false, false], "made without its address (another row holds it): Google verified it, there is no address here to confirm");
eq(by[PS], [false, false, true], "restored from a session with a checked phone token");

// The sign-in log is cleared after 12 months; the check stays.
await q(`delete from public.user_logins where user_id = $1`, [P]);
({ by } = await read());
eq(by[P], [false, false, true], "still verified once the old sign-in is cleared from the log");
// A new number: the old check no longer matches it.
await q(`update public.users set phone = '+919876500000' where id = $1`, [PS]);
({ by } = await read());
eq(by[PS][2], false, "a changed number isn't covered by the old check");

// Callable by the API roles; the checks are inside.
for (const fn of ["admin_verified", "account_phone_checked"]) {
  const grants = await q(`select grantee from information_schema.routine_privileges where routine_name = $1 and privilege_type = 'EXECUTE'`, [fn]);
  ok(grants.some((g) => g.grantee === "anon") && grants.some((g) => g.grantee === "authenticated"), `${fn}: anon and authenticated may call it`);
  ok(!grants.some((g) => g.grantee === "PUBLIC"), `${fn}: not public`);
  const def = (await q(`select prosecdef, proconfig from pg_proc where proname = $1`, [fn]))[0];
  ok(def.prosecdef === true && String(def.proconfig).includes("search_path="), `${fn}: security definer with a fixed search_path`);
}
const tableGrants = await q(`select grantee from information_schema.role_table_grants where table_schema = 'private' and table_name = 'phone_verified' and grantee in ('anon', 'authenticated', 'PUBLIC')`);
eq(tableGrants.length, 0, "the table is closed to the API roles");

console.log(`admin_verified: ${passed} checks passed`);
