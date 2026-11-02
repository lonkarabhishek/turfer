import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// public/sw.js, run in a scope of its own with a stand-in for the worker's
// globals: which events it listens to (never fetch), what a push shows and
// where a tap goes.

const SOURCE = fs.readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");
const ORIGIN = "https://www.tapturf.in";

type Win = { url: string; focused: boolean; navigatedTo: string | null; messages: unknown[]; uncontrolled?: boolean };

function worker(windows: Win[] = []) {
  const listeners = new Map<string, (e: unknown) => void>();
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  let skipped = false;
  let claimed = false;
  const client = (w: Win) => ({
    get url() {
      return w.url;
    },
    postMessage: (m: unknown) => w.messages.push(JSON.parse(JSON.stringify(m))),
    focus: async () => {
      w.focused = true;
      return client(w);
    },
    navigate: async (u: string) => {
      if (w.uncontrolled) throw new TypeError("not controlled");
      w.navigatedTo = u;
      w.url = u;
      return client(w);
    },
  });
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn),
    skipWaiting: () => {
      skipped = true;
    },
    // Through JSON: objects made in the worker's scope have its own prototypes.
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options: JSON.parse(JSON.stringify(options)) }) },
    clients: {
      claim: async () => {
        claimed = true;
      },
      matchAll: async () => windows.map(client),
      openWindow: async (u: string) => void opened.push(u),
    },
  };
  vm.runInNewContext(SOURCE, { self, URL, console });
  /** An event with waitUntil; resolves once everything it waited on has. */
  const fire = async (type: string, extra: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)?.({ ...extra, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  const push = (data: unknown) =>
    fire("push", {
      data:
        data === undefined
          ? null
          : { json: () => (typeof data === "string" ? JSON.parse(data) : data), text: () => (typeof data === "string" ? data : JSON.stringify(data)) },
    });
  const click = (url: unknown) => {
    let closed = false;
    return fire("notificationclick", { notification: { data: { url }, close: () => (closed = true) } }).then(() => closed);
  };
  return { listeners, shown, opened, push, click, fire, state: () => ({ skipped, claimed }) };
}

test("sw: listens to install, activate, push and notificationclick only: no fetch handler, no cache", async () => {
  const w = worker();
  assert.deepEqual([...w.listeners.keys()].sort(), ["activate", "install", "notificationclick", "push"]);
  assert.doesNotMatch(SOURCE, /addEventListener\(\s*["']fetch["']|onfetch|caches\.|importScripts/, "nothing that touches page loads");
  await w.fire("install", {});
  await w.fire("activate", {});
  assert.deepEqual(w.state(), { skipped: true, claimed: true }, "a new version takes over at once");
});

test("sw: a push shows its title, message and icon, replaces an older one with its tag and still buzzes, and tells open tabs", async () => {
  const tab: Win = { url: `${ORIGIN}/games`, focused: false, navigatedTo: null, messages: [] };
  const w = worker([tab]);
  const GAME = "/game/dddddddd-dddd-4ddd-8ddd-000000000001";
  await w.push({ title: "New Join Request", body: "Ravi Kumar wants to join your Football", url: GAME, tag: "tt-game_request-x" });
  assert.deepEqual(w.shown, [
    {
      title: "New Join Request",
      options: { body: "Ravi Kumar wants to join your Football", icon: "/icon-192.png", badge: "/badge-96.png", tag: "tt-game_request-x", renotify: true, data: { url: GAME } },
    },
  ]);
  assert.deepEqual(tab.messages, [{ type: "tapturf-push" }], "an open tab refreshes its count");
  assert.ok(fs.existsSync(path.join(process.cwd(), "public/badge-96.png")) && fs.existsSync(path.join(process.cwd(), "public/icon-192.png")), "the icons exist");
});

test("sw: something is always shown (an iPhone ends a subscription that pushes silently), and never a link to another site", async () => {
  const w = worker();
  await w.push(undefined);
  await w.push("not json");
  await w.push({ title: "x".repeat(200), body: 7, url: "https://evil.example/x", tag: "" });
  await w.push({ title: "T", url: "//evil.example/x" });
  await w.push({ title: "T", url: "/\\evil.example" });
  assert.equal(w.shown.length, 5);
  assert.equal(w.shown[0].title, "TapTurf");
  assert.equal(w.shown[1].options.body, "not json");
  assert.equal(w.shown[2].title.length, 80);
  assert.equal(w.shown[2].options.body, "");
  assert.equal(w.shown[2].options.tag, "tapturf");
  for (const s of w.shown) assert.deepEqual(s.options.data, { url: "/dashboard?tab=notifications" });
});

test("sw: a tap brings forward a tab already on that page", async () => {
  const there: Win = { url: `${ORIGIN}/game/g1`, focused: false, navigatedTo: null, messages: [] };
  const other: Win = { url: `${ORIGIN}/turfs`, focused: false, navigatedTo: null, messages: [] };
  const w = worker([other, there]);
  assert.equal(await w.click("/game/g1"), true, "the notification closes");
  assert.equal(there.focused, true);
  assert.equal(other.focused, false);
  assert.deepEqual(w.opened, []);
});

test("sw: else takes an open TapTurf tab to the page, else opens one", async () => {
  const tab: Win = { url: `${ORIGIN}/turfs`, focused: false, navigatedTo: null, messages: [] };
  let w = worker([tab]);
  await w.click("/game/g2");
  assert.equal(tab.navigatedTo, `${ORIGIN}/game/g2`);
  assert.equal(tab.focused, true);
  assert.deepEqual(w.opened, []);
  const stuck: Win = { url: `${ORIGIN}/turfs`, focused: false, navigatedTo: null, messages: [], uncontrolled: true };
  w = worker([stuck]);
  await w.click("/game/g3");
  assert.deepEqual(w.opened, [`${ORIGIN}/game/g3`], "a tab it can't move: a new one");
  w = worker([]);
  await w.click("https://evil.example/");
  assert.deepEqual(w.opened, [`${ORIGIN}/dashboard?tab=notifications`], "nothing open: the page (never another site)");
});
