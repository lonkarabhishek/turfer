// Applies the account, contact-email, admin-verified, auth-mirror, myTapturf,
// claims-account, people, lockdown-step-4, account-links and owner call
// number migrations to stand-ins for Supabase in an in-memory Postgres
// (PGlite), as booking_requests.check.mjs does, with the turfs cache trigger
// (20261025_turf_claimed.sql), 20261027_verified_tick.sql,
// 20261105_turf_availability.sql and 20261106_booking_requests.sql, then
// 20261106_admin_slots_view.sql twice, and checks the site owner's
// read-only Slots view: the file's rules (additive, two new functions, its
// header's md5s are the repo's latest bodies); the grants (the private
// helper for nobody); the site owner (both keys of the real
// public._is_admin_key, read from 20261019_mytapturf.sql, so no key is
// written here) gets the turf's slots exactly as owner_slots gives its
// owner, and its booking requests by time alone, with booking_owner_state's
// filters, order and limit; a turf's owner, manager and staff, another
// turf's owner, a player, a Google sign-in that isn't the site owner's, an
// email-and-password session, a bad token and no token get forbidden; a
// turf that doesn't exist forbidden; an unclaimed or inactive one
// not_claimed; the answer never holds a player's name, number or note, nor
// a request's id or account; calling it changes no row anywhere; and the
// site owner still can't mark, confirm, switch or answer. Never touches a
// real database. Made-up people and numbers.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/admin_slots_view.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: admin_slots_view.check.mjs <supabase/migrations>");
const NEW = fs.readFileSync(`${M}/20261106_admin_slots_view.sql`, "utf8");
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const md5 = (s) => createHash("md5").update(s).digest("hex");

