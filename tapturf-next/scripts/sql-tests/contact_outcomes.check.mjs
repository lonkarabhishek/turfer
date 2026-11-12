// Applies 20261113_contact_outcomes.sql (twice) to an in-memory Postgres
// (PGlite) with a stand-in public.turfs and the real public._is_admin_key
// and private.account_key_ok read from the repo's migrations (so no key is
// written here), and checks: the file's rules (additive, no destructive
// keyword, search_path '', its header's md5s are the repo's latest
// bodies, 20261113_owner_outreach.sql not needed and not changed); the
// grants (the table for nobody, the write and the report read for anon
// alone); an answer only with the server key, only for an active turf,
// only in the shapes the card can send, with India's date worked out
// here; the caps per turf and per day; that a row holds nothing about a
// person; the admin's counts only for the site owner, in
// admin_owner_outreach's city and window; the report's read only with the
// server key, nothing below 3 answers, the hours named most; and that the
// reads write nothing. Never touches a real database. Made-up turfs.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/contact_outcomes.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: contact_outcomes.check.mjs <supabase/migrations>");
const NAME = "20261113_contact_outcomes.sql";
const NEW = fs.readFileSync(`${M}/${NAME}`, "utf8");
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const md5 = (s) => createHash("md5").update(s).digest("hex");

