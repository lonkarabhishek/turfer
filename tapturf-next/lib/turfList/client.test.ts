import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import type { Turf } from "../../types/turf";
import { compareTopRated } from "../utils/ranking";
import { haversineKm } from "../utils/location";
import { FIRST_PAGE, NEAR_KM, listSearch, nextBatch, pageOf, picksTag, rankTurfs, roundCoords, type ListFilters, type ListPage } from "./query";
import {
  LIST_PREPAINT_JS,
  SAVE_TTL_MS,
  addBatch,
  firstBatch,
  fromSaved,
  FREE_SAVE_MS,
  isFreeKey,
  isGeoKey,
  isTimedKey,
  istNow,
  listKey,
  nearCount,
  nearbyFrom,
  shownCards,
  sportOfKey,
  startState,
  toSaved,
  wantBatch,
  type ListState,
} from "./client";

function mk(i: number, p: Partial<Turf> = {}): Turf {
  return { id: `t${String(i).padStart(3, "0")}`, name: `Turf ${i}`, address: "Baner, Pune", sports: ["Football"], rating: 4 + (i % 10) / 10, total_reviews: 10 + ((i * 7) % 90), lat: 18.5 + (i % 17) / 200, lng: 73.8 + (i % 13) / 200, city: "pune", ...p } as Turf;
}
const turfs = Array.from({ length: 237 }, (_, i) => mk(i)).sort(compareTopRated);
const none = new Set<string>();
const DEFAULT: ListFilters = { q: "", sport: null, sort: "rating" };

/** The route, in memory. */
function route(query = { q: "", sport: null as string | null, sort: "rating" as ListFilters["sort"], at: null as { lat: number; lng: number } | null }, v = 1) {
  return (offset: number, limit: number): ListPage => pageOf(turfs, query, none, offset, limit, v);
}

/** What the component does: fetch until shownCards reaches the target or wantBatch says stop. */
function settle(s: ListState, fetch: (o: number, l: number) => ListPage, me: { lat: number; lng: number } | null = null) {
  let requests = 0;
  for (;;) {
    const ready = shownCards(s, me).length;
    const want = wantBatch(s, ready);
    if (!want) return { s, requests };
    s = addBatch(s, fetch(want.offset, want.limit));
    requests++;
    assert.ok(requests < 20);
  }
}

test("show more: 10, then 10, 20, 40, 80, 80 more, one request each, in the route's order", () => {
  const fetch = route();
  let s = startState(listKey("pune", DEFAULT, null), fetch(0, FIRST_PAGE));
  assert.equal(shownCards(s, null).length, 10);
  const seen: number[] = [];
  const calls: string[] = [];
  while (!s.end) {
    s = { ...s, target: s.target + nextBatch(s.target) };
    const r = settle(s, (o, l) => (calls.push(`${o}+${l}`), fetch(o, l)));
    assert.equal(r.requests, 1);
    s = r.s;
    seen.push(shownCards(s, null).length);
  }
  // The last asks for a whole batch: the same URL for everyone, whatever is left.
  assert.deepEqual(calls, ["10+10", "20+20", "40+40", "80+80", "160+80"]);
  assert.deepEqual(seen, [20, 40, 80, 160, 237]);
  const all = pageOf(turfs, DEFAULT_QUERY(), none, 0, 1000, 1).items.map((i) => i.turf.id);
  assert.deepEqual(shownCards({ ...s, target: 1000 }, null).map((c) => c.item.turf.id), all);
  assert.equal(wantBatch({ ...s, target: 1000 }, 237), null);
});

function DEFAULT_QUERY() {
  return { q: "", sport: null, sort: "rating" as const, at: null };
}

test("a sport page's 24 server cards: all shown, nothing fetched, Show more continues at 24", () => {
  const fetch = route();
  // As TurfListingClient starts it: every card the server rendered is on screen.
  const first = fetch(0, 24);
  let s = startState(listKey("pune", DEFAULT, null, "football"), first, Math.max(FIRST_PAGE, first.items.length));
  assert.equal(shownCards(s, null).length, 24);
  assert.equal(wantBatch(s, 24), null);
  const calls: string[] = [];
  for (let i = 0; i < 3; i++) {
    s = { ...s, target: s.target + nextBatch(s.target) };
    const r = settle(s, (o, l) => (calls.push(`${o}+${l}`), fetch(o, l)));
    s = r.s;
  }
  assert.deepEqual(calls, ["24+24", "48+48", "96+80"]);
  assert.deepEqual(shownCards(s, null).map((c) => c.item.turf.id), pageOf(turfs, DEFAULT_QUERY(), none, 0, 176, 1).items.map((i) => i.turf.id));
});

