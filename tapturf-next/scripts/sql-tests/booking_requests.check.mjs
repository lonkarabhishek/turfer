// Applies the account, contact-email, admin-verified, auth-mirror, myTapturf,
// claims-account, people, lockdown-step-4, account-links and owner call
// number migrations to stand-ins for Supabase in an in-memory Postgres
// (PGlite), as turf_availability.check.mjs does, with the turfs cache
// trigger (20261025_turf_claimed.sql), 20261027_verified_tick.sql, the
// public.notifications stand-in from owner_claims_clarity.check.mjs and
// 20261105_turf_availability.sql, then 20261106_booking_requests.sql twice,
// and checks booking requests: the file's rules; booking_guard is
// slots_guard's body plus the staff line; requests off refuse with nothing
// written; only a turf's own owner or manager switches them (never another
// account, a player, staff or the site owner); stale, unclaimed and
// inactive turfs take none, and turf_takes_requests agrees; a Google
// account with no number and a typed number never proved are refused, a
// proved one goes through; the turf's own people (staff too) can't ask;
// bad input, started hours and hours marked Booked (the owner's marks
// alone: an hour tapped Free again after a confirm can be asked for and
// confirmed again); the limits (one per turf per day, none overlapping
// their own waiting one, three waiting, ten sends a day); one
// notification per owner or manager account (never staff), in exact
// words, never a name or a number; the owner's list; confirm marks the
// hours Booked and declines the other waiting requests for them, telling
// each player; a confirm refused when an hour was marked meanwhile;
// decline with a reason; owner and player cancels (hours freed, the right
// people told), and a cancel of a request the turf answered meanwhile
// refused; expiry; a removed player's request still answerable, with
// every request it overlaps; no personal data reachable by anyone else;
// every function's grants; the file again with the rows kept. Never
// touches a real database. Made-up people and numbers.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/booking_requests.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: booking_requests.check.mjs <supabase/migrations>");
const NEW = fs.readFileSync(`${M}/20261106_booking_requests.sql`, "utf8");
const CASES = JSON.parse(fs.readFileSync(path.join(M, "../../lib/booking/when.cases.json"), "utf8"));
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };

// ── 0. The file. ──
const code = NEW.replace(/^\s*--.*$/gm, "");
assert.doesNotMatch(NEW, /\bdrop\b|\bdelete\b|\btruncate\b/i, "no destructive keywords, comments included");
assert.doesNotMatch(NEW, /[—–]/, "no em or en dashes");
assert.match(NEW, /^set local lock_timeout = '5s';\n/, "starts with the lock timeout");
assert.doesNotMatch(code, /\bupdate\s+public\.turfs\b|\binsert\s+into\s+public\.turfs\b/i, "never writes public.turfs");
assert.doesNotMatch(code, /\bgrant\b[^;]*\bon\s+(table\s+)?public\.|\bpolicy\b/i, "no grant or policy on a public table");
passed += 5;
for (const m of code.matchAll(/select[^;]*?\bfor update\b/gis)) ok(/from private\.booking_requests b where b\.id = p_request_id for update$/i.test(m[0].replace(/\s+/g, " ")), `a row lock is a request's own: ${m[0].slice(-80)}`);
for (const w of ["Replaced: none.", "The app works before this file", "public.bookings (the old app's table) is not touched", "read 6 Nov 2026", "Erasing an account",
  "4ecdf11ccc22bfbed25b7cc4b93e5486", "2ab91047132da79f8f3052f95c6f52de", "daec6751657cce4d6a97d090b20a0035", "a87c760baa6e95101ae1ce0b0124189e", "67a8af535e56722c351d83d6c9306ce1", "fb271509244b8986ed81c48aa5c58531",
  "3409327162994d55152da920ee1d7c6f", "55f626c4384ee7e7b6a62f00a8121935", "21123cc9e231c8af279c7ddc2da07053", "34cff6ff01c863fd8921c78d12b2fb99",
  "ca605fa89a97497134b690e753dc5c0e", "a37bb5437bca089d3ed548a6b147fe54", "e962f47c36c9c2ffc0ad6a70c9aa63da", "7194c64e4d38986c2f21fe7b60f911f8",
  "1272b4bded03cbebd6289b1f25fa385c"]) ok(NEW.includes(w), `the header says ${w}`);
const MADE = [...NEW.matchAll(/create or replace function (\w+)\.(\w+)\(/gi)].map((m) => `${m[1]}.${m[2]}`);
const PUBLIC_FNS = ["booking_request_send", "booking_requests_mine", "booking_request_cancel", "owner_booking_requests", "owner_set_booking_requests", "owner_answer_booking_request", "turf_takes_requests"];
const PRIVATE_FNS = ["booking_max_hours", "booking_max_waiting", "booking_max_per_turf_day", "booking_max_sends", "booking_list_max", "booking_clock", "booking_when",
  "booking_owners", "booking_guard", "booking_open", "booking_state", "booking_taken", "booking_free", "booking_expire", "booking_notify", "booking_mine_json", "booking_owner_json", "booking_owner_state"];
eq(MADE.sort(), [...PUBLIC_FNS.map((f) => `public.${f}`), ...PRIVATE_FNS.map((f) => `private.${f}`)].sort(), "exactly these 25 functions, every one new");
ok(MADE.every((f) => /^(public\.(booking_|owner_booking|owner_set_booking|owner_answer_booking|turf_takes)|private\.booking_)/.test(f)), "none of them replaces a function from before");

// ── The database before it (turf_availability.check.mjs's stand-ins and migrations). ──
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; create schema auth; create schema extensions;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('live_write', 'L'||repeat('1', 63));
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now(), last_sign_in_at timestamptz, phone text);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null, provider text not null,
  identity_data jsonb not null, created_at timestamptz default now());
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create table public.users (
  id uuid not null default gen_random_uuid() primary key,
  email varchar unique, password varchar, name varchar not null, phone varchar,
  role varchar default 'user' check (role in ('user','owner','admin')),
  is_verified boolean default false, created_at timestamptz default now(), updated_at timestamptz default now(),
  profile_image_url text, firebase_uid text unique);
create unique index users_phone_key on public.users (phone) where phone is not null;
alter table public.users enable row level security;
create policy "Anyone can insert users" on public.users for insert with check (true);
grant select, insert, update on public.users to anon, authenticated;
create table public.user_logins (id bigint generated always as identity primary key, user_id uuid not null,
  method text not null check (method in ('phone','google')), created_at timestamptz not null default now());
