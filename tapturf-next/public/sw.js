// TapTurf's service worker: Web Push only (lib/push, 20261102_web_push.sql).
// It shows the notifications the server sends and opens the right page when
// one is tapped. It has no fetch handler and keeps no cache, so pages load,
// work offline (or not) and are crawled exactly as without it. Registered by
// the app only for someone signed in (lib/push/client.ts).

const ALERTS = "/dashboard?tab=notifications";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** A path on this site, else the Alerts (never another site). */
function samePath(u) {
  if (typeof u !== "string" || !/^\/(?![/\\])/.test(u) || u.length > 300) return ALERTS;
  try {
    const url = new URL(u, self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search : ALERTS;
  } catch {
    return ALERTS;
  }
}

const text = (x, max) => (typeof x === "string" ? x.slice(0, max) : "");

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data ? event.data.text() : "" };
  }
  const tag = text(d.tag, 64) || "tapturf";
  const shown = self.registration.showNotification(text(d.title, 80) || "TapTurf", {
    body: text(d.body, 240),
    icon: "/icon-192.png",
    badge: "/badge-96.png",
    tag,
    // A newer one with the same tag replaces the older, and still buzzes.
    renotify: true,
    data: { url: samePath(d.url) },
  });
  // An open TapTurf tab refreshes its count at once (components/layout/Header.tsx).
  const told = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((list) => list.forEach((c) => c.postMessage({ type: "tapturf-push" })))
    .catch(() => {});
  event.waitUntil(Promise.all([shown, told]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = samePath(event.notification.data && event.notification.data.url);
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      // A tap allows one focus() or openWindow(), so only one of them is ever tried.
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Already on that page: bring it forward.
      const there = list.find((c) => c.url === target);
      if (there) return there.focus();
      // A TapTurf window this worker controls (only those can be moved): forward, then to the page.
      const [mine] = await self.clients.matchAll({ type: "window" });
      if (!mine) return self.clients.openWindow(target);
      const shownNow = await mine.focus();
      return shownNow && shownNow.navigate(target);
    })(),
  );
});
