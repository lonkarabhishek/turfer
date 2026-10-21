// Applies 20261021_accounts_usernames.sql to an in-memory Postgres (PGlite)
// with stand-ins for Supabase's roles, auth schema, users, user_logins and
// live_matches, then drives every function. Never touches a real database.
// Run: node scripts/sql-tests/accounts_usernames.check.mjs supabase/migrations/20261021_accounts_usernames.sql
// (needs @electric-sql/pglite installed somewhere; set PGLITE to its dist/index.js path)
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const MIG = process.argv[2];
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('live_write', 'L'||repeat('1', 63));
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb $$;
create table public.users (
  id uuid not null default gen_random_uuid() primary key,
  email varchar unique, password varchar, name varchar not null, phone varchar,
  role varchar default 'user' check (role in ('user','owner','admin')),
  is_verified boolean default false, created_at timestamptz default now(), updated_at timestamptz default now(),
  profile_image_url text, firebase_uid text unique, pin varchar, pin_attempts int default 0,
  pin_locked_until timestamptz, signup_context jsonb);
create unique index users_phone_key on public.users (phone) where phone is not null;
create table public.user_logins (id bigint generated always as identity primary key, user_id uuid not null,
  method text not null check (method in ('phone','google')), created_at timestamptz not null default now());
create table public.live_matches (code text primary key, match jsonb, rev bigint, status text, updated_at timestamptz default now());
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);

const sql = fs.readFileSync(MIG, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b/i, "no destructive keywords");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
await db.exec(sql);
await db.exec(sql); // safe to run again
const KEY = (await one("select value from private.app_secrets where name = 'account'")).value;
const LKEY = "L" + "1".repeat(63);
ok(/^[0-9a-f]{64}$/.test(KEY), "account key seeded");
eq((await q("select count(*)::int n from private.app_secrets where name = 'account'"))[0].n, 1, "seeded once");

// Grants: nothing new is open to anon except the key-gated or public functions.
const tableAcl = await q(`select c.relname, has_table_privilege('anon', c.oid, 'select') s, has_table_privilege('anon', c.oid, 'insert') i,
  has_table_privilege('anon', c.oid, 'update') u, has_table_privilege('anon', c.oid, 'truncate') t
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relname in ('usernames','username_history','account_reports','users_phone_changes')`);
for (const r of tableAcl) eq([r.s, r.i, r.u, r.t], [false, false, false, false], `anon has nothing on ${r.relname}`);
for (const f of ["private.account_key_ok(text)", "private.live_key_ok(text)", "private.username_problem(text)", "private.clean_name(text)", "private.profile_json(uuid)", "private.log_phone_change()"]) {
  eq((await one(`select has_function_privilege('anon', '${f}', 'execute') x`)).x, false, `anon cannot run ${f}`);
}

const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const resolve = (o) => rpc("account_resolve", ["key" in o ? o.key : KEY, o.kind, o.phone ?? null, o.uid ?? null, o.email ?? null, o.name ?? null, o.avatar ?? null, o.create ?? false, o.log ?? false]);

// Wrong key: unavailable everywhere, nothing else checked first.
for (const k of [null, "", "x".repeat(64), LKEY]) {
  eq(await resolve({ key: k, kind: "phone", phone: "+919876543210" }), { r: "unavailable" }, `resolve with key ${String(k).slice(0, 4)}`);
  eq(await rpc("username_set", [k, null, "rahul", null]), { r: "unavailable" }, "username_set key");
  eq(await rpc("players_search", [k, "ra"]), { r: "unavailable" }, "search key");
  eq(await rpc("account_update", [k, null, "x"]), { r: "unavailable" }, "update key");
}
eq(await rpc("live_tags_check", [KEY, ["rahul"]]), { r: "unavailable" }, "live tags need the live key, not the account key");
eq(await rpc("live_match_get_k", [KEY, "abcdefghijkl"]), { r: "unavailable" }, "keyed live read needs the live key");

