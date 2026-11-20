// Applies 20261122_tool_medals.sql (twice) to an in-memory Postgres
// (PGlite) with the real private.tool_use_log (table and indexes) and the
// real private.account_key_ok read from the repo's migrations (so no key
// is written here), and checks: the file's rules (additive, none of the
// destructive keywords even inside a word or a comment, no backslash
// anywhere, search_path '', its header's md5 is the repo's latest body, no
// earlier function replaced, no table made or altered, no index); the
// grant (the server's key client alone); that a wrong key is refused; that
// the answer is only that account's rows; that a guest's rows are never
// counted, whatever they carry; that every day is India's date; that the
// caps hold (100 days a tool, 999 a day, 20 live links, 20 tools, the
// first 5000 rows); that reading writes nothing; and that the answer for
// the shared cases (lib/profile/toolUses.cases.json, which the app's own
// tests read too) is exactly what they say. Never touches a real database.
// Made-up accounts.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/tool_medals.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: tool_medals.check.mjs <supabase/migrations>");
const NAME = "20261122_tool_medals.sql";
const NEW = fs.readFileSync(`${M}/${NAME}`, "utf8");
const CASES = JSON.parse(fs.readFileSync(new URL("../../lib/profile/toolUses.cases.json", import.meta.url), "utf8"));
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const md5 = (s) => createHash("md5").update(s).digest("hex");

