// Applies 20261026_tool_uses.sql (twice) to an in-memory Postgres (PGlite)
// with stand-ins for Supabase's roles and the tables it reads, and checks
// the tool counter and the admin reads. Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/tool_uses.check.mjs supabase/migrations/20261026_tool_uses.sql
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
create schema private;
create table public.live_matches (code text primary key, match jsonb, status text, created_at timestamptz default now());
create function private.account_key_ok(p_key text) returns boolean language sql stable as $$ select p_key = 'server-key' $$;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);

const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b|\bupdate\s+public\./i, "nothing destructive");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
await db.exec(sql);
await db.exec(sql); // safe to run again
passed++;

const count = async (key, tool, event, detail = null) => (await q(`select public.tool_use_count($1, $2, $3, $4) as r`, [key, tool, event, detail]))[0].r;
eq(await count("wrong", "toss", "started"), false, "needs the server key");
eq(await count("server-key", "admin", "started"), false, "only the known tools");
eq(await count("server-key", "toss", "opened"), false, "only started and finished");
eq(await count("server-key", "toss", "started"), true);
eq(await count("server-key", "toss", "started"), true);
eq(await count("server-key", "live_scoreboard", "started", "football"), true);
eq(await count("server-key", "live_scoreboard", "started", "<script>"), true, "a bad tag still counts, without the tag");
eq(await count("server-key", "live_scorer", "finished"), true);

await db.exec(`set test.owner = 'no'`);
await assert.rejects(q(`select * from public.admin_tool_uses(null)`), /not allowed/);
await assert.rejects(q(`select * from public.admin_live_matches(null)`), /not allowed/);
passed += 2;
await db.exec(`set test.owner = 'yes'`);

const uses = await q(`select tool, event, detail, n from public.admin_tool_uses('t') order by tool, event, detail`);
eq(uses, [
  { tool: "live_scoreboard", event: "started", detail: "", n: 1 },
  { tool: "live_scoreboard", event: "started", detail: "football", n: 1 },
  { tool: "live_scorer", event: "finished", detail: "", n: 1 },
  { tool: "toss", event: "started", detail: "", n: 2 },
], "one row per day, tool, event and tag");
const day = (await q(`select distinct day::text from public.admin_tool_uses('t')`)).map((r) => r.day);
eq(day, [(await q(`select ((now() at time zone 'Asia/Kolkata')::date)::text as d`))[0].d], "counted on India's day");

await q(`insert into public.live_matches (code, match, status, created_at) values
  ('a', '{"secret":"x"}', 'stopped', '2026-10-21 05:00+00'), ('b', null, 'stopped', '2026-10-21 20:00+00'), ('c', null, 'live', '2026-10-26 01:00+00')`);
const live = await q(`select day::text, status, n from public.admin_live_matches('t')`);
eq(live, [
  { day: "2026-10-21", status: "stopped", n: 1 },
  { day: "2026-10-22", status: "stopped", n: 1 },
  { day: "2026-10-26", status: "live", n: 1 },
], "by India's day and status; 20:00 UTC is the next day in India");
const cols = (await q(`select string_agg(column_name, ',') as c from information_schema.columns where table_name = 'tool_uses'`))[0].c;
ok(!/ip|user|phone|email/.test(cols), "nothing about who in the counts");

for (const fn of ["tool_use_count", "admin_tool_uses", "admin_live_matches"]) {
  const grants = await q(`select grantee from information_schema.routine_privileges where routine_name = $1 and privilege_type = 'EXECUTE'`, [fn]);
  ok(grants.some((g) => g.grantee === "anon") && !grants.some((g) => g.grantee === "PUBLIC"), `${fn}: anon may call it, PUBLIC not`);
  const def = (await q(`select prosecdef, proconfig from pg_proc where proname = $1`, [fn]))[0];
  ok(def.prosecdef === true && String(def.proconfig).includes("search_path="), `${fn}: security definer with a fixed search_path`);
}
const tableGrants = await q(`select grantee from information_schema.role_table_grants where table_schema = 'private' and table_name = 'tool_uses' and grantee in ('anon', 'authenticated', 'PUBLIC')`);
eq(tableGrants.length, 0, "the table is closed to the API roles");
console.log(`tool_uses: ${passed} checks passed`);
