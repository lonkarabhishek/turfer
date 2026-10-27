// Checks 20261027_admin_reads_fast.sql on an in-memory Postgres (PGlite): the
// four admin reads it answers as sets return exactly what the live bodies
// return, row for row and in the same order, through every sign-in and link
// case of the verified tick's check (verified_tick.check.mjs) plus the ones
// only these reads see (old-app rows, set-aside rows asked back, unfinished
// Google sign-ins in every state, activity, claims), and on 200 random
// accounts (SCALE=n for more). The live bodies run as copies (schema oldv) next to the new
// ones on the same data; private.google_accounts is checked against
// private.google_account for every auth user; and the read-only production
// comparison (admin_reads_fast.compare.mjs) runs here too, before and after
// the file is applied. Also: the md5 pins, the replaced bodies keep their
// signatures, settings, grants and owner check, admin_people changes only at
// (7) and (8), the new function is closed to the API, and running the file
// again changes nothing. Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/admin_reads_fast.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { body, compareSql, LIVE, returned } from "./admin_reads_fast.compare.mjs";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: admin_reads_fast.check.mjs <supabase/migrations>");
const FILE = `${M}/20261027_admin_reads_fast.sql`;
const fast = fs.readFileSync(FILE, "utf8");
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const md5 = (s) => createHash("md5").update(s).digest("hex");

// ── The file itself ────────────────────────────────────────
assert.doesNotMatch(fast, /\bdrop\b|\bdelete\b|\btruncate\b/i, "no destructive keywords");
assert.doesNotMatch(fast, /[—–]/, "no em or en dashes");
passed += 2;
// md5(pg_proc.prosrc) on production, read 2026-10-27: the bodies this file replaces, and the helpers whose rules it restates.
const PINS = {
  "public.admin_ticks": ["20261027_verified_tick.sql", "9c94f0e7c78bc5ba48d485c002ee5adc"],
  "public.admin_verified": ["20261026_account_links.sql", "4f8ba6ba8a1e2527e24e435388e47f71"],
  "public.admin_google_unfinished": ["20261026_account_links.sql", "012463a77658b3d44eba182cd8b2ab16"],
  "public.admin_people": ["20261026_account_links_reads.sql", "b5edd196a2b80bd9c580e9a9848f9cb9"],
  "private.google_account": ["20261026_account_links.sql", "09e530212cc0c0cffeba50b9ecb94f01"],
  "private.google_open_link": ["20261026_account_links.sql", "21cab65dfc5c20277f7e61df6fcfbe25"],
  "private.google_own_row": ["20261026_account_links.sql", "d78c362448329f65fefbeabeabf4e49a"],
  "private.google_legacy_row": ["20261026_account_links.sql", "625442ff8a35008def10eabff4665a6b"],
  "private.phone_account": ["20261026_account_links.sql", "ffadf36c5a25c62f5a30088504506049"],
  "private.phone_link_ok": ["20261026_account_links.sql", "7ad290ea37365497c2c90598e3bc7ce4"],
  "private.phone_proven": ["20261027_verified_tick.sql", "34cff6ff01c863fd8921c78d12b2fb99"],
  "private.email_proven": ["20261027_verified_tick.sql", "2141139f1901b1cafcbde703573cfcf3"],
};
for (const [name, [file, pin]] of Object.entries(PINS)) {
  eq(md5(body(fs.readFileSync(`${M}/${file}`, "utf8"), name)), pin, `${name}: ${file} has the live body`);
  ok(fast.includes(pin), `${name}: its md5 is pinned in the header`);
}
for (const [name, file] of Object.entries(LIVE)) eq(PINS[name][0], file, `${name}: the compare script reads the pinned file`);

