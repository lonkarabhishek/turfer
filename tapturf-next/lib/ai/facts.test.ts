import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFacts, hasReviewText, type FactsReviews } from "./facts";
import { asksMore, claimsUnwritten, googleReviewsLink, isReviewsAsk, pickAnswer, reviewsAnswer, reviewsSubject } from "./reviewsAnswer";
import { backedBy, playersSayOf, PAGE_REVIEWS, type PlayersSay } from "../reviews/playersSay";
import { ANSWER_SYSTEM, COMPARE_SYSTEM } from "./answerRules";
import type { Turf } from "../../types/turf";

// What Ask says when a player asks what people say about a turf, on rows
// shaped like production's (29 Oct 2026): Google's rating on 3,727 of
// 3,747 turfs, a "What players say" summary on 18, TapTurf players'
// reports on 10, nothing at all on 20.

const MAPS = "https://maps.google.com/?cid=17919041577919981198";

function turf(over: Partial<Turf> = {}): Turf {
  return {
    id: "t1",
    name: "PLaY Arena",
    city: "bangalore",
    area: "Kasavanahalli",
    address: "75, Central Jail Road, Kasavanahalli, Bengaluru",
    sports: ["Box Cricket", "Football"],
    amenities: [],
    images: [],
    rating: 4.5,
    total_reviews: 40312,
    external_review_url: "https://www.google.com/maps/place/PLaY+Arena/@12.911395,77.6762991,17z",
    morning_price: 3000,
    afternoon_price: 3000,
    evening_price: 3000,
    weekend_morning_price: null,
    weekend_afternoon_price: null,
    weekend_evening_price: null,
    price_unit: "per_hour",
    slot_minutes: 60,
    start_time: "10:00:00",
    end_time: "23:00:00",
    review_summary: null,
    ...over,
  } as unknown as Turf;
}

const reboot = turf({
  name: "Reboot Sports Arena",
  rating: 4.1,
  total_reviews: 1442,
  external_review_url: "https://maps.google.com/?cid=12292351290359652478",
  review_summary: {
    summary: "Reviewers praise the badminton courts, which they describe as well maintained with good lighting, and the friendly staff. A few mention that courts are hard to find at peak hours.",
    likes: ["well maintained badminton courts", "good lighting", "friendly staff", "easy Playo booking"],
    gripes: ["two courts have hard rubber surface", "hard to find court at peak hours"],
    based_on: 5,
    sources: ["Google"],
  },
});

const turfGround = turf({
  name: "The Turf Ground",
  rating: 4.6,
  total_reviews: 437,
  external_review_url: "https://maps.google.com/?cid=5888956682565648017",
  review_summary: {
    summary: "Reviewers praise the turf for its good size and space to host multiple games.",
    likes: ["good turf size", "well maintained equipment", "good grass condition"],
    gripes: [],
    based_on: 3,
    sources: ["TapTurf"],
  },
});
const turfGroundReviews: FactsReviews = {
  reviews: [
    { rating: 5, source: null, comment: "This is a great turf with plenty of space to host multiple games." },
    { rating: 5, source: null, comment: "The turf net was really nice and size is good!" },
    { rating: 5, source: null, comment: "Very good grass condition!" },
  ],
  stats: { count: 3, average: 5 },
  aspects: [],
  playAgain: [0, 0, 0],
};

test("the sheet reads live reviews only, and keeps TapTurf players' apart from Google's", () => {
  const f = buildFacts(turf(), {
    reviews: [
      { rating: 5, source: null, comment: "Lights and pitch are good, staff helpful" },
      { rating: 1, source: null, comment: "Removed report that must never be read", status: "removed" },
      { rating: 2, source: null, comment: "Hidden report that must never be read", status: "hidden" },
      { rating: 4, source: null, comment: "Held report that must never be read", status: "held" },
      { rating: 3, source: "google", comment: "Google says the turf is small but clean" },
      { rating: 1, source: "google", comment: "Removed Google row never read", status: "removed" },
      { rating: 4, source: null, comment: "short" },
      { rating: 2, source: "google", comment: "too small" },
    ],
    stats: { count: 2, average: 4.5 },
  });
  const tt = f.tapturf_reports as { players: number; average_stars: string; recent: { stars: number; text: string }[] };
  // A player's short tip is a tip (the page shows it); a Google text that short is not read.
  assert.deepEqual(tt.recent, [
    { stars: 5, text: "Lights and pitch are good, staff helpful" },
    { stars: 4, text: "short" },
  ]);
  assert.deepEqual(f.google_reviews, [{ stars: 3, text: "Google says the turf is small but clean" }]);
  assert.equal(tt.players, 2);
  assert.equal(tt.average_stars, "4.5");
  const all = JSON.stringify(f);
  assert.ok(!/never be read|never read/.test(all), "a review that isn't live reached the sheet");
  // The old mixed list is gone, and so is the one-string rating.
  assert.ok(!("recent_reviews" in f) && !("google_rating" in f));
});

