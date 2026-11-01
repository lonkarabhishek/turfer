// Applies 20261102_reviews_trust.sql and 20261102_review_photos_policies.sql (each
// twice) to an in-memory Postgres (PGlite) built by game_reports.db.mjs, on top of
// the reviews as production has them (20261027_game_reports.sql,
// 20261029_reviews_lockdown_step2.sql, 20261101_reviews_policy.sql) and the played
// rule's helpers from 20261101_played_with.sql, with stand-ins for the storage
// schema, pg_net and pg_cron. Checks: the replaced bodies start from production's,
// the tip's rule (lib/reviews/screen.cases.json through both SQL rules), Played here
// (who, when, which games count, never which game), photos (tickets, the storage
// policies, finish, the daily cap, the pause switch, on and off a report through
// review_save, a report taken down or hidden takes them off, discard, the sweep and
// its job), Report this review (who may, once, 10 a day, the site owner's queue and
// decisions, a removal request's Remove closing them), grants, and that nothing is
// ever taken out of a table. Never touches a real database. Made-up people only.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/reviews_trust.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { KEY, makeDb } from "./game_reports.db.mjs";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261102_reviews_trust.sql`;
const POLICIES = `${M}/20261102_review_photos_policies.sql`;
const CASES = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../lib/reviews/screen.cases.json"), "utf8"));
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };

const sql = fs.readFileSync(FILE, "utf8");
const pol = fs.readFileSync(POLICIES, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b/i, "the main file is written without the words drop, delete or truncate");
assert.doesNotMatch(pol, /\bdrop\b|\bdelete\s+from\b|\btruncate\b/i, "the policies file drops and deletes nothing (its one delete is a policy's command)");
assert.doesNotMatch(sql + pol, /[—–]/, "no em or en dashes");
ok(/set local lock_timeout = '2s'/.test(pol), "the policies wait 2 s at most for their lock");
passed += 3;

// The bodies the file replaces start from production's (pg_proc.prosrc, read SELECT-only 2026-11-02).
const LIVE = {
  "20261101_reviews_policy.sql:116": "1b8fd1e452366dfb0c828da80686a823", // public.review_save
  "20261027_game_reports.sql:449": "c88a60b9b82d3354be6091cc759ef5ae", // private.review_row_json
};
const bodyAt = (text) => {
  const tag = /\$[a-z_]*\$/.exec(text)[0];
  const open = text.indexOf(tag) + tag.length;
  return text.slice(open, text.indexOf(tag, open));
};
for (const [at, md5] of Object.entries(LIVE)) {
  const [file, line] = at.split(":");
  const text = fs.readFileSync(`${M}/${file}`, "utf8").split("\n").slice(Number(line) - 1).join("\n");
  assert.match(text, /^create or replace function /, `${at} is a create`);
  eq(createHash("md5").update(bodyAt(text)).digest("hex"), md5, `${at} is the live body`);
  ok(sql.includes(md5), `the file's header names ${md5}`);
}

const db = await makeDb(PGlite, M);
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
await db.exec(`
create table public.game_requests (id uuid primary key default gen_random_uuid(), game_id uuid, user_id uuid, note text,
  status text default 'pending', created_at timestamptz default now(), responded_at timestamptz, requester_name varchar, updated_at timestamptz default now());
create schema if not exists storage; create schema if not exists net; create schema if not exists cron;
create table net.posts (id bigserial primary key, url text, headers jsonb, body jsonb, at timestamptz default now());
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
  returns bigint language sql as $$ insert into net.posts (url, headers, body) values (url, headers, body) returning id $$;
create table cron.jobs (name text primary key, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
  $$ insert into cron.jobs values (job_name, schedule, command) on conflict (name) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;
create function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as
  $$ select substring(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()) from 1 for n) $$;
insert into private.app_secrets values ('revalidate', 'reval-secret');
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb,
  owner_id text, archived_at timestamptz, is_delete_marker boolean default false, created_at timestamptz default now(), unique (bucket_id, name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
`);
await db.exec(fs.readFileSync(`${M}/20261027_game_reports.sql`, "utf8"));
await db.exec(fs.readFileSync(`${M}/20261029_reviews_lockdown_step2.sql`, "utf8"));
await db.exec(fs.readFileSync(`${M}/20261101_reviews_policy.sql`, "utf8"));
// The played rule's helpers as production has them (20261101_played_with.sql; the rest of it is about WhatsApp).
const played = fs.readFileSync(`${M}/20261101_played_with.sql`, "utf8");
const block = (from, to) => {
  const a = played.indexOf(from);
  const b = played.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`played_with.sql: no ${from}`);
  return played.slice(a, b + to.length);
};
for (const [from, to] of [["create or replace function private.game_over_at", "$$;"], ["create or replace function private.game_start_at", "$$;"],
  ["create table if not exists private.game_start_moves", ");"], ["create or replace function private.game_start_moved", "$$;"],
  ["create or replace trigger games_start_moved", "execute function private.game_start_moved();"]]) {
  await db.exec(block(from, to));
}
// The site owner's sign-in, made up (the stand-in _can_manage lets it manage every turf).
await db.exec(`create or replace function public._is_admin_key(p_key text) returns boolean language sql immutable as $$ select p_key = 'p:9000000099' $$`);

