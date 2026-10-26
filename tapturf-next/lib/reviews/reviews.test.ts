import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ASPECTS, catalogRows, pitchLabel, rowsFor, sportRow, starWord, whenOf } from "./catalog";
import { parseReport } from "./payload";
import { cleanText, contactProblem } from "./screen";
import { barWords, pickChips, playAgainLine, scorecard, waitingLine } from "./insights";
import { unlockLine } from "./unlock";
import { listedFor, priceChips, rateTitle, shareText, tipPlaceholder } from "./sheet";
import { emptyDraft, hasAnswers, readDraft } from "./draft";
import { summaryLine, writtenEnough } from "./summaryLine";
import { shapePlayAgain, shapeReviewAspects, shapeReviews } from "../turfPage/shape";

const TURF = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";

/* ---------------- the catalogue and the database's copy ---------------- */

test("catalog: the migration's VALUES list is the same catalogue", () => {
  const file = path.join(process.cwd(), "supabase/migrations/20261027_game_reports.sql");
  const sql = fs.readFileSync(file, "utf8");
  const body = sql.slice(sql.indexOf("create or replace function private.review_catalog()"), sql.indexOf("as v(aspect, tag, sign)"));
  const rows = [...body.matchAll(/\('([a-z_]+)', '([a-z_]+)', (-?1)\)/g)].map((m) => `${m[1]}:${m[2]}:${m[3]}`);
  assert.ok(rows.length > 40);
  assert.deepEqual(rows.sort(), catalogRows().map((r) => `${r.aspect}:${r.tag}:${r.sign}`).sort());
});

test("catalog: no chip id repeats within a part, at most 5 chips a side", () => {
  for (const a of Object.values(ASPECTS)) {
    const ids = [...a.great, ...a.needs].map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length, a.id);
    assert.ok(a.great.length <= 5 && a.needs.length <= 5, a.id);
  }
});

test("rows by sport and time of day: never more than 6, Lights only in the evening or at night", () => {
  assert.deepEqual(rowsFor("Box Cricket", "evening"), ["pitch", "lights", "nets", "staff", "washroom", "value"]);
  assert.deepEqual(rowsFor("Football", "morning"), ["pitch", "goals", "staff", "washroom", "value"]);
  assert.deepEqual(rowsFor("Badminton", "night"), ["pitch", "lights", "lines", "staff", "washroom", "value"]);
  assert.deepEqual(rowsFor("Swimming", "afternoon"), ["pitch", "staff", "washroom", "value"]);
  assert.deepEqual(rowsFor(null, null), ["pitch", "staff", "washroom", "value"]);
  assert.equal(sportRow("Cricket Nets"), "nets");
  assert.equal(sportRow("Futsal"), "goals");
  assert.equal(sportRow("Basketball"), null);
  assert.equal(pitchLabel("Badminton"), "Court");
  assert.equal(pitchLabel("Basketball"), "Court");
  assert.equal(pitchLabel("Swimming"), "Playing area");
  assert.equal(pitchLabel("Box Cricket"), "Pitch");
  assert.equal(pitchLabel(null, ["Pickleball", "Football"]), "Court", "no sport picked: the turf's first sport");
  assert.equal(pitchLabel(null, []), "Pitch");
  assert.equal(whenOf("07:30:00"), "morning");
  assert.equal(whenOf("13:00"), "afternoon");
  assert.equal(whenOf("16:00"), "evening");
  assert.equal(whenOf("19:00"), "night");
  assert.equal(whenOf(null), null);
  assert.deepEqual([1, 2, 3, 4, 5].map(starWord), ["Bad", "Not great", "Okay", "Good", "Loved it"]);
});

/* ---------------- parseReport ---------------- */

test("parseReport: a full report comes through, in the database's shape", () => {
  const r = parseReport({
    turf_id: TURF, rating: 4, sport: "Box Cricket", played_when: "evening", play_again: 1,
    aspects: { pitch: { score: 1, tags: ["bounce"] }, lights: { score: -1, tags: ["dim", "off"] }, staff: { score: 0 } },
    comment: "  Lights dim after 9  ", note: { body: "The gate light is off", show_name: false }, price_paid: 1000, channel: "link", ms: 21000,
    user_id: "someone-else",
  });
  assert.ok("ok" in r);
  assert.deepEqual(r.ok, {
    turf_id: TURF, rating: 4, sport: "Box Cricket", played_when: "evening", play_again: 1,
    aspects: { pitch: { score: 1, tags: ["bounce"] }, lights: { score: -1, tags: ["dim", "off"] }, staff: { score: 0 } },
    comment: "Lights dim after 9", channel: "link", note: { body: "The gate light is off", show_name: false }, price_paid: 1000, ms: 21000,
  });
  assert.equal("user_id" in r.ok, false, "a user id in the body never goes on");
});

