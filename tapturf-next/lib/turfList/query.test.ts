import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turf } from "../../types/turf";
import { compareTopRated } from "../utils/ranking";
import { getMinimumPrice } from "../utils/prices";
import { haversineKm } from "../utils/location";
import {
  FIRST_PAGE,
  MAX_LIMIT,
  MAX_Q,
  NEAR_KM,
  ROUND_SLACK_KM,
  SORTS,
  availableSports,
  exactNearest,
  filtersFromSearch,
  isDefaultFilters,
  listSearch,
  nextBatch,
  pageOf,
  parseListParams,
  picksTag,
  rankTurfs,
  roundCoords,
  searchForFilters,
  sportFromSlug,
  sportSlug,
  type ListQuery,
  type SortOption,
} from "./query";

// A small seeded random, so failures repeat.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function mk(p: Partial<Turf> & { id: string }): Turf {
  return {
    name: `Turf ${p.id}`,
    address: `Somewhere, Pune`,
    sports: ["Football"],
    rating: 4,
    total_reviews: 20,
    lat: 18.5,
    lng: 73.8,
    city: "pune",
    ...p,
  } as Turf;
}

const SPORT_SETS = [["Football", "Box Cricket"], ["Box Cricket"], ["Cricket", "Cricket Nets"], ["Badminton"], ["Pickleball", "Football"], ["Tennis"], []];

function randomTurfs(n: number, seed = 1): Turf[] {
  const r = rng(seed);
  const out: Turf[] = [];
  for (let i = 0; i < n; i++) {
    const price = r() < 0.4 ? null : Math.round(4 + r() * 16) * 100;
    const geo = r() > 0.08;
    out.push(
      mk({
        id: `t${String(i).padStart(4, "0")}`,
        name: `${["Kick Off", "Turf Republic", "Goal Zone", "Smash", "Box Arena"][i % 5]} ${i}`,
        address: `${["Baner", "Kothrud", "Hinjewadi", "Wakad"][i % 4]}, Pune`,
        sports: SPORT_SETS[Math.floor(r() * SPORT_SETS.length)],
        // Plenty of ties, so stability matters.
        rating: r() < 0.1 ? 0 : Math.round((3.5 + r() * 1.5) * 10) / 10,
        total_reviews: Math.floor(r() * 30) * (r() < 0.5 ? 1 : 10),
        lat: geo ? 18.45 + r() * 0.15 : null,
        lng: geo ? 73.75 + r() * 0.15 : null,
        morning_price: price,
        evening_price: price == null ? null : price + 200,
      }),
    );
  }
  // The order the pages get them in: top rated.
  return out.sort(compareTopRated);
}

/** The browser's filter and sort until 28 Oct (components/search/TurfListingClient.tsx), for comparison. */
function oldClient(turfs: Turf[], search: string, selectedSport: string | null, sortBy: SortOption, userLocation: { lat: number; lng: number } | null, trendingIds: Set<string>) {
  let result = turfs.map((t) => {
    let distanceKm: number | null = null;
    if (userLocation && Number.isFinite(t.lat) && Number.isFinite(t.lng)) {
      const d = haversineKm(userLocation, { lat: t.lat as number, lng: t.lng as number });
      distanceKm = Number.isFinite(d) ? d : null;
    }
    return { turf: t, distanceKm };
  });
  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter(({ turf: t }) => t.name.toLowerCase().includes(q) || t.address.toLowerCase().includes(q) || t.sports.some((s) => s.toLowerCase().includes(q)));
  }
  if (selectedSport) {
    const sportLower = selectedSport.toLowerCase();
    result = result.filter(({ turf: t }) => t.sports.some((s) => s.toLowerCase().includes(sportLower)));
  }
  return [...result].sort((a, b) => {
    switch (sortBy) {
      case "nearby":
        if (a.distanceKm == null && b.distanceKm == null) return compareTopRated(a.turf, b.turf);
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      case "price-low":
      case "price-high": {
        // Since 29 Oct, with a chip that is not a turf sport (Badminton,
        // Pickleball, Tennis...), a venue's price counts only when every sport
        // it lists is the chip's (the card shows no other: cardPrice). The turf
        // chips keep every price the venue's bands do not contradict, and these
        // rows carry no bands.
        const turfChip = !!selectedSport && ["football", "box cricket", "cricket"].includes(selectedSport.toLowerCase());
        const chipPrice = (t: Turf) =>
          selectedSport && !turfChip && !t.sports.every((s) => s.toLowerCase().includes(selectedSport.toLowerCase())) ? null : getMinimumPrice(t);
        const ap = chipPrice(a.turf);
        const bp = chipPrice(b.turf);
        if (ap == null && bp == null) return 0;
        if (ap == null) return 1;
        if (bp == null) return -1;
        return sortBy === "price-low" ? ap - bp : bp - ap;
      }
      case "reviews":
        return b.turf.total_reviews - a.turf.total_reviews;
      default: {
        const ta = trendingIds.has(a.turf.id);
        const tb = trendingIds.has(b.turf.id);
        if (ta !== tb) return ta ? -1 : 1;
        return compareTopRated(a.turf, b.turf);
      }
    }
  });
}

