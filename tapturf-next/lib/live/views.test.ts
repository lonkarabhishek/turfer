import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIVE_LINKS_KEY,
  SEEN_MAX,
  VIEWS_PER_MIN,
  VIEW_AGAIN_MS,
  VIEW_GAP_MS,
  createViewLimiter,
  decideView,
  isBotAgent,
  isPrefetch,
  parseViewBody,
  planView,
  readSeen,
  scorerHolds,
  toViewCount,
  viewDay,
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

test("the server's per-instance limits: a repeat within seconds, a network's minute", () => {
  let now = T;
  const take = createViewLimiter(() => now);
  assert.deepEqual(take("net1", "who1", CODE), { count: true });
  // The same browser again at once (a reload loop, a page that ignores its note): not counted.
  assert.deepEqual(take("net1", "who1", CODE), { count: false, why: "again" });
  now += VIEW_GAP_MS - 1;
  assert.deepEqual(take("net1", "who1", CODE), { count: false, why: "again" });
  assert.deepEqual(take("net1", "who1", OTHER), { count: true }, "another link is its own");
  // Another phone behind the same carrier address, even one of the same model, is counted.
  assert.deepEqual(take("net1", "who2", CODE), { count: true });
  now += 1;
  assert.deepEqual(take("net1", "who1", CODE), { count: true }, "past the gap");

  // A network's minute.
  now = T;
  const flood = createViewLimiter(() => now);
  for (let i = 0; i < VIEWS_PER_MIN; i++) assert.equal(flood("busy", `w${i}`, CODE).count, true);
  assert.deepEqual(flood("busy", "wlast", CODE), { count: false, why: "slow" });
  assert.equal(flood("calm", "c0", CODE).count, true, "other networks go on");
  now += 60_000;
  assert.equal(flood("busy", "wlast", CODE).count, true, "the next minute");
});

test("counts as the database answers them, and as the page says them", () => {
  assert.deepEqual(toViewCount({ r: "ok", views: 12, viewers: 5 }), { views: 12, viewers: 5 });
  assert.deepEqual(toViewCount({ r: "ok", views: 3, viewers: 9 }), { views: 3, viewers: 3 }, "viewers never past views");
  for (const bad of [null, "ok", { r: "none" }, { r: "unavailable" }, { r: "ok", views: -1, viewers: 0 }, { r: "ok", views: 1.5, viewers: 1 }, { r: "ok" }]) assert.equal(toViewCount(bad), null, JSON.stringify(bad));
  assert.equal(viewsLabel(1), "1 view");
  assert.equal(viewsLabel(0), "0 views");
  assert.equal(viewsLabel(1234), "1,234 views");
  assert.equal(viewsLabel(123456), "1,23,456 views");
  assert.deepEqual(parseViewBody({ unique: true }), { unique: true });
  assert.deepEqual(parseViewBody({ unique: "yes" }), { unique: false });
  assert.deepEqual(parseViewBody({}), { unique: false });
  assert.equal(parseViewBody(null), null);
  assert.equal(parseViewBody([true]), null);
});