test("parseReport: the stars alone are a report", () => {
  assert.deepEqual(parseReport({ turf_id: TURF, rating: 5 }), {
    ok: { turf_id: TURF, rating: 5, sport: null, played_when: null, aspects: null, play_again: null, comment: null, channel: "turf_page" },
  });
});

test("parseReport: unknown parts and chips are dropped, and rows the sheet wouldn't show", () => {
  const r = parseReport({
    turf_id: TURF, rating: 3, sport: "Football", played_when: "morning",
    aspects: {
      roof: { score: 1 }, pitch: { score: 1, tags: ["bounce", "bounce", "worn", "new_chip", "fresh", "grip"] }, lights: { score: -1, tags: ["dim"] },
      nets: { score: 1 }, goals: { score: 0, tags: ["size"] }, staff: { score: -1, tags: ["slow"] },
    },
  });
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.aspects, { pitch: { score: 1, tags: ["bounce", "fresh", "grip"] }, goals: { score: 0 }, staff: { score: -1, tags: ["slow"] } });
});

test("parseReport: malformed is bad", () => {
  const bad = (o: Record<string, unknown>) => assert.ok("bad" in parseReport({ turf_id: TURF, rating: 4, ...o }), JSON.stringify(o));
  assert.ok("bad" in parseReport(null));
  assert.ok("bad" in parseReport({ turf_id: "x", rating: 4 }));
  for (const rating of [0, 6, 4.5, "4", null]) bad({ rating });
  bad({ played_when: "midnight" });
  bad({ play_again: 2 });
  bad({ sport: 4 });
  bad({ sport: "x".repeat(41) });
  bad({ aspects: [] });
  bad({ aspects: { pitch: { score: 2 } } });
  bad({ aspects: { pitch: { score: 1, tags: "bounce" } } });
  bad({ comment: 7 });
  bad({ comment: "x".repeat(501) });
  bad({ note: "hi" });
  bad({ note: { body: "x".repeat(401), show_name: false } });
  bad({ price_paid: 99 });
  bad({ price_paid: 20_001 });
  bad({ price_paid: 1200.5 });
});

test("parseReport: note body null clears it; channel and ms only when sensible", () => {
  const r = parseReport({ turf_id: TURF, rating: 4, note: { body: "   ", show_name: true }, channel: "evil", ms: -5 });
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.note, { body: null, show_name: true });
  assert.equal(r.ok.channel, "turf_page");
  assert.equal("ms" in r.ok, false);
});

/* ---------------- the text screen ---------------- */

test("screen: phone numbers, emails and links are caught", () => {
  for (const t of ["Call 9876543210", "+91 98765 43210", "+91-98765-43210", "98765-43210 for bookings", "ring 09876543210", "919876543210",
    "abc.def@gmail.com", "https://example.com", "see www.kingsturf.in", "wa.me/919876543210", "kingsturf.com", "tapturf.in/turf/x", "bit.ly/abc"]) {
    assert.equal(contactProblem(t), "contact_info", t);
  }
});

test("screen: prices, times, scores and ordinary sentences pass", () => {
  for (const t of ["₹1,200 for an hour", "Best slot 7-9pm", "We made 120/3 in 12 overs", "Court 2 is better. Nets torn", "Slots 6-7, 7-8 and 8-9",
    "Played here.In the evening it is nice", "Paid 1000 for 2 hours, 10 players", "बढ़िया टर्फ, लाइट अच्छी है", "Mast turf aahe, parking 50 rupaye"]) {
    assert.equal(contactProblem(t), null, t);
  }
});

test("screen: cleanText as the database stores it", () => {
  assert.equal(cleanText("  a\u0000b \t c\r\n\r\n\r\n\r\nd  \n  e "), "a b c\n\nd\ne");
  assert.equal(cleanText("   \n "), null);
  assert.equal(cleanText(undefined), null);
});

/* ---------------- insights ---------------- */