/** `create or replace function <name>(` up to `as $$`: the signature, result, language and settings. */
const head = (src, name) => {
  const at = src.lastIndexOf(`create or replace function ${name}(`);
  return src.slice(at, src.indexOf("$$", at));
};
/** The whole statement, `create ...` through its closing `$$;`. */
const stmt = (src, name) => {
  const at = src.lastIndexOf(`create or replace function ${name}(`);
  const open = src.indexOf("$$", at);
  return src.slice(at, src.indexOf("$$;", open + 2) + 3);
};
const liveSrc = (name) => fs.readFileSync(`${M}/${LIVE[name]}`, "utf8");
for (const name of Object.keys(LIVE)) {
  eq(head(fast, name), head(liveSrc(name), name), `${name}: same signature, result, language and settings`);
  const oldB = body(liveSrc(name), name), newB = body(fast, name);
  eq(newB.slice(0, newB.indexOf("return query")), oldB.slice(0, oldB.indexOf("return query")), `${name}: the same owner check first`);
  ok(new RegExp(`revoke all on function ${name.replace(".", "\\.")}\\(text\\) from public;\\ngrant execute on function ${name.replace(".", "\\.")}\\(text\\) to anon, authenticated;`).test(fast), `${name}: the same grants`);
}
// admin_people: the live body plus only (7) and (8).
{
  const name = "public.admin_people";
  let want = body(liveSrc(name), name);
  const CHANGES = [
    [`  return query
    with l as (
`, `  return query
    with lc as (
      -- (8) Each account's last number change, for pacct.
      select c.user_id, max(c.id) as last_id
        from private.users_phone_changes c
       group by c.user_id
    ), pacct as (
      -- (8) The accounts private.phone_account(phone) opens, all at once with its rules: the earliest
      -- row with a +91 number, when its open profile link was made at its last change
      -- (phone_link_ok), or it has no change and no auth row or an old-app phone sign-in.
      select x.id as user_id
        from (select distinct on (u.phone) u.id, u.phone
                from public.users u
               where u.phone::text ~ '^\\+91[0-9]{10}$'
               order by u.phone, u.created_at) x
        left join lc on lc.user_id = x.id
       where exists (select 1 from private.phone_links pl
                      where pl.user_id = x.id and pl.ended_at is null and pl.phone_hash = md5(x.phone::text)
                        and pl.change_id is not distinct from lc.last_id)
          or (lc.user_id is null
              and (not exists (select 1 from auth.users a where a.id = x.id)
                   or exists (select 1 from public.user_logins ul
                               where ul.user_id = x.id and ul.method = 'phone'
                                 and ul.created_at < private.phone_logins_trusted_before())))
    ), l as (
`],
    [`        cross join lateral (select private.google_account(au.id) as user_id) m
`, `        -- (7) The account each sign-in opens, read once for all of them (private.google_account).
        join private.google_accounts() m on m.auth_uid = au.id
`],
    [`             and private.phone_account(uu.phone::text) = uu.id
`, `             -- (8) private.phone_account(uu.phone) = uu.id, read from pacct.
             and exists (select 1 from pacct where pacct.user_id = uu.id)
`],
  ];
  for (const [from, to] of CHANGES) {
    eq(want.split(from).length, 2, `admin_people: changed once at ${JSON.stringify(from.trim().slice(0, 50))}`);
    want = want.replace(from, () => to); // a function: the new text has "$'" in it
  }
  eq(body(fast, name), want, "admin_people: the live body plus only (7) and (8)");
}
ok(!/private\.(phone_proven|email_proven|google_account|phone_account|phone_link_ok)\(/.test(
  Object.keys(LIVE).map((n) => returned(body(fast, n))).join("\n").replace(/--[^\n]*/g, "")),
  "no per-row helper call is left in the four reads");

// ── Stand-ins and the account migrations (as verified_tick.check.mjs) ──
// auth.identities.user_id references auth.users, as on production (identities_user_id_fkey).
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; create schema auth; create schema extensions;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('live_write', 'L'||repeat('1', 63));
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now(), last_sign_in_at timestamptz, phone text);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id), provider text not null,
  identity_data jsonb not null, created_at timestamptz default now());