const ids = (xs: { turf: Turf }[]) => xs.map((x) => x.turf.id);

test("rankTurfs gives the old browser order for every sort, search and chip", () => {
  const turfs = randomTurfs(400, 7);
  const trending = new Set([turfs[50].id, turfs[300].id]);
  const at = roundCoords({ lat: 18.5204, lng: 73.8567 });
  for (const sort of SORTS) {
    for (const q of ["", "kick", "BANER", "cricket", "zzz"]) {
      for (const sport of [null, "Football", "Cricket", "Box Cricket", "Tennis"]) {
        const loc = sort === "nearby" || q === "kick" ? at : null;
        if (sort === "nearby" && !loc) continue;
        const got = rankTurfs(turfs, { q, sport, sort, at: loc }, trending).ranked;
        const want = oldClient(turfs, q, sport, sort, loc, trending);
        assert.deepEqual(ids(got), ids(want), `${sort} q=${q} sport=${sport}`);
        assert.deepEqual(got.map((g) => g.km), want.map((w) => w.distanceKm));
      }
    }
  }
});

test("search: name, address or sport, any case, trimmed; a chip matches any sport containing it", () => {
  const turfs = [
    mk({ id: "a", name: "Kick Off Arena", address: "Baner, Pune", sports: ["Football"] }),
    mk({ id: "b", name: "Turf Republic", address: "Kothrud, Pune", sports: ["Box Cricket"] }),
    mk({ id: "c", name: "Nets Hub", address: "Wakad, Pune", sports: ["Cricket Nets"] }),
    mk({ id: "d", name: "Shuttle", address: "Aundh, Pune", sports: ["Badminton"] }),
  ];
  const none = new Set<string>();
  const run = (q: string, sport: string | null = null) => ids(rankTurfs(turfs, { q, sport, sort: "rating", at: null }, none).ranked).sort();
  assert.deepEqual(run("kick"), ["a"]);
  assert.deepEqual(run("  KOTHRUD "), ["b"]);
  assert.deepEqual(run("cricket"), ["b", "c"]);
  assert.deepEqual(run("", "Cricket"), ["b", "c"]);
  assert.deepEqual(run("", "Box Cricket"), ["b"]);
  assert.deepEqual(run("pune", "Badminton"), ["d"]);
  assert.deepEqual(run("x".repeat(500)), []);
});

test("default sort: trending picks first, then top rated (15+ reviews first)", () => {
  const turfs = [
    mk({ id: "few", rating: 5, total_reviews: 3 }),
    mk({ id: "good", rating: 4.7, total_reviews: 400 }),
    mk({ id: "ok", rating: 4.2, total_reviews: 80 }),
    mk({ id: "pick", rating: 3.9, total_reviews: 16 }),
  ].sort(compareTopRated);
  const got = ids(rankTurfs(turfs, { q: "", sport: null, sort: "rating", at: null }, new Set(["pick"])).ranked);
  assert.deepEqual(got, ["pick", "good", "ok", "few"]);
});