test("a batch from a newer version: appended after the server's offset, repeats dropped, newest total", () => {
  const s = startState("k|", route()(0, 10));
  // The list moved: two turfs were added at the top, so v2's 10..19 repeats two of v1's first ten.
  const v2 = [mk(900, { rating: 5, total_reviews: 999 }), mk(901, { rating: 5, total_reviews: 998 }), ...turfs];
  const page = pageOf(v2, DEFAULT_QUERY(), none, 10, 10, 2);
  const t = addBatch({ ...s, target: 20 }, page);
  assert.equal(t.v, 2);
  assert.equal(t.total, 239);
  assert.equal(t.next, 20);
  assert.equal(t.items.length, 18);
  assert.equal(new Set(t.items.map((i) => i.turf.id)).size, 18);
  // The two missing cards are asked for from the new offset.
  assert.deepEqual(wantBatch(t, 18), { offset: 20, limit: 2 });
});

test("an empty batch ends the list (no loop when the route has fewer rows than it said)", () => {
  const s = startState("k|", { v: 1, t: "0", total: 50, near: null, offset: 0, items: route()(0, 10).items });
  const t = addBatch({ ...s, target: 20 }, { v: 2, t: "0", total: 50, near: null, offset: 10, items: [] });
  assert.equal(t.end, true);
  assert.equal(wantBatch(t, 10), null);
});

test("an older batch (a process behind the purge) adds its rows but never lowers the version asked for next", () => {
  const trending = new Set([turfs[40].id]);
  const v2 = (o: number, l: number) => pageOf(turfs, DEFAULT_QUERY(), trending, o, l, 2);
  const s = startState(listKey("pune", DEFAULT, null), v2(0, 10));
  assert.equal(s.v, 2);
  assert.equal(s.t, picksTag(trending));
  // The old list had one turf less.
  const old = pageOf(turfs.slice(1), DEFAULT_QUERY(), none, 10, 10, 1);
  const t = addBatch({ ...s, target: 20 }, old);
  assert.equal(t.v, 2);
  assert.equal(t.total, s.total);
  assert.equal(t.t, s.t);
  assert.equal(t.items.length, 20);
  const query = { city: "pune", ...DEFAULT_QUERY() };
  assert.match(listSearch({ query, offset: t.next, limit: 20 }, t.v, t.t), new RegExp(`&v=2&t=${s.t}$`));
  // A newer one moves it up.
  const u = addBatch({ ...t, target: 40 }, pageOf(turfs, DEFAULT_QUERY(), trending, 20, 20, 3));
  assert.equal(u.v, 3);
  assert.equal(u.t, s.t);
});

test("within 5 km: counted from the precise location, as the cards' distances are", () => {
  for (const me of [{ lat: 18.47677, lng: 73.81516 }, { lat: 18.5312, lng: 73.8277 }, { lat: 18.5049, lng: 73.8349 }]) {
    const rounded = roundCoords(me);
    const s = startState(listKey("pune", { ...DEFAULT, sort: "nearby" }, rounded), pageOf(turfs, { ...DEFAULT_QUERY(), sort: "nearby", at: rounded }, none, 0, 20, 1));
    const exact = turfs.filter((t) => haversineKm(me, { lat: t.lat!, lng: t.lng! }) <= NEAR_KM).length;
    assert.equal(nearCount(s, me), exact);
    assert.equal(rankTurfs(turfs, { ...DEFAULT_QUERY(), sort: "nearby", at: me }, none).near, exact);
    // Later batches keep the first one's list.
    const t = addBatch({ ...s, target: 40 }, pageOf(turfs, { ...DEFAULT_QUERY(), sort: "nearby", at: rounded }, none, 20, 30, 1));
    assert.equal(nearCount(t, me), exact);
  }
  assert.equal(nearCount(startState("k|", route()(0, 10)), null), null);
  // A page without nearAt (no location when it was asked for): the route's count.
  assert.equal(nearCount({ ...startState("k|", route()(0, 10)), near: 7 }, { lat: 18.5, lng: 73.8 }), 7);
});

