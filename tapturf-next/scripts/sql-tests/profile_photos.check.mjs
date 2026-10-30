// Applies 20261030_profile_photos.sql and 20261030_profile_photos_policies.sql
// (each twice) to an in-memory Postgres (PGlite) with stand-ins for
// Supabase's roles, the storage schema and the account helpers, and checks
// profile photos: the bucket, upload tickets, the storage policies, finish,
// avatars, the Google photo, Remove, the copies on games and join
// requests, the files listed for removal, the daily cap, the pause switch
// and new Google accounts. Never touches a real database.
// The server key is 'server-key'.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/profile_photos.check.mjs supabase/migrations/20261030_profile_photos.sql supabase/migrations/20261030_profile_photos_policies.sql
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const FILES = process.argv.slice(2);
assert.equal(FILES.length, 2, "pass 20261030_profile_photos.sql and 20261030_profile_photos_policies.sql");
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
let passed = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };
const ok = (c, what) => { assert.ok(c, what); passed++; };

await db.exec(`
create role anon; create role authenticated;
create schema private; create schema extensions; create schema storage; create schema auth;
-- pgcrypto's gen_random_bytes (PGlite has no pgcrypto): bytes from the built-in uuid generator.
create function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as
  $$ select substring(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()) from 1 for n) $$;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', 'server-key');
create function private.account_key_ok(p_key text) returns boolean language sql stable security definer set search_path = '' as
  $$ select p_key is not null and p_key = (select s.value from private.app_secrets s where s.name = 'account') $$;
create table private.reports (kind text, detail jsonb);
create function private.report(p_kind text, p_detail jsonb) returns void language sql as $$ insert into private.reports values (p_kind, p_detail) $$;
create function private.clean_name(p_name text) returns text language sql immutable as
  $$ select nullif(left(regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g'), 60), '') $$;
create table public.users (id uuid primary key default gen_random_uuid(), email varchar unique, name varchar not null, phone varchar,
  role varchar default 'user', password text, profile_image_url text, created_at timestamptz default now());
create table public.games (id uuid primary key default gen_random_uuid(), creator_id uuid, host_name text, host_profile_image_url text, date date);
create table public.game_requests (id uuid primary key default gen_random_uuid(), game_id uuid, user_id uuid, requester_name varchar, requester_avatar text, status text);
-- The profile the account functions answer with (the real one reads many more tables).
create function private.profile_json(p_user_id uuid) returns jsonb language sql stable security definer set search_path = '' as
  $$ select jsonb_build_object('id', u.id, 'name', u.name, 'profile_image_url', u.profile_image_url) from public.users u where u.id = p_user_id $$;
-- Supabase storage: RLS on, anon and authenticated hold the table privileges, policies decide.
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb,
  owner_id text, archived_at timestamptz, is_delete_marker boolean default false, created_at timestamptz default now(), unique (bucket_id, name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
`);

const sqls = FILES.map((f) => fs.readFileSync(f, "utf8"));
for (const s of sqls) {
  assert.doesNotMatch(s, /\bdrop\b|\bdelete\s+from\b|\btruncate\b/i, "nothing dropped or deleted");
  passed++;
  assert.doesNotMatch(s, /[—–]/, "no em or en dashes");
  passed++;
}
for (let i = 0; i < 2; i++) for (const s of sqls) await db.exec(s); // safe to run again

eq(await q("select id, name, public, file_size_limit::int as max, allowed_mime_types as types from storage.buckets"),
  [{ id: "avatars", name: "avatars", public: true, max: 524288, types: ["image/webp", "image/jpeg"] }], "a public bucket, 512 KB, WebP or JPEG, made once");
eq((await one(`select count(*)::int n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'tt avatars %'`)).n, 3, "three storage policies, created once");
eq((await one(`select count(*)::int n from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'UPDATE'`)).n, 0, "no update policy");
eq((await one(`select count(*)::int n from pg_constraint where conrelid = 'public.user_photos'::regclass and contype = 'c'`)).n, 0, "no CHECK constraints");
ok(/lock_timeout = '2s'/.test(sqls[1]), "the policies wait 2 s at most for their lock");