create table public.live_matches (code text primary key, match jsonb, rev bigint, status text, updated_at timestamptz default now());
create table public.turfs (id uuid primary key default gen_random_uuid(), name text, slug text, city text, area text, address text, is_active boolean default true,
  contact_info jsonb, owner_phone text, whatsapp_phone text, landline_phone text, cover_image text, images jsonb, owner_id uuid,
  morning_price int, afternoon_price int, evening_price int, weekend_morning_price int, weekend_afternoon_price int, weekend_evening_price int,
  has_floodlights boolean, is_covered boolean, parking_available boolean, washroom_available boolean, changing_room_available boolean,
  has_cafeteria boolean, has_drinking_water boolean, equipment_provided boolean, is_24x7 boolean, start_time time, end_time time,
  closed_days text, description text, surface_type text, number_of_grounds int, formats jsonb, opening_hours jsonb,
  price_owner_confirmed boolean, price_verified_at timestamptz, price_unit text, updated_at timestamptz default now());
grant select on public.turfs to anon, authenticated;
create table public.games (id uuid primary key default gen_random_uuid(), creator_id uuid, turf_id uuid, host_name text, date date, status text, created_at timestamptz default now());
create table public.game_requests (id uuid primary key default gen_random_uuid(), user_id uuid, game_id uuid, requester_name text, status text, created_at timestamptz default now());
create table public.game_participants (id uuid primary key default gen_random_uuid(), game_id uuid, user_id uuid, joined_at timestamptz default now());
create table public.reviews (id uuid primary key default gen_random_uuid(), turf_id uuid, user_id uuid, rating int, comment text, author_name text, source text, created_at timestamptz default now());
create table public.review_votes (review_id uuid, user_id uuid);
create table public.bookings (id uuid primary key default gen_random_uuid(), user_id uuid);
create table public.turf_contact_clicks (id bigint generated always as identity primary key, turf_id uuid, user_id uuid, kind text, created_at timestamptz default now());
create table public.ask_queries (id bigint generated always as identity primary key, user_id uuid, query text, filters jsonb, created_at timestamptz default now());
create table public.turf_suggestions (id uuid primary key default gen_random_uuid(), turf_id uuid not null, user_id uuid, contact_phone text, whatsapp_phone text,
  status text not null default 'pending', created_at timestamptz not null default now(), moderated_at timestamptz, ai_review jsonb, notes text);
create table public.turf_suggestion_edits (id uuid primary key default gen_random_uuid(), suggestion_id uuid not null, changes jsonb not null, created_at timestamptz not null default now());
create table public.user_signup_context (user_id uuid primary key, ctx jsonb, created_at timestamptz default now());
create table private.user_cities (user_id uuid primary key, city text, source text, ip_city text, at_signup boolean, updated_at timestamptz);
-- public.notifications as production has it (information_schema, 5 Nov 2026), as in owner_claims_clarity.check.mjs.
create table public.notifications (id uuid not null default gen_random_uuid() primary key, user_id uuid references public.users(id) on delete cascade,
  type text not null, title text not null, message text not null, metadata jsonb default '{}'::jsonb, is_read boolean default false, created_at timestamptz default now());
`);
for (const f of ["20261019_mytapturf.sql", "20261019_mytapturf_claims.sql", "20261021_accounts_usernames.sql", "20261021_accounts_fixes.sql",
  "20261021_phone_identity_exact_india.sql", "20261022_people_fixes.sql", "20261025_contact_email.sql", "20261025_admin_verified.sql",
  "20261025_auth_mirror_google_only.sql", "20261025_claims_account.sql", "20261024_users_lockdown_step4.sql",
  "20261026_account_links.sql", "20261026_account_links_reads.sql", "20261028_owner_call_number.sql"]) await db.exec(fs.readFileSync(`${M}/${f}`, "utf8"));
// Firebase can't be reached here: _caller_key and firebase_phone10 stand-ins, as in turf_availability.check.mjs.
await db.exec(`
create or replace function private.firebase_phone10(p_token text) returns text language sql as
  $$ select case when p_token ~ '^proof:[6-9][0-9]{9}$' then substr(p_token, 7) end $$;
create or replace function public._caller_key(p_token text) returns text language sql security definer set search_path = public as $$
  select case when p_token ~ '^phone:[6-9][0-9]{9}$' then 'p:' || substr(p_token, 7) end $$;
create or replace function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
create or replace function public._is_admin_key(p_key text) returns boolean language sql immutable as $$ select p_key = 'p:9000000099' $$;
create table private.dirty_log (id bigserial primary key, keys text[], urgent boolean);
create or replace function private.mark_dirty(p_keys text[], p_urgent boolean default false) returns void language sql as
  $$ insert into private.dirty_log (keys, urgent) values ((select array_agg(distinct x order by x) from unnest(p_keys) x where x is not null), p_urgent) $$;
create or replace function private.list_key(p_city text) returns text language sql immutable as
  $$ select 'list:' || case when p_city ~ '^[a-z][a-z-]{1,30}$' then p_city else 'all' end $$;
