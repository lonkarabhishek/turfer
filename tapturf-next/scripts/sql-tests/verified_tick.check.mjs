// Applies the account migrations (as account_links.check.mjs does: stand-ins for
// Supabase, then the real files up to 20261026_account_links.sql and
// 20261026_account_links_reads.sql) to an in-memory Postgres (PGlite), then
// 20261027_verified_tick.sql twice, and checks the verified tick through the
// real sign-in and link flows: a typed email or a typed number never counts,
// a phone account that adds Google counts, a Google account that adds its
// number by OTP counts, and an ended link, a removed or changed number, or a
// changed email stops counting at once. Also: the three replaced bodies are
// the live ones plus only the tick's lines, signatures and grants are kept,
// and the public reads say one boolean and nothing else.
// Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/verified_tick.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: verified_tick.check.mjs <supabase/migrations>");
const FILE = `${M}/20261027_verified_tick.sql`;
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };

// ── The file itself ────────────────────────────────────────
const tick = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(tick, /\bdrop\b|\bdelete\b|\btruncate\b/i, "no destructive keywords");
assert.doesNotMatch(tick, /[—–]/, "no em or en dashes");
passed += 2;

/** The body of `create or replace function <name>(` in a file (between its $$). */
const body = (src, name) => {
  const at = src.indexOf(`create or replace function ${name}(`);
  assert.ok(at >= 0, `${name} is in the file`);
  const open = src.indexOf("$$", at);
  return src.slice(open + 2, src.indexOf("$$", open + 2));
};
const md5 = (s) => createHash("md5").update(s).digest("hex");
// md5(pg_proc.prosrc) on production, read 2026-10-26: the bodies this file replaces.
const LIVE = {
  "private.profile_json": ["20261026_account_links.sql", "bc73a0d819f546264cc6775b9a9d8532"],
  "public.profile_get": ["20261021_accounts_usernames.sql", "927cbc4ef84529e8be276cc548e0e69b"],
  "public.players_search": ["20261021_accounts_usernames.sql", "861c8474915aeb8fe28cd64d15e5cf2a"],
};
// Each new body is the live one with only these changes.
const CHANGES = {
  "private.profile_json": [
    [`'phone_settable', a.id is not null or lg.user_id is not null)`,
      `'phone_settable', a.id is not null or lg.user_id is not null,
           -- The verified tick (private.user_verified), and which half is proved.
           'verified', vt.pp and vt.ep,
           'phone_proven', vt.pp,
           'email_proven', vt.ep)`],
    [`    left join private.account_google_links gl on gl.user_id = u.id and gl.ended_at is null\n`,
      `    left join private.account_google_links gl on gl.user_id = u.id and gl.ended_at is null
    cross join lateral (select private.phone_proven(u.id) as pp, private.email_proven(u.id) as ep) vt\n`],
  ],
  "public.profile_get": [
    [`'since', u.created_at)`, `'since', u.created_at,
                                'verified', private.user_verified(u.id))`],
  ],
  "public.players_search": [
    [`jsonb_build_object('u', p.username, 'name', p.name, 'photo', p.photo) order by`,
      `jsonb_build_object('u', p.username, 'name', p.name, 'photo', p.photo,
                                        'v', private.user_verified(p.user_id)) order by`],
    [`else 2 end as rank\n`, `else 2 end as rank,
               n.user_id\n`],
  ],
};
for (const [name, [file, live]] of Object.entries(LIVE)) {
  const old = body(fs.readFileSync(`${M}/${file}`, "utf8"), name);
  eq(md5(old), live, `${name}: ${file} has the live body`);
  let want = old;
  for (const [from, to] of CHANGES[name]) {
    eq(want.split(from).length, 2, `${name}: changed once at ${JSON.stringify(from.slice(0, 40))}`);
    want = want.replace(from, to);
  }
  eq(body(tick, name), want, `${name}: the live body plus only the tick's lines`);
}

// ── Stand-ins and the account migrations (as account_links.check.mjs) ──
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
for (const f of ["20261019_mytapturf.sql", "20261019_mytapturf_claims.sql", "20261021_accounts_usernames.sql", "20261021_accounts_fixes.sql",
  "20261021_phone_identity_exact_india.sql", "20261022_people_fixes.sql", "20261025_contact_email.sql", "20261025_admin_verified.sql",
  "20261025_auth_mirror_google_only.sql", "20261025_claims_account.sql", "20261024_users_lockdown_step4.sql",
  "20261026_account_links.sql", "20261026_account_links_reads.sql"]) {
  await db.exec(fs.readFileSync(`${M}/${f}`, "utf8"));
}
await db.exec(`create trigger on_auth_user_created_sync_public_users after insert on auth.users for each row execute function public.handle_auth_user_created();`);

