// Applies the myTapturf migrations (20261019_mytapturf.sql,
// 20261019_mytapturf_claims.sql, 20261021_phone_identity_exact_india.sql),
// then 20261025_claims_account.sql (twice), to an in-memory Postgres
// (PGlite) with stand-ins for Supabase's roles, auth schema and tables, and
// checks that claims belong to the signed-in account, that a code to the
// listed number opens a turf at once, and what admin sees. Never touches a
// real database.
// Google sign-ins are set through request.jwt.claims. Firebase can't be
// reached here, so private.firebase_phone10 and the phone half of
// _caller_key are stood in for after the Google checks ("proof:<10
// digits>" and "phone:<10 digits>" tokens).
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/claims_account.check.mjs supabase/migrations/20261019_mytapturf.sql supabase/migrations/20261019_mytapturf_claims.sql supabase/migrations/20261021_phone_identity_exact_india.sql supabase/migrations/20261025_claims_account.sql
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const FILES = process.argv.slice(2);
assert.equal(FILES.length, 4, "pass the four migration files");
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
let passed = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };
const ok = (c, what) => { assert.ok(c, what); passed++; };

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; create schema extensions;
create schema auth;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), last_sign_in_at timestamptz, raw_app_meta_data jsonb default '{}');
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create table private.legacy_email_rows (user_id uuid primary key, added_at timestamptz not null default now());
create table private.users_phone_changes (id bigint generated always as identity primary key, user_id uuid not null, at timestamptz not null default now());
create function private.phone_logins_trusted_before() returns timestamptz language sql immutable set search_path = '' as $$ select timestamptz '2026-10-21 18:50:00+00' $$;
create table public.users (id uuid primary key default gen_random_uuid(), email varchar unique, name varchar not null, phone varchar, created_at timestamptz default now());
create table public.usernames (user_id uuid primary key, username text unique not null);
create table public.user_logins (id bigint generated always as identity primary key, user_id uuid not null, method text not null, created_at timestamptz not null default now());
create table public.turfs (id uuid primary key, name text, slug text, city text, area text, address text, is_active boolean default true,
  contact_info jsonb, owner_phone text, whatsapp_phone text, cover_image text, images jsonb,
  morning_price int, afternoon_price int, evening_price int, weekend_morning_price int, weekend_afternoon_price int, weekend_evening_price int,
  has_floodlights boolean, is_covered boolean, parking_available boolean, washroom_available boolean, changing_room_available boolean,
  has_cafeteria boolean, has_drinking_water boolean, equipment_provided boolean, is_24x7 boolean, start_time time, end_time time,
  closed_days text, description text, surface_type text, number_of_grounds int, formats jsonb, opening_hours jsonb,
  price_owner_confirmed boolean, price_verified_at timestamptz, price_unit text, updated_at timestamptz default now());
create table public.turf_contact_clicks (id bigint generated always as identity primary key, turf_id uuid, kind text, created_at timestamptz default now());
create table public.ask_queries (id bigint generated always as identity primary key, filters jsonb, created_at timestamptz default now());
create table public.games (id uuid primary key default gen_random_uuid(), turf_id uuid, date date, status text, created_at timestamptz default now());
create table public.reviews (id uuid primary key default gen_random_uuid(), turf_id uuid, rating int, comment text, author_name text, source text, created_at timestamptz default now());
create table public.turf_suggestions (id uuid primary key default gen_random_uuid(), turf_id uuid not null, contact_phone text, whatsapp_phone text,
  status text not null default 'pending', created_at timestamptz not null default now(), moderated_at timestamptz);