test("TapTurf counts: stars, would play again over 12 months, the scorecard in the page's words", () => {
  const f = buildFacts(turf({ sports: ["Badminton"] }), {
    reviews: [{ rating: 5, source: null, comment: null }],
    stats: { count: 3, average: 4.666 },
    playAgain: [0, 1, 2],
    aspects: [
      { aspect: "lights", n: 3, great: 3, okay: 0, needs_work: 0, tags: [{ tag: "bright", sign: 1, n: 2 }] },
      { aspect: "pitch", n: 4, great: 1, okay: 1, needs_work: 2, tags: [{ tag: "worn", sign: -1, n: 2 }, { tag: "fresh", sign: 1, n: 1 }] },
      { aspect: "value", n: 0, great: 0, okay: 0, needs_work: 0 },
    ],
  });
  const tt = f.tapturf_reports as Record<string, unknown>;
  assert.equal(tt.players, 3);
  assert.equal(tt.average_stars, "4.7");
  assert.deepEqual(tt.would_play_again, { yes: 2, maybe: 1, no: 0 });
  // Most rated first; a badminton turf's pitch is its Court; chips as the page labels them.
  assert.deepEqual(tt.scorecard, [
    { part: "Court", says: "2 of 4 say needs work", mentions: ["Worn or patchy (2)", "Fresh surface (1)"] },
    { part: "Lights", says: "3 of 3 say great", mentions: ["Bright everywhere (2)"] },
  ]);
  // A report with stars only is no tip.
  assert.ok(!("recent" in tt));
  // Nobody answered would play again: no zeros to misread.
  const none = buildFacts(turf(), { stats: { count: 1, average: 4 }, playAgain: [0, 0, 0] }).tapturf_reports as Record<string, unknown>;
  assert.ok(!("would_play_again" in none));
  assert.equal(none.average_stars, "4.0");
  // Without the stats (an older payload), from the rows themselves.
  const rows = buildFacts(turf(), { reviews: [{ rating: 4, source: null, comment: null }, { rating: 5, source: null, comment: null }] }).tapturf_reports as Record<string, unknown>;
  assert.equal(rows.players, 2);
  assert.equal(rows.average_stars, "4.5");
  // No reports: no key at all.
  assert.ok(!("tapturf_reports" in buildFacts(turf(), { stats: { count: 0, average: 0 } })));
});

test("Google's rating: one decimal, the count in Indian digits, and whether the page links the reviews", () => {
  assert.deepEqual(buildFacts(turf()).google, { rating: "4.5", reviews: "40,312", reviews_link: "yes" });
  assert.deepEqual(buildFacts(turf({ rating: 5, total_reviews: 140312 })).google, { rating: "5.0", reviews: "1,40,312", reviews_link: "yes" });
  // A Google search page is no reviews link (the page shows none).
  assert.equal((buildFacts(turf({ external_review_url: "https://www.google.com/search?q=Kage+Reviews" })).google as Record<string, unknown>).reviews_link, "no");
  // A score without a count is still a score; no rating, no google key.
  assert.deepEqual(buildFacts(turf({ total_reviews: 0 })).google, { rating: "4.5", reviews_link: "yes" });
  assert.ok(!("google" in buildFacts(turf({ rating: 0, total_reviews: 0 }))));
  assert.ok(!("google" in buildFacts(turf({ rating: null as unknown as number, total_reviews: null as unknown as number }))));
});