const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const T = (i) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`;
const G = (i) => `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}`;
const tok = (i) => `phone:90000000${String(i).padStart(2, "0")}`;
for (let i = 1; i <= 30; i++) await q(`insert into public.users (id, name, phone, created_at) values ($1, $2, $3, now() - interval '1 year')`, [U(i), `Player ${i}`, `+9190000000${String(i).padStart(2, "0")}`]);
await q(`insert into public.users (id, name, created_at) values ('${U(99)}', 'Site Owner', now() - interval '1 year')`);
for (let i = 1; i <= 6; i++) await q(`insert into public.turfs (id, name, slug, city, sports) values ($1, $2, $3, 'pune', '["Football", "Box Cricket"]')`, [T(i), `Turf ${i}`, `turf-${i}`]);
await q(`insert into public.turfs (id, name, slug, city, sports, is_active) values ('${T(9)}', 'Closed Turf', 'closed-turf', 'pune', '["Football"]', false)`);
// U20 is the active owner of T1 (a claim on the account).
await q(`insert into public.turf_owners (turf_id, user_key, status, via, user_id) values ('${T(1)}', 'p:9000000020', 'active', 'phone_match', '${U(20)}')`);

const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const save = async (user, turf, report) => {
  const r = { ...report };
  if (!("base" in r)) {
    const cur = await one(`select id from public.reviews where user_id = $1 and turf_id = $2 and source is null`, [user, turf]);
    if (cur) r.base = cur.id;
  }
  return rpc("review_save", [KEY, user, turf, JSON.stringify(r)]);
};
const mine = (user, turf) => rpc("review_mine", [KEY, user, turf]);
const remove = (user, turf) => rpc("review_remove", [KEY, user, turf]);
const page = async (k) => (await one(`select public.turf_page($1) p`, [k])).p;
const reviewId = async (user, turf) => (await one(`select id from public.reviews where user_id = $1 and turf_id = $2 and source is null`, [user, turf]))?.id;
const status = async (user, turf) => (await one(`select status from public.reviews where user_id = $1 and turf_id = $2 and source is null`, [user, turf]))?.status;
const pageRow = async (k, id) => (await page(k)).reviews.find((r) => r.id === id);
// Each player below posts at most one new report (the day's limit, 20261101_reviews_policy.sql); edits don't count.

const sigs = async () => (await q(`select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' s from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.proname in ('review_save', 'review_mine', 'review_row_json', 'review_mine_json', 'review_remove', 'review_vote', 'turf_page') order by 1`)).map((r) => r.s);
const sigsBefore = await sigs();
// A report from before the file: the page's row then (its keys), and after.
await save(U(1), T(2), { rating: 4, comment: "From before" });
const before = await pageRow("turf-2", await reviewId(U(1), T(2)));

for (let i = 0; i < 2; i++) {
  await db.exec(sql);
  await db.exec(pol);
}
passed++; // safe to run again
eq(await sigs(), sigsBefore, "the replaced functions keep their exact signatures");
const after = await pageRow("turf-2", await reviewId(U(1), T(2)));
eq(Object.keys(after).sort(), [...Object.keys(before), "played_here", "photos"].sort(), "review_row_json keeps every key and adds played_here and photos");
eq([after.played_here, after.photos], [false, null], "a report with no game and no photos: false, null");
eq(Object.keys(await mine(U(1), T(2))).sort(), ["blocked", "daily", "hint", "mine", "my_price", "r", "voted"], "review_mine's keys are as they were");

/* ---------------- 1. the tip's rule ---------------- */
const tipRule = async (t) => (await one(`select private.review_tip_problem($1) a, private.review_text_problem($1) b`, [t]));
for (const t of CASES.both) eq(await tipRule(t), { a: "contact_info", b: "contact_info" }, `both rules: ${JSON.stringify(t)}`);
for (const t of CASES.tip_only) eq(await tipRule(t), { a: "contact_info", b: null }, `the tip's rule only: ${JSON.stringify(t)}`);
for (const t of CASES.neither) eq(await tipRule(t), { a: null, b: null }, `neither: ${JSON.stringify(t)}`);
eq(await tipRule(null), { a: null, b: null }, "nothing written: no problem");
eq(await save(U(2), T(1), { rating: 4, comment: "DM @kingsturf on Instagram for slots" }), { r: "contact_info", field: "comment" }, "review_save: a handle in the tip is refused");
eq(await reviewId(U(2), T(1)), undefined, "and nothing is written");
eq(await save(U(2), T(1), { rating: 4, comment: "Call 98765 43210" }), { r: "contact_info", field: "comment" }, "a number in the tip, as before");
eq((await save(U(2), T(1), { rating: 4, comment: "Good turf", note: { body: "Ask for @ravi_ground staff, he is great", show_name: false } })).r, "ok",
  "the private note keeps its own rule: a handle there is allowed");
eq(await save(U(2), T(1), { rating: 4, note: { body: "Call me on 98765 43210", show_name: true } }), { r: "contact_info", field: "note" }, "a number in the note, as before");

