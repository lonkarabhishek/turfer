"use client";

import { useEffect, useState } from "react";
import { LIVE_LINKS_KEY, LIVE_SEEN_KEY, VIEWS_REFRESH_MS, decideView, newViewTag, readSeen, unseeView } from "@/lib/live/views";

/** Links this page load has already counted: a remount (a new tab of the page's own, Strict Mode) never counts again. */
const countedHere = new Set<string>();

/**
 * This opening as a view to count ({unique, v}: v the view's own random
 * tag), or null; keeps the browser's note when it is one, at once, so a
 * second tab opened meanwhile does not count it too. undo takes the note
 * back when the server did not count the view: the next visit tries again.
 */
function takeView(code: string): { body: { unique: boolean; v: string }; undo: () => void } | null {
  if (countedHere.has(code)) return null;
  let links: string | null = null;
  let seen: string | null = null;
  try {
    links = localStorage.getItem(LIVE_LINKS_KEY);
    seen = localStorage.getItem(LIVE_SEEN_KEY);
  } catch {
    /* no storage (a private window): counted, and unique, once per page load */
  }
  const view = decideView({ code, now: Date.now(), ua: navigator.userAgent, webdriver: navigator.webdriver === true, links, seen });
  if (!view) return null;
  countedHere.add(code);
  const was = readSeen(seen)[code];
  const at = view.next[code].at;
  try {
    localStorage.setItem(LIVE_SEEN_KEY, JSON.stringify(view.next));
  } catch {
    /* as above */
  }
  const undo = () => {
    try {
      localStorage.setItem(LIVE_SEEN_KEY, JSON.stringify(unseeView(readSeen(localStorage.getItem(LIVE_SEEN_KEY)), code, at, was)));
    } catch {
      /* as above */
    }
  };
  return { body: { unique: view.unique, v: newViewTag() }, undo };
}

/**
 * How many times this live scorecard has been viewed, or null to show no
 * count (not counted yet, before 20261101_live_views.sql, any error).
 * count: this page is a view (the follower page): counted once it is on
 * screen, unless the browser is the scorer's or an automated one, or it
 * was counted a moment ago (lib/live/views.ts); the scorer passes false
 * and only reads. refresh: read it again every VIEWS_REFRESH_MS while on
 * screen (a page that updates by itself).
 */
export function useLiveViews(code: string | null, opts: { count: boolean; refresh: boolean }): number | null {
  const { count, refresh } = opts;
  // Tagged with its code, so a link changed or turned off shows nothing until its own count comes in.
  const [got, setGot] = useState<{ code: string; views: number } | null>(null);

  useEffect(() => {
    if (!code) return;
    let on = true;
    const show = (j: unknown) => {
      const v = j && typeof j === "object" ? (j as { views?: unknown }).views : null;
      if (on && typeof v === "number" && Number.isSafeInteger(v) && v >= 0) setGot({ code, views: v });
    };
    const read = () =>
      fetch(`/api/live/${code}/views`)
        .then((r) => (r.ok ? r.json() : null))
        .then(show, () => {});
    let started = false;
    const start = () => {
      // Never for a prerender or a background tab: only once the page is on screen.
      if (started || document.visibilityState !== "visible") return;
      started = true;
      const view = count ? takeView(code) : null;
      if (!view) return void read();
      fetch(`/api/live/${code}/views`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(view.body), cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (j: { counted?: unknown; views?: unknown } | null) => {
            // Not counted (a limit, before the file is applied): the note goes back, and the count as it stands shows, if there is one.
            if (j?.counted !== true) view.undo();
            return typeof j?.views === "number" ? show(j) : read();
          },
          () => view.undo(),
        );
    };
    start();
    document.addEventListener("visibilitychange", start);
    const timer = refresh
      ? setInterval(() => {
          if (started && document.visibilityState === "visible") void read();
        }, VIEWS_REFRESH_MS)
      : null;
    return () => {
      on = false;
      document.removeEventListener("visibilitychange", start);
      if (timer) clearInterval(timer);
    };
  }, [code, count, refresh]);

  return code && got?.code === code ? got.views : null;
}
