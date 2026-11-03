import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turf } from "../../types/turf";
import { compareTopRated } from "../utils/ranking";
import {
  FACETS,
  PRICE_STEPS,
  SURFACES,
  facetBit,
  facetMask,
  filterFactsOf,
  hourlyPrice,
  type ExtraFacts,
  type Facet,
  type IstTime,
  type SurfaceKind,
  type TurfFilterFacts,
} from "./facts";
import {
  DEFAULT_FILTERS,
  extrasKey,
  extrasOf,
  filtersFromSearch,
  hasExtras,
  isDefaultFilters,
  listCardSport,
  listSearch,
  needsTime,
  pageOf,
  parseListParams,
  rankTurfs,
  roundCoords,
  searchForFilters,
  withExtras,
  type ListQuery,
  type RankQuery,
} from "./query";

// A small seeded random, so failures repeat.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const SPORT_SETS = [["Football", "Box Cricket"], ["Box Cricket"], ["Cricket", "Cricket Nets"], ["Badminton"], ["Pickleball", "Football"], ["Football", "Futsal"], ["Cricket"], []];
const HOURS = [undefined, "360-1380", "360-60", "0-1440", "x|360-1320|360-1320|360-1320|360-1320|300-60|300-60", "|360-1380|||||", ""];
const AMENITIES = [[], ["Parking"], ["Flood Lights", "Restroom"], ["Changing Rooms", "Rental Equipment", "Ample Parking"], ["Floodlights", "Washroom"], ["Drinking Water"]];

/** Turfs in top-rated order, each with a made-up row (card columns) and extras, and their facts. */
function world(n: number, seed = 1) {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const yes = (p: number) => (r() < p ? true : r() < 0.5 ? null : false);
  const turfs: Turf[] = [];
  const facts = new Map<string, TurfFilterFacts>();
  for (let i = 0; i < n; i++) {
    const id = `t${String(i).padStart(4, "0")}`;
    const price = r() < 0.45 ? null : Math.round(4 + r() * 18) * 100;
    const slot = r() < 0.15;
    const turf = {
      id,
      name: `${["Kick Off", "Turf Republic", "Goal Zone", "Smash", "Box Arena"][i % 5]} ${i}`,
      address: `${["Baner", "Kothrud", "Hinjewadi", "Wakad"][i % 4]}, Pune`,
      sports: pick(SPORT_SETS),
      rating: r() < 0.1 ? 0 : Math.round((3.5 + r() * 1.5) * 10) / 10,
      total_reviews: Math.floor(r() * 30) * (r() < 0.5 ? 1 : 10),
      lat: 18.45 + r() * 0.15,
      lng: 73.75 + r() * 0.15,
      city: "pune",
      morning_price: price,
      evening_price: price == null ? null : price + 200,
      price_unit: slot ? "per_slot" : r() < 0.05 ? "per_person" : null,
      slot_minutes: slot ? pick([60, 90, 120]) : null,
      ...(r() < 0.2 ? { sport_bands: { "box-cricket": [900, 1300] as const } } : {}),
    } as unknown as Turf;
    const row = {
      amenities: pick(AMENITIES),
      has_floodlights: yes(0.4),
      is_covered: yes(0.1),
      parking_available: yes(0.5),
      washroom_available: yes(0.35),
      changing_room_available: yes(0.25),
      equipment_provided: yes(0.1),
      is_24x7: r() < 0.3,
      start_time: r() < 0.6 ? "06:00:00" : null,
      end_time: r() < 0.6 ? "23:00:00" : null,
    };
    const oh = pick(HOURS);
    const extra: ExtraFacts = { ...(oh !== undefined ? { oh } : {}), ...(r() < 0.1 ? { c: 1 as const } : {}), ...(r() < 0.8 ? { s: pick(SURFACES) as SurfaceKind } : {}) };
    turfs.push(turf);
    facts.set(id, filterFactsOf(row, extra));
  }
  return { turfs: turfs.sort(compareTopRated), facts };
}