/* ---------------- 2. played here ---------------- */
// A game at turf, started startAgo minutes ago for len minutes, made createdAgo minutes ago.
const game = (id, host, turf, startAgo, len = 60, createdAgo = 7 * 24 * 60, st = "open") =>
  q(`insert into public.games (id, creator_id, turf_id, sport, date, start_time, end_time, status, created_at)
     select $1, $2, $3, 'Football', (s at time zone 'Asia/Kolkata')::date, (s at time zone 'Asia/Kolkata')::time,
            ((s + make_interval(mins => $5)) at time zone 'Asia/Kolkata')::time, $6, now() - make_interval(mins => $7)
       from (select now() - make_interval(mins => $4) s) x`, [id, host, turf, startAgo, len, st, createdAgo]);
const join = (g, user, agoMin) => q(`insert into public.game_participants (game_id, user_id, joined_at) values ($1, $2, now() - make_interval(mins => $3))`, [g, user, agoMin]);
const ph = async (user, turf) => (await pageRow(`turf-${turf.slice(-1)}`, await reviewId(user, turf))).played_here;

// U3 hosted a game at T3 that ended an hour ago; U4 joined it the day before.
await game(G(1), U(3), T(3), 120, 60);
await join(G(1), U(4), 24 * 60);
await save(U(3), T(3), { rating: 5 });
await save(U(4), T(3), { rating: 4 });
eq([await ph(U(3), T(3)), await ph(U(4), T(3))], [true, true], "the host and a player who was in it before it started, of a game that's over: Played here");
const t3 = JSON.stringify((await page("turf-3")).reviews);
ok(!t3.includes(G(1)) && !/game_id|creator_id/.test(t3), "the page's reviews carry only true or false: never the game");
// U5 joined after it started (the host added them later): no.
await join(G(1), U(5), 30);
await save(U(5), T(3), { rating: 3 });
eq(await ph(U(5), T(3)), false, "a player added once it had started: no");
// U6 is at a game going on now (started 30 minutes ago, 2 hours long): not yet; once over, yes.
await game(G(2), U(6), T(4), 30, 120);
await save(U(6), T(4), { rating: 4 });
eq(await ph(U(6), T(4)), false, "a game still going on: not yet");
await q(`update public.games set end_time = start_time + interval '20 minutes' where id = $1`, [G(2)]);
eq(await ph(U(6), T(4)), true, "the same report once the game is over: Played here (worked out at every read)");
// A report written before the game started doesn't count, until it is edited after.
await game(G(3), U(7), T(5), 90, 60);
await save(U(7), T(5), { rating: 2 });
await q(`update public.reviews set created_at = now() - interval '3 hours' where id = $1`, [await reviewId(U(7), T(5))]);
eq(await ph(U(7), T(5)), false, "written before the game started: no");
await save(U(7), T(5), { rating: 3, comment: "Played since, better than I thought" });
eq(await ph(U(7), T(5)), true, "edited after playing: yes (the report's latest version)");
// Games that never count.
await game(G(4), U(8), T(6), 120, 60, 7 * 24 * 60, "cancelled");
await game(G(5), U(9), T(5), 120, 60, 60); // made after it started (back-dated)
await game(G(6), U(10), T(6), 120, 60);
await q(`update public.games set start_time = start_time - interval '5 minutes' where id = $1`, [G(6)]); // moved, after it had started
await game(G(7), U(11), T(1), 400 * 24 * 60, 60, 401 * 24 * 60); // over a year ago
await game(G(8), U(12), T(2), 120, 60); // at another turf
for (const [u, t, why] of [[U(8), T(6), "a cancelled game"], [U(9), T(5), "a game made after its start"], [U(10), T(6), "a game moved after its start"],
  [U(11), T(1), "a game more than a year before the report"], [U(12), T(6), "a game at another turf"]]) {
  await save(u, t, { rating: 3 });
  eq(await ph(u, t), false, `no: ${why}`);
}
// A game moved before it started still counts; a Google row never does.
await game(G(9), U(13), T(2), 300, 60, 3 * 24 * 60);
await q(`update public.games set start_time = start_time + interval '1 minute' where id = $1`, [G(9)]);
await q(`update private.game_start_moves set moved_at = now() - interval '2 days' where game_id = $1`, [G(9)]);
await save(U(13), T(2), { rating: 4 });
eq(await ph(U(13), T(2)), true, "a game moved days before it started: yes");
await q(`insert into public.reviews (user_id, turf_id, rating, comment, source, external_review_id, author_name) values ('${U(99)}', '${T(3)}', 4, 'Google row', 'google', 'g-1', 'A Googler')`);
const google = (await page("turf-3")).reviews.find((r) => r.source === "google");
eq([google.played_here, google.photos], [false, null], "a Google row: never Played here, no photos");
eq((await save(U(3), T(3), { rating: 5, comment: "Saved again" })).review.played_here, true, "review_save answers with played_here too");
eq((await mine(U(4), T(3))).mine.played_here, true, "and review_mine");

/* ---------------- 3. photos ---------------- */
eq(await q("select id, public, file_size_limit::int as max, allowed_mime_types as types from storage.buckets"),
  [{ id: "review-photos", public: true, max: 1048576, types: ["image/webp", "image/jpeg"] }], "a public bucket, 1 MB, WebP or JPEG, made once");
