import { test } from "node:test";
import assert from "node:assert/strict";
import { joinTrending, trendSpan, trendWords, type TrendWindow } from "./trending";
import * as wire from "./trendWire";
import * as map from "./trending";
import {
  TREND_KEEP_MS,
  createTrendReader,
  keepText,
  noTrend,
  readKept,
  trendCard,
  trendChip,
  trendFresh,
  trendMeaning,
  trendNow,
  trendPath,
  trendRankOf,
  type TrendDeps,
} from "./trendingClient";

const T = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MIN = 60_000;
const T0 = Date.parse("2026-11-27T12:00:00+05:30");

/** Card rows as the route's turf list has them: a turf's key is its slug, else its id. */
const TURFS = [
  { id: T(1), slug: "turf-up-baner", lat: 18.56, lng: 73.78 },
  { id: T(2), slug: null, lat: 19.07, lng: 72.87 },
  { id: T(3), slug: "kings-turf-nashik", lat: 20.0, lng: 73.79 },
  { id: T(4), slug: "goal-arena-hyderabad", lat: 17.44, lng: 78.38 },
  { id: T(5), slug: "sixer-box-mumbai", lat: 19.11, lng: 72.86 },
  { id: T(6), slug: "striker-turf-delhi", lat: 28.61, lng: 77.2 },
];
/** The route's answer for those six, ranked 1 to 6, as it builds it (joinTrending). */
const answer = (window: TrendWindow = "7d", n = 6) => ({ window, trending: joinTrending(TURFS.slice(0, n).map((t, i) => ({ turf_id: t.id, rank: i + 1 })), TURFS) });

/** A page: a clock, a tab's storage and a route, with the reads the page asked for counted. */
function page(o: { store?: Map<string, string>; blocked?: boolean; path?: string; bot?: boolean; route?: () => unknown } = {}) {
  const store = o.store ?? new Map<string, string>();
  const state = { now: T0, gets: 0, idle: [] as (() => void)[], leaving: false, path: o.path ?? "/turf/turf-up-baner", fail: false, body: (o.route ?? (() => answer())) as () => unknown, changes: 0 };
  const deps: TrendDeps = {
    now: () => state.now,
    load: () => {
      if (o.blocked) throw new Error("storage blocked");
      return store.get("k") ?? null;
    },
    save: (text) => {
      if (o.blocked) throw new Error("storage blocked");
      store.set("k", text);
    },
    get: async () => {
      state.gets++;
      if (state.fail) throw new Error("HTTP 503");
      return state.body();
    },
    later: (run) => {
      state.idle.push(run);
    },
    allowed: () => !o.bot && trendPath(state.path),
    leaving: () => state.leaving,
  };
  const reader = createTrendReader(deps);
  reader.subscribe(() => state.changes++);
  /** The page goes idle (and is on screen): what waited runs, and its read settles. */
  const idle = async () => {
    for (const run of state.idle.splice(0)) run();
    await new Promise((r) => setImmediate(r));
  };
  return { reader, state, store, idle };
}

test("the words: the rank and the window, in the map's own words for the window", () => {
  assert.equal(trendChip(3), "Trending #3 on TapTurf");
  assert.equal(trendMeaning(3, "7d"), "Number 3 by page views in the last 7 days");
  assert.equal(trendMeaning(1, "24h"), "Number 1 by page views in the last 24 hours");
  assert.equal(trendMeaning(10, "30d"), "Number 10 by page views in the last 30 days");
  for (const w of ["24h", "7d", "30d"] as const) {
    assert.ok(trendMeaning(4, w).endsWith(trendSpan(w)), "the window is trendSpan's, as the map's legend and its pins say it");
    assert.ok(trendWords(4, w).endsWith(trendSpan(w)));
    // Nothing invented: a rank and a window, never a count, an urgency or a booking word.
    for (const said of [trendChip(4), trendMeaning(4, w)]) assert.doesNotMatch(said, /book|hot|fast|hurry|sell|popular|\d+ views|[—–]/i, said);
  }
});

test("the map's functions are one copy: lib/map/trending.ts hands out lib/map/trendWire.ts's own", () => {
  for (const name of ["parseTrending", "parseTrendWindow", "enoughTrending", "trendRank", "trendSpan", "trendLegend", "trendWords", "isTrendWindow"] as const) {
    assert.equal(map[name], wire[name], name);
  }
  assert.equal(map.TRENDING_MIN_TURFS, 5);
  assert.equal(map.TRENDING_TOP, 10);
});

