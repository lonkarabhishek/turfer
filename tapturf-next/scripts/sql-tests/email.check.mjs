// Applies 20261110_email.sql (twice) to an in-memory Postgres (PGlite) built by
// games_lockdown.db.mjs, with both games lockdown files, the repeats, the other
// venue and web push files applied first (as production is), private.game_start_at
// as 20261101_played_with.sql has it, and stand-ins for pg_cron, pg_net (records
// each post; can be made to fail) and private.email_proven (a test list of the
// accounts whose email Google confirmed: the real rule is 20261027_verified_tick.sql,
// which this file only calls). Checks: the file (additive, no destructive
// words, refuses without the files it needs and changes nothing then); game_update
// is production's body plus only the time-change lines; queueing (a confirmed email
// only, the switches, a bounced or complaining address, 6 a day, join requests for
// one game in 15 minutes make one email, venue and time in one save make one, a
// cancel makes the others moot, nothing for booking requests, claim decisions or a
// decline, and a notification is always made even when queueing fails); the clock
// in India time on a fake clock (the "tomorrow" reminder at 6 PM the day before,
// "in about 3 hours", each once, skipped for someone in the game under an hour or
// within an hour of the other; the waiting nudge at 2 hours, or 30 minutes when the
// game starts within 3 hours, once, never after the start, never for requests from
// before the file; Welcome once, only for accounts made after it, with a confirmed
// email); game_update's time change tells the players and the pending requests,
// never the host; the flush (nothing posted while idle; a post with the secret when
// one is due; no second post until the route answers or 10 minutes; a hold; leases
// that ran out, retries 1, 5, 30, 120 minutes then failed; expiry after 24 hours);
// claim (the address, what each email says, the skips and why); the switches and
// the link in an email; suppressions; every public function checks the server key;
// the tables and helpers are closed to the API roles; the two jobs. Never touches a
// real database. Made-up people and addresses only.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/email.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { KEY, makeDb } from "./games_lockdown.db.mjs";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261110_email.sql`;
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");

/* ---------------- the file itself ---------------- */
const sql = fs.readFileSync(FILE, "utf8");
ok(!/drop|delete|truncate/i.test(sql), "written without the words drop, delete and truncate (not even inside a word)");
ok(!/[—–]/.test(sql), "no em or en dashes");
ok(/^set local lock_timeout = '5s';$/m.test(sql), "waits 5 s at most for a lock");
ok(!/\b(revoke|grant)\b[^;]*\bon\s+(table\s+)?public\./i.test(sql), "changes no grant on a public table");
ok(!/(alter|create)\s+policy/i.test(sql), "makes or changes no policy");
eq([...sql.matchAll(/alter\s+table\s+([\w.]+)/gi)].map((m) => m[1]).filter((t) => !t.startsWith("private.")), [], "alters only its own private tables (row level security)");
{
  const gu = sql.indexOf("create or replace function public.game_update(");
  const rest = sql.slice(0, gu) + sql.slice(sql.indexOf("grant execute on function public.game_update", gu));
  ok(!/(insert\s+into|update)\s+public\.(users|games|game_requests|game_participants|turfs)\b/i.test(rest), "writes no user, game, request, player or turf row (game_update's own writes aside)");
}
ok(!/user_contact_emails/.test(sql.replace(/^--.*$/gm, "")), "never reads the typed emails");

// A function's body as Postgres keeps it (prosrc): the text between its dollar quotes.
const bodyOf = (text, name) => {
  const i = text.lastIndexOf(`create or replace function ${name}(`);
  assert.ok(i >= 0, `${name} is in the file`);
  const tag = /\$(\w*)\$/.exec(text.slice(i));
  const a = i + tag.index + tag[0].length;
  return text.slice(a, text.indexOf(tag[0], a));
};
const OTHER_VENUE = fs.readFileSync(`${M}/20261103_game_other_venue.sql`, "utf8");
const oldBody = bodyOf(OTHER_VENUE, "public.game_update");
const newBody = bodyOf(sql, "public.game_update");
eq(md5(oldBody), "2b3c117ecacd890462f3243d210d30b0", "production's game_update (md5 read 10 Nov 2026) is the body in 20261103_game_other_venue.sql");
ok(sql.includes("2b3c117ecacd890462f3243d210d30b0"), "the header names it");
{
  // Every line of the old body, in order, and the new lines only the time change's.
  const o = oldBody.split("\n");
  const n = newBody.split("\n");
  const added = [];
  let i = 0;
  for (const line of n) {
    if (i < o.length && line === o[i]) i++;
    else added.push(line);
  }
  eq(i, o.length, "game_update keeps every line of production's body, in order");
  ok(added.length === 18 && added[0] === "  v_host text;" && added[1].includes("20261110_email.sql") && added.at(-1) === "  end if;", `and adds only v_host and the time change block (${added.length} lines)`);
  ok(added.slice(1).every((l) => !/\breturn\b|v_moved|v_notified/.test(l)), "the added block returns nothing and leaves the venue notice alone");
}

const CRON = `create schema if not exists cron;
create table cron.jobs (name text primary key, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
  $$ insert into cron.jobs values (job_name, schedule, command) on conflict (name) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;`;
const NET = `create schema if not exists net;
create table net.posts (id bigserial primary key, url text, headers jsonb, body jsonb, timeout integer, at timestamptz default clock_timestamp());
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
  returns bigint language plpgsql as $$
declare v bigint;
begin
  if current_setting('test.net', true) = 'broken' then
    raise exception 'pg_net is down';
  end if;
  insert into net.posts (url, headers, body, timeout) values (url, headers, body, timeout_milliseconds) returning id into v;
  return v;
end;
$$;`;
// The confirmed emails: a list the tests fill (the real rule is 20261027_verified_tick.sql, called by name).
const PROVEN = `create table private.test_proven (user_id uuid primary key);
create function private.email_proven(p_user_id uuid) returns boolean language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from private.test_proven t where t.user_id = p_user_id) $$;
revoke all on function private.email_proven(uuid) from public, anon, authenticated;`;
const PLAYED = fs.readFileSync(`${M}/20261101_played_with.sql`, "utf8");
const START_AT = PLAYED.slice(PLAYED.indexOf("create or replace function private.game_start_at("),
  PLAYED.indexOf("\n", PLAYED.indexOf("revoke all on function private.game_start_at")));
eq(md5(bodyOf(START_AT, "private.game_start_at")), "870fe04f498b656d8c9435099fd8bfb9", "private.game_start_at as production runs it");
const FILES = ["20261030_games_lockdown.sql", "20261030_games_lockdown_step2.sql", "20261102_game_series.sql", "20261103_game_other_venue.sql", "20261102_web_push.sql"]
  .map((f) => fs.readFileSync(`${M}/${f}`, "utf8"));

{
  const bare = await makeDb(PGlite);
  await bare.exec(CRON + NET + PROVEN);
  await bare.exec(FILES[0]);
  await bare.exec(FILES[1]);
  await assert.rejects(bare.exec(sql), /email: apply 20261027_verified_tick\.sql/, "without the files it needs it refuses");
  passed++;
  eq((await bare.query(`select count(*)::int n from information_schema.tables where table_schema = 'private' and table_name like 'email%'`)).rows[0].n, 0, "and makes nothing");
  await bare.close();
}