`);
await db.exec(fs.readFileSync(`${M}/20261025_turf_claimed.sql`, "utf8"));
await db.exec(`create trigger turfs_mark_cache_dirty after insert or update or delete on public.turfs for each row execute function private.mark_turf_dirty();`);
await db.exec(fs.readFileSync(`${M}/20261027_verified_tick.sql`, "utf8"));
await db.exec(fs.readFileSync(`${M}/20261105_turf_availability.sql`, "utf8"));

const KEY = (await one("select value from private.app_secrets where name = 'account'")).value;
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const phoneAccount = async (p10, name, log) => {
  const r = await rpc("account_resolve", [KEY, "phone", `+91${p10}`, null, null, name, null, true, log]);
  assert.equal(r.r, "ok", `account for ${name}`);
  return r.id;
};
const T = (i) => `cccccccc-0000-4000-8000-${String(i).padStart(12, "0")}`;
await q(`insert into public.turfs (id, name, slug, city, owner_phone, whatsapp_phone) values
  ('${T(1)}', 'One Arena', 'one-arena-nashik', 'nashik', '9000000101', '9000000102'),
  ('${T(2)}', 'Two Arena', 'two-arena-pune', 'pune', '9000000201', null),
  ('${T(3)}', 'Three Arena', 'three-arena-nashik', 'nashik', '9000000301', null)`);
// The turf's people: A owns One, M manages it (both numbers are on its page); O owns Two. Nobody has Three.
const A = await phoneAccount("9000000101", "Asha Owner", false);
const MGR = await phoneAccount("9000000102", "Manoj Manager", false);
const O2 = await phoneAccount("9000000201", "Omkar Owner", false);
eq(await rpc("owner_claim", ["phone:9000000101", T(1), null, null, "owner"]), { status: "active" }, "A runs One");
eq(await rpc("owner_claim", ["phone:9000000102", T(1), null, null, "manager"]), { status: "active" }, "M manages One");
eq(await rpc("owner_claim", ["phone:9000000201", T(2), null, null, "owner"]), { status: "active" }, "O runs Two");
// A's second sign-in on One (a Google address, same account): still one account, one notification.
await q(`insert into public.turf_owners (turf_id, user_key, status, via, user_id) values ($1, 'e:asha.owner@example.com', 'active', 'admin', $2)`, [T(1), A]);
// Players: phone sign-ins logged since 21 Oct (their numbers are proved), a Google account with no number, and a typed number.
const P = await phoneAccount("9100000001", "Priya Player", true);
const Q = await phoneAccount("9100000002", "Qasim Player", true);
const R = await phoneAccount("9100000003", "Rohan Player", true);
await q(`insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values ('aaaaaaaa-aaaa-4aaa-8aaa-000000000030', 'gita.standin@example.com', now(), '{"provider":"google","providers":["google"]}')`);
await q(`insert into auth.identities (user_id, provider, identity_data) values ('aaaaaaaa-aaaa-4aaa-8aaa-000000000030', 'google', '{"email":"gita.standin@example.com","email_verified":true}')`);
const G = (await rpc("account_resolve", [KEY, "google", null, "aaaaaaaa-aaaa-4aaa-8aaa-000000000030", "gita.standin@example.com", "Gita Google", null, true, true])).id;
const TY = "aaaaaaaa-aaaa-4aaa-8aaa-000000000031";
await q(`insert into public.users (id, name, phone, password) values ($1, 'Tara Typed', '+919100000009', 'phone-auth-no-password')`, [TY]);
eq([await one(`select private.phone_proven($1) p`, [P]), await one(`select private.phone_proven($1) p`, [G]), await one(`select private.phone_proven($1) p`, [TY])],
  [{ p: true }, { p: false }, { p: false }], "P's number is proved; G has none; TY's was only typed");

// ── 1. Before the file: no functions. Then the file, twice. ──
eq((await q(`select 1 from pg_proc where proname = any($1)`, [[...PUBLIC_FNS, ...PRIVATE_FNS]])).length, 0, "before: no booking functions");
await db.exec(NEW);
await db.exec(NEW);
eq((await q(`select p.proname from pg_proc p where p.proname = any($1) group by 1 having count(*) > 1`, [[...PUBLIC_FNS, ...PRIVATE_FNS]])).length, 0, "no overloads after running it twice");

// ── 2. Grants: private tables, RLS on; public functions for anon and authenticated, not PUBLIC; the private ones for nobody. ──
for (const t of ["turf_booking_settings", "booking_requests"]) {
  const p = await one(`select has_table_privilege('anon', c.oid, 'select,insert,update') a, has_table_privilege('authenticated', c.oid, 'select,insert,update') u,
    c.relrowsecurity r from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'private' and c.relname = $1`, [t]);
  eq([p.a, p.u, p.r], [false, false, true], `private.${t}: no access for anon or authenticated, RLS on`);
}
for (const f of PUBLIC_FNS) {
  const fn = await one(`select p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u,
    has_function_privilege('public', p.oid, 'execute') p from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [f]);
  eq([fn.prosecdef, fn.proconfig, fn.a, fn.u, fn.p], [true, ['search_path=""'], true, true, false], `${f}: security definer, search_path '', anon and authenticated only`);
}
const priv = await q(`select p.proname, p.proconfig, has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute') open
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = any($1)`, [PRIVATE_FNS]);
eq([priv.length, priv.filter((r) => r.open).length, priv.filter((r) => String(r.proconfig) !== 'search_path=""').length], [18, 0, 0], "the 18 private helpers: nobody may call them, search_path ''");
// booking_guard is slots_guard (Free slots' owner rule) with one line more: staff claims don't count.
const src = async (schema, fn) => (await one(`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2`, [schema, fn])).prosrc;
const STAFF_LINE = "       and coalesce(o.role, 'owner') <> 'staff'\n";
const guardSrc = await src("private", "booking_guard");
ok(guardSrc.includes(STAFF_LINE), "booking_guard has the staff line");
eq(guardSrc.replace(STAFF_LINE, ""), await src("private", "slots_guard"), "and is otherwise slots_guard's body, character for character");

// ── 3. The constants and the words. ──
eq(await one(`select private.booking_max_hours() h, private.booking_max_waiting() w, private.booking_max_per_turf_day() d, private.booking_max_sends() s, private.booking_list_max() l`),
  { h: 3, w: 3, d: 1, s: 10, l: 50 }, "the constants");
for (const c of CASES) eq((await one(`select private.booking_when(private.slot_at($1), $2) w`, [c.at, c.hours])).w, c.when, `booking_when ${c.at} ${c.hours}h`);
await db.exec(`set timezone = 'UTC'`);
eq((await one(`select private.booking_when(private.slot_at($1), $2) w`, [CASES[1].at, CASES[1].hours])).w, CASES[1].when, "any session time zone, the same words");
await db.exec(`reset timezone`);

