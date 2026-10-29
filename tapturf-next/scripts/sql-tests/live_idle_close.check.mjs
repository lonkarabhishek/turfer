// Applies 20261021_live_matches.sql and 20261026_tool_uses.sql (the live
// definitions this file replaces) to an in-memory Postgres (PGlite) with
// stand-ins for Supabase's roles, private schema and pg_cron, drives
// live_match_put through every answer, then applies
// 20261029_live_idle_close.sql (twice) and drives it again: a link 2 hours
// or more without an update answers gone (idle) and nothing changes, live
// or done; every other answer is the same as before. Never touches a real
// database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/live_idle_close.check.mjs supabase/migrations/20261029_live_idle_close.sql
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const [FILE] = process.argv.slice(2);
const DIR = path.dirname(FILE);
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };
const md5 = (s) => createHash("md5").update(s).digest("hex");

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private;
create table private.app_secrets (name text primary key, value text not null);
create schema cron;
create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create function private.account_key_ok(p_key text) returns boolean language sql stable as $$ select p_key = 'server-key' $$;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);
await db.exec(fs.readFileSync(path.join(DIR, "20261021_live_matches.sql"), "utf8"));
await db.exec(fs.readFileSync(path.join(DIR, "20261026_tool_uses.sql"), "utf8"));
await db.exec(`set test.owner = 'yes'`);

const src = async (fn) => (await one(`select prosrc from pg_proc where oid = $1::regprocedure`, [fn])).prosrc;
const PUT = "public.live_match_put(text, text, text, jsonb, text, bigint, text)";
const STOP = "public.live_match_stop(text, text, text)";
const ADMIN = "public.admin_live_matches(text)";
// The bodies live in production on 29 Oct (md5 of pg_proc.prosrc, read with the Supabase MCP).
const oldPut = await src(PUT);
const oldAdmin = await src(ADMIN);
const oldStop = await src(STOP);
eq(md5(oldPut), "deeaa98c1a3a97eab0c71ce0799ad15a", "the repo's live_match_put is production's");
eq(md5(oldAdmin), "99bd9503730f558ac41aa9fe426e1edf", "the repo's admin_live_matches is production's");
eq(md5(oldStop), "827daeb1d025960b0f875e0543553f7f", "the repo's live_match_stop is production's");
const oldJob = (await one(`select command from cron.job where jobname = 'live-matches-expire'`)).command;

const KEY = (await one("select value from private.app_secrets where name = 'live_write'")).value;
// Rows are set up from ROW_IP, so they never count against the writes' own network (IP) for new links.
const S1 = "1a".repeat(32), S2 = "2b".repeat(32), IP = "a".repeat(32), ROW_IP = "c".repeat(32);
const M0 = { v: 1, id: "m1", events: [1, 2, 3] };
const M1 = { v: 1, id: "m1", events: [1, 2, 3, 4] };

const putSql = "select public.live_match_put($1, $2, $3, $4::jsonb, $5, $6, $7) r";
const putArgs = (a) => [a.key, a.code, a.secret, a.match === null ? null : JSON.stringify(a.match), a.status, a.rev, a.ip];
const ROW = "select code, encode(secret_hash, 'hex') secret_hash, match, rev::text, status, writes, ip_hash, stoppers::text, created_at::text, updated_at::text from public.live_matches where code = $1";
const rowOf = async (x, c) => (await x.query(ROW, [c])).rows[0];
const row = (c) => rowOf(db, c);

/**
 * Each case: a row as it stands (ages are intervals before now; no row
 * when absent), and one write. at: the row is set and the write made in
 * one transaction, so now() is the same for both and an age is exact.
 */
