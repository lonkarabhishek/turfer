// Applies the 26 Oct cache files to an in-memory Postgres (PGlite) on top of
// the cache queue as production has it (20261019_revalidate_skip_photo_only.sql,
// 20261020_cache_queue.sql, 20261025_turf_claimed.sql), with stand-ins for
// pg_net (net.http_post records each post in net.sent) and pg_cron, and checks:
//   20261026_cache_legacy_webhook_off.sql  the per-row webhook posts nothing
//   20261026_cache_list_cap.sql            list keys wait in their own table
//   20261026_cache_list_snapshot.sql       the list snapshot, its parts (bounded in
//                                          bytes), its two RPCs, and flush_lists
//                                          building before it posts, holding no
//                                          key's lock, posting only keys the build has
// Each new file is applied twice (safe to run again). Never touches a real
// database. Time is moved by shifting the stored timestamps back, since now()
// is fixed inside a transaction.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/cache_list_snapshot.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const DIR = process.argv[2] ?? "supabase/migrations";
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");
const NEW = ["20261026_cache_legacy_webhook_off.sql", "20261026_cache_list_cap.sql", "20261026_cache_list_snapshot.sql"];
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

for (const f of NEW) {
  const sql = read(f);
  // Substrings, not words: a comment naming a file with one in it counts too.
  assert.doesNotMatch(sql, /drop|delete|truncate/i, `${f}: nothing dropped, deleted or truncated`);
  assert.doesNotMatch(sql, /[—–]/, `${f}: no em or en dashes`);
}

