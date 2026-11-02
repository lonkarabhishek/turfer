// Applies 20261102_map_views.sql (twice) to an in-memory Postgres (PGlite) with
// stand-ins for what it reads (Supabase's roles, the account key check, the
// owner check, users and usernames, with production's column types: users.name
// is character varying), and checks the map counts: only with the account key;
// only views, taps and minis; unique only for a view; signed-in only for an
// account that exists, never a made-up one; the day is India's; two at once all
// count; the per-account rows; the admin read answers only the site owner, with
// today, 7 and 30 days, every one of 30 days and the signed-in people newest
// first (bounded, whether each account is still there, never a phone or an email); nobody reads the tables directly.
// Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/map_views.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261102_map_views.sql`;
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

// The parts of production the file reads: roles, the account key, the owner check, users and usernames.
await db.exec(`
create role anon; create role authenticated;
create schema private;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', 'server-key');
create function private.account_key_ok(p_key text) returns boolean language sql stable security definer set search_path = '' as
  $$ select p_key is not null and p_key = (select s.value from private.app_secrets s where s.name = 'account') $$;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
create table public.users (id uuid primary key, name character varying, email text, phone text);
create table public.usernames (user_id uuid primary key, username text not null unique, taggable boolean default true);
`);

const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b|\bupdate\s+(public|private)\./i, "nothing destructive, nothing rewritten");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
assert.doesNotMatch(sql, /cron\.schedule/i, "no job is added");
assert.doesNotMatch(sql, /\.(email|phone)\b/i, "the admin read never names a phone or an email column");
const before = await q(`select proname, md5(prosrc) as h from pg_proc where pronamespace in ('public'::regnamespace, 'private'::regnamespace) order by proname`);
await db.exec(sql);
await db.exec(sql); // safe to run again
const after = await q(`select proname, md5(prosrc) as h from pg_proc where pronamespace in ('public'::regnamespace, 'private'::regnamespace) and proname not in ('map_view_add', 'admin_map_usage') order by proname`);
eq(after, before, "every function from before is as it was");
passed += 4;

const ASHA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const RAVI = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const MEERA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000003";
const GONE = "aaaaaaaa-aaaa-4aaa-8aaa-000000000099";
await q(`insert into public.users (id, name, email, phone) values ($1, 'Asha Patil', 'asha@example.com', '+919000000001'), ($2, 'Ravi Kumar', null, '+919000000002'), ($3, 'Meera Iyer', 'meera@example.com', null)`, [ASHA, RAVI, MEERA]);
await q(`insert into public.usernames (user_id, username, taggable) values ($1, 'asha_p', true), ($2, 'meera', false)`, [ASHA, MEERA]);

const add = async (kind, unique = false, user = null, key = "server-key") => (await q(`select public.map_view_add($1, $2, $3, $4) as r`, [key, kind, unique, user]))[0].r;
const today = (await q(`select (now() at time zone 'Asia/Kolkata')::date::text as d`))[0].d;
const day = async (d = today) => (await q(`select views::int, visitors::int, signed_views::int, taps::int, minis::int from private.map_use_days where day = $1::date`, [d]))[0] ?? null;
const acct = async (u, d = today) => (await q(`select views, taps, minis from private.map_account_days where user_id = $1 and day = $2::date`, [u, d]))[0] ?? null;

// The key and the kind come first.
eq(await add("view", true, null, "wrong"), { r: "unavailable" }, "a wrong key counts nothing");
eq(await add("view", true, null, null), { r: "unavailable" }, "no key counts nothing");
eq(await add("open", true), { r: "bad" }, "only view, tap and mini");
eq(await add(null, true), { r: "bad" }, "no kind");
eq(await add("VIEW", true), { r: "bad" }, "the kind as sent, no guessing");
eq(await day(), null, "a refused call leaves no row");

// Guests: views, unique visitors, taps and minis.
eq(await add("view", true), { r: "ok", signed: false }, "a first view of the day: unique");
eq(await add("view", false), { r: "ok", signed: false }, "a view again");
eq(await add("view", null), { r: "ok", signed: false }, "unique null is not unique");
eq(await add("tap", true), { r: "ok", signed: false }, "a card tap (its unique flag means nothing)");
eq(await add("mini", true), { r: "ok", signed: false }, "a turf page's map opened");
eq(await day(), { views: 3, visitors: 1, signed_views: 0, taps: 1, minis: 1 }, "the day's counts; a tap or a mini is never a visitor");
eq((await q(`select count(*)::int as n from private.map_account_days`))[0].n, 0, "no account row for a guest");

