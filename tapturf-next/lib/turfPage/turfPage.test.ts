import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeGames, shapeReviews, shapeReviewStats, shapeSuggestions, trendingFor } from "./shape";
import { isLikelyBot } from "../analytics/bot";
import { UNREAD_EVERY_MS, UNREAD_MAX_WAIT_MS, unreadWait, wakeWait } from "../notifications/unreadPoll";

// turf_page output as Postgres sends it (supabase/migrations/20261020_turf_page.sql).
const venue = { id: "t1", name: "Turf Up", address: "Hinjewadi, Pune" };

test("reviews: players' own first, newest first within each, nobody's upvote", () => {
  const out = shapeReviews([
    { id: "g1", user_id: "u-google", rating: 4, comment: "ok", created_at: "2026-10-03T00:00:00Z", source: "google", author_name: "A", user_name: "A", upvotes: 0 },
    { id: "n1", user_id: "u1", rating: 5, comment: "great", created_at: "2026-10-02T00:00:00Z", source: null, user_name: "Ravi", user_avatar: "https://x/p.jpg", upvotes: 2 },
    { id: "n2", user_id: "u2", rating: 3, comment: null, created_at: "2026-10-01T00:00:00Z", source: null, user_name: null, upvotes: 0 },
  ]);
  assert.deepEqual(out.map((r) => r.id), ["n1", "n2", "g1"]);
  assert.equal(out[0].upvotes, 2);
  assert.equal(out[0].user_avatar, "https://x/p.jpg");
  assert.ok(out.every((r) => r.viewer_has_upvoted === false));
});

test("reviews: junk in, nothing out", () => {
  assert.deepEqual(shapeReviews(null), []);
  assert.deepEqual(shapeReviews([null, 3, { comment: "no id" }]), []);
});

test("review stats: as getReviewSummary had them; empty or malformed is zero", () => {
  assert.deepEqual(shapeReviewStats({ count: 3, average: 4.33, histogram: [0, 0, 1, 0, 2] }), {
    count: 3,
    average: 4.3,
    histogram: [0, 0, 1, 0, 2],
  });
  const zero = { count: 0, average: 0, histogram: [0, 0, 0, 0, 0] };
  assert.deepEqual(shapeReviewStats({ count: 0, average: 0, histogram: [0, 0, 0, 0, 0] }), zero);
  assert.deepEqual(shapeReviewStats(null), zero);
  assert.deepEqual(shapeReviewStats({ count: 2, histogram: [1, 1] }), zero);
});

test("suggestions: keeps the masked phones as sent, fills list defaults", () => {
  const [s] = shapeSuggestions([
    { id: "s1", submitter_name: "Lons", relationship: "player", contact_phone: null, whatsapp_phone: null, phone_pending: true, sports: null, amenities: ["Parking"], status: "pending", created_at: "2026-09-27T11:35:35Z", edit_count: null },
  ]);
  assert.equal(s.contact_phone, null);
  assert.equal(s.phone_pending, true);
  assert.deepEqual(s.sports, []);
  assert.deepEqual(s.amenities, ["Parking"]);
  assert.equal(s.edit_count, 0);
});

test("games: venue attached, host phone never passed on", () => {
  const [g] = shapeGames(
    [{ id: "g1", turf_id: "t1", sport: "football", date: "2026-10-21", start_time: "19:00:00", end_time: "20:00:00", max_players: 10, current_players: 4, price_per_player: 100, status: "open", host_name: "Ravi", host_phone: "+919999999999" }],
    venue,
  );
  assert.equal("host_phone" in g, false);
  assert.deepEqual(g.turfs, venue);
  assert.equal(g.price_per_player, 100);
  assert.deepEqual(shapeGames("nope", venue), []);
});

test("trending: only the pick in this turf's own city", () => {
  assert.deepEqual(trendingFor({ city: "pune", tagline: "Floodlit and new" }, "pune"), { city: "pune", tagline: "Floodlit and new" });
  assert.equal(trendingFor({ city: "mumbai", tagline: null }, "pune"), null);
  assert.equal(trendingFor({ city: "pune" }, null), null);
  assert.equal(trendingFor(null, "pune"), null);
});

test("view log skips crawlers, headless and automated browsers", () => {
  const chrome = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
  assert.equal(isLikelyBot(chrome, false), false);
  assert.equal(isLikelyBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), false);
  // A Cubot phone is a person.
  assert.equal(isLikelyBot("Mozilla/5.0 (Linux; Android 11; CUBOT_X30) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36"), false);
  assert.equal(isLikelyBot(chrome, true), true);
  assert.equal(isLikelyBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"), true);
  assert.equal(isLikelyBot("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0)"), true);
  assert.equal(isLikelyBot("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/129.0.0.0 Safari/537.36"), true);
  assert.equal(isLikelyBot("Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)"), true);
  assert.equal(isLikelyBot("facebookexternalhit/1.1"), true);
  assert.equal(isLikelyBot(""), true);
});

test("unread checks: 5 min apart, doubling after failures up to 30 min", () => {
  assert.equal(unreadWait(0), UNREAD_EVERY_MS);
  assert.equal(unreadWait(1), 10 * 60_000);
  assert.equal(unreadWait(2), 20 * 60_000);
  assert.equal(unreadWait(3), UNREAD_MAX_WAIT_MS);
  assert.equal(unreadWait(10), UNREAD_MAX_WAIT_MS);
});

test("unread checks on focus: now, unless one just ran or the database is failing", () => {
  const t = 1_000_000_000;
  assert.equal(wakeWait(t + 60_000, t, 0), 0);
  // Tab flipped back 10 s after a check: keep the 5 min timer.
  assert.equal(wakeWait(t + 10_000, t, 0), UNREAD_EVERY_MS - 10_000);
  // Failing: focus does not cut the backoff short.
  assert.equal(wakeWait(t + 60_000, t, 2), 20 * 60_000 - 60_000);
  assert.equal(wakeWait(t + 21 * 60_000, t, 2), 0);
});