eq((await q(`select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname`)).map((r) => `${r.policyname}:${r.cmd}`),
  ["tt review photos insert:INSERT", "tt review photos remove:DELETE", "tt review photos select:SELECT"], "three storage policies, created once, no update policy");
eq(await q(`select name, schedule, command from cron.jobs`), [{ name: "review-photos-sweep", schedule: "8,23,38,53 * * * *", command: "select private.review_photos_tick()" }], "the quarter-hour job, scheduled once");

const start = (user, turf, o = {}) => rpc("review_photo_start", [o.key ?? KEY, user, turf, o.ext ?? "webp", o.bytes ?? 300000, o.thumb ?? 20000, o.w ?? 1600, o.h ?? 1200]);
const finish = (user, id, verdict = null) => rpc("review_photo_finish", [KEY, user, id, verdict]);
const put = (p, size, type = "image/webp") => q(`insert into storage.objects (bucket_id, name, metadata) values ('review-photos', $1, $2)`, [p, JSON.stringify({ size, mimetype: type })]);
const objOk = async (p, op) => (await one(`select public.review_photo_object_ok($1, $2) r`, [p, op])).r;
const photo = (id) => one(`select status, review_id, position, files_gone_at is not null as gone from private.review_photos where id = $1`, [id]);
const asAnon = async (fn) => { await q("set role anon"); try { return await fn(); } finally { await q("reset role"); } };
const fails = async (p) => { try { await p; return null; } catch (e) { return String(e.message ?? e); } };
/** A photo through the whole route: a ticket, both files, finished. */
const addPhoto = async (user, turf, o = {}) => {
  const t = await start(user, turf, o);
  assert.equal(t.r, "ok", JSON.stringify(t));
  await put(t.path, o.bytes ?? 300000, (o.ext ?? "webp") === "webp" ? "image/webp" : "image/jpeg");
  await put(t.thumb, o.thumb ?? 20000, (o.ext ?? "webp") === "webp" ? "image/webp" : "image/jpeg");
  const f = await finish(user, t.id, { usable: true });
  assert.equal(f.r, "ok", JSON.stringify(f));
  return f.photo;
};

eq((await start(U(14), T(1), { key: "wrong" })).r, "unavailable", "start: the server key only");
for (const [o, why] of [[{ ext: "png" }, "a PNG"], [{ bytes: 2_000_000 }, "over 1 MB"], [{ thumb: 400000 }, "a thumbnail over 128 KB"], [{ thumb: 300000 }, "a thumbnail no smaller than the photo"], [{ w: 4000 }, "wider than 1600"]]) {
  eq((await start(U(14), T(1), o)).r, "bad", `start: ${why} is bad`);
}
eq((await start(U(14), T(9))).r, "gone", "start: a turf that isn't active: gone");
eq((await start(U(20), T(1))).r, "own_turf", "start: the turf's owner can't add photos to a report on it");
const t1 = await start(U(14), T(1));
eq([t1.r, t1.bucket, /^[0-9a-f]{24}\.webp$/.test(t1.path), t1.thumb === t1.path.replace(".webp", "_t.webp"), t1.left], ["ok", "review-photos", true, true, 9], "a ticket: a random name for the photo and its thumbnail");
eq([await objOk(t1.path, "insert"), await objOk(t1.thumb, "insert"), await objOk("ffffffffffffffffffffffff.webp", "insert"), await objOk(t1.path, "update")],
  [true, true, false, false], "object_ok: an open ticket's two files may be written; a made-up name or another op may not");
eq(await asAnon(() => fails(q(`insert into storage.objects (bucket_id, name, metadata) values ('review-photos', 'aaaaaaaaaaaaaaaaaaaaaaaa.webp', '{}')`))) !== null, true, "as anon: a file at a path with no ticket is refused");
await asAnon(() => q(`insert into storage.objects (bucket_id, name, metadata) values ('review-photos', $1, $2)`, [t1.path, JSON.stringify({ size: 300000, mimetype: "image/webp" })]));
passed++; // the ticket's photo is written as anon
eq((await finish(U(14), t1.id)).r, "missing", "finish: the thumbnail isn't there yet: missing");
await put(t1.thumb, 19999);
eq((await finish(U(14), t1.id)).r, "missing", "finish: a thumbnail of another size: missing");
await q(`update storage.objects set metadata = $2 where name = $1`, [t1.thumb, JSON.stringify({ size: 20000, mimetype: "image/webp" })]);
eq((await finish(U(15), t1.id)).r, "expired", "finish: someone else's ticket: expired");
const f1 = await finish(U(14), t1.id, { usable: true, shows: "pitch" });
eq([f1.r, f1.photo.id, f1.photo.path, f1.photo.thumb, f1.photo.w, f1.photo.h], ["ok", t1.id, t1.path, t1.thumb, 1600, 1200], "finish: the photo, ready to go on a report");
eq((await photo(t1.id)).status, "ready", "ready");
eq([await objOk(t1.path, "insert"), await objOk(t1.path, "select"), await objOk(t1.path, "remove")], [false, false, false], "a ready photo: no more writes, nobody lists or takes it away");
eq(await asAnon(async () => (await q(`select name from storage.objects where bucket_id = 'review-photos'`)).length), 0, "as anon: nothing to list while photos are up");
// A ticket older than 15 minutes can't be finished; the 10-minute window for writing closes.
const old = await start(U(14), T(1));
await q(`update private.review_photos set created_at = now() - interval '16 minutes' where id = $1`, [old.id]);
eq([await objOk(old.path, "insert"), (await finish(U(14), old.id)).r], [false, "expired"], "an old ticket: no writes, can't be finished");
// end: refused and unchecked tickets were never stored.
const t2 = await start(U(14), T(1));
eq((await rpc("review_photo_end", [KEY, U(14), t2.id, "refused", JSON.stringify({ usable: false, problem: "spam" })])).r, "ok", "end: refused, with the check's answer");
eq((await rpc("review_photo_end", [KEY, U(14), t2.id, "unchecked", null])).r, "bad", "a ticket ends once");
eq((await rpc("review_photo_end", [KEY, U(14), (await start(U(14), T(1))).id, "live", null])).r, "bad", "end: only refused, unchecked or expired");

