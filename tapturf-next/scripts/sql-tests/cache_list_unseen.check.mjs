// Applies 20261110_cache_list_unseen.sql to an in-memory Postgres (PGlite)
// on top of the cache queue and list snapshot as production has them
// (20261019_revalidate_skip_photo_only.sql, 20261020_cache_queue.sql,
// 20261025_turf_claimed.sql, then the three 20261026 cache files), with the
// same stand-ins for pg_net (net.http_post records each post in net.sent)
// and pg_cron as cache_list_snapshot.check.mjs (its setup, copied), and
// checks that both builds queue the keys of exactly the turfs they found
// changed by a write no trigger saw: their city's list key (old and new
// city) and their page key (old and new slug). The hourly build: nothing
// when nothing changed, nothing within the hour, the next list post
// carries them. The build before a list post: the lists no waiting key
// carries go out with that same post (and again after a failed post), the
// pages to flush_cache. The new file is applied twice (safe to run again).
// Never touches a real database. Time moves by shifting the stored
// timestamps back.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/cache_list_unseen.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const DIR = process.argv[2] ?? "supabase/migrations";
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");
const FILE = "20261110_cache_list_unseen.sql";
const BASE = ["20261026_cache_legacy_webhook_off.sql", "20261026_cache_list_cap.sql", "20261026_cache_list_snapshot.sql"];
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

{
  const sql = read(FILE);
  // Substrings, not words: a comment naming one counts too.
  assert.doesNotMatch(sql, /drop|delete|truncate/i, `${FILE}: nothing dropped, deleted or truncated`);
  assert.doesNotMatch(sql, /[—–]/, `${FILE}: no em or en dashes`);
  passed += 2;
}

// The body this file replaces is the one production runs (md5 of prosrc, read with a SELECT on 10 Nov).
const bodyOf = (sql, fn) => {
  const i = sql.indexOf(`create or replace function ${fn}`);
  const s = sql.indexOf("as $$", i) + 5;
  return sql.slice(s, sql.indexOf("$$;", s));
};
const md5 = (s) => createHash("md5").update(s).digest("hex");
eq(md5(bodyOf(read(BASE[2]), "private.flush_lists()")), "f6f50f906813b213c5675f8c1bba82cc", "the replaced flush_lists is production's");
eq(md5(bodyOf(read(BASE[2]), "private.build_turf_list()")), "ea7f6e22f13d268e2d4bc66910d40fa5", "build_turf_list as production has it (unchanged here)");
{
  const before = bodyOf(read(BASE[2]), "private.flush_lists()");
  const after = bodyOf(read(FILE), "private.flush_lists()");
  const BUILD = "    -- The rows first, holding no key's lock";
  const decl = (b) => b.replace("  v_snap   pg_snapshot;\n", "  v_snap   pg_snapshot;\n  v_before jsonb;\n  v_found  text[];\n  v_pages  text[];\n  v_more   text[];\n");
  ok(before.indexOf(BUILD) > 0 && after.startsWith(decl(before.slice(0, before.indexOf(BUILD)))), "everything before the post's build is unchanged");
  // The waiting keys are still chosen as before (skip locked, the snapshot rule), and only they are marked posted by the post itself.
  const pick = before.slice(before.indexOf("    select array_agg(key order by key) into v_keys"), before.indexOf("    if v_keys is null then"));
  ok(pick.length > 100 && after.includes(pick), "the waiting keys are picked as before");
  ok(after.includes("    update private.cache_list_dirty set posted_at = v_now where key = any (v_keys);"), "and marked posted as before");
}

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
for (const f of BASE) await db.exec(read(f));
for (let i = 0; i < 2; i++) await db.exec(read(FILE));

const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const sentCount = async () => Number((await one("select count(*) n from net.sent")).n);
const lastSent = async () => (await one("select body from net.sent order by id desc limit 1"))?.body ?? null;
const version = async () => Number((await one("select version from private.turf_list_state")).version);
const waitingLists = async () => (await q("select key from private.cache_list_dirty where posted_at is null order by key")).map((r) => r.key);
const waitingPages = async () => (await q("select key from private.cache_dirty where sent_at is null order by key")).map((r) => r.key);
const later = async (min) => {
  await q(`update private.cache_list_dirty set first_at = first_at - $1::interval, last_at = last_at - $1::interval, posted_at = posted_at - $1::interval`, [`${min} minutes`]);
  await q(`update private.cache_list_state set last_post = last_post - $1::interval where id`, [`${min} minutes`]);
};
const hourLater = () => q("update private.turf_list_state set built_at = built_at - interval '2 hours'");
// A write no trigger sees (a bulk fix run with triggers off).
const unseen = async (sql, params) => {
  await db.exec(`alter table public.turfs disable trigger user`);
  await q(sql, params);
  await db.exec(`alter table public.turfs enable trigger user`);
};
const settle = async () => {
  await q("update private.cache_dirty set sent_at = now() where sent_at is null");
  await q("update private.cache_list_dirty set posted_at = now() where posted_at is null");
};
const cityOf = async (slug) => (await one("select city from public.turfs where slug = $1", [slug])).city;