test("What players say comes as the page shows it, said as whose, without booking apps", () => {
  const f = buildFacts(reboot, { reviews: [{ rating: 4, source: "google", comment: "Booked it on Playo. The courts are clean and the staff are friendly here." }] });
  assert.deepEqual(f.players_say, {
    from: "Google reviews",
    written_reviews: 5,
    summary: reboot.review_summary!.summary,
    likes: ["well maintained badminton courts", "good lighting", "friendly staff"],
    gripes: ["two courts have hard rubber surface", "hard to find court at peak hours"],
  });
  assert.ok(!/playo/i.test(JSON.stringify(f)), "a booking app reached the sheet");
  assert.equal((f.players_say as Record<string, unknown>).from, "Google reviews");
  assert.equal((buildFacts(turfGround, turfGroundReviews).players_say as Record<string, unknown>).from, "TapTurf reviews");
  assert.equal(hasReviewText(f), true);
  assert.equal(hasReviewText(buildFacts(turf())), false);
  // Stars alone are not words.
  assert.equal(hasReviewText(buildFacts(turf(), { stats: { count: 1, average: 4 } })), false);
});

test("the plain answer: Google's rating only, the commonest case", () => {
  assert.deepEqual(reviewsAnswer(buildFacts(turf())), {
    answer: "PLaY Arena is rated 4.5 on Google from 40,312 reviews. No written reviews on TapTurf yet: read them on Google, or rate it on TapTurf after you play.",
    covered: true,
  });
  // No Google Maps link on the page: no "read them on Google".
  assert.equal(
    reviewsAnswer(buildFacts(turf({ name: "Kage Multisport Turf", rating: 4.3, total_reviews: 302, external_review_url: "https://www.google.com/search?q=x" }))).answer,
    "Kage Multisport Turf is rated 4.3 on Google from 302 reviews. No written reviews on TapTurf yet. Played there? Rate it on TapTurf after you play.",
  );
});

test("the plain answer: nothing at all", () => {
  assert.equal(
    reviewsAnswer(buildFacts(turf({ name: "The H Sports Turf", rating: null as unknown as number, total_reviews: null as unknown as number }))).answer,
    "TapTurf has no ratings or reviews for The H Sports Turf yet. Played there? Rate it on TapTurf after you play.",
  );
});

test("the plain answer: TapTurf players first, then Google, then the summary as whose it is", () => {
  assert.equal(
    reviewsAnswer(buildFacts(turfGround, turfGroundReviews)).answer,
    "3 players on TapTurf rate The Turf Ground 5.0. TapTurf players like good turf size, well maintained equipment and good grass condition (summed up from 3 written reviews). It is rated 4.6 on Google from 437 reviews.",
  );
  // One report, stars only: said as one player's, and nothing written yet.
  assert.equal(
    reviewsAnswer(buildFacts(turf({ name: "T12 Sports Turf", total_reviews: 41, external_review_url: MAPS }), { reviews: [{ rating: 4, source: null, comment: null }], stats: { count: 1, average: 4 } })).answer,
    "1 player on TapTurf gave T12 Sports Turf 4 stars. It is rated 4.5 on Google from 41 reviews. No written reviews on TapTurf yet: read them on Google, or rate it on TapTurf after you play.",
  );
  // One report with a tip: quoted as theirs.
  assert.equal(
    reviewsAnswer(buildFacts(turf({ name: "Kage Multisport Turf", rating: 4.3, total_reviews: 302 }), { reviews: [{ rating: 4, source: null, comment: "Grass and net should be better, its very saggy" }], stats: { count: 1, average: 4 } })).answer,
    '1 player on TapTurf gave Kage Multisport Turf 4 stars and wrote: "Grass and net should be better, its very saggy." It is rated 4.3 on Google from 302 reviews.',
  );
  // Several without a summary: the latest tip, cut at a word when long.
  const long = reviewsAnswer(
    buildFacts(turf({ name: "Kage Multisport Turf", rating: 4.3, total_reviews: 302 }), {
      reviews: [{ rating: 3, source: null, comment: `The net sags at the far end and the mat is worn near the crease, so balls keep dying ${"and more words ".repeat(8)}` }],
      stats: { count: 2, average: 3.5 },
    }),
  ).answer;
  assert.match(long, /^2 players on TapTurf rate Kage Multisport Turf 3\.5\. The latest says: "The net sags at the far end[^"]*\w…" It is rated 4\.3 on Google from 302 reviews\.$/);
  // Would play again and the scorecard.
  const played = reviewsAnswer(
    buildFacts(turf({ name: "Nexus Arena 2.0" }), {
      stats: { count: 4, average: 4.5 },
      playAgain: [1, 0, 3],
      aspects: [{ aspect: "lights", n: 4, great: 3, okay: 1, needs_work: 0, tags: [] }],
    }),
  ).answer;
  assert.ok(played.startsWith("4 players on TapTurf rate Nexus Arena 2.0 4.5, and 3 of 4 would play again. On their scorecard, Lights: 3 of 4 say great."), played);
  // Google's summary: what its reviewers like, and complain about.
  assert.equal(
    reviewsAnswer(buildFacts(reboot)).answer,
    "Reboot Sports Arena is rated 4.1 on Google from 1,442 reviews. Google reviewers like well maintained badminton courts, good lighting and friendly staff; some mention two courts have hard rubber surface and hard to find court at peak hours (summed up from 5 written reviews).",
  );
});

