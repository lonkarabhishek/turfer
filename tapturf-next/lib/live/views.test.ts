import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIVE_LINKS_KEY,
  SEEN_MAX,
  UNIQUES_PER_NET_LINK,
  VIEWS_PER_MIN,
  VIEWS_PER_NET_LINK,
  VIEW_AGAIN_MS,
  VIEW_GAP_MS,
  VIEW_LINK_WINDOW_MS,
  VIEW_TAG_RE,
  createViewLimiter,
  decideView,
  isBotAgent,
  isPrefetch,
  newViewTag,
  parseViewBody,
  planView,
  readSeen,
  scorerHolds,
  toViewCount,
  unseeView,
  viewDay,
  viewFromPage,
  viewsLabel,
  type SeenNote,
} from "./views";

const CODE = "k7m2q9x4a1b3";
const OTHER = "bbbbbbbbbbbb";
// 1 Nov 2026, 6:30 pm in India (13:00 UTC).
const T = Date.parse("2026-11-01T13:00:00Z");
const MIN = 60_000;
const ANDROID = "Mozilla/5.0 (Linux; Android 13; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1";

test("the day a unique view belongs to is India's", () => {
  assert.equal(viewDay(T), "2026-11-01");
  // 11:59 pm and 12:01 am in India.
  assert.equal(viewDay(Date.parse("2026-11-01T18:29:00Z")), "2026-11-01");
  assert.equal(viewDay(Date.parse("2026-11-01T18:31:00Z")), "2026-11-02");
  assert.equal(viewDay(Date.parse("2026-10-31T19:00:00Z")), "2026-11-01", "after midnight there, still the 31st in UTC");
});

test("a browser's first view of a link is unique; opening it again soon is the same view", () => {
  const first = planView({}, CODE, T);
  assert.ok(first.send);
  assert.equal(first.unique, true);
  assert.deepEqual(first.next, { [CODE]: { d: "2026-11-01", at: T } });
  // A reload, Back, a tab switch.
  assert.deepEqual(planView(first.next, CODE, T + 1), { send: false });
  assert.deepEqual(planView(first.next, CODE, T + VIEW_AGAIN_MS - 1), { send: false });
  // Back after half an hour the same day: another view, not another viewer.
  const later = planView(first.next, CODE, T + VIEW_AGAIN_MS);
  assert.ok(later.send);
  assert.equal(later.unique, false);
  // The next day in India: unique again.
  const tomorrow = planView(first.next, CODE, Date.parse("2026-11-01T18:31:00Z"));
  assert.ok(tomorrow.send && tomorrow.unique);
  // Another link the same minute is its own view.
  const other = planView(first.next, OTHER, T + 1);
  assert.ok(other.send && other.unique);
  assert.deepEqual(Object.keys(other.next).sort(), [OTHER, CODE].sort());
});

test("a clock that went back counts again; the note keeps the latest links, two days at most", () => {
  const ahead: SeenNote = { [CODE]: { d: "2026-11-01", at: T + 10 * MIN } };
  const back = planView(ahead, CODE, T);
  assert.ok(back.send);
  assert.equal(back.unique, false, "same day");
  const many: SeenNote = {};
  for (let i = 0; i < SEEN_MAX + 10; i++) many[`a${String(i).padStart(11, "0")}`] = { d: "2026-11-01", at: T - i * MIN };
  const kept = planView(many, CODE, T + 1);
  assert.ok(kept.send);
  assert.equal(Object.keys(kept.next).length, SEEN_MAX);
  assert.ok(CODE in kept.next, "the link just counted stays");
  assert.ok(!(`a${String(SEEN_MAX + 9).padStart(11, "0")}` in kept.next), "the oldest go");
  const old = planView({ [OTHER]: { d: "2026-10-29", at: T - 49 * 60 * MIN } }, CODE, T);
  assert.ok(old.send);
  assert.deepEqual(Object.keys(old.next), [CODE], "a link counted over two days ago leaves the note");
});

test("the note as stored: anything malformed is left out", () => {
  assert.deepEqual(readSeen(null), {});
  assert.deepEqual(readSeen("not json"), {});
  assert.deepEqual(readSeen("[1,2]"), {});
  assert.deepEqual(
    readSeen(JSON.stringify({ [CODE]: { d: "2026-11-01", at: T }, BAD: { d: "2026-11-01", at: T }, [OTHER]: { d: "yesterday", at: T }, cccccccccccc: { d: "2026-11-01", at: "x" } })),
    { [CODE]: { d: "2026-11-01", at: T } },
  );
});

