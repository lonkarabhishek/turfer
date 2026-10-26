// Applies the real account, contact-email, admin-verified, auth-mirror, myTapturf,
// claims-account, people and lockdown-step-4 migrations to stand-ins for Supabase in an
// in-memory Postgres (PGlite), then 20261026_account_links.sql and
// 20261026_account_links_reads.sql, each twice, and checks both ways into one account:
// a phone account adding Google, a Google account adding a phone, every refusal, and
// the owner's decision of 2026-10-26 that a Google account's own row that was never
// used (private.account_is_empty) does not block a link: the link is made over it,
// the row stays untouched, and a row with any kind of activity is still refused.
// Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/account_links.check.mjs supabase/migrations \
//   supabase/migrations/20261026_account_links.sql supabase/migrations/20261026_account_links_reads.sql
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const [M, CORE, READS] = process.argv.slice(2);
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };

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
grant select, insert, update, delete on public.users to anon, authenticated;
create table public.user_logins (id bigint generated always as identity primary key, user_id uuid not null,
  method text not null check (method in ('phone','google')), created_at timestamptz not null default now());
create table public.live_matches (code text primary key, match jsonb, rev bigint, status text, updated_at timestamptz default now());
create table public.turfs (id uuid primary key default gen_random_uuid(), name text, slug text, city text, area text, address text, is_active boolean default true,
  contact_info jsonb, owner_phone text, whatsapp_phone text, cover_image text, images jsonb, owner_id uuid,
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
create table public.user_signup_context (user_id uuid primary key, ctx jsonb, created_at timestamptz default now());
create table private.user_cities (user_id uuid primary key, city text, source text, ip_city text, at_signup boolean, updated_at timestamptz);
`);
const MIG = ["20261019_mytapturf.sql", "20261019_mytapturf_claims.sql", "20261021_accounts_usernames.sql", "20261021_accounts_fixes.sql",
  "20261021_phone_identity_exact_india.sql", "20261022_people_fixes.sql", "20261025_contact_email.sql", "20261025_admin_verified.sql",
  "20261025_auth_mirror_google_only.sql", "20261025_claims_account.sql"];
for (const f of MIG) await db.exec(fs.readFileSync(`${M}/${f}`, "utf8"));
await db.exec(`create trigger on_auth_user_created_sync_public_users after insert on auth.users for each row execute function public.handle_auth_user_created();`);

const core = fs.readFileSync(CORE, "utf8");
const reads = fs.readFileSync(READS, "utf8");
// The bodies the core file replaces are the live ones: md5(pg_proc.prosrc) on production,
// read 2026-10-26, equals the body in the file this check applied. (The reads file's
// generator checks its own the same way.)
const LIVE = {
  "20261021_accounts_fixes.sql:64": "32884ef1158f9f66e1a2c41520c917ec", // public.account_resolve
  "20261025_contact_email.sql:60": "8c26917d1a74d92287e9248ad29c8631", // private.profile_json
  "20261025_contact_email.sql:118": "297fcd03bfca0b425b2438c5eae83070", // public.account_set_email
  "20261025_claims_account.sql:168": "7d20a44b17d6cd346778c33098e39347", // private.account_for_key
  "20261025_claims_account.sql:199": "0c4c6178cea09439d042f5b4737e7891", // private.caller_account
  "20261025_admin_verified.sql:85": "f3033d025a0d79aee3bb01b61cb2c78e", // public.admin_verified
  "20261025_auth_mirror_google_only.sql:18": "36f82271772e142352016d5a0a59520b", // public.handle_auth_user_created
};
for (const [at, md5] of Object.entries(LIVE)) {
  const [file, line] = at.split(":");
  const text = fs.readFileSync(`${M}/${file}`, "utf8").split("\n").slice(Number(line) - 1).join("\n");
  assert.match(text, /^create or replace function /, `${at} is a create`);
  const open = text.indexOf("$$");
  eq(createHash("md5").update(text.slice(open + 2, text.indexOf("$$", open + 2))).digest("hex"), md5, `${at} is the live body`);
}
// The reads file is exactly what its generator makes from the live bodies.
const regen = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "account-links-")), "reads.sql");
execFileSync(process.execPath, [new URL("./build_account_links_reads.mjs", import.meta.url).pathname, M, regen]);
eq(fs.readFileSync(regen, "utf8"), reads, "the reads file is the generated one");
fs.rmSync(path.dirname(regen), { recursive: true, force: true });
for (const s of [core, reads]) {
  assert.doesNotMatch(s, /\bdrop\b|\bdelete\b|\btruncate\b/i, "no destructive keywords");
  assert.doesNotMatch(s, /[—–]/, "no em or en dashes");
}
// The gate: refused while the API can still insert users rows.
await assert.rejects(db.exec(core), /users_lockdown_step4/, "needs lockdown step 4 first");
passed++;
await db.exec(fs.readFileSync(`${M}/20261024_users_lockdown_step4.sql`, "utf8"));
await db.exec(core);
await db.exec(core);
await db.exec(reads);
await db.exec(reads);

// Each replaced function keeps production's signature, result, security definer,
// volatility and search_path (pg_proc on production, read 2026-10-26).
const SIGS = [
  `private.account_for_key(p_key text) -> uuid true s search_path=""`,
  `private.caller_account(p_key text) -> uuid true s search_path=""`,
  `private.profile_json(p_user_id uuid) -> jsonb true s search_path=""`,
  `public._can_manage(p_key text, p_turf_id uuid) -> boolean true s search_path=public`,
  `public.account_resolve(p_key text, p_kind text, p_phone text DEFAULT NULL::text, p_uid uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_avatar text DEFAULT NULL::text, p_create boolean DEFAULT false, p_log boolean DEFAULT false) -> jsonb true v search_path=""`,
  `public.account_set_email(p_key text, p_user_id uuid, p_action text, p_email text DEFAULT NULL::text, p_source text DEFAULT 'profile'::text) -> jsonb true v search_path=""`,
  `public.admin_people(p_firebase_token text DEFAULT NULL::text) -> TABLE(id uuid, name text, email text, phone text, profile_image_url text, role text, is_verified boolean, created_at timestamp with time zone, signed_up_at timestamp with time zone, updated_at timestamp with time zone, method text, username text, taggable boolean, logins integer, last_login timestamp with time zone, login_methods text[], games_hosted integer, requests integer, requests_accepted integer, games_joined integer, reviews integer, contact_taps integer, contacted jsonb, asks integer, recent_asks text[], suggestions integer, turfs jsonb, last_active timestamp with time zone, signup jsonb, city text, city_source text, city_ip text, city_at_signup boolean, city_at timestamp with time zone, likely_city text, likely_share real) true s search_path=""`,
  `public.admin_verified(p_firebase_token text DEFAULT NULL::text) -> TABLE(user_id uuid, email_by_google boolean, email_confirmed boolean, phone_by_code boolean) true s search_path=""`,
  `public.get_recent_logins(p_limit integer DEFAULT 200, p_firebase_token text DEFAULT NULL::text) -> TABLE(user_id uuid, name text, phone text, email text, method text, logged_in_at timestamp with time zone) true v search_path=public`,
  `public.handle_auth_user_created() -> trigger true v search_path=""`,
  `public.owner_claim(p_token text, p_turf_id uuid, p_name text DEFAULT NULL::text, p_note text DEFAULT NULL::text) -> jsonb true v search_path=public`,
  `public.owner_claim(p_token text, p_turf_id uuid, p_name text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_role text DEFAULT NULL::text) -> jsonb true v search_path=public`,
  `public.owner_claim_verified(p_token text, p_proof text, p_turf_id uuid, p_note text DEFAULT NULL::text, p_role text DEFAULT NULL::text) -> jsonb true v search_path=public`,
  `public.owner_home(p_token text DEFAULT NULL::text) -> jsonb true v search_path=public`,
  `public.owner_update_turf(p_token text, p_turf_id uuid, p_patch jsonb) -> jsonb true v search_path=public`,
];
eq((await q(`select n.nspname || '.' || p.proname || '(' || pg_get_function_arguments(p.oid) || ') -> ' || pg_get_function_result(p.oid)
                    || ' ' || p.prosecdef::text || ' ' || p.provolatile::text || ' ' || coalesce(array_to_string(p.proconfig, ','), '') sig
               from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where (n.nspname, p.proname) in (('private','profile_json'),('public','account_resolve'),('public','handle_auth_user_created'),
                     ('private','account_for_key'),('private','caller_account'),('public','account_set_email'),('public','admin_verified'),
                     ('public','_can_manage'),('public','owner_home'),('public','owner_claim'),('public','owner_claim_verified'),
                     ('public','owner_update_turf'),('public','admin_people'),('public','get_recent_logins'))
              order by 1`)).map((x) => x.sig), SIGS, "every replaced function keeps its live signature, result and settings");
// And production's EXECUTE grants (anon, authenticated, public), read the same day.
const GRANTS = {
  "private.account_for_key(p_key text)": "---", "private.caller_account(p_key text)": "---", "private.profile_json(p_user_id uuid)": "---",
  "public._can_manage(p_key text, p_turf_id uuid)": "---",
  "public.account_resolve(p_key text, p_kind text, p_phone text, p_uid uuid, p_email text, p_name text, p_avatar text, p_create boolean, p_log boolean)": "aa-",
  "public.account_set_email(p_key text, p_user_id uuid, p_action text, p_email text, p_source text)": "aa-",
  "public.admin_people(p_firebase_token text)": "aa-", "public.admin_verified(p_firebase_token text)": "aa-",
  "public.get_recent_logins(p_limit integer, p_firebase_token text)": "aa-", "public.handle_auth_user_created()": "---",
  "public.owner_claim(p_token text, p_turf_id uuid, p_name text, p_note text)": "---",
  "public.owner_claim(p_token text, p_turf_id uuid, p_name text, p_note text, p_role text)": "aap",
  "public.owner_claim_verified(p_token text, p_proof text, p_turf_id uuid, p_note text, p_role text)": "aa-",
  "public.owner_home(p_token text)": "aap", "public.owner_update_turf(p_token text, p_turf_id uuid, p_patch jsonb)": "aap",
};
eq(Object.fromEntries((await q(`select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' f,
                    case when has_function_privilege('anon', p.oid, 'execute') then 'a' else '-' end
                    || case when has_function_privilege('authenticated', p.oid, 'execute') then 'a' else '-' end
                    || case when has_function_privilege('public', p.oid, 'execute') then 'p' else '-' end g
               from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = any($1)`, [Object.keys(GRANTS)]))
  .map((x) => [x.f, x.g])), GRANTS, "and its live EXECUTE grants");

// Firebase can't be reached here: _caller_key and firebase_phone10 stand-ins, as in claims_account.check.mjs.
await db.exec(`
create or replace function private.firebase_phone10(p_token text) returns text language sql as
  $$ select case when p_token ~ '^proof:[6-9][0-9]{9}$' then substr(p_token, 7) end $$;
create or replace function public._caller_key(p_token text) returns text language sql security definer set search_path = public as $$
  select case when lower(coalesce(auth.jwt() ->> 'email', '')) <> '' and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb
                   and coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method": "oauth"}]'::jsonb
              then 'e:' || lower(auth.jwt() ->> 'email')
              when p_token ~ '^phone:[6-9][0-9]{9}$' then 'p:' || substr(p_token, 7) end $$;
create or replace function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);

