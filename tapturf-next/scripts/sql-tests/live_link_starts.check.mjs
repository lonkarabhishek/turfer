// Applies 20261021_live_matches.sql, 20261026_admin_live_links.sql and then
// 20261029_live_link_starts.sql (twice) to an in-memory Postgres (PGlite) with
// stand-ins for what they read (Supabase's roles, the key table, the owner
// check, users and usernames, pg_cron), and checks who started each link: a
// starter is recorded once (the first stays), only with the live write key and
// only for a link that took a write; live_link_created (write key only) says
// a link's status, when its row was made and when its starter was recorded
// (right after its first write, or later, or never); the admin read
// answers only the site owner, returns admin_live_links' columns as they were
// plus the starter's, and leaves out stop markers when asked (p_min_writes).
// Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/live_link_starts.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261029_live_link_starts.sql`;
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

// The parts of production the files read (users.name is character varying there).
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

const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b|\bupdate\b/i, "nothing destructive, nothing rewritten");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
assert.doesNotMatch(sql, /function\s+public\.live_match_/i, "the write functions are not touched");
await db.exec(sql);
await db.exec(sql); // safe to run again
passed += 4;

const ASHA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const RAVI = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const GONE = "aaaaaaaa-aaaa-4aaa-8aaa-000000000099";
await q(`insert into public.users (id, name, phone) values ($1, 'Asha Patil', null), ($2, 'Ravi Kumar', null)`, [ASHA, RAVI]);
await q(`insert into public.usernames (user_id, username) values ($1, 'asha_p')`, [ASHA]);

const SECRET = "ab".repeat(32);
const NET = "0".repeat(32);
const match = (o = {}) => JSON.stringify({ v: 1, id: "m1", createdAt: 1, setup: { teamA: "Kothrud Kings", teamB: "Baner Blasters", title: "Sunday cup", venue: "Turf Park", overs: 6 }, events: [{ type: "ball" }], ...o });
const put = async (code, rev, secret = SECRET, m = match()) =>
  (await q(`select public.live_match_put('live-key', $1, $2, $3::jsonb, 'live', $4, $5) as r`, [code, secret, m, rev, NET]))[0].r;
const record = async (code, user = ASHA, tool = "cricket", method = "google", key = "live-key") =>
  (await q(`select public.live_link_start_record($1, $2, $3, $4, $5) as r`, [key, code, user, tool, method]))[0].r;
const known = async (code, key = "live-key") => (await q(`select public.live_link_starter_known($1, $2) as r`, [key, code]))[0].r;
const starts = async () => q(`select code, user_id, tool, method from private.live_link_starts order by code`);
const created = async (code, key = "live-key") => (await q(`select public.live_link_created($1, $2) as r`, [key, code]))[0].r;

// A link that took its first write.
eq((await put("aaaaaaaaaaaa", 1)).r, "ok", "the first write makes the link");
// The key comes first, as for the write functions.
eq(await record("aaaaaaaaaaaa", ASHA, "cricket", "google", "wrong"), "unavailable", "a wrong key records nothing");
eq(await record("aaaaaaaaaaaa", ASHA, "cricket", "google", null), "unavailable", "no key records nothing");
eq(await starts(), [], "nothing recorded without the key");
eq(await known("aaaaaaaaaaaa", "wrong"), "unavailable", "the lookup needs the key too");
eq(await known("aaaaaaaaaaaa"), "none", "no starter yet");
const first = await created("aaaaaaaaaaaa");
eq([first.status, typeof first.created_at, first.started_at], ["live", "string", null], "live_link_created: the status and when the row was made; no starter yet");
eq(await created("aaaaaaaaaaaa", "wrong"), { r: "unavailable" }, "live_link_created needs the key");
eq(await created("aaaaaaaaaaaa", null), { r: "unavailable" }, "and a key at all");
eq(await created("AAAA"), null, "a code that isn't one");
eq(await created("zzzzzzzzzzzz"), null, "a link with no row");

// Shapes.
eq(await record("AAAA", ASHA), "bad", "a code that isn't one");
eq(await record("aaaaaaaaaaaa", ASHA, "toss"), "bad", "only cricket or board");
eq(await record("aaaaaaaaaaaa", ASHA, "cricket", "email"), "bad", "only google or phone");
eq(await record("aaaaaaaaaaaa", GONE), "bad", "only an account that exists");
eq(await record("bbbbbbbbbbbb", ASHA), "bad", "only a link that exists");
// A stop marker (a stop before any write) took no write.
eq((await q(`select public.live_match_stop('live-key', 'cccccccccccc', $1) as r`, [SECRET]))[0].r, "ok", "a stop before the first write leaves a marker");
eq(await record("cccccccccccc", ASHA), "bad", "only a link that took a write");
eq(await starts(), [], "nothing recorded for a refused call");

