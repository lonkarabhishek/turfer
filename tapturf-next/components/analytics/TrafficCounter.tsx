"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { countPageView } from "@/lib/traffic/track";

/**
 * TapTurf's own page view and visit count, for the admin's Traffic section
 * (lib/traffic/traffic.ts says what counts, lib/traffic/track.ts sends it).
 * Mounted once in the root layout and not behind the cookie banner: it
 * keeps nothing on the device, sends no identifier and loads no
 * third-party code, like the map's and the turf pages' counts. One view on
 * the first page shown and on every move to another page (the route's
 * path changing), and again when the browser brings a page back from its
 * back-forward cache. Renders nothing.
 */
export function TrafficCounter() {
  const pathname = usePathname();
  useEffect(() => {
    countPageView();
  }, [pathname]);
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) countPageView(true);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
  return null;
}