test("bar words: great at half, needs work at 40%, else mostly okay", () => {
  assert.deepEqual(barWords({ n: 10, great: 5, needs_work: 4 }), { words: "5 of 10 say great", tone: "great" });
  assert.deepEqual(barWords({ n: 10, great: 4, needs_work: 4 }), { words: "4 of 10 say needs work", tone: "needs" });
  assert.deepEqual(barWords({ n: 10, great: 4, needs_work: 3 }), { words: "Mostly okay (10)", tone: "okay" });
  assert.deepEqual(barWords({ n: 3, great: 2, needs_work: 1 }), { words: "2 of 3 say great", tone: "great" });
});

test("chips: most named first, and the top Needs work chip is always in", () => {
  const tags = [
    { tag: "bounce", sign: 1 as const, n: 5 }, { tag: "fresh", sign: 1 as const, n: 4 }, { tag: "grip", sign: 1 as const, n: 3 },
    { tag: "worn", sign: -1 as const, n: 2 }, { tag: "hot", sign: -1 as const, n: 1 },
  ];
  assert.deepEqual(pickChips("pitch", tags).map((c) => `${c.label} ×${c.n}`), ["True bounce ×5", "Fresh surface ×4", "Worn or patchy ×2"]);
  assert.deepEqual(pickChips("pitch", tags.slice(0, 2)).map((c) => c.tag), ["bounce", "fresh"]);
  assert.deepEqual(pickChips("pitch", []), []);
});

test("scorecard: bars from 3 ratings in catalogue order, the rest waiting", () => {
  const s = scorecard([
    { aspect: "staff", n: 4, great: 3, okay: 1, needs_work: 0, tags: [{ tag: "quick", sign: 1, n: 3 }] },
    { aspect: "pitch", n: 10, great: 8, okay: 1, needs_work: 1, tags: [] },
    { aspect: "lights", n: 2, great: 1, okay: 0, needs_work: 1, tags: [] },
    { aspect: "washroom", n: 1, great: 0, okay: 1, needs_work: 0, tags: [] },
  ], ["Badminton"]);
  assert.deepEqual(s.bars.map((b) => [b.label, b.words]), [["Court", "8 of 10 say great"], ["Staff", "3 of 4 say great"]]);
  assert.deepEqual(s.waiting, ["lights", "washroom"]);
  assert.equal(waitingLine(s.waiting), "Lights and Washroom need a few more ratings.");
  assert.equal(waitingLine(["value"]), "Value needs a few more ratings.");
  assert.equal(waitingLine([]), null);
});

test("play again: from 3 answers, in tens past 10", () => {
  assert.equal(playAgainLine([0, 0, 2]), null);
  assert.equal(playAgainLine([1, 0, 2]), "2 of 3 would play again");
  assert.equal(playAgainLine([1, 1, 18]), "9 of 10 would play again");
  assert.equal(playAgainLine(null), null);
});

/* ---------------- the thank-you line ---------------- */

test("unlock: the first line that applies", () => {
  const base = { turfName: "Kings Turf", created: true, tapturfN: 1, aspectCounts: { pitch: 1 } };
  assert.equal(unlockLine(base), "You're the first player to rate Kings Turf on TapTurf.");
  assert.equal(unlockLine({ ...base, tapturfN: 5, aspectCounts: { pitch: 4, lights: 3 } }), "Your report put the Lights bar live on Kings Turf's page.");
  assert.equal(unlockLine({ ...base, tapturfN: 5, aspectCounts: { pitch: 4 }, price: { min: 800, max: 1200 } }), "Your rate is in. Players paid ₹800 to ₹1,200 here.");
  assert.equal(unlockLine({ ...base, tapturfN: 5, aspectCounts: { pitch: 4 }, price: { min: 1000, max: 1000 } }), "Your rate is in. Players paid ₹1,000 here.");
  assert.equal(unlockLine({ ...base, tapturfN: 5, aspectCounts: { pitch: 2, staff: 1 } }), "1 more Pitch rating and its bar goes live.");
  assert.equal(unlockLine({ ...base, tapturfN: 5, aspectCounts: { staff: 1 } }), "2 more Staff ratings and its bar goes live.");
  assert.equal(unlockLine({ ...base, tapturfN: 5, aspectCounts: { pitch: 7 } }), "5 players have now rated Kings Turf on TapTurf.");
  assert.equal(unlockLine({ ...base, created: false, tapturfN: 1, aspectCounts: {} }), "1 player has now rated Kings Turf on TapTurf.", "an edit is never 'the first'");
  assert.equal(unlockLine({ ...base, tapturfN: 2, aspectCounts: { pitch: 3 }, sport: "Badminton" }), "Your report put the Court bar live on Kings Turf's page.");
});