test("the scorer's browser holds the link, on or off: never counted", () => {
  const links = JSON.stringify({ v: 1, links: { m1: { code: CODE, secret: "ab".repeat(32), on: false, rev: 1, sentRev: 1, createdAt: 1 } } });
  assert.equal(scorerHolds(links, CODE), true);
  assert.equal(scorerHolds(links, OTHER), false);
  assert.equal(scorerHolds(null, CODE), false);
  assert.equal(scorerHolds("{oops", CODE), false);
  assert.equal(scorerHolds(JSON.stringify({ v: 1 }), CODE), false);
  assert.equal(LIVE_LINKS_KEY, "tapturf_live_links_v1", "the key the scorer keeps its links under");
});

test("bots, link previews and automated browsers are not viewers; phones and their in-app browsers are", () => {
  for (const ua of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "WhatsApp/2.23.20.0 A",
    "TelegramBot (like TwitterBot)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0 Mobile Safari/537.36 Chrome-Lighthouse",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "curl/8.5.0",
    "python-requests/2.32.3",
    "node-fetch/1.0 (+https://github.com/bitinn/node-fetch)",
    "",
    "Mozilla",
  ]) {
    assert.equal(isBotAgent(ua), true, ua);
  }
  for (const ua of [
    ANDROID,
    IPHONE,
    // Cubot is a phone maker.
    "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    // In-app browsers: Instagram, Facebook, Telegram on Android.
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0.0.22.109",
    "Mozilla/5.0 (Linux; Android 14; 2201117TI Build/UKQ1.231003.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/485.0.0.0;]",
    "Mozilla/5.0 (Linux; Android 13; RMX3630) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36 Telegram-Android/11.2.2",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  ]) {
    assert.equal(isBotAgent(ua), false, ua);
  }
});

test("prefetches and prerenders are not views", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  assert.equal(isPrefetch(h({ "sec-purpose": "prefetch" })), true);
  assert.equal(isPrefetch(h({ "sec-purpose": "prefetch;prerender" })), true);
  assert.equal(isPrefetch(h({ purpose: "prefetch" })), true);
  assert.equal(isPrefetch(h({ "x-moz": "prefetch" })), true);
  assert.equal(isPrefetch(h({})), false);
  assert.equal(isPrefetch(h({ "user-agent": ANDROID })), false);
});

test("what the follower page decides when it is on screen", () => {
  const base = { code: CODE, now: T, ua: ANDROID, webdriver: false, links: null, seen: null };
  const first = decideView(base);
  assert.ok(first);
  assert.equal(first.unique, true);
  assert.equal(decideView({ ...base, seen: JSON.stringify(first.next) }), null, "reloaded a moment later: not again");
  const later = decideView({ ...base, now: T + VIEW_AGAIN_MS, seen: JSON.stringify(first.next) });
  assert.equal(later?.unique, false, "back later the same day: a view, not a viewer");
  assert.equal(decideView({ ...base, webdriver: true }), null, "an automated browser");
  assert.equal(decideView({ ...base, ua: "Mozilla/5.0 (compatible; Googlebot/2.1)" }), null, "a crawler that runs the page");
  const links = JSON.stringify({ v: 1, links: { b1: { code: CODE, secret: "cd".repeat(32), on: true, rev: 5, sentRev: 5, createdAt: 1 } } });
  assert.equal(decideView({ ...base, links }), null, "the scorer's own browser");
  assert.ok(decideView({ ...base, links, code: OTHER }), "the scorer following someone else's link counts");
  assert.equal(decideView({ ...base, seen: "{broken" })?.unique, true, "a broken note: a fresh one");
});

