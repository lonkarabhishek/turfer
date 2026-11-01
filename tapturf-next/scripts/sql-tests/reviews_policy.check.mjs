// Applies 20261101_reviews_policy.sql (twice) to an in-memory Postgres (PGlite)
// built by game_reports.db.mjs, on top of the reviews as production has them
// (20261027_game_reports.sql and 20261029_reviews_lockdown_step2.sql), and
// checks: no hold (held reports let through, rivals and rushes live at once,
// an edit of a held report goes live, hidden and removed kept), the daily rule
// (one new report a day; one per turf played at today; edits and posting again
// don't count; India's day), owners' removal requests (only an active owner of
// that turf, one open per report, 10 a day, never shown to the author), the
// site owner's decisions (only them; Remove hides, Keep leaves it), and that
// nothing is ever taken out of a table. Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/reviews_policy.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { KEY, makeDb } from "./game_reports.db.mjs";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261101_reviews_policy.sql`;
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };

const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /drop|delete|truncate/i, "written without the words drop, delete or truncate");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
passed += 2;

// The bodies the file replaces start from production's (pg_proc.prosrc, read 2026-11-01):
// review_save and review_mine are the 20261027_game_reports.sql ones; review_hold on
// production is a one-line "select false" (md5 beff4321e1256e5ef91eb1cbe397111a), set by hand.
const LIVE = {
  "20261027_game_reports.sql:693": "372c46aecfd68554e1046ee23e6122c7", // public.review_save
  "20261027_game_reports.sql:986": "0298872030434cf9fd723e304de99a83", // public.review_mine
};
for (const [at, md5] of Object.entries(LIVE)) {
  const [file, line] = at.split(":");
  const text = fs.readFileSync(`${M}/${file}`, "utf8").split("\n").slice(Number(line) - 1).join("\n");
  assert.match(text, /^create or replace function /, `${at} is a create`);
  const tag = /\$[a-z_]*\$/.exec(text)[0];
  const open = text.indexOf(tag) + tag.length;
  eq(createHash("md5").update(text.slice(open, text.indexOf(tag, open))).digest("hex"), md5, `${at} is the live body`);
}

const db = await makeDb(PGlite, M);
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
// game_requests as on production (the daily rule counts an accepted request as joining).
await db.exec(`create table public.game_requests (id uuid primary key default gen_random_uuid(), game_id uuid, user_id uuid, note text,
  status text default 'pending', created_at timestamptz default now(), responded_at timestamptz, requester_name varchar, updated_at timestamptz default now())`);
await db.exec(fs.readFileSync(`${M}/20261027_game_reports.sql`, "utf8"));
await db.exec(fs.readFileSync(`${M}/20261029_reviews_lockdown_step2.sql`, "utf8"));
// The site owner's sign-in, made up (the stand-in _can_manage lets it manage every turf).
await db.exec(`create or replace function public._is_admin_key(p_key text) returns boolean language sql immutable as $$ select p_key = 'p:9000000099' $$`);

