// Applies 20261129_slot_reminders.sql (twice, then once more at the end) to an in-memory
// Postgres (PGlite) built as game_confirmed.check.mjs builds its own: games_lockdown.db.mjs,
// the games, repeats, other venue, web push, email and game confirmed files (so
// private.email_job is the body the file starts from), then the owners' side: public.turf_owners
// as 20261019_mytapturf.sql and the two files after it shape it, public.turfs' contact columns,
// the real 20261025_turf_claimed.sql, 20261105_turf_availability.sql and 20261118_slot_asks.sql,
// the real public._can_manage and private.call_phone10, and stand-ins for pg_cron (cron.job as
// pg_cron shapes it), pg_net, private.email_proven (a test list), public._caller_key (a
// "phone:<10 digits>" token, or a Google session) and private.account_for_key (the account
// with that number or address).
// Checks: the file's own text rules; private.email_job is the body in
// 20261117_game_confirmed.sql plus one block of 4 lines, and the guard refuses any other body;
// it refuses without the files it needs and changes nothing then; the constants are the ones in
// lib/email/slotReminder.ts and the job runs at 9:00 AM India time; private.turf_page_has_number
// against lib/my/pageNumber.cases.json; the accounts it may remind are exactly the ones
// private.slots_guard lets mark that turf; who gets one and who never does (no confirmed email,
// a bounced address, the switch off, all emails off, a claim rejected, revoked, waiting or made
// under 48 hours ago, a claim whose key opens no account, a turf not listed or without a number,
// updated 47 hours ago, the site owner's shortcut); one email per account for two turfs; the
// job twice in a minute queues nothing twice, and nothing at any other hour; one every 2 India
// days however the job's second falls; the stop after 5 in a row and the restart after an
// update; reminders that never went (skipped) are not counted; the 6 a day cap; mode off and
// owner_only skip it as they skip every email; what the email is handed when it is sent, and
// the skips (off, updated, late, suppressed); every other email is written as before; the
// switch's two functions, "all off", and the accounts all off before the file; the grants; the
// file applied again changes nothing and a job stopped by hand stays stopped.
// Never touches a real database. Made-up people, numbers and addresses only (the site owner's
// two keys are read from 20261019_mytapturf.sql and never written or printed here).
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/slot_reminders.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { KEY, makeDb } from "./games_lockdown.db.mjs";

const [M] = process.argv.slice(2);
const NAME = "20261129_slot_reminders.sql";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sql = fs.readFileSync(`${M}/${NAME}`, "utf8");
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const read = (f) => fs.readFileSync(`${M}/${f}`, "utf8");

/* ---------------- the file itself ---------------- */
ok(sql.startsWith("set local lock_timeout = '5s';\n"), "starts by waiting 5 s at most for a lock");
ok(!/drop|delete|truncate/i.test(sql), "the words drop, delete and truncate are nowhere in it (not even inside a word)");
ok(!sql.includes("\\"), "no backslash anywhere");
ok(!/[—–]/.test(sql), "no em or en dashes");
ok(!/create\s+table/i.test(sql), "makes no table (so none to open row level security on, and none to grant)");
ok(!/\breferences\b|foreign\s+key/i.test(sql.replace(/^--.*$/gm, "")), "no foreign key");
ok(!/\b(revoke|grant)\b[^;]*\bon\s+(table\s+)?(public|private)\.[a-z_]+\s+(to|from)\b/i.test(sql.replace(/^--.*$/gm, "")), "changes no grant on any table");
ok(!/(alter|create)\s+policy/i.test(sql), "makes or changes no policy");
eq([...sql.replace(/^--.*$/gm, "").matchAll(/alter\s+table\s+([\w.]+)/gi)].map((m) => m[1]), ["private.email_prefs"], "alters one table, private.email_prefs (one column)");
ok(!/(insert\s+into|update)\s+public\./i.test(sql.replace(/^--.*$/gm, "")), "writes no public table");
ok(!/user_contact_emails/.test(sql), "never reads the typed emails");
ok(/^do \$\$\ndeclare\n  v_job text;\nbegin\n  if to_regclass/m.test(sql.slice(0, sql.indexOf("-- ── 1."))), "a guard before anything is made");
for (const said of ["Replaced: one function", "To stop it by hand", "To undo by hand without taking any row away", "The app works before this file", "What is stored", "cron.alter_job"]) {
  ok(sql.slice(0, sql.indexOf("\ndo $$")).includes(said), `the header says: ${said}`);
}

// A function's body as Postgres keeps it (prosrc): the text between its dollar quotes.
const bodyOf = (text, name) => {
  const i = text.lastIndexOf(`create or replace function ${name}(`);
  if (i < 0) return null;
  const tag = /\$(\w*)\$/.exec(text.slice(i));
  const a = i + tag.index + tag[0].length;
  return text.slice(a, text.indexOf(tag[0], a));
};
const EARLIER = fs.readdirSync(M).filter((f) => f.endsWith(".sql") && f < NAME).sort().map((f) => [f, fs.readFileSync(`${M}/${f}`, "utf8")]);
const latest = (name) => {
  let last = null;
  for (const [f, t] of EARLIER) if (t.includes(`create or replace function ${name}(`)) last = { file: f, body: bodyOf(t, name) };
  return last;
};