// On a report: review_save's photos list.
const p2 = await addPhoto(U(14), T(1));
const p3 = await addPhoto(U(14), T(1), { ext: "jpg" });
const other = await addPhoto(U(15), T(1)); // someone else's
const elsewhere = await addPhoto(U(14), T(2)); // for another turf
eq((await save(U(14), T(1), { rating: 4, photos: [t1.id, p2.id, p3.id, other.id] })).r, "bad", "more than 3 photos: bad");
eq((await save(U(14), T(1), { rating: 4, photos: ["x"] })).r, "bad", "a photo id that isn't one: bad");
eq((await save(U(14), T(1), { rating: 4, photos: "all" })).r, "bad", "photos that aren't a list: bad");
await q(`delete from private.test_dirty`);
const s1 = await save(U(14), T(1), { rating: 4, comment: "Nets are new", photos: [p3.id, t1.id, other.id, elsewhere.id, t2.id] });
eq(s1.r, "bad", "five ids: bad (at most 3)");
const s2 = await save(U(14), T(1), { rating: 4, comment: "Nets are new", photos: [p3.id, t1.id, other.id] });
eq([s2.r, s2.review.photos.map((x) => x.id)], ["ok", [p3.id, t1.id]], "the account's own ready photos for this turf go on, in the order sent; someone else's doesn't");
eq((await photo(other.id)).status, "ready", "and theirs stays theirs, not on this report");
const r14 = await reviewId(U(14), T(1));
eq((await pageRow("turf-1", r14)).photos.map((x) => [x.id, x.path, x.thumb]), [[p3.id, p3.path, p3.thumb], [t1.id, t1.path, t1.thumb]], "the turf page shows them, with both files");
eq((await mine(U(14), T(1))).mine.photos.length, 2, "so does review_mine");
const s3 = await save(U(14), T(1), { rating: 5, comment: "Nets are new" });
eq(s3.review.photos.length, 2, "a save without the list keeps them");
await q(`delete from private.test_dirty`);
const s4 = await save(U(14), T(1), { rating: 5, comment: "Nets are new", photos: [t1.id, p2.id] });
eq(s4.review.photos.map((x) => x.id), [t1.id, p2.id], "a new list: one off, one on, in its order");
eq([(await photo(p3.id)).status, (await photo(t1.id)).position, (await photo(p2.id)).position], ["removed", 1, 2], "the one left out is removed");
eq((await q(`select key, urgent from private.test_dirty`)).map((x) => `${x.key}${x.urgent ? "!" : ""}`).includes("turf:turf-1!"), true, "photos alone changing queues the page, urgent");
eq([await objOk(p3.path, "select"), await objOk(p3.thumb, "remove"), await objOk(t1.path, "remove")], [true, true, false], "a removed photo's files may be taken away; one that is up may not");
eq((await save(U(14), T(1), { rating: 5, comment: "Nets are new", photos: [p3.id, t1.id, p2.id] })).review.photos.map((x) => x.id), [t1.id, p2.id],
  "a removed photo can't be put back");