const KEY = (await one("select value from private.app_secrets where name = 'account'")).value;
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const resolve = (o) => rpc("account_resolve", [o.key ?? KEY, o.kind, o.phone ?? null, o.uid ?? null, o.email ?? null, o.name ?? null, null, o.create ?? false, o.log ?? false]);
const H = (s) => createHash("sha256").update(s).digest("hex");
const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const google = async (id, email, extra = {}) => {
  await q(`insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at)
           values ($1, $2, now(), '{"provider":"google","providers":["google"]}', $3, coalesce($4::timestamptz, now()))`,
    [id, email, JSON.stringify({ full_name: extra.name ?? null }), extra.created ?? null]);
  await q(`insert into auth.identities (user_id, provider, identity_data) values ($1, 'google', jsonb_build_object('email', $2::text, 'email_verified', $3::boolean))`,
    [id, email, extra.verified ?? true]);
};
const count = async (t, w = "true") => (await one(`select count(*)::int n from ${t} where ${w}`)).n;
const NOW = () => new Date().toISOString();
const AGO = (s) => new Date(Date.now() - s * 1000).toISOString();
// Link helpers. sub and proof keys as the server makes them.
const start = (phone, secret, o = {}) => rpc("account_link_start", [KEY, phone, o.sub ?? `fb-${phone}`, o.at ?? NOW(), o.proof ?? H(`proof-${secret}`), H(secret)]);
const attach = (secret, uid) => rpc("account_link_attach", [KEY, H(secret), uid]);
const status = (secret, sub) => rpc("account_link_status", [KEY, H(secret), sub]);
const complete = (secret, phone, sub) => rpc("account_link_google", [KEY, H(secret), phone, sub ?? `fb-${phone}`]);
const leg = (secret, sub, next) => rpc("account_link_leg", [KEY, H(secret), sub, H(next)]);

