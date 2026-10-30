import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COURT_NEAR_ME_SPORTS,
  courtCities,
  courtCityLine,
  courtFaq,
  courtHeroLine,
  courtNearMeLink,
  courtNearMePath,
  courtNearMeSport,
  courtPriceFacts,
  nearestAny,
  nearSportParam,
  slugNamesSport,
  sportGuides,
  venuesByCity,
} from "./courtNearMe";
import { bannedCopy } from "../seo/defaults";
import { SPORT_PAGES, sportBySlug, turfPlaysSport } from "../sports";
import type { Turf } from "../../types/turf";

const sport = (slug: string) => sportBySlug(slug)!;

test("three pages only: badminton, pickleball and tennis courts near me", () => {
  assert.deepEqual([...COURT_NEAR_ME_SPORTS], ["badminton", "pickleball", "tennis"]);
  assert.deepEqual(COURT_NEAR_ME_SPORTS.map(courtNearMePath), ["/badminton-courts-near-me", "/pickleball-courts-near-me", "/tennis-courts-near-me"]);
  for (const s of SPORT_PAGES) {
    const page = courtNearMeSport(s.slug);
    assert.equal(page?.slug ?? null, (COURT_NEAR_ME_SPORTS as readonly string[]).includes(s.slug) ? s.slug : null, s.slug);
    // Every one of them is a court sport.
    if (page) assert.equal(page.venue, "court");
  }
  assert.equal(courtNearMeSport("table-tennis"), null);
  assert.equal(courtNearMeSport("turf"), null);
});

test("tennis is Tennis and Lawn Tennis, never Table Tennis", () => {
  const tennis = sport("tennis");
  assert.ok(turfPlaysSport(["Lawn Tennis"], tennis));
  assert.ok(turfPlaysSport(["Football", "tennis "], tennis));
  assert.ok(!turfPlaysSport(["Table Tennis"], tennis));
  assert.ok(!turfPlaysSport(["Padel"], tennis));
});

test("the route's ?sport=: absent is every venue as before, a court sport filters, anything else is refused", () => {
  assert.equal(nearSportParam(null), undefined);
  assert.equal(nearSportParam(""), undefined);
  assert.equal(nearSportParam("badminton")?.slug, "badminton");
  assert.equal(nearSportParam("tennis")?.slug, "tennis");
  for (const bad of ["football", "box-cricket", "table-tennis", "Badminton", "badminton ", "x"]) assert.equal(nearSportParam(bad), null, bad);
});

test("the link from the sport's pages: only for the three sports, only while the sport has venues", () => {
  assert.deepEqual(courtNearMeLink("badminton", 252), { href: "/badminton-courts-near-me", text: "Badminton courts near me, sorted by distance" });
  assert.deepEqual(courtNearMeLink("pickleball", 1), { href: "/pickleball-courts-near-me", text: "Pickleball courts near me, sorted by distance" });
  assert.deepEqual(courtNearMeLink("tennis", 29), { href: "/tennis-courts-near-me", text: "Tennis courts near me, sorted by distance" });
  assert.equal(courtNearMeLink("tennis", 0), null);
  for (const other of ["football", "box-cricket", "cricket", "volleyball", "basketball", "table-tennis", "padel"]) assert.equal(courtNearMeLink(other, 50), null, other);
});

test("cities: venues of the sport per city, most first, ties by city size, each linked to its city page", () => {
  const t = (city: string | null) => ({ city });
  const rows = [t("pune"), t("bangalore"), t("hyderabad"), t("bangalore"), t("hyderabad"), t("gurgaon"), t("chennai"), t("new-town"), t(null), t("Bad City")];
  const cities = courtCities(rows, sport("tennis"));
  assert.deepEqual(
    cities.map((c) => [c.id, c.label, c.count, c.href]),
    [
      ["hyderabad", "Hyderabad", 2, "/hyderabad/tennis"],
      ["bangalore", "Bangalore", 2, "/bangalore/tennis"],
      ["pune", "Pune", 1, "/pune/tennis"],
      ["chennai", "Chennai", 1, "/chennai/tennis"],
      ["gurgaon", "Gurgaon", 1, "/gurgaon/tennis"],
      // Not curated: still counted, title-cased, last among equals.
      ["new-town", "New Town", 1, "/new-town/tennis"],
    ],
  );
  const { groups, rest } = venuesByCity(rows, cities);
  assert.deepEqual(groups.map((g) => [g.city.id, g.turfs.length]), [["hyderabad", 2], ["bangalore", 2], ["pune", 1], ["chennai", 1], ["gurgaon", 1], ["new-town", 1]]);
  assert.deepEqual(rest, [t(null), t("Bad City")]);
});

test("hero line: counts and cities from the venues, photos, ratings and timings only when some venue has them", () => {
  const badminton = sport("badminton");
  const labels = ["Bangalore", "Pune", "Hyderabad", "Chennai", "Delhi", ...Array.from({ length: 41 }, (_, i) => `C${i}`)];
  assert.equal(
    courtHeroLine({ sport: badminton, count: 252, cityLabels: labels, withPhotos: 200, rated: 180, withHours: 90 }),
    "252 badminton courts across Bangalore, Pune, Hyderabad, Chennai, Delhi and 41 more cities. Share your location and see the closest ones first, with photos, ratings and timings.",
  );
  assert.equal(
    courtHeroLine({ sport: badminton, count: 3, cityLabels: ["Pune", "Nashik"], withPhotos: 2, rated: 0, withHours: 1 }),
    "3 badminton courts across Pune and Nashik. Share your location and see the closest ones first, with photos and timings.",
  );
  assert.equal(
    courtHeroLine({ sport: sport("tennis"), count: 1, cityLabels: ["Pune"], withPhotos: 0, rated: 0, withHours: 0 }),
    "1 tennis court across Pune. Share your location and see the closest ones first.",
  );
  assert.equal(courtCityLine([]), "India");
  assert.equal(courtCityLine(["A", "B", "C", "D", "E", "F"]), "A, B, C, D, E and 1 more city");
});

