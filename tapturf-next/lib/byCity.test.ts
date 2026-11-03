import { test } from "node:test";
import assert from "node:assert/strict";
import { cityPageLinks, sportCityLinks } from "./byCity";

const MIN = 3;
const c = (id: string, count: number) => ({ id, label: id[0].toUpperCase() + id.slice(1), count });

test("sport page by city: the city+sport page from 3 venues, else the city page from 3 turfs, else counted at the end", () => {
  const totals = new Map([["hyderabad", 520], ["pune", 400], ["akola", 7], ["latur", 2], ["nanded", 1]]);
  const got = sportCityLinks([c("pune", 300), c("hyderabad", 429), c("akola", 2), c("latur", 2), c("nanded", 1), c("solapur", 3)], "box-cricket", totals, MIN);
  assert.deepEqual(
    got.links.map((l) => [l.id, l.count, l.href]),
    [
      ["hyderabad", 429, "/hyderabad/box-cricket"],
      ["pune", 300, "/pune/box-cricket"],
      // 3 venues: its city+sport page is indexable, whatever the city total says.
      ["solapur", 3, "/solapur/box-cricket"],
      // 2 box cricket turfs, 7 turfs in all: the city page.
      ["akola", 2, "/akola"],
    ],
  );
  // Latur (2 turfs in all) and Nanded (1): no page worth indexing, summed.
  assert.deepEqual(got.rest, { cities: 2, venues: 3 });
});

test("sport page by city: biggest first, ties in the order given; a reserved slug or an empty city is never linked", () => {
  const totals = new Map([["delhi", 50], ["noida", 40], ["blog", 9]]);
  const got = sportCityLinks([c("noida", 12), c("delhi", 12), c("blog", 9), c("goa", 0)], "football", totals, MIN);
  assert.deepEqual(got.links.map((l) => l.href), ["/noida/football", "/delhi/football"]);
  assert.deepEqual(got.rest, { cities: 1, venues: 9 });
});

test("turf near me by city: the city page from 3 turfs, else counted at the end", () => {
  const got = cityPageLinks([c("nashik", 110), c("hyderabad", 520), c("latur", 2), c("nanded", 1), c("akola", 3)], MIN);
  assert.deepEqual(got.links.map((l) => [l.id, l.href]), [["hyderabad", "/hyderabad"], ["nashik", "/nashik"], ["akola", "/akola"]]);
  assert.deepEqual(got.rest, { cities: 2, venues: 3 });
  assert.deepEqual(cityPageLinks([], MIN), { links: [], rest: { cities: 0, venues: 0 } });
});
