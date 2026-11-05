// Applies the account, myTapturf and claims migrations to stand-ins for
// Supabase in an in-memory Postgres (PGlite), as owner_call_number.check.mjs
// does, then 20261106_owner_claims_clarity.sql twice, and checks: the file
// (additive, no destructive keywords, exactly its two new functions, every
// function from before byte for byte as it was, with its grants); a claim
// on a turf with no mobile, with the turf's number given through
// owner_phone_listed, shows as the admin's "Number they gave";
// admin_owner_claim_signals (the site owner only; waiting claims only;
// counts and yes or no, nothing about a person; games made, join requests
// sent, a contact tap and turfs opened before signing up, or null when not
// recorded); admin_answer_owner_claim (the site owner only; decides through
// admin_decide_owner_claim; one notification to the claimant's account when
// a waiting claim is approved or rejected, typed, with the turf's id and
// slug, cut to the table's limits; nothing for a revoke, a restore, closing
// a revoked claim, deciding twice, an empty message, a claim with no
// account, a claim that isn't there or a bad status).
// Never touches a real database. Made-up numbers and people only.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/owner_claims_clarity.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261106_owner_claims_clarity.sql`;
const NEW = fs.readFileSync(FILE, "utf8");
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };

// ── The file. ──
assert.doesNotMatch(NEW, /\bdrop\b|\bdelete\b|\btruncate\b/i, "no destructive keywords");
assert.doesNotMatch(NEW, /[—–]/, "no em or en dashes");
assert.doesNotMatch(NEW.replace(/^\s*--.*$/gm, ""), /create\s+(or\s+replace\s+)?(table|view|trigger|index)\b|\balter\b|\bupdate\s+public\./i, "no table, view, trigger, index or rewrite");
passed += 3;
eq([...NEW.matchAll(/create or replace function (\w+\.\w+)\(/gi)].map((m) => m[1]), ["public.admin_owner_claim_signals", "public.admin_answer_owner_claim"], "two functions, both new");
ok(/Replaced: none\./.test(NEW), "the header says nothing is replaced");

// ── The database before it (owner_call_number.check.mjs's stand-ins and migrations). ──
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
create table public.user_signup_context (user_id uuid primary key, ctx jsonb not null, created_at timestamptz not null default now());
create table private.user_cities (user_id uuid primary key, city text, source text, ip_city text, at_signup boolean, updated_at timestamptz);
-- public.notifications as production has it (information_schema, 5 Nov 2026).
create table public.notifications (id uuid not null default gen_random_uuid() primary key, user_id uuid references public.users(id) on delete cascade,
  type text not null, title text not null, message text not null, metadata jsonb default '{}'::jsonb, is_read boolean default false, created_at timestamptz default now());
`);
const MIG = ["20261019_mytapturf.sql", "20261019_mytapturf_claims.sql", "20261021_accounts_usernames.sql", "20261021_accounts_fixes.sql",
  "20261021_phone_identity_exact_india.sql", "20261022_people_fixes.sql", "20261025_contact_email.sql", "20261025_admin_verified.sql",
  "20261025_auth_mirror_google_only.sql", "20261025_claims_account.sql", "20261024_users_lockdown_step4.sql",
  "20261026_account_links.sql", "20261026_account_links_reads.sql", "20261028_owner_call_number.sql"];
for (const f of MIG) await db.exec(fs.readFileSync(`${M}/${f}`, "utf8"));
// Firebase can't be reached here: _caller_key and firebase_phone10 stand-ins, as in claims_account.check.mjs.
await db.exec(`
create or replace function private.firebase_phone10(p_token text) returns text language sql as
  $$ select case when p_token ~ '^proof:[6-9][0-9]{9}$' then substr(p_token, 7) end $$;
create or replace function public._caller_key(p_token text) returns text language sql security definer set search_path = public as $$
  select case when p_token ~ '^phone:[6-9][0-9]{9}$' then 'p:' || substr(p_token, 7) end $$;
create or replace function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);