test("trendNow: the route's answer as /map reads it, and none at all under five turfs", () => {
  const t = trendNow(answer("7d"), T0);
  assert.equal(t.at, T0);
  assert.equal(t.window, "7d");
  assert.deepEqual([...t.ranks], [["turf-up-baner", 1], [T(2), 2], ["kings-turf-nashik", 3], ["goal-arena-hyderabad", 4], ["sixer-box-mumbai", 5], ["striker-turf-delhi", 6]]);
  assert.equal(trendNow(answer("7d", 4), T0).ranks.size, 0, "four trending turfs is not enough to call anything trending");
  assert.equal(trendNow(answer("30d", 5), T0).ranks.size, 5);
  for (const junk of [null, undefined, "", 7, [], {}, { trending: "x" }, { error: "unavailable" }, { window: "1y", trending: [{ k: "a", r: 1 }] }]) {
    const none = trendNow(junk, T0);
    assert.equal(none.ranks.size, 0);
    assert.equal(none.window, "24h");
  }
  // A count, if one ever came along, goes no further than the parse.
  const withCount = { window: "7d", trending: answer().trending.map((x) => ({ ...x, views: 999 })) };
  assert.equal(JSON.stringify(trendNow(withCount, T0).list).includes("999"), false);
  assert.equal(keepText(trendNow(withCount, T0)).includes("999"), false);
  assert.equal(noTrend(T0).ranks.size, 0);
});

test("a turf is matched by the key the route sends: its slug, else its id", () => {
  const t = trendNow(answer(), T0);
  assert.equal(trendRankOf(t, { id: T(1), slug: "turf-up-baner" }), 1, "a list card or a turf page: the slug");
  assert.equal(trendRankOf(t, { id: T(2), slug: null }), 2, "a turf with no slug: its id");
  assert.equal(trendRankOf(t, { id: T(2) }), 2);
  assert.equal(trendRankOf(t, { id: "kings-turf-nashik", slug: "kings-turf-nashik" }), 3, "a map card: id and slug are both the key");
  assert.equal(trendRankOf(t, { id: T(9), slug: "not-trending" }), null);
  assert.equal(trendRankOf(t, { id: T(1), slug: null }), null, "the route names a turf with a slug by the slug only");
  assert.equal(trendRankOf(t, {}), null);
  assert.equal(trendRankOf(null, { id: T(1), slug: "turf-up-baner" }), null, "nothing read yet");
  assert.equal(trendRankOf(noTrend(T0), { id: T(1), slug: "turf-up-baner" }), null);
});

test("trendCard: TurfCard's props, the rank and the window as /map's cards get them", () => {
  const t = trendNow(answer("30d"), T0);
  assert.deepEqual(trendCard(t, TURFS[3]), { trendRank: 4, trendOver: "the last 30 days" });
  assert.deepEqual(trendCard(trendNow(answer("24h"), T0), TURFS[0]), { trendRank: 1, trendOver: "the last 24 hours" });
  assert.deepEqual(trendCard(t, { id: T(9), slug: "not-trending" }), { trendRank: null });
  assert.deepEqual(trendCard(null, TURFS[0]), { trendRank: null }, "the server's cards and the first paint: no label");
});

test("the kept answer: reused for 10 minutes, then not; a broken or stale one is read again", () => {
  const text = keepText(trendNow(answer("7d"), T0));
  const back = readKept(text, T0 + 9 * MIN);
  assert.ok(back);
  assert.equal(back.at, T0);
  assert.equal(back.window, "7d");
  assert.equal(trendRankOf(back, TURFS[2]), 3);
  assert.equal(TREND_KEEP_MS, 10 * MIN);
  assert.ok(readKept(text, T0 + TREND_KEEP_MS - 1));
  assert.equal(readKept(text, T0 + TREND_KEEP_MS), null, "ten minutes old: stale");
  assert.equal(readKept(text, T0 + 3 * 3_600_000), null);
  assert.equal(readKept(text, T0 - 1), null, "kept at a time ahead of the clock (the clock went back)");
  for (const broken of [null, undefined, "", "{", "null", "[]", "7", '"x"', "{}", '{"at":"now"}', '{"at":null,"window":"7d","trending":[]}', `{"window":"7d","trending":[]}`]) {
    assert.equal(readKept(broken, T0), null, String(broken));
  }
  // The right shape with junk in it: read as the route's answer is, so junk rows are dropped and under five is none.
  const junk = JSON.stringify({ at: T0, window: "7d", trending: [...answer().trending.slice(0, 5), { k: "", r: 1 }, { k: "x", r: 99, y: 1, x: 1 }, { k: "y", r: 2 }] });
  assert.equal(readKept(junk, T0)?.ranks.size, 5);
  const few = JSON.stringify({ at: T0, window: "7d", trending: answer().trending.slice(0, 4) });
  assert.equal(readKept(few, T0)?.ranks.size, 0);
  // "Nobody is trending" is an answer too, and kept as long.
  assert.equal(readKept(keepText(noTrend(T0)), T0 + MIN)?.ranks.size, 0);
  assert.equal(trendFresh(null, T0), false);
  assert.equal(trendFresh(noTrend(T0), T0), true);
});

