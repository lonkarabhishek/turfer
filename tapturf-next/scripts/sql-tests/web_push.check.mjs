// Applies 20261102_web_push.sql (twice, then once more with rows in it) to an
// in-memory Postgres (PGlite) built by games_lockdown.db.mjs, on top of both
// games lockdown files (production today), with stand-ins for pg_net (records
// each post; can be made to fail, or be missing) and the revalidate secret.
// Checks: the tables are closed to the API roles and the functions check the
// server key; push_subscribe (bad input, the kind of device, the same address
// again, an address moving to another account, 10 at once, 20 new a day),
// push_unsubscribe and push_state (own only); the trigger (posts {id} with the
// secret only for an account with an active subscription, through the game
// functions too; never fails the insert: no secret, pg_net failing or missing;
// a rolled back insert posts nothing); push_targets (claimed once, old, none,
// gone, only active and own subscriptions, the page each notification opens:
// lib/push/url.cases.json); push_report (ok, gone, failing after 8, own only,
// once); push_test_targets (5 an hour); and that nothing is ever taken out of
// a table. Never touches a real database. Made-up people only.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/web_push.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { KEY, makeDb } from "./games_lockdown.db.mjs";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261102_web_push.sql`;
const CASES = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../lib/push/url.cases.json"), "utf8"));
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };

const sql = fs.readFileSync(FILE, "utf8");
// Not even inside a word: "dropped", "deleted" and "truncated" are out too.
ok(!/drop|delete|truncate/i.test(sql), "written without the words drop, delete and truncate");
ok(!/[—–]/.test(sql), "no em or en dashes");
ok(/^set local lock_timeout = '5s';$/m.test(sql), "waits 5 s at most for a lock");
ok(!/\b(revoke|grant)\b[^;]*\bon\s+(table\s+)?public\./i.test(sql), "changes no grant on a public table");
ok(!/alter\s+(table|policy)/i.test(sql), "alters no table or policy");

const db = await makeDb(PGlite);
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const asRole = async (role, fn) => {
  await q(`set role ${role}`);
  try { return await fn(); } finally { await q("reset role"); }
};
const ist = (d) => new Date(Date.now() + d * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// pg_net: records each post (test.net = broken makes it fail), and the secret the cache queue sends.
await db.exec(`
create schema if not exists net;
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
$$;
insert into private.app_secrets values ('revalidate', 'reval-secret');
`);
await db.exec(fs.readFileSync(`${M}/20261030_games_lockdown.sql`, "utf8"));
await db.exec(fs.readFileSync(`${M}/20261030_games_lockdown_step2.sql`, "utf8"));

// People, turfs and a game (made up).
const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const T = (i) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`;
const ASHA = U(1), RAVI = U(2), PRIYA = U(3), KIRAN = U(4), NEHA = U(5), OMAR = U(6);
await q(`insert into public.users (id, name, phone) values ('${ASHA}', 'Asha Rao', '+919000000001'), ('${RAVI}', 'Ravi Kumar', '+919000000002'),
  ('${PRIYA}', 'Priya Sharma', '+919000000003'), ('${KIRAN}', 'Kiran Patil', '+919000000004'), ('${NEHA}', 'Neha Joshi', '+919000000005'),
  ('${OMAR}', 'Omar Shaikh', '+919000000006')`);
await q(`insert into public.turfs (id, name, slug, city, is_active) values ('${T(1)}', 'Kings Turf', 'kings-turf', 'pune', true), ('${T(2)}', 'Dribble Den', 'dribble-den', 'pune', true)`);
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const game = await rpc("game_create", [KEY, ASHA, JSON.stringify({ turf_id: T(1), sport: "Football", skill_level: "all", max_players: 10, date: ist(2), start_time: "19:00", end_time: "20:00", price_per_player: 150 })]);
eq(game.r, "ok", "(a game, through game_create)");
const G1 = game.game.id;

// Before the file: a notification is made and nothing is posted.
await rpc("game_request_send", [KEY, RAVI, G1, null]);
eq((await one(`select count(*)::int n from net.posts`)).n, 0, "before the file nothing is posted");

for (let i = 0; i < 2; i++) await db.exec(sql);
passed++; // safe to run again

/* ---------------- closed to the API roles ---------------- */
eq((await q(`select table_name from information_schema.role_table_grants where grantee in ('anon', 'authenticated', 'public') and table_schema = 'private' and table_name like 'push%'`)).length, 0,
  "no grant on the push tables to the API roles");
for (const role of ["anon", "authenticated"]) {
  await assert.rejects(asRole(role, () => q(`select * from private.push_subscriptions`)), /permission denied/, `${role} cannot read the subscriptions`);
  await assert.rejects(asRole(role, () => q(`insert into private.push_sends (kind, user_id) values ('test', '${ASHA}')`)), /permission denied/, `${role} cannot write a send`);
  passed += 2;
}
const fns = await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.proconfig::text cfg,
    has_function_privilege('anon', p.oid, 'execute') anon_x, has_function_privilege('authenticated', p.oid, 'execute') auth_x
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname like 'push%' order by 1, 2`);
eq(fns.map((f) => `${f.nspname}.${f.proname}`), ["private.push_on_notification", "private.push_targets_of", "private.push_url",
  "public.push_report", "public.push_state", "public.push_subscribe", "public.push_targets", "public.push_test_targets", "public.push_unsubscribe"], "the functions");