// Every function before the file: its source and its grants.
const FN_SQL = `select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f, md5(p.prosrc) as h, coalesce(p.proacl::text, '') as acl,
  p.prosecdef as sd, coalesce(array_to_string(p.proconfig, ','), '') as cfg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private', 'auth')`;
const before = await q(`${FN_SQL} order by 1`);
await db.exec(NEW);
await db.exec(NEW); // safe to run again
const after = await q(`${FN_SQL} and p.proname not in ('admin_owner_claim_signals', 'admin_answer_owner_claim') order by 1`);
eq(after, before, "every function from before is byte for byte as it was, with its grants and settings");
eq((await q(`select p.proname, count(*)::int n from pg_proc p where p.proname in ('admin_owner_claim_signals', 'admin_answer_owner_claim') group by 1 order by 1`)),
  [{ proname: "admin_answer_owner_claim", n: 1 }, { proname: "admin_owner_claim_signals", n: 1 }], "no overload after running it twice");
const grants = async (sig) => (await one(`select has_function_privilege('anon', '${sig}', 'execute') a, has_function_privilege('authenticated', '${sig}', 'execute') b,
  has_function_privilege('public', '${sig}', 'execute') p, (select prosecdef from pg_proc where oid = '${sig}'::regprocedure) sd`));
eq(await grants("public.admin_owner_claim_signals(text)"), { a: true, b: true, p: false, sd: true }, "signals: the API roles may call it (it checks the site owner), PUBLIC not; security definer");
eq(await grants("public.admin_answer_owner_claim(text,uuid,text,text,text,text)"), { a: true, b: true, p: false, sd: true }, "answer: the same");

// ── People, turfs, claims. ──
const KEY = (await one("select value from private.app_secrets where name = 'account'")).value;
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const phoneAccount = async (p10, name) => {
  const r = await rpc("account_resolve", [KEY, "phone", `+91${p10}`, null, null, name, null, true, false]);
  assert.equal(r.r, "ok", `account for ${name}`);
  return r.id;
};
const owner = async (yes) => q(`select set_config('test.owner', $1, false)`, [yes ? "yes" : "no"]);
const T = (i) => `cccccccc-0000-4000-8000-${String(i).padStart(12, "0")}`;
await q(`insert into public.turfs (id, name, slug, city) values ('${T(1)}', 'No Number Box', 'no-number-box', 'noida')`);
await q(`insert into public.turfs (id, name, slug, city, owner_phone) values ('${T(2)}', 'Listed Arena', 'listed-arena', 'pune', '9000000700')`);
await q(`insert into public.turfs (id, name, slug, city) values ('${T(3)}', 'Third Ground', null, 'delhi')`);
const P = await phoneAccount("9000000501", "Player One");
const Q = await phoneAccount("9000000502", "Player Two");
const O = await phoneAccount("9000000503", "Owner Three");
await owner(false);