// Once, and the first stays.
eq(await record("aaaaaaaaaaaa", ASHA, "cricket", "google"), "ok", "the starter is recorded");
eq(await record("aaaaaaaaaaaa", RAVI, "board", "phone"), "known", "a second one is not");
eq(await record("aaaaaaaaaaaa", ASHA, "cricket", "google"), "known", "nor the same one again");
eq(await starts(), [{ code: "aaaaaaaaaaaa", user_id: ASHA, tool: "cricket", method: "google" }], "one row, the first");
eq(await known("aaaaaaaaaaaa"), "known", "the lookup finds it");
eq(await known("AAAA"), "bad", "the lookup checks the code");
// The link carries on as before (past the 500 ms gap between writes).
await q(`update public.live_matches set updated_at = updated_at - interval '1 second' where code = 'aaaaaaaaaaaa'`);
eq((await put("aaaaaaaaaaaa", 2)).r, "ok", "writes go on after the record");
eq((await put("aaaaaaaaaaaa", 3, "cd".repeat(32))).r, "forbidden", "another secret is still refused");
const [{ n: puts }] = await q(`select count(*)::int as n from pg_proc where proname = 'live_match_put'`);
eq(puts, 1, "live_match_put has no new overload");

// A board link, recorded by a phone sign-in, with no username.
const board = JSON.stringify({ v: 1, kind: "board", id: "b1", createdAt: 1, sport: "football", setup: { teamA: "Reds", teamB: "Blues", title: "", venue: "Hotfut", rules: {} }, events: [] });
eq((await put("dddddddddddd", 1, SECRET, board)).r, "ok", "a board link");
eq(await record("dddddddddddd", RAVI, "board", "phone"), "ok", "its starter");
// An older link nobody recorded.
eq((await put("eeeeeeeeeeee", 1)).r, "ok", "a link with no starter");
await q(`update public.live_matches set created_at = created_at - interval '1 day' where code = 'eeeeeeeeeeee'`);
// A link from before the deploy (made 2 hours back), whose starter a later signed-in write recorded: it moves nothing.
eq((await put("ffffffffffff", 1)).r, "ok", "a link from before the deploy");
await q(`update public.live_matches set created_at = created_at - interval '2 hours' where code = 'ffffffffffff'`);
eq(await record("ffffffffffff", RAVI, "cricket", "phone"), "ok", "its starter, recorded later");

// When each row was made and its starter recorded: the app's legacyRead tells a row made with a sign-in
// (its starter recorded right after the write that made it) from one made before the check.
const ca = await created("aaaaaaaaaaaa");
const cd = await created("dddddddddddd");
const ce = await created("eeeeeeeeeeee");
const cf = await created("ffffffffffff");
const ms = (v) => Date.parse(v);
const lag = (c) => ms(c.started_at) - ms(c.created_at);
ok(lag(ca) >= 0 && lag(ca) < 60_000 && lag(cd) >= 0 && lag(cd) < 60_000, "rows made with a sign-in: starter recorded within a minute of the row");
ok(lag(cf) >= 2 * 3600_000, "a row from before the deploy, recorded by a later signed-in write: hours after");
eq([typeof ce.created_at, ce.started_at], ["string", null], "a row from before the deploy with no starter");
eq([cd.status, (await created("cccccccccccc")).status, (await created("cccccccccccc")).started_at], ["live", "stopped", null], "with each row's status (a stop marker has no starter)");
ok(!Object.keys(ca).some((k) => /secret|ip|user|stopper|match/.test(k)), "nothing but the status and the two times");