test("the plain answer never pads with prices or hours, never names a reviewer, never invents a count", () => {
  const sheets = [
    buildFacts(turf()),
    buildFacts(reboot),
    buildFacts(turfGround, turfGroundReviews),
    buildFacts(turf({ rating: 0, total_reviews: 0 })),
  ];
  for (const f of sheets) {
    const { answer } = reviewsAnswer(f);
    // The sheet's rates and hours ("10 AM to 11 PM") stay out of it.
    assert.ok(!/₹|\b\d{1,2}(?::\d\d)? ?(?:am|pm)\b|open 24/i.test(answer), answer);
    assert.ok(f.hours && !answer.includes(String(f.hours)), answer);
    assert.ok(!/reviewers mention|players say/i.test(answer) || hasReviewText(f), answer);
    // Every number said is one the sheet holds.
    const sheet = JSON.stringify(f);
    for (const n of answer.match(/\d[\d,.]*/g) ?? []) assert.ok(sheet.includes(n.replace(/[.,]$/, "")), `${n} is not in the sheet: ${answer}`);
  }
});

test("Read Google reviews: the Google Maps page only, and only with a Google rating", () => {
  assert.deepEqual(googleReviewsLink({ rating: 4.5, external_review_url: MAPS }), { label: "Read Google reviews", href: MAPS });
  assert.equal(googleReviewsLink({ rating: 4.5, external_review_url: "https://www.google.com/search?q=x" }), null);
  assert.equal(googleReviewsLink({ rating: 4.5, external_review_url: "https://playo.co/venues/x" }), null);
  assert.equal(googleReviewsLink({ rating: null, external_review_url: MAPS }), null);
});

test("questions about what people say of one venue", () => {
  const it = [
    "What do players say about it?",
    "what do people say about this turf",
    "What do people think of it",
    "what are people saying",
    "reviews?",
    "Reviews",
    "any reviews",
    "What are the reviews like?",
    "google rating?",
    "Is it good?",
    "is it any good",
    "is this turf worth it",
    "Is the turf good or not",
    "How is it?",
    "how's this place",
    "does it have good reviews",
    "what do players say about the pitch",
    "kaisa hai",
    "log kya kehte hai",
  ];
  for (const q of it) {
    assert.equal(reviewsSubject(q), "it", q);
    assert.equal(isReviewsAsk(q), true, q);
  }
  const named: [string, string][] = [
    ["What do players say about Hotfut Bavdhan?", "Hotfut Bavdhan"],
    ["reviews of PLaY Arena", "PLaY Arena"],
    ["What's the rating of The Turf Ground", "The Turf Ground"],
    ["Hotfut Bavdhan reviews", "Hotfut Bavdhan"],
    ["How is Kage Multisport Turf?", "Kage Multisport Turf"],
    ["is Reboot Sports Arena any good", "Reboot Sports Arena"],
    ["Hotfut kaisa hai", "Hotfut"],
    ["Hotfut ke reviews kaise hai", "Hotfut"],
    ["what do people say about the parking at Hotfut Bavdhan", "Hotfut Bavdhan"],
  ];
  for (const [q, name] of named) {
    assert.equal(reviewsSubject(q), name, q);
    assert.equal(isReviewsAsk(q), true, q);
  }
  // Said in a longer question the router read: still about what people say.
  for (const q of ["Can you tell me the reviews for this turf on Google", "What is the feedback from players here", "Would you recommend Hotfut Bavdhan"]) assert.equal(isReviewsAsk(q), true, q);
});