// ── 1. The trigger makes no row; account_resolve with create does. ──
await google(U(1), "g1@gmail.com");
eq(await count("public.users", `id = '${U(1)}'`), 0, "trigger makes no account");
let r = await resolve({ kind: "google", uid: U(1), email: "g1@gmail.com", name: "Gee", create: true });
eq([r.r, r.created, r.email, r.google_email, r.google_linkable, r.phone_settable, r.ask_google], ["ok", true, "g1@gmail.com", null, false, true, false], "Google create");
eq(await count("public.user_logins", `user_id = '${U(1)}'`), 0, "POST does not log Google (p_log false)");
r = await resolve({ kind: "google", uid: U(1), email: "g1@gmail.com", create: true, log: true });
eq(await count("public.user_logins", `user_id = '${U(1)}' and method = 'google'`), 1, "the callback logs once");
await q(`update public.user_logins set created_at = now() - interval '11 minutes' where user_id = '${U(1)}'`);
await resolve({ kind: "google", uid: U(1), email: "g1@gmail.com", create: true });
await resolve({ kind: "google", uid: U(1), email: "g1@gmail.com" });
eq(await count("public.user_logins", `user_id = '${U(1)}'`), 1, "resolves without p_log, 11 minutes later, write nothing");

// Capitalised old-app email: lands on the old-app row (the legacy rule), no new row.
await q(`insert into public.users (id, name, email, created_at) values ('${U(30)}', 'Old Caps', 'Old.Caps@Gmail.com', '2025-01-01')`);
await q(`insert into private.legacy_email_rows (user_id) values ('${U(30)}')`);
await google(U(31), "old.caps@gmail.com");
r = await resolve({ kind: "google", uid: U(31), email: "old.caps@gmail.com", create: true });
eq([r.r, r.id, r.created, r.phone_settable], ["ok", U(30), false, true], "capitalised legacy email lands on the old-app row");
eq(await count("public.users", `id = '${U(31)}'`), 0);
// A non-legacy row with the address in another case: the new Google account gets no email.
await q(`insert into public.users (id, name, email) values ('${U(32)}', 'Case', 'Case.Held@Gmail.com')`);
await google(U(33), "case.held@gmail.com");
r = await resolve({ kind: "google", uid: U(33), email: "case.held@gmail.com", create: true });
eq([r.r, r.id, r.email], ["ok", U(33), null], "held in another case: made without the email");

// ── 2. Phone account P adds Google G2 (new to TapTurf). ──
const PH = "+919000000001";
r = await resolve({ kind: "phone", phone: PH, name: "Asha", create: true });
const P = r.id;
eq([r.ask_email, r.ask_google, r.google_linkable, r.phone_confirmed, r.email_editable, r.phone_settable], [false, true, true, true, false, false], "phone account flags");
eq((await start(PH, "a1", { at: AGO(400) })).r, "stale", "phone sign-in older than 5 minutes");
eq((await start(PH, "a1")).r, "ok", "start");
eq((await one(`select private.profile_json('${P}') p`)).p.ask_google, false, "asked once: never again after any try");
await google(U(2), "Asha.P@Gmail.com");
eq((await status("a1", `fb-${PH}`)).state, "waiting");
eq((await status("a1", "fb-other")).state, "none", "another phone sign-in sees nothing");
eq((await attach("a1", U(2))).r, "ok", "attach");
eq((await attach("a1", U(2))).r, "used", "one return per leg");
r = await status("a1", `fb-${PH}`);
eq([r.state, r.google_email], ["attached", "asha.p@gmail.com"], "confirm screen shows the Google address");
// While attached, a create for G2 is refused.
eq((await resolve({ kind: "google", uid: U(2), email: "asha.p@gmail.com", create: true })).r, "linking", "no second account while linking");
eq(await count("public.users", `id = '${U(2)}'`), 0);
eq((await complete("a1", PH, "fb-someone")).r, "mismatch", "another Firebase user");
eq((await complete("a1", PH)).r, "expired", "mismatch closed it");
eq((await start(PH, "a2")).r, "ok");
eq((await attach("a2", U(2))).r, "ok");
eq((await complete("a2", "+919000000009")).r, "mismatch", "another number");
eq((await start(PH, "a3")).r, "ok");
eq((await complete("a3", PH)).r, "expired", "nothing attached yet");
eq((await attach("a3", U(2))).r, "ok");
r = await complete("a3", PH);
eq([r.r, r.id, r.email, r.google_email, r.ask_google, r.google_linkable], ["ok", P, "asha.p@gmail.com", "asha.p@gmail.com", false, true], "linked");
eq((await complete("a3", PH)).r, "ok", "same completion again: same answer");
eq((await attach("a3", U(2))).r, "used", "used leg");
r = await status("a3", `fb-${PH}`);
eq([r.state, r.outcome, r.google_email], ["closed", "linked", "asha.p@gmail.com"], "status after the link (Back after Done)");
// Later sign-ins.
r = await resolve({ kind: "google", uid: U(2), email: "asha.p@gmail.com", create: true, log: true });
eq([r.r, r.id, r.created], ["ok", P, false], "Google opens the phone account");
eq(await count("public.user_logins", `user_id = '${P}' and method = 'google'`), 1, "logged on the account");
eq((await resolve({ kind: "phone", phone: PH })).id, P, "phone still opens it");
eq(await count("public.users", `id = '${U(2)}'`), 0, "never a second row");
eq((await one(`select private.account_for_key('e:asha.p@gmail.com') a`)).a, P, "myTapturf e: key");
await q(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: U(2) })]);
eq((await one(`select private.caller_account('e:asha.p@gmail.com') a`)).a, P, "caller_account by auth.uid()");
await q(`select set_config('request.jwt.claims', '', false)`);
// The proof that started a3 can't start another intent (a lost reply only gets a new leg while it is open).
eq((await start(PH, "a4", { proof: H("proof-a3") })).r, "used", "one OTP, one intent");