// Signed in: the account the server resolved, and only one that exists.
eq(await add("view", true, ASHA), { r: "ok", signed: true }, "a signed-in view");
eq(await add("view", false, ASHA), { r: "ok", signed: true }, "and another");
eq(await add("tap", false, ASHA), { r: "ok", signed: true }, "a signed-in tap");
eq(await add("mini", false, RAVI), { r: "ok", signed: true }, "a signed-in turf page map, from someone else");
eq(await add("view", true, GONE), { r: "ok", signed: false }, "an account that isn't there counts as a guest's");
eq(await day(), { views: 6, visitors: 3, signed_views: 2, taps: 2, minis: 2 }, "signed-in views counted apart, a made-up account's not");
eq(await acct(ASHA), { views: 2, taps: 1, minis: 0 }, "Asha's day");
eq(await acct(RAVI), { views: 0, taps: 0, minis: 1 }, "Ravi's day: a mini only");
eq(await acct(GONE), null, "no row for an account that isn't there");
const [t] = await q(`select first_at <= last_at as ordered, day::text as d from private.map_account_days where user_id = $1`, [ASHA]);
ok(t.ordered && t.d === today, "first and last use, on India's day");

// Two at once all count.
await Promise.all([add("view", true), add("view", false, MEERA), add("tap", false, MEERA), add("view", true, MEERA)]);
eq(await day(), { views: 9, visitors: 5, signed_views: 4, taps: 3, minis: 2 }, "calls at the same time all count");
eq(await acct(MEERA), { views: 2, taps: 1, minis: 0 }, "and Meera's row");

// Earlier days, as the app would have left them (for the windows and the series).
const ago = async (n) => (await q(`select ($1::date - $2::int)::text as d`, [today, n]))[0].d;
for (const [n, views, visitors, signed, taps, minis] of [[1, 10, 4, 2, 3, 1], [6, 5, 2, 0, 1, 0], [7, 100, 50, 10, 20, 5], [29, 7, 7, 1, 0, 2], [30, 1000, 900, 0, 0, 0]]) {
  await q(`insert into private.map_use_days (day, views, visitors, signed_views, taps, minis) values ($1::date, $2, $3, $4, $5, $6)`, [await ago(n), views, visitors, signed, taps, minis]);
}
await q(`insert into private.map_account_days (user_id, day, views, taps, minis, first_at, last_at) values ($1, $2::date, 3, 0, 0, now() - interval '1 day 1 hour', now() - interval '1 day'), ($3, $4::date, 1, 1, 0, now() - interval '20 days', now() - interval '20 days')`, [RAVI, await ago(1), ASHA, await ago(20)]);
// A day in the future (a clock that went wrong) never counts in a window.
await q(`insert into private.map_use_days (day, views) values ($1::date + 1, 5000)`, [today]);

// Nobody but the server: no table grants, no direct reads.
for (const role of ["anon", "authenticated"]) {
  for (const tbl of ["private.map_use_days", "private.map_account_days"]) {
    for (const p of ["select", "insert", "update"]) ok(!(await q(`select has_table_privilege($1, $2, $3) as p`, [role, tbl, p]))[0].p, `${role} cannot ${p} ${tbl}`);
  }
}
for (const fn of ["map_view_add(text,text,boolean,uuid)", "admin_map_usage(text,integer)"]) {
  const grants = await q(`select grantee from information_schema.routine_privileges where specific_name ~ $1 and privilege_type = 'EXECUTE'`, [`^${fn.split("(")[0]}_[0-9]+$`]);
  ok(grants.some((g) => g.grantee === "anon") && grants.some((g) => g.grantee === "authenticated") && !grants.some((g) => g.grantee === "PUBLIC"), `${fn}: anon and authenticated may call it (the check is inside), PUBLIC not`);
  const def = (await q(`select prosecdef, proconfig from pg_proc where oid = $1::regprocedure`, [`public.${fn}`]))[0];
  ok(def.prosecdef === true && String(def.proconfig).includes('search_path=""'), `${fn}: security definer with an empty search_path`);
}
for (const name of ["map_view_add", "admin_map_usage"]) eq((await q(`select count(*)::int as n from pg_proc where proname = $1`, [name]))[0].n, 1, `${name}: no overload after running it twice`);
// As anon, through the function only (the key still gates it).
await db.exec(`set role anon`);
eq((await q(`select public.map_view_add('server-key', 'tap', false, null) as r`))[0].r, { r: "ok", signed: false }, "anon may call it with the key");
await assert.rejects(q(`select * from private.map_use_days`), /permission denied/);
await assert.rejects(q(`select * from private.map_account_days`), /permission denied/);
passed += 2;
await db.exec(`reset role`);