// What the replaced functions are before this file: kept after it.
const SIG_SQL = `select n.nspname || '.' || p.proname || '(' || pg_get_function_arguments(p.oid) || ') -> ' || pg_get_function_result(p.oid)
                        || ' ' || p.prosecdef::text || ' ' || p.provolatile::text || ' ' || coalesce(array_to_string(p.proconfig, ','), '')
                        || ' ' || has_function_privilege('anon', p.oid, 'execute')::text || ' ' || has_function_privilege('authenticated', p.oid, 'execute')::text
                        || ' ' || has_function_privilege('public', p.oid, 'execute')::text sig
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where (n.nspname, p.proname) in (('private','profile_json'),('public','profile_get'),('public','players_search'))
                  order by 1`;
const sigsBefore = (await q(SIG_SQL)).map((x) => x.sig);
eq(sigsBefore.length, 3, "the three functions exist before");

await db.exec(tick);
await db.exec(tick);
eq((await q(SIG_SQL)).map((x) => x.sig), sigsBefore, "the replaced functions keep their signature, result, settings and grants");
eq(sigsBefore, [
  `private.profile_json(p_user_id uuid) -> jsonb true s search_path="" false false false`,
  `public.players_search(p_key text, p_q text) -> jsonb true s search_path="" true true false`,
  `public.profile_get(p_username text) -> jsonb true s search_path="" true true false`,
], "as on production (pg_proc, read 2026-10-26)");

// The new functions: definer, stable, empty search_path; private ones closed, public ones open to anon.
const NEW = (await q(`select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || p.prosecdef::text || ' '
                             || p.provolatile::text || ' ' || coalesce(array_to_string(p.proconfig, ','), '') || ' '
                             || has_function_privilege('anon', p.oid, 'execute')::text || ' ' || has_function_privilege('authenticated', p.oid, 'execute')::text
                             || ' ' || has_function_privilege('public', p.oid, 'execute')::text sig
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where (n.nspname, p.proname) in (('private','phone_proven'),('private','email_proven'),('private','user_verified'),
                              ('public','users_verified'),('public','usernames_verified'),('public','admin_ticks'))
                       order by 1`)).map((x) => x.sig);
eq(NEW, [
  `private.email_proven(p_user_id uuid) true s search_path="" false false false`,
  `private.phone_proven(p_user_id uuid) true s search_path="" false false false`,
  `private.user_verified(p_user_id uuid) true s search_path="" false false false`,
  `public.admin_ticks(p_firebase_token text) true s search_path="" true true false`,
  `public.usernames_verified(p_usernames text[]) true s search_path="" true true false`,
  `public.users_verified(p_ids uuid[]) true s search_path="" true true false`,
], "new functions: definer, stable, empty search_path, private ones closed");
ok((await one(`select count(*)::int n from pg_indexes where schemaname = 'private' and indexname = 'users_phone_changes_user'`)).n === 1, "the index");

