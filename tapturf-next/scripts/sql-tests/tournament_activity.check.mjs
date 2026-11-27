// Applies 20261128_tournament_activity.sql (twice) to an in-memory Postgres
// (PGlite) on top of the real live tournaments (20261102_live_tournaments.sql,
// with 20261021_live_matches.sql and the real key checks before it), all read
// from the repo's migrations, with stand-ins only for what those read
// (Supabase's roles, the key table, pg_cron, public.users, the site owner
// check), and checks: the file's rules (additive, none of the destructive
// keywords even inside a word or a comment, no backslash anywhere, a guard
// first, search_path '', its header's md5s are the repo's latest bodies,
// nothing replaced); it refuses to run without what it needs; a tournament
// from before has an empty log and one being made notes nothing; every kind
// of entry, through the real tournament functions, with exactly the fields
// the header names; a write that changes nothing a follower sees notes
// nothing and does not touch the tournament's row; a finished live scorecard
// still raises each tournament's rev once; the newest 100 are kept, and fewer
// when they would be too big; nothing private is ever stored (no account, no
// secret or its hash, no network hash); a trigger that fails never fails the
// write; the read is gated and granted as tournament_get and answers null for
// anything that is not a tournament that is on; every function from before is
// as it was. Then it runs the live tournaments' and the tournament host's own
// checks with this file applied under them. Never touches a real database.
// Made-up teams.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/tournament_activity.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: tournament_activity.check.mjs <supabase/migrations>");
const NAME = "20261128_tournament_activity.sql";
const NEW = fs.readFileSync(`${M}/${NAME}`, "utf8");
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const md5 = (s) => createHash("md5").update(s).digest("hex");