// ── Helpers. ──
const IST = 330 * 60000;
/** A slot key `days` from today's India date at hh:mm. Day 1 and on is always to come; day 6 is inside the window. */
const K = (days, hh, mm = 0) => `${new Date(Date.now() + IST + days * 86400000).toISOString().slice(0, 10)}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
const when = async (at, hours) => (await one(`select private.booking_when(private.slot_at($1), $2) w`, [at, hours])).w;
const TOK = { A: "phone:9000000101", M: "phone:9000000102", O2: "phone:9000000201", P: "phone:9100000001", ADMIN: "phone:9000000099" };
const send = (u, turf, at, hours = 1, note = null, key = KEY) => rpc("booking_request_send", [key, u, turf, at, hours, note]);
const mine = async (u, key = KEY) => rpc("booking_requests_mine", [key, u]);
const cancel = (u, id, key = KEY, expect = null) => rpc("booking_request_cancel", [key, u, id, expect]);
const list = (tok, turf) => rpc("owner_booking_requests", [tok, turf]);
const setOn = (tok, turf, on) => rpc("owner_set_booking_requests", [tok, turf, on]);
const answer = (tok, id, action, reason = null) => rpc("owner_answer_booking_request", [tok, id, action, reason]);
const takes = async (turf) => (await one(`select public.turf_takes_requests($1) r, pg_typeof(public.turf_takes_requests($1))::text t`, [turf]));
const notes = async (u) => q(`select type, title, message, metadata from public.notifications where user_id = $1 order by created_at, id`, [u]);
const noteN = async () => Number((await one(`select count(*) n from public.notifications`)).n);
const rowsN = async () => Number((await one(`select count(*) n from private.booking_requests`)).n);
const row = async (id) => one(`select status, changed_by, reason, note, player_name, player_phone, hours from private.booking_requests where id = $1`, [id]);
const slots = async (turf) => q(`select private.slot_key(starts_at) at, status from private.turf_slots where turf_id = $1 order by starts_at`, [turf]);
const updatedAt = async (turf) => (await one(`select updated_at from private.turf_availability where turf_id = $1`, [turf]))?.updated_at?.toISOString() ?? null;
const PHONE_RE = /\+?91\d{10}|\b\d{10}\b/;

// ── 4. Off until the owner turns it on: refused, nothing written. ──
eq((await rpc("owner_confirm_slots", [TOK.A, T(1)])).ok, true, "A says One's slots are right: fresh");
const off = await list(TOK.A, T(1));
eq([off.ok, off.on, off.open, off.waiting, off.confirmed], [true, false, false, [], []], "A's list: off, nothing waiting");
eq(await send(P, T(1), K(1, 19), 2), { r: "off" }, "requests off: refused");
eq([await rowsN(), await noteN(), (await takes(T(1))).r], [0, 0, false], "nothing written, nobody told; turf_takes_requests says no");

// ── 5. Only the turf's own people switch it. ──
for (const [tok, why] of [[TOK.O2, "the owner of another turf"], [TOK.P, "a player"], [TOK.ADMIN, "the site owner without a claim"], [null, "nobody signed in"]]) {
  eq(await setOn(tok, T(1), true), { error: "forbidden" }, `switch: ${why}`);
  eq(await list(tok, T(1)), { error: "forbidden" }, `list: ${why}`);
}
eq(await setOn(TOK.A, T(3), true), { error: "forbidden" }, "an unclaimed turf: nobody runs it");
eq(Number((await one(`select count(*) n from private.turf_booking_settings`)).n), 0, "nothing written by a refused switch");
eq(await setOn(TOK.A, T(1), null), { error: "bad" }, "on or off, nothing else");
const on = await setOn(TOK.A, T(1), true);
eq([on.ok, on.on, on.open], [true, true, true], "A turns requests on: open");
eq([(await setOn(TOK.M, T(1), true)).on, (await takes(T(1)))], [true, { r: true, t: "boolean" }], "the manager may switch it too; turf_takes_requests: a boolean, yes");

// ── 6. Stale, unclaimed or inactive: off, and turf_takes_requests agrees. ──
eq((await setOn(TOK.O2, T(2), true)).open, false, "Two: on, but its slots were never confirmed");
eq([await send(P, T(2), K(1, 19)), (await takes(T(2))).r], [{ r: "off" }, false], "no fresh slots: off");
await rpc("owner_confirm_slots", [TOK.O2, T(2)]);
eq((await takes(T(2))).r, true, "fresh: open");
await q(`update private.turf_availability set updated_at = now() - interval '25 hours' where turf_id = $1`, [T(2)]);
eq([await send(P, T(2), K(1, 19)), (await takes(T(2))).r, (await list(TOK.O2, T(2))).open], [{ r: "off" }, false, false], "a day old: off");
await rpc("owner_confirm_slots", [TOK.O2, T(2)]);
await q(`insert into private.turf_booking_settings (turf_id, requests_on) values ($1, true)`, [T(3)]);
await q(`insert into private.turf_availability (turf_id, updated_at) values ($1, now())`, [T(3)]);
eq([await send(P, T(3), K(1, 19)), (await takes(T(3))).r], [{ r: "off" }, false], "an unclaimed turf: off, whatever is stored");
await q(`update public.turfs set is_active = false where id = $1`, [T(1)]);
eq([await send(P, T(1), K(1, 19)), (await takes(T(1))).r, await list(TOK.A, T(1))], [{ r: "off" }, false, { error: "not_claimed" }], "inactive: off");
await q(`update public.turfs set is_active = true where id = $1`, [T(1)]);
eq((await takes("cccccccc-0000-4000-8000-000000009999")).r, false, "no such turf: no");
eq(await rowsN(), 0, "still nothing written");

// ── 7. A verified number, and not the turf's own people. ──
eq(await send(G, T(1), K(1, 19)), { r: "no_phone" }, "a Google account with no number");
eq(await send(TY, T(1), K(1, 19)), { r: "no_phone" }, "a typed number never proved");
eq(await send(A, T(1), K(1, 19)), { r: "own" }, "the owner");
eq(await send(MGR, T(1), K(1, 19)), { r: "own" }, "the manager");
eq(await rowsN(), 0, "nothing written");
eq((await rpc("account_phone_checked", [KEY, TY, "+919100000009"])).r, "ok", "the server checks TY's phone sign-in");
const ty1 = await send(TY, T(1), K(6, 10));
eq(ty1.r, "ok", "proved: it goes through");

// ── 8. Bad input, started hours, hours taken. ──
for (const [at, hours, note, want, why] of [
  ["2026-11-07T24:00", 1, null, { r: "bad", field: "at" }, "no 24:00"], ["tomorrow", 1, null, { r: "bad", field: "at" }, "not a key"], [null, 1, null, { r: "bad", field: "at" }, "no time"],
  [K(1, 19), 0, null, { r: "bad", field: "hours" }, "0 hours"], [K(1, 19), 4, null, { r: "bad", field: "hours" }, "4 hours"], [K(1, 19), null, null, { r: "bad", field: "hours" }, "no hours"],
  [K(1, 19), 1, "x".repeat(141), { r: "bad", field: "note" }, "141 characters"], [K(1, 19), 1, "ring\u0007me", { r: "bad", field: "note" }, "a control character"],
  [K(-1, 19), 1, null, { r: "past" }, "yesterday"], [K(9, 19), 1, null, { r: "past" }, "past the 8 days"]])
  eq(await send(P, T(1), at, hours, note), want, `refused: ${why}`);
eq(await send(P, null, K(1, 19)), { r: "bad" }, "no turf");
eq(await send(null, T(1), K(1, 19)), { r: "bad" }, "no player");
eq(await send("aaaaaaaa-aaaa-4aaa-8aaa-000000000999", T(1), K(1, 19)), { r: "bad" }, "no such player");
eq((await rpc("owner_set_slots", [TOK.A, T(1), JSON.stringify([{ at: K(2, 20), status: "booked" }])])).booked.includes(K(2, 20)), true, "A marks tomorrow-but-one 8 PM booked");
const taken = await send(P, T(1), K(2, 19), 2);
eq([taken.r, taken.booked.includes(K(2, 20))], ["taken", true], "7 PM for 2 hours runs into it: taken, with the booked keys");
eq(await rowsN(), 1, "only TY's request is stored");

// ── 9. A request, and who is told. ──
const before9 = await noteN();
const p1 = await send(P, T(1), K(1, 19), 2, "  5-a-side, 10 players  ");
eq(p1.r, "ok", "P asks for tomorrow 7 PM, 2 hours");
const W1 = await when(K(1, 19), 2);
eq([p1.request.status, p1.request.at, p1.request.hours, p1.request.when, p1.request.note, p1.request.turf_name, p1.request.turf_slug, p1.request.can_cancel],
  ["waiting", K(1, 19), 2, W1, "5-a-side, 10 players", "One Arena", "one-arena-nashik", true], "P's answer: waiting, the hours, the note trimmed");
eq(Object.keys(p1.request).sort(), ["at", "can_cancel", "changed_at", "changed_by", "created_at", "hours", "id", "note", "reason", "status", "turf_id", "turf_name", "turf_slug", "when"], "no name or number in the player's answer");
eq(await row(p1.request.id), { status: "waiting", changed_by: null, reason: null, note: "5-a-side, 10 players", player_name: "Priya Player", player_phone: "+919100000001", hours: 2 }, "the row keeps the name and number as sent");
eq(await noteN(), before9 + 2, "two notifications: A's account once (two sign-ins), M's once");
const msg = `A player asked for ${W1} at One Arena. Confirm or decline it on myTapturf.`;
for (const u of [A, MGR]) {
  const n = (await notes(u)).filter((x) => x.metadata.requestId === p1.request.id);
  eq(n, [{ type: "booking_request", title: "New booking request", message: msg, metadata: { turfId: T(1), requestId: p1.request.id } }], "the owner's notification, exact");
}
ok(!PHONE_RE.test(msg) && !msg.includes("Priya"), "no number or name in it: the list shows those while the request is open");
eq((await notes(P)).length, 0, "the player is told nothing");

// ── 10. Limits. ──
eq(await send(P, T(1), K(1, 21)), { r: "limit", kind: "day" }, "a second waiting request at One for the same day");
const p2 = await send(P, T(1), K(2, 10));
const p3 = await send(P, T(1), K(3, 10));
eq([p2.r, p3.r], ["ok", "ok"], "other days: fine (3 waiting)");
eq(await send(P, T(2), K(4, 10)), { r: "limit", kind: "waiting" }, "a fourth waiting request anywhere");
eq((await cancel(P, p3.request.id)).r, "ok", "P cancels one");
const p4 = await send(P, T(2), K(4, 10));
eq(p4.r, "ok", "then another may go");
eq([(await notes(O2)).filter((n) => n.metadata.requestId === p4.request.id).length, (await notes(A)).filter((n) => n.metadata.requestId === p4.request.id).length], [1, 0], "Two's owner is told, One's are not");
for (let i = 0; i < 10; i++) {
  const s = await send(R, T(2), K(5, 10));
  assert.equal(s.r, "ok", `R's send ${i + 1}`);
  assert.equal((await cancel(R, s.request.id)).r, "ok");
}
eq(await send(R, T(2), K(5, 10)), { r: "limit", kind: "sends" }, "an 11th send in a day, cancelled ones counted");

