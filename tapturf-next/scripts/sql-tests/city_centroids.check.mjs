// Builds city_turf_counts as it is live (pg_get_viewdef on 28 Oct, with
// its grants), then applies 20261028_city_centroids.sql (twice) to an
// in-memory Postgres (PGlite) and checks that the old columns and rows are
// unchanged, that lat and lng are the medians of each city's active turfs
// inside India's box, and that the owner, grants and options are kept.
// Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/city_centroids.check.mjs supabase/migrations/20261028_city_centroids.sql
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [FILE] = process.argv.slice(2);
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };
const near = (a, b, what) => { assert.ok(a != null && Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`); passed++; };

await db.exec(`
create role anon; create role authenticated; create role service_role;
create table public.turfs (id serial primary key, name text, city text, is_active boolean default true, lat double precision, lng double precision);
-- The live definition and grants (28 Oct): no options, owner postgres.
create view public.city_turf_counts as
 SELECT city,
    count(*)::integer AS n
   FROM turfs
  WHERE is_active AND city IS NOT NULL AND city <> ''::text
  GROUP BY city;
grant all on public.city_turf_counts to anon, authenticated, service_role;
`);

// Fixture: odd and even counts, outliers outside India's box, inactive and
// cityless rows, a city with no usable point, and a city with no lat/lng at all.
await db.exec(`
insert into public.turfs (city, is_active, lat, lng) values
  ('pune', true, 18.50, 73.80), ('pune', true, 18.60, 73.90), ('pune', true, 18.55, 73.85),
  ('pune', true, 0, 0),                  -- a stray 0,0: counted, not placed
  ('pune', true, 51.5, -0.12),           -- pinned in London: counted, not placed
  ('pune', true, null, null),            -- no pin: counted, not placed
  ('pune', false, 25.0, 85.0),           -- inactive: neither
  ('testpur', true, 21.0, 80.0), ('testpur', true, 22.0, 81.0),   -- even: the halfway point
  ('kottayam', true, 9.59, 76.52),
  ('kottayam', true, 9.60, 99.00),       -- lng outside the box: both coordinates dropped
  ('nowhere', true, null, null), ('nowhere', true, 40.0, 100.0),  -- nothing in the box
  ('edge', true, 6, 68), ('edge', true, 37, 98),                  -- the box is inclusive
  (null, true, 19.0, 73.0), ('', true, 19.0, 73.0),               -- no city: not in the view
  ('gone', false, 20.0, 75.0);                                    -- only inactive: not in the view
`);

const before = await q(`select * from public.city_turf_counts order by city`);
const cols = async () => (await q(`
  select a.attname as name, format_type(a.atttypid, a.atttypmod) as type
  from pg_attribute a where a.attrelid = 'public.city_turf_counts'::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum`));
const meta = async () => (await q(`
  select c.reloptions, pg_get_userbyid(c.relowner) as owner,
    has_table_privilege('anon', c.oid, 'select') as anon_sel,
    has_table_privilege('authenticated', c.oid, 'select') as auth_sel,
    has_table_privilege('service_role', c.oid, 'select') as svc_sel,
    c.relacl::text as acl
  from pg_class c where c.oid = 'public.city_turf_counts'::regclass`))[0];
const colsBefore = await cols();
const metaBefore = await meta();
eq(colsBefore, [{ name: "city", type: "text" }, { name: "n", type: "integer" }], "the live shape before");

const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b|\brevoke\b/i, "nothing dropped, deleted, altered or revoked");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
await db.exec(sql);
await db.exec(sql); // safe to run again

// Shape: the first two columns as before, lat and lng appended.
eq(await cols(), [
  { name: "city", type: "text" },
  { name: "n", type: "integer" },
  { name: "lat", type: "double precision" },
  { name: "lng", type: "double precision" },
], "city and n first and unchanged, then lat and lng");

// Owner, grants and options kept.
eq(await meta(), metaBefore, "owner, grants and options unchanged");
eq(metaBefore.reloptions, null, "no options before or after (no security_invoker)");
ok(metaBefore.anon_sel && metaBefore.auth_sel && metaBefore.svc_sel, "anon, authenticated and service_role still read it");

// The old columns: the same rows.
eq(await q(`select city, n from public.city_turf_counts order by city`), before, "city, n rows unchanged");

const rows = Object.fromEntries((await q(`select * from public.city_turf_counts`)).map((r) => [r.city, r]));
eq(Object.keys(rows).sort(), ["edge", "kottayam", "nowhere", "pune", "testpur"], "only active turfs with a city");
eq(rows.pune.n, 6, "pune counts every active turf, placed or not");
near(rows.pune.lat, 18.55, "pune lat: the median of the three in the box");
near(rows.pune.lng, 73.85, "pune lng: the median of the three in the box");
near(rows.testpur.lat, 21.5, "even count: halfway");
near(rows.testpur.lng, 80.5, "even count: halfway");
eq(rows.kottayam.n, 2, "kottayam counts both");
near(rows.kottayam.lat, 9.59, "a point outside the box drops both coordinates");
near(rows.kottayam.lng, 76.52, "a point outside the box drops both coordinates");
eq([rows.nowhere.n, rows.nowhere.lat, rows.nowhere.lng], [2, null, null], "no point in the box: counted, null point");
near(rows.edge.lat, 21.5, "the box is inclusive");
near(rows.edge.lng, 83, "the box is inclusive");

// A reader of the old columns only, as the app before this change asks.
eq((await q(`select city, n from public.city_turf_counts where city = 'pune'`))[0], { city: "pune", n: 6 }, "select city, n still works");

// As anon (PostgREST's role): the same rows.
await db.exec(`set role anon`);
eq((await q(`select city, n, lat, lng from public.city_turf_counts order by city`)).length, 5, "anon reads all four columns");
await db.exec(`reset role`);

console.log(`city_centroids: ${passed} checks passed`);