// Firebase and the site owner can't be reached here: stand-ins, as in account_links.check.mjs.
await db.exec(`
create or replace function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);

// ── Helpers ────────────────────────────────────────────────
const KEY = (await one("select value from private.app_secrets where name = 'account'")).value;
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const resolve = (o) => rpc("account_resolve", [KEY, o.kind, o.phone ?? null, o.uid ?? null, o.email ?? null, o.name ?? null, null, o.create ?? false, o.log ?? false]);
const H = (s) => createHash("sha256").update(s).digest("hex");
const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const NOW = () => new Date().toISOString();
const AGO = (s) => new Date(Date.now() - s * 1000).toISOString();
/** A Google sign-up in auth (no TapTurf row: the trigger makes none). */
const google = async (id, email, o = {}) => {
  await q(`insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values ($1, $2, now(), $3)`,
    [id, email, JSON.stringify(o.provider === "email" ? { provider: "email", providers: ["email"] } : { provider: "google", providers: ["google"] })]);
  await q(`insert into auth.identities (user_id, provider, identity_data) values ($1, $2, jsonb_build_object('email', $3::text, 'email_verified', $4::boolean))`,
    [id, o.provider ?? "google", email, o.verified ?? true]);
};
const start = (phone, secret) => rpc("account_link_start", [KEY, phone, `fb-${phone}`, NOW(), H(`proof-${secret}`), H(secret)]);
const attach = (secret, uid) => rpc("account_link_attach", [KEY, H(secret), uid]);
const complete = (secret, phone) => rpc("account_link_google", [KEY, H(secret), phone, `fb-${phone}`]);
const link = async (phone, secret, uid) => {
  eq((await start(phone, secret)).r, "ok", `link ${secret}: start`);
  eq((await attach(secret, uid)).r, "ok", `link ${secret}: attach`);
  const r = await complete(secret, phone);
  eq(r.r, "ok", `link ${secret}: made`);
  return r;
};
const unlink = (phone, proof) => rpc("account_unlink_google", [KEY, phone, `fb-${phone}`, AGO(20), H(proof)]);
const setPhone = (uid, phone, proof) => rpc("account_set_phone", [KEY, uid, phone, H(proof)]);
/** [phone proven, email proven, ticked] for an account. */
const t = async (id) => {
  const r = await one(`select private.phone_proven($1) p, private.email_proven($1) e, private.user_verified($1) v`, [id]);
  return [r.p, r.e, r.v];
};
const profile = async (id) => (await one(`select private.profile_json($1) p`, [id])).p;
/** profile_json's three keys, the same as the functions say. */
const keys = async (id) => {
  const p = await profile(id);
  const [pp, ep, v] = await t(id);
  eq([p.phone_proven, p.email_proven, p.verified], [pp, ep, v], `profile_json agrees for ${id.slice(-3)}`);
  return [p.phone_proven, p.email_proven, p.verified];
};

// ── 1. A phone account: the phone, never a typed email. ──
const PH1 = "+919100000001";
let r = await resolve({ kind: "phone", phone: PH1, name: "Asha", create: true, log: true });
const P1 = r.id;
eq([r.phone_proven, r.email_proven, r.verified], [true, false, false], "phone sign-up: phone proven by its logged OTP sign-in, no email");
eq(await keys(P1), [true, false, false], "phone account alone: no tick");
r = await rpc("account_set_email", [KEY, P1, "save", "asha@example.com", "signup"]);
eq([r.r, r.contact_email, r.verified], ["ok", "asha@example.com", false], "a typed email does not count");
// Even a typed email written onto users.email directly (as the old app did) does not count: Google never confirmed it here.
const PH2 = "+919100000002";
const P2 = (await resolve({ kind: "phone", phone: PH2, name: "Ravi", create: true, log: true })).id;
await q(`update public.users set email = 'ravi.typed@gmail.com' where id = $1`, [P2]);
eq(await keys(P2), [true, false, false], "users.email typed on a phone account: not proven");
// A row made before the lockdown with no proved sign-in: its number is not proven by the row alone.
const P3 = U(3), PH3 = "+919100000003";
await q(`insert into public.users (id, name, phone, password) values ($1, 'Old Phone', $2, 'phone-auth-no-password')`, [P3, PH3]);
eq(await t(P3), [false, false, false], "a phone-made row with no proof: not proven");
await q(`insert into public.user_logins (user_id, method, created_at) values ($1, 'phone', '2026-10-01')`, [P3]);
eq(await t(P3), [false, false, false], "a login logged before 21 Oct 18:50 (could be faked) is no proof");
eq((await rpc("account_phone_checked", [KEY, P3, PH3])).r, "ok", "the server checks its Firebase token on the next visit");
eq(await t(P3), [true, false, false], "now proven (phone_verified)");

// ── 2. A phone account adds Google (the link): the tick. ──
await google(U(10), "Asha.P@Gmail.com");
r = await link(PH1, "a1", U(10));
eq([r.email, r.google_email, r.phone_proven, r.email_proven, r.verified], ["asha.p@gmail.com", "asha.p@gmail.com", true, true, true],
  "Google-linked phone account: ticked, and the link's answer says so");
eq(await keys(P1), [true, true, true], "profile");
// The link itself proves the number (its fresh OTP), with no logged sign-in at all.
const PH4 = "+919100000004";
const P4 = (await resolve({ kind: "phone", phone: PH4, name: "Neha", create: true })).id;
eq(await t(P4), [false, false, false], "made without a logged sign-in: nothing proven yet");
await google(U(11), "neha@gmail.com");
r = await link(PH4, "b1", U(11));
eq(r.verified, true, "the link's own OTP proves the number");
// The link ends: the tick goes at once.
r = await unlink(PH4, "b-u1");
eq([r.r, r.email, r.google_email, r.verified, r.email_proven], ["ok", null, null, false, false], "link ended: no tick");
// The ended link no longer proves the number either (the app records the phone check of every
// link and visit in phone_verified, so a real account keeps that half).
eq(r.phone_proven, false, "the ended link's OTP counts for nothing now");
eq((await rpc("account_phone_checked", [KEY, P4, PH4])).r, "ok", "the phone sign-in's check, as the routes record it");
eq(await t(P4), [true, false, false], "the number counts by that check");
// Back with another Google account: the tick again, from the new link.
await google(U(12), "neha2@gmail.com");
r = await link(PH4, "b2", U(12));
eq([r.verified, r.email], [true, "neha2@gmail.com"], "a new link: ticked again");
// A swap keeps it (the new Google account is proved in the same flow), and the old one counts for nothing.
await q(`update private.account_link_intents set created_at = now() - interval '2 days' where user_id = $1`, [P1]);
await google(U(13), "asha.two@gmail.com");
r = await link(PH1, "a2", U(13));
eq([r.verified, r.email, r.google_email], [true, "asha.two@gmail.com", "asha.two@gmail.com"], "swapped: still ticked, on the new address");
eq((await one(`select private.google_account($1) a`, [U(10)])).a, null, "the swapped-out Google account opens nothing");
// The email changes behind the link's back (admin edit): no tick.
await q(`update public.users set email = 'other@example.com' where id = $1`, [P1]);
eq(await t(P1), [true, false, false], "changed email: not proven");
await q(`update public.users set email = 'asha.two@gmail.com' where id = $1`, [P1]);
eq(await t(P1), [true, true, true], "back to the Google address: proven again");

// ── 3. The address held by an empty own row the link was made over. ──
const E = U(20), PHE = "+919100000020";
await google(E, "emma@gmail.com");
eq((await resolve({ kind: "google", uid: E, email: "emma@gmail.com", name: "Emma", create: true })).id, E, "Emma's own Google row");
eq(await t(E), [false, true, false], "her own Google row: email proven, no phone");
const PE = (await resolve({ kind: "phone", phone: PHE, name: "Esha", create: true, log: true })).id;
r = await link(PHE, "e1", E);
eq([r.email, r.google_email, r.verified], [null, "emma@gmail.com", true], "linked over the empty row: users.email empty, ticked by the open link");
eq(await t(E), [false, false, false], "the set-aside own row: its address no longer counts (Google opens the phone account)");
eq(await t(PE), [true, true, true], "the phone account");
r = await unlink(PHE, "e-u1");
eq([r.verified, r.email_proven], [false, false], "the link ends: no tick");
eq(await t(E), [false, false, false], "and the set-aside row stays without one (google_account: none)");

// ── 4. A Google account and its number. ──
const G = U(30);
await google(G, "gita@gmail.com");
r = await resolve({ kind: "google", uid: G, email: "gita@gmail.com", name: "Gita", create: true, log: true });
eq([r.phone_proven, r.email_proven, r.verified], [false, true, false], "Google sign-up: email proven, no number");
// A number typed onto a Google row (the old profile form, before the change log): never counts.
const GT = U(31), PHGT = "+919100000031";
await google(GT, "typed.phone@gmail.com");
await q(`insert into public.users (id, name, email, phone, password) values ($1, 'Tara', 'typed.phone@gmail.com', $2, 'oauth-no-password')`, [GT, PHGT]);
eq(await keys(GT), [false, true, false], "Google row with a typed number: not proven");
eq((await profile(GT)).phone_confirmed, false, "and the number doesn't open it");
await q(`insert into private.phone_verified (user_id, phone_hash) values ($1, md5($2))`, [GT, PHGT]);
eq(await t(GT), [false, true, false], "a check row alone can't make a number that doesn't open the account count");
await q(`insert into public.user_logins (user_id, method, created_at) values ($1, 'google', now())`, [GT]);
eq(await t(GT), [false, true, false], "Google sign-ins prove nothing about the number");
// Adding the number by OTP (account_set_phone): the tick.
r = await setPhone(G, "+919100000030", "g1");
eq([r.r, r.phone, r.phone_proven, r.email_proven, r.verified], ["ok", "+919100000030", true, true, true], "OTP-added number: ticked");
eq(await keys(G), [true, true, true], "profile");
eq((await resolve({ kind: "phone", phone: "+919100000030", log: true })).id, G, "the number opens it");
// Confirming the typed one by OTP: the tick.
r = await setPhone(GT, PHGT, "gt1");
eq([r.r, r.verified], ["ok", true], "typed number confirmed with an OTP: ticked");
// Changed by OTP: still ticked (proved in the same flow).
r = await setPhone(G, "+919100000032", "g2");
eq([r.r, r.verified], ["ok", true], "changed by OTP: still ticked");
// Removed: no tick.
r = await rpc("account_remove_phone", [KEY, G]);
eq([r.r, r.phone, r.verified, r.phone_proven, r.email_proven], ["ok", null, false, false, true], "number removed: no tick");
// Changed by anything else (the API, an admin edit): no tick, even back to the same number.
r = await setPhone(G, "+919100000033", "g3");
eq(r.verified, true, "added again");
await q(`update public.users set phone = '+919100000034' where id = $1`, [G]);
eq(await t(G), [false, true, false], "number changed outside the OTP flow: not proven");
await q(`update public.users set phone = '+919100000033' where id = $1`, [G]);
eq(await t(G), [false, true, false], "even changed back to the proved number (phone_links points at an older change)");
// A logged phone sign-in after which the number changed proves nothing about the new one.
const P5 = U(5), PH5 = "+919100000005";
await q(`insert into public.users (id, name, phone, password) values ($1, 'Mona', $2, 'phone-auth-no-password')`, [P5, PH5]);
await q(`insert into public.user_logins (user_id, method, created_at) values ($1, 'phone', now() - interval '1 hour')`, [P5]);
eq(await t(P5), [true, false, false], "a trusted logged sign-in proves the number");
await q(`update public.users set phone = '+919100000006' where id = $1`, [P5]);
eq(await t(P5), [false, false, false], "changed after it: not proven");

// A Google row whose number signed in by OTP: before 21 Oct (the old app) and since (phone_verified).
const GO = U(35), PHGO = "+919100000035";
await google(GO, "omar@gmail.com");
await q(`insert into public.users (id, name, email, phone, password) values ($1, 'Omar', 'omar@gmail.com', $2, 'oauth-no-password')`, [GO, PHGO]);
await q(`insert into public.user_logins (user_id, method, created_at) values ($1, 'phone', '2026-10-05')`, [GO]);
eq(await t(GO), [false, true, false], "an old-app phone login opens it but proves nothing alone");
eq((await resolve({ kind: "phone", phone: PHGO, log: true })).id, GO, "the number signs in now");
eq(await t(GO), [true, true, true], "and that OTP sign-in proves it");

// ── 5. Old-app rows. ──
const L = U(40), GL = U(41), PHL = "+919100000040";
await q(`insert into public.users (id, name, email, phone, created_at) values ($1, 'Old Row', 'Old.Row@Gmail.com', $2, '2025-01-01')`, [L, PHL]);
await q(`insert into private.legacy_email_rows (user_id) values ($1)`, [L]);
await google(GL, "old.row@gmail.com");
eq((await resolve({ kind: "google", uid: GL, email: "old.row@gmail.com", create: true })).id, L, "Google lands on the old-app row");
eq(await keys(L), [false, true, false], "old-app row: its Google landing proves the email, its typed number nothing");
eq((await resolve({ kind: "phone", phone: PHL, log: true })).id, L, "its number signs in by OTP");
eq(await t(L), [true, true, true], "now ticked (a logged OTP sign-in since 21 Oct)");
const L2 = U(42), GL2 = U(43), PHL2 = "+919100000042";
await q(`insert into public.users (id, name, email, phone, created_at) values ($1, 'Old Two', 'old.two@gmail.com', $2, '2025-01-01')`, [L2, PHL2]);
await q(`insert into private.legacy_email_rows (user_id) values ($1)`, [L2]);
await google(GL2, "old.two@gmail.com");
eq(await t(L2), [false, true, false], "an old-app row with a Google account that lands on it");
await q(`insert into private.phone_verified (user_id, phone_hash) values ($1, md5($2))`, [L2, PHL2]);
eq(await t(L2), [true, true, true], "with phone_verified: ticked");
// A Google account with the old row's address that has a row of its own never lands there.
const L3 = U(44), GL3 = U(45);
await q(`insert into public.users (id, name, email, created_at) values ($1, 'Old Three', 'old.three@gmail.com', '2025-01-01')`, [L3]);
await q(`insert into private.legacy_email_rows (user_id) values ($1)`, [L3]);
await google(GL3, "old.three@gmail.com");
await q(`insert into public.users (id, name, password) values ($1, 'Own', 'oauth-no-password')`, [GL3]);
eq(await t(L3), [false, false, false], "a Google account that opens its own row proves nothing for the old row");

// ── 6. What never counts. ──
// Email and password sign-ins (the old app's confirm link), even confirmed, with a number proved by OTP.
const EP = U(50);
await google(EP, "pass@example.com", { provider: "email" });
await q(`insert into public.users (id, name, email, password) values ($1, 'Pass', 'pass@example.com', 'x')`, [EP]);
eq((await setPhone(EP, "+919100000050", "ep1")).phone_proven, true, "its number proved");
eq(await t(EP), [true, false, false], "email and password, confirmed: not proven (Google only)");
// The same account with Google added to it (its own auth user): proven.
await q(`insert into auth.identities (user_id, provider, identity_data) values ($1, 'google', '{"email":"Pass@Example.com","email_verified":true}')`, [EP]);
eq(await t(EP), [true, true, true], "with a Google identity of its own for the address: ticked");
// Google says the address isn't verified.
const GU = U(51);
await google(GU, "unverified@gmail.com", { verified: false });
await resolve({ kind: "google", uid: GU, email: "unverified@gmail.com", create: true });
eq(await t(GU), [false, false, false], "Google didn't verify it: not proven");
// A Google row made without its address (another row held it).
const GH = U(52);
await q(`insert into public.users (id, name, email) values ($1, 'Holder', 'held@gmail.com')`, [U(53)]);
await google(GH, "held@gmail.com");
r = await resolve({ kind: "google", uid: GH, email: "held@gmail.com", create: true });
eq([r.id, r.email, r.email_proven], [GH, null, false], "made without its address: no email, not proven");
// users.is_verified alone.
const IV = U(54);
await q(`insert into public.users (id, name, email, phone, is_verified) values ($1, 'Flag', 'flag@gmail.com', '+919100000054', true)`, [IV]);
eq(await t(IV), [false, false, false], "is_verified = true alone: no tick");
// A typed email in user_contact_emails with a proved number.
eq(await t(P2), [true, false, false], "still: a typed email never counts");
eq(await t(U(99)), [false, false, false], "no such account: false, not null");

// ── 7. The public reads: one boolean, nothing else. ──
const ticked = [P1, P4, PE, GT, GO, L, L2, EP].filter(Boolean);
const tickedNow = [];
for (const id of ticked) if ((await t(id))[2]) tickedNow.push(id);
eq(tickedNow.sort(), [P1, P4, GT, GO, L, L2, EP].sort(), "who is ticked now");
const asked = [P1, P2, P1, null, G, GT, U(99), L, E];
eq(await rpc("users_verified", [asked]), [P1, GT, L].sort(), "users_verified: only the ticked ids, once each, sorted, nulls dropped");
eq(await rpc("users_verified", [[]]), [], "none asked");
eq(await rpc("users_verified", [null]), [], "null");
const many = Array.from({ length: 100 }, (_, i) => U(1000 + i));
eq(await rpc("users_verified", [[...many, P1]]), [], "only the first 100 ids are read");
eq(await rpc("users_verified", [[...many.slice(1), P1]]), [P1], "the 100th is read");
// A many-dimensional array: still 100 ids in all (a slice would keep every row).
const grid = (rows) => `{${rows.map((r) => `{${r.join(",")}}`).join(",")}}`;
const many2 = Array.from({ length: 100 }, (_, i) => U(2000 + i));
eq((await one(`select public.users_verified($1::uuid[]) r`, [grid([many, [...many2.slice(1), P1]])])).r, [], "a 2-D array: only its first 100 ids are read");
eq((await one(`select public.users_verified($1::uuid[]) r`, [grid([[P1, G], [GT, E]])])).r, [P1, GT].sort(), "a small 2-D array is read in full");
// As the API's anon role.
await db.exec(`set role anon`);
eq((await one(`select public.users_verified($1) v`, [[P1, G]])).v, [P1], "anon can ask");
await assert.rejects(q(`select private.user_verified($1)`, [P1]), /permission denied/, "but not the private rules");
await assert.rejects(q(`select private.phone_proven($1)`, [P1]), /permission denied/);
await assert.rejects(q(`select private.email_proven($1)`, [P1]), /permission denied/);
passed += 3;
await db.exec(`reset role`);

// Usernames: the profile page and player search.
const name = async (id, u, taggable = true) => eq((await rpc("username_set", [KEY, id, u, taggable])).r, "ok", `username ${u}`);
await name(P1, "asha_p");
await name(G, "gita_g");
await name(GT, "tara_t", false);
r = await rpc("profile_get", ["asha_p"]);
eq(Object.keys(r).sort(), ["name", "photo", "since", "u", "verified"], "profile_get: the profile and one boolean, no ids, phone or email");
eq(r.verified, true, "ticked");
eq((await rpc("profile_get", ["Gita_G"])).verified, false, "not ticked: false, never which half");
eq(await rpc("profile_get", ["tara_t"]), null, "tagging off: nothing, as before");
await name(P1, "asha_two");
eq(await rpc("profile_get", ["asha_p"]), { moved_to: "asha_two" }, "an old name: where it moved, no tick");
eq((await rpc("profile_get", ["asha_two"])).verified, true);
await db.exec(`set role anon`);
eq((await one(`select public.profile_get('asha_two') p`)).p.verified, true, "anon reads it");
await db.exec(`reset role`);
r = await rpc("players_search", [KEY, "a"]);
eq(r.players, [], "short query: nothing, as before");
await name(L, "asha_old");
r = await rpc("players_search", [KEY, "ash"]);
eq(r.players.map((p) => [p.u, p.v]), [["asha_old", true], ["asha_two", true]], "players_search: each player's tick, the order as before");
eq(Object.keys(r.players[0]).sort(), ["name", "photo", "u", "v"], "and no id");
r = await rpc("players_search", [KEY, "gita"]);
eq(r.players.map((p) => [p.u, p.v]), [["gita_g", false]], "not ticked: false");
eq((await rpc("players_search", [KEY, "tara"])).players, [], "tagging off: not found, as before");
eq((await rpc("players_search", ["nope", "ash"])).r, "unavailable", "the key still gates it");
// usernames_verified: current, taggable names only.
eq(await rpc("usernames_verified", [["Asha_Two", "asha_p", "gita_g", "tara_t", "asha_old", "x", "nobody_here", null, "aśha_two"]]),
  ["asha_old", "asha_two"], "usernames_verified: ticked current taggable names, lowercased; old, untaggable, unknown and non-ASCII ones left out");
eq(await rpc("usernames_verified", [null]), [], "null");
eq(await rpc("usernames_verified", [[...Array.from({ length: 64 }, (_, i) => `nobody${i}`), "asha_two"]]), [], "only the first 64 names are read");
eq((await one(`select public.usernames_verified($1::text[]) r`, [grid([Array.from({ length: 64 }, (_, i) => `nobody${i}`), [...Array.from({ length: 63 }, (_, i) => `noone${i}`), "asha_two"]])])).r, [],
  "a 2-D array: only its first 64 names are read");

// ── 8. Admin. ──
await assert.rejects(q(`select * from public.admin_ticks(null)`), /not allowed/, "admin_ticks: the site owner only");
passed++;
await q(`select set_config('test.owner', 'yes', false)`);
const ad = Object.fromEntries((await q(`select * from public.admin_ticks(null)`)).map((x) => [x.user_id, [x.phone_proven, x.email_proven, x.verified]]));
eq(Object.keys(ad).length, (await one(`select count(*)::int n from public.users`)).n, "a row for every account");
for (const id of [P1, P2, P3, P4, E, PE, G, GT, GO, L, L2, L3, EP, GU, GH, IV]) eq(ad[id], await t(id), `admin_ticks agrees for ${id.slice(-3)}`);
await q(`select set_config('test.owner', '', false)`);

// ── 9. Running again keeps everything. ──
const snap = await rpc("users_verified", [[P1, P4, PE, GT, GO, L, L2, EP, G]]);
await db.exec(tick);
eq(await rpc("users_verified", [[P1, P4, PE, GT, GO, L, L2, EP, G]]), snap, "running again changes nothing");
console.log(`verified_tick: ${passed} checks passed`);