// The one replaced function: the latest body in the repo, every line in order, plus one block.
const OLD_JOB = latest("private.email_job");
const NEW_JOB = bodyOf(sql, "private.email_job");
const OLD_MD5 = md5(OLD_JOB.body);
const NEW_MD5 = md5(NEW_JOB);
eq([OLD_JOB.file, OLD_MD5], ["20261117_game_confirmed.sql", "feab784127f6a3419570da5d51f14904"], "private.email_job's latest body in the repo is the one in 20261117_game_confirmed.sql");
ok(new RegExp(`started from\\s+${OLD_MD5}\\s+20261117_game_confirmed\\.sql`).test(sql), "the header names the body it started from, with its md5 and its file");
ok(new RegExp(`becomes\\s+${NEW_MD5}\\n`).test(sql), "and the md5 it becomes");
{
  const o = OLD_JOB.body.split("\n");
  const n = NEW_JOB.split("\n");
  const added = [];
  let i = 0;
  for (const line of n) {
    if (i < o.length && line === o[i]) i++;
    else added.push(line);
  }
  eq(i, o.length, "email_job keeps every line of that body, in order");
  eq(added, [
    "  -- 20261129_slot_reminders.sql: an owner's slot reminder has its own switch and is about no game.",
    "  if p_row.kind = 'reminder' and p_row.refs ->> 'about' = 'slots' then",
    "    return private.slot_reminder_job(p_row, v_to);",
    "  end if;",
  ], "and adds one block of 4 lines");
  const at = n.indexOf(added[1]);
  ok(n[at - 3].includes("return jsonb_build_object('skip', 'suppressed');") && n[at + 3].includes("if not private.email_ok(p_row.user_id, p_row.kind) then"),
    "after the mode, the address and the suppressions, before the game switches");
}
eq([...sql.matchAll(/create or replace function ((?:public|private)\.[a-z_0-9]+)\(/g)].map((m) => m[1]).filter((f) => latest(f)), ["private.email_job"],
  "no other function from before is replaced");
for (const fn of ["private.email_address", "private.email_suppressed", "private.email_mode_skip", "private.email_daily_cap", "private.account_key_ok", "private.account_for_key", "private.call_phone10", "private.slots_guard"]) {
  const l = latest(fn);
  ok(new RegExp(`^--\\s+${fn.replace(".", "\\.")}\\s+${md5(l.body)}\\s+${l.file.replace(".", "\\.")}$`, "m").test(sql), `the header names ${fn} with the md5 of its latest body in the repo, and its file`);
}

/* ---------------- the databases ---------------- */
// pg_cron as it is shaped: cron.job (jobid, jobname, schedule, command, active), cron.schedule, cron.alter_job. One
// thing is harsher here than in pg_cron: scheduling a name that is there turns that job back on, so the check
// proves the file never schedules a job it finds (one stopped by hand stays stopped whatever pg_cron does).
const CRON = `create schema if not exists cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text not null, command text not null, active boolean not null default true);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
  $$ insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
     on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command, active = true returning jobid $$;
create function cron.alter_job(job_id bigint, schedule text default null, command text default null, database text default null, username text default null, active boolean default null)
  returns void language sql as
  $$ update cron.job j set schedule = coalesce(alter_job.schedule, j.schedule), command = coalesce(alter_job.command, j.command), active = coalesce(alter_job.active, j.active) where j.jobid = job_id $$;`;
const NET = `create schema if not exists net;
create table net.posts (id bigserial primary key, url text, headers jsonb, body jsonb, timeout integer, at timestamptz default clock_timestamp());
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
  returns bigint language sql as $$ insert into net.posts (url, headers, body, timeout) values (url, headers, body, timeout_milliseconds) returning id $$;`;
const PROVEN = `create table private.test_proven (user_id uuid primary key);
create function private.email_proven(p_user_id uuid) returns boolean language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from private.test_proven t where t.user_id = p_user_id) $$;
create function private.phone_proven(p_user_id uuid) returns boolean language sql stable security definer set search_path = '' as $$ select false $$;`;
const fnFrom = (text, name) => {
  const m = [...text.matchAll(new RegExp(`create or replace function ${name.replace(/\./g, "\\.")}\\([^]*?\\n\\$\\$;`, "g"))].at(-1);
  assert.ok(m, `${name} is in the file`);
  return m[0];
};
const MYTT = read("20261019_mytapturf.sql");
// The site owner's two keys as 20261019_mytapturf.sql has them: read, used, never written or printed here.
const ADMIN_KEYS = [...bodyOf(MYTT, "public._is_admin_key").matchAll(/'([ep]:[^']+)'/g)].map((m) => m[1]);
const ADMIN_EMAIL = ADMIN_KEYS.find((k) => k.startsWith("e:"))?.slice(2) ?? "";
ok(ADMIN_KEYS.length === 2 && ADMIN_EMAIL.includes("@"), "the site owner's keys (read from the file)");
// _caller_key: a Google session, or a "phone:<10 digits>" token (Firebase can't be reached here), as email.check.mjs.
const OWNER = `${fnFrom(MYTT, "public._phone10")}
${fnFrom(MYTT, "public._is_admin_key")}
create or replace function public._caller_key(p_token text) returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_email <> ''
     and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb
     and coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method": "oauth"}]'::jsonb then
    return 'e:' || v_email;
  end if;
  return case when p_token ~ '^phone:[6-9][0-9]{9}$' then 'p:' || substr(p_token, 7) end;
end;
$$;`;
const START_AT = fnFrom(read("20261101_played_with.sql"), "private.game_start_at");
const USERNAMES = `create table public.usernames (user_id uuid primary key references public.users(id), username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,19}$'),
  taggable boolean not null default true, created_at timestamptz not null default now());
alter table public.usernames enable row level security;
revoke all on public.usernames from public, anon, authenticated;`;
const GAMES = ["20261030_games_lockdown.sql", "20261030_games_lockdown_step2.sql", "20261102_game_series.sql", "20261103_game_other_venue.sql", "20261102_web_push.sql", "20261110_email.sql"].map(read);
const CONFIRMED = read("20261117_game_confirmed.sql");
// The owners' side. public.turf_owners: the table 20261019_mytapturf.sql makes, with the columns the next two files add.
const OWNERS_TABLE = /create table if not exists public\.turf_owners \([^;]*\);/.exec(MYTT)[0];
const ROLE = /alter table public\.turf_owners add column if not exists role text[^;]*;/.exec(read("20261019_mytapturf_claims.sql"))[0];
const OWNERS = `${OWNERS_TABLE}
${ROLE}
alter table public.turf_owners add column if not exists user_id uuid;
alter table public.turf_owners add column if not exists verified_phone text;
alter table public.turfs add column contact_info jsonb, add column owner_phone text, add column whatsapp_phone text, add column landline_phone text,
  add column opening_hours jsonb, add column start_time time, add column end_time time, add column is_24x7 boolean, add column closed_days text, add column number_of_grounds int;
-- The account a key opens: the one with that number, or that address (the real rule is 20261025_claims_account.sql).
create function private.account_for_key(p_key text) returns uuid language sql stable security definer set search_path = '' as $$
  select case left(coalesce(p_key, ''), 2)
    when 'e:' then (select u.id from public.users u where lower(u.email) = substr(p_key, 3) order by u.created_at limit 1)
    when 'p:' then (select u.id from public.users u where u.phone = '+91' || substr(p_key, 3) order by u.created_at limit 1) end $$;
create function private.list_key(p_city text) returns text language sql immutable as $$ select 'list:' || coalesce(p_city, 'all') $$;
${fnFrom(read("20261026_account_links_reads.sql"), "public._can_manage")}
${fnFrom(read("20261028_owner_call_number.sql"), "private.call_phone10")}`;
const OWNER_FILES = ["20261025_turf_claimed.sql", "20261105_turf_availability.sql", "20261118_slot_asks.sql"].map(read);

async function build(upTo) {
  const db = await makeDb(PGlite);
  await db.exec(CRON + NET + PROVEN + START_AT + OWNER + `\ninsert into private.app_secrets values ('revalidate', 'reval-secret');`);
  for (const f of GAMES) await db.exec(f);
  await db.exec(USERNAMES);
  if (upTo === "games") return db;
  await db.exec(CONFIRMED);
  if (upTo === "confirmed") return db;
  await db.exec(OWNERS);
  for (const f of OWNER_FILES) await db.exec(f);
  return db;
}

{
  const bare = await build("confirmed");
  await assert.rejects(bare.exec(sql), /slot reminders: apply 20261019_mytapturf\.sql, .* 20261118_slot_asks\.sql first/, "without the owners' files it refuses");
  passed++;
  eq((await bare.query(`select count(*)::int n from information_schema.columns where table_schema = 'private' and table_name = 'email_prefs' and column_name = 'slots'`)).rows[0].n, 0, "and changes nothing: no column");
  eq((await bare.query(`select md5(prosrc) m from pg_proc where proname = 'email_job'`)).rows[0].m, OLD_MD5, "email_job as it was");
  eq((await bare.query(`select count(*)::int n from pg_proc where proname like 'slot_reminder%'`)).rows[0].n, 0, "no function");
  await bare.close();
}
{
  // Another email_job than the one the file starts from: refused, nothing changed.
  const other = await build("all");
  await other.exec(fnFrom(CONFIRMED, "private.email_job").replace("  v_players integer;\n", "  v_players integer;\n  v_other integer;\n"));
  const was = (await other.query(`select md5(prosrc) m from pg_proc where proname = 'email_job'`)).rows[0].m;
  ok(was !== OLD_MD5, "(an email_job with one more line)");
  await assert.rejects(other.exec(sql), /slot reminders: private\.email_job is not the body this file starts from/, "an email_job it does not know: refused");
  passed++;
  eq((await other.query(`select md5(prosrc) m from pg_proc where proname = 'email_job'`)).rows[0].m, was, "and left as it was");
  eq((await other.query(`select count(*)::int n from cron.job where jobname = 'slot-reminders'`)).rows[0].n, 0, "no job");
  await other.close();
}

const db = await build("all");
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const asRole = async (role, fn) => {
  await q(`set role ${role}`);
  try { return await fn(); } finally { await q("reset role"); }
};
eq((await one(`select md5(prosrc) m from pg_proc where proname = 'email_job'`)).m, OLD_MD5, "before the file: email_job is the body it starts from");
await q(`update private.email_settings set value = 'on' where name = 'mode'`);

// The clock: day 0 is 30 India days ago; the job's own time is 9:00 AM (and 5 seconds, a late start).
const DAY0 = new Date(Date.now() + 330 * 60000 - 30 * 86400000).toISOString().slice(0, 10);
const day = (d) => new Date(Date.parse(`${DAY0}T00:00:00+05:30`) + d * 86400000 + 330 * 60000).toISOString().slice(0, 10);
const at = (d, hhmmss = "09:00:05") => new Date(`${day(d)}T${hhmmss}+05:30`).toISOString();
const hoursBefore = (iso, h) => new Date(Date.parse(iso) - h * 3600000).toISOString();

// People (made up) and their turfs.
const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const T = (i) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`;
const PEOPLE = {
  ASHA: [1, "Asha Rao"], RAVI: [2, "Ravi Kumar"], PRIYA: [3, "Priya Sharma"], KIRAN: [4, "Kiran Patil"], NEHA: [5, "Neha Joshi"], OMAR: [6, "Omar Shaikh"],
  MEERA: [7, "Meera Iyer"], ZOYA: [8, "Zoya Khan"], VIKRAM: [9, "Vikram Rao"], DEV: [10, "Dev Menon"], ISHA: [11, "Isha Nair"], FARAH: [12, "Farah Ali"],
  GITA: [13, "Gita Das"], WAITS: [14, "Tara Bose"], STAFF: [15, "Imran Shaikh"], SITE: [16, "Site Owner"], PLAYER: [17, "Kabir Mehta"], LATE: [18, "Leela Pillai"],
  KEYED: [19, "Nikhil Jain"],
};
const P = Object.fromEntries(Object.entries(PEOPLE).map(([k, [i]]) => [k, U(i)]));
const phone10 = (who) => `90000001${String(PEOPLE[who][0]).padStart(2, "0")}`;
const address = (who) => (who === "SITE" ? ADMIN_EMAIL : `${who.toLowerCase()}.standin@example.com`);
for (const [who, [i, name]] of Object.entries(PEOPLE)) {
  await q(`insert into public.users (id, name, phone, email, created_at) values ($1, $2, $3, $4, now() - interval '90 days')`, [U(i), name, `+91${phone10(who)}`, address(who)]);
}
// Google confirmed everyone's address but Kiran's.
await q(`insert into private.test_proven select id from public.users where id <> $1`, [P.KIRAN]);
const TURFS = [
  [1, "Kings Turf Arena", true, "9000000201"], [2, "Dribble Den", true, "9000000202"], [3, "Dribble Den Box", true, "9000000203"], [4, "Kiran's Cage", true, "9000000204"],
  [5, "Neha's Nets", true, "9000000205"], [6, "Omar's Oval", true, "9000000206"], [7, "Meera's Meadow", true, "9000000207"], [8, "Nobody's Turf", true, "9000000208"],
  [9, "Dev's Dugout", false, "9000000209"], [10, "Isha's Astro", true, null], [11, "Farah's Five", true, "9000000211"], [12, "Gita's Ground", true, "9000000212"],
  [13, "Key Only Arena", true, "9000000213"], [14, "Leela's Lawn", true, "9000000214"],
];
for (const [i, name, active, phone] of TURFS) {
  await q(`insert into public.turfs (id, name, slug, city, area, is_active, sports, owner_phone) values ($1, $2, $3, 'pune', 'Baner', $4, '["Football"]', $5)`,
    [T(i), name, name.toLowerCase().replace(/[^a-z]+/g, "-"), active, phone]);
}
const claim = (who, turf, status = "active", o = {}) =>
  q(`insert into public.turf_owners (turf_id, user_key, status, via, name, role, user_id, created_at, decided_at)
     values ($1, $2, $3, 'admin', $4, $5, $6, now() - make_interval(days => $7), now() - make_interval(days => $7))`,
    [T(turf), o.key ?? `p:${phone10(who)}`, status, PEOPLE[who][1], o.role ?? "owner", o.keyOnly ? null : P[who], o.days ?? 60]);
await claim("ASHA", 1);
await claim("PRIYA", 1, "active", { role: "manager" });
await claim("STAFF", 1, "active", { role: "staff" });
await claim("RAVI", 2);
await claim("RAVI", 3);
await claim("KIRAN", 4);
await claim("NEHA", 5);
await claim("OMAR", 6);
await claim("MEERA", 7);
// On a turf others run (so it is claimed): a claim rejected, one revoked, one still waiting.
await claim("ZOYA", 1, "rejected");
await claim("VIKRAM", 1, "revoked");
await claim("WAITS", 1, "pending");
await claim("DEV", 9);
await claim("ISHA", 10);
await claim("FARAH", 11);
await claim("LATE", 14);
// Claims kept by a key alone (from before claims named the account): one whose key opens Nikhil's account now, as
// slots_guard lets that sign-in mark; one whose key opens no account at all.
await claim("KEYED", 13, "active", { keyOnly: true });
await claim("KEYED", 13, "active", { keyOnly: true, key: "p:9000000999" });
eq((await q(`select id from public.turfs where claimed order by id`)).map((r) => r.id), [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 13, 14].map(T), "turfs.claimed follows the active claims (the real trigger)");
// A turf with an active claim row whose claimed mark is off (it can't be, by that trigger: the rule is checked all the same).
await q(`insert into public.turfs (id, name, slug, city, is_active, owner_phone) values ($1, 'Unmarked Arena', 'unmarked-arena', 'pune', true, '9000000215')`, [T(15)]);
await claim("WAITS", 15);
await q(`alter table public.turf_owners disable trigger turf_owners_sync_claimed`);
await q(`update public.turfs set claimed = false where id = $1`, [T(15)]);
await q(`alter table public.turf_owners enable trigger turf_owners_sync_claimed`);

// Bounced, switched off, all off: set before the file runs, with the email functions as they are.
eq((await rpc("email_suppress", [KEY, address("NEHA"), "bounce"])).r, "ok", "Neha's address bounced");
eq((await rpc("email_unsubscribe", [KEY, P.MEERA, "all"])).r, "ok", "Meera turned every TapTurf email off, before the file");
eq((await rpc("email_prefs_set", [KEY, P.LATE, null, null, false])).r, "ok", "Leela has a switches row from before the file (reminders off)");

/* ---------------- the file, twice ---------------- */
await db.exec(sql);
await db.exec(sql);
passed++;

// Omar turns his switch off at once (it is on until then).
eq(await rpc("slot_reminder_pref_set", [KEY, P.OMAR, false]), { r: "ok", owner: true, slots: false }, "Omar turns slot reminders off (the link in the email, the Me tab or myTapturf)");

/* ---------------- what it made ---------------- */
eq(await q(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'private' and table_name = 'email_prefs' and column_name = 'slots'`),
  [{ column_name: "slots", data_type: "boolean", is_nullable: "NO", column_default: "true" }], "one column: private.email_prefs.slots, on until turned off");