const venue = (over: Partial<Turf>): Turf =>
  ({
    id: "t",
    name: "Venue",
    sports: ["Badminton"],
    images: [],
    rating: 0,
    total_reviews: 0,
    morning_price: null,
    afternoon_price: null,
    evening_price: null,
    weekend_morning_price: null,
    weekend_afternoon_price: null,
    weekend_evening_price: null,
    price_mentions: null,
    ...over,
  }) as unknown as Turf;

test("price facts: a court-only venue's price is the sport's; a multi-sport venue's turf rate never is", () => {
  const badminton = sport("badminton");
  const rows = [
    // Badminton only: whatever it lists is badminton's.
    venue({ id: "a", sports: ["Badminton"], evening_price: 500 }),
    // Turf sports too, no band for badminton: listed with other sports.
    venue({ id: "b", sports: ["Football", "Badminton"], evening_price: 1200 }),
    // Bands that name only football: still not badminton's.
    venue({ id: "c", sports: ["Badminton", "Football"], evening_price: 1500, sport_bands: { football: [1500, 1500] } }),
    // Nothing listed at all.
    venue({ id: "d", sports: ["Badminton", "Pickleball"] }),
  ];
  assert.deepEqual(courtPriceFacts(rows, badminton), { shown: 1, otherSports: 2 });
});

test("FAQ: answers from the data, no 'all N' promise, no booking claim", () => {
  const badminton = sport("badminton");
  const cities = courtCities([{ city: "bangalore" }, { city: "bangalore" }, { city: "pune" }], badminton);
  const faq = courtFaq({ sport: badminton, count: 3, cities, prices: { shown: 1, otherSports: 2 } });
  assert.deepEqual(faq.map((f) => f.q), [
    "How do I find a badminton court near me?",
    "Where can I play badminton?",
    "How much does a badminton court cost?",
    "Is there a booking fee?",
  ]);
  assert.equal(faq[0].a, 'Tap "Use my location" on this page. TapTurf sorts badminton courts by distance from you, closest first. You can also browse them by city on this page.');
  assert.equal(faq[1].a, "TapTurf lists 3 badminton courts in 2 cities, the most in Bangalore (2) and Pune (1).");
  assert.equal(
    faq[2].a,
    "1 of the 3 badminton courts on TapTurf lists a badminton rate, shown on its card and page. 2 more list prices only with other sports, so ask for the badminton rate. Rates depend on the venue, the time slot and the day; confirm yours when you call or WhatsApp.",
  );
  const unpriced = courtFaq({ sport: sport("tennis"), count: 1, cities: [], prices: { shown: 0, otherSports: 0 } });
  assert.deepEqual(unpriced.map((f) => f.q), ["How do I find a tennis court near me?", "How much does a tennis court cost?", "Is there a booking fee?"]);
  assert.equal(unpriced[1].a, "No tennis court on TapTurf lists a tennis rate yet. Rates depend on the venue, the time slot and the day; confirm yours when you call or WhatsApp.");
  // Production on 29 Oct: the venues that list a court sport all list turf sports too.
  const turfRates = courtFaq({ sport: sport("tennis"), count: 14, cities: [], prices: { shown: 0, otherSports: 11 } });
  assert.equal(
    turfRates[1].a,
    "No tennis court on TapTurf lists a tennis rate yet. 11 of the 14 list prices only with other sports, so ask for the tennis rate. Rates depend on the venue, the time slot and the day; confirm yours when you call or WhatsApp.",
  );
  for (const f of [...faq, ...unpriced, ...turfRates]) {
    assert.ok(!/\ball \d/i.test(f.a), f.a);
    assert.equal(bannedCopy(f.a.replace("booking fee", "")), null, f.a);
  }
});

test("guides: the sport named as a whole word, so a table tennis post is never a tennis guide", () => {
  assert.ok(slugNamesSport("pickleball-pune-beginners-guide", sport("pickleball")));
  assert.ok(slugNamesSport("tennis-courts-in-pune", sport("tennis")));
  assert.ok(slugNamesSport("table-tennis-vs-tennis", sport("tennis")));
  assert.ok(!slugNamesSport("table-tennis-tips", sport("tennis")));
  assert.ok(!slugNamesSport("best-tabletennis-bats", sport("tennis")));
  assert.ok(!slugNamesSport("superbadminton-league", sport("badminton")));
  assert.ok(!slugNamesSport("turf-near-me", sport("badminton")));
  const posts = [{ slug: "table-tennis-tips" }, { slug: "pickleball-pune-beginners-guide" }, { slug: "tennis-elbow" }, { slug: "badminton-shoes" }];
  assert.deepEqual(sportGuides(posts, sport("tennis")).map((p) => p.slug), ["tennis-elbow"]);
  assert.deepEqual(sportGuides(posts, sport("pickleball")).map((p) => p.slug), ["pickleball-pune-beginners-guide"]);
  assert.deepEqual(sportGuides(posts, sport("badminton"), 0), []);
});

test("nearestAny: the nearest venue of any sport, the one /turf-near-me saves a city from", () => {
  assert.deepEqual(nearestAny([{ turf: { city: "pune" }, km: 1.2 }, { turf: { city: "nashik" }, km: 150 }]), { city: "pune", distanceKm: 1.2 });
  assert.deepEqual(nearestAny([{ turf: { city: null }, km: 3 }]), { city: null, distanceKm: 3 });
  assert.equal(nearestAny([]), null);
});