// A claim on a turf with no mobile: the turf's number goes through owner_phone_listed (the existing check path), then the claim.
eq(await rpc("owner_claim_info", ["phone:9000000501", T(1)]), { mobiles: 0, endings: [] }, "no mobile on the listing: checked by hand");
eq(await rpc("owner_phone_listed", ["phone:9000000501", T(1), "+91 90000 00999"]), { listed: false }, "the turf's number they give is kept, not listed");
eq(await rpc("owner_claim", ["phone:9000000501", T(1), null, "We want to book box cricket for 2 hours", "owner"]), { status: "pending" }, "P's claim waits");
eq(await rpc("owner_claim", ["phone:9000000502", T(1), null, null, "staff"]), { status: "pending" }, "Q's claim waits");
eq(await rpc("owner_phone_listed", ["phone:9000000503", T(2), "9000000704"]), { listed: false }, "O types a number not on Listed Arena");
eq(await rpc("owner_claim", ["phone:9000000503", T(2), null, "I run it with my brother", "manager"]), { status: "pending" }, "O's claim waits");
eq(await rpc("owner_claim", ["phone:9000000503", T(3), null, null, "owner"]), { status: "pending" }, "O's second claim waits");
// An old claim made before claims named an account: no account to tell.
await q(`insert into public.turf_owners (turf_id, user_key, status, via, name, role) values ('${T(3)}', 'e:nobody@example.com', 'pending', 'admin', 'Typed', 'owner')`);
// Q made a game here and sent two join requests; Q's sign-up context says a contact tap and 5 turfs opened.
await q(`insert into public.games (creator_id, turf_id, host_name, date, status) values ($1, '${T(1)}', 'Player Two', current_date, 'open')`, [Q]);
await q(`insert into public.games (creator_id, turf_id, host_name, date, status) values ($1, '${T(2)}', 'Player One', current_date, 'open')`, [P]);
await q(`insert into public.game_requests (user_id, game_id, status) select $1, id, 'pending' from public.games limit 2`, [Q]);
await q(`insert into public.user_signup_context (user_id, ctx) values ($1, $2)`, [Q, JSON.stringify({ interest: { cities: ["noida"], turfs_opened: 5 }, funnel: { first_visit: "2026-11-01T10:00:00Z", contact_click: "2026-11-01T10:03:00Z", signup: "2026-11-01T10:05:00Z" } })]);
await q(`insert into public.user_signup_context (user_id, ctx) values ($1, $2)`, [O, JSON.stringify({ interest: { turfs_opened: 1 }, funnel: { first_visit: "2026-11-02T10:00:00Z", signup: "2026-11-02T10:01:00Z" } })]);

// ── The admin's "Number they gave" for the no-mobile claim, as before. ──
await owner(true);
const claims = await rpc("admin_owner_claims", [null]);
const claimOf = (turf, key) => claims.find((c) => c.turf_id === turf && c.user_key === key);
eq(claimOf(T(1), "p:9000000501").phone_given, "9000000999", "the turf's number they gave shows on the card");
eq(claimOf(T(1), "p:9000000501").listed_phones, [], "the listing has no mobile");

// ── admin_owner_claim_signals. ──
await owner(false);
eq(await rpc("admin_owner_claim_signals", [null]), { error: "forbidden" }, "signals: not for anyone but the site owner");
await owner(true);
const sig = await rpc("admin_owner_claim_signals", [null]);
eq(sig.length, 5, "one row per waiting claim");
for (const r of sig) eq(Object.keys(r).sort(), ["games", "games_here", "pre_contact_tap", "pre_turfs_opened", "requests", "turf_id", "user_key"], "counts and yes or no only");
const sigOf = (turf, key) => sig.find((r) => r.turf_id === turf && r.user_key === key);
eq(sigOf(T(1), "p:9000000502"), { turf_id: T(1), user_key: "p:9000000502", games: 1, games_here: 1, requests: 2, pre_contact_tap: true, pre_turfs_opened: 5 }, "Q: a game here, two requests, a tap and 5 turfs before signing up");
eq(sigOf(T(1), "p:9000000501"), { turf_id: T(1), user_key: "p:9000000501", games: 1, games_here: 0, requests: 0, pre_contact_tap: null, pre_turfs_opened: null }, "P: a game elsewhere; no sign-up context: not recorded, never false");
eq(sigOf(T(2), "p:9000000503"), { turf_id: T(2), user_key: "p:9000000503", games: 0, games_here: 0, requests: 0, pre_contact_tap: false, pre_turfs_opened: 1 }, "O: nothing that points to a player");
eq(sigOf(T(3), "e:nobody@example.com"), { turf_id: T(3), user_key: "e:nobody@example.com", games: 0, games_here: 0, requests: 0, pre_contact_tap: null, pre_turfs_opened: null }, "no account: zero and unknown");

// ── admin_answer_owner_claim. ──
const notes = () => q(`select user_id, type, title, message, metadata, is_read from public.notifications order by created_at, id`);
const status = async (turf, key) => (await one(`select status from public.turf_owners where turf_id = $1 and user_key = $2`, [turf, key]))?.status;
const answer = (turf, key, st, title, message) => rpc("admin_answer_owner_claim", [null, turf, key, st, title, message]);
const REJ = ["We couldn't confirm your claim", "TapTurf could not confirm that you run No Number Box. If you wanted to play there: For bookings, contact the turf directly."];

