import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DAILY_RULE, dailyMessage, PLAYED_HERE_LINE, toDaily } from "./daily";
import { problemOf } from "./client";
import { askErrorText, ownerRemovalLine, parseRemovalAsk, REMOVAL_DETAIL_MAX, REMOVAL_REASONS, toAdminRemovals, toOwnerRemovals } from "./removal";

// The reviews policy of 1 Nov 2026 (supabase/migrations/20261101_reviews_policy.sql): every
// report live at once, one new report a day, owners ask TapTurf to remove one.

const MIGRATION = path.join(process.cwd(), "supabase/migrations/20261101_reviews_policy.sql");
const R1 = "eeeeeeee-eeee-4eee-8eee-000000000001";
const R2 = "eeeeeeee-eeee-4eee-8eee-000000000002";
const REVIEW = "cccccccc-cccc-4ccc-8ccc-000000000001";

/* ---------------- the sheet's words ---------------- */

test("copy: the honest line and the daily rule, as the site owner asked", () => {
  assert.equal(PLAYED_HERE_LINE, "Only review a turf you have actually played at.");
  assert.equal(DAILY_RULE, "You can post one review a day. Played at more than one turf today? Each one you played at counts.");
  for (const s of [PLAYED_HERE_LINE, DAILY_RULE, dailyMessage(null), dailyMessage({ allowed: 2, played: 2 }), ...REMOVAL_REASONS.map((r) => r.label), ownerRemovalLine("open"), ownerRemovalLine("removed"), ownerRemovalLine("kept")]) {
    assert.doesNotMatch(s, /\bbook/i, `no booking claim: ${s}`);
    assert.doesNotMatch(s, /[—–]/, `no em or en dash: ${s}`);
  }
});

test("daily message: the rule, or that they posted as many as the turfs they played at; then the draft waits", () => {
  assert.equal(dailyMessage(null), `${DAILY_RULE} Your answers stay on this phone, so you can post tomorrow.`);
  assert.equal(dailyMessage({ allowed: 1, played: 0 }), dailyMessage(null));
  assert.equal(dailyMessage({ allowed: 1, played: 1 }), dailyMessage(null), "one turf played at: still one a day");
  // Only the count: the day's reports may be on turfs other than the ones played at, so it never says "each of".
  assert.equal(dailyMessage({ allowed: 2, played: 2 }), "You've posted today's 2 reviews (you played at 2 turfs today). Your answers stay on this phone, so you can post tomorrow.");
  assert.doesNotMatch(dailyMessage({ allowed: 3, played: 3 }), /each of|for each/);
  assert.equal(dailyMessage({ allowed: 3 }), dailyMessage(null), "without played: the rule");
});

test("toDaily: review_mine's daily key, or null (an older database, a manager, junk)", () => {
  assert.deepEqual(toDaily({ allowed: 1, posted: 1, played: 0, full: true }), { allowed: 1, posted: 1, played: 0, full: true });
  assert.deepEqual(toDaily({ allowed: 2, posted: 0, played: 2, full: false, extra: 1 }), { allowed: 2, posted: 0, played: 2, full: false });
  for (const bad of [undefined, null, "full", [], { allowed: 0, posted: 0, played: 0, full: false }, { allowed: 1, posted: -1, played: 0, full: false },
    { allowed: "1", posted: 0, played: 0, full: false }, { allowed: 1, posted: 0, played: 0, full: "yes" }, { allowed: 1.5, posted: 0, played: 0, full: false }, { allowed: 1, posted: 0, full: false }]) {
    assert.equal(toDaily(bad), null, JSON.stringify(bad));
  }
});

test("problemOf: the daily refusal with its counts; the plain limit stays the plain limit", () => {
  assert.deepEqual(problemOf({ status: 429, body: { error: "limit", reason: "daily", allowed: 2, played: 2 } }), { problem: "daily", allowed: 2, played: 2 });
  assert.deepEqual(problemOf({ status: 429, body: { error: "limit", reason: "daily", allowed: "x" } }), { problem: "daily", allowed: undefined, played: undefined });
  assert.deepEqual(problemOf({ status: 429, body: { error: "limit" } }), { problem: "limit" });
  assert.equal(problemOf({ status: 200, body: { r: "ok" } }), null);
});

/* ---------------- owners asking TapTurf to remove a report ---------------- */

