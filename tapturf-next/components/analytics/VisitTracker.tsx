"use client";

import { useEffect } from "react";
import { useConsent } from "@/lib/consent";
import { gaEvent } from "@/lib/analytics/ga";
import { logTurfView, noteInterest, step, trackVisit } from "@/lib/analytics/visitor";

/**
 * Once per page load, after Accept on the cookie banner (lib/consent.ts):
 * first-visit source, session and day counts, and the city the visitor
 * picks (from the tapturf:city-changed event the city setter fires). See
 * lib/analytics/visitor.ts. Accepting mid-visit counts this visit then.
 */
export function VisitTracker() {
  const allowed = useConsent() === "granted";
  useEffect(() => {
    if (!allowed) return;
    trackVisit();
    const onCity = (e: Event) => {
      const value = (e as CustomEvent<{ value?: string } | string | null>).detail;
      const city = typeof value === "string" ? value : value?.value;
      if (city && city !== "all" && city !== "unknown") noteInterest({ city: city.replace(/^geo\./, "") });
    };
    window.addEventListener("tapturf:city-changed", onCity);
    return () => window.removeEventListener("tapturf:city-changed", onCity);
  }, [allowed]);
  return null;
}

/**
 * Drop on a page to record what it is about: a turf, a city, a sport. A
 * turf page's view counts for the owner's numbers for everyone (anonymous,
 * nothing kept on the device); the visit note and GA only with consent,
 * from the moment the visitor accepts.
 */
export function NoteInterest({ city, sports, turfId }: { city?: string | null; sports?: string[] | null; turfId?: string }) {
  const allowed = useConsent() === "granted";
  useEffect(() => {
    if (turfId) logTurfView(turfId);
  }, [turfId]);
  useEffect(() => {
    if (!allowed) return;
    noteInterest({ city, sports, turf: !!turfId });
    if (turfId) {
      step("turf_open");
      gaEvent("turf_view", { turf_id: turfId, city: city ?? "", sport: sports?.[0] ?? "" });
    }
    // One record per page, keyed by what the page is about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, city, turfId]);
  return null;
}
