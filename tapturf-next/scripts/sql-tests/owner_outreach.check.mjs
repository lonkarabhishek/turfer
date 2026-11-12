// Applies 20261113_owner_outreach.sql (twice) to an in-memory Postgres
// (PGlite) with stand-ins for the tables it reads (turfs, turf_owners and
// turf_daily_views as 20261019_mytapturf.sql has them, turf_contact_clicks,
// ask_queries, the city_turf_counts view) and the real
// public._is_admin_key and private.account_key_ok read from the repo's
// migrations (so no key is written here), and checks: the file's rules
// (additive, no destructive keyword, search_path '', its header's md5s are
// the repo's latest bodies); the grants (the table for nobody, the report
// for anon alone); the admin's list only for the site owner, one row per
// active turf of the city in the order the section shows, with the window
// owner_dashboard counts, the claim state, the listed numbers and the
// note; the note's rules (five statuses, 200 characters, who and when);
// the report only with the server key, counts equal to owner_dashboard's
// own expressions, and never anything about a person; and that reading
// either writes nothing. Never touches a real database. Made-up turfs and
// numbers.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/owner_outreach.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: owner_outreach.check.mjs <supabase/migrations>");
const NAME = "20261113_owner_outreach.sql";
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
assert.doesNotMatch(code, /\bgrant\b[^;]*\bon\s+(table\s+)?public\.(?!admin_owner_outreach|owner_report)|\bpolicy\b|\btrigger\b|cron\.schedule/i, "no grant or policy on a public table, no trigger, no job");
assert.doesNotMatch(code, /public\.users|\bemail\b|\buser_id\b|\buser_key\b|ip_hash|anon_id|a\.query|\.reply/i, "reads no account, address, or Ask words");
passed += 6;
const MADE = [...NEW.matchAll(/create or replace function (\w+)\.(\w+)\(/gi)].map((m) => `${m[1]}.${m[2]}`);
eq(MADE.sort(), ["public.admin_owner_outreach", "public.admin_owner_outreach_set", "public.owner_report"], "exactly these three functions");
eq([...code.matchAll(/create table if not exists (\w+\.\w+)/gi)].map((m) => m[1]), ["private.owner_outreach"], "one table, private");
eq((code.match(/security definer/g) ?? []).length, 3, "each function is security definer");
eq((code.match(/set search_path = ''/g) ?? []).length, 3, "each with an empty search_path");
for (const w of ["Replaced: none.", "read 12 Nov 2026", "The app works before this file", "Read only: it writes nothing", "Counts only"])
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
      last = { body: rest.slice(start, end), sql: rest.slice(0, end + d[1].length) + ";" };
    }
  }
  return last;
};
const CALLED = ["public._caller_key", "public._is_admin_key", "private.account_key_ok"];
eq(HEADER.map((h) => h.fn).sort(), [...CALLED, "public.owner_dashboard"].sort(), "the header lists every function it calls, and the rule it follows");
for (const h of HEADER) eq(md5(repoDef(h.fn)?.body ?? ""), h.md5, `${h.fn}: the header's md5 is the repo's latest body`);
const calls = new Set([...code.matchAll(/\b(public|private)\.(\w+)\s*\(/g)].map((m) => `${m[1]}.${m[2]}`).filter((f) => !MADE.includes(f) && f !== "private.owner_outreach"));
eq([...calls].sort(), [...CALLED].sort(), "it calls exactly the three functions listed");
// The window and the four counts are owner_dashboard's own expressions.
const dash = repoDef("public.owner_dashboard").body.replace(/\s+/g, " ");
for (const w of ["since date := today - (d - 1)", "prev date := since - d", "filters -> 'shown_ids' ? p_turf_id::text", "(now() at time zone 'Asia/Kolkata')::date"])
  ok(dash.includes(w), `owner_dashboard still counts with: ${w}`);
for (const w of ["since := today - (d - 1)", "prev := since - d", "a.filters -> 'shown_ids' ? p_turf_id::text"])
  ok(code.replace(/\s+/g, " ").includes(w), `owner_report counts with: ${w}`);
// The site owner's two keys, as the real public._is_admin_key has them (not written here).
const ADMIN_KEYS = [...repoDef("public._is_admin_key").body.matchAll(/'([ep]:[^']+)'/g)].map((m) => m[1]);
eq([ADMIN_KEYS.length, ADMIN_KEYS.filter((k) => k.startsWith("e:")).length, ADMIN_KEYS.filter((k) => /^p:[6-9]\d{9}$/.test(k)).length], [2, 1, 1], "the site owner: one Google address and one number");

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
create table public.turfs (id uuid primary key, name varchar, slug text, city text, area text, is_active boolean default true,
  contact_info jsonb, owner_phone text, whatsapp_phone text, landline_phone text, lat double precision, lng double precision, claimed boolean not null default false);
create table public.turf_owners (turf_id uuid not null, user_key text not null,
  status text not null check (status in ('active', 'pending', 'rejected', 'revoked')), via text not null default 'admin', name text, note text,
  created_at timestamptz not null default now(), decided_at timestamptz, primary key (turf_id, user_key));
create table public.turf_daily_views (turf_id uuid not null, day date not null, views integer not null default 0, primary key (turf_id, day));
create table public.turf_contact_clicks (id bigint generated always as identity primary key, turf_id uuid, kind text, source text, signed_in boolean, user_id uuid, created_at timestamptz default now());
create table public.ask_queries (id bigint generated always as identity primary key, ip_hash text, query text, filters jsonb, results int, reply text, user_id uuid, anon_id uuid, created_at timestamptz default now());
create view public.city_turf_counts as select city, count(*)::integer as n, null::double precision as lat, null::double precision as lng
  from public.turfs where is_active and city is not null and city <> '' group by city;
-- Firebase can't be reached here: a "key:<caller key>" token stands for a verified sign-in (as admin_slots_view.check.mjs's stand-in).
create function public._caller_key(p_token text) returns text language sql stable as $$ select case when p_token like 'key:%' then substr(p_token, 5) end $$;
`);
await db.exec(repoDef("public._is_admin_key").sql);
await db.exec(repoDef("private.account_key_ok").sql);
const KEY = "K" + "7".repeat(63);

// Refuses to run without what it needs, changing nothing.
{
  const bare = new PGlite();
  await bare.exec(`create role anon; create role authenticated; create schema private;`);
  await assert.rejects(bare.exec(NEW), /owner_outreach needs/, "without the earlier files it refuses");
  eq((await bare.query(`select to_regclass('private.owner_outreach') as t`)).rows[0].t, null, "and leaves nothing behind");
  await bare.close();
}

const before = await q(`select n.nspname, p.proname, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') order by 1, 2`);
await db.exec(`begin; ${NEW}; commit;`);

