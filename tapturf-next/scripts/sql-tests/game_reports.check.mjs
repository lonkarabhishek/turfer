// Applies 20261027_game_reports.sql (twice) to an in-memory Postgres (PGlite) built
// by game_reports.db.mjs (stand-ins for Supabase, production's reviews tables and
// the live bodies the file replaces), then 20261029_reviews_lockdown_step2.sql and
// its revert, and checks the game reports end to end: the server key, one report
// per account per turf, edits with history, removal, the per-account limits, the
// guard against forged direct writes, managers refused, contact details refused,
// Helpful votes, turf_page and owner_dashboard keeping every key, private notes,
// prices into From players, summary staleness, and the lockdown. Never touches a
// real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/game_reports.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { KEY, LIVE, makeDb } from "./game_reports.db.mjs";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261027_game_reports.sql`;
const LOCK = `${M}/20261029_reviews_lockdown_step2.sql`;
const REVERT = `${M}/../revert/20261029_reviews_lockdown_revert.sql`;
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };

const sql = fs.readFileSync(FILE, "utf8");
const lock = fs.readFileSync(LOCK, "utf8");
const revert = fs.readFileSync(REVERT, "utf8");
for (const s of [sql, lock, revert]) {
  assert.doesNotMatch(s, /\bdrop\b|\bdelete\s+from\b|\btruncate\s+(table\s+)?public\b/i, "nothing dropped or deleted");
  assert.doesNotMatch(s, /[—–]/, "no em or en dashes");
}
assert.doesNotMatch(sql, /revoke\s+insert/i, "the first file closes no write path (the lockdown is its own file)");
assert.match(lock, /revoke insert, update, delete, truncate on public\.reviews, public\.review_votes from anon, authenticated/);
passed += 4;

// The bodies the file replaces are the live ones (md5 of pg_proc.prosrc on production, read 2026-10-26).
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
const asRole = async (role, fn, claims = null) => {
  await q(`select set_config('request.jwt.claims', $1, false)`, [claims ? JSON.stringify(claims) : ""]);
  await q(`set role ${role}`);
  try { return await fn(); } finally { await q("reset role"); await q(`select set_config('request.jwt.claims', '', false)`); }
};