test("price sorts put turfs without a price last both ways; nearby puts turfs without coordinates last", () => {
  const turfs = [
    mk({ id: "none", morning_price: null }),
    mk({ id: "cheap", morning_price: 600 }),
    mk({ id: "dear", morning_price: 1800 }),
    mk({ id: "far", lat: 18.9, lng: 73.8 }),
    mk({ id: "nogeo", lat: null, lng: null }),
  ];
  const none = new Set<string>();
  const low = ids(rankTurfs(turfs, { q: "", sport: null, sort: "price-low", at: null }, none).ranked);
  const high = ids(rankTurfs(turfs, { q: "", sport: null, sort: "price-high", at: null }, none).ranked);
  assert.deepEqual(low.slice(0, 2), ["cheap", "dear"]);
  assert.deepEqual(high.slice(0, 2), ["dear", "cheap"]);
  assert.ok(low.indexOf("none") > 1 && high.indexOf("none") > 1);
  const near = rankTurfs(turfs, { q: "", sport: null, sort: "nearby", at: { lat: 18.5, lng: 73.8 } }, none);
  assert.equal(near.ranked.at(-1)!.turf.id, "nogeo");
  assert.equal(near.ranked.at(-2)!.turf.id, "far");
  assert.equal(near.near, 3); // none, cheap, dear sit on the point; far is 44 km off
});

test("price sorts with a chip: another sport's price never orders the list (it is not on the card)", () => {
  const turfs = [
    mk({ id: "multi-cheap", sports: ["Box Cricket", "Football", "Badminton"], morning_price: 300 }),
    mk({ id: "court", sports: ["Badminton"], morning_price: 500 }),
    mk({ id: "court-dear", sports: ["Badminton"], morning_price: 900 }),
    mk({ id: "court-none", sports: ["Badminton"], morning_price: null }),
    mk({ id: "turf", sports: ["Football"], morning_price: 200 }),
  ];
  const none = new Set<string>();
  const low = ids(rankTurfs(turfs, { q: "", sport: "Badminton", sort: "price-low", at: null }, none).ranked);
  const high = ids(rankTurfs(turfs, { q: "", sport: "Badminton", sort: "price-high", at: null }, none).ranked);
  assert.deepEqual(low.slice(0, 2), ["court", "court-dear"]);
  assert.deepEqual(high.slice(0, 2), ["court-dear", "court"]);
  assert.deepEqual(new Set(low.slice(2)), new Set(["multi-cheap", "court-none"]));
  // Without a chip, every price orders the list, as before.
  const all = ids(rankTurfs(turfs, { q: "", sport: null, sort: "price-low", at: null }, none).ranked);
  assert.deepEqual(all.slice(0, 4), ["turf", "multi-cheap", "court", "court-dear"]);
});

test("price sorts with a turf chip: the price the card shows, from the venue's bands when they give the sport another range", () => {
  const turfs = [
    // Its bands give football ₹300 (the card's whole range): the card and its order are as before.
    mk({ id: "confirmed", sports: ["Box Cricket", "Football"], morning_price: 300, sport_bands: { football: [300, 300], "box-cricket": [300, 300] } }),
    // ₹200 is its box cricket rate; football is ₹900 in the bands: the football card reads ₹900 and orders there.
    mk({ id: "other-rate", sports: ["Box Cricket", "Football"], morning_price: 200, evening_price: 900, sport_bands: { football: [900, 900], "box-cricket": [200, 200] } }),
    // Lists Football and Badminton, but its only bands are box cricket: no football price, last.
    mk({ id: "other-sport", sports: ["Football", "Badminton"], morning_price: 100, sport_bands: { "box-cricket": [100, 100] } }),
    // No bands: as before.
    mk({ id: "no-bands", sports: ["Box Cricket", "Football"], morning_price: 500 }),
  ];
  const none = new Set<string>();
  const low = ids(rankTurfs(turfs, { q: "", sport: "Football", sort: "price-low", at: null }, none).ranked);
  assert.deepEqual(low, ["confirmed", "no-bands", "other-rate", "other-sport"]);
  const high = ids(rankTurfs(turfs, { q: "", sport: "Football", sort: "price-high", at: null }, none).ranked);
  assert.deepEqual(high, ["other-rate", "no-bands", "confirmed", "other-sport"]);
  // On the Box Cricket chip, other-rate's card reads its box cricket ₹200 and leads.
  // other-sport lists no box cricket, so it is not on the chip at all.
  const box = ids(rankTurfs(turfs, { q: "", sport: "Box Cricket", sort: "price-low", at: null }, none).ranked);
  assert.deepEqual(box, ["other-rate", "confirmed", "no-bands"]);
  // Without a chip, the slot columns order the list, bands or not, as before.
  const all = ids(rankTurfs(turfs, { q: "", sport: null, sort: "price-low", at: null }, none).ranked);
  assert.deepEqual(all, ["other-sport", "other-rate", "confirmed", "no-bands"]);
  // A venue that lists only Football keeps its own price, whatever its bands say (Eden Sports, Hyderabad).
  const solo = mk({ id: "solo", sports: ["Football"], morning_price: 100, sport_bands: { "box-cricket": [100, 100] } });
  assert.deepEqual(ids(rankTurfs([...turfs, solo], { q: "", sport: "Football", sort: "price-low", at: null }, none).ranked), ["solo", ...low]);
});

