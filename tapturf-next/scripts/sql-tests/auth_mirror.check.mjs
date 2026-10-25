// Applies 20261025_auth_mirror_google_only.sql (twice) to an in-memory
// Postgres (PGlite) and checks that a new auth user gets a TapTurf account
// only for a Google sign-up, and never a phone number from sign-up
// metadata. Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/auth_mirror.check.mjs supabase/migrations/20261025_auth_mirror_google_only.sql
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [FILE] = process.argv.slice(2);
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
let passed = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

await db.exec(`
create schema auth;
create table auth.users (id uuid primary key, email text, phone text, created_at timestamptz default now(), raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
create table public.users (id uuid primary key, email varchar unique, name varchar not null, phone varchar unique, role varchar, profile_image_url text, created_at timestamptz);
`);
const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\s+from\b|\btruncate\b/i, "nothing dropped or deleted");
assert.doesNotMatch(sql, /[\u2014\u2013]/, "no em or en dashes");
await db.exec(sql);
await db.exec(sql);
await db.exec(`create trigger on_auth_user_created_sync_public_users after insert on auth.users for each row execute function public.handle_auth_user_created()`);

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", C = "33333333-3333-4333-8333-333333333333";
await q(`insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ($1, 'g@gmail.com', '{"provider":"google","providers":["google"]}', '{"full_name":"Gina G","picture":"https://x/p.png","phone":"+919800000001"}')`, [A]);
eq((await q(`select name, email, phone, profile_image_url from public.users where id = $1`, [A]))[0], { name: "Gina G", email: "g@gmail.com", phone: null, profile_image_url: "https://x/p.png" }, "a Google sign-up gets its account, without the metadata phone");
await q(`insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ($1, 'victim@gmail.com', '{"provider":"email","providers":["email"]}', '{"phone":"+919800000002"}')`, [B]);
eq((await q(`select count(*)::int n from public.users where id = $1 or phone = '+919800000002' or email = 'victim@gmail.com'`, [B]))[0].n, 0, "an email-and-password sign-up makes no account, takes no number and no address");
await q(`insert into public.users (id, email, name) values ($1, 'taken@gmail.com', 'Someone')`, ["44444444-4444-4444-8444-444444444444"]);
await q(`insert into auth.users (id, email, raw_app_meta_data) values ($1, 'taken@gmail.com', '{"providers":["google"]}')`, [C]);
eq((await q(`select count(*)::int n from public.users where id = $1`, [C]))[0].n, 0, "a held address: no row, and the sign-up still goes through");
console.log(`auth_mirror: ${passed} checks passed`);
