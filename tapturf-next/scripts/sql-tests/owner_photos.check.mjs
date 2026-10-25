// Applies 20261025_turf_claimed.sql (for the cache trigger on turfs, as
// production has it), then 20261025_owner_photos.sql and
// 20261025_owner_photos_policies.sql (each twice) to an in-memory Postgres
// (PGlite) with stand-ins for Supabase's roles, auth, the storage schema,
// pg_net, pg_cron, the cache queue and the sign-in helpers, and checks
// owner photo uploads: tickets, the storage policies, finish, the check
// before a photo shows, cover, remove, the caps, the minute job and the
// sweep, a claim taken away, and the admin side. Never touches a real
// database.
// Sign-ins are "key:<user key>" tokens (_caller_key's stand-in); the server
// key is 'server-key'; the site owner's token is 'site-owner'.
// Run after npm run test:photos (it compares the URL rule with lib/utils/images.ts):
// PGLITE=<pglite dist/index.js> node scripts/sql-tests/owner_photos.check.mjs supabase/migrations/20261025_turf_claimed.sql supabase/migrations/20261025_owner_photos.sql supabase/migrations/20261025_owner_photos_policies.sql
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { normalizeImageUrl } from "../../.test-out/photos/lib/utils/images.js";

const FILES = process.argv.slice(2);
assert.equal(FILES.length, 3, "pass 20261025_turf_claimed.sql, 20261025_owner_photos.sql and 20261025_owner_photos_policies.sql");
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
let passed = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };
const ok = (c, what) => { assert.ok(c, what); passed++; };

await db.exec(`
create role anon; create role authenticated;
create schema private; create schema extensions; create schema storage; create schema auth; create schema net; create schema cron;
-- pgcrypto's gen_random_bytes (PGlite has no pgcrypto): bytes from the built-in uuid generator.
create function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as
  $$ select substring(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()) from 1 for n) $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
create table net.posts (id bigserial primary key, url text, headers jsonb, body jsonb, at timestamptz default now());
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
  returns bigint language sql as $$ insert into net.posts (url, headers, body) values (url, headers, body) returning id $$;
create table cron.jobs (name text primary key, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
  $$ insert into cron.jobs values (job_name, schedule, command) on conflict (name) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', 'server-key'), ('revalidate', 'rv-secret');
create function private.account_key_ok(p_key text) returns boolean language sql stable security definer set search_path = '' as
  $$ select p_key is not null and p_key = (select s.value from private.app_secrets s where s.name = 'account') $$;
create function public._caller_key(p_token text) returns text language sql stable as
  $$ select case when p_token like 'key:%' then substr(p_token, 5) end $$;
create function public._is_admin_key(p_key text) returns boolean language sql immutable as $$ select p_key = 'e:admin@test.in' $$;
create table public.turf_owners (turf_id uuid not null, user_key text not null, status text not null, via text default 'admin', role text,
  created_at timestamptz default now(), decided_at timestamptz, primary key (turf_id, user_key));
create function public._can_manage(p_key text, p_turf_id uuid) returns boolean language sql stable as
  $$ select p_key is not null and (public._is_admin_key(p_key) or exists (select 1 from public.turf_owners o where o.turf_id = p_turf_id and o.user_key = p_key and o.status = 'active')) $$;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as $$ select coalesce(p_firebase_token = 'site-owner', false) $$;
create table public.turfs (id uuid primary key, name text, slug text, city text, area text, is_active boolean default true,
  images jsonb default '[]', cover_image text, image_review jsonb, cover_reviewed_at timestamptz,
  morning_price integer, description text, updated_at timestamptz default now());
create table public.turf_edit_log (id bigserial primary key, turf_id uuid not null, user_key text not null, before jsonb not null, after jsonb not null, created_at timestamptz not null default now());
-- The cache queue (20261020_cache_queue.sql): mark_dirty notes each key with its transaction, and the
-- edit log's statement trigger makes this transaction's keys urgent, as production does.
create table private.cache_dirty (key text, urgent boolean, marked_xid xid8 not null default pg_current_xact_id());
create function private.mark_dirty(p_keys text[], p_urgent boolean default false) returns void language sql as
  $$ insert into private.cache_dirty (key, urgent) select distinct x, p_urgent from unnest(p_keys) x where x is not null $$;
create function private.list_key(p_city text) returns text language sql immutable as
  $$ select 'list:' || case when p_city ~ '^[a-z][a-z-]{1,30}$' then p_city else 'all' end $$;
create function private.mark_owner_edit_urgent() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update private.cache_dirty set urgent = true where marked_xid = pg_current_xact_id() and not urgent;
  return null;
end;
$$;
create trigger turf_edit_log_cache_urgent after insert on public.turf_edit_log for each statement execute function private.mark_owner_edit_urgent();
-- Supabase storage: RLS on, anon and authenticated hold the table privileges, policies decide.
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb, owner uuid,
  owner_id text default nullif(current_setting('test.uid', true), ''), archived_at timestamptz, is_delete_marker boolean default false,
  created_at timestamptz default now(), unique (bucket_id, name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
`);

const sqls = FILES.map((f) => fs.readFileSync(f, "utf8"));
for (const s of sqls.slice(1)) {
  assert.doesNotMatch(s, /\bdrop\b|\bdelete\s+from\b|\btruncate\b/i, "nothing dropped or deleted");
  passed++;
  assert.doesNotMatch(s, /[—–]/, "no em or en dashes");
  passed++;
}

