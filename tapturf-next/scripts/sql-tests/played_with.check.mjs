// Applies 20261101_played_with.sql (twice) to an in-memory Postgres (PGlite)
// with stand-ins for Supabase's roles, the account key, users, usernames,
// games, participants and private.phone_proven, and checks: played means
// over and not cancelled (the same instants as lib/profile/history.ts); the
// WhatsApp switch is off until its owner turns it on, and on only for a
// proved number; a number shows only to someone who played a game with its
// owner, only while it is shared and proved, and never for a game moved to
// a time already gone, made after its start, or joined once it started
// (the trigger notes every move, whoever writes it); usernames only for public
// profiles; profile_owner only for a current public username; the server
// key everywhere; and the grants. Never touches a real database.
// The server key is 'server-key'.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/played_with.check.mjs supabase/migrations/20261101_played_with.sql
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [FILE] = process.argv.slice(2);
assert.ok(FILE, "pass 20261101_played_with.sql");
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
let passed = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };
const ok = (c, what) => { assert.ok(c, what); passed++; };

const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b/i, "nothing dropped or deleted");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
passed += 2;
ok(!/create or replace function public\.(profile_get|players_search|account_resolve)\b/.test(sql), "no existing function is replaced");

await db.exec(`
create role anon; create role authenticated;
create schema private;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', 'server-key');
create function private.account_key_ok(p_key text) returns boolean language sql stable security definer set search_path = '' as
  $$ select p_key is not null and p_key = (select s.value from private.app_secrets s where s.name = 'account') $$;
create table public.users (id uuid primary key, name text not null, phone text, email text);
create table public.usernames (user_id uuid primary key references public.users(id), username text not null unique, taggable boolean not null default true);
create table public.username_history (username text primary key, user_id uuid not null);
create table public.games (id uuid primary key default gen_random_uuid(), creator_id uuid, turf_id uuid, date date not null,
  start_time time not null, end_time time not null, status text, host_phone text, created_at timestamptz default now());
create table public.game_participants (id uuid primary key default gen_random_uuid(), game_id uuid, user_id uuid,
  joined_at timestamptz default now(), unique (game_id, user_id));
-- The tick's phone half (20261027_verified_tick.sql), reduced to a list of proved accounts.
create table private.proven (user_id uuid primary key);
create function private.phone_proven(p_user_id uuid) returns boolean language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from private.proven p where p.user_id = p_user_id) $$;
-- Supabase's default privileges: the API roles can read the app's tables.
grant select on public.users, public.usernames, public.games, public.game_participants to anon, authenticated;
`);
for (let i = 0; i < 2; i++) await db.exec(sql); // safe to run again

// ── Grants ────────────────────────────────────────────────
for (const f of ["account_whatsapp(text,uuid,boolean)", "played_with_extras(text,uuid)", "profile_owner(text,text)"]) {
  eq((await one(`select has_function_privilege('anon', 'public.${f}', 'execute') a`)).a, true, `${f}: the server's key-gated calls`);
  eq((await one(`select has_function_privilege('authenticated', 'public.${f}', 'execute') a`)).a, false, `${f}: not for signed-in browsers`);
}
for (const f of ["game_over_at(date,time,time)", "played_game_ids(uuid)", "whatsapp_phone_state(uuid)", "game_start_at(date,time)", "game_start_moved()", "whatsapp_mates(uuid)"]) {
  eq((await one(`select has_function_privilege('anon', 'private.${f}', 'execute') a`)).a, false, `private.${f} closed`);
  eq((await one(`select has_function_privilege('authenticated', 'private.${f}', 'execute') a`)).a, false, `private.${f} closed to authenticated`);
}
for (const role of ["anon", "authenticated"]) {
  eq((await one(`select has_table_privilege('${role}', 'private.whatsapp_shares', 'select') a`)).a, false, `${role} can't read who shares`);
  eq((await one(`select has_table_privilege('${role}', 'private.whatsapp_shares', 'insert') a`)).a, false, `${role} can't write it`);
  eq((await one(`select has_table_privilege('${role}', 'private.game_start_moves', 'select') a`)).a, false, `${role} can't read the moves`);
  eq((await one(`select has_table_privilege('${role}', 'private.game_start_moves', 'insert') a`)).a, false, `${role} can't write them`);
}
for (const f of ["account_whatsapp", "played_with_extras", "profile_owner", "whatsapp_mates", "game_start_moved"]) {
  eq((await one(`select p.prosecdef d, array_to_string(p.proconfig, ',') c from pg_proc p where p.proname = $1`, [f])), { d: true, c: 'search_path=""' }, `${f}: security definer, empty search_path`);
}

