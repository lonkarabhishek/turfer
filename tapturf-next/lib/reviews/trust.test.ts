import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CONTACT_RULES, contactProblem, TIP_RULES, tipProblem, type ScreenRule } from "./screen";
import { parseReport } from "./payload";
import { photoErrorText, photoSizesOk, reviewPhotoUrl, shapeReviewPhoto, shapeReviewPhotos, REVIEW_PHOTOS } from "./photos";
import { emptyDraft, readDraft, readDraftPhotos, sameAnswers } from "./draft";
import { flagAnswerText, FLAG_REASONS, parseFlag, toAdminFlags } from "./flags";
import { shapeReviews } from "../turfPage/shape";

// Reviews trust (20261102_reviews_trust.sql): the tip's rule and its SQL twin, the
// payload's refusals and photos, the page's badge and photos, drafts with photos,
// and Report this review. Pure. Made-up numbers and addresses only.

const TURF = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const P1 = "cccccccc-cccc-4ccc-8ccc-000000000001";
const P2 = "cccccccc-cccc-4ccc-8ccc-000000000002";
const NAME = "0123456789abcdef01234567";
const photo = (id = P1, name = NAME, ext = "webp") => ({ id, path: `${name}.${ext}`, thumb: `${name}_t.${ext}`, w: 1600, h: 1200 });
const sqlFile = (f: string) => fs.readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const cases = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/reviews/screen.cases.json"), "utf8")) as { both: string[]; tip_only: string[]; neither: string[] };

/** The rules a SQL function says, in order: "when x.d ~ '...'" reads the dialled digits, "when p ~* '...'" the text, ignoring case. */
function sqlRules(sql: string, fn: string): ScreenRule[] {
  const at = sql.indexOf(`create or replace function ${fn}(`);
  assert.ok(at >= 0, `${fn} is in the file`);
  const body = sql.slice(at, sql.indexOf("$$;", at));
  return [...body.matchAll(/when (x\.d|p) (~\*?) '([^']*)' then 'contact_info'/g)].map((m) => ({ on: m[1] === "x.d" ? "dialled" : "text", i: m[2] === "~*", re: m[3] }));
}

/* ---------------- the tip's rule, one list in TypeScript and SQL ---------------- */

test("screen rules: private.review_text_problem says CONTACT_RULES, rule for rule", () => {
  assert.deepEqual(sqlRules(sqlFile("20261027_game_reports.sql"), "private.review_text_problem"), [...CONTACT_RULES]);
});

test("screen rules: private.review_tip_problem adds TIP_RULES to them", () => {
  const sql = sqlFile("20261102_reviews_trust.sql");
  assert.deepEqual(sqlRules(sql, "private.review_tip_problem"), [...TIP_RULES]);
  assert.match(sql.slice(sql.indexOf("create or replace function private.review_tip_problem(")), /coalesce\(private\.review_text_problem\(p\)/);
});

test("screen cases: the shared list (also run through the SQL by reviews_trust.check.mjs)", () => {
  for (const t of cases.both) assert.deepEqual([contactProblem(t), tipProblem(t)], ["contact_info", "contact_info"], t);
  for (const t of cases.tip_only) assert.deepEqual([contactProblem(t), tipProblem(t)], [null, "contact_info"], t);
  for (const t of cases.neither) assert.deepEqual([contactProblem(t), tipProblem(t)], [null, null], t);
  assert.ok(cases.both.length > 20 && cases.tip_only.length >= 5 && cases.neither.length > 12);
});

/* ---------------- the payload ---------------- */

test("payload: a tip with contact details is refused as the database refuses it; the note keeps its own rule", () => {
  assert.deepEqual(parseReport({ turf_id: TURF, rating: 4, comment: "DM @kingsturf for slots" }), { contact: "comment" });
  assert.deepEqual(parseReport({ turf_id: TURF, rating: 4, comment: "Call 98765 43210" }), { contact: "comment" });
  assert.deepEqual(parseReport({ turf_id: TURF, rating: 4, note: { body: "mail me at a.b@gmail.com", show_name: true } }), { contact: "note" });
  const ok = parseReport({ turf_id: TURF, rating: 4, comment: "Booked @7pm", note: { body: "Ask @ravi_ground at the desk", show_name: false } });
  assert.ok("ok" in ok, "a time after @ in the tip, and a handle in the private note, pass");
  // Malformed first, as review_save checks: a bad price with a number in the tip is bad.
  assert.ok("bad" in parseReport({ turf_id: TURF, rating: 4, comment: "Call 98765 43210", price_paid: 5 }));
});

test("payload: photos, up to 3 ids in order, each once; left out is left out", () => {
  const r = parseReport({ turf_id: TURF, rating: 5, photos: [P2.toUpperCase(), P1, P2] });
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.photos, [P2, P1]);
  const none = parseReport({ turf_id: TURF, rating: 5 });
  assert.ok("ok" in none && !("photos" in none.ok), "no list: the report keeps its photos");
  const empty = parseReport({ turf_id: TURF, rating: 5, photos: [] });
  assert.ok("ok" in empty && empty.ok.photos?.length === 0, "an empty list takes them off");
  for (const photos of [[P1, P2, P1.replace("1", "3"), P1.replace("1", "4")], ["x"], "all", [7]]) {
    assert.deepEqual(parseReport({ turf_id: TURF, rating: 5, photos }), { bad: "photos" }, JSON.stringify(photos));
  }
});