await db.exec(sqls[0]);
await db.exec(`create trigger turfs_mark_cache_dirty after insert or update or delete on public.turfs for each row execute function private.mark_turf_dirty();`);
for (let i = 0; i < 2; i++) for (const s of sqls.slice(1)) await db.exec(s); // safe to run again
eq((await one(`select count(*)::int n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'tt owner photos %'`)).n, 3, "three storage policies, created once");
eq((await one(`select count(*)::int n from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'UPDATE'`)).n, 0, "no update policy");
eq((await one(`select count(*)::int n from pg_constraint where conrelid = 'public.turf_owner_photos'::regclass and contype = 'c'`)).n, 0, "no CHECK constraints");
eq(await q("select name, schedule, command from cron.jobs"), [{ name: "owner-photos-sweep", schedule: "* * * * *", command: "select private.owner_photos_tick()" }], "the minute job, scheduled once");
ok(/lock_timeout = '2s'/.test(sqls[2]), "the policies wait 2 s at most for their lock");

const BASE = "https://hwfsbpzercuoshodmnuf.supabase.co/storage/v1/object/public/turf-photos/";
const T = "aaaaaaaa-0000-4000-8000-000000000001"; // pune, three scraped photos
const T2 = "aaaaaaaa-0000-4000-8000-000000000002"; // nashik, no photos, no cover
const OFF = "aaaaaaaa-0000-4000-8000-000000000009"; // inactive
const OWNER = "key:p:9800000001", OWNER_KEY = "p:9800000001";
const PENDING = "key:e:pending@x.in", STRANGER = "key:e:someone@x.in", ADMIN = "key:e:admin@test.in";
const UID = "cccccccc-0000-4000-8000-000000000001"; // a Google sign-in's Supabase user
const S = ["https://lh3.googleusercontent.com/p/one=w1600-h1200", "https://playo.gumlet.io/two.jpg", "https://lh3.googleusercontent.com/p/three=w1600-h1200"];
await q(`insert into public.turfs (id, name, slug, city, images, cover_image, morning_price, description) values
  ($1, 'Green Arena', 'green-arena', 'pune', $2, $3, 800, 'Floodlit 5-a-side'),
  ($4, 'Empty Box', 'empty-box', 'nashik', '[]', null, null, null)`, [T, JSON.stringify(S), S[0], T2]);
await q(`insert into public.turfs (id, name, slug, city, is_active, images) values ($1, 'Off', 'off', 'pune', false, '[]')`, [OFF]);
await q(`insert into public.turf_owners (turf_id, user_key, status) values ($1, $2, 'active'), ($1, 'e:pending@x.in', 'pending')`, [T, OWNER_KEY]);

const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const turf = (id = T) => one("select images, cover_image, image_review, to_jsonb(t) - array['images', 'cover_image', 'updated_at'] as rest from public.turfs t where id = $1", [id]);
const photo = (id) => one("select * from public.turf_owner_photos where id = $1", [id]);
const dirty = async () => { const r = await q("select key, urgent from private.cache_dirty order by key"); await q("truncate private.cache_dirty"); return r; };
const lastLog = () => one("select turf_id, user_key, before, after from public.turf_edit_log order by id desc limit 1");
const okObj = async (path, op) => (await one("select public.owner_photo_object_ok($1, $2) r", [path, op])).r;
const start = (token, turfId, count, ext = "webp", hashes = null) => rpc("owner_photo_start", [token, turfId, count, ext, hashes]);
const FULL = 250000, CARD = 50000;
const sizesOf = (items, full = FULL, card = CARD) => items.flatMap(() => [full, card]);
const finish = (token, turfId, ids, sizes = ids.flatMap(() => [FULL, CARD])) => rpc("owner_photo_finish", [token, turfId, ids, sizes]);
const meta = (size, mimetype = "image/webp") => JSON.stringify({ size, mimetype });
const putFile = (path, size = FULL, mimetype = "image/webp") => q(`insert into storage.objects (bucket_id, name, metadata) values ('turf-photos', $1, $2)`, [path, meta(size, mimetype)]);
const putBoth = async (item, full = FULL, card = CARD, mimetype = "image/webp") => { await putFile(item.path, full, mimetype); await putFile(item.card_path, card, mimetype); };
const asAnon = async (fn) => { await q("set role anon"); try { return await fn(); } finally { await q("reset role"); } };
const fails = async (p) => { try { await p; return null; } catch (e) { return String(e.message ?? e); } };
const verdicts = (turfId, list) => rpc("owner_photo_verdicts", ["server-key", turfId, JSON.stringify(list)]);
const judged = (id, usable, note = usable ? "Clear shot of the turf" : "A price list") => ({ id, outcome: "judged", usable, quality: usable ? 4 : 1, shows: usable ? "pitch" : "logo_or_poster", note });
const tick = () => q("select private.owner_photos_tick()");
const posts = async () => { const r = await q("select url, headers->>'x-revalidate-secret' as secret from net.posts order by id"); await q("truncate net.posts"); return r; };
await dirty();

// Grants: the functions are open to the API, the table and the helpers are not.
for (const f of ["owner_photo_start(text,uuid,integer,text,text[])", "owner_photo_finish(text,uuid,uuid[],bigint[])", "owner_photo_cover(text,uuid,text)",
  "owner_photo_remove(text,uuid,uuid)", "owner_photos(text,uuid)", "owner_photos_to_check(text,uuid,boolean)", "owner_photo_verdicts(text,uuid,jsonb)",
  "owner_photos_sweep_list(text)", "owner_photo_files_gone(text,uuid[])",
  "admin_owner_photos(text)", "admin_owner_photo_restore(text,uuid)", "owner_photo_object_ok(text,text)"])
  eq((await one(`select has_function_privilege('anon', 'public.${f}', 'execute') a`)).a, true, `${f} callable`);