// People, turfs and rows from before the file.
const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const T = (i) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`;
const GOOGLE_USER = U(99);
await q(`insert into public.users (id, name, email, phone) values
  ('${U(1)}', 'Asha Patil', null, '+919000000001'), ('${U(2)}', 'Ravi Kumar', 'ravi@example.com', null),
  ('${U(3)}', 'Neha Shah', null, '+919000000003'), ('${U(4)}', 'Owner Phone', null, '+919000000004'),
  ('${U(5)}', 'Owner Mail', 'owner.mail@example.com', null), ('${U(6)}', 'Pending Claim', null, '+919000000006'),
  ('${U(7)}', 'Owner Id', null, '+919000000007'), ('${U(8)}', 'Staff Says', null, '+919000000008'),
  ('${U(9)}', 'Rejected Claim', null, '+919000000009'), ('${U(10)}', 'Spammer', null, '+919000000010'),
  ('${U(11)}', 'Voter One', null, '+919000000011'), ('${GOOGLE_USER}', 'Google reviewer', null, null)`);
await q(`insert into auth.users (id, email) values ('${U(2)}', 'ravi@example.com')`);
// Accounts from before the file are a year old (a new report from an account under 3 days old can be held).
await q(`update public.users set created_at = now() - interval '1 year'`);
await q(`insert into public.turfs (id, name, slug, city, sports, owner_id) values
  ('${T(1)}', 'Kings Turf', 'kings-turf', 'nashik', '["Box Cricket", "Football"]', '${U(7)}'),
  ('${T(2)}', 'Court Club', 'court-club', 'pune', '["Badminton"]', null),
  ('${T(3)}', 'Closed Turf', 'closed-turf', 'pune', '["Football"]', null)`);
await q(`update public.turfs set is_active = false where id = '${T(3)}'`);
const OLD_TAP = "cccccccc-cccc-4ccc-8ccc-000000000001";
const OLD_G = "cccccccc-cccc-4ccc-8ccc-000000000002";
await q(`insert into public.reviews (id, user_id, turf_id, rating, comment, created_at) values ('${OLD_TAP}', '${U(3)}', '${T(1)}', 5, 'Great turf', now() - interval '40 days')`);
await q(`insert into public.reviews (id, user_id, turf_id, rating, comment, source, external_review_id, author_name, author_url, source_date_label)
         values ('${OLD_G}', '${GOOGLE_USER}', '${T(1)}', 4, 'Nice place to play box cricket', 'google', 'g-1', 'A Googler', 'https://maps.example/u/1', '3 years ago')`);
// Two self-votes and a vote on the Google row: stored, but they stop counting.
await q(`insert into public.review_votes (review_id, user_id) values ('${OLD_TAP}', '${U(3)}'), ('${OLD_TAP}', '${U(1)}'), ('${OLD_G}', '${U(1)}')`);
const pageBefore = (await one(`select public.turf_page('kings-turf') p`)).p;
const ownerTok = (u) => `phone:${u}`;
await q(`insert into public.turf_owners (turf_id, user_key, status, via, user_id) values ('${T(1)}', 'p:9000000004', 'active', 'phone_match', '${U(4)}')`);
const dashBefore = (await one(`select public.owner_dashboard($1, $2, 30) d`, [ownerTok("9000000004"), T(1)])).d;

await db.exec(sql);
await db.exec(sql); // safe to run again
passed++;

const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
// As the sheet sends it: an edit names the report it replaces (base); pass base: null to post as new.
const save = async (user, turf, report, key = KEY) => {
  const r = { ...report };
  if (!("base" in r)) {
    const cur = await one(`select id from public.reviews where user_id = $1 and turf_id = $2 and source is null`, [user, turf]);
    if (cur) r.base = cur.id;
  }
  return rpc("review_save", [key, user, turf, JSON.stringify(r)]);
};
const mine = (user, turf, key = KEY) => rpc("review_mine", [key, user, turf]);
const remove = (user, turf, key = KEY) => rpc("review_remove", [key, user, turf]);
const vote = (user, review, on, key = KEY) => rpc("review_vote", [key, user, review, on]);
const page = async (k = "kings-turf") => (await one(`select public.turf_page($1) p`, [k])).p;
const dirty = async () => (await q(`select key, urgent from private.test_dirty order by at`)).map((x) => `${x.key}${x.urgent ? "!" : ""}`);
const clearDirty = () => q(`delete from private.test_dirty`);

/* ---------------- the server key ---------------- */
for (const [fn, args] of [["review_save", [U(1), T(1), JSON.stringify({ rating: 4 })]], ["review_mine", [U(1), T(1)]], ["review_remove", [U(1), T(1)]], ["review_vote", [U(1), OLD_TAP, true]]]) {
  eq((await rpc(fn, ["wrong", ...args])).r, "unavailable", `${fn}: a call without the server key gets unavailable`);
  eq((await rpc(fn, [null, ...args])).r, "unavailable", `${fn}: a null key too`);
}
// Anyone can call the functions (PostgREST does it as anon); without the key they do nothing.
const forged = await asRole("anon", () => save(U(2), T(1), { rating: 1, comment: "Posted as someone else" }, "guess"));
eq(forged.r, "unavailable", "a browser naming another user_id, without the server key, posts nothing");
eq((await one(`select count(*)::int n from public.reviews where user_id = '${U(2)}'`)).n, 0, "and no row is written");

/* ---------------- a first report, then an edit ---------------- */
await clearDirty();
const first = await save(U(1), T(1), {
  rating: 4, sport: "Box Cricket", played_when: "evening", play_again: 1,
  aspects: { pitch: { score: 1, tags: ["bounce"] }, lights: { score: -1, tags: ["dim", "off"] }, staff: { score: 0 } },
  comment: "  Corner lights are dim after 9,\r\n\r\n\r\n ask for court 2.  ", channel: "turf_page", ms: 21000,
});
eq(first.r, "ok", "a first report saves");
eq(first.created, true, "and says it was created");
eq(first.review.comment, "Corner lights are dim after 9,\n\nask for court 2.", "the tip is cleaned: spaces trimmed, blank lines collapsed, line breaks kept");
eq([first.review.status, first.review.sport, first.review.played_when, first.review.play_again, first.review.verified_via], ["live", "Box Cricket", "evening", 1, null],
  "with its fields; no game here, so no badge");
eq(first.after.tapturf_n, 2, "after: two live TapTurf reports here now");
eq(first.after.aspects, { pitch: 1, lights: 1, staff: 1 }, "after: how many reports rated each part this one rated");
eq(first.note, null, "no note");
eq(await dirty(), ["turf:kings-turf!"], "the page is queued, urgent");
const saves1 = await q(`select action, channel, ms, before from private.review_saves where user_id = '${U(1)}'`);
eq(saves1, [{ action: "create", channel: "turf_page", ms: 21000, before: null }], "the save is logged");

const id1 = first.review.id;
const edit = await save(U(1), T(1), { rating: 3, sport: "Box Cricket", played_when: "night", aspects: { pitch: { score: 1, tags: ["bounce"] } }, comment: "Okay overall", channel: "edit" });
eq(edit.r, "ok", "a second save");
eq([edit.created, edit.review.id], [false, id1], "edits the same row: one report per account per turf");
ok(edit.review.edited_at, "and sets edited_at");
const hist = await q(`select action, before ->> 'rating' r, before ->> 'comment' c from private.review_saves where review_id = $1 order by id`, [id1]);
eq(hist.map((h) => [h.action, h.r]), [["create", null], ["edit", "4"]], "with the row as it was kept");
eq((await one(`select count(*)::int n from public.reviews where user_id = $1 and turf_id = $2`, [U(1), T(1)])).n, 1, "still one row");
await assert.rejects(q(`insert into public.reviews (user_id, turf_id, rating) values ('${U(1)}', '${T(1)}', 5)`), /reviews_one_per_player_uidx/,
  "a second TapTurf row for the same account and turf is refused by the index");
passed++;
// A save that changes nothing about the report keeps edited_at.
const before3 = (await one(`select edited_at from public.reviews where id = $1`, [id1])).edited_at;
await save(U(1), T(1), { rating: 3, sport: "Box Cricket", played_when: "evening", aspects: { pitch: { score: 1, tags: ["bounce"] } }, comment: "Okay overall" });
eq((await one(`select edited_at from public.reviews where id = $1`, [id1])).edited_at, before3, "only the sport or time changed: no Updated label");
// Never a silent overwrite: a save that doesn't name the report it replaces gets that report back.
const savesBefore = (await one(`select count(*)::int n from private.review_saves where user_id = $1`, [U(1)])).n;
const ex = await save(U(1), T(1), { rating: 1, comment: "From a fresh sheet", base: null });
eq([ex.r, ex.review?.id, ex.review?.rating, ex.review?.status, ex.review?.comment], ["exists", id1, 3, "live", "Okay overall"], "a new-report save over a live report: exists, with that report");
ok("note" in ex.review, "with the author's note (none here)");
eq((await save(U(1), T(1), { rating: 1, base: "cccccccc-cccc-4ccc-8ccc-0000000000ff" })).r, "exists", "a base that names another report: exists");
eq((await save(U(1), T(1), { rating: 1, base: 7 })).r, "bad", "a base that isn't text: bad");
eq([(await one(`select rating from public.reviews where id = $1`, [id1])).rating,
    (await one(`select count(*)::int n from private.review_saves where user_id = $1`, [U(1)])).n], [3, savesBefore], "and nothing was written");

/* ---------------- what is refused ---------------- */
const bad = async (report, what, turf = T(1)) => eq((await save(U(2), turf, report)).r, "bad", what);
await bad({ rating: 0 }, "a rating below 1");
await bad({ rating: 6 }, "a rating above 5");
await bad({ rating: 4.5 }, "a half star");
await bad({ rating: "4" }, "a rating as text");
await bad({ rating: 4, sport: "Tennis" }, "a sport the turf doesn't list");
await bad({ rating: 4, played_when: "midnight" }, "an unknown time of day");
await bad({ rating: 4, play_again: 2 }, "play again out of range");
await bad({ rating: 4, aspects: { roof: { score: 1 } } }, "an unknown part");
await bad({ rating: 4, aspects: { pitch: { score: 2 } } }, "a score out of range");
await bad({ rating: 4, aspects: { pitch: { score: 1, tags: ["worn"] } } }, "a Needs work chip on Great");
await bad({ rating: 4, aspects: { pitch: { score: 0, tags: ["bounce"] } } }, "a chip on Okay");
await bad({ rating: 4, aspects: { pitch: { score: 1, tags: ["bounce", "bounce"] } } }, "the same chip twice");
await bad({ rating: 4, aspects: { pitch: { score: -1, tags: ["worn", "uneven", "slippery", "hot"] } } }, "four chips");
await bad({ rating: 4, aspects: { nets: { score: 1 }, goals: { score: 1 } } }, "two sport rows");
await bad({ rating: 4, aspects: { pitch: { score: 1, why: "x" } } }, "an unknown field in a part");
await bad({ rating: 4, comment: "x".repeat(501) }, "a tip over 500 characters");
await bad({ rating: 4, note: { body: "x".repeat(401), show_name: false } }, "a note over 400 characters");
await bad({ rating: 4, price_paid: 50 }, "a price under 100");
await bad({ rating: 4, price_paid: 1200.5 }, "a price with paise");
eq((await save(U(2), T(3), { rating: 4 })).r, "gone", "an inactive turf");
eq((await save(U(2), T(9), { rating: 4 })).r, "gone", "a turf that doesn't exist");
eq((await one(`select count(*)::int n from public.reviews where user_id = '${U(2)}'`)).n, 0, "none of them wrote anything");

// Contact details are refused, not silently stripped.
const contact = async (text, field = "comment") => {
  const r = await save(U(2), T(2), field === "comment" ? { rating: 4, comment: text } : { rating: 4, note: { body: text, show_name: false } });
  return r.r === "contact_info" ? r.field : r.r;
};
for (const t of ["Call 9876543210 to book", "Call +91 98765 43210", "WhatsApp 98765-43210", "ring 09876543210", "919876543210 is the owner",
  "call 98765 - 43210", "98765.43210", "98765/43210", "(98765) 43210", "+91-98765-43210", "(+91) 98765 43210", "९८७६५४३२१०", "०९८७६५४३२१०", "９８７６５４３２１０"]) {
  eq(await contact(t), "comment", `a phone number: ${t}`);
}
for (const t of ["mail me at abc.def@gmail.com", "book on https://example.com/x", "see www.kingsturf.in", "wa.me/919876543210", "kingsturf.com has slots", "tapturf.in/turf/kings",
  "book at cheapturf.in", "boxcricketnashik.in", "cheapturf.net is cheaper", "slots on turfbook.co", "BoxCricketNashik.in"]) {
  eq(await contact(t), "comment", `a link or email: ${t}`);
}
eq(await contact("Owner's number 9876543210", "note"), "note", "the note too, and the field is named");
eq((await one(`select count(*)::int n from public.reviews where user_id = '${U(2)}'`)).n, 0, "refused texts wrote nothing");
for (const t of ["₹1,200 for an hour", "Best slot 7-9pm", "We made 120/3 in 12 overs", "Court 2 is better. Nets torn", "Slots 6-7, 7-8 and 8-9 are free", "Played here.In the evening it is nice",
  "Rs 800 - 1200 - 1500 by slot", "26/10/2026 at 7.30-9.30 pm", "Paid ₹९०० for an hour", "We were 10 9 of us came", "Go.In the evening"]) {
  const r = await save(U(2), T(2), { rating: 4, comment: t });
  eq(r.r, "ok", `fine: ${t}`);
}

/* ---------------- managers can't rate their own turf ---------------- */
await q(`insert into public.turf_owners (turf_id, user_key, status, via, user_id) values
  ('${T(1)}', 'p:9000000006', 'pending', 'admin', '${U(6)}'),
  ('${T(1)}', 'p:9000000009', 'rejected', 'admin', '${U(9)}'),
  ('${T(1)}', 'e:owner.mail@example.com', 'active', 'admin', null)`);
for (const [u, why] of [[U(4), "an active claim for the account"], [U(5), "a claim under its email from before claims named the account"],
  [U(6), "a pending claim"], [U(7), "turfs.owner_id"]]) {
  eq((await save(u, T(1), { rating: 5 })).r, "own_turf", `refused: ${why}`);
  eq((await mine(u, T(1))).blocked, "own_turf", `and review_mine says so (${why})`);
}
// A suggestion saying a player owns or works at the turf is no proof: anyone can write one for
// any player (save_turf_suggestion takes the user id from the browser), so it never blocks a report.
await q(`insert into public.turf_suggestions (turf_id, user_id, relationship, notes, status) values
  ('${T(1)}', '${U(8)}', 'staff', 'Planted by someone else', 'pending'), ('${T(2)}', '${U(8)}', 'owner', 'Approved, still self-declared', 'approved')`);
eq((await mine(U(8), T(1))).blocked, null, "a planted staff suggestion: review_mine doesn't block");
eq((await save(U(8), T(1), { rating: 1, comment: "Honest report" })).r, "ok", "and the player can still rate the turf");
eq((await save(U(8), T(2), { rating: 4 })).r, "ok", "an approved owner suggestion doesn't block either");
eq((await save(U(9), T(1), { rating: 2 })).r, "ok", "a rejected claim is not a manager");
await q(`insert into public.turf_owners (turf_id, user_key, status, via, user_id) values ('${T(2)}', 'p:9000000003', 'active', 'phone_match', null)`);
eq((await save(U(3), T(2), { rating: 5 })).r, "own_turf", "an old claim under the account's phone key");

/* ---------------- the guard: direct REST writes can't forge ---------------- */
const forgedRow = await asRole("anon", () => q(`insert into public.reviews (user_id, turf_id, rating, comment, verified_via, status, aspects, sport, play_again, edited_at,
    source, external_review_id, author_name, author_url, created_at)
  values ('${U(11)}', '${T(2)}', 5, 'Best', 'game', 'hidden', '{"pitch":{"score":1}}', 'Badminton', 1, now(), 'google', 'g-fake', 'Fake', 'https://x', now() - interval '3 years')
  returning verified_via, status, aspects, sport, play_again, edited_at, source, external_review_id, author_name, author_url, created_at > now() - interval '1 minute' as fresh`));
eq(forgedRow[0], { verified_via: null, status: "live", aspects: null, sport: null, play_again: null, edited_at: null, source: null, external_review_id: null, author_name: null, author_url: null, fresh: true },
  "a forged anon insert: no badge, live, no scorecard, no Google fields, today's date");
const forgedId = (await one(`select id from public.reviews where user_id = '${U(11)}' and turf_id = '${T(2)}'`)).id;
await q(`update public.reviews set verified_via = 'game', aspects = '{"staff":{"score":-1}}' where id = $1`, [forgedId]); // the SQL editor can
const upd = await asRole("authenticated", () => q(`update public.reviews set rating = 1, status = 'removed', verified_via = null, aspects = null, user_id = '${U(1)}', source = 'google'
  where id = '${forgedId}' returning rating, status, verified_via, aspects, user_id, source`), { sub: U(11) });
eq(upd[0], { rating: 1, status: "live", verified_via: "game", aspects: { staff: { score: -1 } }, user_id: U(11), source: null },
  "an authenticated update changes the stars only: not the status, badge, scorecard, owner or source");
const def = await one(`select prosecdef, proconfig from pg_proc where proname = 'reviews_guard'`);
eq(def.prosecdef, false, "the guard is security invoker (as a definer current_user would be its owner and it would let everything through)");
ok(String(def.proconfig).includes("search_path="), "with a fixed search_path");
// Google imports run as service_role: untouched, and a re-import still upserts.
await asRole("service_role", () => q(`insert into public.reviews (user_id, turf_id, rating, comment, source, external_review_id, author_name, source_date_label)
  values ('${GOOGLE_USER}', '${T(1)}', 3, 'Reimported text', 'google', 'g-1', 'A Googler', '2 years ago')
  on conflict (source, external_review_id) where external_review_id is not null do update set comment = excluded.comment, source_date_label = excluded.source_date_label`));
const g = await one(`select source, author_name, comment, source_date_label, status from public.reviews where id = '${OLD_G}'`);
eq(g, { source: "google", author_name: "A Googler", comment: "Reimported text", source_date_label: "2 years ago", status: "live" }, "a Google re-import works and keeps its fields");

/* ---------------- removal, hiding, posting again ---------------- */
await clearDirty();
eq((await remove(U(9), T(1))).r, "ok", "a report can be removed");
eq((await one(`select status from public.reviews where user_id = '${U(9)}' and turf_id = '${T(1)}'`)).status, "removed", "its status is removed, the row stays");
eq(await dirty(), ["turf:kings-turf!"], "the page is queued, urgent");
eq((await remove(U(9), T(1))).r, "ok", "removing again is fine");
eq((await remove(U(10), T(1))).r, "gone", "removing a report that doesn't exist");
let p = await page();
ok(!p.reviews.some((r) => r.user_id === U(9)), "a removed report is not on the turf page");
eq(p.review_stats.count, 3, "nor in the count (U3's old one, U1's and U8's)");
const anonSees = await asRole("anon", () => q(`select user_id from public.reviews where turf_id = '${T(1)}'`));
ok(!anonSees.some((r) => r.user_id === U(9)), "nor in an anon read");
const repost = await save(U(9), T(1), { rating: 3, comment: "Changed my mind" });
eq([repost.r, repost.created, repost.review.status], ["ok", false, "live"], "posting again brings it back");
eq((await one(`select action from private.review_saves where user_id = '${U(9)}' order by id desc limit 1`)).action, "repost", "logged as a repost");
await q(`update public.reviews set status = 'hidden' where user_id = '${U(9)}' and turf_id = '${T(1)}'`); // the site owner, in the SQL editor
const afterHide = await save(U(9), T(1), { rating: 5, comment: "Please show it" });
eq(afterHide.review.status, "hidden", "an author's save keeps an admin's hide");
eq((await mine(U(9), T(1))).mine.status, "hidden", "and the author sees it is hidden");
await remove(U(9), T(1));
eq((await one(`select status from public.reviews where user_id = '${U(9)}' and turf_id = '${T(1)}'`)).status, "hidden", "removing a hidden report keeps it hidden");
p = await page();
ok(!p.reviews.some((r) => r.user_id === U(9)), "a hidden report is not on the turf page");

/* ---------------- the per-account limits ---------------- */
const many = [];
for (let i = 0; i < 6; i++) {
  await q(`insert into public.turfs (id, name, slug, sports) values ('${T(20 + i)}', 'Many ${i}', 'many-${i}', '["Football"]')`);
  many.push((await save(U(10), T(20 + i), { rating: 4 })).r);
}
eq(many, ["ok", "ok", "ok", "ok", "ok", "limit"], "5 new reports a day per account, then limit");
const edits = [];
for (let i = 0; i < 16; i++) edits.push((await save(U(10), T(20), { rating: (i % 5) + 1 })).r);
eq(edits.filter((r) => r === "ok").length, 15, "20 saves a day in all (5 new and 15 edits)");
eq(edits.at(-1), "limit", "then limit, for edits too");

/* ---------------- Helpful votes ---------------- */
await clearDirty();
eq((await vote(U(3), OLD_TAP, true)).r, "own", "no vote on your own report");
eq((await vote(U(1), OLD_G, true)).r, "google", "no vote on a Google row");
const hiddenId = (await one(`select id from public.reviews where user_id = '${U(9)}' and turf_id = '${T(1)}'`)).id;
eq((await vote(U(1), hiddenId, true)).r, "gone", "no vote on a report that isn't live");
p = await page();
eq(p.reviews.find((r) => r.id === OLD_TAP).upvotes, 1, "Helpful skips the author's own old vote (2 stored, 1 counts)");
eq(p.reviews.find((r) => r.id === OLD_G).upvotes, 1, "a Google row's old vote is still stored (the page shows no button there)");
const v1 = await vote(U(11), OLD_TAP, true);
eq([v1.r, v1.on, v1.upvotes], ["ok", true, 2], "a vote counts");
const v2 = await vote(U(11), OLD_TAP, false);
eq([v2.r, v2.on, v2.upvotes], ["ok", false, 1], "taking it back");
ok((await one(`select withdrawn_at from public.review_votes where review_id = '${OLD_TAP}' and user_id = '${U(11)}'`)).withdrawn_at, "keeps the row, withdrawn");
ok((await dirty()).includes("turf:kings-turf"), "and an un-vote queues the page");
const v3 = await vote(U(11), OLD_TAP, true);
eq([v3.upvotes, (await one(`select count(*)::int n from public.review_votes where review_id = '${OLD_TAP}' and user_id = '${U(11)}'`)).n], [2, 1], "voting again clears it, still one row");
eq((await mine(U(11), T(1))).voted, [OLD_TAP], "review_mine lists the viewer's live votes here");
await q(`insert into public.turfs (id, name, slug, sports) values ('${T(40)}', 'Votes', 'votes', '["Football"]')`);
for (let i = 0; i < 60; i++) {
  await q(`insert into public.users (id, name) values ('${U(200 + i)}', 'Writer ${i}')`);
  await q(`insert into public.reviews (user_id, turf_id, rating) values ('${U(200 + i)}', '${T(40)}', 4)`);
}
await q(`insert into public.review_votes (review_id, user_id) select r.id, '${U(1)}' from public.reviews r where r.turf_id = '${T(40)}' limit 57`); // with the 2 from before the file: 59 this hour
const spare = (await one(`select r.id from public.reviews r where r.turf_id = '${T(40)}' and not exists (select 1 from public.review_votes v where v.review_id = r.id) limit 1`)).id;
eq((await vote(U(1), spare, true)).r, "ok", "the 60th vote in an hour");
await q(`insert into public.users (id, name) values ('${U(300)}', 'Writer extra')`);
await q(`insert into public.reviews (user_id, turf_id, rating) values ('${U(300)}', '${T(40)}', 4)`);
const extra = (await one(`select id from public.reviews where user_id = '${U(300)}'`)).id;
eq((await vote(U(1), extra, true)).r, "limit", "the 61st is refused");
eq((await vote(U(1), spare, false)).r, "ok", "taking one back is always allowed");
eq((await vote(U(1), spare, true)).r, "ok", "and so is voting again on a row you already have");

/* ---------------- turf_page keeps every key ---------------- */
p = await page();
const keys = (o) => Object.keys(o).sort();
ok(keys(pageBefore).every((k) => keys(p).includes(k)), "turf_page keeps every top-level key");
ok(keys(pageBefore.review_stats).every((k) => keys(p.review_stats).includes(k)), "and every review_stats key");
const oldRow = pageBefore.reviews.find((r) => r.id === OLD_TAP);
const newRow = p.reviews.find((r) => r.id === OLD_TAP);
ok(keys(oldRow).every((k) => keys(newRow).includes(k)), "and every review row key");
for (const k of keys(oldRow).filter((k) => k !== "upvotes")) eq(newRow[k], oldRow[k], `an old review's ${k} is unchanged`);
eq(["sport", "played_when", "aspects", "play_again", "verified_via", "edited_at"].map((k) => k in newRow), [true, true, true, true, true, true], "rows carry the report fields");
eq(p.reviews.map((r) => !!r.source), [...p.reviews.map((r) => !!r.source)].sort(), "TapTurf rows first, then Google");
eq(await page("no-such-turf"), { found: false }, "an unknown key still says found: false");
eq(p.review_stats.play_again, [0, 0, 0], "play_again [no, maybe, yes]: U1's yes was replaced by an edit with none");
ok(Array.isArray(p.review_aspects), "review_aspects is a list");
const pitch = p.review_aspects.find((a) => a.aspect === "pitch");
eq([pitch.n, pitch.great, pitch.okay, pitch.needs_work, pitch.tags.map((t) => [t.tag, t.sign, t.n])], [1, 1, 0, 0, [["bounce", 1, 1]]], "per part: counts and chips");
eq(pageBefore.review_stats.count, 1, "before: one TapTurf review");