test("nearby: exact order from the precise location, a little extra fetched, distances from the precise point", () => {
  const me = { lat: 18.5312, lng: 73.8277 };
  const rounded = roundCoords(me);
  const fetch = route({ q: "", sport: null, sort: "nearby", at: rounded });
  const first = firstBatch(true);
  let s = startState(listKey("pune", { ...DEFAULT, sort: "nearby" }, rounded), fetch(first.offset, first.limit));
  s = settle(s, fetch, me).s;
  for (const target of [10, 20, 40, 80]) {
    s = settle({ ...s, target }, fetch, me).s;
    const cards = shownCards(s, me);
    assert.equal(cards.length, target);
    const exact = turfs.map((t) => haversineKm(me, { lat: t.lat!, lng: t.lng! })).sort((a, b) => a - b).slice(0, target);
    assert.deepEqual(cards.map((c) => c.km), exact);
  }
});

test("a list keeps its own order while the next one loads (nearby is read from its key)", () => {
  const me = { lat: 18.5312, lng: 73.8277 };
  const rounded = roundCoords(me);
  assert.deepEqual(nearbyFrom(listKey("pune", { ...DEFAULT, sort: "nearby" }, rounded)), rounded);
  assert.equal(nearbyFrom(listKey("pune", DEFAULT, rounded)), null);
  assert.equal(nearbyFrom(listKey("pune", DEFAULT, null)), null);
  // The top-rated list, still on screen after Near me was tapped: same order, now with distances.
  const s = startState(listKey("pune", DEFAULT, null), route()(0, 10));
  const cards = shownCards(s, me);
  assert.deepEqual(cards.map((c) => c.item.turf.id), s.items.map((i) => i.turf.id));
  assert.ok(cards.every((c) => typeof c.km === "number"));
});

test("distances on a non-nearby list come from the precise location", () => {
  const me = { lat: 18.5, lng: 73.8 };
  const s = startState("k|", route()(0, 10));
  for (const c of shownCards(s, me)) assert.equal(c.km, haversineKm(me, { lat: c.item.turf.lat!, lng: c.item.turf.lng! }));
  assert.ok(shownCards(s, null).every((c) => c.km === null));
});

test("listKey: scope, sport, search (any case), sort and rounded location; nearby without a location is the default", () => {
  assert.equal(listKey("pune", { q: " Kick ", sport: "Box Cricket", sort: "reviews" }, null), "pune|box-cricket|kick|reviews|");
  assert.equal(listKey(null, { q: "", sport: null, sort: "nearby" }, null), listKey(null, DEFAULT, null));
  assert.equal(listKey(null, { q: "", sport: null, sort: "nearby" }, { lat: 18.52, lng: 73.86 }), "|||nearby|18.52,73.86");
  assert.equal(isGeoKey("|||nearby|18.52,73.86"), true);
  assert.equal(isGeoKey("pune||kick|rating|"), false);
});

test("sportOfKey: the chip a list was fetched for, whatever the search text holds", () => {
  assert.equal(sportOfKey(listKey("pune", { q: "", sport: "Badminton", sort: "rating" }, null)), "Badminton");
  assert.equal(sportOfKey(listKey(null, { q: "", sport: "Box Cricket", sort: "nearby" }, { lat: 18.52, lng: 73.86 })), "Box Cricket");
  assert.equal(sportOfKey(listKey("pune", { q: "a|tennis|b", sport: null, sort: "rating" }, null)), null);
  assert.equal(sportOfKey(listKey("pune", { q: "x|y", sport: "Tennis", sort: "rating" }, null)), "Tennis");
  assert.equal(sportOfKey(listKey(null, DEFAULT, null)), null);
  assert.equal(sportOfKey("k|"), null);
  assert.equal(sportOfKey(""), null);
  assert.equal(sportOfKey("pune|squash|||"), null);
});