-- As on production (identities_user_id_idx): the old bodies lean on it at scale.
create index identities_user_id_idx on auth.identities (user_id);
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
  "20261026_account_links.sql", "20261026_account_links_reads.sql", "20261027_verified_tick.sql"]) {
  await db.exec(fs.readFileSync(`${M}/${f}`, "utf8"));
}
await db.exec(`create trigger on_auth_user_created_sync_public_users after insert on auth.users for each row execute function public.handle_auth_user_created();`);
// Firebase and the site owner can't be reached here: a stand-in, as in account_links.check.mjs.
await db.exec(`
create or replace function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);
// What the database has now must be exactly what the pins name.
for (const [name, [, pin]] of Object.entries(PINS)) {
  const [schema, fn] = name.split(".");
  eq((await one(`select md5(p.prosrc) m from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2`, [schema, fn])).m, pin,
    `${name}: the database before the file has the pinned body`);
}

// The live bodies, kept as copies to run next to the new ones.
await db.exec("create schema oldv;");
for (const name of Object.keys(LIVE)) await db.exec(stmt(liveSrc(name), name).replace(`create or replace function ${name}(`, `create or replace function oldv.${name.split(".")[1]}(`));

const SIG_SQL = `select n.nspname || '.' || p.proname || '(' || pg_get_function_arguments(p.oid) || ') -> ' || pg_get_function_result(p.oid)
                        || ' ' || p.prosecdef::text || ' ' || p.provolatile::text || ' ' || coalesce(array_to_string(p.proconfig, ','), '')
                        || ' ' || has_function_privilege('anon', p.oid, 'execute')::text || ' ' || has_function_privilege('authenticated', p.oid, 'execute')::text
                        || ' ' || has_function_privilege('public', p.oid, 'execute')::text sig
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname in ('admin_ticks', 'admin_verified', 'admin_google_unfinished', 'admin_people')
                  order by 1`;
const sigsBefore = (await q(SIG_SQL)).map((x) => x.sig);
eq(sigsBefore.length, 4, "the four reads exist before");

// ── The comparison ─────────────────────────────────────────
const READS = ["admin_ticks", "admin_verified", "admin_google_unfinished", "admin_people"];
let applied = false;
const asOwner = async (fn) => {
  await q(`select set_config('test.owner', 'yes', false)`);
  try { return await fn(); } finally { await q(`select set_config('test.owner', '', false)`); }
};
const rowsOf = async (schema, fn) => (await q(`select to_jsonb(r) j from ${schema}.${fn}(null) r`)).map((x) => x.j);
/** Old and new on the same data: every read row for row in order, the shared mapping, and the production comparison. */
let checkpoints = 0;
const same = async (what, { compare = false } = {}) => {
  checkpoints++;
  if (process.env.VERBOSE) console.log(`${(performance.now() / 1000).toFixed(1)}s checkpoint ${checkpoints}: ${what}${compare || !applied ? " (+compare)" : ""}`);
  if (applied) {
    await asOwner(async () => {
      for (const fn of READS) eq(await rowsOf("public", fn), await rowsOf("oldv", fn), `${what}: ${fn} as before`);
    });
    eq(await q(`select auth_uid::text a, user_id::text u from private.google_accounts() order by 1`),
      await q(`select id::text a, private.google_account(id)::text u from auth.users order by 1`), `${what}: google_accounts is google_account for every auth user`);
  }
  if (compare || !applied) {
    for (const r of await q(compareSql(M))) {
      eq([r.only_old, r.only_new, r.same_order, Number(r.old_rows) === Number(r.new_rows)].map((x) => (typeof x === "bigint" ? Number(x) : x)),
        [0, 0, true, true], `${what}: the production comparison says ${r.fn} is the same`);
    }
  }
};

// ── Helpers (as verified_tick.check.mjs) ───────────────────
const KEY = (await one("select value from private.app_secrets where name = 'account'")).value;
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const resolve = (o) => rpc("account_resolve", [KEY, o.kind, o.phone ?? null, o.uid ?? null, o.email ?? null, o.name ?? null, null, o.create ?? false, o.log ?? false]);
const H = (s) => createHash("sha256").update(s).digest("hex");
const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const NOW = () => new Date().toISOString();
const AGO = (s) => new Date(Date.now() - s * 1000).toISOString();
let signIns = 0;
/** A Google sign-up in auth (no TapTurf row: the trigger makes none); each with its own last sign-in time. */
const google = async (id, email, o = {}) => {
  signIns++;
  await q(`insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, last_sign_in_at) values ($1, $2, now(), $3, $4, now() - make_interval(mins => $5))`,
    [id, email, JSON.stringify(o.meta ?? (o.provider === "email" ? { provider: "email", providers: ["email"] } : { provider: "google", providers: ["google"] })),
      JSON.stringify(o.name ? { full_name: o.name } : {}), 30 + signIns * 7]);
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
const t = async (id) => {
  const r = await one(`select private.phone_proven($1) p, private.email_proven($1) e, private.user_verified($1) v`, [id]);
  return [r.p, r.e, r.v];
};

// The live bodies and the new ones (inline, through the compare script) agree before anything is applied.
await same("empty database, before the file");

// Apply the file twice: signatures, settings and grants kept; the new function closed.
await db.exec(fast);
await db.exec(fast);
applied = true;
eq((await q(SIG_SQL)).map((x) => x.sig), sigsBefore, "the replaced reads keep their signature, result, settings and grants");
eq(sigsBefore, [
  `public.admin_google_unfinished(p_firebase_token text DEFAULT NULL::text) -> TABLE(auth_uid uuid, email text, name text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, state text) true s search_path="" true true false`,
  `public.admin_people(p_firebase_token text DEFAULT NULL::text) -> TABLE(id uuid, name text, email text, phone text, profile_image_url text, role text, is_verified boolean, created_at timestamp with time zone, signed_up_at timestamp with time zone, updated_at timestamp with time zone, method text, username text, taggable boolean, logins integer, last_login timestamp with time zone, login_methods text[], games_hosted integer, requests integer, requests_accepted integer, games_joined integer, reviews integer, contact_taps integer, contacted jsonb, asks integer, recent_asks text[], suggestions integer, turfs jsonb, last_active timestamp with time zone, signup jsonb, city text, city_source text, city_ip text, city_at_signup boolean, city_at timestamp with time zone, likely_city text, likely_share real) true s search_path="" true true false`,
  `public.admin_ticks(p_firebase_token text DEFAULT NULL::text) -> TABLE(user_id uuid, verified boolean, phone_proven boolean, email_proven boolean) true s search_path="" true true false`,
  `public.admin_verified(p_firebase_token text DEFAULT NULL::text) -> TABLE(user_id uuid, email_by_google boolean, email_confirmed boolean, phone_by_code boolean) true s search_path="" true true false`,
], "as on production");
eq((await one(`select p.prosecdef::text || ' ' || p.provolatile::text || ' ' || array_to_string(p.proconfig, ',') || ' ' || has_function_privilege('anon', p.oid, 'execute')::text
                      || ' ' || has_function_privilege('authenticated', p.oid, 'execute')::text || ' ' || has_function_privilege('public', p.oid, 'execute')::text || ' '
                      || pg_get_function_result(p.oid) s
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'google_accounts'`)).s,
  `true s search_path="" false false false TABLE(auth_uid uuid, user_id uuid, via text)`, "google_accounts: definer, stable, empty search_path, closed to the API");
for (const fn of READS) {
  await assert.rejects(q(`select * from public.${fn}(null)`), /not allowed/, `${fn}: still the site owner only`);
  passed++;
}
await db.exec(`set role anon`);
await assert.rejects(q(`select * from private.google_accounts()`), /permission denied/, "anon can't read google_accounts");
passed++;
await db.exec(`reset role`);
await same("empty database", { compare: true });

// ── 1. Phone accounts (verified_tick.check.mjs 1). ──
const PH1 = "+919100000001";
let r = await resolve({ kind: "phone", phone: PH1, name: "Asha", create: true, log: true });
const P1 = r.id;
await same("a phone sign-up");
await rpc("account_set_email", [KEY, P1, "save", "asha@example.com", "signup"]);
const PH2 = "+919100000002";
const P2 = (await resolve({ kind: "phone", phone: PH2, name: "Ravi", create: true, log: true })).id;
await q(`update public.users set email = 'ravi.typed@gmail.com' where id = $1`, [P2]);
await same("a typed email on a phone account");
const P3 = U(3), PH3 = "+919100000003";
await q(`insert into public.users (id, name, phone, password) values ($1, 'Old Phone', $2, 'phone-auth-no-password')`, [P3, PH3]);
await q(`insert into public.user_logins (user_id, method, created_at) values ($1, 'phone', '2026-10-01')`, [P3]);
await same("an old-app phone login before the log could be trusted");
eq((await rpc("account_phone_checked", [KEY, P3, PH3])).r, "ok", "checked");
await same("phone_verified", { compare: true });

// ── 2. A phone account adds Google (the link). ──
await google(U(10), "Asha.P@Gmail.com");
await link(PH1, "a1", U(10));
await same("Google linked to a phone account");
const PH4 = "+919100000004";
const P4 = (await resolve({ kind: "phone", phone: PH4, name: "Neha", create: true })).id;
await google(U(11), "neha@gmail.com");
// Being added right now: the unfinished list says linking.
eq((await start(PH4, "b1")).r, "ok", "b1 start");
eq((await attach("b1", U(11))).r, "ok", "b1 attach");
await same("a Google account being added (linking)", { compare: true });
eq((await complete("b1", PH4)).r, "ok", "b1 made");
await same("the link's own OTP");
await unlink(PH4, "b-u1");
await same("link ended (replaced)", { compare: true });
await rpc("account_phone_checked", [KEY, P4, PH4]);
await google(U(12), "neha2@gmail.com");
await link(PH4, "b2", U(12));
await q(`update private.account_link_intents set created_at = now() - interval '2 days' where user_id = $1`, [P1]);
await google(U(13), "asha.two@gmail.com");
await link(PH1, "a2", U(13));
await same("swapped Google accounts");
await q(`update public.users set email = 'other@example.com' where id = $1`, [P1]);
await same("the email changed behind the link");
await q(`update public.users set email = 'asha.two@gmail.com' where id = $1`, [P1]);
await same("back to the Google address", { compare: true });

// ── 3. Linked over an empty own row, the row asked back. ──
const E = U(20), PHE = "+919100000020";
await google(E, "emma@gmail.com");
await resolve({ kind: "google", uid: E, email: "emma@gmail.com", name: "Emma", create: true });
const PE = (await resolve({ kind: "phone", phone: PHE, name: "Esha", create: true, log: true })).id;
await link(PHE, "e1", E);
await same("linked over the empty own row");
await unlink(PHE, "e-u1");
await same("the link ends: the set-aside row opens nothing");
eq((await one(`select private.google_account($1) a`, [E])).a, null, "set aside");
await q(`insert into private.google_own_row_asked (auth_uid) values ($1)`, [E]);
eq((await one(`select private.google_account($1) a`, [E])).a, E, "asked back: its own row again");
await same("the own row asked back after the link ended", { compare: true });

// ── 4. A Google account and its number. ──
const G = U(30);
await google(G, "gita@gmail.com");
await resolve({ kind: "google", uid: G, email: "gita@gmail.com", name: "Gita", create: true, log: true });
const GT = U(31), PHGT = "+919100000031";
await google(GT, "typed.phone@gmail.com");
await q(`insert into public.users (id, name, email, phone, password) values ($1, 'Tara', 'typed.phone@gmail.com', $2, 'oauth-no-password')`, [GT, PHGT]);
await q(`insert into private.phone_verified (user_id, phone_hash) values ($1, md5($2))`, [GT, PHGT]);
await q(`insert into public.user_logins (user_id, method, created_at) values ($1, 'google', now())`, [GT]);
await same("a Google row with a typed number and a check row");
await setPhone(G, "+919100000030", "g1");
await same("an OTP-added number");
await setPhone(GT, PHGT, "gt1");
await setPhone(G, "+919100000032", "g2");
await same("changed by OTP");
await rpc("account_remove_phone", [KEY, G]);
await same("number removed");
await setPhone(G, "+919100000033", "g3");
await q(`update public.users set phone = '+919100000034' where id = $1`, [G]);
await same("changed outside the OTP flow");
await q(`update public.users set phone = '+919100000033' where id = $1`, [G]);
await same("changed back to the proved number", { compare: true });
const P5 = U(5), PH5 = "+919100000005";
await q(`insert into public.users (id, name, phone, password) values ($1, 'Mona', $2, 'phone-auth-no-password')`, [P5, PH5]);
await q(`insert into public.user_logins (user_id, method, created_at) values ($1, 'phone', now() - interval '1 hour')`, [P5]);
await same("a trusted logged phone sign-in");
await q(`update public.users set phone = '+919100000006' where id = $1`, [P5]);
await same("the number changed after it");
// Two changes, the sign-in between them: the later one decides.
const P6 = U(6);
await q(`insert into public.users (id, name, phone, password) values ($1, 'Twice', '+919100000007', 'phone-auth-no-password')`, [P6]);
await q(`update public.users set phone = '+919100000008' where id = $1`, [P6]);
await q(`insert into public.user_logins (user_id, method, created_at) values ($1, 'phone', now())`, [P6]);
await same("a sign-in after the last change");
await q(`update private.users_phone_changes set at = now() + interval '1 minute' where id = (select max(id) from private.users_phone_changes where user_id = $1)`, [P6]);
await same("the last change after the sign-in");
// A sign-in logged at the very moment of the last change: no change after it, so admin_verified counts the
// code (the tick doesn't: a number changed outside the OTP flow no longer opens the account).
const P7 = U(7);
await q(`insert into public.users (id, name, phone, password) values ($1, 'Same Time', '+919100000009', 'phone-auth-no-password')`, [P7]);
await q(`update public.users set phone = '+919100000010' where id = $1`, [P7]);
await q(`insert into public.user_logins (user_id, method, created_at) select $1, 'phone', max(c.at) from private.users_phone_changes c where c.user_id = $1`, [P7]);
eq((await asOwner(() => one(`select phone_by_code from oldv.admin_verified(null) where user_id = $1`, [P7]))).phone_by_code, true,
  "a sign-in at the change's own time counts as a code");
eq(await t(P7), [false, false, false], "but the changed number doesn't open the account");
await same("a sign-in at the same time as the last change");
// A Google row whose email was changed by hand: its own identity no longer confirms it.
await q(`update public.users set email = 'gita.other@example.com' where id = $1`, [G]);
eq((await t(G))[1], false, "the edited email is not proven");
await same("a Google row's email edited by hand");
await q(`update public.users set email = 'gita@gmail.com' where id = $1`, [G]);
await same("and put back");
const GO = U(35), PHGO = "+919100000035";
await google(GO, "omar@gmail.com");
await q(`insert into public.users (id, name, email, phone, password) values ($1, 'Omar', 'omar@gmail.com', $2, 'oauth-no-password')`, [GO, PHGO]);
await q(`insert into public.user_logins (user_id, method, created_at) values ($1, 'phone', '2026-10-05')`, [GO]);
await same("an old-app phone login on a Google row");
await resolve({ kind: "phone", phone: PHGO, log: true });
await same("and its OTP sign-in", { compare: true });

// ── 5. Old-app rows. ──
const L = U(40), GL = U(41), PHL = "+919100000040";
await q(`insert into public.users (id, name, email, phone, created_at) values ($1, 'Old Row', 'Old.Row@Gmail.com', $2, '2025-01-01')`, [L, PHL]);
await q(`insert into private.legacy_email_rows (user_id) values ($1)`, [L]);
await google(GL, "old.row@gmail.com");
await resolve({ kind: "google", uid: GL, email: "old.row@gmail.com", create: true });
await same("Google lands on an old-app row in another case");
await resolve({ kind: "phone", phone: PHL, log: true });
await same("its number signs in by OTP");
const L2 = U(42), GL2 = U(43), PHL2 = "+919100000042";
await q(`insert into public.users (id, name, email, phone, created_at) values ($1, 'Old Two', 'old.two@gmail.com', $2, '2025-01-01')`, [L2, PHL2]);
await q(`insert into private.legacy_email_rows (user_id) values ($1)`, [L2]);
await google(GL2, "old.two@gmail.com");
await q(`insert into private.phone_verified (user_id, phone_hash) values ($1, md5($2))`, [L2, PHL2]);
await same("an old-app row with phone_verified");
const L3 = U(44), GL3 = U(45);
await q(`insert into public.users (id, name, email, created_at) values ($1, 'Old Three', 'old.three@gmail.com', '2025-01-01')`, [L3]);
await q(`insert into private.legacy_email_rows (user_id) values ($1)`, [L3]);
await google(GL3, "old.three@gmail.com");
await q(`insert into public.users (id, name, password) values ($1, 'Own', 'oauth-no-password')`, [GL3]);
await same("a Google account with its own row never lands on the old row");
// Two old-app rows with one address in two cases: the earlier one is the one Google lands on.
const L4 = U(46), L5 = U(47), GL4 = U(48);
await q(`insert into public.users (id, name, email, created_at) values ($1, 'Dup Late', 'Dup@Gmail.com', '2025-03-01'), ($2, 'Dup Early', 'dup@gmail.com', '2025-02-01')`, [L4, L5]);
await q(`insert into private.legacy_email_rows (user_id) values ($1), ($2)`, [L4, L5]);
await google(GL4, "DUP@gmail.com");
eq((await one(`select private.google_account($1) a`, [GL4])).a, L5, "the earliest old-app row");
await same("two old-app rows with one address");
// An old-app row whose auth row is its own (an old email and password account): Google never lands there.
const L6 = U(49);
await google(L6, "old.pass@example.com", { provider: "email" });
await q(`insert into public.users (id, name, email, created_at) values ($1, 'Old Pass', 'old.pass@example.com', '2025-01-01')`, [L6]);
await q(`insert into private.legacy_email_rows (user_id) values ($1)`, [L6]);
const GL6 = U(59);
await google(GL6, "Old.Pass@example.com");
await same("an old-app row that is an auth user itself", { compare: true });

// ── 6. What never counts, and the unfinished sign-ins. ──
const EP = U(50);
await google(EP, "pass@example.com", { provider: "email" });
await q(`insert into public.users (id, name, email, password) values ($1, 'Pass', 'pass@example.com', 'x')`, [EP]);
await setPhone(EP, "+919100000050", "ep1");
await same("email and password with a proved number");
await q(`insert into auth.identities (user_id, provider, identity_data) values ($1, 'google', '{"email":"Pass@Example.com","email_verified":true}')`, [EP]);
await same("with a Google identity of its own");
const GU = U(51);
await google(GU, "unverified@gmail.com", { verified: false });
await resolve({ kind: "google", uid: GU, email: "unverified@gmail.com", create: true });
await same("Google didn't verify it");
const GH = U(52);
await q(`insert into public.users (id, name, email) values ($1, 'Holder', 'held@gmail.com')`, [U(53)]);
await google(GH, "held@gmail.com");
await resolve({ kind: "google", uid: GH, email: "held@gmail.com", create: true });
await same("a Google row made without its address");
const IV = U(54);
await q(`insert into public.users (id, name, email, phone, is_verified) values ($1, 'Flag', 'flag@gmail.com', '+919100000054', true)`, [IV]);
// A Google identity with no address, and one with an empty one.
const GN = U(55);
await q(`insert into auth.users (id, email, raw_app_meta_data, last_sign_in_at) values ($1, null, '{"provider":"google","providers":["google"]}', now() - interval '3 days')`, [GN]);
await q(`insert into auth.identities (user_id, provider, identity_data) values ($1, 'google', '{"email_verified":true}'), ($1, 'google', '{"email":"","email_verified":true}')`, [GN]);
await same("Google identities with no address");
// Unfinished: never came back (provider google), an added-later Google (providers only), link_failed.
await google(U(56), "never.back@gmail.com", { name: "Never Back" });
await google(U(57), "added.google@gmail.com", { meta: { provider: "email", providers: ["email", "google"] } });
const GF = U(58);
await google(GF, "failed@gmail.com");
await q(`insert into private.account_link_legs (intent_id, secret_hash, auth_uid, returned_at, outcome) values (0, $1, $2, now(), 'has_account')`, [H("leg-failed"), GF]);
await same("unfinished Google sign-ins in every state", { compare: true });
// A leg returned within 10 minutes of the last sign-in: that code exchange is not a sign-in (admin_people).
await q(`insert into private.account_link_legs (intent_id, secret_hash, auth_uid, returned_at, outcome) values (0, $1, $2, (select last_sign_in_at from auth.users where id = $2) + interval '5 minutes', 'ok')`, [H("leg-near"), G]);
// A logged Google sign-in that stands for the auth row's last one (admin_people).
await q(`insert into public.user_logins (user_id, method, created_at) values ($1, 'google', (select last_sign_in_at from auth.users where id = $2) - interval '2 minutes')`, [GO, GO]);
await same("sign-ins the log already has, and link legs");

// ── 7. Activity, claims and cities (admin_people). ──
const T1 = U(901), T2 = U(902), T3 = U(903);
await q(`insert into public.turfs (id, name, slug, city) values ($1, 'Arena One', 'arena-one', 'pune'), ($2, 'Box Two', 'box-two', 'nashik'), ($3, 'Odd', 'odd', 'Not A City')`, [T1, T2, T3]);
const GM1 = U(911), GM2 = U(912);
await q(`insert into public.games (id, creator_id, turf_id, created_at) values ($1, $2, $3, now() - interval '3 days'), ($4, $5, $6, now() - interval '1 day')`, [GM1, P1, T1, GM2, G, T2]);
await q(`insert into public.game_participants (game_id, user_id) values ($1, $2), ($1, $3), ($4, $3)`, [GM1, P1, P2, GM2]);
await q(`insert into public.game_requests (game_id, user_id, status) values ($1, $2, 'accepted'), ($3, $2, 'pending'), ($3, $4, 'declined')`, [GM1, P2, GM2, PE]);
await q(`insert into public.reviews (turf_id, user_id, rating, source) values ($1, $2, 5, null), ($1, $2, 4, 'google'), ($3, $4, 3, null)`, [T1, P1, T2, G]);
await q(`insert into public.turf_contact_clicks (turf_id, user_id, kind, created_at) select t, $1, k, now() - make_interval(mins => n)
           from unnest(array[$2, $2, $3, $4, $2, $3, $4]::uuid[], array['call','whatsapp','call','call','call','whatsapp','call'], array[1,2,3,4,5,6,7]) as x(t, k, n)`, [P2, T1, T2, T3]);
await q(`insert into public.ask_queries (user_id, query, filters, created_at) values ($1, 'turfs near me', '{"city":"pune"}', now() - interval '2 hours'),
           ($1, 'cricket nets', '{"city":"pune"}', now() - interval '1 hour'), ($1, 'football', '{"city":"nashik"}', now()), ($2, 'hi', null, now())`, [P1, G]);
await q(`insert into public.turf_suggestions (turf_id, user_id) values ($1, $2)`, [T2, P4]);
await q(`insert into public.user_signup_context (user_id, ctx) values ($1, '{"interest":{"cities":["nashik"]}}'), ($2, '{"interest":{"cities":[7]}}')`, [P1, G]);
await q(`insert into private.user_cities (user_id, city, source, ip_city, at_signup, updated_at) values ($1, 'pune', 'ip', 'pune', true, now())`, [P2]);
// Claims: by phone key, by Google key, by an old-app row's key, and one made for an account.
await q(`insert into public.turf_owners (turf_id, user_key, status, via, created_at) values ($1, 'p:9100000001', 'active', 'phone_match', now() - interval '2 days'),
           ($2, 'e:gita@gmail.com', 'pending', 'admin', now() - interval '1 day'), ($3, 'e:old.row@gmail.com', 'rejected', 'admin', now()),
           ($2, 'p:9100000033', 'revoked', 'admin', now() - interval '3 hours')`, [T1, T2, T3]);
await q(`update public.turf_owners set user_id = $1 where user_key = 'p:9100000033'`, [G]).catch(() => null);
await rpc("username_set", [KEY, P1, "asha_p", true]);
await rpc("username_set", [KEY, G, "gita_g", false]);
// An account with no sign-up time at all: last in the list.
await q(`insert into public.users (id, name, created_at) values ($1, 'No Time', null)`, [U(60)]);
await same("activity, claims and cities", { compare: true });

// ── 8. At scale: random accounts (SCALE, 200 by default), old and new on the same rows. ──
// 200 by default: the live admin_ticks takes over 10 s on that many in PGlite (it grows with the square of the accounts).
const N = Number(process.env.SCALE ?? 200);
await db.exec(`
select setseed(0.27);
-- Phone and Google accounts, old-app rows, and Google sign-ins of every kind.
insert into public.users (id, name, email, phone, created_at)
select ('bbbbbbbb-bbbb-4bbb-8bbb-' || lpad(i::text, 12, '0'))::uuid, 'User ' || i,
       case when i % 3 = 0 then 'user' || i || '@gmail.com' when i % 7 = 0 then 'User' || i || '@Example.com' end,
       case when i % 4 <> 3 then '+9198' || lpad(i::text, 8, '0') when i % 8 = 3 then '98' || lpad(i::text, 8, '0') end,
       timestamptz '2025-06-01' + make_interval(hours => i * 3)
  from generate_series(1, ${N}) i;
insert into private.legacy_email_rows (user_id)
select u.id from public.users u where u.name like 'User %' and u.email is not null and (substr(u.name, 6))::int % 5 = 0;
-- Google sign-ins: their own rows (every third), and others with no row (old-app landings and unfinished ones).
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, created_at, last_sign_in_at)
select u.id, lower(u.email), now(), case when (substr(u.name, 6))::int % 9 = 0 then '{"provider":"email","providers":["email"]}'::jsonb else '{"provider":"google","providers":["google"]}'::jsonb end,
       u.created_at, u.created_at + make_interval(mins => (substr(u.name, 6))::int)
  from public.users u where u.name like 'User %' and u.email is not null and (substr(u.name, 6))::int % 3 = 0 and (substr(u.name, 6))::int % 5 <> 0;
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, created_at, last_sign_in_at)
select ('cccccccc-cccc-4ccc-8ccc-' || lpad(i::text, 12, '0'))::uuid,
       case when i % 2 = 0 then 'USER' || (i * 5) || '@gmail.com' when i % 3 = 0 then 'user' || (i * 7) || '@example.com' else 'nobody' || i || '@gmail.com' end,
       now(), case when i % 4 = 0 then '{"provider":"email","providers":["email","google"]}'::jsonb else '{"provider":"google","providers":["google"]}'::jsonb end,
       timestamptz '2026-01-01' + make_interval(hours => i), case when i % 6 <> 0 then timestamptz '2026-09-01' + make_interval(mins => i * 11) end
  from generate_series(1, ${Math.round(N * 4 / 15)}) i;
