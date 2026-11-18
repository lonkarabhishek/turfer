// Applies 20261118_slot_asks.sql (twice) to an in-memory Postgres (PGlite)
// with a stand-in public.turfs and public.turf_owners and the real
// public._is_admin_key, public._can_manage and private.account_key_ok read
// from the repo's migrations (so no key is written here), and checks: the
// file's rules (additive, none of the destructive keywords even inside a
// word or a comment, no backslash anywhere, search_path '', its header's
// md5s are the repo's latest bodies, no earlier function replaced, neither
// 20261113 file needed or changed); the grants (the table for nobody, the
// write and the report read for anon alone); an ask only with the server
// key, only for an active turf, only in the shapes the sheet can send, only
// for a day a player can ask about and a sport the turf lists; the caps per
// turf and per day; that a row holds nothing about a person; the admin's
// counts only for the site owner, in admin_owner_outreach's city and
// window, with the last 30 days beside a 90 day window; the report's read
// only with the server key, against the 30 days before, hour by hour;
// myTapturf's read only for whoever may manage the turf; and that the reads
// write nothing. Never touches a real database. Made-up turfs.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/slot_asks.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: slot_asks.check.mjs <supabase/migrations>");
const NAME = "20261118_slot_asks.sql";
const NEW = fs.readFileSync(`${M}/${NAME}`, "utf8");
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
assert.doesNotMatch(code, /\b(update|insert\s+into)\s+public\.\w+/i, "writes no public table");
assert.doesNotMatch(code, /\bgrant\b[^;]*\bon\s+(table\s+)?public\.(?!slot_ask_add|admin_slot_asks|owner_report_asks|owner_slot_asks)|\bpolicy\b|\btrigger\b|cron\.schedule/i, "no grant or policy on a public table, no trigger, no job");
assert.doesNotMatch(code, /public\.users|\bemail\b|\buser_id\b|\buser_key\b|ip_hash|anon_id|\bphone\b|\bname\b|\bmessage\b|\bnote\b/i, "reads and keeps no account, address, number, name or message");
assert.doesNotMatch(code, /references\s/i, "no foreign key: nothing here locks public.turfs");
passed += 8;
const MADE = [...NEW.matchAll(/create or replace function (\w+)\.(\w+)\(/gi)].map((m) => `${m[1]}.${m[2]}`);
eq([...MADE].sort(), ["public.admin_slot_asks", "public.owner_report_asks", "public.owner_slot_asks", "public.slot_ask_add"], "exactly these four functions");
eq([...code.matchAll(/create table if not exists (\w+\.\w+)/gi)].map((m) => m[1]), ["private.slot_asks"], "one table, private");
eq((code.match(/create index if not exists/g) ?? []).length, 2, "two indexes, each only if missing");
eq((code.match(/security definer/g) ?? []).length, 4, "each function is security definer");
eq((code.match(/set search_path = ''/g) ?? []).length, 4, "each with an empty search_path");
eq((code.match(/revoke all on function public\.\w+\([^)]*\) from public, anon, authenticated;/g) ?? []).length, 4, "each revoked from public, anon and authenticated before its grant");
for (const w of ["Replaced: none.", "read from pg_proc 18 Nov 2026", "The app works before this file", "Nothing that says who asked", "never the message or the chat", "It needs neither", "\"Did you get a slot?\" needs no change here"])
  ok(NEW.includes(w), `the header says ${w}`);

