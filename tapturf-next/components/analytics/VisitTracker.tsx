"use client";

import { useEffect } from "react";
import { logTurfView, noteInterest, step, trackVisit } from "@/lib/analytics/visitor";

/**
 * Once per page load: first-visit source, session and day counts, and
 * the city the visitor picks (from the tapturf:city-changed event the
 * city setter fires). See lib/analytics/visitor.ts.
 */
export function VisitTracker() {
  useEffect(() => {
    trackVisit();
    const onCity = (e: Event) => {
      const value = (e as CustomEvent<{ value?: string } | string | null>).detail;
      const city = typeof value === "string" ? value : value?.value;
      if (city && city !== "all" && city !== "unknown") noteInterest({ city: city.replace(/^geo\./, "") });
    };
    window.addEventListener("tapturf:city-changed", onCity);
    return () => window.removeEventListener("tapturf:city-changed", onCity);
  }, []);
  return null;
}

/** Drop on a page to record what it is about: a turf, a city, a sport. */
export function NoteInterest({ city, sports, turfId }: { city?: string | null; sports?: string[] | null; turfId?: string }) {
  useEffect(() => {
    noteInterest({ city, sports, turf: !!turfId });
    if (turfId) {
      step("turf_open");
      logTurfView(turfId);
      try {
        (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "turf_view", { turf_id: turfId, city: city ?? "", sport: sports?.[0] ?? "" });
      } catch {
        /* ignore */
      }
    }
    // One record per page, keyed by what the page is about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, turfId]);
  return null;
}