eq((await save(U(14), T(1), { rating: 5, comment: "Nets are new", photos: [] })).review.photos, null, "an empty list takes them all off");
eq((await one(`select count(*)::int n from private.review_photos where review_id = $1 and status = 'live'`, [r14])).n, 0, "none live");
// Discard: a ready photo taken out of the sheet before posting.
const d1 = await addPhoto(U(16), T(1));
const disc = await rpc("review_photo_discard", [KEY, U(16), d1.id]);
eq([disc.r, disc.files[0].paths], ["ok", [d1.path, d1.thumb]], "discard: a ready photo goes, its two files listed");
eq((await rpc("review_photo_discard", [KEY, U(16), d1.id])).r, "bad", "once");
const d2 = await addPhoto(U(16), T(1));
await save(U(16), T(1), { rating: 3, photos: [d2.id] });
eq((await rpc("review_photo_discard", [KEY, U(16), d2.id])).r, "bad", "discard: not one on a posted report (the save takes it off)");
eq((await rpc("review_photo_discard", [KEY, U(17), other.id])).r, "bad", "nor someone else's");
// A report taken down takes its photos with it; posting it again doesn't bring them back.
await remove(U(16), T(1));
eq((await photo(d2.id)).status, "removed", "the author takes the report down: its photos are removed");
eq((await save(U(16), T(1), { rating: 3, photos: [d2.id] })).review.photos, null, "posting it again doesn't bring them back");
// A hidden report keeps its photos off, and an edit can't put any on.
const h1 = await addPhoto(U(17), T(1));
await save(U(17), T(1), { rating: 1, comment: "Bad", photos: [h1.id] });
await q(`update public.reviews set status = 'hidden' where id = $1`, [await reviewId(U(17), T(1))]);
eq((await photo(h1.id)).status, "hidden", "TapTurf hides the report: its photos are hidden");
const h2 = await addPhoto(U(17), T(1));
eq([(await save(U(17), T(1), { rating: 1, comment: "Bad", photos: [h2.id] })).review.status, (await photo(h2.id)).status], ["hidden", "ready"], "an edit of a hidden report puts no photo on");
// The daily cap: ten uploads a day, refused ones too.
const n16 = (await one(`select count(*)::int n from private.review_photos where user_id = $1 and created_at > now() - interval '1 day'`, [U(16)])).n;
eq((await rpc("review_photo_ready", [KEY, U(16)])).left, 10 - n16, "ready: what's left today");
const starts = [];
for (let i = n16; i < 11; i++) starts.push((await start(U(16), T(1))).r);
eq(starts.at(-1), "limit", "the 11th upload in a day: limit");
eq(starts.slice(0, -1).every((r) => r === "ok"), true, "up to 10 go");
eq((await rpc("review_photo_ready", [KEY, U(16)])).left, 0, "none left");
// The pause switch.
await db.exec(`create or replace function private.review_photos_paused() returns boolean language sql stable set search_path = '' as $$ select true $$`);
eq([(await start(U(18), T(1))).r, (await rpc("review_photo_ready", [KEY, U(18)])).paused], ["paused", true], "paused: no tickets");
await db.exec(`create or replace function private.review_photos_paused() returns boolean language sql stable set search_path = '' as $$ select false $$`);

// The sweep: tickets left over 15 minutes, photos never posted in 2 days, live photos on a report gone, then the files.
const stale = await addPhoto(U(18), T(2));
await q(`update private.review_photos set ready_at = now() - interval '3 days' where id = $1`, [stale.id]);
const g1 = await addPhoto(U(19), T(2));
await save(U(19), T(2), { rating: 4, photos: [g1.id] });
await q(`update public.reviews set status = 'removed' where id = $1`, [await reviewId(U(19), T(2))]); // the trigger takes it off
const g2 = await addPhoto(U(27), T(3));
await save(U(27), T(3), { rating: 4, photos: [g2.id] });
await db.exec(`alter table public.reviews disable trigger reviews_photos_follow`);
await q(`update public.reviews set status = 'hidden' where id = $1`, [await reviewId(U(27), T(3))]); // a change the trigger didn't see
await db.exec(`alter table public.reviews enable trigger reviews_photos_follow`);
const up = await addPhoto(U(28), T(4));
await save(U(28), T(4), { rating: 5, photos: [up.id] });
await q(`delete from net.posts`);
await q(`select private.review_photos_tick()`);
eq((await q(`select url, headers ->> 'x-revalidate-secret' s from net.posts`)), [{ url: "https://www.tapturf.in/api/reviews/photos/sweep", s: "reval-secret" }], "the job asks the app to sweep, with the secret");
await q(`update private.review_photos set ended_at = ended_at - interval '5 minutes' where ended_at is not null`);
const list = await rpc("review_photo_sweep_list", [KEY]);
eq([(await photo(stale.id)).status, (await photo(g2.id)).status, (await photo(g1.id)).status], ["expired", "hidden", "removed"],
  "the sweep: a photo never posted in 2 days expires, a live one on a hidden report is hidden");
const listed = list.files.map((f) => f.id);
ok([p3.id, t1.id, d1.id, d2.id, h1.id, g1.id].every((id) => listed.includes(id)) && !listed.includes(up.id) && !listed.includes(other.id), "it lists the files nothing shows, never one that is up or ready");
ok(list.files.every((f) => f.paths.length === 2 && f.paths[1].includes("_t.")), "each with its photo and thumbnail");
eq((await rpc("review_photo_files_gone", [KEY, `{${listed.join(",")},${up.id},${other.id}}`])).gone, listed.length, "files gone: only those that may go");
eq([(await photo(up.id)).gone, (await photo(other.id)).gone, (await photo(up.id)).status], [false, false, "live"], "a photo that is up, or ready, is never marked gone");
await q(`delete from net.posts`);
await q(`update private.review_photos set status = 'expired', ended_at = now() - interval '5 minutes' where status = 'uploading'`);
await rpc("review_photo_files_gone", [KEY, `{${(await q(`select id from private.review_photos where status in ('removed', 'hidden', 'expired') and files_gone_at is null`)).map((r) => r.id).join(",")}}`]);
await q(`select private.review_photos_tick()`);
eq((await one(`select count(*)::int n from net.posts`)).n, 0, "nothing to do: the job asks nothing");