const ids = (xs: { turf: Turf }[]) => xs.map((x) => x.turf.id);
const none = new Set<string>();
const AT: IstTime = { day: 2, minute: 1290 }; // Wednesday 9:30 PM
const base: RankQuery = { q: "", sport: null, sort: "rating", at: null, ist: AT };

/** What the filters must keep, written out plainly against the facts (the reference). */
function keeps(t: Turf, facts: Map<string, TurfFilterFacts>, q: RankQuery): boolean {
  const { facets, price, surface } = extrasOf(q);
  const mask = facetMask(t, facts.get(t.id), q.ist ?? null);
  if (!facets.every((f) => (mask & facetBit(f)) !== 0)) return false;
  if (price != null) {
    const h = hourlyPrice(t, listCardSport(q));
    if (h == null || h > price) return false;
  }
  if (surface && facts.get(t.id)?.surface !== surface) return false;
  return true;
}

test("each toggle alone keeps exactly the turfs that have it, in the list's own order", () => {
  const { turfs, facts } = world(500, 3);
  const all = rankTurfs(turfs, base, none, facts).ranked;
  for (const f of FACETS) {
    const want = all.filter((x) => keeps(x.turf, facts, { ...base, facets: [f] }));
    const got = rankTurfs(turfs, { ...base, facets: [f] }, none, facts).ranked;
    assert.deepEqual(ids(got), ids(want), f);
    // The made-up turfs have each toggle on some and off others, so this checks something.
    assert.ok(got.length > 0 && got.length < turfs.length, `${f}: ${got.length}`);
  }
});

test("toggles together: every one on must hold (an AND), with any search, chip and sort", () => {
  const { turfs, facts } = world(500, 5);
  const r = rng(9);
  const at = roundCoords({ lat: 18.52, lng: 73.85 });
  for (let i = 0; i < 120; i++) {
    const facets = FACETS.filter(() => r() < 0.25);
    const sort = (["rating", "reviews", "price-low", "price-high", "nearby"] as const)[i % 5];
    const query: RankQuery = {
      q: ["", "kick", "baner", "cricket"][i % 4],
      sport: [null, "Football", "Box Cricket", "Cricket"][Math.floor(r() * 4)],
      sort,
      at: sort === "nearby" ? at : null,
      ist: { day: i % 7, minute: (i * 135) % 1440 },
      facets,
      price: r() < 0.3 ? PRICE_STEPS[Math.floor(r() * PRICE_STEPS.length)] : null,
      surface: r() < 0.2 ? SURFACES[Math.floor(r() * 2)] : null,
    };
    const plain = rankTurfs(turfs, { ...query, facets: [], price: null, surface: null }, none, facts).ranked;
    const got = rankTurfs(turfs, query, none, facts).ranked;
    // Filtering keeps the order the list has without it.
    assert.deepEqual(ids(got), ids(plain.filter((x) => keeps(x.turf, facts, query))), JSON.stringify(query));
  }
});