// Grants: the functions are open to the API (they check the server key), the table and the helpers are not.
for (const f of ["account_photo_ready(text)", "account_photo_start(text,uuid,text,integer)", "account_photo_drop(text,uuid,uuid,text,jsonb)",
  "account_photo_finish(text,uuid,uuid,jsonb)", "account_photo_set(text,uuid,text,text)", "account_photo_files_gone(text,uuid,uuid[])", "avatar_object_ok(text,text)"])
  eq((await one(`select has_function_privilege('anon', 'public.${f}', 'execute') a`)).a, true, `${f} callable`);
for (const f of ["user_photos_paused()", "user_photos_expire(uuid)", "user_photo_apply(uuid,text)", "user_photo_files(uuid)", "google_make_account(uuid,text,text,text)"])
  eq((await one(`select has_function_privilege('anon', 'private.${f}', 'execute') a`)).a, false, `private.${f} closed`);
eq((await one(`select has_table_privilege('anon', 'public.user_photos', 'select') a`)).a, false, "the table is closed");
eq((await one(`select has_table_privilege('authenticated', 'public.user_photos', 'insert') a`)).a, false, "and closed to writes");

const K = "server-key";
const BASE = "https://hwfsbpzercuoshodmnuf.supabase.co/storage/v1/object/public/avatars/";
const A = "11111111-1111-4111-8111-111111111111"; // Asha, a phone account
const B = "22222222-2222-4222-8222-222222222222"; // Ravi, a Google account with its Google photo from before
const NOBODY = "99999999-9999-4999-8999-999999999999";
const GPHOTO = "https://lh3.googleusercontent.com/a/ACg8ocKx_Ravi-photo=s96-c";
await q(`insert into public.users (id, name, phone) values ($1, 'Asha', '+919800000001')`, [A]);
await q(`insert into public.users (id, name, email, profile_image_url) values ($1, 'Ravi', 'ravi@x.in', $2)`, [B, GPHOTO]);
const G1 = (await one(`insert into public.games (creator_id, host_name, host_profile_image_url, date) values ($1, 'Asha', '', '2026-11-01') returning id`, [A])).id;
const G2 = (await one(`insert into public.games (creator_id, host_name, host_profile_image_url, date) values ($1, 'Asha', null, '2026-09-01') returning id`, [A])).id;
const GR = (await one(`insert into public.games (creator_id, host_name, host_profile_image_url, date) values ($1, 'Ravi', $2, '2026-11-02') returning id`, [B, GPHOTO])).id;
await q(`insert into public.game_requests (game_id, user_id, requester_name, requester_avatar, status) values ($1, $2, 'Asha', null, 'pending'), ($3, $2, 'Asha', null, 'accepted')`, [GR, A, G2]);

const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const start = (user = A, ext = "webp", bytes = 40000, key = K) => rpc("account_photo_start", [key, user, ext, bytes]);
const finish = (user, id, verdict = null, key = K) => rpc("account_photo_finish", [key, user, id, verdict]);
const set = (user, kind, value = null, key = K) => rpc("account_photo_set", [key, user, kind, value]);
const drop = (user, id, outcome, verdict = null) => rpc("account_photo_drop", [K, user, id, outcome, verdict]);
const gone = (user, ids) => rpc("account_photo_files_gone", [K, user, ids]);
const okObj = async (path, op) => (await one("select public.avatar_object_ok($1, $2) r", [path, op])).r;
const photo = (id) => one("select status, url, verdict, files_gone_at is not null as gone from public.user_photos where id = $1", [id]);
const userPhoto = async (id) => (await one("select profile_image_url u from public.users where id = $1", [id])).u;
const copies = async (user) => ({
  games: (await q("select host_profile_image_url u from public.games where creator_id = $1 order by date", [user])).map((r) => r.u),
  requests: (await q("select requester_avatar u from public.game_requests where user_id = $1 order by status desc", [user])).map((r) => r.u),
});
const meta = (size, mimetype = "image/webp") => JSON.stringify({ size, mimetype });
const putFile = (path, size = 40000, mimetype = "image/webp", bucket = "avatars") =>
  q(`insert into storage.objects (bucket_id, name, metadata) values ($1, $2, $3)`, [bucket, path, meta(size, mimetype)]);
const asAnon = async (fn) => { await q("set role anon"); try { return await fn(); } finally { await q("reset role"); } };
const fails = async (p) => { try { await p; return null; } catch (e) { return String(e.message ?? e); } };
const ago = (id, minutes) => q(`update public.user_photos set created_at = now() - make_interval(mins => $2) where id = $1`, [id, minutes]);