test("the server's per-instance limits: the same view within seconds, a network's minute", () => {
  let now = T;
  const take = createViewLimiter(() => now);
  assert.deepEqual(take("net1", "who1", CODE, true), { count: true, unique: true });
  // The same view sent again at once: not counted.
  assert.deepEqual(take("net1", "who1", CODE, true), { count: false, why: "again" });
  now += VIEW_GAP_MS - 1;
  assert.deepEqual(take("net1", "who1", CODE, false), { count: false, why: "again" });
  assert.deepEqual(take("net1", "who1", OTHER, true), { count: true, unique: true }, "another link is its own");
  // Another phone behind the same carrier address, even one of the same model (its own tag), is counted.
  assert.deepEqual(take("net1", "who2", CODE, true), { count: true, unique: true });
  now += 1;
  assert.deepEqual(take("net1", "who1", CODE, false), { count: true, unique: false }, "past the gap");

  // A network's minute, across links.
  now = T;
  const flood = createViewLimiter(() => now);
  const links = Array.from({ length: Math.ceil(VIEWS_PER_MIN / VIEWS_PER_NET_LINK) + 1 }, (_, i) => `l${String(i).padStart(11, "0")}`);
  for (let i = 0; i < VIEWS_PER_MIN; i++) assert.equal(flood("busy", `w${i}`, links[Math.floor(i / VIEWS_PER_NET_LINK)], false).count, true, `view ${i}`);
  assert.deepEqual(flood("busy", "wlast", links[links.length - 1], false), { count: false, why: "slow" });
  assert.equal(flood("calm", "c0", CODE, false).count, true, "other networks go on");
  now += 60_000;
  assert.equal(flood("busy", "wlast", links[links.length - 1], false).count, true, "the next minute");
});

test("one network and one link: a script changing its agent or tag on every view counts VIEWS_PER_NET_LINK in ten minutes", () => {
  let now = T;
  const take = createViewLimiter(() => now);
  // A ground's Wi-Fi: twenty people opening a just-shared link within seconds, every one with the same phone, each its own view.
  for (let i = 0; i < VIEWS_PER_NET_LINK; i++) assert.deepEqual(take("ground", `tag${i}`, CODE, true), { count: true, unique: true }, `person ${i}`);
  assert.deepEqual(take("ground", "one-more", CODE, true), { count: false, why: "many" });
  // Two hundred more, a second apart, each a new agent or tag (the reviewer's rotating agent): none counted.
  let counted = 0;
  for (let i = 0; i < 200; i++) {
    now += 1_000;
    const r = take("ground", `rot${i}`, CODE, true);
    if (r.count) counted++;
    else assert.equal(r.why, "many");
  }
  assert.equal(counted, 0);
  assert.equal(take("ground", "rot-y", OTHER, true).count, true, "another link from the same network is its own");
  assert.equal(take("home", "h1", CODE, true).count, true, "another network is its own");
  now = T + VIEW_LINK_WINDOW_MS;
  assert.equal(take("ground", "later", CODE, true).count, true, "the next ten minutes");
});

test("unique is believed for UNIQUES_PER_NET_LINK of a link per network a day; past it a view counts, as not unique", () => {
  let now = T;
  const take = createViewLimiter(() => now);
  let uniques = 0;
  let views = 0;
  // A view a minute for half a day from one address, every one claiming unique.
  for (let i = 0; i < 12 * 60; i++) {
    const r = take("nat", `t${i}`, CODE, true);
    if (r.count) {
      views++;
      if (r.unique) uniques++;
    }
    now += 60_000;
  }
  assert.equal(uniques, UNIQUES_PER_NET_LINK);
  assert.ok(views > UNIQUES_PER_NET_LINK, "views still count");
  assert.deepEqual(take("other-net", "o1", CODE, true), { count: true, unique: true });
  // A view that is not unique never uses one up.
  const fresh = createViewLimiter(() => now);
  for (let i = 0; i < 5; i++) assert.equal(fresh("n", `x${i}`, CODE, false).count, true);
  assert.deepEqual(fresh("n", "y", CODE, true), { count: true, unique: true });
});

