// Builds turf_daily_views as 20261019_mytapturf.sql creates it (its own
// statements, read from that file) beside a stand-in turfs table, then
// applies 20261101_map_turf_heat.sql (twice) to an in-memory Postgres
// (PGlite) and checks the levels: only active turfs with a map point and 3
// or more views over the last 30 India days count; levels run 1 to 5 by rank
// (the least viewed 1, the most 5, ties share one); the answer says turf_id
// and level and nothing else (no count); anon may call it while the views
// table stays closed to anon; it is a security definer with an empty
// search_path; nothing else is touched. Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/map_turf_heat.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: map_turf_heat.check.mjs <supabase/migrations>");
const FILE = `${M}/20261101_map_turf_heat.sql`;
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

// ── The file itself ────────────────────────────────────────
const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b/i, "nothing destructive, nothing rewritten");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
assert.doesNotMatch(sql, /create\s+(or\s+replace\s+)?(table|view)\b/i, "no table or view");
eq((sql.match(/create or replace function/gi) ?? []).length, 1, "one function");
passed += 3;

// ── What it reads, as production has it ────────────────────
// turf_daily_views: the table, its row security and its revoke, exactly as 20261019_mytapturf.sql writes them.
const mytapturf = fs.readFileSync(`${M}/20261019_mytapturf.sql`, "utf8");
const views = mytapturf.match(/create table if not exists public\.turf_daily_views[\s\S]*?\);\s*alter table public\.turf_daily_views enable row level security;\s*revoke all on public\.turf_daily_views from anon, authenticated;/);
assert.ok(views, "turf_daily_views as 20261019_mytapturf.sql creates it");
await db.exec(`
create role anon; create role authenticated;
grant usage on schema public to anon, authenticated;
create table public.turfs (id uuid primary key, name text, is_active boolean default true, lat double precision, lng double precision);
grant select on public.turfs to anon, authenticated;
${views[0]}
`);

const before = await q(`select proname from pg_proc where pronamespace = 'public'::regnamespace order by proname`);
await db.exec(sql);
await db.exec(sql); // safe to run again
const after = await q(`select proname from pg_proc where pronamespace = 'public'::regnamespace and proname <> 'map_turf_heat' order by proname`);
eq(after, before, "no other function added or changed");
const [{ n: overloads }] = await q(`select count(*)::int as n from pg_proc where proname = 'map_turf_heat'`);
eq(overloads, 1, "no overload after running it twice");

// ── Fixture ────────────────────────────────────────────────
// Turf T<n> is 00000000-0000-4000-8000-0000000000<nn>. Views land on India's
// days: today (d0) back to 29 days ago (d29) count, 30 days ago does not.
const T = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const turf = (n, { active = true, lat = 18.5 + n / 100, lng = 73.8 + n / 100 } = {}) =>
  q(`insert into public.turfs (id, name, is_active, lat, lng) values ($1, $2, $3, $4, $5)`, [T(n), `Turf ${n}`, active, lat, lng]);
const view = (n, ago, count) =>
  q(`insert into public.turf_daily_views (turf_id, day, views) values ($1, (now() at time zone 'Asia/Kolkata')::date - $2::int, $3)`, [T(n), ago, count]);

// Eleven turfs that qualify, T1 to T11, with 3, 4, ... 13 views.
for (let i = 0; i < 11; i++) {
  await turf(i + 1);
  await view(i + 1, i % 3, 3 + i);
}
// T12: 13 views spread over the window's both ends, plus 500 the day before it starts (not counted). Ties T11.
await turf(12);
await view(12, 0, 6);
await view(12, 29, 7);
await view(12, 30, 500);
// Left out: 2 views (T13); inactive (T14); no point (T15, T16); a 0,0 point (T17); views only before the window
// (T18, and T22 exactly 30 days ago, the day before it starts); no views at all (T19).
await turf(13); await view(13, 0, 2);
await turf(14, { active: false }); await view(14, 0, 900);
await turf(15, { lat: null }); await view(15, 0, 900);
await turf(16, { lng: null }); await view(16, 0, 900);
await turf(17, { lat: 0, lng: 0 }); await view(17, 0, 900);
await turf(18); await view(18, 31, 900); await view(18, 45, 900);
await turf(22); await view(22, 30, 900);
await turf(19);
// A turf only 0,0 in one coordinate is a point: T20 at lat 0 (the equator, off Sri Lanka) with 3 views. Its 3 views tie T1's.
await turf(20, { lat: 0, lng: 80 }); await view(20, 1, 3);
// Views of a turf id no longer in turfs are no turf (T21).
await view(21, 0, 900);

