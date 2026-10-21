// Applies 20261021_accounts_usernames.sql, then 20261021_accounts_fixes.sql
// (twice), to an in-memory Postgres (PGlite) with stand-ins for Supabase's
// roles, auth schema, users, user_logins and the old log_user_login, and
// checks each fix. Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/accounts_fixes.check.mjs supabase/migrations/20261021_accounts_usernames.sql supabase/migrations/20261021_accounts_fixes.sql
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [BASE, FIXES] = process.argv.slice(2);
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
insert into private.app_secrets values ('live_write', 'L'||repeat('1', 63));
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb $$;
create table public.users (
  id uuid not null default gen_random_uuid() primary key,
  email varchar unique, password varchar, name varchar not null, phone varchar,
  role varchar default 'user' check (role in ('user','owner','admin')),
  is_verified boolean default false, created_at timestamptz default now(), updated_at timestamptz default now(),
  profile_image_url text, firebase_uid text unique, pin varchar, pin_attempts int default 0,
  pin_locked_until timestamptz, signup_context jsonb);
create unique index users_phone_key on public.users (phone) where phone is not null;
create table public.user_logins (id bigint generated always as identity primary key, user_id uuid not null,
  method text not null check (method in ('phone','google')), created_at timestamptz not null default now());
create table public.live_matches (code text primary key, match jsonb, rev bigint, status text, updated_at timestamptz default now());
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);

// The old public log_user_login, as in production before the fixes.
await db.exec(`
create function public.log_user_login(p_user_id uuid, p_method text) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_user_id is null or p_method is null or p_method not in ('phone', 'google') then return; end if;
  if p_method = 'google' and auth.uid() is distinct from p_user_id then return; end if;
  if p_method = 'phone' and not exists (select 1 from public.users where id = p_user_id) then return; end if;
  if exists (select 1 from public.user_logins where user_id = p_user_id and created_at > now() - interval '10 minutes') then return; end if;
  insert into public.user_logins (user_id, method) values (p_user_id, p_method);
end; $$;
grant execute on function public.log_user_login(uuid, text) to anon, authenticated;
`);

await db.exec(fs.readFileSync(BASE, "utf8"));

// State as of before the fixes: two legacy email rows (one real, one made
// later with a forged old created_at would only appear after the list is
// taken), a Google row with a typed phone and an old phone login, another
// without one.
await q(`insert into public.users (id, name, email, created_at) values ('33333333-3333-4333-8333-333333333333', 'Old', 'old@x.in', timestamptz '2025-11-26 17:00:00+00')`);
await q(`insert into auth.users values ('22222222-2222-4222-8222-222222222222', 'g@x.in'), ('88888888-8888-4888-8888-888888888888', 'h@x.in')`);
await q(`insert into public.users (id, name, email, phone) values
  ('22222222-2222-4222-8222-222222222222', 'Gita', 'g@x.in', '+919111111111'),
  ('88888888-8888-4888-8888-888888888888', 'Hari', 'h@x.in', '+919222222222')`);
await q(`insert into public.user_logins (user_id, method, created_at) values ('22222222-2222-4222-8222-222222222222', 'phone', timestamptz '2026-10-13 04:56:59+00')`);

const fixes = fs.readFileSync(FIXES, "utf8");
assert.doesNotMatch(fixes, /\bdrop\b|\bdelete\b|\btruncate\b/i, "no destructive keywords");
assert.doesNotMatch(fixes, /[\u2014\u2013]/, "no em or en dashes");
await db.exec(fixes);
await db.exec(fixes); // safe to run again

const KEY = (await one("select value from private.app_secrets where name = 'account'")).value;
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const resolve = (o) => rpc("account_resolve", ["key" in o ? o.key : KEY, o.kind, o.phone ?? null, o.uid ?? null, o.email ?? null, o.name ?? null, o.avatar ?? null, o.create ?? false, o.log ?? false]);
const reports = async (kind) => (await one("select count(*)::int n from private.account_reports where kind = $1", [kind])).n;

// Grants on the new objects.
for (const t of ["legacy_email_rows", "username_changes"]) {
  const r = await one(`select has_table_privilege('anon', 'private.${t}', 'select') s, has_table_privilege('anon', 'private.${t}', 'insert') i`);
  eq([r.s, r.i], [false, false], `anon has nothing on private.${t}`);
}
for (const f of ["private.report(text, jsonb)", "private.phone_logins_trusted_before()"]) {
  eq((await one(`select has_function_privilege('anon', '${f}', 'execute') x`)).x, false, `anon cannot run ${f}`);
}
eq((await q("select user_id from private.legacy_email_rows")).map((r) => r.user_id), ["33333333-3333-4333-8333-333333333333"], "legacy list taken from the rows there now");

