import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ANCHOR_TABS, MY_LIST_HREF, TURF_TABS, anchorOf, myLanding, tabParam, turfTabHref, turfView, type TurfTab } from "./turfTabs";
import { bannedCopy } from "../seo/defaults";

const ID = "aaaaaaaa-0000-4000-8000-000000000001";
const TWO = "bbbbbbbb-0000-4000-8000-000000000002";

test("the tabs: Slots first and the default, then Your page, then Analytics", () => {
  assert.deepEqual(TURF_TABS.map((t) => t.id), ["slots", "page", "analytics"]);
  assert.deepEqual(TURF_TABS.map((t) => t.label), ["Slots", "Your page", "Analytics"]);
  for (const t of TURF_TABS) assert.equal(bannedCopy(t.label), null, t.label);
});

test("tabParam: page and analytics; anything else is Slots", () => {
  assert.equal(tabParam("page"), "page");
  assert.equal(tabParam("analytics"), "analytics");
  assert.equal(tabParam(" Analytics "), "analytics");
  for (const v of [null, undefined, "", "slots", "stats", "edit", "x", "constructor", "__proto__"]) assert.equal(tabParam(v), "slots", String(v));
});

test("turfView: a known section decides the tab; else ?tab; else Slots", () => {
  const cases: [string, string, TurfTab, string | null][] = [
    ["", "", "slots", null],
    ["?tab=page", "", "page", null],
    ["?tab=analytics", "", "analytics", null],
    ["?tab=nope", "", "slots", null],
    ["?x=1&tab=analytics", "", "analytics", null],
    ["", "#slots", "slots", "slots"],
    ["", "#edit", "page", "edit"],
    ["", "#hours", "page", "hours"],
    ["", "#numbers", "page", "numbers"],
    ["", "#photos", "page", "photos"],
    ["", "#ground-size", "page", "ground-size"],
    ["", "#player-reports", "page", "player-reports"],
    ["?tab=analytics", "#hours", "page", "hours"],
    ["?tab=page", "#slots", "slots", "slots"],
    ["?tab=analytics", "#nope", "analytics", null],
    ["", "#", "slots", null],
    ["", "#%E0%A4", "slots", null],
    ["", "#constructor", "slots", null],
    ["", "hours", "page", "hours"],
  ];
  for (const [search, hash, tab, anchor] of cases) assert.deepEqual(turfView(search, hash), { tab, anchor }, `${search}${hash}`);
  assert.equal(anchorOf("#hours"), "hours");
  assert.equal(anchorOf("%23hours"), null, "a hash is read without its #, once");
  assert.equal(anchorOf(null), null);
});

test("turfTabHref: Slots has no ?tab; a section goes through its own tab; each link reads back as itself", () => {
  assert.equal(turfTabHref(ID, "slots"), `/my/turf/${ID}`);
  assert.equal(turfTabHref(ID, "page"), `/my/turf/${ID}?tab=page`);
  assert.equal(turfTabHref(ID, "analytics"), `/my/turf/${ID}?tab=analytics`);
  assert.equal(turfTabHref(ID, "page", "hours"), `/my/turf/${ID}?tab=page#hours`);
  assert.equal(turfTabHref(ID, "analytics", "numbers"), `/my/turf/${ID}?tab=page#numbers`, "the section's tab wins");
  assert.equal(turfTabHref(ID, "page", "slots"), `/my/turf/${ID}#slots`);
  assert.equal(turfTabHref(ID, "analytics", "nope"), `/my/turf/${ID}?tab=analytics`, "an unknown section is dropped");
  for (const t of TURF_TABS) {
    for (const a of [null, ...Object.keys(ANCHOR_TABS)]) {
      const href = turfTabHref(ID, t.id, a);
      const u = new URL(href, "https://www.tapturf.in");
      assert.equal(u.pathname, `/my/turf/${ID}`);
      assert.deepEqual(turfView(u.search, u.hash), { tab: a ? ANCHOR_TABS[a] : t.id, anchor: a }, href);
    }
  }
});

