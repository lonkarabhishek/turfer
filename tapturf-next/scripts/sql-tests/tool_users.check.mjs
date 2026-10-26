// Applies 20261026_tool_uses.sql and then 20261027_tool_users.sql (twice) to an
// in-memory Postgres (PGlite) with stand-ins for Supabase's roles and the tables
// they read (with production's column types: users.name is character varying),
// and checks the use log: the server key, the checks on every tag, who (a
// verified account or a device tag, never both; a live link's code only with an
// account), the counts the tiles read, and the site owner's reads (bounded, one
// row per person, codes only of real links). Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/tool_users.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261027_tool_users.sql`;
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

// The parts of production the files read: roles, the account key, the owner check, users and usernames.
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private;
create table public.live_matches (code text primary key, match jsonb, status text, created_at timestamptz default now());
create table public.users (id uuid primary key, name character varying, email text, phone text);
create table public.usernames (user_id uuid primary key, username text not null unique, taggable boolean default true);
create function private.account_key_ok(p_key text) returns boolean language sql stable as $$ select p_key = 'server-key' $$;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);
await db.exec(fs.readFileSync(`${M}/20261026_tool_uses.sql`, "utf8"));

const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b|\bupdate\s+(public|private)\./i, "nothing destructive");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
await db.exec(sql);
await db.exec(sql); // safe to run again
passed += 3;

const ASHA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const RAVI = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const GONE = "aaaaaaaa-aaaa-4aaa-8aaa-000000000099";
await q(`insert into public.users (id, name, phone) values ($1, 'Asha Patil', '+919000000001'), ($2, 'Ravi Kumar', null)`, [ASHA, RAVI]);
await q(`insert into public.usernames (user_id, username) values ($1, 'asha_p')`, [ASHA]);

const record = async (o) =>
  (await q(`select public.tool_use_record($1, $2, $3, $4, $5, $6, $7, $8, $9) as r`, [
    o.key ?? "server-key", o.tool, o.event ?? "started", o.detail ?? null, o.tags ?? null, o.code ?? null, o.user ?? null, o.device ?? null, o.city ?? null,
  ]))[0].r;
const lastRow = async () => (await q(`select tool, event, detail, code, user_id, device, city from private.tool_use_log order by id desc limit 1`))[0];
const logged = async () => Number((await q(`select count(*) as n from private.tool_use_log`))[0].n);

// The key and the shape of a use, as tool_use_count.
eq(await record({ key: "wrong", tool: "toss" }), false, "needs the server key");
eq(await record({ tool: "admin" }), false, "only the known tools");
eq(await record({ tool: "toss", event: "opened" }), false, "only started and finished");
eq(await logged(), 0, "a refused use leaves no row");

// A guest: the device tag and the city, no account.
eq(await record({ tool: "toss", device: "k3j9x0abc123", city: "Pune" }), true);
eq(await lastRow(), { tool: "toss", event: "started", detail: "", code: null, user_id: null, device: "k3j9x0abc123", city: "Pune" }, "a guest's use");

// A signed-in use: the account; a device tag sent with it is left out (never both).
eq(await record({ tool: "live_scoreboard", detail: "football", tags: "football", code: "abcd1234wxyz", user: ASHA, device: "k3j9x0abc123", city: "Hyderabad" }), true);
eq(await lastRow(), { tool: "live_scoreboard", event: "started", detail: "football", code: "abcd1234wxyz", user_id: ASHA, device: null, city: "Hyderabad" }, "a signed-in use");

// A guest's use never keeps a live link's code (a live link needs a sign-in), so no guest tag shares a link with an account.
eq(await record({ tool: "live_scoreboard", event: "finished", detail: "football", code: "abcd1234wxyz", device: "k3j9x0abc123" }), true);
eq(await lastRow(), { tool: "live_scoreboard", event: "finished", detail: "", code: null, user_id: null, device: "k3j9x0abc123", city: null }, "a guest's use: no code");
eq(await record({ tool: "live_scorer", code: "abcd1234wxyz", user: "aaaaaaaa-aaaa-4aaa-8aaa-000000000099" }), true);
eq((await lastRow()).code, null, "nor one from an account that isn't there");

// An account that isn't there counts as a guest (with the device tag, when sent).
eq(await record({ tool: "nrr_calculator", user: GONE, device: "zz99zz99zz99" }), true);
eq((await lastRow()).user_id, null, "an unknown account is left out");
eq((await lastRow()).device, "zz99zz99zz99", "and the use is the device's");

// Bad tags, codes, device tags and cities are left out; the use still counts.
eq(await record({ tool: "live_scorer", event: "finished", tags: "<script>", code: "short", device: "NOT-A-TAG", city: "  Nashik\u0007  " }), true);
eq(await lastRow(), { tool: "live_scorer", event: "finished", detail: "", code: null, user_id: null, device: null, city: "Nashik" }, "bad parts dropped, city trimmed");
eq(await record({ tool: "toss", tags: "a b c d e" }), true);
eq((await lastRow()).detail, "", "at most 4 tags");
eq(await record({ tool: "live_scorer", tags: "6-overs 11-a-side", user: RAVI, city: "x".repeat(80) }), true);
eq((await lastRow()).detail, "6-overs 11-a-side", "slugs pass");
eq((await lastRow()).city.length, 60, "a city is capped at 60 characters");
eq(await record({ tool: "toss", code: "abcd1234wxyz", user: RAVI }), true);
eq((await lastRow()).code, null, "a code only for the live tools");