test("searches, comparisons and other questions are not about one venue's reviews", () => {
  const not = [
    "reviews of turfs in Pune",
    "best rated turfs in Pune",
    "best reviewed turf near me",
    "top rated box cricket in Kothrud",
    "most reviewed turfs",
    "turf with good reviews in Baner",
    "turfs rated above 4",
    "4 star turfs in Nashik",
    "compare Hotfut Bavdhan and PLaY Arena reviews",
    "Hotfut vs PLaY Arena",
    "which has better reviews, Hotfut or PLaY Arena",
    "how do I rate this turf",
    "I want to write a review",
    "my review",
    "does it have parking",
    "what time does it open",
    "how much is it",
    "how is the parking",
    "how is the pitch at night",
    "is it open now",
    "is it good for kids",
    "what are the rates",
    "rate?",
    "football turf in Pune",
    "hi",
    "how are you",
    "can you recommend a turf",
  ];
  for (const q of not) assert.equal(isReviewsAsk(q), false, q);
  for (const q of [...not, "rate kaisa hai", "parking kaisi hai"]) assert.notEqual(reviewsSubject(q), "it", q);
});

test("the answer prompt says whose words are whose, in order, and never fills a gap", () => {
  for (const rule of [
    "tapturf_reports first, as TapTurf players",
    "Then google",
    "exactly as written",
    "Then players_say, as its from says",
    "never all of Google's",
    'never write "reviewers mention"',
    "say there are no written reviews on TapTurf yet",
    "google.reviews_link is yes",
    "rate it on TapTurf after they play",
    "add no prices, hours or facilities",
    "Never name a reviewer",
  ])
    assert.ok(ANSWER_SYSTEM.includes(rule), rule);
  // The old example that taught "reviewers mention" for everything is gone.
  assert.ok(!ANSWER_SYSTEM.includes('"TapTurf lists...", "reviewers mention..."'));
  assert.ok(COMPARE_SYSTEM.includes('"No written reviews yet" when the sheet has none of those three'));
  assert.ok(COMPARE_SYSTEM.includes("TapTurf players' first when tapturf_reports has them"));
});

// ── Review round 2 (29 Oct): each finding's case, failing before its fix ──

const dnSummary: PlayersSay = {
  summary: "Reviewers describe the venue positively, with one calling it pretty good. Another praises the pitch and says the lights were nice and professional.",
  likes: ["great pitch", "nice lights", "professional lighting"],
  gripes: [],
  based_on: 2,
  sources: ["TapTurf"],
};
const dn = turf({ name: "DN Parande Football And Cricket Turf", rating: 5, total_reviews: 261, external_review_url: MAPS, review_summary: dnSummary });

test("F1: a TapTurf summary the live reports no longer back is never said", () => {
  // Both reports live, as in production: the summary stands.
  const both = buildFacts(dn, {
    reviews: [
      { rating: 5, source: null, comment: "Pretty good" },
      { rating: 5, source: null, comment: "Pitch was great, lights were nice and professional" },
    ],
    stats: { count: 2, average: 5 },
  });
  assert.equal((both.players_say as Record<string, unknown>).from, "TapTurf reviews");
  // The second player removes theirs (turf_page then sends the one live row): its words go with it.
  const one = buildFacts(dn, { reviews: [{ rating: 5, source: null, comment: "Pretty good" }], stats: { count: 1, average: 5 } });
  assert.ok(!("players_say" in one), JSON.stringify(one.players_say));
  const said = reviewsAnswer(one).answer;
  assert.ok(!/great pitch|lights/i.test(said), said);
  assert.equal(said, '1 player on TapTurf gave DN Parande Football And Cricket Turf 5 stars and wrote: "Pretty good." It is rated 5.0 on Google from 261 reviews.');
  // A row the caller read that isn't live counts as gone too.
  const hidden = buildFacts(dn, {
    reviews: [
      { rating: 5, source: null, comment: "Pretty good" },
      { rating: 5, source: null, comment: "Pitch was great, lights were nice and professional", status: "hidden" },
    ],
  });
  assert.ok(!("players_say" in hidden));
  // Every report removed: no summary, nothing written, and the model is not asked to read one.
  const none = buildFacts(turfGround, { reviews: [], stats: { count: 0, average: 0 } });
  assert.ok(!("players_say" in none));
  assert.equal(hasReviewText(none), false);
  // A report with 2 rated parts and no tip counts, as the summary pass counts it.
  const tapped = buildFacts(dn, {
    reviews: [
      { rating: 5, source: null, comment: "Pretty good" },
      { rating: 4, source: null, comment: null, aspects: { pitch: { score: 1 }, lights: { score: 1 } } },
    ],
  });
  assert.ok("players_say" in tapped);
  // Google's own summary is not a player's to withdraw; without the rows (a listing check) it stays as stored.
  assert.ok("players_say" in buildFacts(reboot, { reviews: [] }));
  assert.ok("players_say" in buildFacts(dn));
  // turf_page's latest 20 can't show them all: one of the players' own still live is enough.
  const many = Array.from({ length: PAGE_REVIEWS - 1 }, () => ({ rating: 4, source: "google", comment: "A Google review long enough to count" }));
  const big: PlayersSay = { ...dnSummary, based_on: 30, sources: ["Google", "TapTurf"] };
  assert.equal(backedBy(big, [{ rating: 5, source: null, comment: "Pitch was great, lights were nice" }, ...many]), true);
  assert.equal(backedBy(big, many.concat(many.slice(0, 1))), false);
  // The page reads it the same way.
  assert.equal(playersSayOf(dnSummary, [{ rating: 5, comment: "Pretty good" }]), null);
  assert.ok(playersSayOf(dnSummary, [{ rating: 5, comment: "Pretty good" }, { rating: 5, comment: "Pitch was great, lights were nice and professional" }]));
});