const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const T = (i) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`;
const G = (i) => `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}`;
const phone = (i) => `+9190000000${String(i).padStart(2, "0")}`;
const tok = (i) => `phone:90000000${String(i).padStart(2, "0")}`;
for (let i = 1; i <= 30; i++) await q(`insert into public.users (id, name, phone, created_at) values ($1, $2, $3, now() - interval '1 year')`, [U(i), `Player ${i}`, phone(i)]);
await q(`insert into public.users (id, name, created_at) values ('${U(99)}', 'Site Owner', now() - interval '1 year')`);
for (let i = 1; i <= 9; i++) await q(`insert into public.turfs (id, name, slug, city, sports) values ($1, $2, $3, 'pune', '["Football", "Box Cricket"]')`, [T(i), `Turf ${i}`, `turf-${i}`]);
await q(`insert into public.turfs (id, name, slug, city, sports, owner_id) values ('${T(10)}', 'Owner Id Turf', 'owner-id-turf', 'pune', '["Football"]', '${U(25)}')`);
// Owners: U20 active on T1 (account claim), U21 active on T1 (an old claim under the key alone),
// U22 pending on T1, U23 rejected on T1, U24 active on T2 only, U25 owner_id of T10 only.
await q(`insert into public.turf_owners (turf_id, user_key, status, via, user_id) values
  ('${T(1)}', 'p:9000000020', 'active', 'phone_match', '${U(20)}'),
  ('${T(1)}', 'p:9000000021', 'active', 'admin', null),
  ('${T(1)}', 'p:9000000022', 'pending', 'admin', '${U(22)}'),
  ('${T(1)}', 'p:9000000023', 'rejected', 'admin', '${U(23)}'),
  ('${T(2)}', 'p:9000000024', 'active', 'phone_match', '${U(24)}')`);

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
const status = async (user, turf) => (await one(`select status from public.reviews where user_id = $1 and turf_id = $2 and source is null`, [user, turf]))?.status;
const reviewId = async (user, turf) => (await one(`select id from public.reviews where user_id = $1 and turf_id = $2 and source is null`, [user, turf])).id;
// Every day starts fresh: the saves and reports so far move a day back (the per-account limits are per day too).
const nextDay = async () => {
  await q(`update private.review_saves set saved_at = saved_at - interval '1 day'`);
  await q(`update public.reviews set created_at = created_at - interval '1 day'`);
};
const today = (await one(`select (now() at time zone 'Asia/Kolkata')::date::text d`)).d;

// A report held under the old rule, from before this file (set as the old review_hold would have).
const old = await save(U(1), T(3), { rating: 2, comment: "Held under the old rule" });
await q(`update public.reviews set status = 'held' where id = $1`, [old.review.id]);
await q(`insert into public.reviews (user_id, turf_id, rating, comment, source, external_review_id, author_name) values ('${U(99)}', '${T(1)}', 4, 'Google row', 'google', 'g-1', 'A Googler')`);
const googleId = (await one(`select id from public.reviews where source = 'google'`)).id;

const sigs = async () => (await q(`select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' s from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.proname in ('review_save', 'review_mine', 'review_hold', 'review_remove', 'review_vote', 'turf_page') order by 1`)).map((r) => r.s);
const sigsBefore = await sigs();

await db.exec(sql);
await db.exec(sql); // safe to run again
passed++;
eq(await sigs(), sigsBefore, "the replaced functions keep their exact signatures");

/* ---------------- 1. no hold ---------------- */
eq(await status(U(1), T(3)), "live", "a report still held from before is let through");
eq((await one(`select private.review_hold($1, $2) h`, [U(1), T(3)])).h, false, "review_hold answers false");
// A rival: U24 manages T2 in the same city. Under the old rule its report on T1 was held.
const rival = await save(U(24), T(1), { rating: 1, comment: "Rival's report" });
eq([rival.r, rival.review.status], ["ok", "live"], "a report from an account that manages a turf in the same city goes live at once");
await nextDay();
// A rush on one turf from accounts under 3 days old: held from the 3rd under the old rule.
for (const i of [11, 12, 13]) await q(`update public.users set created_at = now() - interval '1 hour' where id = $1`, [U(i)]);
const rush = [];
for (const i of [11, 12, 13]) rush.push((await save(U(i), T(4), { rating: 1 })).review.status);
eq(rush, ["live", "live", "live"], "a rush of new accounts on one turf: every report live");
ok((await page("turf-4")).reviews.length === 3, "and all three are on the page");
// An edit of a held report goes live; hidden stays hidden; removed comes back live when posted again.
await q(`update public.reviews set status = 'held' where user_id = $1 and turf_id = $2`, [U(11), T(4)]);
eq((await save(U(11), T(4), { rating: 3 })).review.status, "live", "an edit of a held report goes live");
await q(`update public.reviews set status = 'hidden' where user_id = $1 and turf_id = $2`, [U(12), T(4)]);
eq((await save(U(12), T(4), { rating: 5 })).review.status, "hidden", "an author's edit keeps the site owner's hide");
await remove(U(13), T(4));
eq(await status(U(13), T(4)), "removed", "an author's removal stays removed");
eq((await save(U(13), T(4), { rating: 4 })).review.status, "live", "and posting again brings it back live");
await nextDay();