await owner(false);
eq(await answer(T(1), "p:9000000501", "rejected", ...REJ), { error: "forbidden" }, "answer: not for anyone but the site owner");
eq(await status(T(1), "p:9000000501"), "pending", "nothing decided");
await owner(true);
eq(await answer(T(1), "p:9000000501", "rejected", ...REJ), { ok: true, notified: true }, "reject P: decided and told");
eq(await status(T(1), "p:9000000501"), "rejected", "rejected");
eq(await notes(), [{ user_id: P, type: "owner_claim_rejected", title: REJ[0], message: REJ[1], metadata: { turfId: T(1), slug: "no-number-box" }, is_read: false }], "one notification to P's account, with the turf's id and slug");
eq((await one(`select from_status, to_status, how from private.turf_owner_events where turf_id = $1 and user_key = $2 order by id desc limit 1`, [T(1), "p:9000000501"])), { from_status: "pending", to_status: "rejected", how: "admin" }, "logged as admin_decide_owner_claim logs it");
eq(await answer(T(1), "p:9000000501", "rejected", ...REJ), { ok: true, notified: false }, "deciding the same claim again tells nobody again");
eq((await notes()).length, 1, "still one");

eq(await answer(T(2), "p:9000000503", "active", "Your turf is on myTapturf now", "TapTurf confirmed that you run Listed Arena."), { ok: true, notified: true }, "approve O: decided and told");
eq(await status(T(2), "p:9000000503"), "active", "active");
const approved = (await notes())[1];
eq([approved.user_id, approved.type, approved.metadata], [O, "owner_claim_approved", { turfId: T(2), slug: "listed-arena" }], "the approval goes to O's account");
eq(await answer(T(2), "p:9000000503", "revoked", "x", "y"), { ok: true, notified: false }, "revoking tells nobody");
eq(await answer(T(2), "p:9000000503", "active", "x", "y"), { ok: true, notified: false }, "restoring tells nobody");
eq(await answer(T(2), "p:9000000503", "revoked", null, null), { ok: true, notified: false }, "revoked again");
eq(await answer(T(2), "p:9000000503", "rejected", "x", "y"), { ok: true, notified: false }, "closing a revoked claim tells nobody");
eq((await notes()).length, 2, "two notifications so far");

eq(await answer(T(1), "p:9000000502", "rejected", "  ", "message"), { ok: true, notified: false }, "an empty title: decided, nobody told");
eq(await status(T(1), "p:9000000502"), "rejected", "Q rejected");
eq(await answer(T(3), "e:nobody@example.com", "rejected", "t", "m"), { ok: true, notified: false }, "a claim with no account: decided, nobody to tell");
eq(await answer(T(3), "p:9000000999", "rejected", "t", "m"), { ok: false, notified: false }, "a claim that isn't there");
eq(await answer(T(3), "p:9000000503", "maybe", "t", "m"), { error: "bad_status", notified: false }, "a bad status");
eq(await status(T(3), "p:9000000503"), "pending", "nothing changed by it");
eq((await notes()).length, 2, "none of those made a notification");

// Cut to the table's limits; a turf with no slug keeps its id.
eq(await answer(T(3), "p:9000000503", "active", "T".repeat(300), "M".repeat(900)), { ok: true, notified: true }, "approve O's second claim");
const long = (await notes())[2];
eq([long.title.length, long.message.length, long.metadata], [120, 400, { turfId: T(3), slug: null }], "title 120, message 400; no slug: the id");

// Who gets in at once, the statuses and the 5-pending limit live in the claim functions, untouched (their md5 above).
const all = await q(`select status, count(*)::int n from public.turf_owners group by 1 order by 1`);
eq(all, [{ status: "active", n: 1 }, { status: "rejected", n: 4 }], "statuses as the decisions left them");

console.log(`owner_claims_clarity: ${passed} checks passed`);