test("price cap: the card's price per hour at or under it; a turf with no listed price is under none", () => {
  const { turfs, facts } = world(400, 11);
  for (const step of PRICE_STEPS) {
    const got = rankTurfs(turfs, { ...base, price: step }, none, facts).ranked;
    for (const x of got) {
      const h = hourlyPrice(x.turf, null);
      assert.ok(h != null && h <= step, `${x.turf.id} ${h} > ${step}`);
    }
    const left = turfs.filter((t) => !got.some((x) => x.turf.id === t.id));
    for (const t of left) {
      const h = hourlyPrice(t, null);
      assert.ok(h == null || h > step);
    }
  }
  // A per-slot price counts per hour; per person never.
  const slot = { id: "slot", name: "Slot", address: "", sports: ["Football"], rating: 4, total_reviews: 20, morning_price: 1200, price_unit: "per_slot", slot_minutes: 90 } as unknown as Turf;
  const person = { id: "person", name: "Person", address: "", sports: ["Football"], rating: 4, total_reviews: 20, morning_price: 200, price_unit: "per_person" } as unknown as Turf;
  assert.deepEqual(ids(rankTurfs([slot, person], { ...base, price: 800 }, none, new Map()).ranked), ["slot"]);
  assert.deepEqual(ids(rankTurfs([slot, person], { ...base, price: 600 }, none, new Map()).ranked), []);
  // With a chip, the chip's price (the bands' range for box cricket, not the card's football rate).
  const venue = { id: "v", name: "V", address: "", sports: ["Football", "Box Cricket"], rating: 4, total_reviews: 20, morning_price: 1800, sport_bands: { "box-cricket": [900, 1100] } } as unknown as Turf;
  assert.deepEqual(ids(rankTurfs([venue], { ...base, price: 1000 }, none, new Map()).ranked), []);
  assert.deepEqual(ids(rankTurfs([venue], { ...base, sport: "Box Cricket", price: 1000 }, none, new Map()).ranked), ["v"]);
});

test("surface and open now: from the facts; without a time nothing is open now", () => {
  const { turfs, facts } = world(300, 13);
  for (const k of SURFACES) {
    const got = rankTurfs(turfs, { ...base, surface: k }, none, facts).ranked;
    assert.ok(got.every((x) => facts.get(x.turf.id)?.surface === k));
    assert.equal(got.length, turfs.filter((t) => facts.get(t.id)?.surface === k).length);
  }
  const open = rankTurfs(turfs, { ...base, facets: ["open"] }, none, facts).ranked;
  assert.ok(open.length > 0);
  const lateNight = rankTurfs(turfs, { ...base, ist: { day: 2, minute: 180 }, facets: ["open"] }, none, facts).ranked;
  assert.notDeepEqual(ids(lateNight), ids(open), "3 AM is not 9:30 PM");
  assert.deepEqual(rankTurfs(turfs, { ...base, ist: null, facets: ["open"] }, none, facts).ranked, []);
  // A turf the lookup has no facts for has none of the toggles that need them (the rating still counts).
  const t = turfs.find((x) => x.rating >= 4.5 && x.total_reviews > 0)!;
  assert.deepEqual(ids(rankTurfs([t], { ...base, facets: ["parking"] }, none, new Map()).ranked), []);
  assert.deepEqual(ids(rankTurfs([t], { ...base, facets: ["rated"] }, none, new Map()).ranked), [t.id]);
});

test("counts: each number is how many that choice would show, everything else as it is", () => {
  const { turfs, facts } = world(500, 17);
  const r = rng(21);
  const total = (q: RankQuery) => rankTurfs(turfs, q, none, facts).ranked.length;
  for (let i = 0; i < 80; i++) {
    const query: RankQuery = {
      ...base,
      q: ["", "kick", "pune"][i % 3],
      sport: [null, "Football", "Box Cricket"][i % 3],
      ist: { day: i % 7, minute: (i * 75) % 1440 },
      facets: FACETS.filter(() => r() < 0.15),
      price: r() < 0.3 ? PRICE_STEPS[i % PRICE_STEPS.length] : null,
      surface: r() < 0.2 ? SURFACES[i % 2] : null,
    };
    const { ranked, counts } = rankTurfs(turfs, query, none, facts, { counts: true });
    assert.ok(counts);
    const e = extrasOf(query);
    for (const f of FACETS) assert.equal(counts.f[f], total({ ...query, facets: [...e.facets, f] }), `f ${f} ${JSON.stringify(query)}`);
    // A toggle that is on counts the list itself.
    for (const f of e.facets) assert.equal(counts.f[f], ranked.length);
    for (const step of PRICE_STEPS) assert.equal(counts.price[String(step)], total({ ...query, price: step }), `price ${step}`);
    assert.equal(counts.anyPrice, total({ ...query, price: null }));
    assert.equal(counts.priced, rankTurfs(turfs, { ...query, price: null }, none, facts).ranked.filter((x) => hourlyPrice(x.turf, listCardSport(query)) != null).length);
    for (const k of SURFACES) assert.equal(counts.surface[k] ?? 0, total({ ...query, surface: k }), `surface ${k}`);
    assert.equal(counts.anySurface, total({ ...query, surface: null }));
  }
  // No counts unless asked.
  assert.equal(rankTurfs(turfs, base, none, facts).counts, null);
});

