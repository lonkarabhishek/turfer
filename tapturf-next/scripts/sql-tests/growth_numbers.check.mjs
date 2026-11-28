// Applies 20261130_growth_numbers.sql (twice) to an in-memory Postgres (PGlite)
// on top of the real 20260930_turf_contact_clicks.sql and
// 20261113_contact_outcomes.sql, the real tables of private.booking_requests,
// private.tool_use_log and private.game_series (their create statements, read
// from the repo's migrations), and the real public._is_admin_key,
// private.booking_state, private.account_key_ok and public._can_manage (so no
// key is written here), with stand-ins only for what those read (Supabase's
// roles, the key table, public.turfs, public.users, public.games,
// public.game_participants, public.reviews, public.turf_owners and the Firebase
// check), and checks: the file's rules (additive, none of the destructive
// keywords even inside a word or a comment, no backslash anywhere, no long
// dashes, search_path '', a guard that names each function's arguments, its
// header's md5s are the repo's latest bodies, nothing replaced, no table, no
// index, nothing written); that it refuses to run without a table, a column or
// a zoned time it reads; the grants and the gate are
// admin_contact_outcome_totals' own; empty tables; then each number against
// hand-built rows: a signed-out tap is no contact, two taps at one turf are one
// contact, an account the browser made up is nobody, India-day edges at 23:59
// and 00:01, someone active on 2 days by two different actions, a repeat's
// job-made games and a host's own lineup row are nobody's action, a confirmed
// request counts and a waiting, declined, expired or cancelled one does not,
// the top turfs' order and cap; the slots read's rows, price columns and cap;
// that nothing personal is in either answer; and that both reads write nothing.
// Never touches a real database. Made-up turfs and accounts.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/growth_numbers.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: growth_numbers.check.mjs <supabase/migrations>");
const NAME = "20261130_growth_numbers.sql";
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
assert.doesNotMatch(code, /\bgrant\b[^;]*\bon\s+(?!function public\.admin_growth(_slots)?\()/i, "the grants are on its own functions");
assert.match(code, /^\s*do \$\$\nbegin\n  if to_regprocedure\('public\._caller_key\(text\)'\) is null/m, "a guard first");
assert.doesNotMatch(NEW, /to_regproc\s*\(/, "a function is looked for by its arguments (to_regprocedure), never by a bare name");
ok(code.indexOf("do $$") < code.indexOf("create or replace function"), "the guard runs before anything is made");
ok(NEW.indexOf("set local lock_timeout") < NEW.indexOf("--") && NEW.indexOf("--") < NEW.indexOf("do $$"), "the lock timeout, then the header, then the guard");
passed += 9;
const bodyOf = (fn) => {
  const from = NEW.indexOf("as $$", NEW.indexOf(`create or replace function public.${fn}(`)) + 5;
  return NEW.slice(from, NEW.indexOf("$$;", from));
};
const GROWTH = bodyOf("admin_growth");
const SLOTS = bodyOf("admin_growth_slots");
const MADE = [...NEW.matchAll(/create or replace function (\w+)\.(\w+)\(/gi)].map((m) => `${m[1]}.${m[2]}`);
eq(MADE, ["public.admin_growth", "public.admin_growth_slots"], "exactly two functions");
eq((code.match(/security definer/g) ?? []).length, 2, "each security definer");
eq((code.match(/set search_path = ''/g) ?? []).length, 2, "each with an empty search_path");
eq((code.match(/\bstable\b/g) ?? []).length, 2, "each stable");
const SIG = { growth: "admin_growth(text)", slots: "admin_growth_slots(text)" };
for (const sig of Object.values(SIG)) {
  eq(code.split(`revoke all on function public.${sig} from public, anon, authenticated;`).length - 1, 1, `${sig}: revoked from public, anon and authenticated before its grant`);
  eq(code.split(`grant execute on function public.${sig} to anon, authenticated;`).length - 1, 1, `${sig}: granted as admin_contact_outcome_totals is`);
}
// The header, as one run of words (its line ends and comment marks taken out).
const HEAD = NEW.slice(0, NEW.indexOf("do $$")).replace(/\n--[ ]*/g, " ");
for (const w of [
  "start tracking unique turf contacts, repeat users, completed bookings and revenue. Your current visit tracking explicitly counts returning arrivals as new visits, so visits should not be confused with unique users.",
  "Nothing new is collected for this.",
  "gated exactly as public.admin_contact_outcome_totals",
  "Replaced: none.",
  "production was not read for this file",
  "No table is altered, nothing is written anywhere, and no index is added.",
  "each function is one statement. It reads each table whole (the all-time window needs every row), once or twice",
  "The app works before this file",
  "Safe to run again.",
  "it refuses to run without them",
  "Never returned by either: an account id, a name, a number, an email",
  "TapTurf takes no payment, so there is no revenue to read",
  "this file has no copy of that rule",
  "the server does not check it",
  "it reached no turf and is no contact",
])
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
/** A table as the repo's migration makes it: its create statement, nothing else of the file. */
const tableSql = (file, table) => {
  const txt = fs.readFileSync(`${M}/${file}`, "utf8");
  const from = txt.indexOf(`create table if not exists ${table} (`);
  assert.ok(from >= 0, `${file} makes ${table}`);
  return txt.slice(from, txt.indexOf("\n);", from) + 3);
};
const CALLED = ["public._caller_key", "public._is_admin_key", "private.booking_state"];
eq(HEADER.map((h) => h.fn), CALLED, "the header lists the three functions it calls");
for (const h of HEADER) {
  const def = repoDef(h.fn);
  eq(md5(def?.body ?? ""), h.md5, `${h.fn}: the header's md5 is the repo's latest body`);
  eq(def?.file, h.file, `${h.fn}: and the header names the file that has it`);
}
const callsIn = (sql) => [...new Set([...sql.replace(/^\s*--.*$/gm, "").matchAll(/\b(public|private)\.(\w+)\s*\(/g)].map((m) => `${m[1]}.${m[2]}`))].sort();
const readsIn = (sql) => [...new Set([...sql.replace(/^\s*--.*$/gm, "").matchAll(/\b(?:from|join)\s+((?:public|private)\.\w+)/g)].map((m) => m[1]))].sort();
eq(callsIn(GROWTH), [...CALLED].sort(), "the numbers call exactly those three");
eq(callsIn(SLOTS), [...CALLED].sort(), "the slots call exactly those three");
eq(readsIn(GROWTH), ["private.booking_requests", "private.contact_outcomes", "private.game_series", "private.tool_use_log", "public.game_participants", "public.games", "public.reviews", "public.turf_contact_clicks", "public.turfs", "public.users"], "the numbers read these ten tables, nothing else");
eq(readsIn(SLOTS), ["private.booking_requests", "private.contact_outcomes", "public.turfs"], "the slots read the confirmed requests, the answers and public.turfs, nothing else");
for (const [n, b] of [["numbers", GROWTH], ["slots", SLOTS]]) {
  ok(!/player_name|player_phone|\bnote\b|\breason\b|\bemail\b|\bphone\b|usernames|profile_image|owner_phone|host_phone|user_key|ip_hash|\bdevice\b/i.test(b), `the ${n} read no name, number, note or email`);
  ok(/^\ndeclare\n  k text := public\._caller_key\(p_token\);/.test(b), `the ${n}: the caller is worked out first`);
  ok(b.indexOf("return jsonb_build_object('error', 'forbidden');") < b.search(/\b(from|join)\s+(public|private)\./), `the ${n}: refused before anything is read`);
  ok(!/'(who|user|user_id|account|creator|host)'\s*,/.test(b), `the ${n}: no account is a key of the answer`);
}
eq([...new Set([...GROWTH.matchAll(/\bu\.(\w+)/g)].map((m) => m[1]))], ["id"], "of an account: only that it is there (public.users.id)");
ok(!/public\.users/.test(SLOTS), "the slots read no account at all");
eq(repoDef("public.admin_growth"), null, "admin_growth is new: no earlier file has it");
eq(repoDef("public.admin_growth_slots"), null, "admin_growth_slots is new: no earlier file has it");
// The gate and the India day are admin_contact_outcome_totals' own expressions.
const flat = (s) => s.replace(/\s+/g, " ");
const OLD = flat(repoDef("public.admin_contact_outcome_totals").body);
const GATE = "if k is null or not coalesce(public._is_admin_key(k), false) then return jsonb_build_object('error', 'forbidden'); end if;";
ok(OLD.includes(GATE) && flat(GROWTH).includes(GATE) && flat(SLOTS).includes(GATE), "the gate is admin_contact_outcome_totals' own, word for word");
for (const w of ["v_today date := (now() at time zone 'Asia/Kolkata')::date", "v_since7 := v_today - 6", "v_since30 := v_today - 29"]) ok(OLD.includes(w) && flat(GROWTH).includes(w), `the windows are admin_contact_outcome_totals': ${w}`);
// The site owner's two keys, as the real public._is_admin_key has them (not written here).
const ADMIN_KEYS = [...repoDef("public._is_admin_key").body.matchAll(/'([ep]:[^']+)'/g)].map((m) => m[1]);
eq(ADMIN_KEYS.length, 2, "the site owner's two sign-ins");

// ── The database before it: the real taps, answers and tables, with stand-ins for what they read. ──
const ROLES = `create role anon; create role authenticated; create schema private; grant usage on schema public to anon, authenticated;`;
const TURFS = `create table public.turfs (id uuid primary key, name varchar, slug text, city text, area text, is_active boolean default true, owner_phone text, sports jsonb,
  morning_price numeric, afternoon_price numeric, evening_price numeric, weekend_morning_price numeric, weekend_afternoon_price numeric, weekend_evening_price numeric,
  pricing_bands jsonb, price_unit text, slot_minutes integer, price_owner_confirmed boolean);`;
const STANDINS = `
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', 'K' || repeat('7', 63));
create table public.turf_owners (turf_id uuid not null, user_key text not null, user_id uuid, status text not null, primary key (turf_id, user_key));
create table public.users (id uuid primary key, name text, email text, phone text);
create table public.games (id uuid primary key default gen_random_uuid(), creator_id uuid, series_id uuid, host_name text, created_at timestamptz default now());
create table public.game_participants (game_id uuid not null, user_id uuid not null, joined_at timestamptz default now(), primary key (game_id, user_id));
create table public.reviews (id uuid primary key default gen_random_uuid(), user_id uuid, turf_id uuid, source text, status text default 'live', comment text, created_at timestamptz default now());
-- Firebase can't be reached here: a "key:<caller key>" token stands for a verified sign-in (as contact_outcome_totals.check.mjs's stand-in).
create function public._caller_key(p_token text) returns text language sql stable as $$ select case when p_token like 'key:%' then substr(p_token, 5) end $$;
create function private.account_for_key(p_key text) returns uuid language sql stable as $$ select null::uuid $$;
`;
const TAPS = fs.readFileSync(`${M}/20260930_turf_contact_clicks.sql`, "utf8");
const OUTCOMES = fs.readFileSync(`${M}/20261113_contact_outcomes.sql`, "utf8");
const REAL_TABLES = [
  tableSql("20261027_tool_users.sql", "private.tool_use_log"),
  tableSql("20261102_game_series.sql", "private.game_series"),
  tableSql("20261106_booking_requests.sql", "private.booking_requests"),
];
const build = async (o = {}) => {
  const d = new PGlite();
  await d.exec(ROLES);
  await d.exec(o.turfs ?? TURFS);
  await d.exec(STANDINS);
  await d.exec(repoDef("public._is_admin_key").sql);
  await d.exec(repoDef("public._can_manage").sql);
  await d.exec(repoDef("private.account_key_ok").sql);
  await d.exec(repoDef("private.booking_state").sql);
  await d.exec(`begin; ${TAPS}; commit;`);
  await d.exec(`begin; ${OUTCOMES}; commit;`);
  for (const t of o.tables ?? REAL_TABLES) await d.exec(t);
  return d;
};
const made = async (d) => (await d.query(`select count(*)::int as n from pg_proc where proname in ('admin_growth', 'admin_growth_slots')`)).rows[0].n;

// Refuses to run without what it needs, changing nothing.
{
  const bare = new PGlite();
  await bare.exec(ROLES);
  await assert.rejects(bare.exec(NEW), /growth_numbers needs/, "without the earlier files it refuses");
  eq(await made(bare), 0, "and leaves nothing behind");
  await bare.close();
  // Everything but the booking requests.
  const noBookings = await build({ tables: REAL_TABLES.slice(0, 2) });
  await assert.rejects(noBookings.exec(`begin; ${NEW}; commit;`), /growth_numbers needs/, "without the booking requests it refuses");
  await noBookings.exec(`rollback;`);
  eq(await made(noBookings), 0, "and has made nothing");
  await noBookings.close();
  // A turfs table without the listed price bands.
  const noBands = await build({ turfs: TURFS.replace("pricing_bands jsonb, ", "") });
  await assert.rejects(noBands.exec(`begin; ${NEW}; commit;`), /a column it reads is missing/, "without a column it reads it refuses");
  await noBands.exec(`rollback;`);
  eq(await made(noBands), 0, "and has made nothing");
  await noBands.close();
  // A time kept without its zone would land on the wrong India day.
  const bareTime = await build({ tables: [REAL_TABLES[0].replace("used_at timestamptz", "used_at timestamp"), ...REAL_TABLES.slice(1)] });
  await assert.rejects(bareTime.exec(`begin; ${NEW}; commit;`), /not a timestamp with time zone/, "with a time that has no zone it refuses");
  await bareTime.exec(`rollback;`);
  eq(await made(bareTime), 0, "and has made nothing");
  await bareTime.close();
  // An overloaded name is still found: to_regprocedure names the arguments.
  const twice = await build();
  await twice.exec(`create function public._caller_key(p_token text, p_other text) returns text language sql stable as $$ select null::text $$;`);
  await twice.exec(`begin; ${NEW}; commit;`);
  eq(await made(twice), 2, "a second function of the same name (other arguments) does not stop it");
  await twice.close();
  passed += 4;
}

const db = await build();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const before = await q(`select n.nspname, p.proname, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') order by 1, 2`);
const TABLES_BEFORE = (await q(`select table_schema || '.' || table_name as t from information_schema.tables where table_schema in ('public', 'private') order by 1`)).map((r) => r.t);
const INDEXES_BEFORE = (await one(`select count(*)::int as n from pg_indexes where schemaname in ('public', 'private')`)).n;
await db.exec(`begin; ${NEW}; commit;`);

const T = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const G = (n) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`;
const turf = (n, o = {}) =>
  q(
    `insert into public.turfs (id, name, slug, city, area, is_active, owner_phone, morning_price, afternoon_price, evening_price, weekend_morning_price, weekend_afternoon_price, weekend_evening_price, pricing_bands, price_unit, slot_minutes, price_owner_confirmed)
     values ($1,$2,$3,$4,'Gachibowli',$5,'9000000001',$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15)`,
    [T(n), "name" in o ? o.name : `Turf ${String(n).padStart(3, "0")}`, `turf-${n}`, o.city ?? "Hyderabad", o.active ?? true, o.morning ?? null, o.afternoon ?? null, o.evening ?? null, o.wMorning ?? null, o.wAfternoon ?? null, o.wEvening ?? null, o.bands ? JSON.stringify(o.bands) : null, o.unit ?? null, o.slotMinutes ?? null, o.ownerSet ?? null],
  );
const user = (n) => q(`insert into public.users (id, name, email, phone) values ($1, $2, $3, $4)`, [U(n), `Asha Rao ${n}`, `asha${n}@example.com`, `+9198765${String(43210 + n).padStart(5, "0")}`]);
const day = async (n) => (await one(`select ((now() at time zone 'Asia/Kolkata')::date - $1::int)::text as d`, [n])).d;
const today = await day(0);
/** An instant: `ago` India days back, at `at` on India's clock ("23:59"). */
const WHEN = (i) => `((((now() at time zone 'Asia/Kolkata')::date - $${i}::int)::timestamp + $${i + 1}::interval) at time zone 'Asia/Kolkata')`;
const tap = (o) =>
  q(`insert into public.turf_contact_clicks (turf_id, kind, source, signed_in, user_id, created_at) values ($1, $2, $3, $4, $5, ${WHEN(6)})`, [
    T(o.turf ?? 1), o.kind ?? "call", o.source ?? "turf_bar", o.out ? false : true, o.who === null ? null : typeof o.who === "string" ? o.who : U(o.who ?? 1), o.ago ?? 0, o.at ?? "12:00",
  ]);
const game = (n, o = {}) => q(`insert into public.games (id, creator_id, series_id, host_name, created_at) values ($1, $2, $3, 'Asha Rao', ${WHEN(4)})`, [G(n), U(o.host ?? 1), o.series ?? null, o.ago ?? 0, o.at ?? "12:00"]);
const join = (n, who, o = {}) => q(`insert into public.game_participants (game_id, user_id, joined_at) values ($1, $2, ${WHEN(3)})`, [G(n), U(who), o.ago ?? 0, o.at ?? "12:00"]);
const series = (host, o = {}) =>
  q(`insert into private.game_series (host_id, turf_id, sport, skill_level, max_players, start_time, end_time, price_per_player, rule, starts_on, created_at) values ($1, $2, 'football', 'all', 10, '19:00', '20:00', 0, '{}'::jsonb, current_date, ${WHEN(3)}) returning id`, [U(host), T(1), o.ago ?? 0, o.at ?? "12:00"]);
const review = (who, o = {}) => q(`insert into public.reviews (user_id, turf_id, source, comment, created_at) values ($1, $2, $3, 'Good turf', ${WHEN(4)})`, [U(who), T(o.turf ?? 1), o.source ?? null, o.ago ?? 0, o.at ?? "12:00"]);
const tool = (who, o = {}) => q(`insert into private.tool_use_log (tool, event, user_id, device, used_at) values ('toss', 'finished', $1, $2, ${WHEN(3)})`, [who === null ? null : U(who), who === null ? "abcdef123456" : null, o.ago ?? 0, o.at ?? "12:00"]);
/** A booking request: sent `ago` India days back; its slot starts `startIn` hours from this hour on India's clock (negative: already started). */
const request = (who, o = {}) =>
  q(
    `insert into private.booking_requests (turf_id, user_id, starts_at, hours, ends_at, note, player_name, player_phone, status, created_at)
     values ($1, $2, ${o.start ? "$7::timestamptz" : "(date_trunc('hour', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') + make_interval(hours => $7::int)"}, $3::int, ${o.start ? "$7::timestamptz" : "(date_trunc('hour', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') + make_interval(hours => $7::int)"} + make_interval(hours => $3::int), 'Bringing ten', 'Asha Rao', '+919876543210', $4, ${WHEN(5)}) returning id`,
    [T(o.turf ?? 1), U(who), o.hours ?? 1, o.status ?? "waiting", o.ago ?? 0, o.at ?? "12:00", o.start ?? o.startIn ?? 48],
  );
const said = (o = {}) =>
  q(`insert into private.contact_outcomes (turf_id, kind, source, outcome, reason, slot_date, slot_hour, created_at) values ($1, 'call', 'turf_bar', $2, $3, $4::date, $5, ${WHEN(6)}) returning id`, [
    typeof o.turf === "string" ? o.turf : T(o.turf ?? 1), o.outcome ?? "got_slot", o.reason ?? null, o.slotDate ?? null, o.slotHour ?? null, o.ago ?? 0, o.at ?? "12:00",
  ]);
const TABLES = ["public.turf_contact_clicks", "public.games", "public.game_participants", "public.reviews", "private.game_series", "private.tool_use_log", "private.booking_requests", "private.contact_outcomes"];
const clear = async () => { for (const t of TABLES) await db.exec(`delete from ${t};`); };
const rows = async () => (await one(`select ${TABLES.map((t) => `(select count(*) from ${t})::int`).join(" + ")} as n`)).n;
const admin = ADMIN_KEYS.map((k) => `key:${k}`);
const growth = async (...args) => (await one(`select public.admin_growth(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args)).r;
const slots = async (...args) => (await one(`select public.admin_growth_slots(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args)).r;
const win = async (key = "all") => (await growth(admin[0])).windows[key];
const pick = (o, keys) => keys.map((k) => o[k]);

// ── 1. Grants and settings. ──
for (const role of ["anon", "authenticated"]) {
  for (const sig of Object.values(SIG)) ok((await one(`select has_function_privilege($1, 'public.${sig}', 'execute') as p`, [role])).p, `${role} may call ${sig} (the check inside decides)`);
  for (const t of ["public.turf_contact_clicks", "private.contact_outcomes", "private.booking_requests", "private.tool_use_log"])
    ok(!(await one(`select has_table_privilege($1, '${t}', 'select,insert,update') as p`, [role])).p, `${role} still can't touch ${t}`);
}
for (const sig of Object.values(SIG)) ok(!(await one(`select has_function_privilege('public', 'public.${sig}', 'execute') as p`)).p, `public's default execute on ${sig} is revoked`);
for (const f of ["admin_growth", "admin_growth_slots"])
  eq(await one(`select prosecdef, provolatile, proconfig::text as c, pronargs::int as n from pg_proc where proname = $1`, [f]), { prosecdef: true, provolatile: "s", c: '{"search_path=\\"\\""}', n: 1 }, `${f}: security definer, stable, search_path '', one argument`);

// ── 2. The gate. ──
for (let i = 1; i <= 12; i++) await turf(i);
for (let i = 1; i <= 30; i++) await user(i);
await tap({ who: 1 });
await request(1, { status: "confirmed" });
await said();
const STRANGERS = [null, "", "nonsense", "key:", "key:p:9111111111", "key:e:someone@example.com", "key:p:" + ADMIN_KEYS.find((k) => k.startsWith("p:")).slice(2) + "0", ADMIN_KEYS[0]];
for (const t of STRANGERS) {
  eq(await growth(t), { error: "forbidden" }, `the numbers refuse ${t === null ? "nobody signed in" : `"${t.slice(0, 12)}"`}`);
  eq(await slots(t), { error: "forbidden" }, `the slots refuse ${t === null ? "nobody signed in" : `"${t.slice(0, 12)}"`}`);
}
eq(await growth(), { error: "forbidden" }, "no token at all is refused (the default)");
eq(await slots(), { error: "forbidden" }, "and the slots' default too");
// As the roles the app calls it with: the grant lets the call through, and only the site owner's token gets an answer.
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  eq(await growth(null), { error: "forbidden" }, `${role} with no token: forbidden`);
  eq(await growth("key:p:9111111111"), { error: "forbidden" }, `${role} signed in as someone else: forbidden`);
  eq((await slots("key:e:someone@example.com")).error, "forbidden", `${role}, the slots, someone else: forbidden`);
  eq((await growth(admin[0])).windows.all.people, 1, `${role} with the site owner's token: the numbers`);
  eq((await slots(admin[1])).got_slot_n, 1, `${role} with the site owner's other token: the slots`);
  await assert.rejects(db.query(`select count(*) from public.turf_contact_clicks`), /permission denied/, `${role} still can't read the taps themselves`);
  await assert.rejects(db.query(`select count(*) from private.booking_requests`), /permission denied/, `${role} still can't read the booking requests`);
  passed += 2;
  await db.exec(`reset role`);
}
eq(await growth(admin[0]), await growth(admin[1]), "the site owner's two sign-ins see the same");
await clear();

// ── 3. Empty tables. ──
const WINDOW_KEYS = ["days", "since", "taps", "taps_reached", "taps_signed_out", "taps_no_account", "call", "whatsapp", "slot_ask", "people", "contacts", "turfs", "came_back", "multi_turf", "active", "active_2days", "did_contact", "did_host", "did_join", "did_review", "did_tool", "did_request", "requests", "confirmed", "confirmed_hours", "confirmed_over", "waiting", "declined", "cancelled", "expired", "answered", "got_slot"];
const ZERO = Object.fromEntries(WINDOW_KEYS.slice(2).map((k) => [k, 0]));
eq(await growth(admin[0]), {
  today,
  windows: { d7: { days: 7, since: await day(6), ...ZERO }, d30: { days: 30, since: await day(29), ...ZERO }, all: { days: null, since: null, ...ZERO } },
  top_turfs: { d7: [], d30: [], all: [] },
}, "nothing kept: every count 0, every list empty (never null), all time has no first day");
eq(await slots(admin[0]), { today, cap: 2000, confirmed_n: 0, confirmed: [], got_slot_n: 0, got_slot: [], turfs: [] }, "nothing kept: no slot, no turf");

// ── 4. A contact is an account and a turf. ──
// A signed-out tap opened the sign-in: it reached no turf, whoever it says it was.
await tap({ who: null, out: true });
await tap({ who: 2, out: true });
eq(pick(await win(), ["taps", "taps_reached", "taps_signed_out", "taps_no_account", "people", "contacts", "turfs", "active"]), [2, 0, 2, 0, 0, 0, 0, 0], "a signed-out tap is a tap and no contact, even with an account on it");
// One player, one turf, Call and WhatsApp five times: one person, one contact.
for (let i = 0; i < 5; i++) { await tap({ who: 1, kind: "call", at: `1${i}:00` }); await tap({ who: 1, kind: "whatsapp", at: `1${i}:30` }); }
eq(pick(await win(), ["taps", "taps_reached", "taps_signed_out", "call", "whatsapp", "slot_ask", "people", "contacts", "turfs", "came_back", "multi_turf"]), [12, 10, 2, 5, 5, 0, 1, 1, 1, 0, 0], "ten taps by one player at one turf: one person, one contact of that turf");
// The same player at a second turf is a second contact; a second player at the first turf a third.
await tap({ who: 1, turf: 2, kind: "whatsapp", source: "slot_ask" });
await tap({ who: 3, turf: 1 });
eq(pick(await win(), ["taps_reached", "call", "whatsapp", "slot_ask", "people", "contacts", "turfs", "came_back", "multi_turf"]), [12, 6, 5, 1, 2, 3, 2, 0, 1], "two people, three (account, turf) pairs, two turfs; one of them contacted two turfs; Ask for a slot is its own count");
{
  const w = await win();
  eq(w.call + w.whatsapp + w.slot_ask, w.taps_reached, "Call, WhatsApp and Ask for a slot add up to the taps that reached a turf");
  eq(w.taps_reached + w.taps_signed_out, w.taps, "and reached and signed out to every tap");
}
// An account the browser made up (it is in nobody's public.users) and a signed-in tap with none: taps, nobody.
await tap({ who: "cccccccc-0000-4000-8000-000000000001", turf: 3 });
await tap({ who: null, turf: 3 });
eq(pick(await win(), ["taps_reached", "taps_no_account", "people", "contacts", "turfs"]), [14, 2, 2, 3, 2], "a signed-in tap with no account, or one that is nobody's, reached a turf and is in no count of people");
await clear();

// ── 5. India days: 23:59 and 00:01. ──
// 23:59 one India day and 00:01 the next are two days, two minutes apart.
await tap({ who: 4, ago: 3, at: "23:59" });
await tap({ who: 4, ago: 2, at: "00:01" });
// 00:01 and 23:59 of one India day are one day, though they are two days in UTC.
await tap({ who: 5, ago: 2, at: "00:01" });
await tap({ who: 5, ago: 2, at: "23:59" });
eq((await one(`select ((((now() at time zone 'Asia/Kolkata')::date - 2)::timestamp + interval '00:01') at time zone 'Asia/Kolkata')::text as t`)).t.slice(11, 16), "18:31", "00:01 in India is 18:31 UTC the day before");
eq(pick(await win(), ["people", "came_back", "active", "active_2days"]), [2, 1, 2, 1], "23:59 then 00:01: came back on another day; 00:01 and 23:59 of the same India day: did not");
await clear();
// The windows' edges: 00:01 on the first day is in, 23:59 the day before is out.
await tap({ who: 1, ago: 6, at: "00:01" });
await tap({ who: 2, ago: 7, at: "23:59" });
await tap({ who: 3, ago: 29, at: "00:01" });
await tap({ who: 4, ago: 30, at: "23:59" });
await tap({ who: 5, ago: 400 });
{
  const r = await growth(admin[0]);
  eq([r.windows.d7.people, r.windows.d30.people, r.windows.all.people], [1, 3, 5], "7 days: day 6 from 00:01 in, 23:59 the day before out; 30 days: day 29 in, the day before out; all time: everyone");
  eq([r.windows.d7.since, r.windows.d30.since, r.windows.all.since], [await day(6), await day(29), await day(400)], "since: today less 6, today less 29, and the India day of the first tap");
  eq([r.windows.d7.days, r.windows.d30.days, r.windows.all.days], [7, 30, null], "days: 7, 30 and none");
  eq(r.today, today, "today is India's date");
  for (const k of ["d7", "d30", "all"]) eq(Object.keys(r.windows[k]).sort(), [...WINDOW_KEYS].sort(), `${k}: a window's 32 keys, nothing else`);
  eq(Object.keys(r).sort(), ["today", "top_turfs", "windows"], "the answer's three keys");
}
await clear();

// ── 6. Active on 2 or more days: any two counted actions on two India days. ──
// 6: a tap on one day, a review on another (two different actions).
await tap({ who: 6, ago: 5 }); await review(6, { ago: 1 });
// 7: a tap and a tool use on the same day: one day.
await tap({ who: 7, ago: 4 }); await tool(7, { ago: 4, at: "21:00" });
// 8: hosted one day, joined someone else's game another.
await game(1, { host: 8, ago: 9 }); await join(1, 8, { ago: 9 });
await game(2, { host: 9, ago: 8 }); await join(2, 9, { ago: 8 }); await join(2, 8, { ago: 3 });
// 10: a repeat set up once; the job put up its games on three later days, each with the host's own lineup row.
const S = (await series(10, { ago: 12 }))[0].id;
for (const [n, ago] of [[3, 12], [4, 10], [5, 6], [6, 2]]) { await game(n, { host: 10, series: S, ago }); await join(n, 10, { ago }); }
// 11: a tool use and a booking request on two days. 12: one tool use. A guest's tool use (a device tag, no account) is nobody.
await tool(11, { ago: 20 }); await request(11, { ago: 15 });
await tool(12, { ago: 2 }); await tool(null, { ago: 1 }); await tool(null, { ago: 2 });
// A review that is not a TapTurf player's own (a copied one has a source) is nobody's action.
await review(12, { ago: 9, source: "google" });
// An account that is no longer there: its rows are in no count.
await q(`insert into public.games (id, creator_id, created_at) values ($1, 'cccccccc-0000-4000-8000-000000000002', now() - interval '2 days'), ($2, 'cccccccc-0000-4000-8000-000000000002', now())`, [G(90), G(91)]);
{
  const w = await win();
  eq(pick(w, ["active", "active_2days"]), [7, 3], "seven accounts did something; three on 2 or more India days (6: a tap and a review; 8: hosted and joined; 11: a tool and a request)");
  eq(pick(w, ["did_contact", "did_host", "did_join", "did_review", "did_tool", "did_request"]), [2, 3, 1, 1, 3, 1], "how many did each: a host is not counted as joining their own game, a repeat's job-made games are not hosting, a copied review and a guest's tool use are nobody's");
  eq(pick(w, ["people", "came_back"]), [2, 0], "and only the taps make someone a person who contacted a turf");
  const w7 = await win("d7");
  eq(pick(w7, ["active", "active_2days", "did_contact", "did_host", "did_join", "did_review", "did_tool", "did_request"]), [4, 1, 2, 0, 1, 1, 2, 0], "the last 7 days: 6 is still on two days (a tap and a review), 8 only joined, 10's repeat was set up before them");
}
await clear();

// ── 7. Booking requests: only a confirmed one counts. ──
await request(1, { status: "confirmed", hours: 2, startIn: 48, ago: 1 });
await request(2, { status: "confirmed", hours: 3, startIn: -72, ago: 5 });
await request(3, { status: "waiting", startIn: 24, ago: 1 });
await request(4, { status: "waiting", startIn: -2, ago: 1 });
await request(5, { status: "declined", ago: 2 });
await request(6, { status: "cancelled", hours: 3, ago: 2 });
await request(7, { status: "expired", startIn: -30, ago: 3 });
await request(8, { status: "confirmed", hours: 1, startIn: -400, ago: 20 });
{
  const KEYS = ["requests", "confirmed", "confirmed_hours", "confirmed_over", "waiting", "declined", "cancelled", "expired"];
  eq(pick(await win(), KEYS), [8, 3, 6, 2, 1, 1, 1, 2], "eight requests: three confirmed (6 hours, two of them over), one waiting, one declined, one cancelled, and two expired (one by the clock: waiting, its start gone)");
  eq(pick(await win("d7"), KEYS), [7, 2, 5, 1, 1, 1, 1, 2], "the last 7 days, by the day the request was sent");
  const w = await win();
  eq(w.confirmed + w.waiting + w.declined + w.cancelled + w.expired, w.requests, "the five states add up to the requests");
  eq(pick(w, ["active", "did_request"]), [8, 8], "sending a request is an action, whatever became of it");
}

// ── 8. "Did you get a slot?" answers. ──
await said({ outcome: "got_slot", slotDate: "2026-11-27", slotHour: 19, turf: 2, ago: 1 });
await said({ outcome: "got_slot", turf: 3, ago: 2 });
await said({ outcome: "got_slot", slotDate: "2026-11-21", slotHour: 0, turf: T(99), ago: 9 });
await said({ outcome: "not_this_time", reason: "full", slotDate: "2026-11-26", slotHour: 20, ago: 1 });
await said({ outcome: "deciding", ago: 3 });
await said({ outcome: "dismissed", ago: 1 });
await said({ outcome: "dismissed", ago: 12 });
eq(pick(await win(), ["answered", "got_slot"]), [5, 3], "five answers, three got a slot; a closed card is not an answer");
eq(pick(await win("d7"), ["answered", "got_slot"]), [4, 2], "the last 7 days");

// ── 9. The slots an estimate stands on. ──
const START = "2026-11-30T19:30:00Z"; // 1:00 am on 1 Dec in India
await request(9, { status: "confirmed", hours: 2, turf: 4, ago: 0, at: "09:00", start: START });
await q(`update public.turfs set morning_price = 600, afternoon_price = 700, evening_price = 900, weekend_evening_price = 1100, price_unit = 'per_hour', price_owner_confirmed = true where id = $1`, [T(1)]);
await q(`update public.turfs set pricing_bands = $2::jsonb, slot_minutes = 90 where id = $1`, [T(2), JSON.stringify([{ band: "evening", days: "all", format: "5-a-side", price_per_hour: 1200, source: "listing:somewhere 2026-10-16" }])]);
{
  const s = await slots(admin[0]);
  eq(Object.keys(s).sort(), ["cap", "confirmed", "confirmed_n", "got_slot", "got_slot_n", "today", "turfs"], "the slots' seven keys, nothing else");
  eq([s.today, s.cap, s.confirmed_n, s.got_slot_n], [today, 2000, 4, 3], "four confirmed requests and three got a slot answers in all");
  eq(s.confirmed.map((c) => Object.keys(c).sort().join()), Array(4).fill("at,date,hour,hours,minute,turf"), "a confirmed request's six keys, nothing else");
  eq(s.confirmed[0], { turf: T(4), at: today, date: "2026-12-01", hour: 1, minute: 0, hours: 2 }, "newest sent first: the day it was sent, and its start as India's calendar date and clock");
  eq(s.confirmed.map((c) => [c.at, c.hours]), [[today, 2], [await day(1), 2], [await day(5), 3], [await day(20), 1]], "only confirmed ones: never a waiting, declined, cancelled or expired request");
  ok(s.confirmed.slice(1).every((c) => c.minute === 0 && c.hour >= 0 && c.hour <= 23 && /^\d{4}-\d{2}-\d{2}$/.test(c.date)), "each with a date and an hour");
  eq(s.got_slot.map((g) => Object.keys(g).sort().join()), Array(3).fill("at,date,hour,turf"), "an answer's four keys, nothing else");
  eq(s.got_slot, [
    { turf: T(2), at: await day(1), date: "2026-11-27", hour: 19 },
    { turf: T(3), at: await day(2), date: null, hour: null },
    { turf: T(99), at: await day(9), date: "2026-11-21", hour: 0 },
  ], "every got a slot answer, newest first: the slot it names, or none; never a not this time answer or a closed card");
  eq(s.turfs.map((t) => t.id), [T(1), T(2), T(3), T(4)], "the turfs of either list that are still there, by id; one that is gone has no row");
  eq(Object.keys(s.turfs[0]).sort(), ["afternoon_price", "evening_price", "id", "morning_price", "price_owner_confirmed", "price_unit", "pricing_bands", "slot_minutes", "weekend_afternoon_price", "weekend_evening_price", "weekend_morning_price"], "a turf's id and its ten price columns, nothing else");
  eq(s.turfs[0], { id: T(1), morning_price: 600, afternoon_price: 700, evening_price: 900, weekend_morning_price: null, weekend_afternoon_price: null, weekend_evening_price: 1100, pricing_bands: null, price_unit: "per_hour", slot_minutes: null, price_owner_confirmed: true }, "the six columns as numbers, the unit and whether the owner set them");
  eq([s.turfs[1].pricing_bands[0].price_per_hour, s.turfs[1].pricing_bands[0].band, s.turfs[1].slot_minutes], [1200, "evening", 90], "and the listed bands as they are kept");
}

// ── 10. Nothing personal in either answer. ──
{
  const all = JSON.stringify([await growth(admin[0]), await slots(admin[0])]);
  ok(!/aaaaaaaa-0000|cccccccc-0000/.test(all), "no account id");
  ok(!/Asha|Rao|example\.com|98765|9000000001|Bringing ten|Good turf|Gachibowli|abcdef123456/.test(all), "no name, email, number, note, review, area or device tag");
  ok(!/user|account|player|phone|email|note/i.test(all.replaceAll('"taps_no_account"', "")), "and no key that names one");
}
await clear();

// ── 11. The turfs with the most contacts: order and cap. ──
// Turf n gets n different people (turfs 1 to 12), today; turf 12's people tap twice.
for (let t = 1; t <= 12; t++) for (let u = 1; u <= t; u++) { await tap({ who: u, turf: t }); if (t === 12) await tap({ who: u, turf: t, kind: "whatsapp", at: "13:00" }); }
// Turfs 11 and 10 tie turf 12 on people through older taps (out of the 7 days): 12 leads on taps, then 10 and 11 by name.
await tap({ who: 12, turf: 11, ago: 10 });
await tap({ who: 11, turf: 10, ago: 10 }); await tap({ who: 12, turf: 10, ago: 10 });
await q(`update public.turfs set name = 'Zed Arena' where id = $1`, [T(11)]);
await q(`update public.turfs set is_active = false, city = ' Pune ' where id = $1`, [T(9)]);
await tap({ who: 1, turf: 1, out: true }); await tap({ who: null, turf: 2, out: true });
// And one more player who contacted a single turf.
await tap({ who: 13, turf: 1 });
{
  const r = await growth(admin[0]);
  eq(Object.keys(r.top_turfs).sort(), ["all", "d30", "d7"], "a list for each window");
  eq(r.top_turfs.all.length, 10, "ten at most");
  eq(r.top_turfs.all.map((t) => [t.id, t.contacts, t.taps]).slice(0, 4), [[T(12), 12, 24], [T(10), 12, 12], [T(11), 12, 12], [T(9), 9, 9]], "most contacts first, then most taps, then by name");
  eq(r.top_turfs.all.at(-1).contacts, 3, "turfs 1 and 2 are cut");
  eq(r.top_turfs.d7.map((t) => t.contacts), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3], "the last 7 days have their own list: the older taps are not in it");
  eq(Object.keys(r.top_turfs.all[0]).sort(), ["active", "city", "contacts", "id", "name", "slug", "taps"], "a turf's seven keys, nothing else");
  eq(r.top_turfs.all[0], { id: T(12), name: "Turf 012", city: "hyderabad", slug: "turf-12", active: true, contacts: 12, taps: 24 }, "a turf: its name, city in lower case, slug, whether it is on, its contacts and their taps");
  eq(pick(r.top_turfs.all[3], ["name", "city", "active"]), ["Turf 009", "pune", false], "a turf switched off is still listed, as not active");
  eq(pick(r.windows.all, ["people", "contacts", "turfs", "multi_turf", "taps_signed_out"]), [13, 82, 12, 12, 2], "thirteen people, 82 pairs (79 today and 3 older), twelve turfs; everyone but one contacted two or more");
  eq(r.windows.all.contacts, (await one(`select count(*)::int as n from (select distinct user_id, turf_id from public.turf_contact_clicks where signed_in and user_id is not null) x`)).n, "contacts is the number of different (account, turf) pairs, counted here");
}

// ── 12. The slots' cap. ──
await db.exec(`insert into private.contact_outcomes (turf_id, kind, source, outcome, created_at) select '${T(1)}', 'call', 'turf_bar', 'got_slot', now() - make_interval(mins => g) from generate_series(1, 2003) g`);
{
  const s = await slots(admin[0]);
  eq([s.got_slot_n, s.got_slot.length, s.cap], [2003, 2000, 2000], "2003 answers: the newest 2000, and how many there are in all");
  const ats = s.got_slot.map((g) => g.at);
  eq(ats, [...ats].sort().reverse(), "newest first all the way down");
}

// ── 13. Reading writes nothing; safe to run again. ──
const c1 = await rows();
const snap = await q(`select * from public.turf_contact_clicks order by id`);
await growth(admin[0]); await slots(admin[0]); await growth(null); await slots("key:p:9111111111");
eq(await rows(), c1, "reads change no row count");
eq(await q(`select * from public.turf_contact_clicks order by id`), snap, "and no row");
const g1 = await growth(admin[0]);
const s1 = await slots(admin[0]);
await db.exec(`begin; ${NEW}; commit;`);
eq(await rows(), c1, "run again: every row stays");
eq(await growth(admin[0]), g1, "and the numbers read the same");
eq(await slots(admin[0]), s1, "and the slots");
eq(await made(db), 2, "no overload after running it twice");
eq((await one(`select count(*)::int as n from pg_indexes where schemaname in ('public', 'private')`)).n, INDEXES_BEFORE, "no index was added");
const others = await q(`select n.nspname, p.proname, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.proname not in ('admin_growth', 'admin_growth_slots') order by 1, 2`);
eq(others, before, "every function from before is as it was");
eq((await q(`select table_schema || '.' || table_name as t from information_schema.tables where table_schema in ('public', 'private') order by 1`)).map((r) => r.t), TABLES_BEFORE, "no table was made");
console.log(`body md5: admin_growth ${md5(GROWTH)}, admin_growth_slots ${md5(SLOTS)}`);

console.log(`growth_numbers: ${passed} checks passed`);