for (const f of fns) {
  ok(f.cfg === '{"search_path=\\"\\""}' || f.cfg === '{search_path=""}', `${f.proname}: an empty search_path (${f.cfg})`);
  if (f.nspname === "public") {
    ok(f.prosecdef && f.anon_x && f.auth_x, `${f.proname}: a definer function the server calls with the anon key`);
  } else {
    ok(!f.anon_x && !f.auth_x, `${f.proname}: closed to the API roles`);
  }
}

/* ---------------- the server key ---------------- */
const EP = (i) => `https://fcm.googleapis.com/fcm/send/standin-${String(i).padStart(4, "0")}:APA91b${"x".repeat(40)}`;
const P256 = (i) => `B${String(i).padStart(4, "0")}${"A".repeat(82)}`;
const AUTH = (i) => `auth${String(i).padStart(4, "0")}${"a".repeat(14)}`;
const subscribe = (user, i, device = "android", key = KEY) => rpc("push_subscribe", [key, user, EP(i), P256(i), AUTH(i), device]);
for (const [fn, args] of [["push_subscribe", ["nope", ASHA, EP(1), P256(1), AUTH(1), "android"]], ["push_unsubscribe", ["nope", ASHA, EP(1)]],
  ["push_state", ["nope", ASHA, EP(1)]], ["push_test_targets", ["nope", ASHA]], ["push_targets", ["nope", "cccccccc-cccc-4ccc-8ccc-000000000001"]],
  ["push_report", ["nope", "cccccccc-cccc-4ccc-8ccc-000000000001", "[]"]]]) {
  eq((await rpc(fn, args)).r, "unavailable", `${fn}: a wrong key is refused`);
  eq((await rpc(fn, [null, ...args.slice(1)])).r, "unavailable", `${fn}: no key is refused`);
}
eq((await one(`select count(*)::int n from private.push_subscriptions`)).n, 0, "and nothing was written");