test("where it never shows: the admin, myTapturf, an owner's report, the email pages", () => {
  for (const p of ["/admin", "/admin/people", "/my", "/my/turf/abc", "/MY/turf/abc", "/report/abcdef", "/email/off", "/email"]) assert.equal(trendPath(p), false, p);
  for (const p of ["/", "/turfs", "/turf/turf-up-baner", "/pune", "/pune/football", "/sport/football", "/turf-near-me", "/map", "/mysore", "/emails", "/reporting"]) assert.equal(trendPath(p), true, p);
});

test("one page: nothing is asked before the page is idle, then once, however many cards want it", async () => {
  const p = page();
  assert.equal(p.reader.now(), null, "the first paint knows nothing");
  for (let i = 0; i < 40; i++) p.reader.want();
  assert.equal(p.state.gets, 0, "not before the page is idle and on screen");
  assert.equal(p.state.idle.length, 1, "one wait, not one per card");
  await p.idle();
  assert.equal(p.state.gets, 1);
  assert.equal(p.state.changes, 1, "everything on the page is told once");
  const t = p.reader.now();
  assert.equal(trendRankOf(t, TURFS[0]), 1);
  assert.equal(p.reader.now(), t, "the same object until a read replaces it");
  for (let i = 0; i < 40; i++) p.reader.want();
  await p.idle();
  assert.equal(p.state.gets, 1);
});

test("five turf pages in one tab: one request in 10 minutes, the next when it is due", async () => {
  const store = new Map<string, string>();
  const first = page({ store });
  first.reader.want();
  await first.idle();
  assert.equal(first.state.gets, 1);
  let gets = first.state.gets;
  // Four more pages, each a new document with the tab's storage, minutes apart.
  for (let i = 1; i <= 4; i++) {
    const next = page({ store, path: `/turf/${TURFS[i].slug ?? TURFS[i].id}` });
    next.state.now = T0 + i * 2 * MIN;
    assert.equal(trendRankOf(next.reader.now(), TURFS[i]), i + 1, "known at once from the tab's storage");
    next.reader.want();
    await next.idle();
    gets += next.state.gets;
  }
  assert.equal(gets, 1, "five pages, one request");
  const late = page({ store });
  late.state.now = T0 + TREND_KEEP_MS;
  assert.equal(late.reader.now(), null, "a stale answer is not shown by a new page");
  late.reader.want();
  await late.idle();
  assert.equal(late.state.gets, 1, "ten minutes on: read again");
  assert.equal(readKept(store.get("k"), late.state.now)?.at, late.state.now);
});

test("one long-lived page: the answer stays on screen past 10 minutes and the next want refreshes it", async () => {
  const p = page();
  p.reader.want();
  await p.idle();
  const old = p.reader.now();
  p.state.now = T0 + 11 * MIN;
  p.state.body = () => answer("24h");
  assert.equal(p.reader.now(), old, "nothing flickers off while it waits");
  p.reader.want();
  p.reader.want();
  await p.idle();
  assert.equal(p.state.gets, 2);
  assert.equal(p.reader.now()?.window, "24h");
  assert.equal(p.state.changes, 2);
});