/* ---------------- the page ---------------- */

test("shape: the badge and the photos come through when the payload has them, junk dropped", () => {
  const [a, b, c] = shapeReviews([
    { id: "r1", user_id: "u1", rating: 5, source: null, played_here: true, photos: [photo(), photo(P2, "fedcba9876543210fedcba98", "jpg"), { id: "x", path: "../../a.webp" }] },
    { id: "r2", user_id: "u2", rating: 4, source: null, played_here: false, photos: null },
    { id: "r3", user_id: "u3", rating: 3, source: null, played_here: "yes" },
  ]);
  assert.deepEqual([a.played_here, a.photos?.map((p) => p.id)], [true, [P1, P2]]);
  assert.deepEqual([b.played_here, "photos" in b], [false, false], "no photos: no key (the page stays small)");
  assert.equal(c.played_here, false);
  const [old] = shapeReviews([{ id: "n1", user_id: "u1", rating: 5, source: null }]);
  assert.equal("played_here" in old || "photos" in old, false, "a database from before the file: neither key");
});

test("photos: a photo must be well formed: a uuid, its two files under one random name, a size", () => {
  assert.deepEqual(shapeReviewPhoto({ ...photo(), id: P1.toUpperCase() }), photo());
  for (const bad of [{ ...photo(), thumb: "fedcba9876543210fedcba98_t.webp" }, { ...photo(), path: `${NAME}.png` }, { ...photo(), w: 0 }, { ...photo(), h: 5000 }, { ...photo(), id: "p1" }, null, [photo()]]) {
    assert.equal(shapeReviewPhoto(bad), null, JSON.stringify(bad));
  }
  assert.equal(shapeReviewPhotos([photo(), photo(), photo(P2), photo(P1.replace("1", "3")), photo(P1.replace("1", "4"))]).length, 3, "3 at most, each once");
  assert.equal(reviewPhotoUrl(`${NAME}.webp`, "https://x.supabase.co/"), `https://x.supabase.co/storage/v1/object/public/review-photos/${NAME}.webp`);
});