/* ---------------- push_subscribe ---------------- */
for (const [what, args] of [
  ["no account", [KEY, null, EP(1), P256(1), AUTH(1), "android"]],
  ["an account that isn't there", [KEY, U(99), EP(1), P256(1), AUTH(1), "android"]],
  ["http", [KEY, ASHA, EP(1).replace("https:", "http:"), P256(1), AUTH(1), "android"]],
  ["too short", [KEY, ASHA, "https://x.io/a", P256(1), AUTH(1), "android"]],
  ["too long", [KEY, ASHA, `https://fcm.googleapis.com/${"x".repeat(1100)}`, P256(1), AUTH(1), "android"]],
  ["a bad public key", [KEY, ASHA, EP(1), "not a key", AUTH(1), "android"]],
  ["a short public key", [KEY, ASHA, EP(1), "B".repeat(40), AUTH(1), "android"]],
  ["a bad auth secret", [KEY, ASHA, EP(1), P256(1), "a b", "android"]],
  ["no endpoint", [KEY, ASHA, null, P256(1), AUTH(1), "android"]],
]) eq((await rpc("push_subscribe", args)).r, "bad", `push_subscribe refuses ${what}`);
eq(await subscribe(ASHA, 1, "iphone"), { r: "ok", devices: 1 }, "Asha turns it on on her iPhone");
let row = await one(`select * from private.push_subscriptions where endpoint = $1`, [EP(1)]);
eq([row.user_id, row.device, row.status, row.fail_count, row.gone_reason], [ASHA, "iphone", "active", 0, null], "one active row, her iPhone");
eq((await subscribe(ASHA, 2, "toaster")).devices, 2, "a second device");
eq((await one(`select device from private.push_subscriptions where endpoint = $1`, [EP(2)])).device, "other", "a kind of device not on the list is other");
eq((await subscribe(ASHA, 1, "iphone")).devices, 2, "the same address again is the same row");
eq((await one(`select count(*)::int n from private.push_subscriptions where endpoint = $1`, [EP(1)])).n, 1, "(one row)");
// New keys for the same address (the browser made a new subscription there).
await rpc("push_subscribe", [KEY, ASHA, EP(1), P256(7), AUTH(7), "iphone"]);
eq((await one(`select p256dh, auth from private.push_subscriptions where endpoint = $1`, [EP(1)])), { p256dh: P256(7), auth: AUTH(7) }, "new keys replace the old");
// Ravi signs in on Asha's iPhone and turns it on: the address is his now.
await q(`update private.push_subscriptions set fail_count = 3, last_ok_at = now() - interval '1 day' where endpoint = $1`, [EP(1)]);
eq(await rpc("push_subscribe", [KEY, RAVI, EP(1), P256(7), AUTH(7), "iphone"]), { r: "ok", devices: 1 }, "another account turning it on at the same address");
row = await one(`select * from private.push_subscriptions where endpoint = $1`, [EP(1)]);
eq([row.user_id, row.status, row.fail_count, row.last_ok_at], [RAVI, "active", 0, null], "moves it to that account, as a new subscription");
eq((await rpc("push_state", [KEY, ASHA, EP(1)])), { r: "ok", on: false, devices: 1 }, "Asha's no longer");
eq((await rpc("push_state", [KEY, RAVI, EP(1)])), { r: "ok", on: true, devices: 1 }, "Ravi's is on");
eq((await rpc("push_state", [KEY, RAVI, null])), { r: "ok", on: false, devices: 1 }, "no address: only how many");
eq((await rpc("push_state", [KEY, null, EP(1)])).r, "bad", "push_state needs an account");

// 10 at once: an 11th makes room by the one used least lately.
for (let i = 100; i < 111; i++) await subscribe(PRIYA, i);
eq((await one(`select count(*)::int n from private.push_subscriptions where user_id = $1 and status = 'active'`, [PRIYA])).n, 10, "10 active at most");
eq(await one(`select status, gone_reason from private.push_subscriptions where endpoint = $1`, [EP(100)]), { status: "gone", gone_reason: "replaced" }, "the oldest is replaced");
eq((await subscribe(PRIYA, 100)).devices, 10, "turning that one on again replaces the next oldest");
eq((await one(`select status from private.push_subscriptions where endpoint = $1`, [EP(101)])).status, "gone", "(the next oldest)");
// 20 new addresses a day.
for (let i = 111; i < 120; i++) eq((await subscribe(PRIYA, i)).r, "ok", `(new address ${i - 99} of 20)`);
eq((await subscribe(PRIYA, 120)).r, "limit", "the 21st new address in a day is refused");
eq((await subscribe(PRIYA, 119)).r, "ok", "one of hers again is fine");
eq(await rpc("push_subscribe", [KEY, PRIYA, EP(2), P256(2), AUTH(2), "android"]), { r: "ok", devices: 10 }, "and an address moving to her (no new row) too");
eq((await one(`select user_id from private.push_subscriptions where endpoint = $1`, [EP(2)])).user_id, PRIYA, "(Asha's second device is Priya's now)");

