import { test } from "node:test";
import assert from "node:assert/strict";
import { generateBreadcrumbJsonLd, generateTurfJsonLd } from "./seo";
import { AGGREGATE_RATING_MIN_REPORTS } from "../seo/defaults";
import { jsonLdHtml } from "../seo/jsonLd";
import type { Turf } from "../../types/turf";
import type { ReviewWithUser } from "../../types/review";

const turf = (over: Partial<Turf> = {}): Turf =>
  ({
    id: "e852b2cf-ae73-4f53-8412-2f8e60271a71",
    slug: "prime-turf-marol",
    name: "Prime Turf",
    address: "Marol, Andheri East, Mumbai",
    description: null,
    sports: ["Box Cricket", "Football"],
    images: [],
    cover_image: null,
    rating: 4.6,
    total_reviews: 263,
    owner_phone: "9876543210",
    contact_info: null,
    landline_phone: null,
    whatsapp_phone: null,
    morning_price: null,
    afternoon_price: null,
    evening_price: null,
    weekend_morning_price: null,
    weekend_afternoon_price: null,
    weekend_evening_price: null,
    price_mentions: null,
    pricing_bands: null,
    price_unit: null,
    opening_hours: { monday: "Open 24 hours" },
    start_time: null,
    end_time: null,
    is_24x7: true,
    area: "Marol",
    city: "mumbai",
    lat: 19.11,
    lng: 72.88,
    external_review_url: null,
    website_url: null,
    instagram_url: null,
    ...over,
  }) as unknown as Turf;

const review = (i: number, over: Partial<ReviewWithUser> = {}): ReviewWithUser =>
  ({
    id: `r${i}`,
    user_id: `u${i}`,
    turf_id: "t",
    booking_id: null,
    rating: 4,
    comment: `Good lights, report ${i}`,
    created_at: "2026-10-20T10:00:00.000Z",
    updated_at: null,
    source: null,
    user_name: i === 1 ? null : `Player ${i}`,
    user_avatar: null,
    upvotes: 0,
    viewer_has_upvoted: false,
    ...over,
  }) as ReviewWithUser;

test("no aggregateRating from Google's rating, whatever it says", () => {
  const ld = generateTurfJsonLd(turf());
  assert.equal("aggregateRating" in ld, false);
  assert.equal("review" in ld, false);
  // Below the threshold of TapTurf reports: still none.
  const few = generateTurfJsonLd(turf(), { reviewStats: { count: AGGREGATE_RATING_MIN_REPORTS - 1, average: 4.5, histogram: [0, 0, 0, 2, 2] }, reviews: [review(2)] });
  assert.equal("aggregateRating" in few, false);
  assert.equal("review" in few, false);
});

test("from 5 live TapTurf reports: their average and count, and up to 5 of their texts, never Google's", () => {
  const reviews = [
    review(1),
    review(2, { comment: "  " }),
    review(3, { source: "google", author_name: "Google person", comment: "From Google" }),
    review(4),
    review(5),
    review(6),
    review(7),
    review(8),
  ];
  const ld = generateTurfJsonLd(turf(), { reviewStats: { count: 6, average: 4.3, histogram: [0, 0, 1, 2, 3] }, reviews }) as Record<string, unknown>;
  assert.deepEqual(ld.aggregateRating, { "@type": "AggregateRating", ratingValue: 4.3, ratingCount: 6, bestRating: 5, worstRating: 1 });
  const rv = ld.review as { author: { name: string }; reviewBody: string; datePublished: string; reviewRating: { ratingValue: number } }[];
  assert.equal(rv.length, 5);
  assert.deepEqual(rv.map((r) => r.author.name), ["TapTurf player", "Player 4", "Player 5", "Player 6", "Player 7"]);
  assert.ok(rv.every((r) => !r.reviewBody.includes("Google")));
  assert.equal(rv[0].datePublished, "2026-10-20");
  assert.equal(rv[0].reviewRating.ratingValue, 4);
});