for (const f of ["owner_photos_tick()", "owner_photos_publish(uuid,uuid[])", "owner_photos_hold(uuid,uuid[])", "owner_photos_paused()"])
  eq((await one(`select has_function_privilege('anon', 'private.${f}', 'execute') a`)).a, false, `private.${f} closed`);
eq((await one(`select has_table_privilege('anon', 'public.turf_owner_photos', 'select') a`)).a, false, "the table is closed");
eq((await one(`select has_table_privilege('authenticated', 'public.turf_owner_photos', 'insert') a`)).a, false, "and closed to writes");

// The URL rule matches the app's (the cover pass reviews normalised URLs).
for (const u of [S[0], "https://lh3.googleusercontent.com/p/AF1Qip=s96-k-no", "https://lh5.googleusercontent.com/a/b/TOKEN=w32-h32-p-k-no?x=1#f", "https://LH3.googleusercontent.com/p/z",
  "https://drive.google.com/file/d/1AbC_d-9/view?usp=sharing", "https://drive.google.com/open?id=XYZ123&usp=x", "https://drive.google.com/thumbnail?id=Q&sz=w2000",
  "https://drive.google.com/drive/folders/abc", "https://playo.gumlet.io/two.jpg", BASE + "owner/x/y.webp"])
  eq((await one("select private.norm_image_url($1) v", [u])).v, normalizeImageUrl(u), `same rule: ${u}`);

// Only managers.
for (const who of [STRANGER, PENDING, null]) {
  eq(await start(who, T, 1), { error: "forbidden" }, `start: ${who ?? "signed out"}`);
  eq(await finish(who, T, ["bbbbbbbb-0000-4000-8000-000000000001"]), { error: "forbidden" }, `finish: ${who ?? "signed out"}`);
  eq(await rpc("owner_photo_cover", [who, T, S[1]]), { error: "forbidden" }, `cover: ${who ?? "signed out"}`);
  eq(await rpc("owner_photo_remove", [who, T, "bbbbbbbb-0000-4000-8000-000000000001"]), { error: "forbidden" }, `remove: ${who ?? "signed out"}`);
  eq(await rpc("owner_photos", [who, T]), { error: "forbidden" }, `list: ${who ?? "signed out"}`);
}
eq(await start(OWNER, T2, 1), { error: "forbidden" }, "another turf");
eq(await start(ADMIN, OFF, 1), { error: "not_found" }, "an inactive turf");
for (const [n, ext, hashes, what] of [[0, "webp", null, "none"], [11, "webp", null, "eleven"], [1, "png", null, "png"], [1, null, null, "no type"], [2, "webp", ["a"], "hashes that don't match the count"]])
  eq(await start(OWNER, T, n, ext, hashes), { error: "bad_request" }, `bad request: ${what}`);
eq((await one("select count(*)::int n from public.turf_owner_photos")).n, 0, "no tickets from refused calls");

// Tickets: random paths in the mirror's naming.
const PATH = /^owner\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{24}(-card)?\.(webp|jpg)$/;
const s1 = await start(OWNER, T, 3, "webp", ["h1", "h2", "h3"]);
eq([s1.ok, s1.bucket, s1.items.length], [true, "turf-photos", 3], "three tickets");
const [a, b, c] = s1.items;
for (const it of s1.items) {
  ok(PATH.test(it.path) && PATH.test(it.card_path), `paths match: ${it.path}`);
  ok(it.path.startsWith(`owner/${T}/`) && it.path.endsWith(".webp"), "under the turf, webp");
  eq(it.card_path, it.path.replace(/\.webp$/, "-card.webp"), "the card sits next to it");
}
eq(new Set(s1.items.map((i) => i.path)).size, 3, "all different");
eq((await photo(a.id)).status, "uploading", "an open ticket");

// The storage gate: only the issued paths, inside the window; an upload in progress is never readable or listable.
const name = a.path.split("/")[2].replace(/\.webp$/, "");
eq(await okObj(a.path, "insert"), true, "issued path");
eq(await okObj(a.card_path, "insert"), true, "issued card path");
eq(await okObj(a.path, "select"), false, "not readable (so not listable) while open");
eq(await okObj(a.path, "delete"), false, "not removable while uploading");
eq(await okObj(a.path.replace(".webp", ".jpg"), "insert"), false, "another type");
eq(await okObj(`owner/${T2}/${name}.webp`, "insert"), false, "another turf");
eq(await okObj(`owner/${T}/${"0".repeat(24)}.webp`, "insert"), false, "a name never issued");
eq(await okObj(`${T}/${name}.webp`, "insert"), false, "outside owner/");
eq(await okObj(a.path.toUpperCase(), "insert"), false, "case matters");
eq(await okObj(null, "insert"), false, "null");
eq(await okObj(a.path, "update"), false, "no other operation");

// The policies, as anon (a phone sign-in has no Supabase session).
eq(await asAnon(() => fails(putBoth(a))), null, "anon uploads to the issued paths");
ok(/row-level security/i.test(await asAnon(() => fails(putFile(`owner/${T}/${"1".repeat(24)}.webp`)))), "but nowhere else");
ok(/row-level security/i.test(await asAnon(() => fails(q(`insert into storage.objects (bucket_id, name, metadata) values ('profile-photos', $1, '{}')`, [b.path])))), "and only in turf-photos");
eq(await asAnon(() => q(`select name from storage.objects where bucket_id = 'turf-photos'`)), [], "a stranger listing the folder sees nothing in progress");
ok(/duplicate key|unique/i.test(await asAnon(() => fails(putFile(a.path, 999999)))), "a second upload to the same path is refused");
eq((await asAnon(() => db.query(`update storage.objects set metadata = '{}' where name = $1`, [a.path]))).affectedRows ?? 0, 0, "a file can't be overwritten");
eq((await asAnon(() => db.query(`delete from storage.objects where name = $1`, [a.path]))).affectedRows ?? 0, 0, "or removed while uploading");