// ── 0. The file. ──
const code = NEW.replace(/^\s*--.*$/gm, "");
assert.doesNotMatch(NEW, /drop|delete|truncate/i, "none of the destructive keywords, not in a comment, not inside a word");
assert.ok(!NEW.includes(String.fromCharCode(92)), "no backslash anywhere in the file (a client mangled escapes once)");
assert.doesNotMatch(NEW, /[—–]/, "no em or en dashes");
assert.match(NEW, /^set local lock_timeout = '5s';\n/, "starts with the lock timeout");
assert.doesNotMatch(code, /\b(update|insert\s+into)\b/i, "writes nothing anywhere");
assert.doesNotMatch(code, /\b(create|alter)\s+table\b/i, "makes and alters no table");
assert.doesNotMatch(code, /\bcreate\s+(unique\s+)?index\b/i, "adds no index");
assert.doesNotMatch(code, /\bgrant\b[^;]*\bon\s+(?!function public\.tool_uses_of\(text, uuid\) to anon;)|\bpolicy\b|\btrigger\b|cron\.schedule/i, "no grant but its own function's, no policy, no trigger, no job");
assert.doesNotMatch(code, /\bemail\b|\bphone\b|profile_image_url|\bname\b|\bdevice\b|\bcity\b|\bdetail\b/i, "reads no address, number, photo, name, device tag, city or tag");
assert.doesNotMatch(code, /public\.users|public\.usernames/i, "reads no account row: it tells nothing about whether an account exists");
passed += 10;
const MADE = [...NEW.matchAll(/create or replace function (\w+)\.(\w+)\(/gi)].map((m) => `${m[1]}.${m[2]}`);
eq(MADE, ["public.tool_uses_of"], "exactly this one function");
eq((code.match(/security definer/g) ?? []).length, 1, "security definer");
eq((code.match(/set search_path = ''/g) ?? []).length, 1, "with an empty search_path");
ok(/\n\s*stable\n/.test(code), "stable: a read");
ok(code.includes("revoke all on function public.tool_uses_of(text, uuid) from public, anon, authenticated;\n"), "revoked from public, anon and authenticated before its grant");
ok(code.includes("grant execute on function public.tool_uses_of(text, uuid) to anon;"), "granted to anon only (the key is the gate)");
eq((code.match(/\bgrant\b/gi) ?? []).length, 1, "and that is the only grant");
for (const w of ["Replaced: none.", "No existing table is", "The app works before this file", "a guest's row has no account at all", "production was not read again for this file", "Every day is India's date of the use (Asia/Kolkata)", "no index is added", "Safe to run"])
  ok(NEW.includes(w), `the header says: ${w}`);

// The header's md5: the md5 of the function's latest body in the repo's migrations (file name order), as md5(prosrc) gives it.
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
const CALLED = ["private.account_key_ok"];
eq(HEADER.map((h) => h.fn), CALLED, "the header lists the one function it calls");
for (const h of HEADER) {
  const def = repoDef(h.fn);
  eq(md5(def?.body ?? ""), h.md5, `${h.fn}: the header's md5 is the repo's latest body`);
  eq(def?.file, h.file, `${h.fn}: and the header names the file that has it`);
}
ok(new RegExp(`private\\.account_key_ok\\s+${HEADER[0].md5}\\b`).test(fs.readFileSync(`${M}/20261118_slot_asks.sql`, "utf8")), "the same md5 20261118_slot_asks.sql read from production on 18 Nov");
const calls = new Set([...code.matchAll(/\b(public|private)\.(\w+)\s*\(/g)].map((m) => `${m[1]}.${m[2]}`).filter((f) => !MADE.includes(f)));
eq([...calls].sort(), CALLED, "it calls exactly that function");
eq([...new Set([...code.matchAll(/\bfrom\s+((?:public|private)\.\w+)/gi)].map((m) => m[1]))], ["private.tool_use_log"], "and reads exactly one table: the log");
for (const fn of MADE) eq(repoDef(fn), null, `${fn} is new: no earlier file has it`);
for (const file of FILES.filter((f) => f !== NAME)) ok(!/tool_uses_of|tool_medals/.test(fs.readFileSync(`${M}/${file}`, "utf8")), `${file} knows nothing of it`);
// The tools the app counts are the ones the log's write takes.
const USAGE = fs.readFileSync(new URL("../../lib/tools/usage.ts", import.meta.url), "utf8");
const COUNTED = [...(/COUNTED_TOOLS = \[([^\]]+)\]/.exec(USAGE)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
const USERS = fs.readFileSync(`${M}/20261027_tool_users.sql`, "utf8");
const TAKEN = [...(/p_tool not in \(([^)]+)\)/.exec(USERS)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
eq([...COUNTED].sort(), [...TAKEN].sort(), "the app's counted tools are tool_use_record's");
ok(COUNTED.length === 7 && COUNTED.length <= 20, "and all of them fit the read's 20 tools");
for (const t of ["live_scorer", "live_scoreboard"]) ok(COUNTED.includes(t) && code.includes(`'${t}'`), `${t}: a scoring tool, whose live links count`);

// ── The database before it. ──
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const LOG = /create table if not exists private\.tool_use_log \([^;]*\);\nrevoke all on private\.tool_use_log from public, anon, authenticated;\n(?:create index if not exists tool_use_log_\w+ on private\.tool_use_log [^;]*;\n){3}/.exec(USERS)?.[0];
ok(LOG?.includes("create index if not exists tool_use_log_user on private.tool_use_log (user_id, used_at desc) where user_id is not null;"), "the real private.tool_use_log and its three indexes, from the repo");
await db.exec(`
create role anon; create role authenticated;
create schema private;
grant usage on schema public to anon, authenticated;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', 'K' || repeat('7', 63));
${LOG}
`);
await db.exec(repoDef("private.account_key_ok").sql);
const KEY = "K" + "7".repeat(63);

// Refuses to run without what it needs, changing nothing.
{
  const bare = new PGlite();
  await bare.exec(`create role anon; create role authenticated; create schema private;`);
  await assert.rejects(bare.exec(NEW), /tool_medals needs/, "without the earlier files it refuses");
  eq((await bare.query(`select to_regprocedure('public.tool_uses_of(text, uuid)') as f`)).rows[0].f, null, "and leaves nothing behind");
  await bare.close();
}

const procs = () => q(`select n.nspname, p.proname, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') order by 1, 2`);
const columns = () => q(`select table_schema, table_name, column_name, data_type from information_schema.columns where table_schema in ('public', 'private') order by 1, 2, ordinal_position`);
const indexes = () => q(`select schemaname, tablename, indexname, indexdef from pg_indexes where schemaname in ('public', 'private') order by 1, 2, 3`);
const before = { procs: await procs(), columns: await columns(), indexes: await indexes() };
await db.exec(`begin; ${NEW}; commit;`);
const once = await procs();
await db.exec(`begin; ${NEW}; commit;`);
eq(await procs(), once, "applied twice: the same functions");
eq((await procs()).filter((p) => p.proname !== "tool_uses_of"), before.procs, "no earlier function is replaced");
eq(await columns(), before.columns, "no table is made or altered");
eq(await indexes(), before.indexes, "no index is added");
const fn = await one(`select p.prosecdef, p.provolatile, p.proconfig, p.proacl::text as acl from pg_proc p where p.oid = 'public.tool_uses_of(text, uuid)'::regprocedure`);
ok(fn.prosecdef === true && fn.provolatile === "s", "security definer and stable in the catalog");
eq(fn.proconfig, ['search_path=""'], "search_path is empty");
ok(/anon=X/.test(fn.acl) && !/authenticated=/.test(fn.acl) && !/^\{=X|,=X/.test(fn.acl), `execute for anon alone (${fn.acl})`);

// ── Fixture: the shared cases. ──
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const WHO = { a: U(1), b: U(2) };
const put = (who, at, tool, event, cd = null) =>
  q(`insert into private.tool_use_log (used_at, tool, event, code, user_id, device) values ($1, $2, $3, $4, $5, $6)`, [at, tool, event, cd, WHO[who] ?? null, who === "device" ? "dev1ce0tag00" : null]);
for (const r of CASES.rows) await put(r.who, r.at, r.tool, r.event, r.code ?? null);
const count = async () => (await one(`select count(*)::int as n from private.tool_use_log`)).n;
eq(await count(), CASES.rows.length, "the cases' rows are in the log");
const read = async (key, id) => (await one(`select public.tool_uses_of($1, $2) as r`, [key, id])).r;
const as = async (role, sql, params) => {
  await db.exec(`set role ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
};

// ── 1. The key is the gate. ──
for (const bad of ["wrong", "", null, KEY.slice(0, -1), KEY + " ", KEY.toLowerCase()]) eq(await read(bad, WHO.a), { r: "unavailable" }, `a wrong key (${JSON.stringify(bad)}) is refused, and says nothing`);
eq(await read(KEY, null), { r: "bad" }, "no account id: bad");
eq(await read("wrong", null), { r: "unavailable" }, "the key is checked first");
eq((await as("anon", `select public.tool_uses_of($1, $2) as r`, [KEY, WHO.a]))[0].r, CASES.answer.a, "the server's client (anon, with the key) reads it");
eq((await as("anon", `select public.tool_uses_of($1, $2) as r`, ["wrong", WHO.a]))[0].r, { r: "unavailable" }, "anon without the key gets nothing");
await assert.rejects(as("authenticated", `select public.tool_uses_of($1, $2) as r`, [KEY, WHO.a]), /permission denied/, "a signed-in browser's role can't call it at all");
await assert.rejects(as("anon", `select * from private.tool_use_log`), /permission denied/, "and nobody reads the log itself");
passed += 2;

// ── 2. Only that account's rows; a guest's never. ──
eq(await read(KEY, WHO.a), CASES.answer.a, "Asha: exactly what the cases say");
eq(await read(KEY, WHO.b), CASES.answer.b, "Ravi: his own, none of hers");
eq(await read(KEY, U(404)), CASES.answer.nobody, "an id with no uses (an account or not): ok and empty");
{
  const a = await read(KEY, WHO.a);
  const tools = Object.fromEntries(a.tools.map((t) => [t.t, t]));
  ok(!("nrr_calculator" in tools), "a tool only others and guests used is not hers");
  eq(tools.team_generator, { t: "team_generator", first: "2026-11-03", days: [] }, "a tool only started: used, nothing finished (a guest's finished split is not hers)");
  eq(tools.toss.days.reduce((s, [, n]) => s + n, 0), 6, "her 6 tosses, not the device's 6");
  eq(tools.live_scoreboard.days, [["2026-11-05", 1]], "her one scoreboard match, not the guest's");
  // More guest rows, of every kind the table allows: nothing moves.
  await put("device", "2026-11-01T10:00:00Z", "toss", "finished");
  await put("guest", "2026-11-01T10:00:00Z", "scorecard_maker", "finished");
  await q(`insert into private.tool_use_log (used_at, tool, event, code, user_id, device) values ('2026-11-01T10:00:00Z', 'live_scorer', 'finished', 'zzzzzzzzzzzz', null, null)`);
  await q(`insert into private.tool_use_log (used_at, tool, event, code, user_id, device) values ('2026-11-01T10:00:00Z', 'live_scorer', 'finished', 'aaaaaaaaaaaa', null, 'dev1ce0tag00')`);
  eq(await read(KEY, WHO.a), CASES.answer.a, "more guest rows, one even with her live link's code: her answer is the same");
  eq(await read(KEY, WHO.b), CASES.answer.b, "and his");
  const all = JSON.stringify([await read(KEY, WHO.a), await read(KEY, WHO.b)]);
  ok(!/dev1ce|aaaaaaaaaaaa|bbbbbbbbbbbb|zzzzzzzzzzzz/.test(all), "no device tag and no live link code is in an answer");
  ok(!/T\d\d:\d\d|\+00/.test(all), "and no time of day");
}

// ── 3. India's dates. ──
{
  const id = U(3);
  WHO.c = id;
  // 18:29:59 UTC is 23:59:59 in India; 18:30:00 UTC is midnight, the next day.
  await put("c", "2026-10-31T18:29:59Z", "toss", "finished");
  await put("c", "2026-10-31T18:30:00Z", "toss", "finished");
  await put("c", "2026-12-31T20:00:00Z", "toss", "started");
  await put("c", "2026-12-31T20:00:05Z", "toss", "finished");
  const r = await read(KEY, id);
  eq(r.tools, [{ t: "toss", first: "2026-10-31", days: [["2026-10-31", 1], ["2026-11-01", 1], ["2027-01-01", 1]] }], "a use just before and at India's midnight are two days; New Year's Eve at 01:30 India time is 1 Jan");
  // Whatever time zone the session is in.
  for (const tz of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
    await db.exec(`set time zone '${tz}'`);
    eq(await read(KEY, id), r, `the same days with the session in ${tz}`);
  }
  await db.exec(`reset time zone`);
  // A live link's day is India's too, and it is the first finished use that carried it.
  await put("c", "2026-11-05T18:00:00Z", "live_scorer", "started", "llllllllllll");
  await put("c", "2026-11-06T19:00:00Z", "live_scorer", "finished", "llllllllllll");
  await put("c", "2026-11-09T10:00:00Z", "live_scorer", "finished", "llllllllllll");
  await put("c", "2026-11-08T10:00:00Z", "live_scoreboard", "started", "mmmmmmmmmmmm");
  await put("c", "2026-11-08T11:00:00Z", "toss", "finished", "nnnnnnnnnnnn");
  eq((await read(KEY, id)).live, ["2026-11-07"], "one day per link scored to an end (00:30 on 7 Nov in India); a link only started, or on another tool's row, is none");
}

// ── 4. The caps. ──
{
  // 120 days of one tool: the first 100, oldest first.
  const id = U(4);
  WHO.d = id;
  await q(`insert into private.tool_use_log (used_at, tool, event, user_id) select timestamptz '2026-01-01T06:00:00Z' + (g || ' days')::interval, 'toss', 'finished', $1 from generate_series(0, 119) g`, [id]);
  const days = (await read(KEY, id)).tools[0].days;
  eq(days.length, 100, "100 days a tool at most");
  eq([days[0], days[99]], [["2026-01-01", 1], ["2026-04-10", 1]], "the first 100, oldest first");
}
{
  // 1005 finished on one day: 999.
  const id = U(5);
  await q(`insert into private.tool_use_log (used_at, tool, event, user_id) select timestamptz '2026-02-01T06:00:00Z' + (g || ' seconds')::interval, 'team_generator', 'finished', $1 from generate_series(1, 1005) g`, [id]);
  eq((await read(KEY, id)).tools, [{ t: "team_generator", first: "2026-02-01", days: [["2026-02-01", 999]] }], "a day's count stops at 999");
}
{
  // 25 live links: the first 20 days. 25 tools (the table itself takes any name): 20.
  const id = U(6);
  await q(`insert into private.tool_use_log (used_at, tool, event, code, user_id) select timestamptz '2026-03-01T06:00:00Z' + (g || ' days')::interval, 'live_scorer', 'finished', 'link' || lpad(g::text, 8, '0'), $1 from generate_series(0, 24) g`, [id]);
  const r = await read(KEY, id);
  eq(r.live.length, 20, "20 live links at most");
  eq([r.live[0], r.live[19]], ["2026-03-01", "2026-03-20"], "the first 20, oldest first");
  await q(`insert into private.tool_use_log (used_at, tool, event, user_id) select '2026-03-01T06:00:00Z', 'tool_' || chr(97 + g), 'finished', $1 from generate_series(0, 24) g`, [id]);
  eq((await read(KEY, id)).tools.length, 20, "20 tools at most");
}
{
  // 5200 rows: only the first 5000 (oldest first) are read, so the newest 200, a day of their own, are not there.
  const id = U(7);
  await q(`insert into private.tool_use_log (used_at, tool, event, user_id) select timestamptz '2026-04-01T06:00:00Z' + (g || ' seconds')::interval, 'toss', 'started', $1 from generate_series(1, 5000) g`, [id]);
  await q(`insert into private.tool_use_log (used_at, tool, event, user_id) select timestamptz '2026-05-01T06:00:00Z' + (g || ' seconds')::interval, 'scorecard_maker', 'finished', $1 from generate_series(1, 200) g`, [id]);
  eq(await read(KEY, id), { r: "ok", tools: [{ t: "toss", first: "2026-04-01", days: [] }], live: [] }, "the first 5000 rows of an account, no more");
}

// ── 5. A read, by the account's own index, that writes nothing. ──
{
  const n = await count();
  const snap = async () => (await one(`select md5(string_agg(t::text, '|' order by id)) as h from private.tool_use_log t`)).h;
  const h = await snap();
  for (const id of [WHO.a, WHO.b, U(404)]) await read(KEY, id);
  eq([await count(), await snap()], [n, h], "reading changes nothing");
  await db.exec(`analyze private.tool_use_log`);
  const plan = (await q(`explain select t.tool from private.tool_use_log t where t.user_id = '${WHO.a}' order by t.used_at, t.id limit 5000`)).map((r) => r["QUERY PLAN"]).join("\n");
  ok(/tool_use_log_user/.test(plan), `the account's rows are found by tool_use_log_user, the index that was there\n${plan}`);
}

await db.close();
console.log(`tool_medals: ${passed} checks passed`);