test("pages at the batch offsets add up to the whole ranking, with hot flags and totals", () => {
  const turfs = randomTurfs(500, 3);
  const trending = new Set([turfs[100].id]);
  for (const sort of ["rating", "reviews", "price-low", "price-high"] as const) {
    const query = { q: "", sport: "Football", sort, at: null };
    const all = ids(rankTurfs(turfs, query, trending).ranked);
    const got: string[] = [];
    let shown = 0;
    let limit = FIRST_PAGE;
    for (let guard = 0; guard < 50; guard++) {
      const page = pageOf(turfs, query, trending, shown, limit, 9);
      assert.equal(page.total, all.length);
      assert.equal(page.v, 9);
      assert.equal(page.offset, shown);
      for (const it of page.items) assert.equal(it.hot === true, trending.has(it.turf.id));
      got.push(...page.items.map((i) => i.turf.id));
      shown += page.items.length;
      if (shown >= page.total) break;
      limit = nextBatch(shown);
    }
    assert.deepEqual(got, all, sort);
  }
});

test("nextBatch: 10, 10, 20, 40, 80, then 80 at a time", () => {
  const shown = [10];
  while (shown.length < 8) shown.push(shown.at(-1)! + nextBatch(shown.at(-1)!));
  assert.deepEqual(shown, [10, 20, 40, 80, 160, 240, 320, 400]);
  assert.equal(nextBatch(0), FIRST_PAGE);
  assert.equal(nextBatch(13), 13);
  assert.ok(nextBatch(10_000) <= MAX_LIMIT);
});

test("availableSports: chips the turfs have, in chip order, by substring", () => {
  const turfs = [mk({ id: "a", sports: ["Box Cricket"] }), mk({ id: "b", sports: ["Cricket Nets", "football"] })];
  assert.deepEqual(availableSports(turfs), ["Football", "Box Cricket", "Cricket"]);
  assert.deepEqual(availableSports([]), []);
});

test("sport slugs round trip; unknown slugs are null", () => {
  assert.equal(sportSlug("Box Cricket"), "box-cricket");
  assert.equal(sportFromSlug("box-cricket"), "Box Cricket");
  assert.equal(sportFromSlug("FOOTBALL"), "Football");
  assert.equal(sportFromSlug("swimming"), null);
  assert.equal(sportFromSlug(""), null);
});

const parse = (s: string) => parseListParams(new URLSearchParams(s));

test("parseListParams: defaults", () => {
  const r = parse("");
  assert.ok(r.ok);
  assert.deepEqual(r.req, { query: { city: null, sport: null, q: "", sort: "rating", at: null }, offset: 0, limit: FIRST_PAGE });
});

test("parseListParams: a full query, the location rounded to about a kilometre", () => {
  const r = parse("city=pune&sport=box-cricket&q=%20baner%20&sort=nearby&lat=18.52041&lng=73.85674&offset=20&limit=20&v=12&t=1k3x9a");
  assert.ok(r.ok);
  assert.deepEqual(r.req, { query: { city: "pune", sport: "Box Cricket", q: "baner", sort: "nearby", at: { lat: 18.52, lng: 73.86 } }, offset: 20, limit: 20 });
  assert.deepEqual(r.seen, { v: 12, t: "1k3x9a" });
  const none = parse("offset=0&limit=10");
  assert.ok(none.ok);
  assert.deepEqual(none.seen, { v: null, t: null });
});

test("parseListParams: caps the limit and the search text", () => {
  const r = parse(`limit=500&q=${"a".repeat(300)}`);
  assert.ok(r.ok);
  assert.equal(r.req.limit, MAX_LIMIT);
  assert.equal(r.req.query.q.length, MAX_Q);
});