// ── 3. Refusals keep the intent open for another Google account. ──
const PH2 = "+919000000002";
const P2 = (await resolve({ kind: "phone", phone: PH2, name: "Ravi", create: true })).id;
// G1's own row has been used (a review), so it is in the way.
await q(`insert into public.reviews (user_id, rating, comment) values ('${U(1)}', 5, 'Good turf')`);
eq((await start(PH2, "b1")).r, "ok");
r = await attach("b1", U(1));
eq([r.r, r.other_empty], ["has_account", false], "Google with its own used account");
ok(/^\d{4}-\d{2}-\d{2}$/.test(r.other_made_on), "with the day it was made");
r = await status("b1", `fb-${PH2}`);
eq([r.state, r.problem, r.other_empty], ["refused", "has_account", false], "refusal on the page");
eq((await leg("b1", `fb-${PH2}`, "b2")).r, "ok", "try a different Google account");
eq((await leg("b1", `fb-${PH2}`, "b2x")).r, "expired", "only the newest leg");
eq((await attach("b2", U(2))).r, "other_account", "Google already on another account");
eq((await leg("b2", `fb-${PH2}`, "b3")).r, "ok");
r = await attach("b3", U(31));
eq([r.r, r.other_empty], ["has_account", true], "Google that lands on an old-app row: refused, even when that row is empty");
await google(U(8), "unverified@gmail.com", { verified: false });
eq((await leg("b3", `fb-${PH2}`, "b4")).r, "ok");
eq((await attach("b4", U(8))).r, "unverified");
eq((await leg("b4", "fb-x", "b5")).r, "mismatch", "only the same phone sign-in");
eq((await leg("b4", `fb-${PH2}`, "b5")).r, "ok", "fifth leg");
eq((await leg("b5", `fb-${PH2}`, "b6")).r, "limit", "five legs an intent");
await q(`update private.account_link_intents set expires_at = now() - interval '1 second' where user_id = '${P2}' and closed_at is null`);
eq((await attach("b5", U(9))).r, "expired", "ten minutes");
eq(await count("private.account_reports", `kind = 'link_has_account'`), 2, "has_account refusals reported");
eq((await start(PH2, "c1")).r, "ok");
eq((await start(PH2, "c2")).r, "ok", "a new start replaces the open one");
eq((await attach("c1", U(9))).r, "expired", "the replaced intent's leg");
eq((await rpc("account_link_cancel", [KEY, H("c2")])).r, "ok");
eq((await status("c2", `fb-${PH2}`)).outcome, "cancelled");
eq((await start(PH2, "c3")).r, "ok");
eq((await start(PH2, "c3b")).r, "ok", "the fifth in an hour");
r = await start(PH2, "c4");
eq(r.r, "limit", "5 an hour");
ok(new Date(r.until) > new Date(), "with when it frees up");
eq((await start("+919999999999", "n1")).r, "new");
eq((await rpc("account_link_start", ["nope", PH2, "fb", NOW(), H("x"), H("n2")])).r, "unavailable", "wrong key");
eq((await start("+91900000000x", "n3")).r, "bad");

// ── 3b. The owner's decision (2026-10-26): an own row never used doesn't block a link. ──
const row = async (id) => (await one(`select to_jsonb(u) j from public.users u where u.id = $1`, [id]))?.j ?? null;
const empty = async (id) => (await one(`select private.account_is_empty($1) e`, [id])).e;
const asJwt = async (claims) => q(`select set_config('request.jwt.claims', $1, false)`, [claims ? JSON.stringify(claims) : ""]);
// Google account E has its own row, from a sign-in that never went further.
const E = U(50);
await google(E, "empty.g@gmail.com", { name: "Emma" });
r = await resolve({ kind: "google", uid: E, email: "empty.g@gmail.com", name: "Emma", create: true, log: true });
eq([r.r, r.id, r.email], ["ok", E, "empty.g@gmail.com"], "E has its own row");
eq(await empty(E), true, "and nothing in it");
const eRow = await row(E);
const eLogins = await count("public.user_logins", `user_id = '${E}'`);
const PHE = "+919000000020";
const PE = (await resolve({ kind: "phone", phone: PHE, name: "Esha", create: true })).id;
eq(await one(`select private.google_link_problem('${E}', '${PE}') p`), { p: null }, "an empty own row is not a problem");
eq((await start(PHE, "g1")).r, "ok");
r = await attach("g1", E);
eq([r.r, r.other_empty], ["ok", true], "attached over the empty own row");
ok(/^\d{4}-\d{2}-\d{2}$/.test(r.other_made_on), "with the day that row was made");
r = await status("g1", `fb-${PHE}`);
eq([r.state, r.google_email, r.other_empty], ["attached", "empty.g@gmail.com", true], "the confirm screen knows about the empty row");
r = await complete("g1", PHE);
eq([r.r, r.id, r.google_email, r.email, r.google_linkable], ["ok", PE, "empty.g@gmail.com", null, true],
  "linked; the address stays on the empty row, so the phone account's email stays empty");