await settle();
const V = await version();
ok(V >= 1, "the snapshot was built");

// 1. The hourly tick with nothing changed queues nothing.
await hourLater();
let before = await sentCount();
await q("select private.flush_lists()");
eq(await version(), V, "nothing changed: same version");
eq([await waitingLists(), await waitingPages(), await sentCount()], [[], [], before], "and nothing queued or posted");

// 2. A price changed with triggers off: the hourly build queues its city's lists and its page, nothing else.
const c8 = await cityOf("turf-8");
await unseen(`update public.turfs set morning_price = 1234 where slug = 'turf-8'`);
eq([await waitingLists(), await waitingPages()], [[], []], "the write itself queued nothing (no trigger saw it)");
await q("select private.flush_lists()");
eq(await version(), V, "within the hour: no build, nothing queued");
eq(await waitingLists(), [], "still nothing");
await hourLater();
before = await sentCount();
await q("select private.flush_lists()");
eq(await version(), V + 1, "the hourly build moved the version");
eq(await sentCount(), before, "this tick posts nothing");
eq(await waitingLists(), [`list:${c8}`], "its city's lists wait for the next list post");
eq(await waitingPages(), ["turf:turf-8"], "its page waits for flush_cache's next post");

// 3. The next list post carries them (after the gap), building again with nothing new.
await later(20);
before = await sentCount();
await q("select private.flush_lists()");
eq(await sentCount(), before + 1, "posted");
eq((await lastSent()).keys, [`list:${c8}`], "with exactly that city's key");
eq(await version(), V + 1, "the build before the post found nothing new");
await q("insert into net._http_response (id, status_code) values ((select last_request from private.cache_list_state), 200)");
await settle();

// 4. A city move, a deactivation and a new slug, all unseen, in one hourly build.
const c9 = await cityOf("turf-9");
const to = c9 === "pune" ? "nashik" : "pune";
const c10 = await cityOf("turf-10");
const c11 = await cityOf("turf-11");
await unseen(`update public.turfs set city = $1 where slug = 'turf-9'`, [to]);
await unseen(`update public.turfs set is_active = false where slug = 'turf-10'`);
await unseen(`update public.turfs set slug = 'turf-eleven' where slug = 'turf-11'`);
await hourLater();
await q("select private.flush_lists()");
eq(await version(), V + 2, "one more version");
eq(await waitingLists(), [...new Set([`list:${c9}`, `list:${to}`, `list:${c10}`, `list:${c11}`])].sort(), "the old and new city of the move, the deactivated turf's city, the renamed turf's city");
eq(await waitingPages(), ["turf:turf-10", "turf:turf-11", "turf:turf-9", "turf:turf-eleven"], "each page, the old and the new slug");
await settle();

// 5. A turf that becomes active unseen: its city and page.
const c1240 = await cityOf("turf-1240");
await unseen(`update public.turfs set is_active = true where slug = 'turf-1240'`);
await hourLater();
await q("select private.flush_lists()");
eq([await waitingLists(), await waitingPages()], [[`list:${c1240}`], ["turf:turf-1240"]], "an activated turf: its city and its page");
await settle();

// 6. A column no list shows, changed unseen: the version stays, nothing is queued.
await unseen(`update public.turfs set description = 'unseen detail' where slug = 'turf-12'`);
await hourLater();
const v6 = await version();
await q("select private.flush_lists()");
eq([await version(), await waitingLists(), await waitingPages()], [v6, [], []], "no list column changed: nothing");

// 7a. The build before a list post takes in a write no trigger saw (the
// review's case): an unseen price change in one city, then a normal edit
// in another. The post carries both cities; the unseen turf's page goes to
// flush_cache; nothing is left for the hourly build to find.
{
  await settle();
  const cA = await cityOf("turf-8");
  const other = await one("select slug, city from public.turfs where is_active and city <> $1 and slug <> 'turf-8' order by slug limit 1", [cA]);
  const v0 = await version();
  await unseen(`update public.turfs set morning_price = 4321 where slug = 'turf-8'`);
  await q(`update public.turfs set evening_price = coalesce(evening_price, 0) + 1 where slug = $1`, [other.slug]);
  eq(await waitingLists(), [`list:${other.city}`], "only the seen edit's city waits");
  await later(20);
  before = await sentCount();
  await q("select private.flush_lists()");
  eq(await sentCount(), before + 1, "one post");
  eq((await lastSent()).keys, [`list:${cA}`, `list:${other.city}`].sort(), "with the seen city and the city of the write no trigger saw");
  eq(await version(), v0 + 1, "one build took in both");
  ok((await waitingPages()).includes("turf:turf-8"), "the unseen turf's page waits for flush_cache");
  eq(await waitingLists(), [], "nothing waits");
  eq((await one("select posted_at = (select last_post from private.cache_list_state) p from private.cache_list_dirty where key = $1", [`list:${cA}`])).p, true, "the added city is marked posted with the post");

  // 7b. That post failed (no 2xx): at the next window both cities go again.
  await q("insert into net._http_response (id, status_code) values ((select last_request from private.cache_list_state), 500)");
  await settle();
  await q(`update public.turfs set evening_price = coalesce(evening_price, 0) + 1 where slug = 'turf-15'`);
  const c15 = await cityOf("turf-15");
  await later(20);
  before = await sentCount();
  await q("select private.flush_lists()");
  eq((await lastSent()).keys, [...new Set([`list:${cA}`, `list:${other.city}`, `list:${c15}`])].sort(), "a failed post's cities, the added one too, go again");
  await q("insert into net._http_response (id, status_code) values ((select last_request from private.cache_list_state), 200)");
  await settle();

  // 7c. The hourly tick after all that: the version already holds the unseen write; nothing more.
  await hourLater();
  await later(20);
  before = await sentCount();
  const v1 = await version();
  await q("select private.flush_lists()");
  eq([await version(), await waitingLists(), await waitingPages(), await sentCount()], [v1, [], [], before], "the hourly build finds nothing new");
}

