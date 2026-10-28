// Applies 20261028_turf_managers.sql (twice) to an in-memory Postgres (PGlite)
// with stand-ins for the tables and helpers it reads, and checks who
// turf_managers shows (active claims only, never pending, rejected or
// revoked; a username with tagging on; owners, then managers, then staff,
// the earliest first; one account once, whichever sign-ins claimed; at most
// 3 and how many more), that only the username and the tick come out, that
// anon can call it and nothing else, which pages the triggers queue, and
// that applying it queues every turf with an active claim (once per run).
// Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/turf_managers.check.mjs supabase/migrations/20261028_turf_managers.sql
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const FILE = process.argv[2];
assert.ok(FILE, "pass the migration file");
const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\s+from\b|\btruncate\b/i, "nothing dropped or deleted");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
assert.doesNotMatch(sql, /create or replace function public\.turf_page\b|owner_home|owner_dashboard/, "no existing body replaced");

const db = new PGlite();
const q = async (s, p) => (await db.query(s, p)).rows;
let passed = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

await db.exec(`
create role anon; create role authenticated;
create schema private;
grant usage on schema public to anon, authenticated;
create table private.dirty_log (keys text[], urgent boolean);
create function private.mark_dirty(p_keys text[], p_urgent boolean default false) returns void language sql as
  $$ insert into private.dirty_log values ((select array_agg(distinct x order by x) from unnest(p_keys) x where x is not null), p_urgent) $$;
create table public.turfs (id uuid primary key, slug text, is_active boolean default true);
create function private.turf_key(p_turf_id uuid) returns text language sql stable as
  $$ select 'turf:' || lower(coalesce(t.slug, t.id::text)) from public.turfs t where t.id = p_turf_id $$;
create table public.users (id uuid primary key, name text, phone text, email text);
create table public.usernames (user_id uuid primary key, username text not null unique, taggable boolean not null default true, updated_at timestamptz default now());
create table public.turf_owners (turf_id uuid not null, user_key text not null, user_id uuid, status text not null, via text default 'admin',
  name text, role text, created_at timestamptz default now(), decided_at timestamptz, primary key (turf_id, user_key));
create table private.account_google_links (id bigint generated always as identity primary key, auth_uid uuid, user_id uuid not null, ended_at timestamptz);
create table private.phone_links (id bigint generated always as identity primary key, user_id uuid not null, ended_at timestamptz);
create table private.ticked (user_id uuid primary key);
create function private.user_verified(p_user_id uuid) returns boolean language sql stable as
  $$ select exists (select 1 from private.ticked where user_id = p_user_id) $$;
create table private.key_accounts (user_key text primary key, user_id uuid);
create function private.account_for_key(p_key text) returns uuid language sql stable as
  $$ select user_id from private.key_accounts where user_key = p_key $$;
revoke all on public.usernames, public.users, public.turf_owners from anon, authenticated;
`);