/* ---------------- 2. one new report a day ---------------- */
// U2 has played no TapTurf game today: one new report.
const a1 = await save(U(2), T(1), { rating: 4 });
eq([a1.r, a1.review.status], ["ok", "live"], "the day's first new report posts");
let m2 = await mine(U(2), T(2));
eq(m2.daily, { allowed: 1, posted: 1, played: 0, full: true }, "review_mine on another turf: the day's one is used (the sheet says so before anything is typed)");
eq((await mine(U(2), T(1))).daily.full, false, "on the turf they posted on today: not full (an edit, or posting it again)");
const a2 = await save(U(2), T(2), { rating: 3, comment: "Second one today" });
eq(a2, { r: "limit", why: "daily", allowed: 1, played: 0 }, "a second new report the same day: limit, why daily (an older app reads it as the plain limit)");
eq((await one(`select count(*)::int n from public.reviews where user_id = $1 and turf_id = $2`, [U(2), T(2)])).n, 0, "and nothing is written");
const edits = [];
for (let i = 0; i < 4; i++) edits.push((await save(U(2), T(1), { rating: (i % 5) + 1, comment: `Edit ${i}` })).r);
eq(edits, ["ok", "ok", "ok", "ok"], "edits of their own report never count");
await remove(U(2), T(1));
eq((await save(U(2), T(1), { rating: 5 })).r, "ok", "taking it off and posting it again on the same turf the same day doesn't count twice");
eq((await save(U(2), T(2), { rating: 3 })).r, "limit", "still one turf a day");

// U3 played at two turfs today: hosted at T1 (morning) and joined at T2 (a participant row).
await q(`insert into public.games (id, creator_id, turf_id, sport, date, start_time, end_time, status) values
  ('${G(1)}', '${U(3)}', '${T(1)}', 'Football', date '${today}', '00:00', '01:00', 'completed'),
  ('${G(2)}', '${U(4)}', '${T(2)}', 'Football', date '${today}', '00:00', '01:00', 'open')`);
await q(`insert into public.game_participants (game_id, user_id) values ('${G(2)}', '${U(3)}')`);
eq((await mine(U(3), T(5))).daily, { allowed: 2, posted: 0, played: 2, full: false }, "played at two turfs today: two new reports");
eq([(await save(U(3), T(1), { rating: 5 })).r, (await save(U(3), T(2), { rating: 4 })).r], ["ok", "ok"], "both post");
eq(await save(U(3), T(5), { rating: 3 }), { r: "limit", why: "daily", allowed: 2, played: 2 }, "a third turf the same day: limit");
// The host of the T2 game played there too (one turf): one report, at any turf.
eq((await mine(U(4), T(2))).daily, { allowed: 1, posted: 0, played: 1, full: false }, "one turf played at today: one report");
// An accepted join request counts as joining; a pending one doesn't.
await q(`insert into public.games (id, creator_id, turf_id, sport, date, start_time, end_time) values
  ('${G(3)}', '${U(9)}', '${T(3)}', 'Football', date '${today}', '00:00', '01:00'),
  ('${G(4)}', '${U(9)}', '${T(4)}', 'Football', date '${today}', '00:00', '01:00')`);
await q(`insert into public.game_requests (game_id, user_id, status) values ('${G(3)}', '${U(5)}', 'accepted'), ('${G(4)}', '${U(5)}', 'pending'), ('${G(4)}', '${U(6)}', 'declined')`);
await q(`insert into public.game_participants (game_id, user_id) values ('${G(1)}', '${U(5)}')`);
eq((await mine(U(5), T(9))).daily.allowed, 2, "an accepted request (T3) and a participant row (T1): two turfs; a pending request doesn't count");
eq((await mine(U(6), T(9))).daily.allowed, 1, "a declined request: one");
// Not played: a game later than now, a cancelled one, or one on another day.
await q(`insert into public.games (id, creator_id, turf_id, sport, date, start_time, end_time, status) values
  ('${G(5)}', '${U(7)}', '${T(5)}', 'Football', ((now() + interval '2 hours') at time zone 'Asia/Kolkata')::date, ((now() + interval '2 hours') at time zone 'Asia/Kolkata')::time, '23:59', 'open'),
  ('${G(6)}', '${U(7)}', '${T(6)}', 'Football', date '${today}', '00:00', '01:00', 'cancelled'),
  ('${G(7)}', '${U(7)}', '${T(7)}', 'Football', date '${today}' - 1, '07:00', '08:00', 'completed'),
  ('${G(8)}', '${U(7)}', '${T(8)}', 'Football', date '${today}', '00:00', '01:00', 'open')`);