test("F2: a short TapTurf tip is written, as the page shows it", () => {
  for (const tip of ["Nice turf", "Good turf!", "Ok"]) {
    const f = buildFacts(turf({ name: "T12 Sports Turf", total_reviews: 41, external_review_url: MAPS }), { reviews: [{ rating: 4, source: null, comment: tip }], stats: { count: 1, average: 4 } });
    assert.equal(hasReviewText(f), true, tip);
    const a = reviewsAnswer(f).answer;
    assert.ok(a.includes(`wrote: "${/[.!?]$/.test(tip) ? tip : `${tip}.`}"`), a);
    assert.ok(!/No written reviews/.test(a), a);
  }
  // Only booking-app words, or blank: nothing written.
  assert.equal(hasReviewText(buildFacts(turf(), { reviews: [{ rating: 4, source: null, comment: "   " }], stats: { count: 1, average: 4 } })), false);
});

const play = () => ({ turf: { rating: 4.5, external_review_url: MAPS }, facts: buildFacts(turf()) });
const MADE_UP = "Reviewers mention PLaY Arena in Kasavanahalli is rated 4.5 from 40312 Google reviews. TapTurf lists it at ₹3000 an hour.";
const PLAY_PLAIN = "PLaY Arena is rated 4.5 on Google from 40,312 reviews. No written reviews on TapTurf yet: read them on Google, or rate it on TapTurf after you play.";

test("F3: other ways of asking what people think are review questions", async () => {
  for (const q of ["Do people like it?", "What do players like about it?", "What do people complain about?", "Any complaints?", "Do players recommend it?", "Are players happy with it?", "how good is it", "pros and cons?"]) {
    assert.equal(isReviewsAsk(q), true, q);
    assert.equal(reviewsSubject(q), "it", q);
  }
  assert.equal(reviewsSubject("do people like Hotfut Bavdhan"), "Hotfut Bavdhan");
  assert.equal(reviewsSubject("complaints about Hotfut Bavdhan"), "Hotfut Bavdhan");
  // Not about what people say: a complaint to make, or the venue's own advice.
  for (const q of ["how do I file a complaint", "I want to complain", "do they recommend booking in advance", "how good is the parking"]) assert.equal(isReviewsAsk(q), false, q);
  // On PLaY Arena's page (nothing written), "Do people like it?" is the plain answer with the link, and the model is never asked.
  let called = 0;
  const model = async () => (called++, { answer: MADE_UP, covered: true });
  const r = await pickAnswer("Do people like it?", play(), model);
  assert.equal(r.path, "plain");
  assert.equal(called, 0);
  assert.equal(r.answer?.answer, PLAY_PLAIN);
  assert.equal(r.answer?.link?.href, MAPS);
  // A phrasing nobody listed: the model's "reviewers mention" with nothing written is replaced, with the link.
  const odd = await pickAnswer("tell me about this place", play(), model);
  assert.equal(odd.aboutReviews, false);
  assert.equal(odd.path, "plain-backstop");
  assert.equal(odd.answer?.answer, PLAY_PLAIN);
  assert.equal(odd.answer?.link?.href, MAPS);
  assert.equal(claimsUnwritten(MADE_UP, play().facts), true);
  assert.equal(claimsUnwritten("Players say the turf is great.", play().facts), true);
  // Honest answers stand, and so does a reviewer's note when the sheet has one.
  assert.equal(claimsUnwritten(PLAY_PLAIN, play().facts), false);
  assert.equal(claimsUnwritten("Yes, TapTurf lists parking at PLaY Arena.", play().facts), false);
  assert.equal(claimsUnwritten("Yes, players will find parking on site, TapTurf lists.", play().facts), false);
  assert.equal(claimsUnwritten("Reviewers note it is larger than most.", buildFacts(turf({ good_to_know: "Larger than most turfs." }))), false);
  assert.equal(claimsUnwritten("Google reviewers like the courts.", buildFacts(reboot)), false);
});