// CARD_COLUMNS, as the app selects them.
const turfsTs = fs.readFileSync(path.join(DIR, "..", "..", "lib", "queries", "turfs.ts"), "utf8");
const card = [...turfsTs.match(/const CARD_COLUMNS = \[([\s\S]*?)\]\.join/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
assert.ok(card.length > 30, "CARD_COLUMNS found");

const STUBS = `
create role anon; create role authenticated; create role service_role;
create schema net; create schema cron; create schema extensions; create schema private;
create table net._http_response (id bigint primary key, status_code int, content text, timed_out boolean, error_msg text, created timestamptz not null default now());
create table net.sent (id bigserial primary key, url text, body jsonb, at timestamptz default clock_timestamp());
create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int) returns bigint language sql as $$
  insert into net.sent (url, body) values (url, body) returning id $$;
create table cron.job (jobid serial, jobname text unique, schedule text, command text);
create table cron.job_run_details (end_time timestamptz);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (n, s, c) on conflict (jobname) do update set command = excluded.command returning jobid::bigint $$;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('revalidate', 'test-secret');
create table public.turfs (
  id uuid primary key default gen_random_uuid(), owner_id uuid, slug text unique, name varchar, address text, area text, city text,
  sports jsonb, images jsonb, cover_image text, rating numeric, total_reviews int, lat double precision, lng double precision,
  morning_price numeric(10,2), afternoon_price numeric(10,2), evening_price numeric(10,2),
  weekend_morning_price numeric(10,2), weekend_afternoon_price numeric(10,2), weekend_evening_price numeric(10,2),
  price_mentions jsonb, price_unit text, slot_minutes int, is_covered boolean, has_floodlights boolean,
  start_time time, end_time time, is_24x7 boolean, membership_required boolean, is_active boolean default true,
  amenities jsonb, parking_available boolean, washroom_available boolean, changing_room_available boolean, has_cafeteria boolean,
  equipment_provided boolean, image_review jsonb,
  description text, owner_phone text, listing_review jsonb, updated_at timestamptz default now());
create table public.trending_turfs (id serial, city text, turf_id uuid, starts_at timestamptz, ends_at timestamptz);
create table public.games (id serial, turf_id uuid, updated_at timestamptz);
create table public.reviews (id serial primary key, turf_id uuid, updated_at timestamptz);
create table public.turf_suggestions (id serial, turf_id uuid, updated_at timestamptz, ai_review jsonb, reviewed_at timestamptz);
create table public.turf_owners (turf_id uuid not null, user_key text not null, status text not null, via text default 'admin', role text,
  created_at timestamptz default now(), decided_at timestamptz, primary key (turf_id, user_key));
create table public.review_votes (id serial, review_id int);
create table public.turf_edit_log (id serial, turf_id uuid);
`;
const CITIES = ["hyderabad", "bangalore", "pune", "mumbai", "nashik"];
// 1,234 active turfs (some without a rating, many sharing one) and 20 inactive.
const SEED = `
insert into public.turfs (slug, name, address, area, city, sports, images, rating, total_reviews, lat, lng, morning_price,
                          start_time, end_time, is_active, amenities, description, owner_phone)
select 'turf-' || g, 'Turf ' || g, 'Road ' || g, 'Area ' || (g % 7), (array['${CITIES.join("','")}'])[1 + g % 5],
       '["Football", "Box Cricket"]', '[]', case when g % 13 = 0 then null else 3 + (g % 21) / 10.0 end, g % 90, 18.5, 73.8, 800,
       '06:00', '23:00', g <= 1234, '["Parking"]', 'Not on a card', '98xxxxxx' || g
  from generate_series(1, 1254) g;
`;

async function base(seed) {
  const db = new PGlite();
  await db.exec(STUBS);
  if (seed) await db.exec(SEED);
  // The per-row webhook as production still has it, and its two triggers.
  await db.exec(read("20261019_revalidate_skip_photo_only.sql"));
  await db.exec(`
    create trigger on_turfs_change_notify_revalidate after insert or update or delete on public.turfs
      for each row execute function notify_turf_change();
    create trigger on_trending_change_notify_revalidate after insert or update or delete on public.trending_turfs
      for each row execute function notify_turf_change();`);
  await db.exec(read("20261020_cache_queue.sql"));
  await db.exec(read("20261025_turf_claimed.sql"));
  return db;
}

const db = await base(true);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const sentCount = async () => Number((await one("select count(*) n from net.sent")).n);
const lastSent = async () => (await one("select body from net.sent order by id desc limit 1"))?.body ?? null;
const state = async () => one("select version, n, parts, cols, hash, built_at, part_bytes from private.turf_list_state");
// Row JSON bytes per current part, as the build measures them (jsonb text).
const partBytes = async () =>
  (await q(`select p.part, json_array_length(p.rows) n,
                   (select sum(octet_length(e::jsonb::text)) from json_array_elements(p.rows) e)::int bytes,
                   (select max(octet_length(e::jsonb::text)) from json_array_elements(p.rows) e)::int widest
              from private.turf_list_parts p join private.turf_list_state s on s.id and p.version = s.version and p.part < s.parts
             order by p.part`));
const meta = async () => (await one("select public.turf_list_version() m")).m;
const part = async (i) => (await one("select public.turf_list_part($1) p", [i])).p;
const allRows = async () => {
  const m = await meta();
  const out = [];
  for (let i = 0; i < m.parts; i++) out.push(...(await part(i)).rows);
  return out;
};
// Pretend some minutes went by for the list queue: its stamps and the last list post move back together.
const later = async (min) => {
  await q(`update private.cache_list_dirty set first_at = first_at - $1::interval, last_at = last_at - $1::interval, posted_at = posted_at - $1::interval`, [`${min} minutes`]);
  await q(`update private.cache_list_state set last_post = last_post - $1::interval where id`, [`${min} minutes`]);
};
const ACTIVE = 1234;
const PICK = "turf-7"; // pune, rated

// 1. Before: every row write also posts itself to /api/revalidate.
let before = await sentCount();
await q(`update public.turfs set name = name || ' x' where slug = $1`, [PICK]);
eq(await sentCount(), before + 1, "the old webhook posts each changed row");
ok((await lastSent()).record?.slug === PICK, "as a legacy {record} payload");

// 2. 20261026_cache_legacy_webhook_off.sql (twice): the triggers stay, the posts stop, the queue still notes keys.
for (let i = 0; i < 2; i++) await db.exec(read(NEW[0]));
before = await sentCount();
await q(`update public.turfs set name = name || ' y' where slug = $1`, [PICK]);
await q(`insert into public.trending_turfs (city, turf_id, starts_at, ends_at) select city, id, now() - interval '1 minute', now() + interval '1 day' from public.turfs where slug = $1`, [PICK]);
eq(await sentCount(), before, "no post from the webhook any more");
ok((await one(`select name from public.turfs where slug = $1`, [PICK])).name.endsWith(" y"), "the write itself went through");
eq((await one(`select count(*)::int n from pg_trigger where tgname in ('on_turfs_change_notify_revalidate', 'on_trending_change_notify_revalidate')`)).n, 2, "both triggers are still there");
ok((await one(`select count(*)::int n from private.cache_dirty where key = 'list:pune'`)).n === 1, "the queue noted the list key as before");
eq((await one(`select has_function_privilege('anon', 'public.notify_turf_change()', 'execute') x`)).x, false, "anon cannot call it");

// 3. 20261026_cache_list_cap.sql (twice): list keys go to cache_list_dirty, turf keys stay in cache_dirty.
for (let i = 0; i < 2; i++) await db.exec(read(NEW[1]));
eq((await one(`select count(*)::int n from cron.job where jobname = 'flush-lists'`)).n, 1, "one flush-lists job");
await q(`insert into public.turfs (slug, name, city, is_active, rating) select 'udaipur-' || g, 'Udaipur ' || g, 'udaipur', true, 4 from generate_series(1, 50) g`);
eq((await q(`select key, posted_at from private.cache_list_dirty where key = 'list:udaipur'`)), [{ key: "list:udaipur", posted_at: null }], "a 50-row import: one waiting list row");
eq((await one(`select count(*)::int n from private.cache_dirty where key like 'turf:udaipur-%'`)).n, 50, "and its 50 turf pages in cache_dirty");
eq((await one(`select count(*)::int n from private.cache_dirty where key = 'list:udaipur'`)).n, 0, "no new list key in cache_dirty");
await q(`update public.turfs set description = 'Three grounds' where slug = 'turf-9'`);
eq((await one(`select count(*)::int n from private.cache_list_dirty where key = 'list:' || (select city from public.turfs where slug = 'turf-9') and last_at > now()`)).n, 0, "a detail-only change queues no list key");
// Settle the queue as it stands, so later checks start clean.
await q(`update private.cache_list_dirty set posted_at = now()`);

// 4. 20261026_cache_list_snapshot.sql: the first apply builds version 1, the second changes nothing.
await db.exec(read(NEW[2]));
const s0 = await state();
eq([Number(s0.version), s0.n, s0.part_bytes], [1, ACTIVE + 50, 1000000], "version 1: every active turf, parts of up to 1 MB");
const bytes0 = await partBytes();
eq(bytes0.reduce((a, p) => a + p.n, 0), ACTIVE + 50, "the parts hold every row");
ok(bytes0.every((p) => p.bytes <= 1000000 + p.widest), "no part over 1 MB plus one row");
// Smaller parts, so the rules for many parts get exercised (and a tuned part size rebuilds).
await q("update private.turf_list_state set part_bytes = 100000 where id");
eq((await one("select private.build_turf_list() b")).b, true, "a new part size is a new version");
await db.exec(read(NEW[2]));
const s1 = await state();
eq([Number(s1.version), s1.n, s1.part_bytes], [2, ACTIVE + 50, 100000], "applying it again keeps the version and the part size");
const V = Number(s1.version);
eq((await one("select private.build_turf_list() b")).b, false, "a build with nothing changed returns false");
const bytes1 = await partBytes();
eq(bytes1.length, s1.parts, "parts 0 to parts-1 are stored for the version");
ok(s1.parts >= 5, `many parts (${s1.parts})`);
ok(bytes1.every((p) => p.bytes <= 100000 + p.widest), "every part is at most part_bytes plus one row");
ok(bytes1.slice(0, -1).every((p) => p.bytes >= 100000 - p.widest), "and every part but the last is full");

const m1 = await meta();
eq(Object.keys(m1).sort(), ["age_s", "built", "cols", "n", "parts", "v"], "turf_list_version: v, n, parts, cols, age_s, built");
eq(m1.cols, card.join(", "), "cols is CARD_COLUMNS, as the app joins them");
eq([m1.v, m1.n, m1.age_s], [V, ACTIVE + 50, 0], "fresh");
eq(m1.built, Number((await one("select floor(extract(epoch from built_at) * 1000)::bigint b from private.turf_list_state")).b), "built: the last build, epoch ms");
eq(await part(m1.parts), null, "no part past the last");
eq(await part(-1), null, "no negative part");
const p0 = await part(0);
eq([p0.v, p0.n, p0.parts, p0.rows.length], [V, ACTIVE + 50, m1.parts, bytes1[0].n], "part 0: its rows with the version's numbers");
const rows1 = await allRows();
eq(rows1.length, m1.n, "the parts add up to n");
eq(new Set(rows1.map((r) => r.id)).size, m1.n, "no turf twice");
eq(rows1.every((r) => r.is_active === true), true, "active turfs only");
const want = (await q(`select id from public.turfs where is_active order by rating desc, id`)).map((r) => r.id);
eq(rows1.map((r) => r.id), want, "rating high to low (no rating first), then id: the order the pages read");
eq([...new Set(rows1.flatMap((r) => Object.keys(r)))].sort(), [...card].sort(), "exactly the card columns: no description, owner_phone or rn__");
const r7 = rows1.find((r) => r.slug === "turf-7");
eq([r7.start_time, r7.morning_price, r7.sports, r7.claimed], ["06:00:00", 800, ["Football", "Box Cricket"], false], "values as PostgREST returns them");

// 5. Privileges: anon reads the two RPCs and nothing else.
for (const [what, sql, want_] of [
  ["turf_list_version", `select has_function_privilege('anon', 'public.turf_list_version()', 'execute') x`, true],
  ["turf_list_part", `select has_function_privilege('anon', 'public.turf_list_part(integer)', 'execute') x`, true],
  ["build_turf_list", `select has_function_privilege('anon', 'private.build_turf_list()', 'execute') x`, false],
  ["flush_lists", `select has_function_privilege('anon', 'private.flush_lists()', 'execute') x`, false],
  ["turf_list_parts", `select has_table_privilege('anon', 'private.turf_list_parts', 'select') x`, false],
  ["turf_list_state", `select has_table_privilege('authenticated', 'private.turf_list_state', 'select') x`, false],
]) eq((await one(sql)).x, want_, `anon/authenticated ${want_ ? "can" : "cannot"} use ${what}`);
await db.exec("set role anon");
eq((await one("select (public.turf_list_part(0) ->> 'v')::int v")).v, V, "anon reads a part through the RPC");
await db.exec("reset role");

// 6. flush_lists: nothing before the changes settle; then it builds and posts in one tick.
await q(`update public.turfs set rating = 4.95, name = 'Seven' where slug = $1`, [PICK]);
before = await sentCount();
await q("select private.flush_lists()");
eq([await sentCount(), Number((await state()).version)], [before, V], "a change 0 s old: no post, no build");
await later(1);
await q("select private.flush_lists()");
eq(await sentCount(), before + 1, "45 s later: one post");
eq((await lastSent()).keys, ["list:pune"], "with the waiting list key only");
const s2 = await state();
eq(Number(s2.version), V + 1, "and the rows were built first: a new version");
ok((await allRows()).find((r) => r.slug === PICK)?.name === "Seven", "the posted change is in the rows");
eq((await one(`select count(*)::int n from private.cache_list_dirty where posted_at is null`)).n, 0, "nothing left waiting");
const req2 = Number((await one("select last_request r from private.cache_list_state")).r);
await q("insert into net._http_response (id, status_code) values ($1, 200)", [req2]);

// 7. A second change inside the gap waits; after the gap it goes, built again.
await q(`update public.turfs set name = 'Seven again' where slug = $1`, [PICK]);
await later(1);
before = await sentCount();
await q("select private.flush_lists()");
eq([await sentCount(), Number((await state()).version)], [before, V + 1], "inside the 15 min gap: no post, no build");
await later(16);
await q("select private.flush_lists()");
eq(await sentCount(), before + 1, "after the gap: posted");
eq(Number((await state()).version), V + 2, "built again first");

// 8. A post that got no 2xx goes again at the next window; nothing changed, so the version stays.
await later(16);
before = await sentCount();
await q("select private.flush_lists()");
eq(await sentCount(), before + 1, "the unanswered post is sent again");
eq((await lastSent()).keys, ["list:pune"], "with the same keys");
eq(Number((await state()).version), V + 2, "an unchanged build keeps the version");
await q("insert into net._http_response (id, status_code) values ((select last_request from private.cache_list_state), 200)");

// 9. A tick that posts nothing still rebuilds hourly, which catches a write no trigger saw.
await db.exec(`alter table public.turfs disable trigger user`);
await q(`update public.turfs set total_reviews = 999 where slug = 'turf-8'`);
await db.exec(`alter table public.turfs enable trigger user`);
await q("update private.turf_list_state set built_at = built_at - interval '2 hours'");
before = await sentCount();
await q("select private.flush_lists()");
eq(await sentCount(), before, "no post");
eq(Number((await state()).version), V + 3, "but the hourly build moved the version");
eq((await meta()).age_s, 0, "and stamped built_at");
ok((await allRows()).find((r) => r.slug === "turf-8")?.total_reviews === 999, "with the unseen write in it");
await q("select private.flush_lists()");
eq(Number((await state()).version), V + 3, "not again within the hour");

// 9b. The keys a post carries: only those whose last change was committed before the build began.
await q(`update public.turfs set name = 'Seven late' where slug = $1`, [PICK]);
// As if list:pune was changed again by a transaction that commits after the build's snapshot.
await q(`update private.cache_list_dirty set marked_xid = (pg_current_xact_id()::text::bigint + 1000000)::text::xid8 where key = 'list:pune'`);
await later(20);
before = await sentCount();
const vLate = Number((await state()).version);
await q("select private.flush_lists()");
eq(await sentCount(), before, "a key changed after the build began is not posted with that build");
eq(Number((await state()).version), vLate + 1, "the build itself ran (it has the committed change)");
eq((await one(`select posted_at from private.cache_list_dirty where key = 'list:pune'`)).posted_at, null, "the key still waits");
await q(`update private.cache_list_dirty set marked_xid = pg_current_xact_id() where key = 'list:pune'`);
await q("select private.flush_lists()");
eq([await sentCount(), (await lastSent()).keys], [before + 1, ["list:pune"]], "once that change is committed, the next tick posts it");
await q("insert into net._http_response (id, status_code) values ((select last_request from private.cache_list_state), 200)");
// A key the flush's own transaction marked (as the SQL tests do) goes out with that build.
await later(20);
before = await sentCount();
await db.exec(`begin;
  update public.turfs set name = 'Seven own' where slug = '${PICK}';
  update private.cache_list_dirty set first_at = now() - interval '4 minutes', last_at = now() - interval '4 minutes' where key = 'list:pune';
  select private.flush_lists();
  commit;`);
eq(await sentCount(), before + 1, "a key marked by the flushing transaction itself is posted");
ok((await allRows()).find((r) => r.slug === PICK)?.name === "Seven own", "with its change in the rows");
await q("insert into net._http_response (id, status_code) values ((select last_request from private.cache_list_state), 200)");
// The build runs before the waiting keys are locked (so turf writers never wait for it).
const flushSrc = (await one(`select prosrc from pg_proc where oid = 'private.flush_lists()'::regprocedure`)).prosrc;
ok(flushSrc.indexOf("perform private.build_turf_list()") < flushSrc.indexOf("for update of d skip locked\n    ) s;"), "flush_lists builds before it locks the keys it posts");
eq((await one(`select command from cron.job where jobname = 'flush-lists'`)).command, "set statement_timeout = '30s'; select private.flush_lists()", "the cron tick is bounded to 30 s");

// 9c. Re-running the cap after the snapshot keeps the snapshot's flush_lists (the one that builds).
await db.exec(read(NEW[1]));
ok((await one(`select prosrc from pg_proc where oid = 'private.flush_lists()'::regprocedure`)).prosrc.includes("build_turf_list"), "the cap file again: flush_lists still builds");
eq((await one(`select command from cron.job where jobname = 'flush-lists'`)).command, "set statement_timeout = '30s'; select private.flush_lists()", "and the cron command is the same");
await q(`update public.turfs set name = 'Seven after cap' where slug = $1`, [PICK]);
await later(20);
before = await sentCount();
const vCap = Number((await state()).version);
await q("select private.flush_lists()");
eq([await sentCount(), Number((await state()).version)], [before + 1, vCap + 1], "a post still builds first");
await q("insert into net._http_response (id, status_code) values ((select last_request from private.cache_list_state), 200)");
await db.exec(read(NEW[2]));

// 9d. One row wider than a part: it gets a part of its own, and the parts stay numbered 0, 1, 2...
await q(`update public.turfs set image_review = (select jsonb_agg(jsonb_build_object('url', 'https://example.com/' || g || repeat('x', 200), 'usable', true)) from generate_series(1, 1000) g)
          where slug = 'turf-11'`);
eq((await one("select private.build_turf_list() b")).b, true, "the wide row is a change");
const wide = await partBytes();
const wideAt = wide.findIndex((p) => p.widest > 100000);
ok(wideAt >= 0 && wide[wideAt].bytes <= 100000 + wide[wideAt].widest, `the wide row (${wide[wideAt]?.widest} bytes) sits in one part`);
eq(wide.map((p) => p.part), wide.map((_, i) => i), "parts stay contiguous");
eq((await allRows()).length, ACTIVE + 50, "and add up");
await q(`update public.turfs set image_review = null where slug = 'turf-11'`);
await q("select private.build_turf_list()");

// 10. A shorter list: the part left over from the longer one is never served.
const partsBefore = (await state()).parts;
await q(`update public.turfs set is_active = false where slug like 'turf-%' and split_part(slug, '-', 2)::int between 1 and 700`);
eq((await one("select private.build_turf_list() b")).b, true, "deactivations change the list");
const s5 = await state();
ok(s5.parts < partsBefore, `fewer parts (${partsBefore} to ${s5.parts})`);
eq((await one(`select count(*)::int n from private.turf_list_parts where part = $1`, [partsBefore - 1])).n, 1, "the old last part is still stored");
eq(await part(partsBefore - 1), null, "but not served");
eq((await allRows()).length, s5.n, "the current parts add up");
// A part of another version is never served, even at an index the current version has.
await q(`update private.turf_list_parts set version = version - 1 where part = 0`);
eq(await part(0), null, "a part from another version: null");
await q(`update private.turf_list_parts set version = version + 1 where part = 0`);

// 11. No active turf at all: the build raises, the tick posts nothing, the last list stays.
await q(`update public.turfs set is_active = false where is_active`);
await later(20);
before = await sentCount();
const v5 = Number(s5.version);
await assert.rejects(q("select private.flush_lists()"), /no active turfs/, "the tick fails");
passed++;
eq(await sentCount(), before, "nothing was posted");
ok((await one(`select count(*)::int n from private.cache_list_dirty where posted_at is null`)).n > 0, "the keys still wait");
eq([Number((await state()).version), (await meta()).v], [v5, v5], "the last list keeps serving");
await assert.rejects(q("select private.build_turf_list()"), /no active turfs/);
passed++;

// 12. A database with no active turfs at all (a fresh branch): every file applies, version stays 0, the RPCs answer null.
const empty = await base(false);
for (const f of NEW) for (let i = 0; i < 2; i++) await empty.exec(read(f));
eq((await empty.query("select public.turf_list_version() m, public.turf_list_part(0) p")).rows[0], { m: null, p: null }, "an empty database: no snapshot, null answers");
await empty.query(`insert into public.turfs (slug, name, city, is_active, rating) values ('a', 'A', 'pune', true, 4)`);
eq((await empty.query("select private.build_turf_list() b")).rows[0].b, true, "the first turf builds version 1");
eq((await empty.query("select (public.turf_list_version() ->> 'v')::int v")).rows[0].v, 1, "and it is served");

console.log(`cache_list_snapshot: ${passed} checks passed`);