// Finish: exact sizes, the right type, the card smaller; b has no files, c has a png card.
await putFile(c.path);
await putFile(c.card_path, CARD, "image/png");
const before = await turf();
await dirty();
eq(await finish(OWNER, T, [a.id, b.id], [FULL]), { error: "bad_request" }, "two sizes per photo");
eq(await finish(OWNER, T, [a.id], [FULL + 1, CARD]), { ok: true, checking: [], missing: [a.id] }, "a size that doesn't match is not this photo");
eq(await finish(OWNER, T, [a.id], [CARD, CARD]), { ok: true, checking: [], missing: [a.id] }, "the card must be smaller");
const f1 = await finish(OWNER, T, [a.id, b.id, c.id]);
eq([f1.ok, f1.checking, [...f1.missing].sort()], [true, [a.id], [b.id, c.id].sort()], "one in; missing files and a wrong type are reported");
let pa = await photo(a.id);
eq([pa.status, pa.url, pa.full_bytes, pa.card_bytes, !!pa.finished_at], ["checking", BASE + a.path, FULL, CARD, true], "being checked, with its sizes");
eq(await turf(), before, "not on the page before the check");
eq(await dirty(), [], "nothing to refresh yet");
eq(await okObj(a.path, "insert"), false, "the gate closes once uploaded");
eq(await okObj(a.path, "select"), false, "and it still can't be read or listed");
eq(await finish(OWNER, T, [a.id]), { ok: true, checking: [], missing: [a.id] }, "finishing twice does nothing");

// A Google sign-in's files must be its own uploads.
await q("select set_config('test.uid', $1, false)", [UID]);
const sg = await start(ADMIN, T2, 2);
await q("select set_config('test.uid', '', false)");
await putBoth(sg.items[0]); // uploaded without that session
await q("select set_config('test.uid', $1, false)", [UID]);
await putBoth(sg.items[1]);
eq((await finish(ADMIN, T2, sg.items.map((i) => i.id))).checking, [sg.items[1].id], "only the files this session uploaded");
await q("select set_config('test.uid', '', false)");
await q("update public.turf_owner_photos set status = 'removed', files_gone_at = now() where id = any($1)", [sg.items.map((i) => i.id)]);

// Too big, too small, another manager's ticket, an expired ticket, a deleted file.
const s2 = await start(OWNER, T, 4);
const [d, e, g, x] = s2.items;
await putBoth(d, 4_000_000, CARD);
eq((await finish(OWNER, T, [d.id], [4_000_000, CARD])).missing, [d.id], "a file over 3 MB is refused");
await putBoth(e, FULL, 900);
eq((await finish(OWNER, T, [e.id], [FULL, 900])).missing, [e.id], "a file under 1 KB is refused");
await putBoth(g);
eq((await finish(ADMIN, T, [g.id])).missing, [g.id], "only the uploader finishes a ticket");
await q("update public.turf_owner_photos set created_at = now() - interval '31 minutes' where id = $1", [g.id]);
eq(await okObj(g.path, "insert"), false, "a ticket stops taking uploads after 30 minutes");
eq(await okObj(g.path, "select"), false, "its files stay while it can still be finished");
eq((await finish(OWNER, T, [g.id])).checking, [g.id], "an upload that ended in time is finished in the 5 minutes after");
await q("update public.turf_owner_photos set status = 'removed', files_gone_at = now() where id = $1", [g.id]);
await q("update public.turf_owner_photos set created_at = now() - interval '36 minutes' where id = $1", [e.id]);
eq((await finish(OWNER, T, [e.id], [FULL, CARD])).missing, [e.id], "after 35 minutes a ticket can't be finished");
eq(await okObj(e.path, "delete"), true, "and its files can go");
await putBoth(x);
await q("update storage.objects set is_delete_marker = true where name = $1", [x.card_path]);
eq((await finish(OWNER, T, [x.id])).missing, [x.id], "a delete marker is not a file");
await q("update public.turf_owner_photos set status = 'expired' where status = 'uploading'");

// The check: server key only; it claims photos so two checks never judge one.
eq(await rpc("owner_photos_to_check", ["wrong", T]), { error: "forbidden" }, "to_check: a bad key");
eq(await rpc("owner_photos_to_check", [null, T]), { error: "forbidden" }, "to_check: no key");
eq(await verdicts(T, []).then(() => rpc("owner_photo_verdicts", ["wrong", T, "[]"])), { error: "forbidden" }, "verdicts: a bad key");
let tc = await rpc("owner_photos_to_check", ["server-key", T]);
eq(tc.items, [{ id: a.id, url: BASE + a.path, card_url: BASE + a.card_path }], "the photo and its card");
eq((await rpc("owner_photos_to_check", ["server-key", T])).items, [], "claimed: a second check gets nothing");
eq((await rpc("owner_photos_to_check", ["server-key", T, true])).items.length, 1, "admin's Check now takes it anyway");

// A good photo goes on the page.
await dirty();
eq(await verdicts(T, [judged(a.id, true)]), { ok: true, checked: 1, live: [a.id], held: [] }, "judged good");
let after = await turf();
eq(after.images, [S[0], BASE + a.path, S[1], S[2]], "right after the first photo");
eq(after.cover_image, S[0], "the cover stays");
eq(after.rest, before.rest, "nothing but photo columns changed (the old webhook skips it)");
eq(await dirty(), [{ key: "list:pune", urgent: true }, { key: "turf:green-arena", urgent: true }], "the city's lists and the page, urgent");
eq(await lastLog(), { turf_id: T, user_key: OWNER_KEY, before: { photos_added: [] }, after: { photos_added: [BASE + a.path] } }, "edit log row, as the owner");
pa = await photo(a.id);
eq([pa.status, pa.verdict.usable, pa.verdict.outcome, !!pa.checked_at, !!pa.live_at], ["live", true, "judged", true, true], "live and checked");
eq(await verdicts(T, [judged(a.id, false)]), { ok: true, checked: 0, live: [], held: [] }, "a second verdict changes nothing");
eq(await rpc("owner_photo_verdicts", ["server-key", T, JSON.stringify({ id: a.id })]), { error: "bad_request" }, "verdicts must be a list");