/* ---------------- the sheet's words and numbers ---------------- */

test("price chips: listed rate with ₹200 either side; else players' range; else a default", () => {
  assert.deepEqual(priceChips(1020, null), [{ amount: 1000, listed: true }, { amount: 800 }, { amount: 1200 }]);
  assert.deepEqual(priceChips(200, { min: 500, max: 900 }), [{ amount: 200, listed: true }, { amount: 400 }], "never under ₹100");
  assert.deepEqual(priceChips(null, { min: 700, max: 1300 }), [{ amount: 700 }, { amount: 1000 }, { amount: 1300 }]);
  assert.deepEqual(priceChips(null, { min: 900, max: 900 }), [{ amount: 900 }]);
  assert.deepEqual(priceChips(null, null), [{ amount: 600 }, { amount: 1000 }, { amount: 1500 }]);
});

test("listed rate follows the time of day played", () => {
  const p = { morning: 800, afternoon: null, evening: 1200, min: 800 };
  assert.equal(listedFor(p, "night"), 1200);
  assert.equal(listedFor(p, "evening"), 1200);
  assert.equal(listedFor(p, "morning"), 800);
  assert.equal(listedFor(p, "afternoon"), 800, "no afternoon rate: the lowest");
  assert.equal(listedFor(p, null), 800);
  assert.equal(listedFor(null, "night"), null);
});

test("tip placeholder follows the taps", () => {
  assert.equal(tipPlaceholder({ pitch: { score: 1 }, lights: { score: -1 } }, null), "You flagged the lights. What should the next team know?");
  assert.equal(tipPlaceholder({ pitch: { score: -1 } }, "Badminton"), "You flagged the court. What should the next team know?");
  assert.equal(tipPlaceholder({ value: { score: -1 } }, null), "You flagged the price. What should the next team know?");
  assert.equal(tipPlaceholder({ pitch: { score: 1 }, staff: { score: 1 } }, null), "What made it great? Best slot, parking, what to carry.");
  assert.equal(tipPlaceholder({ pitch: { score: 0 } }, null), "Anything the next team should know?");
  assert.equal(tipPlaceholder({}, null), "Anything the next team should know?");
});

test("rate card title: a game, a call, a WhatsApp tap, or the plain one", () => {
  const now = new Date("2026-10-26T12:00:00+05:30"); // a Monday
  assert.equal(rateTitle("Kings", null, now), "How was your game here?");
  assert.equal(rateTitle("Kings", { kind: "game", at: "2026-10-24T19:00:00+05:30" }, now), "How was Saturday's game at Kings?");
  assert.equal(rateTitle("Kings", { kind: "game", at: "2026-10-25T07:00:00+05:30" }, now), "How was yesterday's game at Kings?");
  assert.equal(rateTitle("Kings", { kind: "call", at: "2026-10-24T09:00:00+05:30" }, now), "You called Kings on Sat. Played there?");
  assert.equal(rateTitle("Kings", { kind: "whatsapp", at: "2026-10-14T09:00:00+05:30" }, now), "You messaged Kings on 14 Oct. Played there?");
});

test("share text points at the 20-second link", () => {
  assert.deepEqual(shareText("Kings Turf", "kings-turf"), {
    text: "We played at Kings Turf. Rate your game too, it takes 20 seconds: https://tapturf.in/turf/kings-turf?rate=1",
    url: "https://tapturf.in/turf/kings-turf?rate=1",
  });
});

/* ---------------- the draft ---------------- */

test("draft: read back field by field; old or broken is nothing", () => {
  const now = 1_800_000_000_000;
  const d = { ...emptyDraft(now), stars: 4, sport: "Football", when: "evening", aspects: { lights: { score: -1, tags: ["dim"] } }, step: 2, waiting: true };
  const back = readDraft(JSON.stringify(d), now + 1000);
  assert.ok(back);
  assert.equal(back.stars, 4);
  assert.deepEqual(back.aspects, { lights: { score: -1, tags: ["dim"] } });
  assert.equal(back.waiting, true);
  assert.equal(hasAnswers(back), true);
  assert.equal(hasAnswers(emptyDraft(now)), false);
  assert.equal(readDraft(JSON.stringify(d), now + 15 * 86_400_000), null, "two weeks on, it's another game");
  assert.equal(readDraft("{not json", now), null);
  assert.equal(readDraft(JSON.stringify({ ...d, v: 2 }), now), null);
  assert.equal(readDraft(JSON.stringify({ ...d, stars: 9, aspects: { pitch: { score: 7 } } }), now + 1)?.stars, 0);
});