// The server key, everywhere.
for (const [what, r] of [
  ["ready", await rpc("account_photo_ready", ["wrong"])],
  ["start", await start(A, "webp", 40000, "wrong")],
  ["drop", await rpc("account_photo_drop", [null, A, NOBODY, "refused", null])],
  ["finish", await finish(A, NOBODY, null, "wrong")],
  ["set", await set(A, "preset", "football", "wrong")],
  ["files gone", await rpc("account_photo_files_gone", ["", A, []])],
]) eq(r, { r: "unavailable" }, `${what}: the server key or nothing`);
eq(await rpc("account_photo_ready", [K]), { r: "ok", paused: false }, "ready, uploads on");
eq(await userPhoto(A), null, "nothing changed");

// Start: a WebP or JPEG between 1,000 bytes and 512 KB, for an account that exists.
for (const [user, ext, bytes, what] of [[A, "png", 40000, "png"], [A, null, 40000, "no type"], [A, "webp", 999, "too small"], [A, "webp", 524289, "too big"],
  [A, "webp", null, "no size"], [NOBODY, "webp", 40000, "no such account"], [null, "webp", 40000, "no account"]])
  eq(await start(user, ext, bytes), { r: "bad" }, `start refused: ${what}`);
eq((await one("select count(*)::int n from public.user_photos")).n, 0, "no tickets from refused calls");

const s1 = await start();
eq([s1.r, s1.bucket], ["ok", "avatars"], "a ticket");
ok(/^[0-9a-f]{24}\.webp$/.test(s1.path), `a random path: ${s1.path}`);
const s1j = await start(A, "jpg", 30000);
ok(/^[0-9a-f]{24}\.jpg$/.test(s1j.path) && s1j.path !== s1.path, "another, JPEG");
eq((await photo(s1.id)).status, "uploading", "an open ticket");

// The storage gate: only the issued path, inside 10 minutes; nothing up is ever readable or removable.
const name = s1.path.replace(/\.webp$/, "");
eq(await okObj(s1.path, "insert"), true, "issued path");
eq(await okObj(`${name}.jpg`, "insert"), false, "another type");
eq(await okObj(`${"0".repeat(24)}.webp`, "insert"), false, "a name never issued");
eq(await okObj(`u/${s1.path}`, "insert"), false, "in a folder");
eq(await okObj(s1.path.toUpperCase(), "insert"), false, "case matters");
eq(await okObj(null, "insert"), false, "null");
eq(await okObj(s1.path, "select"), false, "not readable (so not listable) while open");
eq(await okObj(s1.path, "delete"), false, "not removable while uploading");
eq(await okObj(s1.path, "update"), false, "no other operation");

// The policies, as anon (the server uploads with the public key).
eq(await asAnon(() => fails(putFile(s1.path))), null, "anon uploads to the issued path");
ok(/row-level security/i.test(await asAnon(() => fails(putFile(`${"1".repeat(24)}.webp`)))), "but nowhere else");
ok(/row-level security/i.test(await asAnon(() => fails(putFile(s1j.path, 30000, "image/jpeg", "turf-photos")))), "and only in avatars");
eq(await asAnon(() => q(`select name from storage.objects where bucket_id = 'avatars'`)), [], "nobody can list the bucket");
ok(/duplicate key|unique/i.test(await asAnon(() => fails(putFile(s1.path, 99999)))), "a second upload to the same path is refused");
eq((await asAnon(() => db.query(`update storage.objects set metadata = '{}' where name = $1`, [s1.path]))).affectedRows ?? 0, 0, "a file can't be overwritten");

// Finish: exactly the size and type checked, by the account that started it.
eq(await finish(B, s1.id), { r: "expired" }, "another account's ticket");
eq(await finish(A, NOBODY), { r: "expired" }, "no such ticket");
eq(await finish(A, s1j.id), { r: "missing" }, "nothing uploaded yet");
await putFile(s1j.path, 30001, "image/jpeg");
eq(await finish(A, s1j.id), { r: "missing" }, "another size");
const s1w = await start(A, "webp", 41000);
await putFile(s1w.path, 41000, "image/jpeg");
eq(await finish(A, s1w.id), { r: "missing" }, "another type");
eq(await userPhoto(A), null, "still nothing changed");

