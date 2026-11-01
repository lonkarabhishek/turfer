// Applies 20261021_live_matches.sql, the key checks of 20261021_accounts_usernames.sql
// and then 20261102_live_tournaments.sql (twice) to an in-memory Postgres (PGlite)
// with stand-ins for what they read (Supabase's roles, the key table, the owner
// check, users, pg_cron), and checks live tournaments: every function needs its
// server key (the live write key, or the account key for accounts); a create is
// all or nothing, within the per-network and site-wide limits; a change needs the
// organiser's secret and goes one at a time with the rev moving up; a fixture
// taken out is marked, never taken away; a finished live scorecard's result goes
// on the fixtures linked to it and nowhere else; what followers read has no
// secret, network hash or account; an account can keep a tournament and add a
// device; views are counts only; the admin read answers only the site owner;
// nobody reads the tables directly. Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/live_tournaments.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261102_live_tournaments.sql`;
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
create table cron.jobs (name text primary key, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
  $$ insert into cron.jobs values (job_name, schedule, command) on conflict (name) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;
create table private.app_secrets (name text primary key, value text not null);
create table public.users (id uuid primary key, name character varying, email text, phone text);
create table public.usernames (user_id uuid primary key, username text not null unique, taggable boolean default true);
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);
await db.exec(fs.readFileSync(`${M}/20261021_live_matches.sql`, "utf8"));
const accounts = fs.readFileSync(`${M}/20261021_accounts_usernames.sql`, "utf8");
const block = (from) => {
  const a = accounts.indexOf(from);
  const b = accounts.indexOf("$$;", a);
  assert.ok(a >= 0 && b > a, `no ${from}`);
  return accounts.slice(a, b + 3);
};
await db.exec(block("create or replace function private.account_key_ok"));
await db.exec(block("create or replace function private.live_key_ok"));
await db.exec(`
insert into private.app_secrets (name, value) values ('account', 'account-key') on conflict (name) do update set value = excluded.value;
update private.app_secrets set value = 'live-key' where name = 'live_write';
insert into public.users (id, name) values ('11111111-1111-4111-8111-111111111111', 'Asha Rao'), ('22222222-2222-4222-8222-222222222222', 'Ravi Kumar');
`);