// ── 11. The owner's list: waiting only, newest first, with the name and number; confirmed ones apart. ──
const l1 = await list(TOK.A, T(1));
const wantWaiting = (await q(`select id from private.booking_requests where turf_id = $1 and status = 'waiting' and starts_at > now() order by created_at desc, id`, [T(1)])).map((r) => r.id);
eq(l1.waiting.map((r) => r.id), wantWaiting, "waiting, newest first");
ok(!l1.waiting.some((r) => r.id === p3.request.id), "a cancelled request is not listed");
eq(Object.keys(l1.waiting.find((r) => r.id === p1.request.id)).sort(), ["at", "created_at", "hours", "id", "name", "note", "phone", "when"], "an owner's row");
eq([l1.waiting.find((r) => r.id === p1.request.id).name, l1.waiting.find((r) => r.id === p1.request.id).phone], ["Priya Player", "+919100000001"], "the turf sees who asked and their number");
eq((await list(TOK.M, T(1))).waiting.map((r) => r.id), wantWaiting, "the manager sees the same list");
eq(await list(TOK.O2, T(1)), { error: "forbidden" }, "the owner of another turf: refused");
eq((await list(TOK.O2, T(2))).waiting.map((r) => r.id), [p4.request.id], "Two's list has Two's requests only");

// ── 12. Confirm: the hours Booked, the other waiting requests for them declined and told. ──
const q1 = await send(Q, T(1), K(1, 20));
const ty2 = await send(TY, T(1), K(1, 22));
eq([q1.r, ty2.r], ["ok", "ok"], "Q asks for 8 PM (inside P's hours); TY for 10 PM (outside)");
await q(`update private.turf_availability set updated_at = now() - interval '1 hour' where turf_id = $1`, [T(1)]);
const u0 = await updatedAt(T(1));
const qNotes0 = (await notes(Q)).length;
const c1 = await answer(TOK.A, p1.request.id, "confirm");
eq([c1.done, c1.declined_others, c1.ok], ["confirm", 1, true], "A confirms P's: one other declined");
eq(c1.confirmed.map((r) => r.id), [p1.request.id], "P's is in the confirmed list");
ok(!c1.waiting.some((r) => [p1.request.id, q1.request.id].includes(r.id)), "neither is waiting now");
ok(c1.waiting.some((r) => r.id === ty2.request.id), "TY's 10 PM still waits");
eq((await slots(T(1))).filter((s) => s.at === K(1, 19) || s.at === K(1, 20)), [{ at: K(1, 19), status: "booked" }, { at: K(1, 20), status: "booked" }], "7 PM and 8 PM are booked");
ok((await updatedAt(T(1))) > u0, "the marks are fresh again (the owner acted)");
const pub = await rpc("turf_availability", [T(1)]);
ok(pub.booked.includes(K(1, 19)) && pub.booked.includes(K(1, 20)), "players see those hours booked");
eq((await row(q1.request.id)).status + "/" + (await row(q1.request.id)).changed_by, "declined/taken", "Q's: declined, taken");
const W8 = await when(K(1, 20), 1);
eq((await notes(Q)).slice(qNotes0), [{ type: "booking_declined", title: "Request declined", message: `One Arena can't take your request for ${W8}: those hours went to someone else.`,
  metadata: { turfId: T(1), slug: "one-arena-nashik", requestId: q1.request.id, by: "taken" } }], "Q is told, exactly");