// Several at once, in order; a turf with no cover gets one; the sweep's held and unreadable cases.
const s3 = await start(ADMIN, T2, 5, "jpg");
for (const it of s3.items) { ok(it.path.endsWith(".jpg") && it.card_path.endsWith("-card.jpg"), "jpg tickets"); await putBoth(it, 300000, 40000, "image/jpeg"); }
const [j0, j1, j2, j3, j4] = s3.items;
eq((await finish(ADMIN, T2, [j1.id, j0.id, j2.id, j3.id, j4.id], [300000, 40000, 300000, 40000, 300000, 40000, 300000, 40000, 300000, 40000])).checking.length, 5, "five in");
await dirty();
const v3 = await verdicts(T2, [judged(j1.id, true), judged(j0.id, true), judged(j2.id, false), { id: j3.id, outcome: "refused" }, { id: j4.id, outcome: "unreadable" },
  { id: j2.id, outcome: "judged", usable: true }, { id: "not-a-uuid", outcome: "judged", usable: false }, "nonsense", { id: j0.id, outcome: "made-up" }]);
eq([v3.checked, v3.live, v3.held], [5, [j1.id, j0.id], [j2.id, j3.id, j4.id]], "two good, three held; the rest ignored");
after = await turf(T2);
eq(after.images, [BASE + j1.path, BASE + j0.path], "in the order finished");
eq(after.cover_image, BASE + j1.path, "a turf with no cover gets the first new photo");
eq(await dirty(), [{ key: "list:nashik", urgent: true }, { key: "turf:empty-box", urgent: true }], "its refresh is urgent too");
eq([(await photo(j2.id)).verdict.note, (await photo(j3.id)).verdict.note, (await photo(j4.id)).verdict.note], ["A price list", "Kept for a manual look", "Could not read this photo"], "the reasons");
eq([(await photo(j3.id)).status, (await photo(j3.id)).verdict.usable], ["held", false], "a photo the judge won't look at is held, never passed");

// A photo we can't load is tried again, and held at the third try.
const s4 = await start(OWNER, T, 1);
await putBoth(s4.items[0]);
await finish(OWNER, T, [s4.items[0].id]);
const lid = s4.items[0].id;
for (let i = 1; i <= 2; i++) {
  eq(await verdicts(T, [{ id: lid, outcome: "unloadable" }]), { ok: true, checked: 0, live: [], held: [] }, `can't load it, try ${i}`);
  eq([(await photo(lid)).status, (await photo(lid)).check_tries], ["checking", i], "still waiting");
}
eq((await verdicts(T, [{ id: lid, outcome: "unloadable" }])).held, [lid], "held at the third");
eq((await photo(lid)).verdict.note, "Could not load this photo", "with why");

// A photo the judge answers about nothing is tried again too, and held: never up unchecked for good.
const s4b = await start(OWNER, T, 1);
await putBoth(s4b.items[0]);
await finish(OWNER, T, [s4b.items[0].id]);
const nid = s4b.items[0].id;
for (let i = 1; i <= 2; i++) eq((await verdicts(T, [{ id: nid, outcome: "unanswered" }])).held, [], `no answer, try ${i}`);
eq((await verdicts(T, [{ id: nid, outcome: "unanswered" }])).held, [nid], "held at the third");
eq([(await photo(nid)).verdict.note, (await photo(nid)).check_tries], ["Kept for a manual look", 3], "for a manual look");
await q("update public.turf_owner_photos set status = 'removed', files_gone_at = now() where id = $1", [nid]);

// Duplicates: a photo already live, held or being checked, or twice in one batch.
await q("update public.turf_owner_photos set src_hash = 'hheld' where id = $1", [lid]);
const s5 = await start(OWNER, T, 4, "webp", ["h1", "hheld", "h9", "h9"]);
eq([s5.items[0], s5.items[1], !!s5.items[2].id, s5.items[3]], [{ duplicate: true }, { duplicate: true }, true, { duplicate: true }], "already added, held, and twice in a batch");
await q("update public.turf_owner_photos set status = 'expired' where status = 'uploading'");

// Make cover.
eq(await rpc("owner_photo_cover", [OWNER, T, "https://elsewhere.example/x.jpg"]), { error: "bad_request" }, "only a photo on the turf");
await q(`update public.turfs set image_review = $2 where id = $1`, [T, JSON.stringify([{ url: S[2], usable: false, note: "A price list" }])]);
eq(await rpc("owner_photo_cover", [OWNER, T, S[2]]), { error: "hidden" }, "not a hidden photo");
const RAW = "https://lh3.googleusercontent.com/p/raw=s96";
await q(`update public.turfs set images = images || $2::jsonb, image_review = image_review || $3::jsonb where id = $1`,
  [T, JSON.stringify([RAW]), JSON.stringify([{ url: normalizeImageUrl(RAW), usable: false, note: "A logo" }])]);