eq(await count("private.account_reports",
  `kind = 'link_over_empty' and detail ->> 'user_id' = '${PE}' and detail ->> 'auth_uid' = '${E}'
   and detail ->> 'other_user_id' = '${E}' and (detail ->> 'other_empty')::boolean and detail ? 'other_made_on'`), 1, "reported for admin");
eq(await count("private.account_reports", `kind = 'link_email_held' and detail ->> 'user_id' = '${PE}'`), 1, "the held address reported");
// Every later Google sign-in opens the phone account.
r = await resolve({ kind: "google", uid: E, email: "empty.g@gmail.com", name: "Emma", create: true, log: true });
eq([r.r, r.id, r.created], ["ok", PE, false], "a later Google sign-in opens the phone account");
eq(await count("public.user_logins", `user_id = '${PE}' and method = 'google'`), 1, "logged on the phone account");
eq((await resolve({ kind: "google", uid: E, email: "empty.g@gmail.com" })).id, PE, "also without create");
eq((await rpc("account_google_fresh", [KEY, E, "empty.g@gmail.com", "Emma", null])).id, PE, "account_google_fresh gives the phone account too");
eq((await resolve({ kind: "phone", phone: PHE })).id, PE, "the phone still opens it");
eq((await one(`select private.google_account('${E}') a`)).a, PE, "google_account: the link first");
eq((await one(`select private.account_for_key('e:empty.g@gmail.com') a`)).a, PE, "myTapturf e: key");
const gE = { sub: E, email: "empty.g@gmail.com", app_metadata: { providers: ["google"] }, amr: [{ method: "oauth" }] };
await asJwt(gE);
eq((await one(`select private.caller_account('e:empty.g@gmail.com') a`)).a, PE, "caller_account");
const T10 = "bbbbbbbb-0000-4000-8000-000000000010";
await q(`insert into public.turfs (id, name, slug, city) values ('${T10}', 'Ten', 'ten', 'pune')`);
eq(await rpc("owner_claim", [null, T10, null, null, null]), { status: "pending" }, "a claim from the Google sign-in");
eq((await one(`select user_id from public.turf_owners where turf_id = '${T10}'`)).user_id, PE, "is the phone account's");
await asJwt(null);
eq(await empty(E), true, "and leaves the empty row empty");
// The owner's decision 3: a Google sign-in on a linked phone account never changes its number.
eq((await rpc("account_set_phone", [KEY, E, "+919000000022", H("ge1")])).r, "not_allowed", "no number set from the Google sign-in");
eq((await rpc("account_remove_phone", [KEY, E])).r, "not_allowed", "nor removed");
eq((await resolve({ kind: "phone", phone: PHE })).phone, PHE, "the phone account keeps its number");
// Admin: the claim is listed on the phone account only; the empty row holds no key.
await q(`select set_config('test.owner', 'yes', false)`);
const ap = Object.fromEntries((await q("select id, turfs, login_methods from public.admin_people(null)")).map((x) => [x.id, x]));
eq((ap[PE].turfs ?? []).map((t) => t.turf), ["Ten"], "admin: the claim on the phone account");
eq((ap[E].turfs ?? []).map((t) => t.turf), [], "admin: not on the empty row");
await q(`select set_config('test.owner', '', false)`);
// The empty row is untouched.
eq(await row(E), eRow, "the empty row is exactly as it was");
eq(await count("public.user_logins", `user_id = '${E}'`), eLogins, "and gets no new logins");
eq(await count("public.users", `id = '${E}'`), 1, "and is never removed");

// A row with any kind of activity is still in the way, and refused.
const used = {
  "a game hosted": (id) => `insert into public.games (creator_id) values ('${id}')`,
  "a join request": (id) => `insert into public.game_requests (user_id) values ('${id}')`,
  "a game joined": (id) => `insert into public.game_participants (user_id) values ('${id}')`,
  "a review": (id) => `insert into public.reviews (user_id, rating) values ('${id}', 4)`,
  "a review vote": (id) => `insert into public.review_votes (user_id) values ('${id}')`,
  "a username": (id) => `insert into public.usernames (user_id, username) values ('${id}', 'u${id.slice(-4)}')`,
  "a username given up": (id) => `insert into public.username_history (user_id, username) values ('${id}', 'h${id.slice(-4)}')`,
  "a turf claim": (id) => `insert into public.turf_owners (turf_id, user_key, user_id, status, via) values ('${T10}', 'e:x${id.slice(-4)}@gmail.com', '${id}', 'rejected', 'admin')`,
  "a claim under its Google key from before claims named the account": (id) =>
    `insert into public.turf_owners (turf_id, user_key, status, via) select '${T10}', 'e:' || lower(a.email), 'pending', 'admin' from auth.users a where a.id = '${id}'`,
  "a claim under its number from before claims named the account": (id) =>
    `update public.users set phone = '+9190000002${id.slice(-2)}' where id = '${id}';
     insert into public.turf_owners (turf_id, user_key, status, via) values ('${T10}', 'p:90000002${id.slice(-2)}', 'pending', 'admin')`,
  "a turf it owns": (id) => `insert into public.turfs (name, slug, city, owner_id) values ('Owned', 'owned-${id.slice(-4)}', 'pune', '${id}')`,
  "a turf suggestion": (id) => `insert into public.turf_suggestions (turf_id, user_id) values ('${T10}', '${id}')`,
  "a booking": (id) => `insert into public.bookings (user_id) values ('${id}')`,
};
let n = 60;
for (const [what, sql] of Object.entries(used)) {
  const id = U(n), mail = `used${n}@gmail.com`, phone = `+9190000001${n}`, secret = `k${n}`;
  n++;
  await google(id, mail);
  eq((await resolve({ kind: "google", uid: id, email: mail, create: true })).id, id, `${what}: own row`);
  eq(await empty(id), true, `${what}: empty before`);
  await db.exec(sql(id));
  eq(await empty(id), false, `${what}: not empty`);
  await resolve({ kind: "phone", phone, name: "Tester", create: true });
  eq((await start(phone, secret)).r, "ok");
  r = await attach(secret, id);
  eq([r.r, r.other_empty], ["has_account", false], `${what}: refused`);
  eq((await complete(secret, phone)).r, "expired", `${what}: nothing to confirm`);
  eq(await count("private.account_google_links", `auth_uid = '${id}'`), 0, `${what}: no link`);
  eq((await resolve({ kind: "google", uid: id, email: mail })).id, id, `${what}: Google still opens its own row`);
}
// Live matches name people only by username tag, so the username lines cover them; the
// path account_is_empty reads tags with is checked here.
const LIVE_PATH = "$.** ? (@.tag.u == $n || @.tags.*.u == $n)";
ok(core.includes(`'${LIVE_PATH}'`), "account_is_empty reads live match tags with this path");
const tagged = async (match, name) =>
  (await one(`select jsonb_path_exists($1::jsonb, $2::jsonpath, jsonb_build_object('n', $3::text)) t`, [JSON.stringify(match), LIVE_PATH, name])).t;