eq((await mine(U(7), T(9))).daily, { allowed: 1, posted: 0, played: 1, full: false }, "a game that hasn't started, a cancelled one and yesterday's don't count (only T8)");
// India's day: a report posted just before midnight IST is yesterday's.
await save(U(8), T(1), { rating: 4 });
await q(`update private.review_saves set saved_at = ((date '${today}')::timestamp at time zone 'Asia/Kolkata') - interval '1 minute' where user_id = $1`, [U(8)]);
await q(`update public.reviews set created_at = ((date '${today}')::timestamp at time zone 'Asia/Kolkata') - interval '1 minute' where user_id = $1`, [U(8)]);
eq((await save(U(8), T(2), { rating: 4 })).r, "ok", "a report from just before midnight India time was yesterday's");
// A report written straight to the table today (before the lockdown) counts too.
await q(`insert into public.reviews (user_id, turf_id, rating) values ('${U(10)}', '${T(1)}', 5)`);
eq((await mine(U(10), T(2))).daily.full, true, "a TapTurf report created today without a save row counts");
eq((await mine(U(20), T(1))).daily, null, "review_mine: no daily for a manager of the turf");
eq(Object.keys(await mine(U(2), T(2))).sort(), ["blocked", "daily", "hint", "mine", "my_price", "r", "voted"], "review_mine keeps every key and adds daily");
// The 5 new reports and 20 saves a day stay.
await nextDay();
for (let i = 0; i < 6; i++) await q(`insert into public.games (creator_id, turf_id, sport, date, start_time, end_time) values ('${U(14)}', '${T(1 + i)}', 'Football', date '${today}', '00:00', '01:00')`);
const many = [];
for (let i = 0; i < 6; i++) many.push((await save(U(14), T(1 + i), { rating: 4 })).r);
eq(many, ["ok", "ok", "ok", "ok", "ok", "limit"], "played at 6 turfs today: still 5 new reports a day at most");
eq((await save(U(14), T(6), { rating: 4 })).why, undefined, "the 6th is the old limit (no why)");
await nextDay();

/* ---------------- 3. owners ask TapTurf to take a report off ---------------- */
const ask = (t, review, reason = "not_played", detail = null) => rpc("owner_review_removal_ask", [t, review, reason, detail]);
const target = await reviewId(U(24), T(1)); // the rival's report on T1
const reqRows = async () => q(`select id, review_id, turf_id, asked_key, asked_account, reason, detail, status, decided_at from private.review_removal_requests order by created_at, id`);
const r1 = await ask(tok(20), target, "not_played", "  Never seen this player here.\n\n\n Our booking log has no such game. ");
eq([r1.ok, r1.status, r1.already], [true, "open", undefined], "an active owner of the turf asks");
const row1 = (await reqRows())[0];
eq([row1.review_id, row1.turf_id, row1.asked_account, row1.reason, row1.detail, row1.status], [target, T(1), U(20), "not_played", "Never seen this player here.\n\nOur booking log has no such game.", "open"],
  "the request is kept, with who asked (the account), why and the line cleaned");