// ── When a game is over: the instants lib/profile/history.ts works out ──
const over = async (d, s, e) => new Date((await one("select private.game_over_at($1::date, $2::time, $3::time) t", [d, s, e])).t).toISOString();
eq(await over("2026-11-01", "19:00", "20:00"), "2026-11-01T14:30:00.000Z", "8 PM India");
eq(await over("2026-10-31", "23:00", "01:00"), "2026-10-31T19:30:00.000Z", "past midnight");
eq(await over("2026-11-01", "16:00", null), "2026-11-01T11:30:00.000Z", "no end: an hour on");
eq(await over("2026-11-01", "18:00", "18:00"), "2026-11-02T12:30:00.000Z", "an end at its start is the next day");

// ── People and games, around now ─────────────────────────
const id = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const P = { asha: id(1), ravi: id(2), priya: id(3), kiran: id(4), neha: id(5), omar: id(6), lee: id(7), zoe: id(8), sam: id(9) };
// For the games that only look played: each shares a proved number.
const Q = { tara: id(10), umar: id(11), vik: id(12), wen: id(13), xia: id(14), yan: id(15), zed: id(16), ali: id(17), bo: id(18) };
const ph = (n) => `+9198000000${String(n).padStart(2, "0")}`;
await q(`insert into public.users (id, name, phone) values
  ($1, 'Asha', '${ph(1)}'), ($2, 'Ravi', null), ($3, 'Priya', '${ph(3)}'), ($4, 'Kiran', '${ph(4)}'), ($5, 'Neha', '${ph(5)}'),
  ($6, 'Omar', '${ph(6)}'), ($7, 'Lee', '${ph(7)}'), ($8, 'Zoe', '${ph(8)}'), ($9, 'Sam', '98000 00009')`, Object.values(P));
await q(`insert into private.proven values ($1), ($2), ($3), ($4), ($5), ($6), ($7)`, [P.asha, P.priya, P.neha, P.omar, P.lee, P.zoe, P.sam]);
await q(`insert into public.usernames values ($1, 'asha', true), ($2, 'ravi', true), ($3, 'priya', true), ($4, 'kiran', false)`, [P.asha, P.ravi, P.priya, P.kiran]);
await q(`insert into public.username_history values ('ashar', $1)`, [P.asha]);

// India's date and clock, offset by minutes from now.
const ist = (mins) => new Date(Date.now() + (330 + mins) * 60_000).toISOString();
const at = (mins) => ({ date: ist(mins).slice(0, 10), time: ist(mins).slice(11, 16) });
const utc = (mins) => new Date(Date.now() + mins * 60_000).toISOString();
const DAY = 1440;
// Made a day before it starts (or a day ago, for one still to come), everyone in it half a day before; `made` and `joined` (by person) say otherwise.
async function game(host, people, startMins, lengthMins, status = "completed", { made, joined = {} } = {}) {
  const s = at(startMins);
  const e = at(startMins + lengthMins);
  const before = Math.min(startMins, 0);
  const g = (await one(`insert into public.games (creator_id, date, start_time, end_time, status, host_phone, created_at) values ($1, $2, $3, $4, $5, '+919000000999', $6) returning id`,
    [host, s.date, s.time, e.time, status, utc(made ?? before - DAY)])).id;
  for (const p of people) await q(`insert into public.game_participants (game_id, user_id, joined_at) values ($1, $2, $3)`, [g, p, utc(joined[p] ?? before - DAY / 2)]);
  return g;
}
await game(P.asha, [P.asha, P.ravi, P.priya, P.kiran], -3 * DAY, 60); // played: Asha hosts Ravi, Priya, Kiran
await game(P.neha, [P.neha, P.asha], 2 * DAY, 60, "open"); // not yet played
await game(P.omar, [P.omar, P.asha], -5 * DAY, 60, "cancelled"); // cancelled
await game(P.lee, [P.lee, P.asha], -30, 90, "open"); // on right now
await game(P.priya, [P.priya, P.zoe], -2 * DAY, 60); // Priya and Zoe, without Asha
await game(P.ravi, [P.asha], -10 * DAY, 60); // an old game: its host has no participant row
await game(P.sam, [P.sam, P.asha], -4 * DAY, 60); // Sam's number is not a +91 number

const K = "server-key";
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const wa = (user, on = null, key = K) => rpc("account_whatsapp", [key, user, on]);
const extras = async (user, key = K) => rpc("played_with_extras", [key, user]);
const names = async (user) => {
  const r = await extras(user);
  const byId = Object.fromEntries(Object.entries({ ...P, ...Q }).map(([k, v]) => [v, k]));
  return Object.fromEntries(r.players.map((p) => [byId[p.id], [p.u, p.wa]]));
};