// The cache: a scorecard change queues the page; a no-op (only updated_at) queues nothing.
await clearDirty();
await q(`update public.reviews set aspects = '{"value":{"score":1}}' where id = $1`, [id1]);
eq(await dirty(), ["turf:kings-turf"], "an aspects change queues its turf page");
await clearDirty();
await q(`update public.reviews set comment = comment where id = $1`, [id1]);
eq(await dirty(), [], "a no-op update queues nothing");

/* ---------------- played in a TapTurf game ---------------- */
const today = (await one(`select (now() at time zone 'Asia/Kolkata')::date::text d`)).d;
await q(`insert into public.games (id, creator_id, turf_id, sport, date, start_time, end_time, status) values
  ('dddddddd-dddd-4ddd-8ddd-000000000001', '${U(2)}', '${T(2)}', 'Badminton', date '${today}' - 3, '19:00', '20:00', 'completed'),
  ('dddddddd-dddd-4ddd-8ddd-000000000002', '${U(11)}', '${T(1)}', 'Football', date '${today}' + 2, '07:00', '08:00', 'open'),
  ('dddddddd-dddd-4ddd-8ddd-000000000003', '${U(11)}', '${T(1)}', 'Football', date '${today}' - 5, '07:00', '08:00', 'cancelled')`);