test("F4: the summary's gripes are what some mention, and from how many written reviews", () => {
  const wow = turf({
    name: "WOW Sports And Fitness",
    rating: 4.2,
    total_reviews: 673,
    review_summary: { summary: "Reviewers are divided.", likes: ["good badminton courts", "new football turf", "open well equipped gym"], gripes: ["rude fee collecting staff", "mosquito breeding during rains"], based_on: 5, sources: ["Google"] },
  });
  const a = reviewsAnswer(buildFacts(wow)).answer;
  assert.ok(!/common complaints/i.test(a), a);
  assert.equal(
    a,
    "WOW Sports And Fitness is rated 4.2 on Google from 673 reviews. Google reviewers like good badminton courts, new football turf and open well equipped gym; some mention rude fee collecting staff and mosquito breeding during rains (summed up from 5 written reviews).",
  );
  // Gripes alone.
  const gripes = buildFacts(turf({ name: "X", review_summary: { summary: "", likes: [], gripes: ["dirty court"], based_on: 2, sources: ["Google"] } }));
  assert.ok(reviewsAnswer(gripes).answer.endsWith("Some Google reviewers mention dirty court (summed up from 2 written reviews)."), reviewsAnswer(gripes).answer);
});

test("F5: never an empty answer", () => {
  // A players' summary with no reports and no Google rating (a sheet built without the rows).
  const f = buildFacts(turfGround, {});
  delete f.google;
  delete f.tapturf_reports;
  const a = reviewsAnswer(f);
  assert.ok(a.answer.length > 0);
  assert.equal(a.answer, "TapTurf players like good turf size, well maintained equipment and good grass condition (summed up from 3 written reviews).");
  // With Google's rating it is not dropped either.
  const g = reviewsAnswer({ ...f, google: { rating: "4.6", reviews: "437" } }).answer;
  assert.ok(g.includes("TapTurf players like good turf size"), g);
  // A summary with nothing left to say: the plain "no reviews yet", not "".
  assert.equal(reviewsAnswer({ name: "Y", players_say: { from: "TapTurf reviews" } }).answer, "TapTurf has no ratings or reviews for Y yet. Played there? Rate it on TapTurf after you play.");
});

test("F6: one review is a review; both sources are said in lower case mid-sentence", () => {
  assert.equal(
    reviewsAnswer(buildFacts(turf({ name: "Jai Hanuman Turf", rating: 5, total_reviews: 1 }))).answer,
    "Jai Hanuman Turf is rated 5.0 on Google from 1 review. No written reviews on TapTurf yet: read them on Google, or rate it on TapTurf after you play.",
  );
  const mixed = reviewsAnswer(buildFacts(turf({ ...reboot, review_summary: { ...reboot.review_summary!, gripes: [], sources: ["Google", "TapTurf"] } }))).answer;
  assert.ok(mixed.includes(". Reviewers on Google and TapTurf like well maintained badminton courts"), mixed);
  const gripesOnly = reviewsAnswer(buildFacts(turf({ ...reboot, review_summary: { ...reboot.review_summary!, likes: [], sources: ["Google", "TapTurf"] } }))).answer;
  assert.ok(gripesOnly.includes("Some reviewers on Google and TapTurf mention"), gripesOnly);
});