// ── The answer ─────────────────────────────────────────────
const outCols = (await q(`select parameter_name, data_type from information_schema.parameters where specific_name ~ '^map_turf_heat_[0-9]+$' and parameter_mode = 'OUT' order by ordinal_position`));
eq(outCols.map((c) => [c.parameter_name, c.data_type]), [["turf_id", "uuid"], ["level", "smallint"]], "turf_id and level, nothing else: no count");

const rows = await q(`select turf_id, level from public.map_turf_heat()`);
const levels = Object.fromEntries(rows.map((r) => [Number(r.turf_id.slice(-12)), r.level]));
// 13 turfs: T1..T12 and T20. By views: T1 and T20 (3), T2 (4), ... T11 and T12 (13).
// percent_rank over 13: T1, T20 rank 1 -> 0; T2 rank 3 -> 2/12; ... T11, T12 rank 12 -> 11/12.
const expected = {};
const byViews = [[1, 3], [20, 3], ...Array.from({ length: 10 }, (_, i) => [i + 2, 4 + i]), [12, 13]];
for (const [n, v] of byViews) {
  const rank = 1 + byViews.filter(([, w]) => w < v).length;
  expected[n] = Math.min(5, 1 + Math.floor(((rank - 1) / (byViews.length - 1)) * 5));
}
eq(levels, expected, "each qualifying turf's level by rank");
eq(Object.keys(levels).map(Number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20], "only active turfs with a point and 3 or more views in the window");
eq(levels[1], 1, "the least viewed is 1");
eq(levels[11], 5, "the most viewed is 5");
eq(levels[12], levels[11], "the same views share a level (T12's 13 counts only its days in the window)");
eq(levels[20], levels[1], "and at the bottom too");
ok(rows.every((r) => r.level >= 1 && r.level <= 5), "levels run 1 to 5");
eq(new Set(Object.values(levels)), new Set([1, 2, 3, 4, 5]), "every level is used");
ok(rows.every((r, i) => i === 0 || rows[i - 1].level >= r.level), "most popular first");
ok(!JSON.stringify(rows).match(/"(views|n|count|total)"/), "no count in the answer");

// No views anywhere yet (or none with 3): no rows, not an error.
await db.exec(`create table public._keep as select * from public.turf_daily_views; update public.turf_daily_views set views = 1;`);
eq((await q(`select * from public.map_turf_heat()`)).length, 0, "nobody with 3 views: no rows");
await db.exec(`update public.turf_daily_views v set views = k.views from public._keep k where k.turf_id = v.turf_id and k.day = v.day;`);
eq((await q(`select count(*)::int as n from public.map_turf_heat()`))[0].n, 13, "back as it was");

// ── Who may call it ────────────────────────────────────────
const grants = await q(`select grantee from information_schema.routine_privileges where specific_name ~ '^map_turf_heat_[0-9]+$' and privilege_type = 'EXECUTE'`);
ok(grants.some((g) => g.grantee === "anon"), "anon may call it");
ok(grants.some((g) => g.grantee === "authenticated"), "so may a signed-in visitor");
ok(!grants.some((g) => g.grantee === "PUBLIC"), "PUBLIC may not");
const def = (await q(`select prosecdef, proconfig, provolatile from pg_proc where oid = 'public.map_turf_heat()'::regprocedure`))[0];
ok(def.prosecdef === true, "security definer: it reads the closed views table for the caller");
ok(String(def.proconfig).includes('search_path=""'), "with an empty search_path");
eq(def.provolatile, "s", "stable");
for (const role of ["anon", "authenticated"]) {
  for (const p of ["select", "insert", "update"]) ok(!(await q(`select has_table_privilege($1, 'public.turf_daily_views', $2) as p`, [role, p]))[0].p, `${role} still cannot ${p} the views table`);
}

// As anon itself: the levels, and still no way into the counts.
await db.exec(`set role anon`);
eq((await q(`select count(*)::int as n from public.map_turf_heat()`))[0].n, 13, "anon gets the levels");
await assert.rejects(q(`select * from public.turf_daily_views`), /permission denied/, "anon cannot read the views");
passed++;
await db.exec(`reset role`);

console.log(`map_turf_heat: ${passed} checks passed`);