test("parseListParams: rejects bad values", () => {
  for (const s of [
    "city=Pune",
    "city=../x",
    "city=a",
    "sport=swimming",
    "sort=random",
    "sort=nearby",
    "lat=18.5",
    "lng=73.8",
    "lat=91&lng=73",
    "lat=18&lng=181",
    "lat=1e3&lng=2",
    "lat=abc&lng=73",
    "lat=NaN&lng=1",
    "offset=-1",
    "offset=1.5",
    "offset=99999",
    "offset=abc",
    "limit=0",
    "limit=-5",
    "limit=ten",
    `q=${"a".repeat(1001)}`,
    "v=abc",
    "v=-1",
    "v=1.5",
    "v=1234567890123456",
    "t=",
    "t=ABC",
    "t=a-b",
    `t=${"a".repeat(14)}`,
  ]) {
    assert.equal(parse(s).ok, false, s);
  }
});

test("listSearch: fixed order, defaults left out, and parseListParams reads it back", () => {
  const query: ListQuery = { city: "pune", sport: "Box Cricket", q: " kick ", sort: "price-low", at: { lat: 18.520412, lng: 73.856744 } };
  const s = listSearch({ query, offset: 10, limit: 10 }, 7, "zx81");
  assert.equal(s, "city=pune&sport=box-cricket&q=kick&sort=price-low&lat=18.52&lng=73.86&offset=10&limit=10&v=7&t=zx81");
  const back = parse(s);
  assert.ok(back.ok);
  assert.deepEqual(back.req, { query: { ...query, q: "kick", at: { lat: 18.52, lng: 73.86 } }, offset: 10, limit: 10 });
  assert.deepEqual(back.seen, { v: 7, t: "zx81" });
  // A tag that could not be read back is left out, not sent as a 400.
  assert.equal(listSearch({ query, offset: 0, limit: 10 }, null, "Bad tag"), "city=pune&sport=box-cricket&q=kick&sort=price-low&lat=18.52&lng=73.86&offset=0&limit=10");
  assert.equal(listSearch({ query: { city: null, sport: null, q: "", sort: "rating", at: null }, offset: 0, limit: 10 }), "offset=0&limit=10");
  assert.equal(listSearch({ query: { city: null, sport: null, q: "", sort: "rating", at: { lat: -0.001, lng: 0.004 } }, offset: 0, limit: 10 }), "lat=0.00&lng=0.00&offset=0&limit=10");
  assert.ok(parse("lat=-0.00&lng=0.00").ok);
});

test("page URL: q on all of India, search in a city, other params kept, nearby never written", () => {
  const f = { q: "kick off", sport: "Box Cricket", sort: "reviews" as const };
  assert.equal(searchForFilters("?utm_source=x", f, "india"), "?utm_source=x&q=kick+off&sport=box-cricket&sort=reviews");
  assert.equal(searchForFilters("?q=old&utm_source=x", f, "city"), "?utm_source=x&search=kick+off&sport=box-cricket&sort=reviews");
  assert.equal(searchForFilters("?search=a&sport=football&sort=reviews", { q: "", sport: null, sort: "nearby" }, "city"), "");
  assert.deepEqual(filtersFromSearch("?search=kick%20off&sport=box-cricket&sort=reviews"), f);
  assert.deepEqual(filtersFromSearch("?q=baner"), { q: "baner", sport: null, sort: "rating" });
  assert.deepEqual(filtersFromSearch("?sort=nearby&sport=swimming"), { q: "", sport: null, sort: "rating" });
  assert.equal(isDefaultFilters(filtersFromSearch("?utm_source=x")), true);
  assert.equal(isDefaultFilters(filtersFromSearch("?sport=football")), false);
});

test("exactNearest: batches ranked from the rounded point still give the exact nearest-first order", () => {
  const r = rng(11);
  for (let round = 0; round < 40; round++) {
    // Dense: 300 turfs within ~8 km, some without coordinates.
    const turfs = randomTurfs(300, 100 + round).map((t, i) => (i % 37 === 0 ? { ...t, lat: null, lng: null } : t));
    const me = { lat: 18.45 + r() * 0.15, lng: 73.75 + r() * 0.15 };
    const rounded = roundCoords(me);
    const query = { q: "", sport: null, sort: "nearby" as const, at: rounded };
    const none = new Set<string>();
    const exact = turfs
      .filter((t) => t.lat != null)
      .map((t) => ({ id: t.id, km: haversineKm(me, { lat: t.lat!, lng: t.lng! }) }))
      .sort((a, b) => a.km - b.km);
    // Fetch the way the client does, until the first 40 are ready.
    const fetched: Turf[] = [];
    let total = Infinity;
    let ready = exactNearest(fetched, false, me, rounded);
    for (let guard = 0; ready.length < 40 && fetched.length < total && guard < 20; guard++) {
      const page = pageOf(turfs, query, none, fetched.length, Math.min(MAX_LIMIT, 40 - ready.length + 10), 1);
      total = page.total;
      fetched.push(...page.items.map((i) => i.turf));
      ready = exactNearest(fetched, fetched.length >= total, me, rounded);
    }
    assert.ok(ready.length >= 40);
    const got = ready.slice(0, 40).map((x) => x.item.id);
    // Ties in distance may come either way; the distances must match exactly.
    assert.deepEqual(ready.slice(0, 40).map((x) => x.km), exact.slice(0, 40).map((e) => e.km), `round ${round}`);
    assert.equal(new Set(got).size, 40);
  }
});