eq(await tagged({ events: [{ type: "goal", by: { tag: { u: "asha_p" } } }] }, "asha_p"), true, "a player tag");
eq(await tagged({ board: { tags: { a: { u: "ravi" }, b: { u: "neha" } } } }, "neha"), true, "a board side tag");
eq(await tagged({ events: [{ type: "rename", tag: null, name: "neha" }] }, "neha"), false, "a typed name is not a tag");
// Used after it came back but before the confirm: refused at the confirm, under the lock.
const F = U(90);
await google(F, "late.use@gmail.com");
await resolve({ kind: "google", uid: F, email: "late.use@gmail.com", create: true });
const PHF = "+919000000023";
await resolve({ kind: "phone", phone: PHF, name: "Farah", create: true });
eq((await start(PHF, "h1")).r, "ok");
eq((await attach("h1", F)).r, "ok", "empty when it came back");
await q(`insert into public.game_participants (user_id) values ('${F}')`);
r = await complete("h1", PHF);
eq([r.r, r.other_empty], ["has_account", false], "used before the confirm: refused at the confirm");
eq((await status("h1", `fb-${PHF}`)).outcome, "has_account", "and the intent closed so");
eq(await count("private.account_google_links", `auth_uid = '${F}'`), 0, "no link");
eq(await count("private.account_reports", `kind = 'link_has_account' and detail ->> 'other_user_id' = '${F}'`), 1, "reported with the other account");
eq((await resolve({ kind: "google", uid: F, email: "late.use@gmail.com" })).id, F, "F still opens its own row");
// Taken off again: the Google account opens its own row, as it was.
r = await rpc("account_unlink_google", [KEY, PHE, `fb-${PHE}`, AGO(20), H("ge-u")]);
eq([r.r, r.google_email], ["ok", null], "Google taken off the phone account");
r = await resolve({ kind: "google", uid: E, email: "empty.g@gmail.com", create: true });
eq([r.r, r.id, r.created], ["ok", E, false], "then the Google account opens its own row again");
eq(await row(E), eRow, "still exactly as it was");
// And it can be added again, over the same untouched row.
eq((await start(PHE, "g2")).r, "ok");
eq((await attach("g2", E)).r, "ok");
eq((await complete("g2", PHE)).id, PE, "added again");
eq((await resolve({ kind: "google", uid: E, email: "empty.g@gmail.com" })).id, PE, "and opens the phone account again");
eq(await row(E), eRow, "the row still untouched");

// ── 4. Swap, removal, and the swapped-out Google account. ──
await q(`update private.account_link_intents set created_at = now() - interval '2 days' where user_id = '${P}'`);
await google(U(3), "asha2@gmail.com");
eq((await start(PH, "d1")).r, "ok");
eq((await attach("d1", U(3))).r, "ok");
r = await complete("d1", PH);
eq([r.r, r.email, r.google_email], ["ok", "asha2@gmail.com", "asha2@gmail.com"], "changed");
eq((await resolve({ kind: "google", uid: U(2), email: "asha.p@gmail.com", create: true })).r, "replaced", "the old Google account gets no new empty account");
eq(await count("public.users", `id = '${U(2)}'`), 0);
eq((await resolve({ kind: "google", uid: U(3), email: "asha2@gmail.com" })).id, P);
// The old one can be added again (only history: an ended link).
eq((await one(`select private.google_link_problem('${U(2)}', '${P}') p`)).p, null, "a swapped-out Google account can be added back");
// Remove Google with a fresh OTP; no limit.
r = await rpc("account_unlink_google", [KEY, PH, `fb-${PH}`, AGO(30), H("u1")]);
eq([r.r, r.email, r.google_email, r.google_linkable], ["ok", null, null, true], "Google removed, email gone");
eq((await resolve({ kind: "google", uid: U(3), email: "asha2@gmail.com", create: true })).r, "replaced");
eq((await rpc("account_unlink_google", [KEY, PH, `fb-${PH}`, AGO(30), H("u1")])).r, "ok", "again: nothing to remove");
// Make a new account only when asked.
r = await rpc("account_google_fresh", [KEY, U(3), "asha2@gmail.com", "Asha Two", null]);
eq([r.r, r.created, r.id], ["ok", true, U(3)], "an account of its own, asked for");
eq((await resolve({ kind: "google", uid: U(3), email: "asha2@gmail.com" })).id, U(3));
eq((await rpc("account_google_fresh", [KEY, U(1), null, null, null])).created, false, "fresh on an account that has one: that one");
// Email held by another row: the link is made, users.email stays empty.
await q(`insert into public.users (id, name, email) values ('${U(40)}', 'Junk', 'held@gmail.com')`);
const PH3 = "+919000000003";
const P3 = (await resolve({ kind: "phone", phone: PH3, name: "Neha", create: true })).id;
await google(U(4), "held@gmail.com");
eq((await start(PH3, "e1")).r, "ok");
eq((await attach("e1", U(4))).r, "ok");
r = await complete("e1", PH3);
eq([r.r, r.email, r.google_email], ["ok", null, "held@gmail.com"], "email held: link made, users.email empty");
eq((await resolve({ kind: "google", uid: U(4), email: "held@gmail.com" })).id, P3);