// ── 0. The file. ──
const code = NEW.replace(/^\s*--.*$/gm, "");
assert.doesNotMatch(NEW, /drop|delete|truncate/i, "none of the destructive keywords, not in a comment, not inside a word");
assert.ok(!NEW.includes(String.fromCharCode(92)), "no backslash anywhere in the file");
assert.doesNotMatch(NEW, /[—–]/, "no em or en dashes");
assert.match(NEW, /^set local lock_timeout = '5s';\n/, "starts with the lock timeout");
assert.match(code.replace(/^set local lock_timeout = '5s';/, "").trimStart(), /^do \$\$\nbegin\n  if to_regprocedure\('private\.live_key_ok\(text\)'\) is null/, "the guard is the first thing it runs");
assert.doesNotMatch(code, /\bcreate\s+(table|index|unique|policy|schema|type|view)\b|cron\.schedule/i, "no table, index, policy or job");
assert.doesNotMatch(code, /\binsert\s+into\b/i, "it inserts nothing");
assert.doesNotMatch(code, /\bafter\s+(insert\s+or\s+)?update\s+or\b|\bfor\s+each\s+statement\b/i, "row triggers on insert and on update only");
assert.doesNotMatch(code, /\bgrant\b[^;]*\bon\s+(?!function public\.tournament_activity\()/i, "the one grant is on its own read");
assert.doesNotMatch(code, /function\s+public\.tournament_(get|update|create|live_result|attach|device_add|mine|host|view_add|view_count)\b/i, "no tournament function from before is made again");
passed += 10;
const UPDATES = [...code.matchAll(/\bupdate\s+((?:public|private)\.\w+)/gi)].map((m) => m[1]);
eq([...new Set(UPDATES)], ["private.tournaments"], "the only table it writes is private.tournaments");
eq([...code.matchAll(/\balter\s+table\s+(\S+)\s+add\s+(column|constraint)/gi)].map((m) => `${m[1]} ${m[2]}`), ["private.tournaments column", "private.tournaments constraint"], "one column and one check, on private.tournaments");
const MADE = [...NEW.matchAll(/^create or replace function (\w+)\.(\w+)\(/gim)].map((m) => `${m[1]}.${m[2]}`);
eq(MADE, ["private.tournament_activity_add", "private.tournament_activity_settings", "private.tournament_activity_team", "private.tournament_activity_fixture", "public.tournament_activity"], "exactly five functions");
const TRIGGERS = [...code.matchAll(/create or replace trigger (\w+)\s+(before|after) (insert|update) on (\S+)/g)].map((m) => `${m[1]} ${m[2]} ${m[3]} ${m[4]}`);
eq(TRIGGERS, [
  "tournaments_activity_note before update private.tournaments",
  "tournament_teams_activity_add after insert private.tournament_teams",
  "tournament_teams_activity_note after update private.tournament_teams",
  "tournament_fixtures_activity_add after insert private.tournament_fixtures",
  "tournament_fixtures_activity_note after update private.tournament_fixtures",
], "five triggers, the ones the header names");
eq((code.match(/set search_path = ''/g) ?? []).length, 5, "each function with an empty search_path");
eq((code.match(/security definer/g) ?? []).length, 4, "the three trigger functions and the read are security definer");
eq((code.match(/exception when others then\s+raise warning/g) ?? []).length, 3, "each trigger function turns an error into a warning");
for (const fn of ["tournament_activity_add(jsonb, jsonb)", "tournament_activity_settings()", "tournament_activity_team()", "tournament_activity_fixture()"])
  ok(code.includes(`revoke all on function private.${fn} from public, anon, authenticated;`), `private.${fn}: nobody's to call`);
ok(code.includes("revoke all on function public.tournament_activity(text, text) from public, anon, authenticated;\n\ngrant execute on function public.tournament_activity(text, text) to anon, authenticated;") || /revoke all on function public\.tournament_activity\(text, text\) from public, anon, authenticated;\s+grant execute on function public\.tournament_activity\(text, text\) to anon, authenticated;/.test(code), "the read: revoked, then granted as tournament_get is");
for (const w of ["give an\n-- activity tab for tournaments page", "Replaced: none.", "production was not read for this file", "Nothing private is ever in it", "no tournament function is replaced", "The app works before this file", "Safe to run again", "No string in this\n-- file has a backslash", "Erasing an account", "Never in a title, a description, an og tag or JSON-LD", "the change always goes through"])
  ok(NEW.includes(w), `the header says: ${w.replace(/\n-- /g, " ")}`);

// The header's md5s: each the md5 of that function's latest body in the repo's migrations (file name order), as md5(prosrc) gives it.
const HEADER = [...NEW.matchAll(/^--\s+(public|private)\.(\w+)\s+([0-9a-f]{32})\b(?:\s+(\S+\.sql))?/gm)].map((m) => ({ fn: `${m[1]}.${m[2]}`, md5: m[3], file: m[4] ?? null }));
const FILES = fs.readdirSync(M).filter((f) => f.endsWith(".sql")).sort();
const repoDef = (fn) => {
  const [s, f] = fn.split(".");
  let last = null;
  for (const file of FILES) {
    if (file === NAME) continue;
    const txt = fs.readFileSync(`${M}/${file}`, "utf8");
    const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+${s}\\.${f}\\s*\\(`, "gi");
    for (let m; (m = re.exec(txt)); ) {
      const rest = txt.slice(m.index);
      const d = /\bas\s+(\$[A-Za-z_]*\$)/i.exec(rest);
      if (!d) continue;
      const start = d.index + d[0].length;
      const end = rest.indexOf(d[1], start);
      last = { body: rest.slice(start, end), sql: rest.slice(0, end + d[1].length) + ";", file };
    }
  }
  return last;
};
const NAMED = ["private.live_key_ok", "public.tournament_create", "public.tournament_update", "public.tournament_live_result", "public.tournament_attach", "public.tournament_device_add", "public.tournament_get"];
eq(HEADER.map((h) => h.fn), NAMED, "the header lists the function it calls and the ones whose writes it sees");
for (const h of HEADER) {
  const def = repoDef(h.fn);
  eq(md5(def?.body ?? ""), h.md5, `${h.fn}: the header's md5 is the repo's latest body`);
  eq(def?.file, h.file, `${h.fn}: and the header names the file that has it`);
}
const calls = new Set([...code.matchAll(/\b(public|private)\.(\w+)\s*\(/g)].map((m) => `${m[1]}.${m[2]}`).filter((f) => !MADE.includes(f)));
eq([...calls].sort(), ["private.live_key_ok"], "it calls exactly one function from before");
for (const fn of MADE) eq(repoDef(fn), null, `${fn} is new: no earlier file has it`);
const bodyOf = (fn) => {
  const from = NEW.indexOf("as $$", NEW.indexOf(`create or replace function ${fn}(`)) + 5;
  return NEW.slice(from, NEW.indexOf("$$;", from));
};
for (const fn of MADE) ok(!/user_id|secret|ip_hash|\bemail\b|\bphone\b|public\.users|usernames/i.test(bodyOf(fn)), `${fn}: its body reads no account, secret, network hash or person`);
assert.match(bodyOf("public.tournament_activity"), /^\nbegin\n  if not private\.live_key_ok\(p_key\) then\n    return jsonb_build_object\('r', 'unavailable'\);\n  end if;/, "the read checks the key before anything is read, and refuses as tournament_get does");
passed++;

// ── The database before it: the real files, with stand-ins for what they read. ──
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const BASE = `
create role anon; create role authenticated;
create schema private;
grant usage on schema public to anon, authenticated;
create schema cron;
create table cron.jobs (name text primary key, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
  $$ insert into cron.jobs values (job_name, schedule, command) on conflict (name) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;
create table private.app_secrets (name text primary key, value text not null);
create table public.users (id uuid primary key, name character varying, email text, phone text);
create table public.usernames (user_id uuid primary key, username text not null unique, taggable boolean default true);
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as $$ select false $$;
`;
await db.exec(BASE);
await db.exec(fs.readFileSync(`${M}/20261021_live_matches.sql`, "utf8"));
await db.exec(repoDef("private.account_key_ok").sql);
await db.exec(repoDef("private.live_key_ok").sql);
eq(md5((await one(`select prosrc from pg_proc where proname = 'live_key_ok'`)).prosrc), HEADER[0].md5, "the key check loaded here is the body the header names");
await db.exec(`
insert into private.app_secrets (name, value) values ('account', 'account-key') on conflict (name) do update set value = excluded.value;
insert into private.app_secrets (name, value) values ('live_write', 'live-key') on conflict (name) do update set value = excluded.value;
`);
const LIVE = "live-key";
const ACCOUNT = "account-key";

// Refuses to run without what it needs, changing nothing.
{
  const bare = new PGlite();
  await bare.exec(`create role anon; create role authenticated; create schema private;`);
  await assert.rejects(bare.exec(`begin; ${NEW}; commit;`), /tournament_activity needs/, "without the earlier files it refuses");
  await bare.exec("rollback");
  eq((await bare.query(`select to_regprocedure('public.tournament_activity(text, text)') as f, to_regprocedure('private.tournament_activity_add(jsonb, jsonb)') as g`)).rows[0], { f: null, g: null }, "and leaves nothing behind");
  await bare.close();
}
await assert.rejects(db.exec(`begin; ${NEW}; commit;`), /tournament_activity needs/, "before live tournaments it refuses too");
await db.exec("rollback");
passed++;

await db.exec(fs.readFileSync(`${M}/20261102_live_tournaments.sql`, "utf8"));
for (const h of HEADER.slice(1)) eq(md5((await one(`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [h.fn.split(".")[1]])).prosrc), h.md5, `${h.fn}: the body loaded here is the one the header names`);

// ── Helpers. ──
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SECRET = (n) => String(n).padStart(2, "0").repeat(32);
const NET = (n) => String(n).padStart(32, "0");
const C = (n) => `t${String(n).padStart(11, "0")}`;
const L = (n) => `l${String(n).padStart(11, "0")}`;
const settings = (over = {}) => ({ format: "league", legs: 1, matches: 0, playoffs: "final", overs: 6, points: { win: 2, tie: 1, nr: 1, loss: 0 }, venue: null, starts: null, ends: null, ...over });
const TEAMS = ["Titans", "Kings", "Royals"].map((name) => ({ name, short: null }));
const fx = (id, home, away, over = {}) => ({ id, stage: "league", slot: null, round: id, seq: id - 1, home, away, day: null, time: null, result: null, ...over });
const LEAGUE = () => ({ name: "Sunday Box League", settings: settings(), teams: TEAMS, fixtures: [fx(1, 1, 2), fx(2, 1, 3), fx(3, 2, 3), fx(4, null, null, { stage: "final", slot: "f", round: 9 })] });
const create = async (n, d = LEAGUE()) => (await one(`select public.tournament_create($1, $2, $3, $4::jsonb, $5) as r`, [LIVE, C(n), SECRET(n), JSON.stringify(d), NET(n)])).r.r;
const change = async (n, op, d = {}) => (await one(`select public.tournament_update($1, $2, $3, $4, $5::jsonb) as r`, [LIVE, C(n), SECRET(n), op, JSON.stringify(d)])).r.r;
const get = async (n) => (await one(`select public.tournament_get($1, $2) as r`, [LIVE, C(n)])).r;
const stored = async (n) => (await one(`select activity from private.tournaments where code = $1`, [C(n)])).activity;
const row = async (n) => one(`select rev, writes, xmin::text as x, updated_at from private.tournaments where code = $1`, [C(n)]);
/** The log without its times (each checked to be one, and never going back). */
const bare = (log) => {
  let last = 0;
  return log.map(({ at, ...rest }) => {
    const ms = Date.parse(at);
    assert.ok(typeof at === "string" && Number.isFinite(ms) && ms >= last, `an entry's time is a time, in order: ${at}`);
    last = ms;
    return rest;
  });
};
const INN = (runs, wickets = 4) => ({ runs, wickets, balls: 36, allOut: false });
const HAND = (a, b, over = {}) => ({ a: INN(a), b: INN(b), result: "auto", battedFirst: "a", ...over });
const LR = (a, b, text) => ({ a: { name: a, ...INN(63) }, b: { name: b, ...INN(54, 10), allOut: true }, outcome: "a", battedFirst: "a", text });
const putLive = async (live, status, rev) => (await one(`select public.live_match_put($1, $2, $3, $4::jsonb, $5, $6, $7) as r`, [LIVE, live, "ef".repeat(32), JSON.stringify({ v: 1, id: "m1", setup: { teamA: "Titans", teamB: "Kings" }, events: [] }), status, rev, NET(0)])).r.r;
const liveResult = async (live, lr, rev) => (await one(`select public.tournament_live_result($1, $2, $3::jsonb, $4) as r`, [LIVE, live, JSON.stringify(lr), rev])).r;
/** A tournament made a while ago, as every real change finds it (the rows it is made with share its transaction). */
const age = (n) => db.exec(`update private.tournaments set created_at = created_at - interval '1 hour' where code = '${C(n)}'`);

// ── 1. Before the file: a tournament with a history. After it: an empty log, nothing made up. ──
eq(await create(1), "ok", "a tournament from before the file");
eq(await change(1, "team", { id: 1, name: "Baner Titans", short: null }), "ok", "with a team renamed");
eq(await change(1, "result", { id: 1, result: HAND(60, 50) }), "ok", "and a result");
const fns = () => q(`select p.oid::regprocedure::text as f, md5(p.prosrc) as h, p.prosecdef, p.proconfig, p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.proname !~ '^tournament_activity' order by 1`);
const columns = () => q(`select table_schema, table_name, column_name, data_type from information_schema.columns where table_schema in ('public', 'private') order by 1, 2, ordinal_position`);
const indexes = () => q(`select schemaname, tablename, indexname from pg_indexes where schemaname in ('public', 'private') order by 1, 2, 3`);
const triggers = () => q(`select c.relname as t, g.tgname as n from pg_trigger g join pg_class c on c.oid = g.tgrelid where not g.tgisinternal order by 1, 2`);
const before = { fns: await fns(), columns: await columns(), indexes: await indexes(), triggers: await triggers(), get1: await get(1), row1: await row(1) };
await db.exec(`begin; ${NEW}; commit;`);
await db.exec(`begin; ${NEW}; commit;`);
eq(await fns(), before.fns, "every function from before is as it was (tournament_get, tournament_update and the rest)");
eq((await columns()).filter((c) => !before.columns.some((b) => b.table_name === c.table_name && b.column_name === c.column_name)), [{ table_schema: "private", table_name: "tournaments", column_name: "activity", data_type: "jsonb" }], "one new column, no new table");
eq(await indexes(), before.indexes, "no index was added");
eq((await triggers()).filter((t) => !before.triggers.some((b) => b.n === t.n)).map((t) => `${t.t} ${t.n}`), ["tournament_fixtures tournament_fixtures_activity_add", "tournament_fixtures tournament_fixtures_activity_note", "tournament_teams tournament_teams_activity_add", "tournament_teams tournament_teams_activity_note", "tournaments tournaments_activity_note"], "five triggers, once each after running it twice");
eq((await one(`select count(*)::int as n from pg_proc where proname ~ '^tournament_activity'`)).n, 5, "no overload after running it twice");
eq(await stored(1), [], "the tournament from before has an empty log: nothing is made up for its past");
eq(await get(1), before.get1, "tournament_get answers exactly what it did");
eq(Object.keys(await get(1)).sort().join(), "code,created_at,fixtures,name,rev,settings,status,teams,updated_at", "and has no log in it");
eq({ ...(await row(1)), x: null }, { ...before.row1, x: null }, "applying it moved no rev and no updated_at");

// ── 2. Being made notes nothing; the read. ──
const activity = async (n, key = LIVE) => (await one(`select public.tournament_activity($1, $2) as r`, [key, typeof n === "number" ? C(n) : n])).r;
eq(await create(2), "ok", "a tournament made after the file");
eq(await stored(2), [], "the teams and fixtures it is made with note nothing");
eq(await activity(2), [], "the read: an empty list");
eq(await activity(1), [], "and for the one from before");
const withResults = { ...LEAGUE(), fixtures: [fx(1, 1, 2, { result: HAND(60, 50) }), fx(2, 1, 3, { result: HAND(60, 50) }), fx(3, 2, 3, { result: HAND(60, 50) })], settings: settings({ playoffs: "none" }) };
eq(await create(3, withResults), "ok", "one made with every result already in");
eq(await stored(3), [], "notes nothing either: not a result, not that it is finished");
await age(2);

// ── 3. Every kind of entry, through the real functions. ──
// Teams.
eq(await change(2, "team", { id: 1, name: "Baner Titans", short: "BT" }), "ok", "a team renamed");
eq(bare(await stored(2)), [{ k: "team", from: "Titans", to: "Baner Titans" }], "team: from and to");
// The tournament's own row.
const VENUE = { id: "6f2b1c2d-0000-4000-8000-000000000001", slug: "ranangan-baner", name: "Ranangan", area: "Baner" };
eq(await change(2, "settings", { name: "Sunday League", settings: settings({ overs: 8, starts: "2026-11-28", ends: "2026-12-06", venue: VENUE, points: { win: 3, tie: 1, nr: 1, loss: 0 } }) }), "ok", "name, venue, dates, overs and points in one change");
eq(bare(await stored(2)).slice(1), [
  { k: "name", to: "Sunday League" },
  { k: "venue", to: "Ranangan" },
  { k: "dates", ts: "2026-11-28", te: "2026-12-06" },
  { k: "overs", from: 6, to: 8 },
  { k: "points", p: [3, 1, 1, 0] },
], "name, venue, dates, overs, points: what each is now (and was, where the page says so)");
const S2 = settings({ overs: null, starts: "2026-11-29", ends: null, venue: { ...VENUE, id: "6f2b1c2d-0000-4000-8000-000000000002", name: "Kings Turf Arena" }, points: { win: 3, tie: 1, nr: 1, loss: 0 } });
eq(await change(2, "settings", { name: "Sunday League", settings: S2 }), "ok", "another venue, other dates, no overs");
eq(bare(await stored(2)).slice(6), [
  { k: "venue", from: "Ranangan", to: "Kings Turf Arena" },
  { k: "dates", fs: "2026-11-28", fe: "2026-12-06", ts: "2026-11-29" },
  { k: "overs", from: 8 },
], "a change says what it was and what it is");
eq(await change(2, "settings", { name: "Sunday League", settings: { ...S2, venue: null, starts: null } }), "ok", "the venue and the dates taken off");
eq(bare(await stored(2)).slice(9), [{ k: "venue", from: "Kings Turf Arena" }, { k: "dates", fs: "2026-11-29" }], "taken off: only what it was");
// The format's parts are not something tournament_update's callers change today, but the row can: noted from the row.
await db.exec(`update private.tournaments set settings = settings || '{"legs": 2, "playoffs": "none"}'::jsonb where code = '${C(2)}'`);
eq(bare(await stored(2)).slice(11), [{ k: "format", legs: 2, playoffs: "none" }], "format: the legs and the playoffs");
await db.exec(`update private.tournaments set settings = settings || '{"legs": 1, "playoffs": "final"}'::jsonb where code = '${C(2)}'`);
// A team added after the start (no function does it today; the trigger sees the row).
await db.exec(`insert into private.tournament_teams (code, id, name) values ('${C(2)}', 4, 'Lions')`);
eq(bare(await stored(2)).slice(13), [{ k: "team_add", to: "Lions" }], "team_add");
let at = 14;
const next = async () => { const all = bare(await stored(2)); const out = all.slice(at); at = all.length; return out; };
// Fixtures.
eq(await change(2, "fixture_add", { stage: "league", slot: null, round: 4, home: 2, away: 1, day: "2026-11-29", time: "19:30" }), "ok", "a fixture added");
eq(await next(), [{ k: "fx_add", f: 5, h: "Kings", a: "Baner Titans", d: "2026-11-29", t: "19:30" }], "fx_add: its id, the teams by name, its day and time");
eq(await change(2, "fixture_add", { stage: "semi", slot: "s2", round: 8, home: null, away: null, day: null, time: null }), "ok", "a semi-final, teams to come");
eq(await next(), [{ k: "fx_add", f: 6, p: "s2" }], "a playoff says its place; no names it does not have");
eq(await change(2, "fixture_edit", { id: 5, round: 4, home: 2, away: 1, day: "2026-11-30", time: "18:00" }), "ok", "moved");
eq(await next(), [{ k: "fx_move", f: 5, h: "Kings", a: "Baner Titans", fd: "2026-11-29", ft: "19:30", d: "2026-11-30", t: "18:00" }], "fx_move: before and now");
eq(await change(2, "fixture_edit", { id: 5, round: 4, home: 2, away: 1, day: null, time: null }), "ok", "its day taken off");
eq(await next(), [{ k: "fx_move", f: 5, h: "Kings", a: "Baner Titans", fd: "2026-11-30", ft: "18:00" }], "fx_move with no day now");
eq(await change(2, "fixture_edit", { id: 5, round: 4, home: 3, away: 1, day: null, time: null }), "ok", "other teams");
eq(await next(), [{ k: "fx_teams", f: 5, h: "Royals", a: "Baner Titans" }], "fx_teams: the teams now");
eq(await change(2, "fixture_edit", { id: 5, round: 5, home: 2, away: 3, day: "2026-12-01", time: null }), "ok", "teams and day at once");
eq(await next(), [{ k: "fx_teams", f: 5, h: "Kings", a: "Royals" }, { k: "fx_move", f: 5, h: "Kings", a: "Royals", d: "2026-12-01" }], "both, at the same moment");
eq(await change(2, "fixture_remove", { id: 5 }), "ok", "taken out");
eq(await next(), [{ k: "fx_out", f: 5, h: "Kings", a: "Royals" }], "fx_out");
eq((await one(`select status from private.tournament_fixtures where code = $1 and id = 5`, [C(2)])).status, "removed", "the row is marked, and stays");
eq(await change(2, "fixture_remove", { id: 6 }), "ok", "the semi-final taken out too");
eq(await next(), [{ k: "fx_out", f: 6, p: "s2" }], "fx_out of a playoff");
// Scored live.
eq(await change(2, "live_link", { id: 1, live_code: L(1) }), "ok", "match 1 scored live");
eq(await next(), [{ k: "live", f: 1, h: "Baner Titans", a: "Kings" }], "live: which match; the scorecard's code is not kept");
// Results by hand.
eq(await change(2, "result", { id: 2, result: HAND(60, 50) }), "ok", "a result by hand");
eq(await next(), [{ k: "res", f: 2, h: "Baner Titans", a: "Royals", s: [60, 4, 50, 4], w: "auto", bf: "a" }], "res: runs and wickets, the result choice, who batted first");
eq(await change(2, "result", { id: 2, result: HAND(61, 50, { result: "a", battedFirst: "b", text: "  Baner Titans won by 6 wickets  " }) }), "ok", "corrected, with the sender's own words");
eq(await next(), [{ k: "fix", f: 2, h: "Baner Titans", a: "Royals", s: [61, 4, 50, 4], w: "a", bf: "b", x: "Baner Titans won by 6 wickets" }], "fix: a hand result changed");
eq(await change(2, "result", { id: 2, result: null }), "ok", "taken back");
eq(await next(), [{ k: "clear", f: 2, h: "Baner Titans", a: "Royals" }], "clear");
eq(await change(2, "result", { id: 2, result: HAND(60, 50) }), "ok", "entered again");
eq(await next(), [{ k: "res", f: 2, h: "Baner Titans", a: "Royals", s: [60, 4, 50, 4], w: "auto", bf: "a" }], "a first result again");
// A finished live scorecard, for two tournaments at once: each rev goes up once, by the function itself.
eq(await create(4), "ok", "another tournament on the same scorecard");
await age(4);
eq(await change(4, "live_link", { id: 1, live_code: L(1) }), "ok", "its match 1 too");
eq(await putLive(L(1), "done", 2), "ok", "the scorecard finished");
const revs = async () => [Number((await row(2)).rev), (await row(2)).writes, Number((await row(4)).rev), (await row(4)).writes];
const r0 = await revs();
eq(await liveResult(L(1), LR("Baner Titans", "Kings", "Baner Titans won by 9 runs"), 2), { r: "ok", codes: [C(2), C(4)] }, "its result onto both tournaments");
eq(await revs(), [r0[0] + 1, r0[1], r0[2] + 1, r0[3]], "each rev up by one and no more, the organiser's changes not counted: the triggers took nothing from the function");
eq(await next(), [{ k: "res", f: 1, h: "Baner Titans", a: "Kings", live: true, x: "Baner Titans won by 9 runs" }], "res from a scorecard: live, and its own words");
eq(bare(await stored(4)), [{ k: "live", f: 1, h: "Titans", a: "Kings" }, { k: "res", f: 1, h: "Titans", a: "Kings", live: true, x: "Baner Titans won by 9 runs" }], "the other tournament's log, by its own team names");
eq((await get(2)).fixtures.find((f) => f.id === 1).live_result.text, "Baner Titans won by 9 runs", "and the result is on the fixture");
// The scorer fixes the last ball: the result changes.
await db.exec(`update public.live_matches set updated_at = updated_at - interval '1 second'`);
eq(await putLive(L(1), "done", 3), "ok", "the scorer fixed the last ball");
eq((await liveResult(L(1), LR("Baner Titans", "Kings", "Baner Titans won by 10 runs"), 3)).r, "ok", "a newer result");
eq(await next(), [{ k: "fix", f: 1, h: "Baner Titans", a: "Kings", live: true, x: "Baner Titans won by 10 runs" }], "fix from the scorecard");
// A hand result over the scorecard's is a correction; taking it back puts the scorecard's back.
eq(await change(2, "result", { id: 1, result: HAND(70, 50) }), "ok", "corrected by hand");
eq(await next(), [{ k: "fix", f: 1, h: "Baner Titans", a: "Kings", s: [70, 4, 50, 4], w: "auto", bf: "a" }], "fix by hand over a scorecard's result");
eq(await change(2, "result", { id: 1, result: null }), "ok", "the hand result taken back");
eq(await next(), [{ k: "fix", f: 1, h: "Baner Titans", a: "Kings", live: true, x: "Baner Titans won by 10 runs" }], "the scorecard's result counts again");
// The league's last result: the playoffs are set. Then the final: finished.
eq(await change(2, "result", { id: 3, result: HAND(40, 50) }), "ok", "the last league result");
eq(await next(), [{ k: "res", f: 3, h: "Kings", a: "Royals", s: [40, 4, 50, 4], w: "auto", bf: "a" }, { k: "draw", to: "final" }], "res, and draw: every league match has a result and there is a final");
eq(await change(2, "live_link", { id: 4, live_code: L(2), home: 1, away: 3 }), "ok", "the final scored live, its places pinned");
eq(await next(), [{ k: "live", f: 4, p: "f", h: "Baner Titans", a: "Royals" }], "live for the final: its place and its teams; pinning the places is not a line of its own");
eq(await change(2, "result", { id: 4, result: HAND(50, 51) }), "ok", "the final's result");
eq(await next(), [{ k: "res", f: 4, p: "f", h: "Baner Titans", a: "Royals", s: [50, 4, 51, 4], w: "auto", bf: "a" }, { k: "done" }], "res, and done: every match has a result");
// Unlinking a scorecard that gave the result takes the result with it.
eq(await change(2, "result", { id: 4, result: null }), "ok", "the final's result taken back");
eq(await next(), [{ k: "clear", f: 4, p: "f", h: "Baner Titans", a: "Royals" }], "clear");
eq(await change(2, "live_unlink", { id: 1 }), "ok", "match 1's scorecard unlinked");
eq(await next(), [{ k: "clear", f: 1, h: "Baner Titans", a: "Kings" }], "its result went with the scorecard");
eq(await change(2, "live_unlink", { id: 4 }), "ok", "a scorecard with no result unlinked");
eq(await next(), [], "nothing to say");
// Semi-finals: the draw says so. The last match without a result taken out finishes it.
const SEMIS = { name: "Four Team Cup", settings: settings({ playoffs: "semis" }), teams: [...TEAMS, { name: "Lions", short: null }], fixtures: [fx(1, 1, 2), fx(2, 3, 4), fx(3, null, null, { stage: "semi", slot: "s1", round: 8 }), fx(4, null, null, { stage: "semi", slot: "s2", round: 8 }), fx(5, null, null, { stage: "final", slot: "f", round: 9 })] };
eq(await create(5, SEMIS), "ok", "a cup with semi-finals");
await age(5);
eq(await change(5, "result", { id: 1, result: HAND(10, 20) }), "ok", "one league result");
eq(bare(await stored(5)).map((e) => e.k), ["res"], "the league is not done");
eq(await change(5, "fixture_remove", { id: 2 }), "ok", "the other league match taken out");
eq(bare(await stored(5)).slice(1), [{ k: "fx_out", f: 2, h: "Royals", a: "Lions" }, { k: "draw", to: "semis" }], "taking out the last league match without a result sets the playoffs: semis");
for (const id of [3, 4]) eq(await change(5, "result", { id, result: HAND(30, 20), home: id === 3 ? 1 : 3, away: id === 3 ? 2 : 4 }), "ok", `semi-final ${id - 2}`);
eq(await change(5, "fixture_remove", { id: 5 }), "ok", "the final taken out");
eq(bare(await stored(5)).slice(3), [
  { k: "res", f: 3, p: "s1", h: "Titans", a: "Kings", s: [30, 4, 20, 4], w: "auto", bf: "a" },
  { k: "res", f: 4, p: "s2", h: "Royals", a: "Lions", s: [30, 4, 20, 4], w: "auto", bf: "a" },
  { k: "fx_out", f: 5, p: "f" },
  { k: "done" },
], "the semi-finals say their places; the last match without a result taken out is the end");
// A series: no playoffs, so no draw; done after its last result.
const SERIES = { name: "Titans v Kings", settings: settings({ format: "bilateral", matches: 2, playoffs: "none" }), teams: TEAMS.slice(0, 2), fixtures: [fx(1, 1, 2), fx(2, 2, 1)] };
eq(await create(6, SERIES), "ok", "a two-match series");
await age(6);
eq(await change(6, "result", { id: 1, result: HAND(10, 20) }), "ok", "its first");
eq(await change(6, "result", { id: 2, result: HAND(10, 20) }), "ok", "its second");
eq(bare(await stored(6)).map((e) => e.k), ["res", "res", "done"], "no draw without playoffs; done at the end");
eq(await change(6, "settings", { name: "Titans v Kings", settings: settings({ format: "bilateral", matches: 3, playoffs: "none" }) }), "ok", "a third match is planned (a turf session does this every round)");
eq(bare(await stored(6)).length, 3, "the series' length alone is not a line: the match added says it");

// Every key any entry has is one the header names.
const KINDS = { name: "to", venue: "from,to", dates: "fe,fs,te,ts", overs: "from,to", points: "p", format: "legs,playoffs", team: "from,to", team_add: "to", fx_add: "a,d,f,h,p,t", fx_move: "a,d,f,fd,ft,h,p,t", fx_teams: "a,f,h,p", fx_out: "a,f,h,p", live: "a,f,h,p", res: "a,bf,f,h,live,p,s,w,x", fix: "a,bf,f,h,live,p,s,w,x", clear: "a,f,h,p", draw: "to", done: "" };
const everything = [];
for (const n of [2, 4, 5, 6]) everything.push(...(await stored(n)));
eq([...new Set(everything.map((e) => e.k))].sort(), Object.keys(KINDS).sort(), "every kind the header names was noted here");
for (const e of everything) {
  const allowed = new Set(["at", "k", ...KINDS[e.k].split(",")]);
  ok(Object.keys(e).every((k) => allowed.has(k)), `${e.k}: only its own fields (${Object.keys(e).sort().join()})`);
}

// ── 4. A write that changes nothing a follower sees notes nothing, and does not touch the tournament's row. ──
const quiet = async (what, run, { rev = 0 } = {}) => {
  const log = JSON.stringify(await stored(2));
  const r = await row(2);
  await run();
  eq(JSON.stringify(await stored(2)), log, `${what}: nothing noted`);
  eq(Number((await row(2)).rev), Number(r.rev) + rev, `${what}: the rev ${rev ? "moved as it always did" : "did not move"}`);
  return r;
};
await quiet("the same settings saved again", async () => eq(await change(2, "settings", { name: "Sunday League", settings: (await get(2)).settings }), "ok", "saved"), { rev: 1 });
await quiet("a team's short code alone", async () => eq(await change(2, "team", { id: 1, name: "Baner Titans", short: "BAN" }), "ok", "saved"), { rev: 1 });
await quiet("a reorder", async () => eq(await change(2, "fixture_order", { ids: [3, 2, 1, 4] }), "ok", "moved"), { rev: 1 });
await quiet("a fixture saved as it was", async () => eq(await change(2, "fixture_edit", { id: 3, round: 3, home: 2, away: 3, day: null, time: null }), "ok", "saved"), { rev: 1 });
await quiet("a fixture's round alone", async () => eq(await change(2, "fixture_edit", { id: 3, round: 7, home: 2, away: 3, day: null, time: null }), "ok", "saved"), { rev: 1 });
await quiet("the same result entered again", async () => eq(await change(2, "result", { id: 3, result: HAND(40, 50) }), "ok", "saved"), { rev: 1 });
await quiet("the same result with its keys in another order", async () => eq(await change(2, "result", { id: 3, result: { battedFirst: "a", result: "auto", b: INN(50), a: INN(40) } }), "ok", "saved"), { rev: 1 });
await quiet("a view counted", async () => eq((await one(`select public.tournament_view_add($1, $2, true) as r`, [LIVE, C(2)])).r.r, "ok", "counted"));
await db.exec(`insert into public.users (id, name, email, phone) values ('${U(1)}', 'Asha Rao', 'asha@example.test', '+919800000001')`);
await quiet("kept with an account", async () => eq((await one(`select public.tournament_attach($1, $2, $3, $4) as r`, [ACCOUNT, C(2), SECRET(2), U(1)])).r.r, "ok", "kept"));
await quiet("another device of that account", async () => eq((await one(`select public.tournament_device_add($1, $2, $3, $4) as r`, [ACCOUNT, C(2), U(1), SECRET(77)])).r.r, "ok", "added"));
await db.exec(`update private.tournaments set created_at = now() - interval '48 hours' where code = '${C(2)}'`);
await quiet("the hourly clearing of network hashes", async () => {
  await db.exec((await one(`select command from cron.jobs where name = 'live-tournaments-iphash'`)).command);
  eq((await one(`select ip_hash from private.tournaments where code = $1`, [C(2)])).ip_hash, null, "cleared");
});
// A finished scorecard sent again, with a newer rev and the same result: the fixture's live_rev moves and nothing else.
eq(await change(2, "live_link", { id: 3, live_code: L(3) }), "ok", "match 3 on a scorecard, behind its hand result");
eq(await putLive(L(3), "done", 2), "ok", "finished");
const SAME = LR("Kings", "Royals", "Royals won by 6 wickets");
await quiet("a scorecard's result behind a hand result", async () => eq((await liveResult(L(3), SAME, 2)).r, "ok", "kept on the fixture"), { rev: 1 });
eq(await change(2, "result", { id: 3, result: null }), "ok", "the hand result taken back");
eq((await stored(2)).at(-1).k, "fix", "now the scorecard's result is the one followers see");
await db.exec(`update public.live_matches set updated_at = updated_at - interval '1 second'`);
eq(await putLive(L(3), "done", 3), "ok", "the scorer saves again");
{
  const log = JSON.stringify(await stored(2));
  const r = await row(2);
  const f = async () => one(`select live_rev, xmin::text as x from private.tournament_fixtures where code = $1 and id = 3`, [C(2)]);
  const f0 = await f();
  // The trigger function is not reached: swap it for one that would note a marker, and see none.
  const real = (await one(`select pg_get_functiondef('private.tournament_activity_fixture()'::regprocedure) as d`)).d;
  await db.exec(`create or replace function private.tournament_activity_fixture() returns trigger language plpgsql security definer set search_path = '' as $$ begin update private.tournaments t set activity = t.activity || '[{"at": "2026-01-01T00:00:00Z", "k": "reached"}]'::jsonb where t.code = new.code; return null; end; $$`);
  eq((await liveResult(L(3), SAME, 3)).r, "ok", "the same result, a newer rev");
  eq(Number((await f()).live_rev), 3, "the fixture took the newer rev");
  ok((await f()).x !== f0.x, "so the fixture row was written");
  eq(JSON.stringify(await stored(2)), log, "and the trigger function was never reached: a live write that changes nothing a follower sees costs only the trigger's own comparison");
  eq(Number((await row(2)).rev), Number(r.rev) + 1, "the rev moved once, as the function always did");
  eq(await change(2, "fixture_order", { ids: [1, 2, 3, 4] }), "ok", "a reorder");
  eq(JSON.stringify(await stored(2)), log, "a reorder does not reach it either");
  eq(await change(2, "live_link", { id: 2, live_code: L(4) }), "ok", "a change followers do see");
  eq((await stored(2)).at(-1).k, "reached", "does reach it");
  await db.exec(real);
  await db.exec(`update private.tournaments set activity = activity - (jsonb_array_length(activity) - 1) where code = '${C(2)}'`);
  eq(JSON.stringify(await stored(2)), log, "(the marker is taken back out)");
  eq(md5((await one(`select prosrc from pg_proc where proname = 'tournament_activity_fixture'`)).prosrc), md5(bodyOf("private.tournament_activity_fixture")), "(and the real function is back)");
}
// Rows written directly with nothing visible changed leave the tournament's row alone (its xmin is the same).
{
  const x0 = (await row(2)).x;
  await db.exec(`update private.tournament_fixtures set seq = seq, round = round, live_rev = live_rev + 1, updated_at = now() where code = '${C(2)}'`);
  await db.exec(`update private.tournament_teams set short = 'ZZ' where code = '${C(2)}'`);
  eq((await row(2)).x, x0, "fixtures and teams written with nothing a follower sees changed: the tournament's row is not written at all");
  await db.exec(`update private.tournaments set rev = rev, writes = writes, updated_at = updated_at where code = '${C(2)}'`);
  ok((await row(2)).x !== x0, "(a write to the row itself does change its xmin, so the line above means something)");
}
// A fixture already taken out, and a tournament taken down, note nothing.
{
  const log = JSON.stringify(await stored(2));
  await db.exec(`update private.tournament_fixtures set day = '2026-12-25', result = null where code = '${C(2)}' and id = 5`);
  eq(JSON.stringify(await stored(2)), log, "a fixture taken out earlier is changed: nothing");
  await db.exec(`insert into private.tournament_fixtures (code, id, stage, round, seq, home, away, status) values ('${C(2)}', 9, 'league', 1, 9, 1, 2, 'removed')`);
  eq(JSON.stringify(await stored(2)), log, "a row put in already marked removed: nothing");
}

// ── 5. Nothing private is ever stored. ──
{
  const hashes = (await one(`select array(select encode(h, 'hex') from unnest(secret_hashes) h) as h, user_id from private.tournaments where code = $1`, [C(2)]));
  eq(hashes.user_id, U(1), "tournament 2 is kept with an account, on two devices");
  eq(hashes.h.length, 2, "with two secrets");
  for (const n of [2, 4, 5, 6]) {
    const text = JSON.stringify(await stored(n));
    ok(!text.includes(U(1)) && !/0000-4000-8000/.test(text), `tournament ${n}: no account id`);
    ok(![SECRET(n), SECRET(77), ...hashes.h].some((s) => text.includes(s)), `tournament ${n}: no secret and no hash of one`);
    ok(!text.includes(NET(n)) && !/[0-9a-f]{32}/.test(text), `tournament ${n}: no network hash, nothing that looks like one`);
    ok(![1, 2, 3, 4, 5].some((l) => text.includes(L(l))), `tournament ${n}: no live scorecard's code (the page links to the one a fixture has now, never one it had)`);
    ok(!/asha|Asha|example[.]test|9800000|@|user|secret|hash|device/i.test(text), `tournament ${n}: no name, email or number of a person, and no word about accounts, secrets or devices`);
  }
  const col = await q(`select column_name from information_schema.columns where table_schema = 'private' and table_name = 'tournaments' order by ordinal_position`);
  eq(col.map((c) => c.column_name), ["code", "secret_hashes", "name", "format", "settings", "status", "user_id", "ip_hash", "rev", "writes", "created_at", "updated_at", "activity"], "the table's columns: the ones it had, and the log");
}

// ── 6. The newest 100, and fewer when they would be too big. ──
eq(await create(7), "ok", "a tournament for a long log");
await age(7);
await db.exec(`update private.tournaments set writes = 0 where code = '${C(7)}'`);
for (let i = 1; i <= 130; i++) await change(7, "team", { id: 1, name: `Team ${i}`, short: null });
{
  const log = await stored(7);
  eq(log.length, 100, "130 renames: the newest 100 are kept");
  eq([log[0].to, log[99].to], ["Team 31", "Team 130"], "oldest first, the first 30 gone");
  eq((await activity(7)).length, 100, "the read answers all 100");
  bare(log);
  passed++;
}
{
  const big = (n, size) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ at: "2026-11-27T10:00:00+00:00", k: "name", to: `${i}:${"x".repeat(size)}` })));
  const add = async (log, more) => (await one(`select private.tournament_activity_add($1::jsonb, $2::jsonb) as r`, [log, more])).r;
  const out = await add(big(100, 700), big(1, 700));
  ok(JSON.stringify(out).length <= 40000, "100 entries of 700 bytes: cut to fit under 40000 bytes");
  eq([out.length, out.at(-1).to.split(":")[0]], [50, "0"], "half of them, the newest kept (the one just added is last)");
  eq((await add(big(100, 30), big(3, 30))).length, 100, "small ones: 100");
  eq((await add(big(100, 30), big(3, 30)))[0].to.split(":")[0], "3", "the oldest three gone");
  eq(await add("[]", "[]"), [], "nothing added to nothing");
  eq((await add('{"not": "a list"}', big(1, 5))).length, 1, "a log that is no list starts again");
  eq((await add(big(2, 5), '"x"')).length, 2, "an addition that is no list adds nothing");
  eq((await add(big(1, 5), big(1, 45000))).length, 1, "one entry too big to keep at all: the log stays as it was");
  await assert.rejects(db.exec(`update private.tournaments set activity = '${big(101, 5)}'::jsonb where code = '${C(7)}'`), /tournaments_activity_shape/, "the column itself refuses 101");
  await assert.rejects(db.exec(`update private.tournaments set activity = '{}'::jsonb where code = '${C(7)}'`), /tournaments_activity_shape/, "and anything that is no list");
  passed += 2;
  // Written by hand, the log is theirs to say: the trigger adds nothing to it.
  await db.exec(`update private.tournaments set name = 'Renamed by hand', activity = '[]'::jsonb where code = '${C(7)}'`);
  eq(await stored(7), [], "a write of the log itself is left as written");
}