// ── Fixture. ──
const T = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const turf = (n, o = {}) =>
  q(`insert into public.turfs (id, name, slug, city, area, is_active, contact_info, owner_phone, whatsapp_phone, landline_phone) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
    T(n), o.name ?? `Turf ${n}`, `turf-${n}`, o.city ?? "hyderabad", o.area ?? "Gachibowli", o.active ?? true,
    o.contact ? JSON.stringify({ phone: o.contact, email: "owner@example.com" }) : null, o.owner ?? null, o.wa ?? null, o.land ?? null,
  ]);
const view = (n, ago, count) => q(`insert into public.turf_daily_views values ($1, (now() at time zone 'Asia/Kolkata')::date - $2::int, $3)`, [T(n), ago, count]);
// A tap at noon India time, `ago` India days back.
const tap = (n, kind, ago, times = 1) =>
  q(`insert into public.turf_contact_clicks (turf_id, kind, source, signed_in, user_id, created_at)
     select $1, $2, 'turf_bar', true, gen_random_uuid(), (((now() at time zone 'Asia/Kolkata')::date - $3::int)::timestamp + interval '12 hours') at time zone 'Asia/Kolkata' from generate_series(1, $4)`, [T(n), kind, ago, times]);
const ask = (ids, ago) =>
  q(`insert into public.ask_queries (ip_hash, query, filters, reply, created_at) values ('h', 'a private question', $1, 'a reply',
     (((now() at time zone 'Asia/Kolkata')::date - $2::int)::timestamp + interval '12 hours') at time zone 'Asia/Kolkata')`, [JSON.stringify({ shown_ids: ids.map(T) }), ago]);

await turf(1, { name: "Alpha Arena", owner: "9000000001", wa: "9000000002" });
await turf(2, { name: "Bravo Box", contact: "9000000003" });
await turf(3, { name: "Charlie Courts", land: "040 2300 0000" });
await turf(4, { name: "delta Dome" });
await turf(5, { name: "Echo Inactive", active: false });
await turf(6, { name: "Pune Pitch", city: "pune" });
await turf(7, { name: "Claimed Club" });
await turf(8, { name: "Beta Dome" });
// Turf 1: 3 calls + 2 WhatsApps in 30 days (both ends), 1 call on day 30 (out of 30, in 90, in prev), views 10 + 5 in, 7 on day 30.
await tap(1, "call", 0, 2); await tap(1, "call", 29); await tap(1, "whatsapp", 3, 2); await tap(1, "call", 30); await tap(1, "whatsapp", 59, 4); await tap(1, "call", 60);
await view(1, 0, 10); await view(1, 29, 5); await view(1, 30, 7); await view(1, 59, 2); await view(1, 60, 100);
// Turf 2: 5 WhatsApps. Turf 3: no taps, 50 views. Turf 4 and 8: nothing. Turf 7: 1 call, claimed. Others never listed for hyderabad.
await tap(2, "whatsapp", 1, 5); await view(2, 1, 4);
await view(3, 2, 50);
await tap(5, "call", 0, 9); await tap(6, "call", 0, 9); await view(6, 0, 3);
await tap(7, "call", 0); await view(7, 0, 1);
await q(`insert into public.turf_owners (turf_id, user_key, status) values ($1, 'p:9111111111', 'active'), ($1, 'p:9222222222', 'pending'), ($2, 'p:9333333333', 'pending'), ($3, 'p:9444444444', 'rejected'), ($4, 'p:9555555555', 'revoked')`, [T(7), T(2), T(3), T(4)]);
await ask([1, 2], 0); await ask([1], 29); await ask([2], 5); await ask([1], 30); await ask([1], 59); await ask([1], 60);

const r30 = (t) => t.calls + t.whatsapp;
const admin = ADMIN_KEYS.map((k) => `key:${k}`);
const list = async (token, ...args) => (await one(`select public.admin_owner_outreach($1${args.map((_, i) => `, $${i + 2}`).join("")}) as r`, [token, ...args])).r;
const set = async (token, ...args) => (await one(`select public.admin_owner_outreach_set($1, $2, $3${args.slice(2).map((_, i) => `, $${i + 4}`).join("")}) as r`, [token, ...args])).r;
const report = async (key, id) => (await one(`select public.owner_report($1, $2) as r`, [key, id])).r;
const rowCounts = async () => (await one(`select (select count(*) from private.owner_outreach)::int as n, (select count(*) from public.turfs)::int as t, (select count(*) from public.turf_contact_clicks)::int as c`));

// ── 1. Grants. ──
for (const role of ["anon", "authenticated"]) {
  ok(!(await one(`select has_table_privilege($1, 'private.owner_outreach', 'select,insert,update') as p`, [role])).p, `${role} can't touch the notes table`);
  ok((await one(`select has_function_privilege($1, 'public.admin_owner_outreach(text, text, integer)', 'execute') as p`, [role])).p, `${role} may call the list (the check inside decides)`);
  ok((await one(`select has_function_privilege($1, 'public.admin_owner_outreach_set(text, uuid, text, text, text)', 'execute') as p`, [role])).p, `${role} may call the set`);
}
ok((await one(`select has_function_privilege('anon', 'public.owner_report(text, uuid)', 'execute') as p`)).p, "anon (the server's key client) may call the report");
ok(!(await one(`select has_function_privilege('authenticated', 'public.owner_report(text, uuid)', 'execute') as p`)).p, "a signed-in browser may not");
for (const f of ["admin_owner_outreach(text, text, integer)", "admin_owner_outreach_set(text, uuid, text, text, text)", "owner_report(text, uuid)"])
  ok(!(await one(`select has_function_privilege('public', 'public.${f}', 'execute') as p`)).p, `public's default execute on ${f} is revoked`);