// Phone: only +91 and 10 digits, matched in full.
await q(`insert into public.users (id, name, phone, created_at) values ('11111111-1111-4111-8111-111111111111', 'Asha', '+919876543210', now() - interval '30 days')`);
for (const bad of ["+19876543210", "9876543210", "+91987654321", "+9198765432100", "+86919876543210", "919876543210"]) {
  eq(await resolve({ kind: "phone", phone: bad }), { r: "bad" }, `phone ${bad} refused`);
}
let r = await resolve({ kind: "phone", phone: "+919876543210", log: true });
eq([r.r, r.id, r.name, r.phone, r.username, r.taggable, r.created], ["ok", "11111111-1111-4111-8111-111111111111", "Asha", "+919876543210", null, true, false], "existing phone row");
eq((await one("select count(*)::int n from public.user_logins")).n, 1, "login logged");
await resolve({ kind: "phone", phone: "+919876543210", log: true });
eq((await one("select count(*)::int n from public.user_logins")).n, 1, "not twice in 10 min");
await resolve({ kind: "phone", phone: "+919876543210" });
eq((await one("select count(*)::int n from public.user_logins")).n, 1, "no log without p_log");
eq(await resolve({ kind: "phone", phone: "+919000000001" }), { r: "new" }, "unknown number, no create");
eq(await resolve({ kind: "phone", phone: "+919000000001", create: true, name: "  " }), { r: "name" }, "create needs a name");
r = await resolve({ kind: "phone", phone: "+919000000001", create: true, name: " Ravi \n Kumar ", log: true });
eq([r.r, r.name, r.phone, r.created], ["ok", "Ravi Kumar", "+919000000001", true], "phone sign-up");
const ravi = r.id;
const again = await resolve({ kind: "phone", phone: "+919000000001", create: true, name: "Ravi K" });
eq([again.r, again.id], ["ok", ravi], "a second sign-up lands on the same row");
eq((await one("select count(*)::int n from public.users where phone = '+919000000001'")).n, 1, "one row per phone");
eq((await one("select password from public.users where id = $1", [ravi])).password, "phone-auth-no-password", "placeholder password");

// A phone typed onto a Google row: conflict and a report, unless that phone signed in before.
await q(`insert into auth.users values ('22222222-2222-4222-8222-222222222222', 'g@x.in')`);
await q(`insert into public.users (id, name, email, phone) values ('22222222-2222-4222-8222-222222222222', 'Gita', 'g@x.in', '+919111111111')`);
eq(await resolve({ kind: "phone", phone: "+919111111111", log: true }), { r: "conflict" }, "typed phone on a Google row");
eq((await one("select kind, detail->>'phone_tail' t from private.account_reports order by id desc limit 1")), { kind: "phone_on_google_row", t: "11" }, "reported with the last 2 digits only");
await q(`insert into public.user_logins (user_id, method, created_at) values ('22222222-2222-4222-8222-222222222222', 'phone', now() - interval '1 day')`);
eq((await resolve({ kind: "phone", phone: "+919111111111" })).r, "ok", "a Google row this phone signed in to before still opens");

// Google: by id; legacy email row reported, not merged; insert when new.
r = await resolve({ kind: "google", uid: "22222222-2222-4222-8222-222222222222", email: "g@x.in" });
eq([r.r, r.id, r.email], ["ok", "22222222-2222-4222-8222-222222222222", "g@x.in"], "Google by id");
await q(`insert into public.users (id, name, email, created_at) values ('33333333-3333-4333-8333-333333333333', 'Old', 'old@x.in', timestamptz '2026-09-30 05:00:00+00')`);
r = await resolve({ kind: "google", uid: "44444444-4444-4444-8444-444444444444", email: "OLD@x.in", create: true });
eq([r.r, r.id], ["ok", "33333333-3333-4333-8333-333333333333"], "legacy email row opens for its Google sign-in");
eq((await one("select kind from private.account_reports order by id desc limit 1")).kind, "google_on_legacy_email_row", "reported");
eq((await one("select count(*)::int n from public.users")).n, 4, "no row made, none merged");
eq(await resolve({ kind: "google", uid: "55555555-5555-4555-8555-555555555555", email: "new@x.in" }), { r: "new" }, "new Google user, no create");
r = await resolve({ kind: "google", uid: "55555555-5555-4555-8555-555555555555", email: "new@x.in", name: "Neha", avatar: "https://a/b.png", create: true });
eq([r.r, r.id, r.name, r.email, r.profile_image_url, r.created], ["ok", "55555555-5555-4555-8555-555555555555", "Neha", "new@x.in", "https://a/b.png", true], "Google first login fallback");
// Email already on a recent non-auth row (made after the cutoff): no takeover, conflict reported.
await q(`insert into public.users (id, name, email) values ('66666666-6666-4666-8666-666666666666', 'Squat', 'victim@x.in')`);
eq(await resolve({ kind: "google", uid: "77777777-7777-4777-8777-777777777777", email: "victim@x.in", create: true }), { r: "conflict" }, "a recent row with that email is not opened");
eq((await one("select kind from private.account_reports order by id desc limit 1")).kind, "google_insert_conflict", "reported");
eq(await resolve({ kind: "other", uid: "55555555-5555-4555-8555-555555555555" }), { r: "bad" }, "unknown kind");