const VERDICT = { usable: true, shows: "person", problem: "none", note: "Looks good" };
const f1 = await finish(A, s1.id, JSON.stringify(VERDICT));
eq([f1.r, f1.profile_image_url, f1.files], ["ok", BASE + s1.path, []], "the photo is up, with the profile");
eq(await photo(s1.id), { status: "live", url: BASE + s1.path, verdict: VERDICT, gone: false }, "live, with the check's answer");
eq(await userPhoto(A), BASE + s1.path, "on the account");
eq(await copies(A), { games: [BASE + s1.path, BASE + s1.path], requests: [BASE + s1.path, BASE + s1.path] }, "and on every game and request of theirs");
eq((await copies(B)).games, [GPHOTO], "nobody else's");
eq(await finish(A, s1.id), { r: "expired" }, "a ticket is finished once");
eq(await okObj(s1.path, "delete"), false, "a photo that is up can't be removed");
eq(await asAnon(() => q(`select name from storage.objects where bucket_id = 'avatars'`)), [], "or listed");

// A new photo: the old one is replaced and its file listed for removal.
const s2 = await start();
await putFile(s2.path);
const f2 = await finish(A, s2.id);
eq([f2.r, f2.profile_image_url], ["ok", BASE + s2.path], "the new photo is up");
eq(f2.files, [{ id: s1.id, path: s1.path }], "the old file, to remove");
eq((await photo(s1.id)).status, "replaced", "the old one replaced");
eq(await okObj(s1.path, "select"), true, "its file can be read");
eq(await okObj(s1.path, "delete"), true, "and removed");
eq((await asAnon(() => db.query(`delete from storage.objects where bucket_id = 'avatars' and name = $1`, [s1.path]))).affectedRows, 1, "anon removes it");
eq((await asAnon(() => db.query(`delete from storage.objects where bucket_id = 'avatars' and name = $1`, [s2.path]))).affectedRows ?? 0, 0, "but not the one up");
eq(await gone(A, [s1.id, s2.id]), { r: "ok", gone: 1 }, "only the replaced one is marked gone");
eq((await photo(s1.id)).gone, true, "gone");
eq((await set(A, "preset", "cricket-ball")).files, [{ id: s2.id, path: s2.path }], "only the photo it just replaced is left to remove");

// Avatars: the photo they replace is listed; the id becomes /avatars/<id>.svg.
eq(await userPhoto(A), "/avatars/cricket-ball.svg", "an avatar");
eq((await photo(s2.id)).status, "replaced", "the photo it replaced");
eq(await copies(A), { games: ["/avatars/cricket-ball.svg", "/avatars/cricket-ball.svg"], requests: ["/avatars/cricket-ball.svg", "/avatars/cricket-ball.svg"] }, "on games and requests too");
for (const v of ["Football", "foot ball", "../x", "f", "a".repeat(32), "", null, "football.svg"])
  eq(await set(A, "preset", v), { r: "bad" }, `not an avatar id: ${v}`);
eq(await set(A, "other", "football"), { r: "bad" }, "not a kind");
eq(await set(NOBODY, "preset", "football"), { r: "bad" }, "no such account");
eq(await userPhoto(A), "/avatars/cricket-ball.svg", "unchanged by refused calls");

// The Google photo: only a Google photo address.
for (const v of ["http://lh3.googleusercontent.com/a/x=s96-c", "https://evil.example/a.png", "https://lh3.googleusercontent.com.evil.in/a",
  "https://lh3.googleusercontent.com/a/x\" onerror=", "javascript:alert(1)", "https://lh3.googleusercontent.com/" + "a".repeat(1000), null])
  eq(await set(B, "google", v), { r: "bad" }, `not a Google photo: ${String(v).slice(0, 40)}`);
const G256 = "https://lh3.googleusercontent.com/a/ACg8ocKx_Ravi-photo=s256-c";
eq((await set(B, "google", G256)).profile_image_url, G256, "the Google photo, chosen");
eq((await copies(B)).games, [G256], "on Ravi's game");

// Remove: nothing anywhere, and an uploaded photo's file listed.
const s3 = await start();
await putFile(s3.path);
await finish(A, s3.id);
const r0 = await set(A, "none");
eq([r0.r, r0.profile_image_url], ["ok", null], "removed");
eq(r0.files, [{ id: s2.id, path: s2.path }, { id: s3.id, path: s3.path }], "both photos' files, to remove");
eq((await photo(s3.id)).status, "removed", "marked removed");
eq(await copies(A), { games: ["", ""], requests: [null, null] }, "and off every game and request");
const again = await set(A, "none");
eq([again.r, again.profile_image_url, again.files], ["ok", null, r0.files], "removing again changes nothing");