// ── 5. A row with id = a linked Google uid can't take the link's place. ──
await q(`insert into public.users (id, name, phone) values ('${U(4)}', 'Forged', '+919000000044')`);
eq((await resolve({ kind: "google", uid: U(4), email: "held@gmail.com", create: true })).id, P3, "the link comes first");
await q(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: U(4) })]);
eq((await one(`select private.caller_account('e:held@gmail.com') a`)).a, P3, "caller_account: the link first");
await q(`select set_config('request.jwt.claims', '', false)`);

// ── 6. A Google account adds, confirms, changes, removes its phone. ──
const PH5 = "+919000000005";
r = await rpc("account_set_phone", [KEY, U(1), PH5, H("p1")]);
eq([r.r, r.phone, r.phone_confirmed], ["ok", PH5, true], "phone added");
eq((await rpc("account_set_phone", [KEY, U(1), PH5, H("p1")])).r, "ok", "the same proof again (a lost reply): ok");
const G1 = U(1);
eq((await resolve({ kind: "phone", phone: PH5, log: true })).id, G1, "phone opens the Google account");
eq((await one(`select private.account_for_key('p:9000000005') a`)).a, G1);
r = await rpc("account_set_phone", [KEY, U(1), PH, H("p2")]);
eq([r.r, r.holder_opens, r.holder_empty], ["taken", true, true], "another account's number");
eq((await rpc("account_set_phone", [KEY, U(1), "+919000000006", H("u1")])).r, "used", "a proof used to remove Google counts once");
// Something else changes the number: no longer opens.
await q(`update public.users set phone = '+919000000006' where id = '${G1}'`);
eq((await resolve({ kind: "phone", phone: "+919000000006" })).r, "conflict", "nothing weaker");
await q(`update public.users set phone = '${PH5}' where id = '${G1}'`);
eq((await resolve({ kind: "phone", phone: PH5 })).r, "conflict", "even the same number back");
eq((await rpc("account_set_phone", [KEY, U(1), PH5, H("p3")])).r, "ok", "confirm it again with a code");
eq((await resolve({ kind: "phone", phone: PH5 })).id, G1, "confirmed again");
eq((await rpc("account_set_phone", [KEY, U(1), "+919000000007", H("p4")])).r, "ok");
r = await rpc("account_set_phone", [KEY, U(1), "+919000000008", H("p5")]);
eq(r.r, "limit", "3 in 30 days");
ok(new Date(r.until) > new Date(Date.now() + 29 * 86400000), "frees up 30 days after the third newest");
r = await resolve({ kind: "phone", phone: PH5, create: true });
eq([r.r, r.was_used], ["name", true], "the old number: told it used to open an account before a new one");
r = await rpc("account_remove_phone", [KEY, U(1)]);
eq([r.r, r.phone, r.phone_confirmed], ["ok", null, false], "number removed");
eq((await resolve({ kind: "phone", phone: "+919000000007" })).was_used, true, "the removed number");
// A typed number on a Google row, confirmed by its owner.
await google(U(6), "typed@gmail.com");
await resolve({ kind: "google", uid: U(6), email: "typed@gmail.com", create: true });
await q(`update public.users set phone = '+919000000010' where id = '${U(6)}'`);
eq((await resolve({ kind: "phone", phone: "+919000000010" })).r, "conflict");
eq((await one(`select private.profile_json('${U(6)}') p`)).p.phone_confirmed, false);
eq((await rpc("account_set_phone", [KEY, U(6), "+919000000010", H("q1")])).r, "ok");
eq((await resolve({ kind: "phone", phone: "+919000000010" })).id, U(6), "typed then confirmed");
// A linked phone account signed in with Google can't change its number.
eq((await rpc("account_set_phone", [KEY, U(4), "+919000000011", H("q2")])).r, "not_allowed", "the number is how a phone account logs in");
eq((await rpc("account_remove_phone", [KEY, U(4)])).r, "not_allowed");
eq((await rpc("account_set_phone", [KEY, U(99), "+919000000012", H("q3")])).r, "new");
eq((await start("+919000000010", "n4")).r, "not_allowed", "a Google-made account has its Google already");