// ── 0. The file. ──
const code = NEW.replace(/^\s*--.*$/gm, "");
assert.doesNotMatch(NEW, /\bdrop\b|\bdelete\b|\btruncate\b/i, "no destructive keywords, comments included");
assert.doesNotMatch(NEW, /[—–]/, "no em or en dashes");
assert.match(NEW, /^set local lock_timeout = '5s';\n/, "starts with the lock timeout");
assert.doesNotMatch(code, /\b(update|insert\s+into)\s+(public|private)\.\w+/i, "writes no table");
assert.doesNotMatch(code, /\bcreate\s+table\b|\balter\s+table\b|\bcreate\s+(unique\s+)?index\b|\btrigger\b/i, "no table, index or trigger");
assert.doesNotMatch(code, /\bgrant\b[^;]*\bon\s+(table\s+)?public\.|\bpolicy\b/i, "no grant or policy on a public table");
passed += 6;
const MADE = [...NEW.matchAll(/create or replace function (\w+)\.(\w+)\(/gi)].map((m) => `${m[1]}.${m[2]}`);
eq(MADE.sort(), ["private.booking_admin_state", "public.admin_turf_slots"], "exactly these two functions");
for (const w of ["Replaced: none.", "read 6 Nov 2026", "The app works before this file", "Read only: it writes nothing", "Never a player's name"])
  ok(NEW.includes(w), `the header says ${w}`);
// The header's md5s: each is the md5 of the function's latest body in the repo's migrations (file name order), as md5(prosrc) gives it.
const HEADER = [...NEW.matchAll(/^--\s+(public|private)\.(\w+)\s+([0-9a-f]{32})\b/gm)].map((m) => ({ fn: `${m[1]}.${m[2]}`, md5: m[3] }));
const FILES = fs.readdirSync(M).filter((f) => f.endsWith(".sql")).sort();
const repoBody = (fn) => {
  const [s, f] = fn.split(".");
  let last = null;
  for (const file of FILES) {
    if (file === "20261106_admin_slots_view.sql") continue;
    const txt = fs.readFileSync(`${M}/${file}`, "utf8");
    const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+${s}\\.${f}\\s*\\(`, "gi");
    for (let m; (m = re.exec(txt)); ) {
      const rest = txt.slice(m.index);
      const d = /\bas\s+(\$[A-Za-z_]*\$)/i.exec(rest);
      if (!d) continue;
      const start = d.index + d[0].length;
      last = rest.slice(start, rest.indexOf(d[1], start));
    }
  }
  return last;
};
const CALLED = ["public._caller_key", "public._is_admin_key", "private.turf_slots_state", "private.booking_open", "private.booking_when", "private.slot_key", "private.booking_list_max",
  "private.turf_booked", "private.slots_ahead", "private.slots_max", "private.slots_fresh", "private.booking_clock", "private.booking_owner_state", "private.slots_guard"];
eq(HEADER.map((h) => h.fn).sort(), [...CALLED].sort(), "the header lists every function it calls, the ones those call, and the two rules it follows");
for (const h of HEADER) eq(md5(repoBody(h.fn) ?? ""), h.md5, `${h.fn}: the header's md5 is the repo's latest body`);
// Every function the new bodies call is in the header.
const calls = new Set([...code.matchAll(/\b(public|private)\.(\w+)\s*\(/g)].map((m) => `${m[1]}.${m[2]}`).filter((f) => !MADE.includes(f)));
ok([...calls].every((f) => CALLED.includes(f)), `every function called is listed: ${[...calls].join(", ")}`);
// The site owner's two keys, as the real public._is_admin_key has them (not written here).
const ADMIN_KEYS = [...(repoBody("public._is_admin_key") ?? "").matchAll(/'([ep]:[^']+)'/g)].map((m) => m[1]);
eq([ADMIN_KEYS.length, ADMIN_KEYS.filter((k) => k.startsWith("e:")).length, ADMIN_KEYS.filter((k) => /^p:[6-9]\d{9}$/.test(k)).length], [2, 1, 1], "the site owner: one Google address and one number");

// ── The database before it (booking_requests.check.mjs's stand-ins and migrations). ──
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
create table public.notifications (id uuid not null default gen_random_uuid() primary key, user_id uuid references public.users(id) on delete cascade,
  type text not null, title text not null, message text not null, metadata jsonb default '{}'::jsonb, is_read boolean default false, created_at timestamptz default now());
`);
for (const f of ["20261019_mytapturf.sql", "20261019_mytapturf_claims.sql", "20261021_accounts_usernames.sql", "20261021_accounts_fixes.sql",
  "20261021_phone_identity_exact_india.sql", "20261022_people_fixes.sql", "20261025_contact_email.sql", "20261025_admin_verified.sql",
  "20261025_auth_mirror_google_only.sql", "20261025_claims_account.sql", "20261024_users_lockdown_step4.sql",
  "20261026_account_links.sql", "20261026_account_links_reads.sql", "20261028_owner_call_number.sql"]) await db.exec(fs.readFileSync(`${M}/${f}`, "utf8"));
// Firebase can't be reached here. _caller_key: the real one's Google path (this session signed in with Google), then a
// "phone:<10 digits>" token for a phone sign-in, as booking_requests.check.mjs reads it. _is_admin_key stays the real one.
await db.exec(`
create or replace function private.firebase_phone10(p_token text) returns text language sql as
  $$ select case when p_token ~ '^proof:[6-9][0-9]{9}$' then substr(p_token, 7) end $$;
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
$$;
create or replace function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as $$ select false $$;
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
await db.exec(fs.readFileSync(`${M}/20261106_booking_requests.sql`, "utf8"));
eq(md5((await one(`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_is_admin_key'`)).prosrc),
  HEADER.find((h) => h.fn === "public._is_admin_key").md5, "the real _is_admin_key is the one loaded here");
for (const h of HEADER.filter((x) => x.fn !== "public._caller_key")) {
  const [s, f] = h.fn.split(".");
  eq(md5((await one(`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2`, [s, f])).prosrc), h.md5, `${h.fn}: loaded as the header says`);
}

const KEY = (await one("select value from private.app_secrets where name = 'account'")).value;
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const phoneAccount = async (p10, name, log) => {
  const r = await rpc("account_resolve", [KEY, "phone", `+91${p10}`, null, null, name, null, true, log]);
  assert.equal(r.r, "ok", `account for ${name}`);
  return r.id;
};
const T = (i) => `dddddddd-0000-4000-8000-${String(i).padStart(12, "0")}`;
await q(`insert into public.turfs (id, name, slug, city, owner_phone, whatsapp_phone, start_time, end_time, number_of_grounds) values
  ('${T(1)}', 'One Arena', 'one-arena-nashik', 'nashik', '9000000101', '9000000102', '06:00', '02:00', 2),
  ('${T(2)}', 'Two Arena', 'two-arena-pune', 'pune', '9000000201', null, '06:00', '23:00', 1),
  ('${T(3)}', 'Three Arena', 'three-arena-nashik', 'nashik', '9000000301', null, '06:00', '23:00', 1)`);
// A owns One, M manages it, S is its staff; O owns Two. Nobody has Three.
const A = await phoneAccount("9000000101", "Asha Owner", false);
const MGR = await phoneAccount("9000000102", "Manoj Manager", false);
const O2 = await phoneAccount("9000000201", "Omkar Owner", false);
eq(await rpc("owner_claim", ["phone:9000000101", T(1), null, null, "owner"]), { status: "active" }, "A runs One");
eq(await rpc("owner_claim", ["phone:9000000102", T(1), null, null, "manager"]), { status: "active" }, "M manages One");
eq(await rpc("owner_claim", ["phone:9000000201", T(2), null, null, "owner"]), { status: "active" }, "O runs Two");
const ST = await phoneAccount("9100000005", "Sita Staff", true);
await q(`insert into public.turf_owners (turf_id, user_key, user_id, status, via, role) values ($1, 'p:9100000005', $2, 'active', 'admin', 'staff')`, [T(1), ST]);
const P = await phoneAccount("9100000001", "Priya Player", true);
const Q = await phoneAccount("9100000002", "Qasim Player", true);
const R = await phoneAccount("9100000003", "Rohan Player", true);
const TOK = { A: "phone:9000000101", M: "phone:9000000102", S: "phone:9100000005", O2: "phone:9000000201", P: "phone:9100000001" };
eq([(await one(`select claimed from public.turfs where id = $1`, [T(1)])).claimed, (await one(`select claimed from public.turfs where id = $1`, [T(3)])).claimed], [true, false], "One claimed, Three not");

// Who calls: a phone sign-in's token, or a Google session (request.jwt.claims, as PostgREST sets it).
const GOOGLE = (email, oauth = true) => JSON.stringify({ email, role: "authenticated", app_metadata: { provider: "google", providers: ["google"] }, amr: oauth ? [{ method: "oauth", timestamp: 1 }] : [{ method: "password", timestamp: 1 }] });
async function as(claims, fn) {
  await q(`select set_config('request.jwt.claims', $1, false)`, [claims ?? ""]);
  try {
    return await fn();
  } finally {
    await q(`select set_config('request.jwt.claims', '', false)`);
  }
}
const ADMINS = ADMIN_KEYS.map((k) => (k.startsWith("e:") ? { why: "the site owner's Google sign-in", claims: GOOGLE(k.slice(2)), token: null } : { why: "the site owner's phone sign-in", claims: null, token: `phone:${k.slice(2)}` }));
const adminCall = (a, turf) => as(a.claims, () => rpc("admin_turf_slots", [a.token, turf]));
const admin = ADMINS[0];

// ── 1. Before the file: neither function. Then the file, twice. ──
eq((await q(`select 1 from pg_proc where proname in ('admin_turf_slots', 'booking_admin_state')`)).length, 0, "before: neither function");
await assert.rejects(as(admin.claims, () => rpc("admin_turf_slots", [admin.token, T(1)])), /does not exist/, "before it, the call fails as missing (lib/my/client.ts getAdminSlots: the old note)");
passed++;
await db.exec(NEW);
await db.exec(NEW);
eq((await q(`select p.proname from pg_proc p where p.proname in ('admin_turf_slots', 'booking_admin_state') group by 1 having count(*) > 1`)).length, 0, "no overloads after running it twice");
// md5(prosrc) of each new function, as production will show it once applied: the body between its dollar quotes in the file.
const fileBody = (fn) => {
  const [s, f] = fn.split(".");
  const i = NEW.search(new RegExp(`create or replace function ${s}\\.${f}\\(`, "i"));
  const rest = NEW.slice(i);
  const d = /\bas\s+(\$[A-Za-z_]*\$)/i.exec(rest);
  const start = d.index + d[0].length;
  return rest.slice(start, rest.indexOf(d[1], start));
};
for (const fn of MADE) {
  const [s, f] = fn.split(".");
  const live = (await one(`select md5(p.prosrc) m from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2`, [s, f])).m;
  eq(live, md5(fileBody(fn)), `${fn}: md5(prosrc) is the file's body (${live})`);
}

// ── 2. Grants. ──
const fnRow = (schema, name) =>
  one(`select p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u,
    has_function_privilege('public', p.oid, 'execute') p from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2`, [schema, name]);
const pub = await fnRow("public", "admin_turf_slots");
eq([pub.prosecdef, pub.proconfig, pub.a, pub.u, pub.p], [true, ['search_path=""'], true, true, false], "admin_turf_slots: security definer, search_path '', anon and authenticated only");
const pri = await fnRow("private", "booking_admin_state");
eq([pri.prosecdef, pri.proconfig, pri.a, pri.u, pri.p], [true, ['search_path=""'], false, false, false], "booking_admin_state: nobody may call it, search_path ''");
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(q(`select private.booking_admin_state($1, now())`, [T(1)]), /permission denied/, `${role}: no private helper`);
  passed++;
  eq(await rpc("admin_turf_slots", [TOK.A, T(1)]), { error: "forbidden" }, `${role} may call admin_turf_slots, and an owner is refused`);
  await db.exec(`reset role`);
}

// ── 3. The turf as its owner left it: slots fresh, some hours Booked, requests on; waiting, confirmed and closed requests. ──
const IST = 330 * 60000;
const K = (days, hh) => `${new Date(Date.now() + IST + days * 86400000).toISOString().slice(0, 10)}T${String(hh).padStart(2, "0")}:00`;
const send = (u, turf, at, hours = 1, note = null) => rpc("booking_request_send", [KEY, u, turf, at, hours, note]);
const list = (tok, turf) => rpc("owner_booking_requests", [tok, turf]);
eq((await rpc("owner_set_slots", [TOK.A, T(1), JSON.stringify([{ at: K(1, 7), status: "booked" }, { at: K(2, 21), status: "booked" }])])).ok, true, "A marks two hours Booked");
eq((await rpc("owner_set_booking_requests", [TOK.A, T(1), true])).on, true, "A turns requests on");
const NOTE_P = "5-a-side, 10 players";
const NOTE_Q = "Bring the bibs please";
const NOTE_R = "Gate code is with Ramesh";
const p1 = await send(P, T(1), K(1, 19), 2, NOTE_P);
const q1 = await send(Q, T(1), K(3, 18), 1, NOTE_Q);
const r1 = await send(R, T(1), K(4, 20), 1, NOTE_R);
const p2 = await send(P, T(1), K(5, 9), 1);
eq([p1.r, q1.r, r1.r, p2.r], ["ok", "ok", "ok", "ok"], "four requests sent");
eq((await rpc("owner_answer_booking_request", [TOK.A, q1.request.id, "confirm", null])).done, "confirm", "A confirms Q's");
eq((await rpc("owner_answer_booking_request", [TOK.A, p2.request.id, "decline", "Closed for a match"])).done, "decline", "A declines P's second");
// R's started an hour ago and nobody answered (it reads as expired, still stored waiting); an older confirmed one has ended.
await q(`update private.booking_requests set starts_at = now() - interval '1 hour', ends_at = now() + interval '30 minutes' where id = $1`, [r1.request.id]);
await q(`insert into private.booking_requests (turf_id, user_id, starts_at, hours, ends_at, note, player_name, player_phone, status, changed_by, changed_at)
  values ($1, $2, now() - interval '3 hours', 1, now() - interval '2 hours', 'Old one', 'Qasim Player', '+919100000002', 'confirmed', 'owner', now() - interval '1 day')`, [T(1), Q]);
await q(`insert into private.booking_requests (turf_id, user_id, starts_at, hours, ends_at, player_name, player_phone, status, changed_by, changed_at)
  values ($1, $2, now() + interval '3 days', 1, now() + interval '3 days 1 hour', 'Rohan Player', '+919100000003', 'cancelled', 'player', now())`, [T(1), R]);
eq((await one(`select status from private.booking_requests where id = $1`, [r1.request.id])).status, "waiting", "R's started one is stored waiting");

// ── 4. The site owner gets the turf's slots as its owner does, and its requests by time. ──
const snapshot = async () => {
  const tables = await q(`select schemaname s, tablename t from pg_tables where schemaname in ('public', 'private', 'auth') order by 1, 2`);
  const out = {};
  for (const { s, t } of tables) out[`${s}.${t}`] = (await one(`select count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from ${s}.${t} x`)).h;
  return out;
};
const before = await snapshot();
const ownerSlots = await rpc("owner_slots", [TOK.A, T(1)]);
const ownerList = await list(TOK.A, T(1));
const views = [];
for (const a of ADMINS) {
  const v = await adminCall(a, T(1));
  views.push(v);
  eq(Object.keys(v).sort(), ["admin", "booked", "grounds", "hours", "now", "ok", "requests", "updated_at"], `${a.why}: the owner's keys, admin and requests`);
  const strip = (x) => Object.fromEntries(Object.entries(x).filter(([k]) => !["now", "admin", "requests"].includes(k)));
  eq(strip(v), strip(ownerSlots), `${a.why}: hours, Booked marks, grounds and last update exactly as owner_slots gives A`);
  eq([v.ok, v.admin, v.grounds, v.booked.includes(K(1, 7)), v.booked.includes(K(2, 21)), v.booked.includes(K(3, 18))], [true, true, 2, true, true, true], `${a.why}: the Booked hours, a confirm's too`);
  const r = v.requests;
  eq(Object.keys(r).sort(), ["confirmed", "on", "open", "waiting"], `${a.why}: requests: the switch, open, waiting, confirmed`);
  eq([r.on, r.open], [ownerList.on, ownerList.open], `${a.why}: on and open as the owner sees them`);
  eq([r.on, r.open], [true, true], `${a.why}: on, and players can send now`);
  eq(r.waiting, ownerList.waiting.map((w) => ({ at: w.at, hours: w.hours, when: w.when, created_at: w.created_at })), `${a.why}: the owner's waiting list, by time alone, newest first`);
  eq(r.confirmed, ownerList.confirmed.map((c) => ({ at: c.at, hours: c.hours, when: c.when })), `${a.why}: the owner's confirmed list, by time alone, soonest first`);
  eq([r.waiting.map((w) => w.at), r.confirmed.map((c) => c.at)], [[K(1, 19)], [K(3, 18)]], `${a.why}: P's waiting one and Q's confirmed one; started, declined, cancelled and ended ones left out`);
  eq(r.waiting[0].when, (await one(`select private.booking_when(private.slot_at($1), 2) w`, [K(1, 19)])).w, `${a.why}: the words, "Sat 7 Nov, 7 PM to 9 PM"`);
  for (const w of r.waiting) eq(Object.keys(w).sort(), ["at", "created_at", "hours", "when"], `${a.why}: a waiting row's keys`);
  for (const c of r.confirmed) eq(Object.keys(c).sort(), ["at", "hours", "when"], `${a.why}: a confirmed row's keys`);
  // Never a name, number, note, request id or account.
  const text = JSON.stringify(v);
  const ids = (await q(`select id::text i, user_id::text u from private.booking_requests`)).flatMap((x) => [x.i, x.u]);
  ok(!/\+?91\d{10}|\b\d{10}\b/.test(text), `${a.why}: no phone number in the answer`);
  ok(!/Priya|Qasim|Rohan|Asha|Manoj|Sita|Omkar|Player/.test(text), `${a.why}: no name in the answer`);
  ok(![NOTE_P, NOTE_Q, NOTE_R, "Old one", "Closed for a match", "bibs", "Ramesh"].some((n) => text.includes(n)), `${a.why}: no note or reason in the answer`);
  ok(!ids.some((i) => text.includes(i)) && ![A, MGR, ST, O2, P, Q, R].some((i) => text.includes(i)), `${a.why}: no request id or account in the answer`);
  ok(!/"(id|name|phone|note|user_id|reason|player_name|player_phone)"/.test(text), `${a.why}: none of those keys at all`);
}
eq(views[0], { ...views[1], now: views[0].now }, "both of the site owner's sign-ins see the same");
eq(await snapshot(), before, "reading it changed no row in any table (R's started request stays stored as waiting)");
// While the switch is on but the free hours are a day old: on, not open.
await q(`update private.turf_availability set updated_at = now() - interval '25 hours' where turf_id = $1`, [T(1)]);
const stale = (await adminCall(admin, T(1))).requests;
eq([stale.on, stale.open, (await list(TOK.A, T(1))).open], [true, false, false], "on, but players can't send until the owner's free hours show");
await rpc("owner_confirm_slots", [TOK.A, T(1)]);
eq((await rpc("owner_set_booking_requests", [TOK.A, T(1), false])).on, false, "A turns requests off");
eq([(await adminCall(admin, T(1))).requests.on, (await adminCall(admin, T(1))).requests.open], [false, false], "off: on false, open false");
await rpc("owner_set_booking_requests", [TOK.A, T(1), true]);
// Two: never touched (no marks, no settings): the empty state.
const two = await adminCall(admin, T(2));
eq([two.updated_at, two.booked, two.requests], [null, [], { on: false, open: false, waiting: [], confirmed: [] }], "a turf whose owner never marked: nothing marked, requests off, none");

// ── 5. Booking_owner_state's limit: at most booking_list_max() of each. ──
for (let i = 0; i < 52; i++)
  await q(`insert into private.booking_requests (turf_id, user_id, starts_at, hours, ends_at, player_name, player_phone, status, created_at)
    values ($1, $2, date_trunc('hour', now()) + make_interval(hours => 30 + $3::int), 1, date_trunc('hour', now()) + make_interval(hours => 31 + $3::int), 'Priya Player', '+919100000001', $4, now() - make_interval(mins => $3::int))`,
    [T(2), P, i, i % 2 ? "waiting" : "confirmed"]);
for (let i = 0; i < 26; i++)
  await q(`insert into private.booking_requests (turf_id, user_id, starts_at, hours, ends_at, player_name, player_phone, status, created_at)
    values ($1, $2, date_trunc('hour', now()) + make_interval(hours => 100 + $3::int), 1, date_trunc('hour', now()) + make_interval(hours => 101 + $3::int), 'Priya Player', '+919100000001', $4, now() - make_interval(mins => 100 + $3::int))`,
    [T(2), P, i, i % 2 ? "waiting" : "confirmed"]);
const big = (await adminCall(admin, T(2))).requests;
const bigOwner = await list(TOK.O2, T(2));
eq([big.waiting.length, big.confirmed.length], [39, 39], "39 of each stored: all listed");
eq([big.waiting.map((w) => w.at), big.confirmed.map((c) => c.at)], [bigOwner.waiting.map((w) => w.at), bigOwner.confirmed.map((c) => c.at)], "in the owner's order");
for (let i = 0; i < 24; i++)
  await q(`insert into private.booking_requests (turf_id, user_id, starts_at, hours, ends_at, player_name, player_phone, status, created_at)
    values ($1, $2, date_trunc('hour', now()) + make_interval(hours => 140 + $3::int), 1, date_trunc('hour', now()) + make_interval(hours => 141 + $3::int), 'Priya Player', '+919100000001', $4, now() - make_interval(mins => 200 + $3::int))`,
    [T(2), P, i, i % 2 ? "waiting" : "confirmed"]);
const capped = (await adminCall(admin, T(2))).requests;
const cappedOwner = await list(TOK.O2, T(2));
eq([capped.waiting.length, capped.confirmed.length, cappedOwner.waiting.length, cappedOwner.confirmed.length], [50, 50, 50, 50], "51 of each stored: 50 listed, as the owner's list");
eq([capped.waiting.map((w) => w.at), capped.confirmed.map((c) => c.at)], [cappedOwner.waiting.map((w) => w.at), cappedOwner.confirmed.map((c) => c.at)], "the same 50, in the same order");

// ── 6. Everyone else: forbidden. A turf that doesn't exist: forbidden. Unclaimed or inactive: not_claimed. ──
const FORBIDDEN = { error: "forbidden" };
for (const [tok, claims, why] of [
  [TOK.A, null, "One's owner"], [TOK.M, null, "One's manager"], [TOK.S, null, "One's staff"], [TOK.O2, null, "another turf's owner"], [TOK.P, null, "a player"],
  ["phone:12345", null, "a bad token"], ["not-a-token", null, "nonsense"], ["", null, "an empty token"], [null, null, "nobody signed in"],
  [null, GOOGLE("gita.standin@example.com"), "a Google sign-in that isn't the site owner's"],
  [null, GOOGLE(ADMIN_KEYS.find((k) => k.startsWith("e:")).slice(2), false), "the site owner's address with an email and password session"],
  [`phone:${ADMIN_KEYS.find((k) => k.startsWith("p:")).slice(2).replace(/.$/, (d) => String((Number(d) + 1) % 10))}`, null, "a number one digit off the site owner's"],
]) {
  eq(await as(claims, () => rpc("admin_turf_slots", [tok, T(1)])), FORBIDDEN, `forbidden: ${why}`);
  eq(await as(claims, () => rpc("admin_turf_slots", [tok, T(3)])), FORBIDDEN, `forbidden on an unclaimed turf too: ${why}`);
}
for (const a of ADMINS) {
  eq(await adminCall(a, "dddddddd-0000-4000-8000-000000009999"), FORBIDDEN, `${a.why}: a turf that doesn't exist: forbidden`);
  eq(await adminCall(a, null), FORBIDDEN, `${a.why}: no turf: forbidden`);
  eq(await adminCall(a, T(3)), { error: "not_claimed" }, `${a.why}: an unclaimed turf: not_claimed`);
}
await q(`update public.turfs set is_active = false where id = $1`, [T(1)]);
eq(await adminCall(admin, T(1)), { error: "not_claimed" }, "an inactive turf: not_claimed");
await q(`update public.turfs set is_active = true where id = $1`, [T(1)]);
eq((await adminCall(admin, T(1))).ok, true, "active again: the view");

// ── 7. The site owner still changes nothing: Free slots and booking requests refuse them as before. ──
const before7 = await snapshot();
for (const a of ADMINS) {
  await as(a.claims, async () => {
    eq(await rpc("owner_slots", [a.token, T(1)]), FORBIDDEN, `${a.why}: owner_slots refuses them`);
    eq(await rpc("owner_set_slots", [a.token, T(1), JSON.stringify([{ at: K(1, 8), status: "booked" }])]), FORBIDDEN, `${a.why}: can't mark an hour`);
    eq(await rpc("owner_confirm_slots", [a.token, T(1)]), FORBIDDEN, `${a.why}: can't tap All correct`);
    eq(await rpc("owner_booking_requests", [a.token, T(1)]), FORBIDDEN, `${a.why}: no names list`);
    eq(await rpc("owner_set_booking_requests", [a.token, T(1), false]), FORBIDDEN, `${a.why}: can't switch requests`);
    eq(await rpc("owner_answer_booking_request", [a.token, p1.request.id, "confirm", null]), FORBIDDEN, `${a.why}: can't confirm`);
    eq(await rpc("owner_answer_booking_request", [a.token, p1.request.id, "decline", null]), FORBIDDEN, `${a.why}: can't decline`);
    eq(await rpc("owner_answer_booking_request", [a.token, q1.request.id, "cancel", null]), FORBIDDEN, `${a.why}: can't cancel`);
  });
}
for (const a of ADMINS) await adminCall(a, T(1));
eq(await snapshot(), before7, "none of that, nor the view again, changed a row");

// ── 8. The file again: nothing kept changes, and it still works. ──
await db.exec(NEW);
eq(await snapshot(), before7, "the file again: every row kept");
eq((await adminCall(admin, T(1))).requests.waiting.map((w) => w.at), [K(1, 19)], "and the view still works");

console.log(`admin_slots_view: ${passed} checks passed`);