insert into auth.identities (user_id, provider, identity_data)
select a.id, case when a.raw_app_meta_data ->> 'provider' = 'email' and random() < 0.5 then 'email' else 'google' end,
       jsonb_build_object('email', case when random() < 0.1 then upper(a.email) else a.email end, 'email_verified', random() < 0.85)
  from auth.users a where a.id::text like 'bbbbbbbb%' or a.id::text like 'cccccccc%';
-- Number changes, profile links (at the last change or not), checks, the links' intents, logins early and late.
insert into private.users_phone_changes (user_id, at, old_hash, new_hash)
select u.id, u.created_at + make_interval(days => k), md5('x' || k), md5(u.phone)
  from public.users u cross join generate_series(1, 2) k
 where u.name like 'User %' and u.phone is not null and ((substr(u.name, 6))::int % 6 = 1 or (k = 1 and (substr(u.name, 6))::int % 10 = 2));
insert into private.phone_links (user_id, phone_hash, change_id, proof_key, at, ended_at)
select u.id, case when random() < 0.9 then md5(u.phone) else md5('other') end,
       case when random() < 0.8 then (select max(c.id) from private.users_phone_changes c where c.user_id = u.id) else (select min(c.id) from private.users_phone_changes c where c.user_id = u.id) end,
       repeat('a', 64), u.created_at, case when random() < 0.15 then now() end
  from public.users u where u.name like 'User %' and u.phone is not null and random() < 0.3;