// ── 7. A trigger that fails never fails the write. ──
{
  const real = (await one(`select pg_get_functiondef('private.tournament_activity_add(jsonb, jsonb)'::regprocedure) as d`)).d;
  await db.exec(`create or replace function private.tournament_activity_add(p_log jsonb, p_add jsonb) returns jsonb language plpgsql immutable set search_path = '' as $$ begin raise exception 'the log is broken'; end; $$`);
  const r = await row(7);
  eq(await change(7, "team", { id: 2, name: "Still Renamed", short: null }), "ok", "a team is renamed though the log cannot be written");
  eq((await get(7)).teams[1].name, "Still Renamed", "the rename is there");
  eq(await change(7, "settings", { name: "Still Saved", settings: settings({ overs: 10 }) }), "ok", "settings are saved");
  eq([(await get(7)).name, (await get(7)).settings.overs], ["Still Saved", 10], "they are there");
  eq(await change(7, "fixture_add", { stage: "league", slot: null, round: 4, home: 1, away: 2, day: null, time: null }), "ok", "a fixture is added");
  eq(await change(7, "result", { id: 1, result: HAND(10, 20) }), "ok", "a result goes in");
  eq(await change(7, "live_link", { id: 2, live_code: L(5) }), "ok", "a scorecard is linked");
  eq(await putLive(L(5), "done", 2), "ok", "and finishes");
  eq((await liveResult(L(5), LR("Team 130", "Royals", "Team 130 won by 9 runs"), 2)).r, "ok", "its result is kept");
  eq((await get(7)).fixtures.find((f) => f.id === 2).live_result.text, "Team 130 won by 9 runs", "on the fixture");
  eq(await change(7, "fixture_remove", { id: 5 }), "ok", "a fixture is taken out");
  eq(Number((await row(7)).rev), Number(r.rev) + 7, "seven changes, seven revs");
  eq(await stored(7), [], "nothing was noted, and nothing failed");
  await db.exec(real);
  eq(await change(7, "team", { id: 2, name: "Kings", short: null }), "ok", "with the log working again");
  eq(bare(await stored(7)), [{ k: "team", from: "Still Renamed", to: "Kings" }], "the next change is noted");
}