`);

const sqls = FILES.map((f) => fs.readFileSync(f, "utf8"));
const NEW = sqls[3];
assert.doesNotMatch(NEW, /\bdrop\b|\bdelete\s+from\b|\btruncate\b/i, "nothing dropped or deleted");
assert.doesNotMatch(NEW, /[—–]/, "no em or en dashes");
for (const sql of sqls.slice(0, 3)) await db.exec(sql);

// Before: an old claim with a typed name and no account.
const T1 = "aaaaaaaa-0000-4000-8000-000000000001", T2 = "aaaaaaaa-0000-4000-8000-000000000002", T3 = "aaaaaaaa-0000-4000-8000-000000000003", OFF = "aaaaaaaa-0000-4000-8000-000000000009";
const G = "11111111-1111-4111-8111-111111111111"; // Google account
const G2 = "22222222-2222-4222-8222-222222222222"; // Google sign-in whose users row is missing
const P = "33333333-3333-4333-8333-333333333333"; // phone account
const E = "44444444-4444-4444-8444-444444444444"; // old-app email and password auth user
const OWNER = "55555555-5555-4555-8555-555555555555";
await q(`insert into auth.users (id, email, raw_app_meta_data) values
  ('${G}', 'sam@x.in', '{"provider":"google","providers":["google"]}'),
  ('${G2}', 'nobody@x.in', '{"provider":"google","providers":["google"]}'),
  ('${E}', 'old@x.in', '{"provider":"email","providers":["email"]}'),
  ('${OWNER}', 'lonkarabhishek00@gmail.com', '{"provider":"email","providers":["email","google"]}')`);
await q(`insert into public.users (id, name, email, phone) values
  ('${G}', 'Sam Account', 'sam@x.in', null),
  ('${E}', 'Old', 'old@x.in', null),
  ('${OWNER}', 'Owner', 'lonkarabhishek00@gmail.com', null),
  ('${P}', 'Priya Phone', null, '+919800000003')`);
await q(`insert into public.usernames values ('${G}', 'sam')`);
await q(`insert into public.turfs (id, name, slug, city, contact_info, owner_phone, whatsapp_phone) values
  ('${T1}', 'One', 'one', 'pune', '{"phone":"+91 98000 00001"}', null, null),
  ('${T2}', 'Two', 'two', 'pune', '{"phone":"020 2567 0000"}', '9800000002', '+919800000003'),
  ('${T3}', 'Three', 'three', 'nashik', null, null, null)`);
await q(`insert into public.turfs (id, name, slug, city, is_active) values ('${OFF}', 'Off', 'off', 'pune', false)`);
await q(`insert into public.turf_owners (turf_id, user_key, status, via, name, role) values ('${T3}', 'e:sam@x.in', 'active', 'admin', 'Typed Name', 'owner')`);
// A number that came from a suggestion approved before this migration (never logged then), and one approved but not used.
const T6 = "aaaaaaaa-0000-4000-8000-000000000006", T7 = "aaaaaaaa-0000-4000-8000-000000000007";
await q(`insert into public.turfs (id, name, slug, city, owner_phone, whatsapp_phone) values ('${T6}', 'Six', 'six', 'pune', '+91 98000 00091', '9800000094'), ('${T7}', 'Seven', 'seven', 'pune', '9800000095', null)`);
await q(`insert into public.turf_suggestions (turf_id, contact_phone, whatsapp_phone, status, moderated_at) values
  ('${T6}', '9800000091', null, 'approved', now() - interval '3 days'),
  ('${T7}', '9800000096', null, 'approved', now() - interval '3 days'),
  ('${T6}', null, '9800000094', 'pending', null)`);

await db.exec(NEW);
await db.exec(NEW); // safe to run again
const tp = async (turf) => (await one("select private.turf_trusted_phones($1) p", [turf])).p;
eq(await tp(T6), ["9800000094"], "a number an earlier approved suggestion put on the listing opens nothing at once; a pending one changes nothing");
eq(await tp(T7), ["9800000095"], "a suggestion whose number isn't on the listing changes nothing");
eq((await one(`select count(*)::int n from public.turf_edit_log where turf_id = '${T6}' and user_key like 'suggestion:%'`)).n, 1, "logged once, though the migration ran twice");
// A re-save of the same number in another format keeps it TapTurf's.
await q(`insert into public.turf_edit_log (turf_id, user_key, before, after) values ('${T7}', 'p:9800000097', '{"owner_phone":"+91 98000 00095"}', '{"owner_phone":"9800000095"}')`);
eq(await tp(T7), ["9800000095"], "the same number saved again is still trusted");
await q(`insert into public.turf_edit_log (turf_id, user_key, before, after) values ('${T7}', 'p:9800000097', '{"owner_phone":"9800000095"}', '{"owner_phone":"9800000098"}')`);
await q(`update public.turfs set owner_phone = '9800000098' where id = '${T7}'`);
eq(await tp(T7), [], "a new number an owner set is not");
await q(`insert into public.turf_edit_log (turf_id, user_key, before, after) values ('${T7}', 'p:9800000097', '{"owner_phone":"9800000098"}', '{"owner_phone":"+91 98000 00098"}')`);
eq(await tp(T7), [], "nor after they save it again");

const as = async (claims) => q(`select set_config('request.jwt.claims', $1, false)`, [claims ? JSON.stringify(claims) : ""]);
const OAUTH = [{ method: "oauth", timestamp: 1 }];
const google = (sub, email) => as({ sub, email, app_metadata: { provider: "google", providers: ["google"] }, amr: OAUTH });
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const claim = (turf, opts = {}) => rpc("owner_claim", [opts.token ?? null, turf, opts.name ?? null, opts.note ?? null, opts.role ?? "owner"]);
const row = (turf, key) => one("select status, via, user_id, name, verified_phone, note, role from public.turf_owners where turf_id = $1 and user_key = $2", [turf, key]);

// Columns, and the old claim got its account.
eq((await row(T3, "e:sam@x.in")).user_id, G, "the old claim is linked to the account");
eq((await row(T3, "e:sam@x.in")).name, "Typed Name", "its stored name is left as it was");

// _caller_key: Google sessions only.
await google(G, "sam@x.in");
eq((await one("select public._caller_key(null) k")).k, "e:sam@x.in", "a Google session is a caller");
await as({ sub: E, email: "old@x.in", app_metadata: { provider: "email", providers: ["email"] } });
eq((await one("select public._caller_key(null) k")).k, null, "an email and password session is not");
eq(await claim(T1), { error: "sign_in" }, "so it cannot claim");
await as({ sub: OWNER, email: "lonkarabhishek00@gmail.com", app_metadata: { provider: "email", providers: ["email", "google"] }, amr: [{ method: "password", timestamp: 1 }] });
eq((await one("select public._caller_key(null) k")).k, null, "a password session on an account that also has Google is not");
eq((await one("select public._is_site_owner(null) o")).o, false, "nor the site owner, for admin");
await as({ sub: OWNER, email: "lonkarabhishek00@gmail.com", app_metadata: { provider: "email", providers: ["email", "google"] }, amr: OAUTH });
eq((await one("select public._caller_key(null) k")).k, "e:lonkarabhishek00@gmail.com", "the site owner's linked Google account still is");
eq((await one("select public._is_site_owner(null) o")).o, true, "and admin still opens for their Google session");
await as({ sub: G, email: "sam@x.in", app_metadata: { provider: "google", providers: ["google"] } });
eq((await one("select public._caller_key(null) k")).k, null, "a session without amr is not trusted");
await as({ sub: OWNER, email: "lonkarabhishek00@gmail.com", app_metadata: { provider: "email", providers: ["email", "google"] }, amr: OAUTH });
eq(await claim(T1), { status: "active", admin: true }, "the site owner opens any turf");
eq((await one(`select count(*)::int n from public.turf_owners where user_key = 'e:lonkarabhishek00@gmail.com'`)).n, 0, "with no claim row");
await as(null);
eq(await claim(T1), { error: "sign_in" }, "signed out");

// A Google claim: the account, never the typed name.
await google(G, "sam@x.in");
const home = await rpc("owner_home", [null]);
eq(home.account, { name: "Sam Account", username: "sam" }, "owner_home says which account claims are made as");
eq(await claim(T1, { name: "Someone Else", note: "Call me" }), { status: "pending" }, "a Google claim waits for review");
let r = await row(T1, "e:sam@x.in");
eq([r.status, r.via, r.user_id, r.name, r.note, r.verified_phone], ["pending", "admin", G, "Sam Account", "Call me", null], "linked to the account, with its name, not the typed one");
eq(await claim(T1), { status: "pending" }, "claiming again keeps it");
eq(await claim(OFF), { error: "not_found" }, "an inactive turf");

// A Google sign-in with no account row.
await google(G2, "nobody@x.in");
eq(await claim(T1), { error: "no_account" }, "no account, no claim");
eq((await rpc("owner_home", [null])).account, null, "owner_home says so");

// The four-argument owner_claim is closed to the browser; the five-argument one is open.
eq((await one(`select has_function_privilege('anon', 'public.owner_claim(text,uuid,text,text)', 'execute') a`)).a, false, "old owner_claim closed");
eq((await one(`select has_function_privilege('anon', 'public.owner_claim(text,uuid,text,text,text)', 'execute') a`)).a, true, "owner_claim open");
for (const f of ["private.account_for_key(text)", "private.caller_account(text)", "private.firebase_phone10(text)"])
  eq((await one(`select has_function_privilege('anon', '${f}', 'execute') a`)).a, false, `${f} closed`);
eq((await one(`select has_table_privilege('anon', 'private.claim_phone_checks', 'select') a`)).a, false, "phone checks closed");

// account_for_key: the account_resolve rules.
const afk = async (k) => (await one("select private.account_for_key($1) u", [k])).u;
eq(await afk("p:9800000003"), P, "a phone account");
eq(await afk("p:9800000099"), null, "an unknown number");
eq(await afk("e:sam@x.in"), G, "a Google account");
eq(await afk("e:old@x.in"), null, "an email and password account is not a Google one");
eq(await afk("x:foo"), null, "nonsense");
eq(await afk(null), null, "null");
await q(`insert into private.users_phone_changes (user_id) values ('${P}')`);
eq(await afk("p:9800000003"), null, "a number changed through the API does not open the account");
await q(`truncate private.users_phone_changes`);

// A proof must be a fresh sign-in.
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tok = (claims) => `${b64u({ alg: "RS256" })}.${b64u(claims)}.sig`;
const nowS = Math.floor(Date.now() / 1000);
const fresh = async (t) => (await one("select private.fresh_token_claims($1) c", [t])).c;
const PROJ = { aud: "tapturf", iss: "https://securetoken.google.com/tapturf", firebase: { sign_in_provider: "phone" } };
eq((await fresh(tok({ ...PROJ, auth_time: nowS - 60, phone_number: "+919800000001" })))?.phone_number, "+919800000001", "a sign-in a minute ago");
eq(await fresh(tok({ ...PROJ, auth_time: nowS - 11 * 60, phone_number: "+919800000001" })), null, "an 11-minute-old sign-in is not a proof");
eq(await fresh(tok({ ...PROJ, phone_number: "+919800000001" })), null, "no auth_time");
eq(await fresh(tok({ ...PROJ, auth_time: "soon" })), null, "auth_time not a number");
eq(await fresh(tok({ ...PROJ, aud: "evil-project", auth_time: nowS })), null, "another Firebase project's token");
eq(await fresh(tok({ ...PROJ, iss: "https://securetoken.google.com/evil", auth_time: nowS })), null, "another issuer");
eq(await fresh(tok({ ...PROJ, firebase: { sign_in_provider: "password" }, auth_time: nowS })), null, "not a phone sign-in");
await as(null);
eq((await one("select public._caller_key($1) k", [tok({ aud: "evil", iss: "x", phone_number: "+919800000001" }) + "x".repeat(120)])).k, null, "another project's token never reaches Google");
eq(await fresh("not.a-token"), null, "garbage");
eq(await fresh(null), null, "null");
eq((await one("select private.firebase_phone10($1) p", [tok({ auth_time: nowS, phone_number: "+919800000001" }) + "x".repeat(100)])).p, null, "no Google here: nothing is trusted without the lookup");

// From here, stand-ins for Firebase.
await db.exec(`
create or replace function private.firebase_phone10(p_token text) returns text language sql as
  $$ select case when p_token ~ '^proof:[6-9][0-9]{9}$' then substr(p_token, 7) end $$;