insert into private.phone_verified (user_id, phone_hash)
select u.id, case when random() < 0.85 then md5(u.phone) else md5('stale') end
  from public.users u where u.name like 'User %' and u.phone is not null and random() < 0.35;
insert into public.user_logins (user_id, method, created_at)
select u.id, case when random() < 0.7 then 'phone' else 'google' end,
       case when random() < 0.4 then timestamptz '2026-10-01' + make_interval(mins => (substr(u.name, 6))::int) else u.created_at + make_interval(days => 3, mins => (substr(u.name, 6))::int) end
  from public.users u cross join generate_series(1, 2) k where u.name like 'User %' and random() < 0.45;
-- Google accounts added to phone accounts: open and ended links with their intents, some ended over own rows, some asked back.
insert into private.account_link_intents (user_id, fb_sub_hash, phone_hash, auth_time, proof_key, expires_at, auth_uid, closed_at, outcome)
select u.id, md5('fb'), case when random() < 0.8 then md5(u.phone) else md5('elsewhere') end, now(), repeat('b', 64), now() + interval '10 minutes',
       ('cccccccc-cccc-4ccc-8ccc-' || lpad(((substr(u.name, 6))::int % ${Math.round(N * 4 / 15)} + 1)::text, 12, '0'))::uuid, case when random() < 0.9 then now() end, 'linked'
  from public.users u where u.name like 'User %' and u.phone is not null and u.email is null and (substr(u.name, 6))::int % 11 = 0;