ok((await one(`select relrowsecurity as r from pg_class where oid = 'private.owner_outreach'::regclass`)).r, "the table has row level security on");
ok(!(await one(`select has_schema_privilege('anon', 'private', 'usage') as p`)).p, "anon has no use of the private schema");

// ── 2. Only the site owner. ──
for (const t of [null, "", "nonsense", "key:p:9111111111", "key:e:someone@example.com", "key:"]) {
  eq(await list(t), { error: "forbidden" }, `the list refuses ${t}`);
  eq(await set(t, T(1), "contacted"), { error: "forbidden" }, `the set refuses ${t}`);
}
eq((await rowCounts()).n, 0, "a refused set writes nothing");

// ── 3. The list. ──
const hyd = await list(admin[0]);
eq(Object.keys(hyd).sort(), ["cities", "city", "days", "since", "today", "turfs"], "city, days, since, today, cities, turfs");
eq([hyd.city, hyd.days], ["hyderabad", 30], "hyderabad and 30 days by default");
eq(hyd.today, (await one(`select (now() at time zone 'Asia/Kolkata')::date::text as d`)).d, "today is India's");
eq(hyd.since, (await one(`select ((now() at time zone 'Asia/Kolkata')::date - 29)::text as d`)).d, "since is today and the 29 days before");
eq(hyd.cities, [{ city: "hyderabad", n: 6 }, { city: "pune", n: 1 }], "the live cities, biggest first");
eq(hyd.turfs.map((t) => t.name), ["Alpha Arena", "Bravo Box", "Claimed Club", "Charlie Courts", "Beta Dome", "delta Dome"], "active turfs of the city: most taps, then most views, then by name whatever its case");
eq(hyd.turfs.map((t) => [t.calls, t.whatsapp, t.views]), [[3, 2, 15], [0, 5, 4], [1, 0, 1], [0, 0, 50], [0, 0, 0], [0, 0, 0]], "calls, WhatsApps and views in the window, both ends counted, the day before out");
eq(hyd.turfs.map((t) => t.claim), [null, "pending", "active", null, null, null], "claim: active wins over pending; rejected and revoked are not claimed");
eq(Object.keys(hyd.turfs[0]).sort(), ["area", "at", "by", "calls", "claim", "contact_phone", "id", "landline_phone", "name", "note", "owner_phone", "slug", "status", "taps30", "views", "views30", "whatsapp", "whatsapp_phone"], "a row's keys, nothing else");
eq([hyd.turfs[0].owner_phone, hyd.turfs[0].whatsapp_phone, hyd.turfs[1].contact_phone, hyd.turfs[3].landline_phone], ["9000000001", "9000000002", "9000000003", "040 2300 0000"], "the listed numbers, as stored, for the app to pick from");
ok(!JSON.stringify(hyd).includes("example.com") && !/9[1-5]{9}/.test(JSON.stringify(hyd)), "never contact_info's other fields, nor a claimant's key");
eq(hyd.turfs.map((t) => [t.status, t.note, t.by, t.at]), Array(6).fill(["not_contacted", null, null, null]), "nobody contacted yet");
eq(await list(admin[1]), hyd, "the site owner's other sign-in sees the same");
const d90 = await list(admin[0], "hyderabad", 90);
eq([d90.days, d90.turfs[0].calls, d90.turfs[0].whatsapp, d90.turfs[0].views], [90, 5, 6, 124], "90 days counts what 30 leaves out");
eq([d90.turfs[0].taps30, d90.turfs[0].views30], [r30(hyd.turfs[0]), 15], "taps30 and views30 stay the last 30 days, what the report shows");
eq(hyd.turfs.map((t) => [t.taps30, t.views30]), hyd.turfs.map((t) => [t.calls + t.whatsapp, t.views]), "and equal the row's own numbers at 30 days");
for (const d of [null, 0, 7, 60, 91, -1]) eq((await list(admin[0], "hyderabad", d)).days, 30, `days ${d} is 30`);
eq((await list(admin[0], "  PUNE ")).turfs.map((t) => t.name), ["Pune Pitch"], "another city, however it is typed");
eq((await list(admin[0], null)).city, "hyderabad", "no city is hyderabad");
eq((await list(admin[0], "atlantis")).turfs, [], "a city with no turfs: an empty list, never null");