eq(await status(U(24), T(1)), "live", "the report stays live while it waits");
ok((await page("turf-1")).reviews.some((r) => r.id === target), "and on the page");
const again = await ask(tok(20), target, "abusive");
eq([again.ok, again.already, again.id], [true, true, r1.id], "asking again while it's open: the same request");
eq((await reqRows()).length, 1, "one open request per report per owner");
const r21 = await ask(tok(21), target, "abusive");
eq([r21.ok, r21.already], [true, undefined], "another active owner of the turf (an old claim under the key) may ask too");
ok((await one(`select asked_account from private.review_removal_requests where id = $1`, [r21.id])).asked_account === U(21), "with their account");
for (const [t, why] of [[tok(22), "a pending claim"], [tok(23), "a rejected claim"], [tok(24), "an owner of another turf"], [tok(25), "turfs.owner_id without a claim"],
  [tok(2), "a player"], ["phone:9000000099", "the site owner (they decide requests, they don't make them)"], [null, "no sign-in"], ["garbage", "a token that opens nothing"]]) {
  eq(await ask(t, target), { error: "forbidden" }, `refused: ${why}`);
}
eq(await ask(tok(20), googleId), { error: "not_found" }, "a Google row: not_found");
eq(await ask(tok(20), "cccccccc-cccc-4ccc-8ccc-0000000000ff"), { error: "not_found" }, "an unknown report: not_found");
eq(await ask(tok(20), await reviewId(U(24), T(1)), "rude"), { error: "bad" }, "a reason off the list: bad");
eq(await ask(tok(20), await reviewId(U(2), T(1)), "other", "x".repeat(301)), { error: "bad" }, "a line over 300 characters: bad");
eq(await ask(tok(20), await reviewId(U(1), T(3))), { error: "forbidden" }, "a report on someone else's turf: forbidden");
await q(`update public.reviews set status = 'hidden' where user_id = $1 and turf_id = $2`, [U(8), T(1)]);
eq(await ask(tok(20), await reviewId(U(8), T(1))), { error: "gone" }, "a report that isn't live: gone");
// 10 a day per owner (by account): U20 asked once; 9 more on other reports on T1, then refused.
const writers = [15, 16, 17, 18, 19, 26, 27, 28, 29, 30].map(U);
for (const u of writers) await q(`insert into public.reviews (user_id, turf_id, rating) values ($1, '${T(1)}', 2)`, [u]);
const asked = [];
for (const u of writers) asked.push((await ask(tok(20), await reviewId(u, T(1)), "other")).error ?? "ok");
eq(asked, [...Array(9).fill("ok"), "limit"], "9 more requests the same day, then the 11th in 24 hours: limit");
// The owner sees their own requests; another owner sees only theirs; others get forbidden.
const mineReq = await rpc("owner_review_removals", [tok(20), T(1)]);
eq([mineReq.requests.length, mineReq.requests.every((x) => x.status === "open")], [10, true], "owner_review_removals: the owner's own requests on this turf");
ok(mineReq.requests.some((x) => x.review_id === target && x.reason === "not_played"), "with the reason given");
eq((await rpc("owner_review_removals", [tok(21), T(1)])).requests.map((x) => x.review_id), [target], "another owner of the turf sees only their own");
eq(await rpc("owner_review_removals", [tok(24), T(1)]), { error: "forbidden" }, "an owner of another turf: forbidden");
eq(await rpc("owner_review_removals", [tok(22), T(1)]), { error: "forbidden" }, "a pending claim: forbidden");
// The author is never told: nothing about a request in what they or anyone else reads.
const authorSees = JSON.stringify([await mine(U(24), T(1)), await page("turf-1"), await rpc("review_save", [KEY, U(24), T(1), JSON.stringify({ rating: 1, comment: "Rival's report", base: target })])]);
ok(!authorSees.includes(r1.id) && !authorSees.includes(r21.id) && !/removal|not_played/.test(authorSees), "the author's own read, the page and a save say nothing of the request");

/* ---------------- 4. the site owner decides ---------------- */
const decide = (id, decision) => rpc("admin_review_removal_decide", ["fb-token", id, decision]);
await db.exec(`set test.owner = 'no'`);
eq(await rpc("admin_review_removals", ["fb-token"]), { error: "forbidden" }, "the queue: only the site owner");
eq(await decide(r1.id, "remove"), { error: "forbidden" }, "deciding: only the site owner");
eq(await status(U(24), T(1)), "live", "and a refused decision changes nothing");
await db.exec(`set test.owner = 'yes'`);
const queue = await rpc("admin_review_removals", [null]);
eq(queue.open, 11, "the queue counts every open request");
const first = queue.requests[0];
eq([first.id, first.status, first.reason, first.turf.name, first.turf.slug, first.review.id, first.review.author, first.review.comment, first.asked_by.name, first.asked_by.kind, first.others],
  [r1.id, "open", "not_played", "Turf 1", "turf-1", target, "Player 24", "Rival's report", "Player 20", "phone", 1],
  "the oldest open first: the report, its author, the turf, who asked and why, and that one other owner asked too");