eq(await rpc("owner_photo_cover", [OWNER, T, RAW]), { error: "hidden" }, "hidden under its normalised URL too");
await q(`update public.turfs set images = images - $2::text, image_review = $3 where id = $1`, [T, RAW, JSON.stringify([{ url: S[2], usable: false, note: "A price list" }])]);
await dirty();
eq(await rpc("owner_photo_cover", [OWNER, T, BASE + a.path]), { ok: true }, "an owner photo becomes the cover");
after = await turf();
eq([after.images, after.cover_image], [[BASE + a.path, S[0], S[1], S[2]], BASE + a.path], "first in the gallery, and the cover");
eq((await lastLog()).after, { cover_image: BASE + a.path }, "logged as a cover change");
eq((await lastLog()).before, { cover_image: S[0] }, "with the old cover");
eq((await dirty()).map((r) => r.urgent), [true, true], "urgent");
const logs = (await one("select count(*)::int n from public.turf_edit_log")).n;
eq(await rpc("owner_photo_cover", [OWNER, T, BASE + a.path]), { ok: true }, "again: nothing to do");
eq((await one("select count(*)::int n from public.turf_edit_log")).n, logs, "and nothing logged");
eq(await rpc("owner_photo_cover", [OWNER, T, S[1]]), { ok: true }, "a scraped photo can be the cover too");
eq((await turf()).images, [S[1], BASE + a.path, S[0], S[2]], "moved to the front");

// The AI cover pass keeps an owner's cover visible, leaves owner photos to their own check, and saves the rest.
ok(/not allowed/.test(await fails(q("select public.set_turf_cover($1, $2, '[]', null)", [T, S[0]]))), "set_turf_cover: site owner only");
await q("select public.set_turf_cover($1, $2, $3, 'site-owner')", [T, S[0], JSON.stringify([
  { url: S[0], usable: true }, { url: S[1], usable: false, note: "Blurry" }, { url: BASE + a.path, usable: false, note: "Could not load" }, { url: S[2], usable: false, note: "A price list" }])]);
after = await turf();
eq(after.cover_image, S[1], "the owner's cover is kept");
eq(after.image_review, [{ url: S[0], usable: true }, { url: S[2], usable: false, note: "A price list" }], "not flagged; owner photos left out; the rest saved");
await q("select public.set_turf_cover($1, $2, '[]', 'site-owner')", [T2, BASE + j0.path]);
eq((await turf(T2)).cover_image, BASE + j0.path, "a turf without an owner's choice takes the pass's cover");
await q("select public.set_turf_cover($1, null, '[]', 'site-owner')", [T2]);
eq((await turf(T2)).cover_image, BASE + j0.path, "no pick keeps the cover");

// What the Photos section gets.
let list = await rpc("owner_photos", [OWNER, T]);
eq([list.images, list.cover, list.flagged, list.max_mine, list.max_batch], [[S[1], BASE + a.path, S[0], S[2]], S[1], [{ url: S[2], note: "A price list" }], 20, 10], "photos, cover, hidden ones, limits");
eq(list.mine.map((m) => [m.id, m.status, m.checked]), [[lid, "held", true], [a.id, "live", true]], "the owner's photos, not tickets");

// Remove: off the page, the cover moves on (past a hidden photo), the files can go.
eq(await rpc("owner_photo_cover", [OWNER, T, BASE + a.path]), { ok: true }, "the owner photo is the cover again");
await q(`update public.turfs set image_review = $2 where id = $1`, [T, JSON.stringify([{ url: S[1], usable: false, note: "Blurry" }])]);
await dirty();
const r1 = await rpc("owner_photo_remove", [OWNER, T, a.id]);
eq(r1, { ok: true, paths: [a.path, a.card_path] }, "removed, with the paths to remove");
after = await turf();
eq([after.images, after.cover_image], [[S[1], S[0], S[2]], S[0]], "off the page; the first visible photo is the cover");
pa = await photo(a.id);
eq([pa.status, pa.removed_by], ["removed", OWNER_KEY], "marked removed");
eq(await lastLog(), { turf_id: T, user_key: OWNER_KEY, before: { photo_removed: null }, after: { photo_removed: BASE + a.path } }, "edit log row");
eq((await dirty()).every((r) => r.urgent), true, "urgent");
eq([await okObj(a.path, "delete"), await okObj(a.card_path, "select"), await okObj(a.path, "insert")], [true, true, false], "removable, never writable again");
eq((await asAnon(() => db.query(`delete from storage.objects where bucket_id = 'turf-photos' and name = any($1)`, [[a.path, a.card_path]]))).affectedRows, 2, "the browser removes both files");
eq(await rpc("owner_photo_remove", [OWNER, T, a.id]), { error: "not_found" }, "once");
eq(await rpc("owner_photo_remove", [OWNER, T, j0.id]), { error: "not_found" }, "only this turf's photos");
eq((await rpc("owner_photo_remove", [OWNER, T, lid])).ok, true, "a held photo can be removed");

// The owner's cover choice holds only while it is the cover: their photo is gone, so the pass may change it.
await q("select public.set_turf_cover($1, $2, $3, 'site-owner')", [T, S[2], JSON.stringify([{ url: S[0], usable: false, note: "A logo" }])]);
after = await turf();
eq([after.cover_image, after.image_review], [S[2], [{ url: S[0], usable: false, note: "A logo" }]], "the pass's cover, and its flag kept");
await q("select public.set_turf_cover($1, $2, '[]', 'site-owner')", [T, BASE + s4.items[0].path]);
eq((await turf()).cover_image, S[2], "a removed (or held) owner photo never becomes the cover");
await q("update public.turfs set cover_image = $2 where id = $1", [T, S[0]]);
await q(`update public.turfs set image_review = null where id = $1`, [T]);