// The header's md5s: each is the md5 of the function's latest body in the repo's migrations (file name order), as md5(prosrc) gives it.
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
const CALLED = ["public._caller_key", "public._is_admin_key", "public._can_manage", "private.account_key_ok"];
// Named in the header as left alone: their production md5s too. (log_turf_contact_click's production body is not the repo's one copy; the header says so.)
const LEFT = ["public.contact_outcome_add", "public.owner_report", "public.owner_dashboard", "public.log_turf_contact_click"];
eq(HEADER.map((h) => h.fn).sort(), [...CALLED, ...LEFT].sort(), "the header lists every function it calls, and the four it leaves alone");
for (const h of HEADER.filter((x) => x.fn !== "public.log_turf_contact_click")) {
  const def = repoDef(h.fn);
  eq(md5(def?.body ?? ""), h.md5, `${h.fn}: the header's md5 is the repo's latest body`);
  eq(def?.file, h.file, `${h.fn}: and the header names the file that has it`);
}
ok(NEW.includes(md5(repoDef("public.log_turf_contact_click").body)), "log_turf_contact_click: the header gives the repo copy's md5 beside production's");
const calls = new Set([...code.matchAll(/\b(public|private)\.(\w+)\s*\(/g)].map((m) => `${m[1]}.${m[2]}`).filter((f) => !MADE.includes(f) && f !== "private.slot_asks"));
eq([...calls].sort(), [...CALLED].sort(), "it calls exactly the four functions listed");
for (const f of LEFT) ok(!MADE.includes(f), `${f} is not replaced`);
// The files before it are left as they were reviewed, and nothing in them is replaced here.
for (const [file, fns] of [["20261113_contact_outcomes.sql", ["contact_outcome_add", "admin_contact_outcomes", "owner_report_said"]], ["20261113_owner_outreach.sql", ["admin_owner_outreach", "admin_owner_outreach_set", "owner_report"]]]) {
  const txt = fs.readFileSync(`${M}/${file}`, "utf8");
  for (const f of fns) ok(!MADE.includes(`public.${f}`) && txt.includes(`function public.${f}(`), `${f} stays ${file}'s`);
}
// "Did you get a slot?" needs no new function: contact_outcome_add takes a day and an hour already.
ok(/p_day text default null,\s*p_hour integer default null/.test(repoDef("public.contact_outcome_add").sql), "contact_outcome_add already takes p_day and p_hour");
// The windows are owner_report's, owner_dashboard's and the admin list's own expressions.
const flat = (s) => s.replace(/\s+/g, " ");
for (const w of ["since := today - (d - 1)", "prev := since - d", "t_since := since::timestamp at time zone 'Asia/Kolkata'", "t_prev := prev::timestamp at time zone 'Asia/Kolkata'"])
  ok(flat(repoDef("public.owner_report").body).includes(w) && flat(code).includes(w), `owner_report_asks counts the window with: ${w}`);
ok(flat(repoDef("public.owner_dashboard").body).includes("d integer := least(greatest(coalesce(p_days, 30), 7), 90)") && flat(code).includes("d integer := least(greatest(coalesce(p_days, 30), 7), 90)"), "owner_slot_asks has owner_dashboard's days");
for (const w of ["v_city text := coalesce(nullif(lower(btrim(p_city)), ''), 'hyderabad')", "v_days integer := case when p_days = 90 then 90 else 30 end", "v_since := v_today - (v_days - 1)", "t.is_active and lower(t.city) = v_city"])
  ok(flat(repoDef("public.admin_owner_outreach").body).includes(w) && flat(code).includes(w), `admin_slot_asks has admin_owner_outreach's: ${w}`);
// The site owner's two keys, as the real public._is_admin_key has them (not written here).
const ADMIN_KEYS = [...repoDef("public._is_admin_key").body.matchAll(/'([ep]:[^']+)'/g)].map((m) => m[1]);
eq(ADMIN_KEYS.length, 2, "the site owner's two sign-ins");

// ── The database before it. ──
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
await db.exec(`
create role anon; create role authenticated;
create schema private;
grant usage on schema public to anon, authenticated;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', 'K' || repeat('7', 63));
create table public.turfs (id uuid primary key, name varchar, slug text, city text, area text, is_active boolean default true, owner_phone text, sports jsonb);
create table public.turf_owners (turf_id uuid not null, user_key text not null, user_id uuid, status text not null, primary key (turf_id, user_key));
-- Firebase can't be reached here: a "key:<caller key>" token stands for a verified sign-in (as contact_outcomes.check.mjs's stand-in).
create function public._caller_key(p_token text) returns text language sql stable as $$ select case when p_token like 'key:%' then substr(p_token, 5) end $$;
-- No account links here: a key opens no account, so a claim counts by its own key (the first arm of the real public._can_manage).
create function private.account_for_key(p_key text) returns uuid language sql stable as $$ select null::uuid $$;
`);
await db.exec(repoDef("public._is_admin_key").sql);
await db.exec(repoDef("public._can_manage").sql);
await db.exec(repoDef("private.account_key_ok").sql);
const KEY = "K" + "7".repeat(63);

// Refuses to run without what it needs, changing nothing.
{
  const bare = new PGlite();
  await bare.exec(`create role anon; create role authenticated; create schema private;`);
  await assert.rejects(bare.exec(NEW), /slot_asks needs/, "without the earlier files it refuses");
  eq((await bare.query(`select to_regclass('private.slot_asks') as t`)).rows[0].t, null, "and leaves nothing behind");
  await bare.close();
}

const before = await q(`select n.nspname, p.proname, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') order by 1, 2`);
// Neither 20261113 file is applied here: this file runs without them.
await db.exec(`begin; ${NEW}; commit;`);

// ── Fixture. ──
const T = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const turf = (n, o = {}) =>
  q(`insert into public.turfs (id, name, slug, city, area, is_active, owner_phone, sports) values ($1,$2,$3,$4,'Gachibowli',$5,'9000000001',$6)`,
    [T(n), `Turf ${n}`, `turf-${n}`, "city" in o ? o.city : "Hyderabad", o.active ?? true, "sports" in o ? o.sports : JSON.stringify(["Football", "Box  Cricket "])]);
await turf(1); await turf(2); await turf(3); await turf(4, { active: false }); await turf(5, { city: "pune" }); await turf(6, { city: null, sports: null }); await turf(7); await turf(8, { sports: JSON.stringify("Football") });
const turfsBefore = await q(`select * from public.turfs order by id`);

const day = async (n) => (await one(`select ((now() at time zone 'Asia/Kolkata')::date + $1::int)::text as d`, [n])).d;
const today = await day(0);
const ADD = `select public.slot_ask_add($1, $2, $3, $4, $5, $6, $7, $8, $9) as r`;
const add = async (key, id, o = {}) =>
  (await one(ADD, [key, id, "date" in o ? o.date : today, "hour" in o ? o.hour : 19, "minute" in o ? o.minute : 0, "minutes" in o ? o.minutes : 60, o.sport ?? null, o.players ?? null, "signed" in o ? o.signed : false])).r;
const rows = (id) => q(`select turf_id, slot_date::text as slot_date, slot_hour, slot_minute, minutes, sport, players, signed_in from private.slot_asks where turf_id = $1 order by id`, [id]);
const n = async () => (await one(`select count(*)::int as n from private.slot_asks`)).n;
const admin = ADMIN_KEYS.map((k) => `key:${k}`);
const list = async (token, ...args) => (await one(`select public.admin_slot_asks($1${args.map((_, i) => `, $${i + 2}`).join("")}) as r`, [token, ...args])).r;
const report = async (key, id) => (await one(`select public.owner_report_asks($1, $2) as r`, [key, id])).r;
const mine = async (token, id, ...args) => (await one(`select public.owner_slot_asks($1, $2${args.map((_, i) => `, $${i + 3}`).join("")}) as r`, [token, id, ...args])).r;

// ── 1. Grants. ──
const SIG = { add: "slot_ask_add(text, uuid, date, integer, integer, integer, text, integer, boolean)", list: "admin_slot_asks(text, text, integer)", report: "owner_report_asks(text, uuid)", mine: "owner_slot_asks(text, uuid, integer)" };
for (const role of ["anon", "authenticated"]) {
  ok(!(await one(`select has_table_privilege($1, 'private.slot_asks', 'select,insert,update') as p`, [role])).p, `${role} can't touch the asks`);
  for (const f of [SIG.list, SIG.mine]) ok((await one(`select has_function_privilege($1, 'public.${f}', 'execute') as p`, [role])).p, `${role} may call ${f} (the check inside decides)`);
}
for (const f of [SIG.add, SIG.report]) {
  ok((await one(`select has_function_privilege('anon', 'public.${f}', 'execute') as p`)).p, `anon (the server's key client) may call ${f}`);
  ok(!(await one(`select has_function_privilege('authenticated', 'public.${f}', 'execute') as p`)).p, `a signed-in browser may not call ${f}`);
}
for (const f of Object.values(SIG)) ok(!(await one(`select has_function_privilege('public', 'public.${f}', 'execute') as p`)).p, `public's default execute on ${f} is revoked`);
ok((await one(`select relrowsecurity as r from pg_class where oid = 'private.slot_asks'::regclass`)).r, "the table has row level security on");
ok(!(await one(`select has_schema_privilege('anon', 'private', 'usage') as p`)).p, "anon has no use of the private schema");
eq((await q(`select column_name from information_schema.columns where table_schema = 'private' and table_name = 'slot_asks' order by ordinal_position`)).map((r) => r.column_name),
  ["id", "turf_id", "slot_date", "slot_hour", "slot_minute", "minutes", "sport", "players", "signed_in", "created_at"], "the table's columns: nothing that says who asked, and no message");
eq((await one(`select count(*)::int as n from pg_constraint where conrelid = 'private.slot_asks'::regclass and contype = 'f'`)).n, 0, "no foreign key");
eq((await q(`select proname, prosecdef, proconfig from pg_proc where proname in ('slot_ask_add', 'admin_slot_asks', 'owner_report_asks', 'owner_slot_asks') order by 1`)).map((r) => [r.proname, r.prosecdef, r.proconfig]),
  [["admin_slot_asks", true, ['search_path=""']], ["owner_report_asks", true, ['search_path=""']], ["owner_slot_asks", true, ['search_path=""']], ["slot_ask_add", true, ['search_path=""']]], "security definer, search_path empty, as the database has them");

// ── 2. An ask in. ──
for (const k of [null, "", "wrong", KEY + "x"]) eq(await add(k, T(1)), { r: "unavailable" }, `refused without the server key (${k === null ? "null" : `"${k.slice(0, 5)}"`})`);
eq(await add(KEY, T(999)), { r: "not_found" }, "a turf that doesn't exist");
eq(await add(KEY, T(4)), { r: "not_found" }, "an inactive turf");
eq(await add(KEY, null), { r: "bad" }, "no turf");
const BAD = [
  [{ date: null }, "no date"], [{ date: await day(-2) }, "a date before yesterday"], [{ date: await day(9) }, "a date more than 8 days on"], [{ date: "2020-01-01" }, "an old date"],
  [{ hour: null }, "no hour"], [{ hour: 24 }, "hour 24"], [{ hour: -1 }, "hour -1"],
  [{ minute: 60 }, "minute 60"], [{ minute: -1 }, "minute -1"],
  [{ minutes: null }, "no length"], [{ minutes: 45 }, "45 minutes"], [{ minutes: 240 }, "4 hours"], [{ minutes: 0 }, "0 minutes"],
  [{ players: 0 }, "0 players"], [{ players: 61 }, "61 players"], [{ players: -3 }, "-3 players"],
  [{ sport: "Football" }, "a sport with a capital"], [{ sport: "9876543210" }, "a number where the sport goes"], [{ sport: "asha rao" }, "a name where the sport goes"],
  [{ sport: "tennis" }, "a sport the turf doesn't list"], [{ sport: "" }, "an empty sport"], [{ sport: "x".repeat(31) }, "a sport over 30 characters"],
];
for (const [o, w] of BAD) eq(await add(KEY, T(1), o), { r: "bad" }, `refused: ${w}`);
eq(await add(KEY, T(6), { sport: "football" }), { r: "bad" }, "a turf that lists no sport takes none");
eq(await add(KEY, T(8), { sport: "football" }), { r: "bad" }, "a turf whose sports are no list takes none");
eq(await n(), 0, "nothing stored by a refusal");

eq(await add(KEY, T(1), { hour: 19, sport: "football", players: 10, signed: true }), { r: "ok" }, "today 7 PM, football, about 10");
eq(await add(KEY, T(1), { date: await day(1), hour: 6, minute: 30, minutes: 90, sport: "box cricket" }), { r: "ok" }, "tomorrow 6:30 AM for 1.5 h; the turf's label matched whatever its spaces");
eq(await add(KEY, T(1), { date: await day(8), hour: 0, minutes: 180 }), { r: "ok" }, "the last day's hour after midnight, 3 h, no sport, no group size");
eq(await add(KEY, T(1), { date: await day(-1), hour: 23, minutes: 120, signed: null }), { r: "ok" }, "yesterday (a tap as India's day turns); no signed-in flag is false");
eq(await add(KEY, T(1), { minute: null }), { r: "ok" }, "no minute is :00");
eq(await add(KEY, T(5)), { r: "ok" }, "another city's turf");
eq(await add(KEY, T(6)), { r: "ok" }, "a turf with no city and no sports: stored, with no sport");
const r1 = await rows(T(1));
eq(r1, [
  { turf_id: T(1), slot_date: today, slot_hour: 19, slot_minute: 0, minutes: 60, sport: "football", players: 10, signed_in: true },
  { turf_id: T(1), slot_date: await day(1), slot_hour: 6, slot_minute: 30, minutes: 90, sport: "box cricket", players: null, signed_in: false },
  { turf_id: T(1), slot_date: await day(8), slot_hour: 0, slot_minute: 0, minutes: 180, sport: null, players: null, signed_in: false },
  { turf_id: T(1), slot_date: await day(-1), slot_hour: 23, slot_minute: 0, minutes: 120, sport: null, players: null, signed_in: false },
  { turf_id: T(1), slot_date: today, slot_hour: 19, slot_minute: 0, minutes: 60, sport: null, players: null, signed_in: false },
], "rows as asked");
ok((await q(`select created_at from private.slot_asks`)).every((r) => Math.abs(Date.parse(r.created_at) - Date.now()) < 60_000), "each with when");
// The table itself refuses what the function refuses.
for (const [sql, w] of [
  [`insert into private.slot_asks (turf_id, slot_date, slot_hour, minutes) values ('${T(1)}', current_date, 24, 60)`, "hour 24"],
  [`insert into private.slot_asks (turf_id, slot_date, slot_hour, minutes) values ('${T(1)}', current_date, 19, 45)`, "45 minutes"],
  [`insert into private.slot_asks (turf_id, slot_date, slot_hour, minutes, sport) values ('${T(1)}', current_date, 19, 60, 'Asha Rao')`, "a sport with capitals"],
  [`insert into private.slot_asks (turf_id, slot_date, slot_hour, minutes, players) values ('${T(1)}', current_date, 19, 60, 0)`, "0 players"],
  [`insert into private.slot_asks (turf_id, slot_date, slot_hour, slot_minute, minutes) values ('${T(1)}', current_date, 19, 60, 60)`, "minute 60"],
]) {
  await assert.rejects(db.query(sql), /check constraint/, `the table refuses ${w}`);
  passed++;
}

// ── 3. The caps. ──
const c0 = await n();
for (let i = 0; i < 100; i++) eq((await add(KEY, T(2), { hour: 20 })).r, "ok", `turf 2's ask ${i + 1} today`);
eq(await add(KEY, T(2)), { r: "capped" }, "the 101st ask for one turf in a day is not kept");
eq(await n(), c0 + 100, "and nothing was stored for it");
eq((await add(KEY, T(3), { hour: 21 })).r, "ok", "another turf is not capped by it");
// Yesterday's asks don't count against today (India's day).
await db.exec(`update private.slot_asks set created_at = (((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata') - interval '1 second' where turf_id = '${T(2)}'`);
eq((await add(KEY, T(2), { hour: 7 })).r, "ok", "a new India day: turf 2 takes asks again");
// The cap for all turfs: 5000 a day.
await db.exec(`insert into private.slot_asks (turf_id, slot_date, slot_hour, minutes) select gen_random_uuid(), current_date, 19, 60 from generate_series(1, 5000)`);
eq(await add(KEY, T(3)), { r: "capped" }, "past 5000 asks in a day nothing more is kept");
await db.exec(`update private.slot_asks set created_at = now() - interval '200 days' where turf_id not in (select id from public.turfs)`);
eq((await add(KEY, T(3), { hour: 21 })).r, "ok", "and the next day it is again");
eq((await add(KEY, T(3), { hour: 6 })).r, "ok", "turf 3 at 6 AM");

// ── 4. The admin's counts. ──
for (const t of [null, "", "nonsense", "key:p:9111111111", "key:e:someone@example.com", "key:"]) eq(await list(t), { error: "forbidden" }, `the counts refuse ${t}`);
const hyd = await list(admin[0]);
eq(Object.keys(hyd).sort(), ["city", "days", "since", "today", "turfs"], "city, days, since, today, turfs");
eq([hyd.city, hyd.days, hyd.today, hyd.since], ["hyderabad", 30, today, await day(-29)], "hyderabad and 30 days by default, India's today, since is today and the 29 days before");
eq(hyd.turfs, [
  { id: T(1), asks: 5, asks30: 5, hours: [{ hour: 19, n: 2 }, { hour: 0, n: 1 }, { hour: 6, n: 1 }] },
  { id: T(2), asks: 101, asks30: 101, hours: [{ hour: 20, n: 100 }, { hour: 7, n: 1 }] },
  { id: T(3), asks: 3, asks30: 3, hours: [{ hour: 21, n: 2 }, { hour: 6, n: 1 }] },
], "one row per active turf of the city with an ask; the three hours asked for most, most first, a tie to the earlier hour; a turf whose city is typed with a capital is the same city");
eq(await list(admin[1]), hyd, "the site owner's other sign-in sees the same");
eq((await list(admin[0], "  PUNE ")).turfs, [{ id: T(5), asks: 1, asks30: 1, hours: [{ hour: 19, n: 1 }] }], "another city, however it is typed");
eq((await list(admin[0], "atlantis")).turfs, [], "a city with no asks: an empty list, never null");
eq((await list(admin[0], null)).city, "hyderabad", "no city is hyderabad");
for (const d of [null, 0, 7, 60, 91, -1]) eq((await list(admin[0], "hyderabad", d)).days, 30, `days ${d} is 30`);
// The window: both ends counted, the day before out; 90 days counts what 30 leaves out, and asks30 stays the last 30.
const at = (id, ago, hour = 18) => db.exec(`insert into private.slot_asks (turf_id, slot_date, slot_hour, minutes, created_at) values ('${id}', current_date, ${hour}, 60, (((now() at time zone 'Asia/Kolkata')::date - ${ago})::timestamp + interval '12 hours') at time zone 'Asia/Kolkata')`);
await at(T(7), 29); await at(T(7), 30, 9); await at(T(7), 59, 9); await at(T(7), 60, 10); await at(T(7), 89, 9); await at(T(7), 90);
const t7 = (l) => l.turfs.find((t) => t.id === T(7));
eq(t7(await list(admin[0])), { id: T(7), asks: 1, asks30: 1, hours: [{ hour: 18, n: 1 }] }, "30 days: day 29 in, day 30 out");
eq(t7(await list(admin[0], "hyderabad", 90)), { id: T(7), asks: 5, asks30: 1, hours: [{ hour: 9, n: 3 }, { hour: 10, n: 1 }, { hour: 18, n: 1 }] }, "90 days: day 89 in, day 90 out; asks30 is still the last 30 days");
await db.exec(`update public.turfs set is_active = false where id = '${T(7)}'`);
eq(t7(await list(admin[0])), undefined, "a turf switched off is not listed");
await db.exec(`update public.turfs set is_active = true where id = '${T(7)}'`);
ok(!/9000000001|Gachibowli|football|Turf \d|signed/.test(JSON.stringify(hyd)), "counts, hours and ids only: no number, no name, no sport, nothing about a person");

// ── 5. The report's read. ──
for (const k of [null, "", "wrong", KEY + "x"]) eq(await report(k, T(1)), { r: "unavailable" }, `the read refuses the key ${k === null ? "null" : `"${k.slice(0, 5)}"`}`);
eq(await report(KEY, T(999)), { r: "not_found" }, "a turf that doesn't exist");
eq(await report(KEY, T(4)), { r: "not_found" }, "an inactive turf");
eq(await report(KEY, null), { r: "not_found" }, "no turf");
const p1 = await report(KEY, T(1));
eq(p1, { r: "ok", days: 30, since: hyd.since, today, asks: 5, prev: 0, hours: [{ hour: 0, n: 1 }, { hour: 6, n: 1 }, { hour: 19, n: 2 }, { hour: 23, n: 1 }] }, "30 days, the admin list's own window; every hour asked for, by hour");
eq(await report(KEY, T(7)), { r: "ok", days: 30, since: hyd.since, today, asks: 1, prev: 2, hours: [{ hour: 18, n: 1 }] }, "prev: the 30 days before (days 30 and 59 in, day 60 out)");
eq(await report(KEY, T(8)), { r: "ok", days: 30, since: hyd.since, today, asks: 0, prev: 0, hours: [] }, "a turf nobody asked: zeros and no hours, never null");
eq((await report(KEY, T(2))).asks, 101, "yesterday's 100 and today's one");
ok(!/9000000001|Gachibowli|football|Turf \d|signed|players/.test(JSON.stringify([p1, await report(KEY, T(2))])), "counts and hours only");

// ── 6. myTapturf's read. ──
await db.exec(`insert into public.turf_owners (turf_id, user_key, status) values ('${T(1)}', 'p:9000000101', 'active'), ('${T(1)}', 'p:9000000102', 'pending'), ('${T(3)}', 'p:9000000101', 'revoked')`);
for (const t of [null, "", "nonsense", "key:", "key:p:9000000102", "key:p:9999999999"]) eq(await mine(t, T(1)), { error: "forbidden" }, `myTapturf's read refuses ${t} (no claim, or one still waiting)`);
eq(await mine("key:p:9000000101", T(3)), { error: "forbidden" }, "a claim taken back opens nothing");
eq(await mine("key:p:9000000101", null), { error: "forbidden" }, "no turf");
const m1 = await mine("key:p:9000000101", T(1));
eq(m1, { days: 30, since: hyd.since, today, asks: 5, prev: 0, hours: p1.hours }, "the turf's own manager: the report's numbers");
eq(await mine(admin[0], T(1)), m1, "the site owner too, as owner_dashboard lets him in");
eq((await mine(admin[0], T(7), 90)), { days: 90, since: await day(-89), today, asks: 5, prev: 1, hours: [{ hour: 9, n: 3 }, { hour: 10, n: 1 }, { hour: 18, n: 1 }] }, "90 days against the 90 before");
eq([(await mine(admin[0], T(7), 7)).days, (await mine(admin[0], T(7), 1)).days, (await mine(admin[0], T(7), 400)).days, (await mine(admin[0], T(7), null)).days], [7, 7, 90, 30], "owner_dashboard's days: 7 to 90, 30 when none");

// ── 7. Reading writes nothing; safe to run again. ──
const c1 = await n();
await list(admin[0]); await list(admin[0], "pune", 90); await report(KEY, T(1)); await mine(admin[0], T(1));
eq(await n(), c1, "reads change no row");
eq((await q(`select proname, provolatile from pg_proc where proname in ('admin_slot_asks', 'owner_report_asks', 'owner_slot_asks', 'slot_ask_add') order by 1`)).map((r) => [r.proname, r.provolatile]),
  [["admin_slot_asks", "s"], ["owner_report_asks", "s"], ["owner_slot_asks", "s"], ["slot_ask_add", "v"]], "the three reads are stable");
await db.exec(`begin; ${NEW}; commit;`);
eq(await n(), c1, "run again: the asks stay");
eq(await report(KEY, T(1)), p1, "and read the same");
eq((await one(`select count(*)::int as n from pg_proc where proname in ('admin_slot_asks', 'owner_report_asks', 'owner_slot_asks', 'slot_ask_add')`)).n, 4, "no overload after running it twice");
eq((await one(`select count(*)::int as n from pg_indexes where schemaname = 'private' and tablename = 'slot_asks'`)).n, 3, "the primary key and the two indexes, once each");
const others = await q(`select n.nspname, p.proname, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.proname not in ('admin_slot_asks', 'owner_report_asks', 'owner_slot_asks', 'slot_ask_add') order by 1, 2`);
eq(others, before, "every function from before is as it was");
eq(await q(`select * from public.turfs order by id`), turfsBefore, "public.turfs is never written");

console.log(`slot_asks: ${passed} checks passed`);