// ── 8. The read: gated and granted as tournament_get, null for anything that is not a tournament that is on. ──
const priv = async (fn) => Object.fromEntries(await Promise.all(["anon", "authenticated", "public"].map(async (role) => [role, (await one(`select has_function_privilege($1, 'public.${fn}(text, text)', 'execute') as p`, [role])).p])));
eq(await priv("tournament_activity"), await priv("tournament_get"), "who may call it is exactly who may call tournament_get");
eq(await priv("tournament_activity"), { anon: true, authenticated: true, public: false }, "anon and authenticated (the key is the gate), never public's default");
const shape = async (fn) => one(`select prosecdef, proconfig, provolatile, prorettype::regtype::text as returns, pg_get_function_identity_arguments(oid) as args from pg_proc where proname = $1`, [fn]);
eq(await shape("tournament_activity"), await shape("tournament_get"), "security definer, search_path empty, stable, the same arguments and return type as tournament_get");
for (const fn of ["tournament_activity_add(jsonb,jsonb)", "tournament_activity_settings()", "tournament_activity_team()", "tournament_activity_fixture()"])
  for (const role of ["anon", "authenticated", "public"]) ok(!(await one(`select has_function_privilege($1, $2, 'execute') as p`, [role, `private.${fn}`])).p, `private.${fn}: not ${role}'s`);