// Name updates.
eq((await rpc("account_update", [KEY, ravi, "  Ravi   K  "])).name, "Ravi K", "name cleaned");
eq(await rpc("account_update", [KEY, ravi, ""]), { r: "bad" }, "empty name refused");
eq(await rpc("account_update", [KEY, "99999999-9999-4999-8999-999999999999", "X"]), { r: "bad" }, "unknown user");

// Phone change audit.
await q("update public.users set phone = '+919222222222' where id = $1", [ravi]);
const ch = await one("select user_id, old_hash, new_hash from private.users_phone_changes order by id desc limit 1");
eq([ch.user_id, ch.old_hash.length, ch.new_hash.length], [ravi, 32, 32], "phone change recorded as hashes");
await q("update public.users set name = 'Ravi' where id = $1", [ravi]);
eq((await one("select count(*)::int n from private.users_phone_changes")).n, 1, "name change not recorded");
await q("update public.users set phone = '+919000000001' where id = $1", [ravi]);

// Usernames.
const ASHA = "11111111-1111-4111-8111-111111111111";
for (const [name, want] of [["ra", "bad"], ["1abc", "bad"], ["ab-cd", "bad"], ["abcdefghijklmnopqrstu", "bad"], ["King", "bad"], ["TapTurf_Official", "reserved"], ["the_admin", "reserved"], ["support_1", "reserved"], ["login", "reserved"], ["u_1", "reserved"]]) {
  eq((await rpc("username_check", [KEY, ASHA, name])).r, want, `check ${JSON.stringify(name)}`);
}
eq(await rpc("username_check", [KEY, ASHA, "Asha_P"]), { r: "ok", username: "asha_p" }, "free name, lowercased");
eq(await rpc("username_set", [KEY, ASHA, null, false]), { r: "bad" }, "switch alone needs a username first");
r = await rpc("username_set", [KEY, ASHA, "Asha_P", null]);
eq([r.r, r.username, r.taggable], ["ok", "asha_p", true], "first username, taggable by default");
eq((await rpc("username_set", [KEY, ravi, "asha_p", null])).r, "taken", "taken by someone else");
eq((await rpc("username_check", [KEY, ravi, "ASHA_P"])).r, "taken", "check sees it taken, any case");
eq((await rpc("username_check", [KEY, ASHA, "asha_p"])).r, "ok", "your own name is fine for you");
// Changes: 3 in 30 days, old names reserved for their owner.
for (const n of ["asha_1", "asha_2", "asha_3"]) eq((await rpc("username_set", [KEY, ASHA, n, null])).username, n, `change to ${n}`);
eq((await rpc("username_set", [KEY, ASHA, "asha_4", null])).r, "limit", "a fourth change in 30 days");
eq((await rpc("username_set", [KEY, ravi, "asha_p", null])).r, "taken", "an old name is never given to anyone else");
eq((await rpc("username_set", [KEY, ASHA, null, false])).taggable, false, "switch off");
eq((await rpc("username_set", [KEY, ASHA, "asha_3", true])).taggable, true, "same name, switch on, no change counted");
await q("update public.usernames set window_start = now() - interval '31 days' where user_id = $1", [ASHA]);
eq((await rpc("username_set", [KEY, ASHA, "asha_p", null])).username, "asha_p", "after 30 days, back to an own old name");
eq((await one("select count(*)::int n from public.username_history where user_id = $1", [ASHA])).n, 4, "history: p, 1, 2, 3 (p kept as history row too)");
eq((await one("select username from public.usernames where user_id = $1", [ASHA])).username, "asha_p", "current wins over history");