/* ---------------- push_unsubscribe ---------------- */
await subscribe(ASHA, 3);
eq(await rpc("push_unsubscribe", [KEY, KIRAN, EP(3)]), { r: "ok", devices: 0 }, "someone else's address: nothing changes");
eq((await one(`select status from private.push_subscriptions where endpoint = $1`, [EP(3)])).status, "active", "(still Asha's, on)");
eq(await rpc("push_unsubscribe", [KEY, ASHA, EP(3)]), { r: "ok", devices: 0 }, "Asha turns it off");
eq(await one(`select status, gone_reason, gone_at is not null g from private.push_subscriptions where endpoint = $1`, [EP(3)]), { status: "gone", gone_reason: "off", g: true }, "gone, off (the row stays)");
eq((await rpc("push_unsubscribe", [KEY, ASHA, "https://fcm.googleapis.com/never-seen"])).r, "ok", "an address never seen: ok");
eq((await rpc("push_unsubscribe", [KEY, null, EP(3)])).r, "bad", "push_unsubscribe needs an account");
eq((await subscribe(ASHA, 3)).devices, 1, "on again");

/* ---------------- the trigger ---------------- */
const posts = async () => q(`select url, headers, body, timeout from net.posts order by id`);
const notify = async (user, type = "game_request", metadata = { gameId: G1 }) =>
  (await one(`insert into public.notifications (user_id, type, title, message, metadata) values ($1, $2, 'A title', 'A message', $3) returning id`, [user, type, JSON.stringify(metadata)])).id;
eq((await posts()).length, 0, "(no posts yet)");
const nNeha = await notify(NEHA);
eq((await posts()).length, 0, "an account with nothing on: nothing is posted");
const nAsha = await notify(ASHA);
let p = await posts();
eq(p.length, 1, "Asha has a phone on: one post");
eq(p[0].url, "https://www.tapturf.in/api/push/dispatch", "to the dispatch route");
eq(p[0].headers, { "Content-Type": "application/json", "x-revalidate-secret": "reval-secret" }, "with the secret the cache queue sends");
eq(p[0].body, { id: nAsha }, "and only the notification's id");
eq(p[0].timeout, 15000, "15 s for an answer");
eq((await one(`select type, title, message from public.notifications where id = $1`, [nAsha])), { type: "game_request", title: "A title", message: "A message" }, "the notification is made as it was");
// Through the game functions: Kiran asks to join Asha's game; Asha accepts; then Asha moves it.
await subscribe(KIRAN, 4, "android");
const req = await rpc("game_request_send", [KEY, KIRAN, G1, "Can play in goal"]);
eq(req.r, "ok", "(Kiran asks to join)");
p = await posts();
const askN = await one(`select id from public.notifications where user_id = $1 and type = 'game_request' order by created_at desc limit 1`, [ASHA]);
eq(p.at(-1).body, { id: askN.id }, "a join request (game_request_send) posts the host's notification");
await rpc("game_request_answer", [KEY, ASHA, req.request.id, true]);
const accN = await one(`select id from public.notifications where user_id = $1 and type = 'game_request_accepted'`, [KIRAN]);
eq((await posts()).at(-1).body, { id: accN.id }, "accepted (game_request_answer): Kiran's notification is posted");
await rpc("push_unsubscribe", [KEY, RAVI, EP(1)]);
const before = (await posts()).length;
const moved = await rpc("game_update", [KEY, ASHA, G1, JSON.stringify({ turf_id: T(2) }), null]);
eq(moved.notified, 2, "(the move tells Ravi's pending request and Kiran)");
eq((await posts()).length - before, 1, "a venue move to two players: one post, for the one with a phone on (Kiran)");
// Never fails the insert.
await q(`update private.app_secrets set name = 'revalidate-off' where name = 'revalidate'`);
const n1 = await notify(ASHA);
eq((await posts()).filter((x) => x.body.id === n1).length, 0, "no secret: made, nothing posted");
await q(`update private.app_secrets set name = 'revalidate' where name = 'revalidate-off'`);
await q(`select set_config('test.net', 'broken', false)`);
const n2 = await notify(ASHA);
ok(!!(await one(`select 1 from public.notifications where id = $1`, [n2])), "pg_net failing: the notification is still made");
await q(`select set_config('test.net', '', false)`);
await q(`alter function net.http_post(text, jsonb, jsonb, jsonb, integer) rename to http_post_away`);
const n3 = await notify(ASHA);
ok(!!(await one(`select 1 from public.notifications where id = $1`, [n3])), "no pg_net at all: still made");
await q(`alter function net.http_post_away(text, jsonb, jsonb, jsonb, integer) rename to http_post`);
const countBefore = (await posts()).length;
await db.exec(`begin; insert into public.notifications (user_id, type, title, message) values ('${ASHA}', 'game_request', 't', 'm'); rollback;`);
eq((await posts()).length, countBefore, "a rolled back insert posts nothing (pg_net's queue is rolled back with it)");
// Gone ones don't count.
await rpc("push_unsubscribe", [KEY, KIRAN, EP(4)]);
const n4 = await notify(KIRAN);
eq((await posts()).filter((x) => x.body.id === n4).length, 0, "only an active subscription: Kiran turned his off");

