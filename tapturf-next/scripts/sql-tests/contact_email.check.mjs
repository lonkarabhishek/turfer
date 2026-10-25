// Applies 20261025_contact_email.sql (twice) to an in-memory Postgres
// (PGlite) with stand-ins for Supabase's roles, auth schema and the
// tables it reads, and checks the optional email for phone accounts:
// asked once, kept out of users.email, five saves a day, and what admin
// sees. Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/contact_email.check.mjs supabase/migrations/20261025_contact_email.sql
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { cleanEmail } from "../../.test-out/account/lib/account/emails.js";

const [FILE] = process.argv.slice(2);
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
let passed = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

await db.exec(`
create role anon; create role authenticated;
create schema private; create schema auth;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', 'K'||repeat('1', 63));
create function private.account_key_ok(p_key text) returns boolean language sql stable security definer set search_path = '' as
  $$ select p_key is not null and p_key = (select s.value from private.app_secrets s where s.name = 'account') $$;
create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb default '{}');
create table public.users (id uuid primary key default gen_random_uuid(), email varchar unique, name varchar not null, phone varchar, role varchar default 'user',
  profile_image_url text, created_at timestamptz default now());
create table public.usernames (user_id uuid primary key, username text unique not null, taggable boolean not null default true);
create table public.games (id uuid primary key default gen_random_uuid(), creator_id uuid, host_name text, date date);
create table public.game_requests (id uuid primary key default gen_random_uuid(), user_id uuid, requester_name varchar, status text);
create function private.clean_name(p_name text) returns text language sql immutable as
  $$ select nullif(left(regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g'), 60), '') $$;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`);

const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\s+from\b|\btruncate\b/i, "nothing dropped or deleted");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
await db.exec(sql);
await db.exec(sql); // safe to run again

const KEY = "K" + "1".repeat(63);
const P = "11111111-1111-4111-8111-111111111111"; // phone account
const P2 = "22222222-2222-4222-8222-222222222222"; // another phone account
const G = "33333333-3333-4333-8333-333333333333"; // Google account
const OLD = "44444444-4444-4444-8444-444444444444"; // old-app phone row with an email
await q(`insert into auth.users (id, email, raw_app_meta_data) values ('${G}', 'gina@gmail.com', '{"providers":["google"]}')`);
await q(`insert into public.users (id, name, email, phone) values
  ('${P}', 'Priya', null, '+919800000001'), ('${P2}', 'Ravi', null, '+919800000002'),
  ('${G}', 'Gina', 'gina@gmail.com', null), ('${OLD}', 'Old', 'old@x.in', '+919800000004')`);

const set = async (user, action, email = null, source = "profile", key = KEY) => (await one("select public.account_set_email($1, $2, $3, $4, $5) r", [key, user, action, email, source])).r;
const profile = async (user) => (await one("select private.profile_json($1) p", [user])).p;
const row = (user) => one("select email, answer, source, consent, saves from private.user_contact_emails where user_id = $1", [user]);

// Who may add one at all.
eq([(await profile(P)).email_editable, (await profile(G)).email_editable, (await profile(OLD)).email_editable], [true, false, false], "phone accounts with no email only");

// A new name also goes on their upcoming games and waiting requests (they keep a copy).
await q(`insert into public.games (creator_id, host_name, date) values ('${P}', 'Priya', current_date + 1), ('${P}', 'Priya', current_date - 3), ('${P2}', 'Ravi', current_date + 1)`);
await q(`insert into public.game_requests (user_id, requester_name, status) values ('${P}', 'Priya', 'pending'), ('${P}', 'Priya', 'accepted')`);
const upd = (await one("select public.account_update($1, $2, $3) r", [KEY, P, "Priya  Sharma"])).r;
eq([upd.r, upd.name], ["ok", "Priya Sharma"], "renamed");
eq((await q(`select host_name, date >= current_date as upcoming from public.games where creator_id = '${P}' order by date`)).map((g) => g.host_name), ["Priya", "Priya Sharma"], "the upcoming game, not the past one");
eq((await q(`select requester_name from public.game_requests where user_id = '${P}' order by status`)).map((r) => r.requester_name), ["Priya", "Priya Sharma"], "the waiting request, not the answered one");
eq((await one(`select host_name from public.games where creator_id = '${P2}'`)).host_name, "Ravi", "nobody else's");
eq((await one("select public.account_update($1, $2, $3) r", ["wrong", P, "X"])).r.r, "unavailable", "the key is checked");