create or replace function public._caller_key(p_token text) returns text language sql security definer set search_path = public as $$
  select case when lower(coalesce(auth.jwt() ->> 'email', '')) <> '' and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb
                   and coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method": "oauth"}]'::jsonb
              then 'e:' || lower(auth.jwt() ->> 'email')
              when p_token ~ '^phone:[6-9][0-9]{9}$' then 'p:' || substr(p_token, 7) end $$;
`);

// A phone sign-in whose own number is listed: in at once, as before, with the account and number recorded.
await as(null);
eq(await claim(T2, { token: "phone:9800000003" }), { status: "active" }, "listed number: in at once");
r = await row(T2, "p:9800000003");
eq([r.via, r.user_id, r.name, r.verified_phone], ["phone_match", P, "Priya Phone", "9800000003"], "phone match recorded");

// Is a number listed? Before any code is sent.
await google(G, "sam@x.in");
eq(await rpc("owner_phone_listed", [null, T1, "98000 00001"]), { listed: true, retry_in: 120 }, "the listed number, typed with a space");
eq(await rpc("owner_phone_listed", [null, T1, "+91 9800000002"]), { listed: false }, "another number");
eq(await rpc("owner_phone_listed", [null, T2, "02025670000"]), { error: "bad_phone" }, "a landline is not a mobile");
eq(await rpc("owner_phone_listed", [null, OFF, "9800000001"]), { error: "not_found" }, "inactive turf");
for (let i = 0; i < 18; i++) await rpc("owner_phone_listed", [null, T1, "9800000002"]);
eq(await rpc("owner_phone_listed", [null, T1, "9800000001"]), { error: "too_many" }, "20 checks an hour, then no more");
eq((await one(`select count(*)::int n from private.claim_phone_checks where user_key = 'e:sam@x.in' and listed is false and phone = '9800000002' and turf_id = '${T1}'`)).n, 19, "numbers not on the listing are kept for the admin");
await as(null);
eq(await rpc("owner_phone_listed", [null, T1, "9800000001"]), { error: "sign_in" }, "signed out");
eq(await rpc("owner_claim_info", [null, T1]), { error: "sign_in" }, "claim info needs a sign-in");
await google(G, "sam@x.in");
eq(await rpc("owner_claim_info", [null, T1]), { mobiles: 1, endings: ["01"] }, "one listed mobile, ending 01");
eq(await rpc("owner_claim_info", [null, T2]), { mobiles: 2, endings: ["02", "03"] }, "the owner and WhatsApp numbers; the landline does not count");
eq(await rpc("owner_claim_info", [null, T3]), { mobiles: 0, endings: [] }, "no mobile: only a check by hand");
eq(await rpc("owner_claim_info", [null, OFF]), { error: "not_found" }, "inactive turf");

// A code to the listed number: the pending Google claim on T1 opens at once.
const verify = (turf, proof, token = null) => rpc("owner_claim_verified", [token, proof, turf, null, "manager"]);
await google(G, "sam@x.in");
eq(await verify(T1, "proof:9800000002"), { error: "not_listed" }, "a code to some other number does not count");
eq(await verify(T1, "garbage"), { error: "bad_code" }, "a bad token");
eq((await row(T1, "e:sam@x.in")).status, "pending", "still pending");
eq(await verify(T1, "proof:9800000001"), { status: "active" }, "a code to the listed number opens it");
r = await row(T1, "e:sam@x.in");
eq([r.status, r.via, r.user_id, r.verified_phone, r.note, r.role], ["active", "phone_match", G, "9800000001", "Call me", "manager"], "active, by the code, the note kept");
eq(await verify(T1, "proof:9800000001"), { status: "active" }, "again: still active");

// A fresh claim by code, with no claim before; the whatsapp and owner numbers count too.
eq(await verify(T2, "proof:9800000002"), { status: "active" }, "owner_phone counts");
eq((await row(T2, "e:sam@x.in")).verified_phone, "9800000002");

// Revoked stays revoked, code or not, whichever way they come back.
await q(`update public.turf_owners set status = 'revoked' where turf_id = '${T2}' and user_key = 'e:sam@x.in'`);
eq(await verify(T2, "proof:9800000002"), { error: "revoked" }, "a revoked claim stays revoked");
eq(await claim(T2), { error: "revoked" }, "owner_claim agrees");
await as(null);
await q(`insert into public.users (id, name, phone) values ('66666666-6666-4666-8666-666666666666', 'Sam Phone', '+919800000002')`);
eq(await claim(T2, { token: "phone:9800000002" }), { status: "pending" }, "the number they proved goes to a check by hand (its real holder is not locked out)");
eq((await rpc("owner_home", ["phone:9800000002"])).matches.some((t) => t.id === T2), false, "and the turf is not offered at once");
await google(G, "sam@x.in");
await google(G2, "nobody@x.in");
eq(await verify(T1, "proof:9800000001"), { error: "no_account" }, "no account, no claim, even with the code");

// A WhatsApp number an owner set in myTapturf does not open the turf at once.
const T4 = "aaaaaaaa-0000-4000-8000-000000000004";
await q(`insert into public.turfs (id, name, slug, city, whatsapp_phone, contact_info) values ('${T4}', 'Four', 'four', 'pune', '+919800000007', '{"phone":"9800000008"}')`);
eq((await one(`select private.turf_trusted_phones('${T4}') p`)).p, ["9800000008", "9800000007"], "both listed numbers count");
await q(`insert into public.turf_edit_log (turf_id, user_key, before, after) values ('${T4}', 'e:someone@x.in', '{"whatsapp_phone":null}', '{"whatsapp_phone":"+919800000007"}')`);
eq((await one(`select private.turf_trusted_phones('${T4}') p`)).p, ["9800000008"], "not the one an owner set");
eq(await rpc("owner_claim_info", [null, T4]), { mobiles: 1, endings: ["08"] }, "the claim form only offers the other");
eq(await rpc("owner_phone_listed", [null, T4, "9800000007"]), { listed: false, blocked: true }, "an owner-set number is not a way in: a check by hand");
await q(`update public.turfs set whatsapp_phone = '+919800000009' where id = '${T4}'`);
eq((await one(`select private.turf_trusted_phones('${T4}') p`)).p, ["9800000008", "9800000009"], "a number changed since (by TapTurf) counts again");

// A number from an approved public suggestion opens nothing at once; one the site owner set does.
await q(`insert into public.turf_edit_log (turf_id, user_key, before, after) values ('${T4}', 'suggestion:abc', '{"owner_phone":null}', '{"owner_phone":"9800000031"}')`);
await q(`update public.turfs set owner_phone = '9800000031' where id = '${T4}'`);
ok(!(await one(`select private.turf_trusted_phones('${T4}') p`)).p.includes("9800000031"), "a suggested number is not trusted");
await q(`insert into public.turf_edit_log (turf_id, user_key, before, after) values ('${T4}', 'e:lonkarabhishek00@gmail.com', '{"owner_phone":"9800000031"}', '{"owner_phone":"9800000032"}')`);
await q(`update public.turfs set owner_phone = '9800000032' where id = '${T4}'`);
ok((await one(`select private.turf_trusted_phones('${T4}') p`)).p.includes("9800000032"), "one the site owner set is");

// One listed number gets a code at most every 2 minutes and 5 a day, whoever asks; one sign-in 10 a day.
await as(null);
const listed = (k, turf, ph) => rpc("owner_phone_listed", [`phone:${k}`, turf, ph]);
const age = (ph, by) => q(`update private.claim_phone_checks set at = at - interval '${by}' where phone = '${ph}'`);
eq(await listed("9800000011", T4, "9800000008"), { listed: true, retry_in: 120 }, "first code");
const w = await listed("9800000012", T4, "9800000008");
ok(w.error === "wait" && w.retry_in > 100 && w.retry_in <= 120, `another sign-in a moment later waits (${JSON.stringify(w)})`);
for (let i = 2; i <= 5; i++) {
  await age("9800000008", "3 minutes");
  eq(await listed(`980000001${i}`, T4, "9800000008"), { listed: true, retry_in: 120 }, `code ${i} of 5 today`);
}
await age("9800000008", "3 minutes");
eq(await listed("9800000016", T4, "9800000008"), { error: "number_busy" }, "a sixth in a day: the number is busy");
await age("9800000008", "1 day");
eq(await listed("9800000016", T4, "9800000008"), { listed: true, retry_in: 120 }, "next day");
// The owner-set WhatsApp number (T4 earlier): on the listing, but only a check by hand.
await q(`update public.turfs set whatsapp_phone = '+919800000007' where id = '${T4}'`);
eq(await listed("9800000017", T4, "9800000007"), { listed: false, blocked: true }, "an owner-set number: by hand");
// Already in, or turned away: said before any code.
eq(await listed("9800000003", T2, "9800000002"), { status: "active" }, "an active claimant is told they're in");
eq(await listed("9800000002", T2, "9800000002"), { listed: false, blocked: true }, "a number on a revoked claim: a check by hand, said before any code");
// A pending phone claim opens once its own number is listed.
await q(`insert into public.users (id, name, phone) values ('77777777-7777-4777-8777-777777777777', 'Late Owner', '+919800000021')`);
eq(await claim(T3, { token: "phone:9800000021" }), { status: "pending" }, "no number on the listing yet: pending");
await q(`update public.turfs set owner_phone = '9800000021' where id = '${T3}'`);
eq(await claim(T3, { token: "phone:9800000021" }), { status: "active" }, "the number is listed now: open");
eq((await row(T3, "p:9800000021")).verified_phone, "9800000021");
await google(G, "sam@x.in");

// Opened with a code to someone else's number: no new WhatsApp number for 14 days.
await google(G, "sam@x.in");
eq(await rpc("owner_update_turf", [null, T1, { whatsapp_phone: "9800000099" }]), { error: "held", field: "whatsapp_phone" }, "a code-opened claim can't change WhatsApp yet");
eq((await rpc("owner_update_turf", [null, T1, { morning_price: "900" }])).ok, true, "other edits go through");
await q(`update public.turf_owners set decided_at = now() - interval '15 days' where turf_id = '${T1}' and user_key = 'e:sam@x.in'`);
eq((await rpc("owner_update_turf", [null, T1, { whatsapp_phone: "9800000099" }])).ok, true, "after 14 days it can");
await as(null);
eq((await rpc("owner_update_turf", ["phone:9800000003", T2, { whatsapp_phone: "9800000098" }])).ok, true, "someone in with their own number can at once");
await google(G, "sam@x.in");

// Every claim, code and decision is kept.
const ev = await q(`select turf_id, user_key, from_status, to_status, how from private.turf_owner_events order by id`);
ok(ev.some((e) => e.turf_id === T1 && e.user_key === "e:sam@x.in" && e.from_status === null && e.to_status === "pending" && e.how === "claim"), "the first claim");
ok(ev.some((e) => e.turf_id === T1 && e.to_status === "active" && e.how === "code:9800000001"), "the code that opened it");
ok(ev.some((e) => e.user_key === "p:9800000003" && e.how === "phone_match"), "a phone match");

// A code the browser couldn't send frees the 2-minute wait, not the day's count.
await as(null); // a phone sign-in has no Supabase session
const T8 = "aaaaaaaa-0000-4000-8000-000000000008";
await q(`insert into public.turfs (id, name, slug, city, contact_info) values ('${T8}', 'Eight', 'eight', 'pune', '{"phone":"9800000093"}')`);
const ask8 = () => rpc("owner_phone_listed", ["phone:9800000099", T8, "9800000093"]);
eq(await ask8(), { listed: true, retry_in: 120 }, "a code may go");
eq((await ask8()).error, "wait", "a second at once waits");
eq(await rpc("owner_phone_code_failed", ["phone:9800000099", T8, "9800000093"]), { ok: true }, "the browser couldn't send it");
eq(await ask8(), { listed: true, retry_in: 120 }, "so the next try needn't wait");
eq(await rpc("owner_phone_code_failed", [null, T8, "9800000093"]), { error: "bad_request" }, "signed out: nothing");
for (let i = 0; i < 3; i++) { await rpc("owner_phone_code_failed", ["phone:9800000099", T8, "9800000093"]); await ask8(); }
await rpc("owner_phone_code_failed", ["phone:9800000099", T8, "9800000093"]);
eq((await ask8()).error, "number_busy", "failed sends still count toward 5 a day");
await google(G, "sam@x.in");

// Admin sees the account.
await db.exec(`create or replace function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;`);
eq(await rpc("admin_owner_claims", [null]), { error: "forbidden" }, "not the site owner");
await q(`select set_config('test.owner', 'yes', false)`);
const claims = await rpc("admin_owner_claims", [null]);
eq(Array.isArray(claims) && claims.length, 6, "every claim");
const c1 = claims.find((c) => c.turf_id === T1 && c.user_key === "e:sam@x.in");
eq([c1.user_id, c1.account.name, c1.account.username, c1.account.email, c1.account.method, c1.verified_phone, c1.slug, c1.site_owner], [G, "Sam Account", "sam", "sam@x.in", "google", "9800000001", "one", false], "the claim's account, method and the number proved");
eq(c1.phone_given, "9800000002", "and the number they typed that was not listed");
eq(c1.account.signin_finished, false, "no sign-in on record for this test account");
await q(`insert into public.user_logins (user_id, method) values ('${G}', 'google')`);
eq((await rpc("admin_owner_claims", [null])).find((c) => c.turf_id === T1 && c.user_key === "e:sam@x.in").account.signin_finished, true, "a logged sign-in counts");
const cp = claims.find((c) => c.user_key === "p:9800000003");
eq([cp.account.name, cp.account.method, cp.account.phone], ["Priya Phone", "phone", "+919800000003"], "a phone claim's account");
eq(cp.account.signin_finished, null, "a phone account is never 'Google sign-in didn't finish'");
eq(claims.find((c) => c.turf_id === T3 && c.user_key === "e:sam@x.in").account.other_claims, 1, "other turfs the account claims (Two was revoked)");
eq([c1.account.email_checked, cp.account.email_checked], [true, false], "only a Google email counts as checked");
eq(c1.their_listed_phone, "9800000001", "the listed number that still lets them in");
eq(c1.rejected_at, null, "never turned down");
// A rejection is kept when they claim again.
const r1 = await rpc("admin_decide_owner_claim", [null, T1, "e:sam@x.in", "rejected"]);
eq(r1, { ok: true }, "rejected");
eq(await claim(T1), { status: "pending" }, "they claim again");
const again = (await rpc("admin_owner_claims", [null])).find((c) => c.turf_id === T1 && c.user_key === "e:sam@x.in");
ok(again.status === "pending" && again.rejected_at !== null, "and admin still sees the rejection");
eq(await rpc("admin_decide_owner_claim", [null, T1, "e:nobody", "active"]), { ok: false }, "no such claim");

// A Google sign-in that landed on an old-app row: admin sees it was Google.
const L = "c6666666-6666-4666-8666-666666666666", GL = "c7777777-7777-4777-8777-777777777777";
await q(`insert into public.users (id, name, email) values ('${L}', 'Legacy', 'leg@x.in')`);
await q(`insert into private.legacy_email_rows (user_id) values ('${L}')`);
await q(`insert into auth.users (id, email, raw_app_meta_data, last_sign_in_at) values ('${GL}', 'leg@x.in', '{"provider":"google","providers":["google"]}', now())`);
await q(`insert into public.turf_owners (turf_id, user_key, user_id, status, via, name) values ('${T2}', 'e:leg@x.in', '${L}', 'pending', 'admin', 'Legacy')`);
const cl = (await rpc("admin_owner_claims", [null])).find((c) => c.user_key === "e:leg@x.in");
eq([cl.account.name, cl.account.method, cl.account.email_checked, cl.account.signin_finished], ["Legacy", "google", true, true], "the Google sign-in behind it, not 'old-app email, not checked'");

console.log(`claims_account: ${passed} checks passed`);