const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b/i, "nothing destructive, nothing rewritten");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
assert.doesNotMatch(sql, /function\s+public\.(live_|admin_live)/i, "no live function is touched");
assert.doesNotMatch(sql, /cron\.schedule\(\s*'live-matches/i, "the live links' job is not touched");
passed += 4;
const fns = async () => q(`select p.oid::regprocedure::text as f, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private') order by 1`);
const before = await fns();
await db.exec(sql);
await db.exec(sql); // safe to run again
const after = (await fns()).filter((r) => !/tournament/.test(r.f));
eq(after, before, "every function from before is as it was");
const [{ n: overloads }] = await q(`select count(*)::int as n from pg_proc where proname = 'tournament_update'`);
eq(overloads, 1, "no overload after running it twice");
eq((await q(`select name, schedule from cron.jobs order by name`)).map((r) => [r.name, r.schedule]), [["live-matches-expire", "17 * * * *"], ["live-tournaments-iphash", "23 * * * *"]], "one new hourly job, the live links' as it was");

// ── Helpers ──
const S1 = "ab".repeat(32);
const S2 = "cd".repeat(32);
const NET = (n = 0) => String(n).padStart(32, "0");
const ASHA = "11111111-1111-4111-8111-111111111111";
const RAVI = "22222222-2222-4222-8222-222222222222";
const settings = (over = {}) => ({ format: "league", legs: 1, matches: 0, playoffs: "semis", overs: 6, points: { win: 2, tie: 1, nr: 1, loss: 0 }, venue: null, starts: null, ends: null, ...over });
const team = (name, short = null) => ({ name, short });
const TEAMS = ["Titans", "Strikers", "Royals", "Kings", "Blasters"].map((n) => team(n));
const fx = (id, home, away, over = {}) => ({ id, stage: "league", slot: null, round: id, seq: id - 1, home, away, day: null, time: null, result: null, ...over });
const FIXTURES = [fx(1, 1, 2), fx(2, 3, 4), fx(3, 5, 1), fx(4, null, null, { stage: "semi", slot: "s1", round: 9 }), fx(5, null, null, { stage: "final", slot: "f", round: 10 })];
const data = (over = {}) => ({ name: "Sunday Box League", settings: settings(), teams: TEAMS, fixtures: FIXTURES, ...over });
const create = async (code, d = data(), { key = "live-key", secret = S1, net = NET() } = {}) =>
  (await q(`select public.tournament_create($1, $2, $3, $4::jsonb, $5) as r`, [key, code, secret, JSON.stringify(d), net]))[0].r;
const update = async (code, op, d = {}, { key = "live-key", secret = S1 } = {}) =>
  (await q(`select public.tournament_update($1, $2, $3, $4, $5::jsonb) as r`, [key, code, secret, op, JSON.stringify(d)]))[0].r;
const get = async (code, key = "live-key") => (await q(`select public.tournament_get($1, $2) as r`, [key, code]))[0].r;
const count = async (table, where = "true") => (await q(`select count(*)::int as n from private.${table} where ${where}`))[0].n;
const inn = (runs, balls = 36, wickets = 4, allOut = false) => ({ runs, wickets, balls, allOut });
const RESULT = { a: inn(63), b: inn(54, 30, 10, true), result: "auto", battedFirst: "a" };

// ── Create ──
eq(await create("t00000000001", data(), { key: "wrong" }), { r: "unavailable" }, "a wrong key makes nothing");
eq(await create("t00000000001", data(), { key: null }), { r: "unavailable" }, "no key makes nothing");
eq(await create("BAD", data()), { r: "bad" }, "a code that isn't one");
eq(await create("t00000000001", data(), { secret: "short" }), { r: "bad" }, "a secret that isn't one");
eq(await create("t00000000001", data(), { net: "x" }), { r: "bad" }, "no network hash");
eq(await create("t00000000001", data({ teams: [team("A")] })), { r: "bad" }, "one team");
eq(await create("t00000000001", data({ teams: Array.from({ length: 17 }, (_, i) => team(`T${i}`)) })), { r: "bad" }, "seventeen teams");
eq(await create("t00000000001", data({ settings: settings({ format: "bilateral" }) })), { r: "bad" }, "a series is two teams");
eq(await create("t00000000001", data({ settings: settings({ format: "knockout" }) })), { r: "bad" }, "a format it doesn't know");
eq(await create("t00000000001", data({ settings: settings({ overs: 500 }) })), { r: "bad" }, "settings out of range");
eq(await create("t00000000001", data({ name: "" })), { r: "bad" }, "no name");
eq(await create("t00000000001", data({ name: "x".repeat(61) })), { r: "bad" }, "a name too long");
eq(await create("t00000000001", data({ fixtures: [] })), { r: "bad" }, "no fixtures");
eq(await create("t00000000001", data({ fixtures: Array.from({ length: 301 }, (_, i) => fx(i + 1, 1, 2)) })), { r: "bad" }, "301 fixtures");
// All or nothing: a bad part leaves nothing behind.
eq(await create("t00000000001", data({ teams: [team("Titans"), team("titans"), team("Royals")] })), { r: "bad" }, "a team twice, in any case");
eq(await create("t00000000001", data({ fixtures: [fx(1, 1, 9)] })), { r: "bad" }, "a fixture with a team not in it");
eq(await create("t00000000001", data({ fixtures: [fx(1, 1, 1)] })), { r: "bad" }, "a team against itself");
eq(await create("t00000000001", data({ fixtures: [fx(1, 1, 2), fx(1, 3, 4)] })), { r: "bad" }, "a fixture id twice");
eq(await create("t00000000001", data({ fixtures: [fx(1, null, 2)] })), { r: "bad" }, "a league match with a team missing");
eq(await create("t00000000001", data({ fixtures: [fx(1, 1, 2, { result: { a: inn(-1), b: inn(1) } })] })), { r: "bad" }, "a result that isn't one");
eq(await create("t00000000001", data({ teams: [team("Titans", "toolong"), ...TEAMS.slice(1)] })), { r: "bad" }, "a short code past 4");
eq([await count("tournaments"), await count("tournament_teams"), await count("tournament_fixtures")], [0, 0, 0], "nothing kept from any of them");

eq(await create("t00000000001", data({ fixtures: [...FIXTURES.slice(0, 2), fx(3, 5, 1, { result: RESULT })], teams: [team("Titans", "TIT"), ...TEAMS.slice(1)] })), { r: "ok", rev: 1 }, "a tournament");
eq(await create("t00000000001", data()), { r: "taken" }, "the same code again");
eq([await count("tournament_teams"), await count("tournament_fixtures")], [5, 3], "its teams and fixtures");
const [row] = await q(`select secret_hashes, ip_hash, user_id, rev, writes from private.tournaments where code = 't00000000001'`);
ok(row.secret_hashes.length === 1 && Buffer.from(row.secret_hashes[0]).toString("hex") !== S1, "only the secret's hash is kept");
eq([row.user_id, Number(row.rev), row.writes], [null, 1, 0], "no account, rev 1");

// Limits: 5 an hour and 20 a day per network, 100 an hour site-wide.
for (let i = 2; i <= 5; i++) eq((await create(`t0000000000${i}`)).r, "ok", `network 0: tournament ${i}`);
eq(await create("t00000000006"), { r: "limit" }, "a sixth this hour from one network");
eq((await create("t00000000006", data(), { net: NET(1) })).r, "ok", "another network");
await q(`update private.tournaments set created_at = now() - interval '2 hours' where ip_hash = $1`, [NET()]);
for (let i = 7; i <= 21; i++) await q(`insert into private.tournaments (code, secret_hashes, name, format, settings, ip_hash, created_at) values ($1, array['\\x00'::bytea], 'x', 'league', $2::jsonb, $3, now() - interval '3 hours')`, [`t${String(i).padStart(11, "0")}`, JSON.stringify(settings()), NET()]);
eq(await create("t00000000099"), { r: "limit" }, "twenty in a day from one network");
for (let i = 0; i < 80; i++) await q(`insert into private.tournaments (code, secret_hashes, name, format, settings, ip_hash) values ($1, array['\\x00'::bytea], 'x', 'league', $2::jsonb, $3)`, [`b${String(i).padStart(11, "0")}`, JSON.stringify(settings()), NET(100 + i)]);
eq(await count("tournaments", "created_at > now() - interval '1 hour'"), 81, "81 made this hour");
for (let i = 0; i < 19; i++) eq((await create(`c${String(i).padStart(11, "0")}`, data(), { net: NET(500 + i) })).r, "ok", `site-wide ${82 + i}`);
eq(await create("d00000000000", data(), { net: NET(999) }), { r: "busy" }, "the hundred-and-first this hour, site-wide");
// The hourly job's statement clears network hashes past 47 hours.
await q(`update private.tournaments set created_at = now() - interval '48 hours' where code = 't00000000002'`);
await q((await q(`select command from cron.jobs where name = 'live-tournaments-iphash'`))[0].command);
eq((await q(`select ip_hash from private.tournaments where code in ('t00000000002', 't00000000003') order by code`)).map((r) => r.ip_hash), [null, NET()], "only hashes past 47 hours");

// ── Read ──
eq(await get("t00000000001", "wrong"), { r: "unavailable" }, "the read needs the key");
eq(await get("zzzzzzzzzzzz"), null, "no such tournament");
eq(await get(null), null, "no code");
const t1 = await get("t00000000001");
eq(Object.keys(t1).sort(), ["code", "created_at", "fixtures", "name", "rev", "settings", "status", "teams", "updated_at"], "nothing but these: no secret, network or account");
eq(t1.teams[0], { id: 1, name: "Titans", short: "TIT" }, "teams by id");
eq(t1.fixtures.map((f) => f.id), [1, 2, 3], "fixtures in order");
eq(t1.fixtures[2].result, RESULT, "a result as it was given");
eq(Object.keys(t1.fixtures[0]).sort(), ["away", "day", "home", "id", "live", "live_result", "result", "round", "seq", "slot", "stage", "time"], "a fixture's fields");

// ── Change ──
const C = "t00000000001";
eq(await update(C, "fixture_remove", { id: 2 }, { key: "wrong" }), { r: "unavailable" }, "a change needs the key");
eq(await update(C, "fixture_remove", { id: 2 }, { secret: S2 }), { r: "forbidden" }, "and the organiser's secret");
eq(await update("zzzzzzzzzzzz", "fixture_remove", { id: 2 }), { r: "gone" }, "no such tournament");
eq(await update(C, "drop_everything", {}), { r: "bad" }, "an op it doesn't know");
eq(await update(C, "fixture_remove", { id: "1; select" }), { r: "bad" }, "an id that isn't one");
eq(await update(C, "team", { id: 2, name: "Thunder", short: "THU" }), { r: "ok", rev: 2 }, "a team renamed");
eq(await update(C, "team", { id: 3, name: "thunder", short: null }), { r: "taken" }, "a name in use, in any case");
eq(await update(C, "team", { id: 9, name: "Ghost", short: null }), { r: "bad" }, "a team that isn't there");
eq(await update(C, "team", { id: 3, name: "", short: null }), { r: "bad" }, "a blank name");
eq((await update(C, "settings", { name: "Sunday League", settings: settings({ overs: 8, venue: { id: "6f2b1c2d-0000-4000-8000-000000000001", slug: "ranangan-baner", name: "Ranangan", area: "Baner" } }) })).r, "ok", "settings");
eq(await update(C, "settings", { name: "x", settings: settings({ format: "tri" }) }), { r: "bad" }, "the format stays as made");
eq((await update(C, "fixture_add", { stage: "league", slot: null, round: 4, home: 2, away: 4, day: "2026-11-08", time: "19:30" })).r, "ok", "a fixture added");
eq(await update(C, "fixture_add", { stage: "league", slot: null, round: 4, home: 2, away: 2, day: null, time: null }), { r: "bad" }, "not a team against itself");
eq(await update(C, "fixture_add", { stage: "league", slot: null, round: 4, home: 2, away: 12, day: null, time: null }), { r: "bad" }, "not a team that isn't in it");
eq(await update(C, "fixture_add", { stage: "league", slot: null, round: 4, home: 2, away: 3, day: "2026-02-30", time: null }), { r: "bad" }, "not a day that isn't one");
eq(await update(C, "fixture_add", { stage: "league", slot: null, round: 4, home: 2, away: 3, day: null, time: "25:00" }), { r: "bad" }, "nor a time");
const added = (await get(C)).fixtures.find((f) => f.id === 4);
eq([added.home, added.away, added.day, added.time, added.seq], [2, 4, "2026-11-08", "19:30", 3], "the next id, at the end");
eq((await update(C, "fixture_edit", { id: 4, round: 5, home: 4, away: 2, day: "2026-11-09", time: null })).r, "ok", "rescheduled");
eq((await get(C)).fixtures.find((f) => f.id === 4).day, "2026-11-09", "the new day");
eq((await update(C, "fixture_order", { ids: [4, 3, 2, 1] })).r, "ok", "moved");
eq((await get(C)).fixtures.map((f) => f.id), [4, 3, 2, 1], "in the new order");
eq((await update(C, "fixture_remove", { id: 2 })).r, "ok", "taken out");
eq((await get(C)).fixtures.map((f) => f.id), [4, 3, 1], "not shown");
eq(await count("tournament_fixtures", `code = '${C}' and id = 2 and status = 'removed'`), 1, "but kept, marked removed");
eq(await update(C, "fixture_remove", { id: 2 }), { r: "bad" }, "not twice");
eq(await update(C, "fixture_edit", { id: 2, round: 1, home: 1, away: 3, day: null, time: null }), { r: "bad" }, "nor changed after");
eq((await update(C, "result", { id: 1, result: RESULT })).r, "ok", "a result");
eq(await update(C, "result", { id: 1, result: { ...RESULT, result: "dls" } }), { r: "bad" }, "a result that isn't one");
eq((await update(C, "result", { id: 1, result: null })).r, "ok", "a result cleared");
eq((await get(C)).fixtures.find((f) => f.id === 1).result, null, "cleared");
// A playoff: its places pinned when it is played, never changed once set.
eq((await update(C, "fixture_add", { stage: "semi", slot: "s1", round: 9, home: null, away: null, day: null, time: null })).r, "ok", "a semi-final, teams to come");
eq(await update(C, "result", { id: 5, result: RESULT }), { r: "bad" }, "no result without its teams");
eq((await update(C, "result", { id: 5, result: RESULT, home: 1, away: 4 })).r, "ok", "a result with its teams pinned");
eq((await update(C, "result", { id: 5, result: RESULT, home: 3, away: 5 })).r, "ok", "pinning again");
const sf = (await get(C)).fixtures.find((f) => f.id === 5);
eq([sf.home, sf.away], [1, 4], "keeps the teams it had");
// Live links.
eq(await update(C, "live_link", { id: 4, live_code: "NOPE" }), { r: "bad" }, "a live code that isn't one");
eq((await update(C, "live_link", { id: 4, live_code: "livelinkaaaa" })).r, "ok", "linked to a live scorecard");
eq((await get(C)).fixtures.find((f) => f.id === 4).live, "livelinkaaaa", "followers see the code");
const rev0 = Number((await get(C)).rev);
eq((await update(C, "live_unlink", { id: 4 })).rev, rev0 + 1, "unlinked; the rev moves on");
eq((await get(C)).fixtures.find((f) => f.id === 4).live, null, "no code");
// One at a time, and capped.
const results = await Promise.all([1, 3, 4].map((id) => update(C, "fixture_edit", { id, round: 2, home: id === 4 ? 4 : id === 3 ? 5 : 1, away: id === 4 ? 2 : id === 3 ? 1 : 2, day: null, time: null })));
const revs = results.map((r) => Number(r.rev)).sort((a, b) => a - b);
eq(revs, [rev0 + 2, rev0 + 3, rev0 + 4], "changes at once each get their own rev");
await q(`update private.tournaments set writes = 5000 where code = $1`, [C]);
eq(await update(C, "fixture_remove", { id: 1 }), { r: "limit" }, "5000 changes");
await q(`update private.tournaments set writes = 10 where code = $1`, [C]);
const big = "t00000000003";
for (let i = (await get(big)).fixtures.length; i < 300; i++) await update(big, "fixture_add", { stage: "league", slot: null, round: 1, home: 1, away: 2, day: null, time: null });
eq((await get(big)).fixtures.length, 300, "300 fixtures");
eq(await update(big, "fixture_add", { stage: "league", slot: null, round: 1, home: 1, away: 2, day: null, time: null }), { r: "limit" }, "and no more");

// ── A finished live scorecard ──
const NETL = "0".repeat(32);
const SECRET = "ef".repeat(32);
const putLive = async (code, status, rev) =>
  (await q(`select public.live_match_put('live-key', $1, $2, $3::jsonb, $4, $5, $6) as r`, [code, SECRET, JSON.stringify({ v: 1, id: "m1", setup: { teamA: "Titans", teamB: "Kings" }, events: [] }), status, rev, NETL]))[0].r;
const LR = { a: { name: "Titans", runs: 63, wickets: 4, balls: 36, allOut: false }, b: { name: "Kings", runs: 54, wickets: 10, balls: 30, allOut: true }, outcome: "a", battedFirst: "a", text: "Titans won by 9 runs" };
const liveResult = async (code, lr, rev, key = "live-key") => (await q(`select public.tournament_live_result($1, $2, $3::jsonb, $4) as r`, [key, code, JSON.stringify(lr), rev]))[0].r;
eq((await update(C, "live_link", { id: 4, live_code: "livelinkbbbb" })).r, "ok", "fixture 4 scored live");
eq((await update("t00000000004", "live_link", { id: 1, live_code: "livelinkbbbb" })).r, "ok", "and a fixture of another tournament on the same scorecard");
eq((await update(C, "live_link", { id: 1, live_code: "livelinkbbbb" })).r, "ok", "fixture 1 too, with a result by hand");
eq((await update(C, "result", { id: 1, result: RESULT })).r, "ok", "the hand result");
eq((await putLive("livelinkbbbb", "live", 1)).r, "ok", "the scorecard is being scored");
eq(await liveResult("livelinkbbbb", LR, 1), { r: "none" }, "not while it is still being played");
await q(`update public.live_matches set updated_at = updated_at - interval '1 second'`);
eq((await putLive("livelinkbbbb", "done", 2)).r, "ok", "finished");
eq(await liveResult("livelinkbbbb", LR, 2, "wrong"), { r: "unavailable" }, "the key first");
eq(await liveResult("livelinkbbbb", { ...LR, outcome: "draw" }, 2), { r: "bad" }, "a result that isn't one");
eq(await liveResult("livelinkbbbb", { ...LR, a: { ...LR.a, name: "x".repeat(41) } }, 2), { r: "bad" }, "a name too long");
eq(await liveResult("nolinknolink", LR, 2), { r: "none" }, "a scorecard that isn't there");
const revBefore = Number((await get(C)).rev);
const writesOf = async (code) => (await q(`select writes from private.tournaments where code = $1`, [code]))[0].writes;
const writesBefore = await writesOf(C);
eq(await liveResult("livelinkbbbb", LR, 2), { r: "ok", codes: [C, "t00000000004"] }, "both tournaments");
const f4 = (await get(C)).fixtures.find((f) => f.id === 4);
eq([f4.live_result, f4.result], [LR, null], "the result kept on the fixture");
eq((await get(C)).fixtures.find((f) => f.id === 1).result, RESULT, "the hand result stays in front (the app reads it first)");
eq(Number((await get(C)).rev), revBefore + 1, "the rev moves on, for followers");
eq(await writesOf(C), writesBefore, "not counted as the organiser's change");
eq(await liveResult("livelinkbbbb", LR, 2), { r: "none" }, "the same rev again changes nothing");
eq(await liveResult("livelinkbbbb", { ...LR, text: "Kings won" }, 1), { r: "none" }, "nor an older one");
eq((await update(C, "fixture_remove", { id: 4 })).r, "ok", "fixture 4 taken out");
await q(`update public.live_matches set updated_at = updated_at - interval '1 second'`);
eq((await putLive("livelinkbbbb", "done", 3)).r, "ok", "the scorer fixed the last ball");
eq(await liveResult("livelinkbbbb", { ...LR, text: "Titans won by 10 runs" }, 3), { r: "ok", codes: [C, "t00000000004"] }, "a newer result");
eq(await count("tournament_fixtures", `code = '${C}' and id = 4 and live_rev = 2`), 1, "not on a fixture taken out");

// ── Accounts ──
const attach = async (code, secret, user, key = "account-key") => (await q(`select public.tournament_attach($1, $2, $3, $4) as r`, [key, code, secret, user]))[0].r.r;
const device = async (code, user, secret, key = "account-key") => (await q(`select public.tournament_device_add($1, $2, $3, $4) as r`, [key, code, user, secret]))[0].r.r;
const mine = async (user, key = "account-key") => (await q(`select public.tournament_mine($1, $2) as r`, [key, user]))[0].r;
eq(await attach(C, S1, ASHA, "live-key"), "unavailable", "the account key, not the live one");
eq(await attach(C, S2, ASHA), "forbidden", "the secret");
eq(await attach(C, S1, "33333333-3333-4333-8333-333333333333"), "bad", "an account that exists");
eq(await attach(C, S1, ASHA), "ok", "kept with Asha's account");
eq(await attach(C, S1, ASHA), "known", "again: known");
eq(await attach(C, S1, RAVI), "other", "the first account stays");
eq(await device(C, RAVI, S2), "forbidden", "Ravi's account can't add a device");
eq(await device(C, ASHA, S2, "live-key"), "unavailable", "the account key");
eq(await device(C, ASHA, S2), "ok", "Asha's other phone");
eq(await device(C, ASHA, S2), "known", "once");
eq((await update(C, "team", { id: 4, name: "Kings XI", short: null }, { secret: S2 })).r, "ok", "which can change it now");
for (let i = 0; i < 12; i++) await device(C, ASHA, i.toString(16).padStart(2, "0").repeat(32));
const hashes = (await q(`select cardinality(secret_hashes) as n from private.tournaments where code = $1`, [C]))[0].n;
eq(hashes, 10, "the 10 newest secrets kept");
eq(await update(C, "team", { id: 4, name: "Kings", short: null }, { secret: S1 }), { r: "forbidden" }, "the oldest went");
eq((await update(C, "team", { id: 4, name: "Kings", short: null }, { secret: "0b".repeat(32) })).r, "ok", "the newest works");
eq(await mine(ASHA, "live-key"), { r: "unavailable" }, "the list needs the account key");
const list = (await mine(ASHA)).list;
eq(list.map((x) => [x.code, x.name, x.format, x.teams, x.fixtures, x.played]), [[C, "Sunday League", "league", 5, 3, 3]], "Asha's tournaments, with counts (1, 3 and the semi; 2 and 4 taken out)");
eq(Object.keys(list[0]).sort(), ["code", "created_at", "fixtures", "format", "name", "played", "status", "teams", "updated_at"], "nothing more");
eq((await mine(RAVI)).list, [], "none of Ravi's");

// ── Views ──
const view = async (code, unique, key = "live-key") => (await q(`select public.tournament_view_add($1, $2, $3) as r`, [key, code, unique]))[0].r;
const views = async (code, key = "live-key") => (await q(`select public.tournament_view_count($1, $2) as r`, [key, code]))[0].r;
eq(await view(C, true, "wrong"), { r: "unavailable" }, "a view needs the key");
eq(await views(C), { r: "ok", views: 0, viewers: 0 }, "no views yet");
eq(await view(C, true), { r: "ok", views: 1, viewers: 1 }, "a first view");
eq(await view(C, false), { r: "ok", views: 2, viewers: 1 }, "again");
await Promise.all([view(C, true), view(C, false)]);
eq(await views(C), { r: "ok", views: 4, viewers: 2 }, "at once, both count");
eq(await view("zzzzzzzzzzzz", true), { r: "none" }, "no such tournament");
eq(await views("BAD"), { r: "bad" }, "a code that isn't one");
eq(await q(`select column_name from information_schema.columns where table_schema = 'private' and table_name = 'tournament_views' order by ordinal_position`).then((r) => r.map((c) => c.column_name)), ["code", "views", "viewers", "first_viewed_at", "last_viewed_at"], "nothing about who viewed");

// ── Admin ──
await db.exec(`set test.owner = 'no'`);
await assert.rejects(q(`select * from public.admin_tournaments(null)`), /not allowed/);
passed++;
await db.exec(`set test.owner = 'yes'`);
eq((await update("t00000000005", "live_link", { id: 2, live_code: "livelinkcccc" })).r, "ok", "a fixture of t5 scored live");
eq((await putLive("livelinkcccc", "live", 1)).r, "ok", "being scored now");
const rows = await q(`select * from public.admin_tournaments('t')`);
eq(Object.keys(rows[0]), ["code", "name", "format", "status", "playoffs", "teams", "fixtures", "played", "live_now", "views", "viewers", "organiser_id", "organiser_name", "created_at", "updated_at"], "the admin read's columns: no secret, no network hash");
const r1 = rows.find((r) => r.code === C);
eq([r1.name, r1.teams, r1.fixtures, r1.played, Number(r1.views), Number(r1.viewers), r1.organiser_id, r1.organiser_name], ["Sunday League", 5, 3, 3, 4, 2, ASHA, "Asha Rao"], "counts, views and the organiser");
eq(rows.find((r) => r.code === "t00000000005").live_now, 1, "a match being scored now");
await q(`update public.live_matches set updated_at = now() - interval '3 hours' where code = 'livelinkcccc'`);
eq((await q(`select live_now from public.admin_tournaments('t') where code = 't00000000005'`))[0].live_now, 0, "not once it closed for want of updates");
ok(rows.length === (await count("tournaments")), "every tournament");

// ── Taken down ──
eq((await update("t00000000004", "remove", {})).r, "ok", "a tournament taken down");
eq(Object.keys(await get("t00000000004")).sort(), ["code", "rev", "status", "updated_at"], "followers see only that");
eq((await get("t00000000004")).status, "removed", "removed");
eq(await update("t00000000004", "team", { id: 1, name: "X", short: null }), { r: "gone" }, "no more changes");
eq(await view("t00000000004", true), { r: "none" }, "nor views");
eq(await count("tournament_fixtures", "code = 't00000000004'"), 5, "its fixtures are kept");
await q(`update public.live_matches set updated_at = updated_at - interval '1 second'`);

// ── Nobody but the server ──
for (const role of ["anon", "authenticated"]) {
  for (const t of ["tournaments", "tournament_teams", "tournament_fixtures", "tournament_views"]) {
    for (const p of ["select", "insert", "update"]) ok(!(await q(`select has_table_privilege($1, $2, $3) as p`, [role, `private.${t}`, p]))[0].p, `${role} cannot ${p} ${t}`);
  }
}
const PUBLIC_FNS = [
  "tournament_create(text,text,text,jsonb,text)",
  "tournament_update(text,text,text,text,jsonb)",
  "tournament_live_result(text,text,jsonb,bigint)",
  "tournament_get(text,text)",
  "tournament_view_add(text,text,boolean)",
  "tournament_view_count(text,text)",
  "tournament_attach(text,text,text,uuid)",
  "tournament_device_add(text,text,uuid,text)",
  "tournament_mine(text,uuid)",
  "admin_tournaments(text)",
];
for (const fn of PUBLIC_FNS) {
  ok((await q(`select has_function_privilege('anon', $1, 'execute') as p`, [`public.${fn}`]))[0].p, `${fn}: anon may call it (the check is inside)`);
  const grants = await q(`select grantee from information_schema.routine_privileges where specific_name ~ $1 and privilege_type = 'EXECUTE'`, [`^${fn.split("(")[0]}_[0-9]+$`]);
  ok(!grants.some((g) => g.grantee === "PUBLIC"), `${fn}: not PUBLIC`);
  const def = (await q(`select prosecdef, proconfig from pg_proc where oid = $1::regprocedure`, [`public.${fn}`]))[0];
  ok(def.prosecdef === true && String(def.proconfig).includes('search_path=""'), `${fn}: security definer with an empty search_path`);
}
for (const fn of ["tournament_innings_ok(jsonb)", "tournament_result_ok(jsonb)", "tournament_live_result_ok(jsonb)", "tournament_settings_ok(jsonb)"]) {
  for (const role of ["anon", "authenticated"]) ok(!(await q(`select has_function_privilege($1, $2, 'execute') as p`, [role, `private.${fn}`]))[0].p, `private.${fn}: not ${role}'s`);
}

console.log(`live_tournaments: ${passed} checks passed`);