insert into private.account_google_links (auth_uid, user_id, email, intent_id, linked_at, ended_at, ended_reason)
select distinct on (i.auth_uid) i.auth_uid, i.user_id, null, i.id, now() - interval '5 days', case when random() < 0.3 then now() - interval '1 day' end, null
  from private.account_link_intents i join public.users u on u.id = i.user_id where u.name like 'User %'
 order by i.auth_uid, i.id;
update private.account_google_links set ended_reason = 'removed' where ended_at is not null;
insert into private.account_google_links (auth_uid, user_id, intent_id, linked_at, ended_at, ended_reason)
select a.id, (select u2.id from public.users u2 where u2.name like 'User %' and u2.phone is not null and u2.email is null order by md5(a.id::text || u2.id::text) limit 1),
       null, a.created_at - interval '1 day', a.created_at + interval '1 day', 'changed'
  from auth.users a where a.id::text like 'bbbbbbbb%' and random() < 0.2
   and not exists (select 1 from private.account_google_links l where l.auth_uid = a.id);
insert into private.google_own_row_asked (auth_uid, at)
select l.auth_uid, l.ended_at + case when random() < 0.5 then interval '1 hour' else interval '-1 hour' end
  from private.account_google_links l where l.ended_at is not null and random() < 0.5;