// Picking a suggestion.
eq(await rpc("username_pick", [KEY, ["asha_p", "Asha_1", "admin_x", "asha_patil", "asha_patil2"]]), "asha_patil", "first free, skipping taken, history and reserved");
eq(await rpc("username_pick", [KEY, ["asha_p"]]), null, "none free");

// Search: taggable only, by username prefix or name, never by phone, no ids.
await rpc("username_set", [KEY, ravi, "ravi_k", null]);
await rpc("username_set", [KEY, "55555555-5555-4555-8555-555555555555", "neha_s", null]);
r = await rpc("players_search", [KEY, "@ra"]);
eq(r.players.map((p) => p.u), ["ravi_k"], "prefix after @");
eq(Object.keys(r.players[0]).sort(), ["name", "photo", "u"], "no ids or phones in results");
eq((await rpc("players_search", [KEY, "sha"])).players.map((p) => p.u), ["asha_p"], "name substring");
eq((await rpc("players_search", [KEY, "9876"])).players, [], "never matches a phone number");
eq((await rpc("players_search", [KEY, "a"])).players, [], "two characters at least");
eq((await rpc("players_search", [KEY, "_"])).players, [], "wildcards are literal");
await rpc("username_set", [KEY, ravi, null, false]);
eq((await rpc("players_search", [KEY, "ravi"])).players, [], "opted out: not found");

// Live tag check: current names, history resolved, opted-out left out, at most 64.
r = await rpc("live_tags_check", [LKEY, ["asha_1", "ravi_k", "neha_s", "nobody", "BAD NAME", "asha_p"]]);
eq(r.tags.map((t) => `${t.asked}>${t.u}`).sort(), ["asha_1>asha_p", "asha_p>asha_p", "neha_s>neha_s"], "renamed resolves, opted out and unknown left out");
eq(await rpc("live_tags_check", [LKEY, Array.from({ length: 65 }, (_, i) => `name_${i}`)]), { r: "too_many" }, "cap");
eq(await rpc("live_tags_check", [LKEY, []]), { r: "ok", tags: [] }, "empty");

// Profile page.
r = await rpc("profile_get", ["Asha_P"]);
eq([r.u, r.name, Object.keys(r).sort()], ["asha_p", "Asha", ["name", "photo", "since", "u"]], "profile: public fields only");
eq(await rpc("profile_get", ["asha_2"]), { moved_to: "asha_p" }, "old name moves");
eq(await rpc("profile_get", ["ravi_k"]), null, "opted out: no profile");
eq(await rpc("profile_get", ["nobody"]), null, "unknown");
eq(await rpc("profile_get", ["x"]), null, "bad");
eq((await one("select has_function_privilege('anon', 'public.profile_get(text)', 'execute') x")).x, true, "profile_get open to anon");

// Admin users: owner only.
await assert.rejects(() => q("select * from public.admin_users(null, null)"), /not allowed/, "admin_users refuses non-owners");
await q("select set_config('test.owner', 'yes', false)");
const au = await q("select * from public.admin_users(null, null)");
ok(au.length === 6 && au.every((x) => "phone" in x && "email" in x), "admin_users lists everyone for the owner");
eq((await q("select id from public.admin_users(null, $1::uuid[])", [[ASHA]])).map((x) => x.id), [ASHA], "by ids");

// Keyed live read.
await q(`insert into public.live_matches values ('abcdefghijkl', '{"v":1}', 3, 'live', now())`);
r = await rpc("live_match_get_k", [LKEY, "abcdefghijkl"]);
eq([r.rev, r.status, r.match], [3, "live", { v: 1 }], "keyed live read");
eq(await rpc("live_match_get_k", [LKEY, "BAD"]), null, "bad code");

// Never removes users.
eq((await one("select count(*)::int n from public.users")).n, 6, "all users still there");
console.log(`acct-sql: ${passed} checks passed`);