eq((await notes(P)), [{ type: "booking_confirmed", title: "Request confirmed", message: `One Arena confirmed ${W1}. Pay at the turf.`, metadata: { turfId: T(1), slug: "one-arena-nashik", requestId: p1.request.id } }], "P is told, exactly");
const pm = (await mine(P)).requests.find((r) => r.id === p1.request.id);
eq([pm.status, pm.changed_by, pm.can_cancel], ["confirmed", "owner", true], "P's list: confirmed, may still cancel");
eq(await answer(TOK.A, p1.request.id, "confirm"), { error: "answered", status: "confirmed" }, "a second answer: answered");
eq(await answer(TOK.A, p1.request.id, "decline"), { error: "answered", status: "confirmed" }, "a decline after it: answered");
eq(await answer(TOK.A, q1.request.id, "confirm"), { error: "answered", status: "declined" }, "the declined one can't be confirmed");
// Another ground is still free at 8 PM: the owner taps it Free again. The marks are the truth: the card offers it, and it can be asked for.
await rpc("owner_set_slots", [TOK.A, T(1), JSON.stringify([{ at: K(1, 20), status: "free" }])]);
ok(!(await rpc("turf_availability", [T(1)])).booked.includes(K(1, 20)), "the card shows 8 PM free again");
const s4 = await phoneAccount("9100000004", "Sana Player", true);
const t4 = await send(s4, T(1), K(1, 20));
eq(t4.r, "ok", "a new player may ask for it");
const c4 = await answer(TOK.A, t4.request.id, "confirm");
eq([c4.done, c4.declined_others, c4.confirmed.map((r) => r.id).sort()], ["confirm", 0, [p1.request.id, t4.request.id].sort()], "and the owner confirms it: both bookings hold 8 PM, on two grounds");
eq((await slots(T(1))).find((s) => s.at === K(1, 20)), { at: K(1, 20), status: "booked" }, "8 PM is Booked again");
eq(await send(R, T(1), K(1, 20)), { r: "taken", booked: (await rpc("turf_availability", [T(1)])).booked }, "and taken for the next player, with the keys the card greys");

// ── 13. A confirm refused when an hour was marked meanwhile: nothing changes. ──
await rpc("owner_set_slots", [TOK.A, T(1), JSON.stringify([{ at: K(1, 22), status: "booked" }])]);
const tyN = (await notes(TY)).length;
const slots13 = await slots(T(1));
eq(await answer(TOK.A, ty2.request.id, "confirm"), { error: "taken" }, "TY's 10 PM is marked booked now: refused");
eq([(await row(ty2.request.id)).status, (await notes(TY)).length, await slots(T(1))], ["waiting", tyN, slots13], "nothing changed, nobody told");
for (const bad of ["x".repeat(141), "line\u0001two"]) eq(await answer(TOK.A, ty2.request.id, "decline", bad), { error: "bad" }, "a bad reason");
eq(await answer(TOK.A, ty2.request.id, "maybe"), { error: "bad" }, "an action that isn't one");
eq(await answer(TOK.A, "aaaaaaaa-aaaa-4aaa-8aaa-000000000999", "decline"), { error: "gone" }, "no such request");
eq(await answer(TOK.O2, ty2.request.id, "decline"), { error: "forbidden" }, "the owner of another turf can't answer it");
eq(await answer(TOK.ADMIN, ty2.request.id, "decline"), { error: "forbidden" }, "nor the site owner");

// ── 14. Decline with a reason. ──
const d1 = await answer(TOK.M, ty2.request.id, "decline", "  Ground closed for a match ");
eq(d1.done, "decline", "the manager declines TY's, with a reason");
eq(await row(ty2.request.id), { status: "declined", changed_by: "owner", reason: "Ground closed for a match", note: null, player_name: "Tara Typed", player_phone: "+919100000009", hours: 1 }, "stored");
eq((await notes(TY)).slice(tyN), [{ type: "booking_declined", title: "Request declined", message: `One Arena declined your request for ${await when(K(1, 22), 1)}. They said: "Ground closed for a match"`,
  metadata: { turfId: T(1), slug: "one-arena-nashik", requestId: ty2.request.id, by: "owner" } }], "TY is told, with the reason");
const tm = (await mine(TY)).requests.find((r) => r.id === ty2.request.id);
eq([tm.status, tm.changed_by, tm.reason, tm.can_cancel], ["declined", "owner", "Ground closed for a match", false], "TY's list says so");

// ── 15. Owner cancel: the hours Free again, the marks' time untouched, the player told. ──
const u15 = await updatedAt(T(1));
const ca = await answer(TOK.A, p1.request.id, "cancel", "Rain");
eq(ca.done, "cancel", "A cancels P's booking");
eq((await slots(T(1))).filter((s) => s.at === K(1, 19) || s.at === K(1, 20)), [{ at: K(1, 19), status: "free" }, { at: K(1, 20), status: "free" }], "its hours are free");
eq(await updatedAt(T(1)), u15, "without moving the marks' time");
eq((await notes(P)).at(-1), { type: "booking_cancelled", title: "Cancelled by the turf", message: `One Arena cancelled ${W1}. They said: "Rain"`, metadata: { turfId: T(1), slug: "one-arena-nashik", requestId: p1.request.id } }, "P is told");
eq(await answer(TOK.A, p1.request.id, "cancel"), { error: "answered", status: "cancelled" }, "cancelled already");
eq(await answer(TOK.A, ty1.request.id, "cancel"), { error: "answered", status: "waiting" }, "a waiting one can't be cancelled by the owner (decline it)");

