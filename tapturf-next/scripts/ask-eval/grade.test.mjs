// The eval grader's own checks (grade.mjs), run by npm run test:ask: a check
// that fails correct answers would report the real model's right replies as wrong.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingClaim, FACTS, gradeReply, openOn } from "./grade.mjs";

test("a booking claim is caught; its honest negation is not", () => {
  // The v10 prompt's own words (lib/ai/ask.ts V10_KNOWS), and what a right answer to "can I book on TapTurf" says.
  for (const ok of [
    "It says who keeps the page up to date, and nothing is booked through TapTurf: players call or WhatsApp the turf.",
    "You cannot book on TapTurf: call or WhatsApp the turf.",
    "You can't book online here.",
    "You can’t book on TapTurf, but the turf's number is on its page.",
    "TapTurf doesn't book turfs: call or WhatsApp the turf for a slot.",
    "Here are claimed turfs in Pune, best rated first.",
  ])
    assert.equal(bookingClaim(ok), null, ok);
  for (const [bad, hit] of [
    ["Book now on TapTurf!", "Book now"],
    ["You can book it on TapTurf in seconds.", "book it on TapTurf"],
    ["Slots are booked through TapTurf.", "booked through TapTurf"],
    ["Don't worry, you can book online.", "book online"],
    ["It isn't a rating. Book online here.", "Book online"],
    ["Not on Hudle, but here are turfs in Baner.", "Hudle"],
    ["Instant booking at these turfs.", "Instant booking"],
  ])
    assert.equal(bookingClaim(bad), hit, bad);
  const fact = (reply) => FACTS.no_booking_claim({ reply, summary: "", followups: [] });
  assert.equal(fact("Nothing is booked through TapTurf: players call or WhatsApp the turf."), null);
  assert.match(fact("Book online through the app."), /booking claim/);
});

test("open at a weekday: each card by its page's hours that day, or open all day", () => {
  // T12 Sports Turf on 30 Oct: Saturday 5 AM–11 PM, Sunday 8 AM–10 PM (Monday first, encodeWeek).
  const t12 = "|||||300-1380|480-1320";
  assert.equal(openOn(t12, 6, 300), false);
  assert.equal(openOn(t12, 5, 300), true);
  assert.equal(openOn("360-1560||||||", 1, 90), true, "Monday's 6 AM–2 AM runs into Tuesday");
  const truth = { hours: { t12, late: "|||||0-1440|0-1440" }, allDay: ["h24"] };
  const reply = (...ids) => ({ turfs: ids.map((id) => ({ id, name: id })) });
  assert.match(FACTS.cards_open_at(reply("t12", "late"), "sun 05:00", {}, truth), /1 card\(s\) not open sun 05:00 by their hours: t12/);
  assert.equal(FACTS.cards_open_at(reply("late", "h24"), "sun 05:00", {}, truth), null);
  assert.match(FACTS.cards_open_at(reply("unknown"), "sat 05:00", {}, truth), /unknown/, "no hours: never open for sure");
  assert.equal(FACTS.cards_open_at(reply("t12"), "sun 05:00", {}, null), "skip");
});

test("best rated by players: the players' stars, then their reports", () => {
  const truth = { stars: { kridadham: 5, royal: 5, green: 4 }, reports: { kridadham: 2, royal: 1, green: 1 } };
  const reply = (...ids) => ({ turfs: ids.map((id) => ({ id, name: id })) });
  assert.equal(FACTS.cards_by_player_stars(reply("kridadham", "royal", "green"), "", {}, truth), null);
  // Green Square first by its Google 5.0 (the stand-in's v10 before the fix): caught.
  assert.match(FACTS.cards_by_player_stars(reply("kridadham", "green", "royal"), "", {}, truth), /royal \(5 stars, 1 reports\) comes after green/);
  assert.match(FACTS.cards_by_player_stars(reply("royal", "kridadham"), "", {}, truth), /kridadham/);
});

test("the owner's prices: none on TapTurf means the cards are none and the reply says so", () => {
  const truth = { ownerPrices: [], ownerPriceCities: {}, claimed: [], claimedCities: {}, reports: {}, reportCities: {} };
  const q = { id: "owner-prices-any", expect: { intent: "find_turf", owner_prices: true }, facts: ["truth_owner_prices", "zero_copy_if_none:owner_prices"] };
  const honest = { router: 10, intent: "find_turf", memo: { owner_prices: true }, reply: "No turfs with prices from the owner on TapTurf yet.", turfs: [], total: 0 };
  assert.deepEqual(gradeReply(q, honest, truth).fails, []);
  // The v10 build before the fix: Dribble Den shown as the owner's prices.
  const wrong = { ...honest, reply: "Here are turfs with prices from the owner.", turfs: [{ id: "dribble-den", name: "Dribble Den" }], total: 1 };
  const fails = gradeReply(q, wrong, truth).fails;
  assert.equal(fails.length, 2);
  assert.match(fails[0], /without the owner's prices/);
  assert.match(fails[1], /has none/);
});
