// Applies 20261105_admin_turf_views.sql (twice) to an in-memory Postgres
// (PGlite) with turf_daily_views exactly as 20261019_mytapturf.sql creates
// it, and checks admin_turf_views: only the site owner; one jsonb answer;
// each active turf's views over the last p_days India days, today included
// (28 by default, kept to 1 to 90); inactive turfs, turfs with no view and
// views outside the window left out; nobody else reads the views table;
// nothing about a person. Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/admin_turf_views.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261105_admin_turf_views.sql`;
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

// ── The file itself ────────────────────────────────────────
const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b|\binsert\b|\bupdate\b/i, "nothing destructive, nothing written");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
assert.doesNotMatch(sql, /create\s+(or\s+replace\s+)?(table|view)\b/i, "no table or view");
// The code, without its comments (the header names the admin's "No phone" list).
const code = sql.replace(/^\s*--.*$/gm, "");
assert.doesNotMatch(code, /public\.users|\b(email|phone)\w*|\buser_id\b|cron\.schedule/i, "no person, no job");
passed += 4;
eq([...sql.matchAll(/create or replace function public\.(\w+)\(/gi)].map((m) => m[1]), ["admin_turf_views"], "one function: admin_turf_views");

// ── What it reads, as production has it ────────────────────
const mytapturf = fs.readFileSync(`${M}/20261019_mytapturf.sql`, "utf8");
const views = mytapturf.match(/create table if not exists public\.turf_daily_views[\s\S]*?\);\s*alter table public\.turf_daily_views enable row level security;\s*revoke all on public\.turf_daily_views from anon, authenticated;/);
assert.ok(views, "turf_daily_views as 20261019_mytapturf.sql creates it");
await db.exec(`
create role anon; create role authenticated;
grant usage on schema public to anon, authenticated;
create table public.turfs (id uuid primary key, name text, is_active boolean default true);
grant select on public.turfs to anon, authenticated;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
${views[0]}
`);

const before = await q(`select proname, md5(prosrc) as h from pg_proc where pronamespace = 'public'::regnamespace order by proname`);
await db.exec(sql);
await db.exec(sql); // safe to run again
const after = await q(`select proname, md5(prosrc) as h from pg_proc where pronamespace = 'public'::regnamespace and proname <> 'admin_turf_views' order by proname`);
eq(after, before, "every function from before is as it was");
eq((await q(`select count(*)::int as n from pg_proc where proname = 'admin_turf_views'`))[0].n, 1, "no overload after running it twice");

// ── Fixture ────────────────────────────────────────────────
const T = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const turf = (n, active = true) => q(`insert into public.turfs (id, name, is_active) values ($1, $2, $3)`, [T(n), `Turf ${n}`, active]);
const view = (n, ago, count) =>
  q(`insert into public.turf_daily_views (turf_id, day, views) values ($1, (now() at time zone 'Asia/Kolkata')::date - $2::int, $3)`, [T(n), ago, count]);
await turf(1); await view(1, 0, 3); await view(1, 27, 2); await view(1, 28, 100); // the window's two ends; the day before it is out
await turf(2); await view(2, 5, 40);
await turf(3, false); await view(3, 0, 900); // inactive
await turf(4); await view(4, 0, 0); // a row with no views
await turf(5); // no views at all
await turf(6); await view(6, -1, 50); // tomorrow, India time: not yet a day of the window
await turf(7); await view(7, 89, 4); await view(7, 90, 6); // only for a long window
await q(`insert into public.turf_daily_views (turf_id, day, views) values ($1, (now() at time zone 'Asia/Kolkata')::date, 8)`, [T(99)]); // no such turf

const read = async (days) => {
  await db.exec(`set test.owner = 'yes'`);
  try {
    return (await q(days === undefined ? `select public.admin_turf_views('token') as r` : `select public.admin_turf_views('token', $1) as r`, days === undefined ? [] : [days]))[0].r;
  } finally {
    await db.exec(`set test.owner = 'no'`);
  }
};
const today = (await q(`select (now() at time zone 'Asia/Kolkata')::date::text as d`))[0].d;
const daysAgo = async (n) => (await q(`select ((now() at time zone 'Asia/Kolkata')::date - $1::int)::text as d`, [n]))[0].d;

// ── Only the site owner ────────────────────────────────────
await db.exec(`set test.owner = 'no'`);
await assert.rejects(q(`select public.admin_turf_views('token')`), (e) => e.code === "42501", "anyone else: not allowed (42501)");
passed++;
for (const role of ["anon", "authenticated"]) {
  ok((await q(`select has_function_privilege($1, 'public.admin_turf_views(text, integer)', 'execute') as p`, [role]))[0].p, `${role} may call it (the owner check decides)`);
  ok(!(await q(`select has_table_privilege($1, 'public.turf_daily_views', 'select') as p`, [role]))[0].p, `${role} still cannot read the views table`);
}
ok(!(await q(`select has_function_privilege('public', 'public.admin_turf_views(text, integer)', 'execute') as p`))[0].p, "public's default execute is revoked");

// ── The answer ─────────────────────────────────────────────
const d28 = await read();
eq(Object.keys(d28).sort(), ["days", "since", "today", "views"], "days, since, today and views, nothing else");
eq(d28.days, 28, "28 days by default");
eq(d28.today, today, "today is India's");
eq(d28.since, await daysAgo(27), "since is 27 India days before today (28 with today)");
eq(d28.views, { [T(1)]: 5, [T(2)]: 40 }, "active turfs with a view in the window: both ends counted, the day before out; inactive, no views, tomorrow and unknown turfs out");
eq((await read(28)).views, d28.views, "p_days 28 is the default");
eq((await read(1)).views, { [T(1)]: 3 }, "1 day: today only");
eq((await read(0)).days, 1, "0 is kept to 1");
eq((await read(-5)).days, 1, "a negative is kept to 1");
eq((await read(null)).days, 28, "null is 28");
const d90 = await read(1000);
eq(d90.days, 90, "1000 is kept to 90");
eq(d90.since, await daysAgo(89), "90 days: today and the 89 before");
eq(d90.views, { [T(1)]: 105, [T(2)]: 40, [T(7)]: 4 }, "90 days counts what 28 leaves out, and stops at its own first day");
await db.exec(`delete from public.turf_daily_views`);
eq((await read()).views, {}, "no views: an empty object, never null");

console.log(`admin_turf_views: ${passed} checks passed`);