// ── 16. Player cancel. ──
const n16 = await noteN();
const pw = await cancel(P, p2.request.id);
eq([pw.r, pw.status, pw.request.status, pw.request.can_cancel], ["ok", "cancelled", "cancelled", false], "P cancels a waiting one");
eq(await noteN(), n16, "a waiting one tells nobody");
eq(await cancel(P, p2.request.id), { r: "ok", status: "cancelled", request: pw.request }, "again: the same answer");
eq(await cancel(Q, ty1.request.id), { r: "gone" }, "another player's: gone");
eq(await cancel(P, "aaaaaaaa-aaaa-4aaa-8aaa-000000000999"), { r: "gone" }, "none: gone");
const p5 = await send(P, T(1), K(2, 10));
eq((await answer(TOK.A, p5.request.id, "confirm")).done, "confirm", "A confirms P's 10 AM");
const u16 = await updatedAt(T(1));
const aN = (await notes(A)).length, mN = (await notes(MGR)).length;
const pc = await cancel(P, p5.request.id);
eq([pc.r, pc.request.status, pc.request.changed_by], ["ok", "cancelled", "player"], "P cancels the confirmed one");
eq((await slots(T(1))).find((s) => s.at === K(2, 10)), { at: K(2, 10), status: "free" }, "its hour is free again");
eq(await updatedAt(T(1)), u16, "the marks' time untouched");
const byPlayer = { type: "booking_cancelled_by_player", title: "Booking cancelled", message: `A player cancelled ${await when(K(2, 10), 1)} at One Arena. Those hours are free again.`, metadata: { turfId: T(1), requestId: p5.request.id } };
eq([(await notes(A)).slice(aN), (await notes(MGR)).slice(mN)], [[byPlayer], [byPlayer]], "the turf's people are told, once each");
const p6 = await send(P, T(1), K(3, 18));
await answer(TOK.A, p6.request.id, "confirm");
await q(`update private.booking_requests set starts_at = now() - interval '30 minutes', ends_at = now() + interval '30 minutes' where id = $1`, [p6.request.id]);
eq(await cancel(P, p6.request.id), { r: "started" }, "after the start: started");
eq(await answer(TOK.A, p6.request.id, "cancel"), { error: "started" }, "the owner can't either");
eq((await mine(P)).requests.find((r) => r.id === p6.request.id).can_cancel, false, "P's list: no Cancel");
eq((await list(TOK.A, T(1))).confirmed.map((r) => r.id).includes(p6.request.id), true, "the owner still sees it until its hours end");
await q(`update private.booking_requests set ends_at = now() - interval '1 minute', starts_at = now() - interval '61 minutes' where id = $1`, [p6.request.id]);
eq((await list(TOK.A, T(1))).confirmed.map((r) => r.id).includes(p6.request.id), false, "and not after");

// ── 17. Expiry. ──
const q2 = await send(Q, T(1), K(3, 15));
const q3 = await send(Q, T(1), K(4, 15));
await q(`update private.booking_requests set starts_at = now() - interval '1 hour', ends_at = now() where id = $1`, [q2.request.id]);
eq((await row(q2.request.id)).status, "waiting", "moved into the past: the row still says waiting");
const qm = (await mine(Q)).requests.find((r) => r.id === q2.request.id);
eq([qm.status, qm.changed_by, qm.can_cancel], ["expired", "clock", false], "Q's list: expired");
ok(!(await list(TOK.A, T(1))).waiting.some((r) => r.id === q2.request.id), "not in the owner's list");
eq(await cancel(Q, q2.request.id), { r: "answered", status: "expired" }, "Q can't cancel it");
eq(await answer(TOK.A, q2.request.id, "confirm"), { error: "answered", status: "expired" }, "confirming it: answered");
const qr = await one(`select status, changed_by, changed_at = starts_at s from private.booking_requests where id = $1`, [q2.request.id]);
eq(qr, { status: "expired", changed_by: "clock", s: true }, "that write stored it: expired by the clock, at its start");
await q(`update private.booking_requests set starts_at = now() - interval '1 hour', ends_at = now(), status = 'waiting', changed_by = null, changed_at = null where id = $1`, [q3.request.id]);
const q4 = await send(Q, T(1), K(5, 15));
const q5 = await send(Q, T(1), K(6, 15));
const q6 = await send(Q, T(2), K(2, 15));
eq([q4.r, q5.r, q6.r], ["ok", "ok", "ok"], "past ones don't count: three more go");
eq(await send(Q, T(2), K(3, 15)), { r: "limit", kind: "waiting" }, "and then three wait");
eq((await row(q3.request.id)).status, "expired", "Q's own send stored the past one as expired");

// ── 18. Turning it off: no new requests, waiting ones still answerable. ──
eq((await setOn(TOK.A, T(1), false)).on, false, "A turns requests off");
eq([await send(s4, T(1), K(4, 11)), (await takes(T(1))).r], [{ r: "off" }, false], "off: refused");
eq((await answer(TOK.A, q4.request.id, "decline")).done, "decline", "a waiting one can still be declined");
eq((await setOn(TOK.A, T(1), true)).on, true, "on again");

// ── 18a. Staff: they mark Free slots, but never see, switch, answer or hear about a request, and can't send one. ──
const ST = await phoneAccount("9100000005", "Sita Staff", true);
await q(`insert into public.turf_owners (turf_id, user_key, user_id, status, via, role) values ($1, 'p:9100000005', $2, 'active', 'admin', 'staff')`, [T(1), ST]);
const TOK_ST = "phone:9100000005";
eq((await rpc("owner_set_slots", [TOK_ST, T(1), JSON.stringify([{ at: K(5, 7), status: "booked" }])])).ok, true, "staff mark Free slots, as before");
await rpc("owner_set_slots", [TOK_ST, T(1), JSON.stringify([{ at: K(5, 7), status: "free" }])]);
eq([await list(TOK_ST, T(1)), await setOn(TOK_ST, T(1), false)], [{ error: "forbidden" }, { error: "forbidden" }], "staff: no list, no switch");
eq(await send(ST, T(1), K(5, 8)), { r: "own" }, "staff can't ask their own turf");
const owners18 = (await q(`select private.booking_owners($1) id`, [T(1)])).map((r) => r.id).sort();
eq(owners18, [A, MGR].sort(), "the turf's people: the owner and the manager, not staff");
const stN = (await notes(ST)).length;
const z1 = await send(s4, T(1), K(5, 8));
eq(z1.r, "ok", "a request comes in");
eq([(await notes(ST)).length, (await notes(A)).filter((n) => n.metadata.requestId === z1.request.id).length, (await notes(MGR)).filter((n) => n.metadata.requestId === z1.request.id).length],
  [stN, 1, 1], "the owner and the manager are told; staff are not");
eq(await answer(TOK_ST, z1.request.id, "confirm"), { error: "forbidden" }, "staff can't confirm it");
eq((await row(z1.request.id)).status, "waiting", "still waiting");
eq((await cancel(s4, z1.request.id)).r, "ok", "(s4 takes it back)");