test("name is the clean name, the listed one stays as alternateName", () => {
  const plain = generateTurfJsonLd(turf()) as Record<string, unknown>;
  assert.equal(plain.name, "Prime Turf");
  assert.equal("alternateName" in plain, false);
  const messy = generateTurfJsonLd(turf({ name: "Bellator Sports Arena 🏟️ Cricket box ! pickleball", city: "gurgaon", area: "Sector 49" })) as Record<string, unknown>;
  assert.equal(messy.name, "Bellator Sports Arena");
  assert.equal(messy.alternateName, "Bellator Sports Arena 🏟️ Cricket box ! pickleball");
});

test("fallback description names the venue type and place, and books nothing", () => {
  const ld = generateTurfJsonLd(turf({ whatsapp_phone: "9876543211" })) as Record<string, unknown>;
  assert.equal(ld.description, "Box cricket & football turf in Marol, Mumbai. Call or WhatsApp the turf.");
  assert.ok(!/\bbook/i.test(String(ld.description)));
  const none = generateTurfJsonLd(turf({ owner_phone: null })) as Record<string, unknown>;
  assert.equal(none.description, "Box cricket & football turf in Marol, Mumbai.");
  const messy = generateTurfJsonLd(turf({ sports: ["Box Cricket"], area: "Karanje / Gendamal Naka", city: "satara", address: "Satara" })) as Record<string, unknown>;
  assert.equal(messy.description, "Box cricket turf in Karanje, Satara. Call or WhatsApp the turf.");
});

test("opening hours read lower-case day keys", () => {
  const ld = generateTurfJsonLd(
    turf({ is_24x7: null, opening_hours: Object.fromEntries(["monday", "tuesday"].map((d) => [d, "6 AM–11 PM"])) as Turf["opening_hours"] }),
  ) as Record<string, unknown>;
  assert.deepEqual(ld.openingHoursSpecification, [
    { "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "06:00", closes: "23:00" },
    { "@type": "OpeningHoursSpecification", dayOfWeek: "Tuesday", opens: "06:00", closes: "23:00" },
  ]);
});

test("breadcrumb: Home › City › name", () => {
  const bc = generateBreadcrumbJsonLd(turf());
  assert.deepEqual(
    bc.itemListElement.map((i) => [i.name, i.item]),
    [
      ["Home", "https://www.tapturf.in"],
      ["Mumbai", "https://www.tapturf.in/mumbai"],
      ["Prime Turf", "https://www.tapturf.in/turf/prime-turf-marol"],
    ],
  );
  const noCity = generateBreadcrumbJsonLd(turf({ city: null }));
  assert.equal(noCity.itemListElement[1].item, "https://www.tapturf.in/turfs");
});

test("a player's '</script>' in a review or name cannot close the ld+json tag", () => {
  const evil = "Great turf</script><script>alert(document.cookie)</script> & <!--";
  const reviews = [1, 2, 3, 4, 5].map((i) => review(i, { comment: evil, user_name: `P${i}</script><img src=x onerror=alert(1)>` }));
  const ld = generateTurfJsonLd(turf({ description: "Floodlit </script> turf" }), { reviewStats: { count: 5, average: 4, histogram: [0, 0, 0, 5, 0] }, reviews });
  const html = jsonLdHtml(ld);
  // No raw "<", ">" or "&" at all, so no tag can open or close inside the script.
  assert.equal(/[<>&]/.test(html), false);
  // The JSON Google reads is the same value.
  assert.deepEqual(JSON.parse(html), JSON.parse(JSON.stringify(ld)));
  const rv = (JSON.parse(html) as { review: { reviewBody: string; author: { name: string } }[] }).review;
  assert.equal(rv[0].reviewBody, evil);
  assert.equal(rv[1].author.name, "P2</script><img src=x onerror=alert(1)>");
  assert.equal(JSON.parse(jsonLdHtml({ s: "a\u2028b" })).s, "a\u2028b");
  assert.equal(jsonLdHtml({ s: "a\u2028b" }).includes("\u2028"), false);
  assert.equal(jsonLdHtml(undefined), "null");
});