test("exactNearest: once everything is fetched, all turfs, the ones without coordinates last", () => {
  const turfs = [mk({ id: "a", lat: 18.6, lng: 73.8 }), mk({ id: "b", lat: 18.51, lng: 73.8 }), mk({ id: "c", lat: null, lng: null })];
  const me = { lat: 18.5, lng: 73.8 };
  const out = exactNearest(turfs, true, me, roundCoords(me));
  assert.deepEqual(out.map((x) => x.item.id), ["b", "a", "c"]);
  assert.equal(out[2].km, null);
  // Not done and no turf without coordinates seen: only the ones that are surely in place.
  const partial = exactNearest([turfs[1]], false, { lat: 18.504, lng: 73.804 }, { lat: 18.5, lng: 73.8 });
  assert.deepEqual(partial, []);
});

test("picksTag: the same for the same picks in any order, other picks another tag, 0 for none", () => {
  assert.equal(picksTag([]), "0");
  assert.equal(picksTag(new Set<string>()), "0");
  assert.equal(picksTag(["b", "a"]), picksTag(new Set(["a", "b"])));
  assert.notEqual(picksTag(["a"]), picksTag(["b"]));
  assert.notEqual(picksTag(["a"]), picksTag(["a", "b"]));
  for (const t of [picksTag(["4f6c-uuid"]), picksTag(["x", "y", "z"])]) assert.match(t, /^[0-9a-z]{1,13}$/);
  // Every page names the picks it was ranked with; only the first batch with a location carries nearAt.
  const turfs = randomTurfs(50, 4);
  const trending = new Set([turfs[7].id]);
  const page = pageOf(turfs, { q: "", sport: null, sort: "rating", at: null }, trending, 0, 10, 3);
  assert.equal(page.t, picksTag(trending));
  assert.equal(page.nearAt, undefined);
  assert.equal(pageOf(turfs, { q: "", sport: null, sort: "rating", at: null }, new Set(), 0, 10, 3).t, "0");
  assert.equal(pageOf(turfs, { q: "", sport: null, sort: "nearby", at: { lat: 18.5, lng: 73.8 } }, trending, 10, 10, 3).nearAt, undefined);
});

test("nearAt: every matching turf within 5 km of any location in the rounded cell, so the browser counts exactly", () => {
  const r = rng(21);
  let differed = 0;
  for (let round = 0; round < 200; round++) {
    const turfs = randomTurfs(300, 300 + (round % 7));
    const me = { lat: 18.45 + r() * 0.15, lng: 73.75 + r() * 0.15 };
    const at = roundCoords(me);
    assert.ok(haversineKm(me, at) <= ROUND_SLACK_KM);
    const sport = round % 3 === 0 ? "Football" : null;
    const page = pageOf(turfs, { q: "", sport, sort: round % 2 ? "nearby" : "price-low", at }, new Set(), 0, 10, 1);
    const exact = rankTurfs(turfs, { q: "", sport, sort: "nearby", at: me }, new Set()).near!;
    const counted = page.nearAt!.filter(([lat, lng]) => haversineKm(me, { lat, lng }) <= NEAR_KM).length;
    assert.equal(counted, exact, `round ${round}`);
    if (page.near !== exact) differed++;
    // Only turfs that could be within 5 km of someone in the cell.
    for (const [lat, lng] of page.nearAt!) assert.ok(haversineKm(at, { lat, lng }) <= NEAR_KM + ROUND_SLACK_KM);
  }
  // The count from the rounded point alone is often off (why nearAt exists).
  assert.ok(differed > 50, `${differed} of 200 differed`);
});