// The tiles' counts are bumped in the same call.
const counts = await q(`select tool, event, detail, n from private.tool_uses order by tool, event, detail`);
eq(counts, [
  { tool: "live_scoreboard", event: "finished", detail: "football", n: 1 },
  { tool: "live_scoreboard", event: "started", detail: "football", n: 1 },
  { tool: "live_scorer", event: "finished", detail: "", n: 1 },
  { tool: "live_scorer", event: "started", detail: "", n: 2 },
  { tool: "nrr_calculator", event: "started", detail: "", n: 1 },
  { tool: "toss", event: "started", detail: "", n: 3 },
], "one count per use, as tool_use_count keeps them");
eq(await logged(), 9, "one row per use");

// The owner's reads.
await db.exec(`set test.owner = 'no'`);
await assert.rejects(q(`select * from public.admin_tool_users(null)`), /not allowed/);
await assert.rejects(q(`select * from public.admin_tool_activity(null)`), /not allowed/);
await assert.rejects(q(`select * from public.admin_tool_counts(null)`), /not allowed/);
passed += 3;
await db.exec(`set test.owner = 'yes'`);

// A known, dated history for the reads (test data only, so the log starts clean here): Asha used the
// scoreboard three times (two sports, two links, and a code that names no link) and tossed once; one guest
// tossed; a guest whose browser keeps no device tag split teams.
await q(`delete from private.tool_use_log`);
await q(`insert into public.live_matches (code, status) values ('aaaa1111bbbb', 'done'), ('cccc2222dddd', 'stopped')`);
const add = async (tool, event, detail, code, user, device, city, when) =>
  q(`insert into private.tool_use_log (tool, event, detail, code, user_id, device, city, used_at) values ($1, $2, $3, $4, $5, $6, $7, $8)`, [tool, event, detail, code, user, device, city, when]);
await add("live_scoreboard", "started", "football", "aaaa1111bbbb", ASHA, null, "Hyderabad", "2026-10-27T04:00:00Z");
await add("live_scoreboard", "finished", "football", "aaaa1111bbbb", ASHA, null, null, "2026-10-27T05:00:00Z");
await add("live_scoreboard", "started", "basketball", "cccc2222dddd", ASHA, null, "Secunderabad", "2026-10-27T06:00:00Z");
await add("live_scoreboard", "started", "football", "zzzz9999zzzz", ASHA, null, null, "2026-10-27T07:00:00Z");
await add("toss", "started", "", null, ASHA, null, "Hyderabad", "2026-10-27T08:00:00Z");
await add("toss", "started", "", null, null, "guest0001aa", "Pune", "2026-10-27T09:00:00Z");
await add("toss", "finished", "", null, null, "guest0001aa", null, "2026-10-27T09:00:05Z");
await add("team_generator", "finished", "10-players 2-teams", null, null, null, "Delhi", "2026-10-27T10:00:00Z");

const people = async (args = "'t'") =>
  q(`select user_id, device, name, username, city, first_at::text, last_at::text, tools from public.admin_tool_users(${args})`);
const users = await people();
eq(users.map((r) => r.user_id ?? r.device ?? "-"), ["-", "guest0001aa", ASHA], "one row per person, last used first");
const asha = users[2];
eq({ name: asha.name, username: asha.username, city: asha.city, first: asha.first_at, last: asha.last_at },
  { name: "Asha Patil", username: "asha_p", city: "Hyderabad", first: "2026-10-27 04:00:00+00", last: "2026-10-27 08:00:00+00" },
  "the account's name and username, the latest city, first and last use");
eq(asha.tools.map((t) => t.tool), ["toss", "live_scoreboard"], "their tools, last used first");
const board = asha.tools[1];
eq({ started: board.started, finished: board.finished }, { started: 3, finished: 1 }, "uses started and finished");
eq([Date.parse(board.first_at), Date.parse(board.last_at)], [Date.parse("2026-10-27T04:00:00Z"), Date.parse("2026-10-27T07:00:00Z")], "a tool's first and last use");
eq(board.details, ["football", "basketball"], "distinct tags, the latest first");
eq(board.codes, ["cccc2222dddd", "aaaa1111bbbb"], "distinct live link codes, the latest first; one that names no link is left out");
eq(asha.tools[0].details, [], "no tags");
const guest = users[1];
eq({ name: guest.name, user: guest.user_id, city: guest.city, tools: guest.tools.map((t) => [t.tool, t.started, t.finished, t.codes]) },
  { name: null, user: null, city: "Pune", tools: [["toss", 1, 1, []]] }, "a guest: no account, the device's uses");
eq(users[0].tools[0].details, ["10-players 2-teams"], "a guest without a device tag still shows");