// 1. Legacy email: only listed rows open; a planted old-looking row does not.
let r = await resolve({ kind: "google", uid: "44444444-4444-4444-8444-444444444444", email: "OLD@x.in", create: true });
eq([r.r, r.id], ["ok", "33333333-3333-4333-8333-333333333333"], "listed legacy row opens for its Google sign-in");
await resolve({ kind: "google", uid: "44444444-4444-4444-8444-444444444444", email: "old@x.in", create: true });
eq(await reports("google_on_legacy_email_row"), 1, "reported once, not on every sign-in");
// Anyone could insert a row with a victim's email and an old created_at.
await q(`insert into public.users (id, name, email, phone, created_at) values ('66666666-6666-4666-8666-666666666666', 'Planted', 'victim@x.in', '+919333333333', timestamptz '2024-01-01 00:00:00+00')`);
r = await resolve({ kind: "google", uid: "77777777-7777-4777-8777-777777777777", email: "victim@x.in", name: "Victim", create: true });
eq([r.r, r.id, r.email, r.name, r.created], ["ok", "77777777-7777-4777-8777-777777777777", null, "Victim", true], "planted row is not opened: own Google row, without the held email");
eq(await reports("google_email_held"), 1, "held email reported");
const attacker = await resolve({ kind: "phone", phone: "+919333333333" });
eq(attacker.id, "66666666-6666-4666-8666-666666666666", "the planter's phone only reaches the planted row");
eq(await resolve({ kind: "google", uid: "77777777-7777-4777-8777-777777777777", email: "victim@x.in" }).then((x) => x.id), "77777777-7777-4777-8777-777777777777", "and the victim keeps their own row next time");

// 2. Phone on a Google row: only a trusted earlier phone login opens it.
eq((await resolve({ kind: "phone", phone: "+919111111111", log: true })).r, "ok", "reviewed old phone login still opens");
eq(await resolve({ kind: "phone", phone: "+919222222222" }), { r: "conflict" }, "typed phone without a login: conflict");
// The public log can no longer fake a phone login...
await rpc("log_user_login", ["88888888-8888-4888-8888-888888888888", "phone"]);
eq((await one("select count(*)::int n from public.user_logins where user_id = '88888888-8888-4888-8888-888888888888'")).n, 0, "log_user_login records no phone sign-in");
// ...and one written later by any route is not trusted.
await q(`insert into public.user_logins (user_id, method) values ('88888888-8888-4888-8888-888888888888', 'phone')`);
eq(await resolve({ kind: "phone", phone: "+919222222222" }), { r: "conflict" }, "a phone login after the cutoff does not open a Google row");
eq(await reports("phone_on_google_row"), 1, "reported once");
// Google sign-ins are still logged for the signed-in user only.
await q("select set_config('test.uid', '88888888-8888-4888-8888-888888888888', false)");
await rpc("log_user_login", ["88888888-8888-4888-8888-888888888888", "google"]);
eq((await one("select count(*)::int n from public.user_logins where user_id = '88888888-8888-4888-8888-888888888888' and method = 'google'")).n, 0, "not within 10 minutes of the last login");
await q("delete from public.user_logins where user_id = '88888888-8888-4888-8888-888888888888'");
await rpc("log_user_login", ["88888888-8888-4888-8888-888888888888", "google"]);
eq((await one("select count(*)::int n from public.user_logins where user_id = '88888888-8888-4888-8888-888888888888' and method = 'google'")).n, 1, "Google sign-in logged");
await rpc("log_user_login", ["22222222-2222-4222-8222-222222222222", "google"]);
eq((await one("select count(*)::int n from public.user_logins where user_id = '22222222-2222-4222-8222-222222222222' and method = 'google'")).n, 0, "not for someone else");

// A phone changed through the API (anon update, before step 3) is not trusted.
await q(`insert into public.users (id, name, phone) values ('99999999-9999-4999-8999-999999999999', 'Ira', '+919444444444')`);
eq((await resolve({ kind: "phone", phone: "+919444444444" })).r, "ok", "untouched phone row opens");
await q(`update public.users set phone = '+919555555555' where id = '99999999-9999-4999-8999-999999999999'`);
eq(await resolve({ kind: "phone", phone: "+919555555555" }), { r: "conflict" }, "a number moved onto an account through the API: conflict");
eq(await reports("phone_changed_by_api"), 1, "reported");

// 4. A verified phone with no account is reported, once.
eq(await resolve({ kind: "phone", phone: "+919666666666" }), { r: "new" }, "no row");
await resolve({ kind: "phone", phone: "+919666666666" });
eq(await reports("phone_no_row"), 1, "reported once");
r = await resolve({ kind: "phone", phone: "+919666666666", create: true, name: "Jaya", log: true });
eq([r.r, r.created], ["ok", true], "sign-up still works");

// 5. Username changes: at most 3 in any 30 days.
const jaya = r.id;
eq((await rpc("username_set", [KEY, jaya, "jaya", null])).r, "ok", "first username is free");
for (const n of ["jaya1", "jaya2", "jaya3"]) eq((await rpc("username_set", [KEY, jaya, n, null])).r, "ok", `change to ${n}`);
eq(await rpc("username_set", [KEY, jaya, "jaya4", null]), { r: "limit" }, "fourth change in 30 days refused");
await q(`update private.username_changes set at = at - interval '31 days' where user_id = $1 and at = (select min(at) from private.username_changes where user_id = $1)`, [jaya]);
eq((await rpc("username_set", [KEY, jaya, "jaya4", null])).r, "ok", "allowed again once the oldest change is 30 days old");
eq(await rpc("username_set", [KEY, jaya, "jaya5", null]), { r: "limit" }, "and the window keeps rolling");
eq((await rpc("username_set", [KEY, jaya, null, false])).taggable, false, "the switch alone is never limited");
eq((await rpc("username_set", [KEY, jaya, "jaya4", true])).taggable, true, "same name with the switch is not a change");
eq((await one("select count(*)::int n from public.username_history where user_id = $1", [jaya])).n, 4, "every old name kept");

console.log(`accounts_fixes: ${passed} checks passed`);