test("saved lists: only for the same URL and scope, recent, well formed and not nearby", () => {
  const s = startState("pune||kick|rating|", route()(0, 10));
  const now = 1_800_000_000_000;
  const raw = toSaved("/turfs?search=kick", "pune", { ...DEFAULT, q: "kick" }, s, 1234.6, now)!;
  const back = fromSaved(raw, "/turfs?search=kick", "pune", now + 1000);
  assert.ok(back);
  assert.equal(back.y, 1235);
  assert.deepEqual(back.state, s);
  assert.equal(fromSaved(raw, "/turfs", "pune", now), null);
  assert.equal(fromSaved(raw, "/turfs?search=kick", "nashik", now), null);
  assert.equal(fromSaved(raw, "/turfs?search=kick", "pune", now + SAVE_TTL_MS + 1), null);
  assert.equal(fromSaved("{nope", "/turfs?search=kick", "pune", now), null);
  assert.equal(fromSaved(JSON.stringify({ ...JSON.parse(raw), state: { ...s, items: [{}] } }), "/turfs?search=kick", "pune", now), null);
  assert.equal(toSaved("/turfs", "", DEFAULT, { ...s, key: "|||nearby|18.52,73.86" }, 0, now), null);
});

function prePaint(search: string): string | null {
  const attrs: Record<string, string> = {};
  const documentElement = { setAttribute: (k: string, v: string) => (attrs[k] = v), removeAttribute: (k: string) => delete attrs[k] };
  runInNewContext(LIST_PREPAINT_JS, { document: { documentElement }, location: { search }, setTimeout: () => 0 });
  return attrs["data-tt-list"] ?? null;
}

test("pre-paint: dims the server's cards only when the URL asks for other ones", () => {
  assert.equal(prePaint("?q=baner"), "wait");
  assert.equal(prePaint("?utm_source=x&search=kick"), "wait");
  assert.equal(prePaint("?sport=football"), "wait");
  assert.equal(prePaint("?sort=reviews"), "wait");
  assert.equal(prePaint(""), null);
  assert.equal(prePaint("?q="), null);
  assert.equal(prePaint("?utm_source=sport"), null);
});

test("listKey with Filters choices and a sport page: the scope part says them; a plain list's key is the one it was", () => {
  const f: ListFilters = { q: " Kick ", sport: "Box Cricket", sort: "reviews", facets: ["parking", "open"], price: 1000, surface: "natural" };
  const key = listKey("pune", f, null, "football");
  assert.equal(key, "pune/football;f=open,parking;p=1000;s=natural|box-cricket|kick|reviews|");
  assert.equal(listKey("pune", { ...DEFAULT, facets: [], price: null }, null), "pune|||rating|");
  // The chip, the location and Back's rules still read the key.
  assert.equal(sportOfKey(key), "Box Cricket");
  assert.equal(isGeoKey(key), false);
  const geo = listKey(null, { ...DEFAULT, sort: "nearby", facets: ["lights"] }, { lat: 18.52, lng: 73.86 });
  assert.deepEqual(nearbyFrom(geo), { lat: 18.52, lng: 73.86 });
  assert.equal(isGeoKey(geo), true);
  // Another order of the same choices is the same list.
  assert.equal(listKey("pune", { ...DEFAULT, facets: ["open", "parking"] }, null), listKey("pune", { ...DEFAULT, facets: ["parking", "open"] }, null));
  assert.equal(isTimedKey(listKey("pune", { ...DEFAULT, facets: ["parking", "open"] }, null)), true);
  assert.equal(isTimedKey(listKey("pune", { ...DEFAULT, facets: ["parking"] }, null)), false);
  assert.equal(isTimedKey(listKey("pune", { ...DEFAULT, q: ";f=open" }, null)), false, "a search for the words is not the toggle");
});

test("a list's first batch keeps its numbers and time; later batches keep them", () => {
  const facts = new Map();
  const query = { q: "", sport: null, sort: "rating" as const, at: null, ist: { day: 1, minute: 600 } };
  const s = startState("pune||||", pageOf(turfs, query, none, 0, 10, 1, facts, { counts: true }));
  assert.ok(s.counts);
  assert.equal(s.ist, "1.600");
  const t = addBatch({ ...s, target: 20 }, pageOf(turfs, query, none, 10, 10, 1, facts));
  assert.equal(t.counts, s.counts);
  assert.equal(t.ist, "1.600");
  // The server's own first cards: no numbers, no time.
  const plain = startState("pune||||", pageOf(turfs, { q: "", sport: null, sort: "rating", at: null }, none, 0, 10, 1));
  assert.equal(plain.counts, null);
  assert.equal(plain.ist, null);
});