test("myLanding: one confirmed turf and nothing waiting opens its Slots tab", () => {
  const base = { signedIn: true, admin: false, claim: null, list: false };
  const one = [{ id: ID, status: "active" }];
  assert.equal(myLanding({ ...base, turfs: one }), `/my/turf/${ID}`);
  assert.equal(myLanding({ ...base, turfs: one, tab: "page" }), `/my/turf/${ID}?tab=page`, "/my?tab=page");
  assert.equal(myLanding({ ...base, turfs: one, tab: "analytics" }), `/my/turf/${ID}?tab=analytics`);
  assert.equal(myLanding({ ...base, turfs: one, hash: "#edit" }), `/my/turf/${ID}?tab=page#edit`, "/my#edit");
  assert.equal(myLanding({ ...base, turfs: one, tab: "page", hash: "#numbers" }), `/my/turf/${ID}?tab=page#numbers`);
  assert.equal(myLanding({ ...base, turfs: one, tab: "junk", hash: "#junk" }), `/my/turf/${ID}`);
});

test("myLanding: the list stays for a claim in progress, a waiting claim, 2+ turfs, none, the site owner, the list asked for, signed out", () => {
  const base = { signedIn: true, admin: false, claim: null, list: false };
  const active = { id: ID, status: "active" };
  assert.equal(myLanding({ ...base, turfs: [active], claim: ID }), null, "?claim= on their own turf: the claim flow as it is");
  assert.equal(myLanding({ ...base, turfs: [active], claim: TWO }), null, "?claim= on another turf");
  assert.equal(myLanding({ ...base, turfs: [{ id: ID, status: "pending" }] }), null, "a waiting claim");
  assert.equal(myLanding({ ...base, turfs: [active, { id: TWO, status: "pending" }] }), null, "one confirmed, one waiting");
  assert.equal(myLanding({ ...base, turfs: [active, { id: TWO, status: "active" }] }), null, "two turfs");
  assert.equal(myLanding({ ...base, turfs: [] }), null, "none yet: the claim search");
  assert.equal(myLanding({ ...base, admin: true, turfs: [active] }), null, "the site owner");
  assert.equal(myLanding({ ...base, list: true, turfs: [active] }), null, "the way back from a turf");
  assert.equal(myLanding({ ...base, signedIn: false, turfs: [active] }), null, "signed out");
  assert.equal(myLanding({ ...base, turfs: [{ id: ID, status: "revoked" }] }), null);
  assert.equal(myLanding({ ...base, turfs: [{ id: "", status: "active" }] }), null);
  assert.equal(MY_LIST_HREF, "/my?list=1");
});

// ── The links in the code: every in-page section link on myTapturf, and every link into /my with a section or a tab, lands on a known tab. ──

const ROOT = process.cwd();
function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(join(ROOT, p)).isDirectory()) files(p, out);
    else if (/\.(tsx?|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

test("every #section link in components/my is a known section, and every known section has its id there", () => {
  const my = files("components/my");
  const src = my.map((p) => [p, read(p)] as const);
  const linked = new Set<string>();
  for (const [p, s] of src) {
    for (const m of s.matchAll(/href(?:=|:\s*)["'`{]+#([A-Za-z0-9_-]+)/g)) {
      linked.add(m[1]);
      assert.ok(Object.prototype.hasOwnProperty.call(ANCHOR_TABS, m[1]), `${p}: #${m[1]} is in ANCHOR_TABS`);
    }
  }
  for (const want of ["hours", "numbers", "photos", "ground-size"]) assert.ok(linked.has(want), `the components link #${want}`);
  const all = src.map(([, s]) => s).join("\n");
  for (const id of Object.keys(ANCHOR_TABS)) assert.match(all, new RegExp(`\\bid=["{]?["'\`]?${id}["'\`]`), `an element has id="${id}"`);
});

test("every link into /my/turf or /my with a section or a tab names one that exists", () => {
  const all = [...files("components"), ...files("lib"), ...files("app")].filter((p) => !p.endsWith("lib/my/turfTabs.ts"));
  let seen = 0;
  for (const p of all) {
    const s = read(p);
    for (const m of s.matchAll(/\/my(?:\/turf\/[^"'`\s#?]*)?(\?[^"'`\s#]*)?#([A-Za-z0-9_-]+)/g)) {
      seen++;
      assert.ok(Object.prototype.hasOwnProperty.call(ANCHOR_TABS, m[2]), `${p}: ${m[0]}`);
    }
    for (const m of s.matchAll(/\/my(?:\/turf\/[^"'`\s?]*)?\?[^"'`\s]*\btab=([A-Za-z0-9_-]+)/g)) {
      seen++;
      assert.ok(TURF_TABS.some((t) => t.id === m[1]), `${p}: ${m[0]}`);
    }
  }
  assert.ok(seen >= 0);
});