// ── 4. The note. ──
eq(await set(admin[0], T(1), "called"), { error: "bad" }, "an unknown status is refused");
eq(await set(admin[0], T(1), null), { error: "bad" }, "no status is refused");
eq(await set(admin[0], T(1), "contacted", "x".repeat(201)), { error: "bad" }, "a note over 200 characters is refused");
eq(await set(admin[0], T(999), "contacted"), { error: "not_found" }, "a turf that doesn't exist");
eq(await set(admin[0], null, "contacted"), { error: "not_found" }, "no turf");
eq((await rowCounts()).n, 0, "nothing written by a refusal");
const s1 = await set(admin[0], T(1), "contacted", "  Spoke to   the manager \n call back Friday ", "  Asha  ");
eq([s1.ok, s1.status, s1.note, s1.by], [true, "contacted", "Spoke to the manager call back Friday", "Asha"], "saved, the note and the name tidied");
ok(Math.abs(Date.parse(s1.at) - Date.now()) < 60_000, "with when");
const s2 = await set(admin[1], T(1), "interested", "x".repeat(200));
eq([s2.status, s2.note.length, s2.by], ["interested", 200, "Site owner"], "set again by the other sign-in: 200 characters fit, no name is Site owner");
eq((await rowCounts()).n, 1, "one row per turf");
eq((await set(admin[0], T(2), "wrong_number", "   ", "N".repeat(60))).by.length, 40, "a long name is cut to 40");
eq((await set(admin[0], T(2), "wrong_number", "   ")).note, null, "a blank note is none");
for (const st of ["not_contacted", "contacted", "interested", "not_interested", "wrong_number"]) eq((await set(admin[0], T(3), st)).status, st, `status ${st}`);
const after = await list(admin[0]);
eq(after.turfs.slice(0, 2).map((t) => [t.name, t.status, t.by]), [["Alpha Arena", "interested", "Site owner"], ["Bravo Box", "wrong_number", "Site owner"]], "the list shows the notes");
eq(after.turfs[0].at, s2.at, "and when");
eq(after.turfs.map((t) => t.name), hyd.turfs.map((t) => t.name), "the order doesn't depend on the notes");

