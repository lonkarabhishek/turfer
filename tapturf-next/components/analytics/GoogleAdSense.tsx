"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useConsent } from "@/lib/consent";
import { startAds } from "@/lib/analytics/ads";

/**
 * Google AdSense's script, only after Accept on the cookie banner
 * (lib/consent.ts, lib/analytics/ads.ts, lib/ads.ts). It is never in the
 * server HTML: the browser adds it once, on the first page ads may load
 * on after consent is granted, and a move between pages never adds a
 * second. Never on the admin, myTapturf, the Me tab, sign-in, a player's
 * profile, an owner's report or the scorers (lib/ads.ts adsAllowedOn).
 * A Reject, or a move to one of those pages, pauses the script; ads it
 * already drew stay until the next page load. Production only. Renders
 * nothing and places no ad unit.
 */
export function GoogleAdSense() {
  if (process.env.NODE_ENV !== "production") return null;
  return <Loader />;
}

function Loader() {
  const consent = useConsent();
  const pathname = usePathname();

  useEffect(() => {
    // "unknown" is the hydration pass: the real answer follows at once.
    if (consent === "unknown") return;
    startAds(pathname);
  }, [consent, pathname]);

  return null;
}