test("F7: a question that also asks for a price, a time or a facility goes to the model", async () => {
  for (const q of ["price and reviews", "timings and reviews?", "price and rating", "parking and reviews", "What's the price and rating?", "Does it have parking? Reviews?"]) {
    assert.equal(isReviewsAsk(q), true, q);
    assert.equal(asksMore(q), true, q);
    let called = 0;
    const r = await pickAnswer(q, play(), async () => (called++, { answer: "PLaY Arena is rated 4.5 on Google from 40,312 reviews and TapTurf lists it at ₹3000 an hour. No written reviews on TapTurf yet.", covered: true }));
    assert.equal(r.path, "model", q);
    assert.equal(called, 1, q);
    assert.ok(r.answer?.answer.includes("₹3000"), q);
    assert.equal(r.answer?.link?.href, MAPS, q);
  }
  // Without the model: the plain answer, and the route says the page has the prices (more).
  const det = await pickAnswer("price and reviews", play(), null);
  assert.equal(det.path, "plain");
  assert.equal(det.more, true);
  // A plain review question is unchanged.
  assert.equal(asksMore("What do players say about it?"), false);
  assert.ok(ANSWER_SYSTEM.includes("unless the question also asks for them"));
});

test("F8: shoes, studs, players and booking ahead that are recommended, or a FIFA rating, are not reviews", () => {
  for (const q of ["How many players are recommended?", "Is advance booking recommended?", "What shoes are recommended here?", "Is it rated for night matches?", "are studs recommended", "is it recommended to book in advance", "is the turf FIFA rated"])
    assert.equal(isReviewsAsk(q), false, q);
  for (const q of ["is it recommended", "Is this turf recommended?", "would you recommend it", "how is it rated", "is it rated 4 on google"]) assert.equal(isReviewsAsk(q), true, q);
  assert.equal(reviewsSubject("is it recommended"), "it");
  assert.equal(reviewsSubject("how is it rated"), "it");
});

test("F9: what people say about the price goes to the model, with the prices Google reviewers wrote apart", async () => {
  for (const q of ["what do people say about the price", "what do people say about the rates", "what do people say about the timings"]) {
    assert.equal(asksMore(q), true, q);
    const r = await pickAnswer(q, play(), async () => ({ answer: "TapTurf lists ₹3000 an hour.", covered: true }));
    assert.equal(r.path, "model", q);
  }
  const f = buildFacts(
    turf({
      price_mentions: [
        { text: "They charge 1000-1200 per hour for the full turf. (Google review, 2 years ago)", source_url: "https://www.google.com/maps/place/Sportz+Pride" },
        { text: "live booking grid (hourly): cheapest turf court hourly morning ₹1800", source_url: null },
      ],
    }),
  );
  assert.deepEqual(f.google_reviewers_reported_prices, ["₹1,200"]);
  assert.deepEqual(f.reported_prices_unverified, ["₹1,800"]);
  assert.ok(ANSWER_SYSTEM.includes("google_reviewers_reported_prices are figures Google reviewers wrote"));
  assert.ok(ANSWER_SYSTEM.includes("reported_prices_unverified come from other listings, never call them anyone's words"));
});

test("F10: Hinglish and short ways of asking how it is", () => {
  for (const q of ["turf kaise hai", "kaise hai", "kaisa hai ye turf", "acha hai kya", "how good is this turf", "any good?", "good turf?", "reviews kaise hai", "ye turf kaisa hai", "is it a good turf"]) {
    assert.equal(reviewsSubject(q), "it", q);
    assert.equal(isReviewsAsk(q), true, q);
  }
  // "acha hai" alone is "OK, good", not a question; a facility stays a facility.
  for (const q of ["acha hai", "parking kaise hai", "how good is the pitch"]) assert.notEqual(reviewsSubject(q), "it", q);
});

test("F11: the model failing on a review question gives the plain answer; other questions fail as before", async () => {
  const sheet = { turf: { rating: 4.1, external_review_url: "https://maps.google.com/?cid=12292351290359652478" }, facts: buildFacts(reboot) };
  const overloaded = async (): Promise<null> => {
    throw Object.assign(new Error("529 overloaded_error"), { status: 529 });
  };
  let logged = 0;
  const r = await pickAnswer("What do players say about it?", sheet, overloaded, () => logged++);
  assert.equal(r.path, "plain-fallback");
  assert.equal(logged, 1);
  assert.ok(r.answer?.answer.startsWith("Reboot Sports Arena is rated 4.1 on Google from 1,442 reviews. Google reviewers like"), r.answer?.answer);
  assert.equal(r.answer?.link?.label, "Read Google reviews");
  // Null from the model: the same.
  assert.equal((await pickAnswer("What do players say about it?", sheet, async () => null)).path, "plain-fallback");
  // Another question: the error goes to the route's handler, as before.
  await assert.rejects(pickAnswer("does it have parking", sheet, overloaded), /529/);
  assert.equal((await pickAnswer("does it have parking", sheet, async () => null)).answer, null);
});