test("a sport page's list is its turfs by the page's exact labels, not a chip's substring", () => {
  const mk = (id: string, sports: string[], price?: number) => ({ id, name: id, address: "", sports, rating: 4.6, total_reviews: 40, morning_price: price ?? null }) as unknown as Turf;
  const turfs = [mk("box", ["Box Cricket"]), mk("cricket", ["Cricket"]), mk("nets", ["Cricket Nets"]), mk("futsal", ["Futsal"]), mk("football", ["Football", "Box Cricket"], 900), mk("pickle", ["Pickleball"])];
  const page = (ps: string) => ids(rankTurfs(turfs, { ...base, pageSport: ps }, none, new Map()).ranked).sort();
  assert.deepEqual(page("cricket"), ["cricket", "nets"]);
  assert.deepEqual(ids(rankTurfs(turfs, { ...base, sport: "Cricket" }, none, new Map()).ranked).sort(), ["box", "cricket", "football", "nets"], "the chip matches Box Cricket too");
  assert.deepEqual(page("football"), ["football", "futsal"]);
  assert.deepEqual(page("box-cricket"), ["box", "football"]);
  // The page's sport is the card's sport: its price rule for the cap and the price sorts.
  assert.deepEqual(listCardSport({ sport: null, pageSport: "football" }), { labels: ["Football", "Futsal"] });
  assert.deepEqual(listCardSport({ sport: "Box Cricket", pageSport: "football" }), { chip: "Box Cricket" });
  assert.equal(listCardSport({ sport: null, pageSport: null }), null);
  assert.deepEqual(ids(rankTurfs(turfs, { ...base, pageSport: "football", price: 1000 }, none, new Map()).ranked), ["football"]);
});

test("pages: counts only on a first batch that asks for them, ranked with facts; batches of a filtered list continue each other", () => {
  const { turfs, facts } = world(300, 23);
  const query: RankQuery = { ...base, facets: ["lights"], price: 2000 };
  const first = pageOf(turfs, query, none, 0, 10, 4, facts, { counts: true });
  assert.ok(first.counts);
  assert.equal(first.ist, "2.1290");
  assert.equal(pageOf(turfs, query, none, 10, 10, 4, facts, { counts: true }).counts, undefined);
  // Not asked (the sheet is closed): the same cards, no numbers.
  const plainFirst = pageOf(turfs, query, none, 0, 10, 4, facts);
  assert.equal(plainFirst.counts, undefined);
  assert.deepEqual(plainFirst.items, first.items);
  // The page's own first cards (no facts): no counts rather than wrong ones.
  assert.equal(pageOf(turfs, { ...DEFAULT_FILTERS, at: null }, none, 0, 10, 4, null, { counts: true }).counts, undefined);
  assert.equal(pageOf(turfs, { ...DEFAULT_FILTERS, at: null }, none, 0, 10, 4).ist, undefined);
  const all = ids(rankTurfs(turfs, query, none, facts).ranked);
  const got: string[] = [];
  for (let off = 0; off < all.length + 10; off += 10) got.push(...pageOf(turfs, query, none, off, 10, 4, facts).items.map((i) => i.turf.id));
  assert.deepEqual(got, all);
  assert.equal(first.total, all.length);
});