const T = (n) => `aaaaaaaa-0000-4000-8000-00000000000${n}`;
const U = (n) => `bbbbbbbb-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
await q(`insert into public.turfs (id, slug, is_active) values ('${T(1)}', 'turf-one', true), ('${T(2)}', 'turf-two', true), ('${T(3)}', 'turf-off', false), ('${T(4)}', null, true)`);
for (let i = 1; i <= 9; i++) await q(`insert into public.users (id, name, phone, email) values ('${U(i)}', 'Person ${i}', '+9198000000${i}0', 'p${i}@x.in')`);
await q(`insert into public.usernames (user_id, username, taggable) values
  ('${U(1)}', 'owner_a', true), ('${U(2)}', 'manager_b', true), ('${U(3)}', 'staff_c', true), ('${U(4)}', 'hidden_d', false),
  ('${U(5)}', 'revoked_e', true), ('${U(6)}', 'pending_f', true), ('${U(7)}', 'norole_g', true), ('${U(9)}', 'oldkey_i', true)`);
await q(`insert into private.ticked values ('${U(2)}')`);
await q(`insert into private.key_accounts values ('e:old@x.in', '${U(9)}')`);

// A turf already claimed when the migration runs: its page may have been
// cached without the line (the read was missing), so applying queues it.
const T7 = "aaaaaaaa-0000-4000-8000-000000000007";
const U10 = "bbbbbbbb-0000-4000-8000-000000000010";
await q(`insert into public.turfs (id, slug) values ('${T7}', 'turf-seven')`);
await q(`insert into public.usernames (user_id, username) values ('${U10}', 'early_j')`);
await q(`insert into public.turf_owners (turf_id, user_key, user_id, status, role, decided_at) values
  ('${T7}', 'p:9800000100', '${U10}', 'active', 'owner', '2026-10-27'),
  ('${T7}', 'e:wait@x.in', null, 'pending', 'staff', null),
  ('${T(1)}', 'e:was@x.in', null, 'revoked', 'owner', '2026-10-01')`);

const applyLog = async () => { await db.exec(sql); const r = await q("select keys, urgent from private.dirty_log"); await q("truncate private.dirty_log"); return r; };
eq(await applyLog(), [{ keys: ["turf:turf-seven"], urgent: true }], "applying queues the page of each turf with an active claim, urgent (not pending or revoked ones)");
eq(await applyLog(), [{ keys: ["turf:turf-seven"], urgent: true }], "safe to run again: the same pages, queued again");

const managers = async (id) => (await q(`select public.turf_managers($1::uuid) j`, [id]))[0].j;
eq(await managers(T7), { managers: [{ u: "early_j", v: false }], more: 0 }, "a claim from before the migration is on the line");
const log = async () => { const r = await q("select keys, urgent from private.dirty_log"); await q("truncate private.dirty_log"); return r; };

eq(await managers(T(1)), { managers: [], more: 0 }, "no claims: nobody");
eq(await managers(null), { managers: [], more: 0 }, "null id: nobody");

// Turf one: an owner with a username, one without, a hidden one, a revoked, a pending, a rejected one.
await q(`insert into public.turf_owners (turf_id, user_key, user_id, status, role, decided_at) values
  ('${T(1)}', 'p:9800000010', '${U(1)}', 'active', 'owner', '2026-10-20'),
  ('${T(1)}', 'p:9800000080', '${U(8)}', 'active', 'owner', '2026-10-19'),
  ('${T(1)}', 'p:9800000040', '${U(4)}', 'active', 'owner', '2026-10-18'),
  ('${T(1)}', 'p:9800000050', '${U(5)}', 'revoked', 'owner', '2026-10-17'),
  ('${T(1)}', 'p:9800000060', '${U(6)}', 'pending', 'owner', null),
  ('${T(1)}', 'e:rej@x.in', '${U(7)}', 'rejected', 'owner', '2026-10-16')`);
await log();
eq(await managers(T(1)), { managers: [{ u: "owner_a", v: false }], more: 0 }, "only the active one with a public username");

// Roles order the line; the earliest decision first within a role; one account once, at its best role.
await q(`insert into public.turf_owners (turf_id, user_key, user_id, status, role, decided_at) values
  ('${T(1)}', 'p:9800000070', '${U(7)}', 'active', null, '2026-10-01'),
  ('${T(1)}', 'p:9800000030', '${U(3)}', 'active', 'staff', '2026-10-02'),
  ('${T(1)}', 'p:9800000020', '${U(2)}', 'active', 'staff', '2026-10-03'),
  ('${T(1)}', 'e:b@x.in', '${U(2)}', 'active', 'manager', '2026-10-25')`);
eq(await managers(T(1)), { managers: [{ u: "owner_a", v: false }, { u: "manager_b", v: true }, { u: "staff_c", v: false }], more: 1 },
  "owner, then manager (its better role of two sign-ins), then staff; the tick; one more");

// A claim from before claims named the account: the account its sign-in opens now; none, nobody.
await q(`insert into public.turf_owners (turf_id, user_key, user_id, status, role, decided_at) values
  ('${T(2)}', 'e:old@x.in', null, 'active', 'owner', now()), ('${T(2)}', 'e:gone@x.in', null, 'active', 'owner', now())`);
eq(await managers(T(2)), { managers: [{ u: "oldkey_i", v: false }], more: 0 }, "an old claim counts for the account its key opens");

// An inactive turf shows nobody.
await q(`insert into public.turf_owners (turf_id, user_key, user_id, status, role) values ('${T(3)}', 'p:9800000010', '${U(1)}', 'active', 'owner')`);
eq(await managers(T(3)), { managers: [], more: 0 }, "an inactive turf: nobody");

// Only u and v leave the database.
const keysOut = new Set((await managers(T(1))).managers.flatMap(Object.keys));
eq([...keysOut].sort(), ["u", "v"], "username and tick only");

// Callable by anon, which still can't read the tables.
await q("set role anon");
eq((await q(`select public.turf_managers('${T(2)}'::uuid) j`))[0].j.managers.length, 1, "anon can call it");
await assert.rejects(q("select username from public.usernames"), /permission denied/); passed++;
await assert.rejects(q("select private.managed_turf_keys(null)"), /permission denied/); passed++;
await q("reset role");
const fn = (await q(`select p.prosecdef, p.provolatile, p.proconfig from pg_proc p where p.proname = 'turf_managers'`))[0];
eq([fn.prosecdef, fn.provolatile, fn.proconfig], [true, "s", ['search_path=""']], "security definer, stable, empty search_path");
eq((await q(`select has_function_privilege('public', 'public.turf_managers(uuid)', 'execute') p`))[0].p, false, "not to PUBLIC");
await log();

// Freshness: username and tagging changes queue the pages of the turfs this account manages, urgent.
await q(`update public.usernames set username = 'owner_aa' where user_id = '${U(1)}'`);
eq(await log(), [{ keys: ["turf:turf-off", "turf:turf-one"], urgent: true }], "a new username: both its turfs");
await q(`update public.usernames set taggable = false where user_id = '${U(1)}'`);
eq(await log(), [{ keys: ["turf:turf-off", "turf:turf-one"], urgent: true }], "tagging off");
await q(`update public.usernames set taggable = false, updated_at = now() where user_id = '${U(1)}'`);
eq(await log(), [], "the same values again: nothing");
await q(`update public.usernames set username = 'pend_f' where user_id = '${U(6)}'`);
eq(await log(), [], "a pending claimant: nothing");
await q(`insert into public.usernames (user_id, username) values ('${U(8)}', 'late_h')`);
eq(await log(), [{ keys: ["turf:turf-one"], urgent: true }], "a first username");
await q(`update public.usernames set username = 'oldkey_ii' where user_id = '${U(9)}'`);
eq(await log(), [{ keys: ["turf:turf-two"], urgent: true }], "an old key's account");
// The tick's inputs: not urgent; a name change: nothing.
await q(`update public.users set phone = '+919800000099' where id = '${U(2)}'`);
eq(await log(), [{ keys: ["turf:turf-one"], urgent: false }], "a new number");
await q(`update public.users set name = 'Renamed' where id = '${U(2)}'`);
eq(await log(), [], "a name change: nothing");
await q(`insert into private.account_google_links (auth_uid, user_id) values (gen_random_uuid(), '${U(2)}')`);
eq(await log(), [{ keys: ["turf:turf-one"], urgent: false }], "a Google link");
await q(`update private.account_google_links set ended_at = now() where user_id = '${U(2)}'`);
eq(await log(), [{ keys: ["turf:turf-one"], urgent: false }], "a Google link ended");
await q(`insert into private.phone_links (user_id) values ('${U(3)}')`);
eq(await log(), [{ keys: ["turf:turf-one"], urgent: false }], "a proved number");
// Revoked: no longer theirs, so their username change touches no page.
await q(`update public.turf_owners set status = 'revoked' where user_id = '${U(3)}'`);
await log();
await q(`update public.usernames set username = 'staff_cc' where user_id = '${U(3)}'`);
eq(await log(), [], "after a revoke: nothing");
// A turf without a slug is queued by id.
await q(`insert into public.turf_owners (turf_id, user_key, user_id, status) values ('${T(4)}', 'p:9800000070', '${U(7)}', 'active')`);
await log();
await q(`update public.usernames set username = 'norole_gg' where user_id = '${U(7)}'`);
eq(await log(), [{ keys: [`turf:${T(4)}`, "turf:turf-one"], urgent: true }], "by id when there is no slug");

// An active claim whose role or account changes while it stays active (mark_owner_dirty returns early
// for that one): the page, urgent. A pending claim's role, or a status change alone: not from here.
await q(`update public.turf_owners set role = 'staff' where turf_id = '${T(4)}' and user_id = '${U(7)}'`);
eq(await log(), [{ keys: [`turf:${T(4)}`], urgent: true }], "a role change on an active claim");
await q(`update public.turf_owners set role = 'staff' where turf_id = '${T(4)}' and user_id = '${U(7)}'`);
eq(await log(), [], "the same role again: nothing");
await q(`update public.turf_owners set role = 'manager' where user_id = '${U(6)}'`);
eq(await log(), [], "a pending claim's role: nothing");
await q(`update public.turf_owners set user_id = '${U(9)}' where turf_id = '${T(2)}' and user_key = 'e:old@x.in'`);
eq(await log(), [{ keys: ["turf:turf-two"], urgent: true }], "an old claim given its account");
await q(`update public.turf_owners set status = 'revoked' where turf_id = '${T(4)}'`);
eq(await log(), [], "a status change alone is mark_owner_dirty's (not stood in here)");

// Within a role, the earliest decision first (no decision: when the claim was made); the
// count of more is only of people with a public username.
const T5 = "aaaaaaaa-0000-4000-8000-000000000005";
await q(`insert into public.turfs (id, slug) values ('${T5}', 'turf-five')`);
await q(`update public.usernames set taggable = true where user_id = '${U(1)}'`);
await q(`insert into public.turf_owners (turf_id, user_key, user_id, status, role, created_at, decided_at) values
  ('${T5}', 'p:9800000010', '${U(1)}', 'active', 'owner', '2026-10-01', '2026-10-27'),
  ('${T5}', 'p:9800000020', '${U(2)}', 'active', 'owner', '2026-10-26', null),
  ('${T5}', 'p:9800000040', '${U(4)}', 'active', 'owner', '2026-09-01', '2026-09-01'),
  ('${T5}', 'p:9800000080', '${U(8)}', 'active', 'owner', '2026-09-01', '2026-09-02')`);
await log();
const five = await managers(T5);
eq(five.managers.map((m) => m.u), ["late_h", "manager_b", "owner_aa"], "earliest first; no decision counts from the claim");
eq(five.more, 0, "the hidden owner is not counted in more");
eq(Object.keys(five).sort(), ["managers", "more"], "nothing else at the top");

// Linked sign-ins: a phone claim and a Google claim of one account, both active, are one name.
const T6 = "aaaaaaaa-0000-4000-8000-000000000006";
await q(`insert into public.turfs (id, slug) values ('${T6}', 'turf-six')`);
await q(`insert into public.turf_owners (turf_id, user_key, user_id, status, role, decided_at) values
  ('${T6}', 'p:9800000020', '${U(2)}', 'active', 'owner', '2026-10-20'),
  ('${T6}', 'e:b@x.in', '${U(2)}', 'active', 'owner', '2026-10-21')`);
eq(await managers(T6), { managers: [{ u: "manager_b", v: true }], more: 0 }, "one account, two sign-ins: once");

// Nothing new is callable by anon or authenticated but the read.
for (const f of ["private.managed_turf_keys(uuid)", "private.mark_manager_dirty()", "private.mark_manager_turf_dirty()"]) {
  eq((await q(`select has_function_privilege('anon', $1, 'execute') a, has_function_privilege('authenticated', $1, 'execute') b`, [f]))[0], { a: false, b: false }, `${f}: not public`);
}
eq((await q(`select has_function_privilege('authenticated', 'public.turf_managers(uuid)', 'execute') p`))[0].p, true, "signed-in callers too");
// Twice applied, six triggers: one of each (the header's after-apply query counts the same).
eq((await q(`select count(*)::int n from pg_trigger where not tgisinternal
               and (tgname like '%mark_managed_turfs%' or tgname = 'turf_owners_mark_manager_change')`))[0].n, 6, "six triggers, once each");

console.log(`turf_managers.check: ${passed} checks passed`);
