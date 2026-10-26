// Run with: npm run test:city (compiles to .test-out and runs node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPORT_PAGES, citySportHref, citySportLinks, turfPlaysSport } from "./sports";

test("a city/sport link needs a venue, a real sport page and a city slug", () => {
  assert.equal(citySportHref("pune", "badminton", 4), "/pune/badminton");
  assert.equal(citySportHref("akola", "badminton", 0), null);
  assert.equal(citySportHref("pune", "football", Number.NaN), null);
  assert.equal(citySportHref("pune", "squash", 5), null);
  assert.equal(citySportHref("pune", "cricket nets", 5), null);
  assert.equal(citySportHref("Pune", "football", 5), null);
  assert.equal(citySportHref("", "football", 5), null);
});

// From 15 to 18 Oct every badminton page linked /akola/badminton, a 404.
const CITIES: Record<string, { sports: string[] }[]> = {
  // Akola's turfs list box cricket and football only.
  akola: [{ sports: ["Box Cricket", "Football"] }, { sports: ["box cricket"] }, { sports: ["Squash"] }, { sports: [] }],
  ahilyanagar: [{ sports: ["Box Cricket", "Basketball"] }, { sports: ["Football"] }],
  pune: [
    { sports: ["Football", "Futsal"] },
    { sports: ["Badminton", "Pickleball"] },
    { sports: ["Cricket Nets", "Bowling Machine"] },
    { sports: ["Swimming"] },
  ],
  nowhere: [],
};

test("a city's sport links: only sports it has, in link order, with counts", () => {
  assert.deepEqual(
    citySportLinks("akola", CITIES.akola).map((l) => [l.href, l.count]),
    [
      ["/akola/football", 1],
      ["/akola/box-cricket", 2],
    ],
  );
  assert.deepEqual(citySportLinks("nowhere", CITIES.nowhere), []);
});

test("every city/sport link opens a page with a venue, and every such page is linked", () => {
  for (const [city, turfs] of Object.entries(CITIES)) {
    const links = citySportLinks(city, turfs);
    for (const l of links) {
      const [, c, slug] = l.href.split("/");
      const page = SPORT_PAGES.find((s) => s.slug === slug);
      assert.ok(page, l.href);
      assert.equal(c, city);
      assert.equal(turfs.filter((t) => turfPlaysSport(t.sports, page)).length, l.count, l.href);
      assert.ok(l.count >= 1, l.href);
    }
    const withVenues = SPORT_PAGES.filter((sp) => turfs.some((t) => turfPlaysSport(t.sports, sp))).map((sp) => sp.slug);
    assert.deepEqual(
      links.map((l) => l.slug),
      withVenues,
      city,
    );
  }
});