// The 21st photo is refused, before any ticket; photos being checked count.
const fill = (n, key = OWNER_KEY, turfId = T, status = "live") =>
  q(`insert into public.turf_owner_photos (turf_id, user_key, name, ext, status, url, live_at)
     select $1, $2, encode(extensions.gen_random_bytes(12), 'hex'), 'webp', $3, 'https://x.in/' || g, now() from generate_series(1, $4) g`, [turfId, key, status, n]);
await fill(16);
await fill(2, OWNER_KEY, T, "checking");
await q("update public.turf_owner_photos set src_hash = 'hlive' where url = 'https://x.in/1'");
const tickets = async () => (await one("select count(*)::int n from public.turf_owner_photos where status = 'uploading'")).n;
eq(await start(OWNER, T, 3), { error: "too_many", left: 2 }, "two left");
eq(await tickets(), 0, "no tickets from a refused batch");
eq((await start(OWNER, T, 2)).items.length, 2, "the 19th and 20th");
eq(await start(OWNER, T, 1), { error: "too_many", left: 0 }, "the 21st is refused");
eq(await start(ADMIN, T, 1), { error: "too_many", left: 0 }, "for the site owner too");
eq(await start(OWNER, T, 2, "webp", ["hlive", "hlive"]), { ok: true, bucket: "turf-photos", items: [{ duplicate: true }, { duplicate: true }] }, "duplicates need no room");
await q("update public.turf_owner_photos set status = 'removed', files_gone_at = now() where url like 'https://x.in/%'");
await q("update public.turf_owner_photos set status = 'expired' where status = 'uploading'");

// 40 a day per account; the site owner is exempt.
const T3 = "aaaaaaaa-0000-4000-8000-000000000003";
await q(`insert into public.turfs (id, name, slug, city) values ($1, 'Third', 'third', 'pune')`, [T3]);
await q(`insert into public.turf_owners (turf_id, user_key, status) values ($1, $2, 'active')`, [T3, OWNER_KEY]);
const today = (await one("select count(*)::int n from public.turf_owner_photos where user_key = $1 and created_at > now() - interval '1 day'", [OWNER_KEY])).n;
await fill(39 - today, OWNER_KEY, T3, "expired");
eq((await start(OWNER, T3, 2)), { error: "daily_limit", left: 1 }, "one left today");
eq((await start(OWNER, T3, 1)).ok, true, "the 40th");
eq(await start(OWNER, T3, 1), { error: "daily_limit", left: 0 }, "40 started today, then no more");
await q("update public.turf_owner_photos set created_at = now() - interval '25 hours' where user_key = $1", [OWNER_KEY]);
eq((await start(OWNER, T3, 1)).ok, true, "a day later, more");
await fill(41, "e:admin@test.in", T2, "expired");
eq((await start(ADMIN, T3, 1)).ok, true, "the site owner has no daily cap");
await q("update public.turf_owner_photos set status = 'expired' where status = 'uploading'");
await q("update public.turf_owner_photos set files_gone_at = now() where status in ('removed', 'expired')");

// Make cover when the cover pass flagged every photo: the page shows them all, so it is allowed.
await q(`update public.turfs set images = '["https://x.in/p1.jpg", "https://x.in/p2.jpg"]', image_review = $2 where id = $1`,
  [T3, JSON.stringify([{ url: "https://x.in/p1.jpg", usable: false }, { url: "https://x.in/p2.jpg", usable: false }])]);
eq(await rpc("owner_photo_cover", [OWNER, T3, "https://x.in/p2.jpg"]), { ok: true }, "all flagged: any can be the cover");
await q(`update public.turfs set image_review = $2 where id = $1`, [T3, JSON.stringify([{ url: "https://x.in/p1.jpg", usable: false }])]);
eq(await rpc("owner_photo_cover", [OWNER, T3, "https://x.in/p1.jpg"]), { error: "hidden" }, "one hidden among visible ones: not that one");

// The minute job: tickets run out, the judge is down for 10 minutes, the sweep is asked to run.
await posts();
await q("truncate private.owner_photos_state");
await tick();
eq(await posts(), [], "nothing to do: no request");
const s6 = await start(OWNER, T, 3);
const [k0, k1, k2] = s6.items;
await putBoth(k0); await putBoth(k1);
eq((await finish(OWNER, T, [k0.id, k1.id])).checking, [k0.id, k1.id], "two waiting for the check");
await q("update public.turf_owner_photos set created_at = now() - interval '36 minutes' where id = $1", [k2.id]);
await tick();
eq((await photo(k2.id)).status, "expired", "an unused ticket expires");
eq(await posts(), [{ url: "https://www.tapturf.in/api/my/photos/sweep", secret: "rv-secret" }], "the sweep is asked to check, with the secret");
await tick();
eq(await posts(), [], "at most once a minute");
await q("update private.owner_photos_state set last_post = now() - interval '61 seconds'");
await rpc("owner_photos_to_check", ["server-key", T]); // a check took them and died
await tick();
eq(await posts(), [], "only the unused ticket's files left: not every minute");
await q("update private.owner_photos_state set last_post = now() - interval '16 minutes'");
await tick();
eq(await posts(), [{ url: "https://www.tapturf.in/api/my/photos/sweep", secret: "rv-secret" }], "files every 15 minutes");
await dirty();
await q("update public.turf_owner_photos set finished_at = now() - interval '11 minutes' where id = any($1)", [[k0.id, k1.id]]);
await q("select set_config('test.pause', 'yes', false)");
await q(`create or replace function private.owner_photos_paused() returns boolean language sql stable set search_path = '' as $$ select current_setting('test.pause', true) = 'yes' $$`);
await tick();
eq((await photo(k0.id)).status, "checking", "paused: nothing goes up unchecked");
eq([await okObj(k2.path, "insert"), (await start(OWNER, T, 1)).error, (await finish(OWNER, T, [k0.id])).error], [false, "paused", "paused"], "paused: no uploads, no tickets, no finish");
await q("select set_config('test.pause', 'no', false)");
await tick();
eq([(await photo(k0.id)).status, (await photo(k1.id)).status, (await photo(k0.id)).checked_at], ["live", "live", null], "the judge down 10 minutes: up, unchecked");
ok((await turf()).images.includes(BASE + k0.path), "on the page");
eq((await dirty()).every((r) => r.urgent), true, "urgent");
await q("update public.turf_owner_photos set next_check_at = null where id = any($1)", [[k0.id, k1.id]]);
tc = await rpc("owner_photos_to_check", ["server-key", T]);
eq(tc.items.map((i) => i.id).sort(), [k0.id, k1.id].sort(), "checked when the judge is back");
eq((await verdicts(T, [judged(k0.id, false), judged(k1.id, true)])).held, [k0.id], "and a bad one comes off the page");
ok(!(await turf()).images.includes(BASE + k0.path), "off");