// ── 0. The file. ──
const code = NEW.replace(/^\s*--.*$/gm, "");
assert.doesNotMatch(NEW, /\bdrop\b|\bdelete\b|\btruncate\b/i, "no destructive keywords, comments included");
assert.doesNotMatch(NEW, /[—–]/, "no em or en dashes");
assert.match(NEW, /^set local lock_timeout = '5s';\n/, "starts with the lock timeout");
assert.doesNotMatch(code, /\b(update|insert\s+into)\s+public\.\w+/i, "writes no public table");
assert.doesNotMatch(code, /\bgrant\b[^;]*\bon\s+(table\s+)?public\.(?!contact_outcome_add|admin_contact_outcomes|owner_report_said)|\bpolicy\b|\btrigger\b|cron\.schedule/i, "no grant or policy on a public table, no trigger, no job");
assert.doesNotMatch(code, /public\.users|\bemail\b|\buser_id\b|\buser_key\b|ip_hash|anon_id|\bphone\b|\bname\b/i, "reads and keeps no account, address, number or name");
assert.doesNotMatch(code, /references\s/i, "no foreign key: nothing here locks public.turfs");
passed += 7;
const MADE = [...NEW.matchAll(/create or replace function (\w+)\.(\w+)\(/gi)].map((m) => `${m[1]}.${m[2]}`);
eq(MADE.sort(), ["public.admin_contact_outcomes", "public.contact_outcome_add", "public.owner_report_said"], "exactly these three functions");
eq([...code.matchAll(/create table if not exists (\w+\.\w+)/gi)].map((m) => m[1]), ["private.contact_outcomes"], "one table, private");
eq((code.match(/create index if not exists/g) ?? []).length, 2, "two indexes, each only if missing");
eq((code.match(/security definer/g) ?? []).length, 3, "each function is security definer");
eq((code.match(/set search_path = ''/g) ?? []).length, 3, "each with an empty search_path");
for (const w of ["Replaced: none.", "read from pg_proc 12 Nov 2026", "The app works before this file", "Nothing that says who answered", "It does not need 20261113_owner_outreach.sql", "public.owner_report and its counts are left as they are"])
  ok(NEW.includes(w), `the header says ${w}`);

// The header's md5s: each is the md5 of the function's latest body in the repo's migrations (file name order), as md5(prosrc) gives it.
const HEADER = [...NEW.matchAll(/^--\s+(public|private)\.(\w+)\s+([0-9a-f]{32})\b/gm)].map((m) => ({ fn: `${m[1]}.${m[2]}`, md5: m[3] }));
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
const CALLED = ["public._caller_key", "public._is_admin_key", "private.account_key_ok"];
eq(HEADER.map((h) => h.fn).sort(), [...CALLED].sort(), "the header lists every function it calls");
for (const h of HEADER) eq(md5(repoDef(h.fn)?.body ?? ""), h.md5, `${h.fn}: the header's md5 is the repo's latest body`);
const calls = new Set([...code.matchAll(/\b(public|private)\.(\w+)\s*\(/g)].map((m) => `${m[1]}.${m[2]}`).filter((f) => !MADE.includes(f) && f !== "private.contact_outcomes"));
eq([...calls].sort(), [...CALLED].sort(), "it calls exactly the three functions listed");
// The file before it is left as it was reviewed, and nothing in it is replaced here.
const OUTREACH = fs.readFileSync(`${M}/20261113_owner_outreach.sql`, "utf8");
for (const f of ["admin_owner_outreach", "admin_owner_outreach_set", "owner_report"]) ok(!MADE.includes(`public.${f}`) && OUTREACH.includes(`function public.${f}(`), `${f} stays 20261113_owner_outreach.sql's`);
// The window is owner_report's (and so owner_dashboard's) and the admin list's own expressions.
const flat = (s) => s.replace(/\s+/g, " ");
for (const w of ["since := today - (d - 1)", "t_since := since::timestamp at time zone 'Asia/Kolkata'"]) ok(flat(repoDef("public.owner_report").body).includes(w) && flat(code).includes(w), `owner_report_said counts the window with: ${w}`);
for (const w of ["v_city text := coalesce(nullif(lower(btrim(p_city)), ''), 'hyderabad')", "v_days integer := case when p_days = 90 then 90 else 30 end", "v_since := v_today - (v_days - 1)", "t.is_active and lower(t.city) = v_city"])
  ok(flat(repoDef("public.admin_owner_outreach").body).includes(w) && flat(code).includes(w), `admin_contact_outcomes has admin_owner_outreach's: ${w}`);
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
create table public.turfs (id uuid primary key, name varchar, slug text, city text, area text, is_active boolean default true, owner_phone text);
-- Firebase can't be reached here: a "key:<caller key>" token stands for a verified sign-in (as owner_outreach.check.mjs's stand-in).
create function public._caller_key(p_token text) returns text language sql stable as $$ select case when p_token like 'key:%' then substr(p_token, 5) end $$;
`);
await db.exec(repoDef("public._is_admin_key").sql);
await db.exec(repoDef("private.account_key_ok").sql);
const KEY = "K" + "7".repeat(63);

// Refuses to run without what it needs, changing nothing.
{
  const bare = new PGlite();
  await bare.exec(`create role anon; create role authenticated; create schema private;`);
  await assert.rejects(bare.exec(NEW), /contact_outcomes needs/, "without the earlier files it refuses");
  eq((await bare.query(`select to_regclass('private.contact_outcomes') as t`)).rows[0].t, null, "and leaves nothing behind");
  await bare.close();
}

const before = await q(`select n.nspname, p.proname, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') order by 1, 2`);
// 20261113_owner_outreach.sql is not applied here: this file runs without it.
await db.exec(`begin; ${NEW}; commit;`);

// ── Fixture. ──
const T = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const turf = (n, o = {}) =>
  q(`insert into public.turfs (id, name, slug, city, area, is_active, owner_phone) values ($1,$2,$3,$4,'Gachibowli',$5,'9000000001')`, [T(n), `Turf ${n}`, `turf-${n}`, "city" in o ? o.city : "Hyderabad", o.active ?? true]);
await turf(1); await turf(2); await turf(3); await turf(4, { active: false }); await turf(5, { city: "pune" }); await turf(6, { city: null }); await turf(7);
const turfsBefore = await q(`select * from public.turfs order by id`);

const ADD = `select public.contact_outcome_add($1, $2, $3, $4, $5, $6, $7, $8, $9) as r`;
const add = async (key, id, o = {}) =>
  (await one(ADD, [key, id, "kind" in o ? o.kind : "call", "source" in o ? o.source : "turf_bar", "outcome" in o ? o.outcome : "got_slot", o.reason ?? null, o.day ?? null, o.hour ?? null, "signed" in o ? o.signed : false])).r;
const rows = (id) => q(`select turf_id, kind, source, outcome, reason, slot_date::text as slot_date, slot_hour, signed_in from private.contact_outcomes where turf_id = $1 order by id`, [id]);
const n = async () => (await one(`select count(*)::int as n from private.contact_outcomes`)).n;
const today = (await one(`select (now() at time zone 'Asia/Kolkata')::date::text as d`)).d;
const tomorrow = (await one(`select ((now() at time zone 'Asia/Kolkata')::date + 1)::text as d`)).d;
const admin = ADMIN_KEYS.map((k) => `key:${k}`);
const list = async (token, ...args) => (await one(`select public.admin_contact_outcomes($1${args.map((_, i) => `, $${i + 2}`).join("")}) as r`, [token, ...args])).r;
const said = async (key, id) => (await one(`select public.owner_report_said($1, $2) as r`, [key, id])).r;

// ── 1. Grants. ──
const SIG = { add: "contact_outcome_add(text, uuid, text, text, text, text, text, integer, boolean)", list: "admin_contact_outcomes(text, text, integer)", said: "owner_report_said(text, uuid)" };
for (const role of ["anon", "authenticated"]) {
  ok(!(await one(`select has_table_privilege($1, 'private.contact_outcomes', 'select,insert,update') as p`, [role])).p, `${role} can't touch the answers`);
  ok((await one(`select has_function_privilege($1, 'public.${SIG.list}', 'execute') as p`, [role])).p, `${role} may call the admin's counts (the check inside decides)`);
}
for (const f of [SIG.add, SIG.said]) {
  ok((await one(`select has_function_privilege('anon', 'public.${f}', 'execute') as p`)).p, `anon (the server's key client) may call ${f}`);
  ok(!(await one(`select has_function_privilege('authenticated', 'public.${f}', 'execute') as p`)).p, `a signed-in browser may not call ${f}`);
}
for (const f of Object.values(SIG)) ok(!(await one(`select has_function_privilege('public', 'public.${f}', 'execute') as p`)).p, `public's default execute on ${f} is revoked`);
ok((await one(`select relrowsecurity as r from pg_class where oid = 'private.contact_outcomes'::regclass`)).r, "the table has row level security on");
ok(!(await one(`select has_schema_privilege('anon', 'private', 'usage') as p`)).p, "anon has no use of the private schema");
eq((await q(`select column_name from information_schema.columns where table_schema = 'private' and table_name = 'contact_outcomes' order by ordinal_position`)).map((r) => r.column_name),
  ["id", "turf_id", "kind", "source", "outcome", "reason", "slot_date", "slot_hour", "signed_in", "created_at"], "the table's columns: nothing that says who answered");
eq((await one(`select count(*)::int as n from pg_constraint where conrelid = 'private.contact_outcomes'::regclass and contype = 'f'`)).n, 0, "no foreign key");

// ── 2. An answer in. ──
for (const k of [null, "", "wrong", KEY + "x"]) eq(await add(k, T(1)), { r: "unavailable" }, `refused without the server key (${k === null ? "null" : `"${k.slice(0, 5)}"`})`);
eq(await add(KEY, T(999)), { r: "not_found" }, "a turf that doesn't exist");
eq(await add(KEY, T(4)), { r: "not_found" }, "an inactive turf");
eq(await add(KEY, null), { r: "bad" }, "no turf");
const BAD = [
  [{ kind: "sms" }, "another kind"], [{ kind: null }, "no kind"],
  [{ outcome: "booked" }, "another outcome"], [{ outcome: null }, "no outcome"],
  [{ source: "Turf Bar" }, "a source that isn't a short lower-case word"], [{ source: "x".repeat(41) }, "a source over 40 characters"], [{ source: "" }, "an empty source"], [{ source: null }, "no source"],
  [{ outcome: "got_slot", reason: "full" }, "a reason with got_slot"], [{ outcome: "deciding", reason: "price" }, "a reason with deciding"], [{ outcome: "dismissed", reason: "no_reply" }, "a reason with dismissed"],
  [{ outcome: "not_this_time", reason: "rain" }, "an unknown reason"],
  [{ outcome: "not_this_time", reason: "price", day: "today" }, "a day with too pricey"], [{ outcome: "not_this_time", day: "today" }, "a day with no reason"],
  [{ outcome: "deciding", day: "today" }, "a day with deciding"], [{ outcome: "dismissed", day: "tomorrow" }, "a day with dismissed"],
  [{ day: "later" }, "later is no day"], [{ day: "2026-11-20" }, "a date from the browser"],
  [{ hour: 19 }, "an hour without a day"], [{ day: "today", hour: 24 }, "hour 24"], [{ day: "today", hour: -1 }, "hour -1"],
];
for (const [o, w] of BAD) eq(await add(KEY, T(1), o), { r: "bad" }, `refused: ${w}`);
eq(await n(), 0, "nothing stored by a refusal");

eq(await add(KEY, T(1), { day: "today", hour: 19, signed: true }), { r: "ok", city: "hyderabad" }, "got a slot, today 7 PM: stored, the city lower case");
eq(await add(KEY, T(1), { kind: "whatsapp", source: "turf_slots", day: "tomorrow", hour: 0 }), { r: "ok", city: "hyderabad" }, "tomorrow at midnight");
eq(await add(KEY, T(1), {}), { r: "ok", city: "hyderabad" }, "got a slot, later or skipped");
eq(await add(KEY, T(1), { day: "today" }), { r: "ok", city: "hyderabad" }, "a day with no hour");
eq(await add(KEY, T(1), { outcome: "not_this_time", reason: "full", day: "tomorrow", hour: 23 }), { r: "ok", city: "hyderabad" }, "slot was full, wanted tomorrow 11 PM");
eq(await add(KEY, T(1), { outcome: "not_this_time", reason: "full" }), { r: "ok", city: "hyderabad" }, "slot was full, time skipped");
for (const reason of ["price", "no_reply", "wrong_number", "just_asking"]) eq((await add(KEY, T(1), { outcome: "not_this_time", reason })).r, "ok", `not this time: ${reason}`);
eq((await add(KEY, T(1), { outcome: "not_this_time" })).r, "ok", "not this time, closed before a reason");
eq((await add(KEY, T(1), { outcome: "deciding" })).r, "ok", "still deciding");
eq((await add(KEY, T(1), { outcome: "dismissed", signed: null })).r, "ok", "dismissed; no signed-in flag is false");
eq(await add(KEY, T(5), {}), { r: "ok", city: "pune" }, "another city's turf");
eq(await add(KEY, T(6), {}), { r: "ok", city: null }, "a turf with no city: stored, no city");
const r1 = await rows(T(1));
eq(r1.slice(0, 6), [
  { turf_id: T(1), kind: "call", source: "turf_bar", outcome: "got_slot", reason: null, slot_date: today, slot_hour: 19, signed_in: true },
  { turf_id: T(1), kind: "whatsapp", source: "turf_slots", outcome: "got_slot", reason: null, slot_date: tomorrow, slot_hour: 0, signed_in: false },
  { turf_id: T(1), kind: "call", source: "turf_bar", outcome: "got_slot", reason: null, slot_date: null, slot_hour: null, signed_in: false },
  { turf_id: T(1), kind: "call", source: "turf_bar", outcome: "got_slot", reason: null, slot_date: today, slot_hour: null, signed_in: false },
  { turf_id: T(1), kind: "call", source: "turf_bar", outcome: "not_this_time", reason: "full", slot_date: tomorrow, slot_hour: 23, signed_in: false },
  { turf_id: T(1), kind: "call", source: "turf_bar", outcome: "not_this_time", reason: "full", slot_date: null, slot_hour: null, signed_in: false },
], "rows as answered: India's today and tomorrow worked out here");
eq(r1.length, 13, "one row per answer");
ok((await q(`select created_at from private.contact_outcomes`)).every((r) => Math.abs(Date.parse(r.created_at) - Date.now()) < 60_000), "each with when");
// The table itself refuses what the function refuses.
for (const [sql, w] of [
  [`insert into private.contact_outcomes (turf_id, kind, source, outcome, reason) values ('${T(1)}', 'call', 'turf_bar', 'got_slot', 'full')`, "a reason with got_slot"],
  [`insert into private.contact_outcomes (turf_id, kind, source, outcome, slot_date) values ('${T(1)}', 'call', 'turf_bar', 'deciding', current_date)`, "a date with deciding"],
  [`insert into private.contact_outcomes (turf_id, kind, source, outcome, slot_hour) values ('${T(1)}', 'call', 'turf_bar', 'got_slot', 19)`, "an hour without a date"],
  [`insert into private.contact_outcomes (turf_id, kind, source, outcome) values ('${T(1)}', 'call', 'A source', 'got_slot')`, "a source with a space"],
]) {
  await assert.rejects(db.query(sql), /check constraint/, `the table refuses ${w}`);
  passed++;
}

// ── 3. The caps. ──
const c0 = await n();
for (let i = 0; i < 40; i++) eq((await add(KEY, T(2), { outcome: "dismissed" })).r, "ok", `turf 2's answer ${i + 1} today`);
eq(await add(KEY, T(2), {}), { r: "capped" }, "the 41st answer for one turf in a day is not kept");
eq(await n(), c0 + 40, "and nothing was stored for it");
eq((await add(KEY, T(3), {})).r, "ok", "another turf is not capped by it");
// Yesterday's answers don't count against today (India's day).
await db.exec(`update private.contact_outcomes set created_at = (((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata') - interval '1 second' where turf_id = '${T(2)}'`);
eq((await add(KEY, T(2), { outcome: "not_this_time", reason: "wrong_number" })).r, "ok", "a new India day: turf 2 takes answers again");
// The cap for all turfs: 3000 a day.
await db.exec(`insert into private.contact_outcomes (turf_id, kind, source, outcome) select gen_random_uuid(), 'call', 'turf_bar', 'dismissed' from generate_series(1, 3000)`);
eq(await add(KEY, T(3), {}), { r: "capped" }, "past 3000 answers in a day nothing more is kept");
await db.exec(`update private.contact_outcomes set created_at = now() - interval '200 days' where turf_id not in (select id from public.turfs)`);
eq((await add(KEY, T(3), { outcome: "not_this_time", reason: "no_reply" })).r, "ok", "and the next day it is again");

// ── 4. The admin's counts. ──
for (const t of [null, "", "nonsense", "key:p:9111111111", "key:e:someone@example.com", "key:"]) eq(await list(t), { error: "forbidden" }, `the counts refuse ${t}`);
const hyd = await list(admin[0]);
eq(Object.keys(hyd).sort(), ["city", "days", "since", "today", "turfs"], "city, days, since, today, turfs");
eq([hyd.city, hyd.days, hyd.today], ["hyderabad", 30, today], "hyderabad and 30 days by default, India's today");
eq(hyd.since, (await one(`select ((now() at time zone 'Asia/Kolkata')::date - 29)::text as d`)).d, "since is today and the 29 days before");
eq(hyd.turfs, [
  { id: T(1), got_slot: 4, full: 2, price: 1, no_reply: 1, wrong_number: 1, just_asking: 1, no_reason: 1, deciding: 1, dismissed: 1 },
  { id: T(2), got_slot: 0, full: 0, price: 0, no_reply: 0, wrong_number: 1, just_asking: 0, no_reason: 0, deciding: 0, dismissed: 40 },
  { id: T(3), got_slot: 1, full: 0, price: 0, no_reply: 1, wrong_number: 0, just_asking: 0, no_reason: 0, deciding: 0, dismissed: 0 },
], "one row per active turf of the city with an answer, each answer counted once; a turf whose city is typed with a capital is the same city");
eq(await list(admin[1]), hyd, "the site owner's other sign-in sees the same");
eq((await list(admin[0], "  PUNE ")).turfs.map((t) => [t.id, t.got_slot]), [[T(5), 1]], "another city, however it is typed");
eq((await list(admin[0], "atlantis")).turfs, [], "a city with no answers: an empty list, never null");
eq((await list(admin[0], null)).city, "hyderabad", "no city is hyderabad");
for (const d of [null, 0, 7, 60, 91, -1]) eq((await list(admin[0], "hyderabad", d)).days, 30, `days ${d} is 30`);
// The window: both ends counted, the day before out; 90 days counts what 30 leaves out.
const at = (id, ago) => db.exec(`insert into private.contact_outcomes (turf_id, kind, source, outcome, created_at) values ('${id}', 'call', 'turf_bar', 'got_slot', (((now() at time zone 'Asia/Kolkata')::date - ${ago})::timestamp + interval '12 hours') at time zone 'Asia/Kolkata')`);
await at(T(7), 29); await at(T(7), 30); await at(T(7), 89); await at(T(7), 90);
const got = (l) => l.turfs.find((t) => t.id === T(7))?.got_slot;
eq([got(await list(admin[0])), got(await list(admin[0], "hyderabad", 90))], [1, 3], "30 days: day 29 in, day 30 out; 90 days: day 89 in, day 90 out");
await db.exec(`update public.turfs set is_active = false where id = '${T(7)}'`);
eq(got(await list(admin[0])), undefined, "a turf switched off is not listed");
await db.exec(`update public.turfs set is_active = true where id = '${T(7)}'`);
ok(!/9000000001|Gachibowli|turf_bar|Turf \d/.test(JSON.stringify(hyd)), "counts and ids only: no number, no name, no source");

// ── 5. The report's read. ──
for (const k of [null, "", "wrong", KEY + "x"]) eq(await said(k, T(1)), { r: "unavailable" }, `the read refuses the key ${k === null ? "null" : `"${k.slice(0, 5)}"`}`);
eq(await said(KEY, T(999)), { r: "not_found" }, "a turf that doesn't exist");
eq(await said(KEY, T(4)), { r: "not_found" }, "an inactive turf");
eq(await said(KEY, null), { r: "not_found" }, "no turf");
const s1 = await said(KEY, T(1));
eq(Object.keys(s1).sort(), ["answered", "days", "got_slot", "hours", "r", "since", "today"], "the read's keys, nothing else");
eq([s1.r, s1.days, s1.since, s1.today], ["ok", 30, hyd.since, today], "30 days, the admin list's own window");
eq([s1.answered, s1.got_slot], [11, 4], "answered: got a slot and not this time; still deciding and a closed card are not answers about a slot");
eq(s1.hours, [{ hour: 0, n: 1 }, { hour: 19, n: 1 }, { hour: 23, n: 1 }], "the hours named, most first, then the earlier hour");
// Turf 3: 2 answers (got a slot, no reply): nothing is said below 3.
eq(await said(KEY, T(3)), { r: "ok", days: 30, since: hyd.since, today, answered: 2, got_slot: null, hours: [] }, "2 answers: no count of slots, no hours");
eq((await add(KEY, T(3), { day: "today", hour: 20 })).r, "ok", "a third answer");
eq(await said(KEY, T(3)), { r: "ok", days: 30, since: hyd.since, today, answered: 3, got_slot: 2, hours: [{ hour: 20, n: 1 }] }, "3 answers: 2 got a slot, the hour named");
for (const [o, w] of [[{ day: "today", hour: 20 }, "8 PM again"], [{ outcome: "not_this_time", reason: "full", day: "tomorrow", hour: 20 }, "8 PM full"], [{ day: "today", hour: 7 }, "7 AM"], [{ outcome: "not_this_time", reason: "full", day: "today", hour: 21 }, "9 PM full"], [{ day: "today", hour: 21 }, "9 PM"], [{ day: "today", hour: 6 }, "6 AM"]])
  eq((await add(KEY, T(3), o)).r, "ok", `turf 3: ${w}`);
eq((await said(KEY, T(3))).hours, [{ hour: 20, n: 3 }, { hour: 21, n: 2 }, { hour: 6, n: 1 }], "three hours at most: most named first, a tie to the earlier hour; a full slot's hour counts as wanted");
eq(await said(KEY, T(6)), { r: "ok", days: 30, since: hyd.since, today, answered: 1, got_slot: null, hours: [] }, "one answer: nothing");
// Turf 7 has answers on day 29, 30, 89 and 90: only day 29 is in the report's window.
eq((await said(KEY, T(7))).answered, 1, "the window is the last 30 India days");
// Turf 2: 40 closed cards and 1 wrong number: one answer.
eq((await said(KEY, T(2))).answered, 1, "closed cards are not answers; the wrong number is");
const text = JSON.stringify([s1, await said(KEY, T(3)), await said(KEY, T(2))]);
ok(!/9000000001|Gachibowli|turf_bar|turf_slots|Turf \d|wrong_number|no_reply|signed/.test(text), "counts and hours only: no number, no source, no reason, nothing about a person");

// ── 6. Reading writes nothing; safe to run again. ──
const c1 = await n();
await list(admin[0]); await list(admin[0], "pune", 90); await said(KEY, T(1)); await said(KEY, T(3));
eq(await n(), c1, "reads change no row");
eq((await q(`select proname, provolatile from pg_proc where proname in ('admin_contact_outcomes', 'owner_report_said', 'contact_outcome_add') order by 1`)).map((r) => [r.proname, r.provolatile]),
  [["admin_contact_outcomes", "s"], ["contact_outcome_add", "v"], ["owner_report_said", "s"]], "both reads are stable");
await db.exec(`begin; ${NEW}; commit;`);
eq(await n(), c1, "run again: the answers stay");
eq((await said(KEY, T(1))).answered, 11, "and read the same");
eq((await one(`select count(*)::int as n from pg_proc where proname in ('admin_contact_outcomes', 'owner_report_said', 'contact_outcome_add')`)).n, 3, "no overload after running it twice");
eq((await one(`select count(*)::int as n from pg_indexes where schemaname = 'private' and tablename = 'contact_outcomes'`)).n, 3, "the primary key and the two indexes, once each");
const others = await q(`select n.nspname, p.proname, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.proname not in ('admin_contact_outcomes', 'owner_report_said', 'contact_outcome_add') order by 1, 2`);
eq(others, before, "every function from before is as it was");
eq(await q(`select * from public.turfs order by id`), turfsBefore, "public.turfs is never written");

console.log(`contact_outcomes: ${passed} checks passed`);