// Drop: the check said no, or couldn't run (never uploaded), or the upload failed.
const s4 = await start();
const REFUSED = { usable: false, shows: "other", problem: "sexual", note: "Not allowed" };
eq(await drop(A, s4.id, "refused", JSON.stringify(REFUSED)), { r: "ok" }, "refused");
eq(await photo(s4.id), { status: "refused", url: null, verdict: REFUSED, gone: false }, "kept with its answer");
eq(await okObj(s4.path, "insert"), false, "no upload after");
eq(await drop(A, s4.id, "refused"), { r: "bad" }, "once");
const s5 = await start();
eq(await drop(B, s5.id, "unchecked"), { r: "bad" }, "another account's");
eq(await drop(A, s5.id, "live"), { r: "bad" }, "not an outcome");
eq(await drop(A, s5.id, "unchecked"), { r: "ok" }, "unchecked");
const s6 = await start();
eq(await drop(A, s6.id, "expired"), { r: "ok" }, "the upload failed");
eq((await set(A, "none")).files.map((f) => f.id), [s2.id, s3.id, s6.id], "its file, if any, is listed; refused and unchecked ones never had one");

// Tickets run out: 10 minutes to upload, 15 to finish, then expired and listed.
const s7 = await start();
await ago(s7.id, 11);
eq(await okObj(s7.path, "insert"), false, "no upload after 10 minutes");
await putFile(s7.path);
await ago(s7.id, 16);
eq(await finish(A, s7.id), { r: "expired" }, "no finish after 15");
eq((await set(A, "none")).files.map((f) => f.id).includes(s7.id), true, "expired by the next change, and listed");
eq((await photo(s7.id)).status, "expired", "expired");

// Ten a day, refused and unchecked ones too.
eq((await one("select count(*)::int n from public.user_photos where user_id = $1", [A])).n, 9, "nine so far");
eq((await start()).r, "ok", "the tenth");
eq(await start(), { r: "limit" }, "the eleventh is refused");
await q(`update public.user_photos set created_at = created_at - interval '1 day' where user_id = $1 and id = $2`, [A, s1.id]);
eq((await start()).r, "ok", "a day later there is room again");
eq((await start(B)).r, "ok", "each account has its own");

// The pause switch: no uploads, avatars still work.
await db.exec(`create or replace function private.user_photos_paused() returns boolean language sql stable set search_path = '' as $$ select true $$;`);
const s8 = (await q("select name, ext from public.user_photos where user_id = $1 and status = 'uploading' order by created_at desc limit 1", [B]))[0];
eq(await rpc("account_photo_ready", [K]), { r: "ok", paused: true }, "ready says paused");
eq(await start(B), { r: "paused" }, "start refused");
eq(await okObj(`${s8.name}.${s8.ext}`, "insert"), false, "an open ticket takes no upload");
eq((await set(B, "preset", "whistle")).r, "ok", "an avatar still works");
await db.exec(`create or replace function private.user_photos_paused() returns boolean language sql stable set search_path = '' as $$ select false $$;`);

// A new Google account starts without the Google photo; one that has it keeps it.
const NEWG = "33333333-3333-4333-8333-333333333333";
eq((await one("select private.google_make_account($1, 'gina@x.in', 'Gina', $2) id", [NEWG, GPHOTO])).id, NEWG, "made");
eq(await one("select name, email, profile_image_url from public.users where id = $1", [NEWG]), { name: "Gina", email: "gina@x.in", profile_image_url: null }, "no photo until chosen");
eq((await one("select private.google_make_account($1, 'gina@x.in', 'Gina', $2) id", [NEWG, GPHOTO])).id, NEWG, "again: the same row");
const HELD = "44444444-4444-4444-8444-444444444444";
await one("select private.google_make_account($1, 'RAVI@x.in', null, null) id", [HELD]);
eq(await one("select name, email from public.users where id = $1", [HELD]), { name: "RAVI", email: null }, "an email another row holds is left off, as before");
eq((await one("select count(*)::int n from private.reports where kind = 'google_email_held' and detail ->> 'auth_uid' = $1", [HELD])).n, 1, "and reported");

console.log(`profile_photos: ${passed} checks passed`);