/* ---------------- push_targets ---------------- */
eq((await rpc("push_targets", [KEY, null])).r, "bad", "push_targets needs an id");
eq((await rpc("push_targets", [KEY, "cccccccc-cccc-4ccc-8ccc-000000000009"])).r, "gone", "a notification that isn't there");
eq((await rpc("push_targets", [KEY, nNeha])).r, "none", "an account with nothing on: none");
eq((await rpc("push_targets", [KEY, n4])).r, "none", "an account whose only one is off: none");
await subscribe(ASHA, 5, "mac");
await q(`update private.push_subscriptions set updated_at = now() - interval '1 hour' where endpoint = $1`, [EP(3)]);
const t1 = await rpc("push_targets", [KEY, nAsha]);
eq(t1.r, "ok", "Asha's notification");
ok(typeof t1.send_id === "string", "with a send to report on");
eq(t1.notification, { id: nAsha, type: "game_request", title: "A title", message: "A message", url: `/game/${G1}` }, "its title, message and page");
eq(t1.targets.map((x) => x.endpoint), [EP(5), EP(3)], "her active subscriptions only, newest first");
eq(Object.keys(t1.targets[0]).sort(), ["auth", "endpoint", "id", "p256dh"], "each with what the sender needs, nothing else");
eq((await rpc("push_targets", [KEY, nAsha])).r, "sent", "the same notification again: already sent, never twice");
eq((await one(`select kind, user_id, targets from private.push_sends where notification_id = $1`, [nAsha])), { kind: "notification", user_id: ASHA, targets: 2 }, "(one send, claimed)");
const nOld = await notify(ASHA);
await q(`update public.notifications set created_at = now() - interval '25 hours' where id = $1`, [nOld]);
eq((await rpc("push_targets", [KEY, nOld])).r, "old", "a notification made over a day ago is not sent");
// The page each one opens.
for (const c of CASES) {
  const id = (await one(`insert into public.notifications (user_id, type, title, message, metadata) values ($1, $2, 't', 'm', $3::jsonb) returning id`,
    [ASHA, c.type, c.metadata === null ? null : JSON.stringify(c.metadata)])).id;
  eq((await rpc("push_targets", [KEY, id])).notification.url, c.url, `url: ${c.what}`);
  eq((await one(`select private.push_url($1, $2::jsonb) u`, [c.type, c.metadata === null ? null : JSON.stringify(c.metadata)])).u, c.url, `push_url: ${c.what}`);
}
// 10 at most.
for (let i = 200; i < 212; i++) await subscribe(OMAR, i);
const nOmar = await notify(OMAR);
eq((await rpc("push_targets", [KEY, nOmar])).targets.length, 10, "10 targets at most");

/* ---------------- push_report ---------------- */
const sub = async (i) => one(`select id, status, gone_reason, fail_count, last_ok_at, last_fail_at from private.push_subscriptions where endpoint = $1`, [EP(i)]);
const s5 = await sub(5), s3 = await sub(3);
eq((await rpc("push_report", [KEY, null, "[]"])).r, "bad", "push_report needs a send");
eq((await rpc("push_report", [KEY, "cccccccc-cccc-4ccc-8ccc-000000000009", "[]"])).r, "bad", "a send that isn't there");
eq((await rpc("push_report", [KEY, t1.send_id, JSON.stringify({ id: s5.id })])).r, "bad", "results must be a list");
eq((await rpc("push_report", [KEY, t1.send_id, JSON.stringify(Array.from({ length: 51 }, () => ({ id: s5.id, result: "ok" })))])).r, "bad", "50 results at most");
const kiranSub = await sub(4);
const r1 = await rpc("push_report", [KEY, t1.send_id, JSON.stringify([{ id: s5.id, result: "ok" }, { id: s3.id, result: "gone" }, { id: kiranSub.id, result: "gone" },
  { id: "not-a-uuid", result: "ok" }, { result: "ok" }, 7, { id: s5.id, result: "exploded" }])]);
