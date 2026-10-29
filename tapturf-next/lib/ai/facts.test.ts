import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFacts, hasReviewText, type FactsReviews } from "./facts";
import { googleReviewsLink, isReviewsAsk, reviewsAnswer, reviewsSubject } from "./reviewsAnswer";
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
    ],
    stats: { count: 2, average: 4.5 },
  });
  const tt = f.tapturf_reports as { players: number; average_stars: string; recent: { stars: number; text: string }[] };
  assert.deepEqual(tt.recent, [{ stars: 5, text: "Lights and pitch are good, staff helpful" }]);
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
    "3 players on TapTurf rate The Turf Ground 5.0. What TapTurf players like: good turf size, well maintained equipment and good grass condition. It is rated 4.6 on Google from 437 reviews.",
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
    "Reboot Sports Arena is rated 4.1 on Google from 1,442 reviews. What Google reviewers like: well maintained badminton courts, good lighting and friendly staff. Common complaints: two courts have hard rubber surface and hard to find court at peak hours.",
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