// Nobody but the server: no table grants, no direct reads.
ok(!(await q(`select has_table_privilege('anon', 'private.live_link_starts', 'select') as p`))[0].p, "anon cannot read the table");
ok(!(await q(`select has_table_privilege('authenticated', 'private.live_link_starts', 'insert') as p`))[0].p, "authenticated cannot write it");
for (const fn of ["live_link_start_record(text,text,uuid,text,text)", "live_link_starter_known(text,text)", "live_link_created(text,text)", "admin_live_links2(text,integer)"]) {
  const grants = await q(`select grantee from information_schema.routine_privileges where specific_name ~ $1 and privilege_type = 'EXECUTE'`, [`^${fn.split("(")[0]}_[0-9]+$`]);
  ok(grants.some((g) => g.grantee === "anon") && !grants.some((g) => g.grantee === "PUBLIC"), `${fn}: anon may call it (the check is inside), PUBLIC not`);
  const def = (await q(`select prosecdef, proconfig from pg_proc where oid = $1::regprocedure`, [`public.${fn}`]))[0];
  ok(def.prosecdef === true && String(def.proconfig).includes("search_path="), `${fn}: security definer with a fixed search_path`);
}

// The admin read: the site owner only.
await db.exec(`set test.owner = 'no'`);
await assert.rejects(q(`select * from public.admin_live_links2(null)`), /not allowed/);
await assert.rejects(q(`select * from public.admin_live_links2(null, 1)`), /not allowed/);
await assert.rejects(q(`select * from public.admin_live_links(null)`), /not allowed/);
passed += 3;
await db.exec(`set test.owner = 'yes'`);

const OLD = ["code", "status", "sport", "team_a", "team_b", "title", "venue", "events", "writes", "created_at", "updated_at"];
const NEW = ["starter_id", "starter_name", "starter_username", "starter_method", "started_at"];
const outCols = async (name) =>
  (await q(`select parameter_name from information_schema.parameters where specific_name ~ $1 and parameter_mode = 'OUT' order by ordinal_position`, [`^${name}_[0-9]+$`])).map((r) => r.parameter_name);
eq(await outCols("admin_live_links"), OLD, "admin_live_links keeps its columns");
eq(await outCols("admin_live_links2"), [...OLD, ...NEW], "admin_live_links2: the same columns, then the starter's");

const old = await q(`select * from public.admin_live_links('t')`);
const rows = await q(`select * from public.admin_live_links2('t')`);
eq(rows.map((r) => Object.fromEntries(OLD.map((c) => [c, r[c]]))), old, "the old columns read exactly as admin_live_links");
const by = Object.fromEntries(rows.map((r) => [r.code, r]));
eq([by.aaaaaaaaaaaa.starter_id, by.aaaaaaaaaaaa.starter_name, by.aaaaaaaaaaaa.starter_username, by.aaaaaaaaaaaa.starter_method], [ASHA, "Asha Patil", "asha_p", "google"], "a Google starter with a username");
ok(by.aaaaaaaaaaaa.started_at instanceof Date, "with when it was recorded");
eq([by.dddddddddddd.starter_name, by.dddddddddddd.starter_username, by.dddddddddddd.starter_method, by.dddddddddddd.sport], ["Ravi Kumar", null, "phone", "football"], "a phone starter without a username, on a board");
eq([by.eeeeeeeeeeee.starter_id, by.eeeeeeeeeeee.starter_name, by.eeeeeeeeeeee.starter_method, by.eeeeeeeeeeee.started_at], [null, null, null, null], "an unrecorded link has no starter");
eq([by.cccccccccccc.status, by.cccccccccccc.starter_id], ["stopped", null], "a stop marker has none either");
eq(rows.map((r) => r.code), ["dddddddddddd", "cccccccccccc", "aaaaaaaaaaaa", "eeeeeeeeeeee", "ffffffffffff"].sort((a, b) => (by[b].created_at - by[a].created_at) || a.localeCompare(b)), "newest first, as before");
// The admin home's latest link: links that went live only, never a stop marker.
const live1 = (await q(`select code from public.admin_live_links2('t', 1)`)).map((r) => r.code);
eq(live1, rows.filter((r) => r.writes >= 1).map((r) => r.code), "p_min_writes 1: the same rows in the same order, without the stop marker");
ok(!live1.includes("cccccccccccc") && live1.length === rows.length - 1, "only the marker is left out");
eq((await q(`select code from public.admin_live_links2('t', null)`)).map((r) => r.code), rows.map((r) => r.code), "null: every link");
// A long name is cut, as the other admin reads cut theirs.
await q(`update public.users set name = $1 where id = $2`, ["N".repeat(80), RAVI]);
eq((await q(`select starter_name from public.admin_live_links2('t') where code = 'dddddddddddd'`))[0].starter_name.length, 60, "names cut to 60");
ok(!(await outCols("admin_live_links2")).some((c) => /secret|ip|stopper|phone|email/.test(c)), "never the secret, the network hash, a phone or an email");

console.log(`live_link_starts: ${passed} checks passed`);