// ── 18b. Their own waiting request covering some of the hours: refused (after midnight the dates differ). ──
const X = await phoneAccount("9100000006", "Xavier Player", true);
const x1 = await send(X, T(1), K(2, 23), 3);
eq(x1.r, "ok", "X asks for 11 PM to 2 AM");
eq(await send(X, T(1), K(3, 0)), { r: "limit", kind: "overlap" }, "then 12 AM (the next date): refused, overlapping their own");
eq(await send(X, T(1), K(3, 1), 2), { r: "limit", kind: "overlap" }, "1 AM for 2 hours: refused too");
const x2 = await send(X, T(1), K(3, 2));
eq(x2.r, "ok", "2 AM, as theirs ends: fine");
const cx = await answer(TOK.A, x1.request.id, "confirm");
eq([cx.done, cx.declined_others, (await row(x2.request.id)).status], ["confirm", 0, "waiting"], "the confirm declines nothing of theirs");
eq([(await cancel(X, x1.request.id)).r, (await cancel(X, x2.request.id)).r], ["ok", "ok"], "(X takes both back)");

// ── 18c. A cancel names the state the player's screen showed: a request the turf answered meanwhile isn't cancelled. ──
const Y = await phoneAccount("9100000007", "Yash Player", true);
const y1 = await send(Y, T(1), K(5, 9));
eq((await answer(TOK.A, y1.request.id, "confirm")).done, "confirm", "the turf confirms Y's request while Y's screen still says waiting");
const aN18 = (await notes(A)).length;
eq(await cancel(Y, y1.request.id, KEY, "waiting"), { r: "answered", status: "confirmed" }, "a one-tap cancel of a waiting request: answered, confirmed");
eq([(await row(y1.request.id)).status, (await slots(T(1))).find((s) => s.at === K(5, 9))?.status, (await notes(A)).length], ["confirmed", "booked", aN18], "nothing changed, nobody told");
eq(await cancel(Y, y1.request.id, KEY, "maybe"), { r: "bad" }, "a state that isn't one");
const yc = await cancel(Y, y1.request.id, KEY, "confirmed");
eq([yc.r, yc.request.status, (await slots(T(1))).find((s) => s.at === K(5, 9))?.status], ["ok", "cancelled", "free"], "asked again as confirmed: cancelled, the hour free");
const y2 = await send(Y, T(1), K(6, 9));
eq(await cancel(Y, y2.request.id, KEY, "confirmed"), { r: "answered", status: "waiting" }, "a confirmed one's question on a waiting one: answered, waiting");
eq((await cancel(Y, y2.request.id, KEY, "waiting")).r, "ok", "as waiting: cancelled");

// ── 18d. A removed player's request: the turf can still answer it, and every request it overlaps. ──
eq((await one(`select private.booking_notify('aaaaaaaa-aaaa-4aaa-8aaa-000000000998', 't', 't', 'm', '{}') n`)).n, 0, "no notification for an account that isn't there, and no error");
const V = await phoneAccount("9100000010", "Vikram Player", true);
const Wp = await phoneAccount("9100000011", "Wasim Player", true);
const v1 = await send(V, T(1), K(6, 19));
const v2 = await send(V, T(2), K(6, 21));
const w1 = await send(Wp, T(1), K(6, 19), 2);
eq([v1.r, v2.r, w1.r], ["ok", "ok", "ok"], "V asks One for 7 PM and Two for 9 PM; W asks One for 7 PM to 9 PM");
await q(`delete from public.usernames where user_id = $1`, [V]);
await q(`delete from public.username_history where user_id = $1`, [V]);
await q(`delete from public.users where id = $1`, [V]);
eq(Number((await one(`select count(*) n from public.users where id = $1`, [V])).n), 0, "V's account is removed (the request rows stay, as no foreign key cascades)");
const wN = (await notes(Wp)).length;
const cw = await answer(TOK.A, w1.request.id, "confirm");
eq([cw.done, cw.declined_others, (await row(v1.request.id)).status], ["confirm", 1, "declined"], "W's confirm goes through and declines V's");
eq((await notes(Wp)).length, wN + 1, "W is told");
eq((await answer(TOK.O2, v2.request.id, "decline")).done, "decline", "V's other request can be declined");

// ── 19. No personal data reachable by anyone else. ──
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  for (const t of ["private.booking_requests", "private.turf_booking_settings"]) await assert.rejects(q(`select * from ${t}`), /permission denied/, `${role}: ${t}`);
  await assert.rejects(q(`select private.booking_owner_state($1, now())`, [T(1)]), /permission denied/, `${role}: no private helper`);
  passed += 3;
  eq(typeof (await one(`select public.turf_takes_requests($1) r`, [T(1)])).r, "boolean", `${role}: the public read is a boolean`);
  await db.exec(`reset role`);
}
const pAll = await mine(P);
const pIds = (await q(`select id from private.booking_requests where user_id = $1 order by created_at desc, id`, [P])).map((r) => r.id);
eq(pAll.requests.map((r) => r.id), pIds, "P's list: P's rows only, newest first");
const pText = JSON.stringify(pAll);
ok(!PHONE_RE.test(pText) && !/Priya|Qasim|Tara|Rohan|Sana|Asha|Manoj/.test(pText), "no name or number in it");
for (const [fn, args] of [["booking_request_send", [P, T(1), K(4, 12), 1, null]], ["booking_requests_mine", [P]], ["booking_request_cancel", [P, p4.request.id]]]) {
  eq(await rpc(fn, ["wrong-key", ...args]), { r: "unavailable" }, `${fn}: a wrong key`);
  eq(await rpc(fn, [null, ...args]), { r: "unavailable" }, `${fn}: no key`);
}
const all = await q(`select message, title from public.notifications`);
ok(all.length > 20 && all.every((n) => !PHONE_RE.test(n.message) && !PHONE_RE.test(n.title)), "no number in any notification");
ok(all.every((n) => !/Priya|Qasim|Tara|Rohan|Sana|Xavier|Yash|Vikram|Wasim/.test(n.message + n.title)), "no player's name in any notification");
eq(Object.keys((await list(TOK.O2, T(2)))).sort(), ["confirmed", "now", "ok", "on", "open", "waiting"], "the owner's view: these keys");

// ── 20. Again, with rows: kept, and it still works. ──
const keep = [await q(`select * from private.booking_requests order by id`), await q(`select * from private.turf_booking_settings order by turf_id`), await noteN()];
await db.exec(NEW);
eq([await q(`select * from private.booking_requests order by id`), await q(`select * from private.turf_booking_settings order by turf_id`), await noteN()], keep, "the file again: rows, settings and notifications kept");
const again = await send(s4, T(1), K(4, 11));
eq(again.r, "ok", "a request after it");
eq((await answer(TOK.A, again.request.id, "confirm")).done, "confirm", "and its confirm");
eq((await rpc("turf_availability", [T(1)])).booked.includes(K(4, 11)), true, "the hour is booked on the card");

console.log(`booking_requests: ${passed} checks passed`);
