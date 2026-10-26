// Applies 20261026_admin_live_links.sql (twice) to an in-memory Postgres
// (PGlite) with a stand-in live_matches table, and checks the admin list.
// Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/admin_live_links.check.mjs supabase/migrations/20261026_admin_live_links.sql
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
create role anon; create role authenticated;
create table public.live_matches (code text primary key, secret_hash bytea, match jsonb, rev bigint default 0, status text not null default 'live',
  writes integer not null default 0, ip_hash text, stoppers bytea[], created_at timestamptz default now(), updated_at timestamptz default now());
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);
const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b|\bupdate\b|\binsert\b/i, "read only");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
await db.exec(sql);
await db.exec(sql);
passed++;

const cricket = { v: 1, id: "m1", createdAt: 1, setup: { teamA: "Kothrud Kings", teamB: "Baner Blasters", title: "Sunday cup", venue: "Turf Park", overs: 6 }, events: [{ type: "ball" }, { type: "ball" }] };
const board = { v: 1, kind: "board", id: "b1", createdAt: 1, sport: "football", setup: { teamA: "Reds", teamB: "Blues", title: "", venue: "Hotfut", rules: {} }, events: [] };
await q(`insert into public.live_matches (code, secret_hash, match, status, writes, ip_hash, created_at, updated_at) values
  ('aaaaaaaaaaaa', '\\x01', $1, 'done', 14, 'net1', '2026-10-21 10:00+00', '2026-10-21 11:00+00'),
  ('bbbbbbbbbbbb', '\\x02', $2, 'live', 3, 'net2', '2026-10-22 10:00+00', '2026-10-22 10:05+00'),
  ('cccccccccccc', null, null, 'stopped', 0, null, '2026-10-20 09:00+00', '2026-10-20 09:30+00'),
  ('dddddddddddd', null, '"odd"', 'expired', 1, null, '2026-10-19 09:00+00', '2026-10-19 09:00+00')`, [JSON.stringify(cricket), JSON.stringify(board)]);

await db.exec(`set test.owner = 'no'`);
await assert.rejects(q(`select * from public.admin_live_links(null)`), /not allowed/);
passed++;
await db.exec(`set test.owner = 'yes'`);

const rows = await q(`select code, status, sport, team_a, team_b, title, venue, events, writes from public.admin_live_links('t')`);
eq(rows.map((r) => r.code), ["bbbbbbbbbbbb", "aaaaaaaaaaaa", "cccccccccccc", "dddddddddddd"], "newest first");
eq(rows[1], { code: "aaaaaaaaaaaa", status: "done", sport: "cricket", team_a: "Kothrud Kings", team_b: "Baner Blasters", title: "Sunday cup", venue: "Turf Park", events: 2, writes: 14 }, "a cricket match");
eq(rows[0].sport, "football", "a board's sport");
eq([rows[0].team_a, rows[0].team_b, rows[0].events], ["Reds", "Blues", 0], "a board's names");
eq([rows[2].sport, rows[2].team_a, rows[2].events], [null, null, 0], "a stopped link holds no match");
eq([rows[3].sport, rows[3].events], [null, 0], "a match that isn't an object reads as none");
const cols = (await q(`select string_agg(parameter_name, ',') as c from information_schema.parameters where specific_name like 'admin_live_links%' and parameter_mode = 'OUT'`))[0].c;
ok(!/secret|ip|stopper/.test(cols), "nothing about who scored it");
const grants = await q(`select grantee from information_schema.routine_privileges where routine_name = 'admin_live_links' and privilege_type = 'EXECUTE'`);
ok(grants.some((g) => g.grantee === "anon") && !grants.some((g) => g.grantee === "PUBLIC"), "anon may call it (the owner check is inside), PUBLIC not");
const def = (await q(`select prosecdef, proconfig from pg_proc where proname = 'admin_live_links'`))[0];
ok(def.prosecdef === true && String(def.proconfig).includes("search_path="), "security definer with a fixed search_path");
console.log(`admin_live_links: ${passed} checks passed`);