insert into private.account_link_legs (intent_id, secret_hash, auth_uid, returned_at, outcome)
select 0, md5(a.id::text) || md5(a.id::text), a.id, coalesce(a.last_sign_in_at, now()) + make_interval(mins => case when random() < 0.5 then 3 else 30 end), 'ok'
  from auth.users a where a.id::text like 'cccccccc%' and random() < 0.15;
-- Activity for the people list.
insert into public.games (creator_id, turf_id, created_at)
select u.id, (array['${T1}', '${T2}', '${T3}'])[1 + (substr(u.name, 6))::int % 3]::uuid, u.created_at + interval '2 days'
  from public.users u where u.name like 'User %' and random() < 0.1;
insert into public.turf_owners (turf_id, user_key, status, via, created_at)
select (array['${T1}', '${T2}', '${T3}'])[1 + (substr(u.name, 6))::int % 3]::uuid, 'p:' || right(u.phone, 10),
       (array['active', 'pending', 'rejected'])[1 + (substr(u.name, 6))::int % 3], 'phone_match', u.created_at
  from public.users u where u.name like 'User %' and u.phone ~ '^\\+91' and (substr(u.name, 6))::int % 13 = 0;
`);
if (process.env.VERBOSE) console.log(`${(performance.now() / 1000).toFixed(1)}s scale data in`);
const big = await one(`select (select count(*) from public.users)::int users, (select count(*) from auth.users)::int auth,
                              (select count(*) from private.account_google_links)::int links, (select count(*) from private.phone_links)::int plinks`);
ok(big.users > N && big.auth > N / 2 && big.links > N / 75 && big.plinks > N / 15, `scale data: ${JSON.stringify(big)}`);
// Statistics, as production has them. The new reads run twice (the first also plans) and the faster time is
// reported; the live ones once (admin_ticks takes many seconds).
await db.exec("analyze");
const timed = async (sql, runs = 1) => {
  let best = Infinity, rows;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    rows = await q(sql);
    best = Math.min(best, performance.now() - t0);
  }
  return [rows, best];
};
const times = {};
await asOwner(async () => {
  for (const fn of READS) {
    if (process.env.VERBOSE) console.log(`${(performance.now() / 1000).toFixed(1)}s at scale: ${fn}`);
    const [o, to] = await timed(`select to_jsonb(r) j from oldv.${fn}(null) r`);
    const [n, tn] = await timed(`select to_jsonb(r) j from public.${fn}(null) r`, 2);
    eq(n.map((x) => x.j), o.map((x) => x.j), `at scale: ${fn} as before (${o.length} rows)`);
    times[fn] = `${Math.round(to)} ms -> ${Math.round(tn)} ms`;
  }
  const ticks = await one(`select count(*) filter (where verified)::int v, count(*) filter (where phone_proven)::int p, count(*) filter (where email_proven)::int e from public.admin_ticks(null)`);
  ok(ticks.p > N / 6 && ticks.e > N / 6 && ticks.v > N / 30, `at scale the ticks are a real mix: ${JSON.stringify(ticks)}`);
  const states = await q(`select state, count(*)::int n from public.admin_google_unfinished(null) group by 1 order by 1`);
  ok(states.length >= 3, `at scale the unfinished states are a mix: ${JSON.stringify(states)}`);
});
const via = await q(`select coalesce(via, 'none') via, count(*)::int n from private.google_accounts() group by 1 order by 1`);
eq(via.map((x) => x.via), ["legacy", "link", "none", "own"], `at scale google_accounts opens by every rule: ${JSON.stringify(via)}`);
await same(`${N} random accounts`, { compare: true });

// ── 9. Running again keeps everything. ──
const snap = await asOwner(() => rowsOf("public", "admin_people"));
await db.exec(fast);
eq(await asOwner(() => rowsOf("public", "admin_people")), snap, "running again changes nothing");
console.log(`admin_reads_fast: ${passed} checks passed at ${checkpoints} checkpoints (PGlite, old -> new at scale: ${JSON.stringify(times)})`);