test("photos: the sizes the server takes", () => {
  assert.equal(photoSizesOk({ w: 1600, h: 1200 }, { w: 360, h: 270 }), true);
  assert.equal(photoSizesOk({ w: 1200, h: 1600 }, { w: 270, h: 360 }), true, "upright too");
  assert.equal(photoSizesOk({ w: 1601, h: 1200 }, { w: 360, h: 270 }), false, "over 1600");
  assert.equal(photoSizesOk({ w: 1600, h: 1200 }, { w: 360, h: 360 }), false, "a thumbnail of another shape");
  assert.equal(photoSizesOk({ w: 1600, h: 1200 }, { w: 480, h: 360 }), false, "a thumbnail over 400");
  assert.equal(photoSizesOk({ w: 300, h: 150 }, { w: 300, h: 150 }), false, "too small to show");
  assert.match(photoErrorText("refused", "spam"), /poster/);
  assert.match(photoErrorText("refused", "not_venue"), /couldn't see the turf/);
  assert.match(photoErrorText("limit"), new RegExp(`${REVIEW_PHOTOS.perDay} photos today`));
  assert.ok(!/check'?s|Haiku|judge|verdict/i.test(["sexual", "violent", "personal_info", "other"].map((p) => photoErrorText("refused", p)).join(" ")), "never the check's own words");
});

/* ---------------- drafts with photos ---------------- */

test("draft: photos come back, an added one only while the server still keeps it; base and the change mark too", () => {
  const now = 1_800_000_000_000;
  const d = { ...emptyDraft(now), stars: 4, photos: [{ ...photo(), at: null }, { ...photo(P2, "fedcba9876543210fedcba98"), at: now - 1000 }], photosChanged: true, base: P1 };
  const back = readDraft(JSON.stringify(d), now);
  assert.ok(back);
  assert.deepEqual(back.photos.map((p) => [p.id, p.at]), [[P1, null], [P2, now - 1000]]);
  assert.deepEqual([back.photosChanged, back.base], [true, P1]);
  const later = readDraftPhotos(d.photos, now + REVIEW_PHOTOS.readyMs);
  assert.deepEqual(later.map((p) => p.id), [P1], "two days on, a photo never posted is gone from the server: the draft lets it go");
  assert.equal(readDraft(JSON.stringify({ ...d, base: "x", photos: "junk" }), now)?.base, null);
  assert.deepEqual(readDraft(JSON.stringify({ ...d, photos: "junk" }), now)?.photos, []);
});

test("draft: sameAnswers tells an edit opened and closed again from one with a change", () => {
  const a = { ...emptyDraft(1), stars: 4, comment: "Good nets", photos: [{ ...photo(), at: null }] };
  assert.equal(sameAnswers(a, { ...a, step: 3, savedAt: 99, comment: "Good nets " }), true, "the screen it was on and spaces don't count");
  assert.equal(sameAnswers(a, { ...a, comment: "Great nets" }), false);
  assert.equal(sameAnswers(a, { ...a, photos: [] }), false, "a photo taken out is a change");
  assert.equal(sameAnswers(a, { ...a, note: "hidden text", noteOpen: false }), true, "a closed note box isn't sent");
});

/* ---------------- Report this review ---------------- */

test("flag: the body, a reason off the list and a cleaned line", () => {
  assert.deepEqual(parseFlag({ review_id: P1.toUpperCase(), reason: "spam", detail: "  Ad for\n\n\n another turf  " }), { ok: { review_id: P1, reason: "spam", detail: "Ad for\n\nanother turf" } });
  assert.deepEqual(parseFlag({ review_id: P1, reason: "not_played" }), { ok: { review_id: P1, reason: "not_played", detail: null } });
  for (const [b, why] of [[{ review_id: "x", reason: "spam" }, "review_id"], [{ review_id: P1, reason: "rude" }, "reason"], [{ review_id: P1, reason: "other", detail: "x".repeat(301) }, "detail"], [{ review_id: P1, reason: "other", detail: 5 }, "detail"]] as const) {
    assert.deepEqual(parseFlag(b as Record<string, unknown>), { bad: why });
  }
  assert.deepEqual(FLAG_REASONS.map((r) => r.id), ["not_played", "abusive", "spam", "personal", "other"], "the database's list, in the order shown");
  assert.match(flagAnswerText({ ok: true, already: false }), /stays up/);
  assert.match(flagAnswerText({ ok: true, already: true }), /already/);
  assert.match(flagAnswerText({ ok: false, error: "limit" }), /10 reports today/);
  assert.match(flagAnswerText({ ok: false, error: "unavailable", reason: "not_ready" }), /isn't open yet/);
  assert.match(flagAnswerText({ ok: false, error: "not_allowed", reason: "own" }), /your own/);
});

test("flag: the admin queue's shape, every row checked", () => {
  const q = toAdminFlags({
    open: 1,
    flags: [
      { id: P1, status: "open", reason: "abusive", detail: null, created_at: "2026-11-02T00:00:00Z", by: { name: "Player 21", account: "u21", manages: false }, others: 2,
        turf: { id: TURF, name: "Turf 1", slug: "turf-1", city: "pune" },
        review: { id: P2, rating: 9, comment: "x", status: "live", author: "Player 3", author_id: "u3", played_here: true, photos: [photo()] } },
      { id: "nope", status: "open" },
      { id: P2, status: "maybe" },
    ],
  });
  assert.ok(q);
  assert.equal(q.flags.length, 1);
  const f = q.flags[0];
  assert.deepEqual([f.reason, f.by.name, f.others, f.review?.rating, f.review?.playedHere, f.review?.photos.length, f.review?.authorId], ["abusive", "Player 21", 2, 5, true, 1, "u3"]);
  assert.equal(toAdminFlags({ requests: [] }), null);
});