// ── 5. The report. ──
for (const k of [null, "", "wrong", KEY + "x"]) eq(await report(k, T(1)), { r: "unavailable" }, `the report refuses the key ${k === null ? "null" : `"${k.slice(0, 5)}"`}`);
eq(await report(KEY, T(999)), { r: "not_found" }, "a turf that doesn't exist");
eq(await report(KEY, T(5)), { r: "not_found" }, "an inactive turf");
eq(await report(KEY, null), { r: "not_found" }, "no turf");
const r1 = await report(KEY, T(1));
eq(Object.keys(r1).sort(), ["claimed", "days", "now", "prev", "r", "series", "since", "today", "turf"], "the report's keys, nothing else");
eq(r1.turf, { id: T(1), slug: "turf-1", name: "Alpha Arena", area: "Gachibowli", city: "hyderabad" }, "the turf: id, slug, name, area, city");
eq([r1.r, r1.days, r1.claimed, r1.since, r1.today], ["ok", 30, false, hyd.since, hyd.today], "30 days, the list's own window");
eq(r1.now, { views: 15, calls: 3, whatsapp: 2, ask: 2 }, "the last 30 days");
eq(r1.prev, { views: 9, calls: 1, whatsapp: 4, ask: 2 }, "the 30 days before: day 30 to day 59, not day 60");
eq(r1.series.length, 30, "a bar for each of the 30 days");
eq([r1.series[0].day, r1.series[29].day], [r1.since, r1.today], "from since to today");
eq(r1.series.reduce((a, s) => [a[0] + s.calls, a[1] + s.whatsapp], [0, 0]), [3, 2], "the bars add up to the totals");
eq([r1.series[29], r1.series[26], r1.series[0]], [{ day: r1.today, calls: 2, whatsapp: 0 }, { day: r1.series[26].day, calls: 0, whatsapp: 2 }, { day: r1.since, calls: 1, whatsapp: 0 }], "each tap on its India day");
eq([hyd.turfs[0].calls, hyd.turfs[0].whatsapp, hyd.turfs[0].views], [r1.now.calls, r1.now.whatsapp, r1.now.views], "the admin's row and the report agree");
eq([d90.turfs[0].taps30, d90.turfs[0].views30], [r1.now.calls + r1.now.whatsapp, r1.now.views], "and so do the 90 day list's taps30 and views30");
// The same numbers by owner_dashboard's own expressions (20261028_owner_call_number.sql), written out here.
const dashNow = await one(`
  with w as (select (now() at time zone 'Asia/Kolkata')::date - 29 as since)
  select (select coalesce(sum(views), 0)::int from public.turf_daily_views, w where turf_id = $1 and day >= w.since) as views,
         (select count(*)::int from public.turf_contact_clicks, w where turf_id = $1 and kind = 'call' and created_at >= w.since::timestamp at time zone 'Asia/Kolkata') as calls,
         (select count(*)::int from public.turf_contact_clicks, w where turf_id = $1 and kind = 'whatsapp' and created_at >= w.since::timestamp at time zone 'Asia/Kolkata') as whatsapp,
         (select count(*)::int from public.ask_queries, w where created_at >= w.since::timestamp at time zone 'Asia/Kolkata' and filters -> 'shown_ids' ? $1::text) as ask`, [T(1)]);
