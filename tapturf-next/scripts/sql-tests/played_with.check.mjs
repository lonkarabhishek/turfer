// Applies 20261101_played_with.sql (twice) to an in-memory Postgres (PGlite)
// with stand-ins for Supabase's roles, the account key, users, usernames,
// games, participants and private.phone_proven, and checks: played means
// over and not cancelled (the same instants as lib/profile/history.ts); the
// WhatsApp switch is off until its owner turns it on, and on only for a
// proved number; a number shows only to someone who played a game with its
// owner, only while it is shared and proved; usernames only for public
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
  start_time time not null, end_time time not null, status text, host_phone text);
create table public.game_participants (id uuid primary key default gen_random_uuid(), game_id uuid, user_id uuid, unique (game_id, user_id));
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
for (const f of ["game_over_at(date,time,time)", "played_game_ids(uuid)", "whatsapp_phone_state(uuid)"]) {
  eq((await one(`select has_function_privilege('anon', 'private.${f}', 'execute') a`)).a, false, `private.${f} closed`);
  eq((await one(`select has_function_privilege('authenticated', 'private.${f}', 'execute') a`)).a, false, `private.${f} closed to authenticated`);
}
for (const role of ["anon", "authenticated"]) {
  eq((await one(`select has_table_privilege('${role}', 'private.whatsapp_shares', 'select') a`)).a, false, `${role} can't read who shares`);
  eq((await one(`select has_table_privilege('${role}', 'private.whatsapp_shares', 'insert') a`)).a, false, `${role} can't write it`);
}
for (const f of ["account_whatsapp", "played_with_extras", "profile_owner"]) {
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
async function game(host, people, startMins, lengthMins, status = "completed") {
  const s = at(startMins);
  const e = at(startMins + lengthMins);
  const g = (await one(`insert into public.games (creator_id, date, start_time, end_time, status, host_phone) values ($1, $2, $3, $4, $5, '+919000000999') returning id`,
    [host, s.date, s.time, e.time, status])).id;
  for (const p of people) await q(`insert into public.game_participants (game_id, user_id) values ($1, $2)`, [g, p]);
  return g;
}
const DAY = 1440;
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
  const byId = Object.fromEntries(Object.entries(P).map(([k, v]) => [v, k]));
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