test("Back: an \"Open now\" list comes back only within its quarter hour; old saved filters read as plain ones", () => {
  const now = Date.parse("2026-11-04T15:05:00Z"); // 8:35 PM in India, Wednesday
  const ist = istNow(new Date(now));
  assert.equal(ist, "2.1230");
  const f: ListFilters = { ...DEFAULT, facets: ["open"] };
  const key = listKey("pune", f, null);
  const s = { ...startState(key, route()(0, 10)), ist };
  const raw = toSaved("/pune?f=open", "pune", f, s, 0, now)!;
  assert.ok(fromSaved(raw, "/pune?f=open", "pune", now + 5 * 60_000));
  assert.equal(fromSaved(raw, "/pune?f=open", "pune", now + 15 * 60_000), null, "8:50 PM is another quarter");
  // Saved before the Filters existed: no extras, no numbers, no time.
  const old = JSON.parse(toSaved("/pune", "pune", DEFAULT, startState("pune||||", route()(0, 10)), 0, now)!);
  delete old.state.counts;
  delete old.state.ist;
  const back = fromSaved(JSON.stringify(old), "/pune", "pune", now);
  assert.ok(back);
  assert.deepEqual(back.filters, DEFAULT);
  assert.equal(back.state.counts, null);
  assert.equal(back.state.ist, null);
  // Unknown choices in a saved list are dropped, as in a URL.
  const odd = JSON.parse(raw);
  odd.filters = { ...odd.filters, facets: ["nope"], price: 7 };
  assert.deepEqual(fromSaved(JSON.stringify(odd), "/pune?f=open", "pune", now)?.filters, DEFAULT);
});

test("Back: a \"Free hours marked\" list comes back only within a minute (its turfs and times move)", () => {
  const now = Date.parse("2026-11-10T11:00:00Z");
  const f: ListFilters = { ...DEFAULT, facets: ["free"] };
  const key = listKey("bangalore", f, null);
  assert.equal(isFreeKey(key), true);
  assert.equal(isFreeKey(listKey("bangalore", { ...DEFAULT, facets: ["open"] }, null)), false);
  assert.equal(isFreeKey(listKey("bangalore", { ...DEFAULT, q: ";f=free" }, null)), false, "a search for the words is not the toggle");
  assert.equal(isTimedKey(key), false, "no quarter hour in its URL");
  const raw = toSaved("/bangalore?f=free", "bangalore", f, startState(key, route()(0, 10)), 0, now)!;
  assert.ok(fromSaved(raw, "/bangalore?f=free", "bangalore", now + FREE_SAVE_MS));
  assert.equal(fromSaved(raw, "/bangalore?f=free", "bangalore", now + FREE_SAVE_MS + 1), null);
});

function prePaintAttrs(search: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const documentElement = { setAttribute: (k: string, v: string) => (attrs[k] = v), removeAttribute: (k: string) => delete attrs[k] };
  runInNewContext(LIST_PREPAINT_JS, { document: { documentElement }, location: { search }, setTimeout: () => 0 });
  return attrs;
}

test("pre-paint: a Filters choice dims the cards and holds the pills' room; a search or sort alone holds none", () => {
  assert.deepEqual(prePaintAttrs("?f=open,lights"), { "data-tt-list": "wait", "data-tt-pills": "" });
  assert.deepEqual(prePaintAttrs("?utm_source=x&price=1000"), { "data-tt-list": "wait", "data-tt-pills": "" });
  assert.deepEqual(prePaintAttrs("?surface=natural"), { "data-tt-list": "wait", "data-tt-pills": "" });
  assert.deepEqual(prePaintAttrs("?sort=reviews"), { "data-tt-list": "wait" });
  assert.deepEqual(prePaintAttrs("?search=kick"), { "data-tt-list": "wait" });
  assert.deepEqual(prePaintAttrs("?ref=x&f="), {});
  assert.deepEqual(prePaintAttrs(""), {});
});