eq(r1.now, dashNow, "equal to owner_dashboard's own sums");
eq((await report(KEY, T(7))).claimed, true, "a turf with an active claim is claimed");
eq((await report(KEY, T(2))).claimed, false, "a waiting claim is not");
const r4 = await report(KEY, T(4));
eq([r4.now, r4.prev, r4.series.every((s) => s.calls === 0 && s.whatsapp === 0)], [{ views: 0, calls: 0, whatsapp: 0, ask: 0 }, { views: 0, calls: 0, whatsapp: 0, ask: 0 }, true], "a turf nobody opened: zeros, never null");
const text = JSON.stringify([r1, await report(KEY, T(2)), await report(KEY, T(7))]);
ok(!/900000000|9111111111|example\.com|private question|a reply|turf_bar/.test(text), "never a number, a claimant, a player or a question's words");
ok(!/"(note|status|by|owner_phone|whatsapp_phone|user_id|user_key)"/.test(text), "never the team's note or a contact column");

// ── 6. Reading writes nothing; safe to run again. ──
const c0 = await rowCounts();
await list(admin[0]); await report(KEY, T(1));
eq(await rowCounts(), c0, "reads change no row");
eq((await q(`select provolatile from pg_proc where proname in ('admin_owner_outreach', 'owner_report')`)).map((r) => r.provolatile), ["s", "s"], "both reads are stable");
await db.exec(`begin; ${NEW}; commit;`);
eq((await list(admin[0])).turfs[0].status, "interested", "run again: the notes stay");
eq((await one(`select count(*)::int as n from pg_proc where proname in ('admin_owner_outreach', 'admin_owner_outreach_set', 'owner_report')`)).n, 3, "no overload after running it twice");
const others = await q(`select n.nspname, p.proname, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.proname not in ('admin_owner_outreach', 'admin_owner_outreach_set', 'owner_report') order by 1, 2`);
eq(others, before, "every function from before is as it was");
eq((await one(`select count(*)::int as n from public.turfs where claimed`)).n, 0, "public.turfs is never written");

console.log(`owner_outreach: ${passed} checks passed`);