// ── 7. Races: a create waits for the link lock (one session cannot show it; the lock is taken). ──
ok(/pg_advisory_xact_lock\(hashtext\('account_link_google'\)\);\s+v_id := coalesce\(private\.google_open_link/.test(core), "create re-reads under the link lock");

// ── 8. Typed emails: removable after Google. ──
const PH7 = "+919000000017";
const P7 = (await resolve({ kind: "phone", phone: PH7, name: "Typed", create: true, log: true })).id;
eq((await rpc("account_set_email", [KEY, P7, "save", "typed@example.com", "signup"])).r, "ok", "a typed email from before");
eq((await one(`select private.profile_json('${P7}') p`)).p.ask_google, false, "a typed email answers the ask");
await google(U(7), "typed.g@gmail.com");
eq((await start(PH7, "f1")).r, "ok");
eq((await attach("f1", U(7))).r, "ok");
eq((await complete("f1", PH7)).email, "typed.g@gmail.com");
r = await rpc("account_set_email", [KEY, P7, "remove", null, "profile"]);
eq([r.r, r.contact_email], ["ok", null], "typed email removed after the link");
eq((await rpc("account_set_email", [KEY, P7, "save", "again@example.com", "profile"])).r, "bad", "no new typed email on it");

// ── 9. myTapturf: one account, both sign-ins. ──
const T1 = "bbbbbbbb-0000-4000-8000-000000000001", T2 = "bbbbbbbb-0000-4000-8000-000000000002";
await q(`insert into public.turfs (id, name, slug, city, contact_info) values ('${T1}', 'One', 'one', 'pune', '{"phone":"+91 90000 00017"}'), ('${T2}', 'Two', 'two', 'pune', null)`);
const as = async (claims) => q(`select set_config('request.jwt.claims', $1, false)`, [claims ? JSON.stringify(claims) : ""]);
const g7 = { sub: U(7), email: "typed.g@gmail.com", app_metadata: { providers: ["google"] }, amr: [{ method: "oauth" }] };
await as(null);
let h = await rpc("owner_home", ["phone:9000000017"]);
eq(h.matches.map((t) => t.id), [T1], "phone sign-in: the turf listing the number");
await as(g7);
h = await rpc("owner_home", [null]);
eq([h.account_state, h.matches.map((t) => t.id)], ["ok", [T1]], "Google sign-in of the same account: the same match");
eq(await rpc("owner_claim", [null, T1, null, null, null]), { status: "active" }, "claimed from Google: in at once by the account's number");
await as(null);
h = await rpc("owner_home", ["phone:9000000017"]);
eq([h.turfs.map((t) => t.id), h.matches], [[T1], []], "and the phone sign-in sees it");
eq(await rpc("owner_claim", ["phone:9000000017", T1, null, null, null]), { status: "active" }, "no second claim");
eq(await count("public.turf_owners", `turf_id = '${T1}'`), 1, "one row");
eq((await one(`select public._can_manage('p:9000000017', '${T1}') c`)).c, true, "manages it from the phone sign-in");
eq(await rpc("owner_claim", ["phone:9000000017", T2, null, null, null]), { status: "pending" }, "a turf not listing it: waits");
await as(g7);
eq(await rpc("owner_claim", [null, T2, null, null, null]), { status: "pending" }, "the same pending claim from Google");
eq(await count("public.turf_owners", `turf_id = '${T2}'`), 1, "still one row");
await as(null);

// ── 10. Admin. ──
await q(`select set_config('test.owner', 'yes', false)`);
const v = Object.fromEntries((await q("select * from public.admin_verified(null)")).map((x) => [x.user_id, x]));
eq([v[P7].email_by_google, v[P7].email_confirmed, v[P7].phone_by_code], [true, true, true], "linked phone account");
eq([v[P3].email_by_google, v[P3].email_confirmed], [true, false], "email held elsewhere");
eq(v[U(6)].phone_by_code, true, "phone added by code");
const links = Object.fromEntries((await q("select * from public.admin_sign_in_links(null)")).map((x) => [x.user_id, x]));
eq([links[P].google_email, links[P].google_links, links[P].phone_opens], [null, 2, true], "Asha: two links, now none");
ok(links[P].google_removed_at !== null, "removed date");
const unf = Object.fromEntries((await q("select auth_uid, state from public.admin_google_unfinished(null)")).map((x) => [x.auth_uid, x.state]));
eq([unf[U(2)], unf[U(8)], unf[U(9)]], ["replaced", "link_failed", undefined], "unfinished states");
await google(U(10), "late@gmail.com");
eq((await one(`select state from public.admin_google_unfinished(null) where auth_uid = '${U(10)}'`)).state, "not_finished");
const ref = await q("select kind, user_id, other_user_id, other_empty, other_made_at from public.admin_link_refusals(null) order by at");
ok(ref.some((x) => x.kind === "link_has_account" && x.other_empty === true), "refusals listed with the empty flag");
ok(ref.some((x) => x.kind === "link_has_account" && x.other_user_id === U(60) && x.other_empty === false), "a used own row refused, listed");
ok(ref.some((x) => x.kind === "phone_held"), "phone held listed");
const over = ref.filter((x) => x.kind === "link_over_empty");
eq(over.map((x) => [x.user_id, x.other_user_id, x.other_empty]), [[PE, E, true], [PE, E, true]], "admin lists each link made over an empty own row");
ok(over[0].other_made_at instanceof Date, "with when that row was made");
// Logins: a link exchange is not a sign-in; a linked Google sign-in counts on the account, once.
await q(`update auth.users set last_sign_in_at = (select max(returned_at) from private.account_link_legs where auth_uid = '${U(7)}') where id = '${U(7)}'`);
let ppl = Object.fromEntries((await q("select id, logins, login_methods from public.admin_people(null)")).map((x) => [x.id, x]));
eq([ppl[P7].logins, ppl[P7].login_methods], [1, ["phone"]], "adding Google is not a login");
await q(`update auth.users set last_sign_in_at = now() + interval '1 hour' where id = '${U(7)}'`);
ppl = Object.fromEntries((await q("select id, logins, login_methods from public.admin_people(null)")).map((x) => [x.id, x]));
eq([ppl[P7].logins, ppl[P7].login_methods], [2, ["google", "phone"]], "a later Google sign-in counts on the phone account");
const rl = await q(`select user_id, name, method from public.get_recent_logins(200, null)`);
ok(rl.some((x) => x.user_id === P7 && x.method === "google" && x.name === "Typed"), "latest logins: under the account, with its name");
ok(!rl.some((x) => x.user_id === U(7)), "never a nameless row for the linked Google uid");
ok(!rl.some((x) => x.user_id === U(10)), "nor for a Google sign-in with no account");
await q(`select set_config('test.owner', '', false)`);
await assert.rejects(q("select * from public.admin_sign_in_links(null)"), /not allowed/);
await assert.rejects(q("select * from public.admin_link_refusals(null)"), /not allowed/);
passed += 2;

// ── 11. Grants. ──
for (const t of ["account_google_links", "account_link_intents", "account_link_legs", "otp_proofs", "phone_links"]) {
  eq((await one(`select has_table_privilege('anon', 'private.${t}', 'select') a`)).a, false, `${t} closed`);
}
for (const f of ["private.phone_account(text)", "private.google_account(uuid)", "private.phone_link_ok(uuid, text)", "private.account_phone10(uuid)",
  "private.google_make_account(uuid, text, text, text)", "private.account_is_empty(uuid)"]) {
  eq((await one(`select has_function_privilege('anon', '${f}', 'execute') a`)).a, false, `${f} closed`);
}
eq((await one(`select has_any_column_privilege('anon', 'public.users', 'INSERT') a`)).a, false, "users closed to API inserts");
// Re-running keeps the data.
const before = await count("private.account_google_links");
await db.exec(core);
await db.exec(reads);
eq(await count("private.account_google_links"), before, "running again keeps the links");
console.log(`account_links: ${passed} checks passed`);