const CASES = [
  { name: "live, 1h59m idle", row: { updated: "1 hour 59 minutes" }, closes: false },
  { name: "live, 2h idle less 1 ms", row: { updated: "2 hours", plus: "1 millisecond" }, at: true, closes: false },
  { name: "live, exactly 2h idle", row: { updated: "2 hours" }, at: true, closes: true, was: "ok" },
  { name: "live, 3h idle", row: { updated: "3 hours" }, closes: true, was: "ok" },
  { name: "live, 29 days idle", row: { updated: "29 days", created: "29 days" }, closes: true },
  { name: "done, exactly 2h idle", row: { status: "done", updated: "2 hours" }, at: true, closes: true, was: "ok" },
  { name: "done, 2h idle, undo back to live", row: { status: "done", updated: "2 hours 30 minutes" }, put: { status: "live" }, closes: true },
  { name: "done, 1h idle", row: { status: "done", updated: "1 hour" }, put: { status: "live" }, closes: false },
  { name: "stale", row: { updated: "1 minute" }, put: { rev: 10 }, closes: false },
  { name: "stale, older rev", row: { updated: "1 minute" }, put: { rev: 5 }, closes: false },
  { name: "slow", row: { updated: "0 seconds" }, closes: false },
  { name: "forbidden", row: { updated: "1 minute" }, put: { secret: S2 }, closes: false },
  { name: "limit, 4000 writes", row: { updated: "1 minute", writes: 4000 }, closes: false },
  { name: "limit, 36 hours old", row: { updated: "1 hour", created: "37 hours" }, closes: false },
  { name: "stopped", row: { status: "stopped", match: null, updated: "1 minute" }, closes: false },
  { name: "expired", row: { status: "expired", match: null, updated: "31 days", created: "32 days" }, closes: false },
  { name: "forbidden and idle", row: { updated: "2 hours 1 minute" }, put: { secret: S2 }, closes: true },
  { name: "stale and idle", row: { updated: "5 hours" }, put: { rev: 10 }, closes: true },
  { name: "limit and idle", row: { updated: "3 hours", created: "37 hours" }, closes: true },
  { name: "a write 600 ms after the last", row: { updated: "600 milliseconds" }, closes: false },
  { name: "a new link", row: null, closes: false },
  { name: "bad", row: { updated: "3 hours" }, put: { status: "stopped" }, closes: false },
  { name: "unavailable", row: { updated: "3 hours" }, put: { key: "wrong" }, closes: false },
  { name: "too_big", row: { updated: "3 hours" }, put: { match: { s: "x".repeat(250_001) } }, closes: false },
  // A stranger's stop marker, left hours ago: the scorer's first send still takes it over.
  { name: "a stranger's old stop marker", row: { status: "stopped", match: null, writes: 0, secret: S2, stoppers: [S2], updated: "3 hours" }, closes: false },
  { name: "the scorer's own old stop marker", row: { status: "stopped", match: null, writes: 0, stoppers: [S1], updated: "3 hours" }, closes: false },
];

async function setRow(tx, code, r) {
  if (!r) return;
  await tx.query(
    `insert into public.live_matches (code, secret_hash, match, rev, status, writes, ip_hash, stoppers, created_at, updated_at)
     values ($1, sha256(convert_to($2, 'UTF8')), $3::jsonb, 10, $4, $5, $6,
             case when $7::text[] is null then null else (select array_agg(sha256(convert_to(s, 'UTF8'))) from unnest($7::text[]) s) end,
             now() - $8::interval, now() - $9::interval + $10::interval)`,
    [code, r.secret ?? S1, r.match === null ? null : JSON.stringify(r.match ?? M0), r.status ?? "live", r.writes ?? 7, ROW_IP, r.stoppers ?? null, r.created ?? "3 hours", r.updated, r.plus ?? "0 seconds"],
  );
}

let seq = 0;
async function runCases(tag) {
  const out = [];
  for (const c of CASES) {
    const code = `${tag}${String(++seq).padStart(11, "0")}`;
    const a = { key: KEY, code, secret: S1, match: M1, status: "live", rev: 11, ip: IP, ...c.put };
    let r;
    let before;
    if (c.at) {
      r = await db.transaction(async (tx) => {
        await setRow(tx, code, c.row);
        before = await rowOf(tx, code);
        return (await tx.query(putSql, putArgs(a))).rows[0].r;
      });
    } else {
      await setRow(db, code, c.row);
      before = await row(code);
      r = (await one(putSql, putArgs(a))).r;
    }
    out.push({ c, code, r, before, after: await row(code) });
  }
  return out;
}

/** What a write did to the row, without the times it ran at. */
const effect = (x) => {
  if (!x.after) return null;
  const changed = x.before ? x.after.updated_at !== x.before.updated_at : true;
  return { status: x.after.status, match: x.after.match, rev: x.after.rev, writes: x.after.writes, changed, stoppers: x.after.stoppers === null };
};

