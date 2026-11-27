"use client";

import { useEffect, useSyncExternalStore } from "react";
import { isBotAgent } from "@/lib/live/views";
import { TREND_STORE_KEY, TREND_URL, createTrendReader, trendPath, type TrendNow, type TrendReader } from "@/lib/map/trendingClient";

/**
 * The turfs trending by views right now (the map's own answer, GET
 * /api/map/trending), for a turf's own page and the lists' cards: null
 * until it is known, always null in the server render and the hydration
 * pass (those pages are cached for everyone and the chip is never in their
 * HTML), and for good on the pages it never shows on. One read per tab in
 * 10 minutes, shared by everything on the page that asks; the rules and
 * what it costs are in lib/map/trendingClient.ts. This file is only the
 * browser's side: the tab's sessionStorage, the fetch, and the wait for
 * the page to be loaded, idle and on screen.
 */

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };

/** Run once the page has loaded, the browser is idle and the tab is on screen: the read is never in the page's way. (What is on at a turf waits the same way: useTurfEvents.ts.) */
export function whenIdleAndShown(run: () => void): void {
  const w = window as IdleWindow;
  const idle = () => {
    if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 4000 });
    else window.setTimeout(go, 1500);
  };
  const go = () => {
    if (document.visibilityState === "visible") return run();
    // A background tab or a prerender: when it comes on screen, and idle again.
    const back = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", back);
      idle();
    };
    document.addEventListener("visibilitychange", back);
  };
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}

let reader: TrendReader | null = null;
let leaving = false;

function theReader(): TrendReader {
  if (reader) return reader;
  // A page put back from the back-forward cache is not leaving any more.
  window.addEventListener("pagehide", () => (leaving = true));
  window.addEventListener("pageshow", () => (leaving = false));
  // Never for a crawler or a link preview: its render stays as the server sent it, and it costs no request.
  const person = !isBotAgent(navigator.userAgent);
  reader = createTrendReader({
    now: Date.now,
    load: () => window.sessionStorage.getItem(TREND_STORE_KEY),
    save: (text) => window.sessionStorage.setItem(TREND_STORE_KEY, text),
    get: async () => {
      const res = await fetch(TREND_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as unknown;
    },
    later: whenIdleAndShown,
    allowed: () => person && trendPath(window.location.pathname),
    leaving: () => leaving,
  });
  return reader;
}

const subscribe = (l: () => void) => theReader().subscribe(l);
const snapshot = () => theReader().now();
const serverSnapshot = () => null;

export function useTrending(): TrendNow | null {
  const trend = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => theReader().want(), []);
  return trend;
}