test("removal reasons: the same list as the database's check, in the order shown", () => {
  const sql = fs.readFileSync(MIGRATION, "utf8");
  const m = /reason text not null check \(reason in \(([^)]*)\)\)/.exec(sql);
  assert.ok(m, "the table's reason check");
  assert.deepEqual(m[1].split(",").map((s) => s.trim().replace(/'/g, "")), REMOVAL_REASONS.map((r) => r.id));
  const ask = sql.slice(sql.indexOf("create or replace function public.owner_review_removal_ask("));
  assert.ok(ask.includes(`p_reason not in (${REMOVAL_REASONS.map((r) => `'${r.id}'`).join(", ")})`), "and the ask function's");
  assert.ok(sql.includes(`char_length(detail) between 1 and ${REMOVAL_DETAIL_MAX}`) && ask.includes(`char_length(v_detail) > ${REMOVAL_DETAIL_MAX}`), "the line's limit matches");
});

test("parseRemovalAsk: a reason off the list, the line cleaned as the database cleans it", () => {
  assert.deepEqual(parseRemovalAsk("abusive", null), { ok: { reason: "abusive", detail: null } });
  assert.deepEqual(parseRemovalAsk("other", "   "), { ok: { reason: "other", detail: null } });
  assert.deepEqual(parseRemovalAsk("not_played", "  No game that day.\r\n\r\n\r\n Ask us.  "), { ok: { reason: "not_played", detail: "No game that day.\n\nAsk us." } });
  assert.deepEqual(parseRemovalAsk("other", "x".repeat(REMOVAL_DETAIL_MAX)), { ok: { reason: "other", detail: "x".repeat(REMOVAL_DETAIL_MAX) } });
  assert.deepEqual(parseRemovalAsk("other", "x".repeat(REMOVAL_DETAIL_MAX + 1)), { bad: "detail" });
  assert.deepEqual(parseRemovalAsk("rude", null), { bad: "reason" });
  assert.deepEqual(parseRemovalAsk(null, null), { bad: "reason" });
  assert.deepEqual(parseRemovalAsk("other", 7), { bad: "detail" });
});

test("toOwnerRemovals: review id to this owner's latest request; null hides the action", () => {
  const m = toOwnerRemovals({
    requests: [
      { review_id: R1, status: "open", reason: "abusive", created_at: "2026-11-01T10:00:00Z", decided_at: null },
      { review_id: R1, status: "kept", reason: "other", created_at: "2026-10-20T10:00:00Z", decided_at: "2026-10-21T10:00:00Z" },
      { review_id: R2, status: "removed", reason: "made_up", created_at: "2026-10-20T10:00:00Z", decided_at: "2026-10-22T10:00:00Z" },
      { review_id: "x", status: "maybe" },
      "junk",
    ],
  });
  assert.ok(m);
  assert.deepEqual([...m.entries()], [
    [R1, { status: "open", reason: "abusive", at: "2026-11-01T10:00:00Z" }],
    [R2, { status: "removed", reason: "other", at: "2026-10-22T10:00:00Z" }],
  ]);
  for (const none of [{ error: "forbidden" }, null, [], "x", { requests: "x" }]) assert.equal(toOwnerRemovals(none), null, JSON.stringify(none));
  assert.equal(toOwnerRemovals({ requests: [] })?.size, 0, "none yet: the action shows");
});

test("owner words: each state, and why asking didn't go through", () => {
  assert.match(ownerRemovalLine("open"), /stays up while we look/);
  assert.match(ownerRemovalLine("removed"), /removed/);
  assert.match(ownerRemovalLine("kept"), /kept this report up/);
  assert.match(askErrorText("limit"), /tomorrow/);
  assert.match(askErrorText("gone"), /already off the page/);
  assert.match(askErrorText("forbidden"), /approved owner/);
  assert.match(askErrorText("bad"), /300 characters/);
  assert.match(askErrorText(undefined), /Try again/);
});

test("toAdminRemovals: the queue's rows checked; junk dropped; never a number or key", () => {
  const raw = {
    open: 1,
    requests: [
      {
        id: R1, status: "open", reason: "not_played", detail: "No game that day", created_at: "2026-11-01T10:00:00Z", decided_at: null,
        asked_by: { name: "Owner One", account: "aaaaaaaa-aaaa-4aaa-8aaa-000000000020", kind: "phone" }, others: 1,
        turf: { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001", name: "Turf 1", slug: "turf-1", city: "pune" },
        review: { id: REVIEW, rating: 7, comment: "Bad", sport: "Football", played_when: "evening", aspects: { pitch: { score: -1 } }, created_at: "2026-10-30T10:00:00Z", status: "live", author: "Player" },
      },
      { id: R2, status: "kept", reason: "odd", created_at: "2026-10-01T10:00:00Z", decided_at: "2026-10-02T10:00:00Z", asked_by: { kind: "sms" }, turf: {}, review: null },
      { id: "not-a-uuid", status: "open" },
      { id: R1, status: "pending" },
    ],
  };
  const q = toAdminRemovals(raw);
  assert.ok(q);
  assert.equal(q.open, 1);
  assert.equal(q.requests.length, 2, "malformed rows dropped");
  const [a, b] = q.requests;
  assert.deepEqual([a.reason, a.detail, a.askedBy, a.others, a.turf.slug], ["not_played", "No game that day", { name: "Owner One", account: "aaaaaaaa-aaaa-4aaa-8aaa-000000000020", kind: "phone" }, 1, "turf-1"]);
  assert.deepEqual([a.review?.rating, a.review?.playedWhen, a.review?.author, a.review?.status], [5, "evening", "Player", "live"], "rating kept within 1 to 5");
  assert.deepEqual([b.reason, b.askedBy.kind, b.turf.name, b.review, b.others], ["other", null, "A turf", null, 0]);
  assert.deepEqual(toAdminRemovals({ requests: [raw.requests[0]] })?.open, 1, "open counted when the answer has no count");
  assert.equal(toAdminRemovals({ error: "forbidden" }), null);
  assert.equal(toAdminRemovals(null), null);
});

/* ---------------- the migration ---------------- */

test("migration: additive, without the destructive words; the hold answers false", () => {
  const sql = fs.readFileSync(MIGRATION, "utf8");
  assert.doesNotMatch(sql, /drop|delete|truncate/i);
  const hold = sql.slice(sql.indexOf("create or replace function private.review_hold("), sql.indexOf("revoke all on function private.review_hold"));
  assert.match(hold, /\n {2}select false;\n\$\$;/);
  assert.match(sql, /update public\.reviews set status = 'live' where status = 'held' and source is null;/, "held reports let through");
});