const db = await makeDb(PGlite);
await db.exec(CRON + NET + PROVEN + START_AT + `\ninsert into private.app_secrets values ('revalidate', 'reval-secret');`);
for (const f of FILES) await db.exec(f);
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const asRole = async (role, fn) => {
  await q(`set role ${role}`);
  try { return await fn(); } finally { await q("reset role"); }
};
const ist = (d) => new Date(Date.now() + 330 * 60000 + d * 86400000).toISOString().slice(0, 10);
const atIst = (date, hhmm) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();
const minutes = (m) => new Date(Date.now() + m * 60000).toISOString();

// People (made up). Confirmed emails: Asha, Ravi, Priya, Omar, Meera, Neha's typed one is not.
const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const T = (i) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`;
const ASHA = U(1), RAVI = U(2), PRIYA = U(3), KIRAN = U(4), NEHA = U(5), OMAR = U(6), MEERA = U(7), ZOYA = U(8), VIKRAM = U(9);
await q(`insert into public.users (id, name, phone, email, created_at) values
  ('${ASHA}', 'Asha Rao', '+919000000001', 'asha.standin@example.com', now() - interval '30 days'),
  ('${RAVI}', 'Ravi Kumar', '+919000000002', 'ravi.standin@example.com', now() - interval '30 days'),
  ('${PRIYA}', 'Priya Sharma', '+919000000003', ' Priya.Standin@Example.com ', now() - interval '30 days'),
  ('${KIRAN}', 'Kiran Patil', '+919000000004', 'kiran.standin@example.com', now() - interval '30 days'),
  ('${NEHA}', 'Neha Joshi', '+919000000005', null, now() - interval '30 days'),
  ('${OMAR}', 'Omar Shaikh', '+919000000006', 'omar.standin@example.com', now() - interval '30 days'),
  ('${MEERA}', 'Meera Iyer', '+919000000007', 'meera.standin@example.com', now() - interval '30 days'),
  ('${ZOYA}', 'Zoya Khan', '+919000000008', 'zoya.standin@example.com', now() - interval '30 days'),
  ('${VIKRAM}', 'Vikram Rao', '+919000000009', 'vikram.standin@example.com', now() - interval '30 days')`);
await q(`insert into private.test_proven values ('${ASHA}'), ('${RAVI}'), ('${PRIYA}'), ('${OMAR}'), ('${MEERA}'), ('${ZOYA}'), ('${VIKRAM}')`);
await q(`insert into public.turfs (id, name, slug, city, area, address, is_active, lat, lng) values
  ('${T(1)}', 'Kings Turf', 'kings-turf', 'pune', 'Baner', 'Plot 4, Baner Road', true, 18.559, 73.786),
  ('${T(2)}', 'Dribble Den', 'dribble-den', 'pune', 'Aundh', 'Lane 2, Aundh', true, 18.56, 73.81)`);
const mkGame = async (host, o = {}) => {
  // (game_create allows 10 a day: the host's earlier test games are made older.)
  await q(`update public.games set created_at = created_at - interval '2 days' where creator_id = $1 and created_at > now() - interval '1 day'`, [host]);
  const g = await rpc("game_create", [KEY, host, JSON.stringify({ turf_id: T(1), sport: "Football", skill_level: "all", max_players: 10, date: ist(2), start_time: "19:00", end_time: "20:00", price_per_player: 150, ...o })]);
  assert.equal(g.r, "ok", `a game: ${JSON.stringify(g)}`);
  return g.game.id;
};
// Before the file: games and notifications as today, nothing queued.
const G0 = await mkGame(ASHA);
const R0 = (await rpc("game_request_send", [KEY, RAVI, G0, null])).request.id;
await rpc("game_request_answer", [KEY, ASHA, R0, true]);

const before = Date.now();
await db.exec(sql);
const launch1 = (await one(`select value from private.email_settings where name = 'launch_at'`)).value;
await db.exec(sql);
passed++; // safe to run again
eq((await one(`select value from private.email_settings where name = 'launch_at'`)).value, launch1, "running it again keeps launch_at");
ok(Math.abs(Date.parse(launch1) - before) < 60000, "launch_at is when it first ran");
eq((await one(`select count(*)::int n from private.email_outbox`)).n, 0, "nothing from before the file is queued");
eq(await q(`select name, schedule, command from cron.jobs where name like 'email%' order by 1`), [
  { name: "email-clock", schedule: "*/5 * * * *", command: "select private.email_clock()" },
  { name: "email-flush", schedule: "* * * * *", command: "select private.email_flush()" }], "two jobs: the clock every 5 minutes, the flush every minute");
eq((await q(`select tgname from pg_trigger where tgrelid = 'public.notifications'::regclass and not tgisinternal order by 1`)).map((r) => r.tgname),
  ["notifications_email", "notifications_push"], "the email trigger sits next to the push trigger");

/* ---------------- closed to the API roles ---------------- */
const TABLES = ["email_settings", "email_outbox", "email_prefs", "email_suppressions", "email_flush_state", "game_alerts"];
eq((await q(`select table_name from information_schema.role_table_grants where grantee in ('anon', 'authenticated', 'public') and table_schema = 'private'
  and table_name = any($1)`, [TABLES])).length, 0, "no grant on the email tables to the API roles");
for (const role of ["anon", "authenticated"]) {
  for (const t of TABLES) {
    await assert.rejects(asRole(role, () => q(`select * from private.${t}`)), /permission denied/, `${role} cannot read private.${t}`);
    passed++;
  }
  await assert.rejects(asRole(role, () => q(`select private.email_clock()`)), /permission denied/, `${role} cannot run the clock`);
  await assert.rejects(asRole(role, () => q(`select private.email_flush()`)), /permission denied/, `${role} cannot run the flush`);
  passed += 2;
}
const fns = await q(`select n.nspname, p.proname, p.prosecdef, p.proconfig::text cfg,
    has_function_privilege('anon', p.oid, 'execute') anon_x, has_function_privilege('authenticated', p.oid, 'execute') auth_x
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (p.proname like 'email%' or p.proname in ('game_clock_text')) and p.proname <> 'email_proven' order by 1, 2`);
eq(fns.filter((f) => f.nspname === "public").map((f) => f.proname),
  ["email_claim", "email_hold", "email_prefs_get", "email_prefs_set", "email_report", "email_suppress", "email_unsubscribe"], "the public functions");
for (const f of fns) {
  ok(f.cfg?.includes("search_path"), `${f.proname}: its own search_path (${f.cfg})`);
  if (f.nspname === "public") ok(f.prosecdef && f.anon_x && f.auth_x, `${f.proname}: a definer function the server calls with the key`);
  else ok(!f.anon_x && !f.auth_x, `${f.nspname}.${f.proname}: closed to the API roles`);
}

/* ---------------- the server key ---------------- */
for (const [fn, args] of [["email_claim", [20]], ["email_report", ["[]"]], ["email_hold", ["no_key"]], ["email_prefs_get", [ASHA]],
  ["email_prefs_set", [ASHA, false, null, null]], ["email_unsubscribe", [ASHA, "all"]], ["email_suppress", ["x@example.com", "bounce"]]]) {
  eq((await rpc(fn, ["nope", ...args])).r, "unavailable", `${fn}: a wrong key is refused`);
  eq((await rpc(fn, [null, ...args])).r, "unavailable", `${fn}: no key is refused`);
}
eq((await one(`select count(*)::int n from private.email_prefs`)).n + (await one(`select count(*)::int n from private.email_suppressions`)).n, 0, "and nothing was written");
eq((await one(`select last_claim_at, hold_until from private.email_flush_state`)), { last_claim_at: null, hold_until: null }, "nor the flush state");

/* ---------------- queueing ---------------- */
const outbox = (where = "true", p = []) => q(`select * from private.email_outbox where ${where} order by created_at, id`, p);
const notes = (type, game) => q(`select user_id, title, message, metadata from public.notifications where type = $1 and metadata ->> 'gameId' = $2 order by created_at, user_id`, [type, game]);

// A join request: one email to the host, waiting 15 minutes.
const G1 = await mkGame(ASHA, { max_players: 12 });
const r1 = (await rpc("game_request_send", [KEY, RAVI, G1, "Keeper"])).request.id;
let rows = await outbox();
eq(rows.map((r) => [r.user_id, r.kind, r.status, r.refs]), [[ASHA, "join_request", "queued", { game_id: G1, request_ids: [r1] }]], "a join request queues one email, to the host only");
const due = Date.parse(rows[0].next_attempt_at) - Date.parse(rows[0].created_at);
eq(due, 15 * 60000, "due 15 minutes after the request");
ok(rows[0].dedupe_key.startsWith("join_request:"), "its dedupe key");
eq(Object.keys(rows[0]).filter((k) => /email|address|name|to/i.test(k) && k !== "kind"), [], "no address or name column");
// Two more requests within the 15 minutes: the same email lists them.
const r2 = (await rpc("game_request_send", [KEY, PRIYA, G1, null])).request.id;
const r3 = (await rpc("game_request_send", [KEY, NEHA, G1, null])).request.id;
rows = await outbox(`kind = 'join_request'`);
eq(rows.length, 1, "requests for one game within 15 minutes: one email");
eq(rows[0].refs.request_ids, [r1, r2, r3], "listing every request");
// Asked again (withdrawn, then again): no second entry.
await rpc("game_request_withdraw", [KEY, NEHA, r3]);
await rpc("game_request_send", [KEY, NEHA, G1, null]);
eq((await outbox(`kind = 'join_request'`))[0].refs.request_ids, [r1, r2, r3], "asking again adds no second entry");
// Over 15 minutes later: a new email.
await q(`update private.email_outbox set created_at = created_at - interval '16 minutes' where kind = 'join_request'`);
const G1b = await mkGame(ASHA, { start_time: "20:00", end_time: "21:00" });
await rpc("game_request_send", [KEY, RAVI, G1b, null]);
eq((await outbox(`kind = 'join_request'`)).length, 2, "another game's request is its own email");
await rpc("game_request_send", [KEY, ZOYA, G1, null]);
eq((await outbox(`kind = 'join_request' and refs ->> 'game_id' = $1`, [G1])).length, 2, "a request after the 15 minutes is a new email");
await q(`update private.email_outbox set status = 'skipped' where kind = 'join_request'`);

// A host whose email is not confirmed, or who has none: nothing.
const GK = await mkGame(KIRAN);
const GN = await mkGame(NEHA);
await rpc("game_request_send", [KEY, RAVI, GK, null]);
await rpc("game_request_send", [KEY, RAVI, GN, null]);
eq((await outbox(`refs ->> 'game_id' in ($1, $2)`, [GK, GN])).length, 0, "no email for an address Google did not confirm, nor for no address");
eq((await notes("game_request", GK)).length, 1, "(the in-app notification is made as always)");

// Accepted: You're in, to the player.
const acc = await rpc("game_request_answer", [KEY, ASHA, r1, true]);
eq(acc.status, "accepted", "(Asha accepts Ravi)");
rows = await outbox(`kind = 'request_accepted'`);
eq(rows.map((r) => [r.user_id, r.status, r.refs]), [[RAVI, "queued", { game_id: G1, request_id: r1 }]], "accepted: one email, to the player, due now");
ok(Date.parse(rows[0].next_attempt_at) <= Date.now() + 1000, "due now");
// Declined: no email.
await rpc("game_request_answer", [KEY, ASHA, r2, false]);
eq((await outbox(`user_id = $1`, [PRIYA])).length, 0, "a decline is never emailed");

// Never emailed: booking requests and answers, claim decisions, anything else.
const allRows = async () => (await one(`select count(*)::int n from private.email_outbox`)).n;
const rowsBefore = await allRows();
for (const type of ["booking_request", "booking_confirmed", "booking_declined", "booking_cancelled", "booking_cancelled_by_player", "owner_claim_approved", "owner_claim_rejected", "game_request_declined", "welcome", "promo"]) {
  await q(`insert into public.notifications (user_id, type, title, message, metadata) values ($1, $2, 'x', 'y', $3)`, [ASHA, type, JSON.stringify({ gameId: G1, turfId: T(1), requestId: r1 })]);
}
eq(await allRows(), rowsBefore, "booking requests, claim decisions, a decline and any other type: no email");

// The insert never fails: queueing breaks, the notification is still made.
const nBefore = (await one(`select count(*)::int n from public.notifications`)).n;
await q(`alter table private.email_outbox rename to email_outbox_away`);
const r4 = await rpc("game_request_send", [KEY, OMAR, G1, null]);
eq(r4.r, "ok", "with the outbox gone the request still goes through");
await q(`alter table private.email_outbox_away rename to email_outbox`);
eq((await one(`select count(*)::int n from public.notifications`)).n, nBefore + 1, "and its notification is made");
for (const [, meta] of [["no metadata", null], ["metadata not an object", "[1,2]"], ["a game id that is no id", '{"gameId":"../x"}'], ["a request with no id", `{"gameId":"${G1}"}`]]) {
  await q(`insert into public.notifications (user_id, type, title, message, metadata) values ($1, 'game_request', 'x', 'y', $2::jsonb)`, [ASHA, meta]);
  passed++;
}
eq((await one(`select count(*)::int n from public.notifications`)).n, nBefore + 5, "odd metadata: the notification is made, nothing queued, no error");
await q(`insert into public.notifications (user_id, type, title, message, metadata) values (null, 'game_request', 'x', 'y', '{}')`);
passed++;

// Suppressed and switched off.
eq(await rpc("email_suppress", [KEY, "  OMAR.standin@Example.com ", "bounce"]), { r: "ok" }, "a bounce is recorded");
eq(await q(`select address_hash, user_id, reason from private.email_suppressions`), [{ address_hash: md5("omar.standin@example.com"), user_id: OMAR, reason: "bounce" }],
  "as the md5 of the lower case address, with the account it was");
eq(await rpc("email_suppress", [KEY, "omar.standin@example.com", "complaint"]), { r: "ok" }, "then a complaint");
eq((await one(`select reason from private.email_suppressions`)).reason, "complaint", "a complaint wins");
eq(await rpc("email_suppress", [KEY, "omar.standin@example.com", "bounce"]), { r: "ok" }, "a later bounce");
eq((await one(`select reason from private.email_suppressions`)).reason, "complaint", "keeps the complaint");
for (const [what, args] of [["no @", ["not-an-address", "bounce"]], ["another reason", ["x@example.com", "spam"]], ["no address", [null, "bounce"]]]) {
  eq((await rpc("email_suppress", [KEY, ...args])).r, "bad", `email_suppress refuses ${what}`);
}
const GO = await mkGame(OMAR);
await rpc("game_request_send", [KEY, RAVI, GO, null]);
eq((await outbox(`user_id = $1`, [OMAR])).length, 0, "an address that bounced or complained is never queued");

eq(await rpc("email_prefs_get", [KEY, MEERA]), { r: "ok", email: "meera.standin@example.com", suppressed: false, requests: true, changes: true, reminders: true, all_off: false },
  "the switches: all on, with the account's own address");
eq((await rpc("email_prefs_get", [KEY, KIRAN])).email, null, "an address Google did not confirm is not shown as one we email");
eq((await rpc("email_prefs_get", [KEY, OMAR])).suppressed, true, "a bounced one says so");
eq((await rpc("email_prefs_get", [KEY, U(99)])).r, "bad", "an account that isn't there");
eq((await rpc("email_prefs_set", [KEY, MEERA, null, null, null])).r, "bad", "nothing to change");
let p = await rpc("email_prefs_set", [KEY, MEERA, false, null, null]);
eq([p.requests, p.changes, p.reminders], [false, true, true], "Meera turns off join requests and answers");
const GM = await mkGame(MEERA);
await rpc("game_request_send", [KEY, RAVI, GM, null]);
eq((await outbox(`user_id = $1`, [MEERA])).length, 0, "her join request emails stop");

// The cap: 6 a day.
await q(`insert into private.email_outbox (user_id, kind, dedupe_key, refs, status, created_at)
  select $1, 'reminder', 'cap-test:' || g, '{}'::jsonb, 'sent', now() - interval '2 hours' from generate_series(1, 5) g`, [VIKRAM]);
const GV = await mkGame(VIKRAM);
await rpc("game_request_send", [KEY, RAVI, GV, null]);
eq((await outbox(`user_id = $1 and kind = 'join_request'`, [VIKRAM])).length, 1, "the 6th in a day is queued");
const GV2 = await mkGame(VIKRAM, { start_time: "21:00", end_time: "22:00" });
await rpc("game_request_send", [KEY, RAVI, GV2, null]);
eq((await outbox(`user_id = $1 and kind = 'join_request'`, [VIKRAM])).length, 1, "the 7th is not");
await q(`update private.email_outbox set created_at = now() - interval '25 hours' where user_id = $1 and dedupe_key like 'cap-test:%'`, [VIKRAM]);
const GV3 = await mkGame(VIKRAM, { start_time: "06:00", end_time: "07:00" });
await rpc("game_request_send", [KEY, RAVI, GV3, null]);
eq((await outbox(`user_id = $1 and kind = 'join_request'`, [VIKRAM])).length, 2, "a day later there is room again");
await q(`update private.email_outbox set status = 'skipped' where status = 'queued'`);

/* ---------------- game changes ---------------- */
// G2: Asha hosts; Ravi in, Priya pending, Zoya in.
const G2 = await mkGame(ASHA, { date: ist(3) });
const rz = (await rpc("game_request_send", [KEY, ZOYA, G2, null])).request.id;
const rr = (await rpc("game_request_send", [KEY, RAVI, G2, null])).request.id;
await rpc("game_request_answer", [KEY, ASHA, rz, true]);
await rpc("game_request_answer", [KEY, ASHA, rr, true]);
await rpc("game_request_send", [KEY, PRIYA, G2, null]);
await q(`update private.email_outbox set status = 'skipped' where status = 'queued'`);
// The same date and time sent back: nothing.
let up = await rpc("game_update", [KEY, ASHA, G2, JSON.stringify({ date: ist(3), start_time: "19:00", max_players: 11 }), null]);
eq([up.r, up.notified], ["ok", 0], "an edit that keeps the day and time");
eq((await notes("game_time_changed", G2)).length, 0, "tells nobody about the time");
// A new start time.
up = await rpc("game_update", [KEY, ASHA, G2, JSON.stringify({ start_time: "20:30", end_time: "21:30" }), null]);
eq([up.r, up.notified], ["ok", 0], "a new start time: the answer as before (notified counts venue moves)");
let tn = await notes("game_time_changed", G2);
eq(tn.map((n) => n.user_id).sort(), [RAVI, PRIYA, ZOYA].sort(), "game_time_changed: the players and the pending request, never the host");
const d3 = new Date(`${ist(3)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");
eq([tn[0].title, tn[0].message], ["Game time changed", `Asha moved Football to ${d3}, 8:30 PM.`], "in plain words");
eq(tn[0].metadata, { gameId: G2, date: ist(3), startTime: "20:30", fromDate: ist(3), fromStartTime: "19:00" }, "with the new and the old day and time");
rows = await outbox(`kind = 'game_changed'`);
eq(rows.map((r) => r.user_id).sort(), [RAVI, PRIYA, ZOYA].sort(), "one change email each, the host none");
eq(rows[0].refs, { game_id: G2, changes: ["time"], from_date: ist(3), from_start: "19:00" }, "what changed and from what");
ok(Math.abs(Date.parse(rows[0].next_attempt_at) - Date.parse(rows[0].created_at) - 120000) < 1000, "due 2 minutes on (a second change joins it)");
// A move and a new day in one save: one email each, both changes.
up = await rpc("game_update", [KEY, ASHA, G2, JSON.stringify({ turf_id: T(2), date: ist(4) }), null]);
eq(up.notified, 3, "a move tells the 3 (as before)");
eq((await notes("game_venue_changed", G2)).length, 3, "game_venue_changed as before");
eq((await notes("game_time_changed", G2)).length, 6, "and game_time_changed again for the new day");
rows = await outbox(`kind = 'game_changed'`);
eq(rows.length, 3, "still one email each");
eq(rows[0].refs, { game_id: G2, changes: ["time", "venue"], from_date: ist(3), from_start: "19:00" }, "with both changes and the first time it was");
// The host changes the time back: claimed later, it says nothing changed... but the venue did.
// Cancel: everyone in and waiting is told, the host is not; what was queued for them about it is moot.
const cancelled = await rpc("game_cancel", [KEY, ASHA, G2]);
eq(cancelled.r, "ok", "(Asha cancels G2)");
rows = await outbox(`refs ->> 'game_id' = $1`, [G2]);
eq(rows.filter((r) => r.kind === "game_cancelled").map((r) => [r.user_id, r.status]).sort(), [[PRIYA, "queued"], [RAVI, "queued"], [ZOYA, "queued"]].sort(), "cancelled: one email each to the players and the pending request");
eq(rows.filter((r) => r.kind === "game_changed").map((r) => [r.status, r.last_error]), [["skipped", "cancelled"], ["skipped", "cancelled"], ["skipped", "cancelled"]], "their queued change emails are moot");
eq((await outbox(`user_id = $1 and refs ->> 'game_id' = $2`, [ASHA, G2])).filter((r) => r.status === "queued").length, 0, "the host gets none");
await q(`update private.email_outbox set status = 'skipped' where status = 'queued'`);

/* ---------------- the clock: reminders in India time ---------------- */
await q(`update private.email_flush_state set last_poke_at = null, last_claim_at = null`);
const D = ist(5);
const D1 = ist(6);
// G3: Asha hosts on D+1 at 7 PM; Ravi in a week ago, Priya joined at 5:30 PM on D (under an hour before 6 PM).
const G3 = await mkGame(ASHA, { date: D1, start_time: "19:00", end_time: "20:00" });
const rq = (await rpc("game_request_send", [KEY, RAVI, G3, null])).request.id;
await rpc("game_request_answer", [KEY, ASHA, rq, true]);
const rp = (await rpc("game_request_send", [KEY, PRIYA, G3, null])).request.id;
await rpc("game_request_answer", [KEY, ASHA, rp, true]);
await q(`update public.games set created_at = now() - interval '7 days' where id = $1`, [G3]);
await q(`update public.game_participants set joined_at = now() - interval '7 days' where game_id = $1`, [G3]);
await q(`update public.game_participants set joined_at = $2 where game_id = $1 and user_id = $3`, [G3, atIst(D, "17:30"), PRIYA]);
await q(`update private.email_outbox set status = 'skipped' where status = 'queued'`);
const clock = async (iso) => (await one(`select private.email_clock($1::timestamptz) r`, [iso])).r;
const reminders = async (game) => (await notes("game_reminder", game)).map((n) => [n.user_id, n.metadata.when]);
eq((await clock(atIst(D, "17:55"))).reminders, 0, "5:55 PM India time the day before: no reminder yet");
eq(atIst(D, "18:00").slice(11, 16), "12:30", "(6 PM India time is 12:30 UTC)");
let c = await clock(atIst(D, "18:00"));
eq([c.reminders, c.skipped], [2, 1], "6 PM India time: the host and Ravi are reminded, Priya (in the game under an hour) is skipped");
eq((await reminders(G3)).sort(), [[ASHA, "tomorrow"], [RAVI, "tomorrow"]].sort(), "tomorrow's reminder, to the host and the player");
const tomorrowNote = (await notes("game_reminder", G3))[0];
const dD1 = new Date(`${D1}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");
eq([tomorrowNote.title, tomorrowNote.message], ["Game tomorrow", `Football tomorrow, ${dD1}, at 7 PM at Kings Turf.`], "in plain words");
eq(tomorrowNote.metadata, { gameId: G3, when: "tomorrow", startAt: new Date(`${D1}T19:00:00+05:30`).toISOString().replace(".000Z", "+00:00") }, "with the game and when");
eq((await clock(atIst(D, "18:05"))).reminders, 0, "5 minutes on: nothing again");
eq((await clock(atIst(D, "23:55"))).reminders, 0, "nor later that evening");
eq((await clock(atIst(D1, "00:05"))).reminders, 0, "the day itself: no 'tomorrow'");
rows = await outbox(`kind = 'reminder' and refs ->> 'game_id' = $1`, [G3]);
eq(rows.map((r) => [r.user_id, r.refs.when]).sort(), [[ASHA, "tomorrow"], [RAVI, "tomorrow"]].sort(), "each reminder queues an email");
eq(rows[0].refs.start_at, new Date(`${D1}T19:00:00+05:30`).toISOString().replace(".000Z", "+00:00"), "with the start it was for");
// In about 3 hours: from 4 PM (3 hours before 7 PM) to 4:30 PM.
eq((await clock(atIst(D1, "15:55"))).reminders, 0, "3:55 PM: not yet");
c = await clock(atIst(D1, "16:00"));
eq(c.reminders, 3, "4 PM, 3 hours before: the host, Ravi and Priya");
eq((await reminders(G3)).filter((x) => x[1] === "soon").map((x) => x[0]).sort(), [ASHA, RAVI, PRIYA].sort(), "'in about 3 hours' to all three");
eq((await notes("game_reminder", G3)).find((n) => n.metadata.when === "soon").message, "Football at 7 PM at Kings Turf.", "in plain words");
eq((await clock(atIst(D1, "16:05"))).reminders, 0, "once");
// A game moved to "tomorrow" late in the evening: the 3 hours one within an hour of the first is skipped.
const G4 = await mkGame(ASHA, { date: ist(7), start_time: "00:30", end_time: "01:30" });
const rq4 = (await rpc("game_request_send", [KEY, RAVI, G4, null])).request.id;
await rpc("game_request_answer", [KEY, ASHA, rq4, true]);
await q(`update public.games set created_at = now() - interval '7 days' where id = $1`, [G4]);
await q(`update public.game_participants set joined_at = now() - interval '7 days' where game_id = $1`, [G4]);
const D6 = ist(6);
c = await clock(atIst(D6, "21:00"));
eq((await reminders(G4)).sort(), [[ASHA, "tomorrow"], [RAVI, "tomorrow"]].sort(), "a game at 12:30 AM: 'tomorrow' goes at the evening run");
c = await clock(atIst(D6, "21:30"));
eq([c.reminders, c.skipped], [0, 2], "its 3 hours reminder half an hour later is skipped for both");
eq((await q(`select outcome from private.game_alerts where game_id = $1 and kind = 'soon'`, [G4])).map((r) => r.outcome), ["skipped_close", "skipped_close"], "as too close to the first");
// A game made less than an hour before its "in about 3 hours": skipped for the host.
const G5 = await mkGame(ZOYA, { date: D1, start_time: "21:00", end_time: "22:00" });
await q(`update public.games set created_at = $2 where id = $1`, [G5, atIst(D1, "17:30")]);
await q(`update public.game_participants set joined_at = $2 where game_id = $1`, [G5, atIst(D1, "17:30")]);
c = await clock(atIst(D1, "18:00"));
eq((await reminders(G5)).length, 0, "a game made at 5:30 PM for 9 PM: no reminder at 6 PM");
// Only open or full games; never once started.
const G6 = await mkGame(RAVI, { date: D1, start_time: "21:00", end_time: "22:00" });
await q(`update public.games set created_at = now() - interval '7 days', status = 'cancelled' where id = $1`, [G6]);
await clock(atIst(D, "18:10"));
eq((await reminders(G6)).length, 0, "a cancelled game: no reminder");
eq((await q(`select count(*)::int n from private.game_alerts where game_id = $1`, [G6]))[0].n, 0, "(nothing decided for it)");

/* ---------------- the clock: a join request still waiting ---------------- */
// (The requests above, answered, so only these wait.)
await q(`update public.game_requests set status = 'declined' where status = 'pending'`);
const G7 = await mkGame(ASHA, { date: ist(3), start_time: "19:00" });
const w1 = (await rpc("game_request_send", [KEY, ZOYA, G7, null])).request.id;
const w1at = (await one(`select created_at from public.game_requests where id = $1`, [w1])).created_at;
const plus = (ts, m) => new Date(new Date(ts).getTime() + m * 60000).toISOString();
eq((await clock(plus(w1at, 119))).waiting, 0, "a request 1 hour 59 minutes old: no nudge yet");
c = await clock(plus(w1at, 120));
eq(c.waiting, 1, "2 hours: the host is told it is still waiting");
const wn = await notes("game_request_waiting", G7);
eq(wn.map((n) => [n.user_id, n.title, n.metadata]), [[ASHA, "Join request waiting", { gameId: G7, requestId: w1 }]], "game_request_waiting, to the host");
const d7 = new Date(`${ist(3)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");
eq(wn[0].message, `Zoya Khan is still waiting to hear from you about Football on ${d7}. Accept or decline on the game page.`, "in plain words");
eq((await clock(plus(w1at, 125))).waiting, 0, "once per request");
eq((await outbox(`kind = 'request_waiting'`)).map((r) => [r.user_id, r.refs]), [[ASHA, { game_id: G7, request_ids: [w1] }]], "and an email, due now");
// Answered: no nudge.
const G8 = await mkGame(ASHA, { date: ist(3), start_time: "21:00", end_time: "22:00" });
const w2 = (await rpc("game_request_send", [KEY, RAVI, G8, null])).request.id;
await rpc("game_request_answer", [KEY, ASHA, w2, false]);
eq((await clock(minutes(130))).waiting, 0, "a request already answered: no nudge");
// Soon game: 30 minutes when the game starts within 3 hours (now + 2:30).
const soon = new Date(Date.now() + 150 * 60000 + 330 * 60000);
const G9 = await mkGame(RAVI, { date: soon.toISOString().slice(0, 10), start_time: soon.toISOString().slice(11, 16), end_time: new Date(soon.getTime() + 3600000).toISOString().slice(11, 16) });
const w3 = (await rpc("game_request_send", [KEY, PRIYA, G9, null])).request.id;
const w3at = (await one(`select created_at from public.game_requests where id = $1`, [w3])).created_at;
eq((await clock(plus(w3at, 29))).waiting, 0, "a game in 2.5 hours: no nudge at 29 minutes");
eq((await clock(plus(w3at, 30))).waiting, 1, "30 minutes: nudged");
// Never after the start.
const startSoon = new Date(Date.now() + 20 * 60000 + 330 * 60000);
const G10 = await mkGame(ZOYA, { date: startSoon.toISOString().slice(0, 10), start_time: startSoon.toISOString().slice(11, 16), end_time: new Date(startSoon.getTime() + 3600000).toISOString().slice(11, 16) });
const w4 = (await rpc("game_request_send", [KEY, RAVI, G10, null])).request.id;
eq((await clock(minutes(31))).waiting, 0, "a game that started 10 minutes before the 30: never nudged");
eq((await notes("game_request_waiting", G10)).length, 0, "(nothing)");
// A request from before the file: never.
const G11 = await mkGame(ZOYA, { date: ist(4) });
const w5 = (await rpc("game_request_send", [KEY, RAVI, G11, null])).request.id;
await q(`update public.game_requests set created_at = $2::timestamptz - interval '1 hour' where id = $1`, [w5, launch1]);
eq((await clock(minutes(5))).waiting, 0, "a request sent before the file ran: never nudged");
void w4;

/* ---------------- the clock: Welcome ---------------- */
const NEW1 = U(21), NEW2 = U(22), OLD1 = U(23);
await q(`insert into public.users (id, name, email, created_at) values ($1, 'Farah New', 'farah.standin@example.com', now()), ($2, 'Dev New', 'dev.standin@example.com', now()),
  ($3, 'Old Before', 'old.standin@example.com', $4::timestamptz - interval '1 minute')`, [NEW1, NEW2, OLD1, launch1]);
await q(`insert into private.test_proven values ($1), ($2)`, [NEW1, OLD1]);
c = await clock(new Date().toISOString());
eq(c.welcome, 1, "Welcome: once, for an account made after the file, with a confirmed email");
eq((await outbox(`kind = 'welcome'`)).map((r) => [r.user_id, r.refs]), [[NEW1, {}]], "to that account only (not the one made before it, not the one with no confirmed email yet)");
eq((await clock(new Date().toISOString())).welcome, 0, "never twice");
await q(`insert into private.test_proven values ($1)`, [NEW2]);
eq((await clock(new Date().toISOString())).welcome, 1, "the account that confirms its email later that day gets it then");
eq((await rpc("email_unsubscribe", [KEY, NEW2, "all"])).r, "ok", "(Dev turns all emails off)");
await q(`update private.email_outbox set status = 'skipped' where status = 'queued' and kind = 'welcome' and user_id = $1`, [NEW2]);

/* ---------------- the flush ---------------- */
await q(`update private.email_outbox set status = 'skipped' where status = 'queued'`);
const posts = async () => (await one(`select count(*)::int n from net.posts`)).n;
const flush = async (iso) => (await one(`select private.email_flush($1::timestamptz) r`, [iso ?? new Date().toISOString()])).r;
const p0 = await posts();
eq((await flush()).r, "idle", "nothing due: idle");
eq((await flush(minutes(1))).r, "idle", "a minute on: idle");
eq(await posts(), p0, "idle minutes post nothing");
// A due row: one post with the secret.
const G12 = await mkGame(ASHA, { date: ist(3), start_time: "07:00", end_time: "08:00" });
const a12 = (await rpc("game_request_send", [KEY, RAVI, G12, null])).request.id;
eq((await flush()).r, "idle", "a join request's email waits its 15 minutes: idle");
await rpc("game_request_answer", [KEY, ASHA, a12, true]);
let f = await flush();
eq([f.r, f.due], ["posted", 1], "Ravi's You're in is due: posted");
const post = await one(`select url, headers, body, timeout from net.posts order by id desc limit 1`);
eq([post.url, post.headers["x-revalidate-secret"], post.body, post.timeout], ["https://www.tapturf.in/api/email/dispatch", "reval-secret", { due: 1 }, 60000], "to the dispatch route, with the secret");
eq((await flush(minutes(1))).r, "waiting", "a minute on, the route has not claimed: no second post");
eq((await flush(minutes(9))).r, "waiting", "nor 9 minutes on");
eq((await flush(minutes(11))).r, "posted", "10 minutes on, again");
// The route says it can't send: a hold.
eq(await rpc("email_hold", [KEY, "no_key"]), { r: "ok" }, "the route holds (no Resend key)");
eq((await flush(minutes(12))).r, "held", "held");
eq((await flush(minutes(29))).r, "held", "held for 30 minutes");
eq((await flush(minutes(31))).r, "posted", "then posted again");
eq((await one(`select hold_reason from private.email_flush_state`)).hold_reason, "no_key", "(why)");

/* ---------------- claim, report, retry, lease, expiry ---------------- */
let cl = await rpc("email_claim", [KEY, 50]);
eq(cl.r, "ok", "the route claims");
eq((await one(`select hold_until from private.email_flush_state`)).hold_until, null, "and the hold is over");
eq(cl.jobs.length, 1, "one due");
const job = cl.jobs[0];
eq([job.kind, job.group, job.user_id, job.to, job.name, job.attempt, job.path, job.you_host], ["request_accepted", "requests", RAVI, "ravi.standin@example.com", "Ravi", 1, `/game/${G12}`, false],
  "You're in, to Ravi's own address");
eq(job.game, { id: G12, sport: "Football", date: ist(3), start_time: "07:00", end_time: "08:00", price_per_player: 150, status: "open", host_first: "Asha", players: 2, max_players: 10,
  venue: { name: "Kings Turf", area: "Baner", city: "pune", address: "Plot 4, Baner Road", lat: 18.559, lng: 73.786, maps_url: null, turf_slug: "kings-turf" } }, "with the game, the host's first name and the venue");
let st = await one(`select status, attempts, lease_until from private.email_outbox where id = $1`, [job.id]);
ok(st.status === "sending" && st.attempts === 1 && Date.parse(st.lease_until) > Date.now() + 4 * 60000, "leased for 5 minutes, try 1");
eq((await rpc("email_claim", [KEY, 50])).jobs.length, 0, "a leased one is not claimed twice");
eq(await rpc("email_report", [KEY, JSON.stringify([{ id: job.id, result: "sent", provider_id: "re_123" }])]), { r: "ok", sent: 1, retry: 0, failed: 0 }, "sent");
st = await one(`select status, provider_id, sent_at, lease_until from private.email_outbox where id = $1`, [job.id]);
ok(st.status === "sent" && st.provider_id === "re_123" && st.sent_at && !st.lease_until, "recorded with Resend's id");
eq(await rpc("email_report", [KEY, JSON.stringify([{ id: job.id, result: "failed" }])]), { r: "ok", sent: 0, retry: 0, failed: 0 }, "a second report changes nothing");
eq((await rpc("email_report", [KEY, "{}"])).r, "bad", "a report that is not a list");
eq((await rpc("email_report", [KEY, JSON.stringify(Array.from({ length: 51 }, () => ({})))])).r, "bad", "over 50");

// Retries: 1, 5, 30, 120 minutes, then failed after the 5th.
const rid = (await one(`insert into private.email_outbox (user_id, kind, dedupe_key, refs) values ($1, 'request_accepted', 'retry-test', $2) returning id`,
  [RAVI, JSON.stringify({ game_id: G12, request_id: a12 })])).id;
for (const [n, wait] of [[1, 1], [2, 5], [3, 30], [4, 120]]) {
  await q(`update private.email_outbox set next_attempt_at = now() - interval '1 second' where id = $1`, [rid]);
  cl = await rpc("email_claim", [KEY, 20]);
  eq(cl.jobs.map((j) => [j.id, j.attempt]), [[rid, n]], `try ${n}`);
  await rpc("email_report", [KEY, JSON.stringify([{ id: rid, result: "retry", error: "429 rate limited" }])]);
  st = await one(`select status, attempts, next_attempt_at, last_error from private.email_outbox where id = $1`, [rid]);
  const mins = Math.round((Date.parse(st.next_attempt_at) - Date.now()) / 60000);
  eq([st.status, st.attempts, mins, st.last_error], ["queued", n, wait, "429 rate limited"], `after try ${n}: again in ${wait} minutes`);
}
await q(`update private.email_outbox set next_attempt_at = now() - interval '1 second' where id = $1`, [rid]);
cl = await rpc("email_claim", [KEY, 20]);
await rpc("email_report", [KEY, JSON.stringify([{ id: rid, result: "retry", error: "500" }])]);
eq((await one(`select status, attempts from private.email_outbox where id = $1`, [rid])), { status: "failed", attempts: 5 }, "after the 5th try: failed");
// A permanent failure.
const fid = (await one(`insert into private.email_outbox (user_id, kind, dedupe_key, refs) values ($1, 'request_accepted', 'fail-test', $2) returning id`,
  [RAVI, JSON.stringify({ game_id: G12, request_id: a12 })])).id;
await rpc("email_claim", [KEY, 20]);
await rpc("email_report", [KEY, JSON.stringify([{ id: fid, result: "failed", error: "422 invalid address" }])]);
eq((await one(`select status, last_error from private.email_outbox where id = $1`, [fid])), { status: "failed", last_error: "422 invalid address" }, "failed: never tried again");
// A lease that ran out goes back with its wait; the 5th fails.
const lid = (await one(`insert into private.email_outbox (user_id, kind, dedupe_key, refs) values ($1, 'request_accepted', 'lease-test', $2) returning id`,
  [RAVI, JSON.stringify({ game_id: G12, request_id: a12 })])).id;
await rpc("email_claim", [KEY, 20]);
await q(`update private.email_outbox set lease_until = now() - interval '1 second' where id = $1`, [lid]);
f = await flush();
st = await one(`select status, attempts, next_attempt_at, last_error, lease_until from private.email_outbox where id = $1`, [lid]);
eq([st.status, st.attempts, Math.round((Date.parse(st.next_attempt_at) - Date.now()) / 60000), st.last_error, st.lease_until], ["queued", 1, 1, "lease ran out", null],
  "a lease that ran out: queued again a minute on");
await q(`update private.email_outbox set status = 'sending', attempts = 5, lease_until = now() - interval '1 second' where id = $1`, [lid]);
await flush();
eq((await one(`select status from private.email_outbox where id = $1`, [lid])).status, "failed", "after the 5th try: failed");
// Expiry: queued for over 24 hours.
const eid = (await one(`insert into private.email_outbox (user_id, kind, dedupe_key, refs, created_at, next_attempt_at) values ($1, 'welcome', 'expire-test', '{}', now() - interval '25 hours', now() - interval '25 hours') returning id`, [ZOYA])).id;
const xid = (await one(`insert into private.email_outbox (user_id, kind, dedupe_key, refs, created_at, next_attempt_at) values ($1, 'welcome', 'fresh-test', '{}', now() - interval '23 hours', now() + interval '1 hour') returning id`, [ZOYA])).id;
await flush();
eq((await q(`select id, status from private.email_outbox where id in ($1, $2) order by created_at`, [eid, xid])).map((r) => r.status), ["expired", "queued"],
  "queued over 24 hours: expired (never sent late); 23 hours: still queued");
await q(`update private.email_outbox set status = 'skipped' where status in ('queued', 'sending')`);

// What a claim skips, and why.
const G13 = await mkGame(ASHA, { date: ist(3), start_time: "08:00", end_time: "09:00" });
await rpc("game_request_send", [KEY, RAVI, G13, "Can bring a ball"]);
await rpc("game_request_send", [KEY, ZOYA, G13, null]);
await q(`update private.email_outbox set next_attempt_at = now() - interval '1 second' where status = 'queued'`);
cl = await rpc("email_claim", [KEY, 20]);
eq(cl.jobs.map((j) => [j.kind, j.to, j.requests]), [["join_request", "asha.standin@example.com", [{ name: "Ravi Kumar" }, { name: "Zoya Khan" }]]], "a join request email lists every request still waiting");
await rpc("email_report", [KEY, JSON.stringify([{ id: cl.jobs[0].id, result: "sent", provider_id: "re_2" }])]);
const G14 = await mkGame(ASHA, { date: ist(3), start_time: "10:00", end_time: "11:00" });
const s3 = (await rpc("game_request_send", [KEY, RAVI, G14, null])).request.id;
const s4 = (await rpc("game_request_send", [KEY, ZOYA, G14, null])).request.id;
await rpc("game_request_answer", [KEY, ASHA, s3, true]);
await q(`update private.email_outbox set next_attempt_at = now() - interval '1 second' where status = 'queued' and kind = 'join_request'`);
cl = await rpc("email_claim", [KEY, 20]);
eq(cl.jobs.filter((j) => j.kind === "join_request").map((j) => j.requests), [[{ name: "Zoya Khan" }]], "one the host answered in the app meanwhile is left out");
await rpc("email_report", [KEY, JSON.stringify(cl.jobs.map((j) => ({ id: j.id, result: "sent" })))]);
await rpc("game_request_answer", [KEY, ASHA, s4, false]);
const G15 = await mkGame(ASHA, { date: ist(3), start_time: "11:00", end_time: "12:00" });
const s5 = (await rpc("game_request_send", [KEY, RAVI, G15, null])).request.id;
await rpc("game_request_withdraw", [KEY, RAVI, s5]);
const G16 = await mkGame(ASHA, { date: ist(3), start_time: "12:00", end_time: "13:00" });
await rpc("game_request_send", [KEY, ZOYA, G16, null]);
await rpc("game_cancel", [KEY, ASHA, G16]);
await q(`update private.email_outbox set next_attempt_at = now() - interval '1 second' where status = 'queued'`);
cl = await rpc("email_claim", [KEY, 20]);
const skips = await q(`select refs ->> 'game_id' g, kind, last_error from private.email_outbox where status = 'skipped' and refs ->> 'game_id' in ($1, $2) order by 1`, [G15, G16]);
eq(skips.map((s) => [s.g === G15 ? "G15" : "G16", s.kind, s.last_error]), [["G15", "join_request", "answered"], ["G16", "join_request", "cancelled"]].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  "skipped: every request withdrawn (answered), the game cancelled");
eq(cl.jobs.map((j) => [j.kind, j.user_id]), [["game_cancelled", ZOYA]], "the cancel email still goes to the player waiting");
eq([cl.jobs[0].game.status, cl.jobs[0].game.host_first], ["cancelled", "Asha"], "saying the game is cancelled, by whom");
await rpc("email_report", [KEY, JSON.stringify(cl.jobs.map((j) => ({ id: j.id, result: "sent" })))]);
// A reminder for a game that moved since: skipped. A switch turned off after queueing: skipped. Suppressed: skipped.
const G17 = await mkGame(ASHA, { date: ist(3), start_time: "13:00", end_time: "14:00" });
await q(`insert into public.notifications (user_id, type, title, message, metadata) values ($1, 'game_reminder', 'Game tomorrow', 'x', $2)`,
  [ASHA, JSON.stringify({ gameId: G17, when: "tomorrow", startAt: "2030-01-01T00:00:00+00:00" })]);
await q(`insert into public.notifications (user_id, type, title, message, metadata) values ($1, 'game_reminder', 'Game tomorrow', 'x', $2)`,
  [ZOYA, JSON.stringify({ gameId: G17, when: "tomorrow" })]);
await rpc("email_prefs_set", [KEY, ZOYA, null, null, false]);
const G18 = await mkGame(ASHA, { date: ist(3), start_time: "14:00", end_time: "15:00" });
const s6 = (await rpc("game_request_send", [KEY, PRIYA, G18, null])).request.id;
await rpc("game_request_answer", [KEY, ASHA, s6, true]);
await rpc("email_suppress", [KEY, "priya.standin@example.com", "bounce"]);
await q(`update private.email_outbox set next_attempt_at = now() - interval '1 second' where status = 'queued'`);
cl = await rpc("email_claim", [KEY, 20]);
eq(cl.jobs.length, 0, "none of them goes");
eq((await q(`select user_id, kind, last_error from private.email_outbox where refs ->> 'game_id' in ($1, $2) and status = 'skipped' order by kind, user_id`, [G17, G18])).map((r) => [r.kind, r.last_error]),
  [["join_request", "answered"], ["reminder", "moved"], ["reminder", "off"], ["request_accepted", "suppressed"]],
  "skipped: answered meanwhile, moved since, switched off since, bounced since");
eq(cl.skipped, 4, "(four skipped)");
// The claim limit.
await q(`insert into private.email_outbox (user_id, kind, dedupe_key, refs) select $1, 'welcome', 'many:' || g, '{}' from generate_series(1, 25) g`, [ASHA]);
cl = await rpc("email_claim", [KEY, 100]);
eq([cl.jobs.length, cl.more], [20, true], "at most 20 a claim, and it says there are more");
eq(cl.jobs[0].path, "/games", "Welcome links to the games");
await rpc("email_report", [KEY, JSON.stringify(cl.jobs.map((j) => ({ id: j.id, result: "sent" })))]);
cl = await rpc("email_claim", [KEY, 100]);
eq([cl.jobs.length, cl.more], [5, false], "then the rest");
await rpc("email_report", [KEY, JSON.stringify(cl.jobs.map((j) => ({ id: j.id, result: "sent" })))]);

/* ---------------- the switches and the link ---------------- */
p = await rpc("email_prefs_set", [KEY, MEERA, true, false, false]);
eq([p.requests, p.changes, p.reminders, p.all_off], [true, false, false, false], "Meera's switches as she set them");
for (const g of ["requests", "changes", "reminders"]) eq((await rpc("email_unsubscribe", [KEY, RAVI, g])).group, g, `the link turns off ${g}`);
p = await rpc("email_prefs_get", [KEY, RAVI]);
eq([p.requests, p.changes, p.reminders, p.all_off], [false, false, false, false], "each one off, not all");
eq((await rpc("email_unsubscribe", [KEY, RAVI, "all"])).r, "ok", "the Welcome link: all off");
eq((await rpc("email_prefs_get", [KEY, RAVI])).all_off, true, "all off");
p = await rpc("email_prefs_set", [KEY, RAVI, null, true, null]);
eq([p.requests, p.changes, p.reminders, p.all_off], [false, true, false, false], "turning one back on undoes all off");
for (const [what, args] of [["a group that isn't one", [RAVI, "promos"]], ["no group", [RAVI, null]], ["an account that isn't there", [U(99), "all"]]]) {
  eq((await rpc("email_unsubscribe", [KEY, ...args])).r, "bad", `the link refuses ${what}`);
}
// Welcome respects all off.
const NEW3 = U(24);
await q(`insert into public.users (id, name, email, created_at) values ($1, 'Gita New', 'gita.standin@example.com', now())`, [NEW3]);
await q(`insert into private.test_proven values ($1)`, [NEW3]);
await rpc("email_unsubscribe", [KEY, NEW3, "all"]);
eq((await clock(new Date().toISOString())).welcome, 0, "Welcome is not queued for an account with all off");

/* ---------------- pg_net down, no secret ---------------- */
await q(`insert into private.email_outbox (user_id, kind, dedupe_key, refs) values ($1, 'welcome', 'net-test', '{}')`, [ASHA]);
await q(`update private.email_flush_state set last_poke_at = null, hold_until = null`);
await q(`set test.net = 'broken'`);
eq((await flush()).r, "no_post", "pg_net failing: the flush says so and does not fail");
await q(`reset test.net`);
await q(`update private.app_secrets set name = 'revalidate_away' where name = 'revalidate'`);
eq((await flush()).r, "no_secret", "no secret: nothing posted");
await q(`update private.app_secrets set name = 'revalidate' where name = 'revalidate_away'`);
eq((await flush()).r, "posted", "with both: posted");

console.log(`email.check: ${passed} passed`);