ok(!/9000000|p:|e:/.test(JSON.stringify(queue)), "no phone number or sign-in key in the queue");
eq((await decide(r21.id, "keep")).status, "kept", "Keep");
eq(await status(U(24), T(1)), "live", "Keep leaves the report live");
eq((await q(`select status from private.review_removal_requests where review_id = $1 order by created_at`, [target])).map((x) => x.status), ["kept", "kept"], "and closes every open request on that report");
const keptAgain = await decide(r1.id, "remove");
eq([keptAgain.ok, keptAgain.status, keptAgain.already], [true, "kept", true], "a decided request stays decided");
eq(await status(U(24), T(1)), "live", "so the report is still live");
// The owner can ask again after a Keep (a day on: their 10 a day are used), and the site owner removes it this time.
await q(`update private.review_removal_requests set created_at = created_at - interval '1 day'`);
const r1b = await ask(tok(20), target, "abusive", "Abusive language in the tip");
eq([r1b.ok, r1b.already], [true, undefined], "after a Keep the owner may ask again");
await q(`delete from private.test_dirty`);
const removed = await decide(r1b.id, "remove");
eq([removed.ok, removed.status, removed.turf_id, removed.review_id, removed.closed], [true, "removed", T(1), target, 1], "Remove");
eq(await status(U(24), T(1)), "hidden", "Remove hides the report");
ok(!(await page("turf-1")).reviews.some((r) => r.id === target), "it is off the page");
eq((await q(`select key, urgent from private.test_dirty`)).map((x) => `${x.key}${x.urgent ? "!" : ""}`), ["turf:turf-1!"], "and the page is queued, urgent");
eq((await mine(U(24), T(1))).mine.status, "hidden", "its author sees it hidden, as for any hide");
eq((await save(U(24), T(1), { rating: 5, comment: "Please put it back" })).review.status, "hidden", "an edit keeps it hidden");
await remove(U(24), T(1));
eq((await save(U(24), T(1), { rating: 5 })).review.status, "hidden", "and so does taking it off and posting again");
eq(await ask(tok(20), target), { error: "gone" }, "a hidden report can't be asked about again");
eq(await decide(r1.id, "maybe"), { error: "bad" }, "a decision off the list: bad");
eq(await decide("cccccccc-cccc-4ccc-8ccc-0000000000ff", "keep"), { error: "not_found" }, "an unknown request: not_found");
const after = await rpc("admin_review_removals", [null]);
eq(after.open, 9, "two closed, nine open");
eq(after.requests.slice(0, 9).every((x) => x.status === "open"), true, "open ones first");
ok(after.requests.some((x) => x.id === r1b.id && x.status === "removed" && x.decided_at), "then the decided ones, with when");
await db.exec(`set test.owner = 'no'`);
eq((await rpc("owner_review_removals", [tok(20), T(1)])).requests.find((x) => x.review_id === target).status, "removed", "the owner sees what TapTurf decided");

/* ---------------- nothing is ever taken out ---------------- */
const counts = await one(`select (select count(*)::int from public.reviews) reviews, (select count(*)::int from private.review_removal_requests) requests,
  (select count(*)::int from private.review_saves) saves`);
eq(counts.requests, 12, "every request is still there (11, and 1 asked again after a Keep): decided ones are updated, never taken out");
const allReviews = (await q(`select id from public.reviews`)).map((r) => r.id);
ok([target, googleId, old.review.id].every((id) => allReviews.includes(id)), "the hidden, Google and once-held reports are all still there");
ok(counts.saves > 0, "and the save history");

/* ---------------- grants ---------------- */
for (const fn of ["owner_review_removal_ask", "owner_review_removals", "admin_review_removals", "admin_review_removal_decide", "review_save", "review_mine"]) {
  const r = await one(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('public', p.oid, 'execute') p, prosecdef, proconfig
                         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname = $1`, [fn]);
  eq([r.a, r.p, r.prosecdef, String(r.proconfig)], [true, false, true, 'search_path=""'], `${fn}: anon may call it (it checks its caller), PUBLIC not; definer, search_path ''`);
}
for (const fn of ["review_hold", "review_daily", "review_owner_claim"]) {
  const r = await one(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') b, prosecdef, proconfig
                         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and proname = $1`, [fn]);
  eq([r.a, r.b, r.prosecdef, String(r.proconfig)], [false, false, true, 'search_path=""'], `private.${fn}: closed to the API roles; definer, search_path ''`);
}
eq((await q(`select grantee from information_schema.role_table_grants where table_schema = 'private' and table_name = 'review_removal_requests' and grantee in ('anon', 'authenticated', 'PUBLIC')`)).length, 0,
  "private.review_removal_requests is closed to the API roles");
await q(`select set_config('request.jwt.claims', '', false)`);
await q(`set role anon`);
await assert.rejects(q(`select * from private.review_removal_requests`), /permission denied/, "anon can't read requests");
await q(`reset role`);
passed++;

console.log(`reviews_policy: ${passed} checks passed`);