await q(`insert into public.game_participants (game_id, user_id) values ('dddddddd-dddd-4ddd-8ddd-000000000001', '${U(3)}')`);
eq(await q(`select private.review_verified_via('${U(2)}', '${T(2)}') a, private.review_verified_via('${U(3)}', '${T(2)}') b,
            private.review_verified_via('${U(11)}', '${T(1)}') c`), [{ a: "game", b: "game", c: null }],
  "hosted or joined a game here that started: game; a future or cancelled one: none");
const ravi = await save(U(2), T(2), { rating: 4, sport: "Badminton", played_when: "night" });
eq(ravi.review.verified_via, "game", "the badge is worked out at the save");
await q(`update public.games set status = 'cancelled' where id = 'dddddddd-dddd-4ddd-8ddd-000000000001'`);
eq((await save(U(2), T(2), { rating: 5 })).review.verified_via, null, "worked out again at every save: a cancelled (or forged and removed) game takes the badge away");
await q(`update public.games set status = 'completed' where id = 'dddddddd-dddd-4ddd-8ddd-000000000001'`);
eq((await save(U(2), T(2), { rating: 5 })).review.verified_via, "game", "and it comes back with the game");

/* ---------------- the hint for the rate card ---------------- */
await q(`insert into public.users (id, name, created_at) values ('${U(50)}', 'Hint Person', now() - interval '1 year')`);
await q(`insert into public.turf_contact_clicks (turf_id, kind, signed_in, user_id, created_at) values
  ('${T(1)}', 'call', true, '${U(50)}', now() - interval '2 days'), ('${T(1)}', 'whatsapp', true, '${U(50)}', now() - interval '1 hour'),
  ('${T(1)}', 'call', false, '${U(50)}', now() - interval '1 day')`);