// ── The server key, everywhere ───────────────────────────
for (const [what, r] of [
  ["switch", await wa(P.asha, null, "wrong")],
  ["switch with no key", await wa(P.asha, true, null)],
  ["extras", await extras(P.asha, "wrong")],
  ["owner", await rpc("profile_owner", ["", "asha"])],
]) eq(r, { r: "unavailable" }, `${what}: the server key or nothing`);
eq((await one("select count(*)::int n from private.whatsapp_shares")).n, 0, "nothing written without the key");

// ── The switch ───────────────────────────────────────────
eq(await wa(P.asha), { r: "ok", on: false, phone: "ok" }, "off until its owner turns it on");
eq(await wa(P.priya, true), { r: "ok", on: true, phone: "ok" }, "Priya shares hers");
eq(await wa(P.priya), { r: "ok", on: true, phone: "ok" }, "and it stays on");
eq(await wa(P.kiran, true), { r: "phone", on: false, phone: "unproven" }, "a number never proved can't be shared");
eq(await wa(P.ravi, true), { r: "phone", on: false, phone: "none" }, "nor no number");
eq(await wa(P.sam, true), { r: "phone", on: false, phone: "none" }, "nor one that isn't +91 and 10 digits");
eq(await wa(P.ravi, false), { r: "ok", on: false, phone: "none" }, "off always works");
eq(await wa(id(99), true), { r: "bad" }, "no such account");
eq(await wa(null, null), { r: "bad" }, "no account");
for (const p of [P.neha, P.omar, P.lee, P.zoe]) await wa(p, true);
eq((await one("select count(*)::int n from private.whatsapp_shares where share")).n, 5, "five share");

// ── Who sees what ────────────────────────────────────────
eq(await names(P.asha), {
  ravi: ["ravi", null],
  priya: ["priya", ph(3)],
  kiran: [null, null],
  sam: [null, null],
}, "Asha's played games only: Priya's number (shared, proved); Kiran's profile is not public; never Neha (not played yet), Omar (cancelled), Lee (on now) or Zoe (never with Asha), though all of them share");
eq(await names(P.zoe), { priya: ["priya", ph(3)] }, "Zoe played with Priya");
eq(await names(P.ravi), { asha: ["asha", null], priya: ["priya", ph(3)], kiran: [null, null] }, "the host of a game counts as in it, row or not; Asha doesn't share");
eq(await names(P.neha), {}, "a game that hasn't happened: nobody yet");
eq(await names(P.omar), {}, "a cancelled game: nobody");
eq(await names(P.lee), {}, "a game on right now: not yet");
ok(!(await extras(P.asha)).players.some((p) => p.id === P.asha), "never yourself");

// Asha turns hers on: the people she played with see it, nobody else.
await wa(P.asha, true);
eq((await names(P.priya)).asha, ["asha", ph(1)]);
eq((await names(P.ravi)).asha, ["asha", ph(1)]);
eq((await names(P.zoe)).asha, undefined, "Zoe never played with Asha");
eq((await names(P.neha)).asha, undefined, "Neha hasn't yet");
// Off again, or a number that stops being proved, and it is gone at once.
await wa(P.asha, false);
eq((await names(P.priya)).asha, ["asha", null], "off: gone");
await q("update private.whatsapp_shares set share = true where user_id = $1", [P.kiran]);
eq((await names(P.asha)).kiran, [null, null], "a share left on for a number that isn't proved never shows it");
await q("delete from private.proven where user_id = $1", [P.priya]);
eq((await names(P.asha)).priya, ["priya", null], "Priya's number stops being proved: gone");
eq(await wa(P.priya), { r: "ok", on: true, phone: "unproven" }, "her switch says why");
await q("insert into private.proven values ($1)", [P.priya]);
ok(!JSON.stringify(await extras(P.asha)).includes("+919000000999"), "a game's own number is never read");

// ── Played for real: in it before it started, at a time set before it came ──
await q(`insert into public.users (id, name, phone) values ${Object.keys(Q).map((k, i) => `($${i + 1}, '${k}', '${ph(10 + i)}')`).join(", ")}`, Object.values(Q));
await q(`insert into private.proven values ${Object.keys(Q).map((_, i) => `($${i + 1})`).join(", ")}`, Object.values(Q));
for (const p of Object.values(Q)) await wa(p, true);
const moves = async (g) => (await one("select count(*)::int n from private.game_start_moves where game_id = $1", [g])).n;