// The admin read: the site owner only.
await db.exec(`set test.owner = 'no'`);
await assert.rejects(q(`select public.admin_map_usage(null)`), /not allowed/);
await assert.rejects(q(`select public.admin_map_usage('t', 10)`), /not allowed/);
passed += 2;
await db.exec(`set test.owner = 'yes'`);
const usage = async (limit) => (await q(limit === undefined ? `select public.admin_map_usage('t') as u` : `select public.admin_map_usage('t', $1) as u`, limit === undefined ? [] : [limit]))[0].u;
const u = await usage();
eq(u.today, today, "today is India's day");
eq(u.since, await ago(30), "the first day counted");
const n = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)]));
eq(n(u.totals.today), { views: 9, visitors: 5, signed_views: 4, signed_people: 3, taps: 4, minis: 2 }, "today (the anon tap included)");
eq(n(u.totals.d7), { views: 24, visitors: 11, signed_views: 6, signed_people: 3, taps: 8, minis: 3 }, "7 days: today and the 6 before, not day 7 or the future");
eq(n(u.totals.d30), { views: 131, visitors: 68, signed_views: 17, signed_people: 3, taps: 28, minis: 10 }, "30 days: today and the 29 before, not day 30 or the future");
eq(u.daily.length, 30, "every one of 30 days");
eq(u.daily[0].day, await ago(29), "oldest first");
eq(u.daily[29].day, today, "today last");
eq(u.daily.filter((d) => Number(d.views) === 0).length, 25, "a day with none is a 0");
eq(n({ v: u.daily[28].views, s: u.daily[28].signed_views, t: u.daily[28].taps }), { v: 10, s: 2, t: 3 }, "yesterday's numbers");
eq(u.people_total, 3, "three people used it");
eq(u.people.map((p) => p.user_id), [MEERA, RAVI, ASHA], "most recent use first (Meera's views, then Ravi's mini, then Asha's tap)");
const asha = u.people.find((p) => p.user_id === ASHA);
eq({ name: asha.name, username: asha.username, views: Number(asha.views), taps: Number(asha.taps), minis: Number(asha.minis), days: asha.days }, { name: "Asha Patil", username: "asha_p", views: 3, taps: 2, minis: 0, days: 2 }, "Asha: every day added up, with her name and username");
const ravi = u.people.find((p) => p.user_id === RAVI);
eq({ name: ravi.name, username: ravi.username, views: Number(ravi.views), minis: Number(ravi.minis), days: ravi.days }, { name: "Ravi Kumar", username: null, views: 3, minis: 1, days: 2 }, "Ravi: no username");
ok(Date.parse(asha.first_at) < Date.parse(asha.last_at), "first use before last");
eq(Object.keys(asha).sort(), ["days", "first_at", "known", "last_at", "minis", "name", "taps", "user_id", "username", "views"], "the person's fields, and only those");
ok(u.people.every((p) => p.known === true), "every account here is in users");
const text = JSON.stringify(u);
ok(!/@example\.com|\+9190000/.test(text), "no email or phone anywhere in the answer");
eq((await usage(1)).people.map((p) => p.user_id), [MEERA], "bounded by p_limit, the most recent kept");
eq((await usage(1)).people_total, 3, "with how many there are in all");
eq((await usage(0)).people.length, 1, "at least one");
eq((await usage(5000)).people.length, 3, "never over 1000 (here, all three)");
// An erased account's rows still read, with no name, and say it is gone; an account with a blank name (users.name is
// not null in production, but an old row can hold '') and no username is still there.
const NONAME = "aaaaaaaa-aaaa-4aaa-8aaa-000000000004";
await q(`insert into public.users (id, name, email, phone) values ($1, '', null, '+919000000004')`, [NONAME]);
await q(`insert into private.map_account_days (user_id, day, views) values ($1, $2::date, 1), ($3, $2::date, 1)`, [GONE, today, NONAME]);
const later = await usage();
const gone = later.people.find((p) => p.user_id === GONE);
eq([gone?.name, gone?.username, gone?.known], [null, null, false], "an account no longer in users shows no name and is not known");
const noname = later.people.find((p) => p.user_id === NONAME);
eq([noname?.name, noname?.username, noname?.known], ["", null, true], "an account with a blank name and no username is known (it has a row in the people list)");
ok(!/\+9190000/.test(JSON.stringify(later)), "still no phone");

// Before anything was counted: zeros, an empty list, no since.
const fresh = new PGlite();
await fresh.exec(`create role anon; create role authenticated; create schema private;
create function private.account_key_ok(p_key text) returns boolean language sql stable as $$ select p_key = 'server-key' $$;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as $$ select true $$;
create table public.users (id uuid primary key, name character varying);
create table public.usernames (user_id uuid primary key, username text not null unique, taggable boolean default true);`);
await fresh.exec(sql);
const e = (await fresh.query(`select public.admin_map_usage(null) as u`)).rows[0].u;
eq([e.since, e.people, e.people_total, n(e.totals.d30), e.daily.length], [null, [], 0, { views: 0, visitors: 0, signed_views: 0, signed_people: 0, taps: 0, minis: 0 }, 30], "an empty database answers zeros");

console.log(`map_views: ${passed} checks passed`);