for (const k of [null, "", "wrong", ACCOUNT, LIVE + "x", LIVE.slice(1), "LIVE-KEY"]) eq(await activity(2, k), { r: "unavailable" }, `refused without the live write key (${k === null ? "null" : `"${k}"`})`);
eq(await activity("t99999999999", "wrong"), { r: "unavailable" }, "and for a code that is no tournament: a wrong key learns nothing");
eq(await activity(2), await stored(2), "the read answers the stored list as it is, oldest first");
eq(await activity("t99999999999"), null, "an unknown code: null");
for (const bad of [null, "", "BAD", "t0000000000", "t000000000011", "T00000000002", "t0000000000!", "' or 1=1 --"]) eq(await activity(bad), null, `a code that is not one (${bad === null ? "null" : `"${bad}"`}): null`);
// Taken down: the read answers null, and the taking down itself notes nothing (the page says it from updated_at).
const log4 = await stored(4);
eq(await change(4, "remove"), "ok", "tournament 4 is taken down");
eq(await activity(4), null, "a tournament taken down: null");
eq(await stored(4), log4, "taking it down notes nothing");
eq(Object.keys(await get(4)).sort().join(), "code,rev,status,updated_at", "tournament_get says what it always said of one taken down");
await db.exec(`update private.tournament_fixtures set day = '2026-12-24' where code = '${C(4)}' and id = 1`);
await db.exec(`update private.tournament_teams set name = 'Renamed After' where code = '${C(4)}' and id = 1`);
await db.exec(`update private.tournaments set name = 'Renamed After' where code = '${C(4)}'`);
eq(await stored(4), log4, "and nothing about one taken down is noted afterwards");
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  try {
    eq((await db.query(`select public.tournament_activity($1, $2) as r`, [LIVE, C(2)])).rows[0].r.length, (await activity(2)).length, `${role} with the live write key gets the log`);
    eq((await db.query(`select public.tournament_activity($1, $2) as r`, ["guess", C(2)])).rows[0].r, { r: "unavailable" }, `${role} with a guessed key gets nothing`);
    for (const t of ["private.tournaments", "private.tournament_fixtures", "private.tournament_teams"]) {
      await assert.rejects(db.query(`select * from ${t}`), /permission denied/, `${role} can't read ${t}`);
      passed++;
    }
    await assert.rejects(db.query(`select private.tournament_activity_add('[]'::jsonb, '[]'::jsonb)`), /permission denied/, `${role} can't call the helper`);
    passed++;
  } finally {
    await db.exec("reset role");
  }
}
// Reading writes nothing.
{
  const state = async () => q(`select code, rev, writes, updated_at, xmin::text as x from private.tournaments order by code`);
  const s1 = await state();
  for (const n of [1, 2, 3, 4, 5, 6, 7]) await activity(n);
  await activity(null); await activity(2, "wrong");
  eq(await state(), s1, "a read changes no row");
}
eq(await fns(), before.fns, "after everything: every function from before is as it was");
await db.close();

// ── 9. The existing checks, with this file applied under them. ──
const here = path.dirname(fileURLToPath(import.meta.url));
for (const other of ["live_tournaments", "tournament_host"]) {
  const run = spawnSync(process.execPath, [path.join(here, `${other}.check.mjs`), M], { env: { ...process.env, TOURNAMENT_CHECK_WITH: NAME }, encoding: "utf8" });
  const last = run.stdout.trim().split("\n").at(-1) ?? "";
  if (run.status !== 0) console.error(run.stdout, run.stderr);
  eq(run.status, 0, `${other}.check.mjs passes with ${NAME} applied`);
  ok(new RegExp(`^${other}: \\d+ checks passed$`).test(last), `${other}: ${last}`);
  console.log(`  with ${NAME}: ${last}`);
}

console.log(`tournament_activity: ${passed} checks passed`);