// The host moves an open game, a player already in, to a time already gone (the lockdown's game_update allows a start earlier today).
const moved = await game(Q.tara, [Q.tara, Q.umar], 2 * DAY, 60, "open");
eq(await names(Q.tara), {}, "still to come");
await q("update public.games set status = 'full', start_time = start_time, date = date where id = $1", [moved]);
eq(await moves(moved), 0, "an edit that keeps its date and start time is no move");
const gone = at(-180);
await q("update public.games set date = $2, start_time = $3, end_time = $4 where id = $1", [moved, gone.date, gone.time, at(-120).time]);
eq(await moves(moved), 1, "the move is noted");
eq(await names(Q.tara), { umar: [null, null] }, "moved into the past: played by the clock, so listed, but Umar's number stays hidden");
eq(await names(Q.umar), { tara: [null, null] }, "and Tara's from Umar");

// A move is fair only when it was made before the new start.
const shifted = await game(Q.vik, [Q.vik, Q.wen], -2 * DAY, 60);
eq(await names(Q.vik), { wen: [null, ph(13)] }, "a fair game: the number shows");
await q("update public.games set start_time = $2 where id = $1", [shifted, at(-2 * DAY + 15).time]);
eq(await names(Q.vik), { wen: [null, null] }, "its start moved after it began: hidden");
await q("update private.game_start_moves set moved_at = $2 where game_id = $1", [shifted, utc(-2 * DAY - 60)]);
eq(await names(Q.vik), { wen: [null, ph(13)] }, "moved an hour before it began: shown again");
eq(await names(Q.wen), { vik: [null, ph(12)] });

// Made after its own start (a game that only looks played), and a player accepted once it had started.
await game(Q.xia, [Q.xia, Q.yan], -DAY, 60, "completed", { made: -DAY + 10, joined: { [Q.yan]: -DAY + 12 } });
eq(await names(Q.xia), { yan: [null, null] }, "made after it started: no number");
eq(await names(Q.yan), { xia: [null, null] });
await game(Q.zed, [Q.zed, Q.ali, Q.bo], -DAY, 60, "completed", { joined: { [Q.bo]: -DAY + 40 } });
eq(await names(Q.zed), { ali: [null, ph(17)], bo: [null, null] }, "Ali was in before the start; Bo was accepted 40 minutes in");
eq(await names(Q.bo), { zed: [null, null], ali: [null, null] }, "so Bo sees neither number");
eq((await names(Q.ali)).zed, [null, ph(16)], "while Ali and the host see each other's");

// The trigger notes a move whoever writes it, though nobody may call its function.
await db.exec("create role writer; grant select, update on public.games to writer");
const later = await game(Q.tara, [Q.tara], 3 * DAY, 60, "open");
await db.exec("set role writer");
try {
  await q("update public.games set start_time = '05:00' where id = $1", [later]);
} finally {
  await db.exec("reset role");
}
eq(await moves(later), 1, "noted for any writer");

// ── The profile's owner ──────────────────────────────────
eq(await rpc("profile_owner", [K, "asha"]), { r: "ok", id: P.asha });
eq(await rpc("profile_owner", [K, "PRIYA"]), { r: "ok", id: P.priya }, "any case");
eq(await rpc("profile_owner", [K, "kiran"]), { r: "ok", id: null }, "a profile that isn't public");
eq(await rpc("profile_owner", [K, "ashar"]), { r: "ok", id: null }, "an old username (the page redirects it first)");
eq(await rpc("profile_owner", [K, "nobody"]), { r: "ok", id: null });
eq(await rpc("profile_owner", [K, null]), { r: "ok", id: null });

// ── As the API's anon role ───────────────────────────────
await db.exec("set role anon");
try {
  let refused = null;
  try { await q("select * from private.whatsapp_shares"); } catch (e) { refused = String(e.message ?? e); }
  ok(refused && /permission denied/.test(refused), "anon can't read who shares");
  eq(await wa(P.asha, null, "wrong"), { r: "unavailable" }, "anon without the key: nothing");
  eq((await wa(P.asha)).r, "ok", "the server's call (anon with the key) works");
} finally {
  await db.exec("reset role");
}
await db.exec("set role authenticated");
try {
  let refused = null;
  try { await wa(P.asha); } catch (e) { refused = String(e.message ?? e); }
  ok(refused && /permission denied/.test(refused), "a signed-in browser can't call it at all");
} finally {
  await db.exec("reset role");
}

console.log(`played_with: ${passed} checks passed`);