test("only this site's own page counts a view: JSON, same origin", () => {
  const URL_ = "https://tapturf.in/api/live/k7m2q9x4a1b3/views";
  const h = (o: Record<string, string>) => new Headers({ "content-type": "application/json", ...o });
  assert.equal(viewFromPage(h({ "sec-fetch-site": "same-origin" }), URL_), true, "the follower hook");
  assert.equal(viewFromPage(h({ "sec-fetch-site": "same-origin", "content-type": "application/json; charset=utf-8" }), URL_), true);
  assert.equal(viewFromPage(h({ origin: "https://tapturf.in", host: "tapturf.in" }), URL_), true, "an older browser: no Sec-Fetch-Site, its Origin");
  assert.equal(viewFromPage(h({ origin: "http://localhost:3000", host: "localhost:3000" }), "http://localhost:3000/api/live/x/views"), true);
  for (const bad of <Record<string, string>[]>[
    { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
    // The reviewer's no-cors POST: a simple request another site's page may send without asking.
    { "sec-fetch-site": "cross-site", origin: "https://evil.example", "content-type": "text/plain;charset=UTF-8" },
    { "sec-fetch-site": "same-site", origin: "https://www.tapturf.in" },
    { "sec-fetch-site": "none" },
    { origin: "https://evil.example", host: "tapturf.in" },
    { origin: "null", host: "tapturf.in" },
    {},
    { "sec-fetch-site": "same-origin", "content-type": "text/plain" },
    { "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" },
    { "sec-fetch-site": "same-origin", "content-type": "application/jsonp" },
  ]) {
    assert.equal(viewFromPage(h(bad), URL_), false, JSON.stringify(bad));
  }
  const noType = new Headers({ "sec-fetch-site": "same-origin" });
  assert.equal(viewFromPage(noType, URL_), false, "no content type");
});

test("a view the server did not count is taken back from the note, so the next visit tries again", () => {
  const before: SeenNote = { [OTHER]: { d: "2026-11-01", at: T - 60 * MIN } };
  const first = planView(before, CODE, T);
  assert.ok(first.send && first.unique);
  const back = unseeView(first.next, CODE, T, undefined);
  assert.deepEqual(back, before, "never counted: as if it had not been opened");
  const again = planView(back, CODE, T + 1);
  assert.ok(again.send && again.unique, "the next visit is a view again, and unique still");
  // Counted earlier today, then a later view dropped: back to the earlier one, so not unique next time.
  const earlier: SeenNote = { [CODE]: { d: "2026-11-01", at: T - VIEW_AGAIN_MS } };
  const later = planView(earlier, CODE, T);
  assert.ok(later.send && !later.unique);
  assert.deepEqual(unseeView(later.next, CODE, T, earlier[CODE]), earlier);
  // Another tab counted since: its note stands.
  const otherTab: SeenNote = { [CODE]: { d: "2026-11-01", at: T + 5_000 } };
  assert.deepEqual(unseeView(otherTab, CODE, T, undefined), otherTab);
});

test("a view's tag is random and carries nothing; the body keeps only a well formed one", () => {
  const tags = new Set(Array.from({ length: 50 }, () => newViewTag()));
  assert.equal(tags.size, 50);
  for (const t of tags) assert.match(t, VIEW_TAG_RE);
  assert.deepEqual(parseViewBody({ unique: true, v: "0123456789abcdef" }), { unique: true, tag: "0123456789abcdef" });
  for (const v of [undefined, "", "0123456789ABCDEF", "0123456789abcde", "0123456789abcdef0", 12, { a: 1 }]) assert.equal(parseViewBody({ unique: true, v })?.tag, null, String(v));
});

test("counts as the database answers them, and as the page says them", () => {
  assert.deepEqual(toViewCount({ r: "ok", views: 12, viewers: 5 }), { views: 12, viewers: 5 });
  assert.deepEqual(toViewCount({ r: "ok", views: 3, viewers: 9 }), { views: 3, viewers: 3 }, "viewers never past views");
  for (const bad of [null, "ok", { r: "none" }, { r: "unavailable" }, { r: "ok", views: -1, viewers: 0 }, { r: "ok", views: 1.5, viewers: 1 }, { r: "ok" }]) assert.equal(toViewCount(bad), null, JSON.stringify(bad));
  assert.equal(viewsLabel(1), "1 view");
  assert.equal(viewsLabel(0), "0 views");
  assert.equal(viewsLabel(1234), "1,234 views");
  assert.equal(viewsLabel(123456), "1,23,456 views");
  assert.deepEqual(parseViewBody({ unique: true }), { unique: true, tag: null });
  assert.deepEqual(parseViewBody({ unique: "yes" }), { unique: false, tag: null });
  assert.deepEqual(parseViewBody({}), { unique: false, tag: null });
  assert.equal(parseViewBody(null), null);
  assert.equal(parseViewBody([true]), null);
});
