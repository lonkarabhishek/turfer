"use client";

import { useEffect, useSyncExternalStore } from "react";
import { isBotAgent } from "@/lib/live/views";
import { trendPath } from "@/lib/map/trendingClient";
import { TURF_EVENTS_STORE_KEY, TURF_EVENTS_URL, createTurfEventsReader, type EventsNow, type TurfEventsReader } from "@/lib/tournament/turfEvents";
import { whenIdleAndShown } from "./useTrending";

/**
 * What is on at TapTurf's turfs right now (GET /api/turf-events), for a
 * turf's own page: null until it is known, always null in the server
 * render and the hydration pass (the page is cached for everyone, a week
 * at a time, and the card is never in its HTML), and for good on the pages
 * it never shows on. One read per tab in 5 minutes, shared by everything
 * on the page that asks; the rules are lib/keptAnswer.ts and what the
 * answer is, lib/tournament/turfEvents.ts. This file is only the
 * browser's side, exactly as Trending by views has it (useTrending.ts):
 * the tab's sessionStorage, the fetch, and the same wait for the page to
 * be loaded, idle and on screen; never on the admin, myTapturf, an owner's
 * report or the email pages (trendPath), never for a crawler.
 */

let reader: TurfEventsReader | null = null;
let leaving = false;

function theReader(): TurfEventsReader {
  if (reader) return reader;
  // A page put back from the back-forward cache is not leaving any more.
  window.addEventListener("pagehide", () => (leaving = true));
  window.addEventListener("pageshow", () => (leaving = false));
  // Never for a crawler or a link preview: its render stays as the server sent it, and it costs no request.
  const person = !isBotAgent(navigator.userAgent);
  reader = createTurfEventsReader({
    now: Date.now,
    load: () => window.sessionStorage.getItem(TURF_EVENTS_STORE_KEY),
    save: (text) => window.sessionStorage.setItem(TURF_EVENTS_STORE_KEY, text),
    get: async () => {
      const res = await fetch(TURF_EVENTS_URL);
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

export function useTurfEvents(): EventsNow | null {
  const events = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => theReader().want(), []);
  return events;
}