/* ---------------- the AI summary's lines ---------------- */

test("summary lines: taps become words; Google rows as before; a tapped report counts without a tip", () => {
  assert.equal(
    summaryLine({ rating: 4, comment: "Ask for court 2.", source: null, sport: "Box Cricket", played_when: "evening", play_again: 1,
      aspects: { pitch: { score: 1, tags: ["bounce"] }, lights: { score: -1, tags: ["dim"] } } }),
    "- 4 stars (TapTurf, Box Cricket, evening): Pitch great (true bounce); Lights needs work (dim corners). Would play again. Ask for court 2.",
  );
  assert.equal(summaryLine({ rating: 5, comment: "Lovely ground", source: "google" }), "- 5 stars (Google): Lovely ground");
  assert.equal(writtenEnough({ rating: 3, comment: null, source: null, aspects: { pitch: { score: 0 }, staff: { score: 1 } } }), true);
  assert.equal(writtenEnough({ rating: 3, comment: null, source: null, aspects: { pitch: { score: 0 } } }), false);
  assert.equal(writtenEnough({ rating: 3, comment: "ok", source: "google" }), false);
});

/* ---------------- the turf page's shape, old payloads and new ---------------- */

test("shape: an old payload's reviews shape exactly as before (no new keys)", () => {
  const [r] = shapeReviews([{ id: "n1", user_id: "u1", rating: 5, comment: "great", created_at: "2026-10-02T00:00:00Z", source: null, user_name: "Ravi", upvotes: 2 }]);
  assert.deepEqual(Object.keys(r).sort(), ["author_name", "author_url", "booking_id", "comment", "created_at", "id", "rating", "source", "source_date_label", "source_url",
    "turf_id", "updated_at", "upvotes", "user_avatar", "user_id", "user_name", "viewer_has_upvoted"]);
});

test("shape: a new payload's report fields come through, junk dropped", () => {
  const [r, junk] = shapeReviews([
    { id: "n1", user_id: "u1", rating: 4, source: null, sport: "Box Cricket", played_when: "evening", play_again: 1, verified_via: "game",
      edited_at: "2026-11-02T00:00:00Z", aspects: { pitch: { score: 1, tags: ["bounce"] }, lights: { score: -1, tags: ["dim"] }, nets: { score: 0 } } },
    { id: "n2", user_id: "u2", rating: 3, source: null, sport: 7, played_when: "noon", play_again: 9, verified_via: "maybe", aspects: { pitch: { score: 5 } }, edited_at: null },
  ]);
  assert.deepEqual([r.sport, r.played_when, r.play_again, r.verified_via, r.edited_at], ["Box Cricket", "evening", 1, "game", "2026-11-02T00:00:00Z"]);
  assert.deepEqual(r.aspects, { pitch: { score: 1, tags: ["bounce"] }, lights: { score: -1, tags: ["dim"] }, nets: { score: 0 } });
  assert.deepEqual([junk.sport, junk.played_when, junk.play_again, junk.verified_via, junk.aspects], [null, null, null, null, null]);
});

test("shape: review aspects and play again", () => {
  assert.deepEqual(shapeReviewAspects(undefined), []);
  assert.deepEqual(shapeReviewAspects([
    { aspect: "pitch", n: 3, great: 2, okay: 0, needs_work: 1, tags: [{ tag: "bounce", sign: 1, n: 2, last_at: "x" }, { tag: "bad", sign: 2, n: 1 }] },
    { aspect: "roof", n: 3, great: 3, okay: 0, needs_work: 0 },
    { aspect: "staff", n: 0, great: 0, okay: 0, needs_work: 0 },
    { aspect: "value", n: "3" },
  ]), [{ aspect: "pitch", n: 3, great: 2, okay: 0, needs_work: 1, tags: [{ tag: "bounce", sign: 1, n: 2 }] }]);
  assert.deepEqual(shapePlayAgain({ count: 2, play_again: [1, 0, 4] }), [1, 0, 4]);
  assert.equal(shapePlayAgain({ count: 2 }), null, "an older database");
});