let h = (await mine(U(50), T(1))).hint;
eq([h.kind, typeof h.at], ["call", "string"], "a signed-in call tap 12 hours to 14 days ago (not the WhatsApp tap an hour ago)");
await q(`insert into public.games (id, creator_id, turf_id, sport, date, start_time, end_time) values ('dddddddd-dddd-4ddd-8ddd-000000000004', '${U(50)}', '${T(1)}', 'Box Cricket', date '${today}' - 2, '20:30', '21:30')`);
h = (await mine(U(50), T(1))).hint;
eq([h.kind, h.sport, h.played_when], ["game", "Box Cricket", "night"], "a game here wins, with its sport and time of day");
await save(U(50), T(1), { rating: 5 });
eq((await mine(U(50), T(1))).hint, null, "no hint once they reported");
eq((await mine(U(4), T(1))).hint, null, "nor for a manager");

/* ---------------- held for a check ---------------- */
await q(`insert into public.turfs (id, name, slug, city, sports) values
  ('${T(5)}', 'Nashik Arena', 'nashik-arena', 'Nashik', '["Football"]'), ('${T(6)}', 'Rush Turf', 'rush-turf', 'pune', '["Football"]')`);
// A rival: the account manages another turf in the same city (U4 holds the claim on Kings Turf, Nashik).
const rival = await save(U(4), T(5), { rating: 1, comment: "Terrible", price_paid: 300 });
eq([rival.r, rival.review.status, rival.price_saved], ["ok", "held", false], "a report from an account that manages a turf in the same city is held, and its price isn't saved");
eq((await one(`select count(*)::int n from public.turf_suggestions where user_id = '${U(4)}'`)).n, 0, "no From players price from it");
let rp = await page("nashik-arena");
eq([rp.reviews.length, rp.review_stats.count], [0, 0], "a held report is not on the turf page, nor in its numbers");
eq((await asRole("anon", () => q(`select id from public.reviews where turf_id = '${T(5)}'`))).length, 0, "nor in an anon read (the AI summary and Ask read that way)");
eq((await mine(U(4), T(5))).mine.status, "held", "its author sees it, held");
eq((await save(U(4), T(5), { rating: 2 })).review.status, "held", "an edit keeps it held");
eq((await save(U(4), T(2), { rating: 4 })).review.status, "live", "the same account in another city: live");
// A rush on one turf.
for (let i = 0; i < 9; i++) {
  await q(`insert into public.users (id, name, created_at) values ('${U(70 + i)}', 'Rush ${i}', now() - interval '${[0, 1, 2, 8].includes(i) ? "1 hour" : "1 year"}')`);
}
const rush = [];
for (const i of [0, 1, 2]) rush.push((await save(U(70 + i), T(6), { rating: 1, price_paid: 200 })).review.status);
eq(rush, ["live", "live", "held"], "the first two new reports go live; the 3rd in 48 hours from an account under 3 days old waits");
eq((await one(`select count(*)::int n from public.turf_suggestions where turf_id = '${T(6)}'`)).n, 2, "the held one's price is not saved");
for (const i of [3, 4]) rush.push((await save(U(70 + i), T(6), { rating: 1 })).review.status);
eq(rush.slice(3), ["live", "live"], "year-old accounts go live while fewer than 5 others posted");
eq((await save(U(75), T(6), { rating: 1 })).review.status, "held", "the 6th new report in 48 hours, from a year-old account with no TapTurf game here, waits");
await q(`insert into public.games (creator_id, turf_id, sport, date, start_time, end_time, status) values
  ('${U(77)}', '${T(6)}', 'Football', date '${today}' - 1, '07:00', '08:00', 'completed'),
  ('${U(78)}', '${T(6)}', 'Football', date '${today}' - 1, '07:00', '08:00', 'completed')`);