// Bounded, and filtered in the database: the newest people only, one tool, signed in or guests.
eq((await people("'t', null, null, 2")).map((r) => r.user_id ?? r.device ?? "-"), ["-", "guest0001aa"], "at most p_limit people, the newest");
eq((await people("'t', null, null, 0")).length, 1, "at least one");
eq((await people("'t', 'toss'")).map((r) => r.user_id ?? r.device), ["guest0001aa", ASHA], "only those who used the tool");
eq((await people("'t', 'toss'"))[1].tools.map((t) => t.tool), ["toss", "live_scoreboard"], "with all their tools");
eq((await people("'t', null, 'signed'")).map((r) => r.user_id), [ASHA], "signed in only");
eq((await people("'t', null, 'guest'")).map((r) => r.user_id ?? r.device ?? "-"), ["-", "guest0001aa"], "guests only");
eq((await people("'t', 'nrr_calculator'")).length, 0, "nobody");

// The filters' counts: people per tool (signed in and guests) and every tool, and their uses.
const tally = await q(`select tool, signed, guests, uses from public.admin_tool_counts('t')`);
eq(tally, [
  { tool: null, signed: 1, guests: 2, uses: 6 },
  { tool: "live_scoreboard", signed: 1, guests: 0, uses: 3 },
  { tool: "team_generator", signed: 0, guests: 1, uses: 1 },
  { tool: "toss", signed: 1, guests: 1, uses: 2 },
], "per tool and every tool; a use is a start, or a finish when none started");
eq(await q(`select tool, signed, guests, uses from public.admin_tool_counts('t', 'guest')`), [
  { tool: null, signed: 0, guests: 2, uses: 2 },
  { tool: "team_generator", signed: 0, guests: 1, uses: 1 },
  { tool: "toss", signed: 0, guests: 1, uses: 1 },
], "guests only");

const feed = await q(`select used_at::text, tool, event, detail, code, user_id, device, city, name, username from public.admin_tool_activity('t')`);
eq(feed.map((r) => r.used_at), [
  "2026-10-27 10:00:00+00", "2026-10-27 09:00:05+00", "2026-10-27 09:00:00+00", "2026-10-27 08:00:00+00",
  "2026-10-27 07:00:00+00", "2026-10-27 06:00:00+00", "2026-10-27 05:00:00+00", "2026-10-27 04:00:00+00",
], "newest first");
eq(feed[5], { used_at: "2026-10-27 06:00:00+00", tool: "live_scoreboard", event: "started", detail: "basketball", code: "cccc2222dddd", user_id: ASHA, device: null, city: "Secunderabad", name: "Asha Patil", username: "asha_p" }, "who, tool and what");
eq(feed[4].code, null, "a code that names no link is left out");
eq((await q(`select tool from public.admin_tool_activity('t', 'toss')`)).map((r) => r.tool), ["toss", "toss", "toss"], "one tool");
eq((await q(`select count(*)::int as n from public.admin_tool_activity('t', null, 'signed')`))[0].n, 5, "signed in only");
eq((await q(`select count(*)::int as n from public.admin_tool_activity('t', null, 'guest')`))[0].n, 3, "guests only");
eq((await q(`select count(*)::int as n from public.admin_tool_activity('t', null, null, 2)`))[0].n, 2, "a limit");
eq((await q(`select count(*)::int as n from public.admin_tool_activity('t', null, null, 0)`))[0].n, 1, "at least one");

// Closed to the API, open only through the functions.
const cols = (await q(`select string_agg(column_name, ',') as c from information_schema.columns where table_schema = 'private' and table_name = 'tool_use_log'`))[0].c;
ok(!/\bip|phone|email/.test(cols), "no address, number or email in the log");
for (const fn of ["tool_use_record", "admin_tool_users", "admin_tool_counts", "admin_tool_activity"]) {
  const grants = await q(`select grantee from information_schema.routine_privileges where routine_name = $1 and privilege_type = 'EXECUTE'`, [fn]);
  ok(grants.some((g) => g.grantee === "anon") && !grants.some((g) => g.grantee === "PUBLIC"), `${fn}: anon may call it, PUBLIC not`);
  const def = (await q(`select prosecdef, proconfig from pg_proc where proname = $1`, [fn]))[0];
  ok(def.prosecdef === true && String(def.proconfig).includes("search_path="), `${fn}: security definer with a fixed search_path`);
}
const tableGrants = await q(`select grantee from information_schema.role_table_grants where table_schema = 'private' and table_name = 'tool_use_log' and grantee in ('anon', 'authenticated', 'PUBLIC')`);
eq(tableGrants.length, 0, "the log is closed to the API roles");
await assert.rejects(q(`insert into private.tool_use_log (tool, event, user_id, device) values ('toss', 'started', $1, 'abcdefgh1234')`, [ASHA]), /check/);
passed++;
// The old counter still works for instances on the old code.
eq((await q(`select public.tool_use_count('server-key', 'toss', 'started') as r`))[0].r, true, "tool_use_count still answers");
console.log(`tool_users: ${passed} checks passed`);