test("storage blocked: kept in memory, still one request per page in 10 minutes, and nothing throws", async () => {
  const p = page({ blocked: true });
  assert.equal(p.reader.now(), null);
  p.reader.want();
  await p.idle();
  assert.equal(p.state.gets, 1);
  assert.equal(trendRankOf(p.reader.now(), TURFS[0]), 1);
  p.state.now = T0 + 5 * MIN;
  p.reader.want();
  await p.idle();
  assert.equal(p.state.gets, 1);
  assert.equal(p.store.size, 0);
});

test("a broken kept answer is read again, and replaced", async () => {
  const store = new Map([["k", '{"at":"yesterday","trending":"lots"']]);
  const p = page({ store });
  assert.equal(p.reader.now(), null);
  p.reader.want();
  await p.idle();
  assert.equal(p.state.gets, 1);
  assert.equal(readKept(store.get("k"), T0)?.ranks.size, 6);
});

test("a failed read is nobody trending: nothing shows, nothing throws, and it is not asked again for 10 minutes", async () => {
  const store = new Map<string, string>();
  const p = page({ store });
  p.state.fail = true;
  p.reader.want();
  await p.idle();
  assert.equal(p.state.gets, 1);
  assert.equal(p.reader.now()?.ranks.size, 0);
  assert.deepEqual(trendCard(p.reader.now(), TURFS[0]), { trendRank: null });
  p.reader.want();
  await p.idle();
  assert.equal(p.state.gets, 1);
  // The next page in the tab does not ask a route that is down either.
  const next = page({ store });
  next.state.now = T0 + 4 * MIN;
  next.state.fail = true;
  next.reader.want();
  await next.idle();
  assert.equal(next.state.gets, 0);
  // Ten minutes on it is asked again, and a good answer shows.
  const later = page({ store });
  later.state.now = T0 + TREND_KEEP_MS + 1;
  later.reader.want();
  await later.idle();
  assert.equal(later.state.gets, 1);
  assert.equal(trendRankOf(later.reader.now(), TURFS[1]), 2);
});

test("a read cut off by the page leaving is not kept as nobody trending", async () => {
  const store = new Map<string, string>();
  const p = page({ store });
  p.state.fail = true;
  p.state.leaving = true;
  p.reader.want();
  await p.idle();
  assert.equal(store.size, 0, "the next page reads it itself");
  const next = page({ store });
  next.reader.want();
  await next.idle();
  assert.equal(next.state.gets, 1);
  assert.equal(trendRankOf(next.reader.now(), TURFS[0]), 1);
});

test("an empty answer (fewer than five trending) is kept like any other: nothing shows and nothing is asked again", async () => {
  const store = new Map<string, string>();
  const p = page({ store, route: () => answer("30d", 4) });
  p.reader.want();
  await p.idle();
  assert.equal(p.reader.now()?.ranks.size, 0);
  const next = page({ store, route: () => answer("30d", 4) });
  next.state.now = T0 + MIN;
  next.reader.want();
  await next.idle();
  assert.equal(next.state.gets, 0);
  assert.equal(trendRankOf(next.reader.now(), TURFS[0]), null);
});

test("never on the quiet pages, never for a crawler: no read, nothing known", async () => {
  const store = new Map([["k", keepText(trendNow(answer(), T0))]]);
  for (const path of ["/admin", "/my/turf/abc", "/report/abcdef", "/email/off"]) {
    const p = page({ store, path });
    assert.equal(p.reader.now(), null, path);
    p.reader.want();
    await p.idle();
    assert.equal(p.state.gets, 0, path);
  }
  const bot = page({ bot: true });
  bot.reader.want();
  await bot.idle();
  assert.equal(bot.state.gets, 0);
  assert.equal(bot.reader.now(), null);
});

test("a browser that cannot wait for idle, or a listener that throws, never breaks the page", async () => {
  const p = page();
  const reader = createTrendReader({
    now: () => T0,
    load: () => null,
    save: () => undefined,
    get: async () => answer(),
    later: () => {
      throw new Error("no idle callback");
    },
    allowed: () => true,
  });
  assert.doesNotThrow(() => reader.want());
  assert.equal(reader.now(), null);
  let told = 0;
  p.reader.subscribe(() => {
    throw new Error("a card that fell over");
  });
  const off = p.reader.subscribe(() => told++);
  p.reader.want();
  await p.idle();
  assert.equal(told, 1);
  off();
  p.state.now = T0 + TREND_KEEP_MS;
  p.reader.want();
  await p.idle();
  assert.equal(told, 1, "a card that is gone is not told");
});