/* ---------------- 4. report this review ---------------- */
const flag = (user, review, reason = "not_played", detail = null) => rpc("review_flag", [KEY, user, review, reason, detail]);
const target = await reviewId(U(3), T(3)); // U3's report on T3, live
eq((await flag(U(21), target, "other", null)).r !== undefined, true, "review_flag answers");
const flags0 = await q(`select * from private.review_flags`);
eq([flags0.length, flags0[0].user_id, flags0[0].review_id, flags0[0].turf_id, flags0[0].reason, flags0[0].status], [1, U(21), target, T(3), "other", "open"], "a report is kept: who, which, why");
eq(await flag(U(21), target, "abusive"), { r: "ok", already: true }, "reporting it again while open: already");
const f22 = await flag(U(22), target, "abusive", "  Rude about the staff.\n\n\n By name. ");
eq(f22, { r: "ok", already: false }, "another player may report it too");
eq((await one(`select detail from private.review_flags where user_id = $1`, [U(22)])).detail, "Rude about the staff.\n\nBy name.", "the line is cleaned");
eq((await flag(U(3), target)).r, "own", "its author can't report their own");
eq((await flag(U(21), (await page("turf-3")).reviews.find((r) => r.source === "google").id)).r, "google", "a Google row: google");
eq((await flag(U(21), "cccccccc-cccc-4ccc-8ccc-0000000000ff")).r, "gone", "an unknown report: gone");
eq((await flag(U(21), await reviewId(U(17), T(1)))).r, "gone", "a hidden report: gone");
eq((await flag(U(21), target, "rude")).r, "bad", "a reason off the list: bad");
eq((await flag(U(23), target, "other", "x".repeat(301))).r, "bad", "a line over 300 characters: bad");
eq((await rpc("review_flag", ["wrong", U(23), target, "other", null])).r, "unavailable", "the server key only");
// 10 a day per account.
const writers = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(U);
const targets = [];
for (const u of writers) {
  const t = (await q(`select id from public.reviews where user_id = $1 and status = 'live' and source is null limit 1`, [u]))[0]?.id;
  if (t) targets.push(t);
}
const flagged = [];
for (const t of targets.slice(0, 10)) flagged.push((await flag(U(24), t, "spam")).r);
eq(flagged.slice(0, 10).filter((r) => r === "ok").length, 10, "ten reports in a day");
eq((await flag(U(24), target, "spam")).r, "limit", "the 11th in 24 hours: limit");
// The author is never told: nothing about a report in what they or anyone reads.
const authorSees = JSON.stringify([await mine(U(3), T(3)), await page("turf-3"), await save(U(3), T(3), { rating: 5, comment: "Saved again" })]);
ok(!/review_flags|not_played|abusive|Rude about/.test(authorSees), "the author's own read, the page and a save say nothing of being reported");

// The site owner's queue.
const decide = (id, d) => rpc("admin_review_flag_decide", ["fb-token", id, d]);
await db.exec(`set test.owner = 'no'`);
eq(await rpc("admin_review_flags", ["fb-token"]), { error: "forbidden" }, "the queue: only the site owner");
eq(await decide(flags0[0].id, "hide"), { error: "forbidden" }, "deciding: only the site owner");
await db.exec(`set test.owner = 'yes'`);
const queue = await rpc("admin_review_flags", [null]);
eq(queue.open, 12, "every open report counted");
const first = queue.flags[0];
eq([first.id, first.status, first.reason, first.turf.slug, first.review.id, first.review.author, first.review.author_id, first.review.played_here, first.by.name, first.by.manages, first.others],
  [flags0[0].id, "open", "other", "turf-3", target, "Player 3", U(3), true, "Player 21", false, 1],
  "the oldest first: the report as players see it (with its badge), its author, the turf, who reported it and that one other did too");