// Who is asked.
eq((await profile(P)).ask_email, true, "a phone account with no email is asked");
eq((await profile(P)).contact_email, null);
eq((await profile(G)).ask_email, false, "a Google account is not");
eq((await profile(OLD)).ask_email, false, "an old-app account with an email is not");
eq((await set(P, "save", "a@b.co", "profile", "wrong")).r, "unavailable", "the account key is checked");
eq((await set(G, "save", "other@gmail.com")).r, "bad", "Google accounts keep their Google email");
eq((await set(OLD, "save", "new@x.in")).r, "bad", "old-app accounts keep theirs");
eq((await set(P, "fly", "a@b.co")).r, "bad", "an unknown action");

// Saving, at sign-up or later.
eq((await set(P, "save", "not an email", "signup")).r, "email", "not an address");
eq(await row(P), undefined, "nothing kept");
let r = await set(P, "save", "  Priya.S@GMAIL.com ", "signup");
eq([r.r, r.contact_email, r.ask_email, r.email], ["ok", "priya.s@gmail.com", false, null], "saved lowercased, never in users.email");
eq((await one(`select email from public.users where id = '${P}'`)).email, null, "users.email untouched");
eq(await row(P), { email: "priya.s@gmail.com", answer: "saved", source: "signup", consent: "deals_invites_v1", saves: 1 }, "with the promise shown");
eq((await set(P, "skip", null, "prompt")).contact_email, "priya.s@gmail.com", "a later skip changes nothing");
eq((await set(P, "save", "priya.s@gmail.com")).r, "ok", "the same address again");
eq((await row(P)).saves, 1, "is not counted");

// Five saves a day.
for (const e of ["b@x.in", "c@x.in", "d@x.in", "e@x.in"]) eq((await set(P, "save", e)).r, "ok", e);
eq((await set(P, "save", "f@x.in")).r, "limit", "the sixth in a day");
eq((await profile(P)).contact_email, "e@x.in", "the fifth stays");
await q(`update private.user_contact_emails set window_start = now() - interval '25 hours' where user_id = '${P}'`);
eq((await set(P, "save", "f@x.in")).r, "ok", "a day later");
eq((await row(P)).saves, 1, "the count starts again");

// Remove.
r = await set(P, "remove");
eq([r.r, r.contact_email, r.ask_email], ["ok", null, false], "removed, and not asked again");
eq((await row(P)).answer, "removed");
eq((await set(P, "remove")).r, "ok", "removing nothing is fine");

// No thanks.
r = await set(P2, "skip", null, "prompt");
eq([r.r, r.contact_email, r.ask_email], ["ok", null, false], "No thanks ends the ask");
eq((await row(P2)).answer, "skipped");
eq((await set(P2, "save", "gina@gmail.com", "profile")).r, "ok", "they can still add one later, even an address another account holds");
eq((await one(`select count(*)::int n from public.users where email = 'gina@gmail.com'`)).n, 1, "the Google account keeps its email");

// The browser can't read the table; only the site owner sees answers.
eq((await one(`select has_table_privilege('anon', 'private.user_contact_emails', 'select') a`)).a, false, "closed table");
eq((await one(`select has_function_privilege('anon', 'private.clean_email(text)', 'execute') a`)).a, false, "clean_email closed");
await assert.rejects(q("select * from public.admin_contact_emails(null)"), /not allowed/);
passed++;
await q(`select set_config('test.owner', 'yes', false)`);
const admin = Object.fromEntries((await q("select * from public.admin_contact_emails(null)")).map((x) => [x.user_id, x]));
eq([admin[P].email, admin[P].answer, admin[P].same_as_other_account], [null, "removed", false], "removed");
eq([admin[P2].email, admin[P2].answer, admin[P2].source, admin[P2].same_as_other_account], ["gina@gmail.com", "saved", "profile", true], "flagged: the same address as another account");

// The browser's check and the database's agree.
const cases = ["a@b.co", "A.B+tag@Sub.Example.IN", " x_y%z@d-o.com ", "a@b", "a@b.c", "a b@c.com", "@c.com", "a@.com", "a@-x.com", "a..b@c.com", ".a@c.com", "a@c..com", "ü@c.com", "a@c.com.", "x".repeat(65) + "@c.com", "a@" + "b".repeat(250) + ".com", "", "a,b@c.com"];
for (const c of cases) eq(cleanEmail(c), (await one("select private.clean_email($1) v", [c])).v, `same rule: ${JSON.stringify(c)}`);

console.log(`contact_email: ${passed} checks passed`);
