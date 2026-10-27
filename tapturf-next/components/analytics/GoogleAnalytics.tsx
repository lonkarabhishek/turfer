"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { useConsent } from "@/lib/consent";
import { gaEvent, startAnalytics } from "@/lib/analytics/ga";

/**
 * Google Analytics 4 for the App Router, only after Accept on the cookie
 * banner (lib/consent.ts, lib/analytics/ga.ts). Until then nothing loads
 * and nothing is sent. On Accept, gtag.js loads and the page the visitor
 * is on counts as one page view; every client-side navigation after that
 * is one more (App Router changes URLs without a reload, so GA would
 * otherwise see only the first). A Reject stops it on the spot.
 *
 * In a Suspense boundary because useSearchParams() must be at the layout
 * level. Production only, so localhost traffic doesn't pollute GA.
 */
export function GoogleAnalytics() {
  if (process.env.NODE_ENV !== "production") return null;
  return (
    <Suspense fallback={null}>
      <RouteTracker />
    </Suspense>
  );
}

function RouteTracker() {
  const consent = useConsent();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /** The URL last counted while consent held; cleared by a Reject, so a new Accept counts the page again. */
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (consent !== "granted") {
      sent.current = null;
      return;
    }
    const query = searchParams?.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    if (sent.current === path || !startAnalytics()) return;
    sent.current = path;
    gaEvent("page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [consent, pathname, searchParams]);

  return null;
}