eq((await save(U(77), T(6), { rating: 5 })).review.status, "live", "one who played a TapTurf game here goes live");
eq((await save(U(78), T(6), { rating: 5 })).review.status, "held", "a game never lets an account under 3 days old through (anyone can add a game today)");
const heldId = (await one(`select id from public.reviews where user_id = '${U(72)}' and turf_id = '${T(6)}'`)).id;
eq((await vote(U(73), heldId, true)).r, "gone", "no Helpful on a held report");
eq((await vote(U(72), heldId, true)).r, "own", "its author hears own, as on a live one");
ok(!(await page("rush-turf")).reviews.some((r) => r.id === heldId), "not on the page");
await q(`update public.reviews set status = 'live' where id = $1`, [heldId]); // the site owner lets it through
ok((await page("rush-turf")).reviews.some((r) => r.id === heldId), "let through by the site owner, it shows");

/* ---------------- the private note ---------------- */
await clearDirty();
const noted = await save(U(11), T(1), { rating: 2, sport: "Box Cricket", played_when: "evening", note: { body: "The light near the gate is off.", show_name: false } });
eq(noted.note, { delivers: "batch", at: null }, "a note without a name waits for its batch");
const named = await save(U(2), T(2), { rating: 5, note: { body: "Fix the net", show_name: true } });
eq(named.note.delivers, "tomorrow", "a named note on a claimed turf (old key) reaches the owner at the next 09:00 IST");
const deliver = await one(`select private.next_note_delivery(created_at) = deliver_after as rule, deliver_after >= created_at + interval '8 hours' as later
                             from private.review_notes where user_id = '${U(2)}' and turf_id = '${T(2)}'`);
eq([deliver.rule, deliver.later], [true, true], "at least 8 hours later");
eq(await q(`select to_char(private.next_note_delivery(t) at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') d from (values
  (timestamptz '2026-10-26 00:30+05:30'), (timestamptz '2026-10-26 01:30+05:30'), (timestamptz '2026-10-26 20:00+05:30')) v(t)`),
  [{ d: "2026-10-26 09:00" }, { d: "2026-10-27 09:00" }, { d: "2026-10-27 09:00" }], "next_note_delivery: the next 09:00 IST at least 8 hours on");
await q(`insert into public.turfs (id, name, slug, sports) values ('${T(41)}', 'Unclaimed', 'unclaimed', '["Football"]')`);
eq((await save(U(2), T(41), { rating: 4, note: { body: "Hello owner", show_name: false } })).note.delivers, "on_claim", "an unclaimed turf keeps the note for the owner");
eq((await mine(U(11), T(1))).mine.note, { body: "The light near the gate is off.", show_name: false }, "the author sees their note");
ok(!JSON.stringify(await page()).includes("light near the gate"), "the note is never in turf_page");
const ownerT1 = async () => (await one(`select public.owner_dashboard($1, $2, 30) d`, [ownerTok("9000000004"), T(1)])).d;
let d = await ownerT1();
eq(d.reviews.notes, [], "one unnamed note waiting: the owner sees nothing yet");
// Two more players leave unnamed notes: the three go out together.
const n2 = await save(U(1), T(1), { rating: 4, sport: "Box Cricket", played_when: "evening", note: { body: "The water cooler was empty.", show_name: false } });
eq(n2.note.delivers, "batch", "two waiting: still waiting");
const n3 = await save(U(3), T(1), { rating: 5, sport: "Box Cricket", played_when: "evening", note: { body: "Please fix the gate latch.", show_name: false } });
eq(n3.note.delivers, "tomorrow", "the third makes a batch");
const batch = await q(`select distinct deliver_after from private.review_notes where turf_id = '${T(1)}' and body is not null`);
eq([batch.length, batch[0].deliver_after?.toISOString?.() === new Date(n3.note.at).toISOString()], [1, true], "all three arrive at the same moment");
d = await ownerT1();
eq(d.reviews.notes, [], "not before that moment");
await q(`update private.review_notes set deliver_after = now() - interval '1 minute' where deliver_after is not null`);
d = await ownerT1();
const month = (await one(`select to_char(now() at time zone 'Asia/Kolkata', 'Mon YYYY') m`)).m;
eq(d.reviews.notes.length, 3, "then all three show");
eq(d.reviews.notes.map((x) => [x.context, x.month, x.name, x.rating_word]), Array(3).fill(["An evening box cricket player", month, null, null]),
  "three unnamed notes in the batch say the same: the rough context and the month they arrived, nothing else");