test("a list without Filters choices ranks exactly as it did, facts or not", () => {
  const { turfs, facts } = world(400, 29);
  const trending = new Set([turfs[40].id]);
  for (const sort of ["rating", "reviews", "price-low", "price-high"] as const) {
    for (const sport of [null, "Football", "Cricket"]) {
      const q = { q: "", sport, sort, at: null };
      assert.deepEqual(ids(rankTurfs(turfs, { ...q, ist: AT }, trending, facts).ranked), ids(rankTurfs(turfs, q, trending).ranked));
    }
  }
});

test("the route's params: the Filters choices, a sport page and the time, in one order, checked", () => {
  const query: ListQuery = {
    city: "pune",
    pageSport: "football",
    sport: null,
    q: "kick",
    sort: "price-low",
    at: null,
    // Out of order and twice: written once, in FACETS order.
    facets: ["parking", "open", "lights", "open"] as Facet[],
    price: 1000,
    surface: "natural",
    ist: { day: 4, minute: 1185 },
  };
  const s = listSearch({ query, offset: 0, limit: 10 }, 3, "abc");
  assert.equal(s, "city=pune&ps=football&q=kick&f=open%2Clights%2Cparking&price=1000&surface=natural&sort=price-low&ist=4.1185&offset=0&limit=10&v=3&t=abc");
  const back = parseListParams(new URLSearchParams(s));
  assert.ok(back.ok);
  assert.deepEqual(back.req.query, { ...query, facets: ["open", "lights", "parking"] });
  // None given: none in the query (the plain list's query is the one it was).
  const plain = parseListParams(new URLSearchParams("city=pune&offset=0&limit=10"));
  assert.ok(plain.ok);
  assert.deepEqual(plain.req.query, { city: "pune", sport: null, q: "", sort: "rating", at: null });
  for (const bad of ["f=", "f=open,bogus", "f=Open", "price=700", "price=1000.0", "surface=grass", "ist=7.0", "ist=1.20", "ps=squash", "ps="]) {
    const r = parseListParams(new URLSearchParams(bad));
    assert.equal(r.ok, false, bad);
  }
  // The sheet's numbers: counts=1 on a first batch only, written after the time.
  const asked = listSearch({ query: { ...query, facets: [], ist: { day: 4, minute: 1185 } }, offset: 0, limit: 10, counts: true });
  assert.equal(asked, "city=pune&ps=football&q=kick&price=1000&surface=natural&sort=price-low&ist=4.1185&counts=1&offset=0&limit=10");
  const askedBack = parseListParams(new URLSearchParams(asked));
  assert.ok(askedBack.ok);
  assert.equal(askedBack.req.counts, true);
  assert.equal("counts" in back.req, false, "not asked: not in the request");
  for (const bad of ["counts=0", "counts=true", "counts=", "counts=1&offset=10"]) assert.equal(parseListParams(new URLSearchParams(bad)).ok, false, bad);
  // The time matters to a first batch asked with counts (they count "Open now") and to an "Open now"
  // list; any other batch (a new search, chip or sort with the sheet closed) is the same all day.
  assert.equal(needsTime({}, 0), false);
  assert.equal(needsTime({}, 0, true), true);
  assert.equal(needsTime({}, 10, true), false);
  assert.equal(needsTime({}, 10), false);
  assert.equal(needsTime({ facets: ["open"] }, 10), true);
  assert.equal(needsTime({ facets: ["open"] }, 0), true);
});