eq(r1, { r: "ok", sent: 1, gone: 1, failed: 0 }, "an ok and a gone (anything else is passed over)");
ok((await sub(5)).last_ok_at !== null, "ok: when it last worked");
eq((await sub(3)).status + "/" + (await sub(3)).gone_reason, "gone/expired", "gone: the push service said 404 or 410");
eq((await sub(4)).gone_reason, "off", "someone else's subscription in the report is left alone");
eq((await one(`select sent, gone, failed, reported_at is not null r from private.push_sends where id = $1`, [t1.send_id])), { sent: 1, gone: 1, failed: 0, r: true }, "the send records it");
eq((await rpc("push_report", [KEY, t1.send_id, JSON.stringify([{ id: s5.id, result: "failed" }])])).r, "done", "a send is reported once");
eq((await sub(5)).fail_count, 0, "(and that second report changed nothing)");
// 8 failures in a row.
for (let i = 1; i <= 8; i++) {
  const send = (await one(`insert into private.push_sends (kind, user_id, targets) values ('test', $1, 1) returning id`, [ASHA])).id;
  eq((await rpc("push_report", [KEY, send, JSON.stringify([{ id: s5.id, result: "failed" }])])).failed, 1, `(failure ${i})`);
  const s = await sub(5);
  eq([s.fail_count, s.status], [i, i < 8 ? "active" : "gone"], i < 8 ? `still on after ${i} failures` : "the 8th failure in a row: gone");
}
eq((await sub(5)).gone_reason, "failing", "gone, failing");
await subscribe(ASHA, 5, "mac");
eq([(await sub(5)).fail_count, (await sub(5)).status], [0, "active"], "turned on again: a fresh start");

/* ---------------- push_test_targets ---------------- */
eq((await rpc("push_test_targets", [KEY, NEHA])).r, "none", "a test with nothing on: none");
eq((await rpc("push_test_targets", [KEY, null])).r, "bad", "a test needs an account");
await q(`update private.push_sends set created_at = now() - interval '2 hours' where kind = 'test'`);
for (let i = 1; i <= 5; i++) {
  const t = await rpc("push_test_targets", [KEY, ASHA]);
  eq([t.r, t.targets.map((x) => x.endpoint)], ["ok", [EP(5)]], `test ${i}: her phones`);
}
eq((await rpc("push_test_targets", [KEY, ASHA])).r, "limit", "the 6th test in an hour is refused");
eq((await one(`select count(*)::int n from private.push_sends where kind = 'test' and user_id = $1 and created_at > now() - interval '1 hour'`, [ASHA])).n, 5, "(5 tests recorded)");

/* ---------------- the lockdown functions still work ---------------- */
const mine = await rpc("notifications_mine", [KEY, ASHA, 5]);
eq([mine.r, mine.notifications.length], ["ok", 5], "notifications_mine as before");
eq((await rpc("notifications_read", [KEY, ASHA, null])).r, "ok", "notifications_read as before");

/* ---------------- again, with rows in it ---------------- */
const rowsBefore = await q(`select * from private.push_subscriptions order by endpoint`);
const sendsBefore = (await one(`select count(*)::int n from private.push_sends`)).n;
await db.exec(sql);
eq(await q(`select * from private.push_subscriptions order by endpoint`), rowsBefore, "running it again keeps every subscription as it was");
eq((await one(`select count(*)::int n from private.push_sends`)).n, sendsBefore, "and every send");
eq((await q(`select tgname from pg_trigger where tgrelid = 'public.notifications'::regclass and not tgisinternal`)).map((r) => r.tgname), ["notifications_push"], "one trigger on notifications");
const n5 = await notify(ASHA);
eq((await posts()).filter((x) => x.body.id === n5).length, 1, "and it posts once, not twice");

console.log(`web_push: ${passed} checks passed`);