ok(!JSON.stringify(d.reviews.notes).includes(noted.review.id), "and no review id");
const d2 = (await one(`select public.owner_dashboard($1, $2, 30) d`, [ownerTok("9000000003"), T(2)])).d;
eq(d2.reviews.notes.map((x) => [x.context, x.name, x.rating_word]), [[null, "Ravi Kumar", "Loved it"]], "a named note: name, month and the stars in words");
// A batch whose notes don't share a context: "A player" for each.
await q(`insert into public.turfs (id, name, slug, sports) values ('${T(42)}', 'Batch Turf', 'batch-turf', '["Football", "Box Cricket"]')`);
await q(`insert into public.turf_owners (turf_id, user_key, status, via, user_id) values ('${T(42)}', 'p:9000000004', 'active', 'phone_match', '${U(4)}')`);
await save(U(1), T(42), { rating: 3, sport: "Football", played_when: "morning", note: { body: "Morning note", show_name: false } });
await save(U(2), T(42), { rating: 3, sport: "Football", played_when: "morning", note: { body: "Second morning note", show_name: false } });
await save(U(11), T(42), { rating: 3, sport: "Box Cricket", played_when: "night", note: { body: "Night note", show_name: false } });
await q(`update private.review_notes set deliver_after = now() - interval '1 minute' where deliver_after is not null`);
const d3 = (await one(`select public.owner_dashboard($1, $2, 30) d`, [ownerTok("9000000004"), T(42)])).d;
eq(d3.reviews.notes.map((x) => x.context), ["A player", "A player", "A player"], "two morning football players and one at night: no context for anyone");
eq((await one(`select public.owner_dashboard($1, $2, 30) d`, [ownerTok("9000000011"), T(1)])).d, { error: "forbidden" }, "owner_dashboard: forbidden without manage");
// Editing a note that has arrived: the owner keeps the old text until the new one arrives with a batch.
const edited = await save(U(11), T(1), { rating: 2, sport: "Box Cricket", played_when: "evening", note: { body: "The gate light is fixed now, thanks.", show_name: false } });
eq(edited.note.delivers, "batch", "an edit to an arrived note waits for a batch");
d = await ownerT1();
ok(d.reviews.notes.some((x) => x.body === "The light near the gate is off.") && !d.reviews.notes.some((x) => x.body.includes("fixed now")), "the owner still sees the old text, not the new one");
eq((await mine(U(11), T(1))).mine.note.body, "The gate light is fixed now, thanks.", "the author sees what they wrote");
await save(U(11), T(1), { rating: 2, note: { body: null, show_name: false } });
eq((await mine(U(11), T(1))).mine.note, null, "note.body null clears the note");
d = await ownerT1();
ok(!d.reviews.notes.some((x) => /light/.test(x.body)), "and it goes from the owner's view, old text too");
await save(U(11), T(1), { rating: 2, note: { body: "Back again", show_name: false } });
await remove(U(11), T(1));
eq((await one(`select body, shown_body, cleared_at is not null c from private.review_notes where user_id = '${U(11)}' and turf_id = '${T(1)}'`)), { body: null, shown_body: null, c: true }, "removing a report clears its note");
// Named and back: a named note arrives on its own; turning the name off before it arrives puts it in the batch queue.
const nm = await save(U(9), T(1), { rating: 5, note: { body: "Named first", show_name: true } });
eq(nm.note.delivers, "tomorrow", "named: tomorrow");
const un = await save(U(9), T(1), { rating: 5, note: { body: "Named first", show_name: false } });
eq(un.note.delivers, "batch", "name turned off before it arrived: it waits for a batch");

/* ---------------- owner_dashboard keeps every key ---------------- */
d = (await one(`select public.owner_dashboard($1, $2, 30) d`, [ownerTok("9000000004"), T(1)])).d;
ok(keys(dashBefore).every((k) => keys(d).includes(k)), "owner_dashboard keeps every top-level key");
ok(keys(dashBefore.reviews).every((k) => keys(d.reviews).includes(k)), "and every reviews key");
eq(["average", "play_again", "verified", "window_days", "aspects", "fix_first", "love", "notes"].every((k) => k in d.reviews), true, "and has the new ones");
eq(d.reviews.tapturf, (await one(`select count(*)::int n from public.reviews where turf_id = '${T(1)}' and source is null and status = 'live'`)).n, "tapturf counts live rows");
ok(d.reviews.recent.every((r) => r.id && r.author !== "A player"), "recent rows carry an id and the player's public name");
ok(!d.reviews.recent.some((r) => r.author === "Rejected Claim"), "and leave out rows that aren't live");
ok(d.reviews.recent.some((r) => r.author === "Hint Person" && r.comment === null && r.aspects === null), "a stars-only TapTurf report is listed too");
await save(U(1), T(1), { rating: 4, aspects: { lights: { score: -1, tags: ["dim"] }, staff: { score: 1, tags: ["quick"] } } });
await save(U(3), T(1), { rating: 3, aspects: { lights: { score: -1, tags: ["dim", "glare"] }, staff: { score: 1, tags: ["quick", "on_time"] } } }).catch(() => null);
d = (await one(`select public.owner_dashboard($1, $2, 30) d`, [ownerTok("9000000004"), T(1)])).d;
eq(d.reviews.fix_first[0], { aspect: "lights", tag: "dim", n: (await one(`select count(*)::int n from public.reviews where turf_id = '${T(1)}' and status = 'live' and aspects -> 'lights' -> 'tags' ? 'dim'`)).n, last_at: d.reviews.fix_first[0].last_at },
  "Fix these first: the most named Needs work chip first");
ok(d.reviews.love.some((l) => l.tag === "quick"), "What players love: Great chips");
await save(U(8), T(1), { rating: 2, aspects: { washroom: { score: -1 } } });
d = (await one(`select public.owner_dashboard($1, $2, 30) d`, [ownerTok("9000000004"), T(1)])).d;
const untagged = d.reviews.fix_first.find((f) => f.aspect === "washroom");
eq([untagged?.tag, untagged?.n, typeof untagged?.last_at], [null, 1, "string"], "Fix these first: a part rated Needs work with no reason picked is listed too (tag null)");

/* ---------------- prices into From players ---------------- */
// Two days on: no rush at Kings Turf any more, and the day's limits are fresh.
await q(`update private.review_saves set saved_at = saved_at - interval '3 days'`);
await q(`insert into public.users (id, name, created_at) values ('${U(60)}', 'Price Person', now() - interval '1 year'), ('${U(61)}', 'Busy Suggester', now() - interval '1 year')`);
const pr = await save(U(60), T(1), { rating: 4, price_paid: 1000 });
eq(pr.price_saved, true, "a rate paid is saved");
eq(await q(`select relationship, price_min, price_max, submitter_name, status from public.turf_suggestions where user_id = '${U(60)}'`),
  [{ relationship: "player", price_min: 1000, price_max: 1000, submitter_name: "Price Person", status: "pending" }], "as the player's From players price");
ok((await page()).suggestions.some((s) => s.price_min === 1000), "and turf_page shows it at once");
eq((await mine(U(60), T(1))).my_price, 1000, "review_mine gives it back for the price chips");
await save(U(60), T(1), { rating: 4, price_paid: 1200 });
eq((await one(`select changes from public.turf_suggestion_edits e join public.turf_suggestions s on s.id = e.suggestion_id where s.user_id = '${U(60)}'`)).changes,
  { price_min: { from: 1000, to: 1200 }, price_max: { from: 1000, to: 1200 } }, "a changed price is logged as an edit");
for (let i = 0; i < 20; i++) {
  await q(`insert into public.turfs (id, name, slug) values ('${T(100 + i)}', 'S ${i}', 's-${i}')`);
  await q(`insert into public.turf_suggestions (turf_id, user_id, notes) values ('${T(100 + i)}', '${U(61)}', 'note')`);
}
const capped = await save(U(61), T(1), { rating: 5, price_paid: 900 });
eq([capped.r, capped.price_saved], ["ok", false], "when the price can't be written (20 suggestions today), the report still posts");
eq((await one(`select count(*)::int n from public.reviews where user_id = '${U(61)}'`)).n, 1, "and is kept");
// The sheet asks only while a turf has fewer than 3 other players' prices; the database holds to that.
await q(`insert into public.turf_suggestions (turf_id, user_id, relationship, price_min, price_max) values
  ('${T(2)}', '${U(200)}', 'player', 600, 600), ('${T(2)}', '${U(201)}', 'player', 700, 700), ('${T(2)}', '${U(202)}', 'player', 650, 650)`);