const before = await runCases("o");
// The old function took writes to an idle link: that is what this file changes.
for (const x of before) if (x.c.was) eq(x.r, { r: "ok", rev: 11 }, `before: ${x.c.name} was taken`);

// The migration, twice: safe to run again.
const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b/i, "nothing destructive");
assert.doesNotMatch(sql, /[–—]/, "no em or en dashes");
assert.doesNotMatch(sql.replace(/--.*$/gm, ""), /cron\.|constraint|check\s*\(|create table|create index/i, "no job, table or constraint changes");
await db.exec(sql);
await db.exec(sql);
passed++;

const after = await runCases("n");
for (let i = 0; i < CASES.length; i++) {
  const c = CASES[i], o = before[i], n = after[i];
  if (c.closes) {
    eq(n.r, { r: "gone", idle: true }, `${c.name}: gone, idle`);
    eq(n.after, n.before, `${c.name}: nothing changed, the match kept`);
    ok(n.after.match !== null, `${c.name}: the last score is still there`);
  } else {
    eq(n.r, o.r, `${c.name}: the same answer as before (${JSON.stringify(o.r)})`);
    eq(effect(n), effect(o), `${c.name}: the same change as before`);
  }
}
const answers = (xs) => [...new Set(xs.map((x) => x.r.r))].sort();
eq(answers(after.filter((x) => !x.c.closes)), ["bad", "forbidden", "gone", "limit", "ok", "slow", "stale", "too_big", "unavailable"], "every other answer is still reached");
eq(after.filter((x) => !x.c.closes && x.r.idle !== undefined).length, 0, "idle only on a closed link");

// Followers keep the last score: the read and the job are unchanged.
const closed = after.find((x) => x.c.name === "live, 3h idle").code;
const g = (await one("select public.live_match_get($1) r", [closed])).r;
eq([g.status, g.match], ["live", M0], "a closed link still reads its last score");
eq(await src(STOP), oldStop, "live_match_stop unchanged");
eq((await one(`select command from cron.job where jobname = 'live-matches-expire'`)).command, oldJob, "the hourly job unchanged");
eq((await one("select count(*)::int n from cron.job")).n, 1, "no new job");
const job = oldJob;
const keep = after.find((x) => x.c.name === "done, exactly 2h idle").code;
const old = after.find((x) => x.c.name === "live, 29 days idle").code;
await q("update public.live_matches set updated_at = now() - interval '30 days 1 minute' where code = $1", [old]);
const oldRev = Number((await row(old)).rev);
await db.exec(job);
eq([(await row(closed)).status, (await row(closed)).match], ["live", M0], "the job keeps a link closed hours ago");
eq([(await row(keep)).status, (await row(keep)).match], ["done", M0], "and a finished one: its result stays");
eq([(await row(old)).status, (await row(old)).match, Number((await row(old)).rev)], ["expired", null, oldRev + 1], "30 days after its last update it expires, as before");
eq((await one(putSql, putArgs({ key: KEY, code: old, secret: S1, match: M1, status: "live", rev: 99, ip: IP }))).r, { r: "gone" }, "an expired link is gone, plain");
// The scorer can still turn a closed link off; that clears it, as a stop always did.
eq((await one("select public.live_match_stop($1, $2, $3) r", [KEY, closed, S1])).r, "ok", "a closed link can be turned off");
eq([(await row(closed)).status, (await row(closed)).match], ["stopped", null], "turned off: cleared");
eq((await one(putSql, putArgs({ key: KEY, code: closed, secret: S1, match: M1, status: "live", rev: 99, ip: IP }))).r, { r: "gone" }, "then plain gone");
// A new link for the next match works as before.
eq((await one(putSql, putArgs({ key: KEY, code: "newlink00001", secret: S1, match: M1, status: "live", rev: 1, ip: "b".repeat(32) }))).r, { r: "ok", rev: 1 }, "a new link");

// Only the 2 hours is new in live_match_put: its body is production's with these lines added, nothing else.
const newPut = await src(PUT);
const added = [];
{
  const a = oldPut.split("\n"), b = newPut.split("\n");
  let i = 0;
  for (const line of b) {
    if (i < a.length && line === a[i]) i++;
    else added.push(line);
  }
  eq(i, a.length, "every line of the old body is kept, in order");
}
eq(added.map((l) => l.trim()), [
  "-- Closed after 2 hours without an update (the header says why).",
  "and m.updated_at > now() - interval '2 hours'",
  "-- Live or done, and closed: gone like a stopped link, whoever asks,",
  "-- with idle so the scorer is told why. Nothing changes.",
  "if r.updated_at <= now() - interval '2 hours' then",
  "return jsonb_build_object('r', 'gone', 'idle', true);",
  "end if;",
], "only the 2 hour lines are added");

// One of each, same signatures, still security definer with a fixed search_path and the same grants.
for (const [name, fn] of [["live_match_put", PUT], ["admin_live_matches", ADMIN]]) {
  eq((await one(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = $1`, [name])).n, 1, `${name}: no overload`);
  const p = await one(`select has_function_privilege('anon', $1, 'execute') a, has_function_privilege('authenticated', $1, 'execute') b,
    (select prosecdef from pg_proc where oid = $1::regprocedure) d, (select proconfig from pg_proc where oid = $1::regprocedure) c`, [fn]);
  ok(p.a && p.b && p.d, `${name}: callable by anon and authenticated, security definer`);
  eq(p.c, ['search_path=""'], `${name}: fixed search_path`);
  const pub = await one(`select p.proacl is not null acl, coalesce(bool_or(a.grantee = 0), false) pub from pg_proc p left join lateral aclexplode(p.proacl) a on a.privilege_type = 'EXECUTE' where p.oid = $1::regprocedure group by p.proacl`, [fn]);
  ok(pub.acl && !pub.pub, `${name}: not PUBLIC`);
}

// admin_live_matches: a live link 2 hours idle is 'closed'; done, stopped and expired as they were; same totals per day.
await db.exec(`set test.owner = 'no'`);
await assert.rejects(q(`select * from public.admin_live_matches(null)`), /not allowed/);
passed++;
await db.exec(`set test.owner = 'yes'`);
await q(`insert into public.live_matches (code, secret_hash, match, status, writes, created_at, updated_at) values
  ('adm000000001', '\\x01', '{}', 'live', 2, '2026-01-15 06:00+00', now() - interval '1 hour 59 minutes'),
  ('adm000000002', '\\x01', '{}', 'live', 2, '2026-01-15 06:00+00', now() - interval '2 hours 1 minute'),
  ('adm000000003', '\\x01', '{}', 'done', 2, '2026-01-15 06:00+00', now() - interval '5 hours'),
  ('adm000000004', '\\x01', null, 'stopped', 2, '2026-01-15 06:00+00', now() - interval '5 hours')`);
const day = async () => (await q(`select status, n from public.admin_live_matches('t') where day = '2026-01-15' order by status`));
eq(await day(), [{ status: "closed", n: 1 }, { status: "done", n: 1 }, { status: "live", n: 1 }, { status: "stopped", n: 1 }], "closed apart from live");
const total = async (body) => {
  await db.exec(`create or replace function public.admin_live_matches(p_firebase_token text default null) returns table (day date, status text, n integer)
    language plpgsql stable security definer set search_path = '' as $f$${body}$f$`);
  return (await q(`select day::text, sum(n)::int n from public.admin_live_matches('t') group by 1 order by 1`));
};
const newAdmin = await src(ADMIN);
eq(await total(oldAdmin), await total(newAdmin), "the same links per day as before");

// The app's constant is the same 2 hours (lib/live/types.ts).
const types = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../lib/live/types.ts"), "utf8");
const m = /export const LIVE_IDLE_CLOSE_MS = ([\d_ *]+);/.exec(types);
ok(m, "LIVE_IDLE_CLOSE_MS is in lib/live/types.ts");
eq(m[1].replace(/_/g, "").split("*").reduce((p, x) => p * Number(x.trim()), 1), 2 * 60 * 60 * 1000, "LIVE_IDLE_CLOSE_MS is 2 hours, as in the SQL");
eq((sql.match(/interval '2 hours'/g) ?? []).length, 3, "the SQL's 2 hours, in its three places");

console.log(`live_idle_close: ${passed} checks passed`);