// 7d. An unseen write in the city a post already carries: no key twice.
// A turf a trigger saw gets its page key again (its row changed in this
// build too): one more render of that page, the cost of not missing one.
{
  await settle();
  const cB = await cityOf("turf-20");
  const same = await one("select slug from public.turfs where is_active and city = $1 and slug <> 'turf-20' order by slug limit 1", [cB]);
  await unseen(`update public.turfs set afternoon_price = 999 where slug = 'turf-20'`);
  await q(`update public.turfs set afternoon_price = 998 where slug = $1`, [same.slug]);
  await q("update private.cache_dirty set sent_at = now() where sent_at is null"); // flush_cache posted the seen page already
  await later(20);
  await q("select private.flush_lists()");
  eq((await lastSent()).keys, [`list:${cB}`], "the city once");
  eq(await waitingPages(), [`turf:${same.slug}`, "turf:turf-20"].sort(), "both pages wait: the unseen one, and the seen one again");
  await q("insert into net._http_response (id, status_code) values ((select last_request from private.cache_list_state), 200)");
  await settle();
}

// 7e. A list post whose build changes nothing beyond its keys queues no page
// it did not change: a trending pick (a list key, no list row) posts that key only.
{
  await settle();
  const tid = (await one("select id from public.turfs where slug = 'turf-30'")).id;
  const c30 = await cityOf("turf-30");
  await q("insert into public.trending_turfs (city, turf_id, starts_at, ends_at) values ($1, $2, now(), now() + interval '1 day')", [c30, tid]);
  const lists = await waitingLists();
  await q("update private.cache_dirty set sent_at = now() where sent_at is null");
  const v2 = await version();
  await later(20);
  before = await sentCount();
  await q("select private.flush_lists()");
  if (lists.length) {
    eq((await lastSent()).keys, lists, "the pick's own keys only");
  } else {
    eq(await sentCount(), before, "the pick queued no list key: nothing posted");
  }
  eq([await version(), await waitingPages()], [v2, []], "no row changed: no version, no page queued");
  await q("insert into net._http_response (id, status_code) values ((select last_request from private.cache_list_state), 200)");
  await settle();
}

// 7. The pure comparison: nothing before (a first build) queues nothing; equal maps queue nothing.
eq((await one(`select private.turf_list_changed_keys('{}'::jsonb, private.turf_list_rows_now()) k`)).k, null, "no rows before: nothing");
eq((await one(`select private.turf_list_changed_keys(private.turf_list_rows_now(), private.turf_list_rows_now()) k`)).k, null, "the same rows: nothing");
eq(
  (await one(`select private.turf_list_changed_keys('{"a":["x","Pune City","Some-Slug"]}'::jsonb, '{"a":["y","pune",null]}'::jsonb) k`)).k,
  ["list:all", "list:pune", "turf:a", "turf:some-slug"],
  "an odd city goes to list:all, a slug is lowered, a turf without one keys by id",
);
eq(Object.keys((await one(`select private.turf_list_rows_now() m`)).m).length, Number((await one("select count(*) n from public.turfs where is_active")).n), "one entry per active turf");

// 8. Who may run them: nobody but the owner, as with flush_lists.
for (const fn of ["private.turf_list_rows_now()", "private.turf_list_changed_keys(jsonb, jsonb)", "private.flush_lists()"]) {
  for (const role of ["anon", "authenticated"]) eq((await one(`select has_function_privilege($1, $2, 'execute') x`, [role, fn])).x, false, `${role} cannot run ${fn}`);
}

// 9. The tick's statement is the one the cron runs, and still bounded.
eq((await one(`select command from cron.job where jobname = 'flush-lists'`)).command, "set statement_timeout = '30s'; select private.flush_lists()", "the cron tick is unchanged");

console.log(`cache_list_unseen: ${passed} checks passed`);
