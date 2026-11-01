// Applies 20261021_live_matches.sql, 20261026_admin_live_links.sql,
// 20261029_live_link_starts.sql and then 20261101_live_views.sql (twice) to
// an in-memory Postgres (PGlite) with stand-ins for what they read
// (Supabase's roles, the key table, the owner check, users and usernames,
// pg_cron), and checks the view counts: a view is counted only with the live
// write key and only for a link showing a score (live or finished, not a
// stop marker, a link turned off or an expired one); unique views add to
// viewers, others only to views; two views at once both count; the counts
// stay after the hourly job clears the match and after a stop; the count
// read needs the key; the admin read answers only the site owner; nobody
// reads the table directly. Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/live_views.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261101_live_views.sql`;
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

// The parts of production the files read.
await db.exec(`
create role anon; create role authenticated;
create schema private;
create schema cron;
create function cron.schedule(name text, at text, body text) returns bigint language sql as $$ select 1::bigint $$;
create table private.app_secrets (name text primary key, value text not null);
create table public.users (id uuid primary key, name character varying, email text, phone text);
create table public.usernames (user_id uuid primary key, username text not null unique, taggable boolean default true);
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);
await db.exec(fs.readFileSync(`${M}/20261021_live_matches.sql`, "utf8"));
await db.exec(fs.readFileSync(`${M}/20261026_admin_live_links.sql`, "utf8"));
// As 20261021_accounts_usernames.sql defines it.
await db.exec(`
create or replace function private.live_key_ok(p_key text) returns boolean language sql stable security definer set search_path = '' as $$
  select p_key is not null and p_key = (select s.value from private.app_secrets s where s.name = 'live_write');
$$;
update private.app_secrets set value = 'live-key' where name = 'live_write';
`);
await db.exec(fs.readFileSync(`${M}/20261029_live_link_starts.sql`, "utf8"));

const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b/i, "nothing destructive, nothing rewritten");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
assert.doesNotMatch(sql, /function\s+public\.(live_match_|live_link_|admin_live_links|admin_live_matches)/i, "no existing live function is touched");
assert.doesNotMatch(sql, /cron\.schedule/i, "no job is added or changed");
const before = (await q(`select proname, md5(prosrc) as h from pg_proc where proname ~ '^(live_|admin_live)' order by proname`));
await db.exec(sql);
await db.exec(sql); // safe to run again
const after = (await q(`select proname, md5(prosrc) as h from pg_proc where proname ~ '^(live_|admin_live)' and proname not in ('live_view_add', 'live_view_count', 'admin_live_views') order by proname`));
eq(after, before, "every function from before is as it was");
passed += 5;

const SECRET = "ab".repeat(32);
const NET = "0".repeat(32);
const match = JSON.stringify({ v: 1, id: "m1", createdAt: 1, setup: { teamA: "Kothrud Kings", teamB: "Baner Blasters", overs: 6 }, events: [{ type: "ball" }] });
const put = async (code, rev = 1, status = "live") =>
  (await q(`select public.live_match_put('live-key', $1, $2, $3::jsonb, $4, $5, $6) as r`, [code, SECRET, match, status, rev, NET]))[0].r;
const add = async (code, unique, key = "live-key") => (await q(`select public.live_view_add($1, $2, $3) as r`, [key, code, unique]))[0].r;
const count = async (code, key = "live-key") => (await q(`select public.live_view_count($1, $2) as r`, [key, code]))[0].r;
const views = (n, v) => ({ r: "ok", views: n, viewers: v });

eq((await put("aaaaaaaaaaaa")).r, "ok", "a live link");
eq((await put("bbbbbbbbbbbb", 1, "done")).r, "ok", "a finished one");

// The key comes first.
eq(await add("aaaaaaaaaaaa", true, "wrong"), { r: "unavailable" }, "a wrong key counts nothing");
eq(await add("aaaaaaaaaaaa", true, null), { r: "unavailable" }, "no key counts nothing");
eq(await count("aaaaaaaaaaaa", "wrong"), { r: "unavailable" }, "the count needs the key too");
eq(await count("aaaaaaaaaaaa"), views(0, 0), "no views yet: 0 and 0");
eq(await add("AAAA", true), { r: "bad" }, "a code that isn't one");
eq(await add(null, true), { r: "bad" }, "no code");
eq(await count("AAAA"), { r: "bad" }, "the count checks the code");

// Views and unique viewers.
eq(await add("aaaaaaaaaaaa", true), views(1, 1), "a first view: unique");
eq(await add("aaaaaaaaaaaa", false), views(2, 1), "a view again: views only");
eq(await add("aaaaaaaaaaaa", null), views(3, 1), "unique null is not unique");
eq(await add("aaaaaaaaaaaa", true), views(4, 2), "another browser");
eq(await count("aaaaaaaaaaaa"), views(4, 2), "the count reads the same");
eq(await add("bbbbbbbbbbbb", false), views(1, 0), "a finished link's first view, not unique: viewers stays at most views");
eq(await count("bbbbbbbbbbbb"), views(1, 0), "and its count");
// Two at once both count.
await Promise.all([add("bbbbbbbbbbbb", true), add("bbbbbbbbbbbb", true), add("bbbbbbbbbbbb", false)]);
eq(await count("bbbbbbbbbbbb"), views(4, 2), "views at the same time all count");

// Only links showing a score.
eq(await add("cccccccccccc", true), { r: "none" }, "a link with no row (waiting for its first send)");
eq((await q(`select public.live_match_stop('live-key', 'dddddddddddd', $1) as r`, [SECRET]))[0].r, "ok", "a stop before the first write leaves a marker");
eq(await add("dddddddddddd", true), { r: "none" }, "a stop marker shows no score");
eq(await count("cccccccccccc"), views(0, 0), "nothing was kept for them");
eq((await q(`select count(*)::int as n from private.live_link_views where code in ('cccccccccccc', 'dddddddddddd')`))[0].n, 0, "no row either");

// Kept for later: a stop and the 30-day expiry clear the match, never the counts.
eq((await q(`select public.live_match_stop('live-key', 'aaaaaaaaaaaa', $1) as r`, [SECRET]))[0].r, "ok", "the scorer turns the first link off");
eq(await add("aaaaaaaaaaaa", true), { r: "none" }, "a link turned off is not viewed any more");
eq(await count("aaaaaaaaaaaa"), views(4, 2), "its counts stay");
// The hourly job's statement, as 20261021_live_matches.sql schedules it.
await q(`update public.live_matches set updated_at = now() - interval '31 days' where code = 'bbbbbbbbbbbb'`);
await q(`update public.live_matches set match = null, status = 'expired', rev = rev + 1 where match is not null and updated_at < now() - interval '30 days'`);
eq((await q(`select status from public.live_matches where code = 'bbbbbbbbbbbb'`))[0].status, "expired", "the job cleared the finished match");
eq(await add("bbbbbbbbbbbb", true), { r: "none" }, "an expired link is not viewed any more");
eq(await count("bbbbbbbbbbbb"), views(4, 2), "its counts stay too");

// A closed link (live, 2 hours without an update) still shows its last score: still viewed.
eq((await put("eeeeeeeeeeee")).r, "ok", "another live link");
await q(`update public.live_matches set updated_at = now() - interval '3 hours' where code = 'eeeeeeeeeeee'`);
eq(await add("eeeeeeeeeeee", true), views(1, 1), "a link closed for want of updates still shows its score: counted");

// Nobody but the server: no table grants, no direct reads.
for (const role of ["anon", "authenticated"]) {
  for (const p of ["select", "insert", "update"]) ok(!(await q(`select has_table_privilege($1, 'private.live_link_views', $2) as p`, [role, p]))[0].p, `${role} cannot ${p} the table`);
}
for (const fn of ["live_view_add(text,text,boolean)", "live_view_count(text,text)", "admin_live_views(text)"]) {
  const grants = await q(`select grantee from information_schema.routine_privileges where specific_name ~ $1 and privilege_type = 'EXECUTE'`, [`^${fn.split("(")[0]}_[0-9]+$`]);
  ok(grants.some((g) => g.grantee === "anon") && !grants.some((g) => g.grantee === "PUBLIC"), `${fn}: anon may call it (the check is inside), PUBLIC not`);
  const def = (await q(`select prosecdef, proconfig from pg_proc where oid = $1::regprocedure`, [`public.${fn}`]))[0];
  ok(def.prosecdef === true && String(def.proconfig).includes("search_path=\"\""), `${fn}: security definer with an empty search_path`);
}
const [{ n: adds }] = await q(`select count(*)::int as n from pg_proc where proname = 'live_view_add'`);
eq(adds, 1, "no overload after running it twice");

// The admin read: the site owner only.
await db.exec(`set test.owner = 'no'`);
await assert.rejects(q(`select * from public.admin_live_views(null)`), /not allowed/);
await assert.rejects(q(`select * from public.admin_live_views('t')`), /not allowed/);
passed += 2;
await db.exec(`set test.owner = 'yes'`);
const outCols = async (name) =>
  (await q(`select parameter_name from information_schema.parameters where specific_name ~ $1 and parameter_mode = 'OUT' order by ordinal_position`, [`^${name}_[0-9]+$`])).map((r) => r.parameter_name);
eq(await outCols("admin_live_views"), ["code", "views", "viewers", "first_viewed_at", "last_viewed_at"], "the admin read's columns");
const rows = await q(`select code, views::int as views, viewers::int as viewers, first_viewed_at, last_viewed_at from public.admin_live_views('t')`);
eq(rows.map((r) => [r.code, r.views, r.viewers]).sort(), [["aaaaaaaaaaaa", 4, 2], ["bbbbbbbbbbbb", 4, 2], ["eeeeeeeeeeee", 1, 1]], "every viewed link, cleared ones included");
eq(rows[0].code, "eeeeeeeeeeee", "most recently viewed first");
ok(rows.every((r) => r.first_viewed_at instanceof Date && r.last_viewed_at >= r.first_viewed_at), "with when each was first and last viewed");
// The links list still reads as before (its function is untouched); the app joins the two by code.
const links = (await q(`select code, status from public.admin_live_links2('t')`)).map((r) => r.code);
ok(rows.every((r) => links.includes(r.code)), "every viewed link is in the admin's list of links");
const cols = await q(`select column_name from information_schema.columns where table_schema = 'private' and table_name = 'live_link_views' order by ordinal_position`);
eq(cols.map((c) => c.column_name), ["code", "views", "viewers", "first_viewed_at", "last_viewed_at"], "nothing about who viewed: no id, address, hash or agent");

console.log(`live_views: ${passed} checks passed`);
