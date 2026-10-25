// Applies 20261025_turf_claimed.sql (twice) to an in-memory Postgres
// (PGlite) with stand-ins for the cache queue (private.mark_dirty records
// what it is asked to refresh) and checks that turfs.claimed follows the
// active claims in turf_owners. Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/turf_claimed.check.mjs supabase/migrations/20261025_turf_claimed.sql
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [FILE] = process.argv.slice(2);
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
let passed = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

await db.exec(`
create role anon; create role authenticated;
create schema private;
create table private.dirty_log (keys text[], urgent boolean);
create function private.mark_dirty(p_keys text[], p_urgent boolean default false) returns void language sql as
  $$ insert into private.dirty_log values ((select array_agg(distinct x order by x) from unnest(p_keys) x where x is not null), p_urgent) $$;
create function private.list_key(p_city text) returns text language sql immutable as
  $$ select 'list:' || case when p_city ~ '^[a-z][a-z-]{1,30}$' then p_city else 'all' end $$;
create table public.turfs (id uuid primary key, slug text, name text, city text, is_active boolean default true, rating numeric, updated_at timestamptz default now());
create table public.turf_owners (turf_id uuid not null, user_key text not null, status text not null, via text default 'admin', role text, created_at timestamptz default now(), decided_at timestamptz, primary key (turf_id, user_key));
`);
const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "aaaaaaaa-0000-4000-8000-000000000002", C = "aaaaaaaa-0000-4000-8000-000000000003";
await q(`insert into public.turfs (id, slug, name, city) values ('${A}', 'turfit-udaipur', 'Turfit', 'udaipur'), ('${B}', 'b-turf', 'B', 'pune'), ('${C}', 'c-turf', 'C', 'nashik')`);
await q(`insert into public.turf_owners (turf_id, user_key, status) values ('${A}', 'e:a@x.in', 'active'), ('${B}', 'p:9800000001', 'pending')`);

const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\s+from\b|\btruncate\b/i, "nothing dropped or deleted");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
await db.exec(sql);
// The cache trigger on turfs, as production has it (20261020_cache_queue.sql), with the new function.
await db.exec(`create trigger turfs_mark_cache_dirty after insert or update or delete on public.turfs for each row execute function private.mark_turf_dirty();`);
await db.exec(sql); // safe to run again: the backfill finds nothing more to do

const claimed = async () => Object.fromEntries((await q("select slug, claimed from public.turfs order by slug")).map((r) => [r.slug, r.claimed]));
const log = async () => { const r = await q("select keys, urgent from private.dirty_log"); await q("truncate private.dirty_log"); return r; };

eq(await claimed(), { "b-turf": false, "c-turf": false, "turfit-udaipur": true }, "the active claim is marked; a pending one is not");
eq((await q("select has_column_privilege('anon', 'public.turfs', 'claimed', 'update') u")).at(0).u, false, "anon cannot set it");
await log();

// Approving a claim marks the turf and refreshes its city's lists and its page at once.
await q(`update public.turf_owners set status = 'active' where turf_id = '${B}'`);
eq((await claimed())["b-turf"], true, "approved");
eq(await log(), [{ keys: ["list:pune", "turf:b-turf"], urgent: true }], "the lists and the page, urgent");

// A second, revoked claim on the same turf changes nothing while one is active.
await q(`insert into public.turf_owners (turf_id, user_key, status) values ('${B}', 'e:other@x.in', 'revoked')`);
eq((await claimed())["b-turf"], true, "still claimed");
eq(await log(), [], "no refresh when nothing changed");

// Revoking the active one clears it.
await q(`update public.turf_owners set status = 'revoked' where turf_id = '${B}' and user_key = 'p:9800000001'`);
eq((await claimed())["b-turf"], false, "revoked");
eq(await log(), [{ keys: ["list:pune", "turf:b-turf"], urgent: true }], "refreshed again");

// A claim moved to another turf: both are set right.
await q(`update public.turf_owners set turf_id = '${C}' where turf_id = '${A}'`);
eq(await claimed(), { "b-turf": false, "c-turf": true, "turfit-udaipur": false }, "moved");
await log();

// Deleting the claim clears the turf.
await q(`delete from public.turf_owners where turf_id = '${C}'`);
eq((await claimed())["c-turf"], false, "deleted");
await log();

// A change to a column the lists do not show refreshes only the page; claimed is a list column.
await q(`update public.turfs set updated_at = now() + interval '1 day', name = name where id = '${A}'`);
eq(await log(), [], "ignored columns refresh nothing");
await q(`set tapturf.cache_urgent = 'off'`);
await q(`update public.turfs set claimed = true where id = '${A}'`);
eq((await log())[0].keys, ["list:udaipur", "turf:turfit-udaipur"], "claimed is a list column");

console.log(`turf_claimed: ${passed} checks passed`);