test("a sport page ranks by rating: the trending pick neither leads it nor is framed, for the server's cards and every batch", () => {
  const mk = (id: string, sports: string[], rating: number) => ({ id, name: id, address: "", sports, rating, total_reviews: 40 }) as unknown as Turf;
  const turfs = [mk("a", ["Football"], 4.9), mk("b", ["Football"], 4.7), mk("c", ["Football", "Box Cricket"], 4.5), mk("pick", ["Football", "Box Cricket"], 3.9)].sort(compareTopRated);
  const trending = new Set(["pick"]);
  // The city's list: the pick leads and is framed.
  assert.deepEqual(ids(rankTurfs(turfs, base, trending).ranked), ["pick", "a", "b", "c"]);
  assert.deepEqual(pageOf(turfs, base, trending, 0, 10, 1).items[0], { turf: turfs.find((t) => t.id === "pick"), hot: true });
  // A sport page: the rating order its copy and its ItemList give, picks or not.
  const sportPage: RankQuery = { ...base, pageSport: "football" };
  assert.deepEqual(ids(rankTurfs(turfs, sportPage, trending).ranked), ["a", "b", "c", "pick"]);
  const page = pageOf(turfs, sportPage, trending, 0, 24, 1);
  assert.deepEqual(page.items.map((i) => i.turf.id), ["a", "b", "c", "pick"]);
  assert.ok(page.items.every((i) => !i.hot));
  assert.equal(page.t, "0", "ranked with no picks, so its batches never split by them");
  assert.deepEqual(pageOf(turfs, sportPage, none, 0, 24, 1), page);
  // A chip on a city list keeps the lead (it is not a sport page).
  assert.deepEqual(ids(rankTurfs(turfs, { ...base, sport: "Box Cricket" }, trending).ranked), ["pick", "c"]);
  // Show more on a sport page continues its 24 server cards at offset 24, in rating order.
  const many = Array.from({ length: 60 }, (_, i) => mk(`f${String(i).padStart(2, "0")}`, ["Football"], 3 + (i % 20) / 10)).sort(compareTopRated);
  const picks = new Set([many[30].id]);
  const all = ids(rankTurfs(many, sportPage, picks).ranked);
  const server = pageOf(many, sportPage, picks, 0, 24, 1).items.map((i) => i.turf.id);
  const next = pageOf(many, sportPage, picks, 24, 24, 1).items.map((i) => i.turf.id);
  assert.deepEqual([...server, ...next], all.slice(0, 48));
  assert.deepEqual(all, many.map((t) => t.id));
});

test("the page URL: the Filters choices as f, price and surface; unknown ones dropped; defaults left out", () => {
  const f = withExtras({ q: "kick", sport: "Football", sort: "rating" as const }, { facets: ["covered", "24h"], price: 1200, surface: "artificial" });
  const s = searchForFilters("?utm_source=x", f, "city");
  assert.equal(s, "?utm_source=x&search=kick&sport=football&f=24h%2Ccovered&price=1200&surface=artificial");
  assert.deepEqual(filtersFromSearch(s), { q: "kick", sport: "Football", sort: "rating", facets: ["24h", "covered"], price: 1200, surface: "artificial" });
  assert.deepEqual(filtersFromSearch("?f=open,nope,lights&price=999&surface=moon"), { q: "", sport: null, sort: "rating", facets: ["open", "lights"] });
  assert.equal(isDefaultFilters(filtersFromSearch("?f=open")), false);
  assert.equal(isDefaultFilters(filtersFromSearch("?price=800")), false);
  assert.equal(isDefaultFilters(filtersFromSearch("?f=nope")), true);
  // Taking them all off leaves the plain URL (and the other params as they were).
  assert.equal(searchForFilters(s, { q: "", sport: null, sort: "rating" }, "city"), "?utm_source=x");
  assert.equal(hasExtras({ facets: [] }), false);
  assert.equal(hasExtras({ surface: "clay" }), true);
  assert.equal(extrasKey({ facets: ["rated", "open"], price: 600, surface: "hard" }), "f=open,rated;p=600;s=hard");
  assert.equal(extrasKey({}), "");
  assert.deepEqual(withExtras({ q: "", sport: null, sort: "rating" as const, facets: ["open"] as Facet[] }, { facets: [], price: null }), { q: "", sport: null, sort: "rating" });
});
