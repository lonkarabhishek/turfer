import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAIM_APPROVED, CLAIM_REJECTED, KIND_LINE_MAX, claimDecisionNotice, kindLine, notificationLink } from "./claimNotice";
import { BOOKINGS_LINE, claimCopyProblem } from "../turfPage/claimPrompts";

test("approved: their turf is on myTapturf now", () => {
  const n = claimDecisionNotice("active", "Green Box Arena");
  assert.ok(n);
  assert.equal(n.type, CLAIM_APPROVED);
  assert.equal(n.title, "Your turf is on myTapturf now");
  assert.match(n.message, /TapTurf confirmed that you run Green Box Arena\./);
  assert.equal(claimCopyProblem(`${n.title} ${n.message}`), null);
});

test("rejected: could not confirm, the site owner's line for players, and the admin's kind line", () => {
  const n = claimDecisionNotice("rejected", "Green Box Arena");
  assert.ok(n);
  assert.equal(n.type, CLAIM_REJECTED);
  assert.equal(n.message, `TapTurf could not confirm that you run Green Box Arena. Want to play there? ${BOOKINGS_LINE}`);
  const k = claimDecisionNotice("rejected", "Green Box Arena", "  If you run it,\n send us the turf's number.  ");
  assert.ok(k);
  assert.equal(k.message, `TapTurf could not confirm that you run Green Box Arena. If you run it, send us the turf's number. Want to play there? ${BOOKINGS_LINE}`);
  for (const x of [n, k]) assert.equal(claimCopyProblem(`${x.title} ${x.message}`), null);
});

test("no message for a revoke or a restore; and nothing but plain words fits", () => {
  assert.equal(claimDecisionNotice("revoked", "X"), null);
  assert.equal(claimDecisionNotice("pending", "X"), null);
  const long = claimDecisionNotice("rejected", "N".repeat(300), "k".repeat(500));
  assert.ok(long);
  assert.ok(long.title.length <= 120 && long.message.length <= 400, "fits the database's limits");
  assert.ok(long.message.endsWith(BOOKINGS_LINE), "the site owner's line is never cut off");
  assert.equal(claimDecisionNotice("active", "  ")?.message.includes("this turf"), true, "a turf with no name");
});

test("kindLine: one line, trimmed, cut to the limit; empty is none", () => {
  assert.equal(kindLine(" a \n b "), "a b");
  assert.equal(kindLine("   "), null);
  assert.equal(kindLine(5), null);
  assert.equal(kindLine("x".repeat(KIND_LINE_MAX))?.length, KIND_LINE_MAX);
  assert.equal(kindLine("x".repeat(KIND_LINE_MAX + 50))!.length, KIND_LINE_MAX);
});

test("notificationLink: a claim decision goes to myTapturf or the turf's page; games as before", () => {
  const turfId = "aaaaaaaa-0000-4000-8000-000000000001";
  assert.deepEqual(notificationLink(CLAIM_APPROVED, { turfId, slug: "green-box" }), { href: `/my/turf/${turfId}`, label: "Open myTapturf" });
  assert.deepEqual(notificationLink(CLAIM_REJECTED, { turfId, slug: "green-box" }), { href: "/turf/green-box", label: "Open the turf's page" });
  assert.deepEqual(notificationLink(CLAIM_REJECTED, { turfId, slug: null }), { href: `/turf/${turfId}`, label: "Open the turf's page" });
  assert.equal(notificationLink(CLAIM_REJECTED, { slug: "../admin" }), null, "only a slug or an id");
  assert.equal(notificationLink(CLAIM_APPROVED, { slug: "green-box" }), null);
  assert.deepEqual(notificationLink("game_request", { gameId: "g1" }), { href: "/game/g1", label: null });
  assert.deepEqual(notificationLink("game_request_accepted", { game_id: "g2" }), { href: "/game/g2", label: null });
  assert.equal(notificationLink("game_request", null), null);
  assert.equal(notificationLink("other", []), null);
});