const late = await save(U(2), T(2), { rating: 5, price_paid: 200 });
eq([late.r, late.price_saved], ["ok", false], "3 other players' prices already: the price is not taken (the report is)");
eq((await one(`select count(*)::int n from public.turf_suggestions where turf_id = '${T(2)}' and user_id = '${U(2)}'`)).n, 0, "and nothing is written to From players");

/* ---------------- the AI summary goes stale on edits ---------------- */
await db.exec(`set test.owner = 'yes'`);
await q(`update public.turfs set review_summary_at = now() + interval '1 second' where id = '${T(1)}'`);
await q(`select pg_sleep(1.1)`);
const stale = async () => (await q(`select id from public.get_review_summary_batch(20, null)`)).some((r) => r.id === T(1));
eq(await stale(), false, "a fresh summary is not in the batch");
await save(U(1), T(1), { rating: 5, aspects: { lights: { score: 1, tags: ["bright"] }, staff: { score: 1 } } });
eq(await stale(), true, "an edit makes it stale");
const prog = await one(`select * from public.review_summary_progress(null)`);
ok(prog.total >= 1, "progress counts turfs with two written reports (or two rated parts)");
await db.exec(`set test.owner = 'no'`);

/* ---------------- grants ---------------- */
for (const fn of ["review_save", "review_mine", "review_remove", "review_vote"]) {
  const r = await one(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('public', p.oid, 'execute') p, prosecdef, proconfig
                         from pg_proc p where proname = $1`, [fn]);
  eq([r.a, r.p, r.prosecdef, String(r.proconfig).includes("search_path=")], [true, false, true, true], `${fn}: anon may call it, PUBLIC not; definer, fixed search_path`);
}
for (const fn of ["review_catalog", "review_aspects_ok", "review_text_problem", "account_manages_turf", "account_manages_in_city", "review_verified_via", "next_note_delivery",
  "review_hold", "review_row_json", "review_mine_json", "review_aspect_counts", "review_share_price", "owner_review_block", "review_clean_text", "reviews_guard"]) {
  const r = await one(`select bool_or(has_function_privilege('anon', p.oid, 'execute')) a from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and proname = $1`, [fn]);
  eq(r.a, false, `private.${fn}: closed to the API roles`);
}
for (const t of ["review_notes", "review_saves"]) {
  eq((await q(`select grantee from information_schema.role_table_grants where table_schema = 'private' and table_name = $1 and grantee in ('anon', 'authenticated', 'PUBLIC')`, [t])).length, 0,
    `private.${t} is closed to the API roles`);
}
await assert.rejects(asRole("anon", () => q(`select * from private.review_notes`)), /permission denied/, "anon can't read notes");
passed++;
// Saves run one at a time per account (and per turf), votes per account: the limits count committed rows.
for (const [fn, keys] of [["review_save", ["review_save:", "review_turf:"]], ["review_remove", ["review_save:", "review_turf:"]], ["review_vote", ["review_vote:"]]]) {
  const src = (await one(`select prosrc from pg_proc where proname = $1`, [fn])).prosrc;
  ok(keys.every((k) => src.includes(`pg_advisory_xact_lock(hashtextextended('${k}'`)), `${fn} takes its advisory locks`);
  if (fn !== "review_vote") ok(src.indexOf("review_save:") < src.indexOf("review_turf:"), `${fn}: account lock first, then the turf`);
}

/* ---------------- the lockdown, later ---------------- */
// Reviews written straight from the API in the last 48 hours (no review_saves row) don't stop it: anyone
// can write one until it runs, so it lists them in a notice and closes the door.
ok((await one(`select count(*)::int n from public.reviews r where r.source is null and r.created_at > now() - interval '48 hours'
                 and not exists (select 1 from private.review_saves s where s.review_id = r.id)`)).n > 0, "direct posts from the last 48 hours are there");
await assert.rejects(db.exec(lock.replace("to_regprocedure('public.review_save(text,uuid,uuid,jsonb)') is null", "true")), /apply 20261027_game_reports\.sql/,
  "without the review functions it refuses");
passed++;
await db.exec(lock);
await db.exec(lock); // safe to run again
passed++;
await assert.rejects(asRole("anon", () => q(`insert into public.reviews (user_id, turf_id, rating) values ('${U(50)}', '${T(2)}', 5)`)), /permission denied|row-level security/,
  "after the lockdown a direct insert is refused");
await assert.rejects(asRole("anon", () => q(`delete from public.review_votes`)), /permission denied/, "and anyone deleting every vote is refused");
await assert.rejects(asRole("authenticated", () => q(`update public.reviews set rating = 1 where user_id = '${U(11)}'`), { sub: U(11) }), /permission denied/,
  "and an author's direct update");
passed += 3;
eq((await asRole("anon", () => q(`select count(*)::int n from public.reviews where turf_id = '${T(1)}'`)))[0].n > 0, true, "reading stays public");
eq((await asRole("anon", () => save(U(50), T(2), { rating: 4 }, KEY))).r, "ok", "and the server-key path still writes");
eq((await asRole("anon", () => vote(U(50), OLD_TAP, true, KEY))).r, "ok", "votes too");
const pols = Object.fromEntries((await q(`select polname, pg_get_expr(polqual, polrelid) u, pg_get_expr(polwithcheck, polrelid) c from pg_policy where polname in
  ('reviews_insert_app', 'reviews_author_update', 'reviews_author_delete', 'review_votes_insert_app', 'review_votes_delete_app', 'reviews_public_read')`)).map((x) => [x.polname, [x.u, x.c]]));
eq(pols.reviews_insert_app, [null, "false"], "insert policy closed");
eq(pols.reviews_public_read[0], "(status = 'live'::text)", "read policy: live rows");
await db.exec(revert);
await asRole("anon", () => q(`insert into public.reviews (user_id, turf_id, rating) values ('${U(60)}', '${T(2)}', 5)`));
passed++;
const reverted = Object.fromEntries((await q(`select polname, pg_get_expr(polqual, polrelid) u, pg_get_expr(polwithcheck, polrelid) c from pg_policy where polname like 'review%'`)).map((x) => [x.polname, [x.u, x.c]]));
eq(reverted.reviews_insert_app[1], "((user_id IS NOT NULL) AND ((rating >= 1) AND (rating <= 5)))", "the revert restores the insert policy as it was");
eq(reverted.review_votes_delete_app[0], "(user_id IS NOT NULL)", "and the vote delete policy");

console.log(`game_reports: ${passed} checks passed`);