eq((await one(`select md5(prosrc) m from pg_proc where proname = 'email_job'`)).m, NEW_MD5, "email_job is the body the header says it becomes");
eq(await q(`select jobname, schedule, command, active from cron.job where jobname = 'slot-reminders'`),
  [{ jobname: "slot-reminders", schedule: "30 3 * * *", command: "select private.slot_reminders_run()", active: true }], "one job, 'slot-reminders', daily at 03:30 UTC (the file ran twice)");
ok((await q(`select jobname from cron.job`)).map((j) => j.jobname).includes("email-flush"), "beside the jobs from before (email-flush sends it, as every email)");
for (const t of ["email_prefs", "email_outbox"]) {
  const p = await one(`select has_table_privilege('anon', c.oid, 'select,insert,update') a, has_table_privilege('authenticated', c.oid, 'select,insert,update') u, c.relrowsecurity r
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'private' and c.relname = $1`, [t]);
  eq([p.a, p.u, p.r], [false, false, true], `private.${t}: still closed to anon and authenticated, row level security on`);
}
const NEW_FNS = [...sql.matchAll(/create or replace function ((?:public|private)\.[a-z_0-9]+)\(/g)].map((m) => m[1]);
eq(NEW_FNS.filter((f) => f.startsWith("public.")).sort(), ["public.slot_reminder_pref", "public.slot_reminder_pref_set"], "two public functions");
for (const f of NEW_FNS) {
  const [schema, name] = f.split(".");
  const rows = await q(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u, has_function_privilege('public', p.oid, 'execute') pub,
      p.prosecdef def, coalesce(array_to_string(p.proconfig, ','), '') cfg
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2`, [schema, name]);
  eq(rows.length, 1, `${f}: one function of that name`);
  const r = rows[0];
  if (schema === "public") eq([r.a, r.u, r.pub, r.def], [true, true, false, true], `${f}: for anon and authenticated (the key is the gate), not PUBLIC`);
  else eq([r.a, r.u, r.pub], [false, false, false], `${f}: nobody but its owner may call it`);
  ok(/search_path=("")?(,|$)/.test(r.cfg), `${f}: an empty search_path`);
}

/* ---------------- the constants, and 9 AM in India ---------------- */
const TS = fs.readFileSync(path.join(ROOT, "lib/email/slotReminder.ts"), "utf8");
const tsConst = (name) => Number(new RegExp(`^export const ${name} = (\\d+);$`, "m").exec(TS)?.[1] ?? NaN);
const C = await one(`select private.slot_reminder_every_days() as "every", private.slot_reminder_stale_hours() as "stale", private.slot_reminder_max() as "max", private.slot_reminder_hour() as "hour",
  private.slot_reminder_asks_days() as "asks", private.slot_reminder_turfs_max() as "turfs", private.slot_reminder_late_hours() as "late"`);
eq(C, { every: 2, stale: 48, max: 5, hour: 9, asks: 7, turfs: 5, late: 12 }, "every 2 days, 48 hours, 5 in a row, 9 AM, 7 days of asks, 5 turfs, 12 hours");
eq([tsConst("EVERY_DAYS"), tsConst("STALE_HOURS"), tsConst("MAX_IN_A_ROW"), tsConst("SEND_HOUR_IST"), tsConst("ASKS_DAYS"), tsConst("TURFS_MAX"), tsConst("LATE_HOURS")],
  [C.every, C.stale, C.max, C.hour, C.asks, C.turfs, C.late], "lib/email/slotReminder.ts has the same seven");
{
  const [mm, hh] = (await one(`select schedule from cron.job where jobname = 'slot-reminders'`)).schedule.split(" ").map(Number);
  eq((hh * 60 + mm + 330) % 1440, C.hour * 60, "the job's time in UTC is 9:00 AM in India");
  eq((await one(`select extract(hour from (('2026-12-01 ' || $1 || ':' || $2 || ':00+00')::timestamptz at time zone 'Asia/Kolkata'))::int h`, [hh, mm])).h, 9, "as Postgres reads it");
}

/* ---------------- a page with a number: the app's rule, row by row ---------------- */
{
  const cases = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/my/pageNumber.cases.json"), "utf8")).cases;
  ok(cases.length >= 25, "the shared table");
  for (const c of cases) {
    const r = await one(`select private.turf_page_has_number($1, $2::jsonb, $3, $4) has`, [c.owner_phone, c.contact_info === null ? null : JSON.stringify(c.contact_info), c.landline_phone, c.whatsapp_phone]);
    eq(r.has, c.has, `turf_page_has_number: ${c.why}`);
  }
}

/* ---------------- who may be reminded is who may mark: private.slots_guard, turf by turf ---------------- */
// Every turf's slots are out of date here, and every claim is old, so the turfs an account would be reminded about
// are the ones it may mark that are listed and have a number.
{
  const now = new Date().toISOString();
  for (const who of Object.keys(PEOPLE)) {
    const mine = (await q(`select turf_id from private.slot_reminder_turfs($1, $2) order by 1`, [P[who], now])).map((r) => r.turf_id);
    const guard = [];
    for (const [i, , , phone] of TURFS) {
      // The site owner signs in with Google (the address is his key); everyone else with their number.
      const err = who === "SITE"
        ? await (async () => {
            await q(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ email: ADMIN_EMAIL, app_metadata: { providers: ["google"] }, amr: [{ method: "oauth" }] })]);
            try { return (await one(`select private.slots_guard(null, $1) e`, [T(i)])).e; } finally { await q(`select set_config('request.jwt.claims', '', false)`); }
          })()
        : (await one(`select private.slots_guard($1, $2) e`, [`phone:${phone10(who)}`, T(i)])).e;
      if (err === null && phone) guard.push(T(i));
    }
    eq(mine, guard, `${PEOPLE[who][1].split(" ")[0]}: reminded about exactly the turfs slots_guard lets them mark (${guard.length})`);
  }
  eq((await q(`select turf_id from private.slot_reminder_turfs($1, $2)`, [P.SITE, now])).length, 0, "the site owner's shortcut opens every turf and earns no reminder");
  ok((await one(`select public._can_manage($1, $2) m`, [ADMIN_KEYS[0], T(1)])).m === true, "(the shortcut does open a turf: _can_manage says yes)");
  eq((await q(`select turf_id from private.slot_reminder_turfs($1, $2)`, [P.STAFF, now])).length, 1, "staff may mark slots, so staff are reminded (any role)");
  eq((await q(`select turf_id from private.slot_reminder_turfs($1, $2)`, [P.KEYED, now])).map((r) => r.turf_id), [T(13)], "a claim kept by a key alone: the account that key opens now");
  eq((await q(`select turf_id from private.slot_reminder_turfs($1, $2)`, [P.PLAYER, now])).length, 0, "someone with no claim: none");
  eq((await q(`select turf_id from private.slot_reminder_turfs(null, $1)`, [now])).length, 0, "no account: none");
}

/* ---------------- day 0, 9 AM: who gets one ---------------- */
const run = async (iso) => (await one(`select private.slot_reminders_run($1) r`, [iso])).r;
const rows = (where = "true", p = []) => q(`select o.user_id, o.kind, o.dedupe_key, o.refs, o.status, o.last_error, o.created_at, o.next_attempt_at from private.email_outbox o
  where o.refs ->> 'about' = 'slots' and ${where} order by o.created_at, o.user_id`, p);
const names = async (where = "true", p = []) => (await rows(where, p)).map((r) => Object.keys(P).find((k) => P[k] === r.user_id)).sort();
// Kings Turf Arena was last updated 3 days before; Farah's Five 47 hours before; the rest never.
await q(`insert into private.turf_availability (turf_id, updated_at) values ($1, $2), ($3, $4)`, [T(1), hoursBefore(at(0), 72), T(11), hoursBefore(at(0), 47)]);
// Gita's claim was approved 10 hours before; Leela's exactly 48.
await claim("GITA", 12, "active", { days: 0 });
await q(`update public.turf_owners set decided_at = $2, created_at = $2 where user_id = $1`, [P.GITA, hoursBefore(at(0), 10)]);
await q(`update public.turf_owners set decided_at = $2 where user_id = $1`, [P.LATE, hoursBefore(at(0), 48)]);
eq((await q(`select turf_id from private.slot_reminder_turfs($1, $2)`, [P.GITA, hoursBefore(at(0), -37.9)])).length, 0, "a new claim: nothing for its first 48 hours (47.9 hours in)");
eq((await q(`select turf_id from private.slot_reminder_turfs($1, $2)`, [P.GITA, hoursBefore(at(0), -38)])).map((r) => r.turf_id), [T(12)], "and from 48 hours on, like any other");
eq((await q(`select turf_id from private.slot_reminder_turfs($1, $2)`, [P.FARAH, at(0)])).length, 0, "updated 47 hours ago: nothing");
eq((await q(`select turf_id from private.slot_reminder_turfs($1, $2)`, [P.FARAH, hoursBefore(at(0), -1)])).map((r) => r.turf_id), [T(11)], "updated 48 hours ago: it needs an update");

eq(await run(at(0, "08:59:59")), { r: "not_now" }, "8:59 AM in India: not now");
eq(await run(at(0, "10:00:00")), { r: "not_now" }, "10 AM: not now");
eq(await run(at(0, "21:00:00")), { r: "not_now" }, "9 PM: not now (the hour is India's, in 24)");
eq((await rows()).length, 0, "and nothing is queued at any other hour");
eq(await run(at(0)), { r: "ok", queued: 6, stopped: 0, capped: 0 }, "9 AM: six accounts are due");
eq(await names(), ["ASHA", "KEYED", "LATE", "PRIYA", "RAVI", "STAFF"], "the owner, the manager and the staff of Kings Turf Arena, Ravi (two turfs), Leela (claimed exactly 48 hours ago) and Nikhil (his key's claim)");
for (const [who, why] of Object.entries({
  KIRAN: "no email Google confirmed", NEHA: "an address that bounced", OMAR: "the switch off", MEERA: "every TapTurf email turned off (before the file)", ZOYA: "a rejected claim", VIKRAM: "a revoked claim",
  WAITS: "a claim still waiting (and a turf not marked claimed)", DEV: "a turf that is not listed", ISHA: "a page with no number to call or WhatsApp", FARAH: "slots updated 47 hours ago",
  GITA: "a claim made 10 hours ago", SITE: "the site owner's shortcut, no claim", PLAYER: "no claim at all",
})) eq((await rows(`o.user_id = $1`, [P[who]])).length, 0, `never: ${why}`);
eq((await q(`select count(*)::int n from private.email_outbox`))[0].n, 6, "and nobody else: six rows in the outbox (the key that opens no account reminds nobody)");
// The rest of the fake days are about these six: Farah keeps her slots up to date, and Gita's claim is taken back.
await q(`update private.turf_availability set updated_at = $2 where turf_id = $1`, [T(11), at(60)]);
await q(`update public.turf_owners set status = 'revoked' where user_id = $1`, [P.GITA]);
{
  const [r] = await rows(`o.user_id = $1`, [P.ASHA]);
  eq([r.kind, r.dedupe_key, r.status, r.refs], ["reminder", `slot_reminder:${P.ASHA}:${day(0)}`, "queued", { about: "slots", n: 1, last: false, turf_ids: [T(1)] }],
    "the row: kept as a reminder about slots, its key the account and the India day, the 1st in a row");
  eq([new Date(r.created_at).toISOString(), new Date(r.next_attempt_at).toISOString()], [at(0), at(0)], "due at once");
  const [two] = await rows(`o.user_id = $1`, [P.RAVI]);
  eq(two.refs.turf_ids, [T(2), T(3)], "one email for Ravi's two turfs, by name");
  eq((await rows(`o.user_id = $1`, [P.RAVI])).length, 1, "one row, not two");
}
// Twice in a minute: nothing twice.
eq(await run(at(0, "09:00:40")), { r: "ok", queued: 0, stopped: 0, capped: 0 }, "the job again in the same minute queues nothing");
eq(await run(at(0, "09:59:59")), { r: "ok", queued: 0, stopped: 0, capped: 0 }, "nor later in the hour");
eq((await rows()).length, 6, "still six rows");
// Even with the spacing out of the way, the day's key lets one row in.
{
  const before = (await q(`select count(*)::int n from private.email_outbox`))[0].n;
  await q(`insert into private.email_outbox (user_id, kind, dedupe_key, refs) values ($1, 'reminder', $2, '{}') on conflict (dedupe_key) do nothing`, [P.ASHA, `slot_reminder:${P.ASHA}:${day(0)}`]);
  eq((await q(`select count(*)::int n from private.email_outbox`))[0].n, before, "(one row per account and India day, by its key)");
}
const sent = (where = "true", p = []) => q(`update private.email_outbox o set status = 'sent', sent_at = o.created_at where o.refs ->> 'about' = 'slots' and o.status = 'queued' and ${where}`, p);
await sent();

/* ---------------- one every 2 days, then it stops by itself ---------------- */
const asha = async () => (await rows(`o.user_id = $1`, [P.ASHA])).map((r) => [Math.round((new Date(r.created_at).getTime() - Date.parse(at(0))) / 86400000), r.refs.n, r.refs.last]);
eq((await run(at(1))).queued, 0, "day 1: nobody (one went yesterday)");
// Day 2, and the job fires 5 seconds EARLIER in its minute than on day 0: 47 hours 59 minutes 55 seconds on. Still due.
{
  const r = await run(at(2, "09:00:00"));
  eq(r.queued, 6, "day 2: all six again, though it is 5 seconds short of 48 hours (India days are counted)");
  await sent();
}
eq((await run(at(3))).queued, 0, "day 3: nobody");
for (const d of [4, 6, 8]) {
  eq((await run(at(d, "09:00:17"))).queued, 6, `day ${d}`);
  await sent();
  eq((await run(at(d + 1))).queued, 0, `day ${d + 1}: nobody`);
}
eq(await asha(), [[0, 1, false], [2, 2, false], [4, 3, false], [6, 4, false], [8, 5, true]], "Asha's five: days 0, 2, 4, 6, 8, and the 5th is marked the last");
eq(await run(at(10)), { r: "ok", queued: 0, stopped: 6, capped: 0 }, "day 10: none, all six have had 5 in a row");
eq((await run(at(12))).queued + (await run(at(14))).queued + (await run(at(20))).queued, 0, "days 12, 14, 20: still none");
eq((await rows()).length, 30, "30 rows in all: 5 each");

// Asha updates on day 20 at noon. Fresh, then 45 hours old: nothing. 69 hours old: it starts again at 1.
await q(`update private.turf_availability set updated_at = $2 where turf_id = $1`, [T(1), at(20, "12:00:00")]);
eq((await run(at(21))).queued, 0, "day 21: updated yesterday, nothing");
eq((await run(at(22))).queued, 0, "day 22: 45 hours since the update, nothing");
eq(await run(at(23)), { r: "ok", queued: 3, stopped: 3, capped: 0 }, "day 23: 69 hours since: Asha, Priya and Imran again (Ravi, Leela and Nikhil stay stopped)");
eq((await asha()).at(-1), [23, 1, false], "and the count starts again at 1");
await sent();
// Ravi marks one of his two turfs for the first time: after it goes out of date, his reminders start again, for both.
await q(`insert into private.turf_availability (turf_id, updated_at) values ($1, $2)`, [T(2), at(23, "12:00:00")]);
eq((await run(at(25))).queued, 3, "day 25: Kings Turf Arena's three, the 2nd; Ravi's Dribble Den is 45 hours old and his other turf stays stopped");
await sent();
{
  const r = await run(at(26));
  eq(r, { r: "ok", queued: 1, stopped: 2, capped: 0 }, "day 26: Ravi again, 69 hours after he marked Dribble Den (Leela and Nikhil still stopped)");
  const last = (await rows(`o.user_id = $1`, [P.RAVI])).at(-1);
  eq(last.refs, { about: "slots", n: 1, last: false, turf_ids: [T(2), T(3)] }, "the 1st in a row, about both turfs");
  await sent();
}
// From here Ravi keeps both his turfs up to date, and an owner who does gets nothing at all.
await q(`insert into private.turf_availability (turf_id, updated_at) values ($1, $3), ($2, $3) on conflict (turf_id) do update set updated_at = excluded.updated_at`, [T(2), T(3), at(60)]);
await q(`update private.turf_availability set updated_at = $2 where turf_id = $1`, [T(1), at(27, "08:00:00")]);
eq((await run(at(27))).queued + (await run(at(28))).queued, 0, "updated within 48 hours: nothing on days 27 and 28, for Kings Turf Arena's three or for Ravi");

/* ---------------- a reminder that never went is not counted ---------------- */
// Mode off: queued as every email is, skipped as it comes due (mode_off), never sent later, and not one of the 5.
await q(`update private.email_outbox set status = 'expired' where status in ('queued', 'sending') and refs ->> 'about' is distinct from 'slots'`);
await q(`update private.email_settings set value = 'off' where name = 'mode'`);
const flush = async (iso) => (await one(`select private.email_flush($1) r`, [iso])).r;
{
  eq((await run(at(29))).queued, 3, "day 29, emails off: Kings Turf Arena's three are queued as any email is");
  const f = await flush(at(29, "09:01:00"));
  eq([f.r, f.mode_skipped], ["idle", 3], "and skipped when they come due, with nothing posted");
  eq((await rows(`o.created_at = $1`, [at(29)])).map((r) => [r.status, r.last_error]), Array(3).fill(["skipped", "mode_off"]), "skipped as mode_off");
  eq((await run(at(30))).queued, 0, "day 30: nothing (one was queued yesterday, whatever became of it)");
  await q(`update private.email_settings set value = 'on' where name = 'mode'`);
  eq((await run(at(31))).queued, 3, "day 31, emails on again");
  eq((await asha()).at(-1), [31, 1, false], "the 1st in a row: the skipped one was never one of the 5");
  await sent();
}
// Test: only me. Everyone's but the site owner's accounts are skipped as test_mode.
await claim("SITE", 8);
await q(`update public.turf_owners set decided_at = $2, created_at = $2 where user_id = $1`, [P.SITE, hoursBefore(at(31), 100)]);
await q(`update private.email_settings set value = 'owner_only' where name = 'mode'`);
{
  const r = await run(at(33));
  eq(r.queued, 4, "day 33, test mode: Kings Turf Arena's three and the site owner, who now holds a claim of his own");
  await flush(at(33, "09:01:00"));
  const got = await rows(`o.created_at = $1`, [at(33)]);
  eq(got.filter((x) => x.user_id !== P.SITE).map((x) => [x.status, x.last_error]), Array(3).fill(["skipped", "test_mode"]), "everyone else's: skipped as test_mode");
  eq(got.filter((x) => x.user_id === P.SITE).map((x) => x.status), ["queued"], "the site owner's own stays to be sent");
  eq((await q(`select count(*)::int n from net.posts where url = 'https://www.tapturf.in/api/email/dispatch'`))[0].n >= 1, true, "and the flush posts to the send route for it, as for any email");
  await q(`update private.email_settings set value = 'on' where name = 'mode'`);
  await sent();
  await q(`update public.turf_owners set status = 'revoked' where user_id = $1`, [P.SITE]);
}

/* ---------------- the 6 a day cap ---------------- */
{
  await q(`insert into private.email_outbox (user_id, kind, dedupe_key, refs, status, created_at)
    select $1, 'reminder', 'cap-test:' || g, '{}'::jsonb, 'sent', $2::timestamptz - interval '2 hours' from generate_series(1, 6) g`, [P.ASHA, at(35)]);
  eq(await run(at(35)), { r: "ok", queued: 2, stopped: 2, capped: 1 }, "day 35: Asha has had 6 emails in 24 hours, so hers waits; Priya and Imran get theirs");
  eq((await rows(`o.created_at = $1 and o.user_id = $2`, [at(35), P.ASHA])).length, 0, "no row for Asha");
  await sent();
  eq((await run(at(36))).queued, 1, "day 36: hers goes (the six are a day old; nothing of hers was queued yesterday)");
  eq((await asha()).at(-1), [36, 2, false], "the 2nd in a row");
  await sent();
}

/* ---------------- what the email is handed, read when it is sent ---------------- */
// From here the real clock: email_claim and email_job read now().
await q(`update private.email_outbox set status = 'expired' where status in ('queued', 'sending')`);
const realNine = (() => {
  // The latest 9:00 AM in India that has passed.
  const ist = new Date(Date.now() + 330 * 60000);
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 9, 0, 3) - 330 * 60000);
  return new Date(d.getTime() > Date.now() ? d.getTime() - 86400000 : d.getTime()).toISOString();
})();
// Rows from the fake days above are moved well back, so today's run is spaced from them.
await q(`update private.email_outbox set created_at = created_at - interval '40 days' where refs ->> 'about' = 'slots' or dedupe_key like 'cap-test:%'`);
await q(`update private.turf_availability set updated_at = now() - interval '75 hours' where turf_id = $1`, [T(1)]);
await q(`update private.turf_availability set updated_at = now() - interval '11 days' where turf_id = $1`, [T(2)]);
await q(`delete from private.turf_availability where turf_id = $1`, [T(3)]); // Ravi's other turf: never marked
// Asks at Kings Turf Arena: 4 in the last 7 India days, 1 before them, and 2 at another turf.
const istMidnight = (daysAgo) => new Date(Date.parse(`${new Date(Date.now() + 330 * 60000 - daysAgo * 86400000).toISOString().slice(0, 10)}T00:00:00+05:30`)).toISOString();
for (const [turf, when] of [[1, new Date().toISOString()], [1, istMidnight(0)], [1, istMidnight(3)], [1, istMidnight(6)], [1, new Date(Date.parse(istMidnight(6)) - 1000).toISOString()], [2, istMidnight(8)], [5, new Date().toISOString()]]) {
  await q(`insert into private.slot_asks (turf_id, slot_date, slot_hour, minutes, created_at) values ($1, current_date, 19, 60, $2)`, [T(turf), when]);
}
{
  const r = await run(realNine);
  eq(r, { r: "ok", queued: 4, stopped: 2, capped: 0 }, "today's run: Kings Turf Arena's three and Ravi");
  // Sent now, not hours after 9 (the check may run at any time of day).
  await q(`update private.email_outbox set created_at = now(), next_attempt_at = now() where status = 'queued' and refs ->> 'about' = 'slots'`);
  // Two other emails due beside them: a Welcome, and a game reminder (the same outbox kind, about a game).
  await q(`insert into public.games (id, creator_id, turf_id, title, sport, max_players, date, start_time, end_time, price_per_player, host_name)
    values ($1, $2, $3, 'Football', 'Football', 10, (now() at time zone 'Asia/Kolkata')::date + 1, '19:00', '20:00', 150, 'Kabir Mehta')`, ["dddddddd-dddd-4ddd-8ddd-000000000001", P.PLAYER, T(1)]);
  await q(`insert into public.game_participants (game_id, user_id) values ($1, $2)`, ["dddddddd-dddd-4ddd-8ddd-000000000001", P.PLAYER]);
  await q(`insert into private.email_outbox (user_id, kind, dedupe_key, refs) values ($1, 'welcome', 'welcome:test', '{}'),
    ($1, 'reminder', 'reminder:test', jsonb_build_object('game_id', $2::text, 'when', 'tomorrow'))`, [P.PLAYER, "dddddddd-dddd-4ddd-8ddd-000000000001"]);
  // Before the claim: Imran turned the switch off, and Priya's address bounced.
  eq((await rpc("slot_reminder_pref_set", [KEY, P.STAFF, false])).slots, false, "Imran turns slot reminders off after his was queued");
  await rpc("email_suppress", [KEY, address("PRIYA"), "complaint"]);

  const c = await rpc("email_claim", [KEY, 20]);
  eq(c.r, "ok", "the send route's claim");
  const job = (who) => c.jobs.find((j) => j.user_id === P[who] && j.kind === "slot_reminder");
  const a = job("ASHA");
  ok(a, "Asha's is handed to the route");
  eq([a.kind, a.group, a.to, a.name, a.path, a.n, a.last, a.more, a.attempt], ["slot_reminder", "slots", address("ASHA"), "Asha", `/my/turf/${T(1)}`, 1, false, 0, 1],
    "its kind and group are its own, to her confirmed address, her first name, her turf's Slots tab, the 1st in a row");
  eq(a.turfs.map((t) => [t.id, t.name, t.asks]), [[T(1), "Kings Turf Arena", 4]], "the turf by name, with the 4 asks of the last 7 India days (not the one before them, not another turf's)");
  eq(Math.round((Date.now() - Date.parse(a.turfs[0].updated_at)) / 3600000), 75, "and when it was last updated");
  ok(Math.abs(Date.parse(a.now) - Date.now()) < 60000, "and the time the job was written");
  ok(!JSON.stringify(a).includes("900000"), "no number of anyone is in it");
  const rv = job("RAVI");
  eq([rv.path, rv.turfs.map((t) => [t.name, t.updated_at === null, t.asks])], ["/my?list=1", [["Dribble Den", false, 0], ["Dribble Den Box", true, 0]]], "Ravi's: both turfs, by name, one never marked, no asks in 7 days (the one 8 days ago is not counted)");
  eq(c.jobs.filter((j) => j.user_id === P.PLAYER).map((j) => [j.kind, j.group, !!j.game]).sort(), [["reminder", "reminders", true], ["welcome", "account", false]], "the Welcome and the game reminder are written exactly as before");
  eq((await rows(`o.user_id = any($1) and o.created_at > now() - interval '1 hour'`, [[P.STAFF, P.PRIYA]])).map((x) => [x.status, x.last_error]).sort(), [["skipped", "off"], ["skipped", "suppressed"]],
    "the switch turned off since: skipped as off; an address that complained since: skipped as suppressed");
  eq((await rows(`o.user_id = $1 and o.created_at > now() - interval '1 hour'`, [P.ASHA]))[0].status, "sending", "leased to the route");
  const rep = await rpc("email_report", [KEY, JSON.stringify(c.jobs.map((j) => ({ id: j.id, result: "sent", provider_id: "re_test" })))]);
  eq(rep.r, "ok", "the route reports");
  eq((await rows(`o.user_id = $1 and o.created_at > now() - interval '1 hour'`, [P.ASHA]))[0].status, "sent", "sent");
}
{
  // Skipped when it would no longer be true, or too late in the day.
  const again = async (who, o = {}) => {
    const id = (await one(`insert into private.email_outbox (user_id, kind, dedupe_key, refs, created_at, next_attempt_at)
      values ($1, 'reminder', $2, $3, now() - make_interval(hours => $4), now()) returning id`,
      [P[who], `slot_reminder:${P[who]}:test-${Math.random()}`, JSON.stringify({ about: "slots", n: o.n ?? 1, last: !!o.last, turf_ids: [] }), o.hours ?? 0])).id;
    const c = await rpc("email_claim", [KEY, 20]);
    const row = await one(`select status, last_error from private.email_outbox where id = $1`, [id]);
    return { job: c.jobs.find((j) => j.id === id), row };
  };
  const fifth = await again("ASHA", { n: 5, last: true });
  eq([fifth.job?.n, fifth.job?.last], [5, true], "the 5th is handed over as the last");
  eq((await again("ASHA", { hours: 11 })).row.status, "sending", "11 hours after it was queued: still sent");
  eq((await again("ASHA", { hours: 13 })).row, { status: "skipped", last_error: "late" }, "13 hours after: never sent (not at night)");
  await q(`update private.turf_availability set updated_at = now() where turf_id = $1`, [T(1)]);
  eq((await again("ASHA")).row, { status: "skipped", last_error: "updated" }, "updated since it was queued: skipped");
  await q(`update private.turf_availability set updated_at = now() - interval '3 days' where turf_id = $1`, [T(1)]);
  await q(`update public.turf_owners set status = 'revoked' where user_id = $1`, [P.ASHA]);
  eq((await again("ASHA")).row, { status: "skipped", last_error: "updated" }, "her claim revoked since: nothing of hers needs an update, skipped");
  await q(`update public.turf_owners set status = 'active' where user_id = $1`, [P.ASHA]);
  await q(`update private.email_settings set value = 'off' where name = 'mode'`);
  eq((await again("ASHA")).row, { status: "skipped", last_error: "mode_off" }, "emails off: skipped as mode_off, as every email");
  await q(`update private.email_settings set value = 'on' where name = 'mode'`);
  // More than five turfs: the first five by name, and how many more.
  for (let i = 21; i <= 26; i++) {
    await q(`insert into public.turfs (id, name, slug, city, is_active, owner_phone) values ($1, $2, $3, 'pune', true, '9000000299')`, [T(i), `Arena ${i}`, `arena-${i}`]);
    await claim("ASHA", i);
  }
  const many = (await again("ASHA")).job;
  eq([many.path, many.turfs.map((t) => t.name), many.more], ["/my?list=1", ["Arena 21", "Arena 22", "Arena 23", "Arena 24", "Arena 25"], 2], "seven turfs: five listed by name, 2 more");
  await q(`update public.turf_owners set status = 'revoked' where user_id = $1 and turf_id <> $2`, [P.ASHA, T(1)]);
}

/* ---------------- the switch ---------------- */
eq(await rpc("slot_reminder_pref", ["wrong-key", P.ASHA]), { r: "unavailable" }, "slot_reminder_pref: the server key first");
eq(await rpc("slot_reminder_pref_set", ["wrong-key", P.ASHA, false]), { r: "unavailable" }, "slot_reminder_pref_set: the server key first");
eq(await rpc("slot_reminder_pref", [KEY, U(999)]), { r: "bad" }, "an account that is not there");
eq(await rpc("slot_reminder_pref_set", [KEY, P.ASHA, null]), { r: "bad" }, "on or off, nothing else");
eq(await rpc("slot_reminder_pref", [KEY, P.ASHA]), { r: "ok", owner: true, slots: true }, "an owner: on until turned off");
eq(await rpc("slot_reminder_pref", [KEY, P.PLAYER]), { r: "ok", owner: false, slots: true }, "someone who runs no turf: not an owner (the app shows no switch)");
eq(await rpc("slot_reminder_pref", [KEY, P.KEYED]), { r: "ok", owner: true, slots: true }, "a claim kept by a key that opens the account: an owner");
eq(await rpc("slot_reminder_pref", [KEY, P.STAFF]), { r: "ok", owner: true, slots: false }, "staff are asked too, and Imran's is off (he turned it off above)");
eq(await rpc("slot_reminder_pref", [KEY, P.ZOYA]), { r: "ok", owner: false, slots: true }, "a rejected claim: not an owner");
eq(await rpc("slot_reminder_pref", [KEY, P.MEERA]), { r: "ok", owner: true, slots: false }, "all off before the file: off");
eq((await one(`select slots from private.email_prefs where user_id = $1`, [P.MEERA])).slots, false, "(set off once by the file)");
eq((await one(`select slots, reminders from private.email_prefs where user_id = $1`, [P.LATE])), { slots: true, reminders: false }, "a row from before the file with only game reminders off: slot reminders on");
eq(await one(`select requests, changes, reminders, slots, unsubscribed_all_at from private.email_prefs where user_id = $1`, [P.OMAR]),
  { requests: true, changes: true, reminders: true, slots: false, unsubscribed_all_at: null }, "Omar's switch, off since the start: only that kind, the other three stay on");
eq((await rpc("email_prefs_get", [KEY, P.OMAR])).reminders, true, "and the Me tab's read of the three is as before");
eq((await rows(`o.user_id = $1`, [P.OMAR])).length, 0, "and through all of the above he was never queued one, though his turf was never marked");
eq(await rpc("slot_reminder_pref_set", [KEY, P.OMAR, true]), { r: "ok", owner: true, slots: true }, "he turns it on again");
{
  await run(realNine);
  const mine = await rows(`o.user_id = $1`, [P.OMAR]);
  eq(mine.map((x) => [x.status, x.refs.n, x.refs.turf_ids]), [["queued", 1, [T(6)]]], "and the next 9 AM he is reminded");
  await q(`update private.email_outbox set status = 'sent' where status = 'queued'`);
}
// "All TapTurf emails" off turns it off too, and turning another switch on later does not bring it back.
eq((await rpc("email_unsubscribe", [KEY, P.RAVI, "all"])).r, "ok", "Ravi turns every TapTurf email off (the Welcome email's link, as it always worked)");
eq(await rpc("slot_reminder_pref", [KEY, P.RAVI]), { r: "ok", owner: true, slots: false }, "slot reminders are off with them");
eq((await rpc("email_prefs_set", [KEY, P.RAVI, null, null, true])).reminders, true, "he turns game reminders back on");
eq(await one(`select reminders, slots, unsubscribed_all_at from private.email_prefs where user_id = $1`, [P.RAVI]), { reminders: true, slots: false, unsubscribed_all_at: null }, "slot reminders stay off until he turns them on himself");
eq((await rpc("email_unsubscribe", [KEY, P.DEV, "reminders"])).r, "ok", "(game reminders off for Dev)");
eq(await rpc("slot_reminder_pref", [KEY, P.DEV]), { r: "ok", owner: true, slots: true }, "turning off game reminders leaves slot reminders on");
eq((await rpc("email_unsubscribe", [KEY, P.MEERA, "all"])).r, "ok", "(all off again for someone already all off)");
eq(await rpc("slot_reminder_pref_set", [KEY, P.MEERA, true]), { r: "ok", owner: true, slots: true }, "turning slot reminders on undoes all off, as turning any switch on does");
eq((await one(`select unsubscribed_all_at from private.email_prefs where user_id = $1`, [P.MEERA])).unsubscribed_all_at, null, "(all off is cleared; the other three stay as she left them)");
await asRole("anon", async () => {
  eq((await rpc("slot_reminder_pref", [KEY, P.ASHA])).r, "ok", "the app's role may call it with the key");
  await assert.rejects(q(`select private.slot_reminders_run()`), /permission denied/, "and never the job");
  passed++;
  await assert.rejects(q(`select * from private.email_prefs`), /permission denied/, "nor read the switches");
  passed++;
});

/* ---------------- the file again changes nothing ---------------- */
{
  const snap = async () => ({
    fns: await q(`select n.nspname || '.' || p.proname f, md5(p.prosrc) m from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private') order by 1, 2`),
    outbox: await q(`select id, user_id, kind, dedupe_key, refs, status, last_error, created_at from private.email_outbox order by id`),
    prefs: await q(`select * from private.email_prefs order by user_id`),
    jobs: await q(`select jobid, jobname, schedule, command, active from cron.job order by jobid`),
    triggers: await q(`select tgname from pg_trigger where tgrelid = 'private.email_prefs'::regclass and not tgisinternal order by 1`),
    cols: await q(`select column_name from information_schema.columns where table_schema = 'private' and table_name in ('email_prefs', 'email_outbox') order by table_name, ordinal_position`),
  });
  // The job stopped by hand, as the header says how.
  await q(`select cron.alter_job((select j.jobid from cron.job j where j.jobname = 'slot-reminders'), active := false)`);
  const before = await snap();
  eq(before.triggers, [{ tgname: "email_prefs_all_off" }], "one trigger on private.email_prefs");
  eq(before.jobs.find((j) => j.jobname === "slot-reminders").active, false, "(the job, stopped by hand)");
  await db.exec(sql);
  eq(await snap(), before, "the file again: the functions, every outbox row, every switch, the jobs and the columns are as they were, and the job stays stopped");
  eq((await one(`select count(*)::int n from cron.job where jobname = 'slot-reminders'`)).n, 1, "one job, never a second");
}

await db.close();
console.log(`slot_reminders.check: ${passed} checks passed`);
