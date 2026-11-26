// Applies 20261127_contact_outcome_totals.sql (twice) to an in-memory Postgres
// (PGlite) on top of the real 20261113_contact_outcomes.sql and
// 20261118_slot_asks.sql and the real public._is_admin_key,
// private.account_key_ok and public._can_manage, all read from the repo's
// migrations (so no key is written here), with stand-ins only for what those
// read (Supabase's roles, the key table, public.turfs, public.turf_owners and
// the Firebase check), and checks: the file's rules (additive, none of the
// destructive keywords even inside a word or a comment, no backslash anywhere,
// search_path '', its header's md5s are the repo's latest bodies, nothing
// replaced, no table, no index, nothing written); the grants and the gate are
// admin_contact_outcomes' own (nobody signed in, a wrong token and any other
// signed-in person get {error: forbidden}; the site owner's two sign-ins get
// the answer); an empty table; each window's edges by India day; every one of
// the nine counts, the totals, the turfs and the taps, against a count worked
// out here; the top turfs' order and cap of 10, the wrong numbers' order and
// cap of 20, the hours' order and cap of 5; a turf switched off or gone still
// counted; then the list: its order, its limit and cap of 200, the closed-cards
// switch, the windows, exactly the named fields, and the asked slot (the latest
// ask of the same turf at or before the answer wins, one 12 h 6 min old is not
// matched, another turf's is never matched, another source gets none); and that
// both reads write nothing. Never touches a real database. Made-up turfs.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/contact_outcome_totals.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: contact_outcome_totals.check.mjs <supabase/migrations>");
const NAME = "20261127_contact_outcome_totals.sql";
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
assert.doesNotMatch(code, /\b(update|insert\s+into)\b/i, "writes nothing anywhere");
assert.doesNotMatch(code, /\b(create|alter)\s+(table|index|unique|policy|trigger|schema|type|view)\b|cron\.schedule/i, "no table, index, policy, trigger or job");
assert.doesNotMatch(code, /\bgrant\b[^;]*\bon\s+(?!function public\.admin_contact_outcome_(totals|list)\()/i, "the grants are on its own functions");
assert.match(code, /^\s*do \$\$\nbegin\n  if to_regprocedure\('public\._caller_key\(text\)'\) is null/m, "a guard first");
ok(code.indexOf("do $$") < code.indexOf("create or replace function"), "the guard runs before anything is made");
passed += 8;
const bodyOf = (fn) => {
  const from = NEW.indexOf("as $$", NEW.indexOf(`create or replace function public.${fn}(`)) + 5;
  return NEW.slice(from, NEW.indexOf("$$;", from));
};
const TOTALS = bodyOf("admin_contact_outcome_totals");
const LIST = bodyOf("admin_contact_outcome_list");
const MADE = [...NEW.matchAll(/create or replace function (\w+)\.(\w+)\(/gi)].map((m) => `${m[1]}.${m[2]}`);
eq(MADE, ["public.admin_contact_outcome_totals", "public.admin_contact_outcome_list"], "exactly two functions");
eq((code.match(/security definer/g) ?? []).length, 2, "each security definer");
eq((code.match(/set search_path = ''/g) ?? []).length, 2, "each with an empty search_path");
eq((code.match(/\bstable\b/g) ?? []).length, 2, "each stable");
const SIG = { totals: "admin_contact_outcome_totals(text)", list: "admin_contact_outcome_list(text, integer, integer, boolean)" };
for (const sig of Object.values(SIG)) {
  eq(code.split(`revoke all on function public.${sig} from public, anon, authenticated;`).length - 1, 1, `${sig}: revoked from public, anon and authenticated before its grant`);
  eq(code.split(`grant execute on function public.${sig} to anon, authenticated;`).length - 1, 1, `${sig}: granted as admin_contact_outcomes is`);
}
// The header, as one run of words (its line ends and comment marks taken out).
const HEAD = NEW.slice(0, NEW.indexOf("do $$")).replace(/\n--[ ]*/g, " ");
for (const w of ["Replaced: none.", "gated exactly as public.admin_contact_outcomes", "production was not read for this file", "The app works before this file", "Safe to run again.", "No table is altered", "no index is added", "It is a match by turf and time, not a stored link", "signed_in is not returned", "whatever became of its turf", "In admin can I see responses to the Did you get the slot popup?", "Yes build the totals card in admin please", "I want to see detailed for this", "Do we know which slot?", "nothing is written anywhere", "it refuses to run without them"])
  ok(HEAD.includes(w), `the header says: ${w}`);

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
const CALLED = ["public._caller_key", "public._is_admin_key"];
eq(HEADER.map((h) => h.fn), CALLED, "the header lists the two functions it calls");
for (const h of HEADER) {
  const def = repoDef(h.fn);
  eq(md5(def?.body ?? ""), h.md5, `${h.fn}: the header's md5 is the repo's latest body`);
  eq(def?.file, h.file, `${h.fn}: and the header names the file that has it`);
}
const callsIn = (sql) => [...new Set([...sql.replace(/^\s*--.*$/gm, "").matchAll(/\b(public|private)\.(\w+)\s*\(/g)].map((m) => `${m[1]}.${m[2]}`))].sort();
const readsIn = (sql) => [...new Set([...sql.replace(/^\s*--.*$/gm, "").matchAll(/\b(?:from|join)\s+(?:lateral\s+\(\s*select[^;]*?from\s+)?((?:public|private)\.\w+)/g)].map((m) => m[1]))].sort();
eq(callsIn(TOTALS), CALLED, "the totals call exactly those two");
eq(callsIn(LIST), CALLED, "the list calls exactly those two");
eq(readsIn(TOTALS), ["private.contact_outcomes", "public.turfs"], "the totals read the answers and public.turfs, nothing else");
eq(readsIn(LIST), ["private.contact_outcomes", "private.slot_asks", "public.turfs"], "the list reads the answers, public.turfs and the slot asks, nothing else");
for (const [n, b] of [["totals", TOTALS], ["list", LIST]]) {
  ok(!/signed_in|public\.users|usernames|\bemail\b|\bphone\b|user_id|user_key|ip_hash|anon_id|owner_phone/i.test(b), `the ${n} read nothing about a person, and no number`);
  ok(/^\ndeclare\n  k text := public\._caller_key\(p_token\);/.test(b), `the ${n}: the caller is worked out first`);
  ok(b.indexOf("return jsonb_build_object('error', 'forbidden');") < b.search(/\b(from|join)\s+(public|private)\./), `the ${n}: refused before anything is read`);
}
eq([...new Set([...(TOTALS + LIST).matchAll(/\bt\.(\w+)/g)].map((m) => m[1]))].filter((c) => c !== "id").sort(), ["city", "is_active", "name", "slug"], "of a turf: its id, name, city, slug and whether it is on");
eq(repoDef("public.admin_contact_outcome_totals"), null, "the totals are new: no earlier file has them");
eq(repoDef("public.admin_contact_outcome_list"), null, "the list is new: no earlier file has it");
// The gate and the 30-day window are admin_contact_outcomes' own expressions.
const flat = (s) => s.replace(/\s+/g, " ");
const OLD = flat(repoDef("public.admin_contact_outcomes").body);
const GATE = "if k is null or not coalesce(public._is_admin_key(k), false) then return jsonb_build_object('error', 'forbidden'); end if;";
ok(OLD.includes(GATE) && flat(TOTALS).includes(GATE) && flat(LIST).includes(GATE), "the gate is admin_contact_outcomes' own, word for word");
for (const w of ["v_today date := (now() at time zone 'Asia/Kolkata')::date", "v_since := v_today - (v_days - 1)", "v_t_since := v_since::timestamp at time zone 'Asia/Kolkata'"]) ok(OLD.includes(w) && flat(LIST).includes(w), `the list has admin_contact_outcomes': ${w}`);
for (const w of ["count(*) filter (where o.outcome = 'got_slot') as got_slot", "count(*) filter (where o.reason = 'full') as slot_full", "count(*) filter (where o.reason = 'price') as price", "count(*) filter (where o.reason = 'no_reply') as no_reply", "count(*) filter (where o.reason = 'wrong_number') as wrong_number", "count(*) filter (where o.reason = 'just_asking') as just_asking", "count(*) filter (where o.outcome = 'not_this_time' and o.reason is null) as no_reason", "count(*) filter (where o.outcome = 'deciding') as deciding", "count(*) filter (where o.outcome = 'dismissed') as dismissed"])
  ok(OLD.includes(w) && flat(TOTALS).split(w).length - 1 === 2, `the nine counts are admin_contact_outcomes' own: ${w.slice(w.lastIndexOf(" as ") + 4)}`);
// The files before it are left as they were reviewed.
for (const [file, fns] of [["20261113_contact_outcomes.sql", ["contact_outcome_add", "admin_contact_outcomes", "owner_report_said"]], ["20261118_slot_asks.sql", ["slot_ask_add", "admin_slot_asks", "owner_report_asks", "owner_slot_asks"]]]) {
  const txt = fs.readFileSync(`${M}/${file}`, "utf8");
  for (const f of fns) ok(!MADE.includes(`public.${f}`) && txt.includes(`function public.${f}(`), `${f} stays ${file}'s`);
}
// The site owner's two keys, as the real public._is_admin_key has them (not written here).
const ADMIN_KEYS = [...repoDef("public._is_admin_key").body.matchAll(/'([ep]:[^']+)'/g)].map((m) => m[1]);
eq(ADMIN_KEYS.length, 2, "the site owner's two sign-ins");

// ── The database before it: the real answers and slot asks, with stand-ins for what they read. ──
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const BASE = `
create role anon; create role authenticated;
create schema private;
grant usage on schema public to anon, authenticated;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', 'K' || repeat('7', 63));
create table public.turfs (id uuid primary key, name varchar, slug text, city text, area text, is_active boolean default true, owner_phone text, sports jsonb);
create table public.turf_owners (turf_id uuid not null, user_key text not null, user_id uuid, status text not null, primary key (turf_id, user_key));
-- Firebase can't be reached here: a "key:<caller key>" token stands for a verified sign-in (as contact_outcomes.check.mjs's stand-in).
create function public._caller_key(p_token text) returns text language sql stable as $$ select case when p_token like 'key:%' then substr(p_token, 5) end $$;
create function private.account_for_key(p_key text) returns uuid language sql stable as $$ select null::uuid $$;
`;
const OUTCOMES = fs.readFileSync(`${M}/20261113_contact_outcomes.sql`, "utf8");
const ASKS = fs.readFileSync(`${M}/20261118_slot_asks.sql`, "utf8");
await db.exec(BASE);
await db.exec(repoDef("public._is_admin_key").sql);
await db.exec(repoDef("public._can_manage").sql);
await db.exec(repoDef("private.account_key_ok").sql);

// Refuses to run without what it needs, changing nothing.
{
  const bare = new PGlite();
  await bare.exec(`create role anon; create role authenticated; create schema private;`);
  await assert.rejects(bare.exec(NEW), /contact_outcome_totals needs/, "without the earlier files it refuses");
  eq((await bare.query(`select count(*)::int as n from pg_proc where proname in ('admin_contact_outcome_totals', 'admin_contact_outcome_list')`)).rows[0].n, 0, "and leaves nothing behind");
  await bare.close();
}
await db.exec(`begin; ${OUTCOMES}; commit;`);
await assert.rejects(db.exec(`begin; ${NEW}; commit;`), /contact_outcome_totals needs/, "with the answers but without the slot asks it still refuses");
await db.exec(`rollback;`);
passed++;
eq((await one(`select count(*)::int as n from pg_proc where proname in ('admin_contact_outcome_totals', 'admin_contact_outcome_list')`)).n, 0, "and has made nothing");
await db.exec(`begin; ${ASKS}; commit;`);

const before = await q(`select n.nspname, p.proname, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') order by 1, 2`);
await db.exec(`begin; ${NEW}; commit;`);

const T = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const turf = (n, o = {}) =>
  q(`insert into public.turfs (id, name, slug, city, area, is_active, owner_phone) values ($1,$2,$3,$4,'Gachibowli',$5,'9000000001')`, [T(n), "name" in o ? o.name : `Turf ${String(n).padStart(3, "0")}`, "slug" in o ? o.slug : `turf-${n}`, "city" in o ? o.city : "Hyderabad", o.active ?? true]);
const day = async (n) => (await one(`select ((now() at time zone 'Asia/Kolkata')::date - $1::int)::text as d`, [n])).d;
const today = await day(0);
const admin = ADMIN_KEYS.map((k) => `key:${k}`);
const totals = async (...args) => (await one(`select public.admin_contact_outcome_totals(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args)).r;
const list = async (token, o = {}) => (await one(`select public.admin_contact_outcome_list($1, $2, $3, $4) as r`, [token, "days" in o ? o.days : 30, "limit" in o ? o.limit : 20, "dismissed" in o ? o.dismissed : false])).r;
/** One answer, straight into the table (the app's write is contact_outcome_add, checked in contact_outcomes.check.mjs). `ago`: India days back, at `plus` after that day's midnight; or `at`: an instant. */
const put = (o) =>
  q(
    `insert into private.contact_outcomes (turf_id, kind, source, outcome, reason, slot_date, slot_hour, created_at)
     values ($1, $2, $3, $4, $5, $6::date, $7, ${o.at ? "$8::timestamptz" : `(((now() at time zone 'Asia/Kolkata')::date - $8::int)::timestamp at time zone 'Asia/Kolkata') + interval '${o.plus ?? "1 hour"}'`}) returning id`,
    [o.turf ?? T(1), o.kind ?? "call", o.source ?? "turf_bar", o.outcome ?? "got_slot", o.reason ?? null, o.slotDate ?? null, o.slotHour ?? null, o.at ?? o.ago ?? 0],
  );
const clear = async () => { await db.exec(`delete from private.contact_outcomes; delete from private.slot_asks;`); };
const n = async () => (await one(`select (select count(*) from private.contact_outcomes)::int + (select count(*) from private.slot_asks)::int as n`)).n;

// ── 1. Grants and settings. ──
for (const role of ["anon", "authenticated"]) {
  for (const sig of Object.values(SIG)) ok((await one(`select has_function_privilege($1, 'public.${sig}', 'execute') as p`, [role])).p, `${role} may call ${sig} (the check inside decides)`);
  ok(!(await one(`select has_table_privilege($1, 'private.contact_outcomes', 'select,insert,update') as p`, [role])).p, `${role} still can't touch the answers`);
  ok(!(await one(`select has_table_privilege($1, 'private.slot_asks', 'select,insert,update') as p`, [role])).p, `${role} still can't touch the slot asks`);
}
for (const sig of Object.values(SIG)) ok(!(await one(`select has_function_privilege('public', 'public.${sig}', 'execute') as p`)).p, `public's default execute on ${sig} is revoked`);
const OLD_ACL = await one(`select proacl::text as a, prosecdef, provolatile, proconfig::text as c from pg_proc where proname = 'admin_contact_outcomes'`);
for (const f of ["admin_contact_outcome_totals", "admin_contact_outcome_list"])
  eq(await one(`select proacl::text as a, prosecdef, provolatile, proconfig::text as c from pg_proc where proname = $1`, [f]), OLD_ACL, `${f}: granted and set exactly as admin_contact_outcomes (security definer, stable, search_path '')`);

// ── 2. The gate. ──
await turf(1); await turf(2); await turf(3); await turf(4, { active: false }); await turf(5, { city: " Pune " });
await put({ outcome: "not_this_time", reason: "wrong_number" });
const STRANGERS = [null, "", "nonsense", "key:", "key:p:9111111111", "key:e:someone@example.com", "key:p:" + ADMIN_KEYS.find((k) => k.startsWith("p:")).slice(2) + "0", ADMIN_KEYS[0]];
for (const t of STRANGERS) {
  eq(await totals(t), { error: "forbidden" }, `the totals refuse ${t === null ? "nobody signed in" : `"${t.slice(0, 12)}"`}`);
  eq(await list(t), { error: "forbidden" }, `the list refuses ${t === null ? "nobody signed in" : `"${t.slice(0, 12)}"`}`);
}
eq(await totals(), { error: "forbidden" }, "no token at all is refused (the default)");
eq((await one(`select public.admin_contact_outcome_list() as r`)).r, { error: "forbidden" }, "and the list's defaults too");
// As the roles the app calls it with: the grant lets the call through, and only the site owner's token gets an answer.
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  eq(await totals(null), { error: "forbidden" }, `${role} with no token: forbidden`);
  eq(await totals("key:p:9111111111"), { error: "forbidden" }, `${role} signed in as someone else: forbidden`);
  eq((await list("key:e:someone@example.com")).error, "forbidden", `${role}, the list, someone else: forbidden`);
  eq((await totals(admin[0])).windows.all.total, 1, `${role} with the site owner's token: the totals`);
  eq((await list(admin[1])).n, 1, `${role} with the site owner's other token: the list`);
  await assert.rejects(db.query(`select count(*) from private.contact_outcomes`), /permission denied/, `${role} still can't read the table itself`);
  passed++;
  await db.exec(`reset role`);
}
eq(await totals(admin[0]), await totals(admin[1]), "the site owner's two sign-ins see the same");
await clear();

// ── 3. An empty table. ──
const ZERO = { total: 0, answered: 0, got_slot: 0, full: 0, price: 0, no_reply: 0, wrong_number: 0, just_asking: 0, no_reason: 0, deciding: 0, dismissed: 0, turfs: 0, turfs_answered: 0, call: 0, whatsapp: 0, slot_ask: 0, call_answered: 0, whatsapp_answered: 0, slot_ask_answered: 0 };
eq(await totals(admin[0]), {
  today,
  windows: { d7: { days: 7, since: await day(6), ...ZERO }, d30: { days: 30, since: await day(29), ...ZERO }, all: { days: null, since: null, ...ZERO } },
  top_turfs: [], wrong_numbers: [], wrong_number_turfs: 0, hours: [],
}, "no answers: every count 0, every list empty (never null), all time has no first day");
eq(await list(admin[0]), { days: 30, since: await day(29), today, limit: 20, dismissed: false, n: 0, rows: [] }, "no answers: an empty list");
eq(await list(admin[0], { days: 0, dismissed: true }), { days: 0, since: null, today, limit: 20, dismissed: true, n: 0, rows: [] }, "and for every answer kept");

// ── 4. The windows' edges, by India day. ──
// Seconds either side of each window's first midnight in India.
await put({ ago: 0, plus: "0 seconds" });
await put({ ago: 6, plus: "0 seconds" });
await put({ ago: 7, plus: "23 hours 59 minutes 59 seconds" });
await put({ ago: 29, plus: "0 seconds" });
await put({ ago: 30, plus: "23 hours 59 minutes 59 seconds" });
await put({ ago: 400, plus: "12 hours" });
{
  const r = await totals(admin[0]);
  eq([r.windows.d7.total, r.windows.d30.total, r.windows.all.total], [2, 4, 6], "7 days: today and day 6 in, the second before day 6 out; 30 days: day 29 in, the second before out; all time: everything");
  eq([r.windows.d7.since, r.windows.d30.since, r.windows.all.since], [await day(6), await day(29), await day(400)], "since: today less 6, today less 29, and the India day of the first answer");
  eq([r.windows.d7.days, r.windows.d30.days, r.windows.all.days], [7, 30, null], "days: 7, 30 and none");
  eq(r.today, (await one(`select public.admin_contact_outcomes($1) as r`, [admin[0]])).r.today, "today is admin_contact_outcomes' today");
  eq(r.windows.d30.since, (await one(`select public.admin_contact_outcomes($1) as r`, [admin[0]])).r.since, "and the 30 days are its 30 days");
  // An answer just after midnight in India is that India day's, though it is still the day before in UTC.
  eq((await one(`select (((now() at time zone 'Asia/Kolkata')::date - 6)::timestamp at time zone 'Asia/Kolkata')::text as t`)).t.slice(11, 19), "18:30:00", "India's midnight is 18:30 UTC the day before");
  for (const [days, want] of [[7, 2], [30, 4], [0, 6], [null, 4], [90, 4], [-1, 4], [1, 4]]) eq((await list(admin[0], { days })).n, want, `the list, days ${days}: ${want} answers`);
  eq([(await list(admin[0], { days: 7 })).since, (await list(admin[0], { days: 30 })).since, (await list(admin[0], { days: 0 })).since], [await day(6), await day(29), null], "the list's since: the same windows, none for every answer");
  eq([(await list(admin[0], { days: 7 })).days, (await list(admin[0], { days: 0 })).days, (await list(admin[0], { days: 12 })).days], [7, 0, 30], "the list's days: 7, 0, and 30 for anything else");
}
await clear();

// ── 5. Every count, against a count worked out here. ──
// Turfs 1 to 3 are on, 4 is switched off, 5 is another city's, 9 is gone from public.turfs: all are counted alike.
const OUT = [["got_slot", null], ["not_this_time", "full"], ["not_this_time", "price"], ["not_this_time", "no_reply"], ["not_this_time", "wrong_number"], ["not_this_time", "just_asking"], ["not_this_time", null], ["deciding", null], ["dismissed", null]];
const KEYS = ["got_slot", "full", "price", "no_reply", "wrong_number", "just_asking", "no_reason", "deciding", "dismissed"];
const AGES = [0, 3, 6, 7, 20, 29, 30, 45, 200];
const TURFS = [1, 2, 3, 4, 5, 9];
const SPEC = [];
AGES.forEach((ago, a) => OUT.forEach(([outcome, reason], j) => {
  for (let c = 0; c <= (a * 2 + j) % 3; c++) {
    const i = SPEC.length;
    const kind = i % 3 === 0 ? "call" : "whatsapp";
    SPEC.push({ ago, bucket: KEYS[j], outcome, reason, turf: T(TURFS[(i * 5 + a) % TURFS.length]), kind, source: kind === "call" ? (i % 2 ? "turf_bar" : "turf_sidebar") : i % 4 === 1 ? "slot_ask" : i % 4 === 2 ? "turf_slots" : "turf_bar" });
  }
}));
for (const s of SPEC) await put(s);
const expected = (maxAgo) => {
  const rows = SPEC.filter((s) => s.ago <= maxAgo);
  const ans = rows.filter((s) => s.outcome !== "dismissed");
  const c = (xs, f) => xs.filter(f).length;
  const w = { total: rows.length, answered: ans.length };
  for (const k of KEYS) w[k] = c(rows, (s) => s.bucket === k);
  return {
    ...w,
    turfs: new Set(rows.map((s) => s.turf)).size, turfs_answered: new Set(ans.map((s) => s.turf)).size,
    call: c(rows, (s) => s.kind === "call"), whatsapp: c(rows, (s) => s.kind === "whatsapp"), slot_ask: c(rows, (s) => s.source === "slot_ask"),
    call_answered: c(ans, (s) => s.kind === "call"), whatsapp_answered: c(ans, (s) => s.kind === "whatsapp"), slot_ask_answered: c(ans, (s) => s.source === "slot_ask"),
  };
};
const R = await totals(admin[0]);
eq(Object.keys(R).sort(), ["hours", "today", "top_turfs", "windows", "wrong_number_turfs", "wrong_numbers"], "the totals' keys, nothing else");
eq(Object.keys(R.windows).sort(), ["all", "d30", "d7"], "three windows");
for (const [key, maxAgo, days] of [["d7", 6, 7], ["d30", 29, 30], ["all", 9999, null]]) {
  const w = R.windows[key];
  eq(Object.keys(w).sort(), ["days", "since", ...Object.keys(ZERO)].sort(), `${key}: its 21 keys, nothing else`);
  const { days: d, since, ...counts } = w;
  eq(counts, expected(maxAgo), `${key}: every count is the count of the rows put in`);
  eq(d, days, `${key}: days`);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(since), `${key}: since is a date`);
  eq(KEYS.reduce((s, k) => s + w[k], 0), w.total, `${key}: the nine counts add up to the total (each row is in exactly one)`);
  eq(KEYS.filter((k) => k !== "dismissed").reduce((s, k) => s + w[k], 0), w.answered, `${key}: the first eight add up to answered; a closed card is not an answer`);
  eq(w.call + w.whatsapp, w.total, `${key}: Call and WhatsApp taps add up to the total`);
  eq(w.call_answered + w.whatsapp_answered, w.answered, `${key}: and to answered`);
  ok(KEYS.every((k) => w[k] > 0) && w.slot_ask > 0 && w.slot_ask_answered > 0 && w.slot_ask < w.whatsapp, `${key}: the fixture puts something in every count`);
}
ok(R.windows.d7.total < R.windows.d30.total && R.windows.d30.total < R.windows.all.total, "the three windows hold different rows");
eq(R.windows.all.turfs, 6, "a turf switched off, another city's and one gone from public.turfs are all counted");
// The Owner outreach rows count active turfs of one city only: fewer, and that read is unchanged.
const hyd = (await one(`select public.admin_contact_outcomes($1) as r`, [admin[0]])).r;
eq(hyd.turfs.map((t) => t.id), [T(1), T(2), T(3)], "admin_contact_outcomes still lists the city's active turfs");
eq(hyd.turfs.reduce((s, t) => s + KEYS.reduce((x, k) => x + t[k], 0), 0), SPEC.filter((s) => s.ago <= 29 && [T(1), T(2), T(3)].includes(s.turf)).length, "and counts what it counted");
ok(!/9000000001|Gachibowli|turf_bar|turf_sidebar|signed/.test(JSON.stringify(R)), "counts, turfs and hours only: no number, no area, no source name, nothing about a person");

// The real numbers of 26 Nov 2026, as one small case: 45 rows, 18 answers, 7 got a slot.
await clear();
for (const [count, o] of [[27, { outcome: "dismissed" }], [7, { outcome: "got_slot", kind: "whatsapp", source: "slot_ask" }], [6, { outcome: "deciding" }], [2, { outcome: "not_this_time", reason: "full" }], [1, { outcome: "not_this_time", reason: "just_asking" }], [1, { outcome: "not_this_time", reason: "no_reply" }], [1, { outcome: "not_this_time" }]])
  for (let i = 0; i < count; i++) await put({ ...o, ago: i % 9, turf: T(100 + ((i * 7 + count) % 40)) });
{
  const a = (await totals(admin[0])).windows.all;
  eq([a.total, a.answered, a.got_slot, a.deciding, a.full, a.just_asking, a.no_reply, a.no_reason, a.dismissed, a.price, a.wrong_number], [45, 18, 7, 6, 2, 1, 1, 1, 27, 0, 0], "45 rows: 18 answered, 7 got a slot, 27 closed the card; zeros stay 0");
  eq([a.slot_ask, a.slot_ask_answered, a.whatsapp, a.call], [7, 7, 7, 38], "7 through Ask for a slot, all WhatsApp");
  eq((await totals(admin[0])).top_turfs.every((t) => t.name === null && t.slug === null && t.city === null && t.active === false), true, "turfs that are not in public.turfs: listed by id, no name, not active");
}
await clear();

// ── 6. The turfs with the most answers: 30 days, the order, 10 at most. ──
// One turf, closed cards only: it is counted, and it is in no list of answers.
for (let i = 0; i < 3; i++) await put({ outcome: "dismissed", ago: i });
{
  const r = await totals(admin[0]);
  eq([r.top_turfs, r.windows.all.total, r.windows.all.answered, r.windows.all.turfs, r.windows.all.turfs_answered], [[], 3, 0, 1, 0], "a turf with only closed cards: no turf with answers, though its rows are counted");
}
await clear();
// name, answered (got a slot among them), closed cards
const TOP = [
  [11, "Zeta Arena", 5, 1, 0], [12, "alpha Turf", 5, 3, 2], [13, "Beta Turf", 5, 3, 0], [14, "Alpha turf", 5, 3, 0], [15, "Gamma", 9, 0, 0], [16, "Delta", 4, 4, 0],
  [17, "Epsilon", 3, 0, 9], [18, "Eta", 2, 2, 0], [19, "Theta", 2, 1, 0], [20, "Iota", 1, 1, 0], [21, "Kappa", 1, 0, 0], [22, "Lambda", 1, 0, 0], [23, "Only closed", 0, 0, 12],
];
for (const [id, name, answered, got, closed] of TOP) {
  await turf(id, { name, city: id === 15 ? "  PUNE " : "Hyderabad", active: id !== 16, slug: id === 18 ? " " : `turf-${id}` });
  for (let i = 0; i < got; i++) await put({ turf: T(id), ago: i % 30 });
  for (let i = 0; i < answered - got; i++) await put({ turf: T(id), ago: i % 30, outcome: i % 2 ? "deciding" : "not_this_time", reason: i % 2 ? null : ["full", "price", "no_reply", "just_asking"][i % 4] });
  for (let i = 0; i < closed; i++) await put({ turf: T(id), ago: i % 30, outcome: "dismissed" });
}
// Older than the 30 days: not counted here, however many.
for (let i = 0; i < 20; i++) await put({ turf: T(21), ago: 30 + i });
// A turf gone from public.turfs, with 6 answers: listed, with no name.
for (let i = 0; i < 6; i++) await put({ turf: T(99), outcome: "deciding", ago: i });
{
  const r = await totals(admin[0]);
  eq(r.top_turfs.length, 10, "10 turfs at most");
  eq(r.top_turfs.map((t) => [t.id, t.answered, t.got_slot]), [
    [T(15), 9, 0], [T(99), 6, 0], [T(12), 5, 3], [T(14), 5, 3], [T(13), 5, 3], [T(11), 5, 1], [T(16), 4, 4], [T(17), 3, 0], [T(18), 2, 2], [T(19), 2, 1],
  ], "most answers first, then most got a slot, then by name whatever its capitals (alpha Turf, Alpha turf by id, Beta Turf), then by id; closed cards never count");
  ok(!r.top_turfs.some((t) => t.id === T(23)), "a turf with only closed cards is not listed");
  eq(Object.keys(r.top_turfs[0]).sort(), ["active", "answered", "city", "deciding", "dismissed", "full", "got_slot", "id", "just_asking", "name", "no_reason", "no_reply", "price", "slug", "wrong_number"], "a turf's 15 keys, nothing else");
  const by = (id) => r.top_turfs.find((t) => t.id === T(id));
  eq([by(15).name, by(15).city, by(15).slug, by(15).active], ["Gamma", "pune", "turf-15", true], "its name, its city lower case and trimmed, its slug");
  eq([by(16).name, by(16).active], ["Delta", false], "a turf switched off is listed as not active");
  eq([by(99).name, by(99).city, by(99).slug, by(99).active], [null, null, null, false], "a turf gone from public.turfs: no name, no city, no slug, not active");
  eq(by(18).slug, null, "an empty slug is none");
  eq([by(12).dismissed, by(17).dismissed], [2, 9], "closed cards are counted beside, never in answered");
  for (const t of r.top_turfs) eq(KEYS.filter((k) => k !== "dismissed").reduce((s, k) => s + t[k], 0), t.answered, `${t.name ?? "the gone turf"}: its counts add up to its answered`);
  eq(r.windows.all.turfs, TOP.length + 1, "every turf with a row is in the windows' count of turfs");
  eq(r.windows.d30.turfs_answered, 13, "and those with an answer in the 30 days");
}
await clear();

// ── 7. Wrong numbers: 30 days, every turf, the order, 20 at most. ──
for (let i = 1; i <= 22; i++) await turf(200 + i, { name: `Wrong ${String(i).padStart(2, "0")}`, active: i !== 3 });
for (let i = 1; i <= 22; i++) await put({ turf: T(200 + i), outcome: "not_this_time", reason: "wrong_number", ago: 10 });
// Turf 205: three reports; 207: two, the latest today; 209: two, the latest 5 days ago; 222's only report is older than the 30 days.
await put({ turf: T(205), outcome: "not_this_time", reason: "wrong_number", ago: 2 }); await put({ turf: T(205), outcome: "not_this_time", reason: "wrong_number", ago: 20 });
await put({ turf: T(207), outcome: "not_this_time", reason: "wrong_number", ago: 0 });
await put({ turf: T(209), outcome: "not_this_time", reason: "wrong_number", ago: 5 });
await db.exec(`update private.contact_outcomes set created_at = created_at - interval '40 days' where turf_id = '${T(222)}'`);
await put({ turf: T(98), outcome: "not_this_time", reason: "wrong_number", ago: 1 });
// Other answers about the same turfs don't make a wrong number.
await put({ turf: T(301), outcome: "not_this_time", reason: "no_reply" }); await put({ turf: T(205), outcome: "got_slot" }); await put({ turf: T(205), outcome: "dismissed" });
{
  const r = await totals(admin[0]);
  eq(r.wrong_numbers.length, 20, "20 turfs at most");
  eq(r.wrong_number_turfs, 22, "and how many there are in all: 21 of the 22 in the window, and one that is gone");
  eq(r.wrong_numbers.slice(0, 5).map((t) => [t.id, t.wrong_number, t.last]), [[T(205), 3, await day(2)], [T(207), 2, today], [T(209), 2, await day(5)], [T(98), 1, await day(1)], [T(201), 1, await day(10)]], "most reports first, then the latest report first, then by name; each with the India day of its latest report");
  eq(r.wrong_numbers.slice(4).map((t) => t.name), [1, 2, 3, 4, 6, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((i) => `Wrong ${String(i).padStart(2, "0")}`), "then by name");
  ok(!r.wrong_numbers.some((t) => t.id === T(222)), "a report older than the 30 days is not listed");
  eq(Object.keys(r.wrong_numbers[0]).sort(), ["active", "city", "id", "last", "name", "slug", "wrong_number"], "a wrong number's 7 keys, nothing else");
  eq(r.wrong_numbers.find((t) => t.id === T(203)).active, false, "a turf switched off is listed as not active");
  eq([r.wrong_numbers[3].name, r.wrong_numbers[3].active], [null, false], "a turf that is gone: no name");
  eq([r.windows.d30.wrong_number, r.windows.all.wrong_number], [26, 27], "the windows count reports, not turfs");
}
await clear();

// ── 8. The hours players said they got: 30 days, got a slot only, 5 at most. ──
const hourRows = [[19, 4], [20, 4], [7, 3], [21, 2], [0, 2], [6, 1], [22, 1]];
for (const [h, c] of hourRows) for (let i = 0; i < c; i++) await put({ slotDate: today, slotHour: h, ago: i });
await put({ slotDate: today, ago: 1 });
await put({ ago: 1 });
for (let i = 0; i < 9; i++) await put({ outcome: "not_this_time", reason: "full", slotDate: today, slotHour: 23, ago: 1 });
for (let i = 0; i < 9; i++) await put({ slotDate: await day(40), slotHour: 5, ago: 40 });
{
  const r = await totals(admin[0]);
  eq(r.hours, [{ hour: 19, n: 4 }, { hour: 20, n: 4 }, { hour: 7, n: 3 }, { hour: 0, n: 2 }, { hour: 21, n: 2 }], "five hours at most: most named first, a tie to the earlier hour; a full slot's hour, an answer with no hour and one older than 30 days are not in it");
}
await clear();

// ── 9. The list: newest first, its fields, the closed-cards switch. ──
const iso = (ms) => new Date(ms).toISOString().replace(/[.]\d{3}Z$/, "Z");
// A fixed instant two days back, to the second: every time below is counted from it.
const B = Math.floor(Date.now() / 1000) * 1000 - 2 * 86_400_000;
const MIN = 60_000;
const ask = (o) =>
  q(`insert into private.slot_asks (turf_id, slot_date, slot_hour, slot_minute, minutes, sport, players, created_at) values ($1, $2::date, $3, $4, $5, $6, $7, $8::timestamptz) returning id`,
    [o.turf ?? T(1), o.date ?? "2026-11-28", o.hour ?? 15, o.minute ?? 0, o.minutes ?? 120, "sport" in o ? o.sport : "football", o.players ?? null, iso(o.at)]);
const a1 = (await put({ at: iso(B), kind: "whatsapp", source: "slot_ask", turf: T(1) }))[0].id;
const a2 = (await put({ at: iso(B - 5 * MIN), outcome: "not_this_time", reason: "full", slotDate: "2026-11-25", slotHour: 21, turf: T(2) }))[0].id;
const a3 = (await put({ at: iso(B - 5 * MIN), outcome: "deciding", turf: T(4) }))[0].id;
const a4 = (await put({ at: iso(B - 9 * MIN), outcome: "dismissed", turf: T(1) }))[0].id;
const a5 = (await put({ at: iso(B - 20 * MIN), outcome: "not_this_time", turf: T(99), kind: "whatsapp", source: "turf_slots" }))[0].id;
{
  const l = await list(admin[0]);
  eq(Object.keys(l).sort(), ["days", "dismissed", "limit", "n", "rows", "since", "today"], "the list's keys, nothing else");
  eq([l.days, l.limit, l.dismissed, l.n, l.today, l.since], [30, 20, false, 4, today, await day(29)], "30 days, 20 rows, no closed cards, by default");
  eq(l.rows.map((r) => r.id), [a1, a3, a2, a5], "newest first; two at the same instant, the one added last first; a closed card is not a row");
  eq(Object.keys(l.rows[0]).sort(), ["active", "ask", "at", "city", "id", "kind", "name", "outcome", "reason", "slot_date", "slot_hour", "slug", "source", "turf"], "a row's 14 keys, nothing else (no signed_in)");
  eq(l.rows[0], { id: a1, at: iso(B), turf: T(1), name: "Turf 001", city: "hyderabad", slug: "turf-1", active: true, kind: "whatsapp", source: "slot_ask", outcome: "got_slot", reason: null, slot_date: null, slot_hour: null, ask: null }, "a row: when in UTC to the second, the turf, the tap, the answer; no ask when none was made");
  eq(l.rows[2], { id: a2, at: iso(B - 5 * MIN), turf: T(2), name: "Turf 002", city: "hyderabad", slug: "turf-2", active: true, kind: "call", source: "turf_bar", outcome: "not_this_time", reason: "full", slot_date: "2026-11-25", slot_hour: 21, ask: null }, "the slot the answer itself names");
  eq([l.rows[1].name, l.rows[1].active], ["Turf 004", false], "a turf switched off still has its row, named, not active");
  eq((await list(admin[0], { limit: 2 })).rows.map((r) => r.id), [a1, a3], "a short list is cut in the same order: of two at one instant, the one added last is kept");
  eq([l.rows[3].name, l.rows[3].city, l.rows[3].slug, l.rows[3].active, l.rows[3].turf], [null, null, null, false, T(99)], "a turf that is gone still has its row: no name, no city, no slug");
  const all = await list(admin[0], { dismissed: true });
  eq([all.dismissed, all.n, all.rows.map((r) => r.id)], [true, 5, [a1, a3, a2, a4, a5]], "with the switch the closed card is a row too, in its place");
  eq(all.rows[3].outcome, "dismissed", "as dismissed");
  eq((await list(admin[0], { dismissed: null })).n, 4, "no switch is off");
  ok(!/9000000001|Gachibowli|signed/.test(JSON.stringify(all)), "nothing about a person, no number, no area");
}

// ── 10. The asked slot: the latest ask of the same turf at or before the answer, within 12 hours 5 minutes. ──
const askOf = async (id) => (await list(admin[0], { dismissed: true, limit: 200, days: 0 })).rows.find((r) => r.id === id).ask;
eq(await askOf(a1), null, "no ask at that turf: none");
await ask({ at: B - (12 * 60 + 6) * MIN, hour: 6 });
eq(await askOf(a1), null, "an ask 12 h 6 min before the answer is not matched");
await ask({ at: B - (12 * 60 + 5) * MIN - 1000, hour: 6 });
eq(await askOf(a1), null, "nor one a second over 12 h 5 min");
await ask({ at: B - (12 * 60 + 5) * MIN, date: "2026-11-27", hour: 7, minute: 30, minutes: 90, sport: null });
eq(await askOf(a1), { date: "2026-11-27", hour: 7, minute: 30, minutes: 90, sport: null, players: null, at: iso(B - (12 * 60 + 5) * MIN) }, "one exactly 12 h 5 min before is: its date, start, length, and when it was asked");
await ask({ at: B - 10 * MIN, hour: 13, minutes: 180, sport: "box cricket", players: 8, date: "2026-11-24" });
await ask({ at: B - MIN, hour: 15, minutes: 120, sport: "football", date: "2026-11-28" });
eq(await askOf(a1), { date: "2026-11-28", hour: 15, minute: 0, minutes: 120, sport: "football", players: null, at: iso(B - MIN) }, "the latest ask before the answer wins");
await ask({ at: B + 1000, hour: 22 });
eq((await askOf(a1)).hour, 15, "an ask made after the answer is never its ask");
await ask({ at: B, hour: 16, players: 16 });
eq([(await askOf(a1)).hour, (await askOf(a1)).players], [16, 16], "one made at the same instant is");
await ask({ turf: T(2), at: B - 30_000, hour: 9 });
eq((await askOf(a1)).hour, 16, "another turf's ask is never matched");
await ask({ turf: T(2), at: B - 6 * MIN, hour: 10 });
await ask({ turf: T(99), at: B - 21 * MIN, hour: 11 });
eq(await askOf(a2), null, "an answer from another tap (a Call from the page's bar) gets none, though its turf was asked a slot a minute before it");
eq(await askOf(a5), null, "nor a Free slots tap, a minute after an ask at its turf");
const a7 = (await put({ at: iso(B - 4 * MIN), outcome: "deciding", kind: "whatsapp", source: "slot_ask", turf: T(2) }))[0].id;
eq((await askOf(a7)).hour, 10, "while an Ask for a slot answer at that turf has it");
// A source of slot_ask is what decides, not the kind; a closed card after an ask has its ask too.
const a6 = (await put({ at: iso(B - 8 * MIN), outcome: "dismissed", kind: "whatsapp", source: "slot_ask", turf: T(1) }))[0].id;
eq((await askOf(a6)).hour, 13, "each row has the latest ask before it: an earlier answer, an earlier ask");
// Five asks in seven minutes at one turf, two answers: each row shows only the latest ask before it.
await turf(40, { name: "Dream Sports Fields - Inorbit Malad - Football & Cricket Turf", city: "Mumbai" });
for (const [m, h] of [[7, 13], [6, 14], [4, 13], [2, 15], [1, 13]]) await ask({ turf: T(40), at: B - 100 * MIN - m * MIN, date: "2026-11-24", hour: h, minutes: 180, sport: "box cricket", players: 8 });
const b1 = (await put({ at: iso(B - 100 * MIN - 3 * MIN), kind: "whatsapp", source: "slot_ask", turf: T(40), slotDate: "2026-11-24", slotHour: 13 }))[0].id;
const b2 = (await put({ at: iso(B - 100 * MIN), kind: "whatsapp", source: "slot_ask", turf: T(40) }))[0].id;
eq([(await askOf(b1)).at, (await askOf(b1)).hour], [iso(B - 104 * MIN), 13], "the first answer: the ask 1 minute before it, not the later ones");
eq([(await askOf(b2)).at, (await askOf(b2)).hour, (await askOf(b2)).players], [iso(B - 101 * MIN), 13, 8], "the second answer: the last ask");
eq(Object.keys(await askOf(b2)).sort(), ["at", "date", "hour", "minute", "minutes", "players", "sport"], "an ask's 7 keys, nothing else (no signed_in)");
await clear();

// ── 11. The list's limit: 1 to 200, 20 when none. ──
await db.exec(`insert into private.contact_outcomes (turf_id, kind, source, outcome, created_at) select '${T(1)}', 'call', 'turf_bar', case when g % 5 = 0 then 'dismissed' else 'deciding' end, now() - make_interval(mins => g) from generate_series(1, 260) g`);
for (const [limit, want] of [[20, 20], [null, 20], [1, 1], [0, 1], [-7, 1], [40, 40], [199, 199], [200, 200], [201, 200], [100000, 200]]) {
  const l = await list(admin[0], { limit, dismissed: true });
  eq([l.limit, l.rows.length, l.n], [want, want, 260], `limit ${limit}: ${want} rows of the 260`);
}
{
  const l = await list(admin[0], { limit: 60 });
  eq([l.rows.length, l.n], [60, 208], "without closed cards: n counts only what the list would show");
  ok(l.rows.every((r) => r.outcome === "deciding"), "and no closed card is in it");
  const ids = l.rows.map((r) => r.id);
  const ats = l.rows.map((r) => r.at);
  eq(ats, [...ats].sort().reverse(), "newest first all the way down");
  eq(new Set(ats).size, 60, "each at its own minute");
  eq((await list(admin[0], { limit: 40 })).rows.map((r) => r.id), ids.slice(0, 40), "a longer list starts with the shorter one: Show more adds below");
}

// ── 12. Reading writes nothing; safe to run again. ──
const c1 = await n();
const snap = await q(`select * from private.contact_outcomes order by id`);
await totals(admin[0]); await list(admin[0]); await list(admin[0], { days: 0, limit: 200, dismissed: true }); await totals(null); await list("key:p:9111111111");
eq(await n(), c1, "reads change no row count");
eq(await q(`select * from private.contact_outcomes order by id`), snap, "and no row");
const t1 = await totals(admin[0]);
await db.exec(`begin; ${NEW}; commit;`);
eq(await n(), c1, "run again: the answers stay");
eq(await totals(admin[0]), t1, "and read the same");
eq((await one(`select count(*)::int as n from pg_proc where proname in ('admin_contact_outcome_totals', 'admin_contact_outcome_list')`)).n, 2, "no overload after running it twice");
eq((await one(`select count(*)::int as n from pg_indexes where schemaname = 'private' and tablename in ('contact_outcomes', 'slot_asks')`)).n, 6, "no index was added: each table's primary key and its two");
const others = await q(`select n.nspname, p.proname, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.proname not in ('admin_contact_outcome_totals', 'admin_contact_outcome_list') order by 1, 2`);
eq(others, before, "every function from before is as it was");
eq((await q(`select table_schema || '.' || table_name as t from information_schema.tables where table_schema in ('public', 'private') order by 1`)).map((r) => r.t), ["private.app_secrets", "private.contact_outcomes", "private.slot_asks", "public.turf_owners", "public.turfs"], "no table was made");
console.log(`body md5: totals ${md5(TOTALS)}, list ${md5(LIST)}`);

console.log(`contact_outcome_totals: ${passed} checks passed`);
