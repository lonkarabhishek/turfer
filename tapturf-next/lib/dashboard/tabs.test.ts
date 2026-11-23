import { test } from "node:test";
import assert from "node:assert/strict";
import { ME_TABS, PHONE_TABS, WIDE_ONLY, badgeText, countWord, meTab, meTabHref } from "./tabs";
import { ALERTS_MAX, ALERTS_PAGE, alertsLimit, alertsMerge, alertsNext, alertsPage, unreadLess } from "./alerts";
import { EMPTY_GAMES, GAMES_VIEWS, VIEW_LABEL, YOU_HOST, allGames, gamesOf, splitGames, viewLabel } from "./games";

test("the Me tabs: their order, names and keys", () => {
  assert.deepEqual(ME_TABS.map((t) => [t.key, t.label]), [["games", "Games"], ["requests", "Requests"], ["matches", "Matches"], ["notifications", "Alerts"], ["profile", "Profile"], ["passport", "Passport"]]);
  // A phone's row: five, Matches between Requests and Alerts, Profile last; the Passport is the card's on a phone.
  assert.deepEqual(PHONE_TABS.map((t) => t.label), ["Games", "Requests", "Matches", "Alerts", "Profile"]);
  assert.deepEqual(WIDE_ONLY, ["passport"]);
  // Every key the site already links to still opens its tab, and the new one has its own.
  for (const key of ["games", "requests", "notifications", "profile", "passport", "matches"]) assert.equal(meTab(key), key);
  for (const bad of [null, undefined, "", "Matches", "alerts", "tournaments", "games ", "profile#username"]) assert.equal(meTab(bad), null, `"${bad}" is no tab: the first one shows`);
  assert.equal(new Set(ME_TABS.map((t) => t.key)).size, ME_TABS.length);
  assert.equal(meTabHref("matches"), "/dashboard?tab=matches");
  assert.equal(meTabHref("notifications"), "/dashboard?tab=notifications");
  // A label fits a fifth of a 320 px row: short words only.
  for (const t of PHONE_TABS) assert.ok(t.label.length <= 8, t.label);
});

test("the Me tabs: counts", () => {
  assert.equal(countWord("games"), "upcoming");
  assert.equal(countWord("requests"), "pending");
  assert.equal(countWord("matches"), "live now", "Matches counts what is live right now, never a total");
  assert.equal(countWord("notifications"), "unread");
  assert.equal(badgeText(0), null, "nothing live: no badge");
  assert.equal(badgeText(null), null);
  assert.equal(badgeText(undefined), null);
  assert.equal(badgeText(-2), null);
  assert.equal(badgeText(1), "1");
  assert.equal(badgeText(99), "99");
  assert.equal(badgeText(100), "99+");
});

type N = { id: string; is_read: boolean };
const rows = (n: number, read: (i: number) => boolean = () => false): N[] => Array.from({ length: n }, (_, i) => ({ id: `n${i + 1}`, is_read: read(i) }));

test("alerts: ten at a time, then the next ten", () => {
  assert.equal(ALERTS_PAGE, 10);
  assert.equal(ALERTS_MAX, 100);
  // The first read asks for eleven: ten to show, one to know whether to offer more.
  assert.equal(alertsLimit(10), 11);
  let page = alertsPage(rows(11), 10);
  assert.deepEqual([page.shown.length, page.more, page.capped], [10, true, false]);
  assert.deepEqual(page.shown.map((n) => n.id), rows(10).map((n) => n.id), "the newest ten, in the order they came");
  // Exactly ten, or fewer: all of them, and no button.
  assert.deepEqual([alertsPage(rows(10), 10).shown.length, alertsPage(rows(10), 10).more], [10, false]);
  assert.deepEqual([alertsPage(rows(3), 10).shown.length, alertsPage(rows(3), 10).more], [3, false]);
  assert.deepEqual(alertsPage([], 10), { shown: [], more: false, capped: false });
  // Show more: the next ten.
  assert.equal(alertsNext(10), 20);
  assert.equal(alertsLimit(20), 21);
  page = alertsPage(rows(21), 20);
  assert.deepEqual([page.shown.length, page.more], [20, true]);
  page = alertsPage(rows(17), 20);
  assert.deepEqual([page.shown.length, page.more], [17, false], "the last page: the button goes");
  // Up to the read's own ceiling, and no further.
  let want = 10;
  const asked: number[] = [];
  for (let i = 0; i < 20; i++) {
    asked.push(alertsLimit(want));
    want = alertsNext(want);
  }
  assert.equal(want, 100);
  assert.deepEqual(asked.slice(0, 10), [11, 21, 31, 41, 51, 61, 71, 81, 91, 100]);
  assert.ok(asked.every((n) => n <= ALERTS_MAX), "never asks for more than the read gives");
  page = alertsPage(rows(100), 100);
  assert.deepEqual([page.shown.length, page.more, page.capped], [100, false, true], "at the ceiling: no button, and it says these are the latest 100");
  assert.deepEqual([alertsPage(rows(94), 100).more, alertsPage(rows(94), 100).capped], [false, false], "fewer than the ceiling: that is all of them");
  assert.equal(alertsLimit(0), 2);
});