// The sweep's list: turfs due a check, and files to remove.
eq(await rpc("owner_photos_sweep_list", ["wrong"]), { error: "forbidden" }, "sweep list: server key only");
await q("update public.turf_owner_photos set files_gone_at = null where id = $1", [a.id]);
const s7 = await start(OWNER, T, 1);
await putBoth(s7.items[0]);
await finish(OWNER, T, [s7.items[0].id]);
let sl = await rpc("owner_photos_sweep_list", ["server-key"]);
eq(sl.turfs, [T], "the turf with a photo due");
const gone = sl.files.find((f) => f.id === k2.id);
eq(gone, { id: k2.id, paths: [k2.path, k2.card_path] }, "an unused ticket's files");
ok(sl.files.some((f) => f.id === a.id), "a removed photo's files");
eq([await okObj(k2.path, "delete"), await okObj(k2.path, "select")], [true, true], "removable by the sweep");
eq(await rpc("owner_photo_files_gone", ["wrong", [k2.id]]), { error: "forbidden" }, "files_gone: server key only");
eq(await rpc("owner_photo_files_gone", ["server-key", [k2.id, k1.id]]), { ok: true, done: 1 }, "marked; a live photo is not");
sl = await rpc("owner_photos_sweep_list", ["server-key"]);
ok(!sl.files.some((f) => f.id === k2.id), "not listed again");

// A claim taken away holds that person's photos.
await verdicts(T, [judged(s7.items[0].id, true)]);
const s8 = await start(OWNER, T, 2);
await putBoth(s8.items[0]);
await finish(OWNER, T, [s8.items[0].id]);
await dirty();
await q("update public.turf_owners set status = 'revoked' where turf_id = $1 and user_key = $2", [T, OWNER_KEY]);
eq(await rpc("owner_photos", [OWNER, T]), { error: "forbidden" }, "revoked: no access");
eq([(await photo(k1.id)).status, (await photo(s7.items[0].id)).status, (await photo(s8.items[0].id)).status, (await photo(s8.items[1].id)).status],
  ["held", "held", "held", "expired"], "live and waiting photos held, the open ticket closed");
eq((await photo(k1.id)).verdict.note, "Claim taken away", "with why");
ok(!(await turf()).images.some((u) => u.includes("/owner/")), "none of them on the page");
eq((await dirty()).every((r) => r.urgent), true, "urgent");
eq((await photo(lid)).status, "removed", "a removed photo stays removed");
await q("update public.turf_owners set status = 'active' where turf_id = $1 and user_key = $2", [T, OWNER_KEY]);

// Admin.
eq(await rpc("admin_owner_photos", [null]), { error: "forbidden" }, "admin list: site owner only");
const al = await rpc("admin_owner_photos", ["site-owner"]);
ok(al.length > 0 && al.every((p) => ["checking", "live", "held", "removed"].includes(p.status)), "no tickets");
const waitingFirst = al.map((p) => ["held", "checking"].includes(p.status));
ok(waitingFirst.indexOf(false) === -1 || waitingFirst.lastIndexOf(true) < waitingFirst.indexOf(false), "held and waiting photos first, so none drops off");
const ah = al.find((p) => p.id === k1.id);
eq([ah.turf_name, ah.slug, ah.city, ah.user_key, ah.status, ah.bytes, ah.verdict.note], ["Green Arena", "green-arena", "pune", OWNER_KEY, "held", FULL, "Claim taken away"], "turf, who, status, size, note");
eq(await rpc("admin_owner_photo_restore", [null, k1.id]), { error: "forbidden" }, "restore: site owner only");
await dirty();
eq(await rpc("admin_owner_photo_restore", ["site-owner", s8.items[0].id]), { ok: true, turf_id: T }, "a photo held before its check, restored");
after = await turf();
eq(after.images[1], BASE + s8.items[0].path, "back right after the first photo");
const r8 = await photo(s8.items[0].id);
eq([r8.status, r8.verdict.override], ["live", true], "live, marked as the admin's call");
eq((await rpc("owner_photos_to_check", ["server-key", T, true])).items.map((i) => i.id).includes(r8.id), false, "the check leaves it alone");
eq((await dirty()).every((r) => r.urgent), true, "urgent");
eq(await rpc("admin_owner_photo_restore", ["site-owner", s8.items[0].id]), { error: "not_found" }, "only held photos");
eq(await rpc("admin_owner_photo_restore", ["site-owner", "bbbbbbbb-0000-4000-8000-00000000ffff"]), { error: "not_found" }, "an unknown id");
eq((await rpc("owner_photo_remove", [ADMIN, T, s8.items[0].id])).ok, true, "the site owner can remove any owner photo");

console.log(`owner_photos: ${passed} checks passed`);