ok(!/\+91|9000000|p:|e:/.test(JSON.stringify(queue)), "no phone number or sign-in key in the queue");
// U20, the owner of T1, reports a report on T1: the queue says they manage it.
const onT1 = await reviewId(U(2), T(1));
await flag(U(20), onT1, "not_played");
ok((await rpc("admin_review_flags", [null])).flags.find((f) => f.review?.id === onT1).by.manages, "a report from the turf's own manager says so");
// Keep: closes every open report of it, the report stays.
const kept = await decide(f22 ? (await one(`select id from private.review_flags where user_id = $1`, [U(22)])).id : null, "keep");
eq([kept.ok, kept.status, kept.closed, kept.review_id], [true, "kept", 2, target], "Keep closes both open reports of it");
eq(await status(U(3), T(3)), "live", "and the report stays up");
eq((await decide(flags0[0].id, "hide")).already, true, "a decided report stays decided");
eq(await status(U(3), T(3)), "live", "so it is still up");
eq(await flag(U(21), target, "abusive"), { r: "ok", already: true }, "reported again unchanged since the decision: already");
await save(U(3), T(3), { rating: 2, comment: "Changed my mind about this place" });
eq(await flag(U(21), target, "abusive"), { r: "ok", already: false }, "once it changed, it can be reported again");
// Hide: the existing hide, its photos with it.
const hp = await addPhoto(U(3), T(3));
await save(U(3), T(3), { rating: 2, comment: "Changed my mind about this place", photos: [hp.id] });
await q(`delete from private.test_dirty`);
const newFlag = (await one(`select id from private.review_flags where user_id = $1 and status = 'open' and review_id = $2`, [U(21), target])).id;
const hidden = await decide(newFlag, "hide");
eq([hidden.ok, hidden.status, hidden.closed, hidden.turf_id], [true, "hidden", 1, T(3)], "Hide");
eq(await status(U(3), T(3)), "hidden", "Hide hides the report");
ok(!(await page("turf-3")).reviews.some((r) => r.id === target), "it is off the page");
eq((await photo(hp.id)).status, "hidden", "its photos with it");
eq((await q(`select key, urgent from private.test_dirty`)).map((x) => `${x.key}${x.urgent ? "!" : ""}`), ["turf:turf-3!"], "and the page is queued, urgent");
eq((await mine(U(3), T(3))).mine.status, "hidden", "its author sees it hidden, as for any hide");
eq((await flag(U(25), target)).r, "gone", "a hidden report can't be reported");
// Hide on a report its author took down closes as kept, hiding nothing.
const down = await reviewId(U(6), T(4));
await flag(U(25), down, "spam");
await remove(U(6), T(4));
const downFlag = (await one(`select id from private.review_flags where review_id = $1`, [down])).id;
eq((await decide(downFlag, "hide")).status, "kept", "Hide on a report its author took down: nothing to hide, closed as kept");
eq(await status(U(6), T(4)), "removed", "it stays taken down, theirs to post again");
eq((await decide(downFlag, "maybe")), { error: "bad" }, "a decision off the list: bad");
eq((await decide("cccccccc-cccc-4ccc-8ccc-0000000000ff", "keep")), { error: "not_found" }, "an unknown report: not_found");
// An owner's removal request, Removed, closes the open reports of the same report as hidden.
const both = await reviewId(U(2), T(1));
const ask = await rpc("owner_review_removal_ask", [tok(20), both, "abusive", null]);
await flag(U(26), both, "abusive");
await rpc("admin_review_removal_decide", ["fb-token", ask.id, "remove"]);
eq((await q(`select status from private.review_flags where review_id = $1 order by created_at`, [both])).map((r) => r.status), ["hidden", "hidden"], "a removal request's Remove closes its open reports, as hidden");
const afterQ = await rpc("admin_review_flags", [null]);
ok(afterQ.flags.slice(0, afterQ.open).every((f) => f.status === "open") && afterQ.flags.some((f) => f.status === "hidden" && f.decided_at), "open ones first, then the decided ones, with when");
await db.exec(`set test.owner = 'no'`);

/* ---------------- nothing is ever taken out ---------------- */
const counts = await one(`select (select count(*)::int from private.review_flags) flags, (select count(*)::int from private.review_photos) photos,
  (select count(*)::int from public.reviews) reviews`);
ok(counts.flags >= 15 && counts.photos >= 20 && counts.reviews >= 19, "every report, photo row and review is still there: decided and removed ones are updated, never taken out");

/* ---------------- grants ---------------- */
for (const fn of ["review_photo_ready", "review_photo_start", "review_photo_end", "review_photo_finish", "review_photo_discard", "review_photo_files_gone", "review_photo_sweep_list",
  "review_photo_object_ok", "review_flag", "admin_review_flags", "admin_review_flag_decide", "review_save"]) {
  const r = await one(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('public', p.oid, 'execute') p, prosecdef, proconfig
                         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname = $1`, [fn]);
  eq([r.a, r.p, r.prosecdef, String(r.proconfig)], [true, false, true, 'search_path=""'], `${fn}: anon may call it (it checks its caller), PUBLIC not; definer, search_path ''`);
}
for (const fn of ["review_tip_problem", "review_played_here", "review_photos_paused", "review_photos_expire", "review_photo_json", "review_photos_follow", "review_photos_tick", "review_flags_follow", "review_row_json"]) {
  const r = await one(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') b, proconfig
                         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and proname = $1`, [fn]);
  eq([r.a, r.b, String(r.proconfig)], [false, false, 'search_path=""'], `private.${fn}: closed to the API roles; search_path ''`);
}
for (const t of ["review_photos", "review_flags"]) {
  eq((await q(`select grantee from information_schema.role_table_grants where table_schema = 'private' and table_name = $1 and grantee in ('anon', 'authenticated', 'PUBLIC')`, [t])).length, 0, `private.${t} is closed to the API roles`);
}
await q(`select set_config('request.jwt.claims', '', false)`);
await q(`set role anon`);
await assert.rejects(q(`select * from private.review_flags`), /permission denied/, "anon can't read reports");
await assert.rejects(q(`select * from private.review_photos`), /permission denied/, "anon can't read photo rows");
await q(`reset role`);
passed += 2;

console.log(`reviews_trust: ${passed} checks passed`);