test("alerts: a longer read keeps what was read here, and the unread total is the server's", () => {
  // n2 was marked read on this page; the longer read was asked before that landed and still says unread.
  const had = rows(10, (i) => i === 1);
  const fresh = rows(21);
  const merged = alertsMerge(had, fresh);
  assert.equal(merged.length, 21);
  assert.equal(merged[1].is_read, true, "stays read");
  assert.equal(merged.filter((n) => n.is_read).length, 1);
  assert.deepEqual(merged.map((n) => n.id), fresh.map((n) => n.id), "the server's order");
  // A new alert that arrived meanwhile comes first; nothing is listed twice.
  const newer = [{ id: "new", is_read: false }, ...rows(20), ...rows(1)];
  assert.deepEqual(alertsMerge(had, newer).map((n) => n.id), ["new", ...rows(20).map((n) => n.id)]);
  // One the server says is read is read, whatever this page thought.
  assert.equal(alertsMerge(rows(2), rows(2, () => true)).every((n) => n.is_read), true);
  // The unread total is never a count of the rows on screen: 37 unread with ten showing is 37, and 36 after one is read.
  assert.equal(unreadLess(37), 36);
  assert.equal(unreadLess(1), 0);
  assert.equal(unreadLess(0), 0, "never below zero");
});

type G = { id: string; date: string; start_time: string; over?: boolean };
const g = (id: string, date: string, over = false): G => ({ id, date, start_time: "19:00:00", over });

test("my games: All counts each game once", () => {
  assert.deepEqual(GAMES_VIEWS, ["all", "created", "joined"], "All is the first pill");
  assert.deepEqual(VIEW_LABEL, { all: "All", created: "Hosted", joined: "Joined" });
  // A host is a player of their own game: h1 and h2 are in the joined list too.
  const hosted = [g("h1", "2026-11-28"), g("h2", "2026-11-10", true)];
  const joined = [g("h1", "2026-11-28"), g("j1", "2026-11-25"), g("h2", "2026-11-10", true), g("j2", "2026-11-01", true)];
  assert.deepEqual(allGames(hosted, joined).map((x) => x.id), ["h1", "h2", "j1", "j2"]);
  assert.equal(viewLabel("all", hosted, joined), "All (4)", "not 6: each game once");
  assert.equal(viewLabel("created", hosted, joined), "Hosted (2)");
  assert.equal(viewLabel("joined", hosted, joined), "Joined (4)");
  assert.deepEqual(gamesOf("created", hosted, joined), hosted);
  assert.deepEqual(gamesOf("joined", hosted, joined), joined);
  assert.equal(viewLabel("all", [], []), "All (0)");
  // The same order the two lists always had: upcoming by the soonest, past by the latest.
  const { upcoming, past } = splitGames(allGames(hosted, joined), (x) => !!x.over);
  assert.deepEqual(upcoming.map((x) => x.id), ["j1", "h1"]);
  assert.deepEqual(past.map((x) => x.id), ["h2", "j2"]);
  assert.equal(YOU_HOST, "You host");
  assert.deepEqual(Object.keys(EMPTY_GAMES).sort(), ["all", "created", "joined"]);
  for (const e of Object.values(EMPTY_GAMES)) assert.doesNotMatch(`${e.title} ${e.line}`, /\bbook/i);
});
